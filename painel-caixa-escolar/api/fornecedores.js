const { requireAuth } = require("./lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }
  const user = requireAuth(req, res);
  if (!user) return;
  // Fornecedores são gerenciados via localStorage/Supabase — API retorna lista vazia
  // (dados de teste removidos para evitar re-seed de FORN-001/FORN-002)
  res.status(200).json({ ok: true, items: [] });
};
