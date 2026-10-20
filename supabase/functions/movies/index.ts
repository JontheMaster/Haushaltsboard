// Filme (docs/filme-modul.md): gemeinsame Merkliste für Filme und Serien. Daten von TMDB, Streaming von JustWatch (über TMDB).
//   POST { url | text }                  → Link oder Text teilen (Kurzbefehl „Film merken“, HTTP Shortcuts am Android):
//                                           Film erkennen und merken; Antwort „Dune: Part Two (2024) gemerkt“
//   POST { action: 'search', q }         → Suche (App), Filme und Serien mit Poster
//   POST { action: 'add', tmdb_id, kind } → aus der Suche merken (oder nur eigene Stimme ergänzen)
//   POST { action: 'resolve', id, tmdb_id, kind } → Eintrag „prüfen“ auf einen der Vorschläge festlegen
//   POST { action: 'refresh', id }       → Daten und Streaming eines Films neu holen
//   POST { action: 'providers' }         → Streamingdienste in Deutschland (für die Einstellungen)
//   POST { action: 'weekly' } + x-cron-key → einmal pro Woche: Streaming prüfen, „jetzt bei …“ melden, alte Daten auffrischen
// Authorization: Bearer nfc_<Token> (Kurzbefehl) oder die Anmeldung der App. Mit Token kommt die Antwort als Text.
// Secret TMDB_API_KEY = „API Read Access Token“ von themoviedb.org.
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'
import { APP_URL, phonesOf, pushTo } from '../_shared/push.ts'

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const db = adminClient()
const TMDB = 'https://api.themoviedb.org/3'
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Haushaltsboard/1.0; privates Haushalts-Dashboard)' }
/** TMDB erlaubt höchstens 6 Monate Zwischenspeicher: nach 5 Monaten neu holen */
const DETAILS_MAX_AGE_DAYS = 150

type Kind = 'movie' | 'tv'
type Provider = { id: number; name: string; logo: string | null }
type Providers = { flatrate?: Provider[]; rent?: Provider[]; buy?: Provider[]; link?: string }
type Candidate = { tmdb_id: number; kind: Kind; title: string; year: number | null; poster_path: string | null; overview: string; popularity?: number }

// ───────── TMDB ─────────

async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  const key = Deno.env.get('TMDB_API_KEY')?.trim()
  if (!key) throw new Error('Secret TMDB_API_KEY fehlt')
  // langer „API Read Access Token“ (JWT) als Bearer, kurzer „API-Schlüssel“ (32 Zeichen) als api_key in der Adresse
  const short = /^[0-9a-f]{32}$/i.test(key)
  const url = `${TMDB}${path}?${new URLSearchParams({ language: 'de-DE', ...params, ...(short ? { api_key: key } : {}) })}`
  const headers: Record<string, string> = { Accept: 'application/json', ...(short ? {} : { Authorization: `Bearer ${key}` }) }
  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`TMDB ${resp.status} ${path}`)
  return resp.json()
}

const yearOf = (d: string | undefined) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null)

function toCandidate(r: any, kind?: Kind): Candidate | null {
  const k: Kind | undefined = kind ?? (r.media_type === 'tv' ? 'tv' : r.media_type === 'movie' ? 'movie' : undefined)
  if (!k) return null
  return {
    tmdb_id: r.id,
    kind: k,
    title: (k === 'tv' ? r.name : r.title) ?? '',
    year: yearOf(k === 'tv' ? r.first_air_date : r.release_date),
    poster_path: r.poster_path ?? null,
    overview: (r.overview ?? '').slice(0, 300),
    popularity: Number(r.popularity) || 0,
  }
}

async function search(q: string, year?: number | null): Promise<Candidate[]> {
  const data = await tmdb('/search/multi', { query: q, include_adult: 'false', page: '1' })
  let list = (data.results ?? []).map((r: any) => toCandidate(r)).filter((c: Candidate | null): c is Candidate => !!c && !!c.title)
  if (year) {
    // mit Jahr: passende zuerst
    list = [
      ...list.filter((c: Candidate) => c.year && Math.abs(c.year - year) <= 1),
      ...list.filter((c: Candidate) => !(c.year && Math.abs(c.year - year) <= 1)),
    ]
  }
  return list.slice(0, 8)
}

