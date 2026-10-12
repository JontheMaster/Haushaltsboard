import { Repeat } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { euro, useFinCategories, useFinNames } from './finStore'
import { monthName } from './Analysis'

type Row = { booked_on: string; counterparty: string; amount: number; category: string }
type Period = { label: string; days: number; months: number }
const PERIODS: Period[] = [
  { label: 'monatlich', days: 30.4, months: 1 },
  { label: 'vierteljährlich', days: 91.3, months: 3 },
  { label: 'jährlich', days: 365, months: 12 },
]
export type Sub = {
  key: string
  name: string
  /** Gegenpartei wie in der Bank (für den eigenen Anzeigenamen) */
  counterparty: string
  period: Period
  amount: number
  perMonth: number
  last: string
  next: string
  n: number
  category: string
  /** Preiserhöhung: um wie viel und seit welchem Monat */
  rise: { by: number; since: string } | null
}
type Mark = { sub_key: string; status: 'cancel' | 'hide'; todo: string | null }

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
const keyOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-zäöüß ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(' ')
const niceName = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-zäöü])/g, (_, a, b) => a + b.toUpperCase())
function addMonths(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}

/**
 * Wiederkehrende Zahlungen erkennen (Stufe 4): gleiche Gegenpartei, Betrag ±10 % zur vorigen Zahlung,
 * mindestens 3 Mal in ungefähr festem Abstand (monatlich, vierteljährlich, jährlich), zuletzt nicht überfällig.
 * Rechnet im Browser über die Buchungen, die man ohnehin sehen darf (eigene + Haushalt).
 */
export function detectSubs(rows: Row[], today: string): Sub[] {
  const byKey = new Map<string, Row[]>()
  for (const r of rows) {
    const k = keyOf(r.counterparty)
    if (!k) continue
    byKey.set(k, [...(byKey.get(k) ?? []), r])
  }
  const out: Sub[] = []
  for (const [key, list] of byKey) {
    if (list.length < 3) continue
    list.sort((a, b) => a.booked_on.localeCompare(b.booked_on))
    // mehrere Reihen pro Gegenpartei möglich (z. B. zwei Abos beim selben Anbieter)
    const series: Row[][] = []
    for (const r of list) {
      const fit = series.find((s) => {
        const last = s[s.length - 1]
        return Math.abs(r.amount - last.amount) <= Math.abs(last.amount) * 0.1 && days(last.booked_on, r.booked_on) >= 20
      })
      if (fit) fit.push(r)
      else series.push([r])
    }
    series.forEach((s, i) => {
      if (s.length < 3) return
      const gaps = s.slice(1).map((r, j) => days(s[j].booked_on, r.booked_on))
      const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      const period = PERIODS.find((p) => Math.abs(median - p.days) <= p.days * 0.15)
      if (!period) return
      const regular = gaps.filter((g) => Math.abs(g - period.days) <= period.days * 0.25).length
      if (regular < Math.ceil(gaps.length * 0.66)) return
      const last = s[s.length - 1]
      // seit über einem halben Abstand überfällig → läuft wohl nicht mehr
      if (days(last.booked_on, today) > period.days * 1.5) return
      const amount = -last.amount
      const prev = -s[s.length - 2].amount
      let rise: Sub['rise'] = null
      if (amount - prev >= 0.5 || (amount > prev && amount - prev >= prev * 0.02)) rise = { by: amount - prev, since: last.booked_on.slice(0, 8) + '01' }
      out.push({
        key: series.length > 1 ? `${key}#${i}` : key,
        name: niceName(last.counterparty),
        counterparty: last.counterparty,
        period,
        amount,
        perMonth: amount / period.months,
        last: last.booked_on,
        next: addMonths(last.booked_on, period.months),
        n: s.length,
        category: last.category,
        rise,
      })
    })
  }
  return out.sort((a, b) => b.perMonth - a.perMonth)
}

function useSubs() {
  const cats = useFinCategories()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 420 * DAY).toISOString().slice(0, 10)
    const [{ data }, { data: m }] = await Promise.all([
      supabase.from('fin_transactions').select('booked_on, counterparty, amount, category').lt('amount', 0).gte('booked_on', since).order('booked_on').limit(5000),
      supabase.from('fin_sub_marks').select('sub_key, status, todo'),
    ])
    setRows((data as Row[] | null) ?? [])
    setMarks((m as Mark[] | null) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])
  const subs = useMemo(() => {
    if (!rows || !cats) return null
    const skip = new Set(cats.filter((c) => c.kind !== 'expense').map((c) => c.id))
    return detectSubs(
      rows.filter((r) => !skip.has(r.category)),
      new Date().toISOString().slice(0, 10),
    )
  }, [rows, cats])
  return { subs, marks, reload: load, cats }
}

const dayMonth = (d: string) => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

