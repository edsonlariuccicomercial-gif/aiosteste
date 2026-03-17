// ─── Vercel API Route: Classificação NCM com IA (GPT-4o-mini) ───
// POST /api/ai-ncm
// Body: { items: [{ descricao: "Maçã fuji tipo exportação 1kg" }, ...] }
// Response: { success: true, results: [{ descricao, ncm, justificativa }] }

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: "OPENAI_API_KEY nao configurado" });

  const { items } = req.body || {};
  if (!items || !items.length) return res.status(400).json({ success: false, error: "items[] obrigatorio" });

  // Limit batch size
  const batch = items.slice(0, 20);

  const prompt = `Voce e um classificador fiscal brasileiro especialista em NCM (Nomenclatura Comum do Mercosul).
Para cada produto abaixo, retorne o codigo NCM mais adequado no formato XXXX.XX.XX e uma justificativa breve de 1 linha.

Produtos:
${batch.map((it, i) => `${i + 1}. ${it.descricao}`).join("\n")}

IMPORTANTE:
- Use APENAS codigos NCM validos da tabela oficial brasileira
- Para alimentos frescos use os codigos do capitulo 07-08 (hortifruti) ou 02 (carnes)
- Para industrializados use os capitulos correspondentes (19 para massas, 15 para oleos, etc)
- Se nao tiver certeza, use o codigo mais generico da categoria

Responda APENAS com JSON valido, sem markdown:
[{"idx": 1, "ncm": "XXXX.XX.XX", "justificativa": "..."}, ...]`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 2048,
        messages: [
          { role: "system", content: "Voce e um classificador fiscal NCM brasileiro. Responda APENAS JSON valido." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(500).json({ success: false, error: `OpenAI API (${resp.status}): ${errText.slice(0, 200)}` });
    }

    const data = await resp.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch (_e) {
      return res.status(500).json({ success: false, error: "Falha ao parsear resposta da IA", raw: content.slice(0, 500) });
    }

    // Map results back to input items
    const results = batch.map((item, idx) => {
      const match = Array.isArray(parsed) ? parsed.find(r => r.idx === idx + 1) : null;
      return {
        descricao: item.descricao,
        ncm: match?.ncm || "",
        justificativa: match?.justificativa || "",
      };
    });

    return res.status(200).json({
      success: true,
      model: "gpt-4o-mini",
      results,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
