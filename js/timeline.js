// Bottom timeline: eras, event density, Roman territory, wars; scrub + zoom.
import { D } from './data.js';
import { S, on, setYear, select } from './state.js';
import { ERAS, MIN_YEAR, MAX_YEAR, yearToIdx, idxToYear, fmtYear, fmtRange, fmtNum } from './util.js';

let svg, W = 0, H = 0, x, dom = [yearToIdx(MIN_YEAR), yearToIdx(MAX_YEAR)];
const FULL = [yearToIdx(MIN_YEAR), yearToIdx(MAX_YEAR)];
let counts, warRows;
const el = () => document.getElementById('tlCanvas');

export function initTimeline() {
  const n = FULL[1] - FULL[0] + 1;
  counts = new Float32Array(n);
  const battles = new Float32Array(n);
  for (const e of D.events) {
    const i = yearToIdx(e.year) - FULL[0];
    if (i < 0 || i >= n) continue;
    counts[i] += 0.5 + (e.importance || 2) * 0.5;
    if (e.battle) battles[i] += 1;
  }
  counts.battles = battles;
  // pack wars into rows
  const wars = D.wars.filter((w) => w.start !== undefined).slice().sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const rowEnds = [];
  warRows = wars.map((w) => {
    const s = yearToIdx(w.start), e = yearToIdx(w.end ?? w.start) + 1;
    let r = rowEnds.findIndex((end) => end <= s);
    if (r < 0) { r = rowEnds.length; rowEnds.push(0); }
    rowEnds[r] = e;
    return { w, s, e, r };
  });
  const rows = Math.min(5, rowEnds.length);
  warRows = warRows.filter((d) => d.r < rows);
  warRows.rows = rows;

  svg = d3.select(el()).append('svg');
  new ResizeObserver(() => draw()).observe(el());
  bind();
  on('year', () => drawHead());
  draw();
}

function lanes() {
  const top = 3;
  const rows = Math.min(warRows.rows || 1, 4);
  return { era: [top, 13], hist: [top + 15, 22], area: [top + 39, 14], wars: [top + 55, 5 * rows], axis: H - 17, rows };
}

