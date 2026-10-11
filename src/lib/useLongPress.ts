import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** So lange muss der Finger still liegen */
const LONG_PRESS_MS = 600

/**
 * Langes Drücken (Finger bleibt still, höchstens 8 px Bewegung). Danach wird das folgende Antippen geschluckt:
 * im onClick zuerst `fired.current` prüfen. Genutzt für Karten oben (Essen, Wochenrückblick): lange drücken = ausblenden.
 */
export function useLongPress(onLong: () => void) {
  const fired = useRef(false)
  const stop = useRef<(() => void) | null>(null)
  const onPointerDown = (e: ReactPointerEvent) => {
    fired.current = false
    stop.current?.()
    const x = e.clientX
    const y = e.clientY
    const timer = setTimeout(() => {
      fired.current = true
      cleanup()
      onLong()
    }, LONG_PRESS_MS)
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 8) cleanup()
    }
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', cleanup, true)
      window.removeEventListener('pointercancel', cleanup, true)
      stop.current = null
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', cleanup, true)
    window.addEventListener('pointercancel', cleanup, true)
    stop.current = cleanup
  }
  return { fired, onPointerDown }
}
