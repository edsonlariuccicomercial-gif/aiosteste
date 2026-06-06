import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreDir = resolve(__dirname, '../squads/caixa-escolar/dashboard/server-lib');

// Espelha build-product-store-browser.js — mantido idêntico de propósito (rede anti-drift).
function generate(src) {
  const names = [...src.matchAll(/export\s+(?:const|function)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
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

describe('product-store browser twin', () => {
  it('is in sync with the ESM core (regenerate via build-product-store-browser.js)', () => {
    const src = readFileSync(resolve(coreDir, 'product-store-core.js'), 'utf8');
    const current = readFileSync(resolve(coreDir, 'product-store-core.browser.js'), 'utf8');
    expect(current).toBe(generate(src));
  });
});
