import { Meh, Play, ThumbsUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyFigure } from '../../components/EmptyFigure'
import { Icon } from '../../components/Icon'
import { useDevice } from '../../lib/device'
import { dayLabel, setShort } from './cardInfo'
import { characterOf } from './character'
import { deleteGame, noteGame, rateGame, type DominionGame } from './dominionStore'
import { CARD_BY_ID, cardName, kingdomFromSaved } from './generator'
import { useCardImages } from './images'

/** Bewerten als zwei große Knöpfe: Gut (grün) / Naja; nochmal tippen nimmt es zurück */
export function RateButtons({ game, onRated }: { game: DominionGame; onRated?: (r: 'gut' | 'naja' | null) => void }) {
  const set = async (r: 'gut' | 'naja') => {
    const next = game.rating === r ? null : r
    await rateGame(game.id, next)
    onRated?.(next)
  }
  return (
    <div className="hb-dom-rate" role="group" aria-label="Wie war das Set?">
      <button type="button" className={`hb-dom-rate-btn is-good ${game.rating === 'gut' ? 'is-on' : ''}`} aria-pressed={game.rating === 'gut'} onClick={() => set('gut')}>
        <Icon icon={ThumbsUp} size={18} />
        Gut
      </button>
      <button type="button" className={`hb-dom-rate-btn ${game.rating === 'naja' ? 'is-on' : ''}`} aria-pressed={game.rating === 'naja'} onClick={() => set('naja')}>
        <Icon icon={Meh} size={18} />
        Naja
      </button>
    </div>
  )
}

/** Verlauf (Stufe 2): gespielte Sets mit Datum, Charakter, Bildern, Bewertung und Notiz; „Nochmal spielen“ */
export function History({ games, onReplay }: { games: DominionGame[]; onReplay: (g: DominionGame) => void }) {
  const played = games.filter((g) => g.played)
  if (!played.length)
    return (
      <EmptyFigure wall={false}>
        <p className="text-body text-ink-muted">Noch nichts gespielt. Erstellt ein Set und tippt danach auf „Das spielen wir“.</p>
      </EmptyFigure>
    )
  return (
    <ul className="flex flex-col gap-3">
      {played.map((g) => (
        <HistoryItem key={g.id} game={g} onReplay={() => onReplay(g)} />
      ))}
    </ul>
  )
}

function HistoryItem({ game, onReplay }: { game: DominionGame; onReplay: () => void }) {
  const { showToast } = useDevice()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(game.note ?? '')
  const k = kingdomFromSaved(game)
  const ch = characterOf(k)
  const arts = useCardImages(game.kingdom.slice(0, 5), 'art')
  const sets = [...new Set(game.kingdom.map((id) => CARD_BY_ID.get(id)?.set).filter(Boolean) as string[])]
  return (
    <li className="hb-dom-hist">
      <button type="button" className="flex w-full flex-col gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="hb-dom-hist-strip" aria-hidden="true">
          {game.kingdom.slice(0, 5).map((id) => (
            <span key={id}>{arts[id] && <img src={arts[id]!} alt="" loading="lazy" />}</span>
          ))}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="flex-1 font-display text-[18px] font-semibold text-ink">{ch.title}</span>
          <span className="text-label text-ink-muted">{dayLabel(game.played_on ?? game.created_at.slice(0, 10))}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          {sets.map((s) => (
            <span key={s} className="hb-dom-set">
              {setShort(s)}
            </span>
          ))}
          {game.rating && <span className={`hb-badge ${game.rating === 'gut' ? 'hb-badge-success' : ''}`}>{game.rating === 'gut' ? 'Gut' : 'Naja'}</span>}
        </span>
        {game.note && !open && <span className="text-label text-ink-muted">„{game.note}“</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{game.kingdom.map(cardName).join(', ')}</p>
          {game.landscapes.length > 0 && <p className="text-label text-ink-muted">Dazu: {game.landscapes.map(cardName).join(', ')}</p>}
          <RateButtons game={game} />
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-muted">Notiz</span>
            <input
              className="hb-input"
              value={note}
              placeholder="z. B. Leviona hat mit Gärten gewonnen"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (game.note ?? '') && noteGame(game.id, note)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Icon icon={Play} size={18} />} onClick={onReplay}>
              Nochmal spielen
            </Button>
            <Button
              variant="ghost"
              icon={<Icon icon={Trash2} size={18} />}
              onClick={async () => {
                if (!window.confirm('Dieses Set aus dem Verlauf löschen?')) return
                showToast?.((await deleteGame(game.id)) ? 'Aus dem Verlauf gelöscht.' : 'Löschen hat nicht geklappt.')
              }}
            >
              Löschen
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
