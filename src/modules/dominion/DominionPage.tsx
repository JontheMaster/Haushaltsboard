import { ArrowLeft, Check, Dices, Lock, LockOpen, Package, RefreshCw, Settings2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useDevice } from '../../lib/device'
import { frameColors, KIND_DE, setName, setShort, typeWords } from './cardInfo'
import { Cost } from './Cost'
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
} from './dominionStore'
import { CARD_BY_ID, costValue, generateKingdom, newSeed, ownedSets, swapCard } from './generator'
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
type Sort = 'kosten' | 'erweiterung'

/**
 * Dominion am Handy (Vollbild, über allem): oben die Optionen als Chips, „Set erstellen“, darunter die 10 Karten
 * mit Behalten/Tauschen, Landschaften, Zusatzmaterial und „Warum es passt“, unten „Das spielen wir“.
 */
export default function DominionPage({ onClose }: { onClose: () => void }) {
  const config = useDominionConfig()
  const { showToast } = useDevice()
  const { games } = useDominionGames()
  const owned = useMemo(() => toOwned(config), [config])
  const mySets = useMemo(() => ownedSets(owned), [owned])
  const [current, setCurrentState] = useState<Current | null>(loadCurrent)
  const [options, setOptions] = useState<GenOptions | null>(null)
  const [sort, setSort] = useState<Sort>('kosten')
  const [settings, setSettings] = useState(false)
  const [reveal, setReveal] = useState(0)

  // Optionen: zuletzt genutzte aus den Einstellungen, sobald sie geladen sind
  const opts: GenOptions = options ?? { ...DEFAULT_OPTIONS, ...(config.last ?? {}) }
  const setOpt = (patch: Partial<GenOptions>) => setOptions({ ...opts, ...patch })
  const chosenSets = (opts.sets?.length ? opts.sets : mySets).filter((s) => mySets.includes(s))
  const hasLandscapes = mySets.some((s) => ['adventures', 'empires', 'renaissance', 'menagerie', 'plunder', 'risingsun', 'promos'].includes(s))

  const setCurrent = (c: Current | null) => {
    setCurrentState(c)
    saveCurrent(c)
  }
  const played = useMemo(() => games.map((g) => ({ kingdom: g.kingdom, played: g.played })), [games])

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

  function create(all = true) {
    const locked = all ? (current?.locked ?? []).filter((id) => current?.kingdom.kingdom.includes(id)) : []
    const o: GenOptions = { ...opts, sets: opts.sets?.length ? opts.sets : undefined, locked }
    const k = generateKingdom(o, owned, played, newSeed())
    setCurrent({ kingdom: k, options: { ...opts }, locked, at: new Date().toISOString() })
    setReveal((r) => r + 1)
    saveDominionConfig({ last: { mix: opts.mix, landscapes: opts.landscapes, difficulty: opts.difficulty, attacks: opts.attacks, sets: opts.sets, focus: opts.focus } })
  }

  function swap(id: string) {
    if (!current) return
    const k = swapCard(current.kingdom, id, { ...current.options, exclude: [] }, owned, played, newSeed())
    setCurrent({ ...current, kingdom: k })
  }

  function toggleLock(id: string) {
    if (!current) return
    const locked = current.locked.includes(id) ? current.locked.filter((x) => x !== id) : [...current.locked, id]
    setCurrent({ ...current, locked })
  }

  async function play() {
    if (!current) return
    const ok = await savePlayed(current.kingdom, current.options)
    showToast?.(ok ? 'Gespeichert. Viel Spaß beim Spielen!' : 'Speichern hat nicht geklappt.')
  }

  const k = current?.kingdom
  const cards = (k?.kingdom ?? []).map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c)
  const sorted =
    sort === 'kosten'
      ? cards
      : [...cards].sort((a, b) => setShort(a.set).localeCompare(setShort(b.set), 'de') || costValue(a) - costValue(b))
  const lands = (k?.landscapes ?? []).map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c)
  const bane = k?.bane ? CARD_BY_ID.get(k.bane) : null
  const alreadyPlayed = !!k && games.some((g) => g.seed === k.seed && g.kingdom.join() === k.kingdom.join())

  if (settings)
    return (
      <div className="hb-dom-page">
        <div className="hb-dom-inner">
          <div className="flex items-center gap-2">
            <button type="button" className="hb-icon-btn" aria-label="Zurück zum Set" onClick={() => setSettings(false)}>
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
          <h2 className="flex-1 font-display text-title text-ink">Dominion</h2>
          <button type="button" className="hb-icon-btn" aria-label="Meine Erweiterungen" onClick={() => setSettings(true)}>
            <Icon icon={Settings2} size={22} />
          </button>
        </div>

        {!mySets.length ? (
          <div className="flex flex-col gap-3">
            <p className="text-body text-ink-muted">Trag zuerst ein, welche Erweiterungen ihr habt.</p>
            <Button variant="primary" icon={<Icon icon={Package} size={20} />} onClick={() => setSettings(true)}>
              Erweiterungen eintragen
            </Button>
          </div>
        ) : (
          <>
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

            <Button variant="primary" size="lg" icon={<Icon icon={Dices} size={22} />} onClick={() => create(false)}>
              Set erstellen
            </Button>

            {k && (
              <section className="flex flex-col gap-3" aria-label="Euer Set">
                <div className="flex items-center gap-2">
                  <h3 className="flex-1 font-display text-[20px] font-semibold text-ink">Euer Set</h3>
                  <div className="hb-seg" role="group" aria-label="Sortieren">
                    <button type="button" className={sort === 'kosten' ? 'is-on' : ''} aria-pressed={sort === 'kosten'} onClick={() => setSort('kosten')}>
                      Kosten
                    </button>
                    <button type="button" className={sort === 'erweiterung' ? 'is-on' : ''} aria-pressed={sort === 'erweiterung'} onClick={() => setSort('erweiterung')}>
                      Erweiterung
                    </button>
                  </div>
                </div>

                <ul className="flex flex-col gap-2" key={reveal}>
                  {sorted.map((c, i) => (
                    <CardRow
                      key={c.id}
                      card={c}
                      index={i}
                      locked={current!.locked.includes(c.id)}
                      onLock={() => toggleLock(c.id)}
                      onSwap={() => swap(c.id)}
                    />
                  ))}
                </ul>

                <Button icon={<Icon icon={RefreshCw} size={20} />} onClick={() => create(true)}>
                  {current!.locked.length ? `Alles neu außer ${current!.locked.length} behaltenen` : 'Alles neu'}
                </Button>

                {(lands.length > 0 || bane) && (
                  <div className="flex flex-col gap-2">
                    <h4 className="hb-dom-sub">{lands.length ? 'Landschaften' : 'Bann-Stapel'}</h4>
                    {lands.map((c, i) => (
                      <CardRow key={c.id} card={c} index={10 + i} />
                    ))}
                    {bane && (
                      <>
                        {lands.length > 0 && <h4 className="hb-dom-sub">Bann-Stapel</h4>}
                        <CardRow card={bane} index={12} />
                      </>
                    )}
                  </div>
                )}

                {k.extras.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="hb-dom-sub">Zusätzlich brauchst du</h4>
                    <div className="flex flex-wrap gap-2">
                      {k.extras.map((e) => (
                        <span key={e.id} className="hb-badge">
                          <Icon icon={Package} size={14} />
                          {e.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {k.reasons.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="hb-dom-sub">Warum es passt</h4>
                    <div className="flex flex-wrap gap-2">
                      {k.reasons.map((r) => (
                        <span key={r} className="hb-badge hb-badge-success">
                          <Icon icon={Sparkles} size={14} />
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <Button variant="primary" size="lg" icon={<Icon icon={Check} size={22} />} disabled={alreadyPlayed} onClick={play}>
                  {alreadyPlayed ? 'Gespeichert' : 'Das spielen wir'}
                </Button>
                <span className="text-label text-ink-muted">Set-Nummer {k.seed}</span>
              </section>
            )}
          </>
        )}
      </div>
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

function CardRow({ card, index, locked, onLock, onSwap }: { card: Card; index: number; locked?: boolean; onLock?: () => void; onSwap?: () => void }) {
  const colors = frameColors(card)
  const style = {
    '--dom-frame': colors.length > 1 ? `linear-gradient(${colors[0]} 50%, ${colors[1]} 50%)` : colors[0],
    animationDelay: `${index * 60}ms`,
  } as CSSProperties
  const name = card.name_de ?? card.name_en
  return (
    <li className={`hb-dom-card ${locked ? 'is-locked' : ''} ${card.types.includes('night') ? 'is-night' : ''}`} style={style}>
      <Cost card={card} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-ink">{name}</span>
        <span className="flex min-w-0 items-center gap-2 text-label text-ink-muted">
          <span className="truncate">{card.kind === 'kingdom' ? typeWords(card) : KIND_DE[card.kind]}</span>
          <span className="hb-dom-set">{setShort(card.set)}</span>
        </span>
      </span>
      {onLock && (
        <button type="button" className={`hb-icon-btn hb-dom-btn ${locked ? 'is-on' : ''}`} aria-pressed={locked} aria-label={locked ? `${name} nicht mehr behalten` : `${name} behalten`} onClick={onLock}>
          <Icon icon={locked ? Lock : LockOpen} size={20} />
        </button>
      )}
      {onSwap && (
        <button type="button" className="hb-icon-btn hb-dom-btn" aria-label={`${name} tauschen`} disabled={locked} onClick={onSwap}>
          <Icon icon={RefreshCw} size={20} />
        </button>
      )}
    </li>
  )
}
