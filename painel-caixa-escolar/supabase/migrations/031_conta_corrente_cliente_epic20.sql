-- ============================================================
-- 031: Conta-Corrente do Cliente (crédito/débito rotativo) — EPIC-20 / Story 20.9.1
-- ============================================================
-- Contexto: escolas em regime de crédito rotativo (pagam adiantado e vão retirando,
-- ex: Valadares) não tinham controle de saldo no GDP — só `contas_receber` (pago/não
-- pago, valor único). Esta migration cria a FUNDAÇÃO da conta-corrente:
--   - lancamentos_cliente : o extrato (crédito/débito por cliente, por valor R$)
--   - lancamentos_itens   : detalhe dos itens de uma RETIRADA (débito)
--   - clientes.conta_corrente_ativa : marca quais escolas operam nesse regime
--
-- Princípios (PRD EPIC-20.9):
--   D3/P3 — o SALDO é SEMPRE recalculado (Σ créditos − Σ débitos). NÃO é materializado
--           aqui como fonte de verdade. As colunas legadas clientes.saldo_total /
--           saldo_disponivel (migration 016) permanecem intocadas e NÃO são usadas
--           como verdade do saldo da conta-corrente.
--   D5/D6 — débito (retirada) detalha itens (produto, qtd, valor unitário); o catálogo
--           ARP é só a origem dos valores, todos editáveis na app.
--
-- Segue o MESMO padrão validado em 018 (extratos/conciliacoes) e 029/030 (soft-delete):
--   TEXT PK, empresa_id default 'LARIUCCI', trigger update_updated_at, RLS anon,
--   realtime, soft-delete com índice parcial.
--
-- Idempotente (IF NOT EXISTS). Aditiva (nenhum dado existente alterado). Zero-downtime.
-- Reversível: ver bloco de rollback comentado no fim.

-- ===== FLAG na tabela clientes =====
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS conta_corrente_ativa BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN clientes.conta_corrente_ativa IS 'TRUE = escola opera em regime de conta-corrente (crédito/débito rotativo). Marca quais clientes aparecem na tela de Extrato. NÃO confundir com saldo_total/saldo_disponivel (legado migration 016, não usados como verdade — saldo é recalculado dos lancamentos).';

-- ===== LANCAMENTOS DO CLIENTE (o extrato) =====
CREATE TABLE IF NOT EXISTS lancamentos_cliente (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'LARIUCCI',
  cliente_id TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL DEFAULT 'credito',
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  descricao TEXT,
  origem JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_lancamentos_cliente_tipo CHECK (tipo IN ('credito', 'debito')),
  CONSTRAINT chk_lancamentos_cliente_valor CHECK (valor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente_empresa ON lancamentos_cliente(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente_cliente ON lancamentos_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente_data ON lancamentos_cliente(data);
-- Índice parcial: acelera o cálculo do saldo (soma dos lançamentos ativos por cliente)
CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente_ativos
  ON lancamentos_cliente (cliente_id)
  WHERE deleted_at IS NULL;

-- ===== ITENS DO LANCAMENTO (detalhe de uma RETIRADA/débito) =====
CREATE TABLE IF NOT EXISTS lancamentos_itens (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'LARIUCCI',
  lancamento_id TEXT NOT NULL REFERENCES lancamentos_cliente(id) ON DELETE CASCADE,
  produto TEXT NOT NULL,
  quantidade NUMERIC(12,3) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_lancamentos_itens_quantidade CHECK (quantidade >= 0),
  CONSTRAINT chk_lancamentos_itens_valor_unitario CHECK (valor_unitario >= 0),
  CONSTRAINT chk_lancamentos_itens_subtotal CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_itens_empresa ON lancamentos_itens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_itens_lancamento ON lancamentos_itens(lancamento_id);

-- ===== TRIGGERS updated_at =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lancamentos_cliente_updated_at') THEN
    CREATE TRIGGER trg_lancamentos_cliente_updated_at BEFORE UPDATE ON lancamentos_cliente FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lancamentos_itens_updated_at') THEN
    CREATE TRIGGER trg_lancamentos_itens_updated_at BEFORE UPDATE ON lancamentos_itens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

-- ===== RLS (mesmo padrão das tabelas GDP) =====
ALTER TABLE lancamentos_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY lancamentos_cliente_anon_read ON lancamentos_cliente FOR SELECT TO anon USING (true);
CREATE POLICY lancamentos_cliente_anon_write ON lancamentos_cliente FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY lancamentos_itens_anon_read ON lancamentos_itens FOR SELECT TO anon USING (true);
CREATE POLICY lancamentos_itens_anon_write ON lancamentos_itens FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===== Realtime (sincronização entre máquinas, padrão EPIC-19) =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lancamentos_cliente'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos_cliente;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lancamentos_itens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos_itens;
  END IF;
END;
$$;

-- ===== COMMENTS =====
COMMENT ON TABLE lancamentos_cliente IS 'Extrato de conta-corrente do cliente (EPIC-20 Story 20.9.1). Cada linha é um movimento: credito (escola pagou/depositou ou recebeu saldo de uma NF) ou debito (retirada de mercadoria). Saldo do cliente = SUM(valor WHERE tipo=credito) − SUM(valor WHERE tipo=debito), filtrando deleted_at IS NULL. Saldo positivo = crédito a favor da escola; negativo = escola devedora.';
COMMENT ON COLUMN lancamentos_cliente.tipo IS 'credito | debito (CHECK constraint).';
COMMENT ON COLUMN lancamentos_cliente.valor IS 'Valor SEMPRE positivo (R$). O sinal no saldo é dado pelo tipo (credito soma, debito subtrai).';
COMMENT ON COLUMN lancamentos_cliente.origem IS 'JSON opcional de rastreio: {pedido_id, contrato_id, nf_id, pagamento_id}. Usado pela Story 20.9.2 (botão no pedido) para vincular o crédito à origem.';
COMMENT ON COLUMN lancamentos_cliente.deleted_at IS 'Soft-delete sincronizado (padrão EPIC-19). NULL = ativo.';
COMMENT ON TABLE lancamentos_itens IS 'Itens detalhados de uma RETIRADA (lancamento tipo=debito). Produto/qtd/valor unitário vêm do catálogo ARP mas são editáveis. Regra de negócio (validada na app): SUM(subtotal) dos itens = valor do lancamento debito pai.';
COMMENT ON COLUMN lancamentos_itens.subtotal IS 'quantidade × valor_unitario. Persistido para o demonstrativo (Story 20.9.4) não recalcular.';
COMMENT ON COLUMN lancamentos_itens.lancamento_id IS 'FK para lancamentos_cliente. ON DELETE CASCADE: ao apagar fisicamente o lançamento pai, os itens vão junto (o fluxo normal usa soft-delete no pai, este CASCADE é segurança para hard-delete).';

-- ============================================================
-- ===== ROLLBACK (executar manualmente se necessário) =====
-- DROP TABLE IF EXISTS lancamentos_itens;
-- DROP TABLE IF EXISTS lancamentos_cliente;
-- ALTER TABLE clientes DROP COLUMN IF EXISTS conta_corrente_ativa;
-- (Realtime: a remoção da publicação é automática ao dropar as tabelas.)
-- ============================================================
