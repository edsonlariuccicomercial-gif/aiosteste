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
  // ─── Hortifruti ───
  { keywords: ["alface"], ncm: "0705.11.00", desc: "Alface" },
  { keywords: ["tomate"], ncm: "0702.00.00", desc: "Tomate" },
  { keywords: ["cebola"], ncm: "0703.10.19", desc: "Cebola" },
  { keywords: ["cebolinha"], ncm: "0703.90.00", desc: "Cebolinha" },
  { keywords: ["couve"], ncm: "0704.90.00", desc: "Couve" },
  { keywords: ["repolho"], ncm: "0704.90.00", desc: "Repolho" },
  { keywords: ["batata"], ncm: "0701.90.00", desc: "Batata" },
  { keywords: ["cenoura"], ncm: "0706.10.00", desc: "Cenoura" },
  { keywords: ["beterraba"], ncm: "0706.90.00", desc: "Beterraba" },
  { keywords: ["chuchu"], ncm: "0709.99.00", desc: "Chuchu" },
  { keywords: ["abobora", "abobrinha", "moranga"], ncm: "0709.93.00", desc: "Abobora" },
  { keywords: ["pimentao"], ncm: "0709.60.00", desc: "Pimentao" },
  { keywords: ["quiabo"], ncm: "0709.99.00", desc: "Quiabo" },
  { keywords: ["jiló", "jilo"], ncm: "0709.99.00", desc: "Jilo" },
  { keywords: ["mandioca", "aipim"], ncm: "0714.10.00", desc: "Mandioca" },
  { keywords: ["inhame", "cara"], ncm: "0714.40.00", desc: "Inhame" },
  { keywords: ["banana"], ncm: "0803.10.00", desc: "Banana" },
  { keywords: ["laranja"], ncm: "0805.10.00", desc: "Laranja" },
  { keywords: ["limao"], ncm: "0805.50.00", desc: "Limao" },
  { keywords: ["maca", "maça"], ncm: "0808.10.00", desc: "Maca" },
  { keywords: ["mamao"], ncm: "0807.20.00", desc: "Mamao" },
  { keywords: ["melancia"], ncm: "0807.11.00", desc: "Melancia" },
  { keywords: ["abacaxi"], ncm: "0804.30.00", desc: "Abacaxi" },
  { keywords: ["manga"], ncm: "0804.50.20", desc: "Manga" },
  { keywords: ["alho"], ncm: "0703.20.10", desc: "Alho" },
  { keywords: ["cheiro", "verde", "salsa", "coentro"], ncm: "0709.99.00", desc: "Cheiro Verde" },
  { keywords: ["milho", "espiga"], ncm: "0710.40.00", desc: "Milho Verde" },
  // ─── Carnes e Proteínas ───
  { keywords: ["frango", "coxa", "sobrecoxa", "peito", "asa"], ncm: "0207.14.00", desc: "Frango" },
  { keywords: ["carne", "bovina", "acém", "acem", "patinho", "musculo"], ncm: "0201.30.00", desc: "Carne Bovina" },
  { keywords: ["carne", "suina", "porco", "lombo", "costela"], ncm: "0203.29.00", desc: "Carne Suina" },
  { keywords: ["linguica", "calabresa"], ncm: "1601.00.00", desc: "Linguica" },
  { keywords: ["salsicha"], ncm: "1601.00.00", desc: "Salsicha" },
  { keywords: ["ovo", "ovos", "galinha"], ncm: "0407.21.00", desc: "Ovos" },
  { keywords: ["peixe", "tilapia", "merluza", "pescada"], ncm: "0304.89.00", desc: "Peixe" },
  // ─── Laticínios ───
  { keywords: ["queijo", "mussarela", "muçarela", "prato"], ncm: "0406.10.10", desc: "Queijo" },
  { keywords: ["requeijao"], ncm: "0406.10.90", desc: "Requeijao" },
  { keywords: ["iogurte"], ncm: "0403.10.00", desc: "Iogurte" },
  { keywords: ["creme", "leite"], ncm: "0401.40.10", desc: "Creme de Leite" },
  { keywords: ["leite", "condensado"], ncm: "0402.99.00", desc: "Leite Condensado" },
  { keywords: ["leite", "po"], ncm: "0402.21.10", desc: "Leite em Po" },
  // ─── Temperos e Condimentos ───
  { keywords: ["colorau", "colorific", "urucum"], ncm: "0910.91.00", desc: "Colorau" },
  { keywords: ["pimenta", "reino"], ncm: "0904.12.00", desc: "Pimenta do Reino" },
  { keywords: ["oregano"], ncm: "1211.90.90", desc: "Oregano" },
  { keywords: ["louro"], ncm: "0910.99.00", desc: "Louro" },
  { keywords: ["cominho"], ncm: "0909.31.00", desc: "Cominho" },
  { keywords: ["caldo", "galinha", "carne", "tempero"], ncm: "2104.10.11", desc: "Caldo/Tempero" },
  { keywords: ["mostarda"], ncm: "2103.30.21", desc: "Mostarda" },
  { keywords: ["maionese"], ncm: "2103.90.11", desc: "Maionese" },
  { keywords: ["catchup", "ketchup"], ncm: "2103.20.10", desc: "Ketchup" },
  // ─── Grãos e Cereais ───
  { keywords: ["aveia"], ncm: "1104.12.00", desc: "Aveia" },
  { keywords: ["granola"], ncm: "1904.20.00", desc: "Granola" },
  { keywords: ["ervilha"], ncm: "2005.40.00", desc: "Ervilha em Conserva" },
  { keywords: ["milho", "conserva", "lata"], ncm: "2005.80.00", desc: "Milho em Conserva" },
  { keywords: ["lentilha"], ncm: "0713.40.10", desc: "Lentilha" },
  { keywords: ["soja", "proteina"], ncm: "2106.10.00", desc: "Proteina de Soja" },
  // ─── Materiais Escolares ───
  { keywords: ["caderno"], ncm: "4820.10.00", desc: "Caderno" },
  { keywords: ["giz"], ncm: "2509.00.10", desc: "Giz" },
  { keywords: ["pincel", "atomico"], ncm: "9608.20.00", desc: "Pincel Atomico" },
  { keywords: ["cartolina"], ncm: "4802.55.10", desc: "Cartolina" },
  { keywords: ["tnt", "tecido"], ncm: "5603.12.00", desc: "TNT" },
  // ─── Descartáveis ───
  { keywords: ["prato", "descartavel"], ncm: "3924.10.00", desc: "Prato Descartavel" },
  { keywords: ["talher", "garfo", "faca", "colher", "descartavel"], ncm: "3924.10.00", desc: "Talher Descartavel" },
  { keywords: ["marmitex", "marmita", "quentinha"], ncm: "7612.90.19", desc: "Marmitex" },
  { keywords: ["filme", "pvc", "plastico"], ncm: "3920.43.00", desc: "Filme PVC" },
  { keywords: ["papel", "aluminio"], ncm: "7607.11.90", desc: "Papel Aluminio" },
  // ─── Higiene Pessoal ───
  { keywords: ["shampoo", "xampu"], ncm: "3305.10.00", desc: "Shampoo" },
  { keywords: ["creme", "dental", "dentifricio"], ncm: "3306.10.00", desc: "Creme Dental" },
  { keywords: ["escova", "dental", "dente"], ncm: "9603.21.00", desc: "Escova Dental" },
  { keywords: ["fralda", "descartavel"], ncm: "9619.00.00", desc: "Fralda Descartavel" },
  { keywords: ["absorvente"], ncm: "9619.00.00", desc: "Absorvente" },
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

