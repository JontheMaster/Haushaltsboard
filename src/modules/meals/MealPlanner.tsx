import { DndContext, DragOverlay, MouseSensor, pointerWithin, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core'
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
import { hm, mealEvent, useMeals, type Meal } from './mealStore'
import { RecipeDice } from './RecipeDice'
import { usePlanFlow } from './MealsTab'
import { DEFAULT_TIME } from './PlanSheet'
import { RecipeDetail } from './RecipeDetail'
import { CategoryTags, RecipeFilters, RecipeImage, useRecipeFilter } from './RecipeLibrary'
import { useCategories, useRecipes, type Category, type Recipe } from './recipeStore'

// Beim Ziehen ist jeder Tag in drei Bereiche geteilt (Entscheidung Jonathan 6.10.2026):
// oben = Früh, Mitte = Mittag, unten = Abend. Die Uhrzeit ist dann vorausgewählt und lässt sich im Fenster ändern.
export const SLOTS = [
  { id: 'frueh', label: 'Früh', time: '08:00' },
  { id: 'mittag', label: 'Mittag', time: '12:00' },
  { id: 'abend', label: 'Abend', time: '18:30' },
] as const
type SlotId = (typeof SLOTS)[number]['id']

/** Fingerhöhe → Bereich des Tages (Drittel der Spalte) */
function slotAt(day: string, y: number): SlotId {
  const el = document.querySelector(`[data-tl-day="${day}"]`)
  if (!el) return 'abend'
  const r = el.getBoundingClientRect()
  const frac = (y - r.top) / r.height
  return frac < 1 / 3 ? 'frueh' : frac < 2 / 3 ? 'mittag' : 'abend'
}

// Letzte bekannte Finger- bzw. Mausposition. Wird direkt mitgelesen: auf dem iPad kommt die Startposition
// des Ziehens leer an, Hochrechnen (Start + Bewegung) landete dort immer oben („Früh“).
let lastY: number | null = null
function trackPointer(e: TouchEvent | PointerEvent | MouseEvent) {
  const y = 'touches' in e ? (e.touches[0] ?? e.changedTouches[0])?.clientY : e.clientY
  if (typeof y === 'number') lastY = y
}
for (const type of ['touchstart', 'touchmove', 'pointerdown', 'pointermove', 'mousemove'] as const) {
  window.addEventListener(type, trackPointer as EventListener, { passive: true, capture: true })
}

/** Fingerhöhe jetzt; Reserve: Startpunkt + bisherige Bewegung */
function fingerY(e: { activatorEvent: Event | null; delta: { y: number } }): number {
  if (lastY !== null) return lastY
  const a = e.activatorEvent
  const startY = a && 'touches' in a ? ((a as TouchEvent).touches[0]?.clientY ?? 0) : ((a as MouseEvent | null)?.clientY ?? 0)
  return startY + e.delta.y
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
  const { events } = useCalendar()
  const meals = useMeals()
  const { recipes } = useRecipes()
  const categories = useCategories()
  const filter = useRecipeFilter(recipes)
  const flow = usePlanFlow(showToast)
  const [dragging, setDragging] = useState<Recipe | null>(null)
  // Bereich unter dem Finger während des Ziehens (leuchtet auf)
  const [hover, setHover] = useState<{ day: string; slot: SlotId } | null>(null)
  const [open, setOpen] = useState<Recipe | null>(null)

  // Termine grau im Hintergrund, Essen als eigene Karten darüber (Entscheidung Jonathan 10.10.2026: Essen auf einen Blick erkennen)
  const weekEvents = days.map((day) => ({ day, events: events ? eventsOnDay(events, day) : [] }))
  const mealsOn = (day: string) => (meals ?? []).filter((m) => m.day === day)
  // Stundenbereich so, dass auch früh oder spät geplante Essen hineinpassen
  const range = hourRange(days.map((day, i) => ({ day, events: [...weekEvents[i].events, ...mealsOn(day).map(mealEvent)] })))
  const allDaySlots = Math.max(0, ...weekEvents.map((d) => d.events.filter((e) => e.allDay).length))

  // Finger: kurz halten, dann ziehen (Wischen scrollt die Rezepte). Maus: ziehen ab 6 px.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function onDragMove(e: DragMoveEvent) {
    if (!e.over) return setHover(null)
    const day = String(e.over.id).slice(4)
    const slot = slotAt(day, fingerY(e))
    setHover((h) => (h?.day === day && h.slot === slot ? h : { day, slot }))
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    setHover(null)
    const recipe = recipes?.find((r) => r.id === e.active.id)
    if (!recipe || !e.over) return
    const day = String(e.over.id).slice(4)
    const slot = SLOTS.find((s) => s.id === slotAt(day, fingerY(e)))
    flow.setPlan({ recipe, day, time: slot?.time ?? DEFAULT_TIME })
  }


  return (
    <DndContext
      sensors={sensors}
      // Ablage dort, wo der Finger ist (die große Karte würde sonst die Nachbarspalte treffen)
      collisionDetection={pointerWithin}
      onDragStart={(e) => setDragging(recipes?.find((r) => r.id === e.active.id) ?? null)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null)
        setHover(null)
      }}
    >
      <div className="hb-planner">
        <section className="hb-planner-library" aria-label="Rezepte">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <RecipeFilters {...filter} categories={categories} />
            </div>
            {recipes?.length ? <RecipeDice recipes={filter.list} onPlan={(r) => flow.setPlan({ recipe: r })} /> : null}
          </div>
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
            <span className="text-label text-ink-muted">Farbig: eure Essen. Grau: Termine.</span>
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
                meals={mealsOn(day)}
                recipeOf={flow.recipeOf}
                range={range}
                allDaySlots={allDaySlots}
                onTapMeal={(meal) => flow.setPlan({ meal })}
                dragging={!!dragging}
                hoverSlot={hover?.day === day ? hover.slot : null}
              />
            ))}
          </div>
        </section>
      </div>

      <DragOverlay dropAnimation={null}>{dragging ? <RecipeTile recipe={dragging} categories={categories} lifted /> : null}</DragOverlay>

      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)} wide>
          <RecipeDetail
            recipe={open}
            columns
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
  meals,
  recipeOf,
  range,
  allDaySlots,
  onTapMeal,
  dragging,
  hoverSlot,
}: {
  dragging: boolean
  hoverSlot: SlotId | null
  day: string
  col: number
  past: boolean
  today: boolean
  events: ReturnType<typeof eventsOnDay>
  meals: Meal[]
  recipeOf: (id: string | null | undefined) => Recipe | null
  range: { from: number; to: number }
  allDaySlots: number
  onTapMeal: (meal: Meal) => void
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
        <DayTimeline
          day={day}
          events={events}
          range={range}
          allDaySlots={allDaySlots}
          overlay={(at) => <MealCards meals={meals} recipeOf={recipeOf} at={at} past={past} onTap={onTapMeal} />}
        />
        {dragging && !past && (
          <div className="hb-slot-zones" aria-hidden="true">
            {SLOTS.map((s) => (
              <div key={s.id} className={`hb-slot-zone ${hoverSlot === s.id ? 'is-on' : ''}`}>
                <span>{s.label}</span>
                <span className="hb-slot-time">{s.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * Essen im Wand-Planer: kräftige Karten über die ganze Tagesbreite (Bild, Uhrzeit, Name), mindestens gut lesbar hoch,
 * auch bei kurzer Kochzeit. Ohne Uhrzeit oben im Tag. Essen kurz hintereinander teilen sich die Breite.
 */
function MealCards({ meals, recipeOf, at, past, onTap }: { meals: Meal[]; recipeOf: (id: string | null) => Recipe | null; at: (minutes: number) => number; past: boolean; onTap: (m: Meal) => void }) {
  const sorted = [...meals].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  // Spuren: liegt ein Essen weniger als 90 Min nach dem vorigen, kommt es daneben
  const lanes: { meal: Meal; lane: number; group: number }[] = []
  let group = 0
  sorted.forEach((m, i) => {
    const prev = lanes[i - 1]
    const t = hm(m.start_time)
    const pt = prev && hm(prev.meal.start_time)
    const close = prev && t && pt && minutesOf(t) - minutesOf(pt) < 90
    if (!close && prev) group++
    lanes.push({ meal: m, lane: close ? prev.lane + 1 : 0, group })
  })
  const width = (g: number) => Math.max(...lanes.filter((l) => l.group === g).map((l) => l.lane)) + 1

  return lanes.map(({ meal, lane, group: g }) => {
    const t = hm(meal.start_time)
    const n = width(g)
    const recipe = recipeOf(meal.recipe_id)
    return (
      <button
        key={meal.id}
        type="button"
        className={`hb-plan-meal ${past ? 'is-past' : ''}`}
        style={{ top: `${t ? at(minutesOf(t)) : 0}%`, left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
        onClick={() => onTap(meal)}
        aria-label={`${t ?? 'Ohne Uhrzeit'} ${meal.title}, ändern`}
      >
        {recipe ? <RecipeImage recipe={recipe} className="hb-plan-meal-img" /> : null}
        <span className="flex min-w-0 flex-col">
          <span className="hb-plan-meal-time">{t ?? 'ohne Zeit'}</span>
          <span className="hb-plan-meal-title">{meal.title}</span>
        </span>
      </button>
    )
  })
}

function DraggableRecipe({ recipe, categories, onTap }: { recipe: Recipe; categories: Category[]; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: recipe.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`${recipe.title}, halten und ziehen zum Einplanen, antippen zum Ansehen`}
      className={`hb-recipe-drag ${isDragging ? 'opacity-35' : ''}`}
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
