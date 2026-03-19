const fs = require("fs");
const path = require("path");

const QUOTES_PATH = path.join(process.cwd(), "dashboard", "data", "quotes.json");
const SYNC_STATUS_PATH = path.join(process.cwd(), "dashboard", "data", "sync-status.json");
const OUTPUT_PATH = path.join(process.cwd(), "dashboard", "data", "operational-daily-snapshot.json");

const DEFAULT_ACTIONABLE_STATUSES = [
  "analise de propostas",
  "analise",
  "aberto",
  "pendente",
  "em andamento",
];

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function marginPct(row) {
  const price = Number(row.precoSugerido || 0);
  const cost = Number(row.custoEstimado || 0);
  if (!price) return 0;
  return ((price - cost) / price) * 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function strategicObjectFit(row) {
  const obj = normalize(row.objeto);
  if (obj.includes("alimentacao") || obj.includes("merenda")) return 15;
  if (obj.includes("pereciveis") || obj.includes("hortifrutigranjeiros")) return 14;
  if (obj.includes("limpeza") || obj.includes("higiene")) return 12;
  if (obj.includes("escritorio") || obj.includes("consumo")) return 10;
  if (obj.includes("nao identificado")) return 2;
  return 6;
}

function daysTo(dateIso, referenceDate) {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - referenceDate.getTime();
  return Math.ceil(diff / 86400000);
}

function opportunityScore(row, referenceDate) {
  if (normalize(row.status) === "encerrado") return 0;

  const days = daysTo(row.prazo, referenceDate);
  const margin = marginPct(row);

  const prazoScore = clamp((30 - (days ?? 365)) / 30, 0, 1) * 35;
  const margemScore = clamp(margin / 25, 0, 1) * 30;
  const fitScore = strategicObjectFit(row);

  const confObj = normalize(row.confiancaObjeto);
  const confTerr = normalize(row.confiancaTerritorio);
  const scoreObj = confObj === "alta" ? 12 : confObj === "media" ? 7 : 0;
  const scoreTerr = confTerr === "alta" ? 8 : confTerr === "media" ? 5 : 0;

  return Math.round(prazoScore + margemScore + fitScore + scoreObj + scoreTerr);
}

function priorityFromScore(score) {
  if (score >= 70) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function main() {
  const startedAt = Date.now();
  const refDateRaw = process.env.SNAPSHOT_REF_DATE || new Date().toISOString().slice(0, 10);
  const referenceDate = new Date(`${refDateRaw}T00:00:00`);
  if (Number.isNaN(referenceDate.getTime())) {
    console.error(`SNAPSHOT_REF_DATE invalida: ${refDateRaw}. Use formato YYYY-MM-DD.`);
    process.exit(1);
  }

  const minScore = toNumber(process.env.OPS_SCORE_MIN, 40);
  const maxDays = toNumber(process.env.OPS_MAX_DAYS_TO_DEADLINE, 7);
  const statusesRaw = process.env.OPS_ACTIONABLE_STATUSES || DEFAULT_ACTIONABLE_STATUSES.join(",");
  const actionableStatuses = statusesRaw
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);

  const quotes = readJson(QUOTES_PATH, []);
  const syncStatus = readJson(SYNC_STATUS_PATH, {});
  const rows = Array.isArray(quotes) ? quotes : [];

  const enriched = rows.map((row) => {
    const score = opportunityScore(row, referenceDate);
    const deadlineDays = daysTo(row.prazo, referenceDate);
    const sync = syncStatus[row.id]?.status || "nao_enviado";
    const margin = marginPct(row);
    return {
      ...row,
      statusNorm: normalize(row.status),
      score,
      priority: priorityFromScore(score),
      deadlineDays,
      marginPct: Number(margin.toFixed(2)),
      syncStatus: sync,
    };
  });

  const actionable = enriched
    .filter((row) => row.statusNorm !== "encerrado")
    .filter((row) => (actionableStatuses.length ? actionableStatuses.includes(row.statusNorm) : true))
    .filter((row) => row.score >= minScore)
    .filter((row) => row.deadlineDays !== null && row.deadlineDays <= maxDays)
    .sort((a, b) => b.score - a.score || a.deadlineDays - b.deadlineDays);

  const urgent48h = actionable.filter((row) => row.deadlineDays !== null && row.deadlineDays <= 2);
  const highPriority = actionable.filter((row) => row.priority === "alta");
  const avgMargin =
    actionable.length > 0
      ? actionable.reduce((acc, row) => acc + row.marginPct, 0) / actionable.length
      : 0;

  const syncCounts = actionable.reduce((acc, row) => {
    const key = row.syncStatus || "nao_enviado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const bySre = actionable.reduce((acc, row) => {
    const key = String(row.sre || "SRE nao informada");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topActionable = actionable.slice(0, 20).map((row) => ({
    id: row.id,
    escola: row.escola,
    municipio: row.municipio,
    sre: row.sre,
    objeto: row.objeto,
    prazo: row.prazo,
    diasParaPrazo: row.deadlineDays,
    status: row.status,
    scoreOportunidade: row.score,
    prioridade: row.priority,
    margemPct: row.marginPct,
    precoSugerido: toNumber(row.precoSugerido, 0),
    custoEstimado: toNumber(row.custoEstimado, 0),
    syncOlist: row.syncStatus,
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    referenceDate: refDateRaw,
    inputs: {
      scoreMin: minScore,
      maxDaysToDeadline: maxDays,
      actionableStatuses,
      quotesPath: path.relative(process.cwd(), QUOTES_PATH),
    },
    metrics: {
      totalQuotes: rows.length,
      actionableQuotes: actionable.length,
      urgent48h: urgent48h.length,
      highPriority: highPriority.length,
      avgMarginPct: Number(avgMargin.toFixed(2)),
      potentialRevenue: Number(
        actionable.reduce((acc, row) => acc + toNumber(row.precoSugerido, 0), 0).toFixed(2)
      ),
      syncStatusCounts: syncCounts,
      sreDistribution: bySre,
    },
    topActionable,
    executionMs: Date.now() - startedAt,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log("Snapshot operacional diario gerado.");
  console.log(`Arquivo: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`Data de referencia: ${refDateRaw}`);
  console.log(`Acionaveis: ${output.metrics.actionableQuotes}`);
  console.log(`Urgentes (<=48h): ${output.metrics.urgent48h}`);
  console.log(`Prioridade alta: ${output.metrics.highPriority}`);
}

main();
