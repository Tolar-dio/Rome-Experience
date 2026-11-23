// The map: MapLibre style, layers and per-year updates.
import { D, controlAt, lookup } from './data.js';
import { S, on, select, emit } from './state.js';
import { fmtYear, fmtRange, esc, STATUS_LABEL, yearToIdx } from './util.js';

const BASE = new URL('.', location.href).href;
export let map;
const ROMAN = new Set(['rome', 'rome_west', 'rome_east']);
const C = {
  sea: '#1E3B4E', land: '#D3C8AE', ink: '#2A211C', rome: '#B03A2E', romeAlly: '#D27A62', romeClient: '#C99A72',
  contested: '#8F7F78', unsettled: '#C9BFA6', gilt: '#B48A3C', porphyry: '#6B2346',
};
let edgesById = [];
let regionByRid = [];
let lastYear = null;
let hoverRid = null;

export function polityColor(pid) {
  const p = D.polity.get(pid);
  return p?.color || '#9A8F80';
}

export function colorFor(polityIdx, statusName) {
  const p = D.polities[polityIdx];
  if (!p) return C.unsettled;
  if (statusName === 'unsettled') return C.unsettled;
  if (ROMAN.has(p.id) || (p.family === 'roman' && statusName === 'direct')) {
    if (statusName === 'direct' || statusName === 'occupied') return p.id === 'rome_east' ? '#9C2F45' : p.id === 'rome_west' ? '#B84A33' : C.rome;
  }
  if (statusName === 'ally') return mix(p.color, C.romeAlly, ROMAN.has(p.id) ? 1 : 0.35);
  if (statusName === 'client') return mix(p.color, C.romeClient, 0.45);
  if (statusName === 'contested') return mix(p.color, C.contested, 0.5);
  return p.color;
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

function patternImage(kind) {
  const s = 12, ratio = 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s * ratio;
  const x = cv.getContext('2d');
  x.scale(ratio, ratio);
  x.strokeStyle = 'rgba(255,255,255,0.85)';
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.lineWidth = 1.3;
  if (kind === 'hatch') { x.beginPath(); x.moveTo(-3, 3); x.lineTo(3, -3); x.moveTo(0, s); x.lineTo(s, 0); x.moveTo(s - 3, s + 3); x.lineTo(s + 3, s - 3); x.stroke(); }
  if (kind === 'dots') { x.beginPath(); x.arc(3, 3, 1.3, 0, 7); x.arc(9, 9, 1.3, 0, 7); x.fill(); }
  if (kind === 'cross') { x.strokeStyle = 'rgba(40,20,15,0.55)'; x.beginPath(); x.moveTo(0, s); x.lineTo(s, 0); x.moveTo(0, 0); x.lineTo(s, s); x.stroke(); }
  if (kind === 'stripes') { x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 6); x.lineTo(s, 6); x.stroke(); }
  return { width: s * ratio, height: s * ratio, data: x.getImageData(0, 0, s * ratio, s * ratio).data };
}

function iconImage(kind, color = '#2A211C') {
  const s = 26, ratio = 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s * ratio;
  const x = cv.getContext('2d');
  x.scale(ratio, ratio);
  if (kind === 'swords') {
    x.lineCap = 'round';
    const blade = (flip) => {
      x.save(); x.translate(13, 13); x.scale(flip, 1); x.rotate(-Math.PI / 4);
      x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, -10); x.lineTo(0, 9); x.stroke();
      x.strokeStyle = color; x.lineWidth = 2.2; x.beginPath(); x.moveTo(0, -10); x.lineTo(0, 9); x.stroke();
      x.lineWidth = 2.2; x.beginPath(); x.moveTo(-4, 5); x.lineTo(4, 5); x.stroke();
      x.restore();
    };
    blade(1); blade(-1);
  } else if (kind === 'arrow') {
    x.fillStyle = color; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(20, 13); x.lineTo(7, 6.5); x.lineTo(10, 13); x.lineTo(7, 19.5); x.closePath(); x.stroke(); x.fill();
  } else if (kind === 'eagle') { // legion standard: simple aquila on a pole
    x.fillStyle = '#B48A3C'; x.strokeStyle = '#2A211C'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(13, 9); x.lineTo(13, 24); x.stroke();
    x.beginPath(); x.moveTo(13, 4); x.quadraticCurveTo(5, 3, 2, 9); x.quadraticCurveTo(8, 8, 13, 11); x.quadraticCurveTo(18, 8, 24, 9); x.quadraticCurveTo(21, 3, 13, 4); x.closePath(); x.fill(); x.stroke();
  } else if (kind === 'siege') {
    x.strokeStyle = '#fff'; x.lineWidth = 4.5; x.strokeRect(6, 9, 14, 11);
    x.strokeStyle = color; x.lineWidth = 2; x.strokeRect(6, 9, 14, 11);
    x.beginPath(); for (let i = 0; i < 4; i++) { x.moveTo(6 + i * 4.6, 9); x.lineTo(6 + i * 4.6, 5.5); } x.stroke();
  } else if (kind === 'ship') {
    x.strokeStyle = '#fff'; x.lineWidth = 4.5;
    const hull = () => { x.beginPath(); x.moveTo(3, 15); x.lineTo(23, 15); x.lineTo(19, 20); x.lineTo(7, 20); x.closePath(); x.moveTo(13, 15); x.lineTo(13, 4); x.moveTo(13, 5); x.lineTo(20, 11); x.lineTo(13, 11); };
    hull(); x.stroke(); x.strokeStyle = color; x.lineWidth = 2; hull(); x.stroke();
  }
  return { width: s * ratio, height: s * ratio, data: x.getImageData(0, 0, s * ratio, s * ratio).data };
}

