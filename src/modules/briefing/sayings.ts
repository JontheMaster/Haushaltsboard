// Spruch für das Morgen-Briefing: Bibelvers (Offene Bibel, frei lizenziert) oder Zitat (gemeinfreie Autoren).
import data from './verses.json'

export type Saying = { text: string; from: string }
export type SayingMode = 'wechsel' | 'bibel' | 'zitat' | 'aus'

export const VERSE_SOURCE = data.source

const VERSES: Saying[] = data.verses.map((v) => ({ text: v.text, from: v.ref }))

// Nur Autorinnen und Autoren, deren Werke gemeinfrei sind; „zugeschrieben“, wenn die Herkunft unsicher ist
const QUOTES: Saying[] = [
  { text: 'Von guten Mächten wunderbar geborgen, erwarten wir getrost, was kommen mag.', from: 'Dietrich Bonhoeffer' },
  { text: 'Gott erfüllt nicht alle unsere Wünsche, aber alle seine Verheißungen.', from: 'Dietrich Bonhoeffer' },
  { text: 'Nicht das Beliebige, sondern das Rechte tun und wagen.', from: 'Dietrich Bonhoeffer' },
  { text: 'Wenn ich wüsste, dass morgen die Welt unterginge, würde ich heute noch ein Apfelbäumchen pflanzen.', from: 'Martin Luther zugeschrieben' },
  { text: 'Ich habe heute viel zu tun, darum muss ich viel beten.', from: 'Martin Luther zugeschrieben' },
  { text: 'Auch aus Steinen, die einem in den Weg gelegt werden, kann man Schönes bauen.', from: 'Johann Wolfgang von Goethe zugeschrieben' },
  { text: 'Es ist nicht genug zu wissen, man muss auch anwenden; es ist nicht genug zu wollen, man muss auch tun.', from: 'Johann Wolfgang von Goethe' },
  { text: 'Wer gar zu viel bedenkt, wird wenig leisten.', from: 'Friedrich Schiller' },
  { text: 'Die Axt im Haus erspart den Zimmermann.', from: 'Friedrich Schiller' },
  { text: 'Stets findet Überraschung statt, da wo man’s nicht erwartet hat.', from: 'Wilhelm Busch' },
  { text: 'Ich weiß nicht, ob es besser wird, wenn es anders wird. Aber es muss anders werden, wenn es besser werden soll.', from: 'Georg Christoph Lichtenberg' },
  { text: 'Habe Mut, dich deines eigenen Verstandes zu bedienen!', from: 'Immanuel Kant' },
  { text: 'Nicht weil es schwer ist, wagen wir es nicht, sondern weil wir es nicht wagen, ist es schwer.', from: 'Seneca' },
  { text: 'In dir muss brennen, was du in anderen entzünden willst.', from: 'Augustinus' },
  { text: 'Tu erst das Notwendige, dann das Mögliche, und plötzlich schaffst du das Unmögliche.', from: 'Franz von Assisi zugeschrieben' },
  { text: 'Auch eine Reise von tausend Meilen beginnt mit dem ersten Schritt.', from: 'Laozi' },
  { text: 'Die Erinnerung ist das einzige Paradies, aus dem wir nicht vertrieben werden können.', from: 'Jean Paul' },
  { text: 'Nicht die Dinge selbst beunruhigen die Menschen, sondern die Meinungen über die Dinge.', from: 'Epiktet' },
  { text: 'Das Glück deines Lebens hängt von der Beschaffenheit deiner Gedanken ab.', from: 'Marc Aurel' },
  { text: 'Das Leben kann nur rückwärts verstanden, aber nur vorwärts gelebt werden.', from: 'Søren Kierkegaard' },
  { text: 'Wenn jemand eine Reise tut, so kann er was erzählen.', from: 'Matthias Claudius' },
]

/**
 * Spruch des Tages: jeden Tag ein anderer, für alle Geräte gleich.
 * „wechsel“ (Standard, Entscheidung Jonathan 7.10.2026): gerade Tage ein Bibelvers, ungerade ein Zitat.
 */
export function sayingOf(day: string, mode: SayingMode): Saying | null {
  if (mode === 'aus') return null
  const [y, m, d] = day.split('-').map(Number)
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
  const verse = mode === 'bibel' || (mode === 'wechsel' && n % 2 === 0)
  const list = verse ? VERSES : QUOTES
  // im Wechsel zählt jede Liste nur ihre eigenen Tage, so kommt jeder Spruch einmal dran
  const i = mode === 'wechsel' ? Math.floor(n / 2) : n
  return list[i % list.length] ?? null
}
