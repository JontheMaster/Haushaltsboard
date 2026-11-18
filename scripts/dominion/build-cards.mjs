// Dominion-Kartendaten fürs Haushaltsboard (docs/dominion-modul.md, Stufe 1).
// Aufruf: node scripts/dominion/build-cards.mjs
//
// Quelle: KingdomCreator (MIT, Lizenz und Herkunft in scripts/dominion/README.md), fest auf einen Commit gepinnt,
// damit jeder Lauf dasselbe Ergebnis bringt. Übernommen werden nur Fakten: Namen (englisch/deutsch), Kosten,
// Typen, Funktions-Merkmale. Keine Kartentexte, keine Bilder.
//
// Ergebnis:
//   src/modules/dominion/data/cards.json   Königreichkarten und Landschaften (Ereignisse, Projekte, …)
//   src/modules/dominion/data/sets.json    Erweiterungen mit ihren Schachteln (1./2. Edition, Updatepack)
//   scripts/dominion/namen-pruefen.md      Karten mit fehlendem oder unsicherem deutschen Namen (für Jonathan)
//   supabase/functions/_shared/dominionImages.json  wo im Repo von KingdomCreator Kartenbild und Illustration liegen
//                                          (die Edge Function `dominion-images` legt sie privat in Supabase ab, nie ins Repo)
//
// Handkorrekturen (deutsche Namen, Merkmale, Material, Komplexität) stehen in scripts/dominion/card-overrides.json
// und gewinnen immer gegen die Quelle.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'src', 'modules', 'dominion', 'data')

const REPO = 'blakevanlan/KingdomCreator'
const COMMIT = '7887e37e739c20998b55a1d88ca38e60e601cb61'
const RAW = `https://raw.githubusercontent.com/${REPO}/${COMMIT}`
const CACHE = join(HERE, '.cache', COMMIT.slice(0, 12))

const DE_FILES = [
  'adventures', 'alchemy', 'allies', 'baseset', 'cornucopia', 'darkages', 'empires', 'guilds', 'guildscornucopia',
  'hinterlands', 'intrigue', 'menagerie', 'nocturne', 'plunder', 'promos', 'prosperity', 'renaissance', 'risingsun', 'seaside',
]

/**
 * Erweiterungen (Familien) und ihre Schachteln. Eine Karte gehört zu einer Familie und steht in einer oder mehreren
 * Schachteln. `edition` 1/2; `update: true` = Updatepack (nur die in der 2. Edition neuen Karten, für Besitzer der 1. Edition).
 * „Die Gilden“ und „Reiche Ernte“ waren in der 1. Edition getrennte Schachteln, in der 2. Edition eine.
 */
const FAMILIES = [
  { id: 'baseset', boxes: [['base-set', 'baseset', 1], ['base-set-2', 'baseset2', 2], ['base-set-2-add', 'baseset2add', 2, true]] },
  { id: 'intrigue', boxes: [['intrigue', 'intrigue', 1], ['intrigue-2', 'intrigue2', 2], ['intrigue-2-add', 'intrigue2add', 2, true]] },
  { id: 'seaside', boxes: [['seaside', 'seaside', 1], ['seaside-2', 'seaside2', 2], ['seaside-2-add', 'seaside2add', 2, true]] },
  { id: 'alchemy', boxes: [['alchemy', 'alchemy', 1]] },
  { id: 'prosperity', boxes: [['prosperity', 'prosperity', 1], ['prosperity-2', 'prosperity2', 2], ['prosperity-2-add', 'prosperity2add', 2, true]] },
  {
    id: 'guildscornucopia',
    boxes: [['cornucopia', 'cornucopia', 1], ['guilds', 'guilds', 1], ['guildscornucopia-2', 'guildscornucopia2', 2], ['guildscornucopia-2-add', 'guildscornucopia2add', 2, true]],
  },
  { id: 'hinterlands', boxes: [['hinterlands', 'hinterlands', 1], ['hinterlands-2', 'hinterlands2', 2], ['hinterlands-2-add', 'hinterlands2add', 2, true]] },
  { id: 'darkages', boxes: [['dark-ages', 'darkages', 1]] },
  { id: 'adventures', boxes: [['adventures', 'adventures', 1]] },
  { id: 'empires', boxes: [['empires', 'empires', 1]] },
  { id: 'nocturne', boxes: [['nocturne', 'nocturne', 1]] },
  { id: 'renaissance', boxes: [['renaissance', 'renaissance', 1]] },
  { id: 'menagerie', boxes: [['menagerie', 'menagerie', 1]] },
  { id: 'allies', boxes: [['allies', 'allies', 1]] },
  { id: 'plunder', boxes: [['plunder', 'plunder', 1]] },
  { id: 'risingsun', boxes: [['risingsun', 'risingsun', 1]] },
  { id: 'promos', boxes: [['promos', 'promos', 1]] },
]

