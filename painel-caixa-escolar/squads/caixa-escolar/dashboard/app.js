/* ===================================================================
   Painel do Fornecedor — Licit-AIX
   Vanilla JS | Multi-SRE — Fase 3
   =================================================================== */

// ===== CONSTANTS =====
const STORAGE_KEY = "caixaescolar.preorcamentos.v1";
const BANCO_STORAGE_KEY = "caixaescolar.banco.v1";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v) => (v * 100).toFixed(0) + "%";
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

// ===== MULTI-SRE CONFIG (Story 4.33) =====
const SRE_CONFIGS = [
  { id: "uberaba", nome: "Uberaba", arquivo: "data/sre-uberaba.json" },
  { id: "uberlandia", nome: "Uberlandia", arquivo: "data/sre-uberlandia.json" },
  { id: "passos", nome: "Passos", arquivo: "data/sre-passos.json" },
];
let allSreData = []; // loaded SRE data objects

// ===== STATE =====
let orcamentos = [];
let bancoPrecos = { updatedAt: "", itens: [] };
let preOrcamentos = {};
let perfil = {};
let sreData = {};
let activePreOrcamentoId = null;
let selectedOrcIds = new Set();

// ===== DESCARTADOS (Story 4.25) =====
const DESCARTADOS_KEY = "caixaescolar.descartados";
let descartados = new Set();

function loadDescartados() {
  try {
    const raw = localStorage.getItem(DESCARTADOS_KEY);
    descartados = new Set(raw ? JSON.parse(raw) : []);
  } catch (_) { descartados = new Set(); }
}

function saveDescartados() {
  localStorage.setItem(DESCARTADOS_KEY, JSON.stringify([...descartados]));
  schedulCloudSync();
}

function isDescartado(id) { return descartados.has(String(id)); }

window.descartarOrc = function(id) {
  if (!confirm("Descartar este processo? Você poderá restaurá-lo depois.")) return;
  descartados.add(String(id));
  selectedOrcIds.delete(id);
  saveDescartados();
  renderOrcamentos();
  renderKPIs();
  showToast("Processo descartado.");
};

window.restaurarOrc = function(id) {
  descartados.delete(String(id));
  saveDescartados();
  renderOrcamentos();
  renderKPIs();
  showToast("Processo restaurado.");
};

// ===== EDIÇÃO INLINE DO CAMPO OBJETO [Story 4.32] =====
window.editarObjeto = function(orcId) {
  const orc = orcamentos.find(o => o.id === orcId);
  if (!orc) return;
  const current = orc.objetoCustom || orc.objeto || "";
  const novo = prompt("Resumo do objeto (edite para facilitar visualização):", current);
  if (novo === null) return; // cancelled
  if (!orc.objetoOriginal) orc.objetoOriginal = orc.objeto; // preserve original on first edit
  orc.objetoCustom = novo.trim();
  localStorage.setItem("caixaescolar.orcamentos", JSON.stringify(orcamentos));
  renderOrcamentos();
  showToast("Objeto atualizado.");
};

window.resetarObjeto = function(orcId) {
  const orc = orcamentos.find(o => o.id === orcId);
  if (!orc) return;
  delete orc.objetoCustom;
  // Keep objetoOriginal for reference, but clear the custom override
  localStorage.setItem("caixaescolar.orcamentos", JSON.stringify(orcamentos));
  renderOrcamentos();
  showToast("Objeto restaurado ao original.");
};

function descartarSelecionados() {
  if (selectedOrcIds.size === 0) return;
  const count = selectedOrcIds.size;
  if (!confirm(`Descartar ${count} processo(s)?`)) return;
  for (const id of selectedOrcIds) {
    descartados.add(String(id));
  }
  selectedOrcIds.clear();
  saveDescartados();
  renderOrcamentos();
  renderKPIs();
  showToast(`${count} processos descartados.`);
}

// ===== ITENS MESTRES (Story 4.26) =====
const MESTRES_KEY = "caixaescolar.itens-mestres";
let itensMestres = [];

function loadMestres() {
  try {
    const raw = localStorage.getItem(MESTRES_KEY);
    itensMestres = raw ? JSON.parse(raw) : [];
  } catch (_) { itensMestres = []; }
}

function saveMestres() {
  localStorage.setItem(MESTRES_KEY, JSON.stringify(itensMestres));
  schedulCloudSync();
}

function generateMestreId() {
  return "mestre-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5);
}

// Token-based Jaccard similarity
function calcSimilarity(a, b) {
  const tokA = new Set(normalizedText(a).split(/\s+/).filter(t => t.length > 2));
  const tokB = new Set(normalizedText(b).split(/\s+/).filter(t => t.length > 2));
  if (tokA.size === 0 && tokB.size === 0) return 1;
  if (tokA.size === 0 || tokB.size === 0) return 0;
  const inter = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : inter / union;
}

// Extract product attributes from description
function extractAttributes(desc) {
  const up = (desc || "").toUpperCase();
  return {
    marca: up.match(/\b(CHAMEX|REPORT|NEVE|DONA BENTA|SADIA|PERDIGAO|TILIBRA|FABER.CASTELL|PILOT|BIC|3M|SCOTCH.BRITE|BOMBRIL|YPE|VEJA|PINHO SOL|COALA|LIMPOL|BRILHANTE|OMO|COMFORT|DOWNY)\b/)?.[0] || "",
    volume: up.match(/(\d+)\s*(ML|L|LITRO)/)?.[0] || "",
    gramatura: up.match(/(\d+)\s*(G|GR|GRAMA)S?\b/)?.[0] || "",
    folhas: up.match(/(\d+)\s*(FLS|FOLHAS?|FL)\b/)?.[0] || "",
    peso: up.match(/(\d+[\.,]?\d*)\s*(KG)\b/)?.[0] || "",
  };
}

