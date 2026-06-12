-- Soft-delete em notas_fiscais e contas_pagar — completa o EPIC-19
--
-- Contexto: a migration 029 (EPIC-19) adicionou deleted_at em `contas_receber` e
-- `extratos`, mas deixou de fora `notas_fiscais` e `contas_pagar`. Sem deleted_at,
-- a exclusão dessas tabelas usa DELETE físico (HTTP DELETE), frágil a falhas de
-- rede e sem rastro — mesma causa-raiz dos bugs de exclusão que NÃO propagam entre
-- computadores. Diagnóstico do squad financeiro (handoff 2026-06-11) confirmou que
-- a "diferença de notas entre PCs" vem exatamente daqui (rascunhos órfãos e uma NF
-- fantasma que ressurgem por não poderem ser soft-deletados de forma sincronizada).
--
-- Esta migration estende o MESMO padrão validado em 029:
--   exclusão = UPDATE deleted_at; leitura filtra deleted_at IS NULL; sincroniza via realtime.
--
-- Idempotente (IF NOT EXISTS). Aditiva (nenhum dado existente alterado). Zero-downtime.
-- Reversível: ver bloco de rollback comentado no fim.

-- ===== soft-delete em notas_fiscais =====
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN notas_fiscais.deleted_at IS 'Soft-delete: exclusão sincronizada de nota fiscal. NULL = ativa; preenchido = excluída. Usado para remover rascunhos órfãos (rascunho_nf_real sem chave/protocolo) e duplicatas locais sem efeito fiscal — nunca para cancelar NF-e autorizada na SEFAZ (que exige fluxo de cancelamento próprio).';

-- Índice parcial: acelera o filtro "deleted_at IS NULL" (leitura padrão da lista de notas)
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_ativas
  ON notas_fiscais (empresa_id)
  WHERE deleted_at IS NULL;

-- ===== soft-delete em contas_pagar =====
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN contas_pagar.deleted_at IS 'Soft-delete: exclusão sincronizada de conta a pagar. NULL = ativa; preenchido = excluída. Espelha o padrão de contas_receber (migration 029).';

-- Índice parcial: acelera o filtro "deleted_at IS NULL" (leitura padrão de contas a pagar)
CREATE INDEX IF NOT EXISTS idx_contas_pagar_ativas
  ON contas_pagar (empresa_id)
  WHERE deleted_at IS NULL;

-- ===== Realtime =====
-- Com soft-delete, a exclusão passa a ser um UPDATE (deleted_at preenchido), NÃO um
-- DELETE físico. Eventos UPDATE do Supabase Realtime trazem o `record` COMPLETO (com
-- empresa_id), evitando a limitação do DELETE PK-only. Garantia idempotente de que
-- as tabelas estão na publicação supabase_realtime:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notas_fiscais'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notas_fiscais;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contas_pagar'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contas_pagar;
  END IF;
END;
$$;

-- ===== ROLLBACK (executar manualmente se necessário) =====
-- DROP INDEX IF EXISTS idx_notas_fiscais_ativas;
-- DROP INDEX IF EXISTS idx_contas_pagar_ativas;
-- ALTER TABLE notas_fiscais DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE contas_pagar DROP COLUMN IF EXISTS deleted_at;
