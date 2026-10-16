# Modul: Smart Home (Hue und Tapo)

Das Board soll Licht und Steckdosen in die Momente einbinden: Heimkommen, Filmabend, Putz-Party, Nachtmodus. Hue und Tapo sind dabei sehr unterschiedlich gut anzubinden.

| | Hue | Tapo |
| --- | --- | --- |
| Offizielle API | ja: lokal und Remote (Cloud mit OAuth) | nein, keine offizielle öffentliche API |
| Am Board steuerbar | ja, über die Remote-API aus Edge Functions | nicht zuverlässig |
| Über iPhone-Kurzbefehle | ja (Hue-App-Aktionen) | ja (Tapo-App-Aktionen bzw. Siri) |
| Empfehlung | voll einbinden | nur über Kurzbefehle; für Board-Steuerung lieber Hue-Steckdosen |

Das lokale Hue-Bridge-API direkt aus dem Tablet-Browser geht nicht sauber. Die App läuft über HTTPS, die Bridge nur im Heimnetz mit eigenem Zertifikat. Deshalb läuft alles über die Remote-API.

Voraussetzungen:

- Login und Modul-System
- Für die Momente: NFC-Modul (Szenen und Live-Momente), Filme, Putz-Party

---

## Stufe A: Ohne Server, über Kurzbefehle (sofort möglich)

- NFC-Automationen aus dem NFC-Modul können zusätzlich zum Board-Aufruf eine Hue- oder Tapo-Aktion ausführen. Beispiel: Tag an der Tür → Board meldet „heimgekommen“ und schaltet das Flurlicht über die Hue-App.
- Die App zeigt dafür eine Anleitungskarte. Es braucht keinen Code, nur die Karte mit Beispielen:
  - Heimkommen → Flur an
  - Gute Nacht → alles aus und Tapo-Steckdose Lichterkette aus
  - Filmabend → Szene „Kino“
- Tapo bleibt dauerhaft in dieser Stufe.

## Stufe B: Hue am Board

### Einrichtung

- **Jonathan legt an** (Anleitung in der App):
  - ein Konto auf developers.meethue.com und dort eine Remote-App mit der Callback-URL der Edge Function `hue-oauth`
  - die Secrets `HUE_CLIENT_ID` und `HUE_CLIENT_SECRET`. Er trägt sie selbst ein. Claude Code nennt nur die Namen.
- **Vor dem Bau** den aktuellen Ablauf der Hue Remote API prüfen: OAuth, Freischaltung der Bridge per Link-Knopf, CLIP v2 über die Remote-Route. Nicht aus dem Gedächtnis bauen.
- **Verbinden:**
  - Einmalig in den Einstellungen „Hue verbinden“ (Login bei Hue, Link-Knopf an der Bridge drücken).
  - Refresh-Token und Application-Key liegen in einer Tabelle `integration_tokens`, die nur die Edge Functions lesen dürfen. RLS ohne jeden Zugriff für Clients, Zugriff nur mit Service-Role.
  - Ablauf und Erneuerung der Tokens übernimmt die Edge Function.

### Edge Function `hue`

- **Aktionen:** Räume und Zonen mit Zustand lesen, Raum an/aus, Helligkeit, Szene aktivieren, Steckdose an/aus.
- **Cache:** Zustand höchstens alle 30 s neu holen, solange die Kachel sichtbar ist. Nach eigenen Befehlen sofort.
- **Fehlertexte im Board-Stil:** „Hue gerade nicht erreichbar. Versuch es gleich nochmal.“

### Kachel „Licht“ (s/m)

- Räume als Kacheln mit Glühbirnen-Icon:
  - Tipp = an/aus
  - lang drücken = Helligkeit und Szenen
- Ein-Zustand in `accent-soft`, aus in `surface-sunken`.
- Am Handy dieselbe Ansicht.
- Im Besuchsmodus bleibt die Kachel nutzbar.

### Licht in Momenten

Jeder Moment ist einzeln an- und abschaltbar und wählt Raum und Szene aus einer Liste:

| Moment | Licht |
| --- | --- |
| Heimkommen (WLAN/NFC) | abends Flur und Wohnzimmer auf „Ankommen“ |
| Öffi- oder Auto-Heimweg, 5 min vor Ankunft | Flur an, wenn es dunkel ist und niemand zu Hause ist |
| Filmabend „Den schauen wir“ | Wohnzimmer auf „Kino“ |
| Putz-Party | alle Räume hell, am Ende zurück zur vorherigen Szene |
| Nachtmodus beginnt | Hinweis am Board „Licht im Wohnzimmer noch an“ mit Knopf „Alles aus“, kein automatisches Ausschalten |
| Wäsche fertig (Live-Moment) | optional ein kurzes, einmaliges Blinken einer gewählten Lampe |
| Regen in 15 min (Wetter-Radar) | optional ein kurzes, einmaliges Blinken einer gewählten Lampe |

- Vor jeder Szene merkt sich das Board den vorherigen Zustand, damit „zurück“ möglich ist.
- Zwischen 23 und 7 Uhr gibt es kein Blinken.

## Tapo: ehrliche Einschätzung

- Inoffizielle Bibliotheken für Tapo (Cloud oder lokal) brechen regelmäßig bei Firmware-Updates und brauchen die Zugangsdaten des Tapo-Kontos. Das passt nicht zur Regel „keine fremden Logins auf dem Server“. **Deshalb nicht einbauen.**
- Tapo läuft über Kurzbefehle und NFC (Stufe A) oder über Alexa-Routinen.
- Was am Board schaltbar sein soll, besser mit Hue-Steckdosen lösen.
- Später prüfen: Unterstützt eine neuere Tapo-Steckdose Matter und gibt es dann einen offiziellen Weg zur Steuerung, kann das Modul sie aufnehmen.
