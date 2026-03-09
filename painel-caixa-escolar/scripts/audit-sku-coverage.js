const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "dashboard", "data");
const QUOTES_PATH = path.join(DATA_DIR, "quotes.json");
const SKU_COSTS_PATH = path.join(DATA_DIR, "sku-costs.json");
const SKU_RULES_PATH = path.join(DATA_DIR, "object-sku-rules.json");
const OUT_JSON = path.join(DATA_DIR, "sku-coverage-report.json");
const OUT_MD = path.join("docs", "ops", "sku-coverage-report.md");

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeText(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findSkuByPrefix(items, prefix) {
  const found = items.find((item) => String(item.sku || "").startsWith(prefix));
  return found ? found.sku : "";
}

function skuForObject(objeto, rules, items) {
  const text = normalizeText(objeto);
  for (const rule of rules) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const matched = keywords.some((k) => {
      const keyword = normalizeText(k);
      return keyword && text.includes(keyword);
    });
    if (matched) {
      const sku = findSkuByPrefix(items, String(rule.skuPrefix || ""));
      if (sku) return sku;
    }
  }
  return "";
}

function run() {
  const quotes = readJson(QUOTES_PATH, []);
  const skuCosts = readJson(SKU_COSTS_PATH, { items: [] });
  const skuRules = readJson(SKU_RULES_PATH, { rules: [] });

  const items = Array.isArray(skuCosts.items) ? skuCosts.items : [];
  const rules = Array.isArray(skuRules.rules) ? skuRules.rules : [];

  const unclassifiedMap = {};
  let classified = 0;

  for (const quote of quotes) {
    const sku = skuForObject(quote.objeto, rules, items);
    if (sku) {
      classified += 1;
      continue;
    }
    const objeto = String(quote.objeto || "Objeto nao informado").trim() || "Objeto nao informado";
    unclassifiedMap[objeto] = (unclassifiedMap[objeto] || 0) + 1;
  }

  const total = quotes.length;
  const unclassified = total - classified;
  const coveragePct = total ? Number(((classified / total) * 100).toFixed(2)) : 0;
  const topUnclassified = Object.entries(unclassifiedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([objeto, ocorrencias]) => ({ objeto, ocorrencias }));

  const report = {
    generatedAt: new Date().toISOString(),
    totalQuotes: total,
    classifiedQuotes: classified,
    unclassifiedQuotes: unclassified,
    coveragePct,
    configuredRuleCount: rules.length,
    configuredSkuCount: items.length,
    topUnclassifiedObjects: topUnclassified,
  };

  ensureDir(OUT_JSON);
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# Relatorio de Cobertura SKU",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Cotacoes no dataset: ${total}`,
    `- Cotacoes classificadas: ${classified}`,
    `- Cotacoes nao classificadas: ${unclassified}`,
    `- Cobertura: ${coveragePct}%`,
    `- Regras configuradas: ${rules.length}`,
    `- SKUs configurados: ${items.length}`,
    "",
    "## Objetos sem classificacao (top 20)",
  ];

  if (!topUnclassified.length) {
    lines.push("- Nenhuma pendencia.");
  } else {
    for (const item of topUnclassified) {
      lines.push(`- ${item.objeto} (${item.ocorrencias})`);
    }
  }

  ensureDir(OUT_MD);
  fs.writeFileSync(OUT_MD, lines.join("\n"), "utf8");

  console.log("Auditoria de cobertura SKU concluida.");
  console.log(`Cobertura: ${coveragePct}% (${classified}/${total})`);
  console.log(`Pendencias: ${unclassified}`);
}

run();
