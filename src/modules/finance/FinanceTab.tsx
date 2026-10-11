import { ChevronRight, CircleAlert, Copy, FileSpreadsheet, KeyRound, Lock, Plus, Share, ShieldCheck, Tag, Upload, Wallet } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { createToken, revokeToken, useMyTokens } from '../nfc/nfcStore'
import {
  assignTx,
  euro,
  FINANCE_IMPORT_URL,
  iconOf,
  previewImport,
  ruleForCounterparty,
  runImport,
  useFinCategories,
  useFinProfile,
  useLastImport,
  useReviewQueue,
  useTransactions,
  type FinCategory,
  type FinTx,
  type ImportPreview,
} from './finStore'

const day = (iso: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
const time = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Farbiger Kreis mit dem Symbol der Kategorie (Farbe = Palettenton aus dem Design System) */
export function CategoryDot({ cat, size = 32 }: { cat: FinCategory | undefined; size?: number }) {
  return (
    <span className="hb-fin-dot" style={{ ['--cat' as string]: `var(--${cat?.color ?? 'moss-400'})`, width: size, height: size }}>
      <Icon icon={iconOf(cat?.icon ?? 'Shapes')} size={Math.round(size * 0.55)} />
    </span>
  )
}

/**
 * Reiter „Finanzen“ am Handy (Stufe 1, docs/finanzen-modul.md): Umsätze importieren (ING-CSV mit Vorschau),
 * Zuordnen mit „Immer so für …?“, letzte Buchungen, Anleitung für den Teilen-Kurzbefehl.
 * Eigene Buchungen sieht nur man selbst, Haushaltsbuchungen sehen beide (RLS).
 */
export function FinanceTab({ showToast }: { showToast: (m: string) => void }) {
  const { me } = useMembers()
  const [view, setView] = useState<'start' | 'review' | 'guide'>('start')
  if (view === 'review') return <ReviewView onBack={() => setView('start')} showToast={showToast} />
  if (view === 'guide') return <GuideView onBack={() => setView('start')} showToast={showToast} />
  return <StartView key={me.id} onReview={() => setView('review')} onGuide={() => setView('guide')} showToast={showToast} />
}

function StartView({ onReview, onGuide, showToast }: { onReview: () => void; onGuide: () => void; showToast: (m: string) => void }) {
  const { me, byId } = useMembers()
  const { profile } = useFinProfile(me.id)
  const cats = useFinCategories()
  const { txs } = useTransactions(40)
  const { queue } = useReviewQueue(me.id)
  const last = useLastImport(me.id)
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ file: File; data: ImportPreview } | null>(null)
  const [edit, setEdit] = useState<FinTx | null>(null)
  const catOf = (id: string) => cats?.find((c) => c.id === id)

  async function pick(file: File | undefined) {
    if (!file) return
    try {
      const data = await previewImport(file, me.id, profile ?? null)
      if (!data.total) return showToast('Das sieht nicht nach einem ING-Export aus. Exportiere die Umsätze als CSV.')
      setPreview({ file, data })
    } catch {
      showToast('Die Datei lässt sich nicht lesen.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 font-display text-title text-ink">
        <span className="hb-tile-icon">
          <Icon icon={Wallet} size={20} />
        </span>
        Finanzen
      </h2>

      <section className="hb-tile hb-tile-static gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-ink">Umsätze importieren</h3>
          <p className="text-label text-ink-muted">
            {last
              ? `Zuletzt ${day(last.at.slice(0, 10))}: ${last.rows_new} neu${last.to ? `, Buchungen bis ${day(last.to)}` : ''}.`
              : 'Exportiere im ING-Banking die Umsätze als CSV und wähle die Datei hier aus.'}
          </p>
        </div>
        <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="primary" size="lg" icon={<Icon icon={Upload} size={20} />} onClick={() => input.current?.click()}>
          Datei wählen
        </Button>
        <button type="button" className="hb-fin-link" onClick={onGuide}>
          <Icon icon={Share} size={16} />
          Oder direkt aus dem Teilen-Menü hochladen
          <Icon icon={ChevronRight} size={16} />
        </button>
      </section>

      {queue && queue.length > 0 && (
        <button type="button" className="hb-tile hb-tile-static hb-fin-review-card" onClick={onReview}>
          <span className="hb-fin-dot" style={{ ['--cat' as string]: 'var(--warning)' }}>
            <Icon icon={Tag} size={18} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="font-semibold text-ink">Zuordnen</span>
            <span className="text-label text-ink-muted">
              {queue.length} {queue.length === 1 ? 'Buchung' : 'Buchungen'} ohne Kategorie
            </span>
          </span>
          <Icon icon={ChevronRight} size={20} />
        </button>
      )}

      <section className="hb-tile hb-tile-static gap-1">
        <h3 className="mb-1 font-semibold text-ink">Letzte Buchungen</h3>
        {txs === null ? (
          <p className="text-label text-ink-muted">Einen Moment …</p>
        ) : txs.length === 0 ? (
          <p className="text-body text-ink-muted">Noch keine Buchungen. Importier deinen ersten Monat, dann siehst du hier, wofür das Geld weg ist.</p>
        ) : (
          <ul className="flex flex-col">
            {txs.map((t) => {
              const mine = t.owner === me.id
              return (
                <li key={t.id}>
                  <button type="button" className="hb-fin-row" disabled={!mine} onClick={() => mine && setEdit(t)}>
                    <CategoryDot cat={catOf(t.category)} />
                    <span className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="truncate text-ink">{t.counterparty}</span>
                      <span className="truncate text-label text-ink-muted">
                        {day(t.booked_on)}
                        {t.booked_at ? ` · ${time(t.booked_at)}` : ''} · {catOf(t.category)?.name ?? t.category}
                        {!mine ? ` · ${byId.get(t.owner)?.name ?? ''}` : ''}
                      </span>
                    </span>
                    {t.household && <span className="hb-fin-chip">Haushalt</span>}
                    {t.needs_review && <Icon icon={CircleAlert} size={16} label="Noch zuordnen" className="text-warning" />}
                    <span className={`hb-fin-amount ${t.amount > 0 ? 'is-in' : ''}`}>{euro(t.amount, true)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-2 px-1 text-label text-ink-muted">
        <Icon icon={Lock} size={16} />
        Nur du siehst deine Buchungen. Haushalt sehen beide, an der Wand nur Summen.
      </p>

      {preview && (
        <ImportSheet
          file={preview.file}
          data={preview.data}
          onClose={() => setPreview(null)}
          onDone={(m) => {
            setPreview(null)
            showToast(m)
          }}
        />
      )}
      {edit && (
        <Sheet title={edit.counterparty} onClose={() => setEdit(null)}>
          <AssignEditor
            tx={edit}
            cats={cats ?? []}
            onDone={(m) => {
              setEdit(null)
              if (m) showToast(m)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

/** Vorschau vor dem Import: Zeitraum, Anzahl, neu/schon da, Summen, Gemeinschaftskonto */
function ImportSheet({ file, data, onClose, onDone }: { file: File; data: ImportPreview; onClose: () => void; onDone: (m: string) => void }) {
  const [joint, setJoint] = useState(data.joint)
  const [busy, setBusy] = useState(false)
  const range = data.parse.from && data.parse.to ? `${day(data.parse.from)} – ${day(data.parse.to)}` : ''

  async function go() {
    setBusy(true)
    const r = await runImport(file, joint)
    setBusy(false)
    onDone(r.message)
  }

  return (
    <Sheet title="Vorschau" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Icon icon={FileSpreadsheet} size={26} className="text-accent" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ink">{data.parse.account ?? 'ING-Konto'}</span>
            <span className="text-label text-ink-muted">{range}</span>
          </div>
        </div>
        <div className="hb-fin-stats">
          <Stat value={data.total} label={data.total === 1 ? 'Buchung' : 'Buchungen'} />
          <Stat value={data.fresh} label="neu" tone="success" />
          <Stat value={data.duplicate} label="schon da" />
        </div>
        <dl className="hb-fin-sums">
          <div>
            <dt>Ausgaben</dt>
            <dd>{euro(data.spent)}</dd>
          </div>
          <div>
            <dt>Einnahmen</dt>
            <dd className="is-in">{euro(data.earned, true)}</dd>
          </div>
          <div>
            <dt>Ohne Kategorie</dt>
            <dd>{data.review}</dd>
          </div>
        </dl>
        {data.parse.account && (
          <Toggle
            checked={joint}
            onChange={setJoint}
            label={`${data.parse.account} ist euer gemeinsames Konto: alle Buchungen zählen zum Haushalt`}
          />
        )}
        <p className="flex gap-2 rounded-md bg-surface-sunken p-3 text-label text-ink">
          <Icon icon={ShieldCheck} size={18} className="shrink-0 text-ink-muted" />
          IBAN, BIC, Mandatsreferenzen, Gläubiger-IDs, Kartennummern und Kontostand werden vor dem Speichern entfernt.
        </p>
        {data.parse.skipped.length > 0 && (
          <p className="text-label text-ink-muted">
            {data.parse.skipped.length} {data.parse.skipped.length === 1 ? 'Zeile ließ' : 'Zeilen ließen'} sich nicht lesen und {data.parse.skipped.length === 1 ? 'wird' : 'werden'} übersprungen.
          </p>
        )}
        {data.fresh > 0 ? (
          <Button variant="primary" size="lg" disabled={busy} onClick={go}>
            {busy ? 'Importiere …' : `${data.fresh} ${data.fresh === 1 ? 'Buchung' : 'Buchungen'} importieren`}
          </Button>
        ) : (
          <p className="text-body text-ink">Alles aus dieser Datei ist schon da.</p>
        )}
        <Button size="lg" onClick={onClose}>
          {data.fresh > 0 ? 'Abbrechen' : 'Schließen'}
        </Button>
      </div>
    </Sheet>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'success' }) {
  return (
    <div className={`hb-fin-stat ${tone === 'success' ? 'is-success' : ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/**
 * Kategorie wählen, Haushalt umschalten, danach „Immer so für …?“ (legt eine eigene Regel an und ordnet
 * alle offenen Buchungen dieser Gegenpartei gleich mit zu)
 */
function AssignEditor({ tx, cats, onDone }: { tx: FinTx; cats: FinCategory[]; onDone: (message?: string) => void }) {
  const { me } = useMembers()
  const [household, setHousehold] = useState(tx.household)
  const [touched, setTouched] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pickedCat = cats.find((c) => c.id === picked)

  function choose(category: string) {
    setPicked(category)
    // Haushalt folgt der Kategorie, solange man ihn nicht selbst umgestellt hat (gemeinsames Konto bleibt Haushalt)
    const cat = cats.find((c) => c.id === category)
    if (cat && !touched && !tx.household) setHousehold(cat.household_default)
  }

  async function save(always: boolean) {
    if (!picked) return
    setBusy(true)
    const ok = await assignTx(tx.id, { category: picked, household })
    let more = 0
    if (ok && always) more = await ruleForCounterparty(me.id, tx, picked, household)
    setBusy(false)
    if (!ok) return onDone('Speichern hat nicht geklappt.')
    onDone(always ? `Regel angelegt${more > 0 ? ` · ${more} weitere zugeordnet` : ''}` : undefined)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-muted">
          {day(tx.booked_on)}
          {tx.booked_at ? ` · ${time(tx.booked_at)}` : ''} · {tx.kind}
        </span>
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 hb-fin-big text-ink">{tx.counterparty}</span>
          <span className={`hb-fin-amount hb-fin-big ${tx.amount > 0 ? 'is-in' : ''}`}>{euro(tx.amount, true)}</span>
        </div>
        {tx.purpose && <span className="text-label text-ink-muted">{tx.purpose}</span>}
      </div>

      <div className="hb-fin-chips" role="group" aria-label="Kategorie">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`hb-fin-pick ${(picked ?? (tx.needs_review ? null : tx.category)) === c.id ? 'is-on' : ''}`}
            style={{ ['--cat' as string]: `var(--${c.color})` }}
            aria-pressed={picked === c.id}
            onClick={() => choose(c.id)}
          >
            <Icon icon={iconOf(c.icon)} size={16} />
            {c.name}
          </button>
        ))}
      </div>

      <Toggle
        checked={household}
        onChange={(on) => {
          setTouched(true)
          setHousehold(on)
        }}
        label="Für den Haushalt"
      />

      {picked && (
        <div className="hb-fin-always">
          <span className="font-semibold text-ink">Immer so für {tx.counterparty}?</span>
          <span className="text-label text-ink-muted">Künftige Buchungen landen dann direkt in {pickedCat?.name}.</span>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" disabled={busy} onClick={() => save(false)}>
              Nur diesmal
            </Button>
            <Button variant="primary" size="lg" disabled={busy} onClick={() => save(true)}>
              Immer so
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Zuordnen: eine Karte pro Buchung, bis die Liste leer ist */
function ReviewView({ onBack, showToast }: { onBack: () => void; showToast: (m: string) => void }) {
  const { me } = useMembers()
  const { queue, reload } = useReviewQueue(me.id)
  const cats = useFinCategories()
  const [skipped, setSkipped] = useState<string[]>([])
  const open = (queue ?? []).filter((t) => !skipped.includes(t.id))
  const tx = open[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PageHeader title="Zuordnen" onBack={onBack} />
        </div>
        {tx && (
          <span className="text-label text-ink-muted">
            1 von {open.length}
          </span>
        )}
      </div>
      {queue === null || !cats ? (
        <p className="text-label text-ink-muted">Einen Moment …</p>
      ) : !tx ? (
        <section className="hb-tile hb-tile-static items-start gap-3">
          <p className="text-body text-ink">Alles zugeordnet. Mit jeder Regel wird die Liste im nächsten Monat kürzer.</p>
          <Button onClick={onBack}>Zurück zu Finanzen</Button>
        </section>
      ) : (
        <section className="hb-tile hb-tile-static">
          <AssignEditor
            key={tx.id}
            tx={tx}
            cats={cats}
            onDone={(m) => {
              if (m) showToast(m)
              reload()
            }}
          />
          <Button variant="ghost" onClick={() => setSkipped((s) => [...s, tx.id])}>
            Später
          </Button>
        </section>
      )}
    </div>
  )
}

/** Anleitung: Kurzbefehl „Ans Haushaltsboard“ im Teilen-Menü (Datei → finance-import) */
function GuideView({ onBack, showToast }: { onBack: () => void; showToast: (m: string) => void }) {
  const { me } = useMembers()
  const { tokens, reload } = useMyTokens()
  const [fresh, setFresh] = useState<string | null>(null)

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`${what} kopiert`)
    } catch {
      showToast('Kopieren geht hier nicht. Halte den Text gedrückt.')
    }
  }

  async function newToken() {
    const token = await createToken(me.id, `iPhone ${me.name}`)
    if (!token) return showToast('Token erzeugen hat nicht geklappt.')
    setFresh(token)
    reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Per Teilen hochladen" onBack={onBack} />
      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="font-semibold text-ink">Kurzbefehl „Ans Haushaltsboard“</h3>
        <Steps>
          <li>Kurzbefehle → + → Name „Ans Haushaltsboard“. Unten auf das Info-Symbol: „Im Share-Sheet anzeigen“ an, Eingabe nur „Dateien“.</li>
          <li>Aktion „Inhalte von URL abrufen“: URL unten einsetzen, Methode POST, Anfragetext „Datei“ und als Datei die Kurzbefehl-Eingabe wählen.</li>
          <li>Header hinzufügen: Schlüssel „Authorization“, Wert „Bearer “ und dahinter dein Token (derselbe wie bei den NFC-Tags).</li>
          <li>Aktion „Mitteilung anzeigen“ mit dem Ergebnis von „Inhalte von URL abrufen“.</li>
          <li>Im ING-Banking: Umsätze → Export als CSV → Teilen → „Ans Haushaltsboard“.</li>
        </Steps>
        <CopyLine label="URL" value={FINANCE_IMPORT_URL} onCopy={copy} />
        <p className="rounded-md bg-success-soft p-3 text-label text-ink">
          Die Mitteilung sagt dann z. B. „79 neu, 5 schon da · 7 Buchungen zum Zuordnen“. Doppelt hochladen schadet nicht.
        </p>
      </section>

      <section className="hb-tile hb-tile-static gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-ink">
          <Icon icon={KeyRound} size={18} />
          Dein Token
        </h3>
        {fresh ? (
          <div className="flex flex-col gap-2 rounded-md bg-highlight p-3">
            <span className="text-label font-semibold text-highlight-ink">Neuer Token, wird nur jetzt angezeigt</span>
            <code className="hb-nfc-value">{fresh}</code>
            <Button variant="primary" icon={<Icon icon={Copy} size={18} />} onClick={() => copy(fresh, 'Token')}>
              Token kopieren
            </Button>
          </div>
        ) : (
          <p className="text-label text-ink-muted">
            {tokens?.length
              ? `Du hast ${tokens.length === 1 ? 'einen Token' : `${tokens.length} Tokens`} (z. B. für die NFC-Tags). Er funktioniert auch hier. Er wird nur einmal angezeigt; hast du ihn nicht mehr, erzeug einen neuen.`
              : 'Noch kein Token. Du brauchst einen pro iPhone.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button icon={<Icon icon={Plus} size={18} />} onClick={newToken}>
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
    </div>
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
