import type { LucideIcon } from 'lucide-react'

type Props = { icon: LucideIcon; size?: number; label?: string; className?: string }

// Alle Icons über diese Komponente: Lucide, Strich 1.75, currentColor
export function Icon({ icon: Glyph, size = 24, label, className = '' }: Props) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={`hb-icon ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
