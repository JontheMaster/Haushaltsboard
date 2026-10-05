import { Icon } from '../../components/Icon'
import { berlinTime, longDate, useNow, weekdayShort } from '../../lib/time'
import { describe, type Weather } from './weather'

// Kopfzeile an der Wand: große Uhr, Datum, Wetter heute und die nächsten zwei Tage
export function ClockWeather({ weather }: { weather: Weather | null }) {
  const now = useNow(1000)
  const { hh, mm } = berlinTime(now)

  return (
    <div className="hb-clock">
      <div className="hb-clock-time" role="timer" aria-label={`${hh}:${mm} Uhr`}>
        {/* key wechselt → Ziffer rollt neu ein */}
        <span key={`h${hh}`} className="hb-roll">
          {hh}
        </span>
        <span className="hb-clock-colon" aria-hidden="true">
          :
        </span>
        <span key={`m${mm}`} className="hb-roll">
          {mm}
        </span>
      </div>
      <div className="hb-clock-meta">
        <div className="hb-clock-date">{longDate(now)}</div>
        {weather ? <WeatherLine weather={weather} /> : <div className="hb-weather">Wetter lädt …</div>}
      </div>
    </div>
  )
}

function WeatherLine({ weather }: { weather: Weather }) {
  const current = describe(weather.now.code, weather.now.isDay)
  return (
    <div className="hb-weather">
      <span className="hb-weather-now">
        <Icon icon={current.icon} size={26} label={current.label} />
        {weather.now.temp}°
      </span>
      {weather.days.map((d, i) => {
        const w = describe(d.code)
        return (
          <span key={d.day} className="hb-weather-day">
            {i === 0 ? 'Heute' : weekdayShort(d.day)} <Icon icon={w.icon} size={18} label={w.label} />
            {d.max}°
          </span>
        )
      })}
    </div>
  )
}
