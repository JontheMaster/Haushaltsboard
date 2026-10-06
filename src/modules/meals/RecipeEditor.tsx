import { ArrowLeft, Download, ImagePlus, Link2, Save, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { ingredientLine, parseIngredient } from './ingredients'
import { ServingsStepper } from './RecipeDetail'
import { base64Blob, deleteRecipe, importRecipe, saveRecipe, useCategories, useImageUrl, type Recipe } from './recipeStore'

const FIELD = 'rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring'

/** Rezept anlegen oder bearbeiten, optional per Link von einer Kochseite vorausfüllen */
export function RecipeEditor({ recipe, onBack, onSaved, onDeleted }: { recipe?: Recipe; onBack: () => void; onSaved: (id: string) => void; onDeleted: () => void }) {
  const { me } = useMembers()
  const categories = useCategories()
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [duration, setDuration] = useState(recipe?.duration_min ? String(recipe.duration_min) : '')
  const [servings, setServings] = useState(recipe?.servings ?? 2)
  const [cats, setCats] = useState<string[]>(recipe?.category_ids ?? [])
  const [ingredients, setIngredients] = useState(recipe?.ingredients.map(ingredientLine).join('\n') ?? '')
  const [steps, setSteps] = useState(recipe?.steps.map((s) => s.text).join('\n') ?? '')
  const [source, setSource] = useState(recipe?.source_url ?? null)
  // undefined = Bild bleibt, null = Bild entfernen, Blob = neues Bild
  const [image, setImage] = useState<Blob | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const savedUrl = useImageUrl(image === undefined ? recipe?.thumb_path : null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!image) return setPreviewUrl(null)
    const u = URL.createObjectURL(image)
    setPreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [image])
  const shownImage = image === undefined ? savedUrl : previewUrl

  async function load() {
    const url = link.trim()
    if (!url) return
    setImporting(true)
    setImportNote(null)
    setError(null)
    const { data, error } = await importRecipe(url)
    setImporting(false)
    if (!data) return setError(error ?? 'Das Rezept ließ sich nicht laden.')
    setTitle(data.title)
    if (data.duration_min) setDuration(String(data.duration_min))
    if (data.servings) setServings(Math.min(20, data.servings))
    setIngredients(data.ingredients.map((l) => ingredientLine(parseIngredient(l))).join('\n'))
    setSteps(data.steps.join('\n'))
    setSource(data.source_url)
    if (data.image) setImage(base64Blob(data.image))
    setLink('')
    setImportNote('Geladen. Schau kurz drüber, dann speichern.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Gib dem Rezept einen Namen.')
    setBusy(true)
    setError(null)
    try {
      const id = await saveRecipe(
        {
          title: title.trim(),
          duration_min: Number(duration) > 0 ? Math.round(Number(duration)) : null,
          servings,
          category_ids: cats,
          ingredients: ingredients
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map(parseIngredient),
          steps: steps
            .split('\n')
            .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
            .filter(Boolean)
            .map((text) => ({ text })),
          source_url: source,
        },
        { id: recipe?.id, image, memberId: me.id, old: recipe },
      )
      onSaved(id)
    } catch {
      setError('Speichern hat nicht geklappt. Prüf die Verbindung und probier es noch mal.')
    }
    setBusy(false)
  }

  async function remove() {
    if (!recipe) return
    if (!confirm) return setConfirm(true)
    setBusy(true)
    if (await deleteRecipe(recipe)) return onDeleted()
    setBusy(false)
    setError('Löschen hat nicht geklappt. Probier es noch mal.')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={onBack}>
          <Icon icon={ArrowLeft} size={22} />
        </button>
        <h2 className="flex-1 font-display text-title text-ink">{recipe ? 'Rezept bearbeiten' : 'Neues Rezept'}</h2>
      </div>

      {!recipe && (
        <div className="flex flex-col gap-2">
          <span className="text-label text-ink">Von einer Webseite laden (optional)</span>
          <div className="flex gap-2">
            <label className="hb-search min-w-0 flex-1">
              <Icon icon={Link2} size={20} />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Link, z. B. von Chefkoch"
                aria-label="Link zum Rezept"
                inputMode="url"
                enterKeyHint="go"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    load()
                  }
                }}
              />
            </label>
            <Button onClick={load} disabled={!link.trim() || importing} icon={<Icon icon={Download} size={20} />}>
              {importing ? 'Lädt …' : 'Laden'}
            </Button>
          </div>
          {importNote && <p className="rounded-md bg-success-soft px-4 py-3 text-label text-success">{importNote}</p>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" className="hb-recipe-img hb-recipe-pick" onClick={() => file.current?.click()} aria-label={shownImage ? 'Bild ändern' : 'Bild wählen'}>
          {shownImage ? <img src={shownImage} alt="" /> : <Icon icon={ImagePlus} size={28} />}
        </button>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" onClick={() => file.current?.click()}>
            {shownImage ? 'Bild ändern' : 'Bild wählen'}
          </Button>
          {shownImage && (
            <Button variant="ghost" icon={<Icon icon={X} size={18} />} onClick={() => setImage(null)}>
              Bild entfernen
            </Button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) setImage(f)
          }}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Pizza" enterKeyHint="next" className={`h-7 ${FIELD}`} />
      </label>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink">Dauer in Minuten</span>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="z. B. 45"
            className={`h-7 w-[120px] ${FIELD}`}
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-label text-ink">Rezept ist für</span>
          <ServingsStepper value={servings} onChange={setServings} />
        </div>
      </div>

      {categories.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label text-ink">Kategorien</legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = cats.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  className={`hb-choice ${on ? 'is-on' : ''}`}
                  onClick={() => setCats((l) => (on ? l.filter((x) => x !== c.id) : [...l, c.id]))}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Zutaten</span>
        <span className="text-caption text-ink-muted">Eine pro Zeile, Menge vorne: „200 g Mehl“, „2 Eier“, „1 Prise Salz“</span>
        <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={8} placeholder={'500 g Spaghetti\n2 Zwiebeln\n1 Dose Tomaten'} className={`py-3 ${FIELD}`} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Zubereitung</span>
        <span className="text-caption text-ink-muted">Ein Schritt pro Zeile. Zeiten wie „20 Minuten“ werden im Kochmodus zum Timer.</span>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={10}
          placeholder={'Wasser zum Kochen bringen.\nNudeln 10 Minuten kochen.'}
          className={`py-3 ${FIELD}`}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={busy} icon={<Icon icon={Save} size={22} />}>
          {busy ? 'Speichert …' : recipe ? 'Speichern' : 'Rezept speichern'}
        </Button>
        {recipe && (
          <Button variant="ghost" className="hb-btn-danger" disabled={busy} onClick={remove} icon={<Icon icon={Trash2} size={18} />}>
            {confirm ? 'Wirklich löschen? Nochmal tippen' : 'Rezept löschen'}
          </Button>
        )}
      </div>
    </form>
  )
}
