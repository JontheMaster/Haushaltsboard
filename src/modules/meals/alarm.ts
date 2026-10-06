// Weckton für abgelaufene Timer.
// iPad/iPhone spielen Ton aus einer Webseite nur ab, wenn er einmal direkt durch einen Fingertipp gestartet wurde,
// und Web Audio ist dort bei aktivem Lautlos-Schalter stumm. Deshalb:
// 1. Ton als echte Audiodatei (<audio>), beim ersten Tippen einmal stumm „angespielt“ und damit freigeschaltet.
// 2. audioSession „playback“ (Safari 16.4+): wie ein Video, nicht wie ein Klingelton → läuft auch im Lautlos-Modus.
// 3. Web Audio als Reserve für andere Browser.

const RATE = 22050

/** WAV mit drei kurzen Pieptönen (880 Hz) erzeugen, ohne Datei im Repo */
function beepWav(): string {
  const tone = 0.22
  const gap = 0.12
  const total = 3 * (tone + gap)
  const n = Math.floor(total * RATE)
  const data = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const slot = t % (tone + gap)
    if (slot >= tone) continue
    // weich ein- und ausblenden, sonst knackt es
    const env = Math.min(1, slot / 0.01, (tone - slot) / 0.02)
    data[i] = Math.round(Math.sin(2 * Math.PI * 880 * t) * 0.6 * env * 32767)
  }
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  new Int16Array(buf, 44).set(data)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
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
    el ??= Object.assign(new Audio(beepWav()), { preload: 'auto' })
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

/** Drei Pieptöne */
export function ring() {
  if (el) {
    el.currentTime = 0
    el.muted = false
    el.play().catch(() => webBeep())
    return
  }
  webBeep()
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
