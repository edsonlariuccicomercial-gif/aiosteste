-- Rollback da Migration 037: reverter next_nf_number para SECURITY INVOKER
-- ============================================================================
-- Volta a função ao modo INVOKER (privilégios do chamador). ATENÇÃO: com a anon
-- read-only (migration 034), isto FAZ a RPC voltar a falhar com erro de RLS (42501).
-- Use apenas se SECURITY DEFINER causar problema de segurança inesperado E houver
-- plano alternativo (ex: chamar a RPC pelo backend service_role).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_nf_number(p_empresa_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter INTEGER;
  v_max_usado INTEGER;
  v_next INTEGER;
BEGIN
  SELECT counter INTO v_counter FROM nf_counter WHERE empresa_id = p_empresa_id FOR UPDATE;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '\D', '', 'g'), '')::INTEGER), 0)
    INTO v_max_usado FROM notas_fiscais WHERE empresa_id = p_empresa_id AND numero IS NOT NULL;
  IF v_counter IS NULL THEN
    v_next := GREATEST(COALESCE(v_max_usado, 0), 0) + 1;
    INSERT INTO nf_counter (empresa_id, counter, updated_at) VALUES (p_empresa_id, v_next, now())
    ON CONFLICT (empresa_id) DO UPDATE SET counter = EXCLUDED.counter, updated_at = now();
  ELSE
    v_next := GREATEST(v_counter, COALESCE(v_max_usado, 0)) + 1;
    UPDATE nf_counter SET counter = v_next, updated_at = now() WHERE empresa_id = p_empresa_id;
  END IF;
  RETURN v_next;
END;
$$;
