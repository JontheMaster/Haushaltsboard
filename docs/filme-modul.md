# Modul: Filme

Eine gemeinsame Merkliste für Filme (optional auch Serien). Wer einen Film entdeckt, teilt den Link in Sekunden ans Board. Am Filmabend wählt das Board per Zufall aus, passend zu Zeit, Laune und Streamingdiensten.

Voraussetzungen: Login, Modul-System, persönliche Tokens (`member_tokens`, siehe `docs/nfc-modul.md`).

Neues Secret, das Jonathan selbst anlegt: `TMDB_API_KEY`. Das ist der „API Read Access Token“ von themoviedb.org, kostenlos mit Konto. Vorher prüfen, ob die aktuellen TMDB-Bedingungen die private Nutzung so erlauben. Pflicht ist der Hinweis „Daten von TMDB“ mit Logo in den Einstellungen bzw. auf der Detailseite, und bei Streaming-Anbietern „Daten von JustWatch“.

---

## Stufe 1: Merkliste

### Datenbank

- `movies`:
  - `id`, `tmdb_id`, `kind` (`movie` | `tv`), `title`, `year`, `runtime` (min), `genres` (text[]), `poster_path`, `overview` (kurz), `rating_tmdb`
  - `providers` (jsonb, Streaming in DE, Stand), `providers_checked_at`
  - `source_url`, `added_by`, `added_at`
  - `status` (`merkliste` | `gesehen` | `verworfen`)
- `movie_votes`: `movie_id`, `member`, `want` (`unbedingt` | `gerne` | `egal` | `lieber_nicht`).
- `movie_watched`: `movie_id`, `watched_on`, `rating_a`, `rating_b` (1–5, jede Person für sich), `note`.

### Hinzufügen

- **Teilen-Menü am iPhone:**
  - Kurzbefehl „Film merken“ (nimmt URLs und Text an) schickt `POST /functions/v1/movies-add` mit Bearer-Token und `{ "url": … }`.
  - Antwort als Mitteilung: „Dune: Part Two (2024) gemerkt“.
  - Funktioniert aus IMDb, Letterboxd, JustWatch, Trailer auf YouTube, Instagram/TikTok-Beschreibung und Safari.
- **Edge Function `movies-add`:**
  - IMDb-ID (`tt\d+`) im Link → TMDB „find“.
  - Letterboxd/JustWatch → Titel und Jahr aus dem Link oder dem Seitentitel → TMDB-Suche.
  - Eindeutiger Treffer → speichern.
  - Unsicher → Eintrag mit Status „prüfen“ und 3 Vorschlägen. In der App einmal antippen.
- **In der App:** Suche nach Titel (TMDB) mit Postern, Tipp = merken.
- Doppelte erkennen über `tmdb_id`. Ist der Film schon gemerkt, wird nur die eigene Stimme ergänzt.

### Ansicht

- Handy: Poster-Raster.
- Filter: Länge, Genre, „Wir wollen beide“, „Läuft bei uns“ (nur Dienste aus den Einstellungen).
- Am Poster zwei kleine Punkte in Personenfarbe für die Stimmen.
- Board-Kachel (m): „Neu auf der Liste“ mit 3 Postern, oder am Abend „Filmabend?“ mit dem Zufallsknopf.

## Stufe 2: Zufall und Filmabend

- **„Was schauen wir?“** am Board oder Handy:
  - Fragt kurz nach Zeit (bis 100 min, bis 130 min, egal), Laune (leicht, spannend, lustig, gefühlvoll, egal) und ob es auf unseren Diensten laufen muss.
  - Laune wird auf TMDB-Genres abgebildet. Die Zuordnung steht als kleine Tabelle im Code.
- **Auswahl gewichtet:**
  - „unbedingt“ von beiden wiegt am meisten, „lieber_nicht“ fliegt raus.
  - Lange gemerkte Filme bekommen leicht mehr Gewicht, damit nichts ewig liegen bleibt.
- **Animation:** Poster laufen wie eine Walze durch und rasten mit `ease-spring` ein. Bei `prefers-reduced-motion` nur weiches Einblenden.
- **Darunter:**
  - „Den schauen wir“ → setzt einen Filmabend: Kachel zeigt Poster, Dienst, Länge, Ende („fertig um 22:14“).
  - „Nochmal“ → nächster Zug. Höchstens 3 Züge, dann zeigt die App alle 3 nebeneinander zur Wahl.
