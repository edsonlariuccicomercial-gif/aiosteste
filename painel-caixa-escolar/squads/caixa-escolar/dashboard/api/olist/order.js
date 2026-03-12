// ─── NCM Mapping Table ───
// Maps normalized product keywords to NCM codes
// Reference: https://portalunico.siscomex.gov.br/classif/#/nomenclatura/tabela
const NCM_MAP = [
  { keywords: ["embalagem", "plastica", "freezer", "saco"], ncm: "3923.29.90", desc: "Embalagem Plastica Freezer" },
  { keywords: ["isqueiro", "gas"], ncm: "9613.10.00", desc: "Isqueiro a Gas" },
  { keywords: ["sabao", "barra"], ncm: "3401.19.00", desc: "Sabao em Barra" },
  { keywords: ["vassoura", "nylon"], ncm: "9603.10.00", desc: "Vassoura de Nylon" },
  { keywords: ["cloro", "gel"], ncm: "2828.90.11", desc: "Cloro em Gel" },
  { keywords: ["lixeira", "plastica", "pedal"], ncm: "3924.90.00", desc: "Lixeira Plastica com Pedal" },
  { keywords: ["escova", "alimentos", "legumes"], ncm: "9603.90.00", desc: "Escova para Alimentos" },
  { keywords: ["rodo", "magico", "refil"], ncm: "9603.90.00", desc: "Rodo Magico com Refil" },
  { keywords: ["mangueira", "jardim"], ncm: "3917.39.00", desc: "Mangueira de Jardim" },
  { keywords: ["detergente"], ncm: "3402.20.00", desc: "Detergente Liquido" },
  { keywords: ["agua", "sanitaria"], ncm: "2828.90.11", desc: "Agua Sanitaria" },
  { keywords: ["esponja"], ncm: "3926.90.90", desc: "Esponja de Limpeza" },
  { keywords: ["pano", "chao"], ncm: "6307.10.00", desc: "Pano de Chao" },
  { keywords: ["desinfetante"], ncm: "3808.94.19", desc: "Desinfetante" },
  { keywords: ["luva", "latex", "borracha"], ncm: "4015.19.00", desc: "Luva de Borracha" },
  { keywords: ["papel", "higienico"], ncm: "4818.10.00", desc: "Papel Higienico" },
  { keywords: ["papel", "toalha"], ncm: "4818.20.00", desc: "Papel Toalha" },
  { keywords: ["saco", "lixo"], ncm: "3923.29.90", desc: "Saco de Lixo" },
  { keywords: ["balde"], ncm: "3924.10.00", desc: "Balde Plastico" },
  { keywords: ["alcool", "gel", "liquido"], ncm: "2207.10.90", desc: "Alcool" },
  { keywords: ["sabonete"], ncm: "3401.11.90", desc: "Sabonete" },
  { keywords: ["cera"], ncm: "3405.40.00", desc: "Cera para Piso" },
  { keywords: ["amaciante"], ncm: "3809.91.90", desc: "Amaciante de Roupas" },
  { keywords: ["limpador", "multiuso"], ncm: "3402.20.00", desc: "Limpador Multiuso" },
  { keywords: ["inseticida"], ncm: "3808.91.99", desc: "Inseticida" },
  // ─── Alimentícios ───
  { keywords: ["acucar", "cristal", "refinado"], ncm: "1701.14.00", desc: "Acucar" },
  { keywords: ["biscoito", "bolacha", "cream cracker"], ncm: "1905.31.00", desc: "Biscoito" },
  { keywords: ["cacau", "chocolate", "achocolatado"], ncm: "1805.00.00", desc: "Achocolatado" },
  { keywords: ["extrato", "tomate", "molho"], ncm: "2002.90.00", desc: "Extrato de Tomate" },
  { keywords: ["feijao", "carioca", "preto"], ncm: "0713.33.19", desc: "Feijao" },
  { keywords: ["polvilho", "amido", "mandioca"], ncm: "1108.14.00", desc: "Polvilho" },
  { keywords: ["sal", "refinado", "iodado"], ncm: "2501.00.20", desc: "Sal" },
  { keywords: ["pao", "frances", "forma"], ncm: "1905.90.10", desc: "Pao" },
  { keywords: ["rosca", "rosquinha"], ncm: "1905.90.90", desc: "Rosca" },
  { keywords: ["arroz"], ncm: "1006.30.21", desc: "Arroz" },
  { keywords: ["macarrao", "espaguete", "massa"], ncm: "1902.19.00", desc: "Macarrao" },
  { keywords: ["oleo", "soja", "vegetal"], ncm: "1507.90.11", desc: "Oleo de Soja" },
  { keywords: ["cafe", "torrado", "moido"], ncm: "0901.21.00", desc: "Cafe" },
  { keywords: ["leite", "integral", "desnatado"], ncm: "0401.10.10", desc: "Leite" },
  { keywords: ["farinha", "trigo"], ncm: "1101.00.10", desc: "Farinha de Trigo" },
  { keywords: ["margarina", "manteiga"], ncm: "1517.10.00", desc: "Margarina" },
  { keywords: ["vinagre"], ncm: "2209.00.00", desc: "Vinagre" },
  { keywords: ["fuba", "milho", "quirera"], ncm: "1102.20.00", desc: "Fuba de Milho" },
  { keywords: ["sardinha", "atum", "conserva"], ncm: "1604.13.10", desc: "Conserva" },
  { keywords: ["suco", "refresco", "nectar"], ncm: "2009.89.90", desc: "Suco" },
];

