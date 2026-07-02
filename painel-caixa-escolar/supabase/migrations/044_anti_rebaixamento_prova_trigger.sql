-- Migration 044: anti-rebaixamento de PROVA (ADR-006 Fase 2 / invariante I2)
-- ============================================================================
-- CONTEXTO (ONDA 2, sop-chief handoff 2026-07-01):
-- Um UPDATE stale de uma máquina com código antigo pode SOBRESCREVER um registro que já tinha
-- PROVA durável, apagando-a — a NF autorizada volta a "pendente" (perde chave/protocolo), e a
-- cobrança perde o providerChargeId (boleto "some"). A Fase 1 protege isso no cliente; esta
-- migration impõe no BANCO, cobrindo até a máquina com código velho.
--
-- INVARIANTE I2 (não-rebaixamento de prova): um UPDATE NUNCA remove uma prova que o registro já
-- possuía. A prova é FATO externo durável (a SEFAZ autorizou; o banco emitiu o boleto) — mais
-- confiável que o status volátil na RAM do cliente. Escolhemos PRESERVAR (merge OLD→NEW), não
-- RAISE, pelo mesmo motivo da 043: não abortar lote de sync; só neutralizar a perda da prova.
--
-- ┌─ EXCEÇÃO FISCAL (cuidado do handoff) ─────────────────────────────────────┐
-- │ Uma NF-e autorizada NÃO se apaga por relógio de sync, MAS pode mudar de     │
-- │ estado por AÇÃO FISCAL legítima (cancelamento/inutilização/denegação).      │
-- │ Distinção-chave: o cancelamento fiscal NÃO apaga a chave/protocolo — ele    │
-- │ muda o STATUS ('autorizada' → 'cancelada') e MANTÉM a chave (a NF cancelada  │
-- │ segue tendo chave+protocolo, agora com um evento de cancelamento). Logo,     │
-- │ "preservar chave/protocolo quando OLD os tinha" JAMAIS bloqueia um           │
-- │ cancelamento legítimo — só bloqueia a PERDA acidental da chave por eco.      │
-- │ O trigger portanto age APENAS sobre os campos de PROVA, nunca sobre status.  │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- IDEMPOTENTE: CREATE OR REPLACE + DROP TRIGGER IF EXISTS. REVERSÍVEL: rollbacks/044_rollback.sql.
-- NÃO-DESTRUTIVO: nenhum dado apagado; o trigger só restaura prova que o UPDATE tentou remover.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) NOTAS FISCAIS — preserva chave_acesso / protocolo (colunas) + sefaz (JSONB).
--    Regra: se OLD tinha chave de 44 dígitos e/ou protocolo, e NEW os esvazia,
--    restaura de OLD. Idem para os espelhos internos sefaz.chaveAcesso/protocolo.
--    NÃO toca em status — cancelamento fiscal (status='cancelada') passa livre.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION preserve_nf_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  _old_chave TEXT := NULLIF(OLD.chave_acesso, '');
  _old_prot  TEXT := NULLIF(OLD.protocolo, '');
BEGIN
  -- Coluna chave_acesso: só preserva se OLD tinha chave VÁLIDA (44 dígitos) e NEW a esvaziou.
  IF _old_chave IS NOT NULL AND _old_chave ~ '^[0-9]{44}$'
     AND (NEW.chave_acesso IS NULL OR NEW.chave_acesso = '') THEN
    NEW.chave_acesso := OLD.chave_acesso;
    RAISE NOTICE 'anti-rebaixamento NF id=%: chave_acesso preservada', NEW.id;
  END IF;

  -- Coluna protocolo: preserva se OLD tinha e NEW esvaziou.
  IF _old_prot IS NOT NULL AND (NEW.protocolo IS NULL OR NEW.protocolo = '') THEN
    NEW.protocolo := OLD.protocolo;
  END IF;

  -- Espelho interno sefaz (JSONB): reprovê chaveAcesso/protocolo/status-autorizado se o UPDATE
  -- os removeu mas OLD os tinha. Merge campo-a-campo (não sobrescreve o resto do sefaz de NEW).
  IF OLD.sefaz ? 'chaveAcesso'
     AND COALESCE(OLD.sefaz->>'chaveAcesso','') ~ '^[0-9]{44}$'
     AND COALESCE(NEW.sefaz->>'chaveAcesso','') = '' THEN
    NEW.sefaz := COALESCE(NEW.sefaz, '{}'::jsonb)
                 || jsonb_build_object('chaveAcesso', OLD.sefaz->>'chaveAcesso');
    IF COALESCE(OLD.sefaz->>'protocolo','') <> '' AND COALESCE(NEW.sefaz->>'protocolo','') = '' THEN
      NEW.sefaz := NEW.sefaz || jsonb_build_object('protocolo', OLD.sefaz->>'protocolo');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION preserve_nf_proof IS
  'ADR-006 Fase 2 / I2: UPDATE não remove chave_acesso/protocolo de uma NF que já os tinha (restaura de OLD). NÃO toca status — cancelamento fiscal legítimo passa livre. Só barra a perda de prova por eco/relógio.';

