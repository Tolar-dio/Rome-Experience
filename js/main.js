// Bootstrap and global UI (year plate, legend, layers, playback, keyboard, guide).
import { D, loadAll, rulersAt, nameOf, loadDetails } from './data.js';
import { S, on, emit, setYear, select, setLayer, restoreLayers, readHash } from './state.js';
import { esc, fmtYear, auc, eraOf, addYears, MIN_YEAR, MAX_YEAR, STATUS_LABEL, fmtNum } from './util.js';
import { initMap, map, polityLabel } from './map.js';
import { initTimeline } from './timeline.js';
import { initPanels, showTab } from './panels.js';
import { initDetail } from './detail.js';
import { initSearch } from './search.js';
import { startTour, startQuiz, toggleCompare } from './tours.js';
import { initCityMount } from './city/mount.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  restoreLayers();
  const h = readHash();
  if (h.year !== undefined) S.year = h.year;
  if (h.tab) S.tab = h.tab;
  try {
    await loadAll((m) => { $('bootMsg').textContent = m; });
  } catch (err) {
    $('bootMsg').textContent = `The data failed to load (${err.message}). Serve the folder over http, not file://.`;
    throw err;
  }
  $('bootMsg').textContent = 'Drawing the provinces';
  await initMap(() => {
    $('app').classList.remove('loading');
    window.orbis = { map, D, S, setYear, select };
    setTimeout(() => loadDetails(), 1500);
    if (h.selected) select(h.selected.kind, h.selected.id);
    if (!localStorage.getItem('orbis.seenGuide')) openGuide();
  });
  initTimeline();
  initDetail();
  initPanels();
  initSearch();
  bindControls();
  initCityMount();
  on('year', renderYearplate);
  on('mapStats', renderLegend);
  map.on('moveend', () => renderLegend());
  renderYearplate();
}

// ---------------- year plate
function renderYearplate() {
  const y = S.year;
  const f = D.fastiByYear.get(y);
  let line = '';
  const rul = rulersAt(y);
  const emp = rul.filter((g) => ['emperor', 'emperor_west', 'emperor_east'].includes(g.office)).flatMap((g) => g.list.map((r) => r.name));
  if (emp.length) line = `<b>${esc([...new Set(emp)].join(', '))}</b>`;
  else if (f?.consuls?.length) line = `In the consulship of <b>${esc(f.consuls.map(shortName).join(' and '))}</b>`;
  else if (f?.tribunes?.length) line = `<b>Consular tribunes</b>, ${f.tribunes.length} elected`;
  else if (f?.note) line = esc(f.note);
  $('yearplate').innerHTML = `<div class="yp-row"><div class="yp-year">${y < 0 ? -y : y}<small>${y < 0 ? 'bc' : 'ad'}</small></div><div class="yp-auc">${auc(y)} AUC<br>${esc(eraOf(y).name)}</div></div>${line ? `<div class="yp-line">${line}</div>` : ''}`;
}
function shortName(n) {
  // "Lucius Aemilius Paullus" -> "L. Aemilius Paullus"
  const ABBR = { Appius: 'Ap.', Aulus: 'A.', Decimus: 'D.', Gaius: 'C.', Gnaeus: 'Cn.', Kaeso: 'K.', Lucius: 'L.', Mamercus: 'Mam.', Manius: "M'.", Marcus: 'M.', Numerius: 'N.', Publius: 'P.', Quintus: 'Q.', Servius: 'Ser.', Sextus: 'Sex.', Spurius: 'Sp.', Tiberius: 'Ti.', Titus: 'T.', Vibius: 'V.' };
  const parts = n.split(' ');
  if (ABBR[parts[0]] && parts.length > 2) parts[0] = ABBR[parts[0]];
  return parts.slice(0, 3).join(' ');
}

