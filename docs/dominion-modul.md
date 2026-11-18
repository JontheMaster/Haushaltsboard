# Modul: Dominion-Set-Generator

Stellt ein Königreich für Dominion zusammen, nur aus den Erweiterungen, die Jonathan besitzt. Das Set soll stimmig sein: Wenn viele Ziehkarten drin sind, gibt es auch ein Dorf, die Kosten sind gut verteilt, und benötigtes Zusatzmaterial wird mit angezeigt. Trotzdem soll jedes Set anders aussehen. Alles auf Deutsch, mit den deutschen Kartennamen.

Voraussetzungen: Login, Modul-System. Eigenständiges Modul, das Brettspiele-Modul muss dafür nicht laufen. Die Verbindung zum Brettspiele-Modul kommt erst in Stufe 3.

---

## Kartendaten

- Es gibt keine offizielle API. Die Kartendaten liegen als JSON im Repo unter `src/modules/dominion/data/`. Erzeugt werden sie von einem Script in `scripts/dominion/`, das man bei einer neuen Erweiterung einfach neu laufen lässt. Zur Laufzeit wird nichts von außen geladen.
- Quellen:
  - Karten (Erweiterung, Edition, Kosten inkl. Trank und Schulden, Typen, Landschaftskarten): Python-Paket `dominion-setup` (PyPI), JSON-Dateien unter `dominion_setup/data/cards/`.
  - Deutsche Namen: `src/i18n/messages/cards.de.json` aus KingdomCreator, dem Open-Source-Projekt hinter dominionrandomizer.com.
  - Funktions-Tags (Dorf, Entsorgen, +Kauf usw.): Kategorien im Dominion Strategy Wiki (wiki.dominionstrategy.com) über die MediaWiki-API, einmalig beim Erzeugen der Daten. Was das Wiki nicht hergibt, aus den Kartentypen ableiten und in `card-tags.overrides.json` von Hand ergänzen.
- Vor dem Übernehmen die Lizenzen der Quellen prüfen und in `scripts/dominion/README.md` festhalten. Übernommen werden nur Fakten wie Namen, Kosten, Typen und Tags. Keine Kartentexte, keine Kartenbilder.
- Ist ein deutscher Name unklar oder fehlt er, nicht raten: Das Script gibt eine Liste aus, Jonathan prüft sie.
- Mehrere Erweiterungen gibt es in 1. und 2. Edition, außerdem Update-Packs mit den ausgetauschten Karten. Die Daten müssen pro Karte wissen, in welcher Edition sie vorkommt.

Kartenschema (TypeScript):

- `id` (englischer Name als Slug), `name_de`, `name_en`, `set`, `editions` (string[])
- `cost`: `{ coins, potion, debt }`
- `kind`: `kingdom` | `event` | `landmark` | `project` | `way` | `ally` | `trait` | `prophecy` | `support` (Material wie Platin, Ruinen, Segen …)
- `types` (Aktion, Angriff, Reaktion, Dauer, Nacht, …)
- `tags`: `village` (+2 Aktionen), `draw`, `terminal_draw`, `cantrip`, `plus_buy`, `trash`, `gain`, `attack`, `defense`, `payload`, `alt_vp`, `cost_reduce`
- `requires`: Zusatzmaterial oder Abhängigkeiten (siehe unten)
- `complexity`: 1–3 (für die Option „Locker“)

---

## Generator-Logik

Eine reine Funktion `generateKingdom(options, owned, history, seed)` in `src/modules/dominion/generator.ts`. Sie läuft im Browser, mit eigenem Zufallsgenerator mit Seed. Der Seed wird angezeigt, damit man ein Set wieder aufrufen kann. Tests mit Vitest.

### Optionen (Chips über dem Knopf)

- Erweiterungen: Standard alle besessenen, für diese Partie einzeln abwählbar.
- Mischung:
  - „Querbeet“: alle gewählten Erweiterungen
  - „2–3 Erweiterungen“ (Standard)
  - „Fokus“: eine Erweiterung als Schwerpunkt mit 5–7 Karten, Rest aus anderen
