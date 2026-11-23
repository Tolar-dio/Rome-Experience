# Second-pass schema additions

Everything in `content/SCHEMA.md` still applies. Before writing, grep `content/_existing_index.txt` for existing ids: never create a second record for something that exists; deepen it with a **patch** instead.

## patches (deepen existing records)
```json
{"patches": [
  {"kind": "event", "id": "battle_of_cannae", "set": {"detail": "longer, richer text replacing the old detail"}, "append": {"sources": [{"a":"Appian","w":"Hannibalic War","r":"17-26"}], "tags": ["double envelopment"]}},
  {"kind": "person", "id": "hannibal_barca", "set": {"detail": "..."}}
]}
```
`set` replaces fields, `append` adds to list fields. `kind`: event, person, war, campaign, place, legion, polity, glossary, source. Only patch what you can genuinely improve. A good `detail` for an importance 4-5 item is 250-600 words: background, course, numbers, the sources' versions, consequences, and the modern debate.

## corrections (fact-check pass)
```json
{"corrections": [
  {"kind": "event", "id": "battle_of_x", "set": {"year": -207, "loc": [12.9, 43.6]}, "reason": "Livy 27.43-49 dates it 207; previous value 208"},
  {"kind": "region", "id": "it_samnium_pentri", "control": [ ...full corrected control array... ], "reason": "..."}
]}
```
Applied after patches. For regions you must give the full corrected `control` array.

## provinces
```json
{"id": "prov_sicilia", "name": "Sicilia", "created": -241, "createdNote": "first praetor sent 227", "ended": 641,
 "capital": "syracuse", "labelLoc": [14.2, 37.5],
 "phases": [{"from": -227, "to": -27, "t": "praetorian province"}, {"from": -27, "to": 293, "t": "senatorial (proconsul)"}, {"from": 293, "to": 476, "t": "diocese of Italia Suburbicaria, governed by a corrector then consularis"}],
 "governor": "praetor; from 27 BC proconsul of praetorian rank", "diocese": "Italia Suburbicaria", "prefecture": "Italia",
 "parent": null, "successors": [], "summary": "...", "sources": [...]}
```
Include every province of the Republic and Principate, the Diocletianic/Constantinian provinces (c. 100+), dioceses (`"type":"diocese"`), praetorian prefectures (`"type":"prefecture"`) and the exarchates (Ravenna, Carthage), each with dates. `type`: province, diocese, prefecture, exarchate, quaestura (quaestura exercitus 536).

## tactics (battle diagrams)
A battle drawn in a local frame: x 0-100 (west to east as the field is usually shown), y 0-60 (y=0 at the top). Units are rectangles; phases move them.
```json
{"event": "battle_of_cannae", "title": "Cannae: the double envelopment", "terrain": [{"kind": "river", "pts": [[0,58],[100,52]], "label": "Aufidus"}, {"kind": "hill", "cx": 80, "cy": 10, "r": 6, "label": "..."}],
 "north": 0, "scaleNote": "front c. 2 km",
 "units": [{"id": "r_inf", "side": 0, "label": "Roman legions (c. 55,000)", "kind": "infantry", "w": 30, "h": 8},
           {"id": "h_libyans_l", "side": 1, "label": "Libyan foot", "kind": "infantry", "w": 6, "h": 10}],
 "phases": [
   {"t": "Deployment", "text": "...", "pos": {"r_inf": [50, 30, 0], "h_libyans_l": [32, 24, 0]}},
   {"t": "The crescent gives way", "text": "...", "pos": {...}, "arrows": [{"from": [38,40], "to": [50,30], "side": 1}]}
 ], "sources": [...], "note": "reconstruction after Polybius 3.113-116; positions schematic"}
```
`pos` values are `[x, y, angleDegrees]` for each unit's centre. `side` is 0 or 1, matching the event's `battle.sides` order. `kind`: infantry, cavalry, light, elephants, archers, ships, camp, baggage, reserve. 3-6 phases.

