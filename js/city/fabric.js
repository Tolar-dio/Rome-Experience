// Generated residential fabric (huts, houses, domus, insulae) drawn as instanced meshes.
// data/city/fabric.bin: Float32 records of 10: x, z, rot(deg), w, l, h, from, to, type, seed
import * as THREE from '../../vendor/three/three.module.min.js';
import { U } from './materials.js';

export const FAB_TYPES = ['hut', 'house', 'domus', 'insula', 'villa', 'shops', 'tomb', 'shed'];
export const FAB_LABEL = {
  hut: 'Hut (wattle and daub, thatched)', house: 'House', domus: 'Domus (atrium house)', insula: 'Insula (apartment block)',
  villa: 'Garden pavilion or villa', shops: 'Row of shops (tabernae)', tomb: 'Tomb', shed: 'Shed or workshop',
};
const STRIDE = 10;
const PICK_BASE = 16000000;

function unitHouse(kind) {
  // unit footprint 1 x 1 centred, walls 0..1 in y, roof above y = 1 (scaled by roof rise in the shader)
  const pos = [], nrm = [], uv = [], side = [], idx = [];
  const quad = (a, b, c, d, n, s, uvs) => {
    const k = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(...p);
    for (let i = 0; i < 4; i++) { nrm.push(...n); side.push(s); }
    uv.push(...uvs);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  if (kind === 'hut') {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const p0 = [Math.cos(a0) * 0.5, 0, Math.sin(a0) * 0.5], p1 = [Math.cos(a1) * 0.5, 0, Math.sin(a1) * 0.5];
      const nn = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      quad(p1, p0, [p0[0], 1, p0[2]], [p1[0], 1, p1[2]], nn, 0, [i / n, 0, (i + 1) / n, 0, (i + 1) / n, 1, i / n, 1]);
      const k = pos.length / 3;
      pos.push(p1[0] * 1.1, 1, p1[2] * 1.1, p0[0] * 1.1, 1, p0[2] * 1.1, 0, 2.2, 0);
      for (let j = 0; j < 3; j++) { nrm.push(nn[0] * 0.7, 0.7, nn[2] * 0.7); side.push(2); }
      uv.push(0, 0, 1, 0, 0.5, 1);
      idx.push(k, k + 1, k + 2);
    }
  } else {
    const h = 0.5;
    // walls (winding: outward normals)
    quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1], 0, [0, 0, 1, 0, 1, 1, 0, 1]);
    quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1], 0, [0, 0, 1, 0, 1, 1, 0, 1]);
    quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0], 1, [0, 0, 1, 0, 1, 1, 0, 1]);
    quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0], 1, [0, 0, 1, 0, 1, 1, 0, 1]);
    const e = 0.52;
    if (kind === 'house') { // gable along x
      quad([-e, 1, e], [e, 1, e], [e, 2, 0], [-e, 2, 0], [0, 0.7, 0.7], 2, [0, 0, 1, 0, 1, 1, 0, 1]);
      quad([e, 1, -e], [-e, 1, -e], [-e, 2, 0], [e, 2, 0], [0, 0.7, -0.7], 2, [0, 0, 1, 0, 1, 1, 0, 1]);
      const k = pos.length / 3;
      pos.push(h, 1, h, h, 1, -h, h, 2, 0, -h, 1, -h, -h, 1, h, -h, 2, 0);
      for (let j = 0; j < 3; j++) { nrm.push(1, 0, 0); side.push(1); }
      for (let j = 0; j < 3; j++) { nrm.push(-1, 0, 0); side.push(1); }
      uv.push(0, 1, 1, 1, 0.5, 1, 0, 1, 1, 1, 0.5, 1);
      idx.push(k, k + 1, k + 2, k + 3, k + 4, k + 5);
    } else { // hip roof; domus/insula/villa get a lighter court hint in the shader
      const r = kind === 'insula' ? 0.18 : 0.08;
      quad([-e, 1, e], [e, 1, e], [r, 2, 0], [-r, 2, 0], [0, 0.7, 0.7], 2, [0, 0, 1, 0, 1, 1, 0, 1]);
      quad([e, 1, -e], [-e, 1, -e], [-r, 2, 0], [r, 2, 0], [0, 0.7, -0.7], 2, [0, 0, 1, 0, 1, 1, 0, 1]);
      const k = pos.length / 3;
      pos.push(e, 1, e, e, 1, -e, r, 2, 0, -e, 1, -e, -e, 1, e, -r, 2, 0);
      for (let j = 0; j < 3; j++) { nrm.push(0.7, 0.7, 0); side.push(2); }
      for (let j = 0; j < 3; j++) { nrm.push(-0.7, 0.7, 0); side.push(2); }
      uv.push(0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1);
      idx.push(k, k + 1, k + 2, k + 3, k + 4, k + 5);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}