// ---------------- legend
let legendMin = true;
let lastGroups = null;
function renderLegend(arg) {
  const groups = (arg && arg.groups) || lastGroups;
  if (!groups) return;
  lastGroups = groups;
  const b = map.getBounds();
  const vis = [];
  for (const g of groups.values()) {
    const a = g.regs.reduce((s, r) => s + (b.contains(r.labelPt) ? r.area || 0 : 0), 0);
    if (a > 0) vis.push({ pol: g.pol, area: a, total: g.area });
  }
  const isRome = (g) => ['rome', 'rome_west', 'rome_east'].includes(g.pol.id);
  const weight = (g) => (isRome(g) ? 1e12 : 0) + g.area * (['empire', 'kingdom', 'republic', 'league', 'city_state', 'client_kingdom', 'breakaway'].includes(g.pol.type) ? 1 : 0.3);
  const top = vis.sort((a, c) => weight(c) - weight(a)).slice(0, 6);
  const pat = (bg, img) => `<span class="lg-pat" style="background:${bg}${img ? `;background-image:${img}` : ''}"></span>`;
  const hatch = 'repeating-linear-gradient(-45deg, rgba(255,255,255,.75) 0 1.5px, transparent 1.5px 5px)';
  const dots = 'radial-gradient(rgba(255,255,255,.85) 1.2px, transparent 1.4px)';
  const cross = 'repeating-linear-gradient(45deg, rgba(40,20,15,.45) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(40,20,15,.45) 0 1px, transparent 1px 5px)';
  $('legend').className = 'legend' + (legendMin ? ' min' : '');
  $('legend').innerHTML = `<button class="lg-min" aria-label="Collapse legend">${legendMin ? '+' : '–'}</button><div class="lg-title">${legendMin ? 'Legend' : 'Key and powers in view'}</div><div class="lg-body">
    <div class="lg-row">${pat('#B03A2E')} Roman rule</div>
    <div class="lg-row">${pat('#D27A62', hatch)} allies, federates</div>
    <div class="lg-row">${pat('#C99A72', dots + ';background-size:6px 6px')} client kingdoms</div>
    <div class="lg-row">${pat('#9F8C80', cross)} contested</div>
    <div class="lg-powers" title="Largest powers in view, with their total area">${top.map((g) => `<span><span class="swatch" style="background:${g.pol.color}"></span>${esc(polityLabel(g.pol, S.year) === g.pol.name ? g.pol.name : g.pol.name)}</span><span>${fmtNum(Math.round(g.total))} km²</span>`).join('')}</div></div>`;
  $('legend').querySelector('.lg-min').onclick = () => { legendMin = !legendMin; renderLegend(); };
}

// ---------------- layers popover
const LAYER_GROUPS = [
  ['Territory', [['territory', 'Who rules where'], ['borders', 'Borders and the Roman frontier'], ['polityLabels', 'Names of states'], ['regionNames', 'Region names'], ['extents', 'AWMC extents (60 BC, AD 117, 200)'], ['provinces', 'Province lines (AD 200, Diocletian)']]],
  ['History', [['events', 'Events of the year'], ['battles', 'Battles and sieges'], ['heat', 'Battle density, last 100 years'], ['campaigns', 'Campaign routes'], ['journeys', 'Journeys and travels'], ['legions', 'Legion bases'], ['frontiers', 'Frontier works and walls'], ['provinces', 'Provinces, dioceses, prefectures']]],
  ['Society', [['religion', 'Religion: sanctuaries, bishoprics, councils'], ['economy', 'Economy: mines, quarries, production, ports'], ['culture', 'Culture: libraries, schools, villas'], ['routes', 'Trade routes'], ['mints', 'Mints'], ['hoards', 'Coin hoards']]],
  ['The city', [['monuments', 'Monuments of Rome and Constantinople (zoom in)'], ['cityBase', 'Modern street plan under the city']]],
  ['Ancient landscape', [['cities', 'Cities, colonies, fortresses'], ['namedRoads', 'Named roads (dated)'], ['roads', 'Road network (Barrington)'], ['aqueducts', 'Aqueducts (zoom in)'], ['ancientLabels', 'Ancient regions and peoples (labels)'], ['ancientWater', 'Ancient lakes and marshes'], ['rivers', 'Rivers']]],
  ['Base map', [['relief', 'Terrain relief'], ['dare', 'DARE Roman Empire map']]],
];
function renderLayers() {
  $('layersPop').innerHTML = LAYER_GROUPS.map(([g, ls]) => `<h4>${g}</h4>${ls.map(([k, l]) => `<label><input type="checkbox" data-l="${k}" ${S.layers[k] ? 'checked' : ''}> ${l}</label>`).join('')}`).join('') +
    `<p class="meta" style="margin-top:10px">Relief from Esri; DARE map tiles by Johan Åhlfeldt (CC BY). Both load from the web.</p>`;
}

