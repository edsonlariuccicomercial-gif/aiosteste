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

function normalizeResult(item, result, idx) {
  const fallback = item.fallback || {};
  const rawName = result.descricaoFiscal || result.produtoCanonico || fallback.nome || item.nome || "Produto";
  let descricaoFiscal = cleanFiscalName(rawName);
  if (isDirtyFiscalName(descricaoFiscal)) descricaoFiscal = cleanFiscalName(fallback.nome || item.nome || "Produto");

  const alertas = Array.isArray(result.alertas) ? result.alertas.filter(Boolean).map(String) : [];
  if (!descricaoFiscal || isDirtyFiscalName(descricaoFiscal)) {
    alertas.push("Descricao fiscal pendente de revisao");
    descricaoFiscal = cleanFiscalName(item.nome || "Produto");
  }

  const categoria = normalizeCategory(result.categoria || fallback.categoria || "Outro");
  const unidadeNormalizada = String(result.unidadeNormalizada || fallback.unidade || item.unidade || "UN").toUpperCase().trim();
  const embalagem = result.embalagem || fallback.embalagem || "";
  const marcasPermitidas = Array.isArray(result.marcasPermitidas) ? result.marcasPermitidas.map(String).filter(Boolean) : [];
  const precoReferencia = Number(result.precoReferencia || 0) > 0 ? Number(result.precoReferencia) : 0;
  const atributosEssenciais = Array.isArray(result.atributosEssenciais) ? result.atributosEssenciais : [];
  const precisaRevisao = Boolean(result.precisaRevisao || alertas.length);
  const confianca = Math.max(0, Math.min(1, Number(result.confianca || 0)));

  return {
    idx: Number.isInteger(result.idx) ? result.idx : idx,
    descricaoFiscal,
    produtoCanonico: descricaoFiscal,
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 40) : [];
  const contexto = req.body?.contexto || {};
  if (!itens.length) return res.status(400).json({ error: "Nenhum item informado" });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY nao configurada no servidor" });

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
7. Para copo, capacidade em ml/l e material sao essenciais. Se nao houver capacidade, alerta "Capacidade do copo pendente".
8. Para tesoura, tamanho/ponta/material sao essenciais quando existirem. Se o item so diz tesoura sem tamanho, alerta "Caracteristica essencial da tesoura pendente".
9. Para utensilios de cozinha, o nucleo e o utensilio. Em "colher de arroz", "arroz" e aplicacao/formato, nao categoria alimentacao.
10. Use categoria apenas entre: Alimentacao, Papelaria, Limpeza, Toner/Cartucho, Utensilios de Cozinha, Outro.
11. Se tiver duvida entre criar produto ou associar, marque precisaRevisao=true.`;

  const userPrompt = JSON.stringify({
    contexto,
    formato_saida: {
      results: [
        {
          idx: 0,
          descricaoFiscal: "Nome fiscal limpo",
          produtoCanonico: "igual a descricaoFiscal",
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
