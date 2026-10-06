// Bring!-Einkaufsliste „Zuhause“: laden, abhaken, hinzufügen. Genutzt von den Functions `bring` und `alexa`.
// Inoffizielle API, Endpunkte und Header wie im npm-Paket bring-shopping (genutzt von bring-mcp).
import { adminClient } from './http.ts'

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

// Secret lesen; Leerzeichen und versehentliche Anführungszeichen entfernen
function secret(name: string): string {
  const raw = Deno.env.get(name)
  if (!raw) throw new Error(`Secret ${name} fehlt`)
  return raw.trim().replace(/^["']|["']$/g, '')
}

async function login(): Promise<Session> {
  const email = secret('BRING_EMAIL')
  const resp = await fetch(`${API}bringauth`, {
    method: 'POST',
    body: new URLSearchParams({ email, password: secret('BRING_PASSWORD') }),
  })
  const text = await resp.text()
  let data: Record<string, string>
  try {
    data = JSON.parse(text)
  } catch {
    // Diagnose ohne den Inhalt preiszugeben
    throw new Error(`Bring!-Login fehlgeschlagen (${resp.status}): ${text.slice(0, 80)} · BRING_EMAIL hat ${email.length} Zeichen, enthält @: ${email.includes('@')}`)
  }
  if (!resp.ok || data.error) throw new Error(`Bring!-Login fehlgeschlagen: ${data.message ?? resp.status}`)

  const session: Session = {
    user_uuid: data.uuid,
    access_token: data.access_token,
    // eine Stunde Puffer vor dem Ablauf
    expires_at: new Date(Date.now() + ((Number(data.expires_in) || 7200) - 3600) * 1000).toISOString(),
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

export async function getItems() {
  const { uuid } = await listUuid()
  const { resp } = await call((s) => fetch(`${API}bringlists/${uuid}`, { headers: headers(s) }))
  const data = (await resp.json()) as { purchase: Item[]; recently: Item[] }
  const pick = (i: Item) => ({ name: i.name, specification: i.specification ?? '' })
  return { items: data.purchase.map(pick), recent: data.recently.map(pick) }
}

// complete: auf „Zuletzt gekauft“ verschieben. add: (wieder) auf die Liste setzen, z. B. für Rückgängig.
export async function change(action: 'complete' | 'add', name: string, specification: string) {
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

/**
 * Freier Text → Artikel für Bring!: „Milch, 2 Liter“ → Milch (2 Liter); „Milch und Eier“ → zwei Artikel.
 * Der Anfang wird großgeschrieben (so heißen die Artikel im Bring!-Katalog, dann gibt es das passende Bild).
 */
export function parseItems(text: string): { name: string; specification: string }[] {
  return text
    .split(/\s+und\s+|\s*;\s*|\s*\n\s*/i)
    .map((part) => {
      const [name, ...spec] = part.split(',')
      const n = name.trim()
      return { name: n.charAt(0).toUpperCase() + n.slice(1), specification: spec.join(',').trim() }
    })
    .filter((i) => i.name)
}

/** Artikel auf die Liste setzen (gibt es ihn schon, ändert Bring! nur den Zusatz) */
export async function addItems(items: { name: string; specification: string }[]) {
  for (const i of items) await change('add', i.name, i.specification)
}
