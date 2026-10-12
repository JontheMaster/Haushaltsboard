// Finanzen: CSV-Export aus dem ING-Banking importieren.
//   POST mit der Datei als Anfragetext (Kurzbefehl „Ans Haushaltsboard“ aus dem Teilen-Menü) oder als Formular-Feld,
//   Authorization: Bearer nfc_<Token> (persönlicher Kurzbefehl-Token aus dem NFC-Modul) oder die Anmeldung der App.
//   ?name=<Dateiname>  ?joint=1|0 (Gemeinschaftskonto: alles Haushalt, wird pro Konto gemerkt)  ?dry=1 (nur zählen)
// Antwort: { ok, message, total, new, duplicate, review, from, to } – message ist kurz und deutsch für die Mitteilung.
// Der Parser (_shared/finCsv.ts) entfernt IBAN, BIC, Mandate, Gläubiger-IDs und Kartenreferenzen; vom Saldo nur der neueste Stand.
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'
import { decodeCsv, findRule, parseIngCsv, safeFileName, sha256Hex, type FinRule } from '../_shared/finCsv.ts'
import { dayDiff, similarMerchant } from '../_shared/finMatch.ts'

const db = adminClient()
/** größer ist kein Monats-Export mehr */
const MAX_BYTES = 2_000_000

/** Wer ruft? Persönlicher Kurzbefehl-Token (nfc_…) oder die normale Anmeldung der App (wie in `nfc`) */
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

