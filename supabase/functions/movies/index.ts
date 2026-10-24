// Filme (docs/filme-modul.md): gemeinsame Merkliste für Filme und Serien. Daten von TMDB, Streaming von JustWatch (über TMDB).
//   POST { url | text }                  → Link oder Text teilen (Kurzbefehl „Film merken“, HTTP Shortcuts am Android):
//                                           Film erkennen und merken; Antwort „Dune: Part Two (2024) gemerkt“
//   POST { action: 'search', q }         → Suche (App), Filme und Serien mit Poster
//   POST { action: 'add', tmdb_id, kind } → aus der Suche merken (oder nur eigene Stimme ergänzen)
//   POST { action: 'resolve', id, tmdb_id, kind } → Eintrag „prüfen“ auf einen der Vorschläge festlegen
//   POST { action: 'refresh', id }       → Daten und Streaming eines Films neu holen
//   POST { action: 'providers' }         → Streamingdienste in Deutschland (für die Einstellungen)
//   POST { action: 'tonight' }           → laufender Filmabend mit Angeboten (Fernseh-Launcher, immer JSON)
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
  // Videos gleich mitladen (Trailer), deutsche zuerst
  const d = await tmdb(`/${kind}/${id}`, { append_to_response: 'videos', include_video_language: 'de,en,null' })
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
    trailer_key: trailerOf(d.videos?.results ?? []),
    rent_prices: await rentPrices(kind, id, ((kind === 'tv' ? d.name : d.title) ?? '') as string, kind === 'tv' ? d.original_name : d.original_title).catch(
      () => [],
    ),
    prices_checked_at: new Date().toISOString(),
    providers_checked_at: new Date().toISOString(),
    details_at: new Date().toISOString(),
  }
}

/** Trailer von YouTube: offizieller deutscher zuerst, sonst englischer, sonst irgendein Trailer/Teaser */
function trailerOf(videos: { site: string; type: string; key: string; iso_639_1?: string; official?: boolean }[]): string | null {
  const yt = videos.filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
  const score = (v: (typeof yt)[number]) => (v.type === 'Trailer' ? 4 : 0) + (v.iso_639_1 === 'de' ? 2 : 0) + (v.official ? 1 : 0)
  return yt.sort((a, b) => score(b) - score(a))[0]?.key ?? null
}

// ───────── Leihpreise (inoffiziell, JustWatch) ─────────
// Wunsch Jonathan 20.10.2026: nur Anbieter, die in den Einstellungen als „Zum Leihen“ gewählt sind (Filter in der App).
// Gespeichert wird pro Anbieter der günstigste Leihpreis (ohne DVD/Blu-ray-Versand). Fällt die Schnittstelle aus: keine Preise.
type RentPrice = { name: string; price: number; url: string | null }

async function rentPrices(kind: Kind, tmdbId: number, title: string, original?: string | null): Promise<RentPrice[]> {
  const first = title ? await rentPricesFor(kind, tmdbId, title) : null
  if (first !== null || !original || original === title) return first ?? []
  // deutscher Titel nicht gefunden: mit dem Originaltitel nochmal
  return (await rentPricesFor(kind, tmdbId, original)) ?? []
}

