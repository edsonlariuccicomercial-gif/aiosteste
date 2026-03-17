// ─── Vercel API Route: Cadastro de Produtos no Tiny ERP ───
// POST /api/tiny-produtos

const NCM_MAP = [
  { keywords: ["embalagem", "plastica", "freezer"], ncm: "3923.29.90" },
  { keywords: ["isqueiro", "gas"], ncm: "9613.10.00" },
  { keywords: ["sabao", "barra"], ncm: "3401.19.00" },
  { keywords: ["vassoura", "nylon", "piacava"], ncm: "9603.10.00" },
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
  { keywords: ["guardanapo"], ncm: "4818.30.00" },
  { keywords: ["panela", "caldeira"], ncm: "7323.93.00" },
  { keywords: ["tinta", "acrilica", "parede"], ncm: "3209.10.00" },
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
  // ─── Hortifruti ───
  { keywords: ["alface"], ncm: "0705.11.00" },
  { keywords: ["tomate"], ncm: "0702.00.00" },
  { keywords: ["cebola"], ncm: "0703.10.19" },
  { keywords: ["cebolinha"], ncm: "0703.90.00" },
  { keywords: ["couve"], ncm: "0704.90.00" },
  { keywords: ["repolho"], ncm: "0704.90.00" },
  { keywords: ["batata"], ncm: "0701.90.00" },
  { keywords: ["cenoura"], ncm: "0706.10.00" },
  { keywords: ["beterraba"], ncm: "0706.90.00" },
  { keywords: ["chuchu"], ncm: "0709.99.00" },
  { keywords: ["abobora", "abobrinha", "moranga"], ncm: "0709.93.00" },
  { keywords: ["pimentao"], ncm: "0709.60.00" },
  { keywords: ["quiabo"], ncm: "0709.99.00" },
  { keywords: ["jilo"], ncm: "0709.99.00" },
  { keywords: ["mandioca", "aipim"], ncm: "0714.10.00" },
  { keywords: ["inhame", "cara"], ncm: "0714.40.00" },
  { keywords: ["banana"], ncm: "0803.10.00" },
  { keywords: ["laranja"], ncm: "0805.10.00" },
  { keywords: ["limao"], ncm: "0805.50.00" },
  { keywords: ["maca"], ncm: "0808.10.00" },
  { keywords: ["mamao"], ncm: "0807.20.00" },
  { keywords: ["melancia"], ncm: "0807.11.00" },
  { keywords: ["abacaxi"], ncm: "0804.30.00" },
  { keywords: ["manga"], ncm: "0804.50.20" },
  { keywords: ["alho"], ncm: "0703.20.10" },
  { keywords: ["cheiro", "verde", "salsa", "coentro"], ncm: "0709.99.00" },
  { keywords: ["milho", "espiga"], ncm: "0710.40.00" },
  // ─── Carnes e Proteínas ───
  { keywords: ["frango", "coxa", "sobrecoxa", "peito", "asa"], ncm: "0207.14.00" },
  { keywords: ["carne", "bovina", "acem", "patinho", "musculo"], ncm: "0201.30.00" },
  { keywords: ["carne", "suina", "porco", "lombo", "costela"], ncm: "0203.29.00" },
  { keywords: ["linguica", "calabresa"], ncm: "1601.00.00" },
  { keywords: ["salsicha"], ncm: "1601.00.00" },
  { keywords: ["ovo", "ovos", "galinha"], ncm: "0407.21.00" },
  { keywords: ["peixe", "tilapia", "merluza", "pescada"], ncm: "0304.89.00" },
  // ─── Laticínios ───
  { keywords: ["queijo", "mussarela", "prato"], ncm: "0406.10.10" },
  { keywords: ["requeijao"], ncm: "0406.10.90" },
  { keywords: ["iogurte"], ncm: "0403.10.00" },
  { keywords: ["creme", "leite"], ncm: "0401.40.10" },
  { keywords: ["leite", "condensado"], ncm: "0402.99.00" },
  { keywords: ["leite", "po"], ncm: "0402.21.10" },
  // ─── Temperos e Condimentos ───
  { keywords: ["colorau", "colorific", "urucum"], ncm: "0910.91.00" },
  { keywords: ["pimenta", "reino"], ncm: "0904.12.00" },
  { keywords: ["oregano"], ncm: "1211.90.90" },
  { keywords: ["louro"], ncm: "0910.99.00" },
  { keywords: ["cominho"], ncm: "0909.31.00" },
  { keywords: ["caldo", "galinha", "carne", "tempero"], ncm: "2104.10.11" },
  { keywords: ["mostarda"], ncm: "2103.30.21" },
  { keywords: ["maionese"], ncm: "2103.90.11" },
  { keywords: ["catchup", "ketchup"], ncm: "2103.20.10" },
  // ─── Grãos e Cereais ───
  { keywords: ["aveia"], ncm: "1104.12.00" },
  { keywords: ["granola"], ncm: "1904.20.00" },
  { keywords: ["ervilha"], ncm: "2005.40.00" },
  { keywords: ["milho", "conserva", "lata"], ncm: "2005.80.00" },
  { keywords: ["lentilha"], ncm: "0713.40.10" },
  { keywords: ["soja", "proteina"], ncm: "2106.10.00" },
  // ─── Materiais Escolares ───
  { keywords: ["caderno"], ncm: "4820.10.00" },
  { keywords: ["giz"], ncm: "2509.00.10" },
  { keywords: ["pincel", "atomico"], ncm: "9608.20.00" },
  { keywords: ["cartolina"], ncm: "4802.55.10" },
  { keywords: ["tnt", "tecido"], ncm: "5603.12.00" },
  // ─── Descartáveis ───
  { keywords: ["prato", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["talher", "garfo", "faca", "colher", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["marmitex", "marmita", "quentinha"], ncm: "7612.90.19" },
  { keywords: ["filme", "pvc", "plastico"], ncm: "3920.43.00" },
  { keywords: ["papel", "aluminio"], ncm: "7607.11.90" },
  // ─── Higiene Pessoal ───
  { keywords: ["shampoo", "xampu"], ncm: "3305.10.00" },
  { keywords: ["creme", "dental", "dentifricio"], ncm: "3306.10.00" },
  { keywords: ["escova", "dental", "dente"], ncm: "9603.21.00" },
  { keywords: ["fralda", "descartavel"], ncm: "9619.00.00" },
  { keywords: ["absorvente"], ncm: "9619.00.00" },
];

function findNcm(description) {
  const lower = (description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let best = null, bestScore = 0;
  for (const entry of NCM_MAP) {
    const score = entry.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

function generateSku(item, contractId) {
  const num = String(item.num || 1).padStart(3, "0");
  const prefix = (contractId || "000").replace(/[^0-9]/g, "").slice(-6).padStart(6, "0");
  const rand = String(Math.floor(Math.random() * 99)).padStart(2, "0");
  return `${prefix}${num}${rand}`;
}

function normalizeUnit(unidade) {
  const u = (unidade || "UN").toUpperCase().trim();
  const map = {
    "UNIDADE": "UN", "UNID": "UN", "UND": "UN", "UN": "UN",
    "CAIXA": "CX", "CX": "CX", "PACOTE": "PCT", "PCTE": "PCT", "PCT": "PCT",
    "METRO": "M", "MT": "M", "M": "M", "LITRO": "LT", "LT": "LT", "L": "LT",
    "KG": "KG", "QUILO": "KG", "ROLO": "RL", "RL": "RL",
    "RESMA": "RS", "RS": "RS", "GALAO": "GL", "GL": "GL",
    "FRASCO": "FR", "FR": "FR", "TUBO": "TB", "TB": "TB",
    "POTE": "PT", "PT": "PT", "SACO": "SC", "SC": "SC",
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
      return res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ─── Action: obter produto por ID ───
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
      return res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ─── Action default: cadastrar itens ───
  if (!itens || !itens.length) {
    return res.status(400).json({ success: false, error: "itens[] obrigatorio" });
  }

  // Pre-check: search existing products to skip duplicates (saves API calls)
  let existingCodes = new Set();
  try {
    for (let pg = 1; pg <= 3; pg++) {
      const searchForm = new URLSearchParams();
      searchForm.set("token", token);
      searchForm.set("formato", "json");
      searchForm.set("pesquisa", (contractId || "").replace(/[^A-Z0-9]/gi, "").slice(-6));
      searchForm.set("pagina", String(pg));
      const sr = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: searchForm.toString(),
      });
      const st = await sr.text();
      const sp = JSON.parse(st);
      const prods = sp.retorno?.produtos || [];
      prods.forEach(p => existingCodes.add((p.produto?.codigo || "").toUpperCase()));
      if (pg >= parseInt(sp.retorno?.numero_paginas || "1")) break;
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (_) { /* best-effort pre-check */ }

  const results = [];
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const ncmMatch = findNcm(item.descricao);
    const sku = item.codigo || item.sku || generateSku(item, contractId);
    const descricao = shortenDescription(item.descricao);
    const unidade = normalizeUnit(item.unidade);
    const ncm = item.ncm || (ncmMatch ? ncmMatch.ncm : "");

    // Skip if already exists in Tiny (saves an API call)
    if (existingCodes.has(sku.toUpperCase())) {
      results.push({ num: item.num, sku, descricao, ncm, status: "existente", error: "Ja cadastrado (detectado pre-check)" });
      continue;
    }

    const produto = {
      produto: {
        codigo: sku,
        nome: descricao,
        unidade: unidade,
        preco: Number(item.precoUnitario || 0).toFixed(2),
        ncm,
        origem: "0",
        tipo: "P",
        situacao: "A",
        classe_ipi: "",
        descricao_complementar: item.descricaoCompleta || "",
        marca: "Licit-AIX",
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
        results.push({ num: item.num, sku, descricao, ncm, status: "ok", tinyId });
      } else {
        const errMsg = ret.erros?.[0]?.erro || ret.erros?.[0] || ret.mensagem || "Erro desconhecido";
        const errStr = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg);
        if (errStr.toLowerCase().includes("ja cadastrado") || errStr.toLowerCase().includes("codigo ja existe")) {
          results.push({ num: item.num, sku, descricao, ncm, status: "existente", error: errStr });
        } else {
          results.push({ num: item.num, sku, descricao, ncm, status: "erro", error: errStr });
        }
      }
    } catch (err) {
      results.push({ num: item.num, sku, descricao, status: "erro", error: err.message });
    }

    // Tiny rate limit: ~30 req/min — wait 4s between creation calls
    if (i < itens.length - 1) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  const ok = results.filter(r => r.status === "ok").length;
  const existente = results.filter(r => r.status === "existente").length;
  const erros = results.filter(r => r.status === "erro").length;

  return res.status(200).json({
    success: true,
    summary: { total: itens.length, cadastrados: ok, existentes: existente, erros },
    results,
  });
}
