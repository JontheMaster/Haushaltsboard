import { CalendarRange, UtensilsCrossed } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import { addDays, berlinHHMM, useToday, weekdayShort } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { useCalendar } from '../calendar/useCalendar'
import { useMealsByDay } from '../meals/MealLine'
import { hm } from '../meals/mealStore'
import { dueOn, useTodos } from '../todos/useTodos'
import type { TileProps } from '../types'

/** Kalenderfarbe als Punkt (blue/berry sind die Personenfarben) */
function dot(color: string | undefined): string {
  if (color === 'blue') return 'var(--person-a)'
  if (color === 'berry') return 'var(--person-b)'
  return color ? `var(--cal-${color})` : 'var(--ink-muted)'
}

/** Handy-Kachel: die nächsten 3 Tage kompakt – Termine, Essen, Anzahl offener Todos. Antippen öffnet die Woche. */
export function WeekCompactTile({ delay }: TileProps) {
  const today = useToday()
  const { goTab } = useDevice()
  const { events } = useCalendar()
  const mealsOn = useMealsByDay()
  const { todos } = useTodos(today)
  const days = [0, 1, 2].map((n) => addDays(today, n))

  return (
    <Tile title="Die nächsten Tage" icon={CalendarRange} delay={delay}>
      <button type="button" className="hb-compact-week" onClick={() => goTab?.('woche')} aria-label="Woche öffnen">
        {days.map((day, i) => {
          const evs = eventsOnDay(events ?? [], day).slice(0, 3)
          const open = (todos ?? []).filter((t) => !t.done_at && dueOn(t, day, today)).length
          return (
            <div key={day} className="hb-compact-day">
              <span className="hb-compact-head">{i === 0 ? 'Heute' : i === 1 ? 'Morgen' : `${weekdayShort(day)} ${Number(day.slice(8))}.`}</span>
              {evs.map((e) => (
                <span key={e.id} className="hb-compact-line">
                  <i style={{ background: dot(e.color) }} />
                  <span className="hb-compact-time">{e.allDay ? 'ganzt.' : berlinHHMM(e.start)}</span>
                  <span className="min-w-0 truncate">{e.title}</span>
                </span>
              ))}
              {mealsOn(day).map((m) => (
                <span key={m.id} className="hb-compact-line is-meal">
                  <Icon icon={UtensilsCrossed} size={13} />
                  <span className="hb-compact-time">{hm(m.start_time) ?? ''}</span>
                  <span className="min-w-0 truncate">{m.title}</span>
                </span>
              ))}
              {!evs.length && !mealsOn(day).length && <span className="hb-compact-empty">Frei</span>}
              {open > 0 && <span className="hb-compact-todos">{open === 1 ? '1 Todo' : `${open} Todos`}</span>}
            </div>
          )
        })}
      </button>
    </Tile>
  )
}
