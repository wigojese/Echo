'use strict';
// Gesture ownership for both candidate control schemes. Pure logic, no DOM. Logical px at the 390x844 reference.
// A pointer owns its gesture from touch-down to release or cancel (EC-RULESET C5).
const REF = { W: 390, H: 844 };
const BASE = {
  echo: { x: 318, y: 740, r: 44, hit: 52 },           // visible radius 44, hit radius 52, so 104 px across
  quiet: { x: 72, y: 718, w: 118, h: 46 },            // 118 x 46
  pause: { x: 340, y: 54, hit: 30 },                  // 60 px across
  stickZone: { x0: 0, x1: 195, y0: 300, y1: 844 },    // joystick mode: left thumb
  stickRadius: 48, tapMovePx: 8, tapMs: 220, deadzone: 0.18, maxPointers: 2,
};
function layout(mirrored) {
  const L = JSON.parse(JSON.stringify(BASE));
  if (mirrored) { L.echo.x = REF.W - L.echo.x; L.quiet.x = REF.W - L.quiet.x - L.quiet.w; L.stickZone = { ...L.stickZone, x0: 195, x1: 390 }; }
  return L;
}

class InputRouter {
  constructor(opts = {}) { this.mode = opts.mode || 'waypoint'; this.mirrored = !!opts.mirrored; this.L = layout(this.mirrored); this.owners = new Map(); this.out = []; this.log = []; }
  setMode(m) { this.mode = m; this.cancelAll('mode change'); }
  setMirrored(v) { this.mirrored = !!v; this.L = layout(this.mirrored); this.cancelAll('layout change'); }
  inEcho(p) { return Math.hypot(p.x - this.L.echo.x, p.y - this.L.echo.y) <= this.L.echo.hit; }
  inQuiet(p) { const q = this.L.quiet; return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h; }
  inPause(p) { return Math.hypot(p.x - this.L.pause.x, p.y - this.L.pause.y) <= this.L.pause.hit; }
  inStickZone(p) { const z = this.L.stickZone; return p.x >= z.x0 && p.x < z.x1 && p.y >= z.y0 && p.y <= z.y1; }
  emit(intent, region) { this.out.push(intent); this.log.push({ kind: intent.type, region }); } // no coordinates are logged
  drain() { const o = this.out; this.out = []; return o; }

  pointerDown(id, x, y, t) {
    if (this.owners.has(id)) return;
    if (this.owners.size >= this.L.maxPointers) { this.log.push({ kind: 'ignored', region: 'third pointer' }); return; }
    const p = { x, y };
    if (this.inEcho(p)) { this.owners.set(id, { kind: 'echo' }); this.emit({ type: 'ping' }, 'echo'); return; }
    if (this.inQuiet(p)) { this.owners.set(id, { kind: 'quiet' }); this.emit({ type: 'quiet_toggle' }, 'quiet'); return; }
    if (this.inPause(p)) { this.owners.set(id, { kind: 'pause' }); this.emit({ type: 'pause_toggle' }, 'pause'); return; }
    if (this.mode === 'joystick' && this.inStickZone(p) && ![...this.owners.values()].some((o) => o.kind === 'stick')) {
      this.owners.set(id, { kind: 'stick', ox: x, oy: y }); this.emit({ type: 'joystick', dx: 0, dy: 0 }, 'stick'); return; }
    const o = { kind: 'world', sx: x, sy: y, t, moved: 0, cancelled: false };
    for (const other of this.owners.values()) if (other.kind === 'world') { other.cancelled = true; o.cancelled = true; this.log.push({ kind: 'pinch', region: 'world' }); }
    this.owners.set(id, o);
  }
  pointerMove(id, x, y) {
    const o = this.owners.get(id); if (!o) return;
    if (o.kind === 'stick') { let dx = (x - o.ox) / this.L.stickRadius, dy = (y - o.oy) / this.L.stickRadius; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      this.emit({ type: 'joystick', dx: +dx.toFixed(3), dy: +(-dy).toFixed(3) }, 'stick'); }
    else if (o.kind === 'world') o.moved = Math.max(o.moved, Math.hypot(x - o.sx, y - o.sy));
    // echo, quiet and pause owners ignore movement: dragging off a button never re-targets it
  }
  pointerUp(id, x, y, t) {
    const o = this.owners.get(id); if (!o) return; this.owners.delete(id);
    if (o.kind === 'stick') this.emit({ type: 'joystick_end' }, 'stick');
    else if (o.kind === 'world') {
      const tap = !o.cancelled && o.moved < this.L.tapMovePx && (t - o.t) <= this.L.tapMs;
      if (tap && this.mode === 'waypoint') this.emit({ type: 'waypoint', x: o.sx, y: o.sy }, 'world');
      else this.log.push({ kind: 'world_ignored', region: o.cancelled ? 'pinch' : o.moved >= this.L.tapMovePx ? 'drag' : (t - o.t) > this.L.tapMs ? 'long press' : 'joystick mode' });
    }
  }
  // OS gesture, interruption, lock screen: nothing may sound, movement stops
  pointerCancel(id) { if (this.owners.has(id)) this.cancelAll('pointer cancel'); }
  cancelAll(reason = 'cancel') { const had = this.owners.size > 0; this.owners.clear(); this.out.push({ type: 'cancel_all' }); this.log.push({ kind: 'cancel_all', region: reason }); return had; }
}
module.exports = { InputRouter, layout, BASE, REF };
if (typeof window !== 'undefined') window.ECHO_INPUT = module.exports;
