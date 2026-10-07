// Hintergrund-Szene des Morgen-Briefings über die ganze Seite.
// Zuerst das Wetter (Sonne geht auf, Wolken ziehen, Regen, Schnee, Nebel), danach die Jahreszeit
// (Farbe der Hügel, Blumen im Frühling, Blätter im Herbst, verschneite Hügel im Winter). Alles leise im Hintergrund.

export type SkyWeather = 'sun' | 'cloud' | 'rain' | 'snow' | 'fog'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** WMO-Wettercode → Wetterlage der Szene */
export function skyWeather(code: number): SkyWeather {
  if (code <= 1) return 'sun'
  if (code <= 3) return 'cloud'
  if (code <= 48) return 'fog'
  if (code <= 67 || (code >= 80 && code <= 82) || code >= 95) return 'rain'
  return 'snow'
}

/** Jahreszeit nach Monat (meteorologisch: März–Mai Frühling …) */
export function seasonOf(day: string): Season {
  const m = Number(day.slice(5, 7))
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

// feste Positionen, damit nichts bei jedem Neuzeichnen springt
const DROPS = Array.from({ length: 46 }, (_, i) => ({ left: (i * 37 + 11) % 100, delay: ((i * 0.31) % 1.8).toFixed(2), dur: (0.9 + ((i * 13) % 7) / 10).toFixed(2) }))
const FLAKES = Array.from({ length: 34 }, (_, i) => ({ left: (i * 43 + 7) % 100, delay: (-((i * 0.83) % 9)).toFixed(2), dur: 9 + ((i * 17) % 7), size: 5 + ((i * 7) % 6) }))
// negative Verzögerung: Blätter sind beim Öffnen schon unterwegs
const LEAVES = Array.from({ length: 9 }, (_, i) => ({ left: (i * 29 + 18) % 92, delay: (-i * 2.1).toFixed(1), dur: 14 + ((i * 5) % 6), tone: i % 3 }))
const FLOWERS = Array.from({ length: 14 }, (_, i) => ({ left: 34 + ((i * 47) % 64), bottom: 18 + ((i * 23) % 50), tone: i % 3 }))

function CloudShape({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 200 90" aria-hidden="true">
      <path d="M 30 80 C 6 80, 4 52, 26 48 C 24 24, 56 14, 72 32 C 82 6, 128 6, 134 36 C 160 26, 188 42, 180 66 C 196 72, 188 84, 172 82 Z" />
    </svg>
  )
}

export function SkyScene({ weather, season }: { weather: SkyWeather; season: Season }) {
  const wet = weather === 'rain' || weather === 'snow'
  return (
    <div className={`hb-sky is-${weather} is-${season}`} aria-hidden="true">
      {/* Sonne: bei Sonne voll, bei Wolken blass, bei Regen/Schnee/Nebel weg */}
      {!wet && weather !== 'fog' && (
        <>
          <span className="hb-sky-ring is-a" />
          <span className="hb-sky-ring is-b" />
          <span className="hb-sky-sun" />
        </>
      )}

      {/* Wolken ziehen über den Himmel */}
      {weather !== 'sun' && (
        <>
          <CloudShape className="hb-sky-cloud is-a" />
          <CloudShape className="hb-sky-cloud is-b" />
          <CloudShape className="hb-sky-cloud is-c" />
        </>
      )}

      {weather === 'rain' &&
        DROPS.map((d, i) => <i key={i} className="hb-sky-drop" style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }} />)}
      {weather === 'snow' &&
        FLAKES.map((f, i) => (
          <i
            key={i}
            className="hb-sky-flake"
            style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }}
          />
        ))}
      {weather === 'fog' && (
        <>
          <i className="hb-sky-fog is-a" />
          <i className="hb-sky-fog is-b" />
          <i className="hb-sky-fog is-c" />
        </>
      )}

      {/* Herbst: ab und zu ein Blatt, das herabsegelt (nicht zusätzlich bei Regen oder Schnee) */}
      {season === 'autumn' &&
        !wet &&
        LEAVES.map((l, i) => (
          <svg
            key={i}
            className={`hb-sky-leaf is-${l.tone}`}
            viewBox="0 0 20 20"
            style={{ left: `${l.left}%`, animationDelay: `${l.delay}s`, animationDuration: `${l.dur}s` }}
          >
            <path d="M 10 1 C 17 5, 18 13, 10 19 C 2 13, 3 5, 10 1 Z M 10 4 L 10 18" />
          </svg>
        ))}

      <span className="hb-sky-hill is-back" />
      <span className="hb-sky-hill is-front" />

      {/* Frühling: kleine Blumen auf dem vorderen Hügel */}
      {season === 'spring' &&
        FLOWERS.map((f, i) => <i key={i} className={`hb-sky-flower is-${f.tone}`} style={{ left: `${f.left}%`, bottom: f.bottom }} />)}
    </div>
  )
}
