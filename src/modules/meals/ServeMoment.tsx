import { useEffect } from 'react'

/** So lange läuft der Moment, dann schließt der Kochmodus von selbst */
const DURATION_MS = 3600

// Funken rund um den Teller: Position (x, y im viewBox), Größe, Verzögerung
const SPARKS = [
  { x: 38, y: 70, s: 1, d: 1050 },
  { x: 205, y: 62, s: 1.2, d: 1150 },
  { x: 22, y: 128, s: 0.8, d: 1300 },
  { x: 220, y: 118, s: 0.9, d: 1250 },
  { x: 70, y: 34, s: 0.7, d: 1400 },
  { x: 176, y: 30, s: 0.8, d: 1350 },
]

/**
 * „Fertig, guten Appetit“ im Kochmodus: der Teller fährt herein, die Servierglocke hebt sich mit Schwung,
 * Dampf steigt auf, Funken blitzen, dann „Guten Appetit“ mit dem Gericht. Antippen überspringt.
 */
export function ServeMoment({ title, onDone }: { title: string; onDone: () => void }) {
  useEffect(() => {
    navigator.vibrate?.([20, 60, 20])
    const t = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="hb-serve" role="status" aria-live="polite" onClick={onDone}>
      <svg className="hb-serve-art" viewBox="0 0 240 190" aria-hidden="true">
        {/* Schatten und Teller */}
        <ellipse className="hb-serve-shadow" cx="120" cy="164" rx="96" ry="12" />
        <g className="hb-serve-plate">
          <ellipse className="hb-serve-plate-rim" cx="120" cy="150" rx="96" ry="24" />
          <ellipse className="hb-serve-plate-in" cx="120" cy="148" rx="66" ry="14" />
          {/* das Essen: ein kleiner Hügel mit Kräutern */}
          <path className="hb-serve-food" d="M78 148c4-22 22-32 42-32s38 10 42 32z" />
          <circle className="hb-serve-herb" cx="104" cy="128" r="4" />
          <circle className="hb-serve-herb" cx="128" cy="122" r="3.5" />
          <circle className="hb-serve-herb" cx="142" cy="134" r="3" />
          <circle className="hb-serve-dot" cx="116" cy="136" r="3" />
        </g>
        {/* Dampf, steigt nach dem Abheben auf */}
        <g className="hb-serve-steam">
          <path pathLength={1} d="M100 112c-6-10 6-16 0-26s6-16 0-24" />
          <path pathLength={1} d="M120 106c-6-10 6-16 0-26s6-16 0-26" />
          <path pathLength={1} d="M140 112c-6-10 6-16 0-26s6-16 0-24" />
        </g>
        {/* Servierglocke */}
        <g className="hb-serve-cloche">
          <path className="hb-serve-dome" d="M34 148c0-50 38-84 86-84s86 34 86 84z" />
          <path className="hb-serve-shine" d="M66 120c6-20 22-36 42-42" />
          <rect className="hb-serve-band" x="28" y="144" width="184" height="8" rx="4" />
          <circle className="hb-serve-knob" cx="120" cy="58" r="9" />
        </g>
        {SPARKS.map((p, i) => (
          <path
            key={i}
            className="hb-serve-spark"
            transform={`translate(${p.x} ${p.y}) scale(${p.s})`}
            style={{ animationDelay: `${p.d}ms` }}
            d="M0-9c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z"
          />
        ))}
      </svg>
      <p className="hb-serve-title">Guten Appetit</p>
      <p className="hb-serve-dish">{title}</p>
    </div>
  )
}
