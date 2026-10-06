// Abfahrten: Abfahrtstafel der Haltestellen zuhause und „Wann muss ich los?“ pro Person.
//   GET  ?action=board          → nächste Abfahrten an den Haltestellen zuhause (VAG, mit Echtzeit)
//   GET  ?action=plans          → nächster Weg pro Person (aus Kalender oder Schichten) + unbekannte Ziele des Aufrufers
//   GET  ?action=geocode&q=…    → Adresse suchen (OpenStreetMap), für neue Ziele
//   POST {action:'watch'}  + x-cron-key → Mitteilungen „Losgehen“ und „Verspätung“ (Cron jede Minute)
// Verbindungen rechnet die VGN-Fahrplanauskunft (EFA), Echtzeit kommt von der VAG.
import { addDays, berlinDay, loadEvents, type CalendarEvent } from '../_shared/calendar.ts'
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'
import { APP_URL, phonesOf, pushTo } from '../_shared/push.ts'

const db = adminClient()
const TZ = 'Europe/Berlin'
const EFA = 'https://efa.vgn.de/vgnExt_oeffi/'
const VAG = 'https://start.vag.de/dm/api/v1/'
const UA = { 'User-Agent': 'Haushaltsboard/1.0 (privates Haushalts-Dashboard)' }
/** So weit voraus wird nach Terminen und Schichten gesucht (abends schon der Weg für morgen früh) */
const LOOKAHEAD_MS = 18 * 60 * 60 * 1000
/** Umstieg darunter gilt als knapp (pünktlich sein ist wichtiger als spät losgehen) */
const TIGHT_TRANSFER_MIN = 3
/** Ab dieser Verspätung (Minuten) gibt es eine Mitteilung */
const DELAY_ALERT_MIN = 3

type Stop = { id: string; vgn: number; name: string; walk: number }
type Place = {
  id: string
  member_id: string | null
  name: string
  lat: number
  lon: number
  keywords: string[]
  weekdays: number[]
  buffer_min: number
  transit: boolean
}
type Leg = {
  walk: boolean
  line: string
  product: string
  direction: string
  from: string
  to: string
  /** geplante Zeiten (ISO) */
  dep: string
  arr: string
  /** Verspätung in Minuten laut VAG-Echtzeit (null = unbekannt) */
  delay: number | null
  platform: string | null
  minutes?: number
  /** EFA-ID der Abfahrtshaltestelle (für die Echtzeit) */
  fromId?: string
}
type Trip = {
  /** wann zuhause los (ISO, mit Echtzeit) */
  leaveAt: string
  stop: string
  walk: number
  legs: Leg[]
  /** Ankunft geplant und mit Echtzeit geschätzt */
  arrival: string
  arrivalRt: string
  /** knappster Umstieg in Minuten (null = kein Umstieg) */
  minTransfer: number | null
}
type Target = { key: string; title: string; start: string; place: { id: string; name: string; buffer: number }; source: 'calendar' | 'shift' }
type Plan = {
  memberId: string
  target: Target
  trip: Trip | null
  /** frühere Verbindung als Reserve */
  earlier: Trip | null
  /** ok | knapp (Ankunft nach dem Puffer) | spät (Ankunft nach Beginn) | keine Verbindung */
  status: 'ok' | 'tight' | 'late' | 'none'
}
type Unknown = { eventId: string; title: string; start: string; location: string | null }

// ───────── Hilfen ─────────

function berlinParts(iso: string | Date): { date: string; hhmm: string; weekday: number } {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, weekday }
}

/** Berliner Ortszeit „YYYY-MM-DD“ + „HH:MM“ → ISO */
function berlinToIso(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, min)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(guess))
    .find((p) => p.type === 'timeZoneName')!.value
  const match = name.match(/([+-])(\d{2}):(\d{2})/)
  const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60000 : 0
  return new Date(guess - offset).toISOString()
}

const minutes = (ms: number) => Math.round(ms / 60000)
const addMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60000).toISOString()

async function getJson(url: string, timeout = 15000): Promise<any> {
  const resp = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) })
  if (!resp.ok) throw new Error(`${resp.status} ${url.slice(0, 80)}`)
  return resp.json()
}

// kurze Zwischenspeicher pro Function-Instanz
const cache = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, ms: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

// ───────── VAG: Abfahrten mit Echtzeit ─────────

type Departure = { line: string; product: string; direction: string; planned: string; actual: string; platform: string | null; realtime: boolean }

