/* ===================================================================
   Pricing Intelligence Module — Licit-AIX Caixa Escolar
   Fase 5: Dashboard, Multi-Fornecedor, Simulador, Rentabilidade, Alertas
   =================================================================== */

// ===== 1. PRICING DASHBOARD =====

function renderPricingDashboard() {
  const itens = bancoPrecos.itens || [];
  if (itens.length === 0) {
    document.getElementById("chart-top-cotados").innerHTML = '<p class="text-muted" style="font-size:0.82rem;">Sem dados na central de preços.</p>';
    return;
  }

  // KPIs
  const comCusto = itens.filter(i => i.custoBase > 0);
  const custoMedio = comCusto.length > 0 ? comCusto.reduce((s, i) => s + i.custoBase, 0) / comCusto.length : 0;
  const margemMedia = comCusto.length > 0 ? comCusto.reduce((s, i) => s + (i.margemPadrao || 0.30), 0) / comCusto.length * 100 : 0;

  // Competitivos
  let competitivos = 0;
  let comDados = 0;
  itens.forEach(i => {
    const conc = (i.concorrentes || []);
    if (conc.length === 0) return;
    comDados++;
    const menorConc = Math.min(...conc.map(c => c.preco));
    const minhaProposta = (i.propostas || []).length > 0
      ? (i.propostas || []).reduce((s, p) => s + p.preco, 0) / i.propostas.length
      : i.precoReferencia;
    if (minhaProposta <= menorConc) competitivos++;
  });
  const pctCompetitivos = comDados > 0 ? Math.round(competitivos / comDados * 100) : 0;

  // Vencidos (>90 dias)
  const now = new Date();
  const vencidos = itens.filter(i => {
    if (!i.ultimaCotacao) return true;
    const diff = (now - new Date(i.ultimaCotacao)) / (1000 * 60 * 60 * 24);
    return diff > 90;
  }).length;

  // Faturamento aprovado
  const aprovados = Object.values(preOrcamentos).filter(p => p.status === "aprovado" || p.status === "enviado");
  const faturamento = aprovados.reduce((s, p) => s + (p.totalGeral || 0), 0);

  // FR-014: KPIs reorganizados — Enviados, Ganhos, Perdidos, Conversão, Faturamento, Margem, Itens
  const resultados = Object.values(preOrcamentos).filter(p => p.resultado);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const enviadosMes = Object.values(preOrcamentos).filter(p => (p.dataEnvio || p.criadoEm || "").slice(0, 7) === mesAtual).length;
  const ganhosMes = resultados.filter(r => r.resultado === "ganho" && (r.dataResultado || "").slice(0, 7) === mesAtual).length;
  const perdidosMes = resultados.filter(r => r.resultado === "perdido" && (r.dataResultado || "").slice(0, 7) === mesAtual).length;
  const taxaConversao = (ganhosMes + perdidosMes) > 0 ? Math.round(ganhosMes / (ganhosMes + perdidosMes) * 100) : 0;

  setTextSafe("kpi-pendentes", enviadosMes);
  setTextSafe("pk-ganhos-mes", ganhosMes);
  setTextSafe("pk-perdidos-mes", perdidosMes);
  setTextSafe("pk-competitivos", taxaConversao + "%");
  setTextSafe("pk-faturamento", brl.format(faturamento));
  setTextSafe("pk-margem-media", margemMedia.toFixed(1) + "%");
  setTextSafe("pk-total-itens", itens.length);

  // Alertas
  renderPricingAlerts(itens, vencidos);

  // Chart: Top 10 mais cotados
  const cotacoes = {};
  itens.forEach(i => {
    const count = (i.propostas || []).length + (i.concorrentes || []).length + (i.custosFornecedor || []).length;
    if (count > 0) cotacoes[i.item] = count;
  });
  const top10 = Object.entries(cotacoes).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCot = top10.length > 0 ? top10[0][1] : 1;
  document.getElementById("chart-top-cotados").innerHTML = top10.length > 0
    ? '<div class="bar-chart">' + top10.map(([name, count]) => {
      const pctWidth = Math.round(count / maxCot * 100);
      return `<div class="bar-row">
        <span class="bar-label" title="${escapeHtml(name)}">${escapeHtml(name.substring(0, 25))}</span>
        <div class="bar-track"><div class="bar-fill blue" style="width:${pctWidth}%">${count}</div></div>
      </div>`;
    }).join("") + '</div>'
    : '<p class="text-muted" style="font-size:0.82rem;">Sem cotações registradas.</p>';

  // Chart: Margem por grupo
  const grupoMargens = {};
  comCusto.forEach(i => {
    const g = i.grupo || "Sem grupo";
    if (!grupoMargens[g]) grupoMargens[g] = [];
    grupoMargens[g].push((i.margemPadrao || 0.30) * 100);
  });
  const grupoList = Object.entries(grupoMargens)
    .map(([g, ms]) => [g, ms.reduce((a, b) => a + b, 0) / ms.length])
    .sort((a, b) => b[1] - a[1]);
  const maxMargem = grupoList.length > 0 ? Math.max(...grupoList.map(g => g[1]), 50) : 50;
  document.getElementById("chart-margem-grupo").innerHTML = grupoList.length > 0
    ? '<div class="bar-chart">' + grupoList.map(([g, m]) => {
      const pctWidth = Math.round(m / maxMargem * 100);
      const color = m >= 25 ? "green" : m >= 15 ? "yellow" : "red";
      return `<div class="bar-row">
        <span class="bar-label" title="${escapeHtml(g)}">${escapeHtml(g.substring(0, 25))}</span>
        <div class="bar-track"><div class="bar-fill ${color}" style="width:${pctWidth}%">${m.toFixed(1)}%</div></div>
      </div>`;
    }).join("") + '</div>'
    : '<p class="text-muted" style="font-size:0.82rem;">Sem dados.</p>';

  // Chart: Evolução de custos (últimas cotações por fornecedor)
  renderCostEvolution(itens);

  // Chart: Competitividade por grupo
  renderCompetitividadeGrupo(itens);
}

