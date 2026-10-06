import { MouseSensor, TouchSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core'
import type { ReactNode } from 'react'

/** Ziehbare Zeile; die Zeile selbst bleibt antippbar (abhaken bzw. bearbeiten) */
export function DragItem({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <div
      ref={setNodeRef}
      data-flip-id={id}
      {...attributes}
      {...listeners}
      // Rolle/Tabindex der Zeile bleiben beim Abhak-Kreis und Text, nicht beim Wrapper
      role={undefined}
      tabIndex={undefined}
      className={`select-none ${isDragging ? 'opacity-35' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Sensoren für Todo-Listen: Finger kurz halten, dann ziehen (schnelles Wischen scrollt weiter,
 * Antippen hakt ab bzw. öffnet). Maus: ziehen ab 6 px Bewegung.
 */
export function useTodoDragSensors() {
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  return useSensors(mouse, touch)
}
