export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { texto, formato, fornecedor, contexto, _ocrMessages } = req.body || {};

  // OCR mode: images sent via _ocrMessages
  const isOCR = _ocrMessages && Array.isArray(_ocrMessages) && _ocrMessages.length > 0;
  const isCronoOCR = isOCR && formato === "cronograma_ocr";

  if (!isOCR && (!texto || texto.trim().length < 10)) {
    return res.status(400).json({ error: "Texto insuficiente para análise" });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada no servidor" });
  }

  try {
    let model, messages, maxTokens;

    if (isOCR) {
      // OCR mode: forward image content to vision-capable model
      // Use gpt-4o for cronograma (complex tables with dates/quantities), gpt-4o-mini for simpler OCR
      model = isCronoOCR ? "gpt-4o" : "gpt-4o-mini";
      messages = [
        { role: "system", content: isCronoOCR
          ? "Você é um especialista em extrair dados de cronogramas de entrega de licitações de Caixas Escolares em Minas Gerais. Extraia TODOS os itens com preços e quantidades por data. Retorne APENAS JSON válido, sem markdown."
          : "Você é um OCR especialista em extrair dados de tabelas de licitações públicas de Caixas Escolares em Minas Gerais. Analise as imagens e extraia TODOS os dados incluindo PREÇOS UNITÁRIOS de cada fornecedor. Retorne APENAS JSON válido, sem markdown."
        },
        ..._ocrMessages
      ];
      maxTokens = isCronoOCR ? 16000 : 8000;
    } else {
      // Text mode: original behavior
      model = "gpt-4o-mini";
      const systemPrompt = `Você é um especialista em extrair dados de tabelas de preços de fornecedores para licitações públicas de Caixas Escolares em Minas Gerais.

REGRAS:
1. Extraia TODOS os itens encontrados no texto
2. Para cada item, retorne EXATAMENTE este formato JSON
3. Se um campo não existir no texto, use null
4. Preços devem ser numéricos (sem R$, sem pontos de milhar, vírgula como decimal convertida para ponto)
5. Se o preço for "total" e houver quantidade, calcule o unitário
6. Identifique a marca quando aparecer junto ao item
7. Agrupe por categoria quando possível
8. Se for tabela de distribuidor, identifique embalagem/unidade de venda

FORMATO DE SAÍDA (JSON object with "itens" array):
{
  "itens": [
    {
      "nome": "Nome do item limpo (sem códigos internos do fornecedor)",
      "marca": "Marca ou null",
      "unidade": "Un/Kg/Cx/Pct/Lt/etc",
      "preco": 0.00,
      "embalagem": "Descrição da embalagem ou null",
      "categoria": "Categoria identificada ou null",
      "codigo_fornecedor": "Código original do fornecedor ou null",
      "observacao": "Qualquer info relevante ou null"
    }
  ]
}

CONTEXTO DO FORNECEDOR: ${fornecedor || "Não informado"}
FORMATO ORIGINAL: ${formato || "Não informado"}
${contexto ? "CONTEXTO ADICIONAL: " + contexto : ""}`;

      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extraia os itens desta tabela de preços:\n\n${texto.slice(0, 15000)}` },
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
    // Strip markdown code fences if present
    rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(rawContent);

    if (isOCR) {
      // OCR mode: return the full structured response (escola, fornecedores, itens, etc.)
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
      fornecedor: fornecedor,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
