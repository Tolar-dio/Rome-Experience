#!/usr/bin/env python3
"""Build the runtime data for the 3D city of Rome (data/city/).

Stages
  terrain   modern DEM (AWS terrarium z15 mosaic) -> ancient base surface + time-dependent corrections
  city      content/city/** -> data/city/city.json (buildings, streets, walls, events ... in local metres)
  fabric    generated residential fabric -> data/city/fabric.bin

Local frame: origin ORIGIN (lon, lat), x metres east, z metres south (three.js convention, y up).
"""
import json, math, os, sys, glob, struct, re
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), 'srcdata')
OUT = os.path.join(ROOT, 'data', 'city')
CONTENT = os.path.join(ROOT, 'content', 'city')

ORIGIN = (12.4853, 41.8925)
PHI = math.radians(ORIGIN[1])
M_LAT = 111132.92 - 559.82 * math.cos(2 * PHI) + 1.175 * math.cos(4 * PHI)
M_LON = 111412.84 * math.cos(PHI) - 93.5 * math.cos(3 * PHI)

# terrain grid
TN = 1153                 # samples per side
TX0, TZ0 = -4670.0, -4720.0
TSIZE = 9440.0
TSTEP = TSIZE / (TN - 1)  # ~8.19 m


def to_local(lon, lat):
    return ((lon - ORIGIN[0]) * M_LON, -(lat - ORIGIN[1]) * M_LAT)


def to_lonlat(x, z):
    return (ORIGIN[0] + x / M_LON, ORIGIN[1] - z / M_LAT)


def P(pt):
    x, z = to_local(pt[0], pt[1])
    return [round(x, 2), round(z, 2)]


# ---------------------------------------------------------------- terrain
def load_mosaic():
    from PIL import Image
    z = 15
    xs = range(17515, 17526)
    ys = range(12171, 12183)
    H = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
    d = os.path.join(SRC, 'terrarium')
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            a = np.asarray(Image.open(os.path.join(d, f'{z}_{x}_{y}.png')).convert('RGB')).astype(np.float32)
            H[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return H, xs[0], ys[0], z


def sample_dem():
    H, tx0, ty0, z = load_mosaic()
    n = 2 ** z
    gx = TX0 + np.arange(TN) * TSTEP
    gz = TZ0 + np.arange(TN) * TSTEP
    X, Z = np.meshgrid(gx, gz)
    lon = ORIGIN[0] + X / M_LON
    lat = ORIGIN[1] - Z / M_LAT
    px = ((lon + 180) / 360 * n - tx0) * 256 - 0.5
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n - ty0) * 256 - 0.5
    from scipy.ndimage import map_coordinates
    return map_coordinates(H, [py, px], order=1, mode='nearest').astype(np.float32)


def raster_poly(poly_local, mask_shape=(TN, TN)):
    """Boolean mask of grid samples inside a polygon given in local metres."""
    from matplotlib.path import Path
    pts = np.array(poly_local)
    x0, z0 = pts.min(0)
    x1, z1 = pts.max(0)
    i0 = max(0, int((x0 - TX0) / TSTEP) - 1); i1 = min(TN - 1, int((x1 - TX0) / TSTEP) + 2)
    j0 = max(0, int((z0 - TZ0) / TSTEP) - 1); j1 = min(TN - 1, int((z1 - TZ0) / TSTEP) + 2)
    m = np.zeros(mask_shape, bool)
    if i1 <= i0 or j1 <= j0:
        return m, (j0, j1, i0, i1)
    gx = TX0 + np.arange(i0, i1 + 1) * TSTEP
    gz = TZ0 + np.arange(j0, j1 + 1) * TSTEP
    X, Z = np.meshgrid(gx, gz)
    inside = Path(pts).contains_points(np.c_[X.ravel(), Z.ravel()]).reshape(X.shape)
    m[j0:j1 + 1, i0:i1 + 1] = inside
    return m, (j0, j1, i0, i1)


def soft_mask(mask, feather_m):
    """Feathered 0..1 mask (distance-based falloff inside the polygon edge)."""
    from scipy.ndimage import distance_transform_edt
    if feather_m <= 0:
        return mask.astype(np.float32)
    d = distance_transform_edt(mask) * TSTEP
    return np.clip(d / feather_m, 0, 1).astype(np.float32)