function renderCostEvolution(itens) {
  // Aggregate all custosFornecedor entries by month
  const byMonth = {};
  itens.forEach(i => {
    (i.custosFornecedor || []).forEach(cf => {
      const month = (cf.data || "").substring(0, 7); // YYYY-MM
      if (!month) return;
      if (!byMonth[month]) byMonth[month] = { total: 0, count: 0 };
      byMonth[month].total += cf.preco;
      byMonth[month].count++;
    });
  });
  const months = Object.keys(byMonth).sort().slice(-12);
  if (months.length === 0) {
    document.getElementById("chart-evolucao-custos").innerHTML = '<p class="text-muted" style="font-size:0.82rem;">Sem histórico de fornecedores.</p>';
    return;
  }
  const maxAvg = Math.max(...months.map(m => byMonth[m].total / byMonth[m].count));
  document.getElementById("chart-evolucao-custos").innerHTML = '<div class="bar-chart">' + months.map(m => {
    const avg = byMonth[m].total / byMonth[m].count;
    const pctW = Math.round(avg / maxAvg * 100);
    return `<div class="bar-row">
      <span class="bar-label">${m}</span>
      <div class="bar-track"><div class="bar-fill blue" style="width:${pctW}%">${brl.format(avg)}</div></div>
      <span class="bar-value">${byMonth[m].count}x</span>
    </div>`;
  }).join("") + '</div>';
}

