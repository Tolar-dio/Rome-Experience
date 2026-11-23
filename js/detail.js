// Right-hand article drawer for any entity.
import { D, lookup, nameOf, exists, controlAt, loadTactics } from './data.js';
import { S, on, select, setYear } from './state.js';
import { esc, fmtYear, fmtRange, fmtDate, paragraphs, richText, impDots, STATUS_LABEL, KIND_LABEL, MIN_YEAR, MAX_YEAR, yearToIdx, monthName } from './util.js';
import { polityColor, colorFor, playMarch, stopMarch, fit, legionShort } from './map.js';
import { focusRange } from './timeline.js';
import { renderTactic } from './tactics.js';
import { showLifePath, clearLifePath, MON_COLORS } from './extras.js';

const box = () => document.getElementById('detail');
const history = [];

export function initDetail() {
  on('select', (sel) => { if (sel) render(sel); else close(); });
  box().addEventListener('click', (e) => {
    const a = e.target.closest('[data-id]');
    if (a && !a.dataset.action) { e.preventDefault(); openId(a.dataset.id, a.dataset.kind); return; }
    const act = e.target.closest('[data-action]');
    if (act) action(act.dataset.action, act.dataset);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box().hidden && !document.querySelector('.modal:not([hidden])')) select(null); });
}

export function openId(id, kind) {
  const r = lookup(id, kind);
  if (!r) return;
  select(r.kind, id);
  if (r.kind === 'event') setYear(r.obj.year);
}

let collapsedPanel = false;
function close() {
  document.getElementById('legend').style.display = '';
  if (collapsedPanel) { document.getElementById('app').classList.remove('panel-closed'); collapsedPanel = false; }
  box().hidden = true; box().innerHTML = ''; stopMarch(); document.getElementById('march').hidden = true; }

function action(act, ds) {
  const sel = S.selected;
  const r = sel && lookup(sel.id, sel.kind);
  if (act === 'close') select(null);
  if (act === 'year') setYear(parseInt(ds.y, 10));
  if (act === 'back' && history.length > 1) { history.pop(); const prev = history.pop(); select(prev.kind, prev.id); }
  if (act === 'march' && r) startMarch(r.obj);
  if (act === 'range' && r) { focusRange(parseInt(ds.a, 10), parseInt(ds.b, 10)); setYear(parseInt(ds.a, 10)); }
  if (act === 'fly') fit([[parseFloat(ds.lon), parseFloat(ds.lat)]]);
  if (act === 'life' && r) { const evs = showLifePath(r.obj); if (evs.length) fit(evs.map((e) => e.loc)); }
  if (act === 'adjacent' && r) {
    const i = D.events.indexOf(r.obj);
    const e = D.events[i + (ds.dir === 'next' ? 1 : -1)];
    if (e) openId(e.id, 'event');
  }
}

function startMarch(c) {
  const panel = document.getElementById('march');
  panel.hidden = false;
  document.getElementById('legend').style.display = 'none';
  const pts = (c.path || []).filter((p) => Array.isArray(p.loc));
  panel.innerHTML = `<h4>${esc(c.name)}</h4><div class="mc-step" id="mcStep">Setting out</div><div class="mc-bar"><i id="mcBar"></i></div>
    <div class="mc-ctl"><button id="mcReplay">Replay</button><button id="mcClose">Close</button></div>`;
  panel.querySelector('#mcClose').onclick = () => { stopMarch(); panel.hidden = true; document.getElementById('legend').style.display = ''; };
  panel.querySelector('#mcReplay').onclick = () => startMarch(c);
  playMarch(c, (i, p, n) => {
    if (i < 0) { panel.querySelector('#mcStep').innerHTML += ' <span class="muted">(end)</span>'; return; }
    const when = [p.d, p.m ? monthName(p.m) : null, p.y !== undefined ? fmtYear(p.y) : null].filter(Boolean).join(' ');
    panel.querySelector('#mcStep').innerHTML = `<b>${esc(p.t || '')}</b>${when ? ` <span class="meta">${esc(when)}</span>` : ''}${p.note ? `<br>${richText(p.note, exists)}` : ''}`;
    panel.querySelector('#mcBar').style.width = `${((i + 1) / n) * 100}%`;
    if (p.y !== undefined) setYear(p.y);
  });
}

