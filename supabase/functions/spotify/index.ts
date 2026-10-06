// Spotify „Läuft gerade“. Pro Mitglied ein verbundenes Spotify-Konto; das Board fragt hier ab, was gerade läuft.
// Routen:
//   GET  ?action=now        → was gerade läuft (alle verbundenen Konten)
//   GET  ?action=status     → wer verbunden ist, ob die App eingerichtet ist
//   POST {action:'connect', returnTo} → Adresse der Spotify-Anmeldung
//   POST {action:'disconnect'}        → eigenes Konto trennen
//   GET  /callback          → Rückkehr von Spotify (ohne Login, daher verify_jwt aus; Schutz über state)
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'

const db = adminClient()
const SCOPES = 'user-read-currently-playing user-read-playback-state'
const CALLBACK = `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify/callback`
/** Nur zurück auf die eigene Seite */
const RETURN_PREFIXES = ['https://jonthemaster.github.io/Haushaltsboard/', 'http://localhost:5173/Haushaltsboard/']
const STATE_MAX_AGE_MS = 10 * 60 * 1000
/** So lange gilt eine Antwort von Spotify (Board und Handy fragen alle paar Sekunden) */
const CACHE_MS = 4000

type Account = { member_id: string; refresh_token: string; access_token: string | null; expires_at: string | null }
type Playing = {
  memberId: string
  isPlaying: boolean
  title: string
  artists: string
  album: string
  image: string | null
  url: string | null
  progressMs: number
  durationMs: number
  device: string | null
  /** Zeitpunkt der Antwort, damit der Fortschritt im Browser weiterlaufen kann */
  at: number
}

function clientCreds(): { id: string; secret: string } | null {
  const id = Deno.env.get('SPOTIFY_CLIENT_ID')?.trim()
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET')?.trim()
  return id && secret ? { id, secret } : null
}

async function tokenRequest(body: Record<string, string>) {
  const c = clientCreds()!
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${c.id}:${c.secret}`)}`,
    },
    body: new URLSearchParams(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(`Spotify-Token: ${resp.status} ${data.error ?? ''}`)
  return data as { access_token: string; refresh_token?: string; expires_in: number }
}

/** Gültiger Zugangsschlüssel; läuft er ab, mit dem refresh_token erneuern */
async function accessToken(a: Account): Promise<string> {
  if (a.access_token && a.expires_at && new Date(a.expires_at).getTime() > Date.now() + 60_000) return a.access_token
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refresh_token })
  const patch = {
    access_token: t.access_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    // Spotify schickt manchmal einen neuen refresh_token mit
    ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
  }
  await db.from('spotify_accounts').update(patch).eq('member_id', a.member_id)
  Object.assign(a, patch)
  return t.access_token
}

// ───────── Was läuft ─────────

let cached: { at: number; body: unknown } | null = null

async function nowPlaying(a: Account): Promise<Playing | { memberId: string; error: string } | null> {
  try {
    const token = await accessToken(a)
    const resp = await fetch('https://api.spotify.com/v1/me/player?additional_types=episode', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (resp.status === 204) return null
    if (resp.status === 403) return { memberId: a.member_id, error: 'not_allowed' }
    if (!resp.ok) return { memberId: a.member_id, error: `http_${resp.status}` }
    const p = await resp.json()
    const item = p.item
    if (!item) return null
    const isEpisode = p.currently_playing_type === 'episode'
    const images: { url: string; width: number | null }[] = (isEpisode ? item.images : item.album?.images) ?? []
    // Kleinstes Bild ab 200 px reicht für die Anzeige
    const image = [...images].sort((x, y) => (x.width ?? 0) - (y.width ?? 0)).find((i) => (i.width ?? 0) >= 200) ?? images[0]
    return {
      memberId: a.member_id,
      isPlaying: !!p.is_playing,
      title: item.name ?? '',
      artists: isEpisode ? (item.show?.name ?? '') : (item.artists ?? []).map((x: { name: string }) => x.name).join(', '),
      album: isEpisode ? (item.show?.publisher ?? '') : (item.album?.name ?? ''),
      image: image?.url ?? null,
      url: item.external_urls?.spotify ?? null,
      progressMs: p.progress_ms ?? 0,
      durationMs: item.duration_ms ?? 0,
      device: p.device?.name ?? null,
      at: Date.now(),
    }
  } catch (e) {
    console.error(a.member_id, e)
    return { memberId: a.member_id, error: 'token' }
  }
}

async function handleNow(): Promise<unknown> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.body
  const { data: accounts } = await db.from('spotify_accounts').select('member_id, refresh_token, access_token, expires_at')
  const results = await Promise.all((accounts ?? []).map(nowPlaying))
  const body = {
    playing: results.filter((r): r is Playing => !!r && 'isPlaying' in r && r.isPlaying),
    errors: results.filter((r): r is { memberId: string; error: string } => !!r && 'error' in r),
  }
  cached = { at: Date.now(), body }
  return body
}

