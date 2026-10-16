# Modul: Öffi-Heimweg

Das Gegenstück zum Heimweg mit dem Auto aus `docs/nfc-modul.md` (Stufe 3), nur für Bus, Tram, U- und S-Bahn. Wer losfährt, bestätigt am Handy die **echte Verbindung** (Haltestelle, Linie, Abfahrt, Umstieg). Das Board verfolgt genau diese Fahrten live und rechnet die Ankunft. Weil die Verbindung bestätigt ist, zeigt das Board keine geratenen Zeiten.

Voraussetzungen:

- Login, Modul-System, Einstellungen
- Modul Abfahrten (Phase 5), weil es die VAG-Anbindung hat
- Bausteine aus dem NFC-Modul: `live_sessions`, Web Push, persönliche Tokens

Fehlt ein Baustein, wird er nach `docs/nfc-modul.md` gebaut, nicht doppelt.

---

## Starten

Es gibt vier Wege, die alle denselben Bildschirm öffnen (`#/heimweg`):

- **Kachel „Heimweg“ in der App** am Handy (Schnellaktion ganz oben auf der Handy-Startseite).
- **Kurzbefehl-Icon** auf dem iPhone-Homescreen. Der Kurzbefehl „Heimweg Öffis“ öffnet die URL der App mit `#/heimweg`.
- **NFC-Tag**, z. B. am Schlüsselbund oder an der Handyhülle. Dieselbe Automation öffnet die URL. Sie schickt nichts direkt ab, weil erst bestätigt wird.
- **Action-Button oder Rückseite doppelt tippen** (iPhone-Einstellung, ruft denselben Kurzbefehl auf).

Hinweis für die Anleitungskarte: Auf dem iPhone gibt es für Web-Apps keine Schnellaktionen beim langen Drücken des App-Icons. Ein eigenes Kurzbefehl-Icon ist der schnellste Weg. Android kann über `shortcuts` im Web-App-Manifest Schnellaktionen anbieten, das gleich mit einbauen.

## Verbindung bestätigen (Handy)

Ziel: höchstens 3 Tipps bei Favoriten, höchstens 6 Tipps bei neuen Wegen.

1. **Start-Haltestelle:** Das Handy nimmt den Standort (einmal erlauben) und zeigt die 3 nächsten Haltestellen mit Entfernung. Ohne Standort: Suche nach Namen. Die letzte Wahl steht oben.
2. **Abfahrt wählen:** Live-Abfahrten dieser Haltestelle in den nächsten 30 min. Pro Zeile: Linie, Richtung, Abfahrt mit Verspätung. Linien, die einen gespeicherten Weg nach Hause bedienen, stehen oben und sind markiert („fährt Richtung Zuhause“).
3. **Fahrt prüfen:** Die App lädt den Fahrtverlauf dieser Fahrt. Hält sie an der Heim-Haltestelle, ist der Weg fertig. Sonst kommt die Frage: „Wo steigst du um?“ mit einer Liste der folgenden Halte. Mögliche Umstiege sind markiert, nämlich Halte, an denen eine Linie zur Heim-Haltestelle fährt.
4. **Anschluss wählen:** Abfahrten an der Umstiegs-Haltestelle ab der geplanten Ankunft plus Umstiegszeit (Standard 3 min, einstellbar). Wieder Linie und Abfahrt wählen. Höchstens 3 Teilstrecken.
5. **Fußweg nach Hause:** fester Wert aus den Einstellungen (Minuten von der Heim-Haltestelle bis zur Tür).
6. **„Losfahren“** startet die Live-Fahrt. Optional: „Als Favorit speichern“.

**Favoriten** speichern die Abfolge aus Haltestellen, Linien und Richtungen (z. B. „Uni → Plärrer U2 → Zuhause“), keine Uhrzeiten. Beim nächsten Mal schlägt die App die nächsten passenden Abfahrten für diese Abfolge vor. Wer einen Vorschlag antippt, bestätigt damit die echte Fahrt.

## Live-Fahrt

