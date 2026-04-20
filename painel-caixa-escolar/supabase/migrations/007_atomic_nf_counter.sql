-- Migration 007: Atomic NF-e counter function
-- Story 7.3 — Corrigir Race Condition NF-e
-- TD-017 (CRITICAL): Race condition on nf_counter (GET + save = non-atomic)

-- ============================================================
-- 1. Atomic function: next_nf_number()
--    Uses SELECT ... FOR UPDATE to guarantee exclusive lock
--    Only one transaction at a time can increment the counter
-- ============================================================
CREATE OR REPLACE FUNCTION next_nf_number(p_empresa_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  -- Lock the row exclusively and get the next number
  SELECT counter + 1 INTO v_next
  FROM nf_counter
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_next IS NULL THEN
    -- First NF for this empresa: insert with counter = 1
    INSERT INTO nf_counter (empresa_id, counter, updated_at)
    VALUES (p_empresa_id, 1, now())
    ON CONFLICT (empresa_id) DO UPDATE
      SET counter = nf_counter.counter + 1,
          updated_at = now()
    RETURNING counter INTO v_next;
  ELSE
    -- Increment atomically
    UPDATE nf_counter
    SET counter = v_next, updated_at = now()
    WHERE empresa_id = p_empresa_id;
  END IF;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION next_nf_number IS 'Returns next NF-e number atomically (thread-safe). Use via supabase.rpc("next_nf_number", {p_empresa_id}).';

-- ============================================================
-- 2. Grant execute to anon and authenticated roles
-- ============================================================
GRANT EXECUTE ON FUNCTION next_nf_number(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION next_nf_number(TEXT) TO authenticated;
