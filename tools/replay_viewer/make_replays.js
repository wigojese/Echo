'use strict';
// Generates two scripted replays on EC-L01 and prints their event logs. The bot may read
// ground truth to pick its timing: this is a test fixture, not gameplay.
const fs = require('fs'), path = require('path');
const { Sim, makeReplay, runReplay } = require('../../reference/sim/sim');
const root = path.resolve(__dirname, '../..');
const level = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/levels/EC-L01.json'), 'utf8'));
const geo = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/levels/EC-L01-geometry.json'), 'utf8'));

function bot(name, script) {
  const sim = new Sim(level, geo), inputs = []; let lastDir = [NaN, NaN];
  const step = (extra = []) => { const ins = [...extra]; ins.forEach((i) => inputs.push({ tick: sim.tick, ...i })); sim.step(ins); };
  const steer = (wp) => { const dx = wp[0] - sim.pos[0], dy = wp[1] - sim.pos[1], m = Math.hypot(dx, dy) || 1;
    const d = [+(dx / m).toFixed(2), +(dy / m).toFixed(2)]; if (d[0] === lastDir[0] && d[1] === lastDir[1]) return []; lastDir = d; return [{ type: 'move', dx: d[0], dy: d[1] }]; };
  const api = {
    sim, walk(wps) { for (const wp of wps) { while (sim.state === 'RUNNING' && Math.hypot(wp[0] - sim.pos[0], wp[1] - sim.pos[1]) > 0.3) step(steer(wp)); } },
    stop() { lastDir = [NaN, NaN]; step([{ type: 'stop' }]); },
    pingWhen(cond) { api.stop(); let g = 0; while (!cond(sim) && g++ < 3000 && sim.state === 'RUNNING') step(); step([{ type: 'ping' }]); },
    wait(ticks) { for (let i = 0; i < ticks && sim.state === 'RUNNING'; i++) step(); },
    waitUntilEnd(max) { let g = 0; while (sim.state === 'RUNNING' && g++ < max) step(); },
  };
  script(api); return { name, sim, replay: makeReplay(level, inputs) };
}
const predNear = (s) => s.pred[0].pos[0] <= 14.0 && s.pred[0].state === 'PATROL';

const A = bot('A_heard_and_caught', (b) => { b.walk([[3, 10], [11, 10], [11, 17]]); b.pingWhen(predNear); b.stop(); b.waitUntilEnd(900); });
const B = bot('B_heard_and_escaped', (b) => { b.walk([[3, 6]]); b.pingWhen(() => true); b.walk([[3, 10], [11, 10], [11, 17]]); b.pingWhen(predNear); b.walk([[19, 17], [19, 26], [20, 32]]); b.stop(); b.waitUntilEnd(900); });

fs.mkdirSync(path.join(root, 'reference/replays'), { recursive: true });
for (const r of [A, B]) {
  fs.writeFileSync(path.join(root, `reference/replays/${r.name}.json`), JSON.stringify(r.replay));
  const re = runReplay(level, geo, r.replay), L = [];
  L.push(`REPLAY ${r.name}: ${r.replay.inputs.length} inputs, ended ${re.state} at tick ${re.tick} (${(re.tick / 30).toFixed(1)} s), ${re.castCount} echoes, path ${re.pathLen.toFixed(1)} m`);
  const same = JSON.stringify(re.events) === JSON.stringify(r.sim.events); L.push(`  replay reproduces the live run exactly: ${same}`);
  for (const e of re.events) if (e.kind !== 'wave_contact') L.push(`  tick ${String(e.tick).padStart(4)}  ${e.kind}  ${JSON.stringify(e.payload)}`);
  const ex = re.explain(); if (ex) L.push('  EXPLANATION: ' + ex.sentence);
  const p = re.pred[0]; L.push(`  predator last_heard_origin=${JSON.stringify(p.lastHeardOrigin)} last_heard_tick=${p.lastHeardTick} last_seen_player_tick=${p.lastSeenPlayerTick} investigations=${p.investigationCount}`);
  fs.writeFileSync(path.join(root, `reference/replays/${r.name}.log.txt`), L.join('\n') + '\n'); console.log(L.join('\n') + '\n');
}
