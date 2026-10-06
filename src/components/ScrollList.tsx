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
  /**
   * Mit `fit`: passt nicht alles, zuerst kompakter zeigen (Attribut data-dense, Stil per CSS)
   * und erst danach Einträge in „+N weitere“ verstecken.
   */
  dense?: boolean
  children: ReactNode
}

// Platz für den Knopf „+N weitere“
const MORE_PX = 34
// „mehr“ erst ab echtem Überstand (kurze Animationen ragen kurz über den Rand)
const OVERFLOW_PX = 24

/**
 * Senkrechte Liste ohne sichtbaren Balken (Tablet und Handy zeigen keinen).
 * Nie wird ein Eintrag mitten im Wort am Rand abgeschnitten: entweder „+N weitere“ (fit) oder „mehr ▾“.
 */
export function ScrollList({ className = '', fit, dense, children }: Props) {
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
    let later: ReturnType<typeof setTimeout>
    const measure = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > OVERFLOW_PX)
    const check = () => {
      measure()
      setTick((t) => t + 1)
      // nach Gleit-Animationen (Abhaken, Verschieben) noch einmal nachmessen
      clearTimeout(later)
      later = setTimeout(measure, 500)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(later)
      el.removeEventListener('scroll', check)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  // fit: alle Einträge zeigen, messen, was nicht ganz passt, ausblenden
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Nur Einträge wieder einblenden, die wir selbst ausgeblendet haben (andere versteckte Elemente,
    // z. B. Hinweise für Screenreader, bleiben unangetastet)
    for (const c of el.querySelectorAll<HTMLElement>(':scope > [data-fit-hidden]')) {
      c.style.display = ''
      delete c.dataset.fitHidden
    }
    delete el.dataset.dense
    const items = ([...el.children] as HTMLElement[]).filter(
      (c) => !c.dataset.more && getComputedStyle(c).display !== 'none',
    )
    if (!fitting) {
      setHidden(0)
      return
    }
    const fits = () => el.scrollHeight <= el.clientHeight + 1
    if (fits()) {
      setHidden(0)
      return
    }
    if (dense) {
      el.dataset.dense = '1'
      if (fits()) {
        setHidden(0)
        return
      }
    }
    const limit = el.clientHeight - MORE_PX
    let count = 0
    for (const c of items) {
      if (count > 0 || c.offsetTop + c.offsetHeight > limit) {
        c.style.display = 'none'
        c.dataset.fitHidden = '1'
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
        <button
          type="button"
          className="hb-more"
          data-more="1"
          onClick={(e) => {
            e.stopPropagation()
            ref.current?.scrollBy({ top: ref.current.clientHeight * 0.8, behavior: 'smooth' })
          }}
        >
          mehr <Icon icon={ChevronDown} size={14} />
        </button>
      )}
    </div>
  )
}
