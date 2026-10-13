// Hintergrundkarte fürs Regenradar (docs/wetter-radar.md): einmalig aus OpenStreetMap (Overpass) holen,
// ins Radar-Raster (polarstereografisch, 1 km pro Pixel) umrechnen, vereinfachen und als JSON ablegen.
// Ausschnitt fest um die Stadtmitte (49,45 / 11,08 ± 40 km), unabhängig vom Zuhause.
// Aufruf: node --experimental-strip-types scripts/build-radar-map.mjs [--places-only]
//   --places-only: nur die Orte neu holen, Straßen/Flüsse/Grenzen aus der vorhandenen Datei behalten (kleine Abfrage)
// Daten: © OpenStreetMap-Mitwirkende (ODbL), Quellenzeile in der Kachel.
import { readFileSync, writeFileSync } from 'node:fs'
import { latLonToGrid } from '../supabase/functions/_shared/radarGrid.ts'

// Ausschnitt wie bei Bright Sky für lat 49.45, lon 11.08, distance 40000: bbox [top, left, bottom, right]
const BBOX = [741, 586, 821, 666]
const W = BBOX[3] - BBOX[1] + 1
const H = BBOX[2] - BBOX[0] + 1
// lat/lon-Rahmen etwas größer als der Ausschnitt (Ecken laut Bright Sky: 49.10–49.80 N, 10.54–11.62 E)
const LL = { s: 49.05, w: 10.45, n: 49.85, e: 11.7 }

const placesOnly = process.argv.includes('--places-only')
const OUT = new URL('../src/modules/clock-weather/radarMap.json', import.meta.url)
const box = `(${LL.s},${LL.w},${LL.n},${LL.e})`
const lines = [
  ...(placesOnly
    ? []
    : [
        `way["highway"="motorway"]${box};`,
        `way["waterway"="river"]${box};`,
        `way["waterway"="canal"]["name"~"Main-Donau"]${box};`,
        `relation["boundary"="administrative"]["admin_level"="6"]${box};`,
      ]),
  `node["place"~"^(city|town)$"]${box};`,
  `node["place"="village"]["name"~"^(Wendelstein|Schwarzenbruck|Cadolzburg|Heroldsberg|Schwaig bei Nürnberg|Rednitzhembach)$"]${box};`,
]
const query = `[out:json][timeout:120];\n(\n${lines.join('\n')}\n);\nout geom${box};`

// zwei öffentliche Overpass-Server, der zweite nur, wenn der erste überlastet ist
let data = null
for (const server of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
  const res = await fetch(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Haushaltsboard Radar-Karte (einmalig)' },
    body: 'data=' + encodeURIComponent(query),
  })
  if (res.ok) {
    data = await res.json()
    break
  }
  console.warn(`${server}: ${res.status}`)
}
if (!data) throw new Error('Overpass nicht erreichbar')

const toPx = (lat, lon) => {
  const g = latLonToGrid(lat, lon)
  // Bildkoordinaten: Pixel i deckt [i, i+1) ab, Mitte bei i + 0,5
  return [g.x - BBOX[1] + 0.5, g.y - BBOX[0] + 0.5]
}
const inside = ([x, y], pad = 3) => x >= -pad && y >= -pad && x <= W + pad && y <= H + pad

// Douglas-Peucker
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let max = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const d = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1)
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= tol) return [a, b]
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)]
}

// Linie in Stücke teilen, die im Ausschnitt liegen
function pieces(coords) {
  const out = []
  let cur = []
  for (const c of coords) {
    // außerhalb des Abfragerahmens liefert Overpass null: Linie dort unterbrechen
    if (!c) {
      if (cur.length > 1) out.push(cur)
      cur = []
      continue
    }
    const p = toPx(c.lat, c.lon)
    if (inside(p)) cur.push(p)
    else if (cur.length) {
      cur.push(p)
      out.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) out.push(cur)
  return out
}

const fmt = (n) => Math.round(n * 10) / 10
const toPath = (pts) => 'M' + pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')

const layers = { boundary: [], water: [], motorway: [] }
const places = []
for (const el of data.elements) {
  if (el.type === 'node' && el.tags?.name) {
    const [x, y] = toPx(el.lat, el.lon)
    if (inside([x, y], -2)) places.push({ name: el.tags.name, x: fmt(x), y: fmt(y), kind: el.tags.place, pop: Number(el.tags.population) || 0 })
    continue
  }
  if (el.type === 'way' && el.geometry) {
    const layer = el.tags.highway === 'motorway' ? 'motorway' : 'water'
    for (const p of pieces(el.geometry)) layers[layer].push(simplify(p, 0.25))
  }
  if (el.type === 'relation' && el.members) {
    for (const m of el.members) if (m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === '')) for (const p of pieces(m.geometry)) layers.boundary.push(simplify(p, 0.3))
  }
}

// Orte sparsam und fest gewählt (Reihenfolge = Wichtigkeit), Namen gekürzt („Lauf an der Pegnitz“ → „Lauf“)
const WANTED = ['Nürnberg', 'Fürth', 'Erlangen', 'Schwabach', 'Roth', 'Lauf an der Pegnitz', 'Forchheim', 'Neumarkt in der Oberpfalz', 'Herzogenaurach', 'Feucht']
// nur in der nahen Ansicht (kleinere Orte rund um Nürnberg)
const NEAR = ['Zirndorf', 'Stein', 'Wendelstein', 'Schwarzenbruck', 'Röthenbach an der Pegnitz', 'Cadolzburg', 'Heroldsberg', 'Schwaig bei Nürnberg', 'Rednitzhembach']
const short = (n) => n.replace(/\s+(in der|an der|am|im)\s.+$/, '')
const pick = (list, near) =>
  list
    .map((w) => places.find((p) => p.name === w))
    .filter(Boolean)
    .map((p) => ({ ...p, name: short(p.name).replace(/ bei .+$/, ''), near }))
const chosen = [...pick(WANTED, false), ...pick(NEAR, true)]

// nur Orte: Linien aus der vorhandenen Datei übernehmen
const prev = placesOnly ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const out = {
  // © OpenStreetMap-Mitwirkende (ODbL)
  bbox: BBOX,
  width: W,
  height: H,
  boundary: prev ? prev.boundary : layers.boundary.filter((p) => p.length > 1).map(toPath).join(''),
  water: prev ? prev.water : layers.water.filter((p) => p.length > 1).map(toPath).join(''),
  motorway: prev ? prev.motorway : layers.motorway.filter((p) => p.length > 1).map(toPath).join(''),
  places: chosen.map(({ name, x, y, kind, near }) => ({ name, x, y, kind, near })),
}
writeFileSync(OUT, JSON.stringify(out))
console.log(`Karte: ${JSON.stringify(out).length} Zeichen, Orte: ${out.places.map((p) => `${p.name} (${p.x}/${p.y})`).join(', ')}`)
