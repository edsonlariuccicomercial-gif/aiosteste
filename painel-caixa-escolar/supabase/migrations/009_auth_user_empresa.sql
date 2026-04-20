-- Migration 009: Auth infrastructure — user-empresa mapping
-- Story 7.2 — Corrigir autenticação (server-side)
-- TD-001 (CRITICAL): Client-side only authentication

-- ============================================================
-- 1. Table: user_empresa — maps Supabase Auth users to empresas
-- ============================================================
CREATE TABLE IF NOT EXISTS user_empresa (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, empresa_id)
);

-- RLS on user_empresa
ALTER TABLE user_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_empresa_self ON user_empresa
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 2. Helper function: get current user's empresa_id from JWT
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_empresa_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT empresa_id
  FROM user_empresa
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ============================================================
-- 3. Update RLS policies to use auth.uid() via get_user_empresa_id()
--    This replaces the session-based current_setting approach from migration 006
--    Both mechanisms work: session config (for anon key) and auth (for logged-in users)
-- ============================================================

-- Drop and recreate policies with dual-mode support
-- Policy logic: allow if EITHER session config matches OR auth user matches
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clientes', 'contratos', 'pedidos', 'notas_fiscais',
    'contas_receber', 'contas_pagar', 'entregas',
    'data_snapshots', 'audit_log'
  ]) LOOP
    -- Drop existing policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_isolation', t);
    -- Recreate with dual auth support
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
        empresa_id = COALESCE(
          (SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1),
          current_setting(''app.current_empresa_id'', true)
        )
      ) WITH CHECK (
        empresa_id = COALESCE(
          (SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1),
          current_setting(''app.current_empresa_id'', true)
        )
      )',
      t || '_isolation', t
    );
  END LOOP;
END;
$$;

-- Update empresas policy
DROP POLICY IF EXISTS empresas_isolation ON empresas;
CREATE POLICY empresas_isolation ON empresas
  FOR ALL
  USING (
    id = COALESCE(
      (SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1),
      current_setting('app.current_empresa_id', true)
    )
  )
  WITH CHECK (
    id = COALESCE(
      (SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1),
      current_setting('app.current_empresa_id', true)
    )
  );

-- Update nf_counter policy
DROP POLICY IF EXISTS nf_counter_isolation ON nf_counter;
CREATE POLICY nf_counter_isolation ON nf_counter
  FOR ALL
  USING (
    empresa_id = COALESCE(
      (SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1),
      current_setting('app.current_empresa_id', true)
    )
  )
  WITH CHECK (
    empresa_id = COALESCE(
      (SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1),
      current_setting('app.current_empresa_id', true)
    )
  );

-- ============================================================
-- 4. Grant access to authenticated role
-- ============================================================
GRANT SELECT ON user_empresa TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_empresa_id() TO anon;
