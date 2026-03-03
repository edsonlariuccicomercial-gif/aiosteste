/* ===================================================================
   Painel do Fornecedor — Caixa Escolar MG
   Vanilla JS | SRE Uberaba MVP
   =================================================================== */

// ===== CONSTANTS =====
const STORAGE_KEY = "caixaescolar.preorcamentos.v1";
const BANCO_STORAGE_KEY = "caixaescolar.banco.v1";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v) => (v * 100).toFixed(0) + "%";
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

// ===== STATE =====
let orcamentos = [];
let bancoPrecos = { updatedAt: "", itens: [] };
let preOrcamentos = {};
let perfil = {};
let sreData = {};
let activePreOrcamentoId = null;

// ===== SGD STATE =====
let sgdAvailable = false;

// ===== ELEMENT CACHE =====
const el = {
  kpiAbertos: document.getElementById("kpi-abertos"),
  kpiUrgentes: document.getElementById("kpi-urgentes"),
  kpiPendentes: document.getElementById("kpi-pendentes"),
  kpiFaturamento: document.getElementById("kpi-faturamento"),
  kpiMargem: document.getElementById("kpi-margem"),
  filtroMunicipio: document.getElementById("filtro-municipio"),
  filtroGrupo: document.getElementById("filtro-grupo"),
  filtroStatus: document.getElementById("filtro-status"),
  filtroTexto: document.getElementById("filtro-texto"),
  tbodyOrcamentos: document.getElementById("tbody-orcamentos"),
  orcamentosEmpty: document.getElementById("orcamentos-empty"),
  btnExportCsv: document.getElementById("btn-export-csv"),
  // Pré-orçamento
  preorcamentoTitulo: document.getElementById("preorcamento-titulo"),
  preorcamentoVazio: document.getElementById("preorcamento-vazio"),
  preorcamentoForm: document.getElementById("preorcamento-form"),
  preorcamentoEscola: document.getElementById("preorcamento-escola"),
  preorcamentoMunicipio: document.getElementById("preorcamento-municipio"),
  preorcamentoPrazo: document.getElementById("preorcamento-prazo"),
  preorcamentoFrete: document.getElementById("preorcamento-frete"),
  tbodyPreorcamento: document.getElementById("tbody-preorcamento"),
  preorcamentoTotal: document.getElementById("preorcamento-total"),
  preorcamentoMargemMedia: document.getElementById("preorcamento-margem-media"),
  btnAprovar: document.getElementById("btn-aprovar"),
  btnRecusar: document.getElementById("btn-recusar"),
  btnVoltar: document.getElementById("btn-preorcamento-voltar"),
  preorcamentosLista: document.getElementById("preorcamentos-lista"),
  tbodyPreorcamentosLista: document.getElementById("tbody-preorcamentos-lista"),
  // Banco de preços
  filtroBancoGrupo: document.getElementById("filtro-banco-grupo"),
  filtroBancoTexto: document.getElementById("filtro-banco-texto"),
  tbodyBanco: document.getElementById("tbody-banco"),
  bancoEmpty: document.getElementById("banco-empty"),
  btnAddPreco: document.getElementById("btn-add-preco"),
  btnExportBanco: document.getElementById("btn-export-banco"),
  // Modal banco
  modalBanco: document.getElementById("modal-banco"),
  modalBancoTitulo: document.getElementById("modal-banco-titulo"),
  modalItem: document.getElementById("modal-item"),
  modalGrupo: document.getElementById("modal-grupo"),
  modalUnidade: document.getElementById("modal-unidade"),
  modalCusto: document.getElementById("modal-custo"),
  modalMargem: document.getElementById("modal-margem"),
  modalFonte: document.getElementById("modal-fonte"),
  btnModalSalvar: document.getElementById("btn-modal-salvar"),
  btnModalCancelar: document.getElementById("btn-modal-cancelar"),
  // Import Excel
  btnImportExcel: document.getElementById("btn-import-excel"),
  importFileInput: document.getElementById("import-file-input"),
  modalImport: document.getElementById("modal-import"),
  importFilename: document.getElementById("import-filename"),
  importMapping: document.getElementById("import-mapping"),
  theadImportPreview: document.getElementById("thead-import-preview"),
  tbodyImportPreview: document.getElementById("tbody-import-preview"),
  importStats: document.getElementById("import-stats"),
  btnImportConfirmar: document.getElementById("btn-import-confirmar"),
  btnImportCancelar: document.getElementById("btn-import-cancelar"),
  // SGD + Editar
  btnEnviarSgd: document.getElementById("btn-enviar-sgd"),
  btnEditarOrcamento: document.getElementById("btn-editar-orcamento"),
  modeIndicator: document.getElementById("mode-indicator"),
};

