'use strict';
// Screenshots of the Stage 13 failure sheet: before Reveal (sentence and lesson) and after (cause chain), for each stored sample on EC-L01.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'reference/evidence/predator'), base = 'file://' + path.join(root, 'reference/graybox/index.html');
(async () => { const b = await chromium.launch(); const jobs = [['STAYED_NEAR_ORIGIN', 'suspense'], ['FOUND_ON_ROUTE', 'suspense'], ['WALKED_INTO_VIEW', 'suspense']];
  for (const [rule, profile] of jobs) { const replay = JSON.parse(fs.readFileSync(path.join(root, `reference/replays/stage13/${rule}.json`), 'utf8'));
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.on('pageerror', (e) => console.log('ERR', rule, e.message));
    await p.goto(base + `?level=l01&clean=1&profile=${profile}`); await p.waitForFunction(() => window.__g);
    await p.evaluate((r) => { window.__g.load('l01'); window.__g.playReplay(r, 99999); window.__g.watch(); }, replay);
    for (let i = 0; i < 40; i++) await p.evaluate(() => window.__g.camTick(50, 16.7));
    await p.evaluate(() => window.__g.render()); await p.screenshot({ path: path.join(out, `failure_${rule}_before.png`) });
    await p.evaluate(() => window.__g.TR.reveal()); for (let i = 0; i < 70; i++) await p.evaluate(() => window.__g.camTick(40, 16.7));
    await p.evaluate(() => window.__g.render()); await p.screenshot({ path: path.join(out, `failure_${rule}_after.png`) }); await p.close(); console.log('wrote', rule); }
  await b.close(); })();
