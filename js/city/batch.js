// Geometry batcher for the 3D city.
// Every building version is emitted into large merged buffers. Per-vertex data is small:
// position, normal (int8), colour (uint8), uv (pattern space), pattern id (uint8), building index.
// Everything that varies with the year (life span, construction progress, base height) lives in a
// data texture indexed by building, so scrubbing the timeline never touches the geometry.
import * as THREE from '../../vendor/three/three.module.min.js';

export const PAT = {
  plain: 0, ashlar: 1, brick: 2, tiles: 3, arcadeOpen: 4, arcadeFake: 5, windows: 6, grass: 8, paving: 9, water: 10,
  flutes: 11, metal: 12, seats: 13, reticulate: 14, lead: 15, timber: 16, thatch: 17, colonnadeOpen: 18, trees: 19, gilt: 20,
  marble: 21, granite: 22, mud: 23,
};

// Material palette: colour (linear-ish sRGB hex) + default pattern.
export const MAT = {
  tufa: [0xb9a77e, PAT.ashlar], peperino: [0x8a877d, PAT.ashlar], travertine: [0xe2d8c0, PAT.ashlar],
  marble_white: [0xf1ede4, PAT.marble], marble_color: [0xd9c69a, PAT.marble], granite: [0x8f8f8c, PAT.granite],
  porphyry: [0x7a3442, PAT.marble], brick: [0xb06a48, PAT.brick], reticulate: [0xb8a079, PAT.reticulate],
  concrete: [0xa49f91, PAT.plain], concrete_faced: [0xe7dcc4, PAT.plain], stucco: [0xe9dfc9, PAT.plain],
  stucco_red: [0xb4553f, PAT.plain], stucco_ochre: [0xd6a659, PAT.plain], timber: [0x7b5a3a, PAT.timber], mudbrick: [0xa88a62, PAT.mud],
  thatch: [0x9a8459, PAT.thatch], roof_tile: [0xb2593b, PAT.tiles], bronze: [0x6f5a35, PAT.metal], gilded: [0xd4ab4a, PAT.gilt],
  lead: [0x8e9296, PAT.lead], water: [0x3d6b78, PAT.water], grass: [0x7f8f52, PAT.grass], paving: [0x6f6a64, PAT.paving],
  paving_basalt: [0x5f5c58, PAT.paving], paving_travertine: [0xd4cbb4, PAT.paving], earth: [0x9c8563, PAT.plain],
  trees: [0x4f6332, PAT.trees], cypress: [0x34472a, PAT.trees], dark: [0x2a2622, PAT.plain], tympanum: [0xe8e2d4, PAT.marble],
  marble: [0xf1ede4, PAT.marble], stone: [0xc9bb98, PAT.ashlar], white: [0xf1ede4, PAT.marble], red: [0xb4553f, PAT.plain],
  wood: [0x7b5a3a, PAT.timber], plaster: [0xe9dfc9, PAT.plain], tile: [0xb2593b, PAT.tiles], opus: [0xb06a48, PAT.brick],
};
export function matOf(name, fallback = 'stucco') {
  if (Array.isArray(name)) return name;
  if (typeof name === 'number') return [name, PAT.plain];
  if (!name) return MAT[fallback];
  const k = String(name).toLowerCase().replace(/[\s-]+/g, '_');
  if (MAT[k]) return MAT[k];
  for (const key of Object.keys(MAT)) if (k.includes(key)) return MAT[key];
  if (k.includes('marble')) return MAT.marble_white;
  if (k.includes('stone') || k.includes('ashlar')) return MAT.stone;
  return MAT[fallback];
}

// vertex colours are read as linear by the renderer; the palette is authored in sRGB
const S2L = new Uint8Array(256).map((_, i) => Math.round(Math.pow(i / 255, 2.2) * 255));

class Grow {
  constructor(Type, n) { this.T = Type; this.a = new Type(n); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { let m = this.a.length * 2; while (m < this.n + k) m *= 2; const b = new this.T(m); b.set(this.a); this.a = b; } }
  view() { return this.a.subarray(0, this.n); }
}

