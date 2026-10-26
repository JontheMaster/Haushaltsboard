import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Toggle } from '../../components/Toggle'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { SHIFT_ICONS, shiftIcon } from './shifts'
import { useCalendar } from './useCalendar'

type ShiftType = Tables<'shift_types'>
type ShiftPatch = Partial<Pick<ShiftType, 'match' | 'label' | 'icon' | 'is_free'>>

/**
 * Alle Funktionen → Kalender → Schicht-Arten: Titel im Schichtkalender → Name und Symbol.
 * Leviona bestätigt oder ändert die Arten selbst; neue Titel aus dem Kalender werden zum Anlegen vorgeschlagen.
 */
export function ShiftTypesSection({ onError }: { onError: () => void }) {
  const [types, setTypes] = useState<ShiftType[] | null>(null)
  const { events } = useCalendar()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('shift_types').select('*').order('sort').order('created_at')
    if (error) onError()
    setTypes(data ?? [])
  }, [onError])

  useEffect(() => {
    load()
  }, [load])

  async function patch(t: ShiftType, change: ShiftPatch) {
    setTypes((list) => list?.map((x) => (x.id === t.id ? { ...x, ...change } : x)) ?? null)
    const { error } = await supabase.from('shift_types').update(change).eq('id', t.id)
    if (error) {
      onError()
      load()
    }
  }

  async function add(title = '') {
    const sort = Math.max(0, ...(types ?? []).map((t) => t.sort)) + 1
    const { error } = await supabase.from('shift_types').insert({ match: title || 'Neue Schicht', label: title || 'Neue Schicht', icon: 'briefcase', sort })
    if (error) onError()
    load()
  }

  async function remove(t: ShiftType) {
    const { error } = await supabase.from('shift_types').delete().eq('id', t.id)
    if (error) onError()
    load()
  }

  // Titel aus dem Schichtkalender, zu denen es noch keine Art gibt (stehen bisher als „Schicht“ mit Originaltext da)
  const unknown = [...new Set((events ?? []).filter((e) => e.shift && e.shift.label === null).map((e) => e.title.trim()))].filter(Boolean)

  return (
    <section className="hb-tile hb-tile-static gap-3 p-4">
      <div className="flex flex-col">
        <h3 className="font-display text-[18px] font-semibold text-ink">Schicht-Arten</h3>
        <span className="text-label text-ink-muted">
          So erscheinen Dienste aus Schichtkalendern: Symbol und Name statt Termin. „Titel im Kalender“ ist der Text, an dem die Art erkannt wird.
        </span>
      </div>

      {unknown.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-highlight p-3">
          <span className="text-label font-semibold text-highlight-ink">Neu im Kalender, noch ohne Art</span>
          {unknown.map((title) => (
            <Button key={title} variant="ghost" icon={<Icon icon={Plus} size={18} />} onClick={() => add(title)}>
              „{title}“ als Art anlegen
            </Button>
          ))}
        </div>
      )}

      {types?.map((t) => (
        <ShiftTypeRow key={t.id} type={t} onPatch={(c) => patch(t, c)} onRemove={() => remove(t)} />
      ))}

      <Button variant="ghost" icon={<Icon icon={Plus} size={18} />} onClick={() => add()}>
        Art hinzufügen
      </Button>
    </section>
  )
}

function ShiftTypeRow({ type, onPatch, onRemove }: { type: ShiftType; onPatch: (c: ShiftPatch) => void; onRemove: () => void }) {
  const [label, setLabel] = useState(type.label)
  const [match, setMatch] = useState(type.match)
  const [picking, setPicking] = useState(false)

  return (
    <div className="hb-shift-type">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hb-icon-btn"
          aria-label="Symbol wählen"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          <Icon icon={shiftIcon(type.icon)} size={20} />
        </button>
        <input
          className="hb-input min-w-0 flex-1"
          value={label}
          aria-label="Name"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() && label.trim() !== type.label && onPatch({ label: label.trim() })}
        />
        <button type="button" className="hb-icon-btn" aria-label={`${type.label} löschen`} onClick={onRemove}>
          <Icon icon={Trash2} size={18} />
        </button>
      </div>
      {picking && (
        <div className="hb-shift-icons" role="radiogroup" aria-label="Symbol">
          {SHIFT_ICONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={shiftIcon(type.icon) === s.icon}
              aria-label={s.label}
              title={s.label}
              className={`hb-icon-btn ${shiftIcon(type.icon) === s.icon ? 'is-on' : ''}`}
              onClick={() => {
                onPatch({ icon: s.id })
                setPicking(false)
              }}
            >
              <Icon icon={s.icon} size={18} />
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-label text-ink-muted">
        <span className="shrink-0">Titel im Kalender</span>
        <input
          className="hb-input min-w-0 flex-1"
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          onBlur={() => match.trim() && match.trim() !== type.match && onPatch({ match: match.trim() })}
        />
      </label>
      <Toggle label="Frei (kein Dienst)" checked={type.is_free} onChange={(on) => onPatch({ is_free: on })} />
    </div>
  )
}
