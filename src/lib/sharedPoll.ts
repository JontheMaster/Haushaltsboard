import { useEffect, useSyncExternalStore } from 'react'

// Gemeinsames Nachfragen pro Gerät: Zeigen mehrere Stellen dieselben Daten (Kopfzeile, Kachel, Bildschirmschoner),
// fragt trotzdem nur einer bei der Edge Function nach. Nur solange die Seite sichtbar ist und nicht im Nachtmodus
// (spart Anfragen und Protokolle bei Supabase, 20.10.2026).

let quiet = false
const quietListeners = new Set<() => void>()
/** Nachtmodus an der Wand: alle gemeinsamen Abfragen pausieren, beim Aufwachen sofort neu laden */
export function setQuietMode(on: boolean) {
  if (quiet === on) return
  quiet = on
  quietListeners.forEach((l) => l())
}

type Poller<T> = {
  value: T | null
  users: number
  timer: ReturnType<typeof setTimeout> | null
  running: boolean
  listeners: Set<() => void>
}

/**
 * Eine gemeinsame Abfrage. `every(value)` sagt, wann das nächste Mal (ms), z. B. schneller, solange Musik läuft.
 * `initial` = letzter Stand (z. B. aus dem Gerätespeicher), damit sofort etwas dasteht.
 */
export function createPoller<T>(load: () => Promise<T | null>, every: (value: T | null) => number, initial: T | null = null) {
  const p: Poller<T> = { value: initial, users: 0, timer: null, running: false, listeners: new Set() }
  const emit = () => p.listeners.forEach((l) => l())

  async function run() {
    if (p.timer) clearTimeout(p.timer)
    p.timer = null
    if (!p.users) return
    if (document.visibilityState === 'visible' && !quiet && !p.running) {
      p.running = true
      try {
        const v = await load()
        if (v !== null) {
          p.value = v
          emit()
        }
      } catch {
        // nächster Versuch beim nächsten Takt
      } finally {
        p.running = false
      }
    }
    // nie zwei Takte nebeneinander (Aufwachen während einer laufenden Abfrage)
    if (p.timer) clearTimeout(p.timer)
    p.timer = p.users ? setTimeout(run, every(p.value)) : null
  }
  const wake = () => {
    if (document.visibilityState === 'visible' && !quiet) run()
  }

  function start() {
    p.users++
    if (p.users === 1) {
      document.addEventListener('visibilitychange', wake)
      quietListeners.add(wake)
      run()
    }
  }
  function stop() {
    p.users--
    if (p.users > 0) return
    if (p.timer) clearTimeout(p.timer)
    p.timer = null
    document.removeEventListener('visibilitychange', wake)
    quietListeners.delete(wake)
  }

  return {
    /** Wert lesen und (solange active) mitfragen */
    use(active = true): T | null {
      useEffect(() => {
        if (!active) return
        start()
        return stop
      }, [active])
      const v = useSyncExternalStore(
        (cb) => {
          p.listeners.add(cb)
          return () => p.listeners.delete(cb)
        },
        () => p.value,
      )
      return active ? v : null
    },
    /** sofort neu laden (z. B. nach einer Änderung) */
    refresh: () => run(),
    /** Wert direkt setzen (z. B. Antwort einer Änderung) */
    set(v: T) {
      p.value = v
      emit()
    },
    get: () => p.value,
  }
}
