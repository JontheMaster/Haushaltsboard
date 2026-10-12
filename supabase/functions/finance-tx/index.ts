// Finanzen Stufe 2: Apple Pay live. Die iPhone-Automation „Transaktion“ (Wallet) schickt jede Zahlung hierher.
//   POST JSON { amount, merchant, card } (Betrag, Händler, Karte aus der Kurzbefehl-Eingabe), auch als Formular,
//   Authorization: Bearer nfc_<Token> (persönlicher Kurzbefehl-Token) oder die Anmeldung der App.
// Legt eine Buchung an (source applepay, status pending, Uhrzeit jetzt, Kategorie über die Regeln); der spätere
// CSV-Import gleicht sie ab. Doppelt innerhalb von 2 Minuten (gleicher Betrag und Händler) wird ignoriert.
// Antwort: { ok, message } z. B. „REWE · 23,47 € · Lebensmittel“ für die Mitteilung am iPhone.
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'
import { findRule, sha256Hex, type FinRule } from '../_shared/finCsv.ts'
import { parseLooseAmount } from '../_shared/finMatch.ts'

const db = adminClient()
const TZ = 'Europe/Berlin'
const euro = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const berlinDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

async function caller(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (/^nfc_[0-9a-f]{48}$/.test(token)) {
    const { data } = await db.from('member_tokens').select('id, member').eq('token_hash', await sha256Hex(token)).eq('revoked', false).maybeSingle()
    if (!data) return null
    await db.from('member_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    return data.member
  }
  return memberId(req)
}

/** Anfragetext: JSON oder Formular; Feldnamen auch deutsch (Betrag, Händler, Karte) */
async function readBody(req: Request): Promise<{ amount: unknown; merchant: string; card: string }> {
  const raw = (await req.text()).trim()
  let d: Record<string, unknown> = {}
  try {
    d = JSON.parse(raw)
  } catch {
    d = Object.fromEntries(new URLSearchParams(raw))
  }
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
  return {
    amount: d.amount ?? d.Betrag ?? d.betrag,
    merchant: s(d.merchant ?? d.Händler ?? d.Haendler ?? d.haendler).slice(0, 120),
    card: s(d.card ?? d.Karte ?? d.karte).slice(0, 40),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Nur POST.' }, 405)
  try {
    const member = await caller(req)
    if (!member) return json(req, { ok: false, message: 'Token ungültig.' }, 401)
    const [{ data: me }, { data: profile }, { data: mod }] = await Promise.all([
      db.from('members').select('id, is_board').eq('id', member).maybeSingle(),
      db.from('fin_profiles').select('enabled, joint_accounts').eq('member', member).maybeSingle(),
      db.from('modules').select('enabled, config').eq('id', 'finanzen').maybeSingle(),
    ])
    if (!me || me.is_board) return json(req, { ok: false, message: 'Nur mit deinem eigenen Konto.' }, 403)
    if (mod && !mod.enabled) return json(req, { ok: false, message: 'Finanzen ist ausgeschaltet.' }, 403)
    if (!profile?.enabled) return json(req, { ok: false, message: 'Finanzen ist für dich noch aus.' }, 403)

    const { amount: rawAmount, merchant: rawMerchant, card } = await readBody(req)
    const value = parseLooseAmount(rawAmount)
    if (value === null || value === 0) return json(req, { ok: false, message: 'Kein Betrag angekommen. Im Kurzbefehl bei amount den Betrag einsetzen.' }, 400)
    const merchant = rawMerchant || 'Apple Pay'
    // Zahlungen sind Ausgaben; Erstattungen kommen mit Minus vom iPhone und werden zu Einnahmen
    const amount = typeof rawAmount === 'string' && rawAmount.trim().startsWith('-') ? Math.abs(value) : -Math.abs(value)

    // doppelt innerhalb von 2 Minuten?
    const since = new Date(Date.now() - 2 * 60_000).toISOString()
    const { data: dup } = await db
      .from('fin_transactions')
      .select('id')
      .eq('owner', member)
      .eq('source', 'applepay')
      .eq('amount', amount)
      .ilike('counterparty', merchant)
      .gte('created_at', since)
      .limit(1)
    if (dup?.length) return json(req, { ok: true, duplicate: true, message: `${merchant} · ${euro(Math.abs(amount))} · schon da` })

    const [{ data: rules }, { data: cats }] = await Promise.all([
      db.from('fin_rules').select('id, pattern, field, category, household, owner, created_from').or(`owner.is.null,owner.eq.${member}`),
      db.from('fin_categories').select('id, name, household_default'),
    ])
    const rule = findRule((rules ?? []) as FinRule[], { counterparty: merchant, purpose: '', kind: 'Apple Pay' }, member)
    const category = rule?.category ?? (amount > 0 ? 'einnahmen' : 'sonstiges')
    const cat = (cats ?? []).find((c) => c.id === category)
    // Karte am Gemeinschaftskonto (gemerkt aus dem CSV-Import) → Haushalt
    const joint = (profile.joint_accounts ?? []).some((a: string) => !a.startsWith('-'))
    const household = rule?.household ?? (joint ? true : (cat?.household_default ?? false))
    const now = new Date()
    const { error } = await db.from('fin_transactions').insert({
      owner: member,
      booked_on: berlinDay(now),
      booked_at: now.toISOString(),
      counterparty: merchant,
      purpose: ['Apple Pay', card].filter(Boolean).join(' · ').slice(0, 140),
      kind: 'Apple Pay',
      amount,
      category,
      household,
      needs_review: !rule && amount < 0,
      source: 'applepay',
      status: 'pending',
      wallet: 'Apple Pay',
      hash: `ap:${crypto.randomUUID()}`,
    })
    if (error) throw error

    // dezenter Hinweis am Board: nur Haushalt und nur wenn eingeschaltet (Standard aus)
    if (household && amount < 0 && (mod?.config as { wall_hint?: boolean } | null)?.wall_hint === true) {
      await db.from('fin_hints').insert({ text: `${cat?.name ?? 'Einkauf'} ${merchant} · ${euro(Math.abs(amount))}`.slice(0, 80) })
    }
    return json(req, { ok: true, message: `${merchant} · ${euro(Math.abs(amount))} · ${rule ? (cat?.name ?? category) : 'zum Zuordnen'}` })
  } catch (e) {
    console.error(e)
    return json(req, { ok: false, message: 'Board gerade nicht erreichbar.' }, 502)
  }
})
