import { ChevronRight, Clapperboard, Sparkles } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Tile } from '../../components/Tile'
import { useMembers } from '../../lib/members'
import type { TileProps } from '../types'
import { openFilms, PART_KEY, suggestionsSeenAt, useMovieStore, useSuggestions } from './movieStore'
import { PosterImage, Stars } from './Poster'

/** Handy-Startseite: zuletzt gesehen (beide Bewertungen) und die drei neuesten auf der Merkliste; antippen öffnet Filme */
export function FilmsTile({ delay }: TileProps) {
  const { movies, watched, loaded } = useMovieStore()
  const { people, personKey } = useMembers()
  const fresh = movies.filter((m) => m.status === 'merkliste').slice(0, 3)
  const last = watched.find((w) => Date.now() - Date.parse(w.started_at) < 30 * 86400000)
  const lastMovie = last ? movies.find((m) => m.id === last.movie_id) : null
  const count = movies.filter((m) => m.status === 'merkliste').length
  // neue Vorschläge seit dem letzten Blick auf „Vorschläge“ (pro Gerät)
  const { list: suggestions } = useSuggestions()
  const seen = suggestionsSeenAt()
  const freshSuggestions = (suggestions ?? []).filter((x) => x.created_at > seen).length
  const openSuggestions = () => {
    try {
      localStorage.setItem(PART_KEY, 'vorschlaege')
    } catch {
      // nur Komfort
    }
    openFilms()
  }

  return (
    <Tile
      title="Filme"
      icon={Clapperboard}
      delay={delay}
      action={
        <button type="button" className="hb-icon-btn" aria-label="Filme öffnen" onClick={() => openFilms()}>
          <Icon icon={ChevronRight} size={20} />
        </button>
      }
    >
      {!loaded ? null : (
        <div className="flex flex-col gap-3">
          {last && lastMovie && (
            <button type="button" className="hb-year-row w-full text-left" onClick={() => openFilms(lastMovie.id)}>
              <PosterImage path={lastMovie.poster_path} title={lastMovie.title} size="w92" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-label text-ink-muted">Zuletzt gesehen</span>
                <span className="truncate font-semibold text-ink">{lastMovie.title}</span>
              </span>
              <span className="hb-year-score">
                {people.map((p) => (
                  <span key={p.id} className={`hb-film-person hb-person-${personKey(p.id)}`}>
                    {p.name.charAt(0)}
                    {(last.ratings[p.id] ?? 0) > 0 ? <Stars value={last.ratings[p.id]} size="small" /> : '–'}
                  </span>
                ))}
              </span>
            </button>
          )}
          {freshSuggestions > 0 && (
            <button type="button" className="hb-sugg-hint" onClick={openSuggestions}>
              <Icon icon={Sparkles} size={16} />
              {freshSuggestions === 1 ? '1 neuer Vorschlag' : `${freshSuggestions} neue Vorschläge`}
              <Icon icon={ChevronRight} size={16} />
            </button>
          )}
          {fresh.length ? (
            <>
              <span className="text-label text-ink-muted">Neu auf der Liste · {count} gemerkt</span>
              <div className="hb-film-tile-posters">
                {fresh.map((m) => (
                  <button key={m.id} type="button" className="hb-poster" onClick={() => openFilms(m.id)} aria-label={`${m.title} öffnen`}>
                    <PosterImage path={m.poster_path} title={m.title} size="w185" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="text-left text-body text-ink-muted" onClick={() => openFilms()}>
              Noch nichts gemerkt. Teilt einen Link ans Board oder sucht einen Titel.
            </button>
          )}
        </div>
      )}
    </Tile>
  )
}
