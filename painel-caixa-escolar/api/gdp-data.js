// GDP Data — Vercel serverless write proxy (Fase 1 da remediação WD-RLS-001)
// ============================================================================
// Move a ESCRITA de dados (upsert/delete) do frontend para o backend, usando
// SUPABASE_SERVICE_ROLE_KEY (server-side). Isso permite que a anon key vire
// read-only (migration 034) sem quebrar a aplicação — o service_role ignora RLS.
//
// O frontend (gdp-api.js) passa a chamar POST /api/gdp-data com:
//   { action: "upsert", table, rows, conflict }   (rows = objeto ou array)
//   { action: "delete", table, id }
//
// Segurança:
//   - SERVICE_ROLE só existe no servidor (env), NUNCA no browser.
//   - table validada contra ALLOWED_TABLES (anti-injeção de tabela arbitrária).
// ============================================================================

const SB_URL = process.env.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Allowlist: exatamente as entidades de ENTITIES em gdp-api.js + tabelas de escrita conhecidas.
const ALLOWED_TABLES = new Set([
  "contratos", "pedidos", "notas_fiscais", "clientes", "contas_receber",
  "contas_pagar", "entregas", "nf_counter", "extratos", "conciliacoes",
  "produtos", "lancamentos_cliente", "lancamentos_itens", "data_snapshots"
]);

function corsHeaders(req, res) {
  const origin = (req.headers && req.headers.origin) || "";
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

module.exports = async function handler(req, res) {
  corsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  if (!SB_KEY) {
    // Fail-soft: sem service_role, sinaliza ao frontend para usar o fallback (anon direto).
    // Mantém a app funcional enquanto a env não está provisionada.
    return res.status(503).json({ ok: false, error: "service_role_unavailable", fallback: true });
  }

  const body = req.body || {};
  const { action, table } = body;

  if (!ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ ok: false, error: "tabela nao permitida: " + String(table) });
  }

  const headers = {
    apikey: SB_KEY,
    Authorization: "Bearer " + SB_KEY,
    "Content-Type": "application/json"
  };

  try {
    if (action === "upsert") {
      const conflict = body.conflict || "id";
      const rows = Array.isArray(body.rows) ? body.rows : [body.rows];
      const resp = await fetch(
        `${SB_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,
        {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal,resolution=merge-duplicates" },
          body: JSON.stringify(rows),
          signal: AbortSignal.timeout(15000)
        }
      );
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        return res.status(502).json({ ok: false, error: `upsert HTTP ${resp.status}`, detail });
      }
      return res.status(200).json({ ok: true, action, table, count: rows.length });
    }

    if (action === "delete") {
      const id = body.id;
      if (id == null) return res.status(400).json({ ok: false, error: "id obrigatorio" });
      const resp = await fetch(
        `${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE", headers, signal: AbortSignal.timeout(15000) }
      );
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        return res.status(502).json({ ok: false, error: `delete HTTP ${resp.status}`, detail });
      }
      return res.status(200).json({ ok: true, action, table, id });
    }

    return res.status(400).json({ ok: false, error: "action invalida: " + String(action) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "erro inesperado" });
  }
};