/** Streaming in Deutschland (Daten von JustWatch) */
async function providersOf(kind: Kind, id: number): Promise<Providers> {
  const data = await tmdb(`/${kind}/${id}/watch/providers`, {})
  const de = data.results?.DE
  if (!de) return {}
  const map = (list: any[] | undefined) =>
    list?.length ? list.map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null })) : undefined
  return { flatrate: map(de.flatrate), rent: map(de.rent), buy: map(de.buy), link: de.link }
}

/** Alle Daten eines Films/einer Serie für die Tabelle movies */
async function details(kind: Kind, id: number) {
  const d = await tmdb(`/${kind}/${id}`, {})
  let overview: string = d.overview ?? ''
  if (!overview) {
    // keine deutsche Beschreibung: englische nehmen
    overview = (await tmdb(`/${kind}/${id}`, { language: 'en-US' }).catch(() => ({})))?.overview ?? ''
  }
  const runtime: number | null =
    kind === 'movie'
      ? d.runtime || null
      : (d.episode_run_time?.length
          ? Math.round(d.episode_run_time.reduce((a: number, b: number) => a + b, 0) / d.episode_run_time.length)
          : d.last_episode_to_air?.runtime) || null
  return {
    tmdb_id: id,
    kind,
    title: ((kind === 'tv' ? d.name : d.title) ?? '').slice(0, 200) || 'Ohne Titel',
    original_title: (kind === 'tv' ? d.original_name : d.original_title) ?? null,
    year: yearOf(kind === 'tv' ? d.first_air_date : d.release_date),
    runtime,
    genres: (d.genres ?? []).map((g: any) => g.name),
    genre_ids: (d.genres ?? []).map((g: any) => g.id),
    poster_path: d.poster_path ?? null,
    backdrop_path: d.backdrop_path ?? null,
    overview: overview.slice(0, 600),
    rating_tmdb: d.vote_count >= 20 ? Math.round(d.vote_average * 10) / 10 : null,
    providers: await providersOf(kind, id).catch(() => ({})),
    providers_checked_at: new Date().toISOString(),
    details_at: new Date().toISOString(),
  }
}

// ───────── Merken ─────────

type AddResult = { ok: boolean; message: string; id?: string; already?: boolean }

const label = (m: { title: string; year: number | null }) => `${m.title}${m.year ? ` (${m.year})` : ''}`

/** Film merken; ist er schon da, nur die eigene Stimme ergänzen (oder von „verworfen“ zurückholen) */
async function addMovie(member: string, kind: Kind, tmdbId: number, sourceUrl: string | null, replaceId?: string): Promise<AddResult> {
  const { data: existing } = await db.from('movies').select('id, title, year, status').eq('kind', kind).eq('tmdb_id', tmdbId).maybeSingle()
  if (existing) {
    if (replaceId && replaceId !== existing.id) await db.from('movies').delete().eq('id', replaceId).eq('status', 'pruefen')
    if (existing.status === 'verworfen') await db.from('movies').update({ status: 'merkliste' }).eq('id', existing.id)
    await vote(existing.id, member)
    const where = existing.status === 'gesehen' ? 'Schon gesehen' : 'Schon auf der Liste'
    return { ok: true, id: existing.id, already: true, message: `${where}: ${label(existing)}` }
  }
  const row = await details(kind, tmdbId)
  let id: string
  if (replaceId) {
    const { error } = await db
      .from('movies')
      .update({ ...row, status: 'merkliste', candidates: null })
      .eq('id', replaceId)
    if (error) throw error
    id = replaceId
  } else {
    const { data, error } = await db
      .from('movies')
      .insert({ ...row, source_url: sourceUrl, added_by: member })
      .select('id')
      .single()
    if (error) throw error
    id = data.id
  }
  await vote(id, member)
  return { ok: true, id, message: `${label(row)} gemerkt` }
}

