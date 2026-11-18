import { describe, expect, it } from 'vitest'
import setsJson from './data/sets.json'
import {
  ALCHEMY_MAX,
  ALCHEMY_MIN,
  ALL_CARDS,
  CARD_BY_ID,
  generateKingdom,
  hardViolation,
  isOwned,
  KINGDOM_SIZE,
  rng,
  swapCard,
} from './generator'
import type { Attacks, Card, Difficulty, GenOptions, LandscapeCount, Mix, Owned } from './types'

const SETS = setsJson.sets
const ALL_BOXES = SETS.flatMap((s) => s.boxes.map((b) => b.id))
const ALL_PROMOS = ALL_CARDS.filter((c) => c.set === 'promos').map((c) => c.id)
const owned = (boxes: string[], promos: string[] = [], extra: Partial<Owned> = {}): Owned => ({ boxes, promos, banned: [], favorites: [], ...extra })

const JONATHAN = owned(['baseset2', 'seaside', 'prosperity', 'alchemy', 'darkages'])
const BASE_ONLY = owned(['baseset2'])
const EVERYTHING = owned(ALL_BOXES, ALL_PROMOS)

const MIXES: Mix[] = ['querbeet', 'mix', 'fokus']
const DIFFS: Difficulty[] = ['locker', 'normal', 'alles']
const ATTACKS: Attacks[] = ['egal', 'wenige', 'keine']
const LANDS: LandscapeCount[] = ['auto', 0, 1, 2]

/** zufälliger Besitz: einige Schachteln (mindestens eine Basis-Schachtel) und ein paar Promos */
function randomOwned(r: () => number): Owned {
  const boxes = ALL_BOXES.filter(() => r() < 0.35)
  boxes.push(r() < 0.5 ? 'baseset' : 'baseset2')
  return owned([...new Set(boxes)], ALL_PROMOS.filter(() => r() < 0.2))
}

function randomOptions(r: () => number): GenOptions {
  const pick = <T,>(l: T[]) => l[Math.floor(r() * l.length)]
  return { mix: pick(MIXES), difficulty: pick(DIFFS), attacks: pick(ATTACKS), landscapes: pick(LANDS) }
}

const card = (id: string) => CARD_BY_ID.get(id) as Card

function checkInvariants(k: ReturnType<typeof generateKingdom>, o: GenOptions, own: Owned) {
  expect(k.kingdom).toHaveLength(KINGDOM_SIZE)
  expect(new Set(k.kingdom).size).toBe(KINGDOM_SIZE)
  expect(new Set(k.landscapes).size).toBe(k.landscapes.length)
  const cards = k.kingdom.map(card)
  for (const c of cards) {
    expect(c.kind).toBe('kingdom')
    expect(isOwned(c, own)).toBe(true)
  }
  for (const id of k.landscapes) expect(isOwned(card(id), own)).toBe(true)
  // harte Regeln
  expect(hardViolation(cards, o)).toBeNull()
  // Abhängigkeiten
  const all = [...cards, ...k.landscapes.map(card)]
  if (all.some((c) => c.requires.includes('potion'))) expect(k.extras.map((e) => e.id)).toContain('potion')
  const alchemy = cards.filter((c) => c.set === 'alchemy').length
  const alchemyOwned = ALL_CARDS.filter((c) => c.set === 'alchemy' && isOwned(c, own)).length
  if (alchemyOwned >= ALCHEMY_MIN && o.difficulty !== 'locker') expect(alchemy === 0 || (alchemy >= ALCHEMY_MIN && alchemy <= ALCHEMY_MAX)).toBe(true)
  if (cards.some((c) => c.requires.includes('bane'))) {
    expect(k.bane).not.toBeNull()
    expect(k.kingdom).not.toContain(k.bane)
    expect(card(k.bane!).cost.coins).toBeGreaterThanOrEqual(2)
    expect(card(k.bane!).cost.coins).toBeLessThanOrEqual(3)
  }
  const hasOwned = (kind: string) => ALL_CARDS.some((c) => c.kind === kind && isOwned(c, own))
  if (cards.some((c) => c.types.includes('liaison')) && hasOwned('ally')) expect(k.landscapes.filter((id) => card(id).kind === 'ally')).toHaveLength(1)
  if (cards.some((c) => c.types.includes('omen')) && hasOwned('prophecy')) expect(k.landscapes.filter((id) => card(id).kind === 'prophecy')).toHaveLength(1)
  if (o.attacks === 'keine') expect(cards.some((c) => c.tags.includes('attack'))).toBe(false)
  if (o.difficulty === 'locker') {
    expect(cards.every((c) => c.complexity === 1 && !c.cost.potion && !c.cost.debt)).toBe(true)
    expect(k.landscapes.filter((id) => !['ally', 'prophecy'].includes(card(id).kind)).length).toBeLessThanOrEqual(1)
  }
}

