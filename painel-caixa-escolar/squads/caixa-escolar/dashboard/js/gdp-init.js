// [gdp-core.js loaded above — sidebar, constants, cloud sync, state, storage, save/load, etc.]

// Story 6.2: Helper para persistir preço histórico em Supabase
const _SB_PRECO_HIST = {
  URL: (window.SUPABASE_URL || 'https://mvvsjaudhbglxttxaeop.supabase.co') + '/rest/v1',
  KEY: window.SUPABASE_KEY || 'sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR',
  headers() {
    return { apikey: this.KEY, Authorization: 'Bearer ' + this.KEY, 'Content-Type': 'application/json' };
  },
  async insert(rows) {
    try {
      const res = await fetch(this.URL + '/preco_historico', {
        method: 'POST',
        headers: Object.assign({}, this.headers(), { Prefer: 'return=minimal' }),
        body: JSON.stringify(rows)
      });
      if (res.ok) gdpLog('[Story 6.2] preco_historico:', rows.length, 'registros inseridos');
      else gdpWarn('[Story 6.2] preco_historico insert falhou:', res.status);
    } catch (e) {
      gdpWarn('[Story 6.2] Supabase indisponível:', e.message);
    }
  },
  buildNfEntradaRows(notaEntrada, matchedItems) {
    const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
    return matchedItems.map(m => ({
      empresa_id: empId,
      sku: m.sku || m.bp?.sku || '',
      tipo: 'nf_entrada',
      valor: m.valorUnitario,
      custo_base: m.valorUnitario,
      fonte: 'nf_entrada',
      metadata: {
        fornecedor: notaEntrada.fornecedor || '',
        nf_numero: notaEntrada.numero || '',
        ncm: m.ncm || '',
        descricao: m.descricao || ''
      }
    }));
  }
};

// ===== TABS =====
function resetTabState() {
  // AC1: Clear all search fields
  ["busca-contrato","busca-item","busca-pedido","busca-nota-fiscal","cp-busca","cr-busca","int-busca","ei-busca","busca-lista-compras","busca-usuario","busca-entrega","busca-produto"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  // AC2: Clear all selection Sets
  _selectedPedidoIds.clear();
  _selectedNotaFiscalIds.clear();
  _selectedContaPagarIds.clear();
  _selectedContaReceberIds.clear();
  // FR-008: _selectedDemandaIds removed (demanda deprecated)
  if (typeof _selectedDemandaIds !== 'undefined') _selectedDemandaIds.clear();
  // AC2: Uncheck all checkboxes (select-all + individual)
  document.querySelectorAll(".pedido-check,.nota-fiscal-check,.cp-check,.cr-check,.cliente-chk,.banco-prod-chk").forEach(cb => { cb.checked = false; });
  ["pedidos-select-all","notas-fiscais-select-all","cp-select-all","cr-select-all","clientes-select-all","banco-prod-select-all","ei-lista-compras-select-all"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.checked = false; el.indeterminate = false; }
  });
  // AC3: Remove selection state from all page footers
  ["pedidos-page-footer","nf-page-footer","cp-page-footer","cr-page-footer","clientes-page-footer","produtos-page-footer","ne-page-footer"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("has-selection");
  });
  // Hide all page footers
  _hideAllPageFooters();
  // Fechar forms de editar/novo produto se estiverem abertos
  const detalhePage = document.getElementById("produto-detalhe-page");
  const listagem = document.getElementById("estoque-listagem");
  if (detalhePage && !detalhePage.classList.contains("hidden")) {
    detalhePage.classList.add("hidden");
    detalhePage.innerHTML = "";
  }
  if (listagem && listagem.classList.contains("hidden")) {
    listagem.classList.remove("hidden");
  }
  const novoProdOverlay = document.getElementById("novo-prod-overlay");
  if (novoProdOverlay) novoProdOverlay.classList.add("hidden");
}
function _hideAllPageFooters() {
  ["pedidos-page-footer","nf-page-footer","cp-page-footer","cr-page-footer","clientes-page-footer","produtos-page-footer","ne-page-footer"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}
function _showPageFooter(id) {
  _hideAllPageFooters();
  const el = document.getElementById(id);
  if (el) el.style.display = "flex";
}

function switchTab(tab) {
  resetTabState();
  toggleGdpSidebarMenu(true);
  document.querySelectorAll(".sidebar-subitem[data-gdp-tab]").forEach((item) => item.classList.remove("active"));
  const tabBtn = document.querySelector(`.sidebar-subitem[data-gdp-tab="${tab}"]`);
  if (tabBtn) tabBtn.classList.add("active");
  const contractsKpis = document.getElementById("kpi-grid");
  if (contractsKpis) contractsKpis.classList.toggle("hidden", tab !== "contratos");
  const title = document.getElementById("gdp-section-title");
  const labels = {
    usuarios: "Clientes",
    estoque: "Central de Produtos",
    fornecedores: "Fornecedores",
    "notas-entrada": "Notas de Entrada",
    "estoque-op": "Estoque",
    contratos: "Contratos",
    pedidos: "Pedidos",
    "notas-fiscais": "Notas Fiscais",
    financeiro: "Financeiro",
    relatorios: "Relatorios",
    importar: "Importar Contrato"
  };
  if (title) title.textContent = labels[tab] || "Contratos";

  // Tabs que são sub-views de tab-estoque (Central de Preços / Fornecedores / Notas Entrada / Estoque)
  const estoqueSubViews = ["estoque", "fornecedores", "notas-entrada", "estoque-op"];
  const isEstoqueView = estoqueSubViews.includes(tab);

  // Financeiro agrupa 3 sub-tabs
  const isFinanceiro = tab === "financeiro";

  // Esconder todas as tabs reais
  ["importar","contratos","itens","usuarios","pedidos","notas-fiscais","contas-pagar","contas-receber","caixa","relatorios","notas-entrada","estoque","financeiro"].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.add("hidden");
  });

  if (isEstoqueView) {
    // Mostrar tab-estoque e definir a sub-view correta
    document.getElementById("tab-estoque").classList.remove("hidden");
    const viewMap = { estoque: "produtos", fornecedores: "fornecedores", "notas-entrada": "notas-entrada", "estoque-op": "estoque" };
    // setEstoqueIntelView já chama renderEstoque() internamente
    if (typeof setEstoqueIntelView === "function") setEstoqueIntelView(viewMap[tab]);
    // Notas de entrada tem render próprio além do renderEstoque
    if (tab === "notas-entrada" && typeof renderNotasEntrada === "function") { renderNotasEntrada(); _showPageFooter("ne-page-footer"); _updateNeFooterTotals(); }
    if (tab === "estoque") { _showPageFooter("produtos-page-footer"); }
  } else if (isFinanceiro) {
    // Mostrar tab-financeiro
    const finEl = document.getElementById("tab-financeiro");
    if (finEl) finEl.classList.remove("hidden");
    // Sempre re-executar switchFinanceiroTab para garantir footer correto
    const activeFinBtn = document.querySelector('.fin-tab-btn.active');
    const activeFinTab = activeFinBtn ? activeFinBtn.dataset.finTab : 'caixa';
    switchFinanceiroTab(activeFinTab);
  } else {
    // Tab normal
    const tabEl = document.getElementById(`tab-${tab}`);
    if (tabEl) tabEl.classList.remove("hidden");
  }

  if (tab === "contratos") renderContratos();
  if (tab === "itens") renderItens();
  // Story 4.52: render functions now call footer updates internally with filtered data
  if (tab === "pedidos") { renderPedidos(); _showPageFooter("pedidos-page-footer"); }
  if (tab === "notas-fiscais") { renderNotasFiscais(); _showPageFooter("nf-page-footer"); }
  if (tab === "relatorios") renderRelatorios();
  if (tab === "usuarios") { renderUsuarios(); _showPageFooter("clientes-page-footer"); _updateClientesFooterTotals(); }
  if (tab === "financeiro" && typeof atualizarResumosVencimento === "function") atualizarResumosVencimento();
}

// Financeiro sub-tab switching
function switchFinanceiroTab(subTab) {
  ["caixa","contas-pagar","contas-receber","conciliacao"].forEach(t => {
    const el = document.getElementById(`fin-content-${t}`);
    if (el) el.classList.toggle("hidden", t !== subTab);
  });
  document.querySelectorAll(".fin-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.finTab === subTab);
  });
  if (subTab === "caixa") { if (typeof renderCaixa === "function") renderCaixa(); _hideAllPageFooters(); }
  // Story 4.52: render functions now call footer updates internally with filtered data
  if (subTab === "contas-pagar") { if (typeof renderContasPagar === "function") renderContasPagar(); _showPageFooter("cp-page-footer"); }
  if (subTab === "contas-receber") {
    if (typeof renderContasReceber === "function") renderContasReceber();
    if (typeof atualizarResumosVencimento === "function") atualizarResumosVencimento();
    _showPageFooter("cr-page-footer");
  }
  if (subTab === "conciliacao") { if (typeof renderConciliacao === "function") renderConciliacao(); _hideAllPageFooters(); }
}


// Story 4.52: Page footer totals — accept optional filtered items to reflect search/period/category filters
function _updatePedidosFooterTotals(items) {
  const qtdEl = document.getElementById("pedidos-footer-qtd");
  const valEl = document.getElementById("pedidos-footer-valor");
  const filtered = items || ((() => { const tab = typeof pedidoStatusTabAtual !== 'undefined' ? pedidoStatusTabAtual : 'todos'; return tab === 'todos' ? pedidos : pedidos.filter(p => normalizePedidoStatus(p.status) === tab); })());
  if (qtdEl) qtdEl.textContent = String(filtered.length).padStart(2, '0');
  if (valEl) valEl.textContent = brl.format(filtered.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0));
}
function _updateNfFooterTotals(items) {
  const qtdEl = document.getElementById("nf-footer-qtd");
  const valEl = document.getElementById("nf-footer-valor");
  const filtered = items || ((() => { const tab = typeof notaFiscalStatusTabAtual !== 'undefined' ? notaFiscalStatusTabAtual : 'todas'; return tab === 'todas' ? notasFiscais : notasFiscais.filter(nf => normalizeNotaFiscalStatus(nf.status) === tab); })());
  if (qtdEl) qtdEl.textContent = String(filtered.length).padStart(2, '0');
  if (valEl) valEl.textContent = brl.format(filtered.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0));
}
function _updateCpFooterTotals(items) {
  const qtdEl = document.getElementById("cp-footer-qtd");
  const valEl = document.getElementById("cp-footer-valor");
  const filtered = items || ((() => { const tab = typeof contaPagarStatusTabAtual !== 'undefined' ? contaPagarStatusTabAtual : 'todas'; return tab === 'todas' ? contasPagar : contasPagar.filter(c => normalizeContaPagarStatus(c) === tab); })());
  if (qtdEl) qtdEl.textContent = String(filtered.length).padStart(2, '0');
  if (valEl) valEl.textContent = brl.format(filtered.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0));
}
function _updateCrFooterTotals(items) {
  const qtdEl = document.getElementById("cr-footer-qtd");
  const valEl = document.getElementById("cr-footer-valor");
  const filtered = items || ((() => { const tab = typeof contaReceberStatusTabAtual !== 'undefined' ? contaReceberStatusTabAtual : 'todas'; return tab === 'todas' ? contasReceber : contasReceber.filter(c => normalizeContaReceberStatus(c) === tab); })());
  if (qtdEl) qtdEl.textContent = String(filtered.length).padStart(2, '0');
  if (valEl) valEl.textContent = brl.format(filtered.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0));
}
function _updateClientesFooterTotals() {
  const qtdEl = document.getElementById("clientes-footer-qtd");
  if (qtdEl) qtdEl.textContent = String(usuarios.length).padStart(2, '0');
}
function _updateProdutosFooterTotals(items) {
  const qtdEl = document.getElementById("produtos-footer-qtd");
  const count = items ? items.length : (typeof estoqueIntelProdutos !== 'undefined' ? estoqueIntelProdutos.length : 0);
  if (qtdEl) qtdEl.textContent = String(count).padStart(2, '0');
}

// [gdp-contratos-module.js loaded above — all contract CRUD functions live there, no duplicates]

function genId(prefix) {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
}

function formatDateTimeLocal(date = new Date()) {
  return new Date(date).toLocaleString("pt-BR");
}

function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  if (s.length < 10 || !s.includes('-')) return s;
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}


function registrarBaixaRecebimento(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  const dataBaixa = promptDataBaixa("Informe a data do recebimento (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  conta.status = "recebida";
  conta.recebidaEm = dataBaixa + "T12:00:00";
  conta.conciliacao = {
    status: "pendente_api_bancaria",
    referencia: genId("CNCL"),
    updatedAt: new Date().toISOString(),
    updatedBy: getAuditActor()
  };
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.recebidaEm };
  saveContasReceber();
  queueGdpIntegration("conta_receber", "registrar_recebimento", conta.id, {
    contaReceberId: conta.id,
    valor: conta.valor,
    forma: conta.forma,
    recebidaEm: conta.recebidaEm,
    conciliacao: conta.conciliacao
  }, {
    channel: "bancaria",
    onSuccess: (data) => updateContaReceberIntegration(conta.id, "bancaria", { status: "recebimento_registrado", protocol: data.protocol || "", lastAction: "registrar_recebimento" }),
    onError: (err) => updateContaReceberIntegration(conta.id, "bancaria", { status: "falha_envio", error: err.message, lastAction: "registrar_recebimento" })
  });
  renderContasReceber();
  showToast(`Recebimento registrado para ${conta.descricao}.`, 3000);
}

function clonarContaReceber(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  toggleContaReceberForm(true);
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  document.getElementById("cr-descricao").value = conta.descricao || "";
  document.getElementById("cr-categoria").value = normalizeContaCategoriaRegistro("receber", conta.categoria) || "faturamento";
  document.getElementById("cr-cliente").value = conta.cliente || "";
  document.getElementById("cr-forma").value = normalizeContaFormaRegistro(conta.forma) || "boleto";
  document.getElementById("cr-valor").value = conta.valor || "";
  document.getElementById("cr-vencimento").value = "";
  showToast(`Conta a receber ${conta.id} clonada. Ajuste vencimento e demais dados antes de registrar.`, 3500);
}

/* ── Contas a Receber: Checkbox, Bulk Actions, Menu "...", Detalhe ── */
var _selectedContaReceberIds = new Set();
var _crDetalheId = null;
var _crDetalheEditing = false;

function toggleSelectAllContasReceber() {
  const checked = document.getElementById("cr-select-all").checked;
  document.querySelectorAll(".cr-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoContasReceber();
}

function atualizarSelecaoContasReceber() {
  _selectedContaReceberIds.clear();
  document.querySelectorAll(".cr-check:checked").forEach(cb => { _selectedContaReceberIds.add(cb.value); });
  const count = _selectedContaReceberIds.size;
  const footer = document.getElementById("cr-page-footer");
  if (footer) footer.classList.toggle("has-selection", count > 0);
  const countEl = document.getElementById("cr-bulk-count");
  if (countEl) countEl.textContent = `${count} conta(s)`;
  const selectAll = document.getElementById("cr-select-all");
  if (selectAll) {
    const total = document.querySelectorAll(".cr-check").length;
    selectAll.checked = count > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
  if (count > 0) {
    const selContas = contasReceber.filter(c => _selectedContaReceberIds.has(c.id));
    const totalValor = selContas.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const qtdEl = document.getElementById("cr-footer-qtd");
    const valEl = document.getElementById("cr-footer-valor");
    if (qtdEl) qtdEl.textContent = String(count).padStart(2, '0');
    if (valEl) valEl.textContent = brl.format(totalValor);
  }
  // Story 4.52: when no selection, footer stays as set by renderContasReceber(filtered)
}

function bulkReceberContas() {
  if (!_selectedContaReceberIds.size) return;
  const dataBaixa = promptDataBaixa("Informe a data do recebimento (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  let count = 0;
  _selectedContaReceberIds.forEach(id => {
    const conta = contasReceber.find(c => c.id === id);
    if (conta && conta.status !== "recebida") {
      conta.status = "recebida";
      conta.recebidaEm = `${dataBaixa}T12:00:00`;
      conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.recebidaEm };
      count++;
    }
  });
  saveContasReceber();
  _selectedContaReceberIds.clear();
  renderContasReceber();
  showToast(`${count} conta(s) a receber baixada(s).`, 3000);
}

function bulkImprimirBoletos() {
  const selecionadas = contasReceber.filter(c => _selectedContaReceberIds.has(c.id) && c.forma === "boleto");
  if (!selecionadas.length) { showToast("Nenhuma conta com boleto selecionada.", "warn"); return; }
  const rows = selecionadas.map(item => `<tr><td>${esc(item.id)}</td><td>${esc(item.descricao)}</td><td>${esc(item.cliente || "-")}</td><td>${fmtDate(item.vencimento)}</td><td class="right">${brl.format(item.valor || 0)}</td><td>${esc(item.cobranca?.linhaDigitavel || "-")}</td></tr>`).join("");
  abrirJanelaRelatorioFinanceiro("Boletos - Contas a Receber", ["ID", "Descricao", "Cliente", "Vencimento", "Valor", "Linha Digitavel"], rows);
}

function bulkExcluirContasReceber() {
  if (!_selectedContaReceberIds.size) return;
  if (!confirm(`Excluir ${_selectedContaReceberIds.size} conta(s) a receber selecionada(s)?`)) return;
  contasReceber = contasReceber.filter(c => !_selectedContaReceberIds.has(c.id));
  saveContasReceber();
  _selectedContaReceberIds.clear();
  renderContasReceber();
  showToast("Contas excluidas.", 3000);
}

function toggleCrMenu(contaId, event) {
  if (event) event.stopPropagation();
  closeCpMenus();
  closeCrMenus();
  const menu = document.getElementById(`cr-menu-${contaId}`);
  if (!menu) return;
  menu.style.position = "fixed";
  menu.style.left = "auto";
  menu.style.top = "auto";
  if (event) {
    const rect = event.target.getBoundingClientRect();
    menu.style.left = rect.left + "px";
    menu.style.top = (rect.bottom + 4) + "px";
  }
  menu.classList.remove("hidden");
}

function closeCrMenus() {
  document.querySelectorAll('[id^="cr-menu-"]').forEach(el => el.classList.add("hidden"));
}

function toggleCrMenuHeader(event) {
  if (event) event.stopPropagation();
}

function abrirDetalheCr(contaId) {
  const conta = contasReceber.find(c => c.id === contaId);
  if (!conta) return;
  _crDetalheId = contaId;
  _crDetalheEditing = false;
  const modal = document.getElementById("cr-detalhe-modal");
  const body = document.getElementById("cr-detalhe-body");
  const actions = document.getElementById("cr-detalhe-actions");
  const editBtn = document.getElementById("cr-detalhe-edit-btn");
  if (editBtn) editBtn.textContent = "Editar";
  if (actions) actions.classList.add("hidden");
  const statusMeta = getContaReceberStatusMeta(conta);
  body.innerHTML = `
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.descricao)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><div style="padding:.4rem 0;font-size:.92rem">${esc(formatCategoriaLabel(conta.categoria))}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cliente</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.cliente || "-")}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.forma)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><div style="padding:.4rem 0;font-size:.92rem">${brl.format(conta.valor || 0)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.dataEmissao || "-")}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.vencimento)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${statusMeta.className}">${esc(statusMeta.label)}</span></div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Automacao</label><div style="padding:.4rem 0;font-size:.82rem">${conta.automacao?.whatsapp ? "WhatsApp" : "-"} / ${conta.automacao?.email ? "E-mail" : "-"}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cobranca</label><div style="padding:.4rem 0;font-size:.82rem">${esc(conta.cobranca?.status || "-")}</div></div>
    <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.recebidaEm, conta.audit?.updatedBy))}</div></div>
  `;
  modal.classList.remove("hidden");
}

function fecharDetalheCr() {
  document.getElementById("cr-detalhe-modal").classList.add("hidden");
  _crDetalheId = null;
  _crDetalheEditing = false;
}

function toggleEditCrDetalhe() {
  const conta = contasReceber.find(c => c.id === _crDetalheId);
  if (!conta) return;
  _crDetalheEditing = !_crDetalheEditing;
  const editBtn = document.getElementById("cr-detalhe-edit-btn");
  const actions = document.getElementById("cr-detalhe-actions");
  if (_crDetalheEditing) {
    editBtn.textContent = "Cancelar Edicao";
    actions.classList.remove("hidden");
    const body = document.getElementById("cr-detalhe-body");
    body.innerHTML = `
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><input type="text" id="cr-edit-descricao" value="${esc(conta.descricao)}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><select id="cr-edit-categoria"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cliente</label><input type="text" id="cr-edit-cliente" value="${esc(conta.cliente || "")}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><select id="cr-edit-forma"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><input type="number" id="cr-edit-valor" min="0" step="0.01" value="${conta.valor || 0}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><input type="date" id="cr-edit-dataEmissao" value="${conta.dataEmissao || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><input type="date" id="cr-edit-vencimento" value="${conta.vencimento || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${getContaReceberStatusMeta(conta).className}">${esc(getContaReceberStatusMeta(conta).label)}</span></div></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Automacao</label><div style="padding:.4rem 0;font-size:.82rem">${conta.automacao?.whatsapp ? "WhatsApp" : "-"} / ${conta.automacao?.email ? "E-mail" : "-"}</div></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cobranca</label><div style="padding:.4rem 0;font-size:.82rem">${esc(conta.cobranca?.status || "-")}</div></div>
      <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.recebidaEm, conta.audit?.updatedBy))}</div></div>
    `;
    renderContaCategoriaOptions();
    renderContaFormaOptions();
    const catEl = document.getElementById("cr-edit-categoria");
    const formaEl = document.getElementById("cr-edit-forma");
    if (catEl) catEl.innerHTML = contaReceberCategorias.map(c => `<option value="${c}" ${c === conta.categoria ? "selected" : ""}>${formatCategoriaLabel(c)}</option>`).join("");
    if (formaEl) formaEl.innerHTML = contaReceberFormas.map(f => `<option value="${f}" ${f === conta.forma ? "selected" : ""}>${f}</option>`).join("");
  } else {
    abrirDetalheCr(_crDetalheId);
  }
}

function salvarEditCrDetalhe() {
  const conta = contasReceber.find(c => c.id === _crDetalheId);
  if (!conta) return;
  conta.descricao = document.getElementById("cr-edit-descricao").value.trim() || conta.descricao;
  conta.categoria = document.getElementById("cr-edit-categoria").value || conta.categoria;
  conta.cliente = document.getElementById("cr-edit-cliente").value.trim() || conta.cliente;
  conta.forma = document.getElementById("cr-edit-forma").value || conta.forma;
  conta.valor = Number(document.getElementById("cr-edit-valor").value) || conta.valor;
  conta.dataEmissao = document.getElementById("cr-edit-dataEmissao").value || conta.dataEmissao;
  conta.vencimento = document.getElementById("cr-edit-vencimento").value || conta.vencimento;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  saveContasReceber();
  renderContasReceber();
  // AC7: Auto-close after save
  fecharDetalheCr();
  showToast("Conta a receber atualizada.", 3000);
}

function atualizarStatusConciliacao(contaId, status) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  conta.conciliacao = conta.conciliacao || { referencia: genId("CNCL") };
  conta.conciliacao.status = status;
  conta.conciliacao.updatedAt = new Date().toISOString();
  conta.conciliacao.updatedBy = getAuditActor();
  saveContasReceber();
  queueGdpIntegration("conta_receber", "atualizar_conciliacao", conta.id, {
    contaReceberId: conta.id,
    statusConciliacao: status,
    referencia: conta.conciliacao.referencia,
    valor: conta.valor
  }, {
    channel: "bancaria",
    onSuccess: (data) => updateContaReceberIntegration(conta.id, "bancaria", { status: "conciliacao_registrada", protocol: data.protocol || "", lastAction: "atualizar_conciliacao", conciliacaoStatus: status }),
    onError: (err) => updateContaReceberIntegration(conta.id, "bancaria", { status: "falha_envio", error: err.message, lastAction: "atualizar_conciliacao", conciliacaoStatus: status })
  });
  renderContasReceber();
  showToast(`Conciliação atualizada para ${status}.`, 3000);
}


function excluirContaReceber(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Excluir a conta a receber "${conta.descricao}"?`)) return;

  const notaId = conta.notaFiscalId || conta.origemId || "";
  contasReceber = contasReceber.filter((item) => item.id !== contaId);
  saveContasReceber();

  // Persistir delete no Supabase para evitar re-criação no sync
  if (window.gdpApi && window.gdpApi.contas_receber) {
    gdpApi.contas_receber.remove(contaId).catch(e => gdpWarn('[excluirContaReceber] Supabase delete failed:', e));
  }

  // Rastrear IDs deletados para bloquear re-merge do Supabase
  try {
    const delKey = "gdp.contas-receber.deleted.v1";
    const deleted = JSON.parse(localStorage.getItem(delKey) || "[]");
    if (!deleted.includes(contaId)) deleted.push(contaId);
    localStorage.setItem(delKey, JSON.stringify(deleted));
  } catch(_) {}

  if (notaId) {
    const nf = notasFiscais.find((item) => item.id === notaId);
    if (nf?.cobranca) {
      nf.cobranca.status = "removida";
      nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
      saveNotasFiscais();
    }
  }

  integracoesGdp = (integracoesGdp || []).filter((item) => !(item.entityType === "conta_receber" && item.entityId === contaId));
  saveIntegracoesGdp();
  renderContasReceber();
  showToast(`Conta a receber "${conta.descricao}" excluida.`, 3000);
}

function abrirInventario() {
  const resumo = getEstoqueIntelResumo();
  const rows = resumo.map(item => `<tr>
    <td style="font-size:.82rem">${esc(item.produto.nome)}</td>
    <td class="text-center">${esc(item.produto.unidade_base)}</td>
    <td class="text-right font-mono">${item.fisico}</td>
    <td class="text-center"><input type="number" class="inv-qtd" data-prod-id="${item.produto.id}" value="${item.fisico}" min="0" style="width:80px;text-align:right;padding:.3rem .4rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--txt);font-family:monospace"></td>
  </tr>`).join('');
  const modal = document.getElementById('modal-contrato');
  document.getElementById('modal-contrato-titulo').textContent = '📋 Inventário de Estoque';
  document.getElementById('modal-contrato-header-actions').innerHTML = '';
  document.getElementById('modal-contrato-body').innerHTML = `
    <p style="font-size:.82rem;color:var(--mut);margin-bottom:1rem">Atualize a quantidade física real de cada produto. Ao salvar, as diferenças serão registradas como ajuste de inventário.</p>
    <div class="table-wrap" style="max-height:60vh;overflow-y:auto">
      <table style="font-size:.8rem"><thead><tr><th>Produto</th><th class="text-center">Unidade</th><th class="text-right">Estoque Atual</th><th class="text-center">Contagem Real</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem">
      <button class="btn btn-outline" onclick="fecharModalContrato()">Cancelar</button>
      <button class="btn btn-green" onclick="salvarInventario()">Salvar Inventário</button>
    </div>`;
  modal.classList.remove('hidden');
}

function salvarInventario() {
  const inputs = document.querySelectorAll('.inv-qtd');
  let ajustes = 0;
  const agora = new Date().toISOString();
  inputs.forEach(input => {
    const prodId = input.dataset.prodId;
    const novaQtd = Number(input.value || 0);
    const resumo = getEstoqueIntelResumo();
    const item = resumo.find(r => r.produto.id === prodId);
    if (!item) return;
    const diff = novaQtd - item.fisico;
    if (diff === 0) return;
    estoqueIntelMovimentacoes.push({
      id: genId('MOV'),
      produto_id: prodId,
      tipo: 'fisico',
      operacao: diff > 0 ? '+' : '-',
      quantidade: Math.abs(diff),
      data: agora,
      origem: 'inventario',
      referencia_id: 'INV-' + agora.slice(0,10)
    });
    ajustes++;
  });
  if (ajustes > 0) {
    saveEstoqueIntelMovimentacoes();
    renderEstoque();
    showToast(`Inventário salvo: ${ajustes} produto(s) ajustado(s).`, 3000);
  } else {
    showToast('Nenhuma alteração detectada.', 2000);
  }
  fecharModalContrato();
}

function imprimirEstoqueCalculado() {
  const tbody = document.getElementById('ei-estoque-tbody');
  if (!tbody || !tbody.children.length) { showToast('Nenhum estoque para imprimir.'); return; }
  const empresa = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
  const nomeEmpresa = empresa.razaoSocial || empresa.nome || 'Empresa';
  const rows = Array.from(tbody.querySelectorAll('tr')).map(tr => {
    const tds = tr.querySelectorAll('td');
    return tds.length >= 5 ? `<tr>${Array.from(tds).map((td,i) => `<td style="border:1px solid #ddd;padding:6px 8px;${i > 0 && i < 5 ? 'text-align:right' : ''}">${td.textContent}</td>`).join('')}</tr>` : '';
  }).join('');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Estoque</title><style>body{font-family:Arial,sans-serif;margin:2cm;color:#333}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f0f0f0;padding:8px;border:1px solid #ddd;text-align:left;font-size:11px}@media print{body{margin:1cm}}</style></head><body><h2>Estoque Calculado — ${nomeEmpresa}</h2><p style="font-size:11px;color:#666">${new Date().toLocaleDateString('pt-BR')}</p><table><thead><tr><th>Produto</th><th style="text-align:right">Físico</th><th style="text-align:right">Comprometido</th><th style="text-align:right">Compr. Emb.</th><th style="text-align:right">Disponível</th><th>Base</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 3000);
}

function estornarContaReceber(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Estornar conta a receber "${conta.descricao}"?\nValor: ${brl.format(conta.valor)}\n\nO status voltará para pendente.`)) return;
  conta.status = "pendente";
  delete conta.recebidaEm;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), estornoAt: new Date().toISOString() };
  saveContasReceber();
  renderContasReceber();
  showToast(`Conta a receber "${conta.descricao}" estornada.`, 3000);
}

function excluirContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Excluir a conta a pagar "${conta.descricao}"?`)) return;
  contasPagar = contasPagar.filter((item) => item.id !== contaId);
  saveContasPagar();
  renderContasPagar();
  showToast(`Conta a pagar "${conta.descricao}" excluida.`, 3000);
}

function registrarContaPagar() {
  const descricao = document.getElementById("cp-descricao").value.trim();
  const categoria = ensureContaCategoria("pagar", document.getElementById("cp-categoria").value.trim());
  const forma = ensureContaForma("pagar", document.getElementById("cp-forma").value);
  const valor = Number(document.getElementById("cp-valor").value || 0);
  const dataEmissao = document.getElementById("cp-data-emissao").value;
  const vencimento = document.getElementById("cp-vencimento").value;
  if (!descricao || !categoria || !valor || !dataEmissao || !vencimento) {
    showToast("Preencha descricao, categoria, valor, data de emissao e vencimento.", 3500);
    return;
  }
  contasPagar.push({
    id: genId("CP"),
    descricao,
    categoria,
    forma,
    valor,
    dataEmissao,
    vencimento,
    status: "emitida",
    audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
  });
  saveContasPagar();
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  ["cp-descricao", "cp-valor", "cp-data-emissao", "cp-vencimento"].forEach((id) => document.getElementById(id).value = "");
  document.getElementById("cp-categoria").value = "fornecedor";
  document.getElementById("cp-forma").value = "boleto";
  toggleContaPagarForm(false);
  contaPagarStatusTabAtual = "emitida";
  renderContasPagar();
  showToast("Conta a pagar registrada.", 3000);
}

function registrarContaReceber() {
  const descricao = document.getElementById("cr-descricao").value.trim();
  const categoria = ensureContaCategoria("receber", document.getElementById("cr-categoria").value.trim());
  const cliente = document.getElementById("cr-cliente").value.trim();
  const forma = ensureContaForma("receber", document.getElementById("cr-forma").value);
  const valor = Number(document.getElementById("cr-valor").value || 0);
  const dataEmissao = document.getElementById("cr-data-emissao").value;
  const vencimento = document.getElementById("cr-vencimento").value;
  if (!descricao || !categoria || !cliente || !valor || !dataEmissao || !vencimento) {
    showToast("Preencha descricao, categoria, cliente, valor, data de emissao e vencimento.", 3500);
    return;
  }
  contasReceber.push({
    id: genId("CR"),
    origemTipo: "manual",
    origemId: "",
    descricao,
    categoria,
    cliente,
    forma,
    valor,
    dataEmissao,
    vencimento,
    status: "emitida",
    automacao: { whatsapp: false, email: true, ultimoDisparo: "" },
    cobranca: { status: forma === "boleto" ? "boleto_gerado" : "manual", linhaDigitavel: "", pixCopiaECola: "" },
    audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
  });
  saveContasReceber();
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  ["cr-descricao", "cr-cliente", "cr-valor", "cr-data-emissao", "cr-vencimento"].forEach((id) => document.getElementById(id).value = "");
  document.getElementById("cr-categoria").value = "faturamento";
  document.getElementById("cr-forma").value = "boleto";
  toggleContaReceberForm(false);
  contaReceberStatusTabAtual = "emitida";
  renderContasReceber();
  showToast("Conta a receber registrada.", 3000);
}

function registrarBaixaContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  const dataBaixa = promptDataBaixa("Informe a data da baixa (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  conta.status = "paga";
  conta.pagaEm = `${dataBaixa}T12:00:00`;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.pagaEm };
  saveContasPagar();
  renderContasPagar();
  showToast(`Conta a pagar "${conta.descricao}" baixada.`, 3000);
}

function clonarContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  toggleContaPagarForm(true);
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  document.getElementById("cp-descricao").value = conta.descricao || "";
  document.getElementById("cp-categoria").value = normalizeContaCategoriaRegistro("pagar", conta.categoria) || "fornecedor";
  document.getElementById("cp-forma").value = normalizeContaFormaRegistro(conta.forma) || "boleto";
  document.getElementById("cp-valor").value = conta.valor || "";
  document.getElementById("cp-vencimento").value = "";
  showToast(`Conta a pagar ${conta.id} clonada. Ajuste vencimento e demais dados antes de registrar.`, 3500);
}

function estornarContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Estornar conta a pagar "${conta.descricao}"?\nValor: ${brl.format(conta.valor)}\n\nO status voltará para pendente.`)) return;
  conta.status = "pendente";
  delete conta.pagaEm;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), estornoAt: new Date().toISOString() };
  saveContasPagar();
  renderContasPagar();
  showToast(`Conta a pagar "${conta.descricao}" estornada.`, 3000);
}

/* ── Contas a Pagar: Checkbox, Bulk Actions, Menu "...", Detalhe ── */
var _selectedContaPagarIds = new Set();
var _cpDetalheId = null;
var _cpDetalheEditing = false;

