import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

// Open-Meteo, Nürnberg. Kein Schlüssel nötig, direkt aus dem Browser.
const URL =
  'https://api.open-meteo.com/v1/forecast?latitude=49.45&longitude=11.08' +
  '&current=temperature_2m,weather_code,is_day' +
  '&daily=temperature_2m_max,weather_code,sunrise,sunset' +
  '&timezone=Europe%2FBerlin&forecast_days=3'

export type Weather = {
  now: { temp: number; code: number; isDay: boolean }
  days: { day: string; max: number; code: number }[]
  sunrise: string // YYYY-MM-DDTHH:MM, Berliner Zeit
  sunset: string
}

/** WMO-Wettercode → Icon und Wort */
export function describe(code: number, isDay = true): { icon: LucideIcon; label: string } {
  if (code === 0) return isDay ? { icon: Sun, label: 'Klar' } : { icon: Moon, label: 'Klar' }
  if (code <= 2) return { icon: CloudSun, label: 'Heiter' }
  if (code === 3) return { icon: Cloud, label: 'Bedeckt' }
  if (code <= 48) return { icon: CloudFog, label: 'Nebel' }
  if (code <= 57) return { icon: CloudDrizzle, label: 'Niesel' }
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: CloudRain, label: 'Regen' }
  if (code <= 77 || code === 85 || code === 86) return { icon: CloudSnow, label: 'Schnee' }
  return { icon: CloudLightning, label: 'Gewitter' }
}

async function fetchWeather(): Promise<Weather> {
  const r = await fetch(URL)
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`)
  const d = await r.json()
  return {
    now: { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code, isDay: d.current.is_day === 1 },
    days: d.daily.time.map((day: string, i: number) => ({
      day,
      max: Math.round(d.daily.temperature_2m_max[i]),
      code: d.daily.weather_code[i],
    })),
    sunrise: d.daily.sunrise[0],
    sunset: d.daily.sunset[0],
  }
}

/** Wetter, stündlich neu geladen. null = noch nicht da oder gerade nicht erreichbar. */
export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    const load = () => fetchWeather().then(setWeather).catch(() => {})
    load()
    const t = setInterval(load, 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  return weather
}