export class Batch {
  constructor() {
    this.pos = new Grow(Float32Array, 1 << 16);
    this.nrm = new Grow(Int8Array, 1 << 16);
    this.col = new Grow(Uint8Array, 1 << 16);
    this.uv = new Grow(Float32Array, 1 << 16);
    this.pat = new Grow(Uint8Array, 1 << 15);
    this.bid = new Grow(Float32Array, 1 << 15);
    this.idx = new Grow(Uint32Array, 1 << 16);
    this.vc = 0;
    this.bidCur = 0;
    // transform: building local (X right, Y up, F forward) -> world (x east, y up, z south)
    this.ox = 0; this.oy = 0; this.oz = 0; this.c = 1; this.s = 0;
    this.tint = null;
  }
  setFrame(x, y, z, rotDeg, bid) {
    this.ox = x; this.oy = y; this.oz = z;
    const t = (rotDeg || 0) * Math.PI / 180;
    this.c = Math.cos(t); this.s = Math.sin(t);
    this.bidCur = bid;
  }
  // world position of a local point
  wx(X, F) { return this.ox + X * this.c + F * this.s; }
  wz(X, F) { return this.oz + X * this.s - F * this.c; }

  // emit one vertex. local coords X,Y,F; local normal nX,nY,nF
  v(X, Y, F, nX, nY, nF, m, u, w) {
    const P = this.pos; P.need(3);
    P.a[P.n++] = this.ox + X * this.c + F * this.s;
    P.a[P.n++] = this.oy + Y;
    P.a[P.n++] = this.oz + X * this.s - F * this.c;
    const N = this.nrm; N.need(3);
    const wxn = nX * this.c + nF * this.s, wzn = nX * this.s - nF * this.c;
    const L = Math.hypot(wxn, nY, wzn) || 1;
    N.a[N.n++] = Math.round(wxn / L * 127); N.a[N.n++] = Math.round(nY / L * 127); N.a[N.n++] = Math.round(wzn / L * 127);
    const C = this.col; C.need(3);
    let hex = m[0];
    if (this.tint) hex = this.tint(hex);
    C.a[C.n++] = S2L[(hex >> 16) & 255]; C.a[C.n++] = S2L[(hex >> 8) & 255]; C.a[C.n++] = S2L[hex & 255];
    const U = this.uv; U.need(2); U.a[U.n++] = u; U.a[U.n++] = w;
    const T = this.pat; T.need(1); T.a[T.n++] = m[1];
    const B = this.bid; B.need(1); B.a[B.n++] = this.bidCur;
    return this.vc++;
  }
  tri(a, b, c) { const I = this.idx; I.need(3); I.a[I.n++] = a; I.a[I.n++] = b; I.a[I.n++] = c; }
  quadIdx(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }

  // planar quad from 4 local corners (counter-clockwise seen from the outside), uv in pattern units
  quad(p0, p1, p2, p3, m, uv) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], af = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bf = p3[2] - p0[2];
    // normal = a x b in a right-handed (X, Y, -F)?  local frame X right, Y up, F forward(out of facade)
    // treat (X, Y, F) as right-handed with F = toward viewer: cross(a, b)
    // the local frame (X, Y, F) is mirrored relative to world (F = -z at rot 0), so negate the local cross product:
    // the resulting normal equals the world-space cross product, i.e. it always agrees with the winding.
    const nx = -(ay * bf - af * by), ny = -(af * bx - ax * bf), nf = -(ax * by - ay * bx);
    uv = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this.v(p0[0], p0[1], p0[2], nx, ny, nf, m, uv[0], uv[1]);
    const i1 = this.v(p1[0], p1[1], p1[2], nx, ny, nf, m, uv[2], uv[3]);
    const i2 = this.v(p2[0], p2[1], p2[2], nx, ny, nf, m, uv[4], uv[5]);
    const i3 = this.v(p3[0], p3[1], p3[2], nx, ny, nf, m, uv[6], uv[7]);
    this.quadIdx(i0, i1, i2, i3);
  }
  triangle(p0, p1, p2, m, uv) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], af = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bf = p2[2] - p0[2];
    const nx = -(ay * bf - af * by), ny = -(af * bx - ax * bf), nf = -(ax * by - ay * bx);
    uv = uv || [0, 0, 1, 0, 0.5, 1];
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nf, m, uv[0], uv[1]);
    const b = this.v(p1[0], p1[1], p1[2], nx, ny, nf, m, uv[2], uv[3]);
    const c = this.v(p2[0], p2[1], p2[2], nx, ny, nf, m, uv[4], uv[5]);
    this.tri(a, b, c);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.view().slice(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.view().slice(), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.view().slice(), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.view().slice(), 2));
    g.setAttribute('pat', new THREE.BufferAttribute(this.pat.view().slice(), 1));
    g.setAttribute('bid', new THREE.BufferAttribute(this.bid.view().slice(), 1));
    g.setIndex(new THREE.BufferAttribute(this.idx.view().slice(), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  get count() { return this.vc; }
}

// ------------------------------------------------------------------ primitives
// All take local coordinates: X across the front (right +), Y up, F along the axis (front +).
// uv scaling: by default 1 uv unit = 1 metre so world-scale patterns line up.

// axis-aligned (in the local frame) box. opts.rot rotates about its own centre (deg, clockwise seen from above)
export function box(B, cx, y0, cf, w, h, l, m, o = {}) {
  const hw = w / 2, hl = l / 2, y1 = y0 + h;
  let corners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]; // (X, F)
  if (o.rot) {
    const t = o.rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    corners = corners.map(([x, f]) => [x * c + f * s, -x * s + f * c]);
  }
  const P = corners.map(([x, f]) => [cx + x, cf + f]);
  const uvs = o.uvScale || [1, 1];
  const sides = o.sides || [1, 1, 1, 1];
  const mt = o.top ? matOf(o.top) : m;
  // sides: back (F-), right (X+), front (F+), left (X-)
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const order = [0, 1, 2, 3];
  let u0 = 0;
  for (const k of order) {
    const [a, b] = edges[k];
    const len = Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]);
    if (sides[k]) {
      const uv = o.uvFn ? o.uvFn(k, len, h) : [u0 * uvs[0], y0 * uvs[1], (u0 + len) * uvs[0], y0 * uvs[1], (u0 + len) * uvs[0], y1 * uvs[1], u0 * uvs[0], y1 * uvs[1]];
      // outward winding: going a->b along the perimeter counter-clockwise when seen from above... ensure outward normal
      B.quad([P[a][0], y0, P[a][1]], [P[b][0], y0, P[b][1]], [P[b][0], y1, P[b][1]], [P[a][0], y1, P[a][1]], m, uv);
    }
    u0 += len;
  }
  if (o.top !== false) B.quad([P[0][0], y1, P[0][1]], [P[1][0], y1, P[1][1]], [P[2][0], y1, P[2][1]], [P[3][0], y1, P[3][1]], mt,
    [P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]]);
  if (o.bottom) B.quad([P[3][0], y0, P[3][1]], [P[2][0], y0, P[2][1]], [P[1][0], y0, P[1][1]], [P[0][0], y0, P[0][1]], m);
}