function renderCompetitividadeGrupo(itens) {
  const grupos = {};
  itens.forEach(i => {
    const g = i.grupo || "Sem grupo";
    const conc = (i.concorrentes || []);
    if (conc.length === 0) return;
    if (!grupos[g]) grupos[g] = { comp: 0, total: 0 };
    grupos[g].total++;
    const menorConc = Math.min(...conc.map(c => c.preco));
    const minha = (i.propostas || []).length > 0
      ? i.propostas.reduce((s, p) => s + p.preco, 0) / i.propostas.length
      : i.precoReferencia;
    if (minha <= menorConc) grupos[g].comp++;
  });
  const list = Object.entries(grupos)
    .map(([g, d]) => [g, Math.round(d.comp / d.total * 100), d.total])
    .sort((a, b) => b[1] - a[1]);
  if (list.length === 0) {
    document.getElementById("chart-competitividade").innerHTML = '<p class="text-muted" style="font-size:0.82rem;">Sem dados de concorrentes.</p>';
    return;
  }
  document.getElementById("chart-competitividade").innerHTML = '<div class="bar-chart">' + list.map(([g, pctComp, total]) => {
    const color = pctComp >= 70 ? "green" : pctComp >= 40 ? "yellow" : "red";
    return `<div class="bar-row">
      <span class="bar-label" title="${escapeHtml(g)}">${escapeHtml(g.substring(0, 25))}</span>
      <div class="bar-track"><div class="bar-fill ${color}" style="width:${pctComp}%">${pctComp}%</div></div>
      <span class="bar-value">${total} itens</span>
    </div>`;
  }).join("") + '</div>';
}

// ===== 2. ALERTAS AUTOMÁTICOS =====

function renderPricingAlerts(itens, vencidosCount) {
  const alerts = [];
  const now = new Date();

  // Cotações vencidas (>90 dias)
  if (vencidosCount > 0) {
    alerts.push({
      type: "danger",
      icon: "⚠️",
      text: `${vencidosCount} itens com cotação vencida (>90 dias) — atualize os preços`,
      count: vencidosCount
    });
  }

  // Margem abaixo de 10%
  const margemBaixa = itens.filter(i => {
    if (i.custoBase <= 0) return false;
    return (i.margemPadrao || 0) < 0.10;
  });
  if (margemBaixa.length > 0) {
    alerts.push({
      type: "warning",
      icon: "📉",
      text: `${margemBaixa.length} itens com margem abaixo de 10% — risco de prejuízo`,
      count: margemBaixa.length
    });
  }

  // Itens sem custo base
  const semCusto = itens.filter(i => i.custoBase <= 0);
  if (semCusto.length > 0) {
    alerts.push({
      type: "warning",
      icon: "💰",
      text: `${semCusto.length} itens sem custo base definido — precifique antes de cotar`,
      count: semCusto.length
    });
  }

  // Acima do concorrente
  const acimaConcorrente = itens.filter(i => {
    const conc = (i.concorrentes || []);
    if (conc.length === 0) return false;
    const menor = Math.min(...conc.map(c => c.preco));
    const minha = (i.propostas || []).length > 0
      ? i.propostas.reduce((s, p) => s + p.preco, 0) / i.propostas.length
      : i.precoReferencia;
    return minha > menor * 1.05;
  });
  if (acimaConcorrente.length > 0) {
    alerts.push({
      type: "info",
      icon: "📊",
      text: `${acimaConcorrente.length} itens acima do menor concorrente — revise a estratégia`,
      count: acimaConcorrente.length
    });
  }

  // Pré-orçamentos pendentes
  const pendentes = Object.values(preOrcamentos).filter(p => p.status === "pendente");
  if (pendentes.length > 0) {
    alerts.push({
      type: "info",
      icon: "📋",
      text: `${pendentes.length} pré-orçamentos pendentes de aprovação`,
      count: pendentes.length
    });
  }

  // Fontes B2B expiradas
  let fontesExpiradas = 0;
  itens.forEach(i => {
    (i.fontesPreco || []).forEach(f => {
      if (f.validade && f.ativo && new Date(f.validade) < now) fontesExpiradas++;
    });
  });
  if (fontesExpiradas > 0) {
    alerts.push({
      type: "danger",
      icon: "📦",
      text: `${fontesExpiradas} fonte(s) de preço B2B expirada(s) — atualize as tabelas dos fornecedores`,
      count: fontesExpiradas
    });
  }

  // Itens sem consulta PNCP
  const semPncp = itens.filter(i => !i.pncp && !i.ultimaConsultaPncp);
  if (semPncp.length > 0 && itens.length > 3) {
    alerts.push({
      type: "info",
      icon: "🏛️",
      text: `${semPncp.length} itens sem referência PNCP — consulte preços de referência no PNCP`,
      count: semPncp.length
    });
  }

  const container = document.getElementById("pricing-alerts");
  if (!container) return;
  container.innerHTML = alerts.map(a =>
    `<div class="pricing-alert alert-${a.type}">
      <span class="alert-icon">${a.icon}</span>
      <span class="alert-text">${a.text}</span>
      <span class="alert-count">${a.count}</span>
    </div>`
  ).join("");
}

