import { CalendarDays, Clock, ListChecks, Music, ShoppingCart } from 'lucide-react'
import { CalendarTile } from './calendar/CalendarTile'
import { ClockWeatherTile } from './clock-weather/ClockWeatherTile'
import { ShoppingTile } from './shopping/ShoppingTile'
import { NowPlayingHeader, NowPlayingTile } from './spotify/NowPlaying'
import { TodosTile } from './todos/TodosTile'
import type { LayoutTile, ModuleDef } from './types'

// Alle Module. Ein neues Modul = ein neuer Eintrag hier, sonst nichts.
export const MODULES: ModuleDef[] = [
  { id: 'uhr-wetter', title: 'Uhr und Wetter', icon: Clock, phase: 1, sizes: ['s', 'm'], Tile: ClockWeatherTile },
  { id: 'todos', title: 'Todos', icon: ListChecks, phase: 1, sizes: ['s', 'm', 'l'], Tile: TodosTile },
  { id: 'einkauf', title: 'Einkauf', icon: ShoppingCart, phase: 1, sizes: ['s', 'm', 'l'], Tile: ShoppingTile },
  { id: 'kalender', title: 'Kalender', icon: CalendarDays, phase: 2, sizes: ['s', 'm', 'l'], Tile: CalendarTile },
  // Spotify: nur sichtbar, solange etwas läuft (Kopfzeile statt fester Kachel)
  { id: 'spotify', title: 'Läuft gerade', icon: Music, phase: 5, sizes: ['m'], Tile: NowPlayingTile, Header: NowPlayingHeader },
]

export const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]))

// Standard-Layout an der Wand (Phase 1 fest, Bearbeiten-Modus kommt in Phase 2).
// Uhr und Wetter steht an der Wand immer als Kopfzeile, nicht im Raster.
// Termine am größten (links), daneben Todos und Einkauf gleich breit (Entscheidung Jonathan 5.10.2026)
export const DEFAULT_WALL_LAYOUT: LayoutTile[] = [
  { module: 'kalender', size: 'l' },
  { module: 'todos', size: 's' },
  { module: 'einkauf', size: 's' },
]

// Standard am Handy (pro Person änderbar ab Phase 2). Kacheln stehen untereinander.
export const DEFAULT_PHONE_LAYOUT: LayoutTile[] = [
  { module: 'kalender', size: 'm' },
  { module: 'todos', size: 'm' },
  { module: 'einkauf', size: 'm' },
]
