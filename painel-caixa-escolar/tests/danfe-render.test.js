// Tests para danfe-render.js — DANFE única (T1+T2). O teste-chave: nota da AUTOCURA (sem preview)
// deve sair com o emitente COMPLETO (razão, CNPJ, IE, endereço) a partir do fallback nexedu.empresa.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(__dirname, '../squads/caixa-escolar/dashboard/js/danfe-render.js'),
  'utf-8'
);

// Harness: carrega o IIFE com window + localStorage stubados.
function load(empresaSeed) {
  const store = {
    'nexedu.empresa': JSON.stringify(empresaSeed || {}),
    'nexedu.config.notas-fiscais': JSON.stringify({ logomarcaBase64: 'data:image/png;base64,LOGO' })
  };
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  win.window = win;
  const fn = new Function('window', 'localStorage', 'module', src);
  fn(win, win.localStorage, undefined);
  return win;
}

const EMPRESA = {
  razaoSocial: 'LARIUCCI COMERCIO LTDA', nome: 'LARIUCCI', cnpj: '36802147000142',
  ie: '0037031900069', logradouro: 'AV DAS CANDIUVAS', numero: '85', bairro: 'RIBALTA',
  cidade: 'CONQUISTA', uf: 'MG', cep: '38195000', telefone: '16981914537', email: 'contato@lariucci.com'
};

// NF da AUTOCURA: SEM sefaz.preview (o cenário que hoje falha).
const NF_AUTOCURA = {
  id: 'NF1', numero: '1625', serie: '1', status: 'autorizada', valor: 391.46,
  emitidaEm: '2026-07-01T13:00:00Z',
  sefaz: { chaveAcesso: '31260636802147000142550010000016251336577344', protocolo: '131267658356713' },
  itens: [{ descricao: 'Arroz 5kg', ncm: '10063021', qtd: 10, precoUnitario: 19.70, unidade: 'PC' }],
  cliente: { nome: 'ESCOLA TESTE', cnpj: '11222333000144' }
};

describe('danfe-render — resolveEmitente (T2)', () => {
  it('nota SEM preview (autocura) → usa nexedu.empresa (fallback permanente)', () => {
    const { resolveEmitente } = load(EMPRESA);
    const e = resolveEmitente(NF_AUTOCURA);
    expect(e.razaoSocial).toBe('LARIUCCI COMERCIO LTDA');
    expect(e.cnpj).toBe('36802147000142');
    expect(e.ie).toBe('0037031900069'); // ← a IE que faltava
    expect(e.endereco.cidade).toBe('CONQUISTA');
    expect(e.endereco.uf).toBe('MG');
  });

  it('preview COMPLETO tem precedência sobre o fallback', () => {
    const { resolveEmitente } = load(EMPRESA);
    const nf = { ...NF_AUTOCURA, sefaz: { ...NF_AUTOCURA.sefaz, preview: { emitente: {
      razaoSocial: 'RAZAO DO PREVIEW', cnpj: '99999999000199', ie: '111222333',
      endereco: { cidade: 'FRUTAL', uf: 'MG' }
    } } } };
    const e = resolveEmitente(nf);
    expect(e.razaoSocial).toBe('RAZAO DO PREVIEW');
    expect(e.ie).toBe('111222333');
  });

  it('preview PARCIAL (sem ie) → completa com o fallback campo-a-campo', () => {
    const { resolveEmitente } = load(EMPRESA);
    const nf = { ...NF_AUTOCURA, sefaz: { ...NF_AUTOCURA.sefaz, preview: { emitente: {
      razaoSocial: 'RAZAO PARCIAL', cnpj: '' // sem cnpj/ie → não é "completo"
    } } } };
    const e = resolveEmitente(nf);
    expect(e.razaoSocial).toBe('RAZAO PARCIAL'); // do preview
    expect(e.ie).toBe('0037031900069');          // completado do fallback
  });

  it('sem preview e sem nexedu.empresa → nunca quebra (labels vazios)', () => {
    const { resolveEmitente } = load({});
    const e = resolveEmitente(NF_AUTOCURA);
    expect(e.razaoSocial).toBe('');
    expect(e).toHaveProperty('endereco');
  });
});

describe('danfe-render — renderDanfeHTML (T1)', () => {
  it('HTML da autocura contém emitente completo + IE + logo + número padronizado', () => {
    const { renderDanfeHTML, resolveEmitente } = load(EMPRESA);
    const html = renderDanfeHTML(NF_AUTOCURA, resolveEmitente(NF_AUTOCURA), { includeBarcode: false, autoPrint: false });
    expect(html).toContain('LARIUCCI COMERCIO LTDA');
    expect(html).toContain('36802147000142');
    expect(html).toContain('0037031900069');           // IE presente
    expect(html).toContain('data:image/png;base64,LOGO'); // logo
    expect(html).toContain('001.625');                  // número padStart(6) uniforme
    expect(html).toContain('DANFE');
  });

  it('opts.logoBase64 tem precedência sobre a config local', () => {
    const { renderDanfeHTML, resolveEmitente } = load(EMPRESA);
    const html = renderDanfeHTML(NF_AUTOCURA, resolveEmitente(NF_AUTOCURA), { logoBase64: 'data:image/png;base64,OVERRIDE' });
    expect(html).toContain('OVERRIDE');
  });

  it('nota cancelada mostra marca CANCELADA', () => {
    const { renderDanfeHTML, resolveEmitente } = load(EMPRESA);
    const nf = { ...NF_AUTOCURA, status: 'cancelada' };
    const html = renderDanfeHTML(nf, resolveEmitente(nf), {});
    expect(html).toContain('CANCELADA');
  });

  it('sem nf → string vazia', () => {
    const { renderDanfeHTML } = load(EMPRESA);
    expect(renderDanfeHTML(null, {}, {})).toBe('');
  });
});