// ===== 3. SIMULADOR DE MARGEM =====

window.toggleSimulator = function () {
  const sim = document.getElementById("margin-simulator");
  if (!sim) return;
  const visible = sim.style.display !== "none";
  sim.style.display = visible ? "none" : "block";
  if (!visible) updateSimulatorPreviews();
};

function updateSimulatorPreviews() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;
  const itensComCusto = pre.itens.filter(i => i.custoUnitario > 0);
  if (itensComCusto.length === 0) return;

  [0.35, 0.25, 0.15].forEach((m, idx) => {
    const labels = ["conservador", "moderado", "agressivo"];
    const total = itensComCusto.reduce((s, i) => s + Math.round(i.custoUnitario * (1 + m) * i.quantidade * 100) / 100, 0);
    setTextSafe(`sim-${labels[idx]}-total`, brl.format(total));
  });

  // Ótimo: encontrar margem onde todos ficam competitivos
  let bestMargin = 0.30;
  const margins = itensComCusto.map(i => {
    if (i.menorConcorrente > 0 && i.custoUnitario > 0) {
      return (i.menorConcorrente / i.custoUnitario) - 1;
    }
    return 0.25;
  }).filter(m => m > 0);
  if (margins.length > 0) {
    bestMargin = Math.min(...margins);
    bestMargin = Math.max(0.05, Math.min(0.50, bestMargin));
  }
  setTextSafe("sim-otimo-pct", (bestMargin * 100).toFixed(0) + "%");
  const totalOtimo = itensComCusto.reduce((s, i) => s + Math.round(i.custoUnitario * (1 + bestMargin) * i.quantidade * 100) / 100, 0);
  setTextSafe("sim-otimo-total", brl.format(totalOtimo));

  // Update slider
  previewScenario(25);
}

window.previewScenario = function (val) {
  const m = parseInt(val) / 100;
  setTextSafe("sim-slider-val", val + "%");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  const itensComCusto = pre.itens.filter(i => i.custoUnitario > 0);
  const total = itensComCusto.reduce((s, i) => s + Math.round(i.custoUnitario * (1 + m) * i.quantidade * 100) / 100, 0);
  setTextSafe("sim-preview-total", brl.format(total));

  const comp = itensComCusto.filter(i => {
    if (i.menorConcorrente <= 0) return true;
    return i.custoUnitario * (1 + m) <= i.menorConcorrente;
  }).length;
  setTextSafe("sim-preview-comp", `${comp}/${itensComCusto.length}`);
};

window.applyScenario = function (margin) {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || (pre.status !== "pendente" && pre.status !== "aprovado")) return;

  if (margin === "otimo") {
    // Calculate optimal margin per item
    pre.itens.forEach(item => {
      if (item.custoUnitario <= 0) return;
      if (item.menorConcorrente > 0) {
        item.margem = Math.max(0.05, (item.menorConcorrente / item.custoUnitario) - 1 - 0.01);
      }
      item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
      item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
    });
  } else {
    const m = typeof margin === "number" ? margin : parseFloat(margin);
    pre.itens.forEach(item => {
      if (item.custoUnitario <= 0) return;
      item.margem = m;
      item.precoUnitario = Math.round(item.custoUnitario * (1 + m) * 100) / 100;
      item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
    });
  }

  // Recalculate totals
  pre.totalGeral = Math.round(pre.itens.reduce((s, i) => s + i.precoTotal, 0) * 100) / 100;
  const margens = pre.itens.filter(i => i.custoUnitario > 0).map(i => i.margem);
  pre.margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  savePreOrcamentos();
  renderPreOrcamentoItens();
  renderKPIs();
  updateSimulatorPreviews();
};

