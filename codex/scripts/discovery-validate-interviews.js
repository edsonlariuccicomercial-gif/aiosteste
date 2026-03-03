const fs = require("fs");
const path = require("path");

const INPUT_PATH = path.join(process.cwd(), "docs", "ops", "discovery-interviews.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function inRange1to5(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

function run() {
  let data;
  try {
    data = readJson(INPUT_PATH);
  } catch (_e) {
    console.error("Falha ao ler discovery-interviews.json.");
    process.exit(1);
  }

  const interviews = Array.isArray(data?.interviews) ? data.interviews : null;
  if (!interviews) {
    console.error("Formato invalido: interviews precisa ser array.");
    process.exit(1);
  }

  const errors = [];
  interviews.forEach((row, idx) => {
    const pos = idx + 1;
    const id = String(row.id || "").trim();
    if (!id) errors.push(`linha ${pos}: id vazio`);

    const date = String(row.date || "").trim();
    if (date && date !== "YYYY-MM-DD" && !isDate(date)) {
      errors.push(`linha ${pos}: date invalida (${date})`);
    }

    const freq = Number(row.frequency1to5 || 0);
    const inten = Number(row.intensity1to5 || 0);
    const urg = Number(row.urgency1to5 || 0);

    const hasAnyScore = freq > 0 || inten > 0 || urg > 0;
    if (hasAnyScore) {
      if (!inRange1to5(freq)) errors.push(`linha ${pos}: frequency1to5 fora de 1..5`);
      if (!inRange1to5(inten)) errors.push(`linha ${pos}: intensity1to5 fora de 1..5`);
      if (!inRange1to5(urg)) errors.push(`linha ${pos}: urgency1to5 fora de 1..5`);
    }
  });

  if (errors.length) {
    console.error("Validacao de entrevistas reprovada:");
    errors.slice(0, 50).forEach((e) => console.error(`- ${e}`));
    if (errors.length > 50) console.error(`... ${errors.length - 50} erros adicionais`);
    process.exit(1);
  }

  console.log("Validacao de entrevistas aprovada.");
  console.log(`Linhas verificadas: ${interviews.length}`);
}

run();
