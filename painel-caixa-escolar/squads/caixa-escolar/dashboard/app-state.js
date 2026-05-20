/* ===================================================================
   Painel do Fornecedor — Licit-AIX
   Vanilla JS | Multi-SRE — Fase 3
   =================================================================== */

// ===== LOGGING FALLBACKS (gdp-core.js may not be loaded in index.html) =====
if (typeof gdpLog === 'undefined') { var gdpLog = console.log.bind(console, '[GDP]'); }
if (typeof gdpWarn === 'undefined') { var gdpWarn = console.warn.bind(console, '[GDP]'); }

// ===== CONSTANTS =====
const STORAGE_KEY = "caixaescolar.preorcamentos.v1";
const BANCO_STORAGE_KEY = "caixaescolar.banco.v1";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v) => (v * 100).toFixed(0) + "%";
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

// ===== MULTI-SRE CONFIG (Story 13.1 — 47 SREs MG) =====
const SRE_CONFIGS = [
  { id: "almenara", nome: "Almenara", regiao: "Norte" },
  { id: "aracuai", nome: "Araçuaí", regiao: "Norte" },
  { id: "barbacena", nome: "Barbacena", regiao: "Central" },
  { id: "campo-belo", nome: "Campo Belo", regiao: "Oeste" },
  { id: "carangola", nome: "Carangola", regiao: "Leste" },
  { id: "caratinga", nome: "Caratinga", regiao: "Leste" },
  { id: "caxambu", nome: "Caxambu", regiao: "Sul" },
  { id: "conselheiro-lafaiete", nome: "Conselheiro Lafaiete", regiao: "Central" },
  { id: "coronel-fabriciano", nome: "Coronel Fabriciano", regiao: "Leste" },
  { id: "curvelo", nome: "Curvelo", regiao: "Central" },
  { id: "diamantina", nome: "Diamantina", regiao: "Norte" },
  { id: "divinopolis", nome: "Divinópolis", regiao: "Oeste" },
  { id: "governador-valadares", nome: "Governador Valadares", regiao: "Leste" },
  { id: "guanhaes", nome: "Guanhães", regiao: "Leste" },
  { id: "itajuba", nome: "Itajubá", regiao: "Sul" },
  { id: "ituiutaba", nome: "Ituiutaba", regiao: "Triângulo" },
  { id: "janauba", nome: "Janaúba", regiao: "Norte" },
  { id: "januaria", nome: "Januária", regiao: "Norte" },
  { id: "juiz-de-fora", nome: "Juiz de Fora", regiao: "Zona da Mata" },
  { id: "leopoldina", nome: "Leopoldina", regiao: "Zona da Mata" },
  { id: "manhuacu", nome: "Manhuaçu", regiao: "Leste" },
  { id: "metropolitana-a", nome: "Metropolitana A (BH)", regiao: "Metropolitana" },
  { id: "metropolitana-b", nome: "Metropolitana B (BH)", regiao: "Metropolitana" },
  { id: "metropolitana-c", nome: "Metropolitana C (BH)", regiao: "Metropolitana" },
  { id: "monte-carmelo", nome: "Monte Carmelo", regiao: "Triângulo" },
  { id: "montes-claros", nome: "Montes Claros", regiao: "Norte" },
  { id: "muriae", nome: "Muriaé", regiao: "Zona da Mata" },
  { id: "nova-era", nome: "Nova Era", regiao: "Central" },
  { id: "ouro-preto", nome: "Ouro Preto", regiao: "Central" },
  { id: "para-de-minas", nome: "Pará de Minas", regiao: "Central" },
  { id: "paracatu", nome: "Paracatu", regiao: "Noroeste" },
  { id: "passos", nome: "Passos", regiao: "Sul" },
  { id: "patos-de-minas", nome: "Patos de Minas", regiao: "Alto Paranaíba" },
  { id: "patrocinio", nome: "Patrocínio", regiao: "Alto Paranaíba" },
  { id: "pirapora", nome: "Pirapora", regiao: "Norte" },
  { id: "pocos-de-caldas", nome: "Poços de Caldas", regiao: "Sul" },
  { id: "ponte-nova", nome: "Ponte Nova", regiao: "Zona da Mata" },
  { id: "pouso-alegre", nome: "Pouso Alegre", regiao: "Sul" },
  { id: "sao-joao-del-rei", nome: "São João del Rei", regiao: "Central" },
  { id: "sao-sebastiao-do-paraiso", nome: "São Sebastião do Paraíso", regiao: "Sul" },
  { id: "sete-lagoas", nome: "Sete Lagoas", regiao: "Central" },
  { id: "teofilo-otoni", nome: "Teófilo Otoni", regiao: "Norte" },
  { id: "uba", nome: "Ubá", regiao: "Zona da Mata" },
  { id: "uberaba", nome: "Uberaba", regiao: "Triângulo" },
  { id: "uberlandia", nome: "Uberlândia", regiao: "Triângulo" },
  { id: "unai", nome: "Unaí", regiao: "Noroeste" },
  { id: "varginha", nome: "Varginha", regiao: "Sul" },
];
const SRE_DEFAULT_ATIVAS = ["uberaba", "uberlandia", "passos"]; // backward compat
const SRE_PERFIS = {
  rapido: ["uberaba", "uberlandia", "passos"],
  regional: ["uberaba", "uberlandia", "passos", "ituiutaba", "patos-de-minas", "patrocinio", "monte-carmelo", "campo-belo", "divinopolis", "varginha"],
  completo: SRE_CONFIGS.map(s => s.id)
};
let allSreData = []; // loaded SRE data objects

