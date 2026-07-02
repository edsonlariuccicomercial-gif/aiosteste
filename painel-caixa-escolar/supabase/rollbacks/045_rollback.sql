-- Rollback da Migration 045: remover trigger anti-downgrade de status de NF
-- ============================================================================
-- Após isto, um UPDATE volta a poder rebaixar o STATUS de uma NF autorizada (com chave/protocolo)
-- para rascunho/pendente por eco/relógio de sync — a inconsistência da RESSALVA-1 retorna. O 044
-- (preservação de chave/protocolo) NÃO é afetado por este rollback. Use apenas se a 045 travar um
-- fluxo legítimo inesperado.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_preserve_nf_status ON public.notas_fiscais;
DROP FUNCTION IF EXISTS preserve_nf_status();
