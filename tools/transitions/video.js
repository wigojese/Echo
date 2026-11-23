'use strict';
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'reference/evidence'), base = 'file://' + path.join(root, 'reference/graybox/index.html');
(async () => { const b = await chromium.launch();
  const rec = async (name, q, script) => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: out, size: { width: 390, height: 844 } } }), p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message)); await p.goto(base + '?' + q); await script(p); const v = p.video(); await p.close(); await ctx.close(); fs.renameSync(await v.path(), path.join(out, name)); console.log('wrote', name); };
  const click = async (p, x, y) => { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); };
  await rec('tr-flow-failure.webm', 'level=l01&clean=1&title=1&replay=A', async (p) => { await p.waitForTimeout(1500); await click(p, 195, 718); await p.waitForTimeout(24500); await p.waitForTimeout(1800); await click(p, 108, 798); await p.waitForTimeout(2600); });
  await rec('tr-flow-success.webm', 'level=l01&clean=1&title=1&replay=B', async (p) => { await p.waitForTimeout(1200); await click(p, 195, 718); await p.waitForTimeout(31500); await p.waitForTimeout(3200); });
  await b.close(); })();
