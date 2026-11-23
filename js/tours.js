// Guided tours (story mode), the year quiz, and the compare-years ghost frontier.
import { D, lookup, controlAt } from './data.js';
import { S, setYear, select, setLayer, emit } from './state.js';
import { esc, fmtYear, richText, MIN_YEAR, MAX_YEAR, eraOf } from './util.js';
import { map, applyGhost } from './map.js';
import { exists } from './data.js';

const stage = () => document.querySelector('.stage');
let card = null;

export function startTour(tour, i = 0) {
  stopQuiz();
  if (!card) { card = document.createElement('div'); card.className = 'tourcard'; stage().appendChild(card); }
  const stops = tour.stops || [];
  const st = stops[i];
  if (!st) { endTour(); return; }
  setYear(st.year);
  if (st.layers) for (const [k, v] of Object.entries(st.layers)) if (k in S.layers && S.layers[k] !== v) setLayer(k, v);
  if (Array.isArray(st.center)) map.flyTo({ center: st.center, zoom: st.zoom || 5, speed: 0.9, curve: 1.4 });
  const target = st.select && lookup(st.select);
  card.innerHTML = `<div class="tc-meta">${esc(tour.title)} · stop ${i + 1} of ${stops.length} · ${esc(fmtYear(st.year, { ad: true }))}</div>
    <h4>${esc(st.title || '')}</h4><div class="tc-text">${richText(st.text || '', exists)}</div>
    <div class="tc-ctl"><button data-t="prev" ${i === 0 ? 'disabled' : ''}>Back</button>${target ? '<button data-t="open">Open entry</button>' : ''}<span class="sp"></span><button data-t="end">End tour</button><button data-t="next" class="primary">${i === stops.length - 1 ? 'Finish' : 'Next'}</button></div>`;
  card.onclick = (e) => {
    const b = e.target.closest('[data-t]');
    const a = e.target.closest('a.ent[data-id]');
    if (a) { select(lookup(a.dataset.id)?.kind, a.dataset.id); return; }
    if (!b) return;
    if (b.dataset.t === 'next') { if (i === stops.length - 1) endTour(); else startTour(tour, i + 1); }
    if (b.dataset.t === 'prev') startTour(tour, i - 1);
    if (b.dataset.t === 'end') endTour();
    if (b.dataset.t === 'open') select(target.kind, st.select);
  };
}
export function endTour() { card?.remove(); card = null; }

// ---------------- quiz: guess the year from the map alone
const QUIZ_YEARS = [-490, -396, -343, -300, -275, -241, -218, -211, -201, -188, -168, -146, -133, -121, -101, -88, -70, -63, -58, -50, -44, -31, -9, 14, 43, 69, 85, 106, 117, 138, 165, 180, 197, 212, 238, 260, 271, 284, 300, 313, 337, 363, 378, 395, 410, 418, 439, 455, 476, 500, 527, 540, 555, 568, 600, 618, 636];
let quiz = null;
export function startQuiz() {
  endTour();
  const bar = document.createElement('div');
  bar.className = 'quizbar';
  stage().appendChild(bar);
  quiz = { bar, round: 0, score: 0, answer: null, done: false };
  document.getElementById('app').classList.add('quiz', 'panel-closed');
  select(null);
  nextRound();
}
function nextRound() {
  const q = quiz;
  q.round++;
  q.done = false;
  const pool = QUIZ_YEARS.filter((y) => y !== q.answer);
  q.answer = pool[Math.floor(Math.random() * pool.length)];
  setYear(q.answer);
  map.flyTo({ center: [18, 42], zoom: window.innerWidth < 760 ? 2.9 : 3.6 });
  q.bar.innerHTML = `<h4>Which year is this map? <span style="font-weight:400;font-size:13px;color:#C9BCAE">round ${q.round} · ${q.score} points</span></h4>
    <input type="range" min="${MIN_YEAR}" max="${MAX_YEAR}" step="1" value="1" id="qzRange" aria-label="Your guess">
    <div class="qz-row"><span id="qzGuess">AD 1</span><span style="flex:1"></span><button data-q="hint">Hint</button><button data-q="guess" class="primary">Guess</button><button data-q="quit">Quit</button></div><div id="qzMsg" style="font-size:14px;margin-top:6px"></div>`;
  const r = q.bar.querySelector('#qzRange');
  const lab = q.bar.querySelector('#qzGuess');
  r.oninput = () => { const v = +r.value || 1; lab.textContent = fmtYear(v, { ad: true }); };
  q.bar.onclick = (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    if (b.dataset.q === 'quit') return stopQuiz();
    if (b.dataset.q === 'hint') { q.bar.querySelector('#qzMsg').textContent = `Era: ${eraOf(q.answer).name}.`; q.hint = true; return; }
    if (b.dataset.q === 'guess') {
      if (q.done) return nextRound();
      const g = +r.value || 1;
      const off = Math.abs(g - q.answer);
      const pts = Math.max(0, Math.round(100 - off * (q.hint ? 2 : 1.2)));
      q.score += pts;
      q.done = true;
      const evs = (D.eventsByYear.get(q.answer) || []).slice().sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 2);
      q.bar.querySelector('#qzMsg').innerHTML = `It was <b>${esc(fmtYear(q.answer, { ad: true }))}</b>, you were ${off} year${off === 1 ? '' : 's'} off: ${pts} points.${evs.length ? ` That year: ${evs.map((e) => esc(e.title)).join('; ')}.` : ''}`;
      b.textContent = 'Next map';
      document.getElementById('app').classList.remove('quiz');
    }
  };
  document.getElementById('app').classList.add('quiz');
}
export function stopQuiz() {
  if (!quiz) return;
  quiz.bar.remove();
  quiz = null;
  document.getElementById('app').classList.remove('quiz');
}

// ---------------- compare: show another year's Roman frontier as a dashed line
let cmp = null;
export function toggleCompare() {
  if (cmp) { cmp.remove(); cmp = null; S.ghostYear = null; applyGhost(true); return; }
  cmp = document.createElement('div');
  cmp.className = 'comparebar';
  const start = S.year > 117 ? 117 : -60;
  cmp.innerHTML = `<span class="swatchline"></span><span>Roman frontier in</span><input id="cmpYear" value="${start < 0 ? -start + ' BC' : 'AD ' + start}" aria-label="Comparison year"><button class="chip" id="cmpClose" aria-label="Stop comparing">×</button>`;
  stage().appendChild(cmp);
  const apply = () => {
    const v = cmp.querySelector('#cmpYear').value.trim().toLowerCase();
    let n = parseInt(v.replace(/[^\d-]/g, ''), 10);
    if (Number.isNaN(n) || n === 0) return;
    if (/bc/.test(v) && n > 0) n = -n;
    S.ghostYear = Math.max(MIN_YEAR, Math.min(MAX_YEAR, n));
    applyGhost(true);
  };
  cmp.querySelector('#cmpYear').addEventListener('change', apply);
  cmp.querySelector('#cmpYear').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  cmp.querySelector('#cmpClose').onclick = toggleCompare;
  apply();
}
