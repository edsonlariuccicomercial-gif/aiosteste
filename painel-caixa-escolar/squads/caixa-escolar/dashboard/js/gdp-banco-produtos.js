// ===== CENTRAL DE PRODUTOS UNIFICADA (Story 8.1 — Epic 8, G2) =====
// Fonte única de verdade para produtos, preços, custos e inteligência competitiva.
// Substitui o antigo "Banco de Preços" (app-banco.js) que agora é facade.
const PRODUTOS_KEY = "gdp.produtos.v1";
// FIX: usar var para evitar temporal dead zone — initGDP e renderAll
// chamam loadBancoProdutos() antes desta linha no fluxo de execução
var bancoProdutos = { updatedAt: "", itens: [] };
var _editProdutoId = null;
var _importProdutosBuffer = [];

// Schema unificado defaults (FR-G2-001)
var PRODUTO_DEFAULTS = {
  id: null,
  descricao: "",
  sku: "",
  ncm: "",
  unidade: "UN",
  marca: "",
  // --- Campos migrados do Banco de Preços (Story 8.1) ---
  custoBase: null,           // number — Custo de aquisição (C.A.)
  precoReferencia: null,     // number — Preço de venda sugerido
  margemAlvo: null,          // number — % margem alvo
  custosFornecedor: [],      // array — Histórico de custos [{data, valor, fornecedor}]
  concorrentes: [],          // array — Preços de concorrentes [{nome, preco, edital, data}]
  propostas: [],             // array — Histórico de propostas [{preco, escola, edital, data}]
  historicoResultados: [],   // array — Resultados ganho/perdido [{resultado, delta, data}]
  precoReferenciaHistorico: null, // number — Média de preços ganhos
  taxaConversao: null,       // number — % de propostas ganhas
  grupo: "",                 // string — Grupo de despesa (alimentação, limpeza, etc.)
  fonte: "",                 // string — Origem dos dados (b2b, excel, nf, manual)
  criadoEm: null,
  atualizadoEm: null
};

// Garante que produto tem todos os campos do schema unificado
function getProdutoComDefaults(produto) {
  var result = {};
  for (var key in PRODUTO_DEFAULTS) {
    if (produto && produto[key] !== undefined) {
      result[key] = produto[key];
    } else {
      result[key] = Array.isArray(PRODUTO_DEFAULTS[key]) ? [] : PRODUTO_DEFAULTS[key];
    }
  }
  return result;
}

function sanitizeBancoProduto(item, idx) {
  const cleaned = stripLegacyErpFields(item || {});
  cleaned.descricao = cleaned.descricao || cleaned.nome || cleaned.item || `Produto ${idx + 1}`;
  cleaned.unidade = cleaned.unidade || "UN";
  cleaned.sku = normalizeInternalSku("BANK", cleaned, idx);
  // Migrar campo 'item' do Banco de Preços para 'descricao'
  if (!cleaned.descricao && cleaned.item) cleaned.descricao = cleaned.item;
  return getProdutoComDefaults(cleaned);
}

var _centralLoaded = false;

function loadBancoProdutos() {
  let dirty = false;
  try { bancoProdutos = JSON.parse(localStorage.getItem(PRODUTOS_KEY)) || { updatedAt: "", itens: [] }; } catch(_) { bancoProdutos = { updatedAt: "", itens: [] }; }
  if (!bancoProdutos.itens) bancoProdutos.itens = [];
  bancoProdutos.itens = bancoProdutos.itens.map((item, idx) => {
    const before = JSON.stringify(item);
    const after = sanitizeBancoProduto(item, idx);
    if (!dirty && JSON.stringify(after) !== before) dirty = true;
    return after;
  });
  if (dirty) {
    bancoProdutos.updatedAt = new Date().toISOString();
    try { localStorage.setItem(PRODUTOS_KEY, JSON.stringify(bancoProdutos)); } catch (_) {}
  }
  // Story 8.2: Auto-migrar Banco de Preços na primeira carga
  if (!_centralLoaded) {
    _centralLoaded = true;
    try { migrarBancoPrecoParaCentral(); } catch(_) {}
  }
}

function saveBancoProdutos() {
  bancoProdutos.itens = (bancoProdutos.itens || []).map(sanitizeBancoProduto);
  bancoProdutos.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(PRODUTOS_KEY, JSON.stringify(bancoProdutos));
  } catch (e) {
    console.error("[GDP] Falha ao salvar Banco de Produtos:", e);
    showToast("Erro ao salvar produto — localStorage cheio?", 4000);
    return;
  }
  if (typeof schedulCloudSync === 'function') schedulCloudSync();
}

function renderBancoProdutos() {
  loadBancoProdutos();
  const busca = (document.getElementById("busca-produto")?.value || "").toLowerCase();
  let itens = bancoProdutos.itens;
  if (busca) itens = itens.filter(p => (p.descricao || "").toLowerCase().includes(busca) || (p.sku || "").toLowerCase().includes(busca));

  const tbody = document.getElementById("banco-produtos-tbody");
  const empty = document.getElementById("banco-produtos-empty");
  const tabCount = document.getElementById("tab-count-banco-produtos");
  if (tabCount) tabCount.textContent = bancoProdutos.itens.length;

  if (itens.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  tbody.innerHTML = itens.map((p, idx) => {
    const custo = p.custoBase ? brl.format(p.custoBase) : '-';
    const preco = p.precoReferencia ? brl.format(p.precoReferencia) : '-';
    const margem = (p.custoBase && p.precoReferencia) ? (((p.precoReferencia - p.custoBase) / p.custoBase) * 100).toFixed(1) + '%' : '-';
    const margemClass = (p.custoBase && p.precoReferencia) ? (((p.precoReferencia - p.custoBase) / p.custoBase) >= 0.2 ? 'text-accent' : ((p.precoReferencia - p.custoBase) / p.custoBase) >= 0.1 ? '' : 'text-danger') : '';
    const grupo = p.grupo ? `<span class="badge badge-muted" style="font-size:.65rem">${esc(p.grupo)}</span>` : '';
    return `<tr>
    <td class="text-center"><input type="checkbox" class="banco-prod-chk" value="${p.id}"></td>
    <td class="text-center">${idx + 1}</td>
    <td>${esc(p.descricao)} ${grupo}</td>
    <td class="font-mono">${esc(p.sku || '-')}</td>
    <td class="font-mono" style="font-size:.78rem">${esc(p.ncm || '-')}</td>
    <td class="text-center">${esc(p.unidade)}</td>
    <td class="text-right font-mono">${custo}</td>
    <td class="text-right font-mono">${preco}</td>
    <td class="text-right ${margemClass}">${margem}</td>
  </tr>`;
  }).join("");
}

function toggleSelectAllBancoProd(checked) {
  document.querySelectorAll('.banco-prod-chk').forEach(cb => cb.checked = checked);
}

function editarProdutoSelecionado() {
  const sel = [...document.querySelectorAll('.banco-prod-chk:checked')].map(cb => cb.value);
  if (sel.length === 0) { showToast("Selecione um produto para editar.", 3000); return; }
  if (sel.length > 1) { showToast("Selecione apenas um produto para editar.", 3000); return; }
  editarProduto(sel[0]);
}

function excluirProdutosSelecionados() {
  const sel = [...document.querySelectorAll('.banco-prod-chk:checked')].map(cb => cb.value);
  if (sel.length === 0) { showToast("Selecione produtos para excluir.", 3000); return; }
  if (!confirm(`Excluir ${sel.length} produto(s) selecionado(s)?`)) return;
  loadBancoProdutos();
  bancoProdutos.itens = bancoProdutos.itens.filter(p => !sel.includes(p.id));
  saveBancoProdutos();
  renderBancoProdutos();
  showToast(`${sel.length} produto(s) excluído(s).`);
}

function importarProdutoUnificado(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    importarProdutosPDF(file);
  } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
    importarProdutosExcel(file);
  } else {
    showToast("Formato não suportado. Use .xlsx, .xls, .csv ou .pdf", 3000);
  }
}

function novoProdutoManual() {
  _editProdutoId = null;
  document.getElementById("modal-produto-titulo").textContent = "Novo Produto";
  document.getElementById("prod-descricao").value = "";
  document.getElementById("prod-sku").value = "";
  document.getElementById("prod-ncm").value = "";
  document.getElementById("prod-unidade").value = "";
  const criticoEl = document.getElementById("prod-critico");
  if (criticoEl) criticoEl.checked = false;
  const radioComum = document.querySelector('input[name="prod-tipo"][value="comum"]');
  if (radioComum) radioComum.checked = true;
  document.getElementById("modal-produto").classList.remove("hidden");
}

function editarProduto(id) {
  loadBancoProdutos();
  const p = bancoProdutos.itens.find(x => x.id === id);
  if (!p) return;
  _editProdutoId = id;
  document.getElementById("modal-produto-titulo").textContent = "Editar Produto";
  document.getElementById("prod-descricao").value = p.descricao || "";
  document.getElementById("prod-sku").value = p.sku || "";
  document.getElementById("prod-ncm").value = p.ncm || "";
  document.getElementById("prod-unidade").value = p.unidade || "";
  // FR-004: Produto comum/crítico
  const criticoEl = document.getElementById("prod-critico");
  if (criticoEl) criticoEl.checked = !!p.produto_critico;
  const radioComum = document.querySelector('input[name="prod-tipo"][value="comum"]');
  const radioCritico = document.querySelector('input[name="prod-tipo"][value="critico"]');
  if (radioComum && radioCritico) {
    if (p.produto_critico) { radioCritico.checked = true; } else { radioComum.checked = true; }
  }
  document.getElementById("modal-produto").classList.remove("hidden");
}

