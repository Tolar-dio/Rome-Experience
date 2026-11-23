# Territory: how regions become map polygons

The map shows who controls every piece of land in every year from 509 BC to AD 641. You author **regions**; the build turns them into polygons.

## How geometry is made (so you can place seeds well)

1. Land is cut into atomic cells: modern first-level admin units (Natural Earth admin-1: Italian provinces, French départements, Spanish provinces, Turkish provinces, Iranian provinces, German Länder, English counties...), further cut by three historical lines from the Ancient World Mapping Center: the edge of Roman rule c. 60 BC (`in60bc`), c. AD 117 (`in117`, Trajan's maximum incl. Mesopotamia, Armenia, Dacia) and c. AD 200 (`in200`, Severan).
2. Each cell goes to the **nearest region seed** among the seeds that are compatible with it: the cell's modern country must be in the region's `countries`, and the cell must satisfy the region's `zone` flags if any are set. Very large cells (bigger than ~25,000 km², e.g. German Länder, Saudi provinces, Russian oblasts) are split between competing seeds along the perpendicular bisectors between seeds.
3. So the borders between your regions follow modern admin borders, the AWMC Roman frontier lines, and, in big cells, the midlines between seeds. Place each seed in the heart of its region, and space seeds so that midlines fall where you want borders. A region covering a long thin area (the Nile valley, the Danube bank) needs its seed well placed or extra regions to hold the shape.

`zone` examples: the Agri Decumates `{"in117": true}` with countries `["DE"]` keeps it on the Roman side of the Upper German limes; Germania Magna seeds use `{"in117": false}`; a Rhine left-bank region uses `{"in117": true}`. Use zone flags wherever a region must stop at a Roman frontier. `in60bc` lets you distinguish, e.g., Gallia Narbonensis (true) from Gallia Comata (false), or Roman Macedonia (true) from Thrace (false).

Country codes: ISO 3166-1 alpha-2 (`IT`, `FR`, `ES`, `PT`, `GB`, `IE`, `DE`, `AT`, `CH`, `NL`, `BE`, `LU`, `DK`, `PL`, `CZ`, `SK`, `HU`, `SI`, `HR`, `BA`, `RS`, `XK`, `ME`, `MK`, `AL`, `GR`, `BG`, `RO`, `MD`, `UA`, `BY`, `RU`, `TR`, `CY`, `GE`, `AM`, `AZ`, `SY`, `LB`, `IL`, `PS`, `JO`, `IQ`, `IR`, `KW`, `SA`, `EG`, `LY`, `TN`, `DZ`, `MA`, `EH`, `SD`, ...). Malta `MT`, San Marino `SM`, Vatican `VA`, Monaco `MC`.

## What to author

`{"regions": [...]}` per the schema in `content/SCHEMA.md`. Every region needs a `control` timeline covering **-509 to 641 without gaps** (periods may share boundary years: `to` of one equals `from` of the next; the later period wins for that year).

Granularity: fine where control changed piecemeal and matters (Italy region by region during the conquest of Italy; Sicily west/east; Iberia's step-by-step conquest; Gaul in 121 BC vs 58-51 BC; Britain's advance and retreat; the Rhine and Danube frontiers; Armenia/Mesopotamia going back and forth with Parthia and Persia; Dacia 106-271; the 5th-century successor kingdoms; Justinian's reconquests and the 7th-century Persian and Arab conquests). Coarser where nothing happens.

Statuses: `direct`, `ally`, `client`, `occupied`, `contested`, `independent`, `unsettled`. Be honest: Italian communities 338-89 BC were mostly `ally` (socii) not `direct`, except ager Romanus and Roman/Latin colonies. Client kingdoms (Numidia after 202, Pergamon, Cappadocia, Herodian Judaea, Bosporus, Armenia under Roman-crowned kings) are `client`. Federate barbarian settlements inside the empire (Visigoths in Aquitaine 418-c.475, Burgundians in Sapaudia 443) should be `ally` with `p` = the barbarian polity until they become independent. Use `contested` for e.g. Italy 535-554, Armenia in many years, Mesopotamia during Trajan's withdrawal, North Italy during Hannibal's presence in Italy (218-203 for regions that defected such as Capua 216-211, Bruttium, Lucania, Tarentum).

For non-Roman land, still give the controlling polity (`p`) so the map shows Rome's enemies and neighbours: Carthage, the Seleucids, Ptolemies, Antigonids, Parthians, Sasanians, Gallic and Germanic peoples, Huns, Goths, Vandals, Franks, Avars, Slavs, the Rashidun caliphate, etc. Use ids from `content/polities.json`; add any missing polity in a `polities` array in your file.

Each region: `id` (prefix with area code like `it_`, `es_`, `ga_`, `br_`, `ge_`, `af_`, `gr_`, `an_`, `sy_`...), `name` (ancient name, e.g. "Samnium (Pentri)", "Gallia Belgica (Treveri)"), `seed`, `countries`, optional `zone`, `control`, `certainty`, `notes` (a sentence on what is debated or approximated).
