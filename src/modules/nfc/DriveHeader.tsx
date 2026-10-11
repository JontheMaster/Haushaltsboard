import { Car, House } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { useNow } from '../../lib/time'
import type { TileProps } from '../types'

/** So lange bleibt die Kachel nach der Ankunft stehen („Angekommen“) */
const SHOW_ARRIVED_MIN = 3

type Point = [number, number]
type Drive = {
  id: string
  member: string
  started_at: string
  progress: number
  eta: string
  delay_s: number
  checked_at: string
  arrived_at: string | null
  route: Point[]
  length_m: number
  jams: [number, number][]
  origin_label: string | null
}

const hhmm = (iso: string | number) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const km = (m: number) => (m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')

/** Laufende Heimwege (und gerade angekommene), live */
function useDrives(): Drive[] {
  const [drives, setDrives] = useState<Drive[]>([])
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 3 * 3600_000).toISOString()
    const { data } = await supabase
      .from('drives')
      .select('id, member, started_at, progress, eta, delay_s, checked_at, arrived_at, route, length_m, jams, origin_label')
      .is('cancelled_at', null)
      .gt('started_at', since)
      .order('started_at')
    setDrives((data ?? []) as unknown as Drive[])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`drives-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drives' }, load)
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])
  return drives
}

/** Heimwege, die gerade zu sehen sind (unterwegs oder erst vor Kurzem angekommen) */
function useVisibleDrives(everyMs: number) {
  const drives = useDrives()
  const now = useNow(everyMs).getTime()
  return { now, drives: drives.filter((d) => !d.arrived_at || now - Date.parse(d.arrived_at) < SHOW_ARRIVED_MIN * 60_000) }
}

/** Für die Registry: Heimweg-Kachel liegt an der Wand vorn im Stapel, solange jemand heimfährt */
export function useDriveShow(): boolean {
  return useVisibleDrives(30_000).drives.length > 0
}

/**
 * Anteil der Strecke jetzt: der Server schätzt alle 2 Minuten (progress zum Zeitpunkt checked_at),
 * dazwischen rückt das Auto gleichmäßig weiter bis zur Ankunft.
 */
function shareNow(d: Drive, now: number): number {
  if (d.arrived_at) return 1
  const checked = Date.parse(d.checked_at)
  const eta = Date.parse(d.eta)
  const f = eta > checked ? Math.min(1, Math.max(0, (now - checked) / (eta - checked))) : 1
  return Math.min(1, d.progress + (1 - d.progress) * f)
}

function distanceM(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/**
 * Echte Strecke als ruhiger Bogen in einem Kasten W × H (wie im Entwurf, keine Straßenkarte):
 * gedreht, damit der Start unten links und Zuhause oben rechts liegt (entlang der Diagonale, so füllt sie flache
 * Handy-Karten wie hohe Wand-Kacheln), gleichmäßig nach Strecke abgetastet und geglättet, damit Schlenker in der
 * Stadt (Kreisel, Blöcke) nicht als Knäuel erscheinen. Die Achsen werden getrennt eingepasst, höchstens 1 : 2 verzerrt.
 * `at(share)` liefert den Punkt nach dem Anteil der echten Strecke (Meter), `part(a, b)` das Stück dazwischen.
 */
function projectRoute(route: Point[], W: number, H: number, pad: number) {
  const N = 72
  const raw = route.length > 1 ? route : [[0, 0] as Point, [0, 0.01] as Point]
  const cosLat = Math.cos((raw[0][0] * Math.PI) / 180)
  const flat = raw.map(([la, lo]) => [lo * cosLat, -la] as Point)

  // gleichmäßig nach echter Strecke abtasten: Punkt k liegt bei Anteil k / (N − 1)
  const cum = [0]
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + distanceM(raw[i - 1], raw[i]))
  const total = cum[cum.length - 1] || 1
  const samples: Point[] = []
  for (let k = 0, i = 1; k < N; k++) {
    const m = (k / (N - 1)) * total
    while (i < flat.length - 1 && cum[i] < m) i++
    const f = cum[i] > cum[i - 1] ? Math.min(1, Math.max(0, (m - cum[i - 1]) / (cum[i] - cum[i - 1]))) : 0
    samples.push([flat[i - 1][0] + (flat[i][0] - flat[i - 1][0]) * f, flat[i - 1][1] + (flat[i][1] - flat[i - 1][1]) * f])
  }

  // glätten (gleitender Mittelwert, zweimal); zu den Enden hin wird das Fenster kleiner, Start und Ziel bleiben fest
  let smooth = samples
  for (let pass = 0; pass < 2; pass++) {
    smooth = smooth.map((_, i) => {
      const w = Math.min(6, i, N - 1 - i)
      let x = 0
      let y = 0
      for (let j = i - w; j <= i + w; j++) {
        x += smooth[j][0]
        y += smooth[j][1]
      }
      return [x / (2 * w + 1), y / (2 * w + 1)] as Point
    })
  }

  // drehen: Start → Zuhause entlang der Diagonale von unten links nach oben rechts
  const [sx, sy] = smooth[0]
  const [ex, ey] = smooth[N - 1]
  const ang = Math.atan2(-(H - 2 * pad), W - 2 * pad) - Math.atan2(ey - sy, ex - sx)
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const rot = smooth.map(([x, y]) => [(x - sx) * c - (y - sy) * s, (x - sx) * s + (y - sy) * c])
  const xs = rot.map((p) => p[0])
  const ys = rot.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const rangeX = Math.max(...xs) - minX || 1e-9
  const rangeY = Math.max(...ys) - minY || 1e-9
  let scaleX = (W - 2 * pad) / rangeX
  let scaleY = (H - 2 * pad) / rangeY
  scaleX = Math.min(scaleX, scaleY * 2)
  scaleY = Math.min(scaleY, scaleX * 2)
  const offX = (W - 2 * pad - rangeX * scaleX) / 2
  const offY = (H - 2 * pad - rangeY * scaleY) / 2
  const pts: Point[] = rot.map(([x, y]) => [pad + offX + (x - minX) * scaleX, pad + offY + (y - minY) * scaleY])

  const at = (t: number): Point => {
    const v = Math.min(1, Math.max(0, t)) * (N - 1)
    const i = Math.min(N - 2, Math.floor(v))
    const f = v - i
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]
  }
  const part = (a: number, b: number): string => {
    const inner = pts.filter((_, i) => i / (N - 1) > a && i / (N - 1) < b)
    return [at(a), ...inner, at(b)].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  }
  return { all: part(0, 1), at, part }
}

/** Größe eines Elements in CSS-Pixeln (für die Karte der Strecke) */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

/** Beim Erscheinen fährt das Auto einmal vom Start bis zur jetzigen Stelle (1,4 s), danach folgt es der Zeit */
function useIntro(target: number): number {
  const [shown, setShown] = useState(0)
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      done.current = true
      return
    }
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const f = Math.min(1, (t - t0) / 1400)
      setShown(1 - (1 - f) ** 3)
      if (f < 1) raf = requestAnimationFrame(step)
      else done.current = true
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])
  return done.current ? target : target * shown
}

/** Die echte Strecke: gestrichelt der ganze Weg, in Personenfarbe das Geschaffte, rot die Staus, Auto und Haus */
function RouteMap({ d, share, arrived }: { d: Drive; share: number; arrived: boolean }) {
  const { ref, w, h } = useSize<HTMLDivElement>()
  const pad = 22
  const map = useMemo(() => (w && h ? projectRoute(d.route, w, h, pad) : null), [d.route, w, h])
  const intro = useIntro(share)
  const car = map?.at(intro)
  const home = map?.at(1)
  const start = map?.at(0)
  return (
    <div ref={ref} className="hb-drive-map">
      {map && car && home && start && (
        <>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            <polyline className="hb-drive-route" points={map.all} />
            {d.jams
              .filter(([, b]) => b > intro)
              .map(([a, b], i) => (
                <polyline key={i} className="hb-drive-jamline" points={map.part(Math.max(a, intro), b)} />
              ))}
            {intro > 0.001 && <polyline className="hb-drive-doneline" points={map.part(0, intro)} />}
            <circle className="hb-drive-start" cx={start[0]} cy={start[1]} r={6} />
          </svg>
          <span className="hb-drive-house" style={{ left: home[0], top: home[1] }}>
            <Icon icon={House} size={20} />
          </span>
          {!arrived && (
            <span className="hb-drive-car" style={{ left: car[0], top: car[1] }}>
              <Icon icon={Car} size={20} />
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** Eine Heimweg-Karte wie im Entwurf: Person, Restzeit groß, Ankunft und km, Strecke mit fahrendem Auto */
function DriveLive({ d, now, variant }: { d: Drive; now: number; variant: 'wall' | 'phone' }) {
  const { byId, personKey } = useMembers()
  const name = byId.get(d.member)?.name ?? ''
  const share = shareNow(d, now)
  const arrived = !!d.arrived_at || share >= 1
  const leftMin = Math.max(0, Math.ceil((Date.parse(d.eta) - now) / 60_000))
  const jam = Math.round(d.delay_s / 60)
  const jamAhead = d.jams.some(([, b]) => b > share)
  const pct = Math.round(share * 100)

  async function stop() {
    if (arrived) return
    if (!confirm('Heimweg beenden?')) return
    await supabase.from('drives').update({ cancelled_at: new Date().toISOString() }).eq('id', d.id)
  }

  return (
    <button
      type="button"
      className={`hb-drive hb-drive-${variant} hb-person-${personKey(d.member)} ${arrived ? 'is-arrived' : ''}`}
      aria-label={arrived ? `${name} ist zuhause` : `${name} auf dem Heimweg, noch ${leftMin} Minuten, Ankunft ${hhmm(d.eta)}`}
      onClick={stop}
    >
      <span className="hb-drive-top">
        <span className="hb-drive-avatar">{name.charAt(0)}</span>
        <span className="hb-drive-title">{arrived ? `${name} ist zuhause` : `${name} ist auf dem Heimweg`}</span>
        <span className="hb-drive-badge">{arrived ? 'Angekommen' : 'Live'}</span>
      </span>
      <span className="hb-drive-main">
        {arrived ? (
          <span className="hb-drive-min is-home">Da</span>
        ) : (
          <span className="hb-drive-min">
            {leftMin <= 1 ? 'gleich' : leftMin}
            {leftMin > 1 && <small>Min</small>}
          </span>
        )}
        <span className="hb-drive-meta">
          {arrived ? (
            <span>
              Angekommen <b>{hhmm(d.arrived_at ?? d.eta)}</b>
            </span>
          ) : (
            <span>
              Ankunft <b>{hhmm(d.eta)}</b> · <b>{km(d.length_m * (1 - share))}</b> km
            </span>
          )}
          {!arrived && jam >= 2 && jamAhead && <span className="hb-drive-jam">Stau, +{jam} Min</span>}
          {!arrived && jam >= 2 && !jamAhead && <span className="hb-drive-jam">+{jam} Min durch Verkehr</span>}
        </span>
      </span>
      <RouteMap d={d} share={share} arrived={arrived} />
      <span className="hb-drive-foot">
        <span>{d.origin_label ?? 'Start'}</span>
        <span>{arrived ? 'geschafft' : `${pct} % geschafft`}</span>
        <span>Zuhause</span>
      </span>
    </button>
  )
}

/**
 * Heimweg mit dem Auto (NFC-Baustein „Heimweg“), Live-Kachel nach Jonathans Entwurf (11.10.2026).
 * Handy: oben auf Start. Wand: eigene Kachel vorn im Stapel auf dem Wetter (`DriveTile`), nicht in der Kopfzeile.
 * Antippen beendet die Fahrt (z. B. wenn man doch nicht heimfährt).
 */
export function DriveHeader({ variant }: { variant: 'wall' | 'phone' }) {
  const { drives, now } = useVisibleDrives(1000)
  if (variant === 'wall' || !drives.length) return null
  return (
    <>
      {drives.map((d) => (
        <DriveLive key={d.id} d={d} now={now} variant="phone" />
      ))}
    </>
  )
}

/** Wand: Kachel im Stapel (kommt von selbst nach vorn, solange jemand heimfährt) */
export function DriveTile({ delay }: TileProps) {
  const { drives, now } = useVisibleDrives(1000)
  return (
    <section className="hb-tile hb-drive-tile" style={{ animationDelay: `${delay}ms` }} aria-label="Heimweg">
      {drives.map((d) => (
        <DriveLive key={d.id} d={d} now={now} variant="wall" />
      ))}
    </section>
  )
}