function salvarProduto() {
  const descricao = (document.getElementById("prod-descricao").value || "").trim();
  const sku = (document.getElementById("prod-sku").value || "").trim();
  const ncm = (document.getElementById("prod-ncm").value || "").trim();
  const unidade = document.getElementById("prod-unidade").value;
  // FR-013: Produto crítico (conversão de gramatura)
  const prodCriticoEl = document.getElementById("prod-critico");
  const produtoCritico = prodCriticoEl ? prodCriticoEl.checked : false;

  if (!descricao) { showToast("Descricao e obrigatoria.", 3000); return; }
  if (!unidade) { showToast("Unidade e obrigatoria.", 3000); return; }

  loadBancoProdutos();

  if (sku) {
    const existing = bancoProdutos.itens.find(x => x.sku === sku && x.id !== _editProdutoId);
    if (existing) {
      if (!confirm(`Ja existe um produto com SKU "${sku}" (${existing.descricao}). Deseja atualizar?`)) return;
      existing.descricao = descricao;
      existing.ncm = ncm;
      existing.unidade = unidade;
      saveBancoProdutos();
      fecharModalProduto();
      renderBancoProdutos();
      showToast("Produto atualizado!");
      return;
    }
  }

  if (_editProdutoId) {
    const p = bancoProdutos.itens.find(x => x.id === _editProdutoId);
    if (p) {
      p.descricao = descricao; p.sku = sku; p.ncm = ncm; p.unidade = unidade;
      p.produto_critico = produtoCritico;
      p.atualizadoEm = new Date().toISOString();
    }
  } else {
    bancoProdutos.itens.push(getProdutoComDefaults({
      id: 'PROD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      descricao, sku, ncm, unidade,
      produto_critico: produtoCritico,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    }));
  }

  saveBancoProdutos();
  fecharModalProduto();
  renderBancoProdutos();
  showToast(_editProdutoId ? "Produto atualizado!" : "Produto adicionado!");

  // Story 4.16: Auto-link produto recem-criado ao sync modal
  if (typeof window._syncCriarIdx === 'number' && _syncContratoId) {
    const newProd = bancoProdutos.itens[bancoProdutos.itens.length - 1];
    if (newProd && !_editProdutoId) {
      selecionarBuscaSync(window._syncCriarIdx, newProd.id);
    }
    window._syncCriarIdx = undefined;
  }
}

