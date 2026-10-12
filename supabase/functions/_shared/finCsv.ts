// Finanzen: ING-CSV-Export lesen (gemeinsam für Browser und Edge Function `finance-import`, keine Imports).
// Gebaut an einem echten ING-Export (11.10.2026): Kopfbereich mit Kontoinfos, dann eine Tabelle mit Semikolon,
// deutschen Zahlen (1.234,56) und Datumsangaben (TT.MM.JJJJ), Zeichensatz Windows-1252.
// Spalten werden über die Kopfzeile gefunden, nicht über feste Positionen.
// Datenschutz: IBAN, BIC, Mandatsreferenzen, Gläubiger-IDs und Kartenreferenzen (ARN) werden hier entfernt und
// erreichen die Datenbank nie (Spalte „Referenz“ wird gar nicht gelesen). Aus der Spalte „Saldo“ wird nur der
// neueste Stand gelesen (`balance`, Entscheidung Jonathan 12.10.2026: Kontoverlauf mit echtem Kontostand).

export type FinRow = {
  /** Buchungstag YYYY-MM-DD */
  booked_on: string
  /** Zeitpunkt der Kartenzahlung (aus „KAUFUMSATZ TT.MM … HHMMSS“), ISO mit Berliner Offset, sonst null */
  booked_at: string | null
  counterparty: string
  /** Buchungstext der Bank, z. B. Lastschrift, Gutschrift, Dauerauftrag / Terminueberweisung, Wertpapierkauf */
  kind: string
  /** bereinigt, höchstens 140 Zeichen */
  purpose: string
  /** Ausgaben negativ */
  amount: number
  currency: string
  /** Apple Pay / Google Pay, wenn die Bank es vermerkt */
  wallet: string | null
  /** letzte 4 Ziffern der Karte (für „wer hat bezahlt“ in Stufe 4), sonst null */
  card: string | null
  /** Rohdaten für den Duplikat-Hash (wird nie gespeichert, nur gehasht) */
  key: string
}

export type FinParse = {
  rows: FinRow[]
  /** Kontoname aus dem Kopf (z. B. „Girokonto“), ohne IBAN */
  account: string | null
  /** mehr als ein Kontoinhaber im Kopf („Kunde; A, B“) = Gemeinschaftskonto */
  joint: boolean
  from: string | null
  to: string | null
  /** Zeilen, die nicht gelesen werden konnten (Zeilennummer + Grund) */
  skipped: { line: number; reason: string }[]
  /** Kontostand nach der neuesten Buchung (nur dieser eine Wert), sonst null */
  balance: { amount: number; on: string } | null
}

/** Bytes → Text: zuerst UTF-8 (streng), sonst Windows-1252 (so liefert ING die Datei) */
export function decodeCsv(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text.replace(/^﻿/, '')
}

/** Eine CSV-Zeile mit Semikolon, Anführungszeichen erlaubt ("a;b" bleibt ein Feld, "" = ") */
function splitLine(line: string): string[] {
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

/** „1.234,56“ / „-21,23“ → Zahl */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[€\s]|EUR/gi, '').replace(/\./g, '').replace(',', '.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t) * 100) / 100
}

/** „05.10.2026“ → „2026-10-05“ */
function parseDate(text: string): string | null {
  const m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/** Berliner Zeit → ISO mit Offset (Sommerzeit: letzter Sonntag März bis letzter Sonntag Oktober) */
function berlinIso(day: string, hh: string, mm: string, ss: string): string {
  const [y, mo, d] = day.split('-').map(Number)
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(y, month, 0))
    return last.getUTCDate() - last.getUTCDay()
  }
  const summer = (mo > 3 && mo < 10) || (mo === 3 && d >= lastSunday(3)) || (mo === 10 && d < lastSunday(10))
  return `${day}T${hh}:${mm}:${ss}${summer ? '+02:00' : '+01:00'}`
}

