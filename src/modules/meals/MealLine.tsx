import { UtensilsCrossed } from 'lucide-react'
import { useMemo } from 'react'
import { Icon } from '../../components/Icon'
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
