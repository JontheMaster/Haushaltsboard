import { Copy, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'

const SCRIPT_URL = 'https://jonthemaster.github.io/Haushaltsboard/widget/scriptable.js'
const DATA_URL = 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/widget?t='

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Start-Skript für Scriptable: enthält nur den eigenen Link und lädt das eigentliche Widget von der Board-Seite
 * (so wird es nach Änderungen von selbst aktuell; ohne Netz nimmt es die letzte Fassung).
 */
function loaderScript(token: string): string {
  return [
    '// Haushaltsboard-Widget · lädt das aktuelle Aussehen von der Board-Seite',
    `const TOKEN = '${token}'`,
    'const fm = FileManager.local()',
    "const file = fm.joinPath(fm.documentsDirectory(), 'haushaltsboard-widget.js')",
    'let code = null',
    'try {',
    `  const r = new Request('${SCRIPT_URL}')`,
    '  r.timeoutInterval = 15',
    '  code = await r.loadString()',
    '  if (r.response.statusCode === 200) fm.writeString(file, code)',
    '  else code = null',
    '} catch (e) {}',
    'if (!code && fm.fileExists(file)) code = fm.readString(file)',
    "if (!code) throw new Error('Widget konnte nicht geladen werden')",
    "await new Function('TOKEN', 'return (async () => {\\n' + code + '\\n})()')(TOKEN)",
    '',
  ].join('\n')
}

/** Handy-Widget einrichten: eigener geheimer Link, fertiger Code für Scriptable (iPhone), Daten-Link für Android */
export function WidgetSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const [token, setToken] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // eigenen Link holen, beim ersten Mal anlegen
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('widget_tokens').select('token').eq('member_id', me.id).maybeSingle()
      if (data?.token) return alive && setToken(data.token)
      const fresh = newToken()
      const { error } = await supabase.from('widget_tokens').insert({ member_id: me.id, token: fresh })
      if (!alive) return
      if (error) setMessage({ ok: false, text: 'Link anlegen hat nicht geklappt.' })
      else setToken(fresh)
    })()
    return () => {
      alive = false
    }
  }, [me.id])

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage({ ok: true, text: `${what} kopiert.` })
    } catch {
      setMessage({ ok: false, text: 'Kopieren ging nicht. Halte den Text unten gedrückt und kopiere ihn von Hand.' })
    }
  }

  async function renew() {
    const fresh = newToken()
    const { error } = await supabase.from('widget_tokens').update({ token: fresh, created_at: new Date().toISOString() }).eq('member_id', me.id)
    if (error) return setMessage({ ok: false, text: 'Erneuern hat nicht geklappt.' })
    setToken(fresh)
    setMessage({ ok: true, text: 'Neuer Link. Kopiere den Code und ersetze ihn in Scriptable, der alte geht nicht mehr.' })
  }

  const code = token ? loaderScript(token) : ''

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Handy-Widget" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Ein Widget für den Home-Bildschirm: Wetter, deine nächsten Termine, deine Todos für heute und das Essen. Nur zum Anschauen, Antippen öffnet
        das Board. Das iPhone aktualisiert es etwa alle 15 bis 30 Minuten.
      </p>

      {message && (
        <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
          {message.text}
        </p>
      )}

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <h3 className="font-display text-[18px] font-semibold text-ink">iPhone (Scriptable)</h3>
        <ol className="hb-widget-steps">
          <li>Tippe unten auf „Code kopieren“.</li>
          <li>Öffne Scriptable, tippe oben rechts auf Plus und füge den Code ein.</li>
          <li>Tippe oben auf den Namen und nenne das Skript „Haushaltsboard“. Mit dem Abspielen-Knopf siehst du eine Vorschau.</li>
          <li>Halte den Home-Bildschirm gedrückt, tippe auf Plus bzw. „Bearbeiten → Widget hinzufügen“, wähle Scriptable und eine Größe.</li>
          <li>Halte das neue Widget gedrückt → „Widget bearbeiten“ → bei „Script“ Haushaltsboard wählen.</li>
        </ol>
        <Button variant="primary" disabled={!token} icon={<Icon icon={Copy} size={20} />} onClick={() => copy(code, 'Code')}>
          Code kopieren
        </Button>
        {token && <pre className="hb-widget-code">{code}</pre>}
      </section>

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <h3 className="font-display text-[18px] font-semibold text-ink">Dein Link</h3>
        <p className="text-label text-ink-muted">
          Der Code enthält einen geheimen Link nur für dich ({me.name}), mit dem man deine Termine und Todos lesen kann. Gib ihn nicht weiter. Wenn
          ein Handy weg ist, erneuere ihn, dann ist der alte wertlos.
        </p>
        <Button variant="ghost" disabled={!token} icon={<Icon icon={Copy} size={18} />} onClick={() => token && copy(DATA_URL + token, 'Daten-Link (für Android)')}>
          Daten-Link kopieren (Android)
        </Button>
        <Button variant="ghost" disabled={!token} icon={<Icon icon={RefreshCw} size={18} />} onClick={renew}>
          Link erneuern
        </Button>
      </section>
    </div>
  )
}
