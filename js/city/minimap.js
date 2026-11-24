// Small orientation plan: river, walls standing this year, hills, camera footprint. Click to fly.
export class MiniMap {
  constructor(host, city3d) {
    this.c = city3d;
    const cv = this.cv = document.createElement('canvas');
    cv.className = 'c3d-mini';
    cv.width = 360; cv.height = 360;
    cv.title = 'Click to fly there';
    host.appendChild(cv);
    this.ext = { x0: -3400, z0: -3000, size: 6400 };
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = this.ext.x0 + (e.clientX - r.left) / r.width * this.ext.size;
      const z = this.ext.z0 + (e.clientY - r.top) / r.height * this.ext.size;
      this.c.flyTo({ x, z }, Math.max(250, this.c.camera.position.distanceTo(this.c.controls.target)));
    });
    this.base = null;
  }
  P(x, z) { const s = this.cv.width / this.ext.size; return [(x - this.ext.x0) * s, (z - this.ext.z0) * s]; }
  drawBase(year) {
    const key = year;
    const city = this.c.city;
    const b = document.createElement('canvas'); b.width = b.height = this.cv.width;
    const g = b.getContext('2d');
    g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, b.width, b.height);
    if (city.tiber?.length) {
      g.strokeStyle = '#7fa3b0'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); city.tiber.forEach((q, i) => { const [x, y] = this.P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    g.strokeStyle = 'rgba(42,33,28,.18)'; g.lineWidth = 1.2;
    for (const s of city.streets || []) { if (year < s.f || year > s.t) continue; g.beginPath(); s.ln.forEach((q, i) => { const [x, y] = this.P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.strokeStyle = '#6B2346'; g.lineWidth = 2.2;
    for (const w of city.walls || []) { if (year < w.f || year > w.t) continue; g.beginPath(); w.ln.forEach((q, i) => { const [x, y] = this.P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.fillStyle = 'rgba(42,33,28,.55)';
    for (const bd of city.buildings) { if (bd.imp < 4 || year < bd.f || year > bd.t || bd.water) continue; const [x, y] = this.P(bd.x, bd.z); g.fillRect(x - 1.5, y - 1.5, 3, 3); }
    g.font = 'italic 15px Spectral, Georgia, serif'; g.fillStyle = '#4b3d2f'; g.textAlign = 'center';
    for (const h of city.hills || []) { if (h.sub) continue; const [x, y] = this.P(h.x, h.z); g.fillText(h.n, x, y); }
    this.base = b; this.baseYear = key;
  }
  draw() {
    const c = this.c; if (!c.city) return;
    if (this.baseYear !== c.year) this.drawBase(c.year);
    const g = this.cv.getContext('2d');
    g.drawImage(this.base, 0, 0);
    // camera footprint: project the four screen corners onto the ground plane at target height
    const cam = c.camera, t = c.controls.target;
    const [cx, cy] = this.P(cam.position.x, cam.position.z);
    const [tx, ty] = this.P(t.x, t.z);
    const dirx = tx - cx, diry = ty - cy, L = Math.hypot(dirx, diry) || 1;
    const fov = cam.fov * cam.aspect * Math.PI / 180 / 2;
    const reach = Math.max(L * 2.2, 26);
    const a = Math.atan2(diry, dirx);
    g.fillStyle = 'rgba(176,58,46,.18)'; g.strokeStyle = 'rgba(176,58,46,.8)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - fov) * reach, cy + Math.sin(a - fov) * reach); g.lineTo(cx + Math.cos(a + fov) * reach, cy + Math.sin(a + fov) * reach); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#B03A2E'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
  }
}
