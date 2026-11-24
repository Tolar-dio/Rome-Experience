// Shader injection for year-driven buildings and procedural surface patterns.
import * as THREE from '../../vendor/three/three.module.min.js';

export const U = {
  uYear: { value: 100 },
  uBld: { value: null },
  uBldW: { value: 1024 },
  uSel: { value: -1 },
  uHover: { value: -1 },
  uTime: { value: 0 },
  uMonumentFade: { value: 1 },
};

// ------------------------------------------------------------------ GLSL
const LIFE_VERT_PARS = /* glsl */`
attribute float bid;
attribute float pat;
uniform sampler2D uBld;
uniform float uBldW;
uniform float uYear;
varying vec2 vPUv;
varying float vPat;
varying float vBid;
varying float vH;
varying float vScaff;
varying vec3 vWPos;
vec4 bldTex(float i, float k) {
  float t = i * 2.0 + k;
  return texelFetch(uBld, ivec2(int(mod(t, uBldW)), int(floor(t / uBldW))), 0);
}
`;
const LIFE_VERT = /* glsl */`
vec3 transformed = vec3(position);
vPUv = uv; vPat = pat; vBid = bid; vScaff = 0.0;
{
  vec4 d0 = bldTex(bid, 0.0);
  vec4 d1 = bldTex(bid, 1.0);
  // d0: from, to, begun, (unused)   d1: baseY, height, flags, (unused)
  if (uYear < d0.z || uYear > d0.y) {
    transformed = vec3(0.0, -100000.0, 0.0);
  } else if (uYear < d0.x) {
    float prog = clamp((uYear - d0.z + 1.0) / max(1.0, d0.x - d0.z + 1.0), 0.03, 1.0);
    float cap = d1.x + max(3.0, d1.y * prog);
    if (transformed.y > cap - 1.6) vScaff = 1.0;
    transformed.y = min(transformed.y, cap);
  }
  vH = transformed.y - d1.x;
}
`;

const PAT_FRAG_PARS = /* glsl */`
varying vec2 vPUv;
varying float vPat;
varying float vBid;
varying float vH;
varying float vScaff;
varying vec3 vWPos;
uniform float uSel;
uniform float uHover;
uniform float uTime;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.3 + vnoise(p * 4.1) * 0.2; }
// returns 1 inside an arch opening (bay/storey units)
float archOpen(vec2 uv) {
  float bx = fract(uv.x) - 0.5;
  float sv = fract(uv.y);
  float hw = 0.31;
  if (abs(bx) > hw) return 0.0;
  float top = 0.60 + 0.20 * sqrt(max(0.0, 1.0 - (bx / hw) * (bx / hw)));
  return (sv < top) ? 1.0 : 0.0;
}
`;

