import { ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { levelToMmh } from '../../../supabase/functions/_shared/radarGrid.ts'
import type { Radar } from './radarStore'

/** Hintergrundkarte (aus scripts/build-radar-map.mjs, © OpenStreetMap-Mitwirkende), erst bei Bedarf geladen */
type RadarMap = {
  width: number
  height: number
  boundary: string
  water: string
  motorway: string
  places: { name: string; x: number; y: number; kind: string; near?: boolean }[]
}
let mapPromise: Promise<RadarMap> | null = null
const loadMap = () => (mapPromise ??= import('./radarMap.json').then((m) => m.default as RadarMap))

/** eine Schleife von −60 bis +120 min dauert so lange, danach kurze Pause auf dem letzten Bild */
const LOOP_MS = 7000
const HOLD_MS = 1000
const SCALE = 4
/** Ausschnitt „Nah“ in km (Pixeln), um das Zuhause; „Weit“ = der ganze Ausschnitt (ca. 80 km) */
const NEAR_KM = 36
const ZOOM_KEY = 'hb-radar-zoom'

type Rgb = [number, number, number]
const hex = (v: string): Rgb => {
  const h = v.trim().replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const lum = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/**
 * Farbtabelle Stufe → RGBA aus den Tokens (blue-200/400/600, ink), passend zum Theme: auf hellem Grund wird starker
 * Regen dunkler, auf dunklem Grund heller. Unter 0,1 mm/h durchsichtig, dann weich einblenden.
 */
function makeLut(): Uint8ClampedArray {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => hex(css.getPropertyValue(name) || '#000')
  const b2 = v('--blue-200')
  const b4 = v('--blue-400')
  const b6 = v('--blue-600')
  const ink = v('--ink')
  const dark = lum(v('--surface-sunken')) < 0.4
  // Stufen: leicht, mäßig, stark, Starkregen (mm/h-Grenzen wie im Nowcast)
  const stops: { mmh: number; c: Rgb; a: number }[] = dark
    ? [
        { mmh: 0.2, c: b6, a: 0.55 },
        { mmh: 2.5, c: b4, a: 0.75 },
        { mmh: 10, c: b2, a: 0.85 },
        { mmh: 15, c: mix(b2, ink, 0.6), a: 0.95 },
      ]
    : [
        // leicht etwas kräftiger als blue-200 pur, sonst verschwindet leichter Regen auf surface-sunken
        { mmh: 0.2, c: mix(b2, b4, 0.45), a: 0.7 },
        { mmh: 2.5, c: b4, a: 0.75 },
        { mmh: 10, c: b6, a: 0.85 },
        { mmh: 15, c: mix(b6, ink, 0.35), a: 0.95 },
      ]
  const lut = new Uint8ClampedArray(256 * 4)
  for (let l = 1; l < 256; l++) {
    const mmh = levelToMmh(l)
    let c: Rgb
    let a: number
    if (mmh < stops[0].mmh) {
      c = stops[0].c
      a = stops[0].a * Math.max(0, (mmh - 0.1) / 0.1)
    } else {
      const i = stops.findIndex((s) => mmh < s.mmh)
      if (i < 0) {
        c = stops[stops.length - 1].c
        a = stops[stops.length - 1].a
      } else {
        // zwischen zwei Stufen logarithmisch überblenden
        const s0 = stops[i - 1]
        const s1 = stops[i]
        const t = Math.log(mmh / s0.mmh) / Math.log(s1.mmh / s0.mmh)
        c = mix(s0.c, s1.c, t)
        a = s0.a + (s1.a - s0.a) * t
      }
    }
    lut.set([c[0], c[1], c[2], Math.round(a * 255)], l * 4)
  }
  return lut
}

const hm = (ms: number) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(ms))

/**
 * Radar-Ansicht der Wetter-Kachel: Karte im Raster des Radars, Regen als weiche Fläche, Zuhause als Punkt,
 * Schleife −60 bis +120 min mit Überblendung, Zeitleiste unten. Antippen pausiert auf „jetzt“, nochmal = weiter.
 * still = keine Schleife (Nachtmodus, reduzierte Bewegung): nur „jetzt“, Zeitleiste von Hand.
 */
export function RadarView({ radar, still, wall }: { radar: Radar; still: boolean; wall: boolean }) {
  const [map, setMap] = useState<RadarMap | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const small = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = radar.width
    c.height = radar.height
    return c
  }, [radar.width, radar.height])
  const lut = useMemo(makeLut, [radar])
  const [pos, setPos] = useState(radar.nowIndex)
  const [paused, setPaused] = useState(still)
  const posRef = useRef(pos)
  const playFrom = useRef(performance.now())
  // Zoom: „Nah“ (Standard, um das Zuhause) oder „Weit“, pro Gerät gemerkt
  const [near, setNear] = useState(() => {
    try {
      return localStorage.getItem(ZOOM_KEY) !== 'weit'
    } catch {
      return true
    }
  })
  const view = useMemo(() => {
    if (!near) return { x0: 0, y0: 0, s: radar.width }
    const s = Math.min(NEAR_KM, radar.width)
    const cx = radar.home ? radar.home.x + 0.5 : radar.width / 2
    const cy = radar.home ? radar.home.y + 0.5 : radar.height / 2
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
    return { x0: clamp(cx - s / 2, radar.width - s), y0: clamp(cy - s / 2, radar.height - s), s }
  }, [near, radar.width, radar.height, radar.home])
  const viewRef = useRef(view)
  viewRef.current = view
  const px = (x: number) => `${((x - view.x0) / view.s) * 100}%`
  const py = (y: number) => `${((y - view.y0) / view.s) * 100}%`
  // Kartengröße in px (für die Ortsnamen: nur so viele, wie ohne Überlappung passen)
  const mapEl = useRef<HTMLButtonElement>(null)
  const [mapPx, setMapPx] = useState(300)
  useEffect(() => {
    const el = mapEl.current
    if (!el) return
    const ro = new ResizeObserver(() => setMapPx(el.clientWidth || 300))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const labels = useMemo(() => {
    if (!map) return []
    type Box = { x0: number; y0: number; x1: number; y1: number }
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
    // freizuhaltende Flächen: Zeit oben links, Zoom oben rechts, OSM unten rechts, Zuhause-Punkt
    const taken: Box[] = [
      { x0: 0, y0: 0, x1: 110, y1: 34 },
      { x0: mapPx - 90, y0: 0, x1: mapPx, y1: 50 },
      { x0: mapPx - 150, y0: mapPx - 16, x1: mapPx, y1: mapPx },
    ]
    if (radar.home) {
      const hx = ((radar.home.x + 0.5 - view.x0) / view.s) * mapPx
      const hy = ((radar.home.y + 0.5 - view.y0) / view.s) * mapPx
      taken.push({ x0: hx - 9, y0: hy - 9, x1: hx + 9, y1: hy + 9 })
    }
    const out: { name: string; left: number; top: number; cls: string }[] = []
    for (const p of map.places) {
      if (p.near && !near) continue
      const fx = (p.x - view.x0) / view.s
      const fy = (p.y - view.y0) / view.s
      if (fx < 0.02 || fx > 0.98 || fy < 0.02 || fy > 0.98) continue
      const city = p.kind === 'city'
      const fs = (city ? 14 : 12) + (wall ? 2 : 0)
      const w = p.name.length * fs * 0.58 + 4
      const h = fs * 1.25
      const cx = fx * mapPx
      const cy = fy * mapPx
      // am Rand nach innen ausrichten, damit lange Namen nicht abgeschnitten werden
      const align = fx < 0.2 ? 'start' : fx > 0.8 ? 'end' : 'mid'
      const x0 = align === 'start' ? cx - 8 : align === 'end' ? cx - w + 8 : cx - w / 2
      const box = { x0, y0: cy - h / 2, x1: x0 + w, y1: cy + h / 2 }
      if (box.x0 < 0 || box.x1 > mapPx || taken.some((t) => hit(t, box))) continue
      taken.push(box)
      out.push({ name: p.name, left: fx * 100, top: fy * 100, cls: `${city ? 'is-city' : ''} ${align === 'mid' ? '' : `is-${align}`}` })
    }
    return out
  }, [map, near, view, mapPx, radar.home, wall])

  function switchZoom() {
    const next = !near
    setNear(next)
    try {
      localStorage.setItem(ZOOM_KEY, next ? 'nah' : 'weit')
    } catch {
      // nur Komfort
    }
  }

  useEffect(() => {
    loadMap().then(setMap)
  }, [])

  // neuer Stand oder Nachtmodus: auf „jetzt“
  useEffect(() => {
    setPaused(still)
    posRef.current = radar.nowIndex
    setPos(radar.nowIndex)
    playFrom.current = performance.now()
  }, [radar, still])

  // ein Bild (mit Überblendung zwischen zwei Radarbildern) malen
  function draw(p: number) {
    const ctx = small.getContext('2d')
    const out = canvas.current?.getContext('2d')
    if (!ctx || !out) return
    const i = Math.floor(p)
    const t = p - i
    const a = radar.frames[Math.min(i, radar.frames.length - 1)]
    const b = radar.frames[Math.min(i + 1, radar.frames.length - 1)]
    const img = ctx.createImageData(radar.width, radar.height)
    for (let k = 0; k < a.length; k++) {
      const l = Math.round(a[k] + (b[k] - a[k]) * t)
      if (!l) continue
      img.data[k * 4] = lut[l * 4]
      img.data[k * 4 + 1] = lut[l * 4 + 1]
      img.data[k * 4 + 2] = lut[l * 4 + 2]
      img.data[k * 4 + 3] = lut[l * 4 + 3]
    }
    ctx.putImageData(img, 0, 0)
    out.clearRect(0, 0, out.canvas.width, out.canvas.height)
    out.imageSmoothingEnabled = true
    out.imageSmoothingQuality = 'high'
    // nur den gewählten Ausschnitt (Nah/Weit) groß zeichnen
    const v = viewRef.current
    out.drawImage(small, v.x0, v.y0, v.s, v.s, 0, 0, out.canvas.width, out.canvas.height)
  }

  // Schleife
  useEffect(() => {
    if (paused) {
      draw(posRef.current)
      return
    }
    const span = radar.frames.length - 1 - radar.startIndex
    let raf = 0
    const tick = (now: number) => {
      const el = (now - playFrom.current) % (LOOP_MS + HOLD_MS)
      const p = radar.startIndex + Math.min(1, el / LOOP_MS) * span
      posRef.current = p
      draw(p)
      // Zeitleiste nur bei ganzen Bildern neu setzen (spart Renders)
      setPos((old) => (Math.round(old) === Math.round(p) ? old : p))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, radar, lut, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tippen auf die Karte: pausieren auf „jetzt“, nochmal tippen spielt weiter
  function toggle() {
    if (still) return
    if (!paused) {
      posRef.current = radar.nowIndex
      setPos(radar.nowIndex)
      setPaused(true)
    } else {
      playFrom.current = performance.now()
      setPaused(false)
    }
  }

  // Zeitleiste: ziehen spult von Hand (pausiert)
  const track = useRef<HTMLDivElement>(null)
  function scrub(e: React.PointerEvent) {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const p = radar.startIndex + f * (radar.frames.length - 1 - radar.startIndex)
    posRef.current = p
    setPos(p)
    setPaused(true)
    draw(p)
  }

  const span = radar.frames.length - 1 - radar.startIndex || 1
  const frac = (i: number) => `${((i - radar.startIndex) / span) * 100}%`
  const shownTime = radar.times[Math.round(pos)] ?? radar.times[radar.nowIndex]
  const isNow = Math.round(pos) === radar.nowIndex
  const future = Math.round(pos) > radar.nowIndex

  return (
    <div className={`hb-radar ${wall ? 'is-wall' : ''}`}>
      {/* Bühne: an der Wand füllt sie die Höhe, die Karte bleibt darin quadratisch */}
      <div className="hb-radar-stage">
        <button ref={mapEl} type="button" className="hb-radar-map" onClick={toggle} aria-label={paused ? 'Radar abspielen' : 'Radar anhalten, jetzt zeigen'}>
          <svg viewBox={`${view.x0} ${view.y0} ${view.s} ${view.s}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {map && (
              <>
                <path d={map.boundary} className="hb-radar-boundary" vectorEffect="non-scaling-stroke" />
                <path d={map.water} className="hb-radar-water" vectorEffect="non-scaling-stroke" />
                <path d={map.motorway} className="hb-radar-road" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
          <canvas ref={canvas} width={radar.width * SCALE} height={radar.height * SCALE} aria-hidden="true" />
          {map && (
            <span className="hb-radar-labels" aria-hidden="true">
              {labels.map((l) => (
                <span key={l.name} className={l.cls} style={{ left: `${l.left}%`, top: `${l.top}%` }}>
                  {l.name}
                </span>
              ))}
            </span>
          )}
          {radar.home && <span className="hb-radar-home" style={{ left: px(radar.home.x + 0.5), top: py(radar.home.y + 0.5) }} aria-label="Zuhause" />}
          <span className={`hb-radar-time ${future ? 'is-future' : ''}`}>{isNow ? `jetzt · ${hm(shownTime)}` : hm(shownTime)}</span>
          <span className="hb-radar-osm">© OpenStreetMap-Mitwirkende</span>
        </button>
        <button type="button" className="hb-radar-zoom" onClick={switchZoom} aria-label={near ? 'Weiter herauszoomen' : 'Näher heranzoomen'}>
          <Icon icon={near ? ZoomOut : ZoomIn} size={18} />
          {near ? 'Weit' : 'Nah'}
        </button>
      </div>
      <div
        ref={track}
        className="hb-radar-track"
        role="slider"
        aria-label="Zeit"
        aria-valuemin={-60}
        aria-valuemax={120}
        aria-valuenow={Math.round((shownTime - radar.times[radar.nowIndex]) / 60000)}
        aria-valuetext={hm(shownTime)}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          scrub(e)
        }}
        onPointerMove={(e) => e.buttons && scrub(e)}
      >
        <span className="hb-radar-past" style={{ width: frac(radar.nowIndex) }} />
        <span className="hb-radar-future" style={{ left: frac(radar.nowIndex) }} />
        <span className="hb-radar-now" style={{ left: frac(radar.nowIndex) }} />
        <span className="hb-radar-dot" style={{ left: frac(Math.min(pos, radar.frames.length - 1)) }} />
      </div>
      <div className="hb-radar-scale" aria-hidden="true">
        <span>−1 Std</span>
        <span style={{ left: frac(radar.nowIndex) }}>jetzt</span>
        <span>+2 Std</span>
      </div>
    </div>
  )
}
