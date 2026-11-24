#!/usr/bin/env python3
"""Generate the residential fabric of Rome by period.

Input : data/city/city.json (streets, buildings, walls in local metres), content/city/life/*.json (urbanization zones),
        data/city/river.bin
Output: data/city/fabric.bin (Float32 x10 per record: x, z, rot, w, l, h, from, to, type, seed)
        data/city/ground_<year>.png + ground.json (urban / garden masks for the terrain shader)

Housing is not documented building by building. Lots are laid out along the known streets (and an infill grid
oriented to them), then switched on and off by period according to the urbanization zones (density and housing
type per phase), displaced by monuments while those stand, and kept off water and steep slopes.
"""
import json, math, os, sys, glob, random
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'city')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_city import TN, TX0, TZ0, TSTEP, TSIZE, P, to_local

TYPES = {'hut': 0, 'house': 1, 'domus': 2, 'insula': 3, 'villa': 4, 'shops': 5, 'tomb': 6, 'shed': 7}
G = 4.0  # occupancy raster resolution (m)
GN = int(TSIZE / G) + 1


def gi(x):
    return int((x - TX0) / G)


def gj(z):
    return int((z - TZ0) / G)


def load_zones():
    zones = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'content', 'city', 'life', '*.json'))):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if isinstance(d, dict):
            for z in d.get('urbanization', []) or []:
                poly = [P(p) for p in z.get('polygon', []) if isinstance(p, (list, tuple)) and len(p) >= 2]
                if len(poly) >= 3 and z.get('phases'):
                    zones.append({'name': z.get('zone') or z.get('name'), 'poly': poly, 'phases': sorted(z['phases'], key=lambda p: p.get('from', -9999))})
    return zones


def fallback_zones():
    """Coarse radial model used when no researched zones exist yet."""
    # centre between the Forum and the Campus Martius; radius and density by year
    keys = [(-509, 900, 0.55, 'houses'), (-300, 1300, 0.6, 'houses'), (-150, 1700, 0.7, 'mixed'), (-50, 2300, 0.8, 'insulae'),
            (100, 2900, 0.85, 'insulae'), (300, 2900, 0.85, 'insulae'), (420, 2500, 0.7, 'insulae'), (480, 2100, 0.55, 'mixed'),
            (550, 1500, 0.35, 'houses'), (641, 1300, 0.3, 'houses')]
    return {'radial': keys}


def phase_at(zone, y):
    ph = None
    for p in zone['phases']:
        f = p.get('from', -9999); t = p.get('to', 9999)
        if f is None: f = -9999
        if t is None: t = 9999
        if f <= y <= t:
            ph = p
    return ph


