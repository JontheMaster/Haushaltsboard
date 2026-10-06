import type { PersonKey } from '../lib/members'
import { shortenTitle } from '../modules/calendar/shorten'
import { Icon } from './Icon'

type Props = {
  person: PersonKey
  /** Kalenderfarbe (cal-*); ohne Angabe gilt die Personenfarbe */
  color?: string
  time: string
  title: string
  /** Kalender und Person, damit Farbe nie allein steht, z. B. „Jonathan · Uni“ */
  meta?: string
  next?: boolean
  past?: boolean
  compact?: boolean
  /** Wochenansicht: kleine Schrift, Titel bis drei Zeilen */
  week?: boolean
  delay?: number
}

// Termin: farbiger Balken links, Fläche in Personenfarbe.
// Oben Zeit und Kalender, darunter der Titel über die volle Breite (passt auch in schmale Kacheln).
export function EventPill({ person, color, time, title, meta, next, past, compact, week, delay = 0 }: Props) {
  // blue und berry sind die Personenfarben, alle anderen eigene Kalenderfarben
  const tone =
    color === 'blue' ? 'hb-person-a' : color === 'berry' ? 'hb-person-b' : color ? `hb-cal-${color}` : `hb-person-${person}`
  // Gekürzter Titel; das Icon steht oben neben der Uhrzeit, damit der Titel die ganze Breite hat
  const short = shortenTitle(title)
  const cls = ['hb-event', tone, next && 'is-next', past && 'is-past', compact && 'hb-event-compact', week && 'hb-event-week']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} style={{ animationDelay: `${delay}ms` }}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="hb-event-head">
          <span className="hb-event-time">{time}</span>
          {short.icon && <Icon icon={short.icon} size={16} label={short.label} className="hb-event-kind" />}
          {meta && <span className="hb-event-meta">{meta}</span>}
        </span>
        <span className="hb-event-title" title={title}>
          {short.text}
        </span>
      </span>
    </div>
  )
}
