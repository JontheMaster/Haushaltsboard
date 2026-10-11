import { Lock } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { setFinEnabled, setJointAccounts, useFinProfile } from './finStore'
import { setModuleConfig, useModuleConfig } from '../useModules'

/**
 * Alle Funktionen → Finanzen: jede Person schaltet Finanzen für sich selbst ein (Leviona nur, wenn sie zustimmt).
 * Erst dann erscheint der Reiter „Finanzen“ und am 1. des Monats das Todo „Umsätze hochladen“.
 */
export function FinanceSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const wall = useModuleConfig<{ wall_percent_only?: boolean; wall_calm?: boolean }>('finanzen', {})
  const accounts = (profile?.joint_accounts ?? []).map((a) => ({ name: a.replace(/^-/, ''), joint: !a.startsWith('-') }))

  // Das Wand-Tablet sieht nie einzelne Buchungen und hat keine eigenen
  if (me.is_board)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Finanzen" onBack={onBack} />
        <p className="text-body text-ink-muted">Am Tablet-Konto gibt es keine Finanzen. Schalt sie am Handy für dich ein.</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Finanzen" onBack={onBack} />
      <section className="hb-tile hb-tile-static gap-3">
        <Toggle
          checked={!!profile?.enabled}
          onChange={(on) => setFinEnabled(me.id, on)}
          label={`Finanzen für mich (${me.name})`}
        />
        <p className="text-label text-ink-muted">
          Dann bekommst du unten den Reiter „Finanzen“, kannst den Umsatz-Export aus dem ING-Banking hochladen und am 1. jedes Monats erinnert dich ein Todo daran.
          Ausschalten blendet alles wieder aus, deine Daten bleiben gespeichert.
        </p>
      </section>

      {accounts.length > 0 && (
        <section className="hb-tile hb-tile-static gap-3">
          <h3 className="font-semibold text-ink">Gemeinsame Konten</h3>
          {accounts.map((a) => (
            <Toggle
              key={a.name}
              checked={a.joint}
              onChange={(on) =>
                setJointAccounts(me.id, [...(profile?.joint_accounts ?? []).filter((x) => x !== a.name && x !== `-${a.name}`), on ? a.name : `-${a.name}`])
              }
              label={`${a.name}: neue Buchungen zählen zum Haushalt`}
            />
          ))}
          <p className="text-label text-ink-muted">Gilt für künftige Importe. Einzelne Buchungen stellst du beim Antippen um.</p>
        </section>
      )}

      {profile?.enabled && (
        <section className="hb-tile hb-tile-static gap-3">
          <h3 className="font-semibold text-ink">An der Wand</h3>
          <Toggle
            checked={wall.wall_percent_only !== false}
            onChange={(on) => setModuleConfig('finanzen', { wall_percent_only: on })}
            label="Nur Prozent: keine Eurobeträge an der Wand"
          />
          <Toggle
            checked={wall.wall_calm !== false}
            onChange={(on) => setModuleConfig('finanzen', { wall_calm: on })}
            label="Ruhige Ansicht: Woche und 30 Tage statt Tagesschwankung"
          />
          <p className="text-label text-ink-muted">Gilt für beide. An der Wand stehen nur gemeinsame Depots und Ziele, im Besuchsmodus gar nichts.</p>
        </section>
      )}

      <p className="flex gap-2 px-1 text-label text-ink-muted">
        <Icon icon={Lock} size={16} className="shrink-0" />
        Deine Buchungen sieht nur du. Was zum Haushalt zählt, sehen beide. An der Wand stehen nur Summen, nie einzelne Buchungen, und im Besuchsmodus ist Finanzen
        ganz weg. IBAN, BIC, Mandate und Kontostand werden nie gespeichert.
      </p>
    </div>
  )
}
