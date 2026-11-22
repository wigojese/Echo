'use strict';
// Renders the Stage 08 evidence images from the graybox (browser build of the reference sim).
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'reference/evidence'); fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(root, 'reference/graybox/index.html');
const RA = JSON.parse(fs.readFileSync(path.join(root, 'reference/replays/A_heard_and_caught.json'), 'utf8')), RB = JSON.parse(fs.readFileSync(path.join(root, 'reference/replays/B_heard_and_escaped.json'), 'utf8'));
(async () => { const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('ERR', e.message)); const shot = async (n) => { await p.waitForTimeout(80); await p.locator('canvas').screenshot({ path: path.join(out, n + '.png') }); console.log('wrote', n); };
  // sealed wall test: honest view and developer view of the same moment
  await p.goto(url + '?level=sealed'); await p.waitForTimeout(300);
  await p.evaluate(() => { const g = window.__g; g.freeze(true); g.load('sealed'); g.setDebug(false); g.step(60, { 3: [{ type: 'ping' }] }); }); await shot('sealed-wall-player-view');
  await p.evaluate(() => { window.__g.setDebug(true); window.__g.render(); }); await shot('sealed-wall-developer-view');
  // field debug image on L01
  await p.goto(url + '?level=l01&debug=1'); await p.waitForTimeout(300);
  await p.evaluate((ra) => { const g = window.__g; g.freeze(true); g.load('l01'); g.playReplay(ra, 520); g.render(); }, RA); await shot('field-debug-L01-fork-ping');
  // replay A: heard, then caught
  await p.goto(url + '?level=l01'); await p.waitForTimeout(300);
  await p.evaluate((ra) => { const g = window.__g; g.freeze(true); g.load('l01'); g.playReplay(ra, 545); }, RA); await shot('replayA-heard');
  await p.evaluate((ra) => window.__g.playReplay(ra, 9999), RA); await shot('replayA-captured');
  // replay B: escaped
  await p.goto(url + '?level=l01'); await p.waitForTimeout(300);
  await p.evaluate((rb) => { const g = window.__g; g.freeze(true); g.load('l01'); g.playReplay(rb, 9999); }, RB); await shot('replayB-won');
  await b.close(); })();
