import { CloudRain, CloudSun, Shirt, Droplet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { PlayInView } from '../../components/PlayInView'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import { addDays, berlinTime, useNow, useToday } from '../../lib/time'
import { DayCurve } from '../briefing/DayCurve'
import { weatherSentence } from '../briefing/MorningBriefing'
import type { TileProps } from '../types'
import { useIsNight } from '../../lib/idle'
import { useSettings } from '../../lib/settings'
import { useModuleConfig } from '../useModules'
import { RadarView } from './RadarView'
import { useNowcast, useRadar, type Nowcast } from './radarStore'
import { describe, useWeather, wxClass, type Weather } from './weather'
import { WEATHER_DEFAULTS, type WeatherConfig } from './WeatherSettings'

/** Ab dieser Stunde zeigt die Kachel von selbst schon morgen (Klamotten rauslegen) */
const EVENING_FROM = 18

/** an der Wand gilt eine Wahl von Hand so lange, danach wieder die Standardansicht (wie überall an der Wand) */
const WALL_PICK_MS = 2 * 60_000

type View = 'today' | 'tomorrow' | 'radar'

/**
 * Wetter-Kachel (Handy-Startseite und an der Wand neben dem Todo-Stapel): Wetter jetzt, Satz zum Tag und die Tageskurve bis Mitternacht (wie im Morgen-Briefing).
 * Umschalter „Heute | Morgen | Radar“ (docs/wetter-radar.md): morgen mit Kleidungstipp, abends von selbst vorgewählt;
 * Radar mit Schleife −60 bis +120 min. Kommt in 30 min Regen (oder regnet es), wechselt die Kachel von selbst aufs Radar.
 */
export function WeatherCurveTile({ delay }: TileProps) {
  const weather = useWeather()
  const today = useToday()
  const now = useNow(60_000)
  const { hh, mm } = berlinTime(now)
  const cfg = useModuleConfig<WeatherConfig>('uhr-wetter', WEATHER_DEFAULTS)
  const radar = useRadar()
  const nowcast = useNowcast()
  const { settings } = useSettings()
  const night = useIsNight(settings)
  const [picked, setPicked] = useState<{ view: View; at: number } | null>(null)
  // an der Wand ist die Kachel schmal und hoch: kleiner Umschalter in der Titelzeile, Kurve füllt die Höhe
  const wall = useDevice().device !== 'phone'

  // von Hand Gewähltes läuft an der Wand nach 2 Minuten ab
  useEffect(() => {
    if (!wall || !picked) return
    const t = setTimeout(() => setPicked(null), Math.max(0, picked.at + WALL_PICK_MS - Date.now()))
    return () => clearTimeout(t)
  }, [wall, picked])

  const forecast: View = Number(hh) >= EVENING_FROM ? 'tomorrow' : 'today'
  const rainSoon = !!nowcast && (nowcast.state === 'now' || (nowcast.start_min ?? 99) <= 30)
  const auto: View = radar && ((cfg.auto_radar && rainSoon) || cfg.default_view === 'radar') ? 'radar' : forecast
  const view: View = picked?.view ?? auto
  const pick = (v: View) => setPicked({ view: v, at: Date.now() })
  const line = nowcast && radar ? <NowcastLine n={nowcast} fetchedAt={radar.fetchedAt} now={now.getTime()} /> : null
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const switcher = (
    // immer der kleine Umschalter: mit drei Teilen verdeckt der normale am Handy sonst „Wetter“
    <div className="hb-seg is-small hb-weather-seg" role="group" aria-label="Ansicht">
      <button type="button" aria-pressed={view === 'today'} className={view === 'today' ? 'is-on' : ''} onClick={() => pick('today')}>
        Heute
      </button>
      <button type="button" aria-pressed={view === 'tomorrow'} className={view === 'tomorrow' ? 'is-on' : ''} onClick={() => pick('tomorrow')}>
        Morgen
      </button>
      <button type="button" aria-pressed={view === 'radar'} className={view === 'radar' ? 'is-on' : ''} onClick={() => pick('radar')}>
        Radar
      </button>
    </div>
  )

  return (
    <Tile title="Wetter" icon={CloudSun} delay={delay} action={switcher} className={wall ? 'hb-weather-wall' : 'hb-weather-phone'}>
      {/* key: beim Wechsel blendet die neue Ansicht weich ein */}
      <div key={view} className={`hb-weather-view ${wall ? 'flex h-full flex-col gap-3' : 'flex flex-col gap-3'}`}>
        {view === 'radar' ? (
          !radar ? (
            <p className="text-body text-ink-muted">Radar lädt …</p>
          ) : radar.stale ? (
            <p className="text-body text-ink-muted">Radar gerade nicht erreichbar. Es wird alle 5 Minuten neu versucht.</p>
          ) : (
            <>
              {line}
              <RadarView radar={radar} still={night || calm} wall={wall} />
            </>
          )
        ) : !weather ? (
          <p className="text-body text-ink-muted">Wetter lädt …</p>
        ) : view === 'today' ? (
          <TodayView weather={weather} today={today} hour={Number(hh)} minute={Number(mm)} wall={wall} nowcast={line} />
        ) : (
          <TomorrowView weather={weather} day={addDays(today, 1)} wall={wall} nowcast={line} />
        )}
      </div>
    </Tile>
  )
}

/** Nowcast-Satz: „Regen in 18 min, leicht, bis ca. 16:40“ (Minuten ab jetzt nachgerechnet), Starkregen in urgent */
function NowcastLine({ n, fetchedAt, now }: { n: Nowcast; fetchedAt: number; now: number }) {
  let text = n.text
  if (n.state === 'soon' && n.start_min !== null) {
    const left = Math.round(n.start_min - (now - fetchedAt) / 60_000)
    text = text.replace(`in ${n.start_min} min`, left > 0 ? `in ${left} min` : 'gleich')
  }
  return (
    <p className={`hb-nowcast ${n.level === 'Starkregen' ? 'is-urgent' : ''}`}>
      <Icon icon={CloudRain} size={18} />
      {text}
    </p>
  )
}

function TodayView({ weather, today, hour, minute, wall, nowcast }: { weather: Weather; today: string; hour: number; minute: number; wall: boolean; nowcast: ReactNode }) {
  const w = describe(weather.now.code, weather.now.isDay)
  const sentence = weatherSentence(weather, today, hour)
  return (
    <>
      <div className={`flex items-center gap-3 ${wall ? 'flex-wrap' : ''}`}>
        <Icon icon={w.icon} size={44} label={w.label} className={`text-accent ${wxClass(weather.now.code, weather.now.isDay)}`} />
        <span className="font-display text-[44px] font-bold leading-none tracking-tight text-ink">{weather.now.temp}°</span>
        <span className={`text-label text-ink-muted ${wall ? 'basis-full' : ''}`}>
          {w.label}
          <br />
          bis {weather.days[0]?.max}° · nachts {weather.days[0]?.min}°
        </span>
      </div>
      <p className={`hb-tile-sentence ${sentence.rain ? 'is-rain' : ''}`}>
        {sentence.rain && <Icon icon={Droplet} size={18} />}
        {sentence.text}
      </p>
      {nowcast}
      <PlayInView className={wall ? 'flex min-h-[150px] flex-1 flex-col' : 'h-[150px]'}>
        <DayCurve weather={weather} today={today} nowHour={hour + minute / 60} compact />
      </PlayInView>
    </>
  )
}

function TomorrowView({ weather, day, wall, nowcast }: { weather: Weather; day: string; wall: boolean; nowcast: ReactNode }) {
  const d = weather.days.find((x) => x.day === day)
  if (!d) return <p className="text-body text-ink-muted">Für morgen gibt es noch keine Vorhersage.</p>
  const w = describe(d.code, true)
  const rain = rainFrom(weather, day)
  const tip = clothingTip(weather, day, d.max)
  return (
    <>
      <div className={`flex items-center gap-3 ${wall ? 'flex-wrap' : ''}`}>
        <Icon icon={w.icon} size={44} label={w.label} className={`text-accent ${wxClass(d.code, true)}`} />
        <span className="font-display text-[44px] font-bold leading-none tracking-tight text-ink">{d.max}°</span>
        <span className={`text-label text-ink-muted ${wall ? 'basis-full' : ''}`}>
          {w.label}
          <br />
          morgens {tip.morning}° · nachts {d.min}°
        </span>
      </div>
      <p className="hb-tile-sentence">
        <Icon icon={Shirt} size={18} />
        {tip.text}
      </p>
      {nowcast}
      {rain && (
        <p className="hb-tile-sentence is-rain">
          <Icon icon={Droplet} size={18} />
          {rain}
        </p>
      )}
      <PlayInView className={wall ? 'flex min-h-[150px] flex-1 flex-col' : 'h-[150px]'}>
        {/* kein „jetzt“-Punkt: es ist ja noch nicht morgen */}
        <DayCurve weather={weather} today={day} nowHour={-1} compact />
      </PlayInView>
    </>
  )
}

/** Regen tagsüber (7–22 Uhr): „Ab 8 Uhr Regen.“ oder null */
function rainFrom(weather: Weather, day: string): string | null {
  const daytime = weather.hours.filter((h) => h.time.startsWith(day) && hourOf(h) >= 7 && hourOf(h) <= 22)
  const wet = daytime.find((h) => h.rain >= 50)
  if (wet) return `Ab ${hourOf(wet)} Uhr Regen.`
  const max = Math.max(0, ...daytime.map((h) => h.rain))
  return max >= 30 ? `Vielleicht ein paar Tropfen (bis ${max} %).` : null
}

/** Was anziehen: nach der Temperatur um 8 Uhr (raus aus dem Haus) und dem Höchstwert */
function clothingTip(weather: Weather, day: string, max: number): { text: string; morning: number } {
  const at8 = weather.hours.find((h) => h.time.startsWith(day) && hourOf(h) === 8)
  const morning = at8?.temp ?? max
  let text: string
  if (morning <= 0) text = 'Winterjacke, Mütze und Handschuhe.'
  else if (morning <= 7) text = 'Winterjacke.'
  else if (morning <= 12) text = 'Jacke und Pulli.'
  else if (morning <= 16) text = max >= 21 ? 'Leichte Jacke, mittags reicht T-Shirt.' : 'Pulli oder leichte Jacke.'
  else if (max <= 24) text = 'T-Shirt, für abends was drüber.'
  else text = 'Kurz und luftig, es wird heiß.'
  return { text, morning }
}

const hourOf = (h: { time: string }) => Number(h.time.slice(11, 13))
