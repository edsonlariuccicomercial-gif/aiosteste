// Cliente de cobrança do Banco Inter (API Cobrança v3 — Bolepix).
//
// Espelha a interface de asaas-charge-client.js (createCharge/syncCharge) e devolve o
// MESMO formato `normalized`, para que o orquestrador (gdp-integrations.js) persista em
// contas_receber.cobranca sem branch específico por banco.
//
// Diferenças do Asaas:
//  - Auth: OAuth v2 (client_credentials) + certificado mTLS (PEM), não API-key.
//  - Endpoints: /oauth/v2/token e /cobranca/v3/cobrancas (Bolepix).
//
// TRANSPORTE (QA-01): usa https.request() nativo com https.Agent(cert/key), NÃO fetch.
// O fetch global do Node 18+ (undici) IGNORA a opção `agent`, então o certificado mTLS
// não seria aplicado — espelhamos o precedente do projeto em nfe-sefaz-client.js:323.
// Docs: https://developers.inter.co/references/cobranca-bolepix

import https from "node:https";
import { resolveProviderRuntimeConfig } from "./bank-provider-config.js";

function trimString(value = "") {
  return String(value || "").trim();
}

function cleanDigits(value = "") {
  return String(value || "").replace(/\D+/g, "");
}

// Inter aceita PEM com quebras de linha reais ou escapadas (\n) vindas de env vars.
function normalizePem(value = "") {
  return String(value || "").includes("\\n") ? String(value).replace(/\\n/g, "\n") : String(value || "");
}

function buildHttpsAgent(runtime) {
  const cert = normalizePem(runtime.auth.certPem);
  const key = normalizePem(runtime.auth.keyPem);
  if (!cert || !key) {
    throw new Error("Certificado mTLS do Inter ausente (GDP_BANK_INTER_CERT_PEM / GDP_BANK_INTER_KEY_PEM).");
  }
  return new https.Agent({ cert, key, keepAlive: true });
}

// Requisição HTTPS com mTLS via módulo nativo (fetch undici não aplica cert via `agent`).
function httpsRequestJson(urlString, { method = "GET", headers = {}, body = "", agent } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(
      url,
      { method, headers, agent },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function assertInterRuntime(runtime, provider) {
  if (provider !== "inter" || runtime.provider !== "inter") {
    throw new Error("Provider bancario ainda nao suportado para esta operacao (esperado: inter).");
  }
  if (!runtime.auth.clientId || !runtime.auth.clientSecret) {
    throw new Error("Credenciais OAuth do Inter ausentes (GDP_BANK_INTER_CLIENT_ID / _CLIENT_SECRET).");
  }
}

async function interOAuthToken(runtime, agent, scope) {
  const url = `${String(runtime.baseUrl || "").replace(/\/$/, "")}/oauth/v2/token`;
  const form = new URLSearchParams({
    client_id: runtime.auth.clientId,
    client_secret: runtime.auth.clientSecret,
    grant_type: "client_credentials",
    scope
  }).toString();

  const resp = await httpsRequestJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": Buffer.byteLength(form)
    },
    body: form,
    agent
  });
  if (!resp.ok || !resp.data.access_token) {
    throw new Error(resp.data.error_description || resp.data.error || `Inter OAuth HTTP ${resp.status}`);
  }
  return resp.data.access_token;
}