// Story 13.1: Get active SREs from empresa config or default
function getSresAtivas() {
  try {
    const emp = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
    if (Array.isArray(emp.sresAtivas) && emp.sresAtivas.length > 0) return emp.sresAtivas;
  } catch(_) {}
  return SRE_DEFAULT_ATIVAS;
}

function setSresAtivas(ids) {
  try {
    const emp = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
    emp.sresAtivas = ids;
    localStorage.setItem("nexedu.empresa", JSON.stringify(emp));
    schedulCloudSync();
  } catch(_) {}
}

function getActiveSreConfigs() {
  const ativas = getSresAtivas();
  return SRE_CONFIGS.filter(s => ativas.includes(s.id));
}

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

// ===== CENTRAL DE PRODUTOS v2 + CUSTOS FORNECEDORES (Story 13.2) =====
const CENTRAL_PRODUTOS_KEY = "intel.central-produtos.v2";
const CUSTOS_FORNECEDORES_KEY = "intel.custos-fornecedores.v1";
let centralProdutos = []; // Array of product objects (base fixa)
let custosFornecedores = []; // Array of cost records (valores dinâmicos)

function loadCentralProdutos() {
  try {
    const raw = JSON.parse(localStorage.getItem(CENTRAL_PRODUTOS_KEY) || '{}');
    centralProdutos = raw.items || (Array.isArray(raw) ? raw : []);
  } catch(_) { centralProdutos = []; }
}

function saveCentralProdutos() {
  const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: centralProdutos };
  localStorage.setItem(CENTRAL_PRODUTOS_KEY, JSON.stringify(wrapped));
  schedulCloudSync();
}

function loadCustosFornecedores() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOS_FORNECEDORES_KEY) || '{}');
    custosFornecedores = raw.items || (Array.isArray(raw) ? raw : []);
  } catch(_) { custosFornecedores = []; }
}

function saveCustosFornecedores() {
  const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: custosFornecedores };
  localStorage.setItem(CUSTOS_FORNECEDORES_KEY, JSON.stringify(wrapped));
  schedulCloudSync();
}

// Get costs for a product, sorted by date (newest first)
function getCustosForProduto(produtoId) {
  return custosFornecedores
    .filter(c => c.produto_id === produtoId)
    .sort((a, b) => (b.data_coleta || "").localeCompare(a.data_coleta || ""));
}

// Get the best (lowest) current cost for a product
function getMenorCusto(produtoId) {
  const custos = getCustosForProduto(produtoId).filter(c => c.custo > 0);
  return custos.length > 0 ? Math.min(...custos.map(c => c.custo)) : 0;
}

// Get most recent cost for a product
function getCustoMaisRecente(produtoId) {
  const custos = getCustosForProduto(produtoId);
  return custos.length > 0 ? custos[0].custo : 0;
}

