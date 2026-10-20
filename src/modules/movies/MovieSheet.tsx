import { Archive, Check, ExternalLink, Popcorn, RefreshCw, RotateCcw, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useDevice } from '../../lib/device'
import { useMembers } from '../../lib/members'
import { dayLabel } from '../../lib/time'
import {
  deleteMovie,
  isOurProvider,
  logoUrl,
  ourServices,
  refreshMovie,
  resolveMovie,
  runtimeLabel,
  setStatus,
  setVote,
  startNight,
  useFilmConfig,
  useMovieStore,
  WANTS,
  type Candidate,
  type Movie,
} from './movieStore'
import { PosterImage, Stars } from './Poster'

/** Film ansehen: Infos, Streaming, Stimmen, „Den schauen wir“, gesehen/verwerfen */
export function MovieSheet({ movieId, onClose, showToast }: { movieId: string; onClose: () => void; showToast: (m: string) => void }) {
  const { movies, votes, watched } = useMovieStore()
  const movie = movies.find((m) => m.id === movieId)
  const { device } = useDevice()
  const wall = device === 'wall'
  if (!movie) return null
  if (movie.status === 'pruefen') return <ResolveSheet movie={movie} onClose={onClose} showToast={showToast} />
  const nights = watched.filter((w) => w.movie_id === movie.id)
  return (
    <Sheet title={movie.kind === 'tv' ? 'Serie' : 'Film'} onClose={onClose} wide={wall}>
      <div className={wall ? 'grid grid-cols-[1fr_1fr] gap-6' : 'flex flex-col gap-4'}>
        <div className="flex flex-col gap-4">
          <MovieInfo movie={movie} wall={wall} />
        </div>
        <div className="flex flex-col gap-4">
          <Streaming movie={movie} />
          <Votes movie={movie} votes={votes} wall={wall} />
          {nights.length > 0 && <Nights nights={nights} />}
          <Actions movie={movie} onClose={onClose} showToast={showToast} />
        </div>
      </div>
    </Sheet>
  )
}

function MovieInfo({ movie, wall }: { movie: Movie; wall: boolean }) {
  const [more, setMore] = useState(false)
  const meta = [movie.year, movie.kind === 'tv' ? 'Serie' : null, runtimeLabel(movie)].filter(Boolean).join(' · ')
  return (
    <>
      <div className={`hb-film-head ${wall ? 'is-wall' : ''}`}>
        <PosterImage path={movie.poster_path} title={movie.title} size={wall ? 'w500' : 'w342'} />
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="hb-film-title">{movie.title}</h3>
          {meta && <span className="text-label text-ink-muted">{meta}</span>}
          {movie.original_title && movie.original_title !== movie.title && <span className="text-label text-ink-muted">{movie.original_title}</span>}
          {movie.genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {movie.genres.slice(0, 4).map((g) => (
                <span key={g} className="hb-tag">
                  {g}
                </span>
              ))}
            </div>
          )}
          {movie.rating_tmdb !== null && (
            <span className="inline-flex items-center gap-1 text-label text-ink-muted">
              <Icon icon={Star} size={14} />
              {movie.rating_tmdb.toLocaleString('de-DE')} bei TMDB
            </span>
          )}
        </div>
      </div>
      {movie.overview && (
        // lange Beschreibung am Handy gekürzt, Antippen zeigt alles
        <p className={`hb-film-overview ${wall || more ? '' : 'line-clamp-5'}`} onClick={() => setMore(true)}>
          {movie.overview}
        </p>
      )}
    </>
  )
}

