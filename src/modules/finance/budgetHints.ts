// Budget-Vorschläge und Tendenzen (12.10.2026, Wunsch Jonathan). Rechnet nur im Browser aus fin_overview.history:
// pro Kategorie die letzten 6 vollen Monate (nach Auswertungs-Monat) und die letzten 8 vollen Wochen.
import type { Overview, OverviewCategory } from './Analysis'

export type BudgetHint = { kind: 'new' | 'lower' | 'raise'; cat: OverviewCategory; value: number; text: string }
export type Trend = { cat: OverviewCategory; dir: 'up' | 'down'; recent: number; before: number }

const up10 = (n: number) => Math.max(10, Math.ceil(n / 10) * 10)
const euro0 = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`
function p75(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.75))]
}
function addMonths(m: string, n: number): string {
  const d = new Date(`${m}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 8) + '01'
}

/** Volle Monate mit Daten (der erste Monat fehlt meist halb und zählt nicht), älteste zuerst */
export function fullMonths(o: Overview, catId: string): number[] {
  const h = o.history?.find((x) => x.id === catId)
  if (!h || !o.first_month) return []
  return h.months.filter((_, i) => addMonths(o.month, i - h.months.length) > o.first_month!)
}

/**
 * Neue Budgets: Kategorien ohne Budget mit mind. 2 vollen Monaten, Ø ab 20 €, nicht fest (Miete, Versicherung:
 * Schwankung unter 10 % brauchen kein Budget). Vorschlag = 75 %-Wert, auf 10 € aufgerundet (ein normaler Monat passt rein).
 * Anpassen: 3 Monate klar darunter (≤ 80 %) → senken; 2 von 3 Monaten drüber → erhöhen.
 */
export function budgetHints(o: Overview): BudgetHint[] {
  const out: BudgetHint[] = []
  for (const c of o.categories) {
    const vals = fullMonths(o, c.id)
    if (vals.length < 2) continue
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    if (!c.budget) {
      // feste Beträge (meist gleich, z. B. Miete, Handy, Versicherung) brauchen kein Budget
      const med = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)]
      const fixed = vals.filter((v) => Math.abs(v - med) <= med * 0.05).length >= vals.length * 0.66
      if (avg < 20 || fixed) continue
      out.push({ kind: 'new', cat: c, value: up10(p75(vals)), text: `Ø ${euro0(avg)} in ${vals.length} Monaten` })
      continue
    }
    const last = vals.slice(-3)
    if (last.length < 3) continue
    const over = last.filter((v) => v > c.budget!).length
    if (over >= 2) {
      const value = up10(p75(last))
      if (value > c.budget) out.push({ kind: 'raise', cat: c, value, text: `${over} der letzten 3 Monate drüber (bis ${euro0(Math.max(...last))})` })
    } else if (last.every((v) => v <= c.budget! * 0.8)) {
      const value = up10(Math.max(...last) * 1.05)
      if (value <= c.budget - 10) out.push({ kind: 'lower', cat: c, value, text: `3 Monate klar darunter (höchstens ${euro0(Math.max(...last))})` })
    }
  }
  const rank = { raise: 0, lower: 1, new: 2 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.value - a.value)
}

/**
 * Tendenz über Wochen: letzte 4 Wochen gegen die 4 davor, ab ±25 % und 20 € Unterschied. Nur wenn die Buchungen bis
 * in die letzte Woche reichen (sonst sähe eine Import-Lücke wie „sinkt“ aus) und jede Hälfte mind. 2 Wochen mit
 * Ausgaben hat (ein Großeinkauf oder Urlaub allein ist keine Tendenz).
 */
export function trends(o: Overview): Trend[] {
  const out: Trend[] = []
  const lastDay = o.daily?.[o.daily.length - 1]?.[0]
  if (!lastDay) return out
  const friday = new Date()
  friday.setUTCHours(12, 0, 0, 0)
  friday.setUTCDate(friday.getUTCDate() - ((friday.getUTCDay() + 6) % 7) - 3)
  // Daten müssen mindestens bis zum Freitag der letzten vollen Woche reichen
  if (lastDay < friday.toISOString().slice(0, 10)) return out
  for (const c of o.categories) {
    const w = o.history?.find((x) => x.id === c.id)?.weeks
    if (!w || w.length < 8) continue
    const before = w.slice(0, 4).reduce((s, v) => s + v, 0)
    const recent = w.slice(4).reduce((s, v) => s + v, 0)
    if (w.slice(0, 4).filter((v) => v > 0).length < 2 || w.slice(4).filter((v) => v > 0).length < 2) continue
    if (Math.abs(recent - before) < 20 || before <= 0) continue
    const change = (recent - before) / before
    if (Math.abs(change) >= 0.25) out.push({ cat: c, dir: change > 0 ? 'up' : 'down', recent, before })
  }
  return out.sort((a, b) => Math.abs(b.recent - b.before) - Math.abs(a.recent - a.before)).slice(0, 3)
}
