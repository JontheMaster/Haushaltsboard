import { AlertCircle, BarChart3, Clock, LayoutList, LineChart, Store, Target } from 'lucide-react'
import { ImportHint } from './FinanceBits'
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { BalanceView, BudgetRing, catForecast, catVar, monthName, pct, shopName, signed, totalForecast, unusual, type Overview } from './Analysis'
import { isFixedCat } from './budgetHints'
import { euro, iconOf, useFinNames } from './finStore'

const euro0 = (n: number, sign = false) => {
  const s = `${Math.round(Math.abs(n)).toLocaleString('de-DE')} €`
  return sign ? `${n > 0 ? '+' : n < 0 ? '−' : '±'}${s}` : n < 0 ? `−${s}` : s
}

function Card({
  icon,
  title,
  extra,
  className = '',
  children,
}: {
  icon: typeof Store
  title: string
  extra?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`hb-tile hb-wf-card ${className}`}>
      <header className="hb-wf-head">
        <Icon icon={icon} size={20} />
        <h2>{title}</h2>
        {extra}
      </header>
      {children}
    </section>
  )
}

/**
 * Haushalt an der Wand (12.10.2026, überarbeitet nach Jonathans Wunsch: schöner, ruhig auch mehr Zahlen).
 * Oben vier Kennzahlen, darunter Kategorien mit Beträgen, Verlauf mit Zahlen, Auffällig/Budgets/Wo, unten Wann.
 * Nur Haushalt und Summen, keine einzelnen Buchungen; Einnahmen nur als Summe (keine Namen).
 */