// gable roof (triangular prism) over a w x l rectangle; ridge along F (axis 'f') or X (axis 'x').
// o.pediment: material for the end triangles (default same as m); o.eave overhang
export function gable(B, cx, y0, cf, w, l, rise, m, o = {}) {
  const ax = o.axis || 'f';
  const ov = o.eave ?? 0.3;
  const pm = o.pediment ? matOf(o.pediment) : m;
  const roofM = m;
  if (ax === 'f') {
    const hw = w / 2 + ov, hl = l / 2 + (o.overF ?? 0.15), y1 = y0 + rise;
    const L = cf - hl, F = cf + hl;
    const slope = Math.hypot(hw, rise);
    // left slope, right slope (uv: u across tiles along F, v up the slope)
    B.quad([cx - hw, y0, F], [cx - hw, y0, L], [cx, y1, L], [cx, y1, F], roofM, [F, 0, L, 0, L, slope, F, slope]);
    B.quad([cx + hw, y0, L], [cx + hw, y0, F], [cx, y1, F], [cx, y1, L], roofM, [L, 0, F, 0, F, slope, L, slope]);
    if (o.under !== false) { // timber underside, visible under the eaves and above the pediments
      const um = MAT.timber;
      B.quad([cx, y1, F], [cx, y1, L], [cx - hw, y0, L], [cx - hw, y0, F], um);
      B.quad([cx, y1, L], [cx, y1, F], [cx + hw, y0, F], [cx + hw, y0, L], um);
    }
    if (o.ends !== false) {
      const ew = w / 2; // pediment sits on the wall line
      B.triangle([cx + ew, y0, F], [cx - ew, y0, F], [cx, y0 + rise * (ew / hw), F], pm, [cx + ew, y0, cx - ew, y0, cx, y0 + rise]);
      B.triangle([cx - ew, y0, L], [cx + ew, y0, L], [cx, y0 + rise * (ew / hw), L], pm, [cx - ew, y0, cx + ew, y0, cx, y0 + rise]);
    }
    if (o.soffit) B.quad([cx - hw, y0, L], [cx - hw, y0, F], [cx + hw, y0, F], [cx + hw, y0, L], matOf('dark'));
  } else {
    const hw = w / 2 + (o.overF ?? 0.15), hl = l / 2 + ov, y1 = y0 + rise;
    const slope = Math.hypot(hl, rise);
    B.quad([cx + hw, y0, cf + hl], [cx - hw, y0, cf + hl], [cx - hw, y1, cf], [cx + hw, y1, cf], roofM, [cx + hw, 0, cx - hw, 0, cx - hw, slope, cx + hw, slope]);
    B.quad([cx - hw, y0, cf - hl], [cx + hw, y0, cf - hl], [cx + hw, y1, cf], [cx - hw, y1, cf], roofM, [cx - hw, 0, cx + hw, 0, cx + hw, slope, cx - hw, slope]);
    if (o.under !== false) {
      const um = MAT.timber;
      B.quad([cx + hw, y1, cf], [cx - hw, y1, cf], [cx - hw, y0, cf + hl], [cx + hw, y0, cf + hl], um);
      B.quad([cx - hw, y1, cf], [cx + hw, y1, cf], [cx + hw, y0, cf - hl], [cx - hw, y0, cf - hl], um);
    }
    if (o.ends !== false) {
      const el = l / 2;
      B.triangle([cx + w / 2, y0, cf - el], [cx + w / 2, y0, cf + el], [cx + w / 2, y0 + rise * (el / hl), cf], pm);
      B.triangle([cx - w / 2, y0, cf + el], [cx - w / 2, y0, cf - el], [cx - w / 2, y0 + rise * (el / hl), cf], pm);
    }
  }
}

// hipped / pyramidal roof
export function hip(B, cx, y0, cf, w, l, rise, m, o = {}) {
  const ov = o.eave ?? 0.4;
  const hw = w / 2 + ov, hl = l / 2 + ov, y1 = y0 + rise;
  const r = Math.min(hw, hl) * (o.ridge === 0 ? 1 : 1);
  const rx = Math.max(0, hw - r), rf = Math.max(0, hl - r);
  const A = [cx - hw, y0, cf - hl], Bp = [cx + hw, y0, cf - hl], Cp = [cx + hw, y0, cf + hl], D = [cx - hw, y0, cf + hl];
  const R1 = [cx - rx, y1, cf - rf], R2 = [cx + rx, y1, cf - rf], R3 = [cx + rx, y1, cf + rf], R4 = [cx - rx, y1, cf + rf];
  B.quad(Cp, D, R4, R3, m, [Cp[0], 0, D[0], 0, R4[0], rise, R3[0], rise]);
  B.quad(A, Bp, R2, R1, m, [A[0], 0, Bp[0], 0, R2[0], rise, R1[0], rise]);
  B.quad(Bp, Cp, R3, R2, m, [Bp[2], 0, Cp[2], 0, R3[2], rise, R2[2], rise]);
  B.quad(D, A, R1, R4, m, [D[2], 0, A[2], 0, R1[2], rise, R4[2], rise]);
}

