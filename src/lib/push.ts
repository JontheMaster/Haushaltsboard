import { supabase } from './supabase'

// Web Push am Handy: Service Worker anmelden, Mitteilungen erlauben, Handy in push_subscriptions eintragen.

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iPhone/iPad: Push gibt es nur in der installierten App („Zum Home-Bildschirm“) */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** Beim Start der App: Service Worker registrieren (für Erinnerungen) */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Ist dieses Handy für Erinnerungen angemeldet? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  return (await reg?.pushManager.getSubscription()) ?? null
}

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || isIOS()) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  return 'Browser'
}

/** Mitteilungen erlauben und dieses Handy anmelden. Rückgabe: Fehlertext oder null */
export async function enablePush(memberId: string): Promise<string | null> {
  if (!pushSupported()) return 'Dieser Browser kann keine Mitteilungen.'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'Mitteilungen sind nicht erlaubt. Du kannst sie in den Einstellungen des Handys erlauben.'

  const { data } = await supabase.functions.invoke<{ publicKey: string }>('reminders?action=key', { method: 'GET' })
  if (!data?.publicKey) return 'Der Server ist gerade nicht erreichbar. Probier es gleich noch mal.'

  registerServiceWorker()
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) })

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { member_id: memberId, endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth, device: deviceName() },
    { onConflict: 'endpoint' },
  )
  return error ? 'Anmelden hat nicht geklappt. Probier es noch mal.' : null
}

/** Dieses Handy abmelden */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Test-Mitteilung an die eigenen Handys; Rückgabe: Anzahl verschickt */
export async function sendTestPush(): Promise<number> {
  const { data } = await supabase.functions.invoke<{ sent: number }>('reminders', { body: { action: 'test' } })
  return data?.sent ?? 0
}
