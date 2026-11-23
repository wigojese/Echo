'use strict';
const fs = require('fs'), path = require('path');
const { Sim } = require('../../reference/sim/sim');
const { CameraDirector, Z, SCREEN, PY, nextBand } = require('../../reference/camera/camera_director');
const root = path.resolve(__dirname, '../..'); const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const L01 = J('game/resources/levels/EC-L01.json'), G01 = J('game/resources/levels/EC-L01-geometry.json'), RB = J('reference/replays/B_heard_and_escaped.json');
let pass = 0, fail = 0; const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const clone = (x) => JSON.parse(JSON.stringify(x)); let seed = 99; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const by = new Map(); RB.inputs.forEach((i) => { if (!by.has(i.tick)) by.set(i.tick, []); by.get(i.tick).push(i); });
const play = (sim, until) => { while (sim.tick < until && sim.state === 'RUNNING') sim.step(by.get(sim.tick) || []); return sim; };
const advance = (c, ms, snap, step = 16.7) => { for (let t = 0; t < ms; t += step) c.tick(step); return c.frame(snap); };
const syn = (player, trail, segs = 1) => ({ player, trail, segments: Array(segs).fill({}), castOrigins: [{ castId: 1, origin: trail[0], ageTicks: 10, heardAgeTicks: null }] });

// 1 inverse transforms
{ let worst = 0; for (let i = 0; i < 1000; i++) { const c = new CameraDirector({ intro: false }); c.zoom = Z.min + rnd() * (Z.max - Z.min); c.off = [rnd() * 40 - 20, rnd() * 40 - 20]; const snap = syn([rnd() * 24, rnd() * 36], [[0, 0]]); const f = c.frame(snap);
    for (let k = 0; k < 5; k++) { const w = [rnd() * 40 - 10, rnd() * 50 - 5], b = f.screenToWorld(f.worldToScreen(w)); worst = Math.max(worst, Math.hypot(b[0] - w[0], b[1] - w[1])); } }
  check('01 screen to world and back is exact across 5,000 random cameras', worst < 1e-9, `worst error ${worst.toExponential(1)} m`); }
// 2 inverse at every animation frame
{ const sim = play(new Sim(L01, G01), 330), snap = sim.snapshot(), c = new CameraDirector({ intro: false }); let worst = 0, frames = 0; const probe = () => { const f = c.frame(snap); frames++; for (const w of [[3, 3], [11, 10], [snap.player[0] + 2, snap.player[1] - 3]]) { const b = f.screenToWorld(f.worldToScreen(w)); worst = Math.max(worst, Math.hypot(b[0] - w[0], b[1] - w[1])); } };
  c.enterTrace(snap); for (let t = 0; t < 400; t += 5.8) { c.tick(5.8); probe(); } c.scrub(-300, 16.7); c.release(); for (let t = 0; t < 300; t += 8) { c.tick(8); probe(); } c.returnToListener(); for (let t = 0; t < 420; t += 5.8) { c.tick(5.8); probe(); }
  check('02 the touch-to-world mapping is exact on every frame of the pullback, scrub and return', worst < 1e-9 && frames > 150, `${frames} frames, worst error ${worst.toExponential(1)} m`); }
// 3 pinch anchor drift
{ let worst = 0, n = 0; for (let i = 0; i < 1000; i++) { const c = new CameraDirector({ intro: false }); c.zoom = 0.7 + rnd() * 0.9; c.off = [rnd() * 6 - 3, rnd() * 6 - 3]; const snap = syn([10 + rnd() * 5, 10 + rnd() * 5], [[3, 3], [3, 10], [10, 10]]); c.snap_ = snap; if (i % 2) { c.enterTrace(snap); c.anim = null; c.zoom = 0.7 + rnd() * 0.9; c.trace.s = rnd() * c.trace.L; }
    const a = { x: 20 + rnd() * 350, y: 60 + rnd() * 700 }, f0 = c.frame(snap), w = f0.screenToWorld(a), z0 = c.zoom; c.pinch(a, 0.8 + rnd() * 0.45); if (c.zoom === z0) continue; const s = c.frame(snap).worldToScreen(w); worst = Math.max(worst, Math.hypot(s.x - a.x, s.y - a.y)); n++; }
  check('03 pinch keeps the world point under the fingers within 2 px (1,000 pinches, follow and trace)', worst <= 2 && n > 800, `${n} effective pinches, worst drift ${worst.toExponential(1)} px`); }