def main():
    city = json.load(open(os.path.join(OUT, 'city.json')))
    rnd = random.Random(1729)
    river = np.fromfile(os.path.join(OUT, 'river.bin'), np.uint8).reshape(TN, TN)
    terr = np.fromfile(os.path.join(OUT, 'terrain.bin'), '<u2').reshape(TN, TN).astype(np.float32) / 100 - 20
    wl = city['meta']['terrain'].get('waterLevel', 6.5)
    gy, gx = np.gradient(terr, TSTEP)
    slope = np.hypot(gx, gy)

    def tsample(arr, x, z):
        i = min(TN - 1, max(0, int(round((x - TX0) / TSTEP)))); j = min(TN - 1, max(0, int(round((z - TZ0) / TSTEP))))
        return arr[j, i]

    occ = np.zeros((GN, GN), bool)
    # block streets
    streets = city.get('streets', [])
    for s in streets:
        hw = max(2.0, s['w'] / 2 + 0.5)
        pts = s['ln']
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            n = max(1, int(L / 2))
            for k in range(n + 1):
                x = a[0] + (b[0] - a[0]) * k / n; z = a[1] + (b[1] - a[1]) * k / n
                r = int(hw / G) + 1
                i0, j0 = gi(x), gj(z)
                occ[max(0, j0 - r):j0 + r + 1, max(0, i0 - r):i0 + r + 1] = True
    # walls (keep a strip clear)
    for w in city.get('walls', []):
        for a, b in zip(w['ln'][:-1], w['ln'][1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / 3))
            for k in range(n + 1):
                x = a[0] + (b[0] - a[0]) * k / n; z = a[1] + (b[1] - a[1]) * k / n
                i0, j0 = gi(x), gj(z); r = 3
                occ[max(0, j0 - r):j0 + r + 1, max(0, i0 - r):i0 + r + 1] = True

    lots = []

    def try_lot(cx, cz, ang, w, l, src):
        # rectangle corners
        c, s_ = math.cos(ang), math.sin(ang)
        # direction along street (c, s_) ; depth perpendicular
        cells = []
        for u in np.arange(-w / 2, w / 2 + 0.01, G * 0.9):
            for v in np.arange(-l / 2, l / 2 + 0.01, G * 0.9):
                x = cx + u * c - v * s_; z = cz + u * s_ + v * c
                i, j = gi(x), gj(z)
                if not (0 <= i < GN and 0 <= j < GN) or occ[j, i]:
                    return False
                cells.append((j, i))
        if tsample(river, cx, cz) > 0 or tsample(terr, cx, cz) < wl + 0.8:
            return False
        if tsample(slope, cx, cz) > 0.45:
            return False
        for j, i in cells:
            occ[j, i] = True
        lots.append({'x': cx, 'z': cz, 'ang': ang, 'w': w, 'l': l, 'r': rnd.random(), 'seed': rnd.random(), 'src': src})
        return True

    # frontage lots along streets (rank order: main streets first)
    for s in sorted(streets, key=lambda s: s.get('rk', 2)):
        pts = s['ln']
        off0 = s['w'] / 2 + 0.8
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 6:
                continue
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            nx, nz = -math.sin(ang), math.cos(ang)
            for side in (-1, 1):
                d = rnd.uniform(0, 6)
                while d < L - 4:
                    fw = rnd.choice([9, 11, 13, 15, 18, 22, 26])
                    dep = rnd.choice([14, 18, 22, 26, 30])
                    t = (d + fw / 2) / L
                    if t > 1:
                        break
                    px = a[0] + (b[0] - a[0]) * t; pz = a[1] + (b[1] - a[1]) * t
                    cx = px + nx * side * (off0 + dep / 2); cz = pz + nz * side * (off0 + dep / 2)
                    if not try_lot(cx, cz, ang, fw, dep, 'front'):
                        # try shallower
                        try_lot(px + nx * side * (off0 + 6), pz + nz * side * (off0 + 6), ang, fw * 0.8, 10, 'front')
                    d += fw + rnd.uniform(0.5, 2.5)
    # infill on a jittered grid, oriented to the nearest street
    seg = []
    for s in streets:
        for a, b in zip(s['ln'][:-1], s['ln'][1:]):
            seg.append((a[0], a[1], b[0], b[1]))
    seg = np.array(seg) if seg else np.zeros((0, 4))
    if len(seg):
        mid = np.c_[(seg[:, 0] + seg[:, 2]) / 2, (seg[:, 1] + seg[:, 3]) / 2]
        from scipy.spatial import cKDTree
        tree = cKDTree(mid)
    step = 26.0
    xs = np.arange(TX0 + 200, TX0 + TSIZE - 200, step)
    zs = np.arange(TZ0 + 200, TZ0 + TSIZE - 200, step)
    for z in zs:
        for x in xs:
            if len(seg):
                dmin, k = tree.query([x, z])
                if dmin > 900:
                    continue
                a = seg[k]
                ang = math.atan2(a[3] - a[1], a[2] - a[0])
            else:
                ang = 0.12
            cx = x + rnd.uniform(-5, 5); cz = z + rnd.uniform(-5, 5)
            w = rnd.choice([12, 15, 18, 21]); l = rnd.choice([14, 18, 22])
            try_lot(cx, cz, ang, w, l, 'infill')
    print('lots', len(lots))

    zones = load_zones()
    fb = None if zones else fallback_zones()
    from matplotlib.path import Path
    zpaths = [Path(np.array(z['poly'])) for z in zones]

    # buildings: footprint rectangles per version for displacement
    from shapely.geometry import Polygon, box as sbox
    from shapely import affinity
    from shapely.strtree import STRtree
    bpolys, bspan = [], []
    for b in city['buildings']:
        if b['tp'] in ('bridge', 'harbor') or b.get('water') and False:
            continue
        if b.get('fp') and len(b['fp']) >= 3:
            try:
                pg = Polygon(b['fp']).buffer(3)
            except Exception:
                continue
        else:
            w, l = b['w'] + 6, b['l'] + 6
            if b['tp'] in ('garden',) and not b.get('fp'):
                pass
            pg = sbox(-w / 2, -l / 2, w / 2, l / 2)
            pg = affinity.rotate(pg, -b['r'], origin=(0, 0))
            pg = affinity.translate(pg, b['x'], b['z'])
        if not pg.is_valid:
            pg = pg.buffer(0)
        bpolys.append(pg); bspan.append((b['b'], b['t'], b['tp']))
    btree = STRtree(bpolys) if bpolys else None

    years_all = set([-509, 641])
    for z in zones:
        for p in z['phases']:
            for k in ('from', 'to'):
                if p.get(k) is not None:
                    years_all.add(int(p[k]) if k == 'from' else int(p[k]) + 1)
    if fb:
        for y, *_ in fb['radial']:
            years_all.add(y)

    recs = []
    for li, L in enumerate(lots):
        cx, cz = L['x'], L['z']
        c, s_ = math.cos(L['ang']), math.sin(L['ang'])
        lp = sbox(-L['w'] / 2, -L['l'] / 2, L['w'] / 2, L['l'] / 2)
        lp = affinity.rotate(lp, math.degrees(L['ang']), origin=(0, 0))
        lp = affinity.translate(lp, cx, cz)
        hits = []
        if btree is not None:
            for k in btree.query(lp):
                k = int(k)
                if bpolys[k].intersects(lp):
                    hits.append(bspan[k])
        zi = [k for k, p in enumerate(zpaths) if p.contains_point((cx, cz))]
        ys = set(years_all)
        for (f, t, tp) in hits:
            ys.add(f); ys.add(t + 1)
        ys = sorted(y for y in ys if -509 <= y <= 642)
        prev = None
        for a, b2 in zip(ys[:-1], ys[1:]):
            y = a
            # blocked by a monument?
            if any(f <= y <= t for (f, t, tp) in hits):
                kind = None
            else:
                kind, dens, st = None, 0, (2, 4)
                if zones:
                    ph = None
                    for k in zi:
                        p = phase_at(zones[k], y)
                        if p is not None:
                            ph = p
                    if ph:
                        dens = float(ph.get('density', 0) or 0)
                        typ = str(ph.get('type', 'mixed')).lower()
                        st = ph.get('storeys') or (2, 4)
                        if isinstance(st, (int, float)):
                            st = (int(st), int(st))
                        kind = typ
                else:
                    keys = fb['radial']
                    k = max(i for i, kk in enumerate(keys) if kk[0] <= y) if y >= keys[0][0] else 0
                    _, R, d0, typ = keys[k]
                    cxr, czr = -250, -300
                    dist = math.hypot(cx - cxr, cz - czr)
                    dens = d0 * max(0.0, 1 - (dist / R) ** 2.2) if dist < R else 0
                    kind = typ
                    st = (3, 6) if typ == 'insulae' else (1, 3)
                if dens <= L['r']:
                    kind = None
            if kind:
                kind = {'insulae': 'insula', 'houses': 'house', 'huts': 'hut', 'mixed': 'insula' if L['seed'] < 0.6 else 'domus', 'domus': 'domus', 'villas': 'villa',
                        'horti': None, 'abandoned': None, 'shops': 'shops', 'tombs': 'tomb', 'cemetery': 'tomb', 'workshops': 'shed', 'warehouses': 'shed'}.get(kind, 'house')
            if kind:
                s0, s1 = (int(st[0]), int(st[-1])) if isinstance(st, (list, tuple)) and st else (2, 4)
                if kind == 'insula':
                    h = 3.0 * (s0 + int(L['seed'] * (s1 - s0 + 1)))
                    h = max(6.0, min(h, 21.0))
                elif kind == 'domus':
                    h = 5.5 + L['seed'] * 3
                elif kind == 'hut':
                    h = 1.7
                elif kind == 'villa':
                    h = 7
                elif kind == 'tomb':
                    h = 4
                else:
                    h = 4.0 + 3.0 * (s0 > 1) * L['seed'] + 1.5
                w, l = L['w'], L['l']
                if kind == 'hut':
                    w = l = 4.5 + L['seed'] * 2
                if kind in ('house', 'shed'):
                    w = min(w, 14); l = min(l, 16)
                key = (kind, round(h, 1))
            else:
                key = None
            if prev and prev[0] == key and key is not None:
                prev[2] = b2 - 1
            else:
                if prev and prev[0] is not None:
                    recs.append(prev)
                prev = [key, a, b2 - 1, (w, l) if key else None, li]
        if prev and prev[0] is not None:
            recs.append(prev)
    print('fabric records', len(recs))
    arr = np.zeros((len(recs), 10), np.float32)
    counts = {}
    for n, (key, f, t, wl_, li) in enumerate(recs):
        L = lots[li]
        kind, h = key
        counts[kind] = counts.get(kind, 0) + 1
        arr[n] = [L['x'], L['z'], -math.degrees(L['ang']), wl_[0] * 0.92, wl_[1] * 0.92, h, f, 9999 if t >= 641 else t, TYPES[kind], L['seed']]
    arr.tofile(os.path.join(OUT, 'fabric.bin'))
    print('types', counts, 'bytes', arr.nbytes)
    ground(city, lots, recs)
    return lots, recs


