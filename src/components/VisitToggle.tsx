import { useSettings } from '../lib/settings'
import { Toggle } from './Toggle'

/** Besuchsmodus an/aus. Wirkt sofort auf allen Geräten (settings.visit_mode, Realtime). */
export function VisitToggle({ short }: { short?: boolean }) {
  const { settings, setVisitMode } = useSettings()
  if (!settings) return null
  return (
    <div className="flex items-center gap-2 text-label text-ink-muted">
      <span aria-hidden="true">{short ? 'Besuch' : 'Besuchsmodus'}</span>
      <Toggle checked={settings.visit_mode} label="Besuchsmodus" hideLabel onChange={setVisitMode} />
    </div>
  )
}
