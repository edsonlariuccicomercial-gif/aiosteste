import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../api/lib/cors.js';

describe('CORS isAllowedOrigin', () => {
  it('allows Vercel deployments', () => {
    expect(isAllowedOrigin('https://painel-caixa-abc123.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://my-app.vercel.app')).toBe(true);
  });

  it('allows localhost', () => {
    expect(isAllowedOrigin('http://localhost')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:8080')).toBe(true);
  });

  it('blocks unknown origins', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://attacker.io')).toBe(false);
  });

  it('allows empty origin (same-origin requests)', () => {
    expect(isAllowedOrigin('')).toBe(true);
    expect(isAllowedOrigin(null)).toBe(true);
    expect(isAllowedOrigin(undefined)).toBe(true);
  });
});