// ---------- building blocks
const link = (id, label, kind) => (id ? (exists(id) ? `<a class="ent" data-id="${esc(id)}"${kind ? ` data-kind="${kind}"` : ''}>${esc(label || nameOf(id, kind))}</a>` : `<span>${esc(label || id.replace(/_/g, ' '))}</span>`) : '');
const swatch = (pid) => `<span class="swatch" style="background:${polityColor(pid)}"></span>`;
const polityLink = (pid) => `${swatch(pid)}${link(pid, D.polity.get(pid)?.name, 'polity')}`;
const cert = (c) => (c && c !== 'certain' ? `<span class="cert ${esc(c)}">${esc(c)}</span>` : '');

function sourcesBlock(srcs, scholarship) {
  if (!srcs?.length && !scholarship?.length) return '';
  const li = (srcs || []).map((s) => `<li><i>${esc(s.a)}</i>${s.w ? `, ${esc(s.w)}` : ''}${s.r ? ` ${esc(s.r)}` : ''}</li>`).join('');
  const sch = (scholarship || []).map((s) => `<li>${esc(s)}</li>`).join('');
  return `<h4>Sources</h4><ul class="cite">${li}</ul>${sch ? `<h4>Modern scholarship</h4><ul class="cite">${sch}</ul>` : ''}`;
}

export function eventRows(evs, max = 400) {
  return `<ul class="rows">${evs.slice(0, max).map((e) => `<li class="row" data-id="${esc(e.id)}" data-kind="event">
    <div class="when">${esc(fmtYear(e.year))}${e.month ? `<br><span class="muted">${esc(monthName(e.month).slice(0, 3))}${e.day ? ' ' + e.day : ''}</span>` : ''}</div>
    <div class="what"><div class="ttl">${esc(e.title)}${impDots(e.importance)}</div>${e.summary ? `<div class="sum">${esc(trim(e.summary, 150))}</div>` : ''}</div></li>`).join('')}</ul>${evs.length > max ? `<p class="meta">and ${evs.length - max} more</p>` : ''}`;
}
const trim = (s, n) => (s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s || '');

function head(kind, title, sub, extra = '') {
  return `<div class="d-head"><div class="d-kind">${kind}</div><h2 class="d-title">${esc(title)}</h2>${sub ? `<div class="d-sub">${sub}</div>` : ''}
    <button class="d-close" data-action="close" aria-label="Close">×</button>
    <div class="d-nav">${history.length > 1 ? '<button data-action="back">Back</button>' : ''}${extra}</div></div>`;
}

function controlStrip(reg) {
  const w = 400, h = 22;
  const x = (y) => ((yearToIdx(y) - yearToIdx(MIN_YEAR)) / (yearToIdx(MAX_YEAR) - yearToIdx(MIN_YEAR))) * w;
  const segs = reg.ctl.map((c) => `<rect x="${x(c[0]).toFixed(1)}" width="${Math.max(0.8, x(c[1]) - x(c[0]) + 0.4).toFixed(1)}" y="0" height="${h}" fill="${colorFor(c[2], D.statuses[c[3]])}"><title>${esc(fmtRange(c[0], c[1]))}: ${esc(D.polities[c[2]]?.name || '—')} (${esc(STATUS_LABEL[D.statuses[c[3]]] || '')})</title></rect>`).join('');
  const head = `<line x1="${x(S.year)}" x2="${x(S.year)}" y1="-3" y2="${h + 3}" stroke="#6B2346" stroke-width="2"/>`;
  return `<svg class="mini-tl" viewBox="-2 -4 ${w + 4} ${h + 18}" width="100%">${segs}${head}
    <text x="0" y="${h + 13}" font-size="10" fill="#8A7E73">${fmtYear(MIN_YEAR)}</text><text x="${w}" y="${h + 13}" font-size="10" fill="#8A7E73" text-anchor="end">AD ${MAX_YEAR}</text></svg>`;
}

