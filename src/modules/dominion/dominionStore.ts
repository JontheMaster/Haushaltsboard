import { useEffect, useSyncExternalStore } from 'react'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { setModuleConfig, useModuleConfig } from '../useModules'
import type { GenOptions, Kingdom, Owned } from './types'

// Dominion (docs/dominion-modul.md): Einstellungen in modules.config von „dominion“, Sets in dominion_games.
// Das gerade erstellte (noch nicht gespielte) Set liegt pro Gerät in localStorage, gespeichert wird erst bei „Das spielen wir“.

export const MODULE_ID = 'dominion'

export type DominionConfig = {
  owned: { boxes: string[]; promos: string[] }
  banned: string[]
  favorites: string[]
  last?: Partial<GenOptions>
}

const DEFAULTS: DominionConfig = { owned: { boxes: [], promos: [] }, banned: [], favorites: [] }

export function useDominionConfig(): DominionConfig {
  return useModuleConfig<DominionConfig>(MODULE_ID, DEFAULTS)
}

export const toOwned = (c: DominionConfig): Owned => ({ boxes: c.owned.boxes, promos: c.owned.promos, banned: c.banned, favorites: c.favorites })

export const saveDominionConfig = (patch: Partial<DominionConfig>) => setModuleConfig(MODULE_ID, patch)

export const DEFAULT_OPTIONS: GenOptions = { mix: 'mix', landscapes: 'auto', difficulty: 'normal', attacks: 'egal' }

// ── gespielte Sets (geteilt, live) ──────────────────────────────────────────────────────────────
export type DominionGame = Tables<'dominion_games'>

type State = { games: DominionGame[]; loaded: boolean }
let state: State = { games: [], loaded: false }
const listeners = new Set<() => void>()
let started = false

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function load() {
  supabase
    .from('dominion_games')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
    .then(({ data }) => set({ games: (data ?? []) as DominionGame[], loaded: true }))
}

function start() {
  if (started) return
  started = true
  load()
  supabase.channel('dominion-games').on('postgres_changes', { event: '*', schema: 'public', table: 'dominion_games' }, load).subscribe()
}

export function useDominionGames(): State {
  useEffect(start, [])
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

/** „Das spielen wir“: Set als gespielt speichern */
export async function savePlayed(k: Kingdom, options: GenOptions): Promise<boolean> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const { data, error } = await supabase
    .from('dominion_games')
    .insert({
      seed: k.seed,
      options: { ...options, locked: undefined, exclude: undefined, lockedLandscapes: undefined } as never,
      kingdom: k.kingdom,
      landscapes: k.landscapes,
      extras: k.extras.map((e) => e.id),
      bane: k.bane,
      played: true,
      played_on: today,
    })
    .select('*')
    .single()
  if (error || !data) return false
  set({ ...state, games: [data as DominionGame, ...state.games.filter((g) => g.id !== data.id)] })
  return true
}

// ── Set auf diesem Gerät ────────────────────────────────────────────────────────────────────────
const CURRENT_KEY = 'hb-dominion-current'

export type Current = { kingdom: Kingdom; options: GenOptions; locked: string[]; at: string }

export function loadCurrent(): Current | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    return raw ? (JSON.parse(raw) as Current) : null
  } catch {
    return null
  }
}

export function saveCurrent(c: Current | null) {
  try {
    if (c) localStorage.setItem(CURRENT_KEY, JSON.stringify(c))
    else localStorage.removeItem(CURRENT_KEY)
  } catch {
    // nur Komfort
  }
}

// Seite öffnen (aus der Kachel oder Alle Funktionen): ein gemeinsamer Schalter pro Gerät
let openState = false
const openListeners = new Set<() => void>()
export function setDominionOpen(open: boolean) {
  openState = open
  openListeners.forEach((l) => l())
}
export function useDominionOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      openListeners.add(cb)
      return () => openListeners.delete(cb)
    },
    () => openState,
  )
}