function excluirProduto(id) {
  loadBancoProdutos();
  const p = bancoProdutos.itens.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Excluir produto "${p.descricao}"?`)) return;
  bancoProdutos.itens = bancoProdutos.itens.filter(x => x.id !== id);
  saveBancoProdutos();
  renderBancoProdutos();
  showToast("Produto excluido.");
}

function fecharModalProduto() {
  document.getElementById("modal-produto").classList.add("hidden");
  _editProdutoId = null;
}

// ===== FR-019: Criação rápida de produto (direto do contrato) =====
// Cria produto na Central sem abrir modal, retorna o ID para vincular ao contrato.
function criarProdutoRapido(dados) {
  if (!dados || !dados.nome) return null;
  loadBancoProdutos();
  // Buscar duplicata por nome normalizado
  var nomeNorm = (dados.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  var duplicata = bancoProdutos.itens.find(function (p) {
    var pNorm = (p.descricao || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return pNorm === nomeNorm;
  });
  if (duplicata) return duplicata;
  var sku = dados.sku || gdpGerarSkuSugerido(dados.nome);
  var novo = getProdutoComDefaults({
    id: 'PROD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    descricao: dados.nome,
    sku: sku,
    ncm: dados.ncm || '',
    unidade: dados.unidade || 'UN',
    grupo: dados.categoria || '',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  });
  bancoProdutos.itens.push(novo);
  saveBancoProdutos();
  return novo;
}

// Busca produtos por nome (busca simples para sugestão — FR-005)
function buscarProdutosPorNome(termo) {
  if (!termo) return [];
  loadBancoProdutos();
  var termoNorm = (termo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return bancoProdutos.itens.filter(function (p) {
    var descNorm = (p.descricao || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return descNorm.includes(termoNorm);
  }).slice(0, 10);
}

// ===== Story 8.2: Migração Banco de Preços → Central de Produtos =====
// Executa uma vez para trazer dados do antigo bancoPrecos (caixaescolar.banco.v1)
// para a Central unificada (gdp.produtos.v1). Idempotente — não duplica.
function migrarBancoPrecoParaCentral() {
  const BANCO_KEY = "caixaescolar.banco.v1";
  const MIGRATION_FLAG = "gdp.banco-migrated-to-central";

  // Skip se já migrou
  if (localStorage.getItem(MIGRATION_FLAG)) return { migrated: 0, skipped: 'already_done' };

  let bancoData;
  try {
    bancoData = JSON.parse(localStorage.getItem(BANCO_KEY) || 'null');
  } catch(_) { return { migrated: 0, error: 'parse_error' }; }

  if (!bancoData || !bancoData.itens || !bancoData.itens.length) {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    return { migrated: 0, skipped: 'empty_source' };
  }

  loadBancoProdutos();
  let migrated = 0, skipped = 0;

  for (const item of bancoData.itens) {
    // Verificar duplicidade por nome normalizado
    const normName = (item.item || item.descricao || "").toLowerCase().trim();
    const exists = bancoProdutos.itens.find(p =>
      (p.descricao || "").toLowerCase().trim() === normName ||
      (p.sku && item.sku && p.sku === item.sku)
    );

    if (exists) {
      // Merge: enriquecer produto existente com dados de pricing
      if (item.custoBase && !exists.custoBase) exists.custoBase = item.custoBase;
      if (item.precoReferencia && !exists.precoReferencia) exists.precoReferencia = item.precoReferencia;
      if (item.custosFornecedor?.length && !exists.custosFornecedor?.length) exists.custosFornecedor = item.custosFornecedor;
      if (item.concorrentes?.length && !exists.concorrentes?.length) exists.concorrentes = item.concorrentes;
      if (item.propostas?.length && !exists.propostas?.length) exists.propostas = item.propostas;
      if (item.grupo && !exists.grupo) exists.grupo = item.grupo;
      if (item.marca && !exists.marca) exists.marca = item.marca;
      exists.atualizadoEm = new Date().toISOString();
      skipped++;
    } else {
      // Criar novo produto na Central com dados completos
      bancoProdutos.itens.push(getProdutoComDefaults({
        id: 'PROD-MIG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        descricao: item.item || item.descricao || "Produto migrado",
        sku: item.sku || "",
        ncm: item.ncm || "",
        unidade: item.unidade || "UN",
        marca: item.marca || "",
        custoBase: item.custoBase || null,
        precoReferencia: item.precoReferencia || null,
        margemAlvo: item.margemPadrao || null,
        custosFornecedor: item.custosFornecedor || [],
        concorrentes: item.concorrentes || [],
        propostas: item.propostas || [],
        grupo: item.grupo || "",
        fonte: "migracao_banco_precos",
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      }));
      migrated++;
    }
  }

  saveBancoProdutos();
  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
  console.log(`[Central] Migração concluída: ${migrated} novos, ${skipped} enriquecidos de ${bancoData.itens.length} itens do Banco de Preços`);
  return { migrated, enriched: skipped, total: bancoData.itens.length };
}

// Facade: expõe bancoPrecos como view da Central (Story 8.3 — compatibilidade)
function getCentralComoBancoPrecos() {
  loadBancoProdutos();
  return {
    updatedAt: bancoProdutos.updatedAt,
    itens: bancoProdutos.itens.map(p => ({
      id: p.id,
      item: p.descricao,
      descricao: p.descricao,
      sku: p.sku,
      ncm: p.ncm,
      unidade: p.unidade,
      marca: p.marca,
      grupo: p.grupo,
      custoBase: p.custoBase || 0,
      precoReferencia: p.precoReferencia || 0,
      margemPadrao: p.margemAlvo || 0,
      custosFornecedor: p.custosFornecedor || [],
      concorrentes: p.concorrentes || [],
      propostas: p.propostas || [],
      fonte: p.fonte || ""
    }))
  };
}

// ===== Story 4.15: Limpar Todo Banco de Produtos (AC-1) =====
function limparTodoBancoProdutos() {
  loadBancoProdutos();
  const total = bancoProdutos.itens.length;
  if (total === 0) { showToast('Banco ja esta vazio.'); return; }
  if (!confirm(`Tem certeza que deseja excluir TODOS os ${total} produtos do banco?`)) return;
  if (!confirm('CONFIRMACAO FINAL: Esta acao nao pode ser desfeita. Continuar?')) return;
  bancoProdutos = { updatedAt: new Date().toISOString(), itens: [] };
  saveBancoProdutos();
  renderBancoProdutos();
  showToast('Banco de produtos limpo com sucesso!');
}

// ===== Story 4.15: Importar Produtos do Tiny (AC-2) =====
let _importTinyBuffer = [];

async function importarProdutosTiny(apenasNovos) {
  notifyErpSyncDisabled("Banco de produtos");
  return;
  const modal = document.getElementById("modal-import-tiny");
  if (!modal) { showToast("Modal de importacao nao encontrado.", 3000); return; }
  const tbody = document.getElementById("import-tiny-tbody");
  const info = document.getElementById("import-tiny-info");
  const actions = document.getElementById("import-tiny-actions");
  tbody.innerHTML = "";
  info.textContent = "Buscando produtos do Tiny ERP...";
  actions.classList.add("hidden");
  modal.classList.remove("hidden");
  _importTinyBuffer = [];

  // Load banco to check existing SKUs
  loadBancoProdutos();
  const skusExistentes = new Set(bancoProdutos.itens.map(p => (p.sku || "").toUpperCase()).filter(Boolean));

  try {
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= totalPaginas) {
      info.textContent = `Carregando pagina ${pagina}... ${_importTinyBuffer.length} produtos encontrados`;
      const resp = await fetch("/api/tiny-produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listar", pesquisa: "", pagina })
      });
      const json = await resp.json();
      if (!json.success) { showToast("Erro ao buscar produtos: " + (json.error || "desconhecido"), 4000); break; }
      const ret = json.data?.retorno || {};
      totalPaginas = parseInt(ret.numero_paginas || "1");
      const produtos = ret.produtos || [];
      if (produtos.length === 0) break;
      for (const p of produtos) {
        const prod = p.produto || p;
        const codigo = (prod.codigo || "").toUpperCase();
        // Se "apenas novos", pular produtos que ja estao no banco
        if (apenasNovos && skusExistentes.has(codigo)) continue;
        _importTinyBuffer.push({
          nome: prod.nome || "",
          codigo: prod.codigo || "",
          ncm: prod.ncm || "",
          unidade: prod.unidade || "",
          id_tiny: prod.id || ""
        });
      }
      pagina++;
      if (pagina <= totalPaginas) await new Promise(r => setTimeout(r, 1500));
    }
  } catch (err) {
    showToast("Erro de conexao ao buscar produtos: " + err.message, 4000);
  }

  if (_importTinyBuffer.length === 0) {
    info.textContent = apenasNovos ? "Nenhum produto novo encontrado no Tiny." : "Nenhum produto encontrado no Tiny.";
    return;
  }

  // Buscar NCM via produto.obter.php para produtos sem NCM
  const semNcm = _importTinyBuffer.filter(p => !p.ncm && p.id_tiny);
  if (semNcm.length > 0) {
    info.textContent = `Buscando NCM de ${semNcm.length} produtos...`;
    let fetched = 0;
    for (const p of semNcm) {
      try {
        fetched++;
        info.textContent = `Buscando NCM... ${fetched}/${semNcm.length}`;
        const resp = await fetch("/api/tiny-produtos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "obter", id: p.id_tiny })
        });
        const json = await resp.json();
        if (json.success) {
          const fullProd = json.data?.retorno?.produto || {};
          if (fullProd.ncm) p.ncm = fullProd.ncm;
          if (fullProd.unidade && !p.unidade) p.unidade = fullProd.unidade;
        }
      } catch (_) { /* best-effort */ }
      if (fetched < semNcm.length) await new Promise(r => setTimeout(r, 1500));
    }
  }

  info.textContent = `${_importTinyBuffer.length} produtos${apenasNovos ? ' novos' : ''} encontrados. Selecione os que deseja importar:`;
  tbody.innerHTML = _importTinyBuffer.map((p, i) => `<tr>
    <td class="text-center"><input type="checkbox" class="import-tiny-chk" data-idx="${i}" checked></td>
    <td>${esc(p.nome)}</td>
    <td class="font-mono">${esc(p.codigo || '-')}</td>
    <td class="font-mono" style="font-size:.78rem">${esc(p.ncm || '-')}</td>
    <td class="text-center">${esc(p.unidade || '-')}</td>
  </tr>`).join("");
  actions.classList.remove("hidden");
}

function confirmarImportacaoTiny() {
  const checks = document.querySelectorAll('.import-tiny-chk:checked');
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx));
  if (indices.length === 0) { showToast("Selecione ao menos um produto.", 3000); return; }

  loadBancoProdutos();
  let atualizados = 0, novos = 0;

  for (const idx of indices) {
    const p = _importTinyBuffer[idx];
    if (!p) continue;
    const existente = bancoProdutos.itens.find(x => x.sku && x.sku === p.codigo);
    if (existente) {
      existente.descricao = p.nome;
      existente.ncm = p.ncm;
      existente.unidade = p.unidade;
      atualizados++;
    } else {
      bancoProdutos.itens.push({
        id: 'PROD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        descricao: p.nome,
        sku: p.codigo,
        ncm: p.ncm,
        unidade: p.unidade,
        criadoEm: new Date().toISOString()
      });
      novos++;
    }
  }

  saveBancoProdutos();
  renderBancoProdutos();
  document.getElementById("modal-import-tiny").classList.add("hidden");
  _importTinyBuffer = [];
  showToast(`Importacao concluida! ${novos} novos, ${atualizados} atualizados.`);
}

function fecharImportTiny() {
  document.getElementById("modal-import-tiny").classList.add("hidden");
  _importTinyBuffer = [];
}

function toggleSelectAllImportTiny(checked) {
  document.querySelectorAll('.import-tiny-chk').forEach(cb => cb.checked = checked);
}

// ===== Story 4.15/4.16: Sync Banco — Comparacao Contrato vs Banco =====
let _syncBancoContratoId = null;
let _syncBancoMatches = [];

function calcularSimilaridade(a, b) {
  const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  // FIX: palavras >= 3 chars para evitar match em "IN", "DE", "DO", "COM"
  const keywords = s => normalize(s).split(/\s+/).filter(w => w.length >= 3);
  const nA = normalize(a), nB = normalize(b);
  if (nA === nB) return { score: 100, tipo: 'exato' };
  // Substring match só se a string menor tiver >= 5 chars (evita falsos com nomes curtos)
  if (nA.length >= 5 && nB.length >= 5 && (nA.includes(nB) || nB.includes(nA))) return { score: 90, tipo: 'exato' };
  const kwA = keywords(a), kwB = keywords(b);
  if (kwA.length === 0 || kwB.length === 0) return { score: 0, tipo: 'sem-match' };
  // FIX: Jaccard — intersecção / união (bidirecional, sem startsWith fuzzy)
  const intersection = kwA.filter(w => kwB.includes(w)).length;
  const union = new Set([...kwA, ...kwB]).size;
  const score = union > 0 ? Math.round(intersection / union * 100) : 0;
  return { score, tipo: score >= 80 ? 'exato' : score >= 60 ? 'parcial' : 'sem-match' };
}

function abrirSyncBanco(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  loadBancoProdutos();
  const bp = bancoProdutos.itens || [];
  if (bp.length === 0) { showToast("Banco de Produtos vazio. Importe produtos do Tiny primeiro.", 4000); return; }

  _syncBancoContratoId = contratoId;
  _syncBancoMatches = [];

  // Para cada item do contrato, buscar melhor match + alternativas no banco
  c.itens.forEach((item, idx) => {
    const matches = [];
    bp.forEach(prod => {
      const sim = calcularSimilaridade(item.descricao, prod.descricao);
      if (sim.score >= 10) matches.push({ ...prod, score: sim.score, tipo: sim.tipo });
    });
    matches.sort((a, b) => b.score - a.score);
    const best = matches[0] || null;
    // FIX: mostrar até 30 alternativas (antes era 10) para não esconder produto correto
    const alternativas = matches.slice(1, 30);
    _syncBancoMatches.push({
      idx, item, best, alternativas,
      aceito: best && best.score >= 80,
      escolhido: best || null
    });
  });

  renderSyncBanco();
  document.getElementById("modal-sync-banco").classList.remove("hidden");
}

function renderSyncBanco() {
  const body = document.getElementById("sync-banco-body");
  const exatos = _syncBancoMatches.filter(m => m.best && m.best.tipo === 'exato').length;
  const parciais = _syncBancoMatches.filter(m => m.best && m.best.tipo === 'parcial').length;
  const semMatch = _syncBancoMatches.filter(m => !m.best || m.best.tipo === 'sem-match').length;
  const aceitos = _syncBancoMatches.filter(m => m.aceito).length;

  document.getElementById("sync-banco-info").textContent =
    `${_syncBancoMatches.length} itens | ${exatos} exatos | ${parciais} parciais | ${semMatch} sem match | ${aceitos} aceitos`;

  body.innerHTML = _syncBancoMatches.map((m, i) => {
    const cor = m.best ? (m.best.tipo === 'exato' ? 'var(--accent)' : m.best.tipo === 'parcial' ? 'var(--warning)' : 'var(--danger)') : 'var(--danger)';
    const bgCor = m.best ? (m.best.tipo === 'exato' ? 'rgba(78,201,138,.08)' : m.best.tipo === 'parcial' ? 'rgba(244,185,66,.08)' : 'rgba(255,111,111,.06)') : 'rgba(255,111,111,.06)';
    const scoreLabel = m.best ? `${m.best.score}%` : '0%';

    // Alternativas dropdown
    const altOptions = (m.alternativas || []).map((alt, ai) =>
      `<option value="${ai}">${esc(alt.descricao)} (${alt.score}%) — SKU: ${esc(alt.sku || '-')}</option>`
    ).join('');

    // Detect if fields will change
    const skuMuda = m.best && m.best.sku && m.best.sku !== (m.item.sku || '');
    const ncmMuda = m.best && m.best.ncm && m.best.ncm !== (m.item.ncm || '');
    const unidMuda = m.best && m.best.unidade && m.best.unidade !== (m.item.unidade || '');
    const mudaAlgo = skuMuda || ncmMuda || unidMuda;

    return `<div style="border:1px solid ${cor};border-radius:10px;padding:.8rem;margin-bottom:.6rem;background:${bgCor}">
      <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.5rem">
        <input type="checkbox" class="sync-banco-chk" data-idx="${i}" ${m.aceito ? 'checked' : ''} onchange="_syncBancoMatches[${i}].aceito=this.checked" style="width:18px;height:18px">
        <span style="font-size:.7rem;color:${cor};font-weight:700;background:${bgCor};padding:2px 8px;border-radius:99px;border:1px solid ${cor}">${scoreLabel} ${m.best ? m.best.tipo.toUpperCase() : 'SEM MATCH'}</span>
        <span style="font-size:.72rem;color:var(--mut)">#${m.item.num}</span>
        ${mudaAlgo ? '<span style="font-size:.65rem;color:var(--warning);font-weight:700">VAI ATUALIZAR</span>' : '<span style="font-size:.65rem;color:var(--dim)">sem alteracao</span>'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div style="padding:.6rem;background:rgba(0,0,0,.2);border-radius:8px">
          <div style="font-size:.65rem;color:var(--mut);margin-bottom:.4rem;font-weight:700;text-transform:uppercase">Item do Contrato (atual)</div>
          <div style="font-size:.82rem;font-weight:600;margin-bottom:.3rem">${esc(m.item.descricao)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.3rem;font-size:.72rem;color:var(--mut)">
            <span>Unid: <b style="color:${unidMuda ? 'var(--danger)' : 'var(--text)'}">${esc(m.item.unidade || '-')}</b></span>
            <span>NCM: <b style="color:${ncmMuda ? 'var(--danger)' : 'var(--text)'}">${esc(m.item.ncm || '-')}</b></span>
            <span>SKU: <b style="color:${skuMuda ? 'var(--danger)' : 'var(--text)'}">${esc(m.item.sku || '-')}</b></span>
          </div>
        </div>
        <div style="padding:.6rem;background:rgba(0,0,0,.2);border-radius:8px">
          <div style="font-size:.65rem;color:var(--mut);margin-bottom:.4rem;font-weight:700;text-transform:uppercase">Match no Banco de Produtos</div>
          ${m.best ? `
            <div style="font-size:.82rem;font-weight:600;margin-bottom:.3rem">${esc(m.best.descricao)}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.3rem;font-size:.72rem;color:var(--mut)">
              <span>Unid: <b style="color:${unidMuda ? 'var(--accent)' : 'var(--text)'}">${esc(m.best.unidade || '-')}</b>${unidMuda ? ' ←' : ''}</span>
              <span>NCM: <b style="color:${ncmMuda ? 'var(--accent)' : 'var(--text)'}">${esc(m.best.ncm || '-')}</b>${ncmMuda ? ' ←' : ''}</span>
              <span>SKU: <b style="color:${skuMuda ? 'var(--accent)' : 'var(--text)'}">${esc(m.best.sku || '-')}</b>${skuMuda ? ' ←' : ''}</span>
            </div>
          ` : `<div style="font-size:.82rem;color:var(--danger)">Nenhum produto semelhante encontrado</div>`}
          <div style="margin-top:.4rem">
            ${m.alternativas && m.alternativas.length > 0 ? `
              <select style="width:100%;font-size:.72rem;padding:3px 6px;background:var(--bg);color:var(--text);border:1px solid var(--bdr);border-radius:6px;margin-bottom:4px" onchange="trocarMatchSyncBanco(${i}, this.value)">
                <option value="-1">Trocar match...</option>
                ${altOptions}
              </select>
            ` : ''}
            <input type="text" placeholder="Buscar produto no banco..." style="width:100%;font-size:.72rem;padding:4px 8px;background:var(--bg);color:var(--text);border:1px solid var(--bdr);border-radius:6px" oninput="buscarProdutoSyncBanco(${i}, this.value)" id="sync-banco-busca-${i}">
            <div id="sync-banco-busca-results-${i}" style="max-height:120px;overflow-y:auto"></div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function trocarMatchSyncBanco(idx, altIdx) {
  const m = _syncBancoMatches[idx];
  if (!m) return;
  const ai = parseInt(altIdx);
  if (ai < 0) return; // "Manter match acima" selected, no change

  // Get the selected alternative BEFORE modifying the array
  const selected = m.alternativas[ai];
  if (!selected) return;

  // Build new alternativas: remove selected, add old best
  const newAlts = m.alternativas.filter((_, i) => i !== ai);
  if (m.best) newAlts.unshift(m.best);

  // Apply swap
  m.best = { ...selected }; // Deep copy to avoid reference issues
  m.alternativas = newAlts;
  m.escolhido = m.best;
  m.aceito = true;

  console.log(`[SyncBanco] Troca #${m.item.num}: "${m.item.descricao}" → novo match: "${m.best.descricao}" SKU:${m.best.sku} NCM:${m.best.ncm} Unid:${m.best.unidade}`);

  renderSyncBanco();
}

function buscarProdutoSyncBanco(idx, query) {
  loadBancoProdutos();
  const bp = bancoProdutos.itens || [];
  const q = (query || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const results = document.getElementById(`sync-banco-busca-results-${idx}`);
  if (q.length < 2) { results.innerHTML = ""; return; }
  const filtered = bp.filter(p =>
    (p.descricao || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
    (p.sku || "").toLowerCase().includes(q)
  ).slice(0, 15);
  if (filtered.length === 0) {
    results.innerHTML = `<div style="font-size:.72rem;color:var(--mut);padding:4px 8px">Nenhum produto encontrado</div>`;
    return;
  }
  results.innerHTML = filtered.map(p =>
    `<div style="font-size:.72rem;padding:4px 8px;cursor:pointer;border-radius:4px;margin:1px 0;border:1px solid transparent" onmouseover="this.style.background='rgba(78,201,138,.15)';this.style.borderColor='var(--accent)'" onmouseout="this.style.background='';this.style.borderColor='transparent'" onclick="selecionarBuscaSyncBanco(${idx}, '${(p.id || '').replace(/'/g, "\\'")}')">
      <strong>${esc(p.descricao)}</strong> <span style="font-family:monospace;color:var(--accent)">${esc(p.sku || '')}</span> | ${esc(p.unidade || '')} | NCM: ${esc(p.ncm || '-')}
    </div>`
  ).join("");
}

function selecionarBuscaSyncBanco(idx, prodId) {
  loadBancoProdutos();
  const prod = bancoProdutos.itens.find(p => p.id === prodId);
  if (!prod) return;
  const m = _syncBancoMatches[idx];
  if (!m) return;

  // Colocar best antigo nas alternativas
  const newAlts = m.alternativas ? [...m.alternativas] : [];
  if (m.best) newAlts.unshift(m.best);

  m.best = { ...prod, score: 100, tipo: 'exato' };
  m.alternativas = newAlts;
  m.escolhido = m.best;
  m.aceito = true;

  // Limpar busca
  const input = document.getElementById(`sync-banco-busca-${idx}`);
  if (input) input.value = "";
  const results = document.getElementById(`sync-banco-busca-results-${idx}`);
  if (results) results.innerHTML = "";

  renderSyncBanco();
}

function syncBancoSelecionarTodos(checked) {
  _syncBancoMatches.forEach(m => { if (m.best && m.best.score >= 60) m.aceito = checked; });
  renderSyncBanco();
}

async function aplicarSyncBanco() {
  const contratoId = _syncBancoContratoId;
  if (!contratoId) { console.error("[SyncBanco] Sem contrato ativo"); return; }

  // FIX: Recarregar contratos do localStorage ANTES de aplicar (evita dados stale)
  loadData();
  const c = contratos.find(x => x.id === contratoId);
  if (!c) { console.error("[SyncBanco] Contrato nao encontrado:", contratoId); return; }

  let synced = 0;
  const changes = [];
  _syncBancoMatches.forEach((m, i) => {
    if (!m.aceito || !m.best) return;
    // FIX: Buscar item por num (não por índice, que pode mudar)
    const item = c.itens.find(it => it.num === m.item.num) || c.itens[m.idx];
    if (!item) { console.warn("[SyncBanco] Item nao encontrado:", m.item.num); return; }

    const antes = { sku: item.sku, ncm: item.ncm, unidade: item.unidade };

    // Copy all non-empty fields from banco product
    if (m.best.sku) item.sku = m.best.sku;
    if (m.best.ncm) item.ncm = m.best.ncm;
    if (m.best.unidade) item.unidade = m.best.unidade;
    synced++;

    changes.push(`#${item.num} SKU:${antes.sku}→${item.sku} NCM:${antes.ncm}→${item.ncm} Unid:${antes.unidade}→${item.unidade}`);
    console.log(`[SyncBanco] #${item.num} "${item.descricao}" ← banco "${m.best.descricao}" | SKU: ${antes.sku}→${item.sku} | NCM: ${antes.ncm}→${item.ncm} | Unid: ${antes.unidade}→${item.unidade}`);
  });

  if (synced > 0) {
    // FIX: Salvar diretamente no localStorage com timestamp futuro para GARANTIR que local vence o cloud
    const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items: contratos };
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify(wrapped));
    console.log(`[SyncBanco] Gravado direto no localStorage. ${synced} itens. updatedAt: ${wrapped.updatedAt}`);

    // FIX: Cloud sync BLOQUEANTE — aguarda completar antes de liberar UI
    if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
    try {
      await syncToCloud();
      console.log("[SyncBanco] Cloud sync completado com sucesso.");
    } catch(e) {
      console.warn("[SyncBanco] Cloud sync falhou:", e.message, "— dados estao salvos localmente.");
    }

    // FIX: Verificar que localStorage ainda tem os dados corretos após cloud sync
    const verify = JSON.parse(localStorage.getItem(CONTRACTS_KEY));
    const verifyContract = (verify?.items || []).find(x => x.id === contratoId);
    if (verifyContract) {
      const verifyItem = verifyContract.itens.find(it => changes.length > 0);
      console.log("[SyncBanco] Verificacao pos-sync: contrato encontrado no localStorage ✓");
    } else {
      console.error("[SyncBanco] ALERTA: contrato NAO encontrado no localStorage apos sync! Regravando...");
      localStorage.setItem(CONTRACTS_KEY, JSON.stringify(wrapped));
    }
  }

  // Close modal
  document.getElementById("modal-sync-banco").classList.add("hidden");
  _syncBancoMatches = [];
  _syncBancoContratoId = null;

  // FIX: Recarregar do localStorage (que JÁ tem dados corretos) e renderizar
  loadData();
  renderAll();
  abrirContrato(contratoId);
  showToast(`${synced} item(ns) sincronizados com o Banco de Produtos!`, 4000);
  if (changes.length > 0) console.log("[SyncBanco] Resumo:\n" + changes.join("\n"));
}

function fecharSyncBanco() {
  document.getElementById("modal-sync-banco").classList.add("hidden");
  _syncBancoContratoId = null;
  _syncBancoMatches = [];
}

// ===== Story 4.15: Classificar NCM IA no Banco de Produtos =====
async function classificarNcmBancoProdutos() {
  loadBancoProdutos();
  const semNcm = bancoProdutos.itens.filter(p => !p.ncm || p.ncm.length < 8);
  if (semNcm.length === 0) { showToast("Todos os produtos ja tem NCM!"); return; }

  // Camada 1: mapa local (findNcmLocal)
  let preenchidosLocal = 0;
  semNcm.forEach(p => {
    if (p.ncm && p.ncm.length >= 8) return;
    const local = findNcmLocal(p.descricao);
    if (local) { p.ncm = local.ncm; preenchidosLocal++; }
  });
  if (preenchidosLocal > 0) saveBancoProdutos();

  // Camada 2: IA para os que sobraram
  const aindaSemNcm = bancoProdutos.itens.filter(p => !p.ncm || p.ncm.length < 8);
  if (aindaSemNcm.length === 0) {
    renderBancoProdutos();
    showToast(`NCM preenchido para ${preenchidosLocal} produtos (mapa local)!`);
    return;
  }

  showToast(`${preenchidosLocal} via mapa local. Classificando ${aindaSemNcm.length} com IA...`, 3000);

  for (let start = 0; start < aindaSemNcm.length; start += 20) {
    const batch = aindaSemNcm.slice(start, start + 20);
    try {
      const resp = await fetch("/api/ai-ncm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map(p => ({ descricao: p.descricao })) })
      });
      const data = await resp.json();
      if (data.success && data.results) {
        data.results.forEach((r, idx) => {
          if (r.ncm && batch[idx]) batch[idx].ncm = r.ncm;
        });
      }
    } catch (err) {
      showToast("Erro na classificacao IA: " + err.message, 4000);
    }
  }

  saveBancoProdutos();
  renderBancoProdutos();
  const classified = aindaSemNcm.filter(p => p.ncm && p.ncm.length >= 8).length;
  showToast(`NCM: ${preenchidosLocal} mapa local + ${classified} IA = ${preenchidosLocal + classified} preenchidos!`, 5000);
}

// ===== Story 4.15: Enviar Produto ao ERP (AC-3) =====
async function enviarProdutoERP() {
  notifyErpSyncDisabled("Produto");
  return;
  const descricao = (document.getElementById("prod-descricao").value || "").trim();
  const sku = (document.getElementById("prod-sku").value || "").trim();
  const ncm = (document.getElementById("prod-ncm").value || "").trim();
  const unidade = document.getElementById("prod-unidade").value;

  if (!descricao) { showToast("Descricao e obrigatoria.", 3000); return; }
  if (!unidade) { showToast("Unidade e obrigatoria.", 3000); return; }

  const btn = document.getElementById("btn-enviar-erp");
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Enviando...";

  try {
    // 1. Save locally first
    salvarProduto();

    // 2. Send to Tiny ERP
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cadastrar",
        itens: [{
          num: 1,
          descricao: descricao,
          unidade: unidade,
          ncm: ncm,
          codigo: sku || "",
          precoUnitario: 0
        }]
      })
    });
    const json = await resp.json();

    if (json.success && json.results && json.results.length > 0) {
      const result = json.results[0];
      if (result.status === "ok" || result.status === "existente") {
        // Update SKU in banco if Tiny returned one
        if (result.sku) {
          loadBancoProdutos();
          const prod = bancoProdutos.itens.find(p => p.descricao === descricao);
          if (prod && !prod.sku) {
            prod.sku = result.sku;
            saveBancoProdutos();
            renderBancoProdutos();
          }
        }
        const msg = result.status === "existente"
          ? `Produto ja existe no Tiny (SKU: ${result.sku}). Banco local atualizado.`
          : `Produto cadastrado no Tiny! SKU: ${result.sku}`;
        showToast(msg, 5000);
      } else {
        showToast(`Erro ao cadastrar no Tiny: ${result.error || "desconhecido"}`, 5000);
      }
    } else {
      showToast("Erro ao enviar ao Tiny: " + (json.error || "resposta inesperada"), 5000);
    }
  } catch (err) {
    showToast("Erro de conexao ao enviar ao Tiny: " + err.message, 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
}

function exportarProdutosCSV() {
  loadBancoProdutos();
  if (bancoProdutos.itens.length === 0) { showToast("Nenhum produto para exportar.", 3000); return; }
  const header = "Descricao;SKU;Unidade";
  const rows = bancoProdutos.itens.map(p => `"${(p.descricao||'').replace(/"/g,'""')}";"${p.sku||''}";"${p.unidade||''}"`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `banco-produtos-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${bancoProdutos.itens.length} produtos exportados!`);
}

// ===== IMPORT EXCEL PRODUTOS =====
async function importarProdutosExcel(file) {
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (rows.length < 2) { showToast("Planilha vazia ou sem dados.", 3000); return; }

    // Auto-detect columns
    const headers = rows[0].map(h => String(h).toLowerCase().trim());
    const descIdx = headers.findIndex(h => /descri|produto|item|nome/.test(h));
    const skuIdx = headers.findIndex(h => /c[oó]digo|sku|cod|ref/.test(h));
    const ncmIdx = headers.findIndex(h => /ncm|classifica|fiscal/.test(h));
    const undIdx = headers.findIndex(h => /unid|un$|und|medida/.test(h));

    if (descIdx === -1) { showToast("Coluna de descricao nao encontrada. Verifique os headers.", 5000); return; }

    _importProdutosBuffer = [];
    for (let i = 1; i < rows.length; i++) {
      const desc = String(rows[i][descIdx] || "").trim();
      if (!desc) continue;
      _importProdutosBuffer.push({
        descricao: desc,
        sku: skuIdx >= 0 ? String(rows[i][skuIdx] || "").trim() : "",
        ncm: ncmIdx >= 0 ? String(rows[i][ncmIdx] || "").trim() : "",
        unidade: undIdx >= 0 ? String(rows[i][undIdx] || "").trim().toUpperCase() : "UN"
      });
    }

    if (_importProdutosBuffer.length === 0) { showToast("Nenhum produto encontrado na planilha.", 3000); return; }
    mostrarImportPreview("Excel: " + file.name, _importProdutosBuffer);
  } catch (err) {
    showToast("Erro ao parsear Excel: " + err.message, 5000);
  }
}