/** Abschnitt in der YAML → Art der Karte und Präfix im KingdomCreator-Schlüssel der Übersetzung */
const SECTIONS = {
  cards: { kind: 'kingdom', prefix: '' },
  events: { kind: 'event', prefix: 'event_' },
  landmarks: { kind: 'landmark', prefix: 'landmark_' },
  projects: { kind: 'project', prefix: 'project_' },
  ways: { kind: 'way', prefix: 'way_' },
  allies: { kind: 'ally', prefix: 'ally_' },
  traits: { kind: 'trait', prefix: 'trait_' },
  prophecies: { kind: 'prophecy', prefix: 'prophecy_' },
  // boons (Gaben) und othercards (Basiskarten, Ruinen, Preise, Marker …) sind Zusatzmaterial, keine Karten zum Auslosen
}

const TYPE_FLAGS = [
  ['isAction', 'action'], ['isTreasure', 'treasure'], ['isVictory', 'victory'], ['isAttack', 'attack'], ['isReaction', 'reaction'],
  ['isDuration', 'duration'], ['isReserve', 'reserve'], ['isTraveller', 'traveller'], ['isNight', 'night'], ['isDoom', 'doom'],
  ['isFate', 'fate'], ['isLiaison', 'liaison'], ['isCommand', 'command'], ['isOmen', 'omen'], ['isShadow', 'shadow'],
  ['isGathering', 'gathering'],
]

const TAGS = ['village', 'draw', 'terminal_draw', 'cantrip', 'plus_buy', 'trash', 'gain', 'attack', 'defense', 'payload', 'alt_vp', 'cost_reduce']

/** Familien, deren Karten schon für sich mehr Regelwissen brauchen (Grundwert der Komplexität 2) */
const ADVANCED_FAMILIES = new Set(['alchemy', 'darkages', 'adventures', 'empires', 'nocturne', 'renaissance', 'menagerie', 'allies', 'plunder', 'risingsun'])

