"""Normalise content/city/** into data/city/city.json (+ city_text.json) in local metres.

Imported by build_city.py (stage 'city').
"""
import json, math, os, re
import numpy as np
from build_city import P, to_local, sample_base, OUT, ROOT, TX0, TZ0, TSTEP, TN

YMIN, YMAX = -800, 9999
TEXT_KEYS = ('summary', 'phases', 'sources', 'scholarship', 'note', 'notes', 'description', 'detail', 'character')


def num(v, d=None):
    try:
        if v is None:
            return d
        f = float(v)
        return f if math.isfinite(f) else d
    except Exception:
        return d


def yr(v, d):
    v = num(v, None)
    if v is None:
        return d
    v = int(round(v))
    return v if v != 0 else 1


def ll(pt):
    """accept [lon,lat] or {lon,lat}; return None if invalid / swapped"""
    if pt is None:
        return None
    if isinstance(pt, dict):
        pt = [pt.get('lon', pt.get('lng')), pt.get('lat')]
    if not isinstance(pt, (list, tuple)) or len(pt) < 2:
        return None
    a, b = num(pt[0]), num(pt[1])
    if a is None or b is None:
        return None
    if 41 < a < 43 and 11 < b < 14:  # swapped lat/lon
        a, b = b, a
    if not (12.2 < a < 12.8 and 41.7 < b < 42.1):
        return None
    return [a, b]


def line_local(pts):
    out = []
    for p in pts or []:
        q = ll(p)
        if q:
            x, z = to_local(*q)
            out.append([round(x, 2), round(z, 2)] + ([round(num(p[2], 0), 2)] if isinstance(p, (list, tuple)) and len(p) > 2 and num(p[2]) is not None else []))
    return out


class Layers:
    """terrain correction layers for sampling heights in a given year (mirrors js/city/terrain.js)"""

    def __init__(self, meta):
        self.meta = meta
        path = os.path.join(OUT, 'terrain_layers.bin')
        self.bytes = np.fromfile(path, np.uint8) if os.path.exists(path) else np.zeros(0, np.uint8)

    def height(self, base, x, z, year):
        h = sample_base(base, x, z)
        fi = (x - TX0) / TSTEP; fj = (z - TZ0) / TSTEP
        i = int(round(fi)); j = int(round(fj))
        for L in self.meta.get('layers', []):
            if not (L['from'] <= year <= L['to']):
                continue
            ii = i - L['i0']; jj = j - L['j0']
            if 0 <= ii < L['w'] and 0 <= jj < L['h']:
                h += L['delta'] * self.bytes[L['off'] + jj * L['w'] + ii] / 255.0
        return h


