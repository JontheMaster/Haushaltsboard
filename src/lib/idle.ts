import { useEffect, useState } from 'react'
import type { Tables } from './database.types'
import { berlinTime, useNow } from './time'

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** true, sobald `ms` lang niemand das Gerät berührt hat; jede Berührung setzt zurück */
export function useIdle(ms: number, enabled = true): [boolean, () => void] {
  const [idle, setIdle] = useState(false)
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let t = setTimeout(() => setIdle(true), ms)
    const touch = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), ms)
    }
    for (const e of ACTIVITY) window.addEventListener(e, touch, { passive: true, capture: true })
    return () => {
      clearTimeout(t)
      for (const e of ACTIVITY) window.removeEventListener(e, touch, { capture: true })
    }
  }, [ms, enabled, epoch])

  // von außen zurücksetzen (z. B. nach dem Schließen des Bildschirmschoners)
  const reset = () => {
    setIdle(false)
    setEpoch((x) => x + 1)
  }
  return [enabled && idle, reset]
}

/** Nachtzeit laut Einstellungen (z. B. 23:00–07:00, auch über Mitternacht) */
export function useIsNight(settings: Tables<'settings'> | null): boolean {
  const now = useNow(30_000)
  if (!settings) return false
  const { hh, mm } = berlinTime(now)
  const cur = `${hh}:${mm}`
  const from = settings.night_from.slice(0, 5)
  const to = settings.night_to.slice(0, 5)
  return from > to ? cur >= from || cur < to : cur >= from && cur < to
}