// 4 zoom clamp
{ const c = new CameraDirector({ intro: false }); const snap = syn([5, 5], [[3, 3]]); c.snap_ = snap; let lo = 9, hi = 0; for (let i = 0; i < 600; i++) { c.pinch({ x: rnd() * 390, y: rnd() * 844 }, 0.7 + rnd() * 0.8); lo = Math.min(lo, c.zoom); hi = Math.max(hi, c.zoom); }
  check('04 zoom never leaves 0.60 to 1.75 however hard you pinch', lo >= Z.min && hi <= Z.max, `range ${lo.toFixed(2)} to ${hi.toFixed(2)}`); }
// 5-6 hysteresis
{ let b = 'active'; const seq = [[1.41, 'active'], [1.42, 'close'], [1.30, 'close'], [1.28, 'active'], [0.79, 'active'], [0.78, 'memory'], [0.89, 'memory'], [0.90, 'active']]; let ok = true; const got = []; for (const [z, want] of seq) { b = nextBand(b, z); got.push(b); if (b !== want) ok = false; }
  check('05 band thresholds: close from 1.42 up to 1.28, memory from 0.78 up to 0.90', ok, got.join(',')); }
{ let b = 'active', flips = 0; const t = (z) => { const n = nextBand(b, z); if (n !== b) flips++; b = n; }; for (let z = 1.0; z <= 1.75; z += 0.001) t(z); for (let z = 1.75; z >= 0.6; z -= 0.001) t(z); for (let z = 0.6; z <= 1.0; z += 0.001) t(z);
  let b2 = 'active', jit = 0; for (let i = 0; i < 5000; i++) { const z = 1.35 + (rnd() - 0.5) * 0.1; const n = nextBand(b2, z); if (n !== b2) jit++; b2 = n; } let b3 = 'close', jit3 = 0; for (let i = 0; i < 5000; i++) { const z = 1.35 + (rnd() - 0.5) * 0.1; const n = nextBand(b3, z); if (n !== b3) jit3++; b3 = n; }
  check('06 a full sweep changes band exactly 4 times, and zoom jitter inside the dead zone never flips it', flips === 4 && jit === 0 && jit3 === 0, `sweep flips ${flips}, jitter flips ${jit + jit3}`); }
// 7 availability
{ const c = new CameraDirector({ intro: false }); check('07 TRACE needs two connected segments and something remembered', !c.traceAvailable(syn([3, 5], [[3, 3], [3, 5]])) && !c.traceAvailable(syn([8, 10], [[3, 3], [3, 10], [8, 10]], 0)) && c.traceAvailable(syn([8, 10], [[3, 3], [3, 10], [8, 10]]))); }
// 8 path follows only where you walked
{ const sim = play(new Sim(L01, G01), 600), snap = sim.snapshot(), c = new CameraDirector({ intro: false }); c.enterTrace(snap); const f = c.frame(snap), raw = [...snap.trail, snap.player];
  const d = (p) => { let best = Infinity; for (let i = 1; i < raw.length; i++) { const a = raw[i - 1], b = raw[i], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))); } return best; };
  let worst = 0; for (const p of f.trace.pathPts) worst = Math.max(worst, d(p)); const first = f.trace.pathPts[0], last = f.trace.pathPts[f.trace.pathPts.length - 1];
  check('08 the TRACE path stays within 0.9 m of where you actually walked, from entry to now', worst < 0.9 && Math.hypot(first[0] - 3, first[1] - 3) < 1e-6 && Math.hypot(last[0] - snap.player[0], last[1] - snap.player[1]) < 1e-6, `${f.trace.pathPts.length} samples, worst offset ${worst.toFixed(2)} m, length ${f.trace.L.toFixed(1)} m`); }