function toggleSelectAllContasPagar() {
  const checked = document.getElementById("cp-select-all").checked;
  document.querySelectorAll(".cp-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoContasPagar();
}

function atualizarSelecaoContasPagar() {
  _selectedContaPagarIds.clear();
  document.querySelectorAll(".cp-check:checked").forEach(cb => { _selectedContaPagarIds.add(cb.value); });
  const count = _selectedContaPagarIds.size;
  const footer = document.getElementById("cp-page-footer");
  if (footer) footer.classList.toggle("has-selection", count > 0);
  const countEl = document.getElementById("cp-bulk-count");
  if (countEl) countEl.textContent = `${count} conta(s)`;
  const selectAll = document.getElementById("cp-select-all");
  if (selectAll) {
    const total = document.querySelectorAll(".cp-check").length;
    selectAll.checked = count > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
  if (count > 0) {
    const selContas = contasPagar.filter(c => _selectedContaPagarIds.has(c.id));
    const totalValor = selContas.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const qtdEl = document.getElementById("cp-footer-qtd");
    const valEl = document.getElementById("cp-footer-valor");
    if (qtdEl) qtdEl.textContent = String(count).padStart(2, '0');
    if (valEl) valEl.textContent = brl.format(totalValor);
  }
  // Story 4.52: when no selection, footer stays as set by renderContasPagar(filtered)
}

function bulkBaixarContasPagar() {
  if (!_selectedContaPagarIds.size) return;
  const dataBaixa = promptDataBaixa("Informe a data da baixa (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  let count = 0;
  _selectedContaPagarIds.forEach(id => {
    const conta = contasPagar.find(c => c.id === id);
    if (conta && conta.status !== "paga") {
      conta.status = "paga";
      conta.pagaEm = `${dataBaixa}T12:00:00`;
      conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.pagaEm };
      count++;
    }
  });
  saveContasPagar();
  _selectedContaPagarIds.clear();
  renderContasPagar();
  showToast(`${count} conta(s) a pagar baixada(s).`, 3000);
}

function bulkExcluirContasPagar() {
  if (!_selectedContaPagarIds.size) return;
  if (!confirm(`Excluir ${_selectedContaPagarIds.size} conta(s) a pagar selecionada(s)?`)) return;
  contasPagar = contasPagar.filter(c => !_selectedContaPagarIds.has(c.id));
  saveContasPagar();
  _selectedContaPagarIds.clear();
  renderContasPagar();
  showToast("Contas excluidas.", 3000);
}

function toggleCpMenu(contaId, event) {
  if (event) event.stopPropagation();
  closeCpMenus();
  closeCrMenus();
  const menu = document.getElementById(`cp-menu-${contaId}`);
  if (!menu) return;
  menu.style.position = "fixed";
  menu.style.left = "auto";
  menu.style.top = "auto";
  if (event) {
    const rect = event.target.getBoundingClientRect();
    menu.style.left = rect.left + "px";
    menu.style.top = (rect.bottom + 4) + "px";
  }
  menu.classList.remove("hidden");
}

function closeCpMenus() {
  document.querySelectorAll('[id^="cp-menu-"]').forEach(el => el.classList.add("hidden"));
}

function toggleCpMenuHeader(event) {
  if (event) event.stopPropagation();
}

document.addEventListener("click", function() { closeCpMenus(); closeCrMenus(); });

function abrirDetalheCp(contaId) {
  const conta = contasPagar.find(c => c.id === contaId);
  if (!conta) return;
  _cpDetalheId = contaId;
  _cpDetalheEditing = false;
  const modal = document.getElementById("cp-detalhe-modal");
  const body = document.getElementById("cp-detalhe-body");
  const actions = document.getElementById("cp-detalhe-actions");
  const editBtn = document.getElementById("cp-detalhe-edit-btn");
  if (editBtn) editBtn.textContent = "Editar";
  if (actions) actions.classList.add("hidden");
  const statusMeta = getContaPagarStatusMeta(conta);
  body.innerHTML = `
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><div id="cp-det-descricao" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.descricao)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><div id="cp-det-categoria" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(formatCategoriaLabel(conta.categoria))}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><div id="cp-det-forma" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.forma)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><div id="cp-det-valor" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${brl.format(conta.valor || 0)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><div id="cp-det-dataEmissao" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.dataEmissao || "-")}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><div id="cp-det-vencimento" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.vencimento)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${statusMeta.className}">${esc(statusMeta.label)}</span></div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.pagaEm, conta.audit?.updatedBy))}</div></div>
  `;
  modal.classList.remove("hidden");
}

function fecharDetalheCp() {
  document.getElementById("cp-detalhe-modal").classList.add("hidden");
  _cpDetalheId = null;
  _cpDetalheEditing = false;
}

function toggleEditCpDetalhe() {
  const conta = contasPagar.find(c => c.id === _cpDetalheId);
  if (!conta) return;
  _cpDetalheEditing = !_cpDetalheEditing;
  const editBtn = document.getElementById("cp-detalhe-edit-btn");
  const actions = document.getElementById("cp-detalhe-actions");
  if (_cpDetalheEditing) {
    editBtn.textContent = "Cancelar Edicao";
    actions.classList.remove("hidden");
    const body = document.getElementById("cp-detalhe-body");
    body.innerHTML = `
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><input type="text" id="cp-edit-descricao" value="${esc(conta.descricao)}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><select id="cp-edit-categoria"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><select id="cp-edit-forma"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><input type="number" id="cp-edit-valor" min="0" step="0.01" value="${conta.valor || 0}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><input type="date" id="cp-edit-dataEmissao" value="${conta.dataEmissao || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><input type="date" id="cp-edit-vencimento" value="${conta.vencimento || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${getContaPagarStatusMeta(conta).className}">${esc(getContaPagarStatusMeta(conta).label)}</span></div></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.pagaEm, conta.audit?.updatedBy))}</div></div>
    `;
    renderContaCategoriaOptions();
    renderContaFormaOptions();
    const catEl = document.getElementById("cp-edit-categoria");
    const formaEl = document.getElementById("cp-edit-forma");
    if (catEl) catEl.innerHTML = contaPagarCategorias.map(c => `<option value="${c}" ${c === conta.categoria ? "selected" : ""}>${formatCategoriaLabel(c)}</option>`).join("");
    if (formaEl) formaEl.innerHTML = contaPagarFormas.map(f => `<option value="${f}" ${f === conta.forma ? "selected" : ""}>${f}</option>`).join("");
  } else {
    abrirDetalheCp(_cpDetalheId);
  }
}

function salvarEditCpDetalhe() {
  const conta = contasPagar.find(c => c.id === _cpDetalheId);
  if (!conta) return;
  conta.descricao = document.getElementById("cp-edit-descricao").value.trim() || conta.descricao;
  conta.categoria = document.getElementById("cp-edit-categoria").value || conta.categoria;
  conta.forma = document.getElementById("cp-edit-forma").value || conta.forma;
  conta.valor = Number(document.getElementById("cp-edit-valor").value) || conta.valor;
  conta.dataEmissao = document.getElementById("cp-edit-dataEmissao").value || conta.dataEmissao;
  conta.vencimento = document.getElementById("cp-edit-vencimento").value || conta.vencimento;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  saveContasPagar();
  renderContasPagar();
  // AC7: Auto-close after save
  fecharDetalheCp();
  showToast("Conta a pagar atualizada.", 3000);
}

function imprimirRelatorioContasPagar() {
  const rows = contasPagar.map((item) => {
    const status = getContaPagarStatusMeta(item);
    return `<tr><td>${esc(item.id)}</td><td>${esc(item.descricao)}</td><td>${esc(formatCategoriaLabel(item.categoria))}</td><td>${fmtDate(item.vencimento)}</td><td class="right">${brl.format(item.valor || 0)}</td><td>${esc(status.label)}</td></tr>`;
  }).join("");
  abrirJanelaRelatorioFinanceiro("Relatorio - Contas a Pagar", ["ID", "Descricao", "Categoria", "Vencimento", "Valor", "Status"], rows);
}

function imprimirRelatorioContasReceber() {
  const rows = contasReceber.map((item) => {
    const status = getContaReceberStatusMeta(item);
    return `<tr><td>${esc(item.id)}</td><td>${esc(item.descricao)}</td><td>${esc(item.cliente || "-")}</td><td>${esc(formatCategoriaLabel(item.categoria))}</td><td>${fmtDate(item.vencimento)}</td><td class="right">${brl.format(item.valor || 0)}</td><td>${esc(status.label)}</td></tr>`;
  }).join("");
  abrirJanelaRelatorioFinanceiro("Relatorio - Contas a Receber", ["ID", "Descricao", "Cliente", "Categoria", "Vencimento", "Valor", "Status"], rows);
}

// [gdp-estoque-intel.js loaded above — Stock Intelligence core functions]
// [gdp-pedidos.js loaded above — Pedidos, NF, CP, CR, Caixa, Relatorios]

function getIntegracoesConsolidadas() {
  const remoteMap = new Map((integracoesRemotas || []).map((item) => [item.id, item]));
  return (integracoesGdp || []).map((local) => ({
    ...local,
    backend: remoteMap.get(local.id) || null
  }));
}

async function atualizarIntegracoesRemotas() {
  try {
    const resp = await fetch("/api/gdp-integrations");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    integracoesRemotas = Array.isArray(data.items) ? data.items : [];
    integracoesUltimaLeitura = new Date().toISOString();
    renderIntegracoes();
  } catch (err) {
    showToast(`Falha ao consultar integracoes: ${err.message}`, 4000);
  }
}

async function carregarConfigSefaz() {
  try {
    const resp = await fetch("/api/gdp-integrations?action=nfe-sefaz-config");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    sefazConfigSnapshot = data;
  } catch (err) {
    sefazConfigSnapshot = { ok: false, error: err.message, missing: ["falha_consulta"] };
  }
  renderIntegracoes();
  return sefazConfigSnapshot;
}

function renderIntegracoes() {
  const tbody = document.getElementById("integracoes-tbody");
  const empty = document.getElementById("integracoes-empty");
  if (!tbody || !empty) return;
  normalizeLegacyManualIntegrations();
  const busca = (document.getElementById("int-busca")?.value || "").toLowerCase();
  const filtroStatus = document.getElementById("int-filtro-status")?.value || "";
  const filtroCanal = document.getElementById("int-filtro-canal")?.value || "";

  let items = getIntegracoesConsolidadas();
  if (busca) {
    items = items.filter((item) => `${item.entityType || ""} ${item.entityId || ""} ${item.channel || ""} ${item.action || ""} ${item.protocol || ""} ${item.backend?.protocol || ""}`.toLowerCase().includes(busca));
  }
  if (filtroStatus) items = items.filter((item) => item.status === filtroStatus);
  if (filtroCanal) items = items.filter((item) => item.channel === filtroCanal);

  const intCountEl = document.getElementById("tab-count-integracoes");
  if (intCountEl) intCountEl.textContent = items.length;
  const pendentes = integracoesGdp.filter((item) => item.status === "pendente_envio").length;
  const ok = integracoesGdp.filter((item) => item.status === "sincronizado").length;
  const falhas = integracoesGdp.filter((item) => item.status === "falha_envio").length;
  document.getElementById("int-kpi-pendente").textContent = pendentes;
  document.getElementById("int-kpi-ok").textContent = ok;
  document.getElementById("int-kpi-falha").textContent = falhas;
  document.getElementById("int-kpi-sync").textContent = sefazConfigSnapshot?.ambiente || (integracoesUltimaLeitura ? formatDateTimeLocal(integracoesUltimaLeitura) : "-");

  if (!items.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  tbody.innerHTML = [
    sefazConfigSnapshot ? `
      <tr>
        <td>${integracoesUltimaLeitura ? formatDateTimeLocal(integracoesUltimaLeitura) : "-"}</td>
        <td>sefaz</td>
        <td><strong>configuracao</strong><br><span class="font-mono" style="font-size:.72rem;color:var(--mut)">${esc(sefazConfigSnapshot.uf || "-")}</span></td>
        <td>snapshot_config</td>
        <td><span class="badge ${((sefazConfigSnapshot.missing || []).length === 0 && sefazConfigSnapshot.certificado === "configurado") ? "badge-green" : "badge-yellow"}">${((sefazConfigSnapshot.missing || []).length === 0 && sefazConfigSnapshot.certificado === "configurado") ? "config_ok" : "config_pendente"}</span></td>
        <td><span class="badge badge-blue">${esc(sefazConfigSnapshot.certificado || "-")}</span><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">${esc(sefazConfigSnapshot.certificadoBytes ? `${sefazConfigSnapshot.certificadoBytes} bytes` : sefazConfigSnapshot.certificadoMensagem || "-")}</div><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">PEM: ${esc(sefazConfigSnapshot.pem?.certStatus || "-")} / ${esc(sefazConfigSnapshot.pem?.keyStatus || "-")}</div></td>
        <td class="font-mono" style="font-size:.72rem">${esc(sefazConfigSnapshot.emitente?.razaoSocial || "-")}</td>
        <td style="font-size:.75rem;color:var(--mut)">${esc((sefazConfigSnapshot.missing || []).length ? sefazConfigSnapshot.missing.join(", ") : "nenhuma pendencia")}</td>
      </tr>` : "",
    ...items.map((item) => `
    <tr>
      <td>${item.createdAt ? formatDateTimeLocal(item.createdAt) : "-"}</td>
      <td>${esc(item.channel || "-")}</td>
      <td><strong>${esc(item.entityType || "-")}</strong><br><span class="font-mono" style="font-size:.72rem;color:var(--mut)">${esc(item.entityId || "-")}</span></td>
      <td>${esc(item.action || "-")}</td>
      <td><span class="badge ${item.status === "sincronizado" ? "badge-green" : item.status === "falha_envio" ? "badge-red" : "badge-yellow"}">${esc(item.status || "-")}</span></td>
      <td><span class="badge ${item.backend?.status === "registrado_backend" ? "badge-blue" : "badge-yellow"}">${esc(item.backend?.status || "-")}</span></td>
      <td class="font-mono" style="font-size:.72rem">${esc(item.backend?.protocol || item.protocol || "-")}</td>
      <td style="font-size:.75rem;color:var(--mut)">${esc(item.error || item.backend?.error || item.remoteStatus || "-")}</td>
    </tr>
  `)
  ].join("");
}

function renderNotasEntrada() {
  const tbody = document.getElementById("notas-entrada-tbody");
  const empty = document.getElementById("notas-entrada-empty");
  if (!tbody || !empty) return;

  const items = [...notasEntrada].sort((a, b) => new Date(b.emitidaEm || b.createdAt || 0) - new Date(a.emitidaEm || a.createdAt || 0));
  const total = items.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const pendentes = items.filter((item) => item.status === "consulta_pendente").length;

  const totalEl = document.getElementById("ne-kpi-total");
  const pendentesEl = document.getElementById("ne-kpi-pendentes");
  const valorEl = document.getElementById("ne-kpi-valor");
  if (totalEl) totalEl.textContent = items.length;
  if (pendentesEl) pendentesEl.textContent = pendentes;
  if (valorEl) valorEl.textContent = brl.format(total);

  if (!items.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  tbody.innerHTML = items.map((item) => {
    const hasItens = item.itens && item.itens.length > 0;
    const itensCount = hasItens ? item.itens.length : 0;
    let row = `<tr style="cursor:${hasItens ? 'pointer' : 'default'}" ${hasItens ? `onclick="toggleNfItens('${item.id}')"` : ''}>
      <td onclick="event.stopPropagation()"><input type="checkbox" class="ne-check" value="${item.id}" onchange="atualizarSelecaoNotasEntrada()"></td>
      <td>${esc(item.emitidaEm ? formatDateTimeLocal(item.emitidaEm) : "-")}</td>
      <td>${esc(item.fornecedor || "-")}</td>
      <td>${esc(item.numero || "-")}</td>
      <td style="font-size:.72rem" class="font-mono">${esc(item.chave || "-")}</td>
      <td class="text-right font-mono">${brl.format(Number(item.valor || 0))}</td>
      <td><span class="badge ${item.status === "registrada" ? "badge-green" : item.status === "consulta_pendente" ? "badge-yellow" : "badge-blue"}">${esc(item.status || "-")}</span></td>
      <td>${itensCount > 0 ? `<span class="badge badge-blue">${itensCount} itens</span>` : '<span style="color:var(--mut)">—</span>'}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        ${hasItens ? `<button class="btn btn-outline btn-sm" onclick="importarNfParaCentral('${item.id}')" title="Importar todos para Central de Produtos">📥 Importar</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="downloadNfPdf('${item.id}')" title="Download PDF da NF">📄 PDF</button>
      </td>
    </tr>`;
    // Expandable row with item details
    if (hasItens) {
      row += `<tr id="nf-itens-${item.id}" style="display:none"><td colspan="9" style="padding:0;background:var(--bg)">
        <div style="padding:.75rem 1rem;border-left:3px solid var(--primary,#3b82f6)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <strong style="font-size:.8rem">Itens da NF #${esc(item.numero || "")}</strong>
            <button class="btn btn-outline btn-sm" onclick="importarNfParaCentral('${item.id}')">📥 Importar todos para Central</button>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:.8rem">
            <thead><tr style="background:rgba(59,130,246,.08)"><th style="padding:4px 8px">#</th><th style="padding:4px 8px">Descrição</th><th style="padding:4px 8px">NCM</th><th style="padding:4px 8px">Qtd</th><th style="padding:4px 8px">Unid</th><th style="padding:4px 8px;text-align:right">V.Unit</th><th style="padding:4px 8px;text-align:right">V.Total</th></tr></thead>
            <tbody>${item.itens.map((it, idx) => `<tr>
              <td style="padding:3px 8px">${idx + 1}</td>
              <td style="padding:3px 8px">${esc(it.descricao || it.nome || "-")}</td>
              <td style="padding:3px 8px;font-size:.72rem">${esc(it.ncm || "-")}</td>
              <td style="padding:3px 8px">${it.quantidade || 0}</td>
              <td style="padding:3px 8px">${esc(it.unidade || "UN")}</td>
              <td style="padding:3px 8px;text-align:right">${brl.format(it.valorUnitario || it.precoUnitario || 0)}</td>
              <td style="padding:3px 8px;text-align:right">${brl.format(it.valorTotal || 0)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </td></tr>`;
    }
    return row;
  }).join("");
}

function registrarNotaEntradaManual() {
  const fornecedor = (document.getElementById("ne-fornecedor")?.value || "").trim();
  const numero = (document.getElementById("ne-numero")?.value || "").trim();
  const chave = (document.getElementById("ne-chave")?.value || "").replace(/\D/g, "");
  const valor = Number(document.getElementById("ne-valor")?.value || 0);
  if (!fornecedor || !numero || !valor) {
    showToast("Informe fornecedor, numero e valor da nota de entrada.", 3500);
    return;
  }
  notasEntrada.unshift({
    id: genId("NE"),
    fornecedor,
    numero,
    chave,
    valor,
    status: "registrada",
    origem: "manual",
    emitidaEm: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
  });
  saveNotasEntrada();

  // Bridge 1: NF Entrada → Custo real
  (function() {
    var notaEntrada = notasEntrada[0]; // just unshifted
    var matchedForSb = []; // Story 6.2: collect matched items
    if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
      (notaEntrada.itens || []).forEach(function(item) {
        var bp = bancoPrecos.itens.find(function(b) {
          return (item.ncm && b.ncm === item.ncm && normalizedText(b.item).includes(normalizedText(item.descricao).split(' ')[0])) ||
                 normalizedText(b.item) === normalizedText(item.descricao);
        });
        if (bp) {
          bp.custoBase = item.precoUnitario || item.valorUnitario;
          if (!bp.custosFornecedor) bp.custosFornecedor = [];
          bp.custosFornecedor.push({ fornecedor: notaEntrada.fornecedor || 'NF Entrada', preco: bp.custoBase, data: new Date().toISOString().slice(0,10), tipo: 'nf_entrada' });
          bp.precoReferencia = bp.custoBase * (1 + (bp.margemPadrao || 0.30));
          matchedForSb.push({ sku: bp.sku, valorUnitario: bp.custoBase, ncm: item.ncm, descricao: item.descricao });
          showToast("✅ Custo atualizado: " + bp.item + " → R$ " + bp.custoBase.toFixed(2) + " (NF #" + notaEntrada.numero + " de " + notaEntrada.fornecedor + ")", 4000);
        } else {
          showToast("⚠️ Item NF sem match no banco: " + (item.descricao || '?') + " (NCM: " + (item.ncm || '?') + ")", 4000);
        }
      });
      saveBancoLocal();
      // Story 6.2: Persistir em Supabase preco_historico
      if (matchedForSb.length > 0) {
        _SB_PRECO_HIST.insert(_SB_PRECO_HIST.buildNfEntradaRows(notaEntrada, matchedForSb));
      }
    }
  })();

  ["ne-fornecedor", "ne-numero", "ne-chave", "ne-valor"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  renderNotasEntrada();
  showToast("Nota de entrada registrada.", 3000);
}

function importarNotaEntradaXml(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const xml = String(reader.result || "");
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const text = (tag) => doc.getElementsByTagName(tag)?.[0]?.textContent?.trim() || "";
      // Extrair emitente
      const emitNode = doc.getElementsByTagName("emit")[0];
      const emit = emitNode?.getElementsByTagName("xNome")[0]?.textContent?.trim() || text("xNome");
      const cnpjEmit = emitNode?.getElementsByTagName("CNPJ")[0]?.textContent?.trim() || "";
      const nNF = text("nNF");
      const chave = text("chNFe");
      const vNF = Number(text("vNF") || 0);
      const dhEmi = text("dhEmi") || text("dEmi") || new Date().toISOString();
      if (!emit || !nNF) throw new Error("XML sem emitente ou numero da NF");

      // Extrair itens da NF (tags <det>)
      const detNodes = doc.getElementsByTagName("det");
      const itensNF = [];
      for (let i = 0; i < detNodes.length; i++) {
        const det = detNodes[i];
        const prod = det.getElementsByTagName("prod")[0];
        if (!prod) continue;
        const pText = (tag) => prod.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
        itensNF.push({
          itemNum: i + 1,
          codigo: pText("cProd"),
          descricao: pText("xProd"),
          ncm: pText("NCM"),
          cfop: pText("CFOP"),
          unidade: pText("uCom"),
          quantidade: Number(pText("qCom") || 0),
          valorUnitario: Number(pText("vUnCom") || 0),
          precoUnitario: Number(pText("vUnCom") || 0),
          valorTotal: Number(pText("vProd") || 0),
          ean: pText("cEAN") !== "SEM GTIN" ? pText("cEAN") : ""
        });
      }

      // Extract full DANFE data from XML
      const emitEndereco = emitNode?.getElementsByTagName("enderEmit")[0];
      const destNode = doc.getElementsByTagName("dest")[0];
      const destEndereco = destNode?.getElementsByTagName("enderDest")[0];
      const icmsTotal = doc.getElementsByTagName("ICMSTot")[0];
      const transpNode = doc.getElementsByTagName("transp")[0];
      const protNode = doc.getElementsByTagName("protNFe")[0] || doc.getElementsByTagName("infProt")[0];
      const infAdic = doc.getElementsByTagName("infAdic")[0];
      const eText = (node, tag) => { try { return node?.getElementsByTagName?.(tag)?.[0]?.textContent?.trim() || ""; } catch(_) { return ""; } };

      const danfeData = {
        // Emitente
        emitNome: emit,
        emitCnpj: cnpjEmit,
        emitIE: eText(emitNode, "IE"),
        emitIM: eText(emitNode, "IM"),
        emitEndereco: eText(emitEndereco, "xLgr") + (eText(emitEndereco, "nro") ? ", " + eText(emitEndereco, "nro") : ""),
        emitBairro: eText(emitEndereco, "xBairro"),
        emitCep: eText(emitEndereco, "CEP"),
        emitMunicipio: eText(emitEndereco, "xMun"),
        emitUf: eText(emitEndereco, "UF"),
        emitFone: eText(emitEndereco, "fone"),
        // Destinatario
        destNome: eText(destNode, "xNome"),
        destCnpj: eText(destNode, "CNPJ") || eText(destNode, "CPF"),
        destIE: eText(destNode, "IE"),
        destEndereco: eText(destEndereco, "xLgr") + (eText(destEndereco, "nro") ? ", " + eText(destEndereco, "nro") : ""),
        destBairro: eText(destEndereco, "xBairro"),
        destCep: eText(destEndereco, "CEP"),
        destMunicipio: eText(destEndereco, "xMun"),
        destUf: eText(destEndereco, "UF"),
        destFone: eText(destEndereco, "fone"),
        // NF
        natOp: text("natOp"),
        serie: text("serie"),
        nNF,
        dhEmi,
        dhSaiEnt: text("dhSaiEnt") || text("dSaiEnt") || "",
        hSaiEnt: text("hSaiEnt") || "",
        tpNF: text("tpNF"), // 0=entrada, 1=saida
        chave,
        nProt: eText(protNode, "nProt") || text("nProt"),
        dhRecbto: eText(protNode, "dhRecbto") || "",
        // Impostos
        vBC: eText(icmsTotal, "vBC"),
        vICMS: eText(icmsTotal, "vICMS"),
        vBCST: eText(icmsTotal, "vBCST"),
        vST: eText(icmsTotal, "vST"),
        vImp: eText(icmsTotal, "vImp") || "",
        vProd: eText(icmsTotal, "vProd"),
        vFrete: eText(icmsTotal, "vFrete"),
        vSeg: eText(icmsTotal, "vSeg"),
        vDesc: eText(icmsTotal, "vDesc"),
        vOutro: eText(icmsTotal, "vOutro"),
        vIPI: eText(icmsTotal, "vIPI"),
        vNF: String(vNF),
        vTotTrib: eText(icmsTotal, "vTotTrib"),
        vICMSUFDest: eText(icmsTotal, "vICMSUFDest"),
        vICMSUFRemet: eText(icmsTotal, "vICMSUFRemet"),
        vFCPUFDest: eText(icmsTotal, "vFCPUFDest"),
        // Transporte
        modFrete: eText(transpNode, "modFrete"),
        transpNome: eText(transpNode, "xNome"),
        // Info adicional
        infCpl: eText(infAdic, "infCpl"),
        infAdFisco: eText(infAdic, "infAdFisco"),
      };

      // Extract per-item tax data
      itensNF.forEach((item, i) => {
        const det = detNodes[i];
        if (!det) return;
        const icmsNode = det.getElementsByTagName("ICMS")[0];
        const icmsInner = icmsNode ? icmsNode.children[0] : null;
        item.orig = icmsInner ? eText(icmsInner, "orig") : "";
        item.cst = icmsInner ? (eText(icmsInner, "CST") || eText(icmsInner, "CSOSN")) : "";
        item.vBC_item = icmsInner ? eText(icmsInner, "vBC") : "";
        item.pICMS = icmsInner ? eText(icmsInner, "pICMS") : "";
        item.vICMS_item = icmsInner ? eText(icmsInner, "vICMS") : "";
        item.vIPI_item = eText(det.getElementsByTagName("IPI")[0] || {}, "vIPI") || "";
      });

      notasEntrada.unshift({
        id: genId("NE"),
        fornecedor: emit,
        cnpjEmitente: cnpjEmit,
        numero: nNF,
        chave,
        valor: vNF,
        status: "registrada",
        origem: "xml",
        emitidaEm: dhEmi,
        itens: itensNF,
        totalItens: itensNF.length,
        danfe: danfeData,
        xmlRaw: xml,
        createdAt: new Date().toISOString(),
        audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
      });
      saveNotasEntrada();

      // Bridge 1: NF Entrada → Custo real (XML import)
      (function() {
        var notaEntrada = notasEntrada[0]; // just unshifted
        var matchedForSb = []; // Story 6.2
        if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
          (notaEntrada.itens || []).forEach(function(item) {
            var bp = bancoPrecos.itens.find(function(b) {
              return (item.ncm && b.ncm === item.ncm && normalizedText(b.item).includes(normalizedText(item.descricao).split(' ')[0])) ||
                     normalizedText(b.item) === normalizedText(item.descricao);
            });
            if (bp) {
              bp.custoBase = item.precoUnitario || item.valorUnitario;
              if (!bp.custosFornecedor) bp.custosFornecedor = [];
              bp.custosFornecedor.push({ fornecedor: notaEntrada.fornecedor || 'NF Entrada', preco: bp.custoBase, data: new Date().toISOString().slice(0,10), tipo: 'nf_entrada' });
              bp.precoReferencia = bp.custoBase * (1 + (bp.margemPadrao || 0.30));
              matchedForSb.push({ sku: bp.sku, valorUnitario: bp.custoBase, ncm: item.ncm, descricao: item.descricao });
              showToast("✅ Custo atualizado: " + bp.item + " → R$ " + bp.custoBase.toFixed(2) + " (NF XML #" + notaEntrada.numero + ")", 4000);
            } else {
              showToast("⚠️ Item NF sem match: " + (item.descricao || '?') + " (NCM: " + (item.ncm || '?') + ")", 4000);
            }
          });
          saveBancoLocal();
          // Story 6.2: Persistir em Supabase preco_historico
          if (matchedForSb.length > 0) {
            _SB_PRECO_HIST.insert(_SB_PRECO_HIST.buildNfEntradaRows(notaEntrada, matchedForSb));
          }
        }
      })();

      renderNotasEntrada();
      showToast("XML de nota de entrada importado.", 3000);
    } catch (err) {
      showToast("Falha ao importar XML: " + err.message, 4500);
    }
  };
  reader.readAsText(file);
}

async function consultarNotasEntradaApi() {
  const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const cnpj = String(empresa.cnpj || "").replace(/\D/g, "");
  if (!cnpj) { showToast("CNPJ da empresa não configurado.", 3500); return; }

  showToast("Consultando SEFAZ... Buscando NFs de entrada.", 3000);

  // Consulta direta via caixa-proxy → SEFAZ DistribuicaoDFe
  const PROXY = "/api/caixa-proxy";
  const nsuKey = "radar.sefaz.ultNSU";
  const ultNSU = localStorage.getItem(nsuKey) || "0";

  try {
    let allDocs = [];
    let currentNSU = Number(ultNSU);
    let maxNSU = 0;
    let tentativas = 0;

    do {
      tentativas++;
      const resp = await fetch(PROXY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sefaz-dist-dfe", cnpj, ultNSU: currentNSU })
      });
      const data = await resp.json();

      if (!resp.ok) {
        if (data.error?.includes("NFE_CERT_BASE64")) {
          showToast("Certificado A1 não configurado no servidor. Configure NFE_CERT_BASE64 nas variáveis de ambiente.", 6000);
          return;
        }
        throw new Error(data.error || "Erro na consulta SEFAZ");
      }

      if (data.cStat === "656") {
        showToast("SEFAZ: rate limit ativo. Tente novamente em 1 hora.", 4000);
        return;
      }

      if (data.cStat === "137") {
        showToast("Nenhum documento novo na SEFAZ.", 3000);
        break;
      }

      const docs = data.documentos || [];
      allDocs.push(...docs);
      maxNSU = data.maxNSU || 0;
      currentNSU = data.ultNSU || currentNSU;

      if (currentNSU >= maxNSU || docs.length === 0 || tentativas > 10) break;
    } while (true);

    // Salvar NSU pra próxima consulta
    localStorage.setItem(nsuKey, String(currentNSU));

    // Processar documentos encontrados
    let importados = 0;
    for (const doc of allDocs) {
      const chave = doc.chave || "";
      const jaExiste = notasEntrada.some(ne => ne.chave === chave && chave);
      if (!jaExiste && (doc.nNF || doc.chave)) {
        notasEntrada.unshift({
          id: genId("NE"),
          fornecedor: doc.fornecedor || "Fornecedor",
          numero: doc.nNF || "",
          chave: chave,
          valor: Number(doc.valor || 0),
          status: "baixada_automatica",
          origem: "api_sefaz",
          emitidaEm: doc.emitidaEm || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          cnpjEmitente: doc.cnpjEmitente || "",
          itens: doc.itens || []
        });
        importados++;
      }
    }

    saveNotasEntrada();

    // Bridge 1: NF Entrada → Custo real
    var allMatchedForSb = []; // Story 6.2
    if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
      for (const ne of allDocs) {
        (ne.itens || []).forEach(function(itemNe) {
          var bp = bancoPrecos.itens.find(function(b) {
            return (itemNe.ncm && b.ncm === itemNe.ncm && normalizedText(b.item).includes(normalizedText(itemNe.descricao).split(' ')[0])) ||
                   normalizedText(b.item) === normalizedText(itemNe.descricao);
          });
          if (bp) {
            bp.custoBase = itemNe.valorUnitario || itemNe.precoUnitario;
            if (!bp.custosFornecedor) bp.custosFornecedor = [];
            bp.custosFornecedor.push({ fornecedor: ne.fornecedor || 'NF Entrada', preco: bp.custoBase, data: new Date().toISOString().slice(0,10), tipo: 'nf_entrada' });
            bp.precoReferencia = bp.custoBase * (1 + (bp.margemPadrao || 0.30));
            allMatchedForSb.push({ sku: bp.sku, valorUnitario: bp.custoBase, ncm: itemNe.ncm, descricao: itemNe.descricao, _ne: ne });
          }
        });
      }
      saveBancoLocal();
      // Story 6.2: Persistir em Supabase preco_historico
      if (allMatchedForSb.length > 0) {
        const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
        const rows = allMatchedForSb.map(m => ({
          empresa_id: empId, sku: m.sku || '', tipo: 'nf_entrada',
          valor: m.valorUnitario, custo_base: m.valorUnitario, fonte: 'nf_entrada',
          metadata: { fornecedor: m._ne?.fornecedor || '', nf_numero: m._ne?.numero || '', ncm: m.ncm || '', descricao: m.descricao || '' }
        }));
        _SB_PRECO_HIST.insert(rows);
      }
    }

    renderNotasEntrada();

    // Gerar PDF com resumo das notas baixadas
    if (importados > 0 && typeof jspdf !== 'undefined') {
      try {
        const { jsPDF } = jspdf;
        const pdf = new jsPDF();
        const hoje = new Date().toLocaleDateString("pt-BR");
        pdf.setFontSize(14);
        pdf.text("Notas de Entrada — Consulta SEFAZ", 14, 18);
        pdf.setFontSize(9);
        pdf.setTextColor(120);
        pdf.text(`Gerado em ${hoje} | ${importados} nota(s) importada(s)`, 14, 25);
        pdf.setTextColor(0);
        const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
        const tableRows = allDocs.map(d => [
          (d.emitidaEm || "").slice(0, 10).split("-").reverse().join("/"),
          (d.fornecedor || "").substring(0, 35),
          d.nNF || d.numero || "",
          (d.chave || "").substring(0, 20) + "...",
          brl.format(d.valor || 0)
        ]);
        const totalVal = allDocs.reduce((s, d) => s + (d.valor || 0), 0);
        tableRows.push(["", "", "", "TOTAL", brl.format(totalVal)]);
        pdf.autoTable({
          startY: 30,
          head: [["Emissão", "Fornecedor", "Número", "Chave", "Valor"]],
          body: tableRows,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [30, 41, 59], textColor: [241, 245, 249] },
          columnStyles: { 4: { halign: "right" } }
        });
        pdf.save(`notas-entrada-sefaz-${new Date().toISOString().slice(0,10)}.pdf`);
      } catch (pdfErr) {
        gdpWarn("[NE] PDF generation failed:", pdfErr);
      }
    }

    showToast(importados > 0 ? `${importados} nota(s) de entrada importada(s) da SEFAZ.` : "Nenhuma nota nova encontrada.", 4000);
  } catch (err) {
    showToast("Erro na consulta SEFAZ: " + err.message, 5000);
  }
}

// [gdp-estoque-intel.js loaded above — Stock Intelligence render functions]
// ===== EXPORT CSV =====
function exportItensCSV() {
  const rows = [["Escola","Item","Unidade","Contratado","Entregue","Saldo","Preco","Valor Saldo"]];
  contratos.forEach(c => {
    c.itens.forEach(i => {
      const saldo = i.qtdContratada - i.qtdEntregue;
      rows.push([
        `"${c.escola}"`, `"${i.descricao}"`, `"${i.unidade}"`,
        i.qtdContratada, i.qtdEntregue, saldo,
        i.precoUnitario.toFixed(2).replace(".", ","),
        (saldo * i.precoUnitario).toFixed(2).replace(".", ",")
      ]);
    });
  });
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gdp-contratos-itens-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exportado!");
}

// ===== KPIs =====
function renderKPIs() {
  const ativos = contratos.filter(c => c.status === "ativo");
  const totalItens = ativos.reduce((s, c) => s + (Array.isArray(c.itens) ? c.itens.length : 0), 0);
  const totalValor = ativos.reduce((s, c) => s + ((parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s2, i) => s2 + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0)), 0);
  const pendentes = ativos.reduce((s, c) => s + c.itens.filter(i => i.qtdEntregue < i.qtdContratada).length, 0);

  // Story 4.51 AC-H1/H2: Card 1 = Clientes Ativos (unique), Card 2 = Contratos Ativos
  const clientesUnicos = new Set(ativos.map(c => (c.escola || c.cliente?.nome || c.id).toLowerCase().trim()));
  document.getElementById("kpi-contratos").textContent = clientesUnicos.size;
  document.getElementById("kpi-itens").textContent = ativos.length;
  document.getElementById("kpi-valor").textContent = brl.format(totalValor);
  document.getElementById("kpi-pendentes").textContent = pendentes;
  document.getElementById("tab-count-contratos").textContent = contratos.length;
  const itensCountEl = document.getElementById("tab-count-itens");
  if (itensCountEl) itensCountEl.textContent = contratos.reduce((s, c) => s + (c.itens ? c.itens.length : 0), 0);
  document.getElementById("tab-count-pedidos").textContent = pedidos.length;
  const nfCountEl = document.getElementById("tab-count-notas-fiscais");
  if (nfCountEl) nfCountEl.textContent = notasFiscais.length;
  const cpCountEl = document.getElementById("tab-count-contas-pagar");
  if (cpCountEl) cpCountEl.textContent = contasPagar.length;
  const crCountEl = document.getElementById("tab-count-contas-receber");
  if (crCountEl) crCountEl.textContent = contasReceber.length;
  const caixaCountEl = document.getElementById("tab-count-caixa");
  if (caixaCountEl) caixaCountEl.textContent = caixaExtratoMovimentos.length;
  const relCountEl = document.getElementById("tab-count-relatorios");
  if (relCountEl) relCountEl.textContent = 3;
  const neCountEl = document.getElementById("tab-count-notas-entrada");
  if (neCountEl) neCountEl.textContent = notasEntrada.length;
  const estoqueCountEl = document.getElementById("tab-count-estoque");
  if (estoqueCountEl) estoqueCountEl.textContent = [...new Set(estoqueMovimentos.map((mov) => mov.sku || mov.descricao))].filter(Boolean).length;
  document.getElementById("tab-count-usuarios").textContent = usuarios.length;
}

// ===== RENDER ALL (Story 12.1 AC1 — debounced + selective) =====
let _renderAllRaf = null;

function renderAll() {
  if (_renderAllRaf) cancelAnimationFrame(_renderAllRaf);
  _renderAllRaf = requestAnimationFrame(_renderAllImmediate);
}

function _renderAllImmediate() {
  _renderAllRaf = null;
  loadBancoProdutos();
  renderGdpSyncIndicator();
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  renderKPIs();

  // Selective render: only the active tab
  const activeBtn = document.querySelector('.sidebar-subitem.active[data-gdp-tab]');
  const activeTab = activeBtn ? activeBtn.dataset.gdpTab : 'contratos';

  switch (activeTab) {
    case 'contratos': renderContratos(); break;
    case 'pedidos': renderPedidos(); break;
    case 'notas-fiscais': renderNotasFiscais(); break;
    case 'financeiro':
    case 'contas-pagar': renderContasPagar(); break;
    case 'contas-receber': renderContasReceber(); break;
    case 'caixa': renderCaixa(); break;
    case 'relatorios': renderRelatorios(); break;
    case 'estoque':
    case 'fornecedores':
    case 'notas-entrada':
    case 'estoque-op': renderEstoque(); break;
    case 'usuarios': renderUsuarios(); break;
    default: renderContratos(); break;
  }

  // Update banco tab count even when not on banco tab
  const bpCount = document.getElementById("tab-count-banco-produtos");
  if (bpCount) bpCount.textContent = bancoProdutos.itens.length;
}

// ===== VINCULAR PRODUTO GDP (Story 4.43) =====
let _vincularGdpContratoId = "";
let _vincularGdpItemIdx = -1;
let _vincularGdpDescricao = "";

function abrirVincularGDP(contratoId, itemIdx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  _vincularGdpContratoId = contratoId;
  _vincularGdpItemIdx = itemIdx;
  _vincularGdpDescricao = c.itens[itemIdx].descricao;
  document.getElementById("vincular-gdp-desc").textContent = _vincularGdpDescricao.slice(0, 80) + (_vincularGdpDescricao.length > 80 ? "..." : "");
  // Se já tem vínculo, mostrar produto atual — priorizar item.skuVinculado (mesmo chain da tabela)
  const _item = c.itens[itemIdx];
  const equivSku = _item.skuVinculado || getGdpEquivalencia(_vincularGdpDescricao);
  const prodVinculado = equivSku ? estoqueIntelProdutos.find(p => p.sku === equivSku || p.id === equivSku) : null;
  const descEl = document.getElementById("vincular-gdp-desc");
  if (descEl) {
    let descText = _vincularGdpDescricao.slice(0, 80);
    if (prodVinculado) descText += ' → Vinculado a: ' + prodVinculado.nome + ' (' + (prodVinculado.sku || '') + ')';
    descEl.textContent = descText;
  }
  const buscaEl = document.getElementById("vincular-gdp-busca");
  if (buscaEl) buscaEl.value = prodVinculado ? prodVinculado.nome : "";
  renderVincularGDPResultados(prodVinculado ? prodVinculado.nome : "");
  // (Formulário de cadastro rápido removido — agora usa o form padrão da central de produtos)
  const modal = document.getElementById("modal-vincular-gdp");
  if (modal) { modal.classList.remove("hidden"); modal.style.display = "flex"; }
}

