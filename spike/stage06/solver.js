'use strict';
// Engine-neutral reference of the EC-RULESET-01 acoustic field solver (DESIGN PROPOSAL values).
// Not an engine measurement. Same algorithm every engine candidate must reproduce.

const PULSE_SPEED = 9.0;      // effective game m/s
const PULSE_MAX_COST = 13.5;  // effective m
const HEARING_LIMIT = 11.0;   // effective m, LISTENER profile

function distToSegment(px, py, a, b, c, d) {
  const dx = c - a, dy = d - b, l = dx * dx + dy * dy;
  let t = l ? ((px - a) * dx + (py - b) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a + t * dx), py - (b + t * dy));
}

// Walkable surface = union of centreline strips (same polygon source feeds collision and sound).
function gridFromStrips(strips, half, worldW, worldH, cell) {
  const nx = Math.round(worldW / cell), ny = Math.round(worldH / cell);
  const walk = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
    for (const s of strips) if (distToSegment(x, y, ...s) <= half) { walk[j * nx + i] = 1; break; }
  }
  return { nx, ny, cell, walk };
}

function gridFromAscii(rows, cell = 1) { // '.' walkable, '#' solid; row 0 is y = 0
  const ny = rows.length, nx = rows[0].length, walk = new Uint8Array(nx * ny);
  rows.forEach((r, j) => [...r].forEach((ch, i) => { walk[j * nx + i] = ch === '.' ? 1 : 0; }));
  return { nx, ny, cell, walk };
}

// Bounded weighted Dijkstra. Deterministic tie-break by cell id. No diagonal corner cutting.
function field(g, ox, oy, maxCost = PULSE_MAX_COST) {
  const { nx, ny, cell, walk } = g;
  const ok = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && walk[j * nx + i] === 1;
  const cost = new Float64Array(nx * ny).fill(Infinity);
  const heap = [];
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (c, k) => { heap.push([c, k]); let n = heap.length - 1;
    while (n > 0) { const p = (n - 1) >> 1; if (!less(heap[n], heap[p])) break; [heap[n], heap[p]] = [heap[p], heap[n]]; n = p; } };
  const pop = () => { const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let n = 0;
      for (;;) { const a = 2 * n + 1, b = a + 1; let m = n;
        if (a < heap.length && less(heap[a], heap[m])) m = a;
        if (b < heap.length && less(heap[b], heap[m])) m = b;
        if (m === n) break; [heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } }
    return top; };
  const si = Math.floor(ox / cell), sj = Math.floor(oy / cell);
  if (!ok(si, sj)) return cost;
  const s = sj * nx + si; cost[s] = 0; push(0, s);
  while (heap.length) {
    const [c, k] = pop(); if (c > cost[k]) continue;
    const i = k % nx, j = (k / nx) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj; if (!ok(a, b)) continue;
      if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue; // no sound leaking between two diagonal wall cells
      const nc = c + cell * (di && dj ? Math.SQRT2 : 1); if (nc > maxCost) continue;
      const nk = b * nx + a; if (nc < cost[nk]) { cost[nk] = nc; push(nc, nk); }
    }
  }
  return cost;
}

const cellIndex = (g, x, y) => Math.floor(y / g.cell) * g.nx + Math.floor(x / g.cell);
const arrivalSeconds = (c) => c / PULSE_SPEED;
const reachedCount = (cost) => { let n = 0; for (const v of cost) if (v !== Infinity) n++; return n; };

const L01_STRIPS = [[3,3,3,10],[3,10,11,10],[11,10,11,17],[11,17,19,17],[19,17,19,26],[19,26,20,32],
  [11,17,5,17],[5,17,5,19],[11,17,11,24],[11,24,19,24],[11,24,11,29],[19,17,22,17]];

module.exports = { PULSE_SPEED, PULSE_MAX_COST, HEARING_LIMIT, gridFromStrips, gridFromAscii, field, cellIndex,
  arrivalSeconds, reachedCount, L01_STRIPS };
