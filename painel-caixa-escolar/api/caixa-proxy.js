// Unified proxy for Caixa Escolar dashboard — combines sgd-proxy + b2b-scrape + pncp-search
// This avoids hitting the 12-function limit on Vercel Hobby plan

const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function buildHeaders(cookie, networkId) {
  const h = { "Content-Type": "application/json", Cookie: cookie };
  if (networkId) h["x-network-being-managed-id"] = String(networkId);
  return h;
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { action, ...params } = req.body || {};

    // SGD actions
    if (action === "login") return await handleLogin(params, res);
    if (action === "get-user") return await handleGetUser(params, res);
    if (action === "list-budgets") return await handleListBudgets(params, res);
    if (action === "budget-detail") return await handleBudgetDetail(params, res);
    if (action === "budget-items") return await handleBudgetItems(params, res);
    if (action === "send-proposal") return await handleSendProposal(params, res);

    // B2B scrape
    if (action === "b2b-scrape") return await handleB2bScrape(params, res);

    // PNCP proxy (supports both new "pncp-search"/"pncp-items" and legacy "search"/"items" action names)
    if (action === "pncp-search" || action === "search") return await handlePncpSearch(params, res);
    if (action === "pncp-items" || action === "items") return await handlePncpItems(params, res);
    if (action === "pncp-detail" || action === "detail") return await handlePncpDetail(params, res);

    return res.status(400).json({ error: "Unknown action: " + action });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ===== SGD HANDLERS =====

async function handleLogin({ cnpj, password }, res) {
  const r = await fetch(`${SGD_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txCpfCnpj: cnpj, txPassword: password }),
    redirect: "manual",
  });
  if (r.status >= 400) {
    const text = await r.text().catch(() => "");
    return res.status(401).json({ error: `Login failed (${r.status}): ${text}` });
  }
  const setCookie = r.headers.get("set-cookie") || "";
  const match = setCookie.match(/sessionToken=([^;]+)/);
  if (!match) return res.status(401).json({ error: "No sessionToken in response" });
  return res.status(200).json({ cookie: `sessionToken=${match[1]}` });
}

async function handleGetUser({ cookie }, res) {
  const r = await fetch(`${SGD_API}/auth/user`, { headers: buildHeaders(cookie, null) });
  if (!r.ok) return res.status(r.status).json({ error: `getUser failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleListBudgets({ cookie, networkId, page, limit }, res) {
  const params = new URLSearchParams();
  params.set("filter.supplierStatus", "$eq:NAEN");
  params.set("page", String(page || 1));
  params.set("limit", String(limit || 50));
  const r = await fetch(`${SGD_API}/budget-proposal/summary-by-supplier-profile?${params}`, { headers: buildHeaders(cookie, networkId) });
  if (!r.ok) return res.status(r.status).json({ error: `listBudgets failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleBudgetDetail({ cookie, networkId, idSubprogram, idSchool, idBudget }, res) {
  const r = await fetch(`${SGD_API}/budget/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`, { headers: buildHeaders(cookie, networkId) });
  if (!r.ok) return res.status(r.status).json({ error: `getBudgetDetail failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleBudgetItems({ cookie, networkId, idSubprogram, idSchool, idBudget }, res) {
  const r = await fetch(`${SGD_API}/budget-item/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}?limit=9999`, { headers: buildHeaders(cookie, networkId) });
  if (!r.ok) return res.status(r.status).json({ error: `getBudgetItems failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleSendProposal({ cookie, networkId, idSubprogram, idSchool, idBudget, payload }, res) {
  const r = await fetch(`${SGD_API}/budget-proposal/send-proposal/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`, {
    method: "POST", headers: buildHeaders(cookie, networkId), body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(r.status).json({ error: `sendProposal failed (${r.status}): ${JSON.stringify(body)}` });
  return res.status(200).json(body);
}

// ===== B2B SCRAPE HANDLER =====

async function handleB2bScrape({ url }, res) {
  if (!url) return res.status(400).json({ error: "URL required" });
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html,*/*" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });
  if (!r.ok) return res.status(r.status).json({ error: `Fetch failed (${r.status})` });
  const html = await r.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim().slice(0, 15000);
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  return res.status(200).json({ text, title, url });
}

// ===== PNCP HANDLERS =====

const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1";
const PNCP_HEADERS = { "Accept": "application/json", "User-Agent": "PainelCaixaEscolar/1.0" };

async function handlePncpSearch({ termo, uf, dataInicial, dataFinal, pagina }, res) {
  const params = new URLSearchParams({
    q: termo || "",
    uf: uf || "MG",
    dataInicial: dataInicial || getDateMonthsAgo(6),
    dataFinal: dataFinal || getToday(),
    pagina: String(pagina || 1),
    tamanhoPagina: "20",
  });
  const r = await fetch(`${PNCP_BASE}/contratacoes?${params}`, { headers: PNCP_HEADERS });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return res.status(r.status).json({ error: `PNCP search failed (${r.status})`, detail: errText });
  }
  return res.status(200).json(await r.json());
}

async function handlePncpItems({ cnpj, ano, seq }, res) {
  const r = await fetch(`${PNCP_BASE}/contratacoes/${encodeURIComponent(cnpj)}/${ano}/${seq}/itens`, { headers: PNCP_HEADERS });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return res.status(r.status).json({ error: `PNCP items failed (${r.status})`, detail: errText });
  }
  return res.status(200).json(await r.json());
}

async function handlePncpDetail({ cnpj, ano, seq }, res) {
  const r = await fetch(`${PNCP_BASE}/contratacoes/${encodeURIComponent(cnpj)}/${ano}/${seq}`, { headers: PNCP_HEADERS });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return res.status(r.status).json({ error: `PNCP detail failed (${r.status})`, detail: errText });
  }
  return res.status(200).json(await r.json());
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getDateMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0];
}
