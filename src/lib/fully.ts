// Fully Kiosk (Wand-Tablet): Bewegung und Gesichter vor der Frontkamera an die Seite melden.
// Braucht in Fully „Motion Detection“ (+ „Detect Faces“) und „JavaScript Interface“ (Fully PLUS). Ohne Fully passiert nichts.

/** Event, das bei erkannter Bewegung auf window ausgelöst wird */
export const MOTION_EVENT = 'hb-motion'

type Fully = { bind?: (event: string, code: string) => void }

let bound = false

/**
 * Einmalig bei Fully anmelden: Bewegung (`onMotion`) sofort und erkannte Gesichter (`facesDetected`, braucht in Fully
 * „Detect Faces“) nach 1,5 s lösen `hb-motion` aus. Bewegung allein reagiert vor allem auf Licht und Gehen; wer ruhig
 * davorsteht, wird erst über das Gesicht erkannt (10.10.2026).
 */
export function bindFullyMotion(): boolean {
  const fully = (window as unknown as { fully?: Fully }).fully
  if (bound || typeof fully?.bind !== 'function') return bound
  const fire = `window.dispatchEvent(new Event('${MOTION_EVENT}'))`
  fully.bind('onMotion', fire)
  // Gesicht: erst nach 1,5 s melden, damit der Bildschirmschoner nicht beim kurzen Hinschauen ausgeht (Wunsch Jonathan 13.10.2026)
  ;(window as unknown as { __hbFace?: () => void }).__hbFace = onFace
  fully.bind('facesDetected', 'window.__hbFace && window.__hbFace()')
  bound = true
  return true
}

/** so lange wartet ein erkanntes Gesicht, bevor es als Bewegung zählt */
export const FACE_DELAY_MS = 1500
let faceTimer: ReturnType<typeof setTimeout> | null = null

function onFace() {
  if (faceTimer) return
  faceTimer = setTimeout(() => {
    faceTimer = null
    window.dispatchEvent(new Event(MOTION_EVENT))
  }, FACE_DELAY_MS)
}
