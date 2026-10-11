import { ChefHat, UtensilsCrossed } from "lucide-react";
import { Icon } from "../../components/Icon";
import { berlinAtISO, useNow, useToday } from "../../lib/time";
import { startCooking, useCook } from "./cookStore";
import { useMealsByDay } from "./MealLine";
import { hm, type Meal } from "./mealStore";
import { supabase } from "../../lib/supabase";
import { useLongPress } from "../../lib/useLongPress";
import { RecipeImage } from "./RecipeLibrary";
import { useRecipes } from "./recipeStore";

// So lange vor dem geplanten Beginn erscheint die Karte (Entscheidung Jonathan 7.10.2026: nicht schon ab Mitternacht)
const BEFORE_MIN = 30;
// So lange nach dem geplanten Beginn bleibt die Karte noch stehen (Kochzeit + Puffer)
const AFTER_MIN = 30;
// Essen ohne Uhrzeit erst ab dieser Uhrzeit zeigen (Entscheidung Jonathan 7.10.2026)
const NO_TIME_FROM = "11:00";

/** Essen von heute, das gerade dran ist: ab 30 Min vor Kochbeginn bis Kochzeit + 30 Min (ohne Uhrzeit: ab 11 Uhr bis Tagesende) */
function useNextMeal(): Meal | null {
  const today = useToday();
  const now = useNow(60_000).getTime();
  const meals = useMealsByDay()(today);
  const open = meals.filter((m) => {
    if (m.dismissed_at) return false;
    const t = hm(m.start_time);
    if (!t) return Date.parse(berlinAtISO(today, NO_TIME_FROM)) <= now;
    const start = Date.parse(berlinAtISO(today, t));
    return (
      start - BEFORE_MIN * 60_000 <= now &&
      start + ((m.duration_min ?? 45) + AFTER_MIN) * 60_000 > now
    );
  });
  // mit Uhrzeit zuerst, nach Uhrzeit
  return (
    open.sort((a, b) =>
      (a.start_time ?? "99").localeCompare(b.start_time ?? "99"),
    )[0] ?? null
  );
}

function when(meal: Meal, now: number, today: string): string {
  const t = hm(meal.start_time);
  if (!t) return "Heute";
  const diff = Math.round((Date.parse(berlinAtISO(today, t)) - now) / 60_000);
  if (diff <= 0) return `Jetzt · seit ${t}`;
  if (diff < 60) return `${t} · in ${diff} Min`;
  return `Heute ${t}`;
}

/** Karte wegnehmen (gekocht oder nicht mehr nötig): das Essen bleibt im Plan und im Wochenrückblick */
async function dismiss(meal: Meal) {
  if (!confirm(`${meal.title} ausblenden? Das Essen bleibt im Plan.`)) return;
  await supabase
    .from("meals")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", meal.id);
}

/**
 * Was heute gekocht wird: an der Wand in der Kopfzeile, am Handy oben auf der Startseite.
 * Antippen startet gleich den Kochmodus, lange drücken blendet die Karte aus (mit Nachfrage, wie beim Timer).
 * Ohne Rezept: Antippen blendet aus.
 */
export function MealHeader(_: { variant: "wall" | "phone" }) {
  const meal = useNextMeal();
  const press = useLongPress(() => meal && dismiss(meal));
  const { recipes } = useRecipes();
  const today = useToday();
  const now = useNow(60_000).getTime();
  const cooking = useCook().session !== null;
  if (!meal || cooking) return null;
  const recipe = recipes?.find((r) => r.id === meal.recipe_id) ?? null;

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
          {/* Besteck dampft: das Essen ist gleich dran */}
          <span className="hb-steam">
            <Icon icon={UtensilsCrossed} size={14} />
          </span>
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
  );

  return (
    <button
      type="button"
      className="hb-meal-card hb-slot-item"
      data-kind="meal"
      aria-label={
        recipe
          ? `${meal.title}, antippen startet Kochen, lange drücken blendet aus`
          : `${meal.title}, antippen blendet aus`
      }
      onPointerDown={recipe ? press.onPointerDown : undefined}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (press.fired.current) return;
        if (recipe) startCooking(recipe, meal.servings);
        else dismiss(meal);
      }}
    >
      {body}
    </button>
  );
}
