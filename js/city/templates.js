// Parametric architecture library. Each template draws one building version into a Batch whose frame is
// already set to the building's centre (ground level y = 0), facing +F.
// Local frame: X across the facade (right +), Y up, F along the axis (front +). Front face at F = +l/2.
import { PAT, MAT, matOf, box, gable, hip, cyl, dome, vault, column, prism, wallLine, ellipseWall, ellipseBand, stairs, tree } from './batch.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const RATIO = { tuscan: 7, doric: 7.5, ionic: 9, corinthian: 10, composite: 10 };

function M(b, key, fb) {
  const m = b.mat;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    if (m[key]) return matOf(m[key], fb);
    const alias = { walls: ['cella', 'wall', 'facade', 'body'], columns: ['column', 'colonnade', 'order'], podium: ['base', 'platform'], roof: ['roofs', 'roofing'], dome: ['roof'], facade: ['walls'] }[key] || [];
    for (const a of alias) if (m[a]) return matOf(m[a], fb);
    if (m.main) return matOf(m.main, fb);
    return matOf(null, fb);
  }
  if (typeof m === 'string' && key !== 'roof') return matOf(m, fb);
  return matOf(null, fb);
}
const arcadeMat = (m, open = true) => [m[0], open ? PAT.arcadeOpen : PAT.arcadeFake];

// a straight arcaded facade between two local points, bays/storeys mapped to uv
function arcadeFace(B, x0, f0, x1, f1, y0, h, storeys, bayW, m, open = true) {
  const L = Math.hypot(x1 - x0, f1 - f0);
  const bays = Math.max(1, Math.round(L / bayW));
  B.quad([x0, y0, f0], [x1, y0, f1], [x1, y0 + h, f1], [x0, y0 + h, f0], arcadeMat(m, open), [0, 0, bays, 0, bays, storeys, 0, storeys]);
}
function arcadeBox(B, cx, y0, cf, w, h, l, storeys, bayW, m, o = {}) {
  const hw = w / 2, hl = l / 2;
  const P = [[cx - hw, cf - hl], [cx + hw, cf - hl], [cx + hw, cf + hl], [cx - hw, cf + hl]];
  const sides = o.sides || [1, 1, 1, 1];
  for (let k = 0; k < 4; k++) {
    const a = P[k], q = P[(k + 1) % 4];
    if (sides[k]) {
      arcadeFace(B, a[0], a[1], q[0], q[1], y0, h, storeys, bayW, m, o.open !== false);
      if (o.double) arcadeFace(B, q[0] + (k === 1 ? -o.double : k === 3 ? o.double : 0), q[1] + (k === 0 ? o.double : k === 2 ? -o.double : 0),
        a[0] + (k === 1 ? -o.double : k === 3 ? o.double : 0), a[1] + (k === 0 ? o.double : k === 2 ? -o.double : 0), y0, h, storeys, bayW, m, o.open !== false);
    }
  }
}

// row of columns from (x0,f0) to (x1,f1) inclusive, count n
function colRow(B, x0, f0, x1, f1, n, y0, d, h, m, order, o = {}) {
  if (n < 1) return;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    if (o.skipEnds && (i === 0 || i === n - 1)) continue;
    column(B, x0 + (x1 - x0) * t, y0, f0 + (f1 - f0) * t, d, h, m, { order, fluted: o.fluted, segs: o.segs });
  }
}

// colonnade around a rectangle (peristyle)
function peristyle(B, cx, cf, w, l, nF, nS, y0, d, h, m, order, sides = [1, 1, 1, 1], o = {}) {
  const hw = w / 2, hl = l / 2;
  if (sides[2]) colRow(B, cx - hw, cf + hl, cx + hw, cf + hl, nF, y0, d, h, m, order, o);           // front
  if (sides[0]) colRow(B, cx - hw, cf - hl, cx + hw, cf - hl, nF, y0, d, h, m, order, o);           // back
  if (sides[1]) colRow(B, cx + hw, cf - hl, cx + hw, cf + hl, nS, y0, d, h, m, order, { ...o, skipEnds: true });
  if (sides[3]) colRow(B, cx - hw, cf - hl, cx - hw, cf + hl, nS, y0, d, h, m, order, { ...o, skipEnds: true });
}

// run fn with the batch frame shifted by a local offset
function at(B, dx, dy, df, fn) {
  const ox = B.ox, oy = B.oy, oz = B.oz;
  B.ox += dx * B.c + df * B.s; B.oz += dx * B.s - df * B.c; B.oy += dy;
  try { fn(); } finally { B.ox = ox; B.oy = oy; B.oz = oz; }
}

// ---------------------------------------------------------------------------------------------- templates
const T = {};

T.temple = (B, b) => {
  const p = b.p, W = b.w, L = b.l, H = b.h;
  const order = (p.order || 'corinthian').toLowerCase();
  const plan = (p.plan || 'peripteral').toLowerCase();
  const podH = num(p.podium, clamp(H * 0.13, 1.2, 6));
  let rise = W * 0.13;
  let colH = num(p.colH, (H - podH - rise) / 1.24);
  colH = clamp(colH, 2, 30);
  const d = num(p.colD, colH / (RATIO[order] || 9));
  const entH = colH * 0.24;
  const nF = Math.max(2, Math.round(num(p.front, W > 25 ? 8 : W > 14 ? 6 : 4)));
  const mPod = M(b, 'podium', 'tufa'), mCol = M(b, 'columns', 'marble_white'), mWall = M(b, 'walls', 'marble_white'), mRoof = M(b, 'roof', 'roof_tile');
  const stairsMode = (p.steps || 'front').toLowerCase();
  const stD = stairsMode === 'none' ? 0 : clamp(podH * 1.45, 1, L * 0.22);
  const podL = L - stD;
  const podF = -stD / 2; // podium centre shifted back
  // podium
  box(B, 0, 0, podF, W, podH, podL, mPod, { top: 'paving_travertine' });
  if (stD > 0) {
    const sw = stairsMode.includes('lateral') && !stairsMode.includes('front') ? 0 : stairsMode === 'front_lateral' ? W * 0.62 : W;
    if (sw) stairs(B, 0, 0, L / 2 - stD / 2, sw, stD, podH, mPod);
    if (stairsMode.includes('lateral')) { box(B, -W * 0.36, 0, L / 2 - stD / 2, W * 0.28, podH, stD, mPod); box(B, W * 0.36, 0, L / 2 - stD / 2, W * 0.28, podH, stD, mPod); }
  }
  const y0 = podH;
  const cw = W - d * 1.3, cl = podL - d * 1.3; // colonnade outline
  const fFront = podF + cl / 2, fBack = podF - cl / 2;
  const spacing = cw / (nF - 1);
  let nS = Math.max(2, Math.round(num(p.side, Math.max(3, Math.round(cl / spacing) + 1))));
  let cellaX = cw * 0.66, cellaF0 = fBack, cellaF1 = fFront - spacing * 2;
  const fl = order !== 'tuscan';
  if (plan.startsWith('peripteral') && !plan.includes('sine')) {
    peristyle(B, 0, podF, cw, cl, nF, nS, y0, d, colH, mCol, order, [1, 1, 1, 1], { fluted: fl });
    cellaX = cw - spacing * 2; cellaF0 = fBack + spacing; cellaF1 = fFront - spacing * 2;
  } else if (plan === 'dipteral') {
    peristyle(B, 0, podF, cw, cl, nF, nS, y0, d, colH, mCol, order, [1, 1, 1, 1], { fluted: fl });
    peristyle(B, 0, podF, cw - spacing * 2, cl - spacing * 2, nF - 2, Math.max(2, nS - 2), y0, d, colH, mCol, order, [1, 1, 1, 1], { fluted: fl });
    cellaX = cw - spacing * 4; cellaF0 = fBack + spacing * 2; cellaF1 = fFront - spacing * 3;
  } else if (plan.includes('sine')) {
    peristyle(B, 0, podF, cw, cl, nF, nS, y0, d, colH, mCol, order, [0, 1, 1, 1], { fluted: fl });
    cellaX = cw - spacing * 2; cellaF0 = fBack; cellaF1 = fFront - spacing * 2;
  } else if (plan === 'pseudoperipteral') {
    const porch = Math.max(2, Math.round(num(p.porch, 2)));
    colRow(B, -cw / 2, fFront, cw / 2, fFront, nF, y0, d, colH, mCol, order, { fluted: fl });
    for (let k = 1; k < porch; k++) { colRow(B, -cw / 2, fFront - spacing * k, -cw / 2, fFront - spacing * k, 1, y0, d, colH, mCol, order); colRow(B, cw / 2, fFront - spacing * k, cw / 2, fFront - spacing * k, 1, y0, d, colH, mCol, order); }
    cellaX = cw; cellaF0 = fBack; cellaF1 = fFront - spacing * porch;
    // engaged half-columns
    const nSide = Math.max(2, Math.round((cellaF1 - cellaF0) / spacing) + 1);
    colRow(B, -cw / 2 - d * 0.1, cellaF0, -cw / 2 - d * 0.1, cellaF1, nSide, y0, d * 0.9, colH, mCol, order, { segs: 6 });
    colRow(B, cw / 2 + d * 0.1, cellaF0, cw / 2 + d * 0.1, cellaF1, nSide, y0, d * 0.9, colH, mCol, order, { segs: 6 });
    colRow(B, -cw / 2, cellaF0 - d * 0.1, cw / 2, cellaF0 - d * 0.1, nF, y0, d * 0.9, colH, mCol, order, { segs: 6, skipEnds: true });
  } else if (plan === 'tuscan_alae' || plan === 'tuscan') {
    const rows = Math.max(1, Math.round(num(p.side, 3)) - 1);
    for (let k = 0; k < rows; k++) colRow(B, -cw / 2, fFront - spacing * k, cw / 2, fFront - spacing * k, nF, y0, d, colH, mCol, 'tuscan');
    cellaX = cw; cellaF0 = fBack; cellaF1 = fFront - spacing * rows;
  } else if (plan === 'in_antis') {
    colRow(B, -cw / 2 + spacing, fFront, cw / 2 - spacing, fFront, Math.max(2, nF - 2), y0, d, colH, mCol, order, { fluted: fl });
    cellaX = cw; cellaF0 = fBack; cellaF1 = fFront - spacing * 0.2;
    box(B, -cw / 2 + d / 2, y0, (fFront + cellaF1) / 2 - spacing * 0.5, d, colH, spacing, mWall); box(B, cw / 2 - d / 2, y0, (fFront + cellaF1) / 2 - spacing * 0.5, d, colH, spacing, mWall);
  } else { // prostyle / amphiprostyle
    const porch = Math.max(1, Math.round(num(p.side, 2)) - 1);
    colRow(B, -cw / 2, fFront, cw / 2, fFront, nF, y0, d, colH, mCol, order, { fluted: fl });
    for (let k = 1; k <= porch - 1; k++) { colRow(B, -cw / 2, fFront - spacing * k, -cw / 2, fFront - spacing * k, 1, y0, d, colH, mCol, order); colRow(B, cw / 2, fFront - spacing * k, cw / 2, fFront - spacing * k, 1, y0, d, colH, mCol, order); }
    if (plan === 'amphiprostyle') colRow(B, -cw / 2, fBack, cw / 2, fBack, nF, y0, d, colH, mCol, order, { fluted: fl });
    cellaX = cw; cellaF0 = plan === 'amphiprostyle' ? fBack + spacing : fBack; cellaF1 = fFront - spacing * porch;
  }
  if (p.cella && p.cella.w) { cellaX = Math.min(cw, p.cella.w); }
  const cellaL = Math.max(2, cellaF1 - cellaF0);
  box(B, 0, y0, (cellaF0 + cellaF1) / 2, cellaX, colH, cellaL, mWall, { top: false });
  // door
  B.quad([-cellaX * 0.12, y0, cellaF1 + 0.02], [cellaX * 0.12, y0, cellaF1 + 0.02], [cellaX * 0.12, y0 + colH * 0.6, cellaF1 + 0.02], [-cellaX * 0.12, y0 + colH * 0.6, cellaF1 + 0.02], MAT.bronze);
  // entablature + roof
  box(B, 0, y0 + colH, podF, cw + d * 1.2, entH, cl + d * 1.2, mWall, { top: false });
  rise = (cw + d * 1.2) * 0.13;
  if (p.pediment !== false) gable(B, 0, y0 + colH + entH, podF, cw + d * 1.2, cl + d * 1.2, rise, mRoof, { pediment: mWall, eave: 0.25 });
  else box(B, 0, y0 + colH + entH, podF, cw + d * 1.2, 0.4, cl + d * 1.2, mRoof);
  const top = y0 + colH + entH + rise;
  if (p.acroteria !== false && W > 10) { box(B, 0, top - 0.2, fFront + d * 0.6, 1.2, 1.6, 0.6, MAT.gilded, { top: undefined }); }
  if (p.quadriga) box(B, 0, top - 0.3, fFront + d * 0.4, 3, 3, 2.2, MAT.gilded);
  if (p.precinct && p.precinct.w) {
    const pw = p.precinct.w, pl = p.precinct.l || pw, ph = p.precinct.h || 6;
    wallLine(B, [[-pw / 2, -pl / 2], [pw / 2, -pl / 2], [pw / 2, pl / 2]], 0, ph, 1.2, mPod, { join: true });
    wallLine(B, [[-pw / 2, pl / 2], [-pw / 2, -pl / 2]], 0, ph, 1.2, mPod, { join: true });
    wallLine(B, [[-pw / 2, pl / 2], [-W * 0.6, pl / 2]], 0, ph, 1.2, mPod); wallLine(B, [[W * 0.6, pl / 2], [pw / 2, pl / 2]], 0, ph, 1.2, mPod);
  }
};

