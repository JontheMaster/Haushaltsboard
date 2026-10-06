// Rezepte, Kategorien und Bilder (Supabase-Tabellen recipes, recipe_categories, privater Bucket „recipes“)
import { useEffect, useState } from 'react'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import type { Ingredient } from './ingredients'

export type Step = { text: string }
export type Recipe = Omit<Tables<'recipes'>, 'ingredients' | 'steps'> & { ingredients: Ingredient[]; steps: Step[] }
export type Category = Tables<'recipe_categories'>

const BUCKET = 'recipes'

function toRecipe(row: Tables<'recipes'>): Recipe {
  return {
    ...row,
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as Ingredient[]) : [],
    steps: Array.isArray(row.steps) ? (row.steps as Step[]) : [],
  }
}

// Im Speicher, damit Reiterwechsel nicht neu lädt
let recipesCache: Recipe[] | null = null
let categoriesCache: Category[] | null = null

/** Alle Rezepte, live (Realtime). null = lädt noch */
export function useRecipes(): { recipes: Recipe[] | null; error: boolean } {
  const [recipes, setRecipes] = useState(recipesCache)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.from('recipes').select('*').order('title')
      if (!alive) return
      if (error) return setError(true)
      setError(false)
      recipesCache = data.map(toRecipe)
      setRecipes(recipesCache)
    }
    load()
    const ch = supabase
      .channel(`recipes-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, load)
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])
  return { recipes, error }
}

export function useCategories(): Category[] {
  const [cats, setCats] = useState<Category[]>(categoriesCache ?? [])
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('recipe_categories').select('*').order('sort').order('name')
      if (!alive || !data) return
      categoriesCache = data
      setCats(data)
    }
    load()
    const ch = supabase
      .channel(`recipe-categories-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_categories' }, load)
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])
  return cats
}

export async function addCategory(name: string, sort: number): Promise<boolean> {
  const { error } = await supabase.from('recipe_categories').insert({ name: name.trim(), sort })
  return !error
}

export async function renameCategory(id: string, name: string): Promise<boolean> {
  const { error } = await supabase.from('recipe_categories').update({ name: name.trim() }).eq('id', id)
  return !error
}

export async function deleteCategory(id: string): Promise<boolean> {
  const { error } = await supabase.from('recipe_categories').delete().eq('id', id)
  return !error
}

export type RecipeInput = Pick<Recipe, 'title' | 'duration_min' | 'servings' | 'category_ids' | 'ingredients' | 'steps' | 'source_url'>

/** Neues Rezept anlegen oder bestehendes speichern. Bild (falls neu gewählt) wird mit hochgeladen. */
export async function saveRecipe(input: RecipeInput, opts: { id?: string; image?: Blob | null; memberId: string; old?: Recipe }): Promise<string> {
  const id = opts.id ?? crypto.randomUUID()
  let paths: { image_path: string | null; thumb_path: string | null } | null = null
  if (opts.image) {
    const v = Date.now()
    const [full, thumb] = await Promise.all([resize(opts.image, 1600, 0.82), resize(opts.image, 480, 0.75)])
    const store = supabase.storage.from(BUCKET)
    const image_path = `full/${id}-${v}.jpg`
    const thumb_path = `thumb/${id}-${v}.jpg`
    const a = await store.upload(image_path, full, { contentType: 'image/jpeg' })
    if (a.error) throw a.error
    const b = await store.upload(thumb_path, thumb, { contentType: 'image/jpeg' })
    if (b.error) throw b.error
    paths = { image_path, thumb_path }
  } else if (opts.image === null) {
    paths = { image_path: null, thumb_path: null }
  }
  const row = {
    ...input,
    ingredients: input.ingredients as unknown as Tables<'recipes'>['ingredients'],
    steps: input.steps as unknown as Tables<'recipes'>['steps'],
    ...(paths ?? {}),
    updated_at: new Date().toISOString(),
  }
  const { error } = opts.id
    ? await supabase.from('recipes').update(row).eq('id', id)
    : await supabase.from('recipes').insert({ ...row, id, created_by: opts.memberId })
  if (error) throw error
  // altes Bild aufräumen
  if (paths && opts.old?.image_path) await supabase.storage.from(BUCKET).remove([opts.old.image_path, opts.old.thumb_path ?? ''])
  return id
}

export async function deleteRecipe(r: Recipe): Promise<boolean> {
  const { error } = await supabase.from('recipes').delete().eq('id', r.id)
  if (error) return false
  if (r.image_path) await supabase.storage.from(BUCKET).remove([r.image_path, r.thumb_path ?? ''])
  return true
}

/** Bild auf die längere Kante `max` verkleinern, JPEG */
async function resize(file: Blob, max: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', quality))
}

// Kurzlebige Bild-Links (privater Speicher), im Speicher gehalten, bis sie bald ablaufen
const urlCache = new Map<string, { url: string; until: number }>()
const pending = new Map<string, Promise<void>>()
const TTL = 60 * 60

async function fetchUrls(paths: string[]): Promise<void> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL)
  const until = Date.now() + (TTL - 300) * 1000
  for (const d of data ?? []) if (d.signedUrl && d.path) urlCache.set(d.path, { url: d.signedUrl, until })
}

/** Signierte URL für ein Rezeptbild; sammelt gleichzeitige Anfragen */
export function useImageUrl(path: string | null | undefined): string | null {
  const cached = path ? urlCache.get(path) : undefined
  const [url, setUrl] = useState<string | null>(cached && cached.until > Date.now() ? cached.url : null)
  useEffect(() => {
    if (!path) return setUrl(null)
    const hit = urlCache.get(path)
    if (hit && hit.until > Date.now()) return setUrl(hit.url)
    let alive = true
    let p = pending.get(path)
    if (!p) {
      p = batch(path)
      pending.set(path, p)
    }
    p.then(() => alive && setUrl(urlCache.get(path)?.url ?? null))
    return () => {
      alive = false
    }
  }, [path])
  return url
}

// Mehrere Bilder im selben Moment → eine Anfrage
let queue: string[] = []
let flush: Promise<void> | null = null
function batch(path: string): Promise<void> {
  queue.push(path)
  if (!flush) {
    flush = new Promise((ok) => setTimeout(ok, 20)).then(async () => {
      const paths = queue
      queue = []
      flush = null
      await fetchUrls(paths)
      paths.forEach((p) => pending.delete(p))
    })
  }
  return flush
}

export type Imported = {
  title: string
  duration_min: number | null
  servings: number | null
  ingredients: string[]
  steps: string[]
  image: { data: string; type: string } | null
  source_url: string
}

/** Rezept von einer Webseite holen (Edge Function recipe-import) */
export async function importRecipe(url: string): Promise<{ data?: Imported; error?: string }> {
  const { data, error } = await supabase.functions.invoke<Imported>('recipe-import', { body: { url } })
  if (error) {
    let message = 'Das Rezept ließ sich nicht laden.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) message = body.error
    } catch {
      // Standardtext
    }
    return { error: message }
  }
  return { data: data ?? undefined }
}

export function base64Blob(img: { data: string; type: string }): Blob {
  const bin = atob(img.data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: img.type })
}