async function vagDepartures(vgn: number): Promise<Departure[]> {
  return cached(`vag:${vgn}`, 30_000, async () => {
    const data = await getJson(`${VAG}abfahrten/VGN/${vgn}?timespan=90&limitcount=40`)
    return (data.Abfahrten ?? []).map((a: any) => ({
      line: a.Linienname,
      product: a.Produkt,
      direction: a.Richtungstext,
      planned: new Date(a.AbfahrtszeitSoll).toISOString(),
      actual: new Date(a.AbfahrtszeitIst ?? a.AbfahrtszeitSoll).toISOString(),
      platform: a.HaltesteigText ?? null,
      realtime: !!a.Prognose,
    }))
  })
}

// ───────── EFA: Verbindungen ─────────

/**
 * Antwort der VGN-Auskunft (langsam, 8–20 s): 30 Minuten in der Datenbank gemerkt, fällt sie aus,
 * gilt der gemerkte Fahrplan bis zu 6 Stunden weiter. Die Echtzeit kommt ohnehin frisch von der VAG.
 */
async function efaCached(query: string): Promise<any> {
  return cached(`efa:${query}`, 5 * 60_000, async () => {
    const { data: row } = await db.from('transit_tripcache').select('data, created_at').eq('key', query).maybeSingle()
    const age = row ? Date.now() - Date.parse(row.created_at) : Infinity
    if (row && age < 30 * 60_000) return row.data
    try {
      const fresh = await getJson(`${EFA}XML_TRIP_REQUEST2?${query}`, 25_000)
      // nur das Nötige speichern
      const slim = { journeys: fresh.journeys ?? [] }
      await db.from('transit_tripcache').upsert({ key: query, data: slim, created_at: new Date().toISOString() })
      return slim
    } catch (e) {
      if (row && age < 6 * 60 * 60_000) return row.data
      throw e
    }
  })
}

/** Haltestellenname ohne Bahnsteig und ohne „Nürnberg, “ (z. B. „Hauptbahnhof“) */
function stopName(loc: any): string {
  const name: string = loc?.parent?.type === 'stop' ? (loc.parent.name ?? '') : (loc?.name ?? '')
  return name.replace(/^Nürnberg,?\s*/, '') || (loc?.disassembledName ?? '')
}

/** VGN-Nummer aus der EFA-Haltestellen-ID („de:09564:1913:1:2“ → 1913) */
function vgnOf(id: string | undefined): number | null {
  const n = Number(id?.split(':')[2])
  return Number.isFinite(n) && n > 0 ? n : null
}

async function efaTrips(stop: Stop, place: Place, arriveBy: string): Promise<Trip[]> {
  const { date, hhmm } = berlinParts(arriveBy)
  const params = new URLSearchParams({
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'WGS84[dd.ddddd]',
    useRealtime: '1',
    calcNumberOfTrips: '4',
    itdTripDateTimeDepArr: 'arr',
    itdDate: date.replaceAll('-', ''),
    itdTime: hhmm.replace(':', ''),
    type_origin: 'stop',
    name_origin: stop.id,
    type_destination: 'coord',
    name_destination: `${place.lon.toFixed(5)}:${place.lat.toFixed(5)}:WGS84[dd.ddddd]`,
  })
  const data = await efaCached(params.toString())
  const trips: Trip[] = []
  for (const j of data.journeys ?? []) {
    const legs: Leg[] = (j.legs ?? []).map((l: any) => {
      const cls = l.transportation?.product?.class
      const walk = cls === undefined || cls >= 97
      return {
        walk,
        line: walk ? '' : (l.transportation?.disassembledName ?? l.transportation?.number ?? ''),
        product: walk ? 'Fußweg' : (l.transportation?.product?.name ?? ''),
        direction: l.transportation?.destination?.name ?? '',
        from: stopName(l.origin),
        fromId: l.origin?.id,
        to: stopName(l.destination),
        dep: l.origin?.departureTimePlanned,
        arr: l.destination?.arrivalTimePlanned,
        delay: null,
        platform: l.origin?.properties?.platform ?? l.origin?.properties?.platformName ?? null,
        minutes: walk ? minutes((l.duration ?? 0) * 1000) : undefined,
      }
    })
    const transit = legs.filter((l) => !l.walk)
    if (!transit.length) continue
    // Fußweg ab der Haltestelle zuhause gehört zum eigenen Fußweg
    const firstDep = transit[0].dep
    trips.push({
      leaveAt: addMin(firstDep, -stop.walk),
      stop: stop.name,
      walk: stop.walk,
      legs,
      arrival: legs[legs.length - 1].arr,
      arrivalRt: legs[legs.length - 1].arr,
      minTransfer: null,
    })
  }
  return trips
}