const fc = (features) => ({ type: 'FeatureCollection', features });

export async function initMap(onReady) {
  const [regions, edges, regionLabels] = await Promise.all([
    fetch('data/geo/regions.json').then((r) => r.json()),
    fetch('data/geo/region_edges.json').then((r) => r.json()),
    fetch('data/geo/region_labels.json').then((r) => r.json()),
  ]);
  regionByRid = [];
  for (const f of regions.features) {
    const reg = D.byKind.region.get(f.properties.id);
    if (reg) { reg.rid = f.properties.rid; regionByRid[f.properties.rid] = reg; }
  }
  edgesById = edges.features.map((f) => f.properties);
  for (const f of regionLabels.features) {
    const reg = D.byKind.region.get(f.properties.id);
    if (reg) { f.properties.name = reg.name; reg.labelPt = f.geometry.coordinates; }
  }

  map = new maplibregl.Map({
    container: 'map',
    attributionControl: false,
    center: [12.5, 41.9], zoom: 5.2, minZoom: 2.6, maxZoom: 11, renderWorldCopies: false,
    maxBounds: [[-40, -5], [100, 75]],
    dragRotate: false, pitchWithRotate: false,
    style: {
      version: 8,
      glyphs: BASE + 'data/fonts/{fontstack}/{range}.pbf',
      sources: {
        sea: { type: 'geojson', data: 'data/geo/sea.json' },
        land: { type: 'geojson', data: 'data/geo/land.json' },
        relief: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 13, attribution: 'Relief: Esri, USGS' },
        dare: { type: 'raster', tiles: ['https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 3, maxzoom: 11, attribution: '<a href="https://imperium.ahlfeldt.se/">DARE</a> (CC BY), Johan Åhlfeldt' },
        regions: { type: 'geojson', data: regions, promoteId: 'rid' },
        edges: { type: 'geojson', data: edges, promoteId: 'eid' },
        regionLabels: { type: 'geojson', data: regionLabels },
        polityLabels: { type: 'geojson', data: fc([]) },
        lakes: { type: 'geojson', data: 'data/geo/lakes.json' },
        rivers: { type: 'geojson', data: 'data/geo/rivers.json' },
        ancientWater: { type: 'geojson', data: 'data/geo/ancient_water.json' },
        roads: { type: 'geojson', data: 'data/geo/roads.json' },
        namedRoads: { type: 'geojson', data: fc([]) },
        aqueducts: { type: 'geojson', data: 'data/geo/aqueducts.json' },
        frontiers: { type: 'geojson', data: fc([]) },
        ext60: { type: 'geojson', data: 'data/geo/extent_60bc.json' },
        ext117: { type: 'geojson', data: 'data/geo/extent_117.json' },
        ext200: { type: 'geojson', data: 'data/geo/extent_200.json' },
        prov200: { type: 'geojson', data: 'data/geo/provinces_200_lines.json' },
        provDioc: { type: 'geojson', data: 'data/geo/provinces_dioc_lines.json' },
        ancientLabels: { type: 'geojson', data: 'data/geo/labels_regional.json' },
        marine: { type: 'geojson', data: 'data/geo/marine_labels.json' },
        campaigns: { type: 'geojson', data: fc([]), lineMetrics: true },
        events: { type: 'geojson', data: fc([]) },
        cities: { type: 'geojson', data: fc([]) },
        legions: { type: 'geojson', data: fc([]) },
        selection: { type: 'geojson', data: fc([]) },
        march: { type: 'geojson', data: fc([]), lineMetrics: true },
        marchHead: { type: 'geojson', data: fc([]) },
      },
      layers: [],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Natural Earth · <a href="https://awmc.unc.edu/">AWMC</a> (ODbL)' }), 'bottom-right');

  map.on('load', () => {
    for (const k of ['hatch', 'dots', 'cross', 'stripes']) map.addImage('pat-' + k, patternImage(k), { pixelRatio: 2 });
    map.addImage('ic-swords', iconImage('swords'), { pixelRatio: 2 });
    map.addImage('ic-siege', iconImage('siege'), { pixelRatio: 2 });
    map.addImage('ic-ship', iconImage('ship'), { pixelRatio: 2 });
    map.addImage('ic-eagle', iconImage('eagle'), { pixelRatio: 2 });
    map.addImage('ic-arrow', iconImage('arrow', '#2A211C'), { pixelRatio: 2, sdf: false });
    addLayers();
    staticData();
    bindInteractions();
    updateYear(S.year, true);
    applyLayerVisibility();
    onReady?.();
  });
  on('year', (y) => updateYear(y));
  on('layers', () => { applyLayerVisibility(); updateYear(S.year, true); });
  on('select', (sel) => showSelection(sel));
}

const SERIF = ['Spectral Regular'];
const SERIF_I = ['Spectral Italic'];
const SERIF_B = ['Spectral SemiBold'];
const SERIF_BI = ['Spectral SemiBold Italic'];

function addLayers() {
  const L = (l) => map.addLayer(l);
  L({ id: 'bg', type: 'background', paint: { 'background-color': C.sea } });
  L({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': C.land } });
  L({ id: 'relief', type: 'raster', source: 'relief', paint: { 'raster-opacity': 0.55, 'raster-saturation': -1, 'raster-contrast': 0.15, 'raster-brightness-min': 0.12 } });
  L({ id: 'dare', type: 'raster', source: 'dare', paint: { 'raster-opacity': 1 } });
  L({ id: 'sea-mask', type: 'fill', source: 'sea', paint: { 'fill-color': C.sea } });
  L({ id: 'territory', type: 'fill', source: 'regions', paint: {
    'fill-color': ['coalesce', ['feature-state', 'c'], C.unsettled],
    'fill-opacity': ['case', ['==', ['feature-state', 'st'], 'unsettled'], 0.12, ['boolean', ['feature-state', 'hl'], false], 0.88, 0.66],
  } });
  for (const [st, pat] of [['ally', 'hatch'], ['client', 'dots'], ['contested', 'cross'], ['occupied', 'stripes']]) {
    L({ id: 'terr-' + st, type: 'fill', source: 'regions', paint: { 'fill-pattern': 'pat-' + pat, 'fill-opacity': ['case', ['==', ['feature-state', 'st'], st], 0.55, 0] } });
  }
  L({ id: 'ancient-water', type: 'fill', source: 'ancientWater', paint: { 'fill-color': ['match', ['get', 'k'], 'swamp', '#6E8C7E', 'marsh', '#6E8C7E', '#3D6278'], 'fill-opacity': ['match', ['get', 'k'], 'swamp', 0.35, 'marsh', 0.35, 0.85] } });
  L({ id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': '#3D6278' } });
  L({ id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': '#4C7489', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['<=', ['get', 'scalerank'], 3], 1.1, 0.4], 7, ['case', ['<=', ['get', 'scalerank'], 3], 2.4, 1]], 'line-opacity': 0.85 } });
  L({ id: 'borders', type: 'line', source: 'edges', paint: {
    'line-color': ['case', ['boolean', ['feature-state', 'rf'], false], '#5A1414', C.ink],
    'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['boolean', ['feature-state', 'rf'], false], 1.1, ['boolean', ['feature-state', 'd'], false], 0.6, 0.3], 7, ['case', ['boolean', ['feature-state', 'rf'], false], 2.4, ['boolean', ['feature-state', 'd'], false], 1.3, 0.4]],
    'line-opacity': ['case', ['boolean', ['feature-state', 'rf'], false], 0.9, ['boolean', ['feature-state', 'd'], false], 0.55, 0.12],
  } });
  L({ id: 'ext-lines', type: 'line', source: 'ext117', paint: { 'line-color': '#2A211C', 'line-dasharray': [3, 2], 'line-width': 1.2, 'line-opacity': 0.7 } });
  L({ id: 'ext60-lines', type: 'line', source: 'ext60', paint: { 'line-color': '#5A1414', 'line-dasharray': [1, 2], 'line-width': 1.2, 'line-opacity': 0.7 } });
  L({ id: 'ext200-lines', type: 'line', source: 'ext200', paint: { 'line-color': '#1E3B4E', 'line-dasharray': [4, 2], 'line-width': 1, 'line-opacity': 0.7 } });
  L({ id: 'prov-lines', type: 'line', source: 'prov200', paint: { 'line-color': '#5A1414', 'line-width': 0.8, 'line-dasharray': [2, 1.5], 'line-opacity': 0.6 } });
  L({ id: 'prov-dioc', type: 'line', source: 'provDioc', paint: { 'line-color': '#2A3F6A', 'line-width': 0.8, 'line-dasharray': [2, 1.5], 'line-opacity': 0.6 } });
  L({ id: 'roads', type: 'line', source: 'roads', minzoom: 4, paint: { 'line-color': '#5E4632', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['==', ['get', 'major'], 1], 0.6, 0.3], 9, ['case', ['==', ['get', 'major'], 1], 1.8, 0.9]], 'line-opacity': 0.55, 'line-dasharray': ['literal', [1]] } });
  L({ id: 'named-roads', type: 'line', source: 'namedRoads', paint: { 'line-color': '#4A2A14', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.1, 8, 2.6], 'line-opacity': ['case', ['boolean', ['get', 'fresh'], false], 1, 0.7] } });
  L({ id: 'named-roads-label', type: 'symbol', source: 'namedRoads', minzoom: 5, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': SERIF_I, 'text-size': 12, 'text-letter-spacing': 0.05, 'symbol-spacing': 400 }, paint: { 'text-color': '#3A2412', 'text-halo-color': 'rgba(240,232,214,.85)', 'text-halo-width': 1.4 } });
  L({ id: 'aqueducts', type: 'line', source: 'aqueducts', minzoom: 6, paint: { 'line-color': '#2E6B8A', 'line-width': 1.4, 'line-dasharray': [2, 1] } });
  L({ id: 'frontiers-casing', type: 'line', source: 'frontiers', paint: { 'line-color': '#F4EFE6', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 6], 'line-opacity': 0.7 } });
  L({ id: 'frontiers', type: 'line', source: 'frontiers', paint: { 'line-color': ['match', ['get', 'kind'], 'wall', '#3B0E0E', 'earthwork', '#5B2A12', 'river', '#203F70', '#3B0E0E'], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.4, 8, 3.2], } });
  L({ id: 'frontiers-dash', type: 'line', source: 'frontiers', filter: ['!', ['in', ['get', 'kind'], ['literal', ['wall', 'earthwork', 'fossatum', 'ditch']]]], paint: { 'line-color': '#F4EFE6', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1.8], 'line-dasharray': [2, 2] } });
  L({ id: 'frontiers-label', type: 'symbol', source: 'frontiers', minzoom: 4.5, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': SERIF_BI, 'text-size': 12.5, 'symbol-spacing': 500, 'text-offset': [0, -0.9] }, paint: { 'text-color': '#3B0E0E', 'text-halo-color': 'rgba(244,239,230,.9)', 'text-halo-width': 1.5 } });
  L({ id: 'campaign-casing', type: 'line', source: 'campaigns', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F4EFE6', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 8], 'line-opacity': ['*', 0.75, ['get', 'o']] } });
  L({ id: 'campaign-lines', type: 'line', source: 'campaigns', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4.5], 'line-opacity': ['get', 'o'], 'line-dasharray': [2, 1] } });
  L({ id: 'campaign-arrows', type: 'symbol', source: 'campaigns', layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'ic-arrow', 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.9], 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map' }, paint: { 'icon-opacity': ['get', 'o'] } });
  L({ id: 'march-line', type: 'line', source: 'march', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#6B2346', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 7], 'line-opacity': 0.95 } });
  L({ id: 'ancient-labels', type: 'symbol', source: 'ancientLabels', minzoom: 5.2, layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 't'], 'text-font': SERIF_I, 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 9, 15], 'text-letter-spacing': 0.18, 'text-max-angle': 30, 'text-allow-overlap': false }, paint: { 'text-color': 'rgba(42,33,28,.72)', 'text-halo-color': 'rgba(240,232,214,.6)', 'text-halo-width': 1 } });
  L({ id: 'marine', type: 'symbol', source: 'marine', layout: { 'text-field': ['get', 'name'], 'text-font': SERIF_I, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 7, 15], 'text-letter-spacing': 0.25, 'text-max-width': 8 }, paint: { 'text-color': 'rgba(206,221,230,.55)' } });
  L({ id: 'region-labels', type: 'symbol', source: 'regionLabels', minzoom: 4, layout: { 'text-field': ['get', 'name'], 'text-font': SERIF_I, 'text-size': 11.5, 'text-max-width': 7, 'text-padding': 4 }, paint: { 'text-color': 'rgba(42,33,28,.8)', 'text-halo-color': 'rgba(240,232,214,.7)', 'text-halo-width': 1.2 } });
  L({ id: 'cities-dot', type: 'circle', source: 'cities', filter: ['>=', ['get', 'imp'], 1], paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['>=', ['get', 'imp'], 5], 3.6, ['>=', ['get', 'imp'], 4], 2.6, 1.6], 8, ['case', ['>=', ['get', 'imp'], 5], 7, ['>=', ['get', 'imp'], 4], 5, 3.5]],
    'circle-color': ['case', ['get', 'cap'], C.ink, '#F4EFE6'], 'circle-stroke-color': C.ink, 'circle-stroke-width': 1.2,
    'circle-opacity': ['step', ['zoom'], ['case', ['>=', ['get', 'imp'], 4], 1, 0], 4.5, ['case', ['>=', ['get', 'imp'], 3], 1, 0], 6, 1],
    'circle-stroke-opacity': ['step', ['zoom'], ['case', ['>=', ['get', 'imp'], 4], 1, 0], 4.5, ['case', ['>=', ['get', 'imp'], 3], 1, 0], 6, 1],
  } });
  L({ id: 'cities-label', type: 'symbol', source: 'cities', layout: {
    'text-field': ['get', 'label'], 'text-font': ['case', ['>=', ['get', 'imp'], 5], ['literal', SERIF_B], ['literal', SERIF]],
    'text-size': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['>=', ['get', 'imp'], 5], 13, 11], 8, ['case', ['>=', ['get', 'imp'], 5], 17, 14]],
    'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.55, 'text-justify': 'auto',
    'symbol-sort-key': ['-', 10, ['get', 'imp']], 'text-optional': true,
  }, paint: {
    'text-color': C.ink, 'text-halo-color': 'rgba(244,239,230,.88)', 'text-halo-width': 1.5,
    'text-opacity': ['step', ['zoom'], ['case', ['>=', ['get', 'imp'], 5], 1, 0], 4, ['case', ['>=', ['get', 'imp'], 4], 1, 0], 5.2, ['case', ['>=', ['get', 'imp'], 3], 1, 0], 6.5, 1],
  } });
  L({ id: 'polity-labels', type: 'symbol', source: 'polityLabels', layout: {
    'text-field': ['get', 'label'], 'text-font': SERIF_B, 'text-transform': 'uppercase', 'text-letter-spacing': 0.22,
    'text-size': ['interpolate', ['linear'], ['zoom'], 3, ['*', ['get', 'sz'], 0.75], 7, ['*', ['get', 'sz'], 1.5]],
    'text-max-width': 12, 'symbol-sort-key': ['-', 0, ['get', 'sz']], 'text-padding': 2,
  }, paint: { 'text-color': ['case', ['get', 'rome'], '#3B0A0A', 'rgba(42,33,28,.85)'], 'text-halo-color': 'rgba(244,239,230,.75)', 'text-halo-width': 1.6 } });
  L({ id: 'legions', type: 'symbol', source: 'legions', minzoom: 3.8, layout: {
    'icon-image': 'ic-eagle', 'icon-size': 0.8, 'icon-allow-overlap': true, 'text-field': ['get', 'label'], 'text-font': SERIF_B, 'text-size': 11,
    'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true, 'icon-offset': ['get', 'off'],
  }, paint: { 'text-color': '#4A3410', 'text-halo-color': 'rgba(244,239,230,.9)', 'text-halo-width': 1.4 } });
  L({ id: 'events-glow', type: 'circle', source: 'events', filter: ['!', ['get', 'battle']], paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['+', 3, ['get', 'imp']], 8, ['*', 1.8, ['+', 3, ['get', 'imp']]]],
    'circle-color': ['get', 'color'], 'circle-opacity': ['*', 0.9, ['get', 'o']], 'circle-stroke-color': '#F4EFE6', 'circle-stroke-width': 1.6, 'circle-stroke-opacity': ['get', 'o'],
  } });
  L({ id: 'battles', type: 'symbol', source: 'events', filter: ['get', 'battle'], layout: {
    'icon-image': ['match', ['get', 'kind'], 'siege', 'ic-siege', 'naval', 'ic-ship', 'ic-swords'],
    'icon-size': ['interpolate', ['linear'], ['zoom'], 3, ['*', 0.6, ['+', 0.6, ['*', 0.12, ['get', 'imp']]]], 8, ['*', 1.1, ['+', 0.6, ['*', 0.12, ['get', 'imp']]]]],
    'icon-allow-overlap': true, 'symbol-sort-key': ['get', 'imp'],
  }, paint: { 'icon-opacity': ['get', 'o'] } });
  L({ id: 'battle-victor', type: 'circle', source: 'events', filter: ['get', 'battle'], paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['*', 0.6, ['+', 9, ['get', 'imp']]], 8, ['*', 1.1, ['+', 9, ['get', 'imp']]]],
    'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2.4, 'circle-stroke-opacity': ['get', 'o'],
  } });
  L({ id: 'events-label', type: 'symbol', source: 'events', filter: ['>=', ['get', 'o'], 0.99], layout: {
    'text-field': ['get', 'title'], 'text-font': SERIF_BI, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 14],
    'text-variable-anchor': ['top', 'bottom', 'right', 'left'], 'text-radial-offset': 1.25, 'text-max-width': 11, 'text-optional': true,
    'symbol-sort-key': ['-', 10, ['get', 'imp']],
  }, paint: { 'text-color': '#3B0A0A', 'text-halo-color': 'rgba(244,239,230,.92)', 'text-halo-width': 1.6 } });
  L({ id: 'march-head', type: 'circle', source: 'marchHead', paint: { 'circle-radius': 8, 'circle-color': '#6B2346', 'circle-stroke-color': '#F4EFE6', 'circle-stroke-width': 3 } });
  L({ id: 'march-head-label', type: 'symbol', source: 'marchHead', layout: { 'text-field': ['get', 't'], 'text-font': SERIF_B, 'text-size': 14, 'text-offset': [0, -1.6], 'text-anchor': 'bottom', 'text-max-width': 14 }, paint: { 'text-color': '#3B0A0A', 'text-halo-color': 'rgba(244,239,230,.95)', 'text-halo-width': 2 } });
  L({ id: 'sel-ring', type: 'circle', source: 'selection', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 18, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#F4EFE6', 'circle-stroke-width': 3 } });
  L({ id: 'sel-ring2', type: 'circle', source: 'selection', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 18, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': C.porphyry, 'circle-stroke-width': 1.5 } });
  L({ id: 'sel-line', type: 'line', source: 'selection', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#F4EFE6', 'line-width': 7, 'line-opacity': 0.6 } });
}

function staticData() {
  // cities: all places with coordinates
  const cities = D.places.filter((p) => Array.isArray(p.loc)).map((p) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: p.loc },
    properties: {
      id: p.id, label: p.label || p.short || p.name, imp: p.importance || 2, f: p.founded ?? -2000,
      cap: (p.type || []).some((t) => t === 'capital' || t === 'provincial_capital'),
    },
  }));
  map.getSource('cities').setData(fc(cities));
}

// ---- per-year update --------------------------------------------------------
export function updateYear(y, force = false) {
  if (!map || !map.isStyleLoaded?.() && !force) { /* will run on load */ }
  if (!map.getSource('regions')) return;
  const changed = force || y !== lastYear;
  if (!changed) return;
  lastYear = y;
  // territory
  const ridState = [];
  const sNames = D.statuses;
  for (const reg of D.regions) {
    if (reg.rid === undefined) continue;
    const c = controlAt(reg, y);
    let st = 'unsettled', col = C.unsettled, pid = null;
    if (c) { st = sNames[c[3]]; col = colorFor(c[2], st); pid = c[2]; }
    ridState[reg.rid] = { pid, st };
    map.setFeatureState({ source: 'regions', id: reg.rid }, { c: col, st, hl: reg.rid === hoverRid });
  }
  // borders between regions
  for (const e of edgesById) {
    const a = ridState[e.a], b = ridState[e.b];
    if (!a || !b) continue;
    const romanA = isRomanRule(a), romanB = isRomanRule(b);
    const d = a.pid !== b.pid || (a.st !== b.st && (romanA || romanB));
    map.setFeatureState({ source: 'edges', id: e.eid }, { d, rf: romanA !== romanB });
  }
  // polity labels
  const groups = new Map();
  for (const reg of D.regions) {
    const s = ridState[reg.rid];
    if (!s || s.pid === null || s.st === 'unsettled' || !reg.labelPt) continue;
    const pol = D.polities[s.pid];
    const key = pol.id;
    if (!groups.has(key)) groups.set(key, { pol, area: 0, best: null, bestArea: -1, regs: [], cx: 0, cy: 0 });
    const g = groups.get(key);
    const a = reg.area || 0;
    g.area += a; g.regs.push(reg); g.cx += reg.labelPt[0] * a; g.cy += reg.labelPt[1] * a;
    if (a > g.bestArea) { g.bestArea = a; g.best = reg; }
  }
  const pl = [];
  for (const g of groups.values()) {
    if (g.area < 1200) continue;
    // label at the sizeable region nearest the polity's area-weighted centre
    const cx = g.cx / g.area, cy = g.cy / g.area;
    let bd = Infinity;
    for (const r of g.regs) {
      if ((r.area || 0) < g.bestArea * 0.2) continue;
      const d = (r.labelPt[0] - cx) ** 2 + (r.labelPt[1] - cy) ** 2;
      if (d < bd) { bd = d; g.best = r; }
    }
    const sz = Math.max(8.5, Math.min(26, 4 + Math.sqrt(g.area) / 55));
    pl.push({ type: 'Feature', geometry: { type: 'Point', coordinates: g.best.labelPt }, properties: { label: polityLabel(g.pol, y), sz, rome: ROMAN.has(g.pol.id) } });
  }
  map.getSource('polityLabels').setData(fc(pl));
  updateEvents(y);
  updateCampaigns(y);
  updateDated(y);
  emit('mapStats', { groups });
}

function isRomanRule(s) {
  if (!s || s.pid === null) return false;
  const p = D.polities[s.pid];
  return (ROMAN.has(p.id) || p.family === 'roman') && (s.st === 'direct' || s.st === 'occupied');
}

export function polityLabel(p, y) {
  if (p.id === 'rome') return y < -27 ? 'Res Publica Romana' : 'Imperium Romanum';
  if (p.id === 'rome_east') return 'Imperium Romanum (Oriens)';
  if (p.id === 'rome_west') return 'Imperium Romanum (Occidens)';
  return p.short || p.name;
}

function eventFeature(e, o) {
  const b = e.battle;
  let color = C.porphyry;
  if (b && b.victor) color = b.victor === 'indecisive' ? '#7D7468' : polityColor(b.victor);
  else if ((e.cats || []).includes('religious')) color = '#5D3C6E';
  else if ((e.cats || []).includes('disaster')) color = '#4D4D4D';
  else if ((e.cats || []).includes('political') || (e.cats || []).includes('constitutional')) color = '#34506A';
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: e.loc },
    properties: { id: e.id, title: e.title, imp: e.importance || 2, o, battle: !!b, kind: b?.kind === 'siege' || e.type === 'siege' ? 'siege' : (b?.kind === 'naval' || e.type === 'naval') ? 'naval' : 'field', color },
  };
}

