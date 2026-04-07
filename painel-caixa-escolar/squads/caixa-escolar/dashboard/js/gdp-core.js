// ===== GDP CORE — extracted from gdp-contratos.html =====
// Infrastructure: sidebar, constants, data layer, cloud sync, state, storage helpers,
// save/load, sanitizers, normalization, client/escola utils, SKU/item enrichment.

// ===== SIDEBAR TOGGLE =====
document.getElementById("sidebar-toggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("active");
});
document.getElementById("sidebar-overlay").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
});

function toggleGdpSidebarMenu(forceOpen) {
  const menu = document.getElementById("gdp-sidebar-menu");
  if (!menu) return;
  if (typeof forceOpen === "boolean") {
    menu.classList.toggle("hidden", !forceOpen);
    return;
  }
  menu.classList.toggle("hidden");
}

// ===== CONSTANTS =====
const CONTRACTS_KEY = "gdp.contratos.v1";
const CONTRACTS_DELETED_KEY = "gdp.contratos.deleted.v1";
const ORDERS_KEY = "gdp.pedidos.v1";
const PROOFS_KEY = "gdp.entregas.provas.v1";
const INVOICES_KEY = "gdp.notas-fiscais.v1";
const ENTRY_INVOICES_KEY = "gdp.notas-entrada.v1";
const PAYABLES_KEY = "gdp.contas-pagar.v1";
const RECEIVABLES_KEY = "gdp.contas-receber.v1";
const PAYABLE_CATEGORIES_KEY = "gdp.contas-pagar.categorias.v1";
const RECEIVABLE_CATEGORIES_KEY = "gdp.contas-receber.categorias.v1";
const PAYABLE_METHODS_KEY = "gdp.contas-pagar.formas.v1";
const RECEIVABLE_METHODS_KEY = "gdp.contas-receber.formas.v1";
const CAIXA_STATEMENT_KEY = "gdp.caixa.extrato.v1";
const STOCK_KEY = "gdp.estoque.movimentos.v1";
const ESTOQUE_INTEL_PRODUCTS_KEY = "gdp.estoque-intel.produtos.v1";
const ESTOQUE_INTEL_PACKAGES_KEY = "gdp.estoque-intel.embalagens.v1";
const ESTOQUE_INTEL_ORDERS_KEY = "gdp.estoque-intel.pedidos.v1";
const ESTOQUE_INTEL_ORDER_ITEMS_KEY = "gdp.estoque-intel.pedido-itens.v1";
const ESTOQUE_INTEL_MOVES_KEY = "gdp.estoque-intel.movimentacoes.v1";
const ESTOQUE_INTEL_SUPPLIERS_KEY = "gdp.estoque-intel.fornecedores.v1";
const ESTOQUE_INTEL_PURCHASES_KEY = "gdp.estoque-intel.compras.v1";
const INTEGRATIONS_KEY = "gdp.integracoes.v1";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// ===== EQUIVALENCIAS / DEMANDAS / ESTOQUE DATA LAYER (migrado de app.js Story 4.43) =====
const GDP_EQUIV_KEY = "gdp.equivalencias.v1";
const GDP_CONVERSOES_KEY = "gdp.conversoes.v1";
const GDP_DEMANDAS_KEY = "gdp.demandas.v1";
const GDP_ESTOQUE_SIMPLES_KEY = "gdp.estoque.v1";
const GDP_COMPRAS_KEY = "gdp.lista-compras.v1";
let gdpEquivalencias = {};
let gdpConversoes = {};
let gdpDemandas = [];
let gdpEstoqueSimples = {};
let gdpListaCompras = [];

