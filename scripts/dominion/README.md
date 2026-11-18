# Dominion-Kartendaten

Erzeugt `src/modules/dominion/data/cards.json` und `sets.json` für das Dominion-Modul (`docs/dominion-modul.md`).

```bash
node scripts/dominion/build-cards.mjs
```

Das Script lädt die Quelldaten einmal in `scripts/dominion/.cache/` (nicht im Repo) und schreibt danach jedes Mal dasselbe Ergebnis. Bei einer neuen Erweiterung: `COMMIT` im Script auf einen neueren Stand von KingdomCreator setzen, die Erweiterung in `FAMILIES` eintragen, neu laufen lassen.

Zur Laufzeit lädt die App nichts von außen, nur die JSON-Dateien aus dem Repo.

## Was übernommen wird

Nur Fakten: englischer und deutscher Name, Erweiterung, Edition, Kosten (Münzen, Trank, Schulden), Typen, Funktions-Merkmale (Dorf, +Kauf, Entsorgen …). **Keine Kartentexte, keine Kartenbilder.**

## Quellen und Lizenzen (geprüft am 18.11.2026)

| Quelle | Lizenz | Verwendung |
| --- | --- | --- |
| [KingdomCreator](https://github.com/blakevanlan/KingdomCreator), Commit `7887e37e739c20998b55a1d88ca38e60e601cb61` | MIT, „Copyright (c) 2013 Blake VanLandingham“ | Hauptquelle: `sets/*.yaml` (Namen, Kosten, Typen, Merkmale wie `isActionSupplier`, `isDrawer`, `isTrashing`), `src/i18n/locales/messages/de/` (deutsche Karten- und Erweiterungsnamen) |
| [dominion-setup](https://github.com/sgraaf/dominion-setup) (PyPI 2026.6.0) | GPL-3.0-only | **Nicht übernommen.** Nur einmal lokal zum Gegenprüfen genutzt (fehlen Karten? stimmen die Kosten?). Nichts davon liegt im Repo. |
| [Dominion Strategy Wiki](https://wiki.dominionstrategy.com) | nicht prüfbar | Die MediaWiki-API war beim Bau hinter einer Bot-Sperre („Making sure you're not a bot“), Lizenz und Kategorien ließen sich nicht automatisch lesen. Nicht verwendet. Die Merkmale kommen deshalb aus KingdomCreator plus Handkorrekturen. |

Dominion und die Kartennamen gehören Donald X. Vaccarino und den Verlagen. Das Modul ist ein privates Hilfsmittel und zeigt nur Namen und Kosten.

MIT-Hinweis von KingdomCreator (Pflicht bei Weitergabe):

```
The MIT License (MIT)

Copyright (c) 2013 Blake VanLandingham

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

## Aufbau der Daten

- **Erweiterung** (`set`): z. B. `baseset`, `intrigue`, `guildscornucopia`. 1. und 2. Edition sind eine Erweiterung.
- **Schachtel** (`boxes` an der Karte, Liste in `sets.json`): was man im Regal hat, z. B. `baseset` (1. Edition), `baseset2` (2. Edition), `baseset2add` (Updatepack = die in der 2. Edition neuen Karten). „Die Gilden“ und „Reiche Ernte“ sind in der 1. Edition zwei Schachteln, in der 2. Edition eine.
- `editions`: in welcher Edition es die Karte gibt.
- `kind`: `kingdom` oder eine Landschaft (`event`, `landmark`, `project`, `way`, `ally`, `trait`, `prophecy`). Gaben, Plagen, Basiskarten, Ruinen, Preise usw. sind Zusatzmaterial und stehen nicht als Karten drin.
- `tags` (abgeleitet aus KingdomCreator): `village` (isActionSupplier/isVillageSupplier), `draw` (isDrawer), `terminal_draw` (zieht mehrere, gibt keine Aktionen), `plus_buy`, `trash`, `attack`, `alt_vp` (Punktekarten im Königreich, Landmarken). `cantrip`, `gain`, `payload`, `defense`, `cost_reduce` gibt die Quelle nicht her, sie kommen über die Handkorrekturen.
- `requires`: Zusatzmaterial, das die Karte braucht (Trank, Schuldenmarker, Plagen, Gaben, Pferde, Beute …).
- `complexity` 1–3: Schätzung (neuere Erweiterungen, Dauer/Reserve/Nacht, Zusatzmaterial = 2; Reisende, Plagen, Gaben, Befehle = 3).

## Handkorrekturen: `card-overrides.json`

Gewinnen immer gegen die Quelle. (Die Spezifikation nennt die Datei `card-tags.overrides.json`; sie enthält hier zusätzlich Namen und Kosten, darum der allgemeinere Name.)

```json
{
  "names_de": { "empires_event_windfall": "Glücksfall" },
  "sets_de": { "prosperity2add": "Blütezeit Updatepack" },
  "cards": {
    "baseset_moat": { "tags_add": ["defense"], "requires_add": [], "complexity": 1, "cost": { "coins": 2 } }
  },
  "review": { "promos_captain": "Grund, warum der Name auf die Prüfliste soll" }
}
```

## Prüfliste

`namen-pruefen.md` wird bei jedem Lauf neu geschrieben: fehlende deutsche Namen, Namen gleich wie Englisch, Auffälliges (Tippfehler, doppelte Namen, „ss“ statt „ß“), korrigierte Kosten. Jonathan prüft sie, bevor das Modul live geht.
