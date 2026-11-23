'use strict';
// EC-RULESET-01 reference simulation (DESIGN PROPOSAL values). Deterministic, tick-based, 30 Hz.
// Executable spec for the GDScript port in game/scripts. Not an engine measurement.
const S = require('../../spike/stage06/solver');

const HZ = 30, DT = 1 / HZ;
const P = {
  playerSpeed: 1.75, quietSpeed: 1.10, playerRadius: 0.28, smoothing: 0.10,
  cooldownTicks: Math.ceil(1.25 * HZ), memoryTicks: 240, ghostTicks: 37, castOriginTicks: 240,
  patrolSpeed: 1.1, curiousSpeed: 1.45, chaseSpeed: 1.85,
  curiousMaxTicks: 210, searchTicks: 75, chaseLoseTicks: 51,
  contactRadius: 4, contactTicks: 6, alertTicks: 18, captureRadius: 0.5, captureLosTicks: 6,
  exitRadius: 0.8, exitTicks: 5, timeoutTicks: 90 * HZ, hearingLimit: S.HEARING_LIMIT,
};
P.footstepM = 2.5;        // weighted metres a walking step is heard through connected floor (EC-D-028, proposed)
P.quietNoiseFactor = 0.3; // quiet step emits 30 percent of that: the prompt's "reduced by 70%"
P.stepIntervalTicks = 5;  // footsteps are sampled at 6 Hz
P.stepRepeatTicks = 30;   // one listener acts on a footstep at most once a second
P.hearingScale = 1;
// Tuning presets for the Stage 13 gate question. 'suspense' is the approved EC-RULESET-01 and changes nothing.
const PROFILES = {
  suspense: {},
  forgiving: { chaseSpeed: 1.60, hearingScale: 0.82, curiousMaxTicks: 150, searchTicks: 60, alertTicks: 27, contactRadius: 3.2, footstepM: 1.8 },
};
const EVENTS = ['ping_cast', 'ping_rejected', 'wave_contact', 'heard_ping', 'heard_step', 'predator_state_changed',
  'player_captured', 'exit_reached', 'level_reset', 'level_timeout'];
// Every listener state change must be one of these. setState throws on anything else, and a test checks each one is exercised.
const LISTENER_EDGES = [
  { from: 'PATROL', to: 'CURIOUS', on: 'heard a ping or a footstep', guard: 'sound reached it through connected floor within its hearing limit' },
  { from: 'RECOVER', to: 'CURIOUS', on: 'heard a ping or a footstep', guard: 'same' },
  { from: 'SEARCH', to: 'CURIOUS', on: 'heard a ping or a footstep', guard: 'same: a new sound resets the investigation' },
  { from: 'CURIOUS', to: 'SEARCH', on: 'arrived or timed out', guard: 'within 0.5 m of the heard origin, or 7.0 s walking' },
  { from: 'SEARCH', to: 'RECOVER', on: 'timer', guard: '2.5 s standing at the origin' },
  { from: 'RECOVER', to: 'PATROL', on: 'arrived', guard: 'back on its route' },
  { from: 'PATROL', to: 'CHASE', on: 'sight', guard: 'line of sight over connected floor, within 4.0 m, for 6 ticks (0.20 s)' },
  { from: 'CURIOUS', to: 'CHASE', on: 'sight', guard: 'same' },
  { from: 'SEARCH', to: 'CHASE', on: 'sight', guard: 'same' },
  { from: 'RECOVER', to: 'CHASE', on: 'sight', guard: 'same' },
  { from: 'CHASE', to: 'SEARCH', on: 'lost', guard: 'no sight for 1.7 s' },
];
const EDGE_SET = new Set(LISTENER_EDGES.map((e) => e.from + '>' + e.to));

// ---------- world ----------
function wallEdges(g) {
  const out = [], ok = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.walk[j * g.nx + i] === 1, c = g.cell;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    if (!g.walk[j * g.nx + i]) continue; const x0 = i * c, y0 = j * c, x1 = x0 + c, y1 = y0 + c, cell = j * g.nx + i;
    if (!ok(i - 1, j)) out.push({ cell, x1: x0, y1: y0, x2: x0, y2: y1, nx: 1, ny: 0 });
    if (!ok(i + 1, j)) out.push({ cell, x1, y1: y0, x2: x1, y2: y1, nx: -1, ny: 0 });
    if (!ok(i, j - 1)) out.push({ cell, x1: x0, y1: y0, x2: x1, y2: y0, nx: 0, ny: 1 });
    if (!ok(i, j + 1)) out.push({ cell, x1: x0, y1, x2: x1, y2: y1, nx: 0, ny: -1 });
  }
  out.forEach((e, id) => { e.id = id; });
  return out;
}

