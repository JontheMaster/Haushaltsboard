import { Link, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { addFromSearch, searchMovies, shareText, useMovieStore, type Candidate } from './movieStore'
import { CandidateList } from './MovieSheet'

/** Film oder Serie merken: Titel suchen (TMDB) oder einen Link einfügen */
export function AddSheet({ onClose, showToast, onAdded }: { onClose: () => void; showToast: (m: string) => void; onAdded?: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const { movies } = useMovieStore()
  const isLink = /^https?:\/\//i.test(q.trim())

  // Suche beim Tippen (kurz warten, damit nicht jeder Buchstabe eine Anfrage ist)
  useEffect(() => {
    const text = q.trim()
    if (isLink || text.length < 2) {
      setResults(null)
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      const list = await searchMovies(text)
      if (alive) setResults(list)
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, isLink])

  async function pick(c: Candidate) {
    setBusy(c.tmdb_id)
    const r = await addFromSearch(c)
    setBusy(null)
    showToast(r.message ?? (r.ok ? 'Gemerkt' : 'Merken hat nicht geklappt.'))
    if (r.ok) {
      onClose()
      if (r.id) onAdded?.(r.id)
    }
  }

  async function addLink() {
    setLinkBusy(true)
    const r = await shareText(q.trim())
    setLinkBusy(false)
    showToast(r.message ?? (r.ok ? 'Gemerkt' : 'Hat nicht geklappt.'))
    if (r.ok) onClose()
  }

  const known = (c: Candidate) => {
    const m = movies.find((x) => x.tmdb_id === c.tmdb_id && x.kind === c.kind)
    return m ? (m.status === 'gesehen' ? 'schon gesehen' : m.status === 'verworfen' ? 'von der Liste genommen' : 'schon gemerkt') : null
  }

  return (
    <Sheet title="Film merken" onClose={onClose} tall>
      <label className="hb-search">
        <Icon icon={isLink ? Link : Search} size={20} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titel oder Link (IMDb, Letterboxd …)"
          enterKeyHint="search"
          onKeyDown={(e) => e.key === 'Enter' && isLink && addLink()}
        />
      </label>
      {isLink ? (
        <Button variant="primary" icon={<Icon icon={Link} size={18} />} onClick={addLink} disabled={linkBusy}>
          {linkBusy ? 'Suche den Film …' : 'Link merken'}
        </Button>
      ) : results === null ? (
        <p className="text-label text-ink-muted">
          Filme und Serien, Daten von TMDB. Am schnellsten geht es über Teilen (Anleitung in Alle Funktionen → Filme).
        </p>
      ) : results.length ? (
        <CandidateList list={results} busy={busy} onPick={pick} known={known} />
      ) : (
        <p className="text-body text-ink-muted">Nichts gefunden.</p>
      )}
    </Sheet>
  )
}