// vertical cylinder / cone frustum. o.r2 top radius, o.cap top cap, o.segs, o.a0/o.a1 arc (radians, 0 = +X, counter-clockwise toward +F)
export function cyl(B, cx, y0, cf, r, h, m, o = {}) {
  const n = o.segs || 12, r2 = o.r2 ?? r, y1 = y0 + h;
  const a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2, full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const circ = (a1 - a0) * r;
  const uvs = o.uvScale || [1, 1];
  const base = B.vc;
  const ny = (r - r2) / Math.max(1e-6, h);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, ca = Math.cos(a), sa = Math.sin(a);
    const u = (circ * i / n) * uvs[0];
    B.v(cx + ca * r, y0, cf + sa * r, ca, ny, sa, m, u, y0 * uvs[1]);
    B.v(cx + ca * r2, y1, cf + sa * r2, ca, ny, sa, m, u, y1 * uvs[1]);
  }
  const inv = !!o.inside;
  for (let i = 0; i < n; i++) {
    const a = base + i * 2;
    if (inv) B.quadIdx(a + 2, a, a + 1, a + 3); else B.quadIdx(a, a + 2, a + 3, a + 1);
  }
  if (o.cap !== false && r2 > 0 && full) {
    const mt = o.capMat ? matOf(o.capMat) : m;
    const c0 = B.v(cx, y1, cf, 0, 1, 0, mt, cx, cf);
    const rim = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; rim.push(B.v(cx + Math.cos(a) * r2, y1, cf + Math.sin(a) * r2, 0, 1, 0, mt, cx + Math.cos(a) * r2, cf + Math.sin(a) * r2)); }
    for (let i = 0; i < n; i++) B.tri(c0, rim[i], rim[i + 1]);
  }
}

// dome (spherical cap / hemisphere) of radius r and height h above y0; o.oculus radius
export function dome(B, cx, y0, cf, r, h, m, o = {}) {
  const n = o.segs || 20, rings = o.rings || 6, oc = o.oculus || 0;
  const rows = [];
  const tMax = oc > 0 ? Math.acos(Math.min(0.999, oc / r)) : Math.PI / 2;
  for (let j = 0; j <= rings; j++) {
    const t = tMax * j / rings; // elevation angle
    const rr = r * Math.cos(t), yy = y0 + h * Math.sin(t);
    const row = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * 2 * i / n, ca = Math.cos(a), sa = Math.sin(a);
      row.push(B.v(cx + ca * rr, yy, cf + sa * rr, ca * Math.cos(t) * h, Math.sin(t) * r, sa * Math.cos(t) * h, m, a * r, t * r));
    }
    rows.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < n; i++) B.quadIdx(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
  if (!oc) {
    // close top
  }
}

// barrel vault along F over width w (springing at y0), half-cylinder of rise
export function vault(B, cx, y0, cf, w, l, rise, m, o = {}) {
  const n = o.segs || 8, hl = l / 2;
  const base = B.vc;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * i / n, ca = Math.cos(a), sa = Math.sin(a);
    const X = cx + ca * w / 2, Y = y0 + sa * rise;
    const u = a * w / 2;
    B.v(X, Y, cf - hl, ca, sa, 0, m, u, cf - hl);
    B.v(X, Y, cf + hl, ca, sa, 0, m, u, cf + hl);
  }
  for (let i = 0; i < n; i++) { const a = base + i * 2; B.quadIdx(a + 2, a, a + 1, a + 3); }
  if (o.ends) {
    for (const F of [cf - hl, cf + hl]) {
      const sgn = F > cf ? 1 : -1;
      const c0 = B.v(cx, y0, F, 0, 0, sgn, matOf(o.ends), cx, y0);
      const rim = [];
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; rim.push(B.v(cx + Math.cos(a) * w / 2, y0 + Math.sin(a) * rise, F, 0, 0, sgn, matOf(o.ends), cx + Math.cos(a) * w / 2, y0 + Math.sin(a) * rise)); }
      for (let i = 0; i < n; i++) sgn > 0 ? B.tri(c0, rim[i + 1], rim[i]) : B.tri(c0, rim[i], rim[i + 1]);
    }
  }
}

