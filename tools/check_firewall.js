'use strict';
// Information firewall check. View-layer scripts must never name ground truth.
// Scans every .gd file under the view-layer folders for forbidden identifiers.
const fs = require('fs'), path = require('path');
const VIEW_DIRS = ['game/scripts/camera', 'game/scripts/rendering', 'game/scripts/input', 'game/scripts/audio'];
const FORBIDDEN = [/\bWorldTruth\b/, /\bground_truth\b/i, /\bpredators\b/, /\bexit_position\b/, /\bsound_grid\b/, /\bAcousticFieldSolver\b/];

function walk(dir) { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }

const violations = []; let scanned = 0;
for (const d of VIEW_DIRS) for (const f of walk(d).filter((x) => x.endsWith('.gd'))) {
  scanned++;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/##?.*$/, ''); // comments may name the rule
    for (const re of FORBIDDEN) if (re.test(code)) violations.push(`${f}:${i + 1} references ${re.source}: ${line.trim()}`);
  });
}
console.log(`FIREWALL scanned ${scanned} view-layer script(s) in ${VIEW_DIRS.join(', ')}`);
if (violations.length) { violations.forEach((v) => console.log('VIOLATION ' + v)); process.exit(1); }
console.log('FIREWALL OK: no view-layer script references ground truth');
module.exports = { };
