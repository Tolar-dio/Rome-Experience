// Left panel tabs: year, chronicle, wars, codex, text, army, rulers, sources, data.
import { D, statsAt, rulersAt, sourcesCovering, warsActive, controlAt, nameOf, exists, loadChapters } from './data.js';
import { S, on, select, setYear, emit, setLayer } from './state.js';
import { esc, fmtYear, fmtRange, fmtNum, impDots, richText, paragraphs, auc, eraOf, ERAS, STATUS_LABEL, MIN_YEAR, MAX_YEAR, yearToIdx, idxToYear, debounce } from './util.js';
import { eventRows, openId } from './detail.js';
import { polityColor, colorFor, legionShort } from './map.js';
import { focusRange, resetRange } from './timeline.js';
import { renderCharts } from './charts.js';
import { flyToCity, MON_COLORS } from './extras.js';
import { startTour } from './tours.js';
import { coinCard } from './detail.js';

const panel = () => document.getElementById('panel');
const CATS = ['military', 'political', 'constitutional', 'law', 'religious', 'cultural', 'economic', 'social', 'administrative', 'diplomatic', 'disaster', 'literature', 'technology'];
let chronicleState = { q: '', era: true, minImp: 1, cats: new Set() };
let codexState = { kind: 'person', q: '' };
let readingChapter = null;
let initialised = false;

export function initPanels() {
  document.querySelectorAll('.rail button').forEach((b) => b.addEventListener('click', () => {
    const app = document.getElementById('app');
    if (b.dataset.tab === S.tab && !app.classList.contains('panel-closed')) { closePanel(); return; }
    showTab(b.dataset.tab);
  }));
  document.getElementById('app').classList.add('panel-closed');
  panel().addEventListener('click', (e) => {
    const t = e.target.closest('[data-id]');
    if (t && !t.closest('[data-noopen]')) { openId(t.dataset.id, t.dataset.kind); return; }
    const y = e.target.closest('[data-year]');
    if (y) setYear(parseInt(y.dataset.year, 10));
  });
  on('year', debounce(() => { if (['year', 'army', 'rulers', 'city', 'coins', 'data'].includes(S.tab) && !document.getElementById('app').classList.contains('panel-closed')) render(); if (S.tab === 'chronicle') scrollChronicle(); if (S.tab === 'sources') renderSourcesHead(); }, 120));
  showTab(S.tab);
}

export function closePanel() {
  document.getElementById('app').classList.add('panel-closed');
  document.querySelectorAll('.rail button').forEach((b) => b.classList.remove('active'));
}

