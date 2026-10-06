import { Check, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useBring, type BringItem } from '../shopping/useBring'
import { useModuleConfig } from '../useModules'
import { baseName, isPantry, mergeIngredients, quantity } from './ingredients'
import { MEAL_DEFAULTS } from './MealSettings'
import type { Recipe } from './recipeStore'

type Row = { key: number; label: string; qty: string; item: BringItem; onList: boolean; pantry: boolean }

const norm = (s: string) => s.toLowerCase().trim()

/**
 * Nach dem Einplanen: Zutaten auf die Bring!-Liste. Alles ist vorab angehakt,
 * außer was schon draufsteht und den Vorräten (Salz, Öl …).
 */
export function BringSheet({ recipe, servings, title, onClose, onDone }: { recipe: Recipe; servings: number; title: string; onClose: () => void; onDone: (message: string) => void }) {
  const { items, addMany } = useBring()
  const { pantry } = useModuleConfig('essensplan', MEAL_DEFAULTS)
  const factor = servings / (recipe.servings || 2)

  const rows: Row[] = useMemo(
    () =>
      mergeIngredients(recipe.ingredients).map((i, key) => {
        const name = baseName(i.name)
        const n = norm(name)
        const onList = (items ?? []).some((b) => {
          const m = norm(b.name)
          return m === n || n.startsWith(m + ' ') || m.startsWith(n + ' ')
        })
        const qty = quantity(i, factor)
        return { key, label: i.name, qty, item: { name: name.charAt(0).toUpperCase() + name.slice(1), specification: qty }, onList, pantry: isPantry(i.name, pantry) }
      }),
    [recipe, items, pantry, factor],
  )

  // Vorauswahl erst, wenn die Liste geladen ist (sonst wäre „steht schon drauf“ unbekannt)
  const [picked, setPicked] = useState<Set<number> | null>(null)
  const selected = picked ?? new Set(rows.filter((r) => !r.onList && !r.pantry).map((r) => r.key))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const toggle = (k: number) => {
    const next = new Set(selected)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setPicked(next)
  }

  async function send() {
    const list = rows.filter((r) => selected.has(r.key)).map((r) => r.item)
    if (!list.length) return onClose()
    setBusy(true)
    setError(false)
    const ok = await addMany(list)
    setBusy(false)
    if (!ok) return setError(true)
    onDone(`${list.length} ${list.length === 1 ? 'Zutat' : 'Zutaten'} auf der Einkaufsliste`)
  }

  return (
    <Sheet title="Zutaten einkaufen?" onClose={onClose}>
      <p className="text-body text-ink-muted">
        {title} ist eingeplant. Was soll auf die Einkaufsliste? {items === null && 'Liste lädt …'}
      </p>
      {rows.length === 0 ? (
        <p className="text-body text-ink-muted">Für dieses Rezept sind keine Zutaten eingetragen.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => {
            const on = selected.has(r.key)
            return (
              <li key={r.key}>
                <button type="button" role="checkbox" aria-checked={on} className={`hb-pick ${on ? 'is-on' : ''}`} onClick={() => toggle(r.key)}>
                  <span className="hb-pick-box">{on && <Icon icon={Check} size={16} />}</span>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="text-body text-ink">
                      {r.qty && <span className="font-semibold">{r.qty} </span>}
                      {r.label}
                    </span>
                    {(r.onList || r.pantry) && <span className="text-caption text-ink-muted">{r.onList ? 'Steht schon auf der Liste' : 'Vorrat, meist da'}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          Bring! gerade nicht erreichbar. Probier es gleich noch mal.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" disabled={busy || selected.size === 0} onClick={send} icon={<Icon icon={ShoppingCart} size={22} />}>
          {busy ? 'Wird eingetragen …' : selected.size ? `${selected.size} auf die Einkaufsliste` : 'Nichts ausgewählt'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Nichts einkaufen
        </Button>
      </div>
    </Sheet>
  )
}
