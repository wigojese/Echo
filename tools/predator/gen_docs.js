'use strict';
// Generates docs/PREDATOR.md, docs/FAILURE_SAMPLES.md, docs/STRATEGIES.md, the transition diagram and the sample replays
// from the code and the Stage 13 test run. `--write` writes them; `--check` fails if a file differs, so a doc cannot drift from the sim.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..');
const log = console.log; console.log = () => {}; // the test file prints its own PASS lines
const T = require('../../tests/js/stage13.test.js');
console.log = log;
const { Sim, P, PROFILES, LISTENER_EDGES, runReplay } = require('../../reference/sim/sim');
const { STRATEGIES, med } = require('../strategies/strategies');
const { level: L01, geo: G01 } = require('../strategies/lib');

const out = {};
const pct = (a, b) => (100 * a / b).toFixed(0) + '%';
const f1 = (v) => (v == null ? 'none' : v.toFixed(1));

// ---------- transition diagram (SVG, no blue) ----------
// Hand layout: the four calm states in a row, CHASE as a bar under them. Edges are drawn from LISTENER_EDGES, so a missing or extra edge shows.
const X = { PATROL: 95, CURIOUS: 305, SEARCH: 515, RECOVER: 725 }, NW = 140, NH = 56, NY = 190;
function svg() {
  const A = '#d9a441', C = '#cfc9b6', M = '#8f8b7c', has = (a, b) => LISTENER_EDGES.some((e) => e.from === a && e.to === b);
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 520" font-family="Inter,Arial,sans-serif"><rect width="820" height="520" fill="#0b0d0b"/>`,
    `<defs><marker id="aC" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${C}"/></marker><marker id="aA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${A}"/></marker></defs>`,
    `<text x="24" y="30" fill="${C}" font-size="19" font-family="Georgia,serif">Listener state machine</text>`,
    `<text x="24" y="48" fill="${M}" font-size="11.5">Drawn from LISTENER_EDGES in reference/sim/sim.js. Solid cream is sound or a timer. Amber is sight and the chase.</text>`];
  const line = (d, col, dash, mk) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"${dash ? ' stroke-dasharray="6 5"' : ''} marker-end="url(#a${mk})"/>`;
  const txt = (x, y, t, col = C, anchor = 'middle', size = 11.5) => `<text x="${x}" y="${y}" fill="${col}" font-size="${size}" text-anchor="${anchor}">${t}</text>`;
  const fwd = (a, b, l1, l2) => { if (!has(a, b)) return ''; const x1 = X[a] + NW / 2, x2 = X[b] - NW / 2; return line(`M${x1 + 3} ${NY} L${x2 - 3} ${NY}`, C, false, 'C') + txt((x1 + x2) / 2, NY - 20, l1) + (l2 ? txt((x1 + x2) / 2, NY - 7, l2) : ''); };
  o.push(fwd('PATROL', 'CURIOUS', 'heard ping', 'or step'), fwd('CURIOUS', 'SEARCH', 'arrived,', 'or 7 s'), fwd('SEARCH', 'RECOVER', '2.5 s', ''));
  if (has('RECOVER', 'PATROL')) o.push(line(`M${X.RECOVER} ${NY - NH / 2 - 3} C${X.RECOVER} 62, ${X.PATROL} 62, ${X.PATROL} ${NY - NH / 2 - 3}`, C, false, 'C'), txt(410, 78, 'back on its route'));
  if (has('RECOVER', 'CURIOUS')) o.push(line(`M${X.RECOVER - 30} ${NY - NH / 2 - 3} C${X.RECOVER - 30} 112, ${X.CURIOUS + 30} 112, ${X.CURIOUS + 30} ${NY - NH / 2 - 3}`, C, false, 'C'), txt(515, 120, 'new sound'));
  if (has('SEARCH', 'CURIOUS')) o.push(line(`M${X.SEARCH - 25} ${NY + NH / 2 + 3} C${X.SEARCH - 25} 268, ${X.CURIOUS + 25} 268, ${X.CURIOUS + 25} ${NY + NH / 2 + 3}`, C, false, 'C'), txt(410, 276, 'new sound'));
  // CHASE bar
  o.push(`<rect x="25" y="352" width="770" height="58" rx="3" fill="#10130f" stroke="${A}" stroke-width="2.2"/>`, `<text x="410" y="378" fill="${A}" font-size="17" text-anchor="middle" font-family="Georgia,serif" letter-spacing="2">CHASE</text>`, txt(410, 397, '1.85 m/s. Capture only after 0.60 s of warning and 0.20 s within 0.5 m, with sight.', M, 'middle', 11.5));
  const dx = { PATROL: -25, CURIOUS: -45, SEARCH: -22, RECOVER: 0 };
  for (const n of Object.keys(X)) if (has(n, 'CHASE')) o.push(line(`M${X[n] + dx[n]} ${NY + NH / 2 + 3} L${X[n] + dx[n]} 349`, A, true, 'A'));
  o.push(`<rect x="110" y="293" width="290" height="20" fill="#0b0d0b"/>`, txt(255, 307, 'sight within 4 m for 0.20 s, from any calm state', A));
  if (has('CHASE', 'SEARCH')) o.push(line(`M${X.SEARCH + 40} 349 L${X.SEARCH + 40} ${NY + NH / 2 + 3}`, A, false, 'A'), txt(X.SEARCH + 48, 305, 'no sight', A, 'start'), txt(X.SEARCH + 48, 319, 'for 1.7 s', A, 'start'));
  for (const n of Object.keys(X)) o.push(`<rect x="${X[n] - NW / 2}" y="${NY - NH / 2}" width="${NW}" height="${NH}" rx="3" fill="#10130f" stroke="${C}" stroke-width="1.4"/><text x="${X[n]}" y="${NY - 3}" fill="${C}" font-size="15" text-anchor="middle" font-family="Georgia,serif" letter-spacing="1.5">${n}</text><text x="${X[n]}" y="${NY + 15}" fill="${M}" font-size="11" text-anchor="middle">${{ PATROL: '1.10 m/s', CURIOUS: '1.45 m/s', SEARCH: 'stands still', RECOVER: '1.10 m/s' }[n]}</text>`);
  o.push(txt(24, 470, 'Capture ends the round from CHASE. It is not a state a listener can enter any other way.', M, 'start', 12), txt(24, 488, 'The simulation throws on any change not in this table (test S13-17c).', M, 'start', 12), '</svg>');
  return o.join('\n');
}
out['reference/evidence/predator/transitions.svg'] = svg() + '\n';