// ===== IMPORT PDF PRODUTOS =====
function extractPdfLines(content) {
  const items = content.items.filter(i => i.str && i.str.trim());
  if (items.length === 0) return [];

  // Sort by Y descending (top to bottom), then X ascending (left to right)
  items.sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 2) return dy;
    return a.transform[4] - b.transform[4];
  });

  // Group items into lines by Y-position (tolerance based on font height)
  const lines = [];
  let currentLine = [];
  let currentY = items[0].transform[5];

  for (const item of items) {
    const y = item.transform[5];
    const fontSize = Math.abs(item.transform[3] || item.transform[0] || 10);
    const tolerance = Math.max(fontSize * 0.5, 4);

    if (Math.abs(y - currentY) > tolerance) {
      if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.transform[4] - b.transform[4]);
        lines.push(currentLine.map(i => i.str).join(" "));
      }
      currentLine = [];
      currentY = y;
    }
    currentLine.push(item);
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.transform[4] - b.transform[4]);
    lines.push(currentLine.map(i => i.str).join(" "));
  }
  return lines;
}

function parseProdutosFromLines(lines) {
  const produtos = [];
  const reUnidade = /\b(UN|UND|UNID|UNIDADE|KG|GR|LT|L|ML|PCT|PC|PÇ|CX|CJ|FD|DZ|RL|SC|BD|GL|TB|FR|PT|MT|PAR|RESMA|LITRO|PACOTE|CAIXA|FARDO|ROLO|GALAO|FRASCO|POTE|SACO|BALDE|GARRAFA|LATA)\b/i;
  const reHeader = /descri[cç][aã]o|^produto$|^item$|^unid|^quant|^pre[cç]o|^total|^valor|^marca|cnpj|razao.social|endere[cç]o|telefone|fone|email|p[aá]gina|^lote$|^#$/i;
  const reNumPrefix = /^(\d{1,5})[\s.\-–)]+(.+)/;
  const reSku = /\b(\d{4,13})\b/;
  const reNcm = /\b(\d{4}[.\s]?\d{2}[.\s]?\d{2})\b/;
  const rePrice = /\b\d{1,3}[.,]\d{2}\b/g;

  // Detect if text is tabular (many lines start with numbers)
  const numLines = lines.filter(l => reNumPrefix.test(l.trim())).length;
  const isTabular = numLines > 2 && numLines > lines.length * 0.2;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 4) continue;
    if (reHeader.test(line)) continue;
    // Skip lines that are purely numeric or price lines
    if (/^\d[\d\s.,]*$/.test(line)) continue;
    // Skip common non-product lines
    if (/^(total|subtotal|obs|observa|pagamento|vencimento|data|emissao)/i.test(line)) continue;

    let rest = line;
    let num = '';

    // For tabular: extract item number
    if (isTabular) {
      const m = reNumPrefix.exec(line);
      if (!m) continue;
      num = m[1];
      rest = m[2].trim();
    }

    // Must have meaningful text (at least 3 alpha chars)
    if (rest.replace(/[^a-zA-ZÀ-ú]/g, '').length < 3) continue;

    // Extract unit
    let unidade = "UN";
    const mu = reUnidade.exec(rest);
    if (mu) { unidade = mu[1].toUpperCase(); }

    // Extract NCM (pattern: XXXX.XX.XX or XXXXXXXX)
    let ncm = "";
    const mn = reNcm.exec(rest);
    if (mn) { ncm = mn[1].replace(/\s/g, ''); rest = rest.replace(mn[0], ' '); }

    // Extract SKU (4-13 digit number, not a price, not NCM)
    let sku = "";
    const cleanForSku = rest.replace(rePrice, '');
    const ms = reSku.exec(cleanForSku);
    if (ms && ms[1] !== ncm.replace(/\./g, '')) sku = ms[1];

    // Clean description: remove prices, quantities at end, extra spaces
    let descricao = rest
      .replace(rePrice, ' ')         // remove prices
      .replace(/R\$\s*/gi, '')       // remove R$
      .replace(/\b\d{1,5}\s*$/g, '') // remove trailing quantity numbers
      .replace(reUnidade, ' ')       // remove unit from description
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Remove leading/trailing dashes, dots
    descricao = descricao.replace(/^[\s.\-–]+|[\s.\-–]+$/g, '').trim();
    if (descricao.length < 3) continue;

    produtos.push({ descricao, sku, ncm, unidade });
  }
  return produtos;
}

