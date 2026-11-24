// Ancient terrain: chunked LOD mesh from data/city/terrain.bin plus year-dependent correction layers.
import * as THREE from '../../vendor/three/three.module.min.js';

const CH = 16;      // chunks per side
const CELLS = 72;   // cells per chunk at LOD0 (N - 1 = 1152 = 16 * 72)
const LODS = [1, 2, 4, 8];

export class Terrain {
  constructor(meta, baseBuf, snapBuf) {
    this.meta = meta;
    this.N = meta.n; this.x0 = meta.x0; this.z0 = meta.z0; this.step = meta.step; this.size = meta.size;
    const u16 = new Uint16Array(baseBuf);
    this.base = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) this.base[i] = u16[i] / 100 - 20;
    this.h = new Float32Array(this.base);
    this.snapData = snapBuf ? new Int16Array(snapBuf) : new Int16Array(0);
    this.years = meta.snapYears || [-509];
    this.snaps = [{ y: this.years[0], map: new Map() }].concat((meta.snaps || []).map((s) => ({ y: s.y, map: new Map(s.tiles.map(([ti, tj, off]) => [ti + ',' + tj, off / 2])) })));
    this.T = meta.tile || 64;
    this.key = '';
    this.dirtyTiles = new Set();
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    this.material = terrainMaterial(meta.waterLevel);
  }

  waterLevel(y) {
    const w = this.meta.water || [];
    if (!w.length) return this.meta.waterLevel || 5;
    if (y <= w[0].y) return w[0].wl;
    for (let k = 0; k < w.length - 1; k++) if (y <= w[k + 1].y) return w[k].wl + (w[k + 1].wl - w[k].wl) * (y - w[k].y) / (w[k + 1].y - w[k].y);
    return w[w.length - 1].wl;
  }

  applyYear(y) {
    const ys = this.years;
    let k = 0;
    while (k < ys.length - 1 && ys[k + 1] <= y) k++;
    let w = k < ys.length - 1 ? (y - ys[k]) / (ys[k + 1] - ys[k]) : 0;
    w = Math.max(0, Math.min(1, Math.round(w * 8) / 8));
    if (w === 1) { k++; w = 0; }
    const key = k + ':' + w;
    if (key === this.key) return false;
    this.key = key;
    const A = this.snaps[k], B = this.snaps[Math.min(k + 1, this.snaps.length - 1)];
    const tiles = new Set([...this.dirtyTiles, ...A.map.keys(), ...(w > 0 ? B.map.keys() : [])]);
    const N = this.N, T = this.T, h = this.h, base = this.base, D = this.snapData;
    const changed = new Set();
    for (const key2 of tiles) {
      const [ti, tj] = key2.split(',').map(Number);
      const oa = A.map.get(key2), ob = w > 0 ? B.map.get(key2) : undefined;
      const i0 = ti * T, j0 = tj * T, iw = Math.min(T, N - i0), jh = Math.min(T, N - j0);
      for (let j = 0; j < jh; j++) for (let i = 0; i < iw; i++) {
        const g = (j0 + j) * N + i0 + i, l = j * iw + i;
        const da = oa !== undefined ? D[oa + l] / 100 : 0, db = ob !== undefined ? D[ob + l] / 100 : 0;
        h[g] = base[g] + da * (1 - w) + db * w;
      }
      changed.add(key2);
    }
    this.dirtyTiles = new Set([...A.map.keys(), ...(w > 0 ? B.map.keys() : [])]);
    if (this.chunks.length) {
      const C = 72 * this.step;
      for (const c of this.chunks) {
        // chunk covers grid cells [ci*72, ci*72+72]; tile covers [ti*T, ti*T+T]
        let hit = false;
        for (const key2 of changed) { const [ti, tj] = key2.split(',').map(Number); if (ti * T <= c.ci * 72 + 72 && ti * T + T >= c.ci * 72 && tj * T <= c.cj * 72 + 72 && tj * T + T >= c.cj * 72) { hit = true; break; } }
        if (hit) for (const g of c.lods) this.fillHeights(g);
      }
    }
    return true;
  }

  heightAt(x, z) {
    const fi = (x - this.x0) / this.step, fj = (z - this.z0) / this.step, N = this.N;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fi))), j = Math.max(0, Math.min(N - 2, Math.floor(fj)));
    const u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j));
    const h = this.h;
    return h[j * N + i] * (1 - u) * (1 - v) + h[j * N + i + 1] * u * (1 - v) + h[(j + 1) * N + i] * (1 - u) * v + h[(j + 1) * N + i + 1] * u * v;
  }
  normalAt(x, z) {
    const e = this.step;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z), dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return new THREE.Vector3(-dx, 2 * e, -dz).normalize();
  }

  build() {
    for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
      const lods = LODS.map((s) => this.chunkGeometry(ci, cj, s));
      const mesh = new THREE.Mesh(lods[0], this.material);
      mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      const cx = this.x0 + (ci + 0.5) * CELLS * this.step, cz = this.z0 + (cj + 0.5) * CELLS * this.step;
      this.chunks.push({ ci, cj, lods, mesh, cx, cz, lod: 0 });
      this.group.add(mesh);
    }
  }

  chunkGeometry(ci, cj, s) {
    const n = CELLS / s; // cells along a side
    const vs = n + 1;
    const skirt = 4 * vs;
    const pos = new Float32Array((vs * vs + skirt) * 3);
    const idx = [];
    for (let j = 0; j < vs; j++) for (let i = 0; i < vs; i++) {
      const gi = ci * CELLS + i * s, gj = cj * CELLS + j * s;
      const k = (j * vs + i) * 3;
      pos[k] = this.x0 + gi * this.step; pos[k + 2] = this.z0 + gj * this.step;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * vs + i, b = a + 1, c = a + vs, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // skirts: duplicate edge vertices lowered
    const edges = [];
    for (let i = 0; i < vs; i++) edges.push(i);                       // north edge (j=0)
    for (let j = 0; j < vs; j++) edges.push(j * vs + vs - 1);         // east
    for (let i = vs - 1; i >= 0; i--) edges.push((vs - 1) * vs + i);  // south
    for (let j = vs - 1; j >= 0; j--) edges.push(j * vs);             // west
    const sk0 = vs * vs;
    edges.forEach((e, k) => { pos[(sk0 + k) * 3] = pos[e * 3]; pos[(sk0 + k) * 3 + 2] = pos[e * 3 + 2]; });
    for (let k = 0; k < edges.length - 1; k++) {
      const a = edges[k], b = edges[k + 1], c = sk0 + k, d = sk0 + k + 1;
      if (a === b) continue;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(idx);
    g.userData = { ci, cj, s, vs, edges, sk0 };
    this.fillHeights(g);
    return g;
  }

  fillHeights(g) {
    const { ci, cj, s, vs, edges, sk0 } = g.userData;
    const pos = g.attributes.position.array, nrm = g.attributes.normal.array, N = this.N, h = this.h, st = this.step;
    for (let j = 0; j < vs; j++) for (let i = 0; i < vs; i++) {
      const gi = ci * CELLS + i * s, gj = cj * CELLS + j * s;
      const k = (j * vs + i) * 3;
      pos[k + 1] = h[gj * N + gi];
      const l = h[gj * N + Math.max(0, gi - 1)], r = h[gj * N + Math.min(N - 1, gi + 1)];
      const u = h[Math.max(0, gj - 1) * N + gi], d = h[Math.min(N - 1, gj + 1) * N + gi];
      let nx = l - r, ny = 2 * st, nz = u - d; const L = Math.hypot(nx, ny, nz);
      nrm[k] = nx / L; nrm[k + 1] = ny / L; nrm[k + 2] = nz / L;
    }
    edges.forEach((e, k) => { const q = (sk0 + k) * 3; pos[q + 1] = pos[e * 3 + 1] - 12; nrm[q] = nrm[e * 3]; nrm[q + 1] = nrm[e * 3 + 1]; nrm[q + 2] = nrm[e * 3 + 2]; });
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
  }

  updateGeometry() { for (const c of this.chunks) for (const g of c.lods) this.fillHeights(g); }

  updateLOD(cam) {
    const p = cam.position;
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - p.x, c.cz - p.z, Math.max(0, p.y - 40) * 0.6);
      const lod = d < 1300 ? 0 : d < 2800 ? 1 : d < 5200 ? 2 : 3;
      if (lod !== c.lod) { c.lod = lod; c.mesh.geometry = c.lods[lod]; }
    }
  }
}

