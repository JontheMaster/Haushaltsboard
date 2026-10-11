import { FileSpreadsheet, Plus, RefreshCw, Search, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { berlinDay } from '../../lib/time'
import { isIsin } from '../../../supabase/functions/_shared/depotCsv.ts'
import {
  addPosition,
  applyDepotImport,
  fmtPct,
  fmtQty,
  lookupIsin,
  previewDepotImport,
  quoteStamp,
  refreshQuotes,
  summarize,
  useHoldings,
  useQuotes,
  type DepotPlan,
  type Lookup,
} from './depotStore'
import { euro } from './finStore'

/** Kurzer Name: „iShares Core MSCI World UCITS ETF USD (Acc)“ → „Core MSCI World“ */
function shortName(name: string): string {
  return (
    name
      .replace(/\b(iShares|Xtrackers|Vanguard|Amundi|SPDR|Lyxor|UCITS|ETF|USD|EUR|\(Acc\)|\(Dist\)|Acc|Dist|plc|III|II)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim() || name
  )
}

/**
 * Depot im Reiter Finanzen (Stufe 5): Wert, Veränderung seit dem letzten Schlusskurs, Gewinn seit Kauf,
 * Positionen mit Anteil; Position von Hand oder Depotübersicht (CSV) übernehmen.
 * Das Board kennt nur Positionen und Stückzahlen; Kurse sind öffentlich (depot-quotes, ca. 15 Min verzögert).
 */
export function DepotView({ showToast }: { showToast: (m: string) => void }) {
  const { holdings } = useHoldings()
  const symbols = (holdings ?? []).map((h) => h.symbol).filter((s): s is string => !!s)
  const { quotes, prev } = useQuotes(symbols)
  const [adding, setAdding] = useState(false)
  const [plan, setPlan] = useState<DepotPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { me } = useMembers()

  // beim Öffnen einmal frische Kurse anstoßen (Server holt höchstens alle 5 Min neu)
  useEffect(() => {
    refreshQuotes()
  }, [])

  async function pick(file: File | undefined) {
    if (!file) return
    try {
      const p = await previewDepotImport(file, me.id)
      if (!p.rows.length) return showToast('Das sieht nicht nach einer Depotübersicht aus. Exportiere sie im ING-Banking als CSV.')
      setPlan(p)
    } catch {
      showToast('Die Datei lässt sich nicht lesen.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const s = holdings ? summarize(holdings, quotes, prev) : null
  const tone = (n: number) => (n > 0.005 ? 'is-up' : n < -0.005 ? 'is-down' : '')

  return (
    <div className="flex flex-col gap-4">
      {holdings === null ? (
        <p className="text-label text-ink-muted">Einen Moment …</p>
      ) : holdings.length === 0 ? (
        <section className="hb-tile hb-tile-static gap-3">
          <h3 className="font-semibold text-ink">Noch kein Depot</h3>
          <p className="text-label text-ink-muted">
            Übernimm die Depotübersicht aus dem ING-Banking oder trag eine Position von Hand ein. Das Board kennt dann nur Papiere und Stückzahlen, die Kurse holt es öffentlich.
          </p>
        </section>
      ) : (
        s && (
          <section className="hb-tile hb-tile-static gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-ink-muted">Depotwert</span>
              <span className="text-label text-ink-muted">{quoteStamp(s.at)}</span>
            </div>
            <span className="hb-depot-value">{euro(s.value)}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className={`hb-depot-delta ${tone(s.day)}`}>
                {fmtPct(s.dayPct)} · {euro(s.day, true)} <span className="text-ink-muted">seit gestern</span>
              </span>
              <span className={`hb-depot-delta ${tone(s.gain)}`}>
                {fmtPct(s.gainPct)} · {euro(s.gain, true)} <span className="text-ink-muted">seit Kauf</span>
              </span>
            </div>
            <span className="text-label text-ink-muted">Eingezahlt {euro(s.invested)}</span>
            {s.missing > 0 && <span className="text-label text-ink-muted">Für {s.missing} {s.missing === 1 ? 'Position' : 'Positionen'} fehlt noch ein Kurs, dort zählt der Einstand.</span>}
          </section>
        )
      )}

      {holdings && holdings.length > 0 && s && (
        <section className="hb-tile hb-tile-static gap-1">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold text-ink">Positionen</h3>
            <button type="button" className="hb-icon-btn" aria-label="Kurse aktualisieren" onClick={() => refreshQuotes().then(() => showToast('Kurse aktualisiert'))}>
              <Icon icon={RefreshCw} size={18} />
            </button>
          </div>
          <ul className="flex flex-col">
            {holdings.map((h) => {
              const q = h.symbol ? quotes.get(h.symbol) : undefined
              const value = q ? Number(h.quantity) * Number(q.price) : Number(h.invested)
              const gain = value - Number(h.invested)
              const pct = Number(h.invested) ? (gain / Number(h.invested)) * 100 : 0
              const share = s.value ? (value / s.value) * 100 : 0
              return (
                <li key={h.id} className="hb-depot-row">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{shortName(h.name)}</span>
                    <span className="hb-fin-amount">{euro(value)}</span>
                  </div>
                  <div className="flex items-baseline gap-2 text-label text-ink-muted">
                    <span className="min-w-0 flex-1 truncate">
                      {fmtQty(Number(h.quantity))} Stück{q ? ` · ${euro(Number(q.price))}` : ''} · eingezahlt {euro(Number(h.invested))}
                    </span>
                    <span className={`hb-depot-delta ${tone(gain)}`}>{fmtPct(pct)}</span>
                  </div>
                  <span className="hb-depot-share" aria-label={`${Math.round(share)} % vom Depot`}>
                    <span style={{ width: `${share}%` }} />
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" icon={<Icon icon={Upload} size={18} />} onClick={() => input.current?.click()}>
          Übersicht laden
        </Button>
        <Button size="lg" icon={<Icon icon={Plus} size={18} />} onClick={() => setAdding(true)}>
          Position
        </Button>
      </div>
      <p className="flex gap-2 px-1 text-label text-ink-muted">
        <Icon icon={ShieldCheck} size={16} className="shrink-0" />
        Kein Zugriff aufs Depot, kein Handel. Kurse ca. 15 Minuten verzögert, nur zur Anzeige.
      </p>

      {adding && (
        <AddPositionSheet
          onClose={() => setAdding(false)}
          onDone={(m) => {
            setAdding(false)
            showToast(m)
          }}
        />
      )}
      {plan && (
        <Sheet title="Depotübersicht" onClose={() => setPlan(null)}>
          <DepotImportBody
            plan={plan}
            busy={busy}
            onCancel={() => setPlan(null)}
            onApply={async (household) => {
              setBusy(true)
              const r = await applyDepotImport(plan, me.id, household)
              setBusy(false)
              setPlan(null)
              showToast(r.message)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

function DepotImportBody({ plan, busy, onCancel, onApply }: { plan: DepotPlan; busy: boolean; onCancel: () => void; onApply: (household: boolean) => void }) {
  const [household, setHousehold] = useState(plan.parse.joint)
  const changes = plan.rows.filter((r) => r.kind !== 'same').length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Icon icon={FileSpreadsheet} size={26} className="text-accent" />
        <span className="text-body text-ink">
          {plan.rows.length} {plan.rows.length === 1 ? 'Position' : 'Positionen'}
          {plan.parse.day ? `, Stand ${new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${plan.parse.day}T12:00:00Z`))}` : ''}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {plan.rows.map((r) => (
          <li key={r.pos.isin} className="hb-depot-row">
            <span className="truncate font-semibold text-ink">{shortName(r.pos.name)}</span>
            <span className="text-label text-ink-muted">
              {r.kind === 'new'
                ? `Neu: ${fmtQty(r.pos.quantity)} Stück, eingezahlt ${euro(r.pos.cost_value ?? 0)}`
                : r.kind === 'correction'
                  ? `Abgleich: ${r.dQty >= 0 ? '+' : '−'}${fmtQty(Math.abs(r.dQty))} Stück, ${euro(r.dInvested, true)} eingezahlt`
                  : 'Schon auf dem Stand der Bank'}
            </span>
          </li>
        ))}
      </ul>
      {plan.rows.some((r) => r.kind === 'new') && <Toggle checked={household} onChange={setHousehold} label="Gemeinsames Depot: beide sehen es" />}
      <p className="text-label text-ink-muted">Depot- und Kundennummer werden nicht gespeichert. Die Stückzahl der Bank gilt.</p>
      {changes > 0 ? (
        <Button variant="primary" size="lg" disabled={busy} onClick={() => onApply(household)}>
          {busy ? 'Übernehme …' : 'Übernehmen'}
        </Button>
      ) : (
        <p className="text-body text-ink">Alles schon auf dem Stand der Bank.</p>
      )}
      <Button size="lg" onClick={onCancel}>
        {changes > 0 ? 'Abbrechen' : 'Schließen'}
      </Button>
    </div>
  )
}

/** Position von Hand: ISIN suchen, Stückzahl, Kaufkurs oder Kaufsumme, Datum */
function AddPositionSheet({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const { me } = useMembers()
  const [isin, setIsin] = useState('')
  const [found, setFound] = useState<Lookup | null>(null)
  const [searching, setSearching] = useState(false)
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(berlinDay())
  const [household, setHousehold] = useState(true)
  const [busy, setBusy] = useState(false)
  const n = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'))

  async function search() {
    const v = isin.trim().toUpperCase()
    if (!isIsin(v)) return setFound({ ok: false, message: 'Eine ISIN hat 12 Zeichen, z. B. IE00B4L5Y983.' })
    setSearching(true)
    const r = await lookupIsin(v)
    setSearching(false)
    setFound(r)
    if (r.ok && r.price && !price) setPrice(String(r.price).replace('.', ','))
  }

  async function save() {
    if (!found?.ok || !found.name) return
    const q = n(qty)
    const p = n(price)
    if (!(q > 0) || !(p > 0)) return onDone('Stückzahl und Kaufkurs fehlen.')
    setBusy(true)
    const r = await addPosition({ owner: me.id, isin: isin.trim().toUpperCase(), name: found.name, symbol: found.symbol ?? null, quantity: q, price: p, date, household })
    setBusy(false)
    onDone(r.message)
  }

  return (
    <Sheet title="Position hinzufügen" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-muted">ISIN</span>
          <div className="flex gap-2">
            <input className="hb-input min-w-0 flex-1 uppercase" value={isin} placeholder="IE00B4L5Y983" onChange={(e) => setIsin(e.target.value)} autoCapitalize="characters" />
            <Button icon={<Icon icon={Search} size={18} />} disabled={searching} onClick={search}>
              Suchen
            </Button>
          </div>
        </label>
        {found && (
          <p className={`text-label ${found.ok ? 'text-ink' : 'text-urgent'}`}>
            {found.ok ? `${found.name} · ${found.symbol} · ${euro(found.price ?? 0)}` : found.message}
          </p>
        )}
        {found?.ok && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-label text-ink-muted">Stück</span>
                <input className="hb-input" inputMode="decimal" value={qty} placeholder="3,5" onChange={(e) => setQty(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-label text-ink-muted">Kaufkurs in €</span>
                <input className="hb-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
            </div>
            {n(qty) > 0 && n(price) > 0 && <p className="text-label text-ink-muted">Kaufsumme {euro(n(qty) * n(price))}</p>}
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-muted">Kaufdatum</span>
              <input className="hb-input" type="date" value={date} max={berlinDay()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <Toggle checked={household} onChange={setHousehold} label="Gemeinsames Depot: beide sehen es" />
            <Button variant="primary" size="lg" disabled={busy} onClick={save}>
              Kauf eintragen
            </Button>
          </>
        )}
      </div>
    </Sheet>
  )
}
