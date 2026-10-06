import { CalendarPlus, Dices } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { supabase } from '../../lib/supabase'
import { addDays, useToday } from '../../lib/time'
import { RecipeImage, RecipeMeta } from './RecipeLibrary'
import type { Recipe } from './recipeStore'

// Ab so vielen Tagen ohne dieses Essen zählt ein Rezept wie „noch nie gekocht“ (volles Gewicht)
const FULL_AFTER_DAYS = 60

/** Letztes Mal je Rezept (YYYY-MM-DD), nur vergangene und heutige Essen */
async function lastCooked(today: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('meals').select('recipe_id, day').not('recipe_id', 'is', null).lte('day', today).order('day', { ascending: false }).limit(2000)
  const last = new Map<string, string>()
  for (const m of data ?? []) if (m.recipe_id && !last.has(m.recipe_id)) last.set(m.recipe_id, m.day)
  return last
}

/** Schon für die nächsten Tage geplant? Dann nicht vorschlagen */
async function plannedSoon(today: string): Promise<Set<string>> {
  const { data } = await supabase.from('meals').select('recipe_id').gte('day', today).lte('day', addDays(today, 7))
  return new Set((data ?? []).map((m) => m.recipe_id).filter((id): id is string => !!id))
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Zufälliges Rezept, je länger nicht gekocht, desto wahrscheinlicher; nie zweimal hintereinander dasselbe */
function pick(list: Recipe[], last: Map<string, string>, soon: Set<string>, today: string, previous: string | null): Recipe | null {
  let pool = list.filter((r) => !soon.has(r.id) && r.id !== previous)
  if (!pool.length) pool = list.filter((r) => r.id !== previous)
  if (!pool.length) pool = list
  if (!pool.length) return null
  const weights = pool.map((r) => {
    const day = last.get(r.id)
    const gap = day ? daysBetween(day, today) : FULL_AFTER_DAYS
    return 1 + Math.min(gap, FULL_AFTER_DAYS)
  })
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

function lastText(day: string | undefined, today: string): string {
  if (!day) return 'Gab es noch nie.'
  const d = daysBetween(day, today)
  if (d === 0) return 'Gab es heute schon.'
  if (d === 1) return 'Gab es gestern.'
  if (d < 14) return `Zuletzt vor ${d} Tagen.`
  if (d < 60) return `Zuletzt vor ${Math.round(d / 7)} Wochen.`
  return `Zuletzt vor ${Math.round(d / 30)} Monaten.`
}

/**
 * „Was koche ich?“: kleiner Würfel-Knopf neben den Rezepten (bewusst unauffällig).
 * Würfelt aus den gerade gezeigten Rezepten (Filter gilt), ein Tipp auf Einplanen öffnet den normalen Ablauf.
 */
export function RecipeDice({ recipes, onPlan }: { recipes: Recipe[]; onPlan: (r: Recipe) => void }) {
  const today = useToday()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ last: Map<string, string>; soon: Set<string> } | null>(null)
  const [current, setCurrent] = useState<Recipe | null>(null)
  const [roll, setRoll] = useState(0)
  // nur beim Öffnen würfeln, nicht bei jeder Änderung der Liste
  const listRef = useRef(recipes)
  useEffect(() => {
    listRef.current = recipes
  })

  useEffect(() => {
    if (!open) return
    let alive = true
    Promise.all([lastCooked(today), plannedSoon(today)]).then(([last, soon]) => {
      if (!alive) return
      setData({ last, soon })
      setCurrent(pick(listRef.current, last, soon, today, null))
    })
    return () => {
      alive = false
    }
  }, [open, today])

  function again() {
    if (!data) return
    setCurrent(pick(recipes, data.last, data.soon, today, current?.id ?? null))
    setRoll((n) => n + 1)
  }

  function close() {
    setOpen(false)
    setData(null)
    setCurrent(null)
  }

  return (
    <>
      <button type="button" className="hb-icon-btn hb-dice-btn" aria-label="Was koche ich? Zufälliges Rezept" title="Was koche ich?" disabled={!recipes.length} onClick={() => setOpen(true)}>
        <Icon icon={Dices} size={20} />
      </button>
      {open && (
        <Sheet title="Wie wär's mit …" onClose={close}>
          {!data ? (
            <p className="text-body text-ink-muted">Einen Moment …</p>
          ) : !current ? (
            <p className="text-body text-ink-muted">Keine Rezepte zum Würfeln.</p>
          ) : (
            <div key={`${current.id}-${roll}`} className="hb-dice-result flex flex-col gap-3">
              <RecipeImage recipe={current} large className="hb-dice-img" />
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-title text-ink">{current.title}</h3>
                <RecipeMeta recipe={current} />
                <p className="text-label text-ink-muted">{lastText(data.last.get(current.id), today)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  icon={<Icon icon={CalendarPlus} size={22} />}
                  onClick={() => {
                    close()
                    onPlan(current)
                  }}
                >
                  Einplanen
                </Button>
                <Button size="lg" icon={<Icon icon={Dices} size={22} />} disabled={recipes.length < 2} onClick={again}>
                  Noch mal
                </Button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}
