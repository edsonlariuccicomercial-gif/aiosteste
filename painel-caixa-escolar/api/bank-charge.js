// Bank Charge — Vercel serverless function (CommonJS).
//
// Emissão/consulta de boletos por provider bancário. Endpoint dedicado e auto-contido:
// a função de NF-e (api/gdp-integrations.js) é CommonJS e NÃO consegue require() dos
// clients ESM em server-lib/. Aqui implementamos o provider Inter diretamente em CommonJS,
// usando https.request com mTLS (fetch/undici ignora cert via `agent`).
//
// Providers: inter (real), c6 (stub até homologação), asaas (delegado ao fluxo ESM existente).
// Docs Inter: https://developers.inter.co/references/cobranca-bolepix

const https = require("https");

// ---- Allowlist de providers (espelha server-lib/bank-provider-config.js) ----
const PROVIDERS = {
  inter: {
    label: "Banco Inter",
    baseUrls: {
      sandbox: "https://cdpj-sandbox.partners.bancointer.com.br",
      producao: "https://cdpj.partners.bancointer.com.br"
    },
    env: {
      clientId: ["GDP_BANK_INTER_CLIENT_ID", "INTER_CLIENT_ID"],
      clientSecret: ["GDP_BANK_INTER_CLIENT_SECRET", "INTER_CLIENT_SECRET"],
      certPem: ["GDP_BANK_INTER_CERT_PEM", "INTER_CERT_PEM"],
      keyPem: ["GDP_BANK_INTER_KEY_PEM", "INTER_KEY_PEM"],
      contaCorrente: ["GDP_BANK_INTER_CONTA_CORRENTE", "INTER_CONTA_CORRENTE"]
    }
  },
  c6: { label: "C6 Bank", baseUrls: {}, env: {} }
};