T.tholos = (B, b) => {
  const p = b.p, D = num(p.diameter, b.w), H = b.h;
  const podH = num(p.podium, clamp(D * 0.12, 0.6, 3));
  const n = Math.max(6, Math.round(num(p.columns, D > 14 ? 20 : 18)));
  const roof = (p.roof || 'cone').toLowerCase();
  const rr = D / 2;
  const roofH = roof === 'flat' ? 0.5 : roof === 'dome' ? rr * 0.55 : rr * 0.45;
  let colH = num(p.colH, (H - podH - roofH) / 1.2);
  colH = clamp(colH, 2, 25);
  const order = (p.order || 'corinthian').toLowerCase();
  const d = colH / (RATIO[order] || 10);
  const mPod = M(b, 'podium', 'tufa'), mCol = M(b, 'columns', 'marble_white'), mWall = M(b, 'walls', 'marble_white'), mRoof = M(b, 'roof', roof === 'dome' ? 'lead' : 'roof_tile');
  cyl(B, 0, 0, 0, rr, podH, mPod, { segs: 24, capMat: 'paving_travertine' });
  stairs(B, 0, 0, rr + podH * 0.7, D * 0.35, podH * 1.4, podH, mPod);
  const rc = rr - d * 0.8;
  for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n; column(B, Math.cos(a) * rc, podH, Math.sin(a) * rc, d, colH, mCol, { order, fluted: true, segs: 7 }); }
  cyl(B, 0, podH, 0, rc * 0.72, colH, mWall, { segs: 20, cap: false });
  cyl(B, 0, podH + colH, 0, rr - 0.1, colH * 0.18, mWall, { segs: 24, cap: false });
  const y1 = podH + colH * 1.18;
  if (roof === 'dome') dome(B, 0, y1, 0, rr, roofH, mRoof, { segs: 20, rings: 5 });
  else if (roof === 'flat') cyl(B, 0, y1, 0, rr, 0.4, mRoof, { segs: 24 });
  else cyl(B, 0, y1, 0, rr + 0.4, roofH, mRoof, { segs: 24, r2: 0.4 });
};

T.basilica = (B, b) => {
  const p = b.p, W = b.w, L = b.l, H = b.h;
  const vaulted = !!p.vaulted;
  const nave = num(p.nave, W * (vaulted ? 0.36 : 0.32));
  const storeys = Math.max(1, Math.round(num(p.storeys, 2)));
  const facade = (p.facade || 'colonnade').toLowerCase();
  const aisleH = clamp(H * 0.55, 6, 40);
  const mWall = M(b, 'walls', vaulted ? 'brick' : 'marble_white'), mRoof = M(b, 'roof', 'roof_tile'), mFac = M(b, 'facade', facade === 'arcade' ? 'marble_white' : 'marble_white');
  if (vaulted) {
    // Maxentius: central nave with cross vaults, side bays with coffered barrel vaults
    box(B, 0, 0, 0, W, aisleH, L, mWall, { top: 'roof_tile' });
    const bayH = aisleH * 0.85;
    arcadeBox(B, 0, 0, 0, W + 0.05, bayH, L + 0.05, 1, L / 3, mWall, { open: false, sides: [0, 1, 0, 1] });
    box(B, 0, aisleH, 0, nave, H - aisleH, L * 0.98, mWall, { top: 'roof_tile' });
    vault(B, 0, H - 2, 0, nave, L * 0.98, 3, mRoof);
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) vault(B, s * (nave / 2 + (W - nave) / 4), aisleH - 0.5, k * L / 3, (W - nave) / 2 * 0.9, L / 3 * 0.9, 3, mRoof);
    if (p.apses !== 'none') cyl(B, 0, 0, -L / 2, nave / 2, H * 0.75, mWall, { segs: 12, a0: Math.PI, a1: Math.PI * 2, cap: false });
    return;
  }
  // outer aisles block (arcaded facade, roof as low hip)
  const fh = aisleH;
  if (facade === 'closed' || facade === 'tabernae') {
    box(B, 0, 0, 0, W, fh, L, mWall, { top: false });
    if (facade === 'tabernae') arcadeFace(B, -W / 2, L / 2 + 0.05, W / 2, L / 2 + 0.05, 0, fh * 0.45, 1, 5, MAT.dark, false);
  } else {
    arcadeBox(B, 0, 0, 0, W, fh, L, storeys, facade === 'arcade' ? 5.2 : 4.0, mFac, { open: true, double: 6 });
    box(B, 0, 0, 0, W - 0.3, 0.3, L - 0.3, MAT.marble_color, { top: 'marble_color' });
  }
  hip(B, 0, fh, 0, W, L, (W - nave) * 0.12, mRoof, { eave: 0.6 });
  // raised nave with clerestory
  const naveTop = H - nave * 0.14;
  box(B, 0, fh * 0.5, 0, nave, naveTop - fh * 0.5, L * 0.92, mWall, { top: false });
  if (p.clerestory !== false) arcadeFace(B, -nave / 2 - 0.05, L * 0.46, -nave / 2 - 0.05, -L * 0.46, fh + 0.5, naveTop - fh - 1, 1, 6, MAT.dark, false);
  if (p.clerestory !== false) arcadeFace(B, nave / 2 + 0.05, -L * 0.46, nave / 2 + 0.05, L * 0.46, fh + 0.5, naveTop - fh - 1, 1, 6, MAT.dark, false);
  gable(B, 0, naveTop, 0, nave, L * 0.92, nave * 0.14, mRoof, { pediment: mWall });
  const ap = (p.apses || 'none').toLowerCase();
  if (ap === 'end' || ap === 'both') cyl(B, 0, 0, -L / 2, nave * 0.42, fh, mWall, { segs: 12, a0: Math.PI, a1: Math.PI * 2, cap: false });
  if (ap === 'both') cyl(B, 0, 0, L / 2, nave * 0.42, fh, mWall, { segs: 12, a0: 0, a1: Math.PI, cap: false });
  if (ap === 'side') { cyl(B, -W / 2, 0, 0, nave * 0.4, fh, mWall, { segs: 12, a0: Math.PI / 2, a1: Math.PI * 1.5, cap: false }); cyl(B, W / 2, 0, 0, nave * 0.4, fh, mWall, { segs: 12, a0: -Math.PI / 2, a1: Math.PI / 2, cap: false }); }
};