/** Datei aus dem Anfragetext: Formular (erstes Datei-Feld) oder der Text selbst */
async function readFile(req: Request): Promise<{ bytes: Uint8Array; name: string | null }> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await req.formData()
    for (const value of form.values()) {
      if (value instanceof File) return { bytes: new Uint8Array(await value.arrayBuffer()), name: value.name }
    }
    return { bytes: new Uint8Array(), name: null }
  }
  return { bytes: new Uint8Array(await req.arrayBuffer()), name: null }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Nur POST.' }, 405)
  try {
    const member = await caller(req)
    if (!member) return json(req, { ok: false, message: 'Token ungültig oder nicht angemeldet.' }, 401)

    const [{ data: me }, { data: profile }, { data: mod }] = await Promise.all([
      db.from('members').select('id, is_board').eq('id', member).maybeSingle(),
      db.from('fin_profiles').select('enabled, joint_accounts').eq('member', member).maybeSingle(),
      db.from('modules').select('enabled').eq('id', 'finanzen').maybeSingle(),
    ])
    if (!me || me.is_board) return json(req, { ok: false, message: 'Nur mit deinem eigenen Konto.' }, 403)
    if (mod && !mod.enabled) return json(req, { ok: false, message: 'Das Finanzen-Modul ist ausgeschaltet.' }, 403)
    if (!profile?.enabled) return json(req, { ok: false, message: 'Finanzen ist für dich noch aus. Schalt es in der App im Reiter Finanzen ein.' }, 403)

    const url = new URL(req.url)
    const { bytes, name } = await readFile(req)
    if (!bytes.length) return json(req, { ok: false, message: 'Keine Datei angekommen. Im Kurzbefehl als Anfragetext „Datei“ wählen.' }, 400)
    if (bytes.length > MAX_BYTES) return json(req, { ok: false, message: 'Die Datei ist zu groß für einen Monats-Export.' }, 413)

    const parsed = parseIngCsv(decodeCsv(bytes))
    if (!parsed.rows.length) {
      const why = parsed.skipped[0]?.reason ?? 'keine Buchungen gefunden'
      return json(req, { ok: false, message: `Das sieht nicht nach einem ING-Export aus (${why}).` }, 422)
    }

    // Gemeinschaftskonto: Wahl aus der App (joint=1/0) wird pro Konto gemerkt („Girokonto“ = ja, „-Girokonto“ = nein),
    // sonst gilt die gemerkte Wahl, beim ersten Mal entscheidet der CSV-Kopf (zwei Kontoinhaber)
    const account = parsed.account
    const remembered: string[] = profile.joint_accounts ?? []
    const jointParam = url.searchParams.get('joint')
    let joint = account ? (remembered.includes(account) ? true : remembered.includes(`-${account}`) ? false : parsed.joint) : false
    if (jointParam === '1' || jointParam === '0') joint = jointParam === '1'

    const [{ data: rules }, { data: cats }] = await Promise.all([
      db.from('fin_rules').select('id, pattern, field, category, household, owner, created_from').or(`owner.is.null,owner.eq.${member}`),
      db.from('fin_categories').select('id, kind, household_default'),
    ])
    const catOf = new Map((cats ?? []).map((c) => [c.id, c]))

    const hashes = await Promise.all(parsed.rows.map((r) => sha256Hex(r.key)))
    const known = new Set<string>()
    for (let i = 0; i < hashes.length; i += 200) {
      const { data } = await db.from('fin_transactions').select('hash').eq('owner', member).in('hash', hashes.slice(i, i + 200))
      for (const row of data ?? []) known.add(row.hash)
    }

    const hits = new Map<string, number>()
    const fresh = parsed.rows
      .map((r, i) => ({ r, hash: hashes[i] }))
      .filter(({ hash }) => !known.has(hash))
      .map(({ r, hash }) => {
        const rule = findRule((rules ?? []) as FinRule[], r, member)
        if (rule) hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1)
        const category = rule?.category ?? (r.amount > 0 ? 'einnahmen' : 'sonstiges')
        const household = joint ? true : (rule?.household ?? catOf.get(category)?.household_default ?? false)
        return {
          owner: member,
          booked_on: r.booked_on,
          booked_at: r.booked_at,
          counterparty: r.counterparty.slice(0, 120),
          purpose: r.purpose,
          kind: r.kind,
          amount: r.amount,
          currency: r.currency,
          category,
          household,
          // Ausgaben ohne Regel landen in „Zuordnen“
          needs_review: !rule && r.amount < 0,
          source: 'csv',
          status: 'booked',
          wallet: r.wallet,
          card: r.card,
          account,
          hash,
        }
      })
    // Stufe 2: Kartenzahlungen mit offenen Apple-Pay-Einträgen abgleichen (gleicher Betrag, ±3 Tage, ähnlicher Händler).
    // Treffer: aus beiden wird eine Buchung; Uhrzeit und (selbst gesetzte) Kategorie von Apple Pay bleiben, der
    // CSV-Hash kommt dazu (damit ein erneuter Import sie als „schon da“ erkennt), Status booked.
    const { data: pending } = await db
      .from('fin_transactions')
      .select('id, amount, booked_on, counterparty, needs_review')
      .eq('owner', member)
      .eq('source', 'applepay')
      .eq('status', 'pending')
    const open = [...(pending ?? [])]
    const matches: { applepay: string; csv: (typeof fresh)[number] }[] = []
    for (const t of fresh) {
      if (t.amount >= 0) continue
      const day = t.booked_at ? t.booked_at.slice(0, 10) : t.booked_on
      const i = open.findIndex((p) => Number(p.amount) === t.amount && dayDiff(p.booked_on, day) <= 3 && similarMerchant(p.counterparty, t.counterparty))
      if (i < 0) continue
      matches.push({ applepay: open[i].id, csv: t })
      open.splice(i, 1)
    }
    const matchedHashes = new Set(matches.map((m) => m.csv.hash))
    const toInsert = fresh.filter((t) => !matchedHashes.has(t.hash))

    const review = toInsert.filter((t) => t.needs_review).length
    const duplicate = parsed.rows.length - fresh.length

    if (url.searchParams.get('dry') !== '1') {
      if (toInsert.length) {
        const { error } = await db.from('fin_transactions').upsert(toInsert, { onConflict: 'owner,hash', ignoreDuplicates: true })
        if (error) throw error
      }
      for (const m of matches) {
        const ap = (pending ?? []).find((p) => p.id === m.applepay)
        await db
          .from('fin_transactions')
          .update({
            status: 'booked',
            hash: m.csv.hash,
            review_reason: null,
            card: m.csv.card,
            account: m.csv.account,
            // noch nicht zugeordnet und die Bank-Regel weiß es → Kategorie aus der CSV
            ...(ap?.needs_review && !m.csv.needs_review ? { category: m.csv.category, needs_review: false } : {}),
          })
          .eq('id', m.applepay)
      }
      for (const [id, n] of hits) {
        const { data: r } = await db.from('fin_rules').select('hits').eq('id', id).single()
        await db.from('fin_rules').update({ hits: (r?.hits ?? 0) + n }).eq('id', id)
      }
      await db.from('fin_imports').insert({
        owner: member,
        file_name: safeFileName(name ?? url.searchParams.get('name') ?? 'Umsatzanzeige.csv'),
        account,
        from: parsed.from,
        to: parsed.to,
        rows_total: parsed.rows.length,
        rows_new: fresh.length,
        rows_duplicate: duplicate,
      })
      // neuester Kontostand als Anker für den Kontoverlauf (nur ein Wert pro Konto, nur wenn neuer als der gemerkte)
      if (parsed.balance) {
        const key = account ?? 'Konto'
        const { data: had } = await db.from('fin_balances').select('as_of').eq('owner', member).eq('account', key).maybeSingle()
        if (!had || had.as_of <= parsed.balance.on)
          await db.from('fin_balances').upsert({ owner: member, account: key, amount: parsed.balance.amount, as_of: parsed.balance.on, household: joint, updated_at: new Date().toISOString() })
      }
      // Wertpapierkäufe (Sparpläne) mit echtem Datum ins Depot übernehmen (Stufe 5)
      if (fresh.some((t) => /wertpapier/i.test(t.kind))) await db.rpc('fin_link_giro_buys', { p_owner: member })
      if (account && !remembered.includes(joint ? account : `-${account}`)) {
        const next = [...remembered.filter((a) => a !== account && a !== `-${account}`), joint ? account : `-${account}`]
        await db.from('fin_profiles').update({ joint_accounts: next }).eq('member', member)
      }
    }

    const message = fresh.length
      ? `${toInsert.length} neu, ${duplicate} schon da${matches.length ? `, ${matches.length} mit Apple Pay abgeglichen` : ''}${review ? ` · ${plural(review, 'Buchung', 'Buchungen')} zum Zuordnen` : ''}`
      : `Alles schon da (${plural(parsed.rows.length, 'Buchung', 'Buchungen')})`
    return json(req, { ok: true, message, total: parsed.rows.length, new: toInsert.length, matched: matches.length, duplicate, review, from: parsed.from, to: parsed.to, joint, account })
  } catch (e) {
    console.error(e)
    return json(req, { ok: false, message: 'Import gerade nicht möglich. Probier es gleich noch mal.' }, 502)
  }
})
