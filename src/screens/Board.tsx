import { Image, LogOut } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Toast } from '../components/Toast'
import { CookMode } from '../modules/meals/CookMode'
import { Celebration } from '../components/Celebration'
import { MorningBriefing, useBriefingSlot } from '../modules/briefing/MorningBriefing'
import { WeekRecap } from '../modules/recap/WeekRecap'
import { WifiButton } from '../modules/wlan/Wifi'
import { CoinButton } from '../modules/coin/CoinFlip'
import { useCook } from '../modules/meals/cookStore'
import { MealPlanner } from '../modules/meals/MealPlanner'
import { Icon } from '../components/Icon'
import { HeaderSlot } from '../components/HeaderSlot'
import { VisitToggle } from '../components/VisitToggle'
import { useMedia } from '../lib/device'
import { useIdle, useIsNight } from '../lib/idle'
import { useSettings } from '../lib/settings'
import { useNow } from '../lib/time'
import { NightScreen, Screensaver, SCREENSAVER_DEFAULTS } from '../modules/photos/Screensaver'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { ClockWeather } from '../modules/clock-weather/ClockWeather'
import type { Weather } from '../modules/clock-weather/weather'
import { MODULE_BY_ID, MODULES, PHONE_TILE_BY_KEY } from '../modules/registry'
import { TileStack, type StackCard } from '../components/TileStack'
import type { TileSize } from '../modules/types'
import { useEnabledModules, useLayout, useModuleConfig } from '../modules/useModules'
import { WeekView } from '../modules/week/WeekView'
import { DeparturesBoard } from '../modules/transit/DeparturesBoard'

