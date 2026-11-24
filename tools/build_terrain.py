"""Ancient terrain of Rome by year.

Modern bare earth: INGV TINITALY 1.1 (10 m DTM, CC BY 4.0), resampled to the model grid.
Ancient surface at year y: the research corrections (content/city/terrain) applied in priority order
(add / set / ramp / plane / planeMax / ridge / mound), then valley control points spread locally, then the
Tiber channel cut from the reconstructed centreline, widths and water level of that year.

Output: data/city/terrain.bin (first snapshot, u16 (h+20)*100) + terrain_snaps.bin (64x64 tiles that differ
in later snapshots) + meta. The client and the building placement interpolate linearly between snapshots.
"""
import json, math, os
import numpy as np
from build_city import TN, TX0, TZ0, TSTEP, TSIZE, ORIGIN, M_LON, M_LAT, P, OUT, SRC, raster_poly

SNAP_YEARS = [-509, -400, -250, -150, -80, -30, 1, 50, 80, 110, 150, 200, 260, 320, 450, 641]
TILE = 64


def grid():
    gx = TX0 + np.arange(TN) * TSTEP
    gz = TZ0 + np.arange(TN) * TSTEP
    return np.meshgrid(gx, gz)


def modern_dem():
    from pyproj import Transformer
    from scipy.ndimage import map_coordinates, gaussian_filter
    A = np.load(os.path.join(SRC, 'tin', 'tin.npy'))
    X, Z = grid()
    lon = ORIGIN[0] + X / M_LON
    lat = ORIGIN[1] - Z / M_LAT
    t = Transformer.from_crs(4326, 32632, always_xy=True)
    ux, uy = t.transform(lon.ravel(), lat.ravel())
    X0, Y0, R = 749950.0, 4650050.0, 10.0
    fx = (np.array(ux) - X0) / R - 0.5
    fy = (Y0 - np.array(uy)) / R - 0.5
    h = map_coordinates(A, [fy, fx], order=1, mode='nearest').reshape(TN, TN).astype(np.float32)
    bad = ~np.isfinite(h) | (h < -50)
    if bad.any():
        h[bad] = np.nanmedian(h[~bad])
    return gaussian_filter(h, 0.8)


def kf(frames, y, key='elev'):
    """linear keyframe interpolation, holding the ends"""
    fr = sorted([f for f in frames if isinstance(f, dict) and f.get(key) is not None and f.get('y') is not None], key=lambda f: f['y'])
    if not fr:
        return None
    if y <= fr[0]['y']:
        return float(fr[0][key])
    for a, b in zip(fr[:-1], fr[1:]):
        if a['y'] <= y <= b['y']:
            t = (y - a['y']) / max(1e-9, b['y'] - a['y'])
            return float(a[key] + (b[key] - a[key]) * t)
    return float(fr[-1][key])


def soft(mask, feather):
    from scipy.ndimage import distance_transform_edt
    if feather <= 0:
        return mask.astype(np.float32)
    d = distance_transform_edt(mask) * TSTEP
    return np.clip(d / feather, 0, 1).astype(np.float32)


def seg_dist(X, Z, line):
    """distance to polyline and normalised position along it (0..1) for every cell"""
    pts = np.array(line, float)
    best = np.full(X.shape, np.inf); tpos = np.zeros(X.shape)
    seglen = np.hypot(*(pts[1:] - pts[:-1]).T)
    cum = np.r_[0, np.cumsum(seglen)]
    total = cum[-1] or 1
    for k, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
        d = b - a; L2 = max(1e-9, d @ d)
        u = np.clip(((X - a[0]) * d[0] + (Z - a[1]) * d[1]) / L2, 0, 1)
        px = a[0] + u * d[0]; pz = a[1] + u * d[1]
        dist = np.hypot(X - px, Z - pz)
        sel = dist < best
        best[sel] = dist[sel]; tpos[sel] = (cum[k] + u[sel] * seglen[k]) / total
    return best, tpos


