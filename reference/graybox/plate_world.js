'use strict';
// D, The Listening Plate: world layer renderer. Reads only the VisibleWorldSnapshot.
// Nothing here may touch ground truth. Halos are drawn on the known-floor side of a wall face only,
// so no bloom setting can light anything behind a wall.
(function () {
  const C = { black: '#0B0D0B', sub: '#151A16', chalk: '#E6E0D2', fresh: '#CDE9BB', glow: '#9FC19B', mem: '#718B70', res: '#4E624F', amber: '#F4BE70', danger: '#E98158', exit: '#F1D17C', ui: '#AEB9A8' };
  const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { t = Math.max(0, Math.min(1, t)); const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const hash = (a, b) => { let h = (a * 73856093) ^ (b * 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000; };
  const MAX_PARTICLES = 200;
  let grainTile = null;
  function grain() { if (grainTile) return grainTile; const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), d = g.createImageData(256, 256); let s = 1234567;
    for (let i = 0; i < 256 * 256; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const v = 190 + ((s >>> 24) % 60); d.data[i * 4] = v; d.data[i * 4 + 1] = v - 3; d.data[i * 4 + 2] = v - 12; d.data[i * 4 + 3] = (s >>> 16) % 40; } g.putImageData(d, 0, 0); grainTile = c; return c; }

  function listener(ctx, x, y, col, sc) { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const draw = (stroke, w) => { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(-6, -3); ctx.quadraticCurveTo(-6, 3, 0, 3); ctx.quadraticCurveTo(6, 3, 6, -3); ctx.lineTo(6, -6); ctx.moveTo(6, -10.5); ctx.lineTo(6, -9); ctx.moveTo(0, 3); ctx.lineTo(0, 12); ctx.stroke(); };
    draw(C.black, 5.4); draw(col, 2.4); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 14.5, 1.3, 0, 7); ctx.fill(); ctx.restore(); }
  function scar(ctx, x, y, kind, alpha) { ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha; const col = kind === 'heard' ? C.amber : kind === 'fresh' ? C.fresh : C.mem; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill(); ctx.beginPath(); for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4, r1 = 5.5, r2 = a % 2 ? 8.5 : 11; ctx.moveTo(Math.cos(r) * r1, Math.sin(r) * r1); ctx.lineTo(Math.cos(r) * r2, Math.sin(r) * r2); } ctx.stroke();
    if (kind === 'heard') { ctx.strokeStyle = C.danger; ctx.lineWidth = 1.3; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
      ctx.beginPath(); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const px = -dy, py = dx; ctx.moveTo(dx * 17 + px * 3 - dx * 5, dy * 17 + py * 3 - dy * 5); ctx.lineTo(dx * 17, dy * 17); ctx.lineTo(dx * 17 - px * 3 - dx * 5, dy * 17 - py * 3 - dy * 5); } ctx.stroke(); } ctx.restore(); }
  function beast(ctx, x, y, mode) { const body = () => { ctx.beginPath(); ctx.moveTo(-14, 8); ctx.quadraticCurveTo(-12, -6, -2, -9); ctx.quadraticCurveTo(7, -11, 11, -4); ctx.moveTo(11, -4); ctx.lineTo(16, -8); ctx.lineTo(19, -4); ctx.lineTo(15, -1); ctx.moveTo(-9, 7); ctx.lineTo(-12, 16); ctx.moveTo(-3, 6); ctx.lineTo(-4, 17); ctx.moveTo(5, 3); ctx.lineTo(8, 14); ctx.moveTo(-14, 8); ctx.lineTo(-19, 5); };
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (mode === 'direct') { ctx.strokeStyle = 'rgba(11,13,11,.7)'; ctx.lineWidth = 6; body(); ctx.stroke(); ctx.strokeStyle = C.danger; ctx.lineWidth = 2.7; ctx.setLineDash([11, 3, 5, 3]); body(); ctx.stroke(); }
    else { ctx.globalAlpha = 0.75; ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.setLineDash([0.1, 5.2]); body(); ctx.stroke(); ctx.lineWidth = 1.2; ctx.setLineDash([0.1, 6]); ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.stroke(); }
    ctx.restore(); }

  // cam: {x, y, K, W, H, py}. opts: {bloom, particles, tick, underlay(ctx), brightnessSafe}
  function draw(ctx, snap, cam, opts = {}) {
    const { K, W, H } = cam, py = cam.py ?? H * 0.5, bloom = Math.max(0, opts.bloom ?? 1), tick = opts.tick || 0, band = opts.band || 'active', mem = band === 'memory', ss = band === 'close' ? 1.2 : mem ? 0.7 : 1, ids = [];
    const sx = (x) => W / 2 + (x - cam.x) * K, sy = (y) => py - (y - cam.y) * K;
    if (opts.plain) { ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H); } else { const g = ctx.createRadialGradient(W / 2, py, 40, W / 2, py, H * 0.8); g.addColorStop(0, '#151A16'); g.addColorStop(0.6, '#0E110E'); g.addColorStop(1, C.black); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    // world-anchored grain: the tile moves with the world, so it never swims under camera motion or zoom
    const tile = grain(), pat = ctx.createPattern(tile, 'repeat'); ctx.save(); ctx.globalAlpha = 0.07; ctx.translate(-((cam.x * K) % 256) , ((cam.y * K) % 256)); ctx.fillStyle = pat; ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
    if (opts.underlay) opts.underlay(ctx);
    // ---- wall faces by age ----
    const G = new Map(), halo = [], fringe = []; let nseg = 0;
    const add = (key, st, x1, y1, x2, y2) => { let b = G.get(key); if (!b) { b = { st, d: [] }; G.set(key, b); } b.d.push(x1, y1, x2, y2); };
    for (const s of snap.segments) {
      const t = s.ageTicks / 30, x1 = sx(s.p[0]), y1 = sy(s.p[1]), x2 = sx(s.p[2]), y2 = sy(s.p[3]); nseg++;
      const nxp = s.n[0], nyp = -s.n[1]; // inward normal in screen space
      if (t < 0.35) { ids.push(s.id); add('f', { col: C.fresh, w: 2.3 * ss, a: 1, dash: null }, x1, y1, x2, y2); if (!mem) { halo.push([x1, y1, x2, y2, nxp, nyp, 1]); fringe.push([x1, y1, x2, y2, nxp, nyp, 0.55]); } }
      else if (t < 1.4) { const u = (t - 0.35) / 1.05; ids.push(s.id); add('a' + Math.round(u * 5), { col: mix(C.fresh, C.glow, u), w: (1.9 - 0.3 * u) * ss, a: 0.95, dash: null }, x1, y1, x2, y2); if (u < 0.5 && !mem) { halo.push([x1, y1, x2, y2, nxp, nyp, 0.5 * (1 - u * 2)]); fringe.push([x1, y1, x2, y2, nxp, nyp, 0.4 * (1 - u * 2)]); } }
      else if (t < 8) { const u = (t - 1.4) / 6.6, keep = 1 - 0.92 * Math.pow(u, 1.15), mx = (s.p[0] + s.p[2]) / 2, my = (s.p[1] + s.p[3]) / 2;
        if (hash(Math.floor(mx / 0.9) + s.n[0] * 7, Math.floor(my / 0.9) + s.n[1] * 5) > keep) continue;
        const col = u < 0.5 ? mix(C.glow, C.mem, u * 2) : mix(C.mem, C.res, (u - 0.5) * 2), q = Math.round(u * 8);
        ids.push(s.id); add('m' + q, { col, w: (1.45 - 0.5 * u) * ss, a: 0.95, dash: u < 0.55 ? [7, 2.2] : [3.2, 3.6] }, x1, y1, x2, y2); }
    }
    ctx.lineCap = 'round';
    // halo and fringe sit on the known-floor side only
    const naive = !!opts.naiveHalo, hw = naive ? 5 * bloom : Math.min(26, 5 * bloom), ha = Math.min(0.9, 0.22 * bloom), off = naive ? 0 : hw / 2; // naive = deliberately wrong control used by the tests
    if (bloom > 0 && halo.length) { ctx.strokeStyle = C.fresh; ctx.lineWidth = hw; ctx.lineCap = 'butt'; for (const h of halo) { ctx.globalAlpha = ha * h[6]; ctx.beginPath(); ctx.moveTo(h[0] + h[4] * off, h[1] + h[5] * off); ctx.lineTo(h[2] + h[4] * off, h[3] + h[5] * off); ctx.stroke(); } ctx.globalAlpha = 1; ctx.lineCap = 'round'; }
    ctx.strokeStyle = C.fresh; ctx.lineWidth = 1.1; ctx.setLineDash([2, 3]); for (const f of fringe) { ctx.globalAlpha = f[6]; ctx.beginPath(); ctx.moveTo(f[0] + f[4] * 2.2, f[1] + f[5] * 2.2); ctx.lineTo(f[2] + f[4] * 2.2, f[3] + f[5] * 2.2); ctx.stroke(); } ctx.setLineDash([]); ctx.globalAlpha = 1;
    for (const b of G.values()) { ctx.strokeStyle = b.st.col; ctx.lineWidth = b.st.w; ctx.globalAlpha = b.st.a; ctx.lineCap = b.st.dash ? 'butt' : 'round'; ctx.setLineDash(b.st.dash || []); ctx.beginPath(); for (let i = 0; i < b.d.length; i += 4) { ctx.moveTo(b.d[i], b.d[i + 1]); ctx.lineTo(b.d[i + 2], b.d[i + 3]); } ctx.stroke(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineCap = 'round';
    // ---- incident front: a broken pressure seam along the cells the wave is touching now ----
    for (const w of (mem ? [] : snap.waves)) { ctx.strokeStyle = C.fresh; ctx.lineWidth = 2.6; for (const q of w.pts) { const x = sx(q[0]), y = sy(q[1]), tx = q[2], ty = -q[3]; ctx.globalAlpha = 0.55 + 0.4 * q[4]; ctx.beginPath(); ctx.moveTo(x - tx * 3.6, y - ty * 3.6); ctx.lineTo(x + tx * 3.6, y + ty * 3.6); ctx.stroke(); } ctx.globalAlpha = 1; }
    // ---- restrained particles: tiny motes lifting off freshly contacted faces, capped ----
    let np = 0; if (opts.particles !== false && !mem) { ctx.fillStyle = C.chalk; for (const s of snap.segments) { if (s.ageTicks > 10 || np >= MAX_PARTICLES) continue; if (hash(s.id, (tick >> 1) + 7) > 0.18) continue; const u = s.ageTicks / 10, mx = (s.p[0] + s.p[2]) / 2, my = (s.p[1] + s.p[3]) / 2, ox = s.n[0] * u * 0.5, oy = s.n[1] * u * 0.5; ctx.globalAlpha = 0.7 * (1 - u); ctx.beginPath(); ctx.arc(sx(mx + ox), sy(my + oy), 1, 0, 7); ctx.fill(); np++; } ctx.globalAlpha = 1; }
    // ---- cast origins ----
    for (const o of snap.castOrigins) { const age = o.ageTicks / 30; scar(ctx, sx(o.origin[0]), sy(o.origin[1]), o.heardAgeTicks !== null ? 'heard' : age < 1.4 ? 'fresh' : 'mem', Math.max(0.25, 1 - Math.max(0, age - 5) / 3)); }
    // ---- creatures: sensed now, then a dissolving last-seen ghost. Never a live position. ----
    for (const gh of snap.ghosts) { const x = sx(gh.pos[0]), y = sy(gh.pos[1]); beast(ctx, x, y, gh.ageTicks < 10 ? 'direct' : 'ghost'); if (gh.ageTicks >= 10) { ctx.fillStyle = C.amber; ctx.font = '12.5px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.95; ctx.fillText('seen ' + (gh.ageTicks / 30).toFixed(1) + ' s ago', x, y + 40); ctx.globalAlpha = 1; ctx.textAlign = 'left'; } }
    // ---- exit ----
    if (snap.knownExit) { const x = sx(snap.knownExit[0]), y = sy(snap.knownExit[1]); ctx.strokeStyle = C.exit; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x - 12, y + 12); ctx.lineTo(x - 12, y - 5); ctx.quadraticCurveTo(x - 12, y - 16, x, y - 16); ctx.quadraticCurveTo(x + 12, y - 16, x + 12, y - 5); ctx.lineTo(x + 12, y + 12); ctx.stroke(); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 12); ctx.stroke(); ctx.setLineDash([]); }
    // ---- you: always last, never under a halo ----
    const px = sx(snap.player[0]), pyy = sy(snap.player[1]); ctx.strokeStyle = 'rgba(230,224,210,.22)'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.arc(px, pyy - 3, 24, 0, 7); ctx.stroke(); ctx.setLineDash([]); listener(ctx, px, pyy - 3, C.chalk, band === 'close' ? 1.55 : mem ? 1.0 : 1.35);
    return { segments: nseg, particles: np, ids, band };
  }
  window.ECHO_PLATE = { draw, colors: C };
})();
