'use strict';
// Graybox renderer and touch front end for the reference simulation. Simple outlines and a developer overlay. Not the final look.
const NS = window.__SIM, SimC = NS.Sim, ClockC = NS.SimClock, PP = NS.P, IN = window.ECHO_INPUT, DR = window.ECHO_DRIVER;
const T = { black: '#0B0D0B', chalk: '#E6E0D2', fresh: '#CDE9BB', glow: '#9FC19B', mem: '#718B70', res: '#4E624F', amber: '#F4BE70', danger: '#E98158', exit: '#F1D17C', ui: '#AEB9A8' };
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), K = 20, W = 390, H = 844;
const q = new URLSearchParams(location.search);
let cur = q.get('level') || 'l01', sim, clock, driver, debug = q.get('debug') === '1', keyPending = [], keys = {}, lastKeyDir = [0, 0];
const router = new IN.InputRouter({ mode: q.get('mode') === 'joystick' ? 'joystick' : 'waypoint', mirrored: q.get('hand') === 'left' });
window.__lat = []; let latStamp = null, lastCasts = 0, stickViz = null;
function load(name) { cur = name; const L = window.LEVELS[name]; sim = new SimC(L.level, L.geometry); clock = new ClockC(); driver = new DR.Driver(); keyPending = []; router.cancelAll('load'); router.drain(); lastCasts = 0; }
load(cur);
const mix = (a, b, t) => { const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
const cam = () => ({ x: sim.pos[0], y: sim.pos[1] }), sx = (x, c) => W / 2 + (x - c.x) * K, sy = (y, c) => H * 0.5 - (y - c.y) * K;
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(text, x, y, max, lh) { const words = text.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; } ctx.fillText(line, x, y); }

