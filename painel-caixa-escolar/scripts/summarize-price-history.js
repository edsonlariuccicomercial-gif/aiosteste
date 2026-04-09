const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "dashboard", "data");
const HISTORY_PATH = path.join(DATA_DIR, "price-history.json");
const SUMMARY_PATH = path.join(DATA_DIR, "price-history-summary.json");

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function stats(values) {
  if (!values.length) return { count: 0, min: 0, median: 0, avg: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const med = median(values);
  const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
  return {
    count: values.length,
    min: Number(min.toFixed(2)),
    median: Number(med.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    max: Number(max.toFixed(2)),
  };
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function main() {
  const history = readJson(HISTORY_PATH, { entries: [] });
  const entries = Array.isArray(history.entries) ? history.entries : [];

  const bySku = new Map();
  const bySkuRegion = new Map();
  // Story 6.3: Track by tipo (ganho/perdido/proposta)
  const bySkuWon = new Map();
  const bySkuLost = new Map();

  for (const entry of entries) {
    const sku = String(entry.sku || "");
    if (!sku) continue;
    const sre = String(entry.sre || "SRE nao informada");
    const price = toNumber(entry.precoSugerido, 0);
    const collectedAt = String(entry.collectedAt || "");
    const tipo = String(entry.tipo || "proposta");

    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push({ price, collectedAt, tipo });

    const regionKey = `${sku}__${sre}`;
    if (!bySkuRegion.has(regionKey)) bySkuRegion.set(regionKey, { sku, sre, rows: [] });
    bySkuRegion.get(regionKey).rows.push({ price, collectedAt, tipo });

    // Story 6.3: Separate won/lost
    if (tipo === "ganho") {
      if (!bySkuWon.has(sku)) bySkuWon.set(sku, []);
      bySkuWon.get(sku).push({ price, collectedAt });
    } else if (tipo === "perdido") {
      if (!bySkuLost.has(sku)) bySkuLost.set(sku, []);
      bySkuLost.get(sku).push({ price, collectedAt });
    }
  }

  const skuSummary = Array.from(bySku.entries())
    .map(([sku, rows]) => {
      const values = rows.map((r) => r.price);
      const lastCollectedAt = rows
        .map((r) => r.collectedAt)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .slice(-1)[0] || null;
      // Story 6.3: Add resultado metrics
      const totalGanhos = rows.filter(r => r.tipo === "ganho").length;
      const totalPerdidos = rows.filter(r => r.tipo === "perdido").length;
      const totalComResultado = totalGanhos + totalPerdidos;
      const taxaConversao = totalComResultado > 0 ? Number((totalGanhos / totalComResultado).toFixed(3)) : null;
      return { sku, ...stats(values), lastCollectedAt, totalGanhos, totalPerdidos, taxaConversao };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const skuRegionSummary = Array.from(bySkuRegion.values())
    .map((group) => {
      const values = group.rows.map((r) => r.price);
      const lastCollectedAt = group.rows
        .map((r) => r.collectedAt)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .slice(-1)[0] || null;
      const totalGanhos = group.rows.filter(r => r.tipo === "ganho").length;
      const totalPerdidos = group.rows.filter(r => r.tipo === "perdido").length;
      const totalComResultado = totalGanhos + totalPerdidos;
      const taxaConversao = totalComResultado > 0 ? Number((totalGanhos / totalComResultado).toFixed(3)) : null;
      return {
        sku: group.sku,
        sre: group.sre,
        ...stats(values),
        lastCollectedAt,
        totalGanhos, totalPerdidos, taxaConversao,
      };
    })
    .sort((a, b) => (a.sku === b.sku ? a.sre.localeCompare(b.sre) : a.sku.localeCompare(b.sku)));

  // Story 6.3: Won-only and Lost-only summaries
  const skuWonSummary = Array.from(bySkuWon.entries())
    .map(([sku, rows]) => {
      const values = rows.map(r => r.price);
      const lastCollectedAt = rows.map(r => r.collectedAt).sort().slice(-1)[0] || null;
      return { sku, ...stats(values), lastCollectedAt };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const skuLostSummary = Array.from(bySkuLost.entries())
    .map(([sku, rows]) => {
      const values = rows.map(r => r.price);
      const lastCollectedAt = rows.map(r => r.collectedAt).sort().slice(-1)[0] || null;
      return { sku, ...stats(values), lastCollectedAt };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const output = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceEntries: entries.length,
    skuSummary,
    skuRegionSummary,
    skuWonSummary,
    skuLostSummary,
  };

  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log("Resumo do historico de precos gerado.");
  console.log(`Arquivo: ${path.relative(process.cwd(), SUMMARY_PATH)}`);
  console.log(`SKUs com resumo: ${skuSummary.length}`);
  console.log(`SKU+SRE com resumo: ${skuRegionSummary.length}`);
  console.log(`SKUs com ganhos: ${skuWonSummary.length}`);
  console.log(`SKUs com perdas: ${skuLostSummary.length}`);
}

main();