def line_dist(line_local):
    """Distance (m) from every grid sample to a polyline, plus parameter index."""
    from scipy.ndimage import distance_transform_edt
    m = np.ones((TN, TN), bool)
    pts = np.array(line_local)
    for a, b in zip(pts[:-1], pts[1:]):
        L = max(1, int(np.hypot(*(b - a)) / (TSTEP * 0.5)))
        for t in np.linspace(0, 1, L + 1):
            p = a + (b - a) * t
            i = int(round((p[0] - TX0) / TSTEP)); j = int(round((p[1] - TZ0) / TSTEP))
            if 0 <= i < TN and 0 <= j < TN:
                m[j, i] = False
    d, idx = distance_transform_edt(m, return_indices=True)
    return d * TSTEP, idx


def build_terrain(content):
    from scipy.ndimage import gaussian_filter
    os.makedirs(OUT, exist_ok=True)
    dem = sample_dem()
    terr = content.get('terrain') or {}
    # 1. smooth DEM artefacts (embankment ridges, buildings) lightly
    base = gaussian_filter(dem, 1.2)
    tiber = terr.get('tiber') or {}
    water_level = float(tiber.get('waterLevel', 6.0))
    river_mask = np.zeros((TN, TN), np.float32)
    # 2. carve the ancient Tiber
    cl = tiber.get('centerline')
    if cl and len(cl) > 3:
        line = [P(p) for p in cl]
        widths = tiber.get('width') or []
        wpts = np.full(len(line), 110.0)
        if widths:
            wi = sorted((int(a), float(b)) for a, b in widths)
            xs_ = [a for a, _ in wi]; ys_ = [b for _, b in wi]
            wpts = np.interp(np.arange(len(line)), xs_, ys_)
        d, idx = line_dist(line)
        # width at nearest centreline vertex
        near = np.zeros((TN, TN), np.float32)
        pts = np.array(line)
        gi = idx[1] * TSTEP + TX0; gj = idx[0] * TSTEP + TZ0
        # nearest vertex index by brute force on a coarse grid of the line
        from scipy.spatial import cKDTree
        tree = cKDTree(pts)
        _, vi = tree.query(np.c_[gi.ravel(), gj.ravel()])
        half = (wpts[vi].reshape(TN, TN)) / 2
        bed = water_level - 4.0
        inside = d < half
        bank = (d >= half) & (d < half + 40)
        t = np.clip((d - half) / 40, 0, 1)
        bank_h = water_level + 1.0 + (np.maximum(base, water_level + 1.5) - water_level - 1.0) * (t * t * (3 - 2 * t))
        base = np.where(inside, bed, np.where(bank, np.minimum(base, bank_h), base))
        river_mask = np.where(inside, 1.0, 0.0).astype(np.float32)
    else:
        river_mask = (base < water_level + 0.3).astype(np.float32)
    # 3. hills: sharpen cliffs and lift ancient tops slightly where requested
    for h in terr.get('hills', []):
        for c in h.get('cliffs', []) or []:
            try:
                line = [P(p) for p in c['line']]
            except Exception:
                continue
            if len(line) < 2:
                continue
            d, _ = line_dist(line)
            drop = float(c.get('drop', 10))
            k = np.clip(1 - d / 22.0, 0, 1)
            # steepen: pull the slope towards a step by blurring less
            base = base + 0.0 * k  # (cliffs are expressed by the DEM; reserved)
    # 4. static corrections (fromYear absent or <= -1000 and toYear absent): baked into base
    layers = []
    for c in terr.get('corrections', []):
        poly = c.get('polygon')
        if not poly or len(poly) < 3:
            continue
        m, bb = raster_poly([P(p) for p in poly])
        if not m.any():
            continue
        feather = float(c.get('feather', 30))
        sm = soft_mask(m, feather)
        delta = float(c.get('delta', 0))
        fy = c.get('fromYear'); ty = c.get('toYear')
        if fy is None and ty is None:
            base = base + sm * delta
        else:
            layers.append({'m': sm, 'bb': bb, 'delta': delta, 'from': fy if fy is not None else -9999, 'to': ty if ty is not None else 9999,
                           'note': c.get('note', '')[:120], 'mode': c.get('mode', 'add')})
    # time-varying ground levels from valley points
    for v in terr.get('valleys', []):
        pass  # handled at runtime through level layers (below)
    # write base
    enc = np.clip((base + 20) * 100, 0, 65535).astype('<u2')
    enc.tofile(os.path.join(OUT, 'terrain.bin'))
    rm = (river_mask * 255).astype(np.uint8)
    rm.tofile(os.path.join(OUT, 'river.bin'))
    # layers: write each as sparse block (bbox + int8 deltas*10 scaled mask)
    meta_layers = []
    blob = bytearray()
    for L in layers:
        j0, j1, i0, i1 = L['bb']
        # widen bbox by feather
        pad = 8
        j0 = max(0, j0 - pad); i0 = max(0, i0 - pad); j1 = min(TN - 1, j1 + pad); i1 = min(TN - 1, i1 + pad)
        sub = (L['m'][j0:j1 + 1, i0:i1 + 1] * 255).astype(np.uint8)
        meta_layers.append({'off': len(blob), 'i0': i0, 'j0': j0, 'w': i1 - i0 + 1, 'h': j1 - j0 + 1, 'delta': L['delta'],
                            'from': L['from'], 'to': L['to'], 'note': L['note']})
        blob += sub.tobytes()
    with open(os.path.join(OUT, 'terrain_layers.bin'), 'wb') as f:
        f.write(bytes(blob))
    return {'n': TN, 'x0': TX0, 'z0': TZ0, 'size': TSIZE, 'step': TSTEP, 'enc': 'u16 (h+20)*100', 'waterLevel': water_level,
            'layers': meta_layers}, base


