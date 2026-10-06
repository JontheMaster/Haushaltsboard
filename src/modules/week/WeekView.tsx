import {
  DndContext,
  DragOverlay,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { EventPill } from '../../components/EventPill'
import { Icon } from '../../components/Icon'
import { Eye, EyeOff, SlidersHorizontal, Sparkles } from 'lucide-react'
import { ScrollList } from '../../components/ScrollList'
import { WithIcon } from '../../components/WithIcon'
import { useDevice, useMedia } from '../../lib/device'
import { useMembers, type PersonKey } from '../../lib/members'
import { addDays, berlinMidnightISO, berlinTime, dayLabel, mondayOf, useToday, weekdayShort } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { liveInfo } from '../calendar/live'
import { DayTimeline, hourRange, ModeSwitch, TimeLabels, useCalendarMode } from '../calendar/Timeline'
import { useCalendar, type CalendarEvent } from '../calendar/useCalendar'
import { dueOn, useTodos, type Todo } from '../todos/useTodos'
import { byTime, mealBands, MealLine, useMealsByDay } from '../meals/MealLine'
import { useEnabledModules } from '../useModules'

// Ablagen: ein Tag, „Diese Woche“ oder „Ohne Tag“
type Zone = { kind: 'day'; day: string } | { kind: 'week' } | { kind: 'none' }

const zoneId = (z: Zone) => (z.kind === 'day' ? `day:${z.day}` : z.kind)
// Tagesspalten haben zwei Ablagen (Termin- und Todo-Bereich), beide bedeuten „auf diesen Tag“
const zoneOf = (id: string): Zone =>
  id.startsWith('day:') ? { kind: 'day', day: id.slice(4, 14) } : id === 'week' ? { kind: 'week' } : { kind: 'none' }

const LONG_PRESS_MS = 550

type Props = { variant: 'wall' | 'phone' }

// Ebenen: was die Woche zeigt (pro Gerät gemerkt, nur Komfort)
type Layers = { events: boolean; todos: boolean; meals: boolean; person: 'all' | 'a' | 'b' }
const ALL_LAYERS: Layers = { events: true, todos: true, meals: true, person: 'all' }

function useWeekLayers(key: string): [Layers, (patch: Partial<Layers>) => void] {
  const storageKey = `hb-week-layers-${key}`
  const [layers, setLayers] = useState<Layers>(() => {
    try {
      return { ...ALL_LAYERS, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') }
    } catch {
      return ALL_LAYERS
    }
  })
  const set = (patch: Partial<Layers>) =>
    setLayers((l) => {
      const next = { ...l, ...patch }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // nur Komfort
      }
      return next
    })
  return [layers, set]
}

const eventPerson = (e: CalendarEvent): PersonKey => (e.person === 'person-a' ? 'a' : e.person === 'person-b' ? 'b' : 'open')

/**
 * Woche Mo–So plus „Ungeplant“. Karten per Ziehen auf einen Tag oder zurück nach Ungeplant.
 * Wand: Antippen hakt ab, lange halten wechselt die Person. Handy: Antippen öffnet Bearbeiten.
 */
export function WeekView({ variant }: Props) {
  const wall = variant === 'wall'
  // Hochkant / schmal: Tage untereinander statt 8 Spalten (Bedienung bleibt wie an der Wand)
  const narrow = useMedia('(max-width: 1023px)')
  const stacked = !wall || narrow
  const today = useToday()
  const [offset, setOffset] = useState(0) // 0 = diese Woche, 1 = nächste
  const monday = addDays(mondayOf(today), 7 * offset)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const { people, personKey } = useMembers()
  const { openTodo } = useDevice()
  const { todos, setDone, patchTodo, doneRank, undoable } = useTodos(today)
  const { events: calendarEvents } = useCalendar()
  const [layers, setLayers] = useWeekLayers(variant)
  const mealsModule = useEnabledModules()?.has('essensplan') ?? false
  // Person: Einträge der anderen Person ausblenden, „Offen“ bleibt für beide
  const forPerson = (k: PersonKey) => layers.person === 'all' || k === 'open' || k === layers.person
  const events = layers.events ? (calendarEvents?.filter((e) => forPerson(eventPerson(e))) ?? null) : []
  const allMeals = useMealsByDay()
  const mealsOn = (day: string) => (layers.meals ? allMeals(day) : [])
  const showTodos = layers.todos
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mode, setMode] = useCalendarMode(`week-${variant}`)
  const plan = mode === 'plan'
  // Zeitplan: gemeinsamer Stundenbereich und gleich viele Ganztags-Plätze für alle Tage der Woche
  const weekEvents = days.map((day) => ({ day, events: events ? eventsOnDay(events, day) : [] }))
  // Essen liegen als Band im Zeitplan; der Stundenbereich muss sie mit abdecken
  const range = hourRange(weekEvents.map((d) => ({ day: d.day, events: [...d.events, ...mealBands(mealsOn(d.day))] })))
  const allDaySlots = Math.max(0, ...weekEvents.map((d) => d.events.filter((e) => e.allDay).length))

  // Wand: Ziehen startet nach 8 px Bewegung (Stillhalten bleibt frei fürs lange Drücken).
  // Handy: kurz halten, dann ziehen – so bleibt normales Scrollen möglich.
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  const sensors = useSensors(...(wall ? [pointer] : [mouse, touch]))

  // Erledigte spart die Woche aus (Platz); gerade abgehakte bleiben 5 s sichtbar, damit man sich vertippen darf
  const list = (todos ?? []).filter((t) => (!t.done_at || undoable.has(t.id)) && forPerson(personKey(t.assignee)))
  const byDone = (a: Todo, b: Todo) => doneRank(a) - doneRank(b)
  const onDay = (day: string) => list.filter((t) => dueOn(t, day, today)).sort(byDone)
  // Putzplan-Aufgaben „irgendwann in der Woche“ gehören zu ihrer Woche; Todos „diese Woche“ immer
  const thisWeek = list
    .filter(
      (t) =>
        !t.due_date && t.this_week && (!t.chore || t.chore.weekStart === monday || (offset === 0 && t.chore.weekStart < monday)),
    )
    .sort(byDone)
  const noDay = list.filter((t) => !t.due_date && !t.this_week).sort(byDone)
  const active = list.find((t) => t.id === activeId)

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const todo = list.find((t) => t.id === e.active.id)
    if (!todo || !e.over) return
    const zone = zoneOf(String(e.over.id))
    const patch =
      zone.kind === 'day' ? { due_date: zone.day, this_week: false } : { due_date: null, this_week: zone.kind === 'week' }
    if (patch.due_date === todo.due_date && patch.this_week === todo.this_week) return
    // Neu eingeplant: „seit …“ fällt weg, die Rutsch-Regel beginnt von vorn
    patchTodo(todo.id, { ...patch, moved_since: null })
  }

  function cyclePerson(todo: Todo) {
    const ids = [...people.map((p) => p.id), null]
    const next = ids[(ids.indexOf(todo.assignee) + 1) % ids.length]
    patchTodo(todo.id, { assignee: next })
    navigator.vibrate?.(15)
  }

  const card = (t: Todo) => (
    <WeekCard
      key={t.id}
      todo={t}
      person={personKey(t.assignee)}
      wall={wall}
      onTap={() => (wall ? setDone(t.id, !t.done_at) : openTodo?.(t.id))}
      onLongPress={wall ? () => cyclePerson(t) : undefined}
    />
  )

  const dayHeader = (day: string) => (
    <header className={`hb-week-day ${day === today ? 'is-today' : ''} ${day < today ? 'is-past' : ''}`}>
      {wall ? dayLabel(day) : `${weekdayShort(day)} ${Number(day.slice(8))}.${Number(day.slice(5, 7))}.`}
      {day === today && <span className="sr-only"> (heute)</span>}
    </header>
  )

  // Liste: Termine und Essen nach Uhrzeit gemischt
  const eventList = (day: string) =>
    byTime(events ? eventsOnDay(events, day) : [], mealsOn(day), day).map((s) => {
      if (s.kind === 'meal') return <MealLine key={s.meal.id} meals={[s.meal]} wall={wall} />
      const e = s.event
      return (
        <EventPill
          key={e.id}
          person={e.person === 'person-a' ? 'a' : e.person === 'person-b' ? 'b' : 'open'}
          color={e.color}
          time={timeLabel(e, day)}
          title={e.title}
          week
          live={day === today ? liveInfo(e, new Date()) : undefined}
          past={!e.allDay && e.end <= new Date().toISOString()}
        />
      )
    })

  // Handy: ein Block pro Tag – oben Termine, darunter abgesetzt die Todos
  const phoneDay = (day: string) => {
    const past = day < today
    const dayTodos = past ? [] : onDay(day)
    return (
      <DropZone key={day} zone={{ kind: 'day', day }} disabled={past}>
        {dayHeader(day)}
        {/* ohne Termine stehen die Essen allein unter dem Tag; sonst in der Liste bzw. als Band */}
        {!layers.events && <MealLine meals={mealsOn(day)} />}
        {!layers.events ? null : plan ? (
          <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
            <TimeLabels range={range} hourPx={36} allDaySlots={eventsOnDay(events ?? [], day).filter((e) => e.allDay).length} />
            <DayTimeline
              day={day}
              events={events ? eventsOnDay(events, day) : []}
              bands={mealBands(mealsOn(day))}
              range={range}
              hourPx={36}
            />
          </div>
        ) : (
          eventList(day)
        )}
        {!past && showTodos && (
          <div className="hb-week-todos">
            {dayTodos.length ? (
              dayTodos.map(card)
            ) : (
              <p className="px-1 text-label text-ink-muted">Keine Todos. Karte hierher ziehen.</p>
            )}
          </div>
        )}
      </DropZone>
    )
  }

  const unplannedZones = (
    <>
      <DropZone zone={{ kind: 'week' }} label="Diese Woche" sunken>
        {thisWeek.length ? thisWeek.map(card) : <p className="px-1 text-label text-ink-muted">Hierher ziehen</p>}
      </DropZone>
      <DropZone zone={{ kind: 'none' }} label="Ohne Tag" sunken>
        {noDay.length ? noDay.map(card) : <p className="px-1 text-label text-ink-muted">Hierher ziehen</p>}
      </DropZone>
    </>
  )

  const maxTodos = Math.max(0, ...days.filter((d) => d >= today).map((d) => onDay(d).length))
  const todoWeight = Math.min(2, Math.max(1, maxTodos / 2))

  // Wand: Raster mit Zeilen Kopf · Termine · „Todos“ · Todos, damit alle Todo-Bereiche auf einer Höhe beginnen
  // Ausgeblendete Ebenen geben ihren Platz ab: ohne Todos fällt auch „Ungeplant“ weg
  const dayCols = `${plan ? '44px ' : ''}repeat(7, minmax(0, 1fr))`
  const gridStyle: CSSProperties = !showTodos
    ? { gridTemplateColumns: dayCols, gridTemplateRows: 'auto minmax(0, 1fr)' }
    : !layers.events
      ? { gridTemplateRows: 'auto 0 0 minmax(0, 1fr)' }
      : plan
        ? // Zeitplan: viele Todos an einem Tag → Todo-Zeile wächst (bis 2:3), der Plan wird dafür etwas enger
          { gridTemplateRows: `auto minmax(0, 3fr) auto minmax(0, ${todoWeight}fr)` }
        : {}
  const wallGrid = (
    <div className={`hb-week-grid min-h-0 flex-1 ${plan ? 'is-plan' : ''}`} style={gridStyle}>
      {plan && layers.events && (
        <div style={{ gridColumn: 1, gridRow: 2 }} className="flex min-h-0 flex-col">
          <TimeLabels range={range} allDaySlots={allDaySlots} />
        </div>
      )}
      {days.map((day, i) => {
        const past = day < today
        const col = i + 1 + (plan ? 1 : 0)
        return [
          <div key={`h${day}`} className="flex min-w-0 flex-col gap-1" style={{ gridColumn: col, gridRow: 1 }}>
            {dayHeader(day)}
            {!layers.events && <MealLine meals={mealsOn(day)} wall />}
          </div>,
          layers.events && (
            <DropZone
              key={`e${day}`}
              zone={{ kind: 'day', day }}
              idSuffix=":t"
              disabled={past}
              plain
              style={{ gridColumn: col, gridRow: 2 }}
            >
              {plan ? (
                <DayTimeline
                  day={day}
                  events={events ? eventsOnDay(events, day) : []}
                  bands={mealBands(mealsOn(day))}
                  range={range}
                  allDaySlots={allDaySlots}
                />
              ) : (
                <ScrollList fit className="flex min-h-0 flex-1 flex-col gap-2">
                  {eventList(day)}
                </ScrollList>
              )}
            </DropZone>
          ),
          showTodos && (
            <DropZone
              key={`t${day}`}
              zone={{ kind: 'day', day }}
              disabled={past}
              style={{ gridColumn: col, gridRow: layers.events ? 4 : '2 / 5' }}
            >
              <ScrollList fit dense className="hb-day-todos flex min-h-0 flex-1 flex-col gap-2">
                {past ? null : onDay(day).map(card)}
              </ScrollList>
            </DropZone>
          ),
        ]
      })}
      {showTodos && layers.events && (
        <h3 className="px-1 text-label text-ink-muted" style={{ gridColumn: plan ? '2 / 9' : '1 / 8', gridRow: 3 }}>
          Todos
        </h3>
      )}
      {showTodos && (
        <>
          <header className="hb-week-day" style={{ gridColumn: plan ? 9 : 8, gridRow: 1 }}>
            Ungeplant
          </header>
          <div
            className="flex min-h-0 flex-col gap-3 overflow-y-auto hb-scroll-quiet"
            style={{ gridColumn: plan ? 9 : 8, gridRow: '2 / 5' }}
          >
            {unplannedZones}
          </div>
        </>
      )}
    </div>
  )

  const sunday = addDays(monday, 6)
  const rangeLabel = `${Number(monday.slice(8))}.${Number(monday.slice(5, 7))}. – ${Number(sunday.slice(8))}.${Number(sunday.slice(5, 7))}.`

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div
        className={
          wall ? `flex h-full min-h-0 flex-col gap-4 ${stacked ? 'overflow-y-auto hb-scroll-quiet' : ''}` : 'flex flex-col gap-4'
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2" role="group" aria-label="Woche wählen">
            <button
              type="button"
              className={`hb-choice ${offset === 0 ? 'is-on' : ''}`}
              aria-pressed={offset === 0}
              onClick={() => setOffset(0)}
            >
              Diese Woche
            </button>
            <button
              type="button"
              className={`hb-choice ${offset === 1 ? 'is-on' : ''}`}
              aria-pressed={offset === 1}
              onClick={() => setOffset(1)}
            >
              Nächste Woche
            </button>
          </div>
          <span className="text-label text-ink-muted">{rangeLabel}</span>
          {/* relative: das Filter-Fenster richtet sich am rechten Rand dieser Gruppe aus */}
          <div className="relative ml-auto flex items-center gap-2">
            <LayerMenu layers={layers} set={setLayers} meals={mealsModule} names={people.map((p) => p.name)} />
            <ModeSwitch mode={mode} onChange={setMode} compact={!wall} />
          </div>
        </div>

        {!stacked ? (
          wallGrid
        ) : (
          <div className="flex flex-col gap-4">
            {showTodos && (
              <div className="flex flex-col gap-2">
                <header className="hb-week-day">Ungeplant</header>
                {unplannedZones}
              </div>
            )}
            {days.filter((d) => d >= today || offset > 0).map(phoneDay)}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {active ? <CardBody todo={active} person={personKey(active.assignee)} lifted /> : null}
      </DragOverlay>
    </DndContext>
  )
}

/** Filter-Knopf neben „Liste | Zeitplan“: öffnet die Ebenen, belegt also keine eigene Zeile. Punkt = etwas ist ausgeblendet. */
function LayerMenu(props: { layers: Layers; set: (p: Partial<Layers>) => void; meals: boolean; names: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { layers, meals } = props
  const filtered = !layers.events || !layers.todos || (meals && !layers.meals) || layers.person !== 'all'
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [open])
  return (
    <div ref={ref}>
      <button
        type="button"
        className={`hb-filter-btn ${filtered ? 'is-filtered' : ''}`}
        aria-label={filtered ? 'Filter (etwas ist ausgeblendet)' : 'Filter'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={SlidersHorizontal} size={18} />
      </button>
      {open && (
        <div className="hb-filter-menu" role="dialog" aria-label="Was die Woche zeigt">
          <LayerBar {...props} />
        </div>
      )}
    </div>
  )
}

/** Ebenen ein/aus und Person: Termine · Todos · Essen | Beide · Jonathan · Leviona */
function LayerBar({
  layers,
  set,
  meals,
  names,
}: {
  layers: Layers
  set: (p: Partial<Layers>) => void
  meals: boolean
  names: string[]
}) {
  const toggle = (key: 'events' | 'todos' | 'meals', label: string) => (
    <button
      type="button"
      className={`hb-layer ${layers[key] ? 'is-on' : ''}`}
      aria-pressed={layers[key]}
      onClick={() => set({ [key]: !layers[key] })}
    >
      <Icon icon={layers[key] ? Eye : EyeOff} size={16} />
      {label}
    </button>
  )
  const persons: { value: Layers['person']; label: string }[] = [
    { value: 'all', label: 'Beide' },
    { value: 'a', label: names[0] ?? 'Person a' },
    { value: 'b', label: names[1] ?? 'Person b' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Was die Woche zeigt">
        {toggle('events', 'Termine')}
        {toggle('todos', 'Todos')}
        {meals && toggle('meals', 'Essen')}
      </div>
      <div className="hb-seg self-start" role="group" aria-label="Für wen">
        {persons.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={layers.person === p.value}
            className={layers.person === p.value ? 'is-on' : ''}
            onClick={() => set({ person: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function timeLabel(e: CalendarEvent, day: string): string {
  if (e.allDay) return 'Ganztags'
  if (e.start < berlinMidnightISO(day)) {
    const { hh, mm } = berlinTime(new Date(e.end))
    return `bis ${hh}:${mm}`
  }
  const { hh, mm } = berlinTime(new Date(e.start))
  return `${hh}:${mm}`
}

// ───────── Ablage ─────────

function DropZone({
  zone,
  idSuffix = '',
  label,
  disabled,
  plain,
  sunken,
  style,
  children,
}: {
  zone: Zone
  /** Zweite Ablage für denselben Tag (Termin-Bereich an der Wand) */
  idSuffix?: string
  label?: string
  disabled?: boolean
  /** ohne eigene Fläche (Termin-Bereich) */
  plain?: boolean
  /** vertieft (Ungeplant) */
  sunken?: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(zone) + idSuffix, disabled })
  const cls = [
    'hb-drop flex min-h-0 flex-col gap-2',
    isOver && 'is-over',
    disabled && 'is-disabled',
    plain && 'hb-drop-plain',
    sunken && 'hb-drop-sunken',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <section ref={setNodeRef} aria-label={label} className={cls} style={style}>
      {label && <h3 className="px-1 text-label text-ink-muted">{label}</h3>}
      {children}
    </section>
  )
}

// ───────── Karte ─────────

function WeekCard({
  todo,
  person,
  wall,
  onTap,
  onLongPress,
}: {
  todo: Todo
  person: PersonKey
  wall: boolean
  onTap: () => void
  onLongPress?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: todo.id })
  const longPressed = useRef(false)
  const stop = useRef<(() => void) | null>(null)

  // Langes Drücken: nur wenn der Finger still bleibt. Bewegung und Loslassen werden im ganzen Fenster
  // beobachtet – beim Ziehen verlässt der Finger die Karte sofort.
  const startLongPress = (x: number, y: number) => {
    stop.current?.()
    const timer = setTimeout(() => {
      longPressed.current = true
      cleanup()
      onLongPress?.()
    }, LONG_PRESS_MS)
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - x, e.clientY - y) > 8) cleanup()
    }
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', cleanup, true)
      window.removeEventListener('pointercancel', cleanup, true)
      stop.current = null
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', cleanup, true)
    window.addEventListener('pointercancel', cleanup, true)
    stop.current = cleanup
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`${todo.title}${wall ? ', antippen zum Abhaken, lange halten wechselt die Person' : ', antippen zum Bearbeiten'}`}
      className={`${wall ? 'touch-none' : ''} ${isDragging ? 'opacity-35' : ''}`}
      onPointerDownCapture={(e) => {
        longPressed.current = false
        if (onLongPress) startLongPress(e.clientX, e.clientY)
      }}
      onClick={() => {
        if (longPressed.current) return
        onTap()
      }}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter') onTap()
      }}
    >
      <CardBody todo={todo} person={person} />
    </div>
  )
}

function CardBody({ todo, person, lifted }: { todo: Todo; person: PersonKey; lifted?: boolean }) {
  return (
    <div className={`hb-card hb-person-${person} ${todo.done_at ? 'is-done' : ''} ${lifted ? 'is-lifted' : ''}`}>
      <span className="hb-card-title">
        {todo.chore ? (
          <WithIcon icon={<Icon icon={Sparkles} size={15} label="Putzplan" className="hb-chore-icon" />} text={todo.title} />
        ) : (
          todo.title
        )}
      </span>
    </div>
  )
}
