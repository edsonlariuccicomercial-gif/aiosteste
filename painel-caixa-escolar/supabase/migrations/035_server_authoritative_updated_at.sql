-- Migration 035: updated_at server-authoritative (PASSO 2 do ARCH sync fonte única)
-- ============================================================================
-- Origem: docs/architecture/ARCH-sync-fonte-unica-verdade-20260623.md (Aria @architect)
-- Decisão stakeholder: Last-Write-Wins com timestamp do SERVIDOR (não do cliente).
--
-- PROBLEMA: hoje o cliente carimba updated_at = new Date() no navegador. Relógios
-- de máquinas diferentes divergem; o gdp-realtime.js usa "remoto > local" para decidir
-- conflito, mas os timestamps NÃO são comparáveis (fontes de relógio diferentes) →
-- race condition (pedido faturado volta p/ aberto, NF vira amarela, boleto some).
--
-- SOLUÇÃO: trigger BEFORE INSERT OR UPDATE que sobrescreve updated_at com now() do
-- SERVIDOR em TODAS as tabelas de entidade. O valor enviado pelo cliente é IGNORADO.
-- Assim o relógio que decide o conflito é único (o do Postgres) → comparação confiável.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS antes de criar.
-- REVERSÍVEL: ver supabase/rollbacks/035_rollback.sql
-- ============================================================================

-- 1. Função única reutilizada por todas as tabelas
CREATE OR REPLACE FUNCTION set_updated_at_server()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Server-authoritative: ignora o valor do cliente, sempre usa o relógio do servidor.
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at_server IS
  'PASSO 2 ARCH-sync: carimba updated_at = now() do servidor em INSERT/UPDATE. Mata a race condition de LWW por relógio de cliente.';

-- 2. Aplicar trigger em todas as tabelas de entidade (idempotente)
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
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = _t AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', _t);
      EXECUTE format(
        'CREATE TRIGGER trg_set_updated_at BEFORE INSERT OR UPDATE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION set_updated_at_server()', _t
      );
      RAISE NOTICE 'trg_set_updated_at aplicado em %', _t;
    ELSE
      RAISE NOTICE 'PULADO % (sem coluna updated_at)', _t;
    END IF;
  END LOOP;
END $$;
