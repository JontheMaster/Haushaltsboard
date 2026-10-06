// WLAN für Gäste: Daten (modules.config von „wlan“) und der Text im QR-Code
import { useModuleConfig } from '../useModules'

export type WifiConfig = { ssid: string; password: string; security: 'WPA' | 'nopass' }
const DEFAULTS: WifiConfig = { ssid: '', password: '', security: 'WPA' }

// Sonderzeichen im WLAN-QR-Format mit \ maskieren
const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')

/** Text für den QR-Code, den Handy-Kameras als WLAN erkennen */
export function wifiPayload(c: WifiConfig): string {
  return c.security === 'nopass' ? `WIFI:T:nopass;S:${esc(c.ssid)};;` : `WIFI:T:WPA;S:${esc(c.ssid)};P:${esc(c.password)};;`
}

export function useWifi(): WifiConfig {
  return useModuleConfig('wlan', DEFAULTS)
}
