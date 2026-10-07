import { CircleHelp, Footprints, MapPinned, TrainFront } from 'lucide-react'
import { useState } from 'react'
import { AssignSheet } from './TransitSettings'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { berlinDay, berlinTime, useNow } from '../../lib/time'
import { depRt, hm, usePlans, type Leg, type Plan, type Unknown } from './api'

// Wie lange vorher das Handy den nächsten Weg zeigt (Wand: einstellbar, Standard 30 Min)
const PHONE_AHEAD_MS = 18 * 60 * 60 * 1000
// Wege für morgen erst ab diesem Abend-Zeitpunkt zeigen (Entscheidung Jonathan 7.10.2026)
const EVENING_FROM = '21:30'

/** Liegt das Losgehen erst morgen (oder später), zeigt das Handy den Weg erst ab 21:30 am Vorabend */
function shownYet(leaveIso: string, now: number): boolean {
  if (berlinDay(new Date(leaveIso)) <= berlinDay(new Date(now))) return true
  const { hh, mm } = berlinTime(new Date(now))
  return `${hh}:${mm}` >= EVENING_FROM
}

/** Linie als kleines Schild in der Farbe des Verkehrsmittels (S-Bahn, U-Bahn, Tram, Bus) */
export function LineChip({ line, product }: { line: string; product: string }) {
  const kind = /s-?bahn/i.test(product)
    ? 's'
    : /u-?bahn/i.test(product)
      ? 'u'
      : /tram|straßenbahn/i.test(product)
        ? 'tram'
        : /bus/i.test(product)
          ? 'bus'
          : 'zug'
  return <span className={`hb-line hb-line-${kind}`}>{line}</span>
}

/** „pünktlich“, „+3 Min“ – Grün heißt in Ordnung, Rot heißt Achtung (DESIGN.md) */
export function DelayBadge({ delay }: { delay: number | null }) {
  if (delay === null) return null
  if (delay <= 0) return <span className="hb-delay is-ok">pünktlich</span>
  return <span className={`hb-delay ${delay >= 3 ? 'is-late' : 'is-slight'}`}>+{delay} Min</span>
}

function countdown(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min <= 0) return 'jetzt los'
  if (min < 60) return `in ${min} Min`
  const h = Math.floor(min / 60)
  return `in ${h} Std ${min % 60 ? `${min % 60} Min` : ''}`.trim()
}

/** Eine Fahrt als Zeile: Linie, ab wo, wann (mit Echtzeit), bis wo */
function LegRow({ leg }: { leg: Leg }) {
  if (leg.walk) {
    return (
      <li className="hb-leg is-walk">
        <span className="hb-leg-icon">
          <Icon icon={Footprints} size={16} />
        </span>
        <span>{leg.minutes ? `${leg.minutes} Min zu Fuß` : 'zu Fuß'}</span>
      </li>
    )
  }
  return (
    <li className="hb-leg">
      <LineChip line={leg.line} product={leg.product} />
      <span className="hb-leg-text">
        <b>{hm(depRt(leg))}</b> {leg.from} → {leg.to}
      </span>
      {/* nur Verspätung zeigen, „pünktlich“ steht schon oben */}
      {leg.delay !== null && leg.delay > 0 && <DelayBadge delay={leg.delay} />}
    </li>
  )
}

/**
 * Nächster Weg einer Person: „Los in 12 Min“, Verbindung mit Echtzeit, Ankunft.
 * `wall`: knapper, mit Name der Person; der Termintitel bleibt am Handy (an der Wand nur das Ziel).
 */
export function TripCard({ plan, wall }: { plan: Plan; wall?: boolean }) {
  if (wall) return <WallTripCard plan={plan} />
  return <PhoneTripCard plan={plan} />
}

/** Handy: ausführlich mit allen Fahrten */
function PhoneTripCard({ plan }: { plan: Plan }) {
  const wall = false
  const now = useNow(15_000)
  const { byId, personKey } = useMembers()
  const trip = plan.trip
  const person = personKey(plan.memberId)
  const name = byId.get(plan.memberId)?.name ?? ''
  const status =
    plan.status === 'late'
      ? { cls: 'is-late', text: 'zu spät – früher los' }
      : plan.lateMin
        ? { cls: 'is-tight', text: `${plan.lateMin} Min zu spät` }
        : plan.status === 'tight'
          ? { cls: 'is-tight', text: 'knapp' }
          : plan.status === 'none'
            ? { cls: 'is-late', text: 'keine Verbindung gefunden' }
            : { cls: 'is-ok', text: 'pünktlich da' }

  return (
    <article
      className={`hb-trip hb-person-${person} ${wall ? 'is-wall' : ''}`}
      aria-label={`Weg für ${name} nach ${plan.target.place.name}`}
    >
      <header className="hb-trip-head">
        <span className="hb-trip-event">
          {hm(plan.target.start)} · {wall ? name : plan.target.title}
        </span>
        <span className={`hb-trip-status ${status.cls}`}>{status.text}</span>
      </header>
      <span className="hb-trip-target">
        <Icon icon={MapPinned} size={16} className="shrink-0" />
        {plan.target.place.name}
      </span>
      {trip ? (
        <>
          <div className="hb-trip-leave">
            <span className="hb-trip-when">Los um {hm(trip.leaveAt)}</span>
            <span className="hb-trip-count">{countdown(Date.parse(trip.leaveAt) - now.getTime())}</span>
          </div>
          <p className="hb-trip-sub">
            {trip.walk} Min zu Fuß zur {trip.stop} · an {hm(trip.arrivalRt)}
          </p>
          <ul className="hb-legs">
            {trip.legs.map((l, i) => (
              <LegRow key={i} leg={l} />
            ))}
          </ul>
          {plan.earlier && (plan.status !== 'ok' || !wall) && (
            <p className="hb-trip-alt">
              <span className="hb-leg-icon">
                <Icon icon={TrainFront} size={15} />
              </span>
              Früher geht auch: los um {hm(plan.earlier.leaveAt)}, an {hm(plan.earlier.arrivalRt)}
            </p>
          )}
        </>
      ) : (
        <p className="hb-trip-sub">Für diesen Termin habe ich keine passende Verbindung gefunden.</p>
      )}
    </article>
  )
}

