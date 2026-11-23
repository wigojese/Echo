'use strict';
// Pixel-level render contracts for the D renderer. Runs the browser build in headless Chromium (software rendering,
// server CPU). These checks are about what is drawn, not how fast a phone draws it.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), url = 'file://' + path.join(root, 'reference/graybox/index.html');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SEALED = { level: J('tests/fixtures/sealed_level.json'), geometry: J('tests/fixtures/sealed_geometry.json') };
const out = []; let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; const l = `${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`; out.push(l); console.log(l); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
(async () => {
  const b = await chromium.launch(); const page = async (q) => { const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', (e) => console.log('ERR', e.message)); await p.goto(url + '?' + q); await p.waitForTimeout(250); await p.evaluate(() => window.__g.freeze(true)); return p; };
  // helper run inside the page: max luminance (0 to 255) and bright-pixel count in a screen rectangle of the canvas
  const region = (p, x0, y0, x1, y1) => p.evaluate(([x0, y0, x1, y1]) => { const cv = document.getElementById('c'), d = cv.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data; let mx = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; if (l > mx) mx = l; if (l > 60) n++; } return { mx, n }; }, [x0, y0, x1, y1]);

  // 1. Sealed wall stays opaque under heavy bloom. Player at (4,10), far corridor starts 0.8 m beyond the wall face.
  //    Captured 9 ticks after the cast, while the walls are still in their fresh phase and the halo is on.
  const cap = async (q) => { const p = await page(q); await p.evaluate(() => { const g = window.__g; g.load('sealed'); g.tick(3); g.sim.step([{ type: 'ping' }]); g.tick(9); }); const far = await region(p, 236, 342, 380, 502), near = await region(p, 160, 342, 232, 502); await p.close(); return { far, near }; };
  const r1 = await cap('level=sealed&clean=1&bloom=1'), rM = await cap('level=sealed&clean=1&bloom=16'), rN = await cap('level=sealed&clean=1&bloom=16&naive=1');
  check('C1 sealed wall, normal bloom: the far corridor stays dark', r1.far.n === 0 && r1.far.mx < 60, `far max luminance ${r1.far.mx.toFixed(0)}, bright pixels ${r1.far.n}`);
  check('C1b sealed wall, bloom 16 (nearly three times the cap): the far corridor stays dark', rM.far.n === 0 && rM.far.mx < 60, `far max luminance ${rM.far.mx.toFixed(0)}, bright pixels ${rM.far.n}`);
  check('C1c heavy bloom really is brighter on the near side, so the dark far side is not trivial', rM.near.n > r1.near.n * 1.5, `bright pixels near: bloom 1 = ${r1.near.n}, bloom 16 = ${rM.near.n}`);
  check('C1d negative control: a naive halo centred on the wall at the same bloom DOES leak, so this test can fail', rN.far.n > 100, `far bright pixels with the naive halo ${rN.far.n}`);

  // 2. Different hidden creature positions give byte-identical frames
  { const frames = []; for (const pos of [[7.2, 13], [7.2, 7]]) { const p = await page('level=sealed&clean=1&bloom=max'); const lv = JSON.parse(JSON.stringify(SEALED.level)); lv.predators[0].spawn_xy = pos; lv.predators[0].patrol_waypoints = [pos, [7.2, pos[1] === 13 ? 7 : 13]];
      const hashes = await p.evaluate(([lv, geo]) => { const g = window.__g; g.loadCustom(lv, geo); const hs = []; const plan = { 10: [{ type: 'ping' }], 11: [{ type: 'move', dx: 0, dy: -1 }], 60: [{ type: 'ping' }], 61: [{ type: 'stop' }], 120: [{ type: 'ping' }] };
        for (let k = 0; k < 240; k++) { g.sim.step(plan[g.sim.tick] || []); if (k % 15 === 0) { g.render(); const d = document.getElementById('c').getContext('2d').getImageData(0, 0, 390, 844).data; let h = 2166136261; for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619) >>> 0; hs.push(h); } } return hs; }, [lv, SEALED.geometry]);
      frames.push(hashes); await p.close(); }
    check('C2 different hidden creature positions render byte-identical frames (16 frames compared)', frames[0].length === 16 && JSON.stringify(frames[0]) === JSON.stringify(frames[1])); }

  // 3. A creature that has not been sensed is not drawn, and its surroundings stay dark
  { const p = await page('level=l01&clean=1&bloom=max'); const r = await p.evaluate(() => { const g = window.__g; g.load('l01'); g.playReplay(window.REPLAYS.B, 480); const pp = g.sim.pred[0].pos, pl = g.sim.pos, sx = 195 + (pp[0] - pl[0]) * 20, sy = 422 - (pp[1] - pl[1]) * 20; return { sx, sy, sensed: g.sim.ghosts.size }; });
    const reg = await region(p, Math.max(0, r.sx - 40), Math.max(0, r.sy - 40), Math.min(390, r.sx + 40), Math.min(844, r.sy + 40));
    check('C3 a creature that has not been sensed is not drawn, and nothing near it is lit', r.sensed === 0 && r.sy > 0 && r.sy < 844 && reg.mx < 60, `on screen at (${r.sx.toFixed(0)},${r.sy.toFixed(0)}), region max luminance ${reg.mx.toFixed(0)}`); await p.close(); }

  // 4. Contrast of the age stages against the plate (graphics need 3:1). Sampled on the left wall face, away from the player glyph.
  { const p = await page('level=l01&clean=1'); const res = await p.evaluate(() => { const g = window.__g; const lum = (r, gg, bb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(bb); };
      const c2 = document.getElementById('c').getContext('2d'), stages = {};
      for (const [name, age] of [['fresh', 3], ['afterglow', 24], ['memory', 90], ['residue', 200]]) { g.load('l01'); const by = { 0: [{ type: 'ping' }] }; for (let k = 0; k < 17 + age; k++) g.sim.step(by[g.sim.tick] || []); g.render();
        const d = c2.getImageData(164, 270, 14, 130).data; let best = 0; for (let i = 0; i < d.length; i += 4) best = Math.max(best, lum(d[i], d[i + 1], d[i + 2])); const bgp = c2.getImageData(120, 300, 1, 1).data; stages[name] = (best + 0.05) / (lum(bgp[0], bgp[1], bgp[2]) + 0.05); } return stages; }); await p.close();
    check('C4 fresh contact has at least 3:1 contrast against the plate', res.fresh >= 3, `${res.fresh.toFixed(1)}:1`); check('C4b afterglow has at least 3:1', res.afterglow >= 3, `${res.afterglow.toFixed(1)}:1`);
    check('C4c verified memory has at least 3:1, residue is allowed to fade below it', res.memory >= 3 && res.fresh > res.memory && res.memory > res.residue, `fresh ${res.fresh.toFixed(1)}, memory ${res.memory.toFixed(1)}, residue ${res.residue.toFixed(1)}`); }

  // 5. HUD text contrast
  { const p = await page('level=l01&clean=1'); const c = await p.evaluate(() => { const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; const c2 = document.getElementById('c').getContext('2d'); const d = c2.getImageData(300, 760, 36, 24).data; let mx = 0, mn = 1; for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]); mx = Math.max(mx, l); mn = Math.min(mn, l); } return (mx + 0.05) / (mn + 0.05); });
    check('C5 the Echo label has at least 4.5:1 contrast against its button', c >= 4.5, `${c.toFixed(1)}:1`); await p.close(); }

  // 6. Grain is world-anchored: moving the camera 0.5 m shifts the grain by exactly 10 px
  { const p = await page('level=l01&clean=1'); const r = await p.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 390; cv.height = 844; const c2 = cv.getContext('2d'); const snap = { segments: [], waves: [], castOrigins: [], ghosts: [], knownExit: null, player: [0, 0] }; const draw = (x, y) => { window.ECHO_PLATE.draw(c2, snap, { x, y, K: 20, W: 390, H: 844 }, { plain: true, particles: false }); return c2.getImageData(0, 0, 390, 844); };
      const A = draw(10, 10), B = draw(10.5, 10), C = draw(10, 10.5); const at = (im, x, y, k) => im.data[(y * 390 + x) * 4 + k]; let dx = 0, dy = 0, n = 0, base = 0;
      for (let y = 60; y < 700; y += 7) for (let x = 40; x < 340; x += 7) { for (let k = 0; k < 3; k++) { dx += Math.abs(at(A, x, y, k) - at(B, x - 10, y, k)); dy += Math.abs(at(A, x, y, k) - at(C, x, y + 10, k)); base += Math.abs(at(A, x, y, k) - at(B, x, y, k)); n++; } } return { dx: dx / n, dy: dy / n, base: base / n }; }); await p.close();
    check('C6 the grain is world-anchored: it moves with the world, not the screen', r.dx < 0.01 && r.dy < 0.01 && r.base > 0.3, `error after the matching shift x=${r.dx.toFixed(3)} y=${r.dy.toFixed(3)}, error with no shift ${r.base.toFixed(2)}`); }

  // 7. Budgets over a full replay, and render cost against the graybox style
  { const p = await page('level=l01&clean=1'); const r = await p.evaluate(() => { const g = window.__g; g.load('l01'); let maxSeg = 0, maxPart = 0, maxWaves = 0; const by = {}; window.REPLAYS.B.inputs.forEach((i) => (by[i.tick] = by[i.tick] || []).push(i));
      while (g.sim.state === 'RUNNING') { g.sim.step(by[g.sim.tick] || []); if (g.sim.tick % 3 === 0) { g.render(); const s = g.stats; maxSeg = Math.max(maxSeg, s.segments); maxPart = Math.max(maxPart, s.particles); maxWaves = Math.max(maxWaves, g.sim.snapshot().waves.length); } } return { maxSeg, maxPart, maxWaves }; });
    check('C7 budgets over a full run: at most 200 particles, 1,500 contour segments, 2 overlapping waves', r.maxPart <= 200 && r.maxSeg <= 1500 && r.maxWaves <= 2, `max particles ${r.maxPart}, max segments ${r.maxSeg}, max waves ${r.maxWaves}`);
    const ov = await p.evaluate(() => { const g = window.__g; g.load('l01'); let mw = 0, mp = 0, ms = 0; for (let k = 0; k < 300; k++) { g.sim.step(k % 38 === 0 ? [{ type: 'ping' }] : (k === 1 ? [{ type: 'move', dx: 0, dy: 1 }] : [])); if (k % 2 === 0) { g.render(); mw = Math.max(mw, g.sim.snapshot().waves.length); mp = Math.max(mp, g.stats.particles); ms = Math.max(ms, g.stats.segments); } } return { mw, mp, ms }; });
    check('C7b pinging as fast as the cooldown allows: never more than 2 waves, 200 particles or 1,500 segments', ov.mw <= 2 && ov.mw >= 2 && ov.mp <= 200 && ov.ms <= 1500, `waves ${ov.mw}, particles ${ov.mp}, segments ${ov.ms}`);
    const t = await p.evaluate(() => { const g = window.__g, res = {}, c2 = document.getElementById('c').getContext('2d'); g.load('l01'); g.playReplay(window.REPLAYS.B, 520); for (const st of ['graybox', 'plate']) { g.setStyle(st); for (let i = 0; i < 20; i++) { g.render(); c2.getImageData(0, 0, 1, 1); } const a = []; for (let i = 0; i < 300; i++) { const t0 = performance.now(); g.render(); c2.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); } a.sort((x, y) => x - y); res[st] = { p50: a[150], p95: a[285], max: a[299] }; } return res; }); await p.close();
    const l = `PERF render() plus raster flush, headless Chromium software rendering on a server CPU, replay B at tick 520 (not a phone): graybox p50 ${t.graybox.p50.toFixed(2)} ms p95 ${t.graybox.p95.toFixed(2)} ms | plate p50 ${t.plate.p50.toFixed(2)} ms p95 ${t.plate.p95.toFixed(2)} ms | delta p50 ${(t.plate.p50 - t.graybox.p50).toFixed(2)} ms`; out.push(l); console.log(l); }
  const rl = `RESULT ${pass} passed, ${fail} failed`; out.push(rl); console.log(rl);
  fs.mkdirSync(path.join(root, 'reference/evidence'), { recursive: true }); fs.writeFileSync(path.join(root, 'reference/evidence/render-contracts.txt'), out.join('\n') + '\n'); await b.close(); process.exit(fail ? 1 : 0);
})();
