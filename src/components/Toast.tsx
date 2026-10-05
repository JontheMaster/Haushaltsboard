import { Undo2 } from 'lucide-react'
import { useEffect } from 'react'
import { Icon } from './Icon'

type Props = {
  message: string
  /** z. B. „Rückgängig“ nach dem Löschen */
  action?: { label: string; run: () => void }
  onDone: () => void
  durationMs?: number
}

// Kurze Bestätigung unten über der Leiste, verschwindet von selbst
export function Toast({ message, action, onDone, durationMs = action ? 5000 : 3500 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs)
    return () => clearTimeout(t)
  }, [message, onDone, durationMs])

  return (
    <div role="status" aria-live="polite" className="hb-toast">
      <span>{message}</span>
      {action && (
        <button type="button" className="hb-toast-action" onClick={action.run}>
          <Icon icon={Undo2} size={16} />
          {action.label}
        </button>
      )}
    </div>
  )
}
