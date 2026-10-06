import { ArrowLeft, Music, Unlink } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { NowPlayingHeader } from './NowPlaying'

type Status = { configured: boolean; connected: string[] }

// Rückmeldung der Spotify-Anmeldung (?spotify=… in der Adresse)
const RESULT_TEXT: Record<string, string> = {
  ok: 'Spotify ist verbunden.',
  denied: 'Anmeldung abgebrochen.',
  expired: 'Anmeldung abgelaufen. Probier es noch mal.',
  error: 'Spotify hat die Anmeldung abgelehnt. Probier es noch mal.',
}

/** Liest ?spotify=… einmal aus der Adresse und entfernt es wieder */
export function takeSpotifyResult(): string | null {
  const url = new URL(window.location.href)
  const result = url.searchParams.get('spotify')
  if (!result) return null
  url.searchParams.delete('spotify')
  window.history.replaceState(null, '', url.toString())
  return RESULT_TEXT[result] ?? null
}

/** Handy: eigenes Spotify-Konto verbinden oder trennen. Das Board zeigt dann „Läuft gerade“. */
export function SpotifyPage({ onBack, notice }: { onBack: () => void; notice?: string | null }) {
  const { me, members } = useMembers()
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<Status>('spotify?action=status', { method: 'GET' })
    if (error || !data) return setError('Spotify gerade nicht erreichbar. Prüf die Verbindung.')
    setError(null)
    setStatus(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function connect() {
    setBusy(true)
    const returnTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { data } = await supabase.functions.invoke<{ url?: string; error?: string }>('spotify', {
      body: { action: 'connect', returnTo },
    })
    if (data?.url) {
      window.location.href = data.url
      return
    }
    setBusy(false)
    setError(data?.error === 'not_configured' ? 'Die Spotify-App ist noch nicht eingerichtet.' : 'Verbinden hat nicht geklappt. Probier es noch mal.')
  }

  async function disconnect() {
    setBusy(true)
    await supabase.functions.invoke('spotify', { body: { action: 'disconnect' } })
    await load()
    setBusy(false)
  }

  const mine = !!status?.connected.includes(me.id)
  const people = members.filter((m) => !m.is_board)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={onBack}>
          <Icon icon={ArrowLeft} size={22} />
        </button>
        <h2 className="flex-1 font-display text-title text-ink">Spotify</h2>
      </div>

      <p className="text-body text-ink-muted">
        Läuft bei dir Musik oder ein Podcast, zeigt das Board das oben an und im Bildschirmschoner. Pausiert oder aus: nichts.
      </p>

      {notice && (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-label text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="status" className="rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          {error}
        </p>
      )}

      <NowPlayingHeader variant="phone" />

      {status && (
        <section className="hb-tile hb-tile-static gap-3 p-4">
          {people.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="flex-1 text-body text-ink">{m.name}</span>
              {status.connected.includes(m.id) ? (
                <Badge tone="success">Verbunden</Badge>
              ) : (
                <span className="text-label text-ink-muted">Nicht verbunden</span>
              )}
            </div>
          ))}
        </section>
      )}

      {status &&
        (mine ? (
          <Button variant="ghost" disabled={busy} icon={<Icon icon={Unlink} size={20} />} onClick={disconnect}>
            Spotify trennen
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            disabled={busy || !status.configured}
            icon={<Icon icon={Music} size={22} />}
            onClick={connect}
          >
            Spotify verbinden
          </Button>
        ))}
      {status && !status.configured && (
        <p className="text-label text-ink-muted">Die Spotify-App ist noch nicht eingerichtet (Client-ID und Secret in Supabase fehlen).</p>
      )}
    </div>
  )
}
