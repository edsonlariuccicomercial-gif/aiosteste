import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = resolve(__dirname, '../squads/caixa-escolar/dashboard');

// Carrega os 3 scripts de browser num harness com window/localStorage stubados.
function makeHarness(seed = {}) {
  const store = Object.assign({}, seed);
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };
  win.window = win;
  win.gdpLog = () => {};
  win.gdpWarn = () => {};
  win.schedulCloudSync = () => {};
  const run = (rel) => {
    const code = readFileSync(resolve(dash, rel), 'utf8');
    // executa o IIFE com `window`/`localStorage`/globais no escopo da função
    const fn = new Function('window', 'localStorage', 'globalThis', 'gdpLog', 'gdpWarn', 'schedulCloudSync', code);
    fn(win, win.localStorage, win, win.gdpLog, win.gdpWarn, win.schedulCloudSync);
  };
  run('server-lib/radar-matcher-core.browser.js');
  run('server-lib/product-store-core.browser.js');
  run('product-store.js');
  return { win, store };
}

const SEED = {
  'gdp.produtos.v1': JSON.stringify({ itens: [{ sku: 'A', descricao: 'Arroz', custoBase: 20 }, { sku: 'B', descricao: 'Feijao', custoBase: 8 }] }),
  'caixaescolar.banco.v1': JSON.stringify({ itens: [{ id: 'bp1', item: 'Arroz', margemPadrao: 0.3 }] }),
  'intel.central-produtos.v2': JSON.stringify({ itens: [{ sku: 'L1', nome: 'Abacaxi', preco_custo: 6 }] }),
  'gdp.estoque-intel.produtos.v1': JSON.stringify({ itens: [] }),
};

describe('ProductStore wrapper', () => {
  let h;
  beforeEach(() => { h = makeHarness(JSON.parse(JSON.stringify(SEED))); });

  it('loads the SSoT via list()', () => {
    expect(h.win.ProductStore.list()).toHaveLength(2);
  });

  it('migrarParaSSoT consolidates legacy bases and sets the flag', () => {
    const r = h.win.ProductStore.migrarParaSSoT();
    expect(r.applied).toBe(true);
    // Arroz(dedup) + Feijao + Abacaxi(órfão absorvido) = 3
    expect(r.total).toBe(3);
    expect(h.store[h.win.ProductStore.MIGRATION_FLAG]).toBeTruthy();
    const nomes = h.win.ProductStore.list().map((p) => p.descricao);
    expect(nomes).toContain('Abacaxi');
  });

  it('migrarParaSSoT is idempotent (second run skips)', () => {
    h.win.ProductStore.migrarParaSSoT();
    const r2 = h.win.ProductStore.migrarParaSSoT();
    expect(r2.skipped).toBe('already_done');
  });

  it('creates a backup before migrating and can rollback', () => {
    h.win.ProductStore.migrarParaSSoT();
    expect(h.store['gdp.produtos.backup-pre-ssot.v1']).toBeTruthy();
    const rb = h.win.ProductStore.rollbackMigracao();
    expect(rb.restored).toBe(true);
    expect(h.store[h.win.ProductStore.MIGRATION_FLAG]).toBeUndefined();
  });

  it('save() upserts by sku and persists', () => {
    h.win.ProductStore.save({ sku: 'A', descricao: 'Arroz', custoBase: 25 });
    const arroz = h.win.ProductStore.getByNameOrSku('A');
    expect(arroz.custoBase).toBe(25);
    expect(h.win.ProductStore.list()).toHaveLength(2); // upsert, não duplica
  });

  it('save() adds a new product with generated id', () => {
    const p = h.win.ProductStore.save({ descricao: 'Macarrao', custoBase: 3 });
    expect(p.id).toBeTruthy();
    expect(h.win.ProductStore.list()).toHaveLength(3);
  });

  it('remove() deletes by id', () => {
    const all = h.win.ProductStore.list();
    const n = h.win.ProductStore.remove(all[0].id);
    expect(n).toBe(1);
    expect(h.win.ProductStore.list()).toHaveLength(1);
  });

  it('asBancoPrecos exposes the legacy shape for radar/pricing', () => {
    const bp = h.win.ProductStore.asBancoPrecos();
    expect(bp.itens[0]).toHaveProperty('item');
    expect(bp.itens[0]).toHaveProperty('margemPadrao');
  });

  it('searchCatalog exposes the N3 matcher shape', () => {
    const cat = h.win.ProductStore.searchCatalog();
    expect(cat[0]).toHaveProperty('nome');
    expect(cat[0]).toHaveProperty('categoria');
  });
});
