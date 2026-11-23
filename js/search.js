// Omnibox search over every entity, plus year jumps.
import { D } from './data.js';
import { setYear } from './state.js';
import { esc, fmtYear, fmtRange, KIND_LABEL, clampYear } from './util.js';
import { openId } from './detail.js';

let index = [];
let active = -1;
let results = [];

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function initSearch() {
  const add = (kind, o, label, sub, extra = '') => index.push({ kind, id: o.id, label, sub, n: norm(label), x: norm(`${sub} ${extra}`), w: o.importance || 3 });
  D.events.forEach((e) => add('event', e, e.title, `${fmtYear(e.year)} · ${e.type || ''}`, (e.tags || []).join(' ') + ' ' + (e.locName || '')));
  D.people.forEach((p) => add('person', p, p.name, `${p.born ? fmtYear(p.born) : '?'}–${p.died ? fmtYear(p.died) : '?'} · ${(p.kind || []).join(', ')}`, p.fullName || ''));
  D.wars.forEach((w) => add('war', w, w.name, fmtRange(w.start, w.end)));
  D.campaigns.forEach((c) => add('campaign', c, c.name, fmtRange(c.start, c.end)));
  D.places.forEach((p) => add('place', p, p.name, [p.modern, (p.type || []).join(', ')].filter(Boolean).join(' · '), `${p.short || ''} ${p.greek || ''}`));
  D.polities.forEach((p) => add('polity', p, p.name, `${fmtRange(p.start, p.end)} · ${p.type}`));
  D.legions.forEach((l) => add('legion', l, l.name, l.emblem || '', l.cognomen || ''));
  D.frontiers.forEach((f) => add('frontier', f, f.name, f.kind || ''));
  D.roads.forEach((r) => add('road', r, r.name, r.built !== undefined ? fmtYear(r.built) : ''));
  D.sources.forEach((s) => add('source', s, s.name, (s.works || []).map((w) => w.t).join(', '), s.latin || ''));
  D.glossary.forEach((g) => add('glossary', g, g.term, (g.def || '').slice(0, 80)));
  D.regions.forEach((r) => add('region', r, r.name, 'map region'));
  (D.provinces || []).forEach((p) => add('province', p, p.name, `${p.type || 'province'} · ${fmtRange(p.created, p.ended)}`));
  (D.monuments || []).forEach((m) => add('monument', m, m.name, `${m.city} · ${m.type}`));
  (D.sites || []).forEach((x) => add('site', x, x.name, `${x.theme} · ${x.kind}`, x.commodity || ''));
  (D.mints || []).forEach((m) => add('mint', m, m.name, (m.marks || []).join(' '), (m.marks || []).join(' ')));
  (D.hoards || []).forEach((h) => add('hoard', h, h.name, `hoard · ${fmtYear(h.deposited)}`));
  (D.coinage || []).forEach((c) => add('coinage', c, c.t, `coinage · ${fmtYear(c.year)}`));

  const input = document.getElementById('search');
  const box = document.getElementById('searchResults');
  input.addEventListener('input', () => run(input.value));
  input.addEventListener('focus', () => input.value && run(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter' && results[active]) { choose(results[active]); }
    if (e.key === 'Escape') { box.classList.remove('open'); input.blur(); }
  });
  box.addEventListener('mousedown', (e) => { const it = e.target.closest('.sr-item'); if (it) { e.preventDefault(); choose(results[+it.dataset.i]); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.omnibox')) box.classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); input.focus(); input.select(); } });
}

function parseYear(q) {
  const m = q.trim().match(/^(ad\s*)?(-?\d{1,3})\s*(bc|bce|ad|ce|auc)?$/i);
  if (!m) return null;
  let n = parseInt(m[2], 10);
  const suf = (m[3] || '').toLowerCase();
  if (suf === 'auc') n = n <= 753 ? n - 754 : n - 753;
  else if (suf === 'bc' || suf === 'bce') n = -Math.abs(n);
  if (n === 0) return null;
  const y = clampYear(n);
  return y === n ? y : null;
}

function run(q) {
  const box = document.getElementById('searchResults');
  const nq = norm(q.trim());
  if (nq.length < 2 && !/^\d$/.test(nq)) { box.classList.remove('open'); return; }
  const out = [];
  const y = parseYear(q);
  if (y !== null) out.push({ kind: 'year', y, label: `Go to ${fmtYear(y, { ad: true })}`, sub: 'year' });
  const terms = nq.split(/\s+/).filter(Boolean);
  for (const it of index) {
    let s = 0;
    if (it.n === nq) s = 100;
    else if (it.n.startsWith(nq)) s = 60;
    else if (it.n.split(/[\s,()'-]+/).some((w) => w.startsWith(nq))) s = 45;
    else if (it.n.includes(nq)) s = 30;
    else if (terms.every((t) => it.n.includes(t) || it.x.includes(t))) s = 12;
    else continue;
    s += it.w * 2 + (it.kind === 'person' || it.kind === 'war' ? 4 : 0);
    out.push({ ...it, s });
  }
  out.sort((a, b) => (b.s || 1000) - (a.s || 1000));
  results = out.slice(0, 40);
  active = 0;
  paint();
  box.classList.add('open');
}

function paint() {
  const box = document.getElementById('searchResults');
  box.innerHTML = results.length ? results.map((r, i) => `<div class="sr-item${i === active ? ' active' : ''}" data-i="${i}" role="option"><span class="sr-t">${esc(r.label)}</span><span class="sr-k">${esc(r.kind === 'year' ? '' : KIND_LABEL[r.kind] || r.kind)}</span><span class="sr-s">${esc(r.sub || '')}</span></div>`).join('') : '<div class="sr-item"><span class="sr-s">No matches. Try a Latin or English name, a year like 216 BC, or 538 AUC.</span></div>';
  box.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}

function choose(r) {
  document.getElementById('searchResults').classList.remove('open');
  document.getElementById('search').blur();
  if (r.kind === 'year') { setYear(r.y); return; }
  openId(r.id, r.kind);
}
