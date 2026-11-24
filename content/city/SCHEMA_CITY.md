# Urbs: data schema for the 3D city of Rome

The 3D city renders every building, street, wall, aqueduct and event of the city of Rome from 509 BC to AD 641, year by year. Everything here is authored as JSON in `content/city/<topic>/`. Read this whole file before writing.

## Global conventions

- **Coordinates** are `[lon, lat]` WGS84 with **6 decimals** (about 0.1 m). Longitude first. The Colosseum centre is `[12.492231, 41.890210]`; the Pantheon rotunda centre `[12.476873, 41.898614]`; the Temple of Castor `[12.485380, 41.891820]`.
- **Years**: integers, BC negative, no year 0. `from`/`to` are the first and last year a thing physically exists in that form. Use `9999` for "still standing in 641". `begun` is when construction started (the model animates the building rising between `begun` and `from`).
- **Dimensions** are metres. Convert Roman feet at 0.296 m.
- **Orientation**: `rot` is the compass bearing, in degrees clockwise from true north, of the direction the building's **front (main entrance / façade)** faces. A temple whose steps face north-east has `rot: 45`. For long buildings without a front (a circus), `rot` is the bearing of the long axis from the closed (curved) end toward the open (starting-gate) end.
- **Curved buildings**: theatre/odeum `rot` = the bearing the audience looks (cavea centre toward the stage); amphitheatre = bearing of the major axis; circus = curved end toward the starting gates; stadium = curved end toward the straight end; mausoleum/tholos/centralplan = bearing of the entrance or portico. `w` is always across the façade, `l` along `rot` (amphitheatre: `w` = minor axis, `l` = major axis, also `params.a`/`params.b`).
- **Local frame for sub-parts** (used by `compound` blocks and offsets): origin at the building's `loc`; `+y` metres in the facing direction (`rot`), `+x` metres 90 degrees clockwise from that (to your right when you stand inside the building looking out through its front). Example: a temple facing south (`rot: 180`): `+y` is south, `+x` is west.
- **Sources**: `"sources": [{"a": "Vitruvius", "w": "De architectura", "r": "3.3.5"}]` and `"scholarship": ["Richardson, A New Topographical Dictionary of Ancient Rome (1992) 74"]`. Standard references: Richardson's NTDAR, Platner-Ashby, LTUR (Lexicon Topographicum Urbis Romae), Coarelli's *Rome and Environs*, Claridge's *Rome* (Oxford Archaeological Guide), Carandini's *Atlas of Ancient Rome* (2017), Haselberger's *Mapping Augustan Rome*, the Stanford Digital Forma Urbis Romae, Lanciani's *Forma Urbis Romae*. Cite only what you are confident of.
- **Certainty**: every record carries `"certainty"`: `"excavated"` (remains seen and measured), `"documented"` (located by Marble Plan, inscriptions or reliable texts), `"reconstructed"` (position and form inferred by scholars, broadly accepted), `"conjectural"` (one hypothesis among several). Put the reasoning in `"note"`.
- Valid JSON, UTF-8, no comments, no em dashes. Files under ~120 KB; split into parts. Validate each file with `python3 -c "import json,sys; json.load(open(sys.argv[1]))" FILE`.
- Existing ids for people and events: grep `/home/claude/rome-experience/content/_existing_index.txt`. Existing city monuments (2D gazetteer, ids you should reuse in `monument`): `/home/claude/rome-experience/content/pass2/monuments/*.json`.

## buildings (the heart of the model)

One record per **version** of a building. A temple rebuilt three times is three records sharing `monument`.

