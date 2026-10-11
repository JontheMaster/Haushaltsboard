// Finanzen, Stufe 5 „Depot“: öffentliche Kurse holen. Kein Zugriff aufs Depot, nur Börsenkürzel gehen raus.
//   POST {action:'lookup', isin}   App: ISIN → Name, Xetra-Kürzel (OpenFIGI → Yahoo „.DE“), Kurs
//   POST {action:'refresh'}        App: Kurse aller eigenen/gemeinsamen Positionen jetzt holen (höchstens alle 5 Min)
//   POST {action:'check'}          App: prüfen, ob Yahoo und EODHD (Secret QUOTES_API_KEY) antworten
//   POST {action:'tick'} + x-cron-key   Cron alle 15 Min werktags: zur Xetra-Zeit (9–17:30 Berlin) und einmal
//                                        um 22 Uhr; abends zusätzlich EODHD als Rückfall für fehlende Kurse
// Quelle 1: Yahoo-Chart-Schnittstelle (inoffiziell, ohne Schlüssel, ca. 15 Min verzögert).
// Quelle 2: EODHD (kostenlos 20 Abrufe am Tag) nur für den Abendkurs, wenn Yahoo ausfällt.
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'

const db = adminClient()
const UA = { 'User-Agent': 'Mozilla/5.0 (Haushaltsboard)' }
const TZ = 'Europe/Berlin'

type Quote = { symbol: string; price: number; currency: string; at: string; closes: { day: string; close: number }[]; name?: string }

const berlin = (d = new Date()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday as string }
}
const dayOf = (unix: number) => berlin(new Date(unix * 1000)).day

