// Termine aller Kalender von Montag dieser Woche bis Sonntag nächster Woche (Europe/Berlin).
// Im Besuchsmodus fehlen versteckte Kalender ganz. Laden und Aufräumen: ../_shared/calendar.ts
import { loadEvents } from '../_shared/calendar.ts'
import { corsHeaders, json, requireMember } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'GET') return json(req, { error: 'Methode nicht erlaubt' }, 405)

  const denied = await requireMember(req)
  if (denied) return denied

  return json(req, await loadEvents())
})
