// Timer starten (z. B. Waschmaschine): genutzt von den Functions `nfc` (Sticker) und `alexa` (Sprache).
// Ein Timer mit demselben Namen ersetzt den laufenden. Das Ende (Push + Todo) erledigt `nfc` per Cron.
import { adminClient } from './http.ts'

const db = adminClient()

export type TimerAction = { id: string; label: string; icon: string; params: Record<string, unknown> }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Uhrzeit in Berlin, z. B. „17:40“ */
export const berlinHHMM = (d: Date) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

/** Startet den Timer einer NFC-Aktion vom Typ „timer“; `startedBy` = Mitglied (null bei Alexa) */
export async function startTimer(a: TimerAction, startedBy: string | null): Promise<{ ok: boolean; title: string; ends: Date | null; noDuration?: boolean }> {
  const p = a.params ?? {}
  const title = str(p.title) || a.label
  if (!Number(p.minutes)) return { ok: false, title, ends: null, noDuration: true }
  const minutes = Math.max(1, Math.min(24 * 60, Math.round(Number(p.minutes))))
  const now = new Date()
  const ends = new Date(now.getTime() + minutes * 60_000)
  await db.from('timers').update({ cancelled_at: now.toISOString() }).eq('label', title).is('finished_at', null).is('cancelled_at', null)
  const { error } = await db.from('timers').insert({
    label: title,
    icon: a.icon,
    started_at: now.toISOString(),
    ends_at: ends.toISOString(),
    started_by: startedBy,
    action_id: a.id,
    done_text: str(p.done_text),
    todo_title: str(p.todo_title) || null,
  })
  return { ok: !error, title, ends: error ? null : ends }
}