- Landschaftskarten: automatisch (meist 1, manchmal 0 oder 2), 0, 1 oder 2.
- Schwierigkeit:
  - „Locker“: nur Karten mit `complexity` 1, keine Tränke, keine Schulden, keine Nachtkarten, höchstens 1 Landschaftskarte und höchstens 1 Karte mit Zusatzmaterial.
  - „Normal“ (Standard)
  - „Alles“
- Angriffe: egal, wenige (max. 1), keine.

### Ablauf

1. Kandidaten filtern: Besitz und Edition, gesperrte Karten, Schwierigkeit, Angriffe.
2. Erweiterungen für dieses Set auslosen (je nach Mischung).
3. 10 Königreichkarten gewichtet ziehen:
   - Karten aus den letzten 3 gespielten Sets zählen deutlich weniger.
   - Karten, die noch nie gespielt wurden, zählen mehr.
   - Favoriten zählen etwas mehr.
4. Prüfen, ob das Set stimmig ist. Bei Verstoß gezielt eine passende Karte tauschen statt komplett neu zu würfeln:
   - Hart: Sind 2 oder mehr terminale Ziehkarten drin, braucht es mindestens 1 Dorf.
   - Hart: Mindestens 2 Karten kosten 3 oder weniger, mindestens 2 kosten 5 oder mehr. Höchstens 4 Karten mit den gleichen Kosten.
   - Hart: Höchstens 3 Angriffe.
   - Weich (meistens, nicht immer): ein Dorf (~80 %), +Kauf (~80 %), eine Möglichkeit zu entsorgen (~75 %), bei 2 oder mehr Angriffen eine Abwehrkarte (~70 %).
   - Höchstens 2 Karten, die Zusatzmaterial brauchen.
   - Alle Prozentwerte und Grenzen als Konstanten oben in der Datei, damit man sie später leicht anpassen kann.
5. Landschaftskarten aus den gewählten Erweiterungen ziehen.
6. Abhängigkeiten auflösen und das Zusatzmaterial zusammenstellen.
7. Zurückgeben: Karten, Landschaftskarten, Zusatzmaterial, Seed und `reasons` (kurze Begründungen für die Anzeige „Warum es passt“, z. B. „Dorf: Arbeiterdorf“, „+Kauf: Markt“, „Entsorgen: Kapelle“).

Gibt der Besitz eine weiche Bedingung nicht her (z. B. nur Basisspiel mit vielen Sperren), entsteht trotzdem ein Set, ohne Fehlermeldung.

### Abhängigkeiten (Beispiele, anhand der Anleitungen bzw. des Wikis vervollständigen)

- Young Witch: zusätzlicher Bann-Stapel mit Kosten 2–3.
- Alchemie: Trank nötig. Wenn Alchemie dabei ist, nach Anleitungsempfehlung 3–5 Alchemie-Karten.
- Blütezeit: Platin und Kolonie mit der Wahrscheinlichkeit, die dem Anteil an Blütezeit-Karten entspricht.
- Dark Ages: Unterschlüpfe statt Anwesen nach derselben Regel. Looter → Ruinen. Karten mit Spoils, Madman, Mercenary.
- Nocturne: Boons, Hexes, Heirlooms, Wisps, Imps, Ghosts, Zombies.
- Abenteuer, Empires, Renaissance, Menagerie: Marker, Matten, Schulden-Marker, Villagers/Coffers, Pferde, Exile.
- Bündnisse: Liaison im Set → genau eine Ally-Karte.
- Plunder: Traits, Loot.
- Rising Sun: Omen im Set → eine Prophecy.
- Sonderfälle: Way of the Mouse, Druid, Ferryman, Riverboat, Obelisk und ähnliche Karten, die einen weiteren Stapel bestimmen.

---

## Stufe 1: Generator

### Datenbank

