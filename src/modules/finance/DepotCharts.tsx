import { Coins, LineChart, PiggyBank, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Tile } from '../../components/Tile'
import { useMembers } from '../../lib/members'
import { useSettings } from '../../lib/settings'
import { supabase } from '../../lib/supabase'
import { berlinDay } from '../../lib/time'
import type { TileProps } from '../types'
import { fmtPct, quoteStamp, summarize, useHoldings, useQuotes } from './depotStore'
import { euro, useFinProfile } from './finStore'

type Point = { day: string; value: number; invested: number }
export type Range = '1m' | '6m' | '1j' | 'alles'
const RANGES: { id: Range; label: string; months: number | null }[] = [
  { id: '1m', label: '1 M', months: 1 },
  { id: '6m', label: '6 M', months: 6 },
  { id: '1j', label: '1 J', months: 12 },
  { id: 'alles', label: 'Alles', months: null },
]

function monthsAgo(n: number): string {
  const d = new Date(`${berlinDay()}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

/** Verlauf aus der RPC fin_depot_history (Rechte des Aufrufers, nur eigene und gemeinsame Positionen) */
export function useDepotHistory(range: Range, refreshKey = '') {
  const [points, setPoints] = useState<Point[] | null>(null)
  useEffect(() => {
    let alive = true
    const months = RANGES.find((r) => r.id === range)?.months
    supabase.rpc('fin_depot_history', months ? { p_from: monthsAgo(months) } : {}).then(({ data }) => {
      if (alive) setPoints((data ?? []).map((p) => ({ day: p.day, value: Number(p.value), invested: Number(p.invested) })))
    })
    return () => {
      alive = false
    }
  }, [range, refreshKey])
  return points
}

/**
 * Verlauf: Depotwert als Linie, eingezahltes Geld gestrichelt, die Fläche dazwischen grün (Gewinn) oder rot (Verlust).
 * Linie zeichnet sich beim Erscheinen von links nach rechts.
 */
export function HistoryChart({ points, height = 160, plain }: { points: Point[]; height?: number; plain?: boolean }) {
  const W = 600
  const H = height
  const geo = useMemo(() => {
    if (points.length < 2) return null
    const vals = points.flatMap((p) => (plain ? [p.value] : [p.value, p.invested]))
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.08 || 1
    const lo = min - pad
    const hi = max + pad
    const x = (i: number) => (i / (points.length - 1)) * W
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
    const line = (key: 'value' | 'invested') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('')
    // Fläche zwischen den Linien, Stück für Stück in der Farbe des Vorzeichens
    const bands = plain
      ? []
      : points.slice(1).map((p, k) => {
          const a = points[k]
          const up = (a.value - a.invested + (p.value - p.invested)) / 2 >= 0
          const d = `M${x(k)},${y(a.value)}L${x(k + 1)},${y(p.value)}L${x(k + 1)},${y(p.invested)}L${x(k)},${y(a.invested)}Z`
          return { d, up }
        })
    return { value: line('value'), invested: line('invested'), bands }
  }, [points, H, plain])

  if (!geo) return <div className="hb-depot-chart is-empty" style={{ height }} />
  const up = points[points.length - 1].value >= (plain ? points[0].value : points[points.length - 1].invested)
  return (
    <svg className={`hb-depot-chart ${up ? 'is-up' : 'is-down'}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      {geo.bands.map((b, i) => (
        <path key={i} d={b.d} className={b.up ? 'hb-depot-band-up' : 'hb-depot-band-down'} />
      ))}
      {!plain && <path d={geo.invested} className="hb-depot-line-invested" vectorEffect="non-scaling-stroke" />}
      <path d={geo.value} className="hb-depot-line-value" pathLength={1} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Karte „Verlauf“ im Depot: Zeitraum wählen, Wert vs. eingezahlt */
export function HistoryCard({ refreshKey }: { refreshKey: string }) {
  const [range, setRange] = useState<Range>('alles')
  const points = useDepotHistory(range, refreshKey)
  const first = points?.[0]
  const last = points?.[points.length - 1]
  // Veränderung im Zeitraum ohne neue Einzahlungen: (Wert − eingezahlt) jetzt minus vorher
  const gain = first && last ? last.value - last.invested - (first.value - first.invested) : 0
  const base = first ? first.value + (last ? last.invested - first.invested : 0) : 0
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold text-ink">
          <Icon icon={LineChart} size={18} />
          Verlauf
        </h3>
        <div className="hb-seg is-small" role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} className={range === r.id ? 'is-on' : ''} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {points === null ? (
        <div className="hb-depot-chart is-empty" style={{ height: 160 }} />
      ) : points.length < 2 ? (
        <p className="text-label text-ink-muted">Für diesen Zeitraum gibt es noch keinen Verlauf.</p>
      ) : (
        <>
          <HistoryChart key={range} points={points} />
          <div className="flex flex-wrap justify-between gap-2 text-label text-ink-muted">
            <span>
              <span className="hb-depot-key is-value" /> Depotwert <span className="hb-depot-key is-invested" /> eingezahlt
            </span>
            <span className={`hb-depot-delta ${gain > 0.005 ? 'is-up' : gain < -0.005 ? 'is-down' : ''}`}>
              {euro(gain, true)} · {fmtPct(base ? (gain / base) * 100 : 0)} im Zeitraum
            </span>
          </div>
        </>
      )}
    </section>
  )
}