function render() {
  const c = cam(), snap = sim.snapshot(), L = router.L; ctx.fillStyle = T.black; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'left';
  if (debug) { ctx.strokeStyle = 'rgba(230,224,210,.18)'; ctx.lineWidth = 1; ctx.beginPath(); for (const e of sim.edges) { ctx.moveTo(sx(e.x1, c), sy(e.y1, c)); ctx.lineTo(sx(e.x2, c), sy(e.y2, c)); } ctx.stroke();
    if (sim.lastField) { const F = sim.lastField.field, g = sim.grid; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const v = F[j * g.nx + i]; if (v === Infinity) continue; ctx.fillStyle = `rgba(244,190,112,${(0.05 + 0.2 * (1 - v / 13.5)).toFixed(3)})`; ctx.fillRect(sx(i * g.cell, c), sy((j + 1) * g.cell, c), g.cell * K + 0.5, g.cell * K + 0.5); } }
    for (const p of sim.pred) { ctx.strokeStyle = T.danger; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(p.pos[0], c), sy(p.pos[1], c), 7, 0, 7); ctx.stroke(); ctx.fillStyle = T.danger; ctx.font = '12px Inter,sans-serif'; ctx.fillText(p.state, sx(p.pos[0], c) + 11, sy(p.pos[1], c) + 4); } }
  for (const s of snap.segments) { const e = sim.edges[s.id], t = s.ageTicks / 30; let col, w; if (t < 0.35) { col = T.fresh; w = 2.3; } else if (t < 1.4) { col = mix(T.fresh, T.glow, (t - 0.35) / 1.05); w = 1.7; } else { col = t < 5 ? mix(T.glow, T.mem, (t - 1.4) / 3.6) : mix(T.mem, T.res, (t - 5) / 3); w = 1.2; }
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx(e.x1, c), sy(e.y1, c)); ctx.lineTo(sx(e.x2, c), sy(e.y2, c)); ctx.stroke(); }
  for (const o of snap.castOrigins) { ctx.strokeStyle = T.mem; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(o.origin[0], c), sy(o.origin[1], c), 6, 0, 7); ctx.stroke(); }
  for (const g of snap.ghosts) { ctx.setLineDash([1, 5]); ctx.strokeStyle = T.amber; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(sx(g.pos[0], c), sy(g.pos[1], c), 18, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  if (snap.knownExit) { const x = sx(snap.knownExit[0], c), y = sy(snap.knownExit[1], c); ctx.strokeStyle = T.exit; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 9, y + 8); ctx.lineTo(x - 9, y - 4); ctx.quadraticCurveTo(x - 9, y - 12, x, y - 12); ctx.quadraticCurveTo(x + 9, y - 12, x + 9, y - 4); ctx.lineTo(x + 9, y + 8); ctx.stroke(); }
  // route preview: solid along known floor, dotted where the tap went past what you know
  if (driver.plan) { const pl = driver.plan; ctx.lineCap = 'round'; ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.2; ctx.setLineDash([0.1, 7]); ctx.beginPath(); ctx.moveTo(W / 2, H * 0.5); for (const p of (driver.path || [])) ctx.lineTo(sx(p[0], c), sy(p[1], c)); ctx.stroke();
    if (pl.tail) { ctx.strokeStyle = T.amber; ctx.globalAlpha = 0.6; ctx.setLineDash([0.1, 10]); ctx.beginPath(); ctx.moveTo(sx(pl.tail[0][0], c), sy(pl.tail[0][1], c)); ctx.lineTo(sx(pl.tail[1][0], c), sy(pl.tail[1][1], c)); ctx.stroke(); ctx.globalAlpha = 1; } ctx.setLineDash([]);
    const last = driver.path && driver.path[driver.path.length - 1]; if (last) { ctx.strokeStyle = T.chalk; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(sx(last[0], c), sy(last[1], c), 9, 0, 7); ctx.stroke(); } }
  if (stickViz) { ctx.strokeStyle = T.ui; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(stickViz.ox, stickViz.oy, 48, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = T.chalk; ctx.beginPath(); ctx.arc(stickViz.ox + (driver.stick ? driver.stick[0] * 48 : 0), stickViz.oy - (driver.stick ? driver.stick[1] * 48 : 0), 14, 0, 7); ctx.fill(); }
  const px = W / 2, py = H * 0.5; ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - 7, py - 16); ctx.lineTo(px - 7, py - 3); ctx.quadraticCurveTo(px - 7, py + 4, px, py + 4); ctx.quadraticCurveTo(px + 7, py + 4, px + 7, py - 3); ctx.lineTo(px + 7, py - 8); ctx.moveTo(px, py + 4); ctx.lineTo(px, py + 15); ctx.stroke();
  // HUD, laid out from the router so hit areas and drawing can never disagree
  ctx.fillStyle = T.chalk; ctx.font = 'italic 18px Georgia,serif'; ctx.fillText(sim.level.id === 'EC-L01' ? 'Listening Hall' : 'Test chamber', 22, 62);
  ctx.fillStyle = T.ui; ctx.font = '13px Inter,sans-serif'; ctx.fillText(router.mode === 'waypoint' ? 'Mode: tap a lit path to move' : 'Mode: joystick, left thumb', 22, 84); ctx.fillText('M mode, H hand, G developer view, R retry', 22, 101);
  const cool = Math.max(0, (sim.nextPingTick - sim.tick) / PP.cooldownTicks), e = L.echo;
  ctx.fillStyle = 'rgba(11,13,11,.88)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); ctx.strokeStyle = cool ? T.res : T.fresh; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r - 3, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (cool || 1)); ctx.stroke();
  ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(e.x, e.y - 9, 6, 0, 7); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '600 14px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Echo', e.x, e.y + 28);
  const qb = L.quiet; ctx.strokeStyle = T.ui; ctx.lineWidth = 1.3; ctx.fillStyle = driver.quiet ? 'rgba(174,185,168,.25)' : 'rgba(11,13,11,.88)'; rr(qb.x, qb.y, qb.w, qb.h, 23); ctx.fill(); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '14px Inter,sans-serif'; ctx.fillText(driver.quiet ? 'Quiet step on' : 'Quiet step', qb.x + qb.w / 2, qb.y + 28);
  ctx.fillStyle = T.ui; ctx.fillRect(L.pause.x - 8, L.pause.y - 10, 5, 20); ctx.fillRect(L.pause.x + 3, L.pause.y - 10, 5, 20); ctx.textAlign = 'left';
  if (sim.lastRejected) { ctx.fillStyle = T.amber; ctx.font = '13px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Echo is recharging', e.x, e.y - 58); ctx.textAlign = 'left'; }
  if (debug) { ctx.fillStyle = T.amber; ctx.font = '600 12px Inter,sans-serif'; ctx.fillText('DEVELOPER VIEW: ground truth. Never shown to players.', 22, 122); ctx.font = '12px Inter,sans-serif'; ctx.fillStyle = T.ui; ctx.fillText(`tick ${sim.tick}  state ${sim.state}  casts ${sim.castCount}  known cells ${sim.cellMem.size}  pred ${sim.pred.map((p) => p.state).join(',') || 'none'}`, 22, 140); }
  if (sim.paused) banner('Paused', 'Tap the pause button to resume.', false);
  else if (sim.state !== 'RUNNING') { const ex = sim.explain(); banner(sim.state === 'WON' ? 'Exit reached' : sim.state === 'CAPTURED' ? 'Found' : 'Time ran out', ex ? ex.sentence : '', true); }
}
function banner(title, text, retry) { ctx.fillStyle = 'rgba(11,13,11,.9)'; ctx.fillRect(0, 380, W, 230); ctx.textAlign = 'center'; ctx.fillStyle = T.chalk; ctx.font = '30px Georgia,serif'; ctx.fillText(title, W / 2, 432); ctx.font = '16px Inter,sans-serif'; wrap(text, W / 2, 468, 330, 22);
  if (retry) { ctx.fillStyle = T.chalk; rr(W / 2 - 100, 560, 200, 54, 27); ctx.fill(); ctx.fillStyle = T.black; ctx.font = '600 17px Inter,sans-serif'; ctx.fillText('Retry', W / 2, 594); } ctx.textAlign = 'left'; }

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!sim.paused && !window.__hold) { const n = clock.advance(dt); for (let i = 0; i < n; i++) { stepOnce(); } }
  if (latStamp !== null && sim.castCount > lastCasts) { window.__lat.push(+(performance.now() - latStamp).toFixed(2)); latStamp = null; } lastCasts = sim.castCount;
  render(); requestAnimationFrame(frame);
}
function stepOnce() {
  const intents = router.drain(), pass = []; for (const it of intents) { if (it.type === 'pause_toggle') sim.paused = !sim.paused; else if (it.type === 'cancel_all') { sim.paused = sim.paused || it.pause === true; pass.push(it); } else pass.push(it); }
  if (sim.state !== 'RUNNING') return; if (sim.paused) return;
  const ins = driver.inputsFor(sim, pass); const before = sim.events.length; sim.step([...ins, ...keyPending]); keyPending = [];
  sim.lastRejected = sim.events.slice(before).some((e) => e.kind === 'ping_rejected') ? sim.tick : (sim.lastRejected && sim.tick - sim.lastRejected < 30 ? sim.lastRejected : 0);
}
function doRetry() { sim.reset(); clock = new ClockC(); driver = new DR.Driver(); router.cancelAll('retry'); router.drain(); keyPending = []; stickViz = null; }
function interrupt() { router.cancelAll('interruption'); sim.paused = true; }
addEventListener('keydown', (e) => { if (e.repeat) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true;
  if (k === ' ') { e.preventDefault(); latStamp = performance.now(); keyPending.push({ type: 'ping' }); } else if (k === 'q') { driver.quiet = !driver.quiet; keyPending.push({ type: 'quiet', on: driver.quiet }); } else if (k === 'p') sim.paused = !sim.paused; else if (k === 'r') doRetry(); else if (k === 'g') debug = !debug;
  else if (k === 'm') router.setMode(router.mode === 'waypoint' ? 'joystick' : 'waypoint'); else if (k === 'h') router.setMirrored(!router.mirrored); else dirKeys(); });