function loadGdpEquivalencias() { try { gdpEquivalencias = JSON.parse(localStorage.getItem(GDP_EQUIV_KEY) || "{}"); } catch(_) { gdpEquivalencias = {}; } }
function saveGdpEquivalencias() { localStorage.setItem(GDP_EQUIV_KEY, JSON.stringify(gdpEquivalencias)); cloudSave(GDP_EQUIV_KEY, gdpEquivalencias).catch(() => {}); scheduleGdpCloudSync(); }
function getGdpEquivalencia(desc) {
  const norm = gdpNormalizedText(desc);
  if (!norm) return null;
  // Match exato
  if (gdpEquivalencias[norm]) return gdpEquivalencias[norm];
  // Match parcial: buscar todas as chaves que contenham ou sejam contidas pelo texto
  const keys = Object.keys(gdpEquivalencias);
  const candidates = keys.filter(k => k.startsWith(norm) || norm.startsWith(k) || k.includes(norm) || norm.includes(k));
  if (candidates.length === 0) return null;
  // Priorizar: menor diferença de comprimento (chave mais parecida com o pedido)
  candidates.sort((a, b) => Math.abs(a.length - norm.length) - Math.abs(b.length - norm.length));
  return gdpEquivalencias[candidates[0]];
}
function setGdpEquivalencia(desc, sku) { gdpEquivalencias[gdpNormalizedText(desc)] = sku; saveGdpEquivalencias(); }
function gdpNormalizedText(v) { return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function loadGdpConversoes() { try { gdpConversoes = JSON.parse(localStorage.getItem(GDP_CONVERSOES_KEY) || "{}"); } catch(_) { gdpConversoes = {}; } }
function saveGdpConversoes() { localStorage.setItem(GDP_CONVERSOES_KEY, JSON.stringify(gdpConversoes)); scheduleGdpCloudSync(); }
function loadGdpDemandas() { try { gdpDemandas = JSON.parse(localStorage.getItem(GDP_DEMANDAS_KEY) || "[]"); } catch(_) { gdpDemandas = []; } }
function saveGdpDemandas() { localStorage.setItem(GDP_DEMANDAS_KEY, JSON.stringify(gdpDemandas)); scheduleGdpCloudSync(); }
function loadGdpEstoqueSimples() { try { gdpEstoqueSimples = JSON.parse(localStorage.getItem(GDP_ESTOQUE_SIMPLES_KEY) || "{}"); } catch(_) { gdpEstoqueSimples = {}; } }
function saveGdpEstoqueSimples() { localStorage.setItem(GDP_ESTOQUE_SIMPLES_KEY, JSON.stringify(gdpEstoqueSimples)); scheduleGdpCloudSync(); }
function loadGdpListaCompras() { try { gdpListaCompras = JSON.parse(localStorage.getItem(GDP_COMPRAS_KEY) || "[]"); } catch(_) { gdpListaCompras = []; } }
function saveGdpListaCompras() { localStorage.setItem(GDP_COMPRAS_KEY, JSON.stringify(gdpListaCompras)); scheduleGdpCloudSync(); }

function getGdpBancoProduto(sku) {
  // Buscar primeiro no Estoque Intel (novo), fallback pro banco antigo
  const intelProd = estoqueIntelProdutos.find(p => p.sku === sku || p.id === sku);
  if (intelProd) {
    const emb = estoqueIntelEmbalagens.find(e => e.produto_id === intelProd.id);
    return { id: intelProd.id, item: intelProd.nome, nomeComercial: intelProd.nome, sku: intelProd.sku, custoBase: emb?.preco_referencia || 0, ncm: intelProd.ncm || "", unidade: intelProd.unidade_base || "UN", _source: "intel" };
  }
  const BANCO_KEY = "caixaescolar.banco.v1";
  try {
    const banco = JSON.parse(localStorage.getItem(BANCO_KEY));
    if (banco && Array.isArray(banco.itens)) return banco.itens.find(i => i.sku === sku) || null;
  } catch(_) {}
  return null;
}
function scheduleGdpCloudSync() { if (typeof schedulCloudSync === "function") schedulCloudSync(); }

// ===== SUPABASE CLOUD SYNC =====
const SUPABASE_URL = "https://mvvsjaudhbglxttxaeop.supabase.co";
const SUPABASE_KEY = "sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR";
// Entidades com tabela Supabase real — NÃO sincronizar via sync_data (gdpApi cuida)
const _SUPABASE_TABLE_KEYS = new Set([CONTRACTS_KEY, ORDERS_KEY, INVOICES_KEY, RECEIVABLES_KEY, PAYABLES_KEY, PROOFS_KEY, "gdp.usuarios.v1"]);
const GDP_SYNC_KEYS = [CONTRACTS_DELETED_KEY, ENTRY_INVOICES_KEY, PAYABLE_CATEGORIES_KEY, RECEIVABLE_CATEGORIES_KEY, PAYABLE_METHODS_KEY, RECEIVABLE_METHODS_KEY, CAIXA_STATEMENT_KEY, STOCK_KEY, ESTOQUE_INTEL_PRODUCTS_KEY, ESTOQUE_INTEL_PACKAGES_KEY, ESTOQUE_INTEL_ORDERS_KEY, ESTOQUE_INTEL_ORDER_ITEMS_KEY, ESTOQUE_INTEL_MOVES_KEY, ESTOQUE_INTEL_SUPPLIERS_KEY, ESTOQUE_INTEL_PURCHASES_KEY, INTEGRATIONS_KEY, "caixaescolar.banco.v1", GDP_EQUIV_KEY, GDP_CONVERSOES_KEY, GDP_DEMANDAS_KEY, GDP_ESTOQUE_SIMPLES_KEY, GDP_COMPRAS_KEY, "nexedu.config.contas-bancarias", "nexedu.config.fiscal", "nexedu.config.bank-api", "nexedu.empresa"];
const GDP_SHARED_SYNC_KEYS = new Set(GDP_SYNC_KEYS);
const GDP_SYNC_USER_KEY = "gdp.sync.user_id.v1";
const GDP_SYNC_FALLBACK_USER = "LARIUCCI";
let gdpSyncState = {
  userId: "default",
  status: "syncing",
  detail: "Aguardando cloud",
  lastSyncAt: "",
  source: "cloud"
};

function getSyncUserId() {
  const forced = String(localStorage.getItem(GDP_SYNC_USER_KEY) || "").trim();
  if (forced && forced.toLowerCase() !== "default") return forced;
  const emp = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const preferred = [
    emp.syncUserId,
    emp.nomeFantasia,
    emp.nome
  ].map((value) => String(value || "").trim()).find((value) => value && value.toLowerCase() !== "default");
  const resolved = preferred || GDP_SYNC_FALLBACK_USER;
  localStorage.setItem(GDP_SYNC_USER_KEY, resolved);
  return resolved;
}

function getGdpSyncUserCandidates() {
  const emp = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const cnpjDigits = String(emp.cnpj || "").replace(/\D+/g, "");
  return [...new Set([
    localStorage.getItem(GDP_SYNC_USER_KEY),
    emp.syncUserId,
    emp.nomeFantasia,
    emp.nome,
    emp.razaoSocial,
    cnpjDigits,
    emp.cnpj,
    GDP_SYNC_FALLBACK_USER,
    "default"
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function persistResolvedGdpSyncUser(userId) {
  const resolved = String(userId || "").trim();
  if (!resolved || resolved.toLowerCase() === "default") return;
  localStorage.setItem(GDP_SYNC_USER_KEY, resolved);
  try {
    const emp = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
    localStorage.setItem("nexedu.empresa", JSON.stringify({ ...emp, syncUserId: resolved }));
  } catch (_) {}
}

function setGdpSyncState(patch = {}) {
  gdpSyncState = {
    ...gdpSyncState,
    ...patch,
    userId: patch.userId || gdpSyncState.userId || getSyncUserId()
  };
  renderGdpSyncIndicator();
}

function renderGdpSyncIndicator() {
  const container = document.getElementById("gdp-sync-indicator");
  const stateEl = document.getElementById("gdp-sync-state");
  const metaEl = document.getElementById("gdp-sync-meta");
  if (!container || !stateEl || !metaEl) return;
  const status = gdpSyncState.status || "syncing";
  const stateMap = {
    cloud: { label: "Fonte remota ativa", state: "cloud" },
    syncing: { label: "Sincronizando GDP", state: "syncing" },
    pending: { label: "Mudancas locais pendentes", state: "pending" },
    offline: { label: "Cloud indisponivel", state: "offline" },
    local: { label: "Cache local em uso", state: "pending" }
  };
  const current = stateMap[status] || stateMap.syncing;
  container.dataset.state = current.state;
  stateEl.textContent = current.label;
  const details = [];
  details.push(`Sessao: ${gdpSyncState.userId || getSyncUserId()}`);
  if (gdpSyncState.source) details.push(`Fonte: ${gdpSyncState.source}`);
  if (gdpSyncState.detail) details.push(gdpSyncState.detail);
  if (gdpSyncState.lastSyncAt) details.push(`Atualizado ${formatDateTimeLocal(gdpSyncState.lastSyncAt)}`);
  metaEl.textContent = details.join(" | ");
}

async function cloudSave(key, data) {
  const userId = getSyncUserId();
  try {
    // FIX Story 4.17: UPSERT via Supabase on_conflict
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/sync_data?on_conflict=user_id,key`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify({ user_id: userId, key, data, updated_at: new Date().toISOString() })
    });
    if (!resp.ok && resp.status !== 201 && resp.status !== 200) {
      console.warn(`[CloudSave] ${key} failed: ${resp.status}`, await resp.text().catch(() => ""));
    }
  } catch (e) { console.warn("Cloud save failed:", key, e); }
}

async function cloudLoadAll() {
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
  for (const userId of getGdpSyncUserCandidates()) {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(userId)}&select=key,data,updated_at`,
        { headers }
      );
      if (!resp.ok) continue;
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        persistResolvedGdpSyncUser(userId);
        return rows;
      }
    } catch (e) {
      console.warn("Cloud load failed:", userId, e);
    }
  }
  return null;
}

function getDataTimestamp(data, fallback = "") {
  const source = data?.updatedAt || data?.updated_at || fallback || "";
  const time = source ? new Date(source).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

// Story 2.1: merge arrays by ID, preservando a versão com mais .itens por entry
function mergeArraysPreservingItens(localArr, cloudArr) {
  const localMap = new Map();
  for (const entry of localArr) {
    if (entry?.id) localMap.set(entry.id, entry);
  }
  const merged = [];
  const usedLocalIds = new Set();
  for (const cloudEntry of cloudArr) {
    const localEntry = cloudEntry?.id ? localMap.get(cloudEntry.id) : null;
    if (localEntry) {
      usedLocalIds.add(localEntry.id);
      const localItensCount = Array.isArray(localEntry.itens) ? localEntry.itens.length : 0;
      const cloudItensCount = Array.isArray(cloudEntry.itens) ? cloudEntry.itens.length : 0;
      if (localItensCount > cloudItensCount) {
        console.log("[Sync Merge] Mantendo local para", localEntry.id, "— local:", localItensCount, "itens, cloud:", cloudItensCount);
        merged.push(localEntry);
      } else {
        merged.push(cloudEntry);
      }
    } else {
      merged.push(cloudEntry);
    }
  }
  for (const entry of localArr) {
    if (entry?.id && !usedLocalIds.has(entry.id)) {
      merged.push(entry);
    }
  }
  return merged;
}

async function syncFromCloud() {
  const rows = await cloudLoadAll();
  if (!rows || rows.length === 0) return { restored: false, rowCount: 0, source: "local_cache", lastSyncAt: "" };
  let synced = 0;
  let newest = "";
  for (const row of rows) {
    const local = localStorage.getItem(row.key);
    let localData = null;
    try {
      localData = local ? JSON.parse(local) : null;
    } catch (_) {
      localData = null;
    }
    if (row.updated_at && (!newest || new Date(row.updated_at) > new Date(newest))) newest = row.updated_at;
    if (!row.data) continue;

    // Filtrar contratos deletados ao receber do cloud
    const incomingData = row.key === CONTRACTS_KEY
      ? { ...(row.data), items: applyDeletedContractsFilter(unwrapData(row.data)) }
      : row.data;

    // Cloud wins ONLY if local is empty OR cloud data is newer
    if (!localData) {
      localStorage.setItem(row.key, JSON.stringify(incomingData));
      synced++;
      continue;
    }

    // Compare timestamps: prefer data's internal updatedAt, fallback to Supabase row.updated_at
    const cloudTime = getDataTimestamp(incomingData, row.updated_at);
    const localTime = getDataTimestamp(localData);
    const isSharedKey = GDP_SHARED_SYNC_KEYS.has(row.key);

    // Cloud wins ONLY if cloud is strictly newer AND has actual content
    // FIX Story 2.1: comparar itens DENTRO de cada pedido, não só contagem top-level
    const localArr = Array.isArray(localData?.items) ? localData.items : (Array.isArray(localData) ? localData : []);
    const cloudArr = Array.isArray(incomingData?.items) ? incomingData.items : (Array.isArray(incomingData) ? incomingData : []);
    const localItems = localArr.length;
    const cloudItems = cloudArr.length;
    const localHasContent = localItems > 0;
    const cloudHasMoreContent = cloudItems >= localItems;

    // Deep check: contar .itens nested dentro de cada entry (pedidos têm .itens com produtos)
    const countDeepItens = (arr) => arr.reduce((sum, e) => sum + (Array.isArray(e?.itens) ? e.itens.length : 0), 0);
    const localDeepItens = countDeepItens(localArr);
    const cloudDeepItens = countDeepItens(cloudArr);
    const cloudHasMoreDeepContent = cloudDeepItens >= localDeepItens;

    if (localHasContent && !cloudHasMoreContent) {
      console.log("[Sync] Bloqueado: local tem mais entries que cloud para", row.key, "local:", localItems, "cloud:", cloudItems);
      continue;
    }

    // Story 2.1: se cloud tem menos itens nested (produtos em pedidos), NÃO sobrescrever
    if (localDeepItens > 0 && !cloudHasMoreDeepContent) {
      console.log("[Sync] Bloqueado: local tem mais itens nested que cloud para", row.key, "localDeep:", localDeepItens, "cloudDeep:", cloudDeepItens);
      // Merge: manter pedidos locais que têm mais itens, aceitar rest do cloud
      if (localArr.length > 0 && cloudArr.length > 0 && localData?.items) {
        const merged = mergeArraysPreservingItens(localArr, cloudArr);
        const mergedData = { ...incomingData, items: merged, updatedAt: new Date().toISOString() };
        localStorage.setItem(row.key, JSON.stringify(mergedData));
        console.log("[Sync] Merge concluído para", row.key, "— preservou itens locais mais completos");
        synced++;
      }
      continue;
    }

    if ((isSharedKey && cloudHasMoreContent && cloudHasMoreDeepContent) || (cloudTime > localTime && cloudHasMoreDeepContent) || (!localTime && cloudTime === 0)) {
      localStorage.setItem(row.key, JSON.stringify(incomingData));
      synced++;
    }
  }
  return { restored: synced > 0, rowCount: rows.length, source: "cloud", lastSyncAt: newest };
}

async function syncToCloud() {
  setGdpSyncState({ status: "syncing", source: "cloud", detail: "Publicando alteracoes locais" });
  const promises = GDP_SYNC_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve();
    try {
      const data = JSON.parse(raw);
      // Guard: never push empty data to cloud — prevents overwriting good data
      if (Array.isArray(data) && data.length === 0) return Promise.resolve();
      if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return Promise.resolve();
      return cloudSave(key, data);
    }
    catch(_) { return Promise.resolve(); }
  });
  await Promise.all(promises);
  setGdpSyncState({
    status: "cloud",
    source: "cloud",
    detail: "Cloud atualizado com dados do GDP",
    lastSyncAt: new Date().toISOString()
  });
}

let _syncTimeout = null;
function schedulCloudSync() {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  setGdpSyncState({ status: "pending", source: "cloud", detail: "Aguardando envio automatico" });
  _syncTimeout = setTimeout(() => syncToCloud(), 2000);
}

async function forcarSyncCompleto() {
  try {
    // PULL first, THEN push — prevents overwriting cloud with stale local data
    setGdpSyncState({ status: "syncing", detail: "Baixando dados do cloud..." });
    showToast("Sync: baixando dados do cloud...", 2000);
    const result = await syncFromCloud();
    if (result.restored) {
      loadData();
      renderAll();
      showToast("Sync completo! " + result.rowCount + " chaves sincronizadas. Recarregue em outras maquinas.", 5000);
    } else {
      showToast("Sync completo — tudo ja estava atualizado.", 3000);
    }
    // Push AFTER pull
    setGdpSyncState({ status: "syncing", detail: "Enviando dados locais para cloud..." });
    await syncToCloud();
    setGdpSyncState({ status: "cloud", detail: "Sync manual concluido" });
  } catch (e) {
    setGdpSyncState({ status: "offline", detail: "Falha no sync: " + e.message });
    showToast("Erro no sync: " + e.message, 5000);
  }
}

// Sync on tab hide/close to prevent data loss
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
    syncToCloud().catch(() => {});
  }
});

