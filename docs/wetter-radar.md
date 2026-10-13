# Modul „Uhr und Wetter“: Regenradar

Die Wetter-Kachel (`WeatherCurveTile`, Wand und Handy) bekommt neben der Vorhersage eine Radar-Ansicht. Dazu kommt ein Nowcast-Satz („Regen in 18 min, leicht, bis ca. 16:40“), der aus dem Radar für unser Zuhause berechnet wird. Stand: 13.10.2026, freigegeben von Jonathan (Umschalter „Heute | Morgen | Radar“, Karte aus OpenStreetMap mit Quellenzeile).

---

## Datenquelle: Bright Sky `/radar`

Geprüft am 13.10.2026 an der OpenAPI-Beschreibung (`https://api.brightsky.dev/openapi.json`) und mit einer echten Anfrage.

- Freie Schnittstelle auf dem DWD-Radarprodukt RV, kein API-Key. Für die Daten gelten die Nutzungsbedingungen des DWD (Open Data, CC BY 4.0).
- Raster 1200 × 1100 km, 1 km² pro Pixel, 5-Minuten-Schritte. Werte in 0,01 mm pro 5 min (Wert 45 = 0,45 mm in 5 min = 5,4 mm/h).
- Ausschnitt per `lat`, `lon`, `distance` (Meter). Mit 40 km kommt ein Ausschnitt von 81 × 81 Pixeln; die Antwort enthält `bbox` (Pixel im Gesamtraster) und `latlon_position` (genaue Pixelposition des angefragten Punkts).
- `format=compressed`: base64 + zlib, 2-Byte-Ganzzahlen (Little Endian), Zeile für Zeile von Nord nach Süd.
- **Zeitraum muss man selbst angeben:** Ohne `date`/`last_date` liefert Bright Sky nur etwa −65 bis +55 min. Mit `date = jetzt − 65 min` und `last_date = jetzt + 125 min` kamen 38 Bilder (−65 bis +120 min). Probe am 13.10.2026: 88 KB, 0,2 s.
- **Vergangenheit nur 6 Stunden:** Eine Anfrage für den 10.10. kam leer zurück (`radar: []`). Ein Test mit einem älteren Regentag geht deshalb nicht über Bright Sky. Getestet wird mit echtem Regen am Testtag (am 13.10. regnet es gerade) oder mit einem selbst gespeicherten Datensatz (siehe Testen).
- Keine festen Limits dokumentiert; Bright Sky bittet, Ausschnitte statt des ganzen Rasters zu laden. Wir fragen genau einmal alle 5 Minuten an, zentral für alle Geräte.
- Quellenangabe (Entscheidung Jonathan 13.10.2026): an der Karte nur klein „© OpenStreetMap-Mitwirkende“ (OSM verlangt die Nennung an der Karte). Der DWD („Datenbasis: Deutscher Wetterdienst, eigene Bearbeitung“) steht in Alle Funktionen → Uhr und Wetter; CC BY erlaubt die Nennung an passender Stelle. Das ist die DWD-Vorlage für veränderte Daten; wir rechnen die Werte um, färben sie ein und leiten den Nowcast ab, deshalb nicht „Daten: Deutscher Wetterdienst“. Bright Sky nennen wir zusätzlich in Alle Funktionen → Uhr und Wetter (dort ist Platz).

## Projektion: Karte im Raster des Radars zeichnen

Das Radar liegt polarstereografisch vor (`+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 …`), Kartendienste wie OpenStreetMap in Web-Mercator.

**Entscheidung:** Die Hintergrundkarte wird im Raster des Radars gezeichnet, das Radar bleibt unverändert.

- Bei 80 × 80 km um Nürnberg ist das Radar-Raster praktisch winkeltreu, Norden ist um weniger als 1° gedreht. Die Karte sieht also aus wie eine normale Karte.
- So muss kein Regen-Pixel umgerechnet werden: keine Unschärfe durch Umrechnung, und jedes Radar-Pixel ist genau 1 km auf der Karte.
- Die Karte ist eine eigene, ruhige Zeichnung (siehe unten), keine Kachel-Karte.

