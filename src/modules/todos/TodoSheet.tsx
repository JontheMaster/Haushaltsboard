import { Bell, Plus, Save, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Choice } from '../../components/Choice'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { addDays, berlinHHMM, useToday, weekdayShort } from '../../lib/time'
import { useEnabledModules } from '../useModules'
import { useDevice } from '../../lib/device'
import { createTodo, deleteTodo, updateTodo, whenOf, type When } from './todoActions'
import type { Todo } from './useTodos'

type Props = {
  todo?: Todo
  onClose: () => void
  /** Nach dem Speichern: kurze Bestätigung, wo das Todo gelandet ist */
  onSaved?: (message: string) => void
}

type WhenKey = 'today' | 'tomorrow' | 'week' | 'none' | 'other'

/** Neues Todo (ohne `todo`) oder bestehendes bearbeiten */
export function TodoSheet({ todo, onClose, onSaved }: Props) {
  const today = useToday()
  const tomorrow = addDays(today, 1)
  const { me, people, personKey, byId } = useMembers()
  const { removeTodo } = useDevice()

  const initialWhen: When = todo ? whenOf(todo) : { kind: 'day', date: today }
  const [title, setTitle] = useState(todo?.title ?? '')
  const [when, setWhen] = useState<When>(initialWhen)
  const [otherDate, setOtherDate] = useState(
    initialWhen.kind === 'day' && initialWhen.date !== today && initialWhen.date !== tomorrow ? initialWhen.date : addDays(today, 2),
  )
  const [assignee, setAssignee] = useState<string | null>(todo ? todo.assignee : me.is_board ? null : me.id)
  // Erinnerung (nur mit festem Tag): Uhrzeit „HH:MM“ oder leer
  const [time, setTime] = useState(todo?.remind_at ? berlinHHMM(todo.remind_at) : '')
  const remindersOn = useEnabledModules()?.has('erinnerungen') ?? false
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const whenKey: WhenKey =
    when.kind === 'week' ? 'week' : when.kind === 'none' ? 'none' : when.date === today ? 'today' : when.date === tomorrow ? 'tomorrow' : 'other'

  const pickWhen = (k: WhenKey) => {
    if (k === 'today') setWhen({ kind: 'day', date: today })
    if (k === 'tomorrow') setWhen({ kind: 'day', date: tomorrow })
    if (k === 'week') setWhen({ kind: 'week' })
    if (k === 'none') setWhen({ kind: 'none' })
    if (k === 'other') setWhen({ kind: 'day', date: otherDate })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Gib dem Todo einen Titel.')
    setBusy(true)
    const withTime = remindersOn && when.kind === 'day' && time ? time : null
    // Erinnerungen aus: vorhandene Uhrzeit nicht anfassen
    const input = { title, when, assignee, time: remindersOn ? withTime : undefined }
    const ok = todo ? await updateTodo(todo.id, input, todo) : await createTodo(input)
    setBusy(false)
    if (!ok) return setError('Speichern hat nicht geklappt. Prüf die Verbindung und probier es noch mal.')

    const whenText =
      whenKey === 'today'
        ? 'Für heute'
        : whenKey === 'tomorrow'
          ? 'Für morgen'
          : whenKey === 'week'
            ? 'Für diese Woche'
            : whenKey === 'none'
              ? 'Ohne Tag'
              : `Für ${weekdayShort(otherDate)} ${Number(otherDate.slice(8))}.`
    const who = assignee ? byId.get(assignee)?.name : 'Offen'
    onSaved?.(`${whenText}${withTime ? ` ${withTime}` : ''} ${todo ? 'gespeichert' : 'eingetragen'} · ${who}`)
    onClose()
  }

  async function remove() {
    if (!todo) return
    // Am Handy: sofort löschen, „Rückgängig“ kommt als Bestätigung unten
    if (removeTodo) {
      removeTodo(todo)
      return onClose()
    }
    setBusy(true)
    const ok = await deleteTodo(todo.id)
    setBusy(false)
    if (!ok) return setError('Löschen hat nicht geklappt. Probier es noch mal.')
    onClose()
  }

  return (
    <Sheet title={todo ? 'Todo bearbeiten' : 'Neues Todo'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Was</span>
          <input
            autoFocus={!todo}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Altpapier raus"
            enterKeyHint="done"
            className="h-7 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring"
          />
        </label>

        <div className="flex flex-col gap-3">
          <Choice<WhenKey>
            label="Wann"
            options={[
              { value: 'today', label: 'Heute' },
              { value: 'tomorrow', label: 'Morgen' },
              { value: 'week', label: 'Diese Woche' },
              { value: 'other', label: whenKey === 'other' ? `${weekdayShort(otherDate)} ${Number(otherDate.slice(8))}.` : 'Anderer Tag' },
              { value: 'none', label: 'Ohne Tag' },
            ]}
            isSelected={(v) => v === whenKey}
            onSelect={pickWhen}
          />
          {whenKey === 'other' && (
            <input
              type="date"
              aria-label="Tag wählen"
              value={otherDate}
              min={today}
              onChange={(e) => {
                if (!e.target.value) return
                setOtherDate(e.target.value)
                setWhen({ kind: 'day', date: e.target.value })
              }}
              className="h-7 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink focus-visible:focus-ring"
            />
          )}
        </div>

        {remindersOn && when.kind === 'day' && (
          <div className="flex flex-col gap-2">
            <span className="text-label text-ink">Erinnern um</span>
            <div className="flex items-center gap-2">
              <span className="relative flex-1">
                <Icon icon={Bell} size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="time"
                  aria-label="Uhrzeit für die Erinnerung"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-7 w-full rounded-md border border-line bg-surface-sunken pl-[40px] pr-4 text-body text-ink focus-visible:focus-ring"
                />
              </span>
              {time && (
                <button type="button" className="hb-icon-btn" aria-label="Keine Erinnerung" onClick={() => setTime('')}>
                  <Icon icon={X} size={20} />
                </button>
              )}
            </div>
            {!time && <span className="text-label text-ink-muted">Optional. Zur Uhrzeit kommt eine Mitteilung aufs Handy.</span>}
          </div>
        )}

        <Choice<string | null>
          label="Wer"
          options={[
            ...people.map((p) => ({ value: p.id, label: p.name, className: `hb-person-${personKey(p.id)}` })),
            { value: null, label: 'Offen', className: 'hb-person-open' },
          ]}
          isSelected={(v) => v === assignee}
          onSelect={setAssignee}
        />

        {error && (
          <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={busy}
            icon={<Icon icon={todo ? Save : Plus} size={22} />}
          >
            {todo ? 'Speichern' : 'Todo hinzufügen'}
          </Button>
          {todo && (
            <Button variant="ghost" disabled={busy} onClick={remove} className="hb-btn-danger" icon={<Icon icon={Trash2} size={18} />}>
              Löschen
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
