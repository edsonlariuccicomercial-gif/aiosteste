const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "docs", "ops", "discovery-interviews.json");
const OUT_JSON = path.join(ROOT, "docs", "ops", "discovery-sprint-plan.json");
const OUT_MD = path.join(ROOT, "docs", "ops", "discovery-sprint-plan.md");

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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function run() {
  const data = readJson(INPUT_PATH, { interviews: [] });
  const interviews = Array.isArray(data?.interviews) ? data.interviews : [];
  const completed = interviews.filter(isCompleted).length;

  const target = 10;
  const remaining = Math.max(0, target - completed);
  const sprintDays = Number(process.env.DISCOVERY_SPRINT_DAYS || 5);
  const perDay = remaining > 0 ? Math.ceil(remaining / sprintDays) : 0;

  const today = new Date();
  const planDays = [];
  let left = remaining;
  for (let i = 0; i < sprintDays; i += 1) {
    const slots = left > 0 ? Math.min(perDay, left) : 0;
    left -= slots;
    planDays.push({
      date: ymd(addDays(today, i)),
      targetInterviews: slots,
      focus: i < 2 ? "Recrutamento ativo" : "Execucao + follow-up",
    });
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    interviewsCompleted: completed,
    interviewsTarget: target,
    interviewsRemaining: remaining,
    sprintDays,
    suggestedPerDay: perDay,
    planDays,
    outreachTemplates: {
      whatsapp:
        "Oi, [NOME]. Estou fazendo uma pesquisa rapida (15 min) sobre rotina de cotacoes em caixa escolar MG. Posso te entrevistar essa semana?",
      emailSubject: "Convite rapido: entrevista sobre rotina de cotacoes (15 min)",
      emailBody:
        "Olá, [NOME]. Estou validando uma solução para reduzir perda de prazo e melhorar priorização de cotacoes em MG. Você teria 15 minutos para uma conversa nesta semana?",
    },
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const lines = [
    "# Plano de Sprint de Descoberta",
    "",
    `- Gerado em: ${plan.generatedAt}`,
    `- Entrevistas concluidas: ${completed}/${target}`,
    `- Entrevistas restantes: ${remaining}`,
    `- Janela de sprint: ${sprintDays} dias`,
    `- Meta sugerida por dia: ${perDay}`,
    "",
    "## Plano diario",
    ...planDays.map((d) => `- ${d.date}: ${d.targetInterviews} entrevistas (${d.focus})`),
    "",
    "## Templates de convite",
    `- WhatsApp: ${plan.outreachTemplates.whatsapp}`,
    `- Email assunto: ${plan.outreachTemplates.emailSubject}`,
    `- Email corpo: ${plan.outreachTemplates.emailBody}`,
  ];
  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log("Plano de sprint de descoberta gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);
}

run();
