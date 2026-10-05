import { Undo2 } from 'lucide-react'
import type { PersonKey } from '../lib/members'
import { Icon } from './Icon'

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
}

export function TaskItem({ label, detail, done, person, meta, showUndo, compact, onToggle }: Props) {
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
      <span className="hb-task-label" onClick={() => onToggle(!done)}>
        <span className="hb-task-text">
          {label}
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