T.church = (B, b) => {
  const p = b.p, W = b.w, L = b.l, H = b.h;
  const atr = p.atrium && p.atrium.l ? p.atrium : null;
  const aL = atr ? Math.min(atr.l, L * 0.45) : 0;
  const bodyL = L - aL - (p.narthex ? 6 : 0);
  const bodyF = -L / 2 + bodyL / 2;
  const aisles = Math.max(0, Math.round(num(p.aisles, 1)));
  const nave = num(p.nave, aisles ? W * (aisles === 2 ? 0.36 : 0.46) : W);
  const mWall = M(b, 'walls', 'brick'), mRoof = M(b, 'roof', 'roof_tile');
  const naveH = H * 0.86, aisleH = naveH * (aisles === 2 ? 0.55 : 0.6);
  if (aisles) {
    box(B, 0, 0, bodyF, W, aisleH, bodyL, mWall, { top: false });
    hip(B, 0, aisleH, bodyF, W, bodyL, (W - nave) * 0.12, mRoof, { eave: 0.4 });
  }
  box(B, 0, 0, bodyF, nave, naveH, bodyL, mWall, { top: false });
  arcadeFace(B, -nave / 2 - 0.05, bodyF + bodyL / 2 - 1, -nave / 2 - 0.05, bodyF - bodyL / 2 + 1, aisleH + 0.6, naveH - aisleH - 1.2, 1, 4.5, MAT.dark, false);
  arcadeFace(B, nave / 2 + 0.05, bodyF - bodyL / 2 + 1, nave / 2 + 0.05, bodyF + bodyL / 2 - 1, aisleH + 0.6, naveH - aisleH - 1.2, 1, 4.5, MAT.dark, false);
  gable(B, 0, naveH, bodyF, nave, bodyL, nave * 0.16, mRoof, { pediment: mWall });
  if (p.transept) { const tw = W * 1.15, tl = nave * 0.9; box(B, 0, 0, bodyF - bodyL / 2 + tl / 2, tw, naveH, tl, mWall, { top: false }); gable(B, 0, naveH, bodyF - bodyL / 2 + tl / 2, tw, tl, nave * 0.16, mRoof, { axis: 'x', pediment: mWall }); }
  if (p.apse !== false) { cyl(B, 0, 0, bodyF - bodyL / 2, nave * 0.42, naveH * 0.82, mWall, { segs: 14, a0: Math.PI, a1: Math.PI * 2, cap: false }); dome(B, 0, naveH * 0.82, bodyF - bodyL / 2, nave * 0.42, nave * 0.18, mRoof, { segs: 14, rings: 3 }); }
  // door
  B.quad([-1.8, 0, bodyF + bodyL / 2 + 0.03], [1.8, 0, bodyF + bodyL / 2 + 0.03], [1.8, 5, bodyF + bodyL / 2 + 0.03], [-1.8, 5, bodyF + bodyL / 2 + 0.03], MAT.dark);
  if (p.narthex) { box(B, 0, 0, bodyF + bodyL / 2 + 3, W, aisleH * 0.7, 6, mWall, { top: false }); gable(B, 0, aisleH * 0.7, bodyF + bodyL / 2 + 3, W, 6, 1.2, mRoof, { axis: 'x' }); }
  if (atr) {
    const aw = Math.min(W, num(atr.w, W));
    const af = L / 2 - aL / 2;
    T.porticus(B, { p: { depth: 4.5, colH: 5, garden: true }, w: aw, l: aL, h: 7, mat: { columns: 'marble_white', walls: mWall, roof: 'roof_tile' } }, 0, af);
  }
};

T.centralplan = (B, b) => {
  const p = b.p, H = b.h;
  const D = num(p.diameter, Math.min(b.w, b.l)), R = D / 2;
  const sides = Math.round(num(p.sides, 0));
  const domeH = num(p.domeH, R * (p.oculus ? 0.95 : 0.8));
  const drumH = num(p.drumH, Math.max(4, H - domeH));
  const mWall = M(b, 'walls', 'brick'), mDome = M(b, 'dome', 'lead');
  const segs = sides >= 6 ? sides : 28;
  cyl(B, 0, 0, 0, R + 1.2, drumH, mWall, { segs, cap: false, a0: sides ? Math.PI / segs : 0, a1: (sides ? Math.PI / segs : 0) + Math.PI * 2 });
  // stepped rings at the dome base (Pantheon)
  cyl(B, 0, drumH, 0, R + 1.2, domeH * 0.18, mDome, { segs, r2: R * 0.92, cap: false });
  dome(B, 0, drumH + domeH * 0.12, 0, R * 0.93, domeH * 0.88, mDome, { segs: Math.max(segs, 20), rings: 7, oculus: num(p.oculus, 0) / 2 });
  const po = p.portico;
  if (po) {
    const pw = num(po.w, D * 0.78), pl = num(po.l, D * 0.4), ch = num(po.colH, drumH * 0.66);
    const inter = p.intermediate;
    let fStart = R * 0.85;
    if (inter) {
      const iw = num(inter.w, pw), il = num(inter.l, R * 0.35), ih = num(inter.h, ch * 1.4);
      box(B, 0, 0, R * 0.7 + il / 2, iw, ih, il, mWall, { top: false });
      gable(B, 0, ih - 0.2, R * 0.7 + il / 2, iw, il, iw * 0.12, matOf('lead'), { pediment: mWall });
      fStart = R * 0.7 + il;
    }
    at(B, 0, 0, fStart + pl / 2, () => T.temple(B, { p: { order: 'corinthian', plan: 'prostyle', front: num(po.front, 8), side: num(po.side, 3), podium: 1.2, colH: ch, steps: 'front' }, w: pw, l: pl, h: ch * 1.24 + 1.2 + pw * 0.13, mat: { columns: 'granite', walls: 'marble_white', roof: 'bronze', podium: 'marble_white' } }));
  } else {
    B.quad([-2, 0, R + 1.25], [2, 0, R + 1.25], [2, 6, R + 1.25], [-2, 6, R + 1.25], MAT.dark);
  }
};

T.theatre = (B, b) => {
  const p = b.p;
  const D = num(p.diameter, b.w), R = D / 2;
  const orch = num(p.orchestra, D * 0.25) / 2;
  const storeys = Math.max(1, Math.round(num(p.storeys, 3)));
  const H = b.h;
  const mF = M(b, 'facade', 'travertine'), mSeat = M(b, 'seats', 'marble_white'), mWall = M(b, 'walls', 'brick');
  // cavea centre at F = 0; audience looks toward +F (the stage). Semicircle spans angles PI..2PI (F negative side)
  const a0 = Math.PI, a1 = Math.PI * 2;
  ellipseWall(B, 0, 0, R, R, 0, H, arcadeMat(mF), { a0, a1, segs: 40, bays: Math.round(Math.PI * R / 4.6), storeyH: H / storeys });
  ellipseWall(B, 0, 0, R - 0.4, R - 0.4, 0, H, mWall, { a0, a1, segs: 30, inside: true });
  ellipseBand(B, 0, 0, orch + 1, orch + 1, 1.2, R - 1.5, R - 1.5, H - 1.5, [mSeat[0], PAT.seats], { a0, a1, segs: 36, seatV: true });
  ellipseBand(B, 0, 0, R - 1.5, R - 1.5, H - 1.5, R, R, H, MAT.roof_tile, { a0, a1, segs: 36 });
  // orchestra floor
  cyl(B, 0, 0, 0, orch + 1, 0.3, MAT.marble_color, { segs: 16, a0, a1, cap: false });
  // scaena
  const sc = p.scaena || {};
  const sw = num(sc.w, D * 0.95), sd = num(sc.depth, Math.max(6, D * 0.08)), sh = num(sc.h, H * 0.95);
  box(B, 0, 0, orch * 0.6 + 3 + sd / 2, sw, sh, sd, mWall, { top: 'roof_tile' });
  arcadeFace(B, sw * 0.4, orch * 0.6 + 3 - 0.06, -sw * 0.4, orch * 0.6 + 3 - 0.06, 1.4, sh * 0.85, 3, 3.2, MAT.marble_color, false);
  box(B, 0, 0, orch * 0.6 + 1.5, sw * 0.9, 1.4, 3, MAT.timber); // pulpitum
  if (p.templeOnTop) at(B, 0, H - 2, -R + 14, () => T.temple(B, { p: { order: 'corinthian', plan: 'prostyle', front: 6, podium: 2 }, w: 22, l: 26, h: 20, mat: { podium: 'concrete_faced' } }));
  if (p.porticus && p.porticus.w) T.porticus(B, { p: { depth: 7, colH: num(p.porticus.colH, 8), garden: true }, w: p.porticus.w, l: p.porticus.l || p.porticus.w * 0.7, h: 11, mat: {} }, 0, orch * 0.6 + 3 + sd + (p.porticus.l || p.porticus.w * 0.7) / 2);
};
T.odeum = (B, b) => { const p = b.p; const D = num(p.diameter, b.w); T.theatre(B, { ...b, p: { ...p, diameter: D, storeys: 2 } }); cyl(B, 0, b.h, 0, D / 2, D * 0.12, MAT.roof_tile, { segs: 20, a0: Math.PI, a1: Math.PI * 2, r2: D * 0.1, cap: false }); };

