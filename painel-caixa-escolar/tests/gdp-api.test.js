/**
 * Tests for gdp-api.js — Story 5.5 AC1
 * Tests entity CRUD, cache fallback, empresa filtering, and column mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const gdpApiSource = readFileSync(
  join(__dirname, '..', 'squads', 'caixa-escolar', 'dashboard', 'gdp-api.js'),
  'utf-8'
);

function createBrowserEnv() {
  const storage = {};
  const env = {
    window: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_KEY: 'test-key',
      gdpApi: null,
      gdpLog: vi.fn(),
      gdpWarn: vi.fn(),
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8) }
    },
    localStorage: {
      getItem: vi.fn((key) => storage[key] || null),
      setItem: vi.fn((key, val) => { storage[key] = val; }),
      removeItem: vi.fn((key) => { delete storage[key]; }),
    },
    fetch: vi.fn(),
    setInterval: vi.fn(),
    setTimeout: vi.fn((fn, ms) => { fn(); return 1; }),
    clearTimeout: vi.fn(),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    navigator: { onLine: true },
    document: { addEventListener: vi.fn() },
    Date: globalThis.Date,
    JSON: globalThis.JSON,
    Array: globalThis.Array,
    Object: globalThis.Object,
    Number: globalThis.Number,
    String: globalThis.String,
    console: globalThis.console,
    encodeURIComponent: globalThis.encodeURIComponent,
    gdpLog: vi.fn(),
    gdpWarn: vi.fn(),
  };
  return { env, storage };
}

function loadGdpApi(env) {
  const keys = Object.keys(env);
  const vals = keys.map(k => env[k]);
  const fn = new Function(...keys, gdpApiSource);
  fn(...vals);
  return env.window.gdpApi;
}

describe('gdp-api module', () => {
  let env, storage, gdpApi;

  beforeEach(() => {
    const result = createBrowserEnv();
    env = result.env;
    storage = result.storage;

    // Seed empresa context
    storage['nexedu.empresa'] = JSON.stringify({ syncUserId: 'TEST-EMPRESA' });

    gdpApi = loadGdpApi(env);
  });

  describe('module loading', () => {
    it('exposes gdpApi on window', () => {
      expect(gdpApi).toBeTruthy();
    });

    it('has entity namespaces', () => {
      expect(gdpApi.contratos).toBeTruthy();
      expect(gdpApi.pedidos).toBeTruthy();
      expect(gdpApi.notas_fiscais).toBeTruthy();
      expect(gdpApi.clientes).toBeTruthy();
      expect(gdpApi.contas_receber).toBeTruthy();
      expect(gdpApi.contas_pagar).toBeTruthy();
      expect(gdpApi.entregas).toBeTruthy();
      // Note: extratos/conciliacoes managed via app-sync.js, not gdp-api
      expect(gdpApi.nf_counter).toBeTruthy();
    });

    it('entity has list/save/remove methods', () => {
      expect(typeof gdpApi.contratos.list).toBe('function');
      expect(typeof gdpApi.contratos.save).toBe('function');
      expect(typeof gdpApi.contratos.remove).toBe('function');
    });
  });

  describe('entity list (cache fallback)', () => {
    it('returns empty array when cloud and cache are empty', async () => {
      env.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const items = await gdpApi.contratos.list();
      expect(Array.isArray(items)).toBe(true);
    });

    it('returns cached data when fetch fails', async () => {
      // Seed localStorage cache
      storage['gdp.contratos.v1'] = JSON.stringify({
        _v: 1,
        updatedAt: new Date().toISOString(),
        items: [{ id: 'c1', empresa_id: 'TEST-EMPRESA', escola: 'Escola A', status: 'ativo' }]
      });

      env.fetch.mockRejectedValueOnce(new Error('network'));
      const items = await gdpApi.contratos.list();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe('c1');
    });
  });

  describe('entity save', () => {
    it('generates id if missing', async () => {
      env.fetch.mockResolvedValueOnce({ ok: true }); // upsert
      const item = { escola: 'Escola B', status: 'ativo' };
      await gdpApi.contratos.save(item);
      expect(item.id).toBeTruthy();
    });

    it('sets empresa_id on save', async () => {
      env.fetch.mockResolvedValueOnce({ ok: true });
      const item = { id: 'c2', escola: 'Escola C' };
      await gdpApi.contratos.save(item);
      expect(item.empresa_id).toBe('TEST-EMPRESA');
    });

    it('writes to localStorage cache after save', async () => {
      env.fetch.mockResolvedValueOnce({ ok: true });
      await gdpApi.contratos.save({ id: 'c3', escola: 'Escola D' });
      expect(env.localStorage.setItem).toHaveBeenCalledWith(
        'gdp.contratos.v1',
        expect.any(String)
      );
    });
  });

  describe('entity remove', () => {
    it('calls delete endpoint', async () => {
      env.fetch.mockResolvedValueOnce({ ok: true }); // delete
      await gdpApi.contratos.remove('c1');
      expect(env.fetch).toHaveBeenCalledWith(
        expect.stringContaining('contratos?id=eq.c1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('data source tracking', () => {
    it('exposes getDataSource', () => {
      expect(typeof gdpApi.getDataSource).toBe('function');
    });
  });

  describe('empresa_id resolution', () => {
    // RLS Fase 1 (WD-RLS-001): a escrita passa PRIMEIRO por sbWriteViaBackend (POST /api/gdp-data),
    // cujo body é um ENVELOPE { action:'upsert', table, rows:{...row com empresa_id...}, conflict }.
    // Antes o teste assumia a row na RAIZ do body (POST REST direto), que só ocorre no fallback anon.
    // Helper aceita as DUAS formas: envelope backend (callBody.rows) OU row crua (callBody).
    const _rowFromCall = (call) => {
      const body = JSON.parse(call?.[1]?.body || '{}');
      const rows = body.rows != null ? body.rows : body; // envelope backend vs REST direto
      return Array.isArray(rows) ? rows[0] : rows;        // upsert unitario vs saveAll (lote)
    };

    it('uses syncUserId from localStorage', async () => {
      env.fetch.mockResolvedValueOnce({ ok: true });
      await gdpApi.contratos.save({ id: 'x', escola: 'Test' });
      // A row enviada deve ter empresa_id = TEST-EMPRESA (do storage semeado)
      expect(_rowFromCall(env.fetch.mock.calls[0]).empresa_id).toBe('TEST-EMPRESA');
    });

    it('falls back to LARIUCCI if no empresa context', async () => {
      storage['nexedu.empresa'] = '{}'; // empty context
      // Reload module with empty context
      const result2 = createBrowserEnv();
      result2.storage['nexedu.empresa'] = '{}';
      const api2 = loadGdpApi(result2.env);

      result2.env.fetch.mockResolvedValueOnce({ ok: true });
      await api2.contratos.save({ id: 'y', escola: 'Test2' });
      expect(_rowFromCall(result2.env.fetch.mock.calls[0]).empresa_id).toBe('LARIUCCI');
    });
  });
});
