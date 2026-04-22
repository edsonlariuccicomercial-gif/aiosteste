-- Migration 014: GDP Simplification — Schema changes
-- Applied: 2026-04-22
-- Part of GDP-Simplification (FR-004, FR-006, FR-013)

-- 1. Criar tabela produtos (não existia no Supabase — vivia em localStorage)
CREATE TABLE IF NOT EXISTS produtos (
  id text PRIMARY KEY,
  empresa_id text NOT NULL DEFAULT 'LARIUCCI',
  descricao text NOT NULL DEFAULT '',
  sku text DEFAULT '',
  ncm text DEFAULT '',
  unidade text DEFAULT 'UN',
  marca text DEFAULT '',
  grupo text DEFAULT '',
  produto_critico boolean DEFAULT false,
  unidade_base text,
  embalagens jsonb DEFAULT '[]'::jsonb,
  custo_base numeric DEFAULT 0,
  preco_referencia numeric DEFAULT 0,
  margem_alvo numeric DEFAULT 0,
  fonte text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY produtos_empresa ON produtos
  USING (empresa_id = current_setting('app.empresa_id', true));

CREATE TRIGGER set_updated_at_produtos
  BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Estoque simplificado
CREATE TABLE IF NOT EXISTS estoque_simples (
  produto_id text PRIMARY KEY REFERENCES produtos(id) ON DELETE CASCADE,
  empresa_id text NOT NULL DEFAULT 'LARIUCCI',
  quantidade_atual numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE estoque_simples ENABLE ROW LEVEL SECURITY;

CREATE POLICY estoque_simples_empresa ON estoque_simples
  USING (empresa_id = current_setting('app.empresa_id', true));

CREATE TRIGGER set_updated_at_estoque_simples
  BEFORE UPDATE ON estoque_simples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);
CREATE INDEX IF NOT EXISTS idx_estoque_simples_empresa ON estoque_simples(empresa_id);
