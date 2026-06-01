-- ============================================================
-- 018: Tabelas dedicadas para extratos bancários e conciliação
-- Migra dados financeiros de sync_data (key-value) para tabelas
-- estruturadas com integridade referencial e RLS.
-- ============================================================

-- ===== EXTRATOS BANCÁRIOS =====
CREATE TABLE IF NOT EXISTS extratos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'LARIUCCI',
  data DATE,
  arquivo TEXT,
  conta_financeira TEXT DEFAULT 'Conta Principal',
  conciliados INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  is_open BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extratos_empresa ON extratos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_extratos_data ON extratos(data);

-- ===== LANÇAMENTOS DE CONCILIAÇÃO =====
CREATE TABLE IF NOT EXISTS conciliacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'LARIUCCI',
  extrato_id TEXT,
  data DATE,
  descricao TEXT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo TEXT DEFAULT 'credito',
  conciliado BOOLEAN DEFAULT FALSE,
  conciliado_em DATE,
  vinculado_a JSONB DEFAULT '{}',
  historico TEXT,
  categoria_dre TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conciliacoes_empresa ON conciliacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_conciliacoes_extrato ON conciliacoes(extrato_id);
CREATE INDEX IF NOT EXISTS idx_conciliacoes_data ON conciliacoes(data);
CREATE INDEX IF NOT EXISTS idx_conciliacoes_conciliado ON conciliacoes(empresa_id, conciliado);

-- ===== TRIGGERS updated_at =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_extratos_updated_at') THEN
    CREATE TRIGGER trg_extratos_updated_at BEFORE UPDATE ON extratos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_conciliacoes_updated_at') THEN
    CREATE TRIGGER trg_conciliacoes_updated_at BEFORE UPDATE ON conciliacoes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

-- ===== RLS =====
ALTER TABLE extratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliacoes ENABLE ROW LEVEL SECURITY;

-- Anon read by empresa_id (same pattern as other GDP tables)
CREATE POLICY extratos_anon_read ON extratos FOR SELECT TO anon USING (true);
CREATE POLICY extratos_anon_write ON extratos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY conciliacoes_anon_read ON conciliacoes FOR SELECT TO anon USING (true);
CREATE POLICY conciliacoes_anon_write ON conciliacoes FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===== COMMENTS =====
COMMENT ON TABLE extratos IS 'Extratos bancários importados (OFX/manual) — fonte: gdp.extratos.v1';
COMMENT ON TABLE conciliacoes IS 'Lançamentos de conciliação bancária — fonte: gdp.conciliacao.v1';
COMMENT ON COLUMN conciliacoes.vinculado_a IS 'JSON: {tipo: "cp"|"cr", contaId: "..."} — vínculo com contas a pagar/receber';
COMMENT ON COLUMN conciliacoes.categoria_dre IS 'Classificação DRE: Receita de Vendas, Custo Mercadoria, etc.';
