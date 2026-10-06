// Kochmodus und Timer: ein gemeinsamer Zustand für die ganze App (Wand und Handy).
// Solange gekocht wird, bleiben Bildschirmschoner und Nachtmodus aus.
import { useSyncExternalStore } from 'react'
import type { Recipe } from './recipeStore'

export type Timer = {
  id: string
  label: string
  /** Gesamtdauer in Sekunden */
  total: number
  /** Endzeitpunkt (ms), solange er läuft */
  endsAt: number | null
  /** verbleibende Sekunden, wenn pausiert */
  left: number
  done: boolean
}

type State = {
  session: { recipe: Recipe; servings: number; step: number } | null
  timers: Timer[]
}

let state: State = { session: null, timers: [] }
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useCook(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export function startCooking(recipe: Recipe, servings: number) {
  set({ session: { recipe, servings, step: 0 } })
}

export function stopCooking() {
  set({ session: null, timers: [] })
}

export function setStep(step: number) {
  if (state.session) set({ session: { ...state.session, step } })
}

export function setCookServings(servings: number) {
  if (state.session) set({ session: { ...state.session, servings } })
}

export function addTimer(label: string, seconds: number) {
  set({ timers: [...state.timers, { id: crypto.randomUUID(), label, total: seconds, endsAt: Date.now() + seconds * 1000, left: seconds, done: false }] })
}

export function toggleTimer(id: string) {
  set({
    timers: state.timers.map((t) => {
      if (t.id !== id || t.done) return t
      if (t.endsAt) return { ...t, endsAt: null, left: Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)) }
      return { ...t, endsAt: Date.now() + t.left * 1000 }
    }),
  })
}

export function removeTimer(id: string) {
  set({ timers: state.timers.filter((t) => t.id !== id) })
}

/** Abgelaufene Timer markieren; gibt die gerade fertig gewordenen zurück */
export function tickTimers(): Timer[] {
  const now = Date.now()
  const finished = state.timers.filter((t) => !t.done && t.endsAt && t.endsAt <= now)
  if (finished.length) set({ timers: state.timers.map((t) => (finished.includes(t) ? { ...t, done: true, endsAt: null, left: 0 } : t)) })
  return finished
}

/** Sekunden, die noch fehlen */
export function remaining(t: Timer, now = Date.now()): number {
  return t.endsAt ? Math.max(0, Math.ceil((t.endsAt - now) / 1000)) : t.left
}

/**
 * Zeitangaben in einem Schritt: „20 Minuten“, „10–12 Min.“, „1 Stunde“, „1,5 Std“, „30 Sekunden“.
 * Bei Spannen („10–12 Min.“) gilt die kleinere Zahl, damit man rechtzeitig nachschaut.
 */
export function findTimes(text: string): { label: string; seconds: number }[] {
  const re = /(\d+(?:[,.]\d+)?|einer?|eine halbe|einhalb|halbe?n?)\s*(?:(?:-|–|bis)\s*(\d+(?:[,.]\d+)?)\s*)?(Minuten|Minute|Min\.?|Stunden|Stunde|Std\.?|Sekunden|Sek\.?)(?![a-zäöü])/gi
  const out: { label: string; seconds: number }[] = []
  for (const m of text.matchAll(re)) {
    const word = m[1].toLowerCase()
    const n = word.startsWith('ein') && !word.includes('halb') ? 1 : word.includes('halb') ? 0.5 : Number(word.replace(',', '.'))
    if (!n) continue
    const unit = m[3].toLowerCase()
    const factor = unit.startsWith('st') ? 3600 : unit.startsWith('sek') ? 1 : 60
    const seconds = Math.round(n * factor)
    if (seconds < 10 || seconds > 12 * 3600) continue
    if (!out.some((o) => o.seconds === seconds)) out.push({ label: m[0].trim(), seconds })
  }
  return out
}

/** 75 → „1:15“, 3700 → „1:01:40“ */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