function updateEvents(y) {
  if (!S.layers.events) { map.getSource('events').setData(fc([])); return; }
  const feats = [];
  const keep = 3;
  const f = S.eventFilter;
  for (let dy = keep; dy >= 0; dy--) {
    const yy = yearToIdx(y) - dy;
    const year = yy <= 0 ? yy - 1 : yy;
    for (const e of D.eventsByYear.get(year) || []) {
      if (!Array.isArray(e.loc)) continue;
      if ((e.importance || 2) < f.minImp) continue;
      if (f.cats.size && !(e.cats || []).some((c) => f.cats.has(c))) continue;
      if (!S.layers.battles && e.battle) continue;
      const o = dy === 0 ? 1 : 0.55 - dy * 0.12;
      if (dy > 0 && (e.importance || 2) < 3) continue;
      feats.push(eventFeature(e, o));
    }
  }
  // events spanning several years (endYear) remain visible
  for (const e of D.events) {
    if (e.endYear && e.year < y && e.endYear >= y && Array.isArray(e.loc)) feats.push(eventFeature(e, 0.8));
  }
  map.getSource('events').setData(fc(feats));
}

function updateCampaigns(y) {
  if (!S.layers.campaigns) { map.getSource('campaigns').setData(fc([])); return; }
  const feats = [];
  for (const c of D.campaigns) {
    if (!c.path || c.path.length < 2) continue;
    const end = c.end ?? c.start;
    if (y < c.start || y > end + 1) continue;
    let pts = c.path;
    if (y < end) pts = c.path.filter((p) => (p.y ?? c.start) <= y);
    if (pts.length < 2) continue;
    const o = y > end ? 0.35 : 1;
    feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map((p) => p.loc) }, properties: { id: c.id, color: polityColor(c.polity), o, name: c.name } });
  }
  map.getSource('campaigns').setData(fc(feats));
}

