// Erinnerungen per Web Push (nur Handys).
//   POST {action:'send'}  + Header x-cron-key → fällige Todo-Erinnerungen verschicken (Cron jede Minute)
//   GET  ?action=key      → öffentlicher Schlüssel für die Anmeldung im Browser (nur Mitglieder)
//   POST {action:'test'}  → Test-Mitteilung an die eigenen Handys (nur Mitglieder)
// Die VAPID-Schlüssel erzeugt die Function beim ersten Aufruf selbst und legt sie in push_config ab.
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'

const db = adminClient()
// Kontaktangabe für die Push-Dienste (Pflicht bei VAPID): die Adresse der App, keine E-Mail
const CONTACT = 'https://jonthemaster.github.io/Haushaltsboard/'
const APP_URL = 'https://jonthemaster.github.io/Haushaltsboard/'
/** Ältere, verpasste Erinnerungen (z. B. Cron lag still) nicht mehr nachschicken */
const MAX_LATE_MS = 6 * 60 * 60 * 1000

type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string }
type Payload = { title: string; body: string; tag: string; url: string }

let server: { app: webpush.ApplicationServer; publicKey: string } | null = null

async function appServer() {
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

/** An alle angegebenen Handys schicken; abgemeldete Handys (Push-Dienst sagt „weg“) entfernen */
async function pushTo(subs: Sub[], payload: Payload): Promise<number> {
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

function berlinTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

async function sendDue(): Promise<unknown> {
  const { data: mod } = await db.from('modules').select('enabled').eq('id', 'erinnerungen').maybeSingle()
  const now = new Date()
  // Erst als erinnert markieren, dann schicken: so kommt keine Mitteilung doppelt
  const { data: due, error } = await db
    .from('todos')
    .update({ reminded_at: now.toISOString() })
    .lte('remind_at', now.toISOString())
    .is('reminded_at', null)
    .is('done_at', null)
    .select('id, title, assignee, remind_at')
  if (error) throw error
  if (!due?.length || mod?.enabled === false) return { due: due?.length ?? 0, sent: 0 }

  const [{ data: subs }, { data: members }] = await Promise.all([
    db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth'),
    db.from('members').select('id, is_board'),
  ])
  // nie ans Wand-Tablet
  const board = new Set((members ?? []).filter((m) => m.is_board).map((m) => m.id))
  const phones = (subs ?? []).filter((s) => !board.has(s.member_id))

  let sent = 0
  for (const t of due) {
    if (now.getTime() - new Date(t.remind_at!).getTime() > MAX_LATE_MS) continue
    // zuständige Person; bei „Offen“ beide
    const to = phones.filter((s) => !t.assignee || s.member_id === t.assignee)
    sent += await pushTo(to, {
      title: t.title,
      body: `${berlinTime(t.remind_at!)} Uhr${t.assignee ? '' : ' · Offen, wer Zeit hat'}`,
      tag: `todo-${t.id}`,
      url: APP_URL,
    })
  }
  return { due: due.length, sent }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const url = new URL(req.url)

  try {
    // Cron: geschützt über den geheimen Schlüssel aus push_config
    const cronKey = req.headers.get('x-cron-key')
    if (cronKey) {
      const { data } = await db.from('push_config').select('cron_key').eq('id', 1).single()
      if (!data || cronKey !== data.cron_key) return new Response('Nicht erlaubt', { status: 403 })
      return Response.json(await sendDue())
    }

    const member = await memberId(req)
    if (!member) return json(req, { error: 'Nicht angemeldet' }, 401)

    if (req.method === 'GET' && url.searchParams.get('action') === 'key') {
      return json(req, { publicKey: (await appServer()).publicKey })
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.action === 'test') {
        const { data: subs } = await db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth').eq('member_id', member)
        const sent = await pushTo(subs ?? [], {
          title: 'Erinnerungen sind an',
          body: 'So sieht eine Erinnerung vom Haushaltsboard aus.',
          tag: 'test',
          url: APP_URL,
        })
        return json(req, { sent })
      }
    }
    return json(req, { error: 'Unbekannte Aktion' }, 400)
  } catch (e) {
    console.error(e)
    return json(req, { error: 'Erinnerungen gerade nicht erreichbar' }, 500)
  }
})
