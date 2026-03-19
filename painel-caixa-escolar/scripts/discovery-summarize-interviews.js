const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "docs", "ops", "discovery-interviews.json");
const OUT_JSON = path.join(ROOT, "docs", "ops", "discovery-summary.json");
const OUT_MD = path.join(ROOT, "docs", "ops", "discovery-summary.md");
const OUT_DECISION_MD = path.join(ROOT, "docs", "ops", "discovery-go-no-go-draft.md");

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

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function isPainValidated(interview) {
  const f = toNumber(interview.frequency1to5, 0);
  const i = toNumber(interview.intensity1to5, 0);
  return f >= 4 && i >= 4;
}

function run() {
  const input = readJson(INPUT_PATH, { interviews: [] });
  const interviews = Array.isArray(input?.interviews) ? input.interviews : [];

  const validRows = interviews.filter((i) => String(i.id || "").trim() !== "");
  const completed = validRows.filter((i) => normalize(i.date) !== "yyyy-mm-dd");
  const total = completed.length;
  const validated = completed.filter(isPainValidated);
  const validatedPct = total ? Number(((validated.length / total) * 100).toFixed(2)) : 0;

  const painCount = {};
  for (const i of completed) {
    const key = String(i.mainPain || "").trim() || "Dor nao informada";
    painCount[key] = (painCount[key] || 0) + 1;
  }
  const topPains = Object.entries(painCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pain, count]) => ({ pain, count }));

  const wouldPayCount = completed.filter((i) => Boolean(i.wouldPay)).length;
  const wouldPayPct = total ? Number(((wouldPayCount / total) * 100).toFixed(2)) : 0;

  const goByRules =
    total >= 10 &&
    validatedPct >= 60 &&
    wouldPayPct >= 50;

  const summary = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, INPUT_PATH),
    metrics: {
      interviewsCompleted: total,
      interviewsTarget: 10,
      validatedPainCount: validated.length,
      validatedPainPct: validatedPct,
      wouldPayCount,
      wouldPayPct,
    },
    topPains,
    suggestedDecision: goByRules ? "GO" : "NO-GO",
    ruleChecks: {
      minInterviews10: total >= 10,
      validatedPainPctMin60: validatedPct >= 60,
      wouldPayPctMin50: wouldPayPct >= 50,
    },
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const summaryMd = [
    "# Resumo de Descoberta",
    "",
    `- Gerado em: ${summary.generatedAt}`,
    `- Entrevistas concluidas: ${summary.metrics.interviewsCompleted}/${summary.metrics.interviewsTarget}`,
    `- Dor validada: ${summary.metrics.validatedPainCount} (${summary.metrics.validatedPainPct}%)`,
    `- Disposicao de pagamento: ${summary.metrics.wouldPayCount} (${summary.metrics.wouldPayPct}%)`,
    `- Decisao sugerida (regra): ${summary.suggestedDecision}`,
    "",
    "## Top 3 dores",
    ...(topPains.length
      ? topPains.map((p, idx) => `${idx + 1}. ${p.pain} (${p.count})`)
      : ["1. Sem dados suficientes"]),
  ];
  fs.writeFileSync(OUT_MD, `${summaryMd.join("\n")}\n`, "utf8");

  const decisionDraft = [
    "# Rascunho de Decisao Go/No-Go",
    "",
    `Data: ${summary.generatedAt.slice(0, 10)}`,
    "",
    "## Resultado automatico",
    `- Sugerido: **${summary.suggestedDecision}**`,
    "",
    "## Checks",
    `- [${summary.ruleChecks.minInterviews10 ? "x" : " "}] 10 entrevistas concluidas`,
    `- [${summary.ruleChecks.validatedPainPctMin60 ? "x" : " "}] >= 60% com dor validada`,
    `- [${summary.ruleChecks.wouldPayPctMin50 ? "x" : " "}] >= 50% com disposicao de pagamento`,
    "",
    "## Observacao",
    "- Revisar qualitativamente frases-chave antes da decisao final.",
  ];
  fs.writeFileSync(OUT_DECISION_MD, `${decisionDraft.join("\n")}\n`, "utf8");

  console.log("Resumo de descoberta gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);
  console.log(`Decisao sugerida: ${summary.suggestedDecision}`);
}

run();
