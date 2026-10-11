import { Check, Timer as TimerIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import { useNow } from '../../lib/time'
import { iconOf } from './nfcStore'

/** So lange bleibt die Karte nach dem Ende stehen („Fertig“), dann verschwindet sie */
const SHOW_DONE_MIN = 15

type Timer = { id: string; label: string; icon: string; started_at: string; ends_at: string; cancelled_at: string | null }

const hhmm = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Laufende (und gerade fertig gewordene) Timer, live */
function useTimers(): Timer[] {
  const [timers, setTimers] = useState<Timer[]>([])
  const load = useCallback(async () => {
    const since = new Date(Date.now() - SHOW_DONE_MIN * 60_000).toISOString()
    const { data } = await supabase
      .from('timers')
      .select('id, label, icon, started_at, ends_at, cancelled_at')
      .is('cancelled_at', null)
      .gt('ends_at', since)
      .order('ends_at')
    setTimers(data ?? [])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`timers-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timers' }, load)
      .subscribe()
    // nach dem Aufwachen (Tablet aus, App im Hintergrund) neu laden
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])
  return timers
}

/** Restzeit lesbar: „2:14 Std“, „14 Min“, „gleich“ */
function remaining(ms: number): { value: string; unit: string } {
  const min = Math.ceil(ms / 60_000)
  if (min <= 1) return { value: 'gleich', unit: '' }
  if (min < 60) return { value: String(min), unit: 'Min' }
  return { value: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`, unit: 'Std' }
}

/**
 * Timer aus einem NFC-Tag (z. B. Waschmaschine): an der Wand in der Kopfzeile, am Handy oben auf Start.
 * Ring und Restzeit laufen mit; am Ende kurz „Fertig“ in Grün (Push und Todo macht der Server). Antippen beendet den Timer.
 */
export function TimerHeader(_: { variant: 'wall' | 'phone' }) {
  const timers = useTimers()
  const now = useNow(15_000).getTime()
  const visible = timers.filter((t) => Date.parse(t.ends_at) > now - SHOW_DONE_MIN * 60_000)
  if (!visible.length) return null

  async function stop(t: Timer, done: boolean) {
    if (!done && !confirm(`${t.label} beenden? Dann kommt keine Mitteilung.`)) return
    await supabase.from('timers').update({ cancelled_at: new Date().toISOString() }).eq('id', t.id)
  }

  return (
    <>
      {visible.map((t) => {
        const start = Date.parse(t.started_at)
        const end = Date.parse(t.ends_at)
        const done = end <= now
        const share = done ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)))
        const left = remaining(end - now)
        return (
          <button
            key={t.id}
            type="button"
            className={`hb-meal-card hb-timer-card hb-slot-item ${done ? 'is-done' : ''}`}
            data-kind="meal"
            aria-label={done ? `${t.label} ist fertig, antippen blendet aus` : `${t.label}, noch ${left.value} ${left.unit}, antippen beendet den Timer`}
            onClick={() => stop(t, done)}
          >
            <span className="hb-tcard-ring" style={{ ['--share' as string]: share }}>
              <svg viewBox="0 0 64 64" aria-hidden="true" className="hb-tcard-ring-svg">
                <circle cx="32" cy="32" r="28" className="hb-tcard-ring-track" />
                <circle cx="32" cy="32" r="28" className="hb-tcard-ring-fill" pathLength={1} />
              </svg>
              <Icon icon={done ? Check : iconOf(t.icon) ?? TimerIcon} size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="hb-meal-card-when">{done ? `Fertig seit ${hhmm(t.ends_at)}` : `Fertig um ${hhmm(t.ends_at)}`}</span>
              <span className="hb-meal-card-title">{t.label}</span>
            </span>
            {!done && (
              <span className="hb-timer-left">
                <b>{left.value}</b>
                {left.unit && <span>{left.unit}</span>}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}
