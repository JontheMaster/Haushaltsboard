// Läuft ein Termin gerade, oder ist er als Nächstes dran? Für die Hervorhebung in Liste und Woche.
import { berlinTime } from '../../lib/time'
import type { CalendarEvent } from './useCalendar'

export type Live = { progress: number; until: string }

/** Läuft gerade: Anteil, der schon vorbei ist (0–1), und Endzeit */
export function liveInfo(e: CalendarEvent, now: Date): Live | undefined {
  if (e.allDay) return undefined
  const start = Date.parse(e.start)
  const end = Date.parse(e.end)
  const t = now.getTime()
  if (t < start || t >= end) return undefined
  const { hh, mm } = berlinTime(new Date(end))
  const endsToday = new Date(end).toDateString() === now.toDateString()
  return { progress: (t - start) / (end - start), until: endsToday ? `${hh}:${mm}` : `morgen ${hh}:${mm}` }
}

/** Beginnt bald (innerhalb von 2 Stunden): „in 40 Min“, „in 1 Std 20“ */
export function soonLabel(e: CalendarEvent, now: Date): string | undefined {
  if (e.allDay) return undefined
  const mins = Math.round((Date.parse(e.start) - now.getTime()) / 60000)
  if (mins <= 0 || mins > 120) return undefined
  if (mins < 60) return `in ${mins} Min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `in ${h} Std ${m}` : `in ${h} Std`
}