function fecharVincularGDP() {
  const modal = document.getElementById("modal-vincular-gdp");
  if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
  _vincularGdpContratoId = "";
  _vincularGdpItemIdx = -1;
  _vincularGdpDescricao = "";
}

// Resumir descrição do contrato — moderado, mantém identidade do produto
// Ex: "Açucar refinado especial tipo exportação pacote 5 kg marca Delta" → "Açucar refinado 5 kg - Delta"
// Ex: "Biscoito doce (rosquinha tradicional de coco) 500 gr" → "Biscoito doce rosquinha coco 500 gr"
function gdpResumirDescricao(desc) {
  if (!desc) return "";
  // Remover parênteses mas manter conteúdo
  let clean = desc.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  // Extrair peso/volume
  const pesoMatch = clean.match(/(\d+[.,]?\d*)\s*(kg|kgs|gr|grs|g|ml|lt|l|litro|litros)\b/i);
  const peso = pesoMatch ? pesoMatch[0].trim() : "";
  // Extrair marca (após " - " ou " – ")
  const marcaMatch = clean.match(/[-–]\s*(.+)$/);
  const marca = marcaMatch ? marcaMatch[1].trim() : "";
  // Remover peso e marca da string para processar o nome
  let nome = clean;
  if (marcaMatch) nome = nome.replace(marcaMatch[0], "");
  if (pesoMatch) nome = nome.replace(pesoMatch[0], "");
  // Apenas remover palavras muito genéricas
  const stopWords = new Set(["tipo","especial","pacote","embalagem","saco","marca","para","com"]);
  const words = nome.split(/[\s,]+/).filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));
  const nomeResumo = words.slice(0, 4).join(" ");
  // Remontar: nome + peso + marca
  const parts = [nomeResumo];
  if (peso) parts.push(peso);
  if (marca) parts.push("- " + marca);
  return parts.join(" ").replace(/\s+/g, " ").trim() || desc.slice(0, 50);
}

function gdpGerarSkuSugerido(nome) {
  return gdpNormalizedText(nome)
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 1)
    .slice(0, 3)
    .map(t => t.slice(0, 4).toUpperCase())
    .join("-") || ("SKU-" + Date.now().toString(36).slice(-4).toUpperCase());
}

function renderVincularGDPResultados(query) {
  const el = document.getElementById("vincular-gdp-resultados");
  if (!el) return;
  const allProds = estoqueIntelProdutos.map(p => {
    const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === p.id);
    const embsDesc = embs.map(e => {
      const qtd = e.quantidade_base || 1;
      const desc = e.descricao || (qtd + " " + (p.unidade_base || "UN"));
      const preco = e.preco_referencia ? " " + brl.format(e.preco_referencia) : "";
      return desc + preco;
    }).join(" | ") || "Sem embalagem";
    const custoBase = embs.length ? embs[0].preco_referencia || 0 : 0;
    return { id: p.id, nome: p.nome, sku: p.sku || "", base: p.unidade_base || "UN", categoria: p.categoria || "", embs: embsDesc, custoBase };
  });

  if (allProds.length === 0) {
    el.innerHTML = '<div style="padding:1rem;color:var(--mut);text-align:center">Nenhum produto cadastrado. Cadastre em Inteligencia > Produtos.</div>';
    return;
  }
  const q = gdpNormalizedText(query || _vincularGdpDescricao || "");
  let filtrados = allProds;
  if (q) filtrados = allProds.filter(p => gdpNormalizedText(p.nome).includes(q) || gdpNormalizedText(p.sku).includes(q) || gdpNormalizedText(p.categoria).includes(q) || gdpNormalizedText(p.embs).includes(q));
  filtrados = filtrados.slice(0, 50);
  if (filtrados.length === 0) {
    el.innerHTML = '<div style="padding:1rem;color:var(--mut);text-align:center">Nenhum produto encontrado para "' + esc(query) + '".</div>';
    return;
  }
  const equivSkuAtual = getGdpEquivalencia(_vincularGdpDescricao);
  el.innerHTML = '<table style="font-size:.82rem;width:100%"><thead><tr><th></th><th>Produto</th><th>Base</th><th>Embalagens</th><th>SKU</th><th></th></tr></thead><tbody>' +
    filtrados.map(p => {
      const isVinculado = equivSkuAtual && (p.sku === equivSkuAtual || p.id === equivSkuAtual);
      return `<tr style="${isVinculado ? 'background:rgba(34,197,94,.1)' : ''}">
      <td style="text-align:center;font-size:.9rem">${isVinculado ? '✅' : ''}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${isVinculado ? ';font-weight:700;color:var(--green)' : ''}" title="${esc(p.nome)}">${esc(p.nome.slice(0, 35))}</td>
      <td><span class="badge badge-blue" style="font-size:.65rem">${esc(p.base)}</span></td>
      <td style="font-size:.72rem;color:var(--mut);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.embs)}">${esc(p.embs.slice(0, 45))}</td>
      <td class="font-mono" style="font-size:.7rem">${esc(p.sku || "-")}</td>
      <td class="text-center">${isVinculado ? '<span style="font-size:.72rem;color:var(--green);font-weight:700">Atual</span>' : '<button class="btn btn-sm btn-green" style="font-size:.72rem;padding:.15rem .4rem" onclick="selecionarVincularGDPIntel(\'' + esc(p.id) + '\')">Vincular</button>'}</td>
    </tr>`}).join("") + '</tbody></table>';
}

// Abrir formulário padrão de cadastro de produto (central de preços) via modal de vincular
// Fecha o modal de vincular, abre o form completo, e após salvar auto-vincula
var _vincularPendente = null;
function abrirCadastroProdutoViaVincular() {
  _vincularPendente = { contratoId: _vincularGdpContratoId, itemIdx: _vincularGdpItemIdx, descricao: _vincularGdpDescricao };
  fecharVincularGDP();

  // Criar overlay flutuante sobre o contrato (não muda de aba)
  let overlay = document.getElementById('vincular-cadastro-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'vincular-cadastro-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1100;display:flex;align-items:flex-start;justify-content:center;padding:1.5rem;overflow-y:auto';
  overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); _vincularPendente = null; } };

  // Reutilizar renderModalNovoProduto internamente
  _novoProdutoEmbs = [{ id: 'temp-0', descricao: '', quantidade_base: 1, preco_referencia: 0 }];

  const UNIT_OPTS = '<optgroup label="Contagem"><option value="UN" selected>UN</option><option value="DZ">DZ</option></optgroup><optgroup label="Embalagem"><option value="CX">CX</option><option value="PCT">PCT</option><option value="FD">FD</option><option value="BD">BD</option><option value="SC">SC</option></optgroup><optgroup label="Peso/Volume"><option value="KG">KG</option><option value="LT">LT</option><option value="GL">GL</option></optgroup>';
  const CAT_OPTS = ["","Hortifruti","Carnes/Proteinas","Graos/Cereais","Laticinios","Frutas","Mercearia","Padaria/Biscoitos","Ovos","Bebidas","Limpeza","Outros",..._loadCategoriasCustom()].map(c => '<option value="'+c+'">'+(c||"Sem Categoria")+'</option>').join("");
  const ORI_OPTS = [{v:"0",l:"0 — Nacional"},{v:"1",l:"1 — Import. Direta"},{v:"2",l:"2 — Import. Merc."}].map(o => '<option value="'+o.v+'">'+o.l+'</option>').join("");
  const nomeResumido = gdpResumirDescricao(_vincularPendente.descricao) || _vincularPendente.descricao || '';

  overlay.innerHTML = '<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:10px;width:560px;max-width:96vw;max-height:88vh;overflow-y:auto;padding:1.2rem 1.5rem" onclick="event.stopPropagation()">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><h2 style="font-size:1rem;margin:0">Cadastrar Produto</h2><button class="btn btn-outline btn-sm" onclick="document.getElementById(\'vincular-cadastro-overlay\').remove()">Fechar</button></div>'
    + '<div style="font-size:.78rem;color:var(--mut);margin-bottom:.8rem">Item do contrato: <strong>' + esc(_vincularPendente.descricao || '') + '</strong></div>'
    + '<div style="margin-bottom:.6rem"><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Nome do Produto</label><input type="text" id="vc-nome" value="' + esc(nomeResumido) + '" style="width:100%"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.6rem">'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Unidade</label><select id="vc-unidade" style="width:100%">' + UNIT_OPTS + '</select></div>'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">SKU</label><input type="text" id="vc-sku" placeholder="Auto (LICT-XXXX)" style="width:100%"></div></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.6rem">'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">NCM</label><input type="text" id="vc-ncm" placeholder="Ex: 10063021" style="width:100%"></div>'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Categoria</label><select id="vc-categoria" style="width:100%">' + CAT_OPTS + '</select></div></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:.6rem">'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Origem</label><select id="vc-origem" style="width:100%">' + ORI_OPTS + '</select></div>'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Preco Custo</label><input type="number" id="vc-custo" step="0.01" min="0" placeholder="0.00" style="width:100%"></div>'
    + '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Preco Venda</label><input type="number" id="vc-venda" step="0.01" min="0" placeholder="0.00" style="width:100%"></div></div>'
    + '<button class="btn btn-green" onclick="salvarProdutoViaVincular()" style="width:100%;font-weight:700;margin-top:.5rem">Salvar e Vincular ao Contrato</button>'
    + '</div>';

  document.body.appendChild(overlay);
  setTimeout(function() { document.getElementById('vc-nome')?.focus(); }, 100);
}

function salvarProdutoViaVincular() {
  const nome = (document.getElementById('vc-nome')?.value || '').trim();
  if (!nome) { showToast('Informe o nome do produto.', 3000); return; }
  const unidade_base = document.getElementById('vc-unidade')?.value || 'UN';
  const skuManual = (document.getElementById('vc-sku')?.value || '').trim();
  const sku = skuManual || (typeof gerarProximoSKU === 'function' ? gerarProximoSKU() : 'LICT-0000');
  const ncm = (document.getElementById('vc-ncm')?.value || '').trim();
  const categoria = document.getElementById('vc-categoria')?.value || '';
  const origem = document.getElementById('vc-origem')?.value || '0';
  const preco_custo = parseFloat(document.getElementById('vc-custo')?.value) || 0;
  const preco_referencia = parseFloat(document.getElementById('vc-venda')?.value) || 0;
  const prodId = genId('PROD');
  estoqueIntelProdutos.push({ id: prodId, nome, unidade_base, sku, ncm, categoria, origem, preco_custo, preco_referencia });
  saveEstoqueIntelProdutos();
  // Fechar overlay
  const overlay = document.getElementById('vincular-cadastro-overlay');
  if (overlay) overlay.remove();
  // Auto-vincular
  if (_vincularPendente && _vincularPendente.contratoId) {
    _vincularGdpContratoId = _vincularPendente.contratoId;
    _vincularGdpItemIdx = _vincularPendente.itemIdx;
    _vincularGdpDescricao = _vincularPendente.descricao;
    selecionarVincularGDPIntel(prodId);
    showToast('Produto "' + nome + '" cadastrado e vinculado! SKU: ' + sku, 3500);
  }
  _vincularPendente = null;
}

function selecionarVincularGDPIntel(produtoId) {
  const produto = estoqueIntelProdutos.find(p => p.id === produtoId);
  if (!produto) { showToast("Produto nao encontrado.", 3000); return; }
  const sku = produto.sku || produtoId;
  const descSave = _vincularGdpDescricao;
  if (!descSave) { showToast("Descricao do item nao encontrada.", 3000); return; }
  setGdpEquivalencia(descSave, sku);
  // FR-005: Salvar vínculo manual no item do contrato (produto_vinculado_id pattern)
  if (_vincularGdpContratoId && _vincularGdpItemIdx >= 0) {
    const c = contratos.find(x => x.id === _vincularGdpContratoId);
    if (c && c.itens[_vincularGdpItemIdx]) {
      c.itens[_vincularGdpItemIdx].skuVinculado = sku;
      c.itens[_vincularGdpItemIdx].sku = sku;
      c.itens[_vincularGdpItemIdx].produtoVinculado = produto.nome;
      c.itens[_vincularGdpItemIdx].produto_vinculado_id = produtoId;
      syncContratoItemToPedidos(c.id, c.itens[_vincularGdpItemIdx]);
      saveContratos();
    }
  }
  const cId = _vincularGdpContratoId;
  fecharVincularGDP();
  showToast('Vinculado: "' + descSave.slice(0, 40) + '" -> ' + produto.nome + ' (' + sku + ')');
  if (cId) abrirContrato(cId);
}

function selecionarVincularGDP(bpId) {
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco;
  try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  const bp = banco?.itens?.find(i => i.id === bpId);
  if (!bp) return;
  if (!bp.sku) {
    bp.sku = gdpGerarSkuSugerido(bp.nomeComercial || bp.item);
    localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  }
  const descSave = _vincularGdpDescricao;
  const contratoSave = _vincularGdpContratoId;
  setGdpEquivalencia(descSave, bp.sku);
  // Add to bp equivalencias array for cross-module sync
  if (!bp.equivalencias) bp.equivalencias = [];
  const normDesc = gdpNormalizedText(descSave);
  if (!bp.equivalencias.some(e => gdpNormalizedText(e) === normDesc)) {
    bp.equivalencias.push(descSave);
    localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  }
  // Persist manual link directly on contract item (prevents auto-enrichment override)
  if (contratoSave && _vincularGdpItemIdx >= 0) {
    const ctr = contratos.find(x => x.id === contratoSave);
    if (ctr && ctr.itens[_vincularGdpItemIdx]) {
      ctr.itens[_vincularGdpItemIdx].skuVinculado = bp.sku;
      ctr.itens[_vincularGdpItemIdx].sku = bp.sku;
      ctr.itens[_vincularGdpItemIdx].produtoVinculado = bp.nomeComercial || bp.item;
      syncContratoItemToPedidos(ctr.id, ctr.itens[_vincularGdpItemIdx]);
      saveContratos();
    }
  }
  fecharVincularGDP();
  showToast('Vinculado: "' + descSave.slice(0, 40) + '..." -> "' + (bp.nomeComercial || bp.item) + '"');
  abrirContrato(contratoSave);
}

function criarEVincularGDP() {
  const nomeComercial = (document.getElementById("vincular-gdp-criar-nome")?.value || "").trim();
  if (!nomeComercial) { showToast("Nome comercial e obrigatorio."); return; }
  let sku = (document.getElementById("vincular-gdp-criar-sku")?.value || "").trim();
  if (!sku) sku = gdpGerarSkuSugerido(nomeComercial);
  const unidade = document.getElementById("vincular-gdp-criar-unidade")?.value || "UN";
  const custo = parseFloat(document.getElementById("vincular-gdp-criar-custo")?.value) || 0;

  // FR-019: Criar na Central de Produtos (fonte de verdade)
  const novoProduto = typeof criarProdutoRapido === 'function'
    ? criarProdutoRapido({ nome: nomeComercial, sku: sku, unidade: unidade, ncm: '' })
    : null;
  const produtoSku = novoProduto ? (novoProduto.sku || sku) : sku;
  const produtoId = novoProduto ? novoProduto.id : null;

  // Legacy: also save to banco de precos for backwards compat
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco;
  try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  if (!banco || !Array.isArray(banco.itens)) banco = { updatedAt: "", itens: [] };
  if (!banco.itens.some(bp => bp.sku === produtoSku)) {
    banco.itens.push({
      id: "bp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
      item: nomeComercial, nomeComercial, sku: produtoSku,
      marca: "", grupo: "Material de Consumo Geral",
      unidade, unidadeCompra: unidade,
      custoBase: custo, margemPadrao: 0.30,
      precoReferencia: custo > 0 ? Math.round(custo * 1.30 * 100) / 100 : 0,
      ultimaCotacao: new Date().toISOString().slice(0, 10),
      fonte: "", fornecedorPadrao: "",
      custo, propostas: [], concorrentes: [],
      custosFornecedor: [],
      equivalencias: [_vincularGdpDescricao]
    });
    localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  }

  const descSave = _vincularGdpDescricao;
  const contratoSave = _vincularGdpContratoId;
  setGdpEquivalencia(descSave, produtoSku);
  // FR-005: Persist manual link directly on contract item (produto_vinculado_id pattern)
  if (contratoSave && _vincularGdpItemIdx >= 0) {
    const ctr = contratos.find(x => x.id === contratoSave);
    if (ctr && ctr.itens[_vincularGdpItemIdx]) {
      ctr.itens[_vincularGdpItemIdx].skuVinculado = produtoSku;
      ctr.itens[_vincularGdpItemIdx].sku = produtoSku;
      ctr.itens[_vincularGdpItemIdx].produtoVinculado = nomeComercial;
      if (produtoId) ctr.itens[_vincularGdpItemIdx].produto_vinculado_id = produtoId;
      syncContratoItemToPedidos(ctr.id, ctr.itens[_vincularGdpItemIdx]);
      saveContratos();
    }
  }
  fecharVincularGDP();
  showToast('Produto "' + nomeComercial + '" criado e vinculado.');
  abrirContrato(contratoSave);
}

// ===== FR-008: Demanda REMOVIDA — Pedido é a unidade central =====
// Funções abaixo mantidas como stubs para evitar erros de referência.
function gdpConverterDemanda(pedidoItens) {
  return pedidoItens.map(item => {
    const desc = item.descricao || item.nome || "";
    const equiv = getGdpEquivalencia(desc);
    if (!equiv) return { ...item, status: "sem_vinculo", produtoReal: null, qtdConvertida: 0, custoEstimado: 0 };
    const produto = getGdpBancoProduto(equiv);
    const fator = gdpConversoes[gdpNormalizedText(desc)]?.fator || 1;
    const qtdConvertida = Math.ceil((item.qtd || item.quantidade || 0) / fator);
    const custo = produto ? (produto.custoBase || produto.custo || 0) * qtdConvertida : 0;
    return {
      ...item, status: "convertido",
      produtoReal: produto ? (produto.nomeComercial || produto.item) : equiv,
      skuProduto: equiv,
      qtdOriginal: item.qtd || item.quantidade || 0,
      unidadeOriginal: item.unidade || "UN",
      qtdConvertida,
      unidadeCompra: produto?.unidade || produto?.unidadeCompra || "UN",
      fatorConversao: fator,
      custoUnitario: produto?.custoBase || produto?.custo || 0,
      custoEstimado: Math.round(custo * 100) / 100,
    };
  });
}

function gdpGerarDemandaPedido(pedidoId) {
  const pedido = pedidos.find(p => p.id === pedidoId);
  if (!pedido) return;
  // Check if demanda already exists for this pedido
  if (gdpDemandas.some(d => d.pedidoId === pedidoId)) {
    showToast("Demanda ja existe para este pedido.");
    return;
  }
  const itensConvertidos = gdpConverterDemanda(pedido.itens || []);
  const semVinculo = itensConvertidos.filter(i => i.status === "sem_vinculo").length;
  const demanda = {
    id: "dem-" + Date.now().toString(36),
    pedidoId: pedidoId,
    escola: pedido.escola || pedido.cliente?.nome || "",
    contratoId: pedido.contratoId || "",
    status: "rascunho",
    criadoEm: new Date().toISOString().slice(0, 10),
    itens: itensConvertidos,
    totalEstimado: itensConvertidos.reduce((s, i) => s + (i.custoEstimado || 0), 0),
  };
  gdpDemandas.push(demanda);
  saveGdpDemandas();
  if (semVinculo > 0) {
    showToast("Demanda criada: " + itensConvertidos.length + " itens (" + semVinculo + " sem vinculo - vincule no contrato)");
  } else {
    showToast("Demanda criada: " + itensConvertidos.length + " itens convertidos - " + brl.format(demanda.totalEstimado));
  }
  fecharPedidoDetalhe();
}

function gdpVerDemanda(demandaId) {
  const d = gdpDemandas.find(x => x.id === demandaId);
  if (!d) return;
  let msg = "Demanda " + d.id + " - " + d.escola + "\n\n";
  d.itens.forEach((item, i) => {
    if (item.status === "convertido") {
      msg += (i + 1) + ". " + (item.descricao || item.nome) + " -> " + item.produtoReal + "\n   " + item.qtdOriginal + " " + item.unidadeOriginal + " -> " + item.qtdConvertida + " " + item.unidadeCompra + " (fator: " + item.fatorConversao + ")\n   Custo: " + brl.format(item.custoEstimado) + "\n\n";
    } else {
      msg += (i + 1) + ". [SEM VINCULO] " + (item.descricao || item.nome) + "\n\n";
    }
  });
  msg += "Total estimado: " + brl.format(d.totalEstimado);
  alert(msg);
}

function gdpConfirmarDemanda(demandaId) {
  const d = gdpDemandas.find(x => x.id === demandaId);
  if (!d || d.status !== "rascunho") return;
  if (!confirm("Confirmar demanda " + d.id + "? Vai debitar estoque e gerar lista de compras.")) return;
  d.itens.forEach(item => {
    if (item.status !== "convertido" || !item.skuProduto) return;
    const sku = item.skuProduto;
    if (!gdpEstoqueSimples[sku]) gdpEstoqueSimples[sku] = { qtd: 0, qtdComprometida: 0, minimo: 0 };
    const disponivel = gdpEstoqueSimples[sku].qtd - gdpEstoqueSimples[sku].qtdComprometida;
    if (disponivel >= item.qtdConvertida) {
      gdpEstoqueSimples[sku].qtd -= item.qtdConvertida;
    } else {
      const falta = item.qtdConvertida - Math.max(disponivel, 0);
      gdpEstoqueSimples[sku].qtd = Math.max(gdpEstoqueSimples[sku].qtd - item.qtdConvertida, 0);
      const produto = getGdpBancoProduto(sku);
      gdpListaCompras.push({
        sku, produto: item.produtoReal || (produto ? (produto.item || sku) : sku),
        qtd: falta, fornecedor: produto?.fonte || produto?.fornecedorPadrao || "",
        custoUnitario: produto?.custoBase || produto?.custo || 0,
        custoTotal: Math.round(falta * (produto?.custoBase || produto?.custo || 0) * 100) / 100,
        demandaId: d.id, escola: d.escola,
        criadoEm: new Date().toISOString().slice(0, 10),
      });
    }
  });
  d.status = "confirmada";
  saveGdpDemandas();
  saveGdpEstoqueSimples();
  saveGdpListaCompras();
  renderEstoque();
  showToast("Demanda confirmada. Estoque atualizado, " + gdpListaCompras.length + " item(ns) na lista de compras.");
}

function gdpLancamentoEstoque(sku) {
  const qtd = parseInt(prompt("Quantidade de entrada:"));
  if (isNaN(qtd) || qtd <= 0) return;
  if (!gdpEstoqueSimples[sku]) gdpEstoqueSimples[sku] = { qtd: 0, qtdComprometida: 0, minimo: 0 };
  gdpEstoqueSimples[sku].qtd += qtd;
  saveGdpEstoqueSimples();
  renderEstoque();
  showToast("Estoque atualizado: +" + qtd + " para " + sku);
}

function gdpExportarListaCompras() {
  if (gdpListaCompras.length === 0) return showToast("Lista vazia.");
  const header = "Produto;Qtd;Fornecedor;Custo Unit.;Custo Total;Escola";
  const rows = gdpListaCompras.map(c => c.produto + ";" + c.qtd + ";" + c.fornecedor + ";" + c.custoUnitario + ";" + c.custoTotal + ";" + c.escola);
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lista-compras-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
}

function gdpImprimirListaCompras() {
  const table = document.querySelector("#ei-gdp-compras-table");
  if (!table) return;
  const win = window.open("", "_blank");
  win.document.write('<!DOCTYPE html><html><head><title>Lista de Compras</title><style>body{font-family:Arial;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0}</style></head><body><h2>Lista de Compras - ' + new Date().toLocaleDateString("pt-BR") + '</h2>' + table.outerHTML + '</body></html>');
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ===== UTILITIES =====
function esc(s) { return String(s == null ? "" : (typeof s === "object" ? JSON.stringify(s) : s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function showToast(msg, duration = 3000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.style.cssText = "background:#f59e0b;color:#000;font-weight:600;padding:.7rem 1.4rem;border-radius:4px;font-size:.85rem;box-shadow:0 4px 16px rgba(245,158,11,.4);transition:opacity .3s;border:2px solid #d97706";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, duration);
}

// ===== EXPORTAR / IMPORTAR DADOS =====
function exportarDados() {
  const keys = [
    CONTRACTS_KEY, ORDERS_KEY, PROOFS_KEY, INVOICES_KEY, PAYABLES_KEY, RECEIVABLES_KEY, STOCK_KEY, "gdp.usuarios.v1",
    "caixaescolar.banco.v1", "nexedu.empresa", "nexedu.auth"
  ];
  const dados = {};
  keys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v) dados[k] = JSON.parse(v);
  });
  dados._exportDate = new Date().toISOString();
  dados._source = location.hostname;

  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gdp-dados-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Dados exportados com sucesso!");
}

function importarDados(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const dados = JSON.parse(e.target.result);
      const importDate = dados._exportDate || "desconhecida";
      delete dados._exportDate;
      delete dados._source;

      const keys = Object.keys(dados);
      if (keys.length === 0) { showToast("Arquivo vazio ou invalido.", 3000); return; }

      if (!confirm(`Importar dados de ${importDate}?\n\n${keys.length} chaves encontradas:\n${keys.join(", ")}\n\nATENCAO: Dados existentes serao sobrescritos!`)) return;

      keys.forEach(k => {
        localStorage.setItem(k, JSON.stringify(dados[k]));
      });

      showToast(`${keys.length} conjuntos de dados importados! Recarregando...`, 3000);
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      showToast("Erro ao importar: " + err.message, 5000);
    }
  };
  reader.readAsText(file);
  file.value = "";
}

/* [gdp-usuarios.js extracted] */