DROP TRIGGER IF EXISTS trg_preserve_nf_proof ON public.notas_fiscais;
CREATE TRIGGER trg_preserve_nf_proof
  BEFORE UPDATE ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION preserve_nf_proof();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) CONTAS A RECEBER — preserva a prova de cobrança no JSONB cobranca:
--    providerChargeId / nossoNumero / linhaDigitavel / bankSlipUrl.
--    Boleto real = prova durável (o Inter só emite se a SEFAZ autorizou). Se OLD tinha
--    providerChargeId e NEW o esvaziou, restaura os campos de prova (merge no cobranca de NEW).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION preserve_cobranca_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  _old_pid TEXT := COALESCE(OLD.cobranca->>'providerChargeId', '');
  _new_pid TEXT := COALESCE(NEW.cobranca->>'providerChargeId', '');
  _k TEXT;
  _proof_keys TEXT[] := ARRAY['providerChargeId','nossoNumero','linhaDigitavel','bankSlipUrl'];
BEGIN
  -- Só age se OLD TINHA a prova (providerChargeId) e o UPDATE a removeu.
  IF _old_pid <> '' AND _new_pid = '' THEN
    NEW.cobranca := COALESCE(NEW.cobranca, '{}'::jsonb);
    FOREACH _k IN ARRAY _proof_keys LOOP
      -- restaura cada campo de prova que OLD tinha e NEW não tem (ou esvaziou)
      IF COALESCE(OLD.cobranca->>_k, '') <> '' AND COALESCE(NEW.cobranca->>_k, '') = '' THEN
        NEW.cobranca := NEW.cobranca || jsonb_build_object(_k, OLD.cobranca->>_k);
      END IF;
    END LOOP;
    RAISE NOTICE 'anti-rebaixamento CR id=%: prova de cobranca preservada (providerChargeId)', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION preserve_cobranca_proof IS
  'ADR-006 Fase 2 / I2: UPDATE não remove providerChargeId/nossoNumero/linhaDigitavel/bankSlipUrl de uma conta que já os tinha (restaura de OLD). Boleto real = prova durável > status volátil.';

DROP TRIGGER IF EXISTS trg_preserve_cobranca_proof ON public.contas_receber;
CREATE TRIGGER trg_preserve_cobranca_proof
  BEFORE UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION preserve_cobranca_proof();

-- ============================================================================
-- VALIDAÇÃO POS-MIGRATION (rodar manualmente):
--   -- NF: tentar apagar a chave de uma NF autorizada (simula eco stale) → deve preservar:
--   UPDATE notas_fiscais SET chave_acesso = '' WHERE id='<id-autorizada>' RETURNING chave_acesso;
--   -- Esperado: chave_acesso INALTERADA (44 díg).
--   -- Cancelamento fiscal LEGÍTIMO (muda status, mantém chave) ainda funciona:
--   UPDATE notas_fiscais SET status='cancelada' WHERE id='<id-autorizada>' RETURNING status, chave_acesso;
--   -- Esperado: status='cancelada' E chave_acesso PRESERVADA.
--   -- CR: apagar providerChargeId (simula eco) → deve preservar:
--   UPDATE contas_receber SET cobranca = cobranca - 'providerChargeId' WHERE id='<id-com-boleto>'
--     RETURNING cobranca->>'providerChargeId';
--   -- Esperado: providerChargeId PRESERVADO.
-- ============================================================================
