'use strict';
// Stage 13: predator intelligence, fairness and causal replay. Executable spec for the reference listener.
// Fixture levels are built here from strips so each scenario isolates one rule. Nothing reads a hidden state to pass a test
// except where a check says "white-box setup", which only places a body before the rule under test starts.
const fs = require('fs'), path = require('path');
const { Sim, P, PROFILES, LISTENER_EDGES, EVENTS, runReplay } = require('../../reference/sim/sim');
const { STRATEGIES, sweep } = require('../../tools/strategies/strategies');
const { run: runPlan, level: L01, geo: G01 } = require('../../tools/strategies/lib');
const root = path.resolve(__dirname, '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const LS = J('tests/fixtures/sealed_level.json'), GS = J('tests/fixtures/sealed_geometry.json');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };
const kinds = (s, k) => s.events.filter((e) => e.kind === k);
const changes = (s) => kinds(s, 'predator_state_changed');

function fixture(strips, spawn, pred, opts = {}) {
  const level = { schema_version: 1, id: 'EC-T-S13', seed: 13, world_bounds_metres: [0, 0, 24, 36], player: { spawn_xy: spawn, collision_radius_m: 0.28 }, goal: { exit_xy: opts.exit || [23, 35], trigger_radius_m: 0.8 },
    rules: { acoustic_cell_m: 0.25 }, predators: pred ? [{ id: 'listener-01', type: 'LISTENER', spawn_xy: pred.pos, patrol_waypoints: pred.wp || [pred.pos, [pred.pos[0] + 0.01, pred.pos[1]]], hearing_cost_limit_m: pred.hear || 11 }] : [] };
  return [level, { schema_version: 1, half_width_m: 1.2, walkable_strips: strips }];
}
const stepN = (s, n, at = {}) => { for (let i = 0; i < n && s.state === 'RUNNING'; i++) s.step(at[s.tick] || []); return s; };
const CORR = [[2, 5, 22, 5]]; // one long corridor

// ---- 01 the approved suspense profile is exactly the Stage 08 rule set ----
{ const s = new Sim(L01, G01), p = s.P;
  check('S13-01 default profile equals the approved listener numbers (speeds 1.1/1.45/1.85, sight 4 m for 6 ticks, warning 18 ticks, capture 0.5 m for 6 ticks, curious 7 s, search 2.5 s, lose 1.7 s, hearing 11)',
    p.patrolSpeed === 1.1 && p.curiousSpeed === 1.45 && p.chaseSpeed === 1.85 && p.contactRadius === 4 && p.contactTicks === 6 && p.alertTicks === 18 && p.captureRadius === 0.5 && p.captureLosTicks === 6 &&
    p.curiousMaxTicks === 210 && p.searchTicks === 75 && p.chaseLoseTicks === 51 && s.pred[0].hearingLimit === 11);
  check('S13-02 the master prompt minimums hold in BOTH profiles: warning at least 0.60 s, sight at least 0.18 s',
    Object.keys(PROFILES).every((k) => { const q = new Sim(L01, G01, { profile: k }).P; return q.alertTicks / 30 >= 0.6 && q.contactTicks / 30 >= 0.18; })); }

// ---- 03 declared transitions: every state change is on the diagram, every edge is exercised ----
const seen = new Map(); // edge -> first place observed
const note = (s, where) => { for (const e of changes(s)) { const k = e.payload.from + '>' + e.payload.to; if (!seen.has(k)) seen.set(k, where); } };
const sweeps = STRATEGIES.map((st) => ({ st, r: sweep(st, 'suspense') }));
const sweepsF = STRATEGIES.map((st) => ({ st, r: sweep(st, 'forgiving') }));
{ // collect edges from a spread of L01 runs
  for (const st of STRATEGIES) for (const d of [0, 60, 120, 180, 240, 300, 360, 420, 480, 540]) note(runPlan(st.plan, { delay: d }).sim, 'L01 ' + st.id + '@' + d); }

// ---- 04 old origin versus current player ----
{ // bait plan: one echo at the fork. Pick a phase where the listener hears it and the player still wins.
  let found = null; for (let d = 0; d <= 600 && !found; d += 10) { const r = runPlan(STRATEGIES.find((x) => x.id === 'bait').plan, { delay: d }); if (r.sim.state === 'WON' && kinds(r.sim, 'heard_ping').length) found = { d, r }; }
  const { r } = found, s = r.sim, hp = kinds(s, 'heard_ping')[0], cu = changes(s).find((e) => e.payload.to === 'CURIOUS'), se = changes(s).find((e) => e.payload.to === 'SEARCH' && e.payload.from === 'CURIOUS');
  const at = runReplay(L01, G01, r.replay, se.tick + 1), toOrigin = Math.hypot(at.pred[0].pos[0] - hp.payload.origin[0], at.pred[0].pos[1] - hp.payload.origin[1]), toPlayer = Math.hypot(at.pred[0].pos[0] - at.pos[0], at.pred[0].pos[1] - at.pos[1]);
  check('S13-04 hearing an old origin: the listener walks to where the echo was cast, not to where you are now', se.payload.arrived === true && toOrigin < 0.6 && toPlayer > 6, `phase ${found.d}: at the origin within ${toOrigin.toFixed(2)} m, player ${toPlayer.toFixed(1)} m away`);
  check('S13-04b the same run: no chase, the echo cost the listener a trip and the player the exit', !changes(s).some((e) => e.payload.to === 'CHASE') && s.state === 'WON');
  check('S13-04c the heard event is caused by the cast, and the state change by the heard event', hp.cause === kinds(s, 'ping_cast')[0].id && cu.cause === hp.id); }

// ---- 05 seeing the current player ----
{ const [lv, g] = fixture(CORR, [3, 5], { pos: [6.9, 5] }), s = stepN(new Sim(lv, g), 40);
  const ch = changes(s)[0];
  check('S13-05 seeing the current player: no echo, line of sight at 4 m or less for 6 ticks starts the chase', !!ch && ch.payload.to === 'CHASE' && ch.payload.from === 'PATROL' && kinds(s, 'ping_cast').length === 0 && kinds(s, 'heard_ping').length === 0, `chase at tick ${ch && ch.tick}`);
  const [lv2, g2] = fixture(CORR, [3, 5], { pos: [6.9, 5] }), s2 = new Sim(lv2, g2); stepN(s2, 5); const early = changes(s2).length; stepN(s2, 3);
  check('S13-05b sight must last 6 ticks: the chase begins on the sixth tick of contact, not the first', early === 0 && changes(s2).length === 1 && changes(s2)[0].tick === 5, `chase tick ${changes(s2)[0] && changes(s2)[0].tick}`); }
{ // contact shorter than 6 ticks resets the counter
  const [lv, g] = fixture(CORR, [3, 5], { pos: [9.5, 5] }), s = new Sim(lv, g); s.pred[0].contactTicks = 0; s.pos = [5.6, 5]; let chased = false;
  for (let i = 0; i < 12; i++) { s.pos = (i % 5 === 4) ? [2.5, 5] : [5.6, 5]; s.step(); if (changes(s).length) chased = true; }
  check('S13-05c flickering contact (never 6 ticks in a row) never starts a chase', !chased); }

// ---- 06 no through-wall perception ----
{ const s = new Sim(LS, GS), at = {}; for (let k = 0; k < 24; k++) at[10 + k * 40] = [{ type: 'ping' }]; at[0] = [{ type: 'move', dx: 0, dy: 1 }]; at[130] = [{ type: 'move', dx: 0, dy: -1 }]; at[260] = [{ type: 'move', dx: 0, dy: 1 }];
  stepN(s, 900, at);
  check('S13-06 sealed wall: 24 echoes and 30 s walking 3.2 m from a patrolling listener cause no hearing, no state change, no ghost', kinds(s, 'heard_ping').length === 0 && changes(s).length === 0 && s.ghosts.size === 0 && kinds(s, 'heard_step').length === 0, `echoes ${kinds(s, 'ping_cast').length}`);
  const sf = new Sim(LS, GS, { overrides: { footstepM: 8 } }); stepN(sf, 900, at);
  check('S13-06b even with footstep reach raised to 8 m, a wall 0.8 m thick stops the sound', kinds(sf, 'heard_step').length === 0 && changes(sf).length === 0);
  const GC = clone(GS); GC.walkable_strips = [...GS.walkable_strips, [4, 12.5, 7.2, 12.5]]; const sc = new Sim(LS, GC); stepN(sc, 900, at);
  check('S13-06c negative control: add a connecting doorway and the same inputs are heard, so the test can fail', kinds(sc, 'heard_ping').length > 0 && changes(sc).length > 0, `heard ${kinds(sc, 'heard_ping').length}`); }
{ // hairpin: the arms are 3.2 m apart with a 0.8 m wall between, joined only at the far end
  const [lv, g] = fixture([[4, 6, 4, 14], [7.2, 6, 7.2, 14], [4, 14, 7.2, 14]], [4, 8], { pos: [7.2, 11.5] }); let sees = 0, blocked = 0, blockedChase = 0, seenChase = 0;
  for (let y = 6.5; y <= 13.8; y += 0.25) for (const x of [4, 4.8, 5.6, 6.4]) { const s = new Sim(lv, g); s.pos = [x, y]; if (!s.circleClear(x, y, 0.28)) continue; const d = s.dist(s.pos, s.pred[0].pos), los = s.los(s.pos, s.pred[0].pos); stepN(s, 60);
    const chased = changes(s).some((e) => e.payload.to === 'CHASE');
    if (d <= 4 && los) { sees++; if (chased) seenChase++; } if (d <= 4 && !los) { blocked++; if (chased) blockedChase++; } }
  check('S13-06d hairpin corner: positions within 4 m through a wall (no line of sight) never start a chase, and positions in sight do', blocked >= 8 && sees >= 4 && blockedChase === 0 && seenChase === sees, `${blocked} blocked positions (${blockedChase} chased), ${sees} visible positions (${seenChase} chased)`); }

// ---- 07 capture delay and telegraph ----
{ const [lv, g] = fixture(CORR, [9.7, 5], { pos: [10, 5] }), s = new Sim(lv, g); let capTick = -1; while (s.state === 'RUNNING' && s.tick < 200) { s.step(); if (s.state === 'CAPTURED') capTick = s.tick - 1; }
  const ch = changes(s).find((e) => e.payload.to === 'CHASE'), cap = kinds(s, 'player_captured')[0];
  check('S13-07 point blank: you are already inside capture range yet the capture waits for the full 0.60 s warning', !!ch && !!cap && cap.tick - ch.tick === 18 && cap.payload.alertTicks === 18, `chase tick ${ch.tick}, capture tick ${cap.tick}`);
  check('S13-07b from first sight to capture takes at least 0.20 s of contact plus 0.60 s of warning', cap.tick - (ch.payload.sight.firstContactTick) >= 6 + 18 - 1, `${((cap.tick - ch.payload.sight.firstContactTick) / 30).toFixed(2)} s`);
  const f = new Sim(lv, g, { profile: 'forgiving' }); stepN(f, 200); const fc = kinds(f, 'player_captured')[0], fch = changes(f).find((e) => e.payload.to === 'CHASE');
  check('S13-07c the forgiving profile lengthens the warning to 0.90 s', fc && fc.tick - fch.tick === 27, `${fc && fc.tick - fch.tick} ticks`); }
{ // alert visibility: the amber signal exists on every tick of a chase and on no other tick, and carries only an age
  const [lv, g] = fixture(CORR, [9.7, 5], { pos: [10, 5] }), s = new Sim(lv, g); let ok = true, chasing = 0, shown = 0, onlyAge = true;
  while (s.state === 'RUNNING' && s.tick < 200) { s.step(); const sn = s.snapshot(), c = s.pred.some((p) => p.state === 'CHASE'); if (c && s.state === 'RUNNING') { chasing++; if (sn.alert) shown++; else ok = false; } else if (sn.alert && s.state === 'RUNNING') ok = false; if (sn.alert && Object.keys(sn.alert).join() !== 'ageTicks') onlyAge = false; }
  check('S13-07d telegraph: the alert is in the snapshot on every chase tick before the capture, and only then', ok && chasing >= 17 && shown === chasing, `${shown}/${chasing} chase ticks`);
  check('S13-07e the alert carries an age and nothing else, so it cannot show where the listener is', onlyAge); }
{ // every capture in every strategy sweep: warning at least 18 ticks, and a chase state change precedes it
  let n = 0, minWarn = 1e9, noChase = 0; for (const { r } of sweeps) for (const smp of Object.values(r.samples)) { const s = runReplay(L01, G01, smp.replay); const c = kinds(s, 'player_captured')[0]; if (!c) continue; n++; minWarn = Math.min(minWarn, c.payload.alertTicks); if (!s.causalChain(c).some((e) => e.payload && e.payload.to === 'CHASE')) noChase++; }
  check('S13-07f every sampled capture in the strategy sweeps has at least an 18 tick warning and a chase in its cause chain', n >= 4 && minWarn >= 18 && noChase === 0, `${n} captures, shortest warning ${minWarn} ticks`); }

// ---- 08 lost sight, search, recover ----
{ const [lv, g] = fixture(CORR, [6, 5], { pos: [10, 5], wp: [[10, 5], [10.01, 5]] }), s = new Sim(lv, g); stepN(s, 12);
  const chase = changes(s).find((e) => e.payload.to === 'CHASE'); const lastSeen = () => s.pred[0].lastSeenPlayerTick;
  s.pos = [21.5, 5]; s.vel = [0, 0]; s.dir = [0, 0]; const t0 = s.tick; stepN(s, 120);
  const lost = changes(s).find((e) => e.payload.to === 'SEARCH' && e.payload.from === 'CHASE');
  check('S13-08 lost sight: with no contact, the chase becomes a search after exactly 1.7 s (51 ticks)', !!chase && !!lost && lost.payload.lostTicks === 51 && lost.tick - lastSeen() === 51, `lost at tick ${lost && lost.tick}, last seen ${lastSeen()}`);
  check('S13-08b the search event is caused by the chase event', lost && lost.cause === chase.id);
  stepN(s, 200); const rec = changes(s).find((e) => e.payload.to === 'RECOVER');
  check('S13-08c the search lasts exactly 2.5 s (75 ticks) before it recovers', !!rec && rec.tick - lost.tick === 75, `${rec && rec.tick - lost.tick} ticks`);
  stepN(s, 600); const pat = changes(s).find((e) => e.payload.to === 'PATROL');
  check('S13-08d recover walks it back to its route and it patrols again', !!pat && pat.tick > rec.tick); }

// ---- 09 a new sound resets the investigation ----
{ const [lv, g] = fixture(CORR, [3, 5], { pos: [14, 5], hear: 14, wp: [[14, 5], [14.01, 5]] }), s = new Sim(lv, g); stepN(s, 2, { 0: [{ type: 'ping' }] });
  stepN(s, 60); const first = s.pred[0].dest.slice(), t1 = s.pred[0].curiousStart; s.pos = [4.5, 5]; s.step([{ type: 'ping' }]); stepN(s, 40);
  const heard = kinds(s, 'heard_ping');
  check('S13-09 a second echo from a new place updates the remembered origin and restarts the investigation timer', heard.length === 2 && Math.hypot(s.pred[0].dest[0] - 4.5, s.pred[0].dest[1] - 5) < 0.5 && Math.hypot(first[0] - 3, first[1] - 5) < 0.5 && s.pred[0].curiousStart > t1, `dest ${s.pred[0].dest.map((v) => v.toFixed(1))}`);
  check('S13-09b the second hearing does not make a second CURIOUS state change (it was already curious)', changes(s).filter((e) => e.payload.to === 'CURIOUS').length === 1); }

// ---- 10 listener memory does not leak ----
{ // echo at x=3, then the player (white-box setup) is somewhere it cannot be seen. The listener must go to the old origin, give up, and go home for good.
  const [lv, g] = fixture(CORR, [5, 5], { pos: [14, 5], hear: 14, wp: [[14, 5], [14.01, 5]] }), s = new Sim(lv, g); s.step([{ type: 'ping' }]); s.pos = [22, 5]; s.vel = [0, 0]; s.dir = [0, 0];
  stepN(s, 2400); const se = changes(s).find((e) => e.payload.to === 'SEARCH'), pat = changes(s).find((e) => e.payload.to === 'PATROL'), origin = kinds(s, 'heard_ping')[0].payload.origin; let after = Infinity;
  for (const rt of s.predRoute[0]) if (pat && rt[2] > pat.tick) after = Math.min(after, Math.hypot(rt[0] - origin[0], rt[1] - origin[1]));
  check('S13-10 it walks to an old origin although you are gone, searches there, and returns to its route', !!se && se.payload.arrived === true && !!pat && s.state === 'RUNNING', `search at tick ${se && se.tick}, patrol again at ${pat && pat.tick}`);
  check('S13-10b after it recovers it never goes back to that origin without a new sound', after > 8, `closest return ${after === Infinity ? 'none sampled' : after.toFixed(1) + ' m'}`);
  check('S13-10c the remembered origin is kept for the explanation only, and the patrol target is not it', s.pred[0].lastHeardOrigin && Math.hypot(s.pred[0].lastHeardOrigin[0] - 5, s.pred[0].lastHeardOrigin[1] - 5) < 0.5 && s.pred[0].wp.every((w) => Math.hypot(w[0] - 5, w[1] - 5) > 5)); }

{ // heard from 11 m of floor: 7 s at 1.45 m/s is 10.15 m, so the listener times out short of the origin. A designed edge, recorded so nobody reads it as a bug.
  const [lv, g] = fixture(CORR, [3, 5], { pos: [14, 5], hear: 14, wp: [[14, 5], [14.01, 5]] }), s = new Sim(lv, g); s.step([{ type: 'ping' }]); s.pos = [22, 5]; s.vel = [0, 0]; s.dir = [0, 0]; stepN(s, 300);
  const se = changes(s).find((e) => e.payload.to === 'SEARCH'), pos = s.pred[0].pos;
  check('S13-10d a sound heard from 11 m is investigated for at most 7 s, so the listener searches about 0.9 m short of the origin', se && se.payload.arrived === false && /timed out/.test(se.payload.reason) && Math.hypot(pos[0] - 3, pos[1] - 5) > 0.5 && Math.hypot(pos[0] - 3, pos[1] - 5) < 1.5, `stopped ${Math.hypot(pos[0] - 3, pos[1] - 5).toFixed(2)} m from the origin`); }

// ---- 11 quiet step ----
{ const mk = (quiet) => { const [lv, g] = fixture(CORR, [2.5, 5], { pos: [14, 5] }); const s = new Sim(lv, g, { overrides: { footstepM: 6 } }); s.step([{ type: 'quiet', on: quiet }, { type: 'move', dx: 1, dy: 0 }]); stepN(s, 160); return s; };
  const w = mk(false), q = mk(true), hw = kinds(w, 'heard_step')[0], hq = kinds(q, 'heard_step')[0];
  check('S13-11 walking is heard by a listener 6 m away; quiet step (30 percent of that reach) is not', !!hw && !hq, `walking heard at tick ${hw && hw.tick}, quiet ${hq ? 'heard at ' + hq.tick : 'not heard before sight'}`);
  check('S13-11b quiet reaches 30 percent: reach 1.8 m against 6.0 m', hw.payload.reach === 6 && Math.abs(new Sim(L01, G01, { overrides: { footstepM: 6 } }).P.quietNoiseFactor * 6 - 1.8) < 1e-9);
  const [lv, g] = fixture(CORR, [11.5, 5], { pos: [14, 5] }); const st = new Sim(lv, g, { overrides: { footstepM: 6 } }); stepN(st, 60);
  check('S13-11c standing still makes no footstep sound at 2.5 m of floor; sight (6 ticks) is what finds you', kinds(st, 'heard_step').length === 0 && changes(st).some((e) => e.payload.to === 'CHASE'));
  const [lv2, g2] = fixture(CORR, [3, 5], { pos: [14, 5], hear: 14 }); const a = new Sim(lv2, g2), b = new Sim(lv2, g2); stepN(a, 60, { 0: [{ type: 'ping' }] }); stepN(b, 60, { 0: [{ type: 'quiet', on: true }, { type: 'ping' }] });
  check('S13-11d a ping is just as loud under quiet step: same hearing cost and arrival tick', kinds(a, 'heard_ping')[0].payload.weightedCost === kinds(b, 'heard_ping')[0].payload.weightedCost && kinds(a, 'heard_ping')[0].payload.arrivalTick === kinds(b, 'heard_ping')[0].payload.arrivalTick);
  const noisy = sweeps.reduce((n, { r }) => n + r.heardSteps, 0);
  check('S13-11e finding to report: on EC-L01 at the default 2.5 m, sight (4 m) shadows footsteps, so quiet step is only slower', noisy < 40, `${noisy} footstep hearings across ${sweeps.length * 61} runs`); }

// ---- 12 the causal log ----
{ let events = 0, bad = 0, caps = 0; const rootKinds = new Set();
  for (const { r } of sweeps) for (const smp of Object.values(r.samples)) { const s = runReplay(L01, G01, smp.replay), c = kinds(s, 'player_captured')[0]; if (!c) continue; caps++; const ch = s.causalChain(c); events += ch.length; rootKinds.add(ch[0].kind);
    const ids = new Set(s.events.map((e) => e.id)); for (const e of ch) if (e.cause != null && !(ids.has(e.cause) && s.events.find((x) => x.id === e.cause).tick <= e.tick)) bad++; }
  check('S13-12 every cause points at an earlier logged event, in every sampled capture', caps >= 4 && bad === 0, `${caps} captures, ${events} chain events`);
  check('S13-12b chains start at a cast, a footstep or the sight itself, never at nothing', [...rootKinds].every((k) => ['ping_cast', 'heard_step', 'predator_state_changed'].includes(k)), [...rootKinds].join(', ')); }
{ const ids = new Set(); const s = runReplay(L01, G01, J('reference/replays/A_heard_and_caught.json')); let uniq = true; for (const e of s.events) { if (e.kind === 'level_reset') continue; if (ids.has(e.id)) uniq = false; ids.add(e.id); }
  check('S13-12c event ids are unique and sequential from 0, and every event kind is semantic', uniq && s.events.every((e) => EVENTS.includes(e.kind)) && s.events[0].id === 0); }

// ---- 13 the explanation uses the log and only the log ----
{ const s = runReplay(L01, G01, J('reference/replays/A_heard_and_caught.json')), ex = s.explain(), c = kinds(s, 'player_captured')[0], h = kinds(s, 'heard_ping')[0], ds = s.explainDetail();
  check('S13-13 the sentence names the echo the log says the listener heard and the warning length the log recorded', ex.sentence.includes(`echo ${h.payload.castId}`) && ex.sentence.includes((c.payload.alertTicks / 30).toFixed(2) + ' s'), ex.sentence);
  check('S13-13b the detail chain runs cast, heard, curious, chase, capture in order', ds.chain.map((x) => x.kind).join() === 'ping_cast,heard_ping,predator_state_changed,predator_state_changed,player_captured' && ds.chain.every((x, i) => i === 0 || x.tick >= ds.chain[i - 1].tick), ds.chain.map((x) => x.kind.replace('predator_state_changed', 'state')).join(' > '));
  // the safe sentence must not change if the hidden route is tampered with, and the detail must
  const t = runReplay(L01, G01, J('reference/replays/A_heard_and_caught.json')); t.predRoute[0] = t.predRoute[0].map((p) => [p[0] + 3, p[1] - 2, p[2]]); t.pred[0].pos = [1, 1];
  check('S13-13c the sentence and lesson are identical when the listener route and final position are tampered with', JSON.stringify([t.explain().sentence, t.explain().lesson]) === JSON.stringify([ex.sentence, ex.lesson]));
  check('S13-13d no listener coordinate appears in the sentence or lesson', !/\(\s*\d+(\.\d+)?\s*,\s*\d+/.test(ex.sentence + ' ' + ex.lesson));
  const run0 = new Sim(L01, G01); stepN(run0, 100);
  check('S13-13e while the round is running, the detail, the reveal and the summary all return nothing', run0.explainDetail() === null && run0.revealTruth() === null && run0.summary() === null && run0.explain() === null); }

// ---- 14 each lesson rule fires from facts, and each can be forced ----
const rules = {};
{ for (const { st, r } of sweeps) for (const [rule, smp] of Object.entries(r.samples)) { if (!rules[rule]) rules[rule] = { from: 'L01 ' + st.id + '@' + smp.delay, replay: smp.replay }; } }
const record = (sim, level, geo, overrides) => { const inputs = []; const step = (arr = []) => { for (const i of arr) inputs.push({ tick: sim.tick, ...i }); sim.step(arr); };
  return { step, sample: (from) => ({ from, fixture: { level, geo }, replay: { format_version: 1, level_id: level.id, seed: level.seed, ruleset: 'EC-RULESET-01', dt_hz: 30, ...(overrides ? { overrides } : {}), inputs }, live: JSON.stringify(sim.events) }) }; };
{ // REPEATED_ECHOES fixture
  const [lv, g] = fixture(CORR, [4, 5], { pos: [14, 5], hear: 14, wp: [[14, 5], [14.01, 5]] }), s = new Sim(lv, g), rc = record(s, lv, g), at = {}; [0, 40, 80, 120, 160, 200].forEach((t) => { at[t] = [{ type: 'ping' }]; });
  while (s.state === 'RUNNING' && s.tick < 2000) rc.step(at[s.tick] || []); const x = s.explain(); if (x && x.rule === 'REPEATED_ECHOES') rules.REPEATED_ECHOES = rc.sample('fixture corridor, six echoes from one spot');
  check('S13-14 fixture: casting again and again from one spot is named REPEATED_ECHOES, from three or more heard echoes in 12 s', s.state === 'CAPTURED' && x.rule === 'REPEATED_ECHOES', x ? x.rule + ' | ' + x.lesson : s.state); }
{ // HEARD_STEPS fixture
  const ov = { footstepM: 6 }, [lv, g] = fixture(CORR, [2.5, 5], { pos: [14, 5] }), s = new Sim(lv, g, { overrides: ov }), rc = record(s, lv, g, ov); rc.step([{ type: 'move', dx: 1, dy: 0 }]); let stopped = false;
  while (s.state === 'RUNNING' && s.tick < 1500) { if (!stopped && kinds(s, 'heard_step').length) { rc.step([{ type: 'stop' }]); stopped = true; } else rc.step(); }
  const x = s.explain(); if (x && x.rule === 'HEARD_STEPS') rules.HEARD_STEPS = rc.sample('fixture corridor, footstep reach raised to 6 m');
  check('S13-14b fixture: being heard walking and then standing still is named HEARD_STEPS', s.state === 'CAPTURED' && x.rule === 'HEARD_STEPS', x ? x.rule + ' | ' + x.sentence : s.state); }
check('S13-14c all five capture rules have been produced by a run: ' + Object.keys(rules).sort().join(', '), ['WALKED_INTO_VIEW', 'STAYED_NEAR_ORIGIN', 'FOUND_ON_ROUTE', 'REPEATED_ECHOES', 'HEARD_STEPS'].every((k) => rules[k]));
{ const r = runReplay(L01, G01, rules.STAYED_NEAR_ORIGIN.replay), x = r.explain(), h = kinds(r, 'heard_ping').pop(), c = kinds(r, 'player_captured')[0], d = Math.hypot(c.payload.playerPos[0] - h.payload.origin[0], c.payload.playerPos[1] - h.payload.origin[1]);
  check('S13-14d STAYED_NEAR_ORIGIN quotes the distance from your own position to your own cast origin, as the log has it', x.lesson.includes(d.toFixed(1) + ' m') && d <= 3.0, x.lesson); }
{ // the rule table has no fallback that blames the player without a fact: when nothing matches the lesson is absent, never invented
  const lessonRules = new Set(Object.keys(rules)); const all = [];
  for (const { st, r } of sweeps) for (const smp of Object.values(r.samples)) all.push(runReplay(L01, G01, smp.replay).explain());
  check('S13-14e every captured sample has a lesson and a rule id from the closed list', all.every((x) => x.lesson && ['WALKED_INTO_VIEW', 'STAYED_NEAR_ORIGIN', 'FOUND_ON_ROUTE', 'REPEATED_ECHOES', 'HEARD_STEPS'].includes(x.rule)) && lessonRules.size >= 3); }

// ---- 15 replay reproduces the trace, so the samples are verified ----
{ let ok = 0, n = 0, listed = [];
  for (const [rule, smp] of Object.entries(rules)) { n++; let live, r;
    if (smp.fixture) { r = runReplay(smp.fixture.level, smp.fixture.geo, smp.replay); live = smp.live; }
    else { const st = STRATEGIES.find((x) => smp.from.includes(' ' + x.id + '@')); r = runReplay(L01, G01, smp.replay); live = JSON.stringify(runPlan(st.plan, { delay: parseInt(smp.from.split('@')[1], 10) }).sim.events); }
    const same = JSON.stringify(r.events) === live && r.state === 'CAPTURED'; if (same) ok++; listed.push(rule + (same ? '' : ' MISMATCH')); }
  check('S13-15 every failure sample (L01 and fixture) replays to a byte-identical event log and a capture', n === 5 && ok === n, `${ok}/${n}: ${listed.join(', ')}`);
  const f = sweepsF.find((x) => x.st.id === 'six').r.samples; const fs0 = Object.values(f)[0]; if (fs0) { const rr = runReplay(L01, G01, fs0.replay); check('S13-15b a forgiving-profile replay carries its profile and reproduces', fs0.replay.profile === 'forgiving' && rr.profile === 'forgiving' && rr.state === 'CAPTURED'); } }

// ---- 16 strategies ----
{ const byId = Object.fromEntries(sweeps.map(({ st, r }) => [st.id, r]));
  const winners = sweeps.filter(({ r }) => r.won > 0).map(({ st }) => st.id), distinct = new Set(sweeps.filter(({ r }) => r.won > 0).map(({ st }) => st.echoes));
  check('S13-16 at least five different strategies win EC-L01, using 0, 1, 3 and 6 echoes', winners.length >= 5 && [0, 1, 3, 6].every((k) => distinct.has(k)), `${winners.join(', ')}`);
  check('S13-16b none of the winning strategies is a certain win or a certain loss across start phases except the two bookends', sweeps.filter(({ r, st }) => r.won > 0 && st.id !== 'navigator' && st.id !== 'bait').every(({ r }) => r.won < r.runs) && byId.stand.won === 0 && byId.stand.captured > 0);
  check('S13-16c every strategy is open loop: each plan contains only moves, echoes, waits and quiet toggles (nothing reads the listener)', STRATEGIES.every((st) => st.plan.every((p) => ['go', 'echo', 'wait', 'quiet'].some((k) => k in p))));
  check('S13-16d the forgiving profile never captures more often than suspense on any strategy, and strictly fewer overall', sweepsF.every(({ st, r }) => r.captured <= byId[st.id].captured) && sweepsF.reduce((n, { r }) => n + r.captured, 0) < sweeps.reduce((n, { r }) => n + r.captured, 0), `${sweepsF.reduce((n, { r }) => n + r.captured, 0)} vs ${sweeps.reduce((n, { r }) => n + r.captured, 0)} captures`); }

// ---- 17 declared transitions, coverage ----
{ const declared = LISTENER_EDGES.map((e) => e.from + '>' + e.to);
  // White-box setup: after the first echo the player is moved to where the scenario needs it. Nothing else is touched.
  const scen = (name, when, act, max = 4000) => { const [lv, g] = fixture(CORR, [3, 5], { pos: [14, 5], hear: 14, wp: [[14, 5], [14.01, 5]] }), s = new Sim(lv, g); s.step([{ type: 'ping' }]); s.pos = [22, 5]; s.vel = [0, 0]; s.dir = [0, 0]; let done = false, n = 0;
    while (s.state === 'RUNNING' && n++ < max) { if (!done && when(s)) { done = true; act(s); } else s.step(); } note(s, 'fixture ' + name); return s; };
  const inState = (st) => (s) => s.pred[0].state === st;
  scen('full cycle', () => false, () => {});
  scen('echo during search', inState('SEARCH'), (s) => { s.pos = [8.5, 5]; s.step([{ type: 'ping' }]); });
  scen('echo during recover', inState('RECOVER'), (s) => { s.pos = [8.5, 5]; s.step([{ type: 'ping' }]); });
  scen('sight during search', inState('SEARCH'), (s) => { s.pos = [s.pred[0].pos[0] + 2.5, 5]; s.step(); });
  scen('sight during recover', inState('RECOVER'), (s) => { s.pos = [s.pred[0].pos[0] + 2.5, 5]; s.step(); });
  { const [lv, g] = fixture(CORR, [6, 5], { pos: [10, 5] }), s = new Sim(lv, g); stepN(s, 12); s.pos = [21.5, 5]; s.vel = [0, 0]; s.dir = [0, 0]; stepN(s, 120); note(s, 'fixture lost sight'); }
  const unknown = [...seen.keys()].filter((k) => !declared.includes(k)), missing = declared.filter((k) => !seen.has(k));
  check('S13-17 every observed state change is a declared edge of the transition diagram', unknown.length === 0, unknown.join(', ') || `${seen.size} distinct edges seen`);
  check('S13-17b every declared edge is exercised by a run or a fixture (11 edges)', missing.length === 0, missing.length ? 'never exercised: ' + missing.join(', ') : declared.length + '/' + declared.length);
  module.exports.edgeSource = Object.fromEntries(seen);
  let threw = false; try { new Sim(L01, G01).setState({ state: 'PATROL', id: 'x' }, 'SEARCH', 'bad'); } catch (e) { threw = /undeclared/.test(e.message); }
  check('S13-17c an undeclared transition throws instead of being logged', threw); }

function clone(x) { return JSON.parse(JSON.stringify(x)); }

Object.assign(module.exports, { seen, rules, sweeps, sweepsF });
console.log(`\nRESULT ${pass} passed, ${fail} failed`);
if (require.main === module) process.exit(fail ? 1 : 0);
