import { ArrowLeft, Pause, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Choice } from '../../components/Choice'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import type { Tables } from '../../lib/database.types'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { addDays, mondayOf, useToday } from '../../lib/time'

export type ChoreRule = Tables<'chore_rules'>

type Rhythm = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'weekdays'
type Who = 'a' | 'b' | 'alternate' | 'open'

const RHYTHMS: { value: Rhythm; label: string }[] = [
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'biweekly', label: 'Alle 2 Wochen' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'weekdays', label: 'Bestimmte Tage' },
]
// ISO-Wochentage: 1 = Mo … 7 = So
const WEEKDAYS = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 7, label: 'So' },
]

/** ISO-Wochentag eines YYYY-MM-DD (1 = Mo) */
function isoWeekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}

/** Nächster Tag ab `from` (inklusive) mit diesem Wochentag */
function nextWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - isoWeekday(from) + 7) % 7)
}

/** Nächster Tag ab `from` (inklusive) mit diesem Tag im Monat */
function nextDayOfMonth(from: string, dom: number): string {
  const [y, m, d] = from.split('-').map(Number)
  const date = d <= dom ? new Date(Date.UTC(y, m - 1, dom)) : new Date(Date.UTC(y, m, dom))
  return date.toISOString().slice(0, 10)
}

/** Kurzbeschreibung einer Regel, z. B. „Wöchentlich · Sa · abwechselnd“ */
export function describeRule(r: ChoreRule, names: Map<string, string>): string {
  const wd = (n: number) => WEEKDAYS.find((w) => w.value === n)?.label ?? ''
  const when =
    r.rhythm === 'daily'
      ? 'Täglich'
      : r.rhythm === 'weekdays'
        ? (r.weekdays ?? []).map(wd).join(', ')
        : r.rhythm === 'monthly'
          ? `Monatlich${r.placement === 'week' ? ' (in der Woche um den ' : ' am '}${Number(r.anchor_date.slice(8))}.${r.placement === 'week' ? ')' : ''}`
          : `${r.rhythm === 'weekly' ? 'Wöchentlich' : 'Alle 2 Wochen'}${r.placement === 'week' ? ', irgendwann in der Woche' : ` · ${wd(isoWeekday(r.anchor_date))}`}`
  const who =
    r.assignee_mode === 'alternate' ? 'abwechselnd' : r.assignee_mode === 'open' ? 'offen' : (names.get(r.assignee ?? '') ?? 'offen')
  return `${when} · ${who}`
}

