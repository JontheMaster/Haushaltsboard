import { ChevronRight, Trophy } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { useToday } from '../../lib/time'
import { useLongPress } from '../../lib/useLongPress'
import { setModuleConfig, useModuleConfig } from '../useModules'
import { openRecap, useRecap, useRecapOpen, useRecapTime } from './recapStore'

/**
 * Sonntags ab Nachmittag: Karte in der Wand-Kopfzeile bzw. oben auf der Handy-Startseite
 * (wie „Läuft gerade“ und Essen). Antippen öffnet den Wochenrückblick, lange drücken blendet die Karte
 * für diesen Sonntag aus (überall, `modules.config.dismissed` = Tag; Rückblick bleibt in Alle Funktionen).
 * Einmal angesehen, ist sie auf diesem Konto weg (`modules.config.seen`, siehe markRecapSeen).
 */
export function RecapHeader() {
  const show = useRecapTime()
  const isOpen = useRecapOpen()
  const today = useToday()
  const { me } = useMembers()
  const { dismissed, seen } = useModuleConfig<{ dismissed?: string; seen?: Record<string, string> }>('wochenrueckblick', {})
  // weg, wenn ausgeblendet (überall) oder auf diesem Konto schon angesehen (Handy pro Person, Wand = Tablet-Konto)
  if (!show || isOpen || dismissed === today || seen?.[me.id] === today) return null
  return <RecapCard today={today} />
}

function RecapCard({ today }: { today: string }) {
  const press = useLongPress(() => {
    if (confirm('Wochenrückblick für heute ausblenden? Du findest ihn weiter in Alle Funktionen.')) setModuleConfig('wochenrueckblick', { dismissed: today })
  })
  const recap = useRecap()
  const done = recap && recap !== 'error' ? recap.todos.done + recap.chores.done : null
  const meals = recap && recap !== 'error' ? recap.meals.length : 0
  const summary =
    done === null
      ? 'Eure Woche'
      : [done > 0 ? `${done} erledigt` : null, meals > 0 ? `${meals} Essen` : null].filter(Boolean).join(' · ') || 'Eine ruhige Woche'

  return (
    // sieht aus wie die Essen-Karte und teilt sich mit ihr die Regeln im Kopfzeilen-Platz
    <button
      type="button"
      className="hb-meal-card hb-recap-card hb-slot-item"
      data-kind="meal"
      aria-label="Wochenrückblick ansehen, lange drücken blendet aus"
      onPointerDown={press.onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => !press.fired.current && openRecap()}
    >
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
