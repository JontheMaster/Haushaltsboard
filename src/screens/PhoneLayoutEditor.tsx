import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { Toggle } from '../components/Toggle'
import { useMembers } from '../lib/members'
import { DEFAULT_PHONE_LAYOUT, PHONE_TILE_MODULES } from '../modules/registry'
import type { LayoutTile } from '../modules/types'
import { savePhoneLayout, useEnabledModules, useLayout } from '../modules/useModules'

type Row = { module: string; shown: boolean }

/** Gespeichertes Layout → Zeilen: sichtbare in ihrer Reihenfolge, danach die ausgeblendeten */
function toRows(tiles: LayoutTile[]): Row[] {
  const shown = tiles.map((t) => t.module).filter((id) => PHONE_TILE_MODULES.some((m) => m.id === id))
  const hidden = PHONE_TILE_MODULES.map((m) => m.id).filter((id) => !shown.includes(id))
  return [...shown.map((module) => ({ module, shown: true })), ...hidden.map((module) => ({ module, shown: false }))]
}

const toTiles = (rows: Row[]): LayoutTile[] => rows.filter((r) => r.shown).map((r) => ({ module: r.module, size: 'm' }))

/**
 * Startseite anpassen (nur Handy, pro Person): Kacheln ein- und ausblenden und an der Griffleiste
 * in die gewünschte Reihenfolge ziehen. Jede Änderung wird sofort gespeichert. Die Wand bleibt fest.
 */
export function PhoneLayoutEditor({ onBack, showToast }: { onBack: () => void; showToast: (message: string) => void }) {
  const { me } = useMembers()
  const layout = useLayout('phone')
  const enabled = useEnabledModules()
  const [rows, setRows] = useState<Row[]>(() => toRows(layout))
  // Solange nichts geändert wurde, dem geladenen Layout folgen (es kommt evtl. erst nach dem Öffnen)
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current) setRows(toRows(layout))
  }, [layout])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function change(next: Row[]) {
    touched.current = true
    setRows(next)
    if (!(await savePhoneLayout(me.id, toTiles(next)))) showToast('Speichern hat nicht geklappt.')
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = rows.findIndex((r) => r.module === active.id)
    const to = rows.findIndex((r) => r.module === over.id)
    change(arrayMove(rows, from, to))
  }

  async function reset() {
    touched.current = true
    setRows(toRows(DEFAULT_PHONE_LAYOUT))
    if (await savePhoneLayout(me.id, null)) showToast('Standard wiederhergestellt')
    else showToast('Zurücksetzen hat nicht geklappt.')
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Startseite anpassen" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Gilt nur für dich ({me.name}) am Handy. Am Griff ziehen ändert die Reihenfolge, der Schalter blendet eine Kachel ein oder aus.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.module)} strategy={verticalListSortingStrategy}>
          <section className="hb-tile hb-tile-static hb-list-tile">
            {rows.map((r) => (
              <LayoutRow
                key={r.module}
                row={r}
                off={enabled ? !enabled.has(r.module) : false}
                onToggle={(shown) => change(rows.map((x) => (x.module === r.module ? { ...x, shown } : x)))}
              />
            ))}
          </section>
        </SortableContext>
      </DndContext>
      <Button variant="ghost" icon={<Icon icon={RotateCcw} size={18} />} onClick={reset}>
        Standard wiederherstellen
      </Button>
    </div>
  )
}

function LayoutRow({ row, off, onToggle }: { row: Row; off: boolean; onToggle: (shown: boolean) => void }) {
  const mod = PHONE_TILE_MODULES.find((m) => m.id === row.module)!
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.module })
  const on = row.shown && !off

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`hb-module-row hb-layout-row ${isDragging ? 'is-dragging' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="hb-layout-grip"
        aria-label={`${mod.title} verschieben`}
        {...attributes}
        {...listeners}
      >
        <Icon icon={GripVertical} size={20} />
      </button>
      <div className="hb-module-open">
        <span className={`hb-tile-icon ${on ? '' : 'is-off'}`}>
          <Icon icon={mod.icon} size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className={`text-body font-semibold ${on ? 'text-ink' : 'text-ink-muted'}`}>{mod.title}</span>
          <span className="text-label text-ink-muted">{off ? 'In „Alle Funktionen“ ausgeschaltet' : mod.description}</span>
        </span>
      </div>
      <Toggle hideLabel label={`${mod.title} ${row.shown ? 'ausblenden' : 'einblenden'}`} checked={row.shown} onChange={onToggle} />
    </div>
  )
}