// ===== AUTO-CADASTRO ERP =====
async function sincronizarContratoTiny(contratoId) {
  notifyErpSyncDisabled("Contrato");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  showToast(`Sincronizando ${c.itens.length} itens com Tiny...`, 3000);
  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: c.itens.map(item => ({
          num: item.num, descricao: item.descricao, unidade: item.unidade,
          precoUnitario: item.precoUnitario, ncm: item.ncm || '',
          sku: '', codigo: ''
        })),
        contractId: contratoId, action: "cadastrar"
      })
    });
    const data = await resp.json();
    if (data.success && data.results) {
      let synced = 0;
      data.results.forEach(r => {
        if (r.sku) {
          const item = c.itens.find(it => it.num === r.num);
          if (item) {
            item.sku = r.sku;
            if (r.unidade) item.unidade = r.unidade;
            synced++;
            adicionarAoBancoProdutos(item);
          }
        }
      });
      saveContratos();
      abrirContrato(contratoId);
      showToast(`${synced}/${c.itens.length} itens sincronizados com Tiny!`, 4000);
    }
  } catch(err) {
    showToast("Erro: " + err.message, 4000);
  }
}

async function autoCadastrarTiny(contratoId) {
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens || c.itens.length === 0) return;

  showToast(`Cadastrando ${c.itens.length} itens no ERP...`, 3000);

  const itens = c.itens.map(item => ({
    num: item.num,
    descricao: item.descricao,
    descricaoCompleta: item.descricao,
    unidade: item.unidade,
    precoUnitario: item.precoUnitario,
    ncm: item.ncm || (findNcmLocal(item.descricao) || {}).ncm || '',
    sku: item.sku || '',
    codigo: item.sku || ''
  }));

  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens, contractId: contratoId, action: "cadastrar" })
    });
    const data = await resp.json();

    if (data.success && data.results) {
      let skuCount = 0;
      data.results.forEach(r => {
        if (r.sku) {
          const item = c.itens.find(it => it.num === r.num);
          if (item) {
            item.sku = r.sku;
            if (r.unidade) item.unidade = r.unidade;
            skuCount++;
            adicionarAoBancoProdutos(item);
          }
        }
      });
      delete c.pendingTinySync;
      saveContratos();
      gdpLog(`[ERP Auto-Sync] Contrato ${contratoId}: ${skuCount} SKUs obtidos`);
      showToast(`${skuCount}/${c.itens.length} itens cadastrados no ERP com SKU`, 4000);
    } else {
      c.pendingTinySync = true;
      saveContratos();
      showToast("Erro ao cadastrar no ERP. Retry disponivel nos detalhes do contrato.", 5000);
    }
  } catch(err) {
    c.pendingTinySync = true;
    saveContratos();
    gdpWarn("[ERP Auto-Sync] Falha:", err.message);
    showToast("ERP offline. Itens serao cadastrados quando disponivel.", 4000);
  }
}

async function autoCadastrarClienteOlist(usuario) {
  return;
}

// ===== ENVIAR PEDIDO AO OLIST =====
async function enviarPedidoOlist(pedidoId) {
  notifyErpSyncDisabled("Pedido");
  return;
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;

  // Buscar SKU com fallback em cadeia: Contrato (enriquecido) > Pedido > Banco de Produtos
  const ctr = contratos.find(x => x.id === p.contratoId);
  const bpItens = (() => { try { return (JSON.parse(localStorage.getItem('gdp.produtos.v1')) || {}).itens || []; } catch(_) { return []; } })();
  const items = p.itens.map(i => {
    const ctrItem = ctr ? ctr.itens.find(ci => ci.num === i.itemNum || ci.descricao === i.descricao) : null;
    let sku = (ctrItem && ctrItem.sku) || i.sku || '';
    if (!sku) {
      const descNorm = (i.descricao || '').toUpperCase().trim();
      const bpMatch = bpItens.find(bp => (bp.descricao || '').toUpperCase().trim() === descNorm);
      if (bpMatch && bpMatch.sku) sku = bpMatch.sku;
    }
    if (!sku) gdpWarn("[Olist] SKU vazio para item:", i.descricao);
    // Resolve unidade: contrato > pedido > banco de produtos > fallback UN
    let unidade = (ctrItem && ctrItem.unidade) || i.unidade || '';
    let ncm = (ctrItem && ctrItem.ncm) || i.ncm || '';
    if (!unidade || !ncm) {
      const descNorm = (i.descricao || '').toUpperCase().trim();
      const bpMatch = bpItens.find(bp => (bp.descricao || '').toUpperCase().trim() === descNorm);
      if (bpMatch) {
        if (!unidade) unidade = bpMatch.unidade || '';
        if (!ncm) ncm = bpMatch.ncm || '';
      }
    }
    return {
      sku,
      description: i.descricao,
      name: i.descricao,
      qty: i.qtd,
      unitPrice: i.precoUnitario,
      itemNum: i.itemNum,
      unidade: unidade || 'UN',
      ncm: ncm
    };
  });

  // Detectar inconsistências de unidade antes do envio
  const unitWarnings = items.filter(i => {
    if (i.unidade !== 'UN') return false;
    const desc = (i.description || '').toLowerCase();
    return /\b(kg|quilo|litro|lts?|pacote|pct|caixa|cx|fardo|rolo)\b/.test(desc);
  });
  if (unitWarnings.length > 0) {
    showToast(`${unitWarnings.length} item(ns) com unidade "UN" mas descrição sugere outra. Verifique antes de emitir NF-e.`, 5000);
  }

  try {
    const resp = await fetch("/api/olist/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: p.id,
        school: p.escola,
        cliente: p.cliente || { nome: p.escola },
        olistClienteId: p.cliente?.olistClienteId || '',
        items: items,
        totalValue: p.valor,
        arp: "ARP-LARIUCCI-2025",
        marcador: p.marcador || "Licit-AIX",
        obs: p.obs || ""
      })
    });
    const data = await resp.json();
    if (data.success) {
      p.olistId = data.olistOrderId;
      savePedidos();
      renderPedidos();
      showToast("Pedido " + p.id + " enviado ao Olist: " + data.olistOrderId);
    } else {
      showToast("Erro: " + data.error, 5000);
    }
  } catch (err) {
    showToast("Erro de conexao: " + err.message, 5000);
  }
}

/* [gdp-entregas.js extracted] */

// ─── Seleção em Massa ───
function toggleSelectAllItens(contratoId, checked) {
  document.querySelectorAll(`.item-check-${contratoId}`).forEach(cb => { cb.checked = checked; });
  atualizarSelecaoItens(contratoId);
}

function atualizarSelecaoItens(contratoId) {
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const count = checks.length;
  const span = document.getElementById(`itens-selecionados-${contratoId}`);
  const btn = document.getElementById(`btn-editar-massa-${contratoId}`);
  const btnVinc = document.getElementById(`btn-vincular-massa-${contratoId}`);
  const btnExcl = document.getElementById(`btn-excluir-massa-${contratoId}`);
  if (span) span.textContent = count > 0 ? `${count} selecionado(s)` : '';
  if (btn) { if (count > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden'); }
  if (btnVinc) { if (count > 0) btnVinc.classList.remove('hidden'); else btnVinc.classList.add('hidden'); }
  if (btnExcl) { if (count > 0) btnExcl.classList.remove('hidden'); else btnExcl.classList.add('hidden'); }
}

// AC8-AC9: Bulk delete contract items
function excluirItensSelecionados(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx)).filter(i => !isNaN(i));
  if (indices.length === 0) { showToast("Nenhum item selecionado."); return; }
  if (!confirm(`Excluir ${indices.length} item(ns) selecionado(s) do contrato?`)) return;
  // Remove from highest index to lowest to avoid shifting
  indices.sort((a, b) => b - a).forEach(idx => { c.itens.splice(idx, 1); });
  // Renumber
  c.itens.forEach((item, i) => { item.num = i + 1; });
  saveContratos();
  showToast(`${indices.length} item(ns) excluído(s).`);
  abrirContrato(contratoId);
  renderAll();
}

function vincularItensMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx)).filter(i => !isNaN(i));
  if (indices.length === 0) { showToast("Nenhum item selecionado."); return; }

  // Build modal with list of selected items + search for each
  let overlay = document.getElementById("vincular-massa-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "vincular-massa-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");

  // Merge products from Intel + Banco
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco; try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  const bancoItens = (banco && Array.isArray(banco.itens)) ? banco.itens : [];
  const allProds = [
    ...estoqueIntelProdutos.map(p => ({ id: p.id, nome: p.nome, sku: p.sku || "", source: "intel" })),
    ...bancoItens.map(bp => ({ id: bp.id, nome: bp.nomeComercial || bp.item || "", sku: bp.sku || "", source: "banco" }))
  ];
  const prodOptions = allProds.map(p => `<option value="${esc(p.id)}|${esc(p.source)}">${esc(p.nome)} (${esc(p.sku || p.id.slice(0,10))})</option>`).join("");

  const rowsHtml = indices.map(idx => {
    const item = c.itens[idx];
    if (!item) return "";
    return `<tr data-vincmassa-idx="${idx}">
      <td style="font-size:.78rem">${item.num || idx+1}</td>
      <td style="font-size:.78rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}">${esc((item.descricao || "").slice(0,45))}</td>
      <td><select class="vincmassa-select" style="width:100%;font-size:.78rem"><option value="">-- Selecionar produto --</option>${prodOptions}</select></td>
    </tr>`;
  }).join("");

  overlay.innerHTML = `
    <div style="background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);padding:1.5rem;max-width:700px;width:95%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:700">Vincular ${indices.length} Item(ns)</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('vincular-massa-overlay').classList.add('hidden')">✕</button>
      </div>
      <div class="table-wrap" style="max-height:50vh;overflow-y:auto">
        <table style="font-size:.82rem"><thead><tr><th>#</th><th>Descricao do Contrato</th><th>Produto Cadastrado</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-outline" onclick="document.getElementById('vincular-massa-overlay').classList.add('hidden')">Cancelar</button>
        <button class="btn btn-green" onclick="confirmarVincularMassa('${esc(contratoId)}')">Vincular Todos</button>
      </div>
    </div>
  `;
}

function confirmarVincularMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco; try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  let vinculados = 0;
  document.querySelectorAll("[data-vincmassa-idx]").forEach(row => {
    const idx = parseInt(row.getAttribute("data-vincmassa-idx"));
    const sel = row.querySelector(".vincmassa-select");
    if (!sel || !sel.value) return;
    const [prodId, source] = sel.value.split("|");
    const item = c.itens[idx];
    if (!item) return;
    let sku = "";
    if (source === "intel") {
      const p = estoqueIntelProdutos.find(x => x.id === prodId);
      sku = p?.sku || prodId;
    } else {
      const bp = banco?.itens?.find(x => x.id === prodId);
      sku = bp?.sku || "";
    }
    if (sku) {
      setGdpEquivalencia(item.descricao, sku);
      vinculados++;
    }
  });
  document.getElementById("vincular-massa-overlay").classList.add("hidden");
  if (vinculados > 0) {
    saveContratos();
    abrirContrato(contratoId);
    showToast(`${vinculados} item(ns) vinculado(s) com sucesso.`);
  } else {
    showToast("Nenhum item vinculado.");
  }
}

function editarItensMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  _contratoAbertoId = contratoId; // sub-screen: Fechar returns to detail
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx));
  if (indices.length === 0) { showToast('Nenhum item selecionado'); return; }

  const body = document.getElementById("modal-contrato-body");
  const prevHtml = body.innerHTML;
  document.getElementById("modal-contrato-header-actions").innerHTML = '';
  document.getElementById("modal-contrato-titulo").textContent = `Editar ${indices.length} itens — ${c.id}`;

  const rowsHtml = indices.map(idx => {
    const item = c.itens[idx];
    if (!item) return '';
    return `<tr data-edit-idx="${idx}">
      <td class="text-center" style="font-size:.75rem;font-weight:700">${item.num}</td>
      <td><input type="text" class="edit-descricao" value="${esc(item.descricao || '')}" style="width:100%;min-width:220px;font-size:.72rem;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--txt)"></td>
      <td><input type="text" class="edit-ncm" value="${esc(item.ncm || '')}" placeholder="0000.00.00" style="width:100px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--cyan)"></td>
      <td><input type="text" class="edit-unidade" value="${esc(item.unidade || 'UN')}" style="width:50px;font-size:.72rem;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--txt);text-transform:uppercase"></td>
      <td><input type="number" class="edit-qtd" value="${item.qtdContratada || 0}" min="0" style="width:65px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--txt);text-align:right"></td>
      <td><input type="number" class="edit-preco" value="${item.precoUnitario || 0}" step="0.01" style="width:80px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--green);text-align:right"></td>
      <td><input type="text" class="edit-sku" value="${esc(item.sku || '')}" placeholder="auto" style="width:80px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);color:var(--txt)"></td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;flex-wrap:wrap;gap:.5rem">
      <div>
        <h3 style="margin:0 0 .2rem;font-size:1rem">Editando ${indices.length} itens</h3>
        <p style="font-size:.78rem;color:var(--dim);margin:0">Altere os valores diretamente em cada linha</p>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center">
        <span style="font-size:.72rem;color:var(--dim)">Preencher todos:</span>
        <input type="text" id="fill-all-desc" placeholder="Descricao" style="width:180px;font-size:.7rem;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25)">
        <button class="btn btn-sm" style="font-size:.65rem;padding:.2rem .4rem;background:rgba(16,185,129,.15);color:var(--green);border:none;font-weight:700;cursor:pointer" id="btn-fill-all-desc" title="Aplicar descricao em todos os itens da lista">Aplicar Descricao</button>
        <input type="number" id="fill-all-qtd" placeholder="Qtd" style="width:60px;font-size:.7rem;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25)">
        <button class="btn btn-sm" style="font-size:.65rem;padding:.2rem .4rem;background:rgba(245,158,11,.15);color:var(--yellow);border:none;font-weight:700;cursor:pointer" id="btn-fill-all-qtd" title="Aplicar quantidade em todos os itens">Aplicar Qtd</button>
        <input type="text" id="fill-all-ncm" placeholder="NCM" style="width:90px;font-size:.7rem;font-family:monospace;padding:.2rem .3rem;background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25)">
        <button class="btn btn-sm" style="font-size:.65rem;padding:.2rem .4rem;background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700;cursor:pointer" id="btn-fill-all-ncm" title="Aplicar NCM em todos os itens da lista">Aplicar NCM</button>
      </div>
    </div>

    <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--bdr);border-radius:4px">
      <table style="font-size:.78rem;width:100%" id="tabela-edicao-massa">
        <thead><tr style="position:sticky;top:0;background:transparent;z-index:1">
          <th>#</th><th>Descricao</th><th>NCM</th><th>Unid</th><th>Qtd</th><th>Preco</th><th>SKU</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem">
      <button class="btn btn-sm btn-outline" id="btn-cancelar-massa">Cancelar</button>
      <button class="btn btn-sm btn-green" id="btn-salvar-massa" style="font-weight:700">Salvar ${indices.length} itens</button>
    </div>`;

  document.getElementById('btn-cancelar-massa').onclick = () => { body.innerHTML = prevHtml; };
  document.getElementById('btn-salvar-massa').onclick = () => { salvarEdicaoMassa(contratoId); };
  document.getElementById('btn-fill-all-desc').onclick = () => {
    const val = document.getElementById('fill-all-desc').value.trim();
    if (!val) return;
    document.querySelectorAll('#tabela-edicao-massa .edit-descricao').forEach(input => { input.value = val; });
    showToast('Descricao aplicada em todos os itens');
  };
  document.getElementById('btn-fill-all-ncm').onclick = () => {
    const val = document.getElementById('fill-all-ncm').value.trim();
    if (!val) return;
    document.querySelectorAll('#tabela-edicao-massa .edit-ncm').forEach(input => { input.value = val; });
    showToast('NCM aplicado em todos os itens');
  };
  document.getElementById('btn-fill-all-qtd').onclick = () => {
    const val = document.getElementById('fill-all-qtd').value.trim();
    if (!val) return;
    document.querySelectorAll('#tabela-edicao-massa .edit-qtd').forEach(input => { input.value = val; });
    showToast('Quantidade aplicada em todos os itens');
  };
}

function salvarEdicaoMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const rows = document.querySelectorAll('#tabela-edicao-massa tbody tr[data-edit-idx]');
  let updated = 0;
  rows.forEach(row => {
    const idx = parseInt(row.dataset.editIdx);
    const item = c.itens[idx];
    if (!item) return;
    const descricao = row.querySelector('.edit-descricao').value.trim();
    const ncm = row.querySelector('.edit-ncm').value.trim();
    const unidade = row.querySelector('.edit-unidade').value.trim();
    const qtd = row.querySelector('.edit-qtd')?.value?.trim();
    const preco = row.querySelector('.edit-preco').value.trim();
    const sku = row.querySelector('.edit-sku').value.trim();
    if (descricao) item.descricao = descricao;
    if (ncm !== (item.ncm || '')) item.ncm = ncm;
    if (unidade) item.unidade = unidade.toUpperCase();
    if (qtd !== undefined && qtd !== '') item.qtdContratada = parseInt(qtd) || 0;
    if (preco) item.precoUnitario = parseFloat(preco);
    if (sku) item.sku = sku;
    enrichContratoItemMetadata(c, item, idx);
    syncContratoItemToPedidos(contratoId, item);
    updated++;
  });
  c.valorTotal = c.itens.reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada) || 0), 0);
  saveContratos();
  abrirContrato(contratoId);
  showToast(`${updated} itens salvos`);
}

async function cadastrarTinyItem(contratoId, itemIdx, silent) {
  if (!silent) notifyErpSyncDisabled("Item");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  const item = c.itens[itemIdx];
  const ncmCode = item.ncm || (findNcmLocal(item.descricao) || {}).ncm || "";
  if (!silent && !confirm(`Cadastrar no Tiny ERP:\n\n${item.descricao}\nUnid: ${item.unidade} | Preço: ${brl.format(item.precoUnitario)}\nNCM: ${ncmCode || '(sem NCM)'}\nMarca: Licit-AIX`)) return;
  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: [{ num: item.num, descricao: item.descricao, descricaoCompleta: item.descricao, unidade: item.unidade, precoUnitario: item.precoUnitario, ncm: ncmCode, sku: item.sku || '', codigo: item.sku || '' }], contractId: contratoId, action: "cadastrar" })
    });
    const data = await resp.json();
    if (data.success) {
      // Propagate SKU from Tiny response
      if (data.results) {
        data.results.forEach(r => {
          if (r.sku && item.num === r.num) {
            item.sku = r.sku;
            adicionarAoBancoProdutos(item);
            saveContratos();
          }
        });
      }
      if (!silent) showToast(`Item "${item.descricao.slice(0,40)}" cadastrado no Tiny!`);
    } else {
      if (!silent) showToast("Erro: " + (data.error || "Falha"), 4000);
    }
  } catch(err) {
    if (!silent) showToast("Erro: " + err.message, 4000);
  }
}

