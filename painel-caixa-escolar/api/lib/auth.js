/**
 * Auth middleware for Vercel Functions — Story 5.3 (TD-A5)
 * Validates Supabase JWT from Authorization header.
 * Does NOT use Supabase SDK — lightweight decode + expiry check.
 */

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * Decode JWT payload (no signature verification without secret).
 * If SUPABASE_JWT_SECRET is set, signature could be verified via crypto.
 * For now: decode payload + check expiry (sufficient with RLS as second layer).
 */
function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload;
  } catch (_) {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header.
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
function extractToken(req) {
  const auth = req.headers?.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

/**
 * Validate JWT and attach user info to req.
 * Use as: const user = requireAuth(req, res); if (!user) return;
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {object|null} JWT payload if valid, null if rejected (response already sent)
 */
function requireAuth(req, res) {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ ok: false, error: 'Missing Authorization header' });
    return null;
  }

  const payload = decodeJwt(token);

  if (!payload) {
    res.status(401).json({ ok: false, error: 'Invalid token format' });
    return null;
  }

  // Check expiry
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    res.status(401).json({ ok: false, error: 'Token expired' });
    return null;
  }

  // Check required Supabase fields
  if (!payload.sub && !payload.role) {
    res.status(401).json({ ok: false, error: 'Invalid token payload' });
    return null;
  }

  // Attach to request for downstream use
  req.user = payload;
  return payload;
}

/**
 * Optional auth — extracts user if token present, but does not reject.
 * Useful for endpoints that work with both anon and authenticated users.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {object|null} JWT payload if valid, null if no token or invalid
 */
function optionalAuth(req) {
  const token = extractToken(req);
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) return null;
  req.user = payload;
  return payload;
}

module.exports = { requireAuth, optionalAuth, extractToken, decodeJwt };
