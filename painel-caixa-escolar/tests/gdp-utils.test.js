// Tests for gdp-utils.js — MED-N (ONDA 3): utilitários compartilhados canônicos.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(__dirname, '../squads/caixa-escolar/dashboard/js/gdp-utils.js'),
  'utf-8'
);

// Carrega o IIFE num harness com window stubado (o módulo expõe em window.*).
function load() {
  const win = {};
  const fn = new Function('window', 'module', src);
  fn(win, undefined);
  return win.gdpUtils;
}

describe('gdp-utils — parseNumeroBR', () => {
  const { parseNumeroBR } = load();
  it('formato BR milhar+decimal "1.234,56"', () => expect(parseNumeroBR('1.234,56')).toBe(1234.56));
  it('só decimal vírgula "1234,56"', () => expect(parseNumeroBR('1234,56')).toBe(1234.56));
  it('decimal ponto puro "1234.56"', () => expect(parseNumeroBR('1234.56')).toBe(1234.56));
  it('com moeda "R$ 1.234,56"', () => expect(parseNumeroBR('R$ 1.234,56')).toBe(1234.56));
  it('número já numérico', () => expect(parseNumeroBR(5)).toBe(5));
  it('vazio → 0', () => expect(parseNumeroBR('')).toBe(0));
  it('null → 0', () => expect(parseNumeroBR(null)).toBe(0));
  it('lixo não-numérico → 0', () => expect(parseNumeroBR('abc')).toBe(0));
  it('negativo "-12,50"', () => expect(parseNumeroBR('-12,50')).toBe(-12.5));
});

describe('gdp-utils — precoComMargem', () => {
  const { precoComMargem } = load();
  it('custo 10, margem 0.30 → 13', () => expect(precoComMargem(10, 0.3)).toBe(13));
  it('custo 0 → 0', () => expect(precoComMargem(0, 0.3)).toBe(0));
  it('custo negativo → 0', () => expect(precoComMargem(-5, 0.3)).toBe(0));
  it('arredonda 2 casas', () => expect(precoComMargem(9.99, 0.15)).toBe(11.49));
  it('margem 0 → custo', () => expect(precoComMargem(20, 0)).toBe(20));
});

describe('gdp-utils — calcularSimilaridade', () => {
  const { calcularSimilaridade } = load();
  it('idêntico (ignora caixa/acento) → 100 exato', () => {
    const r = calcularSimilaridade('Feijão Carioca', 'FEIJAO CARIOCA');
    expect(r.score).toBe(100); expect(r.tipo).toBe('exato');
  });
  it('sem relação → sem-match', () => {
    const r = calcularSimilaridade('Arroz Branco', 'Detergente Neutro');
    expect(r.tipo).toBe('sem-match');
  });
  it('substring longa → 90 exato', () => {
    const r = calcularSimilaridade('Arroz Branco Tipo 1 Pacote', 'Arroz Branco Tipo 1');
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
});
