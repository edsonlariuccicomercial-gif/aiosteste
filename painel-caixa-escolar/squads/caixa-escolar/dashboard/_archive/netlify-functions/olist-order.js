function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildTinyPayload(order) {
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

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const token = process.env.TINY_API_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "TINY_API_TOKEN nao configurado no Netlify" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (_e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "JSON invalido" }) };
  }

  const { orderId, school, cnpj, city, sre, responsible, arp, items, totalValue, obs } = body;

  if (!orderId || !school || !items || !items.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Payload incompleto: orderId, school, items[] obrigatorios" }) };
  }

  const order = {
    id: orderId,
    school,
    city: city || "",
    sre: sre || "",
    confirmedAt: new Date().toISOString(),
    items: items.map((i) => ({
      sku: i.sku || `ITEM-${i.itemNum || 0}`,
      description: i.description || i.name || "",
      qty: i.qty || 0,
      unitPrice: i.unitPrice || 0,
    })),
    totalValue: totalValue || 0,
    contractRef: arp || "",
  };

  const idempotencyKey = `portal-order:${orderId}`;
  const endpoint = "https://api.tiny.com.br/api2/pedido.incluir.php";
  const tinyPayload = buildTinyPayload(order);

  const form = new URLSearchParams();
  form.set("token", token);
  form.set("formato", "json");
  form.set("pedido", JSON.stringify(tinyPayload));

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body: form.toString(),
    });

    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_e) { parsed = { rawText: text }; }

    if (!resp.ok) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: `Tiny API (${resp.status}): ${text.slice(0, 200)}` }) };
    }

    const tinyRet = parsed.retorno || {};
    const tinyStatus = String(tinyRet.status || "").toLowerCase();
    if (tinyStatus && tinyStatus !== "ok") {
      const err = tinyRet.erros?.[0]?.erro || tinyRet.erros?.[0] || tinyRet.mensagem || "Erro desconhecido";
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: `Tiny: ${typeof err === "string" ? err : JSON.stringify(err)}` }) };
    }

    const olistOrderId =
      tinyRet.registros?.[0]?.registro?.id ||
      tinyRet.pedidos?.[0]?.pedido?.id ||
      parsed.order_id ||
      parsed.id ||
      `TINY-${Date.now()}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, olistOrderId: String(olistOrderId), provider: "tiny_api" }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
