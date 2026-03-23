CREATE TABLE fornecedores (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  documento VARCHAR(32),
  contato VARCHAR(255),
  status VARCHAR(32) NOT NULL
);

CREATE TABLE fornecedor_embalagens (
  id VARCHAR(64) PRIMARY KEY,
  fornecedor_id VARCHAR(64) NOT NULL,
  embalagem_id VARCHAR(64) NOT NULL,
  preco_unitario DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_fornecedor_embalagens_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
  CONSTRAINT fk_fornecedor_embalagens_embalagem FOREIGN KEY (embalagem_id) REFERENCES produto_embalagens(id)
);

CREATE TABLE compras_estoque_intel (
  id VARCHAR(64) PRIMARY KEY,
  fornecedor_id VARCHAR(64) NOT NULL,
  produto_id VARCHAR(64) NOT NULL,
  embalagem_id VARCHAR(64) NOT NULL,
  data TIMESTAMP NOT NULL,
  status VARCHAR(40) NOT NULL,
  quantidade_pacotes DECIMAL(14,3) NOT NULL,
  total_comprado DECIMAL(14,3) NOT NULL,
  sobra_estimada DECIMAL(14,3) NOT NULL,
  preco_unitario DECIMAL(14,2) NOT NULL,
  valor_total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_compras_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
  CONSTRAINT fk_compras_produto FOREIGN KEY (produto_id) REFERENCES produtos(id),
  CONSTRAINT fk_compras_embalagem FOREIGN KEY (embalagem_id) REFERENCES produto_embalagens(id)
);

INSERT INTO fornecedores (id, nome, documento, contato, status) VALUES
('FORN-001', 'Fornecedor Alfa', '12345678000190', 'compras@alfa.com', 'ativo'),
('FORN-002', 'Distribuidora Beta', '98765432000155', 'vendas@beta.com', 'ativo');

INSERT INTO fornecedor_embalagens (id, fornecedor_id, embalagem_id, preco_unitario) VALUES
('FOF-001', 'FORN-001', 'EMB-ARROZ-350', 8.90),
('FOF-002', 'FORN-001', 'EMB-ARROZ-360', 9.10),
('FOF-003', 'FORN-002', 'EMB-ARROZ-300', 7.80),
('FOF-004', 'FORN-002', 'EMB-SUCO-1000', 6.20);

INSERT INTO compras_estoque_intel (id, fornecedor_id, produto_id, embalagem_id, data, status, quantidade_pacotes, total_comprado, sobra_estimada, preco_unitario, valor_total) VALUES
('COMP-001', 'FORN-001', 'PROD-ARROZ', 'EMB-ARROZ-350', TIMESTAMP '2026-03-23 12:00:00', 'pre_compra', 5, 1750, 50, 8.90, 44.50);
