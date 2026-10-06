import { ArrowLeft } from 'lucide-react'
import { Icon } from './Icon'

/** Kopf einer Unterseite am Handy: Zurück und Titel */
export function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={onBack}>
        <Icon icon={ArrowLeft} size={22} />
      </button>
      <h2 className="flex-1 font-display text-title text-ink">{title}</h2>
    </div>
  )
}
