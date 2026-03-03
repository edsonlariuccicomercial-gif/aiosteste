const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");
const DOCS_DIR = path.join(ROOT, "docs", "ops");

const OPS_DAILY = path.join(DATA_DIR, "ops-daily-run-report.json");
const OPS_EOD = path.join(DATA_DIR, "ops-eod-summary.json");
const OPS_ALERTS = path.join(DATA_DIR, "ops-alerts.json");
const OUT_JSON = path.join(DATA_DIR, "ops-handoff.json");
const OUT_MD = path.join(DOCS_DIR, "handoff-next-shift.md");

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
  const now = new Date().toISOString();
  const daily = readJson(OPS_DAILY, {});
  const eod = readJson(OPS_EOD, {});
  const alerts = readJson(OPS_ALERTS, { alerts: [], status: "UNKNOWN" });

  const handoff = {
    generatedAt: now,
    status: {
      daily: Boolean(daily?.ok) ? "GO" : "NO-GO",
      alerts: String(alerts?.status || "UNKNOWN"),
      eod: String(eod?.metrics?.goNoGo || "UNKNOWN"),
    },
    metrics: {
      skuCoveragePct: toNumber(daily?.metrics?.skuCoveragePct, 0),
      actionableQuotes: toNumber(eod?.metrics?.actionableQuotes, 0),
      urgent48h: toNumber(eod?.metrics?.urgent48h, 0),
      highPriority: toNumber(eod?.metrics?.highPriority, 0),
      potentialRevenue: toNumber(eod?.metrics?.potentialRevenue, 0),
      skuWithHistory: toNumber(eod?.metrics?.skuWithHistory, 0),
      skuRegionWithHistory: toNumber(eod?.metrics?.skuRegionWithHistory, 0),
    },
    openAlerts: Array.isArray(alerts?.alerts) ? alerts.alerts : [],
    nextActions: [],
  };

  if (handoff.openAlerts.length) {
    handoff.nextActions.push("Tratar alertas ativos antes da abertura do proximo ciclo.");
  } else {
    handoff.nextActions.push("Abrir proximo ciclo com `npm.cmd run ops:start-day`.");
  }
  if (handoff.metrics.urgent48h > 0) {
    handoff.nextActions.push("Priorizar itens urgentes (<= 48h) no inicio da rodada.");
  } else {
    handoff.nextActions.push("Sem urgentes no momento; focar expansao de volume qualificado.");
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");

  const lines = [
    "# Handoff - Proximo Turno",
    "",
    `- Gerado em: ${handoff.generatedAt}`,
    `- Status Daily: ${handoff.status.daily}`,
    `- Status Alertas: ${handoff.status.alerts}`,
    `- Status EOD: ${handoff.status.eod}`,
    "",
    "## Metricas-chave",
    `- Cobertura SKU: ${handoff.metrics.skuCoveragePct}%`,
    `- Acionaveis: ${handoff.metrics.actionableQuotes}`,
    `- Urgentes <= 48h: ${handoff.metrics.urgent48h}`,
    `- Prioridade alta: ${handoff.metrics.highPriority}`,
    `- Receita potencial: ${handoff.metrics.potentialRevenue.toFixed(2)}`,
    `- SKUs com historico: ${handoff.metrics.skuWithHistory}`,
    `- SKU+SRE com historico: ${handoff.metrics.skuRegionWithHistory}`,
    "",
    "## Alertas abertos",
  ];

  if (!handoff.openAlerts.length) {
    lines.push("- Nenhum alerta ativo.");
  } else {
    for (const alert of handoff.openAlerts) {
      lines.push(`- [${String(alert.severity || "").toUpperCase()}] ${alert.code}: ${alert.message}`);
    }
  }

  lines.push("", "## Proximas acoes");
  for (const action of handoff.nextActions) {
    lines.push(`- ${action}`);
  }

  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Handoff operacional gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);
}

main();
