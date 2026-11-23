'use strict';
// Named open-loop strategies for EC-L01. Each is a fixed list of steps (see lib.js), so none reads the listener.
// "intent" says what the strategy tests. These are authored scripts, not measurements of people.
const { run } = require('./lib');
const FORK = [11, 17];
const lead = [{ go: [3, 10] }, { go: [11, 10] }, { go: FORK }];
const STRATEGIES = [
  { id: 'navigator', name: 'Navigator', echoes: 3, intent: 'Three echoes at the three turns, then straight to the exit. The "1 to 3 pulses suffice" hypothesis.',
    plan: [{ go: [3, 10] }, { echo: 1 }, { go: [11, 10] }, { echo: 1 }, { go: FORK }, { echo: 1 }, { go: [19, 17] }, { go: [19, 26] }, { go: [20, 32] }] },
  { id: 'bait', name: 'Bait and run', echoes: 1, intent: 'One echo at the fork pulls the listener toward the fork while you leave by the east corridor.',
    plan: [...lead, { echo: 1 }, { go: [19, 17] }, { go: [19, 26] }, { go: [20, 32] }] },
  { id: 'blind', name: 'Blind dash', echoes: 0, intent: 'No echo at all. Needs the route known in advance, so it only exists as a replay or a second attempt.',
    plan: [...lead, { go: [19, 17] }, { go: [19, 26] }, { go: [20, 32] }] },
  { id: 'patient', name: 'Patient listener', echoes: 0, intent: 'Walk to the corridor corner, stop for five seconds, then go. Tests whether waiting alone helps without information.',
    plan: [...lead, { go: [19, 17] }, { go: [19, 20] }, { wait: 150 }, { go: [19, 26] }, { go: [20, 32] }] },
  { id: 'six', name: 'Six echoes', echoes: 6, intent: 'Echo at every chance. The "5 to 6 can remain survivable" hypothesis, and the spam failure.',
    plan: [{ go: [3, 10] }, { echo: 1 }, { wait: 38 }, { echo: 1 }, { go: [11, 10] }, { echo: 1 }, { go: FORK }, { echo: 1 }, { go: [19, 17] }, { echo: 1 }, { go: [19, 22] }, { echo: 1 }, { go: [19, 26] }, { go: [20, 32] }] },
  { id: 'junction', name: 'Echo at the junction', echoes: 1, intent: 'Casting beside the listener corridor. Shows the cost of an echo in the wrong place.',
    plan: [...lead, { go: [19, 17] }, { go: [19, 23] }, { echo: 1 }, { go: [19, 26] }, { go: [20, 32] }] },
  { id: 'quiet', name: 'Quiet creep', echoes: 0, intent: 'Quiet step past the listener corridor. Quiet is slower, so the exposure is longer.',
    plan: [...lead, { go: [19, 17] }, { quiet: true }, { go: [19, 26] }, { quiet: false }, { go: [20, 32] }] },
  { id: 'stand', name: 'Echo then stand still', echoes: 1, intent: 'Echo at the fork and wait there. The mistake the explanation should name.',
    plan: [...lead, { echo: 1 }, { wait: 900 }] },
];

// Sweep the wait at the spawn over one full listener patrol cycle and a bit, so the listener starts every phase.
const DELAYS = []; for (let d = 0; d <= 600; d += 10) DELAYS.push(d);
function sweep(strategy, profile = 'suspense', overrides) {
  const out = { id: strategy.id, profile, runs: 0, won: 0, captured: 0, timeout: 0, rules: {}, casts: [], times: [], closest: [], blind: [], heardSteps: 0, samples: {} };
  for (const d of DELAYS) {
    const r = run(strategy.plan, { delay: d, profile, overrides }), s = r.sim; out.runs++;
    out.heardSteps += s.events.filter((e) => e.kind === 'heard_step').length;
    if (s.state === 'WON') { out.won++; out.times.push(s.tick / 30); out.casts.push(s.castCount); out.blind.push(r.blind / Math.max(1, r.steps)); }
    else if (s.state === 'CAPTURED') { out.captured++; const x = s.explain(); out.rules[x.rule] = (out.rules[x.rule] || 0) + 1; if (!out.samples[x.rule]) out.samples[x.rule] = { delay: d, replay: r.replay }; }
    else out.timeout++;
    // closest approach of the listener to the player, measured from ground truth (evaluation only)
    let c = Infinity; for (const rt of s.predRoute[0]) c = Math.min(c, Math.hypot(rt[0] - s.pos[0], rt[1] - s.pos[1])); out.closest.push(c);
  }
  return out;
}
const med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
module.exports = { STRATEGIES, DELAYS, sweep, med };
