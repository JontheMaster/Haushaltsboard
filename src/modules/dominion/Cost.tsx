import { FlaskConical } from 'lucide-react'
import { Icon } from '../../components/Icon'
import type { Card } from './types'

/** Kosten wie auf der Karte: Münze mit Zahl, Trank, Schulden */
export function Cost({ card }: { card: Card }) {
  const { coins, potion, debt } = card.cost
  return (
    <span className="hb-dom-cost" aria-label={`Kosten ${coins}${potion ? ' und Trank' : ''}${debt ? `, ${debt} Schulden` : ''}`}>
      {(coins > 0 || (!potion && !debt)) && <span className="hb-dom-coin">{coins}</span>}
      {potion > 0 && (
        <span className="hb-dom-potion" title="Trank">
          <Icon icon={FlaskConical} size={20} />
        </span>
      )}
      {debt > 0 && <span className="hb-dom-debt">{debt}</span>}
    </span>
  )
}
