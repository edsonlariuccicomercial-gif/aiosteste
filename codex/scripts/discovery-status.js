const fs = require("fs");
const path = require("path");

const INPUT_PATH = path.join(process.cwd(), "docs", "ops", "discovery-interviews.json");
const SUMMARY_PATH = path.join(process.cwd(), "docs", "ops", "discovery-summary.json");

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function isCompleted(row) {
  const date = String(row?.date || "").trim();
  return date && date !== "YYYY-MM-DD";
}

function run() {
  const data = readJson(INPUT_PATH, { interviews: [] });
  const interviews = Array.isArray(data?.interviews) ? data.interviews : [];
  const completed = interviews.filter(isCompleted).length;
  const target = 10;

  const summary = readJson(SUMMARY_PATH, null);
  const suggested = summary?.suggestedDecision || "N/A";
  const validatedPct = Number(summary?.metrics?.validatedPainPct || 0);
  const payPct = Number(summary?.metrics?.wouldPayPct || 0);

  console.log("Discovery Status");
  console.log(`- Entrevistas concluidas: ${completed}/${target}`);
  console.log(`- Dor validada: ${validatedPct}%`);
  console.log(`- Disposicao de pagamento: ${payPct}%`);
  console.log(`- Decisao sugerida: ${suggested}`);
}

run();
