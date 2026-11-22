'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { validate } = require('../../tools/map_validator/validate');
const root = path.resolve(__dirname, '../..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const level = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/levels/EC-L01.json'), 'utf8'));
const geo = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/levels/EC-L01-geometry.json'), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

// Validator
check('validator accepts EC-L01', validate(level, geo).length === 0, JSON.stringify(validate(level, geo)));
{ const g = clone(geo); g.polygons = [{ id: 'bowtie', points: [[0, 0], [4, 4], [4, 0], [0, 4]] }];
  const p = validate(level, g); check('validator rejects a self-intersecting polygon', p.some((m) => /self-intersects/.test(m)), p[0]); }
{ const g = clone(geo); g.polygons = [{ id: 'cw', points: [[0, 0], [0, 4], [4, 4], [4, 0]] }];
  const p = validate(level, g); check('validator rejects clockwise winding', p.some((m) => /clockwise/.test(m)), p[0]); }
{ const l = clone(level); l.goal.exit_xy = [8, 3];
  const p = validate(l, geo); check('validator rejects an exit inside a wall', p.some((m) => /Exit .* inside a wall/.test(m)), p[0]); }
{ const l = clone(level), g = clone(geo); // remove both routes to the exit: the main corridor and the side connector (their ends overlap the exit strip)
  g.walkable_strips = g.walkable_strips.filter((s) => !(s[0] === 19 && s[1] === 17 && s[2] === 19) && !(s[0] === 11 && s[1] === 24 && s[2] === 19));
  const p = validate(l, g); check('validator rejects a sealed exit', p.some((m) => /sealed/.test(m)), p[0]); }
{ const l = clone(level); l.player.spawn_xy = [8, 3];
  const p = validate(l, geo); check('validator rejects a spawn inside a wall', p.some((m) => /Spawn/.test(m)), p[0]); }
{ const g = clone(geo); g.half_width_m = 0.3;
  const p = validate(level, g); check('validator rejects corridors narrower than 0.65 m', p.some((m) => /minimum/.test(m)), p[0]); }

// Firewall
{ const r = cp.spawnSync('node', ['tools/check_firewall.js'], { cwd: root, encoding: 'utf8' });
  check('firewall passes on the real repository', r.status === 0, r.stdout.split('\n')[0]); }
{ const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-')); fs.mkdirSync(path.join(tmp, 'game/scripts/camera'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'game/scripts/camera/bad.gd'), 'extends Node\nfunc f(t: WorldTruth):\n    return t.predators[0]\n');
  const r = cp.spawnSync('node', [path.join(root, 'tools/check_firewall.js')], { cwd: tmp, encoding: 'utf8' });
  check('firewall catches a camera script that reads WorldTruth and predators', r.status === 1 && /WorldTruth/.test(r.stdout) && /predators/.test(r.stdout), `exit=${r.status}`); }

// Tokens: no blue family, text contrast
const tok = JSON.parse(fs.readFileSync(path.join(root, 'game/resources/style_tokens/plate_tokens.json'), 'utf8'));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hue = (h) => { const [r, g, b] = rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return [0, 0];
  const H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(H * 60 + 360) % 360, d / (1 - Math.abs(mx + mn - 1) || 1)]; };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const blue = Object.entries(tok.palette).filter(([, v]) => { const [h, s] = hue(v); return h >= 175 && h <= 255 && s > 0.12; }).map(([k]) => k);
check('tokens: no blue, teal or cyan hue in the palette', blue.length === 0, blue.join(',') || '');
const black = tok.palette.plate_black;
for (const k of ['paper_chalk', 'fresh_contact', 'secondary_ui', 'caution_amber', 'confirmed_danger']) check(`tokens: ${k} has at least 4.5:1 text contrast on plate black`, cr(tok.palette[k], black) >= 4.5, cr(tok.palette[k], black).toFixed(1) + ':1');
check('tokens: near_expired_residue is below 4.5:1, so it can never carry required information', cr(tok.palette.near_expired_residue, black) < 4.5, cr(tok.palette.near_expired_residue, black).toFixed(1) + ':1');
check('tokens: age thresholds are strictly increasing and end at the 8 s memory limit', (() => { const a = tok.age_seconds; return a.fresh_until < a.afterglow_until && a.afterglow_until < a.memory_until && a.memory_until < a.residue_until && a.residue_until === 8.0; })());

console.log(`RESULT ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