/** Text von allem befreien, was nicht ins Board gehört (IBAN, BIC, Mandat, Gläubiger-ID, Referenzen, lange Nummern) */
export function scrub(text: string): string {
  return (
    text
      // beschriftete Kennungen samt Wert
      .replace(/\b(IBAN|BIC|SWIFT|MREF|EREF|KREF|CRED|Mandat(?:sref(?:erenz)?)?|Mandats-?ID|Gl(?:ä|ae)ubiger-?ID|End-?to-?End-?Ref(?:erenz)?)\s*[:.]?\s*\S+/gi, ' ')
      // IBAN ohne Beschriftung: am Stück (mind. 15 Zeichen, eine ISIN mit 12 bleibt) oder in Vierergruppen mit Ziffern
      .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, ' ')
      .replace(/\b[A-Z]{2}\d{2}(?: \d{4}){4,7}(?: \d{1,3})?\b/g, ' ')
      // SEPA-Gläubiger-ID (z. B. DE98ZZZ09999999999)
      .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{3}\d{8,}\b/g, ' ')
      // Kartenreferenz (ARN…) und Kartennummer „NR XXXX 3806“
      .replace(/\bARN\d+\b/gi, ' ')
      .replace(/\bNR\s+X+\s*\d{4}\b/gi, ' ')
      // Lastschrift-Sequenzen wie RCUR2026-10-01 / FRST / OOFF
      .replace(/\b(RCUR|FRST|OOFF|FNAL)[\d-]*\b/g, ' ')
      // lange Nummern (Vertrag, Kunde, Auftrag): ab 8 Ziffern, auch mit Bindestrichen
      .replace(/\b\d[\d-]{7,}\d\b/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/** Gegenpartei für Anzeige und Regeln: „VISA NETTO MARKEN-DISCOUNT“ → „NETTO MARKEN-DISCOUNT“ */
export function cleanCounterparty(text: string): string {
  return scrub(text.replace(/^(VISA|MASTERCARD|GIROCARD|DEBITK\.?)\s+/i, '')).replace(/\s+ft\b/, 'ft')
}

/** Gegenpartei normalisiert (für Hash und Regeln): klein, ohne Satzzeichen und Mehrfach-Leerzeichen */
export function normalizeCounterparty(text: string): string {
  return cleanCounterparty(text)
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Verwendungszweck bei Kartenzahlung kurz fassen, sonst nur bereinigen */
function cleanPurpose(raw: string, wallet: string | null): string {
  if (/KAUFUMSATZ/i.test(raw)) {
    const where = raw.match(/NR\s+X+\s*\d{4}\s+(.+?)\s+[A-Z]{2}\s+KAUFUMSATZ/i)?.[1]
    return ['Kartenzahlung', wallet, where ? where.charAt(0) + where.slice(1).toLowerCase() : null].filter(Boolean).join(' · ')
  }
  return scrub(raw).slice(0, 140)
}

/** ING-CSV lesen. Wirft nichts: unlesbare Zeilen landen in `skipped`. */
export function parseIngCsv(text: string): FinParse {
  const lines = text.split(/\r?\n/)
  const meta: Record<string, string> = {}
  let headerAt = -1
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const lower = cells.map((c) => c.toLowerCase())
    if (lower.includes('betrag') && lower.some((c) => c.startsWith('buchung'))) {
      headerAt = i
      break
    }
    if (cells.length >= 2 && cells[0]) meta[cells[0].toLowerCase()] = cells[1]
  }
  const result: FinParse = { rows: [], account: null, joint: false, from: null, to: null, skipped: [], balance: null }
  if (headerAt < 0) {
    result.skipped.push({ line: 0, reason: 'Keine Kopfzeile mit „Buchung“ und „Betrag“ gefunden' })
    return result
  }

  result.account = meta.kontoname?.trim() || null
  result.joint = (meta.kunde ?? '').split(',').filter((s) => s.trim()).length > 1
  const span = (meta.zeitraum ?? '').match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/)
  if (span) {
    result.from = parseDate(span[1])
    result.to = parseDate(span[2])
  }

  // Spalten über die Kopfzeile; „Währung“ kommt zweimal vor (nach Saldo und nach Betrag) → die nach Betrag
  const head = splitLine(lines[headerAt]).map((c) => c.toLowerCase())
  const col = (test: (c: string) => boolean, after = -1) => head.findIndex((c, i) => i > after && test(c))
  const cDate = col((c) => c === 'buchung' || c === 'buchungstag' || c === 'buchungsdatum')
  const cParty = col((c) => c.startsWith('auftraggeber') || c.startsWith('empf') || c.includes('zahlungsempf'))
  const cKind = col((c) => c === 'buchungstext')
  const cPurpose = col((c) => c.startsWith('verwendungszweck'))
  const cAmount = col((c) => c === 'betrag')
  const cCur = col((c) => c.startsWith('w'), cAmount)
  const cSaldo = col((c) => c === 'saldo')
  const saldos: { on: string; amount: number }[] = []
  if (cDate < 0 || cAmount < 0) {
    result.skipped.push({ line: headerAt + 1, reason: 'Spalten „Buchung“ oder „Betrag“ fehlen' })
    return result
  }

  const seen = new Map<string, number>()
  for (let i = headerAt + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = splitLine(lines[i])
    const booked_on = parseDate(cells[cDate] ?? '')
    const amount = parseAmount(cells[cAmount] ?? '')
    if (!booked_on || amount === null) {
      result.skipped.push({ line: i + 1, reason: 'Datum oder Betrag nicht lesbar' })
      continue
    }
    if (cSaldo >= 0) {
      const sv = parseAmount(cells[cSaldo] ?? '')
      if (sv !== null) saldos.push({ on: booked_on, amount: sv })
    }
    const rawParty = cParty >= 0 ? (cells[cParty] ?? '') : ''
    const rawPurpose = cPurpose >= 0 ? (cells[cPurpose] ?? '') : ''
    const kind = cKind >= 0 ? (cells[cKind] ?? '') : ''
    const wallet = rawPurpose.match(/\b(Apple Pay|Google Pay)\b/i)?.[1] ?? null
    const card = rawPurpose.match(/\bNR\s+X+\s*(\d{4})\b/i)?.[1] ?? null

    // Kartenzahlung: „KAUFUMSATZ 01.10 21.23 161144“ = Kauf am 1.10. um 16:11:44
    let booked_at: string | null = null
    const buy = rawPurpose.match(/KAUFUMSATZ\s+(\d{2})\.(\d{2})\s+[\d.,]+\s+(\d{2})(\d{2})(\d{2})\b/i)
    if (buy) {
      let year = Number(booked_on.slice(0, 4))
      // Kauf im Dezember, gebucht im Januar
      if (Number(buy[2]) > Number(booked_on.slice(5, 7))) year--
      booked_at = berlinIso(`${year}-${buy[2]}-${buy[1]}`, buy[3], buy[4], buy[5])
    }

    const counterparty = cleanCounterparty(rawParty) || (kind ? kind : 'Unbekannt')
    // Hash-Grundlage: Datum, Betrag, Gegenpartei und der rohe Zweck (inkl. Kartenreferenz, damit zwei gleiche
    // Einkäufe am selben Tag nicht als doppelt gelten); gleiche Zeilen in einer Datei werden durchgezählt
    const base = [booked_on, amount.toFixed(2), normalizeCounterparty(rawParty), rawPurpose.replace(/\s+/g, ' ').trim()].join('|')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)

    result.rows.push({
      booked_on,
      booked_at,
      counterparty,
      kind,
      purpose: cleanPurpose(rawPurpose, wallet),
      amount,
      currency: (cCur >= 0 ? cells[cCur] : '') || 'EUR',
      wallet,
      card,
      key: `${base}|${n}`,
    })
  }
  // neuester Saldo: ING listet die neueste Buchung zuerst; ist die Datei aufsteigend sortiert, die letzte Zeile
  if (saldos.length) {
    const newestFirst = saldos[0].on >= saldos[saldos.length - 1].on
    result.balance = newestFirst ? saldos[0] : saldos[saldos.length - 1]
  }
  if (!result.from && result.rows.length) result.from = result.rows.reduce((a, r) => (r.booked_on < a ? r.booked_on : a), result.rows[0].booked_on)
  if (!result.to && result.rows.length) result.to = result.rows.reduce((a, r) => (r.booked_on > a ? r.booked_on : a), result.rows[0].booked_on)
  return result
}

