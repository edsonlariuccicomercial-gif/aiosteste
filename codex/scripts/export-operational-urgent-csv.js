const fs = require("fs");
const path = require("path");

const SNAPSHOT_PATH = path.join(process.cwd(), "dashboard", "data", "operational-daily-snapshot.json");
const OUTPUT_PATH = path.join(process.cwd(), "dashboard", "data", "operational-urgent.csv");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function main() {
  let snapshot;
  try {
    snapshot = readJson(SNAPSHOT_PATH);
  } catch (_e) {
    console.error("Falha ao ler snapshot diario. Rode `npm.cmd run dashboard:snapshot:daily` antes.");
    process.exit(1);
  }

  const urgentMaxDays = toNumber(process.env.OPS_URGENT_MAX_DAYS, 2);
  const minScore = toNumber(process.env.OPS_URGENT_MIN_SCORE, 0);
  const rows = Array.isArray(snapshot.topActionable) ? snapshot.topActionable : [];

  const urgent = rows
    .filter((row) => toNumber(row.diasParaPrazo, 9999) <= urgentMaxDays)
    .filter((row) => toNumber(row.scoreOportunidade, 0) >= minScore)
    .sort(
      (a, b) =>
        toNumber(b.scoreOportunidade, 0) - toNumber(a.scoreOportunidade, 0) ||
        toNumber(a.diasParaPrazo, 9999) - toNumber(b.diasParaPrazo, 9999)
    );

  const headers = [
    "prioridade",
    "score_oportunidade",
    "id",
    "escola",
    "municipio",
    "sre",
    "objeto",
    "prazo",
    "dias_para_prazo",
    "status",
    "margem_pct",
    "custo_estimado",
    "preco_sugerido",
    "sync_olist",
  ];

  const lines = [headers.join(",")];
  for (const row of urgent) {
    const line = [
      row.prioridade || "",
      row.scoreOportunidade || "",
      row.id || "",
      row.escola || "",
      row.municipio || "",
      row.sre || "",
      row.objeto || "",
      row.prazo || "",
      row.diasParaPrazo ?? "",
      row.status || "",
      row.margemPct ?? "",
      row.custoEstimado ?? "",
      row.precoSugerido ?? "",
      row.syncOlist || "nao_enviado",
    ].map(csvEscape);
    lines.push(line.join(","));
  }

  fs.writeFileSync(OUTPUT_PATH, `\uFEFF${lines.join("\n")}\n`, "utf8");
  console.log("Exportacao de urgentes concluida.");
  console.log(`Arquivo: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`Urgentes exportados: ${urgent.length}`);
  console.log(`Filtro aplicado: dias_para_prazo <= ${urgentMaxDays}, score >= ${minScore}`);
}

main();
