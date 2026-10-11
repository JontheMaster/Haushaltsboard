import { useCallback, useEffect, useState } from 'react'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { berlinDay } from '../../lib/time'
import { decodeCsv } from '../../../supabase/functions/_shared/finCsv.ts'
import { parseDepotCsv, type DepotParse, type DepotPosition } from '../../../supabase/functions/_shared/depotCsv.ts'

export type Holding = Tables<'fin_holdings'>
export type Quote = Tables<'fin_quotes'>
export type DailyClose = Tables<'fin_quotes_daily'>

/** Positionen: eigene und gemeinsame (RLS), live */
export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('fin_holdings').select('*').eq('active', true).order('invested', { ascending: false })
    setHoldings((data ?? []) as Holding[])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`fin-holdings-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_holdings' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { holdings, reload: load }
}

/** Aktuelle Kurse und der letzte Schlusskurs vor heute (für „seit gestern“), live */
export function useQuotes(symbols: string[]) {
  const key = [...symbols].sort().join(',')
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const [prev, setPrev] = useState<Map<string, number>>(new Map())
  const load = useCallback(async () => {
    const list = key ? key.split(',') : []
    if (!list.length) return
    const today = berlinDay()
    const [{ data: q }, { data: d }] = await Promise.all([
      supabase.from('fin_quotes').select('*').in('symbol', list),
      supabase.from('fin_quotes_daily').select('symbol, day, close').in('symbol', list).lt('day', today).gte('day', addDaysIso(today, -10)).order('day', { ascending: false }),
    ])
    setQuotes(new Map((q ?? []).map((x) => [x.symbol, x as Quote])))
    const p = new Map<string, number>()
    for (const row of d ?? []) if (!p.has(row.symbol)) p.set(row.symbol, Number(row.close))
    setPrev(p)
  }, [key])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`fin-quotes-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_quotes' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { quotes, prev, reload: load }
}

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export type Lookup = { ok: boolean; symbol?: string; name?: string; price?: number; currency?: string; message?: string }

/** ISIN → Name, Xetra-Kürzel, Kurs (Edge Function depot-quotes) */
export async function lookupIsin(isin: string): Promise<Lookup> {
  const { data, error } = await supabase.functions.invoke<Lookup>('depot-quotes', { body: { action: 'lookup', isin } })
  if (data) return data
  const ctx = (error as { context?: Response } | null)?.context
  try {
    const body = ctx ? ((await ctx.json()) as Lookup) : null
    if (body?.message) return body
  } catch {
    // keine Meldung
  }
  return { ok: false, message: 'Suche gerade nicht möglich.' }
}

/** Kurse der eigenen/gemeinsamen Positionen jetzt holen (Server holt höchstens alle 5 Min neu) */
export async function refreshQuotes(): Promise<void> {
  await supabase.functions.invoke('depot-quotes', { body: { action: 'refresh' } })
}

/** Position von Hand: Kauf mit Stückzahl und Kaufkurs (oder Kaufsumme) */
export async function addPosition(p: {
  owner: string
  isin: string
  name: string
  symbol: string | null
  quantity: number
  price: number
  date: string
  household: boolean
}): Promise<{ ok: boolean; message: string }> {
  const { data: existing } = await supabase.from('fin_holdings').select('id').eq('owner', p.owner).eq('isin', p.isin).maybeSingle()
  let holdingId = existing?.id as string | undefined
  if (!holdingId) {
    const { data, error } = await supabase
      .from('fin_holdings')
      .insert({ owner: p.owner, isin: p.isin, name: p.name, symbol: p.symbol, household: p.household })
      .select('id')
      .single()
    if (error || !data) return { ok: false, message: 'Position anlegen hat nicht geklappt.' }
    holdingId = data.id
  }
  const { error } = await supabase.from('fin_holding_tx').insert({
    holding: holdingId,
    date: p.date,
    type: 'buy',
    quantity: p.quantity,
    price: p.price,
    amount: Math.round(p.quantity * p.price * 100) / 100,
    source: 'manual',
  })
  if (error) return { ok: false, message: 'Kauf speichern hat nicht geklappt.' }
  refreshQuotes()
  return { ok: true, message: `${p.name}: ${fmtQty(p.quantity)} Stück eingetragen` }
}

// ───────── Depotübersicht (CSV) ─────────

export type DepotPlanRow = {
  pos: DepotPosition
  holding: Holding | null
  /** Abweichung zur Datenbank (Stück, eingezahlt); bei neuen Positionen der ganze Bestand */
  dQty: number
  dInvested: number
  kind: 'new' | 'correction' | 'same'
}
export type DepotPlan = { parse: DepotParse; rows: DepotPlanRow[] }

