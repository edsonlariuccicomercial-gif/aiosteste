// FR-011: API Inter Banking — Conciliação bancária automática
// Endpoints: extrato, boleto, pix
// Docs: https://developers.inter.co/references/banking

const INTER_BASE = "https://cdpj.partners.bancointer.com.br";

function getInterHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getAccessToken(clientId, clientSecret, certBase64) {
  // Inter API usa OAuth2 com certificado mTLS
  // Em produção, usar certificado .crt/.key via environment
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "extrato.read boleto-cobranca.read boleto-cobranca.write pagamento-pix.read",
  });

  const resp = await fetch(`${INTER_BASE}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Inter OAuth failed: ${resp.status} — ${err}`);
  }
  return resp.json();
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.method === "GET" ? req.query : (req.body || {});

  try {
    const clientId = process.env.INTER_CLIENT_ID;
    const clientSecret = process.env.INTER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(200).json({
        success: false,
        error: "API Inter não configurada. Defina INTER_CLIENT_ID e INTER_CLIENT_SECRET nas variáveis de ambiente.",
        mock: true,
      });
    }

    const tokenData = await getAccessToken(clientId, clientSecret);
    const token = tokenData.access_token;

    if (action === "extrato") {
      // Buscar extrato dos últimos 30 dias
      const dataFim = new Date().toISOString().slice(0, 10);
      const dataInicio = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      const resp = await fetch(
        `${INTER_BASE}/banking/v2/extrato?dataInicio=${dataInicio}&dataFim=${dataFim}`,
        { headers: getInterHeaders(token) }
      );

      if (!resp.ok) throw new Error(`Extrato failed: ${resp.status}`);
      const data = await resp.json();

      return res.status(200).json({
        success: true,
        transacoes: data.transacoes || [],
        saldo: data.saldo || null,
      });
    }

    if (action === "emitir-boleto") {
      const { valor, vencimento, nomePagador, cpfCnpjPagador, descricao } = req.body;

      const boleto = {
        seuNumero: `BOL-${Date.now()}`,
        valorNominal: valor,
        dataVencimento: vencimento,
        numDiasAgenda: 30,
        pagador: {
          cpfCnpj: cpfCnpjPagador,
          tipoPessoa: cpfCnpjPagador.length > 11 ? "JURIDICA" : "FISICA",
          nome: nomePagador,
        },
        mensagem: { linha1: descricao || "Cobrança Licit-AIX" },
      };

      const resp = await fetch(`${INTER_BASE}/cobranca/v3/cobrancas`, {
        method: "POST",
        headers: getInterHeaders(token),
        body: JSON.stringify(boleto),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Emissão boleto failed: ${resp.status} — ${err}`);
      }
      const data = await resp.json();

      return res.status(200).json({
        success: true,
        codigoSolicitacao: data.codigoSolicitacao,
        linhaDigitavel: data.linhaDigitavel || null,
      });
    }

    if (action === "consultar-pix") {
      const dataFim = new Date().toISOString().slice(0, 10);
      const dataInicio = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const resp = await fetch(
        `${INTER_BASE}/banking/v2/pix?dataInicio=${dataInicio}&dataFim=${dataFim}`,
        { headers: getInterHeaders(token) }
      );

      if (!resp.ok) throw new Error(`PIX query failed: ${resp.status}`);
      const data = await resp.json();

      return res.status(200).json({
        success: true,
        pix: data.pix || [],
      });
    }

    return res.status(200).json({ success: false, error: `Ação desconhecida: ${action}` });
  } catch (err) {
    console.error("[inter-banking]", err);
    return res.status(200).json({ success: false, error: err.message });
  }
};
