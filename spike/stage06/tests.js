'use strict';
const os = require('os');
const S = require('./solver');
const { gridFromStrips, gridFromAscii, field, cellIndex, reachedCount, L01_STRIPS } = S;

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
}

const CELL = 0.25; // EC-RULESET-01 target acoustic cell size
const l01 = gridFromStrips(L01_STRIPS, 1.2, 24, 36, CELL);

// 1. Sealed wall: two parallel corridors 0.8 m apart, no opening anywhere.
{
  const g = gridFromStrips([[4, 6, 4, 14], [7.2, 6, 7.2, 14]], 1.2, 24, 36, CELL);
  const f = field(g, 4, 10);
  const hidden = f[cellIndex(g, 7.2, 10)];
  let leaked = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = (i + 0.5) * CELL; if (x > 6.0 && f[j * g.nx + i] !== Infinity) leaked++;
  }
  check('sealed wall: predator cell behind wall is unreached', hidden === Infinity, `cost=${hidden}`);
  check('sealed wall: zero cells reached in the far corridor', leaked === 0, `leaked=${leaked}`);
  check('sealed wall: near corridor is reached', reachedCount(f) > 100, `cells=${reachedCount(f)}`);
}

// 2. Diagonal leak: two walkable cells touching only at a corner must not conduct sound.
{
  const g = gridFromAscii(['.#', '#.'], 1);
  const f = field(g, 0.5, 0.5);
  check('diagonal corner: sound does not leak between two diagonal wall cells', f[3] === Infinity, `cost=${f[3]}`);
}

// 3. Corner delay: around a bend the weighted path is longer than the straight line.
{
  const o = [3, 8.1], t = [8, 10];
  const f = field(l01, ...o);
  const c = f[cellIndex(l01, ...t)];
  const euclid = Math.hypot(t[0] - o[0], t[1] - o[1]);
  let crossesSolid = false;
  for (let k = 0; k <= 200; k++) { const x = o[0] + (t[0] - o[0]) * k / 200, y = o[1] + (t[1] - o[1]) * k / 200; if (!l01.walk[cellIndex(l01, x, y)]) crossesSolid = true; }
  check('corner: the straight line to the target crosses solid wall', crossesSolid);
  check('corner: connected-path cost is strictly longer than the straight line', c > euclid, `cost=${c.toFixed(2)} m, straight=${euclid.toFixed(2)} m`);
  check('corner: arrival is later than a straight-line shader would claim', S.arrivalSeconds(c) > euclid / S.PULSE_SPEED, `t=${S.arrivalSeconds(c).toFixed(3)} s vs ${(euclid / S.PULSE_SPEED).toFixed(3)} s`);
}

// 4. Cost cap.
{
  const f = field(l01, 11, 17);
  let max = 0; for (const v of f) if (v !== Infinity && v > max) max = v;
  check('cap: no cell exceeds 13.5 effective m', max <= S.PULSE_MAX_COST + 1e-9, `max=${max.toFixed(3)}`);
  const far = field(l01, 3, 3)[cellIndex(l01, 20, 32)];
  check('cap: one pulse from spawn does not reach the exit', far === Infinity);
}

// 5. Determinism: identical input gives identical field.
{
  const a = field(l01, 11, 17), b = field(l01, 11, 17);
  let same = a.length === b.length; for (let i = 0; i < a.length && same; i++) if (a[i] !== b[i]) same = false;
  check('determinism: two runs give bit-identical cost fields', same);
}

// 6. Predator hearing (LISTENER, limit 11 effective m): heard from the fork, not from spawn.
{
  const pred = [13.4, 24];
  const fromFork = field(l01, 11, 17)[cellIndex(l01, ...pred)];
  const fromSpawn = field(l01, 3, 3)[cellIndex(l01, ...pred)];
  check('hearing: ping at the fork is heard by the listener', fromFork <= S.HEARING_LIMIT, `cost=${fromFork.toFixed(2)} m, arrives ${S.arrivalSeconds(fromFork).toFixed(2)} s after cast`);
  check('hearing: ping at spawn is not heard', fromSpawn === Infinity || fromSpawn > S.HEARING_LIMIT, `cost=${fromSpawn}`);
}

// 7. Cast origin is the cast position, not the later player position.
{
  const castAt = [11, 17], playerLater = [11, 13.5];
  const f = field(l01, ...castAt);
  const costToPlayerNow = f[cellIndex(l01, ...playerLater)];
  check('origin: field is rooted at the cast position (cost 0 there, 3.5 m to where the player went)', f[cellIndex(l01, ...castAt)] === 0 && Math.abs(costToPlayerNow - 3.5) < 0.4, `cost to later position=${costToPlayerNow.toFixed(2)}`);
}

// Benchmark: solver wall time in Node on this container. NOT an engine or device measurement.
function bench(grid, label, runs = 300) {
  const origins = [[3, 3], [3, 8.1], [11, 13.5], [11, 17], [19, 20], [13, 24], [19, 28], [5, 18]];
  for (let w = 0; w < 30; w++) field(grid, ...origins[w % origins.length]); // warm-up
  const t = [];
  for (let r = 0; r < runs; r++) { const o = origins[r % origins.length]; const t0 = process.hrtime.bigint(); field(grid, ...o); t.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  t.sort((a, b) => a - b);
  const q = (p) => t[Math.min(t.length - 1, Math.floor(p * t.length))];
  console.log(`BENCH ${label}: p50=${q(0.5).toFixed(3)} ms  p95=${q(0.95).toFixed(3)} ms  max=${t[t.length - 1].toFixed(3)} ms  (n=${runs}, cells=${grid.nx * grid.ny})`);
}
bench(l01, 'L01 at 0.25 m cells');
bench(gridFromStrips(L01_STRIPS, 1.2, 24, 36, 0.2), 'L01 at 0.20 m cells');

console.log(`\nHOST node ${process.version}, ${os.cpus()[0].model}, ${os.cpus().length} logical CPUs, ${process.platform}/${process.arch}`);
console.log(`RESULT ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
