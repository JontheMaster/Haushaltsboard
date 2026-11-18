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
  if (mapCache && Date.now() - mapCache.at < 3600_000) return mapCache.map
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
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
