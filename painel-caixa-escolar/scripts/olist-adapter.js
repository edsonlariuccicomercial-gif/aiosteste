const fs = require("fs");
const path = require("path");

const OLIST_ORDERS_PATH = path.join(process.cwd(), "dashboard", "data", "olist-orders.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function buildOlistPayload(order) {
  return {
    external_order_id: order.id,
    order_date: order.confirmedAt,
    customer: {
      school_name: order.school,
      city: order.city,
      region: order.sre,
    },
    items: order.items || [],
    totals: {
      total_value: order.totalValue || 0,
      currency: "BRL",
    },
    metadata: {
      source: "LICITIA_POS_LICITACAO",
      contract_ref: order.contractRef || "",
    },
  };
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildTinyApi2Payload(order) {
  const itens = (order.items || []).map((item) => ({
    item: {
      codigo: String(item.sku || "").trim(),
      descricao: String(item.description || item.sku || "Item sem descricao").trim(),
      unidade: "UN",
      quantidade: Number(item.qty || 0),
      valor_unitario: Number(item.unitPrice || 0),
    },
  }));

  return {
    pedido: {
      data_pedido: toIsoDate(order.confirmedAt),
      cliente: {
        nome: String(order.school || "Caixa Escolar").trim(),
      },
      itens,
      obs: `LICITIA ${order.id} | ${order.city || ""} | ${order.sre || ""}`.trim(),
      observacoes: String(order.contractRef || "").trim(),
    },
  };
}

function parseResponseSafe(text) {
  try {
    return JSON.parse(text);
  } catch (_e) {
    return { rawText: text };
  }
}

function resolveTinyAuthHeader(token) {
  const headerName = process.env.TINY_API_TOKEN_HEADER || "Authorization";
  const scheme = process.env.TINY_API_AUTH_SCHEME || "Bearer";
  const headerValue = scheme ? `${scheme} ${token}` : token;
  return { headerName, headerValue };
}

async function sendToTinyApi(order, idempotencyKey) {
  const endpoint =
    process.env.TINY_API_URL ||
    process.env.OLIST_API_URL ||
    "https://api.tiny.com.br/api2/pedido.incluir.php";
  const token = process.env.TINY_API_TOKEN || process.env.OLIST_API_TOKEN;
  if (!endpoint) {
    throw new Error("TINY_API_URL nao definido para modo tiny_api.");
  }
  if (!token) {
    throw new Error("TINY_API_TOKEN nao definido para modo tiny_api.");
  }

  const { headerName, headerValue } = resolveTinyAuthHeader(token);
  const payload = buildOlistPayload(order);
  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    [headerName]: headerValue,
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  const body = parseResponseSafe(text);
  if (!resp.ok) {
    throw new Error(`Falha Tiny API (${resp.status}): ${String(text).slice(0, 200)}`);
  }

  return {
    olistOrderId: body.order_id || body.id || body.retorno?.pedidos?.[0]?.pedido?.id || `OL-TINY-${Date.now()}`,
    provider: "tiny_api",
    raw: body,
  };
}

async function sendToTinyApi2(order, idempotencyKey) {
  const endpoint =
    process.env.TINY_API_URL ||
    process.env.OLIST_API_URL ||
    "https://api.tiny.com.br/api2/pedido.incluir.php";
  const token = process.env.TINY_API_TOKEN || process.env.OLIST_API_TOKEN;
  if (!token) throw new Error("TINY_API_TOKEN nao definido para modo tiny_api2.");

  const tinyPayload = buildTinyApi2Payload(order);
  const form = new URLSearchParams();
  form.set("token", token);
  form.set("formato", "json");
  form.set("pedido", JSON.stringify(tinyPayload));

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: form.toString(),
  });

  const text = await resp.text();
  const body = parseResponseSafe(text);
  if (!resp.ok) {
    throw new Error(`Falha Tiny API2 (${resp.status}): ${String(text).slice(0, 200)}`);
  }

  const tinyRet = body.retorno || {};
  const tinyStatus = String(tinyRet.status || "").toLowerCase();
  if (tinyStatus && tinyStatus !== "ok") {
    const err =
      tinyRet.erros?.[0]?.erro ||
      tinyRet.erros?.[0] ||
      tinyRet.mensagem ||
      "Erro desconhecido no Tiny";
    throw new Error(`Tiny API2 retornou erro: ${typeof err === "string" ? err : JSON.stringify(err)}`);
  }

  return {
    olistOrderId:
      tinyRet.registros?.[0]?.registro?.id ||
      tinyRet.pedidos?.[0]?.pedido?.id ||
      body.order_id ||
      body.id ||
      `OL-TINY2-${Date.now()}`,
    provider: "tiny_api2",
    raw: body,
  };
}

async function sendToOlist(order, idempotencyKey) {
  const mode = process.env.OLIST_MODE || "mock";
  if (mode === "webhook") {
    const endpoint = process.env.OLIST_WEBHOOK_URL;
    if (!endpoint) throw new Error("OLIST_WEBHOOK_URL nao definido para modo webhook.");

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(buildOlistPayload(order)),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Falha no webhook Olist (${resp.status}): ${text.slice(0, 200)}`);
    }
    const body = await resp.json().catch(() => ({}));
    return {
      olistOrderId: body.order_id || body.id || `OL-WEB-${Date.now()}`,
      provider: "webhook",
      raw: body,
    };
  }
  if (mode === "tiny_api") {
    return sendToTinyApi2(order, idempotencyKey);
  }
  if (mode === "tiny_api_rest") {
    return sendToTinyApi(order, idempotencyKey);
  }

  const store = readJson(OLIST_ORDERS_PATH, []);
  const exists = store.find((o) => o.idempotencyKey === idempotencyKey);
  if (exists) {
    return {
      olistOrderId: exists.olistOrderId,
      provider: "mock",
      raw: { deduplicated: true },
    };
  }

  const olistOrderId = `OL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  store.push({
    olistOrderId,
    idempotencyKey,
    syncedAt: new Date().toISOString(),
    payload: buildOlistPayload(order),
  });
  writeJson(OLIST_ORDERS_PATH, store);

  return {
    olistOrderId,
    provider: "mock",
    raw: { deduplicated: false },
  };
}

module.exports = { sendToOlist };
