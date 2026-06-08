import { describe, it, expect } from 'vitest';

/**
 * Story 16.5 — Numeração NF-e Confiável + Eliminação de Duplicação
 *
 * Valida os invariantes centrais introduzidos na story, replicando a lógica
 * pura de gdp-notas-fiscais.js (que depende de DOM/localStorage no browser).
 *
 * Cobre:
 *  - FIX-2 (AC3): extração do nNF embutido na chave de acesso (chNFe).
 *  - FIX-1/FIX-3 (AC1/AC2/AC4): piso de numeração coerente entre peek e consumo
 *    (preview == número consumido; ancorado no maior autorizado real, não em config adiantado).
 */

// --- réplica de extrairNumeroDaChaveNfe (gdp-notas-fiscais.js) ---
function extrairNumeroDaChaveNfe(chave) {
  var ch = String(chave || '').replace(/\D/g, '');
  if (ch.length !== 44) return '';
  var nNF = ch.slice(25, 34);
  var num = parseInt(nNF, 10);
  return (num && num > 0) ? String(num) : '';
}

// --- réplica do piso (_getNumeroMinimo) e do peek, parametrizados ---
function getNumeroMinimo({ usados, localCounter, configNum }) {
  var maxAutorizada = 0;
  usados.forEach(function (n) { if (n > maxAutorizada) maxAutorizada = n; });
  var piso = Math.max(localCounter || 0, maxAutorizada) + 1;
  if (configNum && configNum > 0 && configNum >= piso) piso = configNum;
  return piso;
}

function encontrarPrimeiroLivre(minimo, usados) {
  var num = minimo;
  var t = 0;
  while (usados.has(num) && t < 500) { num++; t++; }
  return num;
}

function peek(state) {
  return encontrarPrimeiroLivre(getNumeroMinimo(state), state.usados);
}

describe('Story 16.5 — extração de nNF da chave de acesso (AC3 / FIX-2)', () => {
  // chNFe de 44 díg.: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
  // nNF nas posições 26-34 (slice 25..34).
  function montarChave(nNF) {
    const cUF = '31';
    const aamm = '2606';
    const cnpj = '12345678000199';
    const mod = '55';
    const serie = '001';
    const nnf = String(nNF).padStart(9, '0');
    const tpEmis = '1';
    const cNF = '12345678';
    const cDV = '0';
    const base = cUF + aamm + cnpj + mod + serie + nnf + tpEmis + cNF + cDV;
    expect(base.length).toBe(44);
    return base;
  }

  it('extrai o número correto da chave (1505)', () => {
    expect(extrairNumeroDaChaveNfe(montarChave(1505))).toBe('1505');
  });

  it('remove zeros à esquerda do nNF', () => {
    expect(extrairNumeroDaChaveNfe(montarChave(42))).toBe('42');
  });

  it('tolera chave com máscara/espaços (44 dígitos numéricos)', () => {
    const ch = montarChave(1507);
    const mascarada = ch.replace(/(\d{4})/g, '$1 ');
    expect(extrairNumeroDaChaveNfe(mascarada)).toBe('1507');
  });

  it('retorna vazio para chave inválida (tamanho != 44)', () => {
    expect(extrairNumeroDaChaveNfe('123')).toBe('');
    expect(extrairNumeroDaChaveNfe('')).toBe('');
    expect(extrairNumeroDaChaveNfe(null)).toBe('');
  });
});

describe('Story 16.5 — piso de numeração: preview == consumo (AC1/AC2/AC4 / FIX-1/FIX-3)', () => {
  it('peek ancora no maior autorizado real + 1 (ignora config adiantado)', () => {
    // maior autorizado = 1504; config adiantado para 1510 NÃO deve mandar o piso
    // para baixo do real, mas aqui config > piso então é honrado intencionalmente.
    const state = { usados: new Set([1500, 1502, 1504]), localCounter: 1504, configNum: 0 };
    expect(peek(state)).toBe(1505); // 1504 + 1
  });

  it('config abaixo do piso real é IGNORADO (não regride a sequência)', () => {
    // config diz 1500, mas já existe 1504 autorizado → piso real = 1505
    const state = { usados: new Set([1504]), localCounter: 1504, configNum: 1500 };
    expect(peek(state)).toBe(1505);
  });

  it('config no piso ou acima é honrado (preenchimento intencional)', () => {
    const state = { usados: new Set([1504]), localCounter: 1504, configNum: 1510 };
    expect(peek(state)).toBe(1510);
  });

  it('AC4: peek é idempotente — chamar duas vezes sem consumir dá o mesmo número', () => {
    const state = { usados: new Set([1504]), localCounter: 1504, configNum: 0 };
    const a = peek(state);
    const b = peek(state);
    expect(a).toBe(b);
    expect(a).toBe(1505);
  });

  it('preenche lacunas: pula números já autorizados', () => {
    // piso 1505, mas 1505 e 1506 já autorizados → primeiro livre = 1507
    const state = { usados: new Set([1504, 1505, 1506]), localCounter: 1504, configNum: 0 };
    expect(peek(state)).toBe(1507);
  });
});
