-- Migration 010: Financial column integrity + performance indices
-- Story 7.11 — NOT NULL em colunas financeiras + índices
-- TD-018 (HIGH): Nullable financial columns allow zero-value records
-- TD-019 (MEDIUM): Missing indices on vencimento columns

-- ============================================================
-- 1. Backfill NULL values to 0 before adding constraints
-- ============================================================
UPDATE pedidos SET valor = 0 WHERE valor IS NULL;
UPDATE notas_fiscais SET valor = 0 WHERE valor IS NULL;
UPDATE contas_receber SET valor = 0 WHERE valor IS NULL;
UPDATE contas_pagar SET valor = 0 WHERE valor IS NULL;

-- ============================================================
-- 2. Add NOT NULL constraints on financial columns
-- ============================================================
ALTER TABLE pedidos ALTER COLUMN valor SET NOT NULL;
ALTER TABLE pedidos ALTER COLUMN valor SET DEFAULT 0;

ALTER TABLE notas_fiscais ALTER COLUMN valor SET NOT NULL;
ALTER TABLE notas_fiscais ALTER COLUMN valor SET DEFAULT 0;

ALTER TABLE contas_receber ALTER COLUMN valor SET NOT NULL;
ALTER TABLE contas_receber ALTER COLUMN valor SET DEFAULT 0;

ALTER TABLE contas_pagar ALTER COLUMN valor SET NOT NULL;
ALTER TABLE contas_pagar ALTER COLUMN valor SET DEFAULT 0;

-- ============================================================
-- 3. Performance indices for dashboard queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON contas_receber(vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON contas_pagar(vencimento);
CREATE INDEX IF NOT EXISTS idx_nfs_vencimento ON notas_fiscais(vencimento);
CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data_entrega);

-- Composite indices for empresa-scoped dashboard queries
CREATE INDEX IF NOT EXISTS idx_cr_empresa_vencimento
  ON contas_receber(empresa_id, vencimento)
  WHERE status IN ('pendente', 'emitida', 'atrasada');

CREATE INDEX IF NOT EXISTS idx_cp_empresa_vencimento
  ON contas_pagar(empresa_id, vencimento)
  WHERE status IN ('pendente', 'atrasada');
