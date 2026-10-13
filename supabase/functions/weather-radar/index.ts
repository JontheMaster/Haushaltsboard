// Regenradar (Modul „Uhr und Wetter“, docs/wetter-radar.md): holt alle 5 Minuten den Ausschnitt um Nürnberg von
// Bright Sky (/radar, DWD RV), packt die Bilder als 8-Bit-Stufen, rechnet den Nowcast fürs Zuhause und speichert
// alles in `weather_radar` (Zeile 1). Tablet und Handys lesen nur die Tabelle, niemand fragt selbst bei Bright Sky.
//   POST {action:'refresh'}  – Cron (x-cron-key = push_config.cron_key)
//   POST {action:'snapshot'} – aktuellen Stand als Testfall in Zeile 2 sichern (für ?radar=test), nur mit Cron-Schlüssel
// Datenbasis: Deutscher Wetterdienst (über Bright Sky), eigene Bearbeitung.
import { adminClient, corsHeaders, json } from '../_shared/http.ts'
import { latLonToGrid, RADAR_CENTER, RADAR_DISTANCE_M, rawToMmh, toLevel } from '../_shared/radarGrid.ts'
import { nowcast } from '../_shared/radarNowcast.ts'

const db = adminClient()
const STEP_MS = 5 * 60_000

const iso5 = (ms: number) => new Date(Math.floor(ms / STEP_MS) * STEP_MS).toISOString().slice(0, 19) + 'Z'

async function inflate(b64: string): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function deflateB64(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  const out = new Uint8Array(await new Response(stream).arrayBuffer())
  let s = ''
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000))
  return btoa(s)
}

type BrightSky = {
  radar: { timestamp: string; source: string; precipitation_5: string }[]
  bbox: [number, number, number, number]
}

async function refresh(): Promise<Record<string, unknown>> {
  const now = Date.now()
  const url = new URL('https://api.brightsky.dev/radar')
  url.searchParams.set('lat', String(RADAR_CENTER.lat))
  url.searchParams.set('lon', String(RADAR_CENTER.lon))
  url.searchParams.set('distance', String(RADAR_DISTANCE_M))
  url.searchParams.set('date', iso5(now - 65 * 60_000))
  url.searchParams.set('last_date', iso5(now + 125 * 60_000))
  url.searchParams.set('format', 'compressed')
  const res = await fetch(url, { headers: { 'User-Agent': 'Haushaltsboard (privates Familien-Board)' } })
  if (!res.ok) throw new Error(`Bright Sky ${res.status}`)
  const data = (await res.json()) as BrightSky
  if (!data.radar?.length) throw new Error('Bright Sky ohne Radarbilder')

  const [top, left, bottom, right] = data.bbox
  const width = right - left + 1
  const height = bottom - top + 1
  const n = width * height
  // „jetzt“ = letztes gemessenes Bild (die Vorhersage-Bilder tragen als Quelle die Zeit der letzten Messung)
  const measured = data.radar.map((r) => r.source.split('::').pop() ?? r.timestamp).sort()
  const nowAt = measured[measured.length - 1]

  // Zuhause aus der Datenbank (NFC-Tags → Zuhause), nie aus dem Repo
  const { data: nfc } = await db.from('modules').select('config').eq('id', 'nfc').maybeSingle()
  const home = (nfc?.config as { home?: { lat: number; lon: number } } | null)?.home
  let hx: number | null = null
  let hy: number | null = null
  if (home?.lat && home?.lon) {
    const g = latLonToGrid(home.lat, home.lon)
    hx = g.x - left
    hy = g.y - top
  }

  const levels = new Uint8Array(n * data.radar.length)
  const series: number[] = []
  const times: string[] = []
  for (let f = 0; f < data.radar.length; f++) {
    const raw = await inflate(data.radar[f].precipitation_5)
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const rawAt = (i: number) => {
      const v = view.getUint16(i * 2, true)
      return v >= 65000 ? 0 : v
    }
    for (let i = 0; i < n; i++) levels[f * n + i] = toLevel(rawAt(i))
    // Nowcast: Mittel der 3 × 3 Pixel ums Zuhause, ab „jetzt“
    const ts = data.radar[f].timestamp
    if (hx !== null && hy !== null && ts >= nowAt) {
      const cx = Math.round(hx)
      const cy = Math.round(hy)
      let sum = 0
      let cnt = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          sum += rawToMmh(rawAt(y * width + x))
          cnt++
        }
      series.push(cnt ? sum / cnt : 0)
      times.push(ts)
    }
  }

  const row = {
    id: 1,
    fetched_at: new Date(now).toISOString(),
    first_at: data.radar[0].timestamp,
    now_at: new Date(nowAt).toISOString(),
    step_min: 5,
    width,
    height,
    frame_count: data.radar.length,
    frames: await deflateB64(levels),
    home_x: hx,
    home_y: hy,
    nowcast: series.length ? nowcast(series, times, now) : null,
  }
  const { error } = await db.from('weather_radar').upsert(row)
  if (error) throw error
  return { ok: true, frames: row.frame_count, size: row.frames.length, now_at: row.now_at, nowcast: row.nowcast }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const { data: cfg } = await db.from('push_config').select('cron_key').eq('id', 1).maybeSingle()
    if (!cfg?.cron_key || req.headers.get('x-cron-key') !== cfg.cron_key) return json(req, { ok: false, message: 'Nicht erlaubt.' }, 401)
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    if (body.action === 'snapshot') {
      const { data: cur } = await db.from('weather_radar').select('*').eq('id', 1).maybeSingle()
      if (!cur) return json(req, { ok: false, message: 'Noch kein Radar gespeichert.' }, 404)
      const { error } = await db.from('weather_radar').upsert({ ...cur, id: 2 })
      if (error) throw error
      return json(req, { ok: true, message: `Testfall gesichert (${cur.now_at})` })
    }
    const { data: mod } = await db.from('modules').select('enabled').eq('id', 'uhr-wetter').maybeSingle()
    if (mod && !mod.enabled) return json(req, { ok: true, skipped: 'Modul aus' })
    return json(req, await refresh())
  } catch (e) {
    console.error(e)
    return json(req, { ok: false, message: String(e instanceof Error ? e.message : e) }, 502)
  }
})
