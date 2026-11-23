// Loads runtime data and builds indexes.
import { MIN_YEAR, MAX_YEAR, yearToIdx } from './util.js';

export const D = {
  polities: [], polity: new Map(), regions: [], events: [], people: [], wars: [], campaigns: [], places: [], legions: [],
  frontiers: [], roads: [], sources: [], rulers: [], fasti: [], glossary: [], series: [], chapters: null,
  byKind: {}, eventsByYear: new Map(), fastiByYear: new Map(), stats: null, statuses: [],
  provinces: [], monuments: [], mints: [], hoards: [], coinage: [], sites: [], routes: [], tours: [], tactics: null,
};

const KINDS = ['event', 'person', 'war', 'campaign', 'place', 'polity', 'legion', 'frontier', 'road', 'source', 'glossary', 'region', 'province', 'monument', 'mint', 'hoard', 'site', 'route', 'coinage'];
const KIND_PREF = ['event', 'person', 'war', 'campaign', 'legion', 'polity', 'place', 'province', 'monument', 'site', 'mint', 'hoard', 'route', 'region', 'frontier', 'road', 'source', 'glossary', 'coinage'];

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export async function loadAll(onMsg = () => {}) {
  onMsg('Reading the fasti');
  const [atlas, codex, extra] = await Promise.all([getJSON('data/atlas.json'), getJSON('data/codex.json'), getJSON('data/extra.json').catch(() => ({}))]);
  Object.assign(D, codex);
  Object.assign(D, extra);
  D.polities = atlas.polities;
  D.regions = atlas.regions;
  D.statuses = atlas.statuses;
  D.meta = atlas.meta || {};
  for (const k of KINDS) D.byKind[k] = new Map();
  const put = (k, arr) => arr.forEach((o) => o && o.id && D.byKind[k].set(o.id, o));
  put('event', D.events); put('person', D.people); put('war', D.wars); put('campaign', D.campaigns);
  put('place', D.places); put('polity', D.polities); put('legion', D.legions); put('frontier', D.frontiers);
  put('road', D.roads); put('source', D.sources); put('glossary', D.glossary); put('region', D.regions);
  put('province', D.provinces); put('monument', D.monuments); put('mint', D.mints); put('hoard', D.hoards); put('site', D.sites); put('route', D.routes); put('coinage', D.coinage);
  D.journeys = D.campaigns.filter((c) => c.kind === 'journey');
  D.coinageByIssuer = new Map();
  for (const c of D.coinage) if (c.issuer) { if (!D.coinageByIssuer.has(c.issuer)) D.coinageByIssuer.set(c.issuer, []); D.coinageByIssuer.get(c.issuer).push(c); }
  D.polities.forEach((p, i) => { p.idx = i; D.polity.set(p.id, p); });
  for (const e of D.events) {
    if (!D.eventsByYear.has(e.year)) D.eventsByYear.set(e.year, []);
    D.eventsByYear.get(e.year).push(e);
  }
  for (const arr of D.eventsByYear.values()) arr.sort((a, b) => (a.month || 13) - (b.month || 13) || (a.day || 0) - (b.day || 0) || (b.importance || 0) - (a.importance || 0));
  D.events.sort((a, b) => a.year - b.year || (a.month || 13) - (b.month || 13) || (a.day || 0) - (b.day || 0));
  for (const f of D.fasti) D.fastiByYear.set(f.year, f);
  // reverse links: events per person / war / place / polity
  D.rev = { person: new Map(), war: new Map(), place: new Map(), polity: new Map() };
  const addRev = (k, id, e) => { if (!id) return; if (!D.rev[k].has(id)) D.rev[k].set(id, []); D.rev[k].get(id).push(e); };
  for (const e of D.events) {
    (e.people || []).forEach((p) => addRev('person', p, e));
    addRev('war', e.war, e);
    addRev('place', e.place, e);
    (e.polities || []).forEach((p) => addRev('polity', p, e));
  }
  D.campaignsByWar = new Map();
  for (const c of D.campaigns) { if (!D.campaignsByWar.has(c.war)) D.campaignsByWar.set(c.war, []); D.campaignsByWar.get(c.war).push(c); }
  computeStats();
  return D;
}

