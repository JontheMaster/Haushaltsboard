// Fully Kiosk (Wand-Tablet): Bewegung und Gesichter vor der Frontkamera an die Seite melden.
// Braucht in Fully „Motion Detection“ (+ „Detect Faces“) und „JavaScript Interface“ (Fully PLUS). Ohne Fully passiert nichts.

/** Event, das bei erkannter Bewegung auf window ausgelöst wird */
export const MOTION_EVENT = 'hb-motion'

type Fully = { bind?: (event: string, code: string) => void }

let bound = false

/**
 * Einmalig bei Fully anmelden: Bewegung (`onMotion`) und erkannte Gesichter (`facesDetected`, braucht in Fully
 * „Detect Faces“) lösen `hb-motion` aus. Bewegung allein reagiert vor allem auf Licht und Gehen; wer ruhig
 * davorsteht, wird erst über das Gesicht erkannt (10.10.2026).
 */
export function bindFullyMotion(): boolean {
  const fully = (window as unknown as { fully?: Fully }).fully
  if (bound || typeof fully?.bind !== 'function') return bound
  const fire = `window.dispatchEvent(new Event('${MOTION_EVENT}'))`
  fully.bind('onMotion', fire)
  fully.bind('facesDetected', fire)
  bound = true
  return true
}
