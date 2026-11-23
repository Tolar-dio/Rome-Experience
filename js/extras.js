// Second-pass map layers: provinces, city monuments, mints, hoards, economy/religion/culture sites,
// trade routes, battle heat, the ghost frontier of a comparison year, and life paths.
import { D, controlAt } from './data.js';
import { S, on, select } from './state.js';
import { esc, fmtYear } from './util.js';

let map;
const fc = (features) => ({ type: 'FeatureCollection', features });
const SERIF = ['Spectral Regular'], SERIF_I = ['Spectral Italic'], SERIF_B = ['Spectral SemiBold'], SERIF_BI = ['Spectral SemiBold Italic'];
export const MON_COLORS = {
  temple: '#8C3460', forum: '#B48A3C', basilica: '#7A5A1E', entertainment: '#B03A2E', baths: '#2E6B8A', palace: '#6B2346',
  tomb: '#5A4E45', arch: '#A0705A', column: '#A0705A', aqueduct: '#2E6B8A', bridge: '#5E4632', wall: '#3B0E0E', gate: '#3B0E0E',
  church: '#46416A', harbour: '#1E3B4E', market: '#8A6A2E', other: '#7D7468',
};
const THEME = { economy: '#8A6A2E', religion: '#5D3C6E', culture: '#2E6B8A' };

export const EXTRA_CLICKABLE = ['province-labels', 'monuments', 'mon-foot', 'mints', 'hoards', 'sites', 'routes'];

