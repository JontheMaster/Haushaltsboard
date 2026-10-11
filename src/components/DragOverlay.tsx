import { DragOverlay as DndDragOverlay } from '@dnd-kit/core'
import type { ComponentProps } from 'react'
import { createPortal } from 'react-dom'

/** Aktueller Seiten-Zoom (am Wand-Tablet < 1, sonst 1), siehe Board */
function pageZoom(): number {
  return parseFloat(document.documentElement.style.zoom) || 1
}

/**
 * DragOverlay, das immer unter dem Finger bleibt.
 * - Hängt direkt an `body` (Portal): liegt die Liste in einem verschobenen Element (z. B. Stapel Todos/Einkauf, der
 *   seine Karten per transform verschiebt), rechnet `position: fixed` sonst ab diesem Element, und die Kopie
 *   landet rechts unten versetzt (11.10.2026).
 * - Seiten-Zoom am Wand-Tablet: dnd-kit setzt Position und Größe in Bildschirm-Pixeln, die Seite rechnet aber
 *   gezoomt: außen den Zoom aufheben (Position stimmt), innen wieder anwenden (Inhalt so groß wie das Original).
 * - `will-change`: die Kopie bekommt eine eigene Ebene, Ziehen ruckelt am Tablet weniger.
 */
export function DragOverlay({ children, style, ...rest }: ComponentProps<typeof DndDragOverlay>) {
  const z = pageZoom()
  const base = { ...style, willChange: 'transform' }
  return createPortal(
    z === 1 ? (
      <DndDragOverlay style={base} {...rest}>
        {children}
      </DndDragOverlay>
    ) : (
      <DndDragOverlay style={{ ...base, zoom: 1 / z }} {...rest}>
        {children ? <div style={{ zoom: z, height: '100%' }}>{children}</div> : null}
      </DndDragOverlay>
    ),
    document.body,
  )
}
