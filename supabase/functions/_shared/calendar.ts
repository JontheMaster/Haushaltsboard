// Termine aller Kalender laden und aufräumen. Genutzt von den Functions `calendar` (Board), `alexa` und `transit`.
// iCal-Adressen liegen als Secrets ICAL_<ID> vor. Versteckte Kalender verlassen den Server nie.
import ICAL from 'npm:ical.js@2'
import { adminClient } from './http.ts'

const TZ = 'Europe/Berlin'
/** Zeitraum: diese und nächste Woche (für die Wochenansicht) */
const WEEKS = 2
const CACHE_MS = 4 * 60 * 1000

export type CalendarEvent = {
  id: string
  calendar: string
  person: string | null
  title: string
  start: string // ISO-Zeitpunkt, bei ganztägig YYYY-MM-DD
  end: string // exklusiv
  allDay: boolean
  /** Name des Kalenders, z. B. „Uni“ */
  label?: string
  /** Name der Person, z. B. „Jonathan“ */
  who?: string | null
  /** Verschwindet im Besuchsmodus (damit das Board beim Einschalten sofort ausblenden kann) */
  hideInVisit?: boolean
  /** Farbe des Kalenders (Token cal-*, blue = person-a, berry = person-b) */
  color?: string
  /** Tage (YYYY-MM-DD), an denen dieser Ganztags-Eintrag nicht angezeigt wird (siehe tidy) */
  skipDays?: string[]
  /** Feld „Ort“ aus dem Kalender (für Abfahrten), falls gesetzt */
  location?: string
}

// ───────── Aufräumen ─────────

/** Ganztägige Einträge, die länger dauern, sind Zeiträume (z. B. „Bachelor Thesis“) und keine Termine */
const MAX_SPAN_DAYS = 14

function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/**
 * Regeln, mit ALLEN Kalendern gerechnet (auch denen, die im Besuchsmodus verschwinden):
 * 1. Ganztags-Zeiträume über 14 Tage fallen weg.
 * 2. Ein mehrtägiger Ganztags-Eintrag fällt an Tagen weg, an denen ein Termin mit Uhrzeit aus demselben
 *    Kalender liegt oder einer, dessen Titel mit dem Kalendernamen beginnt („Uni - Livestream“).
 */
function tidy(events: CalendarEvent[], fromDay: string, toDay: string): CalendarEvent[] {
  const timed = events.filter((e) => !e.allDay)
  const out: CalendarEvent[] = []
  for (const e of events) {
    if (!e.allDay) {
      out.push(e)
      continue
    }
    const span = daysBetween(e.start, e.end)
    if (span > MAX_SPAN_DAYS) continue
    if (span > 1) {
      const prefix = e.label?.toLowerCase()
      const skipDays: string[] = []
      for (let d = e.start < fromDay ? fromDay : e.start; d < e.end && d < toDay; d = addDays(d, 1)) {
        const from = berlinMidnight(d)
        const to = berlinMidnight(addDays(d, 1))
        const covered = timed.some(
          (t) =>
            Date.parse(t.start) < to &&
            Date.parse(t.end) > from &&
            (t.calendar === e.calendar || (!!prefix && t.title.toLowerCase().startsWith(prefix))),
        )
        if (covered) skipDays.push(d)
      }
      if (skipDays.length) e.skipDays = skipDays
    }
    out.push(e)
  }
  return out
}

const db = adminClient()
const cache = new Map<string, { at: number; text: string }>()

// ───────── Datum in Berlin ─────────

export function berlinDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Montag der Woche, in der der Tag liegt */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 0 = Mo
  return addDays(day, -weekday)
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Mitternacht eines Berliner Tages als UTC-Millisekunden
export function berlinMidnight(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(guess))
    .find((p) => p.type === 'timeZoneName')!.value // z. B. „GMT+02:00“
  const match = name.match(/([+-])(\d{2}):(\d{2})/)
  const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60000 : 0
  return guess - offset
}

// ───────── iCal ─────────

async function loadIcs(id: string): Promise<string> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text

  const url = Deno.env.get(`ICAL_${id.toUpperCase()}`)
  if (!url) throw new Error(`Secret ICAL_${id.toUpperCase()} fehlt`)
  const resp = await fetch(url.replace(/^webcal:/, 'https:'))
  if (!resp.ok) throw new Error(`${id}: HTTP ${resp.status}`)
  const text = await resp.text()
  cache.set(id, { at: Date.now(), text })
  return text
}

