// ===== ELEMENT CACHE =====
const el = {
  kpiAbertos: document.getElementById("kpi-abertos"),
  kpiUrgentes: document.getElementById("kpi-urgentes"),
  kpiPendentes: document.getElementById("kpi-pendentes"),
  kpiFaturamento: document.getElementById("kpi-faturamento"),
  kpiMargem: document.getElementById("kpi-margem"),
  // Filtros
  filtroSre: document.getElementById("filtro-sre"),
  filtroEscola: document.getElementById("filtro-escola"),
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
  intelPanel: document.getElementById("radar-dashboard"),
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
  btnLimparBanco: document.getElementById("btn-limpar-banco"),
  // Modal banco
  modalBanco: document.getElementById("modal-banco"),
  modalBancoTitulo: document.getElementById("modal-banco-titulo"),
  modalItem: document.getElementById("modal-item"),
  modalGrupo: document.getElementById("modal-grupo"),
  modalUnidade: document.getElementById("modal-unidade"),
  modalCusto: document.getElementById("modal-custo"),
  modalMargem: document.getElementById("modal-margem"),
  modalMarca: document.getElementById("modal-marca"),
  modalFonte: document.getElementById("modal-fonte"),
  modalPrecoFornecedor: document.getElementById("modal-preco-fornecedor"),
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
  // SGD Tab (now "envio-sgd")
  tbodySgd: document.getElementById("tbody-sgd"),
  sgdEmpty: document.getElementById("sgd-empty"),
  sgdModeBadge: document.getElementById("sgd-mode-badge"),
  sgdKpiProntos: document.getElementById("sgd-kpi-prontos"),
  sgdKpiEnviados: document.getElementById("sgd-kpi-enviados"),
  sgdKpiGanhos: document.getElementById("sgd-kpi-ganhos"),
  sgdKpiValor: document.getElementById("sgd-kpi-valor"),
  btnSgdEnviarTodos: document.getElementById("btn-sgd-enviar-todos"),
  btnSgdBaixarTodos: document.getElementById("btn-sgd-baixar-todos"),
  btnSgdBaixarPdfs: document.getElementById("btn-sgd-baixar-pdfs"),
};

