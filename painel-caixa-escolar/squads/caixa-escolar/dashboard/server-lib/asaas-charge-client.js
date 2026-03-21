import { resolveProviderRuntimeConfig } from "./bank-provider-config.js";

function cleanDigits(value = "") {
  return String(value || "").replace(/\D+/g, "");
}

function trimString(value = "") {
  return String(value || "").trim();
}

function normalizeBillingType(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pix") return "PIX";
  if (normalized === "boleto") return "BOLETO";
  return "UNDEFINED";
}

function compactObject(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

function buildCustomerPayload(conta = {}, nota = null) {
  const clienteNota = nota?.cliente || {};
  const nome = trimString(clienteNota.nome || conta.cliente || conta.descricao || "Cliente GDP");
  const cpfCnpj = cleanDigits(clienteNota.cnpj || conta.documento || "");
  const email = trimString(clienteNota.email || conta.email || "");
  const mobilePhone = cleanDigits(clienteNota.telefone || conta.telefone || "");
  const postalCode = cleanDigits(clienteNota.cep || "");

  return compactObject({
    name: nome,
    cpfCnpj,
    email,
    mobilePhone,
    address: trimString(clienteNota.logradouro || ""),
    addressNumber: trimString(clienteNota.numero || ""),
    complement: trimString(clienteNota.complemento || ""),
    province: trimString(clienteNota.bairro || ""),
    postalCode,
    externalReference: trimString(conta.clienteId || conta.id || "")
  });
}

async function asaasRequest(runtime, path, options = {}) {
  const url = `${String(runtime.baseUrl || "").replace(/\/$/, "")}${path}`;
  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: runtime.auth.apiKey
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = data.errors?.[0]?.description || data.error || `Asaas HTTP ${resp.status}`;
    throw new Error(message);
  }
  return data;
}

async function listAsaasWebhooks({ provider = "asaas", ambiente = "sandbox" } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  if (provider !== "asaas" || runtime.provider !== "asaas") {
    throw new Error("Provider bancario ainda nao suportado para webhooks.");
  }
  if (!runtime.auth.apiKey) {
    throw new Error("ASAAS_API_KEY nao configurada no servidor.");
  }
  const data = await asaasRequest(runtime, "/webhooks");
  return {
    ok: true,
    provider: "asaas",
    ambiente: runtime.ambiente,
    items: Array.isArray(data.data) ? data.data : []
  };
}

async function createAsaasWebhook({ provider = "asaas", ambiente = "sandbox", webhookUrl = "", email = "", authToken = "", name = "GDP Webhook", events = [] } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  if (provider !== "asaas" || runtime.provider !== "asaas") {
    throw new Error("Provider bancario ainda nao suportado para webhooks.");
  }
  if (!runtime.auth.apiKey) {
    throw new Error("ASAAS_API_KEY nao configurada no servidor.");
  }
  if (!webhookUrl) {
    throw new Error("webhookUrl obrigatorio para provisionar webhook.");
  }

  const payload = compactObject({
    name,
    url: webhookUrl,
    email,
    enabled: true,
    interrupted: false,
    authToken,
    sendType: "SEQUENTIALLY",
    events: events.length ? events : [
      "PAYMENT_CREATED",
      "PAYMENT_UPDATED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE"
    ]
  });

  const data = await asaasRequest(runtime, "/webhooks", {
    method: "POST",
    body: payload
  });

  return {
    ok: true,
    provider: "asaas",
    ambiente: runtime.ambiente,
    webhook: data
  };
}

async function ensureAsaasCustomer(runtime, conta = {}, nota = null) {
  const payload = buildCustomerPayload(conta, nota);
  if (!payload.name) throw new Error("Cliente sem nome para cadastro no Asaas.");

  const queryCpfCnpj = payload.cpfCnpj ? `?cpfCnpj=${encodeURIComponent(payload.cpfCnpj)}` : "";
  if (queryCpfCnpj) {
    const listed = await asaasRequest(runtime, `/customers${queryCpfCnpj}`);
    const found = Array.isArray(listed.data) ? listed.data[0] : null;
    if (found?.id) {
      return {
        id: found.id,
        reused: true,
        payload
      };
    }
  }

  const created = await asaasRequest(runtime, "/customers", {
    method: "POST",
    body: payload
  });
  return {
    id: created.id,
    reused: false,
    payload
  };
}