function Streaming({ movie }: { movie: Movie }) {
  const { services } = useFilmConfig()
  const ours = { has: (name: string) => isOurProvider(name, services) }
  // Varianten („… with Ads“, „… Amazon Channel“) nur zeigen, wenn es sonst nichts gibt
  const all = movie.providers.flatrate ?? []
  const plain = all.filter((p) => !/with ads|amazon channel|apple tv channel/i.test(p.name))
  const flat = plain.length ? plain : all
  const rentOrBuy = [...(movie.providers.rent ?? []), ...(movie.providers.buy ?? [])]
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-label font-semibold text-ink">Streaming</h4>
      {flat.length ? (
        <div className="hb-provider-list">
          {[...flat]
            .sort((a, b) => Number(ours.has(b.name)) - Number(ours.has(a.name)))
            .map((p) => (
              <span key={p.id} className={`hb-provider ${ours.has(p.name) ? 'is-ours' : ''}`}>
                {logoUrl(p.logo) && <img src={logoUrl(p.logo)!} alt="" />}
                {p.name}
                {ours.has(p.name) && <Icon icon={Check} size={14} label="habt ihr" />}
              </span>
            ))}
        </div>
      ) : (
        <p className="text-label text-ink-muted">Gerade in keinem Abo.</p>
      )}
      {rentOrBuy.length > 0 && (
        <p className="text-label text-ink-muted">
          Leihen oder kaufen geht auch, z. B. bei {[...new Set(rentOrBuy.map((p) => p.name))].slice(0, 3).join(', ')}.
        </p>
      )}
      <p className="hb-source-note">
        Daten von JustWatch
        {movie.providers.link && (
          <>
            {' · '}
            <a href={movie.providers.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              Bei TMDB ansehen
              <Icon icon={ExternalLink} size={12} />
            </a>
          </>
        )}
      </p>
    </section>
  )
}

