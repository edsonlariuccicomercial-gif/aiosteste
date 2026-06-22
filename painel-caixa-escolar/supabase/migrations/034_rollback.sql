-- Rollback da Migration 034: restaura anon_full_access (estado da migration 022)
-- ============================================================================
-- Use APENAS se a migration 034 (anon read-only) quebrar a aplicação porque
-- a Fase 1 (escrita via backend service_role) ainda não foi concluída.
-- Restaura o comportamento permissivo da migration 022.
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
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      -- Remove as policies da migration 034
      EXECUTE format('DROP POLICY IF EXISTS "anon_read_only" ON %I', t);
      -- (auth_full_access pode permanecer — é inofensiva)

      -- Restaura acesso total anon (estado da migration 022)
      EXECUTE format('DROP POLICY IF EXISTS "anon_full_access" ON %I', t);
      EXECUTE format(
        'CREATE POLICY "anon_full_access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
