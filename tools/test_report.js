'use strict';
// Rebuilds docs/TEST_REPORT.md by running every suite and pasting its real output. Nothing in the report is typed by hand except the labels.
const { execSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
const sh = (c) => { try { return execSync(c, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }); } catch (e) { return (e.stdout || '') + (e.stderr || '') + `\n[exit ${e.status}]`; } };
const SUITES = [['node spike/stage06/tests.js', 'Acoustic solver reference'], ['node tests/js/stage07.test.js', 'Level validator, firewall scanner, style tokens'], ['node tests/js/stage08.test.js', 'Reference simulation'],
  ['node tests/js/stage09.test.js', 'Input router, planner and control modes'], ['node tests/js/stage11.test.js', 'Camera director'], ['node tests/js/stage11_gestures.test.js', 'Gesture conflicts'], ['node tests/js/stage12.test.js', 'Transitions'], ['node tests/js/stage13.test.js', 'Listener intelligence, fairness and causal replay']];
const out = {}; for (const [c] of SUITES) out[c] = sh(c);
const n = (c) => (out[c].match(/RESULT (\d+) passed, (\d+) failed/) || [0, '?', '?']);
const evid = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rc = evid('reference/evidence/render-contracts.txt'), tc = evid('reference/evidence/transitions-contracts.txt'), ia = fs.existsSync(path.join(root, 'reference/evidence/input-audit.txt')) ? evid('reference/evidence/input-audit.txt') : '(missing)';
const cnt = (t) => (t.match(/RESULT (\d+) passed, (\d+) failed/) || [0, '?', '?']);
const gd = sh("for f in $(find game tests -name '*.gd' | sort); do /tmp/gdenv/bin/gdparse \"$f\" >/dev/null 2>&1 && echo \"parsed ok  $f\" || echo \"PARSE FAIL  $f\"; done");
const L = [];
L.push('# Test report', '', `Updated ${new Date().toISOString().slice(0, 10)}. Host: ${process.version}, ${os.cpus()[0].model}, ${process.platform}/${process.arch}. Godot: **not installed, GDScript never executed**. No phone was used.`, '', '_Rebuilt by `node tools/test_report.js`, which runs each suite and pastes its output._', '', '## Status labels', '', '| Item | Label |', '|---|---|');
for (const [c, name] of SUITES) L.push(`| ${name}, ${n(c)[1]} tests${n(c)[2] === '0' ? '' : ' (' + n(c)[2] + ' FAILING)'} | IMPLEMENTED/TESTED |`);
L.push(`| Pixel-level render contracts, ${cnt(rc)[1]} checks (browser, software rendering) | IMPLEMENTED/TESTED, **not Godot** |`, `| Rendered-frame transition contracts, ${cnt(tc)[1]} checks (browser) | IMPLEMENTED/TESTED, **not Godot** |`, '| Emulated touch audit and input timing (headless Chromium) | EMULATED, not a phone |',
  `| GDScript syntax, ${(gd.match(/parsed ok/g) || []).length} files, gdtoolkit 4.5.0 | IMPLEMENTED/TESTED, **syntax only** |`, '| GDScript unit tests in `tests/run_tests.gd` (including the Stage 13 ones) | **BLOCKED/UNVERIFIED**, never run |', '| Engine-rendered screenshots, shaders, in-engine recording | **BLOCKED**, no Godot |',
  '| Haptics, real sound, finger feel, real-screen flash safety and brightness | **BLOCKED/UNVERIFIED**, no device |', '| Any claim about how a person plays EC-L01 | **BLOCKED/UNVERIFIED**. Strategy sweeps are authored scripts, not people |', '',
  'Manual test to close the Godot gap, on a machine with Godot 4.7:', '', '```bash', 'godot --headless --path . -s tests/run_tests.gd', '```', '', '## Captured output', '');
for (const [c] of SUITES) L.push(`### \`${c}\``, '```', out[c].trimEnd(), '```', '');
L.push('### `cat reference/evidence/render-contracts.txt`', '```', rc.trimEnd(), '```', '', '### `cat reference/evidence/transitions-contracts.txt`', '```', tc.trimEnd(), '```', '', '### `cat reference/evidence/input-audit.txt`', '```', ia.trimEnd(), '```', '');
L.push('### `node tools/check_firewall.js`', '```', sh('node tools/check_firewall.js').trimEnd(), '```', '', '### `node tools/map_validator/validate.js`', '```', sh('node tools/map_validator/validate.js').trimEnd(), '```', '', '### `node tools/predator/gen_docs.js --check`', '```', sh('node tools/predator/gen_docs.js --check').trimEnd(), '```', '', '### GDScript parse', '```', gd.trimEnd(), '```', '');
fs.writeFileSync(path.join(root, 'docs/TEST_REPORT.md'), L.join('\n'));
console.log('wrote docs/TEST_REPORT.md');
