import { Ban, ChevronLeft, ChevronRight, Crown, Lock, LockOpen, RefreshCw, Sparkles, Star, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { frameStyle, KIND_DE, setShort, typeWords } from './cardInfo'
import { Cost } from './Cost'
import { useCardImages } from './images'
import type { Card } from './types'


/**
 * Karte im Set: Illustration oben, Kosten als Münze, Rahmenfarbe als Leiste, Name und Typ darunter.
 * Erscheint mit Umdrehen (Rückseite → Vorderseite), bei reduzierter Bewegung nur weich.
 */
export function CardTile({
  card,
  art,
  index,
  fresh,
  locked,
  landscape,
  onOpen,
  onLock,
  onSwap,
}: {
  card: Card
  art: string | null
  index: number
  fresh?: boolean
  locked?: boolean
  landscape?: boolean
  onOpen: () => void
  onLock?: () => void
  onSwap?: () => void
}) {
  const name = card.name_de ?? card.name_en
  const [loaded, setLoaded] = useState(false)
  return (
    <li
      className={`hb-dom-tile ${landscape ? 'is-landscape' : ''} ${locked ? 'is-locked' : ''}`}
      style={{ ...frameStyle(card), animationDelay: `${index * 90}ms` }}
    >
      <button type="button" className="hb-dom-tile-face" onClick={onOpen} aria-label={`${name} ansehen`}>
        <span className="hb-dom-art">
          {art && <img src={art} alt="" loading="lazy" className={loaded ? 'is-loaded' : ''} onLoad={() => setLoaded(true)} />}
          {!art && (
            <span className="hb-dom-art-empty">
              <Icon icon={Crown} size={28} />
            </span>
          )}
          <span className="hb-dom-art-cost">
            <Cost card={card} />
          </span>
          {fresh && (
            <span className="hb-dom-fresh">
              <Icon icon={Sparkles} size={12} />
              Neu für euch
            </span>
          )}
        </span>
        <span className="hb-dom-tile-text">
          <span className="hb-dom-tile-name">{name}</span>
          <span className="hb-dom-tile-meta">
            <span className="truncate">{card.kind === 'kingdom' ? typeWords(card) : KIND_DE[card.kind]}</span>
            <span className="hb-dom-set">{setShort(card.set)}</span>
          </span>
        </span>
      </button>
      {(onLock || onSwap) && (
        <span className="hb-dom-tile-actions">
          {onLock && (
            <button type="button" className={`hb-icon-btn hb-dom-btn ${locked ? 'is-on' : ''}`} aria-pressed={locked} aria-label={locked ? `${name} nicht mehr behalten` : `${name} behalten`} onClick={onLock}>
              <Icon icon={locked ? Lock : LockOpen} size={18} />
            </button>
          )}
          {onSwap && (
            <button type="button" className="hb-icon-btn hb-dom-btn" aria-label={`${name} tauschen`} disabled={locked} onClick={onSwap}>
              <Icon icon={RefreshCw} size={18} />
            </button>
          )}
        </span>
      )}
    </li>
  )
}

/**
 * Große Karte zum Durchlesen vorm Spielen: Kartenbild (mit Text), wischen oder Pfeile für die nächste Karte.
 * Darunter Behalten/Tauschen (nur im aktuellen Set) und Favorit/Sperren.
 */
export function CardViewer({
  cards,
  start,
  onClose,
  locked,
  onLock,
  onSwap,
  favorites,
  banned,
  onFavorite,
  onBan,
}: {
  cards: Card[]
  start: number
  onClose: () => void
  locked?: string[]
  onLock?: (id: string) => void
  onSwap?: (id: string) => void
  favorites: string[]
  banned: string[]
  onFavorite: (id: string) => void
  onBan: (id: string) => void
}) {
  const [i, setI] = useState(start)
  const card = cards[Math.min(i, cards.length - 1)]
  const ids = cards.map((c) => c.id)
  const images = useCardImages(ids, 'card')
  const touch = useRef<number | null>(null)
  const go = (d: number) => setI((x) => (x + d + cards.length) % cards.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Hintergrund sperren, solange die Karte offen ist (auch die Dominion-Seite darunter scrollt nicht)
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.hb-dom-page')
    const prev = page?.style.overflow ?? ''
    if (page) page.style.overflow = 'hidden'
    return () => {
      if (page) page.style.overflow = prev
    }
  }, [])

  if (!card) return null
  const name = card.name_de ?? card.name_en
  const img = images[card.id]
  const isLocked = locked?.includes(card.id)
  return createPortal(
    <div className="hb-dom-viewer" role="dialog" aria-modal="true" aria-label={name}>
      <header className="hb-dom-viewer-head">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="hb-dom-viewer-name">{name}</span>
          <span className="truncate text-label text-ink-muted">
            {card.kind === 'kingdom' ? typeWords(card) : KIND_DE[card.kind]} · {setShort(card.set)}
            {card.name_de && card.name_de !== card.name_en ? ` · englisch „${card.name_en}“` : ''}
          </span>
        </span>
        {cards.length > 1 && (
          <span className="text-label text-ink-muted">
            {i + 1} / {cards.length}
          </span>
        )}
        <button type="button" className="hb-icon-btn" aria-label="Schließen" onClick={onClose}>
          <Icon icon={X} size={24} />
        </button>
      </header>

      <div
        className="hb-dom-viewer-stage"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return
          const dx = e.changedTouches[0].clientX - touch.current
          touch.current = null
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        }}
      >
        {img ? (
          <img key={card.id} className="hb-dom-viewer-img" src={img} alt={`Karte ${name}`} style={frameStyle(card)} />
        ) : (
          <span className="hb-dom-viewer-empty">
            <Icon icon={Crown} size={36} />
            <span>Bild wird geladen …</span>
          </span>
        )}
        {cards.length > 1 && (
          <>
            <button type="button" className="hb-icon-btn hb-dom-viewer-nav is-prev" aria-label="Vorige Karte" onClick={() => go(-1)}>
              <Icon icon={ChevronLeft} size={24} />
            </button>
            <button type="button" className="hb-icon-btn hb-dom-viewer-nav is-next" aria-label="Nächste Karte" onClick={() => go(1)}>
              <Icon icon={ChevronRight} size={24} />
            </button>
          </>
        )}
      </div>

      <footer className="hb-dom-viewer-foot">
        {onLock && (
          <Button icon={<Icon icon={isLocked ? Lock : LockOpen} size={18} />} aria-pressed={isLocked} onClick={() => onLock(card.id)}>
            {isLocked ? 'Wird behalten' : 'Behalten'}
          </Button>
        )}
        {onSwap && !isLocked && (
          <Button icon={<Icon icon={RefreshCw} size={18} />} onClick={() => onSwap(card.id)}>
            Tauschen
          </Button>
        )}
        <button
          type="button"
          className={`hb-icon-btn hb-dom-btn ${favorites.includes(card.id) ? 'is-on' : ''}`}
          aria-pressed={favorites.includes(card.id)}
          aria-label={favorites.includes(card.id) ? 'Kein Favorit mehr' : 'Als Favorit'}
          onClick={() => onFavorite(card.id)}
        >
          <Icon icon={Star} size={20} />
        </button>
        <button
          type="button"
          className={`hb-icon-btn hb-dom-btn ${banned.includes(card.id) ? 'is-banned' : ''}`}
          aria-pressed={banned.includes(card.id)}
          aria-label={banned.includes(card.id) ? 'Nicht mehr sperren' : 'Sperren'}
          onClick={() => onBan(card.id)}
        >
          <Icon icon={Ban} size={20} />
        </button>
      </footer>
    </div>,
    document.body,
  )
}
