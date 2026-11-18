# Dominion: deutsche Namen prüfen

Erzeugt von `scripts/dominion/build-cards.mjs` aus KingdomCreator (7887e37e739c). 691 Karten, 17 Erweiterungen.
Korrekturen trägt Claude in `scripts/dominion/card-overrides.json` unter `names_de` ein (Schlüssel = id), dann das Script neu laufen lassen.

## Kein deutscher Name in der Quelle (59)

| Englisch | Erweiterung | id |
| --- | --- | --- |
| Farrier | guildscornucopia | `guildscornucopia_farrier` |
| Shop | guildscornucopia | `guildscornucopia_shop` |
| Infirmary | guildscornucopia | `guildscornucopia_infirmary` |
| Farmhands | guildscornucopia | `guildscornucopia_farmhands` |
| Carnival | guildscornucopia | `guildscornucopia_carnival` |
| Ferryman | guildscornucopia | `guildscornucopia_ferryman` |
| Footpad | guildscornucopia | `guildscornucopia_footpad` |
| Joust | guildscornucopia | `guildscornucopia_joust` |
| Artist | risingsun | `risingsun_artist` |
| Daimyo | risingsun | `risingsun_daimyo` |
| Mountain Shrine | risingsun | `risingsun_mountainshrine` |
| Fishmonger | risingsun | `risingsun_fishmonger` |
| Snake Witch | risingsun | `risingsun_snakewitch` |
| Aristocrat | risingsun | `risingsun_aristocrat` |
| Craftsman | risingsun | `risingsun_craftsman` |
| Riverboat | risingsun | `risingsun_riverboat` |
| Root Cellar | risingsun | `risingsun_rootcellar` |
| Alley | risingsun | `risingsun_alley` |
| Change | risingsun | `risingsun_change` |
| Ninja | risingsun | `risingsun_ninja` |
| Poet | risingsun | `risingsun_poet` |
| River Shrine | risingsun | `risingsun_rivershrine` |
| Rustic Village | risingsun | `risingsun_rusticvillage` |
| Gold Mine | risingsun | `risingsun_goldmine` |
| Imperial Envoy | risingsun | `risingsun_imperialenvoy` |
| Kitsune | risingsun | `risingsun_kitsune` |
| Litter | risingsun | `risingsun_litter` |
| Rice Broker | risingsun | `risingsun_ricebroker` |
| Ronin | risingsun | `risingsun_ronin` |
| Tanuki | risingsun | `risingsun_tanuki` |
| Tea House | risingsun | `risingsun_teahouse` |
| Samurai | risingsun | `risingsun_samurai` |
| Rice | risingsun | `risingsun_rice` |
| Continue | risingsun · event | `risingsun_event_continue` |
| Amass | risingsun · event | `risingsun_event_amass` |
| Asceticism | risingsun · event | `risingsun_event_asceticism` |
| Credit | risingsun · event | `risingsun_event_credit` |
| Foresight | risingsun · event | `risingsun_event_foresight` |
| Kintsugi | risingsun · event | `risingsun_event_kintsugi` |
| Practice | risingsun · event | `risingsun_event_practice` |
| Sea Trade | risingsun · event | `risingsun_event_seatrade` |
| Receive Tribute | risingsun · event | `risingsun_event_receivetribute` |
| Gather | risingsun · event | `risingsun_event_gather` |
| Approaching Army | risingsun · prophecy | `risingsun_prophecy_approachingarmy` |
| Biding Time | risingsun · prophecy | `risingsun_prophecy_bidingtime` |
| Bureaucracy | risingsun · prophecy | `risingsun_prophecy_bureaucracy` |
| Divine Wind | risingsun · prophecy | `risingsun_prophecy_divinewind` |
| Enlightenment | risingsun · prophecy | `risingsun_prophecy_enlightenment` |
| Flourishing Trade | risingsun · prophecy | `risingsun_prophecy_flourishingtrade` |
| Good Harvest | risingsun · prophecy | `risingsun_prophecy_goodharvest` |
| Great Leader | risingsun · prophecy | `risingsun_prophecy_greatleader` |
| Growth | risingsun · prophecy | `risingsun_prophecy_growth` |
| Harsh Winter | risingsun · prophecy | `risingsun_prophecy_harshwinter` |
| Kind Emperor | risingsun · prophecy | `risingsun_prophecy_kindemperor` |
| Panic | risingsun · prophecy | `risingsun_prophecy_panic` |
| Progress | risingsun · prophecy | `risingsun_prophecy_progress` |
| Rapid Expansion | risingsun · prophecy | `risingsun_prophecy_rapidexpansion` |
| Sickness | risingsun · prophecy | `risingsun_prophecy_sickness` |
| Marchland | promos | `promos_marchland` |

## Auffällig, bitte prüfen (15)