/** Sparquote: Einzahlungen ins Depot im Verhältnis zu den Einnahmen, 12 Monate */
export function SavingsRateCard({ refreshKey }: { refreshKey: string }) {
  const [rows, setRows] = useState<{ month: string; saved: number; income: number }[] | null>(null)
  useEffect(() => {
    supabase.rpc('fin_savings_rate', { p_months: 12 }).then(({ data }) => setRows((data ?? []).map((r) => ({ month: r.month, saved: Number(r.saved), income: Number(r.income) }))))
  }, [refreshKey])
  if (!rows || !rows.some((r) => r.saved > 0)) return null
  const rate = (r: { saved: number; income: number }) => (r.income > 0 ? (r.saved / r.income) * 100 : 0)
  const withSaving = rows.filter((r) => r.saved > 0 && r.income > 0)
  const avg = withSaving.length ? withSaving.reduce((s, r) => s + rate(r), 0) / withSaving.length : 0
  const max = Math.max(10, ...rows.map(rate))
  const label = (m: string) => new Intl.DateTimeFormat('de-DE', { month: 'narrow', timeZone: 'UTC' }).format(new Date(`${m}T12:00:00Z`))
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-semibold text-ink">
          <Icon icon={PiggyBank} size={18} />
          Sparquote
        </h3>
        <span className="text-label text-ink-muted">im Schnitt {Math.round(avg)} %</span>
      </div>
      <div className="hb-depot-bars">
        {rows.map((r, i) => (
          <div key={r.month} className="hb-depot-bar" title={`${euro(r.saved)} von ${euro(r.income)}`}>
            <span className="hb-depot-bar-val">{r.saved > 0 ? `${Math.round(rate(r))}` : ''}</span>
            <span className="hb-depot-bar-fill" style={{ height: `${(rate(r) / max) * 100}%`, animationDelay: `${i * 40}ms` }} />
            <span className="hb-depot-bar-label">{label(r.month)}</span>
          </div>
        ))}
      </div>
      <p className="text-label text-ink-muted">Anteil der Einnahmen auf euren Konten, der ins Depot ging (Käufe und Sparpläne), in %.</p>
    </section>
  )
}

/** Dividenden pro Jahr (nur wenn es welche gibt; thesaurierende ETFs schütten nicht aus) */
export function DividendsCard({ holdingIds, refreshKey }: { holdingIds: string[]; refreshKey: string }) {
  const [rows, setRows] = useState<{ year: string; amount: number }[]>([])
  const key = holdingIds.join(',')
  useEffect(() => {
    if (!key) return
    supabase
      .from('fin_holding_tx')
      .select('date, amount')
      .in('holding', key.split(','))
      .eq('type', 'dividend')
      .then(({ data }) => {
        const by = new Map<string, number>()
        for (const d of data ?? []) by.set(d.date.slice(0, 4), (by.get(d.date.slice(0, 4)) ?? 0) + Number(d.amount))
        setRows([...by.entries()].sort().map(([year, amount]) => ({ year, amount })))
      })
  }, [key, refreshKey])
  if (!rows.length) return null
  return (
    <section className="hb-tile hb-tile-static gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={Coins} size={18} />
        Dividenden
      </h3>
      {rows.map((r) => (
        <div key={r.year} className="flex justify-between text-body">
          <span className="text-ink-muted">{r.year}</span>
          <span className="hb-fin-amount">{euro(r.amount)}</span>
        </div>
      ))}
    </section>
  )
}

/**
 * Kachel „Depot“ für die Handy-Startseite: Wert, Veränderung seit gestern, Linie 30 Tage.
 * Nur für Personen mit eingeschaltetem Finanzen-Modul, nie im Besuchsmodus.
 */
export function DepotTile({ delay }: TileProps) {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const { settings } = useSettings()
  const { holdings } = useHoldings()
  const symbols = (holdings ?? []).map((h) => h.symbol).filter((s): s is string => !!s)
  const { quotes, prev } = useQuotes(symbols)
  const points = useDepotHistory('1m')
  if (!profile?.enabled || settings?.visit_mode || !holdings?.length) return null
  const s = summarize(holdings, quotes, prev)
  const tone = s.day > 0.005 ? 'is-up' : s.day < -0.005 ? 'is-down' : ''
  return (
    <Tile title="Depot" icon={TrendingUp} delay={delay} action={<span className="text-label text-ink-muted">{quoteStamp(s.at)}</span>}>
      <div className="flex flex-col gap-1">
        <span className="hb-depot-value">{euro(s.value)}</span>
        <span className={`hb-depot-delta ${tone}`}>
          {fmtPct(s.dayPct)} · {euro(s.day, true)} <span className="text-ink-muted">seit gestern</span>
        </span>
        {points && points.length > 1 && <HistoryChart points={points} height={56} plain />}
      </div>
    </Tile>
  )
}