const FAB_VERT_PARS = /* glsl */`
attribute float side;
attribute vec4 iA; // x, z, rot(rad), seed
attribute vec4 iB; // w, l, h, baseY
attribute vec4 iC; // from, to, type, pickIndex
uniform float uYear;
varying vec2 vFU;
varying float vSide;
varying float vSeed;
varying float vType;
varying float vFH;
varying vec3 vFW;
`;
const FAB_VERT = /* glsl */`
float rise = iC.z == 0.0 ? 2.4 : (iC.z == 3.0 ? 1.6 : 1.4);
vec3 lp = position;
float yy = lp.y <= 1.0001 ? lp.y * iB.z : iB.z + (lp.y - 1.0) * rise;
vec3 sc = vec3(lp.x * iB.x, yy, lp.z * iB.y);
float cr = cos(iA.z), sr = sin(iA.z);
vec3 transformed = vec3(sc.x * cr + sc.z * sr, sc.y, -sc.x * sr + sc.z * cr) + vec3(iA.x, iB.w, iA.y);
if (uYear < iC.x || uYear > iC.y) transformed = vec3(0.0, -100000.0, 0.0);
vFU = vec2(uv.x * (side < 0.5 ? iB.x : iB.y), lp.y * iB.z);
vSide = side; vSeed = iA.w; vType = iC.z; vFH = sc.y;
vFW = transformed;
`;
const FAB_NORMAL = /* glsl */`
vec3 objectNormal = vec3(normal.x * cos(iA.z) + normal.z * sin(iA.z), normal.y, -normal.x * sin(iA.z) + normal.z * cos(iA.z));
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`;
const FAB_FRAG_PARS = /* glsl */`
varying vec2 vFU; varying float vSide; varying float vSeed; varying float vType; varying float vFH; varying vec3 vFW;
float fh(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
`;
const FAB_FRAG = /* glsl */`
{
  vec3 pal[5];
  pal[0] = vec3(0.87, 0.80, 0.66); pal[1] = vec3(0.85, 0.68, 0.48); pal[2] = vec3(0.72, 0.44, 0.33); pal[3] = vec3(0.90, 0.86, 0.76); pal[4] = vec3(0.70, 0.52, 0.38);
  int t = int(vType + 0.5);
  vec3 c = pal[int(mod(floor(vSeed * 5.0), 5.0))];
  if (t == 0) c = vec3(0.60, 0.50, 0.36);
  if (t == 3 || t == 5) c = mix(c, vec3(0.70, 0.42, 0.30), step(0.55, fract(vSeed * 7.3)) * 0.8); // brick-faced insulae
  if (vSide > 1.5) {
    c = t == 0 ? vec3(0.55, 0.47, 0.30) : vec3(0.66, 0.34, 0.23) * (0.85 + 0.25 * fract(vSeed * 13.1));
    if (t == 0) c *= 0.8 + 0.3 * fh(floor(vFW.xz * 3.0));
    else c *= 0.82 + 0.18 * abs(sin(vFU.x * 7.5));
  } else if (t == 3 || t == 5) {
    float st = 3.0;
    float fl = floor(vFU.y / st), sy = fract(vFU.y / st);
    if (fl < 0.5) { float sx = fract(vFU.x / 4.2); if (sx > 0.12 && sx < 0.86 && sy < 0.8) c = vec3(0.30, 0.22, 0.15); }
    else { float bx = fract(vFU.x / 3.0); float on = fh(vec2(floor(vFU.x / 3.0), fl + vSeed * 31.0)); if (bx > 0.35 && bx < 0.65 && sy > 0.3 && sy < 0.72 && on > 0.2) c *= 0.28; }
    if (sy < 0.05 && fl > 0.5) c *= 0.85;
  } else if (t == 1 || t == 2 || t == 4) {
    float bx = fract(vFU.x / 4.0);
    if (vFU.y > 0.5 && vFU.y < 2.6 && bx > 0.42 && bx < 0.58 && fh(vec2(floor(vFU.x / 4.0), vSeed)) > 0.6) c *= 0.35;
  }
  c *= mix(0.62, 1.0, smoothstep(0.0, 2.5, vFH));
  diffuseColor.rgb = pow(c, vec3(2.2));
}
`;

