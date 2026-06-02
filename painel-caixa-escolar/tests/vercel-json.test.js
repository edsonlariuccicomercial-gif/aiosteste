import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const vercelConfig = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf-8'));

describe('vercel.json security headers', () => {
  const globalHeaders = vercelConfig.headers.find(h => h.source === '/(.*)');
  const htmlHeaders = vercelConfig.headers.find(h => h.source === '/(.*).html');

  it('has global security headers', () => {
    expect(globalHeaders).toBeTruthy();
    const keys = globalHeaders.headers.map(h => h.key);
    expect(keys).toContain('X-Frame-Options');
    expect(keys).toContain('X-Content-Type-Options');
    expect(keys).toContain('Referrer-Policy');
  });

  it('X-Frame-Options is DENY', () => {
    const h = globalHeaders.headers.find(h => h.key === 'X-Frame-Options');
    expect(h.value).toBe('DENY');
  });

  it('X-Content-Type-Options is nosniff', () => {
    const h = globalHeaders.headers.find(h => h.key === 'X-Content-Type-Options');
    expect(h.value).toBe('nosniff');
  });

  it('HTML pages have Content-Security-Policy', () => {
    expect(htmlHeaders).toBeTruthy();
    const csp = htmlHeaders.headers.find(h => h.key === 'Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp.value).toContain("default-src 'self'");
    expect(csp.value).toContain('supabase.co');
    expect(csp.value).toContain("frame-ancestors 'none'");
  });

  it('CSP allows Supabase WebSocket', () => {
    const csp = htmlHeaders.headers.find(h => h.key === 'Content-Security-Policy');
    expect(csp.value).toContain('wss://');
  });

  it('CSP allows CDN scripts (SheetJS, CDNJS)', () => {
    const csp = htmlHeaders.headers.find(h => h.key === 'Content-Security-Policy');
    expect(csp.value).toContain('cdn.sheetjs.com');
    expect(csp.value).toContain('cdnjs.cloudflare.com');
  });
});

describe('vercel.json redirects', () => {
  it('root redirects to gdp-contratos', () => {
    const rootRedirect = vercelConfig.redirects.find(r => r.source === '/');
    expect(rootRedirect).toBeTruthy();
    expect(rootRedirect.destination).toContain('gdp-contratos.html');
  });
});

describe('vercel.json functions config', () => {
  it('critical functions have 60s timeout', () => {
    const funcs = vercelConfig.functions;
    expect(funcs['api/caixa-proxy.js'].maxDuration).toBe(60);
    expect(funcs['api/gdp-integrations.js'].maxDuration).toBe(60);
  });
});
