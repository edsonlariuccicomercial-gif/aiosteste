const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");

function parseArgs(argv) {
  const out = {
    input: "",
    output: path.join(DATA_DIR, "sgd-prequote-payload.json"),
    dry: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") out.input = String(argv[i + 1] || "");
    if (token === "--output") out.output = String(argv[i + 1] || out.output);
    if (token === "--dry") out.dry = true;
  }
  return out;
}

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

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function normalize(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSkuKey(sku) {
  return normalize(sku).replace(/[^a-z0-9]/g, "");
}

function priceModelForSku(sku, sre, skuCosts) {
  const items = Array.isArray(skuCosts?.items) ? skuCosts.items : [];
  const defaults = skuCosts?.defaults || {};
  const factors = skuCosts?.regionFactorBySre || {};

  const key = normalizeSkuKey(sku);
  const row = items.find((x) => normalizeSkuKey(x.sku) === key);
  if (!row) return 0;

  const base = toNum(row.custoBase, 0);
  if (!base) return 0;

  const freightPct = toNum(defaults.fretePct, 2.5) / 100;
  const opexPct = toNum(defaults.opexPct, 6) / 100;
  const taxPct = toNum(defaults.impostosPct, 8.5) / 100;
  const marginPct = toNum(defaults.margemAlvoPct, 18) / 100;
  const factor = toNum(factors[sre], 1) || 1;

  const adjusted = base * factor * (1 + freightPct);
  const divisor = 1 - opexPct - taxPct - marginPct;
  if (divisor <= 0) return 0;
  return Number((adjusted / divisor).toFixed(2));
}

function historyMedianForSku(sku, sre, historySummary) {
  const regionRows = Array.isArray(historySummary?.skuRegionSummary) ? historySummary.skuRegionSummary : [];
  const skuRows = Array.isArray(historySummary?.skuSummary) ? historySummary.skuSummary : [];
  const key = normalizeSkuKey(sku);

  const regionMatch = regionRows.find((row) => {
    const skuKey = normalizeSkuKey(row.sku);
    return (skuKey === key || skuKey.includes(key) || key.includes(skuKey)) && String(row.sre || "") === String(sre || "");
  });
  if (regionMatch) return toNum(regionMatch.median || regionMatch.min, 0);

  const skuMatch = skuRows.find((row) => {
    const skuKey = normalizeSkuKey(row.sku);
    return skuKey === key || skuKey.includes(key) || key.includes(skuKey);
  });
  if (skuMatch) return toNum(skuMatch.median || skuMatch.min, 0);
  return 0;
}

function suggestedUnitPrice(item, order, ctx) {
  const fallback = toNum(item.unitPrice, 0);
  const floor = priceModelForSku(item.sku, order.sre, ctx.skuCosts);
  const hist = historyMedianForSku(item.sku, order.sre, ctx.history);
  let histSafe = hist;

  // Guardrail: historico do projeto hoje pode estar em escala de cotacao total.
  // Se fugir muito do unitario corrente/modelo, ignoramos para nao inflar proposta.
  const bases = [fallback, floor].filter((x) => x > 0);
  if (histSafe > 0 && bases.length) {
    const minBase = Math.min(...bases);
    const maxBase = Math.max(...bases);
    const tooHigh = histSafe > maxBase * 3;
    const tooLow = histSafe < minBase * 0.4;
    if (tooHigh || tooLow) histSafe = 0;
  }

  const ref = histSafe || fallback || floor;
  return Number(Math.max(floor, ref).toFixed(2));
}

function fromDashboardExport(data) {
  return Array.isArray(data?.orders) ? data.orders : null;
}

function fromInternalOrders(data) {
  return Array.isArray(data) ? data : null;
}

function buildPayload(orders, ctx) {
  const proposals = [];
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) continue;

    const mappedItems = items.map((item, idx) => {
      const qty = toNum(item.qty, 0);
      const unitPrice = suggestedUnitPrice(item, order, ctx);
      const total = Number((qty * unitPrice).toFixed(2));
      return {
        line: idx + 1,
        sku: String(item.sku || ""),
        description: String(item.description || ""),
        qty,
        unitPrice,
        total,
      };
    });

    const grandTotal = Number(mappedItems.reduce((acc, item) => acc + item.total, 0).toFixed(2));
    proposals.push({
      budgetId: String(order.id || order.orderId || ""),
      school: String(order.school || ""),
      city: String(order.city || ""),
      sre: String(order.sre || ""),
      contractRef: String(order.contractRef || ""),
      confirmedAt: String(order.confirmedAt || ""),
      currency: "BRL",
      total: grandTotal,
      items: mappedItems,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "licitia-sgd-prequote-builder",
    proposals,
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const internalOrdersPath = path.join(DATA_DIR, "internal-orders.json");
  const historyPath = path.join(DATA_DIR, "price-history-summary.json");
  const skuCostsPath = path.join(DATA_DIR, "sku-costs.json");

  const history = readJson(historyPath, {});
  const skuCosts = readJson(skuCostsPath, {});

  let orders = null;
  if (args.input) {
    const input = readJson(path.resolve(ROOT, args.input), null);
    orders = fromDashboardExport(input) || fromInternalOrders(input);
    if (!orders) {
      console.error("Formato de --input invalido. Esperado array de pedidos ou objeto com campo orders.");
      process.exit(1);
    }
  } else {
    orders = readJson(internalOrdersPath, []);
  }

  const payload = buildPayload(orders, { history, skuCosts });
  if (!payload.proposals.length) {
    console.error("Nenhuma proposta foi gerada.");
    process.exit(1);
  }

  if (args.dry) {
    console.log(`Dry-run: ${payload.proposals.length} proposta(s) prontas para payload SGD.`);
    return;
  }

  ensureDir(args.output);
  fs.writeFileSync(args.output, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Payload SGD gerado: ${path.relative(ROOT, args.output)}`);
  console.log(`Propostas: ${payload.proposals.length}`);
}

run();