function normalizeUnit(unidade) {
  const u = (unidade || "UN").toUpperCase().trim();
  const map = {
    "UNIDADE": "UN", "UNID": "UN", "UND": "UN", "UN": "UN",
    "CAIXA": "CX", "CX": "CX", "PACOTE": "PCT", "PCTE": "PCT", "PCT": "PCT",
    "METRO": "M", "MT": "M", "M": "M", "LITRO": "LT", "LT": "LT", "L": "LT",
    "KG": "KG", "QUILO": "KG", "QUILOGRAMA": "KG", "ROLO": "RL", "RL": "RL",
    "RESMA": "RS", "RS": "RS", "GALAO": "GL", "GL": "GL",
    "FRASCO": "FR", "FR": "FR", "TUBO": "TB", "TB": "TB",
    "POTE": "PT", "PT": "PT", "SACO": "SC", "SC": "SC",
    "DUZIA": "DZ", "DZ": "DZ", "BANDEJA": "BD", "BD": "BD",
  };
  return map[u] || u.slice(0, 3);
}

function generateSku(item, index, contractId) {
  // Tiny ERP requires numeric-only codigo
  const num = String(item.itemNum || index + 1).padStart(3, "0");
  const prefix = (contractId || "000000").replace(/[^0-9]/g, "").slice(-6).padStart(6, "0");
  const rand = String(Math.floor(Math.random() * 99)).padStart(2, "0");
  return `${prefix}${num}${rand}`;
}

