import { ArrowLeft, EyeOff, ImagePlus, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import { Choice } from '../../components/Choice'
import { setModuleConfig, useModuleConfig } from '../useModules'
import { SCREENSAVER_DEFAULTS } from './Screensaver'
import { useMembers } from '../../lib/members'
import { deletePhoto, listPhotos, signedUrls, updatePhoto, uploadPhoto, type Photo } from './photoStore'

type Progress = { done: number; total: number; failed: number }

/** Fotos für den Bildschirmschoner: hinzufügen, für Besuch freigeben, ausblenden, löschen */
export function PhotoLibrary({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Photo | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const list = await listPhotos()
      setPhotos(list)
      setThumbs(await signedUrls(list.map((p) => p.thumb_path)))
      setError(null)
    } catch {
      setError('Fotos gerade nicht erreichbar. Prüf die Verbindung.')
      setPhotos((p) => p ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    let done = 0
    let failed = 0
    setProgress({ done, total: files.length, failed })
    // nacheinander hochladen: schont Speicher und Verbindung am Handy
    for (const file of files) {
      try {
        await uploadPhoto(file, me.id)
      } catch {
        failed++
      }
      done++
      setProgress({ done, total: files.length, failed })
    }
    await load()
    setProgress({ done, total: files.length, failed })
    setTimeout(() => setProgress(null), failed ? 6000 : 2500)
  }

  async function patch(p: Photo, change: Partial<Pick<Photo, 'show_in_visit' | 'active'>>) {
    setPhotos((list) => list?.map((x) => (x.id === p.id ? { ...x, ...change } : x)) ?? null)
    setOpen((o) => (o && o.id === p.id ? { ...o, ...change } : o))
    if (!(await updatePhoto(p.id, change))) load()
  }

  async function remove(p: Photo) {
    setOpen(null)
    setPhotos((list) => list?.filter((x) => x.id !== p.id) ?? null)
    if (!(await deletePhoto(p))) {
      setError('Löschen hat nicht geklappt. Probier es noch mal.')
      load()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={onBack}>
          <Icon icon={ArrowLeft} size={22} />
        </button>
        <h2 className="flex-1 font-display text-title text-ink">Fotos</h2>
      </div>

      <p className="text-body text-ink-muted">
        Diese Fotos zeigt das Board als Bildschirmschoner. Im Besuchsmodus nur die, die du dafür freigibst.
      </p>

      <SaverSettings />

      <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} />
      <Button
        variant="primary"
        size="lg"
        disabled={!!progress && progress.done < progress.total}
        icon={<Icon icon={ImagePlus} size={22} />}
        onClick={() => input.current?.click()}
      >
        Fotos hinzufügen
      </Button>

      {progress && (
        <p role="status" className="rounded-md bg-surface-sunken px-4 py-3 text-label text-ink">
          {progress.done < progress.total
            ? `${progress.done} von ${progress.total} hochgeladen …`
            : progress.failed
              ? `${progress.total - progress.failed} hochgeladen, ${progress.failed} hat nicht geklappt.`
              : `${progress.total} ${progress.total === 1 ? 'Foto' : 'Fotos'} hochgeladen.`}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          {error}
        </p>
      )}

      {photos && photos.length === 0 && !progress && (
        <p className="text-body text-ink-muted">Noch keine Fotos. Füg welche hinzu, dann zeigt sie das Board, wenn niemand es benutzt.</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {photos?.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`hb-photo-thumb ${p.active ? '' : 'is-off'}`}
            aria-label={`Foto${p.show_in_visit ? ', im Besuchsmodus' : ''}${p.active ? '' : ', ausgeblendet'}`}
            onClick={() => setOpen(p)}
          >
            {thumbs.get(p.thumb_path) && <img src={thumbs.get(p.thumb_path)} alt="" loading="lazy" />}
            <span className="hb-photo-badges">
              {p.show_in_visit && (
                <span className="hb-photo-badge" title="Im Besuchsmodus">
                  <Icon icon={Users} size={14} label="Im Besuchsmodus" />
                </span>
              )}
              {!p.active && (
                <span className="hb-photo-badge" title="Ausgeblendet">
                  <Icon icon={EyeOff} size={14} label="Ausgeblendet" />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {open && <PhotoSheet photo={open} thumb={thumbs.get(open.thumb_path)} onClose={() => setOpen(null)} onPatch={patch} onDelete={remove} />}
    </div>
  )
}

function PhotoSheet({
  photo,
  thumb,
  onClose,
  onPatch,
  onDelete,
}: {
  photo: Photo
  thumb?: string
  onClose: () => void
  onPatch: (p: Photo, change: Partial<Pick<Photo, 'show_in_visit' | 'active'>>) => void
  onDelete: (p: Photo) => void
}) {
  const [full, setFull] = useState<string | undefined>(thumb)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    signedUrls([photo.path]).then((m) => m.get(photo.path) && setFull(m.get(photo.path)))
  }, [photo.path])

  return (
    <Sheet title="Foto" onClose={onClose}>
      {full && <img src={full} alt="" className="max-h-[45dvh] w-full rounded-md object-contain" />}
      <div className="flex flex-col">
        <Toggle checked={photo.active} label="Im Bildschirmschoner zeigen" onChange={(on) => onPatch(photo, { active: on })} />
        <Toggle checked={photo.show_in_visit} label="Auch im Besuchsmodus zeigen" onChange={(on) => onPatch(photo, { show_in_visit: on })} />
      </div>
      <Button
        variant="ghost"
        className="hb-btn-danger"
        icon={<Icon icon={Trash2} size={18} />}
        onClick={() => (confirm ? onDelete(photo) : setConfirm(true))}
      >
        {confirm ? 'Wirklich löschen? Nochmal tippen' : 'Foto löschen'}
      </Button>
    </Sheet>
  )
}

const INTERVALS = [
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
]
const IDLE = [
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
]

/** Wie schnell die Fotos wechseln und wann der Bildschirmschoner startet (gilt für das Wand-Tablet) */
function SaverSettings() {
  const config = useModuleConfig('bildschirmschoner', SCREENSAVER_DEFAULTS)
  // sofort anzeigen, gespeichert wird im Hintergrund (Realtime bestätigt)
  const [local, setLocal] = useState<Partial<typeof SCREENSAVER_DEFAULTS>>({})
  const value = { ...config, ...local }
  const save = (patch: Partial<typeof SCREENSAVER_DEFAULTS>) => {
    setLocal((l) => ({ ...l, ...patch }))
    setModuleConfig('bildschirmschoner', patch)
  }
  return (
    <div className="hb-tile hb-tile-static gap-4 p-4">
      <Choice<number>
        label="Fotos wechseln alle"
        options={INTERVALS}
        isSelected={(v) => v === value.interval_seconds}
        onSelect={(v) => save({ interval_seconds: v })}
      />
      <Choice<number>
        label="Bildschirmschoner startet nach"
        options={IDLE}
        isSelected={(v) => v === value.idle_minutes}
        onSelect={(v) => save({ idle_minutes: v })}
      />
    </div>
  )
}