function draw() {
  const r = el().getBoundingClientRect();
  W = r.width; H = r.height;
  if (!W) return;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  x = d3.scaleLinear().domain(dom).range([10, W - 10]);
  const L = lanes();
  svg.selectAll('*').remove();
  const g = svg.append('g');
  // eras
  g.append('g').selectAll('rect').data(ERAS).join('rect')
    .attr('x', (d) => x(yearToIdx(d.from))).attr('width', (d) => Math.max(0, x(yearToIdx(d.to) + 1) - x(yearToIdx(d.from))))
    .attr('y', L.era[0]).attr('height', L.era[1]).attr('fill', (d) => d.color).attr('opacity', 0.9);
  g.append('g').selectAll('text').data(ERAS).join('text').attr('class', 'era-label')
    .attr('x', (d) => Math.max(x(yearToIdx(d.from)), 10) + 6).attr('y', L.era[0] + 10)
    .text((d) => (x(yearToIdx(d.to)) - x(yearToIdx(d.from)) > d.name.length * 6.2 ? d.name : ''));
  // histogram
  const n = counts.length;
  const step = Math.max(1, Math.round((dom[1] - dom[0]) / (W / 3)));
  const bins = [];
  for (let i = Math.max(0, Math.floor(dom[0]) - FULL[0]); i < Math.min(n, Math.ceil(dom[1]) - FULL[0] + 1); i += step) {
    let s = 0, b = 0;
    for (let k = i; k < Math.min(n, i + step); k++) { s += counts[k]; b += counts.battles[k]; }
    bins.push({ i: i + FULL[0], s, b });
  }
  const maxS = d3.max(bins, (d) => d.s) || 1;
  const hy = d3.scaleSqrt().domain([0, maxS]).range([0, L.hist[1]]);
  const bw = Math.max(1, x(step) - x(0) - 0.5);
  
  g.append('g').selectAll('rect').data(bins).join('rect')
    .attr('x', (d) => x(d.i)).attr('width', bw).attr('y', (d) => L.hist[0] + L.hist[1] - hy(d.s)).attr('height', (d) => hy(d.s)).attr('fill', '#8D7F72');
  g.append('g').selectAll('rect').data(bins.filter((d) => d.b)).join('rect')
    .attr('x', (d) => x(d.i)).attr('width', bw).attr('y', (d) => L.hist[0] + L.hist[1] - hy(d.b * 2.5)).attr('height', (d) => hy(d.b * 2.5)).attr('fill', '#B48A3C');
  // Roman territory area
  if (D.stats) {
    const st = D.stats;
    const pts = [];
    for (let i = Math.max(0, Math.floor(dom[0]) - FULL[0]); i < Math.min(st.n, Math.ceil(dom[1]) - FULL[0] + 1); i += Math.max(1, Math.floor(step / 2))) {
      pts.push({ i: i + FULL[0], d: st.direct[i], a: st.direct[i] + st.ally[i] + st.client[i] });
    }
    const maxA = d3.max(D.stats.direct.map((v, i) => v + D.stats.ally[i] + D.stats.client[i])) || 1;
    const ay = d3.scaleLinear().domain([0, maxA]).range([L.area[0] + L.area[1], L.area[0]]);
    g.append('path').datum(pts).attr('fill', '#D27A62').attr('opacity', 0.55).attr('d', d3.area().x((d) => x(d.i)).y0(ay(0)).y1((d) => ay(d.a)).curve(d3.curveStepAfter));
    g.append('path').datum(pts).attr('fill', '#B03A2E').attr('d', d3.area().x((d) => x(d.i)).y0(ay(0)).y1((d) => ay(d.d)).curve(d3.curveStepAfter));
    
  }
  // wars
  const wg = g.append('g');
  wg.selectAll('rect').data(warRows.filter((d) => d.r < L.rows && d.e >= dom[0] && d.s <= dom[1])).join('rect').attr('class', 'war-bar')
    .attr('x', (d) => x(d.s)).attr('width', (d) => Math.max(2, x(d.e) - x(d.s))).attr('y', (d) => L.wars[0] + d.r * 5).attr('height', 4).attr('rx', 1.5)
    .attr('fill', (d) => warColor(d.w))
    .on('click', (ev, d) => { ev.stopPropagation(); select('war', d.w.id); if (S.year < d.w.start || S.year > (d.w.end ?? d.w.start)) setYear(d.w.start); })
    .append('title').text((d) => `${d.w.name} (${fmtRange(d.w.start, d.w.end)})`);
  // axis
  const ax = d3.axisBottom(x).ticks(Math.max(4, Math.floor(W / 90))).tickFormat((i) => fmtYear(idxToYear(i))).tickSizeOuter(0);
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${L.axis})`).call(ax);
  // playhead
  svg.append('g').attr('class', 'head');
  drawHead();
}

function warColor(w) {
  const enemies = (w.sides || []).flat().filter((p) => !['rome', 'rome_east', 'rome_west'].includes(p));
  if ((w.sides || []).every((side) => side.some((p) => ['rome', 'rome_east', 'rome_west'].includes(p)))) return '#9D7FA0'; // civil war
  const p = D.polity.get(enemies[0]);
  return p?.color || '#A2958A';
}

function drawHead() {
  if (!svg || !x) return;
  const hg = svg.select('g.head');
  hg.selectAll('*').remove();
  const xi = x(yearToIdx(S.year) + 0.5);
  if (xi < 0 || xi > W) return;
  hg.append('line').attr('x1', xi).attr('x2', xi).attr('y1', 0).attr('y2', H - 18).attr('stroke', '#F4EFE6').attr('stroke-width', 2);
  hg.append('line').attr('x1', xi).attr('x2', xi).attr('y1', 0).attr('y2', H - 18).attr('stroke', '#6B2346').attr('stroke-width', 1);
  const label = fmtYear(S.year, { ad: true });
  const tw = label.length * 7.4 + 12;
  const lx = Math.min(Math.max(xi - tw / 2, 2), W - tw - 2);
  hg.append('rect').attr('x', lx).attr('y', H - 18).attr('width', tw).attr('height', 17).attr('rx', 3).attr('fill', '#6B2346');
  hg.append('text').attr('x', lx + tw / 2).attr('y', H - 5).attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-family', 'IBM Plex Sans Condensed').attr('font-size', 12).attr('font-weight', 600).text(label);
}

function bind() {
  const node = el();
  let dragging = false;
  const toYear = (clientX) => {
    const r = node.getBoundingClientRect();
    return idxToYear(Math.floor(x.invert(clientX - r.left)));
  };
  node.addEventListener('pointerdown', (e) => {
    if (e.target.classList?.contains('war-bar')) return;
    dragging = true; node.setPointerCapture(e.pointerId); setYear(toYear(e.clientX));
  });
  node.addEventListener('pointermove', (e) => { if (dragging) setYear(toYear(e.clientX)); });
  node.addEventListener('pointerup', () => { dragging = false; });
  node.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = node.getBoundingClientRect();
    const span = dom[1] - dom[0];
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const shift = (e.deltaX / W) * span;
      pan(shift);
      return;
    }
    const center = x.invert(e.clientX - r.left);
    const k = Math.exp(e.deltaY * 0.0015);
    let ns = Math.max(20, Math.min(FULL[1] - FULL[0], span * k));
    const t = (center - dom[0]) / span;
    let a = center - t * ns, b = a + ns;
    if (a < FULL[0]) { b += FULL[0] - a; a = FULL[0]; }
    if (b > FULL[1]) { a -= b - FULL[1]; b = FULL[1]; }
    dom = [Math.max(FULL[0], a), Math.min(FULL[1], b)];
    draw();
  }, { passive: false });
}

function pan(shift) {
  const span = dom[1] - dom[0];
  let a = dom[0] + shift;
  a = Math.max(FULL[0], Math.min(FULL[1] - span, a));
  dom = [a, a + span];
  draw();
}

// Zoom the timeline to a range (used when reading a chapter or selecting a war).
export function focusRange(a, b) {
  const pad = Math.max(5, (yearToIdx(b) - yearToIdx(a)) * 0.15);
  dom = [Math.max(FULL[0], yearToIdx(a) - pad), Math.min(FULL[1], yearToIdx(b) + pad)];
  if (dom[1] - dom[0] < 20) dom[1] = dom[0] + 20;
  draw();
}
export function resetRange() { dom = FULL.slice(); draw(); }
