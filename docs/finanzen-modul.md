# Modul: Finanzen

Das Board zeigt, wann, wofür und wie viel Geld ausgegeben wird, ohne Bankzugangsdaten auf dem Server. Zwei Datenquellen ergänzen sich:

- **Apple Pay live:** Jede Zahlung mit der ING-Karte in Apple Pay startet eine iPhone-Kurzbefehle-Automation und landet sekundengenau mit Betrag, Händler und Uhrzeit im Board.
- **CSV einmal im Monat:** Der Export aus dem ING-Banking ergänzt alles, was nicht über Apple Pay läuft (Überweisungen, Lastschriften, Abos, physische Karte), und bestätigt die Apple-Pay-Buchungen.

Bewusst **kein** FinTS und kein Open-Banking-Zugang: keine Bank-Logins in Supabase, keine Freigaben, die ablaufen.

Fünf Stufen, jeweils erst nach Jonathans Go:

1. Grundlage: Tabellen, Kategorien, CSV-Import, Zuordnen
2. Apple Pay live und Abgleich mit der CSV
3. Auswertung und Budgets
4. Abos und Fixkosten (ohne „Wer schuldet wem“)
5. Depot: Bestände, Kurse, Sparpläne, Sparziele (unabhängig von Stufe 2–4, braucht nur Stufe 1)

Voraussetzungen: Login, Modul-System, Einstellungen. Persönliche Tokens (`member_tokens`) aus dem NFC-Modul wiederverwenden; gibt es sie noch nicht, hier anlegen, genau wie in `docs/nfc-modul.md` beschrieben.

---

## Datenschutz (gilt für alle Stufen)

- Gespeichert werden nur: Buchungsdatum, Uhrzeit (falls bekannt), Gegenpartei (Name), gekürzter Verwendungszweck, Betrag, Kategorie, Quelle, Hash. **IBAN, BIC, Mandatsreferenzen und Gläubiger-IDs werden vor dem Speichern entfernt** (Regex) und nie gespeichert. Vom Kontostand wird nur der neueste Saldo pro Konto gemerkt (Anker für den Kontoverlauf, nur am Handy; Entscheidung Jonathan 12.10.2026).
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

## Stufe 4: Abos und Fixkosten

### Wer schuldet wem

Entfällt (Entscheidung Jonathan 12.10.2026): alles Gemeinsame wird vom Gemeinschaftskonto bezahlt.

### Abos und Fixkosten

- Wiederkehrend erkennen: gleiche Gegenpartei, ähnlicher Betrag (±10 %), mindestens 3 Mal in ungefähr festem Abstand (monatlich, vierteljährlich, jährlich).
- Liste „Abos und Fixkosten“ mit Betrag pro Monat (jährliche umgerechnet), nächster Abbuchung und Summe.
- Preiserhöhung erkannt → Hinweis („Spotify kostet seit Oktober 1,00 € mehr“).
- Abo als „kündigen“ markieren → Todo für den Besitzer.

---

## Stufe 5: Depot

Das Board zeigt einen fast live aktualisierten Stand des Depots, **ohne Zugriff auf das Depot selbst**. Kurse sind öffentlich, nur Positionen und Stückzahlen sind privat: Das Board kennt die Bestände und holt die Kurse von einem Marktdaten-Dienst. Kein Handel, keine Order, keine Anlageempfehlungen und keine Bewertung einzelner Positionen; das Board zeigt nur an und rechnet.

### Datenbank

- `fin_holdings`: `id`, `owner`, `isin`, `name`, `symbol` (Börsenkürzel für die Kurs-API, z. B. `EUNL.DE` für Xetra), `quantity` (numeric, Bruchstücke erlaubt), `avg_buy_price`, `currency`, `household` (gemeinsames Depot), `active`, `created_at`. `quantity` und `avg_buy_price` sind der aktuelle Stand; sie werden per Trigger aus `fin_holding_tx` nachgerechnet, nie getrennt gepflegt.
- `fin_holding_tx`: `id`, `holding`, `date`, `type` (`buy` | `sell` | `savings_plan` | `dividend` | `correction`), `quantity`, `price`, `amount`, `source` (`manual` | `csv` | `plan`), `hash` (gegen doppelte CSV-Zeilen), `created_at`.
- `fin_savings_plans`: `id`, `holding`, `amount`, `day_of_month` (1–28), `active`.
- `fin_quotes`: `symbol`, `price`, `currency`, `at` (Zeitpunkt des Kurses laut Anbieter), `fetched_at`. Cache, eine Zeile pro Symbol.
- `fin_quotes_daily`: `symbol`, `day`, `close`. Tagesschlusskurse für Verlauf und Sparplan-Buchung.
- `fin_goals`: `id`, `owner`, `name`, `target_amount`, `source` (`depot` | `konto` | `beides`), `deadline` (optional), `household`, `created_at`.
- RLS wie im restlichen Finanz-Modul: private Bestände, Buchungen, Sparpläne und Ziele nur für den Besitzer, `household = true` für beide, das Wand-Tablet nie Zeilen. `fin_quotes` und `fin_quotes_daily` sind öffentliche Kurse, aber nur für Symbole lesbar, die man selbst sehen darf (sonst verriete die Liste, welche Papiere die andere Person hat).

