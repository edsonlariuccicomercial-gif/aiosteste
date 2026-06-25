// ===== GDP CORE — extracted from gdp-contratos.html =====
// Infrastructure: sidebar, constants, data layer, cloud sync, state, storage helpers,
// save/load, sanitizers, normalization, client/escola utils, SKU/item enrichment.

// Story 4.83-fix: Reset manual via ?reset-caixa (limpa localStorage corrompido, força re-sync do cloud)
(function() {
  if (location.search.includes('reset-caixa')) {
    console.warn('[GDP] reset-caixa: limpando localStorage de conciliação/extratos para re-sync');
    localStorage.removeItem('gdp.extratos.v1');
    localStorage.removeItem('gdp.extratos.deleted.v1');
    localStorage.removeItem('gdp.conciliacao.v1');
    localStorage.removeItem('gdp.conciliacao.deleted.v1');
    history.replaceState(null, '', location.href.replace(/[?&]reset-caixa/, ''));
  }
})();

// ===== CONDITIONAL LOGGER (Story 12.1 AC2) =====
// Em producao: silencioso. Para debug: localStorage.setItem('gdp.debug', 'true')
const _GDP_DEBUG = localStorage.getItem('gdp.debug') === 'true';
const gdpLog = _GDP_DEBUG ? console.log.bind(console, '[GDP]') : function() {};
const gdpWarn = _GDP_DEBUG ? console.warn.bind(console, '[GDP]') : function() {};

// ANTI-QUOTA (incidente 2026-06-24): setItem tolerante a QuotaExceededError. Usado pelo sync_data
// legado (syncFromCloud), que grava várias chaves auxiliares cruas. Se UMA estoura a quota (ex.:
// gdp.notas-entrada.v1 gigante), antes a exceção borbulhava e ABORTAVA o sync inteiro — as NFs
// (tabelas dedicadas) nunca eram baixadas. Agora: chave que não cabe é PULADA (warning), o loop
// segue. Retorna true se gravou, false se pulou por quota. Outros erros ainda lançam.
function _safeSetItemSync(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      gdpWarn('[sync] QuotaExceededError em ' + key + ' — chave PULADA (não aborta o sync)');
      return false;
    }
    throw e;
  }
}

// ===== BUSCA: NORMALIZAÇÃO (Story 20.10) =====
// Helper global de normalização de busca: remove acentos E pontuação, aplica lowercase + trim.
// Carregado em gdp-core.js (primeiro script), disponível para todos os módulos via window.
// Deve ser aplicado em AMBOS os lados da comparação (termo digitado E campo do registro).
// Ex.: "feijao" encontra "Feijão"; "12345678/0001" encontra "12.345.678/0001".
window.normalizeSearch = function (s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (acentos) — escape Unicode (robusto a encoding)
    .replace(/[^\w\s]/g, '')         // remove pontuação
    .toLowerCase()
    .trim();
};

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
const SUPABASE_KEY = window.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dnNqYXVkaGJnbHh0dHhhZW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY3OTAsImV4cCI6MjA5MDM4Mjc5MH0.jadqvmRvbZjtjATaF_4WWB6A44NF06whtEIyNNyCUGo";
// Entidades com tabela Supabase real — NÃO sincronizar via sync_data (gdpApi cuida)
const _SUPABASE_TABLE_KEYS = new Set([CONTRACTS_KEY, ORDERS_KEY, INVOICES_KEY, RECEIVABLES_KEY, PAYABLES_KEY, PROOFS_KEY, "gdp.usuarios.v1", "gdp.extratos.v1", "gdp.conciliacao.v1", "gdp.produtos.v1"]);
const GDP_SYNC_KEYS = [CONTRACTS_DELETED_KEY, ENTRY_INVOICES_KEY, PAYABLE_CATEGORIES_KEY, RECEIVABLE_CATEGORIES_KEY, PAYABLE_METHODS_KEY, RECEIVABLE_METHODS_KEY, CAIXA_STATEMENT_KEY, STOCK_KEY, ESTOQUE_INTEL_PRODUCTS_KEY, ESTOQUE_INTEL_PACKAGES_KEY, ESTOQUE_INTEL_ORDERS_KEY, ESTOQUE_INTEL_ORDER_ITEMS_KEY, ESTOQUE_INTEL_MOVES_KEY, ESTOQUE_INTEL_SUPPLIERS_KEY, ESTOQUE_INTEL_PURCHASES_KEY, INTEGRATIONS_KEY, "caixaescolar.banco.v1", GDP_EQUIV_KEY, GDP_CONVERSOES_KEY, GDP_DEMANDAS_KEY, GDP_ESTOQUE_SIMPLES_KEY, GDP_COMPRAS_KEY, "nexedu.config.contas-bancarias", "nexedu.config.notas-fiscais", "nexedu.config.bank-api", "nexedu.usuarios", "nexedu.empresa", "gdp.produtos.v1", "gdp.extratos.deleted.v1", "gdp.conciliacao.deleted.v1", "gdp.estoque-intel.movimentacoes.deleted.v1"];
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
  const base = [
    localStorage.getItem(GDP_SYNC_USER_KEY),
    emp.syncUserId,
    emp.nomeFantasia,
    emp.nome,
    emp.razaoSocial,
    cnpjDigits,
    emp.cnpj,
    GDP_SYNC_FALLBACK_USER,
    "default"
  ].map((value) => String(value || "").trim()).filter(Boolean);
  // Fix (Central zerada): inclui variantes de caixa de cada candidato. O lookup no
  // Supabase é case-sensitive — dados gravados como "Lariucci" ficavam invisíveis a
  // uma sessão resolvida como "LARIUCCI" (e vice-versa). Adicionar UPPER/lower garante
  // que o fallback de cloudLoadAll encontre o registro com dados, qualquer que seja a caixa.
  const withCaseVariants = [];
  for (const v of base) {
    withCaseVariants.push(v);
    const up = v.toUpperCase();
    const lo = v.toLowerCase();
    if (up !== v) withCaseVariants.push(up);
    if (lo !== v) withCaseVariants.push(lo);
  }
  return [...new Set(withCaseVariants)];
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
  if (_gdpBootInProgress) return; // Block cloud saves during boot
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
  // Keys gerenciadas pelo gdpApi (tabelas reais) — ignorar no sync legado.
  // ADR-003: conciliacao/extratos entram aqui — o blob sync_data legado NÃO carrega extratoId
  // e sobrescrevia a tabela íntegra (gdpApi), zerando o vínculo extratoId → extrato "0/0".
  // A verdade do caixa vem SÓ da tabela (carregada em gdp-init.js Supabase-First).
  // 2026-06-25 (causa-raiz divergência entre máquinas): 'gdp.produtos.v1' (SSoT de 457 produtos
  // operacionais) entra aqui. Antes NÃO estava → syncFromCloud sobrescrevia a SSoT com o blob
  // legado (last-write-wins), esvaziando o catálogo numa máquina ("Central mostra 3") e
  // divergindo na outra ("202/457"). Os 457 foram migrados para a tabela 'produtos' (Supabase
  // = fonte única). Agora o blob legado NÃO toca mais a SSoT.
  const _GDPAPI_KEYS = new Set(['gdp.contratos.v1','gdp.pedidos.v1','gdp.notas-fiscais.v1','gdp.contas-receber.v1','gdp.contas-pagar.v1','gdp.entregas.provas.v1','gdp.usuarios.v1','gdp.conciliacao.v1','gdp.extratos.v1','gdp.produtos.v1']);

  // Story 4.83-fix: Pré-carregar TODAS as chaves .deleted.v1 do cloud ANTES do loop principal.
  // Em browser novo, localStorage não tem deleted.v1 — sem isso, o filtro na passada principal
  // não encontra os IDs deletados e restaura extrato/conciliacao que deveria estar morto.
  const _cloudDeletedCache = {};
  for (const row of rows) {
    if (row.key && row.key.endsWith('.deleted.v1') && row.data) {
      try {
        const cloudDeleted = Array.isArray(row.data) ? row.data : [];
        if (cloudDeleted.length > 0) {
          // Merge com localStorage existente (pode já ter dados locais)
          let localDel;
          try { localDel = JSON.parse(localStorage.getItem(row.key) || '[]'); } catch(_) { localDel = []; }
          const merged = [...new Set([...localDel, ...cloudDeleted])];
          _safeSetItemSync(row.key, JSON.stringify(merged));
          _cloudDeletedCache[row.key] = new Set(merged);
          gdpLog('[Sync] Pre-loaded deleted IDs from cloud:', row.key, merged.length, 'ids');
        }
      } catch(_) {}
    }
  }

  for (const row of rows) {
    if (_GDPAPI_KEYS.has(row.key)) continue; // managed by gdpApi, skip legacy sync
    // Skip .deleted.v1 keys — already pre-processed above
    if (row.key && row.key.endsWith('.deleted.v1')) { synced++; continue; }
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

    // Story 4.80: filter out ALL deleted items before writing (prevent zombie restore)
    // Story 4.83-fix: Agora usa _cloudDeletedCache (pre-loaded) + localStorage como fallback
    const _delKeyMap = {
      'gdp.conciliacao.v1': 'gdp.conciliacao.deleted.v1',
      'gdp.extratos.v1': 'gdp.extratos.deleted.v1',
      'gdp.notas-entrada.v1': 'gdp.notas-entrada.deleted.v1',
      'gdp.notas-fiscais.v1': 'gdp.notas-fiscais.deleted.v1',
      'gdp.contas-receber.v1': 'gdp.contas-receber.deleted.v1',
      'gdp.contas-pagar.v1': 'gdp.contas-pagar.deleted.v1',
      'gdp.pedidos.v1': 'gdp.pedidos.deleted.v1',
      'gdp.contratos.v1': 'gdp.contratos.deleted.v1',
      'gdp.estoque-intel.fornecedores.v1': 'gdp.estoque-intel.fornecedores.deleted.v1',
      'gdp.estoque-intel.movimentacoes.v1': 'gdp.estoque-intel.movimentacoes.deleted.v1'
    };
    const _delKey = _delKeyMap[row.key];
    if (_delKey) {
      // Prefer pre-loaded cloud cache, fallback to localStorage
      let deletedIds = _cloudDeletedCache[_delKey];
      if (!deletedIds) {
        try { deletedIds = new Set(JSON.parse(localStorage.getItem(_delKey) || '[]')); } catch (_) { deletedIds = new Set(); }
      }
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
      _safeSetItemSync(row.key, JSON.stringify(incomingData));
      synced++;
      continue;
    }

    // Compare timestamps: prefer data's internal updatedAt, fallback to Supabase row.updated_at
    // Story 20.15b: timestamp é o árbitro PRIMÁRIO da reconciliação. Calculado ANTES de
    // qualquer portão (movido do meio da cadeia) para que os bloqueios por contagem possam
    // ser condicionados a ele (nuvem comprovadamente mais nova vence).
    const cloudTime = getDataTimestamp(incomingData, row.updated_at);
    const localTime = getDataTimestamp(localData);
    const cloudIsNewer = cloudTime > localTime; // árbitro primário
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

    // Story 20.15b (AC3 — guarda DURA, absoluta): nuvem zerada NUNCA apaga local.
    // Vem ANTES de qualquer relaxamento por timestamp: se a nuvem retorna 0 entries
    // mas o local tem N>0, o local é preservado independentemente do timestamp.
    // Esta é a única exceção em que a contagem ainda manda sobre o tempo — fecha o
    // risco reaberto ao condicionar os portões 1/4 ao timestamp (incidente cloud-zerado).
    if (cloudItems === 0 && localItems > 0) {
      gdpLog("[Sync] AC3: cloud zerado para", row.key, "— local preservado (", localItems, "entries)");
      continue;
    }

    // Story 20.15b (Portão 1): bloqueio por contagem deixa de ser ABSOLUTO.
    // Só aborta se o local tem mais entries E o local NÃO é mais antigo que a nuvem
    // (cloudTime <= localTime). Se a nuvem é comprovadamente mais nova, NÃO aborta aqui —
    // segue para o merge do Portão 2, que preserva entries locais órfãs
    // (mergeArraysPreservingItens) sem perder o que só existe no local. Resolve a
    // divergência crônica em que +1 entry local travava a nuvem nova para sempre.
    if (localHasContent && !cloudHasMoreContent && cloudTime <= localTime) {
      gdpLog("[Sync] Bloqueado: local tem mais entries e nao e mais antigo que cloud para", row.key, "local:", localItems, "cloud:", cloudItems, "cloudTime<=localTime");
      continue;
    }

    // Story 2.1: se cloud tem menos itens nested (produtos em pedidos), NÃO sobrescrever
    if (localDeepItens > 0 && !cloudHasMoreDeepContent) {
      gdpLog("[Sync] Bloqueado: local tem mais itens nested que cloud para", row.key, "localDeep:", localDeepItens, "cloudDeep:", cloudDeepItens);
      // Merge: manter pedidos locais que têm mais itens, aceitar rest do cloud
      if (localArr.length > 0 && cloudArr.length > 0 && localData?.items) {
        let merged = mergeArraysPreservingItens(localArr, cloudArr);
        // Story 4.80: re-filter deleted after merge
        const _mDelKey = _delKeyMap[row.key];
        if (_mDelKey) { try { const _mDel = new Set(JSON.parse(localStorage.getItem(_mDelKey) || '[]')); if (_mDel.size > 0) merged = merged.filter(it => !_mDel.has(it.id)); } catch(_) {} }
        const mergedData = { ...incomingData, items: merged, updatedAt: new Date().toISOString() };
        _safeSetItemSync(row.key, JSON.stringify(mergedData));
        gdpLog("[Sync] Merge concluído para", row.key, "— preservou itens locais mais completos");
        synced++;
      }
      continue;
    }

    // Story 4.65 + 20.15b (Portão 3 / AC4): dirty window protege APENAS edição ativa
    // REAL do usuário. Critério objetivo: o último save local desta chave foi 'user'
    // E ocorreu há < 5s. Saves de boot/sync/migração ('system') NÃO travam mais a
    // sobrescrita — era isso que prendia dado antigo só porque o boot salvou há <5s.
    const msSinceLocalSave = Date.now() - getLastLocalSave(row.key);
    const recentUserEdit = msSinceLocalSave < 5000 && getLastLocalSaveOrigin(row.key) === 'user';
    if (recentUserEdit) {
      gdpLog("[Sync] SKIP overwrite for", row.key, "- edição ativa do usuário há", msSinceLocalSave, "ms (dirty window)");
      continue;
    }

    // Story 4.65: conciliacao/extratos usam timestamp (nao isSharedKey) para respeitar exclusoes locais
    // (mirror of app-sync.js:150-154 protection — Story 4.64 invariant #3)
    const useTimestampOnly = row.key === 'gdp.conciliacao.v1' || row.key === 'gdp.extratos.v1';
    // Story 20.15b (Portão 4): timestamp passa a ser a condição PRIMÁRIA.
    // Quando a nuvem é comprovadamente mais nova E não-destrutiva (não perde itens
    // nested), ela vence — resolve o AC1 (empate de contagem 120==120 + nuvem nova).
    // As regras antigas (isSharedKey por contagem; cloud vazio com local sem timestamp)
    // permanecem como guardas adicionais. Se a nuvem é mais nova mas teria MENOS .itens
    // nested, NÃO entra aqui — cai no merge do Portão 2 (preserva — AC2).
    const shouldWrite = useTimestampOnly
      ? (cloudTime > localTime || (!localTime && cloudTime === 0))
      : (
          (cloudIsNewer && cloudHasMoreDeepContent)                         // NOVO: nuvem nova + não-destrutiva vence (AC1)
          || (isSharedKey && cloudHasMoreContent && cloudHasMoreDeepContent) // regra antiga (chaves compartilhadas)
          || (cloudTime > localTime && cloudHasMoreDeepContent)              // regra antiga (redundante c/ a nova, mantida p/ clareza)
          || (!localTime && cloudTime === 0)                                 // regra antiga (local sem timestamp)
        );
    if (shouldWrite) {
      // Story 8.23 AC2: Preserve produto_critico and unidade_base from local estoque-intel products
      // When cloud overwrites, merge critical fields from local products that were explicitly set
      if (row.key === ESTOQUE_INTEL_PRODUCTS_KEY && localArr.length > 0 && cloudArr.length > 0) {
        const localProdMap = new Map();
        localArr.forEach(function(p) { if (p && p.id) localProdMap.set(p.id, p); });
        var finalItems = cloudArr.map(function(cloudProd) {
          var localProd = cloudProd && cloudProd.id ? localProdMap.get(cloudProd.id) : null;
          if (localProd) {
            // Preserve produto_critico if local is true (user explicitly marked it)
            if (localProd.produto_critico && !cloudProd.produto_critico) {
              cloudProd.produto_critico = true;
              gdpLog("[Sync] Preserved produto_critico=true for", cloudProd.id);
            }
            // Preserve unidade_base if local was explicitly changed (not default "UN")
            if (localProd.unidade_base && localProd.unidade_base !== cloudProd.unidade_base) {
              cloudProd.unidade_base = localProd.unidade_base;
            }
          }
          return cloudProd;
        });
        // Add local-only products not in cloud
        localArr.forEach(function(lp) {
          if (lp && lp.id && !cloudArr.some(function(cp) { return cp.id === lp.id; })) finalItems.push(lp);
        });
        if (incomingData && incomingData.items) incomingData = { ...incomingData, items: finalItems };
        else incomingData = { _v: 1, updatedAt: new Date().toISOString(), items: finalItems };
      }
      _safeSetItemSync(row.key, JSON.stringify(incomingData));
      synced++;
    }
  }
  return { restored: synced > 0, rowCount: rows.length, source: "cloud", lastSyncAt: newest };
}

