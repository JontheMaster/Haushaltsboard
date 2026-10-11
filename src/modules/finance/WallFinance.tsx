import { Lock, Target, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import { HistoryChart } from './DepotCharts'
import { fmtPct, quoteStamp } from './depotStore'
import { GoalRing } from './Goals'
import { euro } from './finStore'

export type WallSummary = {
  percent_only: boolean
  calm: boolean
  quote_at: string | null
  day_pct: number | null
  week_pct: number | null
  month_pct: number | null
  gain_pct: number | null
  spark: number[]
  goals: { name: string; pct: number; months: number | null; saved: number | null; target: number | null }[]
  value: number | null
  gain: number | null
}

/**
 * Zusammenfassung für die Wand (RPC fin_wall_summary): nur gemeinsame Depots und Ziele, nur Prozent
 * (Euro nur, wenn „An der Wand nur Prozent“ am Handy aus ist). Alle 5 Minuten neu; null = nichts zu zeigen.
 */
export function useWallFinance(enabled: boolean) {
  const [summary, setSummary] = useState<WallSummary | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('fin_wall_summary')
    setSummary((data as WallSummary | null) ?? null)
  }, [])
  useEffect(() => {
    if (!enabled) return setSummary(null)
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [enabled, load])
  return summary
}

const tone = (n: number | null) => (n === null ? '' : n > 0.005 ? 'is-up' : n < -0.005 ? 'is-down' : '')

/**
 * Ansicht „Finanzen“ am Wand-Tablet (Stufe 5, später mit Stufe 3 erweitert): gemeinsames Depot und Sparziele.
 * Ruhige Ansicht (Standard): Woche und 30 Tage statt Tagesschwankung. Nie einzelne Positionen oder Buchungen.
 */
export function WallFinance({ summary }: { summary: WallSummary }) {
  const main = summary.calm ? { label: 'diese Woche', pct: summary.week_pct } : { label: 'seit gestern', pct: summary.day_pct }
  const points = summary.spark.map((v, i) => ({ day: String(i), value: v, invested: v }))
  return (
    <div className="hb-wallfin">
      <section className="hb-tile hb-wallfin-depot">
        <header className="hb-tile-head">
          <span className="hb-tile-icon">
            <Icon icon={TrendingUp} size={20} />
          </span>
          <h2 className="hb-tile-title">Gemeinsames Depot</h2>
          <span className="text-label text-ink-muted">{quoteStamp(summary.quote_at)}</span>
        </header>
        <div className="hb-wallfin-main">
          {main.pct !== null ? <span className={`hb-wallfin-big ${tone(main.pct)}`}>{fmtPct(main.pct)}</span> : <span className="hb-wallfin-big">–</span>}
          <span className="text-body text-ink-muted">{main.label}</span>
          {!summary.percent_only && summary.value !== null && <span className="hb-wallfin-value">{euro(summary.value)}</span>}
        </div>
        {points.length > 1 && <HistoryChart points={points} height={180} plain />}
        <dl className="hb-wallfin-facts">
          {summary.calm ? (
            <div>
              <dt>30 Tage</dt>
              <dd className={`hb-depot-delta ${tone(summary.month_pct)}`}>{summary.month_pct !== null ? fmtPct(summary.month_pct) : '–'}</dd>
            </div>
          ) : (
            <div>
              <dt>Woche</dt>
              <dd className={`hb-depot-delta ${tone(summary.week_pct)}`}>{summary.week_pct !== null ? fmtPct(summary.week_pct) : '–'}</dd>
            </div>
          )}
          <div>
            <dt>seit Kauf</dt>
            <dd className={`hb-depot-delta ${tone(summary.gain_pct)}`}>
              {summary.gain_pct !== null ? fmtPct(summary.gain_pct) : '–'}
              {!summary.percent_only && summary.gain !== null ? ` · ${euro(summary.gain, true)}` : ''}
            </dd>
          </div>
        </dl>
      </section>

      {summary.goals.length > 0 && (
        <section className="hb-tile hb-wallfin-goals">
          <header className="hb-tile-head">
            <span className="hb-tile-icon">
              <Icon icon={Target} size={20} />
            </span>
            <h2 className="hb-tile-title">Sparziele</h2>
          </header>
          <div className="hb-wallfin-rings">
            {summary.goals.map((g) => (
              <div key={g.name} className="hb-goal">
                <GoalRing pct={g.pct} size={150} label={`${g.name}: ${Math.round(g.pct)} %`} />
                <span className="hb-wallfin-goal-name">{g.name}</span>
                <span className="text-label text-ink-muted">
                  {!summary.percent_only && g.saved !== null && g.target !== null ? `${euro(g.saved)} von ${euro(g.target)}` : ''}
                  {g.months ? `${!summary.percent_only && g.saved !== null ? ' · ' : ''}noch ${g.months} ${g.months === 1 ? 'Monat' : 'Monate'}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="hb-wallfin-note">
        <Icon icon={Lock} size={16} />
        Nur gemeinsame Depots{summary.percent_only ? ', nur Prozent' : ''}. Einzelnes und Privates nur am Handy.
      </p>
    </div>
  )
}