/** SHA-256 als Hex (Browser und Deno) */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Dateiname ohne IBAN („Umsatzanzeige_DE55…_20261011.csv“ → „Umsatzanzeige_20261011.csv“) */
export function safeFileName(name: string): string {
  return name.replace(/_?[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g, '').slice(0, 80)
}

// ───────── Kategorien per Regel ─────────

export type FinRule = { id: string; pattern: string; field: 'counterparty' | 'purpose' | 'kind'; category: string; household: boolean | null; owner: string | null; created_from: string }

/** Passt die Regel? Muster als Text (enthält, ohne Groß/klein) oder als /Regex/ */
function matches(rule: FinRule, value: string): boolean {
  const re = rule.pattern.match(/^\/(.+)\/([a-z]*)$/)
  if (re) {
    try {
      return new RegExp(re[1], re[2].includes('i') ? re[2] : `${re[2]}i`).test(value)
    } catch {
      return false
    }
  }
  return value.toLowerCase().includes(rule.pattern.toLowerCase())
}

/**
 * Erste passende Regel: eigene vor gemeinsamen, selbst angelegte vor mitgelieferten, längeres Muster vor kürzerem.
 * Ohne Treffer null (dann „Sonstiges“ + Zuordnen).
 */
export function findRule(rules: FinRule[], row: Pick<FinRow, 'counterparty' | 'purpose' | 'kind'>, owner: string): FinRule | null {
  const ordered = rules
    .filter((r) => r.owner === null || r.owner === owner)
    .sort(
      (a, b) =>
        Number(b.owner === owner) - Number(a.owner === owner) ||
        Number(b.created_from === 'manual') - Number(a.created_from === 'manual') ||
        b.pattern.length - a.pattern.length,
    )
  return ordered.find((r) => matches(r, r.field === 'purpose' ? row.purpose : r.field === 'kind' ? row.kind : row.counterparty)) ?? null
}
