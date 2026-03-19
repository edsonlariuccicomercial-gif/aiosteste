const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-sgd-cookie, x-sgd-network-id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { action, ...params } = req.body || {};

    if (action === "login") return await handleLogin(params, res);
    if (action === "list-budgets") return await handleListBudgets(params, res);
    if (action === "budget-detail") return await handleBudgetDetail(params, res);
    if (action === "budget-items") return await handleBudgetItems(params, res);
    if (action === "send-proposal") return await handleSendProposal(params, res);

    return res.status(400).json({ error: "Unknown action: " + action });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleLogin({ cnpj, password }, res) {
  const r = await fetch(`${SGD_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txCpfCnpj: cnpj, txPassword: password }),
    redirect: "manual",
  });

  if (r.status !== 200 && r.status !== 201) {
    const text = await r.text().catch(() => "");
    return res.status(401).json({ error: `Login failed (${r.status}): ${text}` });
  }

  const setCookie = r.headers.get("set-cookie") || "";
  const match = setCookie.match(/sessionToken=([^;]+)/);
  if (!match) return res.status(401).json({ error: "No sessionToken in response" });

  return res.status(200).json({ cookie: `sessionToken=${match[1]}` });
}

async function handleListBudgets({ cookie, networkId, page, limit }, res) {
  const params = new URLSearchParams();
  params.set("filter.supplierStatus", "$eq:NAEN");
  params.set("page", String(page || 1));
  params.set("limit", String(limit || 50));

  const r = await fetch(
    `${SGD_API}/budget-proposal/summary-by-supplier-profile?${params}`,
    { headers: buildHeaders(cookie, networkId) }
  );
  if (!r.ok) return res.status(r.status).json({ error: `listBudgets failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleBudgetDetail({ cookie, networkId, idSubprogram, idSchool, idBudget }, res) {
  const r = await fetch(
    `${SGD_API}/budget/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`,
    { headers: buildHeaders(cookie, networkId) }
  );
  if (!r.ok) return res.status(r.status).json({ error: `getBudgetDetail failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleBudgetItems({ cookie, networkId, idSubprogram, idSchool, idBudget }, res) {
  const r = await fetch(
    `${SGD_API}/budget-item/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}?limit=9999`,
    { headers: buildHeaders(cookie, networkId) }
  );
  if (!r.ok) return res.status(r.status).json({ error: `getBudgetItems failed (${r.status})` });
  return res.status(200).json(await r.json());
}

async function handleSendProposal({ cookie, networkId, idSubprogram, idSchool, idBudget, payload }, res) {
  const r = await fetch(
    `${SGD_API}/budget-proposal/send-proposal/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`,
    {
      method: "POST",
      headers: buildHeaders(cookie, networkId),
      body: JSON.stringify(payload),
    }
  );
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(r.status).json({ error: `sendProposal failed (${r.status}): ${JSON.stringify(body)}` });
  return res.status(200).json(body);
}

function buildHeaders(cookie, networkId) {
  const h = { "Content-Type": "application/json", Cookie: cookie };
  if (networkId) h["x-network-being-managed-id"] = String(networkId);
  return h;
}