function corsHeaders(req, res) {
  const origin = (req.headers && req.headers.origin) || "";
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function pickEnv(keys) {
  for (const k of keys || []) {
    const v = (process.env[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function normalizePem(value) {
  return String(value || "").includes("\\n") ? String(value).replace(/\\n/g, "\n") : String(value || "");
}

function trimStr(v) { return String(v || "").trim(); }
function cleanDigits(v) { return String(v || "").replace(/\D+/g, ""); }
function normalizeAmbiente(v) { return String(v || "sandbox").trim().toLowerCase() === "producao" ? "producao" : "sandbox"; }

function resolveInterRuntime(ambiente) {
  const spec = PROVIDERS.inter;
  return {
    baseUrl: pickEnv(["GDP_BANK_INTER_BASE_URL"]) || spec.baseUrls[ambiente],
    clientId: pickEnv(spec.env.clientId),
    clientSecret: pickEnv(spec.env.clientSecret),
    certPem: normalizePem(pickEnv(spec.env.certPem)),
    keyPem: normalizePem(pickEnv(spec.env.keyPem)),
    contaCorrente: pickEnv(spec.env.contaCorrente)
  };
}

function buildAgent(rt) {
  if (!rt.certPem || !rt.keyPem) {
    throw new Error("Certificado mTLS do Inter ausente (GDP_BANK_INTER_CERT_PEM / GDP_BANK_INTER_KEY_PEM).");
  }
  return new https.Agent({ cert: rt.certPem, key: rt.keyPem, keepAlive: true });
}

function httpsJson(urlString, { method = "GET", headers = {}, body = "", agent } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(url, { method, headers, agent }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function interToken(rt, agent, scope) {
  const form = new URLSearchParams({
    client_id: rt.clientId,
    client_secret: rt.clientSecret,
    grant_type: "client_credentials",
    scope
  }).toString();
  const resp = await httpsJson(`${rt.baseUrl.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(form) },
    body: form,
    agent
  });
  if (!resp.ok || !resp.data.access_token) {
    throw new Error(resp.data.error_description || resp.data.error || `Inter OAuth HTTP ${resp.status}`);
  }
  return resp.data.access_token;
}

async function interReq(rt, agent, token, path, { method = "GET", body } = {}) {
  const payload = body ? JSON.stringify(body) : "";
  const headers = { accept: "application/json", authorization: `Bearer ${token}` };
  if (payload) { headers["content-type"] = "application/json"; headers["content-length"] = Buffer.byteLength(payload); }
  if (rt.contaCorrente) headers["x-conta-corrente"] = rt.contaCorrente;
  const resp = await httpsJson(`${rt.baseUrl.replace(/\/$/, "")}${path}`, { method, headers, body: payload, agent });
  if (!resp.ok) {
    throw new Error(resp.data.detail || resp.data.title || resp.data.message || `Inter HTTP ${resp.status}`);
  }
  return resp.data;
}

function buildPayload(conta, nota) {
  const cli = (nota && nota.cliente) || {};
  const value = Number((conta && conta.valor) || (nota && nota.valor) || 0);
  const dueDate = String((conta && conta.vencimento) || "").slice(0, 10);
  const cpfCnpj = cleanDigits(cli.cnpj || (conta && conta.documento) || "");
  if (!value) throw new Error("Valor invalido para emissao da cobranca Inter.");
  if (!dueDate) throw new Error("Vencimento obrigatorio para emissao da cobranca Inter.");
  if (!cpfCnpj) throw new Error("CPF/CNPJ do pagador obrigatorio para o boleto Inter.");
  return {
    seuNumero: trimStr((conta && conta.id) || (nota && nota.id) || "").slice(0, 15) || `GDP${Date.now()}`,
    valorNominal: Number(value.toFixed(2)),
    dataVencimento: dueDate,
    numDiasAgenda: 0,
    pagador: {
      cpfCnpj,
      tipoPessoa: cpfCnpj.length > 11 ? "JURIDICA" : "FISICA",
      nome: trimStr(cli.nome || (conta && conta.cliente) || (conta && conta.descricao) || "Cliente GDP"),
      email: trimStr(cli.email || (conta && conta.email) || ""),
      cep: cleanDigits(cli.cep || ""),
      endereco: trimStr(cli.logradouro || "Nao informado"),
      numero: trimStr(cli.numero || "S/N"),
      bairro: trimStr(cli.bairro || "Centro"),
      cidade: trimStr(cli.municipio || cli.cidade || ""),
      uf: trimStr(cli.uf || "")
    }
  };
}

function normalizeCharge(seu, detail) {
  const boleto = (detail && detail.boleto) || {};
  const pix = (detail && detail.pix) || {};
  const situacao = String((detail && detail.cobranca && detail.cobranca.situacao) || "").toUpperCase();
  const map = { A_RECEBER: "pendente", RECEBIDO: "recebida", MARCADO_RECEBIDO: "recebida", ATRASADO: "atrasada", CANCELADO: "cancelada", EXPIRADO: "expirada" };
  const temPix = Boolean(pix.pixCopiaECola || pix.txid);
  return {
    provider: "inter",
    providerChargeId: (detail && detail.cobranca && detail.cobranca.codigoSolicitacao) || seu.codigoSolicitacao || "",
    billingType: "BOLETO",
    status: map[situacao] || (situacao ? situacao.toLowerCase() : "pendente"),
    rawStatus: situacao,
    invoiceUrl: boleto.pdfCobranca || "",
    bankSlipUrl: boleto.pdfCobranca || "",
    linhaDigitavel: boleto.linhaDigitavel || "",
    nossoNumero: boleto.nossoNumero || "",
    dueDate: (detail && detail.cobranca && detail.cobranca.dataVencimento) || "",
    value: Number((detail && detail.cobranca && detail.cobranca.valorNominal) || 0),
    pix: temPix ? { payload: pix.pixCopiaECola || "", encodedImage: pix.imagemQrcode || "" } : null,
    externalReference: (detail && detail.cobranca && detail.cobranca.seuNumero) || seu.seuNumero || ""
  };
}

async function createInterCharge(ambiente, conta, nota) {
  const rt = resolveInterRuntime(ambiente);
  if (!rt.clientId || !rt.clientSecret) throw new Error("Credenciais OAuth do Inter ausentes (GDP_BANK_INTER_CLIENT_ID / _CLIENT_SECRET).");
  const agent = buildAgent(rt);
  const token = await interToken(rt, agent, "boleto-cobranca.write boleto-cobranca.read");
  const payload = buildPayload(conta, nota);
  const created = await interReq(rt, agent, token, "/cobranca/v3/cobrancas", { method: "POST", body: payload });
  const codigo = created.codigoSolicitacao || "";
  let detail = {};
  if (codigo) detail = await interReq(rt, agent, token, `/cobranca/v3/cobrancas/${encodeURIComponent(codigo)}`).catch(() => ({}));
  return { ok: true, provider: "inter", ambiente, normalized: normalizeCharge({ ...payload, codigoSolicitacao: codigo }, detail) };
}

async function syncInterCharge(ambiente, providerChargeId) {
  const rt = resolveInterRuntime(ambiente);
  if (!rt.clientId || !rt.clientSecret) throw new Error("Credenciais OAuth do Inter ausentes.");
  if (!providerChargeId) throw new Error("providerChargeId (codigoSolicitacao) obrigatorio.");
  const agent = buildAgent(rt);
  const token = await interToken(rt, agent, "boleto-cobranca.read");
  const detail = await interReq(rt, agent, token, `/cobranca/v3/cobrancas/${encodeURIComponent(providerChargeId)}`);
  return { ok: true, provider: "inter", ambiente, normalized: normalizeCharge({ codigoSolicitacao: providerChargeId }, detail) };
}

module.exports = async function handler(req, res) {
  corsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = req.body || {};
  const action = body.action || "";
  // BANK-1 (handoff cobranca-inter-fixes): o BACKEND manda. Provider e ambiente vem
  // SEMPRE da env (GDP_BANK_PROVIDER / GDP_BANK_AMBIENTE), ignorando o que o frontend
  // envia. Corrige o bug em que o front mandava 'asaas'/'sandbox' (fallback de
  // localStorage vazio) e a cobranca falhava. Fallback final: inter/producao.
  const provider = String(pickEnv(["GDP_BANK_PROVIDER", "GDP_BANK_DEFAULT_PROVIDER"]) || "inter").trim().toLowerCase();
  const ambiente = normalizeAmbiente(pickEnv(["GDP_BANK_AMBIENTE", "GDP_BANK_INTER_AMBIENTE"]) || "producao");

  try {
    if (provider === "c6") {
      return res.status(400).json({ ok: false, error: "C6 ainda nao habilitado: aguardando liberacao/homologacao da API. Use provider 'inter'." });
    }
    if (provider !== "inter") {
      return res.status(400).json({ ok: false, error: `Provider ${provider} nao suportado neste endpoint (inter, c6).` });
    }

    if (action === "bank-charge-create") {
      const conta = body.conta || null;
      if (!conta || !conta.id) return res.status(400).json({ ok: false, error: "conta.id obrigatorio" });
      const result = await createInterCharge(ambiente, conta, body.nota || null);
      return res.status(200).json({ ok: true, action, provider, ambiente, result });
    }

    if (action === "bank-charge-sync") {
      const providerChargeId = trimStr(body.providerChargeId);
      if (!providerChargeId) return res.status(400).json({ ok: false, error: "providerChargeId obrigatorio" });
      const result = await syncInterCharge(ambiente, providerChargeId);
      return res.status(200).json({ ok: true, action, provider, ambiente, result });
    }

    return res.status(400).json({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    console.error("[bank-charge]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
