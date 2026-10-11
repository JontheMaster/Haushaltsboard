# Modul: NFC-Aktionen und Statistik

Ein NFC-Sticker im Haushalt löst per iPhone-Kurzbefehl eine Aktion im Haushaltsboard aus, ohne dass eine Seite aufgeht. Jeder Scan wird mit Person und Uhrzeit protokolliert. Daraus entsteht eine Auswertung: wer was wie oft und wann macht.

Vier Stufen, nacheinander:

- **Stufe 1: NFC-Grundmodul** (Aktionen auslösen)
- **Stufe 2: Tracking und Statistik** (Auswertung der Scans)
- **Stufe 3: Szenen** (ein Tipp verbindet alle Module des Boards, das eigentliche Highlight)
- **Stufe 4: Kleine Extras** (einzeln nach Absprache)

Voraussetzung: Phase 2 (Todos, Putzplan, Bring!-Function, Einstellungen, Modul-System). Fehlt etwas davon, zuerst mit Jonathan klären.

---

## Stufe 1: NFC-Grundmodul

### Ablauf

1. iPhone liest den Sticker. Eine persönliche Kurzbefehle-Automation (Auslöser „NFC“, „Sofort ausführen“) startet.
2. Der Kurzbefehl schickt `POST https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/nfc` mit Header `Authorization: Bearer <persönlicher Token>` und Body `{"action":"<slug>"}`.
3. Die Edge Function prüft den Token, findet die Person, führt die Aktion aus, schreibt ein Event und antwortet mit `{ "ok": true, "message": "Bad putzen erledigt" }`.
4. Das Board aktualisiert sich über Realtime. Der Kurzbefehl zeigt `message` als Mitteilung.

Die Sticker müssen nicht beschrieben werden: iOS erkennt jeden Sticker an seiner ID. Leere NTAG213/215-Sticker reichen.

### Datenbank

- `nfc_actions`
  - `slug` (text, eindeutig, z. B. `bad-geputzt`), `label`, `icon` (Lucide-Name), `type`, `params` (jsonb), `enabled`
  - `category`: `haushalt` | `persoenlich` | `vorrat` | `wartung` | `spass`
  - `points` (int, Standard 1), `private` (bool, Standard false; true bei `persoenlich`)
  - `owner` (member, nur bei privaten Aktionen)
- `member_tokens`: `member`, `token_hash` (sha-256), `label` („iPhone Jonathan“), `created_at`, `last_used_at`, `revoked`. Der Token selbst wird nie gespeichert.
- `nfc_events`: `action`, `member`, `at` (timestamptz), `ok`, `message`, `private` (aus der Aktion kopiert).
- RLS wie überall (`is_member()`). Zusätzlich: Events mit `private = true` sieht nur das Mitglied, das sie erzeugt hat. Die Edge Function nutzt den Service-Key.

### Aktionstypen

| Typ | Parameter | Wirkung |
| --- | --- | --- |
| `log` | – | nur protokollieren (reine Zähl-Aktion) |
| `chore_done` | `rule_id` | heutige oder nächste offene Putzplan-Aufgabe abhaken, `done_by` = Person |
| `todo_done` | `match` | offenes Todo von heute mit diesem Titel abhaken |
| `todo_create` | `title`, `in_hours`, `assignee`: `self` / `other` / `open` | neues Todo anlegen; `other` = die Person, die *nicht* getippt hat |
| `bring_add` | `item`, `spec` | Artikel auf die Bring!-Liste „Zuhause“ |
| `visit_toggle` | – | Besuchsmodus umschalten |

### Edge Function `nfc`

- Nur `POST`, nur JSON, nur bekannte `slug`s. Kein freier Text aus dem Kurzbefehl wird ausgeführt.
- Token prüfen (Hash, `revoked`), `last_used_at` setzen. Private Aktionen nur für ihren `owner`.
- Doppeltes Tippen abfangen: dieselbe Aktion derselben Person innerhalb von 60 s nur einmal.
- Bring!-Zugriff über das gemeinsame Bring-Modul, nicht doppelt implementieren.
- Jeder Aufruf schreibt ein `nfc_events`-Eintrag, auch bei Fehlern (`ok = false`).
- Antworttexte kurz und deutsch. „Heute“ in `Europe/Berlin`.