async function syncToCloud(signal) {
  setGdpSyncState({ status: "syncing", source: "cloud", detail: "Publicando alteracoes locais" });
  const promises = GDP_SYNC_KEYS.map(async (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      // ADR-003: caixa = fonte única = tabela Supabase (gdpApi). NÃO publicar o blob sync_data
      // legado de conciliacao/extratos — ele não carrega extratoId e re-gerava o blob stale que
      // sobrescrevia a tabela íntegra (bug do extrato "0/0"). gdpApi já persiste cada item na tabela.
      if (_SUPABASE_TABLE_KEYS.has(key)) return;
      // Story 4.64: never upload conciliacao/extratos in legacy array format
      if ((key === 'gdp.conciliacao.v1' || key === 'gdp.extratos.v1') && Array.isArray(data)) return;
      // Story 4.83-fix: Proteger conciliação — nunca publicar listas corrompidas
      if (key === 'gdp.conciliacao.deleted.v1' && Array.isArray(data) && data.length > 30) {
        gdpLog("[Sync] BLOCKED corrupted conciliacao.deleted.v1 (" + data.length + " ids)");
        return;
      }
      if (key === 'gdp.extratos.deleted.v1' && Array.isArray(data) && data.some(function(id) { return id && !id.startsWith('ext-recovered-'); })) {
        gdpLog("[Sync] BLOCKED extratos.deleted.v1 with real extrato IDs");
        return;
      }
      // Story 4.83-fix: Nunca sobrescrever conciliação/extratos no cloud com menos itens (proteção anti-perda)
      if ((key === 'gdp.conciliacao.v1' || key === 'gdp.extratos.v1') && data?.items && Array.isArray(data.items)) {
        try {
          var _cloudCheck = await fetch(SUPABASE_URL + '/rest/v1/sync_data?user_id=eq.' + encodeURIComponent(getSyncUserId()) + '&key=eq.' + encodeURIComponent(key) + '&select=data', { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
          if (_cloudCheck.ok) {
            var _cloudRows = await _cloudCheck.json();
            var _cloudCount = (_cloudRows[0]?.data?.items || []).length;
            if (_cloudCount > 0 && data.items.length < _cloudCount) {
              gdpLog("[Sync] BLOCKED " + key + " upload: local=" + data.items.length + " cloud=" + _cloudCount + " — keeping cloud");
              return;
            }
          }
        } catch(_) {}
      }
      // Guard: skip empty data UNLESS it has a recent updatedAt (legitimate deletion)
      const hasRecentUpdate = data?.updatedAt && (Date.now() - new Date(data.updatedAt).getTime()) < 300000;
      if (!hasRecentUpdate) {
        if (Array.isArray(data) && data.length === 0) return;
        if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return;
      }
      return cloudSave(key, data, signal);
    }
    catch(_) {}
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
// Story 4.80: flag para bloquear cloud sync durante boot (migrações disparam saves que geram 20+ POST)
var _gdpBootInProgress = true;
function schedulCloudSync() {
  if (_gdpBootInProgress) return;
  if (_syncTimeout) clearTimeout(_syncTimeout);
  if (_gdpSyncAbort) _gdpSyncAbort.abort();
  setGdpSyncState({ status: "pending", source: "cloud", detail: "Aguardando envio automatico" });
  _syncTimeout = setTimeout(() => {
    _gdpSyncAbort = new AbortController();
    syncToCloud(_gdpSyncAbort.signal).catch(() => {});
  }, 10000); // 10s debounce (era 2s — reduziu sobrecarga no Supabase)
}

async function forcarSyncCompleto() {
  if (!confirm('Atualizar com os dados da nuvem?\n\nA tela será atualizada com os dados mais recentes do Supabase (fonte da verdade). Suas edições já foram salvas automaticamente quando você as fez — este botão apenas BAIXA o estado atual.')) return;
  try {
    setGdpSyncState({ status: "syncing", detail: "Atualizando da nuvem..." });
    // ARCH-sync (carimbão do Force Sync — FAIL pós-deploy 2026-06-23): REMOVIDO o UPLOAD em massa.
    // Antes este botão fazia gdpApi[t].saveAll(lista_inteira_do_localStorage) ANTES de baixar.
    // Num navegador com cache VELHO, isso SOBRESCREVIA o Supabase com dados desatualizados/danificados
    // (ex.: reverteu 22 NFs recuperadas — todas com mesmo updated_at). O navegador NUNCA deve empurrar
    // a lista inteira: as edições reais já são persistidas por registro (save por id) no momento da ação.
    // O Force Sync agora SÓ BAIXA (download abaixo). O servidor é a fonte da verdade.
    showToast("Atualizando: baixando dados do cloud...", 2000);
    // Story 4.83: NÃO deletar conciliação/extratos — dados desaparecem se cloud falhar
    // Apenas notas-entrada e fornecedores são safe to clear (não são dados financeiros críticos)
    localStorage.removeItem("gdp.notas-entrada.v1");
    localStorage.removeItem("gdp.estoque-intel.fornecedores.v1");
    // ANTI-QUOTA (incidente 2026-06-24): GC preventivo de chaves PESADAS e recriáveis antes do
    // download. No PC do usuário o localStorage estourou (~5MB) e o setItem do sync_data legado
    // lançava QuotaExceededError, ABORTANDO todo o forcarSyncCompleto antes de baixar as NFs.
    // Estas chaves são backups/efêmeras (recriáveis) — liberá-las dá espaço para o download.
    ["gdp.produtos.backup-pre-ssot.v1", "gdp.estoque-intel.previews.v1", "caixaescolar.b2b-scrape-cache.v1"]
      .forEach(function(k){ try { localStorage.removeItem(k); } catch(_){} });
    // Fix (Central de Produtos zerada): NÃO deletar produtos cegamente antes do download.
    // O sync key-value não tem a proteção "cloud 0 → restaura local" das tabelas dedicadas,
    // então um cloud vazio/identidade errada (casing user_id) zerava a Central de vez.
    // Snapshot antes; se o cloud não repovoar, restaura o local.
    const _produtosBefore = localStorage.getItem("gdp.produtos.v1");
    let _produtosCountBefore = 0;
    try { const p = JSON.parse(_produtosBefore || 'null'); _produtosCountBefore = (p?.itens || p?.items || (Array.isArray(p) ? p : [])).length || 0; } catch (_) {}
    localStorage.removeItem("gdp.produtos.v1");
    // ANTI-QUOTA (incidente 2026-06-24): o syncFromCloud é o sync_data LEGADO e faz setItem cru de
    // várias chaves auxiliares. Se UMA estourar a quota (ex.: gdp.notas-entrada.v1 gigante), a exceção
    // borbulhava e ABORTAVA todo o forcarSyncCompleto — as NFs (tabelas dedicadas, abaixo) nunca eram
    // baixadas. Agora o sync legado é tolerante a falha: se quebrar, logamos e SEGUIMOS para o full
    // load das tabelas dedicadas (gdpApi), que é a fonte de verdade e o que realmente importa p/ NF.
    let result = { restored: false, rowCount: 0 };
    try {
      result = await syncFromCloud({ force: true });
    } catch (eSync) {
      gdpWarn('[ForceSync] sync_data legado falhou (segue para tabelas dedicadas):', eSync && eSync.message);
    }
    // SAFETY: se o cloud não trouxe produtos mas o local tinha, restaura o snapshot.
    try {
      const after = JSON.parse(localStorage.getItem("gdp.produtos.v1") || 'null');
      const countAfter = (after?.itens || after?.items || (Array.isArray(after) ? after : [])).length || 0;
      if (countAfter === 0 && _produtosCountBefore > 0 && _produtosBefore) {
        localStorage.setItem("gdp.produtos.v1", _produtosBefore);
        gdpWarn('[ForceSync] PROTECAO: gdp.produtos.v1 retornou 0 do cloud mas tinha ' + _produtosCountBefore + ' local — mantido localStorage');
      }
    } catch (_) {}

    // Também fazer full load das tabelas dedicadas do Supabase (pedidos, contratos, etc.)
    // PROTEÇÃO: se Supabase retornar 0 rows mas localStorage tinha dados, NÃO zerar
    if (window.gdpApi) {
      // FIX (2026-06-25 — "Atualizar da Nuvem" nunca trazia os produtos): 'produtos' FALTAVA
      // nesta lista. O botao apagava gdp.produtos.v1 (linha ~689), o sync legado nao traz produtos
      // (estao na TABELA, nao no blob), o full-load pulava produtos, e a PROTECAO restaurava os 3
      // antigos locais. Por isso a maquina do usuario ficava ETERNAMENTE em 3 produtos enquanto o
      // servidor tinha 671. Adicionando 'produtos' aqui, o botao finalmente baixa os 671 da tabela.
      const tables = ['contratos', 'pedidos', 'notas_fiscais', 'contas_receber', 'contas_pagar', 'entregas', 'extratos', 'conciliacoes', 'produtos'];
      const lsKeys = { contratos: 'gdp.contratos.v1', pedidos: 'gdp.pedidos.v1', notas_fiscais: 'gdp.notas-fiscais.v1', contas_receber: 'gdp.contas-receber.v1', contas_pagar: 'gdp.contas-pagar.v1', entregas: 'gdp.entregas.provas.v1', extratos: 'gdp.extratos.v1', conciliacoes: 'gdp.conciliacao.v1', produtos: 'gdp.produtos.v1' };
      for (const table of tables) {
        try {
          if (window.gdpApi[table] && window.gdpApi[table].list) {
            // Snapshot do localStorage ANTES do list (que pode zerar)
            const lsBefore = localStorage.getItem(lsKeys[table]);
            let countBefore = 0;
            try { const parsed = JSON.parse(lsBefore || 'null'); countBefore = parsed?.items?.length || (Array.isArray(parsed) ? parsed.length : 0); } catch(_) {}

            const rows = await window.gdpApi[table].list();
            const countAfter = Array.isArray(rows) ? rows.length : 0;
            gdpLog('[ForceSync] ' + table + ': ' + countAfter + ' rows from Supabase (antes: ' + countBefore + ')');

            // SAFETY: se cloud retornou 0 mas localStorage tinha dados, restaurar
            if (countAfter === 0 && countBefore > 0 && lsBefore) {
              localStorage.setItem(lsKeys[table], lsBefore);
              gdpWarn('[ForceSync] PROTECAO: ' + table + ' retornou 0 do cloud mas tinha ' + countBefore + ' local — mantido localStorage');
            } else if (countAfter > 0) {
              // 2026-06-25: GRAVAR explicitamente os dados baixados no formato wrapped que a tela lê.
              // Antes o list() nao persistia garantidamente -> "Atualizar da Nuvem" baixava mas a tela
              // nao via. Agora grava { _v, items } com fallback de quota (libera memoria + retry).
              try {
                const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: rows };
                try {
                  localStorage.setItem(lsKeys[table], JSON.stringify(wrapped));
                } catch (eq) {
                  if (typeof window._liberarMemoriaRecuperavel === 'function') window._liberarMemoriaRecuperavel();
                  try { localStorage.setItem(lsKeys[table], JSON.stringify(wrapped)); }
                  catch (eq2) {
                    let light = rows;
                    if (table === 'notas_fiscais' && typeof window._stripNfHeavy === 'function') light = rows.map(window._stripNfHeavy);
                    localStorage.setItem(lsKeys[table], JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: light }));
                  }
                }
                // produtos: re-hidratar a Central a partir do que foi baixado
                if (table === 'produtos' && window.ProductStore && window.ProductStore.reload) {
                  try { window.ProductStore.reload(); } catch (_) {}
                }
              } catch (_) {}
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

// Lightweight config-only sync from cloud (runs at boot, non-blocking)
var GDP_CONFIG_SYNC_KEYS = [
  "nexedu.empresa", "nexedu.usuarios", "nexedu.config.notas-fiscais",
  "nexedu.config.contas-bancarias", "nexedu.config.bank-api"
];

async function syncConfigFromCloud() {
  var rows = await cloudLoadAll();
  if (!rows || rows.length === 0) return;
  var applied = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (GDP_CONFIG_SYNC_KEYS.indexOf(row.key) === -1 || !row.data) continue;
    var local = localStorage.getItem(row.key);
    var localData = null;
    try { localData = local ? JSON.parse(local) : null; } catch (_) {}
    var cloudTime = getDataTimestamp(row.data, row.updated_at);
    var localTime = localData ? getDataTimestamp(localData) : 0;
    if (!localData || cloudTime > localTime) {
      _safeSetItemSync(row.key, JSON.stringify(row.data));
      applied++;
    } else if (localData && row.key === "nexedu.config.notas-fiscais") {
      // Merge: preserve logomarcaBase64 from cloud if missing locally
      if (row.data.logomarcaBase64 && !localData.logomarcaBase64) {
        localData.logomarcaBase64 = row.data.logomarcaBase64;
        _safeSetItemSync(row.key, JSON.stringify(localData));
        applied++;
        gdpLog("[Sync] Logomarca restored from cloud (merge)");
      }
    }
  }
  if (applied > 0) {
    gdpLog("[Sync] Config keys restored from cloud:", applied);
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
    // Story 4.74: cr-filtro-categoria agora filtra por emissão — populado separadamente em renderContasReceber
    // { id: "cr-filtro-categoria", tipo: "receber", includeCreate: false, defaultValue: "" }
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

// ARCH-sync Passo 1: helper de leitura da janela de BOOT. REUSA a flag _gdpBootInProgress
// já existente (declarada acima, Story 4.80) — ligada no início do boot e desligada em
// gdp-init.js após o boot+migrations (que também chama _flushPendingBootSaves). Durante o
// boot, savePedidos()/saveNotasFiscais() SEM changedId NÃO reescrevem a lista inteira no
// Supabase (era o "carimbão em massa" que sobrescrevia o estado correto de outros navegadores).
function gdpIsBooting() { return typeof _gdpBootInProgress !== 'undefined' && _gdpBootInProgress === true; }
if (typeof window !== 'undefined') window.gdpIsBooting = gdpIsBooting;

// Story 20.15b (AC4): registrar a ORIGEM do último save por chave.
// 'user' = save disparado por edição ativa do usuário na UI; 'system' = boot/sync/
// migração/bulk. Default seguro = 'system' (não trava a dirty window). A dirty window
// só protege saves 'user' recentes (digitação real em andamento).
const _lastLocalSaveOrigin = {};
function getLastLocalSaveOrigin(key) { return _lastLocalSaveOrigin[key] || 'system'; }
// Helper público: os handlers de escrita de UI chamam isto logo ANTES de salvar
// (ou passam origin='user' ao saveWrappedArray) para marcar a edição como do usuário.
function gdpMarkUserEdit(key) { _lastLocalSave[key] = Date.now(); _lastLocalSaveOrigin[key] = 'user'; }
if (typeof window !== 'undefined') window.gdpMarkUserEdit = gdpMarkUserEdit;

// Incidente QuotaExceededError (2026-06-23, parte 2): GC global do localStorage.
// Remove campos pesados (XML, PDF base64, danfe raw) de TODAS as entidades para
// liberar espaco quando o quota (~5MB compartilhado) estoura. Os dados completos
// permanecem no Supabase (fonte da verdade) e na memoria — so a copia local e enxuta.
// Retorna true se conseguiu liberar algo.
function _gcLocalStorage() {
  var freed = false;
  // 1) Notas fiscais — reaproveita _stripNfHeavy (XML/previews/transmissao).
  try {
    var rawNf = localStorage.getItem(INVOICES_KEY);
    if (rawNf && typeof _stripNfHeavy === 'function') {
      var nfArr = unwrapData(JSON.parse(rawNf));
      if (Array.isArray(nfArr) && nfArr.length) {
        var beforeNf = rawNf.length;
        var lightNf = nfArr.map(_stripNfHeavy);
        var wNf = { _v: 1, updatedAt: new Date().toISOString(), items: lightNf };
        var strNf = JSON.stringify(wNf);
        if (strNf.length < beforeNf) { localStorage.setItem(INVOICES_KEY, strNf); freed = true; }
      }
    }
  } catch (_) {}
  // 2) Notas de entrada — xmlRaw + danfe raw (150-300KB cada).
  try {
    var rawNe = localStorage.getItem(ENTRY_INVOICES_KEY);
    if (rawNe) {
      var neArr = unwrapData(JSON.parse(rawNe));
      if (Array.isArray(neArr) && neArr.length) {
        var beforeNe = rawNe.length;
        var lightNe = neArr.map(function (ne) {
          var l = Object.assign({}, ne);
          delete l.xmlRaw;
          if (l.danfe) { l.danfe = Object.assign({}, l.danfe); delete l.danfe.rawHtml; delete l.danfe.rawXml; }
          return l;
        });
        var strNe = JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: lightNe });
        if (strNe.length < beforeNe) { localStorage.setItem(ENTRY_INVOICES_KEY, strNe); freed = true; }
      }
    }
  } catch (_) {}
  // 3) Contas a receber / a pagar — campos pesados (PDF/URL base64 do boleto).
  // FIX QUOTA (2026-06-25): usa _stripContaHeavy (remove invoiceUrl/bankSlipUrl além de boletoPdfBase64).
  // Antes só removia boletoPdfBase64/pdfBase64 → invoiceUrl/bankSlipUrl (54KB cada) escapavam.
  [RECEIVABLES_KEY, PAYABLES_KEY].forEach(function (k) {
    try {
      var raw = localStorage.getItem(k);
      if (!raw) return;
      var arr = unwrapData(JSON.parse(raw));
      if (!Array.isArray(arr) || !arr.length) return;
      var before = raw.length;
      var light = arr.map(_stripContaHeavy);
      var str = JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: light });
      if (str.length < before) { localStorage.setItem(k, str); freed = true; }
    } catch (_) {}
  });
  if (freed) gdpLog('[GC] localStorage: campos pesados removidos p/ liberar quota');
  return freed;
}
// Pendência 1 camada C: expor o GC p/ o writeLS do gdpApi (gdp-api.js) retentar após liberar quota.
if (typeof window !== 'undefined') window._gcLocalStorage = _gcLocalStorage;

// ===== AVISO DE QUOTA (Pendência 1, camada D) =====
// Mede o uso aproximado do localStorage; perto do limite (~5MB), avisa o usuário ANTES de a tela
// zerar, com a opção de limpar o cache de forma segura (remove só chaves pesadas + re-sync do
// servidor — equivalente ao localStorage.clear()+reload que hoje o usuário faz manualmente no F12).
function _localStorageUsageBytes() {
  var total = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      if (k) total += k.length;
      if (v) total += v.length;
    }
  } catch (_) {}
  return total * 2; // UTF-16: ~2 bytes por char (estimativa conservadora)
}
// Bases com tabela própria no Supabase — recuperáveis no boot (Supabase-First).
// Apagar estas do localStorage é SEGURO: voltam do servidor leves no próximo carregamento.
var _RECUPERAVEIS_SUPABASE = ['gdp.produtos.v1','gdp.notas-fiscais.v1','gdp.contratos.v1','gdp.pedidos.v1','gdp.contas-receber.v1','gdp.contas-pagar.v1','gdp.extratos.v1','gdp.conciliacao.v1','gdp.notas-entrada.v1','intel.central-produtos.v2','gdp.estoque-intel.produtos.v1','caixaescolar.banco.v1'];

// Libera memória apagando SÓ bases recuperáveis do servidor. Retorna MB liberados.
// 2026-06-25: substitui a versão antiga que só removia notas-entrada (0.1MB = placebo).
function _liberarMemoriaRecuperavel() {
  var liberado = 0;
  for (var i = 0; i < _RECUPERAVEIS_SUPABASE.length; i++) {
    var k = _RECUPERAVEIS_SUPABASE[i];
    try {
      var v = localStorage.getItem(k);
      if (v) { liberado += (k.length + v.length) * 2; localStorage.removeItem(k); }
    } catch (_) {}
  }
  return liberado / (1024 * 1024);
}
if (typeof window !== 'undefined') window._liberarMemoriaRecuperavel = _liberarMemoriaRecuperavel;

// FIX DEFINITIVO DE MEMÓRIA (2026-06-25): comprime as bases pesadas no localStorage mantendo
// os REGISTROS (a tela continua mostrando tudo) mas removendo CAMPOS pesados recuperáveis do
// servidor (XML, PDFs base64, previews, rawResponse). Roda SEMPRE no boot — não depende de
// limiar. Causa-raiz da "memória cheia" recorrente: o navegador guardava dados COMPLETOS quando
// só precisa do essencial para a tela. Aplica strip universal em NFs/contas e comprime wrappers.
function _comprimirBasesPesadas() {
  var antes = _localStorageUsageBytes();
  // 1. Notas fiscais — versão LEVE-DE-LISTA no localStorage (reduz ~83%). O detalhe completo é
  //    re-hidratado do Supabase ao abrir a nota (verNotaFiscal/email → _hidratarNotaCompleta).
  //    A RAM (variável notasFiscais) NÃO é tocada aqui — só o cache em disco fica leve.
  try {
    var nfRaw = JSON.parse(localStorage.getItem(INVOICES_KEY) || 'null');
    if (nfRaw) {
      var nfArr = nfRaw.items || nfRaw.itens || (Array.isArray(nfRaw) ? nfRaw : []);
      if (nfArr.length) {
        var light = (typeof _nfListaLeve === 'function') ? nfArr.map(_nfListaLeve)
                  : (typeof _stripNfHeavy === 'function' ? nfArr.map(_stripNfHeavy) : nfArr);
        localStorage.setItem(INVOICES_KEY, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: light }));
      }
    }
  } catch (_) {}
  // 2. Contas a receber/pagar — strip de cobrança pesada (boleto PDF/QR base64)
  try {
    [RECEIVABLES_KEY, PAYABLES_KEY].forEach(function (key) {
      if (typeof _stripContaHeavy !== 'function') return;
      var raw = JSON.parse(localStorage.getItem(key) || 'null');
      if (!raw) return;
      var arr = raw.items || raw.itens || (Array.isArray(raw) ? raw : []);
      if (arr.length) {
        var lt = arr.map(_stripContaHeavy);
        localStorage.setItem(key, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: lt }));
      }
    });
  } catch (_) {}
  // 3. Bases legadas REDUNDANTES de produtos (a verdade vive em gdp.produtos.v1 / tabela).
  ['intel.central-produtos.v2', 'gdp.estoque-intel.produtos.v1', 'caixaescolar.banco.v1'].forEach(function (k) {
    try { if (localStorage.getItem(k)) localStorage.removeItem(k); } catch (_) {}
  });
  var liberado = (antes - _localStorageUsageBytes()) / (1024 * 1024);
  if (liberado > 0.01) gdpLog('[quota-guard] Compressão de bases pesadas: liberados ' + liberado.toFixed(2) + 'MB.');
  return liberado;
}
if (typeof window !== 'undefined') window._comprimirBasesPesadas = _comprimirBasesPesadas;

