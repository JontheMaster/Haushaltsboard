// Fotobibliothek: Supabase-Tabelle photos + privater Storage-Bucket „photos“.
// Vor dem Hochladen wird jedes Foto im Browser verkleinert (ca. 1920 px, JPEG) plus Vorschaubild (ca. 400 px).
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'

export type Photo = Tables<'photos'>

const BUCKET = 'photos'
const FULL_PX = 1920
const THUMB_PX = 400

/** Bild auf die längere Kante `max` verkleinern und als JPEG ausgeben (EXIF-Drehung wird beachtet) */
async function resize(file: File, max: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', quality),
  )
  return { blob, width, height }
}

/** Ein Foto verkleinern, hochladen und eintragen */
export async function uploadPhoto(file: File, memberId: string): Promise<void> {
  const id = crypto.randomUUID()
  const [full, thumb] = await Promise.all([resize(file, FULL_PX, 0.82), resize(file, THUMB_PX, 0.75)])
  const path = `full/${id}.jpg`
  const thumbPath = `thumb/${id}.jpg`
  const store = supabase.storage.from(BUCKET)
  const up1 = await store.upload(path, full.blob, { contentType: 'image/jpeg' })
  if (up1.error) throw up1.error
  const up2 = await store.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg' })
  if (up2.error) throw up2.error
  const { error } = await supabase.from('photos').insert({
    id,
    path,
    thumb_path: thumbPath,
    width: full.width,
    height: full.height,
    uploaded_by: memberId,
    // Aufnahmedatum ohne EXIF-Auswertung: Änderungsdatum der Datei ist meist das Aufnahmedatum
    taken_at: new Date(file.lastModified || Date.now()).toISOString(),
  })
  if (error) throw error
}

export async function listPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase.from('photos').select('*').order('taken_at', { ascending: false })
  if (error) throw error
  return data
}

export async function updatePhoto(id: string, patch: Partial<Pick<Photo, 'show_in_visit' | 'active'>>): Promise<boolean> {
  const { error } = await supabase.from('photos').update(patch).eq('id', id)
  return !error
}

export async function deletePhoto(photo: Photo): Promise<boolean> {
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  if (error) return false
  await supabase.storage.from(BUCKET).remove([photo.path, photo.thumb_path])
  return true
}

/** Kurzlebige Links (privater Speicher), gültig eine Stunde */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
  for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl)
  return out
}
