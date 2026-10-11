import { Bath, Droplets, PawPrint, Recycle, Shirt, Sparkles, Sprout, Trash2, Utensils, WashingMachine, type LucideIcon } from 'lucide-react'

/**
 * Symbol pro Putzregel (Spalte chore_rules.icon). Glitzer ist der Standard; Pflanzen gießen bekommt z. B. den Spross,
 * damit man es in Todos und Woche sofort erkennt (Entscheidung Jonathan 11.10.2026). Liste = Prüfung in der Datenbank.
 */
export const CHORE_ICONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: 'Sparkles', icon: Sparkles, label: 'Putzen' },
  { name: 'Sprout', icon: Sprout, label: 'Pflanzen' },
  { name: 'Droplets', icon: Droplets, label: 'Gießen' },
  { name: 'Trash2', icon: Trash2, label: 'Müll' },
  { name: 'Recycle', icon: Recycle, label: 'Altpapier, Gelber Sack' },
  { name: 'Shirt', icon: Shirt, label: 'Wäsche' },
  { name: 'WashingMachine', icon: WashingMachine, label: 'Waschmaschine' },
  { name: 'Utensils', icon: Utensils, label: 'Küche' },
  { name: 'Bath', icon: Bath, label: 'Bad' },
  { name: 'PawPrint', icon: PawPrint, label: 'Tier' },
]

const BY_NAME = new Map(CHORE_ICONS.map((c) => [c.name, c]))

/** Symbol und Bezeichnung einer Regel (unbekannt = Glitzer) */
export function choreIcon(name: string | null | undefined): { icon: LucideIcon; label: string } {
  return BY_NAME.get(name ?? '') ?? CHORE_ICONS[0]
}