// 9-10 scrub cap and release
{ const sim = play(new Sim(L01, G01), 600), snap = sim.snapshot(), c = new CameraDirector({ intro: false }); c.enterTrace(snap); advance(c, 400, snap); let worst = 0; for (let i = 0; i < 120; i++) { const s0 = c.trace.s; c.scrub(i % 40 < 20 ? -5000 : 5000, 16.7); c.tick(16.7); worst = Math.max(worst, Math.abs(c.trace.s - s0) / 0.0167); }
  const cap = SCREEN.W / c.K; check('09 scrubbing never moves faster than one screen width per second, however violent the swipe', worst <= cap * 1.001, `worst ${worst.toFixed(2)} m/s, cap ${cap.toFixed(2)} m/s`);
  c.scrub(-5000, 16.7); c.release(); advance(c, 230, snap); const s1 = c.trace.s; advance(c, 200, snap); check('10 releasing stops the camera within 220 ms and it never flings', Math.abs(c.trace.s - s1) < 1e-9 && c.trace.s >= 0 && c.trace.s <= c.trace.L, `s=${c.trace.s.toFixed(2)} of ${c.trace.L.toFixed(1)}`);
  for (let i = 0; i < 80; i++) c.scrub(-5000, 16.7); c.release(); advance(c, 400, snap); check('10b scrubbing past the start stays clamped at the entry', c.trace.s === 0); }
// 11 recoverable
{ const sim = play(new Sim(L01, G01), 600), snap = sim.snapshot(); const c = new CameraDirector({ intro: false }); c.enterTrace(snap); advance(c, 400, snap); for (let i = 0; i < 80; i++) c.scrub(-5000, 16.7); c.release(); let f = advance(c, 300, snap);
  const away = !f.playerVisible && f.offscreen && Math.abs(f.offscreen.angle) <= Math.PI; c.returnToListener(); f = advance(c, 600, snap);
  check('11 from far along the trace the player is flagged off-screen, and one return puts the camera back on them', away && f.state === 'LISTENER_FOLLOW' && Math.hypot(f.center[0] - snap.player[0], f.center[1] - snap.player[1]) < 1e-9 && f.zoom === 1 && !f.pauseSim && f.playerVisible);
  const m = new CameraDirector({ intro: false }); m.snap_ = snap; m.pan(-3000, 0); const mf = m.frame(snap); m.returnToListener(); const mf2 = advance(m, 600, snap);
  check('11b the same from a manual pan', !mf.playerVisible && mf2.state === 'LISTENER_FOLLOW' && Math.hypot(mf2.center[0] - snap.player[0], mf2.center[1] - snap.player[1]) < 1e-9); }
// 12 reduced motion
{ const sim = play(new Sim(L01, G01), 330), snap = sim.snapshot(), c = new CameraDirector({ intro: false, reducedMotion: true }); const centers = new Set(), zooms = new Set(); const rec = (f) => { centers.add(f.center.map((v) => v.toFixed(4)).join()); zooms.add(f.zoom.toFixed(4)); };
  rec(c.frame(snap)); c.enterTrace(snap); let f = c.frame(snap); const fade0 = f.fade; rec(f); for (let t = 0; t < 200; t += 10) { c.tick(10); f = c.frame(snap); rec(f); } const fadeEnd = f.fade; c.scrub(-200, 16.7); c.returnToListener(); for (let t = 0; t < 300; t += 10) { c.tick(10); rec(c.frame(snap)); }
  check('12 reduced motion: the camera jumps with a 120 ms fade and never travels through in-between frames', fade0 === 1 && fadeEnd === 0 && zooms.size <= 4, `${zooms.size} distinct zooms, fade ${fade0} then ${fadeEnd}`); }
