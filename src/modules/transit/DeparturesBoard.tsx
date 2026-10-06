import { Footprints, TrainFront } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { ScrollList } from '../../components/ScrollList'
import { berlinTime, useNow } from '../../lib/time'
import type { TileProps } from '../types'
import { useEffect, useState } from 'react'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { hm, useBoard, type Departure } from './api'
import { DelayBadge, LineChip } from './TripCard'

/** Wann du los musst, um die Abfahrt zu Fuß zu schaffen */
function leaveText(ms: number): string {
  const min = Math.floor(ms / 60000)
  if (ms < 0) return 'nur mit Beeilen'
  return min <= 0 ? 'jetzt los' : min < 60 ? `los in ${min} Min` : `los in ${Math.floor(min / 60)} Std ${min % 60} Min`
}

/** Bis so viele Minuten „zu spät“ ist eine Abfahrt mit Beeilen noch drin (grau), darüber verschwindet sie */
const HURRY_MS = 5 * 60_000

/**
 * Abfahrtstafel der Haltestellen zuhause, mit Echtzeit.
 * Gezeigt wird nur, was man zu Fuß noch schafft: Uhrzeit der Abfahrt und wann man los muss.
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
        // nur, was zu Fuß noch erreichbar ist – mit Beeilen bis 5 Minuten knapper (grau)
        const upcoming = departures.filter((d) => Date.parse(d.actual) - stop.walk * 60_000 - now > -HURRY_MS).slice(0, perStop)
        return (
          <section key={stop.id} className="hb-board-stop">
            <header className="hb-board-head">
              <h3>{stop.name}</h3>
              <span className="hb-board-walk">
                <Icon icon={Footprints} size={14} /> {stop.walk} Min
              </span>
            </header>
            {upcoming.length === 0 ? (
              <p className="text-label text-ink-muted">Gerade keine Abfahrt, die du noch schaffst.</p>
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
  // Zeit bis zum Losgehen (Abfahrt minus Fußweg)
  const toLeave = Date.parse(d.actual) - walk * 60_000 - now
  const delay = d.realtime ? Math.round((Date.parse(d.actual) - Date.parse(d.planned)) / 60000) : null
  return (
    <li className={`hb-board-row ${toLeave < 0 ? 'is-hurry' : toLeave < 2 * 60_000 ? 'is-now' : ''}`}>
      <LineChip line={d.line} product={d.product} />
      <span className="hb-board-dir">{direction(d.direction)}</span>
      {!compact && <DelayBadge delay={delay && delay > 0 ? delay : null} />}
      <span className="hb-board-when">
        <span
          className={`hb-board-time ${compact && delay && delay >= 3 ? 'is-late' : ''}`}
          title={`Abfahrt ${hm(d.actual)}${delay && delay > 0 ? `, ${delay} Min später` : ''}`}
        >
          {hm(d.actual)}
        </span>
        <span className="hb-board-leave">{leaveText(toLeave)}</span>
      </span>
    </li>
  )
}

// Zeitfenster um die übliche Losgehzeit: so lange vorher und nachher steht die Kachel da
const BEFORE_MIN = 30
const AFTER_MIN = 10

type LeavePrefs = { member_id: string; leave_time: string | null; leave_days: number[] }
let lastPrefs: LeavePrefs[] = []

/** Übliche Losgehzeiten aller (live, wenn jemand seine Zeit ändert) */
function useLeavePrefs(): LeavePrefs[] {
  const [prefs, setPrefs] = useState<LeavePrefs[]>(lastPrefs)
  useEffect(() => {
    const load = () =>
      supabase
        .from('transit_prefs')
        .select('member_id, leave_time, leave_days')
        .then(({ data }) => {
          if (!data) return
          lastPrefs = data
          setPrefs(data)
        })
    load()
    const channel = supabase
      .channel(`transit-prefs-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transit_prefs' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  return prefs
}

/** Für wen die Abfahrtskachel gerade da ist (Losgehzeit −30 bis +10 Minuten, an den eingestellten Tagen) */
function useTileFor(): string[] {
  const prefs = useLeavePrefs()
  const now = useNow(30_000)
  const { hh, mm } = berlinTime(now)
  const cur = Number(hh) * 60 + Number(mm)
  const weekday = ((now.getDay() + 6) % 7) + 1
  return prefs
    .filter((p) => {
      if (!p.leave_time || !p.leave_days.includes(weekday)) return false
      const [h, m] = p.leave_time.split(':').map(Number)
      const at = h * 60 + m
      return cur >= at - BEFORE_MIN && cur <= at + AFTER_MIN
    })
    .map((p) => p.member_id)
}

/** Steht die Abfahrtskachel gerade an der Wand? */
export function useMorningBoard(): boolean {
  return useTileFor().length > 0
}

/** Abfahrtskachel an der Wand: steht über dem Einkauf, rund um die Losgehzeit von Jonathan oder Leviona */
export function DeparturesTile({ delay }: TileProps) {
  const who = useTileFor()
  const { byId } = useMembers()
  return (
    <section className="hb-tile flex min-h-0 flex-col gap-3" style={{ animationDelay: `${delay}ms` }} aria-label="Abfahrten">
      <header className="hb-tile-head">
        <span className="hb-tile-icon">
          <Icon icon={TrainFront} size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <h2 className="hb-tile-title">Abfahrten</h2>
          {who.length > 0 && <span className="text-label text-ink-muted">für {who.map((id) => byId.get(id)?.name).join(' & ')}</span>}
        </span>
      </header>
      <ScrollList className="min-h-0 flex-1">
        <DeparturesBoard compact />
      </ScrollList>
    </section>
  )
}
