import { useEffect } from 'react'
import type { Weather } from '../modules/clock-weather/weather'
import { berlinDay, berlinStamp, berlinTime, useNow } from './time'

/** Abend-Theme zwischen Sonnenuntergang und Sonnenaufgang (Open-Meteo liefert beides) */
export function useEveningTheme(weather: Weather | null, forceDark = false) {
  const now = useNow(60_000)
  useEffect(() => {
    const stamp = berlinStamp(now)
    // Sonnenzeiten von heute: aus dem Wetter, solange es von heute ist, sonst selbst gerechnet (Nürnberg).
    // Vorher blieb das Board dunkel, wenn nach dem nächtlichen Neuladen das Wetter nicht kam (22.10.2026).
    const today = stamp.slice(0, 10)
    const sun = weather && weather.sunrise.startsWith(today) ? weather : sunTimes(now)
    const evening = forceDark || stamp >= sun.sunset || stamp < sun.sunrise
    document.documentElement.dataset.theme = evening ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim())
  }, [weather, now, forceDark])
}

/**
 * Sonnenauf- und -untergang für Nürnberg (49,45 N / 11,08 O), in Berliner Ortszeit als „YYYY-MM-DDTHH:MM“.
 * Vereinfachte NOAA-Rechnung, auf wenige Minuten genau; nur Ersatz, wenn das Wetter fehlt.
 */
export function sunTimes(d: Date): { sunrise: string; sunset: string } {
  const lat = (49.45 * Math.PI) / 180
  const lon = 11.08
  const day = berlinDay(d)
  const [y, m, dd] = day.split('-').map(Number)
  const n = Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(y, 0, 0)) / 86400000)
  const g = ((2 * Math.PI) / 365) * (n - 1)
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
  const ha = Math.acos(Math.cos((90.833 * Math.PI) / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl))
  const utcMin = (sign: number) => 720 - 4 * (lon + sign * ((ha * 180) / Math.PI)) - eqt
  const local = (min: number) => {
    const t = new Date(Date.UTC(y, m - 1, dd) + min * 60000)
    return `${berlinDay(t)}T${berlinTime(t).hh}:${berlinTime(t).mm}`
  }
  return { sunrise: local(utcMin(1)), sunset: local(utcMin(-1)) }
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
