// Shared helpers: years, formatting, links, escaping.
export const MIN_YEAR = -509;
export const MAX_YEAR = 641;

// Year arithmetic with no year zero.
export const yearToIdx = (y) => (y < 0 ? y + 1 : y); // -1 -> 0, 1 -> 1 : continuous axis value
export const idxToYear = (i) => { i = Math.round(i); return i <= 0 ? i - 1 : i; };
export const addYears = (y, n) => clampYear(idxToYear(yearToIdx(y) + n));
export const clampYear = (y) => Math.max(MIN_YEAR, Math.min(MAX_YEAR, y === 0 ? 1 : y));
export const yearSpan = (a, b) => yearToIdx(b) - yearToIdx(a);

export function fmtYear(y, opts = {}) {
  if (y === null || y === undefined || Number.isNaN(y)) return '?';
  if (y < 0) return `${-y} BC`;
  return opts.ad === false ? `${y}` : (y < 300 || opts.ad ? `AD ${y}` : `${y}`);
}
export function fmtYearShort(y) { return y < 0 ? `${-y} BC` : `AD ${y}`; }
export function fmtRange(a, b) {
  if (b === null || b === undefined || a === b) return fmtYear(a);
  if (a < 0 && b < 0) return `${-a}–${-b} BC`;
  if (a > 0 && b > 0) return `AD ${a}–${b}`;
  return `${fmtYear(a)} – ${fmtYear(b)}`;
}
export const auc = (y) => (y < 0 ? 754 + y : 753 + y);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(e) {
  const y = fmtYear(e.year);
  if (e.month && e.day) return `${e.day} ${MONTHS[e.month - 1]} ${y}`;
  if (e.month) return `${MONTHS[e.month - 1]} ${y}`;
  return y;
}
export const monthName = (m) => MONTHS[m - 1];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// [[id|label]] -> entity links; plain text escaped.
export function richText(s, resolver) {
  if (!s) return '';
  const parts = String(s).split(/(\[\[[^\]]+\]\])/g);
  return parts.map((p) => {
    const m = p.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    if (!m) return esc(p);
    const id = m[1].trim();
    const label = m[2] || id.replace(/_/g, ' ');
    return resolver(id) ? `<a class="ent" data-id="${esc(id)}">${esc(label)}</a>` : `<span class="ent missing">${esc(label)}</span>`;
  }).join('');
}

export function paragraphs(s, resolver) {
  if (!s) return '';
  return String(s).split(/\n\s*\n/).map((p) => `<p>${richText(p.trim(), resolver)}</p>`).join('');
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n.toLocaleString('en'));

export function impDots(n = 0) {
  return `<span class="imp" aria-label="importance ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
}

export const ERAS = [
  { id: 'early', name: 'Early Republic', from: -509, to: -265, color: '#7E6A4F' },
  { id: 'mid', name: 'Middle Republic', from: -264, to: -134, color: '#8A5A3C' },
  { id: 'late', name: 'Late Republic', from: -133, to: -28, color: '#8E3B34' },
  { id: 'principate', name: 'Principate', from: -27, to: 192, color: '#6B2346' },
  { id: 'crisis', name: 'Severans and crisis', from: 193, to: 283, color: '#5A3550' },
  { id: 'dominate', name: 'Dominate', from: 284, to: 394, color: '#46416A' },
  { id: 'late_antiquity', name: 'Late Antiquity', from: 395, to: 641, color: '#2F4E66' },
];
export const eraOf = (y) => ERAS.find((e) => y >= e.from && y <= e.to) || ERAS[0];

export const STATUS_LABEL = {
  direct: 'Roman rule', ally: 'Allied / federate', client: 'Client kingdom', occupied: 'Under Roman occupation',
  contested: 'Contested / war zone', independent: 'Independent', unsettled: 'No organised state',
};

export const KIND_LABEL = {
  event: 'Event', person: 'Person', war: 'War', campaign: 'Campaign', place: 'Place', polity: 'State / people',
  legion: 'Legion', frontier: 'Frontier', road: 'Road', source: 'Ancient source', glossary: 'Term', region: 'Region', chapter: 'Chapter',
};