type View = 'heute' | 'woche' | 'abfahrten' | 'essen'
// Nach so langer Zeit ohne Berührung springen Woche und Abfahrten zurück auf Heute
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
  // „modul.kachel“ (z. B. uhr-wetter.kurve) gehört zum Modul davor
  const isOn = (key: string) => enabled?.has(key.split('.')[0]) ?? false
  const tiles = layout.filter((t) => isOn(t.module))
  // Hooks in fester Reihenfolge (MODULES ändert sich zur Laufzeit nicht)
  const showNow = MODULES.map((m) => (m.useShow ? m.useShow() : false))
  const stacked = MODULES.filter((m, i) => m.stackOn && showNow[i] && enabled?.has(m.id))
  const narrow = useMedia('(max-width: 1023px)')
  const [view, setView] = useState<View>('heute')

  // Nachtmodus (nur am Wand-Tablet) hat Vorrang; Antippen weckt für 2 Minuten
  const { settings } = useSettings()
  const now = useNow(30_000)
  // Beim Kochen bleiben Nachtmodus und Bildschirmschoner aus
  const cooking = useCook().session !== null
  // Morgen-Briefing (nur am Wand-Tablet, zu den Uhrzeiten aus den Einstellungen) geht vor Nachtmodus und Bildschirmschoner.
  // ?morgen in der Adresse zeigt es zum Ausprobieren sofort.
  const briefingSlot = useBriefingSlot(me.is_board && (enabled?.has('morgen') ?? false) && !cooking)
  const [briefingPreview, setBriefingPreview] = useState(() => new URLSearchParams(location.search).has('morgen'))
  const briefing = briefingPreview || !!briefingSlot
  const night = useIsNight(settings) && me.is_board && enabled?.has('nachtmodus') !== false && !cooking && !briefing
  const [wakeUntil, setWakeUntil] = useState(0)
  const nightActive = night && now.getTime() > wakeUntil

  // Bildschirmschoner: am Wand-Tablet von selbst nach x Minuten ohne Berührung, überall per Knopf
  const saverConfig = useModuleConfig('bildschirmschoner', SCREENSAVER_DEFAULTS)
  const saverEnabled = enabled?.has('bildschirmschoner') ?? false
  const [idle, resetIdle] = useIdle(saverConfig.idle_minutes * 60_000, me.is_board && saverEnabled && !nightActive && !cooking && !briefing)
  const [manualSaver, setManualSaver] = useState(false)
  const saverOn = !nightActive && (manualSaver || idle)
  // Nach dem Schließen (Bildschirmschoner, Nachtmodus) fängt kurz eine unsichtbare Fläche alle Berührungen ab,
  // damit ein nachlaufender Tipp kein Todo abhakt
  const [shield, setShield] = useState(false)
  useEffect(() => {
    if (!shield) return
    const t = setTimeout(() => setShield(false), 600)
    return () => clearTimeout(t)
  }, [shield])
  const closeSaver = () => {
    setManualSaver(false)
    resetIdle()
    setView('heute')
    setShield(true)
  }

  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const showToast = useCallback((message: string) => setToast({ id: Date.now(), message }), [])
  const hideToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (view === 'heute' || cooking) return
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
  }, [view, cooking])

  return (
    <div className="flex h-dvh flex-col bg-surface p-6">
      <header className="mb-7 flex flex-wrap items-stretch justify-between gap-4">
        {/* links Uhr und Knöpfe untereinander, rechts der feste Platz für Musik und Wege (nur bei Bedarf) */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="shrink-0">{enabled?.has('uhr-wetter') !== false && <ClockWeather weather={weather} />}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex gap-2" role="group" aria-label="Ansicht">
              <button
                type="button"
                className={`hb-choice ${view === 'heute' ? 'is-on' : ''}`}
                aria-pressed={view === 'heute'}
                onClick={() => setView('heute')}
              >
                Heute
              </button>
              <button
                type="button"
                className={`hb-choice ${view === 'woche' ? 'is-on' : ''}`}
                aria-pressed={view === 'woche'}
                onClick={() => setView('woche')}
              >
                Woche
              </button>
              {enabled?.has('essensplan') && (
                <button
                  type="button"
                  className={`hb-choice ${view === 'essen' ? 'is-on' : ''}`}
                  aria-pressed={view === 'essen'}
                  onClick={() => setView('essen')}
                >
                  Essen
                </button>
              )}
              {enabled?.has('abfahrten') && (
                <button
                  type="button"
                  className={`hb-choice ${view === 'abfahrten' ? 'is-on' : ''}`}
                  aria-pressed={view === 'abfahrten'}
                  onClick={() => setView('abfahrten')}
                >
                  Abfahrten
                </button>
              )}
            </div>
            <VisitToggle />
            <WifiButton variant="wall" />
            <button
              type="button"
              className="hb-choice"
              aria-label="Bildschirmschoner starten"
              title="Bildschirmschoner"
              onClick={() => setManualSaver(true)}
            >
              <Icon icon={Image} size={20} />
            </button>
            <CoinButton variant="wall" />
            {!me.is_board && (
              <button type="button" className="hb-icon-btn" aria-label="Abmelden" onClick={() => supabase.auth.signOut()}>
                <Icon icon={LogOut} size={20} />
              </button>
            )}
          </div>
        </div>
        <HeaderSlot>
          {MODULES.filter((m) => m.Header && enabled?.has(m.id)).map((m) => {
            const Header = m.Header!
            return <Header key={m.id} variant="wall" />
          })}
        </HeaderSlot>
      </header>

      {view === 'woche' ? (
        <main className="flex min-h-0 flex-1 flex-col *:flex-1">
          <WeekView variant="wall" />
        </main>
      ) : view === 'essen' ? (
        <main className="flex min-h-0 flex-1 flex-col">
          <MealPlanner showToast={showToast} />
        </main>
      ) : view === 'abfahrten' ? (
        <main className="min-h-0 flex-1 overflow-y-auto hb-scroll-quiet">
          <DeparturesBoard />
        </main>
      ) : (
        <main className={`grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] gap-5 ${narrow ? 'grid-cols-2' : 'grid-cols-12'}`}>
          {tiles.map((t, i) => {
            const span = (narrow ? SPAN_NARROW : SPAN)[t.size]
            // Stapel: Hauptkachel + weitere aus dem Layout + zeitweise Kacheln (Abfahrten), die darauf liegen
            const keys = [t.module, ...(t.stack ?? []).filter(isOn)]
            const timed = stacked.filter((m) => m.stackOn && keys.includes(m.stackOn))
            if (keys.length > 1) {
              const cards: StackCard[] = [
                ...keys.flatMap((k) => {
                  const card = cardOf(k)
                  return card ? [card] : []
                }),
                ...timed.flatMap((m) => (m.Tile ? [{ id: m.id, title: m.title, icon: m.icon, Tile: m.Tile, front: true }] : [])),
              ]
              if (!cards.length) return null
              return (
                <div key={t.module} className={`flex min-h-0 flex-col *:min-h-0 *:flex-1 ${span}`}>
                  <TileStack cards={cards} size={t.size} delay={i * 40} />
                </div>
              )
            }
            const card = cardOf(t.module)
            if (!card) return null
            // ohne Stapel: zeitweise Kacheln (z. B. Abfahrten morgens) stehen über dieser in derselben Spalte
            return (
              <div key={t.module} className={`flex min-h-0 flex-col gap-5 *:min-h-0 *:flex-1 ${span}`}>
                {timed.map((m) => m.Tile && <m.Tile key={m.id} size="s" delay={i * 40} />)}
                <card.Tile size={t.size} delay={i * 40} />
              </div>
            )
          })}
        </main>
      )}
      <CookMode />
      <Celebration />
      {briefing && (
        <MorningBriefing
          weather={weather}
          onClose={() => {
            setBriefingPreview(false)
            briefingSlot?.dismiss()
            resetIdle()
            setShield(true)
          }}
        />
      )}
      <WeekRecap />
      {toast && <Toast key={toast.id} message={toast.message} onDone={hideToast} />}
      {saverOn && <Screensaver onClose={closeSaver} />}
      {nightActive && (
        <NightScreen
          onWake={() => {
            setWakeUntil(Date.now() + 2 * 60_000)
            setShield(true)
          }}
        />
      )}
      {shield && <div className="fixed inset-0 z-[100]" aria-hidden="true" />}
    </div>
  )
}

/** Kachel zu einem Layout-Schlüssel: Hauptkachel eines Moduls oder Zusatzkachel „modul.kachel“ */
function cardOf(key: string): StackCard | null {
  const mod = MODULE_BY_ID.get(key)
  if (mod?.Tile) return { id: key, title: mod.title, icon: mod.icon, Tile: mod.Tile }
  const extra = PHONE_TILE_BY_KEY.get(key)
  return extra ? { id: key, title: extra.title, icon: extra.icon, Tile: extra.Tile } : null
}
