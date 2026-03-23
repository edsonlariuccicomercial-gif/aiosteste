const { normalizeMovimentacaoPayload } = require("./lib/estoque-intel-data");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const produtoId = String(body.produto_id || "").trim();
  const quantidade = Number(body.quantidade || 0);
  if (!produtoId || !quantidade) {
    res.status(400).json({ ok: false, error: "produto_id e quantidade sao obrigatorios" });
    return;
  }
  res.status(200).json({
    ok: true,
    items: normalizeMovimentacaoPayload(body)
  });
};