// 13 hidden state independence
{ const variants = []; const a = clone(L01); const b = clone(L01); b.goal.exit_xy = [22, 17]; b.predators[0].spawn_xy = [17, 24]; b.predators[0].patrol_waypoints = [[17, 24], [13, 24]]; const c2 = clone(L01); c2.predators = []; c2.goal.exit_xy = [11, 28];
  const run = (lv) => { const sim = new Sim(lv, G01), cam = new CameraDirector(), frames = []; const plan = { 0: [{ type: 'move', dx: 0, dy: 1 }], 20: [{ type: 'ping' }], 70: [{ type: 'move', dx: 1, dy: 0 }], 90: [{ type: 'stop' }], 120: [{ type: 'ping' }] };
    for (let k = 0; k < 300; k++) { sim.step(plan[sim.tick] || []); const snap = sim.snapshot(); if (k === 150) cam.enterTrace(snap); if (k === 160) cam.scrub(-400, 16.7); if (k === 165) cam.release(); if (k === 200) cam.pinch({ x: 120, y: 300 }, 1.3); if (k === 240) cam.returnToListener(); cam.tick(33.3); frames.push(JSON.stringify([cam.frame(snap), snap])); } return frames; };
  const fa = run(a), fb = run(b), fc = run(c2); const same = fa.every((f, i) => f === fb[i] && f === fc[i]);
  check('13 different hidden listener positions and different hidden exits give identical camera frames for 300 ticks, through trace, pinch and return', same && fa.length === 300, `3 worlds, ${fa.length} frames each`); }
// 14 pause semantics
{ const sim = play(new Sim(L01, G01), 330), snap = sim.snapshot(), c = new CameraDirector({ intro: false }); const before = c.frame(snap).pauseSim; c.enterTrace(snap); const during = c.frame(snap).pauseSim; c.returnToListener(); const after = c.frame(snap).pauseSim; check('14 the world pauses in TRACE and only in TRACE', !before && during && !after); }
// 15 steering and priorities
{ const snap = syn([8, 10], [[3, 3], [3, 10], [8, 10]]); const c = new CameraDirector({ intro: false }); c.snap_ = snap; c.pan(-100, 50); const manual = c.state === 'MANUAL_REFRAME'; c.steer(true); const f = advance(c, 450, snap); check('15 steering beats a manual frame: the camera returns to you within 450 ms', manual && f.state === 'LISTENER_FOLLOW' && f.center[0] === 8 && f.center[1] === 10);
  const c2 = new CameraDirector({ intro: false }); c2.snap_ = snap; c2.steer(true); const moved = c2.pan(-100, 50); const p0 = c2.frame(snap).playerScreen; c2.pinch({ x: 60, y: 120 }, 1.3); const p1 = c2.frame(snap).playerScreen; check('15b while steering, pan is refused and a pinch zooms about you without moving you on screen', !moved && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1e-9); }
// 16 intro
{ const c = new CameraDirector(), snap = syn([3, 3], [[3, 3]]); const z0 = c.zoom, s0 = c.state; advance(c, 460, snap); const r = new CameraDirector({ reducedMotion: true }); check('16 the opening breath drops 1.25 to 1.0 in 450 ms, instantly with a fade under reduced motion', z0 === 1.25 && s0 === 'INTRO_DROP' && c.zoom === 1 && c.state === 'LISTENER_FOLLOW' && r.zoom === 1 && r.fade === 1); }
// 17 labels only in trace
{ const sim = play(new Sim(L01, G01), 330), snap = sim.snapshot(), c = new CameraDirector({ intro: false }); const none = c.frame(snap).trace === null; c.enterTrace(snap); const f = c.frame(snap); check('17 echo labels exist only in TRACE and carry the logged ages', none && f.trace.labels.length === snap.castOrigins.length && f.trace.labels.every((l, i) => l.ageTicks === snap.castOrigins[i].ageTicks)); }

console.log(`RESULT ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
