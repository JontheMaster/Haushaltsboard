import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { addDays, berlinAtISO, berlinDay } from '../../lib/time'
import { useModuleConfig } from '../useModules'

// Filme (docs/filme-modul.md): Merkliste, Stimmen, Filmabende. Daten von TMDB, Streaming von JustWatch.
// Alles liegt in einem gemeinsamen Speicher (einmal laden, Realtime), weil Kachel, Kopfzeile und Seite dieselben Daten zeigen.

export type Kind = 'movie' | 'tv'
export type Want = 'unbedingt' | 'gerne' | 'egal' | 'lieber_nicht'
export type Status = 'merkliste' | 'gesehen' | 'verworfen' | 'pruefen'
export type Provider = { id: number; name: string; logo: string | null }
export type Providers = { flatrate?: Provider[]; rent?: Provider[]; buy?: Provider[]; link?: string }
export type Candidate = { tmdb_id: number; kind: Kind; title: string; year: number | null; poster_path: string | null; overview: string }

export type Movie = {
  id: string
  tmdb_id: number | null
  kind: Kind
  title: string
  original_title: string | null
  year: number | null
  runtime: number | null
  genres: string[]
  genre_ids: number[]
  poster_path: string | null
  backdrop_path: string | null
  overview: string | null
  rating_tmdb: number | null
  providers: Providers
  providers_checked_at: string | null
  source_url: string | null
  added_by: string | null
  added_at: string
  status: Status
  candidates: Candidate[] | null
}
export type Vote = { movie_id: string; member: string; want: Want }
export type Watched = {
  id: string
  movie_id: string
  watched_on: string
  started_at: string
  ends_at: string
  service: string | null
  ratings: Record<string, number>
  created_by: string | null
}

type State = { movies: Movie[]; votes: Vote[]; watched: Watched[]; loaded: boolean }

let state: State = { movies: [], votes: [], watched: [], loaded: false }
const listeners = new Set<() => void>()
let started = false

function emit() {
  listeners.forEach((l) => l())
}

async function loadAll() {
  const [m, v, w] = await Promise.all([
    supabase.from('movies').select('*').order('added_at', { ascending: false }),
    supabase.from('movie_votes').select('movie_id, member, want'),
    supabase
      .from('movie_watched')
      .select('id, movie_id, watched_on, started_at, ends_at, service, ratings, created_by')
      .order('started_at', { ascending: false }),
  ])
  state = {
    movies: (m.data ?? []).map(
      (r) => ({ ...r, providers: (r.providers ?? {}) as Providers, candidates: (r.candidates ?? null) as Candidate[] | null }) as Movie,
    ),
    votes: (v.data ?? []) as Vote[],
    watched: (w.data ?? []).map((r) => ({ ...r, ratings: (r.ratings ?? {}) as Record<string, number> })) as Watched[],
    loaded: true,
  }
  emit()
}

function start() {
  if (started) return
  started = true
  loadAll()
  let t: ReturnType<typeof setTimeout>
  const later = () => {
    clearTimeout(t)
    t = setTimeout(loadAll, 250)
  }
  supabase
    .channel('movies-store')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movies' }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movie_votes' }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movie_watched' }, later)
    .subscribe()
}

/** Filme, Stimmen und Filmabende, live */
export function useMovieStore(): State {
  start()
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

/** neu laden, z. B. nach einer Aktion über die Edge Function (Realtime kommt dann ohnehin, aber so ist es sofort da) */
export const reloadMovies = () => loadAll()

// ───────── Einstellungen ─────────

export const DEFAULT_SERVICES = ['Netflix', 'Amazon Prime Video', 'Disney Plus', 'Joyn', 'ARD Mediathek', 'ZDF']
export type FilmConfig = { services: string[]; push: string[] }

export function useFilmConfig(): FilmConfig {
  return useModuleConfig<FilmConfig>('filme', { services: DEFAULT_SERVICES, push: [] })
}

// ───────── Edge Function ─────────

type FnResult = { ok: boolean; message?: string; id?: string; already?: boolean }

async function call<T = FnResult>(body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke<T>('movies', { body })
  if (error) {
    // Fehlermeldung der Function (z. B. „Nichts gefunden“) steht im Antworttext
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) return (await ctx.json()) as T
    } catch {
      // egal
    }
    return null
  }
  return data
}

