// Bring!-Einkaufsliste. GET liefert die Liste, POST hakt ab, setzt zurück oder fügt hinzu.
// Anbindung an Bring!: ../_shared/bring.ts
import { addItems, change, getItems, parseItems } from '../_shared/bring.ts'
import { corsHeaders, json, requireMember } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const denied = await requireMember(req)
  if (denied) return denied

  try {
    if (req.method === 'GET') return json(req, await getItems())

    if (req.method === 'POST') {
      const { action, name, specification = '', text } = await req.json()
      // freier Text aus dem Eingabefeld, z. B. „Milch, 2 Liter“ oder „Milch und Eier“
      if (action === 'addText' && typeof text === 'string' && text.trim()) {
        await addItems(parseItems(text))
        return json(req, await getItems())
      }
      if (!['complete', 'add'].includes(action) || typeof name !== 'string' || !name) {
        return json(req, { error: 'action (complete|add|addText) und name bzw. text nötig' }, 400)
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
