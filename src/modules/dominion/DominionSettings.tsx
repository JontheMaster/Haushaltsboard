import { Ban, Search, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Toggle } from '../../components/Toggle'
import { useDevice } from '../../lib/device'
import { SETS, setName, setShort } from './cardInfo'
import { saveDominionConfig, useDominionConfig, type DominionConfig } from './dominionStore'
import { ALL_CARDS, isOwned } from './generator'
import { Cost } from './Cost'
import type { SetBox } from './types'

const boxLabel = (familyId: string, b: SetBox) => {
  if (b.update_pack) return 'Updatepack'
  // Gilden und Reiche Ernte: in der 1. Edition zwei Schachteln
  if (familyId === 'guildscornucopia' && b.edition === 1) return `${b.name_de} (1. Edition)`
  return `${b.edition}. Edition`
}

/**
 * „Meine Erweiterungen“: welche Schachteln ihr habt (Edition, Updatepack), einzelne Promo-Karten,
 * gesperrte Karten und Favoriten. Speichert sofort in modules.config von „dominion“.
 */
export function DominionSettingsBody() {
  const remote = useDominionConfig()
  const { showToast } = useDevice()
  // lokal sofort umschalten, gespeichert wird im Hintergrund
  const [local, setLocal] = useState<DominionConfig | null>(null)
  const config = local ?? remote
  // neuer Stand vom Server (auch von unserem eigenen Speichern): wieder den nehmen
  useEffect(() => setLocal(null), [remote])
  const [query, setQuery] = useState('')

  async function update(patch: Partial<DominionConfig>) {
    setLocal({ ...config, ...patch })
    if (!(await saveDominionConfig(patch))) showToast?.('Speichern hat nicht geklappt.')
  }

  const boxes = new Set(config.owned.boxes)
  const toggleBox = (id: string) => {
    const next = new Set(boxes)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update({ owned: { ...config.owned, boxes: [...next] } })
  }
  const togglePromo = (id: string) => {
    const promos = config.owned.promos.includes(id) ? config.owned.promos.filter((x) => x !== id) : [...config.owned.promos, id]
    update({ owned: { ...config.owned, promos } })
  }
  const toggleIn = (key: 'banned' | 'favorites', id: string) => {
    const list = config[key].includes(id) ? config[key].filter((x) => x !== id) : [...config[key], id]
    // eine Karte ist entweder gesperrt oder Favorit
    const other = key === 'banned' ? 'favorites' : 'banned'
    update({ [key]: list, [other]: config[other].filter((x) => x !== id) })
  }

  const owned = { boxes: config.owned.boxes, promos: config.owned.promos, banned: [], favorites: [] }
  const promos = ALL_CARDS.filter((c) => c.set === 'promos' && c.kind === 'kingdom')
  const q = query.trim().toLowerCase()
  const results = useMemo(
    () =>
      q.length < 2
        ? []
        : ALL_CARDS.filter((c) => (c.kind === 'kingdom' || c.kind === 'event' || c.kind === 'project' || c.kind === 'landmark' || c.kind === 'way' || c.kind === 'trait') && isOwned(c, owned))
            .filter((c) => (c.name_de ?? '').toLowerCase().includes(q) || c.name_en.toLowerCase().includes(q))
            .slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, config.owned],
  )
  const byId = new Map(ALL_CARDS.map((c) => [c.id, c]))
  const marked = [...config.favorites.map((id) => ({ id, fav: true })), ...config.banned.map((id) => ({ id, fav: false }))]

  return (
    <div className="flex flex-col gap-4">
      <section className="hb-tile hb-tile-static gap-3 p-4">
        <div className="flex flex-col">
          <h3 className="font-display text-[18px] font-semibold text-ink">Eure Schachteln</h3>
          <span className="text-label text-ink-muted">Nur Karten aus diesen Schachteln kommen ins Set. Beim Basisspiel und den großen Erweiterungen zählt die Edition.</span>
        </div>
        {SETS.filter((s) => s.id !== 'promos').map((s) =>
          s.boxes.length === 1 ? (
            <Toggle key={s.id} label={setName(s.id)} checked={boxes.has(s.boxes[0].id)} onChange={() => toggleBox(s.boxes[0].id)} />
          ) : (
            <fieldset key={s.id} className="flex flex-col gap-2">
              <legend className="mb-2 text-body font-semibold text-ink">{setName(s.id)}</legend>
              <div className="flex flex-wrap gap-2">
                {s.boxes.map((b) => (
                  <button key={b.id} type="button" aria-pressed={boxes.has(b.id)} className={`hb-choice hb-dom-chip ${boxes.has(b.id) ? 'is-on' : ''}`} onClick={() => toggleBox(b.id)}>
                    {boxLabel(s.id, b)}
                  </button>
                ))}
              </div>
            </fieldset>
          ),
        )}
      </section>

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <div className="flex flex-col">
          <h3 className="font-display text-[18px] font-semibold text-ink">Promo-Karten</h3>
          <span className="text-label text-ink-muted">Einzeln gekaufte Karten.</span>
        </div>
        {promos.map((c) => (
          <Toggle key={c.id} label={c.name_de ?? c.name_en} checked={config.owned.promos.includes(c.id)} onChange={() => togglePromo(c.id)} />
        ))}
      </section>

      <section className="hb-tile hb-tile-static gap-3 p-4">
        <div className="flex flex-col">
          <h3 className="font-display text-[18px] font-semibold text-ink">Favoriten und gesperrte Karten</h3>
          <span className="text-label text-ink-muted">Favoriten kommen etwas öfter, gesperrte nie.</span>
        </div>
        <label className="flex items-center gap-2">
          <Icon icon={Search} size={18} />
          <input className="hb-input min-w-0 flex-1" placeholder="Karte suchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Karte suchen" />
        </label>
        {results.map((c) => (
          <div key={c.id} className="hb-dom-search-row">
            <Cost card={c} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-ink">{c.name_de ?? c.name_en}</span>
              <span className="text-label text-ink-muted">{setShort(c.set)}</span>
            </span>
            <button
              type="button"
              className={`hb-icon-btn hb-dom-btn ${config.favorites.includes(c.id) ? 'is-on' : ''}`}
              aria-pressed={config.favorites.includes(c.id)}
              aria-label={`${c.name_de ?? c.name_en} als Favorit`}
              onClick={() => toggleIn('favorites', c.id)}
            >
              <Icon icon={Star} size={20} />
            </button>
            <button
              type="button"
              className={`hb-icon-btn hb-dom-btn ${config.banned.includes(c.id) ? 'is-banned' : ''}`}
              aria-pressed={config.banned.includes(c.id)}
              aria-label={`${c.name_de ?? c.name_en} sperren`}
              onClick={() => toggleIn('banned', c.id)}
            >
              <Icon icon={Ban} size={20} />
            </button>
          </div>
        ))}
        {marked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {marked.map(({ id, fav }) => (
              <button
                key={id}
                type="button"
                className={`hb-badge ${fav ? 'hb-badge-accent' : ''}`}
                aria-label={`${byId.get(id)?.name_de ?? id} ${fav ? 'kein Favorit mehr' : 'nicht mehr sperren'}`}
                onClick={() => toggleIn(fav ? 'favorites' : 'banned', id)}
              >
                <Icon icon={fav ? Star : Ban} size={14} />
                {byId.get(id)?.name_de ?? byId.get(id)?.name_en ?? id}
                <Icon icon={X} size={14} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