// ===== STATE =====
let contratos = [];
let contratosExcluidos = [];
let pedidos = [];
let provasEntrega = [];
let notasFiscais = [];
let notasEntrada = [];
let contasPagar = [];
let contasReceber = [];
let contaPagarCategorias = [];
let contaReceberCategorias = [];
let contaPagarFormas = [];
let contaReceberFormas = [];
let caixaExtratoMovimentos = [];
let estoqueMovimentos = [];
let estoqueIntelProdutos = [];
let estoqueIntelEmbalagens = [];
let estoqueIntelPedidos = [];
let estoqueIntelPedidoItens = [];
let estoqueIntelMovimentacoes = [];
let estoqueIntelFornecedores = [];
let estoqueIntelCompras = [];
let estoqueIntelUltimaSugestao = null;
let estoqueIntelCurrentView = "produtos";
let estoqueIntelListaPeriodoModo = "mes";
let estoqueIntelListaStatusFiltros = [];
let estoqueIntelListaComprasSelecionadas = new Set();
let estoqueIntelListaDemandaContextoId = "";
let estoqueIntelFiltroReservaStatus = "";
let estoqueIntelCompraDetalheAtualId = null;
let entregasOperacionaisRender = [];
let integracoesGdp = [];
let integracoesRemotas = [];
let integracoesUltimaLeitura = "";
let sefazConfigSnapshot = null;
let pedidoCloneDraft = null;
let parsedMapa = null;
let selectedSupplierIdx = null;
let pendingContratoDraft = null;

