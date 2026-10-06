import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type Props = {
  className?: string
  /**
   * Nur Einträge zeigen, die ganz hineinpassen, darunter „+N weitere“ (antippen klappt auf).
   * Für flache Listen (jedes Kind ein Eintrag). Ohne `fit`: scrollen mit Hinweis „mehr“.
   */
  fit?: boolean
  children: ReactNode
}

// Platz für den Knopf „+N weitere“
const MORE_PX = 34

/**
 * Senkrechte Liste ohne sichtbaren Balken (Tablet und Handy zeigen keinen).
 * Nie wird ein Eintrag mitten im Wort am Rand abgeschnitten: entweder „+N weitere“ (fit) oder „mehr ▾“.
 */
export function ScrollList({ className = '', fit, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const [hidden, setHidden] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [tick, setTick] = useState(0)
  const fitting = fit && !expanded

  // Größe oder Inhalt ändert sich → neu messen
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
      setTick((t) => t + 1)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    const mo = new MutationObserver(() => setTick((t) => t + 1))
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  // fit: alle Einträge zeigen, messen, was nicht ganz passt, ausblenden
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const items = [...el.children].filter((c) => !(c as HTMLElement).dataset.more) as HTMLElement[]
    for (const c of items) c.style.display = ''
    if (!fitting) {
      setHidden(0)
      return
    }
    if (el.scrollHeight <= el.clientHeight + 1) {
      setHidden(0)
      return
    }
    const limit = el.clientHeight - MORE_PX
    let count = 0
    for (const c of items) {
      if (count > 0 || c.offsetTop + c.offsetHeight > limit) {
        c.style.display = 'none'
        count++
      }
    }
    setHidden(count)
  })
  void tick

  return (
    <div ref={ref} className={`hb-scroll-quiet relative ${fitting ? 'overflow-hidden' : 'overflow-y-auto'} ${className}`}>
      {children}
      {fitting && hidden > 0 && (
        <button type="button" data-more="1" className="hb-more-btn" onClick={() => setExpanded(true)}>
          +{hidden} {hidden === 1 ? 'weiterer' : 'weitere'}
        </button>
      )}
      {fit && expanded && (
        <button type="button" data-more="1" className="hb-more-btn" onClick={() => setExpanded(false)}>
          Weniger
        </button>
      )}
      {!fitting && more && (
        <div className="hb-more" data-more="1" aria-hidden="true">
          mehr <Icon icon={ChevronDown} size={14} />
        </div>
      )}
    </div>
  )
}