/** Putzplan am Handy: alle wiederkehrenden Aufgaben, anlegen und bearbeiten */
export function PutzplanPage({ onBack, openRuleId }: { onBack: () => void; openRuleId?: string | null }) {
  const { byId } = useMembers()
  const [rules, setRules] = useState<ChoreRule[] | null>(null)
  const [error, setError] = useState(false)
  const [sheet, setSheet] = useState<{ rule?: ChoreRule } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('chore_rules').select('*').order('created_at')
    if (error) return setError(true)
    setError(false)
    setRules(data)
    return data
  }, [])

  useEffect(() => {
    load().then((data) => {
      // Aus einer Putzaufgabe heraus geöffnet: gleich deren Regel bearbeiten
      const rule = openRuleId && data?.find((r) => r.id === openRuleId)
      if (rule) setSheet({ rule })
    })
  }, [load, openRuleId])

  const names = new Map([...byId].map(([id, m]) => [id, m.name]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={onBack}>
          <Icon icon={ArrowLeft} size={22} />
        </button>
        <h2 className="flex-1 font-display text-title text-ink">Putzplan</h2>
      </div>
      <p className="text-body text-ink-muted">
        Alles, was regelmäßig ansteht. Die Aufgaben erscheinen bei den Todos mit dem Glitzer-Symbol. Bleibt eine liegen, ersetzt
        sie die nächste Wiederholung.
      </p>
      <Button variant="primary" size="lg" icon={<Icon icon={Plus} size={22} />} onClick={() => setSheet({})}>
        Aufgabe hinzufügen
      </Button>
      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          Putzplan gerade nicht erreichbar. Prüf die Verbindung.
        </p>
      )}
      {rules && rules.length === 0 && (
        <p className="text-body text-ink-muted">Noch keine Aufgaben. Leg die erste an, zum Beispiel „Bad putzen“ jeden Samstag.</p>
      )}
      <div className="flex flex-col gap-2">
        {rules?.map((r) => (
          <button key={r.id} type="button" className="hb-rule" onClick={() => setSheet({ rule: r })}>
            <Icon icon={Sparkles} size={20} className="hb-chore-icon" />
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="text-body font-semibold text-ink">{r.title}</span>
              <span className="text-label text-ink-muted">{describeRule(r, names)}</span>
            </span>
            {!r.active && <Badge>Pausiert</Badge>}
          </button>
        ))}
      </div>
      {sheet && (
        <ChoreSheet
          rule={sheet.rule}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/** Anlegen oder Bearbeiten einer Putzplan-Regel */
function ChoreSheet({ rule, onClose, onSaved }: { rule?: ChoreRule; onClose: () => void; onSaved: () => void }) {
  const today = useToday()
  const { people, personKey } = useMembers()
  const a = people[0]
  const b = people[1]

  const initialWho: Who = !rule
    ? 'alternate'
    : rule.assignee_mode === 'alternate'
      ? 'alternate'
      : rule.assignee_mode === 'open'
        ? 'open'
        : rule.assignee === b?.id
          ? 'b'
          : 'a'

  const [title, setTitle] = useState(rule?.title ?? '')
  const [rhythm, setRhythm] = useState<Rhythm>((rule?.rhythm as Rhythm) ?? 'weekly')
  const [weekday, setWeekday] = useState(rule ? isoWeekday(rule.anchor_date) : 6)
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [1, 4])
  const [dom, setDom] = useState(rule ? Number(rule.anchor_date.slice(8)) : 1)
  const [placement, setPlacement] = useState<'day' | 'week'>((rule?.placement as 'day' | 'week') ?? 'day')
  // alle 2 Wochen: in dieser oder nächster Woche beginnen
  const [startNext, setStartNext] = useState(rule ? rule.anchor_date >= addDays(mondayOf(today), 7) : false)
  const [who, setWho] = useState<Who>(initialWho)
  const [active, setActive] = useState(rule?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canWeek = rhythm === 'weekly' || rhythm === 'biweekly' || rhythm === 'monthly'
  const effPlacement = canWeek ? placement : 'day'

  /** Startdatum der Regel aus den Eingaben */
  function anchor(): string {
    const monday = mondayOf(today)
    const base = rhythm === 'biweekly' && startNext ? addDays(monday, 7) : today
    if (rhythm === 'monthly') return nextDayOfMonth(today, dom)
    if (rhythm === 'weekly' || rhythm === 'biweekly') {
      if (effPlacement === 'week') return rhythm === 'biweekly' && startNext ? addDays(monday, 7) : monday
      return nextWeekday(base, weekday)
    }
    return today
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Gib der Aufgabe einen Namen.')
    if (rhythm === 'weekdays' && weekdays.length === 0) return setError('Wähl mindestens einen Tag.')
    setBusy(true)
    const row = {
      title: title.trim(),
      rhythm,
      weekdays: rhythm === 'weekdays' ? [...weekdays].sort() : null,
      anchor_date: anchor(),
      placement: effPlacement,
      assignee_mode: who === 'alternate' ? 'alternate' : who === 'open' ? 'open' : 'fixed',
      assignee: who === 'a' ? (a?.id ?? null) : who === 'b' ? (b?.id ?? null) : null,
      active,
    }
    const { error } = rule
      ? await supabase.from('chore_rules').update(row).eq('id', rule.id)
      : await supabase.from('chore_rules').insert(row)
    setBusy(false)
    if (error) return setError('Speichern hat nicht geklappt. Prüf die Verbindung und probier es noch mal.')
    onSaved()
  }

  async function remove() {
    if (!rule) return
    if (!confirm) return setConfirm(true)
    setBusy(true)
    const { error } = await supabase.from('chore_rules').delete().eq('id', rule.id)
    setBusy(false)
    if (error) return setError('Löschen hat nicht geklappt. Probier es noch mal.')
    onSaved()
  }

  return (
    <Sheet title={rule ? 'Putzaufgabe bearbeiten' : 'Neue Putzaufgabe'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Was</span>
          <input
            autoFocus={!rule}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Bad putzen"
            enterKeyHint="done"
            className="h-7 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring"
          />
        </label>

        <Choice<Rhythm> label="Wie oft" options={RHYTHMS} isSelected={(v) => v === rhythm} onSelect={setRhythm} />

        {canWeek && (
          <Choice<'day' | 'week'>
            label="Wann"
            options={[
              { value: 'day', label: 'Fester Tag' },
              { value: 'week', label: 'Irgendwann in der Woche' },
            ]}
            isSelected={(v) => v === placement}
            onSelect={setPlacement}
          />
        )}

        {(rhythm === 'weekly' || rhythm === 'biweekly') && effPlacement === 'day' && (
          <Choice<number> label="An welchem Tag" options={WEEKDAYS} isSelected={(v) => v === weekday} onSelect={setWeekday} />
        )}

        {rhythm === 'weekdays' && (
          <Choice<number>
            label="An welchen Tagen"
            options={WEEKDAYS}
            isSelected={(v) => weekdays.includes(v)}
            onSelect={(v) => setWeekdays((ds) => (ds.includes(v) ? ds.filter((x) => x !== v) : [...ds, v]))}
          />
        )}

        {rhythm === 'monthly' && (
          <label className="flex flex-col gap-2">
            <span className="text-label text-ink">
              {effPlacement === 'week' ? 'In der Woche um diesen Tag im Monat' : 'Am wievielten im Monat'}
            </span>
            <select
              value={dom}
              onChange={(e) => setDom(Number(e.target.value))}
              className="h-7 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink focus-visible:focus-ring"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}.{n > 28 ? ' (oder Monatsende)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {rhythm === 'biweekly' && (
          <Choice<boolean>
            label="Erstes Mal"
            options={[
              { value: false, label: 'Diese Woche' },
              { value: true, label: 'Nächste Woche' },
            ]}
            isSelected={(v) => v === startNext}
            onSelect={setStartNext}
          />
        )}

        <Choice<Who>
          label="Wer"
          options={[
            ...(a ? [{ value: 'a' as Who, label: a.name, className: `hb-person-${personKey(a.id)}` }] : []),
            ...(b ? [{ value: 'b' as Who, label: b.name, className: `hb-person-${personKey(b.id)}` }] : []),
            { value: 'alternate', label: 'Abwechselnd' },
            { value: 'open', label: 'Offen', className: 'hb-person-open' },
          ]}
          isSelected={(v) => v === who}
          onSelect={setWho}
        />

        {rule && (
          <div className="flex items-center gap-2">
            <Icon icon={Pause} size={18} className="text-ink-muted" />
            <div className="flex-1">
              <Toggle checked={active} label="Aktiv (aus = pausiert)" onChange={setActive} />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" size="lg" disabled={busy} icon={<Icon icon={rule ? Save : Plus} size={22} />}>
            {rule ? 'Speichern' : 'Aufgabe hinzufügen'}
          </Button>
          {rule && (
            <Button variant="ghost" className="hb-btn-danger" disabled={busy} onClick={remove} icon={<Icon icon={Trash2} size={18} />}>
              {confirm ? 'Wirklich löschen? Nochmal tippen' : 'Aufgabe löschen'}
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
