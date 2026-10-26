import { CircleHelp, Dices, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyFigure } from '../../components/EmptyFigure'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { useMembers } from '../../lib/members'
import { AddSheet } from './AddSheet'
import { MovieSheet } from './MovieSheet'
import { euro, ourRent, ourServices, PART_KEY, useFilmConfig, useMovieStore, type Movie } from './movieStore'
import { Suggestions } from './Suggestions'
import { PosterCard } from './Poster'
import { Roulette } from './Roulette'
import { YearList } from './YearList'

type Part = 'liste' | 'vorschlaege' | 'gesehen'
type Filter = 'ours' | 'both' | 'short' | 'movie' | 'tv'

const savedPart = (): Part => {
  try {
    const v = localStorage.getItem(PART_KEY)
    return v === 'gesehen' || v === 'vorschlaege' ? v : 'liste'
  } catch {
    return 'liste'
  }
}

/** Filme: Merkliste als Poster-Raster mit Filtern, „Was schauen wir?“, Gesehen mit Jahresliste. Handy (Seite) und Wand (Ansicht) */
export function FilmsPage({
  variant,
  onBack,
  showToast,
  openId,
}: {
  variant: 'phone' | 'wall'
  onBack?: () => void
  showToast: (m: string) => void
  openId?: string | null
}) {
  const wall = variant === 'wall'
  const { movies, votes, loaded } = useMovieStore()
  const { people } = useMembers()
  const { services, rent_services } = useFilmConfig()
  // Streifen auf dem Poster: euer Abo-Dienst, sonst der günstigste Leihpreis bei den gewählten Anbietern
  const badgeOf = (m: Movie) => {
    const flat = ourServices(m, services)[0]
    if (flat) return flat
    const rent = ourRent(m, rent_services)[0]
    return rent ? `leihen ${euro(rent.price)}` : null
  }
  const [part, setPartState] = useState<Part>(savedPart)
  const [filters, setFilters] = useState<Set<Filter>>(new Set())
  const [genre, setGenre] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(openId ?? null)
  const [adding, setAdding] = useState(false)
  const [rolling, setRolling] = useState(false)

  const setPart = (p: Part) => {
    setPartState(p)
    try {
      localStorage.setItem(PART_KEY, p)
    } catch {
      // nur Komfort
    }
  }
  const toggle = (f: Filter) =>
    setFilters((s) => {
      const n = new Set(s)
      if (n.has(f)) n.delete(f)
      else {
        n.add(f)
        // Film und Serie schließen sich aus
        if (f === 'movie') n.delete('tv')
        if (f === 'tv') n.delete('movie')
      }
      return n
    })

  const list = movies.filter((m) => m.status === 'merkliste')
  const check = movies.filter((m) => m.status === 'pruefen')
  const genres = useMemo(() => {
    const count = new Map<string, number>()
    list.forEach((m) => m.genres.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1)))
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g)
      .slice(0, 10)
  }, [list])

  const bothWant = (m: Movie) => people.every((p) => ['unbedingt', 'gerne'].includes(votes.find((v) => v.movie_id === m.id && v.member === p.id)?.want ?? ''))
  const shown = list.filter(
    (m) =>
      (!filters.has('ours') || ourServices(m, services).length > 0) &&
      (!filters.has('both') || bothWant(m)) &&
      (!filters.has('short') || (m.runtime !== null && m.runtime <= 100 && m.kind === 'movie')) &&
      (!filters.has('movie') || m.kind === 'movie') &&
      (!filters.has('tv') || m.kind === 'tv') &&
      (!genre || m.genres.includes(genre)),
  )

  return (
    <div className={`flex flex-col gap-4 ${wall ? 'min-h-0 flex-1' : ''}`}>
      {onBack ? <PageHeader title="Filme" onBack={onBack} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="hb-seg" role="group" aria-label="Ansicht">
          <button type="button" className={part === 'liste' ? 'is-on' : ''} aria-pressed={part === 'liste'} onClick={() => setPart('liste')}>
            Merkliste{list.length ? ` · ${list.length}` : ''}
          </button>
          <button
            type="button"
            className={part === 'vorschlaege' ? 'is-on' : ''}
            aria-pressed={part === 'vorschlaege'}
            onClick={() => setPart('vorschlaege')}
          >
            Vorschläge
          </button>
          <button type="button" className={part === 'gesehen' ? 'is-on' : ''} aria-pressed={part === 'gesehen'} onClick={() => setPart('gesehen')}>
            Gesehen
          </button>
        </div>
        <span className="flex-1" />
        <Button icon={<Icon icon={Plus} size={18} />} onClick={() => setAdding(true)}>
          Merken
        </Button>
        <Button variant="primary" icon={<Icon icon={Dices} size={18} />} onClick={() => setRolling(true)} disabled={!list.length}>
          Was schauen wir?
        </Button>
      </div>

      {part === 'gesehen' ? (
        <YearList onOpen={setOpen} wall={wall} />
      ) : part === 'vorschlaege' ? (
        <Suggestions wall={wall} showToast={showToast} onOpenMovie={setOpen} />
      ) : (
        <>
          {check.length > 0 && (
            <div className="flex flex-col gap-2">
              {check.map((m) => (
                <button key={m.id} type="button" className="hb-cand flex items-center gap-3" onClick={() => setOpen(m.id)}>
                  <Icon icon={CircleHelp} size={22} className="text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">„{m.title}“: welcher Film?</span>
                    <span className="text-label text-ink-muted">Antippen und den richtigen wählen</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="hb-chip-row">
            <Chip on={filters.has('ours')} onClick={() => toggle('ours')}>
              Läuft bei uns
            </Chip>
            <Chip on={filters.has('both')} onClick={() => toggle('both')}>
              Wollen wir beide
            </Chip>
            <Chip on={filters.has('short')} onClick={() => toggle('short')}>
              Bis 100 Min
            </Chip>
            <Chip on={filters.has('movie')} onClick={() => toggle('movie')}>
              Filme
            </Chip>
            <Chip on={filters.has('tv')} onClick={() => toggle('tv')}>
              Serien
            </Chip>
            {genres.map((g) => (
              <Chip key={g} on={genre === g} onClick={() => setGenre(genre === g ? null : g)}>
                {g}
              </Chip>
            ))}
          </div>
          <div className={wall ? 'min-h-0 flex-1 overflow-y-auto hb-scroll-quiet' : ''}>
            {!loaded ? null : shown.length ? (
              <div className={`hb-film-grid ${wall ? 'is-wall' : ''}`}>
                {shown.map((m) => (
                  <PosterCard key={m.id} movie={m} votes={votes} badge={badgeOf(m)} onOpen={() => setOpen(m.id)} />
                ))}
              </div>
            ) : (
              <EmptyFigure wall={wall}>
                <p className="text-body text-ink-muted">
                  {list.length ? 'Nichts passt zu den Filtern.' : 'Noch nichts gemerkt. Teilt einen Link oder sucht einen Titel.'}
                </p>
              </EmptyFigure>
            )}
          </div>
        </>
      )}

      {open && <MovieSheet movieId={open} onClose={() => setOpen(null)} showToast={showToast} />}
      {adding && <AddSheet onClose={() => setAdding(false)} showToast={showToast} onAdded={setOpen} />}
      {rolling && <Roulette onClose={() => setRolling(false)} showToast={showToast} />}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`hb-choice ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}
