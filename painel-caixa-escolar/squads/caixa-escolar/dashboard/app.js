/* ===================================================================
   Painel do Fornecedor — Licit-AIX
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

// ===== SUPABASE CLOUD SYNC =====
const SUPABASE_URL = "https://ohxoxencxktpzskltbsk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oeG94ZW5jeGt0cHpza2x0YnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTUwNDQsImV4cCI6MjA4ODc5MTA0NH0.-w8f1xjW1cW2-OZpg1Sql8PqwFDzDqyWw4pHEx6jGSk";
const RESULTADOS_STORAGE_KEY = "caixaescolar.resultados.v1";
const CONTRATOS_STORAGE_KEY = "caixaescolar.contratos.v1";
const PNCP_CACHE_KEY = "caixaescolar.pncp.cache";
const SYNC_KEYS = [
  "nexedu.empresa", "caixaescolar.banco.v1", "caixaescolar.preorcamentos.v1",
  "caixaescolar.resultados.v1", "caixaescolar.contratos.v1",
  "gdp.contratos.v1", "gdp.pedidos.v1", "gdp.entregas.provas.v1", "gdp.usuarios.v1",
  "gdp.produtos.v1", "nexedu.modulos.acesso"
];

function getSyncUserId() {
  const emp = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  return emp.nome || emp.cnpj || "default";
}

async function cloudSave(key, data) {
  const userId = getSyncUserId();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(userId)}&key=eq.${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    await fetch(`${SUPABASE_URL}/rest/v1/sync_data`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal"
      },
      body: JSON.stringify({ user_id: userId, key, data, updated_at: new Date().toISOString() })
    });
  } catch (e) { console.warn("Cloud save failed:", key, e); }
}

async function cloudLoadAll() {
  const userId = getSyncUserId();
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(userId)}&select=key,data,updated_at`,
      { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    return rows;
  } catch (e) { console.warn("Cloud load failed:", e); return null; }
}

async function syncFromCloud() {
  const rows = await cloudLoadAll();
  if (!rows || rows.length === 0) return false;
  let synced = 0;
  for (const row of rows) {
    const local = localStorage.getItem(row.key);
    const localData = local ? JSON.parse(local) : null;

    // Cloud wins ONLY if local is empty OR cloud updated_at is newer than local updatedAt
    if (!localData) {
      if (row.data) { localStorage.setItem(row.key, JSON.stringify(row.data)); synced++; }
      continue;
    }

    // Compare timestamps: local updatedAt vs cloud updated_at
    const cloudTime = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    const localTime = localData.updatedAt ? new Date(localData.updatedAt).getTime()
                    : localData.updated_at ? new Date(localData.updated_at).getTime() : 0;

    if (cloudTime > localTime && row.data) {
      localStorage.setItem(row.key, JSON.stringify(row.data));
      synced++;
    }
  }
  return synced > 0;
}

async function syncToCloud() {
  const promises = SYNC_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve();
    try {
      const data = JSON.parse(raw);
      return cloudSave(key, data);
    } catch(_) { return Promise.resolve(); }
  });
  await Promise.all(promises);
}

// Auto-sync: save to cloud whenever localStorage changes
let _syncTimeout = null;
function schedulCloudSync() {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(() => syncToCloud(), 2000);
}

// Sync on tab hide/close to minimize data loss window
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
    syncToCloud().catch(() => {});
  }
});

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
    const result = await this.proxy({ action: "login", cnpj: cred.cnpj, password: cred.pass || cred.password });
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

function setTextSafe(id, text) {
  const elem = document.getElementById(id);
  if (elem) elem.textContent = text;
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
  // 1. Exact match
  const exact = bancoPrecos.itens.find((bp) => normalizedText(bp.item) === norm);
  if (exact) return exact;
  // 2. Partial match: banco item name contained in query or vice versa
  const partial = bancoPrecos.itens.find((bp) => {
    const bpNorm = normalizedText(bp.item);
    return (bpNorm.length >= 4 && norm.includes(bpNorm)) || (norm.length >= 4 && bpNorm.includes(norm));
  });
  if (partial) return partial;
  // 3. First-word match (e.g. "Álcool" matches "Álcool etílico 70%")
  const firstWord = norm.split(/\s+/)[0];
  if (firstWord.length >= 4) {
    return bancoPrecos.itens.find((bp) => normalizedText(bp.item).split(/\s+/)[0] === firstWord) || null;
  }
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
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return { radar: true, intelPrecos: true, gdp: true };
}

function salvarModulos() {
  const acesso = {
    radar: document.getElementById("mod-radar")?.checked ?? true,
    intelPrecos: document.getElementById("mod-intel")?.checked ?? true,
    gdp: document.getElementById("mod-gdp")?.checked ?? true
  };
  localStorage.setItem(MODULOS_KEY, JSON.stringify(acesso));
  aplicarAcessoSidebar();
  schedulCloudSync();
}

function carregarModulosConfig() {
  const acesso = getAcessoModulos();
  const r = document.getElementById("mod-radar"); if (r) r.checked = acesso.radar;
  const i = document.getElementById("mod-intel"); if (i) i.checked = acesso.intelPrecos;
  const g = document.getElementById("mod-gdp"); if (g) g.checked = acesso.gdp;
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
    schedulCloudSync();
  } catch (_) { /* no-op */ }
}