// ===== UTILITIES =====
function normalizedText(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ===== MATCHING: Sinônimos e Noise Words (SOP-RADAR-001) =====
const SINONIMOS = {
  carioquinha: "carioca",
  parbolizado: "parboilizado",
  mucarela: "mussarela",
  muzzarela: "mussarela",
  extr: "extrato",
};

const NOISE_WORDS = new Set([
  "tipo", "pct", "c/", "un", "kg", "gr", "ml", "lt",
  "marca", "de", "do", "da", "com", "para", "em",
  "qualidade", "primeira", "segunda", "pacote",
  "und", "cx", "fls", "pte", "saco", "sc", "c"
]);

// Normalização avançada: remove acentos, aplica sinônimos, remove noise words
function normalizedMatchTokens(v) {
  const text = normalizedText(v);
  let tokens = text.split(/[\s\/,;.()\-]+/).filter(Boolean);
  tokens = tokens.map(function(t) { return SINONIMOS[t] || t; });
  tokens = tokens.filter(function(t) { return t.length > 2 && !NOISE_WORDS.has(t); });
  return tokens;
}

// Jaccard similarity entre dois arrays de tokens
function calcTokenSimilarity(tokensA, tokensB) {
  var setA = {};
  var setB = {};
  var unionSize = 0;
  var interSize = 0;
  tokensA.forEach(function(t) { setA[t] = true; });
  tokensB.forEach(function(t) { setB[t] = true; });
  var all = {};
  tokensA.forEach(function(t) { all[t] = true; });
  tokensB.forEach(function(t) { all[t] = true; });
  unionSize = Object.keys(all).length;
  if (unionSize === 0) return tokensA.length === 0 && tokensB.length === 0 ? 1 : 0;
  Object.keys(setA).forEach(function(t) { if (setB[t]) interSize++; });
  return interSize / unionSize;
}

function escapeHtml(v) {
  const d = document.createElement("div");
  d.textContent = String(v || "");
  return d.innerHTML;
}

// Story 4.42: Resumo de itens como conteudo principal
function getItemsSummary(orcamento, maxItems = 3, maxChars = 25) {
  const itens = orcamento.itens || orcamento.items || [];
  if (!itens.length) return null;
  const nomes = itens
    .map(i => (i.nome || i.descricao || i.item || "").slice(0, maxChars))
    .filter(Boolean);
  if (!nomes.length) return null;
  const display = nomes.slice(0, maxItems).join(", ") + (nomes.length > maxItems ? "..." : "");
  return `${itens.length} iten(s): ${display}`;
}

function daysTo(dateIso) {
  if (!dateIso) return 999;
  const target = new Date(dateIso + "T00:00:00");
  return Math.ceil((target - today) / 86400000);
}

function formatDate(dateIso) {
  if (!dateIso) return "\u2014";
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y}`;
}

function setTextSafe(id, text) {
  const elem = document.getElementById(id);
  if (elem) elem.textContent = text;
}

// Story 4.40: date range filter utility
function dentroDoIntervalo(dataStr, de, ate) {
  if (!dataStr) return true; // sem data: não filtrar
  const d = new Date(dataStr);
  if (de && d < new Date(de)) return false;
  if (ate && d > new Date(ate + "T23:59:59")) return false;
  return true;
}

// Story 4.40: clear filter helpers
window.limparFiltrosPre = function () {
  const ids = ["filtro-pre-escola", "filtro-pre-status"];
  ids.forEach(id => { const e = document.getElementById(id); if (e) e.value = "all"; });
  const t = document.getElementById("filtro-pre-texto"); if (t) t.value = "";
  renderPreOrcamentosLista();
};

window.limparFiltrosAprov = function () {
  const s = document.getElementById("filtro-aprov-status"); if (s) s.value = "all";
  const t = document.getElementById("filtro-aprov-texto"); if (t) t.value = "";
  renderAprovados();
};

window.limparFiltrosHist = function () {
  const e = document.getElementById("filtro-hist-escola"); if (e) e.value = "all";
  const t = document.getElementById("filtro-hist-texto"); if (t) t.value = "";
  renderHistorico();
};

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
  // Camada 1: Equivalências confirmadas (match direto por SKU)
  if (typeof getEquivalencia === "function") {
    var sku = getEquivalencia(nomeItem);
    if (sku && typeof getProdutoBySku === "function") {
      var bpEquiv = getProdutoBySku(sku);
      if (bpEquiv) return bpEquiv;
    }
  }

  // Camada 2: Match exato normalizado
  var norm = normalizedText(nomeItem);
  var exact = bancoPrecos.itens.find(function(bp) { return normalizedText(bp.item) === norm; });
  if (exact) return exact;

  // Camada 3: Itens mestres (aliases + similaridade ≥ 0.5)
  if (typeof findBestMestre === "function") {
    var mestreMatch = findBestMestre(nomeItem);
    if (mestreMatch && mestreMatch.score >= 0.5) {
      var bpMestre = bancoPrecos.itens.find(function(bp) {
        return bp.mesterId === mestreMatch.mestre.id ||
          normalizedText(bp.item) === normalizedText(mestreMatch.mestre.nomeCanonico);
      });
      if (bpMestre) return bpMestre;
    }
  }

  // Camada 4: Jaccard similarity com tokens normalizados (sinônimos + sem noise)
  var tokensQuery = normalizedMatchTokens(nomeItem);
  var bestMatch = null;
  var bestScore = 0;

  for (var i = 0; i < bancoPrecos.itens.length; i++) {
    var bp = bancoPrecos.itens[i];
    var tokensBp = normalizedMatchTokens(bp.item);
    var score = calcTokenSimilarity(tokensQuery, tokensBp);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = bp;
    }
  }

  if (bestScore >= 0.5 && bestMatch) return bestMatch;
  return null;
}

function isGrupoExcluido(grupo) {
  if (!perfil.config || !perfil.config.gruposExcluidos) return false;
  return perfil.config.gruposExcluidos.some((g) => normalizedText(g) === normalizedText(grupo));
}

// ===== CONTROLE DE ACESSO POR MÓDULO =====
const MODULOS_KEY = "nexedu.modulos.acesso";

function getAcessoModulos() {
  try {
    const raw = localStorage.getItem(MODULOS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { radar: parsed.radar !== false, intelPrecos: parsed.intelPrecos !== false, gdp: true };
    }
  } catch(_) {}
  return { radar: true, intelPrecos: true, gdp: true };
}

function salvarModulos() {
  const acesso = {
    radar: document.getElementById("mod-radar")?.checked ?? true,
    intelPrecos: document.getElementById("mod-intel")?.checked ?? true,
    gdp: true
  };
  localStorage.setItem(MODULOS_KEY, JSON.stringify(acesso));
  aplicarAcessoSidebar();
  schedulCloudSync();
}

function carregarModulosConfig() {
  const acesso = getAcessoModulos();
  const r = document.getElementById("mod-radar"); if (r) r.checked = acesso.radar;
  const i = document.getElementById("mod-intel"); if (i) i.checked = acesso.intelPrecos;
  const g = document.getElementById("mod-gdp"); if (g) { g.checked = true; g.disabled = true; }
}

function aplicarAcessoSidebar() {
  const acesso = getAcessoModulos();
  document.querySelectorAll(".sidebar-item[data-module]").forEach(btn => {
    const mod = btn.dataset.module;
    if (mod === "radar") btn.style.display = acesso.radar ? "" : "none";
    if (mod === "intel-precos") btn.style.display = acesso.intelPrecos ? "" : "none";
    if (mod === "gdp") btn.style.display = acesso.gdp ? "" : "none";
  });
}