/** Abstimmen: am Handy die eigene Stimme (die andere Person sieht man), an der Wand beide */
function Votes({ movie, votes, wall }: { movie: Movie; votes: { movie_id: string; member: string; want: string }[]; wall: boolean }) {
  const { people, me, personKey } = useMembers()
  const rows = wall || me.is_board ? people : [people.find((p) => p.id === me.id)!, ...people.filter((p) => p.id !== me.id)].filter(Boolean)
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-label font-semibold text-ink">Wie gern?</h4>
      {rows.map((p) => {
        const current = votes.find((v) => v.movie_id === movie.id && v.member === p.id)?.want
        const editable = wall || me.is_board || p.id === me.id
        return (
          <div key={p.id} className={`hb-vote-row hb-film-person hb-person-${personKey(p.id)}`}>
            <span className="hb-vote-row-name">
              <span className="hb-vote-dot" aria-hidden="true" style={{ width: 12, height: 12, boxShadow: 'none' }} />
              {p.name}
              {!editable && (
                <span className="font-normal text-ink-muted">· {current ? WANTS.find((w) => w.value === current)?.label : 'noch keine Stimme'}</span>
              )}
            </span>
            {editable && (
              <div className="flex flex-wrap gap-2">
                {WANTS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    className={`hb-choice ${current === w.value ? 'is-on' : ''}`}
                    aria-pressed={current === w.value}
                    onClick={() => setVote(movie.id, p.id, current === w.value ? null : w.value)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function Nights({ nights }: { nights: { id: string; watched_on: string; ratings: Record<string, number> }[] }) {
  const { people, personKey } = useMembers()
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-label font-semibold text-ink">Gesehen</h4>
      {nights.map((n) => (
        <div key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label">
          <span className="text-ink-muted">{dayLabel(n.watched_on)}</span>
          {people.map((p) => (
            <span key={p.id} className={`inline-flex items-center gap-1 hb-film-person hb-person-${personKey(p.id)}`}>
              {p.name.charAt(0)}
              {n.ratings[p.id] ? (
                <Stars value={n.ratings[p.id]} size="small" />
              ) : (
                <span className="text-ink-muted">{n.ratings[p.id] === 0 ? 'nicht dabei' : '–'}</span>
              )}
            </span>
          ))}
        </div>
      ))}
    </section>
  )
}

function Actions({ movie, onClose, showToast }: { movie: Movie; onClose: () => void; showToast: (m: string) => void }) {
  const { me } = useMembers()
  const { services } = useFilmConfig()
  const [busy, setBusy] = useState(false)
  const service = ourServices(movie, services)[0] ?? null

  async function watchNow() {
    setBusy(true)
    const ok = await startNight(movie, service, me.id)
    setBusy(false)
    if (!ok) return showToast('Hat nicht geklappt.')
    showToast(`Viel Spaß mit ${movie.title}`)
    onClose()
  }

  return (
    <section className="flex flex-col gap-2 pt-1">
      {movie.status !== 'verworfen' && (
        <Button variant="primary" size="lg" icon={<Icon icon={Popcorn} size={20} />} onClick={watchNow} disabled={busy}>
          Den schauen wir
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {movie.status === 'merkliste' && movie.kind === 'movie' && (
          <Button
            icon={<Icon icon={Check} size={18} />}
            onClick={async () => {
              await setStatus(movie.id, 'gesehen')
              showToast('Als gesehen markiert')
              onClose()
            }}
          >
            Schon gesehen
          </Button>
        )}
        {movie.status === 'merkliste' ? (
          <Button
            variant="ghost"
            icon={<Icon icon={Archive} size={18} />}
            onClick={async () => {
              await setStatus(movie.id, 'verworfen')
              showToast(`${movie.title} von der Liste genommen`)
              onClose()
            }}
          >
            Von der Liste nehmen
          </Button>
        ) : (
          <Button
            variant="ghost"
            icon={<Icon icon={RotateCcw} size={18} />}
            onClick={async () => {
              await setStatus(movie.id, 'merkliste')
              showToast('Wieder auf der Merkliste')
            }}
          >
            Zurück auf die Merkliste
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<Icon icon={RefreshCw} size={18} />}
          onClick={async () => showToast((await refreshMovie(movie.id)) ? 'Streaming neu geladen' : 'Laden hat nicht geklappt.')}
        >
          Neu laden
        </Button>
        <Button
          variant="ghost"
          icon={<Icon icon={Trash2} size={18} />}
          onClick={async () => {
            if (!confirm(`${movie.title} ganz löschen, auch mit Stimmen und Bewertungen?`)) return
            await deleteMovie(movie.id)
            onClose()
          }}
        >
          Löschen
        </Button>
      </div>
    </section>
  )
}

/** Geteilter Link war nicht eindeutig: einen der Vorschläge antippen */
function ResolveSheet({ movie, onClose, showToast }: { movie: Movie; onClose: () => void; showToast: (m: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  async function pick(c: Candidate) {
    setBusy(c.tmdb_id)
    const r = await resolveMovie(movie.id, c)
    setBusy(null)
    showToast(r.message ?? (r.ok ? 'Gemerkt' : 'Hat nicht geklappt.'))
    if (r.ok) onClose()
  }
  return (
    <Sheet title="Welcher ist es?" onClose={onClose}>
      <p className="text-body text-ink-muted">Geteilt: „{movie.title}“. Tipp auf den richtigen.</p>
      <CandidateList list={movie.candidates ?? []} busy={busy} onPick={pick} />
      <Button
        variant="ghost"
        icon={<Icon icon={Trash2} size={18} />}
        onClick={async () => {
          await deleteMovie(movie.id)
          onClose()
        }}
      >
        Keiner davon, löschen
      </Button>
    </Sheet>
  )
}

export function CandidateList({
  list,
  busy,
  onPick,
  known,
}: {
  list: Candidate[]
  busy: number | null
  onPick: (c: Candidate) => void
  known?: (c: Candidate) => string | null
}) {
  return (
    <ul className="flex flex-col gap-2">
      {list.map((c) => {
        const note = known?.(c)
        return (
          <li key={`${c.kind}-${c.tmdb_id}`}>
            <button type="button" className="hb-recipe-card-main hb-cand" disabled={busy !== null} onClick={() => onPick(c)}>
              <PosterImage path={c.poster_path} title={c.title} size="w92" className="!w-[56px] flex-none" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-semibold text-ink">{c.title}</span>
                <span className="text-label text-ink-muted">{[c.year, c.kind === 'tv' ? 'Serie' : 'Film', note].filter(Boolean).join(' · ')}</span>
                {c.overview && <span className="line-clamp-2 text-label text-ink-muted">{c.overview}</span>}
              </span>
              {busy === c.tmdb_id && <Icon icon={RefreshCw} size={18} className="animate-spin text-ink-muted" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
