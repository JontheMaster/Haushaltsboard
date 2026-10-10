// Daten fürs Handy-Widget (Scriptable am iPhone, KWGT an Android).
//   GET ?t=<geheimer Link aus widget_tokens> → kompakte Übersicht für diese Person (nur lesen)
// Kein Login: das Widget kann sich nicht anmelden. Der Link ist pro Person und lässt sich in der App erneuern.
import { addDays, berlinDay, eventsOnDay, loadEvents, type CalendarEvent } from '../_shared/calendar.ts'
import { adminClient, corsHeaders } from '../_shared/http.ts'

const db = adminClient()
const WEATHER =
  'https://api.open-meteo.com/v1/forecast?latitude=49.45&longitude=11.08' +
  '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FBerlin&forecast_days=1'

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
    return { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code, isDay: d.current.is_day === 1, max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]) }
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
    now: !e.allDay && Date.parse(e.start) <= now && Date.parse(e.end) > now,
  })
  const todayList = eventsOnDay(mine, today)
    .filter((e) => e.allDay || Date.parse(e.end) > now)
    .map((e) => shape(e, today))
  const tomorrow = addDays(today, 1)
  const tomorrowList = eventsOnDay(mine, tomorrow).map((e) => shape(e, tomorrow))
  return { today: todayList, tomorrow: tomorrowList }
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
    const [wx, cal, { data: todos }, { data: chores }, { data: meals }] = await Promise.all([
      weather(),
      loadEvents({ all: true }).catch(() => null),
      db.from('todos').select('title, assignee, due_date, moved_since').is('done_at', null).lte('due_date', today).or(`assignee.eq.${me.id},assignee.is.null`).order('due_date'),
      db.from('chore_tasks').select('assignee, due_date, chore_rules(title, active)').is('done_at', null).lte('due_date', today).or(`assignee.eq.${me.id},assignee.is.null`).order('due_date'),
      db.from('meals').select('title, start_time, day').eq('day', today).order('start_time', { nullsFirst: false }),
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
