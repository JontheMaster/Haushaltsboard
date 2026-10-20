import { createPoller } from '../../lib/sharedPoll'
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
  target: { key: string; title: string; start: string; place: { id: string; name: string; buffer: number }; source: 'calendar' }
  trip: Trip | null
  earlier: Trip | null
  status: 'ok' | 'tight' | 'late' | 'none'
  /** Minuten nach Beginn, die man ankommt (bei „kleine Verspätung erlauben“) */
  lateMin?: number
}
export type Unknown = { eventId: string; title: string; start: string; location: string | null }
type PlansResponse = { plans: Plan[]; unknown: Unknown[]; wallMinutes: number; onWall: string[] }

export const TRANSIT_DEFAULTS = {
  stops: [] as Stop[],
  wall_minutes: 30,
}
export function useTransitConfig() {
  return useModuleConfig('abfahrten', TRANSIT_DEFAULTS)
}

// Eine Abfrage pro Gerät (sharedPoll), egal wie viele Stellen Wege oder Tafel zeigen; behält den letzten Stand
const plansPoller = createPoller<PlansResponse>(
  async () => {
    const { data } = await supabase.functions.invoke<PlansResponse>('transit?action=plans', { method: 'GET' })
    return data ?? null
  },
  () => 60_000,
)
const boardPoller = createPoller<{ stop: Stop; departures: Departure[] }[]>(
  async () => {
    const { data } = await supabase.functions.invoke<{ stops: { stop: Stop; departures: Departure[] }[] }>('transit?action=board', { method: 'GET' })
    return data?.stops ?? null
  },
  () => 30_000,
)

/** Nächste Wege aller Personen (minütlich neu, nur solange die Seite sichtbar ist) */
export function usePlans(active = true): PlansResponse | null {
  return plansPoller.use(active)
}

/** Abfahrtstafel der Haltestellen zuhause (alle 30 Sekunden neu) */
export function useBoard(active = true) {
  return boardPoller.use(active)
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
