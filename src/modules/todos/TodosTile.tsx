import { ListChecks } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { PersonChip } from '../../components/PersonChip'
import { TaskItem } from '../../components/TaskItem'
import { Tile } from '../../components/Tile'
import { useMembers, type PersonKey } from '../../lib/members'
import { addDays, useToday, weekdayShort } from '../../lib/time'
import type { TileProps } from '../types'
import { useTodos, type Todo } from './useTodos'

// Offene zuerst, Erledigte rutschen ans Ende ihrer Spalte
const byDone = (a: Todo, b: Todo) => Number(!!a.done_at) - Number(!!b.done_at)

export function TodosTile({ delay }: TileProps) {
  const today = useToday()
  const { people, personKey } = useMembers()
  const { todos, error, undoable, setDone } = useTodos(today)

  // Fällig heute (oder überfällig, falls der Nachtjob noch nicht lief)
  const dueToday = (todos ?? []).filter((t) => t.due_date && t.due_date <= today).sort(byDone)
  const noDay = (todos ?? []).filter((t) => !t.due_date).sort(byDone)

  // Zwei Spalten pro Person, darunter „Offen“ (heute, wer Zeit hat)
  const columns: { key: PersonKey; name: string; items: Todo[] }[] = people.map((p) => ({
    key: personKey(p.id),
    name: p.name,
    items: dueToday.filter((t) => t.assignee === p.id),
  }))
  const openToday = dueToday.filter((t) => !t.assignee)

  const sinceHint = (t: Todo) => {
    if (!t.moved_since) return undefined
    return t.moved_since === addDays(today, -1) ? 'seit gestern' : `seit ${weekdayShort(t.moved_since)}`
  }

  const item = (t: Todo, compact = false) => (
    <TaskItem
      key={t.id}
      label={t.title}
      done={!!t.done_at}
      person={personKey(t.assignee)}
      meta={sinceHint(t)}
      showUndo={undoable.has(t.id)}
      compact={compact}
      onToggle={(done) => setDone(t.id, done)}
    />
  )

  return (
    <Tile title="Todos heute" icon={ListChecks} delay={delay}>
      {error && (
        <p role="status" className="mb-2 rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          Verbindung gerade unterbrochen. Die Liste lädt gleich neu.
        </p>
      )}

      {todos && dueToday.length === 0 ? (
        <p className="text-body-wall text-ink-muted">Heute ist frei. Neues Todo am Handy anlegen.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5">
            {columns.map((c) => (
              <div key={c.key} className="flex min-w-0 flex-col gap-1">
                <div className="mb-2">
                  <PersonChip person={c.key} name={c.name} />
                </div>
                {c.items.length ? c.items.map((t) => item(t)) : <p className="text-label text-ink-muted">Nichts für heute.</p>}
              </div>
            ))}
          </div>
          {openToday.length > 0 && (
            <div className="mt-4 flex flex-col gap-1">
              <div className="mb-2">
                <PersonChip person="open" name="Offen, wer Zeit hat" />
              </div>
              <div className="columns-2 gap-5">
                {openToday.map((t) => (
                  <div key={t.id} className="break-inside-avoid">
                    {item(t)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {noDay.length > 0 && (
        <div className="mt-5 flex flex-col gap-1 border-t border-line pt-4">
          <h3 className="mb-2 text-label text-ink-muted">Offen, noch ohne Tag</h3>
          <div className="columns-2 gap-5">
            {noDay.map((t) => (
              <div key={t.id} className="flex break-inside-avoid items-center gap-2">
                <div className="min-w-0 flex-1">{item(t, true)}</div>
                {t.this_week && !t.done_at && <Badge tone="accent">Diese Woche</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Tile>
  )
}
