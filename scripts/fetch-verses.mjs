// Holt eine Auswahl ermutigender Verse aus der „Lesefassung“ der Offenen Bibel (offene-bibel.de, CC BY-SA 3.0)
// und schreibt sie nach src/modules/briefing/verses.json. Aufruf: node scripts/fetch-verses.mjs
// Verse ohne fertige Lesefassung fallen weg. Klammer-Alternativen (/a/b/) → erste Variante.
import { writeFileSync } from 'node:fs'

// [Seite im Wiki, Kapitel, Vers(e), Anzeige]
const REFS = [
  ['Psalm_4', 9], ['Psalm_16', 11], ['Psalm_23', 1], ['Psalm_23', 4], ['Psalm_27', 1], ['Psalm_31', 16], ['Psalm_34', 9],
  ['Psalm_37', 5], ['Psalm_46', 2], ['Psalm_55', 23], ['Psalm_62', 2], ['Psalm_73', 26], ['Psalm_90', 12], ['Psalm_91', 11],
  ['Psalm_103', 2], ['Psalm_118', 24], ['Psalm_119', 105], ['Psalm_121', 2], ['Psalm_121', 8], ['Psalm_139', 14], ['Psalm_36', 6],
  ['Psalm_42', 12], ['Psalm_57', 11], ['Psalm_86', 5], ['Psalm_100', 5], ['Psalm_145', 18], ['Psalm_147', 3],
  ['Josua_1', 9], ['Jesaja_40', 31], ['Jesaja_41', 10], ['Jesaja_43', 1], ['Jesaja_54', 10], ['Jeremia_29', 11], ['Klagelieder_3', 22],
  ['Micha_6', 8], ['Sprichwörter_3', 5], ['Sprichwörter_16', 3], ['Sprichwörter_17', 22], ['Kohelet_3', 1], ['Rut_1', 16],
  ['Zefanja_3', 17], ['Nahum_1', 7], ['Habakuk_3', 19],
  ['Matthäus_5', 9], ['Matthäus_5', 14], ['Matthäus_6', 34], ['Matthäus_7', 7], ['Matthäus_11', 28], ['Matthäus_28', 20],
  ['Markus_9', 23], ['Markus_10', 27], ['Lukas_1', 37], ['Lukas_6', 31], ['Johannes_8', 12], ['Johannes_13', 34],
  ['Johannes_14', 27], ['Johannes_15', 12], ['Johannes_16', 33], ['Römer_8', 28], ['Römer_8', 31], ['Römer_12', 12],
  ['Römer_15', 13], ['Römer_15', 7], ['1_Korinther_13', 13], ['1_Korinther_16', 14], ['2_Korinther_12', 9], ['Galater_6', 2],
  ['Galater_5', 22], ['Epheser_4', 32], ['Philipper_4', 4], ['Philipper_4', 6], ['Philipper_4', 13], ['Kolosser_3', 23],
  ['Kolosser_3', 14], ['1_Thessalonicher_5', 16], ['2_Timotheus_1', 7], ['Hebräer_13', 2], ['Hebräer_10', 35], ['Jakobus_1', 5],
  ['1_Petrus_5', 7], ['1_Johannes_4', 16], ['1_Johannes_4', 18], ['1_Johannes_3', 18],
]

const pretty = (page) => page.replace(/_/g, ' ').replace(/^(\d) /, '$1. ').replace('Sprichwörter', 'Sprüche')

function clean(s) {
  return s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<\/?poem>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\(\/([^/]+)\/[^)]*\/\)/g, '$1') // (/a/b/) → a
    .replace(/[⸂⸃⸀⸁]/g, '')
    .replace(/'''?/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Gottesname der Offenen Bibel (GOTT/ER, SEINEM …) in normale Schreibung */
function names(s) {
  return s
    .replace(/\bGOTTES\b/g, 'Gottes').replace(/\bGOTT\b/g, 'Gott').replace(/\bHERRN\b/g, 'Herrn').replace(/\bHERR\b/g, 'Herr')
    .replace(/\bSEINEM\b/g, 'seinem').replace(/\bSEINEN\b/g, 'seinen').replace(/\bSEINE\b/g, 'seine').replace(/\bSEIN\b/g, 'sein')
    .replace(/\bER\b/g, 'er').replace(/\bIHN\b/g, 'ihn').replace(/\bIHM\b/g, 'ihm')
}

const out = []
for (const [page, verse] of REFS) {
  try {
    const raw = await (await fetch(`https://offene-bibel.de/wiki/${encodeURIComponent(page)}?action=raw`)).text()
    if (!/\{\{Lesefassung\}\}/.test(raw) || /\{\{Lesefassung in Arbeit\}\}|Lesefassung (fehlt|in Arbeit)/.test(raw)) continue
    const lese = raw.split('{{Lesefassung}}')[1].split(/\{\{Bemerkungen\}\}|\{\{Studienfassung\}\}/)[0]
    const m = lese.match(new RegExp(`\\{\\{L\\|${verse}\\}\\}([\\s\\S]*?)(?=\\{\\{L\\|\\d+\\}\\}|$)`))
    if (!m) continue
    const text = names(clean(m[1]))
    if (text.length < 15 || text.length > 260 || /\(|\/|\{|\[/.test(text)) continue
    const [book, ch] = [pretty(page.replace(/_\d+$/, '')), page.match(/_(\d+)$/)[1]]
    out.push({ ref: `${book} ${ch},${verse}`, text })
    console.log('✓', `${book} ${ch},${verse}`, text)
  } catch (e) {
    console.log('✗', page, verse, e.message)
  }
}
writeFileSync(
  new URL('../src/modules/briefing/verses.json', import.meta.url),
  JSON.stringify({ source: 'Offene Bibel, Lesefassung (offene-bibel.de), CC BY-SA 3.0', verses: out }, null, 2) + '\n',
)
console.log(out.length, 'Verse')
