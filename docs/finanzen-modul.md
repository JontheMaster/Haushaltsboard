# Modul: Finanzen

Das Board zeigt, wann, wofür und wie viel Geld ausgegeben wird, ohne Bankzugangsdaten auf dem Server. Zwei Datenquellen ergänzen sich:

- **Apple Pay live:** Jede Zahlung mit der ING-Karte in Apple Pay startet eine iPhone-Kurzbefehle-Automation und landet sekundengenau mit Betrag, Händler und Uhrzeit im Board.
- **CSV einmal im Monat:** Der Export aus dem ING-Banking ergänzt alles, was nicht über Apple Pay läuft (Überweisungen, Lastschriften, Abos, physische Karte), und bestätigt die Apple-Pay-Buchungen.

Bewusst **kein** FinTS und kein Open-Banking-Zugang: keine Bank-Logins in Supabase, keine Freigaben, die ablaufen.

Vier Stufen, nacheinander, jeweils erst nach Jonathans Go:

1. Grundlage: Tabellen, Kategorien, CSV-Import, Zuordnen
2. Apple Pay live und Abgleich mit der CSV
3. Auswertung und Budgets
4. Gemeinsame Ausgaben und Abos

Voraussetzungen: Login, Modul-System, Einstellungen. Persönliche Tokens (`member_tokens`) aus dem NFC-Modul wiederverwenden; gibt es sie noch nicht, hier anlegen, genau wie in `docs/nfc-modul.md` beschrieben.

---

## Datenschutz (gilt für alle Stufen)

- Gespeichert werden nur: Buchungsdatum, Uhrzeit (falls bekannt), Gegenpartei (Name), gekürzter Verwendungszweck, Betrag, Kategorie, Quelle, Hash. **IBAN, BIC, Mandatsreferenzen, Gläubiger-IDs und Kontostände werden vor dem Speichern entfernt** (Regex) und nie gespeichert.
- Jede Buchung gehört einer Person (`owner`). RLS: Eigene Buchungen sieht nur der Besitzer. Buchungen mit `household = true` sehen beide.
- Am Wand-Tablet nur zusammengefasste Haushaltszahlen (Budgets, Summen), nie einzelne private Buchungen. Der Besuchsmodus blendet das ganze Modul aus.
- Leviona nutzt das Modul nur, wenn sie selbst zustimmt und ihre eigenen Daten hochlädt.

---

## Stufe 1: Grundlage

### Datenbank

- `fin_categories`: `id`, `name`, `icon` (Lucide), `color` (Token-Name aus dem Design System), `household_default` (bool), `monthly_budget` (numeric, optional), `sort`.
- Start-Kategorien: Lebensmittel, Drogerie, Haushalt, Wohnen, Nebenkosten, Mobilität, Essen gehen, Lieferdienste, Freizeit, Abos, Gesundheit, Kleidung, Geschenke, Sonstiges, Einnahmen, Umbuchung (zählt nicht als Ausgabe).
- `fin_rules`: `pattern` (Text oder Regex), `field` (`counterparty` | `purpose`), `category`, `household` (optional), `owner` (null = für beide), `hits`, `created_from` (`seed` | `manual`).
- Start-Regeln für typische Händler: REWE, Edeka, Aldi, Lidl, Netto, Kaufland, Penny → Lebensmittel; dm, Rossmann, Müller → Drogerie; Lieferando, Wolt, Uber Eats → Lieferdienste; DB, VAG, Tankstellen → Mobilität; Netflix, Spotify, Disney+, Apple, Google → Abos.
- `fin_transactions`: `id`, `owner`, `booked_on` (date), `booked_at` (timestamptz, nur bei Apple Pay), `counterparty`, `purpose` (max. 140 Zeichen, bereinigt), `amount` (numeric, Ausgaben negativ), `currency`, `category`, `household` (bool), `source` (`csv` | `applepay`), `status` (`pending` = nur Apple Pay, `booked` = aus CSV bestätigt), `hash` (eindeutig pro owner), `linked_id` (Apple-Pay-Eintrag ↔ CSV-Eintrag), `split` (jsonb, Stufe 4), `created_at`.
- `fin_imports`: `owner`, `file_name`, `from`, `to`, `rows_total`, `rows_new`, `rows_duplicate`, `at`.

### CSV-Import