// ===== STORAGE =====
function unwrapData(raw) { return Array.isArray(raw) ? raw : (raw && raw.items ? raw.items : []); }
function getDefaultContaPagarCategorias() { return ["fornecedor", "frete", "tributo", "comissao", "servico", "operacional"]; }
function getDefaultContaReceberCategorias() { return ["faturamento", "mensalidade", "servico", "reembolso", "ajuste"]; }
function getDefaultContaFormas() { return ["boleto", "pix", "ted"]; }
function getDefaultEstoqueIntelSeed() {
  return {
    produtos: [
      { id: "PROD-ARROZ", nome: "Arroz", unidade_base: "g" },
      { id: "PROD-BOLACHA", nome: "Bolacha agua e sal", unidade_base: "g" },
      { id: "PROD-SUCO", nome: "Suco integral", unidade_base: "ml" }
    ],
    embalagens: [
      { id: "EMB-ARROZ-300", produto_id: "PROD-ARROZ", descricao: "Pacote 300g", codigo_barras: "7890000003001", quantidade_base: 300, preco_referencia: 7.8 },
      { id: "EMB-ARROZ-350", produto_id: "PROD-ARROZ", descricao: "Pacote 350g", codigo_barras: "7890000003506", quantidade_base: 350, preco_referencia: 8.9 },
      { id: "EMB-ARROZ-360", produto_id: "PROD-ARROZ", descricao: "Pacote 360g", codigo_barras: "7890000003605", quantidade_base: 360, preco_referencia: 9.1 },
      { id: "EMB-SUCO-1000", produto_id: "PROD-SUCO", descricao: "Garrafa 1000ml", codigo_barras: "7890000010009", quantidade_base: 1000, preco_referencia: 6.2 }
    ],
    fornecedores: [
      { id: "FORN-001", nome: "Fornecedor Alfa", documento: "12345678000190", contato: "compras@alfa.com", status: "ativo", embalagens: [{ embalagem_id: "EMB-ARROZ-350", preco_unitario: 8.9 }, { embalagem_id: "EMB-ARROZ-360", preco_unitario: 9.1 }] },
      { id: "FORN-002", nome: "Distribuidora Beta", documento: "98765432000155", contato: "vendas@beta.com", status: "ativo", embalagens: [{ embalagem_id: "EMB-ARROZ-300", preco_unitario: 7.8 }, { embalagem_id: "EMB-SUCO-1000", preco_unitario: 6.2 }] }
    ],
    pedidos: [],
    pedidoItens: [],
    movimentacoes: [],
    compras: []
  };
}
function formatCategoriaLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function normalizeCategoriaValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function getCategoriaList(tipo) {
  return (tipo === "pagar" ? contaPagarCategorias : contaReceberCategorias) || [];
}
function getFormaList(tipo) {
  return (tipo === "pagar" ? contaPagarFormas : contaReceberFormas) || [];
}
function normalizeContaCategoriaRegistro(tipo, value) {
  const normalized = normalizeCategoriaValue(value);
  if (!normalized || normalized === "incluir") return tipo === "pagar" ? "operacional" : "ajuste";
  return normalized;
}
function normalizeContaFormaRegistro(value) {
  const normalized = normalizeCategoriaValue(value);
  if (!normalized || normalized === "incluir") return "boleto";
  return normalized;
}
function saveContaCategorias() {
  saveWrappedArray(PAYABLE_CATEGORIES_KEY, contaPagarCategorias);
  saveWrappedArray(RECEIVABLE_CATEGORIES_KEY, contaReceberCategorias);
}
function saveContaFormas() {
  saveWrappedArray(PAYABLE_METHODS_KEY, contaPagarFormas);
  saveWrappedArray(RECEIVABLE_METHODS_KEY, contaReceberFormas);
}
function ensureContaCategoria(tipo, value) {
  const normalized = normalizeCategoriaValue(value);
  if (!normalized) return "";
  const list = tipo === "pagar" ? contaPagarCategorias : contaReceberCategorias;
  if (!list.includes(normalized)) {
    list.push(normalized);
    list.sort((a, b) => formatCategoriaLabel(a).localeCompare(formatCategoriaLabel(b), "pt-BR"));
    saveContaCategorias();
  }
  return normalized;
}
function promptNovaCategoriaConta(tipo, targetSelectId) {
  const label = tipo === "pagar" ? "contas a pagar" : "contas a receber";
  const raw = window.prompt(`Informe o nome da nova categoria para ${label}:`, "");
  const normalized = ensureContaCategoria(tipo, raw);
  renderContaCategoriaOptions();
  if (targetSelectId) {
    const select = document.getElementById(targetSelectId);
    if (select && normalized) select.value = normalized;
    else if (select) select.value = getCategoriaList(tipo)[0] || "";
  }
  return normalized;
}
function ensureContaForma(tipo, value) {
  const normalized = normalizeContaFormaRegistro(value);
  if (!normalized) return "";
  const list = tipo === "pagar" ? contaPagarFormas : contaReceberFormas;
  if (!list.includes(normalized)) {
    list.push(normalized);
    list.sort((a, b) => formatCategoriaLabel(a).localeCompare(formatCategoriaLabel(b), "pt-BR"));
    saveContaFormas();
  }
  return normalized;
}
function promptNovaFormaConta(tipo, targetSelectId) {
  const label = tipo === "pagar" ? "contas a pagar" : "contas a receber";
  const raw = window.prompt(`Informe o nome da nova forma para ${label}:`, "");
  const normalized = ensureContaForma(tipo, raw);
  renderContaFormaOptions();
  if (targetSelectId) {
    const select = document.getElementById(targetSelectId);
    if (select && normalized) select.value = normalized;
    else if (select) select.value = getFormaList(tipo)[0] || "boleto";
  }
  return normalized;
}
function renderContaCategoriaOptions() {
  const mappings = [
    { id: "cp-categoria", tipo: "pagar", includeCreate: true, defaultValue: "fornecedor" },
    { id: "cp-filtro-categoria", tipo: "pagar", includeCreate: false, defaultValue: "" },
    { id: "cr-categoria", tipo: "receber", includeCreate: true, defaultValue: "faturamento" },
    { id: "cr-filtro-categoria", tipo: "receber", includeCreate: false, defaultValue: "" }
  ];
  mappings.forEach(({ id, tipo, includeCreate, defaultValue }) => {
    const select = document.getElementById(id);
    if (!select) return;
    if (includeCreate) {
      select.onchange = () => {
        if (select.value === "__nova__") promptNovaCategoriaConta(tipo, id);
      };
    }
    const previous = select.value;
    const categorias = getCategoriaList(tipo);
    const options = [];
    if (id.includes("filtro")) options.push(`<option value="">Todas as categorias</option>`);
    categorias.forEach((categoria) => {
      options.push(`<option value="${esc(categoria)}">${esc(formatCategoriaLabel(categoria))}</option>`);
    });
    if (includeCreate) options.push(`<option value="__nova__">+ Nova categoria</option>`);
    select.innerHTML = options.join("");
    if (categorias.includes(previous)) select.value = previous;
    else if (previous === "__nova__" && includeCreate) select.value = "__nova__";
    else select.value = defaultValue && categorias.includes(defaultValue) ? defaultValue : (id.includes("filtro") ? "" : (categorias[0] || ""));
  });
}
function renderContaFormaOptions() {
  const mappings = [
    { id: "cp-forma", tipo: "pagar", includeCreate: true, defaultValue: "boleto" },
    { id: "cr-forma", tipo: "receber", includeCreate: true, defaultValue: "boleto" }
  ];
  mappings.forEach(({ id, tipo, includeCreate, defaultValue }) => {
    const select = document.getElementById(id);
    if (!select) return;
    if (includeCreate) {
      select.onchange = () => {
        if (select.value === "__nova_forma__") promptNovaFormaConta(tipo, id);
      };
    }
    const previous = select.value;
    const formas = getFormaList(tipo);
    const options = formas.map((forma) => `<option value="${esc(forma)}">${esc(formatCategoriaLabel(forma))}</option>`);
    if (includeCreate) options.push(`<option value="__nova_forma__">+ Nova forma</option>`);
    select.innerHTML = options.join("");
    if (formas.includes(previous)) select.value = previous;
    else select.value = formas.includes(defaultValue) ? defaultValue : (formas[0] || "boleto");
  });
}
function stripLegacyErpFields(item = {}) {
  const cleaned = { ...item };
  delete cleaned.tinyId;
  delete cleaned.id_tiny;
  delete cleaned._tinyNcm;
  delete cleaned.tinySku;
  delete cleaned.erpStatus;
  delete cleaned.erpSyncAt;
  delete cleaned.pendingTinySync;
  delete cleaned.pendingErpSync;
  delete cleaned.olistId;
  return cleaned;
}
function sanitizeContratoLegacyData(contrato) {
  if (!contrato) return contrato;
  const sanitized = { ...contrato };
  delete sanitized.pendingTinySync;
  delete sanitized.pendingErpSync;
  delete sanitized.tinySyncAt;
  delete sanitized.olistId;
  sanitized.itens = (sanitized.itens || []).map((item, idx) => {
    const cleaned = stripLegacyErpFields(item);
    // AC-9: Preservar skuVinculado como sku principal; não auto-gerar se vazio
    if (cleaned.skuVinculado) cleaned.sku = cleaned.skuVinculado;
    return enrichContratoItemMetadata(sanitized, cleaned, idx);
  });
  return sanitized;
}
function sanitizePedidoLegacyData(pedido) {
  if (!pedido) return pedido;
  const sanitized = { ...pedido };
  delete sanitized.olistId;
  delete sanitized.olistStatus;
  delete sanitized.erpOrderId;
  if (sanitized.status === "concluido") sanitized.status = "faturado";
  sanitized.itens = (sanitized.itens || []).map((item, idx) => stripLegacyErpFields({
    ...item,
    // SKU: preservar skuVinculado (inteligência), não auto-gerar
    sku: item.skuVinculado || item.sku || ""
  }));
  return ensurePedidoFiscalData(sanitized);
}

