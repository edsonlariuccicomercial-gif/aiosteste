-- ============================================================
-- 032: Campo "unidade" nos itens da conta-corrente — EPIC-20 / Story 20.9.1 (ajuste)
-- ============================================================
-- Adiciona a unidade de medida (KG, UN, GR, PCT, L, CX...) aos itens de retirada,
-- para o extrato/demonstrativo exibir "20 KG de arroz" em vez de só "20 arroz".
-- A unidade é detectada do nome do produto ARP (lógica parseUnidadeFromName) mas
-- permanece editável na app.
--
-- Idempotente (IF NOT EXISTS). Aditiva. Zero-downtime.
-- Reversível: ver rollback comentado no fim.

ALTER TABLE lancamentos_itens ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT 'UN';

COMMENT ON COLUMN lancamentos_itens.unidade IS 'Unidade de medida do item (KG, UN, GR, PCT, L, CX...). Detectada do nome do produto ARP, editável na app. Default UN.';

-- ===== ROLLBACK (executar manualmente se necessário) =====
-- ALTER TABLE lancamentos_itens DROP COLUMN IF EXISTS unidade;
