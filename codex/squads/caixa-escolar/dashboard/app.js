/* ===================================================================
   Painel do Fornecedor — Caixa Escolar MG
   Vanilla JS | SRE Uberaba MVP — Fase 3
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
let selectedOrcIds = new Set();

// ===== SGD STATE =====
let sgdAvailable = false;
let sgdLocalServer = false; // true = Express server available, false = direct API mode
const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";
const SGD_CRED_KEY = "caixaescolar.sgd.credentials";

// ===== BROWSER SGD CLIENT (via Netlify Function proxy) =====
const PROXY_URL = "/.netlify/functions/sgd-proxy";
const BrowserSgdClient = {
  cookie: null,
  networkId: null,

  getCredentials() {
    const saved = localStorage.getItem(SGD_CRED_KEY);
    if (saved) return JSON.parse(saved);
    return null;
  },

  promptCredentials() {
    const cnpj = prompt("CNPJ do fornecedor (somente numeros):");
    if (!cnpj) return null;
    const pass = prompt("Senha SGD:");
    if (!pass) return null;
    const cred = { cnpj: cnpj.replace(/\D/g, ""), pass };
    localStorage.setItem(SGD_CRED_KEY, JSON.stringify(cred));
    return cred;
  },

  async proxy(body) {
    const r = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Proxy error (${r.status})`);
    return data;
  },

  async login() {
    const cred = this.getCredentials() || this.promptCredentials();
    if (!cred) throw new Error("Credenciais SGD nao informadas.");
    const result = await this.proxy({ action: "login", cnpj: cred.cnpj, password: cred.pass });
    if (!result.cookie) {
      localStorage.removeItem(SGD_CRED_KEY);
      throw new Error("Login SGD falhou.");
    }
    this.cookie = result.cookie;
    return true;
  },

  async ensureAuth() {
    if (!this.cookie) await this.login();
  },

  async listBudgets(page = 1, limit = 50) {
    await this.ensureAuth();
    const data = await this.proxy({ action: "list-budgets", cookie: this.cookie, networkId: this.networkId, page, limit });
    if (!this.networkId && data.data && data.data[0]) this.networkId = data.data[0].idNetwork;
    return data;
  },

  async getBudgetDetail(idSub, idSchool, idBudget) {
    await this.ensureAuth();
    return this.proxy({ action: "budget-detail", cookie: this.cookie, networkId: this.networkId, idSubprogram: idSub, idSchool, idBudget });
  },

  async getBudgetItems(idSub, idSchool, idBudget) {
    await this.ensureAuth();
    return this.proxy({ action: "budget-items", cookie: this.cookie, networkId: this.networkId, idSubprogram: idSub, idSchool, idBudget });
  },

  async sendProposal(idSub, idSchool, idBudget, payload) {
    await this.ensureAuth();
    return this.proxy({ action: "send-proposal", cookie: this.cookie, networkId: this.networkId, idSubprogram: idSub, idSchool, idBudget, payload });
  },
};

// ===== ELEMENT CACHE =====
const el = {
  kpiAbertos: document.getElementById("kpi-abertos"),
  kpiUrgentes: document.getElementById("kpi-urgentes"),
  kpiPendentes: document.getElementById("kpi-pendentes"),
  kpiFaturamento: document.getElementById("kpi-faturamento"),
  kpiMargem: document.getElementById("kpi-margem"),
  // Filtros
  filtroAno: document.getElementById("filtro-ano"),
  filtroMunicipio: document.getElementById("filtro-municipio"),
  filtroGrupo: document.getElementById("filtro-grupo"),
  filtroStatus: document.getElementById("filtro-status"),
  filtroTexto: document.getElementById("filtro-texto"),
  tbodyOrcamentos: document.getElementById("tbody-orcamentos"),
  orcamentosEmpty: document.getElementById("orcamentos-empty"),
  btnExportCsv: document.getElementById("btn-export-csv"),
  // Batch
  selectAll: document.getElementById("select-all"),
  batchBar: document.getElementById("batch-bar"),
  batchCount: document.getElementById("batch-count"),
  btnBatchPreorcar: document.getElementById("btn-batch-preorcar"),
  btnBatchExport: document.getElementById("btn-batch-export"),
  // Coleta SGD
  btnCollectSgd: document.getElementById("btn-collect-sgd"),
  ultimaAtualizacao: document.getElementById("ultima-atualizacao"),
  // Inteligência
  intelPanel: document.getElementById("intel-panel"),
  intelToggle: document.getElementById("intel-toggle"),
  intelBody: document.getElementById("intel-body"),
  intelChevron: document.getElementById("intel-chevron"),
  intelValorTotal: document.getElementById("intel-valor-total"),
  intelConversao: document.getElementById("intel-conversao"),
  intelPrazoMedio: document.getElementById("intel-prazo-medio"),
  intelTopCategorias: document.getElementById("intel-top-categorias"),
  intelPorMunicipio: document.getElementById("intel-por-municipio"),
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
  btnIrSgd: document.getElementById("btn-ir-sgd"),
  modeIndicator: document.getElementById("mode-indicator"),
  // SGD Tab
  tbodySgd: document.getElementById("tbody-sgd"),
  sgdEmpty: document.getElementById("sgd-empty"),
  sgdModeBadge: document.getElementById("sgd-mode-badge"),
  sgdKpiProntos: document.getElementById("sgd-kpi-prontos"),
  sgdKpiEnviados: document.getElementById("sgd-kpi-enviados"),
  sgdKpiValor: document.getElementById("sgd-kpi-valor"),
  btnSgdEnviarTodos: document.getElementById("btn-sgd-enviar-todos"),
  btnSgdBaixarTodos: document.getElementById("btn-sgd-baixar-todos"),
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
  // Match normalizado: "Araxá" → "Araxa"
  const normMun = normalizedText(municipio);
  let km = perfil.distancias.estimativas[municipio] || 0;
  if (km === 0) {
    const entry = Object.entries(perfil.distancias.estimativas).find(
      ([key]) => normalizedText(key) === normMun
    );
    if (entry) km = entry[1];
  }
  const custoPorKm = perfil.config ? perfil.config.fretePadraoKm || 1.20 : 1.20;
  return km * custoPorKm;
}

function findBancoItem(nomeItem) {
  const norm = normalizedText(nomeItem);
  return bancoPrecos.itens.find((bp) => normalizedText(bp.item) === norm) || null;
}

function isGrupoExcluido(grupo) {
  if (!perfil.config || !perfil.config.gruposExcluidos) return false;
  return perfil.config.gruposExcluidos.some((g) => normalizedText(g) === normalizedText(grupo));
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
  // In Netlify mode, merge with localStorage orcamentos (from browser SGD scan)
  // localStorage has newer/detailed data from scans, so prefer it
  const localOrc = localStorage.getItem("caixaescolar.orcamentos");
  if (localOrc) {
    try {
      const parsed = JSON.parse(localOrc);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If localStorage has data from a scan, use it as the primary source
        const localMap = new Map(parsed.map((o) => [o.id, o]));
        // Update existing orcamentos with localStorage data (which has details)
        orcamentos.forEach((o, idx) => {
          if (localMap.has(o.id)) {
            const lo = localMap.get(o.id);
            // Prefer localStorage data if it has more details
            if (lo.itens && lo.itens.length > 0 && (!o.itens || o.itens.length === 0)) {
              orcamentos[idx] = Object.assign({}, o, lo);
            }
            localMap.delete(o.id);
          }
        });
        // Add any remaining from localStorage that aren't in static file
        localMap.forEach((o) => orcamentos.push(o));
      }
    } catch (_) { /* ignore */ }
  }
  perfil = perfilData || {};
  sreData = sreInfo || {};

  // Banco: usa localStorage se existir (edições do usuário), senão carrega do JSON
  if (!loadBancoLocal() && bancoData && Array.isArray(bancoData.itens)) {
    bancoPrecos = bancoData;
    saveBancoLocal();
  }

  // Detect SGD API availability BEFORE rendering (so buttons render correctly)
  sgdAvailable = await isSgdApiAvailable();
  updateModeIndicator(sgdAvailable);

  populateFilters();
  bindEvents();
  renderAll();

  // Mostrar botões SGD em qualquer modo (local ou Netlify com credenciais)
  if (el.btnCollectSgd) el.btnCollectSgd.style.display = "inline-block";
  const btnVarrer = document.getElementById("btn-varrer-sgd");
  if (btnVarrer) btnVarrer.style.display = "inline-block";
}

