// „Alles erledigt“: kurzer Konfetti-Wirbel in Campfire-Farben, wenn das letzte Todo des Tages abgehakt wird.
// Ein gemeinsamer Zustand für die ganze App, damit mehrere Kacheln nicht doppelt feiern.
import { useEffect, useSyncExternalStore } from 'react'

let shownAt = 0
const listeners = new Set<() => void>()
const SHOW_MS = 2600

/** Feiern auslösen (mehrfacher Aufruf innerhalb weniger Sekunden zählt einmal) */
export function celebrate() {
  if (Date.now() - shownAt < SHOW_MS) return
  shownAt = Date.now()
  listeners.forEach((l) => l())
  navigator.vibrate?.([30, 50, 30])
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const COLORS = ['var(--accent)', 'var(--honey-600)', 'var(--success-fill)', 'var(--person-a)', 'var(--person-b)', 'var(--coral-400)']
// feste Werte, damit jedes Konfetti seinen Weg behält
const BITS = Array.from({ length: 42 }, (_, i) => ({
  x: ((i * 47) % 100) - 50,
  y: -((i * 31) % 60) - 30,
  r: (i * 97) % 360,
  d: (i * 13) % 300,
  c: COLORS[i % COLORS.length],
  w: 6 + ((i * 7) % 6),
}))

export function Celebration() {
  const at = useSyncExternalStore(subscribe, () => shownAt)
  const active = at > 0 && Date.now() - at < SHOW_MS
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => listeners.forEach((l) => l()), SHOW_MS)
    return () => clearTimeout(t)
  }, [active, at])
  if (!active) return null
  return (
    <div key={at} className="hb-celebrate" role="status" aria-live="polite">
      <div className="hb-celebrate-burst" aria-hidden="true">
        {BITS.map((b, i) => (
          <i
            key={i}
            style={{
              background: b.c,
              width: b.w,
              animationDelay: `${b.d}ms`,
              ['--x' as string]: `${b.x}vw`,
              ['--y' as string]: `${b.y}vh`,
              ['--r' as string]: `${b.r + 540}deg`,
            }}
          />
        ))}
      </div>
      <span className="hb-celebrate-pill">Alles erledigt für heute</span>
    </div>
  )
}
