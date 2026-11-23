'use strict';
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'reference/evidence'), base = 'file://' + path.join(root, 'reference/graybox/index.html');
(async () => { const b = await chromium.launch(); fs.mkdirSync(out, { recursive: true });
  const open = async (q) => { const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.on('pageerror', (e) => console.log('ERR', e.message)); await p.goto(base + '?' + q); await p.waitForTimeout(250); await p.evaluate(() => window.__g.freeze(true)); return p; };
  const snap = async (p, n) => { await p.waitForTimeout(60); await p.locator('canvas').screenshot({ path: path.join(out, n + '.png') }); console.log('wrote', n); };
  // three zoom bands at one tick
  for (const [n, z] of [['close', 1.6], ['active', 1], ['memory', 0.7]]) { const p = await open('level=l01&clean=1'); await p.evaluate((z) => { const g = window.__g; g.load('l01'); g.playReplay(window.REPLAYS.B, 90); if (z !== 1) { g.pump(); g.cam.pinch({ x: 195, y: 422 }, z); } g.render(); }, z); await snap(p, 'cam-zoom-' + n); await p.close(); }
  // a walked route with two echoes, then TRACE
  const setup = () => { const g = window.__g; g.load('l01'); const plan = { 0: [{ type: 'move', dx: 0, dy: 1 }], 20: [{ type: 'ping' }], 124: [{ type: 'move', dx: 1, dy: 0 }], 160: [{ type: 'stop' }], 162: [{ type: 'ping' }] }; for (let k = 0; k < 190; k++) g.sim.step(plan[g.sim.tick] || []); g.pump(); g.render(); };
  let p = await open('level=l01&clean=1'); await p.evaluate(setup); await snap(p, 'cam-trace-0-before');
  await p.evaluate(() => { const g = window.__g; g.pump(); g.cam.enterTrace(g.sim.snapshot()); g.sim.paused = true; g.camTick(400); }); await snap(p, 'cam-trace-1-pullback');
  await p.evaluate(() => { const g = window.__g; for (let i = 0; i < 30; i++) { g.cam.scrub(-20, 16.7); g.cam.tick(16.7); } g.cam.release(); g.camTick(300); }); await snap(p, 'cam-trace-2-scrubbed-back');
  await p.evaluate(() => { const g = window.__g; g.cam.returnToListener(); g.sim.paused = false; g.camTick(600); }); await snap(p, 'cam-trace-3-returned'); await p.close();
  // reduced motion: a 120 ms fade, no travel
  p = await open('level=l01&clean=1&rm=1'); await p.evaluate(setup); await p.evaluate(() => { const g = window.__g; g.pump(); g.cam.enterTrace(g.sim.snapshot()); g.sim.paused = true; g.render(); }); await snap(p, 'cam-rm-0ms');
  await p.evaluate(() => window.__g.camTick(60)); await snap(p, 'cam-rm-60ms'); await p.evaluate(() => window.__g.camTick(80)); await snap(p, 'cam-rm-140ms'); await p.close();
  // real mouse: first echo, walk, second echo, TRACE, scrub, return. Recorded.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: out, size: { width: 390, height: 844 } } }), v = await ctx.newPage(); v.on('pageerror', (e) => console.log('ERR', e.message));
  await v.goto(base + '?level=l01&clean=1&intro=1'); const m = v.mouse, tap = async (x, y, hold = 60) => { await m.move(x, y); await m.down(); await v.waitForTimeout(hold); await m.up(); };
  await v.waitForTimeout(1200); await tap(318, 740); await v.waitForTimeout(1800); await tap(195, 290); await v.waitForTimeout(3600); await tap(318, 740); await v.waitForTimeout(1600); await tap(330, 422); await v.waitForTimeout(3800); await tap(318, 740); await v.waitForTimeout(1200);
  await tap(229, 740); await v.waitForTimeout(1400);
  await m.move(361, 650); await m.down(); for (let i = 0; i <= 24; i++) { await m.move(361, 650 - i * 14); await v.waitForTimeout(40); } await m.up(); await v.waitForTimeout(1400);
  await tap(195, 788); await v.waitForTimeout(1800);
  const vid = v.video(); await v.close(); await ctx.close(); fs.renameSync(await vid.path(), path.join(out, 'cam-trace-demo.webm')); console.log('wrote video'); await b.close(); })();
