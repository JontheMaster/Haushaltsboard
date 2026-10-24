import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
// Das Sprachmodell aus dem Repo (dasselbe, das in der Alexa Developer Console steht): so ist die Liste unten immer vollständig
import model from '../../../alexa/interaction-model.de-DE.json'

type Example = { say: string; does: string }
type Intent = { name: string; samples?: string[] }
type SlotType = { name: string; values: { name: { value: string; synonyms?: string[] } }[] }

const lm = model.interactionModel.languageModel as { invocationName: string; intents: Intent[]; types?: SlotType[] }
const samplesOf = (intent: string) => lm.intents.find((i) => i.name === intent)?.samples ?? []
const timerTypes = lm.types?.find((t) => t.name === 'TIMER_ART')?.values ?? []

// Immer „Alexa, sag unserer Hausmaus, …“ davor (Aufrufname des Skills, Entscheidung Jonathan 24.10.2026: „unserem Haushalt“ und „Pinnwand“ hielt Alexa+ für eigene Funktionen); danach geht fast jede natürliche Formulierung
const GROUPS: { title: string; intent: string; hint?: string; examples: Example[] }[] = [
  {
    title: 'Todo eintragen',
    intent: 'TodoAnlegen',
    hint: 'Den Tag liest Alexa aus dem Satz: heute, morgen, übermorgen, ein Wochentag („am Freitag“), „diese Woche“ oder ein Datum („am 12. Oktober“). Ohne Tag landet es bei „Ohne Tag“. Per Sprache angelegte Todos sind immer „Offen“. Endet der Satz auf „… auf die Einkaufsliste“, geht es an Bring! statt in die Todos.',
    examples: [
      { say: 'wir müssen morgen den Müll rausbringen', does: 'Todo für morgen' },
      { say: 'ich muss noch Oma anrufen', does: 'Todo ohne Tag' },
      { say: 'denk an Geschenk kaufen am Freitag', does: 'Todo für den nächsten Freitag' },
      { say: 'erinner uns an Fenster putzen diese Woche', does: 'Todo für „Diese Woche“' },
      { say: 'trag Bad putzen am Samstag ein', does: 'Todo für den nächsten Samstag' },
    ],
  },
  {
    title: 'Einkauf',
    intent: 'EinkaufHinzufuegen',
    hint: 'Geht direkt auf eure Bring!-Liste „Zuhause“. Mit „und“ mehrere Artikel auf einmal.',
    examples: [
      { say: 'wir brauchen Milch', does: 'Milch auf eure Bring!-Liste' },
      { say: 'uns fehlen Eier und Butter', does: 'Zwei Artikel auf einmal' },
      { say: 'die Zahnpasta ist alle', does: 'Zahnpasta auf die Liste' },
      { say: 'setz Klopapier auf die Einkaufsliste', does: 'Klopapier auf die Liste' },
    ],
  },
  {
    title: 'Vorlesen',
    intent: 'WasStehtAn',
    hint: 'Liest Termine von heute (ohne Kalender, die im Besuchsmodus verschwinden), fällige Todos samt Putzplan und wie viel „diese Woche“ noch offen ist.',
    examples: [
      { say: 'was steht heute an', does: 'Termine und Todos von heute' },
      { say: 'wie sieht der Tag aus', does: 'dasselbe, andere Worte' },
      { say: 'was ist noch offen', does: 'dasselbe, andere Worte' },
    ],
  },
  {
    title: 'Timer starten',
    intent: 'TimerStarten',
    hint: `Startet einen Timer-Tag (wie der NFC-Sticker): Karte oben an Wand und Handy, am Ende Mitteilung und Signal an der Wand. ${
      timerTypes.length ? `Bekannte Timer: ${timerTypes.map((t) => t.name.value).join(', ')}.` : ''
    } Passen mehrere, fragt Alexa nach.`,
    examples: [
      { say: 'starte die Trocknerwäsche', does: 'Timer „Trocknerwäsche“' },
      { say: 'die Waschmaschine läuft mit nasser Wäsche', does: 'Timer „Nasse Wäsche“' },
      { say: 'die Waschmaschine läuft', does: 'Alexa fragt, welche Wäsche' },
    ],
  },
]

/** Alexa: was man sagen kann, mit allen eingestellten Sätzen. Ein- und ausschalten geht über die Alexa-App. */
export function AlexaHelp({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Alexa" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Fang immer mit „Alexa, sag {lm.invocationName} …“ an, danach sag es einfach so, wie du es meinst. Füllwörter wie „noch“, „bitte“ oder „dass“ schneidet
        das Board selbst ab.
      </p>
      {GROUPS.map((g) => (
        <section key={g.title} className="hb-tile hb-tile-static gap-3 p-4">
          <h3 className="font-display text-body-wall font-semibold text-ink">{g.title}</h3>
          {g.examples.map((e) => (
            <div key={e.say} className="flex flex-col">
              <span className="text-body font-semibold text-ink">„… {e.say}“</span>
              <span className="text-label text-ink-muted">{e.does}</span>
            </div>
          ))}
          {g.hint && <p className="text-label text-ink-muted">{g.hint}</p>}
          <AllSamples samples={samplesOf(g.intent)} />
        </section>
      ))}
      <section className="hb-tile hb-tile-static gap-2 p-4">
        <h3 className="font-display text-body-wall font-semibold text-ink">Sonst noch</h3>
        <span className="text-body text-ink">„Hilfe“, „was kann ich sagen“: Beispiele</span>
        <span className="text-body text-ink">„Stopp“, „Abbrechen“: beendet den Skill</span>
        <p className="text-label text-ink-muted">
          Versteht Alexa einen Satz nicht, erklärt sie kurz, was geht. Neue Sätze kommen ins Sprachmodell im Repo und danach in die Alexa Developer Console.
        </p>
      </section>
    </div>
  )
}

/** Alle Sätze aus dem Sprachmodell, aufklappbar; {titel}, {artikel}, {art} = was du sagst */
function AllSamples({ samples }: { samples: string[] }) {
  const [open, setOpen] = useState(false)
  if (!samples.length) return null
  const show = (s: string) =>
    s
      .replace(/\{titel\}/g, '[Aufgabe]')
      .replace(/\{artikel\}/g, '[Artikel]')
      .replace(/\{art\}/g, '[Timer]')
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 self-start text-label font-semibold text-accent"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon icon={ChevronDown} size={16} className={open ? 'rotate-180' : ''} />
        Alle {samples.length} Sätze {open ? 'ausblenden' : 'zeigen'}
      </button>
      {open && (
        <ul className="flex flex-col gap-1">
          {samples.map((s) => (
            <li key={s} className="text-label text-ink">
              „… {show(s)}“
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
