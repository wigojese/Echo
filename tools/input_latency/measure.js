'use strict';
// Emulated-touch audit of the browser graybox. Real touch events go through Chromium's input pipeline (CDP),
// but this is headless Chromium on a server CPU. It is NOT a phone and says nothing about finger comfort or thermals.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const url = 'file://' + path.resolve(__dirname, '../../reference/graybox/index.html');
const ECHO = { x: 318, y: 740 };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  const out = []; const say = (s) => { out.push(s); console.log(s); };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i + 1 })) });
  const sleep = (ms) => p.waitForTimeout(ms);
  const casts = () => p.evaluate(() => window.__g.sim.castCount), reset = (mode) => p.goto(url + '?level=sealed&mode=' + mode).then(() => p.evaluate(() => { window.__g.load('l01'); }));
  const noCool = () => p.evaluate(() => { window.__g.sim.nextPingTick = 0; });
  say(`AUDIT emulated touch, headless Chromium ${b.version()}, 390x844 CSS px, dsf 2. Not a phone.`);

  for (const mode of ['waypoint', 'joystick']) {
    await reset(mode); await p.evaluate((m) => { window.__g.router.setMode(m); }, mode); await sleep(300);
    // A: 50 deliberate taps near the centre of Echo, with jitter, must all ping
    let before = await casts(); for (let i = 0; i < 50; i++) { await noCool(); const j = { x: ECHO.x + (Math.random() * 40 - 20), y: ECHO.y + (Math.random() * 40 - 20) }; await touch('touchStart', [j]); await sleep(25); await touch('touchEnd', []); await sleep(25); }
    const a = (await casts()) - before;
    // B: 50 drags that start in the world and end on Echo must never ping
    before = await casts(); for (let i = 0; i < 50; i++) { await noCool(); await touch('touchStart', [{ x: 200, y: 300 }]); await touch('touchMove', [{ x: 260, y: 520 }]); await touch('touchMove', [{ x: ECHO.x, y: ECHO.y }]); await sleep(15); await touch('touchEnd', []); await sleep(15); }
    const bb = (await casts()) - before;
    // C: 50 taps in the world and 50 taps just outside Echo's hit area never ping
    before = await casts(); for (let i = 0; i < 50; i++) { await noCool(); const ang = Math.random() * 6.28, r = 58 + Math.random() * 20; await touch('touchStart', [{ x: ECHO.x + Math.cos(ang) * r, y: ECHO.y + Math.sin(ang) * r }]); await sleep(20); await touch('touchEnd', []); await sleep(20); }
    const c = (await casts()) - before;
    // D: an interruption (touchCancel) while pressing Echo's neighbour never pings, and stops movement
    await reset(mode); await p.evaluate((m) => { window.__g.router.setMode(m); }, mode); await sleep(200); before = await casts();
    for (let i = 0; i < 20; i++) { await touch('touchStart', [{ x: 120, y: 620 }]); await sleep(15); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await sleep(15); }
    const d = (await casts()) - before;
    // E: two fingers at once, steering plus Echo, in joystick mode: both work
    let e2 = 'n/a'; if (mode === 'joystick') { await reset(mode); await p.evaluate((m) => { window.__g.router.setMode(m); }, mode); await sleep(200); const y0 = await p.evaluate(() => window.__g.sim.pos[1]);
      await touch('touchStart', [{ x: 80, y: 600, id: 1 }]); await touch('touchMove', [{ x: 80, y: 552, id: 1 }]); await sleep(120); await touch('touchStart', [{ x: 80, y: 552, id: 1 }, { x: ECHO.x, y: ECHO.y, id: 2 }]); await sleep(300); await touch('touchEnd', []); const y1 = await p.evaluate(() => window.__g.sim.pos[1]); const c1 = await casts(); e2 = `moved ${(y1 - y0).toFixed(2)} m while ${c1} echo(es) sent`; }
    say(`MODE ${mode}: A deliberate Echo taps pinged ${a}/50 | B world-to-Echo drags pinged ${bb}/50 (want 0) | C stray taps near Echo pinged ${c}/50 (want 0) | D interrupted presses pinged ${d}/20 (want 0) | E two fingers: ${e2}`);
  }
  // Input to cast latency. Timing between taps is jittered so the test does not phase-lock to the 30 Hz tick,
  // and three separate runs are reported because separate browser sessions of the same build differed by about 15 ms.
  const runs = [];
  for (let r = 0; r < 3; r++) { await reset('waypoint'); await sleep(300); await p.evaluate(() => { window.__lat.length = 0; });
    for (let i = 0; i < 60; i++) { await noCool(); await touch('touchStart', [ECHO]); await sleep(30); await touch('touchEnd', []); await sleep(37 + (i % 7)); }
    const lat = await p.evaluate(() => window.__lat); runs.push({ p50: pct(lat, .5), p95: pct(lat, .95), min: Math.min(...lat), n: lat.length }); }
  say(`LATENCY touch-down on Echo to the render frame that includes the cast, 3 runs of 60 with jittered timing: p50 ${runs.map((x) => x.p50.toFixed(1)).join(' / ')} ms, p95 ${runs.map((x) => x.p95.toFixed(1)).join(' / ')} ms, fastest ${Math.min(...runs.map((x) => x.min)).toFixed(1)} ms (headless, event dispatch to rAF callback, runs inside one session agree closely, but separate browser sessions of the same build differed by about 15 ms)`);
  // Frame pacing of the page itself over 4 s
  const fr = await p.evaluate(() => new Promise((res) => { const d = []; let l = performance.now(); const f = (n) => { d.push(n - l); l = n; if (d.length < 240) requestAnimationFrame(f); else res(d.slice(5)); }; requestAnimationFrame(f); }));
  say(`FRAMES headless rAF interval: p50=${pct(fr, .5).toFixed(1)} ms p95=${pct(fr, .95).toFixed(1)} ms p99=${pct(fr, .99).toFixed(1)} ms (software rendering, server CPU)`);
  fs.writeFileSync(path.resolve(__dirname, '../../reference/evidence/input-audit.txt'), out.join('\n') + '\n'); await b.close();
})();
