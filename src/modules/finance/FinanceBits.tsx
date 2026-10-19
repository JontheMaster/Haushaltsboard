import { PiggyBank, Upload } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { useSettings } from '../../lib/settings'
import { useEnabledModules } from '../useModules'
import { monthName, useOverview, type Overview, type OverviewCategory } from './Analysis'
import { IMPORT_HINT_OVER, requestImport, useFinProfile, useImportStatus } from './finStore'
import { useDevice } from '../../lib/device'

const euro0 = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`
const euro2 = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

/**
 * Haushaltszahlen für andere Module (Einkauf, Morgen-Briefing), 12.10.2026: nur wenn Finanzen an ist, kein Besuch da
 * ist und (am Handy) die Person Finanzen für sich eingeschaltet hat. Nur Summen des Haushalts, alle 10 Minuten neu.
 */
export function useHomeFinance(): Overview | null {
  const { me } = useMembers()
  const { profile } = useFinProfile(me.id)
  const { settings } = useSettings()
  const enabled = useEnabledModules()
  const ok = !!enabled?.has('finanzen') && !settings?.visit_mode && (me.is_board || !!profile?.enabled)
  const { data } = useOverview(null, true, 10 * 60_000, ok)
  return ok ? data : null
}

const daysLeft = (o: Overview) => Math.max(1, o.days_in_month - o.days_passed + 1)

/** Schmale Zeile unten in der Einkauf-Kachel: Lebensmittel diesen Monat (mit Budget: wie viel noch übrig ist) */
export function GroceryLine() {
  const o = useHomeFinance()
  const c = o?.categories.find((x) => x.id === 'lebensmittel')
  if (!o || !c || (!c.spent && !c.budget)) return null
  const left = c.budget ? c.budget - c.spent : null
  const share = c.budget ? Math.min(1, c.spent / c.budget) : null
  return (
    <div className={`hb-grocery-line ${left !== null && left < 0 ? 'is-over' : share !== null && share >= 0.9 ? 'is-near' : ''}`}>
      <span className="hb-grocery-text">
        <Icon icon={PiggyBank} size={16} />
        Lebensmittel im {monthName(o.month)}: <b>{euro0(c.spent)}</b>
        {c.budget ? ` von ${euro0(c.budget)}` : c.avg3 ? ` · Ø ${euro0(c.avg3)}` : ''}
        {left !== null && (left >= 0 ? ` · noch ${euro0(left)}` : ` · ${euro0(-left)} drüber`)}
      </span>
      {share !== null && (
        <span className="hb-grocery-bar" aria-hidden="true">
          <i style={{ width: `${share * 100}%` }} />
        </span>
      )}
    </div>
  )
}

function budgetLine(o: Overview, c: OverviewCategory): string {
  const left = (c.budget ?? 0) - c.spent
  if (left < 0) return `${euro0(-left)} über dem Budget`
  return `noch ${euro0(left)} · ${euro2(left / daysLeft(o))} pro Tag`
}

/** Karte im Morgen-Briefing: Budgets des Haushalts, wie viel bis Monatsende pro Tag bleibt */
export function BriefingBudgetCard({ style }: { style?: CSSProperties }) {
  const o = useHomeFinance()
  const list = (o?.categories ?? []).filter((c) => c.budget).sort((a, b) => b.spent / (b.budget ?? 1) - a.spent / (a.budget ?? 1))
  if (!o || !list.length) return null
  return (
    <div className="hb-brief-card" style={style}>
      <span className="hb-brief-badge">
        <Icon icon={PiggyBank} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h2>Budget</h2>
        <ul>
          {list.slice(0, 3).map((c) => (
            <li key={c.id} className="hb-brief-event">
              <span className="hb-brief-time">{c.name}</span>
              <span className={`min-w-0 truncate ${c.spent > (c.budget ?? 0) ? 'text-urgent' : ''}`}>{budgetLine(o, c)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * Import-Erinnerung (20.10.2026): ab 7 Tagen über der Frist dezent „Letzter Import vor 37 Tagen“ (warning, ohne Betrag).
 * Handy: nur der eigene Stand, Antippen öffnet den Import. Wand: alle Personen mit Finanzen, ohne Antippen.
 */
export function ImportHint({ wall = false }: { wall?: boolean }) {
  const { me } = useMembers()
  const { settings } = useSettings()
  const enabled = useEnabledModules()
  const { goTab } = useDevice()
  const status = useImportStatus()
  if (!enabled?.has('finanzen') || settings?.visit_mode || !status) return null
  const late = status.filter((s) => s.over >= IMPORT_HINT_OVER && (wall || s.member === me.id))
  if (!late.length) return null
  if (!wall) {
    const s = late[0]
    return (
      <button
        type="button"
        className="hb-fin-import-hint"
        onClick={() => {
          requestImport()
          goTab?.('finanzen')
        }}
      >
        <Icon icon={Upload} size={16} />
        Letzter Import vor {s.days} Tagen
      </button>
    )
  }
  return (
    <div className="hb-fin-import-hints">
      {late.map((s) => (
        <span key={s.member} className="hb-fin-import-hint">
          <Icon icon={Upload} size={16} />
          {status.length > 1 ? `${s.name}: letzter Import vor ${s.days} Tagen` : `Letzter Import vor ${s.days} Tagen`}
        </span>
      ))}
    </div>
  )
}