/** Karte „Abos und Fixkosten“ im Reiter Finanzen (Konto) */
export function SubscriptionsCard({ showToast, empty }: { showToast: (m: string) => void; empty?: boolean }) {
  const { subs: raw, marks, reload, cats } = useSubs()
  const { nameOf, setName } = useFinNames()
  // eigener Anzeigename (z. B. Vermieter → „Miete“) statt des Namens aus der Bank
  const subs = raw?.map((x) => ({ ...x, name: nameOf(x.counterparty) ?? x.name })) ?? null
  const [open, setOpen] = useState<Sub | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  if (!subs) return null
  if (!subs.length)
    return empty ? (
      <section className="hb-tile hb-tile-static gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink">
          <Icon icon={Repeat} size={18} />
          Abos und Fixkosten
        </h3>
        <p className="text-body text-ink-muted">Noch nichts erkannt. Ein Abo erscheint, sobald es mindestens dreimal im festen Abstand abgebucht wurde.</p>
      </section>
    ) : null
  const markOf = (k: string) => marks.find((m) => m.sub_key === k)
  const visible = subs.filter((s) => markOf(s.key)?.status !== 'hide')
  const hidden = subs.filter((s) => markOf(s.key)?.status === 'hide')
  const total = visible.reduce((t, s) => t + s.perMonth, 0)
  const rises = visible.filter((s) => s.rise)
  const catName = (id: string) => cats?.find((c) => c.id === id)?.name ?? ''
  return (
    <section className="hb-tile hb-tile-static gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold text-ink">
          <Icon icon={Repeat} size={18} />
          Abos und Fixkosten
        </h3>
        <span className="font-semibold text-ink">{euro(total)} im Monat</span>
      </div>
      {rises.map((s) => (
        <div key={`r-${s.key}`} className="hb-fin-note is-warning">
          <b>
            {s.name} kostet seit {monthName(s.rise!.since)} {euro(s.rise!.by)} mehr
          </b>
          <span>
            jetzt {euro(s.amount)} {s.period.label}
          </span>
        </div>
      ))}
      <ul className="flex flex-col">
        {(showHidden ? [...visible, ...hidden] : visible).map((s) => {
          const m = markOf(s.key)
          return (
            <li key={s.key}>
              <button type="button" className={`hb-fin-catrow ${m?.status === 'hide' ? 'opacity-50' : ''}`} onClick={() => setOpen(s)}>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate">{s.name}</span>
                  <span className="text-label text-ink-muted">
                    {m?.status === 'cancel' ? 'Kündigen vorgemerkt · ' : ''}
                    {s.period.months === 1 ? '' : `${euro(s.amount)} ${s.period.label} · `}nächste {dayMonth(s.next)}
                    {catName(s.category) ? ` · ${catName(s.category)}` : ''}
                  </span>
                </span>
                <span className="hb-fin-amount">{euro(s.perMonth)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-label text-ink-muted">
        Erkannt: mindestens 3 Zahlungen im festen Abstand, Betrag ähnlich. Jährliche sind auf den Monat umgerechnet.
        {hidden.length > 0 && (
          <>
            {' '}
            <button type="button" className="underline" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? 'Ausgeblendete verbergen' : `${hidden.length} ausgeblendet`}
            </button>
          </>
        )}
      </p>
      {open && (
        <SubSheet
          sub={open}
          onRename={setName}
          mark={markOf(open.key)}
          onClose={() => setOpen(null)}
          onDone={(msg) => {
            setOpen(null)
            showToast(msg)
            reload()
          }}
        />
      )}
    </section>
  )
}

function SubSheet({
  sub,
  mark,
  onRename,
  onClose,
  onDone,
}: {
  sub: Sub
  mark: Mark | undefined
  onRename: (counterparty: string, label: string) => Promise<boolean>
  onClose: () => void
  onDone: (m: string) => void
}) {
  const { me } = useMembers()
  const [label, setLabel] = useState(sub.name)
  async function cancel() {
    // Todo für die Person, die gerade tippt („Offen, noch ohne Tag“); das Board kündigt nie selbst
    const { data: todo, error } = await supabase.from('todos').insert({ title: `${sub.name} kündigen`, assignee: me.id }).select('id').single()
    if (error) return onDone('Das hat nicht geklappt.')
    await supabase.from('fin_sub_marks').upsert({ owner: me.id, sub_key: sub.key, status: 'cancel', todo: todo.id })
    onDone(`Todo „${sub.name} kündigen“ angelegt`)
  }
  async function hide() {
    await supabase.from('fin_sub_marks').upsert({ owner: me.id, sub_key: sub.key, status: 'hide', todo: null })
    onDone(`${sub.name} ausgeblendet`)
  }
  async function unmark() {
    await supabase.from('fin_sub_marks').delete().eq('owner', me.id).eq('sub_key', sub.key)
    onDone('Markierung entfernt')
  }
  return (
    <Sheet title={sub.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-label text-ink-muted">Name (gilt überall in Finanzen, für euch beide)</span>
            <input className="hb-input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <Button disabled={label.trim() === sub.name} onClick={async () => onDone((await onRename(sub.counterparty, label)) ? `Heißt jetzt „${label.trim() || sub.counterparty}“` : 'Das hat nicht geklappt.')}>
            Umbenennen
          </Button>
        </div>
        <dl className="hb-fin-facts">
          <div>
            <dt>Betrag</dt>
            <dd>
              {euro(sub.amount)} {sub.period.label}
            </dd>
          </div>
          <div>
            <dt>Pro Monat</dt>
            <dd>{euro(sub.perMonth)}</dd>
          </div>
          <div>
            <dt>Zuletzt</dt>
            <dd>{dayMonth(sub.last)}</dd>
          </div>
          <div>
            <dt>Nächste etwa</dt>
            <dd>{dayMonth(sub.next)}</dd>
          </div>
        </dl>
        {sub.rise && (
          <p className="hb-fin-note is-warning">
            Seit {monthName(sub.rise.since)} {euro(sub.rise.by)} teurer.
          </p>
        )}
        {mark?.status !== 'cancel' && (
          <Button variant="primary" size="lg" onClick={cancel}>
            Kündigen vormerken
          </Button>
        )}
        {mark?.status !== 'hide' && (
          <Button variant="ghost" onClick={hide}>
            Ausblenden, kein Abo
          </Button>
        )}
        {mark && (
          <Button variant="ghost" onClick={unmark}>
            Markierung entfernen
          </Button>
        )}
        <p className="text-label text-ink-muted">„Kündigen vormerken“ legt ein Todo für dich an. Kündigen musst du selbst beim Anbieter.</p>
      </div>
    </Sheet>
  )
}
