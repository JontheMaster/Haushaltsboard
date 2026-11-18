// Dominion-Set-Generator (docs/dominion-modul.md, Stufe 1). Reine Funktion mit eigenem Zufall per Seed:
// gleicher Seed + gleiche Eingaben = gleiches Set. Läuft im Browser, Tests in generator.test.ts.
import cardsJson from './data/cards.json'
import type { Card, Extra, GenOptions, HistoryEntry, Kingdom, Owned, Tag } from './types'

// ── Stellschrauben ──────────────────────────────────────────────────────────────────────────────
export const KINGDOM_SIZE = 10
/** hart: ab so vielen terminalen Ziehkarten braucht es ein Dorf */
export const TERMINAL_DRAW_NEEDS_VILLAGE = 2
/** hart: mindestens so viele Karten kosten höchstens CHEAP_MAX bzw. mindestens EXPENSIVE_MIN */
export const MIN_CHEAP = 2
export const CHEAP_MAX = 3
export const MIN_EXPENSIVE = 2
export const EXPENSIVE_MIN = 5
/** hart: höchstens so viele Karten mit gleichen Kosten */
export const MAX_SAME_COST = 4
/** hart: höchstens so viele Angriffe („wenige“: 1, „keine“: 0) */
export const MAX_ATTACKS = 3
/** höchstens so viele Karten mit Zusatzmaterial („Locker“: 1); Trank zählt nicht, der gehört zu Alchemie */
export const MAX_MATERIAL = 2
export const MAX_MATERIAL_EASY = 1
/** weich: Wahrscheinlichkeit, dass die Regel in diesem Set gilt */
export const P_VILLAGE = 0.8
export const P_PLUS_BUY = 0.8
export const P_TRASH = 0.75
/** weich: bei mindestens ATTACKS_FOR_DEFENSE Angriffen eine Abwehrkarte */
export const P_DEFENSE = 0.7
export const ATTACKS_FOR_DEFENSE = 2
/** Gewichte beim Ziehen */
export const W_RECENT = 0.25 // lag in einem der letzten RECENT_GAMES gespielten Sets
export const RECENT_GAMES = 3
export const W_NEVER_PLAYED = 1.5
export const W_FAVORITE = 1.3
/** Alchemie: wenn dabei, dann 3–5 Alchemie-Karten (Empfehlung der Anleitung) */
export const ALCHEMY_MIN = 3
export const ALCHEMY_MAX = 5
/** Fokus: so viele Karten aus der Schwerpunkt-Erweiterung */
export const FOCUS_MIN = 5
export const FOCUS_MAX = 7
/** Landschaften bei „automatisch“: Wahrscheinlichkeit für 0 / 1 / 2 (Rest) */
export const P_LANDSCAPES_0 = 0.25
export const P_LANDSCAPES_1 = 0.55
/** Landschaftsarten, die man frei auslost (Verbündete und Prophezeiungen kommen nur über ihre Karten) */
const FREE_LANDSCAPES = new Set(['event', 'landmark', 'project', 'way', 'trait'])
const REPAIR_ROUNDS = 300

export const ALL_CARDS = cardsJson as Card[]
export const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]))

/** Zusatzmaterial: Schlüssel aus `requires` → Anzeige „Zusätzlich brauchst du“ */
export const EXTRA_LABELS: Record<string, string> = {
  potion: 'Trank',
  platinum_colony: 'Platin und Kolonie',
  shelters: 'Unterschlüpfe statt Anwesen',
  ruins: 'Ruinen',
  spoils: 'Beute',
  madman: 'Verrückter',
  mercenary: 'Söldner',
  bane: 'Bann-Stapel',
  prizes: 'Preise',
  rewards: 'Belohnungen',
  vp_tokens: 'Siegpunktmarker',
  debt_tokens: 'Schuldenmarker',
  tavern_mat: 'Wirtshaustableau',
  island_mat: 'Insel-Tableau',
  native_village_mat: 'Eingeborenendorf-Tableau',
  pirate_ship_mat: 'Piratenschiff-Tableau',
  trade_route_mat: 'Handelsroute-Tableau',
  embargo_tokens: 'Embargo-Marker',
  hexes: 'Plagen',
  boons: 'Gaben',
  heirloom: 'Erbstücke',
  wish: 'Wünsche',
  imp: 'Teufelchen',
  ghost: 'Geister',
  wisp: 'Irrlichter',
  zombies: 'Zombies',
  bat: 'Fledermäuse',
  artifacts: 'Artefakte',
  horse: 'Pferde',
  exile_mat: 'Exil-Tableau',
  exile_map: 'Exil-Tableau',
  loot: 'Beute (Plünderer)',
  ally: 'Verbündete',
  prophecy: 'Prophezeiung und Sonnenmarker',
}