// ---------------- playback
let raf = null, last = 0, acc = 0;
function setPlaying(p) {
  S.playing = p;
  $('playIcon').setAttribute('d', p ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M7 4l13 8-13 8z');
  $('play').setAttribute('aria-label', p ? 'Pause' : 'Play');
  if (p) { if (S.year >= MAX_YEAR) setYear(MIN_YEAR); last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); }
  else cancelAnimationFrame(raf);
}
function tick(t) {
  acc += ((t - last) / 1000) * S.speed;
  last = t;
  if (acc >= 1) {
    const n = Math.floor(acc);
    acc -= n;
    const ny = addYears(S.year, n);
    setYear(ny);
    if (S.follow) followYear(ny);
    if (ny >= MAX_YEAR) { setPlaying(false); return; }
  }
  raf = requestAnimationFrame(tick);
}
function followYear(y) {
  const evs = (D.eventsByYear.get(y) || []).filter((e) => Array.isArray(e.loc) && (e.importance || 2) >= 4);
  if (!evs.length) return;
  const e = evs.sort((a, b) => b.importance - a.importance)[0];
  map.easeTo({ center: e.loc, duration: Math.min(900, 1000 / S.speed * 0.9) });
}

function bindControls() {
  $('play').onclick = () => setPlaying(!S.playing);
  $('stepBack').onclick = () => setYear(addYears(S.year, -1));
  $('stepFwd').onclick = () => setYear(addYears(S.year, 1));
  $('stepBack10').onclick = () => setYear(addYears(S.year, -10));
  $('stepFwd10').onclick = () => setYear(addYears(S.year, 10));
  $('speed').onchange = (e) => { S.speed = parseFloat(e.target.value); };
  $('follow').onchange = (e) => { S.follow = e.target.checked; };
  $('railToggle').onclick = () => $('app').classList.toggle('panel-closed');
  $('home').onclick = (e) => { e.preventDefault(); select(null); setYear(-509); map.flyTo({ center: [12.5, 41.9], zoom: 5.2 }); showTab('year'); };
  $('layersBtn').onclick = (e) => {
    const pop = $('layersPop');
    pop.hidden = !pop.hidden;
    $('layersBtn').setAttribute('aria-expanded', String(!pop.hidden));
    if (!pop.hidden) renderLayers();
    e.stopPropagation();
  };
  $('layersPop').addEventListener('change', (e) => { if (e.target.dataset.l) setLayer(e.target.dataset.l, e.target.checked); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#layersPop') && !e.target.closest('#layersBtn')) { $('layersPop').hidden = true; $('layersBtn').setAttribute('aria-expanded', 'false'); } });
  $('helpBtn').onclick = openGuide;
  $('compareBtn').onclick = () => { toggleCompare(); $('compareBtn').classList.toggle('on'); };
  $('quizBtn').onclick = () => startQuiz();
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!S.playing); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setYear(addYears(S.year, e.shiftKey ? 10 : 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setYear(addYears(S.year, e.shiftKey ? -10 : -1)); }
    if (e.key === 'Home') setYear(MIN_YEAR);
    if (e.key === 'End') setYear(MAX_YEAR);
    if (e.key === 'l') $('layersBtn').click();
  });
}

