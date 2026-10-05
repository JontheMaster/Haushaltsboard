import { LogOut } from 'lucide-react'
import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { berlinDay, berlinStamp, berlinTime, useNow } from '../lib/time'
import { ClockWeather } from '../modules/clock-weather/ClockWeather'
import { useWeather, type Weather } from '../modules/clock-weather/weather'
import { MODULE_BY_ID } from '../modules/registry'
import type { TileSize } from '../modules/types'
import { useEnabledModules, useLayout } from '../modules/useModules'

// Kachelbreite im 12er-Raster an der Wand (DESIGN.md: s, m, l = 3, 4, 6 Spalten)
const SPAN: Record<TileSize, string> = {
  s: 'lg:col-span-3',
  m: 'lg:col-span-4',
  l: 'lg:col-span-6',
}

export function Board() {
  const { me } = useMembers()
  const weather = useWeather()
  const enabled = useEnabledModules()
  const layout = useLayout()

  useEveningTheme(weather)
  useNightlyReload()

  const tiles = layout.filter((t) => enabled?.has(t.module))

  return (
    <div className="flex h-dvh flex-col bg-surface p-4 lg:p-6">
      <header className="mb-5 flex items-start justify-between gap-4 lg:mb-7">
        {enabled?.has('uhr-wetter') !== false && <ClockWeather weather={weather} />}
        {!me.is_board && (
          <button type="button" className="hb-icon-btn" aria-label="Abmelden" onClick={() => supabase.auth.signOut()}>
            <Icon icon={LogOut} size={20} />
          </button>
        )}
      </header>

      <main className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {tiles.map((t, i) => {
          const mod = MODULE_BY_ID.get(t.module)!
          return (
            <div key={t.module} className={`flex min-h-0 flex-col *:flex-1 ${SPAN[t.size]}`}>
              <mod.Tile size={t.size} delay={i * 40} />
            </div>
          )
        })}
      </main>
    </div>
  )
}

/** Abend-Theme zwischen Sonnenuntergang und Sonnenaufgang (Open-Meteo liefert beides) */
function useEveningTheme(weather: Weather | null) {
  const now = useNow(60_000)
  useEffect(() => {
    if (!weather) return
    const stamp = berlinStamp(now)
    const evening = stamp >= weather.sunset || stamp < weather.sunrise
    document.documentElement.dataset.theme = evening ? 'dark' : 'light'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim())
  }, [weather, now])
}

/** Einmal pro Nacht um 3 Uhr komplett neu laden: hält Speicher und Verbindungen frisch */
function useNightlyReload() {
  const now = useNow(60_000)
  useEffect(() => {
    const key = 'hb-reloaded'
    const today = berlinDay(now)
    if (berlinTime(now).hh !== '03') return
    try {
      if (localStorage.getItem(key) === today) return
      localStorage.setItem(key, today)
    } catch {
      // ohne Speicher lieber gar nicht neu laden als in einer Schleife
      return
    }
    window.location.reload()
  }, [now])
}
