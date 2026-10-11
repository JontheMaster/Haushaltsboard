// Finanzen, Stufe 5: Depotübersicht aus dem ING-Banking lesen (Browser und Edge Function, keine Imports).
// Gebaut an einem echten Export (11.10.2026): Kopf „Depotübersicht vom TT.MM.JJJJ HH:MM“, „Kunde; A, B“,
// „Depotnummer; …“ (wird nie gelesen), dann eine Tabelle mit Semikolon, deutschen Zahlen, Windows-1252.
// Mehrere Spalten heißen „Währung“: die Währung gehört jeweils zur Spalte davor.
// Die Summenzeile „Depot-Gesamtwert“ (ohne ISIN) wird übersprungen.

export type DepotPosition = {
  isin: string
  name: string
  /** Stück (Bruchstücke bei Sparplänen) */
  quantity: number
  /** Einstandskurs und -wert laut Bank (= eingezahlt) */
  cost_price: number | null
  cost_value: number | null
  /** Bewertungskurs der Bank und dessen Datum (für einen ersten Kurs, bis die Kurs-API läuft) */
  price: number | null
  price_day: string | null
  value: number | null
  currency: string
}

export type DepotParse = {
  positions: DepotPosition[]
  /** Stand der Übersicht (YYYY-MM-DD) */
  day: string | null
  /** mehr als ein Kunde im Kopf = Gemeinschaftsdepot */
  joint: boolean
  skipped: { line: number; reason: string }[]
}

function split(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ';') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function num(text: string | undefined): number | null {
  const t = (text ?? '').replace(/[%€\s]|EUR/gi, '').replace(/\./g, '').replace(',', '.')
  return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

function day(text: string | undefined): string | null {
  const m = (text ?? '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

export const isIsin = (s: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)

/** Depotübersicht lesen. Wirft nichts. */
export function parseDepotCsv(text: string): DepotParse {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const result: DepotParse = { positions: [], day: null, joint: false, skipped: [] }
  let headerAt = -1
  for (let i = 0; i < lines.length; i++) {
    const cells = split(lines[i])
    const lower = cells.map((c) => c.toLowerCase())
    if (lower.includes('isin') && lower.some((c) => c.startsWith('st'))) {
      headerAt = i
      break
    }
    if (/bersicht vom/i.test(lines[i])) result.day = day(lines[i])
    if (lower[0] === 'kunde') result.joint = (cells[1] ?? '').split(',').filter((s) => s.trim()).length > 1
  }
  if (headerAt < 0) {
    result.skipped.push({ line: 0, reason: 'Keine Kopfzeile mit „ISIN“ gefunden' })
    return result
  }
  const head = split(lines[headerAt]).map((c) => c.toLowerCase())
  const col = (test: (c: string) => boolean) => head.findIndex(test)
  const cIsin = col((c) => c === 'isin')
  const cName = col((c) => c.startsWith('wertpapiername') || c === 'name')
  const cQty = col((c) => c.startsWith('st') && c.includes('nominale'))
  const cCostPrice = col((c) => c === 'einstandskurs')
  const cCostValue = col((c) => c === 'einstandswert')
  const cPrice = col((c) => c === 'bewertungskurs' || c === 'kurs')
  const cTime = col((c) => c === 'zeit' || c === 'datum')
  const cValue = col((c) => c === 'kurswert')
  // Währung steht in der Spalte rechts neben dem Wert
  const curAfter = (i: number) => (i >= 0 && head[i + 1]?.startsWith('w') ? i + 1 : -1)

  for (let i = headerAt + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = split(lines[i])
    const isin = (cells[cIsin] ?? '').toUpperCase()
    if (!isin) continue // Summenzeile „Depot-Gesamtwert“
    const quantity = num(cells[cQty])
    if (!isIsin(isin) || quantity === null) {
      result.skipped.push({ line: i + 1, reason: 'ISIN oder Stückzahl nicht lesbar' })
      continue
    }
    const cur = curAfter(cValue) >= 0 ? cells[curAfter(cValue)] : curAfter(cPrice) >= 0 ? cells[curAfter(cPrice)] : ''
    result.positions.push({
      isin,
      name: cells[cName] ?? isin,
      quantity,
      cost_price: num(cells[cCostPrice]),
      cost_value: num(cells[cCostValue]),
      price: num(cells[cPrice]),
      price_day: day(cells[cTime]),
      value: num(cells[cValue]),
      currency: cur || 'EUR',
    })
  }
  return result
}
