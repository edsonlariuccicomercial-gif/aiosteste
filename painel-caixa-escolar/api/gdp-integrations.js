// Proxy simples — delega pro endpoint real em squads/caixa-escolar/dashboard/api/
// Necessário porque o projeto Vercel serve da raiz painel-caixa-escolar/
// e as functions em subpastas não são detectadas automaticamente.

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // Importar dinâmicamente o módulo real
    const nfeClient = await import("../squads/caixa-escolar/dashboard/server-lib/nfe-sefaz-client.js");

    const body = req.method === "POST" ? (req.body || {}) : {};
    const action = body.action || req.query?.action || "";

    // Config check
    if (action === "nfe-sefaz-config" || req.method === "GET") {
      const cfg = nfeClient.getSefazConfig ? nfeClient.getSefazConfig() : {};
      return res.status(200).json({
        ok: true,
        ambiente: cfg.ambiente || process.env.NFE_SEFAZ_AMBIENTE || "homologacao",
        cnpj: cfg.cnpjEmitente || process.env.NFE_EMITENTE_CNPJ || "",
        ie: cfg.ie || process.env.NFE_EMITENTE_IE || "",
        certificado: !!(cfg.certificadoPem || process.env.NFE_CERT_PEM),
        chavePrivada: !!(cfg.chavePrivadaPem || process.env.NFE_KEY_PEM),
        serie: cfg.seriePadrao || process.env.NFE_SERIE_PADRAO || "1",
        numeroInicial: process.env.NFE_NUMERO_INICIAL || "1",
      });
    }

    // NF-e preview
    if (action === "nfe-sefaz-preview") {
      const pedido = body.pedido;
      const overrides = body.overrides || {};
      if (!pedido) return res.status(400).json({ ok: false, error: "pedido required" });

      const buildPayload = nfeClient.buildNfePayloadFromPedido || nfeClient.default?.buildNfePayloadFromPedido;
      const buildXml = nfeClient.buildNfeXml || nfeClient.default?.buildNfeXml;

      if (!buildPayload || !buildXml) {
        return res.status(200).json({ ok: true, payload: { numero: overrides.numero || "0", serie: "1" }, message: "Preview mode — SEFAZ client functions not available" });
      }

      const payload = buildPayload(pedido, overrides);
      const xml = buildXml(payload);

      return res.status(200).json({
        ok: true,
        payload,
        xmlPreview: xml,
        preview: { numero: payload.identificacao?.numero, serie: payload.identificacao?.serie },
      });
    }

    return res.status(400).json({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    console.error("[gdp-integrations]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
