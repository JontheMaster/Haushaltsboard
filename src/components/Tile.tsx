import type { LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'

type Props = {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  delay?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}

// Kachel: Breite kommt vom Raster der Startseite, Inhalt scrollt bei Bedarf
export function Tile({ title, icon, action, delay = 0, className = '', style, children }: Props) {
  return (
    <section
      className={`hb-tile min-h-0 ${className}`}
      style={{ animationDelay: `${delay}ms`, ...style }}
      aria-label={title}
    >
      <header className="hb-tile-head">
        {icon && (
          <span className="hb-tile-icon">
            <Icon icon={icon} size={20} />
          </span>
        )}
        <h2 className="hb-tile-title">{title}</h2>
        {action && <div>{action}</div>}
      </header>
      <div className="hb-tile-body min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}