// ===== 4. MULTI-FORNECEDOR NO MODAL =====

window.addModalFornecedor = function () {
  const nome = document.getElementById("modal-new-forn-nome").value.trim();
  const preco = parseFloat(document.getElementById("modal-new-forn-preco").value) || 0;
  if (!nome || preco <= 0) { alert("Informe nome e preço do fornecedor."); return; }

  // Find current banco item being edited
  if (!editingBancoId) { alert("Salve o item primeiro, depois adicione fornecedores."); return; }
  const item = bancoPrecos.itens.find(i => i.id === editingBancoId);
  if (!item) return;

  if (!item.custosFornecedor) item.custosFornecedor = [];
  item.custosFornecedor.push({
    fornecedor: nome,
    preco: preco,
    data: new Date().toISOString().slice(0, 10)
  });

  // Update custoBase to lowest supplier price
  const menorForn = Math.min(...item.custosFornecedor.map(f => f.preco));
  item.custoBase = menorForn;
  item.precoReferencia = Math.round(menorForn * (1 + item.margemPadrao) * 100) / 100;
  item.ultimaCotacao = new Date().toISOString().slice(0, 10);

  saveBancoLocal();
  renderModalFornecedores(item);

  // Update modal fields
  document.getElementById("modal-custo").value = menorForn;
  document.getElementById("modal-new-forn-nome").value = "";
  document.getElementById("modal-new-forn-preco").value = "";
};

window.removeModalFornecedor = function (idx) {
  if (!editingBancoId) return;
  const item = bancoPrecos.itens.find(i => i.id === editingBancoId);
  if (!item || !item.custosFornecedor) return;
  item.custosFornecedor.splice(idx, 1);
  saveBancoLocal();
  renderModalFornecedores(item);
};

function renderModalFornecedores(item) {
  const tbody = document.getElementById("tbody-modal-fornecedores");
  const container = document.getElementById("modal-multi-fornecedor");
  if (!tbody || !container) return;

  const fornecedores = item ? (item.custosFornecedor || []) : [];
  container.style.display = "block";

  if (fornecedores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;font-size:0.8rem;">Nenhum fornecedor cadastrado.</td></tr>';
    return;
  }

  // Find best price
  const menorPreco = Math.min(...fornecedores.map(f => f.preco));

  tbody.innerHTML = fornecedores.map((f, idx) => {
    const isBest = f.preco === menorPreco;
    return `<tr>
      <td>${escapeHtml(f.fornecedor)} ${isBest ? '<span class="badge badge-ok" style="font-size:0.6rem;">Menor</span>' : ''}</td>
      <td class="text-right font-mono">${brl.format(f.preco)}</td>
      <td class="text-muted">${f.data || ""}</td>
      <td><button class="btn btn-inline btn-danger" onclick="removeModalFornecedor(${idx})">X</button></td>
    </tr>`;
  }).join("");
}

// Hook into existing openBancoModal
const _origOpenBancoModal = typeof openBancoModal === "function" ? openBancoModal : null;
if (_origOpenBancoModal) {
  // Monkey-patch to also render fornecedores
  const origFn = _origOpenBancoModal;
  window._openBancoModalOrig = origFn;
}

// Override openBancoModal to show fornecedores
(function () {
  const origOpen = window._openBancoModalOrig || openBancoModal;
  if (!origOpen) return;
  // We'll hook via MutationObserver on modal visibility instead
  // to avoid circular reference issues
})();

// Simpler approach: hook into editarBancoItem
const _origEditarBancoItem = window.editarBancoItem;
window.editarBancoItem = function (id) {
  _origEditarBancoItem(id);
  // After modal opens, render fornecedores
  const item = bancoPrecos.itens.find(i => i.id === id);
  if (item) renderModalFornecedores(item);
};

