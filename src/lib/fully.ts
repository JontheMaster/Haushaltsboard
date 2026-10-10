// Fully Kiosk (Wand-Tablet): Bewegung vor der Frontkamera an die Seite melden.
// Braucht in Fully „Motion Detection“ und „JavaScript Interface“ (beides Fully PLUS). Ohne Fully passiert nichts.

/** Event, das bei erkannter Bewegung auf window ausgelöst wird */
export const MOTION_EVENT = 'hb-motion'

type Fully = { bind?: (event: string, code: string) => void }

let bound = false

/** Einmalig bei Fully anmelden: jede erkannte Bewegung löst `hb-motion` aus */
export function bindFullyMotion(): boolean {
  const fully = (window as unknown as { fully?: Fully }).fully
  if (bound || typeof fully?.bind !== 'function') return bound
  fully.bind('onMotion', `window.dispatchEvent(new Event('${MOTION_EVENT}'))`)
  bound = true
  return true
}