T.amphitheatre = (B, b) => {
  const p = b.p;
  const A = num(p.a, b.l) / 2, Bb = num(p.b, b.w) / 2;
  const ai = num(p.arenaA, A * 2 * 0.44) / 2, bi = num(p.arenaB, Bb * 2 * 0.31) / 2;
  const H = b.h;
  const storeys = Math.max(1, Math.round(num(p.storeys, 4)));
  const bays = Math.round(num(p.bays, 80));
  const mF = M(b, 'facade', 'travertine'), mSeat = M(b, 'seats', 'marble_white');
  // ellipse: major axis along F (rot gives the major axis bearing)
  const arcadeH = p.attic !== false && storeys >= 4 ? H * 0.78 : H;
  ellipseWall(B, 0, 0, Bb, A, 0, arcadeH, arcadeMat(mF), { segs: 96, bays, storeyH: arcadeH / Math.min(3, storeys) });
  if (arcadeH < H) ellipseWall(B, 0, 0, Bb, A, arcadeH, H, [mF[0], PAT.ashlar], { segs: 96 });
  ellipseWall(B, 0, 0, Bb - 0.5, A - 0.5, 0, H, MAT.brick, { segs: 64, inside: true });
  ellipseBand(B, 0, 0, Bb - 3, A - 3, H - 3, Bb, A, H - 0.5, MAT.travertine, { segs: 64 }); // top portico roof
  ellipseBand(B, 0, 0, bi + 2, ai + 2, 4.0, Bb - 3, A - 3, H - 3, [mSeat[0], PAT.seats], { segs: 64, seatV: true });
  ellipseWall(B, 0, 0, bi + 2, ai + 2, 0, 4.0, MAT.marble_white, { segs: 48, inside: true });
  // arena sand
  const sand = [0xd8c49a, PAT.plain];
  const pts = []; for (let i = 0; i < 32; i++) { const t = i / 32 * Math.PI * 2; pts.push([Math.cos(t) * (bi + 2), Math.sin(t) * (ai + 2)]); }
  prism(B, pts, 0, 0.3, sand, { walls: false, top: sand });
  if (p.velarium) for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; box(B, Math.cos(t) * Bb * 0.995, H, Math.sin(t) * A * 0.995, 0.4, 4, 0.4, MAT.timber); }
};

T.circus = (B, b) => {
  const p = b.p, L = num(p.l, b.l), W = num(p.w, b.w), H = num(p.tiers, b.h);
  const mF = M(b, 'facade', 'travertine'), mSeat = M(b, 'seats', 'travertine'), mSand = [0xd5c093, PAT.plain];
  const r = W / 2; // curved end radius
  const straight = L - r - 8; // carceres end is straight
  const fC = -L / 2 + r; // centre of the curved end (at -F)
  const fG = L / 2; // gates
  const seatD = Math.min(W * 0.2, 30);
  // long sides
  for (const s of [-1, 1]) {
    arcadeFace(B, s * W / 2, s > 0 ? fC : fG - 8, s * W / 2, s > 0 ? fG - 8 : fC, 0, H, 3, 4.8, mF, true);
    const yi = 3, xo = s * W / 2, xi = s * (W / 2 - seatD);
    B.quad(s > 0 ? [xi, yi, fC] : [xi, yi, fG - 8], s > 0 ? [xi, yi, fG - 8] : [xi, yi, fC], s > 0 ? [xo, H, fG - 8] : [xo, H, fC], s > 0 ? [xo, H, fC] : [xo, H, fG - 8], [mSeat[0], PAT.seats], [0, 0, straight, 0, straight, Math.hypot(seatD, H), 0, Math.hypot(seatD, H)]);
    box(B, s * (W / 2 - seatD - 0.5), 0, (fC + fG - 8) / 2, 1, 3, fG - 8 - fC, MAT.marble_white);
  }
  ellipseWall(B, 0, fC, r, r, 0, H, arcadeMat(mF), { a0: Math.PI, a1: Math.PI * 2, segs: 24, bays: Math.round(Math.PI * r / 4.8), storeyH: H / 3 });
  ellipseBand(B, 0, fC, r - seatD, r - seatD, 3, r, r, H, [mSeat[0], PAT.seats], { a0: Math.PI, a1: Math.PI * 2, segs: 24, seatV: true });
  // arena
  prism(B, [[-W / 2 + seatD, fG - 8], [W / 2 - seatD, fG - 8], [W / 2 - seatD, fC], ...Array.from({ length: 13 }, (_, i) => { const t = Math.PI * 2 - i / 12 * Math.PI; return [Math.cos(t) * (r - seatD), fC + Math.sin(t) * (r - seatD)]; }).slice(1), [-W / 2 + seatD, fC]], 0, 0.2, mSand, { walls: false, top: mSand });
  // spina
  const sp = p.spina || {};
  const sl = num(sp.l, L * 0.55), sw = num(sp.w, 8);
  const sc = (fC + fG - 8) / 2 + 6;
  box(B, -W * 0.03, 0, sc, sw, 1.4, sl, MAT.marble_white, { top: 'water' });
  cyl(B, -W * 0.03, 0, sc - sl / 2 - 3, 1.6, 6, MAT.gilded, { segs: 3, r2: 0.2 }); cyl(B, -W * 0.03, 0, sc + sl / 2 + 3, 1.6, 6, MAT.gilded, { segs: 3, r2: 0.2 });
  for (const o of (p.obelisks || [])) { const off = typeof o === 'number' ? o : num(o.offset, 0); const oh = typeof o === 'object' ? num(o.h, 23) : 23; obeliskAt(B, -W * 0.03, sc + off, 1.4, oh); }
  // carceres
  const nC = Math.round(num(p.carceres, 12));
  box(B, 0, 0, fG - 4, W, H * 0.55, 8, mF, { top: 'roof_tile' });
  arcadeFace(B, -W / 2, fG - 8.05, W / 2, fG - 8.05, 0, H * 0.45, 1, W / nC, MAT.dark, false);
  if (p.pulvinar) { const sx = (p.pulvinar === 'left' ? -1 : 1) * W / 2; box(B, sx, 0, sc - 20, 10, H + 6, 16, MAT.marble_white); gable(B, sx, H + 6, sc - 20, 10, 16, 2, MAT.roof_tile, { pediment: 'marble_white' }); }
};
function obeliskAt(B, x, f, y0, h) { box(B, x, y0, f, h * 0.14, h * 0.12, h * 0.14, MAT.granite); cyl(B, x, y0 + h * 0.12, f, h * 0.06, h, matOf([0xa58b6f, PAT.granite]), { segs: 4, r2: h * 0.038, a0: Math.PI / 4, a1: Math.PI / 4 + Math.PI * 2 }); }

T.stadium = (B, b) => {
  const p = b.p, L = b.l, W = b.w, H = num(p.tiers, b.h);
  const mF = M(b, 'facade', 'travertine'), mSeat = M(b, 'seats', 'marble_white');
  const r = W / 2, fC = -L / 2 + r, sd = W * 0.3;
  for (const s of [-1, 1]) {
    arcadeFace(B, s * W / 2, s > 0 ? fC : L / 2, s * W / 2, s > 0 ? L / 2 : fC, 0, H, 2, 4.5, mF, true);
    const xo = s * W / 2, xi = s * (W / 2 - sd);
    B.quad(s > 0 ? [xi, 2, fC] : [xi, 2, L / 2], s > 0 ? [xi, 2, L / 2] : [xi, 2, fC], s > 0 ? [xo, H, L / 2] : [xo, H, fC], s > 0 ? [xo, H, fC] : [xo, H, L / 2], [mSeat[0], PAT.seats]);
  }
  ellipseWall(B, 0, fC, r, r, 0, H, arcadeMat(mF), { a0: Math.PI, a1: Math.PI * 2, segs: 20, bays: 18, storeyH: H / 2 });
  ellipseBand(B, 0, fC, r - sd, r - sd, 2, r, r, H, [mSeat[0], PAT.seats], { a0: Math.PI, a1: Math.PI * 2, segs: 20, seatV: true });
  arcadeFace(B, W / 2, L / 2, -W / 2, L / 2, 0, H, 2, 4.5, mF, true);
  const sand = [0xd5c093, PAT.plain];
  prism(B, [[-W / 2 + sd, L / 2], [W / 2 - sd, L / 2], [W / 2 - sd, fC], [-W / 2 + sd, fC]], 0, 0.2, sand, { walls: false });
};

