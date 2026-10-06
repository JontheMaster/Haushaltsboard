import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { setModuleConfig, useModuleConfig } from '../useModules'
import { addCategory, deleteCategory, useCategories } from './recipeStore'

export const MEAL_DEFAULTS = { pantry: [] as string[] }

const FIELD = 'h-7 min-w-0 flex-1 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring'

/** Eine Liste von Namen mit Hinzufügen und Entfernen (Kategorien, Vorräte) */
function NameList({ items, onAdd, onRemove, placeholder, addLabel }: { items: { key: string; name: string }[]; onAdd: (name: string) => void; onRemove: (key: string) => void; placeholder: string; addLabel: string }) {
  const [text, setText] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    const v = text.trim()
    if (!v || items.some((i) => i.name.toLowerCase() === v.toLowerCase())) return
    onAdd(v)
    setText('')
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.key} className="hb-chip-removable">
            {i.name}
            <button type="button" aria-label={`${i.name} entfernen`} onClick={() => onRemove(i.key)}>
              <Icon icon={X} size={16} />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} enterKeyHint="done" className={FIELD} />
        <button type="submit" className="hb-icon-btn hb-add-btn" aria-label={addLabel} disabled={!text.trim()}>
          <Icon icon={Plus} size={22} />
        </button>
      </form>
    </div>
  )
}

/** Essensplan-Einstellungen: Kategorien und Vorräte */
export function MealSettings({ onBack }: { onBack: () => void }) {
  const categories = useCategories()
  const { pantry } = useModuleConfig('essensplan', MEAL_DEFAULTS)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Essensplan" onBack={onBack} />
      <section className="hb-tile hb-tile-static gap-3 p-4">
        <h3 className="font-display text-body-wall font-semibold text-ink">Kategorien</h3>
        <p className="text-label text-ink-muted">Zum Filtern der Rezepte. Löschen nimmt die Kategorie auch aus allen Rezepten.</p>
        <NameList
          items={categories.map((c) => ({ key: c.id, name: c.name }))}
          onAdd={(name) => addCategory(name, (categories.at(-1)?.sort ?? 0) + 1)}
          onRemove={(id) => deleteCategory(id)}
          placeholder="Neue Kategorie, z. B. Vegetarisch"
          addLabel="Kategorie hinzufügen"
        />
      </section>
      <section className="hb-tile hb-tile-static gap-3 p-4">
        <h3 className="font-display text-body-wall font-semibold text-ink">Vorräte</h3>
        <p className="text-label text-ink-muted">Habt ihr meistens da. Beim Einplanen sind sie für die Einkaufsliste nicht angehakt.</p>
        <NameList
          items={pantry.map((p) => ({ key: p, name: p }))}
          onAdd={(name) => setModuleConfig('essensplan', { pantry: [...pantry, name] })}
          onRemove={(name) => setModuleConfig('essensplan', { pantry: pantry.filter((p) => p !== name) })}
          placeholder="z. B. Butter"
          addLabel="Vorrat hinzufügen"
        />
      </section>
    </div>
  )
}
