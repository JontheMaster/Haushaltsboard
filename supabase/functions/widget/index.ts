// Daten fürs Handy-Widget (Scriptable am iPhone, KWGT an Android).
//   GET ?t=<geheimer Link aus widget_tokens> → kompakte Übersicht für diese Person (nur lesen),
//   inkl. nächstem Weg aus dem Kalender (rechnet transit jede Minute vor, Tabelle transit_plans)
// Kein Login: das Widget kann sich nicht anmelden. Der Link ist pro Person und lässt sich in der App erneuern.
import { addDays, berlinDay, eventsOnDay, loadEvents, type CalendarEvent } from '../_shared/calendar.ts'
import { getItems } from '../_shared/bring.ts'
import { adminClient, corsHeaders } from '../_shared/http.ts'

const db = adminClient()
const WEATHER =
  'https://api.open-meteo.com/v1/forecast?latitude=49.45&longitude=11.08' +
  '&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
  '&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Europe%2FBerlin&forecast_days=2'

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

function reply(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function weather() {
  try {
    const r = await fetch(WEATHER, { signal: AbortSignal.timeout(6000) })
    const d = await r.json()
    // die nächsten Stunden in 2-Stunden-Schritten (füllt das Widget, wenn wenig ansteht)
    const nowHour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .format(new Date())
      .replace(', ', 'T')
    const start = (d.hourly.time as string[]).findIndex((t) => t.slice(0, 13) >= nowHour)
    const hours = start < 0 ? [] : [2, 4, 6, 8, 10].map((o) => start + o).filter((i) => i < d.hourly.time.length).map((i) => ({
      hour: Number(String(d.hourly.time[i]).slice(11, 13)),
      temp: Math.round(d.hourly.temperature_2m[i]),
      code: d.hourly.weather_code[i],
      isDay: d.hourly.is_day[i] === 1,
      rain: d.hourly.precipitation_probability[i] ?? 0,
    }))
    return {
      hours,
      temp: Math.round(d.current.temperature_2m),
      code: d.current.weather_code,
      isDay: d.current.is_day === 1,
      max: Math.round(d.daily.temperature_2m_max[0]),
      min: Math.round(d.daily.temperature_2m_min[0]),
      tomorrow: { max: Math.round(d.daily.temperature_2m_max[1]), min: Math.round(d.daily.temperature_2m_min[1]), code: d.daily.weather_code[1] },
    }
  } catch {
    return null
  }
}

/** Termine dieser Person (eigene Kalender) ab jetzt: heute noch Kommendes/Laufendes, sonst morgen */
function upcoming(events: CalendarEvent[], name: string, today: string) {
  const mine = events.filter((e) => !e.who || e.who === name)
  const now = Date.now()
  const shape = (e: CalendarEvent, day: string) => ({
    day,
    title: e.title,
    allDay: e.allDay,
    time: e.allDay ? null : hhmm(e.start),
    end: e.allDay ? null : hhmm(e.end),
    // für den live mitlaufenden Countdown im Widget
    startIso: e.allDay ? null : e.start,
    endIso: e.allDay ? null : e.end,
    now: !e.allDay && Date.parse(e.start) <= now && Date.parse(e.end) > now,
  })
  const todayList = eventsOnDay(mine, today)
    .filter((e) => e.allDay || Date.parse(e.end) > now)
    .map((e) => shape(e, today))
  const tomorrow = addDays(today, 1)
  const tomorrowList = eventsOnDay(mine, tomorrow).map((e) => shape(e, tomorrow))
  return { today: todayList, tomorrow: tomorrowList }
}

type Leg = { walk: boolean; line: string; product: string; from: string; dep: string; delay: number | null; minutes?: number }
type PlanRow = {
  target: { title: string; start: string; place: { name: string } }
  trip: { leaveAt: string; stop: string; walk: number; legs: Leg[]; arrivalRt: string } | null
  status: 'ok' | 'tight' | 'late' | 'none'
  lateMin: number
}

/** Nächster Weg fürs Widget: wann los, womit, wohin. Nur wenn transit ihn gerade (< 10 Min) gerechnet hat. */
function tripOf(row: { plan: PlanRow | null; updated_at: string } | null) {
  if (!row?.plan || Date.now() - Date.parse(row.updated_at) > 10 * 60_000) return null
  const { target, trip, status, lateMin } = row.plan
  const rides = trip ? trip.legs.filter((l) => !l.walk) : []
  const first = rides[0]
  const depRt = first ? new Date(Date.parse(first.dep) + (first.delay ?? 0) * 60_000).toISOString() : null
  return {
    title: target.title,
    start: target.start,
    startTime: hhmm(target.start),
    place: target.place.name,
    status,
    lateMin,
    leaveAt: trip?.leaveAt ?? null,
    leaveTime: trip ? hhmm(trip.leaveAt) : null,
    arrival: trip ? hhmm(trip.arrivalRt) : null,
    walk: trip?.walk ?? null,
    line: first?.line ?? null,
    product: first?.product ?? null,
    from: first?.from ?? trip?.stop ?? null,
    dep: depRt,
    depTime: depRt ? hhmm(depRt) : null,
    delay: first?.delay ?? null,
    changes: Math.max(0, rides.length - 1),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{48}$/.test(token)) return reply(req, { error: 'Link ungültig' }, 401)

  try {
    const { data: link } = await db.from('widget_tokens').select('member_id').eq('token', token).maybeSingle()
    if (!link) return reply(req, { error: 'Link ungültig oder erneuert' }, 401)
    const { data: me } = await db.from('members').select('id, name, color').eq('id', link.member_id).single()
    if (!me) return reply(req, { error: 'Unbekannt' }, 401)

    const today = berlinDay(new Date())
    // alles weglassen, was die Person nicht betrifft: eigene oder offene Aufgaben, die heute oder früher fällig sind
    const [wx, cal, { data: todos }, { data: chores }, { data: meals }, { data: planRow }, { data: timers }, shopping] = await Promise.all([
      weather(),
      loadEvents({ all: true }).catch(() => null),
      db.from('todos').select('title, assignee, due_date, moved_since').is('done_at', null).lte('due_date', today).or(`assignee.eq.${me.id},assignee.is.null`).order('due_date'),
      db.from('chore_tasks').select('assignee, due_date, chore_rules(title, active)').is('done_at', null).lte('due_date', today).or(`assignee.eq.${me.id},assignee.is.null`).order('due_date'),
      db.from('meals').select('title, start_time, day').eq('day', today).order('start_time', { nullsFirst: false }),
      db.from('transit_plans').select('plan, updated_at').eq('member_id', me.id).maybeSingle(),
      // laufende Timer (z. B. Waschmaschine) und die Einkaufsliste: füllen das Widget, wenn wenig ansteht
      db.from('timers').select('label, started_at, ends_at').is('finished_at', null).is('cancelled_at', null).gt('ends_at', new Date().toISOString()).order('ends_at'),
      Promise.race([getItems(), new Promise<null>((r) => setTimeout(() => r(null), 4000))]).catch(() => null),
    ])

    const choreItems = (chores ?? [])
      .filter((c) => (c.chore_rules as { active?: boolean } | null)?.active !== false)
      .map((c) => ({ title: (c.chore_rules as { title?: string } | null)?.title ?? 'Putzen', open: !c.assignee, chore: true, late: c.due_date < today }))
    // pro Putz-Regel nur einmal (wie auf dem Board)
    const seen = new Set<string>()
    const choresUnique = choreItems.filter((c) => (seen.has(c.title) ? false : (seen.add(c.title), true)))
    const todoItems = (todos ?? []).map((t) => ({ title: t.title, open: !t.assignee, chore: false, late: !!t.moved_since || (t.due_date ?? today) < today }))
    const items = [...todoItems, ...choresUnique]

    const nowHHMM = hhmm(new Date().toISOString())
    const meal = (meals ?? []).find((m) => !m.start_time || m.start_time.slice(0, 5) >= addMinutes(nowHHMM, -60)) ?? null

    return reply(req, {
      name: me.name,
      color: me.color,
      today,
      updated: new Date().toISOString(),
      weather: wx,
      events: cal ? upcoming(cal.events, me.name, today) : null,
      todos: { count: items.length, items: items.slice(0, 6) },
      meal: meal ? { title: meal.title, time: meal.start_time ? meal.start_time.slice(0, 5) : null } : null,
      trip: tripOf(planRow as { plan: PlanRow | null; updated_at: string } | null),
      timers: (timers ?? []).map((t) => ({ label: t.label, startIso: t.started_at, endIso: t.ends_at, end: hhmm(t.ends_at) })),
      shopping: shopping ? { count: shopping.items.length, items: shopping.items.slice(0, 4).map((i) => i.name) } : null,
    })
  } catch (e) {
    console.error(e)
    return reply(req, { error: 'Gerade nicht erreichbar' }, 500)
  }
})

/** „HH:MM“ plus Minuten (für „Essen noch dran?“), ohne Tageswechsel */
function addMinutes(t: string, min: number): string {
  const total = Math.max(0, Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + min)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
