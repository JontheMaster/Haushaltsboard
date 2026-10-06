// Termine knapper anzeigen: bekannte Arten werden zum Icon, der Titel verliert das Füllwort.
// „Sabrina Geburtstag“ → [Torte] Sabrina, „Training - U18“ → [Hantel] U18. Nur Anzeige, der Kalender bleibt unverändert.
import {
  Briefcase,
  Cake,
  Church,
  Dumbbell,
  Stethoscope,
  TreePalm,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Icon } from '../../components/Icon'

type Rule = {
  /** erkennt die Art des Termins */
  match: RegExp
  icon: LucideIcon
  /** Wort für Screenreader und als Kurzform, wenn der Titel nicht passt (z. B. „Arzt“) */
  label: string
  /** ganze Wörter, die aus dem Titel entfallen (samt Trennern daneben) */
  strip: string[]
}

// Reihenfolge zählt: die erste passende Regel gewinnt
const RULES: Rule[] = [
  { match: /geburtstag|\bgeb\.|\bbday\b/i, icon: Cake, label: 'Geburtstag', strip: ['Geburtstag', 'Geb.', 'Bday'] },
  { match: /livestream/i, icon: Video, label: 'Livestream', strip: ['Livestream'] },
  { match: /^termin\b|arzt|ärztin|praxis|\bmvz\b|radiolog|zahnarzt/i, icon: Stethoscope, label: 'Arzt', strip: ['Termin', 'MVZ'] },
  { match: /training/i, icon: Dumbbell, label: 'Training', strip: ['Training'] },
  { match: /büro|office/i, icon: Briefcase, label: 'Arbeit', strip: ['Büro', 'Office'] },
  { match: /gottesdienst|synode|andacht/i, icon: Church, label: 'Kirche', strip: ['Gottesdienst', 'Andacht'] },
  // „Treffen“ nur als eigenes Wort (nicht in „Nachtreffen“), dazu Versammlungen
  { match: /(^|\s)(treffen|meeting|sitzung)(\s|$)|versammlung/i, icon: Users, label: 'Treffen', strip: ['Treffen', 'Meeting', 'Sitzung'] },
  { match: /urlaub|ferien/i, icon: TreePalm, label: 'Urlaub', strip: ['Urlaub', 'Ferien'] },
]

/** Firmenzusätze, die nur Platz kosten */
const NOISE = /\b(gmbh|e\.\s?v\.|ag|ug)\b/gi
const SEP = '[-–:|]'

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Entfernt ein ganzes Wort samt Trenner davor oder danach: „Uni - Livestream Tag 1“ → „Uni Tag 1“ */
function removeWord(text: string, word: string): string {
  const w = escapeRegex(word)
  const re = new RegExp(`(^|\\s)(${SEP}\\s*)?${w}(?=$|\\s|[?!.,]|${SEP})(\\s*${SEP})?`, 'gi')
  return text.replace(re, ' ')
}

/** Art des Termins als Kurzform mit Symbol (für sehr kleine Blöcke), sonst undefined */
export function kindOf(title: string): { icon: LucideIcon; label: string } | undefined {
  const rule = RULES.find((r) => r.match.test(title))
  return rule && { icon: rule.icon, label: rule.label }
}

/** Kürzt einen Titel; ohne passende Regel bleibt er (bis auf Firmenzusätze) wie er ist */
export function shortenTitle(title: string): { icon?: LucideIcon; label?: string; text: string } {
  const rule = RULES.find((r) => r.match.test(title))
  let text = title
    .replace(NOISE, '')
    // Uhrzeit am Anfang steht schon davor (z. B. „8:45 Spiegelung“)
    .replace(/^\s*\d{1,2}[:.]\d{2}\s*(uhr)?\s*/i, '')
  if (rule) for (const w of rule.strip) text = removeWord(text, w)
  // übrig gebliebene Trenner am Rand und doppelte Leerzeichen aufräumen
  text = text
    .replace(new RegExp(`^\\s*${SEP}\\s*|\\s*${SEP}\\s*$`, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // nichts mehr übrig (z. B. Titel war nur „Büro“): Titel behalten
  if (!text) text = title.trim()
  return { icon: rule?.icon, label: rule?.label, text }
}

/** Titel mit Icon davor, voller Titel für Screenreader und als Tooltip */
export function EventTitle({ title, size = 16 }: { title: string; size?: number }) {
  const { icon, label, text } = shortenTitle(title)
  return (
    <span title={title} aria-label={title}>
      {icon && <Icon icon={icon} size={size} label={label} className="hb-event-icon" />}
      {text}
    </span>
  )
}
