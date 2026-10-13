import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Nowcast } from '../../../supabase/functions/_shared/radarNowcast.ts'

export type { Nowcast }

/** Ein Radar-Stand aus `weather_radar` (docs/wetter-radar.md), Bilder schon entpackt */
export type Radar = {
  width: number
  height: number
  /** 8-Bit-Stufen pro Bild (0 = trocken), Zeile für Zeile von Nord nach Süd */
  frames: Uint8Array[]
  /** Zeitpunkt pro Bild (ms) */
  times: number[]
  /** Index des letzten gemessenen Bilds („jetzt“) */
  nowIndex: number
  /** Index des Bilds 60 min vor „jetzt“ (Beginn der Schleife) */
  startIndex: number
  /** Zuhause im Ausschnitt (Pixel, Mitte = +0,5), null ohne eingetragenes Zuhause */
  home: { x: number; y: number } | null
  nowcast: Nowcast | null
  fetchedAt: number
  /** älter als 30 Minuten: Radar gerade nicht erreichbar */
  stale: boolean
}

type Row = {
  fetched_at: string
  first_at: string
  now_at: string
  step_min: number
  width: number
  height: number
  frame_count: number
  frames: string
  home_x: number | null
  home_y: number | null
  nowcast: Nowcast | null
}

const STALE_MS = 30 * 60_000

async function decode(row: Row): Promise<Radar> {
  const bytes = Uint8Array.from(atob(row.frames), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  const all = new Uint8Array(await new Response(stream).arrayBuffer())
  const n = row.width * row.height
  const frames = Array.from({ length: row.frame_count }, (_, i) => all.subarray(i * n, (i + 1) * n))
  const first = Date.parse(row.first_at)
  const step = row.step_min * 60_000
  const times = frames.map((_, i) => first + i * step)
  const nowMs = Date.parse(row.now_at)
  const nowIndex = Math.max(0, times.findIndex((t) => t >= nowMs))
  const startIndex = Math.max(0, times.findIndex((t) => t >= nowMs - 60 * 60_000))
  const fetchedAt = Date.parse(row.fetched_at)
  return {
    width: row.width,
    height: row.height,
    frames,
    times,
    nowIndex,
    startIndex,
    home: row.home_x === null || row.home_y === null ? null : { x: row.home_x, y: row.home_y },
    nowcast: row.nowcast,
    fetchedAt,
    stale: Date.now() - fetchedAt > STALE_MS,
  }
}

// ein gemeinsamer Stand für alle Kacheln auf der Seite (Radar-Ansicht und Nowcast-Zeile)
let current: Radar | null = null
let started = false
const listeners = new Set<(r: Radar | null) => void>()

/** ?radar=test spielt den gesicherten Testfall (Zeile 2) ab, sonst der aktuelle Stand (Zeile 1) */
const rowId = () => (new URLSearchParams(location.search).get('radar') === 'test' ? 2 : 1)

async function load() {
  const { data } = await supabase.from('weather_radar').select('*').eq('id', rowId()).maybeSingle()
  if (!data) return
  try {
    current = await decode(data as Row)
    if (rowId() === 2) current.stale = false
  } catch {
    current = null
  }
  listeners.forEach((l) => l(current))
}

function start() {
  if (started) return
  started = true
  load()
  supabase
    .channel(`weather-radar-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weather_radar' }, () => load())
    .subscribe()
  // Rückfall, falls Realtime hängt; prüft auch „veraltet“
  setInterval(() => {
    if (current && Date.now() - current.fetchedAt > 6 * 60_000) load()
    if (current && rowId() === 1) {
      const stale = Date.now() - current.fetchedAt > STALE_MS
      if (stale !== current.stale) {
        current = { ...current, stale }
        listeners.forEach((l) => l(current))
      }
    }
  }, 60_000)
}

/** Aktueller Radar-Stand (wird geteilt, lädt bei Bedarf einmal und hört auf Realtime) */
export function useRadar(enabled = true): Radar | null {
  const [radar, setRadar] = useState<Radar | null>(current)
  useEffect(() => {
    if (!enabled) return
    start()
    listeners.add(setRadar)
    setRadar(current)
    return () => {
      listeners.delete(setRadar)
    }
  }, [enabled])
  return enabled ? radar : null
}

/** Nowcast-Satz für die Vorhersage: nur wenn Regen in den nächsten 2 Stunden kommt oder gerade fällt */
export function useNowcast(enabled = true): Nowcast | null {
  const radar = useRadar(enabled)
  if (!radar || radar.stale || !radar.nowcast || radar.nowcast.state === 'dry') return null
  return radar.nowcast
}
