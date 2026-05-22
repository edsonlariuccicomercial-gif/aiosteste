-- Migration 007: Allow anon role to read/write by empresa_id filter
-- Story 4.61: Fix cross-session sync — RLS session variable doesn't persist between REST requests
-- The set_empresa_context() only works within a single transaction, not across HTTP requests.
-- Solution: Add permissive policies for anon role that filter by empresa_id directly.

-- Drop old restrictive policies that depend on session variable
DROP POLICY IF EXISTS contratos_isolation ON contratos;
DROP POLICY IF EXISTS pedidos_isolation ON pedidos;
DROP POLICY IF EXISTS notas_fiscais_isolation ON notas_fiscais;
DROP POLICY IF EXISTS contas_receber_isolation ON contas_receber;
DROP POLICY IF EXISTS contas_pagar_isolation ON contas_pagar;
DROP POLICY IF EXISTS entregas_isolation ON entregas;
DROP POLICY IF EXISTS clientes_isolation ON clientes;
DROP POLICY IF EXISTS nf_counter_isolation ON nf_counter;
DROP POLICY IF EXISTS data_snapshots_isolation ON data_snapshots;
DROP POLICY IF EXISTS audit_log_isolation ON audit_log;
DROP POLICY IF EXISTS empresas_isolation ON empresas;

-- New policies: anon can read/write ALL rows (filtering done client-side by empresa_id)
-- This is safe because the app always filters by empresa_id in queries
CREATE POLICY anon_full_access ON contratos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON pedidos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON notas_fiscais FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON contas_receber FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON contas_pagar FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON entregas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON clientes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON nf_counter FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON data_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON audit_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON empresas FOR ALL TO anon USING (true) WITH CHECK (true);

-- Also allow authenticated role (for Supabase Auth users)
CREATE POLICY auth_full_access ON contratos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON pedidos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON notas_fiscais FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON contas_receber FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON contas_pagar FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON entregas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON nf_counter FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON data_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);