### Erfassen

- Handy, Reiter Finanzen → „Depot“ → „Position hinzufügen“: ISIN eintippen → das Board sucht Name und Xetra-Kürzel (OpenFIGI, kostenlos, ohne Schlüssel: ISIN → deutsches Börsenkürzel, dann bei der Kurs-API prüfen) → Stückzahl, Kaufkurs (oder Kaufsumme), Datum, gemeinsam ja/nein. Legt eine `buy`-Buchung an.
- Verkauf, Dividende und Korrektur als eigene Buchung an der Position.
- **CSV-Import der Depotübersicht aus dem ING-Banking:** Vor dem Bau Jonathan um eine anonymisierte Beispiel-CSV bitten und den Parser an der echten Datei bauen (wie in Stufe 1). Gleicher Ansatz: Kopfzeile suchen, Windows-1252, deutsche Zahlen. Abgleich per ISIN: Die Stückzahl aus der CSV ist die Wahrheit, Abweichungen werden als `correction` gebucht und angezeigt („+0,0412 Stück aus der Depotübersicht“). Depot- und Kundennummern werden nie gespeichert.
- **Kombi mit dem Giro-Export aus Stufe 1:** Zeilen „Wertpapierkauf … ISIN …“ (Sparplan-Ausführungen, stehen schon heute im Export) werden erkannt und der passenden Position als eingezahlter Betrag zugeordnet. Die Stückzahl kommt dann aus Schlusskurs bzw. Depotübersicht.

### Sparpläne

- Pro Position: Betrag und Ausführungstag (1–28). Fällt der Tag auf ein Wochenende oder einen Börsenfeiertag, gilt der nächste Handelstag.
- Cron am Abend (nach Xetra-Schluss): Für jeden fälligen aktiven Sparplan wird eine `savings_plan`-Buchung angelegt, Stückzahl = Betrag / Schlusskurs des Tages (aus `fin_quotes_daily`). Fehlt der Kurs, versucht er es am nächsten Abend wieder; nie doppelt (eine Ausführung pro Sparplan und Monat).
- Der nächste CSV-Abgleich (Depotübersicht oder Giro-Export) korrigiert Abweichungen per `correction`.

### Kurse

- Edge Function `depot-quotes`: holt Kurse für alle aktiven Symbole und schreibt `fin_quotes`; nach Börsenschluss zusätzlich den Tagesschlusskurs in `fin_quotes_daily`.
- Cron alle 15 Minuten an Werktagen; die Function selbst prüft die Xetra-Zeit in Europe/Berlin (9:00–17:30, ein paar Minuten Puffer) und läuft außerhalb davon nur einmal am Abend (22:00). Feiertage: Ändert sich der Kurs nicht, wird nichts neu geschrieben.
- Anbieter: siehe Auswahl unten. Ein Schlüssel, falls nötig, liegt nur als Supabase-Secret `QUOTES_API_KEY` (trägt Jonathan selbst ein), nie im Repo.
- Fällt die API aus: Der letzte Kurs bleibt stehen, mit Zeitstempel („Stand 14:32“, ab einem Tag „Stand Fr 17:30“). Nie leere Kacheln, nie 0 €.
- Fremdwährung (z. B. eine USD-Aktie): Umrechnung mit dem EZB-Referenzkurs des Tages (frei verfügbar), angezeigt immer in Euro.

### Auswertung

