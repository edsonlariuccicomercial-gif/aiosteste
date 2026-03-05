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
app.post("/api/sgd/scan", async (_req, res) => {
  try {
    const result = await executeSgdScan();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[SGD Scan Error]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function executeSgdScan() {
  const client = getSgdClient();
  if (!client) {
    throw new Error("Credenciais SGD nao configuradas (.env SGD_CNPJ + SGD_PASS)");
  }

  await client.login();

  // Get user info for context + resolve networkId
  let userInfo = {};
  try { userInfo = await client.getUser(); } catch (_) { /* optional */ }
  // Fallback: if networkId not found in user, first listBudgets call will set it

  // Scan all budgets with status "Não Enviada" (NAEN)
  const budgets = await client.scanAllBudgets("NAEN");
  console.log(`[SGD Scan] Found ${budgets.length} budgets with status NAEN`);

  // Load existing orcamentos for merge
  const orcamentosPath = path.join(DATA_DIR, "orcamentos.json");
  const existingOrcamentos = readJson(orcamentosPath) || [];
  const existingMap = new Map(existingOrcamentos.map((o) => [o.id, o]));

  // Load SRE data for filtering + enrichment (only SRE Uberaba for now)
  const sreData = readJson(path.join(DATA_DIR, "sre-uberaba.json")) || {};
  const sreNorm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase().trim();
  const sreSchools = new Set();
  const schoolToMunicipio = {};
  if (sreData.municipios) {
    sreData.municipios.forEach((m) => {
      (m.escolas || []).forEach((e) => {
        const n = sreNorm(e);
        sreSchools.add(n);
        schoolToMunicipio[n] = m.nome || m.name;
      });
    });
  }

  // Filter budgets: only SRE Uberaba schools
  // API field: schoolName (not txSchoolName)
  const filtered = budgets.filter((b) => {
    const escola = sreNorm(b.schoolName || b.txSchoolName || "");
    return sreSchools.has(escola);
  });
  console.log(`[SGD Scan] Filtered to ${filtered.length} SRE Uberaba budgets (from ${budgets.length} total)`);

  let novos = 0;
  let atualizados = 0;

  for (const b of filtered) {
    const id = String(b.idBudget || b.id || "");
    if (!id) continue;

    // API list fields: schoolName, year, dtProposalSubmission, expenseGroupId, idCounty
    const escola = b.schoolName || b.txSchoolName || "";
    const escolaNorm = sreNorm(escola);
    const municipio = schoolToMunicipio[escolaNorm] || "";

    const orcamento = {
      id: id,
      idBudget: b.idBudget || b.id,
      ano: b.year || new Date().getFullYear(),
      escola: escola,
      municipio: municipio,
      sre: "Uberaba",
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
      try {
        const detail = await client.getBudgetDetail(
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
  const scanLog = {
    lastScan: new Date().toISOString(),
    novos,
    atualizados,
    total: existingOrcamentos.length,
    budgetsScanned: budgets.length,
    sreUberaba: filtered.length,
    user: userInfo.txName || userInfo.name || "",
  };
  writeJson(path.join(DATA_DIR, "sgd-scan-log.json"), scanLog);

  console.log(`[SGD Scan] Done: ${novos} novos, ${atualizados} atualizados, ${existingOrcamentos.length} total (SRE Uberaba: ${filtered.length} de ${budgets.length})`);
  return scanLog;
}

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
  console.log(`  Varredura: Cron diario as 20h ativo\n`);
});
