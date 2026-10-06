import { PageHeader } from '../../components/PageHeader'

const EXAMPLES: { say: string; does: string }[] = [
  { say: 'Alexa, sag Haushaltsboard, trag Müll rausbringen ein', does: 'Todo ohne Tag, für wer Zeit hat' },
  { say: 'Alexa, sag Haushaltsboard, trag Bad putzen für morgen ein', does: 'Todo für morgen' },
  { say: 'Alexa, sag Haushaltsboard, schreib Geschenk kaufen am Freitag auf', does: 'Todo für den nächsten Freitag' },
  { say: 'Alexa, sag Haushaltsboard, notiere Fenster putzen diese Woche', does: 'Todo für „Diese Woche“' },
  { say: 'Alexa, sag Haushaltsboard, setz Milch auf die Einkaufsliste', does: 'Milch landet auf eurer Bring!-Liste' },
  { say: 'Alexa, sag Haushaltsboard, setz Milch und Eier auf die Einkaufsliste', does: 'Zwei Artikel auf einmal' },
  { say: 'Alexa, frag Haushaltsboard, was heute ansteht', does: 'Termine und Todos von heute vorlesen' },
]

/** Alexa: was man sagen kann. Ein- und ausschalten geht über die Alexa-App. */
export function AlexaHelp({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Alexa" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Per Sprache angelegte Todos sind immer „Offen“. Alexa liest keine Kalender vor, die im Besuchsmodus verschwinden.
      </p>
      <section className="hb-tile hb-tile-static gap-3 p-4">
        {EXAMPLES.map((e) => (
          <div key={e.say} className="flex flex-col">
            <span className="text-body font-semibold text-ink">„{e.say}“</span>
            <span className="text-label text-ink-muted">{e.does}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
