# Brief for city QA agents

You are fact-checking the research data behind the 3D city of Rome in `/home/claude/rome-experience` (read `content/city/SCHEMA_CITY.md` first for field meanings). The data was compiled by research agents and has not been checked. Your job is to find and fix errors, not to add new material.

**Never edit the original data files.** Write all fixes to your own patch file `content/city/patches/qa_<your-name>.json`:

```json
{"set": {"<record id>": {"<field>": <new value>, ...}},
 "delete": ["<record id>", ...],
 "log": [{"id": "...", "field": "loc", "old": ..., "new": ..., "severity": "major|minor", "reason": "...", "source": "..."}]}
```
`set` merges the fields you give into the record with that id (replace whole arrays such as `loc`, `sources`, `phases`). `delete` removes a record (only for real duplicates or inventions). Every change needs a `log` entry with its reason and source. Validate with `python3 -c "import json,sys; json.load(open(sys.argv[1]))" FILE`. No em dashes.

**What counts as an error**
- Wrong date: dedication, destruction, rebuild, regnal years, battle or event dates (year, month, day). Years are integers, BC negative, no year 0.
- Wrong position: more than about 25 m off for an excavated or documented building, or on the wrong hill or side of a street; wrong orientation (`rot`) by more than about 15 degrees where the plan is known. Use OpenStreetMap (api.openstreetmap.org map calls and nominatim may work), Pleiades, Wikipedia/Wikidata coordinates, published plans. Positions are [lon, lat].
- Wrong size by more than about 15% where measurements are published (podium, column count, diameter, height).
- Wrong people or event ids (check `content/_existing_index.txt`), wrong builder, wrong attribution.
- Fabricated or wrong citations: an ancient reference that does not say what is claimed, or modern scholarship that does not exist. Fix the reference if you can verify the right one, otherwise remove it.
- Factual errors in summaries, phases and notes.
- Certainty tags that overstate (a guessed site tagged "excavated") or understate.
- Version chains that contradict each other (overlapping versions of the same monument, gaps where the building stood, a building standing after it was demolished).

Prioritise by importance: famous and important monuments and events first, then the records tagged conjectural or approximate. Check every record in your scope at least briefly. Do not rewrite prose for style.

Scratch work goes in your own subfolder of `/tmp/claude-0/-home-claude/06b975e4-7772-558f-bf8e-2934a59ea71b/scratchpad/`. Do not run git. When done, reply with a short report: how many records checked, how many changed (major/minor), the most important corrections, and anything you could not resolve.
