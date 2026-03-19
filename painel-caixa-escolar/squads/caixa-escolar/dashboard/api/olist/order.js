// ─── Vercel API Route: Criação de Pedido no Tiny ERP ───
// ADR-001: Importa lógica de produto do módulo compartilhado
import {
  findNcm, normalizeUnit, generateSku, searchTinyProduct,
  shortenDescription, normalizeDescription, toBrDate,
} from "../lib/product-utils.js";

function buildTinyPayload(order) {
  const itens = (order.items || []).map((item, idx) => {
    const ncmMatch = findNcm(item.description);
    let codigo = String(item.sku || "").trim();
    if (!codigo) codigo = generateSku(item, idx, order.contractRef || order.id);
    const ncm = item.ncm || (ncmMatch ? ncmMatch.ncm : "") || item._tinyNcm || "";
    return {
      item: {
        codigo,
        descricao: shortenDescription(item.description),
        ncm,
        unidade: normalizeUnit(item.unidade),
        quantidade: Number(item.qty || 0),
        valor_unitario: Number(item.unitPrice || 0),
      },
    };
  });

  return {
    pedido: {
      data_pedido: toBrDate(order.confirmedAt),
      cliente: {
        nome: String(order.school || "Caixa Escolar").trim(),
        cpf_cnpj: String(order.cnpj || "").replace(/[^\d]/g, ""),
        endereco: order.logradouro || "",
        numero: order.numero || "S/N",
        complemento: order.complemento || "",
        bairro: order.bairro || "",
        cep: String(order.cep || "").replace(/[^\d]/g, ""),
        cidade: order.city || "",
        uf: order.uf || "MG",
        ie: order.ie || "ISENTO",
        fone: order.telefone || "",
        email: order.email || "",
      },
      itens,
      marcadores: [
        { marcador: { descricao: order.marcador || "Licit-AIX" } },
      ],
      obs: order.obs || "",
      obs_internas: `LICITIA ${order.id} | ${order.city || ""} | ${order.sre || ""}`.trim(),
    },
  };
}

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.TINY_API_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: "TINY_API_TOKEN nao configurado" });

  const body = req.body;
  if (!body) return res.status(400).json({ success: false, error: "JSON invalido" });

  const { orderId, school, cliente, cnpj, city, sre, responsible, arp, items, totalValue, obs, marcador,
          logradouro, numero, complemento, bairro, cep, uf, ie, telefone, email } = body;
  const cl = cliente || {};

  if (!orderId || !school || !items || !items.length) {
    return res.status(400).json({ success: false, error: "Payload incompleto: orderId, school, items[] obrigatorios" });
  }

  const order = {
    id: orderId,
    school,
    cnpj: cl.cnpj || cnpj || "",
    city: cl.cidade || city || "",
    sre: sre || "",
    confirmedAt: new Date().toISOString(),
    items: items.map((i, idx) => ({
      sku: i.sku || generateSku(i, idx, arp || orderId),
      description: i.description || i.name || "",
      qty: i.qty || 0,
      unitPrice: i.unitPrice || 0,
      itemNum: i.itemNum || idx + 1,
      unidade: i.unidade || "UN",
      ncm: i.ncm || "",
    })),
    totalValue: totalValue || 0,
    contractRef: arp || "",
    marcador: marcador || "Licit-AIX",
    obs: obs || "",
    logradouro: cl.logradouro || logradouro || "",
    numero: cl.numero || numero || "S/N",
    complemento: cl.complemento || complemento || "",
    bairro: cl.bairro || bairro || "",
    cep: cl.cep || cep || "",
    uf: cl.uf || uf || "MG",
    ie: cl.ie || ie || "ISENTO",
    telefone: cl.telefone || telefone || "",
    email: cl.email || email || "",
  };

  // ─── GATE-2 & GATE-3: Validação pré-envio (ADR-001 D4) ───
  const ncmAlerts = [];
  const skuErrors = [];
  const unitErrors = [];

  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    const ncmMatch = findNcm(item.description);
    const ncmCode = item.ncm || (ncmMatch ? ncmMatch.ncm : "");

    // GATE-2: NCM obrigatório
    if (!ncmCode) {
      ncmAlerts.push({ item: item.itemNum || i + 1, description: item.description });
    }

    // GATE-3: SKU obrigatório — se não tem, tenta resolver
    if (!item.sku || !String(item.sku).trim()) {
      const existing = await searchTinyProduct(token, item.description);
      if (existing && existing.codigo) {
        item.sku = existing.codigo;
        if (!ncmMatch && existing.ncm) item._tinyNcm = existing.ncm;
      } else {
        item.sku = generateSku(item, i, arp || orderId);
        const produto = {
          produto: {
            codigo: String(item.sku),
            nome: normalizeDescription(item.description),
            ncm: ncmCode,
            unidade: normalizeUnit(item.unidade),
            preco: Number(item.unitPrice || 0),
            origem: "0",
            tipo: "P",
            situacao: "A",
          },
        };
        const prodForm = new URLSearchParams();
        prodForm.set("token", token);
        prodForm.set("formato", "json");
        prodForm.set("produto", JSON.stringify(produto));
        try {
          await fetch("https://api.tiny.com.br/api2/produto.incluir.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: prodForm.toString(),
          });
        } catch (_e) { /* best-effort */ }
      }

      if (i < order.items.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // GATE-1: Unidade válida (warn mode — strict mode via frontend)
    const normalizedUnit = normalizeUnit(item.unidade, { strict: true });
    if (!normalizedUnit) {
      unitErrors.push({ item: item.itemNum || i + 1, description: item.description, unidade: item.unidade });
    }
  }

  // GATE-2: Bloquear se NCM vazio em TODOS os itens
  if (ncmAlerts.length === order.items.length) {
    return res.status(400).json({
      success: false,
      error: "GATE-2: Nenhum item possui NCM. Impossivel emitir NF-e.",
      ncmAlerts,
    });
  }

  // ─── Step 2: Create order in Tiny ───
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
      return res.status(500).json({ success: false, error: `Tiny API (${resp.status}): ${text.slice(0, 200)}` });
    }

    const tinyRet = parsed.retorno || {};
    const tinyStatus = String(tinyRet.status || "").toLowerCase();
    if (tinyStatus && tinyStatus !== "ok") {
      const err = tinyRet.erros?.[0]?.erro || tinyRet.erros?.[0] || tinyRet.mensagem || "Erro desconhecido";
      return res.status(500).json({ success: false, error: `Tiny: ${typeof err === "string" ? err : JSON.stringify(err)}` });
    }

    const olistOrderId =
      tinyRet.registros?.registro?.id ||
      tinyRet.registros?.[0]?.registro?.id ||
      tinyRet.pedidos?.[0]?.pedido?.id ||
      parsed.order_id ||
      parsed.id ||
      `TINY-${Date.now()}`;

    const result = { success: true, olistOrderId: String(olistOrderId), provider: "tiny_api" };
    if (ncmAlerts.length > 0) {
      result.ncmAlerts = ncmAlerts;
      result.ncmWarning = `${ncmAlerts.length} item(ns) sem NCM — corrigir no Tiny antes de emitir NF-e`;
    }
    if (unitErrors.length > 0) {
      result.unitWarnings = unitErrors;
      result.unitWarning = `${unitErrors.length} item(ns) com unidade desconhecida`;
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
