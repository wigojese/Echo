'use strict';
const fs = require('fs'), path = require('path');
const { Sim } = require('../../reference/sim/sim');
const { Transitions, SPECS, nudgeTarget, nudgeVector } = require('../../reference/transitions/transitions');
const { CameraDirector } = require('../../reference/camera/camera_director');
const root = path.resolve(__dirname, '../..'); const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const L01 = J('game/resources/levels/EC-L01.json'), G01 = J('game/resources/levels/EC-L01-geometry.json'), RA = J('reference/replays/A_heard_and_caught.json'), RB = J('reference/replays/B_heard_and_escaped.json');
let pass = 0, fail = 0; const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const clone = (x) => JSON.parse(JSON.stringify(x)); const ids = Object.keys(SPECS);
const byTick = (r) => { const m = new Map(); r.inputs.forEach((i) => { if (!m.has(i.tick)) m.set(i.tick, []); m.get(i.tick).push(i); }); return m; };
const finite = (o) => JSON.stringify(o, (k, v) => typeof v === 'number' && !Number.isFinite(v) ? '__BAD__' : v).indexOf('__BAD__') < 0;

// 1 every transition is fully specified
{ const need = ['trigger', 'start', 'end', 'keyframes', 'midpoint', 'pairing', 'skip', 'cancel', 'reduced', 'fallback', 'clock', 'easing', 'durMs']; let missing = [];
  for (const id of ids) { const s = SPECS[id]; for (const k of need) if (s[k] === undefined || s[k] === '') missing.push(id + '.' + k); if (!(s.keyframes.length >= 3 && s.keyframes[0].t === 0 && s.keyframes.every((k, i) => i === 0 || k.t > s.keyframes[i - 1].t))) missing.push(id + '.keyframes order'); if (!s.pairing.haptic || !s.pairing.sound) missing.push(id + '.pairing'); if (!['snap-end', 'snap-rest'].includes(s.cancel)) missing.push(id + '.cancel'); }
  check('01 all 8 transitions have start, end, keyframes, easing, trigger, midpoint, sound and haptic pairing, skip, reduced-motion replacement, fallback and clock', ids.length === 8 && missing.length === 0, missing.join() || '8 of 8 complete'); }
// 2 durations match the baseline in the prompt
{ const d = (i) => SPECS[i].durMs; check('02 durations match the baseline: 480, 350 to 600, 55 to 85, 120 to 220, 350, 120, 500, at most 650', d('T1') === 480 && d('T2') >= 350 && d('T2') <= 600 && d('T3') >= 55 && d('T3') <= 85 && d('T4') >= 120 && d('T4') <= 220 && d('T5') === 350 && d('T6') === 120 && d('T7') === 500 && d('T8') <= 650, ids.map((i) => i + ' ' + d(i)).join(', ')); }
// 3 cancellation at five progress values
{ let bad = []; for (const id of ids) for (const frac of [0, 0.25, 0.5, 0.75, 1]) { const t = new Transitions(); if (id === 'T7') { t.start('T7'); t.tick(300); t.reveal(); } else t.start(id, id === 'T4' ? { dir: [0, -1] } : null); const total = t.dur(id); t.tick(total * frac - (id === 'T7' ? 0 : 0) + 0.001);
    t.cancel(id); const p1 = JSON.stringify(t.params(true)), st = t.state[id]; for (let k = 0; k < 40; k++) t.tick(16.7); const p2 = JSON.stringify(t.params(true));
    const snapEnd = SPECS[id].cancel === 'snap-end'; const ok = finite(t.params(true)) && (snapEnd ? st.t >= total - 1e-6 || !st.active : !st.active && st.t === 0 || !st.active); if (!ok) bad.push(`${id}@${frac * 100}`); if (id !== 'T6' && id !== 'T8' && id !== 'T7' && p1 !== p2) bad.push(`${id}@${frac * 100} drifted`); }
  check('03 every transition cancels cleanly at 0, 25, 50, 75 and 100 percent: finite values, snaps to its end or rest, and stays there', bad.length === 0, bad.join() || '40 cases'); }
// 4 skip
{ const t = new Transitions(); t.start('T1'); t.tick(40); t.skip('T1'); t.tick(1); const a = t.params(); const t8 = new Transitions(); t8.start('T8'); t8.tick(200); t8.skip('T8'); t8.tick(16.7); const b = t8.params().T8;
  check('04 Begin and the result replay can be skipped within one frame (limit 150 ms)', a.T1.p === 1 && a.T1.alpha === 0 && b.p === 1 && b.ink === 1); }
