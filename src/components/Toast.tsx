import { useEffect } from 'react'

type Props = { message: string; onDone: () => void; durationMs?: number }

// Kurze Bestätigung unten über der Leiste, verschwindet von selbst
export function Toast({ message, onDone, durationMs = 3500 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs)
    return () => clearTimeout(t)
  }, [message, onDone, durationMs])

  return (
    <div role="status" aria-live="polite" className="hb-toast">
      {message}
    </div>
  )
}
