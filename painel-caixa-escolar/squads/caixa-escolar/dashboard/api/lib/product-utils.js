// ─── Módulo Compartilhado: Product Utils ───
// ADR-001: Unifica lógica de produto entre order.js e tiny-produtos.js
// Source of truth: Tiny ERP (este módulo é o único ponto de manutenção)

// ─── NCM Mapping Table (SUPERSET unificado) ───
// Merge de order.js (129 entradas) + tiny-produtos.js (158 entradas)
export const NCM_MAP = [
  // ─── Limpeza ───
  { keywords: ["embalagem", "plastica", "freezer", "saco"], ncm: "3923.29.90", desc: "Embalagem Plastica Freezer" },
  { keywords: ["isqueiro", "gas"], ncm: "9613.10.00", desc: "Isqueiro a Gas" },
  { keywords: ["sabao", "barra"], ncm: "3401.19.00", desc: "Sabao em Barra" },
  { keywords: ["vassoura", "nylon", "piacava"], ncm: "9603.10.00", desc: "Vassoura de Nylon" },
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
  { keywords: ["cera", "piso"], ncm: "3405.40.00", desc: "Cera para Piso" },
  { keywords: ["amaciante"], ncm: "3809.91.90", desc: "Amaciante de Roupas" },
  { keywords: ["limpador", "multiuso"], ncm: "3402.20.00", desc: "Limpador Multiuso" },
  { keywords: ["inseticida"], ncm: "3808.91.99", desc: "Inseticida" },
  { keywords: ["vassoura", "gari"], ncm: "9603.10.00", desc: "Vassoura de Gari" },
  { keywords: ["pa", "lixo"], ncm: "7323.99.00", desc: "Pa de Lixo" },
  { keywords: ["dispenser", "sabonete", "papel"], ncm: "3924.90.00", desc: "Dispenser" },
  // ─── Mobiliário e Equipamentos (só em tiny-produtos.js) ───
  { keywords: ["ventilador"], ncm: "8414.51.90", desc: "Ventilador" },
  { keywords: ["bebedouro"], ncm: "8418.69.99", desc: "Bebedouro" },
  { keywords: ["cadeira", "escolar"], ncm: "9401.80.00", desc: "Cadeira Escolar" },
  { keywords: ["mesa", "escolar"], ncm: "9403.70.00", desc: "Mesa Escolar" },
  { keywords: ["quadro", "branco", "lousa"], ncm: "9610.00.00", desc: "Quadro Branco" },
  { keywords: ["lampada", "led"], ncm: "8539.50.00", desc: "Lampada LED" },
  { keywords: ["tomada", "extensao", "filtro", "linha"], ncm: "8536.69.90", desc: "Extensao Eletrica" },
  { keywords: ["cadeado"], ncm: "8301.10.00", desc: "Cadeado" },
  { keywords: ["tinta", "acrilica", "parede"], ncm: "3209.10.00", desc: "Tinta Acrilica" },
  { keywords: ["panela", "caldeira"], ncm: "7323.93.00", desc: "Panela" },
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
  { keywords: ["jilo", "jiló"], ncm: "0709.99.00", desc: "Jilo" },
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
  { keywords: ["caneta", "pilot", "marcador"], ncm: "9608.20.00", desc: "Caneta Marcador" },
  { keywords: ["caneta", "esferografica"], ncm: "9608.10.00", desc: "Caneta Esferografica" },
  { keywords: ["apagador"], ncm: "9603.90.00", desc: "Apagador" },
  { keywords: ["toner", "cartucho", "impressora"], ncm: "8443.99.33", desc: "Toner/Cartucho" },
  { keywords: ["resma", "sulfite", "a4"], ncm: "4802.56.10", desc: "Resma Sulfite A4" },
  { keywords: ["grampeador"], ncm: "8472.90.29", desc: "Grampeador" },
  { keywords: ["tesoura"], ncm: "8213.00.00", desc: "Tesoura" },
  { keywords: ["cola", "branca", "bastao"], ncm: "3506.10.90", desc: "Cola" },
  { keywords: ["fita", "adesiva", "durex", "crepe"], ncm: "3919.10.00", desc: "Fita Adesiva" },
  { keywords: ["clips", "clipe"], ncm: "7319.90.00", desc: "Clips" },
  { keywords: ["borracha", "apagar"], ncm: "4016.92.00", desc: "Borracha" },
  { keywords: ["lapis"], ncm: "9609.10.00", desc: "Lapis" },
  { keywords: ["envelope"], ncm: "4817.10.00", desc: "Envelope" },
  { keywords: ["pasta", "arquivo"], ncm: "4819.60.00", desc: "Pasta Arquivo" },
  // ─── Descartáveis ───
  { keywords: ["prato", "descartavel"], ncm: "3924.10.00", desc: "Prato Descartavel" },
  { keywords: ["copo", "descartavel"], ncm: "3924.10.00", desc: "Copo Descartavel" },
  { keywords: ["talher", "garfo", "faca", "colher", "descartavel"], ncm: "3924.10.00", desc: "Talher Descartavel" },
  { keywords: ["marmitex", "marmita", "quentinha"], ncm: "7612.90.19", desc: "Marmitex" },
  { keywords: ["filme", "pvc", "plastico"], ncm: "3920.43.00", desc: "Filme PVC" },
  { keywords: ["papel", "aluminio"], ncm: "7607.11.90", desc: "Papel Aluminio" },
  { keywords: ["guardanapo"], ncm: "4818.30.00", desc: "Guardanapo" },
  // ─── Higiene Pessoal ───
  { keywords: ["shampoo", "xampu"], ncm: "3305.10.00", desc: "Shampoo" },
  { keywords: ["creme", "dental", "dentifricio"], ncm: "3306.10.00", desc: "Creme Dental" },
  { keywords: ["escova", "dental", "dente"], ncm: "9603.21.00", desc: "Escova Dental" },
  { keywords: ["fralda", "descartavel"], ncm: "9619.00.00", desc: "Fralda Descartavel" },
  { keywords: ["absorvente"], ncm: "9619.00.00", desc: "Absorvente" },
];

