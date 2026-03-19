const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OPS_DIR = path.join(ROOT, "docs", "ops");

const SUMMARY_PATH = path.join(OPS_DIR, "discovery-summary.json");
const PLAN_PATH = path.join(OPS_DIR, "discovery-sprint-plan.json");
const INPUT_PATH = path.join(OPS_DIR, "discovery-interviews.json");
const OUT_MD = path.join(OPS_DIR, "discovery-next-actions.md");

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isCompleted(row) {
  const date = String(row?.date || "").trim();
  return date && date !== "YYYY-MM-DD";
}

function run() {
  const summary = readJson(SUMMARY_PATH, { metrics: {}, suggestedDecision: "NO-GO" });
  const plan = readJson(PLAN_PATH, { planDays: [] });
  const interviewsData = readJson(INPUT_PATH, { interviews: [] });

  const interviews = Array.isArray(interviewsData?.interviews) ? interviewsData.interviews : [];
  const completed = interviews.filter(isCompleted).length;
  const remaining = Math.max(0, 10 - completed);

  const planDays = Array.isArray(plan?.planDays) ? plan.planDays : [];
  const today = todayYmd();
  const todayPlan = planDays.find((d) => String(d.date || "") === today) || null;
  const todayTarget = Number(todayPlan?.targetInterviews || 0);

  const validatedPct = Number(summary?.metrics?.validatedPainPct || 0);
  const payPct = Number(summary?.metrics?.wouldPayPct || 0);

  const actions = [];
  if (remaining > 0) {
    actions.push(`Concluir ${Math.max(1, todayTarget)} entrevistas hoje.`);
    actions.push("Preencher respostas no arquivo discovery-interviews.json imediatamente apos cada conversa.");
    actions.push("Rodar discovery:cycle no fim do dia para atualizar decisao sugerida.");
  } else {
    actions.push("Meta de entrevistas atingida. Revisar qualitativamente frases-chave.");
    actions.push("Finalizar documento de decisao Go/No-Go.");
  }

  if (validatedPct < 60) {
    actions.push("Buscar entrevistados com dor mais critica (perda de prazo/receita) para elevar taxa de validacao.");
  }
  if (payPct < 50) {
    actions.push("Incluir pergunta explicita de faixa de preco e urgencia de compra nas proximas entrevistas.");
  }

  const lines = [
    "# Proximas Acoes de Descoberta",
    "",
    `- Data: ${today}`,
    `- Entrevistas concluidas: ${completed}/10`,
    `- Entrevistas restantes: ${remaining}`,
    `- Meta do dia: ${todayTarget}`,
    `- Dor validada atual: ${validatedPct}%`,
    `- Disposicao de pagamento atual: ${payPct}%`,
    `- Decisao sugerida atual: ${summary?.suggestedDecision || "NO-GO"}`,
    "",
    "## Acoes prioritarias",
    ...actions.map((a) => `- ${a}`),
  ];

  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Proximas acoes de descoberta geradas.");
  console.log(`Arquivo: ${path.relative(ROOT, OUT_MD)}`);
  console.log(`Entrevistas: ${completed}/10`);
}

run();