export async function previewDepotImport(file: File, owner: string): Promise<DepotPlan> {
  const parse = parseDepotCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())))
  const { data } = await supabase.from('fin_holdings').select('*').eq('owner', owner)
  const mine = (data ?? []) as Holding[]
  const rows = parse.positions.map((pos): DepotPlanRow => {
    const holding = mine.find((h) => h.isin === pos.isin) ?? null
    const dQty = Math.round((pos.quantity - (holding ? Number(holding.quantity) : 0)) * 1e6) / 1e6
    const dInvested = Math.round(((pos.cost_value ?? 0) - (holding ? Number(holding.invested) : 0)) * 100) / 100
    const kind = !holding ? 'new' : Math.abs(dQty) > 1e-6 || Math.abs(dInvested) >= 0.01 ? 'correction' : 'same'
    return { pos, holding, dQty, dInvested, kind }
  })
  return { parse, rows }
}

/**
 * Depotübersicht übernehmen: neue Positionen mit Bestand laut Bank (Kürzel per Suche), bestehende per Korrektur
 * auf den Stand der Bank bringen. Gleiche Datei am selben Tag zählt nur einmal (hash).
 */
export async function applyDepotImport(plan: DepotPlan, owner: string, household: boolean): Promise<{ ok: boolean; message: string }> {
  const day = plan.parse.day ?? berlinDay()
  let added = 0
  let corrected = 0
  for (const r of plan.rows) {
    if (r.kind === 'same') continue
    let holdingId = r.holding?.id
    if (!holdingId) {
      const hit = await lookupIsin(r.pos.isin)
      const { data, error } = await supabase
        .from('fin_holdings')
        .insert({ owner, isin: r.pos.isin, name: hit.ok && hit.name ? hit.name : r.pos.name, symbol: hit.ok ? (hit.symbol ?? null) : null, household })
        .select('id')
        .single()
      if (error || !data) return { ok: false, message: `${r.pos.name} anlegen hat nicht geklappt.` }
      holdingId = data.id
    }
    const { error } = await supabase.from('fin_holding_tx').upsert(
      {
        holding: holdingId,
        date: day,
        type: r.kind === 'new' ? 'buy' : 'correction',
        quantity: r.dQty,
        price: r.kind === 'new' ? r.pos.cost_price : null,
        amount: r.dInvested,
        source: 'csv',
        hash: `depot:${day}:${r.pos.isin}`,
        note: r.kind === 'new' ? 'Bestand laut Depotübersicht' : 'Abgleich mit der Depotübersicht',
      },
      { onConflict: 'holding,hash', ignoreDuplicates: true },
    )
    if (error) return { ok: false, message: 'Speichern hat nicht geklappt.' }
    if (r.kind === 'new') added++
    else corrected++
  }
  await refreshQuotes()
  if (!added && !corrected) return { ok: true, message: 'Depot ist schon auf dem Stand der Bank' }
  return { ok: true, message: [added ? `${added} ${added === 1 ? 'Position' : 'Positionen'} neu` : '', corrected ? `${corrected} abgeglichen` : ''].filter(Boolean).join(', ') }
}

// ───────── Rechnen und Formatieren ─────────

export const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 }).format(n)
export const fmtPct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(n))} %`

export type DepotSummary = {
  value: number
  invested: number
  gain: number
  gainPct: number
  /** Veränderung seit dem letzten Schlusskurs */
  day: number
  dayPct: number
  /** jüngster Kurszeitpunkt (für „Stand 14:32“) */
  at: string | null
  missing: number
}

export function summarize(holdings: Holding[], quotes: Map<string, Quote>, prev: Map<string, number>): DepotSummary {
  let value = 0
  let invested = 0
  let before = 0
  let at: string | null = null
  let missing = 0
  for (const h of holdings) {
    const q = h.symbol ? quotes.get(h.symbol) : undefined
    const qty = Number(h.quantity)
    invested += Number(h.invested)
    if (!q) {
      // ohne Kurs zählt der Einstand, damit der Depotwert nicht einbricht
      value += Number(h.invested)
      before += Number(h.invested)
      missing++
      continue
    }
    value += qty * Number(q.price)
    before += qty * (prev.get(h.symbol!) ?? Number(q.price))
    if (!at || q.at > at) at = q.at
  }
  const gain = value - invested
  const day = value - before
  return { value, invested, gain, gainPct: invested ? (gain / invested) * 100 : 0, day, dayPct: before ? (day / before) * 100 : 0, at, missing }
}

/** „Stand 14:32“, an anderen Tagen „Stand Fr 17:30“ */
export function quoteStamp(at: string | null): string {
  if (!at) return 'noch kein Kurs'
  const d = new Date(at)
  const time = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(d)
  if (berlinDay(d) === berlinDay()) return `Stand ${time}`
  const wd = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(d).replace('.', '')
  return `Stand ${wd} ${time}`
}