### App: Alle Funktionen → NFC-Aktionen

- Liste der Aktionen mit Icon, Kategorie, An/Aus. Anlegen und Bearbeiten per Formular (Typ wählen, passende Felder).
- „Kurzbefehl-Token erzeugen“: Token einmal anzeigen mit Kopieren-Knopf, danach nur Label und „Widerrufen“.
- Pro Aktion eine Anleitungskarte mit den Werten zum Kopieren (URL, Header, Body) und den Schritten unten.
- Kachel „Zuletzt getippt“: die letzten Scans mit Person, Aktion, Uhrzeit (private nur für den Besitzer).
- Fallback: Route `/tap/<slug>` führt die Aktion mit der angemeldeten Sitzung aus (für Sticker mit URL).

### Einrichtung am iPhone (Text für die Anleitungskarte)

1. Kurzbefehle → Automation → + → NFC → Scannen → Sticker ans iPhone halten → Namen vergeben.
2. „Sofort ausführen“, „Bei Ausführung benachrichtigen“ aus → Weiter → Neuer leerer Kurzbefehl.
3. Aktion „Inhalte von URL abrufen“: URL einfügen, Details öffnen, Methode POST, Header `Authorization` = `Bearer <Token>`, Anfragetext JSON mit Textfeld `action` = Slug.
4. Optional: „Wörterbuchwert abrufen“ (Schlüssel `message`) und „Mitteilung anzeigen“.

### Startaktionen

| Slug | Sticker an | Typ | Kategorie |
| --- | --- | --- | --- |
| `waesche-gestartet` | Waschmaschine | `todo_create` Wäsche aufhängen, 2 h, self | haushalt |
| `spuelmaschine-an` | Spülmaschine | `todo_create` Spülmaschine ausräumen, 3 h, other | haushalt |
| `muell-raus` | Mülltonne | `todo_done` Müll raus | haushalt |
| `bad-geputzt` | Putzschrank | `chore_done` Bad putzen | haushalt |
| `milch-leer` | Kühlschrank | `bring_add` Milch | vorrat |
| `besuch` | Haustür innen | `visit_toggle` | spass |

---

## Stufe 2: Tracking und Statistik

Neues Modul „Statistik“ mit Kachel und Detailseite. Datenquelle: `nfc_events` plus erledigte Todos und Putzplan-Aufgaben (`done_at`, `done_by`), damit auch Abhaken am Board zählt.

### Grundsatz: Team zuerst

- Standard ist die **Team-Ansicht**: gemeinsame Zahlen („Diese Woche 23 Aufgaben zusammen“).
- Die Aufteilung **pro Person** ist eine Einstellung (`settings.stats_per_person`, Standard aus). Erst einschalten, wenn beide das wollen.
- Private Aktionen erscheinen nur in der eigenen Statistik des Besitzers, nie am Wand-Tablet.

### Auswertungen

| Ansicht | Inhalt | Darstellung |
| --- | --- | --- |
| Woche im Überblick | Anzahl und Punkte diese Woche, Vergleich Vorwoche | große Zahl + kleiner Pfeil |
| Wann | Wochentag × Uhrzeit, z. B. „meist sonntags um 11 gesaugt“ | Heatmap 7 × 24 |
| Wie oft wirklich | echter Abstand pro Aktion (Median der letzten 10) | „Bad im Schnitt alle 8 Tage“ |
| Gewohnheiten | Tage mit mindestens einem Scan pro Aktion, aktuelle Serie | Kalender-Heatmap über 12 Wochen + Streak-Zahl |
| Team-Ziel | Punkteziel pro Woche, Fortschritt gemeinsam | Fortschrittsring |
| Pro Person (optional) | Anteile pro Person und Kategorie | gestapelte Balken in Personenfarben |

- Farben und Formen aus dem Design System: Personen `person-a` / `person-b`, Team in `accent`, erledigt `success`.
- Einstellungen: Punkte pro Aktion, Wochenziel, Pro-Person an/aus, Zeitraum.
- Wochenrückblick (Phase 5) liest dieselben Zahlen.
- Putzplan-Vorschlag: Weicht der echte Abstand deutlich vom eingestellten Rhythmus ab, zeigt die Putzplan-Seite einen Hinweis „Bad wird im Schnitt alle 8 Tage geputzt. Rhythmus anpassen?“ Nur Vorschlag, nie automatisch ändern.

