import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useModuleConfig } from '../useModules'

// Abfahrten: Daten von der Edge Function `transit` (VGN-Verbindungen, VAG-Echtzeit)

export type Stop = { id: string; vgn: number; name: string; walk: number }
export type Departure = { line: string; product: string; direction: string; planned: string; actual: string; platform: string | null; realtime: boolean }
export type Leg = {
  walk: boolean
  line: string
  product: string
  direction: string
  from: string
  to: string
  dep: string
  arr: string
  delay: number | null
  platform: string | null
  minutes?: number
}
export type Trip = { leaveAt: string; stop: string; walk: number; legs: Leg[]; arrival: string; arrivalRt: string; minTransfer: number | null }
export type Plan = {
  memberId: string
  target: { key: string; title: string; start: string; place: { id: string; name: string; buffer: number }; source: 'calendar' | 'shift' }
  trip: Trip | null
  earlier: Trip | null
  status: 'ok' | 'tight' | 'late' | 'none'
}
export type Unknown = { eventId: string; title: string; start: string; location: string | null }
type PlansResponse = { plans: Plan[]; unknown: Unknown[]; wallMinutes: number; onWall: string[] }

export const TRANSIT_DEFAULTS = {
  stops: [] as Stop[],
  morning_from: '06:00',
  morning_to: '09:00',
  wall_minutes: 30,
}
export function useTransitConfig() {
  return useModuleConfig('abfahrten', TRANSIT_DEFAULTS)
}

// Letzte Antworten im Speicher: Seitenwechsel zeigen sofort den letzten Stand
let lastPlans: PlansResponse | null = null
let lastBoard: { stop: Stop; departures: Departure[] }[] | null = null

/** Nächste Wege aller Personen (minütlich neu, nur solange die Seite sichtbar ist) */
export function usePlans(active = true): PlansResponse | null {
  const [data, setData] = useState<PlansResponse | null>(lastPlans)
  useEffect(() => {
    if (!active) return
    return poll(60_000, async () => {
      const { data } = await supabase.functions.invoke<PlansResponse>('transit?action=plans', { method: 'GET' })
      if (data) {
        lastPlans = data
        setData(data)
      }
    })
  }, [active])
  return active ? data : null
}

/** Abfahrtstafel der Haltestellen zuhause (alle 30 Sekunden neu) */
export function useBoard(active = true) {
  const [data, setData] = useState(lastBoard)
  useEffect(() => {
    if (!active) return
    return poll(30_000, async () => {
      const { data } = await supabase.functions.invoke<{ stops: { stop: Stop; departures: Departure[] }[] }>('transit?action=board', {
        method: 'GET',
      })
      if (data) {
        lastBoard = data.stops
        setData(data.stops)
      }
    })
  }, [active])
  return data
}

function poll(ms: number, load: () => Promise<void>): () => void {
  let stop = false
  let timer: ReturnType<typeof setTimeout>
  const run = async () => {
    clearTimeout(timer)
    if (document.visibilityState === 'visible') await load().catch(() => {})
    if (!stop) timer = setTimeout(run, ms)
  }
  run()
  const onWake = () => document.visibilityState === 'visible' && run()
  document.addEventListener('visibilitychange', onWake)
  return () => {
    stop = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onWake)
  }
}

/** Adresse suchen (für neue Ziele) */
export async function searchAddress(q: string): Promise<{ lat: number; lon: number; label: string }[]> {
  const { data } = await supabase.functions.invoke<{ results: { lat: number; lon: number; label: string }[] }>(
    `transit?action=geocode&q=${encodeURIComponent(q)}`,
    { method: 'GET' },
  )
  return data?.results ?? []
}

/** Uhrzeit in Berlin „7:06“ */
export function hm(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** Abfahrt mit Verspätung */
export function depRt(l: Leg): string {
  return new Date(Date.parse(l.dep) + (l.delay ?? 0) * 60000).toISOString()
}