// ─── NCM Lookup ───
export function findNcm(description) {
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

// ─── Unit Normalization (ADR-001 D4: GATE-1) ───
const UNIT_MAP = {
  "UNIDADE": "UN", "UNID": "UN", "UND": "UN", "UN": "UN",
  "CAIXA": "CX", "CX": "CX",
  "PACOTE": "PCT", "PCTE": "PCT", "PCT": "PCT",
  "METRO": "M", "MT": "M", "M": "M",
  "LITRO": "LT", "LT": "LT", "L": "LT", "LITROS": "LT", "LTS": "LT",
  "KG": "KG", "QUILO": "KG", "QUILOS": "KG", "QUILOGRAMA": "KG", "KILOGRAMA": "KG", "KILO": "KG",
  "GRAMAS": "G", "GRAMA": "G", "GR": "G", "G": "G",
  "GARRAFA": "GF", "GF": "GF",
  "FARDO": "FD", "FD": "FD",
  "SACHE": "SC", "SACHÊ": "SC",
  "LATA": "LA", "LA": "LA",
  "ROLO": "RL", "RL": "RL",
  "RESMA": "RS", "RS": "RS",
  "GALAO": "GL", "GL": "GL",
  "FRASCO": "FR", "FR": "FR",
  "TUBO": "TB", "TB": "TB",
  "POTE": "PT", "PT": "PT",
  "SACO": "SC", "SC": "SC",
  "DUZIA": "DZ", "DZ": "DZ",
  "BANDEJA": "BD", "BD": "BD",
};

// Exportar mapa para uso em validações de frontend
export { UNIT_MAP };

/**
 * Normaliza unidade para código Tiny ERP.
 * @param {string} unidade - Unidade bruta (ex: "Quilograma", "FARDO")
 * @param {object} [options] - Opções
 * @param {boolean} [options.strict=false] - Se true, retorna null para unidades desconhecidas (GATE-1)
 * @returns {string|null} Código normalizado ou null em modo strict
 */
export function normalizeUnit(unidade, options = {}) {
  const u = (unidade || "UN").toUpperCase().trim();
  const result = UNIT_MAP[u];
  if (!result) {
    console.warn(`[normalizeUnit] Unidade desconhecida: "${unidade}" → ${options.strict ? "BLOQUEADO" : `truncando para "${u.slice(0, 3)}"`}`);
    if (options.strict) return null;
    return u.slice(0, 3);
  }
  return result;
}

// ─── SKU Generation (assinatura unificada) ───
/**
 * Gera SKU numérico para produto novo no Tiny.
 * @param {object} item - Item com .num ou .itemNum
 * @param {number} index - Índice do item no array
 * @param {string} contractId - ID do contrato (ex: "CTR-20260318-1234")
 * @returns {string} SKU numérico de 11 dígitos
 */
export function generateSku(item, index, contractId) {
  const num = String(item.num || item.itemNum || index + 1).padStart(3, "0");
  const prefix = (contractId || "000000").replace(/[^0-9]/g, "").slice(-6).padStart(6, "0");
  const rand = String(Math.floor(Math.random() * 99)).padStart(2, "0");
  return `${prefix}${num}${rand}`;
}

// ─── Description Utilities ───
export function extractTraits(description) {
  const traits = [];
  const lower = (description || "").toLowerCase();
  const cap = description.match(/\b(\d+)\s*(litros?|lts?|[mk]?g|ml)\b/i);
  if (cap) traits.push(cap[0].trim());
  const dim = description.match(/\b\d+[,.]?\d*\s*(?:cm|mm|m)\s*[xX]\s*\d+[,.]?\d*\s*(?:cm|mm|m)\b/i);
  if (dim) traits.push(dim[0].trim());
  const pack = description.match(/\b(?:pcte|pacote|pct)\s*(?:com|c\/)?\s*(\d+)\s*(?:un(?:idades?)?)?/i)
    || description.match(/\bcom\s+(\d+)\s+un(?:idades?)?\b/i)
    || description.match(/\bc\/\s*(\d+)\s*un/i);
  if (pack) traits.push(`Pcte c/ ${pack[1]}un`);
  const colors = ["branca", "branco", "azul", "verde", "amarela", "amarelo", "preta", "preto", "vermelha", "vermelho", "rosa", "transparente"];
  for (const c of colors) {
    if (lower.includes(c)) { traits.push(c.charAt(0).toUpperCase() + c.slice(1)); break; }
  }
  const meters = description.match(/\b(\d+)\s*(?:metros?|mts?)\b/i);
  if (meters && !dim) traits.push(`${meters[1]}m`);
  return traits;
}

export function normalizeDescription(description) {
  const match = findNcm(description);
  if (!match) return shortenDescription(description);
  const traits = extractTraits(description);
  if (traits.length === 0) return match.desc;
  const full = `${match.desc} ${traits.join(" ")}`;
  return full.length > 120 ? full.substring(0, 117) + "..." : full;
}

export function shortenDescription(desc) {
  let s = (desc || "").trim();
  s = s.replace(/:+\s*$/, "").trim();
  s = s.replace(/\bCOM\s+CAPACIDADE\s+M[IÍ]NIMA\s+DE\s+/ig, "").trim();
  s = s.replace(/\bDE\s+PRIMEIRA\s+QUALIDADE\b/ig, "").trim();
  s = s.replace(/\bDE\s+BOA\s+QUALIDADE\b/ig, "").trim();
  if (s.length > 120) s = s.substring(0, 117) + "...";
  return s;
}

// ─── Tiny Product Search (versão unificada com fallback produto.obter.php) ───
/**
 * Busca produto existente no Tiny por nome (similaridade por palavras).
 * Inclui fallback para produto.obter.php se unidade não vier na pesquisa.
 * @param {string} token - TINY_API_TOKEN
 * @param {string} description - Descrição do produto para buscar
 * @returns {Promise<{codigo:string, ncm:string, nome:string, id:string, unidade:string}|null>}
 */
export async function searchTinyProduct(token, description) {
  const lower = (description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

    if (bestScore >= 1 && bestProduct) {
      // Fallback: buscar detalhes se unidade não veio na pesquisa
      if (!bestProduct.unidade && bestProduct.id) {
        try {
          await new Promise(r => setTimeout(r, 1500));
          const detForm = new URLSearchParams();
          detForm.set("token", token);
          detForm.set("formato", "json");
          detForm.set("id", bestProduct.id);
          const detResp = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: detForm.toString(),
          });
          const detParsed = JSON.parse(await detResp.text());
          const fullProd = detParsed.retorno?.produto;
          if (fullProd) {
            bestProduct.unidade = fullProd.unidade || "";
            if (!bestProduct.ncm && fullProd.ncm) bestProduct.ncm = fullProd.ncm;
          }
        } catch (_e) { /* best-effort */ }
      }
      return {
        codigo: bestProduct.codigo || "",
        ncm: bestProduct.ncm || "",
        nome: bestProduct.nome || "",
        id: bestProduct.id || "",
        unidade: bestProduct.unidade || "",
      };
    }
    return null;
  } catch (_e) {
    return null;
  }
}

// ─── Similaridade de texto (ADR-001 D5) ───
/**
 * Normaliza texto para comparação: lowercase, remove acentos e pontuação.
 */
function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Tokeniza texto em palavras significativas (>2 chars).
 */
function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter(w => w.length > 2);
}

/**
 * Calcula similaridade entre duas descrições (Jaccard-like).
 * @param {string} a - Descrição A
 * @param {string} b - Descrição B
 * @returns {number} Score de 0.0 a 1.0
 */
export function similaridade(a, b) {
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const intersection = wordsA.filter(w => wordsB.includes(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Date Utility ───
export function toBrDate(value) {
  const now = new Date();
  if (!value) {
    return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