async function importarProdutosPDF(file) {
  if (!file) return;
  try {
    showToast("Processando PDF... Aguarde.", 5000);
    if (!window.pdfjsLib) { showToast("Biblioteca PDF nao carregada. Recarregue a pagina.", 3000); return; }
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    // Extract lines from each page with proper Y-grouping
    let allLines = [];
    for (let pg = 1; pg <= pdf.numPages; pg++) {
      const page = await pdf.getPage(pg);
      const content = await page.getTextContent();
      const pageLines = extractPdfLines(content);
      allLines = allLines.concat(pageLines);
    }

    if (allLines.length === 0) { showToast("PDF sem texto reconhecivel. Tente converter para Excel.", 5000); return; }

    const allText = allLines.join("\n");

    // Try AI API first, fallback to local parser
    let produtos = [];
    try {
      const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "" : window.location.origin;
      const resp = await fetch(baseUrl + "/api/ai-parse-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: allText.slice(0, 15000),
          formato: "banco_produtos",
          fornecedor: "",
          contexto: "Extrair lista de produtos com campos: descricao, codigo/SKU, unidade. Retorne JSON: {\"produtos\": [{\"descricao\": \"...\", \"sku\": \"...\", \"unidade\": \"...\"}]}"
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.produtos && Array.isArray(result.produtos)) produtos = result.produtos;
        else if (result.itens && Array.isArray(result.itens)) produtos = result.itens.map(i => ({ descricao: i.descricao || i.item || i.nome || "", sku: i.sku || i.codigo || "", unidade: i.unidade || i.un || "UN" }));
      }
    } catch(_) { /* API indisponivel, usar parser local */ }

    // Fallback: local line-by-line parser
    if (produtos.length === 0) {
      produtos = parseProdutosFromLines(allLines);
    }

    if (produtos.length === 0) { showToast("Nenhum produto reconhecido no PDF. Tente importar via Excel.", 5000); return; }
    _importProdutosBuffer = produtos.map(p => ({
      descricao: String(p.descricao || "").trim(),
      sku: String(p.sku || p.codigo || "").trim(),
      ncm: String(p.ncm || "").trim(),
      unidade: String(p.unidade || "UN").trim().toUpperCase()
    })).filter(p => p.descricao);

    if (_importProdutosBuffer.length === 0) { showToast("Nenhum produto reconhecido no PDF. Tente importar via Excel.", 5000); return; }
    mostrarImportPreview("PDF: " + file.name + " (" + allLines.length + " linhas)", _importProdutosBuffer);
  } catch (err) {
    console.error("PDF import error:", err);
    showToast("Erro ao processar PDF: " + err.message, 5000);
  }
}