// ── Zufall ──────────────────────────────────────────────────────────────────────────────────────
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const newSeed = () => Math.floor(Math.random() * 1_000_000_000)

type Rand = () => number

function pickWeighted<T>(rand: Rand, items: T[], weight: (t: T) => number): T | null {
  const total = items.reduce((s, t) => s + weight(t), 0)
  if (!items.length || total <= 0) return null
  let r = rand() * total
  for (const t of items) {
    r -= weight(t)
    if (r <= 0) return t
  }
  return items[items.length - 1]
}

const shuffle = <T>(rand: Rand, list: T[]) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Hilfen ──────────────────────────────────────────────────────────────────────────────────────
/** Kosten zum Vergleichen: Trank zählt wie 2 Münzen, Schulden halb */
export const costValue = (c: Card) => c.cost.coins + (c.cost.potion ? 2 : 0) + Math.ceil(c.cost.debt / 2)
const has = (c: Card, t: Tag) => c.tags.includes(t)
const material = (c: Card) => c.requires.filter((r) => r !== 'potion').length > 0
export const cardName = (id: string) => {
  const c = CARD_BY_ID.get(id)
  return c ? (c.name_de ?? c.name_en) : id
}

export function isOwned(c: Card, owned: Owned) {
  if (c.set === 'promos') return owned.promos.includes(c.id)
  return c.boxes.some((b) => owned.boxes.includes(b))
}

/** Erweiterungen (set-IDs), von denen man etwas besitzt */
export function ownedSets(owned: Owned, cards = ALL_CARDS): string[] {
  return [...new Set(cards.filter((c) => c.kind === 'kingdom' && isOwned(c, owned)).map((c) => c.set))]
}

function allowedByDifficulty(c: Card, o: GenOptions) {
  if (o.difficulty === 'alles') return true
  if (o.difficulty === 'normal') return c.complexity <= 2
  return c.complexity === 1 && !c.cost.potion && !c.cost.debt && !c.types.includes('night')
}

const attackLimit = (o: GenOptions) => (o.attacks === 'keine' ? 0 : o.attacks === 'wenige' ? 1 : MAX_ATTACKS)
const materialLimit = (o: GenOptions) => (o.difficulty === 'locker' ? MAX_MATERIAL_EASY : MAX_MATERIAL)

/** Prüft die harten Regeln; gibt die erste verletzte zurück (oder null) */
export function hardViolation(cards: Card[], o: GenOptions): string | null {
  const costs = cards.map(costValue)
  if (cards.filter((c) => has(c, 'attack')).length > attackLimit(o)) return 'attacks'
  if (cards.filter((c) => has(c, 'terminal_draw')).length >= TERMINAL_DRAW_NEEDS_VILLAGE && !cards.some((c) => has(c, 'village'))) return 'village'
  if (costs.filter((v) => v <= CHEAP_MAX).length < MIN_CHEAP) return 'cheap'
  if (costs.filter((v) => v >= EXPENSIVE_MIN).length < MIN_EXPENSIVE) return 'expensive'
  const byCost = new Map<number, number>()
  for (const v of costs) byCost.set(v, (byCost.get(v) ?? 0) + 1)
  if ([...byCost.values()].some((n) => n > MAX_SAME_COST)) return 'same_cost'
  if (cards.filter(material).length > materialLimit(o)) return 'material'
  return null
}