T.porticus = (B, b, cx = 0, cf = 0, cy = 0) => {
  const p = b.p || {}, W = b.w, L = b.l;
  const depth = num(p.depth, 6), colH = num(p.colH, clamp((b.h || 10) * 0.7, 4, 14));
  const mCol = M(b, 'columns', 'marble_white'), mWall = M(b, 'walls', 'brick'), mRoof = M(b, 'roof', 'roof_tile');
  const sides = Array.isArray(p.sides) ? p.sides : null;
  const has = (k) => !sides || sides.includes(k) || sides.includes({ back: 'n', right: 'e', front: 's', left: 'w' }[k]) || sides.includes({ back: 'back', right: 'right', front: 'front', left: 'left' }[k]);
  const d = colH / 9;
  const S = [['back', [cx - W / 2, cf - L / 2], [cx + W / 2, cf - L / 2], [0, 1]], ['right', [cx + W / 2, cf - L / 2], [cx + W / 2, cf + L / 2], [-1, 0]], ['front', [cx + W / 2, cf + L / 2], [cx - W / 2, cf + L / 2], [0, -1]], ['left', [cx - W / 2, cf + L / 2], [cx - W / 2, cf - L / 2], [1, 0]]];
  for (const [k, a, q, n] of S) {
    if (!has(k)) continue;
    const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
    // outer wall
    wallLine(B, [a, q], cy, colH + 1.2, 0.9, mWall, { join: true });
    // colonnade line inward by depth
    const ia = [a[0] + n[0] * depth, a[1] + n[1] * depth], iq = [q[0] + n[0] * depth, q[1] + n[1] * depth];
    const nc = Math.max(2, Math.round(len / (d * 7)));
    if (len > 400 && !p.forceCols) arcadeFace(B, iq[0], iq[1], ia[0], ia[1], cy, colH, 1, d * 7, mCol, true);
    else colRow(B, ia[0], ia[1], iq[0], iq[1], nc, cy, d, colH, mCol, p.order || 'ionic', { segs: 6 });
    if (p.double) { const ja = [a[0] + n[0] * depth / 2, a[1] + n[1] * depth / 2], jq = [q[0] + n[0] * depth / 2, q[1] + n[1] * depth / 2]; colRow(B, ja[0], ja[1], jq[0], jq[1], nc, cy, d, colH, mCol, p.order || 'ionic', { segs: 6 }); }
    // lean-to roof
    const mx = (a[0] + q[0]) / 2 + n[0] * depth / 2, mf = (a[1] + q[1]) / 2 + n[1] * depth / 2;
    const horiz = n[0] === 0;
    box(B, mx, cy + colH, mf, horiz ? len : depth + 0.6, 0.8, horiz ? depth + 0.6 : len, mRoof, { top: 'roof_tile' });
  }
  if (p.garden) {
    const gw = W - depth * 2 - 2, gl = L - depth * 2 - 2;
    if (gw > 4 && gl > 4) {
      prism(B, [[cx - gw / 2, cf - gl / 2], [cx + gw / 2, cf - gl / 2], [cx + gw / 2, cf + gl / 2], [cx - gw / 2, cf + gl / 2]], cy, 0.15, MAT.grass, { walls: false });
      const nx = Math.max(1, Math.min(8, Math.round(gw / 14))), nf = Math.max(1, Math.min(8, Math.round(gl / 14)));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nf; j++) tree(B, cx - gw / 2 + (i + 0.5) * gw / nx, cy, cf - gl / 2 + (j + 0.5) * gl / nf, 7, (i + j) % 3 ? 'plane' : 'cypress');
    }
  }
};

T.colonnade = (B, b) => {
  const pts = b.lineLocal; if (!pts || pts.length < 2) return T.porticus(B, b);
  const p = b.p, colH = num(p.colH, 7), depth = num(p.depth, 5), d = colH / 9;
  const mCol = M(b, 'columns', 'marble_white'), mRoof = M(b, 'roof', 'roof_tile');
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, f0] = pts[i], [x1, f1] = pts[i + 1], len = Math.hypot(x1 - x0, f1 - f0);
    const nx = -(f1 - f0) / len, nf = (x1 - x0) / len;
    for (const s of [-1, 1]) colRow(B, x0 + nx * s * depth / 2, f0 + nf * s * depth / 2, x1 + nx * s * depth / 2, f1 + nf * s * depth / 2, Math.max(2, Math.round(len / (d * 7))), 0, d, colH, mCol, 'ionic', { segs: 6 });
    wallLine(B, [[x0, f0], [x1, f1]], colH, 0.8, depth + 0.6, mRoof, { top: 'roof_tile' });
  }
};

T.forum = (B, b) => {
  const p = b.p, W = b.w, L = b.l;
  const pav = matOf(p.paving || 'paving_travertine');
  const poly = b.fpLocal || [[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, L / 2], [-W / 2, L / 2]];
  prism(B, poly, 0, 0.25, pav, { walls: true, top: pav });
  const wallH = num(p.wallH, 0);
  if (wallH > 0) { const ring = poly.concat([poly[0]]); wallLine(B, ring, 0, wallH, 1.5, M(b, 'walls', 'peperino'), { join: true }); }
  const cd = num(p.colonnades, 0);
  if (cd > 0 && !b.fpLocal) T.porticus(B, { p: { depth: cd, colH: num(p.colH, Math.max(6, wallH * 0.55)), order: 'corinthian', sides: p.colSides || ['left', 'right'] }, w: W, l: L, h: wallH || 12, mat: b.mat });
  const ex = p.exedrae;
  if (ex && ex.radius) for (const s of [-1, 1]) cyl(B, s * W / 2, 0, 0, ex.radius, Math.max(8, wallH), M(b, 'walls', 'peperino'), { segs: 14, a0: s > 0 ? -Math.PI / 2 : Math.PI / 2, a1: s > 0 ? Math.PI / 2 : Math.PI * 1.5, cap: false });
};

T.baths = (B, b) => {
  const p = b.p;
  if (Array.isArray(p.blocks) && p.blocks.length) return T.compound(B, b);
  const W = b.w, L = b.l, H = b.h;
  const mWall = M(b, 'walls', 'brick'), mRoof = M(b, 'roof', 'roof_tile');
  const pre = p.precinct && p.precinct.w ? p.precinct : null;
  const core = p.core && p.core.w ? p.core : { w: (pre ? Math.min(W, pre.w) : W) * (pre ? 0.64 : 1), l: (pre ? Math.min(L, pre.l || L) : L) * (pre ? 0.34 : 1), h: H * 0.7 };
  const coreF = pre ? 0 : 0;
  if (pre) {
    const pw = pre.w, pl = pre.l || pre.w, ph = num(pre.h, 10);
    box(B, 0, 0, -pl / 2 + 10, pw, ph, 20, mWall, { top: 'roof_tile' });
    box(B, -pw / 2 + 5, 0, 0, 10, ph, pl, mWall, { top: 'roof_tile' });
    box(B, pw / 2 - 5, 0, 0, 10, ph, pl, mWall, { top: 'roof_tile' });
    arcadeFace(B, pw / 2, pl / 2, -pw / 2, pl / 2, 0, ph * 0.9, 2, 6, mWall, false);
    box(B, 0, 0, pl / 2 - 5, pw, ph * 0.9, 10, mWall, { top: 'roof_tile', sides: [1, 1, 0, 1] });
    const ne = Math.round(num(p.exedrae, 2));
    for (let k = 0; k < Math.min(ne, 2); k++) cyl(B, (k ? 1 : -1) * pw / 2, 0, -pl * 0.1, Math.min(40, pl * 0.15), ph * 1.3, mWall, { segs: 14, a0: k ? -Math.PI / 2 : Math.PI / 2, a1: k ? Math.PI / 2 : Math.PI * 1.5 });
    prism(B, [[-pw / 2 + 10, -pl / 2 + 20], [pw / 2 - 10, -pl / 2 + 20], [pw / 2 - 10, pl / 2 - 10], [-pw / 2 + 10, pl / 2 - 10]], 0, 0.15, MAT.grass, { walls: false });
  }
  // central block
  const cw = core.w, cl = core.l, ch = num(core.h, H * 0.7);
  box(B, 0, 0, coreF, cw, ch * 0.62, cl, mWall, { top: 'roof_tile' });
  arcadeFace(B, -cw / 2, coreF + cl / 2 + 0.05, cw / 2, coreF + cl / 2 + 0.05, ch * 0.18, ch * 0.4, 1, 7, MAT.dark, false);
  arcadeFace(B, cw / 2, coreF - cl / 2 - 0.05, -cw / 2, coreF - cl / 2 - 0.05, ch * 0.18, ch * 0.4, 1, 7, MAT.dark, false);
  // frigidarium: tall cross-vaulted hall across the centre
  const fr = p.frigidarium && p.frigidarium.w ? p.frigidarium : { w: cw * 0.28, l: cl * 0.5, h: ch };
  box(B, 0, 0, coreF, fr.w, num(fr.h, ch) * 0.8, fr.l, mWall, { top: false });
  vault(B, 0, num(fr.h, ch) * 0.8, coreF, fr.w, fr.l, fr.w * 0.25, mRoof);
  vault(B, 0, num(fr.h, ch) * 0.8, coreF, fr.w * 0.9, fr.l, fr.w * 0.22, mRoof);
  arcadeFace(B, -fr.w / 2 - 0.05, coreF + fr.l / 2, -fr.w / 2 - 0.05, coreF - fr.l / 2, ch * 0.62, num(fr.h, ch) * 0.18, 1, fr.l / 3, MAT.dark, false);
  arcadeFace(B, fr.w / 2 + 0.05, coreF - fr.l / 2, fr.w / 2 + 0.05, coreF + fr.l / 2, ch * 0.62, num(fr.h, ch) * 0.18, 1, fr.l / 3, MAT.dark, false);
  // caldarium: domed rotunda projecting from the back (toward -F is the "front" for many baths; follow F-)
  const ca = p.caldarium || {};
  const cr = num(ca.radius, Math.min(cw * 0.12, 26)), chh = num(ca.h, ch * 0.75);
  cyl(B, 0, 0, coreF - cl / 2, cr, chh, mWall, { segs: 20, cap: false });
  arcadeFace(B, -cr * 0.7, coreF - cl / 2 - cr * 0.72, cr * 0.7, coreF - cl / 2 - cr * 0.72, chh * 0.35, chh * 0.5, 1, cr * 0.5, MAT.dark, false);
  dome(B, 0, chh, coreF - cl / 2, cr, cr * 0.75, MAT.concrete_faced, { segs: 20, rings: 5 });
  // natatio
  const na = p.natatio && p.natatio.w ? p.natatio : { w: cw * 0.35, l: cl * 0.25 };
  prism(B, [[-na.w / 2, coreF + cl / 2 - 2 - na.l], [na.w / 2, coreF + cl / 2 - 2 - na.l], [na.w / 2, coreF + cl / 2 - 2], [-na.w / 2, coreF + cl / 2 - 2]], ch * 0.62, 0.05, MAT.water, { walls: false });
  // palaestrae
  for (const s of [-1, 1]) T.porticus(B, { p: { depth: 5, colH: 7 }, w: cw * 0.2, l: cl * 0.55, h: 9, mat: { walls: mWall } }, s * cw * 0.36, coreF, ch * 0.62);
};
T.balneum = (B, b) => { box(B, 0, 0, 0, b.w, b.h * 0.7, b.l, M(b, 'walls', 'brick'), { top: false }); vault(B, 0, b.h * 0.7, 0, b.w, b.l, b.w * 0.2, M(b, 'roof', 'roof_tile'), { ends: 'brick' }); };

