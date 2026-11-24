// Turns city.json into batched meshes: building versions plus walls, gates, streets and aqueducts,
// each registered as a "building" entry in the data texture so the year uniform controls them all.
import * as THREE from '../../vendor/three/three.module.min.js';
import { Batch, MAT, PAT, matOf, box, cyl, prism } from './batch.js';
import { buildVersion } from './templates.js';
import { buildingMaterial, buildingDepthMaterial, buildingPickMaterial, makeBuildingTexture } from './materials.js';

const CHUNK = 600;

export function buildWorld(city, terrain, onProgress = () => {}) {
  const entries = [];     // texture rows: {from,to,begun,baseY,height}
  const records = [];     // pickable records (same index as entries)
  const batches = new Map();
  const getBatch = (x, z, kind = 'b') => {
    const k = kind + ':' + Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!batches.has(k)) batches.set(k, new Batch());
    return batches.get(k);
  };
  const add = (rec, entry) => { const i = entries.length; rec.i = i; entries.push(entry); records.push(rec); return i; };

  // ---------------------------------------------------------------- building versions
  const blds = city.buildings;
  blds.forEach((b, n) => {
    if (n % 50 === 0) onProgress(n / blds.length * 0.7);
    const versions = splitRuin(b);
    for (const v of versions) {
      const i = add({ kind: 'building', rec: b, ruin: v.ruin }, { from: v.f, to: v.t, begun: v.b, baseY: b.y, height: b.h + 2 });
      const B = getBatch(b.x, b.z);
      B.setFrame(b.x, b.y, b.z, b.r, i);
      const inp = toInput(b, v.ruin);
      try { buildVersion(B, inp); } catch (e) { console.warn('template failed', b.id, e); }
    }
  });

  // ---------------------------------------------------------------- streets (draped ribbons)
  for (const s of city.streets || []) {
    const phases = s.pv && s.pv > s.f && s.pv <= s.t ? [[s.f, s.pv - 1, 'earth'], [s.pv, s.t, 'paving_basalt']] : [[s.f, s.t, s.pv && s.pv <= s.f ? 'paving_basalt' : 'paving_basalt']];
    for (const [f, t, mn] of phases) {
      const i = add({ kind: 'street', rec: s }, { from: f, to: t, begun: f, baseY: -1000, height: 3000 });
      ribbon(getBatch, s.ln, s.w, terrain, mn === 'earth' ? [0x8f7a5c, PAT.plain] : MAT.paving_basalt, i, s.rk === 1 ? 0.32 : 0.26);
    }
  }

  // ---------------------------------------------------------------- walls
  for (const w of city.walls || []) {
    // phases change height and breaches; carry the last known value forward
    const raw = (w.ph || []).filter((p) => p.y > w.f && p.y <= w.t).sort((a, b) => a.y - b.y);
    const steps = [{ y: w.f, h: w.h, br: 0 }];
    for (const p of raw) { const prev = steps[steps.length - 1]; const st = { y: p.y, h: p.h || prev.h, br: p.br != null ? p.br : prev.br }; if (st.h !== prev.h || st.br !== prev.br) { if (prev.y === st.y) steps[steps.length - 1] = st; else steps.push(st); } }
    for (let k = 0; k < steps.length; k++) {
      const f = steps[k].y, t = k + 1 < steps.length ? steps[k + 1].y - 1 : w.t;
      const h = steps[k].h, br = steps[k].br || 0;
      const i = add({ kind: 'wall', rec: w }, { from: f, to: t, begun: f === w.f ? Math.max(w.f - 6, -800) : f, baseY: -1000, height: 3000 });
      const m = matOf(w.mat, 'tufa');
      const pts = w.ln;
      const breached = (j) => br > 0 && ((Math.sin(j * 12.9898 + 78.233) * 43758.5453) % 1 + 1) % 1 < br;
      for (let j = 0; j < pts.length - 1; j++) {
        const [x0, z0] = pts[j], [x1, z1] = pts[j + 1];
        const g0 = terrain.heightAt(x0, z0), g1 = terrain.heightAt(x1, z1);
        const y0 = Math.min(g0, g1) - 2.5;
        const top = Math.max(g0, g1) + (breached(j) ? h * 0.25 : h);
        const Bw = getBatch((x0 + x1) / 2, (z0 + z1) / 2);
        if (w.ag) {
          // earth rampart behind the stone facing wall, offset to the inner side
          const L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / L, nz = (x1 - x0) / L, off = (w.ag.side === 'outer' ? -1 : 1) * w.ag.w / 2;
          segBox(Bw, i, x0 + nx * off, z0 + nz * off, x1 + nx * off, z1 + nz * off, Math.min(g0, g1) - 2, Math.max(g0, g1) + Math.min(h, w.ag.h) * 0.85 - Math.min(g0, g1) + 2, w.ag.w, [0x8a8a55, PAT.grass], true);
        }
        segBox(Bw, i, x0, z0, x1, z1, y0, top - y0, w.th || 3, m, true);
      }
      // towers
      const tw = w.tw;
      if (tw && tw.spacing) {
        const th = (tw.h || h * 1.5) * (h / (w.h || h));
        let acc = 0;
        for (let j = 0; j < pts.length - 1; j++) {
          const [x0, z0] = pts[j], [x1, z1] = pts[j + 1];
          const L = Math.hypot(x1 - x0, z1 - z0);
          if (L < 0.01) continue;
          const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
          let d = tw.spacing - acc;
          while (d <= L) {
            const x = x0 + ux * d, z = z0 + uz * d, g = terrain.heightAt(x, z);
            const Bt = getBatch(x, z);
            const rot = Math.atan2(ux, -uz) * 180 / Math.PI; // facing along the wall
            Bt.setFrame(x, g - 2.5, z, rot, i);
            box(Bt, (tw.proj || 3) * 0.5 * (w.outer === 'left' ? -1 : 1), 0, 0, (tw.proj || 3) + (w.th || 3), th + 2.5, tw.w || 7, m, { top: 'roof_tile' });
            d += tw.spacing;
          }
          acc = (acc + L) % tw.spacing;
        }
      }
    }
  }

  // ---------------------------------------------------------------- gates
  for (const g of city.gates || []) {
    if (g.ng) continue;
    const i = add({ kind: 'gate', rec: g }, { from: g.f, to: g.t, begun: g.f, baseY: g.y, height: g.h + 6 });
    const B = getBatch(g.x, g.z);
    B.setFrame(g.x, g.y - 1, g.z, g.r || 0, i);
    const m = MAT.travertine, W = Math.max(5, g.w || 6), H = Math.max(6, g.h || 10);
    const bays = g.bays || 1;
    box(B, 0, 0, 0, W + 6, H + 1, 7, m, { top: 'paving_travertine' });
    for (const s of [3.53, -3.53]) {
      const f = s;
      const dir = f > 0 ? 1 : -1;
      const ow = bays === 2 ? W * 0.42 : W * 0.7, oh = H * 0.62;
      const xs = bays === 2 ? [-W * 0.25, W * 0.25] : [0];
      for (const cx of xs) B.quad(dir > 0 ? [cx - ow / 2, 1, f] : [cx + ow / 2, 1, f], dir > 0 ? [cx + ow / 2, 1, f] : [cx - ow / 2, 1, f], dir > 0 ? [cx + ow / 2, 1 + oh, f] : [cx - ow / 2, 1 + oh, f], dir > 0 ? [cx - ow / 2, 1 + oh, f] : [cx + ow / 2, 1 + oh, f], MAT.dark);
    }
    const tws = String(g.tw || 'none');
    if (tws.includes('round') || tws.includes('semi')) for (const s of [-1, 1]) cyl(B, s * (W / 2 + 6), 0, 2, 5.5, H + 7, MAT.brick, { segs: 14 });
    else if (tws.includes('square') || tws.includes('rect')) for (const s of [-1, 1]) box(B, s * (W / 2 + 6), 0, 1.5, 9, H + 7, 10, MAT.brick, { top: 'roof_tile' });
  }

  // ---------------------------------------------------------------- aqueducts
  for (const a of city.aqueducts || []) {
    const i = add({ kind: 'aqueduct', rec: a }, { from: a.f, to: a.t, begun: a.b, baseY: -1000, height: 3000 });
    const span = (a.spec && a.spec.span) || 5.5, pier = (a.spec && a.spec.pier) || 2.6;
    const m = matOf((a.spec && a.spec.mat) || 'tufa');
    const pts = a.ln;
    // channel elevation: given as third coordinate, else interpolate between known values, else ground + 0
    const ce = pts.map((p) => (p.length > 2 ? p[2] : null));
    fillInterp(ce);
    for (let j = 0; j < pts.length - 1; j++) {
      const [x0, z0] = pts[j], [x1, z1] = pts[j + 1];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
      const nSub = Math.max(1, Math.ceil(L / 40));
      for (let s = 0; s < nSub; s++) {
        const t0 = s / nSub, t1 = (s + 1) / nSub;
        const xa = x0 + (x1 - x0) * t0, za = z0 + (z1 - z0) * t0, xb = x0 + (x1 - x0) * t1, zb = z0 + (z1 - z0) * t1;
        const cA = ce[j] == null ? null : ce[j] + ((ce[j + 1] ?? ce[j]) - ce[j]) * t0;
        const cB = ce[j] == null ? null : ce[j] + ((ce[j + 1] ?? ce[j]) - ce[j]) * t1;
        if (cA == null) continue;
        const gA = terrain.heightAt(xa, za), gB = terrain.heightAt(xb, zb);
        const ch = (cA + cB) / 2, gmin = Math.min(gA, gB);
        const hgt = ch - gmin;
        if (hgt < 1.2) continue; // underground
        const Bq = getBatch((xa + xb) / 2, (za + zb) / 2);
        const storeys = hgt > 20 ? 2 : 1;
        const len = Math.hypot(xb - xa, zb - za);
        if (hgt > 3) segBox(Bq, i, xa, za, xb, zb, gmin - 1, hgt + 1 - 1.6, pier + 0.4, [m[0], PAT.arcadeOpen], false, { span: span + pier, storeys, len });
        else segBox(Bq, i, xa, za, xb, zb, gmin - 1, hgt + 1 - 1.6, pier, m, false);
        // specus (channel) on top, one per channel stacked
        for (let c = 0; c < (a.ch || 1); c++) segBox(Bq, i, xa, za, xb, zb, ch - 1.6 + c * 2.2, 2.1, pier + 0.4, MAT.concrete_faced, true);
      }
    }
  }

  onProgress(0.9);
  const tex = makeBuildingTexture(entries);
  const mat = buildingMaterial(), depth = buildingDepthMaterial(), pickMat = buildingPickMaterial();
  const meshes = [], pickMeshes = [];
  let tris = 0;
  for (const [k, B] of batches) {
    if (!B.count) continue;
    const g = B.build();
    tris += g.index.count / 3;
    const mesh = new THREE.Mesh(g, mat);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    // bounding volume must ignore collapse; buildings never leave their chunk so the bbox is fine
    meshes.push(mesh);
    const pm = new THREE.Mesh(g, pickMat); pm.matrixAutoUpdate = false; pickMeshes.push(pm);
  }
  onProgress(1);
  return { meshes, pickMeshes, entries, records, tex, tris };
}