function updateDated(y) {
  const fr = S.layers.frontiers ? D.frontiers.filter((f) => f.line && f.built <= y && (f.abandoned ?? 9999) >= y && !(f.phases || []).some((p) => p.hidden && p.from <= y && p.to >= y)).map((f) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: f.line }, properties: { id: f.id, name: f.name, kind: f.kind },
  })) : [];
  map.getSource('frontiers').setData(fc(fr));
  const rd = S.layers.namedRoads ? D.roads.filter((r) => r.line && (r.built ?? -9999) <= y).map((r) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: r.line }, properties: { id: r.id, name: r.name, fresh: y - r.built < 5 },
  })) : [];
  map.getSource('namedRoads').setData(fc(rd));
  // legions
  const lg = [];
  if (S.layers.legions) {
    const at = new Map();
    for (const l of D.legions) {
      const st = (l.stations || []).filter((s) => s.from <= y && (s.to ?? s.from) >= y && Array.isArray(s.loc)).pop();
      if (!st) continue;
      const key = st.loc.join(',');
      const n = at.get(key) || 0;
      at.set(key, n + 1);
      lg.push({ type: 'Feature', geometry: { type: 'Point', coordinates: st.loc }, properties: { id: l.id, label: legionShort(l), off: [n * 14, 0] } });
    }
  }
  map.getSource('legions').setData(fc(lg));
  map.setFilter('cities-dot', ['<=', ['get', 'f'], y]);
  map.setFilter('cities-label', ['<=', ['get', 'f'], y]);
  map.setFilter('ancient-labels', ['any', ['all', ['==', ['get', 'a'], 0], ['==', ['get', 'b'], 0]], ['all', ['<=', ['get', 'a'], y + 50], ['>=', ['get', 'b'], y - 50]]]);
  if (map.getLayer('roads')) map.setFilter('roads', y < -250 ? ['==', ['get', 'major'], 99] : y < -100 ? ['==', ['get', 'major'], 1] : null);
}

