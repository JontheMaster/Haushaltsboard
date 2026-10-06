import { Plus, ShoppingCart } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { useDevice } from '../../lib/device'
import { TaskItem } from '../../components/TaskItem'
import { Tile } from '../../components/Tile'
import { useFlip } from '../../lib/useFlip'
import type { TileProps } from '../types'
import { useBring } from './useBring'

export function ShoppingTile({ size, delay }: TileProps) {
  const { items, error, done, toggle, add } = useBring()
  const flip = useFlip<HTMLDivElement>()
  // Hinzufügen nur am Handy (an der Wand wird nur abgehakt)
  const phone = useDevice().device === 'phone'
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setText('')
    if (!(await add(value))) setText(value)
    setBusy(false)
  }

  return (
    <Tile title="Einkauf" icon={ShoppingCart} delay={delay}>
      {phone && (
        <form onSubmit={submit} className="mb-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Was fehlt? z. B. Milch, 2 Liter"
            aria-label="Artikel für die Einkaufsliste"
            enterKeyHint="done"
            autoCapitalize="sentences"
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring"
          />
          <button type="submit" className="hb-icon-btn hb-add-btn" aria-label="Auf die Einkaufsliste setzen" disabled={!text.trim() || busy}>
            <Icon icon={Plus} size={22} />
          </button>
        </form>
      )}
      {error && (
        <p role="status" className="mb-2 rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          Bring! gerade nicht erreichbar. Die Liste lädt gleich neu.
        </p>
      )}
      {items === null ? (
        !error && <p className="text-body-wall text-ink-muted">Liste lädt …</p>
      ) : items.length === 0 ? (
        <p className="text-body-wall text-ink-muted">{phone ? 'Alles da. Oben eintippen, was fehlt.' : 'Alles da. Neues kommt übers Handy oder die Bring!-App.'}</p>
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
