import { useEffect, useRef, useState, type ReactNode } from 'react'

// So lange bleibt eine Weg-Karte vorn, wenn sich zwei abwechseln
const ROTATE_MS = 8000

/**
 * Fester Platz rechts in der Wand-Kopfzeile, so hoch wie Uhr + Knöpfe daneben (das Board rutscht nie nach unten).
 * Karten tragen `hb-slot-item` und `data-kind` („trip“ oder „music“):
 * - nur Musik: die normale Karte
 * - Weg + Musik: Weg-Karte oben, Musik als schmale Zeile darunter (beides gleichzeitig)
 * - zwei Wege: untereinander; zwei Wege + Musik: die Wege wechseln sich ab, die Musikzeile bleibt
 * - Essen („meal“, auch der Wochenrückblick): allein eine normale Karte, mit anderen eine schmale Zeile; bei Weg + Musik zugleich weicht es
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [kinds, setKinds] = useState({ trips: 0, music: 0, meals: 0 })
  const [index, setIndex] = useState(0)
  const rotate = kinds.music > 0 && kinds.trips > 1

  // Karten zählen (sie erscheinen und verschwinden von selbst)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      setKinds({
        trips: el.querySelectorAll('.hb-slot-item[data-kind="trip"]').length,
        music: el.querySelectorAll('.hb-slot-item[data-kind="music"]').length,
        meals: el.querySelectorAll('.hb-slot-item[data-kind="meal"]').length,
      })
    update()
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    if (!rotate) return
    const t = setInterval(() => setIndex((i) => i + 1), ROTATE_MS)
    return () => clearInterval(t)
  }, [rotate])

  // beim Abwechseln nur eine Weg-Karte zeigen
  useEffect(() => {
    const trips = ref.current?.querySelectorAll<HTMLElement>('.hb-slot-item[data-kind="trip"]') ?? []
    trips.forEach((item, i) => {
      if (!rotate || i === index % trips.length) delete item.dataset.hidden
      else item.dataset.hidden = '1'
    })
    // Weg und Musik zugleich: kein Platz mehr fürs Essen
    ref.current?.querySelectorAll<HTMLElement>('.hb-slot-item[data-kind="meal"]').forEach((item) => {
      if (kinds.trips && kinds.music) item.dataset.hidden = '1'
      else delete item.dataset.hidden
    })
  })

  const empty = kinds.trips + kinds.music + kinds.meals === 0
  const cls = [
    'hb-header-slot',
    empty && 'is-empty',
    kinds.trips && kinds.music && 'is-mixed',
    !kinds.music && kinds.trips > 1 && 'is-dense',
    // Essen neben anderem: schmale Zeile
    kinds.meals && (kinds.trips + kinds.music > 0 || kinds.meals > 1) && 'has-others',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div ref={ref} className={cls}>
      {children}
      {rotate && (
        <span className="hb-slot-dots" aria-hidden="true">
          {Array.from({ length: kinds.trips }, (_, i) => (
            <i key={i} className={i === index % kinds.trips ? 'is-on' : ''} />
          ))}
        </span>
      )}
    </div>
  )
}
