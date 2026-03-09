const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");
const DOCS_DIR = path.join(ROOT, "docs", "ops");

const OPS_REPORT_PATH = path.join(DATA_DIR, "ops-daily-run-report.json");
const SNAPSHOT_PATH = path.join(DATA_DIR, "operational-daily-snapshot.json");
const OUT_JSON = path.join(DATA_DIR, "ops-eod-summary.json");
const OUT_MD = path.join(DOCS_DIR, "ops-daily-eod.md");

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function main() {
  const ops = readJson(OPS_REPORT_PATH, {});
  const snapshot = readJson(SNAPSHOT_PATH, {});
  const now = new Date().toISOString();

  const metrics = {
    goNoGo: Boolean(ops.ok) ? "GO" : "NO-GO",
    skuCoveragePct: toNumber(ops?.metrics?.skuCoveragePct, 0),
    actionableQuotes: toNumber(snapshot?.metrics?.actionableQuotes, 0),
    urgent48h: toNumber(snapshot?.metrics?.urgent48h, 0),
    highPriority: toNumber(snapshot?.metrics?.highPriority, 0),
    potentialRevenue: toNumber(snapshot?.metrics?.potentialRevenue, 0),
    skuWithHistory: toNumber(ops?.metrics?.skuWithHistory, 0),
    skuRegionWithHistory: toNumber(ops?.metrics?.skuRegionWithHistory, 0),
  };

  const summary = {
    generatedAt: now,
    source: {
      opsDailyReport: path.relative(ROOT, OPS_REPORT_PATH),
      dailySnapshot: path.relative(ROOT, SNAPSHOT_PATH),
    },
    metrics,
    note:
      metrics.goNoGo === "GO"
        ? "Operacao apta para continuidade no proximo ciclo."
        : "Operacao exige correcao antes do proximo ciclo.",
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const lines = [
    "# Fechamento Operacional do Dia",
    "",
    `- Gerado em: ${summary.generatedAt}`,
    `- Status final: ${summary.metrics.goNoGo}`,
    `- Cobertura SKU: ${summary.metrics.skuCoveragePct}%`,
    `- Acionaveis no snapshot: ${summary.metrics.actionableQuotes}`,
    `- Urgentes <= 48h: ${summary.metrics.urgent48h}`,
    `- Prioridade alta: ${summary.metrics.highPriority}`,
    `- Receita potencial (snapshot): ${summary.metrics.potentialRevenue.toFixed(2)}`,
    `- SKUs com historico: ${summary.metrics.skuWithHistory}`,
    `- SKU+SRE com historico: ${summary.metrics.skuRegionWithHistory}`,
    "",
    `## Nota`,
    summary.note,
  ];
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Resumo de fechamento do dia gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);
  console.log(`Status final: ${summary.metrics.goNoGo}`);
}

main();
