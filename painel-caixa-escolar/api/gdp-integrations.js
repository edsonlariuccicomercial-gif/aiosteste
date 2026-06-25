// GDP Integrations — Vercel serverless function
// Importa nfe-sefaz-client.js completo com xml-crypto para transmissão real à SEFAZ

const path = require("path");
const nfeSefaz = require(path.join(__dirname, "..", "squads", "caixa-escolar", "dashboard", "server-lib", "nfe-sefaz-client.js"));
// BANK-3 (handoff cobranca-inter-fixes): diagnostico do provedor bancario (botao "Testar")
const bankProviderConfig = require(path.join(__dirname, "..", "squads", "caixa-escolar", "dashboard", "server-lib", "bank-provider-config.js"));
// Story 5.3 rev: Auth middleware REMOVED — frontend uses local login (not Supabase Auth),
// so no JWT is available. Re-enable when frontend migrates to Supabase Auth.
// const { requireAuth } = require("./lib/auth");

function corsHeaders(req, res) {
  const origin = (req.headers && req.headers.origin) || '';
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

const {
  getSefazConfig, validateSefazConfig, buildNfePayloadFromPedido,
  buildNfeXml, buildXmlDsigPreview, buildLoteXml, buildAutorizacaoRequestPreview,
  emitirNfeDireta, transmitirAutorizacaoPreview, validateNfePayload
} = nfeSefaz;

function env(key, fallback) { return (process.env[key] || fallback || "").trim(); }

module.exports = async function handler(req, res) {
  corsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const body = req.method === "POST" ? (req.body || {}) : {};
  const action = body.action || req.query?.action || "";

  try {
    // BANK-3: diagnostico do provedor bancario (botao "Testar" da config bancaria).
    // O provider/ambiente REAIS vem da env (coerente com BANK-1: backend manda),
    // ignorando o que o front possa enviar vazio. So expoe o resultado do diagnostico.
    if (action === "bank-api-diagnose") {
      const envProvider = env("GDP_BANK_PROVIDER") || env("GDP_BANK_DEFAULT_PROVIDER") || "inter";
      const envAmbiente = (env("GDP_BANK_AMBIENTE") || env("GDP_BANK_INTER_AMBIENTE") || "producao");
      const diagnostic = bankProviderConfig.buildBankProviderDiagnostic({
        ...(body.config || {}),
        provider: envProvider,
        ambiente: envAmbiente
      });
      return res.status(200).json({ ok: true, action, diagnostic });
    }

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
      // Story 2.1 AC-3: Validação XSD estrutural antes de gerar XML
      const validation = validateNfePayload(payload);
      if (!validation.valid) {
        return res.status(422).json({ ok: false, error: "XML invalido — falha na validacao estrutural", validationErrors: validation.errors });
      }
      const config = getSefazConfig();
      const xmlPreview = buildNfeXml(payload);
      const xmlDsigPreview = buildXmlDsigPreview(xmlPreview.xml, config);
      const lotePreview = buildLoteXml(xmlDsigPreview.signedXml || xmlPreview.xml);
      const autorizacaoPreview = buildAutorizacaoRequestPreview(payload, lotePreview);
      return res.status(200).json({ ok: true, action, payload, xmlPreview, xmlDsigPreview, lotePreview, autorizacaoPreview });
    }

    // Debug: log de itens recebidos
    if (action === "nfe-sefaz-debug") {
      const pedido = body.pedido;
      return res.status(200).json({
        ok: true,
        pedidoId: pedido?.id,
        itensRecebidos: (pedido?.itens || []).length,
        itens: (pedido?.itens || []).map((it, i) => ({ idx: i, desc: it.descricao, qtd: it.qtd, preco: it.precoUnitario })),
        bodyKeys: Object.keys(body),
        pedidoKeys: Object.keys(pedido || {})
      });
    }

    // Transmissão real à SEFAZ
    if (action === "nfe-sefaz-emitir") {
      const pedido = body.pedido;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      // Story 2.1 AC-3: Validação XSD estrutural ANTES de transmitir à SEFAZ
      const validation = validateNfePayload(payload);
      if (!validation.valid) {
        return res.status(422).json({ ok: false, error: "XML invalido — transmissao BLOQUEADA", validationErrors: validation.errors });
      }
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

    // Consulta protocolo NF-e (situação pela chave de acesso)
    if (action === "nfe-sefaz-consulta" && nfeSefaz.consultarProtocolo) {
      const { chaveAcesso } = body;
      if (!chaveAcesso || String(chaveAcesso).replace(/\D/g, "").length !== 44) {
        return res.status(400).json({ ok: false, error: "chaveAcesso deve ter 44 digitos" });
      }
      const result = await nfeSefaz.consultarProtocolo(chaveAcesso);
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action, result });
    }

    // Distribuição DFe — autocura de notas falsa-pendentes (P0).
    // Lista TODAS as NF-e autorizadas do CNPJ emitente a partir de ultNSU (incremental), inclusive as
    // que o sistema nunca capturou (autorizou mas perdeu a resposta). O frontend cruza por numero+valor
    // e completa as notas locais pendentes para autorizada. NAO precisa de chave previa.
    if (action === "nfe-sefaz-distribuicao-dfe" && nfeSefaz.distribuicaoDFe) {
      const ultNSU = body.ultNSU != null ? body.ultNSU : "0";
      const result = await nfeSefaz.distribuicaoDFe(ultNSU);
      // cStat 137 (nada novo) e 138 (documentos localizados) sao respostas OK da SEFAZ.
      const cStat = result?.parsed?.cStat || "";
      const sefazOk = cStat === "137" || cStat === "138";
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, sefazOk, action, result });
    }

    // Inutilização de faixa
    if (action === "nfe-sefaz-inutilizar" && nfeSefaz.inutilizarFaixa) {
      const { ano, serie, nfInicio, nfFim, justificativa } = body;
      if (!ano || !nfInicio || !nfFim) return res.status(400).json({ ok: false, error: "ano, nfInicio e nfFim obrigatorios" });
      const result = await nfeSefaz.inutilizarFaixa(ano, serie || "1", nfInicio, nfFim, justificativa, { force: true });
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action, result });
    }

    return res.status(400).json({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    console.error("[gdp-integrations]", err);
    return res.status(500).json({ ok: false, error: err.message, stack: err.stack?.split("\n").slice(0, 3) });
  }
};
