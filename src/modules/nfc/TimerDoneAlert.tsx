import { BellRing, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useNow } from '../../lib/time'
import { ring, unlockAudio } from '../meals/alarm'
import { iconOf } from './nfcStore'
import { useTimers, type Timer } from './TimerHeader'
import { useAlarmSound } from './useAlarmSound'

/** Nur Timer melden, die gerade erst abgelaufen sind (nicht beim Neuladen Stunden später) */
const FRESH_MS = 3 * 60_000
/** So oft klingelt es, bis jemand tippt (alle 15 s, höchstens 1 Minute) */
const RING_EVERY_MS = 15_000
const RING_MAX = 5
/** Danach verschwindet die Meldung von selbst */
const SHOW_MS = 5 * 60_000
const SEEN_KEY = 'hb-timer-alerted'

function seen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), id].slice(-20)))
  } catch {
    // ohne Gerätespeicher meldet ein Neuladen ggf. noch einmal
  }
}

/**
 * Wand-Tablet: Ist ein Timer (z. B. Waschmaschine) abgelaufen, meldet sich das Board einmal laut
 * mit einer großen Karte und Signalton, auch über Bildschirmschoner und Nachtmodus. Antippen schließt sie.
 */
export function TimerDoneAlert() {
  const timers = useTimers()
  const now = useNow(5_000).getTime()
  const [shown, setShown] = useState<Timer | null>(null)
  const alerted = useRef(new Set<string>(seen()))
  useAlarmSound()

  // Ton freischalten: Tablets spielen Ton erst nach einer Berührung (beim nächsten Tippen irgendwo auf dem Board)
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio)
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  // gerade abgelaufen und noch nicht gemeldet → melden
  useEffect(() => {
    if (shown) return
    const done = timers.find((t) => {
      const end = Date.parse(t.ends_at)
      return end <= now && now - end < FRESH_MS && !alerted.current.has(t.id)
    })
    if (!done) return
    alerted.current.add(done.id)
    markSeen(done.id)
    setShown(done)
  }, [timers, now, shown])

  // klingeln, bis jemand tippt; nach 5 Minuten von selbst weg
  useEffect(() => {
    if (!shown) return
    let count = 0
    const chime = () => {
      if (count++ < RING_MAX) ring()
    }
    chime()
    navigator.vibrate?.([300, 150, 300])
    const i = setInterval(chime, RING_EVERY_MS)
    const t = setTimeout(() => setShown(null), SHOW_MS)
    return () => {
      clearInterval(i)
      clearTimeout(t)
    }
  }, [shown])

  if (!shown) return null
  return (
    <div className="hb-timer-alert" role="alertdialog" aria-label={`${shown.label} ist fertig`} onClick={() => setShown(null)}>
      <div className="hb-timer-alert-card">
        <span className="hb-timer-alert-icon">
          <Icon icon={iconOf(shown.icon)} size={56} />
          <span className="hb-timer-alert-check">
            <Icon icon={Check} size={22} />
          </span>
        </span>
        <span className="hb-timer-alert-when">
          <Icon icon={BellRing} size={18} />
          Fertig
        </span>
        <h2 className="hb-timer-alert-title">{shown.done_text || `${shown.label} ist fertig`}</h2>
        {shown.todo_title && <p className="hb-timer-alert-todo">Neues Todo: {shown.todo_title}</p>}
        <span className="hb-timer-alert-hint">Antippen schließt</span>
      </div>
    </div>
  )
}
