-- ============================================================
-- Story 5.1 — Backup automático e audit trail
-- ============================================================

-- Tabela de snapshots (backup point-in-time)
CREATE TABLE IF NOT EXISTS data_snapshots (
  id BIGSERIAL PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tabela TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  registros INTEGER DEFAULT 0,
  motivo TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_empresa ON data_snapshots(empresa_id, tabela, created_at DESC);

-- Função para criar snapshot de uma tabela
CREATE OR REPLACE FUNCTION snapshot_table(p_empresa TEXT, p_tabela TEXT, p_motivo TEXT DEFAULT 'auto')
RETURNS INTEGER AS $$
DECLARE
  v_data JSONB;
  v_count INTEGER;
BEGIN
  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM %I t WHERE empresa_id = $1',
    p_tabela
  ) INTO v_data USING p_empresa;

  v_count := COALESCE(jsonb_array_length(v_data), 0);

  INSERT INTO data_snapshots (empresa_id, tabela, snapshot, registros, motivo)
  VALUES (p_empresa, p_tabela, COALESCE(v_data, '[]'::jsonb), v_count, p_motivo);

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Função para snapshot completo de todas as tabelas
CREATE OR REPLACE FUNCTION snapshot_all(p_empresa TEXT, p_motivo TEXT DEFAULT 'auto')
RETURNS TABLE(tabela TEXT, registros INTEGER) AS $$
BEGIN
  RETURN QUERY SELECT 'contratos'::TEXT, snapshot_table(p_empresa, 'contratos', p_motivo);
  RETURN QUERY SELECT 'pedidos'::TEXT, snapshot_table(p_empresa, 'pedidos', p_motivo);
  RETURN QUERY SELECT 'notas_fiscais'::TEXT, snapshot_table(p_empresa, 'notas_fiscais', p_motivo);
  RETURN QUERY SELECT 'clientes'::TEXT, snapshot_table(p_empresa, 'clientes', p_motivo);
  RETURN QUERY SELECT 'contas_receber'::TEXT, snapshot_table(p_empresa, 'contas_receber', p_motivo);
  RETURN QUERY SELECT 'contas_pagar'::TEXT, snapshot_table(p_empresa, 'contas_pagar', p_motivo);
  RETURN QUERY SELECT 'entregas'::TEXT, snapshot_table(p_empresa, 'entregas', p_motivo);
END;
$$ LANGUAGE plpgsql;

-- Audit log para rastrear quem mudou o quê
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  tabela TEXT NOT NULL,
  registro_id TEXT,
  acao TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  dados_antes JSONB,
  dados_depois JSONB,
  usuario TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_empresa ON audit_log(empresa_id, tabela, created_at DESC);

-- Trigger genérico de audit para qualquer tabela
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (empresa_id, tabela, registro_id, acao, dados_antes, usuario)
    VALUES (OLD.empresa_id, TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::jsonb, current_setting('app.current_user', true));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (empresa_id, tabela, registro_id, acao, dados_antes, dados_depois, usuario)
    VALUES (NEW.empresa_id, TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, current_setting('app.current_user', true));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (empresa_id, tabela, registro_id, acao, dados_depois, usuario)
    VALUES (NEW.empresa_id, TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW)::jsonb, current_setting('app.current_user', true));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Aplicar audit trigger nas tabelas principais
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['contratos','pedidos','notas_fiscais','clientes','contas_receber','contas_pagar','entregas']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger()', t);
  END LOOP;
END;
$$;

COMMENT ON TABLE data_snapshots IS 'Backup point-in-time de cada tabela — use snapshot_all(empresa_id) para backup completo';
COMMENT ON TABLE audit_log IS 'Registro automático de toda mudança em contratos, pedidos, NFs, etc.';
COMMENT ON FUNCTION snapshot_all IS 'Cria backup de todas as tabelas para uma empresa. Ex: SELECT * FROM snapshot_all(''LARIUCCI'', ''backup-diario'')';
