-- Migration 019: Add audit triggers to extratos and conciliacoes
-- Story 5.8 — Brownfield Discovery Epic 5
-- These financial tables were added in migration 018 without audit tracking

-- Audit trigger for extratos (bank statements)
CREATE TRIGGER trg_audit_extratos
  AFTER INSERT OR UPDATE OR DELETE ON extratos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Audit trigger for conciliacoes (reconciliation entries)
CREATE TRIGGER trg_audit_conciliacoes
  AFTER INSERT OR UPDATE OR DELETE ON conciliacoes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Add table comments for consistency
COMMENT ON TRIGGER trg_audit_extratos ON extratos IS 'Audit trail for bank statement changes (Story 5.8)';
COMMENT ON TRIGGER trg_audit_conciliacoes ON conciliacoes IS 'Audit trail for reconciliation changes (Story 5.8)';
