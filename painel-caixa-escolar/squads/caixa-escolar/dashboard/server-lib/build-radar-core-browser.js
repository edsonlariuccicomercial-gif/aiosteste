// Gera radar-matcher-core.browser.js (classic script) a partir do core ESM.
// Fonte única de verdade = radar-matcher-core.js. Rode após editar o core:
//   node squads/caixa-escolar/dashboard/server-lib/build-radar-core-browser.js
// Um teste (radar-matcher-sync.test.js) garante que o twin esteja sempre atualizado.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const srcPath = path.join(dir, 'radar-matcher-core.js');
const outPath = path.join(dir, 'radar-matcher-core.browser.js');

function generate(src) {
  const names = [...src.matchAll(/export\s+(?:const|function)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const body = src.replace(/^export\s+/gm, '');
  const header = '/* AUTO-GERADO de radar-matcher-core.js — NÃO editar à mão.\n'
    + '   Twin de browser (classic script) do core ESM. Regenerar com:\n'
    + '   node server-lib/build-radar-core-browser.js */\n'
    + '(function (root) {\n  "use strict";\n';
  const footer = '\n  root.RadarMatcherCore = { ' + names.join(', ') + ' };\n'
    + '})(typeof window !== "undefined" ? window : globalThis);\n';
  return header + body + footer;
}

module.exports = { generate };

if (require.main === module) {
  const src = fs.readFileSync(srcPath, 'utf8');
  fs.writeFileSync(outPath, generate(src));
  console.log('[build-radar-core-browser] radar-matcher-core.browser.js atualizado.');
}
