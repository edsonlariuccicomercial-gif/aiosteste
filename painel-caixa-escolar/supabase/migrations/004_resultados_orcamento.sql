-- ============================================================
-- Story 6.1 — Persistir Resultados SGD em Supabase
-- DDL: Tabela de resultados de orçamentos (ganho/perdido)
-- ============================================================

CREATE TABLE IF NOT EXISTS resultados_orcamento (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  orcamento_id TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('ganho', 'perdido', 'enviado')),
  data_resultado DATE,
  valor_proposta NUMERIC(12,2),
  valor_vencedor NUMERIC(12,2),
  fornecedor_vencedor TEXT,
  motivo_perda TEXT,
  delta_total_percent NUMERIC(5,1),
  escola TEXT,
  municipio TEXT,
  sre TEXT,
  grupo TEXT,
  objeto TEXT,
  sku TEXT,
  itens JSONB DEFAULT '[]',
  contrato JSONB DEFAULT '{}',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_resultados_empresa ON resultados_orcamento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_resultados_resultado ON resultados_orcamento(resultado);
CREATE INDEX IF NOT EXISTS idx_resultados_orcamento_id ON resultados_orcamento(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_resultados_escola ON resultados_orcamento(escola);
CREATE INDEX IF NOT EXISTS idx_resultados_created ON resultados_orcamento(created_at DESC);

-- Unique constraint: um resultado por orçamento por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_resultados_unique
  ON resultados_orcamento(empresa_id, orcamento_id);

-- Reutilizar trigger de updated_at (criado em 001_gdp_tables.sql)
CREATE TRIGGER trg_resultados_updated_at
  BEFORE UPDATE ON resultados_orcamento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE resultados_orcamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY resultados_empresa_policy ON resultados_orcamento
  FOR ALL
  USING (empresa_id = current_setting('app.current_empresa_id', true))
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true));
