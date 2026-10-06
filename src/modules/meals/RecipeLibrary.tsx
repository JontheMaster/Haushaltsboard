import { ChefHat, Clock, Search, Users, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { formatDuration } from './ingredients'
import { useCategories, useImageUrl, useRecipes, type Category, type Recipe } from './recipeStore'

/** Bild eines Rezepts (Vorschau oder groß), Platzhalter mit Besteck, solange keins da ist */
export function RecipeImage({ recipe, large, className = '' }: { recipe: Pick<Recipe, 'thumb_path' | 'image_path' | 'title'>; large?: boolean; className?: string }) {
  const url = useImageUrl(large ? recipe.image_path : recipe.thumb_path)
  return (
    <span className={`hb-recipe-img ${className}`}>
      {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <Icon icon={UtensilsCrossed} size={large ? 40 : 28} />}
    </span>
  )
}

/** Dauer · Portionen, z. B. „45 Min · 2 Portionen“ */
export function RecipeMeta({ recipe, servings }: { recipe: Pick<Recipe, 'duration_min' | 'servings'>; servings?: number }) {
  const n = servings ?? recipe.servings
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-muted">
      {recipe.duration_min ? (
        <span className="inline-flex items-center gap-1">
          <Icon icon={Clock} size={16} />
          {formatDuration(recipe.duration_min)}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <Icon icon={Users} size={16} />
        {n} {n === 1 ? 'Portion' : 'Portionen'}
      </span>
    </span>
  )
}

export function CategoryTags({ ids, categories }: { ids: string[]; categories: Category[] }) {
  const names = categories.filter((c) => ids.includes(c.id))
  if (!names.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((c) => (
        <span key={c.id} className="hb-tag">
          {c.name}
        </span>
      ))}
    </span>
  )
}

/** Rezeptkarte: Bild, Name, Dauer, Portionen, Kategorien */
export function RecipeCard({ recipe, categories, onOpen, action }: { recipe: Recipe; categories: Category[]; onOpen: () => void; action?: ReactNode }) {
  return (
    <div className="hb-recipe-card">
      <button type="button" className="hb-recipe-card-main" onClick={onOpen}>
        <RecipeImage recipe={recipe} />
        <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
          <span className="hb-recipe-title">{recipe.title}</span>
          <RecipeMeta recipe={recipe} />
          <CategoryTags ids={recipe.category_ids} categories={categories} />
        </span>
      </button>
      {action}
    </div>
  )
}

/** Suche und Filter nach Kategorie; gemeinsam für Handy und Wand */
export function useRecipeFilter(recipes: Recipe[] | null) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (recipes ?? []).filter(
      (r) =>
        (!category || r.category_ids.includes(category)) &&
        (!q || r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q))),
    )
  }, [recipes, query, category])
  return { list, query, setQuery, category, setCategory }
}

export function RecipeFilters({
  query,
  setQuery,
  category,
  setCategory,
  categories,
}: ReturnType<typeof useRecipeFilter> & { categories: Category[] }) {
  return (
    <>
      <label className="hb-search">
        <Icon icon={Search} size={20} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rezept oder Zutat suchen"
          aria-label="Rezept oder Zutat suchen"
          enterKeyHint="search"
          type="search"
        />
      </label>
      <div className="hb-chip-row" role="group" aria-label="Kategorie">
        <button type="button" className={`hb-choice ${!category ? 'is-on' : ''}`} aria-pressed={!category} onClick={() => setCategory(null)}>
          Alle
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`hb-choice ${category === c.id ? 'is-on' : ''}`}
            aria-pressed={category === c.id}
            onClick={() => setCategory(category === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </>
  )
}

/** Rezeptbibliothek am Handy */
export function RecipeLibrary({ onOpen, cardAction, headerAction }: { onOpen: (r: Recipe) => void; cardAction?: (r: Recipe) => ReactNode; headerAction?: (shown: Recipe[]) => ReactNode }) {
  const { recipes, error } = useRecipes()
  const categories = useCategories()
  const filter = useRecipeFilter(recipes)

  return (
    <div className="flex flex-col gap-4">
      {/* Kategorien und Vorräte: Alle Funktionen → Essensplan */}
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-display text-title text-ink">Rezepte</h2>
        {recipes?.length ? headerAction?.(filter.list) : null}
      </div>
      <RecipeFilters {...filter} categories={categories} />
      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          Rezepte gerade nicht erreichbar. Prüf die Verbindung.
        </p>
      )}
      {recipes === null ? (
        !error && <p className="text-body text-ink-muted">Rezepte laden …</p>
      ) : recipes.length === 0 ? (
        <div className="hb-empty">
          <Icon icon={ChefHat} size={40} className="text-accent" />
          <p className="text-body text-ink">Noch keine Rezepte.</p>
          <p className="text-label text-ink-muted">Tipp unten rechts aufs Plus. Du kannst ein Rezept abtippen oder einen Link von Chefkoch und Co. einfügen.</p>
        </div>
      ) : filter.list.length === 0 ? (
        <p className="text-body text-ink-muted">Nichts gefunden.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filter.list.map((r) => (
            <RecipeCard key={r.id} recipe={r} categories={categories} onOpen={() => onOpen(r)} action={cardAction?.(r)} />
          ))}
        </div>
      )}
    </div>
  )
}
