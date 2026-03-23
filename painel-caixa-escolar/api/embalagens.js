const { sample, clone, calcSmartPurchase } = require("./lib/estoque-intel-data");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const produtoId = String(req.query?.produto_id || "").trim();
  const quantidade = Number(req.query?.quantidade_necessaria || 0);
  const items = clone(produtoId ? sample.embalagens.filter((item) => item.produto_id === produtoId) : sample.embalagens);
  res.status(200).json({
    ok: true,
    items,
    sugestao: produtoId && quantidade ? calcSmartPurchase(quantidade, items) : []
  });
};
