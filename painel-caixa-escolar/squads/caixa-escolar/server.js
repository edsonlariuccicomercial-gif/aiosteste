/* ===================================================================
   Express Server — Caixa Escolar MG (Modo Local) — Fase 4
   Serves dashboard + SGD REST API integration + varredura automática
   =================================================================== */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const fs = require("fs");
const cron = require("node-cron");
const { SgdClient } = require("./sgd-client");
const { sendToOlist } = require("../../scripts/olist-adapter");

const app = express();
const PORT = process.env.PORT || 8082;
const DASHBOARD_DIR = path.join(__dirname, "dashboard");
const DATA_DIR = path.join(DASHBOARD_DIR, "data");

app.use(express.json());
app.use(express.static(DASHBOARD_DIR));

// ===== Helpers =====

function getSgdClient() {
  const cnpj = process.env.SGD_CNPJ || process.env.SGD_DOC || process.env.SGD_CPF;
  const pass = process.env.SGD_PASS;
  if (!cnpj || !pass) return null;
  return new SgdClient(cnpj, pass);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ===== GET /api/sgd/status =====
app.get("/api/sgd/status", (_req, res) => {
  const hasCnpj = !!(process.env.SGD_CNPJ || process.env.SGD_DOC || process.env.SGD_CPF);
  const hasPass = !!process.env.SGD_PASS;

  // Read last scan info
  const scanLog = readJson(path.join(DATA_DIR, "sgd-scan-log.json"));

  res.json({
    ok: true,
    mode: "local",
    credentials: hasCnpj && hasPass ? "configured" : "missing",
    lastScan: scanLog ? scanLog.lastScan : null,
  });
});

// ===== POST /api/sgd/submit =====
// Receives proposal data from dashboard and sends directly to SGD REST API
app.post("/api/sgd/submit", async (req, res) => {
  const {
    orcamentoId, idSubprogram, idSchool, idBudget,
    itens, dtGoodsDelivery, dtServiceDelivery,
  } = req.body;

  if (!orcamentoId || !idSubprogram || !idSchool || !idBudget || !itens || !itens.length) {
    return res.status(400).json({ success: false, error: "Payload incompleto. Campos obrigatorios: orcamentoId, idSubprogram, idSchool, idBudget, itens[]" });
  }

  const client = getSgdClient();
  if (!client) {
    return res.status(500).json({ success: false, error: "Credenciais SGD nao configuradas (.env SGD_CNPJ + SGD_PASS)" });
  }

  try {
    // 1. Login + resolve networkId
    await client.login();
    await client.getUser();
    // getUser may not return networkId; fetch one page of budgets to resolve it
    if (!client.networkId) {
      await client.listBudgets({ status: "NAEN" }, 1, 1);
    }

    // 2. Get budget detail to extract idAxis
    const budgetDetail = await client.getBudgetDetail(idSubprogram, idSchool, idBudget);
    const idAxis = budgetDetail.idAxis || budgetDetail.id_axis;
    if (!idAxis) {
      return res.status(500).json({ success: false, error: "Nao foi possivel obter idAxis do orcamento." });
    }

    // 3. Get budget items to map idBudgetItem
    const budgetItemsRes = await client.getBudgetItems(idSubprogram, idSchool, idBudget);
    const budgetItems = budgetItemsRes.data || budgetItemsRes.items || budgetItemsRes || [];

    // 4. Build the real SGD proposal payload
    const proposalItems = itens.map((item, idx) => {
      // Match by: 1) explicit idBudgetItem, 2) name fuzzy match, 3) index position
      let matched = null;
      if (Array.isArray(budgetItems)) {
        // Normalize: remove newlines, extra spaces, lowercase
        const norm = (s) => (s || "").replace(/\n/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
        const itemName = norm(item.nome);

        matched = budgetItems.find((bi) => {
          const biName = norm(bi.txBudgetItemType || bi.txName || bi.txDescription || bi.name || "");
          const biDesc = norm(bi.txDescription || "");
          return biName.includes(itemName) || itemName.includes(biName) ||
                 biDesc.includes(itemName) || itemName.includes(biDesc);
        });

        // Fallback: match by index position
        if (!matched && budgetItems[idx]) {
          matched = budgetItems[idx];
        }
      }

      const idBudgetItem = item.idBudgetItem || (matched ? (matched.idBudgetItem || matched.id) : null);

      const proposalItem = {
        nuValueByItem: item.precoUnitario,
        idBudgetItem: idBudgetItem,
        txItemObservation: item.observacao || item.nome || "Conforme especificado",
      };

      if (item.garantia) {
        proposalItem.txWarrantyDescription = item.garantia;
      }

      return proposalItem;
    });

    // Validate all items have idBudgetItem
    const missing = proposalItems.filter((p) => !p.idBudgetItem);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Nao foi possivel mapear idBudgetItem para ${missing.length} item(ns). Verifique os nomes dos itens.`,
        budgetItemsAvailable: Array.isArray(budgetItems) ? budgetItems.map((bi) => ({
          id: bi.idBudgetItem || bi.id,
          name: bi.txBudgetItemType || bi.txName || bi.txDescription || bi.name,
        })) : [],
      });
    }

    const sgdPayload = {
      dtGoodsDelivery: dtGoodsDelivery || new Date().toISOString(),
      dtServiceDelivery: dtServiceDelivery || new Date().toISOString(),
      idAxis: idAxis,
      budgetProposalItems: proposalItems,
    };

    // 5. Send proposal
    const result = await client.sendProposal(idSubprogram, idSchool, idBudget, sgdPayload);

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      orcamentoId,
      idBudget,
      status: "sent",
      sgdResponse: result,
    };
    writeJson(path.join(DATA_DIR, "sgd-prequote-submit-report.json"), report);

    res.json({ success: true, report });
  } catch (err) {
    console.error("[SGD Submit Error]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== POST /api/sgd/scan =====
// Full scan of SGD budgets — fetches all pages, enriches with local data
app.post("/api/sgd/scan", async (req, res) => {
  try {
    const sresAtivas = req.body && Array.isArray(req.body.sresAtivas) ? req.body.sresAtivas : null;
    const result = await executeSgdScan(sresAtivas);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[SGD Scan Error]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function executeSgdScan(sresAtivas) {
  const client = getSgdClient();
  if (!client) {
    throw new Error("Credenciais SGD nao configuradas (.env SGD_CNPJ + SGD_PASS)");
  }

  await client.login();

  // Get user info for context + resolve networkId + allNetworks
  let userInfo = {};
  try { userInfo = await client.getUser(); } catch (_) { /* optional */ }
  // Fallback: if networkId not found in user, first listBudgets call will set it

  // Scan all budgets with status "Não Enviada" (NAEN) — iterates ALL networks
  const budgets = await client.scanAllBudgets("NAEN");
  console.log(`[SGD Scan] Found ${budgets.length} budgets with status NAEN across ${client.allNetworks.length || 1} network(s)`);

  // Load existing orcamentos for merge
  const orcamentosPath = path.join(DATA_DIR, "orcamentos.json");
  const existingOrcamentos = readJson(orcamentosPath) || [];
  const existingMap = new Map(existingOrcamentos.map((o) => [o.id, o]));

  // Load authoritative SRE↔Município mapping (source: SEE-MG official)
  const sreMunicipiosData = readJson(path.join(DATA_DIR, "sre-municipios.json")) || {};
  const municipioToSre = sreMunicipiosData.municipioToSre || {};

  // Build normalized lookup: "CARNEIRINHO" → "Uberaba"
  const sreNorm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase().trim();
  const normMunicipioToSre = {};
  for (const [mun, sre] of Object.entries(municipioToSre)) {
    normMunicipioToSre[sreNorm(mun)] = sre;
  }
  console.log(`[SGD Scan] Loaded authoritative SRE mapping: ${Object.keys(municipioToSre).length} municípios → ${Object.keys(sreMunicipiosData.sreToMunicipios || {}).length} SREs`);

  // Resolve SRE from municipality name (SGD countyName)
  function resolveSre(countyName) {
    if (!countyName) return "Desconhecida";
    const norm = sreNorm(countyName);
    if (normMunicipioToSre[norm]) return normMunicipioToSre[norm];
    // Fuzzy: try partial match (e.g. "Belo Horizonte" → Metropolitana C)
    for (const [key, sre] of Object.entries(normMunicipioToSre)) {
      if (norm.includes(key) || key.includes(norm)) return sre;
    }
    return "Desconhecida";
  }

  // Enrich ALL budgets using countyName → SRE mapping (definitive)
  // Then filter by sresAtivas if provided
  const sreNormLookup = {};
  if (Array.isArray(sresAtivas) && sresAtivas.length > 0) {
    // Build normalized SRE name set from sresAtivas IDs (e.g. "uberaba" → "Uberaba")
    const SRE_ID_TO_NAME = {};
    for (const [mun, sre] of Object.entries(municipioToSre)) {
      const id = sre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");
      SRE_ID_TO_NAME[id] = sre;
    }
    sresAtivas.forEach(id => { sreNormLookup[sreNorm(SRE_ID_TO_NAME[id] || id)] = true; });
  }
  const hasSreFilter = Object.keys(sreNormLookup).length > 0;

  const enriched = budgets.map((b) => {
    const countyName = b.countyName || b.txCountyName || "";
    b._municipio = countyName;
    b._sre = resolveSre(countyName);
    return b;
  });

  // Filter: only keep budgets from selected SREs (if filter active)
  const filtered = hasSreFilter
    ? enriched.filter(b => sreNormLookup[sreNorm(b._sre)])
    : enriched;

  console.log(`[SGD Scan] ${filtered.length} budgets after SRE filter (from ${budgets.length} total, filter: ${hasSreFilter ? sresAtivas.join(",") : "none"})`);

  let novos = 0;
  let atualizados = 0;
  let skipped = 0;

  for (const b of filtered) {
    const id = String(b.idBudget || b.id || "");
    if (!id) continue;

    // Skip detail fetch for existing budgets (already have objeto/itens)
    // Only fetch details for NEW budgets not yet in our database
    const existing = existingMap.get(id);
    if (existing && existing.objeto && existing.itens && existing.itens.length > 0) {
      // Update SRE/municipio from authoritative mapping (may have been wrong before)
      existing.sre = b._sre || existing.sre;
      existing.municipio = b._municipio || existing.municipio;
      atualizados++;
      skipped++;
      continue;
    }

    // API list fields: schoolName, year, dtProposalSubmission, expenseGroupId, idCounty
    const escola = b.schoolName || b.txSchoolName || "";
    const municipio = b._municipio || "";

    const orcamento = {
      id: id,
      idBudget: b.idBudget || b.id,
      ano: b.year || new Date().getFullYear(),
      escola: escola,
      municipio: municipio,
      sre: b._sre || "Desconhecida",
      grupo: "",
      subPrograma: "",
      objeto: "",
      prazo: b.dtProposalSubmission ? b.dtProposalSubmission.slice(0, 10) : "",
      prazoEntrega: "",
      status: "aberto",
      participantes: "PJ",
      itens: [],
      idAxis: b.idAxis || null,
      idNetwork: b.idNetwork || null,
      valorEstimado: null,
      expenseGroupId: b.expenseGroupId || null,
      idSchool: b.idSchool || null,
      idSubprogram: b.idSubprogram || null,
    };

    // Switch to budget's own networkId (each SRE has different networkId)
    if (b.idNetwork) client.networkId = b.idNetwork;

    // Fetch budget detail (for initiativeDescription/objeto, dates, etc.)
    if (orcamento.idSubprogram && orcamento.idSchool && orcamento.idBudget) {
      let detail = {};
      try {
        detail = await client.getBudgetDetail(
          orcamento.idSubprogram, orcamento.idSchool, orcamento.idBudget
        );
        orcamento.objeto = detail.initiativeDescription || "";
        orcamento.idAxis = detail.idAxis || orcamento.idAxis;
        orcamento.grupo = detail.expenseGroupDescription || "";
        orcamento.subPrograma = detail.subprogramName || "";
        orcamento.valorEstimado = detail.estimatedValue ? parseFloat(detail.estimatedValue) : null;
        orcamento.participantes = detail.inNaturalPersonAllowed ? "PJ/PF" : "PJ";
        if (detail.dtProposalSubmission) orcamento.prazo = detail.dtProposalSubmission.slice(0, 10);
        if (detail.dtDelivery) orcamento.prazoEntrega = detail.dtDelivery.slice(0, 10);
      } catch (err) {
        console.warn(`[SGD Scan] Could not fetch detail for budget ${id}: ${err.message}`);
      }

      // Use detail countyName for more precise municipality if available
      if (detail.countyName || detail.txCountyName) {
        const detailCounty = detail.countyName || detail.txCountyName;
        orcamento.municipio = detailCounty;
        orcamento.sre = resolveSre(detailCounty);
      }

      try {
        const itemsRes = await client.getBudgetItems(
          orcamento.idSubprogram, orcamento.idSchool, orcamento.idBudget
        );
        const items = itemsRes.data || itemsRes.items || itemsRes || [];
        orcamento.itens = (Array.isArray(items) ? items : []).map((i) => ({
          nome: i.txBudgetItemType || i.txName || i.name || "",
          descricao: i.txDescription || i.description || "",
          categoria: i.txExpenseCategory || i.txCategory || i.category || "Custeio",
          unidade: i.txBudgetItemUnit || i.txUnit || i.unit || "",
          quantidade: i.nuQuantity || i.quantity || 0,
          garantia: i.txWarrantyRequired || i.txWarranty || "",
          idBudgetItem: i.idBudgetItem || i.id || null,
        }));
      } catch (err) {
        console.warn(`[SGD Scan] Could not fetch items for budget ${id}: ${err.message}`);
      }
    }

    if (existingMap.has(id)) {
      // Merge: preserve local-only fields, update SGD fields
      const existing = existingMap.get(id);
      Object.assign(existing, orcamento, {
        // Preserve local overrides if they exist
        status: existing.status === "encerrado" ? "encerrado" : orcamento.status,
      });
      atualizados++;
    } else {
      existingOrcamentos.push(orcamento);
      novos++;
    }
  }

  // Save updated orcamentos
  writeJson(orcamentosPath, existingOrcamentos);

  // Save scan log
  const sreBreakdown = {};
  existingOrcamentos.forEach(o => { sreBreakdown[o.sre || "?"] = (sreBreakdown[o.sre || "?"] || 0) + 1; });
  const scanLog = {
    lastScan: new Date().toISOString(),
    novos,
    atualizados,
    total: existingOrcamentos.length,
    budgetsScanned: budgets.length,
    networksScanned: client.allNetworks.length || 1,
    sreBreakdown,
    sresAtivas: sresAtivas || "all",
    user: userInfo.txName || userInfo.name || "",
  };
  writeJson(path.join(DATA_DIR, "sgd-scan-log.json"), scanLog);

  const sreMsg = Object.entries(sreBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ");
  console.log(`[SGD Scan] Done: ${novos} novos, ${atualizados} atualizados (${skipped} skipped), ${existingOrcamentos.length} total (${sreMsg})`);
  return scanLog;
}

// ===== POST /api/olist/order =====
// Receives order from Portal Escolar and sends to Olist/Tiny
app.post("/api/olist/order", async (req, res) => {
  const { orderId, school, cnpj, city, sre, responsible, arp, items, totalValue, obs } = req.body;

  if (!orderId || !school || !items || !items.length) {
    return res.status(400).json({ success: false, error: "Payload incompleto: orderId, school, items[] obrigatorios" });
  }

  const order = {
    id: orderId,
    school,
    city: city || "",
    region: sre || "",
    confirmedAt: new Date().toISOString(),
    items: items.map(i => ({
      sku: i.sku || `ITEM-${i.itemNum || 0}`,
      description: i.description || i.name || "",
      qty: i.qty || 0,
      unitPrice: i.unitPrice || 0,
    })),
    totalValue: totalValue || 0,
    contractRef: arp || "",
  };

  const idempotencyKey = `portal-order:${orderId}`;

  try {
    const result = await sendToOlist(order, idempotencyKey);
    console.log(`[Olist] Pedido ${orderId} enviado → ${result.olistOrderId} (${result.provider})`);
    res.json({ success: true, olistOrderId: result.olistOrderId, provider: result.provider });
  } catch (err) {
    console.error(`[Olist Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== NF-E SEFAZ ENDPOINTS =====
const nfeClient = require("./dashboard/server-lib/nfe-sefaz-client");

// CORS pra requests do frontend Vercel
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Config check
app.get("/api/nfe/config", (req, res) => {
  const cfg = nfeClient.getSefazConfig();
  const validation = nfeClient.validateSefazConfig(cfg);
  res.json({
    ok: validation.valid,
    ambiente: cfg.ambiente,
    cnpj: cfg.cnpjEmitente,
    ie: cfg.ie,
    serie: cfg.seriePadrao,
    certificado: !!cfg.certificadoPem || !!cfg.certificadoBase64,
    chavePrivada: !!cfg.chavePrivadaPem,
    missing: validation.missing || [],
    transmissaoHabilitada: process.env.NFE_ENABLE_TRANSMIT === "true",
  });
});

// Preview (gera XML sem transmitir)
app.post("/api/nfe/preview", async (req, res) => {
  try {
    const { pedido, overrides } = req.body;
    if (!pedido) return res.status(400).json({ ok: false, error: "pedido required" });

    const payload = nfeClient.buildNfePayloadFromPedido(pedido, overrides || {});
    const xml = nfeClient.buildNfeXml(payload);
    const dsig = nfeClient.buildXmlDsigPreview(xml.xml, nfeClient.getSefazConfig());
    const lote = nfeClient.buildLoteXml(dsig.signedXml, payload);
    const auth = nfeClient.buildAutorizacaoRequestPreview ? nfeClient.buildAutorizacaoRequestPreview(payload, lote) : null;

    res.json({
      ok: true,
      payload,
      xmlPreview: xml,
      xmlDsigPreview: dsig,
      lotePreview: lote,
      autorizacaoPreview: auth,
      preview: { numero: payload.identificacao?.numero, serie: payload.identificacao?.serie },
    });
  } catch (err) {
    console.error("[NF-e Preview]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Emitir (gera + assina + transmite à SEFAZ)
app.post("/api/nfe/emitir", async (req, res) => {
  try {
    const { pedido, overrides } = req.body;
    if (!pedido) return res.status(400).json({ ok: false, error: "pedido required" });

    const cfg = nfeClient.getSefazConfig();
    const validation = nfeClient.validateSefazConfig(cfg);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: "Config incompleta", missing: validation.missing });
    }

    if (process.env.NFE_ENABLE_TRANSMIT !== "true") {
      return res.status(400).json({ ok: false, error: "Transmissão desabilitada. Defina NFE_ENABLE_TRANSMIT=true no .env" });
    }

    const payload = nfeClient.buildNfePayloadFromPedido(pedido, overrides || {});
    console.log("[NF-e] Emitindo NF-e para pedido:", pedido.id);
    const resultado = await nfeClient.emitirNfeDireta(payload);
    console.log("[NF-e] Resultado:", JSON.stringify(resultado).slice(0, 200));

    res.json({ ok: resultado.ok !== false, action: "nfe-sefaz-emitir", result: resultado });
  } catch (err) {
    console.error("[NF-e Emitir]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Cancelar NF-e
app.post("/api/nfe/cancelar", async (req, res) => {
  try {
    const { nota, motivo } = req.body;
    if (!nota || !motivo) return res.status(400).json({ ok: false, error: "nota e motivo required" });

    const resultado = await nfeClient.transmitirCancelamentoEvento(nota, motivo);
    res.json({ ok: resultado.ok !== false, action: "nfe-sefaz-cancelar", result: resultado });
  } catch (err) {
    console.error("[NF-e Cancelar]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== CRON: Varredura automática diária às 20h =====
cron.schedule("0 20 * * *", async () => {
  console.log(`[SGD Cron] Iniciando varredura automatica — ${new Date().toISOString()}`);
  try {
    const result = await executeSgdScan();
    console.log(`[SGD Cron] Concluido: ${result.novos} novos, ${result.atualizados} atualizados`);
  } catch (err) {
    console.error(`[SGD Cron] Erro: ${err.message}`);
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`\n  Caixa Escolar MG — Modo Local (Fase 4)`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  SGD API:   http://localhost:${PORT}/api/sgd/status`);
  console.log(`  NF-e:      http://localhost:${PORT}/api/nfe/config`);
  console.log(`  Varredura: Cron diario as 20h ativo\n`);
});