// Limpeza segura: agora apaga TODAS as bases recuperáveis (servidor é a fonte). NÃO perde nada.
window.gdpLimparCacheSeguro = function() {
  try { if (typeof _gcLocalStorage === 'function') _gcLocalStorage(); } catch (_) {}
  var mb = _liberarMemoriaRecuperavel();
  showToast('Cache liberado (' + mb.toFixed(1) + 'MB). Recarregando para baixar os dados do servidor...', 3000);
  setTimeout(function(){ location.reload(); }, 1200);
};

// AUTO-LIMPEZA no boot: se a memória passou do limite APÓS o Supabase-First hidratar,
// remove os CAMPOS PESADOS das bases (não os registros) — preserva a estrutura que a tela lê,
// mas tira o peso (PDFs, XML, previews). Assim a Central/abas continuam mostrando os dados,
// só que leves. Roda 1x no fim do boot. Evita "memória cheia" e travamento sem esvaziar a tela.
function _autoLimparMemoriaSeAlta() {
  try {
    var mb = _localStorageUsageBytes() / (1024 * 1024);
    if (mb <= 6) return { skipped: true, mb: mb };
    // Estratégia segura: rodar o strip retroativo (remove campos pesados, MANTÉM os registros).
    // NÃO apaga gdp.produtos.v1 inteiro (a Central lê de lá) — só tira o peso de NFs/contas.
    var liberado = 0;
    try {
      var antesBytes = _localStorageUsageBytes();
      if (typeof _stripLocalStorageRetroativo === 'function') _stripLocalStorageRetroativo();
      // notas-entrada e bases legadas REDUNDANTES (produtos já vive em gdp.produtos.v1) podem sair inteiras.
      ['gdp.notas-entrada.v1','intel.central-produtos.v2','gdp.estoque-intel.produtos.v1','caixaescolar.banco.v1'].forEach(function(k){
        try { if (localStorage.getItem(k)) localStorage.removeItem(k); } catch(_) {}
      });
      liberado = (antesBytes - _localStorageUsageBytes()) / (1024 * 1024);
    } catch (_) {}
    gdpLog('[quota-guard] Auto-limpeza no boot: memória estava em ' + mb.toFixed(2) + 'MB, liberados ' + liberado.toFixed(2) + 'MB (campos pesados + bases redundantes).');
    return { cleaned: true, antes: mb, liberado: liberado };
  } catch (e) { return { erro: e && e.message }; }
}
if (typeof window !== 'undefined') window._autoLimparMemoriaSeAlta = _autoLimparMemoriaSeAlta;
function _checkQuotaWarning() {
  try {
    var bytes = _localStorageUsageBytes();
    var mb = bytes / (1024 * 1024);
    if (mb > 4.5) {
      gdpWarn('[quota-guard] localStorage em ' + mb.toFixed(2) + 'MB (perto do limite de ~5MB)');
      if (typeof showToast === 'function') {
        showToast('⚠️ Memória local quase cheia (' + mb.toFixed(1) + 'MB). Se as notas sumirem, clique aqui ou use "limpar cache". ', 8000);
      }
      // Botão programático seguro (sem depender de UI específica): expõe a ação no console e no toast.
      gdpLog('[quota-guard] Para liberar: window.gdpLimparCacheSeguro()');
    }
  } catch (_) {}
}
if (typeof window !== 'undefined') window._checkQuotaWarning = _checkQuotaWarning;

function saveWrappedArray(key, items, origin) {
  const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items };
  // Defesa de quota CENTRALIZADA (protege TODAS as chaves, nao so notas). Se o
  // setItem estourar, roda o GC global e retenta uma vez; se ainda falhar, NAO
  // propaga — os dados ja seguem p/ o Supabase via _pushNetworkSave abaixo + memoria.
  try {
    localStorage.setItem(key, JSON.stringify(wrapped));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') {
      console.warn('[GDP] localStorage cheio ao salvar ' + key + ' — rodando GC e retentando');
      var gained = _gcLocalStorage();
      try {
        localStorage.setItem(key, JSON.stringify(wrapped));
      } catch (e2) {
        // Ultima linha: dados intactos em memoria + Supabase. Nao quebra o fluxo (ex.: emissao de NF).
        console.error('[GDP] localStorage irrecuperavel p/ ' + key + ' (gc=' + gained + ') — seguindo via Supabase/memoria', e2 && e2.name);
      }
    } else {
      throw e;
    }
  }
  // Story 4.65: registrar timestamp do save local para dirty window protection
  _lastLocalSave[key] = Date.now();
  // Story 20.15b (AC4): classificar origem do save.
  // - origin explícito (passado pelo chamador) tem prioridade;
  // - senão, infere: durante o boot é sempre 'system'; pós-boot, um saveWrappedArray
  //   parte de uma ação de UI (o caminho de sync/sanitize usa localStorage.setItem
  //   direto, NÃO esta função). Default seguro continua sendo 'system' no boot.
  _lastLocalSaveOrigin[key] = origin || (_gdpBootInProgress ? 'system' : 'user');
  // Story 4.83: Skip network saves during boot (saveAll + cloudSave são ~15 POST requests bloqueantes)
  // Story 20.15b (Portão 5 / AC5): em vez de DESCARTAR o save de rede, ENFILEIRAR a chave.
  // O localStorage já foi gravado acima; só o push de rede é adiado. Ao fim do boot,
  // _flushPendingBootSaves() reenvia (assíncrono, deduplicado por Set → AC7 preservado).
  if (_gdpBootInProgress) { _pendingBootSaves.add(key); return; }
  _pushNetworkSave(key, wrapped, items);
}

