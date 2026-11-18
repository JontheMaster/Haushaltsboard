// Anzeige-Hilfen für Dominion-Karten: Typ-Wörter, Rahmenfarben (Tokens dom-*), Kurznamen der Erweiterungen
import type { CSSProperties } from 'react'
import setsJson from './data/sets.json'
import type { Card, DomSet } from './types'

export const SETS = setsJson.sets as DomSet[]
export const SET_BY_ID = new Map(SETS.map((s) => [s.id, s]))

/** kurze Namen fürs Abzeichen an der Karte */
const SHORT: Record<string, string> = {
  baseset: 'Basis',
  alchemy: 'Alchemisten',
  guildscornucopia: 'Gilden/Ernte',
  intrigue: 'Intrige',
  promos: 'Promo',
}
export const setShort = (id: string) => SHORT[id] ?? SET_BY_ID.get(id)?.name_de ?? id
export const setName = (id: string) => (id === 'baseset' ? 'Basisspiel' : (SET_BY_ID.get(id)?.name_de ?? id))

const TYPE_DE: Record<string, string> = {
  action: 'Aktion',
  attack: 'Angriff',
  treasure: 'Geld',
  victory: 'Punkte',
  reaction: 'Reaktion',
  duration: 'Dauer',
  reserve: 'Reserve',
  traveller: 'Reisender',
  night: 'Nacht',
  doom: 'Unheil',
  fate: 'Schicksal',
  liaison: 'Verbindung',
  command: 'Befehl',
  omen: 'Omen',
  shadow: 'Schatten',
  gathering: 'Sammlung',
  event: 'Ereignis',
  landmark: 'Landmarke',
  project: 'Projekt',
  way: 'Weg',
  ally: 'Verbündete',
  trait: 'Eigenschaft',
  prophecy: 'Prophezeiung',
}
export const typeWords = (c: Card) => c.types.map((t) => TYPE_DE[t] ?? t).join(' · ')

/** Rahmenfarbe wie im Spiel: Nicht-Aktionstypen haben Vorrang (Aktion–Dauer ist orange), höchstens zwei Farben */
const COLOR_ORDER = ['night', 'duration', 'reserve', 'reaction', 'treasure', 'victory', 'event', 'landmark', 'project', 'way', 'ally', 'trait', 'prophecy']
const COLOR_TOKEN: Record<string, string> = {
  night: 'dom-night',
  duration: 'dom-duration',
  reserve: 'dom-reserve',
  reaction: 'dom-reaction',
  treasure: 'dom-treasure',
  victory: 'dom-victory',
  event: 'dom-action',
  landmark: 'dom-landmark',
  project: 'dom-project',
  way: 'dom-way',
  ally: 'dom-ally',
  trait: 'dom-trait',
  prophecy: 'dom-prophecy',
}
export function frameColors(c: Card): string[] {
  const colored = COLOR_ORDER.filter((t) => c.types.includes(t)).map((t) => `var(--${COLOR_TOKEN[t]})`)
  return colored.length ? colored.slice(0, 2) : ['var(--dom-action)']
}

export const KIND_DE: Record<string, string> = TYPE_DE

/** Rahmenfarbe als CSS-Variable (--dom-frame), zwei Typen = zwei Hälften */
export const frameStyle = (card: Card) => {
  const colors = frameColors(card)
  return { '--dom-frame': colors.length > 1 ? `linear-gradient(90deg, ${colors[0]} 50%, ${colors[1]} 50%)` : colors[0] } as CSSProperties
}

/** „Heute“, „Gestern“, sonst „Mi., 18. November“ (Tag im Format JJJJ-MM-TT) */
export const dayLabel = (iso: string) => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  if (iso === today) return 'Heute'
  if (iso === yesterday) return 'Gestern'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })
}