function promptDataBaixa(message, fallbackIso = new Date().toISOString().slice(0, 10)) {
  const informado = (window.prompt(message, fallbackIso) || "").trim();
  if (!informado) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(informado)) {
    showToast("Informe a data no formato AAAA-MM-DD.", 3500);
    return null;
  }
  return informado;
}
function notifyErpSyncDisabled(context = "Operacao") {
  showToast(`${context}: sincronizacao com Tiny/ERP desativada neste sistema.`, 4500);
}
function getDeletedContractIds() {
  return new Set(unwrapData(JSON.parse(localStorage.getItem(CONTRACTS_DELETED_KEY) || '{"items":[]}')).map((item) => String(item?.id || "")).filter(Boolean));
}
function applyDeletedContractsFilter(items = []) {
  const deletedIds = getDeletedContractIds();
  if (!deletedIds.size) return items;
  return items.filter((item) => !deletedIds.has(String(item?.id || "")));
}
// Mapa localStorage key → tabela Supabase
const _LS_TO_TABLE = {
  'gdp.contratos.v1': 'contratos',
  'gdp.pedidos.v1': 'pedidos',
  'gdp.notas-fiscais.v1': 'notas_fiscais',
  'gdp.contas-receber.v1': 'contas_receber',
  'gdp.contas-pagar.v1': 'contas_pagar',
  'gdp.entregas.provas.v1': 'entregas'
};