Die Formel (Bright-Sky-Doku, proj-string oben) setzen wir in TypeScript um. Sie wird in der Edge Function für unser Zuhause und im Karten-Skript für Straßen und Orte genutzt, Prüfung gegen `latlon_position` aus der Antwort.

## Zuhause und Ausschnitt

- Der **Ausschnitt** ist fest auf die Stadtmitte gelegt (49,45 / 11,08, ± 40 km). Diese Koordinaten stehen schon im Repo (Wetter von Open-Meteo), verraten also nichts. Nur so kann die Karte als Datei im Repo liegen, ohne unser Zuhause zu zeigen.
- **Zuhause** kommt nur aus der Datenbank: Wir nehmen die bestehenden Koordinaten `modules.config.home` (gepflegt in NFC-Tags → Zuhause). Die Function rechnet daraus das Pixel und speichert es im Cache (nur für Mitglieder lesbar). Im Repo steht kein Zuhause.
- Hinweis: In CLAUDE.md steht beim Heimweg bereits die Straße. Soll ich sie dort durch „Zuhause (in NFC-Tags eingetragen)“ ersetzen?

## Server: Edge Function `weather-radar` und Cache

- Cron `weather-radar` alle 5 Minuten (pg_net, Schutz über `x-cron-key` wie bei `reminders`). Läuft nur, wenn das Modul „Uhr und Wetter“ an ist.
- Ablauf:
  1. Bright Sky abfragen (Ausschnitt, −65 bis +125 min, compressed).
  2. Entpacken.
  3. In 8-Bit-Stufen umrechnen: 0 = trocken, 1–255 logarithmisch bis etwa 100 mm/h.
  4. Alle Bilder hintereinander wieder packen (deflate, base64).
  5. Nowcast rechnen.
  6. In die Tabelle schreiben.
- Tabelle `weather_radar` (eine Zeile, id 1):
  - `fetched_at`, `first_at`, `now_at` (letztes gemessenes Bild), `step_min` (5)
  - `width`, `height`, `frames` (base64, ca. 10–40 KB)
  - `home_x`, `home_y`, `nowcast` (jsonb)
  - RLS: lesen für Mitglieder (auch das Tablet), schreiben nur der Server
  - Realtime an, damit Wand und Handys das neue Bild sofort haben
- **Warum ein Array und keine PNGs:** Die Geräte malen 81 × 81 Werte selbst auf ein Canvas. Das ist viel kleiner als 38 Bilder. Die Farben folgen dem Theme (hell/dunkel), und zwischen zwei Bildern lässt sich weich überblenden. In Deno braucht es dafür keine Bildbibliothek.
- Fällt Bright Sky aus, bleibt der letzte Stand stehen. Ist er älter als 30 Minuten, zeigt die Kachel „Radar gerade nicht erreichbar“, und der Nowcast-Satz entfällt.

## Nowcast für unser Zuhause

- Grundlage: das Zuhause-Pixel und seine 8 Nachbarn (Mittelwert über 3 × 3 km). Ein einzelnes Pixel springt zu stark, und das Radar ist auf etwa 1 km genau.
- Regen ab 0,2 mm/h (Wert ≥ 2), darunter gilt trocken (Radar-Rauschen).
- Stärke (mm/h): **leicht** unter 2,5 · **mäßig** 2,5–10 · **stark** über 10 · **Starkregen** ab 15 (Warnschwelle des DWD für eine Stunde).
- Ende: Der Regen gilt als vorbei, wenn 15 Minuten (3 Bilder) trocken folgen.
- Sätze:
  - „Die nächsten 2 Stunden trocken“
  - „Regen in 18 min, leicht, bis ca. 16:40“
  - „Regen in 18 min, mäßig, hält länger an“ (kein Ende innerhalb von 2 Stunden)
  - „Es regnet, leicht, hört gegen 16:10 auf“
  - „Es regnet, bleibt die nächsten 2 Stunden nass“
  - bei Starkregen vorn „Starkregen“ statt der Stärke
