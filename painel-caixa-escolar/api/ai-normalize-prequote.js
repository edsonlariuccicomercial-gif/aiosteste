export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function corsHeaders(req, res) {
  const origin = req.headers?.origin || '';
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function normText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFiscalName(value) {
  return String(value || "")
    .replace(/https?:\/\/[^\s<>"')]+/gi, " ")
    .replace(/\bdescri[cç][aã]o\s*:/gi, " ")
    .replace(/\b(?:marcas?|marca de refer[eê]ncia|refer[eê]ncia de marca)\s*:?.*$/i, " ")
    .replace(/\b(?:pre[cç]o|valor|teto)\s+(?:de\s+)?refer[eê]ncia\s*:?.*$/i, " ")
    .replace(/\b(?:edital|sgd|cota[cç][aã]o|or[cç]amento)\b/gi, " ")
    .replace(/[;|"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDirtyFiscalName(value) {
  const raw = String(value || "");
  const t = normText(raw);
  return !raw.trim() ||
    raw.length > 95 ||
    /\b(descricao|marca|marcas|referencia|preco|precos|teto|valor|edital|sgd|orcamento|cotacao)\b/.test(t) ||
    /https?:\/\//i.test(raw);
}

function normalizeCategory(value) {
  const t = normText(value);
  if (t.includes("toner") || t.includes("cartucho")) return "Toner/Cartucho";
  if (t.includes("utensilio") || t.includes("cozinha")) return "Utensilios de Cozinha";
  if (t.includes("aliment")) return "Alimentacao";
  if (t.includes("limpeza")) return "Limpeza";
  if (t.includes("papelaria")) return "Papelaria";
  return "Outro";
}

function extractAllowedBrands(value) {
  const raw = String(value || "");
  const match = raw.match(/\bmarcas?(?:\s+de)?\s+refer[eê]ncia\s*:?\s*([\s\S]*?)(?:\bpre[cç]o|\bvalor|\bteto|$)/i);
  if (!match) return [];
  return match[1]
    .replace(/[.;]/g, " ")
    .split(/,|\s+e\s+|\s+|\n/)
    .map((part) => part.trim())
    .filter((part) => part && part.length <= 24 && !/\b(referencia|preco|valor|teto)\b/i.test(part));
}

function extractReferencePrice(value) {
  const raw = String(value || "");
  const match = raw.match(/\b(?:pre[cç]o|valor|teto)\s+(?:de\s+)?refer[eê]ncia\s*:?\s*R?\$?\s*([\d.,]+)/i);
  if (!match) return 0;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function titleFiscalName(value) {
  const keepLower = new Set(["de", "da", "do", "das", "dos", "para", "em", "e"]);
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && keepLower.has(lower)) return lower;
      if (/^\d+(?:[,.]\d+)?$/.test(word) || /^(mm|ml|l|kg|g)$/i.test(word)) return word.replace(",", ".");
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function inferCanonicalProduct(rawValue, fiscalName) {
  const raw = [rawValue, fiscalName].filter(Boolean).join(" ");
  const t = normText(raw);
  if (/\bcaneta\b/.test(t)) return /\bpermanente|retroprojetor|retro projetor|transparencia\b/.test(t) ? "Caneta Permanente" : "Caneta";
  if (/\bcolher(?:e|es)?\b/.test(t)) return "Colher";
  if (/\bcopos?\b/.test(t)) return "Copo";
  if (/\barroz\b/.test(t)) return "Arroz";
  if (/\bpapel\b/.test(t) && /\ba4\b/.test(t)) return "Papel A4";
  const cleaned = cleanFiscalName(fiscalName || rawValue || "Produto");
  const firstWords = cleaned.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  return titleFiscalName(firstWords || "Produto");
}

function localNormalizeItem(item, idx) {
  const raw = [item.nome, item.descricao, item.observacao].filter(Boolean).join(" ");
  const cleaned = cleanFiscalName(raw);
  const t = normText(raw);
  const marcasPermitidas = extractAllowedBrands(raw);
  const precoReferencia = extractReferencePrice(raw);
  const base = {
    idx,
    descricaoFiscal: titleFiscalName(cleaned || item.nome || "Produto"),
    produtoCanonico: inferCanonicalProduct(raw, cleaned || item.nome || "Produto"),
    categoria: "Outro",
    unidadeNormalizada: String(item.unidade || "UN").toUpperCase().trim(),
    embalagem: "",
    atributosEssenciais: [],
    marcasPermitidas,
    precoReferencia,
    alertas: [],
    precisaRevisao: false,
    confianca: 0.55,
  };

  if (/\bcaneta\b/.test(t) && /\b(retroprojetor|retro projetor|transparencia|transparencias|permanente)\b/.test(t)) {
    const espessura = raw.match(/(\d+(?:[,.]\d+)?)\s*mm/i)?.[1]?.replace(",", ".") || "";
    const cor = /\bpreta?\b/.test(t) ? "Preta" : "";
    const ponta = /\bponta\s+media\b|\bmedia\b/.test(t) ? "Ponta Media" : "";
    base.descricaoFiscal = titleFiscalName(["Caneta Permanente para Retroprojetor/transparencia", ponta, espessura ? `${espessura} mm` : "", cor].filter(Boolean).join(" "));
    base.produtoCanonico = "Caneta Permanente";
    base.categoria = "Papelaria";
    base.atributosEssenciais = [
      { chave: "tipo", valor: "caneta permanente" },
      { chave: "uso", valor: "retroprojetor/transparencia" },
      ...(ponta ? [{ chave: "ponta", valor: "media" }] : []),
      ...(espessura ? [{ chave: "espessura", valor: `${espessura} mm` }] : []),
      ...(cor ? [{ chave: "cor", valor: cor.toLowerCase() }] : []),
    ];
    base.confianca = 0.88;
  } else if (/\bcolher(?:e)?\b/.test(t) && /\b(servir|manipular|alimentos|cozinha|arroz)\b/.test(t)) {
    const tamanho = /\bmedia\b/.test(t) ? "Media" : "";
    base.descricaoFiscal = titleFiscalName(["Colher", tamanho, "para Servir Alimentos"].filter(Boolean).join(" "));
    base.produtoCanonico = "Colher";
    base.categoria = "Utensilios de Cozinha";
    base.atributosEssenciais = [
      { chave: "tipo", valor: "colher" },
      ...(tamanho ? [{ chave: "tamanho", valor: "media" }] : []),
      { chave: "uso", valor: "servir alimentos" },
    ];
    base.confianca = 0.84;
  } else if (/\bcopo\b/.test(t)) {
    const capacidade = raw.match(/(\d+(?:[,.]\d+)?)\s*(ml|l)\b/i);
    const material = /\bplastico|plastica\b/.test(t) ? "plastico" : "";
    base.descricaoFiscal = titleFiscalName(["Copo", /\bdescartavel\b/.test(t) ? "Descartavel" : "", material].filter(Boolean).join(" "));
    if (capacidade) base.descricaoFiscal = titleFiscalName(`${base.descricaoFiscal} ${capacidade[1].replace(",", ".")} ${capacidade[2].toLowerCase()}`);
    base.produtoCanonico = "Copo";
    base.categoria = "Utensilios de Cozinha";
    base.atributosEssenciais = [
      { chave: "tipo", valor: "copo" },
      ...(material ? [{ chave: "material", valor: material }] : []),
      ...(capacidade ? [{ chave: "capacidade", valor: `${capacidade[1].replace(",", ".")} ${capacidade[2].toLowerCase()}` }] : []),
    ];
    if (!capacidade) {
      base.alertas.push("Capacidade do copo pendente");
      base.precisaRevisao = true;
    }
    base.confianca = capacidade ? 0.82 : 0.68;
  }

  if (isDirtyFiscalName(base.descricaoFiscal)) {
    base.alertas.push("Descricao fiscal pendente de revisao");
    base.precisaRevisao = true;
  }

  return base;
}

function runtimeMeta() {
  return {
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
    vercelUrl: process.env.VERCEL_URL || null,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
  };
}

function normalizeResult(item, result, idx) {
  const fallback = item.fallback || {};
  const local = localNormalizeItem(item, idx);
  if (!result || !Object.keys(result).length) return local;
  if ((local.confianca || 0) >= 0.68) {
    const resultBrands = Array.isArray(result.marcasPermitidas) ? result.marcasPermitidas.map(String).filter(Boolean) : [];
    return {
      ...local,
      idx: Number.isInteger(result.idx) ? result.idx : idx,
      marcasPermitidas: local.marcasPermitidas.length ? local.marcasPermitidas : resultBrands,
      precoReferencia: Number(result.precoReferencia || 0) > 0 ? Number(result.precoReferencia) : local.precoReferencia,
      alertas: Array.from(new Set([
        ...local.alertas,
        ...(Array.isArray(result.alertas) ? result.alertas.filter(Boolean).map(String) : []),
      ])),
      precisaRevisao: Boolean(local.precisaRevisao || local.alertas.length),
      confianca: local.precisaRevisao ? local.confianca : Math.max(local.confianca || 0, Math.min(1, Number(result.confianca || 0))),
    };
  }

  const rawName = result.descricaoFiscal || result.produtoCanonico || fallback.nome || item.nome || "Produto";
  let descricaoFiscal = cleanFiscalName(rawName);
  if (isDirtyFiscalName(descricaoFiscal)) descricaoFiscal = cleanFiscalName(local.descricaoFiscal || fallback.nome || item.nome || "Produto");
  let produtoCanonico = cleanFiscalName(result.produtoCanonico || local.produtoCanonico || descricaoFiscal);
  if (!produtoCanonico || isDirtyFiscalName(produtoCanonico)) produtoCanonico = inferCanonicalProduct([item.nome, item.descricao, item.observacao].join(" "), descricaoFiscal);
  produtoCanonico = inferCanonicalProduct([item.nome, item.descricao, item.observacao].join(" "), produtoCanonico);

  const alertas = Array.from(new Set([
    ...local.alertas,
    ...(Array.isArray(result.alertas) ? result.alertas.filter(Boolean).map(String) : []),
  ]));
  if (!descricaoFiscal || isDirtyFiscalName(descricaoFiscal)) {
    alertas.push("Descricao fiscal pendente de revisao");
    descricaoFiscal = cleanFiscalName(local.descricaoFiscal || item.nome || "Produto");
  }

  const categoria = normalizeCategory(result.categoria || local.categoria || fallback.categoria || "Outro");
  const unidadeNormalizada = String(result.unidadeNormalizada || fallback.unidade || item.unidade || "UN").toUpperCase().trim();
  const embalagem = result.embalagem || fallback.embalagem || "";
  const marcasPermitidas = Array.isArray(result.marcasPermitidas) && result.marcasPermitidas.length ? result.marcasPermitidas.map(String).filter(Boolean) : local.marcasPermitidas;
  const precoReferencia = Number(result.precoReferencia || 0) > 0 ? Number(result.precoReferencia) : local.precoReferencia;
  const atributosEssenciais = Array.isArray(result.atributosEssenciais) && result.atributosEssenciais.length ? result.atributosEssenciais : local.atributosEssenciais;
  const precisaRevisao = Boolean(local.precisaRevisao || result.precisaRevisao || alertas.length);
  const confianca = Math.max(local.confianca || 0, Math.min(1, Number(result.confianca || 0)));

  return {
    idx: Number.isInteger(result.idx) ? result.idx : idx,
    descricaoFiscal,
    produtoCanonico,
    categoria,
    unidadeNormalizada,
    embalagem,
    atributosEssenciais,
    marcasPermitidas,
    precoReferencia,
    alertas,
    precisaRevisao,
    confianca,
  };
}

export default async function handler(req, res) {
  corsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET" && req.query?.debug === "1") {
    return res.status(200).json({ ok: true, runtime: runtimeMeta() });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 40) : [];
  const contexto = req.body?.contexto || {};
  if (!itens.length) return res.status(400).json({ error: "Nenhum item informado" });
  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY nao configurada no servidor",
      runtime: runtimeMeta()
    });
  }

  const systemPrompt = `Voce e o agente de normalizacao de produtos de pre-orcamento para Caixa Escolar MG.

OBJETIVO
Transformar cada item oficial do SGD em dados internos estruturados para associacao de produto e precificacao.

REGRAS CRITICAS
1. Preserve o sentido do item oficial, mas crie uma DESCRICAO FISCAL limpa para compra e nota fiscal.
2. A descricao fiscal deve ter normalmente 3 a 10 palavras, em portugues do Brasil, com atributos essenciais.
3. Nunca inclua na descricao fiscal: marcas permitidas, preco referencia, teto, valor, "descricao:", edital, SGD, cotacao, observacoes longas, URLs, garantia ou prazo.
4. Marcas permitidas ficam somente em marcasPermitidas.
5. Preco referencia fica somente em precoReferencia. Se vier R$ 00, R$ 0,00 ou zero, use 0.
6. Nao invente atributo essencial. Se faltar, marque precisaRevisao=true e inclua alerta claro.
7. produtoCanonico e o nucleo simples do produto, sem variacoes: Copo, Colher, Caneta Permanente, Arroz, Papel A4.
8. descricaoFiscal e o nome completo limpo com variacoes essenciais: material, capacidade, cor, ponta, tamanho, uso.
9. Para copo, capacidade em ml/l e material sao essenciais. Se nao houver capacidade, alerta "Capacidade do copo pendente".
10. Para tesoura, tamanho/ponta/material sao essenciais quando existirem. Se o item so diz tesoura sem tamanho, alerta "Caracteristica essencial da tesoura pendente".
11. Para utensilios de cozinha, o nucleo e o utensilio. Em "colher de arroz", "arroz" e aplicacao/formato, nao categoria alimentacao.
12. Use categoria apenas entre: Alimentacao, Papelaria, Limpeza, Toner/Cartucho, Utensilios de Cozinha, Outro.
13. Se tiver duvida entre criar produto ou associar, marque precisaRevisao=true.

Responda somente em json valido, sem markdown e sem texto fora do objeto.`;

  const userPrompt = JSON.stringify({
    contexto,
    formato_saida: {
      results: [
        {
          idx: 0,
          descricaoFiscal: "Copo Descartavel Plastico 200 ml",
          produtoCanonico: "Copo",
          categoria: "Papelaria",
          unidadeNormalizada: "UN",
          embalagem: "PCT 100 UN ou vazio",
          atributosEssenciais: [{ chave: "capacidade", valor: "200 ml" }],
          marcasPermitidas: ["Marca A"],
          precoReferencia: 0,
          alertas: [],
          precisaRevisao: false,
          confianca: 0.92
        }
      ]
    },
    itens: itens.map((item, idx) => ({
      idx,
      nome_sgd: item.nome || "",
      descricao_sgd: item.descricao || "",
      unidade_sgd: item.unidade || "",
      quantidade_sgd: item.quantidade || 0,
      observacao_sgd: item.observacao || "",
      fallback_local: item.fallback || null
    }))
  });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.05,
        response_format: { type: "json_object" },
        max_tokens: 5000,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: "Erro na API OpenAI", detail: data.error?.message });

    const raw = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim());
    const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
    const byIdx = new Map(rawResults.map((r, i) => [Number.isInteger(r.idx) ? r.idx : i, r]));
    const results = itens.map((item, idx) => normalizeResult(item, byIdx.get(idx) || {}, idx));

    return res.status(200).json({
      success: true,
      results,
      modelo: "gpt-4o-mini",
      tokens_usados: data.usage?.total_tokens || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Falha ao normalizar pre-orcamento" });
  }
}
