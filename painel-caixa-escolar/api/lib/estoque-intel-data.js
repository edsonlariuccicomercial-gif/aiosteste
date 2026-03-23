const sample = {
  produtos: [
    { id: "PROD-ARROZ", nome: "Arroz", unidade_base: "g" },
    { id: "PROD-BOLACHA", nome: "Bolacha agua e sal", unidade_base: "g" },
    { id: "PROD-SUCO", nome: "Suco integral", unidade_base: "ml" }
  ],
  embalagens: [
    { id: "EMB-ARROZ-300", produto_id: "PROD-ARROZ", descricao: "Pacote 300g", codigo_barras: "789000000001", quantidade_base: 300 },
    { id: "EMB-ARROZ-350", produto_id: "PROD-ARROZ", descricao: "Pacote 350g", codigo_barras: "789000000002", quantidade_base: 350 },
    { id: "EMB-ARROZ-360", produto_id: "PROD-ARROZ", descricao: "Pacote 360g", codigo_barras: "789000000003", quantidade_base: 360 },
    { id: "EMB-BOLACHA-350", produto_id: "PROD-BOLACHA", descricao: "Pacote 350g", codigo_barras: "789000000004", quantidade_base: 350 },
    { id: "EMB-SUCO-1000", produto_id: "PROD-SUCO", descricao: "Garrafa 1000ml", codigo_barras: "789000000005", quantidade_base: 1000 }
  ],
  pedidos: [
    { id: "PED-001", data: "2026-03-23", status: "emitido" }
  ],
  pedido_itens: [
    { id: "PIT-001", pedido_id: "PED-001", produto_id: "PROD-ARROZ", quantidade_base: 1700 }
  ],
  movimentacoes: [
    { id: "MOV-001", produto_id: "PROD-ARROZ", tipo: "comprometido", operacao: "+", quantidade: 1700, origem: "pedido", data: "2026-03-23T09:00:00.000Z" },
    { id: "MOV-002", produto_id: "PROD-ARROZ", tipo: "fisico", operacao: "+", quantidade: 1800, origem: "bipagem", data: "2026-03-23T10:00:00.000Z" }
  ]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function calcSmartPurchase(quantidadeNecessaria, embalagensDisponiveis = []) {
  const necessidade = toNumber(quantidadeNecessaria);
  if (!necessidade) return [];
  const resultados = embalagensDisponiveis
    .filter((emb) => toNumber(emb.quantidade_base) > 0)
    .map((emb) => {
      const quantidadePacotes = Math.ceil(necessidade / toNumber(emb.quantidade_base));
      const totalComprado = quantidadePacotes * toNumber(emb.quantidade_base);
      const sobra = totalComprado - necessidade;
      return {
        embalagem_id: emb.id,
        descricao: emb.descricao,
        quantidade_base: toNumber(emb.quantidade_base),
        quantidadePacotes,
        totalComprado,
        sobra
      };
    })
    .sort((a, b) => a.sobra - b.sobra || a.totalComprado - b.totalComprado);
  if (resultados[0]) resultados[0].melhorOpcao = true;
  return resultados;
}

function computeStock(produtos = sample.produtos, movimentacoes = sample.movimentacoes) {
  return produtos.map((produto) => {
    const movimentosProduto = movimentacoes.filter((mov) => mov.produto_id === produto.id);
    const fisico = movimentosProduto
      .filter((mov) => mov.tipo === "fisico")
      .reduce((sum, mov) => sum + (mov.operacao === "+" ? toNumber(mov.quantidade) : -toNumber(mov.quantidade)), 0);
    const comprometido = movimentosProduto
      .filter((mov) => mov.tipo === "comprometido")
      .reduce((sum, mov) => sum + (mov.operacao === "+" ? toNumber(mov.quantidade) : -toNumber(mov.quantidade)), 0);
    return {
      produto_id: produto.id,
      nome: produto.nome,
      unidade_base: produto.unidade_base,
      fisico,
      comprometido,
      disponivel: fisico - comprometido
    };
  });
}

function normalizePedidoPayload(body = {}) {
  const produto_id = String(body.produto_id || "").trim();
  const quantidade_base = toNumber(body.quantidade_base);
  const data = String(body.data || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const status = String(body.status || "emitido").trim() || "emitido";
  return {
    pedido: {
      id: body.id || `PED-${Date.now()}`,
      data,
      status
    },
    item: {
      id: body.item_id || `PIT-${Date.now()}`,
      pedido_id: body.id || `PED-${Date.now()}`,
      produto_id,
      quantidade_base
    },
    movimentacao: {
      id: body.mov_id || `MOV-${Date.now()}`,
      produto_id,
      tipo: "comprometido",
      operacao: "+",
      quantidade: quantidade_base,
      origem: "pedido",
      data: new Date().toISOString()
    }
  };
}

function normalizeMovimentacaoPayload(body = {}) {
  const produto_id = String(body.produto_id || "").trim();
  const operacao = String(body.operacao || "").trim();
  const quantidade = toNumber(body.quantidade);
  const origem = String(body.origem || "").trim() || "manual";
  if (body.modo === "entrada") {
    return [{ id: `MOV-${Date.now()}`, produto_id, tipo: "fisico", operacao: "+", quantidade, origem: "bipagem", data: new Date().toISOString() }];
  }
  if (body.modo === "saida") {
    return [
      { id: `MOV-${Date.now()}-1`, produto_id, tipo: "fisico", operacao: "-", quantidade, origem, data: new Date().toISOString() },
      { id: `MOV-${Date.now()}-2`, produto_id, tipo: "comprometido", operacao: "-", quantidade, origem: "pedido", data: new Date().toISOString() }
    ];
  }
  if (body.modo === "entrega_direta") {
    return [{ id: `MOV-${Date.now()}`, produto_id, tipo: "comprometido", operacao: "-", quantidade, origem: "entrega_direta", data: new Date().toISOString() }];
  }
  return [{ id: body.id || `MOV-${Date.now()}`, produto_id, tipo: String(body.tipo || "fisico"), operacao: operacao || "+", quantidade, origem, data: new Date().toISOString() }];
}

module.exports = {
  sample,
  clone,
  calcSmartPurchase,
  computeStock,
  normalizePedidoPayload,
  normalizeMovimentacaoPayload
};
