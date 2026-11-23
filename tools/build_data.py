#!/usr/bin/env python3
"""Merge authored content (content/**.json) into runtime data (data/*.json) and validate it.

Run after tools/build_geo.py (needs data/geo/regions.json for region areas and edges).
python3 tools/build_data.py [--strict]
"""
import json, glob, os, re, sys, colorsys, collections, hashlib
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content')
DATA = os.path.join(ROOT, 'data')
MIN_Y, MAX_Y = -509, 641
STATUSES = ['direct', 'ally', 'client', 'occupied', 'contested', 'independent', 'unsettled']
warnings = collections.Counter()
warn_examples = collections.defaultdict(list)


def warn(kind, msg):
    warnings[kind] += 1
    if len(warn_examples[kind]) < 12:
        warn_examples[kind].append(msg)


FAMILY = {
    'roman': '#B03A2E', 'italic': '#A88B4A', 'etruscan': '#9C6B3E', 'greek': '#3E7CB1', 'punic': '#6B4FA0',
    'gallic': '#7E9A45', 'iberian': '#C08A3E', 'germanic': '#557A55', 'illyrian': '#8C6A5A', 'thracian_dacian': '#A3765C',
    'steppe': '#B3A05E', 'hellenistic': '#2F6FA8', 'anatolian': '#6F8FA0', 'semitic_arab': '#9A7B4F', 'iranian': '#3F8A78',
    'egyptian': '#C4A64A', 'berber': '#B88C5A', 'british': '#6F9A7E', 'caucasian': '#7E8FB0', 'slavic': '#8C8FB5', 'other': '#9A9184',
}
OVERRIDE = {
    'rome': '#B03A2E', 'rome_west': '#B84A33', 'rome_east': '#9C2F45', 'gallic_empire': '#D9913B', 'britannic_empire': '#C9A43E', 'domain_of_soissons': '#C98B5A', 'dalmatia_julius_nepos': '#C7894E',
    'palmyrene_empire': '#8E6BB0', 'carthage': '#6B4FA0', 'seleucid': '#3B6EA5', 'ptolemaic': '#4E9BB5', 'macedon_antigonid': '#2C4F8C',
    'parthia': '#3F8A78', 'sasanian': '#33658A', 'huns': '#8E7A3E', 'avars': '#8A7342', 'vandal_kingdom': '#4F6B8F',
    'visigothic_kingdom': '#5C7F4E', 'visigoths': '#5C7F4E', 'ostrogothic_kingdom': '#7A8F3E', 'ostrogoths': '#7A8F3E', 'frankish_kingdom': '#4E6E8E', 'franks': '#4E6E8E',
    'lombards': '#6E8A5A', 'rashidun': '#2E7D4F', 'odoacer_kingdom': '#8A9050', 'samnites': '#8F7A3A', 'latin_league': '#B59B5F',
    'pontus': '#5E7FA0', 'armenia': '#7C6EA0', 'numidia': '#B07A45', 'mauretania': '#A88452', 'aksum': '#9A6A4A', 'himyar': '#A88A5A',
    'slavs': '#8C8FB5', 'bulgars': '#A08F5E', 'dacia_kingdom': '#A3765C', 'kushan': '#A06A5A', 'hephthalites': '#9F8A60',
    'pergamon': '#6FA083', 'bithynia': '#B0896A', 'cappadocia': '#B5785A', 'commagene': '#A07C9C', 'galatia': '#8FA75A',
    'aetolian_league': '#7FA7C9', 'achaean_league': '#6C93BE', 'athens': '#8DB0D0', 'sparta': '#5F7FA8', 'rhodes': '#5FA3B0',
    'epirus': '#9A8FC0', 'nabataea': '#C58F5A', 'hasmonean': '#9B7E3A', 'judaea_herodian': '#A88A4E', 'osroene': '#B0905C',
    'syracuse': '#4F86B8', 'tarentum': '#6A9BC6', 'italiote_league': '#7FA7C9', 'etruscans': '#9C6B3E', 'veii': '#A9764A',
    'volsci': '#8A9A55', 'aequi': '#9BA066', 'sabines': '#B09060', 'umbrians': '#A38C5A', 'campanians': '#C4A060',
    'lucanians': '#9E7F55', 'bruttii': '#8C6D4A', 'senones': '#7E9A45', 'boii': '#6E8E40', 'insubres': '#86A24E',
    'iberia_kartli': '#7E8FB0', 'bosporan_kingdom': '#5E8FAF', 'sarmatians': '#B3A05E', 'scythians': '#C1A86A',
}


