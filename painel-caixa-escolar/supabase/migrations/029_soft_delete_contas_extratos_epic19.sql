-- EPIC-19 — Correção Definitiva de Sincronização de Exclusões
-- Story 19.1: soft-delete em contas_receber e extratos
--
-- Contexto: o EPIC-17 (migration 028) adicionou deleted_at apenas em `conciliacoes`.
-- As tabelas `contas_receber` e `extratos` ficaram com hard-delete (DELETE HTTP), frágil a
-- falhas de rede e sem rastro de auditoria — causa-raiz da recorrência dos bugs de exclusão
-- que não propagam entre navegadores/computadores.
--
-- Esta migration estende o MESMO padrão já validado em conciliacoes:
--   exclusão = UPDATE deleted_at; leitura filtra deleted_at IS NULL; sincroniza via realtime.
--
-- Idempotente (IF NOT EXISTS). Aditiva (nenhum dado existente alterado). Zero-downtime.
-- Reversível: ver bloco de rollback comentado no fim.

-- ===== Story 19.1 / Problema ③: soft-delete em contas_receber =====
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN contas_receber.deleted_at IS 'Soft-delete (EPIC-19 / Story 19.3): exclusão sincronizada. NULL = ativo; preenchido = excluído. Substitui o hard-delete + tombstone local gdp.contas-receber.deleted.v1.';

-- Índice parcial: acelera o filtro "deleted_at IS NULL" (leitura padrão da lista de contas a receber)
CREATE INDEX IF NOT EXISTS idx_contas_receber_ativas
  ON contas_receber (empresa_id)
  WHERE deleted_at IS NULL;

-- ===== Story 19.1 / Problema ②: soft-delete em extratos =====
ALTER TABLE extratos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN extratos.deleted_at IS 'Soft-delete (EPIC-19 / Story 19.4): exclusão sincronizada de extrato. NULL = ativo; preenchido = excluído. Usado também no dedupe dos ext-recovered duplicados.';

-- Índice parcial: acelera o filtro "deleted_at IS NULL" (leitura padrão de extratos)
CREATE INDEX IF NOT EXISTS idx_extratos_ativos
  ON extratos (empresa_id)
  WHERE deleted_at IS NULL;

-- ===== Realtime (relevante à Story 19.6) =====
-- Com soft-delete, a exclusão passa a ser um UPDATE (deleted_at preenchido), NÃO um DELETE
-- físico. Isso é vantajoso: eventos UPDATE do Supabase Realtime trazem o `record` COMPLETO
-- (com empresa_id), evitando a limitação do DELETE PK-only que afetou a story 17.8.
-- As tabelas já estão na publicação supabase_realtime (migration 026). Garantia idempotente:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contas_receber'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contas_receber;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'extratos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE extratos;
  END IF;
END;
$$;

-- ===== ROLLBACK (executar manualmente se necessário) =====
-- DROP INDEX IF EXISTS idx_contas_receber_ativas;
-- DROP INDEX IF EXISTS idx_extratos_ativos;
-- ALTER TABLE contas_receber DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE extratos DROP COLUMN IF EXISTS deleted_at;
