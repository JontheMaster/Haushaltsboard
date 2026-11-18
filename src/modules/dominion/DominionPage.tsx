import { ArrowLeft, Check, Crown, Dices, Package, RefreshCw, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { celebrate } from '../../components/Celebration'
import { Icon } from '../../components/Icon'
import { useDevice } from '../../lib/device'
import { setName, setShort } from './cardInfo'
import { CardTile, CardViewer } from './CardTile'
import { characterOf } from './character'
import { DominionSettingsBody } from './DominionSettings'
import {
  DEFAULT_OPTIONS,
  loadCurrent,
  saveCurrent,
  saveDominionConfig,
  savePlayed,
  toOwned,
  useDominionConfig,
  useDominionGames,
  type Current,
  type DominionGame,
  type DominionTab,
} from './dominionStore'
import { ALL_CARDS, CARD_BY_ID, costValue, generateKingdom, isOwned, kingdomFromSaved, newSeed, ownedSets, swapCard } from './generator'
import { History } from './History'
import { syncImages, useCardImages } from './images'
import { Stats } from './Stats'
import type { Attacks, Card, Difficulty, GenOptions, LandscapeCount, Mix } from './types'

const MIX: { v: Mix; label: string }[] = [
  { v: 'mix', label: '2–3 Erweiterungen' },
  { v: 'querbeet', label: 'Querbeet' },
  { v: 'fokus', label: 'Fokus' },
]
const DIFF: { v: Difficulty; label: string }[] = [
  { v: 'locker', label: 'Locker' },
  { v: 'normal', label: 'Normal' },
  { v: 'alles', label: 'Alles' },
]
const ATT: { v: Attacks; label: string }[] = [
  { v: 'egal', label: 'Egal' },
  { v: 'wenige', label: 'Wenige' },
  { v: 'keine', label: 'Keine' },
]
const LAND: { v: LandscapeCount; label: string }[] = [
  { v: 'auto', label: 'Automatisch' },
  { v: 0, label: 'Keine' },
  { v: 1, label: '1' },
  { v: 2, label: '2' },
]
const LANDSCAPE_SETS = ['adventures', 'empires', 'renaissance', 'menagerie', 'plunder', 'risingsun', 'promos']
type Sort = 'kosten' | 'erweiterung'
type Viewer = { cards: Card[]; i: number; inSet: boolean }

/**
 * Dominion am Handy (Vollbild über allem): Reiter „Neues Set | Verlauf | Statistik“.
 * Neues Set: Optionen, „Set erstellen“, Charakter des Sets, Karten mit Illustration (antippen = Karte groß zum Lesen),
 * Behalten/Tauschen, Landschaften, Zusatzmaterial, Warum es passt, „Das spielen wir“ (mit kleiner Feier).
 */
export default function DominionPage({ startTab = 'set', onClose }: { startTab?: DominionTab; onClose: () => void }) {
  const config = useDominionConfig()
  const { showToast } = useDevice()
  const { games } = useDominionGames()
  const owned = useMemo(() => toOwned(config), [config])
  const mySets = useMemo(() => ownedSets(owned), [owned])
  const [tab, setTab] = useState<DominionTab>(startTab)
  const [current, setCurrentState] = useState<Current | null>(loadCurrent)
  const [options, setOptions] = useState<GenOptions | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [sort, setSort] = useState<Sort>('kosten')
  const [settings, setSettings] = useState(false)
  const [reveal, setReveal] = useState(0)
  const [viewer, setViewer] = useState<Viewer | null>(null)

  const opts: GenOptions = options ?? { ...DEFAULT_OPTIONS, ...(config.last ?? {}) }
  const setOpt = (patch: Partial<GenOptions>) => setOptions({ ...opts, ...patch })
  const chosenSets = (opts.sets?.length ? opts.sets : mySets).filter((s) => mySets.includes(s))
  const hasLandscapes = mySets.some((s) => LANDSCAPE_SETS.includes(s))
  const played = useMemo(() => games.filter((g) => g.played), [games])
  const history = useMemo(() => played.map((g) => ({ kingdom: g.kingdom, played: true, rating: g.rating })), [played])
  const playedIds = useMemo(() => new Set(played.flatMap((g) => g.kingdom)), [played])

  // Bilder für euren Besitz privat ablegen lassen (einmal pro Sitzung)
  useEffect(() => {
    if (mySets.length) syncImages()
  }, [mySets.length])

  // Zurück-Taste am Handy schließt die Seite
  useEffect(() => {
    window.history.pushState({ dominion: true }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
    }
  }, [onClose])
  const close = () => {
    if (window.history.state?.dominion) window.history.back()
    else onClose()
  }

  const setCurrent = (c: Current | null) => {
    setCurrentState(c)
    saveCurrent(c)
  }

  const sortCards = (ids: string[]) => {
    const list = ids.map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c)
    return sort === 'kosten' ? list : [...list].sort((a, b) => setShort(a.set).localeCompare(setShort(b.set), 'de') || costValue(a) - costValue(b))
  }

  function create(keepLocked: boolean) {
    const locked = keepLocked ? (current?.locked ?? []).filter((id) => current?.kingdom.kingdom.includes(id)) : []
    const k = generateKingdom({ ...opts, sets: opts.sets?.length ? opts.sets : undefined, locked }, owned, history, newSeed())
    setCurrent({ kingdom: k, options: { ...opts }, locked, at: new Date().toISOString() })
    setReveal((r) => r + 1)
    setOptionsOpen(false)
    saveDominionConfig({ last: { mix: opts.mix, landscapes: opts.landscapes, difficulty: opts.difficulty, attacks: opts.attacks, sets: opts.sets, focus: opts.focus } })
  }

  function swap(id: string) {
    if (!current) return
    const k = swapCard(current.kingdom, id, { ...current.options, exclude: [] }, owned, history, newSeed())
    setCurrent({ ...current, kingdom: k })
    // im großen Fenster gleich die neue Karte zeigen
    if (viewer?.inSet) {
      const next = sortCards(k.kingdom)
      const newId = k.kingdom.find((x) => !current.kingdom.kingdom.includes(x))
      setViewer({ cards: next, i: Math.max(0, next.findIndex((c) => c.id === newId)), inSet: true })
    }
  }

  function toggleLock(id: string) {
    if (!current) return
    const locked = current.locked.includes(id) ? current.locked.filter((x) => x !== id) : [...current.locked, id]
    setCurrent({ ...current, locked })
  }

  async function play() {
    if (!current) return
    const ok = await savePlayed(current.kingdom, current.options)
    if (ok) {
      celebrate()
      showToast?.('Viel Spaß beim Spielen! Später fragen wir, wie es war.')
    } else showToast?.('Speichern hat nicht geklappt.')
  }

  function replay(g: DominionGame) {
    setCurrent({ kingdom: kingdomFromSaved(g), options: { ...opts }, locked: [], at: new Date().toISOString() })
    setReveal((r) => r + 1)
    setTab('set')
  }

  const toggleIn = (key: 'favorites' | 'banned', id: string) => {
    const list = config[key].includes(id) ? config[key].filter((x) => x !== id) : [...config[key], id]
    const other = key === 'banned' ? 'favorites' : 'banned'
    saveDominionConfig({ [key]: list, [other]: config[other].filter((x) => x !== id) })
  }

  const k = current?.kingdom
  const cards = sortCards(k?.kingdom ?? [])
  const lands = (k?.landscapes ?? []).map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c)
  const bane = k?.bane ? CARD_BY_ID.get(k.bane) : null
  const extraCards = [...lands, ...(bane ? [bane] : [])]
  const arts = useCardImages([...(k?.kingdom ?? []), ...extraCards.map((c) => c.id)], 'art')
  const alreadyPlayed = !!k && !!current && games.some((g) => g.created_at >= current.at && g.kingdom.join() === k.kingdom.join())
  const character = k ? characterOf(k) : null
  const freshCount = played.length ? cards.filter((c) => !playedIds.has(c.id)).length : 0
  const ownedKingdom = useMemo(() => ALL_CARDS.filter((c) => c.kind === 'kingdom' && isOwned(c, owned)), [owned])
  const neverCount = ownedKingdom.filter((c) => !playedIds.has(c.id)).length

  if (settings)
    return (
      <div className="hb-dom-page">
        <div className="hb-dom-inner">
          <div className="flex items-center gap-2">
            <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={() => setSettings(false)}>
              <Icon icon={ArrowLeft} size={22} />
            </button>
            <h2 className="flex-1 font-display text-title text-ink">Meine Erweiterungen</h2>
          </div>
          <DominionSettingsBody />
        </div>
      </div>
    )

  return (
    <div className="hb-dom-page">
      <div className="hb-dom-inner">
        <div className="flex items-center gap-2">
          <button type="button" className="hb-icon-btn" aria-label="Zurück" onClick={close}>
            <Icon icon={ArrowLeft} size={22} />
          </button>
          <h2 className="flex flex-1 items-center gap-2 font-display text-title text-ink">
            <Icon icon={Crown} size={22} />
            Dominion
          </h2>
          <button type="button" className="hb-icon-btn" aria-label="Meine Erweiterungen" onClick={() => setSettings(true)}>
            <Icon icon={Settings2} size={22} />
          </button>
        </div>

        <div className="hb-seg hb-dom-tabs" role="tablist" aria-label="Bereich">
          {(
            [
              ['set', 'Neues Set'],
              ['verlauf', 'Verlauf'],
              ['statistik', 'Statistik'],
            ] as [DominionTab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {!mySets.length ? (
          <div className="flex flex-col gap-3">
            <p className="text-body text-ink-muted">Trag zuerst ein, welche Erweiterungen ihr habt.</p>
            <Button variant="primary" icon={<Icon icon={Package} size={20} />} onClick={() => setSettings(true)}>
              Erweiterungen eintragen
            </Button>
          </div>
        ) : tab === 'verlauf' ? (
          <History games={games} onReplay={replay} />
        ) : tab === 'statistik' ? (
          <Stats games={games} owned={owned} onOpenCard={(list, i) => setViewer({ cards: list, i, inSet: false })} />
        ) : (
          <>
            {!k && <Hero owned={ownedKingdom} playedIds={playedIds} neverCount={played.length ? neverCount : null} />}

            {k && !optionsOpen ? (
              <button type="button" className="hb-dom-optsum" onClick={() => setOptionsOpen(true)}>
                <Icon icon={SlidersHorizontal} size={18} />
                <span className="min-w-0 flex-1 truncate">
                  {[MIX.find((m) => m.v === opts.mix)?.label, DIFF.find((d) => d.v === opts.difficulty)?.label, `Angriffe ${ATT.find((a) => a.v === opts.attacks)?.label.toLowerCase()}`].join(' · ')}
                </span>
                <span className="font-semibold text-accent">Ändern</span>
              </button>
            ) : (
              <Options opts={opts} setOpt={setOpt} mySets={mySets} chosenSets={chosenSets} hasLandscapes={hasLandscapes} />
            )}

            <Button variant="primary" size="lg" icon={<Icon icon={Dices} size={22} />} onClick={() => create(false)}>
              {k ? 'Neues Set' : 'Set erstellen'}
            </Button>

            {k && character && (
              <section className="flex flex-col gap-4" aria-label="Euer Set" key={reveal}>
                <div className="hb-dom-character">
                  <span className="hb-dom-character-kicker">Euer Set</span>
                  <h3 className="hb-dom-character-title">{character.title}</h3>
                  <p className="text-body text-ink">{character.text}</p>
                  <span className="flex flex-wrap gap-1">
                    {k.sets.map((s) => (
                      <span key={s} className="hb-dom-set">
                        {setName(s)}
                      </span>
                    ))}
                    {freshCount > 0 && (
                      <span className="hb-badge hb-badge-accent">
                        <Icon icon={Sparkles} size={12} />
                        {freshCount === 1 ? '1 Karte neu für euch' : `${freshCount} Karten neu für euch`}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex-1 text-label text-ink-muted">Antippen zum Lesen</span>
                  <div className="hb-seg" role="group" aria-label="Sortieren">
                    <button type="button" className={sort === 'kosten' ? 'is-on' : ''} aria-pressed={sort === 'kosten'} onClick={() => setSort('kosten')}>
                      Kosten
                    </button>
                    <button type="button" className={sort === 'erweiterung' ? 'is-on' : ''} aria-pressed={sort === 'erweiterung'} onClick={() => setSort('erweiterung')}>
                      Erweiterung
                    </button>
                  </div>
                </div>

                <ul className="hb-dom-grid">
                  {cards.map((c, i) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      art={arts[c.id]}
                      index={i}
                      fresh={played.length > 0 && !playedIds.has(c.id)}
                      locked={current!.locked.includes(c.id)}
                      onOpen={() => setViewer({ cards, i, inSet: true })}
                      onLock={() => toggleLock(c.id)}
                      onSwap={() => swap(c.id)}
                    />
                  ))}
                </ul>

                <Button icon={<Icon icon={RefreshCw} size={20} />} onClick={() => create(true)}>
                  {current!.locked.length ? `Alles neu außer ${current!.locked.length} behaltenen` : 'Alles neu'}
                </Button>

                {extraCards.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="hb-dom-sub">{lands.length ? (bane ? 'Landschaften und Bann-Stapel' : 'Landschaften') : 'Bann-Stapel'}</h4>
                    <ul className="hb-dom-grid is-wide">
                      {extraCards.map((c, i) => (
                        <CardTile
                          key={c.id}
                          card={c}
                          art={arts[c.id]}
                          index={10 + i}
                          landscape={c.kind !== 'kingdom'}
                          onOpen={() => setViewer({ cards: extraCards, i, inSet: false })}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {k.extras.length > 0 && (
                  <Chips title="Zusätzlich brauchst du">
                    {k.extras.map((e) => (
                      <span key={e.id} className="hb-badge">
                        <Icon icon={Package} size={14} />
                        {e.label}
                      </span>
                    ))}
                  </Chips>
                )}

                {k.reasons.length > 0 && (
                  <Chips title="Warum es passt">
                    {k.reasons.map((r) => (
                      <span key={r} className="hb-badge hb-badge-success">
                        <Icon icon={Sparkles} size={14} />
                        {r}
                      </span>
                    ))}
                  </Chips>
                )}

                <Button variant="primary" size="lg" icon={<Icon icon={Check} size={22} />} disabled={alreadyPlayed} onClick={play}>
                  {alreadyPlayed ? 'Gespeichert, viel Spaß!' : 'Das spielen wir'}
                </Button>
                <span className="text-label text-ink-muted">Set-Nummer {k.seed}</span>
              </section>
            )}
          </>
        )}
      </div>

      {viewer && (
        <CardViewer
          cards={viewer.cards}
          start={viewer.i}
          onClose={() => setViewer(null)}
          locked={viewer.inSet ? current?.locked : undefined}
          onLock={viewer.inSet ? toggleLock : undefined}
          onSwap={viewer.inSet ? swap : undefined}
          favorites={config.favorites}
          banned={config.banned}
          onFavorite={(id) => toggleIn('favorites', id)}
          onBan={(id) => toggleIn('banned', id)}
        />
      )}
    </div>
  )
}

/** Vor dem ersten Set: großer Titel, drei Illustrationen aus eurem Besitz als Fächer, Neugier-Satz */
function Hero({ owned, playedIds, neverCount }: { owned: Card[]; playedIds: Set<string>; neverCount: number | null }) {
  // drei Karten pro Tag, am liebsten ungespielte
  const [day] = useState(() => Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(/-/g, '')))
  const picks = useMemo(() => {
    const pool = owned.filter((c) => !playedIds.has(c.id))
    const from = pool.length >= 3 ? pool : owned
    const out: Card[] = []
    for (let i = 0; out.length < 3 && i < 12 && from.length; i++) {
      const c = from[(day * (i + 7) * 31) % from.length]
      if (!out.includes(c)) out.push(c)
    }
    return out
  }, [owned, playedIds, day])
  const arts = useCardImages(
    picks.map((c) => c.id),
    'art',
  )
  return (
    <div className="hb-dom-hero">
      <div className="hb-dom-fan" aria-hidden="true">
        {picks.map((c, i) => (
          <span key={c.id} className={`hb-dom-fan-card is-${i}`}>
            {arts[c.id] ? <img src={arts[c.id]!} alt="" /> : <Icon icon={Crown} size={28} />}
          </span>
        ))}
      </div>
      <h3 className="hb-dom-hero-title">Was spielen wir heute?</h3>
      <p className="text-body text-ink-muted">
        {neverCount ? `${neverCount} eurer ${owned.length} Karten lagen noch nie auf dem Tisch.` : `${owned.length} Karten aus euren Erweiterungen warten auf euch.`}
      </p>
    </div>
  )
}

function Options({
  opts,
  setOpt,
  mySets,
  chosenSets,
  hasLandscapes,
}: {
  opts: GenOptions
  setOpt: (p: Partial<GenOptions>) => void
  mySets: string[]
  chosenSets: string[]
  hasLandscapes: boolean
}) {
  return (
    <section className="hb-dom-options" aria-label="Optionen">
      <ChipRow label="Erweiterungen">
        {mySets.map((s) => {
          const on = chosenSets.includes(s)
          return (
            <Chip
              key={s}
              on={on}
              onClick={() => {
                const next = on ? chosenSets.filter((x) => x !== s) : [...chosenSets, s]
                if (next.length) setOpt({ sets: next.length === mySets.length ? undefined : next })
              }}
            >
              {setName(s)}
            </Chip>
          )
        })}
      </ChipRow>
      <ChipRow label="Mischung">
        {MIX.map((m) => (
          <Chip key={m.v} on={opts.mix === m.v} onClick={() => setOpt({ mix: m.v })}>
            {m.label}
          </Chip>
        ))}
      </ChipRow>
      {opts.mix === 'fokus' && (
        <ChipRow label="Schwerpunkt">
          <Chip on={!opts.focus || !chosenSets.includes(opts.focus)} onClick={() => setOpt({ focus: null })}>
            Zufall
          </Chip>
          {chosenSets.map((s) => (
            <Chip key={s} on={opts.focus === s} onClick={() => setOpt({ focus: s })}>
              {setName(s)}
            </Chip>
          ))}
        </ChipRow>
      )}
      <ChipRow label="Schwierigkeit">
        {DIFF.map((d) => (
          <Chip key={d.v} on={opts.difficulty === d.v} onClick={() => setOpt({ difficulty: d.v })}>
            {d.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label="Angriffe">
        {ATT.map((a) => (
          <Chip key={a.v} on={opts.attacks === a.v} onClick={() => setOpt({ attacks: a.v })}>
            {a.label}
          </Chip>
        ))}
      </ChipRow>
      {hasLandscapes && (
        <ChipRow label="Landschaften">
          {LAND.map((l) => (
            <Chip key={String(l.v)} on={opts.landscapes === l.v} onClick={() => setOpt({ landscapes: l.v })}>
              {l.label}
            </Chip>
          ))}
        </ChipRow>
      )}
    </section>
  )
}

function Chips({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="hb-dom-sub">{title}</h4>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label text-ink-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} className={`hb-choice hb-dom-chip ${on ? 'is-on' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}
