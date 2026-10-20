import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Nur die eigene Seite darf die Functions aus dem Browser aufrufen
const ALLOWED_ORIGINS = ['https://jonthemaster.github.io', 'http://localhost:5173']

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// Service-Client: umgeht RLS, nur serverseitig
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

// Geprüfte Anmeldungen merken (pro Function-Instanz): Die Wand fragt alle paar Sekunden nach, und jede Prüfung
// kostete zwei Anfragen (Auth + members). So nur einmal pro Anmeldung, höchstens 10 Min bzw. bis der Token abläuft.
const CHECK_MS = 10 * 60_000
const checked = new Map<string, { id: string; until: number }>()

function tokenExpiry(auth: string): number {
  try {
    const part = auth.replace(/^Bearer\s+/i, '').split('.')[1]
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

async function checkMember(auth: string): Promise<string | null> {
  const hit = checked.get(auth)
  if (hit && hit.until > Date.now()) return hit.id
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: user } = await userClient.auth.getUser()
  if (!user.user) return null
  // members ist per RLS nur für Mitglieder lesbar: eine Zeile zurück = Mitglied
  const { data } = await userClient.from('members').select('id').eq('id', user.user.id).maybeSingle()
  if (!data?.id) return null
  const exp = tokenExpiry(auth)
  if (checked.size > 200) checked.clear()
  checked.set(auth, { id: data.id, until: Math.min(Date.now() + CHECK_MS, exp || Date.now() + CHECK_MS) })
  return data.id
}

// Prüft, ob der Aufrufer ein Mitglied des Haushalts ist. Gibt sonst eine fertige Fehlerantwort zurück.
export async function requireMember(req: Request): Promise<Response | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return json(req, { error: 'Nicht angemeldet' }, 401)
  if (!(await checkMember(auth))) return json(req, { error: 'Nicht angemeldet oder kein Mitglied' }, 401)
  return null
}

// Wie requireMember, gibt aber die ID des Mitglieds zurück (oder null)
export async function memberId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  return checkMember(auth)
}