async function cadastrarTiny(contratoId) {
  notifyErpSyncDisabled("Contrato");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  const resultDiv = document.getElementById("tiny-result-" + contratoId);
  if (!resultDiv) return;

  // Show preview with NCM mapping before sending
  const preview = c.itens.map((item, i) => {
    const ncm = findNcmLocal(item.descricao);
    return {
      num: item.num,
      descricao: item.descricao,
      unidade: item.unidade,
      precoUnitario: item.precoUnitario,
      ncm: ncm ? ncm.ncm : "",
      ncmAuto: !!ncm
    };
  });

  // Show editable NCM table
  let tableHtml = `
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
      <h4 style="margin:0">Revisao NCM — ${c.itens.length} itens</h4>
      <span style="background:rgba(139,92,246,.15);color:#8b5cf6;padding:.2rem .6rem;border-radius:999px;font-size:.7rem;font-weight:700">Licit-AIX</span>
    </div>
    <p style="color:var(--mut);font-size:.8rem;margin-bottom:.8rem">Verifique os codigos NCM antes de enviar. Os produtos serao marcados com a tag <strong>Licit-AIX</strong> no Tiny.</p>
    <div class="table-wrap" style="max-height:350px;overflow-y:auto">
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Unid</th><th class="text-right">Preco</th><th>NCM</th><th>Status</th></tr></thead>
        <tbody>
          ${preview.map((p, i) => `<tr>
            <td>${p.num}</td>
            <td style="max-width:280px">${esc(p.descricao.length > 60 ? p.descricao.slice(0, 58) + "..." : p.descricao)}</td>
            <td>${esc(p.unidade)}</td>
            <td class="text-right font-mono">${brl.format(p.precoUnitario)}</td>
            <td><input type="text" id="ncm-${contratoId}-${i}" value="${p.ncm}" style="width:110px;font-family:monospace;font-size:.8rem" placeholder="0000.00.00"></td>
            <td>${p.ncmAuto ? '<span class="badge badge-green">Auto</span>' : '<span class="badge badge-yellow">Manual</span>'}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div style="margin-top:1rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('tiny-result-${contratoId}').classList.add('hidden')">Cancelar</button>
      <button class="btn btn-purple" id="btn-enviar-tiny-${contratoId}" onclick="enviarTiny('${contratoId}')">Enviar para Tiny</button>
    </div>
  `;

  resultDiv.innerHTML = tableHtml;
  resultDiv.classList.remove("hidden");
}

async function enviarTiny(contratoId) {
  notifyErpSyncDisabled("Contrato");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  const btn = document.getElementById("btn-enviar-tiny-" + contratoId);
  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

  const resultDiv = document.getElementById("tiny-result-" + contratoId);

  // Collect NCM values from inputs
  const itens = c.itens.map((item, i) => {
    const ncmInput = document.getElementById("ncm-" + contratoId + "-" + i);
    return {
      num: item.num,
      descricao: item.descricao,
      descricaoCompleta: item.descricao,
      unidade: item.unidade,
      precoUnitario: item.precoUnitario,
      ncm: ncmInput ? ncmInput.value.trim() : "",
      sku: item.sku || '',
      codigo: item.sku || ''
    };
  });

  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens, contractId: contratoId, action: "cadastrar" })
    });

    const data = await resp.json();

    if (!data.success) {
      resultDiv.innerHTML = `<div style="color:var(--red)">Erro: ${esc(data.error || "Falha desconhecida")}</div>
        <button class="btn btn-outline btn-sm" style="margin-top:.5rem" onclick="this.parentElement.classList.add('hidden')">Fechar</button>`;
      return;
    }

    // Show results
    const s = data.summary;
    let html = `
      <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
        <h4 style="margin:0">Resultado — Cadastro Tiny ERP</h4>
        <span style="background:rgba(139,92,246,.15);color:#8b5cf6;padding:.2rem .6rem;border-radius:999px;font-size:.7rem;font-weight:700">Licit-AIX</span>
      </div>
      <div style="display:flex;gap:1rem;margin-bottom:1rem">
        <div class="kpi" style="margin:0;flex:1"><div class="kpi-label">Cadastrados</div><div class="kpi-value green" style="font-size:1.3rem">${s.cadastrados}</div></div>
        <div class="kpi" style="margin:0;flex:1"><div class="kpi-label">Ja Existiam</div><div class="kpi-value blue" style="font-size:1.3rem">${s.existentes}</div></div>
        <div class="kpi" style="margin:0;flex:1"><div class="kpi-label">Erros</div><div class="kpi-value ${s.erros > 0 ? 'red' : 'green'}" style="font-size:1.3rem">${s.erros}</div></div>
      </div>
      <div class="table-wrap" style="max-height:250px;overflow-y:auto">
        <table>
          <thead><tr><th>#</th><th>SKU</th><th>Descricao</th><th>NCM</th><th>Status</th></tr></thead>
          <tbody>
            ${data.results.map(r => `<tr>
              <td>${r.num}</td>
              <td class="font-mono" style="font-size:.75rem">${esc(r.sku || "")}</td>
              <td style="max-width:250px">${esc((r.descricao || "").slice(0, 50))}</td>
              <td class="font-mono">${esc(r.ncm || "-")}</td>
              <td>${r.status === "ok" ? '<span class="badge badge-green">OK</span>' :
                   r.status === "existente" ? '<span class="badge badge-blue">Existente</span>' :
                   '<span class="badge badge-red" title="' + esc(r.error || "") + '">Erro</span>'}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div style="margin-top:.8rem;display:flex;gap:.8rem;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="this.parentElement.parentElement.classList.add('hidden')">Fechar</button>
      </div>
    `;

    resultDiv.innerHTML = html;

    // Save SKUs back to contract items + propagate to Banco de Produtos
    let changed = false;
    data.results.forEach(r => {
      if (r.sku && (r.status === "ok" || r.status === "existente")) {
        const item = c.itens.find(it => it.num === r.num);
        if (item && item.sku !== r.sku) {
          item.sku = r.sku;
          if (r.unidade) item.unidade = r.unidade;
          changed = true;
          // Propagate Tiny SKU to Banco de Produtos (Tiny is source of truth)
          adicionarAoBancoProdutos(item);
        }
      }
    });
    if (changed) {
      saveContratos();
    }

    showToast(`Tiny: ${s.cadastrados} cadastrados, ${s.existentes} existentes, ${s.erros} erros`);
  } catch (err) {
    resultDiv.innerHTML = `<div style="color:var(--red)">Erro de conexao: ${esc(err.message)}</div>
      <p style="color:var(--mut);font-size:.8rem;margin-top:.5rem">Verifique se o TINY_API_TOKEN esta configurado nas variaveis de ambiente do Vercel.</p>
      <button class="btn btn-outline btn-sm" style="margin-top:.5rem" onclick="this.parentElement.classList.add('hidden')">Fechar</button>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar para Tiny"; }
  }
}

// ===== INIT =====
(async function initGDP() {
  // FR-008: Montar abas do Financeiro — mover conteúdo de Caixa, CP, CR para dentro de tab-financeiro
  try {
    const finCaixa = document.getElementById("fin-content-caixa");
    const finCP = document.getElementById("fin-content-contas-pagar");
    const finCR = document.getElementById("fin-content-contas-receber");
    const tabCaixa = document.getElementById("tab-caixa");
    const tabCP = document.getElementById("tab-contas-pagar");
    const tabCR = document.getElementById("tab-contas-receber");
    if (finCaixa && tabCaixa) { while (tabCaixa.firstChild) finCaixa.appendChild(tabCaixa.firstChild); }
    if (finCP && tabCP) { while (tabCP.firstChild) finCP.appendChild(tabCP.firstChild); }
    if (finCR && tabCR) { while (tabCR.firstChild) finCR.appendChild(tabCR.firstChild); }
  } catch(e) { gdpWarn("[GDP] Erro montando financeiro:", e); }

  // LOCAL-FIRST: renderizar dados locais imediatamente para UX instantânea
  loadData();
  loadUsuarios();
  renderAll();

  // Auto-apply pending DB migrations (one-time, background, non-blocking)
  if (!sessionStorage.getItem("gdp.db-migrate-done")) {
    fetch("/api/db-migrate").then(r => r.json()).then(d => {
      gdpLog("[GDP] db-migrate:", d.message || d.hint || "done");
      sessionStorage.setItem("gdp.db-migrate-done", "1");
    }).catch(() => {});
  }

  // Supabase-First: carregar dados das tabelas reais (atualiza em background)
  if (window.gdpApi) {
    try {
      const ready = await gdpApi.isReady();
      if (ready) {
        gdpLog("[GDP] Supabase-First: carregando das tabelas reais...");
        const _tableMap = {
          'gdp.contratos.v1': 'contratos',
          'gdp.pedidos.v1': 'pedidos',
          'gdp.notas-fiscais.v1': 'notas_fiscais',
          'gdp.contas-receber.v1': 'contas_receber',
          'gdp.contas-pagar.v1': 'contas_pagar',
          'gdp.entregas.provas.v1': 'entregas'
        };
        const _wrapKeys = new Set(['gdp.contratos.v1','gdp.pedidos.v1','gdp.notas-fiscais.v1','gdp.contas-receber.v1','gdp.contas-pagar.v1']);
        for (const [lsKey, table] of Object.entries(_tableMap)) {
          try {
            const rows = await gdpApi[table].list();
            if (rows && rows.length > 0) {
              // Carregar IDs deletados localmente para filtrar do merge
              let deletedIds = new Set();
              try {
                const delKey = lsKey.replace('.v1', '.deleted.v1');
                const delArr = JSON.parse(localStorage.getItem(delKey) || '[]');
                deletedIds = new Set(delArr);
              } catch(_) {}
              // Filtrar registros deletados do resultado Supabase
              const filteredRows = deletedIds.size > 0 ? rows.filter(r => !deletedIds.has(r.id)) : rows;
              // Merge: preservar registros locais que não existem no Supabase
              let localItems = [];
              try {
                const raw = JSON.parse(localStorage.getItem(lsKey) || '{}');
                localItems = _wrapKeys.has(lsKey) ? (raw.items || []) : (Array.isArray(raw) ? raw : []);
              } catch(_) {}
              const remoteIds = new Set(filteredRows.map(r => r.id));
              const localOnly = localItems.filter(item => item.id && !remoteIds.has(item.id) && !deletedIds.has(item.id));
              const merged = [...filteredRows, ...localOnly];
              const data = _wrapKeys.has(lsKey) ? { _v: 1, updatedAt: new Date().toISOString(), items: merged } : merged;
              localStorage.setItem(lsKey, JSON.stringify(data));
              gdpLog("[GDP] " + table + ": " + filteredRows.length + " do Supabase + " + localOnly.length + " locais preservados" + (deletedIds.size ? " (" + deletedIds.size + " deletados filtrados)" : ""));
            }
          } catch(e) { gdpWarn("[GDP] Falha ao carregar " + table + ":", e); }
        }
        // Clientes (usuarios)
        try {
          const clientes = await gdpApi.clientes.list();
          if (clientes && clientes.length > 0) {
            // Merge: preservar clientes locais que não existem no Supabase
            let localClientes = [];
            try { localClientes = JSON.parse(localStorage.getItem('gdp.usuarios.v1') || '[]'); } catch(_) {}
            const remoteIds = new Set(clientes.map(c => c.id));
            const localOnly = localClientes.filter(c => c.id && !remoteIds.has(c.id));
            const merged = [...clientes, ...localOnly];
            localStorage.setItem('gdp.usuarios.v1', JSON.stringify(merged));
            gdpLog("[GDP] clientes: " + clientes.length + " do Supabase + " + localOnly.length + " locais preservados");
          }
        } catch(e) {}
      } else {
        gdpLog("[GDP] Tabelas Supabase não encontradas, usando localStorage");
      }
    } catch(e) {
      gdpWarn("[GDP] Supabase-First falhou, fallback localStorage:", e);
    }
  }

  // Render com dados (agora do Supabase via localStorage cache)
  loadData();
  loadUsuarios();
  renderAll();
  setGdpSyncState({ status: "syncing", source: "cloud", detail: "Sincronizando com cloud...", userId: getSyncUserId() });

  // Cloud sync em background — atualiza se houver dados mais recentes
  try {
    const restored = await syncFromCloud();
    if (restored?.restored) {
      // Cloud trouxe dados novos — recarregar e re-renderizar
      loadData();
      loadUsuarios();
      renderAll();
      setGdpSyncState({
        status: "cloud",
        source: restored.source || "cloud",
        detail: `Cloud atualizado com dados do GDP`,
        lastSyncAt: restored.lastSyncAt || new Date().toISOString(),
        userId: getSyncUserId()
      });
      gdpLog("[GDP] Dados compartilhados atualizados do cloud.");
    } else {
      setGdpSyncState({
        status: "local",
        source: "local_cache",
        detail: "Sem snapshot remoto encontrado; usando cache local",
        userId: getSyncUserId()
      });
    }
  } catch (e) {
    gdpWarn("[GDP] Restauracao do cloud falhou:", e);
    setGdpSyncState({
      status: "offline",
      source: "local_cache",
      detail: `Falha no cloud: ${e.message}`,
      userId: getSyncUserId()
    });
  }

  // Push local → cloud (backup)
  try { await syncToCloud(); } catch(_) {}

  // Auto-refresh when portal escola or banco de produtos updates localStorage (cross-tab sync)
  window.addEventListener('storage', (e) => {
    if (GDP_SHARED_SYNC_KEYS.has(e.key) || e.key === USUARIOS_KEY) {
      loadData();
      loadUsuarios();
      renderAll();
      setGdpSyncState({
        status: "cloud",
        source: "cross_tab",
        detail: `Atualizacao detectada em ${e.key}`,
        lastSyncAt: new Date().toISOString(),
        userId: getSyncUserId()
      });
    }
    if (e.key === PRODUTOS_KEY) {
      loadBancoProdutos();
      renderBancoProdutos();
    }
  });

  // Story 14.2: Start cross-machine polling (30s interval)
  if (window._gdpSync) {
    window._gdpSync.startPolling(30000);
  }
})();

// [gdp-pedidos.js loaded above — Lista de Compras, Status Tabs, Selection, Menu]

/* [gdp-banco-produtos.js extracted] */

// === NCM Database (alimentos escolares) ===
const NCM_DB = [
  {cod:"0207.14.00",desc:"Pedacos e miudezas de galos/galinhas, congelados"},
  {cod:"0210.12.00",desc:"Barrigas e peitos suinos, salgados ou defumados"},
  {cod:"0302.71.00",desc:"Tilapias frescas ou refrigeradas"},
  {cod:"0304.61.00",desc:"Files de tilapia congelados"},
  {cod:"0401.10.10",desc:"Leite UHT integral"},
  {cod:"0401.20.10",desc:"Leite UHT semidesnatado"},
  {cod:"0402.21.10",desc:"Leite em po integral"},
  {cod:"0405.10.00",desc:"Manteiga"},
  {cod:"0406.10.10",desc:"Queijo minas frescal"},
  {cod:"0406.10.90",desc:"Queijo meia cura e outros frescos"},
  {cod:"0406.20.00",desc:"Queijo ralado ou em po"},
  {cod:"0406.90.10",desc:"Queijo mussarela"},
  {cod:"0407.21.00",desc:"Ovos de galinha, frescos"},
  {cod:"0409.00.00",desc:"Mel natural"},
  {cod:"0701.90.00",desc:"Batatas frescas ou refrigeradas"},
  {cod:"0702.00.00",desc:"Tomates frescos ou refrigerados"},
  {cod:"0703.10.19",desc:"Cebolas frescas"},
  {cod:"0703.20.10",desc:"Alho fresco"},
  {cod:"0704.10.00",desc:"Couve-flor e brocolis"},
  {cod:"0704.90.00",desc:"Couve, repolho e outros"},
  {cod:"0706.10.00",desc:"Cenouras e nabos"},
  {cod:"0706.90.00",desc:"Beterraba, rabanete e outros"},
  {cod:"0707.00.00",desc:"Pepinos e cornichoes"},
  {cod:"0708.20.00",desc:"Feijao verde (vagem)"},
  {cod:"0709.30.00",desc:"Berinjelas"},
  {cod:"0709.51.00",desc:"Cogumelos frescos"},
  {cod:"0709.60.00",desc:"Pimentoes e pimentas"},
  {cod:"0709.93.00",desc:"Aboboras e abobrinhas"},
  {cod:"0709.99.90",desc:"Outros legumes (chuchu, inhame, quiabo)"},
  {cod:"0713.33.19",desc:"Feijao comum (carioca, preto)"},
  {cod:"0713.33.29",desc:"Feijao branco"},
  {cod:"0714.10.00",desc:"Mandioca fresca ou congelada"},
  {cod:"0803.10.00",desc:"Bananas frescas"},
  {cod:"0804.30.00",desc:"Abacaxi fresco"},
  {cod:"0805.10.00",desc:"Laranjas frescas"},
  {cod:"0805.50.00",desc:"Limoes frescos"},
  {cod:"0807.11.00",desc:"Melancias frescas"},
  {cod:"0808.10.00",desc:"Macas frescas"},
  {cod:"0808.30.00",desc:"Mamao fresco"},
  {cod:"0901.21.00",desc:"Cafe torrado nao descafeinado"},
  {cod:"0910.11.00",desc:"Gengibre"},
  {cod:"0910.30.00",desc:"Acafrao (curcuma)"},
  {cod:"1001.99.00",desc:"Trigo"},
  {cod:"1005.90.10",desc:"Milho em grao"},
  {cod:"1006.30.21",desc:"Arroz polido parboilizado"},
  {cod:"1006.30.29",desc:"Arroz polido nao parboilizado"},
  {cod:"1101.00.10",desc:"Farinha de trigo"},
  {cod:"1102.20.00",desc:"Farinha de milho"},
  {cod:"1106.20.00",desc:"Farinha de mandioca"},
  {cod:"1108.12.00",desc:"Amido de milho"},
  {cod:"1108.14.00",desc:"Fecula de mandioca (polvilho)"},
  {cod:"1207.40.90",desc:"Gergelim"},
  {cod:"1507.90.11",desc:"Oleo de soja refinado"},
  {cod:"1509.10.00",desc:"Azeite de oliva virgem"},
  {cod:"1517.10.00",desc:"Margarina"},
  {cod:"1701.14.00",desc:"Acucar cristal"},
  {cod:"1701.99.00",desc:"Acucar refinado"},
  {cod:"1803.10.00",desc:"Pasta de cacau"},
  {cod:"1805.00.00",desc:"Cacau em po sem acucar"},
  {cod:"1806.31.10",desc:"Chocolate recheado"},
  {cod:"1806.90.00",desc:"Achocolatado e preparacoes de cacau"},
  {cod:"1901.10.10",desc:"Farinha lactea"},
  {cod:"1901.90.90",desc:"Misturas para bolos e paes"},
  {cod:"1902.11.00",desc:"Massas nao cozidas (espaguete, penne, etc)"},
  {cod:"1902.19.00",desc:"Outras massas nao cozidas"},
  {cod:"1904.10.00",desc:"Cereais expandidos (flocos milho)"},
  {cod:"1904.20.00",desc:"Cereais em flocos (aveia, granola)"},
  {cod:"1905.31.00",desc:"Biscoitos doces"},
  {cod:"1905.32.00",desc:"Waffles"},
  {cod:"1905.40.00",desc:"Torradas e biscoitos de agua e sal"},
  {cod:"1905.90.90",desc:"Pao frances e outros paes"},
  {cod:"2001.90.00",desc:"Legumes preparados em vinagre"},
  {cod:"2002.10.00",desc:"Tomate pelado inteiro"},
  {cod:"2002.90.00",desc:"Extrato e polpa de tomate"},
  {cod:"2008.19.00",desc:"Amendoim preparado"},
  {cod:"2008.99.00",desc:"Polpa de frutas congelada"},
  {cod:"2009.11.00",desc:"Suco de laranja congelado"},
  {cod:"2009.89.00",desc:"Suco de outras frutas"},
  {cod:"2103.10.10",desc:"Molho de soja (shoyu)"},
  {cod:"2103.20.10",desc:"Ketchup e molho de tomate"},
  {cod:"2103.90.21",desc:"Temperos e condimentos"},
  {cod:"2103.90.91",desc:"Vinagre"},
  {cod:"2104.10.11",desc:"Caldo de carne/galinha em cubo"},
  {cod:"2106.90.10",desc:"Fermento em po"},
  {cod:"2501.00.19",desc:"Sal refinado"},
  {cod:"0904.11.00",desc:"Pimenta do reino"},
  {cod:"0906.11.00",desc:"Canela em casca ou po"},
  {cod:"0910.91.00",desc:"Oregano"},
  {cod:"1209.99.90",desc:"Louro em folha"},
  {cod:"0801.11.10",desc:"Coco ralado"}
];

function filtrarNCM(input) {
  const dl = document.getElementById("ncm-datalist");
  if (!dl) return;
  const v = input.value.toLowerCase().trim();
  if (v.length < 2) { dl.innerHTML = ""; return; }
  const matches = NCM_DB.filter(n => n.cod.includes(v) || n.desc.toLowerCase().includes(v)).slice(0, 12);
  dl.innerHTML = matches.map(n => `<option value="${n.cod} — ${n.desc}">`).join("");
}

// === Editar Produto (modal) ===
function abrirEditarProduto(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) return;
  const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === produtoId);
  const ORIGEM_OPTS = [
    {v:"0",l:"0 — Nacional"},{v:"1",l:"1 — Import. Direta"},{v:"2",l:"2 — Import. Merc. Interno"},
    {v:"3",l:"3 — Nac. >40% Import."},{v:"4",l:"4 — Nac. Proc. Basicos"},{v:"5",l:"5 — Nac. <=40% Import."},
    {v:"6",l:"6 — Import. s/ Similar"},{v:"7",l:"7 — Import. MI s/ Similar"}
  ];
  const CAT_OPTS = ["","Hortifruti","Carnes/Proteinas","Graos/Cereais","Laticinios","Frutas","Mercearia","Padaria/Biscoitos","Ovos","Bebidas","Polpas/Frutas","Limpeza","Outros",..._loadCategoriasCustom()];
  const UNIT_OPTS = ["UN","DZ","g","KG","ml","LT","GL","CX","PCT","FD","BD","PT","SC","MÇ","RS","RL","FR","TB","GF","LA"];

  const detalhePage = document.getElementById("produto-detalhe-page");
  const listagem = document.getElementById("estoque-listagem");
  const useInline = detalhePage && listagem;

  const formHeader = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid rgba(143,197,157,.25)">
      <button onclick="fecharEditarProduto()" style="background:transparent;border:none;cursor:pointer;color:var(--mut);font-size:1.1rem;padding:4px 8px" title="Voltar">&#x2190;</button>
      <h2 style="font-size:1.1rem;font-weight:600;margin:0;flex:1">Editar Produto — ${esc(produto.nome)}</h2>
    </div>`;

  const formBody = `
    <div style="padding:0;width:100%;max-width:100%">
      <div style="font-size:.72rem;color:var(--mut);margin-bottom:1rem">ID: ${esc(produto.id)} | SKU: ${esc(produto.sku || "—")}</div>
      <div style="margin-bottom:.75rem">
        <label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Nome</label>
        <input type="text" id="edit-prod-nome" value="${esc(produto.nome)}" style="width:100%">
      </div>
      <div style="margin-bottom:.75rem">
        <label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Tipo de Produto</label>
        <div style="display:flex;gap:.8rem">
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.4rem .7rem;background:var(--bg);border:1px solid var(--bdr);border-radius:4px;flex:1">
            <input type="radio" name="edit-prod-tipo" value="comum" ${!produto.produto_critico ? 'checked' : ''} onchange="atualizarUnidadesPorTipo('edit')"> Produto Comum
          </label>
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.4rem .7rem;background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.25);border-radius:4px;flex:1">
            <input type="radio" name="edit-prod-tipo" value="critico" ${produto.produto_critico ? 'checked' : ''} onchange="atualizarUnidadesPorTipo('edit')"> Produto Critico
          </label>
        </div>
        <div style="font-size:.68rem;color:var(--mut);margin-top:.25rem">Produto critico permite cadastrar embalagens do mercado para conversao de demanda (ex: contratado 170g, mercado 360g).</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label id="edit-prod-unidade-label" style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">${produto.produto_critico ? 'Unidade Base' : 'Unidade'}</label><select id="edit-prod-unidade" style="width:100%">${produto.produto_critico
          ? ['g','KG','ml','LT','GL'].map(u => '<option value="' + u + '"' + (produto.unidade_base===u?' selected':'') + '>' + u + '</option>').join('')
          : ['UN','DZ','CX','PCT','FD','BD','PT','SC','MÇ','RS','RL','FR','TB','GF','LA','KG','LT','GL'].map(u => '<option value="' + u + '"' + (produto.unidade_base===u?' selected':'') + '>' + u + '</option>').join('')
        }</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">SKU</label><input type="text" id="edit-prod-sku" value="${esc(produto.sku || "")}" style="width:100%"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">NCM</label><input type="text" id="edit-prod-ncm" value="${esc(produto.ncm || "")}" list="ncm-datalist" oninput="filtrarNCM(this)" autocomplete="off" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><select id="edit-prod-categoria" style="width:100%">${CAT_OPTS.map(c => '<option value="' + c + '"' + ((produto.categoria||"")===c?' selected':'') + '>' + (c || "Sem Categoria") + '</option>').join("")}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Origem NF-e</label><select id="edit-prod-origem" style="width:100%">${ORIGEM_OPTS.map(o => '<option value="' + o.v + '"' + ((produto.origem||"0")===o.v?' selected':'') + '>' + o.l + '</option>').join("")}</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Preco de Custo</label><input type="number" id="edit-prod-preco-custo" value="${produto.preco_custo || 0}" min="0" step="0.01" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Preco de Venda</label><input type="number" id="edit-prod-preco-ref" value="${produto.preco_referencia || 0}" min="0" step="0.01" style="width:100%"></div>
      </div>
      <div id="edit-prod-embalagens-section" style="border-top:1px solid var(--bdr);margin:1rem 0;padding-top:1rem;${produto.produto_critico ? '' : 'display:none'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <div style="font-size:.85rem;font-weight:700">Embalagens (${embs.length})</div>
          <button class="btn btn-green btn-sm" onclick="adicionarEmbalagemNoProduto('${esc(produto.id)}')">+ Embalagem</button>
        </div>
        <div id="edit-embs-list">
        ${embs.length ? embs.map((emb, idx) => `
          <div style="display:grid;grid-template-columns:1fr .6fr .6fr auto;gap:.5rem;align-items:end;margin-bottom:.5rem" data-emb-id="${esc(emb.id)}">
            <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Descricao</label><input type="text" class="edit-emb-desc" value="${esc(emb.descricao || "")}" style="width:100%"></div>
            <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Qtd Base</label><input type="number" class="edit-emb-qtd" value="${emb.quantidade_base || 1}" min="1" style="width:100%"></div>
            <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">P. Venda</label><input type="number" class="edit-emb-preco" value="${emb.preco_referencia || 0}" min="0" step="0.01" style="width:100%"></div>
            <div><button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="removerEmbalagemDoEdit('${esc(emb.id)}')">X</button></div>
          </div>
        `).join("") : '<div style="font-size:.82rem;color:var(--mut);padding:.5rem 0">Nenhuma embalagem cadastrada.</div>'}
        </div>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-outline" onclick="fecharEditarProduto()">Cancelar</button>
        <button class="btn btn-green" onclick="salvarEditarProduto('${esc(produto.id)}')">Salvar</button>
      </div>
    </div>
  `;
  if (useInline) {
    detalhePage.innerHTML = formHeader + formBody;
    listagem.classList.add("hidden");
    detalhePage.classList.remove("hidden");
  } else {
    let overlay = document.getElementById("edit-prod-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "edit-prod-overlay";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
      document.body.appendChild(overlay);
    }
    overlay.classList.remove("hidden");
    overlay.innerHTML = formBody;
  }
}

function fecharEditarProduto() {
  const overlay = document.getElementById("edit-prod-overlay");
  if (overlay) overlay.classList.add("hidden");
  const detalhePage = document.getElementById("produto-detalhe-page");
  const listagem = document.getElementById("estoque-listagem");
  if (detalhePage) { detalhePage.classList.add("hidden"); detalhePage.innerHTML = ""; }
  if (listagem) listagem.classList.remove("hidden");
}

function salvarEditarProduto(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) return;
  const ncmRaw = (document.getElementById("edit-prod-ncm")?.value || "").trim();
  produto.nome = (document.getElementById("edit-prod-nome")?.value || "").trim() || produto.nome;
  produto.unidade_base = document.getElementById("edit-prod-unidade")?.value || produto.unidade_base;
  produto.sku = (document.getElementById("edit-prod-sku")?.value || "").trim();
  produto.ncm = ncmRaw.includes(" — ") ? ncmRaw.split(" — ")[0].trim() : ncmRaw;
  produto.categoria = document.getElementById("edit-prod-categoria")?.value || "";
  produto.origem = document.getElementById("edit-prod-origem")?.value || "0";
  const editTipoEl = document.querySelector('input[name="edit-prod-tipo"]:checked');
  produto.produto_critico = editTipoEl ? editTipoEl.value === "critico" : false;
  produto.preco_custo = parseFloat(document.getElementById("edit-prod-preco-custo")?.value) || 0;
  produto.preco_referencia = parseFloat(document.getElementById("edit-prod-preco-ref")?.value) || 0;
  saveEstoqueIntelProdutos();

  document.querySelectorAll("#edit-embs-list [data-emb-id]").forEach(row => {
    const embId = row.getAttribute("data-emb-id");
    const emb = estoqueIntelEmbalagens.find(e => e.id === embId);
    if (!emb) return;
    emb.descricao = (row.querySelector(".edit-emb-desc")?.value || "").trim() || emb.descricao;
    emb.quantidade_base = Number(row.querySelector(".edit-emb-qtd")?.value) || 1;
    emb.preco_referencia = Number(row.querySelector(".edit-emb-preco")?.value) || 0;
  });
  saveEstoqueIntelEmbalagens();
  fecharEditarProduto();
  renderEstoque();
  showToast("Produto atualizado.", 2500);
}

// === Modal Demanda Manual (overlay) ===
function toggleFormDemandaManual() {
  let overlay = document.getElementById("demanda-manual-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    overlay.classList.add("hidden");
    return;
  }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "demanda-manual-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");

  const prodOpts = estoqueIntelProdutos.map(p => `<option value="${esc(p.id)}">${esc(p.nome)} (${esc(p.unidade_base)})</option>`).join("");

  overlay.innerHTML = `
    <div style="background:transparent;border:none;border-radius:0;border-bottom:1px solid rgba(143,197,157,.25);padding:1.5rem;max-width:500px;width:92%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:700">Nova Demanda Manual</div>
        <button class="btn btn-outline btn-sm" onclick="toggleFormDemandaManual()">✕</button>
      </div>
      <div style="display:grid;gap:.75rem;margin-bottom:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Produto</label><select id="ei-pedido-produto" style="width:100%"><option value="">Selecione</option>${prodOpts}</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Quantidade Necessaria</label><input type="number" id="ei-pedido-quantidade" min="1" step="1" placeholder="1700" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><input type="text" id="ei-pedido-status" value="emitido" style="width:100%"></div>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-outline" onclick="toggleFormDemandaManual()">Cancelar</button>
        <button class="btn btn-green" onclick="registrarPedidoEstoqueIntel();toggleFormDemandaManual()">Salvar Demanda</button>
      </div>
    </div>
  `;
}

// === Adicionar/Remover embalagem no modal de edição ===
function adicionarEmbalagemNoProduto(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) return;
  // Persistir tipo critico antes de reabrir (evita reset para comum)
  const tipoEl = document.querySelector('input[name="edit-prod-tipo"]:checked');
  if (tipoEl && tipoEl.value === "critico" && !produto.produto_critico) {
    produto.produto_critico = true;
    // Atualizar unidade base para gramatura se estava em unidade comum
    const unidadeEl = document.getElementById("edit-prod-unidade");
    if (unidadeEl) produto.unidade_base = unidadeEl.value;
    saveEstoqueIntelProdutos();
  }
  const newId = genId("EMB");
  estoqueIntelEmbalagens.push({ id: newId, produto_id: produtoId, descricao: "", codigo_barras: produto.sku || "", quantidade_base: 1, preco_referencia: 0 });
  saveEstoqueIntelEmbalagens();
  abrirEditarProduto(produtoId);
  showToast("Embalagem adicionada. Preencha os campos.", 2500);
}

