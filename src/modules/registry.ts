import { Bell, CalendarDays, CalendarRange, Clock, CloudSun, Coins, Heart, Image, ListChecks, Mic, Moon, Music, Quote, ShoppingCart, Sparkles, Sunrise, TrainFront, Trophy, UtensilsCrossed, Wifi, Zap } from 'lucide-react'
import { JubileeHeader, JubileeSettings } from './jubilee/Jubilee'
import { RecapHeader } from './recap/RecapHeader'
import { RecapSettings } from './recap/RecapSettings'
import { WifiSettings } from './wlan/Wifi'
import { BriefingSettings } from './briefing/BriefingSettings'
import { MealHeader } from './meals/MealHeader'
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
import { WeatherCurveTile } from './clock-weather/WeatherCurveTile'
import { WeekCompactTile } from './week/WeekCompactTile'
import { QuickActionsTile } from './todos/QuickActionsTile'
import { ChoresWeekTile } from './chores/ChoresWeekTile'
import { MealsWeekTile } from './meals/MealsWeekTile'
import { DeparturesBoardTile } from './transit/DeparturesBoardTile'
import { PhotoOfDayTile } from './photos/PhotoOfDayTile'
import { SayingTile } from './briefing/SayingTile'
import type { LayoutTile, ModuleDef, PhoneTile } from './types'

