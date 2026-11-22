'use strict';
// Graybox renderer for the reference simulation. Simple outlines and a developer overlay. Not the final look.
const NS = window.__SIM, SimC = NS.Sim, ClockC = NS.SimClock, PP = NS.P;
const T = { black: '#0B0D0B', chalk: '#E6E0D2', fresh: '#CDE9BB', glow: '#9FC19B', mem: '#718B70', res: '#4E624F', amber: '#F4BE70', danger: '#E98158', exit: '#F1D17C', ui: '#AEB9A8' };
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), K = 20, W = 390, H = 844;
const q = new URLSearchParams(location.search);
let cur = q.get('level') || 'l01', sim, clock, debug = q.get('debug') === '1', pending = [], keys = {}, pointer = null, lastDir = [0, 0], quiet = false;
function load(name) { cur = name; const L = window.LEVELS[name]; sim = new SimC(L.level, L.geometry); clock = new ClockC(); pending = []; quiet = false; lastDir = [0, 0]; }
load(cur);
const mix = (a, b, t) => { const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
const cam = () => ({ x: sim.pos[0], y: sim.pos[1] });
const sx = (x, c) => W / 2 + (x - c.x) * K, sy = (y, c) => H * 0.5 - (y - c.y) * K;
const btn = { echo: { x: 318, y: 740, r: 44 }, quiet: { x: 72, y: 718, w: 118, h: 46 }, pause: { x: 340, y: 54, r: 24 }, retry: { x: 195, y: 560, w: 200, h: 54 } };

function dirFromInput() {
  let dx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), dy = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0);
  if (pointer && !pointer.onUI) { const mx = pointer.x - W / 2, my = -(pointer.y - H * 0.5); const m = Math.hypot(mx, my); if (m > 12) { dx = mx / m; dy = my / m; } }
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } return [+dx.toFixed(2), +dy.toFixed(2)];
}
function render() {
  const c = cam(); ctx.fillStyle = T.black; ctx.fillRect(0, 0, W, H);
  const snap = sim.snapshot();
  if (debug) { // DEVELOPER ONLY: ground truth
    ctx.strokeStyle = 'rgba(230,224,210,.18)'; ctx.lineWidth = 1; ctx.beginPath(); for (const e of sim.edges) { ctx.moveTo(sx(e.x1, c), sy(e.y1, c)); ctx.lineTo(sx(e.x2, c), sy(e.y2, c)); } ctx.stroke();
    if (sim.lastField) { const F = sim.lastField.field, g = sim.grid; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const v = F[j * g.nx + i]; if (v === Infinity) continue; ctx.fillStyle = `rgba(244,190,112,${(0.05 + 0.2 * (1 - v / 13.5)).toFixed(3)})`; ctx.fillRect(sx(i * g.cell, c), sy((j + 1) * g.cell, c), g.cell * K + 0.5, g.cell * K + 0.5); } }
    for (const p of sim.pred) { ctx.strokeStyle = T.danger; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(p.pos[0], c), sy(p.pos[1], c), 7, 0, 7); ctx.stroke(); ctx.fillStyle = T.danger; ctx.font = '12px Inter,sans-serif'; ctx.fillText(p.state, sx(p.pos[0], c) + 11, sy(p.pos[1], c) + 4); }
  }
  // honest view: only what the snapshot knows
  for (const s of snap.segments) { const e = sim.edges[s.id], t = s.ageTicks / 30; let col, w; if (t < 0.35) { col = T.fresh; w = 2.3; } else if (t < 1.4) { col = mix(T.fresh, T.glow, (t - 0.35) / 1.05); w = 1.7; } else { col = t < 5 ? mix(T.glow, T.mem, (t - 1.4) / 3.6) : mix(T.mem, T.res, (t - 5) / 3); w = 1.2; }
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx(e.x1, c), sy(e.y1, c)); ctx.lineTo(sx(e.x2, c), sy(e.y2, c)); ctx.stroke(); }
  for (const o of snap.castOrigins) { ctx.strokeStyle = T.mem; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(o.origin[0], c), sy(o.origin[1], c), 6, 0, 7); ctx.stroke(); }
  for (const g of snap.ghosts) { ctx.setLineDash([1, 5]); ctx.strokeStyle = T.amber; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(sx(g.pos[0], c), sy(g.pos[1], c), 18, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  if (snap.knownExit) { const x = sx(snap.knownExit[0], c), y = sy(snap.knownExit[1], c); ctx.strokeStyle = T.exit; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 9, y + 8); ctx.lineTo(x - 9, y - 4); ctx.quadraticCurveTo(x - 9, y - 12, x, y - 12); ctx.quadraticCurveTo(x + 9, y - 12, x + 9, y - 4); ctx.lineTo(x + 9, y + 8); ctx.stroke(); }
  // player
  const px = W / 2, py = H * 0.5; ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - 7, py - 16); ctx.lineTo(px - 7, py - 3); ctx.quadraticCurveTo(px - 7, py + 4, px, py + 4); ctx.quadraticCurveTo(px + 7, py + 4, px + 7, py - 3); ctx.lineTo(px + 7, py - 8); ctx.moveTo(px, py + 4); ctx.lineTo(px, py + 15); ctx.stroke();
  // HUD
  ctx.fillStyle = T.chalk; ctx.font = 'italic 18px Georgia,serif'; ctx.fillText(sim.level.id === 'EC-L01' ? 'Listening Hall' : 'Test chamber', 22, 62);
  ctx.fillStyle = T.ui; ctx.font = '13px Inter,sans-serif'; ctx.fillText('Graybox. Arrows or WASD move, Space echo.', 22, 84); ctx.fillText('Q quiet, P pause, R retry, G developer view.', 22, 101);
  const cool = Math.max(0, (sim.nextPingTick - sim.tick) / PP.cooldownTicks);
  ctx.strokeStyle = cool ? T.res : T.fresh; ctx.lineWidth = 3.4; ctx.fillStyle = 'rgba(11,13,11,.88)'; ctx.beginPath(); ctx.arc(btn.echo.x, btn.echo.y, btn.echo.r, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(btn.echo.x, btn.echo.y, btn.echo.r - 3, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (cool || 1)); ctx.stroke();
  ctx.strokeStyle = T.chalk; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(btn.echo.x, btn.echo.y - 9, 6, 0, 7); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '600 14px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Echo', btn.echo.x, btn.echo.y + 28);
  ctx.strokeStyle = T.ui; ctx.lineWidth = 1.3; ctx.fillStyle = quiet ? 'rgba(174,185,168,.25)' : 'rgba(11,13,11,.88)'; rr(btn.quiet.x, btn.quiet.y, btn.quiet.w, btn.quiet.h, 23); ctx.fill(); ctx.stroke(); ctx.fillStyle = T.chalk; ctx.font = '14px Inter,sans-serif'; ctx.fillText(quiet ? 'Quiet step on' : 'Quiet step', btn.quiet.x + btn.quiet.w / 2, btn.quiet.y + 28);
  ctx.fillStyle = T.ui; ctx.fillRect(btn.pause.x - 8, btn.pause.y - 10, 5, 20); ctx.fillRect(btn.pause.x + 3, btn.pause.y - 10, 5, 20); ctx.textAlign = 'left';
  if (debug) { ctx.fillStyle = T.amber; ctx.font = '600 12px Inter,sans-serif'; ctx.fillText('DEVELOPER VIEW: ground truth. Never shown to players.', 22, 122); ctx.font = '12px Inter,sans-serif'; ctx.fillStyle = T.ui; ctx.fillText(`tick ${sim.tick}  state ${sim.state}  casts ${sim.castCount}  known edges ${sim.mem.size}  pred ${sim.pred.map((p) => p.state).join(',')}`, 22, 140); }
  if (sim.paused) banner('Paused', 'Tap Echo or press P to resume.', false);
  else if (sim.state !== 'RUNNING') { const ex = sim.explain(); banner(sim.state === 'WON' ? 'Exit reached' : sim.state === 'CAPTURED' ? 'Found' : 'Time ran out', ex ? ex.sentence : '', true); }
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(text, x, y, max, lh) { const words = text.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; } ctx.fillText(line, x, y); }
function banner(title, text, retry) { ctx.fillStyle = 'rgba(11,13,11,.9)'; ctx.fillRect(0, 380, W, 230); ctx.textAlign = 'center'; ctx.fillStyle = T.chalk; ctx.font = '30px Georgia,serif'; ctx.fillText(title, W / 2, 432); ctx.font = '16px Inter,sans-serif'; ctx.fillStyle = T.chalk; wrap(text, W / 2, 468, 330, 22);
  if (retry) { ctx.fillStyle = T.chalk; rr(btn.retry.x - 100, btn.retry.y, 200, 54, 27); ctx.fill(); ctx.fillStyle = T.black; ctx.font = '600 17px Inter,sans-serif'; ctx.fillText('Retry', btn.retry.x, btn.retry.y + 34); } ctx.textAlign = 'left'; }

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const d = dirFromInput(); if (d[0] !== lastDir[0] || d[1] !== lastDir[1]) { lastDir = d; pending.push({ type: 'move', dx: d[0], dy: d[1] }); }
  if (!sim.paused && !window.__hold) { const n = clock.advance(dt); for (let i = 0; i < n; i++) { sim.step(pending); pending = []; } }
  render(); requestAnimationFrame(frame);
}
function doPing() { if (sim.paused) { sim.paused = false; return; } pending.push({ type: 'ping' }); }
function doRetry() { sim.reset(); clock = new ClockC(); pending = []; lastDir = [0, 0]; quiet = false; }
addEventListener('keydown', (e) => { if (e.repeat) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true;
  if (k === ' ') { e.preventDefault(); doPing(); } else if (k === 'q') { quiet = !quiet; pending.push({ type: 'quiet', on: quiet }); } else if (k === 'p') sim.paused = !sim.paused; else if (k === 'r') doRetry(); else if (k === 'g') debug = !debug; });
