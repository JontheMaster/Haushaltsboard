// Wochenrückblick: ob er gerade offen ist (Wand und Handy), Daten aus public.week_recap()
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { berlinTime, useNow, useToday, weekdayShort } from '../../lib/time'

// Sonntags ab dieser Stunde steht die Karte oben (bis Mitternacht)
export const RECAP_FROM_HOUR = 15

/** Ist gerade Sonntagnachmittag/-abend (Berlin)? */
export function useRecapTime(): boolean {
  const today = useToday()
  const now = useNow(60_000)
  return weekdayShort(today) === 'So' && Number(berlinTime(now).hh) >= RECAP_FROM_HOUR
}

let open = false
const listeners = new Set<() => void>()

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useRecapOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open)
}

export function openRecap() {
  open = true
  listeners.forEach((l) => l())
}

/**
 * Rückblick angesehen: die Karte oben verschwindet für dieses Konto (Handy = Person, Wand = Tablet-Konto),
 * gemerkt pro Mitglied und Sonntag in `modules.config.seen` von `wochenrueckblick`.
 */
export async function markRecapSeen(memberId: string, day: string) {
  const { data } = await supabase.from('modules').select('config').eq('id', 'wochenrueckblick').maybeSingle()
  const config = (data?.config as Record<string, unknown> | null) ?? {}
  const seen = (config.seen as Record<string, string> | undefined) ?? {}
  if (seen[memberId] === day) return
  await supabase.from('modules').upsert({ id: 'wochenrueckblick', config: { ...config, seen: { ...seen, [memberId]: day } } as never })
}

export function closeRecap() {
  open = false
  listeners.forEach((l) => l())
}

/**
 * Antippen der Sonntags-Mitteilung: die App startet mit ?rueckblick, oder das offene Fenster
 * bekommt eine Nachricht vom Service Worker. Beides öffnet den Rückblick.
 */
export function listenForRecapLinks() {
  const params = new URLSearchParams(location.search)
  if (params.has('rueckblick')) {
    params.delete('rueckblick')
    const rest = params.toString()
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
    openRecap()
  }
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.open === 'rueckblick') openRecap()
  })
}

export type Recap = {
  week_start: string
  week_end: string
  todos: { done: number; items: { title: string; done_by: string | null; day: string }[] }
  chores: { done: number; items: { title: string; n: number; by?: string[] }[] }
  /** erledigt pro Mitglied (Todos + Putzplan), „open“ = ohne Namen */
  by: Record<string, number>
  /** pro Mitglied getrennt nach Todos und Putzplan */
  by_kind?: Record<string, { todos: number; chores: number }>
  /** früheste / späteste Uhrzeit beim Abhaken (Nacht bis 4 Uhr zählt als spät) */
  earliest?: { member: string; time: string } | null
  latest?: { member: string; time: string } | null
  /** fertige Timer (z. B. Wäsche-Runden) und Heimwege mit dem Auto */
  timers?: { label: string; n: number }[]
  drives?: { n: number; km: number }
  /** Haushaltsausgaben der Woche (nur Summen, aus dem Modul Finanzen) */
  fin?: {
    total: number
    top: { name: string; amount: number } | null
    prev?: number
    cats?: { name: string; color: string; amount: number }[] | null
    shop?: { name: string; n: number; amount: number } | null
    card_payments?: number
  } | null
  best_day: { day: string; n: number } | null
  meals: { title: string; day: string; recipe_id: string | null }[]
  open: number
  prev_done: number
  photos: number
}

/** Rückblick einer Woche (Montag als YYYY-MM-DD; ohne = laufende Woche) */
export function useRecap(weekStart?: string): Recap | null | 'error' {
  const [recap, setRecap] = useState<{ key: string; value: Recap | 'error' } | null>(null)
  const key = weekStart ?? 'now'

  useEffect(() => {
    let alive = true
    supabase.rpc('week_recap', weekStart ? { p_week_start: weekStart } : {}).then(({ data, error }) => {
      if (alive) setRecap({ key, value: error || !data ? 'error' : (data as unknown as Recap) })
    })
    return () => {
      alive = false
    }
  }, [key, weekStart])

  return recap?.key === key ? recap.value : null
}
