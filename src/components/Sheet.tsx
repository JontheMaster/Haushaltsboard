import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  /** breit (Wand), z. B. Rezept zweispaltig */
  wide?: boolean
}

// Fenster, das am Handy von unten hereinkommt
export function Sheet({ title, onClose, children, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="hb-sheet-backdrop absolute inset-0" onClick={onClose} />
      {/* Außen gleitet herein, innen wird gescrollt: dasselbe Element animieren und scrollen zeichnet Android
          bei der skalierten Wand-Seite unscharf (10.10.2026) */}
      <div
        className={`hb-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-surface-raised shadow-lift ${wide ? 'max-w-[1200px]' : 'max-w-[560px]'}`}
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4 pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]">
          <header className="flex items-center gap-2">
            <h2 className="flex-1 font-display text-title text-ink">{title}</h2>
            <button type="button" className="hb-icon-btn" aria-label="Schließen" onClick={onClose}>
              <Icon icon={X} size={22} />
            </button>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