// ===== BOOT =====
async function boot() {
  // Cloud sync: pull latest data, then push local data (ensures first machine populates cloud)
  try {
    const synced = await syncFromCloud();
    if (synced) console.log("[Boot] Cloud data synced to localStorage");
  } catch (e) { console.warn("[Boot] Cloud sync pull failed:", e); }
  // Push local data to cloud (fills Supabase on first run / existing data)
  try { await syncToCloud(); console.log("[Boot] Local data pushed to cloud"); }
  catch (e) { console.warn("[Boot] Cloud push failed:", e); }

  loadPreOrcamentos();
  carregarModulosConfig();
  aplicarAcessoSidebar();

  const [orcData, bancoData, perfilData, sreInfo] = await Promise.all([
    fetchJson("data/orcamentos.json"),
    fetchJson("data/banco-precos.json"),
    fetchJson("data/perfil.json"),
    fetchJson("data/sre-uberaba.json"),
  ]);

  // Data version check: v4 = SRE Uberaba filtered scan with idBudgetItem + idNetwork
  // Any older data is junk (unfiltered 3000+ entries without details) — wipe it
  const DATA_VERSION = "v5";
  const storedVersion = localStorage.getItem("caixaescolar.data-version");
  if (storedVersion !== DATA_VERSION) {
    // Old data format — wipe orcamentos, keep pre-orcamentos
    localStorage.removeItem("caixaescolar.orcamentos");
    localStorage.setItem("caixaescolar.data-version", DATA_VERSION);
    console.log("[Boot] Wiped old orcamentos data (version upgrade to " + DATA_VERSION + "). Run Varrer SGD to reload.");
  }

  const localOrc = localStorage.getItem("caixaescolar.orcamentos");
  if (localOrc) {
    try {
      const parsed = JSON.parse(localOrc);
      if (Array.isArray(parsed) && parsed.length > 0) {
        orcamentos = parsed;
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

  // Restore active module from localStorage
  const savedModule = localStorage.getItem(MODULE_STORAGE_KEY) || "radar";
  switchModule(savedModule);

  // Load empresa data into topbar if saved
  try {
    const empresaData = JSON.parse(localStorage.getItem(EMPRESA_STORAGE_KEY) || "{}");
    const pillSre = document.getElementById("pill-sre");
    const pillFornecedor = document.getElementById("pill-fornecedor");
    if (empresaData.sre && pillSre) pillSre.textContent = empresaData.sre;
    if (empresaData.nome && pillFornecedor) pillFornecedor.textContent = empresaData.nome;
  } catch (_) { /* ignore */ }
}

// ===== FILTERS =====
function populateFilters() {
  // Preserve current selections
  const prevEscola = el.filtroEscola.value;
  const prevMun = el.filtroMunicipio.value;
  const prevGrupo = el.filtroGrupo.value;

  // Clear existing options (keep first "all" option)
  [el.filtroEscola, el.filtroMunicipio, el.filtroGrupo].forEach((sel) => {
    while (sel.options.length > 1) sel.remove(1);
  });

  // Escolas
  const escolas = [...new Set(orcamentos.map((o) => o.escola).filter(Boolean))].sort();
  escolas.forEach((e) => {
    el.filtroEscola.appendChild(new Option(e, e));
  });

  // Municípios
  const municipios = [...new Set(orcamentos.map((o) => o.municipio).filter(Boolean))].sort();
  municipios.forEach((m) => {
    el.filtroMunicipio.appendChild(new Option(m, m));
  });

  // Grupos
  const grupos = [...new Set(orcamentos.map((o) => o.grupo).filter(Boolean))].sort();
  grupos.forEach((g) => {
    el.filtroGrupo.appendChild(new Option(g, g));
  });

  // Restore selections if still valid
  if (escolas.includes(prevEscola)) el.filtroEscola.value = prevEscola;
  if (municipios.includes(prevMun)) el.filtroMunicipio.value = prevMun;
  if (grupos.includes(prevGrupo)) el.filtroGrupo.value = prevGrupo;

  // Banco grupos
  if (el.filtroBancoGrupo) {
    while (el.filtroBancoGrupo.options.length > 1) el.filtroBancoGrupo.remove(1);
    const bGrupos = [...new Set(bancoPrecos.itens.map((i) => i.grupo))].sort();
    bGrupos.forEach((g) => {
      el.filtroBancoGrupo.appendChild(new Option(g, g));
    });
  }

  // Modal grupo (todos os grupos do perfil)
  if (el.modalGrupo) {
    while (el.modalGrupo.options.length > 0) el.modalGrupo.remove(0);
    const allGrupos = perfil.config && perfil.config.gruposAtendidos
      ? perfil.config.gruposAtendidos
      : grupos;
    allGrupos.forEach((g) => {
      el.modalGrupo.appendChild(new Option(g, g));
    });
  }
}

function filteredOrcamentos() {
  const escola = el.filtroEscola.value;
  const mun = el.filtroMunicipio.value;
  const grupo = el.filtroGrupo.value;
  const status = el.filtroStatus.value;
  const query = normalizedText(el.filtroTexto.value.trim());

  return orcamentos
    .filter((o) => escola === "all" || o.escola === escola)
    .filter((o) => mun === "all" || o.municipio === mun)
    .filter((o) => grupo === "all" || o.grupo === grupo)
    .filter((o) => {
      if (status === "all") return true;
      if (status === "vencido") {
        // Considerar vencido se o status é "vencido" OU se o prazo ja passou
        return o.status === "vencido" || (o.status === "aberto" && o.prazo && daysTo(o.prazo) <= 0);
      }
      if (status === "aberto") {
        // Aberto = status aberto E prazo ainda nao venceu
        return o.status === "aberto" && (!o.prazo || daysTo(o.prazo) > 0);
      }
      return o.status === status;
    })
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
  // Limpar campos de busca ao carregar
  if (el.filtroTexto) el.filtroTexto.value = "";
  if (el.filtroBancoTexto) el.filtroBancoTexto.value = "";
  populateFilters();
  renderKPIs();
  renderOrcamentos();
  renderIntel();
  renderPreOrcamentosLista();
  renderBanco();
  renderSgd();
  renderAprovados();
  renderHistorico();
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

  if (el.kpiAbertos) el.kpiAbertos.textContent = abertos.length;
  if (el.kpiUrgentes) {
    el.kpiUrgentes.textContent = urgentes.length;
    el.kpiUrgentes.style.color = urgentes.length > 0 ? "#ef4444" : "";
  }
  if (el.kpiPendentes) el.kpiPendentes.textContent = pendentes.length;
  if (el.kpiFaturamento) el.kpiFaturamento.textContent = brl.format(faturamento);
  if (el.kpiMargem) el.kpiMargem.textContent = pct(margemMedia);
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
  if (el.intelConversao) el.intelConversao.textContent = pct(taxaConversao);

  // Prazo médio
  const prazoDias = abertos.map((o) => daysTo(o.prazo)).filter((d) => d < 999);
  const prazoMedio = prazoDias.length ? Math.round(prazoDias.reduce((a, b) => a + b, 0) / prazoDias.length) : 0;
  if (el.intelPrazoMedio) el.intelPrazoMedio.textContent = prazoMedio + " dias";

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

    if (o.status === "vencido") {
      statusClass = "badge-vencido";
      statusLabel = "Vencido";
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
      <td class="obj-cell" title="${escapeHtml(o.objeto)}">${escapeHtml((o.objeto || "").replace(/\n/g, " "))}</td>
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

    const todayStr = new Date().toISOString().slice(0, 10);

    const itens = (orc.itens || []).map((item) => {
      let bp = findBancoItem(item.nome);
      if (!bp) {
        bp = {
          id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
          item: item.nome,
          grupo: orc.grupo || "Material de Consumo Geral",
          unidade: item.unidade || "Unidade",
          custoBase: 0, margemPadrao: margemPadrao, precoReferencia: 0,
          ultimaCotacao: todayStr, fonte: "",
          propostas: [], concorrentes: [], custosFornecedor: [],
        };
        bancoPrecos.itens.push(bp);
      }
      let custoUnit = bp.custoBase;
      if (custoUnit === 0 && (bp.custosFornecedor || []).length > 0) {
        custoUnit = bp.custosFornecedor[bp.custosFornecedor.length - 1].preco;
      }
      const margem = bp.margemPadrao || margemPadrao;
      const precoUnit = custoUnit > 0 ? Math.round(custoUnit * (1 + margem) * 100) / 100 : 0;
      const concorrentes = bp.concorrentes || [];
      const menorConc = concorrentes.length > 0 ? Math.min(...concorrentes.map((c) => c.preco)) : 0;

      return {
        nome: item.nome,
        marca: bp.marca || "",
        descricao: item.descricao || "",
        quantidade: item.quantidade || 0,
        unidade: item.unidade || "Unidade",
        custoUnitario: custoUnit,
        margem: margem,
        precoUnitario: precoUnit,
        precoTotal: Math.round(precoUnit * (item.quantidade || 0) * 100) / 100,
        menorConcorrente: menorConc,
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

  saveBancoLocal();
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

  const todayStr = new Date().toISOString().slice(0, 10);

  const itens = (orc.itens || []).map((item) => {
    let bp = findBancoItem(item.nome);

    // Auto-create banco entry if item doesn't exist
    if (!bp) {
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        grupo: orc.grupo || "Material de Consumo Geral",
        unidade: item.unidade || "Unidade",
        custoBase: 0,
        margemPadrao: margemPadrao,
        precoReferencia: 0,
        ultimaCotacao: todayStr,
        fonte: "",
        propostas: [],
        concorrentes: [],
        custosFornecedor: [],
      };
      bancoPrecos.itens.push(bp);
    }

    let custoUnit = bp.custoBase;
    // Try fornecedor cost if banco custoBase is 0
    if (custoUnit === 0 && (bp.custosFornecedor || []).length > 0) {
      custoUnit = bp.custosFornecedor[bp.custosFornecedor.length - 1].preco;
    }
    const margem = bp.margemPadrao || margemPadrao;
    const precoUnit = custoUnit > 0 ? Math.round(custoUnit * (1 + margem) * 100) / 100 : 0;
    const concorrentes = bp.concorrentes || [];
    const menorConc = concorrentes.length > 0 ? Math.min(...concorrentes.map((c) => c.preco)) : 0;

    return {
      nome: item.nome,
      marca: bp.marca || "",
      descricao: item.descricao || "",
      quantidade: item.quantidade || 0,
      unidade: item.unidade || "Unidade",
      custoUnitario: custoUnit,
      margem: margem,
      precoUnitario: precoUnit,
      precoTotal: Math.round(precoUnit * (item.quantidade || 0) * 100) / 100,
      idBudgetItem: item.idBudgetItem || null,
      menorConcorrente: menorConc,
    };
  });

  saveBancoLocal(); // Save new banco entries

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
  const isPendente = pre.status === "pendente";
  el.btnAprovar.style.display = isPendente ? "inline-block" : "none";
  el.btnRecusar.style.display = isPendente ? "inline-block" : "none";

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

  // Render SGD extra fields (datas, obs, garantia) — always show for editing
  renderSgdFields();
};

// ===== RENDER PRÉ-ORÇAMENTO ITENS (Passo 5 — PNCP) =====
function renderPreOrcamentoItens() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  const isEditable = pre.status === "pendente" || pre.status === "aprovado";

  el.tbodyPreorcamento.innerHTML = pre.itens.map((item, idx) => {
    const custoInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${item.custoUnitario}" step="0.01" min="0" onchange="updatePreItem(${idx}, 'custoUnitario', this.value)" />`
      : brl.format(item.custoUnitario);

    const margemInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${(item.margem * 100).toFixed(0)}" step="1" min="0" max="100" onchange="updatePreItem(${idx}, 'margem', this.value)" />`
      : pct(item.margem);

    const precoInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${item.precoUnitario}" step="0.01" min="0" onchange="updatePreItem(${idx}, 'precoUnitario', this.value)" />`
      : brl.format(item.precoUnitario);

    // PNCP ref (Passo 5) — busca preço de referência no banco
    const bp = findBancoItem(item.nome);
    let pncpHint = "";
    if (bp && bp.precoReferencia > 0) {
      const diff = item.custoUnitario > 0 && bp.custoBase > 0
        ? Math.abs(item.custoUnitario - bp.custoBase) / bp.custoBase
        : 0;
      const diffClass = diff > 0.30 ? "pncp-alert" : "pncp-ok";
      pncpHint = `<span class="pncp-tooltip ${diffClass}" title="Ref. Banco: ${brl.format(bp.precoReferencia)} (custo: ${brl.format(bp.custoBase)})">Ref: ${brl.format(bp.precoReferencia)}</span>`;
    } else if (!bp || bp.custoBase === 0) {
      pncpHint = `<span class="pncp-tooltip" style="color:#f59e0b;font-size:0.7rem" title="Item sem referência no banco de preços. Preencha o custo e ele será salvo automaticamente.">&#9888; Sem ref. no banco</span>`;
    }

    // Competitor intelligence hint — always pull fresh from banco
    let menorConc = item.menorConcorrente || 0;
    if (bp) {
      const concorrentes = bp.concorrentes || [];
      if (concorrentes.length > 0) {
        menorConc = Math.min(...concorrentes.map((c) => c.preco));
        item.menorConcorrente = menorConc; // update in-memory for future use
      }
      // Also show fornecedor cost if available
      const custosForn = bp.custosFornecedor || [];
      if (custosForn.length > 0) {
        const ultimoForn = custosForn[custosForn.length - 1];
        if (item.custoUnitario === 0 && ultimoForn.preco > 0) {
          // Auto-fill custo from supplier if empty
          item.custoUnitario = ultimoForn.preco;
          item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
          item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
        }
      }
    }
    let concHint = "";
    if (menorConc > 0) {
      const concClass = item.precoUnitario <= menorConc ? "pncp-ok" : "pncp-alert";
      concHint = `<span class="pncp-tooltip ${concClass}" title="Menor preço concorrente registrado">Concorrente: ${brl.format(menorConc)}</span>`;
    }
    // Fornecedor cost hint
    let fornHint = "";
    if (bp && (bp.custosFornecedor || []).length > 0) {
      const ultimoForn = bp.custosFornecedor[bp.custosFornecedor.length - 1];
      fornHint = `<span class="pncp-tooltip pncp-ok" title="Custo ${ultimoForn.fornecedor}: ${brl.format(ultimoForn.preco)} em ${ultimoForn.data}">Forn: ${brl.format(ultimoForn.preco)}</span>`;
    }

    const marcaVal = item.marca || (bp ? bp.marca || "" : "");
    const marcaInput = isEditable
      ? `<input type="text" class="preorcamento-input" value="${escapeHtml(marcaVal)}" placeholder="Marca" style="width:80px" onchange="updatePreItem(${idx}, 'marca', this.value)" />`
      : escapeHtml(marcaVal);

    return `<tr>
      <td>
        <strong>${escapeHtml(item.nome)}</strong>
        <br><span class="text-muted" style="font-size:0.75rem">${escapeHtml(item.descricao)}</span>
        <br><span class="text-muted" style="font-size:0.72rem">${item.quantidade} ${escapeHtml(item.unidade)}</span>
        ${pncpHint}
        ${concHint}
        ${fornHint}
      </td>
      <td>${marcaInput}</td>
      <td class="text-right">${item.quantidade}</td>
      <td class="text-right">${custoInput}</td>
      <td class="text-right">${margemInput}</td>
      <td class="text-right font-mono">${precoInput}</td>
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

  if (field === "marca") {
    item.marca = value.trim();
    // Sync marca to banco
    let bp = findBancoItem(item.nome);
    if (bp) {
      bp.marca = item.marca;
      saveBancoLocal();
    }
    savePreOrcamentos();
    return;
  }

  if (field === "custoUnitario") {
    item.custoUnitario = Math.max(0, parseFloat(value) || 0);
    item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
  } else if (field === "margem") {
    item.margem = Math.max(0, Math.min(1, (parseFloat(value) || 0) / 100));
    item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
  } else if (field === "precoUnitario") {
    item.precoUnitario = Math.max(0, parseFloat(value) || 0);
    // Recalcular margem com base no preco manual
    if (item.custoUnitario > 0) {
      item.margem = Math.round(((item.precoUnitario / item.custoUnitario) - 1) * 100) / 100;
    }
  }

  item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;

  // Recalcular totais
  pre.totalGeral = Math.round(pre.itens.reduce((s, i) => s + i.precoTotal, 0) * 100) / 100;
  const margens = pre.itens.filter((i) => i.custoUnitario > 0).map((i) => i.margem);
  pre.margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  // Auto-feed banco de preços with custoBase when user fills in cost
  if (field === "custoUnitario" && item.custoUnitario > 0) {
    let bp = findBancoItem(item.nome);
    if (!bp) {
      // Auto-create banco entry
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        marca: item.marca || "",
        grupo: pre.grupo || "Material de Consumo Geral",
        unidade: item.unidade || "Unidade",
        custoBase: 0, margemPadrao: item.margem || 0.30, precoReferencia: 0,
        ultimaCotacao: "", fonte: "",
        propostas: [], concorrentes: [], custosFornecedor: [],
      };
      bancoPrecos.itens.push(bp);
    }
    bp.custoBase = item.custoUnitario;
    bp.precoReferencia = Math.round(bp.custoBase * (1 + bp.margemPadrao) * 100) / 100;
    bp.ultimaCotacao = new Date().toISOString().slice(0, 10);
    saveBancoLocal();
  }

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

  // Validar: todos os itens precisam ter preco > 0 (custo OU preco direto)
  const semPreco = pre.itens.filter((i) => i.precoUnitario <= 0);
  if (semPreco.length > 0) {
    alert("Preencha o preço unitário de todos os itens antes de aprovar.");
    return;
  }

  // Save SGD fields (dates, obs, garantia) before approving
  saveSgdFieldsToPreOrcamento(pre);

  pre.status = "aprovado";
  pre.aprovadoEm = new Date().toISOString().slice(0, 10);

  // Auto-feed propostas to banco de precos
  const todayStr = new Date().toISOString().slice(0, 10);
  (pre.itens || []).forEach((item) => {
    let bp = findBancoItem(item.nome);
    if (!bp) {
      // Create new banco item
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        grupo: pre.grupo || "",
        unidade: item.unidade || "Unidade",
        custoBase: item.custoUnitario,
        margemPadrao: item.margem || 0.30,
        precoReferencia: item.precoUnitario,
        ultimaCotacao: todayStr,
        fonte: "",
        propostas: [],
        concorrentes: [],
        custosFornecedor: [],
      };
      bancoPrecos.itens.push(bp);
    }
    if (!bp.propostas) bp.propostas = [];
    bp.propostas.push({
      edital: pre.orcamentoId,
      escola: pre.escola,
      preco: item.precoUnitario,
      data: todayStr,
      resultado: "pendente",
    });
  });
  saveBancoLocal();

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
      const propostasText = (i.propostas || []).map((p) => p.edital + " " + p.escola).join(" ");
      const concorrentesText = (i.concorrentes || []).map((c) => c.nome + " " + c.edital).join(" ");
      return normalizedText(i.item + " " + i.grupo + " " + (i.fonte || "") + " " + propostasText + " " + concorrentesText).includes(query);
    })
    .sort((a, b) => (a.grupo + a.item).localeCompare(b.grupo + b.item));
}

function renderBanco() {
  const list = filteredBanco();
  el.bancoEmpty.style.display = list.length ? "none" : "block";

  el.tbodyBanco.innerHTML = list.map((item) => {
    // Minha Proposta = media das propostas ou precoReferencia
    const propostas = item.propostas || [];
    const minhaPropostaMedia = propostas.length > 0
      ? propostas.reduce((s, p) => s + p.preco, 0) / propostas.length
      : item.precoReferencia;

    // Menor Concorrente
    const concorrentes = item.concorrentes || [];
    const menorConcorrente = concorrentes.length > 0
      ? Math.min(...concorrentes.map((c) => c.preco))
      : null;

    // Margem Real
    const margemReal = item.custoBase > 0
      ? ((minhaPropostaMedia - item.custoBase) / item.custoBase) * 100
      : 0;
    const margemRealStr = margemReal.toFixed(1) + "%";
    const margemClass = margemReal >= 20 ? "text-accent" : margemReal >= 10 ? "" : "text-danger";

    // Competitividade badge
    let compBadge;
    if (menorConcorrente === null) {
      compBadge = `<span class="badge badge-muted">Sem dados</span>`;
    } else if (minhaPropostaMedia <= menorConcorrente) {
      compBadge = `<span class="badge badge-ok">Competitivo</span>`;
    } else if (minhaPropostaMedia <= menorConcorrente * 1.05) {
      compBadge = `<span class="badge badge-warn">Na média</span>`;
    } else {
      compBadge = `<span class="badge badge-danger">Acima</span>`;
    }

    return `<tr>
      <td><input type="checkbox" class="banco-item-check" data-id="${item.id}" /></td>
      <td><strong>${escapeHtml(item.item)}</strong>
        ${propostas.length > 0 ? `<br><span class="text-muted" style="font-size:0.7rem">${propostas.length} proposta(s)</span>` : ""}
      </td>
      <td>${escapeHtml(item.marca || "")}</td>
      <td>${escapeHtml(item.grupo)}</td>
      <td class="text-right font-mono">${brl.format(item.custoBase)}</td>
      <td class="text-right font-mono">${brl.format(minhaPropostaMedia)}</td>
      <td class="text-right font-mono">${menorConcorrente !== null ? brl.format(menorConcorrente) : "—"}</td>
      <td class="text-right font-mono">${brl.format(item.precoReferencia)}</td>
      <td class="text-right ${margemClass}">${margemRealStr}</td>
      <td class="text-center">${compBadge}</td>
      <td class="nowrap">
        <button class="btn btn-inline" onclick="editarBancoItem('${item.id}')">Editar</button>
        <button class="btn btn-inline btn-danger" onclick="removerBancoItem('${item.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join("");

  // Reset select-all checkbox
  const selectAll = document.getElementById("banco-select-all");
  if (selectAll) selectAll.checked = false;
  updateBancoSelectionUI();
}

function openBancoModal(item) {
  el.modalBanco.style.display = "flex";
  el.modalBancoTitulo.textContent = item ? "Editar Item" : "Novo Item";
  el.modalItem.value = item ? item.item : "";
  el.modalGrupo.value = item ? item.grupo : (el.modalGrupo.options[0] ? el.modalGrupo.options[0].value : "");
  el.modalUnidade.value = item ? (item.unidade || "") : "";
  el.modalCusto.value = item ? item.custoBase : "";
  el.modalMargem.value = item ? (item.margemPadrao * 100).toFixed(0) : "30";
  el.modalMarca.value = item ? (item.marca || "") : "";
  el.modalFonte.value = item ? (item.fonte || "") : "";
  el.modalPrecoFornecedor.value = "";
  editingBancoId = item ? item.id : null;
}

function closeBancoModal() {
  el.modalBanco.style.display = "none";
  editingBancoId = null;
}

function salvarBancoItem() {
  const nome = el.modalItem.value.trim();
  if (!nome) { alert("Informe o nome do item."); return; }

  const precoFornecedor = parseFloat(el.modalPrecoFornecedor.value) || 0;
  let custo = parseFloat(el.modalCusto.value) || 0;

  // Se fornecedor price provided, update custoBase to it
  if (precoFornecedor > 0) custo = precoFornecedor;

  const margem = Math.max(0, Math.min(100, parseFloat(el.modalMargem.value) || 30)) / 100;
  const preco = Math.round(custo * (1 + margem) * 100) / 100;
  const todayStr = new Date().toISOString().slice(0, 10);

  if (editingBancoId) {
    const idx = bancoPrecos.itens.findIndex((i) => i.id === editingBancoId);
    if (idx >= 0) {
      const existing = bancoPrecos.itens[idx];
      bancoPrecos.itens[idx] = {
        ...existing,
        item: nome,
        marca: el.modalMarca.value.trim(),
        grupo: el.modalGrupo.value,
        unidade: el.modalUnidade.value.trim() || "Unidade",
        custoBase: custo,
        margemPadrao: margem,
        precoReferencia: preco,
        ultimaCotacao: todayStr,
        fonte: el.modalFonte.value.trim(),
      };
      // Push to custosFornecedor if fornecedor price provided
      if (precoFornecedor > 0) {
        if (!bancoPrecos.itens[idx].custosFornecedor) bancoPrecos.itens[idx].custosFornecedor = [];
        bancoPrecos.itens[idx].custosFornecedor.push({
          fornecedor: el.modalFonte.value.trim() || "Manual",
          preco: precoFornecedor,
          data: todayStr,
        });
      }
    }
  } else {
    const newId = "bp-" + String(Date.now()).slice(-6);
    const newItem = {
      id: newId,
      item: nome,
      marca: el.modalMarca.value.trim(),
      grupo: el.modalGrupo.value,
      unidade: el.modalUnidade.value.trim() || "Unidade",
      custoBase: custo,
      margemPadrao: margem,
      precoReferencia: preco,
      ultimaCotacao: todayStr,
      fonte: el.modalFonte.value.trim(),
      propostas: [],
      concorrentes: [],
      custosFornecedor: [],
    };
    // Push to custosFornecedor if fornecedor price provided
    if (precoFornecedor > 0) {
      newItem.custosFornecedor.push({
        fornecedor: el.modalFonte.value.trim() || "Manual",
        preco: precoFornecedor,
        data: todayStr,
      });
    }
    bancoPrecos.itens.push(newItem);
  }

  saveBancoLocal();
  closeBancoModal();
  renderBanco();
}

// ===== BANCO: BULK SELECTION & DELETE =====
function updateBancoSelectionUI() {
  const checks = document.querySelectorAll(".banco-item-check:checked");
  const btn = document.getElementById("btn-excluir-selecionados-banco");
  const countEl = document.getElementById("banco-sel-count");
  if (btn) {
    btn.style.display = checks.length > 0 ? "inline-block" : "none";
    if (countEl) countEl.textContent = checks.length;
  }
}

window.excluirSelecionadosBanco = function () {
  const checks = document.querySelectorAll(".banco-item-check:checked");
  const ids = Array.from(checks).map(c => c.dataset.id);
  if (ids.length === 0) return;
  if (!confirm(`Excluir ${ids.length} item(ns) do banco de preços?`)) return;
  bancoPrecos.itens = bancoPrecos.itens.filter(i => !ids.includes(i.id));
  saveBancoLocal();
  renderBanco();
};

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

function limparBanco() {
  const total = bancoPrecos.itens.length;
  const importados = bancoPrecos.itens.filter((i) => i.grupo === "Importado").length;

  const opcao = prompt(
    `Banco tem ${total} itens (${importados} importados).\n\n` +
    `Digite:\n` +
    `1 = Limpar APENAS importados (dados bugados)\n` +
    `2 = Limpar TUDO (resetar banco completo)\n` +
    `0 = Cancelar`
  );

  if (opcao === "1") {
    bancoPrecos.itens = bancoPrecos.itens.filter((i) => i.grupo !== "Importado");
    saveBancoLocal();
    renderBanco();
    alert(`${importados} itens importados removidos.`);
  } else if (opcao === "2") {
    if (!confirm("Tem certeza? Isso apagará TODOS os itens do banco de preços.")) return;
    bancoPrecos = { updatedAt: "", itens: [] };
    saveBancoLocal();
    renderBanco();
    alert("Banco de preços limpo.");
  }
}

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

// ===== MODULE NAVIGATION =====
const MODULE_STORAGE_KEY = "nexedu.activeModule";
const EMPRESA_STORAGE_KEY = "nexedu.empresa";
const USUARIOS_STORAGE_KEY = "nexedu.usuarios";

window.switchModule = function switchModule(moduleId) {
  // GDP navigates away
  if (moduleId === "gdp") {
    window.location.href = "gdp-contratos.html";
    return;
  }

  // Update sidebar active state
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.module === moduleId);
  });

  // Hide all tab-content sections
  document.querySelectorAll(".tab-content").forEach((tc) => {
    tc.classList.remove("active");
  });

  const tabsIntel = document.getElementById("tabs-intel-precos");

  if (moduleId === "radar") {
    // Show orçamentos directly, hide horizontal tabs
    if (tabsIntel) tabsIntel.style.display = "none";
    const radarDash = document.getElementById("radar-dashboard");
    if (radarDash) radarDash.style.display = "";
    const ipDash = document.getElementById("intel-precos-dashboard");
    if (ipDash) ipDash.style.display = "none";
    document.getElementById("tab-orcamentos").classList.add("active");
  } else if (moduleId === "intel-precos") {
    // Show horizontal tabs for Intel. Preços, hide radar dashboard
    if (tabsIntel) tabsIntel.style.display = "flex";
    const radarDash = document.getElementById("radar-dashboard");
    if (radarDash) radarDash.style.display = "none";
    const ipDash = document.getElementById("intel-precos-dashboard");
    if (ipDash) ipDash.style.display = "";
    // Activate first tab by default
    const activeSub = tabsIntel.querySelector(".tab.active");
    const tabId = activeSub ? activeSub.dataset.tab : "pre-orcamento";
    switchTab(tabId);
  } else if (moduleId === "config") {
    if (tabsIntel) tabsIntel.style.display = "none";
    const radarDash = document.getElementById("radar-dashboard");
    if (radarDash) radarDash.style.display = "none";
    const ipDash = document.getElementById("intel-precos-dashboard");
    if (ipDash) ipDash.style.display = "none";
    document.getElementById("config-panel").classList.add("active");
    loadConfigData();
  }

  // Persist
  localStorage.setItem(MODULE_STORAGE_KEY, moduleId);

  // Close mobile sidebar
  closeSidebar();
};

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("active");
}

// ===== CONFIG PANEL =====
function loadConfigData() {
  try {
    const data = JSON.parse(localStorage.getItem(EMPRESA_STORAGE_KEY) || "{}");
    const cfgNome = document.getElementById("cfg-nome");
    const cfgRazaoSocial = document.getElementById("cfg-razao-social");
    const cfgCnpj = document.getElementById("cfg-cnpj");
    const cfgLogradouro = document.getElementById("cfg-logradouro");
    const cfgNumero = document.getElementById("cfg-numero");
    const cfgBairro = document.getElementById("cfg-bairro");
    const cfgCidade = document.getElementById("cfg-cidade");
    const cfgUf = document.getElementById("cfg-uf");
    const cfgCep = document.getElementById("cfg-cep");
    const cfgTelefone = document.getElementById("cfg-telefone");
    const cfgEmail = document.getElementById("cfg-email");
    if (cfgNome) cfgNome.value = data.nome || "";
    if (cfgRazaoSocial) cfgRazaoSocial.value = data.razaoSocial || "";
    if (cfgCnpj) cfgCnpj.value = data.cnpj || "";
    if (cfgLogradouro) cfgLogradouro.value = data.logradouro || "";
    if (cfgNumero) cfgNumero.value = data.numero || "";
    if (cfgBairro) cfgBairro.value = data.bairro || "";
    if (cfgCidade) cfgCidade.value = data.cidade || "";
    if (cfgUf) cfgUf.value = data.uf || "";
    if (cfgCep) cfgCep.value = data.cep || "";
    if (cfgTelefone) cfgTelefone.value = data.telefone || "";
    if (cfgEmail) cfgEmail.value = data.email || "";
  } catch (_) { /* ignore */ }
  renderUsuarios();
}

function saveConfigEmpresa() {
  const data = {
    nome: (document.getElementById("cfg-nome") || {}).value || "",
    razaoSocial: (document.getElementById("cfg-razao-social") || {}).value || "",
    cnpj: (document.getElementById("cfg-cnpj") || {}).value || "",
    logradouro: (document.getElementById("cfg-logradouro") || {}).value || "",
    numero: (document.getElementById("cfg-numero") || {}).value || "",
    bairro: (document.getElementById("cfg-bairro") || {}).value || "",
    cidade: (document.getElementById("cfg-cidade") || {}).value || "",
    uf: (document.getElementById("cfg-uf") || {}).value || "",
    cep: (document.getElementById("cfg-cep") || {}).value || "",
    telefone: (document.getElementById("cfg-telefone") || {}).value || "",
    email: (document.getElementById("cfg-email") || {}).value || "",
  };
  localStorage.setItem(EMPRESA_STORAGE_KEY, JSON.stringify(data));
  schedulCloudSync();

  // Update topbar pills with saved data
  const pillSre = document.getElementById("pill-sre");
  const pillFornecedor = document.getElementById("pill-fornecedor");
  if (data.cidade && data.uf && pillSre) pillSre.textContent = data.cidade + "-" + data.uf;
  if (data.nome && pillFornecedor) pillFornecedor.textContent = data.nome;

  if (typeof showToast === "function") showToast("Dados da empresa salvos!");
}

function renderUsuarios() {
  const tbody = document.getElementById("tbody-usuarios");
  const emptyMsg = document.getElementById("usuarios-empty");
  if (!tbody) return;

  const usuarios = JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || "[]");
  tbody.innerHTML = "";

  if (usuarios.length === 0) {
    if (emptyMsg) emptyMsg.style.display = "block";
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  usuarios.forEach((u, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nome || ""}</td>
      <td>${u.email || ""}</td>
      <td>${u.usuario || ""}</td>
      <td>${u.perfil || "Operador"}</td>
      <td><span class="badge badge-${u.ativo !== false ? "aprovado" : "vencido"}">${u.ativo !== false ? "Ativo" : "Inativo"}</span></td>
      <td><button class="btn btn-inline btn-danger" onclick="removeUsuario(${idx})">Remover</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.addUsuario = function addUsuario() {
  const nome = (document.getElementById("usr-nome") || {}).value || "";
  const email = (document.getElementById("usr-email") || {}).value || "";
  const usuario = (document.getElementById("usr-usuario") || {}).value || "";
  const senha = (document.getElementById("usr-senha") || {}).value || "";
  const perfil = (document.getElementById("usr-perfil") || {}).value || "Operador";

  if (!nome || !usuario || !senha) {
    alert("Preencha pelo menos Nome, Usuário e Senha.");
    return;
  }

  const usuarios = JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || "[]");
  usuarios.push({ nome, email, usuario, senha: btoa(senha), perfil, ativo: true });
  localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuarios));
  renderUsuarios();

  // Clear form
  ["usr-nome", "usr-email", "usr-usuario", "usr-senha"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const selPerfil = document.getElementById("usr-perfil");
  if (selPerfil) selPerfil.value = "Operador";
};

window.removeUsuario = function removeUsuario(idx) {
  const usuarios = JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || "[]");
  if (idx >= 0 && idx < usuarios.length) {
    usuarios.splice(idx, 1);
    localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuarios));
    renderUsuarios();
  }
};