def dedupe(items, warn):
    """Drop versions written twice by different research passes (same structure, overlapping years, same spot)."""
    import difflib
    pts = []
    for r in items:
        q = ll(r.get('loc')) if isinstance(r, dict) else None
        if not q and isinstance(r, dict) and r.get('line'):
            ln = [ll(p) for p in r['line']]; ln = [p for p in ln if p]
            if ln:
                q = ln[len(ln) // 2]
        pts.append(to_local(*q) if q else None)
    drop = set()
    norm = lambda s: re.sub(r'\(.*?\)|\b(the|of|temple|v\d+)\b|[^a-z ]', ' ', (s or '').lower()).split()
    for i in range(len(items)):
        if i in drop or pts[i] is None:
            continue
        a = items[i]
        for j in range(i + 1, len(items)):
            if j in drop or pts[j] is None:
                continue
            b = items[j]
            if a.get('_src') == b.get('_src'):
                continue
            d = math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
            small = {'obelisk', 'column', 'statue', 'altar', 'fountain', 'tomb', 'arch', 'tholos'}
            lim = 10 if (a.get('template') in small or b.get('template') in small) else 300 if (a.get('template') == 'garden' and b.get('template') == 'garden') else 45
            if d > lim:
                continue
            fa, ta = yr(a.get('from'), YMIN), yr(a.get('to'), YMAX)
            fb, tb = yr(b.get('from'), YMIN), yr(b.get('to'), YMAX)
            if min(ta, tb) - max(fa, fb) < 5:
                continue
            same_m = a.get('monument') and a.get('monument') == b.get('monument')
            na, nb = ' '.join(norm(a.get('name'))), ' '.join(norm(b.get('name')))
            sim = difflib.SequenceMatcher(None, na, nb).ratio()
            if a.get('template') == 'garden' and b.get('template') == 'garden' and not (same_m or sim > 0.88):
                continue
            if not (same_m or (sim > 0.62 and a.get('template') == b.get('template')) or (sim > 0.8)):
                continue
            score = lambda r: len(json.dumps(r)) + (800 if r.get('footprint') else 0) + (400 if r.get('params') else 0)
            loser = j if score(a) >= score(b) else i
            drop.add(loser)
            warn.append(f"dup: kept {items[i if loser == j else j].get('id')} ({items[i if loser == j else j].get('_src')}) over {items[loser].get('id')} ({items[loser].get('_src')})")
            if loser == i:
                break
    return [r for k, r in enumerate(items) if k not in drop]


def build(C, meta, sampler):
    class _L:
        def height(self, _b, x, z, y):
            return sampler.height(x, z, y)
    layers = _L(); base = None
    text = {}
    warn = []

    def stash(kind, rid, obj):
        t = {k: obj[k] for k in TEXT_KEYS if obj.get(k)}
        for k in ('builder', 'builderName', 'event', 'people', 'certainty', 'importance', 'cats', 'locName', 'precision', 'modern', 'monument', 'kind'):
            if obj.get(k) is not None:
                t[k] = obj[k]
        if t:
            text[f'{kind}:{rid}'] = t

    # ------------------------------------------------------------ buildings
    blds = []
    seen = set()
    C['buildings'] = dedupe(C['buildings'], warn)
    for raw in C['buildings']:
        if not isinstance(raw, dict):
            continue
        rid = str(raw.get('id') or '').strip()
        if not rid:
            continue
        if rid in seen:
            k = 2
            while f'{rid}_{k}' in seen:
                k += 1
            rid = f'{rid}_{k}'
        tp = str(raw.get('template') or 'compound').lower()
        loc = ll(raw.get('loc'))
        line = line_local(raw.get('line') or (raw.get('params') or {}).get('line'))
        fp = line_local(raw.get('footprint'))
        if not loc:
            if line:
                xs = [p[0] for p in line]; zs = [p[1] for p in line]
                x, z = sum(xs) / len(xs), sum(zs) / len(zs)
            elif len(fp) >= 3:
                x, z = sum(p[0] for p in fp) / len(fp), sum(p[1] for p in fp) / len(fp)
            else:
                warn.append(f'no loc: {rid}')
                continue
        else:
            x, z = to_local(*loc)
        seen.add(rid)
        f = yr(raw.get('from'), YMIN)
        t = yr(raw.get('to'), YMAX)
        begun = yr(raw.get('begun'), f)
        if begun > f:
            begun = f
        if f - begun > 40:
            begun = f - 40
        p = dict(raw.get('params') or {})
        for k in ('order', 'plan', 'front', 'side'):
            if k in raw and k not in p:
                p[k] = raw[k]
        mat = raw.get('material') or raw.get('materials') or p.pop('mat', None) or raw.get('mat')
        w = num(raw.get('w'), num((raw.get('dims') or {}).get('w'), None))
        l = num(raw.get('l'), num((raw.get('dims') or {}).get('l'), None))
        h = num(raw.get('h'), num((raw.get('dims') or {}).get('h'), None))
        if tp == 'amphitheatre':
            a = num(p.get('a'), l); bb = num(p.get('b'), w)
            if a and bb and a < bb:
                a, bb = bb, a
            p['a'], p['b'] = a, bb
            w, l = bb, a
        if tp in ('tholos', 'mausoleum', 'centralplan') and not w:
            w = l = num(p.get('diameter'), 20)
        if tp == 'theatre' and not w:
            w = l = num(p.get('diameter'), 90)
        w = w or (max(p_[0] for p_ in fp) - min(p_[0] for p_ in fp) if len(fp) >= 3 else 12)
        l = l or (max(p_[1] for p_ in fp) - min(p_[1] for p_ in fp) if len(fp) >= 3 else w)
        h = h or {'temple': 15, 'basilica': 18, 'church': 20, 'garden': 1, 'pool': 1, 'forum': 1, 'arch': 12, 'bridge': 10}.get(tp, 10)
        rot = num(raw.get('rot'), 0) % 360
        # ground: min of a few samples (podia and substructures absorb slopes) at the version's first year
        yb = max(begun, -800)
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        samples = [(0, 0)] + [(sx * w * 0.3, sf * l * 0.3) for sx in (-1, 1) for sf in (-1, 1)]
        hs = [layers.height(base, x + X * c + F * s, z + X * s - F * c, yb) for X, F in samples]
        gy = min(hs) if tp not in ('bridge', 'harbor') else hs[0]
        if tp in ('garden', 'pool', 'forum', 'platform') and len(fp) >= 3:
            gy = float(np.median(hs))
        rec = {'i': len(blds), 'id': rid, 'm': raw.get('monument') or rid, 'n': raw.get('name') or rid, 'f': f, 't': t, 'b': begun,
               'tp': tp, 'x': round(x, 2), 'z': round(z, 2), 'y': round(gy, 2), 'r': round(rot, 1),
               'w': round(w, 2), 'l': round(l, 2), 'h': round(h, 2), 'p': p, 'imp': int(num(raw.get('importance'), 2)),
               'c': raw.get('certainty') or ''}
        if mat:
            rec['mat'] = mat
        if fp and len(fp) >= 3:
            rec['fp'] = [q[:2] for q in fp]
        if line:
            rec['ln'] = [q[:2] for q in line]
            if tp == 'bridge':
                rec['deckY'] = round(max(layers.height(base, line[0][0], line[0][1], yb), layers.height(base, line[-1][0], line[-1][1], yb)) + 0.5, 2)
        ru = raw.get('ruin')
        if isinstance(ru, dict) and num(ru.get('from')):
            rec['ru'] = [yr(ru['from'], t), ru.get('state', 'roofless')]
        blds.append(rec)
        stash('b', rid, raw)

    # waters as pool buildings
    for wtr in C['terrain'].get('waters', []) or []:
        if not isinstance(wtr, dict):
            continue
        poly = line_local(wtr.get('polygon'))
        if len(poly) < 3 or wtr.get('kind') in ('spring', 'stream'):
            continue
        rid = 'water_' + str(wtr.get('id') or len(blds))
        xs = [q[0] for q in poly]; zs = [q[1] for q in poly]
        x, z = sum(xs) / len(xs), sum(zs) / len(zs)
        f = yr(wtr.get('from'), YMIN); t = yr(wtr.get('to'), YMAX)
        gy = num(wtr.get('elev'), None)
        if gy is None:
            gy = min(layers.height(base, q[0], q[1], max(f, -800)) for q in poly[::max(1, len(poly) // 8)])
        blds.append({'i': len(blds), 'id': rid, 'm': rid, 'n': wtr.get('name') or rid, 'f': f, 't': t, 'b': f, 'tp': 'pool',
                     'x': round(x, 2), 'z': round(z, 2), 'y': round(gy, 2), 'r': 0, 'w': max(xs) - min(xs), 'l': max(zs) - min(zs), 'h': 1,
                     'p': {'kind': wtr.get('kind')}, 'imp': 1, 'c': wtr.get('certainty') or '', 'fp': [q[:2] for q in poly], 'water': 1})
        stash('b', rid, wtr)

    # ------------------------------------------------------------ framework
    walls = []
    for wl in C['walls']:
        ln = line_local(wl.get('line'))
        if len(ln) < 2:
            continue
        phases = [{'y': yr(ph.get('y'), 0), 'h': num(ph.get('h')), 'br': num(ph.get('breachFraction'))} for ph in (wl.get('phases') or []) if isinstance(ph, dict) and (num(ph.get('h')) or ph.get('breachFraction') is not None)]
        rec = {'id': wl.get('id'), 'n': wl.get('name'), 'f': yr(wl.get('from'), YMIN), 't': yr(wl.get('to'), YMAX), 'ln': [q[:2] for q in ln],
               'h': num(wl.get('h'), 8), 'th': num(wl.get('thickness'), 3), 'mat': wl.get('mat') or 'tufa', 'closed': bool(wl.get('closed')),
               'tw': wl.get('towers') if isinstance(wl.get('towers'), dict) else None, 'ph': phases, 'kind': wl.get('kind') or ('agger' if wl.get('agger') else None)}
        if wl.get('agger'):
            rec['ag'] = {'w': num(wl['agger'].get('rampartW'), 30), 'h': num(wl['agger'].get('rampartH'), 8), 'side': wl['agger'].get('side', 'inner')}
        rec['gy'] = [round(layers.height(base, q[0], q[1], max(rec['f'], -800)), 2) for q in rec['ln']]
        walls.append(rec)
        stash('w', rec['id'], wl)
    gates = []
    for g in C['gates']:
        q = ll(g.get('loc'))
        if not q:
            continue
        x, z = to_local(*q)
        rec = {'id': g.get('id'), 'n': g.get('name'), 'wall': g.get('wall'), 'x': round(x, 2), 'z': round(z, 2), 'r': num(g.get('rot'), 0),
               'f': yr(g.get('from'), YMIN), 't': yr(g.get('to'), YMAX), 'w': num(g.get('w'), 6), 'h': num(g.get('h'), 10),
               'tw': g.get('towers') or 'none', 'bays': int(num(g.get('bays'), 1)), 'ng': 1 if g.get('noGeom') else 0}
        rec['y'] = round(layers.height(base, x, z, max(rec['f'], -800)), 2)
        gates.append(rec)
        stash('g', rec['id'], g)
    streets = []
    for st in C['streets']:
        ln = line_local(st.get('line'))
        if len(ln) < 2:
            continue
        rec = {'id': st.get('id'), 'n': st.get('name'), 'f': yr(st.get('from'), YMIN), 't': yr(st.get('to'), YMAX), 'ln': [q[:2] for q in ln],
               'w': num(st.get('w'), 5), 'pv': yr(st.get('paved'), None) if st.get('paved') else None, 'rk': int(num(st.get('rank'), 2))}
        streets.append(rec)
        stash('s', rec['id'], st)
    aqueducts = []
    for aq in C['aqueducts']:
        ln = line_local(aq.get('line'))
        if len(ln) < 2:
            continue
        rec = {'id': aq.get('id'), 'n': aq.get('name'), 'f': yr(aq.get('from'), YMIN), 't': yr(aq.get('to'), YMAX), 'b': yr(aq.get('begun'), yr(aq.get('from'), YMIN)),
               'ln': ln, 'arc': aq.get('arcade') or [], 'ch': int(num(aq.get('channels'), 1)), 'spec': aq.get('spec') or {},
               'stk': 1 if (aq.get('stacked') or aq.get('onArcadeOf')) else 0, 'fl': aq.get('flowing')}
        rec['gy'] = [round(layers.height(base, q[0], q[1], max(rec['f'], -800)), 2) for q in ln]
        aqueducts.append(rec)
        stash('a', rec['id'], aq)
        for br in aq.get('branches') or []:
            if isinstance(br, dict):
                bl = line_local(br.get('line'))
                if len(bl) >= 2:
                    r2 = {'id': (aq.get('id') or '') + '_' + str(br.get('id') or br.get('name') or len(aqueducts)), 'n': br.get('name') or (aq.get('name') or '') + ' branch',
                          'f': yr(br.get('from'), rec['f']), 't': yr(br.get('to'), rec['t']), 'b': yr(br.get('from'), rec['f']), 'ln': bl, 'arc': br.get('arcade') or [],
                          'ch': 1, 'spec': br.get('spec') or rec['spec']}
                    r2['gy'] = [round(layers.height(base, q[0], q[1], max(r2['f'], -800)), 2) for q in bl]
                    aqueducts.append(r2)
    regions = []
    for rg in C['regions']:
        poly = line_local(rg.get('polygon'))
        if len(poly) < 3:
            continue
        cx_ = sum(q[0] for q in poly) / len(poly); cz_ = sum(q[1] for q in poly) / len(poly)
        regions.append({'id': rg.get('id'), 'num': rg.get('num'), 'n': rg.get('name'), 'f': yr(rg.get('from'), -7), 't': yr(rg.get('to'), YMAX),
                        'poly': [q[:2] for q in poly], 'cat': rg.get('catalogue') or {}, 'catN': rg.get('catalogueNotitia') or {}, 'x': round(cx_, 1), 'z': round(cz_, 1)})
        stash('r', rg.get('id'), rg)
    for rg in C['servianRegions']:
        poly = line_local(rg.get('polygon'))
        if len(poly) >= 3:
            regions.append({'id': rg.get('id'), 'n': rg.get('name'), 'f': yr(rg.get('from'), -509), 't': yr(rg.get('to'), -8), 'poly': [q[:2] for q in poly], 'servian': 1, 'cat': {}})
            stash('r', rg.get('id'), rg)

    # ------------------------------------------------------------ events, places, routes
    events = []
    for ev in C['cityEvents']:
        q = ll(ev.get('loc'))
        if not q:
            warn.append(f"event no loc: {ev.get('id')}")
            continue
        x, z = to_local(*q)
        y = yr(ev.get('year'), None)
        if y is None:
            continue
        rec = {'id': ev.get('id'), 'y': y, 'mo': ev.get('month'), 'd': ev.get('day'), 'ti': ev.get('title'), 'x': round(x, 2), 'z': round(z, 2),
               'pr': ev.get('precision') or 'approx', 'cats': ev.get('cats') or [], 'm': ev.get('monument'), 'ev': ev.get('event'), 'pp': ev.get('people') or []}
        if ev.get('endYear'):
            rec['y2'] = yr(ev.get('endYear'), y)
        events.append(rec)
        stash('e', rec['id'], ev)
    # snap 'building'-precision events to the version of their monument standing that year
    bym = {}
    for b in blds:
        bym.setdefault(b['m'], []).append(b); bym.setdefault(b['id'], []).append(b)
    snapped = 0
    for e in events:
        if e['pr'] != 'building' or not e.get('m'):
            continue
        cands = [b for b in bym.get(e['m'], []) if b['b'] <= e['y'] <= b['t']] or bym.get(e['m'], [])
        if not cands:
            continue
        b = min(cands, key=lambda b: abs(b['x'] - e['x']) + abs(b['z'] - e['z']))
        d = math.hypot(b['x'] - e['x'], b['z'] - e['z'])
        if 15 < d < 400:
            e['x'], e['z'] = b['x'], b['z']; snapped += 1
    print('events snapped to buildings:', snapped)
    events.sort(key=lambda e: (e['y'], e.get('mo') or 13, e.get('d') or 0))
    places = []
    for pl in C['cityPlaces']:
        q = ll(pl.get('loc'))
        if not q:
            continue
        x, z = to_local(*q)
        rec = {'id': pl.get('id'), 'n': pl.get('name'), 'k': pl.get('kind') or 'other', 'x': round(x, 2), 'z': round(z, 2),
               'f': yr(pl.get('from'), YMIN), 't': yr(pl.get('to'), YMAX)}
        places.append(rec)
        stash('p', rec['id'], pl)
    routes = []
    for rt in C['routes']:
        ln = line_local(rt.get('line'))
        if len(ln) < 2:
            continue
        routes.append({'id': rt.get('id'), 'n': rt.get('name'), 'k': rt.get('kind'), 'f': yr(rt.get('from'), YMIN), 't': yr(rt.get('to'), YMAX), 'ln': [q[:2] for q in ln],
                       'stops': [{'x': round(to_local(*ll(s['loc']))[0], 2), 'z': round(to_local(*ll(s['loc']))[1], 2), 't': s.get('t')} for s in (rt.get('stops') or []) if isinstance(s, dict) and ll(s.get('loc'))]})
        stash('o', rt.get('id'), rt)

    # hills (labels)
    hills = []
    for hl in C['terrain'].get('hills', []) or []:
        poly = line_local(hl.get('outline'))
        sm = ll(hl.get('summit')) if isinstance(hl.get('summit'), (list, tuple)) else None
        if poly:
            cx = sum(q[0] for q in poly) / len(poly); cz = sum(q[1] for q in poly) / len(poly)
        elif sm:
            cx, cz = to_local(*sm)
        else:
            continue
        nm = re.sub(r'\s*\(.*?\)', '', hl.get('name') or '').strip()
        hills.append({'id': hl.get('id'), 'n': nm or hl.get('name'), 'x': round(cx, 1), 'z': round(cz, 1), 'sub': 1 if (hl.get('partOf') or hl.get('artificial')) else 0})

    city = {'meta': {'origin': [12.4853, 41.8925], 'terrain': meta['terrain'], 'counts': {}},
            'buildings': blds, 'walls': walls, 'gates': gates, 'streets': streets, 'aqueducts': aqueducts, 'regions': regions,
            'events': events, 'places': places, 'routes': routes, 'hills': hills,
            'tours': [{'id': t.get('id'), 'title': t.get('title'), 'sub': t.get('sub'), 'stops': [dict(st, x=round(to_local(*ll(st['loc']))[0], 1), z=round(to_local(*ll(st['loc']))[1], 1)) for st in t.get('stops', []) if ll(st.get('loc'))]} for t in C.get('cityTours', [])],
            'tiber': [q[:2] for q in line_local((C['terrain'].get('tiber') or {}).get('centerline'))],
            'population': C.get('population') or [], 'fires': [{'y': yr(f.get('year'), 0), 'n': f.get('name'), 'polys': [[q[:2] for q in line_local(pg)] for pg in ([f.get('polygon')] if f.get('polygon') else (f.get('polygons') or [])) if pg]} for f in (C.get('fires') or []) if isinstance(f, dict)]}
    city['meta']['counts'] = {k: len(v) for k, v in city.items() if isinstance(v, list)}
    with open(os.path.join(OUT, 'city.json'), 'w') as fh:
        json.dump(city, fh, separators=(',', ':'), ensure_ascii=False)
    with open(os.path.join(OUT, 'city_text.json'), 'w') as fh:
        json.dump(text, fh, separators=(',', ':'), ensure_ascii=False)
    print('city:', city['meta']['counts'])
    print('warnings:', len(warn), warn[:15])
    return city