// Find best matching mestre for a product name
function findBestMestre(nome) {
  if (!nome || itensMestres.length === 0) return null;
  const norm = normalizedText(nome);

  // 1. Exact alias match
  for (const m of itensMestres) {
    for (const alias of (m.aliases || [])) {
      if (normalizedText(alias) === norm) return { mestre: m, score: 1.0 };
    }
  }

  // 2. Similarity-based match
  let best = null;
  let bestScore = 0;
  for (const m of itensMestres) {
    // Compare against canonical name
    let score = calcSimilarity(nome, m.nomeCanonico);
    // Also compare against all aliases
    for (const alias of (m.aliases || [])) {
      const s = calcSimilarity(nome, alias);
      if (s > score) score = s;
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  if (bestScore >= 0.5 && best) return { mestre: best, score: bestScore };
  return null;
}

// Create a new Item Mestre from a banco item
function createMestreFromItem(bancoItem) {
  const attrs = extractAttributes(bancoItem.item);
  const mestre = {
    id: generateMestreId(),
    nomeCanonico: bancoItem.item,
    categoria: bancoItem.grupo || "",
    unidadeBase: bancoItem.unidade || "Unidade",
    atributos: attrs,
    aliases: [bancoItem.item],
    criadoEm: new Date().toISOString().slice(0, 10),
    atualizadoEm: new Date().toISOString().slice(0, 10),
  };
  itensMestres.push(mestre);
  return mestre;
}

// Link a banco item to an existing mestre (add alias if not present)
function linkItemToMestre(itemName, mestreId) {
  const m = itensMestres.find(x => x.id === mestreId);
  if (!m) return;
  const norm = normalizedText(itemName);
  const exists = m.aliases.some(a => normalizedText(a) === norm);
  if (!exists) {
    m.aliases.push(itemName);
    m.atualizadoEm = new Date().toISOString().slice(0, 10);
  }
}

// Merge two mestres into one (keep first, absorb second)
function mergeMestres(keepId, absorbId) {
  const keep = itensMestres.find(m => m.id === keepId);
  const absorb = itensMestres.find(m => m.id === absorbId);
  if (!keep || !absorb || keepId === absorbId) return;
  // Merge aliases
  for (const alias of absorb.aliases) {
    if (!keep.aliases.some(a => normalizedText(a) === normalizedText(alias))) {
      keep.aliases.push(alias);
    }
  }
  keep.atualizadoEm = new Date().toISOString().slice(0, 10);
  // Update banco items that pointed to absorbed mestre
  bancoPrecos.itens.forEach(item => {
    if (item.mesterId === absorbId) item.mesterId = keepId;
  });
  // Remove absorbed
  itensMestres = itensMestres.filter(m => m.id !== absorbId);
  saveMestres();
  saveBancoLocal();
}

// ===== ARQUIVOS IMPORTADOS (Story 4.27) =====
const ARQUIVOS_KEY = "caixaescolar.arquivos-importados";
let arquivosImportados = [];

function loadArquivos() {
  try {
    const raw = localStorage.getItem(ARQUIVOS_KEY);
    arquivosImportados = raw ? JSON.parse(raw) : [];
  } catch (_) { arquivosImportados = []; }
}

function saveArquivos() {
  localStorage.setItem(ARQUIVOS_KEY, JSON.stringify(arquivosImportados));
  schedulCloudSync();
}

function registrarArquivo(nomeArquivo, fornecedor, tipoFonte, qtdItens) {
  const confianca = tipoFonte === "manual" ? 1.0 : tipoFonte === "excel" ? 0.95 : tipoFonte === "pdf-texto" ? 0.75 : 0.50;
  const arquivo = {
    id: "arq-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
    nomeArquivo, fornecedor: fornecedor || "",
    dataImportacao: new Date().toISOString().slice(0, 10),
    tipoFonte, qtdItens, confianca
  };
  arquivosImportados.push(arquivo);
  saveArquivos();
  return arquivo;
}

// ===== EQUIVALÊNCIAS PRODUTO (Story 4.35) =====
const GDP_EQUIV_KEY = "gdp.equivalencias.v1";
let equivalencias = {}; // { normalizedContractDesc: sku }

function loadEquivalencias() {
  try { equivalencias = JSON.parse(localStorage.getItem(GDP_EQUIV_KEY) || "{}"); } catch (_) { equivalencias = {}; }
}

function saveEquivalencias() {
  localStorage.setItem(GDP_EQUIV_KEY, JSON.stringify(equivalencias));
  schedulCloudSync();
}

function getEquivalencia(descricao) {
  const key = normalizedText(descricao);
  const sku = equivalencias[key] || null;
  if (!sku) return null;
  return sku;
}

function getProdutoBySku(sku) {
  return bancoPrecos.itens.find(i => i.sku === sku) || null;
}

function setEquivalencia(descricao, sku) {
  equivalencias[normalizedText(descricao)] = sku;
  saveEquivalencias();
}

// ===== CONVERSOES E DEMANDAS (Story 4.36) =====
const CONVERSOES_KEY = "gdp.conversoes.v1";
const DEMANDAS_KEY = "gdp.demandas.v1";
let conversoes = {}; // { normalizedDesc: { fator, unOrigem, unDestino } }
let demandas = [];

function loadConversoes() { try { conversoes = JSON.parse(localStorage.getItem(CONVERSOES_KEY) || "{}"); } catch (_) { conversoes = {}; } }
function saveConversoes() { localStorage.setItem(CONVERSOES_KEY, JSON.stringify(conversoes)); schedulCloudSync(); }
function loadDemandas() { try { demandas = JSON.parse(localStorage.getItem(DEMANDAS_KEY) || "[]"); } catch (_) { demandas = []; } }
function saveDemandas() { localStorage.setItem(DEMANDAS_KEY, JSON.stringify(demandas)); schedulCloudSync(); }

// ===== ESTOQUE E COMPRAS (Story 4.37) =====
const ESTOQUE_KEY = "gdp.estoque.v1";
const COMPRAS_KEY = "gdp.lista-compras.v1";
let estoque = {}; // { sku: { qtd, qtdComprometida, minimo } }
let listaCompras = []; // [{ sku, produto, qtd, fornecedor, custo, demandaId }]

function loadEstoque() { try { estoque = JSON.parse(localStorage.getItem(ESTOQUE_KEY) || "{}"); } catch (_) { estoque = {}; } }
function saveEstoque() { localStorage.setItem(ESTOQUE_KEY, JSON.stringify(estoque)); schedulCloudSync(); }
function loadListaCompras() { try { listaCompras = JSON.parse(localStorage.getItem(COMPRAS_KEY) || "[]"); } catch (_) { listaCompras = []; } }
function saveListaCompras() { localStorage.setItem(COMPRAS_KEY, JSON.stringify(listaCompras)); schedulCloudSync(); }

// Calculate price trend from history
function calcTendencia(custosFornecedor) {
  if (!custosFornecedor || custosFornecedor.length < 2) return { tipo: "sem-dados", pct: 0 };
  const sorted = [...custosFornecedor].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const ultimo = sorted[0].preco;
  const penultimo = sorted[1].preco;
  if (!ultimo || !penultimo || penultimo === 0) return { tipo: "sem-dados", pct: 0 };
  const variacao = ((ultimo - penultimo) / penultimo) * 100;
  if (Math.abs(variacao) < 5) return { tipo: "estavel", pct: variacao };
  return { tipo: variacao > 0 ? "subindo" : "caindo", pct: variacao };
}

// Format trend as badge HTML
function renderTendenciaBadge(custosFornecedor) {
  const t = calcTendencia(custosFornecedor);
  if (t.tipo === "sem-dados") return '<span class="text-muted">\u2014</span>';
  const arrow = t.tipo === "subindo" ? "\u25B2" : t.tipo === "caindo" ? "\u25BC" : "\u25CF";
  const color = t.tipo === "subindo" ? "#e74c3c" : t.tipo === "caindo" ? "#27ae60" : "#95a5a6";
  const pctStr = (t.pct > 0 ? "+" : "") + t.pct.toFixed(1) + "%";
  return `<span style="color:${color};font-weight:600;" title="${pctStr}">${arrow} ${pctStr}</span>`;
}

// Calculate stats for an item's price history
function calcHistoricoStats(custosFornecedor) {
  if (!custosFornecedor || custosFornecedor.length === 0) return null;
  const precos = custosFornecedor.map(c => c.preco).filter(p => p > 0);
  if (precos.length === 0) return null;
  const sorted = [...precos].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const media = precos.reduce((s, p) => s + p, 0) / precos.length;
  const mediana = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const byDate = [...custosFornecedor].filter(c => c.preco > 0).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const melhorFornecedor = byDate.length > 0
    ? byDate.reduce((best, c) => c.preco < best.preco ? c : best, byDate[0]).fornecedor
    : "";
  return { min, max, media, mediana, melhorFornecedor, totalRegistros: precos.length };
}

// Calculate equivalent unit price
function calcPrecoUnitario(preco, unidadeDesc, quantidade) {
  if (!preco || preco <= 0) return preco;
  const desc = (unidadeDesc || "").toLowerCase();

  // Check UNIT_CONVERSIONS for embedded quantity
  for (const [, conv] of Object.entries(UNIT_CONVERSIONS)) {
    for (const alias of conv.aliases) {
      if (desc.includes(alias)) {
        // Try to extract quantity from description like "caixa c/ 12"
        const qtyMatch = desc.match(/(\d+)/);
        const qty = qtyMatch ? parseInt(qtyMatch[1]) : conv.defaultQty;
        if (qty > 1) return preco / qty;
      }
    }
  }

  // If explicit quantity provided and > 1
  if (quantidade && quantidade > 1) {
    // Check if price looks like total (heuristic: if unit desc mentions pack/box)
    if (/caixa|cx|pacote|pct|fardo|fd|kit/i.test(desc)) {
      return preco / quantidade;
    }
  }

  return preco;
}

// ===== SUPABASE CLOUD SYNC =====
const SUPABASE_URL = "https://mvvsjaudhbglxttxaeop.supabase.co";
const SUPABASE_KEY = "sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR";
const SHARED_SYNC_KEYS = new Set([
  "caixaescolar.banco.v1", "caixaescolar.preorcamentos.v1", "caixaescolar.resultados.v1",
  "caixaescolar.contratos.v1", "caixaescolar.orcamentos", "caixaescolar.descartados",
  "caixaescolar.itens-mestres", "caixaescolar.arquivos-importados",
  "gdp.contratos.v1", "gdp.pedidos.v1", "gdp.entregas.provas.v1", "gdp.usuarios.v1",
  "gdp.notas-entrada.v1", "gdp.notas-fiscais.v1", "gdp.contas-pagar.v1",
  "gdp.contas-receber.v1", "gdp.integracoes.v1", "gdp.estoque.movimentos.v1",
  "gdp.equivalencias.v1",
  "gdp.conversoes.v1", "gdp.demandas.v1",
  "gdp.estoque.v1", "gdp.lista-compras.v1"
]);
const RESULTADOS_STORAGE_KEY = "caixaescolar.resultados.v1";
const CONTRATOS_STORAGE_KEY = "caixaescolar.contratos.v1";
const PNCP_CACHE_KEY = "caixaescolar.pncp.cache";
const DEFAULT_EMPRESA = {
  nome: "LARIUCCI",
  nomeFantasia: "LARIUCCI",
  razaoSocial: "Edson de Sousa Goncalves",
  cnpj: "36.802.147/0001-42",
  cidade: "Conquista",
  uf: "MG",
  sre: "Conquista-MG",
  syncUserId: "LARIUCCI"
};
const SYNC_KEYS = [
  "nexedu.empresa", "caixaescolar.banco.v1", "caixaescolar.preorcamentos.v1",
  "caixaescolar.resultados.v1", "caixaescolar.contratos.v1", "caixaescolar.orcamentos",
  "caixaescolar.descartados", "caixaescolar.itens-mestres", "caixaescolar.arquivos-importados",
  "gdp.contratos.v1", "gdp.pedidos.v1", "gdp.entregas.provas.v1",
  "gdp.usuarios.v1", "gdp.notas-entrada.v1", "gdp.notas-fiscais.v1", "gdp.contas-pagar.v1",
  "gdp.contas-receber.v1", "gdp.integracoes.v1", "gdp.estoque.movimentos.v1",
  "gdp.equivalencias.v1",
  "gdp.conversoes.v1", "gdp.demandas.v1",
  "gdp.estoque.v1", "gdp.lista-compras.v1",
  "nexedu.config.contas-bancarias", "nexedu.config.fiscal", "nexedu.config.bank-api"
];

function ensureEmpresaContext() {
  let empresa = {};
  try {
    empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  } catch (_) {
    empresa = {};
  }
  const hasIdentity = [empresa.syncUserId, empresa.nomeFantasia, empresa.nome, empresa.cnpj]
    .map((value) => String(value || "").trim())
    .some(Boolean);
  if (hasIdentity) return empresa;
  const seeded = { ...DEFAULT_EMPRESA };
  localStorage.setItem("nexedu.empresa", JSON.stringify(seeded));
  return seeded;
}

function getSyncUserCandidates() {
  const emp = ensureEmpresaContext();
  const cnpjDigits = String(emp.cnpj || "").replace(/\D+/g, "");
  return [...new Set([
    emp.syncUserId,
    emp.nomeFantasia,
    emp.nome,
    emp.razaoSocial,
    cnpjDigits,
    emp.cnpj,
    "LARIUCCI",
    "default"
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function persistResolvedSyncUser(userId) {
  const resolved = String(userId || "").trim();
  if (!resolved || resolved.toLowerCase() === "default") return;
  const emp = ensureEmpresaContext();
  if (emp.syncUserId === resolved) return;
  localStorage.setItem("nexedu.empresa", JSON.stringify({ ...emp, syncUserId: resolved }));
}

function getSyncUserId() {
  const emp = ensureEmpresaContext();
  return emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || "default";
}

async function cloudSave(key, data) {
  const userId = getSyncUserId();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_data?on_conflict=user_id,key`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify({ user_id: userId, key, data, updated_at: new Date().toISOString() })
    });
  } catch (e) { console.warn("Cloud save failed:", key, e); }
}

async function cloudLoadAll() {
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
  for (const userId of getSyncUserCandidates()) {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(userId)}&select=key,data,updated_at`,
        { headers }
      );
      if (!resp.ok) continue;
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        persistResolvedSyncUser(userId);
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

async function syncFromCloud() {
  const rows = await cloudLoadAll();
  if (!rows || rows.length === 0) return false;
  let synced = 0;

  for (const row of rows) {
    const local = localStorage.getItem(row.key);
    let localData = null;
    try {
      localData = local ? JSON.parse(local) : null;
    } catch (_) {
      localData = null;
    }

    if (!row.data) continue;
    if (!localData) {
      localStorage.setItem(row.key, JSON.stringify(row.data));
      synced++;
      continue;
    }

    const cloudTime = getDataTimestamp(row.data, row.updated_at);
    const localTime = getDataTimestamp(localData);
    const isSharedKey = SHARED_SYNC_KEYS.has(row.key);

    // Merge protection: if local has MORE items than cloud, keep local (prevents data loss)
    const localItems = localData?.items || (Array.isArray(localData) ? localData : null);
    const cloudItems = row.data?.items || (Array.isArray(row.data) ? row.data : null);
    if (localItems && cloudItems && localItems.length > cloudItems.length && cloudItems.length > 0) {
      console.warn("[Sync] Keeping local for " + row.key + " (local:" + localItems.length + " > cloud:" + cloudItems.length + ")");
      continue;
    }

    if (isSharedKey || cloudTime > localTime || (!localTime && cloudTime === 0)) {
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
      // Guard: never push empty/tiny data if cloud has more
      if (Array.isArray(data) && data.length === 0) return Promise.resolve();
      if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return Promise.resolve();
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
    // Try to get CNPJ from empresa config first
    let cnpj = '';
    try {
      const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
      cnpj = (empresa.cnpj || '').replace(/\D/g, '');
    } catch(_) {}
    if (!cnpj) {
      cnpj = prompt("CNPJ do fornecedor (somente numeros):");
      if (!cnpj) return null;
    }
    const pass = prompt("Senha SGD (fornecedor " + cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') + "):");
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

  async getUser() {
    await this.ensureAuth();
    const user = await this.proxy({ action: "get-user", cookie: this.cookie });
    if (user.idNetwork) this.networkId = user.idNetwork;
    if (user.networks && user.networks.length > 0) {
      this.networkId = user.networks[0].idNetwork || user.networks[0].id;
    }
    return user;
  },

  async listBudgets(page = 1, limit = 50, supplierStatus = null) {
    await this.ensureAuth();
    const payload = { action: "list-budgets", cookie: this.cookie, networkId: this.networkId, page, limit };
    if (supplierStatus) payload.supplierStatus = supplierStatus;
    const data = await this.proxy(payload);
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
  if (!dateIso) return "—";
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
  ensureEmpresaContext();
  // 1. Load local data FIRST (instant — no network)
  loadPreOrcamentos();
  loadDescartados();
  loadMestres();
  loadArquivos();
  loadEquivalencias();
  loadConversoes();
  loadDemandas();
  loadEstoque();
  loadListaCompras();
  carregarModulosConfig();
  aplicarAcessoSidebar();

  // Data version check
  const DATA_VERSION = "v5";
  const storedVersion = localStorage.getItem("caixaescolar.data-version");
  if (storedVersion !== DATA_VERSION) {
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

  // Load banco from localStorage if available
  loadBancoLocal();

  // 2. Bind events + render with local data immediately
  populateFilters();
  bindEvents();
  renderAll();

  // 3. Restore active module IMMEDIATELY (no flash of wrong module)
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

  // Mostrar botões SGD em qualquer modo
  if (el.btnCollectSgd) el.btnCollectSgd.style.display = "inline-block";
  const btnVarrer = document.getElementById("btn-varrer-sgd");
  if (btnVarrer) btnVarrer.style.display = "inline-block";

  // 4. Background: load JSON data + cloud sync (non-blocking)
  const [orcData, bancoData, perfilData, ...sreResults] = await Promise.all([
    fetchJson("data/orcamentos.json"),
    fetchJson("data/banco-precos.json"),
    fetchJson("data/perfil.json"),
    ...SRE_CONFIGS.map(c => fetchJson(c.arquivo)),
  ]);

  perfil = perfilData || {};
  // Load all SRE data (Story 4.33)
  allSreData = SRE_CONFIGS.map((c, i) => ({
    ...c,
    data: sreResults[i] || { municipios: [] }
  }));
  // Backward compatibility
  sreData = allSreData[0]?.data || {};

  // Banco: se não tinha no localStorage, carrega do JSON
  if (bancoPrecos.itens.length === 0 && bancoData && Array.isArray(bancoData.itens)) {
    bancoPrecos = bancoData;
    saveBancoLocal();
    renderAll();
  }

  // 5. SGD API check in background (avoid 2s timeout blocking render)
  isSgdApiAvailable().then(available => {
    sgdAvailable = available;
    updateModeIndicator(sgdAvailable);
  }).catch(() => {});

  // 6. Cloud sync — PULL first, THEN push (never overwrite cloud with stale local)
  syncFromCloud().then(synced => {
    if (synced) {
      console.log("[Boot] Cloud data synced to localStorage");
      loadPreOrcamentos();
      loadBancoLocal();
      // Reload orcamentos from freshly-synced localStorage
      const freshOrc = localStorage.getItem("caixaescolar.orcamentos");
      if (freshOrc) { try { orcamentos = JSON.parse(freshOrc); } catch(_) {} }
      renderAll();
    }
    // Only push AFTER pull completes — prevents overwriting cloud with empty data
    return syncToCloud();
  }).then(() => console.log("[Boot] Local data pushed to cloud"))
    .catch(e => console.warn("[Boot] Cloud sync failed:", e));
}

// ===== FILTERS =====
function populateFilters() {
  // Preserve current selections
  const prevSre = el.filtroSre ? el.filtroSre.value : "all";
  const prevEscola = el.filtroEscola.value;
  const prevMun = el.filtroMunicipio.value;
  const prevGrupo = el.filtroGrupo.value;

  // Clear existing options (keep first "all" option)
  [el.filtroSre, el.filtroEscola, el.filtroMunicipio, el.filtroGrupo].filter(Boolean).forEach((sel) => {
    while (sel.options.length > 1) sel.remove(1);
  });

  // SREs (Story 4.33) — populate dynamically from loaded data
  if (el.filtroSre) {
    const sres = [...new Set(orcamentos.map((o) => o.sre).filter(Boolean))].sort();
    sres.forEach((s) => {
      el.filtroSre.appendChild(new Option(s, s));
    });
    if (sres.includes(prevSre)) el.filtroSre.value = prevSre;
  }

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
  const sre = el.filtroSre ? el.filtroSre.value : "all";
  const escola = el.filtroEscola.value;
  const mun = el.filtroMunicipio.value;
  const grupo = el.filtroGrupo.value;
  const status = el.filtroStatus.value;
  const query = normalizedText(el.filtroTexto.value.trim());

  return orcamentos
    .filter((o) => sre === "all" || o.sre === sre)
    .filter((o) => escola === "all" || o.escola === escola)
    .filter((o) => mun === "all" || o.municipio === mun)
    .filter((o) => grupo === "all" || o.grupo === grupo)
    .filter((o) => {
      if (status === "com-preorcamento") return !!(preOrcamentos && preOrcamentos[o.id]);
      if (status === "descartados") return isDescartado(o.id);
      return !isDescartado(o.id);
    })
    .filter((o) => {
      if (status === "all" || status === "descartados" || status === "com-preorcamento") return true;
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
    .filter((o) => {
      const de = document.getElementById("filtro-data-de")?.value;
      const ate = document.getElementById("filtro-data-ate")?.value;
      if (!de && !ate) return true;
      return dentroDoIntervalo(o.prazo, de, ate);
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
  const abertos = orcamentos.filter((o) => o.status === "aberto" && !isDescartado(o.id));
  const urgentes = abertos.filter((o) => daysTo(o.prazo) <= 3 && daysTo(o.prazo) >= 0 && !(preOrcamentos && preOrcamentos[o.id]));

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

  const viewingDescartados = el.filtroStatus.value === "descartados";

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
    if (viewingDescartados) {
      actionBtn = `<button class="btn btn-inline" onclick="restaurarOrc('${o.id}')">Restaurar</button>`;
    } else if (o.status === "aberto") {
      if (excluido) {
        actionBtn = '<span class="badge badge-fora-escopo">Fora do escopo</span>';
      } else if (preOrc) {
        const pBadge = preOrc.status === "ganho"
          ? '<span class="badge badge-ganho">Ganho</span>'
          : preOrc.status === "perdido"
            ? '<span class="badge badge-perdido">Perdido</span>'
            : preOrc.status === "enviado"
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
      // Botão descartar para abertos sem pré-orçamento e não excluídos
      if (!preOrc && !excluido) {
        actionBtn += ` <button class="btn btn-inline btn-muted" onclick="descartarOrc('${o.id}')" title="Descartar processo">&#10005;</button>`;
      }
    }

    // Checkbox (Passo 3) — só para abertos não excluídos sem pré-orçamento
    const canSelect = o.status === "aberto" && !excluido && !preOrc && !viewingDescartados;
    const checked = selectedOrcIds.has(o.id) ? "checked" : "";
    const checkboxHtml = canSelect
      ? `<input type="checkbox" class="row-check" data-id="${o.id}" ${checked} />`
      : "";

    const trStyle = viewingDescartados ? ' style="opacity:0.6"' : '';
    const objetoDisplay = o.objetoCustom || (o.objeto || "").replace(/\n/g, " ");
    const objetoOriginal = o.objeto || "";
    const isCustom = o.objetoCustom && o.objetoCustom !== objetoOriginal;
    const editIcon = `<span class="btn-inline btn-muted" onclick="event.stopPropagation();editarObjeto('${o.id}')" title="Editar objeto" style="cursor:pointer;font-size:0.7rem;margin-left:4px">&#9998;</span>`;
    const resetIcon = isCustom ? `<span class="btn-inline btn-muted" onclick="event.stopPropagation();resetarObjeto('${o.id}')" title="Restaurar original" style="cursor:pointer;font-size:0.7rem;margin-left:2px">&#8617;</span>` : "";
    const itensResumo = (o.itens && o.itens.length > 0) ? '<br><span style="font-size:0.7rem;color:#666;">' + o.itens.length + ' iten(s): ' + o.itens.slice(0,3).map(i => escapeHtml((i.nome||'').slice(0,20))).join(', ') + (o.itens.length > 3 ? '...' : '') + '</span>' : '';

    return `<tr${trStyle}>
      <td>${checkboxHtml}</td>
      <td class="font-mono text-muted">${escapeHtml(o.id)}</td>
      <td>${escapeHtml(o.escola)}</td>
      <td>${escapeHtml(o.municipio)}</td>
      <td class="obj-cell" title="${escapeHtml(objetoOriginal)}">${escapeHtml(objetoDisplay)}${isCustom ? ' <span class="badge badge-editado" style="font-size:0.6rem">editado</span>' : ''}${resetIcon}${editIcon}${itensResumo}</td>
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

  // Status banner for ganho/perdido
  const analiseContainer = document.getElementById("analise-competitiva-container");
  if (analiseContainer) {
    if (pre.status === "ganho") {
      const contratoNum = pre.contratoNumero || "—";
      analiseContainer.innerHTML = `<div style="background:#d1fae5;border:1px solid #10b981;padding:0.75rem;border-radius:8px;margin-bottom:1rem;">
        <strong style="color:#065f46;">CONTRATO GANHO</strong>
        <div style="margin-top:0.3rem;font-size:0.85rem;">
          Contrato: <strong>${escapeHtml(contratoNum)}</strong> | Escola: <strong>${escapeHtml(pre.escola)}</strong> | Valor: <strong>${brl.format(pre.totalGeral)}</strong> | ${pre.itens ? pre.itens.length : 0} itens
        </div>
      </div>`;
    } else if (pre.status === "perdido") {
      analiseContainer.innerHTML = `<div style="background:#fee2e2;border:1px solid #ef4444;padding:0.75rem;border-radius:8px;margin-bottom:1rem;">
        <strong style="color:#991b1b;">PROCESSO PERDIDO</strong>
        <div style="margin-top:0.3rem;font-size:0.85rem;">Escola: ${escapeHtml(pre.escola)} | Valor: ${brl.format(pre.totalGeral)}</div>
      </div>`;
    } else {
      analiseContainer.innerHTML = renderAnaliseCompetitiva(pre);
    }
  }

  renderPreOrcamentoItens();

  // Auto-preencher button (Story 4.29) — show when pre-orcamento is active and editable
  const btnAuto = document.getElementById("btn-auto-preencher");
  if (btnAuto) btnAuto.style.display = (pre.status === "pendente" || pre.status === "aprovado") ? "inline-block" : "none";

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
// Enriquecer itens com sugestão do banco de preços (async)
async function enrichWithBancoPrecos(pre) {
  if (typeof BancoPrecos === "undefined" || !BancoPrecos.isEnabled()) return;
  if (!pre || !pre.itens) return;

  for (const item of pre.itens) {
    if (item._bpLoaded) continue; // skip if already enriched
    try {
      const result = await BancoPrecos.calcularPreco(
        item.nome, item.unidade, item.quantidade,
        pre.escola || "", pre.municipio || ""
      );
      if (result) {
        item._bpHtml = BancoPrecos.precoSugeridoHtml(result);
        item._bpPrecoSugerido = result.preco_sugerido;
        item._bpSemaforo = result.semaforo;
        item._bpLoaded = true;
      }
    } catch (_) { /* silent */ }
  }
}

function renderPreOrcamentoItens() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  // Trigger async enrichment (updates _bpHtml for next render)
  enrichWithBancoPrecos(pre).then(() => {
    // Re-render only if we got new data
    if (pre.itens.some(i => i._bpHtml && !i._bpRendered)) {
      pre.itens.forEach(i => { if (i._bpHtml) i._bpRendered = true; });
      renderPreOrcamentoItens(); // recursive but stops because _bpRendered is set
    }
  });

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

    // Botão pesquisar preço (Story 4.30+)
    const searchBtn = isEditable
      ? `<div class="search-preco-wrap" style="margin-top:4px;">
          <button class="btn btn-inline btn-sm" onclick="toggleSearchMenu(${idx})" title="Pesquisar preço" style="font-size:0.7rem;padding:2px 6px;">🔍 Pesquisar</button>
          <div id="search-menu-${idx}" class="search-menu" style="display:none;position:absolute;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:100;padding:4px 0;min-width:180px;">
            <a href="#" onclick="pesquisarPrecoPNCP(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">📋 PNCP (Preço de Referência)</a>
            <a href="#" onclick="pesquisarPrecoGoogle(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">🔎 Google Shopping</a>
            <a href="#" onclick="pesquisarPrecoBanco(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">💰 Banco de Preços</a>
            <a href="#" onclick="pesquisarPrecoMercadoLivre(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">🛒 Mercado Livre</a>
          </div>
        </div>`
      : "";

    // Equivalência de produto (Story 4.35)
    const equivSku = getEquivalencia(item.nome);
    const equivProd = equivSku ? getProdutoBySku(equivSku) : null;
    let equivHint = "";
    if (equivSku && equivProd) {
      equivHint = `<br><span style="font-size:0.72rem;color:#059669;" title="SKU: ${escapeHtml(equivSku)}">&#10003; Produto: ${escapeHtml(equivProd.nomeComercial || equivProd.item)}</span> <button class="btn btn-inline" onclick="abrirModalVincular('${escapeHtml(activePreOrcamentoId)}', ${idx})" style="font-size:0.65rem;padding:1px 4px;color:#6b7280;" title="Alterar vínculo">&#9998;</button>`;
    } else if (equivSku) {
      equivHint = `<br><span style="font-size:0.72rem;color:#059669;">&#10003; Vinculado: ${escapeHtml(equivSku)}</span> <button class="btn btn-inline" onclick="abrirModalVincular('${escapeHtml(activePreOrcamentoId)}', ${idx})" style="font-size:0.65rem;padding:1px 4px;color:#6b7280;" title="Alterar vínculo">&#9998;</button>`;
    } else if (pre.status === "ganho") {
      equivHint = `<br><button class="btn btn-inline" onclick="abrirModalVincular('${escapeHtml(activePreOrcamentoId)}', ${idx})" style="font-size:0.7rem;padding:2px 8px;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;border-radius:4px;">Vincular Produto</button>`;
    }

    return `<tr>
      <td>
        <strong>${escapeHtml(item.nome)}</strong>
        <br><span class="text-muted" style="font-size:0.75rem">${escapeHtml(item.descricao)}</span>
        <br><span class="text-muted" style="font-size:0.72rem">${item.quantidade} ${escapeHtml(item.unidade)}</span>
        ${pncpHint}
        ${concHint}
        ${fornHint}
        ${item._bpHtml || ""}
        ${equivHint}
        ${searchBtn}
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
    const oldMarca = (item.marca || "").trim();
    item.marca = value.trim();
    // Sync marca to banco
    let bp = findBancoItem(item.nome);
    if (bp) {
      bp.marca = item.marca;
      saveBancoLocal();
    }
    // Atualizar observação: remover marca antiga e inserir nova
    let obs = (item.observacao || item.descricao || item.nome || "").trim();
    if (oldMarca) obs = obs.replace(`[Marca: ${oldMarca}] `, "").replace(`[Marca: ${oldMarca}]`, "").trim();
    item.observacao = item.marca ? `[Marca: ${item.marca}] ${obs}` : obs;
    // Atualizar textarea se visível na aba Envio SGD
    const obsEl = document.getElementById(`sgd-obs-${idx}`);
    if (obsEl) obsEl.value = item.observacao;
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
  // Hide auto-preencher button (Story 4.29)
  const btnAuto = document.getElementById("btn-auto-preencher");
  if (btnAuto) btnAuto.style.display = "none";
  // Clear competitive analysis (Story 4.29)
  const analiseContainer = document.getElementById("analise-competitiva-container");
  if (analiseContainer) analiseContainer.innerHTML = "";
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

  // Story 4.40: populate escola dropdown
  const fPreEscola = document.getElementById("filtro-pre-escola");
  if (fPreEscola && fPreEscola.options.length <= 1) {
    const escolas = [...new Set(items.map(p => p.escola).filter(Boolean))].sort();
    escolas.forEach(e => { const o = document.createElement("option"); o.value = e; o.textContent = e; fPreEscola.appendChild(o); });
  }

  // Story 4.40: apply filters
  const fPreStatus = document.getElementById("filtro-pre-status")?.value || "all";
  const fPreTexto = normalizedText(document.getElementById("filtro-pre-texto")?.value?.trim() || "");
  const fPreEscolaVal = fPreEscola ? fPreEscola.value : "all";

  let filtered = items;
  if (fPreEscolaVal !== "all") filtered = filtered.filter(p => p.escola === fPreEscolaVal);
  if (fPreStatus !== "all") filtered = filtered.filter(p => p.status === fPreStatus);
  if (fPreTexto) filtered = filtered.filter(p => normalizedText([p.escola, p.municipio, p.orcamentoId, ...(p.itens || []).map(i => i.nome)].join(" ")).includes(fPreTexto));

  const sorted = filtered.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  el.tbodyPreorcamentosLista.innerHTML = sorted
    .map((p) => {
      const badgeClass = p.status === "ganho" ? "badge-ganho"
        : p.status === "perdido" ? "badge-perdido"
          : p.status === "enviado" ? "badge-enviado"
            : p.status === "aprovado" ? "badge-aprovado"
              : p.status === "recusado" ? "badge-recusado" : "badge-pendente";
      const checkbox = `<input type="checkbox" class="pre-lote-check" data-id="${p.orcamentoId}" />`;
      // Story 4.42: items summary with fallback to objeto
      const orc = orcamentos.find(o => o.id === p.orcamentoId);
      const iSummary = getItemsSummary(p) || getItemsSummary(orc || {}) || escapeHtml((orc?.objeto || "").replace(/\n/g, " ").slice(0, 60));
      const iTooltip = escapeHtml((orc?.objeto || "").replace(/\n/g, " ").slice(0, 200));
      return `<tr>
        <td>${checkbox}</td>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td title="${iTooltip}" style="font-size:0.8rem;max-width:200px;">${iSummary}</td>
        <td><span class="badge ${badgeClass}">${p.status}</span></td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td class="nowrap">${formatDate(p.criadoEm)}</td>
        <td>
          <button class="btn btn-inline" onclick="abrirPreOrcamento('${p.orcamentoId}')">Ver</button>
          ${(p.status === "ganho" || p.status === "perdido" || p.status === "enviado") ? `<button class="btn btn-inline" onclick="editarResultadoPreOrcamento('${p.orcamentoId}')" title="Alterar resultado">Editar Resultado</button>` : ""}
          <button class="btn btn-inline btn-danger" onclick="removerPreOrcamento('${p.orcamentoId}')">Excluir</button>
        </td>
      </tr>`;
    }).join("");

  // Barra de ações em lote
  let barHtml = document.getElementById("pre-lote-bar");
  if (!barHtml) {
    barHtml = document.createElement("div");
    barHtml.id = "pre-lote-bar";
    barHtml.style.cssText = "display:none;padding:0.5rem 1rem;background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;margin-bottom:0.75rem;align-items:center;gap:0.75rem;flex-wrap:wrap;";
    barHtml.innerHTML = `<span id="pre-lote-count" style="font-weight:600;">0 selecionados</span>
      <button class="btn btn-sm btn-danger" onclick="excluirPreLote()">Excluir Selecionados</button>
      <button class="btn btn-sm btn-accent" onclick="gerarContratoUnificado()">Gerar Contrato Unificado</button>`;
    el.tbodyPreorcamentosLista.parentElement.parentElement.insertBefore(barHtml, el.tbodyPreorcamentosLista.parentElement);
  }

  // Bind checkboxes
  function updatePreLoteBar() {
    const checked = el.tbodyPreorcamentosLista.querySelectorAll(".pre-lote-check:checked");
    const bar = document.getElementById("pre-lote-bar");
    const count = document.getElementById("pre-lote-count");
    if (bar) bar.style.display = checked.length > 0 ? "flex" : "none";
    if (count) count.textContent = `${checked.length} selecionado(s)`;
  }
  el.tbodyPreorcamentosLista.querySelectorAll(".pre-lote-check").forEach(cb => {
    cb.addEventListener("change", updatePreLoteBar);
  });
}

window.removerPreOrcamento = function (orcId) {
  if (!confirm("Remover este pré-orçamento?")) return;
  delete preOrcamentos[orcId];
  savePreOrcamentos();
  renderAll();
  voltarPreOrcamento();
};

window.excluirPreLote = function() {
  const checked = document.querySelectorAll(".pre-lote-check:checked");
  if (checked.length === 0) return;
  if (!confirm(`Excluir ${checked.length} pré-orçamento(s)?`)) return;
  [...checked].forEach(cb => { delete preOrcamentos[cb.dataset.id]; });
  savePreOrcamentos();
  renderAll();
  voltarPreOrcamento();
  showToast(`${checked.length} pré-orçamento(s) excluído(s).`);
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

    // P.U. (Story 4.26)
    const pu = calcPrecoUnitario(item.custoBase, item.unidade, 1);
    const puHtml = pu !== item.custoBase ? `<td class="text-right font-mono nowrap">${brl.format(pu)}</td>` : `<td class="text-muted text-right">—</td>`;

    // Tendencia (Story 4.27)
    const tendenciaHtml = renderTendenciaBadge(item.custosFornecedor);
    const proposalBadge = propostas.length > 0 ? `<br><span class="text-muted" style="font-size:0.7rem">${propostas.length} proposta(s)</span>` : "";

    return `<tr>
      <td><input type="checkbox" class="banco-item-check" data-id="${item.id}" /></td>
      <td><a href="#" onclick="openTimeline('${item.id}');return false;" style="text-decoration:none;color:inherit;"><strong>${escapeHtml(item.item)}</strong></a>${proposalBadge}</td>
      <td>${escapeHtml(item.marca || "")}</td>
      <td>${escapeHtml(item.grupo)}</td>
      <td class="text-right font-mono">${brl.format(item.custoBase)}</td>
      ${puHtml}
      <td class="text-right font-mono">${brl.format(minhaPropostaMedia)}</td>
      <td class="text-right font-mono">${menorConcorrente !== null ? brl.format(menorConcorrente) : "—"}</td>
      <td class="text-right font-mono">${brl.format(item.precoReferencia)}</td>
      <td class="text-right ${margemClass}">${margemRealStr}</td>
      <td class="text-center">${tendenciaHtml}</td>
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

  // Update intelligence panel if open (Story 4.28)
  const bancoIntelBody = document.getElementById("banco-intel-body");
  if (bancoIntelBody && bancoIntelBody.style.display !== "none") {
    renderBancoIntel();
  }
}

// ===== ITENS MESTRES UI (Story 4.26) =====
function renderMestresModal() {
  const modal = document.getElementById("modal-mestres");
  const tbody = document.getElementById("tbody-mestres");
  const filtro = document.getElementById("filtro-mestres");
  if (!modal || !tbody) return;

  const query = normalizedText((filtro ? filtro.value : "").trim());
  const filtered = itensMestres.filter(m => {
    if (!query) return true;
    const searchText = normalizedText([m.nomeCanonico, ...m.aliases, m.categoria].join(" "));
    return searchText.includes(query);
  });

  tbody.innerHTML = filtered.map(m => {
    const attrs = m.atributos || {};
    const attrParts = [attrs.marca, attrs.volume, attrs.gramatura, attrs.peso, attrs.folhas].filter(Boolean);
    const linkedCount = bancoPrecos.itens.filter(i => i.mesterId === m.id).length;
    return `<tr>
      <td><strong>${escapeHtml(m.nomeCanonico)}</strong> <span class="text-muted">(${linkedCount} itens)</span></td>
      <td class="text-muted" style="font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${m.aliases.slice(0, 3).map(a => escapeHtml(a)).join(", ")}${m.aliases.length > 3 ? "..." : ""}</td>
      <td>${escapeHtml(m.categoria)}</td>
      <td>${escapeHtml(m.unidadeBase)}</td>
      <td class="text-muted" style="font-size:0.75rem;">${attrParts.length ? attrParts.join(" | ") : "—"}</td>
      <td><button class="btn btn-inline btn-muted" onclick="removeMestre('${m.id}')" title="Excluir">&#10005;</button></td>
    </tr>`;
  }).join("");

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;">Nenhum item mestre encontrado.</td></tr>';
  }
}

window.openMestresModal = function() {
  const modal = document.getElementById("modal-mestres");
  if (modal) { modal.style.display = "flex"; renderMestresModal(); }
};

window.closeMestresModal = function() {
  const modal = document.getElementById("modal-mestres");
  if (modal) modal.style.display = "none";
};

window.removeMestre = function(id) {
  if (!confirm("Excluir este item mestre? Os itens do banco perderão o vínculo.")) return;
  bancoPrecos.itens.forEach(item => { if (item.mesterId === id) delete item.mesterId; });
  itensMestres = itensMestres.filter(m => m.id !== id);
  saveMestres();
  saveBancoLocal();
  renderMestresModal();
  showToast("Item mestre excluído.");
};

// ===== TIMELINE DE PRECOS (Story 4.27) =====
window.openTimeline = function(bancoItemId) {
  const item = bancoPrecos.itens.find(i => i.id === bancoItemId);
  if (!item) return;
  const modal = document.getElementById("modal-timeline");
  const titulo = document.getElementById("modal-timeline-titulo");
  const tbody = document.getElementById("tbody-timeline");
  if (!modal || !tbody) return;

  titulo.textContent = `Historico: ${item.item}`;
  const historico = [...(item.custosFornecedor || [])].sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  if (historico.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;">Sem historico.</td></tr>';
  } else {
    const minPreco = Math.min(...historico.map(h => h.preco).filter(p => p > 0));
    tbody.innerHTML = historico.map(h => {
      const isMin = h.preco === minPreco && h.preco > 0;
      const conf = h.confianca != null ? (h.confianca * 100).toFixed(0) + "%" : "\u2014";
      const arquivo = h.arquivoId ? arquivosImportados.find(a => a.id === h.arquivoId) : null;
      const fonteLabel = arquivo ? arquivo.tipoFonte : (h.fonte || "manual");
      return `<tr${isMin ? ' style="background:#e8f5e9;"' : ""}>
        <td class="nowrap">${formatDate(h.data)}</td>
        <td>${escapeHtml(h.fornecedor || "\u2014")}</td>
        <td class="nowrap"><strong>${brl.format(h.preco)}</strong></td>
        <td>${escapeHtml(fonteLabel)}</td>
        <td>${conf}</td>
      </tr>`;
    }).join("");
  }

  const stats = calcHistoricoStats(item.custosFornecedor);
  if (stats) {
    tbody.innerHTML += `<tr style="background:#f5f5f5;font-weight:600;">
      <td colspan="2">Resumo (${stats.totalRegistros} registros)</td>
      <td>Min: ${brl.format(stats.min)}</td>
      <td>Med: ${brl.format(stats.media)}</td>
      <td>Max: ${brl.format(stats.max)}</td>
    </tr>`;
  }

  modal.style.display = "flex";
};

window.closeTimeline = function() {
  const modal = document.getElementById("modal-timeline");
  if (modal) modal.style.display = "none";
};

// ===== INTELIGÊNCIA DE PREÇOS (Story 4.28) =====

function calcRankingFornecedores() {
  const fornMap = {}; // fornecedor -> { itens: Set, menorCount: 0, lastDate: "" }

  bancoPrecos.itens.forEach(item => {
    (item.custosFornecedor || []).forEach(c => {
      if (!c.fornecedor) return;
      if (!fornMap[c.fornecedor]) fornMap[c.fornecedor] = { itens: new Set(), menorCount: 0, lastDate: "" };
      fornMap[c.fornecedor].itens.add(item.id);
      if (c.data && c.data > fornMap[c.fornecedor].lastDate) fornMap[c.fornecedor].lastDate = c.data;
    });
    // Check who has lowest price for this item
    const precos = (item.custosFornecedor || []).filter(c => c.preco > 0 && c.fornecedor);
    if (precos.length > 0) {
      const menor = precos.reduce((min, c) => c.preco < min.preco ? c : min, precos[0]);
      if (fornMap[menor.fornecedor]) fornMap[menor.fornecedor].menorCount++;
    }
  });

  return Object.entries(fornMap).map(([nome, data]) => ({
    nome,
    qtdItens: data.itens.size,
    pctMenor: data.itens.size > 0 ? (data.menorCount / data.itens.size * 100) : 0,
    lastDate: data.lastDate,
  })).sort((a, b) => b.pctMenor - a.pctMenor);
}

function detectOportunidades() {
  const alertas = [];
  const hoje = new Date().toISOString().slice(0, 10);

  bancoPrecos.itens.forEach(item => {
    const stats = calcHistoricoStats(item.custosFornecedor);
    if (!stats) return;

    // High margin opportunity (my price > 30% above cost)
    if (item.custoBase > 0 && item.precoReferencia > 0) {
      const margem = (item.precoReferencia - item.custoBase) / item.custoBase;
      if (margem > 0.30) {
        alertas.push({ tipo: "margem-alta", item: item.item, msg: "Margem " + (margem*100).toFixed(0) + "% — pode reduzir para ser mais competitivo", id: item.id });
      }
    }

    // Competitor risk (competitor price 20%+ below mine)
    const menorConc = item.concorrentes && item.concorrentes.length > 0
      ? Math.min(...item.concorrentes.map(c => c.preco).filter(p => p > 0))
      : null;
    if (menorConc && item.precoReferencia > 0 && menorConc < item.precoReferencia * 0.80) {
      alertas.push({ tipo: "risco", item: item.item, msg: "Concorrente " + ((1 - menorConc/item.precoReferencia)*100).toFixed(0) + "% abaixo", id: item.id });
    }

    // Stale data (no update in 30+ days)
    const lastUpdate = item.ultimaCotacao || "";
    if (lastUpdate) {
      const daysSince = Math.ceil((new Date(hoje) - new Date(lastUpdate)) / 86400000);
      if (daysSince > 30) {
        alertas.push({ tipo: "desatualizado", item: item.item, msg: daysSince + " dias sem atualização", id: item.id });
      }
    }
  });

  return alertas;
}

function renderBancoIntel() {
  const totalMestres = itensMestres.length;
  const fornecedores = new Set();
  let somaPrecos = 0, countPrecos = 0, competitivos = 0, totalComConc = 0;

  bancoPrecos.itens.forEach(item => {
    (item.custosFornecedor || []).forEach(c => { if (c.fornecedor) fornecedores.add(c.fornecedor); });
    if (item.custoBase > 0) { somaPrecos += item.custoBase; countPrecos++; }

    const menorConc = item.concorrentes && item.concorrentes.length > 0
      ? Math.min(...item.concorrentes.map(c => c.preco).filter(p => p > 0))
      : null;
    if (menorConc) {
      totalComConc++;
      if (item.precoReferencia <= menorConc * 1.05) competitivos++;
    }
  });

  // KPIs
  const elMestres = document.getElementById("intel-total-mestres");
  const elForn = document.getElementById("intel-fornecedores");
  const elPreco = document.getElementById("intel-preco-medio");
  const elComp = document.getElementById("intel-pct-competitivo");
  if (elMestres) elMestres.textContent = totalMestres;
  if (elForn) elForn.textContent = fornecedores.size;
  if (elPreco) elPreco.textContent = countPrecos > 0 ? brl.format(somaPrecos / countPrecos) : "\u2014";
  if (elComp) elComp.textContent = totalComConc > 0 ? (competitivos/totalComConc*100).toFixed(0) + "%" : "\u2014";

  // Ranking
  const tbodyRanking = document.getElementById("tbody-ranking-fornecedores");
  if (tbodyRanking) {
    const ranking = calcRankingFornecedores();
    tbodyRanking.innerHTML = ranking.slice(0, 15).map(f => '<tr>' +
      '<td><strong>' + escapeHtml(f.nome) + '</strong></td>' +
      '<td>' + f.qtdItens + '</td>' +
      '<td>' + f.pctMenor.toFixed(0) + '%</td>' +
      '<td>' + formatDate(f.lastDate) + '</td>' +
    '</tr>').join("") || '<tr><td colspan="4" class="text-muted">Sem dados.</td></tr>';
  }

  // Alertas
  const elAlertas = document.getElementById("intel-alertas");
  if (elAlertas) {
    const alertas = detectOportunidades();
    if (alertas.length === 0) {
      elAlertas.innerHTML = '<p class="text-muted">Nenhum alerta no momento.</p>';
    } else {
      const icons = { "margem-alta": "\uD83D\uDCB0", "risco": "\u26A0\uFE0F", "desatualizado": "\uD83D\uDD50" };
      elAlertas.innerHTML = alertas.slice(0, 20).map(a =>
        '<div style="padding:0.3rem 0;border-bottom:1px solid #eee;">' + (icons[a.tipo] || "\u2022") + ' <strong>' + escapeHtml(a.item) + '</strong>: ' + escapeHtml(a.msg) + '</div>'
      ).join("");
    }
  }
}

// ===== COTAÇÃO INTELIGENTE (Story 4.29) =====

function calcPrecoSugerido(itemNome) {
  // Find matching mestre
  const mestreMatch = findBestMestre(itemNome);
  if (!mestreMatch) return null;

  // Find all banco items linked to this mestre
  const linked = bancoPrecos.itens.filter(i => i.mesterId === mestreMatch.mestre.id);
  if (linked.length === 0) return null;

  // Get latest cost from any linked item
  let meuCusto = 0;
  let latestDate = "";
  linked.forEach(item => {
    if (item.custoBase > 0 && (item.ultimaCotacao || "") >= latestDate) {
      meuCusto = item.custoBase;
      latestDate = item.ultimaCotacao || "";
    }
  });

  // Get competitor prices
  const concPrecos = [];
  linked.forEach(item => {
    (item.concorrentes || []).forEach(c => { if (c.preco > 0) concPrecos.push(c.preco); });
  });
  const menorConc = concPrecos.length > 0 ? Math.min(...concPrecos) : null;

  // Get market average from all supplier prices
  const allPrecos = [];
  linked.forEach(item => {
    (item.custosFornecedor || []).forEach(c => { if (c.preco > 0) allPrecos.push(c.preco); });
  });
  const mediaMercado = allPrecos.length > 0 ? allPrecos.reduce((s, p) => s + p, 0) / allPrecos.length : meuCusto;

  // Calculate suggested price
  const margemMinima = 0.08;
  const precoMinimo = meuCusto > 0 ? meuCusto * (1 + margemMinima) : mediaMercado;
  const precoCompetitivo = menorConc ? menorConc * 0.97 : mediaMercado;
  const sugerido = Math.max(precoMinimo, Math.min(precoCompetitivo, mediaMercado * 1.1));

  // Best marca from banco
  const marca = linked.find(i => i.marca)?.marca || "";

  // Confidence
  const confianca = mestreMatch.score >= 0.8 ? "alta" : mestreMatch.score >= 0.5 ? "media" : "baixa";

  return {
    sugerido: sugerido > 0 ? sugerido : null,
    meuCusto, menorConc, mediaMercado, marca, confianca,
    mestreId: mestreMatch.mestre.id,
    margemReal: meuCusto > 0 ? ((sugerido - meuCusto) / meuCusto) : 0
  };
}

// Auto-fill pre-orcamento from Banco Inteligente (Story 4.29)
window.autoPreencherPreOrcamento = function() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens) return;

  let preenchidos = 0, semMatch = 0;

  pre.itens.forEach(function(item) {
    const sugestao = calcPrecoSugerido(item.nome);
    if (sugestao && sugestao.sugerido) {
      if (!item.precoUnitario || item.precoUnitario === 0) {
        item.precoUnitario = parseFloat(sugestao.sugerido.toFixed(2));
      }
      if (!item.marca && sugestao.marca) {
        item.marca = sugestao.marca;
      }
      if (sugestao.meuCusto > 0) {
        item.custoBase = sugestao.meuCusto;
      }
      item._autoConfianca = sugestao.confianca;
      item._mestreId = sugestao.mestreId;
      preenchidos++;
    } else {
      semMatch++;
    }
  });

  savePreOrcamentos();
  renderPreOrcamentoItens();
  showToast("Auto-preenchido: " + preenchidos + " itens ok, " + semMatch + " sem match no banco.");
};

// ===== IMPORTAÇÃO B2B (Story 4.30) =====
const B2B_URLS_KEY = "caixaescolar.b2b-urls";
let b2bParsedItems = [];

function loadB2bUrls() {
  try { return JSON.parse(localStorage.getItem(B2B_URLS_KEY) || "[]"); } catch(_) { return []; }
}

function saveB2bUrl(url, fornecedor) {
  const urls = loadB2bUrls();
  const exists = urls.find(u => u.url === url);
  if (exists) {
    exists.fornecedor = fornecedor;
    exists.lastUsed = new Date().toISOString().slice(0, 10);
  } else {
    urls.unshift({ url, fornecedor, lastUsed: new Date().toISOString().slice(0, 10) });
  }
  localStorage.setItem(B2B_URLS_KEY, JSON.stringify(urls.slice(0, 10)));
}

function renderB2bUrlsRecentes() {
  const urls = loadB2bUrls();
  const container = document.getElementById("b2b-urls-recentes");
  const lista = document.getElementById("b2b-urls-lista");
  if (!container || !lista) return;
  if (urls.length === 0) { container.style.display = "none"; return; }
  container.style.display = "block";
  lista.innerHTML = urls.slice(0, 5).map(u =>
    `<a href="#" onclick="b2bUsarUrl('${escapeHtml(u.url)}','${escapeHtml(u.fornecedor)}');return false;" style="display:block;padding:2px 0;">${escapeHtml(u.fornecedor || u.url)} <span class="text-muted">(${u.lastUsed})</span></a>`
  ).join("");
}

window.b2bUsarUrl = function(url, fornecedor) {
  const urlInput = document.getElementById("b2b-url");
  const fornInput = document.getElementById("b2b-fornecedor");
  if (urlInput) urlInput.value = url;
  if (fornInput) fornInput.value = fornecedor;
};

window.openB2bModal = function() {
  const modal = document.getElementById("modal-b2b");
  if (modal) {
    modal.style.display = "flex";
    renderB2bUrlsRecentes();
    b2bParsedItems = [];
    const preview = document.getElementById("b2b-preview");
    const btnImportar = document.getElementById("btn-b2b-importar");
    const status = document.getElementById("b2b-status");
    if (preview) preview.style.display = "none";
    if (btnImportar) btnImportar.style.display = "none";
    if (status) status.textContent = "";
  }
};

window.closeB2bModal = function() {
  const modal = document.getElementById("modal-b2b");
  if (modal) modal.style.display = "none";
};

window.b2bBuscar = async function() {
  const url = (document.getElementById("b2b-url")?.value || "").trim();
  const fornecedor = (document.getElementById("b2b-fornecedor")?.value || "").trim();
  const status = document.getElementById("b2b-status");
  const preview = document.getElementById("b2b-preview");
  const btnImportar = document.getElementById("btn-b2b-importar");
  const btnBuscar = document.getElementById("btn-b2b-buscar");

  if (!url) { if (status) status.textContent = "Informe a URL."; return; }
  if (!fornecedor) { if (status) status.textContent = "Informe o fornecedor."; return; }

  if (btnBuscar) { btnBuscar.disabled = true; btnBuscar.textContent = "Buscando..."; }
  if (status) status.textContent = "Acessando site...";
  if (preview) preview.style.display = "none";
  if (btnImportar) btnImportar.style.display = "none";

  try {
    const scrapeRes = await fetch("/api/b2b-scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) throw new Error(scrapeData.error || "Falha ao acessar site");
    if (!scrapeData.text || scrapeData.text.length < 50) throw new Error("Página sem conteúdo suficiente");

    if (status) status.textContent = "Extraindo produtos com IA...";

    const aiRes = await fetch("/.netlify/functions/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: scrapeData.text.slice(0, 12000),
        formato: "b2b-site",
        fornecedor: fornecedor,
        contexto: "Texto extraído de site de fornecedor B2B. Extraia todos os produtos com preços encontrados.",
      }),
    });
    const aiData = await aiRes.json();
    if (!aiRes.ok) throw new Error(aiData.error || "Falha na extração IA");

    let items = [];
    if (aiData.itens && Array.isArray(aiData.itens)) {
      items = aiData.itens;
    } else if (Array.isArray(aiData)) {
      items = aiData;
    } else if (aiData.result) {
      try { items = JSON.parse(aiData.result); } catch(_) {}
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Nenhum produto encontrado nesta página. Tente outra URL com lista de produtos e preços.");
    }

    b2bParsedItems = items.map((item, idx) => ({
      nome: item.nome || "",
      preco: typeof item.preco === "string" ? parseFloat(item.preco.replace(/[^\d,.-]/g, "").replace(",", ".")) : (item.preco || 0),
      unidade: item.unidade || "UN",
      marca: item.marca || "",
      selected: true,
      _idx: idx,
    }));

    renderB2bPreview();
    saveB2bUrl(url, fornecedor);
    if (status) status.textContent = `${b2bParsedItems.length} produto(s) encontrado(s).`;

  } catch (err) {
    if (status) status.textContent = "Erro: " + err.message;
    console.error("[B2B]", err);
  } finally {
    if (btnBuscar) { btnBuscar.disabled = false; btnBuscar.textContent = "Buscar Produtos"; }
  }
};

function renderB2bPreview() {
  const preview = document.getElementById("b2b-preview");
  const tbody = document.getElementById("tbody-b2b-preview");
  const btnImportar = document.getElementById("btn-b2b-importar");
  if (!preview || !tbody) return;

  preview.style.display = "block";
  if (btnImportar) btnImportar.style.display = "inline-block";

  tbody.innerHTML = b2bParsedItems.map((item, idx) =>
    `<tr>
      <td><input type="checkbox" class="b2b-check" data-idx="${idx}" ${item.selected ? "checked" : ""} /></td>
      <td>${escapeHtml(item.nome || "")}</td>
      <td class="nowrap">${item.preco > 0 ? brl.format(item.preco) : "—"}</td>
      <td>${escapeHtml(item.unidade || "UN")}</td>
      <td>${escapeHtml(item.marca || "—")}</td>
    </tr>`
  ).join("");

  tbody.querySelectorAll(".b2b-check").forEach(cb => {
    cb.addEventListener("change", () => {
      b2bParsedItems[parseInt(cb.dataset.idx)].selected = cb.checked;
      updateB2bStats();
    });
  });

  updateB2bStats();
}

function updateB2bStats() {
  const stats = document.getElementById("b2b-preview-stats");
  const selected = b2bParsedItems.filter(i => i.selected);
  if (stats) stats.textContent = `${selected.length} de ${b2bParsedItems.length} selecionados`;
}

window.b2bImportar = function() {
  const selected = b2bParsedItems.filter(i => i.selected && i.nome);
  if (selected.length === 0) { showToast("Nenhum item selecionado."); return; }

  const fornecedor = (document.getElementById("b2b-fornecedor")?.value || "").trim();
  const url = (document.getElementById("b2b-url")?.value || "").trim();

  const arquivo = registrarArquivo(url, fornecedor, "b2b-site", selected.length);

  let novos = 0, atualizados = 0;

  selected.forEach(item => {
    const nomeNorm = normalizedText(item.nome);
    const existing = bancoPrecos.itens.find(bi => normalizedText(bi.item) === nomeNorm);

    if (existing) {
      if (!existing.custosFornecedor) existing.custosFornecedor = [];
      existing.custosFornecedor.push({
        fornecedor, preco: item.preco, data: new Date().toISOString().slice(0, 10),
        arquivoId: arquivo.id, descricaoOriginal: item.nome, confianca: 0.70,
      });
      if (item.preco > 0) existing.custoBase = item.preco;
      existing.ultimaCotacao = new Date().toISOString().slice(0, 10);
      existing.fonte = fornecedor;
      atualizados++;
    } else {
      const newItem = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        marca: item.marca || "",
        grupo: "B2B",
        unidade: item.unidade || "Unidade",
        custoBase: item.preco || 0,
        margemPadrao: 0.30,
        precoReferencia: item.preco ? item.preco * 1.30 : 0,
        ultimaCotacao: new Date().toISOString().slice(0, 10),
        fonte: fornecedor,
        propostas: [],
        concorrentes: [],
        custosFornecedor: [{
          fornecedor, preco: item.preco, data: new Date().toISOString().slice(0, 10),
          arquivoId: arquivo.id, descricaoOriginal: item.nome, confianca: 0.70,
        }],
      };

      const mestreMatch = findBestMestre(item.nome);
      if (mestreMatch && mestreMatch.score >= 0.5) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(item.nome, mestreMatch.mestre.id);
      } else {
        const mestre = createMestreFromItem(newItem);
        newItem.mesterId = mestre.id;
      }

      bancoPrecos.itens.push(newItem);
      novos++;
    }
  });

  saveMestres();
  saveBancoLocal();
  renderBanco();
  closeB2bModal();
  showToast(`B2B: ${novos} novo(s), ${atualizados} atualizado(s) de ${fornecedor}`);
};

function renderAnaliseCompetitiva(preOrcamento) {
  if (!preOrcamento || !preOrcamento.itens || preOrcamento.itens.length === 0) return "";

  let valorTotal = 0, somaMargens = 0, countMargens = 0;
  let riscos = 0;

  preOrcamento.itens.forEach(function(item) {
    const valor = (item.precoUnitario || 0) * (item.quantidade || 0);
    valorTotal += valor;
    if (item.custoUnitario > 0 && item.precoUnitario > 0) {
      somaMargens += (item.precoUnitario - item.custoUnitario) / item.custoUnitario;
      countMargens++;
    }
    // Check if competitor is cheaper
    const sugestao = calcPrecoSugerido(item.nome);
    if (sugestao && sugestao.menorConc && item.precoUnitario > sugestao.menorConc) riscos++;
  });

  const margemMedia = countMargens > 0 ? (somaMargens / countMargens * 100).toFixed(1) : "\u2014";
  const margemClass = parseFloat(margemMedia) >= 15 ? "color:#27ae60" : parseFloat(margemMedia) >= 5 ? "color:#f39c12" : "color:#e74c3c";

  return '<div style="background:#f8f9fa;padding:0.75rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;">' +
    '<strong>Análise Competitiva</strong>' +
    '<div style="display:flex;gap:1.5rem;margin-top:0.5rem;">' +
      '<span>Valor: <strong>' + brl.format(valorTotal) + '</strong></span>' +
      '<span>Margem média: <strong style="' + margemClass + '">' + margemMedia + '%</strong></span>' +
      '<span>Itens de risco: <strong style="color:' + (riscos > 0 ? '#e74c3c' : '#27ae60') + '">' + riscos + '</strong></span>' +
    '</div>' +
  '</div>';
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
const NF_CONFIG_STORAGE_KEY = "nexedu.config.notas-fiscais";
const BANK_ACCOUNTS_STORAGE_KEY = "nexedu.config.contas-bancarias";
const BANK_API_CONFIG_STORAGE_KEY = "nexedu.config.bank-api";
const BANK_API_SECRET_FIELDS = [
  {
    inputId: "bank-api-client-secret",
    markerKey: "clientSecretConfigured",
    label: "Client Secret",
    placeholder: "Segredo mantido no servidor"
  },
  {
    inputId: "bank-api-key",
    markerKey: "apiKeyConfigured",
    label: "API Key / Token",
    placeholder: "Token mantido no servidor"
  },
  {
    inputId: "bank-api-webhook-secret",
    markerKey: "webhookSecretConfigured",
    label: "Webhook Secret",
    placeholder: "Chave mantida no servidor"
  }
];
let editingBankAccountId = null;

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
  loadNotaFiscalConfig();
  renderBankAccounts();
  refreshContaBancariaOptions();
  refreshBankApiContaOptions();
  loadBankApiConfig();
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

function getNotaFiscalConfig() {
  try {
    return JSON.parse(localStorage.getItem(NF_CONFIG_STORAGE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function getBankAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function setBankAccounts(accounts) {
  localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function readBankApiConfigRaw() {
  try {
    return JSON.parse(localStorage.getItem(BANK_API_CONFIG_STORAGE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function normalizeBankApiConfig(raw = {}) {
  return {
    provider: raw.provider || "",
    ambiente: raw.ambiente || "sandbox",
    baseUrl: raw.baseUrl || "",
    clientId: raw.clientId || "",
    webhookUrl: raw.webhookUrl || "",
    carteira: raw.carteira || "",
    contaId: raw.contaId || "",
    ativo: Boolean(raw.ativo),
    boleto: raw.boleto !== false,
    pix: Boolean(raw.pix),
    conciliacao: Boolean(raw.conciliacao),
    clientSecretConfigured: Boolean(raw.clientSecretConfigured || raw.secretPresence?.clientSecret || raw.clientSecret),
    apiKeyConfigured: Boolean(raw.apiKeyConfigured || raw.secretPresence?.apiKey || raw.apiKey),
    webhookSecretConfigured: Boolean(raw.webhookSecretConfigured || raw.secretPresence?.webhookSecret || raw.webhookSecret),
    updatedAt: raw.updatedAt || raw.updated_at || ""
  };
}

function getBankApiConfig() {
  const raw = readBankApiConfigRaw();
  const normalized = normalizeBankApiConfig(raw);
  if (Object.keys(raw).length > 0 && JSON.stringify(raw) !== JSON.stringify(normalized)) {
    localStorage.setItem(BANK_API_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function collectBankApiConfigFromForm({ includeSecrets = true } = {}) {
  const current = getBankApiConfig();
  const clientSecret = document.getElementById("bank-api-client-secret")?.value.trim() || "";
  const apiKey = document.getElementById("bank-api-key")?.value.trim() || "";
  const webhookSecret = document.getElementById("bank-api-webhook-secret")?.value.trim() || "";
  const config = {
    provider: document.getElementById("bank-api-provider")?.value || "",
    ambiente: document.getElementById("bank-api-ambiente")?.value || "sandbox",
    baseUrl: document.getElementById("bank-api-base-url")?.value.trim() || "",
    clientId: document.getElementById("bank-api-client-id")?.value.trim() || "",
    webhookUrl: document.getElementById("bank-api-webhook-url")?.value.trim() || "",
    carteira: document.getElementById("bank-api-carteira")?.value.trim() || "",
    contaId: document.getElementById("bank-api-conta-id")?.value || "",
    ativo: Boolean(document.getElementById("bank-api-ativo")?.checked),
    boleto: Boolean(document.getElementById("bank-api-boleto")?.checked),
    pix: Boolean(document.getElementById("bank-api-pix")?.checked),
    conciliacao: Boolean(document.getElementById("bank-api-conciliacao")?.checked),
    clientSecretConfigured: Boolean(clientSecret) || Boolean(current.clientSecretConfigured),
    apiKeyConfigured: Boolean(apiKey) || Boolean(current.apiKeyConfigured),
    webhookSecretConfigured: Boolean(webhookSecret) || Boolean(current.webhookSecretConfigured)
  };

  if (includeSecrets) {
    config.clientSecret = clientSecret;
    config.apiKey = apiKey;
    config.webhookSecret = webhookSecret;
  }

  return config;
}

function describeBankApiSecretPresence(config = {}) {
  const configured = BANK_API_SECRET_FIELDS
    .filter((field) => Boolean(config[field.markerKey]))
    .map((field) => field.label);
  if (configured.length === 0) {
    return "Nenhum segredo esta marcado como configurado no servidor.";
  }
  return `Segredos marcados no servidor: ${configured.join(", ")}.`;
}

function syncBankApiSecretInputs(config = {}, { clearValues = true } = {}) {
  BANK_API_SECRET_FIELDS.forEach(({ inputId, markerKey, label, placeholder }) => {
    const node = document.getElementById(inputId);
    if (!node) return;
    if (clearValues) node.value = "";
    node.placeholder = config[markerKey] ? `${label} configurado no servidor` : placeholder;
    node.title = config[markerKey]
      ? `${label} nao e salvo neste navegador.`
      : `${label} deve ser informado apenas para testes e provisionamento no servidor.`;
  });
}

function renderBankApiStatus(message, tone = "") {
  const box = document.getElementById("bank-api-status");
  if (!box) return;
  box.textContent = message || "";
  box.classList.remove("is-success", "is-warning", "is-error", "is-info");
  if (tone) box.classList.add(tone);
}

function loadNotaFiscalConfig() {
  const config = getNotaFiscalConfig();
  const setValue = (id, value, fallback = "") => {
    const node = document.getElementById(id);
    if (node) node.value = value ?? fallback;
  };
  const setChecked = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.checked = Boolean(value);
  };

  setValue("nf-ambiente", config.ambiente || "homologacao");
  setValue("nf-serie", config.serie || "");
  setValue("nf-proximo-numero", config.proximoNumero || "");
  setValue("nf-natureza-operacao", config.naturezaOperacao || "");
  setValue("nf-cfop", config.cfop || "");
  setValue("nf-regime", config.regime || "simples");
  setValue("nf-prazo-emissao", config.prazoEmissaoHoras || "");
  setValue("nf-observacoes", config.observacoes || "");
  setValue("nf-conta-bancaria-padrao", config.contaBancariaPadraoId || "");
  setChecked("nf-destacar-pix", config.destacarPix);
  setChecked("nf-gerar-conta-receber", config.gerarContaReceber !== false);
  setChecked("nf-bloquear-sem-estoque", config.bloquearSemEstoque);
}

function saveNotaFiscalConfig() {
  const config = {
    ambiente: document.getElementById("nf-ambiente")?.value || "homologacao",
    serie: document.getElementById("nf-serie")?.value || "",
    proximoNumero: document.getElementById("nf-proximo-numero")?.value || "",
    naturezaOperacao: document.getElementById("nf-natureza-operacao")?.value || "",
    cfop: document.getElementById("nf-cfop")?.value || "",
    regime: document.getElementById("nf-regime")?.value || "simples",
    prazoEmissaoHoras: document.getElementById("nf-prazo-emissao")?.value || "",
    observacoes: document.getElementById("nf-observacoes")?.value || "",
    contaBancariaPadraoId: document.getElementById("nf-conta-bancaria-padrao")?.value || "",
    destacarPix: Boolean(document.getElementById("nf-destacar-pix")?.checked),
    gerarContaReceber: Boolean(document.getElementById("nf-gerar-conta-receber")?.checked),
    bloquearSemEstoque: Boolean(document.getElementById("nf-bloquear-sem-estoque")?.checked),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(NF_CONFIG_STORAGE_KEY, JSON.stringify(config));
  if (typeof showToast === "function") showToast("Configuracoes fiscais salvas.");
}

function buildObservacaoBancaria(contrato) {
  const contaId = getNotaFiscalConfig().contaBancariaPadraoId;
  const accounts = getBankAccounts();
  const conta = (contaId && accounts.find(a => a.id === contaId)) || accounts.find(a => a.padrao) || accounts[0];
  if (!conta) return "";
  const parts = [];
  parts.push("DADOS PARA PAGAMENTO:");
  if (conta.titular) parts.push("Titular: " + conta.titular);
  if (conta.documento) parts.push("CNPJ/CPF: " + conta.documento);
  if (conta.banco) parts.push("Banco: " + conta.banco + (conta.codigo ? " (" + conta.codigo + ")" : ""));
  if (conta.agencia) parts.push("Agencia: " + conta.agencia);
  if (conta.conta) parts.push("Conta: " + conta.conta + (conta.tipo ? " (" + conta.tipo + ")" : ""));
  if (conta.pix) parts.push("Chave PIX: " + conta.pix);
  return parts.join("\n");
}

function autoPreencherObservacaoNF() {
  const textarea = document.getElementById("nf-observacoes");
  if (!textarea) return;
  const obs = buildObservacaoBancaria();
  if (!obs) {
    if (typeof showToast === "function") showToast("Cadastre uma conta bancaria primeiro.", 3000);
    return;
  }
  textarea.value = obs;
  if (typeof showToast === "function") showToast("Observacao preenchida com dados bancarios e PIX.");
}

function refreshContaBancariaOptions() {
  const select = document.getElementById("nf-conta-bancaria-padrao");
  if (!select) return;
  const current = getNotaFiscalConfig().contaBancariaPadraoId || "";
  const accounts = getBankAccounts();
  select.innerHTML = ['<option value="">Selecione...</option>']
    .concat(accounts.map((account) => {
      const name = [account.apelido, account.banco].filter(Boolean).join(" - ");
      return `<option value="${account.id}">${name || "Conta sem nome"}</option>`;
    }))
    .join("");
  select.value = accounts.some((account) => account.id === current) ? current : "";
}

function refreshBankApiContaOptions() {
  const select = document.getElementById("bank-api-conta-id");
  if (!select) return;
  const current = getBankApiConfig().contaId || "";
  const accounts = getBankAccounts();
  select.innerHTML = ['<option value="">Selecione...</option>']
    .concat(accounts.map((account) => {
      const name = [account.apelido, account.banco].filter(Boolean).join(" - ");
      return `<option value="${account.id}">${name || "Conta sem nome"}</option>`;
    }))
    .join("");
  select.value = accounts.some((account) => account.id === current) ? current : "";
}

function loadBankApiConfig() {
  const config = getBankApiConfig();
  const setValue = (id, value, fallback = "") => {
    const node = document.getElementById(id);
    if (node) node.value = value ?? fallback;
  };
  const setChecked = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.checked = Boolean(value);
  };

  setValue("bank-api-provider", config.provider || "");
  setValue("bank-api-ambiente", config.ambiente || "sandbox");
  setValue("bank-api-base-url", config.baseUrl || "");
  setValue("bank-api-client-id", config.clientId || "");
  setValue("bank-api-webhook-url", config.webhookUrl || "");
  setValue("bank-api-carteira", config.carteira || "");
  setValue("bank-api-conta-id", config.contaId || "");
  setChecked("bank-api-ativo", config.ativo);
  setChecked("bank-api-boleto", config.boleto !== false);
  setChecked("bank-api-pix", config.pix);
  setChecked("bank-api-conciliacao", config.conciliacao);
  syncBankApiSecretInputs(config);
  renderBankApiStatus(
    `Configuracao carregada. ${describeBankApiSecretPresence(config)} Os segredos reais do provider devem ficar no servidor, nao no navegador.`,
    "is-info"
  );
}

function saveBankApiConfig() {
  const current = getBankApiConfig();
  const config = {
    ...current,
    ...collectBankApiConfigFromForm({ includeSecrets: false }),
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(BANK_API_CONFIG_STORAGE_KEY, JSON.stringify(normalizeBankApiConfig(config)));
  syncBankApiSecretInputs(config, { clearValues: false });
  renderBankApiStatus(
    `Configuracao salva sem segredos no navegador. ${describeBankApiSecretPresence(config)} Os segredos reais do provider devem ficar no servidor.`,
    "is-info"
  );
  if (typeof showToast === "function") showToast("Configuracao de API bancaria salva.");
}

async function testBankApiConfig() {
  const config = collectBankApiConfigFromForm();
  const hasAuth = Boolean(config.apiKey || (config.clientId && config.clientSecret));
  renderBankApiStatus(
    hasAuth
      ? `Testando conexao com as credenciais digitadas agora. ${describeBankApiSecretPresence(config)}`
      : `Testando apenas a estrutura da integracao. ${describeBankApiSecretPresence(config)} Os segredos do provider precisam ser informados no servidor para um teste completo.`,
    "is-warning"
  );

  try {
    const resp = await fetch("/api/gdp-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bank-api-diagnose",
        config
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const diagnostic = data.diagnostic || {};
    const probe = diagnostic.probe || {};
    const readyLabel = diagnostic.ready ? "pronta" : "parcial";
    const probeLabel = probe.attempted
      ? (probe.reachable ? `Endpoint acessivel (HTTP ${probe.status || "ok"})` : `Endpoint nao validado (${probe.error || "sem resposta"})`)
      : "Sem teste remoto do endpoint";
    const summary = [
      `Integracao ${readyLabel}.`,
      diagnostic.provider ? `Provider: ${diagnostic.provider}.` : "",
      diagnostic.baseUrl ? `Base URL: ${diagnostic.baseUrl}.` : "",
      probeLabel + ".",
      diagnostic.nextSteps?.[0] ? `Proximo passo: ${diagnostic.nextSteps[0]}.` : "",
      diagnostic.nextSteps?.[1] ? `Seguranca: ${diagnostic.nextSteps[1]}.` : ""
    ].filter(Boolean).join(" ");

    renderBankApiStatus(summary, diagnostic.ready ? "is-success" : "is-warning");
    if (typeof showToast === "function") showToast(diagnostic.ready ? "API bancaria validada." : "API bancaria validada com pendencias.");
  } catch (err) {
    renderBankApiStatus(`Falha ao testar API bancaria: ${err.message}`, "is-error");
    if (typeof showToast === "function") showToast(`Falha no teste da API bancaria: ${err.message}`, 5000);
  }
}

async function provisionBankWebhook() {
  const config = collectBankApiConfigFromForm();
  renderBankApiStatus("Provisionando webhook bancario no provider...", "is-warning");

  try {
    const resp = await fetch("/api/gdp-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bank-webhook-sync",
        provider: config.provider || "asaas",
        ambiente: config.ambiente || "sandbox",
        config
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const webhook = data.webhook || {};
    const actionLabel = data.provisioned ? "Webhook provisionado" : "Webhook ja existente";
    const eventsLabel = Array.isArray(data.requiredEvents) ? data.requiredEvents.join(", ") : "";
    const summary = [
      `${actionLabel} para ${String(data.provider || "").toUpperCase()}.`,
      data.webhookUrl ? `URL: ${data.webhookUrl}.` : "",
      webhook.id ? `ID: ${webhook.id}.` : "",
      eventsLabel ? `Eventos: ${eventsLabel}.` : "",
      data.authTokenConfigured ? "Token de autenticacao configurado no servidor." : "Sem token de autenticacao configurado no servidor."
    ].filter(Boolean).join(" ");

    renderBankApiStatus(summary, "is-success");
    if (typeof showToast === "function") showToast(data.provisioned ? "Webhook bancario provisionado." : "Webhook bancario ja configurado.");
  } catch (err) {
    renderBankApiStatus(`Falha ao provisionar webhook bancario: ${err.message}`, "is-error");
    if (typeof showToast === "function") showToast(`Falha no webhook bancario: ${err.message}`, 5000);
  }
}

function clearBankAccountForm() {
  editingBankAccountId = null;
  [
    "bank-apelido",
    "bank-banco",
    "bank-codigo",
    "bank-agencia",
    "bank-conta",
    "bank-titular",
    "bank-documento",
    "bank-pix"
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.value = "";
  });
  const tipo = document.getElementById("bank-tipo");
  if (tipo) tipo.value = "corrente";
  const uso = document.getElementById("bank-uso");
  if (uso) uso.value = "cobranca";
  const padrao = document.getElementById("bank-padrao");
  if (padrao) padrao.checked = false;
  const ativa = document.getElementById("bank-ativa");
  if (ativa) ativa.checked = true;
}

function saveBankAccount() {
  const apelido = document.getElementById("bank-apelido")?.value.trim() || "";
  const banco = document.getElementById("bank-banco")?.value.trim() || "";
  const conta = document.getElementById("bank-conta")?.value.trim() || "";
  if (!apelido || !banco || !conta) {
    alert("Preencha pelo menos apelido, banco e conta.");
    return;
  }

  const accounts = getBankAccounts();
  const next = {
    id: editingBankAccountId || `bank_${Date.now()}`,
    apelido,
    banco,
    codigo: document.getElementById("bank-codigo")?.value.trim() || "",
    agencia: document.getElementById("bank-agencia")?.value.trim() || "",
    conta,
    tipo: document.getElementById("bank-tipo")?.value || "corrente",
    titular: document.getElementById("bank-titular")?.value.trim() || "",
    documento: document.getElementById("bank-documento")?.value.trim() || "",
    pix: document.getElementById("bank-pix")?.value.trim() || "",
    uso: document.getElementById("bank-uso")?.value || "cobranca",
    padrao: Boolean(document.getElementById("bank-padrao")?.checked),
    ativa: Boolean(document.getElementById("bank-ativa")?.checked),
    updatedAt: new Date().toISOString()
  };

  const updated = accounts
    .filter((account) => account.id !== next.id)
    .map((account) => (next.padrao ? { ...account, padrao: false } : account));
  updated.push(next);
  setBankAccounts(updated);

  if (next.padrao) {
    const nfConfig = getNotaFiscalConfig();
    localStorage.setItem(NF_CONFIG_STORAGE_KEY, JSON.stringify({
      ...nfConfig,
      contaBancariaPadraoId: next.id,
      updatedAt: new Date().toISOString()
    }));
  }

  clearBankAccountForm();
  renderBankAccounts();
  refreshContaBancariaOptions();
  refreshBankApiContaOptions();
  loadNotaFiscalConfig();
  if (typeof showToast === "function") showToast("Conta bancaria salva.");
}

function renderBankAccounts() {
  const list = document.getElementById("bank-accounts-list");
  const empty = document.getElementById("bank-accounts-empty");
  const badge = document.getElementById("bank-count-badge");
  if (!list || !empty || !badge) return;

  const accounts = getBankAccounts();
  badge.textContent = `${accounts.length} conta${accounts.length === 1 ? "" : "s"}`;
  list.innerHTML = "";

  if (!accounts.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  accounts
    .sort((a, b) => Number(b.padrao) - Number(a.padrao))
    .forEach((account) => {
      const card = document.createElement("article");
      card.className = "config-account-card";
      card.innerHTML = `
        <div class="config-account-main">
          <div>
            <strong>${account.apelido || "Conta sem nome"}</strong>
            <p>${account.banco || "-"}${account.codigo ? ` (${account.codigo})` : ""}</p>
          </div>
          <div class="config-account-badges">
            ${account.padrao ? '<span class="badge badge-aprovado">Padrao</span>' : ""}
            <span class="badge ${account.ativa ? "badge-processando" : "badge-vencido"}">${account.ativa ? "Ativa" : "Inativa"}</span>
          </div>
        </div>
        <div class="config-account-meta">
          <span>Agencia: ${account.agencia || "-"}</span>
          <span>Conta: ${account.conta || "-"}</span>
          <span>Uso: ${account.uso || "-"}</span>
          <span>PIX: ${account.pix || "-"}</span>
        </div>
        <div class="config-account-actions">
          <button class="btn btn-sm" onclick="editBankAccount('${account.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="removeBankAccount('${account.id}')">Excluir</button>
        </div>
      `;
      list.appendChild(card);
    });
}

window.editBankAccount = function editBankAccount(id) {
  const account = getBankAccounts().find((item) => item.id === id);
  if (!account) return;
  editingBankAccountId = id;
  const setValue = (fieldId, value, fallback = "") => {
    const node = document.getElementById(fieldId);
    if (node) node.value = value ?? fallback;
  };
  setValue("bank-apelido", account.apelido);
  setValue("bank-banco", account.banco);
  setValue("bank-codigo", account.codigo);
  setValue("bank-agencia", account.agencia);
  setValue("bank-conta", account.conta);
  setValue("bank-tipo", account.tipo, "corrente");
  setValue("bank-titular", account.titular);
  setValue("bank-documento", account.documento);
  setValue("bank-pix", account.pix);
  setValue("bank-uso", account.uso, "cobranca");
  const padrao = document.getElementById("bank-padrao");
  if (padrao) padrao.checked = Boolean(account.padrao);
  const ativa = document.getElementById("bank-ativa");
  if (ativa) ativa.checked = Boolean(account.ativa);
};

window.removeBankAccount = function removeBankAccount(id) {
  const filtered = getBankAccounts().filter((item) => item.id !== id);
  setBankAccounts(filtered);

  const nfConfig = getNotaFiscalConfig();
  if (nfConfig.contaBancariaPadraoId === id) {
    localStorage.setItem(NF_CONFIG_STORAGE_KEY, JSON.stringify({
      ...nfConfig,
      contaBancariaPadraoId: "",
      updatedAt: new Date().toISOString()
    }));
  }

  if (editingBankAccountId === id) clearBankAccountForm();
  const bankApiConfig = getBankApiConfig();
  if (bankApiConfig.contaId === id) {
    localStorage.setItem(BANK_API_CONFIG_STORAGE_KEY, JSON.stringify({
      ...bankApiConfig,
      contaId: "",
      updatedAt: new Date().toISOString()
    }));
  }
  renderBankAccounts();
  refreshContaBancariaOptions();
  refreshBankApiContaOptions();
  loadNotaFiscalConfig();
  loadBankApiConfig();
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
  const btnSalvarNf = document.getElementById("btn-salvar-notas-fiscais");
  if (btnSalvarNf) btnSalvarNf.addEventListener("click", saveNotaFiscalConfig);
  const btnSalvarConta = document.getElementById("btn-salvar-conta-bancaria");
  if (btnSalvarConta) btnSalvarConta.addEventListener("click", saveBankAccount);
  const btnLimparConta = document.getElementById("btn-limpar-conta-bancaria");
  if (btnLimparConta) btnLimparConta.addEventListener("click", clearBankAccountForm);
  const btnSalvarBankApi = document.getElementById("btn-salvar-bank-api");
  if (btnSalvarBankApi) btnSalvarBankApi.addEventListener("click", saveBankApiConfig);
  const btnTestarBankApi = document.getElementById("btn-testar-bank-api");
  if (btnTestarBankApi) btnTestarBankApi.addEventListener("click", testBankApiConfig);
  const btnProvisionarBankWebhook = document.getElementById("btn-provisionar-bank-webhook");
  if (btnProvisionarBankWebhook) btnProvisionarBankWebhook.addEventListener("click", provisionBankWebhook);

  // Tab navigation (Intel. Preços sub-tabs)
  document.querySelectorAll("#tabs-intel-precos .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Filtros orçamentos
  if (el.filtroSre) el.filtroSre.addEventListener("change", renderOrcamentos);
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

  // Itens Mestres (Story 4.26)
  const btnMestres = document.getElementById("btn-itens-mestres");
  if (btnMestres) btnMestres.addEventListener("click", openMestresModal);
  const btnMestresFechar = document.getElementById("btn-mestres-fechar");
  if (btnMestresFechar) btnMestresFechar.addEventListener("click", closeMestresModal);
  const filtroMestres = document.getElementById("filtro-mestres");
  if (filtroMestres) filtroMestres.addEventListener("input", renderMestresModal);
  const modalMestres = document.getElementById("modal-mestres");
  if (modalMestres) modalMestres.addEventListener("click", (e) => {
    if (e.target === modalMestres) closeMestresModal();
  });

  // Timeline modal (Story 4.27)
  const btnTimelineFechar = document.getElementById("btn-timeline-fechar");
  if (btnTimelineFechar) btnTimelineFechar.addEventListener("click", closeTimeline);
  const modalTimeline = document.getElementById("modal-timeline");
  if (modalTimeline) modalTimeline.addEventListener("click", (e) => {
    if (e.target === modalTimeline) closeTimeline();
  });

  // Banco intelligence panel toggle (Story 4.28)
  const bancoIntelToggle = document.getElementById("banco-intel-toggle");
  if (bancoIntelToggle) {
    bancoIntelToggle.addEventListener("click", () => {
      const body = document.getElementById("banco-intel-body");
      const chevron = document.getElementById("banco-intel-chevron");
      if (body) {
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        if (chevron) chevron.textContent = open ? "\u25BC" : "\u25B2";
        if (!open) renderBancoIntel();
      }
    });
  }

  // Auto-preencher button (Story 4.29)
  const btnAutoPreencher = document.getElementById("btn-auto-preencher");
  if (btnAutoPreencher) btnAutoPreencher.addEventListener("click", autoPreencherPreOrcamento);

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

  // Batch descartar (Story 4.25)
  const btnBatchDescartar = document.getElementById("btn-batch-descartar");
  if (btnBatchDescartar) btnBatchDescartar.addEventListener("click", descartarSelecionados);

  // Inteligência toggle (Passo 2)
  el.intelToggle.addEventListener("click", toggleIntel);

  // Varredura SGD (Fase 4)
  el.btnCollectSgd.addEventListener("click", varrerSgd);
  const btnVarrer = document.getElementById("btn-varrer-sgd");
  if (btnVarrer) btnVarrer.addEventListener("click", varrerSgd);

  // SGD Tab
  el.btnSgdEnviarTodos.addEventListener("click", sgdEnviarTodos);
  el.btnSgdBaixarTodos.addEventListener("click", sgdBaixarTodos);

  // Filtros SGD
  ["filtro-sgd-escola", "filtro-sgd-municipio", "filtro-sgd-status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderSgd);
  });
  const fSgdTexto = document.getElementById("filtro-sgd-texto");
  if (fSgdTexto) fSgdTexto.addEventListener("input", renderSgd);

  // Story 4.40: Date filters for Radar
  ["filtro-data-de", "filtro-data-ate"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderOrcamentos);
  });

  // Story 4.40: Date filters for SGD
  ["filtro-sgd-data-de", "filtro-sgd-data-ate"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderSgd);
  });

  // Story 4.40: Filters for Pré-Orçamento list
  ["filtro-pre-escola", "filtro-pre-status"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderPreOrcamentosLista);
  });
  const fPreTexto = document.getElementById("filtro-pre-texto");
  if (fPreTexto) fPreTexto.addEventListener("input", renderPreOrcamentosLista);

  // Story 4.40: Filters for Aprovados
  ["filtro-aprov-status"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderAprovados);
  });
  const fAprovTexto = document.getElementById("filtro-aprov-texto");
  if (fAprovTexto) fAprovTexto.addEventListener("input", renderAprovados);

  // Story 4.40: Filters for Histórico
  ["filtro-hist-escola"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderHistorico);
  });
  const fHistTexto = document.getElementById("filtro-hist-texto");
  if (fHistTexto) fHistTexto.addEventListener("input", renderHistorico);

  // Keyboard: Escape fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const vincularModal = document.getElementById("modal-vincular-produto");
      if (vincularModal && vincularModal.style.display !== "none") fecharModalVincular();
      else if (document.getElementById("modal-mestres")?.style.display !== "none") closeMestresModal();
      else if (el.modalImport.style.display !== "none") closeImportModal();
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
  "galao": { aliases: ["galao", "gl"], defaultQty: 5 },
  "lata": { aliases: ["lata", "lt"], defaultQty: 1 },
  "rolo": { aliases: ["rolo", "rl"], defaultQty: 1 },
  "metro": { aliases: ["metro", "m", "mt"], defaultQty: 1 },
  "litro": { aliases: ["litro", "l", "lt"], defaultQty: 1 },
  "unidade": { aliases: ["unidade", "un", "und", "peca", "pc"], defaultQty: 1 },
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

  // Register import file (Story 4.27)
  const importFilename = document.getElementById("import-filename")?.textContent || "import";
  const currentArquivo = registrarArquivo(importFilename, "", "excel", 0);
  const currentArquivoId = currentArquivo.id;
  const sourceConfidence = currentArquivo.confianca;

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
        existing.custosFornecedor.push({ fornecedor, preco, data: todayStr, arquivoId: currentArquivoId, descricaoOriginal: itemName, confianca: sourceConfidence });
        // Detect variation > 20% (Story 4.27)
        if (existing.custosFornecedor.length >= 2) {
          const prev = existing.custosFornecedor[existing.custosFornecedor.length - 2].preco;
          const curr = existing.custosFornecedor[existing.custosFornecedor.length - 1].preco;
          if (prev > 0) {
            const varPct = ((curr - prev) / prev) * 100;
            if (Math.abs(varPct) > 20) {
              console.warn(`[Banco] Variacao ${varPct.toFixed(1)}%: "${existing.item}" (${brl.format(prev)} -> ${brl.format(curr)})`);
            }
          }
        }
      }
      // Link to Item Mestre (Story 4.26)
      if (!existing.mesterId) {
        const mestreMatch = findBestMestre(existing.item);
        if (mestreMatch && mestreMatch.score >= 0.5) {
          existing.mesterId = mestreMatch.mestre.id;
          linkItemToMestre(existing.item, mestreMatch.mestre.id);
        } else {
          const mestre = createMestreFromItem(existing);
          existing.mesterId = mestre.id;
        }
      }
      updated++;
    } else {
      const margemPadrao = 0.30;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      const newItem = {
        id: newId, item: itemName, grupo: "Importado", unidade: unidade || "Unidade",
        custoBase: preco, margemPadrao, precoReferencia: Math.round(preco * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr, fonte: fornecedor, propostas: [], concorrentes: [],
        custosFornecedor: fornecedor && preco > 0 ? [{ fornecedor, preco, data: todayStr, arquivoId: currentArquivoId, descricaoOriginal: itemName, confianca: sourceConfidence }] : [],
      };
      // Link to Item Mestre (Story 4.26)
      const mestreMatch = findBestMestre(newItem.item);
      if (mestreMatch && mestreMatch.score >= 0.8) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(newItem.item, mestreMatch.mestre.id);
      } else if (mestreMatch && mestreMatch.score >= 0.5) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(newItem.item, mestreMatch.mestre.id);
        console.log(`[Mestre] Match sugerido (${(mestreMatch.score*100).toFixed(0)}%): "${newItem.item}" → "${mestreMatch.mestre.nomeCanonico}"`);
      } else {
        const mestre = createMestreFromItem(newItem);
        newItem.mesterId = mestre.id;
      }
      bancoPrecos.itens.push(newItem);
      added++;
    }
  });

  // Update arquivo registry with count (Story 4.27)
  currentArquivo.qtdItens = updated + added;
  saveArquivos();

  saveMestres();
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

  // Register import file (Story 4.27)
  const importFilename = document.getElementById("import-filename")?.textContent || "mapa-import";
  const currentArquivo = registrarArquivo(importFilename, "", "excel", 0);
  const currentArquivoId = currentArquivo.id;
  const sourceConfidence = currentArquivo.confianca;

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
      // Link to Item Mestre (Story 4.26)
      if (!existing.mesterId) {
        const mestreMatch = findBestMestre(existing.item);
        if (mestreMatch && mestreMatch.score >= 0.5) {
          existing.mesterId = mestreMatch.mestre.id;
          linkItemToMestre(existing.item, mestreMatch.mestre.id);
        } else {
          const mestre = createMestreFromItem(existing);
          existing.mesterId = mestre.id;
        }
      }
      updated++;
    } else if (isWon || importAll) {
      // Create new item
      const margemPadrao = 0.30;
      const custoBase = myPrice || 0;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      const competitorPrices = allPrices.filter((p) => !p.isMe && p.preco > 0)
        .map((p) => ({ nome: p.nome, preco: p.preco, data: todayStr, edital: "Mapa Import" }));
      concorrentesAdded += competitorPrices.length;

      const newItem = {
        id: newId, item: itemName, grupo: "Mapa Apuracao", unidade: unidade || "Unidade",
        custoBase, margemPadrao, precoReferencia: Math.round(custoBase * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr, fonte: "Mapa de Apuracao",
        propostas: [], concorrentes: competitorPrices,
        custosFornecedor: myPrice > 0 ? [{ fornecedor: "Meu preco (mapa)", preco: myPrice, data: todayStr, arquivoId: currentArquivoId, descricaoOriginal: itemName, confianca: sourceConfidence }] : [],
      };
      // Link to Item Mestre (Story 4.26)
      const mestreMatch = findBestMestre(newItem.item);
      if (mestreMatch && mestreMatch.score >= 0.5) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(newItem.item, mestreMatch.mestre.id);
      } else {
        const mestre = createMestreFromItem(newItem);
        newItem.mesterId = mestre.id;
      }
      bancoPrecos.itens.push(newItem);
      added++;
    }
  });

  // Update arquivo registry with count (Story 4.27)
  currentArquivo.qtdItens = updated + added;
  saveArquivos();

  saveMestres();
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
  // Usar observação existente, mas limpar marca antiga se presente
  let obs = (item.observacao || item.descricao || item.nome || "Conforme especificado").trim();
  // Remover qualquer [Marca: ...] existente para evitar duplicação
  obs = obs.replace(/\[Marca:\s*[^\]]*\]\s*/g, "").trim();
  if (marca) {
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
window.imprimirSgd = function() {
  const tabela = document.getElementById("tabela-sgd");
  if (!tabela) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Envio SGD — Licit-AIX</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
      h2 { font-size: 16px; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
      .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; }
      .badge-aprovado { background: #dbeafe; color: #1e40af; }
      .badge-enviado { background: #fef3c7; color: #92400e; }
      .badge-ganho { background: #d1fae5; color: #065f46; }
      .badge-perdido { background: #fee2e2; color: #991b1b; }
      .text-muted { color: #999; }
      .font-mono { font-family: monospace; }
      @media print { body { margin: 10px; } }
    </style>
  </head><body>
    <h2>Envio ao SGD — ${new Date().toLocaleDateString("pt-BR")}</h2>
    ${tabela.outerHTML}
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
};

function renderSgd() {
  const allPre = Object.values(preOrcamentos);
  const ready = allPre.filter((p) => p.status === "aprovado");
  const sent = allPre.filter((p) => p.status === "enviado");
  const ganhos = allPre.filter((p) => p.status === "ganho");
  const perdidos = allPre.filter((p) => p.status === "perdido");
  let sgdItems = [...ready, ...sent, ...ganhos, ...perdidos];

  // Filtros SGD
  const fEscola = document.getElementById("filtro-sgd-escola");
  const fMun = document.getElementById("filtro-sgd-municipio");
  const fStatus = document.getElementById("filtro-sgd-status");
  const fTexto = document.getElementById("filtro-sgd-texto");

  // Popular dropdowns
  if (fEscola && fEscola.options.length <= 1) {
    const escolas = [...new Set(sgdItems.map(p => p.escola).filter(Boolean))].sort();
    escolas.forEach(e => { const o = document.createElement("option"); o.value = e; o.textContent = e; fEscola.appendChild(o); });
  }
  if (fMun && fMun.options.length <= 1) {
    const muns = [...new Set(sgdItems.map(p => p.municipio).filter(Boolean))].sort();
    muns.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; fMun.appendChild(o); });
  }

  // Aplicar filtros
  const escola = fEscola ? fEscola.value : "all";
  const mun = fMun ? fMun.value : "all";
  const status = fStatus ? fStatus.value : "all";
  const texto = fTexto ? normalizedText(fTexto.value.trim()) : "";
  const sgdDe = document.getElementById("filtro-sgd-data-de")?.value || "";
  const sgdAte = document.getElementById("filtro-sgd-data-ate")?.value || "";

  sgdItems = sgdItems.filter(p => {
    if (escola !== "all" && p.escola !== escola) return false;
    if (mun !== "all" && p.municipio !== mun) return false;
    if (status !== "all" && p.status !== status) return false;
    if (texto && !normalizedText([p.escola, p.municipio, p.orcamentoId, ...(p.itens || []).map(i => i.nome)].join(" ")).includes(texto)) return false;
    if ((sgdDe || sgdAte) && !dentroDoIntervalo(p.enviadoEm || p.aprovadoEm, sgdDe, sgdAte)) return false;
    return true;
  });

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
        ganho: { cls: "badge-ganho", label: "Ganho" },
        perdido: { cls: "badge-perdido", label: "Perdido" },
      };
      const badge = badgeMap[p.status] || { cls: "badge-muted", label: p.status };
      const dateInfo = p.enviadoEm ? formatDate(p.enviadoEm) : formatDate(p.aprovadoEm);

      // Checkbox para contrato unificado (enviados e aprovados)
      const canSelect = p.status === "enviado" || p.status === "aprovado";
      const checkbox = canSelect ? `<input type="checkbox" class="sgd-contrato-check" data-id="${p.orcamentoId}" />` : "";

      let actions = "";
      if (p.status === "aprovado") {
        actions = `<button class="btn btn-inline btn-sgd" onclick="sgdEnviarUnico('${p.orcamentoId}')">Enviar</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else if (p.status === "enviado") {
        actions = `<button class="btn btn-inline btn-accent" onclick="abrirModalResultado('${p.orcamentoId}')">Resultado</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else if (p.status === "ganho") {
        actions = `<button class="btn btn-inline" onclick="abrirPreOrcamento('${p.orcamentoId}')">Ver Itens</button>
          <button class="btn btn-inline btn-accent" onclick="gerarDemanda('${p.orcamentoId}')">Gerar Demanda</button>`;
      } else {
        actions = `<button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      }

      // Resumo dos itens
      const itens = p.itens || [];
      const resumoItens = itens.length > 0
        ? `<span title="${itens.map(i => i.nome).join('\n')}" style="font-size:0.75rem;color:#555;cursor:help;">${itens.length} iten(s): ${itens.slice(0, 3).map(i => escapeHtml((i.nome || "").slice(0, 25))).join(", ")}${itens.length > 3 ? "..." : ""}</span>`
        : '<span class="text-muted" style="font-size:0.75rem;">—</span>';

      return `<tr>
        <td>${checkbox}</td>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td>${escapeHtml(p.municipio)}</td>
        <td style="max-width:250px;">${resumoItens}</td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td><span class="badge ${badge.cls}">${badge.label}</span> <span class="text-muted" style="font-size:0.72rem">${dateInfo}</span></td>
        <td class="nowrap">${actions}</td>
      </tr>`;
    }).join("");

  // Barra contrato unificado
  let bar = document.getElementById("sgd-contrato-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "sgd-contrato-bar";
    bar.style.cssText = "display:none;padding:0.5rem 1rem;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;margin-bottom:0.75rem;align-items:center;gap:1rem;flex-wrap:wrap;";
    bar.innerHTML = `<span id="sgd-contrato-count" style="font-weight:600;">0 selecionados</span>
      <button class="btn btn-sm btn-accent" onclick="gerarContratoUnificado()">Gerar Contrato Unificado</button>`;
    el.tbodySgd.parentElement.parentElement.insertBefore(bar, el.tbodySgd.parentElement);
  }

  // Bind checkboxes
  el.tbodySgd.querySelectorAll(".sgd-contrato-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const checked = el.tbodySgd.querySelectorAll(".sgd-contrato-check:checked");
      const b = document.getElementById("sgd-contrato-bar");
      const c = document.getElementById("sgd-contrato-count");
      if (b) b.style.display = checked.length > 0 ? "flex" : "none";
      if (c) c.textContent = `${checked.length} selecionado(s)`;
    });
  });

  // Story 4.43: renderDemandas/renderEstoque/renderListaCompras migrados para gdp-contratos.html
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

  let { idSubprogram, idSchool, idBudget } = payload;
  // Tentar recuperar IDs do orcamento vinculado se ausentes
  if ((!idSubprogram || !idSchool || !idBudget) && payload.orcamentoId) {
    const orc = orcamentos.find(o => o.id === payload.orcamentoId);
    if (orc) {
      if (!idSubprogram && orc.idSubprogram) idSubprogram = orc.idSubprogram;
      if (!idSchool && orc.idSchool) idSchool = orc.idSchool;
      if (!idBudget && orc.idBudget) idBudget = orc.idBudget;
    }
  }
  // Tentar pegar do primeiro orcamento que tenha IDs SGD
  if (!idSubprogram || !idSchool || !idBudget) {
    const orcComIds = orcamentos.find(o => o.idSubprogram && o.idSchool && o.idBudget);
    if (orcComIds) {
      if (!idSubprogram) idSubprogram = orcComIds.idSubprogram;
      if (!idSchool) idSchool = orcComIds.idSchool;
      if (!idBudget) idBudget = orcComIds.idBudget;
    }
  }
  if (!idSubprogram || !idSchool || !idBudget) {
    const missing = [];
    if (!idSubprogram) missing.push("idSubprogram");
    if (!idSchool) missing.push("idSchool");
    if (!idBudget) missing.push("idBudget");
    throw new Error("IDs SGD ausentes (" + missing.join(", ") + "). Importe o orcamento do SGD primeiro ou vincule a um orcamento importado.");
  }

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

      // Resolve networkId via /auth/user (same strategy as server-side SgdClient)
      if (!BrowserSgdClient.networkId) {
        try {
          await BrowserSgdClient.getUser();
          console.log(`[Varrer] networkId via getUser: ${BrowserSgdClient.networkId}`);
        } catch (e) {
          console.warn(`[Varrer] getUser falhou: ${e.message}, tentando warm-up...`);
        }
      }

      // Fallback: warm-up listBudgets to extract networkId from first budget
      if (!BrowserSgdClient.networkId) {
        const warmUp = await BrowserSgdClient.listBudgets(1, 1);
        if (!BrowserSgdClient.networkId) {
          console.warn("[Varrer] networkId ainda null após warm-up. Dados:", warmUp);
        } else {
          console.log(`[Varrer] networkId via warm-up: ${BrowserSgdClient.networkId}`);
        }
      }
      sgdAvailable = true;
      updateModeIndicator(false);

      // Build school lookup from ALL configured SREs (Story 4.33)
      const sreNorm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase().trim();
      const sreSchoolsList = [];
      const schoolToMunicipio = {};
      const schoolToMunicipios = {}; // array — para nomes duplicados entre cidades
      const schoolToSre = {}; // maps school → SRE name

      allSreData.forEach(sre => {
        if (sre.data && sre.data.municipios) {
          sre.data.municipios.forEach((m) => {
            (m.escolas || []).forEach((e) => {
              const n = sreNorm(e);
              sreSchoolsList.push(n);
              schoolToMunicipio[n] = m.nome;
              schoolToSre[n] = sre.nome; // track which SRE
              if (!schoolToMunicipios[n]) schoolToMunicipios[n] = [];
              if (!schoolToMunicipios[n].includes(m.nome)) schoolToMunicipios[n].push(m.nome);
            });
          });
        }
      });

      // Confirmed SRE Uberaba municipality IDs (SGD API idCounty field)
      // ONLY confirmed county IDs — do NOT add auto-discovered ones (nomes duplicados entre cidades causam falsos positivos)
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

      // Step 1a: Fetch ABERTOS (NAEN) — varredura normal de oportunidades
      const allBudgets = [];
      let page = 1;
      const PAGE_SIZE = 100;
      while (true) {
        const data = await BrowserSgdClient.listBudgets(page, PAGE_SIZE);
        const items = data.data || [];
        if (items.length === 0) break;
        allBudgets.push(...items);
        const total = data.meta ? data.meta.totalItems : 0;
        if (allBudgets.length >= total) break;
        page++;
        btn.innerHTML = `<span class="sgd-spinner"></span>Listando... ${allBudgets.length}/${total}`;
      }

      // Step 1b: Checar status das ENVIADAS — consulta pontual por ID
      const enviadas = Object.values(preOrcamentos).filter(p => p.status === "enviado" && p.idBudget);
      if (enviadas.length > 0) {
        btn.innerHTML = `<span class="sgd-spinner"></span>Checando ${enviadas.length} propostas enviadas...`;
        for (const pre of enviadas) {
          try {
            const orc = orcamentos.find(o => o.idBudget == pre.idBudget);
            const idSub = pre.idSubprogram || orc?.idSubprogram;
            const idSch = pre.idSchool || orc?.idSchool;
            const idBud = pre.idBudget || orc?.idBudget;
            if (!idSub || !idSch || !idBud) continue;
            const detail = await BrowserSgdClient.getBudgetDetail(idSub, idSch, idBud);
            const sgdStatus = detail.supplierStatus || detail.flSupplierStatus || "";
            if (sgdStatus === "APRO" || sgdStatus === "Aprovado") {
              pre.status = "ganho";
              pre.statusSgd = "APRO";
              pre.resultadoEm = new Date().toISOString().slice(0, 10);
              console.log(`[Varrer] Proposta ${pre.orcamentoId} APROVADA no SGD!`);
            } else if (sgdStatus === "RECU" || sgdStatus === "Recusado") {
              pre.status = "perdido";
              pre.statusSgd = "RECU";
              pre.resultadoEm = new Date().toISOString().slice(0, 10);
              console.log(`[Varrer] Proposta ${pre.orcamentoId} RECUSADA no SGD.`);
            }
          } catch (e) {
            console.warn(`[Varrer] Erro ao checar enviada ${pre.orcamentoId}:`, e.message);
          }
        }
        savePreOrcamentos();
      }

      // Step 2: Filter using confirmed idSchool whitelist + county/name fallback
      // Whitelist persists in localStorage — once a school is confirmed, it never needs re-matching
      const WHITELIST_KEY = "caixaescolar.schoolWhitelist";
      const schoolWhitelist = JSON.parse(localStorage.getItem(WHITELIST_KEY) || "{}");
      const matched = [];
      const rejected = [];
      const filtered = [];

      allBudgets.forEach((b) => {
        const escola = b.schoolName || b.txSchoolName || "";
        const county = b.idCounty;
        const idSchool = b.idSchool;

        // TIER 1: idSchool already confirmed in whitelist — instant match, zero ambiguity
        if (idSchool && schoolWhitelist[idSchool]) {
          b._sreMatch = schoolWhitelist[idSchool].sre || sreNorm(escola);
          filtered.push(b);
          matched.push({ sgd: escola, county, mun: schoolWhitelist[idSchool].municipio, via: "whitelist", idSchool });
          return;
        }

        // TIER 2: County is confirmed SRE Uberaba
        if (sreCountyIds.has(county)) {
          const nameMatch = findSreMatch(escola);
          b._sreMatch = nameMatch || sreNorm(escola);
          filtered.push(b);
          const mun = nameMatch ? schoolToMunicipio[nameMatch] || sreCountyMap[county] : sreCountyMap[county];
          matched.push({ sgd: escola, county, mun, via: nameMatch ? "county+name" : "county-only", idSchool });
          // Auto-confirm to whitelist
          if (idSchool) schoolWhitelist[idSchool] = { escola, municipio: mun, sre: b._sreMatch, confirmedAt: new Date().toISOString().slice(0, 10) };
          return;
        }

        // TIER 3: Name match — ONLY unique names (not ambiguous across municipalities)
        const nameMatch = findSreMatch(escola);
        if (nameMatch) {
          const possibleMuns = schoolToMunicipios[nameMatch] || [];
          if (possibleMuns.length > 1) {
            rejected.push({ sgd: escola, sre: nameMatch, county, reason: `nome ambíguo: ${possibleMuns.join("/")}`, idSchool });
          } else {
            b._sreMatch = nameMatch;
            filtered.push(b);
            const mun = schoolToMunicipio[nameMatch] || "?";
            matched.push({ sgd: escola, county, mun, via: "name-only", idSchool });
            if (!sreCountyIds.has(county)) console.log(`[Varrer] Novo county descoberto: ${county} → ${mun}`);
            // Auto-confirm to whitelist
            if (idSchool) schoolWhitelist[idSchool] = { escola, municipio: mun, sre: nameMatch, confirmedAt: new Date().toISOString().slice(0, 10) };
          }
        }
      });

      // Save updated whitelist
      localStorage.setItem(WHITELIST_KEY, JSON.stringify(schoolWhitelist));
      const whitelistSize = Object.keys(schoolWhitelist).length;

      // Debug logs
      const whitelistHits = matched.filter((m) => m.via === "whitelist").length;
      const countyHits = matched.filter((m) => m.via === "county+name" || m.via === "county-only").length;
      const nameHits = matched.filter((m) => m.via === "name-only").length;
      console.log(`[Varrer] ${whitelistHits} whitelist, ${countyHits} county, ${nameHits} name-only → ${filtered.length} aceitos de ${allBudgets.length} varridos`);
      console.log(`[Varrer] Whitelist total: ${whitelistSize} escolas confirmadas`);
      if (rejected.length > 0) console.log(`[Varrer] ${rejected.length} rejeitados:`, rejected);
      const munsEncontrados = [...new Set(matched.map((m) => m.mun).filter(Boolean).filter(m => m !== "?"))].sort();
      const totalSreMunicipios = allSreData.reduce((sum, sre) => sum + (sre.data?.municipios?.length || 0), 0);
      console.log(`[Varrer] Municípios (${munsEncontrados.length}/${totalSreMunicipios}):`, munsEncontrados);
      // SRE breakdown log (Story 4.33)
      const sreCounts = {};
      filtered.forEach(b => {
        const sre = schoolToSre[b._sreMatch] || "Uberaba";
        sreCounts[sre] = (sreCounts[sre] || 0) + 1;
      });
      console.log(`[Varrer] SREs:`, sreCounts, `→ ${filtered.length} aceitos de ${allBudgets.length} varridos`);
      btn.innerHTML = `<span class="sgd-spinner"></span>SREs: ${filtered.length} de ${allBudgets.length}. Buscando detalhes...`;

      // Step 3: Fetch detail + items for each SRE budget (sequential — networkId is shared state)
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
          sre: schoolToSre[sreMatchKey] || (sreCountyMap[b.idCounty] ? "Uberaba" : "Desconhecida"),
          grupo: detail.expenseGroupDescription || "",
          subPrograma: detail.subprogramName || "",
          objeto: (detail.initiativeDescription || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
          prazo: (b.dtProposalSubmission || detail.dtProposalSubmission || "").slice(0, 10),
          prazoEntrega: (detail.dtDelivery || "").slice(0, 10),
          valorEstimado: detail.estimatedValue ? parseFloat(detail.estimatedValue) : null,
          // Status mapeado do SGD: NAEN=aberto, ENVI=enviado, APRO=aprovado, RECU=recusado
          status: ({ NAEN: "aberto", ENVI: "enviado", APRO: "aprovado", RECU: "recusado" })[b.supplierStatus] || "aberto",
          statusSgd: b.supplierStatus || "NAEN",
          participantes: detail.inNaturalPersonAllowed ? "PJ/PF" : "PJ",
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
      const sreBreakdown = Object.entries(sreCounts).map(([k,v]) => `${k}: ${v}`).join(", ");
      showToast(`${novos} orçamento(s) carregados (${sreBreakdown}) de ${allBudgets.length} total SGD.`);
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
    console.error("[Varrer] Erro na varredura:", err);
    const msg = err.message || String(err);
    if (msg.includes("422")) {
      alert("Erro SGD (422): Header x-network-being-managed-id ausente ou inválido. Verifique as credenciais e tente novamente.");
    } else if (msg.includes("401") || msg.includes("Login")) {
      alert("Erro de autenticação SGD. Verifique CNPJ e senha.");
      localStorage.removeItem(SGD_CRED_KEY);
    } else {
      alert("Erro na varredura: " + msg);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Varrer SGD";
  }

  // === INTEGRAÇÃO BANCO DE PREÇOS ===
  // Após varrer SGD, enviar itens ao banco de preços para intake + normalização
  if (typeof BancoPrecos !== "undefined" && BancoPrecos.isEnabled() && orcamentos.length > 0) {
    try {
      console.log("[BancoPrecos] Enviando itens do SGD ao banco de preços...");
      const intakeResult = await BancoPrecos.enviarItensIntake(orcamentos);
      if (intakeResult) {
        console.log(`[BancoPrecos] Intake: ${intakeResult.vinculados} vinculados, ${intakeResult.pendentes} pendentes`);
      }
    } catch (e) {
      console.warn("[BancoPrecos] Erro no intake:", e.message);
    }
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
  // Reset GDP fields (Story 4.34)
  const gdpCheckbox = document.getElementById("res-gerar-contrato-gdp");
  if (gdpCheckbox) gdpCheckbox.checked = true;
  const numContratoInput = document.getElementById("res-numero-contrato");
  if (numContratoInput) numContratoInput.value = "";
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

  // Se ganhou e checkbox marcado → gerar contrato local (CX Escolar)
  let geradoLocal = false;
  let geradoGdp = false;
  if (resultado.resultado === "ganho" && document.getElementById("res-gerar-contrato").checked) {
    const contrato = gerarContratoDeResultado(resultado, pre);
    resultado.contrato = { gerado: true, contratoId: contrato.contratoId };
    resultados[resultados.length - 1] = resultado;
    localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
    geradoLocal = true;
  }

  // Se ganhou e checkbox GDP marcado → criar contrato no GDP
  if (resultado.resultado === "ganho" && document.getElementById("res-gerar-contrato-gdp").checked) {
    const numContrato = (document.getElementById("res-numero-contrato").value || "").trim();
    criarContratoGdp(currentResultadoOrcamentoId, pre, numContrato);
    geradoGdp = true;
  }

  // Alimentar banco de preços
  alimentarBancoComResultado(resultado);

  fecharModalResultado();
  renderSgd();
  renderKPIs();
  renderOrcamentos();
  schedulCloudSync();

  if (resultado.resultado === "ganho") {
    const partes = [];
    if (geradoLocal) partes.push("contrato local");
    if (geradoGdp) partes.push("contrato GDP");
    const msg = partes.length > 0
      ? `Resultado registrado — ${partes.join(" + ")} criado(s)!`
      : "Resultado registrado como ganho!";
    showToast(msg);
  } else {
    showToast("Resultado registrado — histórico atualizado");
  }
};

window.editarResultadoPreOrcamento = function (orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre) return;
  const statusAtual = pre.status;
  const opcoes = ["enviado", "ganho", "perdido"];
  const labels = { enviado: "Enviado (reverter)", ganho: "Ganho", perdido: "Perdido" };
  const escolha = prompt(
    "Status atual: " + statusAtual.toUpperCase() + "\n\n" +
    "Digite o novo status:\n" +
    "1 = Enviado (reverter resultado)\n" +
    "2 = Ganho\n" +
    "3 = Perdido\n\n" +
    "Ou digite: enviado / ganho / perdido"
  );
  if (!escolha) return;
  const map = { "1": "enviado", "2": "ganho", "3": "perdido" };
  const novoStatus = map[escolha.trim()] || escolha.trim().toLowerCase();
  if (!opcoes.includes(novoStatus)) { showToast("Status inválido: " + escolha, 3000); return; }
  if (novoStatus === statusAtual) { showToast("Já está como " + statusAtual, 2000); return; }

  pre.status = novoStatus;
  savePreOrcamentos();

  // Atualizar resultado se existir
  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  const resIdx = resultados.findIndex(r => r.orcamentoId === orcId);
  if (resIdx >= 0 && novoStatus === "enviado") {
    resultados.splice(resIdx, 1);
    localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
  } else if (resIdx >= 0) {
    resultados[resIdx].resultado = novoStatus;
    localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
  }

  renderSgd();
  renderKPIs();
  renderOrcamentos();
  schedulCloudSync();
  showToast("Resultado alterado de " + statusAtual + " para " + novoStatus);
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

// ===== F3b: CRIAR CONTRATO NO GDP (Gestao Pos-Licitacao) — Story 4.34 =====
function criarContratoGdp(orcId, preOrcamento, numContrato) {
  const GDP_CONTRATOS_KEY = "gdp.contratos.v1";

  // Load GDP contracts (wrapped format: { _v, updatedAt, items })
  let contratos = [];
  try {
    const raw = JSON.parse(localStorage.getItem(GDP_CONTRATOS_KEY));
    contratos = Array.isArray(raw) ? raw : (raw && raw.items ? raw.items : []);
  } catch (_) { contratos = []; }

  // Find the original orcamento for extra data
  const orc = orcamentos.find(o => o.id === orcId);

  const now = new Date();
  const id = `CTR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;

  const escolaNome = preOrcamento.escola || (orc ? orc.escola : "");
  const municipio = preOrcamento.municipio || (orc ? orc.municipio : "");
  const sre = orc ? (orc.sre || "Uberaba") : "Uberaba";

  // Auto-criar/vincular cliente (escola) no GDP
  let escolaClienteId = null;
  try {
    const USUARIOS_KEY = "gdp.usuarios.v1";
    let usuarios = [];
    const rawU = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "null");
    usuarios = Array.isArray(rawU) ? rawU : (rawU && rawU.items ? rawU.items : []);

    // Buscar cliente existente por nome da escola
    const normEscola = normalizedText(escolaNome);
    let cliente = usuarios.find(u => normalizedText(u.nome) === normEscola);

    if (!cliente) {
      // Criar cliente automaticamente
      cliente = {
        id: "cli-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
        nome: escolaNome,
        cnpj: "",
        municipio: municipio,
        sre: sre,
        responsavel: "",
        email: "",
        telefone: "",
        logradouro: "",
        bairro: "",
        cep: "",
        uf: "MG",
        tipo: "escola",
        contratos_vinculados: [],
        criadoEm: now.toISOString().slice(0, 10),
        origem: "auto-contrato-ganho",
      };
      usuarios.push(cliente);
      localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
      console.log(`[GDP] Cliente criado automaticamente: ${escolaNome}`);
    }
    escolaClienteId = cliente.id;
    if (!Array.isArray(cliente.contratos_vinculados)) cliente.contratos_vinculados = [];
  } catch (e) {
    console.warn("[GDP] Erro ao vincular cliente:", e);
  }

  const contrato = {
    id,
    escola: escolaNome,
    escolaClienteId: escolaClienteId,
    edital: orcId,
    criterio: "menor_preco",
    dataApuracao: now.toISOString().slice(0, 10),
    dataCriacao: now.toISOString(),
    fornecedor: "Lariucci & Ribeiro Pereira",
    status: "ativo",
    numero: numContrato || "",
    municipio: municipio,
    sre: sre,
    orcamentoId: orcId,
    origem: "pre-orcamento-sgd",
    itens: (preOrcamento.itens || []).map((item, idx) => ({
      num: idx + 1,
      descricao: item.nome || item.descricao || "",
      unidade: item.unidade || "UN",
      qtdContratada: item.quantidade || 0,
      precoUnitario: item.precoUnitario || 0,
      precoTotal: Math.round((item.precoUnitario || 0) * (item.quantidade || 0) * 100) / 100,
      qtdEntregue: 0,
      ncm: "",
      marca: item.marca || "",
    })),
    valorTotal: Math.round((preOrcamento.itens || []).reduce((s, i) => s + (i.precoUnitario || 0) * (i.quantidade || 0), 0) * 100) / 100,
    fornecedoresMapa: [],
  };

  // Vincular contrato ao cliente
  if (escolaClienteId) {
    try {
      const USUARIOS_KEY = "gdp.usuarios.v1";
      let usuarios = [];
      const rawU = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "null");
      usuarios = Array.isArray(rawU) ? rawU : (rawU && rawU.items ? rawU.items : []);
      const cliente = usuarios.find(u => u.id === escolaClienteId);
      if (cliente) {
        if (!Array.isArray(cliente.contratos_vinculados)) cliente.contratos_vinculados = [];
        if (!cliente.contratos_vinculados.includes(id)) cliente.contratos_vinculados.push(id);
        localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
      }
    } catch(_) {}
  }

  contratos.push(contrato);

  // Save in GDP wrapped format
  const wrapped = { _v: 1, updatedAt: now.toISOString(), items: contratos };
  localStorage.setItem(GDP_CONTRATOS_KEY, JSON.stringify(wrapped));

  // Trigger cloud sync
  if (typeof schedulCloudSync === "function") schedulCloudSync();

  console.log(`[GDP] Contrato criado: ${contrato.id} — ${contrato.escola} — ${brl.format(contrato.valorTotal)}`);
  return contrato;
}

// Gerar contrato unificado a partir de múltiplos pré-orçamentos selecionados
window.gerarContratoUnificado = function() {
  const checked = document.querySelectorAll(".sgd-contrato-check:checked, .pre-lote-check:checked");
  if (checked.length === 0) return;

  const ids = [...checked].map(cb => cb.dataset.id);
  const pres = ids.map(id => preOrcamentos[id]).filter(Boolean);

  if (pres.length === 0) return;

  // Agrupar por escola
  const escolas = [...new Set(pres.map(p => p.escola))];
  const escolaLabel = escolas.length === 1 ? escolas[0] : `${escolas.length} escolas`;

  const numContrato = prompt(`Gerar contrato unificado com ${pres.length} processo(s) (${escolaLabel}).\n\nNúmero do contrato/ARP:`);
  if (numContrato === null) return;

  // Consolidar todos os itens e calcular soma real
  const todosItens = [];
  let valorTotal = 0;
  pres.forEach(pre => {
    (pre.itens || []).forEach(item => {
      const precoTotal = (item.precoUnitario || 0) * (item.quantidade || 0);
      todosItens.push({
        num: todosItens.length + 1,
        descricao: item.nome || item.descricao || "",
        unidade: item.unidade || "UN",
        qtdContratada: item.quantidade || 0,
        quantidade: item.quantidade || 0,
        precoUnitario: item.precoUnitario || 0,
        precoTotal: Math.round(precoTotal * 100) / 100,
        qtdEntregue: 0,
        ncm: "",
        marca: item.marca || "",
        orcamentoOrigem: pre.orcamentoId,
      });
      valorTotal += precoTotal;
    });
  });
  valorTotal = Math.round(valorTotal * 100) / 100;

  // Criar contrato GDP unificado
  const CONTRATOS_GDP_KEY = "gdp.contratos.v1";
  let contratosRaw;
  try { contratosRaw = JSON.parse(localStorage.getItem(CONTRATOS_GDP_KEY) || "{}"); } catch(_) { contratosRaw = {}; }
  const contratos = contratosRaw.items || contratosRaw || [];
  const contratosArray = Array.isArray(contratos) ? contratos : [];

  // Auto-vincular cliente (primeira escola)
  let escolaClienteId = null;
  try {
    const USUARIOS_KEY = "gdp.usuarios.v1";
    let usuarios = [];
    const rawU = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "null");
    usuarios = Array.isArray(rawU) ? rawU : (rawU && rawU.items ? rawU.items : []);
    const normEscola = normalizedText(escolas[0] || "");
    let cliente = usuarios.find(u => normalizedText(u.nome) === normEscola);
    if (!cliente && escolas[0]) {
      cliente = {
        id: "cli-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
        nome: escolas[0], cnpj: "", municipio: pres[0].municipio || "", sre: pres[0].sre || "",
        responsavel: "", email: "", telefone: "", uf: "MG", tipo: "escola",
        contratos_vinculados: [], criadoEm: new Date().toISOString().slice(0, 10), origem: "auto-contrato-unificado",
      };
      usuarios.push(cliente);
      localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
    }
    if (cliente) escolaClienteId = cliente.id;
  } catch(_) {}

  const contrato = {
    id: "gdp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
    numero: numContrato || "ARP-UNIF-" + ids[0],
    tipo: "Caixa Escolar",
    status: "ativo",
    escola: escolas.join(", "),
    escolaClienteId: escolaClienteId,
    municipio: pres[0].municipio || "",
    sre: pres[0].sre || "",
    valorTotal: Math.round(valorTotal * 100) / 100,
    dataInicio: new Date().toISOString().slice(0, 10),
    dataCriacao: new Date().toISOString(),
    dataApuracao: new Date().toISOString().slice(0, 10),
    criterio: "menor_preco",
    fornecedor: "Lariucci & Ribeiro Pereira",
    orcamentosIds: ids,
    itens: todosItens,
    criadoEm: new Date().toISOString().slice(0, 10),
    origem: "contrato-unificado",
  };

  // Vincular contrato ao cliente
  if (escolaClienteId) {
    try {
      const USUARIOS_KEY = "gdp.usuarios.v1";
      let usuarios = [];
      const rawU = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "null");
      usuarios = Array.isArray(rawU) ? rawU : (rawU && rawU.items ? rawU.items : []);
      const cliente = usuarios.find(u => u.id === escolaClienteId);
      if (cliente) {
        if (!Array.isArray(cliente.contratos_vinculados)) cliente.contratos_vinculados = [];
        if (!cliente.contratos_vinculados.includes(contrato.id)) cliente.contratos_vinculados.push(contrato.id);
        localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
      }
    } catch(_) {}
  }

  contratosArray.push(contrato);
  localStorage.setItem(CONTRATOS_GDP_KEY, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: contratosArray }));

  // Marcar todos pré-orçamentos como "ganho"
  ids.forEach(id => {
    if (preOrcamentos[id]) {
      preOrcamentos[id].status = "ganho";
      preOrcamentos[id].contratoNumero = numContrato || contrato.id;
    }
  });
  savePreOrcamentos();

  if (typeof schedulCloudSync === "function") schedulCloudSync();

  renderPreOrcamentosLista();
  renderOrcamentos();
  showToast(`Contrato unificado criado: ${todosItens.length} itens de ${pres.length} processos — ${brl.format(valorTotal)}`);
  console.log(`[GDP] Contrato unificado: ${contrato.numero} — ${todosItens.length} itens — ${brl.format(valorTotal)}`);
};

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

  // Story 4.40: apply filters
  const fAprovStatus = document.getElementById("filtro-aprov-status")?.value || "all";
  const fAprovTexto = normalizedText(document.getElementById("filtro-aprov-texto")?.value?.trim() || "");

  let filteredContratos = contratos;
  if (fAprovStatus !== "all") filteredContratos = filteredContratos.filter(c => c.status === fAprovStatus);
  if (fAprovTexto) filteredContratos = filteredContratos.filter(c => normalizedText([c.escola?.nome, c.escola?.municipio, c.contratoId, ...(c.itens || []).map(i => i.nome)].join(" ")).includes(fAprovTexto));

  if (filteredContratos.length === 0) {
    listaEl.innerHTML = '<p class="empty-msg">Nenhum contrato corresponde aos filtros.</p>';
    return;
  }

  // Agrupar por escola
  const porEscola = {};
  filteredContratos.forEach(c => {
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
        <thead><tr><th>Contrato</th><th>Itens</th><th>Data</th><th>Valor</th><th>Status</th><th>Entrega</th><th>Ações</th></tr></thead>
        <tbody>${ctrs.map(c => {
          const totalItens = c.itens ? c.itens.reduce((s, i) => s + (i.quantidade || 0), 0) : 0;
          const entregueItens = c.itens ? c.itens.reduce((s, i) => s + (i.entregue || 0), 0) : 0;
          const cItemsSummary = getItemsSummary(c) || "—";
          return `<tr>
            <td><strong>${escapeHtml(c.contratoId)}</strong></td>
            <td style="font-size:0.8rem;max-width:180px;" title="${escapeHtml((c.itens||[]).map(i=>i.nome).join(', '))}">${escapeHtml(cItemsSummary)}</td>
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
  let resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");

  // Story 4.40: populate escola dropdown
  const fHistEscola = document.getElementById("filtro-hist-escola");
  if (fHistEscola && fHistEscola.options.length <= 1) {
    const escolas = [...new Set(resultados.map(r => r.escola).filter(Boolean))].sort();
    escolas.forEach(e => { const o = document.createElement("option"); o.value = e; o.textContent = e; fHistEscola.appendChild(o); });
  }

  // Story 4.40: apply filters
  const fHistEscolaVal = fHistEscola ? fHistEscola.value : "all";
  const fHistTexto = normalizedText(document.getElementById("filtro-hist-texto")?.value?.trim() || "");

  if (fHistEscolaVal !== "all") resultados = resultados.filter(r => r.escola === fHistEscolaVal);
  if (fHistTexto) resultados = resultados.filter(r => normalizedText([r.escola, r.municipio, r.grupo, ...(r.itens || []).map(i => i.nome)].join(" ")).includes(fHistTexto));

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
  // Story 4.40: apply same filters as renderHistorico
  let resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  const fHistEscola = document.getElementById("filtro-hist-escola");
  const fHistEscolaVal = fHistEscola ? fHistEscola.value : "all";
  const fHistTexto = normalizedText(document.getElementById("filtro-hist-texto")?.value?.trim() || "");
  if (fHistEscolaVal !== "all") resultados = resultados.filter(r => r.escola === fHistEscolaVal);
  if (fHistTexto) resultados = resultados.filter(r => normalizedText([r.escola, r.municipio, r.grupo, ...(r.itens || []).map(i => i.nome)].join(" ")).includes(fHistTexto));
  renderHistoricoContent(tab, resultados.filter(r => r.resultado === "ganho"), resultados.filter(r => r.resultado === "perdido"), resultados);
};

function renderHistoricoContent(tab, ganhos, perdidos, todos) {
  const container = document.getElementById("hist-" + tab);
  if (!container) return;

  if (tab === "ganhos" || tab === "perdidos") {
    const items = tab === "ganhos" ? ganhos : perdidos;
    if (items.length === 0) { container.innerHTML = '<p class="empty-msg">Nenhum registro.</p>'; return; }
    container.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Escola</th><th>Município</th><th>Itens</th><th>Valor</th><th>Data</th>${tab === "perdidos" ? "<th>Vencedor</th><th>Delta</th><th>Motivo</th>" : "<th>Contrato</th>"}<th>Obs</th></tr></thead>
      <tbody>${items.map(r => {
        const rItemsSummary = getItemsSummary(r) || "—";
        const rItemsTooltip = (r.itens || []).map(i => i.nome || "").join(", ");
        return `<tr>
        <td>${escapeHtml(r.escola)}</td><td>${escapeHtml(r.municipio)}</td>
        <td style="font-size:0.8rem;max-width:180px;" title="${escapeHtml(rItemsTooltip)}">${escapeHtml(rItemsSummary)}</td>
        <td class="font-mono text-right">${brl.format(r.valorProposto || 0)}</td>
        <td>${formatDate(r.dataResultado)}</td>
        ${tab === "perdidos" ? `<td>${escapeHtml(r.fornecedorVencedor || "—")}</td><td class="text-danger">${r.deltaTotalPercent ? "+" + r.deltaTotalPercent + "%" : "—"}</td><td>${escapeHtml(r.motivoPerda || "—")}</td>` : `<td>${r.contrato?.contratoId || "—"}</td>`}
        <td style="max-width:200px;font-size:0.78rem;">${escapeHtml(r.observacoes || "")}</td>
      </tr>`;
      }).join("")}</tbody>
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

// ===== RECALC PRÉ-ORÇAMENTO =====
function recalcPreOrcamento(pre) {
  if (!pre || !pre.itens) return;
  pre.totalGeral = Math.round(pre.itens.reduce((s, i) => s + (i.precoTotal || 0), 0) * 100) / 100;
  const margens = pre.itens.filter(i => i.custoUnitario > 0).map(i => i.margem || 0);
  pre.margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0.30;
}

// ===== PESQUISAR PREÇO POR ITEM (Pré-Orçamento) =====

window.toggleSearchMenu = function(idx) {
  // Close all other menus
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const menu = document.getElementById("search-menu-" + idx);
  if (menu) menu.style.display = menu.style.display === "none" ? "block" : "none";
};

// Close search menus on click outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-preco-wrap")) {
    document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  }
});

window.pesquisarPrecoPNCP = async function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const item = pre.itens[idx];
  console.log("[PNCP] Buscando:", simplificarTermoPNCP(item.nome));
  showToast("Buscando no PNCP: " + item.nome + "...");

  const resultado = await consultarPNCP(item.nome, item.idBudgetItem);
  if (resultado && resultado.detalhes?.length > 0 && resultado.min > 0) {
    const orgao = resultado.detalhes[0]?.orgao || "N/A";
    const usar = confirm(`PNCP encontrou: ${brl.format(resultado.min)}\nOrgao: ${orgao}\nAmostras: ${resultado.amostras}\n\nUsar como preco de custo?`);
    if (usar) {
      item.custoUnitario = resultado.min;
      item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
      item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
      recalcPreOrcamento(pre);
      savePreOrcamentos();
      renderPreOrcamentoItens();
      showToast("Preco PNCP aplicado: " + brl.format(resultado.min));
    }
  } else if (resultado === null) {
    // Error toasts are already shown by consultarPNCP, only show "no results" if no error occurred
    showToast("PNCP: nenhum resultado para " + item.nome, "warning");
  }
};

window.pesquisarPrecoGoogle = function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const termo = encodeURIComponent(pre.itens[idx].nome + " preço atacado");
  window.open("https://www.google.com/search?tbm=shop&q=" + termo, "_blank");
};

window.pesquisarPrecoMercadoLivre = function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const termo = encodeURIComponent(pre.itens[idx].nome);
  window.open("https://lista.mercadolivre.com.br/" + termo, "_blank");
};

window.pesquisarPrecoBanco = function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const item = pre.itens[idx];

  const bp = findBancoItem(item.nome);
  if (bp) {
    const stats = calcHistoricoStats(bp.custosFornecedor);
    let msg = `Banco de Preços: ${item.nome}\n\n`;
    msg += `Custo base: ${brl.format(bp.custoBase)}\n`;
    msg += `Preço referência: ${brl.format(bp.precoReferencia)}\n`;
    if (bp.marca) msg += `Marca: ${bp.marca}\n`;
    if (stats) {
      msg += `\nHistórico (${stats.totalRegistros} registros):\n`;
      msg += `  Min: ${brl.format(stats.min)} | Méd: ${brl.format(stats.media)} | Max: ${brl.format(stats.max)}\n`;
      if (stats.melhorFornecedor) msg += `  Melhor fornecedor: ${stats.melhorFornecedor}\n`;
    }
    msg += `\nUsar custo base (${brl.format(bp.custoBase)}) como preço de custo?`;

    if (confirm(msg)) {
      item.custoUnitario = bp.custoBase;
      if (bp.marca && !item.marca) item.marca = bp.marca;
      item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
      item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
      recalcPreOrcamento(pre);
      savePreOrcamentos();
      renderPreOrcamentoItens();
      showToast("Preço do banco aplicado: " + brl.format(bp.custoBase));
    }
  } else {
    showToast("Item não encontrado no Banco de Preços.");
  }
};

// ===== F7: PNCP INTEGRATION =====
function simplificarTermoPNCP(termo) {
  const stopwords = new Set(["de","da","do","das","dos","para","com","em","no","na","nos","nas","por","um","uma","uns","umas","o","a","os","as","e","ou","ao","aos","se"]);
  const words = termo.replace(/[^\w\sÀ-ú]/g, "").split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ");
}

async function consultarPNCP(itemNome, itemId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const termoSimplificado = simplificarTermoPNCP(itemNome);
    console.log("[PNCP] Termo original:", itemNome, "-> Simplificado:", termoSimplificado);

    const searchUrl = "/.netlify/functions/pncp-search";
    const searchBody = { action: "search", termo: termoSimplificado, uf: "MG" };
    console.log("[PNCP] request:", { url: searchUrl, body: searchBody });

    const resp = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody),
      signal: controller.signal,
    });

    console.log("[PNCP] response status:", resp.status);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[PNCP] erro HTTP:", resp.status, errText);
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const resultados = data.data || data || [];
    console.log("[PNCP] resultados:", Array.isArray(resultados) ? resultados.length : 0);

    if (!Array.isArray(resultados) || resultados.length === 0) {
      console.log("[PNCP] nenhum resultado encontrado para:", termoSimplificado);
      return null;
    }

    // Extract prices from search results (max 3 to avoid compound timeouts)
    const precos = [];
    for (const contratacao of resultados.slice(0, 3)) {
      try {
        const cnpj = contratacao.orgaoEntidade?.cnpj || contratacao.cnpjCompra;
        const ano = contratacao.anoCompra;
        const seq = contratacao.sequencialCompra;
        if (!cnpj || !ano || !seq) continue;

        console.log("[PNCP] Buscando itens:", cnpj, ano, seq);

        const itemsResp = await fetch("/.netlify/functions/pncp-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "items", cnpj, ano, seq }),
          signal: controller.signal,
        });

        if (!itemsResp.ok) {
          console.warn("[PNCP] itens HTTP error:", itemsResp.status, "para", cnpj, ano, seq);
          continue;
        }

        const itemsData = await itemsResp.json();
        const itensArray = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);
        console.log("[PNCP] itens retornados:", itensArray.length, "para", cnpj, ano, seq);

        const keywords = simplificarTermoPNCP(itemNome).toLowerCase().split(" ");
        itensArray.forEach(i => {
          if (i.descricao && keywords.some(kw => i.descricao.toLowerCase().includes(kw))) {
            const preco = i.valorHomologado || i.valorUnitarioEstimado;
            if (preco > 0) {
              precos.push({
                preco, orgao: contratacao.orgaoEntidade?.razaoSocial || "",
                data: contratacao.dataPublicacaoPncp, descricao: i.descricao,
              });
            }
          }
        });
      } catch (subErr) {
        if (subErr.name === "AbortError") throw subErr; // re-throw timeout
        console.warn("[PNCP] erro ao buscar itens de contratacao:", subErr.message);
      }
    }

    if (precos.length === 0) {
      console.log("[PNCP] nenhum preco encontrado apos filtrar itens");
      return null;
    }

    console.log("[PNCP] precos encontrados:", precos.length);

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
    if (err.name === "AbortError") {
      showToast("PNCP: timeout - tente novamente", "warning");
      console.error("[PNCP] timeout (15s) para:", itemNome);
    } else if (err.message && err.message.startsWith("HTTP")) {
      showToast(`PNCP indisponivel (${err.message}) - tente novamente`, "error");
      console.error("[PNCP] erro HTTP:", err.message, "para:", itemNome);
    } else {
      showToast("PNCP: erro de rede - verifique a conexao", "error");
      console.error("[PNCP] erro de rede:", err, "para:", itemNome);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
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

  // B2B Import (Story 4.30)
  const btnImportB2b = document.getElementById("btn-import-b2b");
  if (btnImportB2b) btnImportB2b.addEventListener("click", openB2bModal);
  const btnB2bFechar = document.getElementById("btn-b2b-fechar");
  if (btnB2bFechar) btnB2bFechar.addEventListener("click", closeB2bModal);
  const btnB2bBuscar = document.getElementById("btn-b2b-buscar");
  if (btnB2bBuscar) btnB2bBuscar.addEventListener("click", b2bBuscar);
  const btnB2bImportar = document.getElementById("btn-b2b-importar");
  if (btnB2bImportar) btnB2bImportar.addEventListener("click", b2bImportar);
  const b2bSelectAll = document.getElementById("b2b-select-all");
  if (b2bSelectAll) b2bSelectAll.addEventListener("change", () => {
    b2bParsedItems.forEach(i => i.selected = b2bSelectAll.checked);
    renderB2bPreview();
  });
  const modalB2b = document.getElementById("modal-b2b");
  if (modalB2b) modalB2b.addEventListener("click", (e) => { if (e.target === modalB2b) closeB2bModal(); });

  // Vincular Produto modal (Story 4.35) — click outside to close + search debounce
  const modalVincular = document.getElementById("modal-vincular-produto");
  if (modalVincular) modalVincular.addEventListener("click", (e) => { if (e.target === modalVincular) fecharModalVincular(); });
  initVincularBuscaHandler();

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

// ===== VINCULAR PRODUTO — Modal de Equivalências (Story 4.35) =====
let _vincularDescricao = "";  // description being linked
let _vincularOrcId = "";      // pre-orcamento id
let _vincularItemIdx = -1;    // item index
let _vincularDebounce = null;

window.abrirModalVincular = function(orcId, itemIdx) {
  const pre = preOrcamentos[orcId];
  if (!pre || !pre.itens[itemIdx]) return;
  const item = pre.itens[itemIdx];
  _vincularOrcId = orcId;
  _vincularItemIdx = itemIdx;
  _vincularDescricao = item.nome;

  // Set header
  const tituloEl = document.getElementById("vincular-titulo-desc");
  if (tituloEl) tituloEl.textContent = _vincularDescricao.slice(0, 80) + (_vincularDescricao.length > 80 ? "..." : "");

  // Hide create form if open
  const createForm = document.getElementById("vincular-criar-form");
  if (createForm) createForm.style.display = "none";

  // Auto-sugestão via findBestMestre
  const sugestaoDiv = document.getElementById("vincular-sugestao");
  if (sugestaoDiv) {
    sugestaoDiv.innerHTML = "";
    const result = findBestMestre(_vincularDescricao);
    if (result && result.score >= 0.5) {
      const mestre = result.mestre;
      // Find a banco item matching this mestre
      const mestreBp = bancoPrecos.itens.find(bp => normalizedText(bp.item) === normalizedText(mestre.nomeCanonico));
      const confianca = result.score >= 0.8 ? '<span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:4px;font-size:0.7rem;margin-left:4px;">Alta confianca</span>' : '';
      const skuInfo = mestreBp && mestreBp.sku ? ` | SKU: ${escapeHtml(mestreBp.sku)}` : "";
      const custoInfo = mestreBp && mestreBp.custoBase > 0 ? ` | ${brl.format(mestreBp.custoBase)}` : "";
      sugestaoDiv.innerHTML = `
        <div style="background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:10px;margin-bottom:12px;">
          <div style="font-size:0.8rem;font-weight:600;color:#065f46;margin-bottom:4px;">Sugestao automatica ${confianca}</div>
          <div style="font-size:0.85rem;">${escapeHtml(mestre.nomeCanonico)}${skuInfo}${custoInfo} <span style="color:#6b7280;font-size:0.75rem;">(${(result.score * 100).toFixed(0)}% match)</span></div>
          <button class="btn btn-sm btn-accent" onclick="aceitarSugestaoVincular('${escapeHtml(mestreBp ? mestreBp.id : mestre.id)}')" style="margin-top:6px;font-size:0.8rem;">Aceitar sugestao</button>
        </div>`;
    }
  }

  // Clear search and show all products initially
  const inputBusca = document.getElementById("input-busca-produto");
  if (inputBusca) inputBusca.value = "";
  renderResultadosProduto("");

  // Open modal
  const modal = document.getElementById("modal-vincular-produto");
  if (modal) modal.style.display = "flex";
};

window.aceitarSugestaoVincular = function(bpId) {
  const bp = bancoPrecos.itens.find(i => i.id === bpId);
  if (bp) {
    selecionarProdutoVincular(bp);
  }
};

function renderResultadosProduto(termo) {
  const container = document.getElementById("resultados-produto");
  if (!container) return;

  const norm = normalizedText(termo);
  let itens = bancoPrecos.itens;
  if (norm.length > 0) {
    itens = itens.filter(bp => {
      return normalizedText(bp.item).includes(norm) ||
             normalizedText(bp.nomeComercial || "").includes(norm) ||
             normalizedText(bp.sku || "").includes(norm);
    });
  }

  // Sort: items with sku/nomeComercial first, then alphabetical
  itens = [...itens].sort((a, b) => {
    const aHas = (a.sku || a.nomeComercial) ? 0 : 1;
    const bHas = (b.sku || b.nomeComercial) ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return (a.item || "").localeCompare(b.item || "");
  });

  // Limit to 50 results
  const limited = itens.slice(0, 50);

  if (limited.length === 0) {
    container.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;padding:12px;text-align:center;">Nenhum produto encontrado. Crie um novo abaixo.</div>';
    return;
  }

  container.innerHTML = '<table style="width:100%;font-size:0.82rem;"><thead><tr><th style="text-align:left;">Produto</th><th>SKU</th><th>Unid.</th><th>Custo</th><th></th></tr></thead><tbody>' +
    limited.map(bp => {
      const nome = escapeHtml(bp.nomeComercial || bp.item);
      const sku = escapeHtml(bp.sku || "—");
      const unid = escapeHtml(bp.unidade || bp.unidadeCompra || "—");
      const custo = bp.custoBase > 0 ? brl.format(bp.custoBase) : "—";
      return `<tr>
        <td style="padding:4px 6px;">${nome}</td>
        <td style="padding:4px 6px;color:#6b7280;">${sku}</td>
        <td style="padding:4px 6px;">${unid}</td>
        <td style="padding:4px 6px;">${custo}</td>
        <td style="padding:4px 6px;"><button class="btn btn-sm btn-accent" onclick="selecionarProdutoById('${escapeHtml(bp.id)}')" style="font-size:0.75rem;padding:2px 8px;">Selecionar</button></td>
      </tr>`;
    }).join("") +
    '</tbody></table>' +
    (itens.length > 50 ? `<div style="color:#6b7280;font-size:0.75rem;text-align:center;margin-top:4px;">Mostrando 50 de ${itens.length} resultados. Refine a busca.</div>` : "");
}

window.selecionarProdutoById = function(bpId) {
  const bp = bancoPrecos.itens.find(i => i.id === bpId);
  if (bp) selecionarProdutoVincular(bp);
};

function selecionarProdutoVincular(bp) {
  // Ensure the banco item has a sku
  if (!bp.sku) {
    bp.sku = gerarSkuSugerido(bp.nomeComercial || bp.item);
    saveBancoLocal();
  }

  // Set equivalencia
  setEquivalencia(_vincularDescricao, bp.sku);

  // Add this description to the bp's equivalencias array
  if (!bp.equivalencias) bp.equivalencias = [];
  const normDesc = normalizedText(_vincularDescricao);
  if (!bp.equivalencias.some(e => normalizedText(e) === normDesc)) {
    bp.equivalencias.push(_vincularDescricao);
    saveBancoLocal();
  }

  // Close modal and re-render
  fecharModalVincular();
  showToast(`Vinculado: "${_vincularDescricao.slice(0, 40)}..." -> "${bp.nomeComercial || bp.item}"`);
  renderPreOrcamentoItens();
}

function fecharModalVincular() {
  const modal = document.getElementById("modal-vincular-produto");
  if (modal) modal.style.display = "none";
  _vincularDescricao = "";
  _vincularOrcId = "";
  _vincularItemIdx = -1;
}
window.fecharModalVincular = fecharModalVincular;

function gerarSkuSugerido(nome) {
  return normalizedText(nome)
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 1)
    .slice(0, 3)
    .map(t => t.slice(0, 4).toUpperCase())
    .join("-") || ("SKU-" + Date.now().toString(36).slice(-4).toUpperCase());
}

// Toggle create form inside vincular modal
window.toggleCriarProdutoForm = function() {
  const form = document.getElementById("vincular-criar-form");
  if (!form) return;
  form.style.display = form.style.display === "none" ? "block" : "none";
  if (form.style.display === "block") {
    // Pre-fill with auto-generated SKU
    const inputNome = document.getElementById("vincular-criar-nome");
    const inputSku = document.getElementById("vincular-criar-sku");
    if (inputNome && !inputNome.value) inputNome.value = _vincularDescricao.slice(0, 60);
    if (inputSku && !inputSku.value) inputSku.value = gerarSkuSugerido(_vincularDescricao);
  }
};

window.criarEVincularProduto = function() {
  const nomeComercial = (document.getElementById("vincular-criar-nome")?.value || "").trim();
  if (!nomeComercial) { showToast("Nome comercial e obrigatorio."); return; }

  let sku = (document.getElementById("vincular-criar-sku")?.value || "").trim();
  if (!sku) sku = gerarSkuSugerido(nomeComercial);

  const unidadeCompra = document.getElementById("vincular-criar-unidade")?.value || "UN";
  const fornecedorPadrao = (document.getElementById("vincular-criar-fornecedor")?.value || "").trim();
  const custo = parseFloat(document.getElementById("vincular-criar-custo")?.value) || 0;

  // Check if SKU already exists
  if (bancoPrecos.itens.some(bp => bp.sku === sku)) {
    showToast("SKU ja existe. Escolha outro ou use Selecionar.");
    return;
  }

  // Create new banco item
  const novoBp = {
    id: "bp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
    item: nomeComercial,
    nomeComercial: nomeComercial,
    sku: sku,
    marca: "",
    grupo: "Material de Consumo Geral",
    unidade: unidadeCompra,
    unidadeCompra: unidadeCompra,
    custoBase: custo,
    margemPadrao: 0.30,
    precoReferencia: custo > 0 ? Math.round(custo * 1.30 * 100) / 100 : 0,
    ultimaCotacao: new Date().toISOString().slice(0, 10),
    fonte: fornecedorPadrao,
    fornecedorPadrao: fornecedorPadrao,
    custo: custo,
    propostas: [],
    concorrentes: [],
    custosFornecedor: fornecedorPadrao && custo > 0 ? [{
      fornecedor: fornecedorPadrao,
      preco: custo,
      data: new Date().toISOString().slice(0, 10)
    }] : [],
    equivalencias: [_vincularDescricao]
  };
  bancoPrecos.itens.push(novoBp);
  saveBancoLocal();

  // Set equivalencia
  setEquivalencia(_vincularDescricao, sku);

  // Close and re-render
  fecharModalVincular();
  showToast(`Produto "${nomeComercial}" criado e vinculado.`);
  renderPreOrcamentoItens();
};

// Debounced search handler for vincular modal
function initVincularBuscaHandler() {
  const input = document.getElementById("input-busca-produto");
  if (!input) return;
  input.addEventListener("input", function() {
    clearTimeout(_vincularDebounce);
    _vincularDebounce = setTimeout(() => {
      renderResultadosProduto(this.value);
    }, 300);
  });
}

// Initialize search handler after DOM load
document.addEventListener("DOMContentLoaded", initVincularBuscaHandler);

// ===== CONVERSAO E DEMANDA ENGINE (Story 4.36) =====

function converterDemanda(pedidoItens) {
  return pedidoItens.map(item => {
    const equiv = getEquivalencia(item.nome);
    if (!equiv) return { ...item, status: "sem_vinculo", produtoReal: null, qtdConvertida: 0, custoEstimado: 0 };

    const produto = getProdutoBySku(equiv);
    const fator = conversoes[normalizedText(item.nome)]?.fator || 1;
    const qtdConvertida = Math.ceil((item.quantidade || 0) / fator);
    const custo = produto ? (produto.custoBase || produto.custo || 0) * qtdConvertida : 0;

    return {
      ...item,
      status: "convertido",
      produtoReal: produto ? (produto.nomeComercial || produto.item) : equiv,
      skuProduto: equiv,
      qtdOriginal: item.quantidade,
      unidadeOriginal: item.unidade || "UN",
      qtdConvertida,
      unidadeCompra: produto?.unidade || produto?.unidadeCompra || "UN",
      fatorConversao: fator,
      custoUnitario: produto?.custoBase || produto?.custo || 0,
      custoEstimado: Math.round(custo * 100) / 100,
    };
  });
}

window.gerarDemanda = function(orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre) return;

  const itensConvertidos = converterDemanda(pre.itens || []);
  const semVinculo = itensConvertidos.filter(i => i.status === "sem_vinculo").length;

  const demanda = {
    id: "dem-" + Date.now().toString(36),
    orcamentoId: orcId,
    escola: pre.escola,
    municipio: pre.municipio,
    status: "rascunho",
    criadoEm: new Date().toISOString().slice(0, 10),
    itens: itensConvertidos,
    totalEstimado: itensConvertidos.reduce((s, i) => s + (i.custoEstimado || 0), 0),
  };

  demandas.push(demanda);
  saveDemandas();

  if (semVinculo > 0) {
    showToast(`Demanda criada: ${itensConvertidos.length} itens (${semVinculo} sem vinculo — vincule na aba Pre-Orcamento)`);
  } else {
    showToast(`Demanda criada: ${itensConvertidos.length} itens convertidos — ${brl.format(demanda.totalEstimado)}`);
  }
  renderSgd();
};

// Story 4.43: renderDemandas migrado para gdp-contratos.html
function renderDemandas() { /* noop — migrado para GDP */ }

window.verDemanda = function(demandaId) {
  const d = demandas.find(x => x.id === demandaId);
  if (!d) return;
  let msg = `Demanda ${d.id} — ${d.escola}\n\n`;
  d.itens.forEach((item, i) => {
    if (item.status === "convertido") {
      msg += `${i + 1}. ${item.nome} -> ${item.produtoReal}\n   ${item.qtdOriginal} ${item.unidadeOriginal} -> ${item.qtdConvertida} ${item.unidadeCompra} (fator: ${item.fatorConversao})\n   Custo: ${brl.format(item.custoEstimado)}\n\n`;
    } else {
      msg += `${i + 1}. [SEM VINCULO] ${item.nome}\n\n`;
    }
  });
  msg += `Total estimado: ${brl.format(d.totalEstimado)}`;
  alert(msg);
};

// ===== ESTOQUE E LISTA DE COMPRAS ENGINE (Story 4.37) =====

window.confirmarDemanda = function(demandaId) {
  const d = demandas.find(x => x.id === demandaId);
  if (!d || d.status !== "rascunho") return;
  if (!confirm(`Confirmar demanda ${d.id}? Vai debitar estoque e gerar lista de compras.`)) return;

  d.itens.forEach(item => {
    if (item.status !== "convertido" || !item.skuProduto) return;
    const sku = item.skuProduto;

    // Init stock if needed
    if (!estoque[sku]) estoque[sku] = { qtd: 0, qtdComprometida: 0, minimo: 0 };

    const disponivel = estoque[sku].qtd - estoque[sku].qtdComprometida;
    if (disponivel >= item.qtdConvertida) {
      // Enough stock — deduct
      estoque[sku].qtd -= item.qtdConvertida;
    } else {
      // Not enough — deduct what's available, add rest to purchase list
      const falta = item.qtdConvertida - Math.max(disponivel, 0);
      estoque[sku].qtd = Math.max(estoque[sku].qtd - item.qtdConvertida, 0);

      const produto = getProdutoBySku(sku);
      listaCompras.push({
        sku,
        produto: item.produtoReal || (produto ? (produto.item || sku) : sku),
        qtd: falta,
        fornecedor: produto?.fonte || produto?.fornecedorPadrao || "",
        custoUnitario: produto?.custoBase || produto?.custo || 0,
        custoTotal: Math.round(falta * (produto?.custoBase || produto?.custo || 0) * 100) / 100,
        demandaId: d.id,
        escola: d.escola,
        criadoEm: new Date().toISOString().slice(0, 10),
      });
    }
  });

  d.status = "confirmada";
  saveDemandas();
  saveEstoque();
  saveListaCompras();
  renderDemandas();
  renderEstoque();
  renderListaCompras();
  showToast(`Demanda confirmada. Estoque atualizado, ${listaCompras.length} item(ns) na lista de compras.`);
};

// Story 4.43: renderEstoque/renderListaCompras/lancamentoEstoque/exportarListaCompras migrados para gdp-contratos.html
function renderEstoque() { /* noop — migrado para GDP */ }
function renderListaCompras() { /* noop — migrado para GDP */ }
window.lancamentoEstoque = function() { /* noop — migrado para GDP */ };
window.exportarListaCompras = function() { /* noop — migrado para GDP */ };

window.imprimirListaCompras = function() {
  // Story 4.43: migrado para gdp-contratos.html — noop aqui
  const table = document.querySelector("#compras-section table");
  if (!table) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Lista de Compras</title>
    <style>body{font-family:Arial;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0}</style>
  </head><body><h2>Lista de Compras — ${new Date().toLocaleDateString("pt-BR")}</h2>${table.outerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
};

// ===== INIT =====
boot();
