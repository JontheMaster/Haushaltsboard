// Weckton für abgelaufene Timer.
// iPad/iPhone spielen Ton aus einer Webseite nur ab, wenn er einmal direkt durch einen Fingertipp gestartet wurde,
// und Web Audio ist dort bei aktivem Lautlos-Schalter stumm. Deshalb:
// 1. Ton als echte Audiodatei (<audio>), beim ersten Tippen einmal stumm „angespielt“ und damit freigeschaltet.
// 2. audioSession „playback“ (Safari 16.4+): wie ein Video, nicht wie ein Klingelton → läuft auch im Lautlos-Modus.
// 3. Web Audio als Reserve für andere Browser.
// Am Wand-Tablet (Fully Kiosk) spielt Fully den Ton selbst (`fully.playSound`), dort braucht es kein Tippen.

/** Töne für fertige Timer (public/sounds, erzeugt mit scripts/build-sounds.mjs); Auswahl in `modules.config.timer_sound` von `nfc` */
export const SOUNDS = [
  { id: 'gong', label: 'Sanfter Gong' },
  { id: 'glocke', label: 'Glockenspiel' },
  { id: 'piep', label: 'Kurz piepen' },
] as const
export type SoundId = (typeof SOUNDS)[number]['id']
export const DEFAULT_SOUND: SoundId = 'gong'

const soundUrl = (id: SoundId) => new URL(`${import.meta.env.BASE_URL}sounds/${id}.wav`, location.href).href

let current: SoundId = DEFAULT_SOUND

/** Gewählten Ton setzen (das Board liest ihn aus den Einstellungen) */
export function setAlarmSound(id: string | undefined) {
  const next = SOUNDS.some((s) => s.id === id) ? (id as SoundId) : DEFAULT_SOUND
  if (next === current) return
  current = next
  if (el) {
    el.src = soundUrl(next)
    el.load()
  }
}

type FullySound = { playSound?: (url: string, loop: boolean, stream?: number) => void }
/** Android-Lautstärke „Medien“ (Stream 3 in Fully), also die normale Lautstärke des Tablets */
const MUSIC_STREAM = 3

/**
 * Fully Kiosk (Wand-Tablet) spielt den Ton selbst ab, ohne dass vorher jemand tippen musste
 * (Browser erlauben Ton sonst erst nach einer Berührung; nach jedem Neuladen der Seite wäre der Timer stumm).
 */
function fullyPlay(id: SoundId): boolean {
  const fully = (window as unknown as { fully?: FullySound }).fully
  if (typeof fully?.playSound !== 'function') return false
  try {
    fully.playSound(soundUrl(id), false, MUSIC_STREAM)
    return true
  } catch {
    return false
  }
}

let el: HTMLAudioElement | null = null
let ctx: AudioContext | null = null
let unlocked = false

/** Bei jedem Tippen im Kochmodus aufrufen: schaltet den Ton für später frei */
export function unlockAudio() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch {
    // ältere Browser
  }
  try {
    el ??= Object.assign(new Audio(soundUrl(current)), { preload: 'auto' })
    if (!unlocked) {
      // einmal stumm abspielen, das zählt als „vom Nutzer gestartet“
      el.muted = true
      el.play()
        .then(() => {
          el!.pause()
          el!.currentTime = 0
          el!.muted = false
          unlocked = true
        })
        .catch(() => {
          if (el) el.muted = false
        })
    }
  } catch {
    // kein Audio-Element
  }
  try {
    ctx ??= new AudioContext()
    if (ctx.state !== 'running') ctx.resume()
  } catch {
    // ohne Web Audio
  }
}

/** Gewählten Ton einmal abspielen (`id` zum Probehören in den Einstellungen) */
export function ring(id: SoundId = current) {
  if (fullyPlay(id)) return
  if (id !== current || !el) {
    // Probehören eines anderen Tons (Fingertipp, darf also sofort spielen)
    new Audio(soundUrl(id)).play().catch(() => webBeep())
    return
  }
  el.currentTime = 0
  el.muted = false
  el.play().catch(() => webBeep())
}

function webBeep() {
  if (!ctx) return
  if (ctx.state !== 'running') ctx.resume()
  const t0 = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.35)
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0 + i * 0.35)
    osc.stop(t0 + i * 0.35 + 0.3)
  }
}
