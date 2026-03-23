const { sample, clone } = require("./lib/estoque-intel-data");

const fornecedores = [
  { id: "FORN-001", nome: "Fornecedor Alfa", documento: "12345678000190", contato: "compras@alfa.com", status: "ativo", embalagens: [{ embalagem_id: "EMB-ARROZ-350", preco_unitario: 8.9 }, { embalagem_id: "EMB-ARROZ-360", preco_unitario: 9.1 }] },
  { id: "FORN-002", nome: "Distribuidora Beta", documento: "98765432000155", contato: "vendas@beta.com", status: "ativo", embalagens: [{ embalagem_id: "EMB-ARROZ-300", preco_unitario: 7.8 }, { embalagem_id: "EMB-SUCO-1000", preco_unitario: 6.2 }] }
];

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const items = clone(fornecedores).map((fornecedor) => ({
    ...fornecedor,
    embalagensDetalhadas: (fornecedor.embalagens || []).map((oferta) => ({
      ...oferta,
      embalagem: sample.embalagens.find((emb) => emb.id === oferta.embalagem_id) || null
    }))
  }));
  res.status(200).json({ ok: true, items });
};
