import { createPoller } from '../../lib/sharedPoll'
import { supabase } from '../../lib/supabase'

export type Playing = {
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
  /** Zeitpunkt der Antwort (ms), ab da läuft der Fortschritt im Browser weiter */
  at: number
}

// Solange Musik läuft alle 10 s, sonst jede Minute (Spotify selbst wird serverseitig höchstens alle 4 s gefragt).
// Eine Abfrage pro Gerät, egal wie viele Stellen „Läuft gerade“ zeigen (sharedPoll).
const PLAYING_MS = 10_000
const IDLE_MS = 60_000
let memory: { at: number; playing: Playing[] } | null = null

/** Diese Wiedergabe war gerade schon zu sehen (dann ohne Einblend-Animation zeigen) */
export function wasShown(p: Playing): boolean {
  return !!memory?.playing.some((x) => x.memberId === p.memberId && x.title === p.title)
}

const poller = createPoller<Playing[]>(
  async () => {
    const { data } = await supabase.functions.invoke<{ playing: Playing[] }>('spotify?action=now', { method: 'GET' })
    if (!data) return null
    // Uhrzeit des Browsers statt des Servers, damit der Fortschritt nicht springt
    const list = data.playing.map((p) => ({ ...p, at: Date.now() }))
    memory = { at: Date.now(), playing: list }
    return list
  },
  (list) => (list?.length ? PLAYING_MS : IDLE_MS),
)

/**
 * Was gerade bei euch auf Spotify läuft (nur Wiedergaben, die nicht pausiert sind).
 * Fragt nur, solange die Seite sichtbar ist (und nicht im Nachtmodus).
 */
export function useNowPlaying(active = true): Playing[] {
  return poller.use(active) ?? []
}
