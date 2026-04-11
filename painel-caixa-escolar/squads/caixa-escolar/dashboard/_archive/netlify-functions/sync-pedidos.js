// Netlify Function: sync-pedidos
// Sincroniza pedidos entre dispositivos (portal escola -> entregador celular)
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
      name: "pedidos",
      siteID: process.env.SITE_ID || "d7c9060f-7563-4f02-9475-ec279d2b32dc",
      token: process.env.NETLIFY_AUTH_TOKEN
    });

    // GET — retorna todos os pedidos
    if (event.httpMethod === "GET") {
      let pedidos = [];
      try {
        const data = await store.get("lista", { type: "json" });
        if (data) pedidos = data;
      } catch (_) {}
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, pedidos })
      };
    }

    // POST — adiciona/atualiza pedido(s)
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const novos = Array.isArray(body.pedidos) ? body.pedidos : body.pedido ? [body.pedido] : [];

      if (novos.length === 0) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "Nenhum pedido enviado" })
        };
      }

      let pedidos = [];
      try {
        const data = await store.get("lista", { type: "json" });
        if (data) pedidos = data;
      } catch (_) {}

      for (const novo of novos) {
        const idx = pedidos.findIndex(p => p.id === novo.id);
        if (idx >= 0) {
          pedidos[idx] = novo;
        } else {
          pedidos.push(novo);
        }
      }

      await store.setJSON("lista", pedidos);

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, total: pedidos.length })
      };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };
  } catch (err) {
    console.error("sync-pedidos error:", err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
