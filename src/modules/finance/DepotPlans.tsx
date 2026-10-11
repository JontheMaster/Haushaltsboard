import { CalendarClock, Plus, Repeat } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { berlinDay } from '../../lib/time'
import { euro } from './finStore'
import type { Holding } from './depotStore'

type Plan = Tables<'fin_savings_plans'>
type Suggestion = { holding: Holding; amount: number; day: number; months: number }

/** Nächste Ausführung: Tag im Monat, am Wochenende der Montag danach (wie der Cron) */
export function nextExecution(day: number, lastMonth: string | null): string {
  const today = berlinDay()
  for (let add = 0; add < 3; add++) {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + add)
    const monthStart = d.toISOString().slice(0, 10)
    if (lastMonth && lastMonth >= monthStart) continue
    d.setUTCDate(day)
    const wd = d.getUTCDay()
    if (wd === 6) d.setUTCDate(d.getUTCDate() + 2)
    if (wd === 0) d.setUTCDate(d.getUTCDate() + 1)
    const exec = d.toISOString().slice(0, 10)
    if (exec >= today) return exec
  }
  return today
}

const nice = (day: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

function shortName(name: string): string {
  return name.replace(/\b(iShares|Xtrackers|Vanguard|Amundi|UCITS|ETF|USD|EUR|\(Acc\)|\(Dist\))\b/gi, '').replace(/\s{2,}/g, ' ').trim() || name
}

function usePlans(holdingIds: string[]) {
  const key = holdingIds.join(',')
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [suggestions, setSuggestions] = useState<{ holding: string; amount: number; day: number; months: number }[]>([])
  const load = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return setPlans([])
    const [{ data: p }, { data: tx }] = await Promise.all([
      supabase.from('fin_savings_plans').select('*').in('holding', ids).order('created_at'),
      supabase.from('fin_holding_tx').select('holding, date, amount').in('holding', ids).eq('type', 'savings_plan').eq('source', 'csv').order('date', { ascending: false }),
    ])
    setPlans((p ?? []) as Plan[])
    // Sparplan erkennen: mind. 2 Monate Käufe aus dem Girokonto; Betrag = der letzte, Tag = der häufigste
    const by = new Map<string, { date: string; amount: number }[]>()
    for (const t of tx ?? []) by.set(t.holding, [...(by.get(t.holding) ?? []), { date: t.date, amount: Number(t.amount) }])
    setSuggestions(
      [...by.entries()]
        .filter(([, rows]) => new Set(rows.map((r) => r.date.slice(0, 7))).size >= 2)
        .map(([holding, rows]) => {
          const days = rows.map((r) => Math.min(28, Number(r.date.slice(8))))
          const day = [...new Set(days)].sort((a, b) => days.filter((d) => d === b).length - days.filter((d) => d === a).length || a - b)[0]
          return { holding, amount: rows[0].amount, day, months: new Set(rows.map((r) => r.date.slice(0, 7))).size }
        }),
    )
  }, [key])
  useEffect(() => {
    load()
  }, [load])
  return { plans, suggestions, reload: load }
}

/**
 * Sparpläne einer Person bzw. des gemeinsamen Depots: erkannte aus dem Girokonto übernehmen, eigene anlegen,
 * ändern, pausieren. Der Cron bucht abends zum Schlusskurs; der Giro-Export ersetzt die Schätzung später.
 */