// Alle Module. Ein neues Modul = ein neuer Eintrag hier, sonst nichts.
export const MODULES: ModuleDef[] = [
  { id: 'uhr-wetter', title: 'Uhr und Wetter', description: 'Uhrzeit, Datum und Wetter für Nürnberg', icon: Clock, phase: 1, sizes: ['s', 'm'], Tile: ClockWeatherTile , phoneTiles: [{ id: 'kurve', title: 'Wetter mit Tageskurve', description: 'Jetzt, Regen und Temperatur bis Mitternacht', icon: CloudSun, Tile: WeatherCurveTile }] },
  { id: 'kalender', title: 'Kalender', description: 'Termine heute und morgen, Farben, Besuchsmodus', icon: CalendarDays, phase: 2, sizes: ['s', 'm', 'l'], Tile: CalendarTile, Settings: CalendarSettings , phoneTiles: [{ id: 'woche', title: 'Die nächsten Tage', description: 'Heute bis übermorgen: Termine, Essen, Todos', icon: CalendarRange, Tile: WeekCompactTile }] },
  { id: 'todos', title: 'Todos', description: 'Aufgaben für heute, die Woche und ohne Tag', icon: ListChecks, phase: 1, sizes: ['s', 'm', 'l'], Tile: TodosTile , phoneTiles: [{ id: 'schnell', title: 'Schnellaktionen', description: 'Todo, Einkauf, Was koche ich?, Münze werfen', icon: Zap, Tile: QuickActionsTile }] },
  { id: 'putzplan', title: 'Putzplan', description: 'Wiederkehrende Aufgaben, laufen bei den Todos mit', icon: Sparkles, phase: 2, sizes: [], Settings: PutzplanPage , phoneTiles: [{ id: 'woche', title: 'Putzplan diese Woche', description: 'Was noch ansteht und wer dran ist', icon: Sparkles, Tile: ChoresWeekTile }] },
  { id: 'erinnerungen', title: 'Erinnerungen', description: 'Mitteilung aufs Handy, wenn ein Todo eine Uhrzeit hat', icon: Bell, phase: 5, sizes: [], Settings: ReminderSettings },
  // Essensplan: Reiter „Essen“ am Handy, Ansicht „Essen“ an der Wand, Essen erscheinen im Kalender,
  // das Essen von heute steht in der Wand-Kopfzeile (antippen = Kochmodus)
  { id: 'essensplan', title: 'Essensplan', description: 'Rezepte, Essen in die Woche ziehen, Kochmodus', icon: UtensilsCrossed, phase: 4, sizes: [], Header: MealHeader, Settings: MealSettings , phoneTiles: [{ id: 'woche', title: 'Essen diese Woche', description: 'Was in den nächsten 7 Tagen gekocht wird', icon: UtensilsCrossed, Tile: MealsWeekTile }] },
  { id: 'einkauf', title: 'Einkauf', description: 'Eure Bring!-Liste „Zuhause“', icon: ShoppingCart, phase: 1, sizes: ['s', 'm', 'l'], Tile: ShoppingTile },
  // Abfahrten: Weg pro Person in der Kopfzeile (nur kurz vor dem Losgehen), morgens die Tafel über dem Einkauf
  { id: 'abfahrten', title: 'Abfahrten', description: 'Wann ihr los müsst, mit Echtzeit von VAG und VGN', icon: TrainFront, phase: 5, sizes: ['s'], Tile: DeparturesTile, Header: TransitHeader, Settings: TransitSettings, stackOn: 'einkauf', useShow: useMorningBoard , phoneTiles: [{ id: 'tafel', title: 'Abfahrten-Tafel', description: 'Abfahrten ab zuhause, immer', icon: TrainFront, Tile: DeparturesBoardTile }] },
  // Spotify: nur sichtbar, solange etwas läuft (Kopfzeile statt fester Kachel)
  { id: 'spotify', title: 'Läuft gerade', description: 'Was bei euch auf Spotify läuft', icon: Music, phase: 5, sizes: ['m'], Tile: NowPlayingTile, Header: NowPlayingHeader, Settings: SpotifyPage },
  // Wochenrückblick: sonntags ab Nachmittag als Karte oben (wie Essen), Antippen öffnet den Rückblick; Push pro Person
  { id: 'wochenrueckblick', title: 'Wochenrückblick', description: 'Sonntags: was ihr in der Woche geschafft habt', icon: Trophy, phase: 5, sizes: [], Header: RecapHeader, Settings: RecapSettings },
  // WLAN für Gäste: Knopf in der Kopfzeile nur im Besuchsmodus (WifiButton), Einstellungen hier
  { id: 'wlan', title: 'WLAN für Gäste', description: 'QR-Code fürs WLAN, wenn der Besuchsmodus an ist', icon: Wifi, phase: 5, sizes: [], Settings: WifiSettings },
  // Jubiläen: nur an besonderen Tagen eine Karte oben (Jahre, Monate, runde Tage, Schnapszahlen)
  { id: 'jubilaeum', title: 'Jubiläen', description: 'Besondere Tage, seit ihr zusammen seid', icon: Heart, phase: 5, sizes: [], Header: JubileeHeader, Settings: JubileeSettings },
  // Münzwurf: Knopf an der Wand in der Kopfzeile, am Handy unten auf Start (CoinButton)
  { id: 'muenzwurf', title: 'Münzwurf', description: 'J oder L: wer ist dran mit Müll, Abwasch …', icon: Coins, phase: 5, sizes: [] },
  { id: 'bildschirmschoner', title: 'Bildschirmschoner', description: 'Eure Fotos, wenn niemand das Board benutzt', icon: Image, phase: 6, sizes: [], Settings: PhotoLibrary , phoneTiles: [{ id: 'foto', title: 'Foto des Tages', description: 'Jeden Tag ein Bild aus eurer Fotobibliothek', icon: Image, Tile: PhotoOfDayTile }] },
  // Morgen-Briefing: zu festen Uhrzeiten an der Wand (nur Board-Konto), Wetter, Termine, Spruch
  { id: 'morgen', title: 'Morgen-Briefing', description: 'Morgens an der Wand: Wetter, Termine, Dringendes und ein Spruch', icon: Sunrise, phase: 5, sizes: [], Settings: BriefingSettings , phoneTiles: [{ id: 'spruch', title: 'Spruch des Tages', description: 'Bibelvers oder Zitat, wie im Morgen-Briefing', icon: Quote, Tile: SayingTile }] },
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

// Standard am Handy, pro Person änderbar („Startseite anpassen“). Kacheln stehen untereinander.
export const DEFAULT_PHONE_LAYOUT: LayoutTile[] = [
  { module: 'kalender', size: 'm' },
  { module: 'todos', size: 'm' },
  { module: 'einkauf', size: 'm' },
]

// Was am Handy als Kachel auf die Startseite darf: Module mit Kachel, außer zeitweisen (stackOn)
// und solchen, die schon oben auf der Startseite stehen (Header, z. B. Läuft gerade)
export const PHONE_TILE_MODULES = MODULES.filter((m) => m.Tile && m.sizes.length && !m.stackOn && !m.Header)

/** Alle Kacheln, die man am Handy auf die Startseite holen kann: Hauptkacheln, dann die Zusatzkacheln der Module */
export const PHONE_TILES: PhoneTile[] = [
  ...PHONE_TILE_MODULES.map((m) => ({ key: m.id, moduleId: m.id, id: m.id, title: m.title, description: m.description, icon: m.icon, Tile: m.Tile! })),
  ...MODULES.flatMap((m) => (m.phoneTiles ?? []).map((t) => ({ ...t, key: `${m.id}.${t.id}`, moduleId: m.id }))),
]
export const PHONE_TILE_BY_KEY = new Map(PHONE_TILES.map((t) => [t.key, t]))
