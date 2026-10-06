import { Eye, EyeOff, Wifi } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Choice } from '../../components/Choice'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Sheet } from '../../components/Sheet'
import { useSettings } from '../../lib/settings'
import { setModuleConfig, useEnabledModules } from '../useModules'
import { useWifi, wifiPayload, type WifiConfig } from './wifiConfig'

const input = 'h-7 w-full rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring'

/** QR-Code als SVG (dunkle Punkte auf Weiß, damit jede Kamera ihn liest, auch im dunklen Design) */
export function WifiQr({ config, size = 240 }: { config: WifiConfig; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null)
  const payload = wifiPayload(config)
  useEffect(() => {
    let alive = true
    QRCode.toString(payload, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1d2925', light: '#ffffff' } }).then((s) => alive && setSvg(s))
    return () => {
      alive = false
    }
  }, [payload])
  return (
    <div
      className="hb-wifi-qr"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QR-Code für das WLAN ${config.ssid}`}
      // SVG kommt aus der QR-Bibliothek, nicht von außen
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}

/** Fenster für Gäste: Code scannen oder Name und Passwort abtippen */
export function WifiSheet({ onClose }: { onClose: () => void }) {
  const wifi = useWifi()
  return (
    <Sheet title="WLAN für Gäste" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <WifiQr config={wifi} size={260} />
        <p className="text-body text-ink-muted">Kamera aufs Handy richten und den Hinweis antippen, dann seid ihr drin.</p>
        <dl className="hb-wifi-facts">
          <dt>Name</dt>
          <dd>{wifi.ssid}</dd>
          {wifi.security !== 'nopass' && (
            <>
              <dt>Passwort</dt>
              <dd>{wifi.password}</dd>
            </>
          )}
        </dl>
      </div>
    </Sheet>
  )
}

/** Knopf „WLAN“ (Wand: Kopfzeile, Handy: oben auf Start): nur im Besuchsmodus und wenn ein WLAN eingetragen ist */
export function WifiButton({ variant }: { variant: 'wall' | 'phone' }) {
  const enabled = useEnabledModules()
  const { settings } = useSettings()
  const wifi = useWifi()
  const [open, setOpen] = useState(false)
  if (!enabled?.has('wlan') || !settings?.visit_mode || !wifi.ssid) return null
  return (
    <>
      {variant === 'wall' ? (
        <button type="button" className="hb-choice" onClick={() => setOpen(true)}>
          <Icon icon={Wifi} size={20} />
          WLAN
        </button>
      ) : (
        <Button icon={<Icon icon={Wifi} size={20} />} onClick={() => setOpen(true)}>
          WLAN-Code für Gäste zeigen
        </Button>
      )}
      {open && <WifiSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** Einstellungen: WLAN-Name und Passwort eintragen, Code ansehen */
export function WifiSettings({ onBack }: { onBack: () => void }) {
  const saved = useWifi()
  const [draft, setDraft] = useState<WifiConfig | null>(null)
  const [show, setShow] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const form = draft ?? saved
  const set = (patch: Partial<WifiConfig>) => {
    setMessage(null)
    setDraft({ ...form, ...patch })
  }
  const complete = form.ssid.trim() !== '' && (form.security === 'nopass' || form.password !== '')

  async function save() {
    const ok = await setModuleConfig('wlan', { ssid: form.ssid.trim(), password: form.security === 'nopass' ? '' : form.password, security: form.security })
    if (ok) setDraft(null)
    setMessage(ok ? { ok: true, text: 'Gespeichert.' } : { ok: false, text: 'Speichern hat nicht geklappt.' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="WLAN für Gäste" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Ist der Besuchsmodus an, steht an der Wand in der Kopfzeile und am Handy oben auf der Startseite ein Knopf „WLAN“. Er zeigt einen
        QR-Code, mit dem Gäste ohne Abtippen ins WLAN kommen.
      </p>

      {message && (
        <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
          {message.text}
        </p>
      )}

      <section className="hb-tile hb-tile-static gap-4 p-4">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">WLAN-Name</span>
          <input className={input} value={form.ssid} onChange={(e) => set({ ssid: e.target.value })} placeholder="z. B. FRITZ!Box 7590" autoComplete="off" />
        </label>
        <Choice
          label="Verschlüsselung"
          options={[
            { value: 'WPA' as const, label: 'Mit Passwort' },
            { value: 'nopass' as const, label: 'Offen' },
          ]}
          isSelected={(v) => v === form.security}
          onSelect={(v) => set({ security: v })}
        />
        {form.security !== 'nopass' && (
          <div className="flex flex-col gap-2">
            <label htmlFor="hb-wifi-pass" className="text-label text-ink">
              Passwort
            </label>
            <div className="flex gap-2">
              <input
                id="hb-wifi-pass"
                className={input}
                type={show ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                autoComplete="off"
              />
              <button type="button" className="hb-icon-btn" aria-label={show ? 'Passwort verbergen' : 'Passwort zeigen'} onClick={() => setShow(!show)}>
                <Icon icon={show ? EyeOff : Eye} size={20} />
              </button>
            </div>
          </div>
        )}
        <Button variant="primary" disabled={!draft || !complete} onClick={save}>
          Speichern
        </Button>
      </section>

      {saved.ssid && !draft && (
        <section className="hb-tile hb-tile-static items-center gap-3 p-4 text-center">
          <h3 className="font-display text-[18px] font-semibold text-ink">So sehen Gäste den Code</h3>
          <WifiQr config={saved} size={220} />
        </section>
      )}
    </div>
  )
}
