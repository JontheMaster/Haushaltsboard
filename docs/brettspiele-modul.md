# Modul: Brettspiele

Die Spielesammlung mit Zufallsauswahl, die zur Runde passt: wie viele spielen mit, wie viel Zeit ist da und wie viel Kopf will man heute anstrengen. Dazu kommt ein kleines Spiele-Tagebuch mit Siegen und Lieblingsspielen.

Voraussetzungen: Login, Modul-System.

**Daten von BoardGameGeek (BGG):**

- BGG verlangt für die XML API inzwischen wahrscheinlich eine Registrierung der Anwendung und einen Token. **Vor dem Bau die aktuelle Seite „Using the XML API“ prüfen.**
- Ist ein Token nötig, legt Jonathan das Secret `BGG_API_TOKEN` selbst an (Name nennen, nicht ins Repo).
- Die Abfrage läuft nur in der Edge Function `boardgames`, mit Cache und höchstens 1 Anfrage pro Sekunde.
- Hinweis „Daten von BoardGameGeek“ in den Einstellungen.
- Ohne Token funktioniert das Modul trotzdem: Spiele werden dann von Hand angelegt (Name, Spieler, Dauer, Bild als Foto).

---

## Stufe 1: Sammlung

### Datenbank

- `games`:
  - `id`, `bgg_id`, `name`, `year`, `image`, `players_min`, `players_max`, `players_best` (int[]), `time_min`, `time_max`, `weight` (1–5 von BGG oder eigene Einschätzung „leicht / mittel / schwer“)
  - `tags` (text[]: kooperativ, Party, Taktik, Würfel, Karten, Duell, …), `owned` (bool), `wish` (bool), `lent_to` (text), `added_by`, `note`
- `game_plays`: `id`, `game_id`, `played_on`, `players` (jsonb: Mitglied oder Gastname, Punkte, `won`), `duration`, `coop_result` (`gewonnen` | `verloren`, bei kooperativen Spielen), `note`.

### Erfassen

- **Suche in der App:** Name tippen, Ergebnisse von BGG mit Bild, Tipp = in die Sammlung.
- **Barcode-Scan:** optional, nur wenn er einfach geht (Kamera im Browser, Abgleich über den Namen). Sonst weglassen.
- **Import:** Hat Jonathan ein BGG-Konto mit Sammlung, kann man die Sammlung einmalig über den Benutzernamen importieren.
- **Verliehen:** Ein Feld „verliehen an“ erzeugt nach 4 Wochen ein Todo „Spiel zurückholen“ für die Person, die es eingetragen hat.

## Stufe 2: Was spielen wir?

- **Fragen:**
  - Wie viele? Standard 2. Im Besuchsmodus fragt das Board nach der Anzahl.
  - Wie lange? Bis 30 min, bis 60 min, länger.
  - Kopf? Locker, mittel, Strategie.
  - Optional: kooperativ oder gegeneinander.
- **Auswahl gewichtet:**
  - Spiele mit passender „beste Spielerzahl“ zählen mehr.
  - Lange nicht gespielte Spiele zählen mehr.
  - Gerade erst gespielte Spiele zählen weniger.
  - Verliehene Spiele fallen raus.
- **Animation:** Glücksrad oder ein Kartenstapel, der aufgedeckt wird. Rastet mit `ease-spring` ein. Bei `prefers-reduced-motion` nur weiches Einblenden.
- **Karte zum Ergebnis:** Bild, Spieler, Dauer, „zuletzt gespielt vor 3 Monaten“.
- **Knöpfe:**
  - „Das spielen wir“ startet eine Partie mit Timer.
  - „Nochmal“ wählt neu.
- **Board-Kachel (m):** „Spieleabend?“ mit dem Zufallsknopf. Am Wochenende abends sichtbar und im Besuchsmodus immer, sonst ausgeblendet (einstellbar).

## Stufe 3: Partien und Statistik

- **Partie läuft:** Am Board eine kleine Kachel mit Spielname und laufender Zeit. „Fertig“ fragt nach Sieger oder Punkten. Gäste lassen sich mit Namen eintragen.
- **Statistik am Handy:**
  - meistgespielte Spiele
  - Spiele, die lange liegen („Seit 1 Jahr nicht gespielt: Azul“)
  - Ø Dauer pro Spiel
  - Duell Jonathan gegen Leviona pro Spiel und gesamt, in den Personenfarben
  - bei kooperativen Spielen die Teamquote
- **Wochenrückblick:** „2 Partien, Leviona führt bei Carcassonne 7:5.“

## Stufe 4: Extras (einzeln nachfragen)

- **Wunschliste:** Spiele mit `wish = true` erscheinen als Geschenkideen und lassen sich mit einem Tipp als Todo übernehmen („Geschenk für Leviona“, nur für die andere Person sichtbar).
- **Regel-Spickzettel:** pro Spiel eine kurze Notiz (Aufbau, Sonderregeln), die am Tablet groß angezeigt wird.
- **Spieleabend planen:** Termin im Kalender mit `#spieleabend` → die Kachel zeigt am Tag vorher 3 Vorschläge für die Anzahl der Gäste.
- **NFC:** Tag am Spieleregal öffnet „Was spielen wir?“ am Board.