/** Echtzeit der VAG in die Fahrten eintragen (nur für die nächsten 90 Minuten) und Umstiege prüfen */
async function withRealtime(trip: Trip): Promise<Trip> {
  const soon = Date.now() + 90 * 60_000
  let lastDelay = 0
  let minTransfer: number | null = null
  let prevArrRt: number | null = null
  const legs = await Promise.all(
    trip.legs.map(async (l) => {
      if (l.walk || Date.parse(l.dep) > soon) return l
      const vgn = vgnOf(l.fromId)
      if (!vgn) return l
      try {
        const deps = await vagDepartures(vgn)
        const hit = deps.find((d) => d.line === l.line && Math.abs(Date.parse(d.planned) - Date.parse(l.dep)) < 90_000)
        return hit ? { ...l, delay: minutes(Date.parse(hit.actual) - Date.parse(hit.planned)) } : l
      } catch {
        return l
      }
    }),
  )
  for (const l of legs) {
    if (l.walk) {
      if (prevArrRt !== null) prevArrRt += (l.minutes ?? 0) * 60000
      continue
    }
    const depRt = Date.parse(l.dep) + (l.delay ?? 0) * 60000
    if (prevArrRt !== null) {
      const gap = minutes(depRt - prevArrRt)
      minTransfer = minTransfer === null ? gap : Math.min(minTransfer, gap)
    }
    // Ankunft dieser Fahrt: Verspätung der Abfahrt mitnehmen (genauer weiß es niemand)
    lastDelay = l.delay ?? lastDelay
    prevArrRt = Date.parse(l.arr) + lastDelay * 60000
  }
  const last = legs[legs.length - 1]
  const arrivalRt = last.walk && prevArrRt !== null ? new Date(prevArrRt).toISOString() : addMin(trip.arrival, lastDelay)
  const first = legs.find((l) => !l.walk)!
  return {
    ...trip,
    legs,
    // spätere Abfahrt heißt später losgehen; frühere (selten) früher
    leaveAt: addMin(first.dep, (first.delay ?? 0) - trip.walk),
    arrivalRt,
    minTransfer,
  }
}

/**
 * Beste Verbindung: so spät wie möglich losgehen, aber mit Puffer ankommen und ohne knappe Umstiege.
 * Dazu eine frühere als Reserve.
 */