// ===== FILTERS =====
function populateFilters() {
  // Anos
  const anos = [...new Set(orcamentos.map((o) => o.ano))].sort();
  anos.forEach((a) => {
    el.filtroAno.appendChild(new Option(String(a), String(a)));
  });

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
  const ano = el.filtroAno.value;
  const mun = el.filtroMunicipio.value;
  const grupo = el.filtroGrupo.value;
  const status = el.filtroStatus.value;
  const query = normalizedText(el.filtroTexto.value.trim());

  return orcamentos
    .filter((o) => ano === "all" || String(o.ano) === ano)
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
  renderIntel();
  renderPreOrcamentosLista();
  renderBanco();
  renderSgd();
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

// ===== INTELIGÊNCIA (Passo 2) =====
function renderIntel() {
  const abertos = orcamentos.filter((o) => o.status === "aberto");

  // Valor total disponível — estimativa baseada em média dos pré-orçamentos existentes
  const preValues = Object.values(preOrcamentos).filter((p) => p.totalGeral > 0);
  const avgPreValue = preValues.length ? preValues.reduce((s, p) => s + p.totalGeral, 0) / preValues.length : 0;
  const valorTotal = preValues.reduce((s, p) => s + p.totalGeral, 0) + (abertos.length - preValues.length) * avgPreValue;
  el.intelValorTotal.textContent = brl.format(valorTotal);

  // Taxa de conversão
  const totalGerados = Object.values(preOrcamentos).length;
  const totalAprovados = Object.values(preOrcamentos).filter((p) => p.status === "aprovado" || p.status === "enviado").length;
  const taxaConversao = totalGerados > 0 ? totalAprovados / totalGerados : 0;
  el.intelConversao.textContent = pct(taxaConversao);

  // Prazo médio
  const prazoDias = abertos.map((o) => daysTo(o.prazo)).filter((d) => d < 999);
  const prazoMedio = prazoDias.length ? Math.round(prazoDias.reduce((a, b) => a + b, 0) / prazoDias.length) : 0;
  el.intelPrazoMedio.textContent = prazoMedio + " dias";

  // Top 5 categorias
  const grupoCounts = {};
  orcamentos.forEach((o) => { grupoCounts[o.grupo] = (grupoCounts[o.grupo] || 0) + 1; });
  const topGrupos = Object.entries(grupoCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxGrupo = topGrupos.length ? topGrupos[0][1] : 1;

  el.intelTopCategorias.innerHTML = topGrupos.map(([grupo, count]) => {
    const widthPct = Math.round((count / maxGrupo) * 100);
    return `<div class="intel-bar-row">
      <span class="intel-bar-label" title="${escapeHtml(grupo)}">${escapeHtml(grupo)}</span>
      <div class="intel-bar-track">
        <div class="intel-bar-fill" style="width:${widthPct}%"></div>
      </div>
      <span class="intel-bar-value">${count}</span>
    </div>`;
  }).join("");

  // Orçamentos por município
  const munCounts = {};
  orcamentos.forEach((o) => { munCounts[o.municipio] = (munCounts[o.municipio] || 0) + 1; });
  const topMun = Object.entries(munCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxMun = topMun.length ? topMun[0][1] : 1;

  el.intelPorMunicipio.innerHTML = topMun.map(([mun, count]) => {
    const widthPct = Math.round((count / maxMun) * 100);
    return `<div class="intel-bar-row">
      <span class="intel-bar-label">${escapeHtml(mun)}</span>
      <div class="intel-bar-track">
        <div class="intel-bar-fill intel-bar-fill-alt" style="width:${widthPct}%"></div>
      </div>
      <span class="intel-bar-value">${count}</span>
    </div>`;
  }).join("");
}

function toggleIntel() {
  const isOpen = el.intelBody.style.display !== "none";
  el.intelBody.style.display = isOpen ? "none" : "block";
  el.intelChevron.textContent = isOpen ? "▶" : "▼";
}

// ===== RENDER ORÇAMENTOS (Passo 1 + 3) =====
function renderOrcamentos() {
  const list = filteredOrcamentos();
  el.orcamentosEmpty.style.display = list.length ? "none" : "block";

  // Limpar seleção de IDs que não estão mais na lista filtrada
  const listIds = new Set(list.map((o) => o.id));
  for (const id of selectedOrcIds) {
    if (!listIds.has(id)) selectedOrcIds.delete(id);
  }

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

    // Coluna Entrega (Passo 1)
    const entregaDays = o.prazoEntrega ? daysTo(o.prazoEntrega) : 999;
    const daysBetween = o.prazo && o.prazoEntrega
      ? Math.ceil((new Date(o.prazoEntrega + "T00:00:00") - new Date(o.prazo + "T00:00:00")) / 86400000)
      : 999;
    let entregaBadge = formatDate(o.prazoEntrega);
    if (daysBetween < 30 && daysBetween >= 0) {
      entregaBadge = `<span class="badge badge-warning-soft">${formatDate(o.prazoEntrega)}</span>`;
    }

    // Grupo excluído (Passo 1)
    const excluido = isGrupoExcluido(o.grupo);
    let grupoBadge = escapeGrupo(o.grupo, excluido);

    // Ações
    const preOrc = preOrcamentos[o.id];
    let actionBtn = "";
    if (o.status === "aberto") {
      if (excluido) {
        actionBtn = '<span class="badge badge-fora-escopo">Fora do escopo</span>';
      } else if (preOrc) {
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

    // Checkbox (Passo 3) — só para abertos não excluídos sem pré-orçamento
    const canSelect = o.status === "aberto" && !excluido && !preOrc;
    const checked = selectedOrcIds.has(o.id) ? "checked" : "";
    const checkboxHtml = canSelect
      ? `<input type="checkbox" class="row-check" data-id="${o.id}" ${checked} />`
      : "";

    return `<tr>
      <td>${checkboxHtml}</td>
      <td class="font-mono text-muted">${escapeHtml(o.id)}</td>
      <td>${escapeHtml(o.escola)}</td>
      <td>${escapeHtml(o.municipio)}</td>
      <td class="obj-cell" title="${escapeHtml(o.objeto)}">${escapeHtml(o.objeto)}</td>
      <td>${grupoBadge}</td>
      <td class="nowrap">${formatDate(o.prazo)}</td>
      <td class="nowrap">${entregaBadge}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td class="nowrap">${actionBtn}</td>
    </tr>`;
  }).join("");

  // Bind checkboxes
  el.tbodyOrcamentos.querySelectorAll(".row-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedOrcIds.add(cb.dataset.id);
      else selectedOrcIds.delete(cb.dataset.id);
      updateBatchBar();
    });
  });

  updateBatchBar();
}