// Story 20.15b (Portão 5): push de rede isolado, reutilizável pelo flush pós-boot.
function _pushNetworkSave(key, wrapped, items) {
  // Gravar no Supabase tabela real (fonte primária)
  const table = _LS_TO_TABLE[key];
  if (table && window.gdpApi && window.gdpApi[table]) {
    window.gdpApi[table].saveAll(items).catch(e => gdpWarn('[gdpApi] Save failed:', table, e));
  }
  // Cloud save legado (backup)
  cloudSave(key, wrapped).catch(() => {});
  schedulCloudSync();
}

// Story 20.15b (Portão 5 / AC5): chaves cujo save foi adiado durante o boot.
const _pendingBootSaves = new Set();
// Flush pós-boot: reenvia ao Supabase as alterações feitas durante o boot, lendo o
// estado ATUAL do localStorage por chave. Assíncrono e deduplicado (AC7: nada bloqueante).
function _flushPendingBootSaves() {
  if (_pendingBootSaves.size === 0) return;
  const keys = Array.from(_pendingBootSaves);
  _pendingBootSaves.clear();
  gdpLog('[Sync] Flush pós-boot de', keys.length, 'chave(s) adiadas:', keys.join(', '));
  keys.forEach(function(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const wrapped = JSON.parse(raw);
      const items = Array.isArray(wrapped?.items) ? wrapped.items : (Array.isArray(wrapped) ? wrapped : []);
      _pushNetworkSave(key, wrapped, items);
    } catch (e) { gdpWarn('[Sync] Falha no flush pós-boot de', key, e); }
  });
}
if (typeof window !== 'undefined') window._flushPendingBootSaves = _flushPendingBootSaves;
// ===== BLINDAGEM QUOTA LOCAL (Pendência 1, camada A) =====
// CAUSA-RAIZ: quando o localStorage estoura a quota, o list() do gdpApi traz os dados do servidor
// e popula gdpApi._memCache (SEMPRE — gdp-api.js:108), mas o localStorage.setItem falha em silêncio
// (gdp-api.js:112). loadData()/reloadFromLocalSilent() liam SÓ o localStorage (vazio) → array vazio
// → tela "Nenhuma nota fiscal", mesmo com os dados íntegros em memória e no servidor.
// FIX: hidratar do localStorage; se vier vazio/[], cair no _memCache (array cru já baixado pelo list()).
// Nunca zera a tela se há dados em memória. LEITURA-ONLY (não dispara save → não realimenta realtime).
function _hydrateWithMemFallback(lsKey) {
  try {
    var arr = unwrapData(JSON.parse(localStorage.getItem(lsKey) || 'null'));
    if (Array.isArray(arr) && arr.length) return arr; // localStorage tem dados → usa
  } catch (_) {}
  // localStorage vazio/corrompido (provável quota): usa o _memCache do gdpApi.
  try {
    var mem = window.gdpApi && window.gdpApi._memCache && window.gdpApi._memCache[lsKey];
    if (Array.isArray(mem) && mem.length) {
      gdpWarn('[quota-guard] ' + lsKey + ' vazio no localStorage — usando _memCache (' + mem.length + ' itens)');
      return mem.slice();
    }
  } catch (_) {}
  return [];
}
if (typeof window !== 'undefined') window._hydrateWithMemFallback = _hydrateWithMemFallback;

function loadData() {
  console.time('[GDP] loadData:parse');
  // Story 4.80: dirty flags removidos — save migrado para background
  try { contratosExcluidos = unwrapData(JSON.parse(localStorage.getItem(CONTRACTS_DELETED_KEY))); } catch(_) { contratosExcluidos = []; }
  // Story 4.83: defer sanitize pesado para depois do render (era 22s bloqueante por buscas O(n²))
  // Pendência 1 camada A: _hydrateWithMemFallback cai no gdpApi._memCache se o localStorage zerar por quota.
  try {
    contratos = applyDeletedContractsFilter(_hydrateWithMemFallback(CONTRACTS_KEY));
  } catch(_) { contratos = []; }
  try {
    pedidos = _hydrateWithMemFallback(ORDERS_KEY);
  } catch(_) { pedidos = []; }
  try { provasEntrega = JSON.parse(localStorage.getItem(PROOFS_KEY)) || []; } catch(_) { provasEntrega = []; }
  try { notasFiscais = _hydrateWithMemFallback(INVOICES_KEY); } catch(_) { notasFiscais = []; }
  // EPIC-19 (extensão): esconder notas soft-deletadas (deletedAt/deleted_at) — exclusão sincronizada via Supabase.
  notasFiscais = notasFiscais.filter(function(x){ return !(x && (x.deletedAt || x.deleted_at)); });
  // ARCH-sync (blindagem do número de NF): rede de segurança no CARREGAMENTO. A SEFAZ é a
  // fonte da verdade do número — ele está embutido na chave de acesso (chNFe, posições 26-34).
  // Se uma NF tem chave válida (44 díg) mas o numero está VAZIO ou DIVERGE da chave (ex.: resposta
  // SEFAZ parcial, ou número perdido), corrige numero = número-da-chave. Antes isso só rodava na
  // EMISSÃO (gdp-notas-fiscais.js); aqui passa a auto-corrigir TODA nota presente/futura no boot.
  // Escrita local-only direta (NÃO saveWrappedArray) p/ não disparar o carimbão (flush pós-boot).
  try {
    var _nfNumCorrigidas = 0;
    notasFiscais.forEach(function(nf) {
      if (!nf) return;
      // Só notas REAIS (nfe_real): em manual_externa o número é informado pelo usuário e NÃO
      // deve ser sobrescrito pela chave (a chave de uma manual externa pode ter outra origem).
      var _tipo = nf.tipo_nota || nf.tipoNota || "";
      if (_tipo && _tipo !== "nfe_real") return;
      var _ch = String((nf.sefaz && nf.sefaz.chaveAcesso) || nf.chave_acesso || nf.chaveAcesso || "").replace(/\D/g, "");
      if (_ch.length !== 44) return;
      var _numChave = parseInt(_ch.slice(25, 34), 10);
      if (!_numChave || _numChave <= 0) return;
      var _numChaveStr = String(_numChave);
      if (!nf.numero || nf.numero === "" || nf.numero === "0" || String(nf.numero) !== _numChaveStr) {
        if (nf.numero && String(nf.numero) !== _numChaveStr) {
          gdpWarn("[NF-e] Numero corrigido pela chave SEFAZ: " + nf.numero + " -> " + _numChaveStr + " (id " + (nf.id || "?") + ")");
        }
        nf.numero = _numChaveStr;
        _nfNumCorrigidas++;
      }
    });
    if (_nfNumCorrigidas > 0) {
      // local-only direto (anti-carimbão): grava a lista corrigida no localStorage sem enfileirar
      // no flush. O Supabase já tem a chave; o número é derivável dela, não precisa re-upsert em massa.
      try {
        var _lightCorr = (typeof _stripNfHeavy === "function") ? notasFiscais.map(_stripNfHeavy) : notasFiscais;
        localStorage.setItem(INVOICES_KEY, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: _lightCorr }));
      } catch(_) {}
      gdpLog("[boot] NF: " + _nfNumCorrigidas + " numero(s) corrigido(s) pela chave da SEFAZ");
    }
  } catch(_) { /* nunca bloqueia o boot */ }
  // Incidente QuotaExceededError (2026-06-23): destrava localStorage já estourado.
  // Reescreve gdp.notas-fiscais.v1 sem os campos pesados (XML/previews) — independente
  // de status. Sem isso, quem já está com o quota cheio continua recebendo o erro ao
  // emitir, mesmo após o deploy do fix. Roda só se detectar campo pesado presente.
  try {
    var _nfHeavy = notasFiscais.some(function(nf) {
      return nf && nf.sefaz && (nf.sefaz.xmlPreview || nf.sefaz.xmlDsigPreview || nf.sefaz.autorizacaoPreview ||
        (nf.sefaz.transmissao && (nf.sefaz.transmissao.xml || nf.sefaz.transmissao.rawResponse)) || nf.sefaz.xmlAutorizado) || (nf && nf.xml_autorizado);
    });
    if (_nfHeavy && typeof _stripNfHeavy === "function") {
      // ARCH-sync FIX-B (re-fix QA): localStorage DIRETO, NÃO saveWrappedArray. Este GC de
      // quota só destrava o localStorage local (stripa XML pesado) — NÃO deve ir ao Supabase.
      // Com saveWrappedArray, a chave entraria em _pendingBootSaves e o flush pós-boot faria
      // saveAll da lista inteira → carimbão. localStorage.setItem direto evita a fila.
      try {
        localStorage.setItem(INVOICES_KEY, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: notasFiscais.map(_stripNfHeavy) }));
        gdpLog('[boot] NF: stripped heavy XML/previews do localStorage (destrava quota)');
      } catch(_) {}
    }
  } catch(_) { /* quota/parse — segue; saveNotasFiscais tem fallback */ }
  // Story 4.80: removido saveNotasFiscais() no boot — re-save desnecessário bloqueava thread
  try {
    notasEntrada = unwrapData(JSON.parse(localStorage.getItem(ENTRY_INVOICES_KEY)));
    // Story 4.83: limpar xmlRaw/danfe pesados de notas existentes (evita estouro sync_data 500KB)
    var _neCleaned = 0;
    notasEntrada.forEach(function(ne) {
      if (ne.xmlRaw) { delete ne.xmlRaw; _neCleaned++; }
      if (ne.danfe && ne.danfe.rawHtml) { delete ne.danfe.rawHtml; _neCleaned++; }
      if (ne.danfe && ne.danfe.rawXml) { delete ne.danfe.rawXml; _neCleaned++; }
    });
    if (_neCleaned > 0) { saveNotasEntrada(); gdpLog('[boot] Cleaned ' + _neCleaned + ' heavy fields from notas de entrada'); }
  } catch(_) { notasEntrada = []; }
  try { contasPagar = _hydrateWithMemFallback(PAYABLES_KEY); } catch(_) { contasPagar = []; }
  try { contasReceber = _hydrateWithMemFallback(RECEIVABLES_KEY); } catch(_) { contasReceber = []; }
  // EPIC-19 Story 19.3: esconder soft-deletados (deletedAt/deleted_at) — exclusão sincronizada via Supabase.
  contasReceber = contasReceber.filter(function(x){ return !(x && (x.deletedAt || x.deleted_at)); });
  contasPagar = contasPagar.filter(function(x){ return !(x && (x.deletedAt || x.deleted_at)); });

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
  // FIX: filtrar movimentações deletadas (sync cross-device)
  try {
    var _delMovArr = JSON.parse(localStorage.getItem('gdp.estoque-intel.movimentacoes.deleted.v1') || '[]');
    if (_delMovArr.length > 0) { var _delMovSet = new Set(_delMovArr); var _bmov = estoqueIntelMovimentacoes.length; estoqueIntelMovimentacoes = estoqueIntelMovimentacoes.filter(function(x) { return !_delMovSet.has(x.id); }); if (_bmov > estoqueIntelMovimentacoes.length) gdpLog('[boot] Filtered ' + (_bmov - estoqueIntelMovimentacoes.length) + ' deleted movimentacoes'); }
  } catch(_) {}
  try { estoqueIntelFornecedores = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_SUPPLIERS_KEY))); } catch(_) { estoqueIntelFornecedores = []; }
  // FIX: filtrar fornecedores deletados
  try {
    var _delFornArr = JSON.parse(localStorage.getItem('gdp.estoque-intel.fornecedores.deleted.v1') || '[]');
    if (_delFornArr.length > 0) { var _delFornSet = new Set(_delFornArr); var _bforn = estoqueIntelFornecedores.length; estoqueIntelFornecedores = estoqueIntelFornecedores.filter(function(x) { return !_delFornSet.has(x.id); }); if (_bforn > estoqueIntelFornecedores.length) gdpLog('[boot] Filtered ' + (_bforn - estoqueIntelFornecedores.length) + ' deleted fornecedores'); }
  } catch(_) {}
  try { estoqueIntelCompras = unwrapData(JSON.parse(localStorage.getItem(ESTOQUE_INTEL_PURCHASES_KEY))); } catch(_) { estoqueIntelCompras = []; }
  try { integracoesGdp = unwrapData(JSON.parse(localStorage.getItem(INTEGRATIONS_KEY))); } catch(_) { integracoesGdp = []; }
  console.timeEnd('[GDP] loadData:parse');
  console.time('[GDP] loadData:migrations');

  // Story 4.58 AC-1: reconstruir extrato + migrar itens sem extratoId no boot
  try {
    var _concItems = loadConciliacao();
    var _bootExtratos = loadExtratos();

    // Story 4.83: Verificar se há extratos deletados rastreados — NÃO criar ghost extrato
    var _deletedExtIds = new Set();
    try { _deletedExtIds = new Set(JSON.parse(localStorage.getItem('gdp.extratos.deleted.v1') || '[]')); } catch(_) {}
    var _deletedConcIds = new Set();
    try { _deletedConcIds = new Set(JSON.parse(localStorage.getItem('gdp.conciliacao.deleted.v1') || '[]')); } catch(_) {}

    // Se há itens de conciliação mas ZERO extratos → reconstruir SOMENTE se não há deletados rastreados
    if (_concItems.length > 0 && _bootExtratos.length === 0 && _deletedExtIds.size === 0) {
      var _contaBancaria = 'Conta Principal';
      try {
        var _contas = JSON.parse(localStorage.getItem('nexedu.config.contas-bancarias') || '[]');
        var _padrao = _contas.find(function(c) { return c.padrao && c.ativa; }) || _contas[0];
        if (_padrao) _contaBancaria = (_padrao.banco || '') + (_padrao.apelido ? ' (' + _padrao.apelido + ')' : '') || 'Conta Principal';
      } catch(_) {}
      var _conciliados = _concItems.filter(function(i) { return i.conciliado; }).length;
      // EPIC-19 Story 19.4: ID DETERMINÍSTICO (idempotente). Antes usava Date.now(), o que fazia
      // cada navegador que bootava com cache de extratos vazio criar um 'ext-recovered' DIFERENTE,
      // gerando duplicatas no Supabase (causa do "1 extrato num PC, 2 noutro"). Derivando o id da
      // conta bancária, qualquer re-execução colapsa no MESMO registro via upsert.
      var _recoveredId = 'ext-recovered-' + String(_contaBancaria).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
    return { ...item, categoria: normalizeContaCategoriaRegistro("pagar", item?.categoria), forma: normalizeContaFormaRegistro(item?.forma) };
  });
  contasReceber = contasReceber.map((item) => {
    return { ...item, categoria: normalizeContaCategoriaRegistro("receber", item?.categoria), forma: normalizeContaFormaRegistro(item?.forma) };
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
  // Story 8.23 AC2: Preempt v6 — set its flag so it never runs on new browsers.
  // v6 hardcoded only 3 SKUs as critico and reset ALL others to false, destroying
  // user-added criticos. Now we skip v6 logic entirely — user data is source of truth.
  if (!localStorage.getItem("gdp.migration.criticos-exatos-v6")) {
    localStorage.setItem("gdp.migration.criticos-exatos-v6", new Date().toISOString());
    gdpLog("[migration] v6-preempt (Story 8.23): skipped destructive v6 reset — user criticos preserved");
  }
  // Migration v6: apenas 3 produtos críticos definidos pelo usuário — resetar todos os outros
  // NOTE: This migration is now preempted by the v6-preempt above and will never run
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
  console.time('[GDP] loadData:syncPedidos');
  syncPedidosGDPToEstoqueIntel(true);
  console.timeEnd('[GDP] loadData:syncPedidos');
  // Story 4.43: load equivalencias/demandas/estoque data layer
  loadGdpEquivalencias();
  loadGdpConversoes();
  loadGdpDemandas();
  loadGdpEstoqueSimples();
  loadGdpListaCompras();
  // Story 4.80: save sanitizado em background — só localStorage, sem cloud (evita 20+ requests no boot)
  setTimeout(function() {
    var _saveLocal = function(key, items) {
      localStorage.setItem(key, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: items }));
    };
    try { _saveLocal(CONTRACTS_KEY, contratos); } catch(_) {}
    try { _saveLocal(ORDERS_KEY, pedidos); } catch(_) {}
    try { _saveLocal(PAYABLES_KEY, contasPagar); } catch(_) {}
    try { _saveLocal(RECEIVABLES_KEY, contasReceber); } catch(_) {}
  }, 3000);
  console.timeEnd('[GDP] loadData:migrations');
  // Nota: _gdpBootInProgress é desligado em gdp-init.js (após boot+migrations) que também
  // chama _flushPendingBootSaves(). Não desligar aqui para não duplicar o ponto de controle.
}

