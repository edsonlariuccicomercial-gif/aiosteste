// GDP Integrations — Vercel serverless function
// Importa nfe-sefaz-client.js completo com xml-crypto para transmissão real à SEFAZ

const path = require("path");
const nfeSefaz = require(path.join(__dirname, "..", "squads", "caixa-escolar", "dashboard", "server-lib", "nfe-sefaz-client.js"));

const {
  getSefazConfig, validateSefazConfig, buildNfePayloadFromPedido,
  buildNfeXml, buildXmlDsigPreview, buildLoteXml, buildAutorizacaoRequestPreview,
  emitirNfeDireta, transmitirAutorizacaoPreview
} = nfeSefaz;

function env(key, fallback) { return (process.env[key] || fallback || "").trim(); }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const body = req.method === "POST" ? (req.body || {}) : {};
  const action = body.action || req.query?.action || "";

  try {
    // Config check
    if (action === "nfe-sefaz-config" || (req.method === "GET" && !action)) {
      const config = getSefazConfig();
      const { missing } = validateSefazConfig(config);
      return res.status(200).json({
        ok: true,
        ambiente: config.ambiente,
        cnpj: config.cnpjEmitente,
        razaoSocial: config.razaoSocial,
        fantasia: config.nomeFantasia,
        ie: config.ie,
        certificado: !!(config.certificadoBase64 || config.certificadoPem),
        chavePrivada: !!(config.certificadoBase64 || config.chavePrivadaPem),
        serie: config.seriePadrao,
        numeroInicial: env("NFE_NUMERO_INICIAL", "1"),
        transmissaoHabilitada: env("NFE_ENABLE_TRANSMIT") === "true",
        missing
      });
    }

    // NF-e preview (gera XML assinado sem transmitir)
    if (action === "nfe-sefaz-preview") {
      const pedido = body.pedido;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const config = getSefazConfig();
      const xmlPreview = buildNfeXml(payload);
      const xmlDsigPreview = buildXmlDsigPreview(xmlPreview.xml, config);
      const lotePreview = buildLoteXml(xmlDsigPreview.signedXml || xmlPreview.xml);
      const autorizacaoPreview = buildAutorizacaoRequestPreview(payload, lotePreview);
      return res.status(200).json({ ok: true, action, payload, xmlPreview, xmlDsigPreview, lotePreview, autorizacaoPreview });
    }

    // Transmissão real à SEFAZ
    if (action === "nfe-sefaz-emitir") {
      const pedido = body.pedido;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const result = await emitirNfeDireta(payload);
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action, result });
    }

    if (action === "nfe-sefaz-transmitir") {
      const pedido = body.pedido;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const result = await transmitirAutorizacaoPreview(payload, { force: body.force === true });
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action, result });
    }

    // NF-e cancelamento
    if (action === "nfe-sefaz-cancelar" && nfeSefaz.transmitirCancelamentoEvento) {
      const { chaveAcesso, protocolo, justificativa } = body;
      if (!chaveAcesso || !protocolo) return res.status(400).json({ ok: false, error: "chaveAcesso e protocolo obrigatorios" });
      const notaObj = { sefaz: { chaveAcesso, protocolo } };
      const motivo = justificativa || "Cancelamento solicitado pelo emitente";
      const result = await nfeSefaz.transmitirCancelamentoEvento(notaObj, motivo, { force: true });
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action, result });
    }

    return res.status(400).json({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    console.error("[gdp-integrations]", err);
    return res.status(500).json({ ok: false, error: err.message, stack: err.stack?.split("\n").slice(0, 3) });
  }
};