class SimClock { // fixed tick, bounded catch-up
  constructor() { this.tick = 0; this.acc = 0; this.degraded = false; }
  advance(frameDt) { this.acc += frameDt; let n = 0; while (this.acc >= DT - 1e-12 && n < 4) { this.acc -= DT; n++; }
    if (this.acc >= DT - 1e-12) { this.degraded = true; this.acc = 0; } this.tick += n; return n; }
}

class Sim {
  constructor(level, geometry, opts = {}) {
    this.level = level; this.geometry = geometry; this.profile = opts.profile || 'suspense';
    if (!PROFILES[this.profile]) throw new Error('unknown profile ' + this.profile);
    this.P = { ...P, ...PROFILES[this.profile], ...(opts.overrides || {}) };
    const b = level.world_bounds_metres, cell = (level.rules && level.rules.acoustic_cell_m) || 0.25;
    this.grid = S.gridFromStrips(geometry.walkable_strips, geometry.half_width_m, b[2] - b[0], b[3] - b[1], cell);
    this.edges = wallEdges(this.grid);
    this.pathCache = new Map();
    this.reset(true);
  }

  reset(first = false) {
    const L = this.level;
    this.tick = 0; this.state = 'RUNNING'; this.paused = false; this.result = null;
    this.pos = [...L.player.spawn_xy]; this.vel = [0, 0]; this.dir = [0, 0]; this.quiet = false;
    this.nextPingTick = 0; this.castCount = 0; this.pathLen = 0; this.exitTicks = 0;
    this.events = []; this.nextId = 0; this.scheduled = new Map(); this.casts = [];
    this.trail = [[...L.player.spawn_xy]]; this.runCasts = []; this.predRoute = (L.predators || []).map((p) => [[p.spawn_xy[0], p.spawn_xy[1], 0]]); this.alertStart = -1; this.casts = []; this.mem = new Map(); this.cellMem = new Map(); this.everCells = new Set(); /* evaluation only, never in a snapshot */ this.ghosts = new Map(); this.castOrigins = []; this.exitKnown = false;
    this.lastField = null;
    this.pred = (L.predators || []).map((p) => ({ id: p.id, pos: [...p.spawn_xy], wp: p.patrol_waypoints, wpIdx: 1, state: 'PATROL',
      dest: null, lastHeardOrigin: null, lastHeardTick: -1, lastSeenPlayerTick: -1, investigationCount: 0, heardCastIds: [],
      curiousStart: -1, searchStart: -1, contactTicks: 0, alertStart: -1, lostTicks: 0, capTicks: 0, lastSeenPos: null, hearingLimit: (p.hearing_cost_limit_m || this.P.hearingLimit) * this.P.hearingScale, lastStateEvent: null, lastStepTick: -1e9, firstContactTick: -1 }));
    // Opening breath: the starting chamber is known from tick 0 without any noise or event.
    const ob = (L.rules && L.rules.opening_breath_m) || 0;
    if (ob > 0) {
      const f = S.field(this.grid, L.player.spawn_xy[0], L.player.spawn_xy[1], ob);
      for (const e of this.edges) if (f[e.cell] !== Infinity) this.mem.set(e.id, { tick: 0, castId: 0 });
      for (let c = 0; c < f.length; c++) if (f[c] !== Infinity) { this.cellMem.set(c, 0); this.everCells.add(c); }
    }
    if (!first) this.emit('level_reset', {});
  }

