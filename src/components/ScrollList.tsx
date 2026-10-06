import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Senkrecht scrollende Liste ohne sichtbaren Balken (Tablet und Handy zeigen keinen).
 * Passt der Inhalt nicht, steht unten „mehr“, bis ans Ende gescrollt ist.
 */
export function ScrollList({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  return (
    <div ref={ref} className={`hb-scroll-quiet relative overflow-y-auto ${className}`}>
      {children}
      {more && (
        <div className="hb-more" aria-hidden="true">
          mehr <Icon icon={ChevronDown} size={14} />
        </div>
      )}
    </div>
  )
}
