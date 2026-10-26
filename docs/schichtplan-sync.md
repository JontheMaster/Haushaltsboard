# Erweiterung Kalender: Levionas Schichten (Supershift)

Levionas Dienste aus der App Supershift erscheinen am Board. Sie stehen nicht als normale Termine im Kalender, sondern als klare Schicht-Zeile: Früh, Spät, Nacht, Frei. Andere Module nutzen sie auch: Essensplan, Heimweg und „Wer ist wann da“.

**Nur mit Levionas Zustimmung.** Sie richtet den Export selbst ein und entscheidet, ob ihre Schichten im Besuchsmodus sichtbar bleiben.

Voraussetzung: Kalender-Modul (Phase 2) mit Edge Function `calendar` und Tabelle `calendars`.

---

## Einrichtung (Leviona, einmalig)

Supershift selbst liefert vermutlich keine iCal-Adresse. Der Weg geht über einen eigenen Google-Kalender.

1. **Prüfen:** In Supershift unter Einstellungen nach „Kalender-Synchronisation“ oder „Export in Kalender“ suchen. Ob das zur kostenlosen Version gehört oder Premium braucht, steht dort.
2. **Google-Kalender anlegen:** In Google Kalender (Web) einen neuen Kalender „Schichten“ anlegen.
3. **Google-Konto am iPhone:** Unter Einstellungen → Apps → Kalender → Accounts muss das Google-Konto mit „Kalender“ aktiv sein.
4. **Sync einstellen:** In Supershift die Synchronisation auf den Kalender „Schichten“ (Google) stellen.
5. **Adresse holen:** In Google Kalender (Web) → Einstellungen von „Schichten“ → „Privatadresse im iCal-Format“ kopieren.
6. **Secret anlegen:** Jonathan legt das Secret `ICAL_LEVIONA_ARBEIT` an und gibt die Adresse dort ein, nicht im Chat. (Erledigt 25.10.2026, Kalender-ID `leviona_arbeit`, Name „Arbeit, Schichten“, Farbe `cal-coral`.)

**Falls Supershift keinen Sync anbietet**, gibt es zwei Auswege:

- Supershift-Export als Datei. Ein Kurzbefehl lädt sie einmal im Monat hoch, ähnlich wie der CSV-Import bei den Finanzen.
- Schichten von Hand in der App eintragen: eine Woche mit 7 Tipps, mit Vorlagen.

Claude Code baut einen davon nur nach Rückfrage.

## Umsetzung

Stand 26.10.2026 (Entscheidung Jonathan): zuerst nur Schicht-Arten (`shift_types`) und die Schicht-Zeile. Die Kachel „Wer ist wann da“ und die Punkte unter „Andere Module“ sind vorgemerkt und kommen erst nach erneutem Go.

- **Tabelle `calendars`** bekommt `kind` mit den Werten `termine` (Standard) und `schicht`.
- **Neue Tabelle `shift_types`:**
  - Felder: `match` (Text oder Regex auf den Termintitel), `label`, `short` (F, S, N, Frei, Urlaub, …), `icon` (Lucide: sunrise, sunset, moon, palm-tree, …), `color` (Token aus dem Design System), `sort`.
  - Start-Werte: aus den ersten importierten Titeln vorschlagen, Leviona bestätigt in den Einstellungen.
- **Edge Function `calendar`:** lädt den Schicht-Kalender mit, ordnet über `shift_types` zu und liefert Schichten getrennt von den Terminen. Unbekannte Titel bleiben als „Schicht“ mit dem Originaltext.
- **Darstellung:**
  - Wochenansicht: eine schmale Zeile „Leviona“ ganz oben pro Tag mit Badge, z. B. „Spät 13:30–21:30“ mit Icon. Grundton `person-b-soft`, die Schicht-Art am Icon, nicht nur an der Farbe.
  - Heute-Kachel: „Leviona heute Spätdienst bis 21:30“.
  - Neue kleine Kachel (s) **„Wer ist wann da“:** heute und morgen, beide Personen, aus Schichten und ganztägigen Terminen (z. B. Uni, Arbeit, wenn markiert).
- **Andere Module:**
  - Essensplan: Bei Spät- oder Nachtdienst schlägt er ein schnelles Gericht vor oder „für später warm halten“ und markiert den Tag.
  - Heimweg / NFC: Ein Dienstende kann einen Hinweis an Jonathan auslösen („Leviona hat in 30 min Feierabend“). Standard aus, nur wenn Leviona es einschaltet.
  - Wochenrückblick: „Diese Woche 3 Früh, 1 Spät.“

## Besuchsmodus und Datenschutz

- Standard: Schichten bleiben sichtbar, nur als Kurzform. Leviona kann sie in den Einstellungen für den Besuchsmodus ausblenden.
- Die Termintitel werden nicht dauerhaft gespeichert, wie bei den anderen Kalendern.