  emit(kind, payload = {}, cause = null) {
    if (!EVENTS.includes(kind)) throw new Error('non-semantic event: ' + kind);
    const e = { id: kind === 'level_reset' ? -1 : this.nextId++, kind, tick: this.tick, cause, payload }; this.events.push(e); return e; // a retry log is identical to the first run: the reset marker takes no id
  }
  schedule(tick, fn) { if (!this.scheduled.has(tick)) this.scheduled.set(tick, []); this.scheduled.get(tick).push(fn); }
  walkAt(x, y) { const g = this.grid, i = Math.floor(x / g.cell), j = Math.floor(y / g.cell); return i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.walk[j * g.nx + i] === 1; }
  circleClear(x, y, r) { if (!this.walkAt(x, y)) return false; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!this.walkAt(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false; } return true; }
  los(a, b) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 0.1)); for (let k = 0; k <= n; k++) { if (!this.walkAt(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false; } return true; }
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  // ---------- one tick ----------
  step(inputs = []) {
    if (this.state !== 'RUNNING' || this.paused) return;
    const t = this.tick;
    for (const inp of inputs) {
      if (inp.type === 'move') { let dx = inp.dx, dy = inp.dy; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } this.dir = m < 0.18 ? [0, 0] : [dx, dy]; }
      else if (inp.type === 'stop') this.dir = [0, 0];
      else if (inp.type === 'quiet') this.quiet = !!inp.on;
      else if (inp.type === 'ping') this.ping(t);
    }
    this.movePlayer();
    for (const fn of this.scheduled.get(t) || []) fn();
    this.scheduled.delete(t);
    this.updateKnowledge(t);
    this.footsteps(t);
    for (const p of this.pred) this.stepPredator(p, t);
    this.pred.forEach((p, i) => { if (t % 15 === 0 || this.state !== 'RUNNING') this.predRoute[i].push([+p.pos[0].toFixed(3), +p.pos[1].toFixed(3), t]); if (this.predRoute[i].length > 400) this.predRoute[i].shift(); });
    const chasing = this.pred.some((p) => p.state === 'CHASE'); if (chasing && this.alertStart < 0) this.alertStart = t; else if (!chasing) this.alertStart = -1;
    if (this.state === 'RUNNING') this.checkExit(t);
    if (this.state === 'RUNNING' && t + 1 >= this.P.timeoutTicks) { this.state = 'TIMEOUT'; this.emit('level_timeout', {}); }
    this.tick++;
  }

  movePlayer() {
    const sp = this.quiet ? this.P.quietSpeed : this.P.playerSpeed, k = Math.min(1, DT / this.P.smoothing);
    this.vel[0] += (this.dir[0] * sp - this.vel[0]) * k; this.vel[1] += (this.dir[1] * sp - this.vel[1]) * k;
    const mx = this.vel[0] * DT, my = this.vel[1] * DT, n = Math.max(1, Math.ceil(Math.hypot(mx, my) / 0.05));
    for (let s = 0; s < n; s++) {
      const dx = mx / n, dy = my / n; let [x, y] = this.pos;
      if (this.circleClear(x + dx, y + dy, this.P.playerRadius)) { x += dx; y += dy; }
      else if (this.circleClear(x + dx, y, this.P.playerRadius)) x += dx;
      else if (this.circleClear(x, y + dy, this.P.playerRadius)) y += dy;
      this.pathLen += Math.hypot(x - this.pos[0], y - this.pos[1]); this.pos = [x, y];
    }
    // breadcrumb trail: where you have actually walked, one point every 0.75 m, capped
    const lt = this.trail[this.trail.length - 1]; if (Math.hypot(this.pos[0] - lt[0], this.pos[1] - lt[1]) >= 0.75) { this.trail.push([...this.pos]); if (this.trail.length > 600) this.trail.shift(); }
  }

  ping(t) {
    if (t < this.nextPingTick) { this.emit('ping_rejected', { remainingTicks: this.nextPingTick - t }); return; }
    const castId = ++this.castCount, origin = [...this.pos];
    this.nextPingTick = t + this.P.cooldownTicks;
    const field = S.field(this.grid, origin[0], origin[1], S.PULSE_MAX_COST);
    this.lastField = { castId, origin, tick: t, field };
    this.casts.push({ castId, tick: t, origin, field }); this.runCasts.push({ castId, origin: [...origin], tick: t });
    this.castOrigins.push({ castId, origin, tick: t, heardTick: -1 });
    // wave contacts: wall faces become known when the front reaches the adjacent cell
    let first = Infinity, last = -Infinity, count = 0;
    for (const e of this.edges) { const c = field[e.cell]; if (c === Infinity) continue;
      const at = t + Math.ceil(c / S.PULSE_SPEED / DT); count++; first = Math.min(first, at); last = Math.max(last, at);
      this.schedule(at, () => this.mem.set(e.id, { tick: at, castId })); }
    for (let c = 0; c < field.length; c++) { if (field[c] === Infinity) continue; const at = t + Math.ceil(field[c] / S.PULSE_SPEED / DT); this.schedule(at, () => { this.cellMem.set(c, at); this.everCells.add(c); }); }
    const castEv = this.emit('ping_cast', { castId, origin, edges: count, cooldownUntil: this.nextPingTick });
    if (count) this.schedule(first, () => this.emit('wave_contact', { castId, edges: count, firstTick: first, lastTick: last }));
    // exit becomes known only if the wave really reaches it
    const ec = field[S.cellIndex(this.grid, ...this.level.goal.exit_xy)];
    if (ec !== Infinity) this.schedule(t + Math.ceil(ec / S.PULSE_SPEED / DT), () => { this.exitKnown = true; });
    // predators: hear and sense by the same connected-space field
    for (const pr of this.pred) {
      const c = field[S.cellIndex(this.grid, pr.pos[0], pr.pos[1])];
      if (c === Infinity) continue;
      const at = t + Math.ceil(c / S.PULSE_SPEED / DT);
      this.schedule(at, () => this.ghosts.set(pr.id, { pos: [...pr.pos], tick: at }));
      if (c <= pr.hearingLimit) this.schedule(at, () => this.hear(pr, { castId, origin, cost: c, arrival: at, causeId: castEv.id }));
    }
  }

  hear(pr, h) {
    const co = this.castOrigins.find((c) => c.castId === h.castId); if (co && co.heardTick < 0) co.heardTick = h.arrival;
    pr.lastHeardOrigin = [...h.origin]; pr.lastHeardTick = h.arrival; pr.investigationCount++; pr.heardCastIds.push(h.castId);
    const he = this.emit('heard_ping', { predator: pr.id, castId: h.castId, arrivalTick: h.arrival, weightedCost: +h.cost.toFixed(3), origin: h.origin }, h.causeId);
    if (pr.state !== 'CHASE') { pr.dest = [...h.origin]; pr.curiousStart = this.tick; this.setState(pr, 'CURIOUS', 'heard ping ' + h.castId, he.id, { heardEvent: he.id }); }
  }

  // Footsteps: a walking player is heard through connected floor within footstepM; quiet step is 70 percent fainter.
  // Standing still makes no sound. The listener learns where the player WAS when the step was heard, nothing more.
  footsteps(t) {
    if (t % this.P.stepIntervalTicks !== 0) return;
    if (Math.hypot(this.vel[0], this.vel[1]) < 0.3) return;
    const reach = this.P.footstepM * (this.quiet ? this.P.quietNoiseFactor : 1);
    let field = null;
    for (const pr of this.pred) {
      if (pr.state === 'CHASE' || t - pr.lastStepTick < this.P.stepRepeatTicks) continue;
      if (this.dist(pr.pos, this.pos) > reach) continue; // straight-line distance never exceeds the walked distance, so this is a safe early out
      field = field || S.field(this.grid, this.pos[0], this.pos[1], reach);
      const c = field[S.cellIndex(this.grid, pr.pos[0], pr.pos[1])];
      if (c === Infinity || c > reach) continue;
      pr.lastStepTick = t; pr.lastHeardOrigin = [...this.pos]; pr.lastHeardTick = t; pr.investigationCount++;
      const he = this.emit('heard_step', { predator: pr.id, weightedCost: +c.toFixed(3), reach: +reach.toFixed(3), quiet: this.quiet, origin: [...this.pos] });
      pr.dest = [...this.pos]; pr.curiousStart = t; this.setState(pr, 'CURIOUS', 'heard footsteps', he.id, { heardEvent: he.id });
    }
  }

  setState(pr, to, reason, cause = null, facts = null) {
    if (pr.state === to) return; const from = pr.state;
    if (!EDGE_SET.has(from + '>' + to)) throw new Error('undeclared listener transition ' + from + ' to ' + to);
    pr.state = to; const e = this.emit('predator_state_changed', { predator: pr.id, from, to, reason, ...(facts || {}) }, cause); pr.lastStateEvent = e.id; return e;
  }

  updateKnowledge(t) {
    for (const [id, m] of this.mem) if (t - m.tick > this.P.memoryTicks) this.mem.delete(id);
    for (const [c, k] of this.cellMem) if (t - k > this.P.memoryTicks) this.cellMem.delete(c);
    for (const [id, g] of this.ghosts) if (t - g.tick > this.P.ghostTicks) this.ghosts.delete(id);
    this.castOrigins = this.castOrigins.filter((c) => t - c.tick <= this.P.castOriginTicks);
    this.casts = this.casts.filter((c) => t - c.tick <= 50);
  }

  pathField(dest) { const k = S.cellIndex(this.grid, dest[0], dest[1]); let f = this.pathCache.get(k); if (!f) { f = S.field(this.grid, dest[0], dest[1], Infinity); this.pathCache.set(k, f); } return f; }
  walkToward(pr, dest, speed) {
    const g = this.grid, f = this.pathField(dest), i = Math.floor(pr.pos[0] / g.cell), j = Math.floor(pr.pos[1] / g.cell);
    if (this.dist(pr.pos, dest) < 0.05) return true;
    let best = f[j * g.nx + i], bi = i, bj = j;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= g.nx || b >= g.ny || !g.walk[b * g.nx + a]) continue;
      if (di && dj && (!g.walk[j * g.nx + a] || !g.walk[b * g.nx + i])) continue;
      const c = f[b * g.nx + a]; if (c < best) { best = c; bi = a; bj = b; } }
    const target = (bi === i && bj === j) ? dest : [(bi + 0.5) * g.cell, (bj + 0.5) * g.cell];
    const d = this.dist(pr.pos, target), step = Math.min(d, speed * DT);
    if (d > 1e-9) pr.pos = [pr.pos[0] + (target[0] - pr.pos[0]) / d * step, pr.pos[1] + (target[1] - pr.pos[1]) / d * step];
    return this.dist(pr.pos, dest) < 0.5 && (bi === i && bj === j || this.dist(pr.pos, dest) < 0.5);
  }

  stepPredator(pr, t) {
    const seen = this.dist(pr.pos, this.pos) <= this.P.contactRadius && this.los(pr.pos, this.pos);
    if (seen) { if (pr.contactTicks === 0) pr.firstContactTick = t; pr.contactTicks++; pr.lastSeenPlayerTick = t; pr.lastSeenPos = [...this.pos]; } else pr.contactTicks = 0;
    if (pr.state !== 'CHASE' && pr.contactTicks >= this.P.contactTicks) {
      // A sighting is caused by an earlier sound only while the listener is still acting on it. From PATROL or RECOVER it walked into view.
      const investigating = pr.state === 'CURIOUS' || pr.state === 'SEARCH';
      pr.alertStart = t; pr.lostTicks = 0; pr.capTicks = 0;
      this.setState(pr, 'CHASE', 'line of sight within ' + this.P.contactRadius + ' m for ' + this.P.contactTicks + ' ticks', investigating ? pr.lastStateEvent : null,
        { sight: { firstContactTick: pr.firstContactTick, distance: +this.dist(pr.pos, this.pos).toFixed(3), playerPos: [...this.pos], predatorPos: [...pr.pos] } });
    }
    switch (pr.state) {
      case 'PATROL': { const w = pr.wp[pr.wpIdx]; if (this.walkToward(pr, w, this.P.patrolSpeed) || this.dist(pr.pos, w) < 0.15) pr.wpIdx = (pr.wpIdx + 1) % pr.wp.length; break; }
      case 'CURIOUS': { const arrived = this.walkToward(pr, pr.dest, this.P.curiousSpeed);
        if (arrived || t - pr.curiousStart > this.P.curiousMaxTicks) { pr.searchStart = t; this.setState(pr, 'SEARCH', arrived ? 'reached last heard origin' : 'investigation timed out', pr.lastStateEvent, { arrived: !!arrived }); } break; }
      case 'SEARCH': if (t - pr.searchStart >= this.P.searchTicks) { pr.dest = nearestWp(pr); this.setState(pr, 'RECOVER', 'search finished', pr.lastStateEvent); } break;
      case 'RECOVER': if (this.walkToward(pr, pr.dest, this.P.patrolSpeed)) { pr.wpIdx = pr.wp.findIndex((w) => w[0] === pr.dest[0] && w[1] === pr.dest[1]); this.setState(pr, 'PATROL', 'back on route', pr.lastStateEvent); } break;
      case 'CHASE': {
        if (seen) pr.lostTicks = 0; else pr.lostTicks++;
        this.walkToward(pr, seen ? this.pos : pr.lastSeenPos, this.P.chaseSpeed);
        if (seen && this.dist(pr.pos, this.pos) <= this.P.captureRadius) pr.capTicks++; else pr.capTicks = 0;
        if (pr.capTicks >= this.P.captureLosTicks && t - pr.alertStart >= this.P.alertTicks) {
          this.state = 'CAPTURED'; this.emit('player_captured', { predator: pr.id, alertStart: pr.alertStart, alertTicks: t - pr.alertStart, lastHeardOrigin: pr.lastHeardOrigin, lastHeardTick: pr.lastHeardTick, heardCastIds: [...pr.heardCastIds], playerPos: [...this.pos], predatorPos: [...pr.pos] }, pr.lastStateEvent);
        } else if (pr.lostTicks >= this.P.chaseLoseTicks) { pr.searchStart = t; this.setState(pr, 'SEARCH', 'no contact for 1.7 s', pr.lastStateEvent, { lostTicks: pr.lostTicks, lastSeenPos: pr.lastSeenPos ? [...pr.lastSeenPos] : null }); }
        break; }
    }
    function nearestWp(p) { let b = p.wp[0], bd = Infinity; for (const w of p.wp) { const d = Math.hypot(w[0] - p.pos[0], w[1] - p.pos[1]); if (d < bd) { bd = d; b = w; } } return [...b]; }
  }

  checkExit(t) {
    const ex = this.level.goal.exit_xy;
    if (this.dist(this.pos, ex) <= this.P.exitRadius) this.exitTicks++; else this.exitTicks = 0;
    if (this.exitTicks >= this.P.exitTicks) { this.state = 'WON'; this.exitKnown = true; this.emit('exit_reached', { casts: this.castCount, ticks: t }); }
  }

  // The only world view the view layer may read. No predator positions except short-lived ghosts.
  snapshot() {
    const t = this.tick, segs = [];
    for (const [id, m] of this.mem) if (t - m.tick <= this.P.memoryTicks) { const e = this.edges[id]; segs.push({ id, ageTicks: t - m.tick, castId: m.castId, p: [e.x1, e.y1, e.x2, e.y2], n: [e.nx, e.ny] }); }
    segs.sort((a, b) => a.id - b.id);
    const cells = []; for (const [c, k] of this.cellMem) if (t - k <= this.P.memoryTicks) cells.push([c, t - k]); cells.sort((a, b) => a[0] - b[0]);
    return { tick: t, player: [...this.pos], segments: segs, cells, grid: { nx: this.grid.nx, ny: this.grid.ny, cell: this.grid.cell },
      castOrigins: this.castOrigins.map((c) => ({ castId: c.castId, origin: [...c.origin], ageTicks: t - c.tick, heardAgeTicks: c.heardTick < 0 ? null : t - c.heardTick })),
      waves: this.waves(t), trail: this.trail.map((p) => [...p]),
      alert: this.alertStart >= 0 && this.state === 'RUNNING' ? { ageTicks: t - this.alertStart } : null,
      ghosts: [...this.ghosts.values()].map((g) => ({ pos: [...g.pos], ageTicks: t - g.tick })),
      knownExit: this.exitKnown ? [...this.level.goal.exit_xy] : null };
  }

  // Incident front samples for the renderer: only cells the wave is touching right now, with the local direction of travel.
  waves(t) {
    const out = [], g = this.grid;
    for (const c of this.casts) {
      const age = t - c.tick; if (age < 0 || age > 50) continue; const front = age / HZ * S.PULSE_SPEED, F = c.field, pts = [];
      for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) { const k = j * g.nx + i, v = F[k]; if (v === Infinity || Math.abs(v - front) > 0.1 || ((i >> 1) + (j >> 1)) % 3 === 0) continue;
        const a = F[k + 1], b = F[k - 1], u = F[k + g.nx], d = F[k - g.nx]; let gx = isFinite(a) && isFinite(b) ? a - b : 0, gy = isFinite(u) && isFinite(d) ? u - d : 0; const m = Math.hypot(gx, gy) || 1; gx /= m; gy /= m;
        pts.push([+((i + 0.5) * g.cell).toFixed(3), +((j + 0.5) * g.cell).toFixed(3), +(-gy).toFixed(3), +gx.toFixed(3), +Math.max(0, 1 - v / S.PULSE_MAX_COST).toFixed(3)]); }
      out.push({ castId: c.castId, ageTicks: age, pts });
    }
    return out;
  }

  // Cheap view for the trigger watcher: only what it needs, with no wave, cell or wall data.
  watchSnapshot() { const t = this.tick; return { tick: t, player: [...this.pos], ghosts: [...this.ghosts.values()].map((g) => ({ pos: [...g.pos], ageTicks: t - g.tick })),
    castOrigins: this.castOrigins.map((c) => ({ castId: c.castId, origin: [...c.origin], ageTicks: t - c.tick, heardAgeTicks: c.heardTick < 0 ? null : t - c.heardTick })), alert: this.alertStart >= 0 && this.state === 'RUNNING' ? { ageTicks: t - this.alertStart } : null }; }

  // Post-round only. While the round is running this returns null, so the view layer cannot ask for hidden truth.
  revealTruth() {
    if (this.state === 'RUNNING') return null;
    const cap = this.events.find((e) => e.kind === 'player_captured'), pr = this.pred[0]; if (!pr) return null;
    return { route: this.predRoute[0].map((p) => [p[0], p[1]]), lastHeardOrigin: pr.lastHeardOrigin ? [...pr.lastHeardOrigin] : null, lastHeardTick: pr.lastHeardTick, heardCastIds: [...pr.heardCastIds], predatorFinal: [...pr.pos], playerFinal: [...this.pos], captured: !!cap, alertTicks: cap ? cap.payload.alertTicks : null };
  }
  // Post-round only. Your own run: every echo you cast and the full route you walked.
  summary() { if (this.state === 'RUNNING') return null; return { casts: this.runCasts.map((c) => ({ castId: c.castId, origin: [...c.origin], tick: c.tick })), trail: this.trail.map((p) => [...p]), end: [...this.pos], exit: [...this.level.goal.exit_xy], outcome: this.state }; }

  // ---------- explanation: built only from the event log ----------
  // The chain is found by following each event's `cause` back to its root. Nothing is inferred from positions the log does not hold.
  causalChain(terminal) {
    const by = new Map(this.events.map((e) => [e.id, e])), chain = [];
    for (let e = terminal, g = 0; e && g < 64; e = e.cause != null ? by.get(e.cause) : null, g++) chain.unshift(e);
    return chain;
  }
  // What the player may be told straight after a capture. Uses only: echo numbers (the player cast them), the warning length (the player saw it)
  // and the player's OWN position against their OWN cast origin. No listener position, route or timing of sight.
  explain() {
    if (this.state === 'WON') { const heard = this.events.filter((e) => e.kind === 'heard_ping');
      return { outcome: 'won', echoes: this.castCount, sentence: `You reached the exit after ${this.castCount} echo${this.castCount === 1 ? '' : 'es'}.` + (heard.length ? ` Echo ${heard[0].payload.castId} drew the listener toward where you cast it.` : '') }; }
    if (this.state === 'TIMEOUT') return { outcome: 'timeout', sentence: 'Time ran out. Retry starts from the same seed.' };
    if (this.state !== 'CAPTURED') return null;
    const cap = this.events.find((e) => e.kind === 'player_captured'), chain = this.causalChain(cap), f = cap.payload, warn = (f.alertTicks / HZ).toFixed(2);
    const root = chain.find((e) => e.kind === 'heard_ping' || e.kind === 'heard_step'), chase = chain.find((e) => e.kind === 'predator_state_changed' && e.payload.to === 'CHASE');
    const arrived = chain.some((e) => e.kind === 'predator_state_changed' && e.payload.to === 'SEARCH' && e.payload.arrived);
    let sentence, lesson = null, rule = 'NONE';
    if (!root) { const doing = chase && chase.payload.from === 'RECOVER' ? 'returning to its route' : 'patrolling';
      sentence = `The listener saw you while it was ${doing} and caught you after a ${warn} s warning.`; rule = 'WALKED_INTO_VIEW';
      lesson = 'No sound drew it: you walked into its sight. An echo shows a listener for a moment, but it also hears the echo, so choose where you cast.'; }
    else if (root.kind === 'heard_step') { sentence = `The listener heard your footsteps, walked to the spot, and found you after a ${warn} s warning.`; rule = 'HEARD_STEPS';
      lesson = this.events.some((e) => e.kind === 'heard_step' && e.payload.quiet) ? 'It heard you even on quiet step. Stand still to make no sound.' : 'It heard you walk. Quiet step makes footsteps 70 percent fainter, and standing still makes none.'; }
    else { const k = root.payload.castId, near = this.dist(f.playerPos, root.payload.origin);
      sentence = arrived ? `The listener heard echo ${k}, walked to where you cast it, and found you after a ${warn} s warning.` : `The listener heard echo ${k}, was on its way to where you cast it, and found you after a ${warn} s warning.`;
      const recent = this.events.filter((e) => e.kind === 'heard_ping' && e.tick <= cap.tick && e.tick >= (chase ? chase.tick : cap.tick) - 12 * HZ).length;
      if (recent >= 3) { rule = 'REPEATED_ECHOES'; lesson = `${recent} echoes in a row kept pulling it back. Each one tells a listener where to go.`; }
      else if (near <= 3.0) { rule = 'STAYED_NEAR_ORIGIN'; lesson = `You were still ${near.toFixed(1)} m from where you cast echo ${k}. After an echo, move away from it: the listener walks to the origin.`; }
      else { rule = 'FOUND_ON_ROUTE'; lesson = `You were ${near.toFixed(1)} m from where you cast echo ${k}, but its search reached you. Echoes pull a listener toward the route you take next.`; } }
    return { outcome: 'captured', facts: f, sentence, lesson, rule };
  }
  // Post-round only: the full chain with coordinates and the real route. The view may show this only after the player asks.
  explainDetail() {
    if (this.state === 'RUNNING') return null;
    const terminal = this.events.find((e) => e.kind === 'player_captured') || this.events.find((e) => e.kind === 'exit_reached') || this.events.find((e) => e.kind === 'level_timeout');
    if (!terminal) return null;
    return { terminal: terminal.kind, chain: this.causalChain(terminal).map((e) => ({ id: e.id, tick: e.tick, kind: e.kind, cause: e.cause, text: describeEvent(e, this.P) })) };
  }
}

