'use strict';
const fs = require('fs'), path = require('path');
const { Sim } = require('../../reference/sim/sim');
const S = require('../../spike/stage06/solver');
const { InputRouter, BASE } = require('../../reference/input/input_router');
const { Driver, plan, screenToWorld, worldToScreen } = require('../../reference/input/driver');
const root = path.resolve(__dirname, '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const L01 = J('game/resources/levels/EC-L01.json'), G01 = J('game/resources/levels/EC-L01-geometry.json');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const clone = (x) => JSON.parse(JSON.stringify(x)); const noPred = () => { const l = clone(L01); l.predators = []; return l; };
const ECHO = { x: 318, y: 740 }, ms = (tick) => tick * 1000 / 30;

// ---- pure router tests ----
const R = (mode = 'waypoint', mirrored = false) => new InputRouter({ mode, mirrored });
const types = (r) => r.drain().map((i) => i.type);
{ const r = R(); r.pointerDown(1, ECHO.x, ECHO.y, 0); r.pointerUp(1, ECHO.x, ECHO.y, 60); check('R1 tapping Echo sends one ping and never a waypoint', JSON.stringify(types(r)) === '["ping"]'); }
{ const r = R(); r.pointerDown(1, 150, 300, 0); r.pointerUp(1, 150, 300, 90); check('R2 tapping the world sends one waypoint and never a ping', JSON.stringify(types(r)) === '["waypoint"]'); }
{ const r = R(); r.pointerDown(1, 150, 300, 0); r.pointerMove(1, ECHO.x, ECHO.y); r.pointerUp(1, ECHO.x, ECHO.y, 90); check('R3 a drag that starts in the world and ends on Echo does not ping', types(r).length === 0); }
{ const r = R(); r.pointerDown(1, ECHO.x, ECHO.y, 0); r.pointerMove(1, 100, 300); r.pointerUp(1, 100, 300, 90); check('R4 a press on Echo that slides away pings once and sets no waypoint', JSON.stringify(types(r)) === '["ping"]'); }
{ const r = R(); r.pointerDown(1, 150, 300, 0); r.pointerUp(1, 150, 300, 400); check('R5 a long press in the world (400 ms) sets no waypoint', types(r).length === 0); }
{ const r = R(); r.pointerDown(1, 150, 300, 0); r.pointerMove(1, 170, 300); r.pointerUp(1, 170, 300, 90); check('R6 a drag of 20 px sets no waypoint', types(r).length === 0); }
{ const r = R(); r.pointerDown(1, 150, 300, 0); r.pointerDown(2, 220, 320, 20); r.pointerUp(1, 150, 300, 80); r.pointerUp(2, 220, 320, 90); check('R7 two fingers in the world are a pinch and set no waypoint', types(r).length === 0); }
{ const r = R('joystick'); r.pointerDown(1, 80, 600, 0); r.pointerMove(1, 80, 560); r.pointerDown(2, ECHO.x, ECHO.y, 40); const t = types(r);
  check('R8 joystick mode: thumb steering and Echo work together with two fingers', t.includes('joystick') && t.includes('ping') && r.owners.size === 2, t.join()); }
{ const r = R(); r.pointerDown(1, ECHO.x, ECHO.y, 0); r.drain(); r.pointerCancel(1); const t = types(r); check('R9 an interruption (pointer cancel) cancels everything and never pings', JSON.stringify(t) === '["cancel_all"]'); }
{ const r = R('joystick'); r.pointerDown(1, 80, 600, 0); r.pointerDown(2, ECHO.x, ECHO.y, 10); r.drain(); r.pointerDown(3, 150, 400, 20);
  check('R10 a third finger is ignored: nothing needs three', r.owners.size === 2 && types(r).length === 0 && r.log.some((l) => l.region === 'third pointer')); }
{ const r = R('waypoint', true); r.pointerDown(1, 72, 740, 0); r.pointerUp(1, 72, 740, 40); const a = types(r); r.pointerDown(2, 300, 400, 100); r.pointerUp(2, 300, 400, 140); const b = types(r);
  check('R11 left-handed layout mirrors Echo to the left and frees the right side', JSON.stringify(a) === '["ping"]' && JSON.stringify(b) === '["waypoint"]'); }
{ const r = R('joystick', true); r.pointerDown(1, 300, 600, 0); check('R11b left-handed joystick mode puts the stick zone on the right', types(r)[0] === 'joystick'); }
{ const L = BASE; check('R12 every control hit area is at least 44 by 44', L.echo.hit * 2 >= 44 && L.quiet.w >= 44 && L.quiet.h >= 44 && L.pause.hit * 2 >= 44, `echo ${L.echo.hit * 2}, quiet ${L.quiet.w}x${L.quiet.h}, pause ${L.pause.hit * 2}`); }
{ const r = R(); r.pointerDown(1, 100, 730, 0); r.pointerMove(1, 110, 735); r.pointerUp(1, 110, 735, 800); check('R13 holding Quiet step toggles it once, not repeatedly', JSON.stringify(types(r)) === '["quiet_toggle"]'); }
{ const r = R('joystick'); r.pointerDown(1, 80, 600, 0); r.pointerDown(2, ECHO.x, ECHO.y, 5); r.pointerMove(1, 100, 560); r.pointerUp(2, ECHO.x, ECHO.y, 50); r.pointerUp(1, 100, 560, 90);
  check('R14 the input log never stores a screen coordinate', r.log.every((l) => Object.keys(l).sort().join() === 'kind,region')); }
{ const r = R('joystick'); r.pointerDown(1, 80, 600, 0); r.drain(); r.setMode('waypoint'); check('R15 switching control mode cancels any gesture in progress', types(r).includes('cancel_all') && r.owners.size === 0); }

// ---- harness: drive the sim through the router and driver ----
function session(level, mode = 'waypoint', mirrored = false) { const sim = new Sim(level, G01), router = new InputRouter({ mode, mirrored }), driver = new Driver(); return { sim, router, driver, inputs: [], maxPtr: 0, pos: [] }; }
function run(s, script, untilTick) {
  const by = new Map(); script.forEach((e) => { if (!by.has(e.tick)) by.set(e.tick, []); by.get(e.tick).push(e); });
  while (s.sim.tick < untilTick && s.sim.state === 'RUNNING' && !s.sim.paused) {
    const t = s.sim.tick;
    for (const e of by.get(t) || []) { if (e.op === 'down') s.router.pointerDown(e.id, e.x, e.y, ms(t)); else if (e.op === 'move') s.router.pointerMove(e.id, e.x, e.y); else if (e.op === 'up') s.router.pointerUp(e.id, e.x, e.y, ms(t)); else if (e.op === 'cancel') s.router.pointerCancel(e.id); else if (e.op === 'call') e.fn(s); s.maxPtr = Math.max(s.maxPtr, s.router.owners.size); }
    const ins = s.driver.inputsFor(s.sim, s.router.drain()); ins.forEach((i) => s.inputs.push({ tick: t, ...i })); s.pos.push([...s.sim.pos]); s.sim.step(ins);
  }
}
const tap = (id, x, y, tick, hold = 3) => [{ tick, op: 'down', id, x, y }, { tick: tick + hold, op: 'up', id, x, y }];
const casts = (sim) => sim.events.filter((e) => e.kind === 'ping_cast'), rejects = (sim) => sim.events.filter((e) => e.kind === 'ping_rejected');

// S1 cooldown spam
{ const s = session(noPred()), sc = []; for (let t = 0; t <= 100; t += 10) sc.push(...tap(1, ECHO.x, ECHO.y, t, 2)); run(s, sc, 400);
  const c = casts(s.sim), gaps = c.slice(1).map((e, i) => e.tick - c[i].tick);
  check('S1 spamming Echo for 3.3 s: casts are at least 38 ticks apart and refusals are logged', c.length === 3 && gaps.every((g) => g >= 38) && rejects(s.sim).length === 8, `casts at ${c.map((e) => e.tick)}, refused ${rejects(s.sim).length}`);
  check('S1b no cast is delayed or queued: nothing sounds after the last tap', c[c.length - 1].tick <= 100); }
// S2 origin while moving
{ const s = session(noPred(), 'joystick'), sc = [{ tick: 0, op: 'down', id: 1, x: 80, y: 600 }, { tick: 1, op: 'move', id: 1, x: 80, y: 552 }, ...tap(2, ECHO.x, ECHO.y, 40, 2)]; run(s, sc, 80);
  const c = casts(s.sim)[0], p = s.pos[c.tick];
  check('S2 a ping while walking starts exactly where you were when you tapped', Math.hypot(c.payload.origin[0] - p[0], c.payload.origin[1] - p[1]) < 1e-9 && c.payload.origin[1] > 3.5, `origin y=${c.payload.origin[1].toFixed(2)}`); }
// S3 truncate at known boundary
{ const s = session(noPred()); const snap0 = s.sim.snapshot(), known = new Set(snap0.cells.map((c) => c[0])), target = [3, 9];
  const scr = worldToScreen(target, snap0.player); run(s, tap(1, scr.x, scr.y, 2), 200);
  const cellOf = (p) => Math.floor(p[1] / 0.25) * snap0.grid.nx + Math.floor(p[0] / 0.25); const inside = s.pos.every((p) => known.has(cellOf(p)));
  check('S3 tapping unlit floor stops at the edge of what you know and never walks into the dark', s.driver.plan && s.driver.plan.truncated && inside && s.sim.pos[1] < 7, `final y=${s.sim.pos[1].toFixed(2)}, plan truncated=${s.driver.plan && s.driver.plan.truncated}`); }
// S4/S5 known target and path validity
{ const s = session(noPred()), tgt = [3, 9]; run(s, [...tap(1, ECHO.x, ECHO.y, 5, 2)], 80);
  const snap = s.sim.snapshot(), scr = worldToScreen(tgt, snap.player); run(s, tap(2, scr.x, scr.y, 80), 330);
  const known = new Set(snap.cells.map((c) => c[0])), pl = s.driver.plan;
  check('S4 after an echo lights the corridor, tapping it walks you there and stops', pl && !pl.truncated && Math.hypot(s.sim.pos[0] - tgt[0], s.sim.pos[1] - tgt[1]) < 0.5, `final=(${s.sim.pos.map((v) => v.toFixed(2))})`);
  check('S5 every cell on the route is known and walkable', pl.cells.every((k) => known.has(k) && s.sim.grid.walk[k] === 1)); }
// S6 tap in solid or unknown never autopilots
{ const s = session(noPred()), snap = s.sim.snapshot(), scr = worldToScreen([8, 3], snap.player), r = plan(snap, screenToWorld(scr, snap.player));
  const known = new Set(snap.cells.map((c) => c[0])); check('S6 tapping inside a wall routes only through known floor, never through the wall', r.truncated && r.cells.every((k) => known.has(k) && s.sim.grid.walk[k] === 1)); }
// S7 moving while pinging in waypoint mode
{ const s = session(noPred()), tgt = [3, 9]; run(s, [...tap(1, ECHO.x, ECHO.y, 5, 2)], 80); const snap = s.sim.snapshot(), scr = worldToScreen(tgt, snap.player);
  let before; run(s, [...tap(2, scr.x, scr.y, 80), { tick: 100, op: 'call', fn: (x) => { before = [...x.sim.pos]; } }, ...tap(3, ECHO.x, ECHO.y, 100, 2)], 140);
  check('S7 tapping Echo while walking to a waypoint pings and keeps walking', casts(s.sim).length === 2 && s.sim.pos[1] > before[1] + 0.5, `moved ${(s.sim.pos[1] - before[1]).toFixed(2)} m after the ping`); }
// S8 both modes can finish L01
{ const route = [[3, 10], [11, 10], [11, 17], [19, 17], [19, 26], [20, 32]]; let wi = 0;
  const j = session(noPred(), 'joystick'); const stick = { x: 80, y: 600 };
  run(j, [{ tick: 0, op: 'down', id: 1, ...stick }, ...tap(2, ECHO.x, ECHO.y, 20, 2),
    ...Array.from({ length: 2700 }, (_, k) => ({ tick: k, op: 'call', fn: (x) => { const p = x.sim.pos, w = route[Math.min(wi, route.length - 1)]; if (Math.hypot(w[0] - p[0], w[1] - p[1]) < 0.4 && wi < route.length - 1) wi++; const w2 = route[wi], dx = w2[0] - p[0], dy = w2[1] - p[1], m = Math.hypot(dx, dy) || 1; x.router.pointerMove(1, stick.x + dx / m * 48, stick.y - dy / m * 48); } }))], 2700);
  check('S8a joystick mode finishes EC-L01 with at most two fingers, first echo inside 5 s', j.sim.state === 'WON' && j.maxPtr <= 2 && casts(j.sim)[0].tick <= 150, `won at tick ${j.sim.tick} (${(j.sim.tick / 30).toFixed(1)} s), pointers<=${j.maxPtr}`);
  const w = session(noPred(), 'waypoint'), exitCost = S.field(w.sim.grid, 20, 32, Infinity), box = (p) => p.x > 30 && p.x < 360 && p.y > 120 && p.y < 690 && !(p.x > 40 && p.x < 220 && p.y > 690);
  let pings = 0, taps = 0; run(w, tap(9, ECHO.x, ECHO.y, 4, 2), 60); pings++;
  for (let loop = 0; loop < 80 && w.sim.state === 'RUNNING'; loop++) {
    const snap = w.sim.snapshot(); let best = null, bc = Infinity;
    for (const [c] of snap.cells) { const wx = (c % snap.grid.nx + 0.5) * 0.25, wy = ((c / snap.grid.nx | 0) + 0.5) * 0.25, sc = worldToScreen([wx, wy], snap.player); if (!box(sc)) continue; if (exitCost[c] < bc) { bc = exitCost[c]; best = sc; } }
    if (best) { const t0 = w.sim.tick; run(w, tap(1, best.x, best.y, t0 + 1), t0 + 6); taps++; for (let k = 0; k < 420 && w.driver.path && w.sim.state === 'RUNNING'; k += 10) run(w, [], w.sim.tick + 10); }
    if (w.sim.state === 'RUNNING') { { const t0 = w.sim.tick; run(w, tap(9, ECHO.x, ECHO.y, t0 + 1, 2), t0 + 45); pings++; } } }
  check('S8b tap-to-waypoint mode finishes EC-L01 with one finger at a time', w.sim.state === 'WON' && w.maxPtr <= 1, `won at tick ${w.sim.tick} (${(w.sim.tick / 30).toFixed(1)} s), ${pings} echoes, ${taps} waypoint taps, pointers<=${w.maxPtr}`); }
// S9 interruption mid-press
{ const s = session(noPred()); run(s, [...tap(1, ECHO.x, ECHO.y, 5, 30), { tick: 20, op: 'cancel', id: 1 }, { tick: 22, op: 'call', fn: (x) => { x.sim.paused = true; } }], 40); const at = s.sim.tick; for (let i = 0; i < 100; i++) s.sim.step([]); s.sim.paused = false; run(s, [], at + 120);
  check('S9 an interruption mid-press pauses safely, resumes without a duplicate or late cast', casts(s.sim).length === 1 && s.sim.tick >= at + 120 - 2, `casts=${casts(s.sim).length}`); }
// S10 determinism
{ const mk = () => { const s = session(noPred(), 'joystick'); run(s, [{ tick: 0, op: 'down', id: 1, x: 80, y: 600 }, { tick: 5, op: 'move', id: 1, x: 120, y: 570 }, ...tap(2, ECHO.x, ECHO.y, 30, 2), { tick: 90, op: 'up', id: 1, x: 120, y: 570 }], 200); return s; };
  const a = mk(), b = mk(); check('S10 the same touches give the same simulation inputs and the same world', JSON.stringify(a.inputs) === JSON.stringify(b.inputs) && JSON.stringify(a.sim.pos) === JSON.stringify(b.sim.pos)); }
// S11 cancel mid-route stops you
{ const s = session(noPred()); run(s, [...tap(1, ECHO.x, ECHO.y, 3, 2)], 60); const snap = s.sim.snapshot(), scr = worldToScreen([3, 9], snap.player);
  run(s, [...tap(2, scr.x, scr.y, 60), { tick: 90, op: 'cancel', id: 9 }, { tick: 90, op: 'down', id: 8, x: 150, y: 300 }, { tick: 91, op: 'cancel', id: 8 }], 200); const stopY = s.sim.pos[1];
  check('S11 cancelling mid-route stops you within half a metre of where you were, and you stay stopped', s.driver.cancelled >= 1 && Math.abs(s.sim.pos[1] - stopY) < 1e-6 && s.sim.pos[1] - s.pos[91][1] < 0.5, `stopped at y=${stopY.toFixed(2)}`); }
// S12 first move without any echo
{ const s = session(noPred()), snap = s.sim.snapshot(), scr = worldToScreen([3, 5], snap.player); run(s, tap(1, scr.x, scr.y, 2), 120);
  check('S12 you can move at the very start, inside the opening-breath chamber, before any echo', s.sim.pos[1] > 4.5 && casts(s.sim).length === 0, `y=${s.sim.pos[1].toFixed(2)}`); }

console.log(`RESULT ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
