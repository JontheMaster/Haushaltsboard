// Nowcast für unser Zuhause aus den Radarbildern (keine Imports, auch im Browser testbar).
// Grundlage: Mittelwert der 3 × 3 Pixel ums Zuhause, Regen ab 0,2 mm/h, vorbei nach 15 min (3 Bildern) trocken.
// Stärke: leicht < 2,5 mm/h, mäßig bis 10, stark darüber, Starkregen ab 15 mm/h (Warnschwelle DWD für 1 Stunde).

export type NowcastLevel = 'leicht' | 'mäßig' | 'stark' | 'Starkregen'
export type Nowcast = {
  state: 'dry' | 'soon' | 'now'
  /** Minuten bis Regenbeginn (nur bei soon) */
  start_min: number | null
  /** ungefähres Ende (ISO), null = hält über die 2 Stunden hinaus an */
  end_at: string | null
  level: NowcastLevel | null
  peak_mmh: number
  text: string
}

const WET_MMH = 0.2
const DRY_FRAMES_FOR_END = 3

export function levelOf(mmh: number): NowcastLevel {
  return mmh >= 15 ? 'Starkregen' : mmh > 10 ? 'stark' : mmh >= 2.5 ? 'mäßig' : 'leicht'
}

const hm = (iso: string) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(iso))

/**
 * series: mm/h am Zuhause pro Bild ab „jetzt“ (Index 0 = letztes gemessenes Bild), times: dazugehörige Zeitpunkte (ISO),
 * nowMs: aktuelle Uhrzeit (für „Regen in X min“).
 */
export function nowcast(series: number[], times: string[], nowMs: number): Nowcast {
  const wet = series.map((v) => v >= WET_MMH)
  const first = wet.indexOf(true)
  if (first < 0) return { state: 'dry', start_min: null, end_at: null, level: null, peak_mmh: 0, text: 'Die nächsten 2 Stunden trocken' }
  // Ende: erstes Bild nach Beginn, auf das mindestens 3 trockene folgen
  let end = -1
  for (let i = first + 1; i + DRY_FRAMES_FOR_END - 1 < series.length; i++) {
    if (wet.slice(i, i + DRY_FRAMES_FOR_END).every((w) => !w)) {
      end = i
      break
    }
  }
  const span = series.slice(first, end < 0 ? undefined : end)
  const peak = Math.max(...span)
  const level = levelOf(peak)
  const endAt = end < 0 ? null : times[end]
  const strength = level === 'Starkregen' ? 'Starkregen' : level
  if (first === 0) {
    const text = endAt ? `Es regnet, ${strength}, hört gegen ${hm(endAt)} auf` : `Es regnet, ${strength}, bleibt die nächsten 2 Stunden nass`
    return { state: 'now', start_min: 0, end_at: endAt, level, peak_mmh: Math.round(peak * 10) / 10, text }
  }
  const startMin = Math.max(1, Math.round((Date.parse(times[first]) - nowMs) / 60000))
  const lead = level === 'Starkregen' ? `Starkregen in ${startMin} min` : `Regen in ${startMin} min, ${level}`
  const text = endAt ? `${lead}, bis ca. ${hm(endAt)}` : `${lead}, hält länger an`
  return { state: 'soon', start_min: startMin, end_at: endAt, level, peak_mmh: Math.round(peak * 10) / 10, text }
}
