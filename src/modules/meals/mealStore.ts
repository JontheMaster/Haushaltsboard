// Geplante Essen (Tabelle meals), live auf allen Geräten.
// Im Kalender erscheinen sie als eigene „Termine“ (Farbe meal), damit Woche und Zeitplan sie ohne Sonderweg zeigen.
import { useEffect, useMemo, useState } from 'react'
import type { Database, Tables } from '../../lib/database.types'
import { addDays, berlinAtISO, mondayOf, useToday } from '../../lib/time'
import { supabase } from '../../lib/supabase'
import type { CalendarEvent } from '../calendar/useCalendar'
import { useEnabledModules } from '../useModules'

export type Meal = Tables<'meals'>

export const MEAL_PREFIX = 'meal:'
const DEFAULT_MINUTES = 45

let cache: Meal[] | null = null

/** Essen ab Montag dieser Woche bis Ende übernächster Woche */
export function useMeals(): Meal[] | null {
  const today = useToday()
  const from = mondayOf(today)
  const to = addDays(from, 20)
  const [meals, setMeals] = useState<Meal[] | null>(cache)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('meals').select('*').gte('day', from).lte('day', to).order('day').order('start_time', { nullsFirst: true })
      if (!alive || !data) return
      cache = data
      setMeals(data)
    }
    load()
    const ch = supabase
      .channel(`meals-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, load)
      .subscribe()
    const onWake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onWake)
    return () => {
      alive = false
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [from, to])
  return meals
}

/** „HH:MM:SS“ → „HH:MM“ */
export const hm = (t: string | null) => (t ? t.slice(0, 5) : null)

/** Essen als Kalendereintrag: mit Uhrzeit ein Block über die Kochzeit, sonst ganztags */
export function mealEvent(m: Meal): CalendarEvent {
  const time = hm(m.start_time)
  if (!time) return { id: MEAL_PREFIX + m.id, calendar: 'essen', person: null, title: m.title, start: m.day, end: addDays(m.day, 1), allDay: true, color: 'meal' }
  const start = berlinAtISO(m.day, time)
  const end = new Date(Date.parse(start) + (m.duration_min || DEFAULT_MINUTES) * 60000).toISOString()
  return { id: MEAL_PREFIX + m.id, calendar: 'essen', person: null, title: m.title, start, end, allDay: false, color: 'meal' }
}

/** Kalendertermine plus geplante Essen (wenn das Modul an ist) */
export function useWithMeals(events: CalendarEvent[] | null): CalendarEvent[] | null {
  const enabled = useEnabledModules()
  const meals = useMeals()
  const on = enabled?.has('essensplan') ?? false
  return useMemo(() => {
    if (!on || !meals?.length) return events
    return [...(events ?? []), ...meals.map(mealEvent)]
  }, [events, meals, on])
}

export const isMealEvent = (e: Pick<CalendarEvent, 'id'>) => e.id.startsWith(MEAL_PREFIX)

export async function planMeal(row: Database['public']['Tables']['meals']['Insert']): Promise<Meal | null> {
  const { data, error } = await supabase.from('meals').insert(row).select().single()
  return error ? null : data
}

export async function updateMeal(id: string, patch: Partial<Pick<Meal, 'day' | 'start_time' | 'servings' | 'duration_min'>>): Promise<boolean> {
  const { error } = await supabase.from('meals').update(patch).eq('id', id)
  return !error
}

export async function deleteMeal(id: string): Promise<boolean> {
  const { error } = await supabase.from('meals').delete().eq('id', id)
  return !error
}
