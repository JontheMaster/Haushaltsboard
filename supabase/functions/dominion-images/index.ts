// Dominion-Kartenbilder privat ablegen (docs/dominion-modul.md, Wunsch Jonathan 18.11.2026).
// Holt für alle Karten, die der Haushalt besitzt, Kartenbild und Illustration aus dem Repo von KingdomCreator
// (fester Commit, Pfade aus _shared/dominionImages.json) und legt sie im privaten Bucket „dominion“ ab:
//   card/<karten-id>.jpg  ganze Karte (zum Lesen der Funktion)
//   art/<karten-id>.jpg   nur die Illustration (für die Kacheln)
// Pro Aufruf höchstens BATCH Karten; die App ruft so lange auf, bis remaining = 0.
// Die Zuordnung (dominionImages.json, ca. 100 KB, erzeugt von scripts/dominion/build-cards.mjs) liest die Function aus
// unserem öffentlichen Repo, damit sie nicht bei jedem Deploy mitgeschickt werden muss.
import { adminClient, corsHeaders, json, requireMember } from '../_shared/http.ts'

type Entry = { boxes: string[]; card: Record<string, string>; art: string | null }
type ImageMap = { repo: string; commit: string; images: Record<string, Entry> }
const MAP_URL = 'https://raw.githubusercontent.com/JontheMaster/Haushaltsboard/main/supabase/functions/_shared/dominionImages.json'
const BUCKET = 'dominion'
const BATCH = 30
let mapCache: { at: number; map: ImageMap } | null = null

async function imageMap(): Promise<ImageMap> {
  if (mapCache && Date.now() - mapCache.at < 600_000) return mapCache.map
  const res = await fetch(MAP_URL)
  if (!res.ok) throw new Error(`Zuordnung: HTTP ${res.status}`)
  mapCache = { at: Date.now(), map: (await res.json()) as ImageMap }
  return mapCache.map
}

async function listAll(admin: ReturnType<typeof adminClient>, folder: string): Promise<Set<string>> {
  const names = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data: files } = await admin.storage.from(BUCKET).list(folder, { limit: 1000, offset })
    if (!files?.length) break
    files.forEach((f) => names.add(f.name))
    if (files.length < 1000) break
  }
  return names
}

async function copy(admin: ReturnType<typeof adminClient>, raw: string, from: string, to: string): Promise<boolean> {
  const res = await fetch(raw + from)
  if (!res.ok) return false
  const body = new Uint8Array(await res.arrayBuffer())
  const type = from.endsWith('.png') ? 'image/png' : 'image/jpeg'
  const { error } = await admin.storage.from(BUCKET).upload(to, body, { contentType: type, upsert: true })
  return !error
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hochladen dürfen der Cron-Schlüssel oder ein gültiger Token einer Person (nicht das Tablet) */
async function uploadAllowed(admin: ReturnType<typeof adminClient>, req: Request): Promise<boolean> {
  const cronKey = req.headers.get('x-cron-key')
  if (cronKey) {
    const { data } = await admin.from('push_config').select('cron_key').eq('id', 1).single()
    return !!data && cronKey === data.cron_key
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!/^nfc_[0-9a-f]{48}$/.test(token)) return false
  const { data } = await admin.from('member_tokens').select('member').eq('token_hash', await sha256Hex(token)).eq('revoked', false).maybeSingle()
  if (!data) return false
  const { data: m } = await admin.from('members').select('is_board').eq('id', data.member).maybeSingle()
  return !!m && !m.is_board
}

/**
 * Eigene Bilder ablegen (z. B. deutsche Karten aus scripts/dominion/karten-de, 18.11.2026): PUT ?path=card/<id>.jpg,
 * Bild als Body, Schutz über x-cron-key (push_config.cron_key) oder einen Kurzbefehl-Token `Bearer nfc_…` (member_tokens). Vorhandene Bilder werden überschrieben; die automatische
 * Ablage oben füllt nur Fehlendes auf und überschreibt sie nicht wieder.
 */
async function putImage(req: Request): Promise<Response> {
  const admin = adminClient()
  if (!(await uploadAllowed(admin, req))) return new Response('Nicht erlaubt', { status: 403 })
  const path = new URL(req.url).searchParams.get('path') ?? ''
  if (!/^(card|art)\/[a-z0-9_]+\.jpg$/.test(path)) return new Response('Pfad ungültig', { status: 400 })
  const body = new Uint8Array(await req.arrayBuffer())
  if (!body.length || body.length > 5_000_000) return new Response('Bild fehlt oder zu groß', { status: 400 })
  const contentType = req.headers.get('content-type') === 'image/png' ? 'image/png' : 'image/jpeg'
  const { error } = await admin.storage.from(BUCKET).upload(path, body, { contentType, upsert: true })
  return error ? new Response(error.message, { status: 500 }) : Response.json({ ok: true, path })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method === 'PUT') return await putImage(req)
  const denied = await requireMember(req)
  if (denied) return denied

  const admin = adminClient()
  let map: ImageMap
  try {
    map = await imageMap()
  } catch (e) {
    return json(req, { error: String(e) }, 502)
  }
  const IMAGES = map.images
  const raw = `https://raw.githubusercontent.com/${map.repo}/${map.commit}/`
  const { data: mod } = await admin.from('modules').select('config').eq('id', 'dominion').maybeSingle()
  const owned = (mod?.config as { owned?: { boxes?: string[]; promos?: string[] } } | null)?.owned ?? {}
  const boxes = new Set(owned.boxes ?? [])
  const promos = new Set(owned.promos ?? [])
  const mine = Object.entries(IMAGES).filter(([id, e]) => (id.startsWith('promos_') ? promos.has(id) : e.boxes.some((b) => boxes.has(b))))

  const [cards, arts] = await Promise.all([listAll(admin, 'card'), listAll(admin, 'art')])
  const todo = mine.filter(([id, e]) => !cards.has(`${id}.jpg`) || (e.art && !arts.has(`${id}.jpg`)))

  let done = 0
  let failed = 0
  const batch = todo.slice(0, BATCH)
  await Promise.all(
    batch.map(async ([id, e]) => {
      // Kartenbild aus einer Schachtel, die ihr habt (Edition passt dann zum Text)
      const box = e.boxes.find((b) => boxes.has(b) && e.card[b]) ?? Object.keys(e.card)[0]
      const jobs: Promise<boolean>[] = []
      if (!cards.has(`${id}.jpg`) && box) jobs.push(copy(admin, raw, e.card[box], `card/${id}.jpg`))
      if (e.art && !arts.has(`${id}.jpg`)) jobs.push(copy(admin, raw, e.art, `art/${id}.jpg`))
      const ok = (await Promise.all(jobs)).every(Boolean)
      if (ok) done++
      else failed++
    }),
  )
  return json(req, { done, failed, remaining: Math.max(0, todo.length - batch.length), total: mine.length })
})