- Einstellungen in `modules.config` (Modul-ID `dominion`):
  - `owned`: Liste aus `{ set, edition, update_pack }`, Promo-Karten einzeln
  - `banned`, `favorites`: Karten-IDs
  - zuletzt genutzte Optionen
- `dominion_games`: `id`, `created_at`, `created_by`, `seed`, `options` (jsonb), `kingdom` (text[]), `landscapes` (text[]), `extras` (text[]), `played` (bool), `played_on`, `rating` (`gut` | `naja` | null), `note`.
- RLS wie überall über `is_member()`. Realtime für `dominion_games`, damit Handy und Tablet dasselbe Set zeigen.

### Screens

- Einstellungen „Meine Erweiterungen“: alle Erweiterungen mit Schalter, dazu Edition und Update-Pack. Promo-Karten einzeln. Gesperrte Karten und Favoriten verwalten (Suche nach deutschem Namen).
- Detailseite „Neues Set“:
  - Oben die Optionen als Chips, Hauptknopf „Set erstellen“ (Akzent).
  - Ergebnis: 10 Karten, am Tablet als Raster 5 × 2, am Handy als Liste. Pro Karte deutscher Name, Kosten, Typ als farbiger Streifen, Erweiterung als Badge. Sortierung nach Kosten, umschaltbar auf „nach Erweiterung“ (praktisch beim Raussuchen aus den Schachteln).
  - Pro Karte zwei Knöpfe: „Behalten“ (Schloss) und „Tauschen“ (nur diese Karte neu, die Bedingungen bleiben erfüllt). „Alles neu“ würfelt alle Karten ohne Schloss neu.
  - Darunter: Landschaftskarten, „Zusätzlich brauchst du“ (Trank, Platin und Kolonie, Bann-Stapel …) und die Chips „Warum es passt“.
  - Knopf „Das spielen wir“ speichert das Set als gespielt.
- Animation: Karten decken sich nacheinander auf und rasten mit `ease-spring` ein. Bei `prefers-reduced-motion` nur weiches Einblenden.
- Typfarben: Wenn die Tokens keine passenden Farben für Aktion, Angriff, Reaktion, Dauer usw. hergeben, Jonathan fragen statt Werte zu erfinden.
- Kachel:
  - m: „Dominion“ mit dem letzten Set (Namen klein) und Knopf „Neues Set“
  - s: nur der Knopf
  - Standardmäßig nicht auf der Startseite, aber in „Alle Funktionen“.

## Stufe 2: Verlauf und Abwechslung

- Verlauf am Handy: letzte Sets mit Datum, erneut öffnen (über den Seed), bewerten („gut“ / „naja“), Notiz.
- Die Gewichtung nutzt auch die Bewertungen: Karten aus gut bewerteten Sets etwas häufiger, aus „naja“-Sets etwas seltener.
- Statistik: Karten, die noch nie auf dem Tisch lagen, meistgespielte Karten, wie oft jede Erweiterung dran war.
- Teilen: Set als Text kopieren, z. B. für WhatsApp an die Mitspieler.

## Stufe 3: Extras (einzeln nachfragen)

- Verbindung zum Brettspiele-Modul: Zieht „Was spielen wir?“ Dominion, erscheint ein Knopf „Set erstellen“. „Das spielen wir“ legt dann auch eine Partie in `game_plays` an. Nur, wenn beide Module aktiv sind, und über einen kleinen Erweiterungspunkt, ohne das Brettspiele-Modul umzubauen.
- Empfohlene Sets aus den Spielanleitungen als zusätzliche Auswahl, gefiltert nach Besitz.
- Hinweis bei einer Erweiterung, die lange nicht dran war: „Seit 2 Monaten kein Seaside mehr“ → Fokus-Modus vorschlagen.
- Aufbau-Ansicht am Tablet: große Karten, Haken pro Karte für „liegt auf dem Tisch“.

---

## Tests und Abnahme

