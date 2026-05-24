// ===== GDP CORE — extracted from gdp-contratos.html =====
// Infrastructure: sidebar, constants, data layer, cloud sync, state, storage helpers,
// save/load, sanitizers, normalization, client/escola utils, SKU/item enrichment.

// ===== CONDITIONAL LOGGER (Story 12.1 AC2) =====
// Em producao: silencioso. Para debug: localStorage.setItem('gdp.debug', 'true')
const _GDP_DEBUG = localStorage.getItem('gdp.debug') === 'true';
const gdpLog = _GDP_DEBUG ? console.log.bind(console, '[GDP]') : function() {};
const gdpWarn = _GDP_DEBUG ? console.warn.bind(console, '[GDP]') : function() {};

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

// ===== EQUIVALENCIAS / ESTOQUE DATA LAYER =====
const GDP_EQUIV_KEY = "gdp.equivalencias.v1";
const GDP_CONVERSOES_KEY = "gdp.conversoes.v1"; // FR-013: será removido na Wave 4
// FR-008: Demanda removida — pedido é a unidade central do sistema
const GDP_DEMANDAS_KEY = "gdp.demandas.v1"; // kept for cleanup only
const GDP_ESTOQUE_SIMPLES_KEY = "gdp.estoque.v1";
const GDP_COMPRAS_KEY = "gdp.lista-compras.v1";
let gdpEquivalencias = {};
let gdpConversoes = {};
let gdpDemandas = []; // FR-008: deprecated, kept as empty array
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

// ===== SUPABASE CLOUD SYNC (uses centralized config from supabase-config.js) =====
const SUPABASE_URL = window.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SUPABASE_KEY = window.SUPABASE_KEY || "sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR";
// Entidades com tabela Supabase real — NÃO sincronizar via sync_data (gdpApi cuida)
const _SUPABASE_TABLE_KEYS = new Set([CONTRACTS_KEY, ORDERS_KEY, INVOICES_KEY, RECEIVABLES_KEY, PAYABLES_KEY, PROOFS_KEY, "gdp.usuarios.v1"]);
const GDP_SYNC_KEYS = [CONTRACTS_DELETED_KEY, ENTRY_INVOICES_KEY, PAYABLE_CATEGORIES_KEY, RECEIVABLE_CATEGORIES_KEY, PAYABLE_METHODS_KEY, RECEIVABLE_METHODS_KEY, CAIXA_STATEMENT_KEY, STOCK_KEY, ESTOQUE_INTEL_PRODUCTS_KEY, ESTOQUE_INTEL_PACKAGES_KEY, ESTOQUE_INTEL_ORDERS_KEY, ESTOQUE_INTEL_ORDER_ITEMS_KEY, ESTOQUE_INTEL_MOVES_KEY, ESTOQUE_INTEL_SUPPLIERS_KEY, ESTOQUE_INTEL_PURCHASES_KEY, INTEGRATIONS_KEY, "caixaescolar.banco.v1", GDP_EQUIV_KEY, GDP_CONVERSOES_KEY, GDP_DEMANDAS_KEY, GDP_ESTOQUE_SIMPLES_KEY, GDP_COMPRAS_KEY, "nexedu.config.contas-bancarias", "nexedu.config.fiscal", "nexedu.config.bank-api", "nexedu.empresa", "gdp.extratos.v1", "gdp.conciliacao.v1"];
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

async function cloudSave(key, data, signal) {
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
      body: JSON.stringify({ user_id: userId, key, data, updated_at: new Date().toISOString() }),
      signal: signal || undefined
    });
    if (!resp.ok && resp.status !== 201 && resp.status !== 200) {
      gdpWarn(`[CloudSave] ${key} failed: ${resp.status}`, await resp.text().catch(() => ""));
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    gdpWarn("Cloud save failed:", key, e);
  }
}

