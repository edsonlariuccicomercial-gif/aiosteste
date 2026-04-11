// ─── Netlify Function: Cadastro de Produtos no Tiny ERP ───
// Recebe array de itens de contrato e cadastra como produtos no Tiny
// POST /.netlify/functions/tiny-produtos

// ─── NCM Mapping Table ───
const NCM_MAP = [
  { keywords: ["embalagem", "plastica", "freezer", "saco"], ncm: "3923.29.90" },
  { keywords: ["isqueiro", "gas"], ncm: "9613.10.00" },
  { keywords: ["sabao", "barra"], ncm: "3401.19.00" },
  { keywords: ["vassoura", "nylon", "piacava", "piaçava"], ncm: "9603.10.00" },
  { keywords: ["cloro", "gel"], ncm: "2828.90.11" },
  { keywords: ["lixeira", "plastica", "pedal"], ncm: "3924.90.00" },
  { keywords: ["escova", "alimentos", "legumes"], ncm: "9603.90.00" },
  { keywords: ["rodo", "magico", "refil"], ncm: "9603.90.00" },
  { keywords: ["mangueira", "jardim"], ncm: "3917.39.00" },
  { keywords: ["detergente"], ncm: "3402.20.00" },
  { keywords: ["agua", "sanitaria"], ncm: "2828.90.11" },
  { keywords: ["esponja"], ncm: "3926.90.90" },
  { keywords: ["pano", "chao"], ncm: "6307.10.00" },
  { keywords: ["desinfetante"], ncm: "3808.94.19" },
  { keywords: ["luva", "latex", "borracha"], ncm: "4015.19.00" },
  { keywords: ["papel", "higienico"], ncm: "4818.10.00" },
  { keywords: ["papel", "toalha"], ncm: "4818.20.00" },
  { keywords: ["saco", "lixo"], ncm: "3923.29.90" },
  { keywords: ["balde"], ncm: "3924.10.00" },
  { keywords: ["alcool"], ncm: "2207.10.90" },
  { keywords: ["sabonete"], ncm: "3401.11.90" },
  { keywords: ["cera", "piso"], ncm: "3405.40.00" },
  { keywords: ["amaciante"], ncm: "3809.91.90" },
  { keywords: ["limpador", "multiuso"], ncm: "3402.20.00" },
  { keywords: ["inseticida"], ncm: "3808.91.99" },
  { keywords: ["ventilador"], ncm: "8414.51.90" },
  { keywords: ["bebedouro"], ncm: "8418.69.99" },
  { keywords: ["cadeira", "escolar"], ncm: "9401.80.00" },
  { keywords: ["mesa", "escolar"], ncm: "9403.70.00" },
  { keywords: ["quadro", "branco", "lousa"], ncm: "9610.00.00" },
  { keywords: ["caneta", "pilot", "marcador"], ncm: "9608.20.00" },
  { keywords: ["apagador"], ncm: "9603.90.00" },
  { keywords: ["lampada", "led"], ncm: "8539.50.00" },
  { keywords: ["tomada", "extensao", "filtro", "linha"], ncm: "8536.69.90" },
  { keywords: ["cadeado"], ncm: "8301.10.00" },
  { keywords: ["toner", "cartucho", "impressora"], ncm: "8443.99.33" },
  { keywords: ["resma", "sulfite", "a4"], ncm: "4802.56.10" },
  { keywords: ["grampeador"], ncm: "8472.90.29" },
  { keywords: ["tesoura"], ncm: "8213.00.00" },
  { keywords: ["cola", "branca", "bastao"], ncm: "3506.10.90" },
  { keywords: ["fita", "adesiva", "durex", "crepe"], ncm: "3919.10.00" },
  { keywords: ["clips", "clipe"], ncm: "7319.90.00" },
  { keywords: ["borracha", "apagar"], ncm: "4016.92.00" },
  { keywords: ["lapis"], ncm: "9609.10.00" },
  { keywords: ["caneta", "esferografica"], ncm: "9608.10.00" },
  { keywords: ["envelope"], ncm: "4817.10.00" },
  { keywords: ["pasta", "arquivo"], ncm: "4819.60.00" },
  { keywords: ["copo", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["prato", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["garfo", "descartavel", "talher"], ncm: "3924.10.00" },
  { keywords: ["guardanapo"], ncm: "4818.30.00" },
  { keywords: ["toalha", "mesa"], ncm: "6302.53.00" },
  { keywords: ["panela", "caldeira"], ncm: "7323.93.00" },
  { keywords: ["concha", "escumadeira", "colher", "servir"], ncm: "7323.93.00" },
  { keywords: ["tinta", "acrilica", "parede"], ncm: "3209.10.00" },
  { keywords: ["pincel", "rolo", "pintura"], ncm: "9603.40.10" },
  { keywords: ["vassoura", "gari"], ncm: "9603.10.00" },
  { keywords: ["pa", "lixo"], ncm: "7323.99.00" },
  { keywords: ["dispenser", "sabonete", "papel"], ncm: "3924.90.00" },
  // ─── Alimentícios ───
  { keywords: ["acucar", "cristal", "refinado"], ncm: "1701.14.00" },
  { keywords: ["biscoito", "bolacha", "cream cracker"], ncm: "1905.31.00" },
  { keywords: ["cacau", "chocolate", "achocolatado"], ncm: "1805.00.00" },
  { keywords: ["extrato", "tomate", "molho"], ncm: "2002.90.00" },
  { keywords: ["feijao", "carioca", "preto"], ncm: "0713.33.19" },
  { keywords: ["polvilho", "amido", "mandioca"], ncm: "1108.14.00" },
  { keywords: ["sal", "refinado", "iodado"], ncm: "2501.00.20" },
  { keywords: ["pao", "frances", "forma"], ncm: "1905.90.10" },
  { keywords: ["rosca", "rosquinha"], ncm: "1905.90.90" },
  { keywords: ["arroz"], ncm: "1006.30.21" },
  { keywords: ["macarrao", "espaguete", "massa"], ncm: "1902.19.00" },
  { keywords: ["oleo", "soja", "vegetal"], ncm: "1507.90.11" },
  { keywords: ["cafe", "torrado", "moido"], ncm: "0901.21.00" },
  { keywords: ["leite", "integral", "desnatado"], ncm: "0401.10.10" },
  { keywords: ["farinha", "trigo"], ncm: "1101.00.10" },
  { keywords: ["margarina", "manteiga"], ncm: "1517.10.00" },
  { keywords: ["vinagre"], ncm: "2209.00.00" },
  { keywords: ["fuba", "milho", "quirera"], ncm: "1102.20.00" },
  { keywords: ["sardinha", "atum", "conserva"], ncm: "1604.13.10" },
  { keywords: ["suco", "refresco", "nectar"], ncm: "2009.89.90" },
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

function generateSku(item, contractId) {
  const num = String(item.num || 1).padStart(3, "0");
  const words = (item.descricao || "ITEM")
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !["COM", "PARA", "POR", "QUE", "DOS", "DAS", "MINIMA", "MINIMO", "CAPACIDADE"].includes(w))
    .slice(0, 3)
    .join("-");
  const prefix = (contractId || "CTR").replace(/[^A-Z0-9]/gi, "").slice(-6);
  return `${prefix}-${num}-${words || "PROD"}`;
}

function normalizeUnit(unidade) {
  const u = (unidade || "UN").toUpperCase().trim();
  const map = {
    "UNIDADE": "UN", "UNID": "UN", "UND": "UN", "UN": "UN",
    "CAIXA": "CX", "CX": "CX",
    "PACOTE": "PCT", "PCTE": "PCT", "PCT": "PCT",
    "METRO": "M", "MT": "M", "M": "M",
    "LITRO": "LT", "LT": "LT", "L": "LT",
    "KG": "KG", "QUILO": "KG",
    "ROLO": "RL", "RL": "RL",
    "RESMA": "RS", "RS": "RS",
    "GALAO": "GL", "GL": "GL",
    "FRASCO": "FR", "FR": "FR",
    "TUBO": "TB", "TB": "TB",
    "POTE": "PT", "PT": "PT",
    "SACO": "SC", "SC": "SC",
  };
  return map[u] || u.slice(0, 3);
}

function shortenDescription(desc) {
  let s = (desc || "").trim();
  s = s.replace(/:+\s*$/, "").trim();
  s = s.replace(/\bCOM\s+CAPACIDADE\s+M[IÍ]NIMA\s+DE\s+/ig, "").trim();
  s = s.replace(/\bDE\s+PRIMEIRA\s+QUALIDADE\b/ig, "").trim();
  s = s.replace(/\bDE\s+BOA\s+QUALIDADE\b/ig, "").trim();
  if (s.length > 120) s = s.substring(0, 117) + "...";
  return s;
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
  try { body = JSON.parse(event.body); } catch (_) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "JSON invalido" }) };
  }

  const { itens, contractId, action } = body;

  // ─── Action: listar produtos existentes ───
  if (action === "listar") {
    try {
      const form = new URLSearchParams();
      form.set("token", token);
      form.set("formato", "json");
      form.set("pesquisa", body.pesquisa || "");
      form.set("pagina", String(body.pagina || 1));

      const resp = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: parsed }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  // ─── Action: obter produto por codigo ───
  if (action === "obter") {
    try {
      const form = new URLSearchParams();
      form.set("token", token);
      form.set("formato", "json");
      form.set("id", String(body.id || ""));

      const resp = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: parsed }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  // ─── Action default: cadastrar itens ───
  if (!itens || !itens.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "itens[] obrigatorio" }) };
  }

  const results = [];
  // Tiny API has rate limit — process sequentially with small delay
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const ncmMatch = findNcm(item.descricao);
    const sku = item.codigo || generateSku(item, contractId);
    const descricao = shortenDescription(item.descricao);
    const unidade = normalizeUnit(item.unidade);

    const produto = {
      produto: {
        codigo: sku,
        nome: descricao,
        unidade: unidade,
        preco: Number(item.precoUnitario || 0).toFixed(2),
        ncm: item.ncm || (ncmMatch ? ncmMatch.ncm : ""),
        origem: "0",       // 0 = Nacional
        tipo: "P",         // P = Produto
        situacao: "A",     // A = Ativo
        classe_ipi: "",
        descricao_complementar: item.descricaoCompleta || "",
      },
    };

    const form = new URLSearchParams();
    form.set("token", token);
    form.set("formato", "json");
    form.set("produto", JSON.stringify(produto));

    try {
      const resp = await fetch("https://api.tiny.com.br/api2/produto.incluir.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }

      const ret = parsed.retorno || {};
      const status = String(ret.status || "").toLowerCase();

      if (status === "ok") {
        const tinyId = ret.registros?.[0]?.registro?.id || ret.id || null;
        results.push({ num: item.num, sku, descricao, ncm: produto.produto.ncm, status: "ok", tinyId });
      } else {
        const errMsg = ret.erros?.[0]?.erro || ret.erros?.[0] || ret.mensagem || "Erro desconhecido";
        const errStr = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg);
        // If "already exists", treat as success
        if (errStr.toLowerCase().includes("ja cadastrado") || errStr.toLowerCase().includes("codigo ja existe")) {
          results.push({ num: item.num, sku, descricao, ncm: produto.produto.ncm, status: "existente", error: errStr });
        } else {
          results.push({ num: item.num, sku, descricao, ncm: produto.produto.ncm, status: "erro", error: errStr });
        }
      }
    } catch (err) {
      results.push({ num: item.num, sku, descricao, status: "erro", error: err.message });
    }

    // Tiny rate limit: ~30 requests/minute — wait 3s between calls to avoid blocks
    if (i < itens.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  const ok = results.filter(r => r.status === "ok").length;
  const existente = results.filter(r => r.status === "existente").length;
  const erros = results.filter(r => r.status === "erro").length;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      summary: { total: itens.length, cadastrados: ok, existentes: existente, erros },
      results,
    }),
  };
};
