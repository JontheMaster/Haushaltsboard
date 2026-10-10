import { DragOverlay as DndDragOverlay } from '@dnd-kit/core'
import type { ComponentProps } from 'react'

/** Aktueller Seiten-Zoom (am Wand-Tablet < 1, sonst 1), siehe Board */
function pageZoom(): number {
  return parseFloat(document.documentElement.style.zoom) || 1
}

/**
 * DragOverlay, das auch mit Seiten-Zoom unter dem Finger bleibt. dnd-kit setzt Position und Größe in Bildschirm-
 * Pixeln, die Seite rechnet am Wand-Tablet aber gezoomt: außen den Zoom aufheben (Position stimmt), innen wieder
 * anwenden (Inhalt so groß wie das Original).
 */
export function DragOverlay({ children, style, ...rest }: ComponentProps<typeof DndDragOverlay>) {
  const z = pageZoom()
  if (z === 1) return <DndDragOverlay style={style} {...rest}>{children}</DndDragOverlay>
  return (
    <DndDragOverlay style={{ ...style, zoom: 1 / z }} {...rest}>
      {children ? <div style={{ zoom: z, height: '100%' }}>{children}</div> : null}
    </DndDragOverlay>
  )
}