- Gespeichert als jsonb: `{ state: 'dry' | 'soon' | 'now', start_min, end_at, level, peak_mmh, text }`.

## Kachel

### Umschalter

Es gibt schon „Heute | Morgen“ in der Titelzeile der Kachel. Zwei Umschalter übereinander sind an der Wand zu eng (Kachel ca. 300 px breit).

**Entscheidung Jonathan (13.10.2026):** ein Umschalter mit drei Teilen, „Heute | Morgen | Radar“, in der Titelzeile. „Vorhersage“ heißt im Folgenden Heute oder Morgen.

Das ist der Segment-Umschalter (`hb-seg`) wie bei „Liste | Zeitplan“. Der `Toggle` aus dem Design System ist ein An/Aus-Schalter und passt nicht für zwei Ansichten. Der Wechsel blendet weich über (`dur-base`, `ease-out`).

### Radar-Ansicht

- **Karte** (eigene Zeichnung im Campfire-Stil, als Datei im Repo):
  - Fläche `surface-sunken`
  - Autobahnen, Stadtgrenzen, Pegnitz und Rednitz/Regnitz in `line`
  - wenige Ortsnamen in `ink-muted`, an der Wand mindestens 14 px: Nürnberg, Fürth, Erlangen, Schwabach, Lauf, Roth
  - erzeugt einmalig mit einem Skript (`scripts/build-radar-map.mjs`), ins Radar-Raster umgerechnet und vereinfacht
  - Daten aus OpenStreetMap über die Overpass-Schnittstelle (einmalig, nicht bei jedem Aufruf). OSM steht unter ODbL, deshalb „Karte © OpenStreetMap-Mitwirkende“ in der Quellenzeile (Entscheidung Jonathan 13.10.2026)
- **Zuhause:** Punkt in `accent` mit leisem Puls (eine ruhige Schleife wie beim Dringend-Punkt). Bei `prefers-reduced-motion` ohne Puls.
- **Regen:** weiche Fläche über der Karte. Die 81 × 81 Werte werden mit Glättung hochgerechnet, dadurch keine Pixeltreppen.
- **Farbskala** in Blautönen aus der Palette, mit Transparenz, damit die Karte durchscheint:
  - leicht `blue-200`
  - mäßig `blue-400`
  - stark `blue-600`
  - Starkregen `blue-600` gemischt mit `ink`
  - In „Abend“ gelten automatisch die dunklen Werte der Tokens, die Lesbarkeit prüfe ich in beiden Themes.
  - Hinweis: Blau ist sonst Jonathans Personenfarbe. Auf der Karte ist das eindeutig Regen, eine Verwechslung sehe ich nicht.
- **Animation:**
  - Bilder von −60 bis +120 min als Schleife, ca. 7 s pro Durchlauf, am Ende 1 s Pause auf dem letzten Bild
  - zwischen zwei Bildern wird pro Pixel überblendet, dadurch flüssig statt ruckelnd
- **Zeitleiste** unten:
  - dünne Linie, Vergangenheit kräftig, Zukunft heller (`ink-muted`)
  - Strich bei „jetzt“, Punkt für die aktuelle Position, Uhrzeit des Bildes klein daneben („16:25“)
- **Bedienung:**
  - Antippen der Karte pausiert und springt auf „jetzt“, erneutes Antippen spielt weiter
  - Auf der Zeitleiste ziehen spult von Hand
- **Ohne Animation:**
  - Nachtmodus (`useIsNight`): kein Abspielen, nur das Bild von „jetzt“
  - `prefers-reduced-motion`: keine Schleife, nur „jetzt“, Zeitleiste von Hand
