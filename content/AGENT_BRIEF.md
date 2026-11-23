# Brief for content authors

You are writing data for **Rome Experience**, an interactive atlas + encyclopedia + history textbook of Rome from the foundation of the Republic (509 BC) to the death of Heraclius (AD 641). The audience is the serious academic researcher and the most obsessive enthusiast. Density, precision and genuinely interesting detail matter more than breadth of generic facts. A reader should learn things they would not find in a pop history.

Read `content/SCHEMA.md` (format) and `content/polities.json` (polity ids you must use) before writing.

## Quality bar

- Accuracy first. Draw on standard scholarship (CAH, Broughton's MRR, PLRE, OCD, Barrington Atlas, Goldsworthy, Beard, Cornell, Harris, Gruen, Millar, Heather, Halsall, Kaldellis, Haldon, Whitby, Greatrex & Lieu). If you are not confident of a fact, leave it out or mark `certainty` and explain in `debate`/`note`. Never invent sources or citation references.
- You may use WebSearch/WebFetch to check specific coordinates, dates or citations when unsure, but most content should come from your own knowledge. Do not spend long on searching.
- Coordinates must be right: check longitude/latitude order `[lon, lat]`. Rome is `[12.4924, 41.8902]`. A coordinate in the sea or on the wrong continent is a serious bug.
- Write like a sharp historian: concrete numbers, names, places, mechanisms, consequences, and what the sources say vs what modern scholars think. No filler, no em dashes, no moralizing.
- Include the nerd-level material: minor battles, laws (leges) by name, colonies founded, temples dedicated, triumphs, prodigies, famines, plagues, coin reforms, eclipses used for dating, religious controversies, legal codifications, building programmes, diplomatic marriages, hostages, treaties with their terms.

## Canonical ids for figures shared across eras (use exactly these)

romulus, tarquinius_superbus, lucius_junius_brutus, coriolanus, cincinnatus, marcus_furius_camillus, brennus, appius_claudius_caecus, manius_curius_dentatus, pyrrhus, hamilcar_barca, hasdrubal_the_fair, hannibal_barca, hasdrubal_barca, mago_barca, scipio_africanus, quintus_fabius_maximus, marcus_claudius_marcellus, philip_v, antiochus_iii, cato_the_elder, scipio_aemilianus, masinissa, jugurtha, tiberius_gracchus, gaius_gracchus, gaius_marius, sulla, mithridates_vi, sertorius, spartacus, crassus, pompey, cicero, julius_caesar, cato_the_younger, vercingetorix, mark_antony, cleopatra_vii, lepidus_triumvir, brutus_assassin (Marcus Junius Brutus), cassius, sextus_pompey, agrippa, augustus (Octavian), livia, tiberius, germanicus, caligula, claudius, nero, galba, otho, vitellius, vespasian, titus, domitian, nerva, trajan, hadrian, antoninus_pius, marcus_aurelius, lucius_verus, commodus, pertinax, didius_julianus, septimius_severus, caracalla, geta, macrinus, elagabalus, severus_alexander, maximinus_thrax, gordian_iii, philip_the_arab, decius, valerian, gallienus, claudius_gothicus, aurelian, zenobia, probus, diocletian, maximian, constantius_i, galerius, maxentius, licinius, constantine_i, constantius_ii, julian, jovian, valentinian_i, valens, gratian, theodosius_i, arminius, boudica, decebalus, shapur_i, shapur_ii, alaric_i, stilicho, honorius, arcadius, theodosius_ii, galla_placidia, aetius, attila, gaiseric, valentinian_iii, ricimer, majorian, odoacer, romulus_augustulus, zeno, anastasius_i, theodoric_the_great, clovis_i, justin_i, justinian_i, theodora, belisarius, narses, khosrow_i, totila, justin_ii, tiberius_ii, maurice, phocas, heraclius, khosrow_ii, muhammad, umar, constantine_iii_heraclius, heraclonas.

Battles: `battle_of_<place>` (e.g. `battle_of_cannae`, `battle_of_adrianople_378`). Sieges: `siege_of_<place>[_year]`. Wars: `<ordinal>_<name>_war` (e.g. `second_punic_war`, `third_mithridatic_war`, `gallic_wars`, `marcomannic_wars`, `gothic_war_535`).

## Writing files

- Write with the Write tool into the folder you are given. Several files of moderate size (each under ~120 KB) beat one giant file.
- Validate each file after writing: `python3 -c "import json,sys; json.load(open(sys.argv[1]))" <file>` and fix errors.
- Do not edit files outside your folder.
- When finished, reply with a 3-line summary: counts per collection and any known weak spots.
