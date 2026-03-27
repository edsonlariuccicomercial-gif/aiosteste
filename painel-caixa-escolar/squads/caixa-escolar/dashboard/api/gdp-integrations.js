import nfeClient from "../server-lib/nfe-sefaz-client.js";
import { buildBankProviderDiagnostic } from "../server-lib/bank-provider-config.js";
import { createAsaasCharge, syncAsaasCharge, listAsaasWebhooks, createAsaasWebhook } from "../server-lib/asaas-charge-client.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ohxoxencxktpzskltbsk.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeG94ZW5jeGt0cHpza2x0YnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTUwNDQsImV4cCI6MjA4ODc5MTA0NH0.-w8f1xjW1cW2-OZpg1Sql8PqwFDzDqyWw4pHEx6jGSk";
const STORE_KEY = "gdp.integracoes.eventos.v1";
const RECEIVABLES_KEY = "gdp.contas-receber.v1";
const INVOICES_KEY = "gdp.notas-fiscais.v1";
const MODE = process.env.GDP_INTEGRATIONS_MODE || "queue";
const { getSefazConfig, validateSefazConfig, buildNfePayloadFromPedido, emitirNfeDireta, summarizeCertificateInput, summarizePemInput, buildNfeXml, buildXmlDsigPreview, buildLoteXml, buildAutorizacaoRequestPreview, transmitirAutorizacaoPreview, buildCancelamentoPayload, buildCancelamentoXml, buildCancelamentoRequestPreview, transmitirCancelamentoEvento } = nfeClient;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function supaGet(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/nexedu_sync?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) return [];
  const rows = await r.json();
  if (!rows.length) return [];
  try {
    return JSON.parse(rows[0].value);
  } catch (_) {
    return [];
  }
}

async function supaGetRowsByKey(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/sync_data?key=eq.${encodeURIComponent(key)}&select=user_id,key,data,updated_at`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

async function supaSet(key, value) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates"
  };
  const body = JSON.stringify({ key, value: JSON.stringify(value) });
  await fetch(`${SUPABASE_URL}/rest/v1/nexedu_sync`, { method: "POST", headers, body });
}

async function supaSetForUser(userId, key, value) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates"
  };
  const body = JSON.stringify({ user_id: userId, key, data: value, updated_at: new Date().toISOString() });
  await fetch(`${SUPABASE_URL}/rest/v1/sync_data?on_conflict=user_id,key`, { method: "POST", headers, body });
}


function buildProtocol(event) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `GDP-${String(event.channel || "OPS").slice(0, 4).toUpperCase()}-${stamp}`;
}

function getWebhookUrl(channel) {
  if (channel === "sefaz") return process.env.GDP_SEFAZ_WEBHOOK_URL || "";
  if (channel === "bancaria") return process.env.GDP_BANK_WEBHOOK_URL || "";
  if (channel === "comunicacao") return process.env.GDP_COMM_WEBHOOK_URL || "";
  return process.env.GDP_OPS_WEBHOOK_URL || "";
}

async function forwardEvent(event, protocol) {
  const url = getWebhookUrl(event.channel);
  if (!url) {
    return {
      status: "registrado_backend",
      provider: "queue_local",
      protocol
    };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: MODE,
      protocol,
      receivedAt: new Date().toISOString(),
      event
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Webhook ${event.channel}: HTTP ${resp.status}`);
  }

  return {
    status: data.status || "encaminhado_webhook",
    provider: data.provider || "webhook",
    protocol: data.protocol || protocol,
    remote: data
  };
}

function unwrapItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function wrapItems(items = []) {
  return {
    _v: 1,
    updatedAt: new Date().toISOString(),
    items
  };
}

function getAsaasWebhookSecret() {
  return process.env.GDP_BANK_ASAAS_WEBHOOK_SECRET || process.env.ASAAS_WEBHOOK_SECRET || "";
}

function resolvePublicBaseUrl(req) {
  const explicit = process.env.GDP_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.URL || "";
  if (String(explicit || "").trim()) return String(explicit).trim().replace(/\/$/, "");
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return host ? `${protocol}://${host}`.replace(/\/$/, "") : "";
}

function getAsaasWebhookToken(req) {
  return String(req.headers["asaas-access-token"] || req.headers["Asaas-Access-Token"] || "").trim();
}

