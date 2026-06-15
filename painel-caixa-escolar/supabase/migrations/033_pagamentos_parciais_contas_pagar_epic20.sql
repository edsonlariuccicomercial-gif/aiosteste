-- Pagamentos parciais em contas_pagar — EPIC-20 (Item 4, modelo MarketUp)
--
-- Contexto: hoje `contas_pagar` é binária — status 'pendente' | 'paga', sem registro
-- de valor pago, histórico de pagamentos ou saldo restante. O usuário quer o fluxo do
-- MarketUp (ver Desktop/markeup.jpg): clicar na conta, escolher conta corrente, valor a
-- pagar, juros, descontos, meio de pagamento, "INCLUIR PAGAMENTO"; abaixo um
-- "HISTÓRICO DE PAGAMENTOS REALIZADOS" (data, pago, desconto, juros, forma, conta) e o
-- "SALDO A PAGAR" (valor total − soma dos pagamentos).
--
-- Decisão de modelagem (espelha o padrão do projeto — `fornecedor`/`audit` já são JSONB):
--   • pagamentos JSONB '[]'  → 1 item = 1 linha do histórico:
--       { data, valorPago, juros, descontos, forma, contaCorrenteId }
--   • valor_pago NUMERIC      → soma materializada dos valorPago (facilita filtro/relatório)
--   • SALDO A PAGAR e a transição de status ('pendente'→'parcial'→'paga') são calculados
--     no app (@dev), preservando flexibilidade de juros/descontos por pagamento.
--
-- Idempotente (IF NOT EXISTS). Aditiva (nenhum dado existente alterado). Zero-downtime.
-- Contas legadas 'paga' permanecem válidas — valor_pago é reconciliado pelo app na 1ª escrita.
-- Reversível: ver bloco de rollback comentado no fim.

-- ===== Colunas de pagamentos parciais =====
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS pagamentos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN contas_pagar.pagamentos IS
  'Histórico de pagamentos parciais (modelo MarketUp). Array de objetos: '
  '{ data (YYYY-MM-DD), valorPago (numeric), juros (numeric), descontos (numeric), '
  'forma (DINHEIRO|PIX|TED|BOLETO...), contaCorrenteId (text) }. Cada item = 1 linha do '
  '"HISTÓRICO DE PAGAMENTOS REALIZADOS". Saldo a pagar = valor - valor_pago (calculado no app).';

COMMENT ON COLUMN contas_pagar.valor_pago IS
  'Soma materializada dos valorPago em pagamentos[]. Mantida pelo app a cada inclusão/remoção '
  'de pagamento. Saldo a pagar = valor - valor_pago. status: pendente (valor_pago=0), '
  'parcial (0<valor_pago<valor), paga (valor_pago>=valor).';

-- ===== Integridade =====
-- Garante que valor_pago nunca seja negativo (juros podem elevar o desembolso real, mas a
-- soma de valorPago abatida do principal não deve ficar negativa).
ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS chk_contas_pagar_valor_pago_nonneg;
ALTER TABLE contas_pagar ADD CONSTRAINT chk_contas_pagar_valor_pago_nonneg
  CHECK (valor_pago >= 0);

-- ===== Realtime =====
-- contas_pagar já está na publicação supabase_realtime (migration 030). Inclusão de
-- pagamento = UPDATE (pagamentos[] + valor_pago), propagado com record completo. Garantia
-- idempotente caso o estado da publicação tenha divergido:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contas_pagar'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contas_pagar;
  END IF;
END;
$$;

-- ===== ROLLBACK (executar manualmente se necessário) =====
-- ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS chk_contas_pagar_valor_pago_nonneg;
-- ALTER TABLE contas_pagar DROP COLUMN IF EXISTS valor_pago;
-- ALTER TABLE contas_pagar DROP COLUMN IF EXISTS pagamentos;