const TOURS = [
  { y: -390, t: 'The Gauls sack Rome', id: 'battle_of_the_allia' },
  { y: -264, t: 'Rome on the eve of the Punic Wars', tab: 'year' },
  { y: -216, t: 'Cannae', id: 'battle_of_cannae' },
  { y: -146, t: 'Carthage and Corinth destroyed', id: 'siege_of_carthage_146' },
  { y: -52, t: 'Alesia', id: 'siege_of_alesia' },
  { y: 9, t: 'Teutoburg Forest', id: 'battle_of_the_teutoburg_forest' },
  { y: 117, t: 'Trajan\'s empire at its height', tab: 'year' },
  { y: 260, t: 'The empire splits in three', tab: 'year' },
  { y: 378, t: 'Adrianople', id: 'battle_of_adrianople_378' },
  { y: 476, t: 'The last emperor in the West', tab: 'year' },
  { y: 555, t: 'Justinian\'s reconquests', tab: 'year' },
  { y: 636, t: 'Yarmuk', id: 'battle_of_yarmouk' },
];
function openGuide() {
  const g = $('guide');
  g.hidden = false;
  g.innerHTML = `<div class="modal-card"><button class="d-close" id="gClose" aria-label="Close">×</button>
    <h2>Orbis</h2><p class="lede">An atlas, encyclopedia and history of Rome from the first consuls to the death of Heraclius: 1,150 years, year by year.</p>
    <p>The map shows who held every region in the selected year: Roman rule in cinnabar, allies hatched, client kingdoms dotted, contested land cross-hatched, and every rival state in its own colour. Drag the timeline at the bottom, press <kbd>Space</kbd> to play, <kbd>←</kbd> <kbd>→</kbd> to step a year (<kbd>Shift</kbd> for ten), <kbd>/</kbd> to search. Scroll on the timeline to zoom it.</p>
    <p>The left rail opens the year's state of the world, the full chronicle, wars and campaign routes you can follow on the map, the encyclopedia, a narrative history in chapters, the army and its frontiers, the fasti and dynasties, the surviving ancient sources and the numbers.</p>
    ${D.tours.length ? `<h3>Take a guided tour</h3><ul class="rows">${D.tours.map((t) => `<li class="row" data-gtour="${esc(t.id)}"><div class="when">${t.stops?.length || 0} stops</div><div class="what"><div class="ttl">${esc(t.title)}</div></div></li>`).join('')}</ul>` : ''}
    <h3>Or jump to a moment</h3><ul class="rows">${TOURS.map((t, i) => `<li class="row" data-tour="${i}"><div class="when">${esc(fmtYear(t.y))}</div><div class="what"><div class="ttl">${esc(t.t)}</div></div></li>`).join('')}</ul>
    <p class="meta" style="margin-top:14px">Territory is reconstructed region by region from standard scholarship and is approximate, especially for tribal peoples, the early Republic and the steppe. Uncertain items are marked. Geography: Natural Earth; Ancient World Mapping Center (ODbL); optional DARE and Esri tiles.</p></div>`;
  const close = () => { g.hidden = true; try { localStorage.setItem('orbis.seenGuide', '1'); } catch (e) { /* */ } };
  $('gClose').onclick = close;
  g.onclick = (e) => {
    if (e.target === g) close();
    const gt = e.target.closest('[data-gtour]');
    if (gt) { close(); const tour = D.tours.find((x) => x.id === gt.dataset.gtour); if (tour) startTour(tour); return; }
    const t = e.target.closest('[data-tour]');
    if (t) {
      const tour = TOURS[+t.dataset.tour];
      close();
      setYear(tour.y);
      if (tour.id && D.byKind.event.has(tour.id)) select('event', tour.id);
      else { showTab('year'); }
    }
  };
}

boot();
