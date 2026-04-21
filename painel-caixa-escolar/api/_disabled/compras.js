const { sample, calcSmartPurchase, clone } = require("./lib/estoque-intel-data");

const fornecedores = [
  { id: "FORN-001", nome: "Fornecedor Alfa", documento: "12345678000190", contato: "compras@alfa.com", status: "ativo", embalagens: [{ embalagem_id: "EMB-ARROZ-350", preco_unitario: 8.9 }, { embalagem_id: "EMB-ARROZ-360", preco_unitario: 9.1 }] },
  { id: "FORN-002", nome: "Distribuidora Beta", documento: "98765432000155", contato: "vendas@beta.com", status: "ativo", embalagens: [{ embalagem_id: "EMB-ARROZ-300", preco_unitario: 7.8 }, { embalagem_id: "EMB-SUCO-1000", preco_unitario: 6.2 }] }
];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const produtoId = String(body.produto_id || "").trim();
  const quantidadeNecessaria = Number(body.quantidade_necessaria || 0);
  const fornecedorId = String(body.fornecedor_id || "").trim();
  if (!produtoId || !quantidadeNecessaria) {
    res.status(400).json({ ok: false, error: "produto_id e quantidade_necessaria sao obrigatorios" });
    return;
  }
  const produto = sample.produtos.find((item) => item.id === produtoId);
  if (!produto) {
    res.status(404).json({ ok: false, error: "Produto nao encontrado" });
    return;
  }
  const embalagens = sample.embalagens.filter((item) => item.produto_id === produtoId);
  const opcoes = calcSmartPurchase(quantidadeNecessaria, embalagens);
  const melhor = opcoes.find((item) => item.melhorOpcao) || opcoes[0] || null;
  const fornecedor = fornecedores.find((item) => item.id === fornecedorId) || fornecedores[0] || null;
  const oferta = fornecedor && melhor ? (fornecedor.embalagens || []).find((item) => item.embalagem_id === melhor.embalagem_id || item.embalagem_id === melhor.embalagemId) : null;
  const compra = melhor ? {
    id: `COMP-${Date.now()}`,
    status: "pre_compra",
    produto_id: produtoId,
    fornecedor_id: fornecedor?.id || "",
    embalagem_id: melhor.embalagem_id || melhor.embalagemId,
    quantidade_pacotes: melhor.quantidadePacotes,
    total_comprado: melhor.totalComprado,
    sobra_estimada: melhor.sobra,
    preco_unitario: Number(oferta?.preco_unitario || 0),
    valor_total: Number(oferta?.preco_unitario || 0) * Number(melhor.quantidadePacotes || 0)
  } : null;
  res.status(200).json({ ok: true, produto: clone(produto), opcoes, compra });
};
