import {
  ArrowDownLeft,
  ArrowLeftRight,
  Bike,
  Bus,
  Gift,
  HeartPulse,
  House,
  KeyRound,
  PartyPopper,
  Repeat,
  Shapes,
  Shirt,
  ShoppingCart,
  SprayCan,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { decodeCsv, findRule, parseIngCsv, sha256Hex, type FinParse, type FinRule } from '../../../supabase/functions/_shared/finCsv.ts'

export type FinCategory = Tables<'fin_categories'>
export type FinTx = Tables<'fin_transactions'>
export type FinProfile = Tables<'fin_profiles'>

/** Lucide-Symbole der Kategorien (Name steht in fin_categories.icon) */
const ICONS: Record<string, LucideIcon> = {
  ShoppingCart,
  SprayCan,
  House,
  KeyRound,
  Zap,
  Bus,
  UtensilsCrossed,
  Bike,
  PartyPopper,
  Repeat,
  HeartPulse,
  Shirt,
  Gift,
  Shapes,
  ArrowDownLeft,
  ArrowLeftRight,
}
export const iconOf = (name: string): LucideIcon => ICONS[name] ?? Shapes

/** „-1234.5“ → „−1.234,50 €“ (Minus als echtes Minuszeichen) */
export function euro(n: number, sign = false): string {
  const s = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(n))
  return n < 0 ? `−${s}` : sign && n > 0 ? `+${s}` : s
}

/** Eigenes Finanzen-Profil (eingeschaltet? gemeinsame Konten), live */
export function useFinProfile(memberId: string) {
  const [profile, setProfile] = useState<FinProfile | null | undefined>(undefined)
  const load = useCallback(async () => {
    const { data } = await supabase.from('fin_profiles').select('*').eq('member', memberId).maybeSingle()
    setProfile(data ?? null)
  }, [memberId])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`fin-profile-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_profiles' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { profile, reload: load }
}

export async function setFinEnabled(memberId: string, enabled: boolean): Promise<boolean> {
  const { error } = await supabase.from('fin_profiles').upsert({ member: memberId, enabled })
  return !error
}

export async function setJointAccounts(memberId: string, accounts: string[]): Promise<boolean> {
  const { error } = await supabase.from('fin_profiles').update({ joint_accounts: accounts }).eq('member', memberId)
  return !error
}

let categoryCache: FinCategory[] | null = null

export function useFinCategories(): FinCategory[] | null {
  const [cats, setCats] = useState<FinCategory[] | null>(categoryCache)
  useEffect(() => {
    supabase
      .from('fin_categories')
      .select('*')
      .order('sort')
      .then(({ data }) => {
        categoryCache = (data ?? []) as FinCategory[]
        setCats(categoryCache)
      })
  }, [])
  return cats
}

/** Buchungen: eigene und Haushalt (RLS), neueste zuerst, live */
export function useTransactions(limit = 60) {
  const [txs, setTxs] = useState<FinTx[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('fin_transactions').select('*').order('booked_on', { ascending: false }).order('booked_at', { ascending: false, nullsFirst: false }).limit(limit)
    setTxs((data ?? []) as FinTx[])
  }, [limit])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`fin-tx-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_transactions' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { txs, reload: load }
}

