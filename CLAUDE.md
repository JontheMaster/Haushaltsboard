# Haushaltsboard

Gemeinsames Haushalts-Dashboard von Jonathan und Leviona: ein Android-Tablet an der Wand (Fully Kiosk) plus dieselbe Web-App am Handy. Einkaufsliste (Bring!), Todos, Putzplan, zwei Google-Kalender, Wetter, Uhr. Später weitere Module.

## Rollen

- **Claude programmiert alles.** Jonathan kümmert sich um Design und Features und programmiert nicht selbst. Erkläre technische Entscheidungen kurz und verständlich, frag nicht nach Code-Details, die du selbst entscheiden kannst.
- Sprache mit Jonathan: Deutsch, knapp. UI-Texte: Deutsch, du-Form, Verb zuerst auf Knöpfen.
- Neue Phasen erst starten, wenn Jonathan das Go gibt. Innerhalb einer Phase selbstständig arbeiten.

## Referenzen

- Konzept, ausführliche Doku, Bilder aller Screens, Umsetzungsplan mit Checklisten: Claude Doc „Unser Haushaltsboard“ – https://claude.ai/code/artifact/0de67b0e-fa44-4c52-a4e7-e0df36db7467 (Reiter: Übersicht, Ausführliche Doku, Funktionen und Ideen, Umsetzungsplan)
- Design System „Haushaltsboard Campfire“ – https://claude.ai/artifact/5vykkaJmKXriYy9rYe23Ur
- Lokale Kopie des Design Systems in `design/`:
  - `design/DESIGN.md` – Regeln für Farbe, Schrift, Abstände, Bewegung, Icons. **Verbindlich.**
  - `design/tokens.json` – alle Tokens (Farben in zwei Themes „light“/„dark“, Typo, Abstände, Radien, Schatten, Dauer, Easing). In CSS-Variablen bzw. Tailwind-Theme übersetzen, keine Werte frei erfinden.
  - `design/components.css` – fertige Styles und Animationen der Komponenten (Präfix `hb-`). Als Vorlage für die React-Komponenten nutzen.
  - `design/components.reference.js` – Referenz-Implementierung der 10 Komponenten (Icon, Button, Tile, TaskItem, PersonChip, EventPill, ClockWeather, Toggle, Badge, ModuleCard). In der App als echte TSX-Komponenten neu bauen; Icons dort über `lucide-react` (Strich 1.75).

## Technik (entschieden)

