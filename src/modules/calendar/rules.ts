// Welche Termine an einem Tag angezeigt werden. Gilt für „Termine heute“ und später die Woche.
// Die Aufräum-Regeln rechnet der Server (calendar-Function, tidy), mit allen Kalendern –
// so stimmen sie auch im Besuchsmodus. Hier wird nur noch nach Tag gefiltert und sortiert.
import { addDays, berlinMidnightISO } from '../../lib/time'
import type { CalendarEvent } from './useCalendar'

/** Termine an einem Berliner Tag: ganztägige zuerst, dann nach Uhrzeit */
export function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  const from = berlinMidnightISO(day)
  const to = berlinMidnightISO(addDays(day, 1))
  return events
    .filter((e) => (e.allDay ? e.start <= day && e.end > day && !e.skipDays?.includes(day) : e.start < to && e.end > from))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
}
