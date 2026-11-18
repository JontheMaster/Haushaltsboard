// Deutsche Kartenbilder hochladen (Wunsch Jonathan 18.11.2026).
// Jonathan legt die Bilder aus dem Wiki in scripts/dominion/karten-de/ ab (nicht im Repo): ein Ordner pro Erweiterung
// (Name siehe FOLDERS), Dateiname = englischer Kartenname, z. B. „Throne Room.jpg“. Unterordner mit „_“ am Anfang
// (z. B. „_alle deutschen Versionen“) werden übersprungen.
// Das Script ordnet jede Datei einer Karte aus src/modules/dominion/data/cards.json zu und legt sie als card/<id>.jpg
// in den privaten Bucket „dominion“ (Edge Function dominion-images, PUT). Die englischen Bilder werden dabei ersetzt.
//
//   DOMINION_UPLOAD_TOKEN=nfc_… node scripts/dominion/upload-karten-de.mjs [--dry]
// Token = eigener Kurzbefehl-Token (Alle Funktionen → NFC-Tags); nie ins Repo.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'scripts/dominion/karten-de'
const URL_ = 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/dominion-images'
// Ordnername (ohne Nummer vorn, klein) → Erweiterung in cards.json
const FOLDERS = {
  basisspiel: 'baseset',
  intrige: 'intrigue',
  seaside: 'seaside',
  'die alchemisten': 'alchemy',
  alchemisten: 'alchemy',
  bluetezeit: 'prosperity',
  blütezeit: 'prosperity',
  'reiche ernte': 'guildscornucopia',
  'die gilden': 'guildscornucopia',
  hinterland: 'hinterlands',
  'dark ages': 'darkages',
  abenteuer: 'adventures',
  empires: 'empires',
  nocturne: 'nocturne',
  renaissance: 'renaissance',
  menagerie: 'menagerie',
  verbündete: 'allies',
  plunder: 'plunder',
  'aufgehende sonne': 'risingsun',
  promo: 'promos',
}

const dry = process.argv.includes('--dry')
const token = process.env.DOMINION_UPLOAD_TOKEN
if (!dry && !token) throw new Error('DOMINION_UPLOAD_TOKEN fehlt (Kurzbefehl-Token nfc_…)')

const cards = JSON.parse(readFileSync('src/modules/dominion/data/cards.json', 'utf8'))
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const setOf = (folder) => {
  const name = folder
    .replace(/^\d+\s*/, '')
    .replace(/\s*\d\.\s*edition$/i, '')
    .trim()
    .toLowerCase()
  return Object.entries(FOLDERS).find(([k]) => name.startsWith(k))?.[1]
}

const jobs = []
const missing = []
for (const folder of readdirSync(ROOT)) {
  if (folder.startsWith('_') || !statSync(join(ROOT, folder)).isDirectory()) continue
  const set = setOf(folder)
  if (!set) {
    missing.push(`${folder}/ (Erweiterung unbekannt, in FOLDERS ergänzen)`)
    continue
  }
  for (const file of readdirSync(join(ROOT, folder))) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue
    const n = norm(file.replace(/\.[^.]+$/, ''))
    const card = cards.find((c) => c.set === set && norm(c.name_en) === n) ?? cards.find((c) => c.set === set && norm(c.name_de) === n)
    if (card) jobs.push({ file: join(ROOT, folder, file), id: card.id })
    else missing.push(`${folder}/${file}`)
  }
}

console.log(`${jobs.length} Bilder zugeordnet, ${missing.length} nicht:`)
missing.forEach((m) => console.log(`  - ${m}`))
if (dry) process.exit(0)

let ok = 0
for (const j of jobs) {
  const res = await fetch(`${URL_}?path=card/${j.id}.jpg`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'content-type': /\.png$/i.test(j.file) ? 'image/png' : 'image/jpeg' },
    body: readFileSync(j.file),
  })
  if (res.ok) ok++
  else console.log(`Fehler ${res.status} bei ${j.file}: ${(await res.text()).slice(0, 120)}`)
}
console.log(`${ok} von ${jobs.length} hochgeladen.`)