/** null = Titel bei JustWatch nicht gefunden */
async function rentPricesFor(kind: Kind, tmdbId: number, title: string): Promise<RentPrice[] | null> {
  const query = `query($q:String!){popularTitles(country:DE,first:6,filter:{searchQuery:$q}){edges{node{objectType content(country:DE,language:"de"){externalIds{tmdbId}} offers(country:DE,platform:WEB,filter:{monetizationTypes:[RENT]}){retailPriceValue presentationType standardWebURL package{clearName}}}}}}`
  const resp = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...UA },
    body: JSON.stringify({ query, variables: { q: title } }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  const type = kind === 'tv' ? 'SHOW' : 'MOVIE'
  const node = (data?.data?.popularTitles?.edges ?? [])
    .map((e: any) => e.node)
    .find((n: any) => n?.objectType === type && String(n?.content?.externalIds?.tmdbId) === String(tmdbId))
  if (!node) return null
  const best = new Map<string, RentPrice>()
  for (const o of node.offers ?? []) {
    const price = Number(o.retailPriceValue)
    if (!price || ['DVD', 'BLURAY'].includes(o.presentationType)) continue
    const name = o.package?.clearName as string
    if (!name) continue
    const cur = best.get(name)
    if (!cur || price < cur.price) best.set(name, { name, price, url: o.standardWebURL ?? null })
  }
  return [...best.values()].sort((a, b) => a.price - b.price)
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

  const { data: movies } = await db
    .from('movies')
    .select('id, kind, tmdb_id, title, original_title, year, status, providers, details_at')
    .not('tmdb_id', 'is', null)
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
      const prices = await rentPrices(m.kind as Kind, m.tmdb_id!, m.title, m.original_title).catch(() => null)
      await db
        .from('movies')
        .update({
          providers: p,
          providers_checked_at: new Date().toISOString(),
          ...(prices ? { rent_prices: prices, prices_checked_at: new Date().toISOString() } : {}),
        })
        .eq('id', m.id)
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

// ───────── Heute Abend (Fernseh-Launcher, 24.10.2026) ─────────
// Der Launcher fragt höchstens einmal pro Minute { action: 'tonight' } und zeigt den laufenden Filmabend mit Knopf zur App.
// Angebote mit direkten Anbieter-Links kommen (inoffiziell) von JustWatch, 6 Std in movies.offers gemerkt.
type Offer = { provider: string; service: string; kind: 'flatrate' | 'rent' | 'buy'; price?: number; url: string | null }
const OFFERS_MAX_AGE_MS = 6 * 3600_000
const PROVIDERS: [RegExp, string][] = [
  [/^netflix/, 'netflix'],
  [/^amazonprime/, 'prime'],
  [/^disneyplus/, 'disney'],
  [/^joynde/, 'joyn'],
  [/^(daserstemediathek|ardplus|ardmediathek)$/, 'ard'],
  [/^zdf$/, 'zdf'],
  [/^youtube/, 'youtube'],
  [/^amazon$/, 'amazon'],
]

function providerKey(technical: string, kind: Offer['kind']): string {
  const key = PROVIDERS.find(([re]) => re.test(technical))?.[1] ?? technical
  return key === 'amazon' ? `amazon_${kind}` : key
}

/** Tracking-Zusätze aus Anbieter-Links entfernen (der Link selbst bleibt direkt beim Anbieter) */
function cleanUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    // Prime Video / Amazon: Format, das die Fernseh-App versteht (Wunsch Launcher 24.10.2026)
    const gti = u.searchParams.get('gti') ?? url.match(/amzn1\.dv\.gti\.[0-9a-f-]+/i)?.[0]
    if (/amazon\.|primevideo\./.test(u.hostname) && gti) return `https://app.primevideo.com/detail?gti=${gti}`
    for (const k of [...u.searchParams.keys()]) if (/^(at|ct|itscg|itsct|tag|ref|utm_.*)$/i.test(k)) u.searchParams.delete(k)
    return u.toString()
  } catch {
    return url
  }
}

/** Alle Angebote in Deutschland (ohne DVD/Blu-ray), pro Anbieter und Art das günstigste; null = bei JustWatch nicht gefunden */
async function offersFor(kind: Kind, tmdbId: number, title: string): Promise<Offer[] | null> {
  const query = `query($q:String!){popularTitles(country:DE,first:6,filter:{searchQuery:$q}){edges{node{objectType content(country:DE,language:"de"){externalIds{tmdbId}} offers(country:DE,platform:WEB,filter:{monetizationTypes:[FLATRATE,FREE,ADS,RENT,BUY]}){monetizationType retailPriceValue presentationType standardWebURL package{clearName technicalName}}}}}}`
  const resp = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...UA },
    body: JSON.stringify({ query, variables: { q: title } }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  const type = kind === 'tv' ? 'SHOW' : 'MOVIE'
  const node = (data?.data?.popularTitles?.edges ?? [])
    .map((e: any) => e.node)
    .find((n: any) => n?.objectType === type && String(n?.content?.externalIds?.tmdbId) === String(tmdbId))
  if (!node) return null
  const best = new Map<string, Offer>()
  for (const o of node.offers ?? []) {
    if (['DVD', 'BLURAY'].includes(o.presentationType) || !o.package?.technicalName) continue
    const k: Offer['kind'] = o.monetizationType === 'RENT' ? 'rent' : o.monetizationType === 'BUY' ? 'buy' : 'flatrate'
    const price = Number(o.retailPriceValue) || undefined
    const offer: Offer = { provider: providerKey(o.package.technicalName, k), service: o.package.clearName, kind: k, url: cleanUrl(o.standardWebURL ?? null) }
    if (k !== 'flatrate') offer.price = price
    const id = `${offer.provider}|${k}`
    const cur = best.get(id)
    if (!cur || (k !== 'flatrate' && (offer.price ?? Infinity) < (cur.price ?? Infinity))) best.set(id, offer)
  }
  return [...best.values()]
}

