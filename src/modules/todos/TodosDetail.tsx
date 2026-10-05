import { Badge } from '../../components/Badge'
import { SwipeToDelete } from '../../components/SwipeToDelete'
import { TaskItem } from '../../components/TaskItem'
import { useDevice } from '../../lib/device'
import { useMembers } from '../../lib/members'
import { addDays, useToday, weekdayShort } from '../../lib/time'
import { useFlip } from '../../lib/useFlip'
import { useTodos, type Todo } from './useTodos'

/** Alle Todos: heute, die nächsten Tage, diese Woche, ohne Tag */
export function TodosDetail() {
  const today = useToday()
  const tomorrow = addDays(today, 1)
  const { byId, personKey } = useMembers()
  const { openTodo, removeTodo } = useDevice()
  const { todos, error, undoable, setDone, doneRank } = useTodos(today)
  const flip = useFlip<HTMLDivElement>()
  const byDone = (a: Todo, b: Todo) => doneRank(a) - doneRank(b)

  if (!todos) return null

  const groups: { title: string; today?: boolean; items: Todo[] }[] = []
  groups.push({ title: 'Heute', today: true, items: todos.filter((t) => t.due_date && t.due_date <= today).sort(byDone) })
  const future = [...new Set(todos.filter((t) => t.due_date && t.due_date > today).map((t) => t.due_date!))].sort()
  for (const day of future) {
    const [, m, d] = day.split('-').map(Number)
    groups.push({
      title: day === tomorrow ? 'Morgen' : `${weekdayShort(day)} ${d}.${m}.`,
      items: todos.filter((t) => t.due_date === day).sort(byDone),
    })
  }
  groups.push({ title: 'Diese Woche', items: todos.filter((t) => !t.due_date && t.this_week).sort(byDone) })
  groups.push({ title: 'Ohne Tag', items: todos.filter((t) => !t.due_date && !t.this_week).sort(byDone) })

  const sinceHint = (t: Todo) =>
    t.moved_since ? (t.moved_since === addDays(today, -1) ? 'seit gestern' : `seit ${weekdayShort(t.moved_since)}`) : undefined

  return (
    <div ref={flip} className="relative flex flex-col gap-5">
      {error && (
        <p role="status" className="rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          Verbindung gerade unterbrochen. Die Liste lädt gleich neu.
        </p>
      )}
      {groups
        .filter((g) => g.today || g.items.length)
        .map((g) => (
          <section key={g.title} className="hb-tile hb-tile-static gap-2 p-4">
            <h2 className="flex items-center gap-2 font-display text-title text-ink">
              {g.title}
              {g.today && g.items.some((t) => !t.done_at) && (
                <Badge tone="today">{g.items.filter((t) => !t.done_at).length} offen</Badge>
              )}
            </h2>
            {g.items.length === 0 ? (
              <p className="text-body text-ink-muted">Heute ist frei. Tipp auf Plus für ein neues Todo.</p>
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
                      />
                    </div>
                    {!t.done_at && (
                      <Badge tone={who === 'open' ? undefined : who}>{t.assignee ? byId.get(t.assignee)?.name : 'Offen'}</Badge>
                    )}
                  </div>
                )
                return (
                  <div key={t.id} data-flip-id={t.id}>
                    {removeTodo ? <SwipeToDelete onDelete={() => removeTodo(t)}>{row}</SwipeToDelete> : row}
                  </div>
                )
              })
            )}
          </section>
        ))}
    </div>
  )
}
