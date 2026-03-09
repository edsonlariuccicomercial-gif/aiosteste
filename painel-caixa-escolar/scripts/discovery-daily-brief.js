const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OPS_DIR = path.join(ROOT, "docs", "ops");

const INPUT_INTERVIEWS = path.join(OPS_DIR, "discovery-interviews.json");
const INPUT_PLAN = path.join(OPS_DIR, "discovery-sprint-plan.json");
const OUT_MD = path.join(OPS_DIR, "discovery-daily-brief.md");

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

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function run() {
  const interviewsData = readJson(INPUT_INTERVIEWS, { interviews: [] });
  const planData = readJson(INPUT_PLAN, { planDays: [] });
  const interviews = Array.isArray(interviewsData?.interviews) ? interviewsData.interviews : [];
  const planDays = Array.isArray(planData?.planDays) ? planData.planDays : [];

  const completed = interviews.filter(isCompleted).length;
  const remaining = Math.max(0, 10 - completed);
  const today = todayYmd();
  const todayPlan = planDays.find((d) => String(d.date || "") === today);
  const todayTarget = Number(todayPlan?.targetInterviews || 0);
  const focus = String(todayPlan?.focus || "Execucao de entrevistas");

  const lines = [
    "# Brief Diario de Descoberta",
    "",
    `- Data: ${today}`,
    `- Entrevistas concluidas: ${completed}/10`,
    `- Entrevistas restantes: ${remaining}`,
    `- Meta do dia: ${todayTarget}`,
    `- Foco do dia: ${focus}`,
    "",
    "## Checklist de execucao",
    "- [ ] Selecionar leads para a meta do dia",
    "- [ ] Disparar convites (WhatsApp + email)",
    "- [ ] Confirmar agenda de 15-20 min",
    "- [ ] Registrar respostas em `docs/ops/discovery-interviews.json`",
    "- [ ] Rodar `npm.cmd run discovery:cycle` ao final do dia",
    "",
    "## Proxima acao recomendada",
    remaining > 0
      ? "- Executar recrutamento e concluir ao menos 1 entrevista hoje."
      : "- Meta de entrevistas atingida. Consolidar decisao Go/No-Go.",
  ];

  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Brief diario de descoberta gerado.");
  console.log(`Arquivo: ${path.relative(ROOT, OUT_MD)}`);
}

run();