async function cloudLoadAll() {
  // Story 14.1/14.3: try primary syncUserId first, only fallback if empty
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
  const primary = getSyncUserId();

  // Fast path: try primary identity first (avoids N unnecessary requests)
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(primary)}&select=key,data,updated_at`,
      { headers }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        persistResolvedGdpSyncUser(primary);
        return rows;
      }
    }
  } catch (e) {
    gdpWarn("Cloud load failed (primary):", primary, e);
  }

  // Slow fallback: try remaining candidates sequentially
  for (const userId of getGdpSyncUserCandidates()) {
    if (userId === primary) continue;
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
      gdpWarn("Cloud load failed:", userId, e);
    }
  }
  return null;
}

function getDataTimestamp(data, fallback = "") {
  const source = data?.updatedAt || data?.updated_at || fallback || "";
  if (!source) return 0;
  const time = new Date(source).getTime();
  return (Number.isFinite(time) && time > 0) ? time : 0;
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
        gdpLog("[Sync Merge] Mantendo local para", localEntry.id, "— local:", localItensCount, "itens, cloud:", cloudItensCount);
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
  // Keys gerenciadas pelo gdpApi (tabelas reais) — ignorar no sync legado
  const _GDPAPI_KEYS = new Set(['gdp.contratos.v1','gdp.pedidos.v1','gdp.notas-fiscais.v1','gdp.contas-receber.v1','gdp.contas-pagar.v1','gdp.entregas.provas.v1','gdp.usuarios.v1']);
  for (const row of rows) {
    if (_GDPAPI_KEYS.has(row.key)) continue; // managed by gdpApi, skip legacy sync
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
    let incomingData = row.key === CONTRACTS_KEY
      ? { ...(row.data), items: applyDeletedContractsFilter(unwrapData(row.data)) }
      : row.data;

    // Story 4.65: convert legacy array to wrapped format for conciliacao/extratos
    // (mirror of app-sync.js:184-186 protection — Story 4.64 invariant #2)
    if ((row.key === 'gdp.conciliacao.v1' || row.key === 'gdp.extratos.v1') && Array.isArray(incomingData)) {
      incomingData = { _v: 1, updatedAt: row.updated_at || new Date().toISOString(), items: incomingData };
    }

    // Story 4.65: filter out locally-deleted items before writing
    // (mirror of app-sync.js:159-182 protection — Story 4.64 invariant #6)
    const _delKeyMap = {
      'gdp.conciliacao.v1': 'gdp.conciliacao.deleted.v1',
      'gdp.extratos.v1': 'gdp.extratos.deleted.v1',
      'gdp.notas-entrada.v1': 'gdp.notas-entrada.deleted.v1',
      'gdp.estoque-intel.fornecedores.v1': 'gdp.estoque-intel.fornecedores.deleted.v1'
    };
    const _delKey = _delKeyMap[row.key];
    if (_delKey) {
      let deletedIds;
      try { deletedIds = new Set(JSON.parse(localStorage.getItem(_delKey) || '[]')); } catch (_) { deletedIds = new Set(); }
      if (deletedIds.size > 0) {
        const items = incomingData?.items || (Array.isArray(incomingData) ? incomingData : null);
        if (items) {
          const filtered = items.filter(it => !deletedIds.has(it.id));
          if (incomingData?.items) incomingData = { ...incomingData, items: filtered };
          else incomingData = filtered;
        }
      }
    }

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
      gdpLog("[Sync] Bloqueado: local tem mais entries que cloud para", row.key, "local:", localItems, "cloud:", cloudItems);
      continue;
    }

    // Story 2.1: se cloud tem menos itens nested (produtos em pedidos), NÃO sobrescrever
    if (localDeepItens > 0 && !cloudHasMoreDeepContent) {
      gdpLog("[Sync] Bloqueado: local tem mais itens nested que cloud para", row.key, "localDeep:", localDeepItens, "cloudDeep:", cloudDeepItens);
      // Merge: manter pedidos locais que têm mais itens, aceitar rest do cloud
      if (localArr.length > 0 && cloudArr.length > 0 && localData?.items) {
        const merged = mergeArraysPreservingItens(localArr, cloudArr);
        const mergedData = { ...incomingData, items: merged, updatedAt: new Date().toISOString() };
        localStorage.setItem(row.key, JSON.stringify(mergedData));
        gdpLog("[Sync] Merge concluído para", row.key, "— preservou itens locais mais completos");
        synced++;
      }
      continue;
    }

    // Story 4.65: dirty window protection — skip overwrite if local was saved recently (5s)
    const msSinceLocalSave = Date.now() - getLastLocalSave(row.key);
    if (msSinceLocalSave < 5000) {
      gdpLog("[Sync] SKIP overwrite for", row.key, "- local save", msSinceLocalSave, "ms ago (dirty window)");
      continue;
    }

    // Story 4.65: conciliacao/extratos usam timestamp (nao isSharedKey) para respeitar exclusoes locais
    // (mirror of app-sync.js:150-154 protection — Story 4.64 invariant #3)
    const useTimestampOnly = row.key === 'gdp.conciliacao.v1' || row.key === 'gdp.extratos.v1';
    const shouldWrite = useTimestampOnly
      ? (cloudTime > localTime || (!localTime && cloudTime === 0))
      : ((isSharedKey && cloudHasMoreContent && cloudHasMoreDeepContent) || (cloudTime > localTime && cloudHasMoreDeepContent) || (!localTime && cloudTime === 0));
    if (shouldWrite) {
      localStorage.setItem(row.key, JSON.stringify(incomingData));
      synced++;
    }
  }
  return { restored: synced > 0, rowCount: rows.length, source: "cloud", lastSyncAt: newest };
}

async function syncToCloud(signal) {
  setGdpSyncState({ status: "syncing", source: "cloud", detail: "Publicando alteracoes locais" });
  const promises = GDP_SYNC_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve();
    try {
      const data = JSON.parse(raw);
      // Story 4.64: never upload conciliacao/extratos in legacy array format
      if ((key === 'gdp.conciliacao.v1' || key === 'gdp.extratos.v1') && Array.isArray(data)) {
        return Promise.resolve();
      }
      // Guard: skip empty data UNLESS it has a recent updatedAt (legitimate deletion)
      const hasRecentUpdate = data?.updatedAt && (Date.now() - new Date(data.updatedAt).getTime()) < 300000;
      if (!hasRecentUpdate) {
        if (Array.isArray(data) && data.length === 0) return Promise.resolve();
        if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return Promise.resolve();
      }
      return cloudSave(key, data, signal);
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
let _gdpSyncAbort = null;
function schedulCloudSync() {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  if (_gdpSyncAbort) _gdpSyncAbort.abort();
  setGdpSyncState({ status: "pending", source: "cloud", detail: "Aguardando envio automatico" });
  _syncTimeout = setTimeout(() => {
    _gdpSyncAbort = new AbortController();
    syncToCloud(_gdpSyncAbort.signal).catch(() => {});
  }, 2000);
}

async function forcarSyncCompleto() {
  try {
    // Story 4.61: limpar dados locais que podem estar obsoletos antes de puxar do cloud
    setGdpSyncState({ status: "syncing", detail: "Limpando cache local..." });
    showToast("Sync: limpando cache e baixando dados do cloud...", 2000);
    // Limpar conciliação/extratos locais para garantir versão do cloud
    localStorage.removeItem("gdp.conciliacao.v1");
    localStorage.removeItem("gdp.conciliacao.deleted.v1");
    localStorage.removeItem("gdp.extratos.v1");
    localStorage.removeItem("gdp.notas-entrada.v1");
    localStorage.removeItem("gdp.estoque-intel.fornecedores.v1");
    const result = await syncFromCloud({ force: true });

    // Também fazer full load das tabelas dedicadas do Supabase (pedidos, contratos, etc.)
    if (window.gdpApi) {
      const tables = ['contratos', 'pedidos', 'notas_fiscais', 'contas_receber', 'contas_pagar', 'entregas'];
      for (const table of tables) {
        try {
          if (window.gdpApi[table] && window.gdpApi[table].list) {
            const rows = await window.gdpApi[table].list();
            if (Array.isArray(rows)) {
              gdpLog('[ForceSync] ' + table + ': ' + rows.length + ' rows from Supabase');
            }
          }
        } catch(_) {}
      }
    }

    loadData();
    renderAll();
    if (result.restored) {
      showToast("Sync completo! " + result.rowCount + " chaves sincronizadas.", 5000);
    } else {
      showToast("Sync completo — dados atualizados.", 3000);
    }
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
      { id: "PROD-ARROZ", nome: "Arroz", unidade_base: "UN", produto_critico: false },
      { id: "PROD-BOLACHA", nome: "Bolacha agua e sal", unidade_base: "g", produto_critico: true },
      { id: "PROD-SUCO", nome: "Suco integral", unidade_base: "UN", produto_critico: false }
    ],
    embalagens: [],
    fornecedores: [],
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
    // FR-005: SKU vem exclusivamente de produto_vinculado_id/skuVinculado (manual).
    // Sem auto-match. Se não tem vínculo manual, sku fica vazio.
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
    // FR-005: SKU somente de vínculo manual (skuVinculado), sem auto-match
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

// Story 4.65: dirty window protection — track last local save timestamp per key
const _lastLocalSave = {};
function getLastLocalSave(key) { return _lastLocalSave[key] || 0; }

function saveWrappedArray(key, items) {
  const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items };
  localStorage.setItem(key, JSON.stringify(wrapped));
  // Story 4.65: registrar timestamp do save local para dirty window protection
  _lastLocalSave[key] = Date.now();
  // Gravar no Supabase tabela real (fonte primária)
  const table = _LS_TO_TABLE[key];
  if (table && window.gdpApi && window.gdpApi[table]) {
    window.gdpApi[table].saveAll(items).catch(e => gdpWarn('[gdpApi] Save failed:', table, e));
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
  // Auto-cleanup: re-save NFs to strip heavy data from authorized NFs (prevents localStorage quota exceeded)
  if (notasFiscais.length > 0) { try { saveNotasFiscais(); } catch(_) {} }
  try { notasEntrada = unwrapData(JSON.parse(localStorage.getItem(ENTRY_INVOICES_KEY))); } catch(_) { notasEntrada = []; }
  try { contasPagar = unwrapData(JSON.parse(localStorage.getItem(PAYABLES_KEY))); } catch(_) { contasPagar = []; }
  try { contasReceber = unwrapData(JSON.parse(localStorage.getItem(RECEIVABLES_KEY))); } catch(_) { contasReceber = []; }

  // FIX DEFINITIVO: filtrar itens deletados de TODAS as entidades no boot
  // Isso garante que mesmo que o Supabase ou sync_data restaure itens, eles são removidos imediatamente
  var _delFilterMap = {
    'gdp.notas-fiscais.deleted.v1': function() { var before = notasFiscais.length; notasFiscais = notasFiscais.filter(function(x) { return !_delIds.has(x.id); }); return before - notasFiscais.length; },
    'gdp.contas-receber.deleted.v1': function() { var before = contasReceber.length; contasReceber = contasReceber.filter(function(x) { return !_delIds.has(x.id); }); return before - contasReceber.length; },
    'gdp.contas-pagar.deleted.v1': function() { var before = contasPagar.length; contasPagar = contasPagar.filter(function(x) { return !_delIds.has(x.id); }); return before - contasPagar.length; },
    'gdp.notas-entrada.deleted.v1': function() { var before = notasEntrada.length; notasEntrada = notasEntrada.filter(function(x) { return !_delIds.has(x.id); }); return before - notasEntrada.length; },
    'gdp.contratos.deleted.v1': function() { var before = contratos.length; contratos = contratos.filter(function(x) { return !_delIds.has(x.id); }); return before - contratos.length; },
    'gdp.pedidos.deleted.v1': function() { var before = pedidos.length; pedidos = pedidos.filter(function(x) { return !_delIds.has(x.id); }); return before - pedidos.length; }
  };
  var _delIds;
  for (var _delKey in _delFilterMap) {
    try {
      var _delArr = JSON.parse(localStorage.getItem(_delKey) || '[]');
      if (_delArr.length > 0) {
        _delIds = new Set(_delArr);
        var removed = _delFilterMap[_delKey]();
        if (removed > 0) gdpLog('[boot] Filtered ' + removed + ' deleted items from ' + _delKey);
      }
    } catch(_) {}
  }
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
  // FIX: filtrar fornecedores deletados
  try {
    var _delFornArr = JSON.parse(localStorage.getItem('gdp.estoque-intel.fornecedores.deleted.v1') || '[]');
    if (_delFornArr.length > 0) { var _delFornSet = new Set(_delFornArr); var _bforn = estoqueIntelFornecedores.length; estoqueIntelFornecedores = estoqueIntelFornecedores.filter(function(x) { return !_delFornSet.has(x.id); }); if (_bforn > estoqueIntelFornecedores.length) gdpLog('[boot] Filtered ' + (_bforn - estoqueIntelFornecedores.length) + ' deleted fornecedores'); }
  } catch(_) {}
  try { estoqueIntelCompras = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_PURCHASES_KEY))); } catch(_) { estoqueIntelCompras = []; }
  try { integracoesGdp = unwrapData(JSON.parse(localStorage.getItem(INTEGRATIONS_KEY))); } catch(_) { integracoesGdp = []; }

  // Story 4.58 AC-1: reconstruir extrato + migrar itens sem extratoId no boot
  try {
    var _concItems = loadConciliacao();
    var _bootExtratos = loadExtratos();

    // Se há itens de conciliação mas ZERO extratos → reconstruir extrato perdido
    if (_concItems.length > 0 && _bootExtratos.length === 0) {
      var _contaBancaria = 'Conta Principal';
      try {
        var _contas = JSON.parse(localStorage.getItem('nexedu.config.contas-bancarias') || '[]');
        var _padrao = _contas.find(function(c) { return c.padrao && c.ativa; }) || _contas[0];
        if (_padrao) _contaBancaria = (_padrao.banco || '') + (_padrao.apelido ? ' (' + _padrao.apelido + ')' : '') || 'Conta Principal';
      } catch(_) {}
      var _conciliados = _concItems.filter(function(i) { return i.conciliado; }).length;
      var _recoveredId = 'ext-recovered-' + Date.now();
      var _oldestDate = _concItems.reduce(function(min, i) { return i.data && i.data < min ? i.data : min; }, _concItems[0].data || new Date().toISOString().slice(0, 10));
      _bootExtratos.push({
        id: _recoveredId,
        data: _oldestDate,
        arquivo: 'Extrato recuperado (conciliacao existente)',
        contaFinanceira: _contaBancaria,
        conciliados: _conciliados,
        total: _concItems.length,
        isOpen: false,
        criadoEm: new Date().toISOString()
      });
      _concItems.forEach(function(i) { if (!i.extratoId) i.extratoId = _recoveredId; });
      saveConciliacao(_concItems);
      saveExtratos(_bootExtratos);
      gdpLog('[boot] Recovered extrato from ' + _concItems.length + ' existing conciliacao items (' + _conciliados + ' conciliados)');
    }

    // Migrar itens órfãos (sem extratoId) para extrato existente
    var _orphans = _concItems.filter(function(i) { return !i.extratoId; });
    if (_orphans.length > 0 && _bootExtratos.length > 0) {
      var _targetExt = _bootExtratos[0];
      _orphans.forEach(function(i) { i.extratoId = _targetExt.id; });
      saveConciliacao(_concItems);
      _bootExtratos.forEach(function(ext) {
        var extItems = _concItems.filter(function(i) { return i.extratoId === ext.id; });
        ext.conciliados = extItems.filter(function(i) { return i.conciliado; }).length;
        ext.total = extItems.length;
      });
      saveExtratos(_bootExtratos);
      gdpLog('[boot] Migrated ' + _orphans.length + ' orphan conciliacao items to extrato ' + _targetExt.id);
    }
  } catch(_) {}

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
  // Migration: corrigir unidade_base de produtos comuns (g/ml → unidade do contrato)
  if (!localStorage.getItem("gdp.migration.unidade-base-critico-v1")) {
    let migrated = 0;
    estoqueIntelProdutos.forEach(p => {
      if (!p.produto_critico && (p.unidade_base === "g" || p.unidade_base === "ml")) {
        p.unidade_base = "UN";
        migrated++;
      }
    });
    if (migrated > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
      gdpLog("[migration] unidade-base-critico-v1: " + migrated + " produtos corrigidos (g/ml → UN)");
    }
    localStorage.setItem("gdp.migration.unidade-base-critico-v1", new Date().toISOString());
  }
  // Migration v2: remover embalagens de produtos comuns (não-críticos)
  if (!localStorage.getItem("gdp.migration.embalagens-critico-v2")) {
    const comunIds = new Set(estoqueIntelProdutos.filter(p => !p.produto_critico).map(p => p.id));
    const antes = estoqueIntelEmbalagens.length;
    estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter(e => !comunIds.has(e.produto_id));
    const removidas = antes - estoqueIntelEmbalagens.length;
    if (removidas > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PACKAGES_KEY, estoqueIntelEmbalagens);
      gdpLog("[migration] embalagens-critico-v2: " + removidas + " embalagens de produtos comuns removidas");
    }
    localStorage.setItem("gdp.migration.embalagens-critico-v2", new Date().toISOString());
  }
  // Migration v3: garantir que todos os produtos tenham produto_critico e preco_referencia
  if (!localStorage.getItem("gdp.migration.produto-campos-v3")) {
    let fixed = 0;
    estoqueIntelProdutos.forEach(p => {
      if (!('produto_critico' in p)) { p.produto_critico = false; fixed++; }
      if (!('preco_referencia' in p)) { p.preco_referencia = 0; fixed++; }
    });
    if (fixed > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
      gdpLog("[migration] produto-campos-v3: " + fixed + " campos adicionados (produto_critico/preco_referencia)");
    }
    localStorage.setItem("gdp.migration.produto-campos-v3", new Date().toISOString());
  }
  // Migration v4: restaurar produto_critico para produtos que TÊM embalagens cadastradas
  if (!localStorage.getItem("gdp.migration.critico-por-embalagem-v4")) {
    let restored = 0;
    const prodIdsComEmb = new Set(estoqueIntelEmbalagens.map(e => e.produto_id));
    estoqueIntelProdutos.forEach(p => {
      if (prodIdsComEmb.has(p.id) && !p.produto_critico) {
        p.produto_critico = true;
        p.unidade_base = p.unidade_base === 'UN' ? 'g' : p.unidade_base;
        restored++;
      }
    });
    if (restored > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
      gdpLog("[migration] critico-por-embalagem-v4: " + restored + " produtos restaurados como criticos");
    }
    localStorage.setItem("gdp.migration.critico-por-embalagem-v4", new Date().toISOString());
  }
  // Migration v5: corrigir v4 — crítico SOMENTE se embalagem com quantidade_base > 1
  if (!localStorage.getItem("gdp.migration.critico-refinado-v5")) {
    let fixCritico = 0, fixComum = 0;
    estoqueIntelProdutos.forEach(p => {
      const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === p.id);
      const temEmbReal = embs.some(e => Number(e.quantidade_base || 0) > 1);
      if (temEmbReal && !p.produto_critico) {
        p.produto_critico = true;
        if (p.unidade_base === 'UN') p.unidade_base = 'g';
        fixCritico++;
      } else if (!temEmbReal && p.produto_critico) {
        p.produto_critico = false;
        p.unidade_base = 'UN';
        fixComum++;
      }
    });
    if (fixCritico > 0 || fixComum > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
      gdpLog("[migration] critico-refinado-v5: " + fixCritico + " marcados critico, " + fixComum + " revertidos para comum");
    }
    localStorage.setItem("gdp.migration.critico-refinado-v5", new Date().toISOString());
  }
  // Migration v6: apenas 3 produtos críticos definidos pelo usuário — resetar todos os outros
  if (!localStorage.getItem("gdp.migration.criticos-exatos-v6")) {
    const CRITICOS_SKU = new Set(['LICT-0024', 'LICT-0065', 'LICT-0023']);
    let setCritico = 0, setComum = 0;
    estoqueIntelProdutos.forEach(p => {
      if (CRITICOS_SKU.has(p.sku)) {
        if (!p.produto_critico) { p.produto_critico = true; setCritico++; }
        if (p.unidade_base === 'UN') p.unidade_base = 'g';
      } else {
        if (p.produto_critico) { p.produto_critico = false; setComum++; }
        if (p.unidade_base === 'g' || p.unidade_base === 'ml') p.unidade_base = 'UN';
      }
    });
    // Remover embalagens de produtos comuns (não-críticos)
    const criticoIds = new Set(estoqueIntelProdutos.filter(p => p.produto_critico).map(p => p.id));
    const embAntes = estoqueIntelEmbalagens.length;
    estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter(e => criticoIds.has(e.produto_id));
    const embRemovidas = embAntes - estoqueIntelEmbalagens.length;
    if (setCritico > 0 || setComum > 0 || embRemovidas > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
      saveWrappedArray(ESTOQUE_INTEL_PACKAGES_KEY, estoqueIntelEmbalagens);
      gdpLog("[migration] criticos-exatos-v6: " + setCritico + " criticos, " + setComum + " comuns, " + embRemovidas + " embalagens removidas");
    }
    localStorage.setItem("gdp.migration.criticos-exatos-v6", new Date().toISOString());
  }
  // Migration v7: remover fornecedores-teste FORN-001/FORN-002 que persistiram no localStorage/cloud
  if (!localStorage.getItem("gdp.migration.remove-forn-teste-v7")) {
    const TEST_FORN_IDS = new Set(["FORN-001", "FORN-002"]);
    const antes = estoqueIntelFornecedores.length;
    estoqueIntelFornecedores = estoqueIntelFornecedores.filter(f => !TEST_FORN_IDS.has(f.id));
    const removidos = antes - estoqueIntelFornecedores.length;
    if (removidos > 0) {
      saveWrappedArray(ESTOQUE_INTEL_SUPPLIERS_KEY, estoqueIntelFornecedores);
      gdpLog("[migration] remove-forn-teste-v7: " + removidos + " fornecedores-teste removidos (FORN-001/FORN-002)");
    }
    localStorage.setItem("gdp.migration.remove-forn-teste-v7", new Date().toISOString());
  }
  // Migration v8: restaurar produto_critico para produtos que têm embalagens reais (qtd_base > 1)
  // e limpar embalagens acidentais (qtd=1 + descrição vazia)
  if (!localStorage.getItem("gdp.migration.restaurar-criticos-v8")) {
    // 1. Limpar embalagens acidentais (sem descrição e qtd_base <= 1)
    const embAntes = estoqueIntelEmbalagens.length;
    estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter(e => {
      const descVazia = !e.descricao || e.descricao.trim() === "";
      const qtdTrivial = !e.quantidade_base || Number(e.quantidade_base) <= 1;
      return !(descVazia && qtdTrivial); // remover se AMBOS vazios
    });
    const embLimpas = embAntes - estoqueIntelEmbalagens.length;
    // 2. Restaurar produto_critico para quem tem embalagens reais
    const prodIdsComEmbReal = new Set(estoqueIntelEmbalagens.map(e => e.produto_id));
    let restaurados = 0;
    estoqueIntelProdutos.forEach(p => {
      if (prodIdsComEmbReal.has(p.id) && !p.produto_critico) {
        p.produto_critico = true;
        restaurados++;
      }
    });
    if (restaurados > 0 || embLimpas > 0) {
      saveWrappedArray(ESTOQUE_INTEL_PRODUCTS_KEY, estoqueIntelProdutos);
      saveWrappedArray(ESTOQUE_INTEL_PACKAGES_KEY, estoqueIntelEmbalagens);
      gdpLog("[migration] restaurar-criticos-v8: " + restaurados + " produtos restaurados como critico, " + embLimpas + " embalagens acidentais removidas");
    }
    localStorage.setItem("gdp.migration.restaurar-criticos-v8", new Date().toISOString());
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
function saveNotasFiscais() {
  // Limpar dados pesados (XML, previews) de NFs autorizadas antes de salvar no localStorage
  // Esses dados já foram persistidos no Supabase — no localStorage só precisamos dos metadados
  const lightNfs = notasFiscais.map(function(nf) {
    if (nf.status !== "autorizada") return nf;
    var light = Object.assign({}, nf);
    if (light.sefaz) {
      light.sefaz = Object.assign({}, light.sefaz);
      delete light.sefaz.xmlPreview;
      delete light.sefaz.xmlDsigPreview;
      delete light.sefaz.lotePreview;
      delete light.sefaz.autorizacaoPreview;
      if (light.sefaz.transmissao) {
        light.sefaz.transmissao = {
          httpStatus: light.sefaz.transmissao.httpStatus,
          parsed: light.sefaz.transmissao.parsed
          // Remove: xml, rawResponse (pesados)
        };
      }
    }
    delete light.xml_autorizado;
    return light;
  });
  try {
    saveWrappedArray(INVOICES_KEY, lightNfs);
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      console.warn("[NF] localStorage cheio — tentando salvar versão ultra-light");
      // Fallback: remover TODOS os sefaz.transmissao de autorizadas
      var ultraLight = lightNfs.map(function(nf) {
        if (nf.status !== "autorizada") return nf;
        var ul = Object.assign({}, nf);
        if (ul.sefaz) { ul.sefaz = { status: ul.sefaz.status, protocolo: ul.sefaz.protocolo, chaveAcesso: ul.sefaz.chaveAcesso, lote: ul.sefaz.lote }; }
        return ul;
      });
      saveWrappedArray(INVOICES_KEY, ultraLight);
    } else { throw e; }
  }
}

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
  // Story 4.61: respeitar unidade do produto vinculado na Central de Produtos
  // NÃO sobrescrever com unidade do Banco de Preços (que pode ter sido inferida incorretamente)
  if (!item.unidade) {
    const prodVinc = estoqueIntelProdutos.find(p => p.id === item.produtoVinculadoId || p.nome === item.descricao);
    if (prodVinc?.unidade_base) item.unidade = prodVinc.unidade_base;
    else if (match?.unidade) item.unidade = match.unidade;
    else item.unidade = "UN";
  }
  // FR-005: SKU vem de vínculo manual (skuVinculado) ou equivalência automática.
  if (!item.skuVinculado) {
    const equivSku = getGdpEquivalencia(item.descricao);
    if (equivSku) {
      item.skuVinculado = equivSku;
      // Buscar nome do produto vinculado na Central de Produtos
      const prodIntel = estoqueIntelProdutos.find(p => p.sku === equivSku);
      if (prodIntel) item.produtoVinculado = prodIntel.nome;
    }
  }
  item.sku = item.skuVinculado || '';
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
      // Usar nome do produto vinculado na central de produtos (se existir), senão descrição do contrato
      const prodVinculado = itemAtualizado.skuVinculado ? estoqueIntelProdutos.find(p => p.sku === itemAtualizado.skuVinculado || p.id === itemAtualizado.produto_vinculado_id) : null;
      itemPedido.descricao = prodVinculado?.nome || itemAtualizado.produtoVinculado || itemAtualizado.descricao || itemPedido.descricao || "";
      itemPedido.ncm = prodVinculado?.ncm || itemAtualizado.ncm || itemPedido.ncm || "";
      itemPedido.sku = itemAtualizado.skuVinculado || itemAtualizado.sku || itemPedido.sku || "";
      // Preserve pedido's original unidade (e.g. KG from ARP parseUnidadeFromName) — only override if contract has explicit value
      itemPedido.unidade = itemPedido.unidade || itemAtualizado.unidade || "UN";
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
function renderEntregas() {} // stub mantido para evitar erro caso haja referência residual
function renderContasPagar() {}
function renderContasReceber() {}

// FR-009: Resumos de vencimento para Contas a Receber
function atualizarResumosVencimento() {
  const hoje = new Date().toISOString().slice(0, 10);
  const _crRaw = JSON.parse(localStorage.getItem("gdp.contas-receber.v1") || "[]");
  const cr = Array.isArray(_crRaw) ? _crRaw : (_crRaw && _crRaw.items ? _crRaw.items : []);
  const vencendoHoje = cr.filter(c => c.vencimento === hoje && c.status !== "recebida");
  const vencidas = cr.filter(c => c.vencimento < hoje && c.status !== "recebida");
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const el = (id) => document.getElementById(id);
  if (el("cr-vencendo-hoje-valor")) el("cr-vencendo-hoje-valor").textContent = brl.format(vencendoHoje.reduce((s, c) => s + Number(c.valor || 0), 0));
  if (el("cr-vencendo-hoje-qtd")) el("cr-vencendo-hoje-qtd").textContent = vencendoHoje.length;
  if (el("cr-vencidas-valor")) el("cr-vencidas-valor").textContent = brl.format(vencidas.reduce((s, c) => s + Number(c.valor || 0), 0));
  if (el("cr-vencidas-qtd")) el("cr-vencidas-qtd").textContent = vencidas.length;
}

function filtrarContasReceberVencendo(tipo) {
  const hoje = new Date().toISOString().slice(0, 10);
  const _crRaw2 = JSON.parse(localStorage.getItem("gdp.contas-receber.v1") || "[]");
  const cr = Array.isArray(_crRaw2) ? _crRaw2 : (_crRaw2 && _crRaw2.items ? _crRaw2.items : []);
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const lista = tipo === "hoje"
    ? cr.filter(c => c.vencimento === hoje && c.status !== "recebida")
    : cr.filter(c => c.vencimento < hoje && c.status !== "recebida");
  const tituloEl = document.getElementById("cr-lista-vencimento-titulo");
  if (tituloEl) tituloEl.textContent = tipo === "hoje" ? "Contas Vencendo Hoje" : "Contas Vencidas";
  const tbody = document.getElementById("cr-lista-vencimento-tbody");
  if (tbody) {
    tbody.innerHTML = lista.length === 0
      ? '<tr><td colspan="6" style="text-align:center;color:var(--mut);padding:1rem">Nenhuma conta encontrada.</td></tr>'
      : lista.map(c => `<tr>
        <td>${c.cliente || '-'}</td>
        <td>${c.descricao || '-'}</td>
        <td class="nowrap">${c.vencimento || '-'}</td>
        <td class="text-right font-mono">${brl.format(Number(c.valor || 0))}</td>
        <td>${c.forma || '-'}</td>
        <td class="text-center" style="white-space:nowrap">
          <button class="btn btn-sm btn-outline" onclick="enviarLembreteConta('${c.id}','whatsapp')" style="font-size:.7rem;padding:.15rem .4rem" title="WhatsApp">📱</button>
          <button class="btn btn-sm btn-outline" onclick="enviarLembreteConta('${c.id}','email')" style="font-size:.7rem;padding:.15rem .4rem" title="Email">📧</button>
        </td>
      </tr>`).join("");
  }
  const listaEl = document.getElementById("cr-lista-vencimento");
  if (listaEl) listaEl.classList.remove("hidden");
}

function fecharListaVencimento() {
  const el = document.getElementById("cr-lista-vencimento");
  if (el) el.classList.add("hidden");
}

// FR-009: Stubs para envio (integração WhatsApp/Email/Inter será implementada no Épico C.4)
function enviarLembreteVencendoHoje(canal) { showToast("Integração " + canal + " será configurada com API Inter. Em breve!", 3000); }
function enviarCobrancaVencidas(canal) { showToast("Cobrança via " + canal + " com boleto reemitido será configurada com API Inter. Em breve!", 3000); }
function enviarLembreteConta(contaId, canal) { showToast("Envio de lembrete via " + canal + " para conta " + contaId + " em breve!", 3000); }
function renderRelatorios() {}
function renderUsuarios() {}
function renderBancoProdutos() {}

// ===== NCM LOOKUP (movido de gdp-entregas.js — compartilhado por vários módulos) =====
const TINY_NCM_MAP = [
  { keywords: ["embalagem", "plastica", "freezer"], ncm: "3923.29.90" },
  { keywords: ["isqueiro", "gas"], ncm: "9613.10.00" },
  { keywords: ["sabao", "barra"], ncm: "3401.19.00" },
  { keywords: ["vassoura", "nylon", "piacava"], ncm: "9603.10.00" },
  { keywords: ["cloro", "gel"], ncm: "2828.90.11" },
  { keywords: ["lixeira", "plastica", "pedal"], ncm: "3924.90.00" },
  { keywords: ["escova", "alimentos", "legumes"], ncm: "9603.90.00" },
  { keywords: ["rodo", "magico", "refil"], ncm: "9603.90.00" },
  { keywords: ["mangueira", "jardim"], ncm: "3917.39.00" },
  { keywords: ["detergente"], ncm: "3402.20.00" },
  { keywords: ["agua", "sanitaria"], ncm: "2828.90.11" },
  { keywords: ["esponja"], ncm: "3926.90.90" },
  { keywords: ["pano", "chao"], ncm: "6307.10.00" },
  { keywords: ["desinfetante"], ncm: "3808.94.19" },
  { keywords: ["luva", "latex", "borracha"], ncm: "4015.19.00" },
  { keywords: ["papel", "higienico"], ncm: "4818.10.00" },
  { keywords: ["papel", "toalha"], ncm: "4818.20.00" },
  { keywords: ["saco", "lixo"], ncm: "3923.29.90" },
  { keywords: ["balde"], ncm: "3924.10.00" },
  { keywords: ["alcool"], ncm: "2207.10.90" },
  { keywords: ["sabonete"], ncm: "3401.11.90" },
  { keywords: ["cera", "piso"], ncm: "3405.40.00" },
  { keywords: ["amaciante"], ncm: "3809.91.90" },
  { keywords: ["limpador", "multiuso"], ncm: "3402.20.00" },
  { keywords: ["inseticida"], ncm: "3808.91.99" },
  { keywords: ["ventilador"], ncm: "8414.51.90" },
  { keywords: ["bebedouro"], ncm: "8418.69.99" },
  { keywords: ["cadeira", "escolar"], ncm: "9401.80.00" },
  { keywords: ["mesa", "escolar"], ncm: "9403.70.00" },
  { keywords: ["quadro", "branco", "lousa"], ncm: "9610.00.00" },
  { keywords: ["caneta", "pilot", "marcador"], ncm: "9608.20.00" },
  { keywords: ["apagador"], ncm: "9603.90.00" },
  { keywords: ["lampada", "led"], ncm: "8539.50.00" },
  { keywords: ["tomada", "extensao", "filtro", "linha"], ncm: "8536.69.90" },
  { keywords: ["cadeado"], ncm: "8301.10.00" },
  { keywords: ["toner", "cartucho", "impressora"], ncm: "8443.99.33" },
  { keywords: ["resma", "sulfite", "a4"], ncm: "4802.56.10" },
  { keywords: ["grampeador"], ncm: "8472.90.29" },
  { keywords: ["tesoura"], ncm: "8213.00.00" },
  { keywords: ["cola", "branca", "bastao"], ncm: "3506.10.90" },
  { keywords: ["fita", "adesiva", "durex", "crepe"], ncm: "3919.10.00" },
  { keywords: ["clips", "clipe"], ncm: "7319.90.00" },
  { keywords: ["borracha", "apagar"], ncm: "4016.92.00" },
  { keywords: ["lapis"], ncm: "9609.10.00" },
  { keywords: ["caneta", "esferografica"], ncm: "9608.10.00" },
  { keywords: ["envelope"], ncm: "4817.10.00" },
  { keywords: ["pasta", "arquivo"], ncm: "4819.60.00" },
  { keywords: ["copo", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["guardanapo"], ncm: "4818.30.00" },
  { keywords: ["panela", "caldeira"], ncm: "7323.93.00" },
  { keywords: ["tinta", "acrilica", "parede"], ncm: "3209.10.00" },
  { keywords: ["vassoura", "gari"], ncm: "9603.10.00" },
  { keywords: ["pa", "lixo"], ncm: "7323.99.00" },
  { keywords: ["dispenser", "sabonete", "papel"], ncm: "3924.90.00" },
  { keywords: ["acucar", "cristal", "refinado"], ncm: "1701.14.00" },
  { keywords: ["biscoito", "bolacha", "cream cracker"], ncm: "1905.31.00" },
  { keywords: ["cacau", "chocolate", "achocolatado"], ncm: "1805.00.00" },
  { keywords: ["extrato", "tomate", "molho"], ncm: "2002.90.00" },
  { keywords: ["feijao", "carioca", "preto"], ncm: "0713.33.19" },
  { keywords: ["polvilho", "amido", "mandioca"], ncm: "1108.14.00" },
  { keywords: ["sal", "refinado", "iodado"], ncm: "2501.00.20" },
  { keywords: ["pao", "frances", "forma"], ncm: "1905.90.10" },
  { keywords: ["rosca", "rosquinha"], ncm: "1905.90.90" },
  { keywords: ["arroz"], ncm: "1006.30.21" },
  { keywords: ["macarrao", "espaguete", "massa"], ncm: "1902.19.00" },
  { keywords: ["oleo", "soja", "vegetal"], ncm: "1507.90.11" },
  { keywords: ["cafe", "torrado", "moido"], ncm: "0901.21.00" },
  { keywords: ["leite", "integral", "desnatado"], ncm: "0401.10.10" },
  { keywords: ["farinha", "trigo"], ncm: "1101.00.10" },
  { keywords: ["margarina", "manteiga"], ncm: "1517.10.00" },
  { keywords: ["vinagre"], ncm: "2209.00.00" },
  { keywords: ["fuba", "milho", "quirera"], ncm: "1102.20.00" },
  { keywords: ["sardinha", "atum", "conserva"], ncm: "1604.13.10" },
  { keywords: ["suco", "refresco", "nectar"], ncm: "2009.89.90" },
  { keywords: ["alface"], ncm: "0705.11.00" },
  { keywords: ["tomate"], ncm: "0702.00.00" },
  { keywords: ["cebola"], ncm: "0703.10.19" },
  { keywords: ["cebolinha"], ncm: "0703.90.00" },
  { keywords: ["couve"], ncm: "0704.90.00" },
  { keywords: ["repolho"], ncm: "0704.90.00" },
  { keywords: ["batata"], ncm: "0701.90.00" },
  { keywords: ["cenoura"], ncm: "0706.10.00" },
  { keywords: ["beterraba"], ncm: "0706.90.00" },
  { keywords: ["chuchu"], ncm: "0709.99.00" },
  { keywords: ["abobora", "abobrinha", "moranga"], ncm: "0709.93.00" },
  { keywords: ["pimentao"], ncm: "0709.60.00" },
  { keywords: ["quiabo"], ncm: "0709.99.00" },
  { keywords: ["jilo"], ncm: "0709.99.00" },
  { keywords: ["mandioca", "aipim"], ncm: "0714.10.00" },
  { keywords: ["inhame", "cara"], ncm: "0714.40.00" },
  { keywords: ["banana"], ncm: "0803.10.00" },
  { keywords: ["laranja"], ncm: "0805.10.00" },
  { keywords: ["limao"], ncm: "0805.50.00" },
  { keywords: ["maca", "maça"], ncm: "0808.10.00" },
  { keywords: ["mamao"], ncm: "0807.20.00" },
  { keywords: ["melancia"], ncm: "0807.11.00" },
  { keywords: ["abacaxi"], ncm: "0804.30.00" },
  { keywords: ["manga"], ncm: "0804.50.20" },
  { keywords: ["alho"], ncm: "0703.20.10" },
  { keywords: ["cheiro", "verde", "salsa", "coentro"], ncm: "0709.99.00" },
  { keywords: ["milho", "espiga"], ncm: "0710.40.00" },
  { keywords: ["frango", "coxa", "sobrecoxa", "peito", "asa"], ncm: "0207.14.00" },
  { keywords: ["carne", "bovina", "acem", "patinho", "musculo"], ncm: "0201.30.00" },
  { keywords: ["carne", "suina", "porco", "lombo", "costela"], ncm: "0203.29.00" },
  { keywords: ["linguica", "calabresa"], ncm: "1601.00.00" },
  { keywords: ["salsicha"], ncm: "1601.00.00" },
  { keywords: ["ovo", "ovos", "galinha"], ncm: "0407.21.00" },
  { keywords: ["peixe", "tilapia", "merluza", "pescada"], ncm: "0304.89.00" },
  { keywords: ["queijo", "mussarela", "prato"], ncm: "0406.10.10" },
  { keywords: ["requeijao"], ncm: "0406.10.90" },
  { keywords: ["iogurte"], ncm: "0403.10.00" },
  { keywords: ["creme", "leite"], ncm: "0401.40.10" },
  { keywords: ["leite", "condensado"], ncm: "0402.99.00" },
  { keywords: ["leite", "po"], ncm: "0402.21.10" },
  { keywords: ["colorau", "colorific", "urucum"], ncm: "0910.91.00" },
  { keywords: ["pimenta", "reino"], ncm: "0904.12.00" },
  { keywords: ["oregano"], ncm: "1211.90.90" },
  { keywords: ["louro"], ncm: "0910.99.00" },
  { keywords: ["cominho"], ncm: "0909.31.00" },
  { keywords: ["caldo", "galinha", "tempero"], ncm: "2104.10.11" },
  { keywords: ["mostarda"], ncm: "2103.30.21" },
  { keywords: ["maionese"], ncm: "2103.90.11" },
  { keywords: ["catchup", "ketchup"], ncm: "2103.20.10" },
  { keywords: ["aveia"], ncm: "1104.12.00" },
  { keywords: ["granola"], ncm: "1904.20.00" },
  { keywords: ["ervilha"], ncm: "2005.40.00" },
  { keywords: ["milho", "conserva", "lata"], ncm: "2005.80.00" },
  { keywords: ["lentilha"], ncm: "0713.40.10" },
  { keywords: ["soja", "proteina"], ncm: "2106.10.00" },
  { keywords: ["prato", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["talher", "garfo", "faca", "colher", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["marmitex", "marmita", "quentinha"], ncm: "7612.90.19" },
  { keywords: ["filme", "pvc", "plastico"], ncm: "3920.43.00" },
  { keywords: ["papel", "aluminio"], ncm: "7607.11.90" },
  { keywords: ["shampoo", "xampu"], ncm: "3305.10.00" },
  { keywords: ["creme", "dental", "dentifricio"], ncm: "3306.10.00" },
  { keywords: ["escova", "dental", "dente"], ncm: "9603.21.00" },
  { keywords: ["fralda", "descartavel"], ncm: "9619.00.00" },
  { keywords: ["absorvente"], ncm: "9619.00.00" },
];

let _ncmDebounceAdd, _ncmDebounceEdit;
function sugerirNcmAdd() {
  clearTimeout(_ncmDebounceAdd);
  _ncmDebounceAdd = setTimeout(() => {
    const desc = (document.getElementById("ai-descricao")?.value || "").trim();
    const ncmField = document.getElementById("ai-ncm");
    const hint = document.getElementById("ai-ncm-hint");
    if (!desc || !ncmField) return;
    const match = findNcmLocal(desc);
    if (match && !ncmField.value) {
      ncmField.value = match.ncm;
      if (hint) hint.textContent = "Sugerido automaticamente";
    } else if (!match && hint) {
      hint.textContent = "";
    }
  }, 400);
}
function sugerirNcmEdit() {
  clearTimeout(_ncmDebounceEdit);
  _ncmDebounceEdit = setTimeout(() => {
    const desc = (document.getElementById("ei-descricao")?.value || "").trim();
    const ncmField = document.getElementById("ei-ncm");
    const hint = document.getElementById("ei-ncm-hint");
    if (!desc || !ncmField) return;
    const match = findNcmLocal(desc);
    if (match) {
      if (!ncmField.value) ncmField.value = match.ncm;
      if (hint) hint.textContent = "Sugestão: " + match.ncm;
    } else if (hint) {
      hint.textContent = "";
    }
  }, 400);
}

function findNcmLocal(description) {
  const lower = (description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let best = null, bestScore = 0;
  for (const entry of TINY_NCM_MAP) {
    const score = entry.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

function getBaseUrl() {
  if (location.hostname.includes("vercel.app")) return "/api";
  return "/api";
}

function salvarNcmItem(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].ncm = value.trim();
  enrichContratoItemMetadata(c, c.itens[itemIdx], itemIdx);
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[itemIdx]);
}

// Story 14.9: Editar preço do item do contrato com reflexo nos pedidos e portal
function salvarPrecoItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  const novoPreco = Math.round((parseFloat(value) || 0) * 100) / 100;
  c.itens[itemIdx].precoUnitario = novoPreco;
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[itemIdx]);
  if (typeof showToast === 'function') showToast('Preco atualizado: R$ ' + novoPreco.toFixed(2).replace('.', ','), 2000);
}

// Editar campos inline dos itens do contrato
function salvarQtdItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].qtdContratada = parseInt(value) || 0;
  if (c.itens[itemIdx].quantidade !== undefined) c.itens[itemIdx].quantidade = c.itens[itemIdx].qtdContratada;
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[itemIdx]);
}

function salvarDescricaoItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].descricao = value.trim();
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[itemIdx]);
}

function salvarUnidadeItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].unidade = value.trim();
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[itemIdx]);
}

function salvarSkuItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].sku = value.trim();
  saveContratos();
}

function buscarNcmItem(contratoId, itemIdx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  const item = c.itens[itemIdx];
  const ncm = findNcmLocal(item.descricao);
  const inputEl = document.getElementById(`ncm-${contratoId}-${itemIdx}`);
  if (ncm) {
    item.ncm = ncm.ncm;
    enrichContratoItemMetadata(c, item, itemIdx);
    if (inputEl) inputEl.value = ncm.ncm;
    saveContratos();
    syncContratoItemToPedidos(contratoId, item);
    showToast(`NCM ${ncm.ncm} encontrado para "${item.descricao.slice(0,30)}"`);
  } else {
    showToast(`Nenhum NCM encontrado para "${item.descricao.slice(0,30)}"`, 3000);
  }
}

function preencherNcmTodos(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  let filled = 0, notFound = 0;
  c.itens.forEach((item, idx) => {
    if (item.ncm && item.ncm.length > 3) return;
    const ncm = findNcmLocal(item.descricao);
    if (ncm) {
      item.ncm = ncm.ncm;
      enrichContratoItemMetadata(c, item, idx);
      const inputEl = document.getElementById(`ncm-${contratoId}-${idx}`);
      if (inputEl) inputEl.value = ncm.ncm;
      syncContratoItemToPedidos(contratoId, item);
      filled++;
    } else {
      notFound++;
    }
  });
  saveContratos();
  showToast(`NCM preenchido: ${filled} itens. ${notFound > 0 ? notFound + ' sem NCM encontrado.' : ''}`, 4000);
}

function autoPreencherNcm(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return { filled: 0, pending: 0 };
  loadBancoProdutos();
  const bp = bancoProdutos.itens || [];
  let filled = 0, pending = 0;
  c.itens.forEach((item, idx) => {
    if (item.ncm && item.ncm.length >= 8) return;
    const local = findNcmLocal(item.descricao);
    if (local) { item.ncm = local.ncm; enrichContratoItemMetadata(c, item, idx); syncContratoItemToPedidos(contratoId, item); filled++; return; }
    const descNorm = (item.descricao || '').toUpperCase().trim();
    const bpMatch = bp.find(p => (p.descricao || '').toUpperCase().trim() === descNorm && p.ncm && p.ncm.length >= 8);
    if (!bpMatch) {
      const words = descNorm.split(/\s+/).slice(0, 3).join(' ');
      if (words.length > 5) {
        const fuzzy = bp.find(p => (p.descricao || '').toUpperCase().trim().startsWith(words) && p.ncm && p.ncm.length >= 8);
        if (fuzzy) { item.ncm = fuzzy.ncm; enrichContratoItemMetadata(c, item, idx); syncContratoItemToPedidos(contratoId, item); filled++; return; }
      }
    }
    if (bpMatch) { item.ncm = bpMatch.ncm; enrichContratoItemMetadata(c, item, idx); syncContratoItemToPedidos(contratoId, item); filled++; return; }
    pending++;
  });
  if (filled > 0) saveContratos();
  return { filled, pending };
}

async function classificarNcmIA(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const semNcm = c.itens.filter(i => !i.ncm || i.ncm.length < 8);
  if (semNcm.length === 0) { showToast("Todos os itens ja tem NCM!"); return; }
  showToast(`Classificando ${semNcm.length} itens com IA...`, 3000);
  for (let start = 0; start < semNcm.length; start += 20) {
    const batch = semNcm.slice(start, start + 20);
    try {
      const resp = await fetch("/api/ai-ncm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map(i => ({ descricao: i.descricao })) })
      });
      const data = await resp.json();
      if (data.success && data.results) {
        data.results.forEach((r, idx) => {
          if (r.ncm && batch[idx]) {
            batch[idx].ncm = r.ncm;
            const realIdx = c.itens.findIndex((item) => item === batch[idx]);
            enrichContratoItemMetadata(c, batch[idx], realIdx >= 0 ? realIdx : idx);
            syncContratoItemToPedidos(contratoId, batch[idx]);
            adicionarAoBancoProdutos({ ...batch[idx], ncm: r.ncm });
          }
        });
      }
    } catch(err) {
      showToast("Erro na classificacao IA: " + err.message, 4000);
    }
  }
  saveContratos();
  abrirContrato(contratoId);
  const classified = semNcm.filter(i => i.ncm && i.ncm.length >= 8).length;
  showToast(`IA classificou ${classified}/${semNcm.length} itens!`, 4000);
}

// ===== CONCILIACAO BANCARIA =====
const CONCILIACAO_KEY = "gdp.conciliacao.v1";
// Story 4.51 AC-C1: persistent extrato registry
const EXTRATOS_KEY = "gdp.extratos.v1";

function loadConciliacao() {
  try {
    var raw = JSON.parse(localStorage.getItem(CONCILIACAO_KEY) || "[]");
    // Story 4.62: suporta formato wrapped { items: [] } e array puro
    if (raw && raw.items && Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw)) return raw;
    return [];
  } catch(_) { return []; }
}

function saveConciliacao(items) {
  // Story 4.64: garantir que cada item tenha ID para delete tracking
  var arr = items || [];
  arr.forEach(function(it) { if (!it.id) it.id = 'conc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); });
  // Story 4.62: salvar no formato wrapped para que syncToCloud reconheça exclusões (updatedAt)
  var wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: arr };
  localStorage.setItem(CONCILIACAO_KEY, JSON.stringify(wrapped));
  if (typeof cloudSave === 'function') cloudSave(CONCILIACAO_KEY, wrapped);
}

// Story 4.51 AC-C1/C2/C3: extrato management
function loadExtratos() {
  try {
    var raw = JSON.parse(localStorage.getItem(EXTRATOS_KEY) || "[]");
    if (raw && raw.items && Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw)) return raw;
    return [];
  } catch(_) { return []; }
}

function saveExtratos(list) {
  var arr = list || [];
  arr.forEach(function(it) { if (!it.id) it.id = 'ext-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); });
  var wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: arr };
  localStorage.setItem(EXTRATOS_KEY, JSON.stringify(wrapped));
  if (typeof cloudSave === 'function') cloudSave(EXTRATOS_KEY, wrapped);
}

function registrarExtrato(filename, contaFinanceira, items) {
  const extratos = loadExtratos();
  const conciliados = items.filter(i => i.conciliado).length;
  const extId = 'ext-' + Date.now();
  extratos.push({
    id: extId,
    data: new Date().toISOString().slice(0, 10),
    arquivo: filename,
    contaFinanceira: contaFinanceira || 'Conta Principal',
    conciliados: conciliados,
    total: items.length,
    isOpen: false, // Story 4.55 AC-2: extrato inicia colapsado
    criadoEm: new Date().toISOString()
  });
  saveExtratos(extratos);
  return extId;
}

function atualizarExtratoStats() {
  const extratos = loadExtratos();
  if (!extratos.length) return;
  const items = loadConciliacao();
  // Story 4.57: apenas recalcular stats, migração já feita no boot
  extratos.forEach(ext => {
    const extItems = items.filter(i => i.extratoId === ext.id);
    ext.conciliados = extItems.filter(i => i.conciliado).length;
    ext.total = extItems.length;
  });
  saveExtratos(extratos);
}

// Categorias DRE para classificação de lançamentos
const CATEGORIAS_DRE = [
  { grupo: "RECEITAS", items: ["Receita de Vendas", "Receita de Servicos", "Receita Financeira", "Outras Receitas"] },
  { grupo: "CUSTOS", items: ["Custo Mercadoria Vendida", "Custo Materia-Prima", "Custo Frete/Logistica"] },
  { grupo: "DESPESAS OPERACIONAIS", items: ["Aluguel", "Energia/Agua", "Telefone/Internet", "Salarios/Encargos", "Contabilidade", "Material Escritorio", "Material Limpeza", "Combustivel", "Manutencao", "Marketing/Publicidade", "Impostos/Taxas", "Seguros", "Software/Tecnologia"] },
  { grupo: "DESPESAS FINANCEIRAS", items: ["Juros", "Tarifas Bancarias", "IOF", "Multas"] },
  { grupo: "INVESTIMENTOS", items: ["Equipamentos", "Veiculos", "Imoveis", "Outros Investimentos"] },
  { grupo: "OUTROS", items: ["Transferencia", "Saque", "Deposito", "Nao Classificado"] }
];

function _buildDreOptions(selected) {
  let html = '<option value="">— Classificar —</option>';
  CATEGORIAS_DRE.forEach(g => {
    html += `<optgroup label="${g.grupo}">`;
    g.items.forEach(item => { html += `<option value="${item}" ${selected === item ? 'selected' : ''}>${item}</option>`; });
    html += '</optgroup>';
  });
  return html;
}

function renderConciliacao() {
  // Story 4.55 AC-2: render extratos colapsados, detalhe só quando aberto
  const extratosEl = document.getElementById("extratos-lista");
  const extratos = loadExtratos();
  const allItems = loadConciliacao();
  const tbody = document.getElementById("conciliacao-tbody");
  const empty = document.getElementById("conciliacao-empty");
  const resumo = document.getElementById("conciliacao-resumo");

  // Story 4.57: renderConciliacao é READ-ONLY — migração roda no boot, stats em atualizarExtratoStats()

  // Render tabela de extratos
  if (extratosEl) {
    if (extratos.length) {
      const openIdx = extratos.findIndex(e => e.isOpen);
      extratosEl.innerHTML = '<table style="width:100%;font-size:.85rem;margin-bottom:.5rem;border-collapse:collapse;background:var(--s1,#1e293b);border-radius:6px;overflow:hidden">'
        + '<thead><tr style="border-bottom:1px solid var(--bdr,#334155)">'
        + '<th style="width:30px;padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600"><input type="checkbox" id="ext-select-all" onchange="toggleAllExtratos(this.checked)"></th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600;cursor:pointer">Data ⇅</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600;cursor:pointer">Arquivo ⇅</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600;cursor:pointer">Conta financeira ⇅</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600">Conciliados/Total</th>'
        + '</tr></thead><tbody>'
        + extratos.map((ext, i) => {
          const isOpen = ext.isOpen === true;
          const rowBg = isOpen ? 'background:rgba(59,130,246,.12);' : '';
          const arrow = isOpen ? '▼' : '▶';
          return '<tr style="cursor:pointer;border-bottom:1px solid rgba(51,65,85,.4);' + rowBg + '" onclick="reabrirExtrato(' + i + ')">'
            + '<td style="padding:10px 12px" onclick="event.stopPropagation()"><input type="checkbox" class="ext-check" value="' + i + '"></td>'
            + '<td style="padding:10px 12px;color:var(--txt,#f1f5f9)">' + (ext.data || '-') + '</td>'
            + '<td style="padding:10px 12px;color:var(--txt,#f1f5f9);font-weight:500">' + arrow + ' ' + (ext.arquivo || '-') + '</td>'
            + '<td style="padding:10px 12px;color:var(--txt,#f1f5f9);font-weight:700">' + (ext.contaFinanceira || '-') + '</td>'
            + '<td style="padding:10px 12px;color:var(--txt,#f1f5f9)">(' + (ext.conciliados || 0) + '/' + (ext.total || 0) + ')</td></tr>';
        }).join('') + '</tbody></table>'
        + '<button class="btn btn-sm btn-red" id="btn-excluir-extratos" style="display:none;margin-bottom:.5rem" onclick="excluirExtratosSelecionados()">Excluir selecionados</button>';
      setTimeout(() => {
        document.querySelectorAll('.ext-check').forEach(cb => {
          cb.addEventListener('change', () => {
            const any = document.querySelectorAll('.ext-check:checked').length > 0;
            const btn = document.getElementById('btn-excluir-extratos');
            if (btn) btn.style.display = any ? '' : 'none';
          });
        });
      }, 50);
    } else {
      extratosEl.innerHTML = '';
    }
  }

  if (!tbody) return;

  // Story 4.55 AC-2: só mostrar detalhes se algum extrato estiver aberto
  const openExtrato = extratos.find(e => e.isOpen === true);
  if (!openExtrato) {
    // Nenhum extrato aberto — esconder tabela de detalhes e resumo
    tbody.innerHTML = "";
    if (empty) empty.style.display = allItems.length === 0 ? "" : "none";
    if (resumo) resumo.innerHTML = "";
    return;
  }

  // Filtrar items do extrato aberto
  const items = allItems.filter(i => i.extratoId === openExtrato.id);
  if (items.length === 0) { tbody.innerHTML = ""; if (empty) empty.style.display = ""; if (resumo) resumo.innerHTML = ""; return; }
  if (empty) empty.style.display = "none";

  // Resumo KPIs do extrato aberto
  const totalCredito = items.filter(t => (parseFloat(t.valor) || 0) >= 0).reduce((s, t) => s + (parseFloat(t.valor) || 0), 0);
  const totalDebito = items.filter(t => (parseFloat(t.valor) || 0) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.valor) || 0), 0);
  const conciliados = items.filter(t => t.conciliado).length;
  const pendentes = items.length - conciliados;
  if (resumo) {
    resumo.innerHTML = `
      <div style="text-align:center"><div style="font-size:.7rem;color:var(--mut)">ENTRADAS</div><div style="font-weight:700;color:var(--green,#22c55e)">${brl.format(totalCredito)}</div></div>
      <div style="text-align:center"><div style="font-size:.7rem;color:var(--mut)">SAIDAS</div><div style="font-weight:700;color:var(--red,#ef4444)">${brl.format(totalDebito)}</div></div>
      <div style="text-align:center"><div style="font-size:.7rem;color:var(--mut)">SALDO</div><div style="font-weight:700">${brl.format(totalCredito - totalDebito)}</div></div>
      <div style="text-align:center"><div style="font-size:.7rem;color:var(--mut)">CONCILIADOS</div><div style="font-weight:700;color:var(--blue,#3b82f6)">${conciliados}/${items.length}</div></div>
      <div style="text-align:center"><div style="font-size:.7rem;color:var(--mut)">PENDENTES</div><div style="font-weight:700;color:${pendentes > 0 ? 'var(--yellow,#f59e0b)' : 'var(--green,#22c55e)'}">${pendentes}</div></div>
    `;
  }

  // Mapear indices globais para o conciliarLancamento funcionar
  const globalIndices = allItems.map((item, gi) => items.includes(item) ? gi : -1).filter(gi => gi >= 0);

  tbody.innerHTML = items.map((t, localIdx) => {
    const gi = globalIndices[localIdx];
    const val = parseFloat(t.valor) || 0;
    const cor = val >= 0 ? "var(--green,#22c55e)" : "var(--red,#ef4444)";
    const isPendente = !t.conciliado;
    const pendenteMark = isPendente ? 'border-left:3px solid var(--yellow,#f59e0b);background:rgba(245,158,11,.06);' : 'opacity:.6;';
    let statusLabel;
    if (t.conciliado) {
      const vinc = t.vinculadoA;
      const vincLabel = vinc ? ' <span style="font-size:.65rem;color:var(--mut)">(' + (vinc.tipo === 'cp' ? 'CP' : 'CR') + ')</span>' : '';
      statusLabel = '<span style="color:var(--green,#22c55e);font-weight:700;font-size:.75rem">Conciliado' + vincLabel + '</span>';
    } else {
      const sugestoes = buscarSugestoesConciliacao(t);
      if (sugestoes.length > 0) {
        const s = sugestoes[0];
        const tipoLabel = s.tipo === 'cp' ? 'CP' : 'CR';
        const descShort = (s.descricao || '').slice(0, 25) + ((s.descricao || '').length > 25 ? '...' : '');
        const vencFmt = s.vencimento ? fmtDate(s.vencimento) : '';
        statusLabel = '<div style="font-size:.72rem;line-height:1.3">'
          + '<button class="btn btn-sm btn-green" style="font-size:.68rem;padding:.15rem .5rem;margin-bottom:.2rem" onclick="conciliarComBaixa(' + gi + ',\'' + s.contaId + '\',\'' + s.tipo + '\')">' + tipoLabel + ': ' + esc(descShort) + '</button>'
          + '<div style="color:var(--mut);font-size:.65rem">' + esc(vencFmt) + ' | ' + brl.format(s.valor) + (sugestoes.length > 1 ? ' (+' + (sugestoes.length - 1) + ')' : '') + '</div>'
          + '<button class="btn btn-sm btn-blue" style="font-size:.65rem;padding:.1rem .4rem;margin-top:.3rem;opacity:.8" onclick="conciliarLancamento(' + gi + ')">Conciliar manual</button>'
          + '</div>';
      } else {
        statusLabel = '<button class="btn btn-sm btn-blue" style="font-size:.7rem;padding:.15rem .5rem" onclick="conciliarLancamento(' + gi + ')">Conciliar</button>';
      }
    }
    return `<tr style="${pendenteMark}">
      <td>${t.data || "-"}</td>
      <td style="font-size:.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${esc(t.descricao || '')}">${esc(t.descricao || "")}</td>
      <td><input type="text" value="${esc(t.historico || '')}" placeholder="Complemento..." style="width:100%;padding:.25rem .4rem;font-size:.8rem;background:var(--bg,#0f172a);border:1px solid var(--bdr,#334155);border-radius:4px;color:var(--txt,#f1f5f9)" onchange="atualizarHistorico(${gi},this.value)"></td>
      <td><select style="width:100%;padding:.25rem;font-size:.75rem;background:var(--bg,#0f172a);border:1px solid var(--bdr,#334155);border-radius:4px;color:var(--txt,#f1f5f9)" onchange="atualizarCategoriaDre(${gi},this.value)">${_buildDreOptions(t.categoriaDre || '')}</select></td>
      <td class="text-right font-mono" style="color:${cor};font-weight:600;white-space:nowrap">${brl.format(val)}</td>
      <td style="font-size:.75rem">${val >= 0 ? "Crédito" : "Débito"}</td>
      <td>${statusLabel}</td>
    </tr>`;
  }).join("");
}

// === Auto-conciliacao: buscar sugestoes de CP/CR para transacao do extrato ===
function buscarSugestoesConciliacao(transacao) {
  const val = parseFloat(transacao.valor) || 0;
  const absVal = Math.abs(val);
  const sugestoes = [];

  if (val < 0) {
    // Debito no extrato -> buscar em Contas a Pagar pendentes
    contasPagar.forEach(cp => {
      if (cp.status === 'paga') return;
      const cpVal = parseFloat(cp.valor) || 0;
      if (Math.abs(cpVal - absVal) < 0.01) {
        sugestoes.push({
          tipo: 'cp',
          contaId: cp.id,
          descricao: cp.descricao || '',
          cliente: cp.cliente || '',
          vencimento: cp.vencimento || '',
          valor: cpVal,
          categoria: cp.categoria || ''
        });
      }
    });
  } else {
    // Credito no extrato -> buscar em Contas a Receber pendentes
    contasReceber.forEach(cr => {
      if (cr.status === 'recebida') return;
      const crVal = parseFloat(cr.valor) || 0;
      if (Math.abs(crVal - absVal) < 0.01) {
        sugestoes.push({
          tipo: 'cr',
          contaId: cr.id,
          descricao: cr.descricao || '',
          cliente: cr.cliente || '',
          vencimento: cr.vencimento || '',
          valor: crVal,
          categoria: cr.categoria || ''
        });
      }
    });
  }

  // Ordenar por proximidade de data (vencimento mais proximo da data do extrato)
  if (transacao.data && sugestoes.length > 1) {
    const extDate = new Date(transacao.data).getTime();
    sugestoes.sort((a, b) => {
      const da = Math.abs(new Date(a.vencimento).getTime() - extDate);
      const db = Math.abs(new Date(b.vencimento).getTime() - extDate);
      return da - db;
    });
  }

  return sugestoes;
}

// === Auto-conciliacao: conciliar extrato + baixar CP/CR automaticamente ===
window.conciliarComBaixa = function(idx, contaId, tipo) {
  const items = loadConciliacao();
  if (!items[idx]) return;

  // 1. Marcar lancamento como conciliado e vincular a conta
  items[idx].conciliado = true;
  items[idx].conciliadoEm = new Date().toISOString().slice(0, 10);
  items[idx].vinculadoA = { tipo: tipo, contaId: contaId };
  saveConciliacao(items);

  // 2. Baixar a conta automaticamente
  const dataBaixa = items[idx].data || new Date().toISOString().slice(0, 10);

  if (tipo === 'cp') {
    const conta = contasPagar.find(c => c.id === contaId);
    if (conta && conta.status !== 'paga') {
      conta.status = 'paga';
      conta.pagaEm = dataBaixa + 'T12:00:00';
      conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaAutoConciliacao: true, extratoRef: items[idx].extratoId };
      saveContasPagar();
    }
  } else if (tipo === 'cr') {
    const conta = contasReceber.find(c => c.id === contaId);
    if (conta && conta.status !== 'recebida') {
      conta.status = 'recebida';
      conta.recebidaEm = dataBaixa + 'T12:00:00';
      conta.conciliacao = { status: 'conciliado_extrato', referencia: genId('CNCL'), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
      conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaAutoConciliacao: true, extratoRef: items[idx].extratoId };
      saveContasReceber();
    }
  }

  atualizarExtratoStats();
  renderConciliacao();
  const label = tipo === 'cp' ? 'Conta a Pagar' : 'Conta a Receber';
  showToast('Conciliado e baixado: ' + label + ' vinculada automaticamente.', 4000);
};

window.conciliarLancamento = function(idx) {
  const items = loadConciliacao();
  if (items[idx]) {
    items[idx].conciliado = true;
    items[idx].conciliadoEm = new Date().toISOString().slice(0, 10);
    saveConciliacao(items);
    atualizarExtratoStats();
    renderConciliacao();
    showToast("Lançamento conciliado.");
  }
};

window.toggleConciliado = function(idx) {
  const items = loadConciliacao();
  if (items[idx]) { items[idx].conciliado = !items[idx].conciliado; saveConciliacao(items); atualizarExtratoStats(); renderConciliacao(); }
};

// Story 4.51 AC-C2: delete selected extratos
window.toggleAllExtratos = function(checked) {
  document.querySelectorAll('.ext-check').forEach(cb => { cb.checked = checked; cb.dispatchEvent(new Event('change')); });
};

window.excluirExtratosSelecionados = function() {
  const selected = [...document.querySelectorAll('.ext-check:checked')].map(cb => parseInt(cb.value));
  if (!selected.length) return;
  if (!confirm('Excluir ' + selected.length + ' extrato(s)?\n\nLançamentos conciliados serão preservados no Caixa.\nLançamentos não conciliados serão removidos.')) return;
  const extratos = loadExtratos();
  const deletedExtIds = new Set(selected.map(i => extratos[i]?.id).filter(Boolean));
  const remaining = extratos.filter((_, i) => !selected.includes(i));

  // Story 4.69: delete tracking para extratos — impede sync de restaurar
  try {
    var dkExt = 'gdp.extratos.deleted.v1';
    var existingExt = JSON.parse(localStorage.getItem(dkExt) || '[]');
    if (!Array.isArray(existingExt)) existingExt = [];
    deletedExtIds.forEach(function(id) { if (existingExt.indexOf(id) < 0) existingExt.push(id); });
    localStorage.setItem(dkExt, JSON.stringify(existingExt));
  } catch(_) {}

  saveExtratos(remaining);

  // Story 4.69: remover apenas itens NAO conciliados dos extratos excluídos
  if (deletedExtIds.size > 0) {
    const allItems = loadConciliacao();
    const removedIds = [];
    const kept = allItems.filter(item => {
      if (!deletedExtIds.has(item.extratoId)) return true;
      if (item.conciliado === true) return true;
      if (item.id) removedIds.push(item.id);
      return false;
    });
    // Delete tracking para itens de conciliação removidos
    if (removedIds.length > 0) {
      try {
        var dkConc = 'gdp.conciliacao.deleted.v1';
        var existingConc = JSON.parse(localStorage.getItem(dkConc) || '[]');
        if (!Array.isArray(existingConc)) existingConc = [];
        removedIds.forEach(function(id) { if (existingConc.indexOf(id) < 0) existingConc.push(id); });
        localStorage.setItem(dkConc, JSON.stringify(existingConc));
      } catch(_) {}
    }
    saveConciliacao(kept);
  }
  renderConciliacao();
  showToast(selected.length + ' extrato(s) excluído(s). Conciliados preservados no Caixa.');
};

// Story 4.55 AC-2: toggle extrato aberto/fechado com state tracking
window.reabrirExtrato = function(idx) {
  const extratos = loadExtratos();
  const ext = extratos[idx];
  if (!ext) return;

  // Toggle: se já está aberto, fechar; senão abrir e fechar os outros
  const wasOpen = ext.isOpen === true;
  extratos.forEach(e => { e.isOpen = false; }); // fechar todos
  if (!wasOpen) {
    ext.isOpen = true;
    // Notificar pendentes
    const allItems = loadConciliacao();
    const extItems = allItems.filter(i => i.extratoId === ext.id);
    const pendentes = extItems.filter(i => !i.conciliado).length;
    if (pendentes > 0) {
      showToast('Extrato reaberto — ' + pendentes + ' lançamento(s) pendente(s) de conciliação.', 4000);
    } else {
      showToast('Extrato totalmente conciliado (' + extItems.length + '/' + extItems.length + ').', 3000);
    }
  }
  saveExtratos(extratos);
  renderConciliacao();
};

window.atualizarHistorico = function(idx, valor) {
  const items = loadConciliacao();
  if (items[idx]) { items[idx].historico = valor; saveConciliacao(items); }
};

window.atualizarCategoriaDre = function(idx, valor) {
  const items = loadConciliacao();
  if (items[idx]) { items[idx].categoriaDre = valor; saveConciliacao(items); }
};

window.importarExtratoBancario = async function(file, tipo) {
  if (!file) return;
  const status = document.getElementById("conciliacao-status");
  if (status) status.textContent = "Processando " + file.name + "...";

  try {
    const text = await file.text();
    let transacoes = [];

    if (tipo === "ofx") {
      // Parse OFX/QFX format
      const stmtTrns = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];
      stmtTrns.forEach(block => {
        const tag = (t) => (block.match(new RegExp("<" + t + ">([^<\\n]+)")) || [])[1] || "";
        const dtRaw = tag("DTPOSTED").slice(0, 8);
        const data = dtRaw ? dtRaw.slice(0, 4) + "-" + dtRaw.slice(4, 6) + "-" + dtRaw.slice(6, 8) : "";
        transacoes.push({
          data: data,
          descricao: tag("MEMO") || tag("NAME") || "",
          valor: parseFloat(tag("TRNAMT")) || 0,
          tipo: tag("TRNTYPE") || "",
          conciliado: false
        });
      });
    } else if (tipo === "csv") {
      // Simple CSV: data;descricao;valor
      const lines = text.split("\n").filter(l => l.trim());
      lines.slice(1).forEach(line => {
        const cols = line.split(/[;,]/);
        if (cols.length >= 3) {
          transacoes.push({
            data: (cols[0] || "").trim(),
            descricao: (cols[1] || "").trim(),
            valor: parseFloat((cols[2] || "0").replace(",", ".")) || 0,
            conciliado: false
          });
        }
      });
    } else if (tipo === "pdf") {
      // PDF text extraction — basic line parsing
      // For proper PDF parsing we'd need a library; for now extract readable text
      if (status) status.textContent = "PDF importado. Extraindo texto (suporte basico)...";
      // Try to parse any readable text lines that look like transactions
      const lines = text.split("\n").filter(l => /\d{2}[\/-]\d{2}/.test(l) && /\d+[,\.]\d{2}/.test(l));
      lines.forEach(line => {
        const dateMatch = line.match(/(\d{2}[\/-]\d{2}[\/-]\d{2,4})/);
        const valMatch = line.match(/([-]?\d+[.,]\d{2})\s*$/);
        if (dateMatch && valMatch) {
          transacoes.push({
            data: dateMatch[1],
            descricao: line.replace(dateMatch[0], "").replace(valMatch[0], "").trim().slice(0, 80),
            valor: parseFloat(valMatch[1].replace(".", "").replace(",", ".")) || 0,
            conciliado: false
          });
        }
      });
    }

    if (transacoes.length === 0) {
      if (status) status.textContent = "Nenhuma transacao encontrada no arquivo.";
      showToast("Nenhuma transacao encontrada.");
      return;
    }

    // Merge with existing
    const existing = loadConciliacao();
    // Story 4.55 AC-2: gerar extratoId antes para vincular items
    const contaBancaria = (() => {
      try {
        const contas = JSON.parse(localStorage.getItem("nexedu.config.contas-bancarias") || "[]");
        const padrao = contas.find(c => c.padrao && c.ativa) || contas[0];
        return padrao ? (padrao.banco || padrao.apelido || 'Conta Principal') : 'Conta Principal';
      } catch(_) { return 'Conta Principal'; }
    })();
    const extId = registrarExtrato(file.name, contaBancaria, transacoes);
    // Vincular cada transação ao extratoId para filtrar na abertura
    transacoes.forEach(t => { t.extratoId = extId; });
    const merged = [...existing, ...transacoes];
    saveConciliacao(merged);
    renderConciliacao();
    if (status) status.textContent = `${transacoes.length} transacao(es) importadas de ${file.name}.`;
    showToast(`${transacoes.length} transacoes importadas!`);
  } catch(err) {
    if (status) status.textContent = "Erro: " + err.message;
    showToast("Erro ao importar: " + err.message, 4000);
  }
};
