Das Design des Haushaltsboards von Jonathan und seiner Freundin: ein Android-Tablet an der Wand und dieselbe App am Handy. Die Farben kommen aus der Palette **Campfire**, vom kühlen Kieferngrün bis zur Glut, ergänzt um Blau und Beere für die beiden Personen. Das Board soll frisch, ruhig und auf zwei Meter Entfernung lesbar sein.

## Grundsätze

- **Ein Blick reicht.** Wer vorbeigeht, sieht ohne Antippen, was heute ansteht. Große Uhr, große Einträge, wenig Zierrat.
- **Warm, nicht laut.** Die Palette ist das Feuer, die Fläche bleibt ruhig. Kräftige Farbe nur für Personen, Heute und die eine Hauptaktion.
- **Bewegung erklärt.** Jede Animation zeigt, was gerade passiert ist: abgehakt, verschoben, neu da. Nichts bewegt sich zum Selbstzweck.
- **Farben haben feste Bedeutungen.** Grün heißt erledigt, Rot heißt dringend. Jonathan ist Blau, sie ist Beere (dunkles Rot Richtung Lila). Farbe steht nie allein, Name, Wort oder Icon sind immer dabei.

## Ton und Sprache

- Deutsch, du-Form, kurz. Verb zuerst auf Knöpfen: „Todo hinzufügen“, „Fertig“, „Rückgängig“.
- Satzanfang groß, sonst normale Rechtschreibung. Keine Ausrufezeichen, keine Emoji.
- Zeiten als `13:00`, Tage als `Mo 5.` oder `Montag, 5. Oktober`. Hinweise knapp: „seit Di“, „4 offen“, „Phase 2“.
- Leere Zustände laden ein statt sich zu entschuldigen: „Heute ist frei. Neues Todo am Handy anlegen.“
- Fehler sagen, was los ist und was hilft: „Bring! gerade nicht erreichbar. Die Liste lädt gleich neu.“

## Farbe

Zwei Themes: **Tag** (hell, Standard) und **Abend** (dunkel, ab Sonnenuntergang und im Nachtmodus). Alle Komponenten nutzen die semantischen Tokens. Die Palettentöne `pine-600` bis `ember-200` sowie `blue-*` und `berry-*` sind für Cover, Illustrationen und Kachel-Akzente.

- Seite auf `surface`, Kacheln auf `surface-raised`, leere Plätze und Eingaben auf `surface-sunken`. Trenner in `line`.
- Text in `ink`, Nebentext in `ink-muted`. Beide erreichen auf allen drei Flächen in beiden Themes mindestens 4.5:1.
- `accent` ist die Flamme in Aprikose: primärer Button, aktiver Schalter, Fokus, Modul-Icons. Bewusst weder Rot noch Grün. Höchstens ein accent-Button pro Ansicht. Text auf accent-Fläche immer in `on-accent`.
- Kalender (Entscheidung Jonathan, 5. Oktober 2026): Jeder Kalender hat eine eigene Farbe, nicht nur die Personenfarbe. Jonathan privat = `person-a` (Blau), Leviona = `person-b` (Beere), EJ = `cal-orange`, Kirchenvorstand = `cal-yellow`, Fokus-Blöcke = `cal-lilac`, Uni = `cal-purple`, Arbeit Termine/Büro = `cal-forest`, Arbeit Spiele/Training = `cal-lime`. Je Farbe Balken (`cal-x`), Fläche (`cal-x-soft`) und Uhrzeit (`cal-x-ink`). Grün und Gelb stehen hier nur für Kalender, Termine tragen immer Name und Kalender als Text.
- Personen: `person-a` (Jonathan, Blau) und `person-b` (Partnerin, Beere) für Balken, Ringe und Punkte; `person-a-soft` und `person-b-soft` als Fläche für Termine und Spalten; Schrift darauf in `person-a-ink` und `person-b-ink`.
- Heute: `highlight` mit `highlight-ink` für den heutigen Spaltenkopf und den Countdown.
- Erledigt ist immer Grün: `success-fill` füllt den Abhak-Kreis, `success` und `success-soft` für Text und Badges.
- Dringend ist immer Rot: `urgent` und `urgent-soft` für dringende Todos, Verspätungen und Fehler, mit dem Wort „Dringend“ oder einem Icon.
- `warning` (Honig) nur für sanfte Hinweise wie „seit Di“. Nie nur Farbe.

