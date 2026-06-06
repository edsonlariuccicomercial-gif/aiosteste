// Gera product-store-core.browser.js (classic script) a partir do core ESM.
// Fonte única de verdade = product-store-core.js. Rode após editar o core:
//   node squads/caixa-escolar/dashboard/server-lib/build-product-store-browser.js
// Um teste (product-store-sync.test.js) garante que o twin esteja sempre atualizado.
//
// Diferença para o build do radar: este core IMPORTA normalizeProductName de
// radar-matcher-core. No browser, esse símbolo vem de window.RadarMatcherCore
// (carregado antes). Por isso a linha de import é removida e substituída por um alias.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const srcPath = path.join(dir, 'product-store-core.js');
const outPath = path.join(dir, 'product-store-core.browser.js');

function generate(src) {
  const names = [...src.matchAll(/export\s+(?:const|function)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  // Remove a linha de import ESM e os "export " de declaração.
  let body = src.replace(/^import\s+.*?;\s*$/gm, '');
  body = body.replace(/^export\s+/gm, '');
  const header = '/* AUTO-GERADO de product-store-core.js — NÃO editar à mão.\n'
    + '   Twin de browser (classic script) do core ESM. Regenerar com:\n'
    + '   node server-lib/build-product-store-browser.js\n'
    + '   Requer RadarMatcherCore (radar-matcher-core.browser.js) carregado ANTES. */\n'
    + '(function (root) {\n  "use strict";\n'
    + '  var normalizeProductName = (root.RadarMatcherCore && root.RadarMatcherCore.normalizeProductName)\n'
    + '    || function (n) { return String(n || "").toLowerCase().trim(); };\n';
  const footer = '\n  root.ProductStoreCore = { ' + names.join(', ') + ' };\n'
    + '})(typeof window !== "undefined" ? window : globalThis);\n';
  return header + body + footer;
}

module.exports = { generate };

if (require.main === module) {
  const src = fs.readFileSync(srcPath, 'utf8');
  fs.writeFileSync(outPath, generate(src));
  console.log('[build-product-store-browser] product-store-core.browser.js atualizado.');
}
