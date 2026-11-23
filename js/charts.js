// Small SVG charts for the Data tab.
import { D } from './data.js';
import { S, setYear } from './state.js';
import { esc, fmtYear, MIN_YEAR, MAX_YEAR, yearToIdx, idxToYear, fmtNum } from './util.js';

const W = 360, H = 150, M = { t: 8, r: 8, b: 20, l: 40 };

function frame(x0, x1, yMax, fmtY = fmtNum) {
  const x = d3.scaleLinear().domain([yearToIdx(x0), yearToIdx(x1)]).range([M.l, W - M.r]);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([H - M.b, M.t]);
  let g = '';
  for (const t of y.ticks(4)) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}" stroke="#E6E4DD"/><text x="${M.l - 4}" y="${y(t) + 3}" text-anchor="end">${esc(fmtY(t))}</text>`;
  for (const t of x.ticks(5)) g += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${esc(fmtYear(idxToYear(t)))}</text>`;
  const head = S.year >= x0 && S.year <= x1 ? `<line x1="${x(yearToIdx(S.year))}" x2="${x(yearToIdx(S.year))}" y1="${M.t}" y2="${H - M.b}" stroke="#6B2346" stroke-width="1.5"/>` : '';
  return { x, y, g, head };
}

function wrap(title, note, svg, src) {
  return `<div class="chart"><p class="c-title">${esc(title)}</p>${note ? `<p class="c-note">${esc(note)}</p>` : ''}${svg}${src ? `<p class="meta">${esc(src)}</p>` : ''}</div>`;
}

function territoryChart() {
  const st = D.stats;
  if (!st) return '';
  const maxA = d3.max(Array.from(st.direct, (v, i) => v + st.ally[i] + st.client[i])) / 1e6;
  const f = frame(MIN_YEAR, MAX_YEAR, maxA, (v) => v.toFixed(1));
  const pts = [];
  for (let i = 0; i < st.n; i += 2) pts.push({ i: i + yearToIdx(MIN_YEAR), d: st.direct[i] / 1e6, a: (st.ally[i] + st.client[i] + st.direct[i]) / 1e6 });
  const ar = (acc) => d3.area().x((d) => f.x(d.i)).y0(f.y(0)).y1((d) => f.y(acc(d))).curve(d3.curveStepAfter)(pts);
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="clickable">${f.g}<path d="${ar((d) => d.a)}" fill="#D27A62" opacity=".55"/><path d="${ar((d) => d.d)}" fill="#B03A2E"/>${f.head}</svg>`;
  return wrap('Land under Rome', 'Millions of km²: direct rule (dark) and with allies and client kingdoms (light). Computed from this atlas\'s own region timelines, so it inherits their approximations.', svg);
}

function eventsChart() {
  const bins = new Map();
  const step = 25;
  for (const e of D.events) {
    const b = Math.floor(yearToIdx(e.year) / step) * step;
    if (!bins.has(b)) bins.set(b, { b, mil: 0, other: 0 });
    const o = bins.get(b);
    if (e.battle || (e.cats || []).includes('military')) o.mil++; else o.other++;
  }
  const arr = [...bins.values()].sort((a, b) => a.b - b.b);
  const f = frame(MIN_YEAR, MAX_YEAR, d3.max(arr, (d) => d.mil + d.other) || 1, (v) => v);
  const bw = f.x(step) - f.x(0) - 1;
  const svg = `<svg viewBox="0 0 ${W} ${H}">${f.g}${arr.map((d) => `<rect x="${f.x(d.b)}" width="${bw}" y="${f.y(d.mil + d.other)}" height="${f.y(0) - f.y(d.other)}" fill="#8D7F72"/><rect x="${f.x(d.b)}" width="${bw}" y="${f.y(d.mil)}" height="${f.y(0) - f.y(d.mil)}" fill="#B48A3C"/>`).join('')}${f.head}</svg>`;
  return wrap('What the chronicle records', 'Events per 25 years: military (gold) and everything else. Density follows the surviving sources as much as history.', svg);
}

