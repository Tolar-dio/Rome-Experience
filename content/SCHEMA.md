# Rome Experience: content schema

All authored content lives in `content/` as JSON. The build (`tools/build.py`) validates, merges and writes the app's runtime data to `data/`.

## Conventions

- **Years**: integers. BC is negative, AD positive, there is **no year 0** (`-1` = 1 BC, `1` = AD 1). Use the conventional modern (Varronian) dating for early Rome and say so in `note` when the date is traditional or disputed.
- **Months/days**: optional `month` (1-12) and `day` (1-31) only when actually known (e.g. Cannae 2 Aug 216 BC: `year:-216, month:8, day:2`). Use the Julian/conventional date given in standard references.
- **Coordinates**: `[lon, lat]` in decimal degrees (WGS84), **longitude first**. 3-4 decimals for sites, 1-2 for vague areas. Never guess wildly: if a battle site is unknown, give the best scholarly candidate and set `locCertainty: "approx"` or `"disputed"`.
- **IDs**: lowercase ascii, words joined by `_`, globally unique within their type. Prefix nothing. Examples: `cannae`, `hannibal_barca`, `second_punic_war`, `via_appia`, `legio_x_fretensis`.
- **Cross-references**: always by id. People `people`, polities `polities`, wars `war`, places `place`.
- **Certainty**: `"certain" | "probable" | "traditional" | "disputed" | "approx"`.
- **Sources** (ancient): `{"a": "Livy", "w": "Ab Urbe Condita", "r": "22.4-7"}` (author, work, reference). Use standard citation refs. Modern scholarship may go in `scholarship` as short strings: `"Broughton, MRR I 247"`, `"Goldsworthy, The Punic Wars (2000)"`. Only cite what you are confident exists.
- **Text**: English, factual, dense, no filler, no em dashes. `summary` = 1-3 sentences. `detail` = a fuller paragraph or two (optional, for important items). Mention numbers, names, places. Where ancient figures are unreliable, say so.
- Files must be **valid JSON** (UTF-8, no comments, no trailing commas). Each file is an object keyed by collection: `{"events":[...], "people":[...]}`. Split large output into several files (`part1.json`, `part2.json`...) rather than one huge write.

## Collections

### events
```json
{
  "id": "battle_of_cannae",
  "year": -216, "month": 8, "day": 2,
  "endYear": null,
  "title": "Battle of Cannae",
  "type": "battle",
  "cats": ["military"],
  "importance": 5,
  "summary": "...",
  "detail": "...",
  "place": "cannae",
  "loc": [16.1322, 41.3062], "locName": "Cannae, Apulia", "locCertainty": "probable",
  "war": "second_punic_war",
  "people": ["hannibal_barca", "lucius_aemilius_paullus_cos216", "gaius_terentius_varro"],
  "polities": ["rome", "carthage"],
  "battle": {
    "sides": [
      {"polity": "rome", "commanders": ["lucius_aemilius_paullus_cos216","gaius_terentius_varro"], "strength": "c. 86,000 (Polybius)", "losses": "c. 50,000-70,000 killed"},
      {"polity": "carthage", "commanders": ["hannibal_barca","hasdrubal_cavalry_commander"], "strength": "c. 50,000", "losses": "c. 6,000-8,000"}
    ],
    "victor": "carthage",
    "kind": "field",
    "significance": "..."
  },
  "sources": [{"a":"Polybius","w":"Histories","r":"3.107-117"},{"a":"Livy","w":"Ab Urbe Condita","r":"22.40-52"}],
  "debate": "Size of the Roman army and the exact site on the Aufidus are disputed.",
  "certainty": "certain",
  "tags": ["double envelopment"]
}
```
- `type`: `battle | siege | naval | campaign | treaty | founding | political | law | reform | constitutional | accession | death | assassination | usurpation | civil_war | revolt | religious | cultural | building | economic | disaster | plague | migration | diplomacy | administrative | literary | other`
- `cats` (one or more): `military, political, constitutional, religious, cultural, economic, social, administrative, diplomatic, disaster, technology, literature, law`
- `importance`: 1 (nerd-level minutiae) to 5 (epochal). Aim for a real spread: most events 2-3.
- `battle` block only for battles, sieges and naval battles. `kind`: `field | siege | naval | ambush | skirmish | massacre`. `victor` is a polity id or `"indecisive"`.

