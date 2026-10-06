import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { VisitToggle } from '../components/VisitToggle'
import { useMedia } from '../lib/device'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { ClockWeather } from '../modules/clock-weather/ClockWeather'
import type { Weather } from '../modules/clock-weather/weather'
import { MODULE_BY_ID } from '../modules/registry'
import type { TileSize } from '../modules/types'
import { useEnabledModules, useLayout } from '../modules/useModules'
import { WeekView } from '../modules/week/WeekView'

type View = 'heute' | 'woche'
// Nach so langer Zeit ohne Berührung springt die Woche zurück auf Heute
const IDLE_MS = 2 * 60 * 1000

// Kachelbreite im 12er-Raster an der Wand (DESIGN.md: s, m, l = 3, 4, 6 Spalten)
const SPAN: Record<TileSize, string> = {
  s: 'col-span-3',
  m: 'col-span-4',
  l: 'col-span-6',
}
// Hochkant oder schmales Tablet: 2 Spalten, große Kacheln über die ganze Breite
const SPAN_NARROW: Record<TileSize, string> = {
  s: 'col-span-1',
  m: 'col-span-1',
  l: 'col-span-2',
}

/** Wand-Ansicht (Querformat, ab 700 px Breite) */
export function Board({ weather }: { weather: Weather | null }) {
  const { me } = useMembers()
  const enabled = useEnabledModules()
  const layout = useLayout('wall')
  const tiles = layout.filter((t) => enabled?.has(t.module))
  const narrow = useMedia('(max-width: 1023px)')
  const [view, setView] = useState<View>('heute')

  useEffect(() => {
    if (view !== 'woche') return
    let t = setTimeout(() => setView('heute'), IDLE_MS)
    const touch = () => {
      clearTimeout(t)
      t = setTimeout(() => setView('heute'), IDLE_MS)
    }
    window.addEventListener('pointerdown', touch)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', touch)
    }
  }, [view])

  return (
    <div className="flex h-dvh flex-col bg-surface p-6">
      <header className="mb-7 flex items-start justify-between gap-4">
        {/* Uhr behält ihre Breite; rechts darf bei wenig Platz umbrechen */}
        <div className="shrink-0">{enabled?.has('uhr-wetter') !== false && <ClockWeather weather={weather} />}</div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <div className="flex gap-2" role="group" aria-label="Ansicht">
            <button type="button" className={`hb-choice ${view === 'heute' ? 'is-on' : ''}`} aria-pressed={view === 'heute'} onClick={() => setView('heute')}>
              Heute
            </button>
            <button type="button" className={`hb-choice ${view === 'woche' ? 'is-on' : ''}`} aria-pressed={view === 'woche'} onClick={() => setView('woche')}>
              Woche
            </button>
          </div>
          <VisitToggle />
          {!me.is_board && (
            <button type="button" className="hb-icon-btn" aria-label="Abmelden" onClick={() => supabase.auth.signOut()}>
              <Icon icon={LogOut} size={20} />
            </button>
          )}
        </div>
      </header>

      {view === 'woche' ? (
        <main className="flex min-h-0 flex-1 flex-col *:flex-1">
          <WeekView variant="wall" />
        </main>
      ) : (
        <main className={`grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] gap-5 ${narrow ? 'grid-cols-2' : 'grid-cols-12'}`}>
          {tiles.map((t, i) => {
            const mod = MODULE_BY_ID.get(t.module)!
            return (
              <div key={t.module} className={`flex min-h-0 flex-col *:flex-1 ${(narrow ? SPAN_NARROW : SPAN)[t.size]}`}>
                <mod.Tile size={t.size} delay={i * 40} />
              </div>
            )
          })}
        </main>
      )}
    </div>
  )
}