function mostrarImportPreview(titulo, itens) {
  document.getElementById("import-produtos-titulo").textContent = "Preview — " + titulo;
  document.getElementById("import-produtos-info").textContent = itens.length + " produtos encontrados";
  document.getElementById("import-produtos-tbody").innerHTML = itens.map((p, i) =>
    `<tr><td class="text-center">${i+1}</td><td>${esc(p.descricao)}</td><td class="font-mono">${esc(p.sku || '-')}</td><td class="font-mono" style="font-size:.78rem">${esc(p.ncm || '-')}</td><td class="text-center">${esc(p.unidade)}</td></tr>`
  ).join("");
  document.getElementById("modal-import-produtos").classList.remove("hidden");
}

function fecharImportPreview() {
  document.getElementById("modal-import-produtos").classList.add("hidden");
  _importProdutosBuffer = [];
}

function confirmarImportProdutos() {
  if (_importProdutosBuffer.length === 0) return;
  loadBancoProdutos();
  let added = 0, updated = 0;
  for (const p of _importProdutosBuffer) {
    if (p.sku) {
      const existing = bancoProdutos.itens.find(x => x.sku === p.sku);
      if (existing) { existing.descricao = p.descricao; existing.ncm = p.ncm || existing.ncm || ''; existing.unidade = p.unidade; updated++; continue; }
    }
    bancoProdutos.itens.push({
      id: 'PROD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + added,
      descricao: p.descricao, sku: p.sku, ncm: p.ncm || '', unidade: p.unidade,
      criadoEm: new Date().toISOString()
    });
    added++;
  }
  saveBancoProdutos();
  fecharImportPreview();
  renderBancoProdutos();
  showToast(`Importacao concluida: ${added} novos, ${updated} atualizados.`);
}

// ===== SYNC ITENS CONTRATO ↔ BANCO DE PRODUTOS =====
function normalizarTexto(s) {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[:\-\/\\.,;!?()[\]{}'"]+/g, ' ')       // pontuacao → espaco
    .replace(/\s+/g, ' ').trim();                     // colapsar espacos
}

function calcJaccard(s1, s2) {
  const w1 = new Set(normalizarTexto(s1).split(' ').filter(Boolean));
  const w2 = new Set(normalizarTexto(s2).split(' ').filter(Boolean));
  if (w1.size === 0 && w2.size === 0) return 1;
  if (w1.size === 0 || w2.size === 0) return 0;
  let inter = 0;
  for (const w of w1) if (w2.has(w)) inter++;
  return inter / (w1.size + w2.size - inter);
}

function calcLevenshtein(s1, s2) {
  s1 = normalizarTexto(s1); s2 = normalizarTexto(s2);
  if (s1 === s2) return 1;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1;
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastVal = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) { costs[j] = j; }
      else if (j > 0) {
        let newVal = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1]) newVal = Math.min(newVal, lastVal, costs[j]) + 1;
        costs[j - 1] = lastVal;
        lastVal = newVal;
      }
    }
    if (i > 0) costs[shorter.length] = lastVal;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

function calcSimilaridade(s1, s2) {
  const jaccard = calcJaccard(s1, s2);
  const levenshtein = calcLevenshtein(s1, s2);
  return jaccard * 0.6 + levenshtein * 0.4;
}

