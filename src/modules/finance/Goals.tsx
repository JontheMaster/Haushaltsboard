import { Plus, Target } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Tile } from '../../components/Tile'
import { Toggle } from '../../components/Toggle'
import type { Tables } from '../../lib/database.types'
import { useMembers } from '../../lib/members'
import { useSettings } from '../../lib/settings'
import { supabase } from '../../lib/supabase'
import { berlinDay } from '../../lib/time'
import type { TileProps } from '../types'
import { summarize, useHoldings, useQuotes, type Holding } from './depotStore'
import { euro, useFinProfile } from './finStore'

export type Goal = Tables<'fin_goals'>

export function useGoals() {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('fin_goals').select('*').order('sort').order('created_at')
    setGoals((data ?? []) as Goal[])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`fin-goals-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_goals' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { goals, reload: load }
}

/** Monate bis zur Deadline (aufgerundet, mind. 1) */
function monthsUntil(deadline: string): number {
  const now = new Date(`${berlinDay()}T12:00:00Z`)
  const end = new Date(`${deadline}T12:00:00Z`)
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (30.44 * 86400_000)))
}

export type GoalProgress = { saved: number; pct: number; perMonth: number | null; months: number | null }

/**
 * Stand eines Ziels: Depot = Wert der passenden Positionen (gemeinsames Ziel → gemeinsame Positionen, eigenes Ziel
 * → eigene), Konto = selbst eingetragener Betrag (der Kontostand wird nie gespeichert), beides = Summe.
 */
export function goalProgress(goal: Goal, holdings: Holding[], depotValue: (hs: Holding[]) => number): GoalProgress {
  const hs = holdings.filter((h) => (goal.household ? h.household : h.owner === goal.owner))
  const depot = goal.source === 'konto' ? 0 : depotValue(hs)
  const konto = goal.source === 'depot' ? 0 : Number(goal.manual_amount)
  const saved = depot + konto
  const target = Number(goal.target_amount)
  const months = goal.deadline ? monthsUntil(goal.deadline) : null
  const rest = Math.max(0, target - saved)
  return { saved, pct: target ? (saved / target) * 100 : 0, months, perMonth: months && rest > 0 ? rest / months : null }
}

/** Ziel-Ring: füllt sich beim Erscheinen; ab 100 % grün */
export function GoalRing({ pct, size = 96, label }: { pct: number; size?: number; label?: string }) {
  const r = 42
  const c = 2 * Math.PI * r
  const shown = Math.min(100, Math.max(0, pct))
  return (
    <svg className={`hb-goal-ring ${pct >= 100 ? 'is-done' : ''}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label ?? `${Math.round(pct)} %`}>
      <circle cx="50" cy="50" r={r} className="hb-goal-track" />
      <circle cx="50" cy="50" r={r} className="hb-goal-fill" style={{ strokeDasharray: c, ['--off' as string]: `${c * (1 - shown / 100)}`, ['--c' as string]: `${c}` }} transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" className="hb-goal-pct">
        {Math.round(pct)} %
      </text>
    </svg>
  )
}

function useDepotValue() {
  const { holdings } = useHoldings()
  const symbols = (holdings ?? []).map((h) => h.symbol).filter((s): s is string => !!s)
  const { quotes, prev } = useQuotes(symbols)
  return { holdings, value: (hs: Holding[]) => summarize(hs, quotes, prev).value }
}

/** Karte „Sparziele“ im Depot: Ringe, antippen = ändern, neues Ziel anlegen */
export function GoalsCard({ showToast }: { showToast: (m: string) => void }) {
  const { me } = useMembers()
  const { goals } = useGoals()
  const { holdings, value } = useDepotValue()
  const [edit, setEdit] = useState<Partial<Goal> | null>(null)
  if (!goals || !holdings) return null
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={Target} size={18} />
        Sparziele
      </h3>
      {goals.length === 0 && <p className="text-label text-ink-muted">Leg ein Ziel an, z. B. „Urlaub 2027“ mit Betrag und Datum. Der Ring zeigt, wie weit ihr seid.</p>}
      <div className="hb-goal-grid">
        {goals.map((g) => {
          const p = goalProgress(g, holdings, value)
          const own = g.owner === me.id
          return (
            <button key={g.id} type="button" className="hb-goal" disabled={!own} onClick={() => own && setEdit(g)}>
              <GoalRing pct={p.pct} label={`${g.name}: ${Math.round(p.pct)} %`} />
              <span className="font-semibold text-ink">{g.name}</span>
              <span className="text-label text-ink-muted">
                {euro(p.saved)} von {euro(Number(g.target_amount))}
              </span>
              {p.months && <span className="text-label text-ink-muted">{p.perMonth ? `noch ${p.months} ${p.months === 1 ? 'Monat' : 'Monate'} · ${euro(p.perMonth)} pro Monat` : 'geschafft'}</span>}
            </button>
          )
        })}
      </div>
      <Button variant="ghost" icon={<Icon icon={Plus} size={18} />} onClick={() => setEdit({ source: 'depot', household: true })}>
        Ziel anlegen
      </Button>
      {edit && (
        <GoalSheet
          goal={edit}
          onClose={() => setEdit(null)}
          onDone={(m) => {
            setEdit(null)
            showToast(m)
          }}
        />
      )}
    </section>
  )
}

