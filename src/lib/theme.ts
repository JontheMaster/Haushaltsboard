import { useEffect } from 'react'
import type { Weather } from '../modules/clock-weather/weather'
import { berlinDay, berlinStamp, berlinTime, useNow } from './time'

/** Abend-Theme zwischen Sonnenuntergang und Sonnenaufgang (Open-Meteo liefert beides) */
export function useEveningTheme(weather: Weather | null, forceDark = false) {
  const now = useNow(60_000)
  useEffect(() => {
    if (!weather && !forceDark) return
    const stamp = berlinStamp(now)
    const evening = forceDark || (!!weather && (stamp >= weather.sunset || stamp < weather.sunrise))
    document.documentElement.dataset.theme = evening ? 'dark' : 'light'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim())
  }, [weather, now, forceDark])
}

/** Einmal pro Nacht um 3 Uhr komplett neu laden: hält Speicher und Verbindungen frisch (nur Wand) */
export function useNightlyReload(enabled: boolean) {
  const now = useNow(60_000)
  useEffect(() => {
    if (!enabled || berlinTime(now).hh !== '03') return
    const key = 'hb-reloaded'
    const today = berlinDay(now)
    try {
      if (localStorage.getItem(key) === today) return
      localStorage.setItem(key, today)
    } catch {
      // ohne Speicher lieber gar nicht neu laden als in einer Schleife
      return
    }
    window.location.reload()
  }, [now, enabled])
}
