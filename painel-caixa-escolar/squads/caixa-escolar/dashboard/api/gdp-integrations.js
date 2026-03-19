import nfeClient from "./lib/nfe-sefaz-client.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ohxoxencxktpzskltbsk.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeG94ZW5jeGt0cHpza2x0YnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE3MjA2NDQsImV4cCI6MjA1NzI5NjY0NH0.kfPOFatyV8GwBdFe-MQf-tCpez1Slnq66roOBuvdzRw";
const STORE_KEY = "gdp.integracoes.eventos.v1";
const MODE = process.env.GDP_INTEGRATIONS_MODE || "queue";
const { getSefazConfig, validateSefazConfig, buildNfePayloadFromPedido, emitirNfeDireta, summarizeCertificateInput, summarizePemInput, buildNfeXml, buildXmlDsigPreview, buildLoteXml, buildAutorizacaoRequestPreview } = nfeClient;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function supaGet(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/nexedu_sync?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) return [];
  const rows = await r.json();
  if (!rows.length) return [];
  try {
    return JSON.parse(rows[0].value);
  } catch (_) {
    return [];
  }
}

async function supaSet(key, value) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates"
  };
  const body = JSON.stringify({ key, value: JSON.stringify(value) });
  await fetch(`${SUPABASE_URL}/rest/v1/nexedu_sync`, { method: "POST", headers, body });
}

function buildProtocol(event) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `GDP-${String(event.channel || "OPS").slice(0, 4).toUpperCase()}-${stamp}`;
}

function getWebhookUrl(channel) {
  if (channel === "sefaz") return process.env.GDP_SEFAZ_WEBHOOK_URL || "";
  if (channel === "bancaria") return process.env.GDP_BANK_WEBHOOK_URL || "";
  if (channel === "comunicacao") return process.env.GDP_COMM_WEBHOOK_URL || "";
  return process.env.GDP_OPS_WEBHOOK_URL || "";
}

async function forwardEvent(event, protocol) {
  const url = getWebhookUrl(event.channel);
  if (!url) {
    return {
      status: "registrado_backend",
      provider: "queue_local",
      protocol
    };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: MODE,
      protocol,
      receivedAt: new Date().toISOString(),
      event
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Webhook ${event.channel}: HTTP ${resp.status}`);
  }

  return {
    status: data.status || "encaminhado_webhook",
    provider: data.provider || "webhook",
    protocol: data.protocol || protocol,
    remote: data
  };
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const action = req.query?.action || "";
      if (action === "nfe-sefaz-config") {
        const config = getSefazConfig();
        const missing = validateSefazConfig(config);
        const certificate = summarizeCertificateInput(config.certificadoBase64);
        const pem = summarizePemInput(config.certificadoPem, config.chavePrivadaPem);
        return res.status(200).json({
          ok: true,
          ambiente: config.ambiente,
          uf: config.uf,
          emitente: {
            cnpj: config.cnpjEmitente ? "***configurado***" : "",
            razaoSocial: config.razaoSocial || "",
            ie: config.ie ? "***configurado***" : ""
          },
          certificado: certificate.status,
          certificadoBytes: certificate.bytes,
          certificadoMensagem: certificate.message,
          pem,
          missing
        });
      }
      const items = await supaGet(STORE_KEY);
      return res.status(200).json({ ok: true, items });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    if (body.action === "nfe-sefaz-preview") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const config = getSefazConfig();
      const xmlPreview = buildNfeXml(payload);
      const xmlDsigPreview = buildXmlDsigPreview(xmlPreview.xml, config);
      const lotePreview = buildLoteXml(xmlDsigPreview.signedXml || xmlPreview.xml);
      const autorizacaoPreview = buildAutorizacaoRequestPreview(payload, lotePreview);
      return res.status(200).json({ ok: true, action: body.action, payload, xmlPreview, xmlDsigPreview, lotePreview, autorizacaoPreview });
    }

    if (body.action === "nfe-sefaz-emitir") {
      const pedido = body.pedido || null;
      if (!pedido?.id) return res.status(400).json({ ok: false, error: "pedido.id obrigatorio" });
      const payload = buildNfePayloadFromPedido(pedido, body.overrides || {});
      const result = await emitirNfeDireta(payload);
      return res.status(result.ok ? 200 : 501).json({ ok: result.ok, action: body.action, result });
    }

    const event = body.event || null;
    if (!event?.id || !event?.entityType || !event?.action) {
      return res.status(400).json({ ok: false, error: "Payload incompleto: event.id, event.entityType, event.action" });
    }

    const items = await supaGet(STORE_KEY);
    const protocol = buildProtocol(event);
    const forwarded = await forwardEvent(event, protocol);
    const normalized = {
      ...event,
      status: forwarded.status,
      protocol: forwarded.protocol,
      provider: forwarded.provider,
      remote: forwarded.remote || null,
      receivedAt: new Date().toISOString()
    };

    const idx = items.findIndex((item) => item.id === event.id);
    if (idx >= 0) items[idx] = normalized;
    else items.unshift(normalized);

    await supaSet(STORE_KEY, items.slice(0, 1000));
    return res.status(200).json({ ok: true, status: normalized.status, protocol: normalized.protocol, provider: normalized.provider, item: normalized });
  } catch (err) {
    console.error("gdp-integrations error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