function escapeGrupo(grupo, excluido) {
  if (excluido) {
    return `${escapeHtml(grupo)} <span class="badge badge-fora-escopo" style="font-size:0.65rem">Excluído</span>`;
  }
  return escapeHtml(grupo);
}

// ===== BATCH OPERATIONS (Passo 3) =====
function updateBatchBar() {
  const count = selectedOrcIds.size;
  if (count > 0) {
    el.batchBar.style.display = "flex";
    el.batchCount.textContent = `${count} selecionado${count > 1 ? "s" : ""}`;
  } else {
    el.batchBar.style.display = "none";
  }

  // Sync select-all checkbox
  const checkboxes = el.tbodyOrcamentos.querySelectorAll(".row-check");
  if (checkboxes.length > 0) {
    const allChecked = [...checkboxes].every((cb) => cb.checked);
    el.selectAll.checked = allChecked;
    el.selectAll.indeterminate = !allChecked && count > 0;
  } else {
    el.selectAll.checked = false;
    el.selectAll.indeterminate = false;
  }
}

function toggleSelectAll() {
  const checkboxes = el.tbodyOrcamentos.querySelectorAll(".row-check");
  const shouldCheck = el.selectAll.checked;
  checkboxes.forEach((cb) => {
    cb.checked = shouldCheck;
    if (shouldCheck) selectedOrcIds.add(cb.dataset.id);
    else selectedOrcIds.delete(cb.dataset.id);
  });
  updateBatchBar();
}

function batchPreOrcar() {
  if (selectedOrcIds.size === 0) return;
  const ids = [...selectedOrcIds];
  let count = 0;

  ids.forEach((orcId) => {
    const orc = orcamentos.find((o) => o.id === orcId);
    if (!orc || isGrupoExcluido(orc.grupo) || preOrcamentos[orcId]) return;

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
    count++;
  });

  savePreOrcamentos();
  selectedOrcIds.clear();
  renderAll();
  alert(`${count} pré-orçamento${count > 1 ? "s" : ""} gerado${count > 1 ? "s" : ""}.`);
}

