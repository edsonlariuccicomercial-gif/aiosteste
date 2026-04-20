-- Migration 008: UNIQUE index on NF + fix set_updated_at trigger
-- Story 7.3 — Corrigir Race Condition NF-e (safety net)
-- TD-028 (HIGH): NF index not UNIQUE per empresa/serie
-- TD-023 (HIGH): set_updated_at() function not defined

-- ============================================================
-- 1. UNIQUE index: prevents duplicate NF numbers per empresa/serie
--    Acts as safety net even if atomic function is bypassed
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfs_unique_empresa_numero_serie
  ON notas_fiscais(empresa_id, numero, serie);

-- ============================================================
-- 2. Fix set_updated_at() — referenced by migration 004 but never created
--    (migration 001 defined update_updated_at() with different name)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the trigger to ensure it points to the correct function
DROP TRIGGER IF EXISTS trg_resultados_updated_at ON resultados_orcamento;
CREATE TRIGGER trg_resultados_updated_at
  BEFORE UPDATE ON resultados_orcamento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
