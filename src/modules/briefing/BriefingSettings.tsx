import { Plus, X } from 'lucide-react'
import { Choice } from '../../components/Choice'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { setModuleConfig, useModuleConfig } from '../useModules'
import { BRIEFING_DEFAULTS, SHOW_MINUTES } from './MorningBriefing'
import { VERSE_SOURCE, type SayingMode } from './sayings'

const SAYINGS: { value: SayingMode; label: string }[] = [
  { value: 'wechsel', label: 'Abwechselnd' },
  { value: 'bibel', label: 'Nur Bibelvers' },
  { value: 'zitat', label: 'Nur Zitat' },
  { value: 'aus', label: 'Aus' },
]

/** Morgen-Briefing: Uhrzeiten (z. B. früh für Leviona, später für Jonathan) und Spruch des Tages */
export function BriefingSettings({ onBack }: { onBack: () => void }) {
  const { times, saying } = useModuleConfig('morgen', BRIEFING_DEFAULTS)
  const save = (next: string[]) => setModuleConfig('morgen', { times: [...new Set(next.filter((t) => /^\d{2}:\d{2}$/.test(t)))].sort() })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Morgen-Briefing" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Zu diesen Uhrzeiten zeigt die Wand von selbst Wetter, Termine, Dringendes und einen Spruch – vor Nachtmodus und
        Bildschirmschoner. Antippen schließt es, sonst bleibt es {SHOW_MINUTES} Minuten.
      </p>

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <h3 className="font-display text-body-wall font-semibold text-ink">Uhrzeiten</h3>
        {times.map((t, i) => (
          <div key={t + i} className="flex items-center gap-3">
            <input
              type="time"
              aria-label={`Uhrzeit ${i + 1}`}
              className="h-7 w-[128px] rounded-md border border-line bg-surface-sunken px-3 text-body text-ink focus-visible:focus-ring"
              defaultValue={t}
              onBlur={(e) => e.target.value !== t && save(times.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button type="button" className="hb-icon-btn" aria-label={`${t} entfernen`} onClick={() => save(times.filter((_, j) => j !== i))}>
              <Icon icon={X} size={20} />
            </button>
          </div>
        ))}
        {times.length === 0 && <p className="text-label text-ink-muted">Keine Uhrzeit: Das Briefing erscheint nicht.</p>}
        <button type="button" className="hb-btn self-start" onClick={() => save([...times, times.length ? '08:00' : '06:00'])}>
          <Icon icon={Plus} size={20} />
          Uhrzeit hinzufügen
        </button>
      </section>

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <Choice<SayingMode>
          label="Spruch des Tages"
          options={SAYINGS}
          isSelected={(v) => v === saying}
          onSelect={(v) => setModuleConfig('morgen', { saying: v })}
        />
        <p className="text-caption text-ink-muted">
          Bibelverse: {VERSE_SOURCE}. Zitate von Autorinnen und Autoren, deren Texte frei sind (Bonhoeffer, Luther, Goethe …).
        </p>
      </section>
    </div>
  )
}