export async function searchMovies(q: string): Promise<Candidate[]> {
  const r = await call<{ ok: boolean; results?: Candidate[] }>({ action: 'search', q })
  return r?.results ?? []
}

export async function addFromSearch(c: Candidate): Promise<FnResult> {
  const r = await call({ action: 'add', tmdb_id: c.tmdb_id, kind: c.kind })
  await loadAll()
  return r ?? { ok: false, message: 'Merken hat nicht geklappt.' }
}

export async function shareText(text: string): Promise<FnResult> {
  const r = await call({ text })
  await loadAll()
  return r ?? { ok: false, message: 'Merken hat nicht geklappt.' }
}

export async function resolveMovie(id: string, c: Candidate): Promise<FnResult> {
  const r = await call({ action: 'resolve', id, tmdb_id: c.tmdb_id, kind: c.kind })
  await loadAll()
  return r ?? { ok: false, message: 'Hat nicht geklappt.' }
}

export async function refreshMovie(id: string): Promise<boolean> {
  const r = await call({ action: 'refresh', id })
  await loadAll()
  return !!r?.ok
}

export async function streamingServices(): Promise<{ id: number; name: string; logo: string | null }[]> {
  const r = await call<{ ok: boolean; providers?: { id: number; name: string; logo: string | null }[] }>({ action: 'providers' })
  return r?.providers ?? []
}

// ───────── Direkt in der Datenbank ─────────

/** Stimme setzen; null = Stimme entfernen */
export async function setVote(movieId: string, member: string, want: Want | null): Promise<boolean> {
  // sofort zeigen, Realtime gleicht danach ab
  state = {
    ...state,
    votes: [...state.votes.filter((v) => !(v.movie_id === movieId && v.member === member)), ...(want ? [{ movie_id: movieId, member, want }] : [])],
  }
  emit()
  const { error } = want
    ? await supabase.from('movie_votes').upsert({ movie_id: movieId, member, want, updated_at: new Date().toISOString() })
    : await supabase.from('movie_votes').delete().eq('movie_id', movieId).eq('member', member)
  if (error) loadAll()
  return !error
}

export async function setStatus(movieId: string, status: Status): Promise<boolean> {
  state = { ...state, movies: state.movies.map((m) => (m.id === movieId ? { ...m, status } : m)) }
  emit()
  const { error } = await supabase.from('movies').update({ status }).eq('id', movieId)
  if (error) loadAll()
  return !error
}

export async function deleteMovie(movieId: string): Promise<boolean> {
  const { error } = await supabase.from('movies').delete().eq('id', movieId)
  await loadAll()
  return !error
}

/** „Den schauen wir“: Filmabend ab jetzt, Ende nach Laufzeit (Serie: eine Folge); Film gilt als gesehen */
export async function startNight(movie: Movie, service: string | null, by: string): Promise<boolean> {
  const minutes = movie.runtime ?? (movie.kind === 'tv' ? 45 : 120)
  const ends = new Date(Date.now() + minutes * 60_000).toISOString()
  const { error } = await supabase.from('movie_watched').insert({ movie_id: movie.id, ends_at: ends, service, created_by: by, watched_on: berlinDay() })
  if (error) return false
  // Serien bleiben auf der Liste (man schaut sie über mehrere Abende)
  if (movie.kind === 'movie') await supabase.from('movies').update({ status: 'gesehen' }).eq('id', movie.id)
  await loadAll()
  return true
}

/** Filmabend abbrechen („Doch nicht“): Eintrag weg, Film wieder auf die Merkliste */
export async function cancelNight(w: Watched): Promise<boolean> {
  const { error } = await supabase.from('movie_watched').delete().eq('id', w.id)
  if (error) return false
  const others = state.watched.some((x) => x.id !== w.id && x.movie_id === w.movie_id)
  if (!others) await supabase.from('movies').update({ status: 'merkliste' }).eq('id', w.movie_id)
  await loadAll()
  return true
}