```json
{
  "id": "temple_castor_v3", "monument": "temple_of_castor", "name": "Temple of Castor and Pollux (Tiberian)",
  "from": 6, "to": 9999, "begun": -7, "builder": "tiberius",
  "template": "temple",
  "loc": [12.485380, 41.891820], "rot": 335,
  "w": 32.0, "l": 49.5, "h": 31.0,
  "footprint": [[lon,lat], ...],
  "params": {"order": "corinthian", "plan": "peripteral", "front": 8, "side": 11, "podium": 7.0, "colH": 14.8, "steps": "front_lateral", "mat": {"podium": "concrete_faced", "columns": "marble_white", "walls": "marble_white", "roof": "roof_tile"}},
  "importance": 5, "certainty": "excavated",
  "summary": "...", "phases": [{"y": -117, "t": "..."}],
  "sources": [...], "scholarship": [...], "note": "..."
}
```
- `w` = width across the façade, `l` = depth front to back, `h` = total height above surrounding ground to the highest point (ridge, dome, statue base). For non-rectangular templates see each template.
- `footprint` optional (closed or open ring); when given, it wins over `w`/`l` for templates that extrude a plan (`forum`, `platform`, `garden`, `pool`, `compound` outline, `porticus` when irregular).
- `ruin`: optional `{ "from": year, "state": "roofless" | "half" | "foundations" }` for the condition after damage within our period (e.g. after the fire of 191 before restoration you would instead end the version and start a new one).
- `mat` keys and values from the materials list below.
- `importance` 1-5 controls label priority.

### Materials
`tufa` (grey-yellow cappellaccio/Grotta Oscura/Fidenae), `peperino` (dark grey Alban stone), `travertine` (cream), `marble_white` (Luna/Carrara, Pentelic, Proconnesian), `marble_color` (giallo antico, pavonazzetto, cipollino accents), `granite` (grey Egyptian), `porphyry` (red-purple), `brick` (opus testaceum, red-brown), `reticulate` (opus reticulatum), `concrete` (bare opus caementicium), `concrete_faced` (concrete core faced with stone or stucco; looks like stucco), `stucco` (painted white/cream plaster), `stucco_red`, `timber`, `mudbrick`, `thatch`, `roof_tile` (terracotta), `bronze` (dark bronze), `gilded` (gilt bronze), `lead`, `water`, `grass`, `paving` (basalt selce for streets, travertine for piazzas: use `paving_basalt` / `paving_travertine`).

### Templates and their params
Every template takes `w`, `l`, `h`, `rot`, `loc`. Extra `params`:

| template | use for | params |
|---|---|---|
| `temple` | rectangular temples | `order` (tuscan, doric, ionic, corinthian, composite), `plan` (peripteral, peripteros_sine_postico, pseudoperipteral, prostyle, amphiprostyle, in_antis, dipteral, tuscan_alae), `front` (columns across the front), `side` (columns down the flank incl. corners; for prostyle the porch depth in columns), `podium` (m), `colH` (column height incl. base and capital, m), `steps` (front, front_full, front_lateral, lateral, none), `cella` ({w,l} optional), `pediment` (default true), `acroteria` (bool), `quadriga` (bool), `precinct` ({w,l,h} optional enclosing wall) |
| `tholos` | round temples, small round monuments | `diameter`, `columns` (count), `colH`, `podium`, `roof` (cone, dome, flat), `order` |
| `basilica` | civic basilicas | `nave` (width), `aisles` (1 or 2 each side), `storeys` (1 or 2 for the aisles/façade), `facade` (colonnade, arcade, tabernae, closed), `apses` (none, end, both, side), `clerestory` (bool), `vaulted` (bool; Maxentius), `colH` |
| `church` | Christian basilicas and halls | `nave`, `aisles` (1 or 2), `transept` (bool), `apse` (bool), `atrium` ({w,l} or null), `narthex` (bool) |
| `centralplan` | Pantheon, rotundas, domed halls | `diameter`, `drumH`, `domeH`, `sides` (0 = round, 8, 10, 16), `oculus` (m diameter or 0), `portico` ({front, side, colH, w, l} or null), `intermediate` ({w,l,h} block between portico and drum, Pantheon) |
| `theatre` | theatres | `diameter` (outer cavea), `orchestra` (diameter), `storeys` (façade arcade levels), `scaena` ({w, depth, h}), `porticus` ({w,l,colH} behind the stage, optional), `templeOnTop` (bool) |
| `amphitheatre` | amphitheatres | `a` (outer major axis), `b` (outer minor axis), `arenaA`, `arenaB`, `storeys` (3 arcade levels + attic = 4), `bays` (arches per ring, Colosseum 80), `attic` (bool) |
| `circus` | circuses | `l`, `w` (overall), `spina` ({l, w}), `obelisks` (list of offsets along spina in m from centre), `carceres` (count), `tiers` (h of seating), `pulvinar` (bool, side) |
| `stadium` | Domitian's stadium | `l`, `w`, `tiers` (h) |
| `odeum` | roofed small theatres | `diameter` |
| `porticus` | quadriporticus, colonnaded squares | `depth` (colonnade depth), `colH`, `double` (two rows), `garden` (bool), `sides` (4 default, or list of which sides exist: ["n","e","s","w"] in local terms front/back/left/right) |
| `colonnade` | single straight colonnades or porticoed streets | `line` (list of lon/lat), `depth`, `colH` |
| `forum` | paved squares with enclosure | `wallH` (precinct wall height), `colonnades` (depth or 0), `exedrae` ({count, radius} or null), `paving` |
| `baths` | thermae and large balnea | `blocks` (list; see compound), or simple: `core` ({w,l,h}), `frigidarium` ({w,l,h} vaulted hall), `caldarium` ({radius, h} domed), `precinct` ({w,l,h}), `exedrae` (count), `natatio` ({w,l}) |
| `arch` | honorific arches | `bays` (1, 3, or "quadrifrons"), `depth`, `atticH`, `columns` (freestanding, engaged, none), `quadriga` (bool) |
| `column` | honorific columns | `pedestal` (h), `shaft` (h incl. base and capital), `diameter`, `spiral` (bool reliefs), `statue` (bool) |
| `obelisk` | obelisks | `h` (shaft), `base` (h) |
| `mausoleum` | drums, tumuli | `diameter`, `drumH`, `tumulusH` (earth mound/cone above drum), `tiers` (stepped drums count), `base` ({w,h} square base, Hadrian), `statue` (bool) |
| `pyramid` | pyramid tombs | `w` (base), `h` |
| `tomb` | roadside tombs | `kind` (altar, drum, tower, aedicula, house, pyramid), `w`, `h` |
| `compound` | palaces, camps, markets, any complex | `blocks`: list of `{shape, x, y, w, l, h, z, rot, mat, colH, storeys}` in the local frame (metres, rot relative to building rot). `shape`: box, gable, vault, dome, apse, hemicycle ({radius, depth, angle}), court (ring of rooms around open court, `ringDepth`), colonnade, tower, cylinder, stepped, wall, terrace |
| `horrea` | warehouses | `court` ({w,l}), `storeys` |
| `insula` | a specific known apartment block | `storeys`, `shops` (bool) |
| `domus` | a specific known house | `atrium` (bool), `peristyle` ({w,l}), `storeys` |
| `wall` | city walls (see walls collection) | not here |
| `bridge` | bridges | `line` (2+ lon/lat points bank to bank), `arches` (count), `deckW` |
| `aqueduct` | aqueduct arcades inside the model area | see aqueducts collection |
| `fountain` | Meta Sudans, nymphaea, basins | `kind` (cone, nymphaeum, basin), `diameter`, `facade` ({w,h}) |
| `altar` | altars and their enclosures | `enclosure` ({w,l,h}), `altar` ({w,l,h}) |
| `statue` | colossi, equestrian statues | `base` (h), `figure` (h), `equestrian` (bool) |
| `platform` | terraces, substructures, podia | `facade` (arcade, plain, tabernae) |
| `garden` | horti, groves, planted porticoes | `trees` (density per 100 m²: 0.5 sparse, 2 dense), `kind` (formal, grove, orchard, park) |
| `pool` | stagna, naumachiae, basins | `depth` |
| `hut` | Iron Age / archaic huts | `diameter` or `w`/`l` |
| `harbor` | quays and river ports | `line`, `h` |
| `ship_island` | the travertine ship-prow of the Tiber Island | `l`, `h` |