// ===== TABS =====
window.switchTab = function switchTab(tabId) {
  document.querySelectorAll("#tabs-intel-precos .tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  // Hide all tab-contents except config
  document.querySelectorAll(".tab-content").forEach((tc) => {
    if (tc.id !== "config-panel") tc.classList.remove("active");
  });
  const target = document.getElementById("tab-" + tabId);
  if (target) target.classList.add("active");
  // Re-render tab content on switch
  if (tabId === "envio-sgd") renderSgd();
  if (tabId === "aprovados") renderAprovados();
  if (tabId === "historico") renderHistorico();
  if (tabId === "pre-orcamento" && !activePreOrcamentoId) renderPreOrcamentosLista();
}

// ===== EVENTS =====
function bindEvents() {
  // Sidebar module navigation
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchModule(item.dataset.module);
    });
  });

  // Sidebar toggle (mobile)
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

  // Config tabs
  document.querySelectorAll(".config-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".config-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".config-content").forEach((c) => c.classList.remove("active"));
      const target = document.getElementById("config-" + tab.dataset.configTab);
      if (target) target.classList.add("active");
    });
  });

  // Config save
  const btnCfgSalvar = document.getElementById("btn-cfg-salvar");
  if (btnCfgSalvar) btnCfgSalvar.addEventListener("click", saveConfigEmpresa);
  const btnAddUsuario = document.getElementById("btn-add-usuario");
  if (btnAddUsuario) btnAddUsuario.addEventListener("click", addUsuario);

  // Tab navigation (Intel. Preços sub-tabs)
  document.querySelectorAll("#tabs-intel-precos .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Filtros orçamentos
  el.filtroEscola.addEventListener("change", renderOrcamentos);
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
  el.btnLimparBanco.addEventListener("click", limparBanco);

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

// ===== UNIT CONVERSION INTELLIGENCE =====
const UNIT_CONVERSIONS = {
  "caixa": { aliases: ["cx", "cxa", "caixa"], defaultQty: 12 },
  "pacote": { aliases: ["pct", "pct.", "pacote"], defaultQty: 10 },
  "fardo": { aliases: ["fardo", "fd"], defaultQty: 6 },
  "duzia": { aliases: ["dz", "duzia", "dúzia"], defaultQty: 12 },
  "resma": { aliases: ["resma", "rm"], defaultQty: 500 },
};

function parseUnitConversion(unidadeStr, precoOriginal) {
  if (!unidadeStr || !precoOriginal) return { unidade: unidadeStr || "Unidade", preco: precoOriginal, convertido: false };
  const norm = normalizedText(unidadeStr);

  // Check "caixa c/ 12", "cx c/ 24", "pct com 10", "fardo 6 un"
  const matchQty = norm.match(/(?:cx|cxa|caixa|pct|pacote|fardo|fd|dz|duzia|resma)\s*(?:c\/|com|c\.|\/)?\s*(\d+)/);
  if (matchQty) {
    const qty = parseInt(matchQty[1], 10);
    if (qty > 1) {
      return { unidade: "Unidade", preco: Math.round((precoOriginal / qty) * 100) / 100, convertido: true, qtdOriginal: qty };
    }
  }

  // Check bare unit names with default conversion
  for (const [, conv] of Object.entries(UNIT_CONVERSIONS)) {
    if (conv.aliases.some((a) => norm === a || norm.startsWith(a + " "))) {
      return { unidade: "Unidade", preco: Math.round((precoOriginal / conv.defaultQty) * 100) / 100, convertido: true, qtdOriginal: conv.defaultQty };
    }
  }

  return { unidade: unidadeStr, preco: precoOriginal, convertido: false };
}

// ===== MULTI-FORMAT IMPORT (PDF, DOCX, Excel, JPEG/OCR, Mapa de Apuracao) =====
let importData = { rows: [], headers: [], mapping: {} };

function openImportDialog() {
  el.importFileInput.value = "";
  el.importFileInput.click();
}

// --- File Router ---
function handleExcelUpload(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "pdf") { handlePdfUpload(file); return; }
  if (ext === "docx" || ext === "doc") { handleDocxUpload(file); return; }
  if (["jpg", "jpeg", "png"].includes(ext)) { handleImageOcr(file); return; }

  // Excel / CSV
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (json.length < 2) { alert("Planilha vazia ou sem dados."); return; }

      const headers = json[0].map((h) => String(h || "").trim());
      const rows = json.slice(1).filter((r) => r.some((c) => c != null && c !== ""));

      // Check for Mapa de Apuracao pattern in Excel
      if (detectMapaApuracao(headers)) {
        // Try to find classification table in second sheet
        let classTable = null;
        if (wb.SheetNames.length > 1) {
          const sheet2 = wb.Sheets[wb.SheetNames[1]];
          const json2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });
          if (json2.length > 1) classTable = json2;
        }
        handleMapaApuracao([headers, ...rows], classTable, "Excel");
        return;
      }

      importData = { rows, headers, mapping: autoDetectColumns(headers) };
      showFormatBadge("Excel");
      previewImportData();
    } catch (err) {
      alert("Erro ao ler arquivo: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// --- PDF Handler (text + scanned fallback) ---
async function handlePdfUpload(file) {
  try {
    if (typeof pdfjsLib === "undefined") { alert("PDF.js nao carregou. Recarregue a pagina."); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const allRows = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const textContent = await page.getTextContent();
      const items = textContent.items;

      // Group text items by Y-coordinate with tolerance (items within 3px = same line)
      const rawItems = items.filter((item) => item.str.trim()).map((item) => ({
        x: item.transform[4],
        y: Math.round(item.transform[5]),
        text: item.str.trim(),
      }));

      // Merge nearby Y coordinates into line groups (tolerance of 3px)
      const yTolerance = 3;
      const lineGroups = [];
      const sortedByY = [...rawItems].sort((a, b) => b.y - a.y);
      sortedByY.forEach((item) => {
        const existing = lineGroups.find((g) => Math.abs(g.y - item.y) <= yTolerance);
        if (existing) {
          existing.items.push(item);
        } else {
          lineGroups.push({ y: item.y, items: [item] });
        }
      });

      // Sort each line's items by X position and build row cells
      lineGroups.sort((a, b) => b.y - a.y);
      lineGroups.forEach((group) => {
        const sorted = group.items.sort((a, b) => a.x - b.x);
        // Detect column boundaries: items with X gap > 20px are separate columns
        const cells = [];
        let currentCell = sorted[0] ? sorted[0].text : "";
        let lastX = sorted[0] ? sorted[0].x : 0;
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].x - lastX;
          if (gap > 20) {
            cells.push(currentCell);
            currentCell = sorted[i].text;
          } else {
            currentCell += " " + sorted[i].text;
          }
          lastX = sorted[i].x;
        }
        if (currentCell) cells.push(currentCell);
        if (cells.length >= 2) allRows.push(cells);
      });
    }

    // If no text extracted, it's a scanned PDF — fallback to OCR
    if (allRows.length < 2) {
      await handleScannedPdfOcr(pdf);
      return;
    }

    // Detect header row
    let headerIdx = 0;
    let maxTextCols = 0;
    allRows.slice(0, 5).forEach((row, i) => {
      const textCols = row.filter((c) => isNaN(parseFloat(String(c).replace(",", ".")))).length;
      if (textCols > maxTextCols) { maxTextCols = textCols; headerIdx = i; }
    });

    const headers = allRows[headerIdx].map((h) => String(h || "").trim());
    const rows = allRows.slice(headerIdx + 1).filter((r) => r.length >= 2);

    // Normalize column count
    const maxCols = Math.max(headers.length, ...rows.map((r) => r.length));
    while (headers.length < maxCols) headers.push("Col" + headers.length);
    rows.forEach((r) => { while (r.length < maxCols) r.push(""); });

    // Check for Mapa pattern
    if (detectMapaApuracao(headers)) {
      // Try to find classification table within PDF rows
      // (rows that have "Ordem"/"Licitante"/"Itens" pattern after main data)
      let classTable = null;
      for (let ri = rows.length - 1; ri >= Math.max(0, rows.length - 20); ri--) {
        const rowNorm = rows[ri].map((c) => normalizedText(c));
        const hasOrdemOrLic = rowNorm.some((c) => /ordem|licitante|classificac/.test(c));
        const hasItens = rowNorm.some((c) => /itens|selecion/.test(c));
        if (hasOrdemOrLic && hasItens) {
          // Found classification header row — extract classification table
          classTable = rows.splice(ri);
          break;
        }
      }
      handleMapaApuracao([headers, ...rows], classTable, "PDF");
      return;
    }

    importData = { rows, headers, mapping: autoDetectColumns(headers) };
    showFormatBadge("PDF");
    previewImportData();
  } catch (err) {
    alert("Erro ao ler PDF: " + err.message);
  }
}

