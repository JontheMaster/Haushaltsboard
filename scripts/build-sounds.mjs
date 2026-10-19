// Erzeugt die Töne für fertige Timer (public/sounds/*.wav), einmalig: node scripts/build-sounds.mjs
// Weich klingende Glocken aus wenigen Obertönen mit Abklingen, ohne fremde Audiodateien.
import { writeFileSync } from 'node:fs'

const RATE = 22050

/** Glockenschlag: Grundton + leicht unharmonische Obertöne, die unterschiedlich schnell abklingen */
function bell(out, start, freq, { len = 2, gain = 1, partials = [[1, 1, 1.6], [2, 0.35, 0.9], [2.76, 0.18, 0.6], [5.4, 0.06, 0.3]] } = {}) {
  const s0 = Math.floor(start * RATE)
  for (let i = 0; i < len * RATE && s0 + i < out.length; i++) {
    const t = i / RATE
    // weicher Anschlag (8 ms), sonst knackt es
    const attack = Math.min(1, t / 0.008)
    let v = 0
    for (const [ratio, amp, decay] of partials) v += amp * Math.exp(-t / (decay / 3)) * Math.sin(2 * Math.PI * freq * ratio * t)
    out[s0 + i] += v * attack * gain
  }
}

function tone(out, start, freq, len, gain) {
  const s0 = Math.floor(start * RATE)
  for (let i = 0; i < len * RATE; i++) {
    const t = i / RATE
    const env = Math.min(1, t / 0.015, (len - t) / 0.04)
    out[s0 + i] += Math.sin(2 * Math.PI * freq * t) * env * gain
  }
}

function wav(name, seconds, draw) {
  const buf = new Float64Array(Math.ceil(seconds * RATE))
  draw(buf)
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
  const n = buf.length
  const out = Buffer.alloc(44 + n * 2)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + n * 2, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(RATE, 24)
  out.writeUInt32LE(RATE * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round((buf[i] / peak) * 0.7 * 32767), 44 + i * 2)
  writeFileSync(`public/sounds/${name}.wav`, out)
  console.log(name, `${(out.length / 1024).toFixed(0)} KB`)
}

// Sanfter Gong: „Ding – dong“ (E5, C5), lange ausklingend
wav('gong', 3, (b) => {
  bell(b, 0, 659.25, { len: 2.2 })
  bell(b, 0.55, 523.25, { len: 2.4 })
})

// Glockenspiel: kurzes Arpeggio aufwärts (C6 E6 G6 C7)
wav('glocke', 2.2, (b) => {
  const notes = [1046.5, 1318.5, 1568, 2093]
  notes.forEach((f, i) => bell(b, i * 0.16, f, { len: 1.6, gain: i === 3 ? 0.9 : 0.7, partials: [[1, 1, 1.2], [3, 0.12, 0.25], [4.2, 0.05, 0.15]] }))
})

// Kurz piepen: drei weiche Töne wie bisher, etwas tiefer und leiser
wav('piep', 1.1, (b) => {
  for (let i = 0; i < 3; i++) tone(b, i * 0.34, 784, 0.2, 0.6)
})
