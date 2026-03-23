module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  res.status(200).json({
    ok: true,
    summary: {
      fornecedores: 2,
      compras: 1,
      financeiro: "contas_pagar_payload_pronto",
      erp: "pre_compra_payload_pronto"
    },
    endpoints: {
      fornecedores: "/api/fornecedores",
      compras: "/api/compras",
      estoque: "/api/estoque"
    },
    payloadExample: {
      fornecedor_id: "FORN-001",
      produto_id: "PROD-ARROZ",
      embalagem_id: "EMB-ARROZ-350",
      quantidade_pacotes: 5,
      total_comprado: 1750,
      sobra_estimada: 50,
      valor_total: 44.5,
      financeiro: {
        categoria: "fornecedor",
        status: "emitida"
      }
    }
  });
};
