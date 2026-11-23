'use strict';
// The eight signature transitions (EC-RULESET C4). View layer only: nothing here is ever read by the simulation.
// Render-time transitions are driven by real elapsed milliseconds. Contact truth (the incident front, memory ages,
// the alert onset, the capture freeze) is driven by simulation ticks and only *started* by the events below.
const EASE = { linear: (t) => t, outCubic: (t) => 1 - Math.pow(1 - t, 3), inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 };
const clampT = (v) => Math.max(0, Math.min(1, v)), lerpT = (a, b, t) => a + (b - a) * t;

const SPECS = {
  T1: { id: 'T1', name: 'Wordmark to listener', trigger: 'Begin tapped, first time only', oncePerSession: true, durMs: 480, easing: 'inOutCubic', clock: 'render time',
    start: 'ECHO wordmark at full size, centred, opacity 1', end: 'wordmark gone, listener glyph at the player',
    keyframes: [{ t: 0, scale: 1, alpha: 1 }, { t: 0.5, scale: 0.55, alpha: 1 }, { t: 0.7, scale: 0.3, alpha: 1 }, { t: 1, scale: 0.1, alpha: 0 }],
    midpoint: 'the wordmark at about half size, its strokes drawing in toward the player', pairing: { haptic: 'none', sound: 'ui_begin' },
    skip: 'any tap finishes it within one frame', cancel: 'snap-end', reduced: 'opacity swap over 120 ms, no movement', fallback: 'if the wordmark cannot draw, show the glyph at once' },
  T2: { id: 'T2', name: 'Opening breath', trigger: 'level start', durMs: 450, easing: 'inOutCubic', clock: 'render time',
    start: 'camera zoom 1.25, starting chamber contour at opacity 0', end: 'camera zoom 1.0, contour at its normal age colour',
    keyframes: [{ t: 0, zoom: 1.25, contour: 0 }, { t: 0.33, zoom: 1.17, contour: 1 }, { t: 1, zoom: 1.0, contour: 1 }],
    midpoint: 'the starting chamber outlined, camera still settling', pairing: { haptic: 'none', sound: 'ambient_in' },
    skip: 'steering or a pinch ends it at once', cancel: 'snap-end', reduced: 'zoom 1.0 at once with a 120 ms fade', fallback: 'start at zoom 1.0' },
  T3: { id: 'T3', name: 'Cast to incident front', trigger: 'Echo pressed and accepted by the simulation', durMs: 70, easing: 'outCubic', clock: 'press: render time. Front: simulation ticks',
    start: 'Echo aperture at full size', end: 'Echo aperture back at full size, front already travelling',
    keyframes: [{ t: 0, aperture: 1 }, { t: 0.5, aperture: 0.82 }, { t: 1, aperture: 1 }],
    midpoint: 'the aperture compressed by 18 percent while the origin scar is already on the plate', pairing: { haptic: 'tick', sound: 'cast' },
    skip: 'not skippable and never blocks input: 70 ms', cancel: 'snap-end', reduced: 'no compression, the scar appears at once', fallback: 'draw the scar without the aperture animation' },
  T4: { id: 'T4', name: 'Known-contact camera nudge', trigger: 'a creature or heard cue newly appears on screen, while you are not steering', minGapMs: 500, durMs: 180, settleMs: 250, easing: 'outCubic', clock: 'render time',
    start: 'camera on the player', end: 'camera back on the player after drifting at most 0.2 of the viewport toward the revealed shape',
    keyframes: [{ t: 0, offset: 0 }, { t: 1, offset: 1 }, { t: 1.8, offset: 1 }, { t: 3.2, offset: 0 }],
    midpoint: 'the camera part-way toward a shape that is already drawn', pairing: { haptic: 'none', sound: 'none' },
    skip: 'steering cancels it in one frame', cancel: 'snap-rest', reduced: 'disabled: no camera drift', fallback: 'no nudge' },
  T5: { id: 'T5', name: 'Memory pullback', trigger: 'Trace tapped', durMs: 350, easing: 'inOutCubic', clock: 'render time (the world is paused)',
    start: 'camera zoom 1.0 on the player', end: 'zoom 0.72 on the route, labels visible',
    keyframes: [{ t: 0, zoom: 1.0 }, { t: 0.15, zoom: 1.05 }, { t: 1, zoom: 0.72 }],
    midpoint: 'strokes thinning, halo and fringe fading as the zoom crosses 0.9 to 0.78', pairing: { haptic: 'none', sound: 'trace_in' },
    skip: 'Return cancels it and glides back', cancel: 'snap-rest', reduced: 'jump to zoom 0.72 with a 120 ms fade', fallback: 'jump to the final view' },
  T6: { id: 'T6', name: 'Threat encounter', trigger: 'a listener starts a chase (the alert). Not positional', minGapMs: 1000, durMs: 120, settleMs: 400, easing: 'outCubic', clock: 'onset: simulation tick. Look: render time',
    start: 'camera zoom 1.0, no amber', end: 'zoom back at 1.0, a steady amber edge while the alert lasts',
    keyframes: [{ t: 0, zoom: 1.0, flicker: 0 }, { t: 1, zoom: 1.08, flicker: 0.35 }, { t: 4.3, zoom: 1.0, flicker: 0 }],
    midpoint: 'a single soft amber rise, the view 4 percent closer', pairing: { haptic: 'pulse', sound: 'threat_alert' },
    skip: 'never blocks input. Ends by itself', cancel: 'snap-rest', reduced: 'no zoom and no flicker: a static amber edge only', fallback: 'static amber edge' },
  T7: { id: 'T7', name: 'Failure explanation', trigger: 'capture, then the player taps Reveal', durMs: 500, easing: 'inOutCubic', clock: 'the world is frozen. Reveal: render time',
    start: 'scene dimmed 45 percent, nothing hidden drawn', end: 'the listener\'s real route and your echoes drawn, labelled as an explanation view',
    keyframes: [{ t: 0, reveal: 0 }, { t: 0.5, reveal: 0.5 }, { t: 1, reveal: 1 }],
    midpoint: 'half of the real route drawn from the old echo origin', pairing: { haptic: 'none', sound: 'explain' },
    skip: 'any tap finishes it', cancel: 'snap-end', reduced: 'route appears at once with a 120 ms fade', fallback: 'show the sentence without the route' },
  T8: { id: 'T8', name: 'Success reconstruction', trigger: 'exit reached', durMs: 650, easing: 'inOutCubic', clock: 'the world is frozen. Look: render time',
    start: 'scene dimmed to 80 percent, your echoes as rings where you cast them', end: 'one inked line from entry to exit, then a small glyph',
    keyframes: [{ t: 0, ink: 0 }, { t: 0.25, ink: 0 }, { t: 0.85, ink: 1 }, { t: 1, ink: 1 }],
    midpoint: 'the line drawn about halfway from the entry', pairing: { haptic: 'tick', sound: 'success' },
    skip: 'any tap finishes it within 150 ms. Retry and Next are live from the first frame', cancel: 'snap-end', reduced: 'finished line at once with a 120 ms fade', fallback: 'show the result without the line' },
};
const REDUCED_MS = 120;