addEventListener('keyup', (e) => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
function pt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointerdown', (e) => { const p = pt(e); const inE = Math.hypot(p.x - btn.echo.x, p.y - btn.echo.y) <= btn.echo.r + 8, inQ = p.x >= btn.quiet.x && p.x <= btn.quiet.x + btn.quiet.w && p.y >= btn.quiet.y && p.y <= btn.quiet.y + btn.quiet.h, inP = Math.hypot(p.x - btn.pause.x, p.y - btn.pause.y) <= 30;
  if (inE) doPing(); else if (inQ) { quiet = !quiet; pending.push({ type: 'quiet', on: quiet }); } else if (inP) sim.paused = !sim.paused;
  else if (sim.state !== 'RUNNING' && p.y > 540 && p.y < 620) doRetry(); else pointer = { ...p, onUI: false }; });
cv.addEventListener('pointermove', (e) => { if (pointer) pointer = { ...pt(e), onUI: false }; }); addEventListener('pointerup', () => { pointer = null; });
requestAnimationFrame(frame);
// test hooks
window.__g = { freeze(v) { window.__hold = v; }, load, get sim() { return sim; }, setDebug(v) { debug = v; }, render, step(n, byTick = {}) { for (let i = 0; i < n; i++) sim.step(byTick[sim.tick] || []); render(); },
  playReplay(rep, until) { const by = {}; rep.inputs.forEach((i) => (by[i.tick] = by[i.tick] || []).push(i)); while (sim.state === 'RUNNING' && sim.tick < until) sim.step(by[sim.tick] || []); render(); } };
