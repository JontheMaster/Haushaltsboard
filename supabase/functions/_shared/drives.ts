// Heimweg mit dem Auto (NFC-Baustein „drive_home“): Fahrzeit mit Live-Verkehr von TomTom (Secret TOMTOM_KEY).
// Das iPhone schickt nur beim Tippen einmal den Standort. Danach schätzt der Server alle 2 Minuten (Cron drive-watch),
// wo man auf der Strecke ungefähr ist (nach der vergangenen Zeit), und fragt den Verkehr für den Rest neu ab.
import { adminClient } from './http.ts'

const db = adminClient()
const TOMTOM = 'https://api.tomtom.com/routing/1/calculateRoute/'
/** Näher als das am Ziel = schon zuhause */
const HOME_RADIUS_M = 400
/** Spätestens so lange nach der geschätzten Ankunft gilt die Fahrt als beendet */
const ARRIVE_GRACE_MS = 5 * 60_000

export type Home = { lat: number; lon: number; address?: string }
type Point = [number, number]
/** Stau-Abschnitt als Anteil der Strecke [von, bis] (0–1) */
type Jam = [number, number]
type Route = { points: Point[]; lengthM: number; travelS: number; delayS: number; jams: Jam[] }

export function distanceM(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

export async function homeOf(): Promise<Home | null> {
  const { data } = await db.from('modules').select('config').eq('id', 'nfc').maybeSingle()
  const home = (data?.config as { home?: Home } | null)?.home
  return home && Number.isFinite(home.lat) && Number.isFinite(home.lon) ? home : null
}

/** Route mit Verkehr von A nach B (TomTom Routing, Auto) */
async function route(from: Point, to: Point): Promise<Route> {
  const key = Deno.env.get('TOMTOM_KEY')?.trim()
  if (!key) throw new Error('Secret TOMTOM_KEY fehlt')
  const url = `${TOMTOM}${from[0]},${from[1]}:${to[0]},${to[1]}/json?key=${key}&traffic=true&travelMode=car&routeRepresentation=polyline&computeTravelTimeFor=none&sectionType=traffic`
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`TomTom ${resp.status}: ${(await resp.text()).slice(0, 120)}`)
  const data = await resp.json()
  const r = data.routes?.[0]
  if (!r) throw new Error('TomTom: keine Route')
  const pts: Point[] = (r.legs ?? []).flatMap((l: { points: { latitude: number; longitude: number }[] }) =>
    l.points.map((p) => [p.latitude, p.longitude] as Point),
  )
  // Stau-Abschnitte (TomTom „sections“ mit Punkt-Indizes) → Anteile der Strecke, für die rote Markierung
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]))
  const total = cum[cum.length - 1] || 1
  const jams: Jam[] = (r.sections ?? [])
    .filter((x: { sectionType?: string; simpleCategory?: string }) => x.sectionType === 'TRAFFIC' && x.simpleCategory !== 'ROAD_CLOSURE')
    .map((x: { startPointIndex: number; endPointIndex: number }) => [cum[x.startPointIndex] / total, cum[Math.min(x.endPointIndex, cum.length - 1)] / total] as Jam)
    .filter(([a, b]: Jam) => b > a)
  return { points: pts, lengthM: r.summary.lengthInMeters, travelS: r.summary.travelTimeInSeconds, delayS: r.summary.trafficDelayInSeconds ?? 0, jams }
}

/** Name des Startorts für die Kachel („Erlangen, Uni“), über Photon (OpenStreetMap) */
async function placeName(p: Point): Promise<string | null> {
  try {
    const resp = await fetch(`https://photon.komoot.io/reverse?lat=${p[0]}&lon=${p[1]}&lang=de&limit=1`, { signal: AbortSignal.timeout(5000) })
    const f = (await resp.json()).features?.[0]?.properties
    if (!f) return null
    const town = f.city ?? f.town ?? f.village ?? ''
    // Orte mit Namen (Uni, Firma, Geschäft) beim Namen, sonst Stadtteil oder Straße (keine Denkmäler o. Ä.)
    const named = f.name && ['amenity', 'shop', 'office', 'building', 'leisure', 'railway', 'aeroway'].includes(f.osm_key) && f.osm_value !== 'memorial'
    const spot = named ? f.name : (f.district ?? f.locality ?? f.street ?? '')
    return [town, spot].filter(Boolean).join(', ') || null
  } catch {
    return null
  }
}

/** höchstens n Punkte (für die Anzeige und die Positionsschätzung reicht das) */
function thin(points: Point[], n = 120): Point[] {
  if (points.length <= n) return points
  const step = (points.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => points[Math.round(i * step)])
}

