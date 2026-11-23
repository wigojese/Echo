'use strict';
// Graybox renderer and touch front end for the reference simulation. Not the final look.
const NS = window.__SIM, SimC = NS.Sim, ClockC = NS.SimClock, PP = NS.P, IN = window.ECHO_INPUT, DR = window.ECHO_DRIVER, CAM = window.ECHO_CAMERA;
const T = { black: '#0B0D0B', chalk: '#E6E0D2', fresh: '#CDE9BB', glow: '#9FC19B', mem: '#718B70', res: '#4E624F', amber: '#F4BE70', danger: '#E98158', exit: '#F1D17C', ui: '#AEB9A8' };
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), W = 390, H = 844, PYC = H / 2;
const q = new URLSearchParams(location.search);
let STYLE = q.get('style') === 'graybox' ? 'graybox' : 'plate'; const BLOOM = q.get('bloom') === 'max' ? 6 : q.get('bloom') ? +q.get('bloom') : 1, CLEAN = q.get('clean') === '1', RM = q.get('rm') === '1', AUTO = q.get('replay'), TRACE_MENU = q.get('trace') === 'menu', INTRO = q.get('intro') === '1';
if (q.get('bright')) cv.style.filter = 'brightness(' + q.get('bright') + ')';
let cur = q.get('level') || 'l01', sim, clock, driver, cam, FR, keyPending = [], pendingSim = [], keys = {}, lastKeyDir = [0, 0], lastStats = null, stickViz = null, latStamp = null, lastCasts = 0;
const router = new IN.InputRouter({ mode: q.get('mode') === 'joystick' ? 'joystick' : 'waypoint', mirrored: q.get('hand') === 'left' }); router.chipHidden = TRACE_MENU;
window.__lat = [];
const newCam = () => new CAM.CameraDirector({ reducedMotion: RM, intro: INTRO });
function load(name) { cur = name; const L = window.LEVELS[name]; sim = new SimC(L.level, L.geometry); clock = new ClockC(); driver = new DR.Driver(); cam = newCam(); keyPending = []; pendingSim = []; router.cancelAll('load'); router.drain(); lastCasts = 0; }
load(cur);
const mix = (a, b, t) => { const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(text, x, y, max, lh) { const words = text.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; } ctx.fillText(line, x, y); }
const inTrace = () => cam.state === 'KNOWN_PATH_SCROLL';
const chip = (r, label, on = true, active = false) => { ctx.strokeStyle = T.ui; ctx.lineWidth = 1.3; ctx.globalAlpha = on ? 1 : 0.4; ctx.fillStyle = active ? 'rgba(174,185,168,.25)' : 'rgba(11,13,11,.88)'; rr(r.x, r.y, r.w, r.h, r.h / 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '14px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 5); ctx.textAlign = 'left'; ctx.globalAlpha = 1; };
const button = (r, label, primary) => { ctx.fillStyle = primary ? T.chalk : 'rgba(11,13,11,.9)'; ctx.strokeStyle = T.ui; ctx.lineWidth = 1.4; rr(r.x, r.y, r.w, r.h, r.h / 2); ctx.fill(); if (!primary) ctx.stroke(); ctx.fillStyle = primary ? T.black : T.chalk; ctx.font = (primary ? '600 ' : '') + '17px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 6); ctx.textAlign = 'left'; };

function render() {
  const snap = sim.snapshot(); FR = cam.frame(snap); const L = router.L, K = FR.K, c = { x: FR.center[0], y: FR.center[1] };
  const sx = (x) => W / 2 + (x - c.x) * K, sy = (y) => PYC - (y - c.y) * K, trace = inTrace();
  const dbg = () => { if (!debug) return; ctx.strokeStyle = 'rgba(230,224,210,.18)'; ctx.lineWidth = 1; ctx.beginPath(); for (const e of sim.edges) { ctx.moveTo(sx(e.x1), sy(e.y1)); ctx.lineTo(sx(e.x2), sy(e.y2)); } ctx.stroke();
    if (sim.lastField) { const F = sim.lastField.field, g = sim.grid; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const v = F[j * g.nx + i]; if (v === Infinity) continue; ctx.fillStyle = `rgba(244,190,112,${(0.05 + 0.2 * (1 - v / 13.5)).toFixed(3)})`; ctx.fillRect(sx(i * g.cell), sy((j + 1) * g.cell), g.cell * K + 0.5, g.cell * K + 0.5); } }
    for (const p of sim.pred) { ctx.strokeStyle = T.danger; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(p.pos[0]), sy(p.pos[1]), 7, 0, 7); ctx.stroke(); ctx.fillStyle = T.danger; ctx.font = '12px Inter,sans-serif'; ctx.fillText(p.state, sx(p.pos[0]) + 11, sy(p.pos[1]) + 4); } };
  ctx.textAlign = 'left';
  if (STYLE === 'plate') lastStats = window.ECHO_PLATE.draw(ctx, snap, { x: c.x, y: c.y, K, W, H }, { bloom: BLOOM, tick: sim.tick, particles: !RM, underlay: dbg, naiveHalo: q.get('naive') === '1', band: FR.band });
  else { ctx.fillStyle = T.black; ctx.fillRect(0, 0, W, H); dbg();
    for (const s of snap.segments) { const t = s.ageTicks / 30; let col, w; if (t < 0.35) { col = T.fresh; w = 2.3; } else if (t < 1.4) { col = mix(T.fresh, T.glow, (t - 0.35) / 1.05); w = 1.7; } else { col = t < 5 ? mix(T.glow, T.mem, (t - 1.4) / 3.6) : mix(T.mem, T.res, (t - 5) / 3); w = 1.2; }
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx(s.p[0]), sy(s.p[1])); ctx.lineTo(sx(s.p[2]), sy(s.p[3])); ctx.stroke(); }
    for (const o of snap.castOrigins) { ctx.strokeStyle = T.mem; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(o.origin[0]), sy(o.origin[1]), 6, 0, 7); ctx.stroke(); }
    for (const g of snap.ghosts) { ctx.setLineDash([1, 5]); ctx.strokeStyle = T.amber; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(sx(g.pos[0]), sy(g.pos[1]), 18, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    const ps = FR.playerScreen; ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ps.x - 7, ps.y - 16); ctx.lineTo(ps.x - 7, ps.y - 3); ctx.quadraticCurveTo(ps.x - 7, ps.y + 4, ps.x, ps.y + 4); ctx.quadraticCurveTo(ps.x + 7, ps.y + 4, ps.x + 7, ps.y - 3); ctx.lineTo(ps.x + 7, ps.y - 8); ctx.moveTo(ps.x, ps.y + 4); ctx.lineTo(ps.x, ps.y + 15); ctx.stroke(); }
  // route preview from the player's own screen position
  if (driver.plan && !trace) { const pl = driver.plan, ps = FR.playerScreen; ctx.lineCap = 'round'; ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.2; ctx.setLineDash([0.1, 7]); ctx.beginPath(); ctx.moveTo(ps.x, ps.y); for (const p of (driver.path || [])) ctx.lineTo(sx(p[0]), sy(p[1])); ctx.stroke();
    if (pl.tail) { ctx.strokeStyle = T.amber; ctx.globalAlpha = 0.6; ctx.setLineDash([0.1, 10]); ctx.beginPath(); ctx.moveTo(sx(pl.tail[0][0]), sy(pl.tail[0][1])); ctx.lineTo(sx(pl.tail[1][0]), sy(pl.tail[1][1])); ctx.stroke(); ctx.globalAlpha = 1; } ctx.setLineDash([]); }
  if (stickViz && !trace) { ctx.strokeStyle = T.ui; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(stickViz.ox, stickViz.oy, 48, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = T.chalk; ctx.beginPath(); ctx.arc(stickViz.ox + (driver.stick ? driver.stick[0] * 48 : 0), stickViz.oy - (driver.stick ? driver.stick[1] * 48 : 0), 14, 0, 7); ctx.fill(); }
  // ---- TRACE review: the path you walked, echo labels, the rail ----
  if (trace && FR.trace) { const tr = FR.trace; ctx.strokeStyle = T.chalk; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.6; ctx.setLineDash([2, 5]); ctx.beginPath(); tr.pathPts.forEach((p, i) => { const x = sx(p[0]), y = sy(p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    const cp = FR.center; ctx.strokeStyle = T.fresh; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, PYC, 8, 0, 7); ctx.stroke();
    ctx.font = '12.5px Inter,sans-serif'; tr.labels.forEach((l, i) => { const x = sx(l.origin[0]), y = sy(l.origin[1]), left = x > W / 2; ctx.fillStyle = T.chalk; ctx.textAlign = left ? 'right' : 'left'; ctx.fillText('Echo ' + l.castId, x + (left ? -14 : 14), y - 24); ctx.fillStyle = T.ui; ctx.fillText((l.ageTicks / 30).toFixed(1) + ' s ago', x + (left ? -14 : 14), y - 9); }); ctx.textAlign = 'left';
    const r = L.rail, rx = (r.x0 + r.x1) / 2, top = 150, bot = 650; ctx.strokeStyle = T.res; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(rx, top); ctx.lineTo(rx, bot); ctx.stroke(); const hy = top + (bot - top) * (tr.s / tr.L); ctx.strokeStyle = T.glow; ctx.beginPath(); ctx.moveTo(rx, top); ctx.lineTo(rx, hy); ctx.stroke(); ctx.fillStyle = T.black; ctx.strokeStyle = T.fresh; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(rx, hy, 11, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = T.ui; ctx.font = '13px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Trace', rx, 134); ctx.textAlign = 'left'; }
  // ---- off-screen player arrow ----
  if (!FR.playerVisible && FR.offscreen) { const a = FR.offscreen.angle, ex = clampE(W / 2 + Math.cos(a) * 400, 34, W - 34), ey = clampE(PYC + Math.sin(a) * 800, 110, H - 130); ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = T.chalk; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.fillStyle = T.chalk; ctx.font = '12.5px Inter,sans-serif'; ctx.textAlign = ex > W / 2 ? 'right' : 'left'; ctx.fillText('You, ' + FR.offscreen.metres.toFixed(0) + ' m', ex + (ex > W / 2 ? -16 : 16), ey + 4); ctx.textAlign = 'left'; }
  // ---- HUD ----
  if (!trace) { ctx.fillStyle = T.chalk; ctx.font = 'italic 18px Georgia,serif'; ctx.fillText(sim.level.id === 'EC-L01' ? 'Listening Hall' : 'Test chamber', 22, 62); }
  ctx.fillStyle = T.ui; ctx.font = '13px Inter,sans-serif'; if (!CLEAN) { ctx.fillText(router.mode === 'waypoint' ? 'Mode: tap a lit path to move' : 'Mode: joystick, left thumb', 22, 84); ctx.fillText('M mode, H hand, T trace, G developer view, R retry', 22, 101); }
  if (trace) { ctx.fillStyle = 'rgba(11,13,11,.92)'; ctx.strokeStyle = T.ui; ctx.lineWidth = 1.3; rr(80, 44, 230, 40, 20); ctx.fill(); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '14.5px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Reviewing. Game paused.', 195, 69); ctx.textAlign = 'left'; button(L.ret, 'Return to listener', true); }
  else {
    const cool = Math.max(0, (sim.nextPingTick - sim.tick) / PP.cooldownTicks), e = L.echo, off = cam.state === 'MANUAL_REFRAME';
    ctx.fillStyle = 'rgba(11,13,11,.88)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); ctx.strokeStyle = cool ? T.res : T.fresh; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r - 3, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (cool || 1)); ctx.stroke();
    ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(e.x, e.y - 9, 6, 0, 7); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '600 14px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Echo', e.x, e.y + 28); ctx.textAlign = 'left';
    chip(L.quiet, driver.quiet ? 'Quiet step on' : 'Quiet step', true, driver.quiet); if (!TRACE_MENU) chip(L.trace, 'Trace', router.traceEnabled);
    if (off) chip(L.recenter, 'Recenter', true);
    ctx.fillStyle = T.ui; ctx.fillRect(L.pause.x - 8, L.pause.y - 10, 5, 20); ctx.fillRect(L.pause.x + 3, L.pause.y - 10, 5, 20);
    if (sim.lastRejected) { ctx.fillStyle = T.amber; ctx.font = '13px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Echo is recharging', e.x, e.y - 58); ctx.textAlign = 'left'; } }
  if (debug) { ctx.fillStyle = T.amber; ctx.font = '600 12px Inter,sans-serif'; ctx.fillText('DEVELOPER VIEW: ground truth. Never shown to players.', 22, 122); ctx.font = '12px Inter,sans-serif'; ctx.fillStyle = T.ui; ctx.fillText(`tick ${sim.tick}  state ${sim.state}  cam ${cam.state} ${FR.band} z${cam.zoom.toFixed(2)}  casts ${sim.castCount}  pred ${sim.pred.map((p) => p.state).join(',') || 'none'}`, 22, 140); }
  if (cam.fade > 0) { ctx.fillStyle = `rgba(11,13,11,${(0.85 * cam.fade).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (sim.paused && !trace) { if (TRACE_MENU) { ctx.fillStyle = 'rgba(11,13,11,.9)'; ctx.fillRect(0, 380, W, 220); ctx.textAlign = 'center'; ctx.fillStyle = T.chalk; ctx.font = '30px Georgia,serif'; ctx.fillText('Paused', W / 2, 428); button(L.menu.resume, 'Resume', true); ctx.globalAlpha = router.traceEnabled ? 1 : 0.4; button(L.menu.trace, 'Trace', false); ctx.globalAlpha = 1; ctx.textAlign = 'left'; } else banner('Paused', 'Tap the pause button to resume.', false); }
  else if (sim.state !== 'RUNNING') { const ex = sim.explain(); banner(sim.state === 'WON' ? 'Exit reached' : sim.state === 'CAPTURED' ? 'Found' : 'Time ran out', ex ? ex.sentence : '', true); }
}
const clampE = (v, a, b) => Math.max(a, Math.min(b, v));
function banner(title, text, retry) { ctx.fillStyle = 'rgba(11,13,11,.9)'; ctx.fillRect(0, 380, W, 230); ctx.textAlign = 'center'; ctx.fillStyle = T.chalk; ctx.font = '30px Georgia,serif'; ctx.fillText(title, W / 2, 432); ctx.font = '16px Inter,sans-serif'; wrap(text, W / 2, 468, 330, 22);
  if (retry) { ctx.fillStyle = T.chalk; rr(W / 2 - 100, 560, 200, 54, 27); ctx.fill(); ctx.fillStyle = T.black; ctx.font = '600 17px Inter,sans-serif'; ctx.fillText('Retry', W / 2, 594); } ctx.textAlign = 'left'; }
let debug = q.get('debug') === '1';

// Camera intents are handled every frame, even while the world is paused. Sim intents wait for the next tick.
function pump() {
  const snap = { player: [...sim.pos], trail: sim.trail, segments: { length: sim.mem.size } }; // light: the pump needs no wave or cell data
  cam.snap_ = snap; router.traceMode = inTrace(); router.traceEnabled = cam.traceAvailable(snap); router.allowPan = !(driver.stick || driver.path); router.recenter = cam.state === 'MANUAL_REFRAME'; router.pausedMenu = TRACE_MENU && sim.paused && !inTrace();
  for (const it of router.drain()) { switch (it.type) {
    case 'trace_enter': if (cam.enterTrace(sim.snapshot())) sim.paused = true; break;
    case 'return': cam.returnToListener(); sim.paused = false; break;
    case 'resume': sim.paused = false; break;
    case 'scrub': cam.scrub(it.dy, it.dt); break; case 'scrub_end': cam.release(); break;
    case 'pan': cam.pan(it.dx, it.dy); break; case 'pan_end': break;
    case 'pinch': cam.pinch({ x: it.x, y: it.y }, it.ratio); break;
    case 'pause_toggle': if (!inTrace()) sim.paused = !sim.paused; break;
    default: pendingSim.push(it); } }
  cam.steer(!!(driver.stick || driver.path));
}
let autoBy = null; if (AUTO && window.REPLAYS[AUTO]) { autoBy = {}; window.REPLAYS[AUTO].inputs.forEach((i) => (autoBy[i.tick] = autoBy[i.tick] || []).push(i)); }
function stepOnce() {
  if (autoBy) { if (sim.state === 'RUNNING' && !sim.paused) sim.step(autoBy[sim.tick] || []); return; }
  pump(); if (sim.state !== 'RUNNING' || sim.paused) return;
  const pass = pendingSim; pendingSim = []; const ins = driver.inputsFor(sim, pass, FR || null); const before = sim.events.length; sim.step([...ins, ...keyPending]); keyPending = [];
  sim.lastRejected = sim.events.slice(before).some((e) => e.kind === 'ping_rejected') ? sim.tick : (sim.lastRejected && sim.tick - sim.lastRejected < 30 ? sim.lastRejected : 0);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!window.__hold) { pump(); cam.tick(dt * 1000); if (!sim.paused) { const n = clock.advance(dt); for (let i = 0; i < n; i++) stepOnce(); } }
  if (latStamp !== null && sim.castCount > lastCasts) { window.__lat.push(+(performance.now() - latStamp).toFixed(2)); latStamp = null; } lastCasts = sim.castCount;
  render(); requestAnimationFrame(frame);
}
function doRetry() { sim.reset(); clock = new ClockC(); driver = new DR.Driver(); cam = newCam(); router.cancelAll('retry'); router.drain(); keyPending = []; pendingSim = []; stickViz = null; }
function interrupt() { router.cancelAll('interruption'); sim.paused = true; }
addEventListener('keydown', (e) => { if (e.repeat) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true;
  if (k === ' ') { e.preventDefault(); latStamp = performance.now(); keyPending.push({ type: 'ping' }); } else if (k === 'q') { driver.quiet = !driver.quiet; keyPending.push({ type: 'quiet', on: driver.quiet }); } else if (k === 'p') { if (!inTrace()) sim.paused = !sim.paused; } else if (k === 'r') doRetry(); else if (k === 'g') debug = !debug;
  else if (k === 't') { if (inTrace()) { cam.returnToListener(); sim.paused = false; } else if (cam.enterTrace(sim.snapshot())) sim.paused = true; } else if (k === '=') cam.pinch({ x: W / 2, y: PYC }, 1.1); else if (k === '-') cam.pinch({ x: W / 2, y: PYC }, 0.9);
  else if (k === 'm') router.setMode(router.mode === 'waypoint' ? 'joystick' : 'waypoint'); else if (k === 'h') router.setMirrored(!router.mirrored); else dirKeys(); });
addEventListener('keyup', (e) => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; dirKeys(); });
function dirKeys() { const dx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), dy = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0); if (dx === lastKeyDir[0] && dy === lastKeyDir[1]) return; lastKeyDir = [dx, dy]; const m = Math.hypot(dx, dy) || 1; keyPending.push({ type: 'move', dx: dx / m, dy: dy / m }); }
function pt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointerdown', (e) => { const p = pt(e);
  if (sim.state !== 'RUNNING' && p.y > 540 && p.y < 620) { doRetry(); return; }
  if (router.inEcho(p) && !router.owners.has(e.pointerId) && router.owners.size < 2 && !router.traceMode) latStamp = e.timeStamp;
  router.pointerDown(e.pointerId, p.x, p.y, e.timeStamp); const o = router.owners.get(e.pointerId); if (o && o.kind === 'stick') stickViz = { ox: o.ox, oy: o.oy }; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { const p = pt(e); router.pointerMove(e.pointerId, p.x, p.y, e.timeStamp); });
const up = (e) => { const p = pt(e); const o = router.owners.get(e.pointerId); router.pointerUp(e.pointerId, p.x, p.y, e.timeStamp); if (o && o.kind === 'stick') stickViz = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { router.pointerCancel(e.pointerId); stickViz = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); }); addEventListener('blur', interrupt);
requestAnimationFrame(frame);
window.__g = { freeze(v) { window.__hold = v; }, load, router, get sim() { return sim; }, get driver() { return driver; }, get cam() { return cam; }, get frame() { return FR; }, setDebug(v) { debug = v; }, render, pump, get stats() { return lastStats; }, get style() { return STYLE; }, setStyle(v) { STYLE = v; },
  tick(n) { for (let i = 0; i < n; i++) stepOnce(); render(); }, camTick(ms, step = 16.7) { for (let t = 0; t < ms; t += step) cam.tick(step); render(); },
  loadCustom(level, geometry) { sim = new SimC(level, geometry); clock = new ClockC(); driver = new DR.Driver(); cam = newCam(); keyPending = []; pendingSim = []; router.cancelAll('custom'); router.drain(); lastCasts = 0; },
  step(n, byTick = {}) { for (let i = 0; i < n; i++) sim.step(byTick[sim.tick] || []); render(); },
  playReplay(rep, until) { const by = {}; rep.inputs.forEach((i) => (by[i.tick] = by[i.tick] || []).push(i)); while (sim.state === 'RUNNING' && sim.tick < until) sim.step(by[sim.tick] || []); render(); } };