def sample_base(base, x, z):
    fi = (x - TX0) / TSTEP; fj = (z - TZ0) / TSTEP
    i = int(np.clip(math.floor(fi), 0, TN - 2)); j = int(np.clip(math.floor(fj), 0, TN - 2))
    u = np.clip(fi - i, 0, 1); v = np.clip(fj - j, 0, 1)
    return float(base[j, i] * (1 - u) * (1 - v) + base[j, i + 1] * u * (1 - v) + base[j + 1, i] * (1 - u) * v + base[j + 1, i + 1] * u * v)


# ---------------------------------------------------------------- content
def load_json_dir(sub):
    out = []
    for f in sorted(glob.glob(os.path.join(CONTENT, sub, '*.json'))):
        try:
            out.append((f, json.load(open(f))))
        except Exception as e:
            print('  !! bad json', f, e)
    return out


def gather():
    C = {'terrain': {}, 'buildings': [], 'walls': [], 'gates': [], 'streets': [], 'aqueducts': [], 'regions': [], 'servianRegions': [],
         'cityEvents': [], 'routes': [], 'cityPlaces': [], 'population': [], 'urbanization': [], 'fires': [], 'cityTours': []}
    subs = ['terrain', 'framework', 'infra', 'buildings', 'events', 'life', 'tours']
    extra = os.environ.get('CITY_EXTRA')
    if extra:
        subs.append(os.path.abspath(extra))
    for sub in subs:
        for f, d in load_json_dir(sub):
            if isinstance(d, dict):
                for k_, v_ in d.items():
                    if isinstance(v_, list):
                        for o_ in v_:
                            if isinstance(o_, dict):
                                o_['_src'] = os.path.basename(f)
            if isinstance(d, list):
                # bare list: guess
                key = 'buildings' if sub in ('buildings',) or sub.startswith('/') else ('cityEvents' if sub == 'events' else None)
                if key:
                    C[key] += d
                continue
            for k, v in d.items():
                if k == 'terrain' and isinstance(v, dict):
                    for kk, vv in v.items():
                        if isinstance(vv, list):
                            C['terrain'].setdefault(kk, []).extend(vv)
                        else:
                            C['terrain'][kk] = vv
                elif k in ('hills', 'valleys', 'waters', 'corrections') and isinstance(v, list):
                    C['terrain'].setdefault(k, []).extend(v)
                elif k == 'tiber':
                    C['terrain']['tiber'] = v
                elif k in ('bridges', 'gardens', 'monuments'):
                    C['buildings'] += v
                elif k in ('events',):
                    C['cityEvents'] += v
                elif k in ('places',):
                    C['cityPlaces'] += v
                elif k in C and isinstance(v, list):
                    C[k] += v
                elif k in C and isinstance(v, dict) and k == 'terrain':
                    pass
    return C


if __name__ == '__main__':
    stages = sys.argv[1:] or ['terrain', 'city']
    C = gather()
    print('content:', {k: (len(v) if isinstance(v, list) else len(v.keys())) for k, v in C.items()})
    meta = {}
    if 'terrain' in stages or 'city' in stages:
        tmeta, base = build_terrain(C)
        meta['terrain'] = tmeta
        np.save(os.path.join(SRC, 'ancient_base.npy'), base)
        print('terrain', base.min(), base.max(), len(tmeta['layers']), 'layers')
    if 'city' in stages:
        import build_city_content as bcc
        bcc.build(C, meta, base)
