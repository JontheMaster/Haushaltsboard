// Bring!-Einkaufsliste. GET liefert die Liste, POST hakt ab oder setzt zurück.
// Inoffizielle API, Endpunkte und Header wie im npm-Paket bring-shopping (genutzt von bring-mcp).
import { adminClient, corsHeaders, json, requireMember } from '../_shared/http.ts'

const API = 'https://api.getbring.com/rest/v2/'
const BASE_HEADERS = {
  'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
  'X-BRING-CLIENT': 'webApp',
  'X-BRING-CLIENT-SOURCE': 'webApp',
  'X-BRING-COUNTRY': 'DE',
}

type Session = { user_uuid: string; access_token: string; expires_at: string; list_uuid: string | null; list_name: string | null }
type Item = { name: string; specification: string }

const db = adminClient()

async function login(): Promise<Session> {
  const resp = await fetch(`${API}bringauth`, {
    method: 'POST',
    body: new URLSearchParams({ email: Deno.env.get('BRING_EMAIL')!, password: Deno.env.get('BRING_PASSWORD')! }),
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(`Bring!-Login fehlgeschlagen: ${data.message ?? resp.status}`)

  const session: Session = {
    user_uuid: data.uuid,
    access_token: data.access_token,
    // eine Stunde Puffer vor dem Ablauf
    expires_at: new Date(Date.now() + ((data.expires_in ?? 3600) - 3600) * 1000).toISOString(),
    list_uuid: null,
    list_name: null,
  }
  await db.from('bring_session').upsert({ id: 1, ...session })
  return session
}

async function getSession(forceLogin = false): Promise<Session> {
  if (!forceLogin) {
    const { data } = await db.from('bring_session').select('*').eq('id', 1).maybeSingle()
    if (data && new Date(data.expires_at) > new Date()) return data
  }
  return login()
}

function headers(s: Session, form = false): Record<string, string> {
  return {
    ...BASE_HEADERS,
    'X-BRING-USER-UUID': s.user_uuid,
    Authorization: `Bearer ${s.access_token}`,
    ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
  }
}

// Ruft Bring! auf; ist der Token abgelaufen, einmal neu anmelden und wiederholen
async function call(build: (s: Session) => Promise<Response>): Promise<{ s: Session; resp: Response }> {
  let s = await getSession()
  let resp = await build(s)
  if (resp.status === 401) {
    s = await getSession(true)
    resp = await build(s)
  }
  if (!resp.ok) throw new Error(`Bring! antwortet mit ${resp.status}`)
  return { s, resp }
}

// Listen-UUID zur konfigurierten Liste („Zuhause“) finden und merken
async function listUuid(): Promise<{ s: Session; uuid: string }> {
  const { data: mod } = await db.from('modules').select('config').eq('id', 'einkauf').maybeSingle()
  const wanted = (mod?.config as { list_name?: string } | null)?.list_name ?? 'Zuhause'

  const s = await getSession()
  if (s.list_uuid && s.list_name === wanted) return { s, uuid: s.list_uuid }

  const { s: s2, resp } = await call((x) => fetch(`${API}bringusers/${x.user_uuid}/lists`, { headers: headers(x) }))
  const { lists } = (await resp.json()) as { lists: { listUuid: string; name: string }[] }
  const list = lists.find((l) => l.name === wanted)
  if (!list) throw new Error(`Liste „${wanted}“ gibt es in Bring! nicht`)

  await db.from('bring_session').update({ list_uuid: list.listUuid, list_name: wanted }).eq('id', 1)
  return { s: s2, uuid: list.listUuid }
}

async function getItems() {
  const { uuid } = await listUuid()
  const { resp } = await call((s) => fetch(`${API}bringlists/${uuid}`, { headers: headers(s) }))
  const data = (await resp.json()) as { purchase: Item[]; recently: Item[] }
  const pick = (i: Item) => ({ name: i.name, specification: i.specification ?? '' })
  return { items: data.purchase.map(pick), recent: data.recently.map(pick) }
}

// complete: auf „Zuletzt gekauft“ verschieben. add: (wieder) auf die Liste setzen, z. B. für Rückgängig.
async function change(action: 'complete' | 'add', name: string, specification: string) {
  const { uuid } = await listUuid()
  const body = new URLSearchParams({
    purchase: action === 'add' ? name : '',
    recently: action === 'complete' ? name : '',
    specification: action === 'add' ? specification : '',
    remove: '',
    sender: 'null',
  })
  await call((s) => fetch(`${API}bringlists/${uuid}`, { method: 'PUT', headers: headers(s, true), body }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const denied = await requireMember(req)
  if (denied) return denied

  try {
    if (req.method === 'GET') return json(req, await getItems())

    if (req.method === 'POST') {
      const { action, name, specification = '' } = await req.json()
      if (!['complete', 'add'].includes(action) || typeof name !== 'string' || !name) {
        return json(req, { error: 'action (complete|add) und name nötig' }, 400)
      }
      await change(action, name, specification)
      return json(req, await getItems())
    }

    return json(req, { error: 'Methode nicht erlaubt' }, 405)
  } catch (e) {
    console.error(e)
    return json(req, { error: 'Bring! gerade nicht erreichbar' }, 502)
  }
})