| Ansicht | Inhalt | Darstellung |
| --- | --- | --- |
| Kachel „Depot“ | Depotwert, Veränderung (heute, in der ruhigen Ansicht Woche/Monat) in % und €, Verlaufslinie 30 Tage | große Zahl, Linie; Gewinn `success`, Verlust `urgent` |
| Positionen | Name, Anteil am Depot, eingezahlt vs. aktueller Wert, Gewinn/Verlust seit Kauf in € und % | Liste mit Anteilsbalken |
| Verlauf | 1 M / 6 M / 1 J / alles: Depotwert und eingezahltes Geld | zwei Linien, Fläche dazwischen = Gewinn bzw. Verlust |
| Dividenden | pro Jahr und Position | Balken und Liste |
| Sparziele | `fin_goals`: Ziel-Ring als Kachel, z. B. „Urlaub 2027: 64 %“, mit Deadline („noch 14 Monate“) und nötiger Rate pro Monat | Fortschrittsring |
| Sparquote | pro Monat: Einzahlungen ins Depot (Käufe und Sparpläne) geteilt durch Einnahmen aus Stufe 1 | Balken über 12 Monate |

- Ort am Handy: im Reiter „Finanzen“ ein Umschalter „Konto | Depot“.
- Ort an der Wand: in der Ansicht „Finanzen“ (Stufe 3) eine Karte „Depot“ und die Ziel-Ringe. Ist Stufe 3 noch nicht gebaut, bekommt die Ansicht zunächst nur diese Karten.
- Aggregation als SQL-Views oder RPCs mit `security_invoker`, Zeitzone `Europe/Berlin`. Ausnahme Wand: Das Tablet-Konto darf keine Zeilen sehen, deshalb eine eigene RPC (`security definer`), die **nur Prozentwerte und Ziel-Fortschritt der gemeinsamen Depots** zurückgibt, nie Beträge, Positionen oder Stückzahlen. Diagramme im Stil des Design Systems, animiert nach den Bewegungs-Tokens.

### Privatsphäre und Darstellung

- Einstellung „An der Wand nur Prozent“ (Standard an): Das Wand-Tablet zeigt nur Veränderung in % und Ziel-Fortschritt, keine Eurobeträge. Eurobeträge nur am Handy. Umschalten nur am Handy.
- Einstellung „Ruhige Ansicht“ (Standard an): Die Wandkachel zeigt die Veränderung der Woche oder des Monats statt der Tagesschwankung.
- Der Besuchsmodus blendet das Depot komplett aus (Wand und Handy-Kachel).
- Am Wand-Tablet nur gemeinsame Depots (`household`), private nie.
- Keine Bewertungen („gut“, „schlecht“, „kaufen“), keine Prognosen. Farben nur für Gewinn (`success`) und Verlust (`urgent`), immer mit Vorzeichen und Zahl.

### Kurs-Anbieter (Auswahl, Jonathan entscheidet)

Geprüft am 11.10.2026. Bedarf: etwa 5 Positionen × 35 Abrufe pro Börsentag (alle 15 Min) ≈ 175 Abrufe am Tag, plus Suche beim Anlegen.

| Anbieter | Kostenlos | Xetra / ISIN | Verzögerung | Haken |
| --- | --- | --- | --- | --- |
| Yahoo Finance (inoffizielle Chart-Schnittstelle) | ohne Schlüssel, keine festen Limits | Xetra über `.DE` (getestet: `EUNL.DE` liefert den Kurs in EUR); die ISIN-Suche findet oft London statt Xetra, das Symbol kommt daher über OpenFIGI | ca. 15 Min | nicht offiziell, kann sich jederzeit ändern; die Nutzungsbedingungen verbieten Weitergabe (rein private Anzeige, trotzdem Grauzone) |
| EODHD | 20 Abrufe am Tag | Xetra (`.XETRA`), Suche nach Name und Symbol | 15–20 Min | 20 Abrufe reichen nur für einen Schlusskurs am Abend, nicht für den 15-Minuten-Takt; ab ca. 20 € im Monat ausreichend |
| Twelve Data | 800 Abrufe am Tag, 8 pro Minute | ISIN-Filter nur als Zusatz; Xetra im kostenlosen Plan nicht bestätigt (europäische Daten laut Preisseite in bezahlten Plänen) | je nach Plan | vor dem Bau mit einem Testschlüssel prüfen |

Empfehlung: Yahoo für den 15-Minuten-Takt (kein Schlüssel nötig) und als Rückfall für den Tagesschlusskurs EODHD kostenlos mit Secret `QUOTES_API_KEY`. Fällt Yahoo aus, steht wenigstens der Abendkurs da.

---

## Was nicht gebaut wird

- Kein Zugriff auf das Bankkonto über FinTS oder Open Banking, keine Bank-Logins in Secrets.
- Keine Überweisungen oder Zahlungen aus dem Board.
- Keine Anlage- oder Finanzberatung, nur Auswertung der eigenen Daten.
- Kein Zugriff aufs Depot, kein Handel, keine Order, keine Kauf- oder Verkaufsempfehlungen (Stufe 5).