function isAsaasWebhook(req) {
  const body = req.body || {};
  return req.method === "POST" && typeof body.event === "string" && body.payment && String(body.payment.id || "").startsWith("pay_");
}

function mapAsaasEventToStatus(eventName = "", payment = {}) {
  const raw = String(eventName || payment.status || "").trim().toUpperCase();
  if (raw === "PAYMENT_RECEIVED" || raw === "PAYMENT_CONFIRMED" || raw === "RECEIVED") {
    return {
      contaStatus: raw === "PAYMENT_RECEIVED" || raw === "RECEIVED" ? "recebida" : "cobranca_emitida",
      cobrancaStatus: raw === "PAYMENT_RECEIVED" || raw === "RECEIVED" ? "recebida_provider" : "confirmada_provider",
      conciliacaoStatus: raw === "PAYMENT_RECEIVED" || raw === "RECEIVED" ? "conciliado_api_bancaria" : "aguardando_liquidacao",
      integrationStatus: raw === "PAYMENT_RECEIVED" || raw === "RECEIVED" ? "recebida_provider" : "confirmada_provider"
    };
  }
  if (raw === "PAYMENT_OVERDUE" || raw === "OVERDUE") {
    return {
      contaStatus: "cobranca_emitida",
      cobrancaStatus: "atrasada_provider",
      conciliacaoStatus: "pendente_api_bancaria",
      integrationStatus: "atrasada_provider"
    };
  }
  if (raw === "PAYMENT_UPDATED" || raw === "PAYMENT_CREATED" || raw === "PENDING") {
    return {
      contaStatus: "cobranca_emitida",
      cobrancaStatus: "emitida_provider_real",
      conciliacaoStatus: "aguardando_webhook",
      integrationStatus: "aceita_provider"
    };
  }
  return {
    contaStatus: "cobranca_emitida",
    cobrancaStatus: "emitida_provider_real",
    conciliacaoStatus: "aguardando_webhook",
    integrationStatus: "aceita_provider"
  };
}

function updateReceivableFromAsaasEvent(conta = {}, payment = {}, eventName = "") {
  const mapped = mapAsaasEventToStatus(eventName, payment);
  const paidAt = payment.clientPaymentDate || payment.paymentDate || payment.confirmedDate || "";
  conta.status = mapped.contaStatus;
  conta.forma = String(payment.billingType || conta.forma || "").toLowerCase() === "pix" ? "pix" : (String(payment.billingType || "").toLowerCase() === "boleto" ? "boleto" : (conta.forma || "boleto"));
  conta.recebidaEm = paidAt || conta.recebidaEm || "";
  conta.cobranca = {
    ...(conta.cobranca || {}),
    status: mapped.cobrancaStatus,
    provider: "asaas",
    providerChargeId: payment.id || conta.cobranca?.providerChargeId || "",
    invoiceUrl: payment.invoiceUrl || conta.cobranca?.invoiceUrl || "",
    bankSlipUrl: payment.bankSlipUrl || conta.cobranca?.bankSlipUrl || "",
    linhaDigitavel: payment.identificationField || payment.nossoNumero || conta.cobranca?.linhaDigitavel || "",
    nossoNumero: payment.nossoNumero || conta.cobranca?.nossoNumero || "",
    paidAt
  };
  conta.conciliacao = {
    ...(conta.conciliacao || {}),
    status: mapped.conciliacaoStatus,
    referencia: conta.conciliacao?.referencia || payment.id || "",
    updatedAt: new Date().toISOString(),
    updatedBy: "asaas-webhook"
  };
  conta.integracoes = conta.integracoes || {};
  conta.integracoes.bancaria = {
    ...(conta.integracoes.bancaria || {}),
    status: mapped.integrationStatus,
    lastAction: "webhook_asaas",
    provider: "asaas",
    providerChargeId: payment.id || "",
    rawStatus: payment.status || eventName || "",
    paidAt,
    updatedAt: new Date().toISOString(),
    updatedBy: "asaas-webhook"
  };
  conta.audit = {
    ...(conta.audit || {}),
    updatedAt: new Date().toISOString(),
    updatedBy: "asaas-webhook"
  };
  return conta;
}

