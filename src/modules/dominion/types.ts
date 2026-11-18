// Dominion-Modul (docs/dominion-modul.md): Datentypen der Karten (data/cards.json, erzeugt von scripts/dominion/build-cards.mjs)

export type Tag =
  | 'village'
  | 'draw'
  | 'terminal_draw'
  | 'cantrip'
  | 'plus_buy'
  | 'trash'
  | 'gain'
  | 'attack'
  | 'defense'
  | 'payload'
  | 'alt_vp'
  | 'cost_reduce'

export type CardKind = 'kingdom' | 'event' | 'landmark' | 'project' | 'way' | 'ally' | 'trait' | 'prophecy'

export type Card = {
  id: string
  name_de: string | null
  name_en: string
  set: string
  boxes: string[]
  editions: number[]
  cost: { coins: number; potion: number; debt: number }
  kind: CardKind
  types: string[]
  tags: Tag[]
  requires: string[]
  complexity: 1 | 2 | 3
}

export type SetBox = { id: string; name_de: string | null; edition: number; update_pack: boolean; cards: number }
export type DomSet = { id: string; name_de: string | null; boxes: SetBox[] }

export type Mix = 'querbeet' | 'mix' | 'fokus'
export type Difficulty = 'locker' | 'normal' | 'alles'
export type Attacks = 'egal' | 'wenige' | 'keine'
export type LandscapeCount = 'auto' | 0 | 1 | 2

export type GenOptions = {
  /** Erweiterungen (set-IDs) für diese Partie; leer/undefiniert = alle besessenen */
  sets?: string[]
  mix: Mix
  /** nur bei Fokus: Schwerpunkt; leer = auslosen */
  focus?: string | null
  landscapes: LandscapeCount
  difficulty: Difficulty
  attacks: Attacks
  /** behaltene Karten (Schloss), bleiben auf jeden Fall drin */
  locked?: string[]
  /** diese Karten nicht ziehen (z. B. die gerade getauschte) */
  exclude?: string[]
  /** behaltene Landschaften */
  lockedLandscapes?: string[]
}

export type Owned = {
  /** Schachteln, z. B. baseset2, seaside, prosperity */
  boxes: string[]
  /** einzelne Promo-Karten (Karten-IDs) */
  promos: string[]
  banned: string[]
  favorites: string[]
}

/** frühere Sets, neuestes zuerst */
export type HistoryEntry = { kingdom: string[]; played: boolean }

export type Extra = { id: string; label: string }

export type Kingdom = {
  seed: number
  /** 10 Königreichkarten (IDs), nach Kosten sortiert */
  kingdom: string[]
  landscapes: string[]
  /** Bann-Stapel der Jungen Hexe */
  bane: string | null
  extras: Extra[]
  /** „Warum es passt“, z. B. „Dorf: Fischerdorf“ */
  reasons: string[]
  /** Erweiterungen, aus denen das Set stammt */
  sets: string[]
}