- Vite + React + TypeScript, Tailwind CSS, `@dnd-kit` für Drag and Drop, `lucide-react` für Icons, Schriften Bricolage Grotesque + Figtree (Google Fonts).
- Supabase: Projekt „Haushaltsboard“, Ref `cdfjglisfkhbkrklkxek`, URL `https://cdfjglisfkhbkrklkxek.supabase.co`, Region London. Datenbank, Auth (Magic Link), Realtime, Edge Functions, Cron.
- Hosting: GitHub-Repo `haushaltsboard` (öffentlich), Deploy per GitHub Action auf GitHub Pages. Vite `base` auf den Repo-Namen setzen: `/Haushaltsboard/` (großes H). Repo: github.com/JontheMaster/Haushaltsboard, Seite: https://jonthemaster.github.io/Haushaltsboard/
- Niemals Geheimnisse ins Repo. Publishable Key darf in `.env.local` / Actions-Variablen (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`). `.gitignore` mit `.env*` vor dem ersten Commit.
- Web-App-Manifest, Querformat-Layout fürs Tablet, schmales Layout unter ca. 700 px fürs Handy.

## Secrets (in Supabase angelegt, nur in Edge Functions lesen)

| Name | Inhalt | Besuchsmodus (Standard) |
| --- | --- | --- |
| `ICAL_LEVIONA_PRIVAT` | Levionas Kalender | sichtbar |
| `ICAL_JONATHAN_PRIVAT` | Jonathan privat | sichtbar |
| `ICAL_JONATHAN_EJ` | Evangelische Jugend | sichtbar |
| `ICAL_JONATHAN_UNI` | Uni | sichtbar |
| `ICAL_JONATHAN_KIRCHENVORSTAND` | Kirchenvorstand | sichtbar |
| `ICAL_JONATHAN_FOCUS` | Fokus-Blöcke | ausgeblendet |
| `ICAL_JONATHAN_ARBEIT_TERMINE` | Arbeit, Termine | ausgeblendet |
| `ICAL_JONATHAN_ARBEIT_TRAININGS` | Arbeit, Trainings | ausgeblendet |
| `BRING_EMAIL`, `BRING_PASSWORD` | Bring!-Login | – |

Pro Kalender in der App einstellbar (Tabelle `calendars`, Felder `hide_in_visit`, `color`). Jeder Kalender hat eine eigene Farbe (Tokens `cal-*`, Zuordnung in design/DESIGN.md), Jonathan privat = Blau, Leviona = Beere.

Anzeige-Regeln Kalender (serverseitig in `calendar`, Funktion `tidy`, immer mit allen Kalendern gerechnet, damit sie auch im Besuchsmodus stimmen; Board liest nur `skipDays`): Ganztags-Zeiträume über 14 Tage ausblenden; mehrtägige Ganztags-Einträge an Tagen ausblenden, an denen ein Termin mit Uhrzeit aus demselben Kalender oder mit dem Kalendernamen am Titelanfang liegt.

## Personen und Farben

- Person a = Jonathan, **Blau** (`person-a*`). Person b = Leviona, **Beere** (`person-b*`). „Offen“ = wer Zeit hat.
- Grün (`success*`) heißt immer erledigt, Rot (`urgent*`) heißt immer dringend. Akzent (`accent`) ist Aprikose für die Hauptaktion.

## Regeln der Fachlogik

- Todos: einmalig. Felder: Titel, Datum / „diese Woche“ / ungeplant, Person oder offen, erledigt am/von, `moved_since`.
- Unerledigtes Todo rutscht um Mitternacht **genau einen Tag** mit (Hinweis „seit …“); bleibt es wieder liegen → zurück in „Offen, noch ohne Tag“ (`due_date = null`).
- Abgehakt bleibt bis Mitternacht durchgestrichen sichtbar; Antippen = erledigt mit 5 s Rückgängig.
- Putzplan ist ein **eigenes Modul** (eigene Tabellen), rutscht nicht: die nächste Wiederholung ersetzt die alte. Aufgaben liefert Jonathan, wenn das Modul dran ist.
- „Heute“ immer in `Europe/Berlin` rechnen. Cron `30 23 * * *` (UTC).
- Bring! ist die einzige Quelle für Einkauf: Liste „Zuhause“ alle ~30 s laden, Abhaken direkt in Bring!. Inoffizielle API: Endpunkte und Header aus dem Open-Source-Projekt `bring-mcp` (github.com/florianwittkamp/bring-mcp) übernehmen; Token serverseitig cachen.
- Kalender per iCal in Edge Function `calendar` laden (alle 5 min), Serien für 8 Tage auflösen; im Besuchsmodus versteckte Kalender schon serverseitig weglassen.
- Wetter direkt von Open-Meteo (Nürnberg 49.45 / 11.08, Europe/Berlin), stündlich.

## Architektur: Module

Jede Funktion ist ein Modul mit Kachel (Größen s/m/l), Detailseite, Einstellungen, An/Aus-Schalter. Startseite = Kachel-Gitter, Layout pro Gerät bzw. pro Person (Tabelle `layouts`). Screen „Alle Funktionen“ listet alle Module. Neue Module dürfen nichts an bestehenden ändern müssen.

| Modul | Phase |
| --- | --- |
| Uhr und Wetter, Todos, Einkauf (Bring!), Handy-Ansicht | 1 |
| Kalender + Besuchsmodus, Putzplan, Wochenansicht mit Drag and Drop, Startseite bearbeiten, Alle Funktionen, Nachtmodus | 2 |
| Alexa-Skill für Todos | 3 |
| Essensplan mit Zutaten → Bring! | 4 |
| Abfahrten (VAG `start.vag.de/dm`), Countdown (`#countdown` im Kalendertitel), Wochenrückblick, WLAN-QR im Besuchsmodus, Erinnerungen per Push (Todo mit Uhrzeit, Web Push, Details in der Doku) | 5 |
| Bildschirmschoner mit eigener Fotobibliothek (Supabase Storage) | 6 |

## Datenbank (Startpunkt, Details im Umsetzungsplan)

Tabellen: `members` (id = auth user, name, color, is_board), `calendars`, `todos`, `chore_rules`, `chore_tasks`, `modules` (id, enabled, config jsonb), `layouts` (device / member, tiles jsonb), `settings` (visit_mode, night_from, night_to). RLS auf allen Tabellen, Zugriff nur für Mitglieder über eine `security definer`-Funktion `is_member()`. Registrierung nach dem Anlegen der drei Konten (Jonathan, Leviona, Tablet) abschalten. Realtime für `todos`, `chore_tasks`, `modules`, `layouts`, `settings`.

## Stand (5. Oktober 2026)

- Phase 1, Schritt 1–5 erledigt: Projekt, Deploy auf Pages, Datenbank mit RLS, Login per Code/Magic Link (Gmail-SMTP), Edge Functions `bring` und `calendar`, Cron `roll-over-todos`, Board (Kopfzeile Uhr/Wetter, Kacheln Todos und Einkauf, Modul-Registry in `src/modules/registry.ts`), Handy-Ansicht `src/screens/Phone.tsx` (Start, Todos, Einkauf, Plus → TodoSheet).
- Mitglieder: Jonathan (person-a), Leviona (person-b), Tablet (board, sommererjonathan+board@gmail.com). Kalender-Owner gesetzt.
- Secrets heißen immer mit Unterstrich (`BRING_EMAIL`, nicht `BRING-EMAIL`).
- Edge Functions werden per Supabase-MCP deployt (`_shared/http.ts` als `../_shared/http.ts` mitschicken). Migrationen per MCP anwenden und lokal mit derselben Versionsnummer ablegen.
- Erledigte Todos: nach 5 s verschwindet nur „Rückgängig“, das Todo bleibt bis Mitternacht durchgestrichen (Fachlogik vor DESIGN.md). Einkauf-Artikel verschwinden nach 5 s.
- Tailwind kennt nur Token-Abstände (plus 0 und px). Größen wie h-12 gibt es nicht, dafür Tokens (h-7 = 48 px) oder [arbitrary].
- Bis zum Tablet-Kauf (Black Friday) läuft das Board testweise auf Jonathans iPad.
- Wand-Layout: Kalender l (Heute und Morgen nebeneinander), Todos s, Einkauf s.
- Phase 2, Teil 1 erledigt: Kalender-Kachel (links an der Wand, Morgen-Vorschau nur an der Wand), Besuchsmodus-Schalter in beiden Kopfzeilen (settings.visit_mode, Realtime, sofortiges Ausblenden über hideInVisit).
- Handy: Todos per Wischen löschen mit Rückgängig; nach dem Speichern Bestätigung „Für morgen eingetragen · …“.
- Phase 2, Teil 2 erledigt: Wochenansicht `src/modules/week/WeekView.tsx` (Wand: Umschalter Heute|Woche, nach 2 min zurück; Handy: Reiter Woche). Ablagen: Tag, „Diese Woche“, „Ohne Tag“; vergangene Tage nicht. Wand: Antippen = abhaken, lange halten = Person wechseln, ziehen = verschieben. Handy: halten + ziehen, Antippen = Bearbeiten. Kalender-Function liefert Montag dieser Woche bis Ende nächster Woche.
- Zeitplan-Ansicht (`src/modules/calendar/Timeline.tsx`): Umschalter „Liste | Zeitplan“ in Termine-Kachel und Woche, Standard Liste, Wahl pro Gerät in localStorage. Woche ist getrennt: Termine oben, Todos unten.
- Termintitel werden nur in der Anzeige gekürzt (`src/modules/calendar/shorten.tsx`): bekannte Arten als Lucide-Icon (Geburtstag, Livestream, Arzt, Training, Büro, Kirche, Treffen, Urlaub), Füllwörter und Uhrzeit am Anfang fallen weg. Keine Emoji (Entscheidung Jonathan: Icons statt Emoji).
- Ideen, nur vorgemerkt (nicht eingeplant, stehen in der Doku unter „Funktionen und Ideen“): Termine verschieben (Google-Schreibzugriff), Date-Zufallsgenerator (ferne Zukunft).
- Vorgezogen und fertig: Bildschirmschoner mit Fotobibliothek (eigentlich Phase 6) und Nachtmodus. Tabelle `photos`, privater Bucket `photos` (full/ ca. 1920 px, thumb/ ca. 400 px, im Browser verkleinert), Modul `bildschirmschoner` mit config `idle_minutes` (Standard 5) und `interval_seconds` (Standard 60), einstellbar am Handy auf der Fotos-Seite. Auto-Start und Nachtmodus nur am Board-Konto (`is_board`), manueller Start per Knopf überall an der Wand. Nachtmodus nach `settings.night_from/to`, Antippen weckt 2 Minuten.
- Laufender Termin: „Jetzt · bis …“ mit pulsierendem Punkt und Fortschrittsbalken, nächster Termin „in 40 Min“ (`src/modules/calendar/live.ts`).
- Phase 2, Teil 3 erledigt: Putzplan. Regeln am Handy (Todos-Seite → „Putzplan bearbeiten“, `src/modules/chores/Putzplan.tsx`): Rhythmus täglich/wöchentlich/alle 2 Wochen/monatlich/bestimmte Tage, Wer fest/abwechselnd/offen, Wann „Fester Tag“ oder „Irgendwann in der Woche“ (`chore_rules.placement`). `private.generate_chores()` erzeugt `chore_tasks` für 14 Tage (Trigger bei Regeländerung, Cron `generate-chores` 23:35 UTC), Liegengebliebenes wird ersetzt. Putzaufgaben laufen in `useTodos` mit (id `chore:…`, Feld `chore`), Symbol Sparkles, Antippen am Handy öffnet die Regel.
- Nächster Schritt: Phase 2, Teil 4 Alle Funktionen (inkl. Nachtzeiten, Kalender-Einstellungen), danach Startseite bearbeiten.
