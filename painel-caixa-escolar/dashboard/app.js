let quotes = [];
let syncStatus = {};
let quickMode = "all";
let skuCosts = { items: [], regionFactorBySre: {}, defaults: {} };
let objectSkuRules = { rules: [] };
let priceHistorySummary = { skuSummary: [], skuRegionSummary: [] };
let opsDailyReport = { ok: false, generatedAt: null };
let opsAlertsReport = { freshness: null };
let opsTrendHistory = { weekly: null };
let internalOrders = [];
let prequoteState = {};
let refreshTimer = null;
let isRefreshing = false;
let refreshTicker = null;
let nextRefreshSec = 0;
let lastRefreshAt = null;
let expandedGroups = new Set();

const SGD_ORCAMENTOS_URL = "https://caixaescolar.educacao.mg.gov.br/compras/orcamentos";

const DASHBOARD_REFRESH_MS = 60000;

// ===== PERFORMANCE UTILITIES (Story 1.6) =====
const _fetchCache = new Map();
const CACHE_TTL_DEFAULT = 5 * 60 * 1000;
const CACHE_TTL_HEAVY = 15 * 60 * 1000;

async function cachedFetch(url, ttlMs = CACHE_TTL_DEFAULT) {
  const entry = _fetchCache.get(url);
  if (entry && (Date.now() - entry.ts) < ttlMs) return entry.data;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  _fetchCache.set(url, { data, ts: Date.now() });
  return data;
}

function invalidateAllCaches() {
  _fetchCache.clear();
  _memoVersion++;
  _memoStore.clear();
}

function debounce(fn, ms) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

let _memoVersion = 0;
const _memoStore = new Map();
function memo(key, fn) {
  const k = _memoVersion + ":" + key;
  if (_memoStore.has(k)) return _memoStore.get(k);
  const r = fn();
  _memoStore.set(k, r);
  return r;
}

let _paginationPage = 1;
const PAGE_SIZE = 50;

const PREQUOTE_STORAGE_KEY = "licitia.prequote.v1";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

const el = {
  kpiOpen: document.getElementById("kpi-open"),
  kpiUrgent: document.getElementById("kpi-urgent"),
  kpiMargin: document.getElementById("kpi-margin"),
  kpiRevenue: document.getElementById("kpi-revenue"),
  kpiOlistSync: document.getElementById("kpi-olist-sync"),
  opsHealthPill: document.getElementById("ops-health-pill"),
  refreshPill: document.getElementById("refresh-pill"),
  refreshNowBtn: document.getElementById("btn-refresh-now"),
  trendHeadline: document.getElementById("trend-headline"),
  trendMetrics: document.getElementById("trend-metrics"),
  opsAlertsList: document.getElementById("ops-alerts-list"),
  table: document.getElementById("quote-table"),
  objetoOverview: document.getElementById("objeto-overview"),
  objetoGroups: document.getElementById("objeto-groups"),
  expandAll: document.getElementById("btn-expand-all"),
  collapseAll: document.getElementById("btn-collapse-all"),
  sre: document.getElementById("filter-sre"),
  city: document.getElementById("filter-city"),
  status: document.getElementById("filter-status"),
  query: document.getElementById("filter-query"),
  exportCsv: document.getElementById("btn-export-csv"),
  exportUrgentCsv: document.getElementById("btn-export-urgent"),
  qaAll: document.getElementById("qa-all"),
  qaHigh: document.getElementById("qa-high"),
  qaUrgent: document.getElementById("qa-urgent"),
  qaLowConfidence: document.getElementById("qa-low-confidence"),
  resultSummary: document.getElementById("result-summary"),
  skuCoverageSummary: document.getElementById("sku-coverage-summary"),
  skuUnclassified: document.getElementById("sku-unclassified"),
  copySkuSuggestions: document.getElementById("btn-copy-sku-suggestions"),
  skuCopyFeedback: document.getElementById("sku-copy-feedback"),
  criticalAlerts: document.getElementById("critical-alerts"),
  prequoteSummary: document.getElementById("prequote-summary"),
  prequoteFeedback: document.getElementById("prequote-feedback"),
  prequoteOrders: document.getElementById("prequote-orders"),
  exportPrequoteJson: document.getElementById("btn-export-prequote-json"),
  exportPrequoteCsv: document.getElementById("btn-export-prequote-csv"),
  simCost: document.getElementById("sim-cost"),
  simSku: document.getElementById("sim-sku"),
  simRegion: document.getElementById("sim-region"),
  simFreight: document.getElementById("sim-freight"),
  simOpex: document.getElementById("sim-opex"),
  simTax: document.getElementById("sim-tax"),
  simMargin: document.getElementById("sim-margin"),
  simEffectiveCost: document.getElementById("sim-effective-cost"),
  simPrice: document.getElementById("sim-price"),
  simProfit: document.getElementById("sim-profit"),
};

function _daysTo(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  const diff = d.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}
function daysTo(dateIso) { return memo("d:" + dateIso, () => _daysTo(dateIso)); }

function marginPct(row) {
  if (!row.precoSugerido) return 0;
  return ((row.precoSugerido - row.custoEstimado) / row.precoSugerido) * 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function strategicObjectFit(row) {
  const obj = normalizedText(row.objeto);
  // Grupos de despesa do SGD (API) e labels legados
  if (obj.includes("alimenta") || obj.includes("merenda") || obj.includes("generos")) return 15;
  if (obj.includes("pereciveis") || obj.includes("hortifrutigranjeiros")) return 14;
  if (obj.includes("limpeza") || obj.includes("higiene") || obj.includes("saneante")) return 12;
  if (obj.includes("escritorio") || obj.includes("consumo") || obj.includes("material")) return 10;
  if (obj.includes("manutencao") || obj.includes("reforma")) return 11;
  if (obj.includes("transporte")) return 9;
  if (obj.includes("pedagogic") || obj.includes("educacion")) return 8;
  if (obj.includes("capacitacao") || obj.includes("formacao")) return 7;
  if (obj.includes("utensilios") || obj.includes("cozinha")) return 10;
  if (obj.includes("nao identificado") || obj.startsWith("grupo #")) return 4;
  return 6;
}

function _opportunityScore(row) {
  if (row.status === "encerrado") return 0;

  const days = daysTo(row.prazo);
  const margin = marginPct(row);

  const prazoScore = clamp((30 - days) / 30, 0, 1) * 35;
  const margemScore = clamp(margin / 25, 0, 1) * 30;
  const fitScore = strategicObjectFit(row);

  const confianca = normalizedText(row.confiancaObjeto);
  const objetoConfiavel = normalizedText(row.objeto) !== "objeto nao identificado";
  const confTerritorio = normalizedText(row.confiancaTerritorio);
  const territorioMapeado = confTerritorio ? confTerritorio !== "baixa" : (
    String(row.sre || "").toLowerCase() !== "sre nao mapeada" &&
    String(row.municipio || "").toLowerCase() !== "nao mapeado"
  );

  const scoreObjeto = confianca === "alta" ? 12 : confianca === "media" ? 7 : objetoConfiavel ? 4 : 0;
  const scoreTerritorio = confTerritorio === "alta" ? 8 : confTerritorio === "media" ? 5 : territorioMapeado ? 4 : 0;
  const confiancaDadosScore = scoreObjeto + scoreTerritorio;

  return Math.round(prazoScore + margemScore + fitScore + confiancaDadosScore);
}
function opportunityScore(row) { return memo("os:" + row.id, () => _opportunityScore(row)); }

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function moneyInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(n.toFixed(2));
}

function loadPrequoteState() {
  try {
    const raw = localStorage.getItem(PREQUOTE_STORAGE_KEY);
    prequoteState = raw ? JSON.parse(raw) : {};
  } catch (_e) {
    prequoteState = {};
  }
}

function savePrequoteState() {
  try {
    localStorage.setItem(PREQUOTE_STORAGE_KEY, JSON.stringify(prequoteState));
  } catch (_e) {
    // no-op (storage unavailable)
  }
}