- **Vor dem Bau:** Jonathan um eine anonymisierte Beispiel-CSV aus dem ING-Banking bitten (ein paar Zeilen, Namen und Beträge geändert). Den Parser an der echten Datei bauen, nicht aus dem Gedächtnis.
- Erwartet: ING-Export mit Kopfbereich (Kontoinfos) und danach einer Tabelle mit Semikolon als Trenner, deutschen Zahlen (`1.234,56`) und Datumsangaben (`TT.MM.JJJJ`). Zeichensatz kann Windows-1252 sein, beide Varianten unterstützen. Spalten über die Kopfzeile finden, nicht über feste Positionen.
- Parser als gemeinsames TypeScript-Modul, das im Browser und in der Edge Function läuft.
- Ort am Handy (Entscheidung Jonathan 11.10.2026): eigener Reiter „Finanzen“ unten in der Leiste, wie Todos und Essen (sechster Reiter, ca. 62 px breit bei 375 px). Der Reiter erscheint nur für Personen, die Finanzen für sich eingeschaltet haben, und nie im Besuchsmodus. Stufe 1 füllt ihn mit Import, Zuordnen und letzten Buchungen, Stufe 3 mit der Auswertung.
- Ablauf in der App (Handy, Reiter Finanzen → „Umsätze importieren“): Datei wählen → Vorschau (Zeitraum, Anzahl, Summe, wie viele neu und wie viele schon bekannt) → „Importieren“.
- Doppelte erkennen über `hash` = sha-256 aus Datum, Betrag, normalisierter Gegenpartei und bereinigtem Verwendungszweck.
- Kategorie über die Regeln setzen; ohne Treffer → `Sonstiges` + Eintrag in „Zuordnen“.
- Upload per iPhone-Teilen: Kurzbefehl „Ans Haushaltsboard“ (nimmt Dateien aus dem Teilen-Menü an) schickt die CSV an Edge Function `finance-import` (`POST`, Bearer-Token, Datei als Body). Anleitungskarte dafür in der App.
- Erinnerung: Am 1. jedes Monats legt ein Cron-Job für jede Person mit aktivem Modul das Todo „Umsätze hochladen“ an.

### Zuordnen

- Liste aller Buchungen ohne sichere Kategorie, eine Karte pro Buchung, Kategorie per Tipp.
- Beim Zuordnen fragen: „Immer so für <Gegenpartei>?“ → erzeugt eine Regel. So wird die Liste jeden Monat kürzer.
- Pro Buchung umschaltbar: Haushalt ja/nein.

---

## Stufe 2: Apple Pay live

### iPhone-Automation (Text für die Anleitungskarte)

1. Kurzbefehle → Automation → + → **Transaktion** (Wallet) → die ING-Karte(n) auswählen → **Sofort ausführen**.
2. Neuer leerer Kurzbefehl → **Inhalte von URL abrufen**: `POST https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/finance-tx`, Header `Authorization: Bearer <Token>`, Anfragetext JSON mit den Feldern `amount`, `merchant`, `card` aus der Kurzbefehl-Eingabe (Betrag, Händler, Karte).
3. Optional: **Mitteilung anzeigen** mit der Antwort („REWE · 23,47 € · Lebensmittel“).

Braucht iOS 17 oder neuer.

### Edge Function `finance-tx`

- Token prüfen wie im NFC-Modul. Betrag robust parsen (`23,47 €`, `-23.47`, mit oder ohne Währung).
- Buchung anlegen mit `source = applepay`, `status = pending`, `booked_at = jetzt`, Kategorie über die Regeln.
- Doppelte innerhalb von 2 Minuten mit gleichem Betrag und Händler ignorieren.
- Antwort: kurzer deutscher Text mit Händler, Betrag und Kategorie.
- Optional (Einstellung, Standard aus): Haushaltsbuchungen erscheinen kurz als dezenter Hinweis am Board („Einkauf REWE · 23,47 €“). Private Buchungen nie.

### Abgleich mit der CSV

- Beim CSV-Import sucht das Board zu jeder Kartenzahlung einen offenen Apple-Pay-Eintrag: gleicher Betrag, Datum ±3 Tage, ähnlicher Händlername.
- Treffer: beide verknüpfen (`linked_id`), Status `booked`, Uhrzeit aus Apple Pay behalten, Kategorie aus Apple Pay behalten, falls schon manuell gesetzt. Es zählt nur eine Buchung.
- Apple-Pay-Einträge ohne Gegenstück nach 14 Tagen in „Zuordnen“ markieren („nicht in der Bankbuchung gefunden“).

---

