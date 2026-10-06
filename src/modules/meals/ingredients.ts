// Zutaten: aus Text („200 g Mehl“, „1/2 TL Salz“, „2 Eier“) in Menge, Einheit, Name zerlegen,
// auf Portionen umrechnen und wieder lesbar ausgeben.

export type Ingredient = { amount: number | null; unit: string; name: string }

// Einheiten in der Schreibweise, in der sie angezeigt werden (Suche ohne Groß/klein und Punkt)
const UNITS = [
  'g', 'kg', 'mg', 'ml', 'l', 'cl', 'dl', 'EL', 'TL', 'Msp.', 'Prise', 'Prisen', 'Pck.', 'Päckchen', 'Dose', 'Dosen',
  'Bund', 'Stück', 'Stk.', 'Zehe', 'Zehen', 'Becher', 'Tasse', 'Tassen', 'Scheibe', 'Scheiben', 'Glas', 'Gläser', 'Würfel',
  'Handvoll', 'Blatt', 'Blätter', 'Zweig', 'Zweige', 'Liter', 'Kopf', 'Stange', 'Stangen', 'Knolle', 'Knollen', 'Tüte',
  'Packung', 'Packungen', 'Schuss', 'Spritzer', 'Beutel', 'Flasche',
]
const UNIT_KEY = new Map(UNITS.map((u) => [u.toLowerCase().replace('.', ''), u]))
UNIT_KEY.set('gramm', 'g').set('gr', 'g').set('esslöffel', 'EL').set('teelöffel', 'TL').set('st', 'Stück').set('pkt', 'Pck.')
UNIT_KEY.set('pck', 'Pck.').set('msp', 'Msp.').set('stk', 'Stück').set('liter', 'l').set('milliliter', 'ml').set('kilogramm', 'kg')
UNIT_KEY.set('el', 'EL').set('tl', 'TL')

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

/** „1 ½“, „1/2“, „0,5“, „1-2“ (nimmt die erste Zahl) → Zahl */
function number(s: string): number | null {
  let t = s.trim().replace(',', '.')
  t = t.replace(/^(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?/, '$1')
  let total = 0
  let found = false
  for (const part of t.split(/\s+/)) {
    if (FRACTIONS[part] != null) {
      total += FRACTIONS[part]
      found = true
    } else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number)
      if (b) total += a / b
      found = true
    } else if (/^\d+(\.\d+)?[½¼¾⅓⅔⅛]?$/.test(part)) {
      const frac = FRACTIONS[part.slice(-1)]
      total += frac != null ? Number(part.slice(0, -1)) + frac : Number(part)
      found = true
    }
  }
  return found ? total : null
}