### Technik

- Aggregationen als SQL-Views oder RPC-Funktionen (z. B. `stats_week`, `stats_heatmap`, `stats_intervals`, `stats_streaks`), Zeitzone `Europe/Berlin`.
- RLS beachten: Views mit `security_invoker`, damit private Events geschützt bleiben.
- Diagramme mit leichtem SVG oder einer kleinen Bibliothek, animiert nach den Bewegungs-Tokens.

---

## Stufe 3: Szenen

Die Stärke des Boards ist, dass es alles kennt: beide Kalender, Todos, Putzplan, Einkauf, Wetter, Abfahrten, Essensplan, wer zu Hause ist und die Statistik. Eine **Szene** ist ein Sticker, der all das in einem Moment zusammenbringt und eine Antwort gibt, die keine einzelne App geben könnte. Der Sticker liefert dabei drei Dinge: **wer** (Token), **wo** (welcher Sticker) und **wann** (Uhrzeit).

### Szenen-Engine

- Neuer Aktionstyp `scene` mit `params.scene` = Name der Szene.
- Edge Function `nfc` ruft für Szenen eine Szenen-Funktion auf, die die Daten der Module liest (über dieselben Bausteine wie die Kacheln: `calendar`, `bring`, Wetter, Abfahrten, Todos, Putzplan, Essensplan, Statistik).
- Fehlt ein Modul noch (z. B. Abfahrten), lässt die Szene diesen Teil weg, statt zu scheitern.
- Ergebnis zweifach:
  - `message`: kurzer Text für die iPhone-Mitteilung (max. 3 Zeilen).
  - ein **Moment** für das Board: Tabelle `board_moments` (`id`, `scene`, `member`, `payload` jsonb, `created_at`, `expires_at`). Das Wand-Tablet zeigt neue Momente per Realtime als bildschirmfüllende Karte für 30–60 s (Animation: von unten einfliegen, `dur-slow`), danach zurück zur Startseite. Antippen schließt sie.
- Der Kurzbefehl kann zusätzlich `/moment/<id>` am iPhone öffnen, wenn man die Karte unterwegs sehen will.
- Jede Szene ist einzeln an- und ausschaltbar und hat eigene Einstellungen (z. B. Haltestelle, Fußweg).

### Szenen

**1. Tür-Briefing** (Sticker innen an der Haustür, beim Losgehen)

Für die Person, die tippt:

- nächster eigener Termin mit Ort und Uhrzeit
- passende Abfahrt: „U1 in 6 min, du musst in 2 min los“ (Fußweg aus den Einstellungen, Verspätung in `urgent`)
- Wetter für die Zeit, in der man unterwegs ist: „Ab 15 Uhr Regen, Schirm mitnehmen“
- eigene Todos, die man unterwegs erledigen kann (Titel enthält z. B. abholen, bringen, Post, Apotheke) und die Bring!-Liste, falls nicht leer: „Paket abholen · 4 Sachen auf der Einkaufsliste“
- setzt die Person auf „unterwegs“ (Anwesenheit)

**2. Heimkommen** (zweiter Sticker oder derselbe, wenn man als „unterwegs“ gilt)

- setzt „zu Hause“
- Board zeigt, was sich seitdem getan hat: „Leviona hat Wäsche und Bad erledigt · 2 neue Sachen auf der Einkaufsliste · morgen 9:00 Uni“
- sind beide zu Hause und der Abend in beiden Kalendern frei: Hinweis „Ihr habt heute beide frei ab 19 Uhr“

**3. Was kochen wir?** (Sticker am Kühlschrank)

- steht im Essensplan etwas für heute: Gericht anzeigen und ob Zutaten auf der Bring!-Liste noch offen sind („Für Flammkuchen fehlt Schmand“)
- sonst drei Vorschläge aus der Essensbibliothek, gewichtet nach:
  - Zeit: freie Zeit bis zum nächsten Termin beider Personen, kurz → Tag „schnell“
  - Wetter: kalt oder Regen → warme Gerichte
  - zuletzt gekocht: lange nicht dran → weiter oben
  - Vorrat: Gerichte, deren Zutaten gerade *nicht* auf der Einkaufsliste stehen (also vermutlich da sind)
