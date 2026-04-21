export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

function corsHeaders(req, res) {
  const origin = req.headers?.origin || '';
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  corsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { texto, formato, fornecedor, contexto, _ocrMessages } = req.body || {};

  const isOCR = _ocrMessages && Array.isArray(_ocrMessages) && _ocrMessages.length > 0;
  const isCronoOCR = isOCR && formato === "cronograma_ocr";

  if (!isOCR && (!texto || texto.trim().length < 10)) {
    return res.status(400).json({ error: "Texto insuficiente para analise" });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY nao configurada no servidor" });
  }

  try {
    let model, messages, maxTokens;

    if (isOCR) {
      model = isCronoOCR ? "gpt-4o" : "gpt-4o-mini";
      messages = [
        {
          role: "system",
          content: isCronoOCR
            ? "Voce e um especialista em extrair dados de cronogramas de entrega de licitacoes de Caixas Escolares em Minas Gerais. Extraia todos os itens com precos e quantidades por data. Retorne apenas JSON valido, sem markdown."
            : "Voce e um OCR especialista em extrair dados de tabelas de licitacoes publicas de Caixas Escolares em Minas Gerais. Analise as imagens e extraia todos os dados incluindo precos unitarios de cada fornecedor. Retorne apenas JSON valido, sem markdown."
        },
        ..._ocrMessages
      ];
      maxTokens = isCronoOCR ? 16000 : 8000;
    } else {
      model = "gpt-4o-mini";
      const systemPrompt = `Voce e um especialista em extrair dados de tabelas de precos de fornecedores para licitacoes publicas de Caixas Escolares em Minas Gerais.

REGRAS:
1. Extraia todos os itens encontrados no texto
2. Para cada item, retorne exatamente este formato JSON
3. Se um campo nao existir no texto, use null
4. Precos devem ser numericos (sem R$, sem pontos de milhar, virgula como decimal convertida para ponto)
5. Se o preco for total e houver quantidade, calcule o unitario
6. Identifique a marca quando aparecer junto ao item
7. Agrupe por categoria quando possivel
8. Se for tabela de distribuidor, identifique embalagem/unidade de venda

FORMATO DE SAIDA (JSON object with "itens" array):
{
  "itens": [
    {
      "nome": "Nome do item limpo (sem codigos internos do fornecedor)",
      "marca": "Marca ou null",
      "unidade": "Un/Kg/Cx/Pct/Lt/etc",
      "preco": 0.00,
      "embalagem": "Descricao da embalagem ou null",
      "categoria": "Categoria identificada ou null",
      "codigo_fornecedor": "Codigo original do fornecedor ou null",
      "observacao": "Qualquer info relevante ou null"
    }
  ]
}

CONTEXTO DO FORNECEDOR: ${fornecedor || "Nao informado"}
FORMATO ORIGINAL: ${formato || "Nao informado"}
${contexto ? "CONTEXTO ADICIONAL: " + contexto : ""}`;

      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extraia os itens desta tabela de precos:\n\n${texto.slice(0, 15000)}` },
      ];
      maxTokens = 4000;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: "Erro na API OpenAI", detail: data.error?.message });
    }

    let rawContent = data.choices[0].message.content;
    rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(rawContent);

    if (isOCR) {
      return res.status(200).json({
        ...parsed,
        tokens_usados: data.usage?.total_tokens || 0,
        custo_estimado: ((data.usage?.total_tokens || 0) * 0.00000015).toFixed(4),
        modelo: model,
      });
    }

    return res.status(200).json({
      itens: parsed.itens || parsed,
      tokens_usados: data.usage?.total_tokens || 0,
      custo_estimado: ((data.usage?.total_tokens || 0) * 0.00000015).toFixed(4),
      modelo: model,
      fornecedor,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
