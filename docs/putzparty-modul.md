# Modul: Putz-Party

Putzen als gemeinsamer Sprint: Zeit wählen, Musik an, das Board verteilt die fälligen Aufgaben fair und zählt herunter. Jeder sieht groß seine aktuelle Aufgabe. Am Ende ist der Putzplan aktualisiert und es gibt eine kleine Feier.

Voraussetzungen:

- Putzplan-Modul (Phase 2) mit `chore_rules` und `chore_tasks`
- Startseite und Realtime
- Optional: NFC-Modul (Tag zum Starten), Smart Home (Licht)

Keine neuen Secrets.

---

## Stufe 1: Sprint

### Ergänzungen am Putzplan

- `chore_rules` bekommt `minutes` (geschätzte Dauer, Standard 10) und `room`.
- Neue Tabelle `chore_prefs`: `member`, `rule_id`, `pref` (`gerne` | `egal` | `ungern`). Jede Person stellt das nur für sich ein.
- Schnelle Extra-Aufgaben ohne Rhythmus (z. B. „Kühlschrank auswischen“) liegen in `chore_rules` mit `repeat = null` und dem Flag `party_only`.

### Starten

- **Wege:** Kachel „Putz-Party“ am Board oder Handy, NFC-Tag (Typ `scene` bzw. Link `#/putzparty`), oder Szene „Sonntags-Ritual“ aus dem NFC-Modul.
- **Fragen:**
  - Wer macht mit? Personen-Chips, Standard: alle, die zu Hause sind.
  - Wie lange? 20, 30, 45, 60 min.
- **Verteilung:**
  1. Überfällige und heute fällige Aufgaben zuerst, dann die für diese Woche, dann `party_only`.
  2. So viele, bis die Summe der Minuten etwa der Zeit × Personen entspricht.
  3. Danach fair verteilen: Minuten möglichst gleich, `gerne` vor `egal` vor `ungern`.
  4. Wer eine Aufgabe zuletzt gemacht hat, bekommt sie seltener.
  5. Gleicher Raum möglichst hintereinander.
- **Vorschau:** Wer welche Aufgaben bekommt. Tauschen per Ziehen (dnd-kit), dann „Los geht’s“.

### Während der Party (Board, Vollbild)

- **Oben:** großer Countdown in der `clock`-Schrift und ein Fortschrittsbalken für alle Aufgaben zusammen.
- **Darunter eine Spalte pro Person** in Personenfarbe:
  - jetzt: aktuelle Aufgabe groß, mit Raum und Minuten
  - danach: die nächsten 2 klein
- **Abhaken:** Tipp auf die eigene Aufgabe (Board oder Handy):
  - Haken mit `ease-spring`, Punkte fliegen in den Team-Zähler, die nächste Aufgabe rückt nach.
  - Gilt sofort als erledigt im Putzplan (`chore_tasks`).
- **Hilfe:** Wer früher fertig ist, bekommt „Hilf mit: Bad“ oder eine `party_only`-Aufgabe.
- **Endspurt:** In den letzten 5 min wechselt der Countdown auf `accent` und pulsiert ruhig.
- **Musik:**
  - In den Einstellungen eine Playlist-URL (Spotify, Apple Music).
  - „Los geht’s“ öffnet sie auf dem Handy der Person, die gestartet hat.
  - Kein eigener Player.
- **Licht (optional):** Mit dem Smart-Home-Modul schaltet die Party eine Szene „Putzen hell“ und am Ende wieder zurück.

### Ende

- Beim Ende der Zeit oder wenn alles erledigt ist: Konfetti in den Palettentönen, nur einmal und kurz, bei `prefers-reduced-motion` ohne Konfetti.
- Zusammenfassung:
  - Dauer, Aufgaben, Team-Punkte
  - pro Person eine Zahl, ohne Rangliste als Standard
  - „Wieder sauber: Bad, Küche, Flur“
- Liegengebliebenes bleibt normal im Putzplan. Es wird nicht bestraft und nicht verschoben.

## Stufe 2: Motivation (einzeln nachfragen)

- Punkte pro Aufgabe = Minuten. Teamziel pro Monat, sichtbar in der Putzplan-Kachel als Ring.
- Serien: „3 Wochen in Folge eine Putz-Party“, als kleines Abzeichen.
- Per Einstellung, Standard aus: Duell-Ansicht mit Punkten pro Person, wie bei der NFC-Statistik.
- Wochenrückblick: „Putz-Party So, 38 min, 9 Aufgaben.“
- Bilder vorher und nachher sind bewusst nicht vorgesehen.