/** Ort des Termins, ohne Leerraum; leer = weglassen */
function where(item: ICAL.Event): { location?: string } {
  const loc = (item.location ?? '').replace(/\s+/g, ' ').trim()
  return loc ? { location: loc } : {}
}

function expand(ics: string, calendar: string, person: string | null, fromDay: string, toDay: string): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics))
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz)

  const fromMs = berlinMidnight(fromDay)
  const toMs = berlinMidnight(toDay)
  const out: CalendarEvent[] = []

  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const v of root.getAllSubcomponents('vevent')) {
    const e = new ICAL.Event(v)
    if (e.isRecurrenceException()) exceptions.push(e)
    else masters.set(e.uid, e)
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex)

  const push = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return
    const allDay = start.isDate
    if (allDay) {
      const s = start.toString().slice(0, 10)
      const e = end.toString().slice(0, 10)
      if (s >= toDay || (e > s ? e : addDays(s, 1)) <= fromDay) return
      out.push({ id: `${item.uid}_${s}`, calendar, person, title: (item.summary ?? '').trim(), start: s, end: e > s ? e : addDays(s, 1), allDay, ...where(item) })
    } else {
      const s = start.toJSDate().getTime()
      const e = end.toJSDate().getTime()
      if (s >= toMs || e <= fromMs) return
      out.push({
        id: `${item.uid}_${s}`,
        calendar,
        person,
        title: (item.summary ?? '').trim(),
        start: new Date(s).toISOString(),
        end: new Date(Math.max(e, s)).toISOString(),
        allDay,
        ...where(item),
      })
    }
  }

  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate ?? ev.startDate)
      continue
    }
    const it = ev.iterator()
    let next: ICAL.Time | null
    let guard = 0
    while ((next = it.next()) && guard++ < 50000) {
      if (next.toJSDate().getTime() >= toMs + 86400000) break
      const d = ev.getOccurrenceDetails(next)
      push(d.item, d.startDate, d.endDate)
    }
  }
  return out
}

// ───────── Laden ─────────

/**
 * Termine von Montag dieser Woche bis Sonntag nächster Woche.
 * `hideAlways`: Kalender mit „im Besuchsmodus ausblenden“ immer weglassen (z. B. beim Vorlesen durch Alexa).
 * `all`: nichts weglassen, auch nicht im Besuchsmodus (nur für Auswertungen auf dem Server, z. B. Abfahrten).
 */
export async function loadEvents({ hideAlways = false, all = false } = {}) {
  const [{ data: settings }, { data: calendars }, { data: members }] = await Promise.all([
    db.from('settings').select('visit_mode').eq('id', 1).single(),
    db.from('calendars').select('id, owner, label, hide_in_visit, color'),
    db.from('members').select('id, name, color'),
  ])
  const visitMode = settings?.visit_mode ?? false
  const memberOf = new Map((members ?? []).map((m) => [m.id, m]))
  // Immer alle Kalender laden: die Aufräum-Regeln brauchen auch die versteckten.
  // Weggelassen wird erst ganz am Ende, so verlässt nichts Verstecktes den Server.
  const hidden = new Set((calendars ?? []).filter((c) => !all && (visitMode || hideAlways) && c.hide_in_visit).map((c) => c.id))

  const fromDay = mondayOf(berlinDay(new Date()))
  const toDay = addDays(fromDay, 7 * WEEKS)

  const errors: string[] = []
  const results = await Promise.all(
    (calendars ?? []).map(async (c) => {
      try {
        const owner = c.owner ? memberOf.get(c.owner) : undefined
        return expand(await loadIcs(c.id), c.id, owner?.color ?? null, fromDay, toDay).map((e) => ({
          ...e,
          label: c.label,
          who: owner?.name ?? null,
          hideInVisit: c.hide_in_visit,
          color: c.color,
        }))
      } catch (e) {
        console.error(c.id, e)
        if (!hidden.has(c.id)) errors.push(c.id)
        return []
      }
    }),
  )

  const events = tidy(results.flat(), fromDay, toDay)
    .filter((e) => !hidden.has(e.calendar))
    .sort((a, b) => a.start.localeCompare(b.start))
  return { from: fromDay, to: toDay, visitMode, events, errors }
}

/** Termine eines Tages (Ganztags-Einträge ohne die per tidy ausgeblendeten Tage) */
export function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  const from = berlinMidnight(day)
  const to = berlinMidnight(addDays(day, 1))
  return events
    .filter((e) =>
      e.allDay ? e.start <= day && e.end > day && !e.skipDays?.includes(day) : Date.parse(e.start) < to && Date.parse(e.end) > from,
    )
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
}
