import { Footprints, TrainFront } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { ScrollList } from '../../components/ScrollList'
import { berlinTime, useNow } from '../../lib/time'
import type { TileProps } from '../types'
import { hm, useBoard, useTransitConfig, type Departure } from './api'
import { DelayBadge, LineChip } from './TripCard'

/** Minuten bis zur Abfahrt („in 4 Min“), danach Uhrzeit */
function untilText(ms: number): string {
  const min = Math.floor(ms / 60000)
  return min <= 0 ? 'jetzt' : `${min} Min`
}

/**
 * Abfahrtstafel der Haltestellen zuhause, mit Echtzeit.
 * Was man zu Fuß nicht mehr schafft, steht blass da.
 * `compact`: weniger Abfahrten pro Haltestelle (Morgen-Kachel).
 */
export function DeparturesBoard({ compact }: { compact?: boolean }) {
  const stops = useBoard()
  const now = useNow(15_000).getTime()
  if (!stops) return <p className="text-body text-ink-muted">Abfahrten werden geladen …</p>
  const perStop = compact ? 3 : 8

  return (
    <div className={`hb-board ${compact ? 'is-compact' : ''}`}>
      {stops.map(({ stop, departures }) => {
        const upcoming = departures.filter((d) => Date.parse(d.actual) > now - 30_000).slice(0, perStop)
        return (
          <section key={stop.id} className="hb-board-stop">
            <header className="hb-board-head">
              <h3>{stop.name}</h3>
              <span className="hb-board-walk">
                <Icon icon={Footprints} size={14} /> {stop.walk} Min
              </span>
            </header>
            {upcoming.length === 0 ? (
              <p className="text-label text-ink-muted">Gerade keine Abfahrten.</p>
            ) : (
              <ul className="hb-board-list">
                {upcoming.map((d, i) => (
                  <DepartureRow key={`${d.line}${d.planned}${i}`} d={d} now={now} walk={stop.walk} compact={compact} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** „Altdorf(b Nürnberg)“ → „Altdorf“: Zusätze in Klammern kosten nur Platz */
function direction(text: string): string {
  return text.replace(/\s*\(.*?\)\s*/g, ' ').trim() || text
}

function DepartureRow({ d, now, walk, compact }: { d: Departure; now: number; walk: number; compact?: boolean }) {
  const left = Date.parse(d.actual) - now
  // zu Fuß nicht mehr zu schaffen
  const missed = left < walk * 60000
  const delay = d.realtime ? Math.round((Date.parse(d.actual) - Date.parse(d.planned)) / 60000) : null
  return (
    <li className={`hb-board-row ${missed ? 'is-missed' : ''}`}>
      <LineChip line={d.line} product={d.product} />
      <span className="hb-board-dir">{direction(d.direction)}</span>
      {!compact && <DelayBadge delay={delay && delay > 0 ? delay : null} />}
      <span
        className={`hb-board-time ${compact && delay && delay >= 3 ? 'is-late' : ''}`}
        title={`Abfahrt ${hm(d.actual)}${delay && delay > 0 ? `, ${delay} Min später` : ''}`}
      >
        {left < 60 * 60000 ? untilText(left) : hm(d.actual)}
      </span>
    </li>
  )
}

/** Liegt jetzt im Zeitfenster der Morgen-Kachel (z. B. 6–9 Uhr)? */
export function useMorningBoard(): boolean {
  const config = useTransitConfig()
  const now = useNow(60_000)
  const { hh, mm } = berlinTime(now)
  const t = `${hh}:${mm}`
  return t >= config.morning_from && t < config.morning_to
}

/** Morgen-Kachel an der Wand: steht über dem Einkauf, nur im Zeitfenster */
export function DeparturesTile({ delay }: TileProps) {
  return (
    <section className="hb-tile flex min-h-0 flex-col gap-3" style={{ animationDelay: `${delay}ms` }} aria-label="Abfahrten">
      <header className="hb-tile-head">
        <span className="hb-tile-icon">
          <Icon icon={TrainFront} size={20} />
        </span>
        <h2 className="hb-tile-title">Abfahrten</h2>
      </header>
      <ScrollList className="min-h-0 flex-1">
        <DeparturesBoard compact />
      </ScrollList>
    </section>
  )
}
