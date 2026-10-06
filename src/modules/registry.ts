import { Bell, CalendarDays, Clock, Image, ListChecks, Mic, Moon, Music, ShoppingCart, Sparkles, TrainFront, UtensilsCrossed } from 'lucide-react'
import { MealSettings } from './meals/MealSettings'
import { DeparturesTile, useMorningBoard } from './transit/DeparturesBoard'
import { TransitSettings } from './transit/TransitSettings'
import { TransitHeader } from './transit/TripCard'
import { ReminderSettings } from './reminders/ReminderSettings'
import { AlexaHelp } from './alexa/AlexaHelp'
import { CalendarSettings } from './calendar/CalendarSettings'
import { PutzplanPage } from './chores/Putzplan'
import { NightSettings } from './night/NightSettings'
import { PhotoLibrary } from './photos/PhotoLibrary'
import { SpotifyPage } from './spotify/SpotifyPage'
import { CalendarTile } from './calendar/CalendarTile'
import { ClockWeatherTile } from './clock-weather/ClockWeatherTile'
import { ShoppingTile } from './shopping/ShoppingTile'
import { NowPlayingHeader, NowPlayingTile } from './spotify/NowPlaying'
import { TodosTile } from './todos/TodosTile'
import type { LayoutTile, ModuleDef } from './types'

// Alle Module. Ein neues Modul = ein neuer Eintrag hier, sonst nichts.
export const MODULES: ModuleDef[] = [
  { id: 'uhr-wetter', title: 'Uhr und Wetter', description: 'Uhrzeit, Datum und Wetter für Nürnberg', icon: Clock, phase: 1, sizes: ['s', 'm'], Tile: ClockWeatherTile },
  { id: 'kalender', title: 'Kalender', description: 'Termine heute und morgen, Farben, Besuchsmodus', icon: CalendarDays, phase: 2, sizes: ['s', 'm', 'l'], Tile: CalendarTile, Settings: CalendarSettings },
  { id: 'todos', title: 'Todos', description: 'Aufgaben für heute, die Woche und ohne Tag', icon: ListChecks, phase: 1, sizes: ['s', 'm', 'l'], Tile: TodosTile },
  { id: 'putzplan', title: 'Putzplan', description: 'Wiederkehrende Aufgaben, laufen bei den Todos mit', icon: Sparkles, phase: 2, sizes: [], Settings: PutzplanPage },
  { id: 'erinnerungen', title: 'Erinnerungen', description: 'Mitteilung aufs Handy, wenn ein Todo eine Uhrzeit hat', icon: Bell, phase: 5, sizes: [], Settings: ReminderSettings },
  // Essensplan: Reiter „Essen“ am Handy, Ansicht „Essen“ an der Wand, Essen erscheinen im Kalender
  { id: 'essensplan', title: 'Essensplan', description: 'Rezepte, Essen in die Woche ziehen, Kochmodus', icon: UtensilsCrossed, phase: 4, sizes: [], Settings: MealSettings },
  { id: 'einkauf', title: 'Einkauf', description: 'Eure Bring!-Liste „Zuhause“', icon: ShoppingCart, phase: 1, sizes: ['s', 'm', 'l'], Tile: ShoppingTile },
  // Abfahrten: Weg pro Person in der Kopfzeile (nur kurz vor dem Losgehen), morgens die Tafel über dem Einkauf
  { id: 'abfahrten', title: 'Abfahrten', description: 'Wann ihr los müsst, mit Echtzeit von VAG und VGN', icon: TrainFront, phase: 5, sizes: ['s'], Tile: DeparturesTile, Header: TransitHeader, Settings: TransitSettings, stackOn: 'einkauf', useShow: useMorningBoard },
  // Spotify: nur sichtbar, solange etwas läuft (Kopfzeile statt fester Kachel)
  { id: 'spotify', title: 'Läuft gerade', description: 'Was bei euch auf Spotify läuft', icon: Music, phase: 5, sizes: ['m'], Tile: NowPlayingTile, Header: NowPlayingHeader, Settings: SpotifyPage },
  { id: 'bildschirmschoner', title: 'Bildschirmschoner', description: 'Eure Fotos, wenn niemand das Board benutzt', icon: Image, phase: 6, sizes: [], Settings: PhotoLibrary },
  { id: 'nachtmodus', title: 'Nachtmodus', description: 'Nachts nur eine gedimmte Uhr an der Wand', icon: Moon, phase: 2, sizes: [], Settings: NightSettings },
  { id: 'alexa', title: 'Alexa', description: 'Todos per Sprache eintragen und vorlesen lassen', icon: Mic, phase: 3, sizes: [], Settings: AlexaHelp, toggle: false },
]

export const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]))

// Standard-Layout an der Wand (Phase 1 fest, Bearbeiten-Modus kommt in Phase 2).
// Uhr und Wetter steht an der Wand immer als Kopfzeile, nicht im Raster.
// Termine am größten (links), daneben Todos und Einkauf gleich breit (Entscheidung Jonathan 5.10.2026)
export const DEFAULT_WALL_LAYOUT: LayoutTile[] = [
  { module: 'kalender', size: 'l' },
  { module: 'todos', size: 's' },
  { module: 'einkauf', size: 's' },
]

// Standard am Handy (pro Person änderbar ab Phase 2). Kacheln stehen untereinander.
export const DEFAULT_PHONE_LAYOUT: LayoutTile[] = [
  { module: 'kalender', size: 'm' },
  { module: 'todos', size: 'm' },
  { module: 'einkauf', size: 'm' },
]
