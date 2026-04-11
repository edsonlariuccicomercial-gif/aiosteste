// Netlify Function: sync-entregas
// Sincroniza comprovantes de entrega entre dispositivos (entregador celular <-> contratos PC)
// Usa Netlify Blobs como storage persistente

const { getStore } = require("@netlify/blobs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    const store = getStore({
      name: "entregas",
      siteID: process.env.SITE_ID || "d7c9060f-7563-4f02-9475-ec279d2b32dc",
      token: process.env.NETLIFY_AUTH_TOKEN
    });

    // GET — retorna todos os comprovantes
    if (event.httpMethod === "GET") {
      let provas = [];
      try {
        const data = await store.get("provas", { type: "json" });
        if (data) provas = data;
      } catch (_) {}
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, provas })
      };
    }

    // POST — adiciona comprovante(s)
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      // Aceita um unico comprovante ou array
      const novas = Array.isArray(body.provas) ? body.provas : body.prova ? [body.prova] : [];
      if (novas.length === 0) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "Nenhum comprovante enviado" })
        };
      }

      // Carregar existentes
      let provas = [];
      try {
        const data = await store.get("provas", { type: "json" });
        if (data) provas = data;
      } catch (_) {}

      // Merge (evitar duplicatas por pedidoId)
      for (const nova of novas) {
        const idx = provas.findIndex(p => p.pedidoId === nova.pedidoId);
        if (idx >= 0) {
          provas[idx] = nova; // atualizar
        } else {
          provas.push(nova);
        }
      }

      await store.setJSON("provas", provas);

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, total: provas.length })
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: "Method not allowed"
    };
  } catch (err) {
    console.error("sync-entregas error:", err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