export async function buildFabric(terrain) {
  const r = await fetch('data/city/fabric.bin');
  if (!r.ok) return null;
  const f = new Float32Array(await r.arrayBuffer());
  const n = Math.floor(f.length / STRIDE);
  if (!n) return null;
  // one mesh per base geometry; types 1 (house) gable, 0 hut, others hip
  const groups = { hut: [], house: [], hip: [] };
  for (let i = 0; i < n; i++) {
    const t = f[i * STRIDE + 8];
    (t === 0 ? groups.hut : t === 1 || t === 7 ? groups.house : groups.hip).push(i);
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uYear = U.uYear;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + FAB_VERT_PARS)
      .replace('#include <beginnormal_vertex>', FAB_NORMAL)
      .replace('#include <begin_vertex>', FAB_VERT);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FAB_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FAB_FRAG);
  };
  mat.customProgramCacheKey = () => 'orbis-fabric-v1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (s) => {
    s.uniforms.uYear = U.uYear;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + FAB_VERT_PARS).replace('#include <begin_vertex>', FAB_VERT);
  };
  depth.customProgramCacheKey = () => 'orbis-fabric-depth-v1';
  const pickMat = new THREE.ShaderMaterial({
    uniforms: { uYear: U.uYear },
    vertexShader: FAB_VERT_PARS + `varying float vPick; void main(){ ${FAB_VERT} vPick = iC.w; gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0); }`,
    fragmentShader: `precision highp float; varying float vPick; void main(){ float id = vPick + ${PICK_BASE.toFixed(1)} + 1.0; gl_FragColor = vec4(mod(id,256.0)/255.0, mod(floor(id/256.0),256.0)/255.0, floor(id/65536.0)/255.0, 1.0); }`,
  });
  const root = new THREE.Group(); root.name = 'fabric';
  const pickRoot = new THREE.Group();
  for (const [kind, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const g = unitHouse(kind === 'hip' ? 'insula' : kind);
    const A = new Float32Array(list.length * 4), Bv = new Float32Array(list.length * 4), Cv = new Float32Array(list.length * 4);
    list.forEach((i, k) => {
      const o = i * STRIDE;
      const x = f[o], z = f[o + 1];
      A.set([x, z, f[o + 2] * Math.PI / 180, f[o + 9]], k * 4);
      Bv.set([f[o + 3], f[o + 4], f[o + 5], terrain.heightAt(x, z) - 0.6], k * 4);
      Cv.set([f[o + 6], f[o + 7], f[o + 8], i], k * 4);
    });
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(Bv, 4));
    g.setAttribute('iC', new THREE.InstancedBufferAttribute(Cv, 4));
    g.instanceCount = list.length;
    const m = new THREE.Mesh(g, mat);
    m.customDepthMaterial = depth;
    m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
    root.add(m);
    const pm = new THREE.Mesh(g, pickMat); pm.frustumCulled = false; pickRoot.add(pm);
  }
  return {
    mesh: root, pickMesh: pickRoot, count: n,
    setYear() {},
    record(i) {
      const o = i * STRIDE; if (o < 0 || o >= f.length) return null;
      const t = FAB_TYPES[f[o + 8]] || 'house';
      return { kind: 'fabric', type: t, label: FAB_LABEL[t] + ' (generated)', x: f[o], z: f[o + 1], from: f[o + 6], to: f[o + 7], w: f[o + 3], l: f[o + 4], h: f[o + 5] };
    },
  };
}
