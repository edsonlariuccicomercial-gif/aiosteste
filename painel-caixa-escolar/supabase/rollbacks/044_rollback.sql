-- Rollback da Migration 044: remover triggers anti-rebaixamento de prova
-- ============================================================================
-- Após isto, um UPDATE volta a poder apagar chave_acesso/protocolo de uma NF e
-- providerChargeId/nossoNumero/linhaDigitavel/bankSlipUrl de uma conta a receber
-- (a race de perda-de-prova por eco/relógio retorna). Use apenas se a 044 causar
-- problema inesperado num fluxo legítimo.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_preserve_nf_proof ON public.notas_fiscais;
DROP TRIGGER IF EXISTS trg_preserve_cobranca_proof ON public.contas_receber;

DROP FUNCTION IF EXISTS preserve_nf_proof();
DROP FUNCTION IF EXISTS preserve_cobranca_proof();
