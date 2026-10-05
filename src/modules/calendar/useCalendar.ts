import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../../lib/settings'
import { supabase } from '../../lib/supabase'

export type CalendarEvent = {
  id: string
  calendar: string
  /** Farbe der Person: 'person-a' | 'person-b' */
  person: string | null
  title: string
  /** ISO-Zeitpunkt, bei ganztägig YYYY-MM-DD */
  start: string
  /** exklusiv */
  end: string
  allDay: boolean
  label?: string
  who?: string | null
  hideInVisit?: boolean
  /** Kalenderfarbe: blue, berry, orange, yellow, lilac, purple, forest, lime */
  color?: string
  /** Tage, an denen dieser Ganztags-Eintrag ausgeblendet wird (vom Server berechnet) */
  skipDays?: string[]
}

type Response = { events: CalendarEvent[]; errors: string[]; visitMode: boolean }

const POLL_MS = 5 * 60 * 1000
const CACHE_KEY = 'hb-calendar-events'

// Wie beim Einkauf: letzte Termine sofort zeigen, im Hintergrund neu laden
let memory: CalendarEvent[] | null = null

function readCache(): CalendarEvent[] | null {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : null
  } catch {
    return null
  }
}

function writeCache(events: CalendarEvent[]) {
  memory = events
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(events))
  } catch {
    // nur Komfort
  }
}

/** Termine der nächsten 8 Tage, alle 5 Minuten neu. Im Besuchsmodus sofort ohne versteckte Kalender. */
export function useCalendar() {
  const { settings } = useSettings()
  const visitMode = settings?.visit_mode ?? false
  const [events, setEvents] = useState<CalendarEvent[] | null>(readCache)
  const [failed, setFailed] = useState<string[]>([])
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<Response>('calendar', { method: 'GET' })
    if (error || !data) return setError(true)
    setError(false)
    setFailed(data.errors)
    setEvents(data.events)
    writeCache(data.events)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    const onWake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onWake)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [load])

  // Besuchsmodus umgeschaltet → neu laden (Server lässt versteckte Kalender dann ganz weg)
  const lastVisit = useRef<boolean | null>(null)
  useEffect(() => {
    if (!settings) return
    if (lastVisit.current !== null && lastVisit.current !== visitMode) load()
    lastVisit.current = visitMode
  }, [visitMode, settings, load])

  // Bis die neue Antwort da ist, versteckte Termine schon hier ausblenden
  const visible = events && (visitMode ? events.filter((e) => !e.hideInVisit) : events)

  return { events: visible, failed, error }
}