function saveWrappedArray(key, items) {
  const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items };
  localStorage.setItem(key, JSON.stringify(wrapped));
  // Gravar no Supabase tabela real (fonte primária)
  const table = _LS_TO_TABLE[key];
  if (table && window.gdpApi && window.gdpApi[table]) {
    window.gdpApi[table].saveAll(items).catch(e => console.warn('[gdpApi] Save failed:', table, e));
  }
  // Cloud save legado (backup)
  cloudSave(key, wrapped).catch(() => {});
  schedulCloudSync();
}
function loadData() {
  let contratosDirty = false;
  let pedidosDirty = false;
  let contasPagarDirty = false;
  let contasReceberDirty = false;
  try { contratosExcluidos = unwrapData(JSON.parse(localStorage.getItem(CONTRACTS_DELETED_KEY))); } catch(_) { contratosExcluidos = []; }
  try {
    const rawContratos = applyDeletedContractsFilter(unwrapData(JSON.parse(localStorage.getItem(CONTRACTS_KEY))));
    contratos = rawContratos.map((item, idx) => {
      const before = JSON.stringify(item);
      const after = sanitizeContratoLegacyData(item);
      if (!contratosDirty && JSON.stringify(after) !== before) contratosDirty = true;
      return after;
    });
  } catch(_) { contratos = []; }
  try {
    const rawPedidos = unwrapData(JSON.parse(localStorage.getItem(ORDERS_KEY)));
    pedidos = rawPedidos.map((item) => {
      const before = JSON.stringify(item);
      const after = sanitizePedidoLegacyData(item);
      if (!pedidosDirty && JSON.stringify(after) !== before) pedidosDirty = true;
      return after;
    });
  } catch(_) { pedidos = []; }
  try { provasEntrega = JSON.parse(localStorage.getItem(PROOFS_KEY)) || []; } catch(_) { provasEntrega = []; }
  try { notasFiscais = unwrapData(JSON.parse(localStorage.getItem(INVOICES_KEY))); } catch(_) { notasFiscais = []; }
  try { notasEntrada = unwrapData(JSON.parse(localStorage.getItem(ENTRY_INVOICES_KEY))); } catch(_) { notasEntrada = []; }
  try { contasPagar = unwrapData(JSON.parse(localStorage.getItem(PAYABLES_KEY))); } catch(_) { contasPagar = []; }
  try { contasReceber = unwrapData(JSON.parse(localStorage.getItem(RECEIVABLES_KEY))); } catch(_) { contasReceber = []; }
  try { contaPagarCategorias = unwrapData(JSON.parse(localStorage.getItem(PAYABLE_CATEGORIES_KEY))); } catch(_) { contaPagarCategorias = []; }
  try { contaReceberCategorias = unwrapData(JSON.parse(localStorage.getItem(RECEIVABLE_CATEGORIES_KEY))); } catch(_) { contaReceberCategorias = []; }
  try { contaPagarFormas = unwrapData(JSON.parse(localStorage.getItem(PAYABLE_METHODS_KEY))); } catch(_) { contaPagarFormas = []; }
  try { contaReceberFormas = unwrapData(JSON.parse(localStorage.getItem(RECEIVABLE_METHODS_KEY))); } catch(_) { contaReceberFormas = []; }
  try { caixaExtratoMovimentos = unwrapData(JSON.parse(localStorage.getItem(CAIXA_STATEMENT_KEY))); } catch(_) { caixaExtratoMovimentos = []; }
  try { estoqueMovimentos = unwrapData(JSON.parse(localStorage.getItem(STOCK_KEY))); } catch(_) { estoqueMovimentos = []; }
  try { estoqueIntelProdutos = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_PRODUCTS_KEY))); } catch(_) { estoqueIntelProdutos = []; }
  try { estoqueIntelEmbalagens = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_PACKAGES_KEY))); } catch(_) { estoqueIntelEmbalagens = []; }
  try { estoqueIntelPedidos = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_ORDERS_KEY))); } catch(_) { estoqueIntelPedidos = []; }
  try { estoqueIntelPedidoItens = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_ORDER_ITEMS_KEY))); } catch(_) { estoqueIntelPedidoItens = []; }
  try { estoqueIntelMovimentacoes = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_MOVES_KEY))); } catch(_) { estoqueIntelMovimentacoes = []; }
  try { estoqueIntelFornecedores = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_SUPPLIERS_KEY))); } catch(_) { estoqueIntelFornecedores = []; }
  try { estoqueIntelCompras = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_PURCHASES_KEY))); } catch(_) { estoqueIntelCompras = []; }
  try { integracoesGdp = unwrapData(JSON.parse(localStorage.getItem(INTEGRATIONS_KEY))); } catch(_) { integracoesGdp = []; }
  contasPagar = contasPagar.map((item) => {
    const categoria = normalizeContaCategoriaRegistro("pagar", item?.categoria);
    const forma = normalizeContaFormaRegistro(item?.forma);
    if (!contasPagarDirty && categoria !== item?.categoria) contasPagarDirty = true;
    if (!contasPagarDirty && forma !== item?.forma) contasPagarDirty = true;
    return { ...item, categoria, forma };
  });
  contasReceber = contasReceber.map((item) => {
    const categoria = normalizeContaCategoriaRegistro("receber", item?.categoria);
    const forma = normalizeContaFormaRegistro(item?.forma);
    if (!contasReceberDirty && categoria !== item?.categoria) contasReceberDirty = true;
    if (!contasReceberDirty && forma !== item?.forma) contasReceberDirty = true;
    return { ...item, categoria, forma };
  });
  contaPagarCategorias = [...new Set([...getDefaultContaPagarCategorias(), ...contaPagarCategorias.map(normalizeCategoriaValue).filter(Boolean)])];
  contaReceberCategorias = [...new Set([...getDefaultContaReceberCategorias(), ...contaReceberCategorias.map(normalizeCategoriaValue).filter(Boolean)])];
  contaPagarFormas = [...new Set([...getDefaultContaFormas(), ...contaPagarFormas.map(normalizeCategoriaValue).filter(Boolean)])];
  contaReceberFormas = [...new Set([...getDefaultContaFormas(), ...contaReceberFormas.map(normalizeCategoriaValue).filter(Boolean)])];
  const estoqueIntelHasPersistedData = [
    ESTOQUE_INTEL_PRODUCTS_KEY,
    ESTOQUE_INTEL_PACKAGES_KEY,
    ESTOQUE_INTEL_ORDERS_KEY,
    ESTOQUE_INTEL_ORDER_ITEMS_KEY,
    ESTOQUE_INTEL_MOVES_KEY,
    ESTOQUE_INTEL_SUPPLIERS_KEY,
    ESTOQUE_INTEL_PURCHASES_KEY
  ].some((key) => localStorage.getItem(key) !== null);
  if (!estoqueIntelHasPersistedData && !estoqueIntelProdutos.length && !estoqueIntelEmbalagens.length && !estoqueIntelMovimentacoes.length && !estoqueIntelFornecedores.length) {
    const seed = getDefaultEstoqueIntelSeed();
    estoqueIntelProdutos = seed.produtos;
    estoqueIntelEmbalagens = seed.embalagens;
    estoqueIntelFornecedores = seed.fornecedores;
    estoqueIntelPedidos = seed.pedidos;
    estoqueIntelPedidoItens = seed.pedidoItens;
    estoqueIntelMovimentacoes = seed.movimentacoes;
    estoqueIntelCompras = seed.compras;
    saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
    saveWrappedArray(ESTOQUE_INTEL_PACKAGES_KEY, estoqueIntelEmbalagens);
    saveWrappedArray(ESTOQUE_INTEL_ORDERS_KEY, estoqueIntelPedidos);
    saveWrappedArray(ESTOQUE_INTEL_ORDER_ITEMS_KEY, estoqueIntelPedidoItens);
    saveWrappedArray(ESTOQUE_INTEL_MOVES_KEY, estoqueIntelMovimentacoes);
    saveWrappedArray(ESTOQUE_INTEL_SUPPLIERS_KEY, estoqueIntelFornecedores);
    saveWrappedArray(ESTOQUE_INTEL_PURCHASES_KEY, estoqueIntelCompras);
  }
  syncPedidosGDPToEstoqueIntel(true);
  // Story 4.43: load equivalencias/demandas/estoque data layer
  loadGdpEquivalencias();
  loadGdpConversoes();
  loadGdpDemandas();
  loadGdpEstoqueSimples();
  loadGdpListaCompras();
  if (contratosDirty) saveWrappedArray(CONTRACTS_KEY, contratos);
  if (pedidosDirty) saveWrappedArray(ORDERS_KEY, pedidos);
  if (contasPagarDirty) saveWrappedArray(PAYABLES_KEY, contasPagar);
  if (contasReceberDirty) saveWrappedArray(RECEIVABLES_KEY, contasReceber);
}
function saveContratos() {
  contratos = applyDeletedContractsFilter(contratos).map(sanitizeContratoLegacyData);
  saveWrappedArray(CONTRACTS_KEY, contratos);
}
function saveContratosExcluidos() { saveWrappedArray(CONTRACTS_DELETED_KEY, contratosExcluidos); }
function registrarContratoExcluido(contrato) {
  if (!contrato?.id) return;
  const exists = contratosExcluidos.find((item) => String(item?.id || "") === String(contrato.id));
  if (exists) return;
  contratosExcluidos.push({
    id: contrato.id,
    escola: contrato.escola || "",
    deletedAt: new Date().toISOString(),
    deletedBy: getAuditActor()
  });
  saveContratosExcluidos();
}
function savePedidos() {
  pedidos = pedidos.map(sanitizePedidoLegacyData);
  saveWrappedArray(ORDERS_KEY, pedidos);
  syncPedidosGDPToEstoqueIntel(true);
}
function saveNotasFiscais() { saveWrappedArray(INVOICES_KEY, notasFiscais); }

// Utilitário: limpar TODAS as notas e resetar counter
window.limparNotasRejeitadas = function() {
  const antes = notasFiscais.length;
  // Remover TODAS as notas (nuclear reset)
  notasFiscais = [];
  saveNotasFiscais();
  // Limpar referências em TODOS os pedidos
  pedidos.forEach(p => { delete p.notaFiscalId; delete p.notaFiscal; delete p.nfGerada; });
  savePedidos();
  // Limpar contas a receber
  contasReceber = [];
  saveContasReceber();
  // Resetar counter
  localStorage.setItem("gdp.nf-counter", "1200");
  // Forçar sync para nuvem com dados limpos
  if (typeof scheduleGdpCloudSync === "function") scheduleGdpCloudSync();
  alert("RESET COMPLETO:\\n- " + antes + " notas removidas\\n- Referencias nos pedidos limpas\\n- Counter: proximo = 1201\\n\\nRecarregue a pagina (F5) e gere a nota novamente.");
  renderAll();
};
function saveNotasEntrada() { saveWrappedArray(ENTRY_INVOICES_KEY, notasEntrada); }
function saveContasPagar() { saveWrappedArray(PAYABLES_KEY, contasPagar); }
function saveContasReceber() { saveWrappedArray(RECEIVABLES_KEY, contasReceber); }
function saveCaixaExtrato() { saveWrappedArray(CAIXA_STATEMENT_KEY, caixaExtratoMovimentos); }
function saveEstoqueMovimentos() { saveWrappedArray(STOCK_KEY, estoqueMovimentos); }
function saveEstoqueIntelProdutos() { saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos); }
function saveEstoqueIntelEmbalagens() { saveWrappedArray(ESTOQUE_INTEL_PACKAGES_KEY, estoqueIntelEmbalagens); }
function saveEstoqueIntelPedidos() { saveWrappedArray(ESTOQUE_INTEL_ORDERS_KEY, estoqueIntelPedidos); }
function saveEstoqueIntelPedidoItens() { saveWrappedArray(ESTOQUE_INTEL_ORDER_ITEMS_KEY, estoqueIntelPedidoItens); }
function saveEstoqueIntelMovimentacoes() { saveWrappedArray(ESTOQUE_INTEL_MOVES_KEY, estoqueIntelMovimentacoes); }
function saveEstoqueIntelFornecedores() { saveWrappedArray(ESTOQUE_INTEL_SUPPLIERS_KEY, estoqueIntelFornecedores); }
function saveEstoqueIntelCompras() { saveWrappedArray(ESTOQUE_INTEL_PURCHASES_KEY, estoqueIntelCompras); }