function removerEmbalagemDoEdit(embId) {
  if (!confirm("Remover esta embalagem?")) return;
  const emb = estoqueIntelEmbalagens.find(e => e.id === embId);
  if (!emb) return;
  const produtoId = emb.produto_id;
  estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter(e => e.id !== embId);
  saveEstoqueIntelEmbalagens();
  abrirEditarProduto(produtoId);
  showToast("Embalagem removida.", 2500);
}

// === Modal Novo Produto (overlay) ===
let _novoProdutoEmbs = [{ id: "temp-0", descricao: "", quantidade_base: 1, preco_referencia: 0 }];

// FR-004: Atualizar opções de unidade base conforme tipo de produto
function atualizarUnidadesPorTipo(prefix) {
  const tipoEl = document.querySelector('input[name="' + prefix + '-prod-tipo"]:checked');
  const selectId = prefix === "ei" ? "ei-produto-unidade" : "edit-prod-unidade";
  const sel = document.getElementById(selectId);
  if (!sel || !tipoEl) return;
  const prevVal = sel.value;
  const isCritico = tipoEl.value === "critico";
  const comumOpts = '<optgroup label="Contagem"><option value="UN">UN — Unidade</option><option value="DZ">DZ — Duzia</option></optgroup><optgroup label="Embalagem"><option value="CX">CX — Caixa</option><option value="PCT">PCT — Pacote</option><option value="FD">FD — Fardo</option><option value="BD">BD — Bandeja</option><option value="PT">PT — Pote</option><option value="SC">SC — Sache/Saco</option></optgroup><optgroup label="Outros"><option value="MÇ">MÇ — Maco</option><option value="RS">RS — Resma</option><option value="RL">RL — Rolo</option><option value="FR">FR — Frasco</option><option value="TB">TB — Tubo</option><option value="GF">GF — Garrafa</option><option value="LA">LA — Lata</option><option value="KG">KG — Quilograma</option><option value="LT">LT — Litro</option><option value="GL">GL — Galao</option></optgroup>';
  const criticoOpts = '<optgroup label="Peso (conversao gramatura)"><option value="g">g — Grama</option><option value="KG">KG — Quilograma</option></optgroup><optgroup label="Volume (conversao ml)"><option value="ml">ml — Mililitro</option><option value="LT">LT — Litro</option><option value="GL">GL — Galao</option></optgroup>';
  sel.innerHTML = isCritico ? criticoOpts : comumOpts;
  // Tentar manter o valor anterior se existir na nova lista
  if (prevVal && sel.querySelector('option[value="' + prevVal + '"]')) {
    sel.value = prevVal;
  }
  // Toggle seção embalagens: só para produto crítico
  const embSection = document.getElementById("novo-prod-embalagens-section");
  if (embSection) {
    embSection.style.display = isCritico ? "" : "none";
    // Auto-criar 1 embalagem se marcou critico e lista está vazia
    if (isCritico) {
      const novoList = document.getElementById("novo-embs-list");
      if (novoList && !novoList.querySelector("[data-novo-emb]")) {
        adicionarEmbNovoProduto();
      }
    }
  }
  const editEmbSection = document.getElementById("edit-prod-embalagens-section");
  if (editEmbSection) {
    editEmbSection.style.display = isCritico ? "" : "none";
    // Auto-criar 1 embalagem se marcou critico e não tem nenhuma cadastrada
    if (isCritico) {
      const editList = document.getElementById("edit-embs-list");
      if (editList && !editList.querySelector("[data-emb-id]")) {
        // Obter o produto ID do botão "+ Embalagem" que contém o onclick
        const addBtn = editEmbSection.querySelector("button[onclick*='adicionarEmbalagemNoProduto']");
        if (addBtn) addBtn.click();
      }
    }
  }
  // Atualizar label do select de unidade
  const labelId = prefix === "ei" ? "ei-produto-unidade-label" : "edit-prod-unidade-label";
  const labelEl = document.getElementById(labelId);
  if (labelEl) labelEl.textContent = isCritico ? "Unidade Base" : "Unidade";
}

function toggleFormNovoProduto() {
  // Verificar se ja esta aberto inline
  const detalhePage = document.getElementById("produto-detalhe-page");
  const listagem = document.getElementById("estoque-listagem");
  if (detalhePage && !detalhePage.classList.contains("hidden")) {
    // Fechar: voltar para listagem
    detalhePage.classList.add("hidden");
    detalhePage.innerHTML = "";
    if (listagem) listagem.classList.remove("hidden");
    // Remover overlay antigo se existir
    const oldOverlay = document.getElementById("novo-prod-overlay");
    if (oldOverlay) oldOverlay.classList.add("hidden");
    return;
  }
  _novoProdutoEmbs = [{ id: "temp-0", descricao: "", quantidade_base: 1, preco_referencia: 0 }];
  renderModalNovoProduto();
}

function renderModalNovoProduto() {
  // Renderizar inline na pagina (nao overlay)
  const detalhePage = document.getElementById("produto-detalhe-page");
  const listagem = document.getElementById("estoque-listagem");
  const useInline = detalhePage && listagem;

  let overlay = document.getElementById("novo-prod-overlay");
  if (!useInline) {
    // Fallback: overlay fixo
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "novo-prod-overlay";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
      document.body.appendChild(overlay);
    }
    overlay.classList.remove("hidden");
  }

  const UNIT_OPTS_COMUM = '<optgroup label="Contagem"><option value="UN" selected>UN — Unidade</option><option value="DZ">DZ — Duzia</option></optgroup><optgroup label="Embalagem"><option value="CX">CX — Caixa</option><option value="PCT">PCT — Pacote</option><option value="FD">FD — Fardo</option><option value="BD">BD — Bandeja</option><option value="PT">PT — Pote</option><option value="SC">SC — Sache/Saco</option></optgroup><optgroup label="Outros"><option value="MÇ">MÇ — Maco</option><option value="RS">RS — Resma</option><option value="RL">RL — Rolo</option><option value="FR">FR — Frasco</option><option value="TB">TB — Tubo</option><option value="GF">GF — Garrafa</option><option value="LA">LA — Lata</option><option value="KG">KG — Quilograma</option><option value="LT">LT — Litro</option><option value="GL">GL — Galao</option></optgroup>';
  const UNIT_OPTS_CRITICO = '<optgroup label="Peso (conversao gramatura)"><option value="g" selected>g — Grama</option><option value="KG">KG — Quilograma</option></optgroup><optgroup label="Volume (conversao ml)"><option value="ml">ml — Mililitro</option><option value="LT">LT — Litro</option><option value="GL">GL — Galao</option></optgroup>';
  const UNIT_OPTS = UNIT_OPTS_COMUM;
  const CAT_OPTS = ["","Hortifruti","Carnes/Proteinas","Graos/Cereais","Laticinios","Frutas","Mercearia","Padaria/Biscoitos","Ovos","Bebidas","Limpeza","Outros"].map(c => `<option value="${c}">${c || "Sem Categoria"}</option>`).join("");
  const ORI_OPTS = [{v:"0",l:"0 — Nacional"},{v:"1",l:"1 — Import. Direta"},{v:"2",l:"2 — Import. Merc. Interno"},{v:"3",l:"3 — Nac. >40% Import."},{v:"4",l:"4 — Nac. Proc. Basicos"},{v:"5",l:"5 — Nac. <=40% Import."},{v:"6",l:"6 — Import. s/ Similar"},{v:"7",l:"7 — Import. MI s/ Similar"}].map(o => `<option value="${o.v}">${o.l}</option>`).join("");

  let embsHtml = _novoProdutoEmbs.map((emb, i) => `
    <div style="display:grid;grid-template-columns:1fr .6fr .6fr auto;gap:.5rem;align-items:end;margin-bottom:.5rem" data-novo-emb="${i}">
      <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Descricao</label><input type="text" class="novo-emb-desc" value="${esc(emb.descricao)}" placeholder="Ex: Pacote 5kg" style="width:100%"></div>
      <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Qtd Base</label><input type="number" class="novo-emb-qtd" value="${emb.quantidade_base}" min="1" style="width:100%"></div>
      <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">P. Venda</label><input type="number" class="novo-emb-preco" value="${emb.preco_referencia}" min="0" step="0.01" style="width:100%"></div>
      <div><button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="removerEmbNovoProduto(${i})">X</button></div>
    </div>
  `).join("");

  const formHtml = `
    <div style="padding:0;width:100%;max-width:100%">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid rgba(143,197,157,.25)">
        <h2 style="font-size:1.1rem;font-weight:600;margin:0;flex:1">Novo Produto</h2>
      </div>
      <div style="margin-bottom:.75rem">
        <label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Nome do Produto</label>
        <input type="text" id="ei-produto-nome" placeholder="Ex: Arroz" style="width:100%">
      </div>
      <div style="margin-bottom:.75rem">
        <label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Tipo de Produto</label>
        <div style="display:flex;gap:.8rem">
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.4rem .7rem;background:var(--bg);border:1px solid var(--bdr);border-radius:4px;flex:1">
            <input type="radio" name="ei-prod-tipo" value="comum" checked onchange="atualizarUnidadesPorTipo('ei')"> Produto Comum
          </label>
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.4rem .7rem;background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.25);border-radius:4px;flex:1">
            <input type="radio" name="ei-prod-tipo" value="critico" onchange="atualizarUnidadesPorTipo('ei')"> Produto Critico
          </label>
        </div>
        <div style="font-size:.68rem;color:var(--mut);margin-top:.25rem">Produto critico permite cadastrar embalagens do mercado para conversao de demanda (ex: contratado 170g, mercado 360g).</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label id="ei-produto-unidade-label" style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Unidade</label><select id="ei-produto-unidade" style="width:100%">${UNIT_OPTS_COMUM}</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">SKU / Cod. Barras</label><input type="text" id="ei-produto-sku" placeholder="Auto se vazio" style="width:100%"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">NCM</label><input type="text" id="ei-produto-ncm" placeholder="Digite nome ou codigo..." list="ncm-datalist" oninput="filtrarNCM(this)" autocomplete="off" style="width:100%"><datalist id="ncm-datalist"></datalist></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><div style="display:flex;gap:.35rem"><select id="ei-produto-categoria" style="flex:1">${CAT_OPTS}</select><button class="btn btn-outline btn-sm" onclick="adicionarCategoriaCustom()" title="Nova categoria" style="padding:.35rem .5rem">+</button><button class="btn btn-outline btn-sm" onclick="abrirGerenciadorCategorias()" title="Gerenciar categorias" style="padding:.35rem .5rem;font-size:.7rem">⚙</button></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Origem NF-e</label><select id="ei-produto-origem" style="width:100%">${ORI_OPTS}</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Preco de Custo</label><input type="number" id="ei-produto-preco-custo" placeholder="0.00" min="0" step="0.01" style="width:100%"></div>
        <div id="ei-preco-ref-wrap"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Preco de Venda</label><input type="number" id="ei-produto-preco-ref" placeholder="0.00" min="0" step="0.01" style="width:100%"></div>
      </div>
      <div id="novo-prod-embalagens-section" style="border-top:1px solid var(--bdr);margin:1rem 0;padding-top:1rem;display:none">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <div style="font-size:.85rem;font-weight:700">Embalagens (${_novoProdutoEmbs.length})</div>
          <button class="btn btn-green btn-sm" onclick="adicionarEmbNovoProduto()">+ Embalagem</button>
        </div>
        <div id="novo-embs-list">${embsHtml || '<div style="font-size:.82rem;color:var(--mut);padding:.5rem 0">Nenhuma embalagem.</div>'}</div>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-outline" onclick="toggleFormNovoProduto()">Cancelar</button>
        <button class="btn btn-green" onclick="salvarNovoProdutoModal()">Salvar Produto</button>
      </div>
    </div>
  `;
  if (useInline) {
    detalhePage.innerHTML = formHtml;
    listagem.classList.add("hidden");
    detalhePage.classList.remove("hidden");
    // Esconder overlay antigo se existir
    if (overlay) overlay.classList.add("hidden");
  } else {
    overlay.innerHTML = formHtml;
  }
  setTimeout(() => document.getElementById("ei-produto-nome")?.focus(), 50);
}

function adicionarEmbNovoProduto() {
  // Salvar valores atuais antes de re-render
  document.querySelectorAll("#novo-embs-list [data-novo-emb]").forEach((row, i) => {
    if (_novoProdutoEmbs[i]) {
      _novoProdutoEmbs[i].descricao = row.querySelector(".novo-emb-desc")?.value || "";
      _novoProdutoEmbs[i].quantidade_base = Number(row.querySelector(".novo-emb-qtd")?.value) || 1;
      _novoProdutoEmbs[i].preco_referencia = Number(row.querySelector(".novo-emb-preco")?.value) || 0;
    }
  });
  _novoProdutoEmbs.push({ id: "temp-" + _novoProdutoEmbs.length, descricao: "", quantidade_base: 1, preco_referencia: 0 });
  // Salvar campos do produto antes de re-render
  const prodData = _capturarCamposNovoProduto();
  renderModalNovoProduto();
  _restaurarCamposNovoProduto(prodData);
}

function removerEmbNovoProduto(idx) {
  if (_novoProdutoEmbs.length <= 1) { showToast("Minimo 1 embalagem.", 2000); return; }
  // Salvar valores
  document.querySelectorAll("#novo-embs-list [data-novo-emb]").forEach((row, i) => {
    if (_novoProdutoEmbs[i]) {
      _novoProdutoEmbs[i].descricao = row.querySelector(".novo-emb-desc")?.value || "";
      _novoProdutoEmbs[i].quantidade_base = Number(row.querySelector(".novo-emb-qtd")?.value) || 1;
      _novoProdutoEmbs[i].preco_referencia = Number(row.querySelector(".novo-emb-preco")?.value) || 0;
    }
  });
  _novoProdutoEmbs.splice(idx, 1);
  const prodData = _capturarCamposNovoProduto();
  renderModalNovoProduto();
  _restaurarCamposNovoProduto(prodData);
}

function _capturarCamposNovoProduto() {
  const tipoEl = document.querySelector('input[name="ei-prod-tipo"]:checked');
  return {
    nome: document.getElementById("ei-produto-nome")?.value || "",
    tipo: tipoEl ? tipoEl.value : "comum",
    unidade: document.getElementById("ei-produto-unidade")?.value || "UN",
    sku: document.getElementById("ei-produto-sku")?.value || "",
    ncm: document.getElementById("ei-produto-ncm")?.value || "",
    categoria: document.getElementById("ei-produto-categoria")?.value || "",
    origem: document.getElementById("ei-produto-origem")?.value || "0"
  };
}

function _restaurarCamposNovoProduto(d) {
  const el = (id) => document.getElementById(id);
  if (el("ei-produto-nome")) el("ei-produto-nome").value = d.nome;
  // Restaurar tipo critico/comum antes de restaurar unidade (atualizarUnidadesPorTipo muda as opções)
  if (d.tipo) {
    const tipoRadio = document.querySelector('input[name="ei-prod-tipo"][value="' + d.tipo + '"]');
    if (tipoRadio) { tipoRadio.checked = true; atualizarUnidadesPorTipo('ei'); }
  }
  if (el("ei-produto-unidade")) el("ei-produto-unidade").value = d.unidade;
  if (el("ei-produto-sku")) el("ei-produto-sku").value = d.sku;
  if (el("ei-produto-ncm")) el("ei-produto-ncm").value = d.ncm;
  if (el("ei-produto-categoria")) el("ei-produto-categoria").value = d.categoria;
  if (el("ei-produto-origem")) el("ei-produto-origem").value = d.origem;
}

function salvarNovoProdutoModal() {
  const nome = (document.getElementById("ei-produto-nome")?.value || "").trim();
  if (!nome) { showToast("Informe o nome do produto.", 3000); return; }
  const unidade_base = document.getElementById("ei-produto-unidade")?.value || "UN";
  const skuManual = (document.getElementById("ei-produto-sku")?.value || "").trim();
  const sku = skuManual || gerarProximoSKU();
  const ncmRaw = (document.getElementById("ei-produto-ncm")?.value || "").trim();
  const ncm = ncmRaw.includes(" — ") ? ncmRaw.split(" — ")[0].trim() : ncmRaw;
  const categoria = document.getElementById("ei-produto-categoria")?.value || "";
  const origem = document.getElementById("ei-produto-origem")?.value || "0";

  const prodTipoEl = document.querySelector('input[name="ei-prod-tipo"]:checked');
  const produto_critico = prodTipoEl ? prodTipoEl.value === "critico" : false;

  const preco_custo = parseFloat(document.getElementById("ei-produto-preco-custo")?.value) || 0;
  const preco_referencia = parseFloat(document.getElementById("ei-produto-preco-ref")?.value) || 0;

  const prodId = genId("PROD");
  estoqueIntelProdutos.push({ id: prodId, nome, unidade_base, sku, ncm, categoria, origem, produto_critico, preco_custo, preco_referencia });
  saveEstoqueIntelProdutos();

  // Salvar embalagens do modal
  document.querySelectorAll("#novo-embs-list [data-novo-emb]").forEach((row, i) => {
    const desc = (row.querySelector(".novo-emb-desc")?.value || "").trim();
    const qtd = Number(row.querySelector(".novo-emb-qtd")?.value) || 1;
    const preco = Number(row.querySelector(".novo-emb-preco")?.value) || 0;
    if (desc || preco) {
      estoqueIntelEmbalagens.push({ id: genId("EMB"), produto_id: prodId, descricao: desc || nome, codigo_barras: sku, quantidade_base: qtd, preco_referencia: preco });
    }
  });
  saveEstoqueIntelEmbalagens();

  toggleFormNovoProduto();
  renderEstoque();
  showToast("Produto cadastrado com " + document.querySelectorAll("#novo-embs-list [data-novo-emb]").length + " embalagem(ns).", 3000);
}

// === Categoria Custom ===
// Story 4.51 AC-G2: persist custom categories to localStorage
const CATEGORIAS_CUSTOM_KEY = "gdp.categorias-produto.custom.v1";

function _loadCategoriasCustom() {
  try { return JSON.parse(localStorage.getItem(CATEGORIAS_CUSTOM_KEY) || "[]"); } catch(_) { return []; }
}

function _saveCategoriasCustom(cats) {
  localStorage.setItem(CATEGORIAS_CUSTOM_KEY, JSON.stringify(cats));
  // Story 4.51 AC-G2: also sync to cloud
  if (typeof cloudSave === 'function') cloudSave(CATEGORIAS_CUSTOM_KEY, cats);
}

function adicionarCategoriaCustom() {
  const nome = prompt("Nome da nova categoria:");
  if (!nome || !nome.trim()) return;
  const sel = document.getElementById("ei-produto-categoria");
  if (!sel) return;
  const exists = Array.from(sel.options).some(o => o.value.toLowerCase() === nome.trim().toLowerCase());
  if (exists) { showToast("Categoria ja existe.", 2500); return; }
  const opt = document.createElement("option");
  opt.value = nome.trim();
  opt.textContent = nome.trim();
  sel.insertBefore(opt, sel.lastElementChild);
  sel.value = nome.trim();
  // Story 4.51 AC-G2: persist to localStorage
  const customs = _loadCategoriasCustom();
  if (!customs.includes(nome.trim())) { customs.push(nome.trim()); _saveCategoriasCustom(customs); }
  showToast("Categoria adicionada: " + nome.trim(), 2500);
}

