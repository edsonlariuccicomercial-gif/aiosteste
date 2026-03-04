const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");
const DOCS_DIR = path.join(ROOT, "docs", "ops");
const REPORT_JSON = path.join(DATA_DIR, "ops-daily-run-report.json");
const REPORT_MD = path.join(DOCS_DIR, "ops-daily-last-run.md");

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function statMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch (_e) {
    return null;
  }
}

function main() {
  const now = new Date().toISOString();
  const withCollect = process.argv.includes("--with-collect");

  const artifacts = [
    { key: "territoryAudit", path: path.join(DATA_DIR, "territory-coverage-report.json"), required: true },
    { key: "skuAudit", path: path.join(DATA_DIR, "sku-coverage-report.json"), required: true },
    { key: "snapshotDaily", path: path.join(DATA_DIR, "operational-daily-snapshot.json"), required: true },
    { key: "urgentCsv", path: path.join(DATA_DIR, "operational-urgent.csv"), required: true },
    { key: "priceHistory", path: path.join(DATA_DIR, "price-history.json"), required: true },
    { key: "priceHistorySummary", path: path.join(DATA_DIR, "price-history-summary.json"), required: true },
  ];

  const checks = artifacts.map((item) => {
    const exists = fs.existsSync(item.path);
    return {
      key: item.key,
      relativePath: path.relative(ROOT, item.path),
      exists,
      required: item.required,
      updatedAt: exists ? statMtime(item.path) : null,
    };
  });

  const missingRequired = checks.filter((item) => item.required && !item.exists);
  const skuReport = readJson(path.join(DATA_DIR, "sku-coverage-report.json"), {});
  const snapshot = readJson(path.join(DATA_DIR, "operational-daily-snapshot.json"), {});
  const historySummary = readJson(path.join(DATA_DIR, "price-history-summary.json"), {});

  const report = {
    generatedAt: now,
    withCollect,
    ok: missingRequired.length === 0,
    missingRequired: missingRequired.map((item) => item.relativePath),
    artifacts: checks,
    metrics: {
      skuCoveragePct: Number(skuReport.coveragePct || 0),
      actionableQuotes: Number(snapshot?.metrics?.actionableQuotes || 0),
      urgent48h: Number(snapshot?.metrics?.urgent48h || 0),
      skuWithHistory: Array.isArray(historySummary.skuSummary) ? historySummary.skuSummary.length : 0,
      skuRegionWithHistory: Array.isArray(historySummary.skuRegionSummary) ? historySummary.skuRegionSummary.length : 0,
    },
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const lines = [
    "# Ops Daily - Ultima Execucao",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Modo com coleta: ${withCollect ? "sim" : "nao"}`,
    `- Resultado: ${report.ok ? "SUCESSO" : "FALHA"}`,
    `- Cobertura SKU: ${report.metrics.skuCoveragePct}%`,
    `- Acionaveis: ${report.metrics.actionableQuotes}`,
    `- Urgentes <= 48h: ${report.metrics.urgent48h}`,
    `- SKUs com historico: ${report.metrics.skuWithHistory}`,
    `- SKU+SRE com historico: ${report.metrics.skuRegionWithHistory}`,
    "",
    "## Artefatos",
    ...report.artifacts.map(
      (item) =>
        `- ${item.exists ? "[OK]" : "[FALTA]"} ${item.relativePath}${item.updatedAt ? ` (atualizado em ${item.updatedAt})` : ""}`
    ),
  ];
  fs.writeFileSync(REPORT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Relatorio operacional diario gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, REPORT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, REPORT_MD)}`);
  console.log(`Resultado: ${report.ok ? "SUCESSO" : "FALHA"}`);

  if (!report.ok) process.exit(1);
}

main();