// --- Scanned PDF OCR fallback ---
async function handleScannedPdfOcr(pdf) {
  if (typeof Tesseract === "undefined") {
    alert("Tesseract.js nao carregou. Recarregue a pagina para habilitar OCR.");
    return;
  }

  const ocrProgress = document.getElementById("ocr-progress");
  const ocrPct = document.getElementById("ocr-pct");
  const ocrBar = document.getElementById("ocr-bar");
  ocrProgress.style.display = "block";
  el.modalImport.style.display = "flex";

  try {
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round(m.progress * 100);
          ocrPct.textContent = pct + "%";
          ocrBar.value = pct;
        }
      }
    });

    let allText = "";
    const pagesToProcess = Math.min(pdf.numPages, 8);
    for (let p = 1; p <= pagesToProcess; p++) {
      ocrPct.textContent = `Pagina ${p}/${pagesToProcess}...`;
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data: { text } } = await worker.recognize(canvas);
      allText += text + "\n";
    }

    await worker.terminate();
    ocrProgress.style.display = "none";

    const parsed = parseOcrTextToTable(allText);
    if (!parsed) { alert("OCR nao detectou dados tabulares suficientes."); closeImportModal(); return; }

    if (detectMapaApuracao(parsed.headers)) {
      handleMapaApuracao([parsed.headers, ...parsed.rows], null, "PDF (OCR)");
      return;
    }

    importData = { rows: parsed.rows, headers: parsed.headers, mapping: autoDetectColumns(parsed.headers) };
    showFormatBadge("PDF (OCR)");
    previewImportData();
  } catch (err) {
    ocrProgress.style.display = "none";
    alert("Erro no OCR: " + err.message);
  }
}

// --- DOCX Handler (via mammoth.js) ---
async function handleDocxUpload(file) {
  try {
    if (typeof mammoth === "undefined") { alert("mammoth.js nao carregou. Recarregue a pagina."); return; }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result.value, "text/html");
    const tables = [...doc.querySelectorAll("table")];

    if (tables.length === 0) { alert("Documento DOCX nao contem tabelas."); return; }

    // Extract all tables as arrays
    const parsedTables = tables.map((table) => {
      const rows = [...table.querySelectorAll("tr")];
      return rows.map((tr) =>
        [...tr.querySelectorAll("td,th")].map((cell) => cell.textContent.trim())
      );
    });

    // Check if first table is Mapa de Apuracao
    const firstTable = parsedTables[0];
    if (firstTable.length >= 2 && detectMapaApuracao(firstTable[0])) {
      const classTable = parsedTables.length > 1 ? parsedTables[1] : null;
      handleMapaApuracao(firstTable, classTable, "DOCX");
      return;
    }

    // Standard import from first table
    const headers = firstTable[0];
    const rows = firstTable.slice(1).filter((r) => r.some((c) => c));
    importData = { rows, headers, mapping: autoDetectColumns(headers) };
    showFormatBadge("DOCX");
    previewImportData();
  } catch (err) {
    alert("Erro ao ler DOCX: " + err.message);
  }
}

// --- Image OCR Handler (JPEG/PNG via Tesseract.js) ---
async function handleImageOcr(file) {
  if (typeof Tesseract === "undefined") {
    alert("Tesseract.js nao carregou. Recarregue a pagina para habilitar OCR.");
    return;
  }

  const ocrProgress = document.getElementById("ocr-progress");
  const ocrPct = document.getElementById("ocr-pct");
  const ocrBar = document.getElementById("ocr-bar");
  ocrProgress.style.display = "block";
  el.modalImport.style.display = "flex";

  try {
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round(m.progress * 100);
          ocrPct.textContent = pct + "%";
          ocrBar.value = pct;
        }
      }
    });

    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    ocrProgress.style.display = "none";

    const parsed = parseOcrTextToTable(text);
    if (!parsed) { alert("OCR nao detectou dados tabulares suficientes."); closeImportModal(); return; }

    if (detectMapaApuracao(parsed.headers)) {
      handleMapaApuracao([parsed.headers, ...parsed.rows], null, "Imagem (OCR)");
      return;
    }

    importData = { rows: parsed.rows, headers: parsed.headers, mapping: autoDetectColumns(parsed.headers) };
    showFormatBadge("Imagem (OCR)");
    previewImportData();
  } catch (err) {
    ocrProgress.style.display = "none";
    alert("Erro no OCR: " + err.message);
  }
}

// --- Parse OCR raw text into table structure ---
function parseOcrTextToTable(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const rows = lines.map((l) => l.split(/\s{2,}|\t|(?<=\d)\s+(?=[A-Z])|(?<=\w)\s{3,}/).map((c) => c.trim()).filter((c) => c));
  const validRows = rows.filter((r) => r.length >= 2);

  if (validRows.length < 2) return null;

  // Header detection: row with most text columns in first 5 rows
  let headerIdx = 0;
  let maxTextCols = 0;
  validRows.slice(0, 5).forEach((row, i) => {
    const textCols = row.filter((c) => isNaN(parseFloat(String(c).replace(",", ".")))).length;
    if (textCols > maxTextCols) { maxTextCols = textCols; headerIdx = i; }
  });

  const headers = validRows[headerIdx];
  const dataRows = validRows.slice(headerIdx + 1);

  // Normalize column count
  const maxCols = Math.max(headers.length, ...dataRows.map((r) => r.length));
  while (headers.length < maxCols) headers.push("Col" + headers.length);
  dataRows.forEach((r) => { while (r.length < maxCols) r.push(""); });

  return { headers, rows: dataRows };
}

// --- Format badge helper ---
function showFormatBadge(format) {
  const badge = document.getElementById("import-format-badge");
  if (badge) { badge.textContent = format; badge.style.display = "inline-block"; }
}

// --- Mapa de Apuracao Detection ---
function detectMapaApuracao(headerRow) {
  if (!headerRow || headerRow.length < 4) return false;
  const norm = headerRow.map((h) => normalizedText(h));
  // Pattern 1: multiple "Licitante" columns
  const licitanteCount = norm.filter((h) => /licitante|proponente/.test(h)).length;
  if (licitanteCount >= 2) return true;
  // Pattern 2: has Item+Qtde+multiple "Valor" columns
  const hasItem = norm.some((h) => /\bitem\b|\bdescri/.test(h));
  const hasQtde = norm.some((h) => /\bqtd|\bquant/.test(h));
  const valorCount = norm.filter((h) => /^valor$/.test(h.trim())).length;
  if (hasItem && hasQtde && valorCount >= 2) return true;
  // Pattern 3: Has Item+Qtde and more than 4 structural columns (extra cols = licitante prices)
  if (hasItem && hasQtde && headerRow.length >= 6) {
    const structCount = norm.filter((h) => /\bitem\b|\bdescri|\bun\b|\buni|\bqtd|\bquant/.test(h)).length;
    if (headerRow.length - structCount >= 2) return true;
  }
  // Pattern 4: file/title context — "mapa" or "apuracao" in any header
  const hasMapaRef = norm.some((h) => /mapa|apuracao|apuração/.test(h));
  if (hasMapaRef && hasItem) return true;
  return false;
}

// --- Mapa de Apuracao Handler ---
function handleMapaApuracao(priceTableRows, classTableRows, format) {
  // priceTableRows: array of arrays, first row = headers (may include sub-header row)
  // classTableRows: array of arrays from Table 2 (classification), or null

  let headers = priceTableRows[0];
  let dataStartIdx = 1;

  // Some maps have a sub-header row (e.g., "Item | Descricao | Un | Qtde | Valor | Valor | Valor")
  // If row[1] looks like a sub-header (all text, no numbers), skip it
  if (priceTableRows.length > 2) {
    const row1 = priceTableRows[1];
    const allText = row1.every((c) => isNaN(parseFloat(String(c).replace(",", "."))));
    if (allText && row1.some((c) => /valor|item|descri/i.test(c))) {
      dataStartIdx = 2;
    }
  }

  const dataRows = priceTableRows.slice(dataStartIdx).filter((r) => r.some((c) => c && String(c).trim()));

  // Identify structural columns
  const normHeaders = headers.map((h) => normalizedText(h));
  let itemCol = normHeaders.findIndex((h) => /^\s*item\s*$/.test(h)); // numeric item number
  let descCol = normHeaders.findIndex((h) => /descri|produto|material/.test(h));
  let unCol = normHeaders.findIndex((h) => /\bun\b|\buni\b|\bunid/.test(h));
  let qtdCol = normHeaders.findIndex((h) => /\bqtd|\bquant/.test(h));

  // If item col is the numeric index and desc is separate, use desc as the name
  // If no desc column, use item column as name
  const nameCol = descCol >= 0 ? descCol : itemCol;

  // Identify licitante columns (all columns that are NOT structural)
  const structCols = new Set([itemCol, descCol, unCol, qtdCol].filter((c) => c >= 0));
  const licitantes = [];
  headers.forEach((h, i) => {
    if (!structCols.has(i) && h && String(h).trim()) {
      // Extract licitante name from header (may contain line breaks / "Licitante 1\nNome")
      let name = String(h).trim().replace(/^licitante\s*\d+\s*/i, "").trim();
      if (!name) name = String(h).trim();
      // Skip sub-labels like "Valor"
      if (/^valor$/i.test(name)) name = "Licitante " + (licitantes.length + 1);
      licitantes.push({ colIdx: i, name });
    }
  });

  // Auto-detect my company from config (nome, nomeFantasia, razaoSocial, CNPJ)
  const empresa = JSON.parse(localStorage.getItem(EMPRESA_STORAGE_KEY) || "{}");
  const searchNames = [empresa.nome, empresa.nomeFantasia, empresa.razaoSocial, empresa.cnpj]
    .filter(Boolean).map((n) => normalizedText(n)).filter((n) => n.length > 2);
  let myCompanyIdx = -1;
  if (searchNames.length > 0) {
    myCompanyIdx = licitantes.findIndex((l) => {
      const ln = normalizedText(l.name);
      return searchNames.some((myName) =>
        ln.includes(myName) || myName.includes(ln) ||
        ln.split(/\s+/).some((w) => w.length > 3 && myName.includes(w)) ||
        myName.split(/\s+/).some((w) => w.length > 3 && ln.includes(w))
      );
    });
  }

  // If auto-detection failed and we have licitantes, prompt user to choose
  if (myCompanyIdx < 0 && licitantes.length > 0) {
    const sel = prompt(
      "Empresa nao detectada automaticamente.\nQual licitante e a sua empresa?\n\n" +
      licitantes.map((l, i) => `${i + 1}. ${l.name}`).join("\n") +
      "\n\nDigite o numero (ou 0 para nenhum):"
    );
    const idx = parseInt(sel, 10) - 1;
    if (idx >= 0 && idx < licitantes.length) {
      myCompanyIdx = idx;
    }
  }

  // Parse classification table (Table 2) to find won items
  let wonItemNumbers = new Set();
  let classificationData = [];
  if (classTableRows && classTableRows.length > 1) {
    const classHeaders = classTableRows[0].map((h) => normalizedText(h));
    const itensSelCol = classHeaders.findIndex((h) => /itens|selecion/.test(h));
    // Prioritize "licitante/empresa/fornecedor" over "ordem"
    let licitanteCol = classHeaders.findIndex((h) => /licitante|empresa|fornecedor/.test(h));
    if (licitanteCol < 0) licitanteCol = classHeaders.findIndex((h) => /ordem/.test(h));
    const nameClassCol = licitanteCol >= 0 ? licitanteCol : 1;

    classTableRows.slice(1).forEach((row) => {
      if (!row || row.every((c) => !c || !String(c).trim())) return;
      const rowName = String(row[nameClassCol] || "").trim();
      const rowItems = itensSelCol >= 0 ? String(row[itensSelCol] || "") : "";
      const itemNums = rowItems.match(/\d+/g);
      classificationData.push({ nome: rowName, itens: itemNums ? itemNums.map(Number) : [] });

      // Match against: my licitante name from price table, searchNames from config,
      // AND cross-reference licitante names from price table headers
      const rowNorm = normalizedText(rowName);
      let isMe = false;

      if (myCompanyIdx >= 0) {
        const myLicName = normalizedText(licitantes[myCompanyIdx].name);
        // Direct match: classification row name matches my licitante column header name
        isMe = rowNorm.includes(myLicName) || myLicName.includes(rowNorm) ||
          myLicName.split(/\s+/).some((w) => w.length > 3 && rowNorm.includes(w)) ||
          rowNorm.split(/\s+/).some((w) => w.length > 3 && myLicName.includes(w));
      }

      // Also try matching via empresa searchNames
      if (!isMe && searchNames.length > 0) {
        isMe = searchNames.some((sn) =>
          rowNorm.includes(sn) || sn.includes(rowNorm) ||
          sn.split(/\s+/).some((w) => w.length > 3 && rowNorm.includes(w)) ||
          rowNorm.split(/\s+/).some((w) => w.length > 3 && sn.includes(w))
        );
      }

      if (isMe && itemNums) {
        itemNums.forEach((n) => wonItemNumbers.add(Number(n)));
      }
    });

    // Cross-reference: if myCompanyIdx is set but no won items found from classification,
    // try matching licitante column header name against classification names word by word
    if (wonItemNumbers.size === 0 && myCompanyIdx >= 0) {
      const myLicName = normalizedText(licitantes[myCompanyIdx].name);
      const myWords = myLicName.split(/\s+/).filter((w) => w.length > 2);
      classificationData.forEach((c) => {
        const cNorm = normalizedText(c.nome);
        const cWords = cNorm.split(/\s+/).filter((w) => w.length > 2);
        // Match if at least 2 words overlap, or any word > 4 chars matches
        const overlap = myWords.filter((w) => cWords.some((cw) => cw.includes(w) || w.includes(cw)));
        if (overlap.length >= 2 || overlap.some((w) => w.length > 4)) {
          c.itens.forEach((n) => wonItemNumbers.add(n));
        }
      });
    }
  }

  // Store enriched import data
  importData = {
    rows: dataRows,
    headers,
    mapping: autoDetectColumns(headers),
    isMapa: true,
    licitantes,
    myCompanyIdx,
    wonItems: wonItemNumbers,
    classificationData,
    nameCol,
    itemCol,
    descCol,
    unCol,
    qtdCol,
    valoresTotal: true, // Mapa values are typically totals
  };

  showFormatBadge("Mapa de Apuracao (" + format + ")");
  previewMapaApuracao();
}