## monuments (city of Rome and Constantinople)
```json
{"id": "colosseum", "name": "Amphitheatrum Flavium (Colosseum)", "city": "rome", "loc": [12.4922, 41.8902], "built": 80, "begun": 70, "builder": "vespasian",
 "phases": [{"y": 217, "t": "fire; restored by Severus Alexander"}, {"y": 523, "t": "last recorded venationes"}],
 "destroyed": null, "type": "entertainment", "summary": "...", "footprint": [[12.4915,41.8907],[12.4930,41.8907],[12.4930,41.8897],[12.4915,41.8897]]}
```
`type`: temple, forum, basilica, entertainment, baths, palace, tomb, arch, column, aqueduct, bridge, wall, gate, church, harbour, market, other. `footprint` optional (closed polygon, 4-12 points). Coordinates to 4 decimals.

## mints, hoards, coinage
```json
{"mints": [{"id": "mint_treveri", "name": "Treveri (Trier)", "loc": [6.64, 49.75], "marks": ["TR", "TRE", "TRP", "TRS"], "periods": [[294, 395], [407, 411]], "notes": "...", "issuers": ["constantius_i","constantine_i"]}],
 "hoards": [{"id": "hoxne_hoard", "name": "Hoxne Hoard", "loc": [1.198, 52.35], "deposited": 410, "found": 1992, "contents": "c. 15,000 gold, silver and bronze coins, latest of Constantine III", "where": "British Museum", "significance": "..."}],
 "coinage": [{"id": "denarius_introduced", "year": -211, "t": "Denarius introduced", "denominations": ["denarius","quinarius","sestertius"], "text": "...", "standard": "4.5 g, 1/72 Roman pound", "kind": "reform"},
             {"id": "coin_hadrian", "year": 117, "endYear": 138, "issuer": "hadrian", "t": "Coinage of Hadrian", "text": "province series, ...", "kind": "issuer"}]}
```
Coinage `kind`: reform, debasement, issuer, type, mint_event. Include an `issuer` entry for every emperor and major usurper with what collectors should know (main types, rarities, mints, portrait styles, legends, how to tell them from similar issues).

## sites (economy, religion, culture)
```json
{"id": "las_medulas", "name": "Las Médulas", "loc": [-6.77, 42.47], "kind": "mine", "theme": "economy", "from": 25, "to": 250, "commodity": "gold", "summary": "...", "sources": [...]}
```
`theme`: economy, religion, culture. `kind` (economy): mine, quarry, grain, wine, oil, garum, pottery, port, market, mint_town. `kind` (religion): temple, sanctuary, mithraeum, synagogue, church, bishopric, monastery, council, martyrdom, pilgrimage. `kind` (culture): library, theatre, school, villa, observatory. Bishoprics: `from` = first attested bishop, with the name in `summary`.

## routes (trade and travel)
```json
{"id": "alexandria_ostia_grain", "name": "Alexandria to Ostia grain run", "kind": "sea", "commodity": "grain", "from": -30, "to": 618, "days": "20-60 westbound, 10-20 eastbound", "line": [[29.88,31.21],[...]], "summary": "..."}
```
`kind`: sea, river, land, caravan. Sea routes must stay at sea between ports.

## journeys (people's travels; drawn like campaigns)
Same shape as `campaigns`, plus `"kind": "journey"` and `"person"`. Examples: Paul's journeys, Hadrian's tours, Augustine, Julian, Egeria, Germanus, Constantine, Cicero's exile, Ovid's exile, Polybius with Scipio, Cleopatra in Rome.

## tours (guided story mode)
```json
{"tours": [{"id": "tour_republic", "title": "How a city-state took Italy", "stops": [
  {"year": -509, "center": [12.5, 41.9], "zoom": 7, "title": "...", "text": "80-180 words", "select": "event_id_or_null", "layers": {"campaigns": true}}
]}]}
```
6-12 stops per tour. Use existing ids for `select`.
