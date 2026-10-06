import type { PersonKey } from '../lib/members'
import { useRef } from 'react'
import { shortenTitle, titleVariants, useFitLevel, VariantText, type TitleVariant } from '../modules/calendar/shorten'
import { Icon } from './Icon'

type Props = {
  person: PersonKey
  /** Kalenderfarbe (cal-*); ohne Angabe gilt die Personenfarbe */
  color?: string
  time: string
  title: string
  /** Kalender und Person, damit Farbe nie allein steht, z. B. „Jonathan · Uni“ */
  meta?: string
  /** läuft gerade: Fortschritt 0–1 und Endzeit */
  live?: { progress: number; until: string }
  /** beginnt bald, z. B. „in 40 Min“ */
  soon?: string
  past?: boolean
  compact?: boolean
  /** Wochenansicht: kleine Schrift, Titel bis drei Zeilen */
  week?: boolean
  delay?: number
}

// Termin: farbiger Balken links, Fläche in Personenfarbe.
// Oben Zeit und Kalender, darunter der Titel über die volle Breite (passt auch in schmale Kacheln).
export function EventPill({ person, color, time, title, meta, live, soon, past, compact, week, delay = 0 }: Props) {
  // blue und berry sind die Personenfarben, alle anderen eigene Kalenderfarben
  const tone =
    color === 'blue' ? 'hb-person-a' : color === 'berry' ? 'hb-person-b' : color ? `hb-cal-${color}` : `hb-person-${person}`
  // Gekürzter Titel; das Icon steht oben neben der Uhrzeit, damit der Titel die ganze Breite hat
  const short = shortenTitle(title)
  // Woche (schmale Spalten): kürzere Fassung, wenn ein Wort nicht in die Breite passt
  const titleRef = useRef<HTMLSpanElement>(null)
  const variants: TitleVariant[] = week ? titleVariants(title).filter((v) => v.text) : [short]
  const fit = variants[useFitLevel(titleRef, variants.length, title)]
  const icon = week && fit.icon ? fit.icon : short.icon
  const cls = ['hb-event', tone, live && 'is-live', past && 'is-past', compact && 'hb-event-compact', week && 'hb-event-week']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} style={{ animationDelay: `${delay}ms` }}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="hb-event-head">
          {live ? (
            <span className="hb-event-time">
              <span className="hb-live-dot" aria-hidden="true" />
              {/* in schmalen Wochenspalten reicht „Jetzt“, das Ende zeigt der Balken */}
              {week ? 'Jetzt' : `Jetzt · bis ${live.until}`}
            </span>
          ) : (
            <span className="hb-event-time">{time}</span>
          )}
          {soon && <span className="hb-event-soon">{soon}</span>}
          {icon && <Icon icon={icon} size={16} label={short.label ?? fit.label} className="hb-event-kind" />}
          {meta && <span className="hb-event-meta">{meta}</span>}
        </span>
        <span ref={titleRef} className="hb-event-title" title={title}>
          <VariantText v={{ text: fit.text, small: fit.small }} />
        </span>
      </span>
      {live && <span className="hb-event-progress" style={{ width: `${Math.round(live.progress * 100)}%` }} aria-hidden="true" />}
    </div>
  )
}
