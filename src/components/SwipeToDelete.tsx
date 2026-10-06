import { Trash2 } from 'lucide-react'
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

type Props = { onDelete: () => void; children: ReactNode }

// Ab dieser Strecke (oder 40 % der Breite) löscht das Loslassen
const THRESHOLD_PX = 110

/**
 * Nach links wischen → rot „Löschen“ erscheint, Loslassen löscht.
 * Senkrechtes Scrollen bleibt frei (touch-action: pan-y), ein Wischer löst kein Antippen aus.
 */
export function SwipeToDelete({ onDelete, children }: Props) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'gone'>('idle')
  const [height, setHeight] = useState<number | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; t: number; dir?: 'h' | 'v' } | null>(null)
  const swiped = useRef(false)

  const down = (e: PointerEvent) => {
    if (phase !== 'idle') return
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    swiped.current = false
  }

  const move = (e: PointerEvent) => {
    const s = start.current
    if (!s) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (!s.dir) {
      // Wer erst hält, will ziehen (Todo verschieben) – Wischen zählt nur direkt nach dem Antippen
      if (Date.now() - s.t > 200) {
        s.dir = 'v'
        return
      }
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) {
        s.dir = 'h'
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (Math.abs(ddy) > 8) {
        s.dir = 'v'
      }
    }
    if (s.dir === 'h') {
      swiped.current = true
      setDx(Math.min(0, ddx))
    }
  }

  const up = () => {
    const width = box.current?.offsetWidth ?? 300
    start.current = null
    setDragging(false)
    // Sperre nur für den Klick, der direkt zum Wischer gehört
    setTimeout(() => {
      swiped.current = false
    }, 60)
    if (dx < -Math.min(THRESHOLD_PX, width * 0.4)) {
      // erst hinausschieben, dann die Zeile zusammenklappen, dann löschen
      setHeight(box.current?.offsetHeight)
      setPhase('leaving')
      setDx(-width)
      setTimeout(() => {
        setPhase('gone')
        onDelete()
      }, 240)
    } else {
      setDx(0)
    }
  }

  return (
    <div
      ref={box}
      className="relative overflow-hidden rounded-md"
      style={{
        height: phase === 'gone' ? 0 : height,
        transition: 'height var(--dur-base) var(--ease-out)',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-end gap-2 bg-urgent-soft px-4 text-label text-urgent"
        style={{ opacity: Math.min(1, -dx / 60) }}
      >
        <Icon icon={Trash2} size={20} />
        Löschen
      </div>
      <div
        className="relative bg-surface-raised px-2 [touch-action:pan-y]"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform var(--dur-base) var(--ease-out)',
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          // Nach einem Wischer kein Abhaken und kein Öffnen auslösen
          if (swiped.current) {
            e.preventDefault()
            e.stopPropagation()
            swiped.current = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