- **Edge Function `transit`** als Proxy zur VAG-API:
  - Aktionen: Haltestellen in der Nähe, Haltestellensuche, Abfahrten, Fahrtverlauf.
  - Kurz cachen: Abfahrten 20 s, Fahrtverlauf 30 s.
  - Kein Schlüssel nötig.
  - Grundlage ist dieselbe API wie im Abfahrten-Modul (`start.vag.de/dm`). **Endpunkte und Felder vor dem Bau in der aktuellen Doku prüfen**, nicht aus dem Gedächtnis.
- **Tabelle `transit_trips`:**
  - Felder: `session_id` (aus `live_sessions`), `leg` (1–3), `line`, `product` (Bus/Tram/U-Bahn/S-Bahn), `trip_id`, `from_stop`, `to_stop`, `planned_dep`, `planned_arr`, `live_dep`, `live_arr`, `status`.
  - Status: `geplant`, `unterwegs`, `umgestiegen`, `angekommen`, `wackelt`, `verpasst`.
- **Aktualisieren:** Solange eine Live-Fahrt läuft, holt ein Cron jede Minute die Fahrtverläufe und schreibt Live-Zeiten und Status. Board und Handy bekommen das über Realtime.
- **Ankunft zu Hause** = letzte Live-Ankunft + Fußweg.
- **Anschluss in Gefahr:**
  - Regel: Ankunft an der Umstiegs-Haltestelle plus Umstiegszeit liegt später als die Live-Abfahrt des Anschlusses.
  - Dann wird der Status `wackelt`, das Board zeigt einen roten Hinweis („Anschluss U2 wackelt, 1 min knapp“), und das Handy bekommt eine Push-Nachricht mit der nächsten Alternative auf derselben Strecke.
  - Ein Tipp übernimmt die Alternative als neue bestätigte Teilstrecke. Ohne Tipp rechnet das Board mit der Alternative, markiert sie aber als „nicht bestätigt“.
- **Push an die andere Person:**
  - beim Start: „Jonathan ist um 18:42 zu Hause, U2 ab Plärrer“
  - bei mehr als 3 min Änderung
  - bei verpasstem Anschluss
  - Abschaltbar pro Person.
- **Ende:**
  - Heim-WLAN-Automation aus dem NFC-Modul, oder
  - 15 min nach der geplanten Ankunft automatisch, oder
  - „Abbrechen“ am Handy.

## Kachel am Board

- Größe m: Name und Personenfarbe, große Ankunftszeit („zu Hause 18:42“) und eine Linie mit Haltepunkten.
- Ein Punkt in Personenfarbe wandert zwischen den Halten. Die Position wird aus den Live-Zeiten interpoliert, wie bei den Live-Kacheln im NFC-Modul.
- Umstiege als kleine Lücke mit Linien-Badge.
- Farben: Verspätung in `warning`, nur ein wackelnder oder verpasster Anschluss in `urgent`, angekommen in `success` (kurze Animation, dann blendet die Kachel aus).
- Fahren beide gleichzeitig, zwei Zeilen in einer Kachel.
- Verknüpfung zum Essensplan wie beim Auto: optional die Push-Nachricht „Jetzt Nudeln aufsetzen“ an die Person zu Hause, wenn die Ankunftszeit minus Kochzeit erreicht ist.

## Einstellungen

- Heim-Haltestelle(n): bis zu 2, z. B. U-Bahn und Bus
- Fußweg in Minuten
- Umstiegszeit
- Favoriten verwalten
- Push an Partner an/aus

Beide Personen stellen das jeweils für sich ein.

## Datenschutz

- Der Standort wird nur im Handy zur Haltestellensuche genutzt und nie gespeichert. Gespeichert wird nur die gewählte Haltestelle.
- Live-Fahrten und Verlauf löscht ein Cron nach 7 Tagen.
- Leviona nutzt das Modul nur, wenn sie zustimmt. Ihre Fahrten erscheinen nur, wenn sie selbst eine startet.
- Im Besuchsmodus zeigt die Kachel nur „unterwegs, ca. 18:42“ ohne Linie.

## Was nicht gebaut wird

- Keine automatische Routensuche, die eine Verbindung rät. Der Vorschlag kommt immer aus einer bestätigten Abfolge.
- Keine Ortung während der Fahrt.
