-- Migration 042: relogio duravel (updated_at) em notas_fiscais — causa-raiz da regressao Emitida->Pendente
-- ============================================================================
-- CONTEXTO (diagnostico @analyst + @architect + @data-engineer, 2026-06-30):
-- O realtime (gdp-realtime.js) usa updated_at como arbitro de "quem e mais novo" no merge.
-- Comprovado ao vivo: 198 de 198 notas estavam SEM updated_at (campo nulo/ausente) -> _tsRobusto()
-- retornava string vazia -> a guarda de timestamp (linha 330) caia em '!lTs' true -> um eco ATRASADO
-- do Supabase (sem chave) SOBRESCREVIA a nota autorizada -> nota regredia para pendente e a cobranca
-- virava orfa (boleto "sumia"). Sem relogio, last-write-wins e nao-deterministico.
--
-- ESTA MIGRATION blinda a camada de DADOS na origem:
--   1. Garante coluna updated_at TIMESTAMPTZ DEFAULT now() (idempotente).
--   2. Cria trigger BEFORE UPDATE que SEMPRE carimba updated_at = now() em qualquer UPDATE.
--   3. Backfill: preenche updated_at das linhas existentes SEM relogio (deriva de campos confiaveis).
--
-- IDEMPOTENTE: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS. Seguro re-rodar.
-- REVERSIVEL: rollbacks/042_rollback.sql (drop trigger + function; NAO remove a coluna nem o backfill).
-- NAO-DESTRUTIVO: nenhum dado e apagado; backfill so toca linhas com updated_at NULL.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) COLUNA: garante updated_at com default. (Se ja existir, no-op.)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) FUNCTION + TRIGGER: todo UPDATE carimba updated_at = now().
--    SECURITY INVOKER (default) — nao precisa de privilegio elevado, so seta uma coluna.
--    Sem SET search_path mutavel: a function nao chama nada sensivel.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_notas_fiscais()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notas_fiscais_updated_at ON notas_fiscais;
CREATE TRIGGER trg_notas_fiscais_updated_at
  BEFORE UPDATE ON notas_fiscais
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_notas_fiscais();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) BACKFILL: linhas existentes sem relogio recebem um updated_at confiavel.
--    Ordem de preferencia (mais confiavel -> menos): created_at -> emitida_em ->
--    sefaz->>'authorizedAt' -> audit->>'updatedAt' -> now(). Coalesce robusto.
--    Guard: so toca linhas onde updated_at e NULL (idempotente).
--    NOTA: cobre tanto coluna recem-criada (todas NULL ate o DEFAULT pegar em UPDATE)
--    quanto linhas legadas. O DEFAULT now() so se aplica a INSERT; UPDATE/legado usa este backfill.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE notas_fiscais
SET updated_at = COALESCE(
      created_at,
      emitida_em,
      NULLIF(sefaz->>'authorizedAt', '')::timestamptz,
      NULLIF(audit->>'updatedAt', '')::timestamptz,
      now()
    )
WHERE updated_at IS NULL;

COMMENT ON COLUMN notas_fiscais.updated_at IS
  'Relogio duravel para resolucao de conflito no realtime (merge last-write-wins). Carimbado por trigger BEFORE UPDATE. Migration 042.';

COMMIT;

-- ============================================================================
-- VALIDACAO POS-MIGRATION (rodar manualmente, fora da transacao):
--   SELECT count(*) FILTER (WHERE updated_at IS NULL) AS sem_relogio,
--          count(*) AS total
--   FROM notas_fiscais WHERE empresa_id = 'LARIUCCI';
--   -- Esperado: sem_relogio = 0
--
--   -- testar o trigger:
--   UPDATE notas_fiscais SET status = status WHERE id = (SELECT id FROM notas_fiscais LIMIT 1)
--   RETURNING id, updated_at;  -- updated_at deve refletir agora
-- ============================================================================
