'use strict';
// CameraDirector for EC-RULESET C1 to C3. Reads only the VisibleWorldSnapshot. Never reads ground truth.
// Implemented states: INTRO_DROP, LISTENER_FOLLOW, MANUAL_REFRAME, KNOWN_PATH_SCROLL. The rest belong to Stage 12.
const Z = { min: 0.60, max: 1.75, closeEnter: 1.42, closeLeave: 1.28, memEnter: 0.78, memLeave: 0.90, base: 20 };
const CAMSCREEN = { W: 390, H: 844 }, PY = CAMSCREEN.H / 2, RAIL_LEN = 560;
const TIMES = { intro: 450, pullback: 350, release: 220, recenter: 350, fade: 120 };
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function nextBand(band, z) {
  if (band === 'close') return z > Z.closeLeave ? 'close' : (z <= Z.memEnter ? 'memory' : 'active');
  if (band === 'memory') return z < Z.memLeave ? 'memory' : (z >= Z.closeEnter ? 'close' : 'active');
  return z >= Z.closeEnter ? 'close' : z <= Z.memEnter ? 'memory' : 'active';
}
function simplify(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts.map((p) => [...p]);
  const d = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = clamp(t, 0, 1); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
  let mi = -1, md = 0; for (let i = 1; i < pts.length - 1; i++) { const v = d(pts[i], pts[0], pts[pts.length - 1]); if (v > md) { md = v; mi = i; } }
  if (md <= tol) return [[...pts[0]], [...pts[pts.length - 1]]];
  const l = simplify(pts.slice(0, mi + 1), tol), r = simplify(pts.slice(mi), tol); return l.slice(0, -1).concat(r);
}
// Polyline through the waypoints with each corner rounded by a quadratic Bezier. Arc-length sampled.
function buildPath(wps, r = 0.6, step = 0.25) {
  const out = [];
  const push = (p) => { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-9) out.push([p[0], p[1]]); };
  push(wps[0]);
  for (let i = 1; i < wps.length - 1; i++) {
    const a = wps[i - 1], b = wps[i], c = wps[i + 1], la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]), rr = Math.min(r, la / 2, lc / 2);
    const p0 = [b[0] + (a[0] - b[0]) / la * rr, b[1] + (a[1] - b[1]) / la * rr], p2 = [b[0] + (c[0] - b[0]) / lc * rr, b[1] + (c[1] - b[1]) / lc * rr];
    const n = Math.max(2, Math.ceil(rr * 2 / step)); for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p2[1]]); } }
  push(wps[wps.length - 1]);
  // resample at even arc length
  const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / step)), pts = [];
  for (let k = 0; k <= n; k++) { const s = L * k / n; let j = 1; while (j < cum.length - 1 && cum[j] < s) j++; const t = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1); pts.push([lerp(out[j - 1][0], out[j][0], t), lerp(out[j - 1][1], out[j][1], t), s]); }
  return { pts, L };
}

