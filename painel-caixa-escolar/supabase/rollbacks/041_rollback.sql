-- Rollback 041: remover produtos.dados_extras
-- ============================================================================
-- ATENÇÃO: este DROP COLUMN APAGA os campos ricos guardados em dados_extras
-- (custosFornecedor, concorrentes, propostas, etc.). Só executar se NENHUM
-- produto depender desses dados ou se houver backup. A coluna base (custo_base,
-- preco_referencia, etc.) NÃO é afetada — vive em colunas próprias.
-- ============================================================================

BEGIN;

ALTER TABLE produtos
  DROP COLUMN IF EXISTS dados_extras;

COMMIT;