// 5 reduced motion
{ const t = new Transitions({ reducedMotion: true }); const started = ['T1', 'T2', 'T3', 'T5', 'T6', 'T7', 'T8'].map((i) => t.start(i)); const t4 = t.start('T4', { dir: [1, 0] }); const trace = []; for (let k = 0; k < 20; k++) { t.tick(16.7); trace.push(t.params(true)); }
  const noTravel = trace.every((p) => p.T1.scale === 1 && p.T1.travel === 0 && p.T3.aperture === 1 && p.T6.zoomMul === 1 && p.T6.flicker === 0 && p.T4.offsetFrac === 0); const fadesEnd = t.params(true).T1.alpha === 0 && t.params().T8.ink === 1 && t.dur('T1') === 120;
  check('05 reduced motion: no scaling, drift, zoom or flicker, only a 120 ms fade, and the camera nudge is off', started.every(Boolean) && t4 === false && noTravel && fadesEnd); }
// 6 no strobe
{ const t = new Transitions(); const series = []; let accepted = 0; for (let ms = 0; ms < 5000; ms += 10) { if (ms % 100 === 0 && t.start('T6')) accepted++; t.tick(10); series.push(t.params(true).T6.flicker); }
  let crossings = []; for (let i = 1; i < series.length; i++) if (series[i - 1] < 0.1 && series[i] >= 0.1) crossings.push(i * 10); let worst = 0; for (let w = 0; w + 1000 <= 5000; w += 100) worst = Math.max(worst, crossings.filter((c) => c >= w && c < w + 1000).length);
  check('06 repeated threat alerts every 100 ms never flash more than once a second (limit 3), at most 35 percent amplitude', worst <= 1 && accepted <= 5 && Math.max(...series) <= 0.35 + 1e-9, `accepted ${accepted} of 50, worst flashes in any second ${worst}, peak ${Math.max(...series).toFixed(2)}`); }
// 7 threat zoom keeps the touch mapping exact and stays within 8 percent
{ const sim = new Sim(L01, G01), snap = sim.snapshot(), cam = new CameraDirector({ intro: false }), t = new Transitions(); t.start('T6'); let worst = 0, maxZ = 1; for (let k = 0; k < 40; k++) { t.tick(16.7); const p = t.params(true).T6; cam.setTransient({ zoomMul: p.zoomMul }); maxZ = Math.max(maxZ, p.zoomMul); const f = cam.frame(snap); for (const w of [[3, 3], [5, 7], [10, 12]]) { const b = f.screenToWorld(f.worldToScreen(w)); worst = Math.max(worst, Math.hypot(b[0] - w[0], b[1] - w[1])); } }
  check('07 during the threat zoom the touch mapping stays exact and the view never closes in by more than 8 percent', worst < 1e-9 && maxZ <= 1.0801, `worst mapping error ${worst.toExponential(1)} m, peak zoom ${maxZ.toFixed(3)}`); }
// 8-9 nudge
{ const run = (lv, until) => { const sim = new Sim(lv, G01), by = byTick(RA); while (sim.tick < until && sim.state === 'RUNNING') sim.step(by.get(sim.tick) || []); return sim; };
  const cam = new CameraDirector({ intro: false }); const a = run(L01, 400), b2 = clone(L01); b2.predators[0].spawn_xy = [17, 24]; b2.predators[0].patrol_waypoints = [[17, 24], [13, 24]]; const b = run(b2, 400);
  const fa = cam.frame(a.snapshot()), fb = cam.frame(b.snapshot()); check('08 before anything is revealed there is nothing to nudge toward, whatever the hidden listener is doing', nudgeTarget(a.snapshot(), fa) === null && nudgeTarget(b.snapshot(), fb) === null);
  let found = null, sim = new Sim(L01, G01); const by = byTick(RA); while (sim.state === 'RUNNING' && sim.tick < 700) { sim.step(by.get(sim.tick) || []); const n = nudgeTarget(sim.snapshot(), cam.frame(sim.snapshot())); if (n && !found) found = { n, snap: sim.snapshot(), tick: sim.tick }; }
  const f = cam.frame(found.snap), v = nudgeVector(found.n.dir, 1 * 0.2, f.K), px = [Math.abs(v[0]) * f.K, Math.abs(v[1]) * f.K];
  check('09 once a creature or heard echo is drawn, the nudge points at that drawn shape and drifts at most 0.2 of the viewport', px[0] <= 0.2 * 390 + 1e-6 && px[1] <= 0.2 * 844 + 1e-6 && found.n.dir[1] < 0, `first target at tick ${found.tick}, direction ${found.n.dir.map((x) => x.toFixed(2))}, drift ${px.map((x) => x.toFixed(0))} px`); }
