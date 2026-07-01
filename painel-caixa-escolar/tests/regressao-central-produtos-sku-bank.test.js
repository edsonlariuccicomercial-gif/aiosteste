import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'node:vm';

/**
 * PROVA DA REGRESSÃO — Central de Produtos: SKU vira BANK-* (não é réplica).
 * ========================================================================
 * Hipótese (analyst 2026-07-01): o fix do sanitizeBancoProduto preserva SKU
 * VÁLIDO, mas NÃO fecha o caminho que injeta SKU vazio. Quando um produto chega
 * com sku "" ou null (ex.: echo do realtime via writeLocalItems, que NÃO passa
 * pelo sanitize; ou linha da tabela com sku vazio), o sanitizeBancoProduto
 * GERA um BANK-<idx> — e esse SKU inventado é então propagado (saveBancoProdutos)
 * para a tabela, poluindo todas as máquinas. A regressão está no fato de o
 * sanitize INVENTAR um SKU persistível em vez de tratar a falta na origem.
 *
 * Carrega as funções REAIS de gdp-banco-produtos.js + gdp-core.js.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreSrc = readFileSync(
  resolve(__dirname, '../squads/caixa-escolar/dashboard/js/gdp-core.js'),
  'utf8'
);
const bancoSrc = readFileSync(
  resolve(__dirname, '../squads/caixa-escolar/dashboard/js/gdp-banco-produtos.js'),
  'utf8'
);

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`função ${name} não encontrada em fonte`);
  // fecha o parêntese da lista de parâmetros primeiro (pode conter '{}' em defaults)
  let p = src.indexOf('(', start);
  let pdepth = 0;
  for (; p < src.length; p++) {
    if (src[p] === '(') pdepth++;
    else if (src[p] === ')') { pdepth--; if (pdepth === 0) { p++; break; } }
  }
  // agora acha a '{' do CORPO da função
  let i = src.indexOf('{', p);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function buildSandbox() {
  const sandbox = {
    console: { warn() {}, error() {}, log() {} },
    Date, JSON, Array, String, Object, RegExp,
    window: {},
    gdpWarn() {}, gdpLog() {},
    normalizeSchoolName: (s) => String(s || '').toLowerCase().trim(),
  };
  const code = [
    // funções reais de gdp-core.js usadas pelo sanitize
    extractFn(coreSrc, 'stripLegacyErpFields'),
    extractFn(coreSrc, 'buildAutoSku'),
    extractFn(coreSrc, 'isLegacyExternalSku'),
    extractFn(coreSrc, 'normalizeInternalSku'),
    // funções reais de gdp-banco-produtos.js
    'var PRODUTO_DEFAULTS = ' + JSON.stringify({
      id: null, descricao: '', sku: '', ncm: '', unidade: 'UN', marca: '',
      custoBase: null, precoReferencia: null, margemAlvo: null, custosFornecedor: [],
      concorrentes: [], propostas: [], historicoResultados: [], precoReferenciaHistorico: null,
      taxaConversao: null, grupo: '', fonte: '', produto_critico: false,
      embalagem_descricao: '', criadoEm: null, atualizadoEm: null,
    }) + ';',
    extractFn(bancoSrc, 'getProdutoComDefaults'),
    extractFn(bancoSrc, 'sanitizeBancoProduto'),
    'this.__api={ sanitizeBancoProduto, isLegacyExternalSku };',
  ].join('\n\n');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

describe('REGRESSÃO: Central de Produtos gera SKU BANK-* a partir de SKU ausente', () => {
  const sb = buildSandbox();

  it('SKU válido LICT-* é preservado (o fix pontual funciona)', () => {
    const p = sb.__api.sanitizeBancoProduto({ descricao: 'Feijão', sku: 'LICT-0065' }, 0);
    expect(p.sku).toBe('LICT-0065'); // guard preserva — OK
  });

  it('VETOR DA REGRESSÃO: produto com SKU vazio (echo realtime / linha stale) NÃO deveria virar BANK-*', () => {
    // Um produto que REALMENTE tem SKU LICT-0065 na tabela, mas chega pelo realtime
    // com sku vazio (writeLocalItems não sanitiza; ou mapFromTable trouxe vazio).
    // O sanitize INVENTA um BANK-* que depois é propagado para a tabela — poluindo
    // a fonte de verdade. O correto seria NÃO inventar um SKU persistível aqui.
    const p = sb.__api.sanitizeBancoProduto({ descricao: 'Feijão Preto Tipo 1', sku: '' }, 0);
    expect(
      p.sku.startsWith('BANK-'),
      `sanitize inventou SKU persistível "${p.sku}" a partir de SKU vazio — este é o vetor que repolui a tabela com BANK-*`
    ).toBe(false);
  });

  it('VETOR DA REGRESSÃO: SKU null também vira BANK-* (mesmo problema)', () => {
    const p = sb.__api.sanitizeBancoProduto({ descricao: 'Arroz', sku: null }, 3);
    expect(p.sku.startsWith('BANK-'), `SKU null virou "${p.sku}"`).toBe(false);
  });
});
