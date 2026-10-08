import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Animationen darin warten, bis man hinscrollt (z. B. Wetterkurve und Spruch weiter unten auf der Handy-Startseite).
 * Bis dahin stehen alle CSS-Animationen auf Pause, auch ihre Verzögerung läuft nicht.
 */
export function PlayInView({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return (
    <div ref={ref} className={`hb-await ${seen ? '' : 'is-waiting'} ${className}`}>
      {children}
    </div>
  )
}
