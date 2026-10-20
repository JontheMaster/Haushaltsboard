import { Dices, Popcorn, RotateCcw } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import { useDevice } from '../../lib/device'
import { useMembers } from '../../lib/members'
import {
  MOODS,
  moodFits,
  ourServices,
  pickWeighted,
  runtimeLabel,
  startNight,
  TIMES,
  timeFits,
  useFilmConfig,
  useMovieStore,
  weightOf,
  type Mood,
  type Movie,
  type TimeLimit,
} from './movieStore'
import { PosterImage } from './Poster'

const MAX_DRAWS = 3

/** „Was schauen wir?“: kurz fragen (Zeit, Laune, Dienste), dann zieht die Walze einen Film */
export function Roulette({ onClose, showToast }: { onClose: () => void; showToast: (m: string) => void }) {
  const { movies, votes } = useMovieStore()
  const { people, me } = useMembers()
  const { services } = useFilmConfig()
  const { device } = useDevice()
  const [time, setTime] = useState<TimeLimit>(0)
  const [mood, setMood] = useState<Mood>('egal')
  const [oursOnly, setOursOnly] = useState(true)
  const [draws, setDraws] = useState<Movie[]>([])
  const [spinning, setSpinning] = useState(false)
  const [chosen, setChosen] = useState<Movie | null>(null)
  const [busy, setBusy] = useState(false)

  const ids = people.map((p) => p.id)
  const pool = useMemo(
    () =>
      movies.filter(
        (m) =>
          m.status === 'merkliste' &&
          timeFits(m, time) &&
          moodFits(m, mood) &&
          (!oursOnly || ourServices(m, services).length > 0) &&
          weightOf(m, votes, ids) > 0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movies, votes, time, mood, oursOnly, services],
  )

  function draw() {
    const pick = pickWeighted(
      pool,
      (m) => weightOf(m, votes, ids),
      draws.map((d) => d.id),
    )
    if (!pick) return showToast(draws.length ? 'Mehr passende Filme gibt es nicht.' : 'Nichts passt. Lockere die Auswahl.')
    setChosen(null)
    setSpinning(true)
    setDraws((d) => [...d, pick])
  }

  async function watch(m: Movie) {
    setBusy(true)
    const ok = await startNight(m, ourServices(m, services)[0] ?? null, me.id)
    setBusy(false)
    if (!ok) return showToast('Hat nicht geklappt.')
    showToast(`Viel Spaß mit ${m.title}`)
    onClose()
  }

  const current = draws[draws.length - 1] ?? null
  const showThree = draws.length >= MAX_DRAWS && !spinning && !chosen

  return (
    <Sheet title="Was schauen wir?" onClose={onClose} wide={device === 'wall'}>
      {!draws.length ? (
        <div className="flex flex-col gap-4">
          <Options label="Wie lang?" options={TIMES} value={time} onChange={setTime} />
          <Options label="Wonach ist euch?" options={MOODS} value={mood} onChange={setMood} />
          <Toggle label="Nur, was bei uns im Abo läuft" checked={oursOnly} onChange={setOursOnly} />
          <p className="text-label text-ink-muted">
            {pool.length === 1 ? 'Ein Film passt.' : `${pool.length} passen.`} Was ihr beide unbedingt sehen wollt, kommt öfter dran, „lieber nicht“ gar nicht.
          </p>
          <Button variant="primary" size="lg" icon={<Icon icon={Dices} size={20} />} onClick={draw} disabled={!pool.length}>
            Würfeln
          </Button>
        </div>
      ) : spinning && current ? (
        <Reel pool={pool} pick={current} onDone={() => setSpinning(false)} />
      ) : showThree ? (
        <div className="flex flex-col gap-4">
          <p className="text-body text-ink">Drei Mal gewürfelt. Welcher wird es?</p>
          <div className="hb-pick-three">
            {draws.map((m) => (
              <button key={m.id} type="button" className="hb-poster" onClick={() => setChosen(m)}>
                <PosterImage path={m.poster_path} title={m.title} />
                <span className="hb-poster-title">{m.title}</span>
                <span className="hb-poster-meta">{[runtimeLabel(m), ourServices(m, services)[0]].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        current && (
          <Result
            movie={chosen ?? current}
            service={ourServices(chosen ?? current, services)[0] ?? null}
            busy={busy}
            onWatch={() => watch(chosen ?? current)}
            again={!chosen && draws.length < MAX_DRAWS ? draw : null}
            back={chosen ? () => setChosen(null) : null}
          />
        )
      )}
    </Sheet>
  )
}

function Options<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`hb-choice ${value === o.value ? 'is-on' : ''}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Poster laufen wie eine Walze durch und rasten beim gezogenen Film ein (ease-spring); bei reduzierter Bewegung nur Einblenden */
function Reel({ pool, pick, onDone }: { pool: Movie[]; pick: Movie; onDone: () => void }) {
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const strip = useMemo(() => {
    const others = pool.filter((m) => m.id !== pick.id)
    const items: Movie[] = []
    for (let i = 0; i < 16; i++) items.push(others.length ? others[Math.floor(Math.random() * others.length)] : pick)
    return [...items, pick]
  }, [pool, pick])
  const ref = useRef<HTMLDivElement>(null)
  const [go, setGo] = useState(false)

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(onDone, 300)
      return () => clearTimeout(t)
    }
  }, [reduced, onDone])

  // Start in der Mitte des ersten Posters, im nächsten Bild zum letzten fahren
  useLayoutEffect(() => {
    if (reduced) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    return () => cancelAnimationFrame(id)
  }, [reduced])

  if (reduced) return null
  const step = 188 + 12
  const x = go ? -((strip.length - 1) * step + 94) : -94
  return (
    <div className="hb-reel" aria-label="Würfelt …">
      <div
        ref={ref}
        className={`hb-reel-strip ${go ? 'is-spinning' : ''}`}
        style={{ transform: `translateX(${x}px)` }}
        onTransitionEnd={(e) => e.target === ref.current && onDone()}
      >
        {strip.map((m, i) => (
          <PosterImage key={i} path={m.poster_path} title={m.title} size="w185" />
        ))}
      </div>
    </div>
  )
}

function Result({
  movie,
  service,
  busy,
  onWatch,
  again,
  back,
}: {
  movie: Movie
  service: string | null
  busy: boolean
  onWatch: () => void
  again: (() => void) | null
  back: (() => void) | null
}) {
  const ends = movie.runtime ? new Date(Date.now() + movie.runtime * 60_000) : null
  const endText = ends ? `fertig um ${ends.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}` : null
  return (
    <div className="hb-reel-pick flex flex-col gap-4">
      <div className="hb-film-head">
        <PosterImage path={movie.poster_path} title={movie.title} />
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="hb-film-title">{movie.title}</h3>
          <span className="text-label text-ink-muted">{[movie.year, runtimeLabel(movie)].filter(Boolean).join(' · ')}</span>
          {service && <span className="hb-provider is-ours w-fit pl-3">{service}</span>}
          {endText && <span className="text-label font-semibold text-ink">{movie.kind === 'tv' ? `eine Folge, ${endText}` : endText}</span>}
        </div>
      </div>
      {movie.overview && <p className="hb-film-overview line-clamp-5">{movie.overview}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" icon={<Icon icon={Popcorn} size={20} />} onClick={onWatch} disabled={busy}>
          Den schauen wir
        </Button>
        {again && (
          <Button size="lg" icon={<Icon icon={RotateCcw} size={20} />} onClick={again}>
            Nochmal
          </Button>
        )}
        {back && (
          <Button size="lg" variant="ghost" onClick={back}>
            Zurück zu den dreien
          </Button>
        )}
      </div>
    </div>
  )
}
