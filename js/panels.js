// Left panel tabs: year, chronicle, wars, codex, text, army, rulers, sources, data.
import { D, statsAt, rulersAt, sourcesCovering, warsActive, controlAt, nameOf, exists, loadChapters } from './data.js';
import { S, on, select, setYear, emit, setLayer } from './state.js';
import { esc, fmtYear, fmtRange, fmtNum, impDots, richText, paragraphs, auc, eraOf, ERAS, STATUS_LABEL, MIN_YEAR, MAX_YEAR, yearToIdx, idxToYear, debounce } from './util.js';
import { eventRows, openId } from './detail.js';
import { polityColor, colorFor, legionShort } from './map.js';
import { focusRange, resetRange } from './timeline.js';
import { renderCharts } from './charts.js';

const panel = () => document.getElementById('panel');
const CATS = ['military', 'political', 'constitutional', 'law', 'religious', 'cultural', 'economic', 'social', 'administrative', 'diplomatic', 'disaster', 'literature', 'technology'];
let chronicleState = { q: '', era: true, minImp: 1, cats: new Set() };
let codexState = { kind: 'person', q: '' };
let readingChapter = null;

export function initPanels() {
  document.querySelectorAll('.rail button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  panel().addEventListener('click', (e) => {
    const t = e.target.closest('[data-id]');
    if (t && !t.closest('[data-noopen]')) { openId(t.dataset.id, t.dataset.kind); return; }
    const y = e.target.closest('[data-year]');
    if (y) setYear(parseInt(y.dataset.year, 10));
  });
  on('year', debounce(() => { if (['year', 'army', 'rulers'].includes(S.tab)) render(); if (S.tab === 'chronicle') scrollChronicle(); if (S.tab === 'sources') renderSourcesHead(); }, 120));
  showTab(S.tab);
}

export function showTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.rail button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('app').classList.remove('panel-closed');
  render();
  panel().scrollTop = 0;
  if (tab === 'chronicle') scrollChronicle();
}

function render() {
  const fn = TABS[S.tab] || TABS.year;
  const html = fn();
  if (html !== null) panel().innerHTML = `<div class="panel-inner">${html}</div>`;
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
    let h = `<h2>Wars and campaigns</h2><p class="lede">${D.wars.length} wars and ${D.campaigns.length} mapped campaigns. Campaign routes animate on the map in their years; open one and choose "Follow the march".</p>`;
    const byEra = ERAS.map((er) => ({ er, wars: sorted.filter((w) => w.start >= er.from && w.start <= er.to) }));
    for (const { er, wars } of byEra) {
      if (!wars.length) continue;
      h += `<h3>${esc(er.name)}</h3><ul class="rows">${wars.map((w) => {
        const camps = D.campaignsByWar.get(w.id) || [];
        return `<li class="row" data-id="${esc(w.id)}" data-kind="war"><div class="when">${esc(fmtYear(w.start))}<br><span class="muted">${w.end && w.end !== w.start ? 'to ' + esc(fmtYear(w.end)) : ''}</span></div>
        <div class="what"><div class="ttl">${esc(w.name)}</div><div class="sum">${esc(w.outcome || '')}</div>${camps.length ? `<div class="tags">${camps.map((c) => `<span class="tag" data-id="${esc(c.id)}" data-kind="campaign">${esc(c.name)}</span>`).join('')}</div>` : ''}</div></li>`;
      }).join('')}</ul>`;
    }
    const orphans = D.campaigns.filter((c) => !c.war || !exists(c.war));
    if (orphans.length) h += `<h3>Other campaigns</h3><ul class="rows">${orphans.map((c) => `<li class="row" data-id="${esc(c.id)}" data-kind="campaign"><div class="when">${esc(fmtYear(c.start))}</div><div class="what"><div class="ttl">${esc(c.name)}</div></div></li>`).join('')}</ul>`;
    return h;
  },

  codex() {
    const cs = codexState;
    const kinds = [['person', 'People', D.people], ['place', 'Places', D.places], ['polity', 'States and peoples', D.polities], ['glossary', 'Terms', D.glossary], ['region', 'Regions', D.regions], ['event', 'Events', D.events]];
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
