import { Clock, ListChecks, ShoppingCart } from 'lucide-react'
import { ClockWeatherTile } from './clock-weather/ClockWeatherTile'
import { ShoppingTile } from './shopping/ShoppingTile'
import { TodosTile } from './todos/TodosTile'
import type { LayoutTile, ModuleDef } from './types'

// Alle Module. Ein neues Modul = ein neuer Eintrag hier, sonst nichts.
export const MODULES: ModuleDef[] = [
  { id: 'uhr-wetter', title: 'Uhr und Wetter', icon: Clock, phase: 1, sizes: ['s', 'm'], Tile: ClockWeatherTile },
  { id: 'todos', title: 'Todos', icon: ListChecks, phase: 1, sizes: ['m', 'l'], Tile: TodosTile },
  { id: 'einkauf', title: 'Einkauf', icon: ShoppingCart, phase: 1, sizes: ['s', 'm', 'l'], Tile: ShoppingTile },
]

export const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]))

// Standard-Layout an der Wand (Phase 1 fest, Bearbeiten-Modus kommt in Phase 2).
// Uhr und Wetter steht an der Wand immer als Kopfzeile, nicht im Raster.
export const DEFAULT_WALL_LAYOUT: LayoutTile[] = [
  { module: 'todos', size: 'l' },
  { module: 'einkauf', size: 'l' },
]
