// Rezept per Link holen: liest die strukturierten Rezeptdaten (schema.org/Recipe, JSON-LD),
// die Chefkoch und die meisten Kochseiten mitliefern. Zutaten kommen als Text zurück,
// die App zerlegt sie in Menge, Einheit und Name. Das Bild kommt als Base64, die App verkleinert es.
import { corsHeaders, json, requireMember } from '../_shared/http.ts'

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const MAX_IMAGE = 8 * 1024 * 1024

type Imported = {
  title: string
  duration_min: number | null
  servings: number | null
  ingredients: string[]
  steps: string[]
  image: { data: string; type: string } | null
  source_url: string
}

// deno-lint-ignore no-explicit-any
type Node = any

/** PT1H30M → 90 */
function minutes(iso: unknown): number | null {
  if (typeof iso !== 'string') return null
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return null
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total > 0 ? total : null
}

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Alle Objekte aus den JSON-LD-Blöcken, inklusive @graph */
function nodes(html: string): Node[] {
  const out: Node[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      const data = JSON.parse(m[1].trim())
      const walk = (n: Node) => {
        if (Array.isArray(n)) return n.forEach(walk)
        if (n && typeof n === 'object') {
          out.push(n)
          if (n['@graph']) walk(n['@graph'])
        }
      }
      walk(data)
    } catch {
      // kaputter Block, nächster
    }
  }
  return out
}

function isRecipe(n: Node): boolean {
  const t = n['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

function steps(instr: Node): string[] {
  if (!instr) return []
  if (typeof instr === 'string') return decode(instr).split(/(?<=\.)\s+(?=[A-ZÄÖÜ])/).filter(Boolean)
  if (Array.isArray(instr)) return instr.flatMap(steps)
  if (instr.itemListElement) return steps(instr.itemListElement)
  if (instr.text) return [decode(String(instr.text))].filter(Boolean)
  if (instr.name) return [decode(String(instr.name))].filter(Boolean)
  return []
}

function imageUrl(img: Node): string | null {
  if (!img) return null
  if (typeof img === 'string') return img
  if (Array.isArray(img)) return imageUrl(img[0])
  return img.url ?? img.contentUrl ?? null
}

function servings(y: Node): number | null {
  const s = Array.isArray(y) ? y.map(String).join(' ') : y != null ? String(y) : ''
  const n = s.match(/\d+/)
  return n ? Number(n[0]) : null
}

function meta(html: string, prop: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, 'i'))
  return m ? decode(m[1]) : null
}

async function loadImage(url: string | null, base: string): Promise<Imported['image']> {
  if (!url) return null
  try {
    const res = await fetch(new URL(url, base), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length > MAX_IMAGE) return null
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return { data: btoa(bin), type: type.split(';')[0] }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const denied = await requireMember(req)
  if (denied) return denied

  const { url } = await req.json().catch(() => ({ url: null }))
  let target: URL
  try {
    target = new URL(String(url))
    if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error()
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(target.hostname)) throw new Error()
  } catch {
    return json(req, { error: 'Das ist kein gültiger Link.' }, 400)
  }

  let html: string
  try {
    const res = await fetch(target, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de' }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return json(req, { error: 'Die Seite hat nicht geantwortet.' }, 502)
    html = await res.text()
  } catch {
    return json(req, { error: 'Die Seite hat nicht geantwortet.' }, 502)
  }

  const r = nodes(html).find(isRecipe)
  if (!r) return json(req, { error: 'Auf der Seite steht kein Rezept, das die App lesen kann.' }, 422)

  const result: Imported = {
    title: decode(String(r.name ?? meta(html, 'og:title') ?? '')),
    duration_min: minutes(r.totalTime) ?? ((minutes(r.prepTime) ?? 0) + (minutes(r.cookTime) ?? 0) || null),
    servings: servings(r.recipeYield),
    ingredients: (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((s: unknown) => decode(String(s))).filter(Boolean),
    steps: steps(r.recipeInstructions),
    image: await loadImage(imageUrl(r.image) ?? meta(html, 'og:image'), target.href),
    source_url: target.href,
  }
  return json(req, result)
})