// --- Mapa Preview ---
function previewMapaApuracao() {
  const { rows, headers, licitantes, myCompanyIdx, wonItems, classificationData,
    nameCol, itemCol, qtdCol, unCol } = importData;

  el.importFilename.textContent = el.importFileInput.files[0]
    ? el.importFileInput.files[0].name : "";

  // Show mapa panel
  const mapaPanel = document.getElementById("mapa-apuracao-panel");
  mapaPanel.style.display = "block";

  // Show detected company
  const empresaEl = document.getElementById("mapa-empresa-detectada");
  if (myCompanyIdx >= 0) {
    const wonCount = wonItems.size;
    empresaEl.textContent = licitantes[myCompanyIdx].name +
      (wonCount > 0 ? ` (${wonCount} itens ganhos)` : " (classificacao nao encontrada — importa todos)");
    empresaEl.style.color = "var(--accent)";
  } else {
    empresaEl.textContent = "Nao detectada — clique Alterar";
    empresaEl.style.color = "#f59e0b";
  }

  // Show classification
  const classEl = document.getElementById("mapa-classificacao");
  if (classificationData.length > 0) {
    classEl.innerHTML = "<strong>Classificacao:</strong><br>" +
      classificationData.map((c) => {
        let isMe = false;
        if (myCompanyIdx >= 0) {
          const myLicName = normalizedText(licitantes[myCompanyIdx].name);
          const cNorm = normalizedText(c.nome);
          isMe = cNorm.includes(myLicName) || myLicName.includes(cNorm) ||
            myLicName.split(/\s+/).some((w) => w.length > 3 && cNorm.includes(w)) ||
            cNorm.split(/\s+/).some((w) => w.length > 3 && myLicName.includes(w));
        }
        return `<span style="color:${isMe ? "var(--accent)" : "var(--muted)"}">${isMe ? "★ " : ""}${escapeHtml(c.nome)}: itens ${c.itens.join(", ")}</span>`;
      }).join("<br>");
  } else {
    classEl.innerHTML = '<span style="color:var(--muted)">Tabela de classificacao nao encontrada. Todos os itens serao importados.</span>';
  }

  // Show total toggle (checked by default for Mapa)
  const toggleDiv = document.getElementById("import-total-toggle");
  toggleDiv.style.display = "block";
  const chk = document.getElementById("chk-valores-totais");
  chk.checked = true;

  // Hide standard column mapping for Mapa (we auto-detect)
  el.importMapping.innerHTML = `<p style="font-size:0.78rem;color:var(--muted);">
    ${licitantes.length} licitantes detectados: ${licitantes.map((l) => escapeHtml(l.name)).join(", ")}
  </p>`;

  // Legend
  const legendHtml = `<div class="mapa-legend">
    <span class="leg-won">Itens ganhos (seu preco)</span>
    <span class="leg-lost">Concorrentes</span>
  </div>`;

  // Preview table with all rows
  const previewRows = rows.slice(0, 15);
  const thCols = [];
  if (itemCol >= 0) thCols.push({ idx: itemCol, label: "#" });
  if (nameCol >= 0) thCols.push({ idx: nameCol, label: "Produto" });
  if (unCol >= 0) thCols.push({ idx: unCol, label: "Un" });
  if (qtdCol >= 0) thCols.push({ idx: qtdCol, label: "Qtde" });
  licitantes.forEach((l, li) => {
    thCols.push({ idx: l.colIdx, label: escapeHtml(l.name), isLic: true, licIdx: li });
  });

  el.theadImportPreview.innerHTML = "<tr>" + thCols.map((c) => {
    const cls = c.isLic && c.licIdx === myCompanyIdx ? ' style="color:var(--accent);font-weight:700;"' : "";
    return `<th${cls}>${c.label}</th>`;
  }).join("") + "</tr>";

  el.tbodyImportPreview.innerHTML = legendHtml + previewRows.map((row) => {
    const itemNum = itemCol >= 0 ? parseInt(String(row[itemCol]), 10) : 0;
    const isWon = wonItems.size > 0 ? wonItems.has(itemNum) : false;
    const rowClass = isWon ? "mapa-won-row" : "mapa-competitor-row";

    return `<tr class="${rowClass}">` + thCols.map((c) => {
      let val = escapeHtml(row[c.idx] != null ? row[c.idx] : "");
      if (c.isLic && c.licIdx === myCompanyIdx) val = `<span class="mapa-my-price">${val}</span>`;
      else if (c.isLic) val = `<span class="mapa-competitor-price">${val}</span>`;
      return `<td>${val}</td>`;
    }).join("") + "</tr>";
  }).join("");

  if (rows.length > 15) {
    el.tbodyImportPreview.innerHTML += `<tr><td colspan="${thCols.length}" style="text-align:center;color:var(--muted);font-size:0.78rem;">... +${rows.length - 15} itens</td></tr>`;
  }

  el.importStats.style.display = "none";
  el.modalImport.style.display = "flex";

  // Wire alterar empresa button
  const btnAlterar = document.getElementById("btn-mapa-alterar-empresa");
  btnAlterar.onclick = () => {
    const sel = prompt("Qual licitante e a sua empresa?\n\n" +
      licitantes.map((l, i) => `${i + 1}. ${l.name}`).join("\n") +
      "\n\nDigite o numero:");
    const idx = parseInt(sel, 10) - 1;
    if (idx >= 0 && idx < licitantes.length) {
      importData.myCompanyIdx = idx;
      // Re-parse won items for the new company
      if (classificationData.length > 0) {
        const newWon = new Set();
        classificationData.forEach((c) => {
          const cNorm = normalizedText(c.nome);
          const lNorm = normalizedText(licitantes[idx].name);
          if (lNorm.split(/\s+/).some((w) => w.length > 3 && cNorm.includes(w))) {
            c.itens.forEach((n) => newWon.add(n));
          }
        });
        importData.wonItems = newWon;
      }
      previewMapaApuracao();
    }
  };
}

// --- Auto-detect column mapping ---
function autoDetectColumns(headers) {
  const mapping = { item: -1, preco: -1, unidade: -1, fornecedor: -1, quantidade: -1 };
  const norms = headers.map((h) => normalizedText(h));

  norms.forEach((h, i) => {
    if (mapping.item < 0 && /\b(item|produto|descricao|material|nome|mercadoria)\b/.test(h)) mapping.item = i;
    if (mapping.preco < 0 && /\b(preco|valor|custo|unitario|unit|preco\s*unit|vlr)\b/.test(h)) mapping.preco = i;
    if (mapping.unidade < 0 && /\b(unidade|un\b|und|medida|embalagem|emb)\b/.test(h)) mapping.unidade = i;
    if (mapping.fornecedor < 0 && /\b(fornecedor|fonte|marca|empresa|fabricante)\b/.test(h)) mapping.fornecedor = i;
    if (mapping.quantidade < 0 && /\b(qtd|qtde|quant|quantidade)\b/.test(h)) mapping.quantidade = i;
  });

  if (mapping.item < 0 && headers.length >= 2) {
    for (let i = 0; i < headers.length; i++) {
      if (mapping.preco !== i && mapping.unidade !== i && mapping.fornecedor !== i) {
        mapping.item = i; break;
      }
    }
  }

  if (mapping.preco < 0 && headers.length >= 2) {
    for (let i = headers.length - 1; i >= 0; i--) {
      if (mapping.item !== i && /\d|r\$|valor|preco/.test(norms[i])) {
        mapping.preco = i; break;
      }
    }
  }

  return mapping;
}

// --- Standard preview (non-Mapa) ---
function previewImportData() {
  const { rows, headers, mapping } = importData;

  el.importFilename.textContent = el.importFileInput.files[0]
    ? el.importFileInput.files[0].name : "";

  // Hide mapa-specific UI
  document.getElementById("mapa-apuracao-panel").style.display = "none";

  // Show total toggle if we have a quantity column
  const toggleDiv = document.getElementById("import-total-toggle");
  toggleDiv.style.display = mapping.quantidade >= 0 ? "block" : "none";
  const chk = document.getElementById("chk-valores-totais");
  chk.checked = false;

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

  el.importMapping.querySelectorAll("select").forEach((s) => {
    s.addEventListener("change", () => {
      importData.mapping[s.dataset.map] = parseInt(s.value, 10);
    });
  });

  const previewRows = rows.slice(0, 5);
  el.theadImportPreview.innerHTML = "<tr>" + headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("") + "</tr>";
  el.tbodyImportPreview.innerHTML = previewRows.map((row) =>
    "<tr>" + headers.map((_, i) => `<td>${escapeHtml(row[i] != null ? row[i] : "")}</td>`).join("") + "</tr>"
  ).join("");

  el.importStats.style.display = "none";
  el.modalImport.style.display = "flex";
}

// --- Close modal ---
function closeImportModal() {
  el.modalImport.style.display = "none";
  document.getElementById("mapa-apuracao-panel").style.display = "none";
  document.getElementById("import-total-toggle").style.display = "none";
  document.getElementById("ocr-progress").style.display = "none";
  document.getElementById("import-format-badge").style.display = "none";
  importData = { rows: [], headers: [], mapping: {} };
}