// a column with base and capital
export function column(B, cx, y0, cf, d, h, m, o = {}) {
  const r = d / 2;
  const order = o.order || 'tuscan';
  const segs = o.segs || (d > 1.2 ? 10 : 8);
  const capH = order === 'corinthian' || order === 'composite' ? d * 1.15 : order === 'ionic' ? d * 0.45 : d * 0.4;
  const baseH = order === 'doric' ? 0 : d * 0.45;
  const shaftH = h - capH - baseH;
  const fl = o.fluted ? matOf([m[0], PAT.flutes]) : m;
  if (baseH > 0) {
    box(B, cx, y0, cf, d * 1.35, baseH * 0.45, d * 1.35, m, { top: undefined });
    cyl(B, cx, y0 + baseH * 0.45, cf, r * 1.18, baseH * 0.55, m, { segs, r2: r, cap: false });
  }
  cyl(B, cx, y0 + baseH, cf, r, shaftH, fl, { segs, r2: r * 0.86, cap: false, uvScale: [1 / (Math.PI * d / 20), 1] });
  const yc = y0 + baseH + shaftH;
  if (order === 'corinthian' || order === 'composite') {
    cyl(B, cx, yc, cf, r * 0.88, capH * 0.82, m, { segs, r2: r * 1.32, cap: false });
    box(B, cx, yc + capH * 0.82, cf, d * 1.42, capH * 0.18, d * 1.42, m);
  } else if (order === 'ionic') {
    box(B, cx, yc, cf, d * 1.5, capH * 0.6, d * 0.95, m);
    box(B, cx, yc + capH * 0.6, cf, d * 1.25, capH * 0.4, d * 1.25, m);
  } else {
    cyl(B, cx, yc, cf, r * 0.9, capH * 0.5, m, { segs, r2: r * 1.2, cap: false });
    box(B, cx, yc + capH * 0.5, cf, d * 1.25, capH * 0.5, d * 1.25, m);
  }
}

// extrude a polygon (local coords [[X,F],...]) from y0 to y0+h. o.top material, o.inside to flip
export function prism(B, poly, y0, h, m, o = {}) {
  const n = poly.length;
  if (n < 3) return;
  // ensure counter-clockwise in (X, F) seen from above (+Y)... compute signed area
  let A = 0; for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
  const pts = A > 0 ? poly : poly.slice().reverse(); // A>0 means CCW in X-F plane where F is "up" on paper
  const y1 = y0 + h;
  let u = 0;
  if (h > 0.01 && o.walls !== false) for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    B.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], m, [u, y0, u + len, y0, u + len, y1, u, y1]);
    u += len;
  }
  if (o.top !== false) {
    const mt = o.top ? matOf(o.top) : m;
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, f]) => new THREE.Vector2(x, f)), []);
    const ids = pts.map(([x, f]) => B.v(x, y1, f, 0, 1, 0, mt, x, f));
    for (const [a, b, c] of tris) B.tri(ids[a], ids[b], ids[c]);
  }
}

// wall following a polyline (local coords), thickness t, height h
export function wallLine(B, pts, y0, h, t, m, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, f0] = pts[i], [x1, f1] = pts[i + 1];
    const dx = x1 - x0, df = f1 - f0, L = Math.hypot(dx, df);
    if (L < 0.05) continue;
    const ang = Math.atan2(dx, df) * 180 / Math.PI; // rotation of a box whose length runs along F
    box(B, (x0 + x1) / 2, y0, (f0 + f1) / 2, t, h, L + (o.join ? t : 0), m, { rot: -ang + 0, top: o.top });
  }
}