// Add a cost record
function addCustoFornecedor(produtoId, fornecedor, custo, origem, confiabilidade, arquivoId, extras) {
  const CONFIABILIDADE_MAP = { nf: 1.0, excel: 0.95, manual: 0.90, b2b: 0.85, pdf: 0.85, 'pdf-ocr': 0.50, api: 0.90, marketplace: 0.85 };
  const ex = extras || {};
  custosFornecedores.push({
    id: "CUSTO-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
    produto_id: produtoId,
    fornecedor: fornecedor || "",
    custo: custo,
    data_coleta: new Date().toISOString().slice(0, 10),
    validade: null,
    regiao: ex.regiao || "",
    origem: origem || "manual",
    confiabilidade: confiabilidade || CONFIABILIDADE_MAP[origem] || 0.90,
    arquivo_id: arquivoId || null,
    frete_estimado: ex.frete_estimado || null,
    prazo_pagamento_dias: ex.prazo_pagamento_dias || null,
    descricao_original: ex.descricao_original || null
  });
  // Note: caller should call saveCustosFornecedores() after batch operations
  // For single manual adds (from UI), save immediately
  if (!extras || !extras._batch) saveCustosFornecedores();
}

// Story 13.2: Migrate old data format to new central+custos structure
function migrarParaCentralV2() {
  if (centralProdutos.length > 0) return; // already migrated

  // Source 1: gdp.estoque-intel.produtos.v1
  let oldProdutos = [];
  try {
    const raw = JSON.parse(localStorage.getItem('gdp.estoque-intel.produtos.v1') || '[]');
    oldProdutos = Array.isArray(raw) ? raw : (raw.items || raw.itens || []);
  } catch(_) {}

  // Source 2: caixaescolar.banco.v1
  let oldBanco = [];
  try {
    const raw = JSON.parse(localStorage.getItem('caixaescolar.banco.v1') || '{}');
    oldBanco = raw.itens || (Array.isArray(raw) ? raw : []);
  } catch(_) {}

  const migrated = new Set();

  // Migrate estoque-intel produtos
  oldProdutos.forEach(p => {
    const id = p.id || ("PROD-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6));
    centralProdutos.push({
      id: id,
      nome: p.nome || p.descricao || "",
      unidade_base: p.unidade_base || p.unidade || "UN",
      categoria: p.categoria || p.grupo || "",
      sku: p.sku || "",
      ncm: p.ncm || "",
      origem: p.origem || "0",
      produto_critico: p.produto_critico || false,
      ativo: true,
      criadoEm: p.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    });
    // Migrate embedded costs
    if (p.preco_custo > 0 || p.custoBase > 0) {
      addCustoFornecedor(id, "migrado", p.preco_custo || p.custoBase || 0, "manual", 0.90, null);
    }
    migrated.add((p.nome || p.descricao || "").toLowerCase());
  });

  // Migrate banco items (skip duplicates by name)
  oldBanco.forEach(b => {
    const nome = (b.item || b.nome || "").toLowerCase();
    if (!nome || migrated.has(nome)) return;
    const id = b.id || b.sku || ("PROD-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6));
    centralProdutos.push({
      id: id,
      nome: b.item || b.nome || "",
      unidade_base: b.unidade || "UN",
      categoria: b.grupo || "",
      sku: b.sku || "",
      ncm: b.ncm || "",
      origem: "0",
      produto_critico: false,
      ativo: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    });
    // Migrate custosFornecedor array
    (b.custosFornecedor || []).forEach(cf => {
      custosFornecedores.push({
        id: "CUSTO-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
        produto_id: id,
        fornecedor: cf.fornecedor || "",
        custo: cf.preco || 0,
        data_coleta: cf.data || new Date().toISOString().slice(0, 10),
        validade: null,
        regiao: "",
        origem: cf.origem || "manual",
        confiabilidade: cf.confianca || 0.90,
        arquivo_id: cf.arquivoId || null
      });
    });
    if (b.custoBase > 0 && (!b.custosFornecedor || b.custosFornecedor.length === 0)) {
      addCustoFornecedor(id, "migrado", b.custoBase, "manual", 0.90, null);
    }
    migrated.add(nome);
  });

  if (centralProdutos.length > 0) {
    saveCentralProdutos();
    saveCustosFornecedores();
    gdpLog(`[Migração v2] ${centralProdutos.length} produtos, ${custosFornecedores.length} custos migrados`);
  }
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

// ===== SUPABASE CLOUD SYNC (uses centralized config from supabase-config.js) =====
const SUPABASE_URL = window.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SUPABASE_KEY = window.SUPABASE_KEY || "sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR";
const SHARED_SYNC_KEYS = new Set([
  "caixaescolar.banco.v1", "caixaescolar.preorcamentos.v1", "caixaescolar.resultados.v1",
  "caixaescolar.contratos.v1", "caixaescolar.orcamentos", "caixaescolar.descartados",
  "caixaescolar.itens-mestres", "caixaescolar.arquivos-importados", "caixaescolar.agentes.v1",
  // gdp.contratos.v1, gdp.pedidos.v1, gdp.notas-fiscais.v1, gdp.contas-receber.v1,
  // gdp.contas-pagar.v1, gdp.entregas.provas.v1, gdp.usuarios.v1
  // — removed: these entities now have dedicated Supabase tables
  "gdp.notas-entrada.v1", "gdp.integracoes.v1", "gdp.estoque.movimentos.v1",
  "gdp.equivalencias.v1",
  "gdp.conversoes.v1", "gdp.demandas.v1",
  "gdp.estoque.v1", "gdp.lista-compras.v1",
  // Intel Preços v2 — Central + Custos + Histórico
  "intel.central-produtos.v2", "intel.custos-fornecedores.v1", "intel.historico-licitacoes.v1",
  // Intel Preços — legacy sync
  "gdp.estoque-intel.produtos.v1", "gdp.estoque-intel.embalagens.v1",
  "gdp.estoque-intel.pedidos.v1", "gdp.estoque-intel.pedido-itens.v1",
  "gdp.estoque-intel.movimentacoes.v1", "gdp.estoque-intel.fornecedores.v1",
  "gdp.estoque-intel.compras.v1"
]);

// ===== HISTORICO LICITACOES (Story 13.7) =====
const HISTORICO_LICIT_KEY = "intel.historico-licitacoes.v1";

function loadHistoricoLicitacoes() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORICO_LICIT_KEY) || '{}');
    return raw.items || (Array.isArray(raw) ? raw : []);
  } catch(_) { return []; }
}

