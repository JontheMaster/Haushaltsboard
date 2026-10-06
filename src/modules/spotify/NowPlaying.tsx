import { Music } from 'lucide-react'
import { useRef } from 'react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { useFitLevel } from '../../lib/useFitLevel'
import { useNow } from '../../lib/time'
import type { TileProps } from '../types'
import { useNowPlaying, type Playing } from './useNowPlaying'

/** „Remastered 2011“, „(feat. …)“ und Ähnliches kosten nur Platz */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*(feat\.|with |remaster|version|edit|mix|live)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo).*$/i, '')
    .trim()
}

/**
 * Läuft gerade auf Spotify. Erscheint nur, solange bei jemandem etwas spielt.
 * Wand: Karte in der Kopfzeile; Handy: Karte oben auf der Startseite.
 */
export function NowPlayingHeader({ variant }: { variant: 'wall' | 'phone' }) {
  const playing = useNowPlaying()
  if (!playing.length) return null
  return (
    <div className={`hb-np-stack ${variant === 'phone' ? 'is-phone' : ''}`}>
      {playing.map((p) => (
        <NowPlayingCard key={p.memberId} p={p} />
      ))}
    </div>
  )
}

/** Als Kachel im Raster (für „Startseite bearbeiten“) – leer, solange nichts läuft */
export function NowPlayingTile(_: TileProps) {
  return <NowPlayingHeader variant="phone" />
}

function NowPlayingCard({ p }: { p: Playing }) {
  const { byId, personKey } = useMembers()
  const now = useNow(1000)
  const person = personKey(p.memberId)
  const name = byId.get(p.memberId)?.name ?? ''
  const progress = p.durationMs ? Math.min(1, (p.progressMs + (now.getTime() - p.at)) / p.durationMs) : 0

  // Titel und Interpret nie mit „…“ abschneiden: erst ohne Zusätze, dann kleiner
  const titleRef = useRef<HTMLSpanElement>(null)
  const clean = cleanTitle(p.title)
  const titles = [p.title, ...(clean && clean !== p.title ? [clean] : [])]
  const titleLevel = useFitLevel(titleRef, titles.length + 1, p.title)
  const title = titles[Math.min(titleLevel, titles.length - 1)]
  const artistRef = useRef<HTMLSpanElement>(null)
  const firstArtist = p.artists.split(', ')[0]
  const artists = [p.artists, ...(firstArtist !== p.artists ? [firstArtist] : [])]
  const artistLevel = useFitLevel(artistRef, artists.length + 1, p.artists)
  const artist = artists[Math.min(artistLevel, artists.length - 1)]

  const whoRef = useRef<HTMLSpanElement>(null)
  const whos = [p.device ? `${name} hört · ${p.device}` : '', `${name} hört`].filter(Boolean)
  const who = whos[useFitLevel(whoRef, whos.length, whos[0])]

  return (
    <div className={`hb-np hb-person-${person}`} role="status" aria-label={`${name} hört ${p.title} von ${p.artists}`}>
      {p.image ? (
        <img className="hb-np-cover" src={p.image} alt="" />
      ) : (
        <span className="hb-np-cover is-empty">
          <Icon icon={Music} size={24} />
        </span>
      )}
      <span className="hb-np-text" aria-hidden="true">
        <span ref={whoRef} className="hb-np-who">
          <span className="hb-np-eq">
            <i />
            <i />
            <i />
          </span>
          {who}
        </span>
        <span ref={titleRef} className={`hb-np-title ${titleLevel >= titles.length ? 'is-small' : ''}`}>
          {title}
        </span>
        <span ref={artistRef} className={`hb-np-artist ${artistLevel >= artists.length ? 'is-small' : ''}`}>
          {artist}
        </span>
      </span>
      <span className="hb-np-progress" style={{ width: `${progress * 100}%` }} aria-hidden="true" />
    </div>
  )
}

/** Im Bildschirmschoner: unten rechts, im selben Stil wie die Uhr links (nur wenn etwas läuft) */
export function SaverMusic() {
  const playing = useNowPlaying()
  const { byId } = useMembers()
  const p = playing[0]
  if (!p) return null
  return (
    <div className="hb-saver-music" role="status" aria-label={`${byId.get(p.memberId)?.name ?? ''} hört ${p.title} von ${p.artists}`}>
      {p.image && <img className="hb-saver-music-cover" src={p.image} alt="" />}
      <span className="flex min-w-0 flex-col" aria-hidden="true">
        <span className="hb-saver-music-who">
          <span className="hb-np-eq">
            <i />
            <i />
            <i />
          </span>
          {byId.get(p.memberId)?.name} hört
        </span>
        <span className="hb-saver-music-title">{cleanTitle(p.title) || p.title}</span>
        <span className="hb-saver-music-artist">{p.artists}</span>
      </span>
    </div>
  )
}
