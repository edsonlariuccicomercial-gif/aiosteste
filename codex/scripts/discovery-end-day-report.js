const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OPS_DIR = path.join(ROOT, "docs", "ops");

const SUMMARY_PATH = path.join(OPS_DIR, "discovery-summary.json");
const STATUS_PATH = path.join(OPS_DIR, "discovery-summary.md");
const OUT_JSON = path.join(OPS_DIR, "discovery-end-day-report.json");
const OUT_MD = path.join(OPS_DIR, "discovery-end-day-report.md");

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

function run() {
  const summary = readJson(SUMMARY_PATH, { metrics: {}, suggestedDecision: "NO-GO", topPains: [] });
  const generatedAt = new Date().toISOString();

  const report = {
    generatedAt,
    interviewsCompleted: toNumber(summary?.metrics?.interviewsCompleted, 0),
    interviewsTarget: toNumber(summary?.metrics?.interviewsTarget, 10),
    validatedPainPct: toNumber(summary?.metrics?.validatedPainPct, 0),
    wouldPayPct: toNumber(summary?.metrics?.wouldPayPct, 0),
    suggestedDecision: String(summary?.suggestedDecision || "NO-GO"),
    topPains: Array.isArray(summary?.topPains) ? summary.topPains : [],
    source: {
      summaryJson: path.relative(ROOT, SUMMARY_PATH),
      summaryMd: path.relative(ROOT, STATUS_PATH),
    },
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const lines = [
    "# Fechamento Diario da Descoberta",
    "",
    `- Gerado em: ${generatedAt}`,
    `- Entrevistas: ${report.interviewsCompleted}/${report.interviewsTarget}`,
    `- Dor validada: ${report.validatedPainPct}%`,
    `- Disposicao de pagamento: ${report.wouldPayPct}%`,
    `- Decisao sugerida: ${report.suggestedDecision}`,
    "",
    "## Top dores",
    ...(report.topPains.length
      ? report.topPains.map((p, i) => `${i + 1}. ${p.pain} (${p.count})`)
      : ["1. Sem dados suficientes"]),
  ];
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Relatorio de fechamento da descoberta gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);
}

run();