// ───────── Anmelden ─────────

async function handleConnect(member: string, returnTo: unknown): Promise<unknown> {
  const c = clientCreds()
  if (!c) return { error: 'not_configured' }
  const back = typeof returnTo === 'string' && RETURN_PREFIXES.some((p) => returnTo.startsWith(p)) ? returnTo : RETURN_PREFIXES[0]
  const state = crypto.randomUUID()
  // alte, nie benutzte Schlüssel gleich mit aufräumen
  await db.from('spotify_auth_states').delete().lt('created_at', new Date(Date.now() - STATE_MAX_AGE_MS).toISOString())
  await db.from('spotify_auth_states').insert({ state, member_id: member, return_to: back })
  const url = new URL('https://accounts.spotify.com/authorize')
  url.search = new URLSearchParams({
    client_id: c.id,
    response_type: 'code',
    redirect_uri: CALLBACK,
    scope: SCOPES,
    state,
  }).toString()
  return { url: url.toString() }
}

function backTo(target: string, result: string): Response {
  const url = new URL(target)
  url.searchParams.set('spotify', result)
  return Response.redirect(url.toString(), 302)
}

async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state') ?? ''
  const { data: row } = await db.from('spotify_auth_states').select('*').eq('state', state).maybeSingle()
  if (!row) return new Response('Anmeldung abgelaufen. Bitte in der App noch einmal auf „Spotify verbinden“ tippen.', { status: 400 })
  await db.from('spotify_auth_states').delete().eq('state', state)
  if (Date.now() - new Date(row.created_at).getTime() > STATE_MAX_AGE_MS) return backTo(row.return_to, 'expired')

  const code = url.searchParams.get('code')
  if (!code) return backTo(row.return_to, 'denied')
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK })
    await db.from('spotify_accounts').upsert({
      member_id: row.member_id,
      refresh_token: t.refresh_token!,
      access_token: t.access_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    })
    cached = null
    return backTo(row.return_to, 'ok')
  } catch (e) {
    console.error(e)
    return backTo(row.return_to, 'error')
  }
}

// ───────── Handler ─────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const url = new URL(req.url)
  if (url.pathname.endsWith('/callback')) return handleCallback(url)

  const member = await memberId(req)
  if (!member) return json(req, { error: 'Nicht angemeldet' }, 401)

  try {
    if (req.method === 'GET') {
      const action = url.searchParams.get('action') ?? 'now'
      if (action === 'now') return json(req, await handleNow())
      if (action === 'status') {
        const { data } = await db.from('spotify_accounts').select('member_id')
        return json(req, { configured: !!clientCreds(), connected: (data ?? []).map((r) => r.member_id) })
      }
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.action === 'connect') return json(req, await handleConnect(member, body.returnTo))
      if (body.action === 'disconnect') {
        await db.from('spotify_accounts').delete().eq('member_id', member)
        cached = null
        return json(req, { ok: true })
      }
    }
    return json(req, { error: 'Unbekannte Aktion' }, 400)
  } catch (e) {
    console.error(e)
    return json(req, { error: 'Spotify gerade nicht erreichbar' }, 502)
  }
})