function splitRuin(b) {
  if (b.ru && b.ru[0] > b.f && b.ru[0] <= b.t) return [{ f: b.f, t: b.ru[0] - 1, b: b.b }, { f: b.ru[0], t: b.t, b: b.ru[0], ruin: b.ru[1] || 'roofless' }];
  return [{ f: b.f, t: b.t, b: b.b }];
}

// rotate world-local footprints/lines into the building frame
function toInput(b, ruin) {
  const t = b.r * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const loc = (q) => { const dx = q[0] - b.x, dz = q[1] - b.z; return [dx * c + dz * s, dx * s - dz * c]; };
  const inp = { id: b.id, tp: b.tp, w: b.w, l: b.l, h: b.h, p: b.p || {}, mat: b.mat, baseY: b.y, deckY: b.deckY };
  if (b.fp) inp.fpLocal = b.fp.map(loc);
  if (b.ln) inp.lineLocal = b.ln.map(loc);
  if (b.tp === 'bridge') { inp.waterY = 6.5; }
  if (ruin) {
    inp.h = b.h * (ruin === 'foundations' ? 0.12 : ruin === 'half' ? 0.55 : 0.85);
    inp.p = { ...inp.p, pediment: false, roof: 'flat', ruin };
    if (ruin === 'foundations') inp.tp = b.fp ? 'platform' : 'platform';
  }
  return inp;
}

