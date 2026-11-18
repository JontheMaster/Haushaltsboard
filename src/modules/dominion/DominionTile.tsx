import { ChevronRight, Crown, Dices } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Tile } from '../../components/Tile'
import type { TileProps } from '../types'
import { loadCurrent, setDominionOpen, useDominionGames, useDominionOpen } from './dominionStore'

// Kartendaten und Generator laden erst, wenn man Dominion wirklich öffnet (eigenes Paket, ca. 250 KB)
const DominionPage = lazy(() => import('./DominionPage'))
const SettingsBody = lazy(() => import('./DominionSettings').then((m) => ({ default: m.DominionSettingsBody })))

let namesCache: Map<string, string> | null = null
/** deutsche Kartennamen für die Kachel, nachgeladen */
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

/** Vollbild-Seite über allem (per Portal), solange sie offen ist */
export function DominionOverlay() {
  const open = useDominionOpen()
  if (!open) return null
  return createPortal(
    <Suspense fallback={<div className="hb-dom-page" />}>
      <DominionPage onClose={() => setDominionOpen(false)} />
    </Suspense>,
    document.body,
  )
}

const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Berlin' })

/**
 * Handy-Startseite (über „Startseite anpassen“): zuletzt gespielt oder das angefangene Set, Knopf „Neues Set“.
 * Antippen öffnet Dominion im Vollbild.
 */
export function DominionTile({ delay }: TileProps) {
  const { games, loaded } = useDominionGames()
  const names = useCardNames()
  const open = useDominionOpen()
  // angefangenes Set auf diesem Gerät (nach dem Schließen neu lesen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => loadCurrent(), [open])
  const last = games.find((g) => g.played)
  const showDraft = draft && (!last || draft.at > last.created_at) && !games.some((g) => g.seed === draft.kingdom.seed)
  const ids = showDraft ? draft.kingdom.kingdom : (last?.kingdom ?? [])
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
        {loaded && label && names && (
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

/** Alle Funktionen → Dominion: Erweiterungen, Promos, Favoriten und Sperren; dazu „Neues Set“ */
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
      <span className="text-label text-ink-muted">Kartendaten: KingdomCreator (MIT). Nur Namen und Kosten, keine Kartentexte.</span>
      <DominionOverlay />
    </div>
  )
}