T.arch = (B, b) => {
  const p = b.p, W = b.w, L = num(p.depth, b.l), H = b.h;
  const bays = p.bays === 'quadrifrons' ? 'q' : Math.round(num(p.bays, 1));
  const mW = M(b, 'walls', 'marble_white');
  const atticH = num(p.atticH, H * 0.25);
  const bodyH = H - atticH;
  if (bays === 'q') {
    box(B, 0, 0, 0, W, bodyH, L, mW, { top: false });
    arcadeFace(B, -W / 2, L / 2 + 0.03, W / 2, L / 2 + 0.03, 0, bodyH, 1, W, MAT.dark, false);
    arcadeFace(B, W / 2, -L / 2 - 0.03, -W / 2, -L / 2 - 0.03, 0, bodyH, 1, W, MAT.dark, false);
    arcadeFace(B, W / 2 + 0.03, L / 2, W / 2 + 0.03, -L / 2, 0, bodyH, 1, L, MAT.dark, false);
    arcadeFace(B, -W / 2 - 0.03, -L / 2, -W / 2 - 0.03, L / 2, 0, bodyH, 1, L, MAT.dark, false);
  } else {
    const n = bays === 3 ? 3 : 1;
    // piers and openings drawn as a box with dark arch patches on front/back, see-through via side gaps
    box(B, 0, 0, 0, W, bodyH, L, mW, { top: false });
    const bw = W / (n === 3 ? 4 : 1.6);
    for (const f of [L / 2 + 0.03, -L / 2 - 0.03]) {
      const dir = f > 0 ? 1 : -1;
      const quadA = (x0, x1, top) => B.quad(dir > 0 ? [x0, 0, f] : [x1, 0, f], dir > 0 ? [x1, 0, f] : [x0, 0, f], dir > 0 ? [x1, top, f] : [x0, top, f], dir > 0 ? [x0, top, f] : [x1, top, f], MAT.dark);
      quadA(-bw / 2, bw / 2, bodyH * 0.7);
      if (n === 3) { quadA(-W * 0.4, -W * 0.25, bodyH * 0.45); quadA(W * 0.25, W * 0.4, bodyH * 0.45); }
    }
    if (p.columns && p.columns !== 'none') for (const f of [L / 2 + 0.6, -L / 2 - 0.6]) for (const x of n === 3 ? [-W * 0.46, -W * 0.18, W * 0.18, W * 0.46] : [-W * 0.4, W * 0.4]) column(B, x, bodyH * 0.12, f, bodyH * 0.07, bodyH * 0.74, MAT.marble_color, { order: 'composite', segs: 7 });
  }
  box(B, 0, bodyH, 0, W, atticH, L, mW, { top: 'marble_white' });
  if (p.quadriga !== false) { box(B, 0, H, 0, W * 0.32, H * 0.14, L * 0.6, MAT.gilded); }
};

T.column = (B, b) => {
  const p = b.p, H = b.h;
  const ped = num(p.pedestal, H * 0.2), shaft = num(p.shaft, H - ped - (p.statue !== false ? 4 : 0)), d = num(p.diameter, shaft / 8);
  const m = M(b, 'walls', 'marble_white');
  box(B, 0, 0, 0, d * 1.5, ped, d * 1.5, m);
  cyl(B, 0, ped, 0, d / 2 * 1.1, d * 0.4, m, { segs: 12, r2: d / 2, cap: false });
  cyl(B, 0, ped + d * 0.4, 0, d / 2, shaft - d * 0.9, p.spiral ? [m[0], PAT.flutes] : m, { segs: 12, r2: d / 2 * 0.9, cap: false, uvScale: [0.3, 0.3] });
  box(B, 0, ped + shaft - d * 0.5, 0, d * 1.15, d * 0.5, d * 1.15, m);
  if (p.statue !== false) cyl(B, 0, ped + shaft, 0, d * 0.18, 4, MAT.gilded, { segs: 6, r2: d * 0.12 });
};
T.obelisk = (B, b) => { const p = b.p; const h = num(p.h, b.h * 0.85), base = num(p.base, b.h - h); box(B, 0, 0, 0, h * 0.15, base, h * 0.15, MAT.marble_white); cyl(B, 0, base, 0, h * 0.065, h, matOf([0xa58b6f, PAT.granite]), { segs: 4, r2: h * 0.04, a0: Math.PI / 4, a1: Math.PI / 4 + Math.PI * 2 }); cyl(B, 0, base + h, 0, h * 0.04 * 1.41, h * 0.06, MAT.gilded, { segs: 4, r2: 0, a0: Math.PI / 4, a1: Math.PI / 4 + Math.PI * 2 }); };

T.mausoleum = (B, b) => {
  const p = b.p, D = num(p.diameter, b.w), R = D / 2, H = b.h;
  const mW = M(b, 'walls', 'travertine');
  let y = 0;
  if (p.base && p.base.w) { const bh = num(p.base.h, 10); box(B, 0, 0, 0, p.base.w, bh, p.base.w, mW, { top: 'paving_travertine' }); y = bh; }
  const tiers = Math.max(1, Math.round(num(p.tiers, 1)));
  const drumH = num(p.drumH, H * 0.4);
  const tumH = num(p.tumulusH, Math.max(0, H - drumH - y - (p.statue !== false ? 6 : 0)));
  for (let k = 0; k < tiers; k++) {
    const rk = R * (1 - k * 0.28), hk = drumH / tiers;
    cyl(B, 0, y, 0, rk, hk, k === 0 ? mW : MAT.marble_white, { segs: 32, capMat: k === tiers - 1 && tumH > 0 ? 'grass' : 'paving_travertine' });
    if (k < tiers - 1) tree(B, rk * 0.9, y + hk, 0, 6, 'cypress');
    y += hk;
  }
  const rt = R * (1 - (tiers - 1) * 0.28);
  if (tumH > 0) {
    cyl(B, 0, y, 0, rt * 0.98, tumH, MAT.grass, { segs: 24, r2: rt * 0.22 });
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; tree(B, Math.cos(a) * rt * 0.75, y + tumH * 0.2, Math.sin(a) * rt * 0.75, 9, 'cypress'); }
    y += tumH;
  }
  if (p.statue !== false) { cyl(B, 0, y, 0, rt * 0.2, 3, mW, { segs: 12 }); cyl(B, 0, y + 3, 0, 0.6, 5, MAT.gilded, { segs: 6, r2: 0.4 }); }
  B.quad([-2.5, 0, R + 0.03 + (p.base && p.base.w ? p.base.w / 2 - R : 0)], [2.5, 0, R + 0.03 + (p.base && p.base.w ? p.base.w / 2 - R : 0)], [2.5, 6, R + 0.03 + (p.base && p.base.w ? p.base.w / 2 - R : 0)], [-2.5, 6, R + 0.03 + (p.base && p.base.w ? p.base.w / 2 - R : 0)], MAT.dark);
};
T.pyramid = (B, b) => { const W = b.w, H = b.h; hip(B, 0, 0, 0, W, W, H, M(b, 'walls', 'marble_white'), { eave: 0 }); };
T.tomb = (B, b) => {
  const k = (b.p.kind || 'altar').toLowerCase(), W = b.w || 6, H = b.h || 6, m = M(b, 'walls', 'travertine');
  if (k === 'drum') { box(B, 0, 0, 0, W * 1.1, H * 0.25, W * 1.1, m); cyl(B, 0, H * 0.25, 0, W / 2, H * 0.6, m, { segs: 20 }); cyl(B, 0, H * 0.85, 0, W / 2, H * 0.15, MAT.grass, { segs: 20, r2: W * 0.15 }); }
  else if (k === 'pyramid') hip(B, 0, 0, 0, W, W, H, m, { eave: 0 });
  else if (k === 'tower') { box(B, 0, 0, 0, W, H * 0.8, W, m); hip(B, 0, H * 0.8, 0, W, W, H * 0.2, MAT.roof_tile); }
  else if (k === 'aedicula' || k === 'house') { box(B, 0, 0, 0, W, H * 0.75, b.l || W, k === 'house' ? MAT.brick : m, { top: false }); gable(B, 0, H * 0.75, 0, W, b.l || W, H * 0.25, MAT.roof_tile, { pediment: k === 'house' ? 'brick' : m }); }
  else { box(B, 0, 0, 0, W, H * 0.8, b.l || W, m); box(B, 0, H * 0.8, 0, W * 1.08, H * 0.2, (b.l || W) * 1.08, m); }
};