function fillInterp(a) {
  const idx = a.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  if (!idx.length) return;
  for (let i = 0; i < a.length; i++) {
    if (a[i] != null) continue;
    let lo = -1, hi = -1;
    for (const k of idx) { if (k < i) lo = k; if (k > i && hi < 0) hi = k; }
    if (lo >= 0 && hi >= 0) a[i] = a[lo] + (a[hi] - a[lo]) * (i - lo) / (hi - lo);
    else a[i] = a[lo >= 0 ? lo : hi];
  }
}

// a box between two world points (x east, z south), bottom y0, height h, thickness t
function segBox(B, bid, x0, z0, x1, z1, y0, h, t, m, top, arc) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.05) return;
  const rot = Math.atan2(x1 - x0, -(z1 - z0)) * 180 / Math.PI; // facing along the segment
  B.setFrame((x0 + x1) / 2, y0, (z0 + z1) / 2, rot, bid);
  // in this frame the segment runs along F; X across
  const o = { top: top ? undefined : false };
  if (arc) {
    const bays = arc.len / arc.span;
    o.uvFn = (k, len, hh) => (k === 1 || k === 3 ? [0, 0, bays, 0, bays, arc.storeys, 0, arc.storeys] : [0, 0, 0, 0, 0, 1, 0, 1]);
  }
  box(B, 0, 0, 0, t, h, L + 0.02, m, o);
}