addEventListener('keyup', (e) => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; dirKeys(); });
function dirKeys() { const dx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), dy = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0); if (dx === lastKeyDir[0] && dy === lastKeyDir[1]) return; lastKeyDir = [dx, dy]; const m = Math.hypot(dx, dy) || 1; keyPending.push({ type: 'move', dx: dx / m, dy: dy / m }); }
function pt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointerdown', (e) => { const p = pt(e);
  if (sim.state !== 'RUNNING' && p.y > 540 && p.y < 620) { doRetry(); return; }
  if (router.inEcho(p) && !router.owners.has(e.pointerId) && router.owners.size < 2) latStamp = e.timeStamp;
  router.pointerDown(e.pointerId, p.x, p.y, e.timeStamp); const o = router.owners.get(e.pointerId); if (o && o.kind === 'stick') stickViz = { ox: o.ox, oy: o.oy }; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { const p = pt(e); router.pointerMove(e.pointerId, p.x, p.y); });
const up = (e) => { const p = pt(e); const o = router.owners.get(e.pointerId); router.pointerUp(e.pointerId, p.x, p.y, e.timeStamp); if (o && o.kind === 'stick') stickViz = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { router.pointerCancel(e.pointerId); stickViz = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); }); addEventListener('blur', interrupt);
requestAnimationFrame(frame);
window.__g = { freeze(v) { window.__hold = v; }, load, router, tick(n) { for (let i = 0; i < n; i++) stepOnce(); render(); }, get sim() { return sim; }, get driver() { return driver; }, setDebug(v) { debug = v; }, render, step(n, byTick = {}) { for (let i = 0; i < n; i++) sim.step(byTick[sim.tick] || []); render(); },
  playReplay(rep, until) { const by = {}; rep.inputs.forEach((i) => (by[i.tick] = by[i.tick] || []).push(i)); while (sim.state === 'RUNNING' && sim.tick < until) sim.step(by[sim.tick] || []); render(); } };