- Vitest: 1000 Sets mit verschiedenen Besitz-Kombinationen. Harte Bedingungen sind immer erfüllt, Abhängigkeiten immer aufgelöst, nur besessene Karten, keine Doppelten, gleicher Seed ergibt das gleiche Set.
- Funktioniert auch, wenn nur das Basisspiel eingetragen ist.
- Jonathan prüft die Liste der unsicheren deutschen Namen, bevor das Modul live geht.

---

## Umsetzung Stufe 1 (18.11.2026)

Entscheidungen Jonathan:
- Nur am Handy (wie das Massagen-Konto). Zusatzkachel `dominion.set` über „Startseite anpassen“, nicht von selbst auf der Startseite. Antippen öffnet Dominion im Vollbild über allem (Portal, Zurück-Taste schließt). Das Tablet (5 × 2-Raster) kommt später.
- Typfarben aus dem Spiel: Tokens `dom-*` (design/tokens.json, DESIGN.md), abgeleitet aus Grundrahmen und Typ-Faktoren des offenen Kartengenerators von shardofhonor.
- Kartenbilder: nicht eingebaut (urheberrechtlich geschützt, Repo und Seite sind öffentlich).
- Unsichere deutsche Namen in Jonathans Erweiterungen prüft er später (Mine, Navigator, Embargo, Bank, Talisman, Alchemist, Golem, Altar; Venture „Abenteuer“, Loan „Lohn“). Korrekturen in `scripts/dominion/card-overrides.json` → `names_de`, dann Script neu laufen lassen.

Umsetzung:
- Kartendaten: `scripts/dominion/build-cards.mjs` (README mit Lizenzen), Ergebnis `src/modules/dominion/data/`. Besitz läuft über **Schachteln** statt `{set, edition, update_pack}`: `owned.boxes` (z. B. `baseset2`, `seaside`, `prosperity2add`) und `owned.promos` (Karten-IDs). Merkmale für Basis, Seaside, Blütezeit, Alchemisten und Dark Ages von Hand gepflegt (Overrides `tags`), sonst aus KingdomCreator abgeleitet.
- `modules.config` von `dominion`: `owned`, `banned`, `favorites`, `last` (zuletzt genutzte Optionen). Vorbelegt: Basisspiel 2. Ed., Seaside, Blütezeit, Alchemisten, Dark Ages.
- Tabelle `dominion_games` (Migration `20261118154655_dominion`), Realtime. Gespeichert wird erst bei „Das spielen wir“ (`played = true`); das angefangene Set liegt pro Gerät in localStorage `hb-dominion-current`.
- Generator `src/modules/dominion/generator.ts` (Stellschrauben oben), Tests `generator.test.ts` (`npm test`, Vitest). Tauschen = alle anderen Karten behalten, die getauschte kommt nicht wieder. Locker = nur Komplexität 1, keine Tränke/Schulden/Nacht. Alchemie dabei → 3–5 Alchemie-Karten. Blütezeit → Platin und Kolonie, Dark Ages → Unterschlüpfe, jeweils mit dem Anteil der Karten. Ruinen, Beute, Söldner, Verrückter, Tableaus und Marker aus `requires`.
- Code: `DominionTile.tsx` (Kachel, Overlay, Einstellungsseite), `DominionPage.tsx` (Vollbild), `DominionSettings.tsx` (Meine Erweiterungen, Promos, Favoriten/Sperren), `dominionStore.ts`, `cardInfo.ts`, `Cost.tsx`, Styles `src/styles/dominion.css`. Kartendaten und Seite laden erst beim Öffnen (eigenes Paket).
- Bezeichnungen für Zusatzmaterial (`EXTRA_LABELS` im Generator, z. B. „Beute“, „Söldner“, „Verrückter“, „Wirtshaustableau“) sind noch nicht an den echten Karten geprüft.

## Ausbau 18.11.2026 (Design, Kartenbilder, Stufe 2)

