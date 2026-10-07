import { CloudSun, Umbrella } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Tile } from '../../components/Tile'
import { berlinTime, useNow, useToday } from '../../lib/time'
import { DayCurve } from '../briefing/DayCurve'
import { weatherSentence } from '../briefing/MorningBriefing'
import type { TileProps } from '../types'
import { describe, useWeather, wxClass } from './weather'

/** Handy-Kachel: Wetter jetzt, Satz zum Tag und die Tageskurve bis Mitternacht (wie im Morgen-Briefing) */
export function WeatherCurveTile({ delay }: TileProps) {
  const weather = useWeather()
  const today = useToday()
  const { hh, mm } = berlinTime(useNow(60_000))
  const w = weather && describe(weather.now.code, weather.now.isDay)
  const sentence = weather ? weatherSentence(weather, today, Number(hh)) : null
  return (
    <Tile title="Wetter" icon={CloudSun} delay={delay}>
      {weather && w ? (
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
          {sentence && (
            <p className={`hb-tile-sentence ${sentence.rain ? 'is-rain' : ''}`}>
              {sentence.rain && <Icon icon={Umbrella} size={18} />}
              {sentence.text}
            </p>
          )}
          <div className="h-[150px]">
            <DayCurve weather={weather} today={today} nowHour={Number(hh) + Number(mm) / 60} compact />
          </div>
        </div>
      ) : (
        <p className="text-body text-ink-muted">Wetter lädt …</p>
      )}
    </Tile>
  )
}