- Antippen eines Vorschlags am Board: in den Essensplan für heute, fehlende Zutaten auf Bring!

**4. Besuch kommt!** (Sticker z. B. am Putzschrank, „Panik-Knopf“)

- fragt im Kurzbefehl optional „In wie vielen Minuten?“ (Standard 60)
- schaltet Besuchsmodus mit Zeitplan ein (ab Ankunft)
- erzeugt einen Blitz-Putzplan: 5–8 kurze Aufgaben (Bad, Küche, Flur, Müll, Gästehandtuch), verteilt auf alle, die gerade zu Hause sind, als `urgent`-Todos mit Countdown-Kachel am Board
- nach dem Besuch: Todo „Gästehandtuch waschen“ für morgen

**5. Sonntags-Ritual** (Sticker am Sofa oder am Board, Sonntagabend)

Board wechselt in den Modus „Wochenplanung“, ein Bildschirm nach dem anderen, weiter per Tippen:

1. Rückblick: Team-Statistik der Woche, längste Serie, Highlight („12 Aufgaben mehr als letzte Woche“)
2. Nächste Woche: beide Kalender nebeneinander, volle Tage markiert
3. Verteilung: Putzplan und offene Todos, vorgeschlagen auf Tage mit Luft (siehe Autopilot)
4. Essen: Essensplan der Woche, Zutaten mit einem Tipp auf Bring!
5. Abschluss: „Woche steht“ mit Konfetti in Palettenfarben (dezent, `prefers-reduced-motion` beachten)

**6. Putzplan-Autopilot** (keine Szene mit Sticker, sondern eine Einstellung im Putzplan, nutzt dieselben Daten)

- verteilt Putzplan-Aufgaben der Woche auf Tage, an denen die zuständige Person abends frei ist (aus ihrem Kalender)
- gleicht nach Kalenderlast aus: Wer diese Woche deutlich mehr Termine hat, bekommt weniger Aufgaben. Anzeige als Vorschlag mit Begründung („Jonathan hat Di–Do volle Abende“), übernehmen mit einem Tipp
- wetterabhängige Aufgaben: Fenster putzen oder Wäsche draußen nur an trockenen Tagen (Feld `weather` in der Regel: `dry`)
- nutzt die echten Abstände aus der Statistik, um Fälligkeiten vorzuschlagen
- ändert nie automatisch, immer Vorschlag + Bestätigung

### Reihenfolge

Szenen bauen auf Modulen anderer Phasen auf (Abfahrten Phase 5, Essensplan Phase 4). Mit dem bauen, was schon da ist: zuerst Heimkommen und Besuch kommt, dann Tür-Briefing, Sonntags-Ritual, Was kochen wir, Autopilot. Vorher mit Jonathan abstimmen.

---

## Stufe 4: Kleine Extras (einzeln, nach Absprache)

| Idee | Sticker an | Umsetzung |
| --- | --- | --- |
| Pflanzen gießen | jedem Topf | Typ `tracker_reset` mit `interval_days`: setzt „zuletzt erledigt“; Kachel zeigt „Monstera seit 9 Tagen trocken“, ab Intervall `warning`, ab doppeltem Intervall `urgent` |
| Wartung | Wasserfilter, Dunstabzug, Rauchmelder | `tracker_reset`; bei Fälligkeit Todo anlegen |
| Kaffee-Zähler | Kaffeemaschine | Typ `counter` mit `threshold`, `todo_title`: nach N Scans Todo „Entkalken“, Zähler zurück |
| Gute Nacht | Bett | Typ `night_mode`; optional private Schlafdauer |
| Vorrat letzte Packung | Klopapier, Waschmittel, Kaffee | `bring_add` je Produkt, Kategorie `vorrat`; Verbrauch in der Statistik |
| Gewohnheiten | Sporttasche, Schreibtisch | `log`, privat; Streak in der eigenen Statistik |
| Gast-Sticker | Garderobe | URL-Sticker (`/tap/gast`) ohne Login: zeigt WLAN-QR und Hausregeln, schaltet Besuchsmodus ein |