/** Sterne (1–5) oder 0 = nicht mitgeschaut */
export async function rate(w: Watched, member: string, stars: number): Promise<boolean> {
  state = { ...state, watched: state.watched.map((x) => (x.id === w.id ? { ...x, ratings: { ...x.ratings, [member]: stars } } : x)) }
  emit()
  const { error } = await supabase.rpc('movie_rate', { p_watched: w.id, p_member: member, p_stars: stars })
  if (error) loadAll()
  return !error
}

// ───────── Hilfen ─────────

/** Poster von TMDB (w185 klein, w342 mittel, w500 groß) */
export function posterUrl(path: string | null | undefined, size: 'w92' | 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}
export const logoUrl = (path: string | null | undefined) => (path ? `https://image.tmdb.org/t/p/w92${path}` : null)

export const WANTS: { value: Want; label: string; short: string }[] = [
  { value: 'unbedingt', label: 'Unbedingt', short: 'unbedingt' },
  { value: 'gerne', label: 'Gerne', short: 'gerne' },
  { value: 'egal', label: 'Egal', short: 'egal' },
  { value: 'lieber_nicht', label: 'Lieber nicht', short: 'lieber nicht' },
]
export const wantLabel = (w: Want | null | undefined) => WANTS.find((x) => x.value === w)?.label ?? 'Noch keine Stimme'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(plus|with ads|mit werbung|basic|standard)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')

/** Läuft im Abo bei einem eurer Dienste? Gibt die Namen der passenden Dienste zurück */
export function ourServices(m: Movie, services: string[]): string[] {
  // Name des eigenen Dienstes, nicht der Variante („Netflix Standard with Ads“ → „Netflix“)
  return services.filter((s) => (m.providers.flatrate ?? []).some((p) => norm(p.name).startsWith(norm(s))))
}

/** Gehört ein Anbieter (auch eine Variante wie „… with Ads“) zu euren Diensten? */
export const isOurProvider = (name: string, services: string[]) => services.some((s) => norm(name).startsWith(norm(s)))

export function runtimeLabel(m: Pick<Movie, 'runtime' | 'kind'>): string | null {
  if (!m.runtime) return null
  const h = Math.floor(m.runtime / 60)
  const min = m.runtime % 60
  const t = h ? `${h} Std${min ? ` ${min} Min` : ''}` : `${min} Min`
  return m.kind === 'tv' ? `${t} pro Folge` : t
}

// Laune → TMDB-Genres (Film- und Serien-IDs)
export type Mood = 'leicht' | 'spannend' | 'lustig' | 'gefuehlvoll' | 'egal'
export const MOODS: { value: Mood; label: string; genres: number[] }[] = [
  { value: 'egal', label: 'Egal', genres: [] },
  // Komödie, Familie, Animation, Musik, Liebe
  { value: 'leicht', label: 'Leicht', genres: [35, 10751, 16, 10402, 10749, 10762] },
  // Action, Thriller, Krimi, Mystery, Abenteuer, Science-Fiction, Horror; Serien: Action & Adventure, Sci-Fi & Fantasy
  { value: 'spannend', label: 'Spannend', genres: [28, 53, 80, 9648, 12, 878, 27, 10759, 10765, 10768] },
  { value: 'lustig', label: 'Lustig', genres: [35] },
  // Drama, Liebe, Musik, Historie
  { value: 'gefuehlvoll', label: 'Gefühlvoll', genres: [18, 10749, 10402, 36] },
]
export const moodFits = (m: Movie, mood: Mood) => mood === 'egal' || m.genre_ids.some((g) => MOODS.find((x) => x.value === mood)!.genres.includes(g))

export type TimeLimit = 100 | 130 | 0
export const TIMES: { value: TimeLimit; label: string }[] = [
  { value: 100, label: 'Bis 100 Min' },
  { value: 130, label: 'Bis 130 Min' },
  { value: 0, label: 'Egal' },
]
export const timeFits = (m: Movie, limit: TimeLimit) => !limit || !m.runtime || m.runtime <= limit

