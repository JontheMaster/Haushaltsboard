import { AlertCircle, BarChart3, CalendarRange, ChevronLeft, ChevronRight, Clock, Store, Target } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Tile } from '../../components/Tile'
import { useMembers } from '../../lib/members'
import { useSettings } from '../../lib/settings'
import { supabase } from '../../lib/supabase'
import type { TileProps } from '../types'
import { euro, iconOf, useFinProfile } from './finStore'

export type OverviewCategory = { id: string; name: string; icon: string; color: string; spent: number; avg3: number; budget: number | null }
export type Overview = {
  month: string
  household_only: boolean
  days_in_month: number
  days_passed: number
  categories: OverviewCategory[]
  total_spent: number
  total_avg3: number
  total_income: number
  months: { month: string; spent: number; income: number }[]
  heatmap: { dow: number; hour: number; n: number; sum: number }[]
  heatmap_n: number
  merchants: { name: string; n: number; avg: number; sum: number }[]
}

/** Auswertung aus der RPC fin_overview (eigene + Haushalt; das Tablet bekommt immer nur Haushalt) */
export function useOverview(month: string | null, householdOnly: boolean, pollMs = 0) {
  const [data, setData] = useState<Overview | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('fin_overview', { ...(month ? { p_month: month } : {}), p_household_only: householdOnly })
    setData((data as Overview | null) ?? null)
  }, [month, householdOnly])
  useEffect(() => {
    load()
    if (!pollMs) return
    const t = setInterval(load, pollMs)
    return () => clearInterval(t)
  }, [load, pollMs])
  return { data, reload: load }
}

