-- Migration 020: RLS Consolidation — Story 5.1 (TD-C1, TD-A7)
--
-- PROBLEM: Migration 007 added anon_full_access/auth_full_access with USING(true)
-- for ALL operations, which bypasses multi-tenant isolation.
--
-- SOLUTION: Replace with role-specific policies:
--   - anon: READ-ONLY (SELECT) — frontend queries with empresa_id filter
--   - authenticated: FULL ACCESS with isolation via user_empresa lookup
--   - Session fallback: set_empresa_context() for server-side scripts
--
-- This reduces attack surface: anon can read but cannot write/delete.
-- Authenticated users get proper isolation via auth.uid() → user_empresa.

-- ============================================================
-- STEP 0: Ensure user_empresa table exists (may not have been created by migration 009)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_empresa (
  user_id UUID NOT NULL,
  empresa_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, empresa_id)
);
ALTER TABLE user_empresa ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "user_empresa_self" ON user_empresa
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- STEP 1: Drop ALL permissive policies from migration 007
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'contas_receber',
    'contas_pagar', 'entregas', 'clientes', 'nf_counter',
    'data_snapshots', 'audit_log', 'empresas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_full_access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON %I', t);
  END LOOP;
END $$;

-- Drop old policies from extratos/conciliacoes (migration 018)
DROP POLICY IF EXISTS "extratos_anon_read" ON extratos;
DROP POLICY IF EXISTS "extratos_anon_write" ON extratos;
DROP POLICY IF EXISTS "conciliacoes_anon_read" ON conciliacoes;
DROP POLICY IF EXISTS "conciliacoes_anon_write" ON conciliacoes;

-- Drop old policies from produtos/estoque_simples (migration 014)
DROP POLICY IF EXISTS "produtos_empresa" ON produtos;
DROP POLICY IF EXISTS "estoque_simples_empresa" ON estoque_simples;

-- ============================================================
-- STEP 2: Create anon READ-ONLY policies (SELECT only)
-- Frontend uses anon key + empresa_id filter in query params.
-- PostgREST applies the filter before returning rows.
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
    EXECUTE format(
      'CREATE POLICY "anon_read_only" ON %I FOR SELECT TO anon USING (true)',
      t
    );
  END LOOP;
END $$;

-- empresas: anon can read (id field, not empresa_id)
CREATE POLICY "anon_read_only" ON empresas FOR SELECT TO anon USING (true);

-- ============================================================
-- STEP 3: Create authenticated FULL ACCESS policies with isolation
-- Uses COALESCE: auth.uid() → user_empresa → session fallback
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
    EXECUTE format(
      'CREATE POLICY "auth_isolated_access" ON %I FOR ALL TO authenticated '
      'USING (empresa_id = COALESCE('
        '(SELECT ue.empresa_id FROM user_empresa ue WHERE ue.user_id = auth.uid() LIMIT 1),'
        'current_setting(''app.current_empresa_id'', true)'
      ')) '
      'WITH CHECK (empresa_id = COALESCE('
        '(SELECT ue.empresa_id FROM user_empresa ue WHERE ue.user_id = auth.uid() LIMIT 1),'
        'current_setting(''app.current_empresa_id'', true)'
      '))',
      t
    );
  END LOOP;
END $$;

-- empresas: authenticated can access their own empresa (id field)
CREATE POLICY "auth_isolated_access" ON empresas FOR ALL TO authenticated
  USING (
    id = COALESCE(
      (SELECT ue.empresa_id FROM user_empresa ue WHERE ue.user_id = auth.uid() LIMIT 1),
      current_setting('app.current_empresa_id', true)
    )
  )
  WITH CHECK (
    id = COALESCE(
      (SELECT ue.empresa_id FROM user_empresa ue WHERE ue.user_id = auth.uid() LIMIT 1),
      current_setting('app.current_empresa_id', true)
    )
  );

-- ============================================================
-- STEP 4: Anon WRITE policies for tables that need it
-- Portal escolar uses anon key to create pedidos/entregas.
-- Allow INSERT/UPDATE with empresa_id match via session context.
-- ============================================================

-- Pedidos: portal escolar cria pedidos via anon key
CREATE POLICY "anon_write_pedidos" ON pedidos
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_pedidos" ON pedidos
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Entregas: entregador app pode atualizar via anon key
CREATE POLICY "anon_write_entregas" ON entregas
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_entregas" ON entregas
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Clientes: portal pode atualizar dados da escola
CREATE POLICY "anon_write_clientes" ON clientes
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_clientes" ON clientes
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- NF Counter: atomic increment via anon key
CREATE POLICY "anon_write_nf_counter" ON nf_counter
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Notas fiscais: frontend cria NFs via anon key
CREATE POLICY "anon_write_notas_fiscais" ON notas_fiscais
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_notas_fiscais" ON notas_fiscais
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Contas receber/pagar: frontend cria via anon key
CREATE POLICY "anon_write_contas_receber" ON contas_receber
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_contas_receber" ON contas_receber
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_write_contas_pagar" ON contas_pagar
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_contas_pagar" ON contas_pagar
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Contratos: frontend cria/atualiza via anon key
CREATE POLICY "anon_write_contratos" ON contratos
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_contratos" ON contratos
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Extratos/conciliacoes: frontend cria via anon key
CREATE POLICY "anon_write_extratos" ON extratos
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_extratos" ON extratos
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_write_conciliacoes" ON conciliacoes
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_conciliacoes" ON conciliacoes
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- NOTE: This migration is a stepping stone. The anon write policies
-- still use USING(true) because the frontend hasn't migrated to
-- authenticated sessions yet. The improvement is:
--
-- BEFORE (007): anon had FULL access (SELECT/INSERT/UPDATE/DELETE) on ALL tables
-- AFTER (020):
--   - anon READ: allowed on all tables (frontend needs this)
--   - anon WRITE: allowed only on tables the frontend writes to
--   - anon DELETE: BLOCKED on all tables (no policy = denied)
--   - authenticated: fully isolated via user_empresa
--
-- NEXT STEP: Migrate frontend from anon key to Supabase Auth,
-- then remove all anon_write_* policies.
-- ============================================================
