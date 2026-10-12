import { useMemo, useRef, useState } from 'react'
import { euro } from './finStore'

export type BalancePoint = { d: string; v: number }

/**
 * Kontoverlauf als ruhige Kurve mit Fläche (12.10.2026). Aus den Tagessummen aller Buchungen aufaddiert; ohne
 * eingetragenen Kontostand zeigt sie die Veränderung seit Beginn (0 = Start). Finger/Maus darüber zeigt Tag und Stand.
 */
export function BalanceChart({ points, height = 190 }: { points: BalancePoint[]; height?: number }) {
  const W = 600
  const H = height
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const geo = useMemo(() => {
    if (points.length < 2) return null
    const vals = points.map((p) => p.v)
    const min = Math.min(...vals, 0)
    const max = Math.max(...vals, 0)
    const pad = (max - min) * 0.1 || 1
    const lo = min - pad
    const hi = max + pad
    const x = (i: number) => (i / (points.length - 1)) * W
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
    const area = `${line}L${W},${H}L0,${H}Z`
    // Monatsanfänge als Raster
    const ticks = points.flatMap((p, i) => (p.d.endsWith('-01') ? [{ i, label: new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' }).format(new Date(`${p.d}T12:00:00Z`)) }] : []))
    const iMin = vals.indexOf(Math.min(...vals))
    const iMax = vals.indexOf(Math.max(...vals))
    return { line, area, zero: y(0), ticks, x, y, iMin, iMax, lo, hi }
  }, [points, H])

  if (!geo) return <div className="hb-depot-chart is-empty" style={{ height }} />
  const pct = (i: number) => `${(i / (points.length - 1)) * 100}%`
  const top = (v: number) => `${(geo.y(v) / H) * 100}%`
  // Beschriftung am Rand nicht abschneiden: links bündig bzw. rechts bündig statt mittig
  const edge = (i: number) => (i < points.length * 0.15 ? 'is-start' : i > points.length * 0.85 ? 'is-end' : '')
  const at = hover !== null ? points[hover] : null
  const day = (d: string) => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

  function move(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    setHover(Math.round(f * (points.length - 1)))
  }

  return (
    <div className="hb-bal">
      <div ref={box} className="hb-bal-plot" style={{ height }} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        <svg className="hb-bal-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="hb-bal-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--pine-400)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--pine-400)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {geo.ticks.map((t) => (
            <line key={t.i} x1={geo.x(t.i)} x2={geo.x(t.i)} y1={0} y2={H} className="hb-bal-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {geo.lo < 0 && geo.hi > 0 && <line x1={0} x2={W} y1={geo.zero} y2={geo.zero} className="hb-bal-zero" vectorEffect="non-scaling-stroke" />}
          <path d={geo.area} fill="url(#hb-bal-fill)" className="hb-bal-area" />
          <path d={geo.line} className="hb-bal-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover === null && (
          <>
            <span className={`hb-bal-tag is-max ${edge(geo.iMax)}`} style={{ left: pct(geo.iMax), top: top(points[geo.iMax].v) }}>
              {euro(points[geo.iMax].v)}
            </span>
            <span className={`hb-bal-tag is-min ${edge(geo.iMin)}`} style={{ left: pct(geo.iMin), top: top(points[geo.iMin].v) }}>
              {euro(points[geo.iMin].v)}
            </span>
          </>
        )}
        {at && hover !== null && (
          <>
            <span className="hb-bal-cursor" style={{ left: pct(hover) }} />
            <span className="hb-bal-dot" style={{ left: pct(hover), top: top(at.v) }} />
            <span className={`hb-bal-tip ${hover > points.length / 2 ? 'is-left' : ''}`} style={{ left: pct(hover) }}>
              <b>{euro(at.v)}</b>
              <span>{day(at.d)}</span>
            </span>
          </>
        )}
      </div>
      <div className="hb-bal-axis">
        {geo.ticks.map((t, k) => (
          <span key={t.i} style={{ left: pct(t.i) }}>
            {k % (geo.ticks.length > 7 ? 2 : 1) === 0 ? t.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Tagessummen → Verlauf pro Tag (lückenlos bis heute). Mit Anker (Saldo der Bank am Tag `on`) wird die Kurve so
 * verschoben, dass sie an diesem Tag genau den Saldo trifft; alles danach (z. B. Apple Pay) rechnet weiter.
 */
export function balanceSeries(daily: [string, number][], today: string, anchor: { amount: number; on: string } | null): BalancePoint[] {
  if (!daily.length) return []
  const sums = new Map(daily.map(([d, v]) => [d, Number(v)]))
  const out: BalancePoint[] = []
  let cum = 0
  const d = new Date(`${daily[0][0]}T12:00:00Z`)
  const end = today > daily[daily.length - 1][0] ? today : daily[daily.length - 1][0]
  for (;;) {
    const key = d.toISOString().slice(0, 10)
    if (key > end) break
    cum += sums.get(key) ?? 0
    out.push({ d: key, v: Math.round(cum * 100) / 100 })
    d.setUTCDate(d.getUTCDate() + 1)
  }
  if (!anchor) return out
  const at = [...out].reverse().find((p) => p.d <= anchor.on) ?? out[0]
  const shift = anchor.amount - at.v
  return out.map((p) => ({ d: p.d, v: Math.round((p.v + shift) * 100) / 100 }))
}