export function legionShort(l) {
  return (l.name || l.id).replace(/^Legio\s+/i, '');
}

export function applyLayerVisibility() {
  const L = S.layers;
  const vis = (id, v) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
  ['territory', 'terr-ally', 'terr-client', 'terr-contested', 'terr-occupied'].forEach((id) => vis(id, L.territory));
  vis('borders', L.borders && L.territory);
  vis('polity-labels', L.polityLabels);
  vis('region-labels', L.regionNames);
  vis('ancient-labels', L.ancientLabels);
  ['events-glow', 'events-label', 'battle-victor', 'battles'].forEach((id) => vis(id, L.events));
  ['campaign-casing', 'campaign-lines', 'campaign-arrows'].forEach((id) => vis(id, L.campaigns));
  ['cities-dot', 'cities-label'].forEach((id) => vis(id, L.cities));
  vis('legions', L.legions);
  ['frontiers', 'frontiers-casing', 'frontiers-label', 'frontiers-dash'].forEach((id) => vis(id, L.frontiers));
  vis('roads', L.roads);
  ['named-roads', 'named-roads-label'].forEach((id) => vis(id, L.namedRoads));
  vis('aqueducts', L.aqueducts);
  vis('ancient-water', L.ancientWater);
  vis('rivers', L.rivers);
  vis('relief', L.relief && !L.dare);
  vis('dare', L.dare);
  vis('sea-mask', (L.relief || L.dare) && !L.dare);
  vis('land', !L.dare);
  ['ext-lines', 'ext60-lines', 'ext200-lines'].forEach((id) => vis(id, L.extents));
  vis('prov-lines', L.provinces);
  vis('prov-dioc', L.provinces);
  map.setPaintProperty('territory', 'fill-opacity', ['case', ['==', ['feature-state', 'st'], 'unsettled'], L.dare ? 0 : 0.12, ['boolean', ['feature-state', 'hl'], false], 0.88, L.dare ? 0.32 : 0.66]);
  vis('marine', !L.dare);
}

