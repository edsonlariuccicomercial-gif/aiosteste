/* AUTO-GERADO de radar-matcher-core.js — NÃO editar à mão.
   Twin de browser (classic script) do core ESM. Regenerar com:
   node server-lib/build-radar-core-browser.js */
(function (root) {
  "use strict";
// ─── Módulo Compartilhado: Radar Matcher Core ───
// Lógica pura de associação de produtos SGD → Banco de Preços.
// Sem dependências de browser (window/fetch/DOM) — importável e testável (vitest).
//
// É a ÚNICA fonte de verdade das regras de matching. O wrapper de browser
// (radar-matcher.js) consome este core e adiciona persistência (Supabase/localStorage).
//
// ── Vocabulário canônico de status ──
// Toda associação resolve para EXATAMENTE um destes status. Não invente outros.
const MATCH_STATUS = {
  CONFIRMADO: 'confirmado',     // equivalência aprovada por humano (cache) — score 1.0
  EXATO: 'exato',               // chave normalizada idêntica — score 1.0
  SUGESTAO: 'sugestao',         // match automático pendente de revisão (token/regex)
  SEM_MATCH: 'sem_match',       // nenhum produto encontrado — exige ação manual
};

// Camadas de matching (ordem de prioridade)
const MATCH_LAYER = { N1: 'N1', N2: 'N2', N3: 'N3', N4: 'N4' };

// Thresholds (Story 13.5: token similarity elevado para 0.7)
const TOKEN_THRESHOLD = 0.7;

// Cobertura assimétrica (nome do banco coberto pela descrição completa do item).
// Exige cobertura alta E que o nome do banco tenha ao menos MIN_REF_TOKENS tokens
// significativos — evita que um nome de 1 palavra ("Sal") case com qualquer item.
const COVERAGE_THRESHOLD = 0.8;
const MIN_REF_TOKENS = 2;

// Palavras-ruído removidas antes de comparar (não distinguem produtos)
const NOISE = ['tipo', 'pct', 'c/', 'un', 'marca', 'de', 'do', 'da', 'com', 'para', 'em',
  'qualidade', 'primeira', 'segunda', 'pacote'];

// Sinônimos: normalizam variações de grafia para uma forma canônica.
// Regra: a chave NUNCA pode ser igual ao valor (seria no-op). Mantenha só mapeamentos reais.
const SYNONYMS = {
  carioquinha: 'carioca',
  parboilizado: 'parbolizado',
  mucarela: 'mussarela',
  muzzarela: 'mussarela',
};

// Marcas removidas da normalização (não devem influenciar o match)
const BRAND_BLACKLIST = ['yoki', 'camil', 'kicaldo', 'urbano', 'tio joao', 'dona benta',
  'renata', 'adria', 'isabela', 'piraque', 'vitarella', 'predilecta', 'fugini',
  'quero', 'elefante', 'hemmer', 'sadia', 'perdigao', 'aurora', 'seara',
  'friboi', 'minerva', 'marfrig', 'liza', 'soya', 'abc'];

// Story 13.5: regras de regex para sugestão de categoria (camada N3)
const REGEX_RULES = [
  // Alimentos
  { pattern: /arroz\s*(tipo\s*1|agulhinha|parbo)/i, categoria: 'Alimentos' },
  { pattern: /feij[aã]o\s*(carioca|preto|fradinho|branco)/i, categoria: 'Alimentos' },
  { pattern: /a[cç][uú]car\s*(cristal|refinado|demerara)/i, categoria: 'Alimentos' },
  { pattern: /[oó]leo\s*(soja|canola|girassol|milho)/i, categoria: 'Alimentos' },
  { pattern: /macarr[aã]o\s*(espaguete|parafuso|penne|padre\s*nosso)/i, categoria: 'Alimentos' },
  { pattern: /farinha\s*(trigo|mandioca|milho|rosca)/i, categoria: 'Alimentos' },
  { pattern: /leite\s*(integral|desnatado|semi|p[oó]\s*integral|p[oó]|uht)/i, categoria: 'Alimentos' },
  { pattern: /caf[eé]\s*(torrado|moido|soluvel|em\s*po)/i, categoria: 'Alimentos' },
  { pattern: /sal\s*(refinado|grosso|iodado)/i, categoria: 'Alimentos' },
  { pattern: /extrato\s*(tomate|molho)/i, categoria: 'Alimentos' },
  // Limpeza
  { pattern: /papel\s*(higi[eê]nico|toalha|rol[aã]o)/i, categoria: 'Limpeza' },
  { pattern: /detergente\s*(l[ií]quido|neutro|coco)/i, categoria: 'Limpeza' },
  { pattern: /desinfetante|agua\s*sanitaria|cloro/i, categoria: 'Limpeza' },
  { pattern: /sabao\s*(em\s*po|liquido|barra|pedra)/i, categoria: 'Limpeza' },
  { pattern: /esponja|palha\s*de\s*aco|pano\s*de\s*(ch[aã]o|prato)/i, categoria: 'Limpeza' },
  { pattern: /saco\s*(lixo|de\s*lixo)/i, categoria: 'Limpeza' },
  // Material Escolar
  { pattern: /caderno\s*(\d+|espiral|brochura|capa\s*dura)/i, categoria: 'Material Escolar' },
  { pattern: /l[aá]pis\s*(preto|cor|grafite|hb)/i, categoria: 'Material Escolar' },
  { pattern: /caneta\s*(esferogr|azul|preta|vermelha)/i, categoria: 'Material Escolar' },
  { pattern: /borracha\s*(branca|bicolor|escolar)/i, categoria: 'Material Escolar' },
  { pattern: /cola\s*(branca|bast[aã]o|instant|l[ií]quida)/i, categoria: 'Material Escolar' },
  { pattern: /papel\s*(sulfite|a4|chamequinho|oficio)/i, categoria: 'Material Escolar' },
];

/**
 * Normaliza o nome de um produto para uma chave canônica comparável.
 * lowercase → remove acentos → aplica sinônimos → remove marcas → remove ruído → remove números puros.
 * @param {string} name
 * @returns {string} chave normalizada (pode ser '' se só houver ruído)
 */
function normalizeProductName(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  Object.keys(SYNONYMS).forEach((k) => { s = s.replace(new RegExp('\\b' + k + '\\b', 'g'), SYNONYMS[k]); });
  BRAND_BLACKLIST.forEach((b) => { s = s.replace(new RegExp('\\b' + b + '\\b', 'gi'), ''); });
  let tokens = s.split(/[\s,;/\-()]+/).filter(Boolean);
  tokens = tokens.filter((t) => NOISE.indexOf(t) === -1);
  tokens = tokens.filter((t) => !/^\d+$/.test(t)); // mantém 1kg, 500g, 900ml; descarta números soltos
  return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Similaridade de Jaccard entre os tokens (>2 chars) de dois nomes.
 * @returns {number} 0..1 (intersecção / maior conjunto)
 */
function tokenSimilarity(a, b) {
  const ta = normalizeProductName(a).split(/\s+/).filter((t) => t.length > 2);
  const tb = normalizeProductName(b).split(/\s+/).filter((t) => t.length > 2);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter++; });
  return inter / Math.max(setA.size, setB.size);
}

/**
 * Cobertura assimétrica: que fração dos tokens do produto-referência (`ref`, geralmente o
 * nome curto do banco, ex. "Vassoura nylon") aparece no item SGD (`full`, que traz a
 * descrição completa do estado, ex. "Vassoura multiuso nylon cabo de plástico...").
 *
 * Diferente do Jaccard, NÃO penaliza o item por ter tokens descritivos extras — é
 * exatamente isso que torna a descrição completa um ATIVO no matching, não um ruído.
 * @returns {number} 0..1 (tokens do ref presentes no item / total de tokens do ref)
 */
function tokenCoverage(ref, full) {
  const tRef = normalizeProductName(ref).split(/\s+/).filter((t) => t.length > 2);
  const tFull = normalizeProductName(full).split(/\s+/).filter((t) => t.length > 2);
  if (tRef.length === 0 || tFull.length === 0) return 0;
  const setFull = new Set(tFull);
  let covered = 0;
  new Set(tRef).forEach((t) => { if (setFull.has(t)) covered++; });
  return covered / new Set(tRef).size;
}

/**
 * Converte um valor monetário em formato BR ("3.800,00", "121,25", "96,23", "1.234")
 * para Number. Retorna null se não for um número válido.
 * @param {string} raw  trecho numérico já isolado (sem "R$")
 * @returns {number|null}
 */
function parseBrMoney(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s+/g, '');
  if (!s) return null;
  // Em valores monetários BR o decimal é SEMPRE vírgula; o "." é separador de milhar.
  // Casos: "3.800,00" → "3800.00"; "121,25" → "121.25"; "1.234" → "1234"; "50" → "50".
  if (s.indexOf(',') >= 0) {
    s = s.replace(/\./g, '').replace(',', '.'); // tem decimal por vírgula → ponto é milhar
  } else {
    s = s.replace(/\./g, ''); // sem vírgula → qualquer ponto é separador de milhar
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Palavras que sinalizam um preço-teto na descrição do edital.
// "máximo" sozinho é ambíguo (pode ser prazo) — por isso a extração SEMPRE ancora
// no "R$" mais próximo DEPOIS da palavra-chave, dentro de uma janela curta.
const REF_PRICE_KEYWORD = /(pre[çc]os?\s*(de\s*|unit[áa]rios?\s*)?(de\s*)?(refer[êe]ncia|m[áa]xim[oa]s?)|valor(es)?\s*(unit[áa]rios?\s*)?(de\s*)?(refer[êe]ncia|m[áa]xim[oa]s?|estimad[oa]s?))/gi;
const MONEY_AFTER = /R\$\s*([\d.]+,\d{2}|[\d.]+)/i;

/**
 * Extrai o PREÇO DE REFERÊNCIA (teto) da descrição/edital de um item SGD.
 * Cotações acima deste valor são INABILITADAS — por isso é tratado como limite máximo.
 *
 * Estratégia: localiza uma palavra-chave de referência/máximo e captura o primeiro
 * valor "R$ ..." numa janela de até 40 caracteres após ela (evita falsos positivos
 * como "prazo máximo de 2 horas"). Se nenhuma palavra-chave casar, tenta um "R$" isolado
 * apenas quando há exatamente um valor monetário no texto (baixa ambiguidade).
 *
 * @param {string} texto  descrição + garantia/observação do item
 * @returns {{valor:number, raw:string, fonte:string}|null}
 */
function extractReferencePrice(texto) {
  const s = String(texto || '');
  if (!s) return null;

  REF_PRICE_KEYWORD.lastIndex = 0;
  let km;
  while ((km = REF_PRICE_KEYWORD.exec(s)) !== null) {
    const after = s.slice(km.index + km[0].length, km.index + km[0].length + 40);
    const money = after.match(MONEY_AFTER);
    if (money) {
      const valor = parseBrMoney(money[1]);
      if (valor != null && valor > 0) {
        return { valor, raw: money[0].trim(), fonte: km[0].trim() };
      }
    }
  }

  // Fallback: um único "R$ valor" no texto inteiro → assume-se referência.
  const all = [...s.matchAll(/R\$\s*([\d.]+,\d{2}|[\d.]+)/gi)];
  if (all.length === 1) {
    const valor = parseBrMoney(all[0][1]);
    if (valor != null && valor > 0) {
      return { valor, raw: all[0][0].trim(), fonte: 'R$ isolado' };
    }
  }
  return null;
}

// "Marca(s) [de referência]:" seguido da lista. Captura até o fim da frase/lista.
const REF_BRAND_KEYWORD = /marcas?\s*(de\s*refer[êe]ncia)?\s*[:\-]\s*/i;

/**
 * Normaliza uma marca para comparação: minúsculas, sem acentos, sem pontuação,
 * espaços colapsados. Usado para comparar marca cotada vs marcas exigidas.
 */
function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai a lista de MARCAS DE REFERÊNCIA exigidas pelo edital na descrição do item.
 * Formatos reais: "Marcas: Pachá, Anchieta ou Pereira", "Marca: Yoki ou Pachá",
 * "Marcas: Klin Mega" (marca composta). Cotar marca fora desta lista INABILITA.
 *
 * A lista termina no primeiro delimitador de frase (. ; ( ) quebra de linha) — evita
 * arrastar o resto da especificação para dentro dos nomes de marca.
 *
 * @param {string} texto  descrição do item
 * @returns {{marcas:string[], raw:string}|null}  null se não houver lista de marcas
 */
function extractReferenceBrands(texto) {
  const s = String(texto || '');
  const km = s.match(REF_BRAND_KEYWORD);
  if (!km) return null;
  const start = km.index + km[0].length;
  // Recorta até o primeiro delimitador de frase.
  const rest = s.slice(start);
  const stop = rest.search(/[.;\n()]|\bconforme\b|\bembalagem\b|\bvalidade\b/i);
  const segment = (stop >= 0 ? rest.slice(0, stop) : rest).trim();
  if (!segment) return null;
  // Quebra por vírgula e por " ou " / " e " (conectores de lista).
  const marcas = segment
    .split(/\s*,\s*|\s+ou\s+|\s+e\s+/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !/^marcas?$/i.test(x));
  if (marcas.length === 0) return null;
  return { marcas, raw: segment };
}

/**
 * Verifica se a marca cotada é aceita perante as marcas de referência exigidas.
 * Casamento tolerante: a marca cotada é aceita se for igual a, ou contiver / estiver
 * contida em, qualquer marca exigida (após normalização). Marca vazia conta como
 * NÃO conforme quando há exigência (operador precisa informar a marca).
 *
 * @param {string} marcaCotada
 * @param {string[]} marcasExigidas
 * @returns {boolean} true se conforme (ou se não há exigência)
 */
function isBrandCompliant(marcaCotada, marcasExigidas) {
  if (!marcasExigidas || marcasExigidas.length === 0) return true; // sem exigência
  const m = normalizeBrand(marcaCotada);
  if (!m) return false; // exige marca mas nenhuma informada
  return marcasExigidas.some((req) => {
    const r = normalizeBrand(req);
    if (!r) return false;
    return m === r || m.includes(r) || r.includes(m);
  });
}

/**
 * Tenta classificar um item por regras de regex (camada N3) e localizar um produto.
 * @param {string} itemName
 * @param {Array<{id,nome?,descricao?,item?,sku?}>} produtos  catálogo de produtos do banco
 * @returns {{produto_id, nome, categoria, ruleIdx, sku?}|null}
 */
function matchRegexRules(itemName, produtos = []) {
  const norm = String(itemName || '');
  for (let i = 0; i < REGEX_RULES.length; i++) {
    const rule = REGEX_RULES[i];
    if (!rule.pattern.test(norm)) continue;
    const hit = produtos.find((p) => rule.pattern.test(p.nome || p.descricao || p.item || ''));
    if (hit) {
      return {
        produto_id: hit.id != null ? hit.id : hit.sku,
        nome: hit.nome || hit.descricao || hit.item || '',
        categoria: rule.categoria,
        ruleIdx: i,
        sku: hit.sku || hit.id,
      };
    }
    // Regex casou mas nenhum produto encontrado — devolve só a categoria sugerida
    return { produto_id: null, nome: null, categoria: rule.categoria, ruleIdx: i };
  }
  return null;
}

/**
 * Núcleo do matching — resolve um item SGD contra o cache de equivalências e o banco.
 *
 * @param {string} itemName            nome do item SGD (idealmente nome + descrição)
 * @param {object} ctx
 * @param {Object<string,object>} ctx.cache  equivalências: chave_normalizada → { sku, nome_banco, confirmado, ... }
 * @param {Array<object>} [ctx.produtos]     itens do banco de preços para fallback/regex
 * @returns {{status, score, sku, nomeBanco, matchLayer, categoriaSugerida?}}
 */
function matchProduct(itemName, ctx = {}) {
  const cache = ctx.cache || {};
  const produtos = ctx.produtos || [];
  const key = normalizeProductName(itemName);

  const noMatch = {
    status: MATCH_STATUS.SEM_MATCH, score: 0, sku: null, nomeBanco: null, matchLayer: MATCH_LAYER.N4,
  };
  if (!key) return noMatch;

  // ── N1: equivalência exata no dicionário ──
  if (cache[key]) {
    const entry = cache[key];
    return {
      status: entry.confirmado ? MATCH_STATUS.CONFIRMADO : MATCH_STATUS.SUGESTAO,
      score: 1.0,
      sku: entry.sku,
      nomeBanco: entry.nome_banco || null,
      matchLayer: MATCH_LAYER.N1,
    };
  }

  // ── N2: similaridade por tokens ──
  // Combina duas medidas e fica com a maior:
  //  (a) Jaccard simétrico (TOKEN_THRESHOLD) — bom quando nome do item ≈ nome do banco;
  //  (b) Cobertura assimétrica (COVERAGE_THRESHOLD) — bom quando o item traz a descrição
  //      completa do estado e o nome do banco é curto (ex.: banco "Vassoura nylon" coberto
  //      por "Vassoura multiuso nylon cabo de plástico..."). É isto que faz a descrição
  //      completa AJUDAR o match em vez de diluí-lo.
  // `itemName` (com descrição) é o lado "full"; o nome do banco/cache é o "ref" curto.
  function scorePair(refName) {
    const jac = tokenSimilarity(key, refName);
    let cov = 0;
    const refTokens = normalizeProductName(refName).split(/\s+/).filter((t) => t.length > 2);
    if (refTokens.length >= MIN_REF_TOKENS) {
      const c = tokenCoverage(refName, itemName);
      if (c >= COVERAGE_THRESHOLD) cov = c;
    }
    const score = Math.max(jac >= TOKEN_THRESHOLD ? jac : 0, cov);
    return score;
  }

  let best = null;
  let bestScore = 0;
  Object.keys(cache).forEach((k) => {
    const sc = scorePair(k);
    if (sc > 0 && sc > bestScore) { bestScore = sc; best = cache[k]; }
  });
  // também compara contra o banco de preços direto
  produtos.forEach((p) => {
    const refName = p.item || p.nome || p.descricao || '';
    const sc = scorePair(refName);
    if (sc > 0 && sc > bestScore) {
      bestScore = sc;
      best = { sku: p.sku || p.id, nome_banco: refName };
    }
  });
  if (best) {
    return {
      status: MATCH_STATUS.SUGESTAO,
      score: bestScore,
      sku: best.sku,
      nomeBanco: best.nome_banco || null,
      matchLayer: MATCH_LAYER.N2,
    };
  }

  // ── N3: regras de regex ──
  const regex = matchRegexRules(itemName, produtos);
  if (regex && regex.produto_id) {
    return {
      status: MATCH_STATUS.SUGESTAO,
      score: 0.65,
      sku: regex.sku || regex.produto_id,
      nomeBanco: regex.nome,
      matchLayer: MATCH_LAYER.N3,
      categoriaSugerida: regex.categoria,
    };
  }

  // ── N4: sem match (eventualmente com categoria sugerida) ──
  if (regex && regex.categoria) noMatch.categoriaSugerida = regex.categoria;
  return noMatch;
}

  root.RadarMatcherCore = { MATCH_STATUS, MATCH_LAYER, TOKEN_THRESHOLD, COVERAGE_THRESHOLD, MIN_REF_TOKENS, NOISE, SYNONYMS, BRAND_BLACKLIST, REGEX_RULES, normalizeProductName, tokenSimilarity, tokenCoverage, parseBrMoney, extractReferencePrice, normalizeBrand, extractReferenceBrands, isBrandCompliant, matchRegexRules, matchProduct };
})(typeof window !== "undefined" ? window : globalThis);
