import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { useNow } from '../../lib/time'
import { setModuleConfig, useEnabledModules, useModuleConfig } from '../useModules'

// Der Ast im Wohnzimmer (Tapo-Steckdose, Wunsch Jonathan 21.10.2026). Tapo lässt sich nicht abfragen (keine offizielle
// Schnittstelle, die alte Cloud meldet die P100 als offline): Bescheid kommt aus einer Alexa-Routine („der Ast ist an/aus“,
// Intent AstSchalten in der Function `alexa`) und steht in modules „ast“ als { on, at }.

type AstConfig = { on: boolean; at: string | null }
/** Wurde er wohl ohne Alexa ausgeschaltet? Nach so vielen Stunden blendet das Board ihn sicherheitshalber aus */
const MAX_ON_HOURS = 14

export function useAstOn(): boolean {
  const enabled = useEnabledModules()
  const { on, at } = useModuleConfig<AstConfig>('ast', { on: false, at: null })
  const now = useNow(60_000).getTime()
  if (!enabled?.has('ast') || !on) return false
  return !at || now - Date.parse(at) < MAX_ON_HOURS * 3600_000
}

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
  if (!shown) return null
  return (
    <div className={`hb-ast is-${variant} ${on ? '' : 'is-leaving'}`} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        {/* Zweig aus der Ecke nach oben rechts, zwei Seitentriebe */}
        <g className="hb-ast-wood" fill="none" strokeLinecap="round">
          <path d="M-4 124 C 18 100, 34 82, 52 66 S 86 34, 104 14" strokeWidth="4.5" />
          <path d="M40 76 C 34 62, 30 52, 28 40" strokeWidth="2.6" />
          <path d="M66 54 C 78 54, 90 58, 100 66" strokeWidth="2.4" />
          <path d="M84 32 C 82 24, 84 16, 90 8" strokeWidth="2" />
        </g>
        {/* ein paar Blättchen */}
        <g className="hb-ast-leaf">
          <path d="M28 40 c -6 -4 -8 -12 -4 -16 c 5 3 7 10 4 16 z" />
          <path d="M100 66 c 4 -6 12 -7 15 -3 c -4 5 -11 6 -15 3 z" />
          <path d="M58 60 c -2 -7 2 -13 7 -13 c 1 6 -2 11 -7 13 z" />
        </g>
        {/* kleine warme Lichter */}
        <g className="hb-ast-lights">
          {[
            [16, 104],
            [33, 88],
            [48, 70],
            [30, 52],
            [62, 52],
            [76, 44],
            [92, 60],
            [88, 26],
            [102, 16],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" style={{ animationDelay: `${(i * 0.37) % 2.4}s` }} />
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
          <li>Aktion 2: „Benutzerdefiniert“ → Text: „sag unserem Haushalt der Ast ist an“.</li>
          <li>Genauso eine zweite Routine „Ast aus“: Steckdose ausschalten und „sag unserem Haushalt der Ast ist aus“.</li>
        </ol>
        <p className="text-label text-ink-muted">
          Tipp: Habt ihr in der Alexa-App schon eine Routine mit Uhrzeit für den Ast (z. B. abends an), dort einfach Aktion 2 dazunehmen.
        </p>
      </section>
    </div>
  )
}