## Stufe 3: Auswertung und Budgets

Reiter „Finanzen“ am Handy (alles, auch private Buchungen der Person) und eine eigene Ansicht „Finanzen“ am Wand-Tablet neben Heute, Woche, Essen und Abfahrten (Entscheidung Jonathan 11.10.2026), dazu zusammengefasste Kacheln am Board. An der Wand nur Haushalt, nie einzelne private Buchungen; im Besuchsmodus verschwindet der Knopf.

Wand-Ansicht „Finanzen“ (Entwurf 11.10.2026), zwei Reihen à drei Karten:

- Oben: Monat Haushalt (Summe, Abweichung zum Schnitt der letzten 3 Monate, gestapelter Balken nach Kategorie mit Abweichung in %), Budgets (2×2 Ringe), Verlauf 12 Monate (Balken, aktueller Monat in accent).
- Unten: Wann (Heatmap Wochentag × 7–23 Uhr, nur Apple-Pay-Haushaltsbuchungen, mit Hinweis auf die Datenbasis), Wo (Top-Händler Haushalt mit Anzahl und Ø), Auffällig (Hinweiskarten: über dem Schnitt in `urgent`, Budget ab 90 % in `warning`).

| Ansicht | Inhalt | Darstellung |
| --- | --- | --- |
| Monat | Ausgaben nach Kategorie, Vergleich zum Schnitt der letzten 3 Monate | gestapelter Balken + Liste mit Abweichung in % |
| Verlauf | 12 Monate Ausgaben, Einnahmen, Saldo des Monats | Linie bzw. Balken |
| Wann | Wochentag × Uhrzeit (nur Apple-Pay-Daten, Hinweis auf die Datenbasis) | Heatmap 7 × 24 |
| Wo | Top-Händler, Anzahl Einkäufe, Ø Betrag pro Einkauf | Rangliste |
| Budget | pro Kategorie mit Budget: Stand, Prognose bis Monatsende (Tempo der bisherigen Tage) | Fortschrittsring, ab 90 % `warning`, über 100 % `urgent` |
| Auffällig | Kategorien deutlich über ihrem Schnitt („Lieferdienste +40 %“) | Hinweiskarten |

- Board-Kacheln: „Budget“ (2–4 Ringe für die wichtigsten Haushaltskategorien) und „Monat“ (Summe Haushalt diesen Monat vs. Schnitt).
- Wochenrückblick (Phase 5) bekommt eine Zeile: „Diese Woche 186 € für den Haushalt, davon 124 € Lebensmittel.“
- Später möglich: Kosten pro Gericht im Essensplan, Einkaufsdauer aus „Einkauf live“.
- Aggregation als SQL-Views oder RPCs mit `security_invoker`, Zeitzone `Europe/Berlin`. Diagramme im Stil des Design Systems, Kategoriefarben aus den Palettentönen, animiert nach den Bewegungs-Tokens.

---

## Stufe 4: Gemeinsame Ausgaben und Abos

### Wer schuldet wem

- Haushaltsbuchungen haben einen Zahler (`owner`) und eine Aufteilung (`split`, Standard 50/50, pro Kategorie oder Buchung änderbar).
- Saldo zwischen beiden: „Leviona bekommt 42,50 € von Jonathan“, mit Verlauf.
- „Ausgleichen“ setzt den Saldo per Gegenbuchung auf null (vermerkt, wer wem was überwiesen hat; das Board überweist nie selbst).
- Funktioniert nur, wenn beide ihre Daten hochladen oder Apple Pay verbinden; sonst Hinweis statt falscher Zahlen.

### Abos und Fixkosten

- Wiederkehrend erkennen: gleiche Gegenpartei, ähnlicher Betrag (±10 %), mindestens 3 Mal in ungefähr festem Abstand (monatlich, vierteljährlich, jährlich).
- Liste „Abos und Fixkosten“ mit Betrag pro Monat (jährliche umgerechnet), nächster Abbuchung und Summe.
- Preiserhöhung erkannt → Hinweis („Spotify kostet seit Oktober 1,00 € mehr“).
- Abo als „kündigen“ markieren → Todo für den Besitzer.

---

## Was nicht gebaut wird

- Kein Zugriff auf das Bankkonto über FinTS oder Open Banking, keine Bank-Logins in Secrets.
- Keine Überweisungen oder Zahlungen aus dem Board.
- Keine Anlage- oder Finanzberatung, nur Auswertung der eigenen Daten.
