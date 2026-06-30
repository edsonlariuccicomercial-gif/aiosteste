-- Rollback da Migration 042: remove o trigger/funcao de updated_at em notas_fiscais.
-- ============================================================================
-- NAO remove a coluna updated_at nem desfaz o backfill (sao dados corretos e uteis).
-- Apenas desliga o carimbamento automatico. Idempotente.
-- ATENCAO: rodar este rollback REABRE a causa-raiz da regressao (linhas sem relogio em UPDATE
-- voltam a depender do cliente carimbar). So usar se o trigger causar efeito inesperado.
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_notas_fiscais_updated_at ON notas_fiscais;
DROP FUNCTION IF EXISTS set_updated_at_notas_fiscais();

-- A coluna updated_at e o backfill PERMANECEM (reversao parcial intencional).
-- Para remover tambem a coluna (NAO recomendado), descomente:
-- ALTER TABLE notas_fiscais DROP COLUMN IF EXISTS updated_at;

COMMIT;
