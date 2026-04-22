-- Migration 014: GDP Simplification — Schema changes
-- Part of GDP-Simplification Wave 2 (FR-004, FR-006, FR-013)

-- 1. Produto: campos para produto_critico (Wave 4 usage, schema added now)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS produto_critico boolean DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade_base text;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS embalagens jsonb DEFAULT '[]'::jsonb;

-- 2. Estoque simplificado — tabela Supabase para fonte de verdade
CREATE TABLE IF NOT EXISTS estoque_simples (
  produto_id uuid PRIMARY KEY REFERENCES produtos(id) ON DELETE CASCADE,
  empresa_id text NOT NULL DEFAULT current_setting('app.empresa_id', true),
  quantidade_atual numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE estoque_simples ENABLE ROW LEVEL SECURITY;

CREATE POLICY estoque_simples_empresa ON estoque_simples
  USING (empresa_id = current_setting('app.empresa_id', true));

CREATE TRIGGER set_updated_at_estoque_simples
  BEFORE UPDATE ON estoque_simples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_estoque_simples_empresa
  ON estoque_simples(empresa_id);