async function interRequest(runtime, agent, token, path, options = {}) {
  const url = `${String(runtime.baseUrl || "").replace(/\/$/, "")}${path}`;
  const body = options.body ? JSON.stringify(options.body) : "";
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`
  };
  if (body) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(body);
  }
  const contaCorrente = trimString(runtime.auth.contaCorrente);
  if (contaCorrente) headers["x-conta-corrente"] = contaCorrente;

  const resp = await httpsRequestJson(url, { method: options.method || "GET", headers, body, agent });
  if (!resp.ok) {
    const message = resp.data.detail || resp.data.title || resp.data.message || `Inter HTTP ${resp.status}`;
    throw new Error(message);
  }
  return resp.data;
}

function buildCobrancaPayload(conta = {}, nota = null) {
  const clienteNota = nota?.cliente || {};
  const value = Number(conta.valor || nota?.valor || 0);
  const dueDate = String(conta.vencimento || "").slice(0, 10);
  const nome = trimString(clienteNota.nome || conta.cliente || conta.descricao || "Cliente GDP");
  const cpfCnpj = cleanDigits(clienteNota.cnpj || conta.documento || "");
  if (!value) throw new Error("Valor invalido para emissao da cobranca Inter.");
  if (!dueDate) throw new Error("Vencimento obrigatorio para emissao da cobranca Inter.");
  if (!cpfCnpj) throw new Error("CPF/CNPJ do pagador obrigatorio para o boleto Inter.");

  const pessoa = cpfCnpj.length > 11 ? "JURIDICA" : "FISICA";
  return {
    // CRIT-D (2026-07-01): slice(-15), NAO slice(0,15). O Inter limita seuNumero a 15 chars; o
    // conta.id (ex.: "CR-20260622-46493", 17 chars) truncado pelo INICIO perdia o sufixo UNICO
    // (virava "CR-20260622-464") e impossibilitava re-vincular boleto<->conta por seuNumero →
    // boleto orfao. slice(-15) preserva o sufixo (a chave de reconciliacao). Alinha ao caminho
    // real ja corrigido em api/bank-charge.js:141 (_seu = ...slice(-15)).
    seuNumero: trimString(conta.id || nota?.id || "").slice(-15) || `GDP${Date.now()}`,
    valorNominal: Number(value.toFixed(2)),
    dataVencimento: dueDate,
    numDiasAgenda: 0,
    pagador: {
      cpfCnpj,
      tipoPessoa: pessoa,
      nome,
      email: trimString(clienteNota.email || conta.email || ""),
      cep: cleanDigits(clienteNota.cep || ""),
      endereco: trimString(clienteNota.logradouro || "Nao informado"),
      numero: trimString(clienteNota.numero || "S/N"),
      bairro: trimString(clienteNota.bairro || "Centro"),
      cidade: trimString(clienteNota.municipio || clienteNota.cidade || ""),
      uf: trimString(clienteNota.uf || "")
    }
  };
}

// Converte a resposta do Inter para o formato `normalized` compartilhado.
function normalizeInterCharge(cobranca = {}, detail = {}) {
  const boleto = detail.boleto || cobranca.boleto || {};
  const pix = detail.pix || cobranca.pix || {};
  const situacao = String(detail.cobranca?.situacao || cobranca.situacao || "").toUpperCase();
  const statusMap = {
    A_RECEBER: "pendente",
    RECEBIDO: "recebida",
    MARCADO_RECEBIDO: "recebida",
    ATRASADO: "atrasada",
    CANCELADO: "cancelada",
    EXPIRADO: "expirada"
  };
  const temPix = Boolean(pix.pixCopiaECola || pix.txid); // QA-02: precedência explícita
  return {
    provider: "inter",
    providerChargeId: cobranca.codigoSolicitacao || detail.cobranca?.codigoSolicitacao || "",
    customerId: cleanDigits(detail.cobranca?.pagador?.cpfCnpj || ""),
    billingType: "BOLETO",
    status: statusMap[situacao] || (situacao ? situacao.toLowerCase() : "pendente"),
    rawStatus: situacao,
    invoiceUrl: boleto.pdfCobranca || boleto.url || "",
    bankSlipUrl: boleto.pdfCobranca || "",
    linhaDigitavel: boleto.linhaDigitavel || "",
    nossoNumero: boleto.nossoNumero || "",
    dueDate: detail.cobranca?.dataVencimento || cobranca.dataVencimento || "",
    value: Number(detail.cobranca?.valorNominal || cobranca.valorNominal || 0),
    netValue: 0,
    description: "",
    pix: temPix ? {
      payload: pix.pixCopiaECola || "",
      encodedImage: pix.imagemQrcode || "",
      expirationDate: ""
    } : null,
    paidAt: "",
    externalReference: cobranca.seuNumero || detail.cobranca?.seuNumero || ""
  };
}

async function createInterCharge({ provider = "inter", ambiente = "sandbox", conta = {}, nota = null } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  assertInterRuntime(runtime, provider);
  const agent = buildHttpsAgent(runtime);
  const token = await interOAuthToken(runtime, agent, "boleto-cobranca.write boleto-cobranca.read");

  const payload = buildCobrancaPayload(conta, nota);
  const created = await interRequest(runtime, agent, token, "/cobranca/v3/cobrancas", {
    method: "POST",
    body: payload
  });
  const codigoSolicitacao = created.codigoSolicitacao || "";

  // Recupera detalhe (linha digitável, PDF, Pix) — registro instantâneo do Inter.
  let detail = {};
  if (codigoSolicitacao) {
    detail = await interRequest(runtime, agent, token, `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}`)
      .catch(() => ({}));
  }

  return {
    ok: true,
    provider: "inter",
    ambiente: runtime.ambiente,
    paymentPayload: payload,
    payment: { ...created, ...detail },
    pix: detail.pix || null,
    normalized: normalizeInterCharge({ ...payload, codigoSolicitacao }, detail)
  };
}

async function syncInterCharge({ provider = "inter", ambiente = "sandbox", providerChargeId = "" } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  assertInterRuntime(runtime, provider);
  if (!providerChargeId) throw new Error("providerChargeId (codigoSolicitacao) obrigatorio para sincronizacao Inter.");
  const agent = buildHttpsAgent(runtime);
  const token = await interOAuthToken(runtime, agent, "boleto-cobranca.read");

  const detail = await interRequest(runtime, agent, token, `/cobranca/v3/cobrancas/${encodeURIComponent(providerChargeId)}`);
  return {
    ok: true,
    provider: "inter",
    ambiente: runtime.ambiente,
    payment: detail,
    pix: detail.pix || null,
    normalized: normalizeInterCharge({ codigoSolicitacao: providerChargeId }, detail)
  };
}

export { createInterCharge, syncInterCharge };
