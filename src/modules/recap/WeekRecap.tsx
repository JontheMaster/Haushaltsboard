import { CalendarCheck, ChevronLeft, ChevronRight, Image, ListChecks, Sparkles, Trophy, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { CountUp } from '../../components/CountUp'
import { PersonChip } from '../../components/PersonChip'
import { useMembers } from '../../lib/members'
import { addDays, dayLabel, mondayOf, useToday } from '../../lib/time'
import { closeRecap, useRecap, useRecapOpen, type Recap } from './recapStore'

const DAY_NAMES: Record<string, string> = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' }

/** „29. Sep. – 5. Okt.“ */
function range(from: string, to: string): string {
  const fmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${fmt.format(new Date(`${from}T12:00:00Z`))} – ${fmt.format(new Date(`${to}T12:00:00Z`))}`
}

/** Wochenrückblick als Vollbild (Wand und Handy); mit Pfeilen in frühere Wochen blättern */
export function WeekRecap() {
  const isOpen = useRecapOpen()
  if (!isOpen) return null
  return <RecapScreen />
}

function RecapScreen() {
  const today = useToday()
  const thisWeek = mondayOf(today)
  const [week, setWeek] = useState(thisWeek)
  const recap = useRecap(week)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRecap()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="hb-recap" role="dialog" aria-modal="true" aria-label="Wochenrückblick">
      <header className="hb-recap-head">
        <span className="hb-tile-icon">
          <Icon icon={Trophy} size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate font-display text-title text-ink">Eure Woche</h2>
          <span className="text-label text-ink-muted">{range(week, addDays(week, 6))}</span>
        </div>
        <button type="button" className="hb-icon-btn" aria-label="Woche davor" onClick={() => setWeek(addDays(week, -7))}>
          <Icon icon={ChevronLeft} size={22} />
        </button>
        <button type="button" className="hb-icon-btn" aria-label="Woche danach" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>
          <Icon icon={ChevronRight} size={22} />
        </button>
        <button type="button" className="hb-icon-btn" aria-label="Schließen" onClick={closeRecap}>
          <Icon icon={X} size={22} />
        </button>
      </header>
      <div className="hb-recap-body">
        {recap === null ? (
          <p className="text-body text-ink-muted">Einen Moment …</p>
        ) : recap === 'error' ? (
          <p className="text-body text-ink-muted">Der Rückblick lässt sich gerade nicht laden. Probier es gleich noch mal.</p>
        ) : (
          <RecapContent recap={recap} />
        )}
      </div>
    </div>
  )
}

function Card({ icon, title, children, className = '' }: { icon: LucideIcon; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`hb-tile hb-tile-static hb-recap-card-box ${className}`}>
      <h3 className="hb-recap-card-title">
        <Icon icon={icon} size={18} />
        {title}
      </h3>
      {children}
    </section>
  )
}

function RecapContent({ recap }: { recap: Recap }) {
  const { people, byId, personKey } = useMembers()
  const done = recap.todos.done + recap.chores.done
  const diff = done - recap.prev_done
  const max = Math.max(1, ...Object.values(recap.by))
  const rows = [
    ...people.map((p) => ({ id: p.id, name: p.name, key: personKey(p.id), n: recap.by[p.id] ?? 0 })),
    // ohne Namen erledigt (z. B. per Alexa)
    ...(recap.by.open ? [{ id: 'open', name: 'Ohne Namen', key: 'open' as const, n: recap.by.open }] : []),
  ]

  return (
    <>
      <section className="hb-recap-hero">
        <span className="hb-recap-big">
          <CountUp value={done} />
        </span>
        <span className="flex flex-col">
          <span className="font-display text-title text-ink">{done === 1 ? 'Sache erledigt' : 'Sachen erledigt'}</span>
          <span className="text-body text-ink-muted">
            {recap.todos.done} {recap.todos.done === 1 ? 'Todo' : 'Todos'} · {recap.chores.done} {recap.chores.done === 1 ? 'Putzaufgabe' : 'Putzaufgaben'}
            {recap.prev_done > 0 || done > 0 ? ` · ${diff === 0 ? 'so viel wie letzte Woche' : `${Math.abs(diff)} ${diff > 0 ? 'mehr' : 'weniger'} als letzte Woche`}` : ''}
          </span>
        </span>
      </section>

      <div className="hb-recap-grid">
        <Card icon={CalendarCheck} title="Wer hat was geschafft">
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <PersonChip person={r.key} name={r.name} />
                  <span className="text-body font-semibold text-ink tabular-nums">
                    <CountUp value={r.n} delay={400} />
                  </span>
                </span>
                <span className="hb-recap-bar">
                  <span className={`hb-recap-bar-fill hb-person-${r.key}`} style={{ width: `${(r.n / max) * 100}%`, minWidth: r.n ? undefined : 0 }} />
                </span>
              </li>
            ))}
          </ul>
          {recap.best_day && (
            <p className="text-label text-ink-muted">
              Fleißigster Tag: {DAY_NAMES[dayLabel(recap.best_day.day).slice(0, 2)]} mit {recap.best_day.n} erledigt
            </p>
          )}
        </Card>

        <Card icon={UtensilsCrossed} title={`Gekocht${recap.meals.length ? ` · ${recap.meals.length}` : ''}`}>
          {recap.meals.length ? (
            <ul className="flex flex-col gap-1">
              {recap.meals.map((m, i) => (
                <li key={i} className="hb-recap-line">
                  <span className="hb-recap-day">{dayLabel(m.day)}</span>
                  <span className="min-w-0 truncate">{m.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">Noch nichts gekocht.</p>
          )}
        </Card>

        <Card icon={ListChecks} title={`Erledigte Todos${recap.todos.done ? ` · ${recap.todos.done}` : ''}`}>
          {recap.todos.items.length ? (
            <ul className="flex flex-col gap-1">
              {recap.todos.items.map((t, i) => (
                <li key={i} className="hb-recap-line">
                  <span className="hb-recap-day">{dayLabel(t.day)}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.done_by && byId.get(t.done_by) && (
                    <span className={`hb-recap-dot hb-person-${personKey(t.done_by)}`} title={byId.get(t.done_by)!.name} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">Keine Todos abgehakt.</p>
          )}
        </Card>

        <Card icon={Sparkles} title={`Putzplan${recap.chores.done ? ` · ${recap.chores.done}` : ''}`}>
          {recap.chores.items.length ? (
            <ul className="flex flex-col gap-1">
              {recap.chores.items.map((c) => (
                <li key={c.title} className="hb-recap-line">
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.n > 1 && <span className="text-label text-ink-muted tabular-nums">{c.n}×</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">Nichts geputzt, was im Plan steht.</p>
          )}
        </Card>
      </div>

      <p className="hb-recap-foot">
        {recap.open > 0 ? `${recap.open} ${recap.open === 1 ? 'Sache ist' : 'Sachen sind'} aus dieser Woche noch offen.` : 'Alles, was diese Woche fällig war, ist erledigt.'}
        {recap.photos > 0 && (
          <>
            {' '}
            <Icon icon={Image} size={16} className="inline align-[-3px]" /> {recap.photos} neue {recap.photos === 1 ? 'Foto' : 'Fotos'}.
          </>
        )}
      </p>
    </>
  )
}
