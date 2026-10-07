import { Image } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Tile } from '../../components/Tile'
import { useToday } from '../../lib/time'
import type { TileProps } from '../types'
import { listPhotos, signedUrls, type Photo } from './photoStore'

/** Handy-Kachel: jeden Tag ein anderes Foto aus eurer Bibliothek (nur eingeblendete) */
export function PhotoOfDayTile({ delay }: TileProps) {
  const today = useToday()
  const [photo, setPhoto] = useState<{ p: Photo; url: string } | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    listPhotos()
      .then(async (all) => {
        const list = all.filter((p) => p.active)
        if (!list.length) return alive && setPhoto(null)
        const n = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000)
        const p = list[n % list.length]
        const url = (await signedUrls([p.path])).get(p.path)
        if (alive) setPhoto(url ? { p, url } : null)
      })
      .catch(() => alive && setPhoto(null))
    return () => {
      alive = false
    }
  }, [today])

  return (
    <Tile title="Foto des Tages" icon={Image} delay={delay}>
      {photo === undefined ? (
        <div className="hb-photo-day is-loading" />
      ) : photo === null ? (
        <p className="text-body text-ink-muted">Noch keine Fotos. Unter Alle Funktionen → Bildschirmschoner hinzufügen.</p>
      ) : (
        <figure className="hb-photo-day">
          <img src={photo.url} alt="" />
          {photo.p.taken_at && (
            <figcaption>
              {new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(photo.p.taken_at))}
            </figcaption>
          )}
        </figure>
      )}
    </Tile>
  )
}