- **Nach dem Film:**
  - Am nächsten Morgen fragt das Board beide nach ihrer Bewertung (1–5 Sterne in `accent`, Tipp am Handy oder Board).
  - Dann Status `gesehen`. Die Kachel „Zuletzt gesehen“ zeigt beide Bewertungen nebeneinander.
- **Streaming aktuell halten:**
  - Ein Cron prüft einmal pro Woche die Anbieter aller Filme auf der Merkliste.
  - Neu verfügbar → Hinweis am Board: „Oppenheimer jetzt bei Prime“.

## Stufe 3: Extras (einzeln nachfragen)

- **Wochenrückblick:** „Diese Woche: 1 Film, Ø 4,5 Sterne.“
- **Jahresliste:** alle gesehenen Filme mit Bewertungen, „Wo wart ihr euch am uneinigsten?“
- **Serien:** `kind = tv` mit „aktuelle Staffel/Folge“ pro Person.
- **Verknüpfung Smart Home** (`docs/smarthome-modul.md`): „Den schauen wir“ dimmt das Wohnzimmer auf die Szene „Filmabend“.
- **Besuchsmodus:** Zufall mit „Gäste schauen mit“ (lässt „lieber_nicht“ von beiden weg und bevorzugt Filme mit hoher TMDB-Bewertung).

## Was nicht gebaut wird

- Kein Abspielen und keine Links zu illegalen Quellen.
- Bei den Streaming-Anbietern nur der Name. Optional öffnet ein Tipp den Anbieter.

---

## Entscheidungen Jonathan (20.10.2026)

- Umfang: Stufe 1 + 2 komplett, aus Stufe 3 nur Wochenrückblick und Jahresliste.
- Serien gleich mit auf die Merkliste (`kind = tv`), ohne Staffel-/Folgen-Fortschritt; Zufall wählt aus Filmen und Serien.
- Abstimmen in 4 Stufen (unbedingt / gerne / egal / lieber nicht).
- Eigene Dienste: Netflix, Prime Video, Disney+, Joyn, ARD Mediathek, ZDF Mediathek. „Läuft bei uns“ = nur im Abo (flatrate); Leihen/Kaufen nur als Hinweis ohne Preis.
- Wand: nur ein Knopf „Filme“ (eigene Ansicht), keine Kachel, keine Abend-Karte. Handy: eigener Bereich plus Kachel für die Startseite (wählbar im Startseiten-Editor).
- „Was schauen wir?“ nur in der Filme-Ansicht, kein Hinweis von selbst.
- Bewerten: am nächsten Morgen Karte oben an Handy und Wand, bis beide bewertet haben (höchstens 3 Tage).
- Leviona: Teilen am Android über die App „HTTP Shortcuts“, Suche in der App; Push an sie, sobald sie es in den Einstellungen selbst einschaltet.
- TMDB-Bedingungen geprüft (20.10.2026): private Nutzung erlaubt, TMDB-Logo + Hinweis „nicht von TMDB empfohlen oder geprüft“, Daten höchstens 6 Monate zwischenspeichern, Streaming-Daten mit „Daten von JustWatch“.

## Stand (20.10.2026)

Gebaut: Stufe 1 und 2, aus Stufe 3 Wochenrückblick und Jahresliste. Details zur Technik in CLAUDE.md (Abschnitt Filme). Offen aus Stufe 3 (nur nach Rückfrage): Serien-Fortschritt, Smart-Home-Szene, Besuchsmodus „Gäste schauen mit“.

## Vorgemerkt (26.10.2026, Idee Jonathan)

- **Vorschläge** (als Nächstes, Plan folgt): Filme und Serien passend zu euren Sternen und Merkliste-Stimmen (TMDB „Empfehlungen“/„Ähnliche“ der gut bewerteten und „unbedingt“-Filme, gezählt und gewichtet; „lieber nicht“ und schlechte Bewertungen drücken Ähnliches nach unten) plus Neues (neue Filme/Serien/Staffeln, neu bei euren Abo-Diensten). Bekanntes, Gemerktes und Verworfenes fällt raus.
- **Wischen wie bei Tinder** (später, erst nach Go): Karte mit Poster, Kurzinfo, Trailer auf Antippen; rechts = gefällt mir, links = nicht. Auf die Merkliste nur bei Match (beide rechts) mit kleiner Match-Animation; einseitige Treffer bleiben als „Möglichkeiten“, ohne zu zeigen, wer was gewischt hat; links Gewischtes kommt nicht wieder. Vor allem am Handy.

