-- Rollback da Migration 036: remover função atômica de NF
-- ============================================================================
-- Remove next_nf_number(). ATENÇÃO: NÃO reverte a correção do counter
-- (1239 → 1591) — isso é uma correção de DADO correta e NÃO deve ser revertida
-- (reverter faria NFs futuras colidirem com 1240..1591 já usados).
--
-- Após este rollback, o frontend volta a depender do cálculo client-side de
-- número (gdp-notas-fiscais.js). Use apenas se a RPC causar problema; o counter
-- corrigido permanece (estado correto).
-- ============================================================================

DROP FUNCTION IF EXISTS next_nf_number(TEXT);
