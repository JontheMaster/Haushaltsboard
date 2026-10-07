import { Droplet } from 'lucide-react'
import type { Weather } from '../clock-weather/weather'

const FROM = 6
const TO = 24
const W = 1000
const H = 200
// oben Platz für die Temperaturen, die Fläche reicht bis ganz unten (direkt darunter stehen die Uhrzeiten)
const TOP = 30
const BOTTOM = H
/** Regen erst ab dieser Wahrscheinlichkeit zeigen (sonst nur Rauschen) */
const RAIN_MIN = 30

/** Weiche Linie durch die Punkte (Catmull-Rom → Bézier) */
function smooth(points: [number, number][]): string {
  if (!points.length) return ''
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return d
}

/**
 * Der Tag auf einen Blick: Temperaturkurve 6–24 Uhr mit Fläche bis unten, darunter die Uhrzeiten.
 * Regen erscheint nur, wenn er wahrscheinlich ist: blaue Balken von unten mit Prozentangabe.
 */
export function DayCurve({ weather, today, nowHour, compact }: { weather: Weather; today: string; nowHour: number; compact?: boolean }) {
  // bis Mitternacht: 0 Uhr des nächsten Tages zählt als Stunde 24
  const midnight = (() => {
    const [y, m, d] = today.split('-').map(Number)
    return `${new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)}T00:00`
  })()
  const hourOf = (t: string) => (t === midnight ? 24 : Number(t.slice(11, 13)))
  const hours = weather.hours.filter((h) => (h.time.startsWith(today) && hourOf(h.time) >= FROM) || h.time === midnight)
  if (hours.length < 2) return null
  const temps = hours.map((h) => h.temp)
  const lo = Math.min(...temps) - 2
  const hi = Math.max(...temps) + 1
  const x = (hour: number) => ((hour - FROM) / (TO - FROM)) * W
  const y = (t: number) => BOTTOM - ((t - lo) / (hi - lo)) * (BOTTOM - TOP)
  const pts = hours.map((h) => [x(hourOf(h.time)), y(h.temp)] as [number, number])
  const line = smooth(pts)
  const area = `${line} L ${pts.at(-1)![0]} ${BOTTOM} L ${pts[0][0]} ${BOTTOM} Z`
  const labels = hours.filter((h) => hourOf(h.time) % 3 === 0)
  const rainy = hours.filter((h) => h.rain >= RAIN_MIN)
  // zusammenhängende Regenstunden → jeweils die Stunde mit der höchsten Wahrscheinlichkeit
  const peaks: typeof hours = []
  let run: typeof hours = []
  for (const h of [...hours, null]) {
    if (h && h.rain >= RAIN_MIN) run.push(h)
    else if (run.length) {
      peaks.push(run.reduce((a, b) => (b.rain > a.rain ? b : a)))
      run = []
    }
  }
  const barW = W / (TO - FROM + 1) - 12
  // Temperatur jetzt (zwischen zwei vollen Stunden geschätzt) für den Punkt auf der Kurve
  const before = hours.filter((h) => hourOf(h.time) <= nowHour).at(-1) ?? hours[0]
  const after = hours.find((h) => hourOf(h.time) > nowHour) ?? before
  const f = after === before ? 0 : nowHour - hourOf(before.time)
  const nowY = y(before.temp + (after.temp - before.temp) * f)

  return (
    <div className={`hb-curve ${compact ? 'is-compact' : ''}`}>
      <div className="hb-curve-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={area} className="hb-curve-area" />
          {rainy.map((h) => {
            const height = (h.rain / 100) * (BOTTOM - TOP) * 0.7
            return (
              <rect
                key={h.time}
                x={x(hourOf(h.time)) - barW / 2}
                y={BOTTOM - height}
                width={barW}
                height={height}
                rx={6}
                className="hb-curve-rain"
                style={{ animationDelay: `${700 + (hourOf(h.time) - FROM) * 40}ms` }}
              />
            )
          })}
          <path d={line} className="hb-curve-line" pathLength={1} />
          {nowHour >= FROM && nowHour <= TO && <line x1={x(nowHour)} x2={x(nowHour)} y1={nowY} y2={BOTTOM} className="hb-curve-now" />}
        </svg>
        {/* Beschriftung als HTML: bleibt scharf, egal wie breit die Karte ist */}
        {labels.map((h, i) => (
          <span
            key={h.time}
            className={`hb-curve-temp ${i === 0 ? 'is-first' : i === labels.length - 1 ? 'is-last' : ''}`}
            style={{ left: `${(x(hourOf(h.time)) / W) * 100}%`, top: `${(y(h.temp) / H) * 100}%` }}
          >
            {h.temp}°
          </span>
        ))}
        {/* jetzt: pulsierender Punkt auf der Kurve (als HTML, damit er rund bleibt) */}
        {nowHour >= FROM && nowHour <= TO && (
          <span className="hb-curve-dot" style={{ left: `${(x(nowHour) / W) * 100}%`, top: `${(nowY / H) * 100}%` }} aria-label="jetzt" />
        )}
      </div>
      {/* Regen: pro Regenphase nur der Höchstwert, in eigener Zeile unter der Kurve (über den Balken war er schlecht lesbar) */}
      {peaks.length > 0 && (
        <div className="hb-curve-rainrow">
          {peaks.map((h) => (
            <span key={h.time} style={{ left: `${(x(hourOf(h.time)) / W) * 100}%` }}>
              <Droplet size={compact ? 12 : 14} strokeWidth={2.25} aria-hidden="true" />
              {h.rain} %
            </span>
          ))}
        </div>
      )}
      <div className="hb-curve-hours">
        {labels.map((h) => (
          <span key={h.time} style={{ left: `${(x(hourOf(h.time)) / W) * 100}%` }}>
            {hourOf(h.time) === 24 ? 0 : hourOf(h.time)}
            {compact ? '' : ' Uhr'}
          </span>
        ))}
      </div>
    </div>
  )
}