## Schrift

Zwei Familien von Google Fonts:

- **Bricolage Grotesque** (`display`) für Uhr, Datum und Kachel-Titel. Lebendig, etwas eigenwillig, gibt dem Board Charakter. Nie für Fließtext.
- **Figtree** (`sans`) für alles andere. Rund, freundlich, sehr gut lesbar.

An der Wand gilt: Einträge in `body-wall` (20px), Spaltenköpfe in `label`, nichts kleiner als 14px. `caption` (12px) nur am Handy. Die Uhr in `clock` (96px) mit `tabular-nums`, damit die Ziffern beim Wechsel nicht springen.

## Abstände und Raster

- 4px-Raster: `space-1` bis `space-7`.
- Wand: Seitenrand `space-6`, Kacheln mit `space-5` Innenabstand und `space-5` Lücke, Kopfzeile `space-7` über den Kacheln.
- Handy: Kacheln mit `space-4` Innenabstand und `space-4` Lücke.
- Startseite als Kachel-Gitter: 12 Spalten im Querformat, 4 am Handy. Kachelgrößen `s`, `m`, `l` belegen 3, 4 oder 6 Spalten an der Wand.

## Formen

- Kacheln und Karten `radius-lg`, Buttons, Termine und Listenzeilen `radius-md`, Badges `radius-sm`, Pillen, Schalter und Abhak-Kreise `radius-full`.
- Schatten sparsam: Kacheln ruhen mit `shadow-tile`, nur was gezogen wird oder schwebt bekommt `shadow-lift`.
- Keine Verläufe, keine farbigen Ränder an Kacheln.

## Bewegung

Zwei Kurven, vier Dauern. Alles respektiert `prefers-reduced-motion`.

| Moment | Was passiert | Token |
| --- | --- | --- |
| Board lädt | Kacheln steigen 10px auf und blenden ein, versetzt um 40ms | `dur-slow`, `ease-out` |
| Abhaken | Kreis füllt sich grün mit Federn, Haken zeichnet sich, Text wird durchgestrichen, „Rückgängig“ ploppt auf | `dur-base`, `ease-spring` |
| Nach 5 Sekunden | Erledigte Zeile blendet aus, die Liste rückt nach | `dur-slow`, `ease-out` |
| Neue Minute | Ziffern rollen von unten ein, der Doppelpunkt atmet | `dur-slow` |
| Karte ziehen | Karte hebt sich, kippt minimal, `shadow-lift`; beim Loslassen rastet sie ein | `dur-base`, `ease-spring` |
| Bearbeiten-Modus | Kacheln wackeln kaum sichtbar, gestrichelter accent-Rand | 2,4s Schleife |
| Schalter | Knopf gleitet und rastet ein | `dur-base`, `ease-spring` |
| Dringend | Roter Punkt im Badge pulsiert langsam | 1,6s Schleife |
| Bildschirmschoner | Fotos blenden weich über, Nachtmodus dimmt langsam | `dur-calm` |

## Icons

[Lucide](https://lucide.dev), Strich 1.75, 24er-Raster, immer über die `Icon`-Komponente in `currentColor`. Jedes Modul hat genau ein Icon (Liste unter Assets › Icons). Keine Emoji, keine gefüllten Icons, keine zweite Icon-Familie. Icon allein ohne Text bekommt ein `label`.

## Zustände

- Fokus: `focus-ring`, 2px Abstand in Seitenfarbe, dann 2px accent. Auf jeder Fläche mindestens 3:1.
- Hover nur am Handy und PC sinnvoll; an der Wand zählt nur das Antippen. Jede Tippfläche mindestens 44 × 44px.
- Gedrückt: Buttons federn auf 96 %.
- Deaktiviert vermeiden. Lieber erklären, warum etwas gerade nicht geht.

## Komponenten

`window.Board` mit `Icon`, `Button`, `Tile`, `TaskItem`, `PersonChip`, `EventPill`, `ClockWeather`, `Toggle`, `Badge`, `ModuleCard`. Braucht React 18 auf der Seite. Klassen beginnen mit `hb-`.
