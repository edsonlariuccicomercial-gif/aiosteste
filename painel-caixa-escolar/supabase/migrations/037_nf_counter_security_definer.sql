-- Migration 037: next_nf_number como SECURITY DEFINER (fix RLS — anon read-only)
-- ============================================================================
-- CONTEXTO: a migration 034_rls_anon_readonly tornou a anon key read-only. A
-- função next_nf_number() (036) faz UPDATE/INSERT em nf_counter; chamada pela
-- anon key ela rodava com privilégios do CHAMADOR (read-only) → RLS bloqueava
-- (erro 42501). Em prod o teste via REST retornou HTTP 401.
--
-- FIX: SECURITY DEFINER faz a função executar com privilégios do DONO (que pode
-- escrever). É seguro: a função SÓ incrementa o counter de NF (operação restrita,
-- sem entrada arbitrária além de p_empresa_id). SET search_path = '' + nomes
-- totalmente qualificados (public.) previne ataque de search_path (boa prática
-- obrigatória em SECURITY DEFINER).
--
-- IDEMPOTENTE (CREATE OR REPLACE). REVERSÍVEL: rollbacks/037_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_nf_number(p_empresa_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_counter INTEGER;
  v_max_usado INTEGER;
  v_next INTEGER;
BEGIN
  SELECT counter INTO v_counter
    FROM public.nf_counter
   WHERE empresa_id = p_empresa_id
   FOR UPDATE;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::INTEGER), 0)
    INTO v_max_usado
    FROM public.notas_fiscais
   WHERE empresa_id = p_empresa_id AND numero IS NOT NULL;

  IF v_counter IS NULL THEN
    v_next := GREATEST(COALESCE(v_max_usado, 0), 0) + 1;
    INSERT INTO public.nf_counter (empresa_id, counter, updated_at)
    VALUES (p_empresa_id, v_next, now())
    ON CONFLICT (empresa_id) DO UPDATE
      SET counter = EXCLUDED.counter, updated_at = now();
  ELSE
    v_next := GREATEST(v_counter, COALESCE(v_max_usado, 0)) + 1;
    UPDATE public.nf_counter SET counter = v_next, updated_at = now()
     WHERE empresa_id = p_empresa_id;
  END IF;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.next_nf_number IS
  'PASSO 3 ARCH-sync (P0 fiscal): próximo número de NF-e atômico (FOR UPDATE). SECURITY DEFINER p/ funcionar com anon read-only (RLS migration 034). search_path travado.';

GRANT EXECUTE ON FUNCTION public.next_nf_number(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.next_nf_number(TEXT) TO authenticated;
