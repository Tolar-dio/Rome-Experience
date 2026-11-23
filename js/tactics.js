// Battle diagram player: units as blocks moving through phases.
import { esc, richText } from './util.js';
import { exists } from './data.js';

const W = 100, H = 60;
const KIND_FILL = { infantry: 1, cavalry: 0.7, light: 0.45, elephants: 0.85, archers: 0.45, ships: 0.9, camp: 0.25, baggage: 0.2, reserve: 0.6 };

const ALIAS = { stream: 'river', strait: 'sea', coast: 'sea', land: 'land', plain: 'label', ravine: 'ditch', stakes: 'ditch', bridge: 'road' };
function terrainSvg(t0) {
  const t = { ...t0, kind: ALIAS[t0.kind] || t0.kind };
  if (t0.kind === 'stream') t.w = 0.8;
  if (t0.kind === 'fire') return `<circle cx="${t.cx}" cy="${t.cy}" r="${t.r || 2}" fill="#D9822B" opacity=".6"/>${t.label ? `<text x="${t.cx}" y="${t.cy - (t.r || 2) - 1}" text-anchor="middle" class="tx-label" fill="#8A4A14">${esc(t.label)}</text>` : ''}`;
  if (t.kind === 'land' && t.pts) return `<polygon points="${t.pts.map((q) => q.join(',')).join(' ')}" fill="#E4DAC2"/>`;
  if (t.kind === 'label' || (t.kind === 'land' && !t.pts)) return t.label && t.cx !== undefined ? `<text x="${t.cx}" y="${t.cy}" class="tx-label" fill="#5A4E45">${esc(t.label)}</text>` : '';
  const pts = (p) => (p || []).map((q) => q.join(',')).join(' ');
  switch (t.kind) {
    case 'river': return `<polyline points="${pts(t.pts)}" fill="none" stroke="#4C7489" stroke-width="${t.w || 1.6}" stroke-linecap="round" stroke-linejoin="round"/>${t.label ? `<text x="${t.pts?.[0]?.[0] ?? 0}" y="${(t.pts?.[0]?.[1] ?? 0) - 1.2}" class="tx-label" fill="#2E5A70">${esc(t.label)}</text>` : ''}`;
    case 'road': return `<polyline points="${pts(t.pts)}" fill="none" stroke="#8A6A4A" stroke-width=".5" stroke-dasharray="1.2 .8"/>`;
    case 'sea': case 'lake': case 'marsh': return `<polygon points="${pts(t.pts)}" fill="${t.kind === 'marsh' ? '#9FB5A6' : '#9EC0D2'}" opacity=".7"/>${t.label ? `<text x="${t.pts?.[0]?.[0] ?? 0}" y="${(t.pts?.[0]?.[1] ?? 0) + 3}" class="tx-label" fill="#2E5A70">${esc(t.label)}</text>` : ''}`;
    case 'hill': case 'ridge': return `<ellipse cx="${t.cx}" cy="${t.cy}" rx="${t.r || t.rx || 5}" ry="${(t.r || t.ry || 5) * 0.65}" fill="url(#hillHatch)" stroke="#A08F70" stroke-width=".3"/>${t.label ? `<text x="${t.cx}" y="${t.cy + (t.r || 5) * 0.65 + 2.6}" text-anchor="middle" class="tx-label" fill="#6A5A40">${esc(t.label)}</text>` : ''}`;
    case 'forest': case 'wood': return `<ellipse cx="${t.cx}" cy="${t.cy}" rx="${t.r || 5}" ry="${(t.r || 5) * 0.7}" fill="#9DB48A" opacity=".7"/>${t.label ? `<text x="${t.cx}" y="${t.cy + 1}" text-anchor="middle" class="tx-label" fill="#3E5A2E">${esc(t.label)}</text>` : ''}`;
    case 'town': case 'camp': case 'fort': return `<rect x="${t.cx - (t.r || 2.5)}" y="${t.cy - (t.r || 2.5)}" width="${(t.r || 2.5) * 2}" height="${(t.r || 2.5) * 2}" fill="none" stroke="#5A4E45" stroke-width=".5"/>${t.label ? `<text x="${t.cx}" y="${t.cy - (t.r || 2.5) - 1}" text-anchor="middle" class="tx-label" fill="#5A4E45">${esc(t.label)}</text>` : ''}`;
    case 'line': case 'wall': case 'ditch': return `<polyline points="${pts(t.pts)}" fill="none" stroke="#5A1414" stroke-width=".7" stroke-dasharray="${t.kind === 'ditch' ? '1 .6' : ''}"/>${t.label ? `<text x="${t.pts?.[0]?.[0] ?? 0}" y="${(t.pts?.[0]?.[1] ?? 0) - 1}" class="tx-label" fill="#5A1414">${esc(t.label)}</text>` : ''}`;
    default: return t.label && t.cx !== undefined ? `<text x="${t.cx}" y="${t.cy}" class="tx-label" fill="#5A4E45">${esc(t.label)}</text>` : '';
  }
}

