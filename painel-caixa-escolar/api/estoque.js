const { sample, clone, computeStock } = require("./lib/estoque-intel-data");
const { requireAuth } = require("./lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const user = requireAuth(req, res);
  if (!user) return;
  res.status(200).json({
    ok: true,
    produtos: clone(sample.produtos),
    movimentacoes: clone(sample.movimentacoes),
    items: computeStock(sample.produtos, sample.movimentacoes)
  });
};