// ===== UTILITIES =====
function normalizedText(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(v) {
  const d = document.createElement("div");
  d.textContent = String(v || "");
  return d.innerHTML;
}

function daysTo(dateIso) {
  if (!dateIso) return 999;
  const target = new Date(dateIso + "T00:00:00");
  return Math.ceil((target - today) / 86400000);
}

function formatDate(dateIso) {
  if (!dateIso) return "—";
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y}`;
}

function calcFreteEstimado(municipio) {
  if (!perfil.distancias || !perfil.distancias.estimativas) return 0;
  const km = perfil.distancias.estimativas[municipio] || 0;
  const custoPorKm = perfil.config ? perfil.config.fretePadraoKm || 1.20 : 1.20;
  return km * custoPorKm;
}

function findBancoItem(nomeItem) {
  const norm = normalizedText(nomeItem);
  return bancoPrecos.itens.find((bp) => normalizedText(bp.item) === norm) || null;
}

// ===== DATA LOADING =====
async function fetchJson(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    console.warn("Falha ao carregar " + path, e);
    return null;
  }
}

function loadPreOrcamentos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    preOrcamentos = raw ? JSON.parse(raw) : {};
  } catch (_) {
    preOrcamentos = {};
  }
}

function savePreOrcamentos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preOrcamentos));
  } catch (_) { /* no-op */ }
}

function loadBancoLocal() {
  try {
    const raw = localStorage.getItem(BANCO_STORAGE_KEY);
    if (raw) {
      const local = JSON.parse(raw);
      if (local && Array.isArray(local.itens)) {
        bancoPrecos = local;
        return true;
      }
    }
  } catch (_) { /* no-op */ }
  return false;
}

function saveBancoLocal() {
  try {
    bancoPrecos.updatedAt = new Date().toISOString().slice(0, 10);
    localStorage.setItem(BANCO_STORAGE_KEY, JSON.stringify(bancoPrecos));
  } catch (_) { /* no-op */ }
}

// ===== BOOT =====
async function boot() {
  loadPreOrcamentos();

  const [orcData, bancoData, perfilData, sreInfo] = await Promise.all([
    fetchJson("data/orcamentos.json"),
    fetchJson("data/banco-precos.json"),
    fetchJson("data/perfil.json"),
    fetchJson("data/sre-uberaba.json"),
  ]);

  orcamentos = Array.isArray(orcData) ? orcData : [];
  perfil = perfilData || {};
  sreData = sreInfo || {};

  // Banco: usa localStorage se existir (edições do usuário), senão carrega do JSON
  if (!loadBancoLocal() && bancoData && Array.isArray(bancoData.itens)) {
    bancoPrecos = bancoData;
    saveBancoLocal();
  }

  populateFilters();
  bindEvents();
  renderAll();

  // Detect SGD API availability
  sgdAvailable = await isSgdApiAvailable();
  updateModeIndicator(sgdAvailable);
}

// ===== FILTERS =====
function populateFilters() {
  // Municípios
  const municipios = [...new Set(orcamentos.map((o) => o.municipio))].sort();
  municipios.forEach((m) => {
    el.filtroMunicipio.appendChild(new Option(m, m));
  });

  // Grupos
  const grupos = [...new Set(orcamentos.map((o) => o.grupo))].sort();
  grupos.forEach((g) => {
    el.filtroGrupo.appendChild(new Option(g, g));
  });

  // Banco grupos
  const bGrupos = [...new Set(bancoPrecos.itens.map((i) => i.grupo))].sort();
  bGrupos.forEach((g) => {
    el.filtroBancoGrupo.appendChild(new Option(g, g));
  });

  // Modal grupo (todos os grupos do perfil)
  const allGrupos = perfil.config && perfil.config.gruposAtendidos
    ? perfil.config.gruposAtendidos
    : grupos;
  allGrupos.forEach((g) => {
    el.modalGrupo.appendChild(new Option(g, g));
  });
}

function filteredOrcamentos() {
  const mun = el.filtroMunicipio.value;
  const grupo = el.filtroGrupo.value;
  const status = el.filtroStatus.value;
  const query = normalizedText(el.filtroTexto.value.trim());

  return orcamentos
    .filter((o) => mun === "all" || o.municipio === mun)
    .filter((o) => grupo === "all" || o.grupo === grupo)
    .filter((o) => status === "all" || o.status === status)
    .filter((o) => {
      if (!query) return true;
      const text = normalizedText(
        [o.escola, o.municipio, o.grupo, o.objeto, o.id,
          ...(o.itens || []).map((i) => i.nome + " " + i.descricao)
        ].join(" ")
      );
      return text.includes(query);
    })
    .sort((a, b) => {
      // Abertos primeiro, depois por prazo
      if (a.status !== b.status) return a.status === "aberto" ? -1 : 1;
      return (a.prazo || "").localeCompare(b.prazo || "");
    });
}

// ===== RENDER =====
function renderAll() {
  renderKPIs();
  renderOrcamentos();
  renderPreOrcamentosLista();
  renderBanco();
}

function renderKPIs() {
  const abertos = orcamentos.filter((o) => o.status === "aberto");
  const urgentes = abertos.filter((o) => daysTo(o.prazo) <= 3);

  // Pré-orçamentos pendentes
  const pendentes = Object.values(preOrcamentos).filter((p) => p.status === "pendente");

  // Faturamento potencial (soma dos pré-orçamentos aprovados)
  const aprovados = Object.values(preOrcamentos).filter((p) => p.status === "aprovado");
  const faturamento = aprovados.reduce((sum, p) => sum + (p.totalGeral || 0), 0);

  // Margem média dos aprovados
  const margens = aprovados.map((p) => p.margemMedia || 0).filter((m) => m > 0);
  const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  el.kpiAbertos.textContent = abertos.length;
  el.kpiUrgentes.textContent = urgentes.length;
  el.kpiUrgentes.className = urgentes.length > 0 ? "urgente" : "";
  el.kpiPendentes.textContent = pendentes.length;
  el.kpiFaturamento.textContent = brl.format(faturamento);
  el.kpiMargem.textContent = pct(margemMedia);
}

function renderOrcamentos() {
  const list = filteredOrcamentos();
  el.orcamentosEmpty.style.display = list.length ? "none" : "block";

  el.tbodyOrcamentos.innerHTML = list.map((o) => {
    const days = daysTo(o.prazo);
    let statusClass = "badge-aberto";
    let statusLabel = "Aberto";

    if (o.status === "encerrado") {
      statusClass = "badge-encerrado";
      statusLabel = "Encerrado";
    } else if (days <= 3) {
      statusClass = "badge-vencendo";
      statusLabel = days <= 0 ? "Vencido" : `${days}d`;
    }

    const preOrc = preOrcamentos[o.id];
    let actionBtn = "";
    if (o.status === "aberto") {
      if (preOrc) {
        const pBadge = preOrc.status === "enviado"
          ? '<span class="badge badge-enviado">Enviado</span>'
          : preOrc.status === "aprovado"
            ? '<span class="badge badge-aprovado">Aprovado</span>'
            : preOrc.status === "recusado"
              ? '<span class="badge badge-recusado">Recusado</span>'
              : '<span class="badge badge-pendente">Pendente</span>';
        actionBtn = `${pBadge} <button class="btn btn-inline" onclick="abrirPreOrcamento('${o.id}')">Ver</button>`;
      } else {
        actionBtn = `<button class="btn btn-inline btn-accent" onclick="gerarPreOrcamento('${o.id}')">Pré-Orçar</button>`;
      }
    }

    return `<tr>
      <td class="font-mono text-muted">${escapeHtml(o.id)}</td>
      <td>${escapeHtml(o.escola)}</td>
      <td>${escapeHtml(o.municipio)}</td>
      <td class="obj-cell" title="${escapeHtml(o.objeto)}">${escapeHtml(o.objeto)}</td>
      <td>${escapeHtml(o.grupo)}</td>
      <td class="nowrap">${formatDate(o.prazo)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td class="nowrap">${actionBtn}</td>
    </tr>`;
  }).join("");
}

// ===== PRÉ-ORÇAMENTO =====

// Gerar novo pré-orçamento
window.gerarPreOrcamento = function (orcId) {
  const orc = orcamentos.find((o) => o.id === orcId);
  if (!orc) return;

  const margemPadrao = perfil.config ? perfil.config.margemPadrao || 0.30 : 0.30;
  const frete = calcFreteEstimado(orc.municipio);

  const itens = (orc.itens || []).map((item) => {
    const bp = findBancoItem(item.nome);
    const custoUnit = bp ? bp.custoBase : 0;
    const margem = bp ? bp.margemPadrao : margemPadrao;
    const precoUnit = custoUnit > 0 ? Math.round(custoUnit * (1 + margem) * 100) / 100 : 0;

    return {
      nome: item.nome,
      descricao: item.descricao || "",
      quantidade: item.quantidade || 0,
      unidade: item.unidade || "Unidade",
      custoUnitario: custoUnit,
      margem: margem,
      precoUnitario: precoUnit,
      precoTotal: Math.round(precoUnit * (item.quantidade || 0) * 100) / 100,
    };
  });

  const totalGeral = itens.reduce((s, i) => s + i.precoTotal, 0);
  const margens = itens.filter((i) => i.custoUnitario > 0).map((i) => i.margem);
  const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : margemPadrao;

  preOrcamentos[orcId] = {
    orcamentoId: orcId,
    escola: orc.escola,
    municipio: orc.municipio,
    grupo: orc.grupo,
    status: "pendente",
    criadoEm: new Date().toISOString().slice(0, 10),
    freteEstimado: frete,
    itens: itens,
    totalGeral: Math.round(totalGeral * 100) / 100,
    margemMedia: margemMedia,
  };

  savePreOrcamentos();
  abrirPreOrcamento(orcId);
};

// Abrir pré-orçamento existente
window.abrirPreOrcamento = function (orcId) {
  activePreOrcamentoId = orcId;
  const pre = preOrcamentos[orcId];
  if (!pre) return;

  // Switch to tab
  switchTab("pre-orcamento");

  el.preorcamentoVazio.style.display = "none";
  el.preorcamentoForm.style.display = "block";
  el.btnVoltar.style.display = "inline-block";

  el.preorcamentoTitulo.textContent = `Pré-Orçamento #${orcId}`;
  el.preorcamentoEscola.textContent = pre.escola;
  el.preorcamentoMunicipio.textContent = pre.municipio;

  const orc = orcamentos.find((o) => o.id === orcId);
  el.preorcamentoPrazo.textContent = orc ? formatDate(orc.prazo) : "—";
  el.preorcamentoFrete.textContent = brl.format(pre.freteEstimado || 0) + " (estimativa)";

  renderPreOrcamentoItens();

  // Botões
  const isEditable = pre.status === "pendente";
  el.btnAprovar.style.display = isEditable ? "inline-block" : "none";
  el.btnRecusar.style.display = isEditable ? "inline-block" : "none";

  // Botão Editar: aparece quando aprovado ou enviado
  const showEditar = pre.status === "aprovado" || pre.status === "enviado";
  el.btnEditarOrcamento.style.display = showEditar ? "inline-block" : "none";

  // Botão SGD: aparece quando aprovado e servidor local ativo
  const showSgd = sgdAvailable && pre.status === "aprovado";
  el.btnEnviarSgd.style.display = showSgd ? "inline-block" : "none";
};

function renderPreOrcamentoItens() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  const isEditable = pre.status === "pendente";

  el.tbodyPreorcamento.innerHTML = pre.itens.map((item, idx) => {
    const custoInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${item.custoUnitario}" step="0.01" min="0" onchange="updatePreItem(${idx}, 'custoUnitario', this.value)" />`
      : brl.format(item.custoUnitario);

    const margemInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${(item.margem * 100).toFixed(0)}" step="1" min="0" max="100" onchange="updatePreItem(${idx}, 'margem', this.value)" />`
      : pct(item.margem);

    return `<tr>
      <td>
        <strong>${escapeHtml(item.nome)}</strong>
        <br><span class="text-muted" style="font-size:0.75rem">${escapeHtml(item.descricao)}</span>
        <br><span class="text-muted" style="font-size:0.72rem">${item.quantidade} ${escapeHtml(item.unidade)}</span>
      </td>
      <td class="text-right">${item.quantidade}</td>
      <td class="text-right">${custoInput}</td>
      <td class="text-right">${margemInput}</td>
      <td class="text-right font-mono">${brl.format(item.precoUnitario)}</td>
      <td class="text-right font-mono">${brl.format(item.precoTotal)}</td>
    </tr>`;
  }).join("");

  el.preorcamentoTotal.textContent = brl.format(pre.totalGeral);
  el.preorcamentoMargemMedia.textContent = pct(pre.margemMedia);
}