function ensurePrequoteOrder(order) {
  if (!order || !order.id) return;
  if (prequoteState[order.id]) return;

  const items = Array.isArray(order.items) ? order.items : [];
  prequoteState[order.id] = {
    status: "draft",
    updatedAt: null,
    approvedAt: null,
    items: items.map((item) => {
      const qty = Number(item.qty || 0);
      const baseUnit = moneyInput(item.unitPrice || 0);
      return {
        sku: String(item.sku || ""),
        description: String(item.description || ""),
        qty: Number.isFinite(qty) ? qty : 0,
        baseUnitPrice: baseUnit,
        proposedUnitPrice: baseUnit,
      };
    }),
  };
}

function filteredInternalOrders() {
  const sre = el.sre.value;
  const city = el.city.value;
  const query = normalizedText(el.query.value.trim());

  return internalOrders
    .filter((o) => (sre === "all" ? true : o.sre === sre))
    .filter((o) => (city === "all" ? true : o.city === city))
    .filter((o) => {
      if (!query) return true;
      const text = normalizedText(
        [o.school, o.city, o.sre, ...(Array.isArray(o.items) ? o.items.map((i) => i.description || i.sku) : [])].join(" ")
      );
      return text.includes(query);
    })
    .sort((a, b) => String(b.confirmedAt || "").localeCompare(String(a.confirmedAt || "")));
}

function prequoteTotals(orderId) {
  const draft = prequoteState[orderId];
  const items = Array.isArray(draft?.items) ? draft.items : [];
  const total = items.reduce((acc, item) => acc + Number(item.qty || 0) * Number(item.proposedUnitPrice || 0), 0);
  return { total };
}

function prequoteStatusBadge(status) {
  if (status === "approved") {
    return '<span class="prequote-status prequote-status-approved">Aprovada</span>';
  }
  return '<span class="prequote-status prequote-status-draft">Pendente</span>';
}

function setPrequoteFeedback(message) {
  if (!el.prequoteFeedback) return;
  el.prequoteFeedback.textContent = message || "";
}

function _priority(row) {
  const score = opportunityScore(row);
  if (score >= 70) return { label: "Alta", cls: "p-high", score };
  if (score >= 40) return { label: "Media", cls: "p-medium", score };
  return { label: "Baixa", cls: "p-low", score };
}
function priority(row) { return memo("p:" + row.id, () => _priority(row)); }

function populateFilters() {
  const sres = [...new Set(quotes.map((q) => q.sre))].sort();
  const cities = [...new Set(quotes.map((q) => q.municipio))].sort();

  el.sre.innerHTML = ['<option value="all">Todas</option>', ...sres.map((s) => `<option value="${s}">${s}</option>`)].join("");
  el.city.innerHTML = ['<option value="all">Todos</option>', ...cities.map((c) => `<option value="${c}">${c}</option>`)].join("");
}

function populateSimulatorOptions() {
  if (el.simSku) {
    const items = Array.isArray(skuCosts.items) ? skuCosts.items : [];
    el.simSku.innerHTML = items
      .map((item) => `<option value="${item.sku}">${item.sku} - ${item.descricao}</option>`)
      .join("");
  }

  if (el.simRegion) {
    const regional = skuCosts.regionFactorBySre || {};
    const regions = Object.keys(regional).length
      ? Object.keys(regional).sort()
      : [...new Set(quotes.map((q) => q.sre))].sort();
    el.simRegion.innerHTML = regions.map((sre) => `<option value="${sre}">${sre}</option>`).join("");
  }

  if (el.simFreight && skuCosts.defaults && Number.isFinite(skuCosts.defaults.fretePct)) {
    el.simFreight.value = String(skuCosts.defaults.fretePct);
  }
}

function baseCostForSku(sku) {
  const items = Array.isArray(skuCosts.items) ? skuCosts.items : [];
  const found = items.find((item) => item.sku === sku);
  return found ? Number(found.custoBase || 0) : 0;
}

function serviceBandCostForRow(row, sku) {
  const bands = Array.isArray(skuCosts.serviceCostBands) ? skuCosts.serviceCostBands : [];
  if (!bands.length) return 0;

  const prefix = String(sku || "").split("-").slice(0, 2).join("-");
  const text = normalizedText([row.objeto, row.objectRaw].filter(Boolean).join(" "));

  for (const band of bands) {
    const bandPrefix = String(band.skuPrefix || "");
    if (bandPrefix && !String(sku).startsWith(bandPrefix) && bandPrefix !== prefix) continue;
    const keys = Array.isArray(band.keywords) ? band.keywords : [];
    const match = keys.some((k) => {
      const key = normalizedText(k);
      return key && text.includes(key);
    });
    if (match) return Number(band.custoBase || 0);
  }
  return 0;
}

function findSkuByPrefix(prefix) {
  const items = Array.isArray(skuCosts.items) ? skuCosts.items : [];
  const found = items.find((item) => String(item.sku || "").startsWith(prefix));
  return found ? found.sku : "";
}

function regionFactor(sre) {
  const factor = Number((skuCosts.regionFactorBySre || {})[sre]);
  return factor > 0 ? factor : 1;
}

// Story 6.5: Hierarchical SKU matching — specific first, then category fallback
function skuForQuote(row) {
  const obj = normalizedText(row.objeto);
  const rules = Array.isArray(objectSkuRules.rules) ? objectSkuRules.rules : [];

  // Pass 1: Try specific rules first (tier=specific)
  const specific = rules.filter(r => r.tier === "specific");
  for (const rule of specific) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const hasMatch = keywords.some((keyword) => {
      const normalizedKeyword = normalizedText(keyword);
      return normalizedKeyword && obj.includes(normalizedKeyword);
    });
    if (hasMatch) {
      const prefix = String(rule.skuPrefix || "");
      const sku = findSkuByPrefix(prefix);
      if (sku) { console.log("[SKU] " + obj.slice(0, 40) + " → " + sku + " (específico)"); return sku; }
    }
  }

  // Pass 2: Try category rules (tier=category or no tier)
  const category = rules.filter(r => r.tier !== "specific");
  for (const rule of category) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const hasMatch = keywords.some((keyword) => {
      const normalizedKeyword = normalizedText(keyword);
      return normalizedKeyword && obj.includes(normalizedKeyword);
    });
    if (hasMatch) {
      const prefix = String(rule.skuPrefix || "");
      const sku = findSkuByPrefix(prefix);
      if (sku) { console.log("[SKU] " + obj.slice(0, 40) + " → " + sku + " (categoria)"); return sku; }
    }
  }

  // Pass 3: Hardcoded fallback
  if (obj.includes("feijao")) return findSkuByPrefix("ALIM-FEIJAO");
  if (obj.includes("alimentacao") || obj.includes("merenda") || obj.includes("arroz")) return findSkuByPrefix("ALIM-ARROZ");
  if (obj.includes("limpeza") || obj.includes("higiene")) return findSkuByPrefix("LIMP-AGUA-SANITARIA");
  if (obj.includes("escritorio") || obj.includes("consumo") || obj.includes("caderno")) return findSkuByPrefix("ESCR-CADERNO");
  return "";
}

function pricingDefaults() {
  const defaults = skuCosts.defaults || {};
  const freightPct = Number.isFinite(Number(defaults.fretePct)) ? Number(defaults.fretePct) : 2.5;
  const opexPct = Number.isFinite(Number(defaults.opexPct)) ? Number(defaults.opexPct) : 6;
  const taxPct = Number.isFinite(Number(defaults.impostosPct)) ? Number(defaults.impostosPct) : 8.5;
  const marginPct = Number.isFinite(Number(defaults.margemAlvoPct)) ? Number(defaults.margemAlvoPct) : 18;
  return { freightPct, opexPct, taxPct, marginPct };
}

