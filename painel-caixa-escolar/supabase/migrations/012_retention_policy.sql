-- Migration 012: Retention policy for data_snapshots and audit_log
-- Story 7.19 (TD-025): Prevent storage bloat from unbounded growth
-- data_snapshots: ~500KB/day → 500MB limit hit in ~6 months without cleanup
-- audit_log: ~140 records/day → 50K/year with ~2KB each = ~100MB/year

-- ============================================================
-- 1. Cleanup function for data_snapshots (retain last N days)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_snapshots(p_retain_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM data_snapshots
  WHERE created_at < (now() - (p_retain_days || ' days')::INTERVAL);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Log the cleanup
  INSERT INTO audit_log (empresa_id, tabela, operacao, dados_novos)
  VALUES ('SYSTEM', 'data_snapshots', 'RETENTION_CLEANUP',
    jsonb_build_object('deleted_rows', v_deleted, 'retain_days', p_retain_days, 'executed_at', now())
  );

  RETURN v_deleted;
END;
$$;

-- ============================================================
-- 2. Cleanup function for audit_log (retain last N days)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_audit(p_retain_days INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM audit_log
  WHERE created_at < (now() - (p_retain_days || ' days')::INTERVAL)
    AND operacao != 'RETENTION_CLEANUP'; -- Don't delete cleanup logs themselves

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO audit_log (empresa_id, tabela, operacao, dados_novos)
  VALUES ('SYSTEM', 'audit_log', 'RETENTION_CLEANUP',
    jsonb_build_object('deleted_rows', v_deleted, 'retain_days', p_retain_days, 'executed_at', now())
  );

  RETURN v_deleted;
END;
$$;

-- ============================================================
-- 3. Combined cleanup (call this from a cron or scheduled function)
-- ============================================================
CREATE OR REPLACE FUNCTION run_retention_cleanup()
RETURNS TABLE(table_name TEXT, deleted_rows INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 'data_snapshots'::TEXT, cleanup_old_snapshots(90);

  RETURN QUERY
  SELECT 'audit_log'::TEXT, cleanup_old_audit(365);
END;
$$;

COMMENT ON FUNCTION run_retention_cleanup IS 'Run weekly via cron. Deletes snapshots > 90 days and audit entries > 365 days.';

-- ============================================================
-- 4. Grant execution to service role
-- ============================================================
GRANT EXECUTE ON FUNCTION cleanup_old_snapshots(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_audit(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION run_retention_cleanup() TO authenticated;
