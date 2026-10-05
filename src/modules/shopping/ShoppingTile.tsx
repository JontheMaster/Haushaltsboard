import { ShoppingCart } from 'lucide-react'
import { TaskItem } from '../../components/TaskItem'
import { Tile } from '../../components/Tile'
import { useFlip } from '../../lib/useFlip'
import type { TileProps } from '../types'
import { useBring } from './useBring'

export function ShoppingTile({ size, delay }: TileProps) {
  const { items, error, done, toggle } = useBring()
  const flip = useFlip<HTMLDivElement>()

  return (
    <Tile title="Einkauf" icon={ShoppingCart} delay={delay}>
      {error && (
        <p role="status" className="mb-2 rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          Bring! gerade nicht erreichbar. Die Liste lädt gleich neu.
        </p>
      )}
      {items === null ? (
        !error && <p className="text-body-wall text-ink-muted">Liste lädt …</p>
      ) : items.length === 0 ? (
        <p className="text-body-wall text-ink-muted">Alles da. Neues kommt über die Bring!-App.</p>
      ) : (
        <div ref={flip} className={`relative ${size === 'l' ? 'columns-2 gap-5' : ''}`}>
          {items.map((i) => (
            <div key={i.name} data-flip-id={i.name} className="break-inside-avoid">
              <TaskItem
                label={i.name}
                detail={i.specification || undefined}
                done={done.has(i.name)}
                showUndo={done.has(i.name)}
                onToggle={(d) => toggle(i, d)}
              />
            </div>
          ))}
        </div>
      )}
    </Tile>
  )
}
