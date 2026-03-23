CREATE TABLE produtos (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  unidade_base VARCHAR(10) NOT NULL CHECK (unidade_base IN ('g', 'ml'))
);

CREATE TABLE produto_embalagens (
  id VARCHAR(64) PRIMARY KEY,
  produto_id VARCHAR(64) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  codigo_barras VARCHAR(64),
  quantidade_base DECIMAL(14,3) NOT NULL,
  CONSTRAINT fk_produto_embalagens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE TABLE pedidos (
  id VARCHAR(64) PRIMARY KEY,
  data DATE NOT NULL,
  status VARCHAR(40) NOT NULL
);

CREATE TABLE pedido_itens (
  id VARCHAR(64) PRIMARY KEY,
  pedido_id VARCHAR(64) NOT NULL,
  produto_id VARCHAR(64) NOT NULL,
  quantidade_base DECIMAL(14,3) NOT NULL,
  CONSTRAINT fk_pedido_itens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  CONSTRAINT fk_pedido_itens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE TABLE movimentacoes (
  id VARCHAR(64) PRIMARY KEY,
  produto_id VARCHAR(64) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('fisico', 'comprometido')),
  operacao VARCHAR(2) NOT NULL CHECK (operacao IN ('+', '-')),
  quantidade DECIMAL(14,3) NOT NULL,
  origem VARCHAR(40) NOT NULL,
  data TIMESTAMP NOT NULL,
  CONSTRAINT fk_movimentacoes_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

INSERT INTO produtos (id, nome, unidade_base) VALUES
('PROD-ARROZ', 'Arroz', 'g'),
('PROD-BOLACHA', 'Bolacha agua e sal', 'g'),
('PROD-SUCO', 'Suco integral', 'ml');

INSERT INTO produto_embalagens (id, produto_id, descricao, codigo_barras, quantidade_base) VALUES
('EMB-ARROZ-300', 'PROD-ARROZ', 'Pacote 300g', '789000000001', 300),
('EMB-ARROZ-350', 'PROD-ARROZ', 'Pacote 350g', '789000000002', 350),
('EMB-ARROZ-360', 'PROD-ARROZ', 'Pacote 360g', '789000000003', 360),
('EMB-BOLACHA-350', 'PROD-BOLACHA', 'Pacote 350g', '789000000004', 350),
('EMB-SUCO-1000', 'PROD-SUCO', 'Garrafa 1000ml', '789000000005', 1000);

INSERT INTO pedidos (id, data, status) VALUES
('PED-001', DATE '2026-03-23', 'emitido');

INSERT INTO pedido_itens (id, pedido_id, produto_id, quantidade_base) VALUES
('PIT-001', 'PED-001', 'PROD-ARROZ', 1700);

INSERT INTO movimentacoes (id, produto_id, tipo, operacao, quantidade, origem, data) VALUES
('MOV-001', 'PROD-ARROZ', 'comprometido', '+', 1700, 'pedido', TIMESTAMP '2026-03-23 09:00:00'),
('MOV-002', 'PROD-ARROZ', 'fisico', '+', 1800, 'bipagem', TIMESTAMP '2026-03-23 10:00:00');