// ---------- PREDATOR.md ----------
{ const L = [];
  L.push('# Listener behaviour, Stage 13', '', '_Generated by `tools/predator/gen_docs.js`. Do not edit by hand. `npm run test:stage13` fails if this file and the code disagree._', '');
  L.push('![listener state machine](../reference/evidence/predator/transitions.svg)', '');
  L.push('## Transition table', '', '| From | To | On | Guard | Exercised by |', '|---|---|---|---|---|');
  for (const e of LISTENER_EDGES) L.push(`| ${e.from} | ${e.to} | ${e.on} | ${e.guard} | ${T.seen.get(e.from + '>' + e.to) || '**NOT EXERCISED**'} |`);
  L.push('', 'The simulation throws on any change that is not in this table (test S13-17c).', '');
  L.push('## Numbers, both profiles', '', '`suspense` is the approved EC-RULESET-01 and changes nothing. `forgiving` is a proposal for you to compare. Neither profile goes below the prompt minimums of a 0.60 s warning and 0.18 s of sight.', '');
  const keys = [['patrolSpeed', 'Patrol speed (m/s)'], ['curiousSpeed', 'Investigating speed (m/s)'], ['chaseSpeed', 'Chase speed (m/s)'], ['hearingScale', 'Hearing limit scale (11 m at 1.0)'], ['curiousMaxTicks', 'Longest walk to a sound (ticks)'], ['searchTicks', 'Search at the origin (ticks)'], ['chaseLoseTicks', 'Chase lost after no sight (ticks)'], ['contactRadius', 'Sight radius (m)'], ['contactTicks', 'Sight before chase (ticks)'], ['alertTicks', 'Warning before capture (ticks)'], ['captureRadius', 'Capture radius (m)'], ['captureLosTicks', 'Contact needed to capture (ticks)'], ['footstepM', 'Footstep reach, walking (m of floor)'], ['quietNoiseFactor', 'Quiet step noise factor']];
  L.push('| Rule | suspense | forgiving |', '|---|---|---|');
  const a = new Sim(L01, G01).P, b = new Sim(L01, G01, { profile: 'forgiving' }).P;
  for (const [k, n] of keys) L.push(`| ${n} | ${a[k]} | ${b[k]}${a[k] === b[k] ? '' : ' **changed**'} |`);
  L.push('', '30 ticks are one second. Hearing limit is in weighted metres of connected floor, never straight line.', '');
  L.push('## Scenarios and what each proves', '', '| Id | What it shows |', '|---|---|');
  const rows = [['S13-04', 'Hearing an old origin: it walks to where the echo was cast while you are 9 m away. "It heard where you were, not where you are."'], ['S13-05', 'Seeing the current player: sight alone, no echo, starts a chase after 6 ticks.'], ['S13-06', 'Sealed wall: 24 echoes and 30 s next to a listener 3.2 m away through a wall cause nothing. S13-06c adds a doorway and the same inputs are heard.'], ['S13-06d', 'Hairpin: 41 positions within 4 m through a wall never chase; 28 in sight always do.'], ['S13-07', 'Capture delay: standing inside capture range, the capture still waits for the full 0.60 s.'], ['S13-07d', 'Telegraph: the alert is in the snapshot on every chase tick before a capture.'], ['S13-08', 'Lost sight: search starts after exactly 51 ticks, lasts exactly 75, then recovers.'], ['S13-09', 'A second echo moves the remembered origin and restarts the investigation.'], ['S13-10', 'Memory: it searches an old origin you have left, goes home, and never returns without a new sound.'], ['S13-10d', 'A sound heard from 11 m is investigated for 7 s, so it stops about 0.8 m short.'], ['S13-11', 'Quiet step: walking is heard at 6 m, quiet is not (reach 1.8 m). A ping is equally loud either way.'], ['S13-13', 'Explanation: built from the cause chain, identical under tampering, nothing while the round runs.']];
  for (const [i, t] of rows) L.push(`| ${i} | ${t} |`);
  out['docs/PREDATOR.md'] = L.join('\n') + '\n'; }

