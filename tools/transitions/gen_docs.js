'use strict';
// Generates docs/TRANSITIONS.md from the specs in reference/transitions/transitions.js so the document cannot drift from the code.
const fs = require('fs'), path = require('path'); const { SPECS } = require('../../reference/transitions/transitions');
function kf(s) { return s.keyframes.map((k) => { const { t, ...r } = k; return `${Math.round(t * 100) / 100}: ${Object.entries(r).map(([a, b]) => a + ' ' + b).join(', ')}`; }).join('; '); }
function build() {
  const ids = Object.keys(SPECS); let o = '# The eight signature transitions\n\nGenerated from `reference/transitions/transitions.js` by `node tools/transitions/gen_docs.js --write`. A test fails if this file and the code disagree.\n\n';
  o += '## Timing and curve table\n\n| ID | Transition | Duration | Curve | Clock | Cancel | Skip |\n|---|---|---|---|---|---|---|\n';
  for (const id of ids) { const s = SPECS[id]; o += `| ${id} | ${s.name} | ${s.durMs} ms${s.settleMs ? ' then ' + s.settleMs + ' ms settle' : ''} | ${s.easing} | ${s.clock} | ${s.cancel} | ${s.skip} |\n`; }
  o += '\n## One block per transition\n';
  for (const id of ids) { const s = SPECS[id]; o += `\n### ${id}. ${s.name}\n\n- **Trigger:** ${s.trigger}\n- **Start transform:** ${s.start}\n- **End transform:** ${s.end}\n- **Keyframes (fraction of duration):** ${kf(s)}\n- **Midpoint visual:** ${s.midpoint}\n- **Pairing:** haptic \`${s.pairing.haptic}\`, sound \`${s.pairing.sound}\`\n- **Skip:** ${s.skip}\n- **Cancel policy:** ${s.cancel === 'snap-end' ? 'jump to the end state' : 'return to rest'}\n- **Reduced motion:** ${s.reduced}\n- **Failure fallback:** ${s.fallback}\n- **Driven by:** ${s.clock}\n${s.minGapMs ? `- **Rate limit:** at most once every ${s.minGapMs} ms\\n` : ''}${s.oncePerSession ? '- **Runs once per session**\\n' : ''}`; }
  return o;
}
module.exports = { build };
if (require.main === module && process.argv.includes('--write')) { fs.writeFileSync(path.resolve(__dirname, '../../docs/TRANSITIONS.md'), build()); console.log('wrote docs/TRANSITIONS.md'); }
