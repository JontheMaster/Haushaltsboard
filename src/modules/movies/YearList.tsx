import { Heart, Scale } from 'lucide-react'
import { useState } from 'react'
import { EmptyFigure } from '../../components/EmptyFigure'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { dayLabel } from '../../lib/time'
import { avgStars, useMovieStore, type Movie, type Watched } from './movieStore'
import { PosterCard, PosterImage, Stars } from './Poster'

/** Gesehen: Jahresliste mit beiden Bewertungen, Lieblingsfilm und „Wo wart ihr euch am uneinigsten?“ */
export function YearList({ onOpen, wall }: { onOpen: (id: string) => void; wall: boolean }) {
  const { movies, votes, watched } = useMovieStore()
  const { people, personKey } = useMembers()
  const years = [...new Set(watched.map((w) => w.watched_on.slice(0, 4)))].sort().reverse()
  const [chosen, setYear] = useState<string | null>(null)
  const year = chosen && years.includes(chosen) ? chosen : (years[0] ?? null)
  const byId = new Map(movies.map((m) => [m.id, m]))
  const rows = watched.filter((w) => w.watched_on.startsWith(year ?? '-') && byId.has(w.movie_id))
  // ohne Filmabend als gesehen markiert
  const marked = movies.filter((m) => m.status === 'gesehen' && !watched.some((w) => w.movie_id === m.id))

  const [a, b] = people
  const both = rows.filter((w) => a && b && (w.ratings[a.id] ?? 0) > 0 && (w.ratings[b.id] ?? 0) > 0)
  const apart = [...both].sort((x, y) => Math.abs(y.ratings[a.id] - y.ratings[b.id]) - Math.abs(x.ratings[a.id] - x.ratings[b.id]))[0]
  const apartDiff = apart ? Math.abs(apart.ratings[a.id] - apart.ratings[b.id]) : 0
  const fav = [...rows].filter((w) => avgStars(w) !== null).sort((x, y) => avgStars(y)! - avgStars(x)!)[0]
  const avgOf = (id: string) => {
    const s = rows.map((w) => w.ratings[id] ?? 0).filter((n) => n > 0)
    return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null
  }

  if (!years.length && !marked.length)
    return (
      <EmptyFigure wall={wall}>
        <p className="text-body text-ink-muted">Noch keinen Filmabend. „Was schauen wir?“ hilft beim Aussuchen.</p>
      </EmptyFigure>
    )

  return (
    <div className={`flex flex-col gap-4 ${wall ? 'min-h-0 flex-1 overflow-y-auto hb-scroll-quiet' : ''}`}>
      {years.length > 1 && (
        <div className="hb-chip-row">
          {years.map((y) => (
            <button key={y} type="button" className={`hb-choice ${y === year ? 'is-on' : ''}`} aria-pressed={y === year} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <section className="hb-tile hb-tile-static gap-3">
          <h3 className="font-display text-title text-ink">
            {year}: {rows.length} {rows.length === 1 ? 'Filmabend' : 'Filmabende'}
          </h3>
          <div className="flex flex-wrap gap-4 text-label">
            {people.map((p) => {
              const avg = avgOf(p.id)
              return (
                <span key={p.id} className={`inline-flex items-center gap-2 hb-film-person hb-person-${personKey(p.id)}`}>
                  <b>{p.name}</b>
                  {avg !== null ? `Ø ${avg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Sterne` : 'noch nichts bewertet'}
                </span>
              )
            })}
          </div>
          {fav && rows.length > 1 && (
            <Highlight
              icon={Heart}
              label="Liebling"
              w={fav}
              movie={byId.get(fav.movie_id)!}
              text={`Ø ${avgStars(fav)!.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Sterne`}
              onOpen={onOpen}
            />
          )}
          {apart && apartDiff >= 2 && rows.length > 1 && (
            <Highlight
              icon={Scale}
              label="Am uneinigsten"
              w={apart}
              movie={byId.get(apart.movie_id)!}
              text={`${a.name} ${apart.ratings[a.id]}, ${b.name} ${apart.ratings[b.id]} Sterne`}
              onOpen={onOpen}
            />
          )}
        </section>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rows.map((w) => {
            const m = byId.get(w.movie_id)!
            return (
              <li key={w.id}>
                <button type="button" className="hb-year-row w-full rounded-md text-left" onClick={() => onOpen(m.id)}>
                  <PosterImage path={m.poster_path} title={m.title} size="w92" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-ink">{m.title}</span>
                    <span className="text-label text-ink-muted">{dayLabel(w.watched_on)}</span>
                  </span>
                  <span className="hb-year-score">
                    {people.map((p) => (
                      <span key={p.id} className={`hb-film-person hb-person-${personKey(p.id)}`}>
                        {p.name.charAt(0)}
                        {(w.ratings[p.id] ?? 0) > 0 ? (
                          <Stars value={w.ratings[p.id]} size="small" />
                        ) : (
                          <em className="not-italic">{w.ratings[p.id] === 0 ? 'nicht dabei' : '–'}</em>
                        )}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {marked.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-label font-semibold text-ink-muted">Schon gesehen, ohne Filmabend</h4>
          <div className={`hb-film-grid ${wall ? 'is-wall' : ''}`}>
            {marked.map((m) => (
              <PosterCard key={m.id} movie={m} votes={votes} dim onOpen={() => onOpen(m.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Highlight({
  icon,
  label,
  w,
  movie,
  text,
  onOpen,
}: {
  icon: typeof Heart
  label: string
  w: Watched
  movie: Movie
  text: string
  onOpen: (id: string) => void
}) {
  return (
    <button type="button" className="hb-year-row w-full rounded-md text-left" onClick={() => onOpen(movie.id)} data-watched={w.id}>
      <PosterImage path={movie.poster_path} title={movie.title} size="w92" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="inline-flex items-center gap-1 text-label font-semibold text-accent">
          <Icon icon={icon} size={14} />
          {label}
        </span>
        <span className="truncate font-semibold text-ink">{movie.title}</span>
        <span className="text-label text-ink-muted">{text}</span>
      </span>
    </button>
  )
}
