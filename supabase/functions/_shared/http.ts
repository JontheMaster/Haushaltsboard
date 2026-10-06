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

// Prüft, ob der Aufrufer ein Mitglied des Haushalts ist. Gibt sonst eine fertige Fehlerantwort zurück.
export async function requireMember(req: Request): Promise<Response | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return json(req, { error: 'Nicht angemeldet' }, 401)

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: user } = await userClient.auth.getUser()
  if (!user.user) return json(req, { error: 'Nicht angemeldet' }, 401)

  // members ist per RLS nur für Mitglieder lesbar: eine Zeile zurück = Mitglied
  const { data } = await userClient.from('members').select('id').eq('id', user.user.id).maybeSingle()
  if (!data) return json(req, { error: 'Kein Mitglied' }, 403)
  return null
}

// Wie requireMember, gibt aber die ID des Mitglieds zurück (oder null)
export async function memberId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: user } = await userClient.auth.getUser()
  if (!user.user) return null
  const { data } = await userClient.from('members').select('id').eq('id', user.user.id).maybeSingle()
  return data?.id ?? null
}