// Atualizar item do pré-orçamento
window.updatePreItem = function (idx, field, value) {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;

  const item = pre.itens[idx];

  if (field === "custoUnitario") {
    item.custoUnitario = Math.max(0, parseFloat(value) || 0);
    item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
  } else if (field === "margem") {
    item.margem = Math.max(0, Math.min(1, (parseFloat(value) || 0) / 100));
    item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
  }

  item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;

  // Recalcular totais
  pre.totalGeral = Math.round(pre.itens.reduce((s, i) => s + i.precoTotal, 0) * 100) / 100;
  const margens = pre.itens.filter((i) => i.custoUnitario > 0).map((i) => i.margem);
  pre.margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  savePreOrcamentos();
  renderPreOrcamentoItens();
  renderKPIs();
};

// Aprovar pré-orçamento
function aprovarPreOrcamento() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  // Validar: todos os itens precisam ter custo > 0
  const semCusto = pre.itens.filter((i) => i.custoUnitario <= 0);
  if (semCusto.length > 0) {
    alert("Preencha o custo unitário de todos os itens antes de aprovar.");
    return;
  }

  pre.status = "aprovado";
  pre.aprovadoEm = new Date().toISOString().slice(0, 10);
  savePreOrcamentos();

  renderPreOrcamentoItens();
  renderKPIs();
  renderOrcamentos();

  el.btnAprovar.style.display = "none";
  el.btnRecusar.style.display = "none";
  el.btnEditarOrcamento.style.display = "inline-block";
  el.btnEnviarSgd.style.display = sgdAvailable ? "inline-block" : "none";
}

