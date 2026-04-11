/* Netlify Function — SGD API Proxy
   Proxies requests to api.caixaescolar.educacao.mg.gov.br
   to avoid CORS issues from the browser */

const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-sgd-cookie, x-sgd-network-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { action, ...params } = JSON.parse(event.body || "{}");

    if (action === "login") {
      return await handleLogin(params);
    }
    if (action === "list-budgets") {
      return await handleListBudgets(params);
    }
    if (action === "budget-detail") {
      return await handleBudgetDetail(params);
    }
    if (action === "budget-items") {
      return await handleBudgetItems(params);
    }
    if (action === "send-proposal") {
      return await handleSendProposal(params);
    }

    return respond(400, { error: "Unknown action: " + action });
  } catch (err) {
    return respond(500, { error: err.message });
  }
};

async function handleLogin({ cnpj, password }) {
  const res = await fetch(`${SGD_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txCpfCnpj: cnpj, txPassword: password }),
    redirect: "manual",
  });

  if (res.status !== 200 && res.status !== 201) {
    const text = await res.text().catch(() => "");
    return respond(401, { error: `Login failed (${res.status}): ${text}` });
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/sessionToken=([^;]+)/);
  if (!match) {
    return respond(401, { error: "No sessionToken in response" });
  }

  return respond(200, { cookie: `sessionToken=${match[1]}` });
}

async function handleListBudgets({ cookie, networkId, page, limit }) {
  const params = new URLSearchParams();
  params.set("filter.supplierStatus", "$eq:NAEN");
  params.set("page", String(page || 1));
  params.set("limit", String(limit || 50));

  const res = await fetch(
    `${SGD_API}/budget-proposal/summary-by-supplier-profile?${params}`,
    { headers: buildHeaders(cookie, networkId) }
  );
  if (!res.ok) return respond(res.status, { error: `listBudgets failed (${res.status})` });
  return respond(200, await res.json());
}

async function handleBudgetDetail({ cookie, networkId, idSubprogram, idSchool, idBudget }) {
  const res = await fetch(
    `${SGD_API}/budget/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`,
    { headers: buildHeaders(cookie, networkId) }
  );
  if (!res.ok) return respond(res.status, { error: `getBudgetDetail failed (${res.status})` });
  return respond(200, await res.json());
}

async function handleBudgetItems({ cookie, networkId, idSubprogram, idSchool, idBudget }) {
  const res = await fetch(
    `${SGD_API}/budget-item/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}?limit=9999`,
    { headers: buildHeaders(cookie, networkId) }
  );
  if (!res.ok) return respond(res.status, { error: `getBudgetItems failed (${res.status})` });
  return respond(200, await res.json());
}

async function handleSendProposal({ cookie, networkId, idSubprogram, idSchool, idBudget, payload }) {
  const res = await fetch(
    `${SGD_API}/budget-proposal/send-proposal/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`,
    {
      method: "POST",
      headers: buildHeaders(cookie, networkId),
      body: JSON.stringify(payload),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return respond(res.status, { error: `sendProposal failed (${res.status}): ${JSON.stringify(body)}` });
  return respond(200, body);
}

function buildHeaders(cookie, networkId) {
  const h = { "Content-Type": "application/json", Cookie: cookie };
  if (networkId) h["x-network-being-managed-id"] = String(networkId);
  return h;
}

function respond(status, body) {
  return {
    statusCode: status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
