-- Migration 011: Type safety — DATE conversion + CHECK constraints
-- Story 7.13 — Alterar data_apuracao para DATE + CHECK constraints de status
-- TD-022 (HIGH): data_apuracao as TEXT blocks temporal queries
-- TD-020 (MEDIUM): No CHECK constraints on status fields

-- ============================================================
-- 1. Convert data_apuracao from TEXT to DATE (safe casting)
-- ============================================================
ALTER TABLE contratos
  ALTER COLUMN data_apuracao TYPE DATE
  USING CASE
    WHEN data_apuracao ~ '^\d{4}-\d{2}-\d{2}$' THEN data_apuracao::DATE
    WHEN data_apuracao ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(data_apuracao, 'DD/MM/YYYY')
    ELSE NULL
  END;

-- ============================================================
-- 2. CHECK constraints on status columns
-- ============================================================
ALTER TABLE contratos ADD CONSTRAINT chk_contratos_status
  CHECK (status IN ('ativo', 'encerrado', 'suspenso', 'cancelado'));

ALTER TABLE pedidos ADD CONSTRAINT chk_pedidos_status
  CHECK (status IN ('em_aberto', 'em_preparo', 'entregue', 'cancelado', 'faturado'));

ALTER TABLE notas_fiscais ADD CONSTRAINT chk_nfs_status
  CHECK (status IN ('pendente', 'autorizada', 'cancelada', 'rejeitada', 'denegada', 'inutilizada'));

ALTER TABLE contas_receber ADD CONSTRAINT chk_cr_status
  CHECK (status IN ('pendente', 'emitida', 'recebida', 'atrasada', 'cancelada'));

ALTER TABLE contas_pagar ADD CONSTRAINT chk_cp_status
  CHECK (status IN ('pendente', 'paga', 'atrasada', 'cancelada', 'emitida'));

ALTER TABLE entregas ADD CONSTRAINT chk_entregas_status
  CHECK (status_entrega IN ('pendente', 'entregue', 'devolvido', 'parcial'));

-- ============================================================
-- 3. CHECK for tipo_nota in notas_fiscais
-- ============================================================
ALTER TABLE notas_fiscais ADD CONSTRAINT chk_nfs_tipo_nota
  CHECK (tipo_nota IN ('nfe_real', 'simulacao', 'contingencia', 'devolucao'));
