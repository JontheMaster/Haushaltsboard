// Finanzen Stufe 2: Apple Pay ↔ CSV abgleichen und Beträge aus dem Kurzbefehl lesen (keine Imports).

/** Betrag aus dem Kurzbefehl: „23,47 €“, „-23.47“, „€ 1.234,56“, 23.47 → Zahl (ohne Vorzeichen-Logik) */
export function parseLooseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  if (typeof v !== 'string') return null
  let t = v.replace(/[^\d,.\-+]/g, '')
  if (!t) return null
  // mit Komma = deutsch (1.234,56); nur Punkte: mehrere = Tausender (1.234.567), einer = Dezimal (23.47)
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const STOP = new Set(['visa', 'gmbh', 'markt', 'filiale', 'nuernberg', 'nürnberg', 'sagt', 'danke', 'und', 'der', 'die', 'das', 'de', 'apple', 'pay', 'google'])

/** Wörter eines Händlernamens zum Vergleichen (klein, ohne Zahlen, Füllwörter und Städte) */
function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-zäöüß ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

/** Ähnlicher Händler: ein gemeinsames Wort („REWE“ ↔ „REWE Markt GmbH“) oder einer beginnt mit dem anderen */
export function similarMerchant(a: string, b: string): boolean {
  const wa = words(a)
  const wb = words(b)
  if (!wa.length || !wb.length) return false
  if (wa.some((w) => wb.includes(w))) return true
  const ja = wa.join('')
  const jb = wb.join('')
  return ja.startsWith(jb.slice(0, 5)) || jb.startsWith(ja.slice(0, 5))
}

/** Tage zwischen zwei YYYY-MM-DD */
export function dayDiff(a: string, b: string): number {
  return Math.abs((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400_000)
}
