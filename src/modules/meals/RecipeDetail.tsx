import { ArrowLeft, ExternalLink, Minus, Pencil, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { quantity } from './ingredients'
import { CategoryTags, RecipeImage, RecipeMeta } from './RecipeLibrary'
import { useCategories, type Recipe } from './recipeStore'

/** Portionen ändern: − 2 + */
export function ServingsStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="hb-stepper" role="group" aria-label="Portionen">
      <button type="button" className="hb-icon-btn" aria-label="Eine Portion weniger" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Icon icon={Minus} size={20} />
      </button>
      <span className="hb-stepper-value" aria-live="polite">
        {value} {value === 1 ? 'Portion' : 'Portionen'}
      </span>
      <button type="button" className="hb-icon-btn" aria-label="Eine Portion mehr" disabled={value >= 20} onClick={() => onChange(value + 1)}>
        <Icon icon={Plus} size={20} />
      </button>
    </div>
  )
}

/** Zutatenliste, auf die Portionen umgerechnet */
export function IngredientList({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const factor = servings / (recipe.servings || 2)
  if (!recipe.ingredients.length) return <p className="text-body text-ink-muted">Keine Zutaten eingetragen.</p>
  return (
    <ul className="hb-ingredients">
      {recipe.ingredients.map((i, n) => (
        <li key={n}>
          <span className="hb-ingredient-qty">{quantity(i, factor)}</span>
          <span>{i.name}</span>
        </li>
      ))}
    </ul>
  )
}

/** Rezept ansehen: Bild, Zutaten (umrechenbar), Zubereitung */
export function RecipeDetail({
  recipe,
  onBack,
  onEdit,
  actions,
  columns,
}: {
  recipe: Recipe
  onBack?: () => void
  onEdit?: () => void
  actions?: (servings: number) => ReactNode
  /** Wand: Bild und Knöpfe | Zutaten | Zubereitung nebeneinander */
  columns?: boolean
}) {
  const categories = useCategories()
  const [servings, setServings] = useState(recipe.servings || 2)

  return (
    <div className={columns ? 'hb-recipe-columns' : 'flex flex-col gap-4'}>
      <div className="flex min-w-0 flex-col gap-4">
        {onBack && (
          <div className="flex items-center gap-2">
            <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={onBack}>
              <Icon icon={ArrowLeft} size={22} />
            </button>
            <span className="flex-1" />
            {onEdit && (
              <button type="button" className="hb-icon-btn" aria-label="Rezept bearbeiten" onClick={onEdit}>
                <Icon icon={Pencil} size={20} />
              </button>
            )}
          </div>
        )}

        {recipe.image_path && <RecipeImage recipe={recipe} large className="hb-recipe-hero" />}
        <div className="flex flex-col gap-2">
          {/* im Fenster (Wand) steht der Name schon oben */}
          {onBack && <h2 className="font-display text-title text-ink">{recipe.title}</h2>}
          <RecipeMeta recipe={recipe} servings={servings} />
          <CategoryTags ids={recipe.category_ids} categories={categories} />
        </div>

        {actions?.(servings)}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="hb-tile hb-tile-static gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-body-wall font-semibold text-ink">Zutaten</h3>
            <ServingsStepper value={servings} onChange={setServings} />
          </div>
          <IngredientList recipe={recipe} servings={servings} />
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="hb-tile hb-tile-static gap-3 p-4">
          <h3 className="font-display text-body-wall font-semibold text-ink">Zubereitung</h3>
          {recipe.steps.length ? (
            <ol className="hb-steps">
              {recipe.steps.map((s, n) => (
                <li key={n}>
                  <span className="hb-step-num">{n + 1}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-ink-muted">Keine Schritte eingetragen.</p>
          )}
        </section>

        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 self-start text-label text-ink-muted underline"
          >
            <Icon icon={ExternalLink} size={16} />
            Original ansehen
          </a>
        )}
      </div>
    </div>
  )
}