function _historyRangeForSku(sku, sre) {
  if (!sku) return null;
  const byRegion = Array.isArray(priceHistorySummary.skuRegionSummary)
    ? priceHistorySummary.skuRegionSummary
    : [];
  const bySku = Array.isArray(priceHistorySummary.skuSummary) ? priceHistorySummary.skuSummary : [];

  const exact = byRegion.find((item) => item.sku === sku && item.sre === sre);
  if (exact) {
    return {
      min: Number(exact.min || 0),
      median: Number(exact.median || 0),
      max: Number(exact.max || 0),
      count: Number(exact.count || 0),
      scope: "SKU+SRE",
    };
  }

  const fallback = bySku.find((item) => item.sku === sku);
  if (!fallback) return null;
  return {
    min: Number(fallback.min || 0),
    median: Number(fallback.median || 0),
    max: Number(fallback.max || 0),
    count: Number(fallback.count || 0),
    scope: "SKU",
  };
}
function historyRangeForSku(sku, sre) { return memo("hr:" + sku + ":" + sre, () => _historyRangeForSku(sku, sre)); }

function historyRangeLabel(range) {
  if (!range || !range.count) return "-";
  const base = `${brl.format(range.min)} - ${brl.format(range.max)}`;
  return `${base} (n=${range.count}, ${range.scope})`;
}

function suggestedBid(row, minPrice, historyRange) {
  const priceCurrent = Number(row.precoSugerido || 0);
  const floor = Number(minPrice || 0);
  const days = daysTo(row.prazo);

  const reference = historyRange && historyRange.count
    ? Number(historyRange.median || historyRange.min || priceCurrent || floor)
    : Number(priceCurrent || floor);

  const urgencyFactor = days <= 2 ? 0.97 : days <= 5 ? 0.985 : 1.0;
  const adjusted = reference * urgencyFactor;
  const safe = Math.max(floor, adjusted);
  return Number(safe.toFixed(2));
}

function _quoteMinPricing(row) {
  const sku = skuForQuote(row);
  if (!sku) return { sku: "", minPrice: 0 };

  const base = serviceBandCostForRow(row, sku) || baseCostForSku(sku);
  if (!base) return { sku, minPrice: 0 };

  const { freightPct, opexPct, taxPct, marginPct } = pricingDefaults();
  const adjustedCost = base * regionFactor(row.sre) * (1 + freightPct / 100);
  const divisor = 1 - opexPct / 100 - taxPct / 100 - marginPct / 100;
  const minPrice = divisor > 0 ? adjustedCost / divisor : 0;
  return { sku, minPrice };
}
function quoteMinPricing(row) { return memo("qmp:" + row.id, () => _quoteMinPricing(row)); }

function minPriceForSku(sku, sre) {
  if (!sku) return 0;
  const base = baseCostForSku(sku);
  if (!base) return 0;

  const { freightPct, opexPct, taxPct, marginPct } = pricingDefaults();
  const adjustedCost = base * regionFactor(sre) * (1 + freightPct / 100);
  const divisor = 1 - opexPct / 100 - taxPct / 100 - marginPct / 100;
  if (divisor <= 0) return 0;
  return Number((adjustedCost / divisor).toFixed(2));
}

// Story 6.4: Engine v2 with 5 intelligent signals
function suggestedUnitPriceForSku(sku, sre, fallbackPrice) {
  const base = baseCostForSku(sku);
  const floor = minPriceForSku(sku, sre);
  const history = historyRangeForSku(sku, sre);
  const historical = history && history.count ? Number(history.median || history.min || 0) : 0;
  const reference = historical || Number(fallbackPrice || 0) || floor;
  let price = Math.max(floor, reference);

  // Absolute floor and ceiling guards
  const absFloor = base > 0 ? base * 1.05 : 0;
  const absCeiling = base > 0 ? base * 2.5 : Infinity;

  // Collect signals for breakdown
  const signals = [];
  let { marginPct: baseMargin } = pricingDefaults();
  let adjustedMargin = baseMargin;

  // Signal 1: Taxa de Conversão
  const skuSummary = Array.isArray(priceHistorySummary.skuSummary) ? priceHistorySummary.skuSummary.find(s => s.sku === sku) : null;
  const taxa = skuSummary?.taxaConversao;
  if (taxa !== null && taxa !== undefined && skuSummary && (skuSummary.totalGanhos + (skuSummary.totalPerdidos || 0)) >= 3) {
    if (taxa < 0.50) { adjustedMargin -= 5; signals.push({ name: "conversao", adj: "-5pp", detail: "taxa " + (taxa * 100).toFixed(0) + "%" }); }
    else if (taxa > 0.80) { adjustedMargin += 5; signals.push({ name: "conversao", adj: "+5pp", detail: "taxa " + (taxa * 100).toFixed(0) + "%" }); }
  }

  // Signal 2: Concorrência (from bancoPrecos if available)
  if (typeof bancoPrecos !== "undefined" && bancoPrecos.itens) {
    const bp = bancoPrecos.itens.find(b => b.sku === sku);
    if (bp && Array.isArray(bp.concorrentes) && bp.concorrentes.length > 0) {
      const recent = bp.concorrentes.filter(c => {
        if (!c.data) return true;
        const d = new Date(c.data); const now = new Date();
        return (now - d) < 90 * 24 * 3600 * 1000;
      });
      if (recent.length > 0) {
        const menorConc = Math.min(...recent.map(c => Number(c.preco || Infinity)));
        if (menorConc > 0 && price > menorConc * 1.15) {
          price = Math.max(absFloor, menorConc * 1.10);
          signals.push({ name: "concorrencia", adj: "ajustado", detail: "menor R$ " + menorConc.toFixed(2) });
        }
      }
    }
  }

  // Signal 3: Referência escola-específica
  if (typeof bancoPrecos !== "undefined" && bancoPrecos.itens) {
    const bp = bancoPrecos.itens.find(b => b.sku === sku);
    if (bp && Array.isArray(bp.historicoResultados)) {
      const ganhos = bp.historicoResultados.filter(h => h.resultado === "ganho" && h.precoPraticado > 0);
      const recent = ganhos.filter(h => {
        if (!h.data) return false;
        const d = new Date(h.data); const now = new Date();
        return (now - d) < 180 * 24 * 3600 * 1000;
      });
      if (recent.length > 0) {
        const ultimoGanho = recent[recent.length - 1];
        const ref = ultimoGanho.precoPraticado;
        const adjusted = Math.max(absFloor, Math.min(ref * 1.05, price));
        if (adjusted !== price) {
          price = adjusted;
          signals.push({ name: "ref_escola", adj: "R$ " + ref.toFixed(2), detail: (ultimoGanho.escola || "").slice(0, 25) });
        }
      }
    }
  }

  // Signal 4: Recorrência
  if (skuSummary && skuSummary.count) {
    const recorrencia = skuSummary.count;
    if (recorrencia >= 10) { adjustedMargin -= 3; signals.push({ name: "recorrencia", adj: "-3pp", detail: recorrencia + "x" }); }
    else if (recorrencia < 3) { adjustedMargin += 2; signals.push({ name: "recorrencia", adj: "+2pp", detail: recorrencia + "x" }); }
  }

  // Apply margin adjustments if signals changed it
  if (adjustedMargin !== baseMargin && base > 0) {
    const { freightPct, opexPct, taxPct } = pricingDefaults();
    const adjustedCost = base * regionFactor(sre) * (1 + freightPct / 100);
    const divisor = 1 - opexPct / 100 - taxPct / 100 - adjustedMargin / 100;
    if (divisor > 0) price = Math.max(price, adjustedCost / divisor);
  }

  // Enforce guards
  if (absFloor > 0) price = Math.max(absFloor, price);
  if (absCeiling < Infinity) price = Math.min(absCeiling, price);

  // Store breakdown for UI (Story 6.4 AC-5)
  if (!window._pricingBreakdown) window._pricingBreakdown = {};
  window._pricingBreakdown[sku + ":" + sre] = {
    custoBase: base, margemBase: baseMargin, margemAjustada: adjustedMargin,
    floor, signals, finalPrice: Number(price.toFixed(2))
  };

  if (signals.length > 0) console.log("[Story 6.4] Pricing signals for", sku, ":", signals.map(s => s.name + " " + s.adj).join(", "));

  return Number(price.toFixed(2));
}

