import type { ReactNode } from 'react'
import { MorningFigure } from '../modules/briefing/MorningFigure'
import { useToday } from '../lib/time'

/** Leerer Zustand mit der kleinen Figur (dieselbe wie im Morgen-Briefing, täglich Frau oder Mann) */
export function EmptyFigure({ wall, children }: { wall?: boolean; children: ReactNode }) {
  const today = useToday()
  const variant = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000) % 2 ? 'm' : 'f'
  return (
    <div className={`hb-empty-fig ${wall ? 'is-wall' : ''}`}>
      <MorningFigure inline variant={variant} rain={false} cold={false} hot={false} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
