import client from "./lib/nfe-sefaz-client.js";

const {
  getSefazConfig,
  validateSefazConfig,
  buildNfePayloadFromPedido,
  emitirNfeDireta
} = client;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const config = getSefazConfig();
      const missing = validateSefazConfig(config);
      return res.status(200).json({
        ok: true,
        ambiente: config.ambiente,
        uf: config.uf,
        emitente: {
          cnpj: config.cnpjEmitente ? "***configurado***" : "",
          razaoSocial: config.razaoSocial || "",
          ie: config.ie ? "***configurado***" : ""
        },
        certificado: config.certificadoBase64 ? "configurado" : "nao_configurado",
        missing
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const action = body.action || "preview";

    if (action === "preview") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      return res.status(200).json({ ok: true, action, payload });
    }

    if (action === "emitir") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const result = await emitirNfeDireta(payload);
      return res.status(result.ok ? 200 : 501).json({ ok: result.ok, action, result });
    }

    return res.status(400).json({ ok: false, error: `Acao desconhecida: ${action}` });
  } catch (err) {
    console.error("nfe-sefaz error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
