const { sample, clone, normalizePedidoPayload } = require("./lib/estoque-intel-data");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const payload = normalizePedidoPayload(typeof req.body === "object" && req.body ? req.body : {});
  if (!payload.item.produto_id || !payload.item.quantidade_base) {
    res.status(400).json({ ok: false, error: "produto_id e quantidade_base sao obrigatorios" });
    return;
  }
  const produto = sample.produtos.find((item) => item.id === payload.item.produto_id);
  if (!produto) {
    res.status(404).json({ ok: false, error: "Produto nao encontrado" });
    return;
  }
  res.status(200).json({
    ok: true,
    pedido: payload.pedido,
    item: payload.item,
    movimentacaoGerada: payload.movimentacao,
    produto: clone(produto)
  });
};