| Deutsch (Quelle) | Englisch | Erweiterung | Warum | id |
| --- | --- | --- | --- | --- |
| Grosse Halle | Great Hall | intrigue | Schweizer „ss“, auf Deutsch eher „ß“? | `intrigue_greathall` |
| Aussenposten | Outpost | seaside | Schweizer „ss“, auf Deutsch eher „ß“? | `seaside_outpost` |
| Grosser Markt | Grand Market | prosperity | Schweizer „ss“, auf Deutsch eher „ß“? | `prosperity_grandmarket` |
| Fernstrasse | Highway | hinterlands | Schweizer „ss“, auf Deutsch eher „ß“? | `hinterlands_highway` |
| Seidenstrasse | Silk Road | hinterlands | Schweizer „ss“, auf Deutsch eher „ß“? | `hinterlands_silkroad` |
| Strassennetz | Road Network | renaissance | Schweizer „ss“, auf Deutsch eher „ß“? | `renaissance_project_roadnetwork` |
| Vergrößerung[ß] | Enlarge | plunder | Sonderzeichen im Namen | `plunder_enlarge` |
| Bergbaustraße[ß] | Mining Road | plunder | Sonderzeichen im Namen | `plunder_miningroad` |
| Glüksfall | Windfall | empires | Tippfehler? „Glücksfall“ | `empires_event_windfall` |
| Zitdelle | Citadel | renaissance | Tippfehler? „Zitadelle“ | `renaissance_project_citadel` |
| Kapitän Tobias | Captain | promos | Eigenname statt Übersetzung, stimmt das so auf der Karte? | `promos_captain` |
| Schweriner Dom | Church | promos | Eigenname statt Übersetzung, stimmt das so auf der Karte? | `promos_church` |
| Höhlenhafen | Coastal Haven | allies | „Höhle“ für „Coastal“ (Küste)? | `allies_ally_coastalhaven` |
| Harem | Harem | intrigue | heißt in der 2. Edition englisch „Farm“, deutscher Name der 2. Edition? | `intrigue_harem` |
| – | Ferryman | guildscornucopia | Kosten: KingdomCreator nennt einmal 3, einmal 5 Münzen; übernommen 5 (zweite Quelle sagt auch 5) | `guildscornucopia_ferryman` |

## Deutsch = Englisch, bitte bestätigen (40)

Oft richtig (z. B. „Villa“), manchmal nur nicht übersetzt.

| Name | Erweiterung | id |
| --- | --- | --- |
| Mine | baseset | `baseset_mine` |
| Baron | intrigue | `intrigue_baron` |
| Harem | intrigue | `intrigue_harem` |
| Saboteur | intrigue | `intrigue_saboteur` |
| Navigator | seaside | `seaside_navigator` |
| Embargo | seaside | `seaside_embargo` |
| Blockade | seaside | `seaside_blockade` |
| Alchemist | alchemy | `alchemy_alchemist` |
| Golem | alchemy | `alchemy_golem` |
| Bank | prosperity | `prosperity_bank` |
| Talisman | prosperity | `prosperity_talisman` |
| Menagerie | guildscornucopia | `guildscornucopia_menagerie` |
| Tunnel | hinterlands | `hinterlands_tunnel` |
| Mandarin | hinterlands | `hinterlands_mandarin` |
| Berserker | hinterlands | `hinterlands_berserker` |
| Souk | hinterlands | `hinterlands_souk` |
| Altar | darkages | `darkages_altar` |
| Page | adventures | `adventures_page` |
| Mission | adventures · event | `adventures_event_mission` |
| Training | adventures · event | `adventures_event_training` |
| Ball | adventures · event | `adventures_event_ball` |
| Quest | adventures · event | `adventures_event_quest` |
| Expedition | adventures · event | `adventures_event_expedition` |
| Villa | empires | `empires_villa` |
| Forum | empires | `empires_forum` |
| Ritual | empires · event | `empires_event_ritual` |
| Arena | empires · landmark | `empires_landmark_arena` |
| Labyrinth | empires · landmark | `empires_landmark_labyrinth` |
| Museum | empires · landmark | `empires_landmark_museum` |
| Obelisk | empires · landmark | `empires_landmark_obelisk` |
| Experiment | renaissance | `renaissance_experiment` |
| Patron | renaissance | `renaissance_patron` |
| Piazza | renaissance · project | `renaissance_project_piazza` |
| Innovation | renaissance · project | `renaissance_project_innovation` |
| Transport | menagerie · event | `menagerie_event_transport` |
| Stampede | menagerie · event | `menagerie_event_stampede` |
| Marquis | allies | `allies_marquis` |
| Figurine | plunder | `plunder_figurine` |
| Invasion | plunder · event | `plunder_event_invasion` |
| Sauna / Avanto | promos | `promos_saunaavanto` |

## 1. und 2. Edition heißen verschieden (0)

Vorgabe ist der Name der 2. Edition.

| Englisch | 1. Edition | 2. Edition | id |
| --- | --- | --- | --- |

## Kosten unterschiedlich je Edition (1, 2. Edition gilt)

- Ferryman: {"coins":3,"potion":0,"debt":0} → {"coins":5,"potion":0,"debt":0}

## Kosten von Hand korrigiert (2)

- Seaway: 3 → 5 Münzen (KingdomCreator hat 3, richtig ist 5)
- Gather: 3 → 7 Münzen (KingdomCreator hat 3, richtig ist 7)
