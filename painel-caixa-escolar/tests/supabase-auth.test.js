/**
 * Tests for supabase-auth.js — Story 5.5 AC2
 * Tests the auth module's pure logic by simulating the browser environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the source files
const authSource = readFileSync(
  join(__dirname, '..', 'squads', 'caixa-escolar', 'dashboard', 'js', 'supabase-auth.js'),
  'utf-8'
);

function createBrowserEnv() {
  const storage = {};
  const env = {
    window: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_KEY: 'test-anon-key',
      location: { href: '', pathname: '/dashboard/gdp-contratos.html' },
      gdpAuth: null
    },
    localStorage: {
      getItem: vi.fn((key) => storage[key] || null),
      setItem: vi.fn((key, val) => { storage[key] = val; }),
      removeItem: vi.fn((key) => { delete storage[key]; }),
    },
    fetch: vi.fn(),
    setInterval: vi.fn(),
    setTimeout: vi.fn((fn) => fn()),
    clearTimeout: vi.fn(),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    Date: globalThis.Date,
    JSON: globalThis.JSON,
    Math: globalThis.Math,
    console: globalThis.console,
    gdpLog: vi.fn(),
  };
  return { env, storage };
}

function loadAuth(env) {
  const keys = Object.keys(env);
  const vals = keys.map(k => env[k]);
  // Execute the IIFE in a controlled scope
  const fn = new Function(...keys, authSource);
  fn(...vals);
  return env.window.gdpAuth;
}

describe('supabase-auth module', () => {
  let env, storage, gdpAuth;

  beforeEach(() => {
    const result = createBrowserEnv();
    env = result.env;
    storage = result.storage;
    gdpAuth = loadAuth(env);
  });

  describe('getSession', () => {
    it('returns null when no session stored', async () => {
      const session = await gdpAuth.getSession();
      expect(session).toBeNull();
    });

    it('returns valid session from localStorage', async () => {
      const validSession = {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-1' }
      };
      storage['gdp.auth.session'] = JSON.stringify(validSession);

      const session = await gdpAuth.getSession();
      expect(session).toBeTruthy();
      expect(session.access_token).toBe('test-token');
    });

    it('returns null for expired session without refresh', async () => {
      const expiredSession = {
        access_token: 'old-token',
        expires_at: Math.floor(Date.now() / 1000) - 60
      };
      storage['gdp.auth.session'] = JSON.stringify(expiredSession);

      // Mock fetch to fail refresh
      env.fetch.mockRejectedValueOnce(new Error('network'));

      const session = await gdpAuth.getSession();
      expect(session).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('returns token from stored session', () => {
      storage['gdp.auth.session'] = JSON.stringify({
        access_token: 'my-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      });
      expect(gdpAuth.getAccessToken()).toBe('my-token');
    });

    it('returns null when no session', () => {
      expect(gdpAuth.getAccessToken()).toBeNull();
    });
  });

  describe('signIn', () => {
    it('stores session on successful login', async () => {
      const mockResponse = {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: { id: 'user-1', email: 'test@test.com' }
      };

      env.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const session = await gdpAuth.signIn('test@test.com', 'password');
      expect(session.access_token).toBe('new-token');
      expect(env.localStorage.setItem).toHaveBeenCalledWith(
        'gdp.auth.session',
        expect.stringContaining('new-token')
      );
    });

    it('throws on invalid credentials', async () => {
      env.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error_description: 'Invalid login' })
      });

      await expect(gdpAuth.signIn('bad@test.com', 'wrong'))
        .rejects.toThrow('Invalid login');
    });
  });

  describe('signOut', () => {
    it('clears session from localStorage', async () => {
      storage['gdp.auth.session'] = JSON.stringify({ access_token: 'tok' });

      env.fetch.mockResolvedValueOnce({ ok: true });
      await gdpAuth.signOut();

      expect(env.localStorage.removeItem).toHaveBeenCalledWith('gdp.auth.session');
    });
  });

  describe('onAuthChange', () => {
    it('notifies listeners on signIn', async () => {
      const listener = vi.fn();
      gdpAuth.onAuthChange(listener);

      env.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: {}
        })
      });

      await gdpAuth.signIn('test@test.com', 'pw');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'tok' }));
    });
  });

  describe('constants', () => {
    it('exposes LOGIN_PAGE and DASHBOARD_PAGE', () => {
      expect(gdpAuth.LOGIN_PAGE).toContain('login.html');
      expect(gdpAuth.DASHBOARD_PAGE).toContain('gdp-contratos.html');
    });
  });
});