function batchExportCsv() {
  if (selectedOrcIds.size === 0) return;
  const list = orcamentos.filter((o) => selectedOrcIds.has(o.id));
  const header = "ID;Escola;Municipio;SRE;Objeto;Grupo;Prazo;PrazoEntrega;Status;Itens";
  const rows = list.map((o) => {
    const itensStr = (o.itens || []).map((i) => `${i.nome} (${i.quantidade} ${i.unidade})`).join(" | ");
    return [o.id, o.escola, o.municipio, o.sre, o.objeto, o.grupo, o.prazo, o.prazoEntrega, o.status, itensStr]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
  });
  downloadCsv("orcamentos-selecionados.csv", [header, ...rows].join("\n"));
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

  // Frete real (Passo 1) — mostra valor e km quando disponível
  const frete = pre.freteEstimado || 0;
  let km = 0;
  if (perfil.distancias && perfil.distancias.estimativas) {
    km = perfil.distancias.estimativas[pre.municipio] || 0;
    if (km === 0) {
      const normMun = normalizedText(pre.municipio);
      const entry = Object.entries(perfil.distancias.estimativas).find(
        ([key]) => normalizedText(key) === normMun
      );
      if (entry) km = entry[1];
    }
  }
  if (frete > 0 && km > 0) {
    el.preorcamentoFrete.textContent = `${brl.format(frete)} (${km} km)`;
  } else if (frete > 0) {
    el.preorcamentoFrete.textContent = brl.format(frete);
  } else {
    el.preorcamentoFrete.textContent = "Sem frete (mesmo município)";
  }

  renderPreOrcamentoItens();

  // Botões
  const isEditable = pre.status === "pendente";
  el.btnAprovar.style.display = isEditable ? "inline-block" : "none";
  el.btnRecusar.style.display = isEditable ? "inline-block" : "none";

  // Botão Editar: aparece quando aprovado ou enviado
  const showEditar = pre.status === "aprovado" || pre.status === "enviado";
  el.btnEditarOrcamento.style.display = showEditar ? "inline-block" : "none";

  // Botão SGD: aparece sempre que aprovado (modo local envia API, modo Netlify baixa payload)
  const showSgd = pre.status === "aprovado";
  el.btnEnviarSgd.style.display = showSgd ? "inline-block" : "none";
  el.btnEnviarSgd.textContent = "Enviar ao SGD";

  // Link para aba SGD quando enviado
  const showIrSgd = pre.status === "aprovado" || pre.status === "enviado";
  el.btnIrSgd.style.display = showIrSgd ? "inline-block" : "none";

  // Render SGD extra fields (datas, obs, garantia)
  renderSgdFields();
};