export function WallHome({ o, after }: { o: Overview; after?: ReactNode }) {
  const { nameOf } = useFinNames()
  const current = o.days_passed < o.days_in_month
  const fc = totalForecast(o)
  const spentDiff = pct(current ? fc : o.total_spent, o.total_avg3)
  const incAvg = o.total_income_avg3 ?? 0
  const incDiff = pct(o.total_income, incAvg)
  const left = o.total_income - o.total_spent
  // „pro Tag“ nur für das Veränderliche (ohne Miete, WLAN, Abos)
  const variable = o.categories.filter((c) => !isFixedCat(o, c.id)).reduce((t, c) => t + c.spent, 0)
  const perDay = variable / Math.max(1, o.days_passed)
  // auch Kategorien ohne Ausgaben in diesem Monat, wenn sie sonst etwas kosten (z. B. Freizeit 0 € statt Ø 232 €)
  const cats = o.categories
    .filter((c) => c.spent > 0 || c.budget || c.avg3 >= 10)
    .sort((a, b) => b.spent - a.spent || b.avg3 - a.avg3)
    .slice(0, 9)
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.spent, c.avg3, c.budget ?? 0)))
  const notes = unusual(o)
  const budgets = o.categories.filter((c) => c.budget)
  const month = monthName(o.month)
  // Verlauf: 12 Monate oder Kontostand (wie am Handy); an der Wand nach 2 Minuten wieder 12 Monate
  const [mode, setMode] = useState<'monate' | 'konto'>('monate')
  const canBalance = (o.daily?.length ?? 0) > 1
  const showBalance = mode === 'konto' && canBalance
  useEffect(() => {
    if (mode === 'monate') return
    const t = setTimeout(() => setMode('monate'), 120_000)
    return () => clearTimeout(t)
  }, [mode])

  return (
    <div className="hb-wf">
      <ImportHint wall />
      <div className="hb-wf-kpis">
        <div className="hb-tile hb-wf-kpi">
          <span className="hb-wf-kpi-label">Ausgaben im {month}</span>
          <span className="hb-wf-kpi-value">{euro0(o.total_spent)}</span>
          <span className="hb-wf-kpi-sub">
            {spentDiff !== null && <b className={spentDiff > 10 ? 'text-urgent' : spentDiff < -5 ? 'text-success' : ''}>{signed(spentDiff)}</b>}
            {current ? ` Prognose ${euro0(fc)}` : ''} · Schnitt {euro0(o.total_avg3)}
          </span>
        </div>
        <div className="hb-tile hb-wf-kpi">
          <span className="hb-wf-kpi-label">Einnahmen im {month}</span>
          <span className="hb-wf-kpi-value is-in">{euro0(o.total_income)}</span>
          <span className="hb-wf-kpi-sub">
            {incDiff !== null && <b className={incDiff < -5 ? 'text-urgent' : ''}>{signed(incDiff)}</b>} Schnitt {euro0(incAvg)}
          </span>
        </div>
        <div className="hb-tile hb-wf-kpi">
          <span className="hb-wf-kpi-label">Übrig</span>
          <span className={`hb-wf-kpi-value ${left >= 0 ? 'is-in' : 'is-out'}`}>{euro0(left, true)}</span>
          <span className="hb-wf-kpi-sub">Einnahmen minus Ausgaben</span>
        </div>
        <div className="hb-tile hb-wf-kpi">
          <span className="hb-wf-kpi-label">Pro Tag</span>
          <span className="hb-wf-kpi-value">{euro0(perDay)}</span>
          <span className="hb-wf-kpi-sub">ohne feste Kosten{current ? ` · noch ${o.days_in_month - o.days_passed} Tage` : ''}</span>
        </div>
      </div>

      {/* drei Spalten, die sich ungefähr gleich füllen: Kategorien + Wo | Verlauf + Wann | Auffällig + Budgets */}
      <div className="hb-wf-main">
        <div className="hb-wf-stack">
          <Card icon={LayoutList} title="Kategorien" className="hb-wf-cats" extra={<span className="hb-wf-head-note">Ø = Schnitt 3 Monate</span>}>
            <ul className="hb-wf-catlist">
              {cats.map((c) => {
                const d = pct(c.spent, c.avg3)
                const over = c.budget ? c.spent > c.budget : false
                return (
                  <li key={c.id} className="hb-wf-cat" style={catVar(c)}>
                    <span className="hb-wf-cat-icon">
                      <Icon icon={iconOf(c.icon)} size={18} />
                    </span>
                    <span className="hb-wf-cat-name">{c.name}</span>
                    <span className="hb-wf-cat-bar">
                      {c.avg3 > 0 && <i className="hb-wf-cat-avg" style={{ left: `${(c.avg3 / maxCat) * 100}%` }} />}
                      {c.budget && <i className="hb-wf-cat-budget" style={{ left: `${(c.budget / maxCat) * 100}%` }} />}
                      <b className={over ? 'is-over' : ''} style={{ width: `${(c.spent / maxCat) * 100}%` }} />
                    </span>
                    <span className="hb-wf-cat-sum">{euro0(c.spent)}</span>
                    <span className="hb-wf-cat-meta">
                      {c.budget ? `von ${euro0(c.budget)}` : `Ø ${euro0(c.avg3)}`}
                      {d !== null && c.spent > 0 && <em className={d >= 20 ? 'is-high' : d <= -20 ? 'is-low' : ''}>{signed(d)}</em>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
          {o.merchants.length > 0 && (
            <Card icon={Store} title="Wo · 90 Tage">
              <ol className="hb-wf-where">
                {o.merchants.slice(0, 5).map((m) => (
                  <li key={m.name}>
                    <span className="truncate">{nameOf(m.name) ?? shopName(m.name)}</span>
                    <b>{euro0(m.sum)}</b>
                    <small>
                      {m.n}× · Ø {euro(m.avg)}
                    </small>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
        <div className="hb-wf-stack">
          <Card
            icon={showBalance ? LineChart : BarChart3}
            title="Verlauf"
            className="hb-wf-months"
            extra={
              canBalance && (
                <div className="hb-seg is-small" role="group" aria-label="Ansicht">
                  <button type="button" aria-pressed={!showBalance} className={!showBalance ? 'is-on' : ''} onClick={() => setMode('monate')}>
                    12 Monate
                  </button>
                  <button type="button" aria-pressed={showBalance} className={showBalance ? 'is-on' : ''} onClick={() => setMode('konto')}>
                    Kontostand
                  </button>
                </div>
              )
            }
          >
            {showBalance ? <BalanceView o={o} height={210} /> : <WallMonths o={o} />}
          </Card>
          {o.heatmap_n >= 5 && (
            <Card icon={Clock} title="Wann wird eingekauft" className="hb-wf-when">
              <WallHeat o={o} />
            </Card>
          )}
        </div>
        <div className="hb-wf-stack">
          {notes.length > 0 && (
            <Card icon={AlertCircle} title="Auffällig">
              {notes.slice(0, 3).map((n) => (
                <div key={n.title} className={`hb-fin-note is-${n.tone}`}>
                  <b>{n.title}</b>
                  <span>{n.text}</span>
                </div>
              ))}
            </Card>
          )}
          {budgets.length > 0 && (
            <Card icon={Target} title="Budgets">
              <div className="hb-wf-rings">
                {budgets.slice(0, 4).map((c) => (
                  <div key={c.id} className="hb-wf-ring">
                    <BudgetRing value={(c.spent / (c.budget ?? 1)) * 100} size={66} />
                    <span>{c.name}</span>
                    <small>
                      {euro0(c.spent)} / {euro0(c.budget ?? 0)}
                      {current ? ` · Prognose ${euro0(catForecast(o, c))}` : ''}
                    </small>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {after}
    </div>
  )
}

/** 12 Monate: Ausgaben (Balken) und Einnahmen (schmaler Balken daneben), Beträge darüber */
function WallMonths({ o }: { o: Overview }) {
  const max = Math.max(1, ...o.months.flatMap((m) => [m.spent, m.income]))
  const short = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k` : `${Math.round(n)}`)
  const label = (m: string) => new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}T12:00:00Z`)).replace('.', '')
  const withData = o.months.filter((m) => m.spent > 0 || m.income > 0)
  const avgLeft = withData.length ? withData.reduce((t, m) => t + m.income - m.spent, 0) / withData.length : 0
  return (
    <>
      <div className="hb-wf-chart">
        {o.months.map((m, i) => (
          <div key={m.month} className={`hb-wf-col ${i === o.months.length - 1 ? 'is-now' : ''}`}>
            <span className="hb-wf-col-val">{m.spent > 0 ? short(m.spent) : ''}</span>
            <div className="hb-wf-col-bars">
              <b style={{ height: `${(m.spent / max) * 100}%`, animationDelay: `${i * 40}ms` }} />
              <i style={{ height: `${(m.income / max) * 100}%`, animationDelay: `${i * 40 + 20}ms` }} />
            </div>
            <span className="hb-wf-col-label">{label(m.month)}</span>
          </div>
        ))}
      </div>
      <div className="hb-wf-legend">
        <span>
          <b className="is-out" /> Ausgaben
        </span>
        <span>
          <b className="is-in" /> Einnahmen
        </span>
        <span className="flex-1" />
        <span>
          Ø übrig pro Monat <strong className={avgLeft >= 0 ? 'text-success' : 'text-urgent'}>{euro0(avgLeft, true)}</strong>
        </span>
      </div>
    </>
  )
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7)

function WallHeat({ o }: { o: Overview }) {
  const get = (d: number, h: number) => o.heatmap.find((x) => x.dow === d && x.hour === h)?.n ?? 0
  const max = Math.max(1, ...o.heatmap.map((x) => x.n))
  const peak = [...o.heatmap].sort((a, b) => b.n - a.n)[0]
  const byDay = DAYS.map((_, i) => o.heatmap.filter((x) => x.dow === i + 1).reduce((t, x) => t + x.n, 0))
  const topDay = byDay.indexOf(Math.max(...byDay))
  return (
    <>
      <div className="hb-wf-heat">
        <span />
        {HOURS.map((h) => (
          <span key={h} className="hb-wf-heat-h">
            {h % 3 === 1 ? h : ''}
          </span>
        ))}
        {DAYS.map((d, di) => (
          <div key={d} className="contents">
            <span className="hb-wf-heat-d">{d}</span>
            {HOURS.map((h) => {
              const n = get(di + 1, h)
              return <span key={h} className="hb-wf-heat-c" style={{ opacity: n ? 0.2 + (n / max) * 0.8 : 0.07 }} />
            })}
          </div>
        ))}
      </div>
      <span className="hb-wf-head-note">
        {o.heatmap_n} Kartenzahlungen · meist {['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'][topDay]}
        {peak ? `, am häufigsten ${DAYS[peak.dow - 1]} ${peak.hour}–${peak.hour + 1} Uhr` : ''}
      </span>
    </>
  )
}