class Transitions {
  constructor(o = {}) { this.reduced = !!o.reducedMotion; this.state = {}; this.cues = []; this.nowMs = 0; for (const id of Object.keys(SPECS)) this.state[id] = { active: false, t: 0, data: null, done: false }; this.t7 = { dim: 0, revealed: false }; this.last = {}; this.used = new Set(); }
  spec(id) { return SPECS[id]; }
  dur(id) { const s = SPECS[id]; if (this.reduced) return REDUCED_MS; return s.durMs + (s.settleMs || 0); }
  start(id, data = null) {
    const st = this.state[id], s = SPECS[id];
    if (this.reduced && id === 'T4') return false; // optional drift is off under reduced motion
    if (s.oncePerSession && this.used.has(id)) return false; if (s.minGapMs && this.last[id] !== undefined && this.nowMs - this.last[id] < s.minGapMs) return false; // a repeated alert can never become a strobe
    this.used.add(id); this.last[id] = this.nowMs;
    st.active = true; st.t = 0; st.done = false; st.data = data; this.cues.push({ at: this.nowMs, id, haptic: s.pairing.haptic, sound: s.pairing.sound });
    if (id === 'T7') { this.t7.revealed = false; st.t = 0; }
    return true; }
  // T7 has two stages: the dim happens at capture, the reveal only on the player's explicit tap.
  reveal() { const st = this.state.T7; if (!st.active) this.start('T7'); this.t7.revealed = true; st.t = 0; this.t7.started = true; }
  cancel(id) { const st = this.state[id], s = SPECS[id]; if (!st.active) return; if (s.cancel === 'snap-end') { st.t = this.dur(id); st.done = true; if (id !== 'T7' && id !== 'T8') st.active = false; } else { st.active = false; st.t = 0; st.done = false; } }
  skip(id) { const st = this.state[id]; if (!st.active) return; st.t = this.dur(id); st.done = true; if (id === 'T7') this.t7.revealed = true; }
  tick(dtMs) { this.nowMs += dtMs; for (const id of Object.keys(SPECS)) { const st = this.state[id]; if (!st.active) continue; if (id === 'T7' && !this.t7.revealed) { this.t7.dim = clampT((st.t += dtMs) / 200); st.t = Math.min(st.t, 200); continue; } st.t += dtMs; if (st.t >= this.dur(id)) { st.t = this.dur(id); st.done = true; if (id !== 'T6' && id !== 'T7' && id !== 'T8') st.active = false; } } }
  prog(id) { const st = this.state[id]; return st.active || st.done ? clampT(st.t / this.dur(id)) : 0; }
  // Everything the renderer needs, derived from progress. No hidden data enters here.
  params(alertActive = false) {
    const R = this.reduced, out = {};
    { const st = this.state.T1, p = this.prog('T1'), e = R ? p : EASE.inOutCubic(p); out.T1 = { active: st.active, p, scale: R ? 1 : lerpT(1, 0.1, e), alpha: R ? 1 - p : p < 0.7 ? 1 : clampT(1 - (p - 0.7) / 0.3), travel: R ? 0 : e }; }
    { const st = this.state.T2, p = this.prog('T2'); out.T2 = { active: st.active, p, contour: R ? 1 : clampT(p / 0.33), fade: R ? 1 - p : 0 }; }
    { const st = this.state.T3, p = this.prog('T3'); out.T3 = { active: st.active, p, aperture: R ? 1 : 1 - 0.18 * Math.sin(Math.PI * p) }; }
    { const st = this.state.T4, s = SPECS.T4, t = st.t; let f = 0; if (st.active && !R) { if (t < s.durMs) f = EASE.outCubic(t / s.durMs); else if (t < s.durMs + 150) f = 1; else f = 1 - EASE.inOutCubic(clampT((t - s.durMs - 150) / (s.settleMs))); } out.T4 = { active: st.active, offsetFrac: f * 0.2, dir: st.data && st.data.dir ? st.data.dir : [0, 0] }; }
    { const st = this.state.T5, p = this.prog('T5'); out.T5 = { active: st.active, p }; }
    { const st = this.state.T6, s = SPECS.T6, t = st.t; let zoomMul = 1, flicker = 0, compress = 0; if (st.active && !R) { if (t < s.durMs) { const e = EASE.outCubic(t / s.durMs); zoomMul = 1 + 0.08 * e; flicker = 0.35 * Math.sin(Math.PI * (t / s.durMs)); compress = e; } else if (t < s.durMs + s.settleMs) { const e = EASE.outCubic((t - s.durMs) / s.settleMs); zoomMul = 1.08 - 0.08 * e; compress = 1 - e; } }
      out.T6 = { active: st.active, zoomMul, flicker, compress, edge: alertActive ? 0.55 : 0 }; }
    { const st = this.state.T7, p = this.prog('T7'), rev = this.t7.revealed; const pr = rev ? clampT(st.t / this.dur('T7')) : 0; out.T7 = { active: st.active, dim: R ? (st.active ? 0.45 : 0) : 0.45 * this.t7.dim, revealed: rev, reveal: R ? (rev ? 1 : 0) : EASE.inOutCubic(pr), fade: R && rev ? 1 - pr : 0 }; }
    { const st = this.state.T8, p = this.prog('T8'); out.T8 = { active: st.active, p, dim: st.active ? 0.8 * (R ? 1 : clampT(p / 0.15)) : 0, ink: R ? (st.active ? 1 : 0) : clampT((p - 0.25) / 0.6), glyph: R ? 0 : clampT((p - 0.85) / 0.15), fade: R && st.active ? 1 - p : 0 }; }
    return out; }
}
// The camera nudge may only look toward something already drawn: a creature just sensed, or an echo origin a listener just heard.
function nudgeTarget(snap, frame) {
  let best = null; for (const g of snap.ghosts) if (g.ageTicks <= 2 && (!best || g.ageTicks < best.ageTicks)) best = { pos: g.pos, ageTicks: g.ageTicks };
  for (const o of snap.castOrigins) if (o.heardAgeTicks !== null && o.heardAgeTicks <= 2 && (!best || o.heardAgeTicks < best.ageTicks)) best = { pos: o.origin, ageTicks: o.heardAgeTicks };
  if (!best) return null; const ps = frame.worldToScreen(snap.player), ts = frame.worldToScreen(best.pos), dx = ts.x - ps.x, dy = ts.y - ps.y, m = Math.hypot(dx, dy); if (m < 1) return null; return { dir: [dx / m, dy / m], source: best };
}
// World-space camera offset for a nudge: at most 0.2 of the viewport in each direction.
function nudgeVector(dir, frac, K, W = 390, H = 844) { return [dir[0] * frac * W / K, -dir[1] * frac * H / K]; }
module.exports = { Transitions, SPECS, EASE, REDUCED_MS, nudgeTarget, nudgeVector };
if (typeof window !== 'undefined') window.ECHO_TRANSITIONS = module.exports;