/** Eigene Buchungen ohne sichere Kategorie (für „Zuordnen“), älteste zuerst */
export function useReviewQueue(memberId: string) {
  const [queue, setQueue] = useState<FinTx[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('fin_transactions').select('*').eq('owner', memberId).eq('needs_review', true).order('booked_on')
    setQueue((data ?? []) as FinTx[])
  }, [memberId])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`fin-review-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_transactions' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { queue, reload: load }
}

export function useLastImport(memberId: string) {
  const [last, setLast] = useState<Tables<'fin_imports'> | null | undefined>(undefined)
  useEffect(() => {
    supabase
      .from('fin_imports')
      .select('*')
      .eq('owner', memberId)
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLast(data ?? null))
  }, [memberId])
  return last
}

/** Kategorie (und Haushalt) einer Buchung setzen; sie ist danach nicht mehr in „Zuordnen“ */
export async function assignTx(id: string, patch: { category?: string; household?: boolean }): Promise<boolean> {
  const { error } = await supabase
    .from('fin_transactions')
    .update({ ...patch, needs_review: false })
    .eq('id', id)
  return !error
}

/**
 * „Immer so für …?“: eigene Regel für die Gegenpartei anlegen und alle eigenen offenen Buchungen dieser
 * Gegenpartei gleich mit zuordnen. Gibt die Zahl der mit erledigten Buchungen zurück.
 */
export async function ruleForCounterparty(memberId: string, tx: FinTx, category: string, household: boolean | null): Promise<number> {
  const pattern = tx.counterparty.trim().slice(0, 120)
  const { error } = await supabase.from('fin_rules').insert({ pattern, field: 'counterparty', category, household, owner: memberId, created_from: 'manual' })
  if (error) return -1
  const { data } = await supabase
    .from('fin_transactions')
    .update({ category, needs_review: false, ...(household === null ? {} : { household }) })
    .eq('owner', memberId)
    .eq('needs_review', true)
    .eq('counterparty', tx.counterparty)
    .neq('id', tx.id)
    .select('id')
  return data?.length ?? 0
}

// ───────── Import ─────────

export type ImportPreview = {
  parse: FinParse
  total: number
  fresh: number
  duplicate: number
  review: number
  spent: number
  earned: number
  /** Gemeinschaftskonto (gemerkt oder laut CSV-Kopf) */
  joint: boolean
}

/** Vorschau im Browser: gleiche Rechnung wie der Server, aber ohne zu speichern */
export async function previewImport(file: File, memberId: string, profile: FinProfile | null): Promise<ImportPreview> {
  const parse = parseIngCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())))
  const hashes = await Promise.all(parse.rows.map((r) => sha256Hex(r.key)))
  const known = new Set<string>()
  for (let i = 0; i < hashes.length; i += 150) {
    const { data } = await supabase.from('fin_transactions').select('hash').eq('owner', memberId).in('hash', hashes.slice(i, i + 150))
    for (const row of data ?? []) known.add(row.hash)
  }
  const [{ data: rules }, { data: cats }] = await Promise.all([
    supabase.from('fin_rules').select('id, pattern, field, category, household, owner, created_from'),
    supabase.from('fin_categories').select('id, kind'),
  ])
  const kindOf = new Map((cats ?? []).map((c) => [c.id, c.kind]))
  let review = 0
  let spent = 0
  let earned = 0
  parse.rows.forEach((r, i) => {
    if (known.has(hashes[i])) return
    const rule = findRule((rules ?? []) as FinRule[], r, memberId)
    if (!rule && r.amount < 0) review++
    // Umbuchungen (z. B. Wertpapierkauf) zählen nicht als Ausgabe
    if (rule && kindOf.get(rule.category) === 'transfer') return
    if (r.amount < 0) spent += r.amount
    else earned += r.amount
  })
  // wie der Server: gemerkte Wahl („Girokonto“ / „-Girokonto“), sonst der CSV-Kopf (zwei Kontoinhaber)
  const remembered = profile?.joint_accounts ?? []
  const a = parse.account
  const joint = a ? (remembered.includes(a) ? true : remembered.includes(`-${a}`) ? false : parse.joint) : false
  return { parse, total: parse.rows.length, fresh: parse.rows.length - known.size, duplicate: known.size, review, spent, earned, joint }
}

/** Datei an `finance-import` schicken (dieselbe Stelle wie der Teilen-Kurzbefehl) */
export async function runImport(file: File, joint: boolean): Promise<{ ok: boolean; message: string }> {
  const name = encodeURIComponent(file.name)
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; message: string }>(`finance-import?joint=${joint ? 1 : 0}&name=${name}`, {
    body: file,
    headers: { 'Content-Type': 'text/csv' },
  })
  if (data?.message) return data
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx) {
    try {
      const body = (await ctx.json()) as { message?: string }
      if (body.message) return { ok: false, message: body.message }
    } catch {
      // keine Meldung im Body
    }
  }
  return { ok: false, message: 'Import gerade nicht möglich. Probier es gleich noch mal.' }
}

export const FINANCE_IMPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-import`
export const FINANCE_TX_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-tx`
