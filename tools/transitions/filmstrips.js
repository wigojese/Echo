'use strict';
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'reference/evidence/transitions'), base = 'file://' + path.join(root, 'reference/graybox/index.html'); fs.mkdirSync(out, { recursive: true });
const ROUTE = () => { const g = window.__g, plan = { 0: [{ type: 'move', dx: 0, dy: 1 }], 20: [{ type: 'ping' }], 124: [{ type: 'move', dx: 1, dy: 0 }], 160: [{ type: 'stop' }], 162: [{ type: 'ping' }] }; for (let k = 0; k < 190; k++) g.sim.step(plan[g.sim.tick] || []); g.pump(); };
const SC = {
  T1: { q: 'level=l01&clean=1&title=1', times: [0, 120, 240, 360, 480], setup: () => { window.__g.render(); }, go: () => { window.__g.begin(); } },
  T2: { q: 'level=l01&clean=1&intro=1', times: [0, 112, 225, 337, 450], setup: () => { window.__g.cam.startIntro(); }, go: () => { window.__g.TR.start('T2'); } },
  T3: { q: 'level=l01&clean=1', times: [0, 17, 35, 52, 70], setup: () => { window.__g.sim.step([{ type: 'ping' }]); for (let i = 0; i < 2; i++) window.__g.sim.step(); }, go: () => { window.__g.watch(); } },
  T4: { q: 'level=l01&clean=1', times: [0, 108, 215, 322, 430], setup: () => { window.__g.playReplay(window.REPLAYS.A, 538); }, go: () => { window.__g.watch(); } },
  T5: { q: 'level=l01&clean=1', times: [0, 88, 175, 262, 350], setup: ROUTE, go: () => { const g = window.__g; g.cam.enterTrace(g.sim.snapshot()); g.sim.paused = true; g.TR.start('T5'); } },
  T6: { q: 'level=l01&clean=1', times: [0, 130, 260, 390, 520], setup: () => { window.__g.playReplay(window.REPLAYS.A, 645); }, go: () => { window.__g.watch(); } },
  T7: { q: 'level=l01&clean=1', times: [0, 200, 325, 450, 700], setup: () => { window.__g.playReplay(window.REPLAYS.A, 9999); }, go: () => { window.__g.watch(); }, at: { 200: () => { window.__g.TR.reveal(); } } },
  T8: { q: 'level=l01&clean=1', times: [0, 162, 325, 487, 650], setup: () => { window.__g.playReplay(window.REPLAYS.B, 9999); }, go: () => { window.__g.watch(); } },
};
(async () => { const b = await chromium.launch(); const only = process.argv[2];
  for (const [id, sc] of Object.entries(SC)) { if (only && only !== id) continue; const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); p.on('pageerror', (e) => console.log('ERR', id, e.message)); await p.goto(base + '?' + sc.q); await p.waitForTimeout(250); await p.evaluate(() => { window.__g.freeze(true); window.__g.load('l01'); });
    await p.evaluate(sc.setup); await p.evaluate(sc.go); let now = 0, k = 0;
    for (const t of sc.times) { const d = t - now; if (d > 0) await p.evaluate((d) => window.__g.camTick(d, Math.min(16.7, d)), d); now = t; if (sc.at && sc.at[t]) { await p.evaluate(sc.at[t]); } await p.evaluate(() => window.__g.render()); await p.locator('canvas').screenshot({ path: path.join(out, `${id}-${k}.png`) }); k++; }
    await p.close(); console.log('wrote', id); } await b.close(); })();
