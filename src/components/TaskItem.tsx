import { Sparkles, Undo2 } from 'lucide-react'
import type { PersonKey } from '../lib/members'
import { Icon } from './Icon'
import { WithIcon } from './WithIcon'

type Props = {
  label: string
  detail?: string
  done: boolean
  person?: PersonKey
  meta?: string
  /** „Rückgängig“ anzeigen (die ersten 5 Sekunden nach dem Abhaken) */
  showUndo?: boolean
  compact?: boolean
  onToggle: (done: boolean) => void
  /** Tippen auf den Text: am Handy öffnet das „Bearbeiten“, an der Wand hakt es ab */
  onOpen?: () => void
  /** Aufgabe aus dem Putzplan: Symbol vor dem Text */
  chore?: boolean
}

export function TaskItem({ label, detail, done, person, meta, showUndo, compact, onToggle, onOpen, chore }: Props) {
  const classes = ['hb-task', done && 'is-done', person && person !== 'open' && `hb-person-${person}`, compact && 'hb-compact']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <button
        type="button"
        className="hb-check"
        role="checkbox"
        aria-checked={done}
        aria-label={(done ? 'Wieder öffnen: ' : 'Abhaken: ') + label}
        onClick={() => onToggle(!done)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle className="hb-check-ring" cx="12" cy="12" r="10.5" />
          <circle className="hb-check-fill" cx="12" cy="12" r="11" />
          <path className="hb-check-mark" d="M7.5 12.5l3 3 6-6.5" />
        </svg>
      </button>
      <span
        className="hb-task-label cursor-pointer"
        onClick={onOpen ?? (() => onToggle(!done))}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? `Bearbeiten: ${label}` : undefined}
        onKeyDown={onOpen ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpen() : undefined}
      >
        <span className="hb-task-text">
          {chore ? (
            <WithIcon icon={<Icon icon={Sparkles} size={compact ? 16 : 18} label="Putzplan" className="hb-chore-icon" />} text={label} />
          ) : (
            label
          )}
          {detail && <span className="text-ink-muted"> · {detail}</span>}
        </span>
      </span>
      {meta && !done && <span className="hb-task-meta">{meta}</span>}
      {done && showUndo && (
        <button type="button" className="hb-undo" onClick={() => onToggle(false)}>
          <Icon icon={Undo2} size={16} />
          Rückgängig
        </button>
      )}
    </div>
  )
}