/** Eine Textzeile in eine Zutat zerlegen */
export function parseIngredient(line: string): Ingredient {
  // Chefkoch-Schreibweisen: „Prise(n)“, „Ei(er)“ → „Prise“, „Ei“
  const text = line
    .replace(/(\p{L})\((?:n|e|en|er|s)\)/gu, '$1')
    .replace(/(\p{L})\/(?:n|e|en|er|s)(?=\s|$)/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const m = text.match(/^((?:\d+\/\d+|\d+(?:[.,]\d+)?[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s+(?:\d+\/\d+|[½¼¾⅓⅔⅛]))?)\s*(.*)$/)
  if (!m) return { amount: null, unit: '', name: text }
  const amount = number(m[1])
  let rest = m[2]
  let unit = ''
  // Einheit, optional mit Zusatz: „1 TL, gestr. Zimt“ → TL, „Zimt (gestr.)“
  const u = rest.match(/^([A-Za-zÄÖÜäöüß]+\.?)(?:,\s*(gestr\.|gestrichen|gehäuft|knapp|leicht gehäuft))?(?:\s+|$)(.*)$/)
  if (u) {
    const key = u[1].toLowerCase().replace('.', '')
    const known = UNIT_KEY.get(key)
    if (known && u[3]) {
      unit = known
      rest = u[2] ? `${u[3]} (${u[2]})` : u[3]
    }
  } else {
    // „200g Mehl“
    const glued = rest.match(/^([A-Za-z]+)\.?\s+(.*)$/)
    if (glued && UNIT_KEY.has(glued[1].toLowerCase())) {
      unit = UNIT_KEY.get(glued[1].toLowerCase())!
      rest = glued[2]
    }
  }
  return { amount, unit, name: rest.trim() || text }
}

/** Zahl hübsch: 0.5 → ½, 1.5 → 1½, 250 → 250, 2.25 → 2¼ */
export function formatAmount(n: number, unit = ''): string {
  // Gramm und Milliliter: ganze Zahlen, ab 50 auf 5 gerundet
  if (['g', 'ml', 'mg'].includes(unit)) {
    const r = n >= 50 ? Math.round(n / 5) * 5 : Math.round(n)
    return String(Math.max(r, 1))
  }
  const whole = Math.floor(n + 1e-9)
  const rest = n - whole
  const frac = [
    [0, ''],
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [0.5, '½'],
    [2 / 3, '⅔'],
    [0.75, '¾'],
    [1, ''],
  ] as const
  let best: (typeof frac)[number] = frac[0]
  for (const f of frac) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f
  if (Math.abs(rest - best[0]) > 0.09) return String(Math.round(n * 10) / 10).replace('.', ',')
  const w = best[0] === 1 ? whole + 1 : whole
  if (!best[1]) return String(w)
  return w ? `${w}${best[1]}` : best[1]
}

// Mehrzahl der Einheiten ab mehr als 1: „2 Dosen“, „3 Zehen“
const PLURAL: Record<string, string> = {
  Prise: 'Prisen', Dose: 'Dosen', Zehe: 'Zehen', Tasse: 'Tassen', Scheibe: 'Scheiben', Packung: 'Packungen', Stange: 'Stangen',
  Knolle: 'Knollen', Flasche: 'Flaschen', Tüte: 'Tüten', Zweig: 'Zweige', Glas: 'Gläser', Beutel: 'Beutel',
}
const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([a, b]) => [b, a]))

/** Menge und Einheit für eine Portionszahl, z. B. „150 g“ (leer, wenn keine Menge) */
export function quantity(i: Ingredient, factor = 1): string {
  if (i.amount == null) return i.unit
  const n = i.amount * factor
  const base = SINGULAR[i.unit] ?? i.unit
  const unit = n > 1.01 ? (PLURAL[base] ?? base) : base
  return [formatAmount(n, i.unit), unit].filter(Boolean).join(' ')
}

/** Zurück in eine Textzeile (für das Bearbeiten-Feld) */
export function ingredientLine(i: Ingredient): string {
  return [quantity(i), i.name].filter(Boolean).join(' ')
}

/** Name ohne Klammerzusatz und Hinweise nach dem Komma, für den Abgleich mit Bring! und den Vorräten */
export function baseName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/,| oder | zum /)[0]
    .trim()
}

/** Gehört zu den Vorräten (Salz, Öl …)? Ganze Wörter ohne Groß/klein („Vanillinzucker“ ist kein „Zucker“) */
export function isPantry(name: string, pantry: string[]): boolean {
  const n = baseName(name).toLowerCase()
  return pantry.some((p) => {
    const q = p.toLowerCase().trim()
    return q && (n === q || n.startsWith(q + ' ') || n.endsWith(' ' + q))
  })
}

/** Dauer lesbar: 45 → „45 Min“, 90 → „1½ Std“, 120 → „2 Std“ */
export function formatDuration(min: number | null | undefined): string {
  if (!min) return ''
  if (min < 60) return `${min} Min`
  const h = min / 60
  if (Number.isInteger(h)) return `${h} Std`
  if (min % 30 === 0) return `${formatAmount(h)} Std`
  return `${Math.floor(h)} Std ${min % 60} Min`
}

/** Gleiche Zutaten zusammenfassen (z. B. Mehl für Teig und Streusel): gleicher Name und gleiche Einheit → Mengen addieren */
export function mergeIngredients(list: Ingredient[]): Ingredient[] {
  const out: Ingredient[] = []
  for (const i of list) {
    const key = baseName(i.name).toLowerCase()
    const same = out.find((o) => baseName(o.name).toLowerCase() === key && o.unit === i.unit && (o.amount == null) === (i.amount == null))
    if (same) {
      if (same.amount != null && i.amount != null) same.amount += i.amount
    } else out.push({ ...i })
  }
  return out
}
