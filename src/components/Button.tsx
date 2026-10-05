import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost'
  size?: 'md' | 'lg'
  icon?: ReactNode
}

export function Button({ variant = 'default', size = 'md', icon, className = '', children, ...rest }: Props) {
  const classes = [
    'hb-btn',
    variant === 'primary' && 'hb-btn-primary',
    variant === 'ghost' && 'hb-btn-ghost',
    size === 'lg' && 'hb-btn-lg',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {icon}
      {children}
    </button>
  )
}
