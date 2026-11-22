'use strict';
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const base = 'file://' + path.resolve(__dirname, '../../reference/graybox/index.html'), out = path.resolve(__dirname, '../../reference/evidence');
(async () => { const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  p.on('pageerror', (e) => console.log('ERR', e.message)); const snap = async (n) => { await p.waitForTimeout(60); await p.locator('canvas').screenshot({ path: path.join(out, n + '.png') }); console.log('wrote', n); };
  // tap to waypoint: ping, then tap past the lit area to show the dotted incomplete route
  await p.goto(base + '?level=l01&mode=waypoint'); await p.waitForTimeout(250);
  await p.evaluate(() => { const g = window.__g, r = g.router; g.freeze(true); g.load('l01'); g.tick(2); r.pointerDown(1, 318, 740, 0); r.pointerUp(1, 318, 740, 40); g.tick(70); r.pointerDown(2, 195, 170, 100); r.pointerUp(2, 195, 170, 170); g.tick(40); });
  await snap('input-waypoint-mode');
  // joystick: hold the stick with the left thumb
  await p.goto(base + '?level=l01&mode=joystick'); await p.waitForTimeout(250);
  await p.evaluate(() => { window.__g.freeze(true); window.__g.load('l01'); });
  await p.mouse.move(80, 600); await p.mouse.down(); await p.mouse.move(110, 560); await p.evaluate(() => { window.__g.tick(50); }); await snap('input-joystick-mode'); await p.mouse.up();
  // left-handed joystick layout
  await p.goto(base + '?level=l01&mode=joystick&hand=left'); await p.waitForTimeout(250);
  await p.evaluate(() => { window.__g.freeze(true); window.__g.load('l01'); });
  await p.mouse.move(310, 600); await p.mouse.down(); await p.mouse.move(280, 560); await p.evaluate(() => { window.__g.tick(50); }); await snap('input-joystick-left-handed'); await p.mouse.up();
  await b.close(); })();
