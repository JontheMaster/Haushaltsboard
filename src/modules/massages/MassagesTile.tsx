import { Hand, HandHeart, Heart, Plus, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Tile } from '../../components/Tile'
import { useMembers, type Member } from '../../lib/members'
import type { TileProps } from '../types'
import { addMassage, redeemMassage, undoMassage, useMassages, type MassageEntry } from './massageStore'

const UNDO_MS = 5000
const word = (n: number) => (n === 1 ? 'Massage' : 'Massagen')

const shortDay = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'heute'
  if (same(d, yesterday)) return 'gestern'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Berlin' })
}

/**
 * Handy-Startseite: wer bei wem noch wie viele Massagen gut hat (Wetten). Pro Person eine Karte in ihrer Farbe mit großer Zahl,
 * „+“ = Wette gewonnen (mit kurzer Notiz), „Einlösen“ zieht eine ab (5 s Rückgängig). Darunter die letzten Buchungen.
 */
export function MassagesTile({ delay }: TileProps) {
  const { people, me } = useMembers()
  const { entries, loaded, balance } = useMassages()
  const [win, setWin] = useState<Member | null>(null)
  const [undo, setUndo] = useState<MassageEntry | null>(null)
  // +1 kurz feiern (Zahl hüpft, Herzen steigen auf)
  const [burst, setBurst] = useState<{ member: string; at: number } | null>(null)

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [undo])

  const recent = entries.slice(0, 3)
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Jemand'

  return (
    <Tile title="Massagen" icon={HandHeart} delay={delay}>
      <div className="flex flex-col gap-3">
        <div className="hb-massage-grid">
          {people.map((p, i) => (
            <MassageCard
              key={p.id}
              person={p}
              personClass={i === 0 ? 'hb-person-a' : 'hb-person-b'}
              count={loaded ? balance(p.id) : null}
              burst={burst?.member === p.id ? burst.at : 0}
              undoing={undo?.member === p.id ? undo : null}
              onWin={() => setWin(p)}
              onRedeem={async () => {
                const e = await redeemMassage(p.id, me.id)
                if (e) setUndo(e)
              }}
              onUndo={async () => {
                if (undo) await undoMassage(undo.id)
                setUndo(null)
              }}
            />
          ))}
        </div>
        {recent.length > 0 && (
          <ul className="hb-massage-log">
            {recent.map((e) => (
              <li key={e.id}>
                <Icon icon={e.delta > 0 ? Heart : Hand} size={14} />
                <span className="min-w-0 flex-1 truncate">
                  {e.delta > 0 ? `${nameOf(e.member)} hat gewonnen` : `${nameOf(e.member)} hat eine eingelöst`}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
                <span className="flex-none text-ink-muted">{shortDay(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {loaded && !entries.length && <p className="text-label text-ink-muted">Wer eine Wette gewinnt, bekommt hier eine Massage gutgeschrieben.</p>}
      </div>
      {win && (
        <WinSheet
          person={win}
          onClose={() => setWin(null)}
          onSave={async (note) => {
            const e = await addMassage(win.id, me.id, note)
            if (!e) return false
            setWin(null)
            setBurst({ member: win.id, at: Date.now() })
            return true
          }}
        />
      )}
    </Tile>
  )
}

function MassageCard({
  person,
  personClass,
  count,
  burst,
  undoing,
  onWin,
  onRedeem,
  onUndo,
}: {
  person: Member
  personClass: string
  count: number | null
  burst: number
  undoing: MassageEntry | null
  onWin: () => void
  onRedeem: () => void
  onUndo: () => void
}) {
  // Zahl hüpft bei jeder Änderung (nicht beim ersten Laden)
  const prev = useRef<number | null>(null)
  const [pop, setPop] = useState(0)
  useEffect(() => {
    if (prev.current !== null && count !== null && count !== prev.current) setPop(Date.now())
    prev.current = count
  }, [count])

  return (
    <div className={`hb-massage-card ${personClass}`}>
      <div className="hb-massage-who">
        <span className="hb-massage-avatar">{person.name.charAt(0)}</span>
        <span className="truncate">{person.name}</span>
      </div>
      <div className="hb-massage-count">
        <span key={pop} className={`hb-massage-num ${pop ? 'is-pop' : ''}`}>
          {count ?? '–'}
        </span>
        <span className="hb-massage-unit">{count === null ? '' : `${word(count)} gut`}</span>
        {burst > 0 && (
          <span key={burst} className="hb-massage-hearts" aria-hidden="true">
            <Icon icon={Heart} size={14} />
            <Icon icon={Heart} size={10} />
            <Icon icon={Heart} size={12} />
          </span>
        )}
      </div>
      {undoing ? (
        <button type="button" className="hb-massage-undo" onClick={onUndo}>
          <Icon icon={Undo2} size={16} />
          Eingelöst · Rückgängig
        </button>
      ) : (
        <div className="hb-massage-actions">
          <button type="button" className="hb-massage-plus" aria-label={`${person.name} hat eine Wette gewonnen`} onClick={onWin}>
            <Icon icon={Plus} size={20} />
          </button>
          <button type="button" className="hb-massage-redeem" disabled={!count} onClick={onRedeem}>
            Einlösen
          </button>
        </div>
      )}
    </div>
  )
}

function WinSheet({ person, onClose, onSave }: { person: Member; onClose: () => void; onSave: (note: string) => Promise<boolean> }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await onSave(note)
    setBusy(false)
    setFailed(!ok)
  }
  return (
    <Sheet title="Wette gewonnen" onClose={onClose}>
      <p className="text-body text-ink">
        <b>{person.name}</b> bekommt eine Massage gutgeschrieben.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-label text-ink-muted">Worum ging die Wette? (optional)</span>
        <input
          className="hb-input"
          value={note}
          maxLength={120}
          placeholder="z. B. Wer zuerst die Deko aufhängt"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
        />
      </label>
      {failed && <p className="text-label text-urgent">Hat nicht geklappt, bitte nochmal versuchen.</p>}
      <Button variant="primary" size="lg" icon={<Icon icon={HandHeart} size={20} />} disabled={busy} onClick={save}>
        Massage gutschreiben
      </Button>
    </Sheet>
  )
}
