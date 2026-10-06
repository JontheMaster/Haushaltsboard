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
  chores: { done: number; items: { title: string; n: number }[] }
  /** erledigt pro Mitglied (Todos + Putzplan), „open“ = ohne Namen */
  by: Record<string, number>
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