// ---------- renderers
export function coinCard(c) {
  const list = (arr) => (arr || []).map((x) => `<span class="mark">${esc(x)}</span>`).join(' ');
  const mintNames = (c.mints || []).map((m) => (exists(m) ? link(m, null, 'mint') : esc(m))).join(', ');
  let h = `<div class="coin-card"><h5>${esc(c.t || '')}</h5>`;
  if (c.standard) h += `<p class="meta">${esc(c.standard)}</p>`;
  if ((c.denominations || []).length) h += `<p class="meta">${list(c.denominations)}</p>`;
  h += paragraphs(c.text, exists);
  const kv = [];
  if (c.legends?.length) kv.push(['Legends', c.legends.map((l) => `<span style="font-family:var(--ui);letter-spacing:.04em">${esc(l)}</span>`).join('<br>')]);
  if (c.keyTypes?.length) kv.push(['Key types', c.keyTypes.map(esc).join('; ')]);
  if (mintNames) kv.push(['Mints', mintNames]);
  if (c.rarity) kv.push(['Rarity', esc(c.rarity)]);
  if (c.dating) kv.push(['Dating', esc(c.dating)]);
  if (c.confusions) kv.push(['Watch for', esc(c.confusions)]);
  if (kv.length) h += `<dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  if (c.sources?.length) h += `<p class="meta">${c.sources.map((x) => `${esc(x.a || '')}${x.w ? ', ' + esc(x.w) : ''}${x.r ? ' ' + esc(x.r) : ''}`).join('; ')}</p>`;
  return h + '</div>';
}

const R = {
  event(e) {
    const b = e.battle;
    const war = e.war ? `${link(e.war, null, 'war')}` : '';
    let html = head(`${esc(e.type || 'event')} · ${fmtDate(e)}${e.endYear ? ' to ' + fmtYear(e.endYear) : ''}`, e.title, [war, e.locName ? esc(e.locName) : ''].filter(Boolean).join(' · '),
      `<button data-action="adjacent" data-dir="prev">Previous event</button><button data-action="adjacent" data-dir="next">Next event</button>`);
    html += `<div class="d-body"><p class="summary">${richText(e.summary, exists)} ${cert(e.certainty)}</p>`;
    if (b) {
      html += `<div class="battle-card">${(b.sides || []).map((s) => `<div><div class="bc-side">${s.faction ? `${swatch(s.polity)}${esc(s.faction)}` : polityLink(s.polity)}${(b.victorFaction ? b.victorFaction === s.faction : b.victor === s.polity) ? '<span class="bc-win">victor</span>' : ''}</div>
        ${s.commanders?.length ? `<div class="bc-k">Commanders</div>${s.commanders.map((c) => link(c, null, 'person')).join(', ')}` : ''}
        ${s.strength ? `<div class="bc-k">Strength</div>${esc(s.strength)}` : ''}${s.losses ? `<div class="bc-k">Losses</div>${esc(s.losses)}` : ''}</div>`).join('')}</div>`;
      if (b.significance) html += `<p><b>Significance.</b> ${richText(b.significance, exists)}</p>`;
      html += `<div id="tacticHost"></div>`;
    }
    if (e.detail) html += paragraphs(e.detail, exists);
    if (e.debate) html += `<h4>What is disputed</h4><div class="debate">${richText(e.debate, exists)}</div>`;
    const ppl = (e.people || []).filter(Boolean);
    if (ppl.length) html += `<h4>People</h4><p>${ppl.map((p) => link(p, null, 'person')).join(', ')}</p>`;
    if (e.polities?.length) html += `<h4>States and peoples</h4><p>${e.polities.map(polityLink).join(' &nbsp; ')}</p>`;
    if (e.place && exists(e.place)) html += `<h4>Place</h4><p>${link(e.place, null, 'place')}</p>`;
    html += sourcesBlock(e.sources, e.scholarship);
    if (e.tags?.length) html += `<p class="meta">${e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>`;
    return html + '</div>';
  },
  person(p) {
    const life = `${p.born ? fmtYear(p.born) : '?'} to ${p.died ? fmtYear(p.died) : '?'}`;
    const nEv = (D.rev.person.get(p.id) || []).filter((e) => Array.isArray(e.loc)).length;
    let html = head(`Person · ${esc((p.kind || []).join(', '))}`, p.name, `${esc(p.fullName && p.fullName !== p.name ? p.fullName + ' · ' : '')}${esc(life)}`,
      (p.born || p.died ? `<button data-action="year" data-y="${p.roles?.[0]?.from ?? p.born ?? p.died}">Go to their time</button>` : '') + (nEv > 1 ? `<button data-action="life">Map their life (${nEv} places)</button>` : ''));
    html += `<div class="d-body"><p class="summary">${richText(p.summary, exists)} ${cert(p.bornCertainty === 'approx' ? '' : p.certainty)}</p>`;
    if (p.roles?.length) html += `<h4>Offices and roles</h4><dl class="kv">${p.roles.map((r) => `<dt>${esc(fmtRange(r.from, r.to))}</dt><dd>${esc(r.t)}</dd>`).join('')}</dl>`;
    if (p.detail) html += paragraphs(p.detail, exists);
    if (p.death) html += `<p><b>Death.</b> ${esc(p.death)}</p>`;
    const coins = D.coinageByIssuer?.get(p.id) || [];
    if (coins.length) html += `<h4>Coinage</h4>${coins.map(coinCard).join('')}`;
    const evs = D.rev.person.get(p.id) || [];
    if (evs.length) html += `<h4>In the chronicle (${evs.length})</h4>${eventRows(evs)}`;
    if (p.related?.length) html += `<h4>Connected people</h4><p>${p.related.map((r) => link(r, null, 'person')).join(', ')}</p>`;
    if (p.polity) html += `<p class="meta">${polityLink(p.polity)}${p.gens ? ` · gens ${esc(p.gens)}` : ''}</p>`;
    return html + sourcesBlock(p.sources, p.scholarship) + '</div>';
  },
  war(w) {
    let html = head(`War · ${fmtRange(w.start, w.end)}`, w.name, w.outcome ? esc(w.outcome) : '', `<button data-action="range" data-a="${w.start}" data-b="${w.end ?? w.start}">Focus timeline</button>`);
    html += `<div class="d-body">`;
    if (w.sides?.length) html += `<div class="battle-card">${w.sides.map((side) => `<div>${side.map(polityLink).join('<br>')}</div>`).join('')}</div>`;
    html += `<p class="summary">${richText(w.summary, exists)}</p>`;
    if (w.detail) html += paragraphs(w.detail, exists);
    if (w.phases?.length) html += `<h4>Phases</h4><dl class="kv">${w.phases.map((p) => `<dt>${esc(fmtRange(p.from, p.to))}</dt><dd>${richText(p.t, exists)}</dd>`).join('')}</dl>`;
    const camps = D.campaignsByWar.get(w.id) || [];
    if (camps.length) html += `<h4>Campaigns</h4><ul class="rows">${camps.map((c) => `<li class="row" data-id="${esc(c.id)}" data-kind="campaign"><div class="when">${esc(fmtRange(c.start, c.end))}</div><div class="what"><div class="ttl">${esc(c.name)}</div><div class="sum">${esc(trim(c.summary, 120))}</div></div></li>`).join('')}</ul>`;
    const evs = (D.rev.war.get(w.id) || []).slice().sort((a, b) => a.year - b.year || (a.month || 13) - (b.month || 13));
    if (evs.length) html += `<h4>Events and battles (${evs.length})</h4>${eventRows(evs)}`;
    return html + sourcesBlock(w.sources, w.scholarship) + '</div>';
  },
  campaign(c) {
    let html = head(`${c.kind === 'journey' ? 'Journey' : 'Campaign'} · ${fmtRange(c.start, c.end)}`, c.name, [c.commander || c.person ? link(c.commander || c.person, null, 'person') : '', c.war ? link(c.war, null, 'war') : ''].filter(Boolean).join(' · '),
      `<button data-action="march">${c.kind === 'journey' ? 'Follow the journey' : 'Follow the march'}</button>`);
    html += `<div class="d-body"><p class="summary">${richText(c.summary, exists)} ${cert(c.certainty)}</p>`;
    if (c.strength) html += `<p><b>Forces.</b> ${esc(c.strength)}</p>`;
    if (c.note) html += `<div class="debate">${richText(c.note, exists)}</div>`;
    html += `<h4>Route</h4><dl class="kv">${(c.path || []).filter((p) => !p.marine).map((p) => `<dt>${esc([p.d, p.m ? monthName(p.m).slice(0, 3) : '', p.y !== undefined ? fmtYear(p.y) : ''].filter(Boolean).join(' '))}</dt><dd><a class="ent" data-action="fly" data-lon="${p.loc?.[0]}" data-lat="${p.loc?.[1]}">${esc(p.t || '')}</a>${p.note ? ` <span class="muted">${richText(p.note, exists)}</span>` : ''}${p.event && exists(p.event) ? ` ${link(p.event, '→ event', 'event')}` : ''}</dd>`).join('')}</dl>`;
    return html + '</div>';
  },
  place(p) {
    let html = head(`Place · ${esc((p.type || []).join(', ').replace(/_/g, ' '))}`, p.name, [p.greek ? `<i>${esc(p.greek)}</i>` : '', p.modern ? esc(p.modern) : ''].filter(Boolean).join(' · '));
    html += `<div class="d-body"><p class="summary">${richText(p.summary, exists)}</p><dl class="kv">`;
    if (p.founded !== undefined && p.founded !== null) html += `<dt>Founded</dt><dd>${esc(fmtYear(p.founded))}${p.foundedNote ? ` <span class="muted">${esc(p.foundedNote)}</span>` : ''}</dd>`;
    (p.status || []).forEach((s) => { html += `<dt>${esc(fmtYear(s.from))}</dt><dd>${esc(s.t)}</dd>`; });
    if (p.loc) html += `<dt>Coordinates</dt><dd>${p.loc[1].toFixed(3)}° N, ${p.loc[0].toFixed(3)}° E</dd>`;
    if (p.pleiades) html += `<dt>Pleiades</dt><dd><a href="https://pleiades.stoa.org/places/${esc(p.pleiades)}" target="_blank" rel="noopener">${esc(p.pleiades)}</a></dd>`;
    html += '</dl>';
    const evs = D.events.filter((e) => e.place === p.id || (Array.isArray(e.loc) && p.loc && Math.abs(e.loc[0] - p.loc[0]) < 0.08 && Math.abs(e.loc[1] - p.loc[1]) < 0.08));
    if (evs.length) html += `<h4>Events here (${evs.length})</h4>${eventRows(evs)}`;
    const legs = D.legions.filter((l) => (l.stations || []).some((s) => s.loc && p.loc && Math.abs(s.loc[0] - p.loc[0]) < 0.12 && Math.abs(s.loc[1] - p.loc[1]) < 0.12));
    if (legs.length) html += `<h4>Legions based here</h4><p>${legs.map((l) => link(l.id, l.name, 'legion')).join(', ')}</p>`;
    return html + '</div>';
  },
  polity(p) {
    let html = head(`State or people · ${esc(p.type || '')}`, p.name, `${esc(fmtRange(p.start, p.end))}`);
    html += `<div class="d-body">`;
    if (p.summary) html += `<p class="summary">${richText(p.summary, exists)}</p>`;
    const held = D.regions.filter((r) => { const c = controlAt(r, S.year); return c && D.polities[c[2]]?.id === p.id; });
    if (held.length) html += `<h4>Holds in ${fmtYear(S.year)}</h4><p>${held.map((r) => `${link(r.id, r.name, 'region')} <span class="muted">(${esc(STATUS_LABEL[D.statuses[controlAt(r, S.year)[3]]])})</span>`).join(', ')}</p>`;
    const rul = D.rulers.find((g) => g.office === p.id);
    if (rul) html += `<h4>Rulers</h4><dl class="kv">${rul.list.map((r) => `<dt>${esc(fmtRange(r.from, r.to))}</dt><dd>${link(r.id, r.name, 'person')}${r.how ? ` <span class="muted">${esc(r.how)}</span>` : ''}</dd>`).join('')}</dl>`;
    const wars = D.wars.filter((w) => (w.sides || []).flat().includes(p.id));
    if (wars.length) html += `<h4>Wars</h4><ul class="rows">${wars.map((w) => `<li class="row" data-id="${esc(w.id)}" data-kind="war"><div class="when">${esc(fmtYear(w.start))}</div><div class="what"><div class="ttl">${esc(w.name)}</div></div></li>`).join('')}</ul>`;
    const evs = D.rev.polity.get(p.id) || [];
    if (evs.length) html += `<h4>In the chronicle (${evs.length})</h4>${eventRows(evs, 120)}`;
    return html + '</div>';
  },
  legion(l) {
    let html = head('Legion', l.name, `${l.founded !== undefined ? 'raised ' + esc(fmtYear(l.founded)) : ''}${l.founder ? ' by ' + link(l.founder, null, 'person') : ''}${l.ended ? ' · last attested ' + esc(fmtYear(l.ended)) : ''}`);
    html += `<div class="d-body"><p class="summary">${richText(l.summary, exists)} ${cert(l.certainty)}</p>`;
    if (l.emblem) html += `<p><b>Emblem.</b> ${esc(l.emblem)}</p>`;
    if (l.endNote) html += `<p><b>End.</b> ${richText(l.endNote, exists)}</p>`;
    if (l.stations?.length) html += `<h4>Bases</h4><dl class="kv">${l.stations.map((s) => `<dt>${esc(fmtRange(s.from, s.to))}</dt><dd>${s.loc ? `<a class="ent" data-action="fly" data-lon="${s.loc[0]}" data-lat="${s.loc[1]}">${esc(s.base)}</a>` : esc(s.base)}</dd>`).join('')}</dl>`;
    if (l.wars?.length) html += `<h4>Wars</h4><p>${l.wars.map((w) => link(w, null, 'war')).join(', ')}</p>`;
    return html + '</div>';
  },
  frontier(f) {
    let html = head(`Frontier · ${esc(f.kind || '')}`, f.name, `${esc(fmtYear(f.built))}${f.abandoned ? ' to ' + esc(fmtYear(f.abandoned)) : ''}`);
    html += `<div class="d-body"><p class="summary">${richText(f.summary, exists)}</p>`;
    if (f.phases?.length) html += `<dl class="kv">${f.phases.map((p) => `<dt>${esc(fmtRange(p.from, p.to))}</dt><dd>${richText(p.t, exists)}</dd>`).join('')}</dl>`;
    return html + '</div>';
  },
  road(r) {
    let html = head('Road', r.name, `${r.built !== undefined ? 'built ' + esc(fmtYear(r.built)) : ''}${r.builder ? ' by ' + link(r.builder, null, 'person') : ''}`);
    html += `<div class="d-body"><p class="summary">${richText(r.summary, exists)}</p>`;
    if (r.extended?.length) html += `<dl class="kv">${r.extended.map((x) => `<dt>${esc(fmtYear(x.y))}</dt><dd>${esc(x.t)}</dd>`).join('')}</dl>`;
    return html + '</div>';
  },
  source(s) {
    let html = head(`Ancient source · ${esc(s.lang || '')}`, s.name, `${esc(s.latin || '')} ${s.born || s.died ? '· ' + esc(fmtRange(s.born, s.died)) : ''}`);
    html += `<div class="d-body"><p class="summary">${richText(s.summary, exists)}</p>`;
    for (const w of s.works || []) {
      html += `<h4>${esc(w.t)}</h4>${w.covers ? `<p class="meta">covers ${esc(fmtRange(w.covers[0], w.covers[1]))}${w.extant?.length ? ` · extant for ${w.extant.map((iv) => esc(fmtRange(iv[0], iv[1]))).join(', ')}` : ' · lost or fragmentary'}</p>` : ''}${w.books ? `<p>${esc(w.books)}</p>` : ''}${w.covers ? `<button class="chip" data-action="range" data-a="${w.covers[0]}" data-b="${w.covers[1]}">Show its span</button>` : ''}`;
    }
    if (s.reliability) html += `<h4>Reliability</h4><div class="debate">${richText(s.reliability, exists)}</div>`;
    return html + '</div>';
  },
  glossary(g) {
    let html = head(`Term · ${esc(g.lang || '')}`, g.term, '');
    html += `<div class="d-body"><p class="summary">${richText(g.def, exists)}</p>`;
    if (g.related?.length) html += `<h4>Related</h4><p>${g.related.map((r) => link(r)).join(', ')}</p>`;
    return html + '</div>';
  },
  province(pv) {
    let html = head(`${esc(pv.type || 'province')} · ${esc(fmtYear(pv.created))}${pv.ended ? ' to ' + esc(fmtYear(pv.ended)) : ''}`, pv.name, [pv.capital ? `capital ${link(pv.capital, pv.capitalName, 'place')}` : pv.capitalName ? `capital ${esc(pv.capitalName)}` : '', pv.diocese ? `diocese ${esc(pv.diocese)}` : '', pv.prefecture ? `prefecture ${esc(pv.prefecture)}` : ''].filter(Boolean).join(' · '),
      `<button data-action="year" data-y="${pv.created}">Go to its creation</button>`);
    html += `<div class="d-body"><p class="summary">${richText(pv.summary, exists)}</p>`;
    if (pv.createdNote) html += `<p class="meta">${esc(pv.createdNote)}</p>`;
    if (pv.governor) html += `<p><b>Governor.</b> ${esc(pv.governor)}</p>`;
    if (pv.garrison) html += `<p><b>Garrison.</b> ${richText(pv.garrison, exists)}</p>`;
    if (pv.phases?.length) html += `<h4>Status over time</h4><dl class="kv">${pv.phases.map((p) => `<dt>${esc(fmtRange(p.from, p.to))}</dt><dd>${richText(p.t, exists)}</dd>`).join('')}</dl>`;
    const kids = D.provinces.filter((x) => x.parent === pv.id || (pv.type === 'diocese' && x.diocese && pv.name.includes(x.diocese)));
    if (kids.length) html += `<h4>Provinces within</h4><p>${kids.map((k) => link(k.id, k.name, 'province')).join(', ')}</p>`;
    if (pv.successors?.length) html += `<h4>Succeeded by</h4><p>${pv.successors.map((k) => link(k, null, 'province')).join(', ')}</p>`;
    return html + sourcesBlock(pv.sources) + '</div>';
  },
  monument(m) {
    const city = m.city === 'constantinople' ? 'Constantinople' : 'Rome';
    let html = head(`${city} · ${esc(m.type || 'monument')}`, m.name, [m.begun && m.begun !== m.built ? `begun ${esc(fmtYear(m.begun))}` : '', m.built !== undefined && m.built !== null ? `dedicated ${esc(fmtYear(m.built))}` : '', m.builder ? link(m.builder, null, 'person') : ''].filter(Boolean).join(' · '),
      m.built !== undefined && m.built !== null ? `<button data-action="year" data-y="${m.built}">Go to its dedication</button>` : '');
    html += `<div class="d-body"><p class="summary"><span class="swatch" style="background:${MON_COLORS[m.type] || '#777'}"></span>${richText(m.summary, exists)}</p>`;
    if (m.phases?.length) html += `<h4>History</h4><dl class="kv">${m.phases.map((p) => `<dt><a class="ent" data-action="year" data-y="${p.y}">${esc(fmtYear(p.y))}</a></dt><dd>${richText(p.t, exists)}</dd>`).join('')}</dl>`;
    if (m.destroyed) html += `<p><b>End.</b> ${esc(fmtYear(m.destroyed))}</p>`;
    return html + sourcesBlock(m.sources) + '</div>';
  },
  mint(m) {
    let html = head('Mint', m.name, (m.periods || []).map((p) => esc(fmtRange(p[0], p[1]))).join(', '));
    html += `<div class="d-body">${(m.marks || []).length ? `<p>${m.marks.map((k) => `<span class="mark">${esc(k)}</span>`).join(' ')}</p>` : ''}<p class="summary">${richText(m.notes || m.summary, exists)}</p>`;
    if (m.issuers?.length) html += `<h4>Struck for</h4><p>${m.issuers.map((i) => link(i, null, 'person')).join(', ')}</p>`;
    return html + '</div>';
  },
  hoard(h) {
    let html = head('Coin hoard', h.name, `deposited ${esc(fmtYear(h.deposited))}${h.found ? ` · found ${esc(String(h.found))}` : ''}${h.where ? ` · ${esc(h.where)}` : ''}`);
    html += `<div class="d-body"><p class="summary">${richText(h.contents, exists)}</p>${h.significance ? `<p>${richText(h.significance, exists)}</p>` : ''}</div>`;
    return html;
  },
  site(s) {
    let html = head(`${esc(s.theme || '')} · ${esc(s.kind || '')}`, s.name, `${s.from !== undefined ? esc(fmtYear(s.from)) : ''}${s.to !== undefined && s.to !== null ? ' to ' + esc(fmtYear(s.to)) : ''}${s.commodity ? ' · ' + esc(s.commodity) : ''}`,
      s.from !== undefined ? `<button data-action="year" data-y="${s.from}">Go to ${esc(fmtYear(s.from))}</button>` : '');
    return html + `<div class="d-body">${s.bishop ? `<p><b>First attested bishop.</b> ${esc(s.bishop)}</p>` : ''}<p class="summary">${richText(s.summary, exists)} ${cert(s.certainty)}</p>${s.place && exists(s.place) ? `<p class="meta">Place: ${link(s.place, null, 'place')}</p>` : ''}${s.event && exists(s.event) ? `<p class="meta">Event: ${link(s.event, null, 'event')}</p>` : ''}${sourcesBlock(s.sources, s.scholarship)}</div>`;
  },
  route(r) {
    let html = head(`Route · ${esc(r.kind || '')}`, r.name, `${r.commodity ? esc(r.commodity) + ' · ' : ''}${esc(fmtRange(r.from, r.to))}${r.days ? ' · ' + esc(r.days) : ''}`);
    return html + `<div class="d-body"><p class="summary">${richText(r.summary, exists)}</p></div>`;
  },
  coinage(c) {
    let html = head(`Coinage · ${esc(c.kind || '')}`, c.t, `${esc(fmtYear(c.year))}${c.endYear ? ' to ' + esc(fmtYear(c.endYear)) : ''}`, `<button data-action="year" data-y="${c.year}">Go to ${esc(fmtYear(c.year))}</button>`);
    return html + `<div class="d-body">${coinCard(c)}</div>`;
  },
  region(r) {
    const c = controlAt(r, S.year);
    let html = head('Region', r.name, c ? `${fmtYear(S.year)}: ${polityLink(D.polities[c[2]]?.id)} · ${esc(STATUS_LABEL[D.statuses[c[3]]])}` : '');
    html += `<div class="d-body">${controlStrip(r)}`;
    if (r.notes) html += `<p>${richText(r.notes, exists)} ${cert(r.certainty)}</p>`;
    html += `<h4>Who held it</h4><dl class="kv">${r.ctl.map((k) => `<dt><a class="ent" data-action="year" data-y="${k[0]}">${esc(fmtRange(k[0], k[1]))}</a></dt><dd>${swatch(D.polities[k[2]]?.id)}${link(D.polities[k[2]]?.id, D.polities[k[2]]?.name, 'polity')} <span class="muted">${esc(STATUS_LABEL[D.statuses[k[3]]] || '')}</span>${k[4] ? `<br><span class="muted">${richText(k[4], exists)}</span>` : ''}</dd>`).join('')}</dl>`;
    return html + '</div>';
  },
};

function render(sel) {
  const r = lookup(sel.id, sel.kind);
  if (!r || !R[r.kind]) return;
  const last = history[history.length - 1];
  if (!last || last.id !== sel.id) history.push({ kind: r.kind, id: sel.id });
  if (history.length > 40) history.shift();
  const b = box();
  b.innerHTML = R[r.kind](r.obj);
  clearLifePath();
  if (r.kind === 'event' && r.obj.battle) {
    loadTactics().then((t) => {
      const tac = t.get(r.obj.id);
      const hostEl = document.getElementById('tacticHost');
      if (!tac || !hostEl || S.selected?.id !== r.obj.id) return;
      const sides = r.obj.battle.sides || [];
      const cols = [polityColor(sides[0]?.polity), polityColor(sides[1]?.polity)];
      if (cols[0] === cols[1]) cols[1] = '#2E6B8A';
      hostEl.insertAdjacentHTML('beforebegin', '<h4>The battle, phase by phase</h4>');
      renderTactic(hostEl, tac, cols);
    });
  }
  b.hidden = false;
  b.scrollTop = 0;
  const app = document.getElementById('app');
  if (window.innerWidth > 760 && window.innerWidth < 1700 && !app.classList.contains('panel-closed')) { app.classList.add('panel-closed'); collapsedPanel = true; setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }
  document.title = `${nameOf(sel.id, r.kind)} · Orbis`;
}