/** Kurs und Tagesschlüsse von Yahoo (range z. B. 1mo, 5y) */
async function yahoo(symbol: string, range = '1mo'): Promise<Quote | null> {
  try {
    const r = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, {
      headers: UA,
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const res = (await r.json())?.chart?.result?.[0]
    const m = res?.meta
    if (!m || typeof m.regularMarketPrice !== 'number') return null
    const ts: number[] = res.timestamp ?? []
    const close: (number | null)[] = res.indicators?.quote?.[0]?.close ?? []
    const today = berlin().day
    const nowMin = berlin().minutes
    const closes = ts
      .map((t, i) => ({ day: dayOf(t), close: close[i] }))
      // heutiger Wert ist erst nach Xetra-Schluss ein Schlusskurs
      .filter((c): c is { day: string; close: number } => typeof c.close === 'number' && (c.day < today || nowMin >= 17 * 60 + 40))
    return { symbol, price: m.regularMarketPrice, currency: m.currency ?? 'EUR', at: new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(), closes, name: m.longName ?? m.shortName }
  } catch {
    return null
  }
}

/** Abendkurs von EODHD (Yahoo „EUNL.DE“ → EODHD „EUNL.XETRA“) */
async function eodhd(symbol: string): Promise<Quote | null> {
  const key = Deno.env.get('QUOTES_API_KEY')?.trim()
  if (!key) return null
  const code = symbol.replace(/\.DE$/, '.XETRA')
  try {
    const r = await fetch(`https://eodhd.com/api/real-time/${encodeURIComponent(code)}?api_token=${key}&fmt=json`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    const price = Number(d.close)
    if (!Number.isFinite(price) || price <= 0) return null
    const at = typeof d.timestamp === 'number' ? new Date(d.timestamp * 1000).toISOString() : new Date().toISOString()
    return { symbol, price, currency: 'EUR', at, closes: [{ day: berlin(new Date(at)).day, close: price }] }
  } catch {
    return null
  }
}

/** ISIN → Xetra-Kürzel: OpenFIGI (deutsche Börse, Kürzel) → Yahoo „KÜRZEL.DE“; sonst Yahoo-Suche */
async function lookup(isin: string): Promise<{ symbol: string; name: string; price: number; currency: string } | null> {
  try {
    const r = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin, exchCode: 'GR' }]),
      signal: AbortSignal.timeout(8000),
    })
    const tickers: string[] = [...new Set(((await r.json())?.[0]?.data ?? []).map((x: { ticker: string }) => x.ticker))] as string[]
    for (const t of tickers) {
      const q = await yahoo(`${t}.DE`, '5d')
      if (q) return { symbol: q.symbol, name: q.name ?? t, price: q.price, currency: q.currency }
    }
  } catch {
    // weiter mit der Suche
  }
  try {
    const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=5&newsCount=0`, { headers: UA, signal: AbortSignal.timeout(8000) })
    const quotes: { symbol: string }[] = (await r.json())?.quotes ?? []
    // Xetra bevorzugen, sonst die erste Börse
    const sorted = [...quotes].sort((a, b) => Number(b.symbol.endsWith('.DE')) - Number(a.symbol.endsWith('.DE')))
    for (const s of sorted) {
      const q = await yahoo(s.symbol, '5d')
      if (q) return { symbol: q.symbol, name: q.name ?? s.symbol, price: q.price, currency: q.currency }
    }
  } catch {
    // nichts gefunden
  }
  return null
}

/** Kurse holen und speichern; Schlusskurse nachladen, wenn für ein Symbol noch wenig Verlauf da ist */
async function refresh(symbols: string[], opts: { fallback: boolean }) {
  const { data: counts } = await db.from('fin_quotes_daily').select('symbol').in('symbol', symbols)
  const have = new Map<string, number>()
  for (const c of counts ?? []) have.set(c.symbol, (have.get(c.symbol) ?? 0) + 1)
  const updated: string[] = []
  const failed: string[] = []
  for (const symbol of symbols) {
    let q = await yahoo(symbol, (have.get(symbol) ?? 0) < 60 ? '5y' : '1mo')
    let source = 'yahoo'
    if (!q && opts.fallback) {
      q = await eodhd(symbol)
      source = 'eodhd'
    }
    if (!q) {
      failed.push(symbol)
      continue
    }
    await db.from('fin_quotes').upsert({ symbol, price: q.price, currency: q.currency, at: q.at, fetched_at: new Date().toISOString(), source })
    if (q.closes.length) await db.from('fin_quotes_daily').upsert(q.closes.map((c) => ({ symbol, day: c.day, close: c.close })))
    updated.push(symbol)
  }
  return { updated, failed }
}

async function activeSymbols(member?: string): Promise<string[]> {
  let query = db.from('fin_holdings').select('symbol, owner, household').eq('active', true).not('symbol', 'is', null)
  if (member) query = query.or(`owner.eq.${member},household.eq.true`)
  const { data } = await query
  return [...new Set((data ?? []).map((h) => h.symbol as string))]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Nur POST.' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const cronKey = req.headers.get('x-cron-key')
    if (cronKey) {
      const { data } = await db.from('push_config').select('cron_key').eq('id', 1).single()
      if (!data || cronKey !== data.cron_key) return new Response('Nicht erlaubt', { status: 403 })
      const b = berlin()
      const weekday = !['Sat', 'Sun'].includes(b.weekday)
      const trading = weekday && b.minutes >= 8 * 60 + 55 && b.minutes <= 17 * 60 + 45
      const evening = b.minutes >= 22 * 60 && b.minutes < 22 * 60 + 15
      if (!trading && !evening) return Response.json({ skipped: true })
      return Response.json(await refresh(await activeSymbols(), { fallback: evening }))
    }

    const member = await memberId(req)
    if (!member) return json(req, { ok: false, message: 'Nicht angemeldet.' }, 401)

    if (body.action === 'lookup') {
      const isin = String(body.isin ?? '').trim().toUpperCase()
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return json(req, { ok: false, message: 'Das ist keine gültige ISIN.' }, 400)
      const hit = await lookup(isin)
      return hit ? json(req, { ok: true, ...hit }) : json(req, { ok: false, message: 'Zu dieser ISIN gibt es gerade keinen Kurs. Prüf die ISIN.' }, 404)
    }

    if (body.action === 'refresh') {
      const symbols = await activeSymbols(member)
      if (!symbols.length) return json(req, { ok: true, updated: [], failed: [] })
      // höchstens alle 5 Minuten, sonst reicht der Cache
      const { data: fresh } = await db.from('fin_quotes').select('symbol, fetched_at').in('symbol', symbols)
      const stale = symbols.filter((s) => {
        const f = fresh?.find((x) => x.symbol === s)
        return !f || Date.now() - Date.parse(f.fetched_at) > 5 * 60_000
      })
      return json(req, { ok: true, ...(await refresh(stale, { fallback: false })) })
    }

    if (body.action === 'check') {
      const y = await yahoo('EUNL.DE', '5d')
      const e = Deno.env.get('QUOTES_API_KEY') ? await eodhd('EUNL.DE') : null
      return json(req, { ok: true, yahoo: y ? y.price : null, eodhd: e ? e.price : null, eodhdKey: !!Deno.env.get('QUOTES_API_KEY') })
    }

    return json(req, { ok: false, message: 'Unbekannte Aktion.' }, 400)
  } catch (e) {
    console.error(e)
    return json(req, { ok: false, message: 'Kurse gerade nicht abrufbar.' }, 502)
  }
})
