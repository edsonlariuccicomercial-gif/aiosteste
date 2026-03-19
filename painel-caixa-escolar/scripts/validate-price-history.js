const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "dashboard", "data");
const HISTORY_PATH = path.join(DATA_DIR, "price-history.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function isDateYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num);
}

function validateEntry(entry, index) {
  const errors = [];
  const requiredText = [
    "quoteId",
    "escola",
    "municipio",
    "sre",
    "objeto",
    "objetoNormalizado",
    "prazo",
    "status",
    "collectedAt",
  ];

  for (const field of requiredText) {
    if (!String(entry[field] || "").trim()) {
      errors.push(`entry[${index}].${field}: vazio`);
    }
  }

  if (!isFiniteNumber(entry.custoEstimado)) errors.push(`entry[${index}].custoEstimado: invalido`);
  if (!isFiniteNumber(entry.precoSugerido)) errors.push(`entry[${index}].precoSugerido: invalido`);
  if (!isFiniteNumber(entry.margemPct)) errors.push(`entry[${index}].margemPct: invalido`);
  if (!isDateYmd(entry.collectedAt)) errors.push(`entry[${index}].collectedAt: formato esperado YYYY-MM-DD`);
  if (!isDateYmd(entry.prazo)) errors.push(`entry[${index}].prazo: formato esperado YYYY-MM-DD`);

  return errors;
}

function main() {
  let history;
  try {
    history = readJson(HISTORY_PATH);
  } catch (_e) {
    console.error("Falha ao ler price-history.json. Rode dashboard:history:build antes.");
    process.exit(1);
  }

  const errors = [];
  if (Number(history.schemaVersion) !== 1) {
    errors.push(`schemaVersion invalida: ${history.schemaVersion}`);
  }

  const entries = Array.isArray(history.entries) ? history.entries : null;
  if (!entries) {
    errors.push("entries ausente ou invalido (esperado array)");
  } else {
    entries.forEach((entry, index) => {
      errors.push(...validateEntry(entry, index));
    });
  }

  if (errors.length) {
    console.error("Validacao do historico de precos reprovada.");
    for (const err of errors.slice(0, 50)) console.error(`- ${err}`);
    if (errors.length > 50) console.error(`... ${errors.length - 50} erros adicionais`);
    process.exit(1);
  }

  console.log("Validacao do historico de precos aprovada.");
  console.log(`Entradas validadas: ${entries.length}`);
}

main();
