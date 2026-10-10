import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { DragOverlay } from '../../components/DragOverlay'
import { ListChecks } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { DragItem, useTodoDragSensors } from '../../components/DragItem'
import { PersonChip } from '../../components/PersonChip'
import { SwipeToDelete } from '../../components/SwipeToDelete'
import { TaskItem } from '../../components/TaskItem'
import { Tile } from '../../components/Tile'
import { EmptyFigure } from '../../components/EmptyFigure'
import { useDevice } from '../../lib/device'
import { useMembers } from '../../lib/members'
import { useFlip } from '../../lib/useFlip'
import { addDays, mondayOf, useToday, weekdayShort, berlinHHMM } from '../../lib/time'
import type { TileProps } from '../types'
import { dueOn, sinceLabel, unplannedNow, useTodos, type Todo } from './useTodos'

// Ablagen auf „Heute“: eine Person (heute), „Offen“ (heute, wer Zeit hat) oder „noch ohne Tag“
const OPEN = 'open'
const NO_DAY = 'noday'

export function TodosTile({ size, delay }: TileProps) {
  const today = useToday()
  const { people, personKey } = useMembers()
  const { todos, error, undoable, setDone, doneRank, patchTodo } = useTodos(today)
  const flip = useFlip<HTMLDivElement>()
  // Offene zuerst; Erledigte gleiten nach kurzer Pause ans Ende ihrer Spalte
  const byDone = (a: Todo, b: Todo) => doneRank(a) - doneRank(b)
  const { device, openTodo, removeTodo } = useDevice()
  const phone = device === 'phone'
  // Nebeneinander nur in der großen Kachel an der Wand, sonst untereinander
  const stacked = phone || size !== 'l'
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useTodoDragSensors()

  // An der Wand ist wenig Platz: Erledigtes verschwindet nach dem Rückgängig-Fenster (Entscheidung Jonathan 7.10.2026).
  // Am Handy bleibt es bis Mitternacht durchgestrichen stehen.
  const all = todos ?? []
  const list = phone ? all : all.filter((t) => !t.done_at || undoable.has(t.id))
  const doneToday = all.some((t) => t.done_at && dueOn(t, today, today))
  // Fällig heute (oder überfällig, falls der Nachtjob noch nicht lief)
  const dueToday = list.filter((t) => dueOn(t, today, today)).sort(byDone)
  const noDay = list.filter((t) => unplannedNow(t, mondayOf(today))).sort(byDone)
  const openToday = dueToday.filter((t) => !t.assignee)
  const active = list.find((t) => t.id === activeId)

  const sinceHint = (t: Todo) => sinceLabel(t, today, weekdayShort, addDays(today, -1))

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const todo = list.find((t) => t.id === e.active.id)
    if (!todo || !e.over) return
    const zone = String(e.over.id)
    if (zone === NO_DAY) {
      if (todo.due_date) patchTodo(todo.id, { due_date: null, moved_since: null })
      return
    }
    const assignee = zone === OPEN ? null : zone
    // Aus „ohne Tag“ geholt → heute fällig
    const patch: Partial<Todo> = todo.due_date ? {} : { due_date: today, this_week: false, moved_since: null }
    if (assignee !== todo.assignee) patch.assignee = assignee
    if (Object.keys(patch).length) patchTodo(todo.id, patch)
  }

  const row = (t: Todo, compact = false) => {
    const task = (
      <TaskItem
        label={t.title}
        done={!!t.done_at}
        person={personKey(t.assignee)}
        meta={sinceHint(t)}
        showUndo={undoable.has(t.id)}
        compact={compact || phone}
        onToggle={(done) => setDone(t.id, done)}
        onOpen={phone && openTodo ? () => openTodo(t.id) : undefined}
        chore={!!t.chore}
        remind={t.remind_at ? berlinHHMM(t.remind_at) : undefined}
      />
    )
    // Löschen per Wischen nur am Handy; an der Wand wird nur abgehakt
    const content = phone && removeTodo ? <SwipeToDelete onDelete={() => removeTodo(t)}>{task}</SwipeToDelete> : task
    return (
      <DragItem key={t.id} id={t.id} className="break-inside-avoid">
        {content}
      </DragItem>
    )
  }

  const empty = todos && dueToday.length === 0 && noDay.length === 0

  return (
    <Tile title="Todos heute" icon={ListChecks} delay={delay}>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div ref={flip} className="relative">
          {error && (
            <p role="status" className="mb-2 rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
              Verbindung gerade unterbrochen. Die Liste lädt gleich neu.
            </p>
          )}

          {empty ? (
            <EmptyFigure wall={!phone}>
              <p className={phone ? 'text-body text-ink-muted' : 'text-body-wall text-ink-muted'}>
                {phone
                  ? 'Heute ist frei. Tipp auf Plus für ein neues Todo.'
                  : doneToday
                    ? 'Alles erledigt für heute. Abgehaktes steht am Handy unter Todos.'
                    : 'Heute ist frei. Neues Todo am Handy anlegen.'}
              </p>
            </EmptyFigure>
          ) : (
            <>
              <div className={stacked ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-5'}>
                {people.map((p) => {
                  const items = dueToday.filter((t) => t.assignee === p.id)
                  return (
                    <Zone key={p.id} id={p.id} dragging={!!active}>
                      <div className="mb-2">
                        <PersonChip person={personKey(p.id)} name={p.name} />
                      </div>
                      {items.length ? items.map((t) => row(t)) : <p className="text-label text-ink-muted">Nichts für heute.</p>}
                    </Zone>
                  )
                })}
              </div>

              {(openToday.length > 0 || active) && (
                <Zone id={OPEN} dragging={!!active} className="mt-3">
                  <div className="mb-2">
                    <PersonChip person="open" name="Offen, wer Zeit hat" />
                  </div>
                  {openToday.length ? (
                    <div className={stacked ? '' : 'columns-2 gap-5'}>{openToday.map((t) => row(t))}</div>
                  ) : (
                    <p className="text-label text-ink-muted">Hierher ziehen</p>
                  )}
                </Zone>
              )}

              {(noDay.length > 0 || active) && (
                <>
                <hr className="hb-divider" />
                <Zone id={NO_DAY} dragging={!!active}>
                  <h3 className="mb-2 text-label text-ink-muted">Offen, noch ohne Tag</h3>
                  {noDay.length ? (
                    <div className={stacked ? '' : 'columns-2 gap-5'}>
                      {noDay.map((t) => (
                        <div key={t.id} className="flex break-inside-avoid items-center gap-2">
                          <div className="min-w-0 flex-1">{row(t, true)}</div>
                          {/* an der Wand zu eng (Entscheidung Jonathan 8.10.2026), nur am Handy */}
                          {phone && t.this_week && !t.done_at && <Badge tone="accent">Diese Woche</Badge>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-label text-ink-muted">Hierher ziehen</p>
                  )}
                </Zone>
                </>
              )}
            </>
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          {active ? (
            <div className={`hb-card hb-person-${personKey(active.assignee)} is-lifted`}>
              <span className="hb-card-title">{active.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Tile>
  )
}

/** Bereich, auf dem man ein Todo ablegen kann (Person, Offen, ohne Tag) */
function Zone({ id, dragging, className = '', children }: { id: string; dragging: boolean; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      className={`hb-todo-zone flex min-w-0 flex-col gap-1 ${dragging ? 'is-dragging' : ''} ${isOver ? 'is-over' : ''} ${className}`}
    >
      {children}
    </section>
  )
}
