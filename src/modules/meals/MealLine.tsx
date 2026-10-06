import { UtensilsCrossed } from 'lucide-react'
import { useMemo } from 'react'
import { Icon } from '../../components/Icon'
import { berlinAtISO } from '../../lib/time'
import type { CalendarEvent } from '../calendar/useCalendar'
import { useEnabledModules } from '../useModules'
import { hm, mealEvent, useMeals, type Meal } from './mealStore'

/**
 * Geplante Essen pro Tag (leer, wenn das Modul aus ist).
 * In Kalender und Woche stehen Essen nicht als Termin, sondern als eigene schmale Zeile bzw. als Band im Zeitplan.
 */
export function useMealsByDay(): (day: string) => Meal[] {
  const enabled = useEnabledModules()
  const meals = useMeals()
  const on = enabled?.has('essensplan') ?? false
  return useMemo(() => {
    const map = new Map<string, Meal[]>()
    if (on) for (const m of meals ?? []) map.set(m.day, [...(map.get(m.day) ?? []), m])
    return (day: string) => map.get(day) ?? []
  }, [meals, on])
}

/** Essen als Zeitplan-Einträge (für den Stundenbereich und die Bänder) */
export const mealBands = (meals: Meal[]) => meals.filter((m) => m.start_time).map(mealEvent)

export type Slot = { kind: 'event'; event: CalendarEvent } | { kind: 'meal'; meal: Meal }

/** Termine und Essen eines Tages zeitlich gemischt: Ganztägiges und Essen ohne Uhrzeit oben, dann nach Beginn */
export function byTime(events: CalendarEvent[], meals: Meal[], day: string): Slot[] {
  const key = (s: Slot) =>
    s.kind === 'event' ? (s.event.allDay ? '' : s.event.start) : s.meal.start_time ? berlinAtISO(day, hm(s.meal.start_time)!) : ''
  const slots: Slot[] = [...events.map((event) => ({ kind: 'event' as const, event })), ...meals.map((meal) => ({ kind: 'meal' as const, meal }))]
  // bei gleicher Zeit zuerst der Termin
  return slots.sort((a, b) => key(a).localeCompare(key(b)) || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1))
}

/** Schmale Zeile unter dem Tag: Besteck · 18:30 Pizza · Salat */
export function MealLine({ meals, wall }: { meals: Meal[]; wall?: boolean }) {
  if (!meals.length) return null
  const text = meals.map((m) => [hm(m.start_time), m.title].filter(Boolean).join(' ')).join(' · ')
  return (
    <div className={`hb-meal-line ${wall ? 'is-wall' : ''}`} title={text}>
      <Icon icon={UtensilsCrossed} size={wall ? 16 : 15} label="Essen" />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  )
}
