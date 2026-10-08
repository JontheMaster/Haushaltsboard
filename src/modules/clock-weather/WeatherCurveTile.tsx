import { CloudSun, Shirt, Droplet } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PlayInView } from '../../components/PlayInView'
import { Tile } from '../../components/Tile'
import { addDays, berlinTime, useNow, useToday } from '../../lib/time'
import { DayCurve } from '../briefing/DayCurve'
import { weatherSentence } from '../briefing/MorningBriefing'
import type { TileProps } from '../types'
import { describe, useWeather, wxClass, type Weather } from './weather'

/** Ab dieser Stunde zeigt die Kachel von selbst schon morgen (Klamotten rauslegen) */
const EVENING_FROM = 18

/**
 * Handy-Kachel: Wetter jetzt, Satz zum Tag und die Tageskurve bis Mitternacht (wie im Morgen-Briefing).
 * Umschalter „Heute | Morgen“: morgen mit Kleidungstipp, abends von selbst vorgewählt.
 */
export function WeatherCurveTile({ delay }: TileProps) {
  const weather = useWeather()
  const today = useToday()
  const { hh, mm } = berlinTime(useNow(60_000))
  const [picked, setPicked] = useState<'today' | 'tomorrow' | null>(null)
  const view = picked ?? (Number(hh) >= EVENING_FROM ? 'tomorrow' : 'today')

  const switcher = (
    <div className="hb-seg" role="group" aria-label="Tag">
      <button type="button" aria-pressed={view === 'today'} className={view === 'today' ? 'is-on' : ''} onClick={() => setPicked('today')}>
        Heute
      </button>
      <button type="button" aria-pressed={view === 'tomorrow'} className={view === 'tomorrow' ? 'is-on' : ''} onClick={() => setPicked('tomorrow')}>
        Morgen
      </button>
    </div>
  )

  return (
    <Tile title="Wetter" icon={CloudSun} delay={delay} action={switcher}>
      {!weather ? (
        <p className="text-body text-ink-muted">Wetter lädt …</p>
      ) : view === 'today' ? (
        <TodayView weather={weather} today={today} hour={Number(hh)} minute={Number(mm)} />
      ) : (
        <TomorrowView weather={weather} day={addDays(today, 1)} />
      )}
    </Tile>
  )
}

function TodayView({ weather, today, hour, minute }: { weather: Weather; today: string; hour: number; minute: number }) {
  const w = describe(weather.now.code, weather.now.isDay)
  const sentence = weatherSentence(weather, today, hour)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Icon icon={w.icon} size={44} label={w.label} className={`text-accent ${wxClass(weather.now.code, weather.now.isDay)}`} />
        <span className="font-display text-[44px] font-bold leading-none tracking-tight text-ink">{weather.now.temp}°</span>
        <span className="text-label text-ink-muted">
          {w.label}
          <br />
          bis {weather.days[0]?.max}° · nachts {weather.days[0]?.min}°
        </span>
      </div>
      <p className={`hb-tile-sentence ${sentence.rain ? 'is-rain' : ''}`}>
        {sentence.rain && <Icon icon={Droplet} size={18} />}
        {sentence.text}
      </p>
      <PlayInView className="h-[150px]">
        <DayCurve weather={weather} today={today} nowHour={hour + minute / 60} compact />
      </PlayInView>
    </div>
  )
}

function TomorrowView({ weather, day }: { weather: Weather; day: string }) {
  const d = weather.days.find((x) => x.day === day)
  if (!d) return <p className="text-body text-ink-muted">Für morgen gibt es noch keine Vorhersage.</p>
  const w = describe(d.code, true)
  const rain = rainFrom(weather, day)
  const tip = clothingTip(weather, day, d.max)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Icon icon={w.icon} size={44} label={w.label} className={`text-accent ${wxClass(d.code, true)}`} />
        <span className="font-display text-[44px] font-bold leading-none tracking-tight text-ink">{d.max}°</span>
        <span className="text-label text-ink-muted">
          {w.label}
          <br />
          morgens {tip.morning}° · nachts {d.min}°
        </span>
      </div>
      <p className="hb-tile-sentence">
        <Icon icon={Shirt} size={18} />
        {tip.text}
      </p>
      {rain && (
        <p className="hb-tile-sentence is-rain">
          <Icon icon={Droplet} size={18} />
          {rain}
        </p>
      )}
      <PlayInView className="h-[150px]">
        {/* kein „jetzt“-Punkt: es ist ja noch nicht morgen */}
        <DayCurve weather={weather} today={day} nowHour={-1} compact />
      </PlayInView>
    </div>
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
