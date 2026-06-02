import { describe, it, expect, vi } from 'vitest';
import { requireAuth, optionalAuth, extractToken, decodeJwt } from '../api/lib/auth.js';

// Helper: create a valid-looking JWT (header.payload.signature)
function makeJwt(payload, expOverride) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: 'test-user-id',
    role: 'authenticated',
    exp: expOverride || Math.floor(Date.now() / 1000) + 3600,
    ...payload
  })).toString('base64url');
  return `${header}.${body}.fakesignature`;
}

function makeExpiredJwt() {
  return makeJwt({}, Math.floor(Date.now() / 1000) - 60);
}

function mockReqRes(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = {
    _status: null,
    _json: null,
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; }
  };
  return { req, res };
}

describe('extractToken', () => {
  it('extracts Bearer token', () => {
    const req = { headers: { authorization: 'Bearer abc123' } };
    expect(extractToken(req)).toBe('abc123');
  });

  it('returns null for missing header', () => {
    expect(extractToken({ headers: {} })).toBeNull();
    expect(extractToken({ headers: { authorization: '' } })).toBeNull();
  });

  it('returns null for non-Bearer auth', () => {
    expect(extractToken({ headers: { authorization: 'Basic abc123' } })).toBeNull();
  });
});

describe('decodeJwt', () => {
  it('decodes valid JWT payload', () => {
    const token = makeJwt({ sub: 'user-1', role: 'authenticated' });
    const payload = decodeJwt(token);
    expect(payload).toBeTruthy();
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('authenticated');
  });

  it('returns null for invalid token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('')).toBeNull();
    expect(decodeJwt('a.b')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(decodeJwt('a.!!!invalid!!!.c')).toBeNull();
  });
});

describe('requireAuth', () => {
  it('returns payload for valid token', () => {
    const token = makeJwt({ sub: 'user-1' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    const result = requireAuth(req, res);
    expect(result).toBeTruthy();
    expect(result.sub).toBe('user-1');
    expect(req.user).toEqual(result);
  });

  it('rejects missing Authorization header', () => {
    const { req, res } = mockReqRes(null);
    const result = requireAuth(req, res);
    expect(result).toBeNull();
    expect(res._status).toBe(401);
    expect(res._json.error).toContain('Missing');
  });

  it('rejects expired token', () => {
    const token = makeExpiredJwt();
    const { req, res } = mockReqRes(`Bearer ${token}`);
    const result = requireAuth(req, res);
    expect(result).toBeNull();
    expect(res._status).toBe(401);
    expect(res._json.error).toContain('expired');
  });

  it('rejects invalid token format', () => {
    const { req, res } = mockReqRes('Bearer not-a-jwt');
    const result = requireAuth(req, res);
    expect(result).toBeNull();
    expect(res._status).toBe(401);
  });
});

describe('optionalAuth', () => {
  it('returns payload for valid token', () => {
    const token = makeJwt({ sub: 'user-1' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const result = optionalAuth(req);
    expect(result).toBeTruthy();
    expect(result.sub).toBe('user-1');
  });

  it('returns null for missing token without error', () => {
    const req = { headers: {} };
    const result = optionalAuth(req);
    expect(result).toBeNull();
  });

  it('returns null for expired token without error', () => {
    const token = makeExpiredJwt();
    const req = { headers: { authorization: `Bearer ${token}` } };
    const result = optionalAuth(req);
    expect(result).toBeNull();
  });
});
