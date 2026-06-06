import { describe, it, expect } from 'vitest';
import {
  emptyProduct,
  toCanonical,
  generateId,
  dedupeKey,
  enrich,
  mergeIntoSSoT,
  validateSSoT,
  SOURCE,
} from '../squads/caixa-escolar/dashboard/server-lib/product-store-core.js';

const NOW = '2026-06-06T00:00:00.000Z';

describe('toCanonical — alias resolution per base', () => {
  it('maps SSoT item (gdp.produtos.v1) keeping rich fields', () => {
    const raw = { id: null, sku: 'BANK-001-FILE-PEIT', descricao: 'Filé de Peito', ncm: '0207.14.00', unidade: 'Kg', custoBase: null, propostas: [{ preco: 10 }] };
    const c = toCanonical(raw, SOURCE.SSOT, { now: NOW });
    expect(c.descricao).toBe('Filé de Peito');
    expect(c.sku).toBe('BANK-001-FILE-PEIT');
    expect(c.unidade).toBe('Kg');
    expect(c.propostas).toEqual([{ preco: 10 }]);
    expect(c.id).toBeTruthy(); // id nulo resolvido
  });

  it('maps Intel item (nome/preco_custo/unidade_base/categoria → canônico)', () => {
    const raw = { id: 'PROD-X', sku: 'LICT-0001', nome: 'Abacaxi', categoria: 'Frutas', preco_custo: 6, unidade_base: 'UN', preco_referencia: 0, classificacao_kraljic: 'alavancagem' };
    const c = toCanonical(raw, SOURCE.INTEL, { now: NOW });
    expect(c.descricao).toBe('Abacaxi');
    expect(c.grupo).toBe('Frutas');
    expect(c.custoBase).toBe(6);
    expect(c.unidade).toBe('UN');
    expect(c.classificacao_kraljic).toBe('alavancagem');
  });

  it('maps Banco item (item/margemPadrao → canônico)', () => {
    const raw = { id: 'bp-001', item: 'Ventilador de parede', custoBase: 120, margemPadrao: 0.35, ultimaCotacao: '2026-02-15', precoReferencia: 189.9 };
    const c = toCanonical(raw, SOURCE.BANCO, { now: NOW });
    expect(c.descricao).toBe('Ventilador de parede');
    expect(c.margemAlvo).toBe(0.35);
    expect(c.precoReferencia).toBe(189.9);
    expect(c.ultimaCotacao).toBe('2026-02-15');
  });

  it('defaults unidade to UN and never leaves null arrays', () => {
    const c = toCanonical({ nome: 'X' }, SOURCE.ESTOQUE, { now: NOW });
    expect(c.unidade).toBe('UN');
    expect(c.concorrentes).toEqual([]);
    expect(c.fonte).toBe('migracao_' + SOURCE.ESTOQUE);
    expect(c.criadoEm).toBe(NOW);
  });
});

describe('generateId / dedupeKey', () => {
  it('generates a stable id from seed', () => {
    expect(generateId('LICT-0001')).toBe(generateId('LICT-0001'));
    expect(generateId('LICT-0001')).toMatch(/^PROD-/);
  });

  it('dedupeKey prefers sku, falls back to normalized name', () => {
    expect(dedupeKey({ sku: 'ABC', descricao: 'Arroz' })).toBe('sku:abc');
    expect(dedupeKey({ sku: '', descricao: 'Arroz Tipo 1' })).toBe('name:arroz');
    expect(dedupeKey({ sku: '', descricao: '' })).toBe('');
  });
});

