const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OPS_DIR = path.join(ROOT, "docs", "ops");

const OUTPUT_JSON = path.join(OPS_DIR, "onboarding-session.json");
const OUTPUT_MD = path.join(OPS_DIR, "onboarding-session.md");

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildSession() {
  const startedAt = nowIso();
  const date = startedAt.slice(0, 10);
  const customer = safeText(process.env.ONBOARDING_CUSTOMER, "Fornecedor MG");
  const cnpj = safeText(process.env.ONBOARDING_CNPJ, "nao informado");
  const owner = safeText(process.env.ONBOARDING_OWNER, "operacao");

  return {
    startedAt,
    date,
    customer,
    cnpj,
    owner,
    durationMin: 30,
    steps: [
      {
        block: "0-10 min",
        name: "Acesso e credenciais",
        checklist: [
          "Validar credenciais SGD (SGD_DOC/SGD_CNPJ e SGD_PASS).",
          "Confirmar acesso local ao projeto.",
          "Definir SREs foco e volume alvo do dia.",
        ],
      },
      {
        block: "10-20 min",
        name: "Primeira rodada operacional",
        checklist: [
          "Executar npm.cmd run ops:daily:collect.",
          "Validar dashboard/data/ops-daily-run-report.json.",
          "Validar docs/ops/ops-daily-last-run.md.",
        ],
      },
      {
        block: "20-30 min",
        name: "Leitura e acao",
        checklist: [
          "Executar npm.cmd run dashboard:serve.",
          "Filtrar cotacoes por SRE/municipio prioritario.",
          "Exportar urgentes e iniciar tratativa de itens <= 48h.",
        ],
      },
    ],
    successCriteria: [
      "Pipeline ops:daily:collect sem erro.",
      "Cobertura SKU >= 95%.",
      "Operador gera lista de urgentes sem suporte.",
    ],
  };
}

function toMarkdown(session) {
  const lines = [
    "# Sessao de Onboarding (30 min)",
    "",
    `- Data: ${session.date}`,
    `- Inicio: ${session.startedAt}`,
    `- Cliente: ${session.customer}`,
    `- CNPJ: ${session.cnpj}`,
    `- Responsavel: ${session.owner}`,
    "",
    "## Roteiro",
  ];

  for (const step of session.steps) {
    lines.push("", `### ${step.block} - ${step.name}`);
    for (const item of step.checklist) {
      lines.push(`- [ ] ${item}`);
    }
  }

  lines.push("", "## Criterios de sucesso");
  for (const item of session.successCriteria) {
    lines.push(`- [ ] ${item}`);
  }

  return `${lines.join("\n")}\n`;
}

function run() {
  const session = buildSession();
  fs.mkdirSync(OPS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(session, null, 2), "utf8");
  fs.writeFileSync(OUTPUT_MD, toMarkdown(session), "utf8");

  console.log("Sessao de onboarding criada.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUTPUT_MD)}`);
}

run();