// --- Parse price from string ---
function parsePriceValue(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return 0;
  // Handle "1.234,56" format (Brazilian) — remove dots, replace comma with dot
  const hasDotAndComma = s.includes(".") && s.includes(",");
  if (hasDotAndComma) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  // Handle "1234,56" (comma as decimal)
  if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

// --- Merge into Banco de Precos ---
function mergeImportIntoBanco() {
  if (importData.isMapa) {
    mergeMapaIntoBanco();
    return;
  }

  const { rows, mapping } = importData;
  if (mapping.item < 0) { alert("Selecione a coluna de Item / Produto."); return; }

  const valoresTotal = document.getElementById("chk-valores-totais")?.checked || false;
  let updated = 0, added = 0, converted = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  rows.forEach((row) => {
    const itemName = String(row[mapping.item] || "").trim();
    if (!itemName || itemName.length < 2) return;
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(itemName)) return;

    let preco = mapping.preco >= 0 ? parsePriceValue(row[mapping.preco]) : 0;
    const unidadeRaw = mapping.unidade >= 0 ? String(row[mapping.unidade] || "").trim() : "";
    const fornecedor = mapping.fornecedor >= 0 ? String(row[mapping.fornecedor] || "").trim() : "";

    // If values are totals, divide by quantity
    if (valoresTotal && mapping.quantidade >= 0 && preco > 0) {
      const qtd = parseFloat(String(row[mapping.quantidade]).replace(/[^\d]/g, "")) || 1;
      if (qtd > 0) preco = Math.round((preco / qtd) * 100) / 100;
    }

    // Unit conversion intelligence
    const conv = parseUnitConversion(unidadeRaw, preco);
    if (conv.convertido) converted++;
    const unidade = conv.unidade;
    preco = conv.preco;

    const normName = normalizedText(itemName);
    const existing = bancoPrecos.itens.find((bp) => normalizedText(bp.item) === normName);

    if (existing) {
      if (preco > 0) existing.custoBase = preco;
      if (unidade) existing.unidade = unidade;
      if (fornecedor) existing.fonte = fornecedor;
      existing.precoReferencia = Math.round(existing.custoBase * (1 + existing.margemPadrao) * 100) / 100;
      existing.ultimaCotacao = todayStr;
      if (preco > 0 && fornecedor) {
        if (!existing.custosFornecedor) existing.custosFornecedor = [];
        existing.custosFornecedor.push({ fornecedor, preco, data: todayStr });
      }
      updated++;
    } else {
      const margemPadrao = 0.30;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      bancoPrecos.itens.push({
        id: newId, item: itemName, grupo: "Importado", unidade: unidade || "Unidade",
        custoBase: preco, margemPadrao, precoReferencia: Math.round(preco * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr, fonte: fornecedor, propostas: [], concorrentes: [],
        custosFornecedor: fornecedor && preco > 0 ? [{ fornecedor, preco, data: todayStr }] : [],
      });
      added++;
    }
  });

  saveBancoLocal(); renderBanco();
  let msg = `${updated} atualizados, ${added} novos.`;
  if (converted > 0) msg += ` ${converted} convertidos (caixa/fardo → unidade).`;
  el.importStats.innerHTML = msg; el.importStats.style.display = "block";
  setTimeout(() => { closeImportModal(); }, 3000);
}

// --- Merge Mapa de Apuracao into Banco ---
function mergeMapaIntoBanco() {
  const { rows, licitantes, myCompanyIdx, wonItems, nameCol, itemCol, qtdCol, unCol } = importData;
  const valoresTotal = document.getElementById("chk-valores-totais")?.checked || importData.valoresTotal;
  const todayStr = new Date().toISOString().slice(0, 10);

  let added = 0, updated = 0, concorrentesAdded = 0;
  const importAll = wonItems.size === 0; // If no classification, import all

  rows.forEach((row) => {
    const itemNum = itemCol >= 0 ? parseInt(String(row[itemCol]), 10) : 0;
    const itemName = nameCol >= 0 ? String(row[nameCol] || "").trim() : "";
    if (!itemName || itemName.length < 2) return;
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(itemName)) return;

    const unidade = unCol >= 0 ? String(row[unCol] || "").trim() : "Unidade";
    const qtd = qtdCol >= 0 ? (parseFloat(String(row[qtdCol]).replace(/[^\d]/g, "")) || 1) : 1;
    const isWon = importAll || wonItems.has(itemNum);

    // Get my price (from my company's column)
    let myPrice = 0;
    if (myCompanyIdx >= 0) {
      const rawPrice = parsePriceValue(row[licitantes[myCompanyIdx].colIdx]);
      myPrice = valoresTotal && qtd > 0 ? Math.round((rawPrice / qtd) * 100) / 100 : rawPrice;
    }

    // Collect ALL licitante prices (for concorrentes)
    const allPrices = licitantes.map((l, li) => {
      const raw = parsePriceValue(row[l.colIdx]);
      const unit = valoresTotal && qtd > 0 && raw > 0 ? Math.round((raw / qtd) * 100) / 100 : raw;
      return { nome: l.name, preco: unit, isMe: li === myCompanyIdx };
    }).filter((p) => p.preco > 0);

    const normName = normalizedText(itemName);
    const existing = bancoPrecos.itens.find((bp) => normalizedText(bp.item) === normName);

    if (existing) {
      // Update with my price if won
      if (isWon && myPrice > 0) {
        existing.custoBase = myPrice;
        existing.precoReferencia = Math.round(myPrice * (1 + existing.margemPadrao) * 100) / 100;
        existing.ultimaCotacao = todayStr;
      }
      // Add competitor prices
      if (!existing.concorrentes) existing.concorrentes = [];
      allPrices.forEach((p) => {
        if (!p.isMe && p.preco > 0) {
          existing.concorrentes.push({ nome: p.nome, preco: p.preco, data: todayStr, edital: "Mapa Import" });
          concorrentesAdded++;
        }
      });
      updated++;
    } else if (isWon || importAll) {
      // Create new item
      const margemPadrao = 0.30;
      const custoBase = myPrice || 0;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      const competitorPrices = allPrices.filter((p) => !p.isMe && p.preco > 0)
        .map((p) => ({ nome: p.nome, preco: p.preco, data: todayStr, edital: "Mapa Import" }));
      concorrentesAdded += competitorPrices.length;

      bancoPrecos.itens.push({
        id: newId, item: itemName, grupo: "Mapa Apuracao", unidade: unidade || "Unidade",
        custoBase, margemPadrao, precoReferencia: Math.round(custoBase * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr, fonte: "Mapa de Apuracao",
        propostas: [], concorrentes: competitorPrices,
        custosFornecedor: myPrice > 0 ? [{ fornecedor: "Meu preco (mapa)", preco: myPrice, data: todayStr }] : [],
      });
      added++;
    }
  });

  saveBancoLocal(); renderBanco();

  const wonCount = wonItems.size || rows.length;
  let msg = `Mapa importado! ${added} novos, ${updated} atualizados.`;
  if (wonItems.size > 0) msg += ` ${wonItems.size} itens ganhos.`;
  msg += ` ${concorrentesAdded} precos de concorrentes registrados.`;
  el.importStats.innerHTML = msg; el.importStats.style.display = "block";
  setTimeout(() => { closeImportModal(); }, 4000);
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

// F1: Monta observação SGD incluindo marca quando disponível
function buildObservacaoSgd(item) {
  const marca = (item.marca || "").trim();
  const obs = (item.observacao || item.descricao || item.nome || "Conforme especificado").trim();
  if (marca) {
    if (obs.toLowerCase().includes(marca.toLowerCase())) return obs;
    return `[Marca: ${marca}] ${obs}`;
  }
  return obs;
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
        marca: i.marca || "",
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        precoTotal: i.precoTotal,
        observacao: buildObservacaoSgd(i),
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
  saveSgdFieldsToPreOrcamento(pre);
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
  const ganhos = allPre.filter((p) => p.status === "ganho");
  const perdidos = allPre.filter((p) => p.status === "perdido");
  const sgdItems = [...ready, ...sent, ...ganhos, ...perdidos];

  // KPIs
  el.sgdKpiProntos.textContent = ready.length;
  el.sgdKpiEnviados.textContent = sent.length;
  if (el.sgdKpiGanhos) el.sgdKpiGanhos.textContent = ganhos.length;
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
  const statusOrder = { aprovado: 0, enviado: 1, ganho: 2, perdido: 3 };
  el.tbodySgd.innerHTML = sgdItems
    .sort((a, b) => (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9))
    .map((p) => {
      const badgeMap = {
        aprovado: { cls: "badge-aprovado", label: "Pronto" },
        enviado: { cls: "badge-enviado", label: "Enviado" },
        ganho: { cls: "badge-ok", label: "Ganho" },
        perdido: { cls: "badge-vencido", label: "Perdido" },
      };
      const badge = badgeMap[p.status] || { cls: "badge-muted", label: p.status };
      const dateInfo = p.enviadoEm ? formatDate(p.enviadoEm) : formatDate(p.aprovadoEm);

      let actions = "";
      if (p.status === "aprovado") {
        actions = `<button class="btn btn-inline btn-sgd" onclick="sgdEnviarUnico('${p.orcamentoId}')">Enviar</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else if (p.status === "enviado") {
        actions = `<button class="btn btn-inline btn-accent" onclick="abrirModalResultado('${p.orcamentoId}')">Resultado</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else {
        actions = `<button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      }

      return `<tr>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td>${escapeHtml(p.municipio)}</td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td><span class="badge ${badge.cls}">${badge.label}</span> <span class="text-muted" style="font-size:0.72rem">${dateInfo}</span></td>
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

    const p = { nuValueByItem: item.precoUnitario, idBudgetItem, txItemObservation: buildObservacaoSgd(item) };
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
      const sreSchoolsList = [];
      const schoolToMunicipio = {};
      if (sreData && sreData.municipios) {
        sreData.municipios.forEach((m) => {
          (m.escolas || []).forEach((e) => {
            const n = sreNorm(e);
            sreSchoolsList.push(n);
            schoolToMunicipio[n] = m.nome;
          });
        });
      }

      // Confirmed SRE Uberaba municipality IDs (SGD API idCounty field)
      // Discovered by cross-referencing unique school names from sre-uberaba.json
      const sreCountyMap = {
        2623: "Uberaba", 2857: "Uberaba",
        2568: "Araxa", 2494: "Sacramento", 2158: "Iturama",
        2805: "Pirajuba", 2480: "Santa Juliana", 2631: "Frutal",
        2422: "Campos Altos",
      };
      const sreCountyIds = new Set(Object.keys(sreCountyMap).map(Number));

      // Word-boundary checking to prevent partial matches (e.g., "EE BRASIL" must NOT match "EE BRASILIANO BRAZ")
      function containsWholeMatch(haystack, needle) {
        const idx = haystack.indexOf(needle);
        if (idx === -1) return false;
        const endIdx = idx + needle.length;
        if (endIdx < haystack.length && /[A-Z0-9]/.test(haystack[endIdx])) return false;
        if (idx > 0 && /[A-Z0-9]/.test(haystack[idx - 1])) return false;
        return true;
      }

      function findSreMatch(sgdSchoolName) {
        const norm = sreNorm(sgdSchoolName);
        if (sreSchoolsList.includes(norm)) return norm;
        for (const sre of sreSchoolsList) {
          if (containsWholeMatch(norm, sre)) return sre;
        }
        for (const sre of sreSchoolsList) {
          const expanded = sre.replace(/^EE\s+/, "ESCOLA ESTADUAL ");
          if (containsWholeMatch(norm, expanded)) return sre;
        }
        const sgdCore = norm
          .replace(/^CAIXA ESCOLAR\s*(DA|DE|DO)?\s*/i, "")
          .replace(/^ASSOCIACAO\s*(DA|DE|DO)?\s*/i, "")
          .replace(/^CE\s+/, "")
          .trim();
        if (sgdCore && sreSchoolsList.includes(sgdCore)) return sgdCore;
        return null;
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

      // Step 2: County-first filter — ACCEPT all budgets from known SRE Uberaba municipalities
      // This guarantees we never miss a school just because the name format differs
      const matched = [];
      const rejected = [];
      const filtered = [];

      allBudgets.forEach((b) => {
        const escola = b.schoolName || b.txSchoolName || "";
        const county = b.idCounty;

        if (sreCountyIds.has(county)) {
          // PRIMARY: County is confirmed SRE Uberaba — ALWAYS accept regardless of name
          const nameMatch = findSreMatch(escola);
          b._sreMatch = nameMatch || sreNorm(escola);
          filtered.push(b);
          matched.push({ sgd: escola, county, mun: nameMatch ? schoolToMunicipio[nameMatch] || "?" : "?", via: nameMatch ? "county+name" : "county-only" });
        } else {
          // FALLBACK: Unknown county — only accept via strict name match (for municipalities not yet in whitelist)
          const nameMatch = findSreMatch(escola);
          if (nameMatch) {
            // Name matched but county not in whitelist — likely false positive, reject
            rejected.push({ sgd: escola, sre: nameMatch, county, reason: "name match but county not SRE Uberaba" });
          }
        }
      });

      // Debug logs
      console.log(`[Varrer] ${matched.length} aceitos:`, matched);
      if (rejected.length > 0) {
        console.log(`[Varrer] ${rejected.length} rejeitados (nome bateu mas county errado):`, rejected);
      }
      // Log unique counties found in accepted budgets for verification
      const acceptedCounties = {};
      matched.forEach((m) => { acceptedCounties[m.county] = (acceptedCounties[m.county] || 0) + 1; });
      console.log(`[Varrer] Counties aceitos:`, acceptedCounties);
      console.log(`[Varrer] SRE Uberaba: ${filtered.length} aceitos de ${allBudgets.length} total`);
      btn.innerHTML = `<span class="sgd-spinner"></span>SRE Uberaba: ${filtered.length} de ${allBudgets.length}. Buscando detalhes...`;

      // Step 3: Fetch detail + items for each SRE budget
      // Replace orcamentos entirely with fresh scan data (discard stale entries)
      const scanResults = [];
      let novos = 0;

      for (let i = 0; i < filtered.length; i++) {
        const b = filtered[i];
        const id = String(b.idBudget || b.id || "");
        if (!id) continue;

        const escolaRaw = b.schoolName || b.txSchoolName || "";
        const sreMatchKey = b._sreMatch || findSreMatch(escolaRaw) || sreNorm(escolaRaw);
        const municipio = schoolToMunicipio[sreMatchKey] || sreCountyMap[b.idCounty] || "";

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
          objeto: (detail.initiativeDescription || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
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

        scanResults.push(orc);
        novos++;

        if ((i + 1) % 5 === 0 || i === filtered.length - 1) {
          btn.innerHTML = `<span class="sgd-spinner"></span>Detalhando ${i + 1}/${filtered.length}...`;
        }
      }

      // Replace orcamentos with fresh scan data
      orcamentos = scanResults;
      localStorage.setItem("caixaescolar.orcamentos", JSON.stringify(orcamentos));
      showToast(`SRE Uberaba: ${novos} orçamento(s) carregados de ${allBudgets.length} total SGD.`);
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

// ===== SGD FIELDS SAVE =====
function saveSgdFieldsToPreOrcamento(pre) {
  const dtGoodsEl = document.getElementById("sgd-dt-goods");
  const dtServiceEl = document.getElementById("sgd-dt-service");
  if (dtGoodsEl && dtGoodsEl.value) pre.dtGoodsDelivery = dtGoodsEl.value + "T00:00:00.000Z";
  if (dtServiceEl && dtServiceEl.value) pre.dtServiceDelivery = dtServiceEl.value + "T00:00:00.000Z";

  pre.itens.forEach((item, idx) => {
    const obsEl = document.getElementById(`sgd-obs-${idx}`);
    const garEl = document.getElementById(`sgd-garantia-${idx}`);
    if (obsEl) item.observacao = obsEl.value;
    if (garEl) item.garantia = garEl.value;
  });
}

// ===== SGD FIELDS RENDERING =====
function renderSgdFields() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  const container = document.getElementById("sgd-extra-fields");
  if (!container) return;

  const orc = orcamentos.find((o) => o.id === pre.orcamentoId);
  const defaultDate = orc && orc.prazoEntrega ? orc.prazoEntrega : new Date().toISOString().slice(0, 10);
  const isEditable = pre.status === "pendente" || pre.status === "aprovado";

  // Date fields
  const dtGoods = pre.dtGoodsDelivery ? pre.dtGoodsDelivery.slice(0, 10) : defaultDate;
  const dtService = pre.dtServiceDelivery ? pre.dtServiceDelivery.slice(0, 10) : defaultDate;

  let html = `
    <div class="sgd-fields-header"><h3>Dados para envio ao SGD</h3></div>
    <div class="sgd-dates-grid">
      <label>
        Prazo Entrega Bens
        <input type="date" id="sgd-dt-goods" value="${dtGoods}" ${isEditable ? "" : "disabled"} />
      </label>
      <label>
        Prazo Entrega/Execução
        <input type="date" id="sgd-dt-service" value="${dtService}" ${isEditable ? "" : "disabled"} />
      </label>
    </div>
    <div class="sgd-items-fields">
  `;

  pre.itens.forEach((item, idx) => {
    const obs = buildObservacaoSgd(item);
    const gar = item.garantia || "Garantia de 12 meses conforme CDC";
    html += `
      <div class="sgd-item-field">
        <strong>${escapeHtml(item.nome)}</strong>
        <label>
          Observação
          <textarea id="sgd-obs-${idx}" rows="2" ${isEditable ? "" : "disabled"}>${escapeHtml(obs)}</textarea>
        </label>
        <label>
          Garantia Ofertada
          <textarea id="sgd-garantia-${idx}" rows="1" ${isEditable ? "" : "disabled"}>${escapeHtml(gar)}</textarea>
        </label>
      </div>
    `;
  });

  html += "</div>";
  container.innerHTML = html;

  // Bind auto-save on every field change so edits are never lost
  if (isEditable) {
    const autoSave = () => {
      saveSgdFieldsToPreOrcamento(pre);
      savePreOrcamentos();
    };
    const dtGoodsEl = document.getElementById("sgd-dt-goods");
    const dtServiceEl = document.getElementById("sgd-dt-service");
    if (dtGoodsEl) dtGoodsEl.addEventListener("change", autoSave);
    if (dtServiceEl) dtServiceEl.addEventListener("change", autoSave);
    pre.itens.forEach((_, idx) => {
      const obsEl = document.getElementById(`sgd-obs-${idx}`);
      const garEl = document.getElementById(`sgd-garantia-${idx}`);
      if (obsEl) obsEl.addEventListener("input", autoSave);
      if (garEl) garEl.addEventListener("input", autoSave);
    });
  }
}

// ===== F2: REGISTRO DE RESULTADOS SGD =====
let currentResultadoOrcamentoId = null;
let selectedResultado = null;

window.abrirModalResultado = function (orcId) {
  currentResultadoOrcamentoId = orcId;
  selectedResultado = null;
  const pre = preOrcamentos[orcId];
  if (!pre) return;

  document.getElementById("res-escola-info").textContent = `${pre.escola} — ${pre.municipio} — ${brl.format(pre.totalGeral || 0)}`;
  document.getElementById("res-data").value = new Date().toISOString().slice(0, 10);
  document.getElementById("res-observacoes").value = "";
  document.getElementById("res-valor-vencedor").value = "";
  document.getElementById("res-fornecedor-vencedor").value = "";
  document.getElementById("campos-perda").style.display = "none";
  document.getElementById("campos-ganho").style.display = "none";
  document.getElementById("btn-salvar-resultado").style.display = "none";
  document.getElementById("btn-res-ganho").classList.remove("active");
  document.getElementById("btn-res-perdido").classList.remove("active");
  document.getElementById("modal-resultado").style.display = "flex";
};

window.selectResultado = function (tipo) {
  selectedResultado = tipo;
  document.getElementById("campos-perda").style.display = tipo === "perdido" ? "block" : "none";
  document.getElementById("campos-ganho").style.display = tipo === "ganho" ? "block" : "none";
  document.getElementById("btn-salvar-resultado").style.display = "inline-block";
  document.getElementById("btn-res-ganho").style.opacity = tipo === "ganho" ? "1" : "0.4";
  document.getElementById("btn-res-perdido").style.opacity = tipo === "perdido" ? "1" : "0.4";
};

window.fecharModalResultado = function () {
  document.getElementById("modal-resultado").style.display = "none";
  currentResultadoOrcamentoId = null;
  selectedResultado = null;
};

window.salvarResultado = function () {
  if (!currentResultadoOrcamentoId || !selectedResultado) return;
  const pre = preOrcamentos[currentResultadoOrcamentoId];
  if (!pre) return;

  const resultado = {
    id: "res-" + Date.now(),
    orcamentoId: currentResultadoOrcamentoId,
    escola: pre.escola,
    municipio: pre.municipio,
    grupo: pre.grupo || "Geral",
    resultado: selectedResultado,
    dataResultado: document.getElementById("res-data").value,
    valorProposto: pre.totalGeral,
    valorVencedor: parseFloat(document.getElementById("res-valor-vencedor").value) || null,
    fornecedorVencedor: document.getElementById("res-fornecedor-vencedor").value || null,
    motivoPerda: selectedResultado === "perdido" ? document.getElementById("res-motivo").value : null,
    observacoes: document.getElementById("res-observacoes").value,
    itens: pre.itens.map(item => ({
      nome: item.nome, marca: item.marca, precoUnitario: item.precoUnitario,
      precoVencedor: null, delta: null, ganhou: selectedResultado === "ganho",
    })),
    contrato: { gerado: false, contratoId: null },
  };

  // Delta se perdeu
  if (resultado.resultado === "perdido" && resultado.valorVencedor) {
    resultado.deltaTotalPercent = parseFloat(((resultado.valorProposto - resultado.valorVencedor) / resultado.valorVencedor * 100).toFixed(1));
  }

  // Salvar resultado
  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  resultados.push(resultado);
  localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));

  // Atualizar status do pré-orçamento
  pre.status = selectedResultado === "ganho" ? "ganho" : "perdido";
  savePreOrcamentos();

  // Se ganhou e checkbox marcado → gerar contrato
  if (resultado.resultado === "ganho" && document.getElementById("res-gerar-contrato").checked) {
    const contrato = gerarContratoDeResultado(resultado, pre);
    resultado.contrato = { gerado: true, contratoId: contrato.contratoId };
    resultados[resultados.length - 1] = resultado;
    localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
  }

  // Alimentar banco de preços
  alimentarBancoComResultado(resultado);

  fecharModalResultado();
  renderSgd();
  renderKPIs();
  schedulCloudSync();
  showToast(resultado.resultado === "ganho" ? "Resultado registrado — contrato gerado!" : "Resultado registrado — histórico atualizado");
};

// ===== F3: GERAR CONTRATO DE RESULTADO =====
function gerarContratoDeResultado(resultado, pre) {
  const contratos = JSON.parse(localStorage.getItem(CONTRATOS_STORAGE_KEY) || "[]");
  const escolaContratos = contratos.filter(c => c.escola && c.escola.nome === pre.escola);
  const seq = (escolaContratos.length + 1).toString().padStart(3, "0");
  const ano = new Date().getFullYear();
  const escolaId = (pre.escola || "").replace(/\s+/g, "-").substring(0, 20).toUpperCase();

  const contrato = {
    contratoId: `CTR-${escolaId}-${ano}-${seq}`,
    resultadoId: resultado.id,
    orcamentoId: pre.orcamentoId,
    escola: { nome: pre.escola, municipio: pre.municipio },
    status: "ativo",
    dataContrato: new Date().toISOString().split("T")[0],
    dataLimiteEntrega: pre.dtGoodsDelivery ? pre.dtGoodsDelivery.split("T")[0] : null,
    valorTotal: pre.totalGeral,
    itens: pre.itens.map(item => ({
      nome: item.nome, marca: item.marca, unidade: item.unidade || "Un",
      quantidade: item.quantidade, precoUnitario: item.precoUnitario,
      precoTotal: item.precoTotal, entregue: 0, pendente: item.quantidade,
    })),
    entregas: [],
    historico: [{ data: new Date().toISOString(), evento: "Contrato gerado a partir de proposta aprovada", usuario: "sistema" }],
  };

  contratos.push(contrato);
  localStorage.setItem(CONTRATOS_STORAGE_KEY, JSON.stringify(contratos));
  schedulCloudSync();
  return contrato;
}

function alimentarBancoComResultado(resultado) {
  if (!bancoPrecos || !bancoPrecos.itens) return;
  resultado.itens.forEach(itemRes => {
    const bp = bancoPrecos.itens.find(b =>
      b.item && itemRes.nome && (b.item.toLowerCase().includes(itemRes.nome.toLowerCase()) || itemRes.nome.toLowerCase().includes(b.item.toLowerCase()))
    );
    if (bp) {
      if (!bp.historicoResultados) bp.historicoResultados = [];
      bp.historicoResultados.push({
        data: resultado.dataResultado, resultado: resultado.resultado,
        precoPraticado: itemRes.precoUnitario, precoVencedor: itemRes.precoVencedor,
        escola: resultado.escola,
      });
      if (resultado.resultado === "ganho") {
        const ganhos = bp.historicoResultados.filter(h => h.resultado === "ganho");
        if (ganhos.length >= 2) bp.precoReferenciaHistorico = ganhos.reduce((s, h) => s + h.precoPraticado, 0) / ganhos.length;
      }
      if (resultado.resultado === "perdido" && resultado.fornecedorVencedor) {
        if (!bp.concorrentes) bp.concorrentes = [];
        bp.concorrentes.push({
          nome: resultado.fornecedorVencedor,
          preco: itemRes.precoVencedor || resultado.valorVencedor,
          data: resultado.dataResultado, edital: resultado.escola,
        });
      }
    }
  });
  saveBancoLocal();
}

// ===== F4: ABA APROVADOS / CONTRATOS =====
function renderAprovados() {
  const contratos = JSON.parse(localStorage.getItem(CONTRATOS_STORAGE_KEY) || "[]");
  const ativos = contratos.filter(c => c.status === "ativo");
  const emEntrega = contratos.filter(c => c.status === "em_entrega");
  const entregues = contratos.filter(c => c.status === "entregue");
  const valorAtivo = contratos.reduce((s, c) => s + (c.valorTotal || 0), 0);

  setTextSafe("ak-ativos", ativos.length);
  setTextSafe("ak-entrega", emEntrega.length);
  setTextSafe("ak-concluidos", entregues.length);
  setTextSafe("ak-valor", brl.format(valorAtivo));

  const emptyEl = document.getElementById("aprovados-empty");
  const listaEl = document.getElementById("lista-aprovados");
  if (!listaEl) return;

  if (contratos.length === 0) {
    if (emptyEl) emptyEl.style.display = "block";
    listaEl.innerHTML = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  // Agrupar por escola
  const porEscola = {};
  contratos.forEach(c => {
    const nome = c.escola ? c.escola.nome : "Sem escola";
    if (!porEscola[nome]) porEscola[nome] = [];
    porEscola[nome].push(c);
  });

  const statusBadge = (s) => {
    const map = { ativo: "badge-aprovado", em_entrega: "badge-enviado", entregue: "badge-ok", cancelado: "badge-vencido" };
    return map[s] || "badge-muted";
  };

  let html = "";
  for (const [escola, ctrs] of Object.entries(porEscola)) {
    html += `<div style="margin-bottom:16px;padding:12px;border:1px solid var(--line);border-radius:8px;">
      <h4 style="margin-bottom:8px;">${escapeHtml(escola)} <span class="badge badge-muted">${ctrs.length} contrato(s)</span></h4>
      <div class="table-wrap"><table>
        <thead><tr><th>Contrato</th><th>Data</th><th>Valor</th><th>Status</th><th>Entrega</th><th>Ações</th></tr></thead>
        <tbody>${ctrs.map(c => {
          const totalItens = c.itens ? c.itens.reduce((s, i) => s + (i.quantidade || 0), 0) : 0;
          const entregueItens = c.itens ? c.itens.reduce((s, i) => s + (i.entregue || 0), 0) : 0;
          return `<tr>
            <td><strong>${escapeHtml(c.contratoId)}</strong></td>
            <td>${formatDate(c.dataContrato)}</td>
            <td class="text-right font-mono">${brl.format(c.valorTotal || 0)}</td>
            <td><span class="badge ${statusBadge(c.status)}">${c.status}</span></td>
            <td>${entregueItens}/${totalItens}</td>
            <td><button class="btn btn-inline" onclick="verContrato('${c.contratoId}')">Detalhes</button>
              <button class="btn btn-inline btn-accent" onclick="registrarEntrega('${c.contratoId}')">Entrega</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>`;
  }
  listaEl.innerHTML = html;
}

window.verContrato = function (contratoId) {
  const contratos = JSON.parse(localStorage.getItem(CONTRATOS_STORAGE_KEY) || "[]");
  const c = contratos.find(x => x.contratoId === contratoId);
  if (!c) return;

  const body = document.getElementById("modal-contrato-body");
  document.getElementById("modal-contrato-titulo").textContent = c.contratoId;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:0.85rem;">
      <div><strong>Escola:</strong> ${escapeHtml(c.escola?.nome || "")}</div>
      <div><strong>Município:</strong> ${escapeHtml(c.escola?.municipio || "")}</div>
      <div><strong>Status:</strong> <span class="badge">${c.status}</span></div>
      <div><strong>Valor:</strong> ${brl.format(c.valorTotal || 0)}</div>
      <div><strong>Data:</strong> ${formatDate(c.dataContrato)}</div>
      <div><strong>Entrega até:</strong> ${formatDate(c.dataLimiteEntrega)}</div>
    </div>
    <h4 style="margin:12px 0 8px;">Itens</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Marca</th><th>Qtd</th><th>Preço</th><th>Entregue</th><th>Pendente</th></tr></thead>
      <tbody>${(c.itens || []).map(i => `<tr>
        <td>${escapeHtml(i.nome)}</td><td>${escapeHtml(i.marca || "")}</td>
        <td>${i.quantidade}</td><td class="font-mono">${brl.format(i.precoUnitario)}</td>
        <td>${i.entregue || 0}</td><td>${i.pendente || i.quantidade}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <h4 style="margin:12px 0 8px;">Histórico</h4>
    <div style="font-size:0.8rem;">${(c.historico || []).map(h => `<div style="padding:4px 0;border-bottom:1px solid var(--line);">${formatDate(h.data?.slice(0,10))} — ${escapeHtml(h.evento)}</div>`).join("")}</div>
  `;
  document.getElementById("modal-contrato").style.display = "flex";
};

window.registrarEntrega = function (contratoId) {
  const contratos = JSON.parse(localStorage.getItem(CONTRATOS_STORAGE_KEY) || "[]");
  const c = contratos.find(x => x.contratoId === contratoId);
  if (!c) return;

  const qtdStr = prompt("Quantidade entregue (todos os itens proporcionalmente):");
  const qtd = parseInt(qtdStr);
  if (!qtd || qtd <= 0) return;

  c.itens.forEach(item => {
    const entregar = Math.min(qtd, item.pendente || item.quantidade);
    item.entregue = (item.entregue || 0) + entregar;
    item.pendente = (item.pendente || item.quantidade) - entregar;
  });

  const todosEntregues = c.itens.every(i => (i.pendente || 0) <= 0);
  if (todosEntregues) c.status = "entregue";
  else c.status = "em_entrega";

  c.historico = c.historico || [];
  c.historico.push({ data: new Date().toISOString(), evento: `Entrega registrada: ${qtd} un`, usuario: "operador" });

  localStorage.setItem(CONTRATOS_STORAGE_KEY, JSON.stringify(contratos));
  schedulCloudSync();
  renderAprovados();
  showToast("Entrega registrada!");
};

// ===== F4: ABA HISTÓRICO GANHOS/PERDIDOS =====
function renderHistorico() {
  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  const ganhos = resultados.filter(r => r.resultado === "ganho");
  const perdidos = resultados.filter(r => r.resultado === "perdido");
  const totalGanho = ganhos.reduce((s, r) => s + (r.valorProposto || 0), 0);
  const taxaConversao = resultados.length ? ((ganhos.length / resultados.length) * 100).toFixed(0) : 0;

  const perdasPorPreco = perdidos.filter(r => r.motivoPerda === "preco" && r.deltaTotalPercent);
  const deltaMedia = perdasPorPreco.length ? (perdasPorPreco.reduce((s, r) => s + r.deltaTotalPercent, 0) / perdasPorPreco.length).toFixed(1) : null;

  setTextSafe("hk-total", resultados.length);
  setTextSafe("hk-ganhos", ganhos.length);
  setTextSafe("hk-perdidos", perdidos.length);
  setTextSafe("hk-taxa", taxaConversao + "%");
  setTextSafe("hk-faturamento", brl.format(totalGanho));
  setTextSafe("hk-delta", deltaMedia ? deltaMedia + "%" : "—");

  // Render active sub-tab
  const activeBtn = document.querySelector("#sub-tabs-historico .rent-tab.active");
  const activeTab = activeBtn ? (activeBtn.textContent.includes("Ganho") ? "ganhos" : activeBtn.textContent.includes("Perdido") ? "perdidos" : "analise") : "ganhos";
  renderHistoricoContent(activeTab, ganhos, perdidos, resultados);
}

window.switchHistoricoTab = function (tab) {
  document.querySelectorAll("#sub-tabs-historico .rent-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`#sub-tabs-historico .rent-tab[onclick*="${tab}"]`).classList.add("active");
  ["ganhos", "perdidos", "analise"].forEach(t => {
    const el = document.getElementById("hist-" + t);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  renderHistoricoContent(tab, resultados.filter(r => r.resultado === "ganho"), resultados.filter(r => r.resultado === "perdido"), resultados);
};

function renderHistoricoContent(tab, ganhos, perdidos, todos) {
  const container = document.getElementById("hist-" + tab);
  if (!container) return;

  if (tab === "ganhos" || tab === "perdidos") {
    const items = tab === "ganhos" ? ganhos : perdidos;
    if (items.length === 0) { container.innerHTML = '<p class="empty-msg">Nenhum registro.</p>'; return; }
    container.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Escola</th><th>Município</th><th>Valor</th><th>Data</th>${tab === "perdidos" ? "<th>Vencedor</th><th>Delta</th><th>Motivo</th>" : "<th>Contrato</th>"}<th>Obs</th></tr></thead>
      <tbody>${items.map(r => `<tr>
        <td>${escapeHtml(r.escola)}</td><td>${escapeHtml(r.municipio)}</td>
        <td class="font-mono text-right">${brl.format(r.valorProposto || 0)}</td>
        <td>${formatDate(r.dataResultado)}</td>
        ${tab === "perdidos" ? `<td>${escapeHtml(r.fornecedorVencedor || "—")}</td><td class="text-danger">${r.deltaTotalPercent ? "+" + r.deltaTotalPercent + "%" : "—"}</td><td>${escapeHtml(r.motivoPerda || "—")}</td>` : `<td>${r.contrato?.contratoId || "—"}</td>`}
        <td style="max-width:200px;font-size:0.78rem;">${escapeHtml(r.observacoes || "")}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  if (tab === "analise") {
    // Análise por grupo
    const porGrupo = {};
    todos.forEach(r => {
      const g = r.grupo || "Geral";
      if (!porGrupo[g]) porGrupo[g] = { ganhos: [], perdidos: [] };
      porGrupo[g][r.resultado === "ganho" ? "ganhos" : "perdidos"].push(r);
    });

    if (Object.keys(porGrupo).length === 0) { container.innerHTML = '<p class="empty-msg">Sem dados para análise.</p>'; return; }

    let html = `<div class="table-wrap"><table>
      <thead><tr><th>Grupo</th><th>Ganhos</th><th>Perdidos</th><th>Taxa</th><th>Valor Médio Ganho</th><th>Insight</th></tr></thead><tbody>`;

    for (const [grupo, dados] of Object.entries(porGrupo)) {
      const total = dados.ganhos.length + dados.perdidos.length;
      const taxa = ((dados.ganhos.length / total) * 100).toFixed(0);
      const precoMedioGanho = dados.ganhos.length ? (dados.ganhos.reduce((s, r) => s + r.valorProposto, 0) / dados.ganhos.length) : null;

      let insight = "";
      if (dados.perdidos.length > dados.ganhos.length) insight = "Revisar precificação";
      else if (parseInt(taxa) >= 80) insight = "Domínio competitivo";
      else if (parseInt(taxa) >= 50) insight = "Competitivo — otimizar";

      html += `<tr>
        <td><strong>${escapeHtml(grupo)}</strong></td>
        <td class="text-accent">${dados.ganhos.length}</td>
        <td class="text-danger">${dados.perdidos.length}</td>
        <td>${taxa}%</td>
        <td class="font-mono">${precoMedioGanho ? brl.format(precoMedioGanho) : "—"}</td>
        <td style="font-size:0.8rem;">${insight}</td>
      </tr>`;
    }
    html += "</tbody></table></div>";
    container.innerHTML = html;
  }
}

// ===== F5: AI IMPORT =====
window.importarComIA = async function () {
  // Trigger file input
  const input = document.getElementById("import-file-input");
  if (!input) return;

  const file = input.files && input.files[0];
  if (!file) {
    // If no file yet, trigger the file picker with a flag
    input._aiMode = true;
    input.click();
    return;
  }

  await processAIImport(file);
};

async function processAIImport(file) {
  const btnAI = document.getElementById("btn-import-ai");
  if (btnAI) { btnAI.disabled = true; btnAI.textContent = "Analisando com IA..."; }

  try {
    // Extract text based on file type
    let textoExtraido = "";
    const ext = file.name.split(".").pop().toLowerCase();

    if (["xlsx", "xls", "csv"].includes(ext)) {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      textoExtraido = XLSX.utils.sheet_to_csv(ws, { FS: "|" });
    } else if (ext === "pdf") {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument(data).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textoExtraido += content.items.map(item => item.str).join(" ") + "\n";
      }
    } else if (["jpg", "jpeg", "png"].includes(ext)) {
      const result = await Tesseract.recognize(file, "por", {
        logger: m => {
          if (m.status === "recognizing text" && m.progress) {
            if (btnAI) btnAI.textContent = `OCR ${Math.round(m.progress * 100)}%...`;
          }
        }
      });
      textoExtraido = result.data.text;
    } else if (["docx", "doc"].includes(ext)) {
      const data = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: data });
      textoExtraido = result.value;
    }

    if (textoExtraido.trim().length < 10) throw new Error("Não foi possível extrair texto suficiente do arquivo.");

    if (btnAI) btnAI.textContent = "Enviando para IA...";
    const fornecedor = prompt("Nome do fornecedor (opcional):") || "";

    const resp = await fetch("/.netlify/functions/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: textoExtraido, formato: ext, fornecedor }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro no servidor");

    const itens = data.itens || [];
    if (itens.length === 0) throw new Error("IA não identificou itens na tabela.");

    // Match with existing banco
    const matchResult = matchAIResultWithBanco(itens);

    // Show preview in import modal
    const modal = document.getElementById("modal-import");
    document.getElementById("import-filename").textContent = file.name + " (IA)";
    const fmtBadge = document.getElementById("import-format-badge");
    if (fmtBadge) { fmtBadge.textContent = "AI Parse"; fmtBadge.style.display = "inline"; }

    // Build preview table
    const thead = document.getElementById("thead-import-preview");
    const tbody = document.getElementById("tbody-import-preview");
    thead.innerHTML = "<tr><th>Status</th><th>Item</th><th>Marca</th><th>Un</th><th>Preço</th><th>Categoria</th></tr>";
    tbody.innerHTML = itens.map(item => {
      const matched = matchResult.matched.find(m => m.ai === item);
      const ambig = matchResult.ambiguous.find(m => m.ai === item);
      let status = '<span class="badge badge-ok">Novo</span>';
      if (matched) status = '<span class="badge badge-aprovado">Match</span>';
      else if (ambig) status = '<span class="badge badge-enviado">Parcial</span>';
      return `<tr><td>${status}</td><td>${escapeHtml(item.nome || "")}</td><td>${escapeHtml(item.marca || "")}</td><td>${escapeHtml(item.unidade || "")}</td><td class="font-mono">${item.preco ? brl.format(item.preco) : "—"}</td><td>${escapeHtml(item.categoria || "")}</td></tr>`;
    }).join("");

    // Stats
    const statsEl = document.getElementById("import-stats");
    if (statsEl) {
      statsEl.style.display = "block";
      statsEl.innerHTML = `<div style="padding:8px;background:var(--bg);border-radius:6px;font-size:0.82rem;">
        <strong>IA identificou ${itens.length} itens</strong> |
        Match: ${matchResult.matched.length} | Parcial: ${matchResult.ambiguous.length} | Novos: ${matchResult.new.length} |
        Tokens: ${data.tokens_usados} | Custo: ~$${data.custo_estimado} | Fornecedor: ${data.fornecedor || "—"}
      </div>`;
    }

    // Store for confirm
    window._aiImportData = { itens, matchResult, fornecedor: data.fornecedor };

    // Override confirm button
    const btnConfirm = document.getElementById("btn-import-confirmar");
    btnConfirm.onclick = function () { confirmarAIImport(); };

    // Hide mapping (not needed for AI)
    document.getElementById("import-mapping").style.display = "none";
    const totalToggle = document.getElementById("import-total-toggle");
    if (totalToggle) totalToggle.style.display = "none";

    if (modal) modal.style.display = "flex";

  } catch (err) {
    showToast("Erro AI Import: " + err.message, 5000);
  } finally {
    if (btnAI) { btnAI.disabled = false; btnAI.textContent = "Importar com IA"; }
  }
}

function matchAIResultWithBanco(aiItens) {
  const result = { matched: [], new: [], ambiguous: [] };
  const itens = bancoPrecos.itens || [];

  aiItens.forEach(aiItem => {
    const nome = (aiItem.nome || "").toLowerCase().trim();
    let bestMatch = null, bestScore = 0;

    itens.forEach(bp => {
      const bpNome = (bp.item || "").toLowerCase().trim();
      const words1 = nome.split(/\s+/);
      const words2 = bpNome.split(/\s+/);
      const common = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));
      const score = common.length / Math.max(words1.length, words2.length);
      if (score > bestScore) { bestScore = score; bestMatch = bp; }
    });

    if (bestScore >= 0.8) result.matched.push({ ai: aiItem, banco: bestMatch, score: bestScore });
    else if (bestScore >= 0.5) result.ambiguous.push({ ai: aiItem, banco: bestMatch, score: bestScore });
    else result.new.push({ ai: aiItem });
  });
  return result;
}

function confirmarAIImport() {
  const data = window._aiImportData;
  if (!data) return;

  let added = 0, updated = 0;
  data.itens.forEach(aiItem => {
    const matched = data.matchResult.matched.find(m => m.ai === aiItem);
    if (matched && matched.banco) {
      // Update existing
      if (aiItem.preco > 0) {
        matched.banco.custoBase = aiItem.preco;
        matched.banco.precoReferencia = Math.round(aiItem.preco * (1 + (matched.banco.margemPadrao || 0.30)) * 100) / 100;
        matched.banco.ultimaCotacao = new Date().toISOString().slice(0, 10);
        if (aiItem.marca) matched.banco.marca = aiItem.marca;
        if (data.fornecedor) {
          if (!matched.banco.custosFornecedor) matched.banco.custosFornecedor = [];
          matched.banco.custosFornecedor.push({ fornecedor: data.fornecedor, preco: aiItem.preco, data: new Date().toISOString().slice(0, 10) });
        }
        updated++;
      }
    } else {
      // Add new
      bancoPrecos.itens.push({
        id: "bp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        grupo: aiItem.categoria || "Importado IA",
        item: aiItem.nome, unidade: aiItem.unidade || "Un",
        custoBase: aiItem.preco || 0, margemPadrao: 0.30,
        precoReferencia: Math.round((aiItem.preco || 0) * 1.30 * 100) / 100,
        ultimaCotacao: new Date().toISOString().slice(0, 10),
        fonte: data.fornecedor || "AI Import", marca: aiItem.marca || "",
        custosFornecedor: data.fornecedor && aiItem.preco ? [{ fornecedor: data.fornecedor, preco: aiItem.preco, data: new Date().toISOString().slice(0, 10) }] : [],
      });
      added++;
    }
  });

  saveBancoLocal();
  renderBanco();
  document.getElementById("modal-import").style.display = "none";
  window._aiImportData = null;
  showToast(`AI Import: ${updated} atualizados, ${added} novos adicionados`);
}

// ===== F7: PNCP INTEGRATION =====
async function consultarPNCP(itemNome, itemId) {
  try {
    const resp = await fetch("/.netlify/functions/pncp-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", termo: itemNome, uf: "MG" }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro PNCP");

    const resultados = data.data || data || [];
    if (!Array.isArray(resultados) || resultados.length === 0) return null;

    // Extract prices from search results
    const precos = [];
    for (const contratacao of resultados.slice(0, 5)) {
      try {
        const cnpj = contratacao.orgaoEntidade?.cnpj || contratacao.cnpjCompra;
        const ano = contratacao.anoCompra;
        const seq = contratacao.sequencialCompra;
        if (!cnpj || !ano || !seq) continue;

        const itemsResp = await fetch("/.netlify/functions/pncp-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "items", cnpj, ano, seq }),
        });
        const itemsData = await itemsResp.json();
        const itensArray = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);

        const keyword = itemNome.toLowerCase().split(" ")[0];
        itensArray.forEach(i => {
          if (i.descricao && i.descricao.toLowerCase().includes(keyword)) {
            const preco = i.valorHomologado || i.valorUnitarioEstimado;
            if (preco > 0) {
              precos.push({
                preco, orgao: contratacao.orgaoEntidade?.razaoSocial || "",
                data: contratacao.dataPublicacaoPncp, descricao: i.descricao,
              });
            }
          }
        });
      } catch (_) { /* skip */ }
    }

    if (precos.length === 0) return null;

    const valores = precos.map(p => p.preco);
    valores.sort((a, b) => a - b);
    const mediana = valores.length % 2 ? valores[Math.floor(valores.length / 2)] : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2;

    const stats = {
      mediana, media: valores.reduce((a, b) => a + b, 0) / valores.length,
      min: Math.min(...valores), max: Math.max(...valores),
      amostras: valores.length, detalhes: precos,
      dataConsulta: new Date().toISOString(),
    };

    // Save to banco
    const item = bancoPrecos.itens.find(i => i.id === itemId);
    if (item) {
      item.pncp = stats;
      item.precoReferencia = stats.mediana;
      item.ultimaConsultaPncp = stats.dataConsulta;
      saveBancoLocal();
    }

    // Cache 7 days
    const cache = JSON.parse(localStorage.getItem(PNCP_CACHE_KEY) || "{}");
    cache[itemId] = { ...stats, expira: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    localStorage.setItem(PNCP_CACHE_KEY, JSON.stringify(cache));

    return stats;
  } catch (err) {
    console.warn("PNCP error:", err);
    return null;
  }
}

window.consultarPncpBatch = async function () {
  const cache = JSON.parse(localStorage.getItem(PNCP_CACHE_KEY) || "{}");
  const pendentes = (bancoPrecos.itens || []).filter(item => {
    const cached = cache[item.id];
    return !cached || cached.expira < Date.now();
  });

  if (pendentes.length === 0) { showToast("Todos os itens já têm consulta PNCP válida (cache 7 dias)"); return; }

  const progressEl = document.getElementById("pncp-progress");
  if (progressEl) progressEl.style.display = "block";

  let processados = 0;
  for (const item of pendentes) {
    await consultarPNCP(item.item, item.id);
    processados++;
    if (progressEl) {
      const pct = Math.round(processados / pendentes.length * 100);
      progressEl.querySelector(".pct").textContent = pct + "%";
      progressEl.querySelector(".label").textContent = `${processados}/${pendentes.length} itens consultados`;
      progressEl.querySelector(".bar").value = pct;
    }
    await new Promise(r => setTimeout(r, 1200)); // Rate limit
  }

  if (progressEl) progressEl.style.display = "none";
  renderBanco();
  showToast(`PNCP: ${processados} itens atualizados`);
};

// ===== F6: FONTES B2B =====
window.abrirGerenciadorFontes = function (itemId) {
  const item = bancoPrecos.itens.find(i => i.id === itemId);
  if (!item) return;
  const fontes = item.fontesPreco || [];

  const isExpired = (f) => f.validade && new Date(f.validade) < new Date();
  const tipoLabel = { manual: "Manual", b2b_portal: "Portal B2B", b2b_api: "API", tabela_fornecedor: "Tabela" };

  let html = `<h4 style="margin-bottom:8px;">${escapeHtml(item.item)}</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Fornecedor</th><th>Tipo</th><th>Preço</th><th>Atualizado</th><th>Válido até</th><th>Freq.</th><th></th></tr></thead>
      <tbody>${fontes.length === 0 ? '<tr><td colspan="7" class="text-muted">Nenhuma fonte cadastrada.</td></tr>' : fontes.map((f, idx) => {
        const exp = isExpired(f);
        return `<tr style="${exp ? "opacity:0.5;" : ""}">
          <td>${escapeHtml(f.fornecedor)}</td>
          <td><span class="badge">${tipoLabel[f.tipo] || f.tipo}</span></td>
          <td class="font-mono">${brl.format(f.preco)}</td>
          <td>${formatDate(f.dataAtualizacao)}</td>
          <td>${f.validade ? formatDate(f.validade) : "—"} ${exp ? '<span class="badge badge-vencido">Expirado</span>' : ""}</td>
          <td>${f.frequencia || "—"}</td>
          <td><button class="btn btn-inline btn-danger" onclick="removerFontePreco('${itemId}',${idx})">X</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
    <h4 style="margin:12px 0 8px;">Adicionar Fonte</h4>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;">
      <label style="flex:1;min-width:120px;">Fornecedor<input type="text" id="nf-fornecedor" placeholder="Nome" /></label>
      <label style="width:80px;">Preço<input type="number" id="nf-preco" step="0.01" /></label>
      <label style="width:120px;">Válido até<input type="date" id="nf-validade" /></label>
      <label style="width:120px;">Tipo<select id="nf-tipo"><option value="manual">Manual</option><option value="tabela_fornecedor">Tabela</option><option value="b2b_portal">Portal B2B</option></select></label>
      <label style="width:120px;">Frequência<select id="nf-freq"><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option></select></label>
      <button class="btn btn-accent btn-sm" onclick="adicionarFontePreco('${itemId}')">Adicionar</button>
    </div>`;

  document.getElementById("modal-fontes-titulo").textContent = "Fontes de Preço";
  document.getElementById("modal-fontes-body").innerHTML = html;
  document.getElementById("modal-fontes").style.display = "flex";
};

window.adicionarFontePreco = function (itemId) {
  const item = bancoPrecos.itens.find(i => i.id === itemId);
  if (!item) return;
  const fornecedor = document.getElementById("nf-fornecedor").value.trim();
  const preco = parseFloat(document.getElementById("nf-preco").value);
  if (!fornecedor || !preco) { alert("Preencha fornecedor e preço."); return; }

  if (!item.fontesPreco) item.fontesPreco = [];
  item.fontesPreco.push({
    tipo: document.getElementById("nf-tipo").value,
    fornecedor, preco,
    dataAtualizacao: new Date().toISOString().slice(0, 10),
    validade: document.getElementById("nf-validade").value || null,
    frequencia: document.getElementById("nf-freq").value,
    ativo: true,
  });

  // Update custoBase to best price
  const activesFontes = item.fontesPreco.filter(f => f.ativo && (!f.validade || new Date(f.validade) >= new Date()));
  if (activesFontes.length > 0) {
    item.custoBase = Math.min(...activesFontes.map(f => f.preco));
    item.precoReferencia = Math.round(item.custoBase * (1 + (item.margemPadrao || 0.30)) * 100) / 100;
  }

  saveBancoLocal();
  abrirGerenciadorFontes(itemId); // Re-render
  showToast("Fonte adicionada!");
};

window.removerFontePreco = function (itemId, idx) {
  const item = bancoPrecos.itens.find(i => i.id === itemId);
  if (!item || !item.fontesPreco) return;
  item.fontesPreco.splice(idx, 1);
  saveBancoLocal();
  abrirGerenciadorFontes(itemId);
};

// ===== BIND NEW EVENTS =====
(function bindNewEvents() {
  // AI Import button
  const btnAI = document.getElementById("btn-import-ai");
  if (btnAI) {
    btnAI.addEventListener("click", () => {
      const input = document.getElementById("import-file-input");
      input._aiMode = true;
      input.click();
    });
  }

  // Hook file input for AI mode
  const fileInput = document.getElementById("import-file-input");
  if (fileInput) {
    const origHandler = fileInput.onchange;
    fileInput.addEventListener("change", function (e) {
      if (this._aiMode && this.files && this.files[0]) {
        this._aiMode = false;
        processAIImport(this.files[0]);
        e.stopImmediatePropagation();
        return;
      }
    });
  }

  // Banco: select-all checkbox
  const selectAllBanco = document.getElementById("banco-select-all");
  if (selectAllBanco) {
    selectAllBanco.addEventListener("change", function () {
      document.querySelectorAll(".banco-item-check").forEach(c => { c.checked = this.checked; });
      updateBancoSelectionUI();
    });
  }

  // Banco: delegate individual checkbox changes
  const tbodyBanco = document.getElementById("tbody-banco");
  if (tbodyBanco) {
    tbodyBanco.addEventListener("change", function (e) {
      if (e.target.classList.contains("banco-item-check")) updateBancoSelectionUI();
    });
  }

  // Banco: bulk delete button
  const btnExcluirSel = document.getElementById("btn-excluir-selecionados-banco");
  if (btnExcluirSel) btnExcluirSel.addEventListener("click", excluirSelecionadosBanco);

  // PNCP batch button
  const btnPncp = document.getElementById("btn-pncp-batch");
  if (btnPncp) btnPncp.addEventListener("click", consultarPncpBatch);

  // Export contratos
  const btnExpCtr = document.getElementById("btn-export-contratos");
  if (btnExpCtr) {
    btnExpCtr.addEventListener("click", () => {
      const contratos = JSON.parse(localStorage.getItem(CONTRATOS_STORAGE_KEY) || "[]");
      const header = "ContratoID;Escola;Municipio;Valor;Status;Data;Entregue";
      const rows = contratos.map(c => {
        const entregue = c.itens ? c.itens.reduce((s, i) => s + (i.entregue || 0), 0) : 0;
        return [c.contratoId, c.escola?.nome, c.escola?.municipio, c.valorTotal, c.status, c.dataContrato, entregue].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(";");
      });
      if (typeof downloadCsv === "function") downloadCsv("contratos.csv", [header, ...rows].join("\n"));
    });
  }
})();

// ===== INIT =====
boot();
