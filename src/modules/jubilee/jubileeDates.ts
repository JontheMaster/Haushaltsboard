// Jubiläen: wie lange ihr zusammen seid und welche Tage besonders sind.
// Gefeiert werden (Entscheidung Jonathan 7.10.2026): Jahrestage, Monatstage, runde Tage (alle 100), Schnapszahlen (1.111, 2.222 …).
import { addDays } from '../../lib/time'
import { useModuleConfig } from '../useModules'

const DEFAULTS: { since: string } = { since: '' }

/** Zusammen-seit-Datum (YYYY-MM-DD) aus modules.config von „jubilaeum“, leer = noch nicht eingetragen */
export function useSince(): string {
  return useModuleConfig('jubilaeum', DEFAULTS).since
}

const parts = (day: string) => day.split('-').map(Number) as [number, number, number]
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export function daysTogether(since: string, day: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${since}T12:00:00Z`)) / 86_400_000)
}

/** Volle Monate seit dem Start (der 31. zählt in kürzeren Monaten am Monatsletzten) */
export function monthsTogether(since: string, day: string): number {
  const [sy, sm, sd] = parts(since)
  const [y, m, d] = parts(day)
  let months = (y - sy) * 12 + (m - sm)
  if (d < Math.min(sd, lastDayOfMonth(y, m))) months--
  return Math.max(0, months)
}

const fmt = (n: number) => n.toLocaleString('de-DE')

/** Schnapszahl: mindestens vier gleiche Ziffern, z. B. 1111 oder 22222 */
const isRepdigit = (n: number) => n >= 1111 && /^(\d)\1+$/.test(String(n))

export type Jubilee = { kind: 'years' | 'days' | 'repdigit' | 'months'; text: string }

/** Was an diesem Tag gefeiert wird, das Wichtigste zuerst (leer = normaler Tag) */
export function jubileesOn(since: string, day: string): Jubilee[] {
  if (!since || day <= since) return []
  const days = daysTogether(since, day)
  const [sy, sm, sd] = parts(since)
  const [y, m, d] = parts(day)
  const months = (y - sy) * 12 + (m - sm)
  const isMonthDay = months > 0 && d === Math.min(sd, lastDayOfMonth(y, m))
  const out: Jubilee[] = []
  if (isMonthDay && months % 12 === 0) {
    const years = months / 12
    out.push({ kind: 'years', text: years === 1 ? '1 Jahr zusammen' : `${years} Jahre zusammen` })
  }
  if (isRepdigit(days)) out.push({ kind: 'repdigit', text: `${fmt(days)} Tage zusammen, eine Schnapszahl` })
  else if (days % 100 === 0) out.push({ kind: 'days', text: `${fmt(days)} Tage zusammen` })
  if (isMonthDay && months % 12 !== 0) out.push({ kind: 'months', text: months === 1 ? '1 Monat zusammen' : `${months} Monate zusammen` })
  return out
}

/** Die nächsten besonderen Tage ab morgen (für die Einstellungen) */
export function upcoming(since: string, from: string, count = 4): { day: string; jubilee: Jubilee }[] {
  const out: { day: string; jubilee: Jubilee }[] = []
  for (let i = 1; i <= 800 && out.length < count; i++) {
    const day = addDays(from, i)
    const j = jubileesOn(since, day)
    if (j.length) out.push({ day, jubilee: j[0] })
  }
  return out
}

/** „7. Oktober 2024“ */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
}

export { fmt as formatNumber }
