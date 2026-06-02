-- Migration 022: Revert RLS to permissive (anon_full_access)
-- Story 5.1 migration 020 broke cross-browser/cross-machine sync
-- because frontend uses anon key without authenticated sessions.
-- Reverting to permissive until frontend is migrated to Supabase Auth.

-- ============================================================
-- STEP 1: Drop restrictive policies from migration 020
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'contas_receber',
    'contas_pagar', 'entregas', 'clientes', 'nf_counter',
    'data_snapshots', 'audit_log', 'extratos', 'conciliacoes',
    'produtos', 'estoque_simples', 'empresas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_read_only" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_isolated_access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_pedidos" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_pedidos" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_entregas" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_entregas" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_clientes" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_clientes" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_nf_counter" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_notas_fiscais" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_notas_fiscais" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_contas_receber" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_contas_receber" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_contas_pagar" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_contas_pagar" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_contratos" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_contratos" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_extratos" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_extratos" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_write_conciliacoes" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_conciliacoes" ON %I', t);
  END LOOP;
END $$;

-- ============================================================
-- STEP 2: Restore permissive policies for anon and authenticated
-- Same as migration 007 — full access for both roles
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'contas_receber',
    'contas_pagar', 'entregas', 'clientes', 'nf_counter',
    'data_snapshots', 'audit_log', 'extratos', 'conciliacoes',
    'produtos', 'estoque_simples'
  ] LOOP
    -- Drop first to avoid "already exists" errors
    EXECUTE format('DROP POLICY IF EXISTS "anon_full_access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "anon_full_access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t
    );
    EXECUTE format(
      'CREATE POLICY "auth_full_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- empresas table (uses 'id' not 'empresa_id')
DROP POLICY IF EXISTS "anon_full_access" ON empresas;
DROP POLICY IF EXISTS "auth_full_access" ON empresas;
CREATE POLICY "anon_full_access" ON empresas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- NOTE: This reverts migration 020. The RLS consolidation should
-- only be re-attempted AFTER the frontend is migrated from
-- anon key to Supabase Auth (authenticated sessions).
-- ============================================================