// ANTI-LOOP (incidente 2026-06-24): reidrata as variáveis EM MEMÓRIA a partir do localStorage,
// SEM disparar NENHUM save (ao contrário de loadData(), que faz saveNotasEntrada/saveConciliacao/
// saveExtratos condicionais — esses realimentam o realtime e causam LOOP INFINITO de render).
// Usado pelo gdp-realtime.js scheduleRender() para a máquina B refletir o que o realtime gravou
// no localStorage, sem efeito colateral de escrita. Só LEITURA + filtro de soft-delete.
function reloadFromLocalSilent() {
  // Pendência 1 camada A: _hydrateWithMemFallback cai no gdpApi._memCache se o localStorage zerar por
  // quota. Continua LEITURA-ONLY (não dispara save → não realimenta realtime → não reintroduz loop).
  try { contratosExcluidos = unwrapData(JSON.parse(localStorage.getItem(CONTRACTS_DELETED_KEY))); } catch(_) {}
  try { contratos = applyDeletedContractsFilter(_hydrateWithMemFallback(CONTRACTS_KEY)); } catch(_) {}
  try { pedidos = _hydrateWithMemFallback(ORDERS_KEY); } catch(_) {}
  try {
    notasFiscais = _hydrateWithMemFallback(INVOICES_KEY);
    notasFiscais = notasFiscais.filter(function(x){ return !(x && (x.deletedAt || x.deleted_at)); });
  } catch(_) {}
  try {
    contasReceber = _hydrateWithMemFallback(RECEIVABLES_KEY);
    contasReceber = contasReceber.filter(function(x){ return !(x && (x.deletedAt || x.deleted_at)); });
  } catch(_) {}
  try {
    contasPagar = _hydrateWithMemFallback(PAYABLES_KEY);
    contasPagar = contasPagar.filter(function(x){ return !(x && (x.deletedAt || x.deleted_at)); });
  } catch(_) {}
}
if (typeof window !== 'undefined') window.reloadFromLocalSilent = reloadFromLocalSilent;

function saveContratos() {
  _contratoByIdCache = null; // invalidate lookup cache
  _enrichedContratos.clear(); // allow re-enrichment
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
function savePedidos(changedId) {
  // ARCH-sync Passo 1 (mata a race condition): o "carimbão em massa" — todos os pedidos
  // reescritos com o mesmo updated_at, sobrescrevendo no servidor a edição correta de
  // outro navegador (pedido faturado voltava p/ aberto) — vinha do boot/migrations
  // chamando savePedidos() SEM changedId. Regra:
  //   • changedId presente → persiste SÓ esse pedido (caminho normal de UI).
  //   • sem changedId DURANTE o boot → só cache local (NÃO reescreve Supabase em massa).
  //   • sem changedId FORA do boot → comportamento legado preservado (ação de usuário).
  pedidos = pedidos.map(sanitizePedidoLegacyData);
  saveWrappedArray(ORDERS_KEY, pedidos);
  _lastLocalSave[ORDERS_KEY] = Date.now();
  syncPedidosGDPToEstoqueIntel(true);
  if (window.gdpApi && window.gdpApi.pedidos) {
    if (changedId) {
      pedidos.filter(function(p) { return p.id === changedId; }).forEach(function(p) {
        window.gdpApi.pedidos.save(p).catch(function(e) { gdpWarn('[Pedidos] Supabase save failed:', p.id, e.message); });
      });
    } else if (gdpIsBooting()) {
      gdpLog('[Pedidos] boot save local-only — nao reescreve Supabase em massa (anti-carimbao)');
    } else {
      pedidos.forEach(function(p) {
        window.gdpApi.pedidos.save(p).catch(function(e) { gdpWarn('[Pedidos] Supabase save failed:', p.id, e.message); });
      });
    }
  }
}
// Story 23.x (incidente QuotaExceededError 2026-06-23):
// Strip de campos pesados (XML assinado, previews, rawResponse) ANTES de salvar no
// localStorage. Antes era condicionado a status === "autorizada", mas notas em
// rascunho/processando/rejeitada também carregam sefaz.xmlPreview/transmissao.xml
// (100-300KB cada) e estouravam o limite de ~5MB ao emitir. O XML completo já é
// persistido no Supabase (xmlAutorizado) — no localStorage só guardamos metadados.
function _stripNfHeavy(nf) {
  var light = Object.assign({}, nf);
  if (light.sefaz) {
    light.sefaz = Object.assign({}, light.sefaz);
    delete light.sefaz.xmlPreview;
    delete light.sefaz.xmlDsigPreview;
    delete light.sefaz.lotePreview;
    delete light.sefaz.autorizacaoPreview;
    delete light.sefaz.xmlAutorizado; // pesado — Supabase é a fonte da verdade
    if (light.sefaz.transmissao) {
      light.sefaz.transmissao = {
        httpStatus: light.sefaz.transmissao.httpStatus,
        parsed: light.sefaz.transmissao.parsed
        // Remove: xml, rawResponse (pesados)
      };
    }
  }
  // FIX QUOTA (incidente 2026-06-25, 9.4MB): o strip antigo só removia xml_autorizado (snake), mas as
  // notas guardam xmlAutorizado (camelCase, ~70KB) → escapava. E NÃO tocava em cobranca, que carrega
  // invoiceUrl/bankSlipUrl (PDF do boleto em base64, ~54KB cada = ~490KB no total das notas). Esses são
  // recuperáveis do Supabase/provider bancário — não precisam ficar no localStorage. Removê-los aqui.
  delete light.xml_autorizado;
  delete light.xmlAutorizado;
  if (light.cobranca) {
    light.cobranca = Object.assign({}, light.cobranca);
    delete light.cobranca.invoiceUrl;        // PDF/HTML base64 da fatura
    delete light.cobranca.bankSlipUrl;       // PDF base64 do boleto
    delete light.cobranca.boletoPdfBase64;
    delete light.cobranca.pdfBase64;
    delete light.cobranca.qrCodeImage;       // imagem base64 do QR (mantém pixCopiaECola textual)
  }
  // FIX DEFINITIVO DE MEMÓRIA (2026-06-25): o maior ofensor restante é 'integracoes' (332KB) — guarda
  // o HISTÓRICO de cada ação de integração (lastAction acumulado, payloads de resposta). A tela só
  // precisa do STATUS ATUAL de cada canal. Enxuga integracoes mantendo só os campos de reconciliação.
  // NÃO removemos 'documentos' (o email usa documentos.observacao) nem 'parametros' (config de emissão)
  // — só limpamos campos base64 pesados dentro deles, preservando o texto essencial.
  if (light.integracoes && typeof light.integracoes === 'object') {
    var _integLeve = {};
    Object.keys(light.integracoes).forEach(function (canal) {
      var v = light.integracoes[canal];
      if (v && typeof v === 'object') {
        _integLeve[canal] = {
          status: v.status, cStat: v.cStat, accessKey: v.accessKey || v.chaveAcesso,
          protocol: v.protocol || v.protocolo, lastAction: v.lastAction, xMotivo: v.xMotivo
        };
      } else { _integLeve[canal] = v; }
    });
    light.integracoes = _integLeve;
  }
  // documentos: preserva observacao (email precisa), remove só base64 pesados (XML/DANFE/PDF).
  if (light.documentos && typeof light.documentos === 'object') {
    light.documentos = Object.assign({}, light.documentos);
    delete light.documentos.xmlBase64;
    delete light.documentos.danfeBase64;
    delete light.documentos.pdfBase64;
    delete light.documentos.xml;
  }
  return light;
}

// FIX DEFINITIVO DE MEMÓRIA (2026-06-25): versão LEVE-DE-LISTA — só os campos que a LISTA de notas
// mostra/filtra. O detalhe completo (itens, documentos, sefaz completo, cobranca) é re-hidratado do
// Supabase ao ABRIR a nota (verNotaFiscal/email chamam _hidratarNotaCompleta). Reduz ~83% por nota.
// Marca _leve:true para o front saber que precisa hidratar antes de usar detalhe.
function _nfListaLeve(nf) {
  return {
    id: nf.id, numero: nf.numero, serie: nf.serie, status: nf.status, valor: nf.valor,
    emitidaEm: nf.emitidaEm, vencimento: nf.vencimento, pedidoId: nf.pedidoId, contratoId: nf.contratoId,
    tipoNota: nf.tipoNota, origem: nf.origem,
    chaveAcesso: (nf.sefaz && nf.sefaz.chaveAcesso) || nf.chaveAcesso || "",
    protocolo: (nf.sefaz && nf.sefaz.protocolo) || nf.protocolo || "",
    cliente: nf.cliente ? { nome: nf.cliente.nome, cnpj: nf.cliente.cnpj, email: nf.cliente.email, responsavel: nf.cliente.responsavel } : null,
    sefaz: nf.sefaz ? { status: nf.sefaz.status, cStat: nf.sefaz.cStat, chaveAcesso: nf.sefaz.chaveAcesso, protocolo: nf.sefaz.protocolo, lote: nf.sefaz.lote } : null,
    integracoes: nf.integracoes ? { sefaz: nf.integracoes.sefaz ? { status: nf.integracoes.sefaz.status, cStat: nf.integracoes.sefaz.cStat } : undefined, bancaria: nf.integracoes.bancaria ? { status: nf.integracoes.bancaria.status } : undefined, comunicacao: nf.integracoes.comunicacao ? { status: nf.integracoes.comunicacao.status } : undefined } : null,
    cobranca: nf.cobranca ? { forma: nf.cobranca.forma, status: nf.cobranca.status, providerChargeId: nf.cobranca.providerChargeId, linhaDigitavel: nf.cobranca.linhaDigitavel } : null,
    audit: nf.audit ? { authorizedAt: nf.audit.authorizedAt } : null,
    deleted_at: nf.deleted_at || nf.deletedAt,
    _leve: true
  };
}
if (typeof window !== "undefined") window._nfListaLeve = _nfListaLeve;

// Versão ultra-light (segunda linha de defesa): reduz sefaz ao mínimo de
// reconciliação, para QUALQUER status. Usada quando o strip normal ainda estoura.
function _ultraLightNf(nf) {
  var ul = Object.assign({}, nf);
  if (ul.sefaz) {
    ul.sefaz = {
      status: ul.sefaz.status,
      protocolo: ul.sefaz.protocolo,
      chaveAcesso: ul.sefaz.chaveAcesso,
      lote: ul.sefaz.lote,
      cStat: (ul.sefaz.transmissao && ul.sefaz.transmissao.parsed && ul.sefaz.transmissao.parsed.cStat) || ul.sefaz.cStat
    };
  }
  delete ul.xml_autorizado;
  return ul;
}

// FIX QUOTA (2026-06-25): strip de campos pesados de CONTA A RECEBER/PAGAR. Espelho do _stripNfHeavy.
// invoiceUrl/bankSlipUrl (PDF do boleto em base64, ~54KB cada) são recuperáveis do provider (Inter) —
// o sistema re-busca via emitirOuSincronizarCobrancaReal (gdp-notas-fiscais.js:690). A detecção de
// "tem boleto" usa providerChargeId/nossoNumero (leves, preservados). Opera em CÓPIA (não muta a RAM).
function _stripContaHeavy(c) {
  var l = Object.assign({}, c);
  if (l.cobranca) {
    l.cobranca = Object.assign({}, l.cobranca);
    delete l.cobranca.invoiceUrl;
    delete l.cobranca.bankSlipUrl;
    delete l.cobranca.boletoPdfBase64;
    delete l.cobranca.pdfBase64;
    delete l.cobranca.qrCodeImage;
  }
  delete l.boletoPdfBase64;
  delete l.pdfBase64;
  return l;
}
if (typeof window !== 'undefined') window._stripContaHeavy = _stripContaHeavy;

// FIX QUOTA (2026-06-25): limpeza RETROATIVA one-shot no boot. As notas/contas já salvas no localStorage
// carregam os campos pesados antigos (o strip só age em saves NOVOS). Re-strippa o que já está gravado,
// DIRETO no localStorage (NÃO via saveWrappedArray → zero rede, zero carimbão). Idempotente: só regrava se
// ficou menor. A RAM mantém os pesados (strip em cópia) → nada se perde na sessão atual.
function _stripLocalStorageRetroativo() {
  var liberadoKb = 0;
  function _reStrip(key, fn) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var arr = unwrapData(JSON.parse(raw));
      if (!Array.isArray(arr) || !arr.length) return;
      var light = arr.map(fn);
      var str = JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: light });
      if (str.length < raw.length) {
        localStorage.setItem(key, str);
        liberadoKb += (raw.length - str.length) / 1024;
      }
    } catch (_) {}
  }
  _reStrip(INVOICES_KEY, _stripNfHeavy);
  _reStrip(RECEIVABLES_KEY, _stripContaHeavy);
  _reStrip(PAYABLES_KEY, _stripContaHeavy);
  if (liberadoKb > 0) gdpLog('[quota] limpeza retroativa liberou ~' + Math.round(liberadoKb) + 'KB do localStorage');
  return Math.round(liberadoKb);
}
if (typeof window !== 'undefined') window._stripLocalStorageRetroativo = _stripLocalStorageRetroativo;