describe('enrich — non-destructive', () => {
  it('fills empty scalars but never overwrites present ones', () => {
    const base = toCanonical({ sku: 'A', descricao: 'Arroz', custoBase: 20 }, SOURCE.SSOT, { now: NOW });
    const extra = toCanonical({ sku: 'A', descricao: 'Arroz', custoBase: 99, ncm: '1006.30.21' }, SOURCE.BANCO, { now: NOW });
    enrich(base, extra);
    expect(base.custoBase).toBe(20);   // SSoT vence (não sobrescreve)
    expect(base.ncm).toBe('1006.30.21'); // estava vazio → preenche
  });

  it('unions array fields without duplicates', () => {
    const base = toCanonical({ sku: 'A', descricao: 'X', concorrentes: [{ nome: 'C1', preco: 1 }] }, SOURCE.SSOT, { now: NOW });
    const extra = toCanonical({ sku: 'A', descricao: 'X', concorrentes: [{ nome: 'C1', preco: 1 }, { nome: 'C2', preco: 2 }] }, SOURCE.BANCO, { now: NOW });
    enrich(base, extra);
    expect(base.concorrentes).toHaveLength(2);
  });
});

describe('mergeIntoSSoT — consolidation', () => {
  const bases = {
    [SOURCE.SSOT]: [
      { sku: 'BANK-001', descricao: 'Filé de Peito', custoBase: 18 },
      { sku: 'BANK-002', descricao: 'Arroz Tipo 1', custoBase: 20 },
    ],
    [SOURCE.BANCO]: [
      { id: 'bp-1', item: 'Arroz Tipo 1', margemPadrao: 0.3 }, // dup de BANK-002 por nome
    ],
    [SOURCE.INTEL]: [
      { sku: 'LICT-0001', nome: 'Abacaxi', preco_custo: 6 }, // órfão
      { sku: 'LICT-0002', nome: 'Alface', preco_custo: 2 },  // órfão
    ],
    [SOURCE.ESTOQUE]: [
      { sku: 'LICT-0001', nome: 'Abacaxi', preco_referencia: 6.9 }, // dup do Intel por sku
    ],
  };

  it('absorbs orphans and dedupes by sku/name', () => {
    const { itens, stats } = mergeIntoSSoT(bases, { now: NOW });
    // BANK-001, BANK-002(+banco enrich), LICT-0001(+estoque enrich), LICT-0002 = 4 únicos
    expect(itens).toHaveLength(4);
    expect(stats.novos).toBe(4);
    expect(stats.enriquecidos).toBe(2); // arroz por nome + abacaxi por sku
  });

  it('enriches the SSoT product without losing its cost (SSoT precedence)', () => {
    const { itens } = mergeIntoSSoT(bases, { now: NOW });
    const arroz = itens.find((p) => p.descricao === 'Arroz Tipo 1');
    expect(arroz.custoBase).toBe(20);     // mantém custo da SSoT
    expect(arroz.margemAlvo).toBe(0.3);   // enriquece com margem do banco
  });

  it('absorbed Intel orphan carries cost from estoque enrichment', () => {
    const { itens } = mergeIntoSSoT(bases, { now: NOW });
    const abacaxi = itens.find((p) => p.descricao === 'Abacaxi');
    expect(abacaxi.custoBase).toBe(6);          // do Intel
    expect(abacaxi.precoReferencia).toBe(6.9);  // enriquecido do estoque
  });

  it('every consolidated product has a non-null id', () => {
    const { itens } = mergeIntoSSoT(bases, { now: NOW });
    expect(itens.every((p) => !!p.id)).toBe(true);
  });
});

describe('validateSSoT — post-migration gate', () => {
  it('passes a clean collection', () => {
    const itens = [
      { id: 'A', sku: 'S1', descricao: 'X' },
      { id: 'B', sku: 'S2', descricao: 'Y' },
    ];
    const r = validateSSoT(itens, { minCount: 2 });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('flags null ids, dup skus, empty descriptions and undercount', () => {
    const itens = [
      { id: null, sku: 'S1', descricao: 'X' },
      { id: 'B', sku: 'S1', descricao: '' },
    ];
    const r = validateSSoT(itens, { minCount: 5 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('id nulo'))).toBe(true);
    expect(r.errors.some((e) => e.includes('sku'))).toBe(true);
    expect(r.errors.some((e) => e.includes('descrição'))).toBe(true);
    expect(r.errors.some((e) => e.includes('mínimo'))).toBe(true);
  });
});