// Gewichte pro Stimme: „unbedingt“ von beiden wiegt am meisten (3 × 3), „lieber nicht“ fliegt raus
const WANT_WEIGHT: Record<Want, number> = { unbedingt: 3, gerne: 2, egal: 1, lieber_nicht: 0 }

/** Gewicht für den Zufall: Stimmen beider multipliziert, lange gemerkte Filme leicht mehr (bis +50 % nach 6 Monaten) */
export function weightOf(m: Movie, votes: Vote[], people: string[]): number {
  let w = 1
  for (const p of people) {
    const v = votes.find((x) => x.movie_id === m.id && x.member === p)?.want
    w *= v ? WANT_WEIGHT[v] : 1
  }
  if (!w) return 0
  const days = (Date.now() - Date.parse(m.added_at)) / 86400000
  return w * (1 + Math.min(1, Math.max(0, days) / 180) * 0.5)
}

/** Zufall nach Gewicht (ohne die schon gezogenen) */
export function pickWeighted(list: Movie[], weight: (m: Movie) => number, exclude: string[]): Movie | null {
  const pool = list
    .filter((m) => !exclude.includes(m.id))
    .map((m) => ({ m, w: weight(m) }))
    .filter((x) => x.w > 0)
  const total = pool.reduce((s, x) => s + x.w, 0)
  if (!total) return null
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  let r = (buf[0] / 2 ** 32) * total
  for (const x of pool) {
    r -= x.w
    if (r < 0) return x.m
  }
  return pool[pool.length - 1].m
}

// ───────── Filmabend und Bewertung ─────────

/** Laufender Filmabend: von „Den schauen wir“ bis 30 Min nach dem Ende */
export function currentNight(watched: Watched[], now: number): Watched | null {
  return watched.find((w) => Date.parse(w.started_at) <= now + 60_000 && now < Date.parse(w.ends_at) + 30 * 60_000) ?? null
}

/**
 * Bewerten: ab dem nächsten Morgen (6 Uhr) bis drei Tage danach, solange nicht alle bewertet haben.
 * Gibt die Filmabende mit den Personen zurück, die noch fehlen.
 */
export function ratingsDue(watched: Watched[], people: string[], now: number): { w: Watched; missing: string[] }[] {
  const today = berlinDay(new Date(now))
  return watched
    .filter((w) => {
      const from = Date.parse(berlinAtISO(addDays(w.watched_on, 1), '06:00'))
      return now >= from && today <= addDays(w.watched_on, 3)
    })
    .map((w) => ({ w, missing: people.filter((p) => w.ratings[p] === undefined) }))
    .filter((x) => x.missing.length > 0)
}

/** Durchschnitt der Sterne (ohne „nicht mitgeschaut“) */
export function avgStars(w: Watched): number | null {
  const s = Object.values(w.ratings).filter((n) => n > 0)
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
}

// ───────── Seite öffnen (Handy) ─────────

const OPEN_EVENT = 'hb-open-filme'
/** Filme-Seite am Handy öffnen (Kachel, Kopfzeilen-Karte, Mitteilung) */
export const openFilms = (movieId?: string) => dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: movieId ?? null }))
export function useOpenFilms(onOpen: (movieId: string | null) => void) {
  useEffect(() => {
    const h = (e: Event) => onOpen((e as CustomEvent<string | null>).detail)
    addEventListener(OPEN_EVENT, h)
    return () => removeEventListener(OPEN_EVENT, h)
  }, [onOpen])
}
/** Mitteilung „jetzt bei …“ angetippt: App startet mit ?filme (wird aus der Adresse entfernt) */
export function takeFilmsLink(): boolean {
  const params = new URLSearchParams(location.search)
  if (!params.has('filme')) return false
  params.delete('filme')
  const rest = params.toString()
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
  return true
}

/** Board: Hinweis „X jetzt bei Netflix“ als kurze Meldung, sobald der wöchentliche Lauf etwas findet */
export function useMovieHints(on: boolean, showToast: (m: string) => void) {
  useEffect(() => {
    if (!on) return
    const channel = supabase
      .channel(`movie-hints-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movie_hints' }, (p) => {
        const text = (p.new as { text?: string }).text
        if (text) showToast(text)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [on, showToast])
}
