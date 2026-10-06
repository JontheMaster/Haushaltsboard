import { ChefHat, UtensilsCrossed } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { berlinAtISO, useNow, useToday } from '../../lib/time'
import { startCooking, useCook } from './cookStore'
import { useMealsByDay } from './MealLine'
import { hm, type Meal } from './mealStore'
import { RecipeImage } from './RecipeLibrary'
import { useRecipes } from './recipeStore'

// So lange nach dem geplanten Beginn bleibt die Karte noch stehen (Kochzeit + Puffer)
const AFTER_MIN = 30

/** Nächstes Essen von heute, das noch nicht vorbei ist (ohne Uhrzeit: den ganzen Tag) */
function useNextMeal(): Meal | null {
  const today = useToday()
  const now = useNow(60_000).getTime()
  const meals = useMealsByDay()(today)
  const open = meals.filter((m) => {
    const t = hm(m.start_time)
    if (!t) return true
    return Date.parse(berlinAtISO(today, t)) + ((m.duration_min ?? 45) + AFTER_MIN) * 60_000 > now
  })
  // mit Uhrzeit zuerst, nach Uhrzeit
  return open.sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))[0] ?? null
}

function when(meal: Meal, now: number, today: string): string {
  const t = hm(meal.start_time)
  if (!t) return 'Heute'
  const diff = Math.round((Date.parse(berlinAtISO(today, t)) - now) / 60_000)
  if (diff <= 0) return `Jetzt · seit ${t}`
  if (diff < 60) return `${t} · in ${diff} Min`
  return `Heute ${t}`
}

/**
 * Wand-Kopfzeile: was heute gekocht wird. Antippen startet gleich den Kochmodus.
 * Nur an der Wand (am Handy steht es im Reiter Essen unter „Geplant“).
 */
export function MealHeader({ variant }: { variant: 'wall' | 'phone' }) {
  const meal = useNextMeal()
  const { recipes } = useRecipes()
  const today = useToday()
  const now = useNow(60_000).getTime()
  const cooking = useCook().session !== null
  if (variant !== 'wall' || !meal || cooking) return null
  const recipe = recipes?.find((r) => r.id === meal.recipe_id) ?? null

  const body = (
    <>
      {recipe ? (
        <RecipeImage recipe={recipe} className="hb-meal-card-img" />
      ) : (
        <span className="hb-recipe-img hb-meal-card-img">
          <Icon icon={UtensilsCrossed} size={24} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="hb-meal-card-when">
          <Icon icon={UtensilsCrossed} size={14} />
          {when(meal, now, today)}
        </span>
        <span className="hb-meal-card-title">{meal.title}</span>
      </span>
      {recipe && (
        <span className="hb-meal-card-go">
          <Icon icon={ChefHat} size={18} />
          Kochen
        </span>
      )}
    </>
  )

  return recipe ? (
    <button
      type="button"
      className="hb-meal-card hb-slot-item"
      data-kind="meal"
      aria-label={`${meal.title}, Kochen starten`}
      onClick={() => startCooking(recipe, meal.servings)}
    >
      {body}
    </button>
  ) : (
    <div className="hb-meal-card hb-slot-item" data-kind="meal">
      {body}
    </div>
  )
}