// Also hook add new
const _origBtnAddPreco = document.getElementById("btn-add-preco");
if (_origBtnAddPreco) {
  // The original click opens modal with null item — we need to hide fornecedores
  _origBtnAddPreco.addEventListener("click", () => {
    setTimeout(() => {
      const container = document.getElementById("modal-multi-fornecedor");
      if (container && !editingBancoId) container.style.display = "none";
    }, 50);
  });
}

// ===== 5. RENTABILIDADE =====

window.switchRentTab = function (tab) {
  document.querySelectorAll(".rent-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`.rent-tab[onclick*="${tab}"]`).classList.add("active");
  ["escola", "produto", "grupo"].forEach(t => {
    const el = document.getElementById(`rent-${t}`);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
};

function renderRentabilidade() {
  const aprovados = Object.values(preOrcamentos).filter(p => p.status === "aprovado" || p.status === "enviado");

  if (aprovados.length === 0) {
    setTextSafe("rk-faturamento", "R$ 0");
    setTextSafe("rk-custo", "R$ 0");
    setTextSafe("rk-lucro", "R$ 0");
    setTextSafe("rk-margem", "0%");
    setTextSafe("rk-escolas", "0");
    setTextSafe("rk-propostas", "0");
    return;
  }

  let totalFaturamento = 0;
  let totalCusto = 0;
  const escolas = new Set();
  const porEscola = {};
  const porProduto = {};
  const porGrupo = {};

  aprovados.forEach(pre => {
    escolas.add(pre.escola);
    if (!porEscola[pre.escola]) porEscola[pre.escola] = { municipio: pre.municipio, propostas: 0, faturamento: 0, custo: 0 };
    porEscola[pre.escola].propostas++;

    (pre.itens || []).forEach(item => {
      const fat = item.precoTotal || 0;
      const custo = (item.custoUnitario || 0) * (item.quantidade || 0);
      totalFaturamento += fat;
      totalCusto += custo;
      porEscola[pre.escola].faturamento += fat;
      porEscola[pre.escola].custo += custo;

      // Por produto
      const key = item.nome;
      if (!porProduto[key]) porProduto[key] = { grupo: pre.grupo, vezes: 0, precoTotal: 0, custoTotal: 0, volumeTotal: 0 };
      porProduto[key].vezes++;
      porProduto[key].precoTotal += item.precoUnitario || 0;
      porProduto[key].custoTotal += item.custoUnitario || 0;
      porProduto[key].volumeTotal += item.quantidade || 0;

      // Por grupo
      const g = pre.grupo || "Sem grupo";
      if (!porGrupo[g]) porGrupo[g] = { itens: new Set(), faturamento: 0, custo: 0 };
      porGrupo[g].itens.add(key);
      porGrupo[g].faturamento += fat;
      porGrupo[g].custo += custo;
    });
  });

  const lucro = totalFaturamento - totalCusto;
  const margem = totalFaturamento > 0 ? (lucro / totalFaturamento * 100) : 0;

  setTextSafe("rk-faturamento", brl.format(totalFaturamento));
  setTextSafe("rk-custo", brl.format(totalCusto));
  setTextSafe("rk-lucro", brl.format(lucro));
  setTextSafe("rk-margem", margem.toFixed(1) + "%");
  setTextSafe("rk-escolas", escolas.size);
  setTextSafe("rk-propostas", aprovados.length);

  // Tabela por escola
  const tbodyEscola = document.getElementById("tbody-rent-escola");
  if (tbodyEscola) {
    tbodyEscola.innerHTML = Object.entries(porEscola)
      .sort((a, b) => b[1].faturamento - a[1].faturamento)
      .map(([escola, d]) => {
        const lucroE = d.faturamento - d.custo;
        const margemE = d.faturamento > 0 ? (lucroE / d.faturamento * 100).toFixed(1) : "0.0";
        const mClass = parseFloat(margemE) >= 20 ? "text-accent" : parseFloat(margemE) >= 10 ? "" : "text-danger";
        return `<tr>
          <td><strong>${escapeHtml(escola)}</strong></td>
          <td>${escapeHtml(d.municipio || "")}</td>
          <td class="text-center">${d.propostas}</td>
          <td class="text-right font-mono">${brl.format(d.faturamento)}</td>
          <td class="text-right font-mono">${brl.format(d.custo)}</td>
          <td class="text-right font-mono text-accent">${brl.format(lucroE)}</td>
          <td class="text-right ${mClass}">${margemE}%</td>
        </tr>`;
      }).join("");
  }

  // Tabela por produto
  const tbodyProduto = document.getElementById("tbody-rent-produto");
  if (tbodyProduto) {
    tbodyProduto.innerHTML = Object.entries(porProduto)
      .sort((a, b) => b[1].vezes - a[1].vezes)
      .map(([nome, d]) => {
        const precoMedio = d.vezes > 0 ? d.precoTotal / d.vezes : 0;
        const custoMedio = d.vezes > 0 ? d.custoTotal / d.vezes : 0;
        const margemM = custoMedio > 0 ? ((precoMedio - custoMedio) / custoMedio * 100).toFixed(1) : "0.0";
        const mClass = parseFloat(margemM) >= 20 ? "text-accent" : parseFloat(margemM) >= 10 ? "" : "text-danger";
        return `<tr>
          <td><strong>${escapeHtml(nome)}</strong></td>
          <td>${escapeHtml(d.grupo || "")}</td>
          <td class="text-center">${d.vezes}</td>
          <td class="text-right font-mono">${brl.format(precoMedio)}</td>
          <td class="text-right font-mono">${brl.format(custoMedio)}</td>
          <td class="text-right ${mClass}">${margemM}%</td>
          <td class="text-right">${d.volumeTotal}</td>
        </tr>`;
      }).join("");
  }

  // Tabela por grupo
  const tbodyGrupo = document.getElementById("tbody-rent-grupo");
  if (tbodyGrupo) {
    tbodyGrupo.innerHTML = Object.entries(porGrupo)
      .sort((a, b) => b[1].faturamento - a[1].faturamento)
      .map(([grupo, d]) => {
        const lucroG = d.faturamento - d.custo;
        const margemG = d.faturamento > 0 ? (lucroG / d.faturamento * 100).toFixed(1) : "0.0";
        const mClass = parseFloat(margemG) >= 20 ? "text-accent" : parseFloat(margemG) >= 10 ? "" : "text-danger";
        return `<tr>
          <td><strong>${escapeHtml(grupo)}</strong></td>
          <td class="text-center">${d.itens.size}</td>
          <td class="text-right font-mono">${brl.format(d.faturamento)}</td>
          <td class="text-right font-mono">${brl.format(d.custo)}</td>
          <td class="text-right font-mono text-accent">${brl.format(lucroG)}</td>
          <td class="text-right ${mClass}">${margemG}%</td>
        </tr>`;
      }).join("");
  }
}

// ===== 6. BANCO TABLE — DEFASADO BADGE + PNCP + FONTES B2B =====

// Monkey-patch renderBanco to add defasado badges, PNCP indicators, and Fontes button
const _origRenderBanco = typeof renderBanco === "function" ? renderBanco : null;
if (_origRenderBanco) {
  const origRender = renderBanco;
  window.renderBanco = function () {
    origRender();
    const now = new Date();
    (bancoPrecos.itens || []).forEach(item => {
      // Find the row by item name
      const rows = document.querySelectorAll("#tbody-banco tr");
      rows.forEach(row => {
        const firstCell = row.querySelector("td:first-child strong");
        if (!firstCell || firstCell.textContent !== item.item) return;

        // Defasado badge
        if (item.ultimaCotacao) {
          const diff = (now - new Date(item.ultimaCotacao)) / (1000 * 60 * 60 * 24);
          if (diff > 90 && !row.querySelector(".badge-defasado")) {
            firstCell.insertAdjacentHTML("afterend", ' <span class="badge-defasado">Defasado</span>');
          }
        }

        // PNCP indicator in Ref. PNCP column (7th column, index 6)
        const pncpCell = row.querySelectorAll("td")[6];
        if (pncpCell && item.pncp && item.pncp.mediana > 0) {
          const mediana = item.pncp.mediana;
          const meuPreco = item.precoReferencia || (item.custoBase * (1 + (item.margemPadrao || 0.30)));
          const delta = ((meuPreco - mediana) / mediana * 100).toFixed(1);
          let cor = "text-accent", icone = "▼";
          if (meuPreco > mediana * 1.10) { cor = "text-danger"; icone = "▲"; }
          else if (meuPreco > mediana) { cor = ""; icone = "■"; }
          pncpCell.innerHTML = `<span class="${cor}" title="Mediana: ${brl.format(mediana)} | ${item.pncp.amostras} amostras">${icone} ${brl.format(mediana)}</span>`;
        }

        // Add Fontes B2B button in actions column (last column)
        const actionsCell = row.querySelector("td:last-child");
        if (actionsCell && !actionsCell.querySelector(".btn-fontes")) {
          const fontesCount = (item.fontesPreco || []).length;
          actionsCell.insertAdjacentHTML("beforeend",
            ` <button class="btn btn-inline btn-fontes" onclick="abrirGerenciadorFontes('${item.id}')" title="Fontes B2B">B2B${fontesCount ? " (" + fontesCount + ")" : ""}</button>`
          );
        }
      });
    });
  };
}

// ===== 7. EXPORT RENTABILIDADE CSV =====

const btnExportRent = document.getElementById("btn-export-rentabilidade");
if (btnExportRent) {
  btnExportRent.addEventListener("click", () => {
    const aprovados = Object.values(preOrcamentos).filter(p => p.status === "aprovado" || p.status === "enviado");
    const header = "Escola;Municipio;Item;Quantidade;CustoUnit;PrecoUnit;Total;Margem";
    const rows = [];
    aprovados.forEach(pre => {
      (pre.itens || []).forEach(item => {
        const margem = item.custoUnitario > 0 ? ((item.precoUnitario / item.custoUnitario - 1) * 100).toFixed(1) : "0";
        rows.push([pre.escola, pre.municipio, item.nome, item.quantidade, item.custoUnitario, item.precoUnitario, item.precoTotal, margem + "%"]
          .map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(";"));
      });
    });
    if (typeof downloadCsv === "function") {
      downloadCsv("rentabilidade.csv", [header, ...rows].join("\n"));
    }
  });
}

// ===== UTILITIES =====

function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ===== HOOK INTO TAB SWITCHING =====
// Listen for tab changes to trigger renders

const _origSwitchTab = typeof switchTab === "function" ? switchTab : null;
if (_origSwitchTab) {
  const origSwitch = switchTab;
  window.switchTab = function (tab) {
    origSwitch(tab);
    if (tab === "dashboard-precos" || tab === "intel-precos-dashboard") renderPricingDashboard();
    if (tab === "rentabilidade") renderRentabilidade();
    if (tab === "aprovados" && typeof renderAprovados === "function") renderAprovados();
    if (tab === "historico" && typeof renderHistorico === "function") renderHistorico();
  };
}

// Also hook the tab click handler to support new tabs
document.querySelectorAll('#tabs-intel-precos .tab').forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "dashboard-precos") setTimeout(renderPricingDashboard, 100);
    if (tab === "rentabilidade") setTimeout(renderRentabilidade, 100);
    if (tab === "aprovados") setTimeout(() => { if (typeof renderAprovados === "function") renderAprovados(); }, 100);
    if (tab === "historico") setTimeout(() => { if (typeof renderHistorico === "function") renderHistorico(); }, 100);
  });
});

// ===== INIT =====
// Auto-render if tab is already active
setTimeout(() => {
  const activeDash = document.getElementById("intel-precos-dashboard");
  if (activeDash && activeDash.classList.contains("active")) renderPricingDashboard();
}, 500);
