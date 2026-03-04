const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const STRATEGY_DIR = path.join(ROOT, "docs", "strategy");
const OPS_DIR = path.join(ROOT, "docs", "ops");

const OUT_JSON = path.join(OPS_DIR, "commercial-kit.json");
const OUT_MD = path.join(OPS_DIR, "commercial-kit.md");

function nowIso() {
  return new Date().toISOString();
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  } catch (_e) {
    return "";
  }
}

function extractBullets(sectionTitle, text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().toLowerCase() === sectionTitle.trim().toLowerCase());
  if (idx < 0) return [];
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) break;
    if (line.startsWith("- ")) out.push(line.slice(2).trim());
  }
  return out;
}

function extractParagraph(sectionTitle, text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().toLowerCase() === sectionTitle.trim().toLowerCase());
  if (idx < 0) return "";
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("## ")) break;
    return line.replace(/^- /, "").trim();
  }
  return "";
}

function buildKit() {
  const onePagerPath = path.join(STRATEGY_DIR, "one-pager-comercial-fornecedor-mg.md");
  const packagingPath = path.join(STRATEGY_DIR, "commercial-packaging-plan.md");
  const onePager = readText(onePagerPath);
  const packaging = readText(packagingPath);

  const cta = extractParagraph("## CTA", onePager) || "Agendar prova operacional assistida de 7 dias.";
  const expected = extractBullets("## Resultado esperado para o cliente", onePager);

  return {
    generatedAt: nowIso(),
    pitch: "LicitIA MG transforma cotacoes do SGD em rotina comercial acionavel com velocidade e previsibilidade.",
    offers: [
      {
        plan: "Starter",
        priceRef: "R$ 497/mes",
        scope: "Dashboard + filtros + exportacao + rotina operacional",
      },
      {
        plan: "Pro",
        priceRef: "R$ 1.497/mes",
        scope: "Starter + historico de preco + lance recomendado + suporte prioritario",
      },
      {
        plan: "Enterprise",
        priceRef: "sob proposta",
        scope: "Pro + customizacoes + SLA + integracoes dedicadas",
      },
    ],
    expectedOutcomes: expected,
    cta,
    references: {
      onePager: path.relative(ROOT, onePagerPath),
      packaging: path.relative(ROOT, packagingPath),
    },
  };
}

function toMd(kit) {
  const lines = [
    "# Kit Comercial Pronto",
    "",
    `- Gerado em: ${kit.generatedAt}`,
    "",
    "## Pitch (30s)",
    kit.pitch,
    "",
    "## Planos",
  ];

  for (const offer of kit.offers) {
    lines.push(`- ${offer.plan}: ${offer.scope} (${offer.priceRef})`);
  }

  lines.push("", "## Resultado esperado");
  for (const item of kit.expectedOutcomes) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## CTA");
  lines.push(`- ${kit.cta}`);

  return `${lines.join("\n")}\n`;
}

function run() {
  const kit = buildKit();
  fs.mkdirSync(OPS_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(kit, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, toMd(kit), "utf8");
  console.log("Kit comercial gerado.");
  console.log(`Arquivo JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Arquivo MD: ${path.relative(ROOT, OUT_MD)}`);
}

run();
