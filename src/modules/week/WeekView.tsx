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
import { useRef, useState, type ReactNode } from 'react'
import { EventPill } from '../../components/EventPill'
import { useDevice } from '../../lib/device'
import { useMembers, type PersonKey } from '../../lib/members'
import { addDays, berlinMidnightISO, berlinTime, dayLabel, mondayOf, useToday, weekdayShort } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { useCalendar, type CalendarEvent } from '../calendar/useCalendar'
import { useTodos, type Todo } from '../todos/useTodos'

// Ablagen: ein Tag, „Diese Woche“ oder „Ohne Tag“
type Zone = { kind: 'day'; day: string } | { kind: 'week' } | { kind: 'none' }

const zoneId = (z: Zone) => (z.kind === 'day' ? `day:${z.day}` : z.kind)
const zoneOf = (id: string): Zone =>
  id.startsWith('day:') ? { kind: 'day', day: id.slice(4) } : id === 'week' ? { kind: 'week' } : { kind: 'none' }

const LONG_PRESS_MS = 550

type Props = { variant: 'wall' | 'phone' }

/**
 * Woche Mo–So plus „Ungeplant“. Karten per Ziehen auf einen Tag oder zurück nach Ungeplant.
 * Wand: Antippen hakt ab, lange halten wechselt die Person. Handy: Antippen öffnet Bearbeiten.
 */
export function WeekView({ variant }: Props) {
  const wall = variant === 'wall'
  const today = useToday()
  const [offset, setOffset] = useState(0) // 0 = diese Woche, 1 = nächste
  const monday = addDays(mondayOf(today), 7 * offset)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const { people, personKey } = useMembers()
  const { openTodo } = useDevice()
  const { todos, setDone, patchTodo, doneRank } = useTodos(today)
  const { events } = useCalendar()
  const [activeId, setActiveId] = useState<string | null>(null)

  // Wand: Ziehen startet nach 8 px Bewegung (Stillhalten bleibt frei fürs lange Drücken).
  // Handy: kurz halten, dann ziehen – so bleibt normales Scrollen möglich.
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  const sensors = useSensors(...(wall ? [pointer] : [mouse, touch]))

  const list = todos ?? []
  const byDone = (a: Todo, b: Todo) => doneRank(a) - doneRank(b)
  const onDay = (day: string) =>
    list.filter((t) => t.due_date && (t.due_date === day || (day === today && t.due_date < today))).sort(byDone)
  const thisWeek = list.filter((t) => !t.due_date && t.this_week).sort(byDone)
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
      zone.kind === 'day'
        ? { due_date: zone.day, this_week: false }
        : { due_date: null, this_week: zone.kind === 'week' }
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

  const dayColumn = (day: string) => {
    const past = day < today
    const dayEvents = events ? eventsOnDay(events, day) : []
    const dayTodos = past ? [] : onDay(day)
    return (
      <DropZone key={day} zone={{ kind: 'day', day }} disabled={past} className={wall ? 'min-h-0' : ''}>
        <header className={`hb-week-day ${day === today ? 'is-today' : ''} ${past ? 'is-past' : ''}`}>
          {wall ? dayLabel(day) : `${weekdayShort(day)} ${Number(day.slice(8))}.${Number(day.slice(5, 7))}.`}
          {day === today && <span className="sr-only"> (heute)</span>}
        </header>
        <div className={`flex flex-col gap-2 ${wall ? 'min-h-0 flex-1 overflow-y-auto hb-scroll-quiet' : ''}`}>
          {dayEvents.map((e) => (
            <EventPill
              key={e.id}
              person={e.person === 'person-a' ? 'a' : e.person === 'person-b' ? 'b' : 'open'}
              color={e.color}
              time={timeLabel(e, day)}
              title={e.title}
              week
              past={!e.allDay && e.end <= new Date().toISOString()}
            />
          ))}
          {dayTodos.map(card)}
          {!past && dayEvents.length === 0 && dayTodos.length === 0 && (
            <p className="px-1 text-label text-ink-muted">{wall ? 'Frei' : 'Frei. Karte hierher ziehen.'}</p>
          )}
        </div>
      </DropZone>
    )
  }

  const unplanned = (
    <div className={`hb-week-unplanned ${wall ? 'min-h-0' : ''}`}>
      <header className="hb-week-day">Ungeplant</header>
      <div className={`flex flex-col gap-3 ${wall ? 'min-h-0 flex-1 overflow-y-auto hb-scroll-quiet' : ''}`}>
        <DropZone zone={{ kind: 'week' }} label="Diese Woche">
          {thisWeek.length ? thisWeek.map(card) : <p className="px-1 text-label text-ink-muted">Hierher ziehen</p>}
        </DropZone>
        <DropZone zone={{ kind: 'none' }} label="Ohne Tag">
          {noDay.length ? noDay.map(card) : <p className="px-1 text-label text-ink-muted">Hierher ziehen</p>}
        </DropZone>
      </div>
    </div>
  )

  const sunday = addDays(monday, 6)
  const range = `${Number(monday.slice(8))}.${Number(monday.slice(5, 7))}. – ${Number(sunday.slice(8))}.${Number(sunday.slice(5, 7))}.`

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className={wall ? 'flex h-full min-h-0 flex-col gap-4' : 'flex flex-col gap-4'}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2" role="group" aria-label="Woche wählen">
            <button type="button" className={`hb-choice ${offset === 0 ? 'is-on' : ''}`} aria-pressed={offset === 0} onClick={() => setOffset(0)}>
              Diese Woche
            </button>
            <button type="button" className={`hb-choice ${offset === 1 ? 'is-on' : ''}`} aria-pressed={offset === 1} onClick={() => setOffset(1)}>
              Nächste Woche
            </button>
          </div>
          <span className="text-label text-ink-muted">{range}</span>
        </div>

        {wall ? (
          <div className="grid min-h-0 flex-1 grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.2fr)] gap-3">
            {days.map(dayColumn)}
            {unplanned}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {unplanned}
            {days.filter((d) => d >= today || offset > 0).map(dayColumn)}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {active ? <CardBody todo={active} person={personKey(active.assignee)} lifted /> : null}
      </DragOverlay>
    </DndContext>
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
  label,
  disabled,
  className = '',
  children,
}: {
  zone: Zone
  label?: string
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(zone), disabled })
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`hb-drop flex flex-col gap-2 ${isOver ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
    >
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
    <div
      className={`hb-card hb-person-${person} ${todo.done_at ? 'is-done' : ''} ${lifted ? 'is-lifted' : ''}`}
    >
      <span className="hb-card-title">{todo.title}</span>
    </div>
  )
}
