-- Rollback da Migration 043: remover trigger deleted_at terminal
-- ============================================================================
-- Após isto, um UPDATE volta a poder zerar deleted_at (reviver por eco de sync).
-- Use apenas se a migration 043 causar problema inesperado, OU para um "undelete"
-- administrativo pontual (rode o rollback, faça o UPDATE de undelete, re-aplique a 043).
-- ============================================================================

DO $$
DECLARE
  _tables TEXT[] := ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'clientes',
    'contas_receber', 'contas_pagar', 'entregas',
    'extratos', 'conciliacoes', 'produtos',
    'lancamentos_cliente'
  ];
  _t TEXT;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_deleted_at_terminal ON public.%I', _t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS enforce_deleted_at_terminal();
