import type { PersonKey } from '../lib/members'

type Props = {
  person: PersonKey
  time: string
  title: string
  /** Kalender und Person, damit Farbe nie allein steht, z. B. „Jonathan · Uni“ */
  meta?: string
  next?: boolean
  past?: boolean
  compact?: boolean
  delay?: number
}

// Termin: farbiger Balken links, Fläche in Personenfarbe.
// Oben Zeit und Kalender, darunter der Titel über die volle Breite (passt auch in schmale Kacheln).
export function EventPill({ person, time, title, meta, next, past, compact, delay = 0 }: Props) {
  const cls = ['hb-event', `hb-person-${person}`, next && 'is-next', past && 'is-past', compact && 'hb-event-compact']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} style={{ animationDelay: `${delay}ms` }}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="hb-event-head">
          <span className="hb-event-time">{time}</span>
          {meta && <span className="hb-event-meta">{meta}</span>}
        </span>
        <span className="hb-event-title">{title}</span>
      </span>
    </div>
  )
}
