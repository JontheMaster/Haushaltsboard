import { useEffect, useState } from 'react'
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

// Alle 10 s nachfragen; Spotify selbst wird serverseitig höchstens alle 4 s gefragt
const POLL_MS = 10_000

/**
 * Was gerade bei euch auf Spotify läuft (nur Wiedergaben, die nicht pausiert sind).
 * Fragt nur, solange die Seite sichtbar ist.
 */
export function useNowPlaying(active = true): Playing[] {
  const [playing, setPlaying] = useState<Playing[]>([])

  useEffect(() => {
    if (!active) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') {
        const { data } = await supabase.functions.invoke<{ playing: Playing[] }>('spotify?action=now', { method: 'GET' })
        // Uhrzeit des Browsers statt des Servers, damit der Fortschritt nicht springt
        if (!stop && data) setPlaying(data.playing.map((p) => ({ ...p, at: Date.now() })))
      }
      if (!stop) timer = setTimeout(load, POLL_MS)
    }
    load()
    const onWake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onWake)
    return () => {
      stop = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [active])

  return active ? playing : []
}