class CameraDirector {
  constructor(o = {}) {
    this.reducedMotion = !!o.reducedMotion; this.zoom = 1; this.band = 'active'; this.off = [0, 0]; this.steering = false; this.fade = 0; this.anim = null; this.trace = null; this.traceOff = [0, 0]; this.state = 'LISTENER_FOLLOW'; this.zm = 1; this.nudge = [0, 0];
    if (o.intro !== false) { this.zoom = 1.25; this.state = 'INTRO_DROP'; this.begin({ zoom: 1.0 }, TIMES.intro, 'intro'); }
  }
  get K() { return Z.base * this.zoom * this.zm; }
  // Transient view effects (threat zoom, known-contact nudge). They never change the real zoom, the band or the offsets.
  setTransient(o = {}) { this.zm = o.zoomMul ?? 1; this.nudge = o.nudge ?? [0, 0]; }
  startIntro() { if (this.reducedMotion) { this.zoom = 1; this.state = 'LISTENER_FOLLOW'; this.fade = 1; this.anim = { t: 0, dur: TIMES.fade, kind: 'fade' }; return; } this.zoom = 1.25; this.state = 'INTRO_DROP'; this.begin({ zoom: 1.0 }, TIMES.intro, 'intro'); }
  // ---- transitions ----
  begin(to, dur, kind) {
    const from = { zoom: this.zoom, off: [...this.off], toff: [...this.traceOff], s: this.trace ? this.trace.s : 0 };
    if (this.reducedMotion) { this.apply({ ...from, ...to }, 1); this.fade = 1; this.anim = { t: 0, dur: TIMES.fade, kind: 'fade', done: to.done }; this.finish(kind); return; }
    this.anim = { t: 0, dur, kind, from, to }; }
  apply(st, e, raw) { // interpolate from this.anim.from to a target
    const f = this.anim && this.anim.from ? this.anim.from : st, t = st;
    if (this.anim && this.anim.kind === 'pullback' && raw !== undefined) this.zoom = raw < 0.15 ? lerp(f.zoom, 1.05, ease(raw / 0.15)) : lerp(1.05, t.zoom, ease((raw - 0.15) / 0.85)); // small push-in, then the pullback
    else this.zoom = lerp(f.zoom, t.zoom ?? f.zoom, e); if (t.off) this.off = [lerp(f.off[0], t.off[0], e), lerp(f.off[1], t.off[1], e)]; if (t.toff) this.traceOff = [lerp(f.toff[0], t.toff[0], e), lerp(f.toff[1], t.toff[1], e)]; if (t.s !== undefined && this.trace) this.trace.s = lerp(f.s, t.s, e); this.band = nextBand(this.band, this.zoom); }
  finish(kind) { if (kind === 'intro') this.state = 'LISTENER_FOLLOW'; else if (kind === 'return') { this.state = 'LISTENER_FOLLOW'; this.trace = null; this.off = [0, 0]; this.traceOff = [0, 0]; } }
  tick(dtMs) {
    if (this.release_) { const r = this.release_; r.t += dtMs; const k = Math.max(0, 1 - r.t / TIMES.release); if (this.trace) this.trace.s = clamp(this.trace.s + r.v * (dtMs / 1000) * k, 0, this.trace.L); if (r.t >= TIMES.release) { this.release_ = null; if (this.trace) this.trace.vel = 0; } }
    if (!this.anim) return; const a = this.anim; a.t += dtMs;
    if (a.kind === 'fade') { this.fade = Math.max(0, 1 - a.t / a.dur); if (a.t >= a.dur) { this.fade = 0; this.anim = null; } return; }
    const raw = clamp(a.t / a.dur, 0, 1), e = ease(raw); this.apply(a.to, e, raw); if (a.t >= a.dur) { const k = a.kind; this.anim = null; this.finish(k); } }
  // ---- inputs ----
  steer(active) { this.steering = !!active; if (active && this.state === 'INTRO_DROP') { this.anim = null; this.state = 'LISTENER_FOLLOW'; this.zoom = 1; } if (active && this.state === 'MANUAL_REFRAME') this.returnToListener(); }
  pinch(anchor, ratio) {
    if (this.state === 'INTRO_DROP') { this.anim = null; this.state = 'LISTENER_FOLLOW'; this.zoom = 1; }
    if (this.anim && this.anim.kind === 'return') return; const before = this.zoom, nz = clamp(before * ratio, Z.min, Z.max); if (nz === before) return;
    const a = this.steering && this.state !== 'KNOWN_PATH_SCROLL' ? { x: CAMSCREEN.W / 2, y: PY } : anchor, c = this.center(this.snap_), K0 = Z.base * before * this.zm, K1 = Z.base * nz * this.zm;
    const wx = c[0] + (a.x - CAMSCREEN.W / 2) / K0, wy = c[1] - (a.y - PY) / K0; this.zoom = nz; this.band = nextBand(this.band, nz);
    const cx = wx - (a.x - CAMSCREEN.W / 2) / K1, cy = wy + (a.y - PY) / K1;
    if (this.state === 'KNOWN_PATH_SCROLL') { const p = this.pathPoint(); this.traceOff = [cx - p[0], cy - p[1]]; }
    else { const pl = this.snap_.player; this.off = [cx - pl[0], cy - pl[1]]; if (this.state === 'LISTENER_FOLLOW' && !this.steering) this.state = 'MANUAL_REFRAME'; } }
  pan(dx, dy) { if (this.steering || this.anim && this.anim.kind !== 'fade') return false; const K = this.K;
    if (this.state === 'KNOWN_PATH_SCROLL') { this.traceOff = [this.traceOff[0] - dx / K, this.traceOff[1] + dy / K]; return true; }
    if (this.state === 'LISTENER_FOLLOW' || this.state === 'MANUAL_REFRAME') { this.off = [this.off[0] - dx / K, this.off[1] + dy / K]; this.state = 'MANUAL_REFRAME'; return true; } return false; }
  traceAvailable(snap) { const wps = simplify([...snap.trail, snap.player], 0.4); return wps.length >= 3 && snap.segments.length > 0; }
  enterTrace(snap) {
    this.snap_ = snap; if (this.state === 'KNOWN_PATH_SCROLL' || !this.traceAvailable(snap)) return false;
    const wps = simplify([...snap.trail, snap.player], 0.4), path = buildPath(wps); this.trace = { path, L: path.L, s: path.L, vel: 0, wps, labels: [] };
    this.traceOff = [0, 0]; this.off = [0, 0]; this.state = 'KNOWN_PATH_SCROLL'; this.begin({ zoom: 0.72 }, TIMES.pullback, 'pullback'); return true; }
  scrub(dyPx, dtMs) { if (!this.trace) return 0; const dt = Math.max(dtMs, 1) / 1000, vmax = CAMSCREEN.W / this.K; const want = dyPx / RAIL_LEN * this.trace.L, ds = clamp(want, -vmax * dt, vmax * dt);
    this.trace.s = clamp(this.trace.s + ds, 0, this.trace.L); this.trace.vel = ds / dt; this.release_ = null; return ds / dt; }
  release() { if (this.trace) this.release_ = { t: 0, v: this.trace.vel }; }
  returnToListener() { if (this.state === 'LISTENER_FOLLOW' || this.state === 'INTRO_DROP') return;
    const to = { zoom: 1.0, off: [0, 0] }; if (this.state === 'KNOWN_PATH_SCROLL') { const c = this.center(this.snap_), pl = this.snap_.player; this.off = [c[0] - pl[0], c[1] - pl[1]]; this.traceOff = [0, 0]; this.trace.frozenFrom = c; this.state = 'MANUAL_REFRAME'; }
    this.release_ = null; this.begin(to, TIMES.recenter, 'return'); }
  // ---- read ----
  pathPoint() { const t = this.trace, s = clamp(t.s, 0, t.L), pts = t.path.pts; let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][2] < s) lo = m; else hi = m; } const a = pts[lo], b = pts[hi], u = (s - a[2]) / ((b[2] - a[2]) || 1); return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; }
  center(snap) { this.snap_ = snap || this.snap_; if (this.state === 'KNOWN_PATH_SCROLL' && this.trace) { const p = this.pathPoint(); return [p[0] + this.traceOff[0], p[1] + this.traceOff[1]]; } const pl = this.snap_.player, n = this.state === 'LISTENER_FOLLOW' ? this.nudge : [0, 0]; return [pl[0] + this.off[0] + n[0], pl[1] + this.off[1] + n[1]]; }
  frame(snap) {
    const c = this.center(snap), K = this.K, tf = { worldToScreen: (w) => ({ x: CAMSCREEN.W / 2 + (w[0] - c[0]) * K, y: PY - (w[1] - c[1]) * K }), screenToWorld: (p) => [c[0] + (p.x - CAMSCREEN.W / 2) / K, c[1] - (p.y - PY) / K] };
    const ps = tf.worldToScreen(snap.player), m = 24, inside = ps.x >= m && ps.x <= CAMSCREEN.W - m && ps.y >= m && ps.y <= CAMSCREEN.H - m;
    let off = null; if (!inside) { const cx = CAMSCREEN.W / 2, cy = PY, ang = Math.atan2(ps.y - cy, ps.x - cx); off = { angle: ang, metres: Math.hypot(snap.player[0] - c[0], snap.player[1] - c[1]) }; }
    let labels = []; if (this.state === 'KNOWN_PATH_SCROLL' && this.trace) labels = snap.castOrigins.map((o) => { let best = 0, bd = Infinity; for (const p of this.trace.path.pts) { const d = Math.hypot(p[0] - o.origin[0], p[1] - o.origin[1]); if (d < bd) { bd = d; best = p[2]; } } return { castId: o.castId, s: best, ageTicks: o.ageTicks, origin: o.origin }; });
    return { state: this.state, center: c, zoom: this.zoom, K, band: this.band, fade: this.fade, pauseSim: this.state === 'KNOWN_PATH_SCROLL', playerScreen: ps, playerVisible: inside, offscreen: off, trace: this.trace ? { s: this.trace.s, L: this.trace.L, labels, pathPts: this.trace.path.pts, wps: this.trace.wps } : null, ...tf };
  }
}
module.exports = { CameraDirector, Z, SCREEN: CAMSCREEN, PY, TIMES, RAIL_LEN, nextBand, simplify, buildPath };
if (typeof window !== 'undefined') window.ECHO_CAMERA = module.exports;
