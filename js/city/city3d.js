// The 3D city of Rome: scene, camera, controls, loading, picking, labels, walk mode.
import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { Terrain, waterMesh, TERRAIN_U } from './terrain.js';
import { buildWorld } from './world.js';
import { U, blackPickMaterial } from './materials.js';
import { buildFabric } from './fabric.js';

const ORIGIN = [12.4853, 41.8925];
const PHI = ORIGIN[1] * Math.PI / 180;
const M_LAT = 111132.92 - 559.82 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
const M_LON = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI);
export const toLocal = (lon, lat) => [(lon - ORIGIN[0]) * M_LON, -(lat - ORIGIN[1]) * M_LAT];
export const toLonLat = (x, z) => [ORIGIN[0] + x / M_LON, ORIGIN[1] - z / M_LAT];

async function bin(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }
async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

const MOBILE = matchMedia('(max-width: 760px), (pointer: coarse)').matches;

export class City3D {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.year = opts.year ?? 100;
    this.active = false;
    this.dirty = true;
    this.layers = { labels: true, events: true, places: false, fabric: true, regions: false, streets: true, shadows: !MOBILE };
    this.eventWindow = 0;
    this.sunHour = 15.5;
  }

  async load(progress = () => {}) {
    progress('Surveying the ground', 0.05);
    const city = await json('data/city/city.json');
    this.city = city;
    const tm = city.meta.terrain;
    const [tb, lb] = await Promise.all([bin('data/city/terrain.bin'), bin('data/city/terrain_layers.bin').catch(() => null)]);
    this.terrain = new Terrain(tm, tb, lb);
    this.terrain.applyYear(this.year);
    this.terrain.build();
    progress('Raising the buildings', 0.25);
    await new Promise((r) => setTimeout(r, 0));
    this.world = buildWorld(city, this.terrain, (f) => progress('Raising the buildings', 0.25 + f * 0.5));
    progress('Filling the streets', 0.8);
    await new Promise((r) => setTimeout(r, 0));
    this.fabric = await buildFabric(this.terrain).catch((e) => { console.warn('fabric', e); return null; });
    this.ground = await json('data/city/ground.json').catch(() => null);
    this.groundTex = new Map();
    this.initScene();
    this.setYear(this.year, true);
    progress('Ready', 1);
    this.loaded = true;
  }

  initScene() {
    const host = this.host;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2));
    r.setSize(host.clientWidth || 800, host.clientHeight || 600);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.18;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = true;
    host.appendChild(r.domElement);
    r.domElement.className = 'c3d-canvas';

    const scene = this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color(0xcfd6d8);
    scene.fog = new THREE.FogExp2(this.fogColor, 0.000105);
    scene.background = this.fogColor;
    this.sky = skyDome();
    scene.add(this.sky);
    // image-based light from the sky so metals and marble read correctly
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const envSky = skyDome(); envSky.scale.setScalar(0.01); envScene.add(envSky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(250, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a7d63 }));
    ground.position.y = -20; envScene.add(ground);
    this.envSky = envSky; this.pmrem = pm; this.envScene = envScene;
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.55;

    const cam = this.camera = new THREE.PerspectiveCamera(42, (host.clientWidth || 800) / (host.clientHeight || 600), 2, 40000);
    cam.position.set(900, 950, 1500);
    const ctl = this.controls = new OrbitControls(cam, r.domElement);
    ctl.target.set(0, 20, 0);
    ctl.enableDamping = true; ctl.dampingFactor = 0.12;
    ctl.screenSpacePanning = false;
    ctl.maxPolarAngle = Math.PI * 0.49;
    ctl.minDistance = 25; ctl.maxDistance = 9000;
    ctl.zoomSpeed = 1.1; ctl.rotateSpeed = 0.55; ctl.panSpeed = 1;
    ctl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    ctl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    ctl.addEventListener('change', () => { this.dirty = true; });
    ctl.update();

    const hemi = this.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x9a8a6c, 0.75);
    scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.castShadow = true;
    const sm = MOBILE ? 2048 : 4096;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 6000;
    scene.add(sun); scene.add(sun.target);
    this.setSun(this.sunHour);

    scene.add(this.terrain.group);
    this.water = waterMesh(this.terrain.meta);
    scene.add(this.water);
    for (const m of this.world.meshes) scene.add(m);
    if (this.fabric) scene.add(this.fabric.mesh);

    // picking scene shares geometry
    this.pickScene = new THREE.Scene();
    const black = blackPickMaterial();
    for (const c of this.terrain.chunks) { const m = new THREE.Mesh(c.lods[2], black); m.matrixAutoUpdate = false; this.pickScene.add(m); }
    for (const m of this.world.pickMeshes) this.pickScene.add(m);
    if (this.fabric) this.pickScene.add(this.fabric.pickMesh);
    this.pickTarget = new THREE.WebGLRenderTarget(1, 1);
    this.pickBuf = new Uint8Array(4);

    // overlays
    this.labelLayer = document.createElement('div'); this.labelLayer.className = 'c3d-labels'; host.appendChild(this.labelLayer);
    this.tip = document.createElement('div'); this.tip.className = 'c3d-tip'; this.tip.hidden = true; host.appendChild(this.tip);
    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
  }

  setSun(hour) {
    this.sunHour = hour;
    // simple solar path for Rome (lat 41.9) around the equinox-to-summer average
    const t = (hour - 12) / 12 * Math.PI; // -pi..pi
    const elev = Math.max(0.06, Math.cos(t) * 1.05 - 0.15) * 0.62 * Math.PI / 2;
    const A = Math.PI + t; // azimuth from north, clockwise: east in the morning, south at noon, west in the evening
    this.sunDir = new THREE.Vector3(Math.sin(A) * Math.cos(elev), Math.sin(elev), -Math.cos(A) * Math.cos(elev)).normalize();
    const warm = 1 - Math.min(1, elev / 0.6);
    this.sun.color.setRGB(1, 0.95 - warm * 0.25, 0.86 - warm * 0.4);
    this.sun.intensity = 1.6 + 2.2 * Math.min(1, elev / 0.5);
    this.hemi.intensity = 0.45 + 0.35 * Math.min(1, elev / 0.5);
    if (this.sky) this.sky.material.uniforms.uSun.value.copy(this.sunDir);
    this.dirty = true;
  }

  updateShadowCam() {
    const ctl = this.controls, cam = this.camera;
    const dist = cam.position.distanceTo(ctl.target);
    const half = Math.max(160, Math.min(2200, dist * 0.9));
    const s = this.sun.shadow.camera;
    if (Math.abs(s.right - half) > half * 0.15 || !this._shTarget || this._shTarget.distanceTo(ctl.target) > half * 0.2) {
      s.left = -half; s.right = half; s.top = half; s.bottom = -half; s.updateProjectionMatrix();
      this._shTarget = ctl.target.clone();
      this.sun.target.position.copy(ctl.target);
      this.sun.position.copy(ctl.target).addScaledVector(this.sunDir, 2500);
      this.sun.target.updateMatrixWorld();
    }
  }

  resize() {
    if (!this.renderer) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  setActive(on) {
    this.active = on;
    if (on && this.renderer) { this.resize(); this.dirty = true; if (!this._raf) this._raf = requestAnimationFrame(this.loop); }
  }

  setYear(y, force) {
    if (y === this.year && !force) return;
    this.year = y;
    U.uYear.value = y;
    if (this.terrain && this.terrain.applyYear(y)) { /* ground moved */ }
    if (this.fabric) this.fabric.setYear(y);
    this.updateGround(y);
    this.refreshLabels = true;
    this.dirty = true;
  }

  updateGround(y) {
    const g = this.ground; if (!g || !g.snapshots.length) return;
    let best = g.snapshots[0];
    for (const sn of g.snapshots) if (Math.abs(sn.y - y) < Math.abs(best.y - y)) best = sn;
    if (this._groundY === best.y) return;
    this._groundY = best.y;
    let t = this.groundTex.get(best.f);
    const apply = (tex) => { if (this._groundY !== best.y) return; TERRAIN_U.uGround.value = tex; TERRAIN_U.uGroundOn.value = 1; TERRAIN_U.uGroundBox.value.set(g.x0, g.z0, g.extent, g.extent); this.dirty = true; };
    if (t) return apply(t);
    new THREE.TextureLoader().load('data/city/' + best.f, (tex) => { tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; this.groundTex.set(best.f, tex); apply(tex); });
  }

  setLayer(k, v) {
    this.layers[k] = v;
    if (k === 'fabric' && this.fabric) this.fabric.mesh.visible = v;
    if (k === 'shadows' && this.renderer) { this.sun.castShadow = v; }
    this.refreshLabels = true; this.dirty = true;
  }

  loop() {
    this._raf = null;
    if (!this.active) return;
    this._raf = requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();
    if (this.walk) this.walkStep(dt);
    else if (this.fly) this.flyStep(dt);
    const moved = this.controls.enabled ? this.controls.update() : false;
    if (!this.walk) this.keepAboveGround();
    if (moved) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.terrain.updateLOD(this.camera);
    this.updateShadowCam();
    U.uTime.value = performance.now() / 1000;
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  keepAboveGround() {
    const c = this.camera.position, g = this.terrain.heightAt(c.x, c.z);
    if (c.y < g + 6) { c.y = g + 6; }
    const t = this.controls.target, gt = this.terrain.heightAt(t.x, t.z);
    if (Math.abs(t.y - gt) > 0.5 && !this._dragging) t.y += (gt - t.y) * 0.25;
  }

  // ------------------------------------------------------------- picking
  pick(cx, cy) {
    const r = this.renderer, cam = this.camera;
    const rect = r.domElement.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    const w = rect.width, h = rect.height;
    cam.setViewOffset(w, h, x * 1, y * 1, 1, 1);
    r.setRenderTarget(this.pickTarget);
    const prevClear = r.getClearColor(new THREE.Color()); const prevA = r.getClearAlpha();
    r.setClearColor(0x000000, 1);
    r.render(this.pickScene, cam);
    r.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickBuf);
    r.setRenderTarget(null);
    r.setClearColor(prevClear, prevA);
    cam.clearViewOffset();
    const id = this.pickBuf[0] + this.pickBuf[1] * 256 + this.pickBuf[2] * 65536 - 1;
    return id;
  }
  recordAt(id) {
    if (id < 0) return null;
    if (id >= 16000000 && this.fabric) return this.fabric.record(id - 16000000);
    return this.world.records[id] || null;
  }

  groundPoint(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let t = 0;
    for (let i = 0; i < 400; i++) { const p = o.clone().addScaledVector(d, t); if (p.y < this.terrain.heightAt(p.x, p.z)) return p; t += Math.max(2, t * 0.02); }
    return null;
  }

  bindInput() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; this._dragging = true; });
    el.addEventListener('pointerup', (e) => {
      this._dragging = false;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 5 && performance.now() - down.t < 600 && !this.walk) {
        const id = this.pick(e.clientX, e.clientY);
        const rec = this.recordAt(id);
        if (rec) { U.uSel.value = id; this.dirty = true; this.opts.onSelect && this.opts.onSelect(rec, id); }
        else { U.uSel.value = -1; this.dirty = true; this.opts.onSelect && this.opts.onSelect(null); }
      }
      down = null;
    });
    el.addEventListener('dblclick', (e) => {
      const p = this.groundPoint(e.clientX, e.clientY);
      if (p) this.flyTo(p, Math.max(80, this.camera.position.distanceTo(this.controls.target) * 0.45));
    });
    let hoverT = 0;
    el.addEventListener('pointermove', (e) => {
      if (this._dragging || this.walk) { this.tip.hidden = true; return; }
      const now = performance.now();
      if (now - hoverT < 90) return;
      hoverT = now;
      const id = this.pick(e.clientX, e.clientY);
      const rec = this.recordAt(id);
      if (id !== U.uHover.value) { U.uHover.value = rec ? id : -1; this.dirty = true; }
      if (rec) {
        const r = this.host.getBoundingClientRect();
        this.tip.hidden = false;
        this.tip.textContent = recName(rec, this.year);
        this.tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 12}px)`;
        el.style.cursor = 'pointer';
      } else { this.tip.hidden = true; el.style.cursor = ''; }
    });
    el.addEventListener('pointerleave', () => { this.tip.hidden = true; if (U.uHover.value !== -1) { U.uHover.value = -1; this.dirty = true; } });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  // ------------------------------------------------------------- camera moves
  flyTo(target, dist, opts = {}) {
    const ctl = this.controls;
    const to = new THREE.Vector3(target.x, target.y ?? this.terrain.heightAt(target.x, target.z), target.z);
    const dir = this.camera.position.clone().sub(ctl.target).normalize();
    if (opts.pitch != null) { const az = Math.atan2(dir.x, dir.z); const p = opts.pitch; dir.set(Math.sin(az) * Math.cos(p), Math.sin(p), Math.cos(az) * Math.cos(p)); }
    if (opts.azimuth != null) { const p = Math.asin(dir.y); dir.set(Math.sin(opts.azimuth) * Math.cos(p), Math.sin(p), Math.cos(opts.azimuth) * Math.cos(p)); }
    const camTo = to.clone().addScaledVector(dir, dist);
    this.fly = { t: 0, dur: opts.dur || 1.4, fromT: ctl.target.clone(), toT: to, fromC: this.camera.position.clone(), toC: camTo };
    this.dirty = true;
  }
  flyStep(dt) {
    const f = this.fly;
    f.t += dt / f.dur;
    const k = f.t >= 1 ? 1 : 0.5 - Math.cos(Math.PI * f.t) / 2;
    this.controls.target.lerpVectors(f.fromT, f.toT, k);
    const mid = f.fromC.clone().lerp(f.toC, k);
    const lift = Math.sin(Math.PI * k) * Math.min(800, f.fromC.distanceTo(f.toC) * 0.25);
    mid.y += lift;
    this.camera.position.copy(mid);
    this.dirty = true;
    if (f.t >= 1) this.fly = null;
  }
  focusRecord(i) {
    const e = this.world.records[i];
    if (!e) return;
    const b = e.rec;
    const x = b.x ?? (b.ln ? b.ln[Math.floor(b.ln.length / 2)][0] : 0), z = b.z ?? (b.ln ? b.ln[Math.floor(b.ln.length / 2)][1] : 0);
    const size = Math.max(b.w || 30, b.l || 30, 40);
    U.uSel.value = i;
    this.flyTo({ x, z, y: (b.y ?? this.terrain.heightAt(x, z)) + (b.h || 10) * 0.3 }, Math.min(2500, size * 2.4 + 60), { pitch: 0.55 });
  }
  focusXZ(x, z, dist = 260) { this.flyTo({ x, z }, dist, { pitch: 0.6 }); }

  // ------------------------------------------------------------- walk mode
  setWalk(on) {
    this.walk = on;
    this.controls.enabled = !on;
    if (on) {
      const t = this.controls.target;
      const c = this.camera.position;
      const dir = new THREE.Vector3(t.x - c.x, 0, t.z - c.z).normalize();
      this.walkState = { yaw: Math.atan2(-dir.x, -dir.z), pitch: 0, keys: {}, speed: 6 };
      c.set(t.x, this.terrain.heightAt(t.x, t.z) + 1.7, t.z);
      this.camera.near = 0.3; this.camera.updateProjectionMatrix();
      this.bindWalkPointer(true);
    } else {
      this.camera.near = 2; this.camera.updateProjectionMatrix();
      const c = this.camera.position;
      const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
      this.controls.target.set(c.x + f.x * 60, this.terrain.heightAt(c.x + f.x * 60, c.z + f.z * 60), c.z + f.z * 60);
      c.y += 120; c.x -= f.x * 120; c.z -= f.z * 120;
      this.bindWalkPointer(false);
    }
    this.dirty = true;
  }
  bindWalkPointer(on) {
    const el = this.renderer.domElement;
    if (on) {
      let last = null;
      this._wd = (e) => { last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); };
      this._wm = (e) => { if (!last) return; const ws = this.walkState; ws.yaw -= (e.clientX - last.x) * 0.004; ws.pitch = Math.max(-1.2, Math.min(1.2, ws.pitch - (e.clientY - last.y) * 0.004)); last = { x: e.clientX, y: e.clientY }; this.dirty = true; };
      this._wu = () => { last = null; };
      el.addEventListener('pointerdown', this._wd); el.addEventListener('pointermove', this._wm); el.addEventListener('pointerup', this._wu);
    } else if (this._wd) {
      el.removeEventListener('pointerdown', this._wd); el.removeEventListener('pointermove', this._wm); el.removeEventListener('pointerup', this._wu);
    }
  }
  onKey(e, down) {
    if (!this.active || !this.walk) return;
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) { this.walkState.keys[k] = down; e.preventDefault(); e.stopPropagation(); }
    if (k === 'escape' && down) this.setWalk(false);
  }
  walkStep(dt) {
    const ws = this.walkState, K = ws.keys;
    const sp = (K.shift ? 22 : 6) * dt;
    let fx = 0, fz = 0;
    const sx = Math.sin(ws.yaw), cz = Math.cos(ws.yaw);
    if (K.w || K.arrowup) { fx -= sx; fz -= cz; }
    if (K.s || K.arrowdown) { fx += sx; fz += cz; }
    if (K.a) { fx -= cz; fz += sx; }
    if (K.d) { fx += cz; fz -= sx; }
    if (K.arrowleft || K.q) ws.yaw += 1.6 * dt;
    if (K.arrowright || K.e) ws.yaw -= 1.6 * dt;
    const c = this.camera.position;
    if (fx || fz) { const L = Math.hypot(fx, fz); c.x += fx / L * sp; c.z += fz / L * sp; }
    const g = this.terrain.heightAt(c.x, c.z) + 1.7;
    c.y += (g - c.y) * Math.min(1, dt * 10);
    this.camera.rotation.set(ws.pitch, ws.yaw, 0, 'YXZ');
    if (fx || fz || K.arrowleft || K.arrowright || K.q || K.e || Math.abs(g - c.y) > 0.01) this.dirty = true;
  }

  // ------------------------------------------------------------- labels and pins
  updateLabels() {
    if (!this.labelLayer) return;
    const cam = this.camera, w = this.host.clientWidth, h = this.host.clientHeight;
    const y = this.year;
    if (this.refreshLabels) {
      this.refreshLabels = false;
      const items = [];
      if (this.layers.labels) {
        for (const r of this.world.records) {
          if (r.kind !== 'building') continue;
          const b = r.rec;
          if (b.water || r.ruin) continue;
          if (!(y >= b.b && y <= b.t)) continue;
          items.push({ type: 'bld', imp: b.imp || 2, x: b.x, z: b.z, yy: b.y + b.h + 4, text: b.n, i: r.i ?? this.world.records.indexOf(r), building: b, under: y < b.f });
        }
        for (const g of this.city.hills || []) items.push({ type: 'hill', imp: 6, x: g.x, z: g.z, yy: this.terrain.heightAt(g.x, g.z) + 30, text: g.n });
      }
      if (this.layers.events) {
        const W = this.eventWindow;
        for (const ev of this.city.events) {
          if (ev.y < y - W || ev.y > y + W) continue;
          items.push({ type: 'event', imp: 7, x: ev.x, z: ev.z, yy: this.terrain.heightAt(ev.x, ev.z) + 3, text: ev.ti, ev });
        }
      }
      if (this.layers.places) for (const p of this.city.places || []) { if (y >= p.f && y <= p.t) items.push({ type: 'place', imp: 1, x: p.x, z: p.z, yy: this.terrain.heightAt(p.x, p.z) + 4, text: p.n, place: p }); }
      // index records for label clicks
      this.labelItems = items;
      this.labelLayer.textContent = '';
      for (const it of items) {
        const d = document.createElement('div');
        d.className = 'c3d-label t-' + it.type + (it.under ? ' under' : '');
        if (it.type === 'event') {
          d.innerHTML = `<span class="pin"></span><span class="tx"></span>`;
          d.querySelector('.tx').textContent = it.text;
          d.title = it.text;
        } else d.textContent = it.text + (it.under ? ' (building)' : '');
        d.onclick = (e) => { e.stopPropagation(); this.onLabelClick(it); };
        it.el = d;
        this.labelLayer.appendChild(d);
      }
    }
    if (!this.labelItems) return;
    const v = new THREE.Vector3();
    const camPos = cam.position;
    const boxes = [];
    const sorted = this.labelItems.slice().sort((a, b) => b.imp - a.imp);
    for (const it of sorted) {
      v.set(it.x, it.yy, it.z);
      const dist = camPos.distanceTo(v);
      const maxD = it.type === 'event' ? 6000 : it.type === 'hill' ? 9000 : it.imp >= 5 ? 4200 : it.imp >= 4 ? 2600 : it.imp >= 3 ? 1300 : 650;
      v.project(cam);
      if (v.z > 1 || dist > maxD || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { it.el.style.display = 'none'; continue; }
      const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
      const bw = Math.min(220, it.text.length * 6.5 + 16), bh = 18;
      const bx = { x0: sx - bw / 2, x1: sx + bw / 2, y0: sy - bh, y1: sy };
      if (it.type !== 'event' && boxes.some((o) => !(bx.x1 < o.x0 || bx.x0 > o.x1 || bx.y1 < o.y0 || bx.y0 > o.y1))) { it.el.style.display = 'none'; continue; }
      boxes.push(bx);
      it.el.style.display = '';
      it.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
  onLabelClick(it) {
    if (it.type === 'bld') { const i = this.world.records.findIndex((r) => r.rec === it.building && !r.ruin); U.uSel.value = i; this.dirty = true; this.opts.onSelect && this.opts.onSelect(this.world.records[i], i); }
    else if (it.type === 'event') this.opts.onSelectEvent && this.opts.onSelectEvent(it.ev);
    else if (it.type === 'place') this.opts.onSelectPlace && this.opts.onSelectPlace(it.place);
    else if (it.type === 'hill') this.focusXZ(it.x, it.z, 900);
  }

  // the record currently standing for a monument id, if any
  versionFor(monumentOrId, year = this.year) {
    let best = -1;
    this.world.records.forEach((r, i) => {
      if (r.kind !== 'building') return;
      const b = r.rec;
      if (b.id !== monumentOrId && b.m !== monumentOrId) return;
      const alive = year >= b.b && year <= b.t;
      if (alive || best < 0) best = i;
    });
    return best;
  }

  screenshot() { this.dirty = true; this.loop(); return this.renderer.domElement.toDataURL('image/jpeg', 0.9); }
}

export function recName(rec, year) {
  if (!rec) return '';
  if (rec.kind === 'fabric') return rec.label;
  const b = rec.rec;
  let s = b.n || b.id;
  if (rec.kind === 'building' && year < b.f) s += ' (under construction)';
  if (rec.ruin) s += ' (ruined)';
  return s;
}

function skyDome() {
  const g = new THREE.SphereGeometry(30000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(0.4, 0.5, 0.3) } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 uSun;
      void main(){
        float h = clamp(vD.y, -0.1, 1.0);
        vec3 zen = vec3(0.32, 0.50, 0.72), hor = vec3(0.82, 0.85, 0.86), low = vec3(0.78, 0.76, 0.70);
        vec3 c = mix(hor, zen, pow(max(h, 0.0), 0.55));
        c = mix(low, c, smoothstep(-0.08, 0.02, h));
        float s = max(dot(normalize(vD), normalize(uSun)), 0.0);
        c += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.25 + vec3(1.0, 0.95, 0.85) * pow(s, 600.0) * 2.0;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -1; mesh.frustumCulled = false;
  return mesh;
}