export function renderTactic(host, tac, colors) {
  let phase = 0;
  const units = tac.units || [];
  const phases = tac.phases || [];
  const last = {};
  const posFor = (uid, i) => {
    for (let k = i; k >= 0; k--) if (phases[k]?.pos?.[uid]) return phases[k].pos[uid];
    return null;
  };
  host.innerHTML = `<div class="tactic">
    <svg viewBox="-2 -2 ${W + 4} ${H + 4}" class="tx-svg" role="img" aria-label="${esc(tac.title || 'Battle diagram')}">
      <defs><pattern id="hillHatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="2" fill="#E2D6B8"/><line x1="0" y1="0" x2="0" y2="2" stroke="#C9B994" stroke-width=".6"/></pattern>
      <marker id="txArrow0" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="${colors[0]}"/></marker>
      <marker id="txArrow1" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="${colors[1]}"/></marker></defs>
      <rect x="-2" y="-2" width="${W + 4}" height="${H + 4}" fill="#EEE7D6"/>
      <g class="tx-terrain">${(tac.terrain || []).map(terrainSvg).join('')}</g>
      <g transform="translate(96 5) rotate(${-(tac.north || 0)})"><path d="M0 -3 L1.2 1.5 L0 .6 L-1.2 1.5 Z" fill="#5A4E45"/><text y="-3.6" text-anchor="middle" class="tx-label" fill="#5A4E45" style="font-style:normal">N</text></g>
      <g class="tx-arrows"></g>
      <g class="tx-units">${units.map((u) => `<g class="tx-unit" data-u="${esc(u.id)}"><rect x="${-(u.w || 6) / 2}" y="${-(u.h || 3) / 2}" width="${u.w || 6}" height="${u.h || 3}" rx=".4" fill="${colors[u.side || 0]}" fill-opacity="${KIND_FILL[u.kind] ?? 0.8}" stroke="${colors[u.side || 0]}" stroke-width=".35"/>${u.kind === 'cavalry' ? `<line x1="${-(u.w || 6) / 2}" y1="${(u.h || 3) / 2}" x2="${(u.w || 6) / 2}" y2="${-(u.h || 3) / 2}" stroke="#fff" stroke-width=".35"/>` : ''}<text class="tx-ulabel" y="${-(u.h || 3) / 2 - 0.8}" text-anchor="middle">${esc(u.short || u.label)}</text><title>${esc(u.label)}</title></g>`).join('')}</g>
    </svg>
    <div class="tx-ctl"><button data-tx="prev" aria-label="Previous phase">‹</button><div class="tx-dots">${phases.map((p, i) => `<button data-tx="go" data-i="${i}" title="${esc(p.t)}"></button>`).join('')}</div><button data-tx="next" aria-label="Next phase">›</button><button data-tx="play">Play</button></div>
    <div class="tx-text"></div>
    ${tac.note ? `<p class="meta">${esc(tac.note)}${tac.scaleNote ? ' · ' + esc(tac.scaleNote) : ''}</p>` : ''}
  </div>`;
  const svg = host.querySelector('svg');
  const go = (i) => {
    phase = Math.max(0, Math.min(phases.length - 1, i));
    for (const u of units) {
      const g = svg.querySelector(`[data-u="${CSS.escape(u.id)}"]`);
      const p = posFor(u.id, phase);
      if (!g) continue;
      const hidden = (phases[phase]?.hidden || []).includes(u.id);
      if (!p || hidden) { g.style.opacity = 0; if (!p) continue; }
      else g.style.opacity = 1;
      g.setAttribute('transform', `translate(${p[0]} ${p[1]}) rotate(${p[2] || 0})`);
      g.querySelector('text').setAttribute('transform', `rotate(${-(p[2] || 0)})`);
      last[u.id] = p;
    }
    const ph = phases[phase] || {};
    svg.querySelector('.tx-arrows').innerHTML = (ph.arrows || []).map((a) => `<line x1="${a.from[0]}" y1="${a.from[1]}" x2="${a.to[0]}" y2="${a.to[1]}" stroke="${colors[a.side || 0]}" stroke-width="${a.kind === 'retreat' ? 0.6 : 0.8}" marker-end="url(#txArrow${a.side ? 1 : 0})" stroke-dasharray="${a.kind === 'retreat' ? '0.5 0.7' : '1.5 .8'}" opacity="${a.kind === 'retreat' ? 0.7 : 1}"/>`).join('');
    host.querySelector('.tx-text').innerHTML = `<b>${phase + 1}. ${esc(ph.t || '')}</b> ${richText(ph.text || '', exists)}`;
    host.querySelectorAll('.tx-dots button').forEach((b, k) => b.classList.toggle('on', k === phase));
  };
  let timer = null;
  host.querySelector('.tx-ctl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tx]');
    if (!b) return;
    const a = b.dataset.tx;
    if (a === 'prev') go(phase - 1);
    if (a === 'next') go(phase + 1);
    if (a === 'go') go(+b.dataset.i);
    if (a === 'play') {
      clearInterval(timer);
      go(0);
      timer = setInterval(() => { if (phase >= phases.length - 1) { clearInterval(timer); return; } go(phase + 1); }, 3200);
    }
  });
  go(0);
}
