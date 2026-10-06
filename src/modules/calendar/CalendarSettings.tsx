import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Toggle } from '../../components/Toggle'
import type { Tables } from '../../lib/database.types'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'

type Calendar = Tables<'calendars'>

// Farben für Kalender (design/DESIGN.md): blue und berry sind die Personenfarben, die anderen cal-*
export const CALENDAR_COLORS: { id: string; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blau', swatch: 'var(--person-a)' },
  { id: 'berry', label: 'Beere', swatch: 'var(--person-b)' },
  { id: 'orange', label: 'Orange', swatch: 'var(--cal-orange)' },
  { id: 'yellow', label: 'Gelb', swatch: 'var(--cal-yellow)' },
  { id: 'lilac', label: 'Flieder', swatch: 'var(--cal-lilac)' },
  { id: 'purple', label: 'Lila', swatch: 'var(--cal-purple)' },
  { id: 'forest', label: 'Waldgrün', swatch: 'var(--cal-forest)' },
  { id: 'lime', label: 'Limette', swatch: 'var(--cal-lime)' },
]

/** Kalender: Farbe und ob er im Besuchsmodus verschwindet. Änderungen wirken sofort auf dem Board. */
export function CalendarSettings({ onBack }: { onBack: () => void }) {
  const { byId } = useMembers()
  const [calendars, setCalendars] = useState<Calendar[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase
      .from('calendars')
      .select('*')
      .order('label')
      .then(({ data, error }) => {
        setError(!!error)
        setCalendars(data ?? [])
      })
  }, [])

  async function patch(c: Calendar, change: Partial<Pick<Calendar, 'color' | 'hide_in_visit'>>) {
    setCalendars((list) => list?.map((x) => (x.id === c.id ? { ...x, ...change } : x)) ?? null)
    const { error } = await supabase.from('calendars').update(change).eq('id', c.id)
    if (error) {
      setError(true)
      setCalendars((list) => list?.map((x) => (x.id === c.id ? c : x)) ?? null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Kalender" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Jeder Kalender hat eine eigene Farbe. Im Besuchsmodus verschwinden die Kalender, bei denen „Bei Besuch ausblenden“ an ist, überall.
      </p>
      {error && (
        <p role="status" className="rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          Speichern hat nicht geklappt. Prüf die Verbindung.
        </p>
      )}
      {calendars?.map((c) => (
        <section key={c.id} className="hb-tile hb-tile-static gap-3 p-4">
          <div className="flex items-baseline gap-2">
            <h3 className="flex-1 font-display text-[18px] font-semibold text-ink">{c.label}</h3>
            {c.owner && <span className="text-label text-ink-muted">{byId.get(c.owner)?.name}</span>}
          </div>
          <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label={`Farbe für ${c.label}`}>
            {CALENDAR_COLORS.map((col) => (
              <button
                key={col.id}
                type="button"
                role="radio"
                aria-checked={c.color === col.id}
                aria-label={col.label}
                title={col.label}
                className="hb-swatch"
                style={{ background: col.swatch }}
                onClick={() => patch(c, { color: col.id })}
              >
                {c.color === col.id && <Icon icon={Check} size={18} />}
              </button>
            ))}
          </div>
          <Toggle label="Bei Besuch ausblenden" checked={c.hide_in_visit} onChange={(on) => patch(c, { hide_in_visit: on })} />
        </section>
      ))}
    </div>
  )
}