// Recusar pré-orçamento
function recusarPreOrcamento() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  pre.status = "recusado";
  savePreOrcamentos();

  renderPreOrcamentoItens();
  renderKPIs();
  renderOrcamentos();

  el.btnAprovar.style.display = "none";
  el.btnRecusar.style.display = "none";
}

// Voltar (fechar pré-orçamento)
function voltarPreOrcamento() {
  activePreOrcamentoId = null;
  el.preorcamentoForm.style.display = "none";
  el.btnVoltar.style.display = "none";
  el.preorcamentoVazio.style.display = "none";
  el.preorcamentosLista.style.display = "block";
  el.preorcamentoTitulo.textContent = "Pré-Orçamentos Salvos";
  renderPreOrcamentosLista();
}

// Lista de pré-orçamentos salvos
function renderPreOrcamentosLista() {
  const items = Object.values(preOrcamentos);

  if (items.length === 0) {
    el.preorcamentosLista.style.display = "none";
    if (!activePreOrcamentoId) {
      el.preorcamentoVazio.style.display = "block";
    }
    return;
  }

  if (!activePreOrcamentoId) {
    el.preorcamentoVazio.style.display = "none";
    el.preorcamentosLista.style.display = "block";
    el.preorcamentoTitulo.textContent = "Pré-Orçamentos Salvos";
  }

  el.tbodyPreorcamentosLista.innerHTML = items
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""))
    .map((p) => {
      const badgeClass = p.status === "enviado" ? "badge-enviado"
        : p.status === "aprovado" ? "badge-aprovado"
          : p.status === "recusado" ? "badge-recusado" : "badge-pendente";
      return `<tr>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td><span class="badge ${badgeClass}">${p.status}</span></td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td class="nowrap">${formatDate(p.criadoEm)}</td>
        <td>
          <button class="btn btn-inline" onclick="abrirPreOrcamento('${p.orcamentoId}')">Ver</button>
          <button class="btn btn-inline btn-danger" onclick="removerPreOrcamento('${p.orcamentoId}')">Excluir</button>
        </td>
      </tr>`;
    }).join("");
}

