import type { LucideIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { TileProps } from '../modules/types'
import { Icon } from './Icon'

/**
 * Kachel-Stapel an der Wand (wie das Stapel-Widget am iPhone): mehrere Kacheln liegen übereinander,
 * seitlich wischen oder unten antippen wechselt. Unten steht pro Karte ein Symbol mit Zahl,
 * damit man auch Verdecktes im Blick hat (z. B. „Einkauf 7“).
 * Karten mit `front` (Abfahrten zur Losgehzeit) kommen von selbst nach vorn.
 * Nach 2 Minuten ohne Berührung springt der Stapel zurück auf die erste Karte.
 */
export type StackCard = { id: string; title: string; icon: LucideIcon; Tile: ComponentType<TileProps>; front?: boolean }

const IDLE_MS = 2 * 60 * 1000
/** so weit (px) muss man wischen, damit die Karte wechselt */
const SWIPE_PX = 60

// Kacheln im Stapel melden ihre Zahl (offene Todos, Artikel) für die Leiste unten
const BadgeCtx = createContext<((n: number | null) => void) | null>(null)

/** In einer Kachel aufrufen: Zahl für die Stapel-Leiste (außerhalb eines Stapels ohne Wirkung) */
export function useStackBadge(n: number | null) {
  const set = useContext(BadgeCtx)
  useEffect(() => {
    set?.(n)
  }, [set, n])
}

export function TileStack({ cards, size, delay }: { cards: StackCard[]; size: TileProps['size']; delay: number }) {
  const home = cards.find((c) => c.front)?.id ?? cards[0].id
  const [activeId, setActiveId] = useState(home)
  const [badges, setBadges] = useState<Record<string, number | null>>({})
  const [dx, setDx] = useState(0)
  const drag = useRef<{ x: number; y: number; id: number; swiping: boolean } | null>(null)
  const swallowClick = useRef(false)

  // Karte weg (z. B. Abfahrten vorbei) → zurück nach Hause; neue Karte mit `front` → nach vorn
  const frontId = cards.find((c) => c.front)?.id
  useEffect(() => {
    if (frontId) setActiveId(frontId)
  }, [frontId])
  const active = cards.findIndex((c) => c.id === activeId)
  const index = active < 0 ? 0 : active
  useEffect(() => {
    if (active < 0) setActiveId(home)
  }, [active, home])

  // nach 2 Minuten ohne Berührung zurück zur ersten Karte
  useEffect(() => {
    if (cards[index].id === home) return
    let t = setTimeout(() => setActiveId(home), IDLE_MS)
    const touch = () => {
      clearTimeout(t)
      t = setTimeout(() => setActiveId(home), IDLE_MS)
    }
    window.addEventListener('pointerdown', touch)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', touch)
    }
  }, [index, home, cards])

  const go = (step: number) => setActiveId(cards[(index + step + cards.length) % cards.length].id)

  // Wischen nur mit dem Finger: mit der Maus würde es sich mit dem Ziehen von Todos beißen (dort: Leiste unten)
  function onDown(e: ReactPointerEvent) {
    if (e.pointerType === 'mouse' || cards.length < 2) return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, swiping: false }
  }
  function onMove(e: ReactPointerEvent) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (!d.swiping) {
      // erst eindeutig seitlich, sonst ist es Scrollen (oder ein Todo, das gleich gezogen wird)
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) return void (drag.current = null)
      if (Math.abs(mx) < 14 || Math.abs(mx) < Math.abs(my) * 1.5) return
      d.swiping = true
    }
    setDx(mx)
  }
  function onUp(e: ReactPointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.swiping) return
    swallowClick.current = true
    setTimeout(() => (swallowClick.current = false), 50)
    if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1)
    setDx(0)
  }

  return (
    <div className="hb-stack">
      <div
        className={`hb-stack-cards ${dx ? 'is-swiping' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null
          setDx(0)
        }}
        onClickCapture={(e) => {
          // ein Wisch soll nichts abhaken
          if (swallowClick.current) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        {cards.map((c, i) => {
          const depth = (i - index + cards.length) % cards.length
          const setBadge = (n: number | null) => setBadges((b) => (b[c.id] === n ? b : { ...b, [c.id]: n }))
          return (
            <BadgeSlot key={c.id} set={setBadge}>
              <div
                className="hb-stack-card"
                data-depth={Math.min(depth, 2)}
                inert={depth !== 0}
                aria-hidden={depth !== 0}
                // nur die oberste Karte folgt dem Finger; ohne Wischen keine transform (Ziehen der Todos braucht das)
                style={depth === 0 && dx ? { transform: `translateX(${dx}px) rotate(${dx / 60}deg)` } : undefined}
              >
                <c.Tile size={size} delay={delay} />
              </div>
            </BadgeSlot>
          )
        })}
      </div>
      <div className="hb-stack-bar" role="tablist" aria-label="Kacheln im Stapel">
        {cards.map((c, i) => {
          const n = badges[c.id]
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${c.title}${n ? `, ${n}` : ''}`}
              className={`hb-stack-tab ${i === index ? 'is-on' : ''}`}
              onClick={() => setActiveId(c.id)}
            >
              <Icon icon={c.icon} size={18} />
              {n ? <span>{n}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Eigener Setter pro Karte (stabil, damit useStackBadge nicht dauernd neu meldet) */
function BadgeSlot({ set, children }: { set: (n: number | null) => void; children: ReactNode }) {
  const ref = useRef(set)
  ref.current = set
  const [stable] = useState(() => (n: number | null) => ref.current(n))
  return <BadgeCtx.Provider value={stable}>{children}</BadgeCtx.Provider>
}
