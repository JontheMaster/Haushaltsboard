import { PageHeader } from '../../components/PageHeader'

type Example = { say: string; does: string }

// Immer „Alexa, sag unserem Haushalt, …“ davor (Aufrufname des Skills, Entscheidung Jonathan 7.10.2026); danach geht fast jede natürliche Formulierung
const GROUPS: { title: string; examples: Example[] }[] = [
  {
    title: 'Todo eintragen',
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
    examples: [
      { say: 'wir brauchen Milch', does: 'Milch auf eure Bring!-Liste' },
      { say: 'uns fehlen Eier und Butter', does: 'Zwei Artikel auf einmal' },
      { say: 'die Zahnpasta ist alle', does: 'Zahnpasta auf die Liste' },
      { say: 'setz Klopapier auf die Einkaufsliste', does: 'Klopapier auf die Liste' },
    ],
  },
  {
    title: 'Vorlesen',
    examples: [
      { say: 'was steht heute an', does: 'Termine und Todos von heute' },
      { say: 'wie sieht der Tag aus', does: 'dasselbe, andere Worte' },
    ],
  },
]

/** Alexa: was man sagen kann. Ein- und ausschalten geht über die Alexa-App. */
export function AlexaHelp({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Alexa" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Fang immer mit „Alexa, sag unserem Haushalt …“ an, danach sag es einfach so, wie du es meinst. Per Sprache angelegte Todos sind
        immer „Offen“. Alexa liest keine Kalender vor, die im Besuchsmodus verschwinden.
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
        </section>
      ))}
    </div>
  )
}
