const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1";

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { action, termo, uf, dataInicial, dataFinal, pagina, cnpj, ano, seq } = req.body || {};

  const headers = {
    "Accept": "application/json",
    "User-Agent": "PainelCaixaEscolar/1.0",
  };

  try {
    let url;

    switch (action) {
      case "search": {
        const params = new URLSearchParams({
          q: termo || "",
          uf: uf || "MG",
          dataInicial: dataInicial || getDateMonthsAgo(6),
          dataFinal: dataFinal || getToday(),
          pagina: String(pagina || 1),
          tamanhoPagina: "20",
        });
        url = `${PNCP_BASE}/contratacoes?${params}`;
        break;
      }

      case "detail":
        url = `${PNCP_BASE}/contratacoes/${encodeURIComponent(cnpj)}/${ano}/${seq}`;
        break;

      case "items":
        url = `${PNCP_BASE}/contratacoes/${encodeURIComponent(cnpj)}/${ano}/${seq}/itens`;
        break;

      default:
        return res.status(400).json({ error: "Action inválida. Use: search, detail, items" });
    }

    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `PNCP retornou ${resp.status}`, detail: errText });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getDateMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0];
}
