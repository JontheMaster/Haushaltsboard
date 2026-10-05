import { LogOut } from 'lucide-react'
import { Icon } from '../components/Icon'
import { VisitToggle } from '../components/VisitToggle'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { ClockWeather } from '../modules/clock-weather/ClockWeather'
import type { Weather } from '../modules/clock-weather/weather'
import { MODULE_BY_ID } from '../modules/registry'
import type { TileSize } from '../modules/types'
import { useEnabledModules, useLayout } from '../modules/useModules'

// Kachelbreite im 12er-Raster an der Wand (DESIGN.md: s, m, l = 3, 4, 6 Spalten)
const SPAN: Record<TileSize, string> = {
  s: 'col-span-3',
  m: 'col-span-4',
  l: 'col-span-6',
}

/** Wand-Ansicht (Querformat, ab 700 px Breite) */
export function Board({ weather }: { weather: Weather | null }) {
  const { me } = useMembers()
  const enabled = useEnabledModules()
  const layout = useLayout('wall')
  const tiles = layout.filter((t) => enabled?.has(t.module))

  return (
    <div className="flex h-dvh flex-col bg-surface p-6">
      <header className="mb-7 flex items-start justify-between gap-4">
        {enabled?.has('uhr-wetter') !== false && <ClockWeather weather={weather} />}
        <div className="flex items-center gap-3">
          <VisitToggle />
          {!me.is_board && (
            <button type="button" className="hb-icon-btn" aria-label="Abmelden" onClick={() => supabase.auth.signOut()}>
              <Icon icon={LogOut} size={20} />
            </button>
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-12 gap-5">
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