def color_for(p):
    if p['id'] in OVERRIDE:
        return OVERRIDE[p['id']]
    base = FAMILY.get(p.get('family'), FAMILY['other'])
    r, g, b = (int(base[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    hv = int(hashlib.md5(p['id'].encode()).hexdigest()[:4], 16) / 65535
    l = min(0.72, max(0.32, l + (hv - 0.5) * 0.2))
    h = (h + (hv - 0.5) * 0.16) % 1
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '#%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))


def load_all():
    coll = collections.defaultdict(list)
    for path in sorted(glob.glob(os.path.join(CONTENT, '**', '*.json'), recursive=True)):
        if os.path.basename(path).startswith('_'):
            continue
        try:
            d = json.load(open(path, encoding='utf-8'))
        except Exception as e:
            print('!! invalid JSON', path, e)
            continue
        if isinstance(d, list):
            print('!! top-level list ignored', path)
            continue
        rel = os.path.relpath(path, CONTENT)
        for k, v in d.items():
            if isinstance(v, list):
                for o in v:
                    if isinstance(o, dict):
                        o['_src'] = rel
                coll[k].extend(v)
    return coll


def good_loc(loc):
    return isinstance(loc, list) and len(loc) == 2 and all(isinstance(v, (int, float)) for v in loc) and -25 <= loc[0] <= 130 and -12 <= loc[1] <= 70


def year(v):
    if v is None:
        return None
    try:
        v = int(v)
    except Exception:
        return None
    return v if v != 0 else 1


def dedupe(items, kind, key=lambda o: o.get('id')):
    out = {}
    for o in items:
        k = key(o)
        if not k:
            warn(f'{kind}: missing id', str(o)[:80])
            continue
        if k in out:
            prev = out[k]
            # keep the richer record, fill gaps from the other
            a, b = (o, prev) if len(json.dumps(o)) > len(json.dumps(prev)) else (prev, o)
            for kk, vv in b.items():
                if kk not in a or a[kk] in (None, '', []):
                    a[kk] = vv
            out[k] = a
            warn(f'{kind}: duplicate id merged', k)
        else:
            out[k] = o
    return list(out.values())


def strip(o):
    return {k: v for k, v in o.items() if not k.startswith('_') and v not in (None, '', [])}


def main():
    strict = '--strict' in sys.argv
    C = load_all()
    # region corrections replace whole control arrays before anything else
    reg_by_id = {r.get('id'): r for r in C['regions']}
    for c in C['corrections']:
        if c.get('kind') == 'region' and c.get('control') and c.get('id') in reg_by_id:
            reg_by_id[c['id']]['control'] = c['control']
            warnings['applied: region correction'] += 1
    # journeys are drawn like campaigns
    for j in C['journeys']:
        j['kind'] = 'journey'
        C['campaigns'].append(j)
    # ---- polities
    pols = dedupe(C['polities'], 'polity')
    pol_ids = {p['id'] for p in pols}
    for p in pols:
        p['color'] = color_for(p)
        p.setdefault('family', 'other')
        p['start'] = year(p.get('start')) if p.get('start') is not None else MIN_Y
        p['end'] = year(p.get('end')) if p.get('end') is not None else MAX_Y

    def need_polity(pid, where):
        if pid and pid not in pol_ids:
            warn('unknown polity', f'{pid} ({where})')
            pols.append({'id': pid, 'name': pid.replace('_', ' ').title(), 'type': 'other', 'family': 'other', 'start': MIN_Y, 'end': MAX_Y, 'color': color_for({'id': pid, 'family': 'other'}), 'auto': True})
            pol_ids.add(pid)

    # ---- regions
    geo = json.load(open(os.path.join(DATA, 'geo', 'regions.json')))
    area = {f['properties']['id']: f['properties']['area'] for f in geo['features'] if f.get('geometry')}
    regs = dedupe([r for r in C['regions'] if not r.get('id', '').startswith('t_')], 'region')
    pidx = None
    out_regions = []
    for r in regs:
        ctl = []
        for c in sorted(r.get('control', []), key=lambda c: (year(c.get('from')) or MIN_Y)):
            a, b = year(c.get('from')), year(c.get('to'))
            if a is None or b is None:
                warn('region: bad period', r['id'])
                continue
            st = c.get('s', 'independent')
            if st not in STATUSES:
                warn('region: bad status', f"{r['id']} {st}")
                st = 'independent'
            p = c.get('p')
            if p:
                need_polity(p, r['id'])
            ctl.append([max(a, MIN_Y), min(b, MAX_Y), p, st, c.get('note')])
        # coverage check
        if ctl:
            if ctl[0][0] > MIN_Y:
                warn('region: gap at start', f"{r['id']} starts {ctl[0][0]}")
            if max(c[1] for c in ctl) < MAX_Y:
                warn('region: gap at end', f"{r['id']} ends {max(c[1] for c in ctl)}")
            for i in range(1, len(ctl)):
                if ctl[i][0] > ctl[i - 1][1] + 1 and not (ctl[i - 1][1] == -1 and ctl[i][0] == 1):
                    warn('region: internal gap', f"{r['id']} {ctl[i-1][1]}..{ctl[i][0]}")
        if r['id'] not in area:
            warn('region: no geometry', r['id'])
        out_regions.append({'id': r['id'], 'name': r.get('name', r['id']), 'area': area.get(r['id'], 0), 'ctl': ctl,
                            'notes': r.get('notes'), 'certainty': r.get('certainty'), 'seed': r.get('seed')})
    pols.sort(key=lambda p: (p.get('family') != 'roman', p['id']))
    pidx = {p['id']: i for i, p in enumerate(pols)}
    for r in out_regions:
        r['ctl'] = [[a, b, pidx.get(p, -1) if p else -1, STATUSES.index(st)] + ([n] if n else []) for a, b, p, st, n in r['ctl']]
        r['ctl'] = [c for c in r['ctl'] if c[2] >= 0 or STATUSES[c[3]] == 'unsettled']
        for c in r['ctl']:
            if c[2] < 0:
                c[2] = pidx.get('germani', 0)  # unsettled: colour irrelevant
        out_regions_clean = r
    atlas = {'polities': [strip(p) for p in pols], 'regions': [strip(r) for r in out_regions], 'statuses': STATUSES,
             'meta': {'built': __import__('datetime').date.today().isoformat()}}
    for r in atlas['regions']:
        r.setdefault('ctl', [])

    # ---- events
    evs = []
    for e in C['events']:
        e['year'] = year(e.get('year'))
        if e['year'] is None:
            warn('event: no year', e.get('id'))
            continue
        if e.get('endYear') is not None:
            e['endYear'] = year(e['endYear'])
        if 'loc' in e and not good_loc(e['loc']):
            warn('event: bad loc', f"{e.get('id')} {e.get('loc')}")
            e.pop('loc')
        for p in e.get('polities', []) or []:
            need_polity(p, e.get('id'))
        b = e.get('battle')
        if b:
            for s in b.get('sides', []):
                need_polity(s.get('polity'), e.get('id'))
            if b.get('victor') not in (None, 'indecisive'):
                need_polity(b.get('victor'), e.get('id'))
        e['importance'] = max(1, min(5, int(e.get('importance') or 2)))
        evs.append(e)
    # same id used for different events in different years: keep both by suffixing the year
    by_id = collections.defaultdict(list)
    for e in evs:
        by_id[e.get('id')].append(e)
    for i, lst in by_id.items():
        years = sorted({e['year'] for e in lst})
        if i and len(years) > 1:
            for e in lst:
                if e['year'] != years[-1]:
                    e['id'] = f"{i}_{abs(e['year'])}{'bc' if e['year'] < 0 else ''}"
                    warn('event: id collision renamed', e['id'])
    evs = dedupe(evs, 'event')
    # same title + year from two eras -> merge
    evs = dedupe(evs, 'event (title/year)', key=lambda o: (re.sub(r'\W+', '', o.get('title', '').lower()), o['year']))
    evs.sort(key=lambda e: (e['year'], e.get('month') or 13, e.get('day') or 0))

    people = dedupe(C['people'], 'person')
    for p in people:
        for k in ('born', 'died'):
            if p.get(k) is not None:
                p[k] = year(p[k])
    wars = dedupe(C['wars'], 'war')
    for w in wars:
        w['start'], w['end'] = year(w.get('start')), year(w.get('end') if w.get('end') is not None else w.get('start'))
        for side in w.get('sides', []) or []:
            for p in side:
                need_polity(p, w['id'])
    camps = dedupe(C['campaigns'], 'campaign')
    for c in camps:
        c['start'] = year(c.get('start'))
        c['end'] = year(c.get('end') if c.get('end') is not None else c.get('start'))
        path = []
        for pt in c.get('path', []):
            if good_loc(pt.get('loc')):
                if pt.get('y') is not None:
                    pt['y'] = year(pt['y'])
                path.append(pt)
            else:
                warn('campaign: bad point', f"{c['id']} {pt.get('loc')}")
        c['path'] = path
        need_polity(c.get('polity'), c['id'])
    places = dedupe(C['places'], 'place')
    for p in places:
        if not good_loc(p.get('loc')):
            warn('place: bad loc', f"{p.get('id')} {p.get('loc')}")
            p.pop('loc', None)
        if p.get('founded') is not None:
            p['founded'] = year(p['founded'])
        if p.get('pleiades'):
            p['pleiades'] = str(p['pleiades']).rstrip('/').split('/')[-1]
    legions = dedupe(C['legions'], 'legion')
    for l in legions:
        for s in l.get('stations', []):
            s['from'], s['to'] = year(s.get('from')), year(s.get('to') if s.get('to') is not None else s.get('from'))
            if 'loc' in s and not good_loc(s['loc']):
                warn('legion: bad loc', l['id'])
                s.pop('loc')
    frontiers = dedupe(C['frontiers'], 'frontier')
    for f in frontiers:
        f['built'] = year(f.get('built')) or MIN_Y
        if f.get('abandoned') is not None:
            f['abandoned'] = year(f['abandoned'])
        if not f.get('line') and f.get('rings'):
            f['line'] = f['rings'][0]
        f['line'] = [pt for pt in f.get('line', []) if good_loc(pt)]
    roads = dedupe(C['roads'], 'road')
    for r in roads:
        if r.get('built') is not None:
            r['built'] = year(r['built'])
        r['line'] = [pt for pt in r.get('line', []) if good_loc(pt)]
    sources = dedupe(C['sources'], 'source')
    glossary = dedupe(C['glossary'], 'glossary')
    series = dedupe(C['series'], 'series')
    # rulers: list of {office, list}; merge same office
    rul = collections.OrderedDict()
    for g in C['rulers']:
        off = g.get('office')
        if not off:
            continue
        rul.setdefault(off, [])
        rul[off].extend(g.get('list', []))
    rulers = []
    for off, lst in rul.items():
        seen = set()
        clean = []
        for r in lst:
            r['from'] = year(r.get('from'))
            r['to'] = year(r.get('to') if r.get('to') is not None else r.get('from'))
            if r['from'] is None:
                continue
            k = (r.get('id') or r.get('name'), r['from'])
            if k in seen:
                continue
            seen.add(k)
            clean.append(strip(r))
        clean.sort(key=lambda r: r['from'])
        rulers.append({'office': off, 'list': clean})
    fasti = {}
    for f in C['fasti']:
        y = year(f.get('year'))
        if y is None:
            continue
        f['year'] = y
        fasti[y] = strip(f)
    chapters = dedupe(C['chapters'], 'chapter')
    chapters.sort(key=lambda c: (year(c.get('from')) or 0, year(c.get('to')) or 0))

    # ---- patches, then corrections
    REPLACED = {}
    lists = {'event': evs, 'person': people, 'war': wars, 'campaign': camps, 'place': places, 'legion': legions,
             'polity': pols, 'glossary': glossary, 'source': sources, 'frontier': frontiers, 'road': roads}
    index = {k: {o.get('id'): o for o in v} for k, v in lists.items()}
    for kind_key, label in (('patches', 'patch'), ('corrections', 'correction')):
        for pt in C[kind_key]:
            k = pt.get('kind')
            if k == 'region':
                continue
            if k == 'ruler':
                for g in rulers:
                    if g['office'] == pt.get('office'):
                        for r in g['list']:
                            if r.get('name') == pt.get('name') or (pt.get('id') and r.get('id') == pt.get('id')):
                                r.update(pt.get('set', {}))
                                warnings[f'applied: {label}'] += 1
                continue
            o = index.get(k, {}).get(pt.get('id'))
            if not o:
                warn(f'{label}: target missing', f"{k}:{pt.get('id')}")
                continue
            if pt.get('delete'):
                lst = lists[k]
                lst.remove(o)
                if pt.get('replacedBy'):
                    REPLACED[pt['id']] = pt['replacedBy']
                warnings[f'applied: {label} (delete)'] += 1
                continue
            for f, v in (pt.get('set') or {}).items():
                if f in ('year', 'endYear', 'born', 'died', 'start', 'end', 'founded'):
                    v = year(v)
                if f == 'loc' and not good_loc(v):
                    warn(f'{label}: bad loc', pt.get('id'))
                    continue
                o[f] = v
            for f, v in (pt.get('append') or {}).items():
                cur = o.get(f) or []
                if isinstance(cur, list) and isinstance(v, list):
                    o[f] = cur + [x for x in v if x not in cur]
                elif isinstance(cur, str) and isinstance(v, str):
                    o[f] = (cur + '\n\n' + v).strip()
            warnings[f'applied: {label}'] += 1
    evs.sort(key=lambda e: (e['year'], e.get('month') or 13, e.get('day') or 0))

    # ---- second-pass collections
    def locs_ok(lst, kind, key='loc'):
        out = []
        for o in lst:
            if key in o and not good_loc(o[key]):
                warn(f'{kind}: bad loc', o.get('id'))
                o.pop(key)
            out.append(o)
        return out
    provinces = dedupe(C['provinces'], 'province')
    for pv in provinces:
        for k in ('created', 'ended'):
            if pv.get(k) is not None:
                pv[k] = year(pv[k])
        if pv.get('labelLoc') and not good_loc(pv['labelLoc']):
            warn('province: bad labelLoc', pv['id'])
            pv.pop('labelLoc')
    monuments = locs_ok(dedupe(C['monuments'], 'monument'), 'monument')
    mints = dedupe(C['mints'], 'mint')
    hoards = locs_ok(dedupe(C['hoards'], 'hoard'), 'hoard')
    coinage = dedupe(C['coinage'], 'coinage')
    for c in coinage:
        c['year'] = year(c.get('year'))
    sites = locs_ok(dedupe(C['sites'], 'site'), 'site')
    routes = dedupe(C['routes'], 'route')
    for r in routes:
        r['line'] = [pt for pt in r.get('line', []) if good_loc(pt)]
    tours = dedupe(C['tours'], 'tour')
    tours.sort(key=lambda t: year((t.get('stops') or [{}])[0].get('year')) or 0)
    tactics = dedupe(C['tactics'], 'tactic', key=lambda o: o.get('event'))

    # cross-reference checks, with alias repair for near-miss ids
    ids = set()
    for lst in (evs, people, wars, camps, places, legions, frontiers, roads, sources, glossary):
        ids |= {o['id'] for o in lst if o.get('id')}
    ids |= pol_ids | {r['id'] for r in out_regions}
    for lst in (provinces, monuments, mints, hoards, sites, routes):
        ids |= {o['id'] for o in lst if o.get('id')}
    alias_cache = {**REPLACED, 'battle_of_aegates_islands': 'battle_of_the_aegates', 'battle_of_philippi': 'battle_of_philippi_second', 'dacian_wars': 'first_dacian_war'}

    def resolve(i):
        if not i or i in ids:
            return i
        if i in alias_cache:
            return alias_cache[i]
        cands = []
        base = re.sub(r'_\d{1,3}(bc)?$', '', i)
        for v in (i.replace('battle_of_', 'battle_of_the_'), i.replace('siege_of_', 'siege_of_the_'), i.replace('_of_the_', '_of_'),
                  base, base.replace('battle_of_', 'battle_of_the_'), i + 's', i.rstrip('s')):
            if v in ids:
                cands.append(v)
        if not cands:
            pref = [x for x in ids if x.startswith(base + '_') and re.match(r'^_\d', x[len(base):])]
            if len(pref) == 1:
                cands = pref
        if not cands:
            import difflib
            pre = i.split('_of_')[0] + '_of_' if '_of_' in i else ''
            pool = [x for x in ids if x.startswith(pre)] if pre else list(ids)
            cands = difflib.get_close_matches(i, pool, n=1, cutoff=0.86)
        alias_cache[i] = cands[0] if cands else i
        return alias_cache[i]

    for e in evs:
        if e.get('people'):
            e['people'] = [resolve(p) for p in e['people']]
        if e.get('war'):
            e['war'] = resolve(e['war'])
        if e.get('place'):
            e['place'] = resolve(e['place'])
    for ch in chapters:
        ch['body'] = re.sub(r'\[\[([^\]|]+)', lambda m: '[[' + resolve(m.group(1).strip()), ch.get('body', ''))
    for c in camps:
        if c.get('war'):
            c['war'] = resolve(c['war'])
        for pt in c.get('path', []):
            if pt.get('event'):
                pt['event'] = resolve(pt['event'])
    for p in people:
        if p.get('related'):
            p['related'] = [resolve(r) for r in p['related']]
    for t in tactics:
        t['event'] = resolve(t['event'])
        if t['event'] not in ids:
            warn('tactic: unknown event', t['event'])
    for t in tours:
        for st in t.get('stops', []):
            if st.get('select'):
                st['select'] = resolve(st['select'])
    for c in coinage:
        if c.get('issuer'):
            c['issuer'] = resolve(c['issuer'])
    for pv in provinces:
        if pv.get('capital'):
            pv['capital'] = resolve(pv['capital'])
    print('aliases repaired:', sum(1 for k, v in alias_cache.items() if k != v))
    for e in evs:
        for p in e.get('people', []) or []:
            if p not in ids:
                warn('event: unknown person', f"{p} in {e['id']}")
        if e.get('war') and e['war'] not in ids:
            warn('event: unknown war', f"{e['war']} in {e['id']}")
    for ch in chapters:
        for m in re.findall(r'\[\[([^\]|]+)', ch.get('body', '')):
            if m.strip() not in ids:
                warn('chapter: dead link', m)

    codex = {k: [strip(o) for o in v] for k, v in dict(events=evs, people=people, wars=wars, campaigns=camps, places=places, legions=legions,
                                                     frontiers=frontiers, roads=roads, sources=sources, glossary=glossary, series=series).items()}
    codex['rulers'] = rulers
    codex['fasti'] = [fasti[y] for y in sorted(fasti)]
    # heavy long-form fields go to a lazily loaded file so first paint is fast
    HEAVY = ('detail', 'debate', 'scholarship', 'sources')
    details = {}
    for kname, lst in (('events', codex['events']), ('people', codex['people']), ('wars', codex['wars'])):
        dk = details.setdefault(kname, {})
        for o in lst:
            h = {f: o.pop(f) for f in HEAVY if f in o}
            if h:
                dk[o['id']] = h
    with open(os.path.join(DATA, 'details.json'), 'w', encoding='utf-8') as f:
        json.dump(details, f, ensure_ascii=False, separators=(',', ':'))
    extra = {k: [strip(o) for o in v] for k, v in dict(provinces=provinces, monuments=monuments, mints=mints, hoards=hoards, coinage=coinage,
                                                     sites=sites, routes=routes, tours=tours).items()}
    for k, v in (('atlas', atlas), ('codex', codex), ('chapters', {'chapters': [strip(c) for c in chapters]}), ('extra', extra), ('tactics', {'tactics': [strip(t) for t in tactics]})):
        with open(os.path.join(DATA, f'{k}.json'), 'w', encoding='utf-8') as f:
            json.dump(v, f, ensure_ascii=False, separators=(',', ':'))
    build_edges()
    build_sea()
    print('extra:', {k: len(v) for k, v in extra.items()}, 'tactics', len(tactics))
    print('counts:', {k: len(v) for k, v in codex.items()}, 'polities', len(pols), 'regions', len(out_regions), 'chapters', len(chapters))
    for k in sorted(warnings):
        print(f'  warn {warnings[k]:4d}  {k}: {", ".join(map(str, warn_examples[k][:6]))}')
    for f in sorted(glob.glob(os.path.join(DATA, '*.json'))):
        print(f'{os.path.getsize(f)/1024:8.0f} KB  {os.path.basename(f)}')
    if strict and warnings:
        sys.exit(1)


def build_edges():
    path = os.path.join(DATA, 'geo', 'regions.json')
    geo = json.load(open(path))
    n0 = len(geo['features'])
    geo['features'] = [f for f in geo['features'] if f.get('geometry')]
    if len(geo['features']) != n0:
        json.dump(geo, open(path, 'w'), separators=(',', ':'))
    feats = [(f['properties']['rid'], shape(f['geometry']).buffer(0)) for f in geo['features']]
    geoms = [g for _, g in feats]
    tree = STRtree(geoms)
    out = []
    eid = 0
    for i, (rid, g) in enumerate(feats):
        for j in tree.query(g.buffer(1e-6)):
            if j <= i:
                continue
            h = feats[j][1]
            inter = g.boundary.intersection(h.boundary)
            if inter.is_empty:
                continue
            lines = [x for x in getattr(inter, 'geoms', [inter]) if x.geom_type in ('LineString', 'MultiLineString')]
            if not lines:
                continue
            u = unary_union(lines)
            if u.length < 0.01:
                continue
            gj = mapping(u)
            out.append({'type': 'Feature', 'properties': {'eid': eid, 'a': rid, 'b': feats[j][0]}, 'geometry': gj})
            eid += 1
    json.dump({'type': 'FeatureCollection', 'features': out}, open(os.path.join(DATA, 'geo', 'region_edges.json'), 'w'), separators=(',', ':'))


def build_sea():
    land = json.load(open(os.path.join(DATA, 'geo', 'land.json')))
    g = unary_union([shape(f['geometry']).buffer(0) for f in land['features']])
    sea = box(-40, -5, 100, 75).difference(g.buffer(-0.01))
    def rnd(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], 3), round(c[1], 3)]
        return [rnd(x) for x in c]
    gj = mapping(sea)
    gj = {'type': gj['type'], 'coordinates': rnd(gj['coordinates'])}
    json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {}, 'geometry': gj}]},
              open(os.path.join(DATA, 'geo', 'sea.json'), 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main()
