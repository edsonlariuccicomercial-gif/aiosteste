-- Migration 036: NF-e número atômico server-authoritative (PASSO 3 — P0 FISCAL)
-- ============================================================================
-- Origem: docs/architecture/ARCH-sync-fonte-unica-verdade-20260623.md (Aria @architect)
-- Decisão stakeholder: VÁRIAS pessoas emitem NF → risco de número duplicado é REAL.
--
-- DIAGNÓSTICO (Dara, verificado ao vivo via REST 2026-06-23):
--   • A função next_nf_number() da migration 00701 NÃO está aplicada no banco
--     (probe rpc → HTTP 404). O código caiu de volta no cálculo client-side
--     (gdp-notas-fiscais.js:840), que é NÃO-atômico → 2 máquinas podem pegar o
--     mesmo número.
--   • nf_counter.counter = 1239, parado em 2026-04-07.
--   • MÁXIMO real de numero em notas_fiscais (LARIUCCI, todos os status) = 1591.
--     (faixa usada 1210..1591, 165 notas; lacunas livres: 1586,1589,1590)
--   • Logo o counter está 352 ATRÁS. Religar a RPC sem corrigir faria a próxima
--     NF sair 1240 — COLIDINDO com notas já autorizadas. Por isso corrigimos o
--     counter para o MAX real ANTES de expor a função.
--
-- ESTRATÉGIA: sequencial crescente (próximo = max(counter, MAX(numero))+1).
--   NÃO preenche lacunas antigas (1586/1589/1590) — preencher quebraria a
--   sequência temporal e pode causar rejeição na SEFAZ. Sequência sempre p/ frente.
--
-- IDEMPOTENTE. REVERSÍVEL: supabase/rollbacks/036_rollback.sql
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CORREÇÃO DO ESTADO: alinhar counter ao maior número REALMENTE usado.
--    Faz por empresa_id, derivando do próprio dado (não hardcoda 1591) — assim
--    fica correto p/ qualquer empresa e re-executável com segurança.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  _emp TEXT;
  _max_usado INTEGER;
  _counter_atual INTEGER;
  _novo INTEGER;
BEGIN
  FOR _emp IN SELECT DISTINCT empresa_id FROM nf_counter LOOP
    -- maior numero realmente usado em notas_fiscais (numero é texto → cast seguro)
    SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::INTEGER), 0)
      INTO _max_usado
      FROM notas_fiscais
     WHERE empresa_id = _emp AND numero IS NOT NULL;

    SELECT counter INTO _counter_atual FROM nf_counter WHERE empresa_id = _emp;

    _novo := GREATEST(COALESCE(_counter_atual, 0), COALESCE(_max_usado, 0));

    IF _novo > COALESCE(_counter_atual, 0) THEN
      UPDATE nf_counter SET counter = _novo, updated_at = now() WHERE empresa_id = _emp;
      RAISE NOTICE 'nf_counter[%] corrigido: % → % (max usado=%)', _emp, _counter_atual, _novo, _max_usado;
    ELSE
      RAISE NOTICE 'nf_counter[%] OK: counter=% >= max usado=%', _emp, _counter_atual, _max_usado;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. FUNÇÃO ATÔMICA: next_nf_number(empresa_id) → INTEGER
--    SELECT ... FOR UPDATE serializa emissões concorrentes (uma trava por vez).
--    Defesa extra: o próximo nunca é menor que o MAX real em notas_fiscais
--    (protege contra counter dessincronizado por escrita legada).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_nf_number(p_empresa_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter INTEGER;
  v_max_usado INTEGER;
  v_next INTEGER;
BEGIN
  -- Trava exclusiva da linha do counter desta empresa (serializa concorrência).
  SELECT counter INTO v_counter
    FROM nf_counter
   WHERE empresa_id = p_empresa_id
   FOR UPDATE;

  -- maior numero realmente usado (rede de segurança contra counter atrasado)
  SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::INTEGER), 0)
    INTO v_max_usado
    FROM notas_fiscais
   WHERE empresa_id = p_empresa_id AND numero IS NOT NULL;

  IF v_counter IS NULL THEN
    -- primeira emissão desta empresa
    v_next := GREATEST(COALESCE(v_max_usado, 0), 0) + 1;
    INSERT INTO nf_counter (empresa_id, counter, updated_at)
    VALUES (p_empresa_id, v_next, now())
    ON CONFLICT (empresa_id) DO UPDATE
      SET counter = EXCLUDED.counter, updated_at = now();
  ELSE
    v_next := GREATEST(v_counter, COALESCE(v_max_usado, 0)) + 1;
    UPDATE nf_counter SET counter = v_next, updated_at = now()
     WHERE empresa_id = p_empresa_id;
  END IF;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION next_nf_number IS
  'PASSO 3 ARCH-sync (P0 fiscal): retorna próximo número de NF-e atomicamente (FOR UPDATE + defesa contra counter atrasado). Chamar via supabase.rpc(next_nf_number, {p_empresa_id}).';

-- 3. Permissões: anon e authenticated podem executar (a app usa anon key)
GRANT EXECUTE ON FUNCTION next_nf_number(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION next_nf_number(TEXT) TO authenticated;
