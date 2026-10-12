import { ChevronRight, Tag } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../../lib/members'
import { useSettings } from '../../lib/settings'
import { supabase } from '../../lib/supabase'
import { useLongPress } from '../../lib/useLongPress'
import { shopName } from './Analysis'
import { euro, iconOf, useFinCategories, useFinProfile } from './finStore'

export type ReviewItem = {
  id: string
  booked_on: string
  booked_at: string | null
  counterparty: string
  label: string | null
  purpose: string | null
  amount: number
  category: string
  created_at: string
  reason: string | null
}

const SEEN_KEY = 'hb-fin-review-seen'
const day = (d: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

/** Offene Buchungen ohne Kategorie (RPC fin_review_list; am Tablet nur Haushalt), alle 2 Minuten neu */
export function useReviewList(enabled: boolean) {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('fin_review_list')
    setItems((data as ReviewItem[] | null) ?? [])
  }, [])
  useEffect(() => {
    if (!enabled) return setItems(null)
    load()
    const t = setInterval(load, 120_000)
    return () => clearInterval(t)
  }, [enabled, load])
  return { items, reload: load }
}

/**
 * Karte oben auf der Startseite (Wand und Handy, 12.10.2026): neue Buchungen ohne Kategorie.
 * Antippen öffnet das Zuordnen direkt dort, lange drücken = später (bis wieder neue dazukommen, pro Gerät).
 * Nie im Besuchsmodus; am Handy nur, wer Finanzen für sich eingeschaltet hat.
 */
export function FinanceHeader() {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const { settings } = useSettings()
  const allowed = !settings?.visit_mode && (me.is_board || !!profile?.enabled)
  const { items, reload } = useReviewList(allowed)
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState<string>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const newest = items?.reduce((m, t) => (t.created_at > m ? t.created_at : m), '') ?? ''
  const press = useLongPress(() => {
    try {
      localStorage.setItem(SEEN_KEY, newest)
    } catch {
      // nur Komfort
    }
    setSeen(newest)
  })
  if (!allowed || !items) return null
  // nur zeigen, wenn seit dem letzten „Später“ neue dazugekommen sind
  const show = items.length > 0 && newest > seen
  return (
    <>
      {show && !open && (
        <button
          type="button"
          className="hb-meal-card hb-fin-review-head hb-slot-item"
          data-kind="low"
          aria-label="Buchungen zuordnen, lange drücken blendet aus bis neue kommen"
          onPointerDown={press.onPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => !press.fired.current && setOpen(true)}
        >
          <span className="hb-recipe-img hb-meal-card-img">
            <Icon icon={Tag} size={24} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="hb-meal-card-when">
              <Icon icon={Tag} size={14} />
              Finanzen
            </span>
            <span className="hb-meal-card-title">
              {items.length} {items.length === 1 ? 'Buchung' : 'Buchungen'} zuordnen
            </span>
          </span>
          <span className="hb-meal-card-go">
            Zuordnen
            <Icon icon={ChevronRight} size={18} />
          </span>
        </button>
      )}
      {open && (
        <ReviewSheet
          items={items}
          wide={me.is_board}
          onClose={() => {
            setOpen(false)
            reload()
          }}
          onChanged={reload}
          onLater={() => {
            try {
              localStorage.setItem(SEEN_KEY, newest)
            } catch {
              // nur Komfort
            }
            setSeen(newest)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

/** Eine Buchung nach der anderen: Kategorie antippen, dann „Nur diesmal“ oder „Immer so“ */
export function ReviewSheet({ items, wide, onClose, onChanged, onLater }: { items: ReviewItem[]; wide?: boolean; onClose: () => void; onChanged: () => void; onLater: () => void }) {
  const cats = useFinCategories()
  const [done, setDone] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const rest = items.filter((t) => !done.includes(t.id) && !skipped.includes(t.id))
  const tx = rest[0]
  const name = tx ? (tx.label ?? shopName(tx.counterparty)) : ''

  async function save(always: boolean) {
    if (!tx || !picked) return
    setBusy(true)
    const { data, error } = await supabase.rpc('fin_review_assign', { p_id: tx.id, p_category: picked, p_always: always })
    setBusy(false)
    if (error) return setNote('Das hat nicht geklappt.')
    const more = Number(data ?? 0)
    // mit „Immer so“ erledigte Buchungen derselben Gegenpartei fallen auch aus der Liste
    const same = always ? items.filter((t) => t.counterparty === tx.counterparty).map((t) => t.id) : []
    setDone((d) => [...d, tx.id, ...same])
    setNote(always ? `Regel angelegt${more > 0 ? `, ${more} weitere zugeordnet` : ''}` : null)
    setPicked(null)
    onChanged()
  }

  return (
    <Sheet title="Zuordnen" onClose={onClose} wide={wide}>
      <div className="flex flex-col gap-4">
        {note && <p className="rounded-md bg-success-soft p-3 text-label text-ink">{note}</p>}
        {!tx ? (
          <>
            <p className="text-body text-ink">Alles zugeordnet. Mit jeder Regel wird die Liste beim nächsten Import kürzer.</p>
            <Button variant="primary" size="lg" onClick={onClose}>
              Fertig
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink-muted">
                {day(tx.booked_on)}
                {tx.booked_at ? ` · ${new Date(tx.booked_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}` : ''} · noch {rest.length}
              </span>
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 hb-fin-big text-ink">{name}</span>
                <span className={`hb-fin-amount hb-fin-big ${tx.amount > 0 ? 'is-in' : ''}`}>{euro(Number(tx.amount), true)}</span>
              </div>
              {tx.purpose && <span className="text-label text-ink-muted">{tx.purpose}</span>}
              {tx.reason && <span className="text-label font-semibold text-warning">{tx.reason}</span>}
            </div>
            <div className={`hb-fin-chips ${wide ? 'is-wall' : ''}`} role="group" aria-label="Kategorie">
              {(cats ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`hb-fin-pick ${picked === c.id ? 'is-on' : ''}`}
                  style={{ ['--cat' as string]: `var(--${c.color})` }}
                  aria-pressed={picked === c.id}
                  onClick={() => setPicked(c.id)}
                >
                  <Icon icon={iconOf(c.icon)} size={16} />
                  {c.name}
                </button>
              ))}
            </div>
            {picked ? (
              <div className="hb-fin-always">
                <span className="font-semibold text-ink">Immer so für {name}?</span>
                <span className="text-label text-ink-muted">Künftige Buchungen landen dann direkt in {cats?.find((c) => c.id === picked)?.name}.</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="lg" disabled={busy} onClick={() => save(false)}>
                    Nur diesmal
                  </Button>
                  <Button variant="primary" size="lg" disabled={busy} onClick={() => save(true)}>
                    Immer so
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setSkipped((s) => [...s, tx.id])}>
                  Überspringen
                </Button>
                <Button variant="ghost" onClick={onLater}>
                  Später
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
