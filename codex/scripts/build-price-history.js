const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "dashboard", "data");
const QUOTES_PATH = path.join(DATA_DIR, "quotes.json");
const RULES_PATH = path.join(DATA_DIR, "object-sku-rules.json");
const COSTS_PATH = path.join(DATA_DIR, "sku-costs.json");
const OUT_PATH = path.join(DATA_DIR, "price-history.json");

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "")
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
  const text = normalize(objeto);
  for (const rule of rules) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const matched = keywords.some((keyword) => {
      const key = normalize(keyword);
      return key && text.includes(key);
    });
    if (!matched) continue;
    const sku = findSkuByPrefix(items, String(rule.skuPrefix || ""));
    if (sku) return sku;
  }
  return "";
}

function marginPct(cost, price) {
  if (!price) return 0;
  return ((price - cost) / price) * 100;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function uniqueKey(entry) {
  return [
    entry.quoteId,
    entry.escola,
    entry.prazo,
    entry.sku,
    entry.precoSugerido.toFixed(2),
    entry.custoEstimado.toFixed(2),
  ].join("|");
}

function main() {
  const now = new Date().toISOString();
  const collectedAt = process.env.PRICE_HISTORY_COLLECTED_AT || now.slice(0, 10);

  const quotes = readJson(QUOTES_PATH, []);
  const rules = readJson(RULES_PATH, { rules: [] });
  const costs = readJson(COSTS_PATH, { items: [] });
  const previous = readJson(OUT_PATH, { schemaVersion: 1, entries: [] });

  const items = Array.isArray(costs.items) ? costs.items : [];
  const ruleList = Array.isArray(rules.rules) ? rules.rules : [];
  const oldEntries = Array.isArray(previous.entries) ? previous.entries : [];

  const map = new Map();
  for (const entry of oldEntries) {
    if (!entry || typeof entry !== "object") continue;
    const key = uniqueKey({
      quoteId: String(entry.quoteId || ""),
      escola: String(entry.escola || ""),
      prazo: String(entry.prazo || ""),
      sku: String(entry.sku || ""),
      precoSugerido: toNumber(entry.precoSugerido, 0),
      custoEstimado: toNumber(entry.custoEstimado, 0),
    });
    map.set(key, entry);
  }

  const rows = Array.isArray(quotes) ? quotes : [];
  let inserted = 0;
  for (const row of rows) {
    const custo = toNumber(row.custoEstimado, 0);
    const preco = toNumber(row.precoSugerido, 0);
    const sku = skuForObject(row.objeto, ruleList, items);

    const entry = {
      quoteId: String(row.id || ""),
      escola: String(row.escola || ""),
      municipio: String(row.municipio || ""),
      sre: String(row.sre || ""),
      objeto: String(row.objeto || ""),
      objetoNormalizado: normalize(row.objeto),
      sku,
      prazo: String(row.prazo || ""),
      status: String(row.status || ""),
      custoEstimado: Number(custo.toFixed(2)),
      precoSugerido: Number(preco.toFixed(2)),
      margemPct: Number(marginPct(custo, preco).toFixed(2)),
      collectedAt,
      source: "quotes.json",
    };

    const key = uniqueKey(entry);
    if (!map.has(key)) inserted += 1;
    map.set(key, entry);
  }

  const entries = Array.from(map.values()).sort((a, b) =>
    String(a.collectedAt || "").localeCompare(String(b.collectedAt || ""))
  );

  const output = {
    schemaVersion: 1,
    generatedAt: now,
    sourceQuotesCount: rows.length,
    entriesCount: entries.length,
    insertedEntries: inserted,
    entries,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log("Historico de precos consolidado.");
  console.log(`Arquivo: ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`Cotacoes fonte: ${rows.length}`);
  console.log(`Entradas novas: ${inserted}`);
  console.log(`Entradas totais: ${entries.length}`);
}

main();
