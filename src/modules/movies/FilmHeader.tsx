import { ChevronRight, Popcorn, Star, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { berlinHHMM, useNow } from '../../lib/time'
import { cancelNight, currentNight, openFilms, rate, ratingsDue, useMovieStore, type Movie, type Watched } from './movieStore'
import { PosterImage, Stars } from './Poster'

/**
 * Karte oben (Wand-Kopfzeile, Handy-Start), zählt im Kopfzeilen-Platz wie Essen:
 * - Filmabend läuft: Poster, Titel, „fertig um 22:14“ (antippen = Doch nicht / Film öffnen)
 * - ab dem nächsten Morgen: „Wie war …?“ mit Sternen, bis beide bewertet haben (höchstens 3 Tage).
 *   Am Handy nur die eigene Bewertung, an der Wand alle, die noch fehlen.
 */
export function FilmHeader({ variant }: { variant: 'wall' | 'phone' }) {
  const { movies, watched } = useMovieStore()
  const { people, me } = useMembers()
  const now = useNow(30_000).getTime()
  const night = currentNight(watched, now)
  const byId = (id: string) => movies.find((m) => m.id === id)
  if (night && byId(night.movie_id)) return <NightCard w={night} movie={byId(night.movie_id)!} variant={variant} />
  const due = ratingsDue(
    watched,
    people.map((p) => p.id),
    now,
  ).filter((d) => byId(d.w.movie_id) && (variant === 'wall' || me.is_board || d.missing.includes(me.id)))[0]
  if (!due) return null
  return <RateCard w={due.w} movie={byId(due.w.movie_id)!} missing={variant === 'wall' || me.is_board ? due.missing : [me.id]} variant={variant} />
}

function NightCard({ w, movie, variant }: { w: Watched; movie: Movie; variant: 'wall' | 'phone' }) {
  const [open, setOpen] = useState(false)
  const done = Date.now() > Date.parse(w.ends_at)
  return (
    <>
      <button type="button" className="hb-meal-card hb-slot-item" data-kind="meal" onClick={() => setOpen(true)} aria-label={`Filmabend: ${movie.title}`}>
        <PosterImage path={movie.poster_path} title="" size="w92" className="hb-meal-card-img !w-[44px] !h-[64px] flex-none" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="hb-meal-card-when">
            <Icon icon={Popcorn} size={14} />
            {done ? 'Filmabend vorbei' : `Filmabend · fertig um ${berlinHHMM(w.ends_at)}`}
          </span>
          <span className="hb-meal-card-title">{movie.title}</span>
        </span>
        {w.service && variant === 'wall' && <span className="hb-meal-card-go">{w.service}</span>}
      </button>
      {open && (
        <Sheet title="Filmabend" onClose={() => setOpen(false)}>
          <p className="text-body text-ink">
            {movie.title}
            {w.service ? ` auf ${w.service}` : ''}, fertig um {berlinHHMM(w.ends_at)}.
          </p>
          <div className="flex flex-wrap gap-2">
            {variant === 'phone' && (
              <Button
                icon={<Icon icon={ChevronRight} size={18} />}
                onClick={() => {
                  setOpen(false)
                  openFilms(movie.id)
                }}
              >
                Film ansehen
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Icon icon={X} size={18} />}
              onClick={async () => {
                if (await cancelNight(w)) setOpen(false)
              }}
            >
              Doch nicht schauen
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function RateCard({ w, movie, missing, variant }: { w: Watched; movie: Movie; missing: string[]; variant: 'wall' | 'phone' }) {
  // beim Öffnen gemerkt: wer bewerten soll (die Zeile bleibt nach dem Tippen stehen, damit man die Sterne sieht)
  const [open, setOpen] = useState<string[] | null>(null)
  // Wand: schlanke Karte (passt neben Timer oder Musik), Antippen öffnet große Sterne für alle, die noch fehlen
  if (variant === 'wall')
    return (
      <>
        <button type="button" className="hb-meal-card hb-slot-item" data-kind="meal" onClick={() => setOpen(missing)}>
          <PosterImage path={movie.poster_path} title="" size="w92" className="hb-meal-card-img !w-[44px] !h-[64px] flex-none" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="hb-meal-card-when">
              <Icon icon={Star} size={14} />
              Wie war der Film?
            </span>
            <span className="hb-meal-card-title">{movie.title}</span>
          </span>
          <span className="hb-meal-card-go">Bewerten</span>
        </button>
        {open && (
          <Sheet title={`Wie war ${movie.title}?`} onClose={() => setOpen(null)}>
            <RateRows w={w} missing={open} big showNames />
          </Sheet>
        )}
      </>
    )
  return (
    <div className="hb-meal-card hb-slot-item" data-kind="meal">
      <PosterImage path={movie.poster_path} title="" size="w92" className="hb-meal-card-img !w-[44px] !h-[64px] flex-none" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="hb-meal-card-when">Wie war {movie.title}?</span>
        <RateRows w={w} missing={missing} showNames={missing.length > 1} />
      </span>
    </div>
  )
}

/** Sterne pro Person, die noch fehlt; „nicht dabei“ = 0 */
function RateRows({ w, missing, big, showNames }: { w: Watched; missing: string[]; big?: boolean; showNames?: boolean }) {
  const { byId, personKey } = useMembers()
  return (
    <span className={`flex flex-col ${big ? 'gap-4' : 'gap-1'}`}>
      {missing.map((id) => (
        <span key={id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 hb-film-person hb-person-${personKey(id)}`}>
          {showNames && <b className={big ? 'w-full text-body' : 'text-label'}>{byId.get(id)?.name}</b>}
          <Stars value={w.ratings[id] ?? 0} onRate={(n) => rate(w, id, n)} size={big ? 'wall' : 'md'} label={`Sterne von ${byId.get(id)?.name}`} />
          <button type="button" className="text-label text-ink-muted underline" onClick={() => rate(w, id, 0)}>
            nicht dabei
          </button>
        </span>
      ))}
    </span>
  )
}
