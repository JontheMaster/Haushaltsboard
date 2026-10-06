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
  /** Ein Satz für „Alle Funktionen“ */
  description: string
  /** Kachelgrößen; leer = keine Kachel (z. B. Nachtmodus) */
  sizes: TileSize[]
  /** Kachel für die Startseite */
  Tile?: ComponentType<TileProps>
  /** Erscheint in der Kopfzeile (Wand) bzw. oben auf der Startseite (Handy), z. B. „Läuft gerade“ */
  Header?: ComponentType<{ variant: 'wall' | 'phone' }>
  /** Einstellungen als eigene Seite in „Alle Funktionen“ (bringt ihre Kopfzeile mit Zurück selbst mit) */
  Settings?: ComponentType<{ onBack: () => void }>
  /** false = kein An/Aus-Schalter (z. B. Alexa, läuft über die Alexa-App) */
  toggle?: boolean
  /**
   * Kachel, die nur zeitweise erscheint (z. B. Abfahrten morgens): steht dann über der Kachel `stackOn`
   * in deren Spalte, statt das Raster umzubauen. `useShow` sagt, ob sie gerade dran ist.
   */
  stackOn?: string
  useShow?: () => boolean
}

/** Eine Kachel im Layout (Tabelle layouts, Feld tiles) */
export type LayoutTile = { module: string; size: TileSize }
