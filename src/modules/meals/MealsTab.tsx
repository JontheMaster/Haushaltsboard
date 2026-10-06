import { CalendarPlus, ChefHat, Plus, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { addDays, useToday, weekdayShort } from '../../lib/time'
import { BringSheet } from './BringSheet'
import { startCooking } from './cookStore'
import { hm, useMeals, type Meal } from './mealStore'
import { PlanSheet } from './PlanSheet'
import { RecipeDetail } from './RecipeDetail'
import { RecipeEditor } from './RecipeEditor'
import { RecipeDice } from './RecipeDice'
import { RecipeImage, RecipeLibrary } from './RecipeLibrary'
import { useRecipes, type Recipe } from './recipeStore'

type View = { kind: 'list' } | { kind: 'recipe'; id: string } | { kind: 'edit'; id?: string }

/** Gemeinsamer Ablauf Einplanen → Einkaufen (Handy und Wand) */
export function usePlanFlow(showToast: (m: string) => void) {
  const [plan, setPlan] = useState<{ recipe?: Recipe | null; meal?: Meal; day?: string; time?: string | null } | null>(null)
  const [bring, setBring] = useState<{ recipe: Recipe; servings: number; title: string } | null>(null)
  const { recipes } = useRecipes()
  const recipeOf = (id: string | null | undefined) => recipes?.find((r) => r.id === id) ?? null

  const sheets = (opts: { openRecipe?: (id: string) => void }) => (
    <>
      {plan && (
        <PlanSheet
          recipe={plan.recipe ?? recipeOf(plan.meal?.recipe_id)}
          meal={plan.meal}
          day={plan.day}
          time={plan.time}
          onClose={() => setPlan(null)}
          onSaved={showToast}
          onPlanned={(meal) => {
            const r = plan.recipe ?? recipeOf(meal.recipe_id)
            setPlan(null)
            if (r?.ingredients.length) setBring({ recipe: r, servings: meal.servings, title: meal.title })
            else showToast(`${meal.title} eingeplant`)
          }}
          onOpenRecipe={
            opts.openRecipe && plan.meal?.recipe_id
              ? () => {
                  opts.openRecipe!(plan.meal!.recipe_id!)
                  setPlan(null)
                }
              : undefined
          }
          onCook={(servings) => {
            const r = recipeOf(plan.meal?.recipe_id)
            setPlan(null)
            if (r) startCooking(r, servings)
          }}
        />
      )}
      {bring && (
        <BringSheet
          recipe={bring.recipe}
          servings={bring.servings}
          title={bring.title}
          onClose={() => {
            setBring(null)
            showToast(`${bring.title} eingeplant`)
          }}
          onDone={(m) => {
            setBring(null)
            showToast(m)
          }}
        />
      )}
    </>
  )
  return { setPlan, sheets, recipeOf }
}

/** Essen am Handy: was geplant ist, Rezeptbibliothek, Rezept, Bearbeiten */
export function MealsTab({ showToast }: { showToast: (m: string) => void }) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const { recipes } = useRecipes()
  const flow = usePlanFlow(showToast)
  const go = (v: View) => {
    setView(v)
    window.scrollTo({ top: 0 })
  }
  const openRecipe = (id: string) => go({ kind: 'recipe', id })

  const current = view.kind === 'recipe' || view.kind === 'edit' ? recipes?.find((r) => r.id === view.id) : undefined

  return (
    <>
      {view.kind === 'edit' ? (
        <RecipeEditor
          key={view.id ?? 'neu'}
          recipe={current}
          onBack={() => go(view.id ? { kind: 'recipe', id: view.id } : { kind: 'list' })}
          onSaved={(id) => {
            showToast('Rezept gespeichert')
            go({ kind: 'recipe', id })
          }}
          onDeleted={() => {
            showToast('Rezept gelöscht')
            go({ kind: 'list' })
          }}
        />
      ) : view.kind === 'recipe' && current ? (
        <RecipeDetail
          recipe={current}
          onBack={() => go({ kind: 'list' })}
          onEdit={() => go({ kind: 'edit', id: current.id })}
          actions={(servings) => (
            <div className="flex gap-2">
              <Button variant="primary" size="lg" className="flex-1" icon={<Icon icon={CalendarPlus} size={22} />} onClick={() => flow.setPlan({ recipe: current })}>
                Einplanen
              </Button>
              <Button size="lg" className="flex-1" icon={<Icon icon={ChefHat} size={22} />} onClick={() => startCooking(current, servings)}>
                Kochen
              </Button>
            </div>
          )}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Planned onOpen={(meal) => flow.setPlan({ meal })} />
          <RecipeLibrary
            onOpen={(r) => openRecipe(r.id)}
            headerAction={(shown) => <RecipeDice recipes={shown} onPlan={(r) => flow.setPlan({ recipe: r })} />}
            cardAction={(r) => (
              <button type="button" className="hb-icon-btn hb-recipe-plan" aria-label={`${r.title} einplanen`} onClick={() => flow.setPlan({ recipe: r })}>
                <Icon icon={CalendarPlus} size={22} />
              </button>
            )}
          />
        </div>
      )}

      {view.kind === 'list' && (
        <button type="button" className="hb-fab" aria-label="Rezept hinzufügen" onClick={() => go({ kind: 'edit' })}>
          <Icon icon={Plus} size={28} />
        </button>
      )}

      {flow.sheets({ openRecipe })}
    </>
  )
}

function dayName(day: string, today: string): string {
  if (day === today) return 'Heute'
  if (day === addDays(today, 1)) return 'Morgen'
  return `${weekdayShort(day)} ${Number(day.slice(8))}.${Number(day.slice(5, 7))}.`
}

/** Die nächsten geplanten Essen, antippen zum Ändern oder Kochen */
function Planned({ onOpen }: { onOpen: (m: Meal) => void }) {
  const today = useToday()
  const meals = (useMeals() ?? []).filter((m) => m.day >= today)
  const { recipes } = useRecipes()
  if (!meals.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-title text-ink">Geplant</h2>
      <div className="flex flex-col gap-2">
        {meals.slice(0, 8).map((m) => {
          const r = recipes?.find((x) => x.id === m.recipe_id)
          return (
            <button key={m.id} type="button" className="hb-rule" onClick={() => onOpen(m)}>
              {r ? <RecipeImage recipe={r} className="hb-recipe-img-sm" /> : <span className="hb-recipe-img hb-recipe-img-sm"><Icon icon={UtensilsCrossed} size={20} /></span>}
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-body font-semibold text-ink">{m.title}</span>
                <span className="text-label text-ink-muted">
                  {dayName(m.day, today)}
                  {hm(m.start_time) ? ` · ${hm(m.start_time)}` : ''} · {m.servings} {m.servings === 1 ? 'Portion' : 'Portionen'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
