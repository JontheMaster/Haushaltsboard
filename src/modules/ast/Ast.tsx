import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { useNow } from '../../lib/time'
import { setModuleConfig, useEnabledModules, useModuleConfig } from '../useModules'

// Der Ast im Wohnzimmer (Tapo-Steckdose, Wunsch Jonathan 21.10.2026). Tapo lässt sich nicht abfragen (keine offizielle
// Schnittstelle, die alte Cloud meldet die P100 als offline): Bescheid kommt aus einer Alexa-Routine („der Ast ist an/aus“,
// Intent AstSchalten in der Function `alexa`) und steht in modules „ast“ als { on, at }.

type AstConfig = { on: boolean; at: string | null }
/** Wurde er wohl ohne Alexa ausgeschaltet? Nach so vielen Stunden blendet das Board ihn sicherheitshalber aus */
const MAX_ON_HOURS = 4

export function useAstOn(): boolean {
  const enabled = useEnabledModules()
  const { on, at } = useModuleConfig<AstConfig>('ast', { on: false, at: null })
  const now = useNow(60_000).getTime()
  if (!enabled?.has('ast') || !on) return false
  return !at || now - Date.parse(at) < MAX_ON_HOURS * 3600_000
}

// Hauptzweig als weiches S von unten links nach oben rechts, dazu Seitentriebe mit kleinem Kringel am Ende
const MAIN = 'M2 118 C 18 114, 24 98, 38 88 S 60 80, 62 64 S 72 40, 92 36 S 110 24, 110 8'
const TWIGS = [
  'M38 88 C 28 84, 20 74, 22 62 C 23 54, 30 50, 33 54',
  'M62 64 C 74 66, 86 74, 90 84 C 92 89, 89 93, 85 91',
  'M92 36 C 88 28, 92 20, 99 18',
  'M48 83 C 50 76, 54 72, 56 70',
]

/** Kleiner gezeichneter Ast mit Lichtern unten links in der Ecke, nur solange er an ist; wächst herein, verschwindet sanft */
export function AstCorner({ variant }: { variant: 'wall' | 'phone' }) {
  const on = useAstOn()
  // nach dem Ausschalten noch kurz da, damit er ausblenden kann
  const [shown, setShown] = useState(on)
  useEffect(() => {
    if (on) return setShown(true)
    const t = setTimeout(() => setShown(false), 600)
    return () => clearTimeout(t)
  }, [on])
  // Lichter genau auf die Linien setzen (gleichmäßig entlang jedes Zweigs)
  const wood = useRef<SVGGElement>(null)
  const [lights, setLights] = useState<[number, number][]>([])
  useLayoutEffect(() => {
    if (!shown || !wood.current) return
    const pts: [number, number][] = []
    wood.current.querySelectorAll('path').forEach((p, i) => {
      const len = p.getTotalLength()
      const n = i === 0 ? 6 : i < 3 ? 1 : 0
      for (let k = 1; k <= n; k++) {
        const at = p.getPointAtLength((len * k) / (n + 0.6))
        pts.push([Math.round(at.x * 10) / 10, Math.round(at.y * 10) / 10])
      }
    })
    setLights(pts)
  }, [shown])
  // Handy: erst über der Reiterleiste anfangen, nichts davon verdecken
  const [bottom, setBottom] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (variant !== 'phone' || !shown) return
    const bar = document.querySelector('.hb-tabbar')
    const measure = () => setBottom(bar ? bar.getBoundingClientRect().height : undefined)
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [variant, shown])
  if (!shown) return null
  return (
    <div className={`hb-ast is-${variant} ${on ? '' : 'is-leaving'}`} style={bottom !== undefined ? { bottom } : undefined} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        {/* geschwungener Zweig aus der Ecke nach oben rechts, Seitentriebe rollen sich leicht ein */}
        <g className="hb-ast-wood" fill="none" strokeLinecap="round" ref={wood}>
          <path d={MAIN} strokeWidth="4.2" />
          {TWIGS.map((d, i) => (
            <path key={i} d={d} strokeWidth={i < 2 ? 2.4 : 1.8} />
          ))}
        </g>
        {/* ein paar Blättchen an den Enden */}
        <g className="hb-ast-leaf">
          <path d="M31 51 c -7 -1 -11 -7 -9 -12 c 6 1 10 6 9 12 z" />
          <path d="M87 91 c 2 -7 9 -10 13 -7 c -2 6 -8 9 -13 7 z" />
          <path d="M101 17 c -1 -7 4 -12 9 -11 c 0 6 -4 10 -9 11 z" />
          <path d="M55 71 c -5 -4 -5 -11 -1 -14 c 4 4 5 10 1 14 z" />
        </g>
        {/* kleine warme Lichter, entlang der Zweige verteilt */}
        <g className="hb-ast-lights">
          {lights.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.2" style={{ animationDelay: `${(i * 0.37) % 2.4}s` }} />
          ))}
        </g>
      </svg>
    </div>
  )
}

/** Alle Funktionen → Ast: Anleitung für die Alexa-Routinen und Zustand von Hand korrigieren */
export function AstSettings({ onBack }: { onBack: () => void }) {
  const on = useAstOn()
  const { at } = useModuleConfig<AstConfig>('ast', { on: false, at: null })
  const since = at ? new Date(at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : null
  const set = (v: boolean) => setModuleConfig('ast', { on: v, at: new Date().toISOString() })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ast" onBack={onBack} />
      <section className="hb-tile hb-tile-static gap-3">
        <p className="text-body text-ink">
          Gerade: <b>{on ? 'an' : 'aus'}</b>
          {since ? ` (gemeldet ${since})` : ''}
        </p>
        <p className="text-label text-ink-muted">
          Solange der Ast an ist, wächst an Wand und Handy unten links ein kleiner Ast mit Lichtern. Die Tapo-Steckdose selbst kann das Board nicht fragen,
          Bescheid kommt über Alexa. Ist er länger als {MAX_ON_HOURS} Stunden „an“, blendet das Board ihn aus (falls er ohne Alexa ausgeschaltet wurde).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => set(true)}>Als an markieren</Button>
          <Button variant="ghost" onClick={() => set(false)}>
            Als aus markieren
          </Button>
        </div>
      </section>
      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="font-semibold text-ink">Alexa-Routinen einrichten</h3>
        <ol className="hb-fin-steps">
          <li>Alexa-App → Mehr → Routinen → +. Name „Ast an“.</li>
          <li>Wenn: Sprache → „Ast an“ (oder was ihr sagen wollt).</li>
          <li>Aktion 1: Smart Home → Steckdose „Ast“ → Einschalten.</li>
          <li>Aktion 2: „Benutzerdefiniert“ → Text: „sag unserer Hausmaus der Ast ist an“.</li>
          <li>Genauso eine zweite Routine „Ast aus“: Steckdose ausschalten und „sag unserer Hausmaus der Ast ist aus“.</li>
        </ol>
        <p className="text-label text-ink-muted">
          Tipp: Habt ihr in der Alexa-App schon eine Routine mit Uhrzeit für den Ast (z. B. abends an), dort einfach Aktion 2 dazunehmen.
        </p>
      </section>
    </div>
  )
}