function findNcm(description) {
  const lower = (description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let bestMatch = null;
  let bestScore = 0;
  for (const entry of NCM_MAP) {
    const score = entry.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  return bestMatch;
}

function extractTraits(description) {
  // Extract key characteristics from edital descriptions
  // Returns array of trait strings like "50L", "Pcte c/ 8un", "30cm x 40cm"
  const traits = [];
  const lower = (description || "").toLowerCase();

  // Capacity: "50 litros", "capacidade 13kg", "500ml"
  const cap = description.match(/\b(\d+)\s*(litros?|lts?|[mk]?g|ml)\b/i);
  if (cap) traits.push(cap[0].trim());

  // Dimensions: "50cm x 70cm", "9cm x 5,5cm"
  const dim = description.match(/\b\d+[,.]?\d*\s*(?:cm|mm|m)\s*[xX]\s*\d+[,.]?\d*\s*(?:cm|mm|m)\b/i);
  if (dim) traits.push(dim[0].trim());

  // Pack/bundle: "pcte com 8", "pacote com 5", "com 8 unidades", "c/ 12 un"
  const pack = description.match(/\b(?:pcte|pacote|pct)\s*(?:com|c\/)?\s*(\d+)\s*(?:un(?:idades?)?)?/i)
    || description.match(/\bcom\s+(\d+)\s+un(?:idades?)?\b/i)
    || description.match(/\bc\/\s*(\d+)\s*un/i);
  if (pack) traits.push(`Pcte c/ ${pack[1]}un`);

  // Volume in liters: "5 litros", "1L"
  // (already caught by capacity above)

  // Color: "branca", "azul", "verde", etc.
  const colors = ["branca", "branco", "azul", "verde", "amarela", "amarelo", "preta", "preto", "vermelha", "vermelho", "rosa", "transparente"];
  for (const c of colors) {
    if (lower.includes(c)) { traits.push(c.charAt(0).toUpperCase() + c.slice(1)); break; }
  }

  // Length in meters: "30m", "50 metros"
  const meters = description.match(/\b(\d+)\s*(?:metros?|mts?)\b/i);
  if (meters && !dim) traits.push(`${meters[1]}m`);

  return traits;
}

function normalizeDescription(description) {
  const match = findNcm(description);
  if (!match) return shortenDescription(description);

  const traits = extractTraits(description);
  if (traits.length === 0) return match.desc;

  const full = `${match.desc} ${traits.join(" ")}`;
  return full.length > 120 ? full.substring(0, 117) + "..." : full;
}

function shortenDescription(desc) {
  // For items without NCM match: abbreviate but keep traits
  let s = (desc || "").trim();
  // Remove trailing colons
  s = s.replace(/:+\s*$/, "").trim();
  // Remove redundant "COM CAPACIDADE MINIMA DE" → keep the value
  s = s.replace(/\bCOM\s+CAPACIDADE\s+M[IÍ]NIMA\s+DE\s+/ig, "").trim();
  // Cap length
  if (s.length > 120) s = s.substring(0, 117) + "...";
  return s;
}

function generateSku(item, index) {
  // Generate structured SKU: CE-{itemNum}-{shortCode}
  const num = String(item.itemNum || index + 1).padStart(3, "0");
  const words = (item.description || item.name || "ITEM")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 2)
    .join("-");
  return `CE-${num}-${words || "PROD"}`;
}

function toBrDate(value) {
  const now = new Date();
  if (!value) {
    return `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function buildTinyPayload(order) {
  const itens = (order.items || []).map((item, idx) => {
    const ncmMatch = findNcm(item.description);
    return {
      item: {
        codigo: item.sku,
        descricao: normalizeDescription(item.description),
        ncm: ncmMatch ? ncmMatch.ncm : "",
        unidade: "UN",
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
      obs: `LICITIA ${order.id} | ${order.city || ""} | ${order.sre || ""}`.trim(),
      observacoes: String(order.contractRef || "").trim(),
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

  const { orderId, school, cnpj, city, sre, responsible, arp, items, totalValue, obs,
          logradouro, numero, complemento, bairro, cep, uf, ie, telefone, email } = body;

  if (!orderId || !school || !items || !items.length) {
    return res.status(400).json({ success: false, error: "Payload incompleto: orderId, school, items[] obrigatorios" });
  }

  const order = {
    id: orderId,
    school,
    cnpj: cnpj || "",
    city: city || "",
    sre: sre || "",
    confirmedAt: new Date().toISOString(),
    items: items.map((i, idx) => ({
      sku: i.sku || generateSku(i, idx),
      description: i.description || i.name || "",
      qty: i.qty || 0,
      unitPrice: i.unitPrice || 0,
      itemNum: i.itemNum || idx + 1,
    })),
    totalValue: totalValue || 0,
    contractRef: arp || "",
    // NF-e address fields
    logradouro: logradouro || "",
    numero: numero || "S/N",
    complemento: complemento || "",
    bairro: bairro || "",
    cep: cep || "",
    uf: uf || "MG",
    ie: ie || "ISENTO",
    telefone: telefone || "",
    email: email || "",
  };

  // ─── Step 1: Ensure products exist in Tiny with NCM ───
  for (const item of order.items) {
    const ncmMatch = findNcm(item.description);
    if (!ncmMatch) continue; // skip items without NCM mapping

    const produto = {
      produto: {
        codigo: item.sku,
        nome: normalizeDescription(item.description),
        ncm: ncmMatch.ncm,
        unidade: "UN",
        preco: Number(item.unitPrice || 0),
        origem: "0", // Nacional
        tipo: "P",   // Produto
        situacao: "A", // Ativo
      },
    };

    const prodForm = new URLSearchParams();
    prodForm.set("token", token);
    prodForm.set("formato", "json");
    prodForm.set("produto", JSON.stringify(produto));

    try {
      // Try to create; if already exists Tiny returns error but that's OK
      await fetch("https://api.tiny.com.br/api2/produto.incluir.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: prodForm.toString(),
      });
    } catch (_e) {
      // Product sync is best-effort, don't block order
    }
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
      tinyRet.registros?.[0]?.registro?.id ||
      tinyRet.pedidos?.[0]?.pedido?.id ||
      parsed.order_id ||
      parsed.id ||
      `TINY-${Date.now()}`;

    return res.status(200).json({ success: true, olistOrderId: String(olistOrderId), provider: "tiny_api" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
