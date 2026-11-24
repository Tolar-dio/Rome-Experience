// Glue between the atlas app and the 3D city: lazy loading, the 3D toolbar, year sync, selection.
import { D } from '../data.js';
import { S, on, emit, select, setYear, writeHash, readHash } from '../state.js';
import { esc, fmtYear } from '../util.js';

let city3d = null, loading = null, open = false;
const $ = (id) => document.getElementById(id);

export const VIEWS = [
  { id: 'forum', n: 'Forum Romanum', x: 0, z: 0, d: 420, az: 2.4, p: 0.62 },
  { id: 'capitol', n: 'Capitol from the Forum', x: -120, z: -40, d: 380, az: 2.0, p: 0.45 },
  { id: 'palatine', n: 'Palatine', x: 120, z: 330, d: 650, az: 1.0, p: 0.6 },
  { id: 'colosseum', n: 'Colosseum valley', x: 560, z: 280, d: 560, az: 3.6, p: 0.5 },
  { id: 'circus', n: 'Circus Maximus', x: 40, z: 700, d: 900, az: 0.6, p: 0.5 },
  { id: 'campus', n: 'Campus Martius', x: -720, z: -720, d: 1300, az: 2.6, p: 0.62 },
  { id: 'fora', n: 'Imperial Fora', x: 30, z: -310, d: 520, az: 3.9, p: 0.62 },
  { id: 'aventine', n: 'Aventine and Emporium', x: -380, z: 1250, d: 1100, az: 0.3, p: 0.55 },
  { id: 'trastevere', n: 'Trastevere and the Island', x: -900, z: 300, d: 1100, az: 4.6, p: 0.55 },
  { id: 'vatican', n: 'Vatican plain', x: -2650, z: -1050, d: 1300, az: 1.6, p: 0.55 },
  { id: 'esquiline', n: 'Esquiline and the gardens', x: 1600, z: -900, d: 1600, az: 3.6, p: 0.6 },
  { id: 'overview', n: 'The whole city', x: 300, z: 0, d: 6200, az: 2.3, p: 0.85 },
];

export function isCityOpen() { return open; }
export function getCity() { return city3d; }

async function ensure() {
  if (city3d) return city3d;
  if (loading) return loading;
  const host = $('city3d');
  const boot = host.querySelector('.c3d-boot');
  boot.hidden = false;
  loading = (async () => {
    const mod = await import('./city3d.js');
    const c = new mod.City3D(host.querySelector('.c3d-view'), {
      year: S.year,
      onSelect: (rec) => {
        if (!rec) return;
        if (rec.kind === 'fabric') { showFabric(rec); return; }
        const id = rec.rec.id;
        const k = { building: 'building', street: 'street', wall: 'wall', gate: 'gate', aqueduct: 'aqueduct' }[rec.kind];
        if (k && D.byKind[k]?.has(id)) select(k, id);
      },
      onSelectEvent: (ev) => select('cityevent', ev.id),
      onSelectPlace: (p) => select('cityplace', p.id),
    });
    await c.load((msg, f) => { boot.querySelector('.msg').textContent = msg; boot.querySelector('.bar i').style.width = Math.round(f * 100) + '%'; });
    registerCity(c.city);
    fetch('data/city/city_text.json').then((r) => r.json()).then((t) => { D.cityText = t; emit('cityText'); }).catch(() => {});
    boot.hidden = true;
    city3d = c;
    window.orbis && (window.orbis.city = c);
    return c;
  })();
  return loading;
}

function registerCity(city) {
  const put = (k, arr, nameKey = 'n') => { D.byKind[k] = new Map(); for (const o of arr) if (o && o.id) { o.name = o.name || o[nameKey] || o.ti; D.byKind[k].set(o.id, o); } };
  put('building', city.buildings);
  put('street', city.streets); put('wall', city.walls); put('gate', city.gates); put('aqueduct', city.aqueducts);
  put('cityevent', city.events, 'ti'); put('cityplace', city.places); put('cityregion', city.regions);
  D.city = city;
  D.cityByMonument = new Map();
  for (const b of city.buildings) { const k = b.m || b.id; if (!D.cityByMonument.has(k)) D.cityByMonument.set(k, []); D.cityByMonument.get(k).push(b); }
  D.cityEventsByMonument = new Map();
  for (const e of city.events) if (e.m) { if (!D.cityEventsByMonument.has(e.m)) D.cityEventsByMonument.set(e.m, []); D.cityEventsByMonument.get(e.m).push(e); }
  emit('cityLoaded');
}

export async function openCity(focus) {
  const app = $('app');
  open = true;
  app.classList.add('city-mode');
  $('city3d').hidden = false;
  $('city3dBtn')?.classList.add('on');
  const c = await ensure().catch((e) => { console.error(e); $('city3d').querySelector('.c3d-boot .msg').textContent = 'The 3D city could not be loaded: ' + e.message; return null; });
  if (!c || !open) return;
  c.setActive(true);
  c.setYear(S.year);
  renderToolbar();
  if (focus) focusOn(focus);
  emit('cityMode', true);
  S.cityMode = true; writeHash();
  const h = readHash();
  if (h.selected && !S.selected && D.byKind[h.selected.kind]?.has(h.selected.id)) select(h.selected.kind, h.selected.id);
  else if (S.selected && ['building', 'cityevent', 'cityplace', 'street', 'wall', 'gate', 'aqueduct'].includes(S.selected.kind)) select(S.selected.kind, S.selected.id);
}