// ---- interactions -------------------------------------------------------------
function bindInteractions() {
  const hi = document.getElementById('hoverinfo');
  const clickable = ['battles', 'events-glow', 'campaign-lines', 'legions', 'cities-dot', 'frontiers', 'named-roads'];
  map.on('mousemove', (ev) => {
    const feats = map.queryRenderedFeatures(ev.point, { layers: [...clickable, 'territory'].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') });
    const top = feats.find((f) => f.layer.id !== 'territory');
    const terr = feats.find((f) => f.layer.id === 'territory');
    map.getCanvas().style.cursor = feats.length ? 'pointer' : '';
    const newHover = terr && !top ? terr.id : null;
    if (newHover !== hoverRid) {
      if (hoverRid !== null) map.setFeatureState({ source: 'regions', id: hoverRid }, { hl: false });
      hoverRid = newHover;
      if (hoverRid !== null) map.setFeatureState({ source: 'regions', id: hoverRid }, { hl: true });
    }
    let html = '';
    if (top) html = hoverFor(top);
    else if (terr) html = hoverRegion(regionByRid[terr.id]);
    if (!html) { hi.style.display = 'none'; return; }
    hi.innerHTML = html;
    hi.style.display = 'block';
    const r = hi.getBoundingClientRect();
    const W = map.getContainer().clientWidth;
    hi.style.left = Math.min(ev.point.x + 16, W - r.width - 8) + 'px';
    hi.style.top = Math.max(8, ev.point.y - r.height - 12) + 'px';
  });
  map.on('mouseout', () => { hi.style.display = 'none'; });
  map.on('click', (ev) => {
    const feats = map.queryRenderedFeatures(ev.point, { layers: [...clickable, 'territory'].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') });
    const top = feats.find((f) => f.layer.id !== 'territory');
    if (top) {
      const id = top.properties.id;
      const kind = { battles: 'event', 'events-glow': 'event', 'campaign-lines': 'campaign', legions: 'legion', 'cities-dot': 'place', frontiers: 'frontier', 'named-roads': 'road' }[top.layer.id];
      select(kind, id, { fromMap: true });
      return;
    }
    const terr = feats.find((f) => f.layer.id === 'territory');
    if (terr && regionByRid[terr.id]) select('region', regionByRid[terr.id].id, { fromMap: true });
  });
}

function hoverFor(f) {
  const id = f.properties.id;
  const r = lookup(id);
  if (!r) return '';
  const o = r.obj;
  if (r.kind === 'event') return `<div class="hi-k">${esc(o.type || 'event')} · ${fmtYear(o.year)}</div><b>${esc(o.title)}</b>${o.battle?.victor ? `<div class="hi-k">victor: ${esc(D.polity.get(o.battle.victor)?.name || o.battle.victor)}</div>` : ''}`;
  if (r.kind === 'campaign') return `<div class="hi-k">campaign · ${fmtRange(o.start, o.end)}</div><b>${esc(o.name)}</b>`;
  if (r.kind === 'legion') return `<div class="hi-k">legion</div><b>${esc(o.name)}</b>`;
  if (r.kind === 'place') return `<div class="hi-k">${esc((o.type || []).join(', ').replace(/_/g, ' '))}</div><b>${esc(o.name)}</b>${o.modern ? `<div class="hi-k">${esc(o.modern)}</div>` : ''}`;
  return `<b>${esc(o.name || o.title)}</b>`;
}

function hoverRegion(reg) {
  if (!reg) return '';
  const c = controlAt(reg, S.year);
  if (!c) return `<b>${esc(reg.name)}</b>`;
  const p = D.polities[c[2]];
  const st = D.statuses[c[3]];
  return `<div class="hi-k">${esc(reg.name)}</div><b>${esc(p ? p.name : 'no organised state')}</b><div class="hi-k">${esc(STATUS_LABEL[st] || st)}${c[4] ? ' · ' + esc(c[4]) : ''}</div>`;
}

// ---- selection ---------------------------------------------------------------
function showSelection(sel) {
  const src = map?.getSource('selection');
  if (!src) return;
  if (!sel) { src.setData(fc([])); return; }
  const r = lookup(sel.id, sel.kind);
  if (!r) { src.setData(fc([])); return; }
  const o = r.obj;
  const feats = [];
  const fly = (center, zoom) => map.flyTo({ center, zoom: Math.max(map.getZoom(), zoom), speed: 1.2, padding: padding() });
  if (r.kind === 'event' && Array.isArray(o.loc)) { feats.push(pt(o.loc)); fly(o.loc, 5.5); }
  else if (r.kind === 'place' && Array.isArray(o.loc)) { feats.push(pt(o.loc)); fly(o.loc, 6); }
  else if (r.kind === 'campaign' && o.path?.length) { const cs = o.path.map((p) => p.loc); feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: cs }, properties: {} }); fit(cs); }
  else if ((r.kind === 'frontier' || r.kind === 'road') && o.line) { feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: o.line }, properties: {} }); fit(o.line); }
  else if (r.kind === 'legion') { const st = (o.stations || []).filter((s) => Array.isArray(s.loc)); if (st.length) fit(st.map((s) => s.loc)); st.forEach((s) => feats.push(pt(s.loc))); }
  else if (r.kind === 'war' || r.kind === 'person' || r.kind === 'polity') {
    const evs = (D.rev[r.kind === 'war' ? 'war' : r.kind === 'person' ? 'person' : 'polity'].get(o.id) || []).filter((e) => Array.isArray(e.loc));
    if (evs.length) fit(evs.map((e) => e.loc));
  } else if (r.kind === 'region' && o.labelPt) fly(o.labelPt, 5);
  src.setData(fc(feats));
}
const pt = (c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} });
function padding() {
  const det = document.getElementById('detail');
  return { top: 120, bottom: 60, left: 60, right: det && !det.hidden ? det.offsetWidth + 40 : 60 };
}
export function fit(coords) {
  if (!coords.length) return;
  const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(b, { padding: padding(), maxZoom: 6.5, duration: 1200 });
}

