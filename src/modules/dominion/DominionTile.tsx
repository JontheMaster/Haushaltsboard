import { ChevronRight, Crown, Dices, ThumbsUp, Meh } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import { useMembers } from '../../lib/members'
import type { TileProps } from '../types'
import { loadCurrent, rateGame, ratingDue, setDominionOpen, useDominionGames, useDominionOpen, type DominionGame } from './dominionStore'

// Kartendaten, Generator und Bilder laden erst, wenn man Dominion wirklich öffnet (eigenes Paket)
const DominionPage = lazy(() => import('./DominionPage'))
const SettingsBody = lazy(() => import('./DominionSettings').then((m) => ({ default: m.DominionSettingsBody })))

let namesCache: Map<string, string> | null = null
/** deutsche Kartennamen für Kachel und Karte oben, nachgeladen */
function useCardNames(): Map<string, string> | null {
  const [names, setNames] = useState(namesCache)
  useEffect(() => {
    if (namesCache) return
    import('./data/cards.json').then((m) => {
      namesCache = new Map((m.default as { id: string; name_de: string | null; name_en: string }[]).map((c) => [c.id, c.name_de ?? c.name_en]))
      setNames(namesCache)
    })
  }, [])
  return names
}

// Das Vollbild darf nur einmal da sein, auch wenn Kachel, Karte oben und Einstellungen gleichzeitig „Gastgeber“ sind
const hosts: symbol[] = []
const hostListeners = new Set<() => void>()
function useIsHost(): boolean {
  const [me] = useState(() => Symbol('dominion-host'))
  useEffect(() => {
    hosts.push(me)
    hostListeners.forEach((l) => l())
    return () => {
      hosts.splice(hosts.indexOf(me), 1)
      hostListeners.forEach((l) => l())
    }
  }, [me])
  return useSyncExternalStore(
    (cb) => {
      hostListeners.add(cb)
      return () => hostListeners.delete(cb)
    },
    () => hosts[0] === me,
  )
}

/** Vollbild-Seite über allem (per Portal), solange sie offen ist */
export function DominionOverlay() {
  const open = useDominionOpen()
  const host = useIsHost()
  if (!open || !host) return null
  return createPortal(
    <Suspense fallback={<div className="hb-dom-page" />}>
      <DominionPage key={open} startTab={open} onClose={() => setDominionOpen(false)} />
    </Suspense>,
    document.body,
  )
}

const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Berlin' })

/**
 * Handy-Startseite (über „Startseite anpassen“): zuletzt gespielt oder das angefangene Set, Knopf „Neues Set“.
 * Antippen öffnet Dominion im Vollbild. Steht eine Bewertung aus, fragt die Kachel direkt „Wie war’s?“.
 */
