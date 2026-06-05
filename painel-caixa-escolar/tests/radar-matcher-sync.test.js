import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreDir = resolve(__dirname, '../squads/caixa-escolar/dashboard/server-lib');

// Espelha build-radar-core-browser.js — mantido idêntico de propósito.
// Se a geração mudar lá, atualize aqui (este teste é a rede de proteção contra drift).
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

describe('radar-matcher browser twin', () => {
  it('is in sync with the ESM core (regenerate via build-radar-core-browser.js)', () => {
    const src = readFileSync(resolve(coreDir, 'radar-matcher-core.js'), 'utf8');
    const current = readFileSync(resolve(coreDir, 'radar-matcher-core.browser.js'), 'utf8');
    const expected = generate(src);
    expect(current).toBe(expected);
  });
});
