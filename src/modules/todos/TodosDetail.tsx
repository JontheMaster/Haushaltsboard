import { DndContext, DragOverlay, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useState, type ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { DragItem, useTodoDragSensors } from '../../components/DragItem'
import { SwipeToDelete } from '../../components/SwipeToDelete'
import { TaskItem } from '../../components/TaskItem'
import { useDevice } from '../../lib/device'
import { useMembers } from '../../lib/members'
import { addDays, berlinHHMM, mondayOf, useToday, weekdayShort } from '../../lib/time'
import { useFlip } from '../../lib/useFlip'
import { dueOn, sinceLabel, unplannedNow, useTodos, type Todo } from './useTodos'

// Ablagen: ein Tag, „Diese Woche“ oder „Ohne Tag“
type Group = { id: string; title: string; today?: boolean; items: Todo[] }

/** Alle Todos: heute, die nächsten Tage, diese Woche, ohne Tag. Kurz halten und ziehen verschiebt. */
export function TodosDetail() {
  const today = useToday()
  const tomorrow = addDays(today, 1)
  const { byId, personKey } = useMembers()
  const { openTodo, removeTodo } = useDevice()
  const { todos, error, undoable, setDone, doneRank, patchTodo } = useTodos(today)
  const flip = useFlip<HTMLDivElement>()
  const sensors = useTodoDragSensors()
  const [activeId, setActiveId] = useState<string | null>(null)
  const byDone = (a: Todo, b: Todo) => doneRank(a) - doneRank(b)

  if (!todos) return null
  const dragging = !!activeId
  const active = todos.find((t) => t.id === activeId)

  const dayTitle = (day: string) => {
    const [, m, d] = day.split('-').map(Number)
    return day === tomorrow ? 'Morgen' : `${weekdayShort(day)} ${d}.${m}.`
  }

  const groups: Group[] = [
    { id: `day:${today}`, title: 'Heute', today: true, items: todos.filter((t) => dueOn(t, today, today)).sort(byDone) },
  ]
  // Tage mit Todos, beim Ziehen zusätzlich alle Tage der nächsten Woche als Ablage
  const days = new Set(todos.filter((t) => t.due_date && t.due_date > today).map((t) => t.due_date!))
  if (dragging) for (let i = 1; i <= 7; i++) days.add(addDays(today, i))
  for (const day of [...days].sort()) {
    groups.push({ id: `day:${day}`, title: dayTitle(day), items: todos.filter((t) => t.due_date === day).sort(byDone) })
  }
  const monday = mondayOf(today)
  groups.push({ id: 'week', title: 'Diese Woche', items: todos.filter((t) => t.this_week && unplannedNow(t, monday)).sort(byDone) })
  groups.push({ id: 'none', title: 'Ohne Tag', items: todos.filter((t) => !t.due_date && !t.this_week).sort(byDone) })

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const todo = todos?.find((t) => t.id === e.active.id)
    if (!todo || !e.over) return
    const zone = String(e.over.id)
    const patch = zone.startsWith('day:')
      ? { due_date: zone.slice(4), this_week: false }
      : { due_date: null, this_week: zone === 'week' }
    // Heute ist auch die Ablage für Überfälliges: liegt es schon „heute oder früher“, nichts ändern
    if (zone === `day:${today}` && todo.due_date && todo.due_date <= today) return
    if (patch.due_date === todo.due_date && patch.this_week === todo.this_week) return
    patchTodo(todo.id, { ...patch, moved_since: null })
  }

  const sinceHint = (t: Todo) => sinceLabel(t, today, weekdayShort, addDays(today, -1))

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div ref={flip} className="relative flex flex-col gap-5">
        {error && (
          <p role="status" className="rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
            Verbindung gerade unterbrochen. Die Liste lädt gleich neu.
          </p>
        )}
        {groups
          .filter((g) => g.today || g.items.length || dragging)
          .map((g) => (
            <Section key={g.id} id={g.id} dragging={dragging}>
              <h2 className="flex items-center gap-2 font-display text-title text-ink">
                {g.title}
                {g.today && g.items.some((t) => !t.done_at) && (
                  <Badge tone="today">{g.items.filter((t) => !t.done_at).length} offen</Badge>
                )}
              </h2>
              {g.items.length === 0 ? (
                <p className="text-body text-ink-muted">
                  {dragging ? 'Hierher ziehen' : 'Heute ist frei. Tipp auf Plus für ein neues Todo.'}
                </p>
              ) : (
                g.items.map((t) => {
                  const who = personKey(t.assignee)
                  const row = (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <TaskItem
                          label={t.title}
                          done={!!t.done_at}
                          person={who}
                          meta={sinceHint(t)}
                          showUndo={undoable.has(t.id)}
                          compact
                          onToggle={(d) => setDone(t.id, d)}
                          onOpen={openTodo && (() => openTodo(t.id))}
                          chore={!!t.chore}
                          remind={t.remind_at ? berlinHHMM(t.remind_at) : undefined}
                        />
                      </div>
                      {!t.done_at && (
                        <Badge tone={who === 'open' ? undefined : who}>{t.assignee ? byId.get(t.assignee)?.name : 'Offen'}</Badge>
                      )}
                    </div>
                  )
                  return (
                    <DragItem key={t.id} id={t.id}>
                      {removeTodo ? <SwipeToDelete onDelete={() => removeTodo(t)}>{row}</SwipeToDelete> : row}
                    </DragItem>
                  )
                })
              )}
            </Section>
          ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {active ? (
          <div className={`hb-card hb-person-${personKey(active.assignee)} is-lifted`}>
            <span className="hb-card-title">{active.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** Ein Bereich der Todo-Seite, zugleich Ablage beim Ziehen */
function Section({ id, dragging, children }: { id: string; dragging: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      className={`hb-tile hb-tile-static hb-todo-section gap-2 p-4 ${dragging ? 'is-dragging' : ''} ${isOver ? 'is-over' : ''}`}
    >
      {children}
    </section>
  )
}
