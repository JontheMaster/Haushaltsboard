import { Sparkles } from 'lucide-react'
import { PersonChip } from '../../components/PersonChip'
import { Tile } from '../../components/Tile'
import { useMembers } from '../../lib/members'
import { addDays, mondayOf, useToday, weekdayShort } from '../../lib/time'
import { useTodos } from '../todos/useTodos'
import type { TileProps } from '../types'

/** Handy-Kachel: was im Putzplan diese Woche noch ansteht und wer dran ist */
export function ChoresWeekTile({ delay }: TileProps) {
  const today = useToday()
  const sunday = addDays(mondayOf(today), 6)
  const { todos } = useTodos(today)
  const { byId, personKey } = useMembers()
  const chores = (todos ?? [])
    .filter((t) => t.chore && !t.done_at && (!t.due_date || t.due_date <= sunday))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))

  return (
    <Tile title="Putzplan diese Woche" icon={Sparkles} delay={delay}>
      {chores.length === 0 ? (
        <p className="text-body text-ink-muted">Diese Woche ist alles geputzt.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {chores.map((t) => (
            <li key={t.id} className="hb-mini-row is-static">
              <span className={`hb-mini-day ${t.due_date && t.due_date < today ? 'is-late' : ''}`}>
                {!t.due_date ? 'Woche' : t.due_date < today ? 'seit ' + weekdayShort(t.due_date) : t.due_date === today ? 'Heute' : weekdayShort(t.due_date)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{t.title}</span>
              <PersonChip person={personKey(t.assignee)} name={t.assignee ? (byId.get(t.assignee)?.name ?? '') : 'Offen'} />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
