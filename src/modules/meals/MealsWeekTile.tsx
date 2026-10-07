import { UtensilsCrossed } from 'lucide-react'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import { addDays, useToday, weekdayShort } from '../../lib/time'
import type { TileProps } from '../types'
import { hm, useMeals } from './mealStore'
import { usePlanFlow } from './MealsTab'

function dayName(day: string, today: string): string {
  if (day === today) return 'Heute'
  if (day === addDays(today, 1)) return 'Morgen'
  return `${weekdayShort(day)} ${Number(day.slice(8))}.`
}

/** Handy-Kachel: was in den nächsten 7 Tagen gekocht wird; antippen = ändern, kochen oder entfernen */
export function MealsWeekTile({ delay }: TileProps) {
  const today = useToday()
  const { showToast } = useDevice()
  const flow = usePlanFlow(showToast ?? (() => {}))
  const meals = (useMeals() ?? []).filter((m) => m.day >= today && m.day < addDays(today, 7))
  return (
    <Tile title="Essen diese Woche" icon={UtensilsCrossed} delay={delay}>
      {meals.length === 0 ? (
        <p className="text-body text-ink-muted">Noch nichts geplant. Im Reiter Essen ein Rezept einplanen.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {meals.map((m) => (
            <li key={m.id}>
              <button type="button" className="hb-mini-row" onClick={() => flow.setPlan({ meal: m })}>
                <span className="hb-mini-day">{dayName(m.day, today)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{m.title}</span>
                {hm(m.start_time) && <span className="text-label text-ink-muted tabular-nums">{hm(m.start_time)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {flow.sheets({})}
    </Tile>
  )
}
