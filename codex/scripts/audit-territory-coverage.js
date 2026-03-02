const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "dashboard", "data");
const QUOTES_PATH = path.join(DATA_DIR, "quotes.json");
const MAP_PATH = path.join(DATA_DIR, "school-territory-map.json");
const OUT_JSON = path.join(DATA_DIR, "territory-coverage-report.json");
const OUT_MD = path.join("docs", "ops", "territory-coverage-report.md");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return fallback;
  }
}

function normalizeText(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function run() {
  const quotes = readJson(QUOTES_PATH, []);
  const map = readJson(MAP_PATH, {});

  const schools = [...new Set(quotes.map((q) => String(q.escola || "").trim()).filter(Boolean))];
  const unmapped = [];
  const mapped = [];

  for (const school of schools) {
    const key = normalizeText(school);
    const isMapped = Boolean(map[key]);
    if (isMapped) {
      mapped.push({
        escola: school,
        municipio: map[key].municipio || "",
        sre: map[key].sre || "",
      });
    } else {
      unmapped.push({ escola: school });
    }
  }

  const total = schools.length;
  const mappedCount = mapped.length;
  const coveragePct = total ? Number(((mappedCount / total) * 100).toFixed(2)) : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    totalSchoolsInQuotes: total,
    mappedSchools: mappedCount,
    unmappedSchools: unmapped.length,
    coveragePct,
    unmapped,
  };

  ensureDir(OUT_JSON);
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# Relatorio de Cobertura Territorial",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Escolas no dataset: ${total}`,
    `- Escolas mapeadas: ${mappedCount}`,
    `- Escolas nao mapeadas: ${unmapped.length}`,
    `- Cobertura: ${coveragePct}%`,
    "",
    "## Pendencias de mapeamento",
  ];

  if (!unmapped.length) {
    lines.push("- Nenhuma pendencia.");
  } else {
    for (const item of unmapped) {
      lines.push(`- ${item.escola}`);
    }
  }

  ensureDir(OUT_MD);
  fs.writeFileSync(OUT_MD, lines.join("\n"), "utf8");

  console.log("Auditoria de cobertura territorial concluida.");
  console.log(`Cobertura: ${coveragePct}% (${mappedCount}/${total})`);
  console.log(`Pendencias: ${unmapped.length}`);
}

run();
