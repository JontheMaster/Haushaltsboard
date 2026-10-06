import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export type TileSize = 's' | 'm' | 'l'

export type TileProps = { size: TileSize; delay: number }

/**
 * Ein Modul bringt alles selbst mit. Neue Module werden nur in registry.ts eingetragen,
 * an bestehenden muss sich nichts ändern.
 */
export type ModuleDef = {
  id: string
  title: string
  icon: LucideIcon
  phase: number
  sizes: TileSize[]
  /** Kachel für die Startseite */
  Tile: ComponentType<TileProps>
  /** Erscheint in der Kopfzeile (Wand) bzw. oben auf der Startseite (Handy), z. B. „Läuft gerade“ */
  Header?: ComponentType<{ variant: 'wall' | 'phone' }>
  /** Detailseite (Phase 2: „Alle Funktionen“) */
  Detail?: ComponentType
  /** Einstellungen (Phase 2) */
  Settings?: ComponentType
}

/** Eine Kachel im Layout (Tabelle layouts, Feld tiles) */
export type LayoutTile = { module: string; size: TileSize }
