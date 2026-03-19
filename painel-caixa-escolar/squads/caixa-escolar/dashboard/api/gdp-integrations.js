const SUPABASE_URL = process.env.SUPABASE_URL || "https://ohxoxencxktpzskltbsk.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeG94ZW5jeGt0cHpza2x0YnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE3MjA2NDQsImV4cCI6MjA1NzI5NjY0NH0.kfPOFatyV8GwBdFe-MQf-tCpez1Slnq66roOBuvdzRw";
const STORE_KEY = "gdp.integracoes.eventos.v1";

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

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const items = await supaGet(STORE_KEY);
      return res.status(200).json({ ok: true, items });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const event = body.event || null;
    if (!event?.id || !event?.entityType || !event?.action) {
      return res.status(400).json({ ok: false, error: "Payload incompleto: event.id, event.entityType, event.action" });
    }

    const items = await supaGet(STORE_KEY);
    const protocol = buildProtocol(event);
    const normalized = {
      ...event,
      status: "registrado_backend",
      protocol,
      receivedAt: new Date().toISOString()
    };

    const idx = items.findIndex((item) => item.id === event.id);
    if (idx >= 0) items[idx] = normalized;
    else items.unshift(normalized);

    await supaSet(STORE_KEY, items.slice(0, 1000));
    return res.status(200).json({ ok: true, status: normalized.status, protocol, item: normalized });
  } catch (err) {
    console.error("gdp-integrations error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