class Ancient:
    def __init__(self, terr):
        self.t = terr
        self.modern = modern_dem()
        self.X, self.Z = grid()
        self.prep = []
        for c in terr.get('corrections', []) or []:
            poly = c.get('polygon')
            mask = None; bb = None
            if poly and len(poly) >= 3:
                mask, bb = raster_poly([P(p) for p in poly])
                if not mask.any():
                    mask = None
            mode = c.get('mode', 'add')
            line = [P(p) for p in c.get('line', [])] if c.get('line') else None
            if mask is None and not (mode == 'ridge' and line):
                continue
            self.prep.append({'c': c, 'mask': mask, 'mode': mode, 'line': line,
                              'soft': soft(mask, 25 if mode == 'add' else 12) if mask is not None else None})
        self.prep.sort(key=lambda p: p['c'].get('priority', 0))
        # valley control points
        self.valleys = []
        for v in terr.get('valleys', []) or []:
            if v.get('loc') and v.get('levels'):
                x, z = P(v['loc'])
                self.valleys.append((x, z, v['levels']))
        tb = terr.get('tiber') or {}
        self.tiber = tb
        self.center = [P(p) for p in tb.get('centerline', [])]
        self.island = [P(p) for p in tb.get('island', [])] if tb.get('island') else None
        self.branches = [b for b in tb.get('branches', []) if b.get('line')]
        if self.center:
            self.rdist, self.rpos = seg_dist(self.X, self.Z, self.center)
            n = len(self.center)
            widths = sorted((int(a), float(b)) for a, b in tb.get('width', [])) or [(0, 100.0), (n - 1, 100.0)]
            # width at each cell from nearest position along the line
            idx = self.rpos * (n - 1)
            self.rwidth = np.interp(idx, [a for a, _ in widths], [b for _, b in widths])
            prof = tb.get('waterLevelProfile') or [[0, 0], [n - 1, 0]]
            self.roff = np.interp(idx, [a for a, _ in prof], [b for _, b in prof])
            self.bdist = []
            for b in self.branches:
                d, _ = seg_dist(self.X, self.Z, [P(p) for p in b['line']])
                self.bdist.append((d, float(b.get('width', 55))))
            self.isl_mask = raster_poly(self.island)[0] if self.island and len(self.island) >= 3 else None

    def water_level(self, y):
        wl = kf(self.tiber.get('waterLevelByYear') or [], y)
        return wl if wl is not None else float(self.tiber.get('waterLevel', 5.0))

    def surface(self, y):
        H = self.modern.copy()
        X, Z = self.X, self.Z
        for p in self.prep:
            c = p['c']
            if not (c.get('fromYear', -9999) <= y <= c.get('toYear', 9999)):
                continue
            mode, m = p['mode'], p['soft']
            if mode == 'add':
                d = kf(c.get('keyframes') or [], y, 'delta')
                if d is None:
                    d = float(c.get('delta', 0) or 0)
                if d:
                    H += m * d
            elif mode == 'set':
                e = kf(c.get('levels') or [], y)
                if e is not None:
                    H = H * (1 - m) + e * m
            elif mode == 'ramp' and p['line']:
                e0 = kf(c.get('levelsStart') or [], y); e1 = kf(c.get('levelsEnd') or [], y)
                e0 = c.get('elevStart') if e0 is None else e0; e1 = c.get('elevEnd') if e1 is None else e1
                _, t = seg_dist(X, Z, p['line'])
                target = e0 + (e1 - e0) * t
                H = H * (1 - m) + target * m
            elif mode in ('plane', 'planeMax') and c.get('plane'):
                pts = np.array([[*P(q[:2]), q[2]] for q in c['plane']], float)
                A_ = np.c_[pts[:, 0], pts[:, 1], np.ones(3)]
                try:
                    a, b, k = np.linalg.solve(A_, pts[:, 2])
                except np.linalg.LinAlgError:
                    continue
                pl = a * X + b * Z + k
                tgt = pl if mode == 'plane' else np.maximum(H, pl)
                H = H * (1 - m) + tgt * m
            elif mode == 'ridge' and p['line']:
                d, t = seg_dist(X, Z, p['line'])
                hw = float(c.get('halfWidth', 30))
                f = np.where(d < hw, 0.5 + 0.5 * np.cos(np.pi * d / hw), 0)
                et = float(c.get('endTaper', 0) or 0)
                if et:
                    L = sum(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) for a_, b_ in zip(p['line'][:-1], p['line'][1:]))
                    s = t * L
                    f = f * np.clip(np.minimum(s, L - s) / et, 0, 1) ** 0.5
                if c.get('crestElev'):
                    ce = np.array(c['crestElev'], float)
                    crest = np.interp(t, np.linspace(0, 1, len(ce)), ce)
                    H = np.maximum(H, H + (crest - H) * f)
                else:
                    H = H + float(c.get('delta', 0) or 0) * f
                if m is not None:
                    pass
            elif mode == 'mound':
                s = kf(c.get('scale') or [], y, 's')
                s = 0.0 if s is None else s
                ba = float(c.get('baseAncient') or 0)
                bm, pm, pa = c.get('baseModern'), c.get('peakModern'), c.get('peakAncient')
                if bm is None or pm is None or pm == bm:
                    tgt = np.full_like(H, ba)
                else:
                    tgt = ba + np.maximum(0, H - bm) * s * (float(pa) - ba) / (float(pm) - bm)
                H = H * (1 - m) + tgt * m
        # valley control points: spread the difference locally where no absolute surface rules
        if self.valleys:
            num_ = np.zeros_like(H); den = np.zeros_like(H)
            for x, z, lv in self.valleys:
                e = kf(lv, y)
                if e is None:
                    continue
                i = int(round((x - TX0) / TSTEP)); j = int(round((z - TZ0) / TSTEP))
                if not (0 <= i < TN and 0 <= j < TN):
                    continue
                delta = e - H[j, i]
                r = int(260 / TSTEP)
                j0, j1, i0, i1 = max(0, j - r), min(TN, j + r + 1), max(0, i - r), min(TN, i + r + 1)
                d2 = (X[j0:j1, i0:i1] - x) ** 2 + (Z[j0:j1, i0:i1] - z) ** 2
                w = np.exp(-d2 / (2 * 95.0 ** 2))
                num_[j0:j1, i0:i1] += w * delta; den[j0:j1, i0:i1] += w
            k = np.clip(den, 0, 1)
            H = H + np.where(den > 1e-6, num_ / np.maximum(den, 1e-6), 0) * k
        # Tiber channel
        if self.center:
            # channel shape kept constant through time (so snapshots stay small); the water plane moves instead
            wl = self.water_level(641)
            half = self.rwidth / 2
            bed = self.water_level(-509) + self.roff - 3.5
            inside = self.rdist < half
            for d, w in self.bdist:
                inside |= d < w / 2
            if self.isl_mask is not None:
                inside &= ~self.isl_mask
            from scipy.ndimage import distance_transform_edt
            dout = distance_transform_edt(~inside) * TSTEP
            bankw = 70.0
            t = np.clip(dout / bankw, 0, 1)
            bank = wl + 1.2 + (np.maximum(H, wl + 1.6) - wl - 1.2) * (t * t * (3 - 2 * t))
            H = np.where(inside, np.minimum(H, bed), np.where(dout < bankw, np.minimum(H, bank), H))
            if self.isl_mask is not None:
                H = np.where(self.isl_mask, np.maximum(H, wl + 3.5), H)
        return H.astype(np.float32)


