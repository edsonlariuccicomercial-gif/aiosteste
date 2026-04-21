// Unified proxy for Caixa Escolar dashboard — combines sgd-proxy + b2b-scrape + pncp-search
// This avoids hitting the 12-function limit on Vercel Hobby plan

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { corsHeaders } = require('./lib/cors');
const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";

function buildHeaders(cookie, networkId) {
  const h = { "Content-Type": "application/json", Cookie: cookie };
  if (networkId) h["x-network-being-managed-id"] = String(networkId);
  return h;
}

export default async function handler(req, res) {
  corsHeaders(req, res);
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

    // SEFAZ DistribuicaoDFe — buscar NFs de entrada
    if (action === "sefaz-dist-dfe") return await handleSefazDistDFe(params, res);

    // PNCP proxy (supports both new "pncp-search"/"pncp-items" and legacy "search"/"items" action names)
    if (action === "pncp-search" || action === "search") return await handlePncpSearch(params, res);
    if (action === "pncp-items" || action === "items") return await handlePncpItems(params, res);
    if (action === "pncp-detail" || action === "detail") return await handlePncpDetail(params, res);

    // Health check & backup (Story 7.8, 7.4 — consolidated into proxy)
    if (action === "health-check") return await handleHealthCheck(req, res);
    if (action === "backup-fiscal") return await handleBackupFiscal(req, res, params);

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

async function handleListBudgets({ cookie, networkId, page, limit, supplierStatus }, res) {
  const statuses = supplierStatus
    ? (Array.isArray(supplierStatus) ? supplierStatus : [supplierStatus])
    : ["NAEN"];
  const allItems = [];
  let meta = {};
  for (const st of statuses) {
    const params = new URLSearchParams();
    params.set("filter.supplierStatus", "$eq:" + st);
    params.set("page", String(page || 1));
    params.set("limit", String(limit || 50));
    const r = await fetch(`${SGD_API}/budget-proposal/summary-by-supplier-profile?${params}`, { headers: buildHeaders(cookie, networkId) });
    if (!r.ok) continue;
    const data = await r.json();
    const items = (data.data || []).map(item => ({ ...item, supplierStatus: st }));
    allItems.push(...items);
    if (data.meta) meta = { ...meta, ...data.meta, totalItems: (meta.totalItems || 0) + (data.meta.totalItems || 0) };
  }
  return res.status(200).json({ data: allItems, meta });
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

// ===== SEFAZ DistribuicaoDFe — Buscar NFs emitidas contra nosso CNPJ =====

const SEFAZ_DIST_URL = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

async function handleSefazDistDFe({ cnpj, ultNSU }, res) {
  const certBase64 = process.env.NFE_CERT_BASE64;
  const certPassword = process.env.NFE_CERT_PASSWORD || "1234567";
  if (!certBase64) return res.status(500).json({ error: "NFE_CERT_BASE64 não configurado no servidor" });
  if (!cnpj) return res.status(400).json({ error: "CNPJ obrigatório" });

  const cleanCnpj = cnpj.replace(/\D/g, "");
  const nsu = String(ultNSU || 0).padStart(15, "0");

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
<soap12:Body>
<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
<nfeDadosMsg>
<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
<tpAmb>1</tpAmb><cUFAutor>31</cUFAutor><CNPJ>${cleanCnpj}</CNPJ>
<distNSU><ultNSU>${nsu}</ultNSU></distNSU>
</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>
</soap12:Body></soap12:Envelope>`;

  try {
    const https = await import("https");
    const zlib = await import("zlib");
    const pfxBuffer = Buffer.from(certBase64, "base64");
    const body = Buffer.from(soap, "utf8");

    const sefazResp = await new Promise((resolve, reject) => {
      const req = https.request(SEFAZ_DIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8", "Content-Length": body.length },
        pfx: pfxBuffer, passphrase: certPassword, minVersion: "TLSv1.2"
      }, (r) => {
        let raw = ""; r.on("data", c => raw += c); r.on("end", () => resolve(raw));
      });
      req.on("error", reject);
      req.write(body); req.end();
    });

    const cStat = (sefazResp.match(/<cStat>(\d+)<\/cStat>/) || [])[1] || "";
    const xMotivo = (sefazResp.match(/<xMotivo>([^<]+)<\/xMotivo>/) || [])[1] || "";
    const maxNSU = (sefazResp.match(/<maxNSU>(\d+)<\/maxNSU>/) || [])[1] || "0";
    const ultNSUResp = (sefazResp.match(/<ultNSU>(\d+)<\/ultNSU>/) || [])[1] || "0";

    // Extrair documentos
    const docs = [];
    const docZips = sefazResp.match(/<docZip[^>]*>([^<]+)<\/docZip>/g) || [];
    for (const dz of docZips) {
      try {
        const b64 = dz.replace(/<[^>]+>/g, "");
        const xml = zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");

        const tag = (t) => (xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1] || "";
        const emitNome = (xml.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/) || [])[1] || "";
        const emitCnpj = (xml.match(/<emit>[\s\S]*?<CNPJ>([^<]+)<\/CNPJ>/) || [])[1] || "";
        const nNF = tag("nNF");
        const chNFe = tag("chNFe") || (xml.match(/Id="NFe(\d{44})"/) || [])[1] || "";
        const vNF = Number(tag("vNF") || 0);
        const dhEmi = tag("dhEmi") || tag("dEmi");

        // Extrair itens
        const itens = [];
        const detMatches = xml.match(/<det\s[^>]*>[\s\S]*?<\/det>/g) || [];
        for (const det of detMatches) {
          const pTag = (t) => (det.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1] || "";
          itens.push({
            descricao: pTag("xProd"),
            ncm: pTag("NCM"),
            unidade: pTag("uCom"),
            quantidade: Number(pTag("qCom") || 0),
            valorUnitario: Number(pTag("vUnCom") || 0),
            valorTotal: Number(pTag("vProd") || 0),
            codigo: pTag("cProd")
          });
        }

        if (nNF || chNFe) {
          docs.push({ nNF, chave: chNFe, fornecedor: emitNome, cnpjEmitente: emitCnpj, valor: vNF, emitidaEm: dhEmi, itens });
        }
      } catch (_) { /* skip malformed */ }
    }

    return res.status(200).json({ cStat, xMotivo, maxNSU: Number(maxNSU), ultNSU: Number(ultNSUResp), documentos: docs });
  } catch (err) {
    return res.status(500).json({ error: "SEFAZ DistDFe: " + err.message });
  }
}

// ===== HEALTH CHECK (Story 7.8 + 7.10) =====
async function handleHealthCheck(req, res) {
  const checks = {};
  let overallStatus = "healthy";

  // SGD
  try {
    const start = Date.now();
    const r = await fetch(SGD_API, { signal: AbortSignal.timeout(10000) });
    checks.sgd = { status: r.ok ? "healthy" : "degraded", latency_ms: Date.now() - start, http_status: r.status };
  } catch (e) {
    checks.sgd = { status: "critical", message: e.message };
  }

  // Supabase
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (SB_URL && SB_KEY) {
    try {
      const start = Date.now();
      const r = await fetch(SB_URL + "/rest/v1/", { headers: { apikey: SB_KEY }, signal: AbortSignal.timeout(5000) });
      checks.supabase = { status: r.ok ? "healthy" : "degraded", latency_ms: Date.now() - start };
    } catch (e) {
      checks.supabase = { status: "critical", message: e.message };
    }
  }

  // Certificate check
  if (SB_URL && SB_KEY) {
    try {
      const r = await fetch(SB_URL + "/rest/v1/empresas?select=id,config_fiscal&limit=10", {
        headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY }, signal: AbortSignal.timeout(5000)
      });
      if (r.ok) {
        const empresas = await r.json();
        const alerts = [];
        for (const emp of empresas) {
          const valStr = emp.config_fiscal?.certificadoValidade || emp.config_fiscal?.validade;
          if (!valStr) continue;
          const days = Math.floor((new Date(valStr) - new Date()) / 86400000);
          if (days < 0) alerts.push({ empresa_id: emp.id, issue: "expired", days });
          else if (days < 30) alerts.push({ empresa_id: emp.id, issue: "expiring_soon", days });
        }
        checks.certificate = alerts.length ? { status: alerts.some(a => a.days < 0) ? "critical" : "warning", alerts } : { status: "healthy" };
      }
    } catch (_) {}
  }

  const statuses = Object.values(checks).map(c => c.status);
  if (statuses.includes("critical")) overallStatus = "critical";
  else if (statuses.includes("warning")) overallStatus = "warning";

  return res.status(overallStatus === "healthy" ? 200 : overallStatus === "critical" ? 503 : 207).json({
    status: overallStatus, timestamp: new Date().toISOString(), checks
  });
}

// ===== BACKUP FISCAL (Story 7.4) =====
async function handleBackupFiscal(req, res, params) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BACKUP_SECRET = process.env.BACKUP_CRON_SECRET || "";

  if (BACKUP_SECRET && params.secret !== BACKUP_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: "Missing SUPABASE env vars" });
  }

  const headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
  const results = { tables: {}, errors: [], timestamp: new Date().toISOString() };

  try {
    const [nfs, counter, contas] = await Promise.all([
      fetch(SB_URL + "/rest/v1/notas_fiscais?select=*", { headers }).then(r => r.json()),
      fetch(SB_URL + "/rest/v1/nf_counter?select=*", { headers }).then(r => r.json()),
      fetch(SB_URL + "/rest/v1/contas_receber?select=*", { headers }).then(r => r.json())
    ]);

    results.tables = { notas_fiscais: nfs.length || 0, nf_counter: counter.length || 0, contas_receber: contas.length || 0 };

    const payload = JSON.stringify({ version: "1.0", exported_at: results.timestamp, data: { notas_fiscais: nfs, nf_counter: counter, contas_receber: contas } });
    const now = new Date();
    const filePath = `daily/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.toISOString().split("T")[0]}.json`;

    await fetch(SB_URL + "/storage/v1/object/fiscal-backups/" + filePath, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json", "x-upsert": "true" }, body: payload
    });

    results.success = true;
    return res.status(200).json(results);
  } catch (err) {
    results.errors.push({ error: err.message });
    return res.status(500).json(results);
  }
}
