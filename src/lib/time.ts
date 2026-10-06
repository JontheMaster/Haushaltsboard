// „Heute“ und alle Anzeigen immer in Europe/Berlin, egal wo das Gerät steht
import { useEffect, useState } from 'react'

const TZ = 'Europe/Berlin'

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const longDateFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** Berliner Datum als YYYY-MM-DD */
export function berlinDay(d = new Date()): string {
  return dayFmt.format(d)
}

/** Berliner Uhrzeit als YYYY-MM-DDTHH:MM, vergleichbar mit Open-Meteo-Zeiten */
export function berlinStamp(d = new Date()): string {
  const [hh, mm] = timeFmt.format(d).split(':')
  return `${berlinDay(d)}T${hh}:${mm}`
}

export function berlinTime(d = new Date()): { hh: string; mm: string } {
  const [hh, mm] = timeFmt.format(d).split(':')
  return { hh, mm }
}

/** „Montag, 5. Oktober“ */
export function longDate(d = new Date()): string {
  return longDateFmt.format(d)
}

/** „Mo 5. Oktober“ (Handy-Kopfzeile) */
export function shortDate(d = new Date()): string {
  const day = berlinDay(d)
  const month = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, month: 'long' }).format(d)
  return `${weekdayShort(day)} ${Number(day.slice(8))}. ${month}`
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Montag der Woche, in der der Tag liegt */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 0 = Mo
  return addDays(day, -weekday)
}

/** „Mo 6.“ */
export function dayLabel(day: string): string {
  return `${weekdayShort(day)} ${Number(day.slice(8))}.`
}

/** „Mo“, „Di“ … für ein YYYY-MM-DD */
export function weekdayShort(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** Mitternacht eines Berliner Tages als UTC-Zeitpunkt (ISO) */
export function berlinMidnightISO(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
      .formatToParts(new Date(guess))
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = name.match(/([+-])(\d{2}):(\d{2})/)
  const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60000 : 0
  return new Date(guess - offset).toISOString()
}

/** Aktuelle Zeit, neu alle `everyMs` Millisekunden (auf die volle Sekunde ausgerichtet) */
export function useNow(everyMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    const align = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), everyMs)
    }, 1000 - (Date.now() % 1000))
    return () => {
      clearTimeout(align)
      clearInterval(interval)
    }
  }, [everyMs])
  return now
}

/** Berliner Datum, wechselt automatisch um Mitternacht */
export function useToday(): string {
  const now = useNow(30_000)
  return berlinDay(now)
}
