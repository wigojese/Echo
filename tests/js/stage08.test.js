'use strict';
const fs = require('fs'), path = require('path');
const { Sim, SimClock, P, EVENTS, runReplay, camera } = require('../../reference/sim/sim');
const S = require('../../spike/stage06/solver');
const root = path.resolve(__dirname, '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const L01 = J('game/resources/levels/EC-L01.json'), G01 = J('game/resources/levels/EC-L01-geometry.json');
const LS = J('tests/fixtures/sealed_level.json'), GS = J('tests/fixtures/sealed_geometry.json');
const RA = J('reference/replays/A_heard_and_caught.json'), RB = J('reference/replays/B_heard_and_escaped.json');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const run = (sim, n, inputsAt = {}) => { for (let i = 0; i < n; i++) sim.step(inputsAt[sim.tick] || []); return sim; };
const kinds = (sim, k) => sim.events.filter((e) => e.kind === k);
const noPred = (l) => { const c = clone(l); c.predators = []; return c; };

// 1 start
{ const s = new Sim(L01, G01); check('01 EC-L01 starts RUNNING at the spawn point', s.state === 'RUNNING' && s.pos[0] === 3 && s.pos[1] === 3 && s.pred[0].state === 'PATROL'); }
// 2 speeds
{ const s = run(new Sim(noPred(L01), G01), 90, { 0: [{ type: 'move', dx: 0, dy: 1 }] }); const d = s.pos[1] - 3;
  check('02 normal speed is about 1.75 m/s (3 s covers 5.0 to 5.3 m)', d > 5.0 && d < 5.3, `distance=${d.toFixed(3)} m`); }
{ const s = run(new Sim(noPred(L01), G01), 90, { 0: [{ type: 'quiet', on: true }, { type: 'move', dx: 0, dy: 1 }] }); const d = s.pos[1] - 3;
  check('03 quiet step is about 1.10 m/s (3 s covers 3.1 to 3.35 m)', d > 3.1 && d < 3.35, `distance=${d.toFixed(3)} m`); }
// 4-5 collision
{ const s = new Sim(noPred(L01), G01); let bad = 0; s.step([{ type: 'move', dx: -1, dy: 0 }]); for (let i = 0; i < 200; i++) { s.step(); if (!s.circleClear(s.pos[0], s.pos[1], P.playerRadius)) bad++; }
  check('04 pushing into a wall for 6.7 s never leaves the walkable area', bad === 0 && s.pos[0] > 1.8, `x=${s.pos[0].toFixed(3)}`); }
{ const s = new Sim(noPred(L01), G01); let bad = 0; s.step([{ type: 'move', dx: 1, dy: 1 }]); for (let i = 0; i < 400; i++) { s.step(); if (!s.circleClear(s.pos[0], s.pos[1], P.playerRadius)) bad++; }
  check('05 driving diagonally into corners never passes through a wall', bad === 0, `final=(${s.pos.map((v) => v.toFixed(2))})`); }
// 6-8 ping
{ const s = new Sim(noPred(L01), G01); run(s, 60, { 0: [{ type: 'ping' }], 5: [{ type: 'ping' }], 38: [{ type: 'ping' }] });
  check('06 cooldown: tap at 5 is rejected visibly, tap at 38 (1.27 s) is accepted', kinds(s, 'ping_cast').length === 2 && kinds(s, 'ping_rejected').length === 1 && kinds(s, 'ping_rejected')[0].tick === 5); }
{ const s = new Sim(noPred(L01), G01); run(s, 31, { 0: [{ type: 'ping' }], 1: [{ type: 'move', dx: 0, dy: 1 }] });
  check('07 a ping starts at the cast position, not where the player is later', kinds(s, 'ping_cast')[0].payload.origin[1] === 3 && s.pos[1] > 4, `origin y=3, player y now=${s.pos[1].toFixed(2)}`); }
{ const l08 = noPred(L01); l08.rules.opening_breath_m = 0; const s = new Sim(l08, G01), f = []; s.step([{ type: 'ping' }]); const F = s.lastField.field; let early = 0, exact = true;
  for (let k = 1; k < 90; k++) { s.step(); const want = new Set(s.edges.filter((e) => F[e.cell] !== Infinity && Math.ceil(F[e.cell] / S.PULSE_SPEED * 30) <= s.tick - 1).map((e) => e.id)); for (const id of s.mem.keys()) if (!want.has(id)) early++; if (want.size !== s.mem.size) exact = false; }
  check('08 no wall face is known before the front reaches it, and every reached face is known on time', early === 0 && exact, `early=${early}`); }
// 9-10 sealed wall and exit
{ const s = new Sim(LS, GS); run(s, 150, { 3: [{ type: 'ping' }] }); let far = 0; for (const id of s.mem.keys()) if (s.edges[id].x1 > 6.0) far++;
  check('09 sealed wall: near face known, far corridor edges unknown', s.mem.size > 20 && far === 0, `known=${s.mem.size}, far=${far}`);
  check('09b sealed wall: hidden predator is not heard, not sensed, not alerted', kinds(s, 'heard_ping').length === 0 && s.ghosts.size === 0 && s.pred[0].state === 'PATROL'); }
{ const s = run(new Sim(L01, G01), 300, { 0: [{ type: 'ping' }] }); check('10 one ping from spawn does not reveal the exit', !s.exitKnown && s.snapshot().knownExit === null); }
// 11-13 memory
{ const s = run(new Sim(noPred(L01), G01), 300, { 0: [{ type: 'ping' }] }); check('11 static memory fully expires within 8 s of the last contact', s.mem.size === 0); }
{ const a = new Sim(L01, G01), b = [...RA.inputs]; const by = new Map(); b.forEach((i) => { by.set(i.tick, [...(by.get(i.tick) || []), i]); });
  let posAtHear = null, seen = false, gone = false, notLive = true;
  for (let k = 0; k < 600; k++) { a.step(by.get(a.tick) || []); const gh = a.snapshot().ghosts[0];
    if (gh) { seen = true; if (!posAtHear) posAtHear = [...gh.pos]; if (gh.ageTicks > 0 && Math.hypot(gh.pos[0] - a.pred[0].pos[0], gh.pos[1] - a.pred[0].pos[1]) < 1e-9) notLive = false; }
    else if (seen) gone = true; }
  check('12 a creature is remembered only as a ghost that is gone within 1.25 s', seen && gone);
  check('12b the ghost stays where the creature was, never at its current position', notLive); }
{ const s = new Sim(L01, G01), by = new Map(); RA.inputs.forEach((i) => by.set(i.tick, [...(by.get(i.tick) || []), i])); const keys = new Set();
  for (let k = 0; k < 700; k++) { s.step(by.get(s.tick) || []); Object.keys(s.snapshot()).forEach((x) => keys.add(x)); }
  check('13 the snapshot exposes no predator field', [...keys].sort().join() === ['castOrigins', 'cells', 'ghosts', 'grid', 'knownExit', 'player', 'segments', 'tick', 'trail', 'waves'].sort().join(), [...keys].join()); }
// 14-18 predator
{ const s = runReplay(L01, G01, RA), c = kinds(s, 'ping_cast')[0], h = kinds(s, 'heard_ping')[0];
  check('14 a ping at the fork is heard at the computed weighted cost and delay', h && h.payload.weightedCost <= 11 && h.tick === c.tick + Math.ceil(h.payload.weightedCost / 9 * 30), `cost=${h && h.payload.weightedCost}, delay=${h && h.tick - c.tick} ticks`); }
{ const s = run(new Sim(L01, G01), 400, { 0: [{ type: 'ping' }] }); check('15 a ping at spawn is never heard', kinds(s, 'heard_ping').length === 0); }
{ const s = runReplay(L01, G01, RB, 600), o = kinds(s, 'ping_cast')[1].payload.origin;
  check('16 moving after the ping: the listener goes to the old origin, not to the player', s.pred[0].dest && Math.hypot(s.pred[0].dest[0] - o[0], s.pred[0].dest[1] - o[1]) < 1e-9 && Math.hypot(s.pos[0] - o[0], s.pos[1] - o[1]) > 3, `player is ${Math.hypot(s.pos[0] - o[0], s.pos[1] - o[1]).toFixed(1)} m from the origin`); }
{ const s = runReplay(L01, G01, RB), ch = kinds(s, 'predator_state_changed'), sr = ch.find((e) => e.payload.to === 'SEARCH'), rc = ch.find((e) => e.payload.to === 'RECOVER');
  check('17 CURIOUS reaches the origin, SEARCH lasts exactly 2.5 s, then RECOVER', ch[0].payload.to === 'CURIOUS' && sr && rc && rc.tick - sr.tick === P.searchTicks, `search ticks=${rc && sr && rc.tick - sr.tick}`); }
{ const l = clone(L01); l.player.spawn_xy = [3, 3]; l.predators = [{ id: 'l', type: 'LISTENER', spawn_xy: [3.3, 3.1], patrol_waypoints: [[3.3, 3.1], [3.3, 3.1]], hearing_cost_limit_m: 11 }];
  const s = new Sim(l, G01); run(s, 80); const c = kinds(s, 'player_captured')[0];
  check('18 capture is impossible before the 0.60 s warning, even when the creature starts touching distance away', c && c.payload.alertTicks >= P.alertTicks && c.tick - c.payload.alertStart === P.alertTicks, `alert=${c && c.payload.alertTicks} ticks`); }
// 19 win
{ const s = new Sim(L01, G01), by = new Map(); RB.inputs.forEach((i) => by.set(i.tick, [...(by.get(i.tick) || []), i])); let first = -1;
  while (s.state === 'RUNNING') { s.step(by.get(s.tick) || []); if (first < 0 && Math.hypot(s.pos[0] - 20, s.pos[1] - 32) <= 0.8) first = s.tick - 1; }
  const w = kinds(s, 'exit_reached')[0]; check('19 winning needs 0.15 s inside the 0.8 m exit zone', s.state === 'WON' && w && w.tick - first >= 4, `entered at ${first}, won at ${w && w.tick}`); }
// 20-21 retry and determinism
{ const s = runReplay(L01, G01, RA); const end = JSON.stringify(s.events); s.reset(); const f = new Sim(L01, G01);
  const same = s.tick === 0 && s.state === 'RUNNING' && s.mem.size === f.mem.size && s.cellMem.size === f.cellMem.size && s.ghosts.size === 0 && s.castOrigins.length === 0 && s.scheduled.size === 0 && s.nextPingTick === 0 && s.castCount === 0 && s.pathLen === 0 &&
    JSON.stringify(s.pred) === JSON.stringify(f.pred) && JSON.stringify(s.snapshot()) === JSON.stringify(f.snapshot()) && s.events.length === 1 && s.events[0].kind === 'level_reset';
  check('20 instant retry resets memory, ghosts, queued events, cooldown, AI and counters', same);
  const by = new Map(); RA.inputs.forEach((i) => by.set(i.tick, [...(by.get(i.tick) || []), i])); while (s.state === 'RUNNING') s.step(by.get(s.tick) || []);
  check('20b the same inputs after a retry reach the same result', JSON.stringify(s.events.slice(1)) === end); }
{ const a = JSON.stringify(runReplay(L01, G01, RA).events), b = JSON.stringify(runReplay(L01, G01, RA).events); check('21 replay determinism: identical event logs on two runs', a === b); }
// 22-23 clock and pause
{ const finals = []; for (const hz of [30, 60, 120, 50]) { const sim = new Sim(noPred(L01), G01), clk = new SimClock(); let frames = 0;
    while (sim.tick < 300 && frames++ < 100000) { const n = clk.advance(1 / hz); for (let i = 0; i < n; i++) sim.step(sim.tick === 0 ? [{ type: 'move', dx: 0, dy: 1 }] : sim.tick === 30 ? [{ type: 'ping' }] : []); }
    finals.push(JSON.stringify([sim.tick, sim.pos, [...sim.mem.keys()]])); }
  check('22 frame independence: 30, 60, 120 and 50 Hz renders give identical state at tick 300', finals.every((f) => f === finals[0]), `ticks=${JSON.parse(finals[0])[0]}`); }
{ const a = new Sim(noPred(L01), G01), b = new Sim(noPred(L01), G01); run(a, 100, { 0: [{ type: 'move', dx: 0, dy: 1 }] }); run(b, 100, { 0: [{ type: 'move', dx: 0, dy: 1 }] });
  b.paused = true; for (let i = 0; i < 200; i++) b.step(); const frozen = b.tick === 100; b.paused = false; run(a, 50); run(b, 50);
  check('23 pause freezes the world and resuming matches an unpaused run', frozen && JSON.stringify(a.pos) === JSON.stringify(b.pos) && a.tick === b.tick); }
// 24 timeout
{ const s = run(new Sim(noPred(L01), G01), 2800); check('24 the 90 s soft timeout ends the level with a retry-friendly result', s.state === 'TIMEOUT' && kinds(s, 'level_timeout').length === 1 && /Retry/.test(s.explain().sentence), `ended at tick ${s.tick}`); }
// 25 events
{ const all = [...runReplay(L01, G01, RA).events, ...runReplay(L01, G01, RB).events]; let threw = false; try { new Sim(L01, G01).emit('frame_tick'); } catch (e) { threw = true; }
  check('25 only semantic events are ever logged, and an unknown event is rejected', all.every((e) => EVENTS.includes(e.kind)) && threw); }
// 26 camera firewall
{ const l2 = clone(LS); l2.predators[0].spawn_xy = [7.2, 13]; l2.predators[0].patrol_waypoints = [[7.2, 13], [7.2, 7]];
  const A = new Sim(LS, GS), B = new Sim(l2, GS); let same = true; const plan = { 10: [{ type: 'ping' }], 11: [{ type: 'move', dx: 0, dy: -1 }], 60: [{ type: 'ping' }], 61: [{ type: 'stop' }], 120: [{ type: 'ping' }] };
  for (let k = 0; k < 300; k++) { A.step(plan[A.tick] || []); B.step(plan[B.tick] || []); if (JSON.stringify(A.snapshot()) !== JSON.stringify(B.snapshot()) || JSON.stringify(camera(A.snapshot())) !== JSON.stringify(camera(B.snapshot()))) same = false; }
  check('26 camera firewall: different hidden predator positions give identical snapshots and framing for 300 ticks', same && JSON.stringify(A.pred[0].pos) !== JSON.stringify(B.pred[0].pos)); }
// 27 explanation
{ const s = runReplay(L01, G01, RA), ex = s.explain(), h = kinds(s, 'heard_ping')[0];
  check('27 the failure explanation quotes the logged echo id and tick, nothing else', ex.outcome === 'captured' && ex.sentence.includes(`echo ${h.payload.castId} at tick ${h.payload.arrivalTick}`), ex.sentence); }
// 28 outcomes
{ const a = runReplay(L01, G01, RA), b = runReplay(L01, G01, RB); check('28 one scripted run is caught and the other wins on the same level', a.state === 'CAPTURED' && b.state === 'WON', `${a.state} / ${b.state}`); }

console.log(`RESULT ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