export function closeCity() {
  open = false;
  $('app').classList.remove('city-mode');
  $('city3d').hidden = true;
  $('city3dBtn')?.classList.remove('on');
  if (city3d) { if (city3d.walk) city3d.setWalk(false); city3d.setActive(false); }
  S.cityMode = false; writeHash();
  emit('cityMode', false);
  setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
}

export function focusOn(f) {
  const c = city3d; if (!c) return;
  if (typeof f === 'string') {
    const v = VIEWS.find((x) => x.id === f);
    if (v) return c.flyTo({ x: v.x, z: v.z }, v.d, { azimuth: v.az, pitch: v.p, dur: 1.8 });
    const i = c.versionFor(f, S.year);
    if (i >= 0) return c.focusRecord(i);
  } else if (f && f.x !== undefined) c.focusXZ(f.x, f.z, f.d || 260);
}

function showFabric(rec) {
  const box = $('c3dInfo');
  box.hidden = false;
  box.innerHTML = `<button class="x" aria-label="Close">×</button><b>${esc(rec.label)}</b><br><span class="muted">${Math.round(rec.w)} × ${Math.round(rec.l)} m, about ${Math.round(rec.h)} m high. Standing ${esc(fmtYear(rec.from))} to ${rec.to > 2000 ? 'after 641' : esc(fmtYear(rec.to))}.</span><p>Ordinary housing is not individually documented. This block was generated from the zone's housing type and density in this period (Regionary Catalogue counts, excavated insulae at Rome and Ostia, the Marble Plan), placed along the known streets. Treat it as a plausible texture of the city, not as a record.</p>`;
  box.querySelector('.x').onclick = () => { box.hidden = true; };
}

function renderToolbar() {
  const tb = $('c3dBar');
  const c = city3d;
  const L = c.layers;
  tb.innerHTML = `
    <button class="chip" data-a="exit" title="Back to the atlas map">Atlas map</button>
    <select class="chip" data-a="view" aria-label="Viewpoints"><option value="">Go to…</option>${VIEWS.map((v) => `<option value="${v.id}">${esc(v.n)}</option>`).join('')}</select>
    <button class="chip ${c.walk ? 'on' : ''}" data-a="walk" title="Walk at street level (WASD or arrows, drag to look, Shift to run, Esc to stop)">Walk</button>
    <span class="c3d-sep"></span>
    <button class="chip ${L.labels ? 'on' : ''}" data-l="labels">Names</button>
    <button class="chip ${L.events ? 'on' : ''}" data-l="events">Events</button>
    <select class="chip" data-a="win" aria-label="Event window" title="Which events to pin"><option value="0" ${c.eventWindow === 0 ? 'selected' : ''}>this year</option><option value="5" ${c.eventWindow === 5 ? 'selected' : ''}>±5 years</option><option value="25" ${c.eventWindow === 25 ? 'selected' : ''}>±25 years</option><option value="100" ${c.eventWindow === 100 ? 'selected' : ''}>±100 years</option></select>
    <button class="chip ${L.places ? 'on' : ''}" data-l="places">Daily life</button>
    <button class="chip ${L.fabric ? 'on' : ''}" data-l="fabric" title="Generated housing">Housing</button>
    <button class="chip ${L.shadows ? 'on' : ''}" data-l="shadows">Shadows</button>
    <label class="c3d-sun" title="Time of day">☀ <input type="range" min="6" max="19.5" step="0.25" value="${c.sunHour}" data-a="sun" aria-label="Time of day"></label>`;
  tb.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'exit') closeCity();
    else if (b.dataset.a === 'walk') { c.setWalk(!c.walk); renderToolbar(); $('c3dHint').hidden = !c.walk; }
    else if (b.dataset.l) { c.setLayer(b.dataset.l, !c.layers[b.dataset.l]); renderToolbar(); }
  };
  tb.onchange = (e) => {
    const t = e.target;
    if (t.dataset.a === 'view' && t.value) { focusOn(t.value); t.value = ''; }
    if (t.dataset.a === 'win') { c.eventWindow = +t.value; c.refreshLabels = true; c.dirty = true; }
  };
  tb.oninput = (e) => { if (e.target.dataset.a === 'sun') c.setSun(+e.target.value); };
}

export function initCityMount() {
  on('year', () => { if (open && city3d) city3d.setYear(S.year); });
  on('select', (sel) => {
    if (!open || !city3d || !sel) return;
    const c = city3d;
    if (sel.kind === 'building' || sel.kind === 'monument') {
      const i = c.versionFor(sel.id, S.year);
      if (i >= 0 && sel.fly !== false) { /* highlight only; flying is explicit */ c.world && (c.dirty = true); }
    }
  });
  $('city3dBtn')?.addEventListener('click', () => (open ? closeCity() : openCity()));
  if (/city=1/.test(location.hash)) setTimeout(() => openCity(), 300);
}

// helpers for the side panel and the detail drawer
export function cityYear(y) {
  const c = D.city; if (!c) return null;
  const ev = c.events.filter((e) => e.y === y);
  const begun = c.buildings.filter((b) => b.b === y && b.b < b.f && !b.water);
  const done = c.buildings.filter((b) => b.f === y && !b.water);
  const gone = c.buildings.filter((b) => b.t === y - 1 && !b.water);
  const standing = c.buildings.filter((b) => y >= b.f && y <= b.t && !b.water).length;
  return { ev, begun, done, gone, standing };
}