function entregaEstoqueIntelJaBaixada(pedidoId) {
  return estoqueIntelMovimentacoes.some((mov) => mov.origem === "entrega_concluida" && mov.referencia_id === pedidoId);
}

function reservaEstoqueIntelJaEncerradaManualmente(pedidoId) {
  return estoqueIntelMovimentacoes.some((mov) => mov.origem === "reserva_encerrada_manual" && mov.referencia_id === pedidoId);
}

function aplicarBaixaEntregaAoEstoqueIntel(pedidoId) {
  const pedido = pedidos.find((item) => item.id === pedidoId);
  if (!pedidoId || !pedido) return { ok: false, motivo: "pedido_nao_encontrado" };
  if (entregaEstoqueIntelJaBaixada(pedidoId)) return { ok: true, motivo: "ja_baixada" };
  const demanda = estoqueIntelPedidos.find((item) => item.id === pedidoId && item.origem_sistema === "gdp_pedido");
  if (!demanda) return { ok: false, motivo: "demanda_nao_encontrada" };
  const itensDemanda = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  if (!itensDemanda.length) return { ok: false, motivo: "itens_nao_encontrados" };
  itensDemanda.forEach((item, idx) => {
    const quantidade = Number(item.quantidade_base || 0);
    if (!item.produto_id || !quantidade) return;
    estoqueIntelMovimentacoes.push({
      id: `ENT-MOV-FIS-${pedidoId}-${idx + 1}`,
      produto_id: item.produto_id,
      tipo: "fisico",
      operacao: "-",
      quantidade,
      origem: "entrega_concluida",
      origem_sistema: "gdp_entrega",
      data: new Date().toISOString(),
      referencia_id: pedidoId
    });
    estoqueIntelMovimentacoes.push({
      id: `ENT-MOV-COM-${pedidoId}-${idx + 1}`,
      produto_id: item.produto_id,
      tipo: "comprometido",
      operacao: "-",
      quantidade,
      origem: "entrega_concluida",
      origem_sistema: "gdp_entrega",
      data: new Date().toISOString(),
      referencia_id: pedidoId
    });
  });
  demanda.status = "entregue";
  pedido.status = "entregue";
  savePedidos();
  saveEstoqueIntelPedidos();
  saveEstoqueIntelMovimentacoes();
  return { ok: true, motivo: "baixa_realizada" };
}

function getEstoqueIntelReservaStatus(pedidoId) {
  const demanda = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  if (!demanda) {
    return {
      key: "sem_demanda",
      label: "Sem demanda",
      badgeClass: "badge-red",
      detail: "Pedido ainda nao virou reserva no Estoque Intel."
    };
  }
  if (entregaEstoqueIntelJaBaixada(pedidoId)) {
    return {
      key: "baixada",
      label: "Entrega baixada",
      badgeClass: "badge-green",
      detail: "Entrega concluida com baixa da reserva e do estoque fisico."
    };
  }
  if (reservaEstoqueIntelJaEncerradaManualmente(pedidoId) || demanda.status === "reserva_encerrada_manual") {
    return {
      key: "encerrada_manual",
      label: "Reserva cancelada",
      badgeClass: "badge-blue",
      detail: "Necessidade encerrada manualmente, sem baixa do estoque fisico."
    };
  }
  return {
    key: "reservada",
    label: "Aguardando entrega",
    badgeClass: "badge-yellow",
    detail: "Reserva ativa aguardando conclusao da entrega."
  };
}

function getEntregaReservaResumo(pedidoId) {
  const itens = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  const totalBase = itens.reduce((sum, item) => sum + Number(item.quantidade_base || 0), 0);
  const produtos = itens.map((item) => {
    const produto = findEstoqueIntelProduto(item.produto_id);
    return produto?.nome || item.produto_id;
  }).filter(Boolean);
  const baixaMovs = estoqueIntelMovimentacoes.filter((mov) => mov.referencia_id === pedidoId && mov.origem === "entrega_concluida");
  const baixaManual = baixaMovs.length > 0;
  return {
    totalBase,
    produtosResumo: produtos.slice(0, 2).join(", ") + (produtos.length > 2 ? ` +${produtos.length - 2}` : ""),
    baixaManual,
    itensCount: itens.length
  };
}
function saveIntegracoesGdp() { saveWrappedArray(INTEGRATIONS_KEY, integracoesGdp); }

