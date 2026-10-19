import { useEffect } from 'react'
import { setAlarmSound } from '../meals/alarm'
import { useModuleConfig } from '../useModules'

const DEFAULTS: { timer_sound?: string } = {}

/** Gewählten Timer-Ton aus den Einstellungen (NFC-Tags → Ton für fertige Timer) übernehmen */
export function useAlarmSound() {
  const { timer_sound } = useModuleConfig('nfc', DEFAULTS)
  useEffect(() => setAlarmSound(timer_sound), [timer_sound])
}