def ground(city, lots, recs):
    """urban/garden masks per snapshot year for the terrain shader"""
    from PIL import Image, ImageDraw, ImageFilter
    S = 1024
    k = S / TSIZE
    years = [-500, -350, -200, -100, -30, 50, 150, 250, 350, 450, 520, 580, 640]
    meta = []
    for y in years:
        im = Image.new('RGB', (S, S), (0, 0, 0))
        dr = ImageDraw.Draw(im)
        for key, f, t, wl_, li in recs:
            if not (f <= y <= (9999 if t >= 641 else t)):
                continue
            L = lots[li]
            r = max(wl_) * 0.9 * k
            x = (L['x'] - TX0) * k; z = (L['z'] - TZ0) * k
            dr.ellipse([x - r, z - r, x + r, z + r], fill=(255, 0, 0))
        R = im.split()[0].filter(ImageFilter.GaussianBlur(3))
        Gc = Image.new('L', (S, S), 0)
        dg = ImageDraw.Draw(Gc)
        for b in city['buildings']:
            if b['tp'] != 'garden' or not (b['b'] <= y <= b['t']):
                continue
            if b.get('fp'):
                dg.polygon([((q[0] - TX0) * k, (q[1] - TZ0) * k) for q in b['fp']], fill=255)
            else:
                x = (b['x'] - TX0) * k; z = (b['z'] - TZ0) * k; hw = b['w'] / 2 * k; hl = b['l'] / 2 * k
                dg.rectangle([x - hw, z - hl, x + hw, z + hl], fill=255)
        # forum/paved squares count as urban
        for b in city['buildings']:
            if b['tp'] in ('forum', 'porticus', 'temple', 'basilica', 'baths', 'compound') and b['b'] <= y <= b['t']:
                x = (b['x'] - TX0) * k; z = (b['z'] - TZ0) * k; r = max(b['w'], b['l']) * 0.7 * k
                ImageDraw.Draw(R).ellipse([x - r, z - r, x + r, z + r], fill=255)
        Gc = Gc.filter(ImageFilter.GaussianBlur(2))
        out = Image.merge('RGB', (R, Gc, Image.new('L', (S, S), 0)))
        fn = f'ground_{y}.png'
        out.save(os.path.join(OUT, fn), optimize=True)
        meta.append({'y': y, 'f': fn})
    json.dump({'size': S, 'x0': TX0, 'z0': TZ0, 'extent': TSIZE, 'snapshots': meta}, open(os.path.join(OUT, 'ground.json'), 'w'))
    print('ground snapshots', len(meta))


if __name__ == '__main__':
    main()
