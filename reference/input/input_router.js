'use strict';
// Gesture ownership for both candidate control schemes. Pure logic, no DOM. Logical px at the 390x844 reference.
// A pointer owns its gesture from touch-down to release or cancel (EC-RULESET C5).
const REF = { W: 390, H: 844 };
const BASE = {
  echo: { x: 318, y: 740, r: 44, hit: 52 },           // visible radius 44, hit radius 52, so 104 px across
  quiet: { x: 72, y: 718, w: 118, h: 46 },            // 118 x 46
  pause: { x: 340, y: 54, hit: 30 },                  // 60 px across
  stickZone: { x0: 0, x1: 195, y0: 300, y1: 844 },    // joystick mode: left thumb
  trace: { x: 198, y: 718, w: 62, h: 46 },             // bottom centre chip, 62 x 46
  recenter: { x: 145, y: 44, w: 100, h: 44 },          // top centre, only while the camera is off you
  rail: { x0: 332, x1: 390, y0: 140, y1: 700 }, ret: { x: 85, y: 760, w: 220, h: 56 },   // TRACE review controls
  menu: { resume: { x: 95, y: 450, w: 200, h: 52 }, trace: { x: 95, y: 514, w: 200, h: 52 } },   // paused menu variant
  panPx: 12, pinchRatio: 1.06,
  stickRadius: 48, tapMovePx: 8, tapMs: 220, deadzone: 0.18, maxPointers: 2,
};
function layout(mirrored) {
  const L = JSON.parse(JSON.stringify(BASE));
  if (mirrored) { L.echo.x = REF.W - L.echo.x; L.quiet.x = REF.W - L.quiet.x - L.quiet.w; L.trace.x = REF.W - L.trace.x - L.trace.w; L.stickZone = { ...L.stickZone, x0: 195, x1: 390 }; }
  return L;
}

class InputRouter {
  constructor(opts = {}) { this.traceMode = false; this.traceEnabled = false; this.allowPan = false; this.pausedMenu = false; this.recenter = false; this.chipHidden = false; this.mode = opts.mode || 'waypoint'; this.mirrored = !!opts.mirrored; this.L = layout(this.mirrored); this.owners = new Map(); this.out = []; this.log = []; }
  setMode(m) { this.mode = m; this.cancelAll('mode change'); }
  setMirrored(v) { this.mirrored = !!v; this.L = layout(this.mirrored); this.cancelAll('layout change'); }
  inEcho(p) { return Math.hypot(p.x - this.L.echo.x, p.y - this.L.echo.y) <= this.L.echo.hit; }
  inQuiet(p) { const q = this.L.quiet; return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h; }
  inPause(p) { return Math.hypot(p.x - this.L.pause.x, p.y - this.L.pause.y) <= this.L.pause.hit; }
  inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  inStickZone(p) { const z = this.L.stickZone; return p.x >= z.x0 && p.x < z.x1 && p.y >= z.y0 && p.y <= z.y1; }
  emit(intent, region) { this.out.push(intent); this.log.push({ kind: intent.type, region }); } // no coordinates are logged
  drain() { const o = this.out; this.out = []; return o; }