If no template fits, use `compound` with blocks. Prefer accuracy of size, height, position and orientation over decoration.

## Other collections

### terrain (topography agent)
`{"terrain": {"hills": [...], "valleys": [...], "tiber": {...}, "waters": [...], "corrections": [...]}}`
- `hills`: `{"id": "palatine", "name": "Palatine", "outline": [[lon,lat],...], "summit": 51, "ancientTop": 49, "plateau": true, "subpeaks": [{"name":"Germalus","loc":[...],"elev":...}], "cliffs": [{"line": [[...]], "drop": 20, "name": "Tarpeian Rock"}]}` (elevations metres above sea level).
- `valleys`: points with ancient ground level by period: `{"name": "Forum Romanum (centre)", "loc": [...], "modern": 13.5, "levels": [{"y": -700, "elev": 9.0}, {"y": -100, "elev": 11.5}, {"y": 100, "elev": 12.5}]}`.
- `tiber`: `{"centerline": [[lon,lat],...], "width": [[index, metres], ...], "island": [[lon,lat],...], "ancientBanks": {"left": [...], "right": [...]}, "waterLevel": 6.5, "notes": "..."}` covering from north of the Milvian Bridge to south of the Aventine/Porta Portuensis.
- `waters`: marshes, lakes, streams: `{"id": "velabrum", "kind": "marsh"|"pond"|"stream"|"spring", "polygon"|"line": ..., "from": -800, "to": -500, "elev": ...}` (Velabrum, Palus Caprae, Lacus Curtius, Spinon/Petronia Amnis, Nodinus, the Forum stream drained by the Cloaca Maxima).
- `corrections`: polygons where the modern ground differs from the ancient (modern fill, Lungotevere embankments built 1876-1926, Mussolini's Via dei Fori Imperiali cut of the Velia, the Quirinal cut for Trajan's Forum, Esquiline dumps): `{"polygon": [...], "delta": -6.0, "fromYear": ..., "note": "..."}` meaning add `delta` metres to the modern DEM to get the ancient surface for years after `fromYear`.

### walls
`{"walls": [{"id": "aurelian_wall", "name": "...", "from": 271, "to": 9999, "phases": [{"y": 401, "t": "Honorius doubles the height", "h": 15.0}], "line": [[lon,lat],...], "h": 8.0, "thickness": 3.5, "towers": {"spacing": 29.6, "w": 7.5, "proj": 3.3, "h": 15.0}, "mat": "brick", "closed": true, ...}], "gates": [{"id": "porta_appia", "wall": "aurelian_wall", "name": "Porta Appia", "loc": [...], "rot": ..., "from": 271, "to": 9999, "w": ..., "h": ..., "towers": "round"|"square"|"none", "bays": 1|2, "phases": [...]}]}`
Servian Wall (incl. the agger on the Esquiline plateau, with ditch), Aurelian Wall (with the Honorian raising), and the archaic Palatine and Capitoline fortifications if supported. ~35-45 gates with dates and positions.

### streets
`{"streets": [{"id": "vicus_tuscus", "name": "Vicus Tuscus", "modern": "Via di S. Teodoro", "line": [[lon,lat],...], "w": 6.0, "from": -509, "to": 9999, "paved": -174, "rank": 1|2|3, "certainty": "...", "note": "..."}]}`
`rank` 1 = main arterial (Via Lata, Sacra Via, Vicus Longus, Clivus Suburanus...), 2 = important street, 3 = lane. Aim for ~150 streets including every named street and clivus whose course is known or reconstructed, the consular roads from their gates into the centre, and the main streets of Trastevere and the Campus Martius.

