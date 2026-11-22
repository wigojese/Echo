'use strict';
// Turns router intents into simulation inputs. Reads only the VisibleWorldSnapshot, never ground truth.
const SCREEN = { W: 390, H: 844, K: 20 };
const screenToWorld = (p, player) => [player[0] + (p.x - SCREEN.W / 2) / SCREEN.K, player[1] - (p.y - SCREEN.H / 2) / SCREEN.K];
const worldToScreen = (w, player) => ({ x: SCREEN.W / 2 + (w[0] - player[0]) * SCREEN.K, y: SCREEN.H / 2 - (w[1] - player[1]) * SCREEN.K });

// Route only through floor the player has legitimately sensed (snapshot.cells). Never through unknown space.
function plan(snap, target) {
  const { nx, ny, cell } = snap.grid, known = new Set(snap.cells.map((c) => c[0]));
  const idx = (x, y) => Math.floor(y / cell) * nx + Math.floor(x / cell);
  const start = idx(snap.player[0], snap.player[1]); known.add(start);
  // Body clearance: a cell is usable only if every cell within the body radius is known open floor.
  const usable = (r) => { const u = new Set(); for (const k of known) { const i = k % nx, j = (k / nx) | 0; let ok = true;
      for (let dj = -r; dj <= r && ok; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny || !known.has(b * nx + a)) { ok = false; break; } } if (ok) u.add(k); } u.add(start); return u; };
  const search = (core) => { const prev = new Map([[start, -1]]), queue = [start];
    for (let h = 0; h < queue.length; h++) { const k = queue[h], i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const nk = b * nx + a; if (!core.has(nk) || prev.has(nk)) continue; if (di && dj && (!core.has(j * nx + a) || !core.has(b * nx + i))) continue; prev.set(nk, k); queue.push(nk); } } return prev; };
  let prev = search(usable(2)); if (prev.size === 1) prev = search(usable(1));
  const tIdx = idx(target[0], target[1]), targetKnown = known.has(tIdx);
  let goal = start, best = Infinity;
  if (prev.has(tIdx)) goal = tIdx; else for (const k of prev.keys()) { const d = Math.hypot((k % nx + 0.5) * cell - target[0], ((k / nx | 0) + 0.5) * cell - target[1]); if (d < best) { best = d; goal = k; } }
  const cells = []; for (let k = goal; k !== -1 && k !== start; k = prev.get(k)) cells.push(k); cells.reverse();
  const centre = (k) => [(k % nx + 0.5) * cell, ((k / nx | 0) + 0.5) * cell];
  const path = cells.map(centre);
  const out = []; for (let i = 0; i < path.length; i++) { const a = path[i - 1] || snap.player, b = path[i], c = path[i + 1]; if (c && Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-9) continue; out.push(b); }
  return { path: out, cells, truncated: !targetKnown, tail: targetKnown ? null : [path.length ? path[path.length - 1] : [...snap.player], target] };
}

class Driver {
  constructor() { this.stuckTicks = 0; this.stuckAt = null; this.stuck = 0; this.path = null; this.stick = null; this.quiet = false; this.last = [NaN, NaN]; this.plan = null; this.cancelled = 0; this.pauseToggles = 0; }
  // One call per simulation tick. Returns the inputs for that tick.
  inputsFor(sim, intents = []) {
    const ins = [], pos = sim.pos; // your own position is always known to you; the full snapshot is built only when a waypoint is planned
    const setDir = (d) => { const q = [+d[0].toFixed(2), +d[1].toFixed(2)]; if (q[0] !== this.last[0] || q[1] !== this.last[1]) { this.last = q; ins.push({ type: 'move', dx: q[0], dy: q[1] }); } };
    for (const it of intents) {
      if (it.type === 'ping') ins.push({ type: 'ping' });
      else if (it.type === 'quiet_toggle') { this.quiet = !this.quiet; ins.push({ type: 'quiet', on: this.quiet }); }
      else if (it.type === 'pause_toggle') this.pauseToggles++;
      else if (it.type === 'joystick') { this.stick = [it.dx, it.dy]; this.path = null; this.plan = null; }
      else if (it.type === 'joystick_end') { this.stick = null; setDir([0, 0]); }
      else if (it.type === 'waypoint') { this.stick = null; const snap = sim.snapshot(), r = plan(snap, screenToWorld(it, snap.player)); this.plan = r; this.path = r.path.length ? r.path.map((p) => [...p]) : null; if (!this.path) setDir([0, 0]); }
      else if (it.type === 'cancel_all') { this.cancelled++; this.stick = null; this.path = null; this.plan = null; setDir([0, 0]); }
    }
    if (this.path) { if (!this.stuckAt || Math.hypot(pos[0] - this.stuckAt[0], pos[1] - this.stuckAt[1]) > 0.05) { this.stuckAt = [...pos]; this.stuckTicks = 0; } else if (++this.stuckTicks >= 45) { this.stuck++; this.path = null; this.stuckAt = null; this.stuckTicks = 0; setDir([0, 0]); } } else { this.stuckAt = null; this.stuckTicks = 0; }
    if (this.stick) setDir(this.stick);
    else if (this.path) { while (this.path.length && Math.hypot(this.path[0][0] - pos[0], this.path[0][1] - pos[1]) < (this.path.length > 1 ? 0.45 : 0.18)) this.path.shift();
      if (!this.path.length) { this.path = null; setDir([0, 0]); } else { const p = this.path[0], dx = p[0] - pos[0], dy = p[1] - pos[1], m = Math.hypot(dx, dy) || 1; setDir([dx / m, dy / m]); } }
    return ins;
  }
}
module.exports = { Driver, plan, screenToWorld, worldToScreen, SCREEN };
if (typeof window !== 'undefined') window.ECHO_DRIVER = module.exports;
