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
const EVENTS = ['ping_cast', 'ping_rejected', 'wave_contact', 'heard_ping', 'predator_state_changed',
  'player_captured', 'exit_reached', 'level_reset', 'level_timeout'];

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
  constructor(level, geometry) {
    this.level = level; this.geometry = geometry;
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
    this.events = []; this.scheduled = new Map(); this.casts = [];
    this.trail = [[...L.player.spawn_xy]]; this.runCasts = []; this.predRoute = (L.predators || []).map((p) => [[p.spawn_xy[0], p.spawn_xy[1], 0]]); this.alertStart = -1; this.casts = []; this.mem = new Map(); this.cellMem = new Map(); this.ghosts = new Map(); this.castOrigins = []; this.exitKnown = false;
    this.lastField = null;
    this.pred = (L.predators || []).map((p) => ({ id: p.id, pos: [...p.spawn_xy], wp: p.patrol_waypoints, wpIdx: 1, state: 'PATROL',
      dest: null, lastHeardOrigin: null, lastHeardTick: -1, lastSeenPlayerTick: -1, investigationCount: 0, heardCastIds: [],
      curiousStart: -1, searchStart: -1, contactTicks: 0, alertStart: -1, lostTicks: 0, capTicks: 0, lastSeenPos: null, hearingLimit: p.hearing_cost_limit_m || P.hearingLimit }));
    // Opening breath: the starting chamber is known from tick 0 without any noise or event.
    const ob = (L.rules && L.rules.opening_breath_m) || 0;
    if (ob > 0) {
      const f = S.field(this.grid, L.player.spawn_xy[0], L.player.spawn_xy[1], ob);
      for (const e of this.edges) if (f[e.cell] !== Infinity) this.mem.set(e.id, { tick: 0, castId: 0 });
      for (let c = 0; c < f.length; c++) if (f[c] !== Infinity) this.cellMem.set(c, 0);
    }
    if (!first) this.emit('level_reset', {});
  }

  emit(kind, payload = {}) {
    if (!EVENTS.includes(kind)) throw new Error('non-semantic event: ' + kind);
    const e = { kind, tick: this.tick, payload }; this.events.push(e); return e;
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
    for (const p of this.pred) this.stepPredator(p, t);
    this.pred.forEach((p, i) => { if (t % 15 === 0 || this.state !== 'RUNNING') this.predRoute[i].push([+p.pos[0].toFixed(3), +p.pos[1].toFixed(3), t]); if (this.predRoute[i].length > 400) this.predRoute[i].shift(); });
    const chasing = this.pred.some((p) => p.state === 'CHASE'); if (chasing && this.alertStart < 0) this.alertStart = t; else if (!chasing) this.alertStart = -1;
    if (this.state === 'RUNNING') this.checkExit(t);
    if (this.state === 'RUNNING' && t + 1 >= P.timeoutTicks) { this.state = 'TIMEOUT'; this.emit('level_timeout', {}); }
    this.tick++;
  }

  movePlayer() {
    const sp = this.quiet ? P.quietSpeed : P.playerSpeed, k = Math.min(1, DT / P.smoothing);
    this.vel[0] += (this.dir[0] * sp - this.vel[0]) * k; this.vel[1] += (this.dir[1] * sp - this.vel[1]) * k;
    const mx = this.vel[0] * DT, my = this.vel[1] * DT, n = Math.max(1, Math.ceil(Math.hypot(mx, my) / 0.05));
    for (let s = 0; s < n; s++) {
      const dx = mx / n, dy = my / n; let [x, y] = this.pos;
      if (this.circleClear(x + dx, y + dy, P.playerRadius)) { x += dx; y += dy; }
      else if (this.circleClear(x + dx, y, P.playerRadius)) x += dx;
      else if (this.circleClear(x, y + dy, P.playerRadius)) y += dy;
      this.pathLen += Math.hypot(x - this.pos[0], y - this.pos[1]); this.pos = [x, y];
    }
    // breadcrumb trail: where you have actually walked, one point every 0.75 m, capped
    const lt = this.trail[this.trail.length - 1]; if (Math.hypot(this.pos[0] - lt[0], this.pos[1] - lt[1]) >= 0.75) { this.trail.push([...this.pos]); if (this.trail.length > 600) this.trail.shift(); }
  }

  ping(t) {
    if (t < this.nextPingTick) { this.emit('ping_rejected', { remainingTicks: this.nextPingTick - t }); return; }
    const castId = ++this.castCount, origin = [...this.pos];
    this.nextPingTick = t + P.cooldownTicks;
    const field = S.field(this.grid, origin[0], origin[1], S.PULSE_MAX_COST);
    this.lastField = { castId, origin, tick: t, field };
    this.casts.push({ castId, tick: t, origin, field }); this.runCasts.push({ castId, origin: [...origin], tick: t });
    this.castOrigins.push({ castId, origin, tick: t, heardTick: -1 });
    // wave contacts: wall faces become known when the front reaches the adjacent cell
    let first = Infinity, last = -Infinity, count = 0;
    for (const e of this.edges) { const c = field[e.cell]; if (c === Infinity) continue;
      const at = t + Math.ceil(c / S.PULSE_SPEED / DT); count++; first = Math.min(first, at); last = Math.max(last, at);
      this.schedule(at, () => this.mem.set(e.id, { tick: at, castId })); }
    for (let c = 0; c < field.length; c++) { if (field[c] === Infinity) continue; const at = t + Math.ceil(field[c] / S.PULSE_SPEED / DT); this.schedule(at, () => this.cellMem.set(c, at)); }
    this.emit('ping_cast', { castId, origin, edges: count, cooldownUntil: this.nextPingTick });
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
      if (c <= pr.hearingLimit) this.schedule(at, () => this.hear(pr, { castId, origin, cost: c, arrival: at }));
    }
  }

  hear(pr, h) {
    const co = this.castOrigins.find((c) => c.castId === h.castId); if (co && co.heardTick < 0) co.heardTick = h.arrival;
    pr.lastHeardOrigin = [...h.origin]; pr.lastHeardTick = h.arrival; pr.investigationCount++; pr.heardCastIds.push(h.castId);
    this.emit('heard_ping', { predator: pr.id, castId: h.castId, arrivalTick: h.arrival, weightedCost: +h.cost.toFixed(3), origin: h.origin });
    if (pr.state !== 'CHASE') { pr.dest = [...h.origin]; pr.curiousStart = this.tick; this.setState(pr, 'CURIOUS', 'heard ping ' + h.castId); }
  }

  setState(pr, to, reason) { if (pr.state === to) return; const from = pr.state; pr.state = to; this.emit('predator_state_changed', { predator: pr.id, from, to, reason }); }

  updateKnowledge(t) {
    for (const [id, m] of this.mem) if (t - m.tick > P.memoryTicks) this.mem.delete(id);
    for (const [c, k] of this.cellMem) if (t - k > P.memoryTicks) this.cellMem.delete(c);
    for (const [id, g] of this.ghosts) if (t - g.tick > P.ghostTicks) this.ghosts.delete(id);
    this.castOrigins = this.castOrigins.filter((c) => t - c.tick <= P.castOriginTicks);
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
    const seen = this.dist(pr.pos, this.pos) <= P.contactRadius && this.los(pr.pos, this.pos);
    if (seen) { pr.contactTicks++; pr.lastSeenPlayerTick = t; pr.lastSeenPos = [...this.pos]; } else pr.contactTicks = 0;
    if (pr.state !== 'CHASE' && pr.contactTicks >= P.contactTicks) {
      pr.alertStart = t; pr.lostTicks = 0; pr.capTicks = 0; this.setState(pr, 'CHASE', 'line of sight within ' + P.contactRadius + ' m for ' + P.contactTicks + ' ticks');
    }
    switch (pr.state) {
      case 'PATROL': { const w = pr.wp[pr.wpIdx]; if (this.walkToward(pr, w, P.patrolSpeed) || this.dist(pr.pos, w) < 0.15) pr.wpIdx = (pr.wpIdx + 1) % pr.wp.length; break; }
      case 'CURIOUS': { const arrived = this.walkToward(pr, pr.dest, P.curiousSpeed);
        if (arrived || t - pr.curiousStart > P.curiousMaxTicks) { pr.searchStart = t; this.setState(pr, 'SEARCH', arrived ? 'reached last heard origin' : 'investigation timed out'); } break; }
      case 'SEARCH': if (t - pr.searchStart >= P.searchTicks) { pr.dest = nearestWp(pr); this.setState(pr, 'RECOVER', 'search finished'); } break;
      case 'RECOVER': if (this.walkToward(pr, pr.dest, P.patrolSpeed)) { pr.wpIdx = pr.wp.findIndex((w) => w[0] === pr.dest[0] && w[1] === pr.dest[1]); this.setState(pr, 'PATROL', 'back on route'); } break;
      case 'CHASE': {
        if (seen) pr.lostTicks = 0; else pr.lostTicks++;
        this.walkToward(pr, seen ? this.pos : pr.lastSeenPos, P.chaseSpeed);
        if (seen && this.dist(pr.pos, this.pos) <= P.captureRadius) pr.capTicks++; else pr.capTicks = 0;
        if (pr.capTicks >= P.captureLosTicks && t - pr.alertStart >= P.alertTicks) {
          this.state = 'CAPTURED'; this.emit('player_captured', { predator: pr.id, alertStart: pr.alertStart, alertTicks: t - pr.alertStart, lastHeardOrigin: pr.lastHeardOrigin, lastHeardTick: pr.lastHeardTick, heardCastIds: [...pr.heardCastIds] });
        } else if (pr.lostTicks >= P.chaseLoseTicks) { pr.searchStart = t; this.setState(pr, 'SEARCH', 'no contact for 1.7 s'); }
        break; }
    }
    function nearestWp(p) { let b = p.wp[0], bd = Infinity; for (const w of p.wp) { const d = Math.hypot(w[0] - p.pos[0], w[1] - p.pos[1]); if (d < bd) { bd = d; b = w; } } return [...b]; }
  }

  checkExit(t) {
    const ex = this.level.goal.exit_xy;
    if (this.dist(this.pos, ex) <= P.exitRadius) this.exitTicks++; else this.exitTicks = 0;
    if (this.exitTicks >= P.exitTicks) { this.state = 'WON'; this.exitKnown = true; this.emit('exit_reached', { casts: this.castCount, ticks: t }); }
  }

  // The only world view the view layer may read. No predator positions except short-lived ghosts.
  snapshot() {
    const t = this.tick, segs = [];
    for (const [id, m] of this.mem) if (t - m.tick <= P.memoryTicks) { const e = this.edges[id]; segs.push({ id, ageTicks: t - m.tick, castId: m.castId, p: [e.x1, e.y1, e.x2, e.y2], n: [e.nx, e.ny] }); }
    segs.sort((a, b) => a.id - b.id);
    const cells = []; for (const [c, k] of this.cellMem) if (t - k <= P.memoryTicks) cells.push([c, t - k]); cells.sort((a, b) => a[0] - b[0]);
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

  // Explanation built only from the event log.
  explain() {
    const log = this.events, ev = (k) => log.filter((e) => e.kind === k);
    if (this.state === 'CAPTURED') {
      const c = ev('player_captured')[0].payload, h = ev('heard_ping').filter((e) => e.payload.castId === c.heardCastIds[c.heardCastIds.length - 1])[0];
      return { outcome: 'captured', facts: c, sentence: h
        ? `The listener heard echo ${h.payload.castId} at tick ${h.payload.arrivalTick}, walked to where it was cast, and found you after a ${(c.alertTicks / HZ).toFixed(2)} s warning.`
        : `The listener saw you in the corridor and caught you after a ${(c.alertTicks / HZ).toFixed(2)} s warning. It had not heard an echo.` };
    }
    if (this.state === 'WON') { const heard = ev('heard_ping');
      return { outcome: 'won', echoes: this.castCount, sentence: `You reached the exit after ${this.castCount} echo${this.castCount === 1 ? '' : 'es'}.` + (heard.length ? ` Echo ${heard[0].payload.castId} drew the listener toward where you cast it.` : '') }; }
    if (this.state === 'TIMEOUT') return { outcome: 'timeout', sentence: 'Time ran out. Retry starts from the same seed.' };
    return null;
  }
}

// ---------- replays ----------
function makeReplay(level, inputs) { return { format_version: 1, level_id: level.id, seed: level.seed, ruleset: 'EC-RULESET-01', dt_hz: HZ, inputs }; }
function runReplay(level, geometry, replay, maxTicks = Infinity) {
  const sim = new Sim(level, geometry), by = new Map();
  for (const i of replay.inputs) { if (!by.has(i.tick)) by.set(i.tick, []); by.get(i.tick).push(i); }
  let guard = 0; while (sim.state === 'RUNNING' && sim.tick < maxTicks && guard++ < 1e6) sim.step(by.get(sim.tick) || []);
  return sim;
}
function camera(snapshot) { return { state: 'LISTENER_FOLLOW', center: [...snapshot.player], zoom: 1.0 }; }

module.exports = { Sim, SimClock, P, HZ, DT, EVENTS, wallEdges, makeReplay, runReplay, camera };
