import { Package, Trash2 } from 'lucide-react'
import { Icon } from '../../components/Icon'
import supportJson from './data/support.json'
import { setName } from './cardInfo'
import { CARD_BY_ID, EXTRA_LABELS } from './generator'
import { useCardImages } from './images'
import type { Card, Kingdom } from './types'

type Support = { id: string; name_de: string | null; name_en: string; set: string; boxes: string[] }
const SUPPORT = supportJson as Support[]
const SUPPORT_BY_ID = new Map(SUPPORT.map((s) => [s.id, s]))

/** Basiskarten und Material als „Karte“, damit die große Kartenansicht sie zeigen kann (Bild unter card/sup_<id>.jpg) */
function supportCard(id: string): Card {
  const s = SUPPORT_BY_ID.get(id)!
  return {
    id: `sup_${s.id}`,
    name_de: s.name_de,
    name_en: s.name_en,
    set: s.set,
    boxes: s.boxes,
    editions: [],
    cost: { coins: 0, potion: 0, debt: 0 },
    kind: 'support',
    types: [],
    tags: [],
    requires: [],
    complexity: 1,
  }
}

/** Liegt in jedem Spiel aus (aus dem Basisspiel) */
const BASE = ['copper', 'silver', 'gold', 'estate', 'duchy', 'province', 'curse']

/** Zusatzmaterial aus dem Generator → Karten/Tableaus mit Bild und ein kurzer Hinweis zum Aufbau */
const EXTRA: Record<string, { ids: string[]; note?: string; label?: string }> = {
  potion: { ids: ['potion'], note: 'als eigener Stapel im Vorrat' },
  platinum_colony: { ids: ['platinum', 'colony'], note: 'beide zusätzlich in den Vorrat, das Spiel endet auch, wenn die Kolonien leer sind' },
  shelters: { label: 'Unterschlüpfe', ids: ['hovel', 'necropolis', 'overgrownestate'], note: 'jede Person startet damit statt mit 3 Anwesen' },
  ruins: { ids: ['abandonedmine', 'ruinedlibrary', 'ruinedmarket', 'ruinedvillage', 'survivors'], note: 'gemischt als verdeckter Stapel, nur die oberste Karte offen' },
  spoils: { ids: ['spoils'], note: 'neben den Vorrat legen' },
  madman: { ids: ['madman'], note: 'neben den Vorrat legen' },
  mercenary: { ids: ['mercenary'], note: 'neben den Vorrat legen' },
  island_mat: { ids: ['island_mat'] },
  native_village_mat: { ids: ['native_village_mat'] },
  pirate_ship_mat: { ids: ['pirate_ship_mat', 'coin_tokens'] },
  trade_route_mat: { ids: ['trade_route_mat', 'coin_tokens'] },
  embargo_tokens: { ids: ['embargo_tokens'] },
  vp_tokens: { ids: ['vp_tokens'] },
}

/**
 * „So baut ihr auf“: Startdeck, was immer ausliegt, und alles Zusätzliche für dieses Set, jeweils mit der Erweiterung,
 * aus der es kommt. Jede Karte lässt sich antippen und groß ansehen.
 */
export function Setup({ k, onOpen }: { k: Kingdom; onOpen: (cards: Card[], i: number) => void }) {
  const shelters = k.extras.some((e) => e.id === 'shelters')
  const groups = k.extras.map((e) => {
    const def = EXTRA[e.id]
    const ids = (def?.ids ?? []).filter((id) => SUPPORT_BY_ID.has(id))
    // woher: aus der Erweiterung des Materials, sonst aus der Erweiterung der Karte, die es braucht
    const from =
      (ids[0] && SUPPORT_BY_ID.get(ids[0])!.set) ||
      k.kingdom.map((id) => CARD_BY_ID.get(id)).find((c) => c?.requires.includes(e.id))?.set ||
      (e.id === 'bane' ? CARD_BY_ID.get(k.bane ?? '')?.set : undefined)
    return { id: e.id, label: def?.label ?? (e.label || EXTRA_LABELS[e.id] || e.id), note: def?.note, from, cards: ids.map(supportCard) }
  })
  const base = BASE.map(supportCard)
  const all = [...base, ...groups.flatMap((g) => g.cards)]
  const imgs = useCardImages(
    all.map((c) => c.id),
    'card',
  )

  return (
    <section className="flex flex-col gap-3" aria-label="So baut ihr auf">
      <h4 className="hb-dom-sub">So baut ihr auf</h4>
      <p className="text-body text-ink">
        Jede Person startet mit <b>7 Kupfer</b> und <b>{shelters ? '3 Unterschlüpfen' : '3 Anwesen'}</b>. Dazu die 10 Königreichkarten oben.
      </p>

      <div className="hb-dom-setup">
        <div className="flex items-baseline gap-2">
          <span className="flex-1 font-semibold text-ink">Liegt immer aus</span>
          <span className="hb-dom-set">aus {setName('baseset')}</span>
        </div>
        <ul className="hb-dom-thumbs">
          {base.map((c, i) => (
            <Thumb key={c.id} card={c} img={imgs[c.id]} onOpen={() => onOpen(base, i)} />
          ))}
          <li>
            <span className="hb-dom-thumb is-plain">
              <span className="hb-dom-thumb-img">
                <Icon icon={Trash2} size={22} />
              </span>
              <span className="hb-dom-thumb-name">Müll</span>
            </span>
          </li>
        </ul>
      </div>

      {groups.map((g) => (
        <div key={g.id} className="hb-dom-setup">
          <div className="flex items-baseline gap-2">
            <span className="flex flex-1 items-center gap-2 font-semibold text-ink">
              <Icon icon={Package} size={16} />
              {g.label}
            </span>
            {g.from && <span className="hb-dom-set">aus {setName(g.from)}</span>}
          </div>
          {g.note && <span className="text-label text-ink-muted">{g.note}</span>}
          {g.cards.length > 0 && (
            <ul className="hb-dom-thumbs">
              {g.cards.map((c, i) => (
                <Thumb key={c.id} card={c} img={imgs[c.id]} onOpen={() => onOpen(g.cards, i)} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}

function Thumb({ card, img, onOpen }: { card: Card; img: string | null; onOpen: () => void }) {
  const name = card.name_de ?? card.name_en
  return (
    <li>
      <button type="button" className="hb-dom-thumb" onClick={onOpen} aria-label={`${name} ansehen`}>
        <span className="hb-dom-thumb-img">{img ? <img src={img} alt="" loading="lazy" /> : <Icon icon={Package} size={20} />}</span>
        <span className="hb-dom-thumb-name">{name}</span>
      </button>
    </li>
  )
}