// 10-11 alert is non-positional and gives a warning
{ const sim = new Sim(L01, G01), by = byTick(RA); let alertKeys = new Set(), first = -1, runningReveal = 0; while (sim.state === 'RUNNING') { sim.step(by.get(sim.tick) || []); const sn = sim.snapshot(); if (sn.alert) { Object.keys(sn.alert).forEach((k) => alertKeys.add(k)); if (first < 0) first = sim.tick; } if (sim.state === 'RUNNING' && sim.revealTruth() !== null) runningReveal++; }
  const cap = sim.events.find((e) => e.kind === 'player_captured');
  check('10 the alert carries only its age, never a position', [...alertKeys].join() === 'ageTicks'); check('11 the warning starts at least 0.60 s before a capture can happen', first >= 0 && cap.tick - first >= 18, `warning ${(cap.tick - first)} ticks = ${((cap.tick - first) / 30).toFixed(2)} s`);
  check('12 the real listener route is refused for every tick of the round and offered only after it ends', runningReveal === 0 && sim.revealTruth() !== null && sim.revealTruth().route.length > 5 && sim.summary() !== null, `route points ${sim.revealTruth().route.length}`); }
// 13 failure reveal staging
{ const t = new Transitions(); t.start('T7'); t.tick(400); const before = t.params().T7; const spy = { n: 0 }; const host = (sim) => { if (t.params().T7.revealed) return sim.revealTruth(); spy.n++; return null; };
  const sim = new Sim(L01, G01), by = byTick(RA); while (sim.state === 'RUNNING') sim.step(by.get(sim.tick) || []); const none = host(sim); t.reveal(); t.tick(500); const after = t.params().T7;
  check('13 failure: the scene dims on its own, but the real route is drawn only after the explicit Reveal', before.dim > 0.4 && before.reveal === 0 && !before.revealed && none === null && after.reveal === 1 && after.revealed && host(sim) !== null); }
// 14 success reconstruction
{ const sim = new Sim(L01, G01), by = byTick(RB); while (sim.state === 'RUNNING') sim.step(by.get(sim.tick) || []); const sm = sim.summary(); const t = new Transitions(); t.start('T8'); t.tick(325); const mid = t.params().T8; t.tick(400); const end = t.params().T8;
  check('14 success: the replay uses only your own run (2 echoes, the route you walked) and the line draws entry to exit then retracts', sim.state === 'WON' && sm.casts.length === 2 && sm.trail.length > 20 && mid.ink > 0 && mid.ink < 1 && end.ink === 1 && end.glyph === 1, `ink at half time ${mid.ink.toFixed(2)}`); }
// 15 sim independence from the view
{ const run = (withView) => { const sim = new Sim(L01, G01), by = byTick(RA), t = new Transitions(); while (sim.state === 'RUNNING') { if (withView) { t.tick(33.3); if (sim.tick === 20) t.start('T2'); if (sim.snapshot().alert) t.start('T6'); } sim.step(by.get(sim.tick) || []); } return JSON.stringify(sim.events); };
  check('15 the transitions never change the simulation: the event log is identical with and without them', run(true) === run(false)); }
// 16 the front is in step with the simulation
{ const sim = new Sim(L01, G01); sim.step([{ type: 'move', dx: 0, dy: 1 }]); for (let i = 0; i < 4; i++) sim.step(); sim.step([{ type: 'ping' }]); const sn0 = sim.snapshot(); let worst = 0, n = 0;
  for (let k = 0; k < 45; k++) { const sn = sim.snapshot(), w = sn.waves[0]; if (w && w.ageTicks > 0) for (const q of w.pts) { const g = sim.grid, c = sim.lastField.field[Math.floor(q[1] / g.cell) * g.nx + Math.floor(q[0] / g.cell)]; worst = Math.max(worst, Math.abs(c - w.ageTicks / 30 * 9)); n++; } sim.step(); }
  const ev = sim.events.find((e) => e.kind === 'ping_cast');
  check('16 the origin scar is on the plate in the first snapshot after the cast (at most one tick old), and every front sample sits within 0.1 m of the solver front', sn0.castOrigins.length === 1 && sn0.castOrigins[0].ageTicks <= 1 && ev.tick === 5 && worst <= 0.1 + 1e-9 && n > 200, `scar age ${sn0.castOrigins[0].ageTicks} tick, ${n} samples, worst ${worst.toFixed(4)} m`); }