// Story 4.51 AC-G3: edit and delete categories
window.editarCategoria = function(oldName) {
  const newName = prompt("Novo nome para a categoria:", oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  // Update in custom list
  const customs = _loadCategoriasCustom();
  const idx = customs.indexOf(oldName);
  if (idx >= 0) { customs[idx] = newName.trim(); _saveCategoriasCustom(customs); }
  // Update all products with old category
  if (typeof estoqueIntelProdutos !== 'undefined') {
    estoqueIntelProdutos.filter(p => p.categoria === oldName).forEach(p => { p.categoria = newName.trim(); });
    if (typeof saveEstoqueIntelProdutos === 'function') saveEstoqueIntelProdutos();
  }
  showToast("Categoria renomeada: " + newName.trim(), 2500);
  if (typeof renderProdutos === 'function') renderProdutos();
};

window.excluirCategoria = function(name) {
  if (!confirm('Excluir a categoria "' + name + '"? Produtos vinculados ficarão sem categoria.')) return;
  const customs = _loadCategoriasCustom();
  const idx = customs.indexOf(name);
  if (idx >= 0) { customs.splice(idx, 1); _saveCategoriasCustom(customs); }
  // Clear category from products
  if (typeof estoqueIntelProdutos !== 'undefined') {
    estoqueIntelProdutos.filter(p => p.categoria === name).forEach(p => { p.categoria = ""; });
    if (typeof saveEstoqueIntelProdutos === 'function') saveEstoqueIntelProdutos();
  }
  showToast("Categoria excluída: " + name, 2500);
  if (typeof renderProdutos === 'function') renderProdutos();
};

// Story 4.53 AC-2: UI para gerenciar categorias custom
window.abrirGerenciadorCategorias = function() {
  const customs = _loadCategoriasCustom();
  if (!customs.length) { showToast("Nenhuma categoria customizada. Use o botão + para criar.", 3000); return; }
  const listHtml = customs.map(c =>
    '<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;border-bottom:1px solid var(--bdr)">'
    + '<span style="flex:1;font-size:.85rem">' + c + '</span>'
    + '<button class="btn btn-outline btn-sm" onclick="editarCategoria(\'' + c.replace(/'/g, "\\'") + '\');abrirGerenciadorCategorias()" style="padding:.2rem .4rem;font-size:.7rem" title="Renomear">✏️</button>'
    + '<button class="btn btn-outline btn-sm" onclick="excluirCategoria(\'' + c.replace(/'/g, "\\'") + '\');abrirGerenciadorCategorias()" style="padding:.2rem .4rem;font-size:.7rem;color:var(--red)" title="Excluir">🗑️</button>'
    + '</div>'
  ).join('');
  const overlay = document.getElementById('vincular-cadastro-overlay') || document.createElement('div');
  overlay.id = 'cat-manager-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:10px;width:380px;max-width:90vw;padding:1.2rem 1.5rem" onclick="event.stopPropagation()">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><h3 style="margin:0;font-size:.95rem">Gerenciar Categorias</h3><button class="btn btn-outline btn-sm" onclick="document.getElementById(\'cat-manager-overlay\').remove()">Fechar</button></div>'
    + '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--bdr);border-radius:6px">' + listHtml + '</div>'
    + '<div style="margin-top:.8rem;font-size:.72rem;color:var(--mut)">Categorias padrão (Hortifruti, Carnes, etc.) não podem ser editadas.</div>'
    + '</div>';
  document.body.appendChild(overlay);
};

// === Download Modelo Excel ===
function downloadModeloProdutos() {
  if (typeof XLSX === "undefined") { showToast("XLSX nao carregou.", 3000); return; }
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["Nome", "Unidade Base", "SKU", "NCM", "Categoria", "Origem (0-7)", "Tipo (comum/critico)", "Embalagem", "Qtd Embalagem", "Preco de Venda"],
    ["Arroz Tipo 1", "KG", "789001", "1006.30.00", "Graos/Cereais", 0, "critico", "Pacote 5kg", 5, 22.50],
    ["Caneta Esferografica", "UN", "789003", "9608.10.00", "Outros", 0, "comum", "Caixa 50un", 50, 35.00],
    ["Feijao Carioca", "KG", "789002", "0713.33.19", "Graos/Cereais", 0, "critico", "Pacote 1kg", 1, 8.90]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{wch:22},{wch:12},{wch:14},{wch:14},{wch:16},{wch:12},{wch:16},{wch:18},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  const refData = [
    ["Codigo", "Descricao"],
    [0, "Nacional"],
    [1, "Estrangeira - Importacao direta"],
    [2, "Estrangeira - Adquirida no mercado interno"],
    [3, "Nacional - Conteudo importacao >40%"],
    [4, "Nacional - Processos produtivos basicos"],
    [5, "Nacional - Conteudo importacao <=40%"],
    [6, "Estrangeira - Importacao direta, sem similar (CAMEX)"],
    [7, "Estrangeira - Mercado interno, sem similar (CAMEX)"]
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refData);
  wsRef["!cols"] = [{wch:8},{wch:55}];
  XLSX.utils.book_append_sheet(wb, wsRef, "Referencia Origem");
  XLSX.writeFile(wb, "modelo-importacao-produtos-gdp.xlsx");
  showToast("Modelo Excel baixado.", 2500);
}

// === Importar Produtos via Excel ===
function importarProdutosExcel() {
  if (typeof XLSX === "undefined") { showToast("XLSX nao carregou.", 3000); return; }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx,.csv";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) { showToast("Planilha vazia.", 3000); return; }
      processarImportacaoProdutos(rows);
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function processarImportacaoProdutos(rows) {
  const header = rows[0];
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== undefined && c !== ""));
  const colMap = {};
  header.forEach((h, i) => {
    const hl = (h || "").toString().toLowerCase().trim();
    if (hl.includes("nome") || hl === "produto") colMap.nome = i;
    else if (hl.includes("unidade") || hl.includes("base")) colMap.unidade = i;
    else if (hl.includes("sku") || hl.includes("barras")) colMap.sku = i;
    else if (hl.includes("ncm")) colMap.ncm = i;
    else if (hl.includes("categ")) colMap.categoria = i;
    else if (hl.includes("orig")) colMap.origem = i;
    else if (hl.includes("tipo") || hl.includes("critico") || hl.includes("comum")) colMap.tipo = i;
    else if (hl.includes("embalag") && !hl.includes("qtd") && !hl.includes("prec")) colMap.embDescricao = i;
    else if (hl.includes("qtd")) colMap.embQtd = i;
    else if (hl.includes("prec") || hl.includes("valor")) colMap.embPreco = i;
  });
  const validOrigens = ["0","1","2","3","4","5","6","7"];
  const parsed = dataRows.map(r => {
    const nome = (r[colMap.nome] || "").toString().trim();
    const unidade = (r[colMap.unidade] || "UN").toString().trim().toUpperCase() || "UN";
    const sku = (r[colMap.sku] || "").toString().trim();
    const ncm = (r[colMap.ncm] || "").toString().trim();
    const categoria = (r[colMap.categoria] || "").toString().trim();
    const origem = (r[colMap.origem] !== undefined ? r[colMap.origem] : "0").toString().trim();
    const embDescricao = (r[colMap.embDescricao] || "").toString().trim();
    const embQtd = Number(r[colMap.embQtd] || 1) || 1;
    const embPreco = Number((r[colMap.embPreco] || "0").toString().replace(",", ".")) || 0;
    const errors = [];
    if (!nome) errors.push("Nome obrigatorio");
    if (!validOrigens.includes(origem)) errors.push("Origem invalida");
    const tipo = (r[colMap.tipo] || "comum").toString().trim().toLowerCase();
    const produto_critico = tipo === "critico";
    return { nome, unidade, sku, ncm, categoria, origem, produto_critico, embDescricao, embQtd, embPreco, errors };
  });
  const errorCount = parsed.filter(p => p.errors.length > 0).length;
  const validCount = parsed.length - errorCount;
  let msg = `Importacao: ${parsed.length} linha(s) lida(s), ${validCount} valida(s)`;
  if (errorCount > 0) msg += `, ${errorCount} com erro(s) ignorada(s)`;
  if (validCount === 0) { showToast("Nenhum produto valido encontrado.", 3500); return; }
  if (!confirm(msg + ". Confirmar importacao?")) return;
  let importados = 0;
  parsed.filter(p => p.errors.length === 0).forEach(p => {
    const prodId = genId("PROD");
    const autoSku = p.sku || gerarProximoSKU();
    estoqueIntelProdutos.push({ id: prodId, nome: p.nome, unidade_base: p.unidade, sku: autoSku, ncm: p.ncm, categoria: p.categoria, origem: p.origem, produto_critico: p.produto_critico });
    if (p.embDescricao || p.embPreco) {
      estoqueIntelEmbalagens.push({ id: genId("EMB"), produto_id: prodId, descricao: p.embDescricao || p.nome, codigo_barras: autoSku, quantidade_base: p.embQtd, preco_referencia: p.embPreco });
    }
    importados++;
  });
  saveEstoqueIntelProdutos();
  saveEstoqueIntelEmbalagens();
  renderEstoque();
  showToast(`${importados} produto(s) importado(s) com sucesso!`, 4000);
}

// ===== Story 8.13: Importar produtos da NF de Entrada para Central de Produtos =====
window.importarNfParaCentral = function(nfId) {
  const nf = notasEntrada.find(n => n.id === nfId);
  if (!nf || !nf.itens || nf.itens.length === 0) {
    showToast("Nota sem itens para importar.", 3000);
    return;
  }

  // Use bancoProdutos (gdp-banco-produtos.js) — the real Central de Produtos
  if (typeof bancoProdutos === 'undefined' || !bancoProdutos) {
    showToast("Central de Produtos não carregada. Recarregue a página.", 4000);
    return;
  }
  if (typeof loadBancoProdutos === 'function' && (!bancoProdutos.itens || bancoProdutos.itens.length === 0)) {
    loadBancoProdutos();
  }

  let importados = 0, atualizados = 0, ignorados = 0;
  const central = bancoProdutos.itens || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  nf.itens.forEach(item => {
    const descNorm = (item.descricao || "").toLowerCase().trim();
    // Match: exact description OR same NCM + same description
    const existing = central.find(p => {
      const pDesc = (p.descricao || p.item || "").toLowerCase().trim();
      if (!pDesc || !descNorm) return false;
      if (pDesc === descNorm) return true;
      if (item.ncm && p.ncm === item.ncm && pDesc === descNorm) return true;
      return false;
    });

    if (existing) {
      // Product exists — update cost
      const oldCusto = existing.custoBase;
      existing.custoBase = item.valorUnitario || item.precoUnitario || existing.custoBase;
      existing.precoReferencia = existing.custoBase * (1 + (existing.margemAlvo || 0.30));
      if (!existing.custosFornecedor) existing.custosFornecedor = [];
      existing.custosFornecedor.push({
        fornecedor: nf.fornecedor || "NF Entrada",
        preco: existing.custoBase,
        data: todayStr,
        tipo: "nf_entrada"
      });
      existing.atualizadoEm = new Date().toISOString();
      if (existing.custoBase !== oldCusto) atualizados++;
      else ignorados++;
    } else {
      // New product — create in Central de Produtos
      const newProd = {
        id: genId("PROD"),
        descricao: item.descricao || item.codigo || "Sem descrição",
        sku: item.codigo || (item.ncm ? "NCM-" + item.ncm : ""),
        ncm: item.ncm || "",
        unidade: item.unidade || "UN",
        marca: "",
        grupo: "Importado NF",
        custoBase: item.valorUnitario || item.precoUnitario || 0,
        precoReferencia: (item.valorUnitario || 0) * 1.30,
        margemAlvo: 0.30,
        fonte: "NF #" + (nf.numero || nfId),
        custosFornecedor: [{
          fornecedor: nf.fornecedor || "NF Entrada",
          preco: item.valorUnitario || item.precoUnitario || 0,
          data: todayStr,
          tipo: "nf_entrada"
        }],
        concorrentes: [],
        propostas: [],
        historicoResultados: [],
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };
      bancoProdutos.itens.push(newProd);
      importados++;
    }
  });

  saveBancoProdutos();
  const msg = [];
  if (importados > 0) msg.push(`${importados} importado(s)`);
  if (atualizados > 0) msg.push(`${atualizados} atualizado(s)`);
  if (ignorados > 0) msg.push(`${ignorados} sem alteração`);
  showToast(`Central de Produtos: ${msg.join(", ")}`, 5000);
  // Refresh Central tab if visible
  if (typeof renderBancoProdutos === 'function') renderBancoProdutos();
};

// Selecionar todas as notas de entrada
window.toggleAllNotasEntrada = function(checked) {
  document.querySelectorAll(".ne-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoNotasEntrada();
};

// Atualizar selecao de notas de entrada (checkboxes → footer)
window.atualizarSelecaoNotasEntrada = function() {
  const all = [...document.querySelectorAll(".ne-check")];
  const selected = all.filter(cb => cb.checked);
  const summary = document.getElementById("ne-bulk-summary");
  const footer = document.getElementById("ne-page-footer");
  const header = document.getElementById("ne-select-all");
  if (summary) summary.textContent = `${selected.length} nota(s)`;
  if (footer) footer.classList.toggle("has-selection", selected.length > 0);
  if (header) {
    header.checked = all.length > 0 && selected.length === all.length;
    header.indeterminate = selected.length > 0 && selected.length < all.length;
  }
  if (selected.length > 0) {
    const selIds = new Set(selected.map(cb => cb.value));
    const selNfs = notasEntrada.filter(n => selIds.has(n.id));
    const totalValor = selNfs.reduce((s, n) => s + (Number(n.valor) || 0), 0);
    const qtdEl = document.getElementById("ne-footer-qtd");
    const valEl = document.getElementById("ne-footer-valor");
    if (qtdEl) qtdEl.textContent = String(selected.length).padStart(2, '0');
    if (valEl) valEl.textContent = brl.format(totalValor);
  } else {
    _updateNeFooterTotals();
  }
};

// Excluir notas de entrada selecionadas
window.excluirNotasEntradaSelecionadas = function() {
  const selected = [...document.querySelectorAll(".ne-check:checked")].map(cb => cb.value);
  if (selected.length === 0) { showToast("Selecione ao menos uma nota.", 3000); return; }
  if (!confirm(`Excluir ${selected.length} nota(s) de entrada?`)) return;
  const selSet = new Set(selected);
  notasEntrada = notasEntrada.filter(n => !selSet.has(n.id));
  saveNotasEntrada();

  // Story 4.51 AC-A1: track deleted IDs to prevent sync restoration
  try {
    const delKey = "gdp.notas-entrada.deleted.v1";
    const deleted = JSON.parse(localStorage.getItem(delKey) || "[]");
    selected.forEach(id => { if (!deleted.includes(id)) deleted.push(id); });
    localStorage.setItem(delKey, JSON.stringify(deleted));
  } catch(_) {}

  // Story 4.51 AC-A1: also update sync_data in cloud to remove deleted items
  if (typeof cloudSave === 'function') {
    cloudSave("gdp.notas-entrada.v1", { _v: 1, updatedAt: new Date().toISOString(), items: notasEntrada });
  }

  renderNotasEntrada();
  atualizarSelecaoNotasEntrada();
  showToast(`${selected.length} nota(s) excluída(s).`, 3000);
};

// Atualizar totais do footer NE
function _updateNeFooterTotals() {
  const qtdEl = document.getElementById("ne-footer-qtd");
  const valEl = document.getElementById("ne-footer-valor");
  if (qtdEl) qtdEl.textContent = String(notasEntrada.length).padStart(2, '0');
  if (valEl) valEl.textContent = brl.format(notasEntrada.reduce((s, n) => s + (Number(n.valor) || 0), 0));
}

// Toggle expand/collapse NF item rows
window.toggleNfItens = function(nfId) {
  const row = document.getElementById("nf-itens-" + nfId);
  if (row) row.style.display = row.style.display === "none" ? "table-row" : "none";
};

// ===== Story 8.13: Download PDF da NF de Entrada =====
window.downloadNfPdf = function(nfId) {
  const nf = notasEntrada.find(n => n.id === nfId);
  if (!nf) { showToast("Nota não encontrada.", 3000); return; }

  const filename = `NF-${nf.numero || nfId}-${(nf.fornecedor || "").slice(0, 20).replace(/\s+/g, "_")}.pdf`;
  const htmlBody = _gerarHtmlNfBody(nf);
  showToast("Gerando PDF...", 3000);

  // Use hidden iframe to avoid visible popup flash
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;height:600px;border:none;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head>
    <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:0;margin:0;color:#000}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;font-size:7pt;text-align:left;word-wrap:break-word}.text-right{text-align:right}</style>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
  </head><body>
    <div id="nf-content" style="width:720px;padding:10px;margin:0 auto">${htmlBody}</div>
    <script>
      function gerarPdf() {
        if (typeof html2pdf === 'undefined' || typeof JsBarcode === 'undefined') { setTimeout(gerarPdf, 200); return; }
        var barcodeEl = document.getElementById('danfe-barcode');
        if (barcodeEl) { try { JsBarcode(barcodeEl, '${(nf.chave || "").replace(/\D/g, "")}', { format: 'CODE128', width: 1.2, height: 45, displayValue: false, margin: 0 }); } catch(e) {} }
        var el = document.getElementById('nf-content');
        html2pdf().set({
          margin: [8, 5, 8, 5],
          filename: ${JSON.stringify(filename)},
          html2canvas: { scale: 2, useCORS: true, windowWidth: 740 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(el).save().then(function() {
          parent.postMessage('pdf-done', '*');
        }).catch(function() {
          parent.postMessage('pdf-done', '*');
        });
      }
      setTimeout(gerarPdf, 500);
    <\/script>
  </body></html>`);
  doc.close();

  // Cleanup iframe after PDF is downloaded
  const cleanup = () => { try { document.body.removeChild(iframe); } catch(_) {} };
  window.addEventListener("message", function handler(e) {
    if (e.data === "pdf-done") { window.removeEventListener("message", handler); setTimeout(cleanup, 500); }
  });
  setTimeout(cleanup, 30000); // safety cleanup after 30s
};

// Generate DANFE HTML body (official NF-e layout)
function _gerarHtmlNfBody(nf) {
  const d = nf.danfe || {};
  const fmt = (v) => { const n = Number(v || 0); return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const fmtCnpj = (c) => { c = (c||"").replace(/\D/g,""); if (c.length===14) return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5"); return c; };
  const fmtCep = (c) => { c = (c||"").replace(/\D/g,""); if (c.length===8) return c.replace(/^(\d{5})(\d{3})$/,"$1-$2"); return c; };
  const fmtData = (v) => { if (!v) return ""; try { return new Date(v).toLocaleDateString("pt-BR"); } catch(_) { return v; } };
  const fmtHora = (v) => { if (!v) return ""; try { const dt = new Date(v); return dt.toLocaleTimeString("pt-BR"); } catch(_) { return v; } };
  const tpNF = d.tpNF === "0" ? "0 - ENTRADA" : d.tpNF === "1" ? "1 - SAÍDA" : "";
  const chave = (nf.chave || "").replace(/(\d{4})/g, "$1 ").trim();
  const nProt = d.nProt || "";
  const dhProt = d.dhRecbto ? fmtData(d.dhRecbto) + " " + fmtHora(d.dhRecbto) : "";
  const modFrete = {"0":"0-Por conta do Emit","1":"1-Por conta do Dest","2":"2-Por conta de Terceiros","9":"9-Sem Frete"}[d.modFrete] || d.modFrete || "";
  const c = "border:1px solid #000;padding:1px 3px;font-size:7pt;line-height:1.2";
  const lbl = "font-size:5.5pt;color:#444;display:block;margin-bottom:0";
  const val = "font-size:7.5pt;font-weight:600";

  let html = `<div style="width:100%;font-family:Arial,sans-serif;color:#000;font-size:7pt">`;

  // === RECIBO ===
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:2px"><tr>
    <td style="${c};width:75%"><span style="${lbl}">RECEBEMOS DE ${d.emitNome || nf.fornecedor || ""} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: ${fmtData(nf.emitidaEm)} VALOR TOTAL: R$ ${fmt(nf.valor)} DESTINATÁRIO: ${d.destNome || ""} - ${d.destEndereco || ""} ${d.destBairro || ""} ${d.destMunicipio || ""}-${d.destUf || ""}</span>
    <div style="margin-top:4px"><span style="${lbl}">DATA DE RECEBIMENTO</span><div style="height:14px;border-top:1px solid #000"></div></div></td>
    <td style="${c};text-align:center;vertical-align:top"><strong style="font-size:11pt">NF-e</strong><br><span style="font-size:9pt">N°. ${(nf.numero||"").replace(/^0+/,"").replace(/(\d{3})(?=\d)/g,"$1.")}</span><br><span style="font-size:8pt">Série ${d.serie || "001"}</span></td>
  </tr></table>`;

  // === EMITENTE + DANFE + CHAVE ===
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:2px"><tr>
    <td style="${c};width:40%;vertical-align:top">
      <span style="${lbl}">IDENTIFICAÇÃO DO EMITENTE</span>
      <div style="text-align:center;padding:6px 0">
        <strong style="font-size:10pt">${d.emitNome || nf.fornecedor || ""}</strong><br>
        <span style="font-size:7.5pt">${d.emitEndereco || ""}<br>${d.emitBairro || ""} - ${fmtCep(d.emitCep)}<br>${d.emitMunicipio || ""} - ${d.emitUf || ""} Fone: ${d.emitFone || ""}</span>
      </div>
    </td>
    <td style="${c};width:22%;text-align:center;vertical-align:top">
      <strong style="font-size:10pt">DANFE</strong><br>
      <span style="font-size:6.5pt">Documento Auxiliar da Nota<br>Fiscal Eletrônica</span><br>
      <div style="margin:4px 0"><span style="${val}">${tpNF}</span></div>
      <span style="font-size:8pt"><strong>N°. ${(nf.numero||"").replace(/^0+/,"").replace(/(\d{3})(?=\d)/g,"$1.")}</strong><br>Série ${d.serie || "001"}</span>
    </td>
    <td style="${c};width:38%;vertical-align:top;font-size:7pt">
      <div style="text-align:center;margin-bottom:2px"><svg id="danfe-barcode"></svg></div>
      <span style="${lbl}">CHAVE DE ACESSO</span>
      <div style="font-family:monospace;font-size:7pt;word-break:break-all;margin:2px 0">${chave}</div>
      <span style="font-size:5.5pt">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</span>
      <div style="margin-top:3px;border-top:1px solid #000;padding-top:2px">
        <span style="${lbl}">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
        <span style="font-size:7pt">${nProt} ${dhProt ? "- " + dhProt : ""}</span>
      </div>
    </td>
  </tr></table>`;

  // === NATUREZA + INSCRIÇÃO ===
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:2px"><tr>
    <td style="${c};width:60%"><span style="${lbl}">NATUREZA DA OPERAÇÃO</span><span style="${val}">${d.natOp || ""}</span></td>
    <td style="${c}"><span style="${lbl}">INSCRIÇÃO ESTADUAL</span><span style="${val}">${d.emitIE || ""}</span></td>
    <td style="${c}"><span style="${lbl}">CNPJ / CPF</span><span style="${val}">${fmtCnpj(d.emitCnpj || nf.cnpjEmitente)}</span></td>
  </tr></table>`;

  // === DESTINATÁRIO ===
  html += `<div style="${c};margin-bottom:2px;padding:1px"><strong style="font-size:7pt">DESTINATÁRIO / REMETENTE</strong></div>`;
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:2px">
    <tr>
      <td style="${c};width:50%"><span style="${lbl}">NOME / RAZÃO SOCIAL</span><span style="${val}">${d.destNome || ""}</span></td>
      <td style="${c}"><span style="${lbl}">CNPJ / CPF</span><span style="${val}">${fmtCnpj(d.destCnpj)}</span></td>
      <td style="${c}"><span style="${lbl}">DATA DA EMISSÃO</span><span style="${val}">${fmtData(nf.emitidaEm)}</span></td>
    </tr><tr>
      <td style="${c}"><span style="${lbl}">ENDEREÇO</span><strong style="font-size:8pt">${d.destEndereco || ""}</strong></td>
      <td style="${c}"><span style="${lbl}">BAIRRO / DISTRITO</span><strong style="font-size:8pt">${d.destBairro || ""}</strong></td>
      <td style="${c}"><span style="${lbl}">CEP</span><span style="${val}">${fmtCep(d.destCep)}</span></td>
    </tr><tr>
      <td style="${c}"><span style="${lbl}">MUNICÍPIO</span><strong style="font-size:8pt">${d.destMunicipio || ""}</strong></td>
      <td style="${c}"><span style="${lbl}">UF</span><span style="${val}">${d.destUf || ""}</span> &nbsp;&nbsp; <span style="${lbl};display:inline">FONE</span><span style="${val}">${d.destFone || ""}</span></td>
      <td style="${c}"><span style="${lbl}">INSCRIÇÃO ESTADUAL</span><span style="${val}">${d.destIE || ""}</span></td>
    </tr>
  </table>`;

  // === CÁLCULO DO IMPOSTO ===
  html += `<div style="${c};margin-bottom:2px;padding:1px"><strong style="font-size:7pt">CÁLCULO DO IMPOSTO</strong></div>`;
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:2px">
    <tr>
      <td style="${c}"><span style="${lbl}">BASE DE CÁLC. DO ICMS</span><span style="${val}">${fmt(d.vBC)}</span></td>
      <td style="${c}"><span style="${lbl}">VALOR DO ICMS</span><span style="${val}">${fmt(d.vICMS)}</span></td>
      <td style="${c}"><span style="${lbl}">BASE DE CÁLC. ICMS S.T.</span><span style="${val}">${fmt(d.vBCST)}</span></td>
      <td style="${c}"><span style="${lbl}">VALOR DO ICMS SUBST.</span><span style="${val}">${fmt(d.vST)}</span></td>
      <td style="${c}"><span style="${lbl}">V. IMP. IMPORTAÇÃO</span><span style="${val}">${fmt(d.vImp)}</span></td>
      <td style="${c}"><span style="${lbl}">V. TOTAL PRODUTOS</span><span style="${val}">${fmt(d.vProd)}</span></td>
    </tr><tr>
      <td style="${c}"><span style="${lbl}">VALOR DO FRETE</span><span style="${val}">${fmt(d.vFrete)}</span></td>
      <td style="${c}"><span style="${lbl}">VALOR DO SEGURO</span><span style="${val}">${fmt(d.vSeg)}</span></td>
      <td style="${c}"><span style="${lbl}">DESCONTO</span><span style="${val}">${fmt(d.vDesc)}</span></td>
      <td style="${c}"><span style="${lbl}">OUTRAS DESPESAS</span><span style="${val}">${fmt(d.vOutro)}</span></td>
      <td style="${c}"><span style="${lbl}">VALOR TOTAL IPI</span><span style="${val}">${fmt(d.vIPI)}</span></td>
      <td style="${c}"><span style="${lbl}">V. TOTAL DA NOTA</span><strong style="font-size:9pt">${fmt(d.vNF || nf.valor)}</strong></td>
    </tr>
  </table>`;

  // === TRANSPORTADOR ===
  html += `<div style="${c};margin-bottom:2px;padding:1px"><strong style="font-size:7pt">TRANSPORTADOR / VOLUMES TRANSPORTADOS</strong></div>`;
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:2px"><tr>
    <td style="${c};width:40%"><span style="${lbl}">NOME / RAZÃO SOCIAL</span><span style="${val}">${d.transpNome || ""}</span></td>
    <td style="${c}"><span style="${lbl}">FRETE</span><span style="${val}">${modFrete}</span></td>
    <td style="${c}" colspan="2">&nbsp;</td>
  </tr></table>`;

  // === DADOS DOS PRODUTOS ===
  html += `<div style="${c};padding:1px"><strong style="font-size:6.5pt">DADOS DOS PRODUTOS / SERVIÇOS</strong></div>`;
  const ch = c + ";font-size:6pt;text-align:center;padding:1px 2px;white-space:nowrap";
  const cd = c + ";font-size:6.5pt;padding:1px 2px";
  html += `<table style="width:100%;border-collapse:collapse">
    <tr style="background:#eee">
      <th style="${ch}">CÓDIGO</th><th style="${ch};white-space:normal">DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th style="${ch}">NCM/SH</th><th style="${ch}">O/CST</th><th style="${ch}">CFOP</th><th style="${ch}">UN</th><th style="${ch}">QUANT</th><th style="${ch}">VALOR UNIT</th><th style="${ch}">VALOR TOTAL</th><th style="${ch}">V.DESC</th><th style="${ch}">B.CÁLC ICMS</th>
    </tr>`;
  (nf.itens || []).forEach(item => {
    html += `<tr>
      <td style="${cd}">${item.codigo || ""}</td>
      <td style="${cd}">${item.descricao || ""}</td>
      <td style="${cd}">${item.ncm || ""}</td>
      <td style="${cd}">${(item.orig||"") + "/" + (item.cst||"")}</td>
      <td style="${cd}">${item.cfop || ""}</td>
      <td style="${cd}">${item.unidade || ""}</td>
      <td style="${cd};text-align:right">${fmt(item.quantidade)}</td>
      <td style="${cd};text-align:right">${fmt(item.valorUnitario || item.precoUnitario)}</td>
      <td style="${cd};text-align:right">${fmt(item.valorTotal)}</td>
      <td style="${cd};text-align:right">0,00</td>
      <td style="${cd};text-align:right">${fmt(item.vBC_item)}</td>
    </tr>`;
  });
  html += `</table>`;

  // === DADOS ADICIONAIS ===
  html += `<div style="${c};margin-top:8px;padding:1px"><strong style="font-size:6.5pt">DADOS ADICIONAIS</strong></div>`;
  html += `<table style="width:100%;border-collapse:collapse"><tr>
    <td style="${c};width:65%;vertical-align:top;min-height:80px;padding:3px 4px"><span style="${lbl}">INFORMAÇÕES COMPLEMENTARES</span><br><span style="font-size:6.5pt;line-height:1.4">${(d.infCpl || "").replace(/&lt;br\s*\/?&gt;/gi, "<br>")}</span></td>
    <td style="${c};vertical-align:top;padding:3px 4px"><span style="${lbl}">RESERVADO AO FISCO</span><span style="font-size:6.5pt">${d.infAdFisco || ""}</span></td>
  </tr></table>`;

  html += `</div>`;
  return html;
}

function _gerarHtmlNf(nf) {
  const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  let html = `<!DOCTYPE html><html><head><title>NF ${nf.numero || ""}</title><style>body{font-family:sans-serif;padding:2rem}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{border:1px solid #ccc;padding:.4rem .6rem;font-size:.85rem;text-align:left}th{background:#f5f5f5}</style></head><body>`;
  html += `<h2>NOTA FISCAL DE ENTRADA</h2>`;
  html += `<p><strong>Fornecedor:</strong> ${nf.fornecedor || "-"} | <strong>CNPJ:</strong> ${nf.cnpjEmitente || "-"}</p>`;
  html += `<p><strong>Número:</strong> ${nf.numero || "-"} | <strong>Chave:</strong> ${nf.chave || "-"}</p>`;
  html += `<p><strong>Emissão:</strong> ${nf.emitidaEm ? new Date(nf.emitidaEm).toLocaleDateString("pt-BR") : "-"} | <strong>Valor:</strong> ${brlFmt.format(Number(nf.valor || 0))}</p>`;
  if (nf.itens && nf.itens.length > 0) {
    html += `<table><thead><tr><th>#</th><th>Descrição</th><th>NCM</th><th>Qtd</th><th>Unid</th><th>V.Unit</th><th>V.Total</th></tr></thead><tbody>`;
    nf.itens.forEach((item, i) => {
      html += `<tr><td>${i + 1}</td><td>${item.descricao || "-"}</td><td>${item.ncm || "-"}</td><td>${item.quantidade || 0}</td><td>${item.unidade || "UN"}</td><td>${brlFmt.format(item.valorUnitario || 0)}</td><td>${brlFmt.format(item.valorTotal || 0)}</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</body></html>`;
  return html;
}