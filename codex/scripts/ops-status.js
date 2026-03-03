const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");

const FILES = {
  daily: path.join(DATA_DIR, "ops-daily-run-report.json"),
  alerts: path.join(DATA_DIR, "ops-alerts.json"),
  eod: path.join(DATA_DIR, "ops-eod-summary.json"),
  trend: path.join(DATA_DIR, "ops-trend-history.json"),
  handoff: path.join(DATA_DIR, "ops-handoff.json"),
  discoverySummary: path.join(process.cwd(), "docs", "ops", "discovery-summary.json"),
};

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function main() {
  const daily = readJson(FILES.daily, {});
  const alerts = readJson(FILES.alerts, {});
  const eod = readJson(FILES.eod, {});
  const trend = readJson(FILES.trend, {});
  const handoff = readJson(FILES.handoff, {});
  const discovery = readJson(FILES.discoverySummary, {});

  const status = {
    daily: daily?.ok ? "GO" : "NO-GO",
    alerts: String(alerts?.status || "UNKNOWN"),
    eod: String(eod?.metrics?.goNoGo || "UNKNOWN"),
    handoff: String(handoff?.status?.eod || "UNKNOWN"),
  };

  const freshnessMin = toNumber(alerts?.freshness?.ageMin, -1);
  const skuCoverage = toNumber(daily?.metrics?.skuCoveragePct, 0);
  const urgent48h = toNumber(eod?.metrics?.urgent48h, 0);
  const actionable = toNumber(eod?.metrics?.actionableQuotes, 0);
  const trendPoints = toNumber(trend?.weekly?.points, 0);
  const trendGo = toNumber(trend?.weekly?.goCount, 0);
  const trendNoGo = toNumber(trend?.weekly?.noGoCount, 0);
  const discoveryCompleted = toNumber(discovery?.metrics?.interviewsCompleted, 0);
  const discoveryTarget = toNumber(discovery?.metrics?.interviewsTarget, 10);
  const discoveryValidatedPct = toNumber(discovery?.metrics?.validatedPainPct, 0);
  const discoveryDecision = String(discovery?.suggestedDecision || "N/A");

  console.log("Ops Status Summary");
  console.log(`- Daily: ${status.daily}`);
  console.log(`- Alerts: ${status.alerts}`);
  console.log(`- EOD: ${status.eod}`);
  console.log(`- Handoff: ${status.handoff}`);
  console.log(`- Cobertura SKU: ${skuCoverage}%`);
  console.log(`- Frescor: ${freshnessMin >= 0 ? `${freshnessMin} min` : "desconhecido"}`);
  console.log(`- Acionaveis: ${actionable}`);
  console.log(`- Urgentes <= 48h: ${urgent48h}`);
  console.log(`- Trend (ultimos ciclos): pontos=${trendPoints}, GO=${trendGo}, NO-GO=${trendNoGo}`);
  console.log(`- Discovery: entrevistas=${discoveryCompleted}/${discoveryTarget}, dor_validada=${discoveryValidatedPct}%`);
  console.log(`- Discovery decisao sugerida: ${discoveryDecision}`);

  const finalGo =
    status.daily === "GO" &&
    (status.alerts === "GO" || status.alerts === "GO_WITH_WARNINGS") &&
    status.eod === "GO";

  console.log(`- Veredito: ${finalGo ? "GO" : "NO-GO"}`);
  if (!finalGo) process.exit(1);
}

main();
