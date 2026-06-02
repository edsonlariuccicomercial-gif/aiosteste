/**
 * /api/db-migrate — Auto-apply pending database migrations
 * Uses Supabase service_role key. Safe to call multiple times (IF NOT EXISTS).
 */
export default async function handler(req, res) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: "Missing SUPABASE env vars" });
  }

  const headers = {
    apikey: SB_KEY,
    Authorization: "Bearer " + SB_KEY,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // Step 1: Ensure exec_sql function exists (needed for DDL via REST)
  const createFn = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN EXECUTE query; END; $$;
  `;
  try {
    await fetch(SB_URL + "/rest/v1/rpc/exec_sql", {
      method: "POST", headers,
      body: JSON.stringify({ query: "SELECT 1" }),
    });
  } catch (_) {}

  // If exec_sql doesn't exist, try creating it via the SQL endpoint
  const testResp = await fetch(SB_URL + "/rest/v1/rpc/exec_sql", {
    method: "POST", headers,
    body: JSON.stringify({ query: "SELECT 1" }),
  });

  if (!testResp.ok) {
    // Function doesn't exist — need to create it via Supabase Management API
    // Try using the database URL directly
    const projectRef = SB_URL.replace("https://", "").split(".")[0];
    const mgmtResp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + SB_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: createFn }),
      }
    ).catch(() => null);

    if (!mgmtResp || !mgmtResp.ok) {
      return res.status(200).json({
        status: "manual_required",
        message: "Execute este SQL no Supabase SQL Editor para habilitar auto-migrations:",
        sql: createFn.trim() + "\n\n-- Depois recarregue a pagina que as migrations serao aplicadas automaticamente.",
      });
    }
  }

  // Step 2: Execute migrations via exec_sql
  const migrations = [
    "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS escola_cliente_id text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS login text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS senha text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS municipio text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS responsavel text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cargo text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contribuinte_icms text DEFAULT '9'",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS categoria_catalogo text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS arp_vinculada text",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_total numeric DEFAULT 0",
    "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_disponivel numeric DEFAULT 0",
    // Story 4.61: Fix RLS — session variable doesn't persist across REST requests
    // Replace restrictive policies with permissive ones for anon/authenticated
    "DROP POLICY IF EXISTS contratos_isolation ON contratos",
    "DROP POLICY IF EXISTS pedidos_isolation ON pedidos",
    "DROP POLICY IF EXISTS notas_fiscais_isolation ON notas_fiscais",
    "DROP POLICY IF EXISTS contas_receber_isolation ON contas_receber",
    "DROP POLICY IF EXISTS contas_pagar_isolation ON contas_pagar",
    "DROP POLICY IF EXISTS entregas_isolation ON entregas",
    "DROP POLICY IF EXISTS clientes_isolation ON clientes",
    "DROP POLICY IF EXISTS nf_counter_isolation ON nf_counter",
    "DROP POLICY IF EXISTS data_snapshots_isolation ON data_snapshots",
    "DROP POLICY IF EXISTS audit_log_isolation ON audit_log",
    "DROP POLICY IF EXISTS empresas_isolation ON empresas",
    "DROP POLICY IF EXISTS anon_full_access ON contratos; CREATE POLICY anon_full_access ON contratos FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON pedidos; CREATE POLICY anon_full_access ON pedidos FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON notas_fiscais; CREATE POLICY anon_full_access ON notas_fiscais FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON contas_receber; CREATE POLICY anon_full_access ON contas_receber FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON contas_pagar; CREATE POLICY anon_full_access ON contas_pagar FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON entregas; CREATE POLICY anon_full_access ON entregas FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON clientes; CREATE POLICY anon_full_access ON clientes FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON nf_counter; CREATE POLICY anon_full_access ON nf_counter FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON data_snapshots; CREATE POLICY anon_full_access ON data_snapshots FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON audit_log; CREATE POLICY anon_full_access ON audit_log FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS anon_full_access ON empresas; CREATE POLICY anon_full_access ON empresas FOR ALL TO anon USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON contratos; CREATE POLICY auth_full_access ON contratos FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON pedidos; CREATE POLICY auth_full_access ON pedidos FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON notas_fiscais; CREATE POLICY auth_full_access ON notas_fiscais FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON contas_receber; CREATE POLICY auth_full_access ON contas_receber FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON contas_pagar; CREATE POLICY auth_full_access ON contas_pagar FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON entregas; CREATE POLICY auth_full_access ON entregas FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON clientes; CREATE POLICY auth_full_access ON clientes FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON nf_counter; CREATE POLICY auth_full_access ON nf_counter FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON data_snapshots; CREATE POLICY auth_full_access ON data_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON audit_log; CREATE POLICY auth_full_access ON audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true)",
    "DROP POLICY IF EXISTS auth_full_access ON empresas; CREATE POLICY auth_full_access ON empresas FOR ALL TO authenticated USING (true) WITH CHECK (true)",
  ];

  const results = [];
  for (const sql of migrations) {
    try {
      const r = await fetch(SB_URL + "/rest/v1/rpc/exec_sql", {
        method: "POST", headers,
        body: JSON.stringify({ query: sql }),
      });
      results.push({ col: sql.match(/ADD COLUMN.*?(\w+)\s/)?.[1] || sql.slice(0, 40), ok: r.ok });
    } catch (e) {
      results.push({ col: sql.slice(0, 40), ok: false, err: e.message });
    }
  }

  const applied = results.filter(r => r.ok).length;
  return res.status(200).json({
    status: "done",
    message: `${applied}/${migrations.length} migrations aplicadas`,
    results,
  });
}