describe('generateKingdom', () => {
  it('1000 Sets mit zufälligem Besitz und Optionen halten alle Regeln ein', () => {
    const r = rng(42)
    for (let i = 0; i < 1000; i++) {
      const own = randomOwned(r)
      const o = randomOptions(r)
      const k = generateKingdom(o, own, [], i)
      checkInvariants(k, o, own)
    }
  })

  it('Jonathans Sammlung: alle Optionen, viele Seeds', () => {
    for (const mix of MIXES)
      for (const difficulty of DIFFS)
        for (const attacks of ATTACKS)
          for (let seed = 0; seed < 15; seed++) {
            const o: GenOptions = { mix, difficulty, attacks, landscapes: 'auto' }
            checkInvariants(generateKingdom(o, JONATHAN, [], seed), o, JONATHAN)
          }
  })

  it('funktioniert mit nur dem Basisspiel', () => {
    for (const difficulty of DIFFS)
      for (const attacks of ATTACKS)
        for (let seed = 0; seed < 30; seed++) {
          const o: GenOptions = { mix: 'mix', difficulty, attacks, landscapes: 'auto' }
          const k = generateKingdom(o, BASE_ONLY, [], seed)
          checkInvariants(k, o, BASE_ONLY)
          expect(k.landscapes).toEqual([])
        }
  })

  it('alles besessen, alle Optionen', () => {
    for (let seed = 0; seed < 200; seed++) {
      const o = randomOptions(rng(seed))
      checkInvariants(generateKingdom(o, EVERYTHING, [], seed), o, EVERYTHING)
    }
  })

  it('gleicher Seed ergibt das gleiche Set', () => {
    const o: GenOptions = { mix: 'mix', difficulty: 'normal', attacks: 'egal', landscapes: 'auto' }
    expect(generateKingdom(o, JONATHAN, [], 123)).toEqual(generateKingdom(o, JONATHAN, [], 123))
    expect(generateKingdom(o, JONATHAN, [], 123)).not.toEqual(generateKingdom(o, JONATHAN, [], 124))
  })

  it('2–3 Erweiterungen bleibt meist bei wenigen Erweiterungen', () => {
    let few = 0
    for (let seed = 0; seed < 100; seed++) {
      const k = generateKingdom({ mix: 'mix', difficulty: 'alles', attacks: 'egal', landscapes: 0 }, JONATHAN, [], seed)
      if (new Set(k.kingdom.map((id) => card(id).set)).size <= 3) few++
    }
    expect(few).toBeGreaterThan(80)
  })

  it('Fokus: 5–7 Karten aus der Schwerpunkt-Erweiterung', () => {
    for (let seed = 0; seed < 50; seed++) {
      const k = generateKingdom({ mix: 'fokus', focus: 'seaside', difficulty: 'alles', attacks: 'egal', landscapes: 0 }, JONATHAN, [], seed)
      const n = k.kingdom.filter((id) => card(id).set === 'seaside').length
      expect(n).toBeGreaterThanOrEqual(4) // Reparaturen dürfen eine Karte tauschen
      expect(n).toBeLessThanOrEqual(8)
    }
  })

  it('gesperrte Karten kommen nie, behaltene bleiben', () => {
    const banned = ['baseset_village', 'baseset_smithy']
    const own = { ...BASE_ONLY, banned }
    for (let seed = 0; seed < 100; seed++) {
      const k = generateKingdom({ mix: 'mix', difficulty: 'normal', attacks: 'egal', landscapes: 'auto', locked: ['baseset_witch', 'baseset_market'] }, own, [], seed)
      expect(k.kingdom).toContain('baseset_witch')
      expect(k.kingdom).toContain('baseset_market')
      for (const b of banned) expect(k.kingdom).not.toContain(b)
    }
  })

  it('Tauschen ersetzt genau eine Karte und bringt sie nicht wieder', () => {
    const o: GenOptions = { mix: 'mix', difficulty: 'normal', attacks: 'egal', landscapes: 'auto' }
    for (let seed = 0; seed < 100; seed++) {
      const k = generateKingdom(o, JONATHAN, [], seed)
      const out = k.kingdom[3]
      const next = swapCard(k, out, o, JONATHAN, [], seed + 1)
      expect(next.kingdom).not.toContain(out)
      const kept = k.kingdom.filter((id) => id !== out)
      for (const id of kept) expect(next.kingdom).toContain(id)
    }
  })

  it('zuletzt gespielte Karten kommen seltener', () => {
    const o: GenOptions = { mix: 'querbeet', difficulty: 'alles', attacks: 'egal', landscapes: 0 }
    const recent = generateKingdom(o, JONATHAN, [], 1).kingdom
    const history = [{ kingdom: recent, played: true }]
    let withHistory = 0
    let without = 0
    for (let seed = 100; seed < 400; seed++) {
      withHistory += generateKingdom(o, JONATHAN, history, seed).kingdom.filter((id) => recent.includes(id)).length
      without += generateKingdom(o, JONATHAN, [], seed).kingdom.filter((id) => recent.includes(id)).length
    }
    expect(withHistory).toBeLessThan(without * 0.6)
  })

  it('Blütezeit bringt manchmal Platin und Kolonie, Dark Ages Unterschlüpfe, Trank nur mit Alchemie', () => {
    let platinum = 0
    let shelters = 0
    for (let seed = 0; seed < 300; seed++) {
      const k = generateKingdom({ mix: 'querbeet', difficulty: 'alles', attacks: 'egal', landscapes: 0 }, JONATHAN, [], seed)
      const ids = k.extras.map((e) => e.id)
      if (ids.includes('platinum_colony')) {
        platinum++
        expect(k.kingdom.some((id) => card(id).set === 'prosperity')).toBe(true)
      }
      if (ids.includes('shelters')) {
        shelters++
        expect(k.kingdom.some((id) => card(id).set === 'darkages')).toBe(true)
      }
      expect(ids.includes('potion')).toBe(k.kingdom.some((id) => card(id).cost.potion > 0))
    }
    expect(platinum).toBeGreaterThan(20)
    expect(shelters).toBeGreaterThan(20)
  })
})
