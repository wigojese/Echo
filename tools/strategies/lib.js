'use strict';
// Open-loop strategy runner for EC-L01. A plan is a fixed list of steps: no step reads the listener, so a plan cannot "cheat" by watching it.
// The only thing varied between runs is how long the player waits at the spawn, which shifts the listener's patrol phase.
const fs = require('fs'), path = require('path');
const { Sim, makeReplay } = require('../../reference/sim/sim');
const root = path.resolve(__dirname, '../..');
const level = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/levels/EC-L01.json'), 'utf8'));
const geo = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/levels/EC-L01-geometry.json'), 'utf8'));

// steps: {go:[x,y]} walk (quiet optional), {echo}, {wait:ticks}, {quiet:bool}
function run(plan, { delay = 0, profile = 'suspense', overrides, maxTicks = 90 * 30 } = {}) {
  const sim = new Sim(level, geo, { profile, overrides }), inputs = []; let lastDir = [NaN, NaN];
  const step = (extra = []) => { for (const i of extra) inputs.push({ tick: sim.tick, ...i }); sim.step(extra); };
  const steer = (wp) => { const dx = wp[0] - sim.pos[0], dy = wp[1] - sim.pos[1], m = Math.hypot(dx, dy) || 1, d = [+(dx / m).toFixed(2), +(dy / m).toFixed(2)];
    if (d[0] === lastDir[0] && d[1] === lastDir[1]) return []; lastDir = d; return [{ type: 'move', dx: d[0], dy: d[1] }]; };
  const stop = () => { lastDir = [NaN, NaN]; step([{ type: 'stop' }]); };
  let blind = 0, steps = 0;
  const tickBlind = () => { steps++; if (!sim.everCells.has(Math.floor(sim.pos[1] / sim.grid.cell) * sim.grid.nx + Math.floor(sim.pos[0] / sim.grid.cell))) blind++; }; // floor never sensed before the player stood on it
  for (let i = 0; i < delay && sim.state === 'RUNNING'; i++) step();
  for (const s of plan) {
    if (sim.state !== 'RUNNING' || sim.tick >= maxTicks) break;
    if (s.go) { let g = 0; while (sim.state === 'RUNNING' && Math.hypot(s.go[0] - sim.pos[0], s.go[1] - sim.pos[1]) > 0.3 && g++ < 2400) { step(steer(s.go)); tickBlind(); } }
    else if (s.echo) { stop(); step([{ type: 'ping' }]); }
    else if (s.wait) { stop(); for (let i = 0; i < s.wait && sim.state === 'RUNNING'; i++) step(); }
    else if ('quiet' in s) { step([{ type: 'quiet', on: !!s.quiet }]); }
  }
  stop(); let g = 0; while (sim.state === 'RUNNING' && sim.tick < maxTicks && g++ < 4000) step();
  return { sim, inputs, blind, steps, replay: makeReplay(level, inputs, profile) };
}
module.exports = { run, level, geo };