function abrirModalSync(contratoId) {
  loadBancoProdutos();
  if (bancoProdutos.itens.length === 0) {
    showToast("Banco de Produtos ERP vazio. Adicione produtos primeiro na aba Banco de Produtos ERP.", 4000);
    return;
  }
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  // Build options list for manual dropdown
  const bancoOptions = bancoProdutos.itens.map((p, i) =>
    `<option value="${i}">${esc((p.descricao || '').slice(0, 60))}${p.sku ? ' [' + esc(p.sku) + ']' : ''}</option>`
  ).join("");

  const matches = c.itens.map((item, idx) => {
    let match = null; let matchIdx = -1; let score = 0; let method = '';
    // 1. Match by SKU
    if (item.sku) {
      const skuIdx = bancoProdutos.itens.findIndex(p => p.sku && p.sku.toUpperCase() === item.sku.toUpperCase());
      if (skuIdx >= 0) { match = bancoProdutos.itens[skuIdx]; matchIdx = skuIdx; score = 1; method = 'SKU'; }
    }
    // 2. Match by description similarity
    if (!match) {
      let bestScore = 0; let bestIdx = -1;
      for (let i = 0; i < bancoProdutos.itens.length; i++) {
        const s = calcSimilaridade(item.descricao || '', bancoProdutos.itens[i].descricao || '');
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestScore >= 0.6) {
        match = bancoProdutos.itens[bestIdx]; matchIdx = bestIdx; score = bestScore;
        method = bestScore >= 0.85 ? 'Similaridade' : 'Aprox.';
      }
    }
    const synced = item._syncedFromBanco ? true : false;
    return { idx, item, match, matchIdx, score, method, synced, accept: match && score >= 0.85 };
  });

  // Build modal
  let html = `
    <div style="margin-bottom:1rem">
      <p style="font-size:.85rem;color:var(--mut)">Sincronizar itens do contrato com o Banco de Produtos ERP (<strong>${bancoProdutos.itens.length}</strong> produtos no banco). Selecione os itens e ajuste os matches manualmente se necessario. Apenas <strong>descricao, SKU e unidade</strong> serao atualizados.</p>
    </div>
    <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--bdr);border-radius:10px">
      <table style="font-size:.78rem;width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--s2)"><th style="width:30px;padding:.5rem;text-align:center">✓</th><th style="padding:.5rem">#</th><th style="padding:.5rem">Item Contrato</th><th style="padding:.5rem;min-width:220px">Match Banco</th><th style="padding:.5rem;width:70px;text-align:center">Score</th></tr></thead>
        <tbody>${matches.map(m => {
          const statusColor = m.synced ? 'var(--green)' : m.match ? (m.score >= 0.7 ? 'var(--green)' : m.score >= 0.5 ? 'var(--yellow)' : 'var(--red)') : 'var(--red)';
          return `<tr style="border-left:3px solid ${statusColor};border-bottom:1px solid rgba(71,85,105,.3)">
            <td style="text-align:center;padding:.4rem"><input type="checkbox" class="sync-check" data-idx="${m.idx}" ${m.accept ? 'checked' : ''}></td>
            <td style="text-align:center;padding:.4rem">${m.item.num}</td>
            <td style="padding:.4rem .5rem;max-width:200px"><span title="${esc(m.item.descricao)}" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.item.descricao)}</span><span style="font-size:.65rem;color:var(--dim)">SKU: ${esc(m.item.sku || '-')} | ${esc(m.item.unidade)}</span></td>
            <td style="padding:.4rem .5rem"><select class="sync-match-select" data-idx="${m.idx}" style="width:100%;padding:.3rem .4rem;background:var(--s1);border:1px solid var(--bdr);border-radius:6px;color:var(--txt);font-size:.72rem" onchange="onSyncSelectChange(this)"><option value="-1">— Selecione —</option>${bancoOptions}</select>${m.synced ? '<span style="font-size:.6rem;color:var(--green);display:block;margin-top:2px">Ja sincronizado</span>' : ''}</td>
            <td style="text-align:center;padding:.4rem;font-weight:700;font-size:.78rem;color:${statusColor}" class="sync-score-${m.idx}">${m.match ? (m.score * 100).toFixed(0) + '%' : '—'}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    <div style="margin-top:1rem;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.78rem;color:var(--mut)"><span id="sync-sel-count">${matches.filter(m=>m.accept).length}</span> de ${c.itens.length} selecionados</span>
      <div style="display:flex;gap:.8rem">
        <button class="btn btn-outline" onclick="abrirContrato('${contratoId}')">Cancelar</button>
        <button class="btn btn-green" onclick="confirmarSync('${contratoId}')">Confirmar Sincronizacao</button>
      </div>
    </div>`;

  _contratoAbertoId = contratoId;
  document.getElementById("modal-contrato-titulo").textContent = "🔄 Sincronizar com Banco de Produtos ERP — " + c.id;
  document.getElementById("modal-contrato-body").innerHTML = html;

  // Pre-select dropdowns for matched items
  matches.forEach(m => {
    if (m.matchIdx >= 0) {
      const sel = document.querySelector(`.sync-match-select[data-idx="${m.idx}"]`);
      if (sel) sel.value = m.matchIdx;
    }
  });

  // Store matches for confirmation
  window._syncMatches = matches;

  // Bind checkbox change for counter
  document.querySelectorAll('.sync-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const count = document.querySelectorAll('.sync-check:checked').length;
      document.getElementById('sync-sel-count').textContent = count;
    });
  });
}

function onSyncSelectChange(sel) {
  const idx = sel.dataset.idx;
  const val = parseInt(sel.value);
  const cb = document.querySelector(`.sync-check[data-idx="${idx}"]`);
  const scoreCell = document.querySelector(`.sync-score-${idx}`);
  if (val >= 0 && cb) {
    cb.checked = true;
    if (scoreCell) { scoreCell.textContent = 'Manual'; scoreCell.style.color = 'var(--cyan)'; }
  }
  const count = document.querySelectorAll('.sync-check:checked').length;
  document.getElementById('sync-sel-count').textContent = count;
}

function confirmarSync(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const checks = document.querySelectorAll(".sync-check:checked");
  if (checks.length === 0) { showToast("Nenhum item selecionado para sincronizar.", 3000); return; }

  let synced = 0;
  checks.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    // Get match from dropdown selection (manual or auto)
    const sel = document.querySelector(`.sync-match-select[data-idx="${idx}"]`);
    const matchIdx = sel ? parseInt(sel.value) : -1;
    if (matchIdx < 0 || !bancoProdutos.itens[matchIdx]) return;
    const matched = bancoProdutos.itens[matchIdx];
    c.itens[idx].descricao = matched.descricao;
    c.itens[idx].sku = matched.sku || c.itens[idx].sku;
    c.itens[idx].ncm = matched.ncm || c.itens[idx].ncm || '';
    c.itens[idx].unidade = matched.unidade || c.itens[idx].unidade;
    c.itens[idx]._syncedFromBanco = true;
    synced++;
  });

  saveContratos();
  showToast(`${synced} de ${c.itens.length} itens sincronizados!`);
  abrirContrato(contratoId);
  renderAll();
}

// ===== Story 4.16: Sincronizacao de Itens na Criacao de Contrato =====
let _syncContratoId = null;
let _syncMatches = []; // Array of { itemIdx, matchProduto, score, matchType, accepted }

// Usa calcularSimilaridade() da linha 6311 (Story 4.15) — evita duplicação.
// Wrapper para adaptar retorno { tipo } → { matchType }
function calcularSimilaridadeSync(a, b) {
  const result = calcularSimilaridade(a, b);
  const score = result.score;
  let matchType;
  if (score >= 80) matchType = 'exato';
  else if (score >= 60) matchType = 'parcial';
  else matchType = 'sem-match';
  return { score, matchType };
}

function buscarMelhorMatch(descricaoItem, bancoProdutos) {
  let bestMatch = null;
  let bestScore = 0;
  let alternativas = [];
  for (const prod of bancoProdutos) {
    const result = calcularSimilaridadeSync(descricaoItem, prod.descricao);
    if (result.score > bestScore) {
      if (bestMatch) alternativas.push({ prod: bestMatch.prod, score: bestScore });
      bestScore = result.score;
      bestMatch = { prod, score: result.score, matchType: result.matchType };
    } else if (result.score >= 40) {
      alternativas.push({ prod, score: result.score });
    }
  }
  alternativas.sort((a, b) => b.score - a.score);
  return { best: bestMatch, alternativas: alternativas.slice(0, 3) };
}

function abrirSincronizacaoItens(contratoId) {
  _syncContratoId = contratoId;
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens || c.itens.length === 0) {
    switchTab("contratos");
    return;
  }

  loadBancoProdutos();
  const banco = bancoProdutos.itens || [];

  if (banco.length === 0) {
    showToast("Banco de Produtos vazio — pule a sincronizacao ou importe do Tiny primeiro.", 4000);
  }

  _syncMatches = [];
  const tbody = document.getElementById("sync-itens-tbody");
  let html = "";
  let verdes = 0, amarelos = 0, vermelhos = 0;

  for (let i = 0; i < c.itens.length; i++) {
    const item = c.itens[i];
    const { best, alternativas } = buscarMelhorMatch(item.descricao, banco);

    const matchType = best ? best.matchType : 'sem-match';
    const score = best ? best.score : 0;
    const cssClass = matchType === 'exato' ? 'sync-match-exato' : matchType === 'parcial' ? 'sync-match-parcial' : 'sync-sem-match';
    const scoreClass = matchType === 'exato' ? 'high' : matchType === 'parcial' ? 'mid' : 'low';

    if (matchType === 'exato') verdes++;
    else if (matchType === 'parcial') amarelos++;
    else vermelhos++;

    _syncMatches.push({
      itemIdx: i,
      matchProduto: best ? best.prod : null,
      score,
      matchType,
      accepted: matchType === 'exato',
    });

    const matchInfo = best && best.prod
      ? `<div style="font-size:.85rem;font-weight:600">${esc(best.prod.descricao)}</div>
         <div class="sync-match-info">SKU: <span class="sku">${esc(best.prod.sku || '-')}</span> | NCM: ${esc(best.prod.ncm || '-')} | ${esc(best.prod.unidade || '-')}</div>`
      : `<div style="font-size:.85rem;color:var(--red,#ef4444)">Nenhum produto similar encontrado</div>`;

    const actions = matchType === 'exato'
      ? `<button class="btn btn-sm btn-green" onclick="toggleSyncAccept(${i})" id="sync-btn-${i}">✓ Vinculado</button>`
      : matchType === 'parcial'
        ? `<button class="btn btn-sm btn-outline" onclick="toggleSyncAccept(${i})" id="sync-btn-${i}" style="border-color:var(--yellow)">Vincular?</button>`
        : `<button class="btn btn-sm btn-outline" onclick="abrirBuscaSync(${i})" id="sync-btn-${i}">Buscar</button>
           <button class="btn btn-sm btn-outline" onclick="criarProdutoSync(${i})" style="margin-left:4px">+ Criar</button>`;

    html += `<tr class="${cssClass}" id="sync-row-${i}">
      <td class="text-center">${i + 1}</td>
      <td style="max-width:250px"><div style="font-size:.85rem;font-weight:600">${esc(item.descricao)}</div></td>
      <td class="text-center" style="font-size:.8rem">${esc(item.unidade || '-')}</td>
      <td style="max-width:280px" id="sync-match-cell-${i}">${matchInfo}</td>
      <td class="text-center"><span class="sync-score ${scoreClass}">${score}%</span></td>
      <td class="text-center" id="sync-action-cell-${i}">${actions}</td>
    </tr>
    <tr id="sync-busca-row-${i}" class="hidden"><td colspan="6" style="padding:8px 16px" id="sync-busca-container-${i}"></td></tr>`;
  }

  tbody.innerHTML = html;
  document.getElementById("sync-itens-info").textContent =
    `${c.itens.length} itens | ${verdes} match exato | ${amarelos} parcial | ${vermelhos} sem match`;
  atualizarResumoSync();
  document.getElementById("modal-sync-itens").classList.remove("hidden");
}

function toggleSyncAccept(idx) {
  const match = _syncMatches[idx];
  if (!match || !match.matchProduto) return;
  match.accepted = !match.accepted;
  const btn = document.getElementById(`sync-btn-${idx}`);
  if (match.accepted) {
    btn.className = "btn btn-sm btn-green";
    btn.textContent = "✓ Vinculado";
  } else {
    btn.className = "btn btn-sm btn-outline";
    btn.textContent = "Vincular?";
  }
  atualizarResumoSync();
}

function abrirBuscaSync(idx) {
  const container = document.getElementById(`sync-busca-container-${idx}`);
  const row = document.getElementById(`sync-busca-row-${idx}`);
  row.classList.remove("hidden");

  loadBancoProdutos();
  container.innerHTML = `
    <input type="text" class="sync-busca-input" placeholder="Buscar produto no banco..." oninput="filtrarBuscaSync(${idx}, this.value)" autofocus>
    <div class="sync-busca-results" id="sync-busca-results-${idx}"></div>
  `;
  filtrarBuscaSync(idx, "");
}

function filtrarBuscaSync(idx, query) {
  loadBancoProdutos();
  const banco = bancoProdutos.itens || [];
  const q = (query || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let filtered = banco;
  if (q.length > 0) {
    filtered = banco.filter(p => (p.descricao || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
      || (p.sku || "").toLowerCase().includes(q));
  }
  const results = document.getElementById(`sync-busca-results-${idx}`);
  if (filtered.length === 0) {
    results.innerHTML = `<div style="color:var(--mut);padding:8px">Nenhum produto encontrado</div>`;
    return;
  }
  results.innerHTML = filtered.slice(0, 10).map(p =>
    `<div onclick="selecionarBuscaSync(${idx}, '${(p.id || '').replace(/'/g, "\\'")}')">
      <strong>${esc(p.descricao)}</strong> <span style="font-family:monospace;color:var(--accent)">${esc(p.sku || '')}</span> ${esc(p.unidade || '')}
    </div>`
  ).join("");
}

function selecionarBuscaSync(idx, prodId) {
  loadBancoProdutos();
  const prod = bancoProdutos.itens.find(p => p.id === prodId);
  if (!prod) return;

  const c = contratos.find(x => x.id === _syncContratoId);
  const item = c ? c.itens[idx] : null;
  const sim = item ? calcularSimilaridadeSync(item.descricao, prod.descricao) : { score: 0, matchType: 'sem-match' };

  _syncMatches[idx].matchProduto = prod;
  _syncMatches[idx].score = sim.score;
  _syncMatches[idx].matchType = sim.score >= 80 ? 'exato' : sim.score >= 60 ? 'parcial' : 'sem-match';
  _syncMatches[idx].accepted = true;

  // Update UI
  const matchCell = document.getElementById(`sync-match-cell-${idx}`);
  matchCell.innerHTML = `<div style="font-size:.85rem;font-weight:600">${esc(prod.descricao)}</div>
    <div class="sync-match-info">SKU: <span class="sku">${esc(prod.sku || '-')}</span> | NCM: ${esc(prod.ncm || '-')} | ${esc(prod.unidade || '-')}</div>`;

  const scoreClass = sim.score >= 80 ? 'high' : sim.score >= 60 ? 'mid' : 'low';
  const row = document.getElementById(`sync-row-${idx}`);
  row.className = sim.score >= 80 ? 'sync-match-exato' : sim.score >= 60 ? 'sync-match-parcial' : 'sync-sem-match';

  const scoreCell = row.children[4];
  scoreCell.innerHTML = `<span class="sync-score ${scoreClass}">${sim.score}%</span>`;

  const actionCell = document.getElementById(`sync-action-cell-${idx}`);
  actionCell.innerHTML = `<button class="btn btn-sm btn-green" onclick="toggleSyncAccept(${idx})" id="sync-btn-${idx}">✓ Vinculado</button>`;

  // Hide search row
  document.getElementById(`sync-busca-row-${idx}`).classList.add("hidden");
  atualizarResumoSync();
}

function criarProdutoSync(idx) {
  _editProdutoId = null;
  const c = contratos.find(x => x.id === _syncContratoId);
  const item = c ? c.itens[idx] : null;
  document.getElementById("modal-produto-titulo").textContent = "Novo Produto (Sync)";
  document.getElementById("prod-descricao").value = item ? item.descricao : "";
  document.getElementById("prod-sku").value = "";
  document.getElementById("prod-ncm").value = item ? (item.ncm || "") : "";
  document.getElementById("prod-unidade").value = item ? (item.unidade || "") : "";
  document.getElementById("modal-produto").classList.remove("hidden");

  // Store sync idx for auto-link after save
  window._syncCriarIdx = idx;
}

// Patch salvarProduto to auto-link when coming from sync
const _originalSalvarProduto = typeof salvarProduto === 'function' ? salvarProduto : null;

function atualizarResumoSync() {
  const accepted = _syncMatches.filter(m => m.accepted && m.matchProduto).length;
  const total = _syncMatches.length;
  document.getElementById("sync-itens-resumo").textContent = `${accepted} de ${total} itens vinculados`;
}

function aplicarSincronizacao() {
  const c = contratos.find(x => x.id === _syncContratoId);
  if (!c) return;

  let synced = 0;
  for (const match of _syncMatches) {
    if (match.accepted && match.matchProduto) {
      const item = c.itens[match.itemIdx];
      if (item) {
        if (match.matchProduto.sku) item.sku = match.matchProduto.sku;
        if (match.matchProduto.ncm) item.ncm = match.matchProduto.ncm;
        if (match.matchProduto.unidade) item.unidade = match.matchProduto.unidade;
        synced++;
      }
    }
  }

  saveContratos();
  document.getElementById("modal-sync-itens").classList.add("hidden");
  showToast(`${synced} itens sincronizados com SKU/NCM/unidade do banco!`, 4000);
  _syncContratoId = null;
  _syncMatches = [];
  renderAll();
  switchTab("contratos");
}

function pularSincronizacao() {
  document.getElementById("modal-sync-itens").classList.add("hidden");
  showToast("Sincronizacao pulada — itens mantidos como importados.", 3000);
  _syncContratoId = null;
  _syncMatches = [];
  switchTab("contratos");
}

// === Auto-preencher SKU e NCM ===
function autoPreencherSKUeNCM() {
  const NCM_MAP = [
    {keys:["tilapia","tilápia"],ncm:"0304.61.00"},
    {keys:["peito de frango","frango","coxa","sobrecoxa"],ncm:"0207.14.00"},
    {keys:["carne bovina","carne moida","carne picada"],ncm:"0210.12.00"},
    {keys:["pernil","linguica","linguiça"],ncm:"0210.12.00"},
    {keys:["leite uht","leite"],ncm:"0401.10.10"},
    {keys:["iogurte"],ncm:"0401.20.10"},
    {keys:["manteiga"],ncm:"0405.10.00"},
    {keys:["queijo minas","queijo frescal"],ncm:"0406.10.10"},
    {keys:["queijo meia cura"],ncm:"0406.10.90"},
    {keys:["queijo ralado","parmesão","parmesao"],ncm:"0406.20.00"},
    {keys:["mussarela"],ncm:"0406.90.10"},
    {keys:["ovo","ovos"],ncm:"0407.21.00"},
    {keys:["batata"],ncm:"0701.90.00"},
    {keys:["tomate"],ncm:"0702.00.00"},
    {keys:["cebola"],ncm:"0703.10.19"},
    {keys:["alho"],ncm:"0703.20.10"},
    {keys:["cebolinha","cheiro verde"],ncm:"0703.90.00"},
    {keys:["couve"],ncm:"0704.90.00"},
    {keys:["repolho"],ncm:"0704.90.00"},
    {keys:["alface"],ncm:"0705.11.00"},
    {keys:["cenoura"],ncm:"0706.10.00"},
    {keys:["beterraba"],ncm:"0706.90.00"},
    {keys:["pepino"],ncm:"0707.00.00"},
    {keys:["vagem"],ncm:"0708.20.00"},
    {keys:["pimentão","pimentao"],ncm:"0709.60.00"},
    {keys:["abóbora","abobora","abobrinha"],ncm:"0709.93.00"},
    {keys:["chuchu","inhame","cara","espinafre","almeirão","almeirao"],ncm:"0709.99.90"},
    {keys:["feijao","feijão"],ncm:"0713.33.19"},
    {keys:["mandioca"],ncm:"0714.10.00"},
    {keys:["coco ralado"],ncm:"0801.11.10"},
    {keys:["banana"],ncm:"0803.10.00"},
    {keys:["abacaxi"],ncm:"0804.30.00"},
    {keys:["laranja"],ncm:"0805.10.00"},
    {keys:["limao","limão"],ncm:"0805.50.00"},
    {keys:["melancia"],ncm:"0807.11.00"},
    {keys:["maça","maçã","maca"],ncm:"0808.10.00"},
    {keys:["mamão","mamao"],ncm:"0808.30.00"},
    {keys:["café","cafe"],ncm:"0901.21.00"},
    {keys:["canela"],ncm:"0906.11.00"},
    {keys:["açafrão","açafrao","acafrao"],ncm:"0910.30.00"},
    {keys:["oregano","orégano"],ncm:"0910.91.00"},
    {keys:["louro"],ncm:"1209.99.90"},
    {keys:["arroz"],ncm:"1006.30.29"},
    {keys:["milho para pipoca","milho de canjica","canjiquinha"],ncm:"1005.90.10"},
    {keys:["milho in natura","milho "],ncm:"1005.90.10"},
    {keys:["farinha de trigo","trigo p quibe"],ncm:"1101.00.10"},
    {keys:["farinha de milho","fubá","fuba","milharina"],ncm:"1102.20.00"},
    {keys:["farinha de mandioca"],ncm:"1106.20.00"},
    {keys:["amido de milho"],ncm:"1108.12.00"},
    {keys:["polvilho"],ncm:"1108.14.00"},
    {keys:["óleo","oleo"],ncm:"1507.90.11"},
    {keys:["azeite"],ncm:"1509.10.00"},
    {keys:["margarina"],ncm:"1517.10.00"},
    {keys:["açúcar","acucar"],ncm:"1701.99.00"},
    {keys:["cacau"],ncm:"1805.00.00"},
    {keys:["bombom","chocolate"],ncm:"1806.31.10"},
    {keys:["aveia"],ncm:"1904.20.00"},
    {keys:["macarrão","macarrao"],ncm:"1902.11.00"},
    {keys:["biscoito doce","rosquinha","bolacha","maisena"],ncm:"1905.31.00"},
    {keys:["biscoito agua","biscoito água"],ncm:"1905.40.00"},
    {keys:["pão","pao","panetone"],ncm:"1905.90.90"},
    {keys:["extrato de tomate","extrato tomate"],ncm:"2002.90.00"},
    {keys:["polpa de","polpa de frutas"],ncm:"2008.99.00"},
    {keys:["suco"],ncm:"2009.89.00"},
    {keys:["colorau"],ncm:"2103.90.21"},
    {keys:["vinagre"],ncm:"2103.90.91"},
    {keys:["fermento"],ncm:"2106.90.10"},
    {keys:["sal refinado"],ncm:"2501.00.19"},
    {keys:["amendoim"],ncm:"2008.19.00"}
  ];
  function findNCM(nome) {
    const n = nome.toLowerCase();
    for (const e of NCM_MAP) { for (const k of e.keys) { if (n.includes(k.toLowerCase())) return e.ncm; } }
    return "";
  }
  let skuCount = 0, ncmCount = 0, skuNum = 0;
  estoqueIntelProdutos.forEach(p => {
    if (p.sku && p.sku.startsWith("LICT-")) {
      const num = parseInt(p.sku.replace("LICT-","")) || 0;
      if (num > skuNum) skuNum = num;
    }
  });
  estoqueIntelProdutos.forEach(p => {
    if (!p.sku) { skuNum++; p.sku = "LICT-" + String(skuNum).padStart(4,"0"); skuCount++; }
    if (!p.ncm) { const ncm = findNCM(p.nome); if (ncm) { p.ncm = ncm; ncmCount++; } }
  });
  saveEstoqueIntelProdutos();
  renderEstoque();
  showToast(`Auto-preenchido: ${skuCount} SKU(s), ${ncmCount} NCM(s).`, 4000);
}
