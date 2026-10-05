// Termine aller Kalender für heute und die nächsten 7 Tage (Europe/Berlin).
// iCal-Adressen liegen als Secrets ICAL_<ID> vor. Im Besuchsmodus fehlen versteckte Kalender ganz.
import ICAL from 'npm:ical.js@2'
import { adminClient, corsHeaders, json, requireMember } from '../_shared/http.ts'

const TZ = 'Europe/Berlin'
const DAYS = 8
const CACHE_MS = 4 * 60 * 1000

type CalendarEvent = {
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
}

const db = adminClient()
const cache = new Map<string, { at: number; text: string }>()

// ───────── Datum in Berlin ─────────

function berlinDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Mitternacht eines Berliner Tages als UTC-Millisekunden
function berlinMidnight(day: string): number {
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
      out.push({ id: `${item.uid}_${s}`, calendar, person, title: (item.summary ?? '').trim(), start: s, end: e > s ? e : addDays(s, 1), allDay })
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

// ───────── Handler ─────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'GET') return json(req, { error: 'Methode nicht erlaubt' }, 405)

  const denied = await requireMember(req)
  if (denied) return denied

  const [{ data: settings }, { data: calendars }, { data: members }] = await Promise.all([
    db.from('settings').select('visit_mode').eq('id', 1).single(),
    db.from('calendars').select('id, owner, label, hide_in_visit, color'),
    db.from('members').select('id, name, color'),
  ])
  const visitMode = settings?.visit_mode ?? false
  const memberOf = new Map((members ?? []).map((m) => [m.id, m]))
  const visible = (calendars ?? []).filter((c) => !(visitMode && c.hide_in_visit))

  const fromDay = berlinDay(new Date())
  const toDay = addDays(fromDay, DAYS)

  const errors: string[] = []
  const results = await Promise.all(
    visible.map(async (c) => {
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
        errors.push(c.id)
        return []
      }
    }),
  )

  const events = results.flat().sort((a, b) => a.start.localeCompare(b.start))
  return json(req, { from: fromDay, to: toDay, visitMode, events, errors })
})