function buildPaymentPayload(conta = {}, nota = null, customerId = "") {
  const billingType = normalizeBillingType(conta.forma || nota?.cobranca?.forma || "");
  const value = Number(conta.valor || nota?.valor || 0);
  const dueDate = String(conta.vencimento || "").slice(0, 10);
  if (!customerId) throw new Error("Cliente Asaas nao informado.");
  if (!value) throw new Error("Valor invalido para emissao da cobranca.");
  if (!dueDate) throw new Error("Vencimento obrigatorio para emissao da cobranca.");
  if (!["PIX", "BOLETO"].includes(billingType)) {
    throw new Error("Forma de cobranca suportada no Asaas: PIX ou BOLETO.");
  }

  return compactObject({
    customer: customerId,
    billingType,
    value,
    dueDate,
    description: trimString(conta.descricao || nota?.documentos?.observacao || `Cobranca ${conta.id || nota?.id || "GDP"}`),
    externalReference: trimString(conta.id || nota?.id || ""),
    postalService: false
  });
}

function normalizeAsaasCharge(payment = {}, pix = null) {
  const statusMap = {
    PENDING: "pendente",
    RECEIVED: "recebida",
    RECEIVED_IN_CASH: "recebida",
    OVERDUE: "atrasada",
    CONFIRMED: "confirmada",
    REFUNDED: "estornada",
    REFUND_REQUESTED: "estorno_solicitado"
  };
  return {
    provider: "asaas",
    providerChargeId: payment.id || "",
    customerId: payment.customer || "",
    billingType: payment.billingType || "",
    status: statusMap[payment.status] || String(payment.status || "").toLowerCase() || "pendente",
    rawStatus: payment.status || "",
    invoiceUrl: payment.invoiceUrl || payment.bankSlipUrl || "",
    bankSlipUrl: payment.bankSlipUrl || "",
    linhaDigitavel: payment.identificationField || payment.nossoNumero || "",
    nossoNumero: payment.nossoNumero || "",
    dueDate: payment.dueDate || "",
    value: Number(payment.value || 0),
    netValue: Number(payment.netValue || 0),
    description: payment.description || "",
    pix: pix ? {
      payload: pix.payload || "",
      encodedImage: pix.encodedImage || "",
      expirationDate: pix.expirationDate || ""
    } : null,
    paidAt: payment.clientPaymentDate || payment.paymentDate || payment.confirmedDate || "",
    externalReference: payment.externalReference || ""
  };
}

async function createAsaasCharge({ provider = "asaas", ambiente = "sandbox", conta = {}, nota = null } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  if (provider !== "asaas" || runtime.provider !== "asaas") {
    throw new Error("Provider bancario ainda nao suportado para emissao real.");
  }
  if (!runtime.auth.apiKey) {
    throw new Error("ASAAS_API_KEY nao configurada no servidor.");
  }

  const customer = await ensureAsaasCustomer(runtime, conta, nota);
  const paymentPayload = buildPaymentPayload(conta, nota, customer.id);
  const payment = await asaasRequest(runtime, "/payments", {
    method: "POST",
    body: paymentPayload
  });
  const pix = payment.billingType === "PIX"
    ? await asaasRequest(runtime, `/payments/${payment.id}/pixQrCode`)
    : null;

  return {
    ok: true,
    provider: "asaas",
    ambiente: runtime.ambiente,
    customer,
    paymentPayload,
    payment,
    pix,
    normalized: normalizeAsaasCharge(payment, pix)
  };
}

async function syncAsaasCharge({ provider = "asaas", ambiente = "sandbox", providerChargeId = "" } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  if (provider !== "asaas" || runtime.provider !== "asaas") {
    throw new Error("Provider bancario ainda nao suportado para sincronizacao real.");
  }
  if (!runtime.auth.apiKey) {
    throw new Error("ASAAS_API_KEY nao configurada no servidor.");
  }
  if (!providerChargeId) {
    throw new Error("providerChargeId obrigatorio para sincronizacao.");
  }

  const payment = await asaasRequest(runtime, `/payments/${encodeURIComponent(providerChargeId)}`);
  const pix = payment.billingType === "PIX"
    ? await asaasRequest(runtime, `/payments/${payment.id}/pixQrCode`).catch(() => null)
    : null;

  return {
    ok: true,
    provider: "asaas",
    ambiente: runtime.ambiente,
    payment,
    pix,
    normalized: normalizeAsaasCharge(payment, pix)
  };
}

export {
  createAsaasCharge,
  syncAsaasCharge,
  listAsaasWebhooks,
  createAsaasWebhook
};