function saveNotasFiscais(changedId) {
  // FIX DEFINITIVO DE MEMÓRIA (2026-06-25): grava a versão LEVE-DE-LISTA no localStorage (reduz ~83%).
  // ANTES usava _stripNfHeavy (mantinha itens/documentos/sefaz = ~1.2MB) → o save RE-ENCHIA o
  // localStorage que a compressão do boot tinha deixado leve, e o aviso de memória voltava. Agora o
  // cache em disco fica SEMPRE leve; a RAM (notasFiscais) segue completa na sessão; o detalhe é
  // re-hidratado do Supabase ao abrir a nota (_hidratarNotaCompleta). NÃO muta a RAM (map em cópia).
  const lightNfs = notasFiscais.map(function (nf) {
    return (typeof _nfListaLeve === 'function') ? _nfListaLeve(nf) : _stripNfHeavy(nf);
  });
  try {
    saveWrappedArray(INVOICES_KEY, lightNfs);
    _lastLocalSave[INVOICES_KEY] = Date.now();
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      console.warn("[NF] localStorage cheio — tentando salvar versão ultra-light");
      // Fallback universal: reduz sefaz ao mínimo em TODAS as notas (não só autorizadas).
      var ultraLight = lightNfs.map(_ultraLightNf);
      try {
        saveWrappedArray(INVOICES_KEY, ultraLight);
        _lastLocalSave[INVOICES_KEY] = Date.now();
      } catch(e2) {
        if (e2.name === 'QuotaExceededError') {
          // Última defesa: limpar rejeitadas antigas (continuam no Supabase) e
          // tentar de novo. Mantém as 20 notas mais recentes por emissão.
          console.warn("[NF] quota ainda estourado — purgando notas rejeitadas antigas do localStorage");
          var keep = ultraLight.filter(function(nf) { return nf.status !== "rejeitada"; });
          try {
            saveWrappedArray(INVOICES_KEY, keep);
            _lastLocalSave[INVOICES_KEY] = Date.now();
          } catch(e3) {
            // Em memória os dados continuam íntegros + Supabase tem tudo.
            console.error("[NF] localStorage irrecuperável mesmo após purga — dados seguros em memória/Supabase", e3);
          }
        } else { throw e2; }
      }
    } else { throw e; }
  }
  // ARCH-sync Passo 1 (mata a race condition): o carimbão em massa (152 NFs reescritas
  // só por abrir o sistema) sobrescrevia no servidor o tipo_nota/status corretos de
  // outro navegador (NF real virava "manual externa" amarela). Vinha do boot chamando
  // saveNotasFiscais() SEM changedId. Regra idêntica a savePedidos:
  //   • changedId → persiste só a NF alterada (caminho normal).
  //   • sem changedId DURANTE o boot → só cache local (anti-carimbão).
  //   • sem changedId FORA do boot → comportamento legado preservado (ação de usuário:
  //     emitir/transmitir/autorizar — essas DEVEM persistir).
  if (window.gdpApi && window.gdpApi.notas_fiscais) {
    if (changedId) {
      notasFiscais.filter(function(nf) { return nf.id === changedId; }).forEach(function(nf) {
        window.gdpApi.notas_fiscais.save(nf).catch(function(e) { gdpWarn('[NF] Supabase save failed:', nf.id, e.message); });
      });
    } else {
      // ANTI-CARIMBÃO DEFINITIVO (incidente 2026-06-24): saveNotasFiscais() SEM changedId NUNCA
      // reescreve a lista inteira no servidor — nem no boot, nem fora dele. Antes, fora do boot
      // o else fazia notasFiscais.forEach(save) → re-gravava as 171 NFs em massa (carimbão), e o
      // updated_at server-side sobrescrevia o estado correto de outro navegador (NF real virava
      // "manual externa" amarela). O cache LOCAL já foi gravado acima (saveWrappedArray); só o
      // push em massa de rede é eliminado. Mudanças REAIS de NF DEVEM chamar saveNotasFiscais(id),
      // que persiste só a NF alterada (caminho changedId acima). O servidor é a fonte da verdade.
      gdpLog('[NF] save sem changedId → local-only (anti-carimbão; servidor só recebe save por-id)');
    }
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
function saveNotasEntrada() {
  // Story 4.83: Strip xmlRaw and heavy danfe data before saving — each can be 150-300KB
  // Without this, 2-3 notas estouram o limite de 500KB do sync_data e dados são perdidos
  var lightItems = notasEntrada.map(function(ne) {
    var light = Object.assign({}, ne);
    delete light.xmlRaw; // 150-300KB per nota — não é necessário persistir
    // Manter danfe mas limpar campos pesados (rawHtml, etc.)
    if (light.danfe) {
      light.danfe = Object.assign({}, light.danfe);
      delete light.danfe.rawHtml;
      delete light.danfe.rawXml;
    }
    return light;
  });
  saveWrappedArray(ENTRY_INVOICES_KEY, lightItems);
}
function saveContasPagar() { saveWrappedArray(PAYABLES_KEY, contasPagar); }

// ===== CONTAS A PAGAR: PAGAMENTOS PARCIAIS (Story 20.13 — modelo MarketUp) =====
// pagamentos[] é a fonte da verdade; valor_pago é a soma materializada (mantida aqui).
// Saldo a pagar = valor - valor_pago. Status: pendente (0) / parcial (0<pago<valor) / paga (pago>=valor).
function cpValorPago(conta) {
  if (!conta) return 0;
  // BUG-1 fix (2026-06-15): se `pagamentos` é um Array, ele é a VERDADE ABSOLUTA — inclusive
  // quando vazio (após remover o último pagamento, valor_pago deve ser 0). Antes, o array
  // vazio caía no fallback de legado e ressuscitava o valor_pago antigo (conta "voltava" a paga).
  if (Array.isArray(conta.pagamentos)) {
    return Math.round(conta.pagamentos.reduce((s, p) => s + (Number(p.valorPago) || 0), 0) * 100) / 100;
  }
  // Reconciliação de legado (Story 20.13 AC7): conta SEM array de pagamentos, criada antes do recurso.
  if (String(conta.status || '').toLowerCase() === 'paga') return Number(conta.valor) || 0;
  return Number(conta.valor_pago) || 0;
}
function cpSaldoRestante(conta) {
  if (!conta) return 0;
  return Math.round(((Number(conta.valor) || 0) - cpValorPago(conta)) * 100) / 100;
}
// Recalcula valor_pago e status a partir de pagamentos[]. Chamar após incluir/remover pagamento.
function cpRecalcular(conta) {
  if (!conta) return;
  const pago = cpValorPago(conta);
  conta.valor_pago = pago;
  const total = Number(conta.valor) || 0;
  if (pago <= 0) conta.status = 'pendente';
  else if (pago < total) conta.status = 'parcial';
  else conta.status = 'paga';
  // pagaEm: data do último pagamento quando quitada (mantém compat. com auditoria existente)
  if (conta.status === 'paga' && Array.isArray(conta.pagamentos) && conta.pagamentos.length) {
    const ultima = conta.pagamentos[conta.pagamentos.length - 1];
    conta.pagaEm = (ultima && ultima.data ? ultima.data : new Date().toISOString().slice(0, 10)) + 'T12:00:00';
  } else {
    delete conta.pagaEm;
  }
}
// Lista de contas bancárias para o dropdown "Conta Corrente" (mesma fonte da conciliação).
function cpListaContasBancarias() {
  let contas = [];
  try { contas = JSON.parse(localStorage.getItem('nexedu.config.contas-bancarias') || '[]'); } catch (_) {}
  const ativas = (Array.isArray(contas) ? contas : []).filter(c => c && c.ativa !== false).map(c => {
    const label = ((c.banco || '') + (c.apelido ? ' (' + c.apelido + ')' : '')).trim() || 'Conta Principal';
    return { id: c.id || label, label };
  });
  return ativas.length ? ativas : [{ id: 'Conta Principal', label: 'Conta Principal' }];
}
// FIX QUOTA (2026-06-25): strippa campos pesados (invoiceUrl/bankSlipUrl/PDF base64) ANTES de salvar no
// localStorage — senão a conta re-infla a cada save. _stripContaHeavy opera em cópia (a RAM mantém o link
// p/ a tela atual; pesados são recuperáveis do provider).
function saveContasReceber() { saveWrappedArray(RECEIVABLES_KEY, contasReceber.map(_stripContaHeavy)); }
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

// Story 4.83: cache guard — process each contrato only once per session
var _enrichedContratos = new Set();
function ensureContratoItensMetadata(contrato) {
  if (!contrato?.itens) return;
  if (_enrichedContratos.has(contrato.id)) return; // already processed
  _enrichedContratos.add(contrato.id);
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

// Story 4.83: O(1) contrato lookup cache (rebuilt on save)
var _contratoByIdCache = null;
function _getContratoById(id) {
  if (!_contratoByIdCache) {
    _contratoByIdCache = {};
    contratos.forEach(function(c) { if (c.id) _contratoByIdCache[c.id] = c; });
  }
  return _contratoByIdCache[id] || null;
}
function getContratoItemForPedidoItem(contratoId, itemPedido) {
  const contrato = _getContratoById(contratoId);
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
  const contrato = _getContratoById(contratoId);
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

// FR-009: Cobrança via WhatsApp (link direto wa.me) e Email
function _formatarTelefoneWpp(tel) {
  if (!tel) return null;
  let num = tel.replace(/[^\d]/g, '');
  if (num.length === 10 || num.length === 11) num = '55' + num; // adiciona DDI Brasil
  if (num.length === 12) num = num.slice(0,4) + '9' + num.slice(4); // adiciona 9 se falta
  return num.length >= 12 ? num : null;
}

function _buscarTelefoneCliente(nomeCliente) {
  if (!nomeCliente) return null;
  // Story 20.16/20.19: match accent/casing/pontuação-insensitive (mesmo padrão de buscarClientePorEscola).
  const nome = window.normalizeSearch(nomeCliente);
  if (!nome) return null;
  const lista = (typeof usuarios !== 'undefined' ? usuarios : []);
  // 1) match exato normalizado ("America" === "América")
  let cliente = lista.find(u => window.normalizeSearch(u.nome || '') === nome);
  // 2) fallback bidirecional p/ variações tipo "Escola América" vs "America"
  if (!cliente) {
    cliente = lista.find(u => {
      const un = window.normalizeSearch(u.nome || '');
      return un && (un.includes(nome) || nome.includes(un));
    });
  }
  return cliente ? (cliente.telefone || '') : '';
}

function _formatarDataBR(dataISO) {
  if (!dataISO || dataISO === '-') return '-';
  const parts = dataISO.split('-');
  if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
  return dataISO;
}

function _montarMensagemCobranca(conta, tipo) {
  const valor = brl.format(Number(conta.valor || 0));
  const venc = _formatarDataBR(conta.vencimento);
  const desc = conta.descricao || '';
  const pix = conta.cobranca?.pixCopiaECola || '';
  const boleto = conta.cobranca?.linhaDigitavel || '';
  // Extrair número da NF da descrição (ex: "NF 03", "Nota Fiscal nº 05")
  const nfMatch = (desc.match(/(?:NF|Nota\s*Fiscal)\s*(?:n[º°]?\s*)?(\d+)/i) || [])[1] || '';
  const nfRef = nfMatch ? 'nº ' + nfMatch : desc;

  let msg = '';
  if (tipo === 'lembrete') {
    msg = `Olá, tudo bem?\n\nPassando apenas para lembrar que a Nota Fiscal ${nfRef} no valor de *${valor}* está vencendo hoje (*${venc}*).\n\nCaso já esteja programado, desconsidere esta mensagem. Nosso objetivo é apenas auxiliar no controle dos pagamentos e evitar qualquer transtorno.\n\nPermanecemos à disposição para o que for necessário.`;
  } else {
    msg = `Olá, tudo bem?\n\nEstamos entrando em contato para lembrar sobre o pagamento da Nota Fiscal ${nfRef} no valor de *${valor}*, com vencimento em *${venc}*, que até o momento consta em aberto em nosso controle.\n\nPedimos, por gentileza, a verificação da pendência e, se possível, a programação do pagamento. Caso o pagamento já tenha sido realizado, desconsidere esta mensagem e, se possível, encaminhe o comprovante para atualização de nossos registros.\n\nFicamos à disposição para quaisquer esclarecimentos.`;
  }

  msg += `\n\n📲 *PIX Copia e Cola:*\n36.802.147/0001-42`;

  msg += `\n\nAtenciosamente,\n\n*Distribuidora Lariucci*\nSetor Financeiro\n16 98204-4058`;
  return msg;
}

function enviarLembreteConta(contaId, canal) {
  const conta = contasReceber.find(c => c.id === contaId);
  if (!conta) { showToast("Conta não encontrada.", 3000); return; }

  if (canal === 'whatsapp') {
    const tel = _formatarTelefoneWpp(_buscarTelefoneCliente(conta.cliente));
    if (!tel) { showToast("Telefone do cliente não encontrado. Cadastre no módulo Clientes.", 4000); return; }
    // Detecta tipo: se vencimento < hoje → vencida, senão → lembrete
    const hoje = new Date().toISOString().slice(0, 10);
    const tipo = (conta.vencimento && conta.vencimento < hoje) ? 'vencida' : 'lembrete';
    const msg = _montarMensagemCobranca(conta, tipo);
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank');
    showToast("WhatsApp aberto — " + (tipo === 'vencida' ? 'cobrança' : 'lembrete') + ".", 3000);
  } else if (canal === 'email') {
    _enviarEmailCobranca(conta);
  }
}

async function _enviarEmailCobranca(conta) {
  // Buscar email do cliente no cadastro
  const nomeCliente = (conta.cliente || '').trim().toLowerCase();
  const cliente = (typeof usuarios !== 'undefined' ? usuarios : []).find(u =>
    (u.nome || '').trim().toLowerCase() === nomeCliente
  );
  const emailCliente = cliente?.email || '';
  if (!emailCliente) { showToast("Email do cliente não encontrado. Cadastre no módulo Clientes.", 4000); return; }

  const hoje = new Date().toISOString().slice(0, 10);
  const tipo = (conta.vencimento && conta.vencimento < hoje) ? 'vencida' : 'lembrete';
  const valor = brl.format(Number(conta.valor || 0));
  const venc = _formatarDataBR(conta.vencimento);
  const desc = conta.descricao || '';
  const nfMatch = (desc.match(/(?:NF|Nota\s*Fiscal)\s*(?:n[º°]?\s*)?(\d+)/i) || [])[1] || '';
  const nfRef = nfMatch ? 'nº ' + nfMatch : desc;
  const pix = conta.cobranca?.pixCopiaECola || '';
  const boleto = conta.cobranca?.linhaDigitavel || '';

  // Assunto sem protocolo
  const subject = tipo === 'lembrete'
    ? `Lembrete de Vencimento — NF ${nfRef} — ${conta.cliente || ''}`
    : `Cobrança — NF ${nfRef} em aberto — ${conta.cliente || ''}`;

  // Buscar NF vinculada para anexar (por ID, número na descrição, ou cliente)
  const notaId = conta.notaFiscalId || conta.origemId || '';
  let nfe = notaId ? (notasFiscais || []).find(n => n.id === notaId) : null;
  if (!nfe && nfMatch) {
    nfe = (notasFiscais || []).find(n => String(n.numero) === nfMatch);
  }
  if (!nfe && conta.cliente) {
    const _cliLower = conta.cliente.trim().toLowerCase();
    nfe = (notasFiscais || []).find(n => (n.cliente?.nome || '').trim().toLowerCase() === _cliLower);
  }

  // Montar corpo do email — remove seção PIX (já exibida no box dedicado do template)
  var msgRaw = _montarMensagemCobranca(conta, tipo);
  var pixIdx = msgRaw.indexOf('PIX Copia e Cola');
  if (pixIdx > 0) {
    var cutStart = msgRaw.lastIndexOf('\n\n', pixIdx);
    if (cutStart < 0) cutStart = pixIdx;
    var cutEnd = msgRaw.indexOf('\n\n', pixIdx);
    if (cutEnd < 0) cutEnd = msgRaw.length;
    msgRaw = msgRaw.slice(0, cutStart) + msgRaw.slice(cutEnd);
  }
  const msgHtml = msgRaw.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<strong>$1</strong>');

  try {
    showToast("Enviando email para " + emailCliente + "...", 2000);
    const payload = {
      to: emailCliente,
      protocol: nfRef,
      schoolName: conta.cliente || '',
      date: venc,
      total: Number(conta.valor || 0),
      items: [],
      obs: msgHtml,
      pagamento: {
        forma: pix ? 'pix' : 'outros',
        vencimento: venc,
        valor: Number(conta.valor || 0),
        pixCopiaECola: pix || undefined
      }
    };
    // Anexar NF-e completa (mesmo formato da transmissão)
    if (nfe) {
      const sefaz = nfe.sefaz || {};
      const cobrancaNf = nfe.cobranca || {};
      payload.nfe = {
        numero: nfe.numero || nfe.id,
        serie: nfe.serie || '1',
        valor: Number(nfe.valor || conta.valor || 0),
        chaveAcesso: sefaz.chaveAcesso || nfe.chaveAcesso || '',
        protocolo: sefaz.protocolo || nfe.protocolo || '',
        xml: sefaz.xmlDsigPreview?.signedXml || sefaz.xmlPreview?.xml || nfe.xml || '',
        emitente: sefaz.preview?.emitente || nfe.emitente || {},
        destinatario: sefaz.preview?.destinatario || nfe.cliente || {},
        observacoes: cobrancaNf.metadata?.observacoes || nfe.observacoes || '',
        itensNf: (nfe.itens || []).map(i => ({
          desc: i.descricao || i.nome || '',
          ncm: i.ncm || '',
          cst: i.cst || '',
          cfop: i.cfop || '',
          un: i.unidade || 'UN',
          qtd: Number(i.qtd || i.quantidade || 0),
          vUnit: Number(i.precoUnitario || i.vUnit || 0)
        }))
      };
      // Dados do cliente para o corpo do email
      payload.cnpj = nfe.cliente?.cnpj || '';
      payload.responsible = nfe.cliente?.responsavel || '';
    }
    const resp = await fetch('/api/send-order-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch(_) { data = { error: text.slice(0, 100) }; }
    if (resp.ok && data.success) {
      showToast("Email de cobrança enviado para " + emailCliente + (nfe ? ' (com NF anexa)' : ''), 4000);
    } else {
      showToast("Erro ao enviar email: " + (data.error || 'erro no servidor'), 5000);
    }
  } catch (e) {
    showToast("Falha no envio: " + e.message, 5000);
  }
}

// Story 20.7: helper central de envio de cobranca por e-mail (NF + boleto Inter anexo).
// Reutilizado pelos gatilhos automaticos (ao gerar NF, ao reemitir boleto pelo menu "...").
// Busca o PDF do boleto via a rota de proxy (/api/bank-charge?action=bank-charge-pdf) e anexa.
// Retorna { ok, email } e registra o envio real em conta.envios (fonte do campo "Ultimo envio").
async function enviarCobrancaEmailComBoleto(conta, opts) {
  opts = opts || {};
  if (!conta) return { ok: false };
  // E-mail do cliente: cadastro de Clientes (mesmo lookup do _enviarEmailCobranca)
  const nomeCliente = (conta.cliente || '').trim().toLowerCase();
  const cliente = (typeof usuarios !== 'undefined' ? usuarios : []).find(u =>
    (u.nome || '').trim().toLowerCase() === nomeCliente
  );
  const emailCliente = cliente?.email || '';
  if (!emailCliente) {
    if (!opts.silent) showToast("Email do cliente não encontrado. Cadastre no módulo Clientes.", 4000);
    return { ok: false, motivo: 'sem_email' };
  }

  const desc = conta.descricao || '';
  const nfMatch = (desc.match(/(?:NF|Nota\s*Fiscal)\s*(?:n[º°]?\s*)?(\d+)/i) || [])[1] || '';
  const nfRef = nfMatch ? 'nº ' + nfMatch : desc;
  const venc = (typeof _formatarDataBR === 'function') ? _formatarDataBR(conta.vencimento) : (conta.vencimento || '');

  // NF vinculada (por ID, número na descrição, ou cliente)
  const notaId = conta.notaFiscalId || conta.origemId || '';
  let nfe = notaId ? (notasFiscais || []).find(n => n.id === notaId) : null;
  if (!nfe && nfMatch) nfe = (notasFiscais || []).find(n => String(n.numero) === nfMatch);
  if (!nfe && conta.cliente) {
    const _cliLower = conta.cliente.trim().toLowerCase();
    nfe = (notasFiscais || []).find(n => (n.cliente?.nome || '').trim().toLowerCase() === _cliLower);
  }

  const providerChargeId = conta.cobranca?.providerChargeId || conta.integracoes?.bancaria?.providerChargeId || '';

  // Busca o PDF do boleto via rota de proxy (server fala com o Inter; secret nao trafega no browser).
  let boletoPdfBase64 = '';
  if (providerChargeId) {
    try {
      const r = await fetch('/api/bank-charge?action=bank-charge-pdf&providerChargeId=' + encodeURIComponent(providerChargeId));
      if (r.ok && (r.headers.get('content-type') || '').includes('application/pdf')) {
        const buf = await r.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        boletoPdfBase64 = btoa(bin);
      }
    } catch (_) { /* sem boleto anexo, segue só com a NF */ }
  }

  const payload = {
    to: emailCliente,
    protocol: nfRef,
    schoolName: conta.cliente || '',
    date: venc,
    total: Number(conta.valor || 0),
    items: [],
    boletoPdfBase64: boletoPdfBase64 || undefined,
    pagamento: {
      forma: conta.cobranca?.forma || 'boleto',
      vencimento: venc,
      valor: Number(conta.valor || 0),
      linhaDigitavel: conta.cobranca?.linhaDigitavel || undefined,
      pixCopiaECola: conta.cobranca?.pixCopiaECola || undefined
    }
  };
  if (nfe) {
    const sefaz = nfe.sefaz || {};
    const cobrancaNf = nfe.cobranca || {};
    payload.nfe = {
      numero: nfe.numero || nfe.id,
      serie: nfe.serie || '1',
      valor: Number(nfe.valor || conta.valor || 0),
      chaveAcesso: sefaz.chaveAcesso || nfe.chaveAcesso || '',
      protocolo: sefaz.protocolo || nfe.protocolo || '',
      xml: sefaz.xmlDsigPreview?.signedXml || sefaz.xmlPreview?.xml || nfe.xml || '',
      emitente: sefaz.preview?.emitente || nfe.emitente || {},
      destinatario: sefaz.preview?.destinatario || nfe.cliente || {},
      observacoes: cobrancaNf.metadata?.observacoes || nfe.observacoes || '',
      itensNf: (nfe.itens || []).map(i => ({
        desc: i.descricao || i.nome || '', ncm: i.ncm || '', cst: i.cst || '', cfop: i.cfop || '',
        un: i.unidade || 'UN', qtd: Number(i.qtd || i.quantidade || 0), vUnit: Number(i.precoUnitario || i.vUnit || 0)
      }))
    };
    payload.cnpj = nfe.cliente?.cnpj || '';
    payload.responsible = nfe.cliente?.responsavel || '';
  }

  try {
    if (!opts.silent) showToast("Enviando cobrança para " + emailCliente + "...", 2000);
    const resp = await fetch('/api/send-order-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch (_) { data = { error: text.slice(0, 100) }; }
    if (resp.ok && data.success) {
      // Registra o envio REAL (fonte do campo "Ultimo envio")
      conta.envios = Array.isArray(conta.envios) ? conta.envios : [];
      const itens = [nfe ? 'NF' : null, boletoPdfBase64 ? 'Boleto' : null].filter(Boolean);
      conta.envios.push({ canal: 'email', em: new Date().toISOString(), para: emailCliente, itens });
      conta.cobranca = conta.cobranca || {};
      conta.cobranca.emailEnviadoEm = new Date().toISOString();
      if (typeof saveContasReceber === 'function') saveContasReceber();
      const detalhe = (nfe ? 'NF' : '') + (nfe && boletoPdfBase64 ? ' + ' : '') + (boletoPdfBase64 ? 'Boleto' : '');
      showToast("Cobrança enviada para " + emailCliente + (detalhe ? ' (' + detalhe + ')' : ''), 4000);
      return { ok: true, email: emailCliente };
    }
    if (!opts.silent) showToast("Erro ao enviar e-mail: " + (data.error || 'erro no servidor'), 5000);
    return { ok: false, motivo: 'erro_servidor' };
  } catch (e) {
    if (!opts.silent) showToast("Falha no envio: " + e.message, 5000);
    return { ok: false, motivo: e.message };
  }
}

function enviarLembreteVencendoHoje(canal) {
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = contasReceber.filter(c => c.vencimento === hoje && c.status !== "recebida");
  if (lista.length === 0) { showToast("Nenhuma conta vencendo hoje.", 3000); return; }
  if (canal === 'whatsapp') {
    lista.forEach(c => enviarLembreteConta(c.id, 'whatsapp'));
  } else {
    showToast("Envio em lote via " + canal + " em breve.", 3000);
  }
}

function enviarCobrancaVencidas(canal) {
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = contasReceber.filter(c => c.vencimento < hoje && c.status !== "recebida");
  if (lista.length === 0) { showToast("Nenhuma conta vencida.", 3000); return; }
  if (canal === 'whatsapp') {
    lista.forEach(c => enviarLembreteConta(c.id, 'whatsapp'));
  } else {
    showToast("Cobrança em lote via " + canal + " em breve.", 3000);
  }
}
// renderRelatorios definido em gdp-pedidos.js (Story 8.20)
// renderUsuarios definido em gdp-usuarios.js
// renderBancoProdutos definido em gdp-banco-produtos.js

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

// Story 21.x (UX-F4): edição em BATCH. Não persiste por campo — atualiza estado local
// e marca o contrato como "dirty". Persistência única em salvarPrecosContratoBatch().
function salvarNcmItem(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].ncm = value.trim();
  enrichContratoItemMetadata(c, c.itens[itemIdx], itemIdx);
  marcarContratoDirty(contratoId);
}

// Story 14.9: Editar preço do item do contrato com reflexo nos pedidos e portal
// Story 21.4 (UX-F4): edição em BATCH. O onchange por campo NÃO persiste mais (sem save/sync/toast
// por campo, que travava a digitação). Apenas atualiza o estado local e marca o contrato como "dirty".
// A persistência (localStorage + Supabase) + sync ocorre uma única vez em salvarPrecosContratoBatch().
window._contratoPrecosDirty = window._contratoPrecosDirty || {};
// Story 21.x (UX-F4): marca o contrato como "dirty" e habilita o botão batch "Salvar".
function marcarContratoDirty(contratoId) {
  window._contratoPrecosDirty[contratoId] = true;
  const btn = document.getElementById('btn-salvar-precos-' + contratoId);
  if (btn) { btn.removeAttribute('disabled'); btn.style.opacity = '1'; }
}
function editarPrecoItemLocal(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  const novoPreco = Math.round((parseFloat(value) || 0) * 100) / 100;
  c.itens[itemIdx].precoUnitario = novoPreco;
  marcarContratoDirty(contratoId);
}

// Story 21.4/21.x (UX-F4): salva TODAS as alterações dos itens de uma vez (botão "Salvar itens").
function salvarPrecosContratoBatch(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  saveContratos();
  // Sync com pedidos uma única vez (todos os itens).
  (c.itens || []).forEach(item => syncContratoItemToPedidos(contratoId, item));
  // Persistência em Supabase (padrão salvarDadosContrato).
  if (window.gdpApi && window.gdpApi.contratos) {
    gdpApi.contratos.save(c).catch(e => (typeof gdpWarn === 'function' ? gdpWarn : console.warn)('[salvarPrecosContratoBatch] Supabase save failed:', e));
  }
  window._contratoPrecosDirty[contratoId] = false;
  const btn = document.getElementById('btn-salvar-precos-' + contratoId);
  if (btn) { btn.setAttribute('disabled', 'disabled'); btn.style.opacity = '.5'; }
  if (typeof showToast === 'function') showToast('Alteracoes do contrato salvas.', 2500);
}

// Compat: mantém a assinatura antiga, mas agora apenas edita local (sem persistir por campo).
function salvarPrecoItemContrato(contratoId, itemIdx, value) {
  editarPrecoItemLocal(contratoId, itemIdx, value);
}

// Editar campos inline dos itens do contrato
// Story 21.x (UX-F4): edição em BATCH (sem save/sync por campo) — só estado local + dirty.
function salvarQtdItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].qtdContratada = parseInt(value) || 0;
  if (c.itens[itemIdx].quantidade !== undefined) c.itens[itemIdx].quantidade = c.itens[itemIdx].qtdContratada;
  marcarContratoDirty(contratoId);
}

function salvarDescricaoItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].descricao = value.trim();
  marcarContratoDirty(contratoId);
}

function salvarUnidadeItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].unidade = value.trim();
  marcarContratoDirty(contratoId);
}

function salvarSkuItemContrato(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].sku = value.trim();
  marcarContratoDirty(contratoId);
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
    var items = (raw && raw.items && Array.isArray(raw.items)) ? raw.items : (Array.isArray(raw) ? raw : []);
    // Story 17.6: soft-delete sincronizado — esconder itens com deletedAt preenchido
    // (exclusão é vista por todos via Supabase, não mais por tombstone local).
    items = items.filter(function(i) { return !(i && (i.deletedAt || i.deleted_at)); });
    // Story 4.83-fix (legado): tombstone local — mantido por compat até o reset (Fase 2).
    // NÃO filtrar por extratoId — itens de conciliação devem permanecer mesmo se extrato foi deletado
    try {
      var _delConc = new Set(JSON.parse(localStorage.getItem('gdp.conciliacao.deleted.v1') || '[]'));
      if (_delConc.size > 0) {
        items = items.filter(function(i) { return !(i.id && _delConc.has(i.id)); });
      }
    } catch(_) {}
    return items;
  } catch(_) { return []; }
}

// Story 17.6: lê a conciliação CRUA do localStorage SEM esconder soft-deletados.
// Necessário para o soft-delete: ao excluir, marcamos deletedAt no item e precisamos
// persisti-lo (não removê-lo) para que o Supabase propague a exclusão a todos.
function loadConciliacaoRaw() {
  try {
    var raw = JSON.parse(localStorage.getItem(CONCILIACAO_KEY) || "[]");
    return (raw && raw.items && Array.isArray(raw.items)) ? raw.items : (Array.isArray(raw) ? raw : []);
  } catch(_) { return []; }
}

