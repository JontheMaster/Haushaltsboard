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

/**
 * Mitteilung von Google Wallet lesen (Android, MacroDroid schickt Titel und Text):
 *   Titel „KALCHREUTHER FILIALE 70“, Text „6,20 € mit ♡“ → Händler, Betrag, Karte.
 * Betrag: erste Zahl mit € oder EUR davor/dahinter. Erstattung, wenn „Erstattung/Gutschrift/zurück“ oder Minus davor.
 * Ohne Betrag (z. B. Ticket- oder Kundenkarten-Mitteilung) → null.
 */
export function parseNotification(title: string, text: string): { amount: number; refund: boolean; merchant: string; card: string } | null {
  const t = `${text}`.replace(/\u00a0/g, ' ').trim()
  const m =
    t.match(/([-−–]?)\s*(\d{1,3}(?:[.\s]\d{3})*,\d{1,2}|\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i) ??
    t.match(/(?:€|EUR)\s*([-−–]?)\s*(\d{1,3}(?:[.\s]\d{3})*,\d{1,2}|\d+(?:[.,]\d{1,2})?)/i)
  if (!m) return null
  const amount = parseLooseAmount(m[2].replace(/\s/g, ''))
  if (amount === null || amount === 0) return null
  const refund = !!m[1] || /erstatt|gutschrift|zurück|zurueck/i.test(t)
  const card = (t.match(/\bmit\s+(.+)$/i)?.[1] ?? '').trim().slice(0, 40)
  // Händler: Titel; fehlt er, der Text vor dem Betrag („REWE: 6,20 €“)
  const merchant = (title.trim() || t.slice(0, m.index).replace(/[:·\-–]+\s*$/, '').trim()).slice(0, 120)
  return { amount, refund, merchant, card }
}
