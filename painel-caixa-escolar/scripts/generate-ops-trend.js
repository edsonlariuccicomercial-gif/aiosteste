const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");
const DOCS_DIR = path.join(ROOT, "docs", "ops");

const HANDOFF_PATH = path.join(DATA_DIR, "ops-handoff.json");
const HISTORY_PATH = path.join(DATA_DIR, "ops-trend-history.json");
const WEEKLY_MD_PATH = path.join(DOCS_DIR, "ops-weekly-trend.md");

function readJson(filePath, fallback) {
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

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function main() {
  const handoff = readJson(HANDOFF_PATH, null);
  if (!handoff) {
    console.error("Falha ao ler ops-handoff.json. Rode `npm.cmd run ops:close-shift` antes.");
    process.exit(1);
  }

  const history = readJson(HISTORY_PATH, { generatedAt: null, entries: [] });
  const entries = Array.isArray(history.entries) ? history.entries : [];

  const entry = {
    timestamp: handoff.generatedAt || new Date().toISOString(),
    dailyStatus: String(handoff?.status?.daily || "UNKNOWN"),
    alertsStatus: String(handoff?.status?.alerts || "UNKNOWN"),
    eodStatus: String(handoff?.status?.eod || "UNKNOWN"),
    skuCoveragePct: toNumber(handoff?.metrics?.skuCoveragePct, 0),
    actionableQuotes: toNumber(handoff?.metrics?.actionableQuotes, 0),
    urgent48h: toNumber(handoff?.metrics?.urgent48h, 0),
    highPriority: toNumber(handoff?.metrics?.highPriority, 0),
    potentialRevenue: toNumber(handoff?.metrics?.potentialRevenue, 0),
  };

  const key = `${entry.timestamp}|${entry.dailyStatus}|${entry.alertsStatus}|${entry.eodStatus}`;
  const existing = new Set(entries.map((e) => `${e.timestamp}|${e.dailyStatus}|${e.alertsStatus}|${e.eodStatus}`));
  if (!existing.has(key)) {
    entries.push(entry);
  }

  entries.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const capped = entries.slice(-30);
  const last7 = capped.slice(-7);

  const weekly = {
    points: last7.length,
    goCount: last7.filter((e) => e.eodStatus === "GO").length,
    noGoCount: last7.filter((e) => e.eodStatus !== "GO").length,
    avgSkuCoveragePct: Number(avg(last7.map((e) => toNumber(e.skuCoveragePct, 0))).toFixed(2)),
    avgUrgent48h: Number(avg(last7.map((e) => toNumber(e.urgent48h, 0))).toFixed(2)),
    avgActionableQuotes: Number(avg(last7.map((e) => toNumber(e.actionableQuotes, 0))).toFixed(2)),
  };

  const out = {
    generatedAt: new Date().toISOString(),
    entries: capped,
    weekly,
  };

  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(WEEKLY_MD_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  const lines = [
    "# Tendencia Operacional (Ultimos 7 ciclos)",
    "",
    `- Gerado em: ${out.generatedAt}`,
    `- Pontos analisados: ${weekly.points}`,
    `- GO: ${weekly.goCount}`,
    `- NO-GO: ${weekly.noGoCount}`,
    `- Cobertura SKU media: ${weekly.avgSkuCoveragePct}%`,
    `- Urgentes <= 48h (media): ${weekly.avgUrgent48h}`,
    `- Acionaveis (media): ${weekly.avgActionableQuotes}`,
    "",
    "## Ultimos pontos",
    ...last7.map(
      (e) =>
        `- ${e.timestamp} | EOD=${e.eodStatus} | cobertura=${e.skuCoveragePct}% | urgentes=${e.urgent48h} | acionaveis=${e.actionableQuotes}`
    ),
  ];

  fs.writeFileSync(WEEKLY_MD_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log("Trend operacional atualizado.");
  console.log(`Historico: ${path.relative(ROOT, HISTORY_PATH)}`);
  console.log(`Resumo semanal: ${path.relative(ROOT, WEEKLY_MD_PATH)}`);
}

main();
