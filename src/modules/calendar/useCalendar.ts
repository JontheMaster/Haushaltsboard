import { useEffect, useRef } from 'react'
import { createPoller } from '../../lib/sharedPoll'
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

// Eine Abfrage pro Gerät (sharedPoll), auch wenn Kachel, Woche und Briefing gleichzeitig Termine zeigen
const poller = createPoller<{ data: Response | null; error: boolean }>(
  async () => {
    const { data, error } = await supabase.functions.invoke<Response>('calendar', { method: 'GET' })
    if (data && !error) writeCache(data.events)
    return { data: error ? null : data, error: !!error || !data }
  },
  () => POLL_MS,
)

/** Termine der nächsten 8 Tage, alle 5 Minuten neu. Im Besuchsmodus sofort ohne versteckte Kalender. */
export function useCalendar() {
  const { settings } = useSettings()
  const visitMode = settings?.visit_mode ?? false
  const polled = poller.use()
  const events = polled?.data?.events ?? readCache()

  useEffect(() => {
    // Farbe oder „Bei Besuch ausblenden“ geändert (Alle Funktionen → Kalender): gleich neu laden
    const channel = supabase
      .channel(`calendars-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendars' }, () => poller.refresh())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Besuchsmodus umgeschaltet → neu laden (Server lässt versteckte Kalender dann ganz weg)
  const lastVisit = useRef<boolean | null>(null)
  useEffect(() => {
    if (!settings) return
    if (lastVisit.current !== null && lastVisit.current !== visitMode) poller.refresh()
    lastVisit.current = visitMode
  }, [visitMode, settings])

  // Bis die neue Antwort da ist, versteckte Termine schon hier ausblenden
  const visible = events && (visitMode ? events.filter((e) => !e.hideInVisit) : events)

  return { events: visible, failed: polled?.data?.errors ?? [], error: polled?.error ?? false }
}
