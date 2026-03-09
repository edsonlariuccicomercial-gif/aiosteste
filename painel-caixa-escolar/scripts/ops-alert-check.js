const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");
const DOCS_DIR = path.join(ROOT, "docs", "ops");

const OPS_REPORT_PATH = path.join(DATA_DIR, "ops-daily-run-report.json");
const SNAPSHOT_PATH = path.join(DATA_DIR, "operational-daily-snapshot.json");
const OUT_JSON = path.join(DATA_DIR, "ops-alerts.json");
const OUT_MD = path.join(DOCS_DIR, "ops-alerts.md");

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
  const minSkuCoverage = toNumber(process.env.OPS_MIN_SKU_COVERAGE_PCT, 95);
  const maxUrgent48h = toNumber(process.env.OPS_MAX_URGENT_48H, 0);
  const maxDataAgeMin = toNumber(process.env.OPS_MAX_DATA_AGE_MIN, 180);

  const ops = readJson(OPS_REPORT_PATH, {});
  const snapshot = readJson(SNAPSHOT_PATH, {});
  const generatedAt = new Date().toISOString();

  const alerts = [];
  if (!ops || ops.ok !== true) {
    alerts.push({
      severity: "critical",
      code: "OPS_PIPELINE_FAILED",
      message: "Pipeline operacional diaria nao esta aprovada.",
    });
  }

  const coverage = toNumber(ops?.metrics?.skuCoveragePct, 0);
  if (coverage < minSkuCoverage) {
    alerts.push({
      severity: "critical",
      code: "SKU_COVERAGE_LOW",
      message: `Cobertura SKU abaixo da meta (${coverage}% < ${minSkuCoverage}%).`,
    });
  }

  const urgent48h = toNumber(snapshot?.metrics?.urgent48h, 0);
  if (urgent48h > maxUrgent48h) {
    alerts.push({
      severity: "warning",
      code: "URGENT_BACKLOG",
      message: `Existem ${urgent48h} oportunidades urgentes (limite ${maxUrgent48h}).`,
    });
  }

  const opsGenerated = ops?.generatedAt ? new Date(ops.generatedAt) : null;
  const ageMin = opsGenerated && !Number.isNaN(opsGenerated.getTime())
    ? Math.max(0, Math.floor((Date.now() - opsGenerated.getTime()) / 60000))
    : null;
  if (ageMin == null) {
    alerts.push({
      severity: "critical",
      code: "DATA_FRESHNESS_UNKNOWN",
      message: "Nao foi possivel calcular frescor dos dados operacionais.",
    });
  } else if (ageMin > maxDataAgeMin) {
    alerts.push({
      severity: "warning",
      code: "DATA_STALE",
      message: `Dados operacionais com ${ageMin} min (limite ${maxDataAgeMin} min).`,
    });
  }

  const status = alerts.some((a) => a.severity === "critical")
    ? "NO-GO"
    : alerts.length
      ? "GO_WITH_WARNINGS"
      : "GO";

  const out = {
    generatedAt,
    status,
    thresholds: {
      minSkuCoverage,
      maxUrgent48h,
      maxDataAgeMin,
    },
    freshness: {
      opsGeneratedAt: ops?.generatedAt || null,
      ageMin,
      isStale: ageMin == null ? true : ageMin > maxDataAgeMin,
    },
    alerts,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  const lines = [
    "# Alertas Operacionais",
    "",
    `- Gerado em: ${generatedAt}`,
    `- Status: ${status}`,
    `- Frescor: ${out.freshness.ageMin == null ? "desconhecido" : `${out.freshness.ageMin} min`}`,
    "",
    "## Alertas",
  ];
  if (!alerts.length) {
    lines.push("- Nenhum alerta ativo.");
  } else {
    for (const alert of alerts) {
      lines.push(`- [${alert.severity.toUpperCase()}] ${alert.code}: ${alert.message}`);
    }
  }
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Checagem de alertas operacionais concluida.");
  console.log(`Status: ${status}`);
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);

  if (status === "NO-GO") process.exit(1);
}

main();