// street ribbon draped over terrain
function ribbon(getBatch, pts, w, terrain, m, bid, lift) {
  const hw = Math.max(1.2, w / 2);
  for (let j = 0; j < pts.length - 1; j++) {
    const [x0, z0] = pts[j], [x1, z1] = pts[j + 1];
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.1) continue;
    const nx = -(z1 - z0) / L * hw, nz = (x1 - x0) / L * hw;
    const n = Math.max(1, Math.ceil(L / 10));
    const B = getBatch((x0 + x1) / 2, (z0 + z1) / 2);
    B.setFrame(0, 0, 0, 0, bid);
    let prevL = null, prevR = null;
    for (let s = 0; s <= n; s++) {
      const t = s / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const yl = terrain.heightAt(x + nx, z + nz) + lift, yr = terrain.heightAt(x - nx, z - nz) + lift;
      // frame rot 0 at origin: X = x, F = -z
      const Lp = [x + nx, yl, -(z + nz)], Rp = [x - nx, yr, -(z - nz)];
      if (prevL) {
        // choose winding so the normal points up
        // world z = -F; normal.y of cross(across, along) must be positive
        const acx = prevR[0] - prevL[0], acz = -(prevR[2] - prevL[2]), alx = Lp[0] - prevL[0], alz = -(Lp[2] - prevL[2]);
        const up = acz * alx - acx * alz;
        if (up > 0) B.quad(prevL, prevR, Rp, Lp, m, [prevL[0], prevL[2], prevR[0], prevR[2], Rp[0], Rp[2], Lp[0], Lp[2]]);
        else B.quad(prevR, prevL, Lp, Rp, m, [prevR[0], prevR[2], prevL[0], prevL[2], Lp[0], Lp[2], Rp[0], Rp[2]]);
      }
      prevL = Lp; prevR = Rp;
    }
  }
}
