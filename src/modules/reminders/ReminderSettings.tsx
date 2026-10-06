import { Bell, BellOff, Send, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { useMembers } from '../../lib/members'
import { currentSubscription, disablePush, enablePush, isInstalled, isIOS, pushSupported, sendTestPush } from '../../lib/push'

type State = 'checking' | 'unsupported' | 'install' | 'off' | 'on' | 'blocked'

/** Erinnerungen: dieses Handy für Mitteilungen anmelden, testen, abmelden */
export function ReminderSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const [state, setState] = useState<State>('checking')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (isIOS() && !isInstalled()) return setState('install')
    if (!pushSupported()) return setState('unsupported')
    if (Notification.permission === 'denied') return setState('blocked')
    currentSubscription().then((s) => setState(s ? 'on' : 'off'))
  }, [])

  async function enable() {
    setBusy(true)
    setMessage(null)
    const error = await enablePush(me.id)
    setBusy(false)
    if (error) {
      setMessage({ ok: false, text: error })
      if (Notification.permission === 'denied') setState('blocked')
      return
    }
    setState('on')
    setMessage({ ok: true, text: 'Dieses Handy bekommt jetzt Erinnerungen.' })
  }

  async function disable() {
    setBusy(true)
    await disablePush()
    setBusy(false)
    setState('off')
    setMessage(null)
  }

  async function test() {
    setBusy(true)
    const sent = await sendTestPush()
    setBusy(false)
    setMessage(
      sent ? { ok: true, text: 'Test-Mitteilung ist unterwegs.' } : { ok: false, text: 'Keine Mitteilung verschickt. Melde das Handy noch mal an.' },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Erinnerungen" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Gib einem Todo eine Uhrzeit, dann kommt zur Uhrzeit eine Mitteilung aufs Handy der zuständigen Person, bei „Offen“ auf beide. Ist
        das Todo schon erledigt, kommt nichts. Nur am Handy, nie am Wand-Tablet.
      </p>

      {message && (
        <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
          {message.text}
        </p>
      )}

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <h3 className="font-display text-[18px] font-semibold text-ink">Dieses Handy</h3>
        {state === 'checking' && <p className="text-body text-ink-muted">Einen Moment …</p>}
        {state === 'install' && (
          <p className="text-body text-ink">
            Am iPhone gehen Mitteilungen nur in der installierten App. Öffne die Seite in Safari, tippe auf{' '}
            <Icon icon={Share} size={18} label="Teilen" className="inline align-[-3px]" /> „Teilen“ und dann „Zum Home-Bildschirm“.
            Öffne danach das Haushaltsboard vom Home-Bildschirm und komm hierher zurück.
          </p>
        )}
        {state === 'unsupported' && <p className="text-body text-ink">Dieser Browser kann leider keine Mitteilungen anzeigen.</p>}
        {state === 'blocked' && (
          <p className="text-body text-ink">
            Mitteilungen sind für das Haushaltsboard blockiert. Erlaube sie in den Einstellungen des Handys (Mitteilungen → Haushaltsboard) und
            öffne diese Seite dann noch mal.
          </p>
        )}
        {state === 'off' && (
          <>
            <p className="text-body text-ink-muted">Noch nicht angemeldet. Beim ersten Mal fragt das Handy, ob Mitteilungen erlaubt sind.</p>
            <Button variant="primary" size="lg" disabled={busy} icon={<Icon icon={Bell} size={22} />} onClick={enable}>
              Erinnerungen einschalten
            </Button>
          </>
        )}
        {state === 'on' && (
          <>
            <p className="text-body text-ink">Angemeldet. Dieses Handy bekommt deine Erinnerungen.</p>
            <Button disabled={busy} icon={<Icon icon={Send} size={20} />} onClick={test}>
              Test-Mitteilung schicken
            </Button>
            <Button variant="ghost" disabled={busy} icon={<Icon icon={BellOff} size={20} />} onClick={disable}>
              Auf diesem Handy ausschalten
            </Button>
          </>
        )}
      </section>
    </div>
  )
}
