-- Migration 006: Enable RLS on all operational tables
-- Story 7.1 — Implementar RLS em Todas as Tabelas
-- TD-002 (CRITICAL): 11 of 13 tables have no RLS

-- ============================================================
-- 1. Enable Row Level Security on all unprotected tables
-- ============================================================
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE nf_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Helper function to get current empresa_id from session
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_empresa_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.current_empresa_id', true);
$$;

-- ============================================================
-- 3. Policy for empresas table (uses id instead of empresa_id)
-- ============================================================
CREATE POLICY empresas_isolation ON empresas
  FOR ALL
  USING (id = get_current_empresa_id())
  WITH CHECK (id = get_current_empresa_id());

-- ============================================================
-- 4. Policies for all tables with empresa_id column
-- ============================================================
CREATE POLICY clientes_isolation ON clientes
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY contratos_isolation ON contratos
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY pedidos_isolation ON pedidos
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY notas_fiscais_isolation ON notas_fiscais
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY contas_receber_isolation ON contas_receber
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY contas_pagar_isolation ON contas_pagar
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY entregas_isolation ON entregas
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY nf_counter_isolation ON nf_counter
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY data_snapshots_isolation ON data_snapshots
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

CREATE POLICY audit_log_isolation ON audit_log
  FOR ALL
  USING (empresa_id = get_current_empresa_id())
  WITH CHECK (empresa_id = get_current_empresa_id());

-- ============================================================
-- 5. RPC function to set empresa context (called from frontend)
-- ============================================================
CREATE OR REPLACE FUNCTION set_empresa_context(p_empresa_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_empresa_id', p_empresa_id, false);
END;
$$;

COMMENT ON FUNCTION set_empresa_context IS 'Sets the empresa_id for RLS policies. Call via supabase.rpc() after login.';
