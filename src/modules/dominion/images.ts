import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Kartenbilder (ganze Karte) und Illustrationen liegen privat im Bucket „dominion“ (card/<id>.jpg, art/<id>.jpg).
// Die Edge Function dominion-images füllt ihn mit allem, was ihr besitzt; hier: nachfüllen und signierte Links holen.

const BUCKET = 'dominion'
const TTL = 60 * 60
/** Links nach 50 Min neu holen (sie gelten 60 Min) */
const RESIGN_MS = 50 * 60_000

export type ImageKind = 'art' | 'card'

const cache = new Map<string, { url: string | null; at: number }>()
const listeners = new Set<() => void>()
let pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

const key = (kind: ImageKind, id: string) => `${kind}/${id}.jpg`

function flush() {
  timer = null
  const paths = [...pending]
  pending = new Set()
  if (!paths.length) return
  supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, TTL)
    .then(({ data }) => {
      const now = Date.now()
      for (const p of paths) cache.set(p, { url: null, at: now })
      for (const d of data ?? []) if (d.path) cache.set(d.path, { url: d.error ? null : d.signedUrl, at: now })
      listeners.forEach((l) => l())
    })
}

function request(path: string) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < RESIGN_MS) return
  pending.add(path)
  if (!timer) timer = setTimeout(flush, 30)
}

/** Signierte Links für mehrere Karten (gesammelt in einer Anfrage); null = (noch) kein Bild */
export function useCardImages(ids: string[], kind: ImageKind): Record<string, string | null> {
  const [, tick] = useState(0)
  const joined = ids.join(',')
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    for (const id of joined ? joined.split(',') : []) request(key(kind, id))
    return () => {
      listeners.delete(l)
    }
  }, [joined, kind])
  const out: Record<string, string | null> = {}
  for (const id of ids) out[id] = cache.get(key(kind, id))?.url ?? null
  return out
}

let syncing: Promise<void> | null = null
/**
 * Fehlende Bilder für euren Besitz privat ablegen lassen (einmal pro Sitzung bzw. nach Änderung der Erweiterungen).
 * Danach die gemerkten Links verwerfen, damit neu abgelegte Bilder erscheinen.
 */
export function syncImages(force = false): Promise<void> {
  if (syncing && !force) return syncing
  syncing = (async () => {
    for (let round = 0; round < 20; round++) {
      const { data, error } = await supabase.functions.invoke<{ done: number; remaining: number }>('dominion-images', { body: {} })
      if (error || !data) break
      if (data.done > 0) {
        for (const [p, v] of cache) if (!v.url) cache.delete(p)
        for (const p of cache.keys()) pending.add(p)
        if (!timer) timer = setTimeout(flush, 30)
      }
      if (!data.remaining || !data.done) break
    }
  })()
  return syncing
}