// ===== RENDER PRÉ-ORÇAMENTO ITENS (Passo 5 — PNCP) =====
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

    // PNCP ref (Passo 5) — busca preço de referência no banco
    const bp = findBancoItem(item.nome);
    let pncpHint = "";
    if (bp && bp.precoReferencia > 0) {
      const diff = item.custoUnitario > 0
        ? Math.abs(item.custoUnitario - bp.custoBase) / bp.custoBase
        : 0;
      const diffClass = diff > 0.30 ? "pncp-alert" : "pncp-ok";
      pncpHint = `<span class="pncp-tooltip ${diffClass}" title="Ref. Banco: ${brl.format(bp.precoReferencia)} (custo: ${brl.format(bp.custoBase)})">Ref: ${brl.format(bp.precoReferencia)}</span>`;
    }

    return `<tr>
      <td>
        <strong>${escapeHtml(item.nome)}</strong>
        <br><span class="text-muted" style="font-size:0.75rem">${escapeHtml(item.descricao)}</span>
        <br><span class="text-muted" style="font-size:0.72rem">${item.quantidade} ${escapeHtml(item.unidade)}</span>
        ${pncpHint}
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
  // Defer innerHTML replacement to avoid destroying the active input mid-blur
  requestAnimationFrame(() => {
    renderPreOrcamentoItens();
    renderKPIs();
  });
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
  renderIntel();

  el.btnAprovar.style.display = "none";
  el.btnRecusar.style.display = "none";
  el.btnEditarOrcamento.style.display = "inline-block";
  el.btnEnviarSgd.style.display = "inline-block";
  el.btnEnviarSgd.textContent = "Enviar ao SGD";
  el.btnIrSgd.style.display = "inline-block";
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
  renderIntel();

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
  const header = "ID;Escola;Municipio;SRE;Objeto;Grupo;Prazo;PrazoEntrega;Status;Itens";
  const rows = list.map((o) => {
    const itensStr = (o.itens || []).map((i) => `${i.nome} (${i.quantidade} ${i.unidade})`).join(" | ");
    return [o.id, o.escola, o.municipio, o.sre, o.objeto, o.grupo, o.prazo, o.prazoEntrega, o.status, itensStr]
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
window.switchTab = function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-content").forEach((tc) => {
    tc.classList.toggle("active", tc.id === "tab-" + tabId);
  });
  // Re-render tab content on switch
  if (tabId === "sgd") renderSgd();
  if (tabId === "pre-orcamento" && !activePreOrcamentoId) renderPreOrcamentosLista();
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
      if (tab.dataset.tab === "sgd") {
        renderSgd();
      }
    });
  });

  // Filtros orçamentos
  el.filtroAno.addEventListener("change", renderOrcamentos);
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

  // Select all (Passo 3)
  el.selectAll.addEventListener("change", toggleSelectAll);

  // Batch actions (Passo 3)
  el.btnBatchPreorcar.addEventListener("click", batchPreOrcar);
  el.btnBatchExport.addEventListener("click", batchExportCsv);

  // Inteligência toggle (Passo 2)
  el.intelToggle.addEventListener("click", toggleIntel);

  // Varredura SGD (Fase 4)
  el.btnCollectSgd.addEventListener("click", varrerSgd);
  const btnVarrer = document.getElementById("btn-varrer-sgd");
  if (btnVarrer) btnVarrer.addEventListener("click", varrerSgd);

  // SGD Tab
  el.btnSgdEnviarTodos.addEventListener("click", sgdEnviarTodos);
  el.btnSgdBaixarTodos.addEventListener("click", sgdBaixarTodos);

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
  // 1. Try local Express server
  try {
    const r = await fetch("/api/sgd/status", { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      sgdLocalServer = true;
      return true;
    }
  } catch (_) { /* no local server */ }

  // 2. In Netlify mode, SGD is available if user has credentials saved
  sgdLocalServer = false;
  return !!localStorage.getItem(SGD_CRED_KEY);
}

function updateModeIndicator(isLocal) {
  if (sgdLocalServer) {
    el.modeIndicator.textContent = "Modo Local";
    el.modeIndicator.className = "mode-indicator mode-local";
  } else {
    el.modeIndicator.textContent = "Modo Netlify";
    el.modeIndicator.className = "mode-indicator mode-netlify";
  }
}

function buildSgdPayload(pre) {
  const orc = orcamentos.find((o) => o.id === pre.orcamentoId);
  return {
    orcamentoId: pre.orcamentoId,
    idSubprogram: orc ? orc.idSubprogram : pre.idSubprogram,
    idSchool: orc ? orc.idSchool : pre.idSchool,
    idBudget: orc ? orc.idBudget : pre.idBudget,
    idAxis: orc ? orc.idAxis : null,
    dtGoodsDelivery: pre.dtGoodsDelivery || (orc && orc.prazoEntrega ? orc.prazoEntrega + "T00:00:00.000Z" : new Date().toISOString()),
    dtServiceDelivery: pre.dtServiceDelivery || (orc && orc.prazoEntrega ? orc.prazoEntrega + "T00:00:00.000Z" : new Date().toISOString()),
    itens: pre.itens.map((i, idx) => {
      // Try to get idBudgetItem: 1) from pre-orcamento item, 2) from orcamento item by index, 3) by name match
      let idBudgetItem = i.idBudgetItem;
      if (!idBudgetItem && orc && orc.itens) {
        // Try index match first
        if (orc.itens[idx] && orc.itens[idx].idBudgetItem) {
          idBudgetItem = orc.itens[idx].idBudgetItem;
        } else {
          // Try name match
          const norm = (s) => (s || "").replace(/\s+/g, " ").toLowerCase().trim();
          const itemName = norm(i.nome);
          const match = orc.itens.find((oi) => {
            const oiName = norm(oi.nome);
            return oiName.includes(itemName) || itemName.includes(oiName);
          });
          if (match) idBudgetItem = match.idBudgetItem;
        }
      }
      return {
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        precoTotal: i.precoTotal,
        observacao: i.observacao || "",
        garantia: i.garantia || "Garantia de 12 meses conforme CDC",
        idBudgetItem,
      };
    }),
    totalGeral: pre.totalGeral,
  };
}

function downloadSgdPayload(pre) {
  const proposal = buildSgdPayload(pre);
  const payload = {
    generatedAt: new Date().toISOString(),
    format: "sgd-rest-api-v4",
    proposals: [proposal],
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sgd-payload-${pre.orcamentoId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function enviarParaSgd() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || pre.status !== "aprovado") return;

  // Read extra fields from the form
  const dtGoodsEl = document.getElementById("sgd-dt-goods");
  const dtServiceEl = document.getElementById("sgd-dt-service");
  if (dtGoodsEl && dtGoodsEl.value) pre.dtGoodsDelivery = dtGoodsEl.value + "T00:00:00.000Z";
  if (dtServiceEl && dtServiceEl.value) pre.dtServiceDelivery = dtServiceEl.value + "T00:00:00.000Z";

  // Read per-item obs/garantia from form
  pre.itens.forEach((item, idx) => {
    const obsEl = document.getElementById(`sgd-obs-${idx}`);
    const garEl = document.getElementById(`sgd-garantia-${idx}`);
    if (obsEl) item.observacao = obsEl.value;
    if (garEl) item.garantia = garEl.value;
  });
  savePreOrcamentos();

  // Envia via API (local ou direta)
  el.btnEnviarSgd.disabled = true;
  el.btnEnviarSgd.innerHTML = '<span class="sgd-spinner"></span>Enviando...';

  try {
    const payload = buildSgdPayload(pre);
    let success = false;

    if (sgdLocalServer) {
      const r = await fetch("/api/sgd/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (r.ok && result.success) success = true;
      else throw new Error(result.error || "Falha no envio");
    } else {
      success = await browserSgdSubmit(payload);
    }

    if (success) {
      pre.status = "enviado";
      pre.enviadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos();
      renderAll();
      abrirPreOrcamento(activePreOrcamentoId);
      alert("Proposta enviada ao SGD com sucesso!");
    }
  } catch (err) {
    alert("Erro: " + err.message);
  } finally {
    el.btnEnviarSgd.disabled = false;
    el.btnEnviarSgd.textContent = "Enviar ao SGD";
  }
}

// ===== SGD TAB =====
function renderSgd() {
  const allPre = Object.values(preOrcamentos);
  const ready = allPre.filter((p) => p.status === "aprovado");
  const sent = allPre.filter((p) => p.status === "enviado");
  const sgdItems = [...ready, ...sent];

  // KPIs
  el.sgdKpiProntos.textContent = ready.length;
  el.sgdKpiEnviados.textContent = sent.length;
  el.sgdKpiValor.textContent = brl.format(sgdItems.reduce((s, p) => s + (p.totalGeral || 0), 0));

  // Mode badge
  const hasCreds = sgdAvailable || !!localStorage.getItem(SGD_CRED_KEY);
  el.sgdModeBadge.textContent = hasCreds ? (sgdLocalServer ? "API Local" : "API Direta") : "Sem credenciais";
  el.sgdModeBadge.className = hasCreds ? "badge badge-aprovado" : "badge badge-muted";

  // Botão enviar todos (se tem prontos)
  el.btnSgdEnviarTodos.style.display = ready.length > 0 ? "inline-block" : "none";
  el.btnSgdBaixarTodos.style.display = sgdItems.length > 0 ? "inline-block" : "none";

  // Empty
  el.sgdEmpty.style.display = sgdItems.length ? "none" : "block";

  // Tabela
  el.tbodySgd.innerHTML = sgdItems
    .sort((a, b) => (a.status === "aprovado" ? -1 : 1))
    .map((p) => {
      const isSent = p.status === "enviado";
      const badgeClass = isSent ? "badge-enviado" : "badge-aprovado";
      const badgeLabel = isSent ? "Enviado" : "Pronto";
      const dateInfo = isSent ? formatDate(p.enviadoEm) : formatDate(p.aprovadoEm);

      let actions = "";
      if (isSent) {
        actions = `<button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else {
        actions = `<button class="btn btn-inline btn-sgd" onclick="sgdEnviarUnico('${p.orcamentoId}')">Enviar</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      }

      return `<tr>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td>${escapeHtml(p.municipio)}</td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td><span class="badge ${badgeClass}">${badgeLabel}</span> <span class="text-muted" style="font-size:0.72rem">${dateInfo}</span></td>
        <td class="nowrap">${actions}</td>
      </tr>`;
    }).join("");
}

window.sgdBaixarPayload = function (orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre) return;
  downloadSgdPayload(pre);
  if (pre.status === "aprovado") {
    pre.status = "enviado";
    pre.enviadoEm = new Date().toISOString().slice(0, 10);
    savePreOrcamentos();
    renderSgd();
    renderKPIs();
  }
};

window.sgdEnviarUnico = async function (orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre || pre.status !== "aprovado") return;

  try {
    const payload = buildSgdPayload(pre);
    let success = false;

    if (sgdLocalServer) {
      // Local Express server
      const r = await fetch("/api/sgd/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (r.ok && result.success) success = true;
      else throw new Error(result.error || "Falha no envio");
    } else {
      // Direct browser API call
      success = await browserSgdSubmit(payload);
    }

    if (success) {
      pre.status = "enviado";
      pre.enviadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos();
      renderAll();
      showToast(`Proposta ${orcId} enviada ao SGD!`);
    } else {
      alert("Erro: " + (result.error || "Falha"));
    }
  } catch (err) {
    alert("Erro de conexão: " + err.message);
  }
};

// Browser-side SGD submit (direct API, Netlify mode)
async function browserSgdSubmit(payload) {
  await BrowserSgdClient.login();
  if (!BrowserSgdClient.networkId) await BrowserSgdClient.listBudgets(1, 1);

  const { idSubprogram, idSchool, idBudget } = payload;
  if (!idSubprogram || !idSchool || !idBudget) throw new Error("IDs SGD ausentes no payload");

  // Use saved idAxis and networkId from orcamento if available
  const orc = orcamentos.find((o) => o.id === payload.orcamentoId);
  let idAxis = orc ? orc.idAxis : null;

  // Switch to budget's networkId if available (each SRE has different networkId)
  if (orc && orc.idNetwork) BrowserSgdClient.networkId = orc.idNetwork;

  if (!idAxis) {
    const detail = await BrowserSgdClient.getBudgetDetail(idSubprogram, idSchool, idBudget);
    idAxis = detail.idAxis;
  }
  if (!idAxis) throw new Error("idAxis nao encontrado");

  // Check if all items already have idBudgetItem from the scan
  const allHaveIds = payload.itens.every((i) => i.idBudgetItem);

  let budgetItems = [];
  if (!allHaveIds) {
    // Fetch budget items from API for mapping
    const itemsRes = await BrowserSgdClient.getBudgetItems(idSubprogram, idSchool, idBudget);
    budgetItems = itemsRes.data || [];

    // Also try matching from saved orcamento items
    if (budgetItems.length === 0 && orc && orc.itens && orc.itens.length > 0) {
      budgetItems = orc.itens.map((i) => ({
        idBudgetItem: i.idBudgetItem,
        txBudgetItemType: i.nome,
        txDescription: i.descricao,
      }));
    }
  }

  const norm = (s) => (s || "").replace(/\n/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
  const proposalItems = payload.itens.map((item, idx) => {
    // 1. Use saved idBudgetItem directly
    let idBudgetItem = item.idBudgetItem;

    // 2. If not found, try matching from orcamento's saved items
    if (!idBudgetItem && orc && orc.itens) {
      const orcItem = orc.itens[idx];
      if (orcItem && orcItem.idBudgetItem) idBudgetItem = orcItem.idBudgetItem;
    }

    // 3. Fallback: fuzzy match against API budget items
    if (!idBudgetItem && budgetItems.length > 0) {
      const itemName = norm(item.nome);
      let matched = budgetItems.find((bi) => {
        const biName = norm(bi.txBudgetItemType || bi.txDescription || "");
        const biDesc = norm(bi.txDescription || "");
        return biName.includes(itemName) || itemName.includes(biName) || biDesc.includes(itemName) || itemName.includes(biDesc);
      });
      if (!matched && budgetItems[idx]) matched = budgetItems[idx];
      if (matched) idBudgetItem = matched.idBudgetItem || matched.id;
    }

    if (!idBudgetItem) throw new Error(`Item "${item.nome}" nao mapeado no SGD. Tente varrer o SGD novamente para atualizar os itens.`);

    const p = { nuValueByItem: item.precoUnitario, idBudgetItem, txItemObservation: item.observacao || item.nome || "Conforme especificado" };
    if (item.garantia) p.txWarrantyDescription = item.garantia;
    return p;
  });

  const sgdPayload = {
    dtGoodsDelivery: payload.dtGoodsDelivery || new Date().toISOString(),
    dtServiceDelivery: payload.dtServiceDelivery || new Date().toISOString(),
    idAxis,
    budgetProposalItems: proposalItems,
  };

  await BrowserSgdClient.sendProposal(idSubprogram, idSchool, idBudget, sgdPayload);
  return true;
}

async function sgdEnviarTodos() {
  const ready = Object.values(preOrcamentos).filter((p) => p.status === "aprovado");
  if (ready.length === 0) return;

  if (!confirm(`Enviar ${ready.length} proposta(s) ao SGD?`)) return;

  el.btnSgdEnviarTodos.disabled = true;
  el.btnSgdEnviarTodos.innerHTML = '<span class="sgd-spinner"></span>Enviando...';

  let ok = 0;
  let fail = 0;

  for (const pre of ready) {
    try {
      const payload = buildSgdPayload(pre);
      let success = false;

      if (sgdLocalServer) {
        const r = await fetch("/api/sgd/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await r.json();
        success = r.ok && result.success;
      } else {
        success = await browserSgdSubmit(payload);
      }

      if (success) {
        pre.status = "enviado";
        pre.enviadoEm = new Date().toISOString().slice(0, 10);
        ok++;
      } else {
        fail++;
      }
    } catch (_) {
      fail++;
    }
  }

  savePreOrcamentos();
  renderAll();

  el.btnSgdEnviarTodos.disabled = false;
  el.btnSgdEnviarTodos.textContent = "Enviar Todos";
  alert(`${ok} enviado(s), ${fail} erro(s).`);
}

function sgdBaixarTodos() {
  const items = Object.values(preOrcamentos).filter((p) => p.status === "aprovado" || p.status === "enviado");
  if (items.length === 0) return;

  const payload = {
    generatedAt: new Date().toISOString(),
    proposals: items.map((p) => buildSgdPayload(p)),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sgd-prequote-payload.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Marcar todos aprovados como enviados
  items.forEach((p) => {
    if (p.status === "aprovado") {
      p.status = "enviado";
      p.enviadoEm = new Date().toISOString().slice(0, 10);
    }
  });
  savePreOrcamentos();
  renderSgd();
  renderKPIs();
}

// ===== VARREDURA SGD (Fase 4) =====
async function varrerSgd() {
  const btn = document.getElementById("btn-varrer-sgd") || el.btnCollectSgd;
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="sgd-spinner"></span>Varrendo SGD...';

  try {
    if (sgdLocalServer) {
      // Mode 1: Use local Express server
      const r = await fetch("/api/sgd/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await r.json();
      if (!r.ok || !result.success) throw new Error(result.error || "Falha na varredura");

      const orcData = await fetchJson("data/orcamentos.json");
      orcamentos = Array.isArray(orcData) ? orcData : [];
      showToast(result.novos > 0 ? `${result.novos} novo(s) orçamento(s)!` : "Nenhum orçamento novo.");
    } else {
      // Mode 2: Direct browser API calls (Netlify mode)
      await BrowserSgdClient.login();
      sgdAvailable = true;
      updateModeIndicator(false);

      // Build SRE Uberaba school name lookup for filtering
      const sreNorm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase().trim();
      const sreSchools = new Set();
      const schoolToMunicipio = {};
      if (sreData && sreData.municipios) {
        sreData.municipios.forEach((m) => {
          (m.escolas || []).forEach((e) => {
            const n = sreNorm(e);
            sreSchools.add(n);
            schoolToMunicipio[n] = m.nome;
          });
        });
      }

      // Step 1: Fetch all budget summaries (paginated)
      const allBudgets = [];
      let page = 1;
      while (true) {
        const data = await BrowserSgdClient.listBudgets(page, 50);
        const items = data.data || [];
        if (items.length === 0) break;
        allBudgets.push(...items);
        const total = data.meta ? data.meta.totalItems : 0;
        if (allBudgets.length >= total || items.length < 50) break;
        page++;
        btn.innerHTML = `<span class="sgd-spinner"></span>Listando... ${allBudgets.length}/${total}`;
      }

      // Step 2: Filter only SRE Uberaba budgets
      // API field: schoolName (not txSchoolName)
      const filtered = allBudgets.filter((b) => {
        const escola = sreNorm(b.schoolName || b.txSchoolName || "");
        return sreSchools.has(escola);
      });
      btn.innerHTML = `<span class="sgd-spinner"></span>SRE Uberaba: ${filtered.length} de ${allBudgets.length}. Buscando detalhes...`;

      // Step 3: Fetch detail + items for each SRE budget
      let novos = 0;
      let atualizados = 0;
      const existingMap = new Map(orcamentos.map((o) => [o.id, o]));

      for (let i = 0; i < filtered.length; i++) {
        const b = filtered[i];
        const id = String(b.idBudget || b.id || "");
        if (!id) continue;

        const escolaRaw = b.schoolName || b.txSchoolName || "";
        const escolaNorm = sreNorm(escolaRaw);
        const municipio = schoolToMunicipio[escolaNorm] || "";

        // Use this budget's own networkId (each SRE has different networkId)
        const budgetNetworkId = b.idNetwork || BrowserSgdClient.networkId;
        const savedNetworkId = BrowserSgdClient.networkId;
        BrowserSgdClient.networkId = budgetNetworkId;

        // Fetch budget detail (for initiativeDescription/objeto, idAxis, dates)
        let detail = {};
        let budgetItems = [];
        try {
          if (b.idSubprogram && b.idSchool && b.idBudget) {
            detail = await BrowserSgdClient.getBudgetDetail(b.idSubprogram, b.idSchool, b.idBudget);
            const itemsRes = await BrowserSgdClient.getBudgetItems(b.idSubprogram, b.idSchool, b.idBudget);
            budgetItems = itemsRes.data || [];
            if (!Array.isArray(budgetItems)) budgetItems = [];
          }
        } catch (err) {
          console.warn(`[Varrer] Detalhe budget ${id}: ${err.message}`);
        }
        BrowserSgdClient.networkId = savedNetworkId;

        const orc = {
          id, idBudget: b.idBudget, ano: detail.year || b.year || new Date().getFullYear(),
          escola: escolaRaw, municipio,
          sre: "Uberaba",
          grupo: detail.expenseGroupDescription || "",
          subPrograma: detail.subprogramName || "",
          objeto: detail.initiativeDescription || "",
          prazo: (b.dtProposalSubmission || detail.dtProposalSubmission || "").slice(0, 10),
          prazoEntrega: (detail.dtDelivery || "").slice(0, 10),
          valorEstimado: detail.estimatedValue ? parseFloat(detail.estimatedValue) : null,
          status: "aberto", participantes: detail.inNaturalPersonAllowed ? "PJ/PF" : "PJ",
          itens: budgetItems.map((bi) => ({
            nome: bi.txBudgetItemType || bi.txName || "",
            descricao: bi.txDescription || "",
            categoria: bi.txExpenseCategory || "Custeio",
            unidade: bi.txBudgetItemUnit || bi.txUnit || "",
            quantidade: bi.nuQuantity || 0,
            garantia: bi.txWarrantyRequired || "",
            idBudgetItem: bi.idBudgetItem || bi.id || null,
          })),
          idSchool: b.idSchool, idSubprogram: b.idSubprogram,
          idNetwork: b.idNetwork || null,
          idAxis: detail.idAxis || b.idAxis || null,
        };

        if (existingMap.has(id)) {
          const existing = existingMap.get(id);
          Object.assign(existing, orc, {
            status: existing.status === "encerrado" ? "encerrado" : orc.status,
          });
          atualizados++;
        } else {
          orcamentos.push(orc);
          novos++;
        }

        if ((i + 1) % 5 === 0 || i === filtered.length - 1) {
          btn.innerHTML = `<span class="sgd-spinner"></span>Detalhando ${i + 1}/${filtered.length}...`;
        }
      }

      // Save to localStorage for persistence in Netlify mode
      localStorage.setItem("caixaescolar.orcamentos", JSON.stringify(orcamentos));
      showToast(`SRE Uberaba: ${novos} novo(s), ${atualizados} atualizado(s) de ${filtered.length} orcamentos (${allBudgets.length} total SGD).`);
    }

    renderAll();

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    el.ultimaAtualizacao.textContent = `Atualizado: ${dd}/${mm} ${hh}:${mi}`;
    el.ultimaAtualizacao.style.display = "inline-block";
  } catch (err) {
    alert("Erro: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Varrer SGD";
  }
}

// Legacy alias for existing button binding
async function coletarSgd() {
  return varrerSgd();
}

// ===== TOAST =====
function showToast(msg, duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = "position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "toast-msg";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== SGD FIELDS RENDERING =====
function renderSgdFields() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  const container = document.getElementById("sgd-extra-fields");
  if (!container) return;

  const orc = orcamentos.find((o) => o.id === pre.orcamentoId);
  const defaultDate = orc && orc.prazoEntrega ? orc.prazoEntrega : new Date().toISOString().slice(0, 10);
  const isAprovado = pre.status === "aprovado";

  // Date fields
  const dtGoods = pre.dtGoodsDelivery ? pre.dtGoodsDelivery.slice(0, 10) : defaultDate;
  const dtService = pre.dtServiceDelivery ? pre.dtServiceDelivery.slice(0, 10) : defaultDate;

  let html = `
    <div class="sgd-fields-header"><h3>Dados para envio ao SGD</h3></div>
    <div class="sgd-dates-grid">
      <label>
        Prazo Entrega Bens
        <input type="date" id="sgd-dt-goods" value="${dtGoods}" ${isAprovado ? "" : "disabled"} />
      </label>
      <label>
        Prazo Entrega/Execução
        <input type="date" id="sgd-dt-service" value="${dtService}" ${isAprovado ? "" : "disabled"} />
      </label>
    </div>
    <div class="sgd-items-fields">
  `;

  pre.itens.forEach((item, idx) => {
    const obs = item.observacao || (item.descricao ? item.descricao.slice(0, 200) : "");
    const gar = item.garantia || "Garantia de 12 meses conforme CDC";
    html += `
      <div class="sgd-item-field">
        <strong>${escapeHtml(item.nome)}</strong>
        <label>
          Observação
          <textarea id="sgd-obs-${idx}" rows="2" ${isAprovado ? "" : "disabled"}>${escapeHtml(obs)}</textarea>
        </label>
        <label>
          Garantia Ofertada
          <textarea id="sgd-garantia-${idx}" rows="1" ${isAprovado ? "" : "disabled"}>${escapeHtml(gar)}</textarea>
        </label>
      </div>
    `;
  });

  html += "</div>";
  container.innerHTML = html;
}

// ===== INIT =====
boot();
