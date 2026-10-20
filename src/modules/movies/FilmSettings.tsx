import { Check, Clapperboard, Copy, KeyRound, Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { createToken, revokeToken, useMyTokens } from '../nfc/nfcStore'
import { setModuleConfig } from '../useModules'
import { logoUrl, openFilms, streamingServices, useFilmConfig } from './movieStore'

const MOVIES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/movies`
// Offizielles Logo von TMDB (Pflicht laut Nutzungsbedingungen, weniger auffällig als das eigene)
const TMDB_LOGO = 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg'

/** Alle Funktionen → Filme: Dienste, Mitteilung, Teilen einrichten (iPhone und Android), Datenquellen */
export function FilmSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const config = useFilmConfig()
  const [note, setNote] = useState<string | null>(null)
  const pushOn = config.push.includes(me.id)

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNote(`${what} kopiert`)
    } catch {
      setNote('Kopieren geht hier nicht. Halte den Text gedrückt.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Filme" onBack={onBack} />
      <Button variant="primary" icon={<Icon icon={Clapperboard} size={18} />} onClick={() => openFilms()}>
        Merkliste öffnen
      </Button>

      <Services selected={config.services} field="services" />
      <Services selected={config.rent_services} field="rent_services" />

      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="font-semibold text-ink">Mitteilung</h3>
        <Toggle
          label="Mitteilung, wenn ein gemerkter Film neu bei euren Diensten läuft"
          checked={pushOn}
          onChange={(on) =>
            setModuleConfig('filme', { push: on ? [...config.push.filter((id) => id !== me.id), me.id] : config.push.filter((id) => id !== me.id) })
          }
        />
        <p className="text-label text-ink-muted">Gilt nur für dich. Einmal pro Woche, montags früh. An der Wand steht der Hinweis ohnehin kurz.</p>
      </section>

      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="font-semibold text-ink">iPhone: Kurzbefehl „Film merken“</h3>
        <p className="text-label text-ink-muted">
          Teilen aus IMDb, Letterboxd, JustWatch, YouTube, Instagram, TikTok oder Safari. Das Board erkennt den Film selbst.
        </p>
        <Steps>
          <li>Kurzbefehle → + → Name „Film merken“. Unten auf das Info-Symbol: „Im Share-Sheet anzeigen“ an, Eingabe „URLs“ und „Text“.</li>
          <li>Aktion „Inhalte von URL abrufen“: URL unten einsetzen, Methode POST.</li>
          <li>Header hinzufügen: Schlüssel „Authorization“, Wert „Bearer “ und dahinter dein Token (derselbe wie bei den NFC-Tags).</li>
          <li>Anfragetext „JSON“, ein Feld: Schlüssel „text“, Typ Text, Wert = Kurzbefehl-Eingabe.</li>
          <li>Aktion „Mitteilung anzeigen“ mit „Inhalte von URL“. Dann steht da z. B. „Dune: Part Two (2024) gemerkt“.</li>
        </Steps>
        <CopyLine label="URL" value={MOVIES_URL} onCopy={copy} />
      </section>

      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="font-semibold text-ink">Android: HTTP Shortcuts</h3>
        <p className="text-label text-ink-muted">Die kostenlose App „HTTP Shortcuts“ erscheint danach im Teilen-Menü.</p>
        <Steps>
          <li>„HTTP Shortcuts“ aus dem Play Store installieren.</li>
          <li>Oben rechts → Variablen → + → „Statischer Wert“, Name „geteilt“. Haken bei „Teilen in diese Variable erlauben“ (Text). Speichern.</li>
          <li>Zurück, + → „Regulärer Shortcut“, Name „Film merken“. Methode POST, URL unten einsetzen.</li>
          <li>Anfrage-Header: „Authorization“ = „Bearer “ und dahinter dein Token.</li>
          <li>
            Anfrage-Body: „Eigener Text“, Inhaltstyp application/json, Text {'{"text": "'}…{'"}'}: an die Stelle … über das {'{}'}-Symbol die Variable „geteilt“
            einsetzen.
          </li>
          <li>Antwort-Verarbeitung: „Als Toast anzeigen“. Speichern.</li>
          <li>In einer App auf Teilen → „HTTP Shortcuts“ → „Film merken“.</li>
        </Steps>
        <CopyLine label="URL" value={MOVIES_URL} onCopy={copy} />
      </section>

      <TokenBox onCopy={copy} />
      {note && <p className="text-label text-ink-muted">{note}</p>}

      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="font-semibold text-ink">Datenquellen</h3>
        <img src={TMDB_LOGO} alt="TMDB" className="h-4 w-auto self-start" />
        <p className="text-label text-ink-muted">
          Film- und Seriendaten und Poster kommen von TMDB. Dieses Board verwendet die TMDB-API, ist aber nicht von TMDB empfohlen, zertifiziert oder
          anderweitig genehmigt.
        </p>
        <p className="text-label text-ink-muted">
          Wo etwas läuft, kommt von JustWatch (über TMDB). Gespeicherte Daten werden spätestens nach 5 Monaten neu geholt.
        </p>
      </section>
    </div>
  )
}

// Übliche Leih-Shops in Deutschland (Namen wie bei JustWatch)
const RENT_SHOPS = ['Amazon Video', 'YouTube', 'Apple TV Store', 'Google Play Movies', 'MagentaTV', 'Rakuten TV', 'Sky Store', 'Videobuster', 'Microsoft Store']

/**
 * Eure Dienste: im Abo (zählt als „Läuft bei uns“) oder zum Leihen (Preise am Film nur von diesen Anbietern).
 * Beide Listen in modules.config von „filme“ (services, rent_services).
 */
function Services({ selected, field }: { selected: string[]; field: 'services' | 'rent_services' }) {
  const rent = field === 'rent_services'
  const [list, setList] = useState<{ id: number; name: string; logo: string | null }[] | null>(null)
  useEffect(() => {
    streamingServices().then(setList)
  }, [])
  // gewählte zuerst, dann die beliebtesten aus der Liste von TMDB (ohne „with Ads“-Doppel) bzw. die üblichen Leih-Shops
  const names = [
    ...new Set([...selected, ...(rent ? RENT_SHOPS : (list ?? []).map((p) => p.name).filter((n) => !/with ads|amazon channel|apple tv channel/i.test(n)))]),
  ].slice(0, 30)
  const logoOf = (n: string) => list?.find((p) => p.name === n)?.logo ?? null
  const toggle = (n: string) => setModuleConfig('filme', { [field]: selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n] })
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <h3 className="font-semibold text-ink">{rent ? 'Zum Leihen' : 'Eure Streamingdienste'}</h3>
      <p className="text-label text-ink-muted">
        {rent
          ? 'Bei diesen Anbietern zeigt das Board den Leihpreis am Film (günstigster zuerst). Preise kommen von JustWatch, einmal pro Woche neu.'
          : 'Was hier an ist, zählt als „Läuft bei uns“ (nur im Abo, Leihen und Kaufen nicht).'}
      </p>
      <div className="hb-provider-list">
        {names.map((n) => {
          const on = selected.includes(n)
          return (
            <button key={n} type="button" className={`hb-provider ${on ? 'is-ours' : ''}`} aria-pressed={on} onClick={() => toggle(n)}>
              {logoUrl(logoOf(n)) ? <img src={logoUrl(logoOf(n))!} alt="" /> : <span className="w-1" />}
              {n}
              {on && <Icon icon={Check} size={14} />}
            </button>
          )
        })}
      </div>
      {!list && !rent && <p className="text-label text-ink-muted">Lade die Liste von TMDB …</p>}
    </section>
  )
}

function TokenBox({ onCopy }: { onCopy: (v: string, what: string) => void }) {
  const { me } = useMembers()
  const { tokens, reload } = useMyTokens()
  const [fresh, setFresh] = useState<string | null>(null)
  return (
    <section className="hb-tile hb-tile-static gap-3">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon icon={KeyRound} size={18} />
        Dein Token
      </h3>
      {fresh ? (
        <div className="flex flex-col gap-2 rounded-md bg-highlight p-3">
          <span className="text-label font-semibold text-highlight-ink">Neuer Token, wird nur jetzt angezeigt</span>
          <code className="hb-nfc-value">{fresh}</code>
          <Button variant="primary" icon={<Icon icon={Copy} size={18} />} onClick={() => onCopy(fresh, 'Token')}>
            Token kopieren
          </Button>
        </div>
      ) : (
        <p className="text-label text-ink-muted">
          {tokens?.length
            ? 'Du hast schon einen Token (z. B. für NFC oder Finanzen), der geht auch hier. Er wird nur einmal angezeigt; hast du ihn nicht mehr, erzeug einen neuen.'
            : 'Noch kein Token. Du brauchst einen pro Handy.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Icon icon={Plus} size={18} />}
          onClick={async () => {
            const t = await createToken(me.id, `Handy ${me.name}`)
            if (t) {
              setFresh(t)
              reload()
            }
          }}
        >
          Token erzeugen
        </Button>
        {tokens?.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            onClick={async () => {
              if (!confirm(`„${t.label}“ widerrufen? Kurzbefehle mit diesem Token gehen dann nicht mehr.`)) return
              if (await revokeToken(t.id)) {
                setFresh(null)
                reload()
              }
            }}
          >
            {t.label} widerrufen
          </Button>
        ))}
      </div>
    </section>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="hb-fin-steps">{children}</ol>
}

function CopyLine({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string, what: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label text-ink-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code className="hb-nfc-value min-w-0 flex-1">{value}</code>
        <button type="button" className="hb-icon-btn" aria-label={`${label} kopieren`} onClick={() => onCopy(value, label)}>
          <Icon icon={Copy} size={18} />
        </button>
      </div>
    </div>
  )
}