// Story 6.4 AC-5: Breakdown tooltip for pricing signals
function pricingTooltip(sku, sre) {
  if (!window._pricingBreakdown) return "";
  const bd = window._pricingBreakdown[sku + ":" + sre];
  if (!bd || !bd.signals || bd.signals.length === 0) return "";
  const lines = bd.signals.map(s => s.name + ": " + s.adj + " (" + s.detail + ")");
  lines.unshift("Custo: R$ " + (bd.custoBase || 0).toFixed(2) + " | Margem: " + bd.margemBase + "% → " + bd.margemAjustada + "%");
  return ' <span title="' + lines.join("&#10;") + '" style="cursor:help;opacity:0.6">ℹ️</span>';
}

function applySuggestedPrequote(orderId) {
  const draft = prequoteState[orderId];
  if (!draft || !Array.isArray(draft.items)) return;

  const order = internalOrders.find((o) => o.id === orderId);
  const sre = String(order?.sre || "");
  for (const item of draft.items) {
    const current = Number(item.proposedUnitPrice || item.baseUnitPrice || 0);
    const suggested = suggestedUnitPriceForSku(String(item.sku || ""), sre, current);
    if (suggested > 0) item.proposedUnitPrice = suggested;
  }

  draft.status = draft.status === "approved" ? "approved" : "draft";
  draft.updatedAt = new Date().toISOString();
  savePrequoteState();
}

function applySimulatorPreset() {
  if (!el.simSku || !el.simCost) return;
  const base = baseCostForSku(el.simSku.value);
  if (base > 0) el.simCost.value = String(base.toFixed(2));
}

function filteredRows() {
  const sre = el.sre.value;
  const city = el.city.value;
  const status = el.status.value;
  const query = el.query.value.trim().toLowerCase();
  const result = [];

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    if (sre !== "all" && q.sre !== sre) continue;
    if (city !== "all" && q.municipio !== city) continue;
    if (status !== "all" && q.status !== status) continue;
    if (query && !q.objeto.toLowerCase().includes(query)) continue;
    if (quickMode === "high" && priority(q).label !== "Alta") continue;
    if (quickMode === "urgent" && (q.status === "encerrado" || daysTo(q.prazo) > 2)) continue;
    if (quickMode === "low_confidence") {
      const obj = String(q.confiancaObjeto || "").toLowerCase();
      const terr = String(q.confiancaTerritorio || "").toLowerCase();
      if (obj !== "baixa" && terr !== "baixa") continue;
    }
    result.push(q);
  }

  return result.sort((a, b) => opportunityScore(b) - opportunityScore(a) || daysTo(a.prazo) - daysTo(b.prazo));
}

function renderKPIs(rows) {
  const { open, urgent, totalRevenue, marginSum } = _precomputed;
  const avgMargin = open.length ? marginSum / open.length : 0;

  el.kpiOpen.textContent = String(open.length);
  el.kpiUrgent.textContent = String(urgent.length);
  el.kpiMargin.textContent = `${avgMargin.toFixed(1)}%`;
  el.kpiRevenue.textContent = brl.format(totalRevenue);
  let synced = 0;
  for (let i = 0; i < rows.length; i++) {
    if (resolvePipelineStatus(syncStatus[rows[i].id]) === "aceito") synced++;
  }
  el.kpiOlistSync.textContent = String(synced);
}

function resolvePipelineStatus(row) {
  const pipeline = String(row?.pipelineStatus || "").toLowerCase();
  if (pipeline === "fila" || pipeline === "enviado" || pipeline === "aceito" || pipeline === "erro") {
    return pipeline;
  }

  const legacy = String(row?.status || "").toLowerCase();
  if (legacy === "synchronized" || legacy === "synced") return "aceito";
  if (legacy === "pending_retry" || legacy === "failed") return "erro";
  if (legacy === "pending") return "fila";
  return "fila";
}

function syncBadge(id) {
  const status = resolvePipelineStatus(syncStatus[id]);
  if (status === "aceito") return '<span class="sync-badge sync-ok">Aceito</span>';
  if (status === "enviado") return '<span class="sync-badge sync-sent">Enviado</span>';
  if (status === "erro") return '<span class="sync-badge sync-failed">Erro</span>';
  return '<span class="sync-badge sync-queue">Fila</span>';
}

function alertBadge(days) {
  if (days <= 0) return '<span class="alert-badge alert-today">Vence hoje</span>';
  if (days <= 2) return `<span class="alert-badge alert-soon">Vence em ${days}d</span>`;
  return `<span class="alert-badge alert-ok">Prazo ${days}d</span>`;
}

function renderAlerts(rows) {
  if (!el.criticalAlerts) return;

  const candidates = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.status === "encerrado") continue;
    const days = daysTo(r.prazo);
    if (days <= 5) candidates.push({ ...r, days });
  }
  const critical = candidates.sort((a, b) => a.days - b.days).slice(0, 6);

  if (!critical.length) {
    el.criticalAlerts.innerHTML = '<small>Nenhum prazo critico no filtro atual.</small>';
    return;
  }

  el.criticalAlerts.innerHTML = critical
    .map(
      (r) => `
      <div class="alert-row">
        <div class="alert-main">
          <strong>${r.id} - ${r.escola}</strong>
          <small>${r.sre} | ${new Date(r.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</small>
        </div>
        ${alertBadge(r.days)}
      </div>`
    )
    .join("");
}

