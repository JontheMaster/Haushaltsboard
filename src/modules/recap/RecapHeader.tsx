import { ChevronRight, Trophy } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { openRecap, useRecap, useRecapOpen, useRecapTime } from './recapStore'

/**
 * Sonntags ab Nachmittag: Karte in der Wand-Kopfzeile bzw. oben auf der Handy-Startseite
 * (wie „Läuft gerade“ und Essen). Antippen öffnet den Wochenrückblick.
 */
export function RecapHeader() {
  const show = useRecapTime()
  const isOpen = useRecapOpen()
  if (!show || isOpen) return null
  return <RecapCard />
}

function RecapCard() {
  const recap = useRecap()
  const done = recap && recap !== 'error' ? recap.todos.done + recap.chores.done : null
  const meals = recap && recap !== 'error' ? recap.meals.length : 0
  const summary =
    done === null
      ? 'Eure Woche'
      : [done > 0 ? `${done} erledigt` : null, meals > 0 ? `${meals} Essen` : null].filter(Boolean).join(' · ') || 'Eine ruhige Woche'

  return (
    // sieht aus wie die Essen-Karte und teilt sich mit ihr die Regeln im Kopfzeilen-Platz
    <button type="button" className="hb-meal-card hb-recap-card hb-slot-item" data-kind="meal" aria-label="Wochenrückblick ansehen" onClick={openRecap}>
      <span className="hb-recipe-img hb-meal-card-img">
        <Icon icon={Trophy} size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="hb-meal-card-when">
          <Icon icon={Trophy} size={14} />
          Wochenrückblick
        </span>
        <span className="hb-meal-card-title">{summary}</span>
      </span>
      <span className="hb-meal-card-go">
        Ansehen
        <Icon icon={ChevronRight} size={18} />
      </span>
    </button>
  )
}
