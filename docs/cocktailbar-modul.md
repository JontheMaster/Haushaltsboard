# Modul: Cocktailbar

Die Hausbar als Modul: Was steht im Regal, was kann man daraus mixen, und am Tablet eine Schritt-für-Schritt-Anleitung, groß genug für nasse Finger. Fehlt nur eine Zutat, geht sie mit einem Tipp auf die Bring!-Liste.

Voraussetzungen:

- Login und Modul-System
- Einkauf (Bring!) aus Phase 1, für „Auf die Liste“

Keine neuen Secrets.

---

## Stufe 1: Bar und Rezepte

### Datenbank

- `bar_ingredients`:
  - `id`, `name`, `kind`, `aliases` (text[]), `in_stock` (bool), `level` (`voll` | `halb` | `fast_leer`, optional), `note`
  - Werte für `kind`: `spirituose` | `likoer` | `sirup` | `saft` | `filler` | `frisch` | `deko` | `sonstiges`
  - Beispiele für `aliases`: „Triple Sec“ = „Cointreau“ = „Orangenlikör“.
- `bar_recipes`:
  - `id`, `name`, `description` (1 Satz), `glass`, `ice` (`wuerfel` | `crushed` | `ohne`), `method` (`shaken` | `geruehrt` | `gebaut` | `geblendet`)
  - `ingredients` (jsonb: `ingredient_id`, `amount`, `unit` (cl, Dash, Stück, Spritzer), `optional`)
  - `steps` (jsonb), `garnish`, `tags` (text[]: fruchtig, sauer, bitter, süß, stark, sommerlich, …), `alcohol_free` (bool), `source` (`seed` | `eigen`), `created_by`
- `bar_substitutes`: `ingredient_id`, `substitute_id`, `note` (z. B. Limettensaft ↔ Zitronensaft, „etwas saurer“).
- `bar_log`: `recipe_id`, `made_on`, `count`, `rating_a`, `rating_b`.

### Startbibliothek

- Etwa 50 Rezepte, die Claude Code selbst als Seed schreibt:
  - Klassiker wie Gin Tonic, Negroni, Aperol Spritz, Hugo, Moscow Mule, Mojito, Caipirinha, Whiskey Sour, Margarita, Daiquiri, Espresso Martini, Old Fashioned, Cuba Libre, Paloma, Tom Collins, Pornstar Martini, Lillet Wild Berry, Gin Basil Smash
  - dazu mindestens 10 alkoholfreie Drinks
- Mengen und Schritte in eigenen Worten, deutsch, Mengen in cl.
- Eigene Rezepte kann jeder in der App anlegen.
- Optional später: Import einzelner Rezepte aus TheCocktailDB. Vorher prüfen, ob deren aktuelle Bedingungen das erlauben. Kein Muss.

### Bar pflegen (Handy)

- Liste nach Art gruppiert, Schalter „da“ / „nicht da“.
- Schnell-Erfassung: Name tippen, Vorschläge aus den Seed-Zutaten.
- **„Leer“** setzt die Zutat auf nicht da und fragt: „Auf die Einkaufsliste?“ Ja → Bring! mit dem Namen der Zutat.
- Frische Zutaten (Limetten, Minze) bekommen einen Hinweis „frisch kaufen“ statt eines Bestands.

## Stufe 2: Was können wir mixen?

- **Drei Gruppen:**
  - **Geht jetzt:** alle Pflichtzutaten da, Ersatz zählt mit Hinweis.
  - **1 Zutat fehlt:** mit Knopf „Auf die Liste“.
  - **Nur mit Einkauf:** zugeklappt.
- **Filter:** alkoholfrei, Geschmack (Tags), Aufwand (nur „gebaut“ = ohne Shaker), Favoriten.
- **„Überrasch uns“:** Zufall aus „Geht jetzt“, gewichtet nach guten Bewertungen und selten gemachten Drinks.
- **Einkaufstipp:** „Mit Triple Sec könntet ihr 6 weitere Drinks machen“. Die Zutat mit dem größten Gewinn wird oben gezeigt.
- **Board-Kachel (m):**
  - Tagsüber ausgeblendet. Ab einer einstellbaren Uhrzeit (Standard Fr/Sa ab 18 Uhr) erscheint „Drink des Abends“ mit einem passenden Vorschlag.
  - Im Besuchsmodus erscheint die Kachel immer.

## Stufe 3: Mix-Modus am Tablet

- Vollbild, eine Zutat pro Schritt.
- Groß: Menge in `display`-Schrift („4 cl“), darunter die Zutat und das Glas-Icon.
- Mengen skalieren: 1–6 Drinks, Mengen werden umgerechnet und sinnvoll gerundet.
- Weiter durch Tippen irgendwo auf den Bildschirm. Wer will, kann mit einem Wisch zurück.
- **Schüttel-Timer:**
  - Bei `shaken` kommt ein Schritt „Schütteln“ mit 15-s-Kreis in `accent`.
  - Am Ende eine kurze Animation, dann „Abseihen ins …“.
- **Am Ende:**
  - Deko-Hinweis und „Prost“-Bildschirm, ohne Ausrufezeichen und ohne Emoji, ganz im Stil.
  - Danach „Wie war’s?“: 1–5 pro Person, landet in `bar_log`.
- **Bestand:** Die App fragt nicht nach jeder Mischung nach dem Bestand. Nur bei „fast leer“-Zutaten kommt einmal der Hinweis „Gin fast leer, auf die Liste?“.

## Stufe 4: Extras (einzeln nachfragen)

- **Barkarte für Gäste:** Im Besuchsmodus zeigt das Board eine schöne Karte „Heute an der Bar“ mit 6–8 Drinks, die gerade gehen. Gäste wählen am Tablet, die Bestellung erscheint am Handy des Gastgebers.
- **Wochenrückblick:** „Lieblingsdrink diesen Monat: Gin Basil Smash.“
- **Party-Einkauf:** Für eine Party mit 10 Gästen und 3 gewählten Drinks Mengen hochrechnen und eine Liste in Bring! schreiben.
- **NFC:** Tag an der Bar öffnet den Zufallsvorschlag am Board.

## Hinweise

- Keine Gesundheits- oder Mengenempfehlungen zum Trinken. Alkoholfreie Rezepte stehen gleichberechtigt in der Liste.
