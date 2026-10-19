import { Check, CircleAlert, CircleCheck, Copy, House, KeyRound, Plus, Volume2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { NfcActionSheet } from './NfcActionSheet'
import { searchAddress } from '../transit/api'
import { setModuleConfig, useModuleConfig } from '../useModules'
import { DEFAULT_SOUND, ring, SOUNDS, type SoundId } from '../meals/alarm'
import { CATEGORIES, createToken, describe, iconOf, revokeToken, useMyTokens, useNfcActions, useNfcEvents, type NfcAction } from './nfcStore'
import { useChoreRules } from './useChoreRules'

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<string, string>

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )

/**
 * NFC-Tags am Handy (Alle Funktionen → NFC-Tags): eigene Kurzbefehl-Tokens, alle Tags anlegen und bearbeiten,
 * pro Tag die Anleitung fürs iPhone, und was zuletzt getippt wurde.
 */
export function NfcSettings({ onBack }: { onBack: () => void }) {
  const { me, byId } = useMembers()
  const { actions } = useNfcActions()
  const events = useNfcEvents(20)
  const { tokens, reload: reloadTokens } = useMyTokens()
  const rules = useChoreRules()
  const [edit, setEdit] = useState<Partial<NfcAction> | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const ruleTitle = (id: string) => rules.find((r) => r.id === id)?.title
  const actionLabel = (slug: string) => actions?.find((a) => a.slug === slug)?.label ?? slug

  async function newToken() {
    const label = `iPhone ${me.name}`
    const token = await createToken(me.id, label)
    if (!token) return setMessage({ ok: false, text: 'Token erzeugen hat nicht geklappt.' })
    setFresh(token)
    setMessage(null)
    reloadTokens()
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage({ ok: true, text: `${what} kopiert.` })
    } catch {
      setMessage({ ok: false, text: 'Kopieren ging nicht. Halte den Text gedrückt und kopiere ihn von Hand.' })
    }
  }

  async function toggle(a: NfcAction, enabled: boolean) {
    const { error } = await supabase.from('nfc_actions').update({ enabled }).eq('id', a.id)
    if (error) setMessage({ ok: false, text: 'Speichern hat nicht geklappt.' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="NFC-Tags" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Ein NFC-Sticker löst über einen iPhone-Kurzbefehl eine Aktion im Board aus, z. B. ein Todo anlegen oder etwas auf die Einkaufsliste setzen. Die
        Sticker brauchen nichts gespeichert, leere NTAG213 oder NTAG215 reichen.
      </p>

      {message && (
        <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
          {message.text}
        </p>
      )}

      <Section title="Dein Kurzbefehl-Token" hint={`Gehört nur dir (${me.name}). Damit weiß das Board, wer getippt hat.`}>
        {fresh && (
          <div className="flex flex-col gap-2 rounded-md bg-highlight p-3">
            <span className="text-label font-semibold text-highlight-ink">Neuer Token, wird nur jetzt angezeigt</span>
            <code className="hb-nfc-value">{fresh}</code>
            <Button variant="primary" icon={<Icon icon={Copy} size={18} />} onClick={() => copy(fresh, 'Token')}>
              Token kopieren
            </Button>
            <span className="text-label text-ink-muted">Leg ihn z. B. in den Notizen ab, bis alle Kurzbefehle eingerichtet sind. Danach kannst du ihn löschen.</span>
          </div>
        )}
        {tokens?.map((t) => (
          <div key={t.id} className="flex items-center gap-3">
            <Icon icon={KeyRound} size={20} className="text-accent" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body text-ink">{t.label}</span>
              <span className="text-label text-ink-muted">
                Erstellt {dateTime(t.created_at)}
                {t.last_used_at ? ` · zuletzt ${dateTime(t.last_used_at)}` : ' · noch nie benutzt'}
              </span>
            </span>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!confirm(`„${t.label}“ widerrufen? Kurzbefehle mit diesem Token gehen dann nicht mehr.`)) return
                if (await revokeToken(t.id)) {
                  if (fresh) setFresh(null)
                  reloadTokens()
                } else setMessage({ ok: false, text: 'Widerrufen hat nicht geklappt.' })
              }}
            >
              Widerrufen
            </Button>
          </div>
        ))}
        {tokens && tokens.length === 0 && !fresh && <p className="text-label text-ink-muted">Noch kein Token. Du brauchst einen pro iPhone.</p>}
        <Button icon={<Icon icon={Plus} size={20} />} onClick={newToken}>
          Token erzeugen
        </Button>
      </Section>

      <Section title="Tags" hint="Antippen zum Bearbeiten und für die Anleitung">
        {actions?.length === 0 && <p className="text-label text-ink-muted">Noch keine Tags. Leg den ersten an.</p>}
        {actions?.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <button type="button" className="hb-list-row min-w-0 flex-1" onClick={() => setEdit(a)}>
              <span className="hb-nfc-icon">
                <Icon icon={iconOf(a.icon)} size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="text-body font-semibold text-ink">
                  {a.label}
                  {a.private && <span className="font-normal text-ink-muted"> · privat</span>}
                </span>
                <span className="text-label text-ink-muted">{describe(a, ruleTitle)}</span>
                <span className="text-label text-ink-muted">
                  {CATEGORY_LABEL[a.category]} · {a.slug}
                </span>
              </span>
            </button>
            <Toggle label={`${a.label} an`} hideLabel checked={a.enabled} onChange={(v) => toggle(a, v)} />
          </div>
        ))}
        <Button icon={<Icon icon={Plus} size={20} />} onClick={() => setEdit({})}>
          Tag hinzufügen
        </Button>
      </Section>

      <SoundSection />
      <HomeSection onMessage={setMessage} />

      <Section title="Zuletzt getippt">
        {events?.length === 0 && <p className="text-label text-ink-muted">Noch nichts getippt.</p>}
        <ul className="flex flex-col gap-2">
          {events?.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <Icon
                icon={e.ok ? CircleCheck : CircleAlert}
                size={18}
                label={e.ok ? 'Hat geklappt' : 'Hat nicht geklappt'}
                className={`mt-[2px] shrink-0 ${e.ok ? 'text-success' : 'text-urgent'}`}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body text-ink">
                  {actionLabel(e.action)}
                  <span className="text-ink-muted"> · {e.member ? (byId.get(e.member)?.name ?? '–') : '–'}</span>
                </span>
                <span className="text-label text-ink-muted">
                  {dateTime(e.at)} · {e.message}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {edit && (
        <NfcActionSheet
          action={edit}
          rules={rules}
          onClose={() => setEdit(null)}
          onCopy={copy}
          onDeleted={() => setEdit(null)}
        />
      )}
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="hb-tile hb-tile-static gap-3 p-4">
      <div className="flex flex-col">
        <h3 className="font-display text-[18px] font-semibold text-ink">{title}</h3>
        {hint && <span className="text-label text-ink-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Ziel für den Baustein „Heimweg (Auto)“: Adresse suchen, Koordinaten in modules.config.home */
function HomeSection({ onMessage }: { onMessage: (m: { ok: boolean; text: string }) => void }) {
  const { home } = useModuleConfig('nfc', NFC_DEFAULTS)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (query.trim().length < 4) return
    setBusy(true)
    const [hit] = await searchAddress(query.trim())
    setBusy(false)
    if (!hit) return onMessage({ ok: false, text: 'Adresse nicht gefunden. Schreib Straße, Hausnummer und Ort.' })
    const ok = await setModuleConfig('nfc', { home: { address: hit.label, lat: hit.lat, lon: hit.lon } })
    onMessage(ok ? { ok: true, text: `Zuhause: ${hit.label}` } : { ok: false, text: 'Speichern hat nicht geklappt.' })
    if (ok) setQuery('')
  }

  return (
    <Section title="Zuhause" hint="Ziel für den Baustein „Heimweg (Auto)“">
      <span className="flex items-center gap-2 text-body text-ink">
        <Icon icon={House} size={20} className="text-accent" />
        {home?.address ?? 'Noch nicht eingetragen'}
      </span>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Andere Adresse, z. B. Musterstraße 1, Nürnberg"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring"
        />
        <Button disabled={busy || query.trim().length < 4} onClick={save}>
          Speichern
        </Button>
      </div>
    </Section>
  )
}

/** Ton, den das Wand-Tablet (und der Kochmodus) bei fertigen Timern spielt; gilt für alle Geräte */
function SoundSection() {
  const { timer_sound } = useModuleConfig('nfc', NFC_DEFAULTS)
  const chosen = SOUNDS.some((x) => x.id === timer_sound) ? (timer_sound as SoundId) : DEFAULT_SOUND
  return (
    <Section title="Ton für fertige Timer" hint="Spielt das Wand-Tablet, wenn z. B. die Spülmaschine fertig ist. Antippen spielt den Ton zur Probe.">
      <div className="flex flex-col gap-2">
        {SOUNDS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`hb-sound-option ${chosen === x.id ? 'is-on' : ''}`}
            aria-pressed={chosen === x.id}
            onClick={() => {
              ring(x.id)
              if (chosen !== x.id) setModuleConfig('nfc', { timer_sound: x.id })
            }}
          >
            <Icon icon={chosen === x.id ? Check : Volume2} size={18} />
            {x.label}
          </button>
        ))}
      </div>
      <span className="text-label text-ink-muted">Lautstärke = Medien-Lautstärke des Tablets.</span>
    </Section>
  )
}

const NFC_DEFAULTS: { home: { address: string; lat: number; lon: number } | null; timer_sound?: string } = { home: null }