export function DominionTile({ delay }: TileProps) {
  const { games, loaded } = useDominionGames()
  const names = useCardNames()
  const open = useDominionOpen()
  // angefangenes Set auf diesem Gerät (nach dem Schließen neu lesen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => loadCurrent(), [open])
  const last = games.find((g) => g.played)
  const showDraft = draft && (!last || draft.at > last.created_at) && !games.some((g) => g.created_at >= draft.at)
  const ids = showDraft ? draft.kingdom.kingdom : (last?.kingdom ?? [])
  const justPlayed = last && !showDraft && Date.now() - Date.parse(last.created_at) < 5 * 3_600_000 && !last.rating
  const label = showDraft ? 'Angefangen, noch nicht gespielt' : last ? `Zuletzt gespielt · ${day(last.played_on ?? last.created_at)}` : null

  return (
    <Tile
      title="Dominion"
      icon={Crown}
      delay={delay}
      action={
        <button type="button" className="hb-icon-btn" aria-label="Dominion öffnen" onClick={() => setDominionOpen(true)}>
          <Icon icon={ChevronRight} size={20} />
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {loaded && justPlayed && (
          <div className="hb-dom-tile-hint">
            <span className="font-semibold text-ink">Viel Spaß! Wer gewinnt?</span>
            <span className="text-label text-ink-muted">Danach kurz bewerten, dann kommen gute Karten öfter.</span>
            <RateInline game={last!} />
          </div>
        )}
        {loaded && label && names && !justPlayed && (
          <button type="button" className="flex flex-col gap-1 text-left" onClick={() => setDominionOpen(true)}>
            <span className="text-label text-ink-muted">{label}</span>
            <span className="text-body text-ink">{ids.map((id) => names.get(id) ?? id).join(', ')}</span>
          </button>
        )}
        {loaded && !label && <span className="text-body text-ink-muted">Stellt euch ein stimmiges Königreich aus euren Erweiterungen zusammen.</span>}
        <Button variant="primary" icon={<Icon icon={Dices} size={20} />} onClick={() => setDominionOpen(true)}>
          Neues Set
        </Button>
      </div>
      <DominionOverlay />
    </Tile>
  )
}

function RateInline({ game }: { game: DominionGame }) {
  const { showToast } = useDevice()
  const rate = async (r: 'gut' | 'naja') => {
    const ok = await rateGame(game.id, r)
    showToast?.(ok ? (r === 'gut' ? 'Gemerkt: gutes Set. Solche Karten kommen öfter.' : 'Gemerkt. Diese Karten kommen etwas seltener.') : 'Das hat nicht geklappt.')
  }
  return (
    <div className="hb-dom-rate" role="group" aria-label="Wie war das Set?">
      <button type="button" className="hb-dom-rate-btn is-good" onClick={() => rate('gut')}>
        <Icon icon={ThumbsUp} size={18} />
        Gut
      </button>
      <button type="button" className="hb-dom-rate-btn" onClick={() => rate('naja')}>
        <Icon icon={Meh} size={18} />
        Naja
      </button>
    </div>
  )
}

/**
 * Karte oben auf der Handy-Startseite (Stufe 2): „Wie war euer Dominion-Set?“ mit Gut/Naja, sobald die Erinnerung
 * fällig ist (3 Std nach dem Spielen bzw. morgens), höchstens 3 Tage. Öffnet außerdem Dominion aus der Mitteilung
 * (?dominion=bewerten). An der Wand nichts.
 */
export function DominionHeader({ variant }: { variant: 'wall' | 'phone' }) {
  const { me } = useMembers()
  const { games } = useDominionGames()
  const names = useCardNames()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (variant !== 'phone') return
    const t = setInterval(() => setNow(Date.now()), 60_000)
    // aus der Mitteilung: URL-Parameter (App war zu) oder Nachricht vom Service Worker (App war offen)
    const params = new URLSearchParams(window.location.search)
    if (params.has('dominion')) {
      setDominionOpen(params.get('dominion') === 'bewerten' ? 'verlauf' : 'set')
      params.delete('dominion')
      const q = params.toString()
      window.history.replaceState(window.history.state, '', window.location.pathname + (q ? `?${q}` : ''))
    }
    const onMsg = (e: MessageEvent) => e.data?.open === 'dominion' && setDominionOpen('verlauf')
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      clearInterval(t)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [variant])

  if (variant !== 'phone' || me.is_board) return null
  const due = ratingDue(games, now)
  return (
    <>
      {due && (
        <div className="hb-dom-rate-card hb-slot-item" data-kind="meal">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setDominionOpen('verlauf')}>
            <span className="hb-dom-rate-icon">
              <Icon icon={Crown} size={20} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-ink">Wie war euer Dominion-Set?</span>
              <span className="truncate text-label text-ink-muted">{names ? due.kingdom.slice(0, 3).map((id) => names.get(id) ?? id).join(', ') + ' …' : ' '}</span>
            </span>
          </button>
          <RateInline game={due} />
        </div>
      )}
      <DominionOverlay />
    </>
  )
}

/** Alle Funktionen → Dominion: Erweiterungen, Promos, Favoriten und Sperren, Erinnerung; dazu „Neues Set“ */
export function DominionSettings({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Dominion" onBack={onBack} />
      <Button variant="primary" icon={<Icon icon={Dices} size={20} />} onClick={() => setDominionOpen(true)}>
        Neues Set erstellen
      </Button>
      <Suspense fallback={null}>
        <SettingsBody />
      </Suspense>
      <span className="text-label text-ink-muted">Kartendaten und -bilder: KingdomCreator (MIT). Die Bilder liegen nur in eurem privaten Speicher.</span>
      <DominionOverlay />
    </div>
  )
}
