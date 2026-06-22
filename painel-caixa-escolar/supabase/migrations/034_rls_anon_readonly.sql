-- Migration 034: RLS anon → READ-ONLY (Fase 1 da remediação WD-RLS-001)
-- ============================================================================
-- ✅ APLICADA EM PRODUÇÃO em 2026-06-22 (via supabase db push).
--    Validada: anon UPDATE em linha real afeta 0 linhas (RLS bloqueia);
--    anon SELECT 200 (leitura/sync OK); escrita via /api/gdp-data (service_role) OK.
--    Pré-requisito cumprido: Fase 1 (escrita via backend) deployada antes.
-- ============================================================================
--
-- CONTEXTO (handoff-architect-to-dataeng-dev-rls-remediation-20260622):
--   A migration 022 reverteu o RLS para "anon_full_access" (FOR ALL USING true)
--   em 15 tabelas. Resultado: qualquer visitante, com a anon key pública do
--   frontend, pode SELECT/INSERT/UPDATE/DELETE todos os registros.
--   Confirmado ao vivo: UPDATE e DELETE anon retornam HTTP 204 (privilégio total).
--
-- POR QUE BLOQUEADA:
--   O frontend (gdp-api.js) escreve DIRETO no Supabase via anon key:
--     - sbUpsert(): POST + resolution=merge-duplicates  => exige INSERT *e* UPDATE
--     - soft-delete (mig 029/030): upsert com deleted_at => exige UPDATE
--     - sbDelete()/remove(): DELETE /table?id=eq.X       => exige DELETE
--   Aplicar esta migration ANTES de mover a escrita para o backend (service_role)
--   QUEBRA a aplicação — mesmo incidente que derrubou a migration 020.
--
-- PRÉ-REQUISITO PARA APLICAR (Fase 1, @dev):
--   1. Mover upsert/delete de gdp-api.js para função serverless Vercel
--      (/api/gdp-data) que usa SUPABASE_SERVICE_ROLE_KEY no servidor.
--   2. Validar que NENHUMA escrita do frontend usa mais a anon key direto.
--   3. Só então aplicar esta migration: *dry-run* primeiro, depois *apply*.
--
-- ROLLBACK: ver 034_rollback.sql (restaura anon_full_access — volta ao estado 022).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'contas_receber',
    'contas_pagar', 'entregas', 'clientes', 'nf_counter',
    'data_snapshots', 'audit_log', 'extratos', 'conciliacoes',
    'produtos', 'estoque_simples', 'empresas',
    'lancamentos_cliente', 'lancamentos_itens'
  ] LOOP
    -- Só processa tabelas que existem (idempotente)
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      -- Remove a policy permissiva da migration 022
      EXECUTE format('DROP POLICY IF EXISTS "anon_full_access" ON %I', t);

      -- anon: SOMENTE LEITURA (a escrita passa a ser exclusiva do service_role/backend)
      EXECUTE format('DROP POLICY IF EXISTS "anon_read_only" ON %I', t);
      EXECUTE format(
        'CREATE POLICY "anon_read_only" ON %I FOR SELECT TO anon USING (true)', t
      );

      -- authenticated mantém acesso total (preparação para Fase 2 / Supabase Auth)
      EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON %I', t);
      EXECUTE format(
        'CREATE POLICY "auth_full_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t
      );

      -- Garante RLS habilitado
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- NOTA: o service_role IGNORA RLS por design — por isso o backend serverless
-- consegue escrever normalmente após a Fase 1, mesmo com anon read-only.

COMMIT;
