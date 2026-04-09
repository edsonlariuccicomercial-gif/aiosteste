-- ============================================================
-- Story 6.2 — Tabela de Histórico de Preços Unificada
-- DDL: Registros de preços de todas as fontes
-- ============================================================

CREATE TABLE IF NOT EXISTS preco_historico (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  sku TEXT NOT NULL,
  escola TEXT,
  sre TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('proposta', 'ganho', 'perdido', 'contrato', 'nf_saida', 'nf_entrada')),
  valor NUMERIC(12,2) NOT NULL,
  custo_base NUMERIC(12,2),
  margem_pct NUMERIC(5,2),
  fonte TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para queries de análise
CREATE INDEX IF NOT EXISTS idx_preco_hist_empresa ON preco_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_preco_hist_sku ON preco_historico(sku);
CREATE INDEX IF NOT EXISTS idx_preco_hist_tipo ON preco_historico(tipo);
CREATE INDEX IF NOT EXISTS idx_preco_hist_created ON preco_historico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preco_hist_sku_sre ON preco_historico(sku, sre);

-- RLS
ALTER TABLE preco_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY preco_historico_empresa_policy ON preco_historico
  FOR ALL
  USING (empresa_id = current_setting('app.current_empresa_id', true))
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true));