window.removerPreOrcamento = function (orcId) {
  if (!confirm("Remover este pré-orçamento?")) return;
  delete preOrcamentos[orcId];
  savePreOrcamentos();
  renderAll();
  voltarPreOrcamento();
};

// ===== BANCO DE PREÇOS =====
let editingBancoId = null;

function filteredBanco() {
  const grupo = el.filtroBancoGrupo.value;
  const query = normalizedText(el.filtroBancoTexto.value.trim());

  return bancoPrecos.itens
    .filter((i) => grupo === "all" || i.grupo === grupo)
    .filter((i) => {
      if (!query) return true;
      return normalizedText(i.item + " " + i.grupo + " " + (i.fonte || "")).includes(query);
    })
    .sort((a, b) => (a.grupo + a.item).localeCompare(b.grupo + b.item));
}

function renderBanco() {
  const list = filteredBanco();
  el.bancoEmpty.style.display = list.length ? "none" : "block";

  el.tbodyBanco.innerHTML = list.map((item) => {
    return `<tr>
      <td><strong>${escapeHtml(item.item)}</strong></td>
      <td>${escapeHtml(item.grupo)}</td>
      <td>${escapeHtml(item.unidade || "—")}</td>
      <td class="text-right font-mono">${brl.format(item.custoBase)}</td>
      <td class="text-right">${pct(item.margemPadrao)}</td>
      <td class="text-right font-mono">${brl.format(item.precoReferencia)}</td>
      <td class="nowrap text-muted">${formatDate(item.ultimaCotacao)}</td>
      <td class="nowrap">
        <button class="btn btn-inline" onclick="editarBancoItem('${item.id}')">Editar</button>
        <button class="btn btn-inline btn-danger" onclick="removerBancoItem('${item.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join("");
}

function openBancoModal(item) {
  el.modalBanco.style.display = "flex";
  el.modalBancoTitulo.textContent = item ? "Editar Item" : "Novo Item";
  el.modalItem.value = item ? item.item : "";
  el.modalGrupo.value = item ? item.grupo : (el.modalGrupo.options[0] ? el.modalGrupo.options[0].value : "");
  el.modalUnidade.value = item ? (item.unidade || "") : "";
  el.modalCusto.value = item ? item.custoBase : "";
  el.modalMargem.value = item ? (item.margemPadrao * 100).toFixed(0) : "30";
  el.modalFonte.value = item ? (item.fonte || "") : "";
  editingBancoId = item ? item.id : null;
}

function closeBancoModal() {
  el.modalBanco.style.display = "none";
  editingBancoId = null;
}

function salvarBancoItem() {
  const nome = el.modalItem.value.trim();
  if (!nome) { alert("Informe o nome do item."); return; }

  const custo = parseFloat(el.modalCusto.value) || 0;
  const margem = Math.max(0, Math.min(100, parseFloat(el.modalMargem.value) || 30)) / 100;
  const preco = Math.round(custo * (1 + margem) * 100) / 100;

  if (editingBancoId) {
    const idx = bancoPrecos.itens.findIndex((i) => i.id === editingBancoId);
    if (idx >= 0) {
      bancoPrecos.itens[idx] = {
        ...bancoPrecos.itens[idx],
        item: nome,
        grupo: el.modalGrupo.value,
        unidade: el.modalUnidade.value.trim() || "Unidade",
        custoBase: custo,
        margemPadrao: margem,
        precoReferencia: preco,
        ultimaCotacao: new Date().toISOString().slice(0, 10),
        fonte: el.modalFonte.value.trim(),
      };
    }
  } else {
    const newId = "bp-" + String(Date.now()).slice(-6);
    bancoPrecos.itens.push({
      id: newId,
      item: nome,
      grupo: el.modalGrupo.value,
      unidade: el.modalUnidade.value.trim() || "Unidade",
      custoBase: custo,
      margemPadrao: margem,
      precoReferencia: preco,
      ultimaCotacao: new Date().toISOString().slice(0, 10),
      fonte: el.modalFonte.value.trim(),
    });
  }

  saveBancoLocal();
  closeBancoModal();
  renderBanco();
}

window.editarBancoItem = function (id) {
  const item = bancoPrecos.itens.find((i) => i.id === id);
  if (item) openBancoModal(item);
};

window.removerBancoItem = function (id) {
  if (!confirm("Remover este item do banco de preços?")) return;
  bancoPrecos.itens = bancoPrecos.itens.filter((i) => i.id !== id);
  saveBancoLocal();
  renderBanco();
};

// ===== EXPORT CSV =====
function exportCsvOrcamentos() {
  const list = filteredOrcamentos();
  const header = "ID;Escola;Municipio;SRE;Objeto;Grupo;Prazo;Status;Itens";
  const rows = list.map((o) => {
    const itensStr = (o.itens || []).map((i) => `${i.nome} (${i.quantidade} ${i.unidade})`).join(" | ");
    return [o.id, o.escola, o.municipio, o.sre, o.objeto, o.grupo, o.prazo, o.status, itensStr]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
  });
  downloadCsv("orcamentos-sre-uberaba.csv", [header, ...rows].join("\n"));
}

function exportCsvBanco() {
  const list = filteredBanco();
  const header = "Item;Grupo;Unidade;CustoBase;Margem;PrecoRef;UltimaCotacao;Fonte";
  const rows = list.map((i) => {
    return [i.item, i.grupo, i.unidade, i.custoBase, (i.margemPadrao * 100).toFixed(0) + "%", i.precoReferencia, i.ultimaCotacao, i.fonte || ""]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
  });
  downloadCsv("banco-precos.csv", [header, ...rows].join("\n"));
}

function downloadCsv(filename, content) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== TABS =====
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-content").forEach((tc) => {
    tc.classList.toggle("active", tc.id === "tab-" + tabId);
  });
}

// ===== EVENTS =====
function bindEvents() {
  // Tab navigation
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === "pre-orcamento" && !activePreOrcamentoId) {
        renderPreOrcamentosLista();
      }
    });
  });

  // Filtros orçamentos
  el.filtroMunicipio.addEventListener("change", renderOrcamentos);
  el.filtroGrupo.addEventListener("change", renderOrcamentos);
  el.filtroStatus.addEventListener("change", renderOrcamentos);
  el.filtroTexto.addEventListener("input", renderOrcamentos);

  // Filtros banco
  el.filtroBancoGrupo.addEventListener("change", renderBanco);
  el.filtroBancoTexto.addEventListener("input", renderBanco);

  // Pré-orçamento actions
  el.btnAprovar.addEventListener("click", aprovarPreOrcamento);
  el.btnRecusar.addEventListener("click", recusarPreOrcamento);
  el.btnVoltar.addEventListener("click", voltarPreOrcamento);

  // Banco actions
  el.btnAddPreco.addEventListener("click", () => openBancoModal(null));
  el.btnModalSalvar.addEventListener("click", salvarBancoItem);
  el.btnModalCancelar.addEventListener("click", closeBancoModal);

  // Modal overlay click to close
  el.modalBanco.addEventListener("click", (e) => {
    if (e.target === el.modalBanco) closeBancoModal();
  });

  // Export
  el.btnExportCsv.addEventListener("click", exportCsvOrcamentos);
  el.btnExportBanco.addEventListener("click", exportCsvBanco);

  // Import Excel
  el.btnImportExcel.addEventListener("click", openImportDialog);
  el.importFileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleExcelUpload(e.target.files[0]);
  });
  el.btnImportConfirmar.addEventListener("click", mergeImportIntoBanco);
  el.btnImportCancelar.addEventListener("click", closeImportModal);
  el.modalImport.addEventListener("click", (e) => {
    if (e.target === el.modalImport) closeImportModal();
  });

  // Editar orçamento aprovado
  el.btnEditarOrcamento.addEventListener("click", editarOrcamentoAprovado);

  // SGD
  el.btnEnviarSgd.addEventListener("click", enviarParaSgd);

  // Keyboard: Escape fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (el.modalImport.style.display !== "none") closeImportModal();
      else if (el.modalBanco.style.display !== "none") closeBancoModal();
    }
  });
}

// ===== EXCEL IMPORT =====
let importData = { rows: [], headers: [], mapping: {} };

function openImportDialog() {
  el.importFileInput.value = "";
  el.importFileInput.click();
}

function handleExcelUpload(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (json.length < 2) {
        alert("Planilha vazia ou sem dados.");
        return;
      }

      const headers = json[0].map((h) => String(h || "").trim());
      const rows = json.slice(1).filter((r) => r.some((c) => c != null && c !== ""));

      importData = { rows, headers, mapping: autoDetectColumns(headers) };
      previewImportData();
    } catch (err) {
      alert("Erro ao ler arquivo: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function autoDetectColumns(headers) {
  const mapping = { item: -1, preco: -1, unidade: -1, fornecedor: -1 };
  const norms = headers.map((h) => normalizedText(h));

  norms.forEach((h, i) => {
    if (mapping.item < 0 && /\b(item|produto|descricao|material|nome)\b/.test(h)) mapping.item = i;
    if (mapping.preco < 0 && /\b(preco|valor|custo|unitario|unit)\b/.test(h)) mapping.preco = i;
    if (mapping.unidade < 0 && /\b(unidade|un|und|medida)\b/.test(h)) mapping.unidade = i;
    if (mapping.fornecedor < 0 && /\b(fornecedor|fonte|marca|empresa)\b/.test(h)) mapping.fornecedor = i;
  });

  return mapping;
}

function previewImportData() {
  const { rows, headers, mapping } = importData;

  el.importFilename.textContent = el.importFileInput.files[0]
    ? el.importFileInput.files[0].name
    : "";

  // Column mapping dropdowns
  const colOpts = headers.map((h, i) => `<option value="${i}">${escapeHtml(h)}</option>`).join("");
  const noOpt = '<option value="-1">— Ignorar —</option>';

  el.importMapping.innerHTML = ["item", "preco", "unidade", "fornecedor"].map((key) => {
    const labels = { item: "Item / Produto", preco: "Preco / Custo", unidade: "Unidade", fornecedor: "Fornecedor" };
    const sel = mapping[key];
    const opts = noOpt + colOpts;
    return `<label>${labels[key]}
      <select data-map="${key}">${opts.replace(`value="${sel}"`, `value="${sel}" selected`)}</select>
    </label>`;
  }).join("");

  // Bind mapping change
  el.importMapping.querySelectorAll("select").forEach((s) => {
    s.addEventListener("change", () => {
      importData.mapping[s.dataset.map] = parseInt(s.value, 10);
    });
  });

  // Preview: first 5 rows
  const previewRows = rows.slice(0, 5);
  el.theadImportPreview.innerHTML = "<tr>" + headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("") + "</tr>";
  el.tbodyImportPreview.innerHTML = previewRows.map((row) =>
    "<tr>" + headers.map((_, i) => `<td>${escapeHtml(row[i] != null ? row[i] : "")}</td>`).join("") + "</tr>"
  ).join("");

  el.importStats.style.display = "none";
  el.modalImport.style.display = "flex";
}

function closeImportModal() {
  el.modalImport.style.display = "none";
  importData = { rows: [], headers: [], mapping: {} };
}

function mergeImportIntoBanco() {
  const { rows, mapping } = importData;

  if (mapping.item < 0) {
    alert("Selecione a coluna de Item / Produto.");
    return;
  }

  let updated = 0;
  let added = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  rows.forEach((row) => {
    const itemName = String(row[mapping.item] || "").trim();
    if (!itemName) return;

    const preco = mapping.preco >= 0 ? parseFloat(String(row[mapping.preco]).replace(",", ".")) || 0 : 0;
    const unidade = mapping.unidade >= 0 ? String(row[mapping.unidade] || "").trim() : "";
    const fornecedor = mapping.fornecedor >= 0 ? String(row[mapping.fornecedor] || "").trim() : "";

    // Try to match existing item
    const normName = normalizedText(itemName);
    const existing = bancoPrecos.itens.find((bp) => normalizedText(bp.item) === normName);

    if (existing) {
      if (preco > 0) existing.custoBase = preco;
      if (unidade) existing.unidade = unidade;
      if (fornecedor) existing.fonte = fornecedor;
      existing.precoReferencia = Math.round(existing.custoBase * (1 + existing.margemPadrao) * 100) / 100;
      existing.ultimaCotacao = todayStr;
      updated++;
    } else {
      const margemPadrao = 0.30;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      bancoPrecos.itens.push({
        id: newId,
        item: itemName,
        grupo: "Importado",
        unidade: unidade || "Unidade",
        custoBase: preco,
        margemPadrao: margemPadrao,
        precoReferencia: Math.round(preco * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr,
        fonte: fornecedor,
      });
      added++;
    }
  });

  saveBancoLocal();
  renderBanco();

  el.importStats.innerHTML = `${updated} itens atualizados, ${added} novos adicionados.`;
  el.importStats.style.display = "block";

  // Auto-close after brief delay
  setTimeout(() => {
    closeImportModal();
  }, 2000);
}

// ===== EDITAR ORÇAMENTO APROVADO =====
function editarOrcamentoAprovado() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  pre.status = "pendente";
  delete pre.aprovadoEm;
  delete pre.enviadoEm;
  savePreOrcamentos();

  // Re-render com campos editáveis
  abrirPreOrcamento(activePreOrcamentoId);
  renderKPIs();
  renderOrcamentos();
}

// ===== SGD INTEGRATION =====

async function isSgdApiAvailable() {
  try {
    const r = await fetch("/api/sgd/status", { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch (_) {
    return false;
  }
}

function updateModeIndicator(isLocal) {
  if (isLocal) {
    el.modeIndicator.textContent = "Modo Local";
    el.modeIndicator.className = "mode-indicator mode-local";
  } else {
    el.modeIndicator.textContent = "Modo Netlify";
    el.modeIndicator.className = "mode-indicator mode-netlify";
  }
}

async function enviarParaSgd() {
  if (!activePreOrcamentoId || !sgdAvailable) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || pre.status !== "aprovado") return;

  el.btnEnviarSgd.disabled = true;
  el.btnEnviarSgd.innerHTML = '<span class="sgd-spinner"></span>Enviando...';

  try {
    const payload = {
      orcamentoId: pre.orcamentoId,
      escola: pre.escola,
      municipio: pre.municipio,
      itens: pre.itens.map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        precoTotal: i.precoTotal,
      })),
      totalGeral: pre.totalGeral,
    };

    const r = await fetch("/api/sgd/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await r.json();

    if (r.ok && result.success) {
      pre.status = "enviado";
      pre.enviadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos();
      renderAll();
      alert("Proposta enviada ao SGD com sucesso!");
    } else {
      alert("Erro ao enviar: " + (result.error || "Falha desconhecida"));
    }
  } catch (err) {
    alert("Erro de conexao com o servidor: " + err.message);
  } finally {
    el.btnEnviarSgd.disabled = false;
    el.btnEnviarSgd.textContent = "Enviar ao SGD";
  }
}

// ===== INIT =====
boot();