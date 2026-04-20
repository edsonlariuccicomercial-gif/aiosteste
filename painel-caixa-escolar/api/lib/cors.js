/**
 * CORS middleware — Story 7.6 (TD-004)
 * Restricts Access-Control-Allow-Origin to known deployment domains.
 * Falls back to blocking unknown origins in production.
 */

const ALLOWED_ORIGINS = [
  // Vercel deployments
  /^https:\/\/.*\.vercel\.app$/,
  // Custom domain (add when configured)
  // /^https:\/\/app\.licitaix\.com\.br$/,
  // Localhost for development
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

function getOrigin(req) {
  return req.headers?.origin || req.headers?.referer?.replace(/\/[^/]*$/, '') || '';
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // Same-origin requests don't send Origin header
  return ALLOWED_ORIGINS.some(pattern => pattern.test(origin));
}

function corsHeaders(req, res) {
  const origin = getOrigin(req);

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else {
    // In production, still set header but to the request origin
    // so the browser blocks the response (CORS policy)
    res.setHeader("Access-Control-Allow-Origin", "https://null.invalid");
  }

  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
}

module.exports = { corsHeaders, isAllowedOrigin, ALLOWED_ORIGINS };
