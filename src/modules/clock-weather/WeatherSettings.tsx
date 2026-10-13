import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import { setModuleConfig, useModuleConfig } from '../useModules'

export type WeatherConfig = { default_view: 'forecast' | 'radar'; auto_radar: boolean }
export const WEATHER_DEFAULTS: WeatherConfig = { default_view: 'forecast', auto_radar: true }

/** Alle Funktionen → Uhr und Wetter: Standardansicht der Wetter-Kachel und automatischer Wechsel aufs Radar */
export function WeatherSettings({ onBack }: { onBack: () => void }) {
  const cfg = useModuleConfig<WeatherConfig>('uhr-wetter', WEATHER_DEFAULTS)
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Uhr und Wetter" onBack={onBack} />
      <section className="hb-tile hb-tile-static gap-3 p-4">
        <span className="font-semibold text-ink">Standardansicht der Wetter-Kachel</span>
        <div className="hb-seg" role="group" aria-label="Standardansicht">
          <button type="button" aria-pressed={cfg.default_view === 'forecast'} className={cfg.default_view === 'forecast' ? 'is-on' : ''} onClick={() => setModuleConfig('uhr-wetter', { default_view: 'forecast' })}>
            Vorhersage
          </button>
          <button type="button" aria-pressed={cfg.default_view === 'radar'} className={cfg.default_view === 'radar' ? 'is-on' : ''} onClick={() => setModuleConfig('uhr-wetter', { default_view: 'radar' })}>
            Radar
          </button>
        </div>
        <p className="text-label text-ink-muted">Vorhersage zeigt tagsüber heute und ab 18 Uhr schon morgen.</p>
        <Toggle checked={cfg.auto_radar} label="Automatisch auf Radar wechseln, wenn Regen in den nächsten 30 min kommt" onChange={(on) => setModuleConfig('uhr-wetter', { auto_radar: on })} />
        <p className="text-label text-ink-muted">Ist es wieder trocken, zeigt die Kachel wieder die Standardansicht. Von Hand Gewähltes gilt an der Wand 2 Minuten.</p>
      </section>
      <p className="px-1 text-label text-ink-muted">
        Regenradar: Datenbasis Deutscher Wetterdienst (Produkt RV, über Bright Sky), eigene Bearbeitung. Karte © OpenStreetMap-Mitwirkende. Neu alle 5 Minuten.
      </p>
    </div>
  )
}
