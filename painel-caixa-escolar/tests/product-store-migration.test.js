import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  mergeIntoSSoT,
  validateSSoT,
  SOURCE,
} from '../squads/caixa-escolar/dashboard/server-lib/product-store-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapDir = resolve(__dirname, '../../docs/architecture/data-snapshots/2026-06-06T00-00-00');

function load(file) {
  const d = JSON.parse(readFileSync(resolve(snapDir, file), 'utf8'));
  return (d && (d.itens || d.items || (Array.isArray(d) ? d : []))) || [];
}

// Validação da migração contra os dados REAIS de produção (backup da Fase 0).
// Se o snapshot não existir (CI sem backup), o teste é pulado — não quebra a suíte.
const hasSnapshot = existsSync(resolve(snapDir, '_manifest.json'));

describe.skipIf(!hasSnapshot)('migração consolidadora — dados reais (backup Fase 0)', () => {
  // Nota: o script de backup (Fase 0) sanitizou hífens → underscores nos nomes de arquivo.
  const bases = {
    [SOURCE.SSOT]: load('gdp.produtos.v1.json'),
    [SOURCE.BANCO]: load('caixaescolar.banco.v1.json'),
    [SOURCE.INTEL]: load('intel.central_produtos.v2.json'),
    [SOURCE.ESTOQUE]: load('gdp.estoque_intel.produtos.v1.json'),
  };

  it('consolida sem perder catálogo (>= SSoT) e passa no gate', () => {
    const { itens, stats } = mergeIntoSSoT(bases, { now: '2026-06-06T00:00:00.000Z' });
    // não pode ser menor que a SSoT atual (270) — absorção só adiciona
    expect(itens.length).toBeGreaterThanOrEqual(bases[SOURCE.SSOT].length);
    // deve absorver os órfãos da Intel (catálogo cresce além dos 270)
    expect(itens.length).toBeGreaterThan(bases[SOURCE.SSOT].length);
    const v = validateSSoT(itens, { minCount: bases[SOURCE.SSOT].length });
    expect(v.ok, v.errors.join('; ')).toBe(true);
    expect(stats.semChave).toBe(0);
  });

  it('preserva produtos com custo/preço da SSoT', () => {
    const { itens } = mergeIntoSSoT(bases, { now: '2026-06-06T00:00:00.000Z' });
    expect(itens.filter((p) => p.custoBase > 0).length).toBeGreaterThanOrEqual(150);
  });

  it('absorve órfãos hortifruti da Intel (abacaxi/alface/alho)', () => {
    const { itens } = mergeIntoSSoT(bases, { now: '2026-06-06T00:00:00.000Z' });
    const nomes = itens.map((p) => (p.descricao || '').toLowerCase());
    expect(nomes.some((n) => n.includes('abacaxi'))).toBe(true);
    expect(nomes.some((n) => n.includes('alface'))).toBe(true);
  });
});