let detailsPromise = null;
export function loadDetails() {
  if (!detailsPromise) {
    detailsPromise = getJSON('data/details.json').then((d) => {
      for (const [k, kind] of [['events', 'event'], ['people', 'person'], ['wars', 'war']]) {
        for (const [id, h] of Object.entries(d[k] || {})) { const o = D.byKind[kind].get(id); if (o) Object.assign(o, h); }
      }
      D.detailsLoaded = true;
      return true;
    }).catch(() => false);
  }
  return detailsPromise;
}

export async function loadTactics() {
  if (!D.tactics) {
    const t = await getJSON('data/tactics.json').catch(() => ({ tactics: [] }));
    D.tactics = new Map(t.tactics.map((x) => [x.event, x]));
  }
  return D.tactics;
}

export async function loadChapters() {
  if (!D.chapters) D.chapters = (await getJSON('data/chapters.json')).chapters;
  return D.chapters;
}

// Lookup any id. Optional preferred kind.
export function lookup(id, kind) {
  if (!id) return null;
  if (kind && D.byKind[kind]?.has(id)) return { kind, obj: D.byKind[kind].get(id) };
  for (const k of KIND_PREF) if (D.byKind[k].has(id)) return { kind: k, obj: D.byKind[k].get(id) };
  return null;
}
export const exists = (id) => !!lookup(id);
export const nameOf = (id, kind) => {
  const r = lookup(id, kind);
  if (!r) return id ? id.replace(/_/g, ' ') : '';
  const o = r.obj;
  return o.name || o.title || o.term || o.t || id;
};

// Region control at a year: returns [polityIdx, statusIdx] or null.
export function controlAt(region, y) {
  let hit = null;
  for (const c of region.ctl) if (y >= c[0] && y <= c[1]) hit = c; // later periods win at boundaries
  return hit;
}

export const statusId = (i) => D.statuses[i];

function computeStats() {
  const base = yearToIdx(MIN_YEAR);
  const n = yearToIdx(MAX_YEAR) - base + 1;
  const direct = new Float64Array(n), ally = new Float64Array(n), client = new Float64Array(n), contested = new Float64Array(n);
  const sIdx = Object.fromEntries(D.statuses.map((s, i) => [s, i]));
  const romanP = new Set(['rome', 'rome_west', 'rome_east', 'gallic_empire', 'britannic_empire', 'domain_of_soissons'].map((id) => D.polity.get(id)?.idx));
  const sP = new Int16Array(n), sS = new Int16Array(n);
  for (const r of D.regions) {
    const a = r.area || 0;
    sP.fill(-1); sS.fill(-1);
    for (const c of r.ctl) { // later periods overwrite earlier ones at shared years
      const i0 = Math.max(0, yearToIdx(c[0]) - base), i1 = Math.min(n - 1, yearToIdx(c[1]) - base);
      for (let i = i0; i <= i1; i++) { sP[i] = c[2]; sS[i] = c[3]; }
    }
    for (let i = 0; i < n; i++) {
      const s = sS[i];
      if ((s === sIdx.direct || s === sIdx.occupied) && romanP.has(sP[i])) direct[i] += a;
      else if (s === sIdx.ally) ally[i] += a;
      else if (s === sIdx.client) client[i] += a;
      else if (s === sIdx.contested) contested[i] += a;
    }
  }
  D.stats = { direct, ally, client, contested, n };
}

export function statsAt(y) {
  const i = yearToIdx(y) - yearToIdx(MIN_YEAR);
  const s = D.stats;
  return { direct: s.direct[i], ally: s.ally[i], client: s.client[i], contested: s.contested[i] };
}

// Rulers in office in a given year (emperor lists, foreign dynasties).
export function rulersAt(y) {
  const out = [];
  for (const grp of D.rulers) {
    const list = (grp.list || []).filter((r) => r.from <= y && (r.to ?? r.from) >= y);
    if (list.length) out.push({ office: grp.office, list });
  }
  return out;
}

export function sourcesCovering(y) {
  const out = [];
  for (const s of D.sources) {
    for (const w of s.works || []) {
      if (!w.covers || !(w.covers[0] <= y && w.covers[1] >= y)) continue;
      const ext = (w.extant || []).some((iv) => iv[0] <= y && iv[1] >= y);
      out.push({ source: s, work: w, extant: ext });
    }
  }
  out.sort((a, b) => (b.extant - a.extant) || a.source.name.localeCompare(b.source.name));
  return out;
}

export function warsActive(y) {
  return D.wars.filter((w) => w.start <= y && (w.end ?? w.start) >= y);
}
