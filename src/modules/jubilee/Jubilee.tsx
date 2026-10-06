import { Heart, PartyPopper } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { dayLabel, useToday } from '../../lib/time'
import { setModuleConfig } from '../useModules'
import { daysTogether, formatNumber, jubileesOn, longDay, monthsTogether, upcoming, useSince } from './jubileeDates'

/**
 * Nur an besonderen Tagen (Entscheidung Jonathan 7.10.2026): Karte in der Wand-Kopfzeile bzw. oben am Handy,
 * den ganzen Tag. Antippen zeigt, wie lange ihr schon zusammen seid.
 */
export function JubileeHeader() {
  const since = useSince()
  const today = useToday()
  const [open, setOpen] = useState(false)
  const list = jubileesOn(since, today)
  if (!list.length) return null
  const [main, ...more] = list

  return (
    <>
      {/* teilt sich mit Essen und Wochenrückblick die Regeln im Kopfzeilen-Platz */}
      <button type="button" className="hb-meal-card hb-jubilee-card hb-slot-item" data-kind="meal" aria-label={`Heute: ${main.text}`} onClick={() => setOpen(true)}>
        <span className="hb-recipe-img hb-meal-card-img hb-jubilee-heart">
          <Icon icon={Heart} size={24} />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="hb-meal-card-when">
            <Icon icon={PartyPopper} size={14} />
            {more.length ? `Heute · auch ${more.map((j) => j.text.replace(' zusammen', '').replace(', eine Schnapszahl', '')).join(', ')}` : 'Heute'}
          </span>
          <span className="hb-meal-card-title">{main.text}</span>
        </span>
      </button>
      {open && <JubileeSheet since={since} today={today} onClose={() => setOpen(false)} />}
    </>
  )
}

function Stats({ since, today }: { since: string; today: string }) {
  const days = daysTogether(since, today)
  const months = monthsTogether(since, today)
  const years = Math.floor(months / 12)
  return (
    <div className="hb-jubilee-stats">
      <span>
        <b>{formatNumber(days)}</b> Tage
      </span>
      <span>
        <b>{formatNumber(Math.floor(days / 7))}</b> Wochen
      </span>
      <span>
        <b>{formatNumber(months)}</b> Monate
      </span>
      {years > 0 && (
        <span>
          <b>{years}</b> {years === 1 ? 'Jahr' : 'Jahre'}
        </span>
      )}
    </div>
  )
}

function JubileeSheet({ since, today, onClose }: { since: string; today: string; onClose: () => void }) {
  const { people } = useMembers()
  const list = jubileesOn(since, today)
  return (
    <Sheet title={list[0]?.text ?? 'Zusammen'} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <span className="hb-jubilee-big">
          <Icon icon={Heart} size={56} />
        </span>
        <p className="text-body text-ink">
          {people.map((p) => p.name).join(' & ')} seit dem {longDay(since)}
        </p>
        <Stats since={since} today={today} />
      </div>
    </Sheet>
  )
}

const input = 'h-7 w-full rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring'

/** Einstellungen: Zusammen-seit-Datum eintragen, Stand und die nächsten besonderen Tage */
export function JubileeSettings({ onBack }: { onBack: () => void }) {
  const since = useSince()
  const today = useToday()
  const [draft, setDraft] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const value = draft ?? since
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && value < today

  async function save() {
    const ok = await setModuleConfig('jubilaeum', { since: value })
    if (ok) setDraft(null)
    setMessage(ok ? { ok: true, text: 'Gespeichert.' } : { ok: false, text: 'Speichern hat nicht geklappt.' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Jubiläen" onBack={onBack} />
      <p className="text-body text-ink-muted">
        An besonderen Tagen steht oben eine Karte: Jahrestage, jeden Monat am selben Tag, alle 100 Tage und Schnapszahlen wie 1.111 Tage. Sonst
        siehst du davon nichts.
      </p>

      {message && (
        <p role="status" className={`rounded-md px-3 py-2 text-label ${message.ok ? 'bg-success-soft text-success' : 'bg-urgent-soft text-urgent'}`}>
          {message.text}
        </p>
      )}

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Zusammen seit</span>
          <input
            className={input}
            type="date"
            value={value}
            max={today}
            onChange={(e) => {
              setMessage(null)
              setDraft(e.target.value)
            }}
          />
        </label>
        <Button variant="primary" disabled={draft === null || !valid} onClick={save}>
          Speichern
        </Button>
      </section>

      {since && !draft && (
        <>
          <section className="hb-tile hb-tile-static items-center gap-3 p-4 text-center">
            <h3 className="font-display text-[18px] font-semibold text-ink">Bis heute</h3>
            <Stats since={since} today={today} />
          </section>
          <section className="hb-tile hb-tile-static gap-2 p-4">
            <h3 className="font-display text-[18px] font-semibold text-ink">Als Nächstes</h3>
            <ul className="flex flex-col gap-1">
              {upcoming(since, today).map(({ day, jubilee }) => (
                <li key={day} className="hb-recap-line">
                  <span className="hb-jubilee-when">{dayLabel(day)} {longDay(day).split(' ').slice(1).join(' ')}</span>
                  <span className="min-w-0 flex-1">{jubilee.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