function saveHistoricoLicitacoes(items) {
  const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: items };
  localStorage.setItem(HISTORICO_LICIT_KEY, JSON.stringify(wrapped));
  schedulCloudSync();
}

function addHistoricoLicitacao(entry, _skipSave) {
  const items = loadHistoricoLicitacoes();
  entry.id = entry.id || ("HIST-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5));
  items.push(entry);
  if (!_skipSave) saveHistoricoLicitacoes(items);
  return entry;
}
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
  "caixaescolar.agentes.v1",
  // gdp.contratos.v1, gdp.pedidos.v1, gdp.notas-fiscais.v1, gdp.contas-receber.v1,
  // gdp.contas-pagar.v1, gdp.entregas.provas.v1, gdp.usuarios.v1
  // — removed: these entities now have dedicated Supabase tables
  "gdp.notas-entrada.v1", "gdp.integracoes.v1", "gdp.estoque.movimentos.v1",
  "gdp.equivalencias.v1",
  "gdp.conversoes.v1", "gdp.demandas.v1",
  "gdp.estoque.v1", "gdp.lista-compras.v1",
  // Intel Preços v2 — Central + Custos + Histórico
  "intel.central-produtos.v2", "intel.custos-fornecedores.v1", "intel.historico-licitacoes.v1",
  // Intel Preços — legacy sync
  "gdp.estoque-intel.produtos.v1", "gdp.estoque-intel.embalagens.v1",
  "gdp.estoque-intel.pedidos.v1", "gdp.estoque-intel.pedido-itens.v1",
  "gdp.estoque-intel.movimentacoes.v1", "gdp.estoque-intel.fornecedores.v1",
  "gdp.estoque-intel.compras.v1",
  "nexedu.config.contas-bancarias", "nexedu.config.fiscal", "nexedu.config.bank-api"
];
