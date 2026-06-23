-- Rollback da Migration 035: remover triggers updated_at server-authoritative
-- ============================================================================
-- Reverte o PASSO 2. Após isto, o updated_at volta a ser o valor enviado pelo
-- cliente (comportamento anterior — race condition retorna). Use apenas se a
-- migration 035 causar problema inesperado.
-- ============================================================================

DO $$
DECLARE
  _tables TEXT[] := ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'clientes',
    'contas_receber', 'contas_pagar', 'entregas',
    'extratos', 'conciliacoes', 'produtos',
    'lancamentos_cliente', 'lancamentos_itens'
  ];
  _t TEXT;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', _t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS set_updated_at_server();