  pointerDown(id, x, y, t) {
    if (this.owners.has(id)) return;
    if (this.owners.size >= this.L.maxPointers) { this.log.push({ kind: 'ignored', region: 'third pointer' }); return; }
    const p = { x, y };
    if (this.pausedMenu) { // paused menu variant: only its two buttons answer
      if (this.inRect(p, this.L.menu.resume)) { this.owners.set(id, { kind: 'menu' }); this.emit({ type: 'resume' }, 'menu'); }
      else if (this.traceEnabled && this.inRect(p, this.L.menu.trace)) { this.owners.set(id, { kind: 'menu' }); this.emit({ type: 'trace_enter' }, 'menu'); }
      else if (Math.hypot(p.x - this.L.pause.x, p.y - this.L.pause.y) <= this.L.pause.hit) { this.owners.set(id, { kind: 'pause' }); this.emit({ type: 'pause_toggle' }, 'pause'); }
      return; }
    if (this.traceMode) { // review: the world is paused, so Echo, Quiet and Pause are inert
      if (this.inRect(p, this.L.ret)) { this.owners.set(id, { kind: 'return' }); this.emit({ type: 'return' }, 'return'); return; }
      const r = this.L.rail; if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) { this.owners.set(id, { kind: 'rail', last: y, lastT: t }); return; }
      if (this.inEcho(p) || this.inQuiet(p) || this.inPause(p)) { this.log.push({ kind: 'blocked', region: 'paused' }); return; }
      this.startWorld(id, p, t); return; }
    if (this.recenter && this.inRect(p, this.L.recenter)) { this.owners.set(id, { kind: 'return' }); this.emit({ type: 'return' }, 'recenter'); return; }
    if (this.inEcho(p)) { this.owners.set(id, { kind: 'echo' }); this.emit({ type: 'ping' }, 'echo'); return; }
    if (this.inQuiet(p)) { this.owners.set(id, { kind: 'quiet' }); this.emit({ type: 'quiet_toggle' }, 'quiet'); return; }
    if (!this.chipHidden && this.inRect(p, this.L.trace)) { this.owners.set(id, { kind: 'trace' }); if (this.traceEnabled) this.emit({ type: 'trace_enter' }, 'trace'); else this.log.push({ kind: 'trace_unavailable', region: 'trace' }); return; }
    if (this.inPause(p)) { this.owners.set(id, { kind: 'pause' }); this.emit({ type: 'pause_toggle' }, 'pause'); return; }
    if (this.mode === 'joystick' && this.inStickZone(p) && ![...this.owners.values()].some((o) => o.kind === 'stick')) {
      this.owners.set(id, { kind: 'stick', ox: x, oy: y }); this.emit({ type: 'joystick', dx: 0, dy: 0 }, 'stick'); return; }
    this.startWorld(id, p, t);
  }
  startWorld(id, p, t) {
    const o = { kind: 'world', sx: p.x, sy: p.y, x: p.x, y: p.y, t, moved: 0, cancelled: false, panning: false };
    for (const [oid, other] of this.owners) if (other.kind === 'world') { // pinch promotion: the first finger's tap or pan is cancelled
      if (other.panning) { this.emit({ type: 'pan_end' }, 'world'); } other.cancelled = true; other.panning = false; o.cancelled = true; this.pinch = { a: oid, b: id, d: 0, begun: false }; this.log.push({ kind: 'pinch', region: 'world' }); }
    this.owners.set(id, o);
  }
  pointerMove(id, x, y, t) {
    const o = this.owners.get(id); if (!o) return;
    if (o.kind === 'stick') { let dx = (x - o.ox) / this.L.stickRadius, dy = (y - o.oy) / this.L.stickRadius; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      this.emit({ type: 'joystick', dx: +dx.toFixed(3), dy: +(-dy).toFixed(3) }, 'stick'); }
    else if (o.kind === 'rail') { this.emit({ type: 'scrub', dy: y - o.last, dt: t !== undefined && o.lastT !== undefined ? Math.max(1, t - o.lastT) : 16.7 }, 'rail'); o.last = y; o.lastT = t; }
    else if (o.kind === 'world') {
      const px = o.x, py = o.y; o.x = x; o.y = y; o.moved = Math.max(o.moved, Math.hypot(x - o.sx, y - o.sy));
      const pn = this.pinch && (this.pinch.a === id || this.pinch.b === id) ? this.pinch : null;
      if (pn && this.owners.get(pn.a) && this.owners.get(pn.b)) { const A = this.owners.get(pn.a), B = this.owners.get(pn.b), d = Math.hypot(A.x - B.x, A.y - B.y);
        if (!pn.d) pn.d = d; else { const total = d / pn.start || 1; if (!pn.begun) { pn.start = pn.start || pn.d; const r0 = d / pn.start; if (r0 > this.L.pinchRatio || r0 < 1 / this.L.pinchRatio) pn.begun = true; }
          if (pn.begun) { const ratio = d / pn.d; if (Math.abs(ratio - 1) > 1e-6) this.emit({ type: 'pinch', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, ratio: +ratio.toFixed(4) }, 'world'); pn.d = d; } } }
      else if (!o.cancelled && this.allowPan || this.traceMode) { if (!o.panning && o.moved >= this.L.panPx && (this.allowPan || this.traceMode)) { o.panning = true; } if (o.panning) this.emit({ type: 'pan', dx: x - px, dy: y - py }, 'world'); }
    }
    // echo, quiet, pause, trace and menu owners ignore movement: dragging off a button never re-targets it
  }
  pointerUp(id, x, y, t) {
    const o = this.owners.get(id); if (!o) return; this.owners.delete(id);
    if (o.kind === 'stick') this.emit({ type: 'joystick_end' }, 'stick');
    else if (o.kind === 'rail') this.emit({ type: 'scrub_end' }, 'rail');
    else if (o.kind === 'world') {
      if (this.pinch && (this.pinch.a === id || this.pinch.b === id)) { this.pinch = null; const other = [...this.owners.values()].find((q) => q.kind === 'world'); if (other) { other.cancelled = true; other.panning = false; } this.log.push({ kind: 'pinch_end', region: 'world' }); return; }
      if (o.panning) { this.emit({ type: 'pan_end' }, 'world'); return; }
      const tap = !o.cancelled && o.moved < this.L.tapMovePx && (t - o.t) <= this.L.tapMs;
      if (tap && this.mode === 'waypoint' && !this.traceMode) this.emit({ type: 'waypoint', x: o.sx, y: o.sy }, 'world');
      else this.log.push({ kind: 'world_ignored', region: o.cancelled ? 'pinch' : o.moved >= this.L.tapMovePx ? 'drag' : (t - o.t) > this.L.tapMs ? 'long press' : 'joystick mode' });
    }
  }
  // OS gesture, interruption, lock screen: nothing may sound, movement stops
  pointerCancel(id) { if (this.owners.has(id)) this.cancelAll('pointer cancel'); }
  cancelAll(reason = 'cancel') { const had = this.owners.size > 0; this.owners.clear(); this.pinch = null; this.out.push({ type: 'cancel_all' }); this.log.push({ kind: 'cancel_all', region: reason }); return had; }
}
module.exports = { InputRouter, layout, BASE, REF };
if (typeof window !== 'undefined') window.ECHO_INPUT = module.exports;