// ---------- FAILURE_SAMPLES.md and sample replays ----------
{ const L = ['# Failure summary samples', '', '_Generated by `tools/predator/gen_docs.js` from replays stored in `reference/replays/stage13/`. Each replay was re-run and its event log compared with the live run (test S13-15)._', '',
    'Every sample shows two things. **What the player sees** is the sentence and lesson, which use only the echo number, the warning length and your own distance to your own cast. **What Reveal adds** is the cause chain with positions, shown only after you tap "Show what it did".', ''];
  const order = ['STAYED_NEAR_ORIGIN', 'REPEATED_ECHOES', 'FOUND_ON_ROUTE', 'WALKED_INTO_VIEW', 'HEARD_STEPS'];
  for (const rule of order) { const r = T.rules[rule]; if (!r) continue;
    let sim;
    const doc = r.fixture ? { ...r.replay, fixture: r.fixture } : r.replay;
    out[`reference/replays/stage13/${rule}.json`] = JSON.stringify(doc); sim = r.fixture ? runReplay(r.fixture.level, r.fixture.geo, r.replay) : runReplay(L01, G01, r.replay);
    L.push(`## ${rule}`, '', `Source: ${r.from}${r.fixture ? ' (fixture level, not EC-L01)' : ''}.`, '');
    if (sim) { const x = sim.explain(), d = sim.explainDetail();
      L.push(`- **Sentence:** ${x.sentence}`, `- **Lesson:** ${x.lesson}`, `- **Rule:** \`${x.rule}\``, '- **What Reveal adds, from the log:**');
      for (const c of d.chain) L.push(`  - #${c.id} tick ${c.tick}: ${c.text}`);
      L.push(`- **Replay:** \`reference/replays/stage13/${rule}.json\`, ${r.replay.inputs.length} inputs${r.fixture ? ', carries its own fixture level' : ''}, replays to the same log.`, ''); } }
  L.push('## Fixture samples', '', 'REPEATED_ECHOES and HEARD_STEPS come from a fixture corridor because the EC-L01 strategy sweeps never produced them (footsteps are shadowed by sight at the default reach, see `docs/STAGE13_PREDATOR.md`). Their replays carry the fixture level inside the file.', '');
  out['docs/FAILURE_SAMPLES.md'] = L.join('\n') + '\n'; }

