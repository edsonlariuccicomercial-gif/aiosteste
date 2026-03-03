/* ===================================================================
   Express Server — Caixa Escolar MG (Modo Local)
   Serves dashboard + exposes SGD automation endpoints
   =================================================================== */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8082;
const DASHBOARD_DIR = path.join(__dirname, "dashboard");
const SCRIPTS_DIR = path.join(__dirname, "..", "..", "scripts");
const ROOT_DIR = path.join(__dirname, "..", "..");

app.use(express.json());
app.use(express.static(DASHBOARD_DIR));

// ===== GET /api/sgd/status =====
app.get("/api/sgd/status", (_req, res) => {
  const hasCnpj = !!(process.env.SGD_CNPJ || process.env.SGD_DOC || process.env.SGD_CPF);
  const hasPass = !!process.env.SGD_PASS;

  res.json({
    ok: true,
    mode: "local",
    credentials: hasCnpj && hasPass ? "configured" : "missing",
    scripts: {
      submit: fs.existsSync(path.join(SCRIPTS_DIR, "submit-sgd-prequotes.js")),
      collect: fs.existsSync(path.join(SCRIPTS_DIR, "collect-sgd-orcamentos.js")),
      build: fs.existsSync(path.join(SCRIPTS_DIR, "build-sgd-prequote-payload.js")),
    },
  });
});

// ===== POST /api/sgd/submit =====
app.post("/api/sgd/submit", async (req, res) => {
  const { orcamentoId, itens, totalGeral } = req.body;

  if (!orcamentoId || !itens || !itens.length) {
    return res.status(400).json({ success: false, error: "Payload incompleto." });
  }

  // Write a temporary payload file for the submit script
  const payloadPath = path.join(DASHBOARD_DIR, "data", "sgd-prequote-payload.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    proposals: [{
      budgetId: orcamentoId,
      items: itens.map((i) => ({
        name: i.nome,
        quantity: i.quantidade,
        unitPrice: i.precoUnitario,
        totalPrice: i.precoTotal,
      })),
      total: totalGeral,
    }],
  };

  try {
    fs.mkdirSync(path.join(DASHBOARD_DIR, "data"), { recursive: true });
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    return res.status(500).json({ success: false, error: "Falha ao gravar payload: " + err.message });
  }

  // Run the submit script
  const scriptPath = path.join(SCRIPTS_DIR, "submit-sgd-prequotes.js");
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ success: false, error: "Script submit-sgd-prequotes.js nao encontrado." });
  }

  const args = [scriptPath, "--payload", payloadPath, "--submit", "--only-budget", orcamentoId];

  try {
    const result = await runScript("node", args);
    // Read the report
    const reportPath = path.join(DASHBOARD_DIR, "data", "sgd-prequote-submit-report.json");
    let report = null;
    try {
      report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    } catch (_) { /* no report */ }

    if (result.exitCode === 0) {
      res.json({ success: true, report });
    } else {
      res.status(500).json({ success: false, error: "Script retornou erro.", output: result.stderr, report });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== POST /api/sgd/collect =====
app.post("/api/sgd/collect", async (_req, res) => {
  const scriptPath = path.join(SCRIPTS_DIR, "collect-sgd-orcamentos.js");
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ success: false, error: "Script collect-sgd-orcamentos.js nao encontrado." });
  }

  try {
    const result = await runScript("node", [scriptPath]);
    if (result.exitCode === 0) {
      res.json({ success: true, message: "Coleta concluida." });
    } else {
      res.status(500).json({ success: false, error: "Script retornou erro.", output: result.stderr });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== Helper: run script as child process =====
function runScript(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT_DIR,
      env: { ...process.env },
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (err) => reject(err));
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// ===== START =====
app.listen(PORT, () => {
  console.log(`\n  Caixa Escolar MG — Modo Local`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  SGD API:   http://localhost:${PORT}/api/sgd/status\n`);
});
