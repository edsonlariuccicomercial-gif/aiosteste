-- Migration 041: produtos.dados_extras — cauda JSONB para campos ricos da Central
-- ============================================================================
-- ADR-004 (docs/architecture/ADR-004-central-produtos-escrita-tabela-supabase.md)
-- Contexto: a Central de Produtos passa a escrever na tabela `produtos` (fonte
-- única). O schema atual (migration 014) tem 17 colunas que batem 1:1 com
-- TABLE_COLS.produtos (gdp-api.js:154), MAS o produto carrega campos ricos que
-- não têm coluna e seriam DESCARTADOS por mapToTable (gdp-api.js:176):
--   custosFornecedor, concorrentes, propostas, historicoResultados,
--   precoReferenciaHistorico, taxaConversao, embalagem_descricao, criadoEm
--
-- Decisão (consistente com dados_extras/metadata do resto do schema — contratos,
-- pedidos, conciliacoes): NÃO colunizar campo a campo. Uma única coluna jsonb
-- de cauda guarda o pacote rico. Aditiva, idempotente, NÃO destrutiva.
--
-- RLS: produtos já está em anon read-only (migration 034) + escrita via
-- service_role (/api/gdp-data). Adicionar coluna NÃO altera policies. Nada a fazer.
--
-- ROLLBACK: ver rollbacks/041_rollback.sql
-- ============================================================================

BEGIN;

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS dados_extras jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN produtos.dados_extras IS
  'ADR-004: cauda JSONB para campos ricos da Central de Produtos não colunizados '
  '(custosFornecedor, concorrentes, propostas, historicoResultados, '
  'precoReferenciaHistorico, taxaConversao, embalagemDescricao, criadoEm). '
  'Wrap/unwrap feito em gdp-api.js mapToTable/mapFromTable, isolado p/ tabela produtos.';

COMMIT;
