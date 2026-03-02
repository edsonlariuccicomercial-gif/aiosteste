let quotes = [];
let syncStatus = {};
let quickMode = "all";
let skuCosts = { items: [], regionFactorBySre: {}, defaults: {} };
let objectSkuRules = { rules: [] };
let priceHistorySummary = { skuSummary: [], skuRegionSummary: [] };
let opsDailyReport = { ok: false, generatedAt: null };
let internalOrders = [];
let prequoteState = {};

const PREQUOTE_STORAGE_KEY = "licitia.prequote.v1";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const today = new Date("2026-03-02T00:00:00");

const el = {
  kpiOpen: document.getElementById("kpi-open"),
  kpiUrgent: document.getElementById("kpi-urgent"),
  kpiMargin: document.getElementById("kpi-margin"),
  kpiRevenue: document.getElementById("kpi-revenue"),
  kpiOlistSync: document.getElementById("kpi-olist-sync"),
  opsHealthPill: document.getElementById("ops-health-pill"),
  table: document.getElementById("quote-table"),
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
  prequoteOrders: document.getElementById("prequote-orders"),
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

function daysTo(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  const diff = d.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

function marginPct(row) {
  if (!row.precoSugerido) return 0;
  return ((row.precoSugerido - row.custoEstimado) / row.precoSugerido) * 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function strategicObjectFit(row) {
  const obj = normalizedText(row.objeto);
  if (obj.includes("alimentacao") || obj.includes("merenda")) return 15;
  if (obj.includes("pereciveis") || obj.includes("hortifrutigranjeiros")) return 14;
  if (obj.includes("limpeza") || obj.includes("higiene")) return 12;
  if (obj.includes("escritorio") || obj.includes("consumo")) return 10;
  if (obj.includes("nao identificado")) return 2;
  return 6;
}

function opportunityScore(row) {
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

function priority(row) {
  const score = opportunityScore(row);
  if (score >= 70) return { label: "Alta", cls: "p-high", score };
  if (score >= 40) return { label: "Media", cls: "p-medium", score };
  return { label: "Baixa", cls: "p-low", score };
}

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

function skuForQuote(row) {
  const obj = normalizedText(row.objeto);
  const rules = Array.isArray(objectSkuRules.rules) ? objectSkuRules.rules : [];

  for (const rule of rules) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const hasMatch = keywords.some((keyword) => {
      const normalizedKeyword = normalizedText(keyword);
      return normalizedKeyword && obj.includes(normalizedKeyword);
    });
    if (hasMatch) {
      const prefix = String(rule.skuPrefix || "");
      const sku = findSkuByPrefix(prefix);
      if (sku) return sku;
    }
  }

  if (obj.includes("feijao")) return findSkuByPrefix("ALIM-FEIJAO");
  if (obj.includes("alimentacao") || obj.includes("merenda") || obj.includes("arroz")) {
    return findSkuByPrefix("ALIM-ARROZ");
  }
  if (obj.includes("limpeza") || obj.includes("higiene")) return findSkuByPrefix("LIMP-AGUA-SANITARIA");
  if (obj.includes("escritorio") || obj.includes("consumo") || obj.includes("caderno")) {
    return findSkuByPrefix("ESCR-CADERNO");
  }
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

function historyRangeForSku(sku, sre) {
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

function quoteMinPricing(row) {
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

  const base = quotes
    .filter((q) => (sre === "all" ? true : q.sre === sre))
    .filter((q) => (city === "all" ? true : q.municipio === city))
    .filter((q) => (status === "all" ? true : q.status === status))
    .filter((q) => (query ? q.objeto.toLowerCase().includes(query) : true));

  const scoped = base.filter((row) => {
    if (quickMode === "high") return priority(row).label === "Alta";
    if (quickMode === "urgent") return row.status !== "encerrado" && daysTo(row.prazo) <= 2;
    if (quickMode === "low_confidence") {
      const obj = String(row.confiancaObjeto || "").toLowerCase();
      const terr = String(row.confiancaTerritorio || "").toLowerCase();
      return obj === "baixa" || terr === "baixa";
    }
    return true;
  });

  return scoped.sort((a, b) => opportunityScore(b) - opportunityScore(a) || daysTo(a.prazo) - daysTo(b.prazo));
}

function renderKPIs(rows) {
  const open = rows.filter((r) => r.status !== "encerrado");
  const urgent = open.filter((r) => daysTo(r.prazo) <= 2);
  const totalRevenue = open.reduce((acc, r) => acc + r.precoSugerido, 0);
  const avgMargin = open.length
    ? open.reduce((acc, r) => acc + marginPct(r), 0) / open.length
    : 0;

  el.kpiOpen.textContent = String(open.length);
  el.kpiUrgent.textContent = String(urgent.length);
  el.kpiMargin.textContent = `${avgMargin.toFixed(1)}%`;
  el.kpiRevenue.textContent = brl.format(totalRevenue);
  const synced = rows.filter((r) => syncStatus[r.id]?.status === "synchronized").length;
  el.kpiOlistSync.textContent = String(synced);
}

function syncBadge(id) {
  const s = syncStatus[id]?.status || "nao_enviado";
  if (s === "synchronized") return '<span class="sync-badge sync-ok">Sincronizado</span>';
  if (s === "pending_retry" || s === "pending") return '<span class="sync-badge sync-pending">Pendente</span>';
  if (s === "failed") return '<span class="sync-badge sync-failed">Falhou</span>';
  return '<span class="sync-badge sync-pending">Nao enviado</span>';
}

function alertBadge(days) {
  if (days <= 0) return '<span class="alert-badge alert-today">Vence hoje</span>';
  if (days <= 2) return `<span class="alert-badge alert-soon">Vence em ${days}d</span>`;
  return `<span class="alert-badge alert-ok">Prazo ${days}d</span>`;
}

function renderAlerts(rows) {
  if (!el.criticalAlerts) return;

  const critical = rows
    .filter((r) => r.status !== "encerrado")
    .map((r) => ({ ...r, days: daysTo(r.prazo) }))
    .filter((r) => r.days <= 5)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

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
            <button type="button" data-action="save-prequote" data-order-id="${escapeHtml(order.id)}">Salvar rascunho</button>
            <button type="button" class="btn-primary" data-action="approve-prequote" data-order-id="${escapeHtml(order.id)}">Aprovar pre-cotacao</button>
            <span class="prequote-total">Total proposto: <strong>${brl.format(total)}</strong></span>
          </div>
        </article>
      `;
    })
    .join("");
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
        <td>${bid ? brl.format(bid) : "-"}</td>
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

function renderAll() {
  const rows = filteredRows();
  renderOpsHealth();
  renderKPIs(rows);
  renderAlerts(rows);
  renderPrequoteOrders();
  renderTable(rows);
  renderSummary(rows);
  renderSkuCoverage(rows);
  renderQuickModeState();
}

function renderSummary(rows) {
  if (!el.resultSummary) return;
  const open = rows.filter((r) => r.status !== "encerrado").length;
  const urgent = rows.filter((r) => r.status !== "encerrado" && daysTo(r.prazo) <= 2).length;
  el.resultSummary.textContent = `Resultado atual: ${rows.length} cotacoes (${open} abertas, ${urgent} urgentes).`;
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
      syncStatus[row.id]?.status || "nao_enviado",
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

["change", "keyup"].forEach((eventName) => {
  [el.sre, el.city, el.status, el.query].forEach((node) => node.addEventListener(eventName, renderAll));
  [el.simCost, el.simOpex, el.simTax, el.simMargin, el.simFreight].forEach((node) =>
    node.addEventListener(eventName, renderSim)
  );
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
    renderPrequoteOrders();
  });

  el.prequoteOrders.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const orderId = target.dataset.orderId || "";
    if (!action || !orderId) return;
    if (action === "save-prequote") savePrequote(orderId);
    if (action === "approve-prequote") approvePrequote(orderId);
  });
}

async function loadQuotes() {
  try {
    const resp = await fetch("./data/quotes.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    quotes = await resp.json();
  } catch (_e) {
    quotes = [];
  }
}

async function loadSyncStatus() {
  try {
    const resp = await fetch("./data/sync-status.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    syncStatus = await resp.json();
  } catch (_e) {
    syncStatus = {};
  }
}

async function loadSkuCosts() {
  try {
    const resp = await fetch("./data/sku-costs.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    skuCosts = await resp.json();
  } catch (_e) {
    skuCosts = { items: [], regionFactorBySre: {}, defaults: {} };
  }
}

async function loadObjectSkuRules() {
  try {
    const resp = await fetch("./data/object-sku-rules.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    objectSkuRules = await resp.json();
  } catch (_e) {
    objectSkuRules = { rules: [] };
  }
}

async function loadInternalOrders() {
  try {
    const resp = await fetch("./data/internal-orders.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    internalOrders = await resp.json();
  } catch (_e) {
    internalOrders = [];
  }
}

async function loadPriceHistorySummary() {
  try {
    const resp = await fetch("./data/price-history-summary.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    priceHistorySummary = await resp.json();
  } catch (_e) {
    priceHistorySummary = { skuSummary: [], skuRegionSummary: [] };
  }
}

async function loadOpsDailyReport() {
  try {
    const resp = await fetch("./data/ops-daily-run-report.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    opsDailyReport = await resp.json();
  } catch (_e) {
    opsDailyReport = { ok: false, generatedAt: null };
  }
}

async function boot() {
  loadPrequoteState();
  await loadQuotes();
  await loadSyncStatus();
  await loadSkuCosts();
  await loadObjectSkuRules();
  await loadPriceHistorySummary();
  await loadOpsDailyReport();
  await loadInternalOrders();
  for (const order of internalOrders) ensurePrequoteOrder(order);
  savePrequoteState();
  populateFilters();
  populateSimulatorOptions();
  applySimulatorPreset();
  renderAll();
  renderSim();
}

boot();
