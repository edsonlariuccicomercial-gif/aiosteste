// Vercel Serverless Function: sync-pedidos
// Migrated from Netlify Blobs → Supabase (nexedu_sync table)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ohxoxencxktpzskltbsk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeG94ZW5jeGt0cHpza2x0YnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE3MjA2NDQsImV4cCI6MjA1NzI5NjY0NH0.kfPOFatyV8GwBdFe-MQf-tCpez1Slnq66roOBuvdzRw';
const STORE_KEY = 'gdp.sync.pedidos';

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function supaGet(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/nexedu_sync?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  if (rows.length === 0) return null;
  try { return JSON.parse(rows[0].value); } catch(_) { return null; }
}

async function supaSet(key, value) {
  const body = JSON.stringify({ key, value: JSON.stringify(value) });
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  };
  await fetch(`${SUPABASE_URL}/rest/v1/nexedu_sync`, { method: 'POST', headers, body });
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const pedidos = (await supaGet(STORE_KEY)) || [];
      return res.status(200).json({ ok: true, pedidos });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const novos = Array.isArray(body.pedidos) ? body.pedidos : body.pedido ? [body.pedido] : [];

      if (novos.length === 0) {
        return res.status(400).json({ ok: false, error: "Nenhum pedido enviado" });
      }

      let pedidos = (await supaGet(STORE_KEY)) || [];

      for (const novo of novos) {
        const idx = pedidos.findIndex(p => p.id === novo.id);
        if (idx >= 0) { pedidos[idx] = novo; } else { pedidos.push(novo); }
      }

      await supaSet(STORE_KEY, pedidos);
      return res.status(200).json({ ok: true, total: pedidos.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("sync-pedidos error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