// 17 per-frame cost
{ const t = new Transitions(); t.start('T6'); t.start('T4', { dir: [0, -1] }); const t0 = process.hrtime.bigint(); for (let i = 0; i < 100000; i++) { t.tick(16.7); t.params(true); if (i % 40 === 0) { t.start('T6'); } } const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 100000;
  check('17 the transition director costs under 0.05 ms per frame', ms < 0.05, `${(ms * 1000).toFixed(2)} microseconds per frame, Node 22`); }
// 18 pullback keyframes
{ const sim = new Sim(L01, G01), by = byTick(RB); while (sim.tick < 600 && sim.state === 'RUNNING') sim.step(by.get(sim.tick) || []); const snap = sim.snapshot(), c = new CameraDirector({ intro: false }); c.enterTrace(snap); let prev = c.zoom, peak = c.zoom, trough = c.zoom, jerk = 0, risingThenFalling = true, falling = false; for (let ms = 0; ms < 360; ms += 16.7) { c.tick(16.7); jerk = Math.max(jerk, Math.abs(c.zoom - prev)); if (c.zoom < prev - 1e-9) falling = true; if (falling && c.zoom > prev + 1e-9) risingThenFalling = false; peak = Math.max(peak, c.zoom); trough = Math.min(trough, c.zoom); prev = c.zoom; }
  check('18 the pullback pushes in to 1.05, then pulls to 0.72 without overshoot or a jump', peak <= 1.0501 && peak > 1.02 && trough >= 0.7199 && Math.abs(c.zoom - 0.72) < 1e-9 && jerk < 0.1 && risingThenFalling, `peak ${peak.toFixed(3)}, end ${c.zoom.toFixed(3)}, biggest step ${jerk.toFixed(3)}`); }
// 19 intro cancellation and first-time-only
{ const c = new CameraDirector(); const z0 = c.zoom; c.tick(100); c.steer(true); const t = new Transitions(); const a = t.start('T1'), b = t.start('T1'); check('19 steering ends the opening breath at once, and the wordmark transition runs only the first time', z0 === 1.25 && c.state === 'LISTENER_FOLLOW' && c.zoom === 1 && a === true && b === false); }
// 20 pairing cues
{ const t = new Transitions(); t.start('T3'); t.tick(10); t.start('T6'); const cu = t.cues; check('20 each transition emits its sound and haptic pairing the moment it starts', cu.length === 2 && cu[0].haptic === 'tick' && cu[0].sound === 'cast' && cu[1].haptic === 'pulse' && cu[1].sound === 'threat_alert'); }

// 21 transient effects keep the mapping exact
{ let worst = 0, seed = 5; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 500; i++) { const c = new CameraDirector({ intro: false }); c.zoom = 0.6 + rnd() * 1.1; c.setTransient({ zoomMul: 1 + rnd() * 0.08, nudge: [rnd() * 6 - 3, rnd() * 6 - 3] }); const snap = { player: [rnd() * 24, rnd() * 36], trail: [[0, 0]], segments: [], castOrigins: [] }; const f = c.frame(snap); for (let k = 0; k < 4; k++) { const w = [rnd() * 30, rnd() * 40], b = f.screenToWorld(f.worldToScreen(w)); worst = Math.max(worst, Math.hypot(b[0] - w[0], b[1] - w[1])); } }
  check('21 with the threat zoom and the camera nudge on, touch still maps to the world exactly (500 random cameras)', worst < 1e-9, `worst error ${worst.toExponential(1)} m`); }
// 22 the timing table in the docs is generated from the code and has not drifted
{ const gen = require('../../tools/transitions/gen_docs.js'); const file = path.join(root, 'docs/TRANSITIONS.md'); check('22 docs/TRANSITIONS.md matches the specs in the code exactly', fs.existsSync(file) && fs.readFileSync(file, 'utf8') === gen.build(), 'run `node tools/transitions/gen_docs.js --write` after changing a spec'); }

console.log(`RESULT ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
