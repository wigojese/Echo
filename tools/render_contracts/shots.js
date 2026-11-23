'use strict';
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'reference/evidence'), base = 'file://' + path.join(root, 'reference/graybox/index.html');
(async () => { const b = await chromium.launch(); fs.mkdirSync(out, { recursive: true });
  const open = async (q, dsf = 2) => { const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dsf }); p.on('pageerror', (e) => console.log('ERR', e.message)); await p.goto(base + '?' + q); await p.waitForTimeout(250); await p.evaluate(() => window.__g.freeze(true)); return p; };
  const snap = async (p, n) => { await p.waitForTimeout(60); await p.locator('canvas').screenshot({ path: path.join(out, n + '.png') }); console.log('wrote', n); };
  let p = await open('level=l01&clean=1'); await p.evaluate(() => { window.__g.load('l01'); window.__g.playReplay(window.REPLAYS.B, 76); }); await snap(p, 'plate-01-wave-at-corner'); await p.close();
  p = await open('level=l01&clean=1'); await p.evaluate(() => { const g = window.__g; g.load('l01'); const by = { 1: [{ type: 'move', dx: 0, dy: 1 }], 3: [{ type: 'ping' }], 60: [{ type: 'ping' }], 61: [{ type: 'stop' }] }; for (let k = 0; k < 92; k++) g.sim.step(by[g.sim.tick] || []); g.render(); }); await snap(p, 'plate-02-two-echoes-overlapping'); await p.close();
  p = await open('level=l01&clean=1'); await p.evaluate(() => { window.__g.load('l01'); window.__g.playReplay(window.REPLAYS.A, 566); }); await snap(p, 'plate-03-heard-old-origin-and-ghost'); await p.close();
  p = await open('level=sealed&clean=1&bloom=16'); await p.evaluate(() => { const g = window.__g; g.load('sealed'); g.tick(3); g.sim.step([{ type: 'ping' }]); g.tick(9); }); await snap(p, 'plate-04-sealed-wall-heavy-bloom'); await p.close();
  p = await open('level=l01&clean=1'); await p.evaluate(() => { const g = window.__g; g.load('l01'); const rep = JSON.parse(JSON.stringify(window.REPLAYS.B)); rep.inputs.push({ tick: 872, type: 'ping' }); g.playReplay(rep, 884); }); await snap(p, 'plate-05-exit-known'); await p.close();
  p = await open('level=l01&clean=1'); await p.evaluate(() => { window.__g.load('l01'); window.__g.playReplay(window.REPLAYS.B, 885); }); await snap(p, 'plate-07-decayed-no-echo'); await p.close();
  for (const [n, br] of [['low', '0.45'], ['high', '1']]) { p = await open('level=l01&clean=1&bright=' + br); await p.evaluate(() => { window.__g.load('l01'); window.__g.playReplay(window.REPLAYS.B, 76); }); await snap(p, 'plate-06-brightness-' + n); await p.close(); }
  // 30 s recording of replay B playing in real time
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: out, size: { width: 390, height: 844 } } }), vp = await ctx.newPage(); await vp.goto(base + '?level=l01&clean=1&replay=B'); await vp.waitForTimeout(31000); const v = vp.video(); await vp.close(); await ctx.close(); const f = await v.path(); fs.renameSync(f, path.join(out, 'plate-L01-replayB-30s.webm')); console.log('wrote video');
  await b.close(); })();