async function bestTrip(stops: Stop[], place: Place, start: string): Promise<{ trip: Trip | null; earlier: Trip | null }> {
  const arriveBy = addMin(start, -place.buffer_min)
  const results = await Promise.allSettled(stops.map((s) => efaTrips(s, place, arriveBy)))
  // Auskunft gar nicht erreichbar: lieber den letzten guten Stand behalten als „keine Verbindung“ melden
  if (results.every((r) => r.status === 'rejected')) throw new Error(`EFA nicht erreichbar: ${(results[0] as PromiseRejectedResult).reason}`)
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  // nur, was noch erreichbar ist, und mit Ankunft vor dem Puffer
  const now = Date.now()
  const candidates = all
    .filter((t) => Date.parse(t.leaveAt) > now - 60_000 && Date.parse(t.arrival) <= Date.parse(arriveBy))
    .sort((a, b) => Date.parse(b.leaveAt) - Date.parse(a.leaveAt))
  // gleiche Fahrt von verschiedenen Haltestellen: die mit dem spätesten Losgehen behalten
  const seen = new Set<string>()
  const unique = candidates.filter((t) => {
    const key = t.legs.filter((l) => !l.walk).map((l) => `${l.line}@${l.dep}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const rated = await Promise.all(unique.slice(0, 4).map(withRealtime))
  const safe = rated.filter(
    (t) => (t.minTransfer === null || t.minTransfer >= TIGHT_TRANSFER_MIN) && Date.parse(t.arrivalRt) <= Date.parse(arriveBy),
  )
  const trip = safe[0] ?? rated[0] ?? null
  const earlier = trip ? (rated.find((t) => Date.parse(t.leaveAt) < Date.parse(trip.leaveAt) - 60_000) ?? null) : null
  return { trip, earlier }
}

// ───────── Ziele aus Kalender und Schichten ─────────

const ONLINE = /https?:\/\/|teams|zoom|meet\.google|webex|online|livestream|discord/i

function matchPlace(places: Place[], ev: { title: string; location?: string }, weekday: number): Place | null {
  const text = `${ev.title} ${ev.location ?? ''}`.toLowerCase()
  const hits = places.filter(
    (p) =>
      (p.weekdays.length === 0 || p.weekdays.includes(weekday)) &&
      (text.includes(p.name.toLowerCase()) || p.keywords.some((k) => k && text.includes(k.toLowerCase()))),
  )
  // Ziele mit Wochentag sind genauer (zwei Hallen für „U18“)
  hits.sort((a, b) => b.weekdays.length - a.weekdays.length)
  return hits[0] ?? null
}

/** Adresse aus dem Feld „Ort“ suchen (OpenStreetMap, zwischengespeichert) */
async function geocode(query: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const q = query.trim().toLowerCase()
  const { data: hit } = await db.from('transit_geocache').select('*').eq('query', q).maybeSingle()
  if (hit) return hit.lat === null ? null : { lat: hit.lat, lon: hit.lon, label: hit.label }
  const results = await searchAddress(query, 1).catch(() => null)
  if (results === null) return null
  const r = results[0] ?? null
  await db.from('transit_geocache').upsert({ query: q, lat: r?.lat ?? null, lon: r?.lon ?? null, label: r?.label ?? null })
  return r
}

/** Adresssuche über Photon (OpenStreetMap-Daten), Raum Nürnberg bevorzugt */
async function searchAddress(query: string, limit = 5): Promise<{ lat: number; lon: number; label: string }[]> {
  const params = new URLSearchParams({ q: query, lang: 'de', limit: String(limit), lat: '49.45', lon: '11.08' })
  const data = await getJson(`https://photon.komoot.io/api/?${params}`)
  return (data.features ?? [])
    .filter((f: any) => f.properties?.countrycode === 'DE')
    .map((f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: shortLabel(f.properties) }))
}

function shortLabel(p: any): string {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ')
  const town = p.city ?? p.town ?? p.village ?? p.county ?? ''
  return [p.name && p.name !== p.street ? p.name : '', street, town].filter(Boolean).join(', ')
}

async function settings() {
  return cached('settings', 30_000, async () => {
    const [{ data: mod }, { data: places }, { data: prefs }, { data: calendars }, { data: members }] = await Promise.all([
      db.from('modules').select('enabled, config').eq('id', 'abfahrten').maybeSingle(),
      db.from('transit_places').select('*'),
      db.from('transit_prefs').select('*'),
      db.from('calendars').select('id, owner'),
      db.from('members').select('id, name, is_board'),
    ])
    const config = (mod?.config ?? {}) as { stops?: Stop[]; wall_minutes?: number }
    return {
      enabled: mod?.enabled !== false,
      stops: config.stops ?? [],
      wallMinutes: config.wall_minutes ?? 30,
      places: (places ?? []) as Place[],
      prefs: new Map((prefs ?? []).map((p) => [p.member_id, p])),
      ownerOf: new Map((calendars ?? []).map((c) => [c.id, c.owner as string | null])),
      members: (members ?? []).filter((m) => !m.is_board),
    }
  })
}

type Candidate = { target: Target; place: Place; sameAsBefore: boolean }

async function candidatesFor(member: string, events: CalendarEvent[], unknown: Unknown[] | null): Promise<Candidate[]> {
  const s = await settings()
  const prefs = s.prefs.get(member)
  const ignore = new Set<string>((prefs?.ignore ?? []).map((t: string) => t.toLowerCase()))
  const places = s.places.filter((p) => !p.member_id || p.member_id === member)
  const now = Date.now()
  const out: Candidate[] = []

  // Kalender: eigene Termine mit Uhrzeit
  const mine = events
    .filter((e) => !e.allDay && s.ownerOf.get(e.calendar) === member)
    .sort((a, b) => a.start.localeCompare(b.start))
  let prevPlace: { id: string; end: number } | null = null
  for (const e of mine) {
    const start = Date.parse(e.start)
    if (Date.parse(e.end) < now - 12 * 60 * 60 * 1000) continue
    const day = berlinParts(e.start)
    let place = matchPlace(places, e, day.weekday)
    if (!place && e.location && !ONLINE.test(e.location)) {
      const g = await geocode(e.location)
      if (g) place = { id: `geo:${e.location}`, member_id: member, name: e.location.split(',')[0], lat: g.lat, lon: g.lon, keywords: [], weekdays: [], buffer_min: 10, transit: true }
    }
    const relevant = start > now && start < now + LOOKAHEAD_MS && !ignore.has(e.title.toLowerCase()) && !ONLINE.test(e.title)
    if (relevant && !place && e.location && !ONLINE.test(e.location) && unknown) {
      unknown.push({ eventId: e.id, title: e.title, start: e.start, location: e.location ?? null })
    }
    if (place) {
      // direkt davor schon am selben Ort (z. B. zweiter Termin bei der Arbeit): kein Weg nötig
      const sameAsBefore = !!prevPlace && prevPlace.id === place.id && start - prevPlace.end < 2 * 60 * 60 * 1000
      if (relevant) {
        out.push({
          target: { key: `cal:${e.id}`, title: e.title, start: e.start, place: { id: place.id, name: place.name, buffer: place.buffer_min }, source: 'calendar' },
          place,
          sameAsBefore,
        })
      }
      prevPlace = { id: place.id, end: Date.parse(e.end) }
    }
  }

  // Schichten (z. B. Leviona): heute und morgen
  const today = berlinDay(new Date())
  const { data: days } = await db
    .from('transit_shift_days')
    .select('day, transit_shifts(id, name, start_time, place_id)')
    .eq('member_id', member)
    .in('day', [today, addDays(today, 1)])
  for (const d of days ?? []) {
    const shift = d.transit_shifts as unknown as { id: string; name: string; start_time: string; place_id: string } | null
    const place = shift && s.places.find((p) => p.id === shift.place_id)
    if (!shift || !place) continue
    const start = berlinToIso(d.day, shift.start_time.slice(0, 5))
    if (Date.parse(start) <= now || Date.parse(start) > now + LOOKAHEAD_MS) continue
    out.push({
      target: { key: `shift:${d.day}:${shift.id}`, title: shift.name, start, place: { id: place.id, name: place.name, buffer: place.buffer_min }, source: 'shift' },
      place,
      sameAsBefore: false,
    })
  }
  return out.filter((c) => c.place.transit && !c.sameAsBefore).sort((a, b) => a.target.start.localeCompare(b.target.start))
}

// letzter gelungener Weg je Termin, falls die Auskunft kurz ausfällt
const lastGood = new Map<string, { at: number; value: { trip: Trip | null; earlier: Trip | null } }>()

/** Nächster Weg einer Person: der früheste Termin, dessen Abfahrt noch bevorsteht */
async function planFor(member: string, events: CalendarEvent[], unknown: Unknown[] | null): Promise<Plan | null> {
  const s = await settings()
  for (const c of await candidatesFor(member, events, unknown)) {
    const key = `plan:${member}:${c.target.key}`
    let found: { trip: Trip | null; earlier: Trip | null }
    try {
      found = await cached(key, 45_000, () => bestTrip(s.stops, c.place, c.target.start))
      lastGood.set(key, { at: Date.now(), value: found })
    } catch (e) {
      console.error('Verbindung nicht berechnet', c.target.key, e)
      const old = lastGood.get(key)
      if (!old || Date.now() - old.at > 20 * 60_000) continue
      found = old.value
    }
    const { trip, earlier } = found
    if (trip && Date.parse(trip.leaveAt) < Date.now() - 2 * 60_000) {
      // Losgehzeit vorbei: solange die erste Bahn noch nicht weg ist, weiter zeigen
      const first = trip.legs.find((l) => !l.walk)!
      if (Date.parse(first.dep) + (first.delay ?? 0) * 60000 < Date.now()) continue
    }
    const arriveBy = Date.parse(addMin(c.target.start, -c.place.buffer_min))
    const status: Plan['status'] = !trip
      ? 'none'
      : Date.parse(trip.arrivalRt) > Date.parse(c.target.start)
        ? 'late'
        : Date.parse(trip.arrivalRt) > arriveBy || (trip.minTransfer !== null && trip.minTransfer < TIGHT_TRANSFER_MIN)
          ? 'tight'
          : 'ok'
    return { memberId: member, target: c.target, trip, earlier, status }
  }
  return null
}

// ───────── Mitteilungen ─────────

function lineText(t: Trip): string {
  const first = t.legs.find((l) => !l.walk)!
  return `${first.line} ab ${first.from} ${berlinParts(addMin(first.dep, first.delay ?? 0)).hhmm}`
}

async function notifyOnce(member: string, key: string, kind: string, title: string, body: string): Promise<void> {
  const { error } = await db.from('transit_notified').insert({ member_id: member, trip_key: key, kind })
  if (error) return // schon geschickt
  await pushTo(await phonesOf([member]), { title, body, tag: `transit-${key}`, url: APP_URL })
}

async function watch(): Promise<unknown> {
  const s = await settings()
  if (!s.enabled) return { skipped: true }
  await db.from('transit_notified').delete().lt('created_at', new Date(Date.now() - 2 * 86400000).toISOString())
  const { events } = await cached('events', 4 * 60_000, () => loadEvents({ all: true }))
  let sent = 0
  // für alle vorrechnen (füllt die Zwischenspeicher), Mitteilungen nur für die, die sie eingeschaltet haben
  for (const m of s.members) {
    const prefs = s.prefs.get(m.id)
    const plan = await planFor(m.id, events, null).catch(() => null)
    if (!prefs || !(prefs.push_leave || prefs.push_delay) || !plan?.trip) continue
    const toLeave = Date.parse(plan.trip.leaveAt) - Date.now()
    const where = plan.target.place.name
    if (prefs.push_leave && toLeave <= prefs.push_leave_min * 60_000 && toLeave > -60_000) {
      await notifyOnce(m.id, plan.target.key, 'leave', `In ${Math.max(0, minutes(toLeave))} Min losgehen`, `${lineText(plan.trip)} → ${where}, an ${berlinParts(plan.trip.arrivalRt).hhmm}`)
      sent++
    }
    if (prefs.push_delay && toLeave < 90 * 60_000) {
      const worst = Math.max(0, ...plan.trip.legs.map((l) => l.delay ?? 0))
      if (worst >= DELAY_ALERT_MIN) {
        const leg = plan.trip.legs.find((l) => (l.delay ?? 0) === worst)!
        const bucket = worst >= 10 ? 10 : worst >= 6 ? 6 : 3
        await notifyOnce(m.id, plan.target.key, `delay${bucket}`, `${leg.line} hat ${worst} Min Verspätung`, `Ankunft ${where} ca. ${berlinParts(plan.trip.arrivalRt).hhmm}${plan.status === 'late' ? ' – das wird zu spät' : ''}`)
      }
      if (plan.trip.minTransfer !== null && plan.trip.minTransfer < 1) {
        await notifyOnce(m.id, plan.target.key, 'transfer', 'Umstieg klappt wohl nicht', plan.earlier ? `Früher los: ${lineText(plan.earlier)}` : 'Schau in der App nach einer anderen Verbindung.')
      }
    }
  }
  return { members: s.members.length, sent }
}

// ───────── Handler ─────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const url = new URL(req.url)
  try {
    const cronKey = req.headers.get('x-cron-key')
    if (cronKey) {
      const { data } = await db.from('push_config').select('cron_key').eq('id', 1).single()
      if (!data || cronKey !== data.cron_key) return new Response('Nicht erlaubt', { status: 403 })
      return Response.json(await watch())
    }

    const member = await memberId(req)
    if (!member) return json(req, { error: 'Nicht angemeldet' }, 401)
    const action = url.searchParams.get('action')
    const s = await settings()

    if (action === 'board') {
      const boards = await Promise.all(
        s.stops.map(async (stop) => ({ stop, departures: await vagDepartures(stop.vgn).catch(() => [] as Departure[]) })),
      )
      return json(req, { stops: boards })
    }
    if (action === 'plans') {
      const { events } = await cached('events', 4 * 60_000, () => loadEvents({ all: true }))
      const unknown: Unknown[] = []
      const plans = await Promise.all(s.members.map((m) => planFor(m.id, events, m.id === member ? unknown : null).catch(() => null)))
      return json(req, {
        plans: plans.filter(Boolean),
        unknown: unknown.slice(0, 5),
        wallMinutes: s.wallMinutes,
        onWall: s.members.filter((m) => s.prefs.get(m.id)?.show_on_wall !== false).map((m) => m.id),
      })
    }
    if (action === 'geocode') {
      const q = url.searchParams.get('q') ?? ''
      if (q.trim().length < 4) return json(req, { results: [] })
      return json(req, { results: await searchAddress(q, 5) })
    }
    return json(req, { error: 'Unbekannte Aktion' }, 400)
  } catch (e) {
    console.error(e)
    return json(req, { error: 'Abfahrten gerade nicht erreichbar' }, 502)
  }
})