function describeEvent(e, Pp) {
  const p = e.payload, sec = (t) => (t / HZ).toFixed(2) + ' s', at = (a) => '(' + a[0].toFixed(1) + ', ' + a[1].toFixed(1) + ')';
  switch (e.kind) {
    case 'ping_cast': return `You cast echo ${p.castId} at ${at(p.origin)}.`;
    case 'heard_ping': return `The listener heard echo ${p.castId}, ${p.weightedCost.toFixed(1)} m of floor away, ${sec(e.tick)} into the run.`;
    case 'heard_step': return `The listener heard your ${p.quiet ? 'quiet ' : ''}footsteps ${p.weightedCost.toFixed(1)} m away.`;
    case 'predator_state_changed': if (p.to === 'CHASE') return `It saw you ${p.sight.distance.toFixed(1)} m away. The warning began, and a capture needs at least ${(Pp.alertTicks / HZ).toFixed(2)} s of it.`;
      if (p.to === 'CURIOUS') return p.reason === 'heard footsteps' ? 'It turned toward the spot where it heard you walk.' : `It turned toward where echo ${p.reason.replace('heard ping ', '')} was cast.`;
      if (p.to === 'SEARCH') return p.from === 'CHASE' ? `It lost sight of you for ${(p.lostTicks / HZ).toFixed(1)} s and began to search.` : p.arrived ? 'It reached the spot and looked around.' : 'It gave up walking after 7 s and looked around.';
      if (p.to === 'RECOVER') return 'It finished searching and started back to its route.';
      return 'It was back on its route.';
    case 'player_captured': return `It reached you ${sec(p.alertTicks)} into the warning.`;
    default: return e.kind;
  }
}

// ---------- replays ----------
function makeReplay(level, inputs, profile = 'suspense') { const r = { format_version: 1, level_id: level.id, seed: level.seed, ruleset: 'EC-RULESET-01', dt_hz: HZ, inputs }; if (profile !== 'suspense') r.profile = profile; return r; }
function runReplay(level, geometry, replay, maxTicks = Infinity, opts = {}) {
  const sim = new Sim(level, geometry, { profile: replay.profile || 'suspense', overrides: replay.overrides, ...opts }), by = new Map();
  for (const i of replay.inputs) { if (!by.has(i.tick)) by.set(i.tick, []); by.get(i.tick).push(i); }
  let guard = 0; while (sim.state === 'RUNNING' && sim.tick < maxTicks && guard++ < 1e6) sim.step(by.get(sim.tick) || []);
  return sim;
}
function camera(snapshot) { return { state: 'LISTENER_FOLLOW', center: [...snapshot.player], zoom: 1.0 }; }

module.exports = { Sim, SimClock, P, PROFILES, LISTENER_EDGES, HZ, DT, EVENTS, wallEdges, makeReplay, runReplay, camera };