### people
```json
{
  "id": "hannibal_barca", "name": "Hannibal Barca", "fullName": "Hannibal son of Hamilcar Barca",
  "born": -247, "died": -183, "bornCertainty": "approx",
  "polity": "carthage", "gens": null,
  "roles": [{"t": "Commander in Iberia", "from": -221, "to": -218}, {"t": "Suffete of Carthage", "from": -196, "to": -195}],
  "kind": ["general","statesman"],
  "summary": "...", "detail": "...",
  "death": "suicide by poison at Libyssa, Bithynia, to avoid extradition to Rome",
  "related": ["scipio_africanus"],
  "sources": [...]
}
```
- Roman names: use the conventional English form in `name` (`"Scipio Africanus"`), full tria nomina in `fullName` (`"Publius Cornelius Scipio Africanus"`). Disambiguate ids of homonyms with a suffix (`_cos216`, `_the_elder`).
- `kind`: `emperor, usurper, king, consul, dictator, general, statesman, tribune, writer, historian, philosopher, jurist, cleric, saint, rebel, empress, woman, engineer, architect, enemy_leader, other`.

### wars
```json
{"id": "second_punic_war", "name": "Second Punic War", "start": -218, "end": -201,
 "sides": [["rome","numidia_massylii"],["carthage","macedon_antigonid"]],
 "outcome": "Roman victory; Carthage loses Iberia, fleet, pays 10,000 talents",
 "summary": "...", "detail": "...",
 "phases": [{"from":-218,"to":-216,"t":"Hannibal's invasion of Italy"}],
 "events": ["battle_of_cannae"], "people": ["hannibal_barca"], "campaigns": ["hannibals_march"],
 "sources": [...]}
```

### campaigns (army movements, drawn as animated routes)
```json
{"id": "hannibals_march", "name": "Hannibal's march to Italy", "war": "second_punic_war",
 "polity": "carthage", "commander": "hannibal_barca", "start": -218, "end": -218,
 "strength": "c. 90,000 foot, 12,000 horse at the Ebro; 26,000 on arrival in Italy (Polybius 3.56)",
 "summary": "...",
 "path": [
   {"loc": [-0.98, 37.60], "t": "New Carthage", "y": -218, "m": 5, "note": "departs in late spring"},
   {"loc": [0.85, 40.72], "t": "Crosses the Ebro", "y": -218, "m": 6},
   {"loc": [4.65, 43.9], "t": "Crossing of the Rhône", "y": -218, "m": 9, "event": "crossing_of_the_rhone"}
 ],
 "certainty": "disputed", "note": "Alpine pass disputed (Col de la Traversette, Mont Cenis, Little St Bernard)."}
```
Path points in chronological order; 4-25 points; follow plausible terrain (valleys, coasts, roads), not straight lines across mountains or seas unless it was a sea crossing (`"sea": true` on that point).

### polities (only to add ones missing from `content/polities.json`)
```json
{"id": "sequani", "name": "Sequani", "type": "tribe", "family": "gallic", "start": -300, "end": -50, "summary": "..."}
```
`type`: `empire, republic, kingdom, city_state, league, tribe, confederation, nomadic, client_kingdom, breakaway`. `family` picks the colour band: `roman, italic, etruscan, greek, punic, gallic, iberian, germanic, illyrian, thracian_dacian, steppe, hellenistic, anatolian, semitic_arab, iranian, egyptian, berber, british, caucasian, slavic, other`.

### regions (territorial control; see `content/territory/README`)
```json
{
  "id": "it_latium_vetus", "name": "Latium Vetus", "seed": [12.65, 41.80],
  "countries": ["IT"],
  "zone": {"in60bc": true},
  "control": [
    {"from": -509, "to": -493, "p": "latin_league", "s": "independent", "note": "Latin League; Rome at war until Foedus Cassianum (493)"},
    {"from": -493, "to": -338, "p": "latin_league", "s": "ally"},
    {"from": -338, "to": 476, "p": "rome", "s": "direct"},
    {"from": 476, "to": 493, "p": "odoacer_kingdom", "s": "independent"}
  ],
  "certainty": "probable", "notes": "..."
}
```
- `control` periods must be contiguous and cover -509..641 (use `"p": null, "s": "unsettled"` only if truly no organised power).
- `s` (status relative to Rome): `direct` (Roman ager / province / directly ruled; for the Eastern Empire too), `ally` (socii, foederati, treaty allies), `client` (client kingdoms, dependent rulers), `occupied` (Roman army in control, not yet organised, or temporary occupation), `contested` (active war zone, control split or changing hands), `independent` (not under Rome), `unsettled`.
- `p` = the polity actually holding the land (for `direct`, `rome` or `rome_east`/`rome_west` after 395, or a breakaway Roman state like `gallic_empire`).

