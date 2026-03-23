const { sample, clone, computeStock } = require("./lib/estoque-intel-data");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  res.status(200).json({
    ok: true,
    produtos: clone(sample.produtos),
    movimentacoes: clone(sample.movimentacoes),
    items: computeStock(sample.produtos, sample.movimentacoes)
  });
};
