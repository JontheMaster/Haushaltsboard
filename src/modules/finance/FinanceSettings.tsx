import { Lock, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { currentSubscription, enablePush, isInstalled, isIOS, pushSupported } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { setFinEnabled, setImportPrefs, setJointAccounts, useFinProfile } from './finStore'
import { setModuleConfig, useModuleConfig } from '../useModules'

/**
 * Alle Funktionen → Finanzen: jede Person schaltet Finanzen für sich selbst ein (Leviona nur, wenn sie zustimmt).
 * Erst dann erscheint der Reiter „Finanzen“. Liegt der letzte Import länger als die Frist zurück (14 oder 30 Tage),
 * kommt morgens um 9 das Todo „Umsätze hochladen“ (oder eine Mitteilung, wenn man das wählt).
 */
export function FinanceSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const wall = useModuleConfig<{ wall_percent_only?: boolean; wall_calm?: boolean; wall_hint?: boolean }>('finanzen', {})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const every = profile?.import_every_days === 14 ? 14 : 30

  async function togglePush(next: boolean) {
    setMessage(null)
    if (next && !(await currentSubscription())) {
      // Handy noch nicht für Mitteilungen angemeldet: jetzt anmelden (wie bei den Erinnerungen)
      if (isIOS() && !isInstalled())
        return setMessage({ ok: false, text: 'Am iPhone gehen Mitteilungen nur in der installierten App (Teilen → „Zum Home-Bildschirm“).' })
      const error = pushSupported() ? await enablePush(me.id) : 'Dieser Browser kann keine Mitteilungen.'
      if (error) return setMessage({ ok: false, text: error })
    }
    if (!(await setImportPrefs(me.id, { import_push: next }))) setMessage({ ok: false, text: 'Speichern hat nicht geklappt.' })
  }

  async function testPush() {
    setBusy(true)
    const { data } = await supabase.functions.invoke<{ sent: number }>('reminders', { body: { action: 'fin-import-test' } })
    setBusy(false)
    setMessage(data?.sent ? { ok: true, text: 'Test-Mitteilung ist unterwegs.' } : { ok: false, text: 'Keine Mitteilung verschickt. Ist dieses Handy unter „Erinnerungen“ angemeldet?' })
  }

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
          Dann bekommst du unten den Reiter „Finanzen“ und kannst den Umsatz-Export aus dem ING-Banking hochladen. Ausschalten blendet alles wieder aus,
          deine Daten bleiben gespeichert.
        </p>
      </section>

      {profile?.enabled && (
        <section className="hb-tile hb-tile-static gap-3">
          <h3 className="font-semibold text-ink">Erinnerung an den Import</h3>
          <div className="flex items-center justify-between gap-3">
            <span className="text-body text-ink">Erinnern nach</span>
            <div className="hb-seg" role="group" aria-label="Frist">
              {[14, 30].map((d) => (
                <button key={d} type="button" aria-pressed={every === d} className={every === d ? 'is-on' : ''} onClick={() => setImportPrefs(me.id, { import_every_days: d })}>
                  {d} Tagen
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={!!profile.import_push} onChange={togglePush} label="Mitteilung aufs Handy statt Todo" />
          <p className="text-label text-ink-muted">
            Liegt dein letzter Import länger zurück, kommt morgens um 9 {profile.import_push ? 'eine Mitteilung (höchstens einmal pro Woche)' : 'das Todo „Umsätze hochladen“ für dich'}.
            Antippen öffnet gleich den Import, nach dem Hochladen hakt es sich selbst ab.
          </p>
          {profile.import_push && (
            <Button variant="ghost" disabled={busy} icon={<Icon icon={Send} size={20} />} onClick={testPush}>
              Test-Mitteilung schicken
            </Button>
          )}
          {message && (
            <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
              {message.text}
            </p>
          )}
        </section>
      )}

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
          <Toggle
            checked={wall.wall_hint === true}
            onChange={(on) => setModuleConfig('finanzen', { wall_hint: on })}
            label="Hinweis bei Apple Pay: Haushaltseinkäufe kurz am Board zeigen"
          />
          <p className="text-label text-ink-muted">Gilt für beide. An der Wand stehen nur gemeinsame Depots, Ziele und Haushaltssummen, private Buchungen nie, im Besuchsmodus gar nichts.</p>
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
