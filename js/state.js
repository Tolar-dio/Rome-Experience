// Tiny app state with subscriptions and URL-hash persistence.
import { clampYear } from './util.js';

const listeners = new Map();
export const S = {
  year: -509,
  tab: 'year',
  selected: null, // {kind, id}
  playing: false,
  speed: 3,
  follow: false,
  window: 0, // extra years either side shown for events on the map
  layers: {
    territory: true, borders: true, polityLabels: true, regionNames: false, ancientLabels: true,
    events: true, battles: true, campaigns: true, cities: true, legions: false, frontiers: true,
    roads: true, namedRoads: true, aqueducts: false, ancientWater: true, rivers: true, relief: true, dare: false,
    extents: false, provinces: false,
  },
  eventFilter: { cats: new Set(), minImp: 1 },
};

export function on(ev, fn) {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev).add(fn);
  return () => listeners.get(ev).delete(fn);
}
export function emit(ev, payload) {
  (listeners.get(ev) || []).forEach((fn) => fn(payload));
}

export function setYear(y, opts = {}) {
  y = clampYear(Math.round(y));
  if (y === S.year && !opts.force) return;
  S.year = y;
  emit('year', y);
  if (!opts.silentHash) writeHash();
}

export function select(kind, id, opts = {}) {
  S.selected = id ? { kind, id } : null;
  emit('select', S.selected ? { ...S.selected, ...opts } : null);
  writeHash();
}

export function setLayer(name, on) {
  S.layers[name] = on;
  emit('layers', name);
  try { localStorage.setItem('orbis.layers', JSON.stringify(S.layers)); } catch (e) { /* storage unavailable */ }
}

export function restoreLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem('orbis.layers') || 'null');
    if (saved) Object.assign(S.layers, saved);
  } catch (e) { /* ignore */ }
}

let hashTimer;
export function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set('y', S.year);
    if (S.selected) p.set('s', `${S.selected.kind}:${S.selected.id}`);
    if (S.tab !== 'year') p.set('t', S.tab);
    history.replaceState(null, '', '#' + p.toString());
  }, 250);
}

export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const out = {};
  if (p.has('y')) out.year = clampYear(parseInt(p.get('y'), 10) || -509);
  if (p.has('s')) { const [kind, ...rest] = p.get('s').split(':'); out.selected = { kind, id: rest.join(':') }; }
  if (p.has('t')) out.tab = p.get('t');
  return out;
}