// ---- march playback (follow a campaign) ------------------------------------------
let marchTimer = null;
export function playMarch(c, onStep) {
  stopMarch();
  const pts = (c.path || []).filter((p) => Array.isArray(p.loc));
  if (pts.length < 2) return;
  // densify for smooth motion
  const seg = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i].loc, b = pts[i + 1].loc;
    const n = Math.max(8, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 10));
    for (let k = 0; k < n; k++) seg.push({ c: [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], wp: k === 0 ? i : null });
  }
  seg.push({ c: pts[pts.length - 1].loc, wp: pts.length - 1 });
  fit(pts.map((p) => p.loc));
  let i = 0;
  const color = polityColor(c.polity);
  map.setPaintProperty('march-line', 'line-color', color);
  map.setPaintProperty('march-head', 'circle-color', color);
  let pause = 0;
  marchTimer = setInterval(() => {
    if (pause > 0) { pause--; return; }
    const s = seg[i];
    map.getSource('march').setData(fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: seg.slice(0, i + 1).map((q) => q.c).concat(i === 0 ? [s.c] : []) }, properties: {} }]));
    const wpIdx = s.wp;
    const lastWp = seg.slice(0, i + 1).filter((q) => q.wp !== null).pop().wp;
    map.getSource('marchHead').setData(fc([{ type: 'Feature', geometry: { type: 'Point', coordinates: s.c }, properties: { t: pts[lastWp].t || '' } }]));
    if (wpIdx !== null) { onStep?.(wpIdx, pts[wpIdx], pts.length); pause = 22; }
    i++;
    if (i >= seg.length) { clearInterval(marchTimer); marchTimer = null; onStep?.(-1); }
  }, 45);
}
export function stopMarch() {
  if (marchTimer) clearInterval(marchTimer);
  marchTimer = null;
  if (map?.getSource('march')) { map.getSource('march').setData(fc([])); map.getSource('marchHead').setData(fc([])); }
}