### legions
```json
{"id": "legio_x_fretensis", "name": "Legio X Fretensis", "num": 10, "cognomen": "Fretensis",
 "founded": -41, "founder": "octavian", "ended": 410, "endNote": "last attested in the Notitia Dignitatum at Aila",
 "emblem": "bull, boar, ship, Neptune",
 "stations": [{"from": -30, "to": 6, "base": "Syria", "loc": [36.2, 33.5]}, {"from": 70, "to": 290, "base": "Jerusalem (Aelia Capitolina)", "loc": [35.23, 31.78]}],
 "wars": ["first_jewish_roman_war"], "summary": "...", "certainty": "probable"}
```

### places (gazetteer)
```json
{"id": "colonia_agrippina", "name": "Colonia Claudia Ara Agrippinensium", "short": "Cologne", "greek": null, "modern": "Köln, Germany",
 "loc": [6.958, 50.941], "type": ["colonia","provincial_capital"], "founded": -38, "foundedNote": "Oppidum Ubiorum; colonia 50 AD",
 "status": [{"from": 50, "t": "colonia"}], "importance": 4, "summary": "...", "pleiades": 109169}
```
`type`: `city, colonia, municipium, capital, provincial_capital, legionary_fortress, fort, port, sanctuary, oppidum, mine, battlefield_town, polis, metropolis`.

### frontiers (dated linear features)
```json
{"id": "hadrians_wall", "name": "Hadrian's Wall", "kind": "wall", "built": 122, "abandoned": 410,
 "phases": [{"from": 142, "to": 162, "t": "partly abandoned for the Antonine Wall"}],
 "line": [[-3.07,54.99],[-2.06,55.00],[-1.55,54.99]], "summary": "..."}
```
`kind`: `wall | earthwork | river | road_frontier | limes | fossatum | ditch`.

### roads (named, dated)
```json
{"id": "via_appia", "name": "Via Appia", "built": -312, "builder": "appius_claudius_caecus", "extended": [{"y": -191, "t": "to Brundisium"}],
 "line": [[12.49,41.88],[12.73,41.55],[13.42,41.27],[14.25,41.08],[17.94,40.64]], "summary": "..."}
```

### sources (ancient authors and works, for source-coverage view)
```json
{"id": "livy", "name": "Livy", "latin": "Titus Livius", "born": -59, "died": 17, "lang": "Latin",
 "works": [{"t": "Ab Urbe Condita", "covers": [-753, -9], "extant": [[-753, -293], [-218, -167]], "books": "142 books; 1-10 and 21-45 survive, Periochae for the rest"}],
 "reliability": "...", "summary": "..."}
```

### rulers
```json
{"office": "emperor", "list": [{"id": "augustus", "name": "Augustus", "from": -27, "to": 14, "how": "natural causes", "dynasty": "Julio-Claudian", "region": "all", "usurper": false}]}
```
Offices: `emperor`, `emperor_west`, `emperor_east`, `usurper`, and foreign dynasties keyed by polity (`seleucid`, `ptolemaic`, `arsacid`, `sasanian`, `numidian`, `pontic`, `armenian`, `hunnic`, `vandal`, `visigothic`, `ostrogothic`, `frankish`, ...).

### fasti (consuls)
```json
{"year": -216, "consuls": ["Lucius Aemilius Paullus", "Gaius Terentius Varro"], "suffects": [], "note": "", "certainty": "certain", "ids": ["lucius_aemilius_paullus_cos216","gaius_terentius_varro"]}
```
For years with consular tribunes or no consuls, use `"tribunes": [...]` or `"note"`.

### glossary
```json
{"id": "imperium", "term": "imperium", "lang": "Latin", "def": "...", "related": ["cursus_honorum"]}
```

### series (data for charts)
```json
{"id": "denarius_silver", "title": "Silver content of the denarius / antoninianus", "unit": "% silver", "note": "...",
 "points": [[-211, 95], [64, 93.5], [100, 89]], "sources": ["Walker, The Metrology of the Roman Silver Coinage"]}
```