// wie KingdomCreator (process/loader.js), damit die Übersetzungsschlüssel passen
const tokenize = (s) => s.replace(/[\s'-/]/g, '').toLowerCase()

async function cached(path) {
  const file = join(CACHE, path)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(`${RAW}/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const text = await res.text()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  return text
}

async function cachedApi(url, name) {
  const file = join(CACHE, name)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const text = await res.text()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  return text
}

const overrides = JSON.parse(readFileSync(join(HERE, 'card-overrides.json'), 'utf8'))

// Übersetzungen
const de = {}
for (const f of DE_FILES) Object.assign(de, JSON.parse(await cached(`src/i18n/locales/messages/de/cards/cards.de.${f}.json`)))
const setsDe = JSON.parse(await cached('src/i18n/locales/messages/de/sets.de.json'))
// 1. Edition von Gilden/Reiche Ernte steht in KingdomCreator zusätzlich als gemeinsame Schachtel (nur als Namensquelle)
const extraNameSets = { cornucopia: ['guildscornucopia'], guilds: ['guildscornucopia'] }

const cards = new Map() // Schlüssel family|kind|token
const report = { missing: [], same: [], differ: [], costDiffer: [], costFixed: [], odd: [] }

for (const fam of FAMILIES) {
  for (const [file, box, edition] of fam.boxes) {
    const y = YAML.parse(await cached(`sets/${file}.yaml`))
    const setId = tokenize(file)
    for (const [section, { kind, prefix }] of Object.entries(SECTIONS)) {
      for (const c of y[section] ?? []) {
        const tok = tokenize(c.name)
        const key = `${fam.id}|${kind}|${tok}`
        const id = `${fam.id}_${kind === 'kingdom' ? '' : kind + '_'}${tok}`
        const cost = { coins: c.cost?.treasure ?? 0, potion: c.cost?.potion ?? 0, debt: c.cost?.debt ?? 0 }
        let card = cards.get(key)
        if (!card) {
          card = { id, name_en: c.name, set: fam.id, kind, boxes: [], editions: [], cost, raw: c, names: [] }
          cards.set(key, card)
        } else if (JSON.stringify(card.cost) !== JSON.stringify(cost)) {
          report.costDiffer.push({ id, name: c.name, a: card.cost, b: cost, edition })
          if (edition === 2) card.cost = cost // neueste Edition gilt
        }
        if (!card.boxes.includes(box)) card.boxes.push(box)
        if (!card.editions.includes(edition)) card.editions.push(edition)
        if (edition === 2) card.raw = { ...card.raw, ...c } // Merkmale der 2. Edition
        for (const s of [setId, ...(extraNameSets[setId] ?? [])]) {
          const name = de[`${s}_${prefix}${tok}`]
          if (name) card.names.push({ edition, name: name.trim() })
        }
      }
    }
  }
}

const has = (c, f) => c[f] === true

function typesOf(card) {
  const c = card.raw
  if (card.kind !== 'kingdom') return [card.kind]
  return TYPE_FLAGS.filter(([f]) => has(c, f)).map(([, t]) => t)
}

function tagsOf(card) {
  const c = card.raw
  const tags = new Set()
  const village = has(c, 'isActionSupplier') || has(c, 'isVillageSupplier')
  if (village) tags.add('village')
  if (has(c, 'isDrawer')) tags.add('draw')
  if (has(c, 'isMultiDrawer') && !village && has(c, 'isAction')) tags.add('terminal_draw')
  if (has(c, 'isBuySupplier') || has(c, 'isBuyProvider')) tags.add('plus_buy')
  if (has(c, 'isTrashing')) tags.add('trash')
  if (has(c, 'isAttack')) tags.add('attack')
  if (card.kind === 'kingdom' && has(c, 'isVictory')) tags.add('alt_vp')
  if (card.kind === 'landmark') tags.add('alt_vp')
  return tags
}

function requiresOf(card) {
  const c = card.raw
  const req = new Set(c.setup ?? [])
  if (card.cost.potion) req.add('potion')
  if (card.cost.debt) req.add('debt_tokens')
  if (has(c, 'isDoom')) req.add('hexes')
  if (has(c, 'isFate')) req.add('boons')
  if (has(c, 'isLiaison')) req.add('ally')
  if (has(c, 'isOmen')) req.add('prophecy')
  if (has(c, 'isLootSupplier')) req.add('loot')
  if (has(c, 'isArtifactSupplier')) req.add('artifacts')
  if (has(c, 'isReserve')) req.add('tavern_mat')
  if (has(c, 'isGathering')) req.add('vp_tokens')
  return req
}

function complexityOf(card, types, requires) {
  let n = ADVANCED_FAMILIES.has(card.set) ? 2 : 1
  if (card.kind !== 'kingdom') n = Math.max(n, 2)
  if (types.some((t) => ['duration', 'reserve', 'night'].includes(t)) || requires.size) n = Math.max(n, 2)
  if (types.some((t) => ['traveller', 'doom', 'fate', 'command', 'shadow'].includes(t))) n = 3
  return n
}

const nameFix = overrides.names_de ?? {}
const out = []
for (const card of cards.values()) {
  const types = typesOf(card)
  const o = overrides.cards?.[card.id] ?? {}
  // `tags` in den Overrides ersetzt die abgeleiteten Merkmale ganz (von Hand gepflegt für die Erweiterungen, die wir haben)
  const tags = o.tags ? new Set(o.tags) : tagsOf(card)
  const requires = requiresOf(card)
  for (const t of o.tags_add ?? []) tags.add(t)
  for (const t of o.tags_remove ?? []) tags.delete(t)
  for (const r of o.requires_add ?? []) requires.add(r)
  for (const r of o.requires_remove ?? []) requires.delete(r)
  if (o.cost) {
    report.costFixed.push({ id: card.id, name: card.name_en, from: card.cost, to: { ...card.cost, ...o.cost }, note: o.cost_note })
    card.cost = { ...card.cost, ...o.cost }
  }
  // Ein Dorf zieht nicht „terminal“
  if (tags.has('village')) tags.delete('terminal_draw')
  const unknownTag = [...tags].find((t) => !TAGS.includes(t))
  if (unknownTag) throw new Error(`${card.id}: unbekanntes Merkmal ${unknownTag}`)

  // deutscher Name: Korrektur > 2. Edition > 1. Edition
  const distinct = [...new Set(card.names.map((n) => n.name))]
  const fromSource = card.names.find((n) => n.edition === 2)?.name ?? card.names[0]?.name ?? null
  const name_de = nameFix[card.id] ?? fromSource
  const where = `${card.set}${card.kind === 'kingdom' ? '' : ` · ${card.kind}`}`
  if (!nameFix[card.id]) {
    if (!name_de) report.missing.push({ id: card.id, en: card.name_en, where })
    else if (distinct.length > 1) report.differ.push({ id: card.id, en: card.name_en, where, names: card.names })
    else if (name_de.toLowerCase() === card.name_en.toLowerCase()) report.same.push({ id: card.id, en: card.name_en, where })
  }

  out.push({
    id: card.id,
    name_de: name_de ?? null,
    name_en: card.name_en,
    set: card.set,
    boxes: card.boxes,
    editions: card.editions.sort(),
    cost: card.cost,
    kind: card.kind,
    types,
    tags: [...tags].sort(),
    requires: [...requires].sort(),
    complexity: o.complexity ?? complexityOf(card, types, requires),
  })
}

// Auffälliges: gleicher deutscher Name für zwei Karten, Sonderzeichen, „ss“ statt „ß“, eigene Notizen
const byName = new Map()
for (const c of out) if (c.name_de) byName.set(c.name_de.toLowerCase(), [...(byName.get(c.name_de.toLowerCase()) ?? []), c])
for (const list of byName.values())
  if (list.length > 1) for (const c of list) report.odd.push({ c, why: `gleicher Name wie ${list.filter((x) => x !== c).map((x) => `${x.name_en} (${x.set})`).join(', ')}` })
for (const c of out) {
  if (!c.name_de || nameFix[c.id]) continue
  if (/[[\]{}<>|_*]/.test(c.name_de)) report.odd.push({ c, why: 'Sonderzeichen im Namen' })
  if (/(gross|aussen|strass)/i.test(c.name_de)) report.odd.push({ c, why: 'Schweizer „ss“, auf Deutsch eher „ß“?' })
}
for (const [id, why] of Object.entries(overrides.review ?? {})) {
  const c = out.find((x) => x.id === id)
  if (c && !nameFix[id]) report.odd.push({ c, why })
}

// Prüfen, ob Überschreibungen noch auf echte Karten zeigen
const ids = new Set(out.map((c) => c.id))
for (const id of [...Object.keys(nameFix), ...Object.keys(overrides.cards ?? {}), ...Object.keys(overrides.review ?? {})]) if (!ids.has(id)) console.warn(`Override ohne Karte: ${id}`)

out.sort((a, b) => FAMILIES.findIndex((f) => f.id === a.set) - FAMILIES.findIndex((f) => f.id === b.set) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))

const sets = FAMILIES.map((f) => ({
  id: f.id,
  name_de: overrides.sets_de?.[f.id] ?? setsDe[f.id] ?? null,
  boxes: f.boxes.map(([, box, edition, update]) => ({
    id: box,
    name_de: overrides.sets_de?.[box] ?? setsDe[box] ?? null,
    edition,
    update_pack: !!update,
    cards: out.filter((c) => c.boxes.includes(box)).length,
  })),
}))

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'cards.json'), JSON.stringify(out, null, 1) + '\n')
writeFileSync(
  join(OUT, 'sets.json'),
  JSON.stringify({ source: `${REPO}@${COMMIT.slice(0, 12)}`, license: 'MIT', sets }, null, 1) + '\n',
)

// Bilder: Pfade im KingdomCreator-Repo (docs/img/cards/<schachtel>/<schachtel>_<name>.jpg, docs/img/artworks/…/<Name>Art.jpg)
const tree = JSON.parse(await cachedApi(`https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`, 'tree.json')).tree.map((t) => t.path)
const cardImgs = new Set(tree.filter((p) => /^docs\/img\/cards\/[^/]+\/[^/]+\.(jpe?g|png)$/.test(p)))
const artByKey = new Map()
for (const p of tree.filter((x) => /^docs\/img\/artworks\/.*Art\.(jpe?g|png)$/i.test(x))) {
  const key = tokenize(p.split('/').pop().replace(/Art\.(jpe?g|png)$/i, '').replace(/_/g, ' '))
  // gehashte Ablage (images/x/xy/…) bevorzugen, das sind die vollständigen Illustrationen
  if (!artByKey.has(key) || p.includes('/images/')) artByKey.set(key, p)
}
const images = {}
let missingImg = 0
for (const card of cards.values()) {
  const c = out.find((x) => x.id === card.id)
  const tok = tokenize(card.name_en)
  const byBox = {}
  for (const box of c.boxes) {
    const rest = c.id.slice(c.set.length + 1) // z. B. „village“ oder „event_alms“
    for (const ext of ['jpg', 'jpeg', 'png']) {
      const path = `docs/img/cards/${box}/${box}_${rest}.${ext}`
      if (cardImgs.has(path)) byBox[box] = path
    }
  }
  const art = artByKey.get(tok) ?? null
  if (!Object.keys(byBox).length) missingImg++
  images[c.id] = { boxes: c.boxes, card: byBox, art }
}
// Basiskarten und Zusatzmaterial (Aufbau): Bild pro Schachtel, abgelegt wie Karten unter card/sup_<id>.jpg.
// Deutsche Namen nur, wo sie sicher sind; sonst zeigt die App die Gruppe („Ruinen“) und das Bild.
const S = (id, name_de, name_en, set, byBox) => ({ id, name_de, name_en, set, byBox })
const SUPPORT = [
  ...[
    ['copper', 'Kupfer', 'Copper'],
    ['silver', 'Silber', 'Silver'],
    ['gold', 'Gold', 'Gold'],
    ['estate', 'Anwesen', 'Estate'],
    ['duchy', 'Herzogtum', 'Duchy'],
    ['province', 'Provinz', 'Province'],
    ['curse', 'Fluch', 'Curse'],
  ].map(([id, de, en]) => S(id, de, en, 'baseset', { baseset2: `baseset2/baseset2_${id}_2nd.jpg`, baseset: `baseset/baseset_${id}.jpg` })),
  S('potion', 'Trank', 'Potion', 'alchemy', { alchemy: 'alchemy/alchemy_potion.jpg' }),
  S('platinum', 'Platin', 'Platinum', 'prosperity', { prosperity: 'prosperity/prosperity_platinum.jpg', prosperity2: 'prosperity/prosperity_platinum_2nd.jpg' }),
  S('colony', 'Kolonie', 'Colony', 'prosperity', { prosperity: 'prosperity/prosperity_colony.jpg', prosperity2: 'prosperity/prosperity_colony_2nd.jpg' }),
  S('trade_route_mat', null, 'Trade Route mat', 'prosperity', { prosperity: 'prosperity/prosperity_other_Trade_Route_mat.jpg' }),
  S('vp_tokens', null, 'VP tokens', 'prosperity', { prosperity: 'prosperity/prosperity_other_VPTokens.jpg' }),
  S('coin_tokens', null, 'Coin tokens', 'prosperity', { prosperity: 'prosperity/prosperity_other_CoinsTokens.jpg', seaside: 'seaside/seaside_other_CoinsTokens.jpg' }),
  S('island_mat', null, 'Island mat', 'seaside', { seaside: 'seaside/seaside_other_Island_mat.jpg' }),
  S('native_village_mat', null, 'Native Village mat', 'seaside', { seaside: 'seaside/seaside_other_Native_Village_mat.jpg' }),
  S('pirate_ship_mat', null, 'Pirate Ship mat', 'seaside', { seaside: 'seaside/seaside_other_Pirate_Ship_mat.jpg' }),
  S('embargo_tokens', null, 'Embargo tokens', 'seaside', { seaside: 'seaside/seaside_other_EmbargoTokens.jpg' }),
  ...['abandonedmine', 'ruinedlibrary', 'ruinedmarket', 'ruinedvillage', 'survivors'].map((id, i) =>
    S(id, null, ['Abandoned Mine', 'Ruined Library', 'Ruined Market', 'Ruined Village', 'Survivors'][i], 'darkages', { darkages: `darkages/darkages_${id}.jpg` }),
  ),
  ...['hovel', 'necropolis', 'overgrownestate'].map((id, i) => S(id, null, ['Hovel', 'Necropolis', 'Overgrown Estate'][i], 'darkages', { darkages: `darkages/darkages_${id}.jpg` })),
  ...['spoils', 'madman', 'mercenary'].map((id, i) => S(id, null, ['Spoils', 'Madman', 'Mercenary'][i], 'darkages', { darkages: `darkages/darkages_${id}.jpg` })),
]
const support = []
for (const sup of SUPPORT) {
  const byBox = {}
  for (const [box, rel] of Object.entries(sup.byBox)) if (cardImgs.has(`docs/img/cards/${rel}`)) byBox[box] = `docs/img/cards/${rel}`
  if (!Object.keys(byBox).length) console.warn(`Kein Bild für ${sup.id}`)
  images[`sup_${sup.id}`] = { boxes: Object.keys(sup.byBox), card: byBox, art: null }
  support.push({ id: sup.id, name_de: sup.name_de, name_en: sup.name_en, set: sup.set, boxes: Object.keys(sup.byBox) })
}
writeFileSync(join(OUT, 'support.json'), JSON.stringify(support, null, 1) + '\n')
writeFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'dominionImages.json'), JSON.stringify({ repo: REPO, commit: COMMIT, images }) + '\n')

// Bericht
const line = (r) => `| ${r.en} | ${r.where} | \`${r.id}\` |`
const md = [
  '# Dominion: deutsche Namen prüfen',
  '',
  `Erzeugt von \`scripts/dominion/build-cards.mjs\` aus KingdomCreator (${COMMIT.slice(0, 12)}). ${out.length} Karten, ${sets.length} Erweiterungen.`,
  'Korrekturen trägt Claude in `scripts/dominion/card-overrides.json` unter `names_de` ein (Schlüssel = id), dann das Script neu laufen lassen.',
  '',
  `## Kein deutscher Name in der Quelle (${report.missing.length})`,
  '',
  '| Englisch | Erweiterung | id |',
  '| --- | --- | --- |',
  ...report.missing.map(line),
  '',
  `## Auffällig, bitte prüfen (${report.odd.length})`,
  '',
  '| Deutsch (Quelle) | Englisch | Erweiterung | Warum | id |',
  '| --- | --- | --- | --- | --- |',
  ...report.odd.map(({ c, why }) => `| ${c.name_de ?? "–"} | ${c.name_en} | ${c.set} | ${why} | \`${c.id}\` |`),
  '',
  `## Deutsch = Englisch, bitte bestätigen (${report.same.length})`,
  '',
  'Oft richtig (z. B. „Villa“), manchmal nur nicht übersetzt.',
  '',
  '| Name | Erweiterung | id |',
  '| --- | --- | --- |',
  ...report.same.map(line),
  '',
  `## 1. und 2. Edition heißen verschieden (${report.differ.length})`,
  '',
  'Vorgabe ist der Name der 2. Edition.',
  '',
  '| Englisch | 1. Edition | 2. Edition | id |',
  '| --- | --- | --- | --- |',
  ...report.differ.map(
    (r) =>
      `| ${r.en} | ${[...new Set(r.names.filter((n) => n.edition === 1).map((n) => n.name))].join(' / ')} | ${[...new Set(r.names.filter((n) => n.edition === 2).map((n) => n.name))].join(' / ')} | \`${r.id}\` |`,
  ),
  '',
  ...(report.costDiffer.length
    ? [`## Kosten unterschiedlich je Edition (${report.costDiffer.length}, 2. Edition gilt)`, '', ...report.costDiffer.map((r) => `- ${r.name}: ${JSON.stringify(r.a)} → ${JSON.stringify(r.b)}`), '']
    : []),
  ...(report.costFixed.length
    ? [`## Kosten von Hand korrigiert (${report.costFixed.length})`, '', ...report.costFixed.map((r) => `- ${r.name}: ${r.from.coins} → ${r.to.coins} Münzen${r.note ? ` (${r.note})` : ''}`), '']
    : []),
].join('\n')
writeFileSync(join(HERE, 'namen-pruefen.md'), md)

console.log(`${out.length} Karten → src/modules/dominion/data/cards.json`)
console.log(`Bilder: ${Object.keys(images).length - missingImg} mit Kartenbild, ${missingImg} ohne, ${Object.values(images).filter((i) => i.art).length} mit Illustration`)
console.log(`fehlt: ${report.missing.length}, gleich wie englisch: ${report.same.length}, je Edition anders: ${report.differ.length}, Kosten anders: ${report.costDiffer.length}`)