function renderPrequoteOrders() {
  if (!el.prequoteOrders || !el.prequoteSummary) return;

  const orders = filteredInternalOrders();
  const approved = orders.filter((o) => prequoteState[o.id]?.status === "approved").length;
  el.prequoteSummary.textContent = `Pedidos no filtro: ${orders.length}. Pre-cotacoes aprovadas: ${approved}.`;

  if (!orders.length) {
    el.prequoteOrders.innerHTML = "<small>Nenhum pedido com itens para o filtro atual.</small>";
    return;
  }

  el.prequoteOrders.innerHTML = orders
    .map((order) => {
      ensurePrequoteOrder(order);
      const draft = prequoteState[order.id];
      const items = Array.isArray(draft?.items) ? draft.items : [];
      const total = prequoteTotals(order.id).total;
      const confirmedAt = order.confirmedAt
        ? new Date(order.confirmedAt).toLocaleString("pt-BR")
        : "Sem data";

      const rows = items
        .map((item, index) => {
          const subtotal = Number(item.qty || 0) * Number(item.proposedUnitPrice || 0);
          return `
            <tr>
              <td>${escapeHtml(item.sku || "-")}</td>
              <td>${escapeHtml(item.description || "-")}</td>
              <td>${Number(item.qty || 0)}</td>
              <td>${brl.format(Number(item.baseUnitPrice || 0))}</td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  class="prequote-input"
                  data-order-id="${escapeHtml(order.id)}"
                  data-item-index="${index}"
                  value="${Number(item.proposedUnitPrice || 0).toFixed(2)}"
                />
              </td>
              <td>${brl.format(subtotal)}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <article class="prequote-order">
          <div class="prequote-head">
            <div>
              <strong>${escapeHtml(order.id)} - ${escapeHtml(order.school)}</strong><br />
              <small>${escapeHtml(order.city)} | ${escapeHtml(order.sre)} | Confirmado em ${confirmedAt}</small>
            </div>
            ${prequoteStatusBadge(draft?.status)}
          </div>
          <table class="prequote-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Qtd</th>
                <th>Unit. base</th>
                <th>Unit. pre-cotacao</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="prequote-actions">
            <button type="button" data-action="auto-suggest-prequote" data-order-id="${escapeHtml(order.id)}">Sugerir precos</button>
            <button type="button" data-action="save-prequote" data-order-id="${escapeHtml(order.id)}">Salvar rascunho</button>
            <button type="button" class="btn-primary" data-action="approve-prequote" data-order-id="${escapeHtml(order.id)}">Aprovar pre-cotacao</button>
            <span class="prequote-total">Total proposto: <strong data-total-order="${escapeHtml(order.id)}">${brl.format(total)}</strong></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function objetoIcon(objeto) {
  const obj = normalizedText(objeto);
  if (obj.includes("alimenta") || obj.includes("merenda") || obj.includes("generos")) return "\u{1F35A}";
  if (obj.includes("pereciveis") || obj.includes("hortifrutigranjeiros")) return "\u{1F34E}";
  if (obj.includes("limpeza") || obj.includes("higiene") || obj.includes("saneante")) return "\u{1F9F9}";
  if (obj.includes("escritorio") || obj.includes("consumo") || obj.includes("material")) return "\u{1F4DD}";
  if (obj.includes("manutencao") || obj.includes("reforma")) return "\u{1F527}";
  if (obj.includes("transporte")) return "\u{1F69A}";
  if (obj.includes("pedagogic") || obj.includes("educacion")) return "\u{1F4DA}";
  if (obj.includes("capacitacao") || obj.includes("formacao")) return "\u{1F393}";
  if (obj.includes("utensilios") || obj.includes("cozinha")) return "\u{1F373}";
  if (obj.includes("servico") || obj.includes("terceiriz")) return "\u{2699}\uFE0F";
  if (obj.includes("nao identificado") || obj.startsWith("grupo #")) return "\u{2753}";
  return "\u{1F4E6}";
}

function groupByObjeto(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.objeto || "Objeto nao informado";
    if (!map[key]) {
      map[key] = { objeto: key, rows: [], totalRevenue: 0, urgentCount: 0, avgMargin: 0 };
    }
    map[key].rows.push(row);
    if (row.status !== "encerrado") {
      map[key].totalRevenue += Number(row.precoSugerido || 0);
      if (daysTo(row.prazo) <= 2) map[key].urgentCount++;
    }
  }

  const groups = Object.values(map);
  for (const g of groups) {
    const open = g.rows.filter((r) => r.status !== "encerrado");
    g.avgMargin = open.length
      ? open.reduce((acc, r) => acc + marginPct(r), 0) / open.length
      : 0;
  }

  groups.sort((a, b) => {
    if (b.urgentCount !== a.urgentCount) return b.urgentCount - a.urgentCount;
    return b.rows.length - a.rows.length;
  });

  return groups;
}

function renderObjetoOverview(groups) {
  if (!el.objetoOverview) return;
  el.objetoOverview.innerHTML = groups
    .map((g) => {
      const icon = objetoIcon(g.objeto);
      const urgentTag = g.urgentCount
        ? `<span class="overview-urgent">${g.urgentCount} urg</span>`
        : "";
      return `<button type="button" class="overview-chip" data-objeto="${escapeHtml(g.objeto)}">
        <span class="overview-icon">${icon}</span>
        <span class="overview-label">${escapeHtml(g.objeto)}</span>
        <span class="overview-count">${g.rows.length}</span>
        ${urgentTag}
      </button>`;
    })
    .join("");
}

function renderObjetoGroups(rows) {
  if (!el.objetoGroups) return;

  const groups = groupByObjeto(rows);
  renderObjetoOverview(groups);

  if (!groups.length) {
    el.objetoGroups.innerHTML = "<small>Nenhuma cotacao no filtro atual.</small>";
    return;
  }

  // AC-7: Pagination — count total rows across groups, paginate
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  if (_paginationPage > totalPages) _paginationPage = totalPages;
  const startRow = (_paginationPage - 1) * PAGE_SIZE;
  let rowCounter = 0;

  // Build paginated groups — skip groups whose rows fall outside the page window
  const paginatedGroups = [];
  for (const g of groups) {
    const groupStart = rowCounter;
    const groupEnd = rowCounter + g.rows.length;
    if (groupEnd > startRow && groupStart < startRow + PAGE_SIZE) {
      const sliceStart = Math.max(0, startRow - groupStart);
      const sliceEnd = Math.min(g.rows.length, startRow + PAGE_SIZE - groupStart);
      paginatedGroups.push({ ...g, rows: g.rows.slice(sliceStart, sliceEnd) });
    }
    rowCounter += g.rows.length;
  }

  const paginationHtml = totalPages > 1 ? `<div class="pagination-controls" style="display:flex;gap:8px;align-items:center;justify-content:center;padding:12px 0;">
    <button type="button" class="btn-page" data-page="prev" ${_paginationPage <= 1 ? 'disabled' : ''}>&#9664; Anterior</button>
    <span style="color:var(--muted);font-size:0.85rem;">Mostrando ${startRow + 1}\u2013${Math.min(startRow + PAGE_SIZE, totalRows)} de ${totalRows} resultados (Pag. ${_paginationPage}/${totalPages})</span>
    <button type="button" class="btn-page" data-page="next" ${_paginationPage >= totalPages ? 'disabled' : ''}>Proximo &#9654;</button>
  </div>` : '';

  el.objetoGroups.innerHTML = paginatedGroups
    .map((g) => {
      const icon = objetoIcon(g.objeto);
      const expanded = expandedGroups.has(g.objeto);
      const openCount = g.rows.filter((r) => r.status !== "encerrado").length;
      const urgentBadge = g.urgentCount
        ? `<span class="grupo-badge grupo-badge-urgent">${g.urgentCount} urgente${g.urgentCount > 1 ? "s" : ""}</span>`
        : "";
      const marginBadge = g.avgMargin > 0
        ? `<span class="grupo-badge grupo-badge-margin">Margem ${g.avgMargin.toFixed(1)}%</span>`
        : "";

      const tableRows = expanded ? g.rows
        .map((r) => {
          const p = priority(r);
          const quotePricing = quoteMinPricing(r);
          const historyRange = historyRangeForSku(quotePricing.sku, r.sre);
          const bid = suggestedBid(r, quotePricing.minPrice, historyRange);
          return `<tr>
            <td class="priority ${p.cls}">${p.label}</td>
            <td><strong>${opportunityScore(r)}</strong></td>
            <td>${escapeHtml(r.id)}</td>
            <td>${escapeHtml(r.escola)}<br><small>${escapeHtml(r.municipio)}</small></td>
            <td>${escapeHtml(r.sre)}</td>
            <td>${new Date(r.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</td>
            <td>${quotePricing.sku || "-"}</td>
            <td>${bid ? brl.format(bid) + pricingTooltip(quotePricing.sku, r.sre) : "-"}</td>
            <td>${r.precoSugerido ? brl.format(r.precoSugerido) : "-"}</td>
            <td>${syncBadge(r.id)}</td>
          </tr>`;
        })
        .join("") : "";

      return `<article class="objeto-group-card ${expanded ? "expanded" : "collapsed"}">
        <div class="objeto-group-header" data-objeto="${escapeHtml(g.objeto)}">
          <span class="objeto-icon">${icon}</span>
          <span class="objeto-name">${escapeHtml(g.objeto)}</span>
          <span class="grupo-badge">${g.rows.length} cotacao${g.rows.length > 1 ? "es" : ""}</span>
          <span class="grupo-badge">${openCount} aberta${openCount > 1 ? "s" : ""}</span>
          ${urgentBadge}
          ${marginBadge}
          <a href="${SGD_ORCAMENTOS_URL}" target="_blank" rel="noopener" class="sgd-link-badge" title="Validar dados no SGD">Validar no SGD</a>
          <span class="objeto-toggle">${expanded ? "\u25BC" : "\u25B6"}</span>
        </div>
        <div class="objeto-group-body" style="display:${expanded ? "block" : "none"}">
          <div class="objeto-table-wrap">
            <table class="objeto-table">
              <thead>
                <tr>
                  <th>Prior.</th>
                  <th>Score</th>
                  <th>ID</th>
                  <th>Escola</th>
                  <th>SRE</th>
                  <th>Prazo</th>
                  <th>SKU</th>
                  <th>Lance rec.</th>
                  <th>Preco sug.</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </article>`;
    })
    .join("") + paginationHtml;

  // Bind pagination buttons
  el.objetoGroups.querySelectorAll(".btn-page").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.page === "prev" && _paginationPage > 1) _paginationPage--;
      else if (btn.dataset.page === "next" && _paginationPage < totalPages) _paginationPage++;
      renderObjetoGroups(rows);
    });
  });
}

function renderTable(rows) {
  el.table.innerHTML = rows
    .map((r) => {
      const p = priority(r);
      const margin = marginPct(r);
      const quotePricing = quoteMinPricing(r);
      const historyRange = historyRangeForSku(quotePricing.sku, r.sre);
      const bid = suggestedBid(r, quotePricing.minPrice, historyRange);
      return `
      <tr>
        <td class="priority ${p.cls}">${p.label}</td>
        <td><strong>${opportunityScore(r)}</strong></td>
        <td>${r.id}</td>
        <td>${r.escola}<br><small>${r.municipio}</small></td>
        <td>${r.sre}</td>
        <td>${r.objeto}</td>
        <td>${quotePricing.sku || "-"}</td>
        <td>${new Date(r.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</td>
        <td>${historyRangeLabel(historyRange)}</td>
        <td>${quotePricing.minPrice ? brl.format(quotePricing.minPrice) : "-"}</td>
        <td>${bid ? brl.format(bid) + pricingTooltip(quotePricing.sku, r.sre) : "-"}</td>
        <td>${r.precoSugerido ? brl.format(r.precoSugerido) : "-"}</td>
        <td>${r.precoSugerido ? `${margin.toFixed(1)}%` : "-"}</td>
        <td>${syncBadge(r.id)}</td>
      </tr>`;
    })
    .join("");
}

function renderSim() {
  const cost = Number(el.simCost.value || 0);
  const freight = Number(el.simFreight.value || 0) / 100;
  const factor = regionFactor(el.simRegion?.value || "");
  const adjustedCost = cost * factor * (1 + freight);
  const opex = Number(el.simOpex.value || 0) / 100;
  const tax = Number(el.simTax.value || 0) / 100;
  const target = Number(el.simMargin.value || 0) / 100;

  const divisor = 1 - opex - tax - target;
  const minPrice = divisor > 0 ? adjustedCost / divisor : 0;
  const profit = minPrice - adjustedCost;

  el.simEffectiveCost.textContent = brl.format(adjustedCost);
  el.simPrice.textContent = brl.format(minPrice);
  el.simProfit.textContent = brl.format(profit);
}

function renderOpsHealth() {
  if (!el.opsHealthPill) return;
  const generated = opsDailyReport?.generatedAt
    ? new Date(opsDailyReport.generatedAt).toLocaleString("pt-BR")
    : "sem data";
  const ok = Boolean(opsDailyReport?.ok);

  el.opsHealthPill.classList.remove("ops-go", "ops-nogo");
  if (opsDailyReport?.generatedAt == null) {
    el.opsHealthPill.textContent = "Ops: Sem relatorio";
    el.opsHealthPill.classList.add("ops-nogo");
    return;
  }

  if (ok) {
    el.opsHealthPill.textContent = `Ops: GO (${generated})`;
    el.opsHealthPill.classList.add("ops-go");
  } else {
    el.opsHealthPill.textContent = `Ops: NO-GO (${generated})`;
    el.opsHealthPill.classList.add("ops-nogo");
  }
}

function renderRefreshStatus(date) {
  if (!el.refreshPill) return;
  if (!date) {
    el.refreshPill.textContent = "Atualizacao pendente";
    return;
  }
  const countdown = Number.isFinite(nextRefreshSec) && nextRefreshSec > 0
    ? ` | prox em ${nextRefreshSec}s`
    : "";
  el.refreshPill.textContent = `Atualizado em ${date.toLocaleTimeString("pt-BR")}${countdown}`;
}

async function refreshDataAndRender() {
  if (isRefreshing) return;
  isRefreshing = true;
  if (el.refreshNowBtn) {
    el.refreshNowBtn.disabled = true;
    el.refreshNowBtn.textContent = "Atualizando...";
  }
  if (el.refreshPill) {
    el.refreshPill.textContent = "Atualizando...";
  }

  try {
  await Promise.all([
    loadQuotes(), loadSyncStatus(), loadPriceHistorySummary(),
    loadOpsDailyReport(), loadOpsAlertsReport(), loadOpsTrendHistory()
  ]);
  invalidateAllCaches();
  renderAll();
  lastRefreshAt = new Date();
  nextRefreshSec = Math.floor(DASHBOARD_REFRESH_MS / 1000);
  renderRefreshStatus(lastRefreshAt);
  } finally {
    isRefreshing = false;
    if (el.refreshNowBtn) {
      el.refreshNowBtn.disabled = false;
      el.refreshNowBtn.textContent = "Atualizar agora";
    }
  }
}

function renderTrend() {
  if (!el.trendHeadline || !el.trendMetrics) return;
  const weekly = opsTrendHistory?.weekly;
  if (!weekly) {
    el.trendHeadline.textContent = "Sem historico de tendencia ainda.";
    el.trendMetrics.innerHTML = "";
    return;
  }

  const points = Number(weekly.points || 0);
  const goCount = Number(weekly.goCount || 0);
  const noGoCount = Number(weekly.noGoCount || 0);
  const coverage = Number(weekly.avgSkuCoveragePct || 0);
  const urgent = Number(weekly.avgUrgent48h || 0);
  const actionable = Number(weekly.avgActionableQuotes || 0);
  const freshnessMin = Number(opsAlertsReport?.freshness?.ageMin);
  const hasFresh = Number.isFinite(freshnessMin);
  const stale = Boolean(opsAlertsReport?.freshness?.isStale);

  el.trendHeadline.textContent =
    `Ultimos ${points} ciclos: GO ${goCount} | NO-GO ${noGoCount}`;
  const chips = [
    `<span class="trend-chip">Cobertura media: ${coverage}%</span>`,
    `<span class="trend-chip">Urgentes media: ${urgent}</span>`,
    `<span class="trend-chip">Acionaveis media: ${actionable}</span>`,
  ];
  if (hasFresh) {
    chips.push(
      `<span class="trend-chip ${stale ? "trend-chip-warn" : ""}">Frescor dados: ${freshnessMin} min</span>`
    );
  }
  el.trendMetrics.innerHTML = chips.join("");
}

function renderOpsAlerts() {
  if (!el.opsAlertsList) return;
  const alerts = Array.isArray(opsAlertsReport?.alerts) ? opsAlertsReport.alerts : [];
  if (!alerts.length) {
    el.opsAlertsList.innerHTML = "<small>Nenhum alerta operacional ativo.</small>";
    return;
  }

  el.opsAlertsList.innerHTML = alerts
    .map((alert) => {
      const sev = String(alert.severity || "").toLowerCase();
      const code = String(alert.code || "ALERTA");
      const msg = String(alert.message || "");
      return `
        <article class="ops-alert-item ${sev}">
          <strong>[${sev.toUpperCase()}] ${code}</strong>
          <span>${escapeHtml(msg)}</span>
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  _memoVersion++; _memoStore.clear();
  const rows = filteredRows();
  const open = [];
  const urgent = [];
  let totalRevenue = 0;
  let marginSum = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.status !== "encerrado") {
      open.push(r);
      totalRevenue += r.precoSugerido || 0;
      marginSum += marginPct(r);
      if (daysTo(r.prazo) <= 2) urgent.push(r);
    }
  }
  _precomputed = { open, urgent, totalRevenue, marginSum };
  renderOpsHealth();
  renderTrend();
  renderOpsAlerts();
  renderKPIs(rows);
  renderAlerts(rows);
  renderPrequoteOrders();
  renderObjetoGroups(rows);
  renderSummary(rows);
  renderSkuCoverage(rows);
  renderQuickModeState();
  _paginationPage = 1;
}
let _precomputed = { open: [], urgent: [], totalRevenue: 0, marginSum: 0 };

function renderSummary(rows) {
  if (!el.resultSummary) return;
  const { open, urgent } = _precomputed;
  el.resultSummary.textContent = `Resultado atual: ${rows.length} cotacoes (${open.length} abertas, ${urgent.length} urgentes).`;
}

function renderSkuCoverage(rows) {
  if (!el.skuCoverageSummary || !el.skuUnclassified) return;

  const total = rows.length;
  if (!total) {
    el.skuCoverageSummary.textContent = "Cobertura SKU: sem dados no filtro atual.";
    el.skuUnclassified.innerHTML = "";
    return;
  }

  const withSku = rows.filter((r) => quoteMinPricing(r).sku).length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  el.skuCoverageSummary.textContent = `Cobertura SKU: ${withSku}/${total} (${coverage}%).`;

  const counts = {};
  for (const row of rows) {
    const pricing = quoteMinPricing(row);
    if (pricing.sku) continue;
    const key = String(row.objeto || "Objeto nao informado");
    counts[key] = (counts[key] || 0) + 1;
  }

  const pending = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!pending.length) {
    el.skuUnclassified.innerHTML = '<small>Todos os objetos do filtro estao classificados em SKU.</small>';
    return;
  }

  el.skuUnclassified.innerHTML = [
    "<strong>Objetos nao classificados (top 8):</strong>",
    ...pending.map(([objeto, count]) => `<span>${objeto} (${count})</span>`),
  ].join("");
}

function unclassifiedObjects(rows) {
  const counts = {};
  for (const row of rows) {
    const pricing = quoteMinPricing(row);
    if (pricing.sku) continue;
    const key = String(row.objeto || "Objeto nao informado");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([objeto, count]) => ({ objeto, count }));
}

function skuRuleSuggestions(rows) {
  const pending = unclassifiedObjects(rows);
  return pending.map((item) => {
    const normalized = normalizedText(item.objeto)
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const terms = normalized.split(" ").filter((t) => t.length >= 4).slice(0, 4);
    return {
      name: `Sugestao - ${item.objeto.slice(0, 50)}`,
      skuPrefix: "DEFINIR-SKU-PREFIXO",
      keywords: terms.length ? terms : [normalized || "definir_keyword"],
      observacao: `Frequencia no filtro atual: ${item.count}`,
    };
  });
}

async function copySkuSuggestions() {
  if (!el.skuCopyFeedback) return;
  const rows = filteredRows();
  const suggestions = skuRuleSuggestions(rows);
  if (!suggestions.length) {
    el.skuCopyFeedback.textContent = "Sem objetos pendentes para sugerir.";
    return;
  }

  const text = JSON.stringify({ rules: suggestions }, null, 2);
  let copied = false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_e) {
      copied = false;
    }
  }

  if (!copied) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      copied = document.execCommand("copy");
    } catch (_e) {
      copied = false;
    }
    ta.remove();
  }

  el.skuCopyFeedback.textContent = copied
    ? "Sugestoes copiadas. Ajuste skuPrefix e keywords antes de colar no JSON."
    : "Nao foi possivel copiar automaticamente.";
}

function renderQuickModeState() {
  const allButtons = [el.qaAll, el.qaHigh, el.qaUrgent, el.qaLowConfidence].filter(Boolean);
  for (const btn of allButtons) btn.classList.remove("active");
  if (quickMode === "all" && el.qaAll) el.qaAll.classList.add("active");
  if (quickMode === "high" && el.qaHigh) el.qaHigh.classList.add("active");
  if (quickMode === "urgent" && el.qaUrgent) el.qaUrgent.classList.add("active");
  if (quickMode === "low_confidence" && el.qaLowConfidence) el.qaLowConfidence.classList.add("active");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsvFromRows(rows, suffix) {
  const headers = [
    "prioridade",
    "score_oportunidade",
    "id",
    "escola",
    "municipio",
    "sre",
    "objeto",
    "sku_referencia",
    "faixa_historica_sku",
    "preco_minimo_modelo",
    "lance_recomendado",
    "confianca_objeto",
    "confianca_territorio",
    "prazo",
    "status",
    "preco_sugerido",
    "margem_pct",
    "sync_olist",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    const p = priority(row);
    const quotePricing = quoteMinPricing(row);
    const historyRange = historyRangeForSku(quotePricing.sku, row.sre);
    const bid = suggestedBid(row, quotePricing.minPrice, historyRange);
    const line = [
      p.label,
      opportunityScore(row),
      row.id,
      row.escola,
      row.municipio,
      row.sre,
      row.objeto,
      quotePricing.sku || "",
      historyRangeLabel(historyRange),
      quotePricing.minPrice ? quotePricing.minPrice.toFixed(2) : "",
      bid ? bid.toFixed(2) : "",
      row.confiancaObjeto || "",
      row.confiancaTerritorio || "",
      row.prazo,
      row.status,
      row.precoSugerido ?? "",
      (row.precoSugerido ? marginPct(row).toFixed(2) : ""),
      resolvePipelineStatus(syncStatus[row.id]),
    ].map(csvEscape);
    lines.push(line.join(","));
  }

  const csvContent = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `licitia-cotacoes-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportFilteredCsv() {
  exportCsvFromRows(filteredRows(), "filtro");
}

function exportUrgentCsv() {
  const urgentRows = filteredRows().filter((r) => r.status !== "encerrado" && daysTo(r.prazo) <= 2);
  exportCsvFromRows(urgentRows, "urgentes");
}

function approvedPrequoteRows() {
  const rows = [];
  for (const order of internalOrders) {
    const draft = prequoteState[order.id];
    if (!draft || draft.status !== "approved") continue;
    const items = Array.isArray(draft.items) ? draft.items : [];
    if (!items.length) continue;

    const mappedItems = items.map((item) => {
      const qty = Number(item.qty || 0);
      const unitPrice = moneyInput(item.proposedUnitPrice || 0);
      const subtotal = Number((qty * unitPrice).toFixed(2));
      return {
        sku: String(item.sku || ""),
        description: String(item.description || ""),
        qty,
        unitPrice,
        subtotal,
      };
    });

    const total = Number(mappedItems.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));
    rows.push({
      orderId: order.id,
      school: order.school || "",
      city: order.city || "",
      sre: order.sre || "",
      contractRef: order.contractRef || "",
      confirmedAt: order.confirmedAt || "",
      approvedAt: draft.approvedAt || draft.updatedAt || "",
      total,
      items: mappedItems,
    });
  }
  return rows;
}

function exportApprovedPrequoteJson() {
  const rows = approvedPrequoteRows();
  if (!rows.length) {
    setPrequoteFeedback("Nenhuma pre-cotacao aprovada para exportar.");
    return;
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "dashboard-prequote",
    orders: rows,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `licitia-pre-cotacao-aprovadas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setPrequoteFeedback(`Exportacao JSON concluida (${rows.length} pedido(s)).`);
}

function exportApprovedPrequoteCsv() {
  const rows = approvedPrequoteRows();
  if (!rows.length) {
    setPrequoteFeedback("Nenhuma pre-cotacao aprovada para exportar.");
    return;
  }

  const headers = [
    "order_id",
    "escola",
    "municipio",
    "sre",
    "contrato_ref",
    "confirmado_em",
    "aprovado_em",
    "sku",
    "descricao",
    "qtd",
    "preco_unitario",
    "subtotal",
    "total_pedido",
  ];
  const lines = [headers.join(",")];

  for (const order of rows) {
    for (const item of order.items) {
      const line = [
        order.orderId,
        order.school,
        order.city,
        order.sre,
        order.contractRef,
        order.confirmedAt,
        order.approvedAt,
        item.sku,
        item.description,
        item.qty,
        item.unitPrice.toFixed(2),
        item.subtotal.toFixed(2),
        order.total.toFixed(2),
      ].map(csvEscape);
      lines.push(line.join(","));
    }
  }

  const csvContent = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `licitia-pre-cotacao-aprovadas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setPrequoteFeedback(`Exportacao CSV concluida (${rows.length} pedido(s)).`);
}

function updatePrequoteItem(orderId, itemIndex, value) {
  const draft = prequoteState[orderId];
  if (!draft || !Array.isArray(draft.items)) return;
  const item = draft.items[itemIndex];
  if (!item) return;
  item.proposedUnitPrice = moneyInput(value);
  draft.status = draft.status === "approved" ? "approved" : "draft";
  draft.updatedAt = new Date().toISOString();
  savePrequoteState();
}

function savePrequote(orderId) {
  const draft = prequoteState[orderId];
  if (!draft) return;
  draft.status = "draft";
  draft.updatedAt = new Date().toISOString();
  savePrequoteState();
  renderPrequoteOrders();
}

function approvePrequote(orderId) {
  const draft = prequoteState[orderId];
  if (!draft) return;
  draft.status = "approved";
  draft.updatedAt = new Date().toISOString();
  draft.approvedAt = new Date().toISOString();
  savePrequoteState();
  renderPrequoteOrders();
}

const debouncedRenderAll = debounce(renderAll, 300);
const debouncedRenderSim = debounce(renderSim, 300);

[el.sre, el.city, el.status].forEach((node) => node.addEventListener("change", renderAll));
el.query.addEventListener("keyup", debouncedRenderAll);
el.query.addEventListener("change", renderAll);

[el.simCost, el.simOpex, el.simTax, el.simMargin, el.simFreight].forEach((node) => {
  node.addEventListener("change", renderSim);
  node.addEventListener("keyup", debouncedRenderSim);
});

if (el.simSku) {
  el.simSku.addEventListener("change", () => {
    applySimulatorPreset();
    renderSim();
  });
}

if (el.simRegion) {
  el.simRegion.addEventListener("change", renderSim);
}

if (el.exportCsv) {
  el.exportCsv.addEventListener("click", exportFilteredCsv);
}

if (el.exportUrgentCsv) {
  el.exportUrgentCsv.addEventListener("click", exportUrgentCsv);
}

if (el.exportPrequoteJson) {
  el.exportPrequoteJson.addEventListener("click", exportApprovedPrequoteJson);
}

if (el.exportPrequoteCsv) {
  el.exportPrequoteCsv.addEventListener("click", exportApprovedPrequoteCsv);
}

if (el.qaAll) el.qaAll.addEventListener("click", () => { quickMode = "all"; renderAll(); });
if (el.qaHigh) el.qaHigh.addEventListener("click", () => { quickMode = "high"; renderAll(); });
if (el.qaUrgent) el.qaUrgent.addEventListener("click", () => { quickMode = "urgent"; renderAll(); });
if (el.qaLowConfidence) {
  el.qaLowConfidence.addEventListener("click", () => {
    quickMode = "low_confidence";
    renderAll();
  });
}

if (el.copySkuSuggestions) {
  el.copySkuSuggestions.addEventListener("click", copySkuSuggestions);
}

if (el.prequoteOrders) {
  el.prequoteOrders.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("prequote-input")) return;
    const orderId = target.dataset.orderId || "";
    const itemIndex = Number(target.dataset.itemIndex);
    if (!orderId || !Number.isInteger(itemIndex)) return;
    updatePrequoteItem(orderId, itemIndex, target.value);
    // AC-5: targeted update — only update subtotal cell and order total
    const row = target.closest("tr");
    if (row) {
      const cells = row.querySelectorAll("td");
      const lastCell = cells[cells.length - 1];
      const draft = prequoteState[orderId];
      const item = draft?.items?.[itemIndex];
      if (lastCell && item) {
        lastCell.textContent = brl.format(Number(item.qty || 0) * Number(item.proposedUnitPrice || 0));
      }
    }
    const totalEl = el.prequoteOrders.querySelector(`[data-total-order="${CSS.escape(orderId)}"]`);
    if (totalEl) totalEl.textContent = brl.format(prequoteTotals(orderId).total);
  });

  el.prequoteOrders.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const orderId = target.dataset.orderId || "";
    if (!action || !orderId) return;
    if (action === "auto-suggest-prequote") {
      applySuggestedPrequote(orderId);
      setPrequoteFeedback(`Sugestoes aplicadas para pedido ${orderId}.`);
      renderPrequoteOrders();
    }
    if (action === "save-prequote") {
      savePrequote(orderId);
      setPrequoteFeedback(`Rascunho salvo para pedido ${orderId}.`);
    }
    if (action === "approve-prequote") {
      approvePrequote(orderId);
      setPrequoteFeedback(`Pre-cotacao aprovada para pedido ${orderId}.`);
    }
  });
}

if (el.refreshNowBtn) {
  el.refreshNowBtn.addEventListener("click", () => {
    refreshDataAndRender();
  });
}

if (el.expandAll) {
  el.expandAll.addEventListener("click", () => {
    const groups = groupByObjeto(filteredRows());
    for (const g of groups) expandedGroups.add(g.objeto);
    renderAll();
  });
}

if (el.collapseAll) {
  el.collapseAll.addEventListener("click", () => {
    expandedGroups.clear();
    renderAll();
  });
}

if (el.objetoGroups) {
  el.objetoGroups.addEventListener("click", (event) => {
    const header = event.target.closest(".objeto-group-header");
    if (!header) return;
    if (event.target.closest(".sgd-link-badge")) return;
    const objeto = header.dataset.objeto;
    if (!objeto) return;
    if (expandedGroups.has(objeto)) {
      expandedGroups.delete(objeto);
    } else {
      expandedGroups.add(objeto);
    }
    renderAll();
  });
}

if (el.objetoOverview) {
  el.objetoOverview.addEventListener("click", (event) => {
    const chip = event.target.closest(".overview-chip");
    if (!chip) return;
    const objeto = chip.dataset.objeto;
    if (!objeto) return;
    expandedGroups.add(objeto);
    renderAll();
    const card = el.objetoGroups?.querySelector(`.objeto-group-header[data-objeto="${CSS.escape(objeto)}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadQuotes() {
  try { quotes = await cachedFetch("./data/quotes.json"); } catch (_e) { quotes = []; }
}
async function loadSyncStatus() {
  try { syncStatus = await cachedFetch("./data/sync-status.json"); } catch (_e) { syncStatus = {}; }
}
async function loadSkuCosts() {
  try { skuCosts = await cachedFetch("./data/sku-costs.json"); } catch (_e) { skuCosts = { items: [], regionFactorBySre: {}, defaults: {} }; }
}
async function loadObjectSkuRules() {
  try { objectSkuRules = await cachedFetch("./data/object-sku-rules.json"); } catch (_e) { objectSkuRules = { rules: [] }; }
}
async function loadInternalOrders() {
  try { internalOrders = await cachedFetch("./data/internal-orders.json"); } catch (_e) { internalOrders = []; }
}
async function loadPriceHistorySummary() {
  try { priceHistorySummary = await cachedFetch("./data/price-history-summary.json", CACHE_TTL_HEAVY); } catch (_e) { priceHistorySummary = { skuSummary: [], skuRegionSummary: [] }; }
}
async function loadOpsDailyReport() {
  try { opsDailyReport = await cachedFetch("./data/ops-daily-run-report.json"); } catch (_e) { opsDailyReport = { ok: false, generatedAt: null }; }
}
async function loadOpsTrendHistory() {
  try { opsTrendHistory = await cachedFetch("./data/ops-trend-history.json"); } catch (_e) { opsTrendHistory = { weekly: null }; }
}
async function loadOpsAlertsReport() {
  try { opsAlertsReport = await cachedFetch("./data/ops-alerts.json"); } catch (_e) { opsAlertsReport = { freshness: null }; }
}

async function boot() {
  loadPrequoteState();
  await Promise.all([
    loadQuotes(), loadSyncStatus(), loadSkuCosts(), loadObjectSkuRules(),
    loadPriceHistorySummary(), loadOpsDailyReport(), loadOpsAlertsReport(),
    loadOpsTrendHistory(), loadInternalOrders()
  ]);
  invalidateAllCaches(); // reset memo after fresh data
  for (const order of internalOrders) ensurePrequoteOrder(order);
  savePrequoteState();
  populateFilters();
  populateSimulatorOptions();
  applySimulatorPreset();
  renderAll();
  renderSim();
  renderRefreshStatus(new Date());

  if (refreshTimer) clearInterval(refreshTimer);
  if (refreshTicker) clearInterval(refreshTicker);

  nextRefreshSec = Math.floor(DASHBOARD_REFRESH_MS / 1000);
  refreshTicker = setInterval(() => {
    if (isRefreshing) return;
    nextRefreshSec = Math.max(0, nextRefreshSec - 1);
    renderRefreshStatus(lastRefreshAt);
  }, 1000);

  refreshTimer = setInterval(async () => {
    await refreshDataAndRender();
  }, DASHBOARD_REFRESH_MS);
}

boot();
