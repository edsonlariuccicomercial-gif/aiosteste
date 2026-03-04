const fs = require("fs");
const path = require("path");

const REPORT_PATH = path.join(process.cwd(), "dashboard", "data", "sku-coverage-report.json");
const threshold = Number(process.env.SKU_MIN_COVERAGE_PCT || 95);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function run() {
  let report;
  try {
    report = readJson(REPORT_PATH);
  } catch (_e) {
    console.error("Falha ao ler sku-coverage-report.json. Rode dashboard:audit:sku antes.");
    process.exit(1);
  }

  const pct = Number(report.coveragePct || 0);
  const total = Number(report.totalQuotes || 0);
  const ok = pct >= threshold;

  console.log(`Cobertura SKU atual: ${pct}% (${report.classifiedQuotes || 0}/${total})`);
  console.log(`Meta minima: ${threshold}%`);

  if (!ok) {
    const pending = Array.isArray(report.topUnclassifiedObjects) ? report.topUnclassifiedObjects : [];
    const first = pending[0] ? `${pending[0].objeto} (${pending[0].ocorrencias})` : "sem detalhe";
    console.error(`Validacao reprovada: cobertura abaixo da meta. Principal pendencia: ${first}`);
    process.exit(1);
  }

  console.log("Validacao aprovada.");
}

run();