// ── Generator ───────────────────────────────────────────────────────────────────────────────────
export function generateKingdom(options: GenOptions, owned: Owned, history: HistoryEntry[], seed: number, cards: Card[] = ALL_CARDS): Kingdom {
  const rand = rng(seed)
  const byId = cards === ALL_CARDS ? CARD_BY_ID : new Map(cards.map((c) => [c.id, c]))
  const locked = (options.locked ?? []).map((id) => byId.get(id)).filter((c): c is Card => !!c && c.kind === 'kingdom')
  const lockedIds = new Set(locked.map((c) => c.id))
  const exclude = new Set(options.exclude ?? [])
  const banned = new Set(owned.banned)
  const favorites = new Set(owned.favorites)

  const allOwnedSets = ownedSets(owned, cards)
  const allowedSets = new Set(options.sets?.length ? options.sets.filter((s) => allOwnedSets.includes(s)) : allOwnedSets)
  if (!allowedSets.size) allOwnedSets.forEach((s) => allowedSets.add(s))

  const candidate = (c: Card) =>
    c.kind === 'kingdom' &&
    isOwned(c, owned) &&
    allowedSets.has(c.set) &&
    !banned.has(c.id) &&
    !exclude.has(c.id) &&
    !lockedIds.has(c.id) &&
    allowedByDifficulty(c, options) &&
    !(options.attacks === 'keine' && has(c, 'attack'))
  let pool = cards.filter(candidate)
  // zu wenig für ein Set (z. B. viele Sperren): Schwierigkeit lockern statt abzubrechen
  if (pool.length + locked.length < KINGDOM_SIZE)
    pool = cards.filter((c) => c.kind === 'kingdom' && isOwned(c, owned) && !exclude.has(c.id) && !lockedIds.has(c.id) && !banned.has(c.id))
  if (pool.length + locked.length < KINGDOM_SIZE) pool = cards.filter((c) => c.kind === 'kingdom' && isOwned(c, owned) && !lockedIds.has(c.id))

  // Gewichte: zuletzt gespielt seltener, nie gespielt öfter, Favoriten etwas öfter
  const played = history.filter((h) => h.played)
  const recent = new Set(played.slice(0, RECENT_GAMES).flatMap((h) => h.kingdom))
  const ever = new Set(played.flatMap((h) => h.kingdom))
  const weight = (c: Card) => (recent.has(c.id) ? W_RECENT : ever.has(c.id) || !played.length ? 1 : W_NEVER_PLAYED) * (favorites.has(c.id) ? W_FAVORITE : 1)

  // Erweiterungen für dieses Set
  const poolSets = [...new Set(pool.map((c) => c.set))]
  const lockedSets = new Set(locked.map((c) => c.set))
  let chosen: string[]
  let focus: string | null = null
  if (options.mix === 'querbeet' || poolSets.length <= 2) chosen = poolSets
  else if (options.mix === 'fokus') {
    focus = options.focus && poolSets.includes(options.focus) ? options.focus : (pickWeighted(rand, poolSets, (s) => 1 + (recentSetGap(s, played, byId) ?? 3)) ?? poolSets[0])
    chosen = poolSets
  } else {
    const want = rand() < 0.5 ? 2 : 3
    chosen = [...lockedSets].filter((s) => poolSets.includes(s))
    for (const s of shuffle(rand, poolSets)) if (chosen.length < want && !chosen.includes(s)) chosen.push(s)
    // genug Auswahl: mindestens 14 Karten (Platz zum Reparieren)
    for (const s of shuffle(rand, poolSets)) {
      if (pool.filter((c) => chosen.includes(c.set)).length >= KINGDOM_SIZE + 4) break
      if (!chosen.includes(s)) chosen.push(s)
    }
  }

  const inChosen = (c: Card) => chosen.includes(c.set)
  const picked: Card[] = [...locked]
  const take = (from: Card[]) => {
    const c = pickWeighted(rand, from.filter((x) => !picked.includes(x)), weight)
    if (c) picked.push(c)
    return c
  }

  if (focus) {
    const n = FOCUS_MIN + Math.floor(rand() * (FOCUS_MAX - FOCUS_MIN + 1))
    const own = pool.filter((c) => c.set === focus)
    while (picked.filter((c) => c.set === focus).length < n && take(own));
    const rest = pool.filter((c) => c.set !== focus)
    while (picked.length < KINGDOM_SIZE && take(rest.length ? rest : pool));
  }
  while (picked.length < KINGDOM_SIZE && take(pool.filter(inChosen)));
  while (picked.length < KINGDOM_SIZE && take(pool));

  // weiche Regeln: einmal pro Set auslosen
  const wantVillage = rand() < P_VILLAGE
  const wantBuy = rand() < P_PLUS_BUY
  const wantTrash = rand() < P_TRASH
  const wantDefense = rand() < P_DEFENSE

  /** eine Karte (nicht behalten) gegen eine aus dem Vorrat tauschen, die `fits` erfüllt; `out` wählt, welche gehen darf */
  const focusCount = () => picked.filter((c) => c.set === focus).length
  const replace = (fits: (c: Card) => boolean, out: (c: Card) => boolean): boolean => {
    // Fokus nicht unter das Minimum drücken
    const outs = picked.filter((c) => !lockedIds.has(c.id) && out(c) && !(focus && c.set === focus && focusCount() <= FOCUS_MIN))
    if (!outs.length) return false
    const ins = pool.filter((c) => !picked.includes(c) && fits(c))
    const preferred = ins.filter(inChosen)
    const inCard = pickWeighted(rand, preferred.length ? preferred : ins, weight)
    if (!inCard) return false
    const victim = outs[Math.floor(rand() * outs.length)]
    picked.splice(picked.indexOf(victim), 1, inCard)
    return true
  }

  // Alchemie: wenn Trank-Karten dabei sind, dann 3–5 Alchemie-Karten (sonst Alchemie wieder raus)
  const alchemy = () => picked.filter((c) => c.set === 'alchemy').length
  if (alchemy() > 0 && alchemy() < ALCHEMY_MIN) {
    const target = Math.min(ALCHEMY_MIN + Math.floor(rand() * (ALCHEMY_MAX - ALCHEMY_MIN + 1)), pool.filter((c) => c.set === 'alchemy').length + picked.filter((c) => c.set === 'alchemy').length)
    if (target >= ALCHEMY_MIN) while (alchemy() < target && replace((c) => c.set === 'alchemy', (c) => c.set !== 'alchemy'));
    else while (alchemy() > 0 && replace((c) => c.set !== 'alchemy', (c) => c.set === 'alchemy'));
  }
  while (alchemy() > ALCHEMY_MAX && replace((c) => c.set !== 'alchemy', (c) => c.set === 'alchemy'));
  const alchemyOk = (outCard: Card, inCard: Card) => {
    const n = alchemy() - (outCard.set === 'alchemy' ? 1 : 0) + (inCard.set === 'alchemy' ? 1 : 0)
    return n === 0 || (n >= ALCHEMY_MIN && n <= ALCHEMY_MAX) || n === alchemy()
  }

  /** Tausch, der die harten Regeln nicht verschlechtert */
  const fix = (fits: (c: Card) => boolean, out: (c: Card) => boolean): boolean => {
    const before = hardScore(picked, options)
    const outs = shuffle(rand, picked.filter((c) => !lockedIds.has(c.id) && out(c)))
    const ins = pool.filter((c) => !picked.includes(c) && fits(c))
    const preferred = ins.filter(inChosen)
    for (const victim of outs.slice(0, 6)) {
      // am liebsten aus derselben Erweiterung, damit Mischung und Fokus erhalten bleiben
      const sameSet = ins.filter((c) => c.set === victim.set)
      for (let tries = 0; tries < 8; tries++) {
        const from = sameSet.length && tries < 3 ? sameSet : preferred.length && tries < 6 ? preferred : ins
        const inCard = pickWeighted(rand, from, weight)
        if (!inCard || !alchemyOk(victim, inCard)) continue
        const next = picked.map((c) => (c === victim ? inCard : c))
        if (hardScore(next, options) <= before) {
          picked.splice(picked.indexOf(victim), 1, inCard)
          return true
        }
      }
    }
    return false
  }

  const terminal = (c: Card) => has(c, 'terminal_draw')
  for (let round = 0; round < REPAIR_ROUNDS; round++) {
    const v = hardViolation(picked, options)
    if (!v) break
    const cnt = (f: (c: Card) => boolean) => picked.filter(f).length
    const costs = new Map<number, number>()
    for (const c of picked) costs.set(costValue(c), (costs.get(costValue(c)) ?? 0) + 1)
    const ok =
      v === 'attacks'
        ? fix((c) => !has(c, 'attack'), (c) => has(c, 'attack'))
        : v === 'village'
          ? fix((c) => has(c, 'village'), (c) => !has(c, 'village') && (cnt(terminal) > TERMINAL_DRAW_NEEDS_VILLAGE || !terminal(c))) ||
            fix((c) => !terminal(c), terminal)
          : v === 'cheap'
            ? fix((c) => costValue(c) <= CHEAP_MAX, (c) => costValue(c) > CHEAP_MAX)
            : v === 'expensive'
              ? fix((c) => costValue(c) >= EXPENSIVE_MIN, (c) => costValue(c) < EXPENSIVE_MIN)
              : v === 'same_cost'
                ? fix((c) => (costs.get(costValue(c)) ?? 0) < MAX_SAME_COST, (c) => (costs.get(costValue(c)) ?? 0) > MAX_SAME_COST)
                : fix((c) => !material(c), material)
    if (!ok) {
      // nichts Gezieltes gefunden: irgendeine Karte ohne Schloss tauschen und weiter versuchen
      if (!replace(() => true, () => true)) break
    }
  }

  // weiche Regeln nur, wenn die harten danach noch stimmen
  const soft = (want: boolean, need: (c: Card) => boolean) => {
    if (!want || picked.some(need)) return
    fix(need, (c) => !need(c) && !has(c, 'village') && !has(c, 'plus_buy') && !has(c, 'trash'))
    if (!picked.some(need)) fix(need, (c) => !need(c))
  }
  soft(wantVillage && picked.some(terminal), (c) => has(c, 'village'))
  soft(wantBuy, (c) => has(c, 'plus_buy'))
  soft(wantTrash, (c) => has(c, 'trash'))
  if (picked.filter((c) => has(c, 'attack')).length >= ATTACKS_FOR_DEFENSE) soft(wantDefense, (c) => has(c, 'defense'))

  picked.sort((a, b) => costValue(a) - costValue(b) || cardName(a.id).localeCompare(cardName(b.id), 'de'))
  const kingdomSets = [...new Set(picked.map((c) => c.set))]

  // Landschaften
  // Verbündete und Prophezeiungen hängen an Karten, sie werden unten neu bestimmt
  const lockedLand = (options.lockedLandscapes ?? []).map((id) => byId.get(id)).filter((c): c is Card => !!c && FREE_LANDSCAPES.has(c.kind))
  const landPool = cards.filter(
    (c) =>
      FREE_LANDSCAPES.has(c.kind) &&
      isOwned(c, owned) &&
      !banned.has(c.id) &&
      !lockedLand.includes(c) &&
      (options.difficulty !== 'locker' || (!c.cost.debt && !c.cost.potion)) &&
      (options.difficulty === 'alles' || c.complexity <= 2),
  )
  const landFromKingdom = landPool.filter((c) => kingdomSets.includes(c.set))
  let landCount: number = options.landscapes === 'auto' ? (landFromKingdom.length ? (rand() < P_LANDSCAPES_0 ? 0 : rand() < P_LANDSCAPES_1 / (1 - P_LANDSCAPES_0) ? 1 : 2) : 0) : options.landscapes
  if (options.difficulty === 'locker') landCount = Math.min(landCount, 1)
  const landscapes: Card[] = [...lockedLand]
  while (landscapes.length < landCount) {
    const from = landFromKingdom.filter((c) => !landscapes.includes(c))
    const c = pickWeighted(rand, from.length ? from : landPool.filter((x) => !landscapes.includes(x)), () => 1)
    if (!c) break
    landscapes.push(c)
  }

  // Abhängigkeiten
  const needs = (key: string) => [...picked, ...landscapes].some((c) => c.requires.includes(key))
  const ownedOfKind = (kind: string) => cards.filter((c) => c.kind === kind && isOwned(c, owned))
  if (needs('ally') && !landscapes.some((c) => c.kind === 'ally')) {
    const a = pickWeighted(rand, ownedOfKind('ally'), () => 1)
    if (a) landscapes.push(a)
  }
  if (needs('prophecy') && !landscapes.some((c) => c.kind === 'prophecy')) {
    const p = pickWeighted(rand, ownedOfKind('prophecy'), () => 1)
    if (p) landscapes.push(p)
  }
  let bane: Card | null = null
  if (needs('bane')) {
    const choices = cards.filter(
      (c) => c.kind === 'kingdom' && isOwned(c, owned) && !picked.includes(c) && !banned.has(c.id) && !c.cost.potion && !c.cost.debt && c.cost.coins >= 2 && c.cost.coins <= 3,
    )
    bane = pickWeighted(rand, choices, weight)
  }

  const extras: Extra[] = []
  const addExtra = (id: string) => {
    if (!extras.some((e) => e.id === id)) extras.push({ id, label: EXTRA_LABELS[id] ?? id })
  }
  // Blütezeit: Platin und Kolonie, Dark Ages: Unterschlüpfe, jeweils mit dem Anteil der Karten aus der Erweiterung
  const share = (set: string) => picked.filter((c) => c.set === set).length / KINGDOM_SIZE
  const prosperity = share('prosperity')
  const darkages = share('darkages')
  if (prosperity > 0 && rand() < prosperity) addExtra('platinum_colony')
  if (darkages > 0 && rand() < darkages) addExtra('shelters')
  for (const c of [...picked, ...landscapes, ...(bane ? [bane] : [])]) for (const r of c.requires) if (r !== 'ally' && r !== 'prophecy') addExtra(r)
  if (bane) addExtra('bane')

  // „Warum es passt“
  const reasons: string[] = []
  const reason = (label: string, t: Tag) => {
    const list = picked.filter((c) => has(c, t))
    if (list.length) reasons.push(`${label}: ${list.slice(0, 2).map((c) => cardName(c.id)).join(', ')}`)
  }
  reason('Dorf', 'village')
  reason('Ziehen', 'terminal_draw')
  reason('+Kauf', 'plus_buy')
  reason('Entsorgen', 'trash')
  if (picked.some((c) => has(c, 'attack'))) reason('Abwehr', 'defense')
  reason('Andere Punkte', 'alt_vp')

  return {
    seed,
    kingdom: picked.map((c) => c.id),
    landscapes: landscapes.map((c) => c.id),
    bane: bane?.id ?? null,
    extras,
    reasons,
    sets: [...new Set([...kingdomSets, ...landscapes.map((c) => c.set)])],
  }
}

