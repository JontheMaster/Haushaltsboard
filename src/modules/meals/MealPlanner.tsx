import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CalendarPlus, ChefHat, Clock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { addDays, dayLabel, mondayOf, useToday } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { DayTimeline, hourRange, TimeLabels } from '../calendar/Timeline'
import { useCalendar } from '../calendar/useCalendar'
import { startCooking } from './cookStore'
import { formatDuration } from './ingredients'
import { MEAL_PREFIX, useMeals, useWithMeals } from './mealStore'
import { usePlanFlow } from './MealsTab'
import { DEFAULT_TIME } from './PlanSheet'
import { RecipeDetail } from './RecipeDetail'
import { CategoryTags, RecipeFilters, RecipeImage, useRecipeFilter } from './RecipeLibrary'
import { useCategories, useRecipes, type Category, type Recipe } from './recipeStore'

/** Ablagepunkt → Uhrzeit, auf 15 Minuten gerundet */
function timeAt(day: string, y: number, range: { from: number; to: number }): string | null {
  const el = document.querySelector(`[data-tl-day="${day}"] .hb-tl-day`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (y < r.top) return null // auf die Ganztags-Zeile oder den Kopf gelegt
  const frac = Math.min(1, (y - r.top) / r.height)
  const min = Math.round(((range.from + frac * (range.to - range.from)) * 60) / 15) * 15
  const h = Math.min(23, Math.floor(min / 60))
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/**
 * Essen planen an der Wand: links die Rezepte (groß, mit Bild), rechts die Woche als Zeitplan.
 * Rezept auf einen Tag ziehen → Uhrzeit ergibt sich aus der Stelle; danach Einplanen bestätigen und Zutaten einkaufen.
 */
export function MealPlanner({ showToast }: { showToast: (m: string) => void }) {
  const today = useToday()
  const [offset, setOffset] = useState(0)
  const monday = addDays(mondayOf(today), 7 * offset)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const { events: raw } = useCalendar()
  const events = useWithMeals(raw)
  const meals = useMeals()
  const { recipes } = useRecipes()
  const categories = useCategories()
  const filter = useRecipeFilter(recipes)
  const flow = usePlanFlow(showToast)
  const [dragging, setDragging] = useState<Recipe | null>(null)
  const [open, setOpen] = useState<Recipe | null>(null)

  const weekEvents = days.map((day) => ({ day, events: events ? eventsOnDay(events, day) : [] }))
  const range = hourRange(weekEvents)
  const allDaySlots = Math.max(0, ...weekEvents.map((d) => d.events.filter((e) => e.allDay).length))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const recipe = recipes?.find((r) => r.id === e.active.id)
    if (!recipe || !e.over) return
    const day = String(e.over.id).slice(4)
    // Fingerposition beim Loslassen
    const start = e.activatorEvent as PointerEvent | null
    const y = (start?.clientY ?? 0) + e.delta.y
    flow.setPlan({ recipe, day, time: timeAt(day, y, range) ?? DEFAULT_TIME })
  }

  const tapEvent = (id: string) => {
    if (!id.startsWith(MEAL_PREFIX)) return
    const meal = meals?.find((m) => m.id === id.slice(MEAL_PREFIX.length))
    if (meal) flow.setPlan({ meal })
  }

  return (
    <DndContext
      sensors={sensors}
      // Ablage dort, wo der Finger ist (die große Karte würde sonst die Nachbarspalte treffen)
      collisionDetection={pointerWithin}
      onDragStart={(e) => setDragging(recipes?.find((r) => r.id === e.active.id) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="hb-planner">
        <section className="hb-planner-library" aria-label="Rezepte">
          <RecipeFilters {...filter} categories={categories} />
          <p className="text-label text-ink-muted">Rezept auf einen Tag ziehen. Antippen zeigt das Rezept.</p>
          <div className="hb-planner-cards hb-scroll-quiet">
            {recipes?.length === 0 && <p className="text-body text-ink-muted">Noch keine Rezepte. Leg sie am Handy an (Reiter Essen).</p>}
            {filter.list.map((r) => (
              <DraggableRecipe key={r.id} recipe={r} categories={categories} onTap={() => setOpen(r)} />
            ))}
          </div>
        </section>

        <section className="hb-planner-week" aria-label="Woche">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2" role="group" aria-label="Woche wählen">
              <button type="button" className={`hb-choice ${offset === 0 ? 'is-on' : ''}`} aria-pressed={offset === 0} onClick={() => setOffset(0)}>
                Diese Woche
              </button>
              <button type="button" className={`hb-choice ${offset === 1 ? 'is-on' : ''}`} aria-pressed={offset === 1} onClick={() => setOffset(1)}>
                Nächste Woche
              </button>
            </div>
            <span className="text-label text-ink-muted">Mit Besteck: eure Essen. Grau: Termine.</span>
          </div>
          <div className="hb-planner-grid">
            <div style={{ gridColumn: 1, gridRow: 2 }} className="flex min-h-0 flex-col">
              <TimeLabels range={range} allDaySlots={allDaySlots} />
            </div>
            {days.map((day, i) => (
              <DayColumn
                key={day}
                day={day}
                col={i + 2}
                past={day < today}
                today={day === today}
                events={weekEvents[i].events}
                range={range}
                allDaySlots={allDaySlots}
                onTapEvent={tapEvent}
              />
            ))}
          </div>
        </section>
      </div>

      <DragOverlay dropAnimation={null}>{dragging ? <RecipeTile recipe={dragging} categories={categories} lifted /> : null}</DragOverlay>

      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <RecipeDetail
            recipe={open}
            actions={(servings) => (
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  icon={<Icon icon={CalendarPlus} size={22} />}
                  onClick={() => {
                    setOpen(null)
                    flow.setPlan({ recipe: open })
                  }}
                >
                  Einplanen
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  icon={<Icon icon={ChefHat} size={22} />}
                  onClick={() => {
                    setOpen(null)
                    startCooking(open, servings)
                  }}
                >
                  Kochen
                </Button>
              </div>
            )}
          />
        </Sheet>
      )}
      {flow.sheets({})}
    </DndContext>
  )
}

function DayColumn({
  day,
  col,
  past,
  today,
  events,
  range,
  allDaySlots,
  onTapEvent,
}: {
  day: string
  col: number
  past: boolean
  today: boolean
  events: ReturnType<typeof eventsOnDay>
  range: { from: number; to: number }
  allDaySlots: number
  onTapEvent: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, disabled: past })
  return (
    <>
      <header className={`hb-week-day ${today ? 'is-today' : ''} ${past ? 'is-past' : ''}`} style={{ gridColumn: col, gridRow: 1 }}>
        {dayLabel(day)}
      </header>
      <div
        ref={setNodeRef}
        data-tl-day={day}
        className={`hb-drop hb-drop-plain hb-planner-day flex min-h-0 flex-col ${isOver ? 'is-over' : ''} ${past ? 'is-disabled' : ''}`}
        style={{ gridColumn: col, gridRow: 2 }}
      >
        <DayTimeline day={day} events={events} range={range} allDaySlots={allDaySlots} onTapEvent={onTapEvent} />
      </div>
    </>
  )
}

function DraggableRecipe({ recipe, categories, onTap }: { recipe: Recipe; categories: Category[]; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: recipe.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`${recipe.title}, ziehen zum Einplanen, antippen zum Ansehen`}
      className={`touch-none ${isDragging ? 'opacity-35' : ''}`}
      onClick={onTap}
    >
      <RecipeTile recipe={recipe} categories={categories} />
    </div>
  )
}

/** Große Rezeptkarte an der Wand: Bild oben, darunter Name, Dauer, Kategorien */
function RecipeTile({ recipe, categories, lifted }: { recipe: Recipe; categories: Category[]; lifted?: boolean }) {
  return (
    <div className={`hb-recipe-tile ${lifted ? 'is-lifted' : ''}`}>
      <RecipeImage recipe={recipe} className="hb-recipe-tile-img" />
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <span className="hb-recipe-title">{recipe.title}</span>
        {recipe.duration_min ? (
          <span className="inline-flex items-center gap-1 text-label text-ink-muted">
            <Icon icon={Clock} size={16} />
            {formatDuration(recipe.duration_min)}
          </span>
        ) : null}
        <CategoryTags ids={recipe.category_ids} categories={categories} />
      </div>
    </div>
  )
}
