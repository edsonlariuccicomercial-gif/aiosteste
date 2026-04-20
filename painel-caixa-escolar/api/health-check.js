/**
 * health-check.js — System health monitoring endpoint
 * Story 7.8 (TD-044): SGD API dependency monitoring
 * Story 7.10 (TD-040): Certificate expiration alerting
 *
 * GET /api/health-check — returns status of all external dependencies
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { corsHeaders } = require('./lib/cors');

const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

export default async function handler(req, res) {
  corsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const checks = {};
  let overallStatus = "healthy";

  // 1. SGD API Health
  checks.sgd = await checkSGD();

  // 2. Supabase Health
  checks.supabase = await checkSupabase();

  // 3. Certificate expiration
  checks.certificate = await checkCertificateExpiry();

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  if (statuses.includes("critical")) overallStatus = "critical";
  else if (statuses.includes("warning")) overallStatus = "warning";
  else if (statuses.includes("degraded")) overallStatus = "degraded";

  const result = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime ? Math.round(process.uptime()) : null
  };

  const httpStatus = overallStatus === "healthy" ? 200 : overallStatus === "critical" ? 503 : 207;
  return res.status(httpStatus).json(result);
}

async function checkSGD() {
  const start = Date.now();
  try {
    const resp = await fetch(SGD_API, {
      method: "GET",
      signal: AbortSignal.timeout(10000)
    });
    const latency = Date.now() - start;
    return {
      status: resp.ok ? "healthy" : "degraded",
      latency_ms: latency,
      http_status: resp.status,
      message: resp.ok ? "SGD API responding" : `SGD returned ${resp.status}`
    };
  } catch (err) {
    return {
      status: "critical",
      latency_ms: Date.now() - start,
      message: `SGD unreachable: ${err.message}`,
      action: "Check if api.caixaescolar.educacao.mg.gov.br is down"
    };
  }
}

async function checkSupabase() {
  if (!SUPABASE_URL) {
    return { status: "warning", message: "SUPABASE_URL not configured" };
  }
  const start = Date.now();
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(5000)
    });
    return {
      status: resp.ok ? "healthy" : "degraded",
      latency_ms: Date.now() - start,
      http_status: resp.status
    };
  } catch (err) {
    return {
      status: "critical",
      latency_ms: Date.now() - start,
      message: `Supabase unreachable: ${err.message}`
    };
  }
}

async function checkCertificateExpiry() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { status: "warning", message: "Cannot check certificate — no Supabase credentials" };
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/empresas?select=id,config_fiscal&limit=10`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!resp.ok) {
      return { status: "warning", message: `Cannot fetch empresas: ${resp.status}` };
    }

    const empresas = await resp.json();
    const alerts = [];

    for (const empresa of empresas) {
      const config = empresa.config_fiscal;
      if (!config || typeof config !== 'object') continue;

      const validadeStr = config.certificadoValidade || config.validade || config.expiry;
      if (!validadeStr) {
        alerts.push({ empresa_id: empresa.id, issue: "no_expiry_date", severity: "warning" });
        continue;
      }

      const validade = new Date(validadeStr);
      const now = new Date();
      const daysUntilExpiry = Math.floor((validade - now) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        alerts.push({ empresa_id: empresa.id, issue: "expired", days: daysUntilExpiry, severity: "critical" });
      } else if (daysUntilExpiry < 30) {
        alerts.push({ empresa_id: empresa.id, issue: "expiring_soon", days: daysUntilExpiry, severity: "warning" });
      }
    }

    if (alerts.some(a => a.severity === "critical")) {
      return { status: "critical", message: "Certificate EXPIRED", alerts };
    }
    if (alerts.some(a => a.severity === "warning")) {
      return { status: "warning", message: "Certificate expiring soon", alerts };
    }
    return { status: "healthy", message: "All certificates valid", empresas_checked: empresas.length };

  } catch (err) {
    return { status: "warning", message: `Certificate check failed: ${err.message}` };
  }
}