/** Wie schlimm die harten Regeln verletzt sind (0 = alles gut), um Tausche zu vergleichen */
function hardScore(cards: Card[], o: GenOptions): number {
  const costs = cards.map(costValue)
  const byCost = new Map<number, number>()
  for (const v of costs) byCost.set(v, (byCost.get(v) ?? 0) + 1)
  return (
    Math.max(0, cards.filter((c) => has(c, 'attack')).length - attackLimit(o)) +
    (cards.filter((c) => has(c, 'terminal_draw')).length >= TERMINAL_DRAW_NEEDS_VILLAGE && !cards.some((c) => has(c, 'village')) ? 1 : 0) +
    Math.max(0, MIN_CHEAP - costs.filter((v) => v <= CHEAP_MAX).length) +
    Math.max(0, MIN_EXPENSIVE - costs.filter((v) => v >= EXPENSIVE_MIN).length) +
    [...byCost.values()].reduce((s, n) => s + Math.max(0, n - MAX_SAME_COST), 0) +
    Math.max(0, cards.filter(material).length - (o.difficulty === 'locker' ? MAX_MATERIAL_EASY : MAX_MATERIAL))
  )
}

/** Wie viele gespielte Sets her eine Erweiterung zuletzt dran war (für Fokus: lange nicht dran = eher Schwerpunkt) */
function recentSetGap(set: string, played: HistoryEntry[], byId: Map<string, Card>): number | null {
  const i = played.findIndex((h) => h.kingdom.some((id) => byId.get(id)?.set === set))
  return i < 0 ? null : i
}

/** Eine Karte tauschen: alle anderen bleiben, die getauschte kommt nicht wieder */
export function swapCard(current: Kingdom, cardId: string, options: GenOptions, owned: Owned, history: HistoryEntry[], seed: number): Kingdom {
  return generateKingdom(
    { ...options, locked: current.kingdom.filter((id) => id !== cardId), exclude: [...(options.exclude ?? []), cardId], lockedLandscapes: current.landscapes },
    owned,
    history,
    seed,
  )
}
