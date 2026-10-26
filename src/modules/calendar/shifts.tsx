// Schichten (docs/schichtplan-sync.md, Teil 1–2, 26.10.2026): Einträge aus Kalendern der Art „schicht“ (z. B. Levionas
// „Arbeit, Schichten“) erscheinen nicht als Termine, sondern als schmale Zeile oben im Tag: Symbol, Person, Art, Uhrzeit.
// Die Art (shift_types) ordnet der Server zu (calendar-Function), hier wird nur angezeigt.
import {
  BookOpen,
  Briefcase,
  Coffee,
  GraduationCap,
  Moon,
  Plane,
  Stethoscope,
  Sun,
  Sunrise,
  Sunset,
  TreePalm,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { addDays, berlinMidnightISO, berlinTime } from '../../lib/time'
import type { CalendarEvent } from './useCalendar'

/** Symbole für Schicht-Arten (Auswahl in Alle Funktionen → Kalender → Schicht-Arten) */
export const SHIFT_ICONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'sunrise', label: 'Früh', icon: Sunrise },
  { id: 'sun', label: 'Tag', icon: Sun },
  { id: 'sunset', label: 'Spät', icon: Sunset },
  { id: 'moon', label: 'Nacht', icon: Moon },
  { id: 'graduation-cap', label: 'Schule', icon: GraduationCap },
  { id: 'book-open', label: 'Lernen', icon: BookOpen },
  { id: 'stethoscope', label: 'Klinik', icon: Stethoscope },
  { id: 'briefcase', label: 'Dienst', icon: Briefcase },
  { id: 'coffee', label: 'Bereitschaft', icon: Coffee },
  { id: 'tree-palm', label: 'Frei', icon: TreePalm },
  { id: 'plane', label: 'Urlaub', icon: Plane },
]

export function shiftIcon(id: string | undefined): LucideIcon {
  // „palm-tree“ ist der alte Lucide-Name
  const key = id === 'palm-tree' ? 'tree-palm' : id
  return SHIFT_ICONS.find((s) => s.id === key)?.icon ?? Briefcase
}

const hhmm = (iso: string) => {
  const { hh, mm } = berlinTime(new Date(iso))
  return `${hh}:${mm}`
}

/** kurz für schmale Spalten: „8“, „15:15“ */
const short = (iso: string) => {
  const { hh, mm } = berlinTime(new Date(iso))
  return mm === '00' ? String(Number(hh)) : `${Number(hh)}:${mm}`
}

/**
 * Uhrzeit der Schicht an diesem Tag: „08:00–15:15“ (kurz: „8–15:15“), über Mitternacht „ab 22:00“ bzw. „bis 06:00“,
 * ganztags leer.
 */
export function shiftTime(e: CalendarEvent, day: string, compact = false): string {
  if (e.allDay) return ''
  const t = compact ? short : hhmm
  const startsBefore = e.start < berlinMidnightISO(day)
  const endsAfter = e.end > berlinMidnightISO(addDays(day, 1))
  if (startsBefore && endsAfter) return ''
  if (startsBefore) return `bis ${t(e.end)}`
  if (endsAfter) return `ab ${t(e.start)}`
  return `${t(e.start)}–${t(e.end)}`
}

/** Name der Schicht: Art aus shift_types, unbekannt = Originaltitel */
export const shiftName = (e: CalendarEvent) => e.shift?.label ?? (e.title || 'Schicht')

/** Schichten von den übrigen Terminen trennen; `free: false` lässt „frei“ ganz weg (Termine-Kachel) */
export function splitShifts(events: CalendarEvent[], { free }: { free: boolean }): { shifts: CalendarEvent[]; rest: CalendarEvent[] } {
  const shifts = events.filter((e) => e.shift && (free || !e.shift.free))
  return { shifts, rest: events.filter((e) => !e.shift) }
}

/** Ohne „frei“-Einträge (für Ansichten, in denen ein freier Tag nicht extra auftaucht) */
export const withoutFree = (events: CalendarEvent[]) => events.filter((e) => !e.shift?.free)

/** Zeitplan: Schichten stehen oben bei den ganztägigen Einträgen, nicht als Block über dem Tag */
export const isTopRow = (e: CalendarEvent) => e.allDay || !!e.shift

/** Farben der Zeile aus der Kalenderfarbe (blue/berry = Personenfarben, sonst cal-*) */
function tone(color: string | undefined): CSSProperties {
  const base = color === 'blue' ? 'person-a' : color === 'berry' || !color ? 'person-b' : `cal-${color}`
  return { '--sh-bar': `var(--${base})`, '--sh-soft': `var(--${base}-soft)`, '--sh-ink': `var(--${base}-ink)` } as CSSProperties
}

/**
 * Schmale Schicht-Zeile: Symbol · Leviona · Schule 08:00–15:15. Freie Tage als kleines „frei“.
 * Die Farbe ist die des Kalenders; die Art steht immer als Symbol und Wort daneben (Farbe nie allein).
 */
export function ShiftLine({ e, day, wall, compact }: { e: CalendarEvent; day: string; wall?: boolean; compact?: boolean }) {
  const name = shiftName(e)
  const time = shiftTime(e, day, compact)
  const who = e.who ?? ''
  const text = [who, [name, time].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  if (e.shift?.free)
    return (
      <span className="hb-shift-free" style={tone(e.color)} title={text}>
        <Icon icon={shiftIcon(e.shift.icon)} size={13} />
        {who ? `${who} frei` : 'frei'}
      </span>
    )
  return (
    <div className={`hb-shift-line ${wall ? 'is-wall' : ''} ${compact ? 'is-compact' : ''}`} style={tone(e.color)} title={text}>
      <Icon icon={shiftIcon(e.shift?.icon)} size={wall ? 17 : 15} label={name} />
      {who && !compact && <span className="hb-shift-who">{who}</span>}
      <span className="min-w-0 truncate">
        <b>{name}</b>
        {time && <span className="hb-shift-time"> {time}</span>}
      </span>
    </div>
  )
}
