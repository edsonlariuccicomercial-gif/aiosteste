let quotes = [];
let syncStatus = {};
let quickMode = "all";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const today = new Date("2026-03-02T00:00:00");

const el = {
  kpiOpen: document.getElementById("kpi-open"),
  kpiUrgent: document.getElementById("kpi-urgent"),
  kpiMargin: document.getElementById("kpi-margin"),
  kpiRevenue: document.getElementById("kpi-revenue"),
  kpiOlistSync: document.getElementById("kpi-olist-sync"),
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
  criticalAlerts: document.getElementById("critical-alerts"),
  simCost: document.getElementById("sim-cost"),
  simOpex: document.getElementById("sim-opex"),
  simTax: document.getElementById("sim-tax"),
  simMargin: document.getElementById("sim-margin"),
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
  const obj = String(row.objeto || "").toLowerCase();
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

  const confianca = String(row.confiancaObjeto || "").toLowerCase();
  const objetoConfiavel = String(row.objeto || "").toLowerCase() !== "objeto nao identificado";
  const confTerritorio = String(row.confiancaTerritorio || "").toLowerCase();
  const territorioMapeado = confTerritorio ? confTerritorio !== "baixa" : (
    String(row.sre || "").toLowerCase() !== "sre nao mapeada" &&
    String(row.municipio || "").toLowerCase() !== "nao mapeado"
  );

  const scoreObjeto = confianca === "alta" ? 12 : confianca === "media" ? 7 : objetoConfiavel ? 4 : 0;
  const scoreTerritorio = confTerritorio === "alta" ? 8 : confTerritorio === "media" ? 5 : territorioMapeado ? 4 : 0;
  const confiancaDadosScore = scoreObjeto + scoreTerritorio;

  return Math.round(prazoScore + margemScore + fitScore + confiancaDadosScore);
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

function renderTable(rows) {
  el.table.innerHTML = rows
    .map((r) => {
      const p = priority(r);
      const margin = marginPct(r);
      return `
      <tr>
        <td class="priority ${p.cls}">${p.label}</td>
        <td><strong>${opportunityScore(r)}</strong></td>
        <td>${r.id}</td>
        <td>${r.escola}<br><small>${r.municipio}</small></td>
        <td>${r.sre}</td>
        <td>${r.objeto}</td>
        <td>${new Date(r.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</td>
        <td>${r.precoSugerido ? brl.format(r.precoSugerido) : "-"}</td>
        <td>${r.precoSugerido ? `${margin.toFixed(1)}%` : "-"}</td>
        <td>${syncBadge(r.id)}</td>
      </tr>`;
    })
    .join("");
}

function renderSim() {
  const cost = Number(el.simCost.value || 0);
  const opex = Number(el.simOpex.value || 0) / 100;
  const tax = Number(el.simTax.value || 0) / 100;
  const target = Number(el.simMargin.value || 0) / 100;

  const divisor = 1 - opex - tax - target;
  const minPrice = divisor > 0 ? cost / divisor : 0;
  const profit = minPrice - cost;

  el.simPrice.textContent = brl.format(minPrice);
  el.simProfit.textContent = brl.format(profit);
}

function renderAll() {
  const rows = filteredRows();
  renderKPIs(rows);
  renderAlerts(rows);
  renderTable(rows);
  renderSummary(rows);
  renderQuickModeState();
}

function renderSummary(rows) {
  if (!el.resultSummary) return;
  const open = rows.filter((r) => r.status !== "encerrado").length;
  const urgent = rows.filter((r) => r.status !== "encerrado" && daysTo(r.prazo) <= 2).length;
  el.resultSummary.textContent = `Resultado atual: ${rows.length} cotacoes (${open} abertas, ${urgent} urgentes).`;
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
    const line = [
      p.label,
      opportunityScore(row),
      row.id,
      row.escola,
      row.municipio,
      row.sre,
      row.objeto,
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

["change", "keyup"].forEach((eventName) => {
  [el.sre, el.city, el.status, el.query].forEach((node) => node.addEventListener(eventName, renderAll));
  [el.simCost, el.simOpex, el.simTax, el.simMargin].forEach((node) =>
    node.addEventListener(eventName, renderSim)
  );
});

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

async function boot() {
  await loadQuotes();
  await loadSyncStatus();
  populateFilters();
  renderAll();
  renderSim();
}

boot();
