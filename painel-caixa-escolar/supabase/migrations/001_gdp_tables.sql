-- ============================================================
-- Story 5.1 — Migração Supabase-First
-- DDL: Tabelas GDP com fonte única de dados
-- ============================================================

-- Empresa (multi-tenant ready)
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome TEXT NOT NULL,
  nome_fantasia TEXT,
  razao_social TEXT,
  cnpj TEXT UNIQUE NOT NULL,
  ie TEXT,
  crt TEXT DEFAULT '1',
  endereco JSONB DEFAULT '{}',
  config_fiscal JSONB DEFAULT '{}',
  config_bancaria JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Clientes (escolas / caixas escolares)
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  cnpj TEXT,
  ie TEXT,
  uf TEXT DEFAULT 'MG',
  cep TEXT,
  sre TEXT,
  email TEXT,
  telefone TEXT,
  endereco JSONB DEFAULT '{}',
  contratos_vinculados TEXT[] DEFAULT '{}',
  dados_extras JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj);

-- Contratos
CREATE TABLE IF NOT EXISTS contratos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  escola TEXT NOT NULL,
  processo TEXT,
  edital TEXT,
  objeto TEXT,
  status TEXT DEFAULT 'ativo',
  fornecedor TEXT,
  vigencia JSONB DEFAULT '{}',
  observacoes TEXT,
  data_apuracao TEXT,
  itens JSONB DEFAULT '[]',
  cliente_snapshot JSONB DEFAULT '{}',
  dados_extras JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status);
CREATE INDEX IF NOT EXISTS idx_contratos_escola ON contratos(escola);

-- Pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  contrato_id TEXT REFERENCES contratos(id),
  escola TEXT NOT NULL,
  data DATE,
  status TEXT DEFAULT 'em_aberto',
  valor NUMERIC(12,2),
  obs TEXT,
  itens JSONB DEFAULT '[]',
  fiscal JSONB DEFAULT '{}',
  cliente JSONB DEFAULT '{}',
  pagamento JSONB DEFAULT '{}',
  marcador TEXT,
  audit JSONB DEFAULT '{}',
  dados_extras JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa ON pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_contrato ON pedidos(contrato_id);

-- Notas Fiscais
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  pedido_id TEXT REFERENCES pedidos(id),
  contrato_id TEXT REFERENCES contratos(id),
  numero TEXT NOT NULL,
  serie TEXT DEFAULT '1',
  valor NUMERIC(12,2),
  status TEXT DEFAULT 'pendente',
  tipo_nota TEXT DEFAULT 'nfe_real',
  origem TEXT DEFAULT 'pedido',
  emitida_em TIMESTAMPTZ,
  vencimento DATE,
  cliente JSONB DEFAULT '{}',
  itens JSONB DEFAULT '[]',
  sefaz JSONB DEFAULT '{}',
  cobranca JSONB DEFAULT '{}',
  documentos JSONB DEFAULT '{}',
  parametros JSONB DEFAULT '{}',
  integracoes JSONB DEFAULT '{}',
  xml_autorizado TEXT,
  chave_acesso TEXT,
  protocolo TEXT,
  audit JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfs_empresa ON notas_fiscais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_nfs_numero ON notas_fiscais(numero);
CREATE INDEX IF NOT EXISTS idx_nfs_status ON notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_nfs_chave ON notas_fiscais(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_nfs_pedido ON notas_fiscais(pedido_id);

-- Contas a Receber
CREATE TABLE IF NOT EXISTS contas_receber (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  pedido_id TEXT REFERENCES pedidos(id),
  origem_id TEXT,
  descricao TEXT,
  valor NUMERIC(12,2),
  status TEXT DEFAULT 'pendente',
  forma TEXT,
  categoria TEXT,
  vencimento DATE,
  cliente JSONB DEFAULT '{}',
  cobranca JSONB DEFAULT '{}',
  automacao JSONB DEFAULT '{}',
  audit JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_empresa ON contas_receber(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cr_status ON contas_receber(status);

-- Contas a Pagar
CREATE TABLE IF NOT EXISTS contas_pagar (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  descricao TEXT,
  valor NUMERIC(12,2),
  status TEXT DEFAULT 'pendente',
  forma TEXT,
  categoria TEXT,
  vencimento DATE,
  fornecedor JSONB DEFAULT '{}',
  audit JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_empresa ON contas_pagar(empresa_id);

-- Entregas
CREATE TABLE IF NOT EXISTS entregas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  pedido_id TEXT REFERENCES pedidos(id),
  escola TEXT,
  data_entrega DATE,
  status_entrega TEXT DEFAULT 'pendente',
  recebedor TEXT,
  obs TEXT,
  foto TEXT,
  assinatura TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entregas_empresa ON entregas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_entregas_pedido ON entregas(pedido_id);

-- Contador NF (sequência por empresa)
CREATE TABLE IF NOT EXISTS nf_counter (
  empresa_id TEXT PRIMARY KEY REFERENCES empresas(id),
  counter INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['empresas','clientes','contratos','pedidos','notas_fiscais','contas_receber','contas_pagar','entregas','nf_counter'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END;
$$;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE empresas IS 'Multi-tenant: cada empresa fornecedora';
COMMENT ON TABLE clientes IS 'Escolas / caixas escolares vinculadas';
COMMENT ON TABLE contratos IS 'Contratos ganhos em licitação';
COMMENT ON TABLE pedidos IS 'Pedidos de entrega gerados dos contratos';
COMMENT ON TABLE notas_fiscais IS 'NF-e emitidas via SEFAZ — chave_acesso e xml salvos aqui';
COMMENT ON TABLE contas_receber IS 'Cobranças geradas a partir das NFs';
COMMENT ON TABLE contas_pagar IS 'Despesas e pagamentos a fornecedores';
COMMENT ON TABLE entregas IS 'Provas de entrega com foto e assinatura';
COMMENT ON COLUMN notas_fiscais.xml_autorizado IS 'XML completo retornado pela SEFAZ após autorização';
COMMENT ON COLUMN notas_fiscais.chave_acesso IS '44 dígitos — identificador único na SEFAZ';
