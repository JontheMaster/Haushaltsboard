import { CalendarPlus, ChefHat, Save, Trash2, TriangleAlert, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { addDays, berlinAtISO, berlinHHMM, useToday, weekdayShort } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { useCalendar, type CalendarEvent } from '../calendar/useCalendar'
import { formatDuration } from './ingredients'
import { deleteMeal, hm, isMealEvent, mealEvent, planMeal, updateMeal, useMeals, type Meal } from './mealStore'
import { ServingsStepper } from './RecipeDetail'
import { RecipeImage } from './RecipeLibrary'
import type { Recipe } from './recipeStore'

const TIMES = ['08:00', '12:00', '18:00', '18:30', '19:00']
export const DEFAULT_TIME = '18:30'

function dayChip(day: string, today: string): string {
  if (day === today) return 'Heute'
  if (day === addDays(today, 1)) return 'Morgen'
  return `${weekdayShort(day)} ${Number(day.slice(8))}.`
}

/** Termine (und andere Essen), die sich mit der Kochzeit überschneiden */
function clashes(events: CalendarEvent[], start: string, end: string): CalendarEvent[] {
  return events.filter((e) => !e.allDay && e.start < end && e.end > start)
}

type Props = {
  recipe?: Recipe | null
  /** bestehendes Essen ändern */
  meal?: Meal
  day?: string
  time?: string | null
  onClose: () => void
  /** nach dem Einplanen (neu): weiter zur Einkaufsfrage */
  onPlanned?: (meal: Meal) => void
  onSaved?: (message: string) => void
  onOpenRecipe?: () => void
  onCook?: (servings: number) => void
}

/** Essen einplanen oder ändern: Tag, Uhrzeit, Portionen; zeigt, was an dem Tag schon ansteht */
export function PlanSheet({ recipe, meal, day: initialDay, time: initialTime, onClose, onPlanned, onSaved, onOpenRecipe, onCook }: Props) {
  const today = useToday()
  const { me } = useMembers()
  const { events } = useCalendar()
  const meals = useMeals()
  const [day, setDay] = useState(meal?.day ?? initialDay ?? today)
  const [time, setTime] = useState<string | null>(meal ? hm(meal.start_time) : initialTime === undefined ? DEFAULT_TIME : initialTime)
  const [servings, setServings] = useState(meal?.servings ?? 2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const title = meal?.title ?? recipe?.title ?? ''
  const duration = meal?.duration_min ?? recipe?.duration_min ?? null
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  if (!days.includes(day)) days.push(day)

  // Was an dem Tag ansteht: Termine plus andere Essen (das eigene ausgenommen)
  const agenda = useMemo(() => {
    const other = (meals ?? []).filter((m) => m.id !== meal?.id).map(mealEvent)
    return eventsOnDay([...(events ?? []), ...other], day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
  }, [events, meals, day, meal?.id])

  const start = time ? berlinAtISO(day, time) : null
  const end = start ? new Date(Date.parse(start) + (duration || 45) * 60000).toISOString() : null
  const clash = start && end ? clashes(agenda, start, end) : []

  async function save() {
    setBusy(true)
    setError(null)
    const start_time = time ? `${time}:00` : null
    if (meal) {
      const ok = await updateMeal(meal.id, { day, start_time, servings })
      setBusy(false)
      if (!ok) return setError('Speichern hat nicht geklappt. Prüf die Verbindung.')
      onSaved?.(`${title} geändert`)
      return onClose()
    }
    const row = await planMeal({ recipe_id: recipe?.id ?? null, title, day, start_time, duration_min: duration, servings, created_by: me.id })
    setBusy(false)
    if (!row) return setError('Einplanen hat nicht geklappt. Prüf die Verbindung.')
    onPlanned?.(row)
  }

  async function remove() {
    if (!meal) return
    if (!confirm) return setConfirm(true)
    setBusy(true)
    if (!(await deleteMeal(meal.id))) {
      setBusy(false)
      return setError('Entfernen hat nicht geklappt.')
    }
    onSaved?.(`${title} aus dem Plan genommen`)
    onClose()
  }

  return (
    <Sheet title={meal ? 'Essen ändern' : 'Einplanen'} onClose={onClose}>
      <div className="flex items-center gap-3">
        {recipe ? <RecipeImage recipe={recipe} className="hb-recipe-img-sm" /> : <span className="hb-recipe-img hb-recipe-img-sm"><Icon icon={UtensilsCrossed} size={22} /></span>}
        <span className="flex min-w-0 flex-col">
          <span className="hb-recipe-title">{title}</span>
          {duration ? <span className="text-label text-ink-muted">Dauer {formatDuration(duration)}</span> : null}
        </span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-ink">Tag</legend>
        <div className="hb-chip-row">
          {days.map((d) => (
            <button key={d} type="button" className={`hb-choice ${d === day ? 'is-on' : ''}`} aria-pressed={d === day} onClick={() => setDay(d)}>
              {dayChip(d, today)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-ink">Kochen ab</legend>
        <div className="flex flex-wrap items-center gap-2">
          {TIMES.map((t) => (
            <button key={t} type="button" className={`hb-choice ${time === t ? 'is-on' : ''}`} aria-pressed={time === t} onClick={() => setTime(t)}>
              {t}
            </button>
          ))}
          <input
            type="time"
            aria-label="Andere Uhrzeit"
            value={time && !TIMES.includes(time) ? time : ''}
            onChange={(e) => setTime(e.target.value || null)}
            className={`hb-choice hb-time-input ${time && !TIMES.includes(time) ? 'is-on' : ''}`}
          />
          <button type="button" className={`hb-choice ${time === null ? 'is-on' : ''}`} aria-pressed={time === null} onClick={() => setTime(null)}>
            Ohne Uhrzeit
          </button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-label text-ink">Portionen</span>
        <ServingsStepper value={servings} onChange={setServings} />
      </div>

      <section className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
        <span className="text-label text-ink">An dem Tag</span>
        {agenda.length === 0 ? (
          <span className="text-label text-ink-muted">Noch nichts eingetragen.</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {agenda.map((e) => (
              <li key={e.id} className={`flex gap-2 text-label ${clash.includes(e) ? 'text-urgent' : 'text-ink-muted'}`}>
                <span className="w-[92px] shrink-0 tabular-nums">{e.allDay ? 'Ganztags' : `${berlinHHMM(e.start)}–${berlinHHMM(e.end)}`}</span>
                <span className="min-w-0 flex-1 truncate">
                  {isMealEvent(e) && <Icon icon={UtensilsCrossed} size={14} className="mr-1 inline align-[-2px]" />}
                  {e.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        {clash.length > 0 && (
          <span className="flex items-center gap-2 text-label text-urgent">
            <Icon icon={TriangleAlert} size={16} />
            Überschneidet sich mit {clash.map((c) => `„${c.title}“`).join(', ')}
          </span>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" disabled={busy} onClick={save} icon={<Icon icon={meal ? Save : CalendarPlus} size={22} />}>
          {meal ? 'Speichern' : `${dayChip(day, today)}${time ? ` um ${time}` : ''} einplanen`}
        </Button>
        {meal && onCook && recipe && (
          <Button icon={<Icon icon={ChefHat} size={20} />} onClick={() => onCook(servings)}>
            Kochen starten
          </Button>
        )}
        {meal && onOpenRecipe && recipe && <Button onClick={onOpenRecipe}>Rezept ansehen</Button>}
        {meal && (
          <Button variant="ghost" className="hb-btn-danger" disabled={busy} onClick={remove} icon={<Icon icon={Trash2} size={18} />}>
            {confirm ? 'Wirklich entfernen? Nochmal tippen' : 'Aus dem Plan nehmen'}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
