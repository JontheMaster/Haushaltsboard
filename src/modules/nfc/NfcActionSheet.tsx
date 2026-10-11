import { Copy, Play, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Choice } from '../../components/Choice'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import type { Json } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { APP_URL, CATEGORIES, ICONS, NFC_URL, runAction, slugify, TYPES, type NfcAction, type NfcCategory, type NfcType } from './nfcStore'
import type { RuleOption } from './useChoreRules'

const INPUT = 'h-7 w-full rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring'

type Props = {
  action: Partial<NfcAction>
  rules: RuleOption[]
  onClose: () => void
  onCopy: (value: string, what: string) => void
  onDeleted: () => void
}

/** Tag anlegen oder bearbeiten: Name, Symbol, Baustein mit passenden Feldern; bei gespeicherten Tags die iPhone-Anleitung */
export function NfcActionSheet({ action, rules, onClose, onCopy, onDeleted }: Props) {
  const { me } = useMembers()
  const isNew = !action.id
  const [label, setLabel] = useState(action.label ?? '')
  const [slug, setSlug] = useState(action.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [icon, setIcon] = useState(action.icon ?? 'Nfc')
  const [type, setType] = useState<NfcType>(action.type ?? 'log')
  const [category, setCategory] = useState<NfcCategory>(action.category ?? 'haushalt')
  const [isPrivate, setPrivate] = useState(action.private ?? false)
  const [points, setPoints] = useState(action.points ?? 1)
  const [params, setParams] = useState<Record<string, unknown>>(action.params ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const p = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')
  const set = (k: string, v: unknown) => setParams((x) => ({ ...x, [k]: v }))
  const effectiveSlug = slugTouched ? slug : slugify(label)

  // nur die Felder des gewählten Bausteins speichern
  function cleanParams(): Record<string, unknown> | string {
    switch (type) {
      case 'chore_done':
        return p('rule_id') ? { rule_id: p('rule_id') } : 'Wähle die Putzregel.'
      case 'todo_done':
        return p('match').trim() ? { match: p('match').trim() } : 'Gib den Titel des Todos an.'
      case 'todo_create':
        return p('title').trim()
          ? { title: p('title').trim(), in_hours: Number(params.in_hours) || 0, assignee: params.assignee ?? 'self', urgent: params.urgent === true }
          : 'Gib dem Todo einen Titel.'
      case 'bring_add':
        return p('item').trim() ? { item: p('item').trim(), spec: p('spec').trim() } : 'Gib den Artikel an.'
      case 'notify':
        return p('text').trim() ? { text: p('text').trim(), to: params.to === 'both' ? 'both' : 'other' } : 'Gib den Text der Mitteilung an.'
      default:
        return {}
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return setError('Gib dem Tag einen Namen.')
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(effectiveSlug)) return setError('Die Kennung darf nur Kleinbuchstaben, Zahlen und Bindestriche haben (2–40 Zeichen).')
    const clean = cleanParams()
    if (typeof clean === 'string') return setError(clean)
    setBusy(true)
    const row = {
      label: label.trim(),
      slug: effectiveSlug,
      icon,
      type,
      category,
      params: clean as Json,
      points,
      private: isPrivate,
      owner: isPrivate ? me.id : null,
    }
    const { error: err } = isNew
      ? await supabase.from('nfc_actions').insert(row)
      : await supabase.from('nfc_actions').update(row).eq('id', action.id!)
    setBusy(false)
    if (err) return setError(err.code === '23505' ? 'Diese Kennung gibt es schon. Nimm eine andere.' : 'Speichern hat nicht geklappt.')
    onClose()
  }

  async function remove() {
    if (!action.id || !confirm(`„${action.label}“ löschen? Kurzbefehle mit diesem Tag gehen dann nicht mehr.`)) return
    const { error: err } = await supabase.from('nfc_actions').delete().eq('id', action.id)
    if (err) return setError('Löschen hat nicht geklappt.')
    onDeleted()
  }

  async function tryNow() {
    if (!action.slug) return
    setResult(null)
    setResult(await runAction(action.slug))
  }

  const body = JSON.stringify({ action: action.slug ?? effectiveSlug })

  return (
    <Sheet title={isNew ? 'Neuer Tag' : 'Tag bearbeiten'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Name</span>
          <input autoFocus={isNew} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Wäsche gestartet" className={INPUT} />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Kennung (steht im Kurzbefehl)</span>
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value.toLowerCase())
            }}
            disabled={!isNew}
            className={INPUT}
          />
          {!isNew && <span className="text-label text-ink-muted">Lässt sich nicht mehr ändern, sonst gehen eingerichtete Kurzbefehle nicht mehr.</span>}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label text-ink">Symbol</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ICONS).map(([name, I]) => (
              <button
                key={name}
                type="button"
                aria-pressed={icon === name}
                aria-label={name}
                className={`hb-nfc-pick ${icon === name ? 'is-on' : ''}`}
                onClick={() => setIcon(name)}
              >
                <Icon icon={I} size={20} />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Choice<NfcType> label="Was passiert" options={TYPES.map((t) => ({ value: t.value, label: t.label }))} isSelected={(v) => v === type} onSelect={setType} />
          <span className="text-label text-ink-muted">{TYPES.find((t) => t.value === type)?.hint}</span>
        </div>

        {type === 'chore_done' && (
          <label className="flex flex-col gap-2">
            <span className="text-label text-ink">Putzregel</span>
            <select value={p('rule_id')} onChange={(e) => set('rule_id', e.target.value)} className={INPUT}>
              <option value="">Bitte wählen</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.active ? '' : ' (aus)'}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'todo_done' && (
          <label className="flex flex-col gap-2">
            <span className="text-label text-ink">Titel des Todos (genau so)</span>
            <input value={p('match')} onChange={(e) => set('match', e.target.value)} placeholder="z. B. Müll raus" className={INPUT} />
          </label>
        )}

        {type === 'todo_create' && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Titel des neuen Todos</span>
              <input value={p('title')} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Wäsche aufhängen" className={INPUT} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Erinnern nach (Stunden, 0 = keine Erinnerung)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={72}
                step={0.5}
                value={String(params.in_hours ?? 0)}
                onChange={(e) => set('in_hours', Number(e.target.value))}
                className={INPUT}
              />
            </label>
            <Choice<string>
              label="Für wen"
              options={[
                { value: 'self', label: 'Wer tippt' },
                { value: 'other', label: 'Die andere Person' },
                { value: 'open', label: 'Offen' },
              ]}
              isSelected={(v) => v === (params.assignee ?? 'self')}
              onSelect={(v) => set('assignee', v)}
            />
            <Toggle label="Dringend" checked={params.urgent === true} onChange={(v) => set('urgent', v)} />
          </>
        )}

        {type === 'bring_add' && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Artikel</span>
              <input value={p('item')} onChange={(e) => set('item', e.target.value)} placeholder="z. B. Milch" className={INPUT} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Zusatz (optional)</span>
              <input value={p('spec')} onChange={(e) => set('spec', e.target.value)} placeholder="z. B. 2 Liter" className={INPUT} />
            </label>
          </>
        )}

        {type === 'notify' && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Text der Mitteilung</span>
              <input value={p('text')} onChange={(e) => set('text', e.target.value)} placeholder="z. B. Essen ist fertig" className={INPUT} />
            </label>
            <Choice<string>
              label="An wen"
              options={[
                { value: 'other', label: 'Die andere Person' },
                { value: 'both', label: 'Beide' },
              ]}
              isSelected={(v) => v === (params.to ?? 'other')}
              onSelect={(v) => set('to', v)}
            />
          </>
        )}

        <Choice<NfcCategory>
          label="Kategorie"
          options={CATEGORIES}
          isSelected={(v) => v === category}
          onSelect={(v) => {
            setCategory(v)
            if (v === 'persoenlich' && isNew) setPrivate(true)
          }}
        />
        <Toggle label="Privat (nur ich sehe und benutze den Tag)" checked={isPrivate} onChange={setPrivate} />
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Punkte (für eine spätere Statistik)</span>
          <input type="number" inputMode="numeric" min={0} max={100} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className={INPUT} />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {isNew ? 'Tag anlegen' : 'Speichern'}
          </Button>
          {!isNew && (
            <Button type="button" variant="ghost" icon={<Icon icon={Trash2} size={18} />} onClick={remove}>
              Löschen
            </Button>
          )}
        </div>
      </form>

      {!isNew && action.slug && (
        <section className="mt-6 flex flex-col gap-3 rounded-lg bg-surface-sunken p-4">
          <h3 className="font-display text-[18px] font-semibold text-ink">Einrichten am iPhone</h3>
          <ol className="hb-widget-steps">
            <li>Kurzbefehle → Automation → Plus → NFC → Scannen → Sticker ans iPhone halten → Namen vergeben.</li>
            <li>„Sofort ausführen“ wählen, „Bei Ausführung benachrichtigen“ aus → Weiter → Neuer leerer Kurzbefehl.</li>
            <li>
              Aktion „Inhalte von URL abrufen“: URL unten einfügen, auf den Pfeil tippen, Methode POST. Header hinzufügen: Schlüssel <b>Authorization</b>, Wert{' '}
              <b>Bearer</b> + Leerzeichen + dein Token. Anfragetext JSON, Feld vom Typ Text: Schlüssel <b>action</b>, Wert die Kennung unten.
            </li>
            <li>Optional: „Wörterbuchwert abrufen“ mit Schlüssel message, dann „Mitteilung anzeigen“ mit dem Wörterbuchwert.</li>
          </ol>
          <CopyRow label="URL" value={NFC_URL} onCopy={onCopy} />
          <CopyRow label="Header Authorization" value="Bearer <dein Token>" note="Der Token, den du beim Erzeugen kopiert hast. Hast du ihn nicht mehr, erzeuge oben einen neuen." />
          <CopyRow label="Kennung (Feld action)" value={action.slug} onCopy={onCopy} />
          <CopyRow label="Anfragetext" value={body} onCopy={onCopy} />
          <CopyRow label="Ohne Kurzbefehl: Link für den Sticker" value={`${APP_URL}?tap=${action.slug}`} onCopy={onCopy} note="Öffnet das Board und löst den Tag aus (du musst angemeldet sein)." />
          <Button type="button" icon={<Icon icon={Play} size={18} />} onClick={tryNow}>
            Jetzt auslösen
          </Button>
          {result && (
            <p role="status" className={`rounded-md px-3 py-2 text-label ${result.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
              {result.message}
            </p>
          )}
        </section>
      )}
    </Sheet>
  )
}

function CopyRow({ label, value, note, onCopy }: { label: string; value: string; note?: string; onCopy?: (value: string, what: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label text-ink-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code className="hb-nfc-value min-w-0 flex-1">{value}</code>
        {onCopy && (
          <button type="button" className="hb-icon-btn" aria-label={`${label} kopieren`} onClick={() => onCopy(value, label)}>
            <Icon icon={Copy} size={18} />
          </button>
        )}
      </div>
      {note && <span className="text-label text-ink-muted">{note}</span>}
    </div>
  )
}