/** Punkt nach `share` (0–1) der Strecke */
function pointAt(points: Point[], share: number): Point {
  const total = points.reduce((s, p, i) => (i ? s + distanceM(points[i - 1], p) : 0), 0)
  let left = total * Math.min(1, Math.max(0, share))
  for (let i = 1; i < points.length; i++) {
    const d = distanceM(points[i - 1], points[i])
    if (left <= d) {
      const f = d ? left / d : 0
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f]
    }
    left -= d
  }
  return points[points.length - 1]
}

export type StartResult =
  | { ok: true; eta: Date; minutes: number; delayMin: number }
  | { ok: false; reason: 'no-home' | 'at-home' | 'error'; message: string }

/** Fahrt starten (alte offene Fahrt derselben Person wird ersetzt) */
export async function startDrive(member: string, from: Point): Promise<StartResult> {
  const home = await homeOf()
  if (!home) return { ok: false, reason: 'no-home', message: 'Zuhause ist noch nicht eingetragen.' }
  const to: Point = [home.lat, home.lon]
  if (distanceM(from, to) < HOME_RADIUS_M) {
    await db.from('drives').update({ arrived_at: new Date().toISOString() }).eq('member', member).is('arrived_at', null).is('cancelled_at', null)
    return { ok: false, reason: 'at-home', message: 'Du bist schon zuhause.' }
  }
  let r: Route
  const label = placeName(from)
  try {
    r = await route(from, to)
  } catch (e) {
    console.error(e)
    return { ok: false, reason: 'error', message: 'Fahrzeit gerade nicht abrufbar.' }
  }
  const now = new Date()
  const eta = new Date(now.getTime() + r.travelS * 1000)
  await db.from('drives').update({ cancelled_at: now.toISOString() }).eq('member', member).is('arrived_at', null).is('cancelled_at', null)
  await db.from('drives').insert({
    member,
    started_at: now.toISOString(),
    route: thin(r.points),
    length_m: r.lengthM,
    progress: 0,
    eta: eta.toISOString(),
    delay_s: r.delayS,
    jams: r.jams,
    origin_label: await label,
    checked_at: now.toISOString(),
  })
  return { ok: true, eta, minutes: Math.round(r.travelS / 60), delayMin: Math.round(r.delayS / 60) }
}

/** Alle laufenden Fahrten weiterrechnen (Cron alle 2 Minuten) */
export async function updateDrives(): Promise<{ updated: number; arrived: number }> {
  const home = await homeOf()
  const { data: drives } = await db.from('drives').select('*').is('arrived_at', null).is('cancelled_at', null)
  let updated = 0
  let arrived = 0
  const now = Date.now()
  for (const d of drives ?? []) {
    const eta = Date.parse(d.eta)
    const checked = Date.parse(d.checked_at)
    // Anteil seit der letzten Schätzung: die Reststrecke gleichmäßig bis zur Ankunft
    const left = 1 - d.progress
    const share = eta > checked ? Math.min(1, (now - checked) / (eta - checked)) : 1
    const progress = Math.min(1, d.progress + left * share)
    // sehr lange unterwegs (z. B. Umweg) oder am Ziel: beenden
    if (progress >= 0.995 || now > eta + ARRIVE_GRACE_MS || now - Date.parse(d.started_at) > 3 * 3600_000) {
      await db.from('drives').update({ progress: 1, arrived_at: new Date(Math.min(now, eta + ARRIVE_GRACE_MS)).toISOString() }).eq('id', d.id)
      arrived++
      continue
    }
    let next = { progress, eta: new Date(eta), delay_s: d.delay_s as number, jams: d.jams as Jam[] }
    if (home && Array.isArray(d.route) && d.route.length > 1) {
      try {
        const here = pointAt(d.route as Point[], progress)
        const r = await route(here, [home.lat, home.lon])
        // Staus der Reststrecke auf die ganze Strecke umrechnen
        const jams = r.jams.map(([a, b]) => [progress + (1 - progress) * a, progress + (1 - progress) * b] as Jam)
        next = { progress, eta: new Date(now + r.travelS * 1000), delay_s: r.delayS, jams }
      } catch (e) {
        console.error('Verkehr nicht abrufbar', e)
      }
    }
    await db
      .from('drives')
      .update({ progress: next.progress, eta: next.eta.toISOString(), delay_s: next.delay_s, jams: next.jams, checked_at: new Date(now).toISOString() })
      .eq('id', d.id)
    updated++
  }
  return { updated, arrived }
}
