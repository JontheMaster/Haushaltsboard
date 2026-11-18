import { useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { CountUp } from '../../components/CountUp'
import { setName } from './cardInfo'
import type { DominionGame } from './dominionStore'
import { ALL_CARDS, CARD_BY_ID, isOwned, ownedSets } from './generator'
import { useCardImages } from './images'
import type { Card, Owned } from './types'

/**
 * Statistik (Stufe 2): wie viele Partien, wie viel vom Besitz schon auf dem Tisch lag, Karten, die noch nie dran waren,
 * eure meistgespielten Karten und wie oft jede Erweiterung dabei war. Antippen einer Karte öffnet sie groß.
 */
export function Stats({ games, owned, onOpenCard }: { games: DominionGame[]; owned: Owned; onOpenCard: (cards: Card[], i: number) => void }) {
  const played = games.filter((g) => g.played)
  const [allNever, setAllNever] = useState(false)
  const s = useMemo(() => {
    const mine = ALL_CARDS.filter((c) => c.kind === 'kingdom' && isOwned(c, owned))
    const counts = new Map<string, number>()
    for (const g of played) for (const id of g.kingdom) counts.set(id, (counts.get(id) ?? 0) + 1)
    const never = mine.filter((c) => !counts.has(c.id))
    const top = [...counts.entries()]
      .filter(([id]) => CARD_BY_ID.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, n]) => ({ card: CARD_BY_ID.get(id)!, n }))
    // pro Erweiterung: wie viele ihrer Karten schon gespielt wurden und in wie vielen Partien sie dabei war
    const perSet = ownedSets(owned).map((set) => {
      const inSet = mine.filter((c) => c.set === set)
      return {
        set,
        total: inSet.length,
        seen: inSet.filter((c) => counts.has(c.id)).length,
        games: played.filter((g) => g.kingdom.some((id) => CARD_BY_ID.get(id)?.set === set)).length,
      }
    })
    perSet.sort((a, b) => b.seen / b.total - a.seen / a.total || a.set.localeCompare(b.set))
    const good = played.filter((g) => g.rating === 'gut').length
    const meh = played.filter((g) => g.rating === 'naja').length
    return { mine, never, top, perSet, good, meh, seen: mine.length - never.length }
  }, [played, owned])

  const neverShown = allNever ? s.never : s.never.slice(0, 9)
  const arts = useCardImages([...neverShown.map((c) => c.id), ...s.top.map((t) => t.card.id)], 'art')
  
  return (
    <div className="flex flex-col gap-4">
      <div className="hb-dom-stats-head">
        <div>
          <span className="hb-dom-stat-big">
            <CountUp value={played.length} />
          </span>
          <span className="text-label text-ink-muted">{played.length === 1 ? 'Partie' : 'Partien'}</span>
        </div>
        <div>
          <span className="hb-dom-stat-big">
            <CountUp value={s.seen} />
            <span className="hb-dom-stat-of"> / {s.mine.length}</span>
          </span>
          <span className="text-label text-ink-muted">Karten schon gespielt</span>
        </div>
        <div>
          <span className="hb-dom-stat-big">
            <CountUp value={s.good} />
          </span>
          <span className="text-label text-ink-muted">gute Sets{s.meh ? ` · ${s.meh} naja` : ''}</span>
        </div>
      </div>
      <div className="hb-dom-progress" role="img" aria-label={`${s.seen} von ${s.mine.length} Karten gespielt`}>
        <span style={{ width: `${s.mine.length ? (s.seen / s.mine.length) * 100 : 0}%` }} />
      </div>

      {s.never.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="hb-dom-sub">Lag noch nie auf dem Tisch ({s.never.length})</h4>
          <ul className="hb-dom-mini-grid">
            {neverShown.map((c, i) => (
              <li key={c.id}>
                <button type="button" className="hb-dom-mini" onClick={() => onOpenCard(neverShown, i)}>
                  <span className="hb-dom-mini-art">{arts[c.id] && <img src={arts[c.id]!} alt="" loading="lazy" />}</span>
                  <span className="truncate">{c.name_de ?? c.name_en}</span>
                </button>
              </li>
            ))}
          </ul>
          {s.never.length > 9 && (
            <Button variant="ghost" onClick={() => setAllNever((a) => !a)}>
              {allNever ? 'Weniger zeigen' : `Alle ${s.never.length} zeigen`}
            </Button>
          )}
        </section>
      )}

      {s.top.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="hb-dom-sub">Eure Lieblinge</h4>
          <ol className="flex flex-col gap-2">
            {s.top.map((t, i) => (
              <li key={t.card.id}>
                <button type="button" className="hb-dom-top" onClick={() => onOpenCard(s.top.map((x) => x.card), i)}>
                  <span className="hb-dom-top-rank">{i + 1}</span>
                  <span className="hb-dom-mini-art is-small">{arts[t.card.id] && <img src={arts[t.card.id]!} alt="" loading="lazy" />}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{t.card.name_de ?? t.card.name_en}</span>
                  <span className="text-label text-ink-muted">{t.n}×</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h4 className="hb-dom-sub">So weit seid ihr pro Erweiterung</h4>
        {s.perSet.map((p) => (
          <div key={p.set} className="hb-dom-set-progress">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{setName(p.set)}</span>
              <span className="text-label text-ink-muted">
                {p.seen} von {p.total} Karten{p.seen === p.total && p.total > 0 ? ' · alle gespielt' : ''}
              </span>
            </div>
            <span className={`hb-dom-bar ${p.seen === p.total && p.total > 0 ? 'is-done' : ''}`} role="img" aria-label={`${setName(p.set)}: ${p.seen} von ${p.total} Karten gespielt`}>
              <span style={{ width: `${p.total ? (p.seen / p.total) * 100 : 0}%` }} />
            </span>
            <span className="text-label text-ink-muted">{p.games === 1 ? 'in 1 Partie dabei' : `in ${p.games} Partien dabei`}</span>
          </div>
        ))}
      </section>

      {!played.length && <p className="text-body text-ink-muted">Sobald ihr Sets spielt, steht hier, was ihr schon kennt und was noch wartet.</p>}
    </div>
  )
}