function terrainMaterial(waterLevel) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uWater = { value: waterLevel };
    s.uniforms.uGround = TERRAIN_U.uGround;
    s.uniforms.uGroundOn = TERRAIN_U.uGroundOn;
    s.uniforms.uGroundBox = TERRAIN_U.uGroundBox;
    s.uniforms.uFires = TERRAIN_U.uFires;
    s.uniforms.uFireBit = TERRAIN_U.uFireBit;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed,1.0)).xyz; vTN = normal;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTW; varying vec3 vTN; uniform float uWater; uniform sampler2D uGround; uniform float uGroundOn; uniform vec4 uGroundBox; uniform sampler2D uFires; uniform float uFireBit;
float th21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(th21(i),th21(i+vec2(1,0)),f.x),mix(th21(i+vec2(0,1)),th21(i+vec2(1,1)),f.x),f.y); }
float tfbm(vec2 p){ return tn(p)*0.5+tn(p*2.1)*0.28+tn(p*4.3)*0.14+tn(p*9.1)*0.08; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float slope = 1.0 - clamp(vTN.y, 0.0, 1.0);
  float n = tfbm(vTW.xz * 0.02);
  float n2 = tfbm(vTW.xz * 0.15);
  vec3 grass = mix(vec3(0.47, 0.49, 0.29), vec3(0.55, 0.54, 0.34), n);
  vec3 dry = vec3(0.64, 0.59, 0.44);
  vec3 earth = vec3(0.55, 0.45, 0.33);
  vec3 rock = vec3(0.60, 0.55, 0.45);
  vec3 c = mix(grass, dry, smoothstep(0.35, 0.75, n2) * 0.6);
  c = mix(c, earth, smoothstep(0.18, 0.42, slope));
  c = mix(c, rock, smoothstep(0.5, 0.75, slope));
  // river banks and flood plain
  float wet = 1.0 - smoothstep(uWater + 0.2, uWater + 2.5, vTW.y);
  c = mix(c, vec3(0.40, 0.36, 0.28), wet * 0.8);
  if (uGroundOn > 0.5) {
    vec2 g = (vTW.xz - uGroundBox.xy) / uGroundBox.zw;
    vec4 gt = texture2D(uGround, g);
    // r: urban (trodden earth / paving), g: garden, b: burnt
    c = mix(c, mix(vec3(0.66, 0.60, 0.50), vec3(0.60, 0.56, 0.50), n2), gt.r * 0.8);
    c = mix(c, vec3(0.36, 0.44, 0.22) * (0.8 + 0.4 * n2), gt.g * 0.8);
    c = mix(c, vec3(0.16, 0.13, 0.11), gt.b * 0.85);
    if (uFireBit >= 0.0) {
      vec3 fb = texture2D(uFires, g).rgb * 255.0;
      int bits = (int(fb.r + 0.5) << 16) | (int(fb.g + 0.5) << 8) | int(fb.b + 0.5);
      if (((bits >> int(uFireBit)) & 1) == 1) c = mix(c, vec3(0.13, 0.11, 0.10), 0.82 * (0.7 + 0.3 * n2));
    }
  }
  diffuseColor.rgb = pow(c * (0.95 + 0.08 * n2), vec3(2.2));
}`);
  };
  m.customProgramCacheKey = () => 'orbis-terrain-v1';
  return m;
}

export const TERRAIN_U = {
  uGround: { value: null }, uGroundOn: { value: 0 }, uFires: { value: null }, uFireBit: { value: -1 }, uGroundBox: { value: new THREE.Vector4(-4670, -4720, 9440, 9440) },
};

export function waterMesh(meta) {
  const g = new THREE.PlaneGeometry(meta.size - 20, meta.size - 20, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x3f6470, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(meta.x0 + meta.size / 2, meta.waterLevel, meta.z0 + meta.size / 2);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}