def build(terr):
    A = Ancient(terr)
    snaps = [A.surface(y) for y in SNAP_YEARS]
    base = snaps[0]
    enc = lambda H: np.clip((H + 20) * 100, 0, 65535).astype('<u2')
    enc(base).tofile(os.path.join(SRC, 'terrain_base.bin'))
    blob = bytearray(); smeta = []
    nt = (TN + TILE - 1) // TILE
    for y, H in zip(SNAP_YEARS[1:], snaps[1:]):
        tiles = []
        for tj in range(nt):
            for ti in range(nt):
                sl = (slice(tj * TILE, min(TN, (tj + 1) * TILE)), slice(ti * TILE, min(TN, (ti + 1) * TILE)))
                if np.abs(H[sl] - base[sl]).max() > 0.15:
                    tiles.append([ti, tj, len(blob)])
                    blob += np.clip(np.round((H[sl] - base[sl]) * 100), -32768, 32767).astype('<i2').tobytes()
        smeta.append({'y': y, 'tiles': tiles})
    import gzip
    with gzip.open(os.path.join(OUT, 'terrain_snaps.bin.gz'), 'wb', 9) as f:
        f.write(bytes(blob))
    with gzip.open(os.path.join(OUT, 'terrain.bin.gz'), 'wb', 9) as f:
        f.write(enc(base).tobytes())
    river = (A.rdist < A.rwidth / 2).astype(np.uint8) * 255 if A.center else np.zeros((TN, TN), np.uint8)
    river.tofile(os.path.join(SRC, 'river.bin'))
    wl = [{'y': y, 'wl': round(A.water_level(y), 2)} for y in range(-509, 642, 25)]
    meta = {'n': TN, 'x0': TX0, 'z0': TZ0, 'size': TSIZE, 'step': TSTEP, 'enc': 'u16 (h+20)*100', 'tile': TILE,
            'snapYears': SNAP_YEARS, 'snaps': smeta, 'snapEnc': 'i2 cm delta vs base', 'water': wl, 'waterLevel': round(A.water_level(100), 2), 'layers': [],
            'dem': 'TINITALY 1.1 (INGV, CC BY 4.0) with research corrections'}
    print('terrain snapshots', len(SNAP_YEARS), 'tile bytes', len(blob))
    return meta, Sampler(SNAP_YEARS, snaps)


class Sampler:
    def __init__(self, years, snaps):
        self.years = years; self.snaps = snaps

    def grid_at(self, y):
        ys = self.years
        if y <= ys[0]:
            return self.snaps[0]
        if y >= ys[-1]:
            return self.snaps[-1]
        for k in range(len(ys) - 1):
            if ys[k] <= y <= ys[k + 1]:
                w = (y - ys[k]) / (ys[k + 1] - ys[k])
                return self.snaps[k] * (1 - w) + self.snaps[k + 1] * w

    def height(self, x, z, y):
        k = max(0, min(len(self.years) - 1, int(np.searchsorted(self.years, y, side='right')) - 1))
        ys = self.years
        def samp(H):
            fi = (x - TX0) / TSTEP; fj = (z - TZ0) / TSTEP
            i = int(np.clip(math.floor(fi), 0, TN - 2)); j = int(np.clip(math.floor(fj), 0, TN - 2))
            u = min(1, max(0, fi - i)); v = min(1, max(0, fj - j))
            return float(H[j, i] * (1 - u) * (1 - v) + H[j, i + 1] * u * (1 - v) + H[j + 1, i] * (1 - u) * v + H[j + 1, i + 1] * u * v)
        if y <= ys[0]:
            return samp(self.snaps[0])
        if y >= ys[-1]:
            return samp(self.snaps[-1])
        w = (y - ys[k]) / (ys[k + 1] - ys[k])
        return samp(self.snaps[k]) * (1 - w) + samp(self.snaps[k + 1]) * w
