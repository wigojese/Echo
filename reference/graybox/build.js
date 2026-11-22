'use strict';
// Writes levels.js so the graybox works from file:// without fetch.
const fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const out = { l01: { level: J('game/resources/levels/EC-L01.json'), geometry: J('game/resources/levels/EC-L01-geometry.json') },
  sealed: { level: J('tests/fixtures/sealed_level.json'), geometry: J('tests/fixtures/sealed_geometry.json') } };
fs.writeFileSync(path.join(__dirname, 'levels.js'), 'window.LEVELS=' + JSON.stringify(out) + ';\n');