function normalizeSchoolName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(caixa|escolar|escola|municipal|estadual|de|do|da|dos|das|e|orgao)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSuggestedLogin(nome) {
  const base = String(nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return base || `cliente-${Date.now().toString(36)}`;
}

function findClienteBySchoolName(nomeEscola) {
  const alvo = normalizeSchoolName(nomeEscola);
  if (!alvo) return null;
  let best = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const usuario of usuarios) {
    const candidato = normalizeSchoolName(usuario.nome);
    if (!candidato) continue;
    let score = 0;
    if (candidato === alvo) score = 100;
    else if (candidato.startsWith(alvo) || alvo.startsWith(candidato)) score = 92;
    else if (candidato.includes(alvo) || alvo.includes(candidato)) score = 84;
    else {
      const alvoTokens = alvo.split(" ").filter(Boolean);
      const candTokens = new Set(candidato.split(" ").filter(Boolean));
      const common = alvoTokens.filter((token) => candTokens.has(token)).length;
      if (common >= Math.max(2, Math.ceil(alvoTokens.length * 0.6))) score = 70 + common;
    }
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = usuario;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (bestScore < 84) return null;
  if (bestScore - secondScore < 6 && bestScore < 100) return null;
  return best;
}

function buildAutoSku(contratoId, item, idx) {
  const prefix = String(contratoId || "GDP").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-4) || "GDP";
  const base = normalizeSchoolName(item?.descricao || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((token) => token.slice(0, 4).toUpperCase())
    .filter(Boolean);
  return [prefix, String(item?.num || idx + 1).padStart(3, "0"), ...(base.length ? base : ["ITEM"])].join("-");
}

function isLegacyExternalSku(value) {
  const sku = String(value || "").trim().toUpperCase();
  if (!sku) return false;
  return /^\d{8,}$/.test(sku) || sku.startsWith("TINY") || sku.startsWith("ERP");
}

function normalizeInternalSku(scopeId, item, idx) {
  return buildAutoSku(scopeId, item, idx);
}

function enrichContratoItemMetadata(contrato, item, idx) {
  if (!contrato || !item) return item;
  loadBancoProdutos();
  const bp = bancoProdutos.itens || [];
  const descNorm = (item.descricao || "").toUpperCase().trim();
  let match = null;
  if (item.sku && !isLegacyExternalSku(item.sku)) match = bp.find((prod) => prod.sku && prod.sku.toUpperCase() === item.sku.toUpperCase());
  if (!match) match = bp.find((prod) => (prod.descricao || "").toUpperCase().trim() === descNorm);
  if (!item.ncm) {
    const local = findNcmLocal(item.descricao);
    if (local?.ncm) item.ncm = local.ncm;
    else if (match?.ncm) item.ncm = match.ncm;
  }
  if (!item.unidade && match?.unidade) item.unidade = match.unidade;
  // AC-9: Se item já tem skuVinculado (da Inteligência), usar como sku principal. Senão, deixar vazio (sem auto-gerar).
  if (item.skuVinculado) {
    item.sku = item.skuVinculado;
  } else if (!item.sku) {
    item.sku = '';
  }
  return item;
}

function syncContratoItemToPedidos(contratoId, itemAtualizado) {
  if (!contratoId || !itemAtualizado) return;
  let touched = false;
  pedidos.forEach((pedido) => {
    if (pedido.contratoId !== contratoId) return;
    (pedido.itens || []).forEach((itemPedido) => {
      const sameItem = String(itemPedido.itemNum || "") === String(itemAtualizado.num || "")
        || ((itemPedido.descricao || "").toUpperCase().trim() === (itemAtualizado.descricao || "").toUpperCase().trim());
      if (!sameItem) return;
      itemPedido.descricao = itemAtualizado.descricao || itemPedido.descricao || "";
      itemPedido.ncm = itemAtualizado.ncm || itemPedido.ncm || "";
      itemPedido.sku = itemAtualizado.sku || itemPedido.sku || "";
      itemPedido.unidade = itemAtualizado.unidade || itemPedido.unidade || "UN";
      if (!itemPedido.precoUnitario) itemPedido.precoUnitario = Number(itemAtualizado.precoUnitario || 0);
      touched = true;
    });
  });
  if (touched) savePedidos();
}

function ensureContratoItensMetadata(contrato) {
  if (!contrato?.itens) return;
  let touched = false;
  contrato.itens.forEach((item, idx) => {
    const before = `${item.ncm || ""}|${item.sku || ""}|${item.unidade || ""}`;
    enrichContratoItemMetadata(contrato, item, idx);
    const after = `${item.ncm || ""}|${item.sku || ""}|${item.unidade || ""}`;
    if (before !== after) {
      touched = true;
      syncContratoItemToPedidos(contrato.id, item);
    }
  });
  if (touched) saveContratos();
}

function getContratoItemForPedidoItem(contratoId, itemPedido) {
  const contrato = contratos.find((item) => item.id === contratoId);
  if (!contrato || !itemPedido) return null;
  ensureContratoItensMetadata(contrato);
  return contrato.itens.find((item) =>
    String(item.num || "") === String(itemPedido.itemNum || "")
    || ((item.descricao || "").toUpperCase().trim() === (itemPedido.descricao || "").toUpperCase().trim())
  ) || null;
}

function getClientesVinculadosAoContrato(contratoId) {
  const contrato = contratos.find((item) => item.id === contratoId);
  const clientes = new Map();
  if (contrato?.escolaClienteId) {
    const principal = usuarios.find((user) => user.id === contrato.escolaClienteId);
    if (principal) clientes.set(principal.id, principal);
  }
  usuarios.forEach((user) => {
    if ((user.contratos_vinculados || []).includes(contratoId)) clientes.set(user.id, user);
  });
  return [...clientes.values()];
}

function getClientePrincipalDoContrato(contratoId) {
  return getClientesVinculadosAoContrato(contratoId)[0] || null;
}

function buildClienteFiscalSnapshot(cliente, fallbackNome = "") {
  const source = cliente || {};
  return {
    id: source.id || "",
    nome: source.nome || fallbackNome || "",
    cnpj: source.cnpj || "",
    ie: source.ie || "ISENTO",
    email: source.email || "",
    telefone: source.telefone || "",
    logradouro: source.logradouro || "",
    numero: source.numero || "",
    complemento: source.complemento || "",
    bairro: source.bairro || "",
    cep: source.cep || "",
    cidade: source.municipio || source.cidade || "",
    uf: source.uf || "MG",
    indicador_contribuinte: source.indicador_contribuinte || "9"
  };
}

function getClienteFiscalSnapshotDoContrato(contratoId) {
  const contrato = contratos.find((item) => item.id === contratoId);
  if (!contrato) return null;
  const principal = getClientePrincipalDoContrato(contratoId);
  if (principal) {
    contrato.clienteSnapshot = buildClienteFiscalSnapshot(principal, contrato.escola || "");
    return contrato.clienteSnapshot;
  }
  if (contrato.clienteSnapshot?.nome || contrato.clienteSnapshot?.cnpj) {
    return { ...buildClienteFiscalSnapshot(null, contrato.escola || ""), ...contrato.clienteSnapshot };
  }
  if (contrato.escola) return buildClienteFiscalSnapshot(null, contrato.escola);
  return null;
}

function vincularClienteManual(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const escolaInput = document.getElementById("ctr-escola-" + contratoId);
  const nomeEscola = escolaInput ? escolaInput.value.trim() : c.escola;
  if (!nomeEscola) { alert("Informe o nome da escola."); return; }

  // Buscar cliente por nome
  const norm = nomeEscola.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let cliente = usuarios.find(u => (u.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(norm) || norm.includes((u.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));

  if (!cliente) {
    if (!confirm(`Cliente "${nomeEscola}" não encontrado. Criar automaticamente?`)) return;
    cliente = {
      id: "cli-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
      nome: nomeEscola, cnpj: "", municipio: c.municipio || "", contribuinte_icms: "9",
      responsavel: "", email: "", telefone: "", uf: "MG", tipo: "escola",
      contratos_vinculados: [], criadoEm: new Date().toISOString().slice(0, 10), origem: "vinculo-manual",
    };
    usuarios.push(cliente);
  }

  vincularClienteAoContrato(c, cliente);
  c.escola = nomeEscola;
  saveData();

  const info = document.getElementById("ctr-cliente-info-" + contratoId);
  if (info) info.innerHTML = '✓ Vinculado: ' + esc(cliente.nome);
  showToast("Cliente vinculado: " + cliente.nome);
}

function vincularClienteAoContrato(contrato, cliente) {
  if (!contrato || !cliente) return null;
  contrato.escolaClienteId = cliente.id;
  contrato.escola = cliente.nome || contrato.escola;
  contrato.clienteSnapshot = buildClienteFiscalSnapshot(cliente, contrato.escola || "");
  if (!Array.isArray(cliente.contratos_vinculados)) cliente.contratos_vinculados = [];
  if (!cliente.contratos_vinculados.includes(contrato.id)) cliente.contratos_vinculados.push(contrato.id);
  return cliente;
}

function sugerirClienteContrato(nomeEscola) {
  const cliente = findClienteBySchoolName(nomeEscola);
  const info = document.getElementById("mc-cliente-info");
  if (!info) return cliente;
  const nome = String(nomeEscola || "").trim();
  if (!nome) {
    info.innerHTML = "Selecione um cliente ja cadastrado ou digite um nome para localizar.";
    info.style.color = "var(--mut)";
    return null;
  }
  if (!cliente) {
    info.innerHTML = "Cliente nao localizado. O cadastro sera exigido antes de criar o contrato.";
    info.style.color = "var(--yellow)";
    return null;
  }
  const resumo = [cliente.cnpj || "", cliente.municipio || "", cliente.uf || ""].filter(Boolean).join(" | ");
  info.innerHTML = `Cliente vinculado automaticamente: <strong>${esc(cliente.nome)}</strong>${resumo ? ` <span style="color:var(--dim)">(${esc(resumo)})</span>` : ""}`;
  info.style.color = "var(--green)";
  return cliente;
}

function abrirCadastroClienteParaContrato(draft) {
  pendingContratoDraft = { ...(draft || {}) };
  switchTab("usuarios");
  renderFormUsuario(null, {
    nome: draft?.escola || "",
    login: buildSuggestedLogin(draft?.escola || ""),
    uf: "MG",
    ie: "ISENTO"
  });
  document.getElementById("modal-usuario").classList.remove("hidden");
  showToast("Cadastre o cliente antes de criar o contrato.", 4000);
}

// Stubs — overridden by later modules
function syncPedidosGDPToEstoqueIntel(silent) {}
function renderAll() {}
function renderContratos() {}
function renderPedidos() {}
function renderNotasFiscais() {}
function renderEstoque() {}
function renderEntregas() {}
function renderContasPagar() {}
function renderContasReceber() {}
function renderRelatorios() {}
function renderUsuarios() {}
function renderBancoProdutos() {}