// fragment pattern: modifies diffuseColor.rgb, sets rough/metal
const PAT_FRAG = /* glsl */`
float pRough = 0.85, pMetal = 0.0;
{
  int P = int(vPat + 0.5);
  vec2 uv = vPUv;
  vec3 c = diffuseColor.rgb;
  float n = fbm(vWPos.xz * 0.35 + vWPos.y * 0.2);
  if (P == 1) { // ashlar
    float row = floor(uv.y / 0.6);
    float bu = uv.x / 1.25 + row * 0.5;
    float jv = min(fract(uv.y / 0.6), 1.0 - fract(uv.y / 0.6)) * 0.6;
    float ju = min(fract(bu), 1.0 - fract(bu)) * 1.25;
    float j = smoothstep(0.0, 0.035, min(jv, ju));
    c *= mix(0.78, 1.0, j) * (0.9 + 0.16 * h21(vec2(floor(bu), row)));
  } else if (P == 2) { // brick
    float fy = fract(uv.y / 0.32);
    c *= (0.93 + 0.07 * smoothstep(0.0, 0.15, fy)) * (0.88 + 0.2 * n);
    float bond = fract(uv.y / 1.25);
    if (bond < 0.05) c *= 1.12;
  } else if (P == 3) { // roof tiles
    float s = abs(sin(uv.x * 3.14159 / 0.42));
    float r = fract(uv.y / 0.45);
    c *= (0.78 + 0.22 * s) * (0.92 + 0.08 * smoothstep(0.0, 0.2, r)) * (0.9 + 0.2 * h21(floor(vec2(uv.x / 0.42, uv.y / 0.45))));
    pRough = 0.75;
  } else if (P == 4 || P == 5) { // arcades
    float open = archOpen(uv);
    if (P == 4 && open > 0.5) discard;
    float bx = fract(uv.x), sv = fract(uv.y);
    if (open > 0.5) c *= 0.22;
    else {
      if (sv > 0.86) c *= 1.06;                       // entablature band
      if (abs(bx - 0.5) > 0.42) c *= 1.05;            // engaged columns
      if (sv > 0.84 && sv < 0.86) c *= 0.8;
    }
    c *= 0.92 + 0.14 * n;
  } else if (P == 6) { // windows / shops on housing
    float st = 3.1;
    float fl = floor(uv.y / st);
    float sy = fract(uv.y / st);
    float bx = fract(uv.x / 3.2);
    float wid = h21(vec2(floor(uv.x / 3.2), fl));
    if (fl < 0.5) {
      float sx = fract(uv.x / 4.4);
      if (sx > 0.12 && sx < 0.88 && sy < 0.78) c = mix(c, vec3(0.06, 0.03, 0.017), 0.85);
    } else if (bx > 0.36 && bx < 0.64 && sy > 0.32 && sy < 0.72 && wid > 0.15) c *= 0.25;
    if (sy < 0.04 && fl > 0.5) c *= 0.86;
    c *= 0.9 + 0.2 * n;
  } else if (P == 8) { // grass
    c *= 0.75 + 0.45 * fbm(vWPos.xz * 0.12);
  } else if (P == 9) { // paving
    vec2 g = vWPos.xz / 0.9; vec2 i = floor(g); vec2 f = fract(g);
    float md = 1.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(x, y); vec2 pp = o + vec2(h21(i + o), h21(i + o + 7.1)); md = min(md, length(pp - f)); }
    c *= 0.82 + 0.25 * smoothstep(0.05, 0.25, md) * (0.8 + 0.4 * h21(i));
    pRough = 0.7;
  } else if (P == 10) { // water
    c = mix(c, c * 1.25, fbm(vWPos.xz * 0.05 + uTime * 0.02));
    pRough = 0.12; pMetal = 0.1;
  } else if (P == 11) { // flutes
    c *= 0.82 + 0.18 * abs(sin(uv.x * 3.14159));
    pRough = 0.5;
  } else if (P == 12) { pMetal = 0.75; pRough = 0.45; c *= 0.85 + 0.25 * n; }
  else if (P == 20) { pMetal = 0.85; pRough = 0.32; }
  else if (P == 13) { // seating steps
    float s = fract(uv.y / 0.42);
    c *= 0.72 + 0.28 * smoothstep(0.0, 0.25, s);
  } else if (P == 14) { // reticulate
    vec2 r = vec2(uv.x + uv.y, uv.x - uv.y) / 0.3;
    vec2 f = abs(fract(r) - 0.5);
    c *= mix(0.82, 1.0, smoothstep(0.42, 0.38, max(f.x, f.y))) * (0.9 + 0.15 * n);
  } else if (P == 15) { pMetal = 0.35; pRough = 0.55; c *= 0.9 + 0.1 * abs(sin(uv.x * 2.0)); }
  else if (P == 16) { c *= 0.8 + 0.25 * abs(sin(uv.y * 9.0 + n * 3.0)); }
  else if (P == 17) { c *= 0.75 + 0.4 * fbm(vec2(uv.x * 3.0, uv.y * 0.4)); }
  else if (P == 19) { c *= 0.6 + 0.6 * fbm(vWPos.xz * 0.8 + vWPos.y); pRough = 0.95; }
  else if (P == 21) { c *= 0.95 + 0.08 * fbm(vWPos.xz * 0.6 + vWPos.y * 0.6); pRough = 0.45; }
  else if (P == 22) { c *= 0.85 + 0.25 * h21(floor(vWPos.xz * 6.0 + vWPos.y * 6.0)); pRough = 0.4; }
  else { c *= 0.94 + 0.12 * n; }
  // fake ambient occlusion near the ground, scaffolding tint during construction
  c *= mix(0.62, 1.0, smoothstep(0.0, 3.0, vH));
  if (vScaff > 0.5) c = mix(c, vec3(0.17, 0.09, 0.035), 0.7);
  if (abs(vBid - uSel) < 0.5) c = mix(c, vec3(1.0, 0.58, 0.1), 0.35);
  else if (abs(vBid - uHover) < 0.5) c = c * 1.18;
  diffuseColor.rgb = c;
}
`;

function injectLife(shader, withPatterns) {
  Object.assign(shader.uniforms, U);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + LIFE_VERT_PARS)
    .replace('#include <begin_vertex>', LIFE_VERT)
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  if (!/worldpos_vertex/.test(shader.vertexShader)) shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  if (withPatterns) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PAT_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + PAT_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = pRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = pMetal;');
  } else {
    // depth material: only the arcade discard
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PAT_FRAG_PARS)
      .replace('void main() {', 'void main() {\n  if (int(vPat + 0.5) == 4 && archOpen(vPUv) > 0.5) discard;');
  }
}

export function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (s) => injectLife(s, true);
  m.customProgramCacheKey = () => 'orbis-bld-v1';
  return m;
}
export function buildingDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => injectLife(s, false);
  m.customProgramCacheKey = () => 'orbis-bld-depth-v1';
  return m;
}

// picking: encodes building index + 1 into rgb
export function buildingPickMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: LIFE_VERT_PARS + `
void main() {
  ${LIFE_VERT}
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWPos, 1.0);
}`,
    fragmentShader: `precision highp float;\n` + PAT_FRAG_PARS + `
void main() {
  if (int(vPat + 0.5) == 4 && archOpen(vPUv) > 0.5) discard;
  float id = vBid + 1.0;
  gl_FragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
}`,
  });
}
export const blackPickMaterial = () => new THREE.MeshBasicMaterial({ color: 0x000000 });

// building data texture: 2 texels per building
export function makeBuildingTexture(list) {
  const W = 1024;
  const n = list.length * 2;
  const H = Math.max(1, Math.ceil(n / W));
  const data = new Float32Array(W * H * 4);
  list.forEach((b, i) => {
    const o = i * 8;
    data[o] = b.from; data[o + 1] = b.to; data[o + 2] = b.begun; data[o + 3] = 0;
    data[o + 4] = b.baseY; data[o + 5] = b.height; data[o + 6] = 0; data[o + 7] = 0;
  });
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  U.uBld.value = t; U.uBldW.value = W;
  return t;
}
