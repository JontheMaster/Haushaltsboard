import { Send, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { currentSubscription, enablePush, isInstalled, isIOS, pushSupported } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { setModuleConfig, useModuleConfig } from '../useModules'
import { openRecap, RECAP_FROM_HOUR } from './recapStore'

const DEFAULTS: { push: string[] } = { push: [] }

/** Wochenrückblick: ansehen und Sonntags-Mitteilung pro Person an/aus */
export function RecapSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const { push } = useModuleConfig('wochenrueckblick', DEFAULTS)
  const [pending, setPending] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const on = pending ?? push.includes(me.id)

  async function toggle(next: boolean) {
    setMessage(null)
    setPending(next)
    if (next && !(await currentSubscription())) {
      // Handy noch nicht für Mitteilungen angemeldet: jetzt anmelden (wie bei den Erinnerungen)
      if (isIOS() && !isInstalled()) {
        setPending(null)
        return setMessage({ ok: false, text: 'Am iPhone gehen Mitteilungen nur in der installierten App (Teilen → „Zum Home-Bildschirm“).' })
      }
      const error = pushSupported() ? await enablePush(me.id) : 'Dieser Browser kann keine Mitteilungen.'
      if (error) {
        setPending(null)
        return setMessage({ ok: false, text: error })
      }
    }
    const list = next ? [...new Set([...push, me.id])] : push.filter((id) => id !== me.id)
    const ok = await setModuleConfig('wochenrueckblick', { push: list })
    setPending(null)
    setMessage(ok ? (next ? { ok: true, text: 'Du bekommst den Rückblick ab jetzt sonntags um 18 Uhr.' } : null) : { ok: false, text: 'Speichern hat nicht geklappt.' })
  }

  async function test() {
    setBusy(true)
    const { data } = await supabase.functions.invoke<{ sent: number }>('reminders', { body: { action: 'weekly-test' } })
    setBusy(false)
    setMessage(data?.sent ? { ok: true, text: 'Test-Mitteilung ist unterwegs.' } : { ok: false, text: 'Keine Mitteilung verschickt. Ist dieses Handy unter „Erinnerungen“ angemeldet?' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Wochenrückblick" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Sonntags ab {RECAP_FROM_HOUR} Uhr steht oben eine Karte mit eurer Woche: was erledigt wurde, von wem, was ihr gekocht habt. Antippen
        öffnet den Rückblick.
      </p>
      <Button icon={<Icon icon={Trophy} size={20} />} onClick={openRecap}>
        Rückblick jetzt ansehen
      </Button>

      {message && (
        <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
          {message.text}
        </p>
      )}

      {!me.is_board && (
        <section className="hb-tile hb-tile-static gap-3 p-4">
          <h3 className="font-display text-[18px] font-semibold text-ink">Mitteilung</h3>
          <Toggle label="Sonntags um 18 Uhr aufs Handy" checked={on} onChange={toggle} />
          <p className="text-label text-ink-muted">Gilt nur für dich ({me.name}), auf allen Handys, die unter „Erinnerungen“ angemeldet sind.</p>
          {on && (
            <Button variant="ghost" disabled={busy} icon={<Icon icon={Send} size={20} />} onClick={test}>
              Test-Mitteilung schicken
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