function updateInvoiceFromAsaasEvent(nota = {}, payment = {}, eventName = "") {
  const mapped = mapAsaasEventToStatus(eventName, payment);
  const paidAt = payment.clientPaymentDate || payment.paymentDate || payment.confirmedDate || "";
  nota.cobranca = {
    ...(nota.cobranca || {}),
    forma: String(payment.billingType || nota.cobranca?.forma || "").toLowerCase() === "pix" ? "pix" : (String(payment.billingType || "").toLowerCase() === "boleto" ? "boleto" : (nota.cobranca?.forma || "boleto")),
    status: mapped.cobrancaStatus,
    provider: "asaas",
    referencia: payment.id || nota.cobranca?.referencia || "",
    invoiceUrl: payment.invoiceUrl || nota.cobranca?.invoiceUrl || "",
    bankSlipUrl: payment.bankSlipUrl || nota.cobranca?.bankSlipUrl || "",
    linhaDigitavel: payment.identificationField || payment.nossoNumero || nota.cobranca?.linhaDigitavel || "",
    metadata: {
      ...(nota.cobranca?.metadata || {}),
      providerChargeId: payment.id || "",
      nossoNumero: payment.nossoNumero || "",
      paidAt
    }
  };
  nota.integracoes = nota.integracoes || {};
  nota.integracoes.bancaria = {
    ...(nota.integracoes.bancaria || {}),
    status: mapped.integrationStatus,
    lastAction: "webhook_asaas",
    provider: "asaas",
    providerChargeId: payment.id || "",
    rawStatus: payment.status || eventName || "",
    paidAt,
    updatedAt: new Date().toISOString(),
    updatedBy: "asaas-webhook"
  };
  nota.audit = {
    ...(nota.audit || {}),
    updatedAt: new Date().toISOString(),
    updatedBy: "asaas-webhook"
  };
  return nota;
}