/**
 * Kopfzeile (Wand) bzw. oben auf der Startseite (Handy).
 * Handy: der eigene nächste Weg. Wand: Wege der Personen, die das wollen, ab x Minuten vor dem Losgehen.
 */
export function TransitHeader({ variant }: { variant: 'wall' | 'phone' }) {
  const data = usePlans()
  const now = useNow(15_000).getTime()
  const { me } = useMembers()
  const [assign, setAssign] = useState<Unknown | null>(null)
  if (!data) return null
  const unknown = variant === 'phone' ? data.unknown : []
  const visible = data.plans.filter((p) => {
    if (!p.trip) return variant === 'phone' && p.memberId === me.id && shownYet(p.target.start, now)
    const leave = Date.parse(p.trip.leaveAt)
    const first = p.trip.legs.find((l) => !l.walk)
    const gone = first ? Date.parse(depRt(first)) < now : leave < now
    if (gone) return false
    if (variant === 'phone') return p.memberId === me.id && leave - now < PHONE_AHEAD_MS && shownYet(p.trip.leaveAt, now)
    return data.onWall.includes(p.memberId) && leave - now <= data.wallMinutes * 60_000
  })
  if (!visible.length && !unknown.length) return null
  return (
    <div className={`hb-trip-stack ${variant === 'phone' ? 'is-phone' : ''}`}>
      {visible.map((p) => (
        <TripCard key={p.memberId + p.target.key} plan={p} wall={variant === 'wall'} />
      ))}
      {unknown.map((u) => (
        <button key={u.eventId} type="button" className="hb-trip-ask" onClick={() => setAssign(u)}>
          <Icon icon={CircleHelp} size={20} />
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="font-semibold">Wohin geht's um {hm(u.start)}?</span>
            <span className="text-label text-ink-muted">
              {u.title}
              {u.location ? ` · ${u.location}` : ''}
            </span>
          </span>
        </button>
      ))}
      {assign && <AssignSheet item={assign} onClose={() => setAssign(null)} />}
    </div>
  )
}

/**
 * Wand: kompakt und immer gleich hoch (passt in den festen Platz der Kopfzeile):
 * wer · Ziel · Uhrzeit, „Los um 7:06 · in 12 Min“, erste Bahn.
 */
function WallTripCard({ plan }: { plan: Plan }) {
  const now = useNow(15_000)
  const { byId, personKey } = useMembers()
  const trip = plan.trip
  const first = trip?.legs.find((l) => !l.walk)
  const name = byId.get(plan.memberId)?.name ?? ''
  const status =
    plan.status === 'late'
      ? { cls: 'is-late', text: 'zu spät' }
      : plan.lateMin
        ? { cls: 'is-tight', text: `${plan.lateMin} Min zu spät` }
        : plan.status === 'tight'
          ? { cls: 'is-tight', text: 'knapp' }
          : { cls: 'is-ok', text: 'pünktlich' }
  if (!trip || !first) return null
  return (
    <article
      data-kind="trip"
      className={`hb-trip hb-trip-wall hb-slot-item hb-person-${personKey(plan.memberId)}`}
      aria-label={`${name}: los um ${hm(trip.leaveAt)} nach ${plan.target.place.name}`}
    >
      <header className="hb-trip-head">
        <span className="hb-trip-event">
          {name} · {plan.target.place.name} {hm(plan.target.start)}
        </span>
        <span className={`hb-trip-status ${status.cls}`}>{status.text}</span>
      </header>
      <div className="hb-trip-leave">
        <span className="hb-trip-when">Los um {hm(trip.leaveAt)}</span>
        <span className="hb-trip-count">{countdown(Date.parse(trip.leaveAt) - now.getTime())}</span>
        {/* bei zwei Wegen untereinander: Bahn in derselben Zeile statt darunter */}
        <span className="hb-trip-inline">
          <LineChip line={first.line} product={first.product} />
          {hm(depRt(first))}
        </span>
      </div>
      <span className="hb-trip-first">
        <LineChip line={first.line} product={first.product} />
        {hm(depRt(first))} ab {first.from}
        {first.delay !== null && first.delay > 0 && <DelayBadge delay={first.delay} />}
      </span>
    </article>
  )
}