export function initExtras(m) {
  map = m;
  const add = (id, data, extra = {}) => map.addSource(id, { type: 'geojson', data, ...extra });
  add('walls', 'data/geo/walls.json');
  add('provinceLabels', fc([]));
  add('monuments', fc([]));
  add('monFoot', fc([]));
  add('mints', fc([]));
  add('hoards', fc([]));
  add('sites', fc([]));
  add('routes', fc([]));
  add('heat', fc([]));
  add('lifepath', fc([]));
  map.addSource('cityBase', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, minzoom: 10, maxzoom: 16, attribution: 'City base: Esri' });

  const before = map.getLayer('ancient-labels') ? 'ancient-labels' : undefined;
  map.addLayer({ id: 'city-base', type: 'raster', source: 'cityBase', minzoom: 10.5, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 12, 0.55], 'raster-saturation': -1 } }, 'territory');
  map.addLayer({ id: 'heat', type: 'heatmap', source: 'heat', maxzoom: 9, paint: {
    'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'], 0, 0, 1, 1], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 16, 8, 40], 'heatmap-opacity': 0.75,
    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(180,138,60,0.35)', 0.5, 'rgba(176,58,46,0.6)', 1, 'rgba(90,20,20,0.9)'],
  } }, before);
  map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round' }, paint: {
    'line-color': ['match', ['get', 'kind'], 'sea', '#7FB3CF', 'river', '#4C7489', 'caravan', '#C58F5A', '#8A6A2E'], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.4, 8, 3], 'line-dasharray': [3, 2], 'line-opacity': 0.9,
  } }, before);
  map.addLayer({ id: 'routes-label', type: 'symbol', source: 'routes', minzoom: 4, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': SERIF_I, 'text-size': 11.5, 'symbol-spacing': 500 }, paint: { 'text-color': '#F4EFE6', 'text-halo-color': 'rgba(30,59,78,.9)', 'text-halo-width': 1.4 } }, before);
  map.addLayer({ id: 'walls', type: 'line', source: 'walls', minzoom: 10, paint: { 'line-color': '#3B0E0E', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 4], 'line-opacity': 0.8 } });
  map.addLayer({ id: 'mon-foot', type: 'fill', source: 'monFoot', minzoom: 12, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'building'], 0.35, 0.75], 'fill-outline-color': '#2A211C' } });
  map.addLayer({ id: 'monuments', type: 'circle', source: 'monuments', minzoom: 11, paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 8], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#F4EFE6', 'circle-stroke-width': 1.5,
    'circle-opacity': ['case', ['get', 'building'], 0.45, 1],
  } });
  map.addLayer({ id: 'monuments-label', type: 'symbol', source: 'monuments', minzoom: 12.5, layout: {
    'text-field': ['get', 'name'], 'text-font': SERIF, 'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 11, 16, 14], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.8, 'text-max-width': 9, 'text-optional': true,
  }, paint: { 'text-color': '#2A211C', 'text-halo-color': 'rgba(244,239,230,.92)', 'text-halo-width': 1.5 } });
  map.addLayer({ id: 'sites', type: 'circle', source: 'sites', minzoom: 3.5, paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3.5, 2.6, 9, 6], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#F4EFE6', 'circle-stroke-width': 1.2,
    'circle-opacity': ['case', ['get', 'fresh'], 1, 0.85],
  } });
  map.addLayer({ id: 'sites-new', type: 'circle', source: 'sites', filter: ['get', 'fresh'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3.5, 9, 9, 16], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'sites-label', type: 'symbol', source: 'sites', minzoom: 6, layout: { 'text-field': ['get', 'name'], 'text-font': SERIF_I, 'text-size': 11.5, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': 'rgba(244,239,230,.9)', 'text-halo-width': 1.3 } });
  map.addLayer({ id: 'hoards', type: 'symbol', source: 'hoards', minzoom: 3.5, layout: { 'text-field': '◆', 'text-font': SERIF, 'text-size': 15, 'text-allow-overlap': true }, paint: { 'text-color': '#B48A3C', 'text-halo-color': '#2A211C', 'text-halo-width': 1 } });
  map.addLayer({ id: 'mints', type: 'circle', source: 'mints', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4.5, 8, 8], 'circle-color': '#B48A3C', 'circle-stroke-color': '#2A211C', 'circle-stroke-width': 1.6 } });
  map.addLayer({ id: 'mints-label', type: 'symbol', source: 'mints', layout: { 'text-field': ['get', 'label'], 'text-font': SERIF_B, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#4A3410', 'text-halo-color': 'rgba(244,239,230,.95)', 'text-halo-width': 1.6 } });
  map.addLayer({ id: 'province-labels', type: 'symbol', source: 'provinceLabels', layout: {
    'text-field': ['get', 'name'], 'text-font': ['case', ['==', ['get', 'type'], 'province'], ['literal', SERIF_I], ['literal', SERIF_BI]],
    'text-size': ['interpolate', ['linear'], ['zoom'], 3, ['match', ['get', 'type'], 'prefecture', 14, 'diocese', 12.5, 10], 7, ['match', ['get', 'type'], 'prefecture', 18, 'diocese', 16, 14]],
    'text-letter-spacing': 0.08, 'text-max-width': 8, 'symbol-sort-key': ['match', ['get', 'type'], 'prefecture', 0, 'diocese', 1, 2], 'text-padding': 3,
  }, paint: { 'text-color': ['match', ['get', 'type'], 'province', '#4A1010', '#1E3B4E'], 'text-halo-color': 'rgba(244,239,230,.85)', 'text-halo-width': 1.6 } });
  map.addLayer({ id: 'lifepath', type: 'line', source: 'lifepath', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#6B2346', 'line-width': 3, 'line-dasharray': [1, 1.5] } });
  map.addLayer({ id: 'lifepath-pts', type: 'circle', source: 'lifepath', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#6B2346', 'circle-stroke-color': '#F4EFE6', 'circle-stroke-width': 1.5 } });
  map.addLayer({ id: 'lifepath-label', type: 'symbol', source: 'lifepath', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 't'], 'text-font': SERIF_I, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 10 }, paint: { 'text-color': '#3B0A0A', 'text-halo-color': 'rgba(244,239,230,.95)', 'text-halo-width': 1.6 } });

  // static data
  map.getSource('mints').setData(fc(D.mints.filter((m) => Array.isArray(m.loc)).map((m) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: m.loc }, properties: { id: m.id, label: `${(m.marks || [])[0] || ''} ${m.name.split(' (')[0]}`.trim() } }))));
  updateExtras(S.year);
  applyExtrasVisibility();
  on('year', (y) => updateExtras(y));
  on('layers', () => { applyExtrasVisibility(); updateExtras(S.year); });

  const clickable = { 'province-labels': 'province', monuments: 'monument', 'mon-foot': 'monument', mints: 'mint', hoards: 'hoard', sites: 'site', routes: 'route' };
  map.on('click', (ev) => {
    const layers = Object.keys(clickable).filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
    const f = map.queryRenderedFeatures(ev.point, { layers })[0];
    if (f) { ev.preventDefault?.(); select(clickable[f.layer.id], f.properties.id, { fromMap: true }); ev.originalEvent._handled = true; }
  });
  for (const l of Object.keys(clickable)) {
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
  }
}

const active = (from, to, y) => (from ?? -9999) <= y && (to ?? 9999) >= y;

export function updateExtras(y) {
  if (!map?.getSource('provinceLabels')) return;
  const L = S.layers;
  const pv = L.provinces ? D.provinces.filter((p) => p.labelLoc && active(p.created, p.ended, y)).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p.labelLoc }, properties: { id: p.id, name: p.name, type: p.type || 'province' } })) : [];
  map.getSource('provinceLabels').setData(fc(pv));
  const mons = [], foot = [];
  if (L.monuments) {
    for (const m of D.monuments) {
      const start = m.begun ?? m.built;
      if (start !== undefined && start !== null && start > y) continue;
      if (m.destroyed && m.destroyed < y) continue;
      const building = m.built !== undefined && m.built !== null && m.built > y;
      const color = MON_COLORS[m.type] || MON_COLORS.other;
      if (Array.isArray(m.loc)) mons.push({ type: 'Feature', geometry: { type: 'Point', coordinates: m.loc }, properties: { id: m.id, name: m.name, color, building } });
      if (Array.isArray(m.footprint) && m.footprint.length >= 3) {
        const ring = m.footprint.slice();
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
        foot.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: m.id, color, building } });
      }
    }
  }
  map.getSource('monuments').setData(fc(mons));
  map.getSource('monFoot').setData(fc(foot));
  map.setFilter('mints', L.mints ? ['in', ['get', 'id'], ['literal', D.mints.filter((m) => (m.periods || []).some((p) => p[0] <= y && p[1] >= y)).map((m) => m.id)]] : ['in', ['get', 'id'], ['literal', []]]);
  map.setFilter('mints-label', map.getFilter('mints'));
  map.getSource('hoards').setData(fc(L.hoards ? D.hoards.filter((h) => Array.isArray(h.loc) && (h.deposited ?? -9999) <= y).map((h) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: h.loc }, properties: { id: h.id } })) : []));
  const themes = new Set(['economy', 'religion', 'culture'].filter((t) => L[t]));
  map.getSource('sites').setData(fc(D.sites.filter((s) => themes.has(s.theme) && Array.isArray(s.loc) && active(s.from, s.to, y)).map((s) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: s.loc }, properties: { id: s.id, name: s.name, color: THEME[s.theme] || '#555', fresh: s.from !== undefined && y - s.from >= 0 && y - s.from < 4 },
  }))));
  map.getSource('routes').setData(fc(L.routes ? D.routes.filter((r) => r.line?.length > 1 && active(r.from, r.to, y)).map((r) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.line }, properties: { id: r.id, name: r.name, kind: r.kind } })) : []));
  map.getSource('heat').setData(fc(L.heat ? D.events.filter((e) => e.battle && Array.isArray(e.loc) && e.year <= y && e.year > y - 100).map((e) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: e.loc }, properties: { w: Math.max(0.15, 1 - (y - e.year) / 100) * (0.5 + (e.importance || 2) / 5) } })) : []));
}