// ─── Search existing product in Tiny by name similarity ───
async function searchTinyProduct(token, description) {
  const lower = (description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Extract 1-2 main words for search (skip short words)
  const words = lower.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3);
  const searchTerm = words.slice(0, 2).join(" ");
  if (!searchTerm) return null;

  try {
    const form = new URLSearchParams();
    form.set("token", token);
    form.set("formato", "json");
    form.set("pesquisa", searchTerm);
    form.set("pagina", "1");

    const resp = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await resp.text();
    const parsed = JSON.parse(text);
    const produtos = parsed.retorno?.produtos || [];
    if (!produtos.length) return null;

    // Score each result by word overlap with our description
    let bestProduct = null;
    let bestScore = 0;
    for (const p of produtos) {
      const nome = (p.produto?.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let score = 0;
      for (const w of words) {
        if (nome.includes(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestProduct = p.produto;
      }
    }

    // Require at least 1 word match to consider it a valid match
    if (bestScore >= 1 && bestProduct) {
      return {
        codigo: bestProduct.codigo || "",
        ncm: bestProduct.ncm || "",
        nome: bestProduct.nome || "",
        id: bestProduct.id || "",
      };
    }
    return null;
  } catch (_e) {
    return null; // search is best-effort
  }
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
    // Use SKU as-is (already resolved in Step 1)
    let codigo = String(item.sku || "").trim();
    if (!codigo) codigo = generateSku(item, idx, order.contractRef || order.id);
    // NCM priority: local map > inherited from Tiny > empty
    const ncm = (ncmMatch ? ncmMatch.ncm : "") || item._tinyNcm || "";
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
  // Prefer cliente object (sent by gdp-contratos) over flat fields (sent by portal)
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
    // NF-e address fields (prefer cliente object over flat fields)
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

  // ─── Step 1: Ensure all items have a valid SKU ───
  const ncmAlerts = [];
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    const ncmMatch = findNcm(item.description);
    const ncmCode = ncmMatch ? ncmMatch.ncm : "";
    if (!ncmCode) {
      ncmAlerts.push({ item: item.itemNum || i + 1, description: item.description });
    }

    // If item already has SKU, skip Tiny product search/creation
    if (item.sku && String(item.sku).trim()) {
      continue;
    }

    // No SKU — search Tiny for existing product
    const existing = await searchTinyProduct(token, item.description);
    if (existing && existing.codigo) {
      item.sku = existing.codigo;
      if (!ncmMatch && existing.ncm) item._tinyNcm = existing.ncm;
    } else {
      // Not found — generate SKU and create product in Tiny
      item.sku = generateSku(item, i, arp || orderId);
      const produto = {
        produto: {
          codigo: item.sku,
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

    // Tiny rate limit
    if (i < order.items.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
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

    const result = { success: true, olistOrderId: String(olistOrderId), provider: "tiny_api" };
    if (ncmAlerts.length > 0) {
      result.ncmAlerts = ncmAlerts;
      result.ncmWarning = `${ncmAlerts.length} item(ns) sem NCM — corrigir no Tiny antes de emitir NF-e`;
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
