-- Migration 045: anti-downgrade de STATUS de NF (ADR-006 Fase 2 — endurece o I2 / RESSALVA-1 da Onda 2)
-- ============================================================================
-- CONTEXTO (QA da Onda 2 via Playwright, 2026-07-02):
-- O trigger 044 (preserve_nf_proof) preserva chave/protocolo, MAS deixou o campo STATUS de uma NF
-- autorizada voltar para 'rascunho' (o UPDATE de downgrade retornou 200; estado final status='rascunho'
-- com a chave ainda presente). Impacto prático BAIXO — a Onda 1 fez a UI derivar a label de
-- temProvaAutorizacao(nf) (olha a chave, não o status), então visualmente segue 'autorizada' — mas há
-- INCONSISTÊNCIA DE DADO: status de rascunho numa NF que tem chave+protocolo reais da SEFAZ.
--
-- ESTA MIGRATION fecha a lacuna: se a NF JÁ tem PROVA (chave 44 díg + protocolo) e o UPDATE tenta
-- rebaixar o STATUS para um estado de RASCUNHO/PENDÊNCIA, o status forte é PRESERVADO (merge OLD→NEW),
-- no MESMO padrão não-destrutivo do 044 (preserva, não faz RAISE — não aborta lote de sync).
--
-- ┌─ EXCEÇÃO FISCAL (crítica — mesma do 044) ─────────────────────────────────┐
-- │ Transições fiscais LEGÍTIMAS a partir de uma NF autorizada DEVEM passar,     │
-- │ mesmo com chave presente: cancelada / denegada / inutilizada / rejeitada.   │
-- │ O trigger só barra o downgrade para estados de RASCUNHO/PENDÊNCIA (a NF      │
-- │ "regredir" por eco/relógio de sync), NUNCA uma ação fiscal real.            │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- COMPLEMENTA (não substitui) o 044: 044 preserva os CAMPOS de prova; 045 preserva o STATUS forte.
-- IDEMPOTENTE (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). REVERSÍVEL (rollbacks/045_rollback.sql).
-- NÃO-DESTRUTIVO: nenhum dado apagado; só restaura o status que o UPDATE tentou rebaixar.
-- ============================================================================

CREATE OR REPLACE FUNCTION preserve_nf_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  -- Prova durável presente no registro ANTIGO (coluna ou espelho JSONB sefaz).
  _tem_prova BOOLEAN;
  _old_status TEXT := lower(coalesce(OLD.status, ''));
  _new_status TEXT := lower(coalesce(NEW.status, ''));
  -- Estados "fortes" (autorizado de fato) de onde NÃO se deve regredir por sync.
  _status_forte BOOLEAN;
  -- Estados de RASCUNHO/PENDÊNCIA — o downgrade a barrar (regressão por eco/relógio).
  _downgrade_fraco BOOLEAN;
  -- Estados fiscais LEGÍTIMOS — sempre permitidos (a exceção).
  _fiscal_legitimo BOOLEAN;
BEGIN
  _tem_prova := (
    (coalesce(OLD.chave_acesso, '') ~ '^[0-9]{44}$' AND coalesce(OLD.protocolo, '') <> '')
    OR (coalesce(OLD.sefaz->>'chaveAcesso', '') ~ '^[0-9]{44}$' AND coalesce(OLD.sefaz->>'protocolo', '') <> '')
  );

  -- Sem prova → nada a proteger (deixa o UPDATE seguir normalmente).
  IF NOT _tem_prova THEN
    RETURN NEW;
  END IF;

  _status_forte := _old_status IN ('autorizada', 'emitida', 'faturada');
  _fiscal_legitimo := _new_status IN ('cancelada', 'denegada', 'inutilizada', 'rejeitada');
  _downgrade_fraco := _new_status IN (
    'rascunho', 'rascunho_nf_real', 'pendente', 'pendente_autorizacao',
    'transmitida', 'transmissao_realizada', 'transmissao_em_preparo',
    'registrada_externamente', 'registrada', ''
  );

  -- Barra APENAS: estava forte + UPDATE leva a estado fraco + NÃO é transição fiscal legítima.
  IF _status_forte AND _downgrade_fraco AND NOT _fiscal_legitimo THEN
    NEW.status := OLD.status; -- preserva o status forte (regressão por eco/relógio neutralizada)
    RAISE NOTICE 'anti-downgrade NF id=%: status % preservado (tentaram rebaixar p/ %)', NEW.id, OLD.status, _new_status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION preserve_nf_status IS
  'ADR-006 Fase 2 / RESSALVA-1: com prova (chave44+protocolo) presente, um UPDATE não rebaixa o STATUS de autorizada/emitida/faturada para rascunho/pendente/transmitida (restaura OLD). EXCEÇÃO: cancelada/denegada/inutilizada/rejeitada passam livres (ação fiscal legítima). Complementa preserve_nf_proof (044).';

-- Trigger dedicado. Nome distinto do 044 para poderem coexistir; ambos BEFORE UPDATE em notas_fiscais.
-- Ordem entre eles é irrelevante (044 mexe em chave/protocolo/sefaz; 045 mexe em status) — campos disjuntos.
DROP TRIGGER IF EXISTS trg_preserve_nf_status ON public.notas_fiscais;
CREATE TRIGGER trg_preserve_nf_status
  BEFORE UPDATE ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION preserve_nf_status();

-- ============================================================================
-- VALIDAÇÃO POS-MIGRATION (rodar manualmente com IDs reais):
--   -- 1) downgrade por eco (deve PRESERVAR o status forte):
--   UPDATE notas_fiscais SET status='rascunho' WHERE id='<id-autorizada-com-chave>'
--     RETURNING status, chave_acesso;
--   -- Esperado: status CONTINUA 'autorizada' (ou o forte anterior); chave preservada.
--   -- 2) cancelamento fiscal LEGÍTIMO (deve PASSAR):
--   UPDATE notas_fiscais SET status='cancelada' WHERE id='<id-autorizada-com-chave>'
--     RETURNING status, chave_acesso;
--   -- Esperado: status='cancelada'; chave preservada.
--   -- 3) NF sem prova: downgrade normal segue permitido (trigger não age).
-- ============================================================================