### aqueducts
`{"aqueducts": [{"id": "aqua_claudia", "name": "Aqua Claudia", "from": 52, "to": 537, "begun": 38, "line": [[lon,lat,heightOfChannelAboveSea],...], "arcade": [[startIndex, endIndex]], "channels": 2, "spec": {"span": 6.5, "pier": 3.0, "mat": "travertine"}, "castella": [{"loc": [...], "name": "..."}], "branches": [...], "note": "..."}]}`
Give the in-city courses (from where they enter the model area, roughly 5 km from the Forum, to their terminal castella), with channel elevations so arcade heights come out right (ground = DEM). Include the Arcus Neroniani across the Caelian, the Aqua Virgo arches toward the Campus Martius, the Aqua Traiana across the Janiculum, the Aqua Alexandrina, and the cutting of all aqueducts by the Goths in 537.

### bridges
In `buildings` with `template: "bridge"` (Pons Sublicius, Aemilius, Fabricius, Cestius, Agrippae, Neronianus, Aelius, Aurelius, Probi, Milvius).

### regions
`{"regions": [{"id": "reg_I", "num": 1, "name": "Porta Capena", "polygon": [...], "from": -7, "to": 9999, "catalogue": {"vici": 10, "aediculae": 10, "vicomagistri": 48, "curatores": 2, "insulae": 3250, "domus": 120, "horrea": 16, "balnea": 86, "lacus": 81, "pistrina": 20, "perimeter_pedes": 12211}, "character": "...", "note": "Curiosum vs Notitia differences ..."}], "servianRegions": [...the four Servian regions Suburana, Esquilina, Collina, Palatina with polygons...]}`

### gardens (horti) and open spaces
In `buildings` with `template: "garden"` and a `footprint` (Horti Sallustiani, Lucullani, Maecenatis, Lamiani, Agrippae, Caesaris across the Tiber, Domitiae, Pompeiani, Torquatiani, Variani, Spei Veteris, Liciniani, the Lucus Furrinae, the Campus Martius open plain as a `garden` kind park before it filled up...).

### events (city events)
`{"cityEvents": [{"id": "murder_of_caesar_curia_pompeia", "year": -44, "month": 3, "day": 15, "title": "...", "summary": "2-4 sentences", "loc": [lon,lat], "locName": "at the foot of Pompey's statue in the Curia of Pompey, east end of the Porticus of Pompey", "precision": "exact"|"building"|"street"|"area"|"approx", "monument": "theatre_of_pompey", "event": "existing atlas event id or null", "people": ["julius_caesar"], "cats": ["political","violence"], "sources": [...], "certainty": "...", "note": "..."}]}`
`precision`: `exact` = a spot the sources pin to within a few metres; `building` = inside/at a known building; `street`; `area` = a district; `approx` = a reasoned guess.

### routes (processions)
`{"routes": [{"id": "triumphal_route_imperial", "name": "...", "from": -100, "to": 400, "line": [[lon,lat],...], "kind": "triumph"|"pompa_circensis"|"funeral"|"procession"|"flight", "stops": [{"loc": [...], "t": "..."}], "note": "..."}]}`

### places (daily life and infrastructure points)
`{"cityPlaces": [{"id": "excubitorium_cohors_vii", "name": "...", "kind": "vigiles"|"castra"|"horrea"|"macellum"|"bakery"|"latrina"|"fountain"|"lacus"|"compitum"|"shop_district"|"library"|"school"|"brothel"|"tavern"|"mint"|"statio"|"port"|"workshop"|"cemetery"|"catacomb"|"shrine"|"other", "loc": [...], "from": ..., "to": ..., "summary": "...", "certainty": "...", "sources": [...]}]}`

### populations and fabric rules (one agent)
`{"population": [[year, low, high, note], ...], "urbanization": [{"zone": "name", "polygon": [...], "phases": [{"from": -509, "density": 0.0-1.0, "type": "huts|houses|domus|insulae|mixed|villas|horti|abandoned", "storeys": [1,2]}...]}]}` describing where and when the city was built up, what kind of housing, and how it contracted after 410, 455, 537-552 (disabitato).
