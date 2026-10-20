import { Clapperboard, Heart, Minus, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { posterUrl, runtimeLabel, type Movie, type Vote, type Want } from './movieStore'

/** Poster mit Ersatz, wenn TMDB kein Bild hat oder es nicht lädt */
export function PosterImage({
  path,
  title,
  size = 'w342',
  className = '',
}: {
  path: string | null
  title: string
  size?: 'w92' | 'w185' | 'w342' | 'w500'
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const src = posterUrl(path, size)
  return (
    <span className={`hb-poster-img ${className}`}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="hb-poster-fallback">
          <Icon icon={Clapperboard} size={28} />
          {title}
        </span>
      )}
    </span>
  )
}

const WANT_ICON: Record<Want, typeof Heart> = { unbedingt: Heart, gerne: ThumbsUp, egal: Minus, lieber_nicht: ThumbsDown }

/** Stimmen beider Personen als kleine Punkte in Personenfarbe */
export function VoteDots({ movieId, votes }: { movieId: string; votes: Vote[] }) {
  const { people, personKey } = useMembers()
  const mine = people.map((p) => ({ p, v: votes.find((x) => x.movie_id === movieId && x.member === p.id)?.want })).filter((x) => x.v)
  if (!mine.length) return null
  return (
    <span className="hb-poster-votes">
      {mine.map(({ p, v }) => (
        <span
          key={p.id}
          className={`hb-vote-dot hb-film-person hb-person-${personKey(p.id)} ${v === 'egal' ? 'is-egal' : v === 'lieber_nicht' ? 'is-no' : ''}`}
          title={`${p.name}: ${v === 'lieber_nicht' ? 'lieber nicht' : v}`}
        >
          <Icon icon={WANT_ICON[v!]} size={12} />
        </span>
      ))}
    </span>
  )
}

/** Poster-Karte im Raster */
export function PosterCard({ movie, votes, badge, dim, onOpen }: { movie: Movie; votes: Vote[]; badge?: string | null; dim?: boolean; onOpen: () => void }) {
  const meta = [movie.year, movie.kind === 'tv' ? 'Serie' : runtimeLabel(movie)].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      className={`hb-poster ${dim ? 'is-dim' : ''}`}
      onClick={onOpen}
      aria-label={`${movie.title}${movie.year ? ` (${movie.year})` : ''} öffnen`}
    >
      <span className="relative">
        <PosterImage path={movie.poster_path} title={movie.title} />
        <VoteDots movieId={movie.id} votes={votes} />
        {badge && <span className="hb-poster-badge">{badge}</span>}
      </span>
      <span className="hb-poster-title">{movie.title}</span>
      {meta && <span className="hb-poster-meta">{meta}</span>}
    </button>
  )
}

/** Sterne 1–5; mit onRate zum Antippen, sonst nur Anzeige */
export function Stars({ value, onRate, size = 'md', label }: { value: number; onRate?: (n: number) => void; size?: 'small' | 'md' | 'wall'; label?: string }) {
  const px = size === 'small' ? 14 : size === 'wall' ? 36 : 28
  return (
    <span
      className={`hb-stars ${size === 'small' ? 'is-small' : size === 'wall' ? 'is-wall' : ''}`}
      role={onRate ? 'group' : 'img'}
      aria-label={label ?? `${value} von 5 Sternen`}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onRate ? (
          <button
            key={n}
            type="button"
            className={`hb-star ${n <= value ? 'is-on' : ''}`}
            aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
            onClick={() => onRate(n)}
          >
            <Icon icon={Star} size={px} />
          </button>
        ) : (
          <span key={n} className={`hb-star ${n <= value ? 'is-on' : ''}`}>
            <Icon icon={Star} size={px} />
          </span>
        ),
      )}
    </span>
  )
}