// changedIds (opcional): array de ids que realmente mudaram. Se informado, SÓ esses vão ao Supabase
// — evita re-gravar os 346 itens a cada conciliação (que disparava 346 ecos de realtime → tela "0/0",
// botões somindo, lentidão). Sem changedIds (chamadas legadas/bulk), mantém o comportamento antigo.
function saveConciliacao(items, changedIds) {
  var arr = items || [];
  arr.forEach(function(it) { if (!it.id) it.id = 'conc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); });
  var wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: arr };
  localStorage.setItem(CONCILIACAO_KEY, JSON.stringify(wrapped));
  _lastLocalSave[CONCILIACAO_KEY] = Date.now();
  // Persistir no Supabase (tabela dedicada). Seletivo quando changedIds é informado.
  if (window.gdpApi && window.gdpApi.conciliacoes) {
    var toSave = arr;
    if (changedIds && changedIds.length) {
      var idSet = {};
      changedIds.forEach(function (id) { idSet[id] = true; });
      toSave = arr.filter(function (it) { return idSet[it.id]; });
    }
    toSave.forEach(function(it) {
      window.gdpApi.conciliacoes.save(it).catch(function(e) { gdpWarn('[Conciliacao] Supabase save failed:', it.id, e.message); });
    });
  }
}

// ADR-003: rede de segurança. Re-hidrata extratoId dos itens de conciliação a partir da tabela
// Supabase (gdpApi.conciliacoes, fonte da verdade — sempre tem extrato_id) por id. Cobre qualquer
// item órfão remanescente (blob legado) durante a transição. Idempotente: só grava se mudou.
// Reutiliza o padrão do recovery de boot (ver loadData ~linha 1455). Chamada ANTES de renderConciliacao
// nos handlers de conciliar, para que o extrato não apareça "0/0".
async function _autoCurarExtratoIdConciliacao() {
  try {
    if (!window.gdpApi || !window.gdpApi.conciliacoes || !window.gdpApi.conciliacoes.list) return;
    var rows = await window.gdpApi.conciliacoes.list();
    if (!Array.isArray(rows) || !rows.length) return;
    var byId = {};
    rows.forEach(function (r) { if (r && r.id && r.extratoId) byId[r.id] = r.extratoId; });
    var local = loadConciliacao();
    var changed = false;
    local.forEach(function (i) { if (i && !i.extratoId && byId[i.id]) { i.extratoId = byId[i.id]; changed = true; } });
    if (changed) {
      saveConciliacao(local);
      if (typeof atualizarExtratoStats === 'function') atualizarExtratoStats();
      gdpLog('[ADR-003] auto-cura re-vinculou extratoId de itens de conciliação órfãos');
    }
  } catch (_) { /* fallback gracioso: mantém o estado atual */ }
}
if (typeof window !== 'undefined') window._autoCurarExtratoIdConciliacao = _autoCurarExtratoIdConciliacao;

// Story 4.51 AC-C1/C2/C3: extrato management
function loadExtratos() {
  try {
    var raw = JSON.parse(localStorage.getItem(EXTRATOS_KEY) || "[]");
    var items = (raw && raw.items && Array.isArray(raw.items)) ? raw.items : (Array.isArray(raw) ? raw : []);
    // EPIC-19 Story 19.4: soft-delete sincronizado — esconder extratos com deletedAt/deleted_at.
    items = items.filter(function(e) { return !(e && (e.deletedAt || e.deleted_at)); });
    // Story 4.83-fix (legado): tombstone local — mantido por compat até o reset.
    try {
      var _delExt = new Set(JSON.parse(localStorage.getItem('gdp.extratos.deleted.v1') || '[]'));
      if (_delExt.size > 0) {
        items = items.filter(function(e) { return !_delExt.has(e.id); });
      }
    } catch(_) {}
    return items;
  } catch(_) { return []; }
}

function saveExtratos(list) {
  var arr = list || [];
  arr.forEach(function(it) { if (!it.id) it.id = 'ext-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); });
  var wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: arr };
  localStorage.setItem(EXTRATOS_KEY, JSON.stringify(wrapped));
  _lastLocalSave[EXTRATOS_KEY] = Date.now();
  // Persistir cada extrato no Supabase (tabela dedicada)
  if (window.gdpApi && window.gdpApi.extratos) {
    arr.forEach(function(it) {
      window.gdpApi.extratos.save(it).catch(function(e) { gdpWarn('[Extratos] Supabase save failed:', it.id, e.message); });
    });
  }
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

  // Fonte da verdade do "aberto" = _extratoAbertoId (estado de UI, à prova de sync/realtime).
  // Fallback: se a var de UI está nula mas algum extrato persistido tem isOpen (1ª render pós-navegação),
  // adota esse. Garante que um eco de realtime que zere isOpen NÃO feche o extrato aberto na tela.
  if (!_extratoAbertoId) {
    var _persistedOpen = extratos.find(function(e){ return e.isOpen === true; });
    if (_persistedOpen) _extratoAbertoId = _persistedOpen.id;
  }
  var _abertoId = _extratoAbertoId;

  // Render tabela de extratos
  if (extratosEl) {
    if (extratos.length) {
      const openIdx = extratos.findIndex(e => e.id === _abertoId);
      extratosEl.innerHTML = '<table style="width:100%;font-size:.85rem;margin-bottom:.5rem;border-collapse:collapse;background:var(--s1,#1e293b);border-radius:6px;overflow:hidden">'
        + '<thead><tr style="border-bottom:1px solid var(--bdr,#334155)">'
        + '<th style="width:30px;padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600"><input type="checkbox" id="ext-select-all" onchange="toggleAllExtratos(this.checked)"></th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600;cursor:pointer">Data ⇅</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600;cursor:pointer">Arquivo ⇅</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600;cursor:pointer">Conta financeira ⇅</th>'
        + '<th style="padding:10px 12px;text-align:left;font-size:.78rem;color:var(--mut,#94a3b8);font-weight:600">Conciliados/Total</th>'
        + '</tr></thead><tbody>'
        + extratos.map((ext, i) => {
          const isOpen = ext.id === _abertoId;
          const rowBg = isOpen ? 'background:rgba(59,130,246,.12);' : '';
          const arrow = isOpen ? '▼' : '▶';
          return '<tr style="cursor:pointer;border-bottom:1px solid rgba(51,65,85,.4);' + rowBg + '" onclick="reabrirExtrato(' + i + ')">'
            + '<td style="padding:10px 12px" onclick="event.stopPropagation()"><input type="checkbox" class="ext-check" value="' + i + '"></td>'
            + '<td style="padding:10px 12px;color:var(--txt,#f1f5f9)">' + (fmtDate(ext.data) || '-') + '</td>'
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

  // Story 4.55 AC-2: só mostrar detalhes se algum extrato estiver aberto (fonte = _abertoId, UI-only)
  const openExtrato = extratos.find(e => e.id === _abertoId);
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

  tbody.innerHTML = items.map((t, localIdx) => {
    // Conciliar por ID (não por índice global): o realtime pode reordenar gdp.conciliacao.v1 entre
    // o render e o clique, e o índice apontaria para o item ERRADO. O id é estável. esc() protege o onclick.
    const rid = esc(String(t.id || ''));
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
      if (sugestoes.length === 1) {
        const s = sugestoes[0];
        const tipoLabel = s.tipo === 'cp' ? 'CP' : 'CR';
        const descShort = (s.descricao || '').slice(0, 25) + ((s.descricao || '').length > 25 ? '...' : '');
        const vencFmt = s.vencimento ? fmtDate(s.vencimento) : '';
        statusLabel = '<div style="font-size:.72rem;line-height:1.3">'
          + '<button class="btn btn-sm btn-green" style="font-size:.68rem;padding:.15rem .5rem;margin-bottom:.2rem" onclick="conciliarComBaixa(\'' + rid + '\',\'' + s.contaId + '\',\'' + s.tipo + '\')">' + tipoLabel + ': ' + esc(descShort) + '</button>'
          + '<div style="color:var(--mut);font-size:.65rem">' + esc(vencFmt) + ' | ' + brl.format(s.valor) + '</div>'
          + '<button class="btn btn-sm btn-blue" style="font-size:.65rem;padding:.1rem .4rem;margin-top:.3rem;opacity:.8" onclick="conciliarLancamento(\'' + rid + '\')">Conciliar manual</button>'
          + '</div>';
      } else if (sugestoes.length > 1) {
        // Story 20.4: múltiplos candidatos com mesmo valor — operador escolhe (CR e CP)
        const candidatos = sugestoes.map(function(s) {
          const tipoLabel = s.tipo === 'cp' ? 'CP' : 'CR';
          const descShort = (s.descricao || s.cliente || '').slice(0, 22) + ((s.descricao || s.cliente || '').length > 22 ? '...' : '');
          const vencFmt = s.vencimento ? fmtDate(s.vencimento) : '';
          return '<button class="btn btn-sm btn-green" style="display:block;width:100%;text-align:left;font-size:.66rem;padding:.18rem .4rem;margin-bottom:.18rem;white-space:normal" '
            + 'onclick="conciliarComBaixa(\'' + rid + '\',\'' + s.contaId + '\',\'' + s.tipo + '\')" '
            + 'title="' + esc((s.descricao || '') + ' ' + (s.cliente || '')) + '">'
            + tipoLabel + ': ' + esc(descShort) + ' <span style="color:var(--mut)">' + esc(vencFmt) + ' · ' + brl.format(s.valor) + '</span>'
            + '</button>';
        }).join('');
        statusLabel = '<div style="font-size:.72rem;line-height:1.3">'
          + '<div style="color:var(--yellow,#f59e0b);font-weight:700;font-size:.65rem;margin-bottom:.2rem">' + sugestoes.length + ' candidatos — escolha:</div>'
          + candidatos
          + '<button class="btn btn-sm btn-blue" style="font-size:.65rem;padding:.1rem .4rem;margin-top:.2rem;opacity:.8" onclick="conciliarLancamento(\'' + rid + '\')">Conciliar manual</button>'
          + '</div>';
      } else {
        statusLabel = '<button class="btn btn-sm btn-blue" style="font-size:.7rem;padding:.15rem .5rem" onclick="conciliarLancamento(\'' + rid + '\')">Conciliar</button>';
      }
    }
    return `<tr style="${pendenteMark}">
      <td>${t.data || "-"}</td>
      <td style="font-size:.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${esc(t.descricao || '')}">${esc(t.descricao || "")}</td>
      <td><input type="text" value="${esc(t.historico || '')}" placeholder="Complemento..." style="width:100%;padding:.25rem .4rem;font-size:.8rem;background:var(--bg,#0f172a);border:1px solid var(--bdr,#334155);border-radius:4px;color:var(--txt,#f1f5f9)" onchange="atualizarHistorico('${rid}',this.value)"></td>
      <td><select style="width:100%;padding:.25rem;font-size:.75rem;background:var(--bg,#0f172a);border:1px solid var(--bdr,#334155);border-radius:4px;color:var(--txt,#f1f5f9)" onchange="atualizarCategoriaDre('${rid}',this.value)">${_buildDreOptions(t.categoriaDre || '')}</select></td>
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

// Resolve um item de conciliação por ID (string) OU índice (number, legado). Conciliar por ÍNDICE
// era frágil: o realtime reescreve gdp.conciliacao.v1 e pode reordenar o array entre o render e o
// clique → o índice apontava para o item ERRADO (sintoma: "1º lançamento continua pendente, 2º fecha
// o extrato" porque mexia num item de outro extrato). Buscar por id elimina a dessincronia.
function _resolveConcIdx(items, ref) {
  if (typeof ref === 'string') {
    for (var i = 0; i < items.length; i++) { if (items[i].id === ref) return i; }
    return -1;
  }
  return ref; // legado: índice numérico
}

// === Auto-conciliacao: conciliar extrato + baixar CP/CR automaticamente ===
window.conciliarComBaixa = function(ref, contaId, tipo) {
  const items = loadConciliacao();
  const idx = _resolveConcIdx(items, ref);
  if (idx < 0 || !items[idx]) return;

  // 1. Marcar lancamento como conciliado e vincular a conta
  items[idx].conciliado = true;
  items[idx].conciliadoEm = new Date().toISOString().slice(0, 10);
  items[idx].vinculadoA = { tipo: tipo, contaId: contaId };
  saveConciliacao(items, [items[idx].id]);

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

window.conciliarLancamento = function(ref) {
  const items = loadConciliacao();
  const idx = _resolveConcIdx(items, ref);
  if (idx >= 0 && items[idx]) {
    items[idx].conciliado = true;
    items[idx].conciliadoEm = new Date().toISOString().slice(0, 10);
    saveConciliacao(items, [items[idx].id]);
    atualizarExtratoStats();
    renderConciliacao();
    showToast("Lançamento conciliado.");
  }
};

window.toggleConciliado = function(ref) {
  const items = loadConciliacao();
  const idx = _resolveConcIdx(items, ref);
  if (idx >= 0 && items[idx]) { items[idx].conciliado = !items[idx].conciliado; saveConciliacao(items, [items[idx].id]); atualizarExtratoStats(); renderConciliacao(); }
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

  // DELETE from Supabase (so other machines see the deletion via Realtime)
  if (window.gdpApi && window.gdpApi.extratos) {
    deletedExtIds.forEach(function(id) {
      window.gdpApi.extratos.remove(id).catch(function(e) { gdpWarn('[Extratos] Supabase delete failed:', id, e); });
    });
  }

  saveExtratos(remaining);

  // Story 4.69: remover TODOS os itens NAO conciliados cujo extrato não existe mais
  const remainingExtIds = new Set(remaining.map(e => e.id));
  const allItems = loadConciliacao();
  const removedIds = [];
  const kept = allItems.filter(item => {
    if (item.conciliado === true) return true; // conciliado — sempre manter
    // Não conciliado: manter SÓ se tem extrato ativo correspondente
    if (item.extratoId && remainingExtIds.has(item.extratoId)) return true;
    // Sem extrato ou extrato excluído — remover (fantasma)
    if (item.id) removedIds.push(item.id);
    return false;
  });
  if (true) {
    // Delete tracking para itens de conciliação removidos
    if (removedIds.length > 0) {
      try {
        var dkConc = 'gdp.conciliacao.deleted.v1';
        var existingConc = JSON.parse(localStorage.getItem(dkConc) || '[]');
        if (!Array.isArray(existingConc)) existingConc = [];
        removedIds.forEach(function(id) { if (existingConc.indexOf(id) < 0) existingConc.push(id); });
        localStorage.setItem(dkConc, JSON.stringify(existingConc));
      } catch(_) {}
      // DELETE from Supabase (so other machines see the deletion via Realtime)
      if (window.gdpApi && window.gdpApi.conciliacoes) {
        removedIds.forEach(function(id) {
          window.gdpApi.conciliacoes.remove(id).catch(function(e) { gdpWarn('[Conciliacao] Supabase delete failed:', id, e); });
        });
      }
    }
    saveConciliacao(kept);
  }
  renderConciliacao();
  showToast(selected.length + ' extrato(s) excluído(s). Conciliados preservados no Caixa.');
};

// ESTADO DE UI (NÃO persistido): qual extrato está aberto na tela AGORA. É a fonte da verdade do
// "aberto", independente do campo isOpen gravado no extrato. Motivo: um eco de realtime de OUTRA
// tabela (ex.: contas_receber ao conciliar+baixar uma CR) re-puxava a tabela extratos do Supabase e
// sobrescrevia isOpen=false → o extrato "fechava sozinho". Agora o aberto vive só em memória de UI e
// NENHUM sync/reload o fecha. Só o usuário fecha (clicando de novo no extrato).
var _extratoAbertoId = null;
if (typeof window !== 'undefined') { window._getExtratoAbertoId = function(){ return _extratoAbertoId; }; }

// Story 4.55 AC-2: toggle extrato aberto/fechado com state tracking
window.reabrirExtrato = function(idx) {
  const extratos = loadExtratos();
  const ext = extratos[idx];
  if (!ext) return;

  // Toggle por ID de UI: se já está aberto, fechar; senão abrir (e fechar os outros).
  const wasOpen = _extratoAbertoId === ext.id;
  _extratoAbertoId = wasOpen ? null : ext.id;
  // Espelha no campo persistido (compat com código legado que lê isOpen), mas a verdade é _extratoAbertoId.
  extratos.forEach(e => { e.isOpen = (e.id === _extratoAbertoId); });
  if (!wasOpen) {
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

window.atualizarHistorico = function(ref, valor) {
  const items = loadConciliacao();
  const idx = _resolveConcIdx(items, ref);
  if (idx >= 0 && items[idx]) { items[idx].historico = valor; saveConciliacao(items, [items[idx].id]); }
};

window.atualizarCategoriaDre = function(ref, valor) {
  const items = loadConciliacao();
  const idx = _resolveConcIdx(items, ref);
  if (idx >= 0 && items[idx]) { items[idx].categoriaDre = valor; saveConciliacao(items, [items[idx].id]); }
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