- **Zoom** (13.10.2026): „Nah“ (Standard, ca. 36 km ums Zuhause, mit kleineren Orten wie Zirndorf, Stein, Wendelstein) und „Weit“ (ganzer Ausschnitt, ca. 80 km), Knopf oben rechts in der Karte, pro Gerät gemerkt.
- **OSM-Nennung** klein unten rechts in der Karte.

### Vorhersage-Ansicht

Bleibt wie bisher. Kommt in den nächsten 2 Stunden Regen oder regnet es gerade, steht der Nowcast-Satz als eigene Zeile darunter:
- Icon `CloudRain`, Text in `warning`
- bei Starkregen in `urgent`

## Einstellungen (Alle Funktionen → Uhr und Wetter)

Gespeichert in `modules.config` von `uhr-wetter`:
- **Standardansicht:** Vorhersage (Heute, abends Morgen wie bisher) oder Radar (Standard: Vorhersage)
- **Automatisch auf Radar wechseln, wenn Regen in den nächsten 30 min kommt** (Standard an)
  - Die Kachel springt auf Radar, solange Regen in höchstens 30 min erwartet wird oder es gerade regnet. Ist es wieder trocken, geht sie zurück auf die Standardansicht.
  - Wählt jemand von Hand, gilt das an der Wand 2 Minuten (wie überall an der Wand), am Handy bis zum nächsten Öffnen.

## Verknüpfungen mit anderen Modulen

- Fenster-Wächter und Wäsche-Tipp: Gibt es noch nicht. In `docs/nfc-modul.md` steht nur beim Putzplan-Autopilot „wetterabhängige Aufgaben“. **Später:** Sobald es sie gibt, nutzen sie `weather_radar.nowcast` statt der stündlichen Vorhersage.
- Tür-Briefing (NFC-Szene 1): Noch nicht gebaut. **Später:** übernimmt den Nowcast-Satz („Regen in 18 min, Schirm mitnehmen“).
- Was es schon gibt und naheliegt (nicht Teil dieses Auftrags, nur vorgemerkt): Morgen-Briefing und Handy-Widget könnten den Nowcast-Satz ebenfalls zeigen.

## Umsetzung (nach Okay), Schritt für Schritt

1. Tabelle `weather_radar`, Edge Function `weather-radar`, Cron. Test mit echtem Regen am Testtag. → Du prüfst: Zeile in der Datenbank wird alle 5 Minuten neu.
2. Nowcast-Text, Unit-Test mit festen Beispielwerten (trocken, Regen kommt, Regen hört auf, Starkregen). → Du prüfst: Satz in der Vorhersage-Ansicht.
3. Karten-Skript und Radar-Ansicht mit Animation, Zeitleiste, Nachtmodus, reduzierter Bewegung. → Screenshot an der Wand (1097 × 685) und am Handy.
4. Umschalter, Einstellungen, automatischer Wechsel. → Du prüfst an Wand und Handy.

Nach jedem Schritt Commit, CLAUDE.md und Umsetzungsplan-Checkliste ergänzen.

## Testen

- Echter Regen: Am 13.10.2026 regnet es in Nürnberg (Probe 15:45 UTC: bis 0,7 mm/h, rund 5.000 nasse Pixel im Ausschnitt).
- Damit sich die Ansicht auch an trockenen Tagen prüfen lässt, speichert die Function auf Wunsch einen Regen-Datensatz als Testfall (`?action=snapshot`, nur mit Cron-Schlüssel). Die Kachel kann ihn per `?radar=test` abspielen, ähnlich wie `?morgen=regen`. Der Datensatz liegt in der Datenbank, nicht im Repo.

## Nicht Teil davon

- Keine Unwetterwarnungen (Bright Sky `/alerts`). Das wäre ein eigener Punkt, und veränderte DWD-Warnungen dürften laut Nutzungsbedingungen nicht unter DWD-Quellenvermerk erscheinen.
- Keine Karte aus fremden Kachel-Servern.
