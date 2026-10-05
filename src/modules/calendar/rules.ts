// Welche Termine an einem Tag angezeigt werden. Gilt für „Termine heute“ und später die Woche.
import { addDays, berlinMidnightISO } from '../../lib/time'
import type { CalendarEvent } from './useCalendar'

/** Ganztägige Einträge, die länger dauern, sind Zeiträume (z. B. „Bachelor Thesis“) und keine Termine */
const MAX_SPAN_DAYS = 14

function spanDays(e: CalendarEvent): number {
  const [y1, m1, d1] = e.start.split('-').map(Number)
  const [y2, m2, d2] = e.end.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/**
 * Termine an einem Berliner Tag, aufgeräumt:
 * 1. Ganztägige Zeiträume über 14 Tage fallen weg.
 * 2. Ein mehrtägiger Ganztags-Eintrag fällt an einem Tag weg, wenn es dort einen Termin mit Uhrzeit
 *    aus demselben Kalender gibt oder einen, dessen Titel mit dem Kalendernamen beginnt
 *    (Uni-Phase „Medien und …“ + „Uni - Livestream“ → nur der Livestream).
 * Sortiert: ganztägige zuerst, dann nach Uhrzeit.
 */
export function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  const from = berlinMidnightISO(day)
  const to = berlinMidnightISO(addDays(day, 1))
  const onDay = events.filter((e) => (e.allDay ? e.start <= day && e.end > day : e.start < to && e.end > from))
  const timed = onDay.filter((e) => !e.allDay)

  return onDay
    .filter((e) => {
      if (!e.allDay) return true
      const span = spanDays(e)
      if (span > MAX_SPAN_DAYS) return false
      if (span > 1) {
        const prefix = e.label?.toLowerCase()
        const covered = timed.some(
          (t) => t.calendar === e.calendar || (!!prefix && t.title.toLowerCase().startsWith(prefix)),
        )
        if (covered) return false
      }
      return true
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
}