Entscheidungen Jonathan: Kartenbilder ja (privat), Design „schick und motivierend“, Stufe 2 gleich mit, ohne „Set teilen“, Bewertung zusätzlich als Push-Erinnerung. Sonst nichts aus Stufe 3.

- Kartenbilder: aus dem Repo von KingdomCreator (englische Karten, `docs/img/cards/<schachtel>/…`, und Illustrationen `docs/img/artworks/…`). Das Wiki hat deutsche Karten, sperrt aber automatische Downloads (Bot-Schutz), deshalb nicht von dort. Zuordnung `supabase/functions/_shared/dominionImages.json` (vom Build-Script). Edge Function `dominion-images` (verify_jwt aus, Mitglieder-Prüfung im Code, liest die Zuordnung aus unserem Repo auf GitHub) legt für alles, was ihr besitzt, `card/<id>.jpg` und `art/<id>.jpg` im privaten Bucket `dominion` ab (Migration `20261118160352_dominion_bilder`, lesen nur Mitglieder). Die App ruft sie beim Öffnen und nach Änderungen an „Meine Erweiterungen“ auf (`images.ts`, signierte Links 1 Std).
- Design: Reiter „Neues Set | Verlauf | Statistik“. Vor dem ersten Set „Was spielen wir heute?“ mit drei Illustrationen als Fächer. Optionen klappen nach dem Erstellen zu einer Zeile zusammen. Charakter des Sets (`character.ts`: Name + Satz, z. B. „Dorf-Maschine“). Karten als Kacheln mit Illustration, Münze, Rahmenfarbe als Leiste, „Neu für euch“; sie drehen sich beim Aufdecken um. Antippen = Karte groß zum Lesen (`CardViewer`, wischen/Pfeile, Behalten/Tauschen, Favorit/Sperren). „Das spielen wir“ mit Konfetti.
- Stufe 2: Verlauf (`History.tsx`: Bild-Streifen, Charakter, Datum, Gut/Naja, Notiz, „Nochmal spielen“, Löschen). Statistik (`Stats.tsx`: Partien, Karten gespielt von x, Fortschritt, „Lag noch nie auf dem Tisch“, Lieblinge, Erweiterungen). Gewichtung: Karten aus „gut“-Sets × 1,25, aus „naja“-Sets × 0,75 (`W_RATED_*`).
- Bewertungs-Erinnerung: `dominion_games.remind_at` (Trigger, 3 Std nach „Das spielen wir“, nachts erst 10 Uhr), Cron `dominion-rating-reminder` alle 10 Min → `private.dominion_rating_reminders()` → `reminders` `{action:'dominion-rate'}` an `modules.config.push_rating` (vorbelegt: Jonathan; Schalter „Erinnerung zum Bewerten“ in den Dominion-Einstellungen, pro Person, Test `dominion-rate-test`). Mitteilung öffnet `?dominion=bewerten` → Verlauf. Am Handy oben zusätzlich die Karte „Wie war euer Dominion-Set?“ mit Gut/Naja (`DominionHeader`, höchstens 3 Tage), und die Kachel fragt nach dem Spielen „Viel Spaß! Wer gewinnt?“.
- Nachtrag 18.11.2026 (Wunsch Jonathan): große Karte als eigenes Vollbild (Kopf mit Name/Typ, Karte, Knöpfe; Hintergrund gesperrt). Statistik zeigt pro Erweiterung „x von y Karten gespielt“ und in wie vielen Partien sie dabei war. Abschnitt „So baut ihr auf“ (`Setup.tsx`): Startdeck, „Liegt immer aus“ (Kupfer bis Fluch, Müll, aus dem Basisspiel) und jedes Zusatzmaterial mit Herkunft und Aufbau-Hinweis, alles antippbar. Bilder dafür als `card/sup_<id>.jpg` (Liste `SUPPORT` im Build-Script, `data/support.json`). Deutsche Kartenbilder: Jonathan speichert sie aus dem Wiki in `scripts/dominion/karten-de/` (nicht im Repo), Claude lädt sie hoch und ersetzt damit die englischen.