export function showTab(tab) {
  S.tab = tab;
  if (initialised) document.querySelectorAll('.rail button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (initialised) document.getElementById('app').classList.remove('panel-closed');
  initialised = true;
  render();
  panel().scrollTop = 0;
  if (tab === 'chronicle') scrollChronicle();
}

function render() {
  const fn = TABS[S.tab] || TABS.year;
  const html = fn();
  if (html !== null) panel().innerHTML = `<button class="panel-close" aria-label="Close panel">×</button><div class="panel-inner">${html}</div>`;
  panel().querySelector('.panel-close')?.addEventListener('click', closePanel);
  AFTER[S.tab]?.();
}

const AFTER = {};

// ---------------- Year ----------------
function fastiLine(y) {
  const f = D.fastiByYear.get(y);
  if (!f) return '';
  const names = f.consuls?.length ? f.consuls : f.tribunes?.length ? f.tribunes : [];
  const label = f.consuls?.length ? 'Consuls' : f.tribunes?.length ? 'Consular tribunes' : 'Eponyms';
  return `<dt>${label}</dt><dd>${names.map((n, i) => (f.ids?.[i] && exists(f.ids[i]) ? `<a class="ent" data-id="${esc(f.ids[i])}">${esc(n)}</a>` : esc(n))).join(', ') || '<span class="muted">none recorded</span>'}${f.suffects?.length ? `<br><span class="muted">suffect: ${esc(f.suffects.join(', '))}</span>` : ''}${f.note ? `<br><span class="muted">${esc(f.note)}</span>` : ''}</dd>`;
}

const OFFICE_LABEL = { emperor: 'Emperor', emperor_west: 'Emperor in the West', emperor_east: 'Emperor in the East', usurper: 'Usurpers', dictator: 'Dictator', censors: 'Censors' };
function officeLabel(o) { return OFFICE_LABEL[o] || D.polity.get(o)?.name || o.replace(/_/g, ' '); }

function changesAt(y) {
  const prev = idxToYear(yearToIdx(y) - 1);
  const out = [];
  if (y <= MIN_YEAR) return out;
  for (const r of D.regions) {
    const a = controlAt(r, prev), b = controlAt(r, y);
    if (!a || !b) continue;
    if (a[2] !== b[2] || a[3] !== b[3]) out.push({ r, a, b });
  }
  return out;
}

const TABS = {
  year() {
    const y = S.year;
    const st = statsAt(y);
    const era = eraOf(y);
    let h = `<h2>${esc(fmtYear(y, { ad: true }))}</h2><p class="lede">${esc(era.name)} · ${auc(y)} ab urbe condita (Varronian)</p>`;
    h += `<div class="stat-strip"><div><b>${fmtNum(Math.round(st.direct))}</b><span>km² under Roman rule</span></div><div><b>${fmtNum(Math.round(st.ally))}</b><span>km² allied / federate</span></div><div><b>${fmtNum(Math.round(st.client))}</b><span>km² client kingdoms</span></div></div>`;
    const rul = rulersAt(y);
    const fl = fastiLine(y);
    if (fl || rul.length) {
      h += `<h3>Who ruled</h3><dl class="kv">${fl}`;
      const order = ['emperor', 'emperor_west', 'emperor_east', 'dictator', 'censors', 'usurper'];
      rul.sort((a, b) => (order.indexOf(a.office) + 1 || 99) - (order.indexOf(b.office) + 1 || 99));
      for (const g of rul) h += `<dt>${esc(officeLabel(g.office))}</dt><dd>${g.list.map((r) => (exists(r.id) ? `<a class="ent" data-id="${esc(r.id)}">${esc(r.name)}</a>` : esc(r.name || (r.names || []).join(' & ')))).join(', ')}</dd>`;
      h += '</dl>';
    }
    const wars = warsActive(y);
    if (wars.length) h += `<h3>Wars under way</h3><ul class="rows">${wars.map((w) => `<li class="row" data-id="${esc(w.id)}" data-kind="war"><div class="when">${esc(fmtYear(w.start))}<br><span class="muted">to ${esc(fmtYear(w.end ?? w.start))}</span></div><div class="what"><div class="ttl">${esc(w.name)}</div><div class="sum">${(w.sides || []).map((s) => s.map((p) => `<span class="swatch" style="background:${polityColor(p)}"></span>${esc(D.polity.get(p)?.name || p)}`).join(', ')).join(' <i>against</i> ')}</div></div></li>`).join('')}</ul>`;
    const evs = D.eventsByYear.get(y) || [];
    h += `<h3>The year's events</h3>${evs.length ? eventRows(evs) : '<p class="muted">Nothing recorded for this year in the chronicle. Use the arrows or the timeline to move on.</p>'}`;
    const ch = changesAt(y);
    if (ch.length) h += `<h3>Land changing hands</h3><ul class="rows">${ch.map(({ r, a, b }) => `<li class="row" data-id="${esc(r.id)}" data-kind="region"><div class="when"><span class="swatch" style="background:${colorFor(b[2], D.statuses[b[3]])}"></span></div><div class="what"><div class="ttl">${esc(r.name)}</div><div class="sum">${esc(D.polities[a[2]]?.name || '—')} (${esc(STATUS_LABEL[D.statuses[a[3]]])}) <i>to</i> ${esc(D.polities[b[2]]?.name || '—')} (${esc(STATUS_LABEL[D.statuses[b[3]]])})${b[4] ? `. ${esc(b[4])}` : ''}</div></div></li>`).join('')}</ul>`;
    const src = sourcesCovering(y);
    if (src.length) h += `<h3>Who tells us</h3><div class="cov">${src.map((s) => `<div class="cov-row"><span><a class="ent" data-id="${esc(s.source.id)}">${esc(s.source.name)}</a>, <i>${esc(s.work.t)}</i></span><span class="qual ${s.extant ? 'extant' : 'lost'}">${s.extant ? 'extant' : 'lost / fragments'}</span></div>`).join('')}</div>`;
    else h += `<h3>Who tells us</h3><p class="muted">No continuous narrative source covers this year.</p>`;
    return h;
  },

  chronicle() {
    const cs = chronicleState;
    let h = `<h2>Chronicle</h2><p class="lede">Every recorded event, ${cs.era ? 'in the current era' : 'from 509 BC to AD 641'}. Click one to see it on the map.</p>`;
    h += `<input class="textfilter" id="chQ" placeholder="Filter by word, e.g. lex, colony, eclipse, Cannae" value="${esc(cs.q)}">`;
    h += `<div class="filters" id="chCats">${CATS.map((c) => `<button data-c="${c}" class="${cs.cats.has(c) ? 'on' : ''}">${c}</button>`).join('')}</div>`;
    h += `<div class="filters"><span class="seg" id="chImp">${[1, 2, 3, 4, 5].map((i) => `<button data-i="${i}" class="${cs.minImp === i ? 'on' : ''}">${i === 1 ? 'all' : i + '+'}</button>`).join('')}</span>
      <span class="seg" id="chEra"><button data-e="1" class="${cs.era ? 'on' : ''}">this era</button><button data-e="0" class="${!cs.era ? 'on' : ''}">all eras</button></span></div>`;
    const era = eraOf(S.year);
    const q = cs.q.trim().toLowerCase();
    const list = D.events.filter((e) => (!cs.era || (e.year >= era.from && e.year <= era.to)) && (e.importance || 2) >= cs.minImp &&
      (!cs.cats.size || (e.cats || []).some((c) => cs.cats.has(c))) &&
      (!q || (e.title + ' ' + (e.summary || '') + ' ' + (e.tags || []).join(' ') + ' ' + (e.type || '')).toLowerCase().includes(q)));
    h += `<p class="meta">${list.length} events</p><ul class="rows" id="chList">${list.map((e) => `<li class="row${e.year === S.year ? ' sel' : ''}" data-id="${esc(e.id)}" data-kind="event" data-y="${e.year}">
      <div class="when">${esc(fmtYear(e.year))}</div><div class="what"><div class="ttl">${esc(e.title)}${impDots(e.importance)}</div>
      <div class="tags"><span class="tag k-${esc(e.type)}">${esc(e.type || '')}</span>${(e.cats || []).slice(0, 3).map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</div></div></li>`).join('')}</ul>`;
    return h;
  },

  wars() {
    const sorted = D.wars.slice().sort((a, b) => a.start - b.start);
    let h = `<h2>Wars and campaigns</h2><p class="lede">${D.wars.length} wars and ${D.campaigns.filter((c) => c.kind !== 'journey').length} mapped campaigns. Campaign routes animate on the map in their years; open one and choose "Follow the march".</p>`;
    const byEra = ERAS.map((er) => ({ er, wars: sorted.filter((w) => w.start >= er.from && w.start <= er.to) }));
    for (const { er, wars } of byEra) {
      if (!wars.length) continue;
      h += `<h3>${esc(er.name)}</h3><ul class="rows">${wars.map((w) => {
        const camps = D.campaignsByWar.get(w.id) || [];
        return `<li class="row" data-id="${esc(w.id)}" data-kind="war"><div class="when">${esc(fmtYear(w.start))}<br><span class="muted">${w.end && w.end !== w.start ? 'to ' + esc(fmtYear(w.end)) : ''}</span></div>
        <div class="what"><div class="ttl">${esc(w.name)}</div><div class="sum">${esc(w.outcome || '')}</div>${camps.length ? `<div class="tags">${camps.map((c) => `<span class="tag" data-id="${esc(c.id)}" data-kind="campaign">${esc(c.name)}</span>`).join('')}</div>` : ''}</div></li>`;
      }).join('')}</ul>`;
    }
    const orphans = D.campaigns.filter((c) => c.kind !== 'journey' && (!c.war || !exists(c.war)));
    if (orphans.length) h += `<h3>Other campaigns</h3><ul class="rows">${orphans.map((c) => `<li class="row" data-id="${esc(c.id)}" data-kind="campaign"><div class="when">${esc(fmtYear(c.start))}</div><div class="what"><div class="ttl">${esc(c.name)}</div></div></li>`).join('')}</ul>`;
    return h;
  },

  codex() {
    const cs = codexState;
    const kinds = [['person', 'People', D.people], ['place', 'Places', D.places], ['polity', 'States and peoples', D.polities], ['province', 'Provinces', D.provinces], ['glossary', 'Terms', D.glossary], ['site', 'Sites', D.sites], ['monument', 'Monuments', D.monuments], ['region', 'Map regions', D.regions], ['event', 'Events', D.events]].filter((k) => k[2].length);
    let h = `<h2>Codex</h2><p class="lede">The encyclopedia: ${D.people.length} people, ${D.places.length} places, ${D.polities.length} states and peoples, ${D.glossary.length} terms, ${D.regions.length} map regions.</p>`;
    h += `<div class="filters" id="cxKinds">${kinds.map(([k, l]) => `<button data-k="${k}" class="${cs.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    h += `<input class="textfilter" id="cxQ" placeholder="Filter" value="${esc(cs.q)}">`;
    const [, , arr] = kinds.find((k) => k[0] === cs.kind);
    const q = cs.q.trim().toLowerCase();
    const label = (o) => o.name || o.term || o.title || o.id;
    const items = arr.filter((o) => !q || (label(o) + ' ' + (o.fullName || '') + ' ' + (o.modern || '') + ' ' + (o.summary || o.def || '')).toLowerCase().includes(q))
      .slice().sort((a, b) => (cs.kind === 'event' ? a.year - b.year : label(a).localeCompare(label(b))));
    const sub = (o) => {
      if (cs.kind === 'person') return `${o.born ? fmtYear(o.born) : '?'} to ${o.died ? fmtYear(o.died) : '?'}${o.kind ? ' · ' + o.kind.join(', ') : ''}`;
      if (cs.kind === 'place') return [o.modern, (o.type || []).join(', ').replace(/_/g, ' ')].filter(Boolean).join(' · ');
      if (cs.kind === 'polity') return `${fmtRange(o.start, o.end)} · ${o.type || ''}`;
      if (cs.kind === 'glossary') return (o.def || '').slice(0, 110);
      if (cs.kind === 'event') return fmtYear(o.year);
      if (cs.kind === 'province') return `${o.type || 'province'} · ${fmtRange(o.created, o.ended)}`;
      if (cs.kind === 'site') return `${o.theme} · ${o.kind}${o.from !== undefined ? ' · from ' + fmtYear(o.from) : ''}`;
      if (cs.kind === 'monument') return `${o.city} · ${o.type}${o.built !== undefined ? ' · ' + fmtYear(o.built) : ''}`;
      return '';
    };
    h += `<p class="meta">${items.length} entries</p><ul class="rows">${items.slice(0, 600).map((o) => `<li class="row" style="grid-template-columns:1fr" data-id="${esc(o.id)}" data-kind="${cs.kind}"><div class="what"><div class="ttl">${cs.kind === 'polity' ? `<span class="swatch" style="background:${o.color}"></span>` : ''}${esc(label(o))}</div><div class="sum">${esc(sub(o))}</div></div></li>`).join('')}</ul>`;
    return h;
  },

  text() {
    if (!D.chapters) { loadChapters().then(() => S.tab === 'text' && render()); return '<p class="muted">Loading chapters…</p>'; }
    if (readingChapter) {
      const c = D.chapters.find((x) => x.id === readingChapter);
      const i = D.chapters.indexOf(c);
      let h = `<p class="meta"><a class="ent" id="chBack">All chapters</a></p><p class="ch-num">Chapter ${i + 1} · ${esc(fmtRange(c.from, c.to))}</p><h2>${esc(c.title)}</h2>`;
      h += `<div class="chapter">${paragraphs(c.body, exists)}</div>`;
      if (c.historiography) h += `<h3>The debate</h3><div class="debate">${richText(c.historiography, exists)}</div>`;
      if (c.reading?.length) h += `<h3>Further reading</h3><ul class="cite">${c.reading.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
      h += `<p style="display:flex;justify-content:space-between;margin-top:24px">${i > 0 ? `<a class="ent" data-ch="${esc(D.chapters[i - 1].id)}">Previous: ${esc(D.chapters[i - 1].title)}</a>` : '<span></span>'}${i < D.chapters.length - 1 ? `<a class="ent" data-ch="${esc(D.chapters[i + 1].id)}">Next: ${esc(D.chapters[i + 1].title)}</a>` : ''}</p>`;
      return h;
    }
    let h = `<h2>Historia</h2><p class="lede">A continuous narrative history in ${D.chapters.length} chapters. Reading a chapter moves the map and timeline to its years; names in the text open their entries.</p><ul class="ch-list">`;
    h += D.chapters.map((c, i) => `<li data-ch="${esc(c.id)}"><span class="ch-num">${i + 1} · ${esc(fmtRange(c.from, c.to))}</span><br><b>${esc(c.title)}</b>${c.themes?.length ? `<br><span class="meta">${esc(c.themes.slice(0, 4).join(', '))}</span>` : ''}</li>`).join('');
    return h + '</ul>';
  },

  army() {
    const y = S.year;
    const active = D.legions.filter((l) => (l.stations || []).some((s) => s.from <= y && (s.to ?? s.from) >= y));
    let h = `<h2>Army and frontiers</h2><p class="lede">${active.length} legions with a known base in ${esc(fmtYear(y))}. <label><input type="checkbox" id="armyToggle" ${S.layers.legions ? 'checked' : ''}> show legion bases on the map</label></p>`;
    if (active.length) h += `<ul class="rows">${active.map((l) => { const s = l.stations.filter((s) => s.from <= y && (s.to ?? s.from) >= y).pop(); return `<li class="row" data-id="${esc(l.id)}" data-kind="legion"><div class="when">${esc(String(l.num ?? ''))}</div><div class="what"><div class="ttl">${esc(l.name)}</div><div class="sum">${esc(s.base)}</div></div></li>`; }).join('')}</ul>`;
    const frs = D.frontiers.slice().sort((a, b) => a.built - b.built);
    h += `<h3>Frontier works</h3><ul class="rows">${frs.map((f) => `<li class="row" data-id="${esc(f.id)}" data-kind="frontier"><div class="when">${esc(fmtYear(f.built))}</div><div class="what"><div class="ttl">${esc(f.name)}</div><div class="sum">${esc(f.kind || '')}${f.abandoned ? ', to ' + esc(fmtYear(f.abandoned)) : ''}</div></div></li>`).join('')}</ul>`;
    const all = D.legions.slice().sort((a, b) => (a.num ?? 99) - (b.num ?? 99) || a.name.localeCompare(b.name));
    h += `<h3>All legions</h3><ul class="rows">${all.map((l) => `<li class="row" data-id="${esc(l.id)}" data-kind="legion"><div class="when">${l.founded !== undefined ? esc(fmtYear(l.founded)) : ''}</div><div class="what"><div class="ttl">${esc(l.name)}</div><div class="sum">${esc(l.emblem || '')}</div></div></li>`).join('')}</ul>`;
    h += `<h3>Named roads</h3><ul class="rows">${D.roads.slice().sort((a, b) => (a.built ?? 0) - (b.built ?? 0)).map((r) => `<li class="row" data-id="${esc(r.id)}" data-kind="road"><div class="when">${r.built !== undefined ? esc(fmtYear(r.built)) : ''}</div><div class="what"><div class="ttl">${esc(r.name)}</div></div></li>`).join('')}</ul>`;
    return h;
  },

  rulers() {
    const y = S.year;
    let h = `<h2>Rulers and magistrates</h2><p class="lede">Emperors, consuls and the kings Rome fought.</p>`;
    // fasti window
    const ys = [];
    for (let i = -6; i <= 6; i++) { const yy = idxToYear(yearToIdx(y) + i); if (yy >= MIN_YEAR && yy <= 541) ys.push(yy); }
    const fr = ys.map((yy) => D.fastiByYear.get(yy)).filter(Boolean);
    if (fr.length) h += `<h3>Fasti consulares around ${esc(fmtYear(y))}</h3><dl class="kv">${fr.map((f) => `<dt><a class="ent" data-year="${f.year}" style="${f.year === y ? 'font-weight:700' : ''}">${esc(fmtYear(f.year))}</a></dt><dd>${esc((f.consuls?.length ? f.consuls : f.tribunes || []).join(', ') || f.note || '')}</dd>`).join('')}</dl>`;
    const emp = D.rulers.filter((g) => ['emperor', 'emperor_west', 'emperor_east'].includes(g.office));
    for (const g of emp) {
      h += `<h3>${esc(officeLabel(g.office))}s</h3><ul class="rows">${g.list.map((r) => `<li class="row${r.from <= y && (r.to ?? r.from) >= y ? ' sel' : ''}" ${exists(r.id) ? `data-id="${esc(r.id)}"` : `data-year="${r.from}"`}><div class="when">${esc(fmtYear(r.from))}<br><span class="muted">to ${esc(fmtYear(r.to))}</span></div><div class="what"><div class="ttl">${esc(r.name)}</div><div class="sum">${esc([r.dynasty, r.how].filter(Boolean).join(' · '))}</div></div></li>`).join('')}</ul>`;
    }
    const foreign = D.rulers.filter((g) => !['emperor', 'emperor_west', 'emperor_east', 'usurper', 'dictator', 'censors'].includes(g.office));
    if (foreign.length) {
      h += `<h3>Other dynasties</h3>`;
      for (const g of foreign) {
        h += `<details><summary><span class="swatch" style="background:${polityColor(g.office)}"></span>${esc(officeLabel(g.office))} <span class="meta">(${g.list.length})</span></summary><dl class="kv">${g.list.map((r) => `<dt>${esc(fmtRange(r.from, r.to))}</dt><dd>${exists(r.id) ? `<a class="ent" data-id="${esc(r.id)}">${esc(r.name)}</a>` : esc(r.name)}</dd>`).join('')}</dl></details>`;
      }
    }
    for (const off of ['usurper', 'dictator', 'censors']) {
      const g = D.rulers.find((x) => x.office === off);
      if (!g) continue;
      h += `<h3>${esc(officeLabel(off))}</h3><details><summary>${g.list.length} entries</summary><dl class="kv">${g.list.map((r) => `<dt><a class="ent" data-year="${r.from}">${esc(fmtRange(r.from, r.to))}</a></dt><dd>${esc(r.name || (r.names || []).join(' & '))}${r.region ? ` <span class="muted">${esc(r.region)}</span>` : ''}${r.purpose ? ` <span class="muted">${esc(r.purpose)}</span>` : ''}</dd>`).join('')}</dl></details>`;
    }
    return h;
  },

  city() {
    const y = S.year;
    const standing = (m) => { const st = m.begun ?? m.built; return (st === undefined || st === null || st <= y) && !(m.destroyed && m.destroyed < y); };
    let h = `<h2>Urbs</h2><p class="lede">The cities themselves. Zoom in and the monuments standing in ${esc(fmtYear(y))} appear on a faint modern street plan, with the AWMC city walls and aqueducts. Buildings under construction are pale.</p>
      <div class="filters"><button class="on" id="goRome">Fly to Rome</button><button id="goConst">Fly to Constantinople</button></div>`;
    for (const [city, label] of [['rome', 'Rome'], ['constantinople', 'Constantinople']]) {
      const list = D.monuments.filter((m) => (m.city || 'rome') === city && standing(m)).sort((a, b) => (a.built ?? -9999) - (b.built ?? -9999));
      if (!list.length) continue;
      h += `<h3>${label}: ${list.length} monuments standing</h3><ul class="rows">${list.map((m) => `<li class="row" data-id="${esc(m.id)}" data-kind="monument"><div class="when">${m.built !== undefined && m.built !== null ? esc(fmtYear(m.built)) : ''}</div><div class="what"><div class="ttl"><span class="swatch" style="background:${MON_COLORS[m.type] || '#777'}"></span>${esc(m.name)}</div><div class="sum">${esc(m.type || '')}${m.builder ? ' · ' + esc(nameOf(m.builder, 'person')) : ''}</div></div></li>`).join('')}</ul>`;
    }
    if (!D.monuments.length) h += '<p class="muted">The monuments gazetteer is still being compiled.</p>';
    return h;
  },

  coins() {
    const y = S.year;
    let h = `<h2>Nummi</h2><p class="lede">Coinage, mints and hoards in ${esc(fmtYear(y))}. <label><input type="checkbox" id="mintToggle" ${S.layers.mints ? 'checked' : ''}> show mints</label> <label><input type="checkbox" id="hoardToggle" ${S.layers.hoards ? 'checked' : ''}> show hoards</label></p>`;
    h += `<input class="textfilter" id="markQ" placeholder="Decode a mintmark, e.g. TR, SMANT, CONOB, SIS, PLON">`;
    h += `<div id="markOut"></div>`;
    const rul = rulersAt(y).filter((g) => ['emperor', 'emperor_west', 'emperor_east'].includes(g.office)).flatMap((g) => g.list);
    for (const r of rul) {
      for (const c of D.coinageByIssuer.get(r.id) || []) h += coinCard(c);
    }
    const reforms = D.coinage.filter((c) => c.kind !== 'issuer').sort((a, b) => a.year - b.year);
    const near = reforms.filter((c) => Math.abs(c.year - y) <= 40);
    if (near.length) h += `<h3>Monetary history around ${esc(fmtYear(y))}</h3><ul class="rows">${near.map((c) => `<li class="row" data-id="${esc(c.id)}" data-kind="coinage"><div class="when">${esc(fmtYear(c.year))}</div><div class="what"><div class="ttl">${esc(c.t)}</div><div class="sum">${esc((c.text || '').slice(0, 140))}</div></div></li>`).join('')}</ul>`;
    const mints = D.mints.filter((m) => (m.periods || []).some((p) => p[0] <= y && p[1] >= y));
    if (mints.length) h += `<h3>Mints striking in ${esc(fmtYear(y))}</h3><ul class="rows">${mints.map((m) => `<li class="row" data-id="${esc(m.id)}" data-kind="mint"><div class="when">${(m.marks || []).slice(0, 2).map((k) => `<span class="mark">${esc(k)}</span>`).join('')}</div><div class="what"><div class="ttl">${esc(m.name)}</div></div></li>`).join('')}</ul>`;
    if (reforms.length) h += `<h3>All reforms and milestones</h3><ul class="rows">${reforms.map((c) => `<li class="row" data-id="${esc(c.id)}" data-kind="coinage"><div class="when">${esc(fmtYear(c.year))}</div><div class="what"><div class="ttl">${esc(c.t)}</div></div></li>`).join('')}</ul>`;
    if (D.hoards.length) h += `<h3>Hoards</h3><ul class="rows">${D.hoards.slice().sort((a, b) => a.deposited - b.deposited).map((x) => `<li class="row" data-id="${esc(x.id)}" data-kind="hoard"><div class="when">${esc(fmtYear(x.deposited))}</div><div class="what"><div class="ttl">${esc(x.name)}</div><div class="sum">${esc((x.contents || '').slice(0, 110))}</div></div></li>`).join('')}</ul>`;
    return h;
  },

  tours() {
    let h = `<h2>Itinera</h2><p class="lede">Guided tours move the map and the timeline for you, stop by stop. Journeys trace a person's travels; open one and choose "Follow the march".</p>`;
    if (D.tours.length) h += `<h3>Guided tours</h3><ul class="ch-list">${D.tours.map((t) => `<li data-tour="${esc(t.id)}"><span class="ch-num">${t.stops?.length || 0} stops · ${esc(fmtRange(t.stops?.[0]?.year, t.stops?.[t.stops.length - 1]?.year))}</span><br><b>${esc(t.title)}</b></li>`).join('')}</ul>`;
    const js = D.journeys || [];
    if (js.length) h += `<h3>Journeys</h3><ul class="rows">${js.slice().sort((a, b) => a.start - b.start).map((c) => `<li class="row" data-id="${esc(c.id)}" data-kind="campaign"><div class="when">${esc(fmtYear(c.start))}</div><div class="what"><div class="ttl">${esc(c.name)}</div><div class="sum">${esc(nameOf(c.person, 'person'))}</div></div></li>`).join('')}</ul>`;
    if (!D.tours.length && !js.length) h += '<p class="muted">Tours are still being written.</p>';
    return h;
  },

  sources() {
    return `<h2>Fontes</h2><p class="lede">What survives. Bars show each work's span: solid where the text is extant, pale where it is lost or known from fragments and epitomes. The red line is the current year.</p><div id="srcGantt"></div>`;
  },

  data() {
    return `<h2>Tabulae</h2><p class="lede">The numbers behind the story. Charts follow the current year.</p><div id="charts"></div>`;
  },
};

AFTER.chronicle = () => {
  const q = document.getElementById('chQ');
  q.addEventListener('input', debounce(() => { chronicleState.q = q.value; const pos = q.selectionStart; render(); const n = document.getElementById('chQ'); n.focus(); n.setSelectionRange(pos, pos); }, 200));
  document.getElementById('chCats').addEventListener('click', (e) => { const c = e.target.dataset.c; if (!c) return; chronicleState.cats.has(c) ? chronicleState.cats.delete(c) : chronicleState.cats.add(c); S.eventFilter.cats = new Set(chronicleState.cats); emit('layers'); render(); });
  document.getElementById('chImp').addEventListener('click', (e) => { const i = parseInt(e.target.dataset.i, 10); if (!i) return; chronicleState.minImp = i; S.eventFilter.minImp = i; emit('layers'); render(); });
  document.getElementById('chEra').addEventListener('click', (e) => { if (!e.target.dataset.e) return; chronicleState.era = e.target.dataset.e === '1'; render(); });
};
function scrollChronicle() {
  const list = document.getElementById('chList');
  if (!list) return;
  list.querySelectorAll('.row.sel').forEach((r) => r.classList.remove('sel'));
  const rows = [...list.querySelectorAll('.row')];
  const hit = rows.find((r) => parseInt(r.dataset.y, 10) >= S.year);
  rows.filter((r) => parseInt(r.dataset.y, 10) === S.year).forEach((r) => r.classList.add('sel'));
  if (hit) hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
AFTER.codex = () => {
  document.getElementById('cxKinds').addEventListener('click', (e) => { const k = e.target.dataset.k; if (!k) return; codexState.kind = k; render(); });
  const q = document.getElementById('cxQ');
  q.addEventListener('input', debounce(() => { codexState.q = q.value; const pos = q.selectionStart; render(); const n = document.getElementById('cxQ'); n.focus(); n.setSelectionRange(pos, pos); }, 200));
};
AFTER.text = () => {
  panel().querySelectorAll('[data-ch]').forEach((el) => el.addEventListener('click', () => openChapter(el.dataset.ch)));
  document.getElementById('chBack')?.addEventListener('click', () => { readingChapter = null; resetRange(); render(); panel().scrollTop = 0; });
};
export function openChapter(id) {
  readingChapter = id;
  const c = D.chapters?.find((x) => x.id === id);
  if (c) { focusRange(c.from, c.to); setYear(c.from); }
  if (S.tab !== 'text') showTab('text'); else render();
  panel().scrollTop = 0;
}
AFTER.army = () => {
  document.getElementById('armyToggle')?.addEventListener('change', (e) => setLayer('legions', e.target.checked));
};
AFTER.sources = () => renderGantt();
AFTER.city = () => {
  document.getElementById('goRome')?.addEventListener('click', () => flyToCity('rome'));
  document.getElementById('goConst')?.addEventListener('click', () => flyToCity('constantinople'));
};
AFTER.coins = () => {
  document.getElementById('mintToggle')?.addEventListener('change', (e) => setLayer('mints', e.target.checked));
  document.getElementById('hoardToggle')?.addEventListener('change', (e) => setLayer('hoards', e.target.checked));
  const q = document.getElementById('markQ');
  q?.addEventListener('input', () => {
    const norm = (x) => x.toUpperCase().replace(/[^\p{L}]/gu, '');
    const v = norm(q.value);
    const out = document.getElementById('markOut');
    if (v.length < 2) { out.innerHTML = ''; return; }
    const scored = [];
    for (const m of D.mints) {
      let best = 0, hit = [];
      for (const k of m.marks || []) {
        const n = norm(k);
        if (!n || (n.length < 2 && v.length > 2)) continue;
        let sc = 0;
        if (n === v) sc = 100;
        else if (v.includes(n)) sc = n.length * 10;
        else if (v.length >= 3 && n.includes(v)) sc = v.length * 8;
        if (sc > best) { best = sc; hit = [k]; } else if (sc && sc === best) hit.push(k);
      }
      if (best) scored.push({ m, best, hit });
    }
    scored.sort((a, b) => b.best - a.best);
    const top = scored.filter((x) => x.best >= scored[0]?.best * 0.6).slice(0, 5);
    out.innerHTML = top.length ? `<ul class="rows">${top.map(({ m, hit }) => `<li class="row" data-id="${esc(m.id)}" data-kind="mint"><div class="when">${hit.slice(0, 2).map((k) => `<span class="mark">${esc(k)}</span>`).join(' ')}</div><div class="what"><div class="ttl">${esc(m.name)}</div><div class="sum">${(m.periods || []).map((p) => esc(fmtRange(p[0], p[1]))).join(', ')}</div></div></li>`).join('')}</ul>` : '<p class="muted">No mint matches that mark. Marks wrap the mint letters in SM (sacra moneta) and officina letters (P, S, T, Q or Greek numerals): try the core letters, such as ANT, TR or CON.</p>';
  });
};
AFTER.tours = () => {
  panel().querySelectorAll('[data-tour]').forEach((el) => el.addEventListener('click', () => {
    const t = D.tours.find((x) => x.id === el.dataset.tour);
    if (t) { document.getElementById('app').classList.add('panel-closed'); startTour(t); }
  }));
};
AFTER.data = () => renderCharts(document.getElementById('charts'));

function renderGantt() {
  const host = document.getElementById('srcGantt');
  if (!host) return;
  const rows = [];
  for (const s of D.sources) for (const w of s.works || []) if (w.covers) rows.push({ s, w });
  rows.sort((a, b) => a.w.covers[0] - b.w.covers[0] || a.w.covers[1] - b.w.covers[1]);
  const W = 360, rh = 15, lw = 0, H = rows.length * rh + 24;
  const x = (y) => lw + ((yearToIdx(Math.max(MIN_YEAR - 250, Math.min(MAX_YEAR, y))) - yearToIdx(MIN_YEAR - 250)) / (yearToIdx(MAX_YEAR) - yearToIdx(MIN_YEAR - 250))) * (W - lw);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="font-family:var(--ui)">`;
  for (const yy of [-500, -250, 1, 250, 500]) svg += `<line x1="${x(yy)}" x2="${x(yy)}" y1="0" y2="${H - 14}" stroke="#D8D5CC"/><text x="${x(yy)}" y="${H - 2}" font-size="9.5" fill="#8A7E73" text-anchor="middle">${esc(fmtYear(yy))}</text>`;
  rows.forEach((r, i) => {
    const y0 = i * rh + 2;
    const c = r.w.covers;
    svg += `<g data-id="${esc(r.s.id)}" data-kind="source" style="cursor:pointer"><title>${esc(r.s.name)}, ${esc(r.w.t)} (${esc(fmtRange(c[0], c[1]))})</title><rect x="${x(c[0])}" y="${y0}" width="${Math.max(2, x(c[1]) - x(c[0]))}" height="${rh - 4}" fill="#E6D7C2" rx="2"/>`;
    for (const iv of r.w.extant || []) svg += `<rect x="${x(iv[0])}" y="${y0}" width="${Math.max(2, x(iv[1]) - x(iv[0]))}" height="${rh - 4}" fill="#6B2346" rx="2"/>`;
    const tx = x(c[1]) + 4 < W - 90 ? x(c[1]) + 4 : x(c[0]) - 4;
    svg += `<text x="${tx}" y="${y0 + 9}" font-size="9.5" fill="#2A211C" text-anchor="${tx < x(c[0]) ? 'end' : 'start'}">${esc(r.s.name)}${r.s.works.length > 1 ? ', ' + esc(r.w.t.slice(0, 18)) : ''}</text></g>`;
  });
  svg += `<line id="srcHead" x1="${x(S.year)}" x2="${x(S.year)}" y1="0" y2="${H - 14}" stroke="#B03A2E" stroke-width="1.5"/></svg>`;
  host.innerHTML = svg;
  host.dataset.scale = JSON.stringify({ W, lw });
}
function renderSourcesHead() { renderGantt(); }