// ---------- STRATEGIES.md ----------
{ const L = ['# Runnable strategies for EC-L01', '', '_Generated by `tools/predator/gen_docs.js`._', '',
    'Each strategy is a fixed script: walk, echo, wait, quiet. **No script reads the listener.** The only thing varied is how long the player waits at the spawn before starting (0 to 20 s in 0.33 s steps, 61 runs), which shifts where the listener is in its patrol. A win rate is therefore "the share of start phases where this plan works", a measure of how much timing luck the plan needs. It is not a measure of people.', '',
    'Never-sensed floor is the share of the walk spent on floor no echo had revealed before the player stood on it. Closest approach is the nearest the listener got to the player over the run, from ground truth, for evaluation only.', ''];
  for (const prof of ['suspense', 'forgiving']) { const set = prof === 'suspense' ? T.sweeps : T.sweepsF;
    L.push(`## Profile: ${prof}`, '', '| Strategy | Echoes | Wins | Captured | Median time to win | Closest approach (median) | Never-sensed floor | Why it was caught |', '|---|---|---|---|---|---|---|---|');
    for (const { st, r } of set) L.push(`| ${st.name} | ${st.echoes} | ${pct(r.won, r.runs)} | ${pct(r.captured, r.runs)} | ${r.times.length ? med(r.times).toFixed(0) + ' s' : 'never'} | ${f1(med(r.closest))} m | ${r.blind.length ? pct(med(r.blind), 1) : 'n/a'} | ${Object.entries(r.rules).map(([k, v]) => `${k} x${v}`).join(', ') || 'never caught'} |`);
    L.push(''); }
  { const { sweep } = require('../strategies/strategies'); const pick = ['blind', 'quiet'].map((id) => STRATEGIES.find((x) => x.id === id));
    L.push('## Footstep reach sweep (suspense, EC-D-028)', '', 'How far a walking step is heard, in metres of connected floor. Quiet step is always 30 percent of it. Same two routes, 61 start phases each.', '', '| Reach | Blind dash wins | Quiet creep wins | Footstep hearings, both |', '|---|---|---|---|');
    for (const m of [0, 2.5, 4, 6]) { const r = pick.map((st) => sweep(st, 'suspense', { footstepM: m })); L.push(`| ${m} m${m === 2.5 ? ' (default)' : ''} | ${pct(r[0].won, r[0].runs)} | ${pct(r[1].won, r[1].runs)} | ${r[0].heardSteps + r[1].heardSteps} |`); }
    L.push(''); }
  L.push('## What each strategy tests', '', ...STRATEGIES.map((s) => `- **${s.name}.** ${s.intent}`), '');
  const sus = Object.fromEntries(T.sweeps.map(({ st, r }) => [st.id, r])), fo = Object.fromEntries(T.sweepsF.map(({ st, r }) => [st.id, r]));
  const totS = T.sweeps.reduce((n, { r }) => n + r.captured, 0), totF = T.sweepsF.reduce((n, { r }) => n + r.captured, 0), runs = T.sweeps.reduce((n, { r }) => n + r.runs, 0);
  L.push('## Reading the numbers', '',
    `- Across all ${runs} runs, suspense captures ${totS} (${pct(totS, runs)}) and forgiving captures ${totF} (${pct(totF, runs)}).`,
    `- One to three echoes win ${pct(sus.navigator.won, 61)} and ${pct(sus.bait.won, 61)} of phases in suspense, six echoes win ${pct(sus.six.won, 61)}. That fits the prompt's hypothesis that few echoes suffice and many are survivable. It is a hypothesis check on authored scripts, not evidence about players.`,
    `- Quiet creep wins only ${pct(sus.quiet.won, 61)} in suspense. At the default footstep reach (2.5 m) sight (4 m) is the real threat, so quiet step is only a slower walk on EC-L01. This is the finding to decide on (EC-D-028).`,
    `- "Echo then stand still" never wins (${pct(sus.stand.won, 61)}), by design: it is the mistake the explanation names.`, '');
  out['docs/STRATEGIES.md'] = L.join('\n') + '\n'; }

if (process.argv.includes('--write')) { for (const [f, c] of Object.entries(out)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), c); } console.log('wrote ' + Object.keys(out).length + ' files'); }
else if (process.argv.includes('--check')) { let bad = 0; for (const [f, c] of Object.entries(out)) { const p = path.join(root, f); if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== c) { console.log('DIFFERS ' + f); bad++; } } console.log(bad ? bad + ' generated files differ' : 'generated files match the code'); process.exit(bad ? 1 : 0); }
module.exports = { out };