export function applyExtrasVisibility() {
  const L = S.layers;
  const vis = (id, v) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
  vis('province-labels', L.provinces);
  ['monuments', 'monuments-label', 'mon-foot', 'walls'].forEach((id) => vis(id, L.monuments));
  vis('city-base', L.cityBase);
  ['mints', 'mints-label'].forEach((id) => vis(id, L.mints));
  vis('hoards', L.hoards);
  ['sites', 'sites-new', 'sites-label'].forEach((id) => vis(id, L.economy || L.religion || L.culture));
  ['routes', 'routes-label'].forEach((id) => vis(id, L.routes));
  vis('heat', L.heat);
}

export function showLifePath(person) {
  const evs = (D.rev.person.get(person.id) || []).filter((e) => Array.isArray(e.loc)).sort((a, b) => a.year - b.year || (a.month || 13) - (b.month || 13));
  const feats = [];
  if (evs.length > 1) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: evs.map((e) => e.loc) }, properties: {} });
  evs.forEach((e) => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: e.loc }, properties: { t: `${fmtYear(e.year)} ${e.title}` } }));
  map.getSource('lifepath').setData(fc(feats));
  return evs;
}
export function clearLifePath() { map?.getSource('lifepath')?.setData(fc([])); }

export function flyToCity(city) {
  const c = city === 'constantinople' ? { center: [28.968, 41.012], zoom: 13.2 } : { center: [12.486, 41.893], zoom: 13.6 };
  S.layers.monuments = true;
  S.layers.cityBase = true;
  applyExtrasVisibility();
  updateExtras(S.year);
  map.flyTo({ ...c, speed: 1.4 });
}