async function tonight() {
  const now = Date.now()
  const { data: w } = await db
    .from('movie_watched')
    .select('id, movie_id, started_at, ends_at, service')
    .gt('ends_at', new Date(now).toISOString())
    .gt('started_at', new Date(now - 12 * 3600_000).toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!w) return { movie: null }
  const { data: m } = await db
    .from('movies')
    .select('id, kind, tmdb_id, title, original_title, year, poster_path, providers, offers, offers_checked_at')
    .eq('id', w.movie_id)
    .maybeSingle()
  if (!m) return { movie: null }

  let offers = (m.offers ?? null) as Offer[] | null
  const stale = !m.offers_checked_at || now - Date.parse(m.offers_checked_at) > OFFERS_MAX_AGE_MS
  if (stale && m.tmdb_id) {
    const fresh = await offersFor(m.kind as Kind, m.tmdb_id, m.title)
      .then((r) => (r === null && m.original_title && m.original_title !== m.title ? offersFor(m.kind as Kind, m.tmdb_id!, m.original_title) : r))
      .catch(() => null)
    if (fresh) offers = fresh
    await db.from('movies').update({ offers, offers_checked_at: new Date().toISOString() }).eq('id', m.id)
  }
  // JustWatch nicht erreichbar: Abo-Dienste aus TMDB, ohne Link (der Launcher öffnet dann nur die App)
  if (!offers?.length) {
    offers = ((m.providers as Providers)?.flatrate ?? []).map((p) => ({
      provider: providerKey(serviceKey(p.name), 'flatrate'),
      service: p.name,
      kind: 'flatrate' as const,
      url: null,
    }))
  }

  const { data: mod } = await db.from('modules').select('config').eq('id', 'filme').maybeSingle()
  const config = (mod?.config ?? {}) as { services?: string[]; rent_services?: string[] }
  const services = config.services ?? ['Netflix', 'Amazon Prime Video', 'Disney Plus', 'Joyn', 'ARD Mediathek', 'ZDF']
  const rentServices = config.rent_services ?? ['Amazon Video', 'YouTube']
  // Abos, die wir haben: der beim Filmabend gewählte Dienst zuerst, dann wie in den Einstellungen
  const order = [...(w.service ? [w.service] : []), ...services.filter((s) => s !== w.service)]
  const result: Offer[] = []
  const seen = new Set<string>()
  const push = (o: Offer, service: string) => {
    if (seen.has(`${o.provider}|${o.kind}`)) return
    seen.add(`${o.provider}|${o.kind}`)
    result.push({ ...o, service })
  }
  for (const s of order) {
    for (const o of offers.filter((x) => x.kind === 'flatrate' && serviceKey(x.service).startsWith(serviceKey(s)))) push(o, s)
  }
  for (const kind of ['rent', 'buy'] as const) {
    offers
      .filter((x) => x.kind === kind && rentServices.some((s) => norm(x.service) === norm(s)))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      .forEach((o) => push(o, o.service))
  }

  return {
    id: w.id,
    starts_at: w.started_at,
    ends_at: w.ends_at,
    movie: {
      title: m.title,
      year: m.year,
      type: m.kind === 'tv' ? 'show' : 'movie',
      tmdb_id: m.tmdb_id,
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
    },
    offers: result,
  }
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
    const body = await readBody(req)
    const action = typeof body.action === 'string' ? body.action : 'share'
    // Fernseh-Launcher: immer JSON, auch mit Token
    asText = who.token && action !== 'tonight'
    const { data: mod } = await db.from('modules').select('enabled').eq('id', 'filme').maybeSingle()
    if (mod && !mod.enabled) return action === 'tonight' ? reply({ ok: true, movie: null }) : reply({ ok: false, message: 'Filme ist ausgeschaltet.' }, 403)
    if (action === 'tonight') return reply({ ok: true, ...(await tonight()) })

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