const SOURCES: { id: Goal['source']; label: string }[] = [
  { id: 'depot', label: 'Depot' },
  { id: 'konto', label: 'Konto' },
  { id: 'beides', label: 'Beides' },
]

function GoalSheet({ goal, onClose, onDone }: { goal: Partial<Goal>; onClose: () => void; onDone: (m: string) => void }) {
  const { me } = useMembers()
  const [name, setName] = useState(goal.name ?? '')
  const [target, setTarget] = useState(goal.target_amount ? String(goal.target_amount).replace('.', ',') : '')
  const [source, setSource] = useState<Goal['source']>(goal.source ?? 'depot')
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [manual, setManual] = useState(goal.manual_amount ? String(goal.manual_amount).replace('.', ',') : '')
  const [household, setHousehold] = useState(goal.household ?? true)
  const n = (t: string) => Number(t.replace(/\./g, '').replace(',', '.')) || 0

  async function save() {
    if (!name.trim() || !(n(target) > 0)) return onDone('Name und Zielbetrag fehlen.')
    const row = { name: name.trim().slice(0, 60), target_amount: n(target), source, deadline: deadline || null, manual_amount: source === 'depot' ? 0 : n(manual), household }
    const { error } = goal.id ? await supabase.from('fin_goals').update(row).eq('id', goal.id) : await supabase.from('fin_goals').insert({ ...row, owner: me.id })
    onDone(error ? 'Speichern hat nicht geklappt.' : 'Ziel gespeichert')
  }

  async function remove() {
    if (!goal.id || !confirm(`Ziel „${goal.name}“ löschen?`)) return
    const { error } = await supabase.from('fin_goals').delete().eq('id', goal.id)
    onDone(error ? 'Löschen hat nicht geklappt.' : 'Ziel gelöscht')
  }

  return (
    <Sheet title={goal.id ? 'Ziel ändern' : 'Neues Ziel'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-muted">Name</span>
          <input className="hb-input" value={name} placeholder="Urlaub 2027" maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-muted">Zielbetrag in €</span>
            <input className="hb-input" inputMode="decimal" value={target} placeholder="3.000" onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-muted">Bis (optional)</span>
            <input className="hb-input" type="date" value={deadline} min={berlinDay()} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-muted">Was zählt dazu</span>
          <div className="hb-seg self-start" role="group" aria-label="Quelle">
            {SOURCES.map((s) => (
              <button key={s.id} type="button" aria-pressed={source === s.id} className={source === s.id ? 'is-on' : ''} onClick={() => setSource(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {source !== 'depot' && (
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-muted">Dafür auf dem Konto, in €</span>
            <input className="hb-input" inputMode="decimal" value={manual} placeholder="0" onChange={(e) => setManual(e.target.value)} />
            <span className="text-label text-ink-muted">Den Kontostand liest das Board nie aus, trag hier ein, was du fürs Ziel beiseitegelegt hast.</span>
          </label>
        )}
        <Toggle checked={household} onChange={setHousehold} label="Gemeinsames Ziel: beide sehen es (zählt das gemeinsame Depot)" />
        <Button variant="primary" size="lg" onClick={save}>
          Speichern
        </Button>
        {goal.id && (
          <Button variant="ghost" onClick={remove}>
            Ziel löschen
          </Button>
        )}
      </div>
    </Sheet>
  )
}

/** Kachel „Sparziele“ für die Handy-Startseite: bis zu drei Ringe */
export function GoalsTile({ delay }: TileProps) {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const { settings } = useSettings()
  const { goals } = useGoals()
  const { holdings, value } = useDepotValue()
  if (!profile?.enabled || settings?.visit_mode || !goals?.length || !holdings) return null
  return (
    <Tile title="Sparziele" icon={Target} delay={delay}>
      <div className="hb-goal-grid">
        {goals.slice(0, 3).map((g) => {
          const p = goalProgress(g, holdings, value)
          return (
            <div key={g.id} className="hb-goal">
              <GoalRing pct={p.pct} size={84} label={`${g.name}: ${Math.round(p.pct)} %`} />
              <span className="font-semibold text-ink">{g.name}</span>
            </div>
          )
        })}
      </div>
    </Tile>
  )
}
