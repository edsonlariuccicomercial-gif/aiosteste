-- Migration 043: deleted_at TERMINAL — exclusão vira lei na origem (ADR-006 Fase 2 / invariante I3)
-- ============================================================================
-- CONTEXTO (ONDA 2, sop-chief handoff 2026-07-01):
-- A cura de "some/volta" da Fase 1 vive no CLIENTE (tombstone-filter em gdp-api.js / merge por-item).
-- Protege só a máquina ATUALIZADA. Uma aba antiga / navegador desatualizado ainda pode enviar um
-- UPDATE stale que ZERA deleted_at (reidratando uma cópia velha do registro) → exclusão ressuscita
-- em multi-máquina, porque o BANCO não impõe a regra. Esta migration move a blindagem para um
-- trigger no Postgres: uma vez soft-deletado, o registro NÃO volta por UPDATE de sync.
--
-- INVARIANTE I3 (deleted_at terminal): se OLD.deleted_at já está preenchido, um UPDATE que tente
-- zerá-lo (NEW.deleted_at IS NULL) é IGNORADO — preservamos OLD.deleted_at. Escolhemos PRESERVAR
-- (não RAISE) de propósito: um saveAll em lote de um cliente stale não deve abortar a transação
-- inteira; só a tentativa de reviver é neutralizada, o resto do UPDATE segue. Exclusão = terminal.
--
-- NÃO barra a EXCLUSÃO em si (NEW.deleted_at passando de NULL → preenchido é permitido).
-- NÃO barra um "hard undelete" administrativo feito direto no banco fora deste caminho (é UPDATE
-- também, mas o cenário real de reviver-por-acidente é o eco de sync; se um dia for preciso reviver
-- de propósito, faz-se via SQL com o trigger desabilitado por 1 statement — documentado no rollback).
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS. Seguro re-rodar.
-- REVERSÍVEL: supabase/rollbacks/043_rollback.sql (drop triggers + function).
-- NÃO-DESTRUTIVO: nenhum dado é apagado; o trigger só neutraliza reviver-por-eco.
-- ============================================================================

-- 1. Função única reutilizada por todas as tabelas com soft-delete.
CREATE OR REPLACE FUNCTION enforce_deleted_at_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só age quando o registro JÁ estava deletado e o UPDATE tenta ressuscitá-lo.
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    -- Preserva o estado terminal: ignora o zeramento vindo do cliente stale.
    NEW.deleted_at := OLD.deleted_at;
    RAISE NOTICE 'deleted_at terminal: revive bloqueado para % id=%', TG_TABLE_NAME, NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_deleted_at_terminal IS
  'ADR-006 Fase 2 / I3: uma vez soft-deletado (deleted_at != NULL), um UPDATE que zere deleted_at é ignorado (preserva OLD). Exclusão é terminal na origem — dispensa o tombstone-filter do cliente.';

-- 2. Aplica o trigger só nas tabelas que têm a coluna deleted_at (idempotente).
--    Roda BEFORE UPDATE, ANTES do trg_set_updated_at (ordem alfabética de nome: 'a' < 's'),
--    o que é irrelevante aqui pois um não depende do outro (setam colunas distintas).
DO $$
DECLARE
  _tables TEXT[] := ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'clientes',
    'contas_receber', 'contas_pagar', 'entregas',
    'extratos', 'conciliacoes', 'produtos',
    'lancamentos_cliente'
  ];
  _t TEXT;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = _t AND column_name = 'deleted_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_deleted_at_terminal ON public.%I', _t);
      EXECUTE format(
        'CREATE TRIGGER trg_deleted_at_terminal BEFORE UPDATE ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION enforce_deleted_at_terminal()', _t
      );
      RAISE NOTICE 'trg_deleted_at_terminal aplicado em %', _t;
    ELSE
      RAISE NOTICE 'PULADO % (sem coluna deleted_at)', _t;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- VALIDAÇÃO POS-MIGRATION (rodar manualmente):
--   -- 1) soft-delete um registro de teste, depois tente reviver:
--   UPDATE produtos SET deleted_at = now() WHERE id = '<id-teste>';
--   UPDATE produtos SET deleted_at = NULL  WHERE id = '<id-teste>' RETURNING id, deleted_at;
--   -- Esperado: deleted_at CONTINUA preenchido (revive bloqueado).
--   -- 2) excluir de verdade ainda funciona:
--   UPDATE contas_receber SET deleted_at = now() WHERE id = '<id>' RETURNING deleted_at; -- OK
-- ============================================================================