T.compound = (B, b) => {
  const p = b.p;
  const blocks = Array.isArray(p.blocks) ? p.blocks : [];
  if (!blocks.length) {
    const poly = b.fpLocal;
    if (poly) prism(B, poly, 0, b.h * 0.6, M(b, 'walls', 'brick'), { top: 'roof_tile' });
    else { box(B, 0, 0, 0, b.w, b.h * 0.6, b.l, M(b, 'walls', 'brick'), { top: false }); hip(B, 0, b.h * 0.6, 0, b.w, b.l, Math.min(b.w, b.l) * 0.15, MAT.roof_tile); }
    return;
  }
  for (const k of blocks) block(B, b, k);
};

// one compound block
function block(B, b, k) {
  const sh = (k.shape || 'box').toLowerCase();
  const x = num(k.x, 0), f = num(k.y, 0), z = num(k.z, 0);
  const w = Math.max(0.3, num(k.w, 10)), l = Math.max(0.3, num(k.l, w)), h = Math.max(0.1, num(k.h, 8));
  const m = k.mat ? matOf(k.mat) : M(b, 'walls', 'brick');
  const rot = num(k.rot, 0);
  switch (sh) {
    case 'gable': box(B, x, z, f, w, h * 0.72, l, m, { rot, top: false }); if (!rot) gable(B, x, z + h * 0.72, f, w, l, h * 0.28, MAT.roof_tile, { pediment: m, axis: w > l ? 'x' : 'f' }); else hip(B, x, z + h * 0.72, f, w, l, h * 0.28, MAT.roof_tile); break;
    case 'vault': box(B, x, z, f, w, h * 0.75, l, m, { rot, top: false }); vault(B, x, z + h * 0.75, f, w, l, h * 0.25, k.roofMat ? matOf(k.roofMat) : MAT.concrete_faced, { ends: m }); break;
    case 'dome': cyl(B, x, z, f, w / 2, h * 0.55, m, { segs: 20, cap: false }); dome(B, x, z + h * 0.55, f, w / 2, h * 0.45, k.roofMat ? matOf(k.roofMat) : MAT.concrete_faced, { segs: 20, rings: 5, oculus: num(k.oculus, 0) }); break;
    case 'apse': { const r = w / 2; const a0 = Math.PI + rot * Math.PI / 180; cyl(B, x, z, f, r, h, m, { segs: 12, a0, a1: a0 + Math.PI, cap: false }); break; }
    case 'hemicycle': { const r = num(k.radius, w / 2), dd = num(k.depth, 8); const ang = num(k.angle, 180) * Math.PI / 180; const a0 = Math.PI * 1.5 - ang / 2 + rot * Math.PI / 180; ellipseWall(B, x, f, r, r, z, z + h, arcadeMat(m, false), { a0, a1: a0 + ang, segs: 24, bays: Math.round(ang * r / 6), storeyH: h / Math.max(1, num(k.storeys, 3)) }); ellipseWall(B, x, f, r - dd, r - dd, z, z + h, m, { a0, a1: a0 + ang, segs: 20, inside: true }); ellipseBand(B, x, f, r - dd, r - dd, z + h, r, r, z + h, MAT.roof_tile, { a0, a1: a0 + ang, segs: 20 }); break; }
    case 'court': { const rd = num(k.ringDepth, Math.min(w, l) * 0.22); const hw = w / 2, hl = l / 2; box(B, x, z, f - hl + rd / 2, w, h, rd, m, { rot: 0, top: 'roof_tile' }); box(B, x, z, f + hl - rd / 2, w, h, rd, m, { top: 'roof_tile' }); box(B, x - hw + rd / 2, z, f, rd, h, l - rd * 2, m, { top: 'roof_tile' }); box(B, x + hw - rd / 2, z, f, rd, h, l - rd * 2, m, { top: 'roof_tile' }); if (k.colonnade !== false && w - rd * 2 > 6) T.porticus(B, { p: { depth: 3.5, colH: Math.min(h * 0.6, 8) }, w: w - rd * 2, l: l - rd * 2, h: h, mat: { walls: 'stucco' } }, x, f, z); prism(B, [[x - hw + rd, f - hl + rd], [x + hw - rd, f - hl + rd], [x + hw - rd, f + hl - rd], [x - hw + rd, f + hl - rd]], z, 0.1, k.garden === false ? MAT.paving_travertine : MAT.grass, { walls: false }); break; }
    case 'colonnade': { const ch = h, d = ch / 9; if (w >= l) colRow(B, x - w / 2, f, x + w / 2, f, Math.max(2, Math.round(w / (d * 7))), z, d, ch, k.mat ? matOf(k.mat) : MAT.marble_white, 'corinthian', { segs: 6 }); else colRow(B, x, f - l / 2, x, f + l / 2, Math.max(2, Math.round(l / (d * 7))), z, d, ch, k.mat ? matOf(k.mat) : MAT.marble_white, 'corinthian', { segs: 6 }); break; }
    case 'tower': box(B, x, z, f, w, h, l, m, { rot }); hip(B, x, z + h, f, w, l, Math.min(w, l) * 0.3, MAT.roof_tile); break;
    case 'cylinder': cyl(B, x, z, f, w / 2, h, m, { segs: 20 }); break;
    case 'stepped': { const n = Math.max(2, Math.round(num(k.steps, 3))); for (let i = 0; i < n; i++) box(B, x, z + h * i / n, f, w * (1 - i * 0.6 / n), h / n, l * (1 - i * 0.6 / n), m, { rot }); break; }
    case 'wall': box(B, x, z, f, w, h, l, m, { rot }); break;
    case 'terrace': box(B, x, z, f, w, h, l, m, { rot, top: k.top || 'paving_travertine' }); if (k.facade === 'arcade' || !k.facade) arcadeFace(B, x - w / 2, f + l / 2 + 0.03, x + w / 2, f + l / 2 + 0.03, z, h, Math.max(1, Math.round(h / 8)), 5, m, false); break;
    case 'pool': prism(B, [[x - w / 2, f - l / 2], [x + w / 2, f - l / 2], [x + w / 2, f + l / 2], [x - w / 2, f + l / 2]], z, 0.05, MAT.water, { walls: false }); break;
    case 'garden': prism(B, [[x - w / 2, f - l / 2], [x + w / 2, f - l / 2], [x + w / 2, f + l / 2], [x - w / 2, f + l / 2]], z, 0.1, MAT.grass, { walls: false }); break;
    default: box(B, x, z, f, w, h, l, m, { rot, top: k.top || (h > 4 ? 'roof_tile' : undefined) });
  }
}