// elliptical ring wall/band: a,b outer semi-axes (X,F), thickness t, from y0 to y1. Used for arcades, cavea walls.
// o.pat override, o.uvBay: metres per bay for arcade patterns, o.storeyH: metres per storey
export function ellipseWall(B, cx, cf, a, b, y0, y1, m, o = {}) {
  const n = o.segs || 48;
  const a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2;
  const base = B.vc;
  let s = 0, prev = null;
  const bays = o.bays || 0;
  const vScale = o.storeyH ? 1 / o.storeyH : 1;
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * i / n, ct = Math.cos(t), st = Math.sin(t);
    const X = cx + a * ct, F = cf + b * st;
    if (prev) s += Math.hypot(X - prev[0], F - prev[1]);
    prev = [X, F];
    const nx = b * ct, nf = a * st;
    const u = bays ? (i / n) * bays : s;
    const inv = o.inside ? -1 : 1;
    B.v(X, y0, F, nx * inv, 0, nf * inv, m, u, (o.vBase ?? y0) * vScale);
    B.v(X, y1, F, nx * inv, 0, nf * inv, m, u, (o.vBase !== undefined ? o.vBase + (y1 - y0) : y1) * vScale);
  }
  for (let i = 0; i < n; i++) {
    const k = base + i * 2;
    if (o.inside) B.quadIdx(k + 2, k, k + 1, k + 3); else B.quadIdx(k, k + 2, k + 3, k + 1);
  }
}

// sloping annulus between an inner ellipse at height yi and outer ellipse at height yo (cavea seating, roofs of rings)
export function ellipseBand(B, cx, cf, ai, bi, yi, ao, bo, yo, m, o = {}) {
  const n = o.segs || 48;
  const a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2;
  const base = B.vc;
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * i / n, ct = Math.cos(t), st = Math.sin(t);
    const dy = yo - yi, dr = Math.hypot((ao - ai) * ct, (bo - bi) * st) || 1;
    const nx = -ct * dy / dr, nf = -st * dy / dr, ny = 1;
    const ri = 0, ro = Math.hypot((ao - ai) * ct, (bo - bi) * st);
    B.v(cx + ai * ct, yi, cf + bi * st, nx, ny, nf, m, t * (ai + ao) / 2, (o.seatV ? 0 : ri));
    B.v(cx + ao * ct, yo, cf + bo * st, nx, ny, nf, m, t * (ai + ao) / 2, (o.seatV ? Math.hypot(ro, dy) : ro));
  }
  for (let i = 0; i < n; i++) { const k = base + i * 2; B.quadIdx(k + 2, k, k + 1, k + 3); }
}

// stairs as a stepped block (cheap: a sloped top with step pattern)
export function stairs(B, cx, y0, cf, w, l, h, m, o = {}) {
  // l along F: rises toward -F (stairs face +F)
  const hw = w / 2, hl = l / 2;
  const sm = [m[0], PAT.seats];
  B.quad([cx + hw, y0, cf + hl], [cx - hw, y0, cf + hl], [cx - hw, y0 + h, cf - hl], [cx + hw, y0 + h, cf - hl], sm, [w, 0, 0, 0, 0, Math.hypot(l, h), w, Math.hypot(l, h)]);
  B.triangle([cx - hw, y0, cf + hl], [cx - hw, y0, cf - hl], [cx - hw, y0 + h, cf - hl], m);
  B.triangle([cx + hw, y0, cf - hl], [cx + hw, y0, cf + hl], [cx + hw, y0 + h, cf - hl], m);
}

// simple tree (cone or sphere-ish crown on a trunk)
export function tree(B, cx, y0, cf, h, kind, m) {
  const tm = MAT.timber;
  cyl(B, cx, y0, cf, h * 0.04, h * 0.35, tm, { segs: 5, cap: false });
  if (kind === 'cypress') cyl(B, cx, y0 + h * 0.15, cf, h * 0.12, h * 0.85, MAT.cypress, { segs: 6, r2: 0.05 });
  else if (kind === 'pine') { cyl(B, cx, y0 + h * 0.62, cf, h * 0.08, h * 0.12, m || MAT.trees, { segs: 7, r2: h * 0.32, cap: false }); cyl(B, cx, y0 + h * 0.74, cf, h * 0.32, h * 0.18, m || MAT.trees, { segs: 7, r2: h * 0.05 }); }
  else { cyl(B, cx, y0 + h * 0.3, cf, h * 0.18, h * 0.3, m || MAT.trees, { segs: 6, r2: h * 0.26, cap: false }); cyl(B, cx, y0 + h * 0.6, cf, h * 0.26, h * 0.4, m || MAT.trees, { segs: 6, r2: 0.2 }); }
}