async function processAsaasWebhook(body = {}, req) {
  const expectedToken = getAsaasWebhookSecret();
  const receivedToken = getAsaasWebhookToken(req);
  if (expectedToken && receivedToken !== expectedToken) {
    return { ok: false, status: 401, error: "asaas-access-token invalido" };
  }

  const payment = body.payment || {};
  const eventName = String(body.event || "").trim();
  const providerChargeId = String(payment.id || "").trim();
  if (!providerChargeId) {
    return { ok: false, status: 400, error: "payment.id obrigatorio no webhook Asaas" };
  }

  const receivableRows = await supaGetRowsByKey(RECEIVABLES_KEY);
  let receivablesUpdated = 0;
  const invoiceIdsToRefresh = [];

  for (const row of receivableRows) {
    const items = unwrapItems(row.data);
    let changed = false;
    const nextItems = items.map((item) => {
      const currentId = String(item?.cobranca?.providerChargeId || item?.integracoes?.bancaria?.providerChargeId || "").trim();
      if (currentId !== providerChargeId) return item;
      changed = true;
      if (item?.notaFiscalId) invoiceIdsToRefresh.push(String(item.notaFiscalId));
      return updateReceivableFromAsaasEvent({ ...item }, payment, eventName);
    });
    if (changed) {
      await supaSetForUser(row.user_id, RECEIVABLES_KEY, wrapItems(nextItems));
      receivablesUpdated += 1;
    }
  }

  if (invoiceIdsToRefresh.length) {
    const invoiceRows = await supaGetRowsByKey(INVOICES_KEY);
    const invoiceIdSet = new Set(invoiceIdsToRefresh.filter(Boolean));
    for (const row of invoiceRows) {
      const items = unwrapItems(row.data);
      let changed = false;
      const nextItems = items.map((item) => {
        if (!invoiceIdSet.has(String(item?.id || ""))) return item;
        changed = true;
        return updateInvoiceFromAsaasEvent({ ...item }, payment, eventName);
      });
      if (changed) {
        await supaSetForUser(row.user_id, INVOICES_KEY, wrapItems(nextItems));
      }
    }
  }

  const items = await supaGet(STORE_KEY);
  items.unshift({
    id: body.id || buildProtocol({ channel: "bancaria" }),
    entityType: "conta_receber",
    action: "webhook_asaas",
    entityId: providerChargeId,
    channel: "bancaria",
    status: "sincronizado",
    protocol: providerChargeId,
    provider: "asaas",
    createdAt: new Date().toISOString(),
    createdBy: "asaas-webhook",
    payload: {
      event: eventName,
      paymentId: providerChargeId,
      externalReference: payment.externalReference || "",
      status: payment.status || "",
      value: payment.value || 0
    },
    receivedAt: new Date().toISOString(),
    remote: {
      event: eventName,
      payment
    }
  });
  await supaSet(STORE_KEY, items.slice(0, 1000));

  return {
    ok: true,
    status: 200,
    updated: receivablesUpdated,
    paymentId: providerChargeId,
    event: eventName
  };
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (isAsaasWebhook(req)) {
      const result = await processAsaasWebhook(req.body || {}, req);
      return res.status(result.status || 200).json(result.ok ? { ok: true, received: true, updated: result.updated, paymentId: result.paymentId, event: result.event } : { ok: false, error: result.error });
    }

    if (req.method === "GET") {
      const action = req.query?.action || "";
      if (action === "nfe-sefaz-config") {
        const config = getSefazConfig();
        const { missing } = validateSefazConfig(config);
        const certificate = summarizeCertificateInput(config.certificadoBase64);
        const pem = summarizePemInput(config.certificadoPem, config.chavePrivadaPem);
        return res.status(200).json({
          ok: true,
          ambiente: config.ambiente,
          uf: config.uf,
          emitente: {
            cnpj: config.cnpjEmitente ? "***configurado***" : "",
            razaoSocial: config.razaoSocial || "",
            ie: config.ie ? "***configurado***" : ""
          },
          certificado: certificate.status,
          certificadoBytes: certificate.bytes,
          certificadoMensagem: certificate.message,
          pem,
          missing
        });
      }
      const items = await supaGet(STORE_KEY);
      return res.status(200).json({ ok: true, items });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    if (body.action === "nfe-sefaz-preview") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const config = getSefazConfig();
      const xmlPreview = buildNfeXml(payload);
      const xmlDsigPreview = buildXmlDsigPreview(xmlPreview.xml, config);
      const lotePreview = buildLoteXml(xmlDsigPreview.signedXml || xmlPreview.xml);
      const autorizacaoPreview = buildAutorizacaoRequestPreview(payload, lotePreview);
      return res.status(200).json({ ok: true, action: body.action, payload, xmlPreview, xmlDsigPreview, lotePreview, autorizacaoPreview });
    }

    if (body.action === "nfe-sefaz-emitir") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const result = await emitirNfeDireta(payload);
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action: body.action, result });
    }

    if (body.action === "nfe-sefaz-transmitir") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const result = await transmitirAutorizacaoPreview(payload, { force: body.force === true });
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, action: body.action, result });
    }

    if (body.action === "nfe-sefaz-cancelar") {
      const nota = body.nota || null;
      const motivo = String(body.motivo || "").trim();
      if (!nota?.id) return res.status(400).json({ ok: false, error: "nota.id obrigatorio" });
      if (!nota?.sefaz?.chaveAcesso) return res.status(400).json({ ok: false, error: "chave de acesso obrigatoria" });
      if (!nota?.sefaz?.protocolo) return res.status(400).json({ ok: false, error: "protocolo obrigatorio" });
      if (!motivo) return res.status(400).json({ ok: false, error: "motivo obrigatorio" });

      const payload = buildCancelamentoPayload(nota, motivo);
      const xmlPreview = buildCancelamentoXml(payload);
      const requestPreview = buildCancelamentoRequestPreview(payload, xmlPreview);
      const result = await transmitirCancelamentoEvento(nota, motivo, { force: body.force === true });
      return res.status(200).json({
        ok: result.ok,
        action: body.action,
        result: {
          ...result,
          payload,
          xmlPreview,
          requestPreview
        }
      });
    }

    if (body.action === "bank-api-diagnose") {
      const diagnostic = buildBankProviderDiagnostic(body.config || {});
      return res.status(200).json({
        ok: true,
        action: body.action,
        diagnostic
      });
    }

    if (body.action === "bank-charge-create") {
      const conta = body.conta || null;
      const nota = body.nota || null;
      const provider = String(body.provider || conta?.integracoes?.bancaria?.provider || nota?.integracoes?.bancaria?.provider || "asaas").trim().toLowerCase() || "asaas";
      const ambiente = String(body.ambiente || conta?.integracoes?.bancaria?.ambiente || nota?.integracoes?.bancaria?.ambiente || "sandbox").trim().toLowerCase() === "producao" ? "producao" : "sandbox";
      if (!conta?.id) return res.status(400).json({ ok: false, error: "conta.id obrigatorio" });

      let result;
      if (provider === "asaas") {
        result = await createAsaasCharge({ provider, ambiente, conta, nota });
      } else {
        return res.status(400).json({ ok: false, error: `Provider ${provider} ainda nao suportado para emissao real` });
      }

      return res.status(200).json({
        ok: true,
        action: body.action,
        provider,
        ambiente,
        result
      });
    }

    if (body.action === "bank-charge-sync") {
      const provider = String(body.provider || "asaas").trim().toLowerCase() || "asaas";
      const ambiente = String(body.ambiente || "sandbox").trim().toLowerCase() === "producao" ? "producao" : "sandbox";
      const providerChargeId = String(body.providerChargeId || "").trim();
      if (!providerChargeId) return res.status(400).json({ ok: false, error: "providerChargeId obrigatorio" });

      let result;
      if (provider === "asaas") {
        result = await syncAsaasCharge({ provider, ambiente, providerChargeId });
      } else {
        return res.status(400).json({ ok: false, error: `Provider ${provider} ainda nao suportado para sincronizacao real` });
      }

      return res.status(200).json({
        ok: true,
        action: body.action,
        provider,
        ambiente,
        result
      });
    }

    if (body.action === "bank-webhook-sync") {
      const config = body.config || {};
      const provider = String(body.provider || config.provider || "asaas").trim().toLowerCase() || "asaas";
      const ambiente = String(body.ambiente || config.ambiente || "sandbox").trim().toLowerCase() === "producao" ? "producao" : "sandbox";
      if (provider !== "asaas") {
        return res.status(400).json({ ok: false, error: `Provider ${provider} ainda nao suportado para provisionamento de webhook` });
      }

      const baseUrl = resolvePublicBaseUrl(req);
      const webhookUrl = String(config.webhookUrl || `${baseUrl}/api/gdp-integrations`).trim();
      const authToken = getAsaasWebhookSecret();
      const listed = await listAsaasWebhooks({ provider, ambiente });
      const existing = (listed.items || []).find((item) => String(item.url || "").trim() === webhookUrl);
      const requiredEvents = ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE"];

      if (existing) {
        return res.status(200).json({
          ok: true,
          action: body.action,
          provider,
          ambiente,
          provisioned: false,
          webhook: existing,
          webhookUrl,
          requiredEvents,
          authTokenConfigured: Boolean(authToken)
        });
      }

      const created = await createAsaasWebhook({
        provider,
        ambiente,
        webhookUrl,
        email: String(config.email || process.env.GDP_BANK_WEBHOOK_ALERT_EMAIL || process.env.EMAIL_FROM || "").trim(),
        authToken,
        name: "GDP Webhook Bancario",
        events: requiredEvents
      });

      return res.status(200).json({
        ok: true,
        action: body.action,
        provider,
        ambiente,
        provisioned: true,
        webhook: created.webhook,
        webhookUrl,
        requiredEvents,
        authTokenConfigured: Boolean(authToken)
      });
    }

    const event = body.event || null;
    if (!event?.id || !event?.entityType || !event?.action) {
      return res.status(400).json({ ok: false, error: "Payload incompleto: event.id, event.entityType, event.action" });
    }

    const items = await supaGet(STORE_KEY);
    const protocol = buildProtocol(event);
    const forwarded = await forwardEvent(event, protocol);
    const normalized = {
      ...event,
      status: forwarded.status,
      protocol: forwarded.protocol,
      provider: forwarded.provider,
      remote: forwarded.remote || null,
      receivedAt: new Date().toISOString()
    };

    const idx = items.findIndex((item) => item.id === event.id);
    if (idx >= 0) items[idx] = normalized;
    else items.unshift(normalized);

    await supaSet(STORE_KEY, items.slice(0, 1000));
    return res.status(200).json({ ok: true, status: normalized.status, protocol: normalized.protocol, provider: normalized.provider, item: normalized });
  } catch (err) {
    console.error("gdp-integrations error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