function seriesChart(s) {
  const pts = (s.points || []).filter((p) => Array.isArray(p) && p.length >= 2 && typeof p[1] === 'number').sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return '';
  const x0 = Math.max(MIN_YEAR - 100, pts[0][0]), x1 = Math.min(MAX_YEAR, pts[pts.length - 1][0]);
  const f = frame(x0, x1 === x0 ? x0 + 10 : x1, d3.max(pts, (p) => p[1]) * 1.05);
  let body;
  if (s.kind === 'bar') {
    const bw = Math.max(2, Math.min(14, (W - M.l - M.r) / pts.length - 2));
    body = pts.map((p) => `<rect x="${f.x(yearToIdx(p[0])) - bw / 2}" width="${bw}" y="${f.y(p[1])}" height="${f.y(0) - f.y(p[1])}" fill="#6B2346"><title>${esc(fmtYear(p[0]))}: ${esc(fmtNum(p[1]))} ${esc(s.unit || '')}</title></rect>`).join('');
  } else {
    const line = d3.line().x((p) => f.x(yearToIdx(p[0]))).y((p) => f.y(p[1]))(pts);
    body = `<path d="${line}" fill="none" stroke="#6B2346" stroke-width="1.8"/>${pts.map((p) => `<circle cx="${f.x(yearToIdx(p[0]))}" cy="${f.y(p[1])}" r="2.3" fill="#6B2346"><title>${esc(fmtYear(p[0]))}: ${esc(String(p[1]))} ${esc(s.unit || '')}${p[2] ? ' · ' + esc(p[2]) : ''}</title></circle>`).join('')}`;
  }
  const svg = `<svg viewBox="0 0 ${W} ${H}">${f.g}${body}${f.head}</svg>`;
  return wrap(s.title + (s.unit ? ` (${s.unit})` : ''), s.note, svg, (s.sources || []).join('; '));
}

function emperorsChart() {
  const g = D.rulers.find((r) => r.office === 'emperor');
  if (!g) return '';
  const all = D.rulers.filter((r) => ['emperor', 'emperor_west', 'emperor_east'].includes(r.office)).flatMap((r) => r.list);
  const how = new Map();
  for (const r of all) {
    const k = (r.how || 'unknown').toLowerCase();
    const key = /murder|assassin|killed by|lynch/.test(k) ? 'murdered' : /battle/.test(k) ? 'killed in battle' : /execut/.test(k) ? 'executed' : /suicide/.test(k) ? 'suicide' : /depos|abdic/.test(k) ? 'deposed or abdicated' : /natural|illness|disease|old age|plague/.test(k) ? 'natural causes' : 'other or uncertain';
    how.set(key, (how.get(key) || 0) + 1);
  }
  const arr = [...how.entries()].sort((a, b) => b[1] - a[1]);
  const total = d3.sum(arr, (d) => d[1]);
  const colors = { murdered: '#8E2A2A', 'killed in battle': '#B48A3C', executed: '#5A1414', suicide: '#6B4E6E', 'deposed or abdicated': '#5C6F80', 'natural causes': '#7A8F6A', 'other or uncertain': '#A89B8F' };
  let xx = 0;
  const bar = arr.map(([k, v]) => { const w = (v / total) * W; const r = `<rect x="${xx}" width="${w}" y="0" height="22" fill="${colors[k]}"><title>${k}: ${v}</title></rect>`; xx += w; return r; }).join('');
  const leg = arr.map(([k, v]) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px"><span class="swatch" style="background:${colors[k]}"></span>${esc(k)} ${v}</span>`).join('');
  return wrap('How emperors left office', `${total} reigns from Augustus to Heraclius, both halves after 395.`, `<svg viewBox="0 0 ${W} 22">${bar}</svg><div class="meta" style="margin-top:6px">${leg}</div>`);
}

export function renderCharts(host) {
  if (!host) return;
  host.innerHTML = territoryChart() + emperorsChart() + eventsChart() + D.series.map(seriesChart).join('');
  host.querySelectorAll('svg.clickable').forEach((svg) => svg.addEventListener('click', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const x = d3.scaleLinear().domain([yearToIdx(MIN_YEAR), yearToIdx(MAX_YEAR)]).range([M.l, W - M.r]);
    setYear(idxToYear(Math.round(x.invert(px))));
  }));
}
