// „Charakter“ eines Sets: ein kurzer Name und ein Satz, abgeleitet aus seinen Karten. Macht Lust aufs Spielen.
import { cardName, CARD_BY_ID } from './generator'
import type { Card, Kingdom, Tag } from './types'

export type Character = { title: string; text: string }

const count = (cards: Card[], t: Tag) => cards.filter((c) => c.tags.includes(t)).length
const names = (cards: Card[], t: Tag, n = 2) =>
  cards
    .filter((c) => c.tags.includes(t))
    .slice(0, n)
    .map((c) => cardName(c.id))
    .join(' und ')

/** Erste passende Regel gewinnt, die Reihenfolge ist Absicht (Besonderes vor Allgemeinem) */
export function characterOf(k: Kingdom): Character {
  const cards = k.kingdom.map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c)
  const extras = new Set(k.extras.map((e) => e.id))
  const attacks = count(cards, 'attack')
  const villages = count(cards, 'village')
  const draw = count(cards, 'terminal_draw') + count(cards, 'draw')
  const trash = count(cards, 'trash')
  const payload = count(cards, 'payload')
  const altVp = cards.filter((c) => c.tags.includes('alt_vp'))
  const potion = cards.some((c) => c.cost.potion > 0)
  const defense = names(cards, 'defense', 1)

  if (extras.has('platinum_colony') && payload >= 3)
    return { title: 'Goldene Zeiten', text: 'Platin und Kolonie liegen aus. Wer zuerst richtig reich wird, kauft sich den Sieg.' }
  if (attacks >= 3)
    return {
      title: 'Gemeine Runde',
      text: defense ? `${attacks} Angriffe im Spiel. Gut, dass es ${defense} gibt.` : `${attacks} Angriffe und keine Abwehr. Haltet eure Hände fest.`,
    }
  if (villages >= 2 && draw >= 3) return { title: 'Dorf-Maschine', text: `${names(cards, 'village')} plus viele Ziehkarten: Wer die Maschine zuerst zum Laufen bringt, gewinnt.` }
  if (potion) return { title: 'Hexenküche', text: 'Tränke brauen lohnt sich hier. Ein Trank im Deck öffnet die besten Karten.' }
  if (altVp.length)
    return { title: 'Punkte auf Umwegen', text: `${cardName(altVp[0].id)} zählt anders als Anwesen und Provinzen. Behaltet die Punkte im Blick.` }
  if (trash >= 3) return { title: 'Großes Aufräumen', text: 'Viel zum Entsorgen: schlanke Decks sind hier im Vorteil.' }
  if (payload >= 4 && attacks <= 1) return { title: 'Schatzjäger-Abend', text: 'Viel Geld, kaum Ärger. Ein entspanntes Rennen zu den Provinzen.' }
  if (villages === 0 && draw <= 1) return { title: 'Geld regiert', text: 'Kaum Dörfer, kaum Ziehen: Gold und Provinzen entscheiden.' }
  if (attacks === 0) return { title: 'Friedliche Runde', text: 'Keine Angriffe. Jeder baut in Ruhe an seinem Deck.' }
  return { title: 'Bunte Mischung', text: 'Von allem etwas: Dörfer, Geld und ein paar Überraschungen.' }
}