T.horrea = (B, b) => {
  const p = b.p, st = Math.max(1, Math.round(num(p.storeys, 2)));
  const ct = p.court && p.court.w ? p.court : { w: b.w * 0.5, l: b.l * 0.55 };
  block(B, b, { shape: 'court', x: 0, y: 0, w: b.w, l: b.l, h: b.h || st * 4.2, ringDepth: Math.min((b.w - ct.w) / 2, (b.l - ct.l) / 2), colonnade: false, garden: false });
  arcadeFace(B, -b.w / 2, b.l / 2 + 0.04, b.w / 2, b.l / 2 + 0.04, 0, b.h || st * 4.2, st, 4, MAT.dark, false);
};
T.insula = (B, b) => { const st = Math.max(1, Math.round(num(b.p.storeys, 5))); const H = b.h || st * 3.2; box(B, 0, 0, 0, b.w, H, b.l, [0xd9b48a, PAT.windows], { top: false, uvFn: (k, len, h) => [0, 0, len, 0, len, h, 0, h] }); hip(B, 0, H, 0, b.w, b.l, 1.6, MAT.roof_tile, { eave: 0.5 }); };
T.domus = (B, b) => {
  const st = Math.max(1, Math.round(num(b.p.storeys, 1))), H = b.h || st * 4.5, W = b.w, L = b.l;
  box(B, 0, 0, 0, W, H, L, MAT.stucco, { top: false });
  hip(B, 0, H, 0, W, L, Math.min(W, L) * 0.12, MAT.roof_tile);
  if (b.p.peristyle && b.p.peristyle.w) T.porticus(B, { p: { depth: 3, colH: 4, garden: true }, w: b.p.peristyle.w, l: b.p.peristyle.l || b.p.peristyle.w, h: 5, mat: { walls: 'stucco' } }, 0, -L / 2 - (b.p.peristyle.l || b.p.peristyle.w) / 2);
};
T.hut = (B, b) => { const D = num(b.p.diameter, b.w || 5); if (b.l && b.w && Math.abs(b.l - b.w) > 0.5) { box(B, 0, 0, 0, b.w, 1.8, b.l, MAT.mudbrick, { top: false }); gable(B, 0, 1.8, 0, b.w, b.l, 2.2, MAT.thatch); } else { cyl(B, 0, 0, 0, D / 2, 1.7, MAT.mudbrick, { segs: 10, cap: false }); cyl(B, 0, 1.7, 0, D / 2 + 0.4, 2.6, MAT.thatch, { segs: 10, r2: 0.15 }); } };
T.fountain = (B, b) => {
  const k = (b.p.kind || 'basin').toLowerCase(), D = num(b.p.diameter, b.w || 8);
  if (k === 'cone') { cyl(B, 0, 0, 0, D / 2, 0.8, MAT.water, { segs: 20, capMat: 'water' }); cyl(B, 0, 0, 0, D * 0.16, b.h || 17, M(b, 'walls', 'brick'), { segs: 14, r2: D * 0.07 }); }
  else if (k === 'nymphaeum') { const fw = num(b.p.facade && b.p.facade.w, b.w || 20), fh = num(b.p.facade && b.p.facade.h, b.h || 12); box(B, 0, 0, -2, fw, fh, 4, M(b, 'walls', 'brick')); arcadeFace(B, -fw / 2, 0.05, fw / 2, 0.05, 1, fh * 0.8, 2, fw / 5, MAT.marble_white, false); prism(B, [[-fw / 2, 0], [fw / 2, 0], [fw / 2, 5], [-fw / 2, 5]], 0, 0.6, MAT.water, { top: 'water' }); }
  else cyl(B, 0, 0, 0, D / 2, 0.9, MAT.marble_white, { segs: 16, capMat: 'water' });
};
T.altar = (B, b) => { const p = b.p; const e = p.enclosure && p.enclosure.w ? p.enclosure : { w: b.w, l: b.l, h: b.h }; wallLine(B, [[-e.w / 2, e.l / 2], [-e.w / 2, -e.l / 2], [e.w / 2, -e.l / 2], [e.w / 2, e.l / 2]], 0, e.h || 6, 0.6, M(b, 'walls', 'marble_white'), { join: true }); wallLine(B, [[-e.w / 2, e.l / 2], [-e.w * 0.2, e.l / 2]], 0, e.h || 6, 0.6, M(b, 'walls', 'marble_white')); wallLine(B, [[e.w * 0.2, e.l / 2], [e.w / 2, e.l / 2]], 0, e.h || 6, 0.6, M(b, 'walls', 'marble_white')); const a = p.altar && p.altar.w ? p.altar : { w: e.w * 0.5, l: e.l * 0.4, h: 2.5 }; box(B, 0, 0, 0, a.w, a.h, a.l, MAT.marble_white); };
T.statue = (B, b) => { const p = b.p; const bh = num(p.base, b.h * 0.3), fh = num(p.figure, b.h - bh); box(B, 0, 0, 0, Math.max(1.5, b.w || fh * 0.3), bh, Math.max(1.5, b.l || fh * (p.equestrian ? 0.5 : 0.3)), MAT.marble_white); if (p.equestrian) box(B, 0, bh, 0, fh * 0.25, fh * 0.6, fh * 0.6, MAT.gilded); cyl(B, 0, bh + (p.equestrian ? fh * 0.5 : 0), 0, fh * 0.1, fh * (p.equestrian ? 0.5 : 1), M(b, 'figure', 'bronze'), { segs: 7, r2: fh * 0.06 }); };
T.platform = (B, b) => { const poly = b.fpLocal || [[-b.w / 2, -b.l / 2], [b.w / 2, -b.l / 2], [b.w / 2, b.l / 2], [-b.w / 2, b.l / 2]]; prism(B, poly, 0, b.h || 3, M(b, 'walls', 'concrete_faced'), { top: b.p.top || 'paving_travertine' }); if ((b.p.facade || '') === 'arcade' && !b.fpLocal) arcadeFace(B, -b.w / 2, b.l / 2 + 0.03, b.w / 2, b.l / 2 + 0.03, 0, b.h || 3, Math.max(1, Math.round((b.h || 3) / 7)), 5, M(b, 'walls', 'brick'), false); };
T.garden = (B, b) => {
  const poly = b.fpLocal || [[-b.w / 2, -b.l / 2], [b.w / 2, -b.l / 2], [b.w / 2, b.l / 2], [-b.w / 2, b.l / 2]];
  const kind = (b.p.kind || 'formal').toLowerCase();
  if (kind === 'park') return; // open meadows are painted on the ground, not built
  prism(B, poly, 0, 0.12, MAT.grass, { walls: false });
  // scatter trees inside the polygon deterministically
  const dens = num(b.p.trees, kind === 'grove' ? 1.5 : kind === 'orchard' ? 1 : 0.5) / 100;
  let x0 = Infinity, x1 = -Infinity, f0 = Infinity, f1 = -Infinity;
  for (const [x, f] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); f0 = Math.min(f0, f); f1 = Math.max(f1, f); }
  const area = (x1 - x0) * (f1 - f0);
  const n = Math.min(1400, Math.round(area * dens * 0.45));
  let seed = 1234 + Math.round(x0 * 7 + f0 * 13);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * (x1 - x0), f = f0 + rnd() * (f1 - f0);
    if (!inPoly(poly, x, f)) continue;
    const r = rnd();
    tree(B, x, 0, f, 6 + r * 9, kind === 'formal' ? (r < 0.35 ? 'cypress' : r < 0.6 ? 'pine' : 'plane') : r < 0.25 ? 'pine' : r < 0.35 ? 'cypress' : 'plane');
  }
  if (b.p.pavilion !== false && area > 20000) { box(B, 0, 0, 0, 22, 9, 16, MAT.stucco, { top: false }); hip(B, 0, 9, 0, 22, 16, 3, MAT.roof_tile); }
};
T.pool = (B, b) => { const poly = b.fpLocal || [[-b.w / 2, -b.l / 2], [b.w / 2, -b.l / 2], [b.w / 2, b.l / 2], [-b.w / 2, b.l / 2]]; prism(B, poly, -0.4, 0.5, MAT.travertine, { top: 'water' }); };
T.harbor = (B, b) => { const pts = b.lineLocal; if (!pts) return; wallLine(B, pts, -3, (b.h || 3) + 3, 6, M(b, 'walls', 'travertine'), { top: 'paving_travertine' }); };
T.ship_island = (B, b) => { const L = b.l || 90, H = b.h || 6; const pts = [[0, L / 2], [8, L / 2 - 14], [10, -L / 2 + 6], [0, -L / 2], [-10, -L / 2 + 6], [-8, L / 2 - 14]]; prism(B, pts, -2, H + 2, M(b, 'walls', 'travertine'), { top: 'paving_travertine' }); obeliskAt(B, 0, 0, H, 14); };

T.bridge = (B, b) => {
  const pts = b.lineLocal; if (!pts || pts.length < 2) return;
  const p = b.p, dw = num(p.deckW, 8), n = Math.max(1, Math.round(num(p.arches, 3)));
  const m = M(b, 'walls', /sublic/i.test(b.id) ? 'timber' : 'travertine');
  const [x0, f0] = pts[0], [x1, f1] = pts[pts.length - 1];
  const L = Math.hypot(x1 - x0, f1 - f0);
  const deckY = num(b.deckY, 14) - (b.baseY || 0); // deck elevation above local ground
  const y0 = (b.waterY ?? 4) - (b.baseY || 0) - 4;
  const ang = Math.atan2(x1 - x0, f1 - f0) * 180 / Math.PI;
  // deck
  wallLine(B, [[x0, f0], [x1, f1]], deckY - 1.2, 1.2, dw, matOf('paving_basalt'), { top: 'paving_basalt' });
  // parapets
  const nx = -(f1 - f0) / L, nf = (x1 - x0) / L;
  for (const s of [-1, 1]) wallLine(B, [[x0 + nx * s * dw / 2, f0 + nf * s * dw / 2], [x1 + nx * s * dw / 2, f1 + nf * s * dw / 2]], deckY, 1.1, 0.5, m);
  // arched body: two faces with open arches
  for (const s of [-1, 1]) {
    const ax = x0 + nx * s * dw / 2, af = f0 + nf * s * dw / 2, bx = x1 + nx * s * dw / 2, bf = f1 + nf * s * dw / 2;
    const h = deckY - 1.2 - y0;
    if (s > 0) B.quad([ax, y0, af], [bx, y0, bf], [bx, y0 + h, bf], [ax, y0 + h, af], [m[0], PAT.arcadeOpen], [0, 0, n, 0, n, 1.25, 0, 1.25]);
    else B.quad([bx, y0, bf], [ax, y0, af], [ax, y0 + h, af], [bx, y0 + h, bf], [m[0], PAT.arcadeOpen], [n, 0, 0, 0, 0, 1.25, n, 1.25]);
  }
  // piers
  for (let i = 1; i < n; i++) { const t = i / n; box(B, x0 + (x1 - x0) * t, y0, f0 + (f1 - f0) * t, L / n * 0.22, deckY - 1.2 - y0, dw, m, { rot: -ang, top: false }); }
};

export const TEMPLATES = T;
export function buildVersion(B, b) {
  const fn = T[b.tp] || T[{ temple_round: 'tholos', rotunda: 'centralplan', palace: 'compound', camp: 'compound', market: 'compound', gate: 'arch', nymphaeum: 'fountain', cistern: 'compound', house: 'domus', apartment: 'insula', ludus: 'compound', castra: 'compound', warehouse: 'horrea', mithraeum: 'compound', shrine: 'tholos' }[b.tp]] || T.compound;
  fn(B, b);
}
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
export { inPoly, at };