export function DepotPlans({ holdings, ownerId, showToast }: { holdings: Holding[]; ownerId: string; showToast: (m: string) => void }) {
  const mine = holdings.filter((h) => h.owner === ownerId)
  const { plans, suggestions, reload } = usePlans(holdings.map((h) => h.id))
  const [edit, setEdit] = useState<Partial<Plan> | null>(null)
  const nameOf = (id: string) => shortName(holdings.find((h) => h.id === id)?.name ?? '')
  const open: Suggestion[] = suggestions
    .filter((s) => !plans?.some((p) => p.holding === s.holding) && mine.some((h) => h.id === s.holding))
    .map((s) => ({ ...s, holding: holdings.find((h) => h.id === s.holding)! }))

  async function adopt(s: Suggestion) {
    const { error } = await supabase.from('fin_savings_plans').insert({ holding: s.holding.id, amount: s.amount, day_of_month: s.day })
    if (error) return showToast('Übernehmen hat nicht geklappt.')
    showToast(`Sparplan ${shortName(s.holding.name)} übernommen`)
    reload()
  }

  if (!plans) return null
  return (
    <section className="hb-tile hb-tile-static gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={Repeat} size={18} />
        Sparpläne
      </h3>

      {open.map((s) => (
        <div key={s.holding.id} className="hb-fin-always">
          <span className="font-semibold text-ink">Sparplan erkannt: {shortName(s.holding.name)}</span>
          <span className="text-label text-ink-muted">
            {euro(s.amount)} am {s.day}. jedes Monats, gefunden in {s.months} Monaten im Girokonto.
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setEdit({ holding: s.holding.id, amount: s.amount, day_of_month: s.day })}>Anpassen</Button>
            <Button variant="primary" onClick={() => adopt(s)}>
              Übernehmen
            </Button>
          </div>
        </div>
      ))}

      {plans.length === 0 && open.length === 0 && <p className="text-label text-ink-muted">Noch kein Sparplan. Das Board bucht ihn dann jeden Monat abends zum Schlusskurs.</p>}

      <ul className="flex flex-col">
        {plans.map((p) => {
          const own = mine.some((h) => h.id === p.holding)
          return (
            <li key={p.id}>
              <button type="button" className="hb-fin-row" disabled={!own} onClick={() => own && setEdit(p)}>
                <span className="hb-fin-dot" style={{ ['--cat' as string]: 'var(--accent)' }}>
                  <Icon icon={CalendarClock} size={18} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-ink">{nameOf(p.holding)}</span>
                  <span className="text-label text-ink-muted">
                    {p.active ? `am ${p.day_of_month}. · nächste ${nice(nextExecution(p.day_of_month, p.last_month))}` : 'pausiert'}
                  </span>
                </span>
                <span className="hb-fin-amount">{euro(Number(p.amount))}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {mine.length > 0 && (
        <Button variant="ghost" icon={<Icon icon={Plus} size={18} />} onClick={() => setEdit({ holding: mine[0].id, amount: 50, day_of_month: 1 })}>
          Sparplan anlegen
        </Button>
      )}

      {edit && (
        <PlanSheet
          plan={edit}
          holdings={mine}
          onClose={() => setEdit(null)}
          onDone={(m) => {
            setEdit(null)
            showToast(m)
            reload()
          }}
        />
      )}
    </section>
  )
}

function PlanSheet({ plan, holdings, onClose, onDone }: { plan: Partial<Plan>; holdings: Holding[]; onClose: () => void; onDone: (m: string) => void }) {
  const [holding, setHolding] = useState(plan.holding ?? holdings[0]?.id)
  const [amount, setAmount] = useState(String(plan.amount ?? '').replace('.', ','))
  const [day, setDay] = useState(String(plan.day_of_month ?? 1))
  const [active, setActive] = useState(plan.active ?? true)
  const value = Number(amount.replace(/\./g, '').replace(',', '.'))
  const d = Number(day)

  async function save() {
    if (!(value > 0) || !(d >= 1 && d <= 28)) return onDone('Betrag und Tag (1–28) fehlen.')
    const { error } = plan.id
      ? await supabase.from('fin_savings_plans').update({ amount: value, day_of_month: d, active }).eq('id', plan.id)
      : await supabase.from('fin_savings_plans').insert({ holding: holding!, amount: value, day_of_month: d, active })
    onDone(error ? 'Speichern hat nicht geklappt.' : 'Sparplan gespeichert')
  }

  async function remove() {
    if (!plan.id || !confirm('Sparplan löschen? Bisherige Käufe bleiben im Depot.')) return
    const { error } = await supabase.from('fin_savings_plans').delete().eq('id', plan.id)
    onDone(error ? 'Löschen hat nicht geklappt.' : 'Sparplan gelöscht')
  }

  return (
    <Sheet title={plan.id ? 'Sparplan ändern' : 'Sparplan'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-muted">Position</span>
          <select className="hb-input" value={holding} onChange={(e) => setHolding(e.target.value)} disabled={!!plan.id}>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {shortName(h.name)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-muted">Betrag in €</span>
            <input className="hb-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-muted">Tag im Monat</span>
            <input className="hb-input" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
        </div>
        {d >= 1 && d <= 28 && <p className="text-label text-ink-muted">Nächste Ausführung {nice(nextExecution(d, plan.last_month ?? null))}, am Wochenende der Montag danach.</p>}
        {plan.id && <Toggle checked={active} onChange={setActive} label="Sparplan läuft" />}
        <Button variant="primary" size="lg" onClick={save}>
          Speichern
        </Button>
        {plan.id && (
          <Button variant="ghost" onClick={remove}>
            Sparplan löschen
          </Button>
        )}
      </div>
    </Sheet>
  )
}
