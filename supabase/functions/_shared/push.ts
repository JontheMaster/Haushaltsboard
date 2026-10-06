// Web Push an Handys (VAPID-Schlüssel liegen in push_config, beim ersten Mal erzeugt).
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { adminClient } from './http.ts'

const db = adminClient()
// Kontaktangabe für die Push-Dienste (Pflicht bei VAPID): die Adresse der App, keine E-Mail
const CONTACT = 'https://jonthemaster.github.io/Haushaltsboard/'
export const APP_URL = 'https://jonthemaster.github.io/Haushaltsboard/'

export type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string }
export type Payload = { title: string; body: string; tag: string; url: string }

let server: { app: webpush.ApplicationServer; publicKey: string } | null = null

export async function appServer() {
  if (server) return server
  const { data } = await db.from('push_config').select('vapid').eq('id', 1).single()
  let keys: CryptoKeyPair
  if (data?.vapid) {
    keys = await webpush.importVapidKeys(data.vapid as webpush.ExportedVapidKeys, { extractable: false })
  } else {
    // erster Aufruf: Schlüssel erzeugen und speichern
    const fresh = await webpush.generateVapidKeys({ extractable: true })
    await db.from('push_config').update({ vapid: await webpush.exportVapidKeys(fresh) }).eq('id', 1)
    keys = fresh
  }
  const app = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: keys })
  server = { app, publicKey: await webpush.exportApplicationServerKey(keys) }
  return server
}

/** Handys von Mitgliedern (nie das Wand-Tablet) */
export async function phonesOf(memberIds: string[] | null): Promise<Sub[]> {
  const [{ data: subs }, { data: members }] = await Promise.all([
    db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth'),
    db.from('members').select('id, is_board'),
  ])
  const board = new Set((members ?? []).filter((m) => m.is_board).map((m) => m.id))
  return (subs ?? []).filter((s) => !board.has(s.member_id) && (!memberIds || memberIds.includes(s.member_id)))
}

/** An alle angegebenen Handys schicken; abgemeldete Handys (Push-Dienst sagt „weg“) entfernen */
export async function pushTo(subs: Sub[], payload: Payload): Promise<number> {
  const { app } = await appServer()
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await app
          .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(JSON.stringify(payload), { ttl: 60 * 60 })
        sent++
      } catch (e) {
        if (e instanceof webpush.PushMessageError && e.isGone()) {
          await db.from('push_subscriptions').delete().eq('id', s.id)
        } else {
          console.error('Push fehlgeschlagen', s.id, e)
        }
      }
    }),
  )
  return sent
}
