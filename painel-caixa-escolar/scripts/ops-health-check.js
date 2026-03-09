const fs = require("fs");
const path = require("path");

const REPORT_PATH = path.join(process.cwd(), "dashboard", "data", "ops-daily-run-report.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function main() {
  const minSkuCoverage = toNumber(process.env.OPS_MIN_SKU_COVERAGE_PCT, 95);
  const minSkuHistory = toNumber(process.env.OPS_MIN_SKU_HISTORY_COUNT, 1);

  let report;
  try {
    report = readJson(REPORT_PATH);
  } catch (_e) {
    console.error("NO-GO: relatorio ops diario ausente. Rode `npm.cmd run ops:daily`.");
    process.exit(1);
  }

  const checks = [];
  checks.push({
    name: "pipeline_ok",
    ok: Boolean(report.ok),
    detail: report.ok ? "pipeline diario aprovado" : "pipeline diario com falha",
  });

  const skuCoverage = toNumber(report?.metrics?.skuCoveragePct, 0);
  checks.push({
    name: "sku_coverage",
    ok: skuCoverage >= minSkuCoverage,
    detail: `cobertura SKU ${skuCoverage}% (min ${minSkuCoverage}%)`,
  });

  const skuHistory = toNumber(report?.metrics?.skuWithHistory, 0);
  checks.push({
    name: "sku_history",
    ok: skuHistory >= minSkuHistory,
    detail: `SKUs com historico ${skuHistory} (min ${minSkuHistory})`,
  });

  const missing = Array.isArray(report.missingRequired) ? report.missingRequired : [];
  checks.push({
    name: "required_artifacts",
    ok: missing.length === 0,
    detail: missing.length ? `faltando: ${missing.join(", ")}` : "artefatos obrigatorios presentes",
  });

  const go = checks.every((item) => item.ok);
  console.log(`Resultado operacional: ${go ? "GO" : "NO-GO"}`);
  for (const item of checks) {
    console.log(`- [${item.ok ? "OK" : "ERRO"}] ${item.name}: ${item.detail}`);
  }

  if (!go) process.exit(1);
}

main();
