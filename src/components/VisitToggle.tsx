import { useSettings } from '../lib/settings'
import { Toggle } from './Toggle'

/** Besuchsmodus an/aus. Wirkt sofort auf allen Geräten (settings.visit_mode, Realtime). */
export function VisitToggle({ short }: { short?: boolean }) {
  const { settings, setVisitMode } = useSettings()
  if (!settings) return null
  // Als Zeile mit Beschriftung: Wort und Schalter sind zusammen eine Tippfläche von mind. 44 px
  return (
    <div className="text-label text-ink-muted [&_.hb-toggle-row]:gap-3 [&_.hb-toggle-row]:text-label">
      <Toggle checked={settings.visit_mode} label={short ? 'Besuch' : 'Besuchsmodus'} onChange={setVisitMode} />
    </div>
  )
}