export const monthName = (m: string, withYear = false) =>
  new Intl.DateTimeFormat('de-DE', { month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${m}T12:00:00Z`))
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)} %`
/** Hochrechnung bis Monatsende (Tempo der bisherigen Tage) */
const forecast = (o: Overview, spent: number) => (o.days_passed < o.days_in_month ? (spent / Math.max(1, o.days_passed)) * o.days_in_month : spent)
const catVar = (c: { color: string }) => ({ ['--cat' as string]: `var(--${c.color})` })
const shopName = (n: string) => n.toLowerCase().replace(/(^|[\s-])([a-zäöü])/g, (_, a, b) => a + b.toUpperCase())

function addMonths(m: string, n: number): string {
  const d = new Date(`${m}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 8) + '01'
}

/** Monat: Summe, Vergleich zum Schnitt der letzten 3 Monate, gestapelter Balken, Liste mit Abweichung */
export function MonthCard({ o, onMonth, onPick, title }: { o: Overview; onMonth?: (m: string) => void; onPick?: (c: OverviewCategory) => void; title?: string }) {
  const diff = pct(forecast(o, o.total_spent), o.total_avg3)
  const shown = o.categories.filter((c) => c.spent > 0)
  const top = shown.slice(0, 5)
  const rest = shown.slice(5).reduce((s, c) => s + c.spent, 0)
  const current = o.days_passed < o.days_in_month
  return (
    <section className="hb-tile hb-tile-static gap-2">
      <div className="flex items-center gap-1">
        <h3 className="flex flex-1 items-center gap-2 font-semibold text-ink">
          <Icon icon={CalendarRange} size={18} />
          {title ?? monthName(o.month, true)}
        </h3>
        {onMonth && (
          <>
            <button type="button" className="hb-icon-btn" aria-label="Monat davor" onClick={() => onMonth(addMonths(o.month, -1))}>
              <Icon icon={ChevronLeft} size={20} />
            </button>
            <button type="button" className="hb-icon-btn" aria-label="Monat danach" disabled={!current ? false : true} onClick={() => onMonth(addMonths(o.month, 1))}>
              <Icon icon={ChevronRight} size={20} />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="hb-depot-value">{euro(o.total_spent)}</span>
        {diff !== null && (
          <span className={`hb-depot-delta ${diff > 10 ? 'is-down' : diff < -5 ? 'is-up' : ''}`}>
            {signed(diff)} {current ? 'hochgerechnet ' : ''}zum Schnitt
          </span>
        )}
      </div>
      <span className="text-label text-ink-muted">
        Schnitt der letzten 3 Monate {euro(o.total_avg3)}
        {current ? ` · noch ${o.days_in_month - o.days_passed} Tage` : ''}
        {o.total_income > 0 ? ` · Einnahmen ${euro(o.total_income)}` : ''}
      </span>
      {o.total_spent > 0 && (
        <div className="hb-fin-stack" aria-hidden="true">
          {top.map((c) => (
            <span key={c.id} style={{ ...catVar(c), width: `${(c.spent / o.total_spent) * 100}%` }} />
          ))}
          {rest > 0 && <span className="is-rest" style={{ width: `${(rest / o.total_spent) * 100}%` }} />}
        </div>
      )}
      <ul className="flex flex-col">
        {shown.map((c) => {
          const d = pct(c.spent, c.avg3)
          return (
            <li key={c.id}>
              <button type="button" className="hb-fin-catrow" disabled={!onPick} onClick={() => onPick?.(c)}>
                <span className="hb-fin-swatch" style={catVar(c)} />
                <Icon icon={iconOf(c.icon)} size={16} />
                <span className="min-w-0 flex-1 truncate text-left">{c.name}</span>
                <span className="hb-fin-amount">{euro(c.spent)}</span>
                <span className={`hb-fin-dev ${d !== null && d >= 20 ? 'is-high' : ''}`}>{d === null ? 'neu' : signed(d)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {shown.length === 0 && <p className="text-label text-ink-muted">In diesem Monat noch keine Ausgaben.</p>}
    </section>
  )
}

/** Fortschrittsring fürs Budget: ab 90 % warning, über 100 % urgent */
export function BudgetRing({ value, size = 76 }: { value: number; size?: number }) {
  const r = 40
  const c = 2 * Math.PI * r
  const tone = value > 100 ? 'is-over' : value >= 90 ? 'is-near' : ''
  return (
    <svg className={`hb-budget-ring ${tone}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="hb-goal-track" />
      <circle cx="50" cy="50" r={r} className="hb-goal-fill" transform="rotate(-90 50 50)" style={{ strokeDasharray: c, ['--off' as string]: `${c * (1 - Math.min(100, value) / 100)}`, ['--c' as string]: `${c}` }} />
      <text x="50" y="57" textAnchor="middle" className="hb-goal-pct">
        {Math.round(value)} %
      </text>
    </svg>
  )
}

/** Budgets: Stand und Prognose bis Monatsende */
export function BudgetCard({ o, onPick, max }: { o: Overview; onPick?: (c: OverviewCategory) => void; max?: number }) {
  const list = o.categories.filter((c) => c.budget).slice(0, max)
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={Target} size={18} />
        Budgets
      </h3>
      {list.length === 0 ? (
        <p className="text-label text-ink-muted">Noch kein Budget. {onPick ? 'Tipp im Monat auf eine Kategorie, um eins festzulegen.' : 'Leg sie am Handy fest.'}</p>
      ) : (
        <div className="hb-goal-grid">
          {list.map((c) => {
            const v = (c.spent / (c.budget ?? 1)) * 100
            const f = forecast(o, c.spent)
            return (
              <button key={c.id} type="button" className="hb-goal" disabled={!onPick} onClick={() => onPick?.(c)}>
                <BudgetRing value={v} />
                <span className="font-semibold text-ink">{c.name}</span>
                <span className="text-label text-ink-muted">
                  {euro(c.spent)} von {euro(c.budget ?? 0)}
                </span>
                {o.days_passed < o.days_in_month && <span className={`text-label ${f > (c.budget ?? 0) ? 'text-urgent' : 'text-ink-muted'}`}>Prognose {euro(f)}</span>}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Auffällig: Kategorien deutlich über ihrem Schnitt, Budgets ab 90 % */
export function unusual(o: Overview): { tone: 'urgent' | 'warning'; title: string; text: string }[] {
  const out: { tone: 'urgent' | 'warning'; title: string; text: string }[] = []
  // nur was schon jetzt (ohne Hochrechnung) deutlich über dem Schnitt liegt; Einmalzahlungen würden sonst übertrieben
  for (const c of o.categories) {
    const d = pct(c.spent, c.avg3)
    if (d !== null && d >= 30 && c.spent - c.avg3 >= 20) out.push({ tone: 'urgent', title: `${c.name} ${signed(d)}`, text: `${o.days_passed < o.days_in_month ? 'Schon ' : ''}${euro(c.spent)}, sonst ${euro(c.avg3)} im ganzen Monat` })
  }
  for (const c of o.categories) {
    if (!c.budget) continue
    const v = (c.spent / c.budget) * 100
    if (v >= 90) out.push({ tone: v > 100 ? 'urgent' : 'warning', title: `${c.name} bei ${Math.round(v)} %`, text: `Budget ${euro(c.budget)}, Prognose bis Monatsende ${euro(forecast(o, c.spent))}` })
  }
  return out.slice(0, 4)
}

export function UnusualCard({ o }: { o: Overview }) {
  const items = unusual(o)
  if (!items.length) return null
  return (
    <section className="hb-tile hb-tile-static gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={AlertCircle} size={18} />
        Auffällig
      </h3>
      {items.map((i) => (
        <div key={i.title} className={`hb-fin-note is-${i.tone}`}>
          <b>{i.title}</b>
          <span>{i.text}</span>
        </div>
      ))}
    </section>
  )
}

/** Verlauf: 12 Monate Ausgaben (Balken) und Einnahmen (Punkt), Saldo des gewählten Monats */
export function MonthsCard({ o }: { o: Overview }) {
  const max = Math.max(1, ...o.months.flatMap((m) => [m.spent, m.income]))
  const label = (m: string) => new Intl.DateTimeFormat('de-DE', { month: 'narrow', timeZone: 'UTC' }).format(new Date(`${m}T12:00:00Z`))
  const withData = o.months.filter((m) => m.spent > 0 || m.income > 0)
  const avg = withData.length ? withData.reduce((s, m) => s + m.income - m.spent, 0) / withData.length : 0
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold text-ink">
          <Icon icon={BarChart3} size={18} />
          Verlauf · 12 Monate
        </h3>
        <span className={`hb-depot-delta ${avg > 0 ? 'is-up' : avg < 0 ? 'is-down' : ''}`}>Ø Saldo {euro(avg, true)}</span>
      </div>
      <div className="hb-fin-months">
        {o.months.map((m, i) => (
          <div key={m.month} className={`hb-fin-month ${i === o.months.length - 1 ? 'is-now' : ''}`} title={`${monthName(m.month)}: Ausgaben ${euro(m.spent)}, Einnahmen ${euro(m.income)}`}>
            <span className="hb-fin-month-bar" style={{ height: `${(m.spent / max) * 100}%`, animationDelay: `${i * 30}ms` }} />
            {m.income > 0 && <span className="hb-fin-month-in" style={{ bottom: `calc(${(m.income / max) * 100}% + 14px)` }} />}
            <span className="hb-fin-month-label">{label(m.month)}</span>
          </div>
        ))}
      </div>
      <span className="text-label text-ink-muted">
        <span className="hb-fin-key is-out" /> Ausgaben <span className="hb-fin-key is-in" /> Einnahmen · Umbuchungen (z. B. Depot) zählen nicht
      </span>
    </section>
  )
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7)

/** Wann: Wochentag × Uhrzeit (nur Zahlungen mit Uhrzeit, letzte 90 Tage) */
export function WhenCard({ o }: { o: Overview }) {
  if (o.heatmap_n < 5) return null
  const get = (d: number, h: number) => o.heatmap.find((x) => x.dow === d && x.hour === h)?.n ?? 0
  const max = Math.max(1, ...o.heatmap.map((x) => x.n))
  const peak = [...o.heatmap].sort((a, b) => b.n - a.n)[0]
  return (
    <section className="hb-tile hb-tile-static gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={Clock} size={18} />
        Wann wird eingekauft
      </h3>
      <div className="hb-fin-heat" role="img" aria-label={peak ? `Am meisten ${DAYS[peak.dow - 1]} um ${peak.hour} Uhr` : 'Wochentag und Uhrzeit'}>
        <span />
        {HOURS.map((h) => (
          <span key={h} className="hb-fin-heat-h">
            {h % 3 === 1 ? h : ''}
          </span>
        ))}
        {DAYS.map((d, di) => (
          <div key={d} className="contents">
            <span className="hb-fin-heat-d">{d}</span>
            {HOURS.map((h) => {
              const n = get(di + 1, h)
              return <span key={h} className="hb-fin-heat-c" style={{ opacity: n ? 0.18 + (n / max) * 0.82 : 0.06 }} />
            })}
          </div>
        ))}
      </div>
      <span className="text-label text-ink-muted">
        {o.heatmap_n} Kartenzahlungen mit Uhrzeit, letzte 90 Tage{peak ? ` · am meisten ${DAYS[peak.dow - 1]} ${peak.hour}–${peak.hour + 1} Uhr` : ''}
      </span>
    </section>
  )
}

/** Wo: Läden mit Anzahl und Ø pro Einkauf (letzte 90 Tage, nur Kartenzahlungen) */
export function WhereCard({ o, max = 6 }: { o: Overview; max?: number }) {
  if (!o.merchants.length) return null
  return (
    <section className="hb-tile hb-tile-static gap-1">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-ink">
        <Icon icon={Store} size={18} />
        Wo · 90 Tage
      </h3>
      {o.merchants.slice(0, max).map((m, i) => (
        <div key={m.name} className="hb-fin-where">
          <span className="text-ink-muted">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">{shopName(m.name)}</span>
          <span className="text-label text-ink-muted">
            {m.n}× · Ø {euro(m.avg)}
          </span>
        </div>
      ))}
    </section>
  )
}

/** Budget festlegen (gilt für beide; leer = kein Budget) */
export function BudgetSheet({ cat, onClose, onDone }: { cat: OverviewCategory; onClose: () => void; onDone: (m: string) => void }) {
  const [value, setValue] = useState(cat.budget ? String(cat.budget).replace('.', ',') : '')
  async function save(clear = false) {
    const n = Number(value.replace(/\./g, '').replace(',', '.'))
    const budget = clear || !value.trim() ? null : n > 0 ? Math.round(n * 100) / 100 : null
    const { error } = await supabase.from('fin_categories').update({ monthly_budget: budget }).eq('id', cat.id)
    onDone(error ? 'Speichern hat nicht geklappt.' : budget ? `Budget ${cat.name}: ${euro(budget)} im Monat` : `Budget ${cat.name} entfernt`)
  }
  return (
    <Sheet title={`Budget ${cat.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-label text-ink-muted">
          Bisher im Schnitt {euro(cat.avg3)} im Monat. Das Budget gilt für euch beide; ab 90 % wird der Ring gelb, darüber rot.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-muted">Budget pro Monat in €</span>
          <input className="hb-input" inputMode="decimal" value={value} placeholder={String(Math.round(cat.avg3 / 10) * 10 || 100)} onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button variant="primary" size="lg" onClick={() => save()}>
          Speichern
        </Button>
        {cat.budget && (
          <Button variant="ghost" onClick={() => save(true)}>
            Budget entfernen
          </Button>
        )}
      </div>
    </Sheet>
  )
}

/** Auswertung im Reiter Finanzen (Konto): Alles oder nur Haushalt, Monat wählbar */
export function AnalysisSection({ showToast }: { showToast: (m: string) => void }) {
  const [scope, setScope] = useState<'alles' | 'haushalt'>('alles')
  const [month, setMonth] = useState<string | null>(null)
  const { data: o, reload } = useOverview(month, scope === 'haushalt')
  const [budget, setBudget] = useState<OverviewCategory | null>(null)
  if (!o) return null
  if (!o.months.some((m) => m.spent > 0)) return null
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[20px] font-bold text-ink">Auswertung</h3>
        <div className="hb-seg is-small" role="group" aria-label="Umfang">
          <button type="button" aria-pressed={scope === 'alles'} className={scope === 'alles' ? 'is-on' : ''} onClick={() => setScope('alles')}>
            Alles
          </button>
          <button type="button" aria-pressed={scope === 'haushalt'} className={scope === 'haushalt' ? 'is-on' : ''} onClick={() => setScope('haushalt')}>
            Haushalt
          </button>
        </div>
      </div>
      <MonthCard o={o} onMonth={setMonth} onPick={setBudget} />
      <BudgetCard o={o} onPick={setBudget} />
      <UnusualCard o={o} />
      <MonthsCard o={o} />
      <WhenCard o={o} />
      <WhereCard o={o} />
      {budget && (
        <BudgetSheet
          cat={budget}
          onClose={() => setBudget(null)}
          onDone={(m) => {
            setBudget(null)
            showToast(m)
            reload()
          }}
        />
      )}
    </>
  )
}

function useFinTileGuard() {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const { settings } = useSettings()
  return !!profile?.enabled && !settings?.visit_mode
}

/** Kachel „Monat“ für die Handy-Startseite (Haushalt diesen Monat vs. Schnitt) */
export function MonthTile({ delay }: TileProps) {
  const ok = useFinTileGuard()
  const { data: o } = useOverview(null, true)
  if (!ok || !o || !o.months.some((m) => m.spent > 0)) return null
  const diff = pct(forecast(o, o.total_spent), o.total_avg3)
  return (
    <Tile title={`${monthName(o.month)} · Haushalt`} icon={CalendarRange} delay={delay}>
      <span className="hb-depot-value">{euro(o.total_spent)}</span>
      {diff !== null && <span className={`hb-depot-delta ${diff > 10 ? 'is-down' : diff < -5 ? 'is-up' : ''}`}>{signed(diff)} hochgerechnet zum Schnitt ({euro(o.total_avg3)})</span>}
    </Tile>
  )
}

/** Kachel „Budget“ für die Handy-Startseite: bis zu 4 Ringe der Haushaltskategorien */
export function BudgetTile({ delay }: TileProps) {
  const ok = useFinTileGuard()
  const { data: o } = useOverview(null, true)
  if (!ok || !o || !o.categories.some((c) => c.budget)) return null
  return (
    <Tile title="Budget" icon={Target} delay={delay}>
      <div className="hb-goal-grid">
        {o.categories
          .filter((c) => c.budget)
          .slice(0, 4)
          .map((c) => (
            <div key={c.id} className="hb-goal">
              <BudgetRing value={(c.spent / (c.budget ?? 1)) * 100} size={70} />
              <span className="text-label font-semibold text-ink">{c.name}</span>
            </div>
          ))}
      </div>
    </Tile>
  )
}