/** eigene Stimme „gerne“, wenn noch keine da ist */
async function vote(movieId: string, member: string) {
  const { data: me } = await db.from('members').select('is_board').eq('id', member).maybeSingle()
  if (me?.is_board) return
  await db.from('movie_votes').upsert({ movie_id: movieId, member, want: 'gerne' }, { onConflict: 'movie_id,member', ignoreDuplicates: true })
}

// ───────── Links und Text erkennen ─────────

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Trailer-Titel und Seitentitel aufräumen: „DUNE: PART TWO | Official Trailer 3 (2024)“ → „DUNE: PART TWO“ */
function cleanTitle(s: string): { q: string; year: number | null } {
  let t = s.replace(/\s+/g, ' ').trim()
  const year = t.match(/\((19|20)\d{2}\)|\b(19|20)\d{2}\b/)
  t = t
    .split(/\s[|–—-]\s|\s·\s|\s\|\s?/)[0]
    .replace(
      /\b(official|offizieller?|final|teaser|trailer|deutsch|german|ger|hd|4k|uhd|ov|omu|staffel \d+|season \d+|kritik|review|film|serie|movie|series)\b/gi,
      ' ',
    )
    .replace(/\((19|20)\d{2}\)/g, ' ')
    .replace(/\b(19|20)\d{2}\b$/, ' ')
    .replace(/\s+on (letterboxd|justwatch|imdb).*$/i, '')
    .replace(/\s*[-–|:]\s*(imdb|letterboxd|justwatch|netflix|prime video|disney\+?).*$/i, '')
    .replace(/[#@][\p{L}\d_]+/gu, ' ')
    .replace(/[^\p{L}\p{N}:'&!?.,\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { q: t.slice(0, 100), year: year ? Number(year[0].replace(/\D/g, '')) : null }
}

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { ...UA, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(8_000) })
  if (!resp.ok) throw new Error(`${resp.status}`)
  return (await resp.text()).slice(0, 600_000)
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

function metaTitle(html: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  const title = og?.[1] ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  return title ? decode(title).trim() : null
}

type Found = { kind: Kind; tmdb_id: number } | { query: string; year: number | null } | null

/** IMDb-Nummer → TMDB */
async function fromImdb(tt: string): Promise<{ kind: Kind; tmdb_id: number } | null> {
  const data = await tmdb(`/find/${tt}`, { external_source: 'imdb_id' })
  if (data.movie_results?.[0]) return { kind: 'movie', tmdb_id: data.movie_results[0].id }
  if (data.tv_results?.[0]) return { kind: 'tv', tmdb_id: data.tv_results[0].id }
  return null
}

function tmdbLink(s: string): { kind: Kind; tmdb_id: number } | null {
  const m = s.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i)
  return m ? { kind: m[1].toLowerCase() as Kind, tmdb_id: Number(m[2]) } : null
}

/** Aus einem geteilten Link oder Text einen Film bestimmen (oder einen Suchbegriff) */
async function identify(input: string): Promise<Found> {
  const url = input.match(/https?:\/\/[^\s<>"]+/)?.[0]
  const rest = url ? input.replace(url, ' ').trim() : input.trim()
  const direct = tmdbLink(input)
  if (direct) return direct
  const tt = input.match(/\btt\d{6,9}\b/)?.[0]
  if (tt) {
    const hit = await fromImdb(tt)
    if (hit) return hit
  }
  if (url) {
    const host = new URL(url).hostname.replace(/^www\./, '')
    // YouTube: Titel über oEmbed (ohne die Seite zu laden)
    if (/youtube\.com|youtu\.be/.test(host)) {
      const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6_000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      if (o?.title) {
        const c = cleanTitle(o.title)
        if (c.q) return { query: c.q, year: c.year }
      }
    }
    // Seite laden: TMDB-Link (Letterboxd), IMDb-Nummer (JustWatch, viele andere), sonst der Seitentitel
    const html = await fetchText(url).catch(() => '')
    if (html) {
      const t = tmdbLink(html)
      if (t) return t
      const id = html.match(/imdb\.com\/title\/(tt\d{6,9})/)?.[1] ?? html.match(/"(tt\d{7,9})"/)?.[1]
      if (id) {
        const hit = await fromImdb(id).catch(() => null)
        if (hit) return hit
      }
      const title = metaTitle(html)
      if (title && !/^(instagram|tiktok|youtube|login|anmelden)/i.test(title)) {
        const c = cleanTitle(title)
        if (c.q) return { query: c.q, year: c.year }
      }
    }
    // Letterboxd / JustWatch ohne Seite: Titel aus dem Link („/film/dune-part-two-2024/“)
    const slug = url.match(/\/(?:film|serie|tv-show|movie|tv)\/([a-z0-9-]+)/i)?.[1]
    if (slug) {
      const year = slug.match(/-((?:19|20)\d{2})$/)?.[1]
      return { query: slug.replace(/-((?:19|20)\d{2})$/, '').replace(/-/g, ' '), year: year ? Number(year) : null }
    }
  }
  if (rest) {
    // Text (z. B. Beschreibung aus Instagram/TikTok): erste Zeile, aufgeräumt
    const c = cleanTitle(rest.split(/\n/)[0])
    if (c.q.length >= 2) return { query: c.q, year: c.year }
  }
  return null
}

/** Eindeutig, wenn genau ein Treffer genau so heißt (bei mehreren: das Jahr passt) */
function confident(q: string, year: number | null, list: Candidate[]): Candidate | null {
  if (!list.length) return null
  const exact = list.filter((c) => norm(c.title) === norm(q))
  if (year) {
    const withYear = (exact.length ? exact : list).filter((c) => c.year === year)
    if (withYear.length === 1) return withYear[0]
  }
  if (exact.length === 1) return exact[0]
  // mehrere gleichen Namens (z. B. „Oppenheimer“): der weitaus bekannteste gewinnt
  if (exact.length > 1) {
    const [a, b] = [...exact].sort((x, y) => (y.popularity ?? 0) - (x.popularity ?? 0))
    if ((a.popularity ?? 0) >= 3 * (b.popularity ?? 0)) return a
  }
  if (list.length === 1) return list[0]
  return null
}

// Füllwörter aus Sätzen wie „Wir sollten unbedingt Oppenheimer schauen“
const FILLER =
  /\b(wir|ich|du|ihr|sollten|sollen|müssen|muss|unbedingt|mal|mal wieder|noch|schauen|anschauen|gucken|angucken|ansehen|sehen|den|die|das|der|film|serie|movie|neue[nrs]?|bitte|auch|endlich|heute|abend|morgen|unbedingt|schaut|guckt)\b/gi

async function share(member: string, input: string): Promise<AddResult> {
  const found = await identify(input)
  if (!found) return { ok: false, message: 'Darin habe ich keinen Film gefunden.' }
  const url = input.match(/https?:\/\/[^\s<>"]+/)?.[0] ?? null
  if ('tmdb_id' in found) return addMovie(member, found.kind, found.tmdb_id, url)
  let list = await search(found.query, found.year)
  if (!list.length) {
    // ganzer Satz findet nichts: ohne Füllwörter nochmal
    const short = found.query.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
    if (short && short !== found.query) {
      list = await search(short, found.year)
      found.query = short
    }
  }
  const hit = confident(found.query, found.year, list)
  if (hit) return addMovie(member, hit.kind, hit.tmdb_id, url)
  if (!list.length) return { ok: false, message: `Nichts gefunden zu „${found.query}“.` }
  // unsicher: Eintrag „prüfen“ mit 3 Vorschlägen, in der App einmal antippen
  const candidates = list.slice(0, 3)
  const { data, error } = await db
    .from('movies')
    .insert({ title: found.query.slice(0, 200), year: found.year, status: 'pruefen', candidates, source_url: url, added_by: member })
    .select('id')
    .single()
  if (error) throw error
  return { ok: true, id: data.id, message: `„${found.query}“ gemerkt, in der App einmal den richtigen Film antippen.` }
}

// ───────── Wöchentlich: Streaming prüfen ─────────

const serviceKey = (s: string) =>
  norm(s)
    .replace(/\b(plus|with ads|mit werbung|basic|standard)\b/g, '')
    .replace(/\s+/g, '')

function onOurs(p: Providers, services: string[]): string[] {
  // Name des eigenen Dienstes, nicht der Variante („Netflix Standard with Ads“ → „Netflix“)
  return services.filter((s) => (p.flatrate ?? []).some((f) => serviceKey(f.name).startsWith(serviceKey(s))))
}

async function weekly() {
  const { data: mod } = await db.from('modules').select('enabled, config').eq('id', 'filme').maybeSingle()
  if (mod && !mod.enabled) return { skipped: true }
  const config = (mod?.config ?? {}) as { services?: string[]; push?: string[] }
  const services = config.services ?? []
  await db
    .from('movie_hints')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())

  const { data: movies } = await db.from('movies').select('id, kind, tmdb_id, title, year, status, providers, details_at').not('tmdb_id', 'is', null)
  let checked = 0
  let refreshed = 0
  const news: { id: string; text: string }[] = []
  for (const m of movies ?? []) {
    try {
      const old = (m.details_at ? Date.now() - Date.parse(m.details_at) : Infinity) > DETAILS_MAX_AGE_DAYS * 86400000
      if (old) {
        // TMDB-Bedingung: höchstens 6 Monate zwischenspeichern
        const row = await details(m.kind as Kind, m.tmdb_id!)
        await db.from('movies').update(row).eq('id', m.id)
        refreshed++
        if (m.status === 'merkliste') collect(m, m.providers as Providers, row.providers as Providers)
        continue
      }
      if (m.status !== 'merkliste') continue
      const p = await providersOf(m.kind as Kind, m.tmdb_id!)
      await db.from('movies').update({ providers: p, providers_checked_at: new Date().toISOString() }).eq('id', m.id)
      checked++
      collect(m, m.providers as Providers, p)
    } catch (e) {
      console.error('Film nicht geprüft', m.id, e)
    }
  }

  function collect(m: { id: string; title: string }, before: Providers, after: Providers) {
    const was = new Set(onOurs(before ?? {}, services))
    const now = onOurs(after ?? {}, services).filter((s) => !was.has(s))
    if (now.length) news.push({ id: m.id, text: `${m.title} jetzt bei ${now.join(' und ')}` })
  }

  if (news.length) {
    await db.from('movie_hints').insert(news.map((n) => ({ movie_id: n.id, text: n.text })))
    const push = config.push ?? []
    if (push.length) {
      const body =
        news.length === 1
          ? news[0].text
          : `${news
              .slice(0, 3)
              .map((n) => n.text)
              .join(' · ')}${news.length > 3 ? ` und ${news.length - 3} mehr` : ''}`
      await pushTo(await phonesOf(push), {
        title: news.length === 1 ? 'Neu bei euren Diensten' : `${news.length} Filme neu bei euren Diensten`,
        body,
        tag: 'filme-neu',
        url: `${APP_URL}?filme`,
      })
    }
  }
  return { checked, refreshed, news: news.length }
}

// ───────── Anfrage ─────────

async function caller(req: Request): Promise<{ member: string; token: boolean } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (/^nfc_[0-9a-f]{48}$/.test(token)) {
    const { data } = await db
      .from('member_tokens')
      .select('id, member')
      .eq('token_hash', await sha256Hex(token))
      .eq('revoked', false)
      .maybeSingle()
    if (!data) return null
    await db.from('member_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    return { member: data.member, token: true }
  }
  const member = await memberId(req)
  return member ? { member, token: false } : null
}

/** Anfragetext: JSON, Formular oder nur Text (geteilter Link) */
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const raw = (await req.text()).trim()
  if (!raw) return {}
  try {
    const d = JSON.parse(raw)
    if (d && typeof d === 'object') return d
    return { text: String(d) }
  } catch {
    // Formular nur, wenn es wie eins aussieht (sonst ist ein geteilter Link mit „?a=b“ kein Formular)
    if (/^(url|text|link|action)=/i.test(raw)) return Object.fromEntries(new URLSearchParams(raw))
    return { text: raw }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Nur POST.' }, 405)
  let asText = false
  const reply = (body: { ok: boolean; message?: string; [k: string]: unknown }, status = 200) =>
    asText
      ? new Response(body.message ?? (body.ok ? 'OK' : 'Fehler'), { status, headers: { ...corsHeaders(req), 'Content-Type': 'text/plain; charset=utf-8' } })
      : json(req, body, status)
  try {
    const cronKey = req.headers.get('x-cron-key')
    if (cronKey) {
      const { data } = await db.from('push_config').select('cron_key').eq('id', 1).single()
      if (!data || cronKey !== data.cron_key) return new Response('Nicht erlaubt', { status: 403 })
      const body = await readBody(req)
      if (body.action === 'weekly') return Response.json(await weekly())
      return new Response('Unbekannte Aktion', { status: 400 })
    }

    const who = await caller(req)
    if (!who) return json(req, { ok: false, message: 'Token ungültig oder nicht angemeldet.' }, 401)
    asText = who.token
    const { data: mod } = await db.from('modules').select('enabled').eq('id', 'filme').maybeSingle()
    if (mod && !mod.enabled) return reply({ ok: false, message: 'Filme ist ausgeschaltet.' }, 403)

    const body = await readBody(req)
    const action = typeof body.action === 'string' ? body.action : 'share'
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
    const kindOf = (v: unknown): Kind => (v === 'tv' ? 'tv' : 'movie')

    if (action === 'share') {
      const input = [str(body.url ?? body.link), str(body.text ?? body.Text)].filter(Boolean).join(' ').slice(0, 2000)
      if (!input) return reply({ ok: false, message: 'Nichts angekommen. Im Kurzbefehl die Eingabe als Text schicken.' }, 400)
      return reply(await share(who.member, input))
    }
    if (action === 'search') {
      const q = str(body.q).slice(0, 100)
      if (q.length < 2) return reply({ ok: true, results: [] })
      return reply({ ok: true, results: await search(q) })
    }
    if (action === 'add') {
      const id = Number(body.tmdb_id)
      if (!id) return reply({ ok: false, message: 'Film fehlt.' }, 400)
      return reply(await addMovie(who.member, kindOf(body.kind), id, null))
    }
    if (action === 'resolve') {
      const id = Number(body.tmdb_id)
      const row = str(body.id)
      if (!id || !row) return reply({ ok: false, message: 'Film fehlt.' }, 400)
      return reply(await addMovie(who.member, kindOf(body.kind), id, null, row))
    }
    if (action === 'refresh') {
      const { data: m } = await db.from('movies').select('id, kind, tmdb_id').eq('id', str(body.id)).maybeSingle()
      if (!m?.tmdb_id) return reply({ ok: false, message: 'Film nicht gefunden.' }, 404)
      await db
        .from('movies')
        .update(await details(m.kind as Kind, m.tmdb_id))
        .eq('id', m.id)
      return reply({ ok: true, message: 'Aktualisiert' })
    }
    if (action === 'providers') {
      const data = await tmdb('/watch/providers/movie', { watch_region: 'DE' })
      const list = (data.results ?? [])
        .map((p: any) => ({
          id: p.provider_id,
          name: p.provider_name,
          logo: p.logo_path ?? null,
          priority: p.display_priorities?.DE ?? p.display_priority ?? 999,
        }))
        .sort((a: any, b: any) => a.priority - b.priority)
        .slice(0, 60)
      return reply({ ok: true, providers: list })
    }
    return reply({ ok: false, message: 'Unbekannte Aktion' }, 400)
  } catch (e) {
    console.error(e)
    return reply({ ok: false, message: 'Filme gerade nicht erreichbar.' }, 502)
  }
})
