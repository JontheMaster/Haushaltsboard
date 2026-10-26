import { Plus, Sparkles, Star, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyFigure } from '../../components/EmptyFigure'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { dismissSuggestion, keepSuggestion, markSuggestionsSeen, useSuggestions, type Suggestion } from './movieStore'
import { PosterImage } from './Poster'

/**
 * Filme → Vorschläge (26.10.2026): „Neu für euch“ (neu bei euren Diensten, bald im Kino) und „Passt zu euch“
 * (aus euren Sternen und Merkliste-Stimmen, mit Grund). Merken → Merkliste, Kein Interesse → kommt nicht wieder.
 */
export function Suggestions({ wall, showToast, onOpenMovie }: { wall: boolean; showToast: (m: string) => void; onOpenMovie: (id: string) => void }) {
  const { list, reload, busy } = useSuggestions(true)
  const { me } = useMembers()
  const [open, setOpen] = useState<Suggestion | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())

  // angesehen: der Hinweis „X neue Vorschläge“ in der Handy-Kachel verschwindet
  useEffect(() => {
    markSuggestionsSeen()
  }, [])

  const hide = (id: string) => setPending((s) => new Set(s).add(id))

  async function keep(s: Suggestion) {
    hide(s.id)
    setOpen(null)
    const r = await keepSuggestion(s)
    showToast(r.message ?? (r.ok ? `${s.title} gemerkt` : 'Merken hat nicht geklappt.'))
    // gleich die Filmkarte öffnen: dort stehen Trailer, Dienste und die eigene Stimme
    if (r.ok && r.id) onOpenMovie(r.id)
    reload()
  }

  async function dismiss(s: Suggestion) {
    hide(s.id)
    setOpen(null)
    if (!(await dismissSuggestion(s, me.id))) showToast('Das hat nicht geklappt.')
    reload()
  }

  const shown = (list ?? []).filter((s) => !pending.has(s.id))
  const neu = shown.filter((s) => s.section === 'neu')
  const passt = shown.filter((s) => s.section === 'passt')

  if (list === null || (busy && !shown.length))
    return <p className="text-body text-ink-muted">{busy ? 'Suche passende Filme und Serien …' : 'Einen Moment …'}</p>

  if (!shown.length)
    return (
      <EmptyFigure wall={wall}>
        <p className="text-body text-ink-muted">Gerade keine Vorschläge. Merkt und bewertet ein paar Filme, dann wird es persönlicher.</p>
      </EmptyFigure>
    )

  const grid = (items: Suggestion[]) => (
    <div className={`hb-film-grid ${wall ? 'is-wall' : ''}`}>
      {items.map((s) => (
        <SuggestionCard key={s.id} s={s} onOpen={() => setOpen(s)} onKeep={() => keep(s)} onDismiss={() => dismiss(s)} />
      ))}
    </div>
  )

  return (
    <div className={wall ? 'min-h-0 flex-1 overflow-y-auto hb-scroll-quiet' : ''}>
      <div className="flex flex-col gap-5">
        {neu.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="hb-sugg-head">Neu für euch</h3>
            {grid(neu)}
          </section>
        )}
        {passt.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="hb-sugg-head">Passt zu euch</h3>
            {grid(passt)}
          </section>
        )}
        <p className="flex items-center gap-2 text-label text-ink-muted">
          <Icon icon={Sparkles} size={16} />
          Aus euren Sternen und Stimmen, neu jeden Montag. Daten von TMDB.
        </p>
      </div>
      {open && <SuggestionSheet s={open} wall={wall} onClose={() => setOpen(null)} onKeep={() => keep(open)} onDismiss={() => dismiss(open)} />}
    </div>
  )
}

function SuggestionCard({ s, onOpen, onKeep, onDismiss }: { s: Suggestion; onOpen: () => void; onKeep: () => void; onDismiss: () => void }) {
  const meta = [s.year, s.kind === 'tv' ? 'Serie' : null].filter(Boolean).join(' · ')
  return (
    <div className="hb-sugg">
      <button type="button" className="hb-poster" onClick={onOpen} aria-label={`${s.title} ansehen`}>
        <PosterImage path={s.poster_path} title={s.title} />
        <span className="hb-poster-title">{s.title}</span>
        {meta && <span className="hb-poster-meta">{meta}</span>}
        {s.reason && <span className="hb-sugg-reason">{s.reason}</span>}
      </button>
      <div className="hb-sugg-actions">
        <button type="button" className="hb-sugg-btn is-keep" onClick={onKeep} aria-label={`${s.title} merken`}>
          <Icon icon={Plus} size={16} />
          Merken
        </button>
        <button type="button" className="hb-sugg-btn" onClick={onDismiss} aria-label={`${s.title}: kein Interesse`} title="Kein Interesse">
          <Icon icon={X} size={16} />
        </button>
      </div>
    </div>
  )
}

function SuggestionSheet({ s, wall, onClose, onKeep, onDismiss }: { s: Suggestion; wall: boolean; onClose: () => void; onKeep: () => void; onDismiss: () => void }) {
  const meta = [s.year, s.kind === 'tv' ? 'Serie' : 'Film'].filter(Boolean).join(' · ')
  return (
    <Sheet title="Vorschlag" onClose={onClose} wide={wall}>
      <div className="flex flex-col gap-4">
        <div className={`hb-film-head ${wall ? 'is-wall' : ''}`}>
          <PosterImage path={s.poster_path} title={s.title} size={wall ? 'w500' : 'w342'} />
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="hb-film-title">{s.title}</h3>
            <span className="text-label text-ink-muted">{meta}</span>
            {s.reason && <span className="hb-sugg-reason">{s.reason}</span>}
            {s.rating_tmdb !== null && (
              <span className="inline-flex items-center gap-1 text-label text-ink-muted">
                <Icon icon={Star} size={14} />
                {s.rating_tmdb.toLocaleString('de-DE')} bei TMDB
              </span>
            )}
          </div>
        </div>
        {s.overview && <p className="hb-film-overview">{s.overview}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Icon icon={Plus} size={18} />} onClick={onKeep}>
            Auf die Merkliste
          </Button>
          <Button variant="ghost" icon={<Icon icon={X} size={18} />} onClick={onDismiss}>
            Kein Interesse
          </Button>
        </div>
        <span className="text-label text-ink-muted">Gemerkt siehst du auch den Trailer und wo der Film läuft.</span>
      </div>
    </Sheet>
  )
}
