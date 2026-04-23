// gdp-estoque-intel.js — Stock Intelligence module (extracted from gdp-contratos.html)
// Functions: findEstoqueIntelProduto, getEstoqueIntelResumo, calcularCompraInteligente,
// syncPedidosGDPToEstoqueIntel, renderEstoque, renderGdpDemandasIntel, renderGdpEstoqueIntel,
// renderGdpComprasIntel, and all related stock intelligence functions.

// ===== LIMPAR PRODUTOS E MOVIMENTAÇÕES =====
window.limparProdutosEstoqueIntel = function() {
  const total = estoqueIntelProdutos.length + estoqueIntelEmbalagens.length + estoqueIntelMovimentacoes.length;
  if (total === 0) { showToast("Já está limpo."); return; }
  if (!confirm("Limpar TODOS os produtos (" + estoqueIntelProdutos.length + "), embalagens (" + estoqueIntelEmbalagens.length + "), movimentações (" + estoqueIntelMovimentacoes.length + ") e dados relacionados?\n\nNotas fiscais NÃO serão afetadas.")) return;

  estoqueIntelProdutos = [];
  estoqueIntelEmbalagens = [];
  estoqueIntelPedidos = [];
  estoqueIntelPedidoItens = [];
  estoqueIntelMovimentacoes = [];
  estoqueIntelFornecedores = [];
  estoqueIntelCompras = [];
  estoqueMovimentos = [];

  var keys = [
    "gdp.estoque-intel.produtos.v1", "gdp.estoque-intel.embalagens.v1",
    "gdp.estoque-intel.pedidos.v1", "gdp.estoque-intel.pedido-itens.v1",
    "gdp.estoque-intel.movimentacoes.v1", "gdp.estoque-intel.fornecedores.v1",
    "gdp.estoque-intel.compras.v1", "gdp.estoque.movimentos.v1"
  ];
  var empty = { _v: 1, updatedAt: new Date().toISOString(), items: [] };
  keys.forEach(function(k) {
    localStorage.setItem(k, JSON.stringify(empty));
    // Sync to cloud
    if (typeof cloudSave === "function") cloudSave(k, empty);
  });

  if (typeof renderEstoque === "function") renderEstoque();
  if (typeof renderAll === "function") renderAll();
  showToast("Produtos, embalagens e movimentações limpos. NFs preservadas.", 4000);
};

// ===== STOCK INTELLIGENCE — CORE FUNCTIONS =====
function findEstoqueIntelProduto(produtoId) {
  return estoqueIntelProdutos.find((item) => item.id === produtoId) || null;
}

function getEstoqueIntelResumo() {
  return estoqueIntelProdutos.map((produto) => {
    const movimentos = estoqueIntelMovimentacoes.filter((mov) => mov.produto_id === produto.id);
    const fisico = movimentos.filter((mov) => mov.tipo === "fisico").reduce((sum, mov) => sum + (mov.operacao === "+" ? Number(mov.quantidade || 0) : -Number(mov.quantidade || 0)), 0);
    const comprometido = movimentos.filter((mov) => mov.tipo === "comprometido").reduce((sum, mov) => sum + (mov.operacao === "+" ? Number(mov.quantidade || 0) : -Number(mov.quantidade || 0)), 0);
    return {
      produto,
      fisico,
      comprometido,
      disponivel: fisico - comprometido
    };
  });
}

function calcularCompraInteligente(quantidadeNecessaria, embalagensDisponiveis = []) {
  const necessidade = Number(quantidadeNecessaria || 0);
  if (!necessidade || !embalagensDisponiveis.length) return [];
  const resultados = embalagensDisponiveis
    .filter((emb) => Number(emb.quantidade_base || 0) > 0)
    .map((emb) => {
      const quantidadePacotes = Math.ceil(necessidade / Number(emb.quantidade_base));
      const totalComprado = quantidadePacotes * Number(emb.quantidade_base);
      const sobra = totalComprado - necessidade;
      return {
        embalagemId: emb.id,
        descricao: emb.descricao,
        quantidade_base: Number(emb.quantidade_base),
        quantidadePacotes,
        totalComprado,
        sobra
      };
    })
    .sort((a, b) => a.sobra - b.sobra || a.totalComprado - b.totalComprado);
  if (resultados[0]) resultados[0].melhorOpcao = true;
  return resultados;
}

function findEstoqueIntelFornecedor(fornecedorId) {
  return estoqueIntelFornecedores.find((item) => item.id === fornecedorId) || null;
}

function getEstoqueIntelFornecedorEmail(fornecedor) {
  const email = String(fornecedor?.email || "").trim();
  if (email) return email;
  const contatoLegacy = String(fornecedor?.contato || "").trim();
  return contatoLegacy.includes("@") ? contatoLegacy : "";
}

function getEstoqueIntelFornecedorTelefone(fornecedor) {
  const telefone = String(fornecedor?.telefone || "").trim();
  if (telefone) return telefone;
  const contatoLegacy = String(fornecedor?.contato || "").trim();
  return contatoLegacy && !contatoLegacy.includes("@") ? contatoLegacy : "";
}

function getEstoqueIntelCompraItens(compra) {
  if (Array.isArray(compra?.itens) && compra.itens.length) return compra.itens;
  if (!compra) return [];
  return [{
    produto_id: compra.produto_id,
    embalagem_id: compra.embalagem_id,
    quantidade_pacotes: compra.quantidade_pacotes,
    total_comprado: compra.total_comprado,
    sobra_estimada: compra.sobra_estimada,
    preco_unitario: compra.preco_unitario,
    valor_total: compra.valor_total,
    origem_preco: compra.origem_preco,
    necessidade_base: compra.necessidade_base || 0
  }];
}

function getFornecedorOferta(fornecedor, embalagemId) {
  return (fornecedor?.embalagens || []).find((item) => item.embalagem_id === embalagemId) || null;
}

function getEstoqueIntelPrecoEmbalagem(embalagemId) {
  const embalagem = estoqueIntelEmbalagens.find((item) => item.id === embalagemId);
  return Number(embalagem?.preco_referencia || 0);
}

function getEstoqueIntelPrecoFornecedorOuReferencia(fornecedor, embalagemId) {
  const oferta = getFornecedorOferta(fornecedor, embalagemId);
  if (oferta && Number(oferta.preco_unitario || 0) > 0) {
    return {
      preco_unitario: Number(oferta.preco_unitario || 0),
      origem: "oferta_fornecedor"
    };
  }
  const precoReferencia = getEstoqueIntelPrecoEmbalagem(embalagemId);
  if (precoReferencia > 0) {
    return {
      preco_unitario: precoReferencia,
      origem: "preco_referencia_embalagem"
    };
  }
  return { preco_unitario: 0, origem: "sem_preco" };
}

function normalizeEstoqueIntelMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// FR-005: Verifica se produto é crítico (requer conversão de gramatura)
function isProdutoCritico(produtoId) {
  if (!produtoId) return false;
  // Buscar no banco de produtos (Central de Preços)
  if (typeof bancoProdutos !== 'undefined' && bancoProdutos.itens) {
    const bp = bancoProdutos.itens.find(p => p.id === produtoId || p.sku === produtoId);
    if (bp) return !!bp.produto_critico;
  }
  // Buscar no estoque intel (pode ter flag próprio)
  const prodIntel = estoqueIntelProdutos.find(p => p.id === produtoId);
  if (prodIntel) return !!prodIntel.produto_critico;
  return false;
}

function parseQuantidadeBaseFromText(text, unidadeBase, produtoId) {
  // FR-005: Só faz conversão de gramatura se produto é crítico
  if ((unidadeBase === "g" || unidadeBase === "ml") && produtoId && !isProdutoCritico(produtoId)) {
    // Produto comum — não converter gramatura, extrair número simples
    const preNorm = String(text || "").replace(/(\d)[,.](\d)/g, "$1DECIMALSEP$2");
    const normalized = normalizeEstoqueIntelMatchText(preNorm).replace(/decimalsep/g, ".");
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(un|cx|dz|pct|fd|bd|pt|sc|rs|rl|fr|tb|gf|la|mç|kg|g|ml|l)\b/i);
    if (numMatch) return Number(numMatch[1]);
    return 0;
  }
  // Preservar decimais: converter "1,02" → "1.02" e normalizar mantendo pontos decimais
  const preNorm = String(text || "").replace(/(\d)[,.](\d)/g, "$1DECIMALSEP$2");
  const normalized = normalizeEstoqueIntelMatchText(preNorm).replace(/decimalsep/g, ".");
  if (!normalized) return 0;
  if (unidadeBase === "g") {
    const kgMatch = normalized.match(/(\d+(?:\.\d+)?)\s*kg\b/);
    if (kgMatch) return Math.round(Number(kgMatch[1]) * 1000);
    // "pct kg", "pacote kg" sem número = assume 1kg
    if (/\bkg\b/.test(normalized) && !kgMatch) return 1000;
    const gMatch = normalized.match(/(\d+(?:\.\d+)?)\s*gr?\b/);
    if (gMatch) return Math.round(Number(gMatch[1]));
  }
  if (unidadeBase === "ml") {
    const lMatch = normalized.match(/(\d+(?:\.\d+)?)\s*l\b/);
    if (lMatch) return Math.round(Number(lMatch[1]) * 1000);
    const mlMatch = normalized.match(/(\d+(?:\.\d+)?)\s*ml\b/);
    if (mlMatch) return Math.round(Number(mlMatch[1]));
  }
  if (unidadeBase === "KG") {
    const kgMatch = normalized.match(/(\d+(?:\.\d+)?)\s*kg\b/);
    if (kgMatch) return Number(kgMatch[1]);
  }
  if (unidadeBase === "LT") {
    const ltMatch = normalized.match(/(\d+(?:\.\d+)?)\s*l\b/);
    if (ltMatch) return Number(ltMatch[1]);
  }
  const numMatch = normalized.match(/(\d+)\s*(un|cx|dz|pct|fd|bd|pt|sc|rs|rl|fr|tb|gf|la|mç)\b/i);
  if (numMatch) return Number(numMatch[1]);
  return 0;
}

function resolveEstoqueIntelMatchFromPedidoItem(item = {}) {
  const descricao = item.descricao || item.descricaoCompleta || "";
  const sku = item.sku || item.codigo || item.codigoBarras || "";
  const textoBase = `${descricao} ${sku}`;
  const embalagem = estoqueIntelEmbalagens.find((emb) => {
    if (!normalizeEstoqueIntelMatchText(textoBase)) return false;
    // Match exato por código de barras/SKU
    if (sku && emb.codigo_barras && String(emb.codigo_barras) === String(sku)) return true;
    return false;
  }) || null;
  if (embalagem) {
    return {
      produto: findEstoqueIntelProduto(embalagem.produto_id),
      embalagem,
      quantidadeBaseUnit: Number(embalagem.quantidade_base || 0)
    };
  }
  // Tier 1.5: Se item vem de contrato, buscar skuVinculado direto
  const contratoId = item.contratoId || item._contratoId || "";
  if (contratoId) {
    const ctr = contratos.find(x => x.id === contratoId);
    if (ctr) {
      const ctrItem = ctr.itens.find(ci => gdpNormalizedText(ci.descricao) === gdpNormalizedText(descricao) || (item.itemNum && ci.num === item.itemNum));
      if (ctrItem?.skuVinculado) {
        const prodVinc = estoqueIntelProdutos.find(p => p.sku === ctrItem.skuVinculado || p.id === ctrItem.skuVinculado);
        if (prodVinc) {
          const embVinc = estoqueIntelEmbalagens.find(e => e.produto_id === prodVinc.id);
          const qtdTexto = parseQuantidadeBaseFromText(textoBase, prodVinc.unidade_base, prodVinc.id) || parseQuantidadeBaseFromText(ctrItem.descricao, prodVinc.unidade_base, prodVinc.id) || (embVinc ? Number(embVinc.quantidade_base || 1) : 1);
          return { produto: prodVinc, embalagem: embVinc || null, quantidadeBaseUnit: qtdTexto };
        }
      }
    }
  }

  // Tier 2: GDP equivalencia (vinculação do contrato) → Estoque Intel direto
  const equivSku = getGdpEquivalencia(descricao);
  if (equivSku) {
    let prodIntel = estoqueIntelProdutos.find(p => p.sku === equivSku || p.id === equivSku);
    // Validar: se descrição do pedido contém palavras que não estão no produto vinculado,
    // buscar produto mais específico (ex: "Extrato de tomate" vinculado a "Tomate" → preferir "Extrato De Tomate")
    if (prodIntel) {
      const descWords = normalizeEstoqueIntelMatchText(descricao).split(/\s+/).filter(w => w.length > 3);
      const prodWords = normalizeEstoqueIntelMatchText(prodIntel.nome).split(/\s+/).filter(w => w.length > 3);
      const descHasExtraWords = descWords.some(dw => !prodWords.some(pw => pw === dw || pw.startsWith(dw) || dw.startsWith(pw)));
      if (descHasExtraWords) {
        // Buscar produto com nome mais específico que contenha TODAS as palavras-chave
        const maisEspecifico = estoqueIntelProdutos.find(p => {
          if (p.id === prodIntel.id) return false;
          const pWords = normalizeEstoqueIntelMatchText(p.nome).split(/\s+/).filter(w => w.length > 3);
          return pWords.length > prodWords.length && pWords.every(pw => descWords.some(dw => dw === pw || dw.startsWith(pw) || pw.startsWith(dw)));
        });
        if (maisEspecifico) prodIntel = maisEspecifico;
      }
    }
    if (prodIntel) {
      const embsIntel = estoqueIntelEmbalagens.filter(e => e.produto_id === prodIntel.id);
      // Extrair gramatura do TEXTO DO PEDIDO ou da CHAVE DA EQUIVALÊNCIA
      let qtdDoTexto = parseQuantidadeBaseFromText(textoBase, prodIntel.unidade_base, prodIntel.id);
      if (!qtdDoTexto) {
        // Tentar extrair da descrição original do contrato (que pode ter "500 gr")
        const equivKeys = Object.keys(gdpEquivalencias).filter(k => gdpEquivalencias[k] === equivSku);
        for (const ek of equivKeys) {
          qtdDoTexto = parseQuantidadeBaseFromText(ek, prodIntel.unidade_base, prodIntel.id);
          if (qtdDoTexto) break;
        }
      }
      if (qtdDoTexto) {
        return { produto: prodIntel, embalagem: embsIntel[0] || null, quantidadeBaseUnit: qtdDoTexto };
      }
      // Fallback: usar embalagem
      if (embsIntel.length) {
        return { produto: prodIntel, embalagem: embsIntel[0], quantidadeBaseUnit: Number(embsIntel[0].quantidade_base || 1) };
      }
      return { produto: prodIntel, embalagem: null, quantidadeBaseUnit: 1 };
    }
  }

  // Tier 3: similaridade textual — match por palavra completa, preferir nome mais específico (mais palavras)
  const itemWords = normalizeEstoqueIntelMatchText(textoBase).split(/\s+/).filter(w => w.length > 2);
  const candidatos = estoqueIntelProdutos.filter((prod) => {
    const prodWords = normalizeEstoqueIntelMatchText(prod.nome).split(/\s+/).filter(w => w.length > 2);
    return prodWords.length > 0 && prodWords.every(pw => itemWords.some(iw => iw === pw || (iw.length >= 5 && pw.length >= 5 && (iw.startsWith(pw) || pw.startsWith(iw)))));
  });
  // Preferir o candidato com mais palavras correspondentes (mais específico)
  candidatos.sort((a, b) => {
    const aWords = normalizeEstoqueIntelMatchText(a.nome).split(/\s+/).filter(w => w.length > 2).length;
    const bWords = normalizeEstoqueIntelMatchText(b.nome).split(/\s+/).filter(w => w.length > 2).length;
    return bWords - aWords;
  });
  const produto = candidatos[0] || null;
  if (!produto) return null;
  let quantidadeBaseUnit = parseQuantidadeBaseFromText(textoBase, produto.unidade_base, produto.id);
  // Fallback: se não extraiu gramatura do texto, usar embalagem cadastrada
  if (!quantidadeBaseUnit) {
    const embFallback = estoqueIntelEmbalagens.find(e => e.produto_id === produto.id);
    quantidadeBaseUnit = embFallback ? Number(embFallback.quantidade_base || 1) : 1;
  }
  return { produto, embalagem: estoqueIntelEmbalagens.find(e => e.produto_id === produto.id) || null, quantidadeBaseUnit };
}

function syncPedidosGDPToEstoqueIntel(silent = true) {
  const manualPedidos = estoqueIntelPedidos.filter((pedido) => pedido.origem_sistema !== "gdp_pedido");
  const manualItens = estoqueIntelPedidoItens.filter((item) => item.origem_sistema !== "gdp_pedido");
  const manualMovs = estoqueIntelMovimentacoes.filter((mov) => mov.origem_sistema !== "gdp_pedido");
  const autoPedidos = [];
  const autoItens = [];
  const autoMovs = [];
  let sincronizados = 0;

  pedidos.forEach((pedido) => {
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const itensConvertidos = [];
    itens.forEach((item, idx) => {
      // Injetar contratoId do pedido no item para Tier 1.5
      if (pedido.contratoId && !item.contratoId) item.contratoId = pedido.contratoId;
      const match = resolveEstoqueIntelMatchFromPedidoItem(item);
      if (!match?.produto || !match.quantidadeBaseUnit) return;
      const quantidadeItens = Number(item.qtd || item.quantidade || 0);
      if (!quantidadeItens) return;
      const quantidadeBase = quantidadeItens * Number(match.quantidadeBaseUnit || 0);
      if (!quantidadeBase) return;
      itensConvertidos.push({
        id: `AUTO-PIT-${pedido.id}-${idx + 1}`,
        pedido_id: pedido.id,
        produto_id: match.produto.id,
        quantidade_base: quantidadeBase,
        origem_sistema: "gdp_pedido",
        origem_item_num: item.itemNum || idx + 1
      });
      autoMovs.push({
        id: `AUTO-MOV-${pedido.id}-${idx + 1}`,
        produto_id: match.produto.id,
        tipo: "comprometido",
        operacao: "+",
        quantidade: quantidadeBase,
        origem: "pedido_gdp",
        origem_sistema: "gdp_pedido",
        data: pedido.dataEntrega || pedido.data || new Date().toISOString(),
        referencia_id: pedido.id
      });
    });
    if (!itensConvertidos.length) return;
    autoPedidos.push({
      id: pedido.id,
      data: pedido.dataEntrega || pedido.data || new Date().toISOString().slice(0, 10),
      data_prevista: pedido.dataPrevista || pedido.dataEntrega || pedido.data || "",
      status: pedido.status || "em_aberto",
      origem_sistema: "gdp_pedido",
      cliente: pedido.escola || pedido.cliente?.nome || ""
    });
    autoItens.push(...itensConvertidos);
    sincronizados += 1;
  });

  estoqueIntelPedidos = [...manualPedidos, ...autoPedidos];
  estoqueIntelPedidoItens = [...manualItens, ...autoItens];
  estoqueIntelMovimentacoes = [...manualMovs, ...autoMovs];
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  const statusEl = document.getElementById("ei-api-status");
  if (statusEl) statusEl.innerHTML = `Demandas sincronizadas do GDP no Estoque Intel: <strong>${sincronizados}</strong> pedido(s) reais convertidos para reserva em g/ml.`;
  if (!silent) {
    renderEstoque();
    showToast(`${sincronizados} demanda(s) sincronizadas do GDP no Estoque Intel.`, 3500);
  }
  return sincronizados;
}

function getPedidoDataConsiderada(pedido, modo = "pedido") {
  if (modo === "prevista") return pedido.dataPrevista || pedido.dataEntrega || pedido.data || "";
  return pedido.data || pedido.dataEntrega || "";
}

function toggleListaComprasPeriodo(modo) {
  estoqueIntelListaPeriodoModo = modo === "intervalo" ? "intervalo" : "mes";
  const mesWrap = document.getElementById("ei-periodo-mes-wrap");
  const intervaloWrap = document.getElementById("ei-periodo-intervalo-wrap");
  const mesBtn = document.getElementById("ei-periodo-mes-btn");
  const intervaloBtn = document.getElementById("ei-periodo-intervalo-btn");
  if (mesWrap) mesWrap.classList.toggle("hidden", estoqueIntelListaPeriodoModo !== "mes");
  if (intervaloWrap) intervaloWrap.classList.toggle("hidden", estoqueIntelListaPeriodoModo !== "intervalo");
  if (mesBtn) mesBtn.className = `btn ${estoqueIntelListaPeriodoModo === "mes" ? "btn-green" : "btn-outline"} btn-sm`;
  if (intervaloBtn) intervaloBtn.className = `btn ${estoqueIntelListaPeriodoModo === "intervalo" ? "btn-green" : "btn-outline"} btn-sm`;
  renderListaComprasEstoqueIntel();
}

function toggleListaComprasStatusPanel() {
  const panel = document.getElementById("ei-status-filter-panel");
  const icon = document.getElementById("ei-status-filter-icon");
  if (!panel || !icon) return;
  panel.classList.toggle("hidden");
  icon.textContent = panel.classList.contains("hidden") ? "+" : "-";
}

function toggleListaComprasStatusAll(checked) {
  estoqueIntelListaStatusFiltros = checked ? PEDIDO_STATUS_TABS.map((item) => item.key) : [];
  document.querySelectorAll(".ei-status-filter-option").forEach((input) => { input.checked = checked; });
  updateListaComprasStatusSummary();
  renderListaComprasEstoqueIntel();
}

function toggleListaComprasStatusOption(status, checked) {
  const next = new Set(estoqueIntelListaStatusFiltros);
  if (checked) next.add(status);
  else next.delete(status);
  estoqueIntelListaStatusFiltros = [...next];
  updateListaComprasStatusSummary();
  renderListaComprasEstoqueIntel();
}

function updateListaComprasStatusSummary() {
  const btn = document.getElementById("ei-status-filter-btn");
  if (!btn) return;
  const label = !estoqueIntelListaStatusFiltros.length
    ? "Sem filtro por situacoes"
    : estoqueIntelListaStatusFiltros.map((status) => getPedidoStatusMeta(status).label).join(", ");
  btn.innerHTML = `${esc(label)} <span id="ei-status-filter-icon">${document.getElementById("ei-status-filter-panel")?.classList.contains("hidden") ? "+" : "-"}</span>`;
}

function garantirPedidoExemploDemandaAutomatica() {
  const demoId = "PED-DEMO-ESTOQUE-001";
  const existente = pedidos.find((pedido) => pedido.id === demoId);
  if (existente) return existente;
  const pedidoDemo = sanitizePedidoLegacyData({
    id: demoId,
    escola: "Escola Exemplo Estoque Intel",
    cliente: {
      nome: "Escola Exemplo Estoque Intel",
      cnpj: "12345678000199"
    },
    data: new Date().toISOString().slice(0, 10),
    dataEntrega: new Date().toISOString().slice(0, 10),
    dataPrevista: new Date().toISOString().slice(0, 10),
    status: "recebido",
    valor: 0,
    itens: [
      { itemNum: 1, descricao: "Arroz Pacote 350g", sku: "7890000003506", qtd: 12, precoUnitario: 8.9 },
      { itemNum: 2, descricao: "Suco integral Garrafa 1000ml", sku: "7890000010009", qtd: 8, precoUnitario: 6.2 }
    ]
  });
  pedidoDemo.valor = pedidoDemo.itens.reduce((sum, item) => sum + Number(item.qtd || 0) * Number(item.precoUnitario || 0), 0);
  pedidos.unshift(pedidoDemo);
  savePedidos();
  return pedidoDemo;
}

function gerarExemploDemandaVisualEstoqueIntel() {
  // Seed de exemplo removido — produtos devem ser cadastrados pelo usuario
  const demoId = "PEDINT-DEMO-VISUAL-001";
  const existente = estoqueIntelPedidos.find((pedido) => pedido.id === demoId);
  if (existente) {
    estoqueIntelCurrentView = "pedidos";
    renderEstoque();
    visualizarDemandaEstoqueIntel(demoId);
    showToast("Exemplo de demanda aberto para visualizacao.", 3500);
    return;
  }
  const produto = estoqueIntelProdutos[0];
  if (!produto) {
    showToast("Cadastre ou gere produtos antes de criar o exemplo.", 3500);
    return;
  }
  const quantidadeBase = 1700;
  const pedido = {
    id: demoId,
    data: new Date().toISOString().slice(0, 10),
    data_prevista: new Date().toISOString().slice(0, 10),
    status: "emitido",
    origem_sistema: "manual",
    cliente: "Reserva interna de exemplo"
  };
  const pedidoItem = {
    id: `PIT-${demoId}`,
    pedido_id: demoId,
    produto_id: produto.id,
    quantidade_base: quantidadeBase,
    origem_sistema: "manual"
  };
  estoqueIntelPedidos.unshift(pedido);
  estoqueIntelPedidoItens.unshift(pedidoItem);
  estoqueIntelMovimentacoes.unshift({
    id: `MOV-${demoId}`,
    produto_id: produto.id,
    tipo: "comprometido",
    operacao: "+",
    quantidade: quantidadeBase,
    origem: "pedido",
    origem_sistema: "manual",
    data: new Date().toISOString(),
    referencia_id: demoId
  });
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  estoqueIntelCurrentView = "pedidos";
  renderEstoque();
  visualizarDemandaEstoqueIntel(demoId);
  showToast("Exemplo de demanda criado e aberto para visualizacao.", 4000);
}

function limparReservasTesteEstoqueIntel() {
  const idsTeste = new Set(
    estoqueIntelPedidos
      .filter((pedido) => pedido.origem_sistema === "manual" && /^PEDINT-DEMO-|^PED-DEMO-ESTOQUE-/.test(String(pedido.id || "")))
      .map((pedido) => pedido.id)
  );
  if (!idsTeste.size) {
    showToast("Nenhuma reserva de teste encontrada.", 3000);
    return;
  }
  if (!confirm(`Remover ${idsTeste.size} reserva(s) de teste do Estoque Intel?\n\nEssa acao apaga demandas de exemplo, itens, movimentacoes e entregas operacionais ligadas a elas.`)) return;
  estoqueIntelPedidos = estoqueIntelPedidos.filter((pedido) => !idsTeste.has(pedido.id));
  estoqueIntelPedidoItens = estoqueIntelPedidoItens.filter((item) => !idsTeste.has(item.pedido_id));
  estoqueIntelMovimentacoes = estoqueIntelMovimentacoes.filter((mov) => !idsTeste.has(mov.referencia_id));
  provasEntrega = provasEntrega.filter((item) => !idsTeste.has(item.pedidoId));
  pedidos = pedidos.filter((pedido) => !idsTeste.has(pedido.id));
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  localStorage.setItem(PROOFS_KEY, JSON.stringify(provasEntrega));
  savePedidos();
  if (estoqueIntelListaDemandaContextoId && idsTeste.has(estoqueIntelListaDemandaContextoId)) {
    estoqueIntelListaDemandaContextoId = "";
  }
  renderEstoque();
  showToast(`${idsTeste.size} reserva(s) de teste removida(s).`, 3500);
}

function gerarExemploDemandaAutomaticaEstoqueIntel() {
  if (!estoqueIntelProdutos.length) {
    showToast("Cadastre produtos em Inteligencia > Produtos primeiro.", 3500);
    return;
  }
  const sincronizadosAntes = syncPedidosGDPToEstoqueIntel(true);
  if (!sincronizadosAntes) {
    garantirPedidoExemploDemandaAutomatica();
  }
  const sincronizados = syncPedidosGDPToEstoqueIntel(false);
  estoqueIntelCurrentView = "compra";
  const agruparEl = document.getElementById("ei-lista-agrupar");
  const compararEl = document.getElementById("ei-lista-comparar-estoque");
  const mesEl = document.getElementById("ei-lista-mes");
  const clienteEl = document.getElementById("ei-lista-cliente");
  const produtoEl = document.getElementById("ei-lista-produto");
  const fornecedorEl = document.getElementById("ei-lista-fornecedor");
  const dataDeEl = document.getElementById("ei-lista-data-de");
  const dataAteEl = document.getElementById("ei-lista-data-ate");
  if (agruparEl) agruparEl.value = "produto";
  if (compararEl) compararEl.value = "sim";
  if (clienteEl) clienteEl.value = "";
  if (produtoEl) produtoEl.value = "";
  if (fornecedorEl) fornecedorEl.value = "";
  if (dataDeEl) dataDeEl.value = "";
  if (dataAteEl) dataAteEl.value = "";
  if (mesEl) mesEl.value = new Date().toISOString().slice(0, 7);
  estoqueIntelListaPeriodoModo = "mes";
  estoqueIntelListaStatusFiltros = [];
  updateListaComprasStatusSummary();
  estoqueIntelListaComprasSelecionadas.clear();
  renderEstoque();
  renderListaComprasEstoqueIntel();
  showToast(`${sincronizados} demanda(s) prontas na lista automatica para demonstracao.`, 4000);
}

function resetVisualizacaoCompraEstoqueIntel() {
  const demoId = "PED-DEMO-ESTOQUE-001";
  if (pedidos.some((pedido) => pedido.id === demoId)) {
    pedidos = pedidos.filter((pedido) => pedido.id !== demoId);
    savePedidos();
  }
  estoqueIntelListaComprasSelecionadas.clear();
  estoqueIntelListaDemandaContextoId = "";
  estoqueIntelListaStatusFiltros = [];
  estoqueIntelListaPeriodoModo = "mes";
  const clienteEl = document.getElementById("ei-lista-cliente");
  const produtoEl = document.getElementById("ei-lista-produto");
  const fornecedorEl = document.getElementById("ei-lista-fornecedor");
  const mesEl = document.getElementById("ei-lista-mes");
  const dataDeEl = document.getElementById("ei-lista-data-de");
  const dataAteEl = document.getElementById("ei-lista-data-ate");
  const agruparEl = document.getElementById("ei-lista-agrupar");
  const compararEl = document.getElementById("ei-lista-comparar-estoque");
  if (clienteEl) clienteEl.value = "";
  if (produtoEl) produtoEl.value = "";
  if (fornecedorEl) fornecedorEl.value = "";
  if (mesEl) mesEl.value = new Date().toISOString().slice(0, 7);
  if (dataDeEl) dataDeEl.value = "";
  if (dataAteEl) dataAteEl.value = "";
  if (agruparEl) agruparEl.value = "cliente_produto";
  if (compararEl) compararEl.value = "sim";
  renderEstoque();
  renderListaComprasEstoqueIntel();
  showToast("Visualizacao de compra limpa.", 3000);
}

function limparVisualizacaoDemandasEstoqueIntel() {
  const buscaEl = document.getElementById("ei-busca");
  const baseEl = document.getElementById("ei-filtro-base");
  const reservaFiltroEl = document.getElementById("ei-pedidos-reserva-filtro");
  if (buscaEl) buscaEl.value = "";
  if (baseEl) baseEl.value = "";
  estoqueIntelFiltroReservaStatus = "";
  if (reservaFiltroEl) reservaFiltroEl.value = "";
  renderEstoque();
  showToast("Visualizacao de demandas limpa.", 3000);
}

function getPedidosReaisConciliacaoEstoqueIntel() {
  return pedidos.map((pedido) => {
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const itensComMatch = itens.filter((item) => {
      const match = resolveEstoqueIntelMatchFromPedidoItem(item);
      return !!(match?.produto && match?.quantidadeBaseUnit);
    });
    const itensSemMatch = itens.filter((item) => {
      const match = resolveEstoqueIntelMatchFromPedidoItem(item);
      return !(match?.produto && match?.quantidadeBaseUnit);
    });
    const demandaGerada = estoqueIntelPedidos.some((item) => item.id === pedido.id && item.origem_sistema === "gdp_pedido");
    return {
      pedido,
      itens,
      itensComMatch,
      itensSemMatch,
      demandaGerada,
      pendenciaLabel: !itens.length
        ? "Pedido sem itens"
        : itensSemMatch.length
          ? `${itensSemMatch.length} item(ns) sem match com produto/embalagem`
          : "Aguardando sincronizacao da demanda"
    };
  });
}

function fecharModalGerarDemandaEstoqueIntel() {
  document.getElementById("modal-ei-gerar-demanda")?.classList.add("hidden");
}

function confirmarGerarDemandaPedidoRealEstoqueIntel(pedidoId) {
  const pedido = pedidos.find((item) => item.id === pedidoId);
  if (!pedido) {
    showToast("Pedido real nao encontrado.", 3000);
    return;
  }
  const conciliacao = getPedidosReaisConciliacaoEstoqueIntel().find((item) => item.pedido.id === pedidoId);
  if (!conciliacao) {
    showToast("Nao foi possivel analisar o pedido real.", 3000);
    return;
  }
  if (!conciliacao.itensComMatch.length) {
    showToast("Esse pedido ainda nao possui itens compativeis com o cadastro do Estoque Intel.", 4500);
    return;
  }
  syncPedidosGDPToEstoqueIntel(false);
  const virouDemanda = estoqueIntelPedidos.some((item) => item.id === pedidoId && item.origem_sistema === "gdp_pedido");
  if (!virouDemanda) {
    showToast("A tentativa de gerar demanda nao encontrou itens suficientes para conversao automatica.", 4500);
    return;
  }
  fecharModalGerarDemandaEstoqueIntel();
  estoqueIntelCurrentView = "pedidos";
  renderEstoque();
  showToast("Demanda gerada a partir do pedido real.", 3500);
}

function gerarDemandaPedidoRealEstoqueIntel(pedidoId) {
  const pedido = pedidos.find((item) => item.id === pedidoId);
  // Tentar conciliação normal; se não encontrar (já sincronizado), construir dados do pedido
  let conciliacao = getPedidosReaisConciliacaoEstoqueIntel().find((item) => item.pedido.id === pedidoId);
  if (!conciliacao && pedido) {
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const itensComMatch = itens.filter(i => resolveEstoqueIntelMatchFromPedidoItem(i));
    const itensSemMatch = itens.filter(i => !resolveEstoqueIntelMatchFromPedidoItem(i));
    conciliacao = { pedido, itensComMatch, itensSemMatch, demandaGerada: estoqueIntelPedidos.some(p => p.id === pedidoId) };
  }
  const body = document.getElementById("modal-ei-gerar-demanda-body");
  const modal = document.getElementById("modal-ei-gerar-demanda");
  if (!pedido || !conciliacao || !body || !modal) {
    showToast("Pedido real nao encontrado.", 3000);
    return;
  }
  const itensConvertidos = conciliacao.itensComMatch.map((item) => {
    const match = resolveEstoqueIntelMatchFromPedidoItem(item);
    const quantidadeItens = Number(item.qtd || item.quantidade || 0);
    const quantidadeBase = quantidadeItens * Number(match?.quantidadeBaseUnit || 0);
    return {
      descricao: item.descricao || item.descricaoCompleta || "-",
      produto: match?.produto?.nome || "-",
      quantidadeBase
    };
  });
  const itensPendentes = conciliacao.itensSemMatch.map((item) => item.descricao || item.descricaoCompleta || "-");
  const totalComprometido = itensConvertidos.reduce((sum, item) => sum + Number(item.quantidadeBase || 0), 0);
  const convertidosHtml = itensConvertidos.length ? itensConvertidos.map((item) => `
    <tr>
      <td>${esc(item.descricao)}</td>
      <td>${esc(item.produto)}</td>
      <td class="text-right font-mono">${Number(item.quantidadeBase || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="3">Nenhum item compativel encontrado.</td></tr>`;
  const pendentesHtml = itensPendentes.length ? itensPendentes.map((item) => `<li>${esc(item)}</li>`).join("") : "<li>Nenhum item pendente.</li>";
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem">
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Pedido</div><div class="font-mono" style="font-weight:700">${esc(pedido.id)}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Itens convertidos</div><div style="font-weight:700">${itensConvertidos.length}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Itens pendentes</div><div style="font-weight:700">${itensPendentes.length}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Comprometido</div><div class="font-mono" style="font-weight:700">${Number(totalComprometido || 0)}</div></div>
    </div>
    <div class="table-wrap" style="margin-bottom:1rem"><table><thead><tr><th>Item do Pedido</th><th>Produto no Estoque</th><th class="text-right">Qtd Base</th></tr></thead><tbody>${convertidosHtml}</tbody></table></div>
    <div style="border:1px solid rgba(245,158,11,.28);border-radius:12px;padding:.85rem;margin-bottom:1rem;background:rgba(245,158,11,.08)">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:.4rem;color:#fbbf24">Itens que ainda nao vao virar demanda</div>
      <ul style="margin:0;padding-left:1rem;color:var(--mut);font-size:.78rem">${pendentesHtml}</ul>
      ${itensPendentes.length ? '<div style="margin-top:.6rem;font-size:.72rem;color:#fbbf24;border-top:1px solid rgba(245,158,11,.2);padding-top:.5rem">Vincule estes itens na aba <strong>Contratos</strong> &rarr; detalhes do contrato &rarr; botao <strong>Vincular</strong> ao lado de cada item. Ao vincular, a demanda sera gerada automaticamente.</div>' : ''}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="fecharModalGerarDemandaEstoqueIntel()">Cancelar</button>
      <button class="btn btn-green btn-sm" style="${itensPendentes.length === 0 ? 'box-shadow:0 0 12px rgba(34,197,94,.45);font-weight:700' : 'opacity:.7'}" onclick="confirmarGerarDemandaPedidoRealEstoqueIntel('${esc(pedidoId)}')">${itensPendentes.length === 0 ? 'Confirmar Geracao da Demanda' : 'Confirmar Geracao da Demanda (' + itensPendentes.length + ' pendente' + (itensPendentes.length > 1 ? 's' : '') + ')'}</button>
    </div>
  `;
  modal.classList.remove("hidden");
}

function abrirDemandaNaListaComprasEstoqueIntel(pedidoId) {
  const pedido = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  if (!pedido) {
    showToast("Demanda nao encontrada.", 3000);
    return;
  }
  const itens = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  const primeiroItem = itens[0];
  estoqueIntelCurrentView = "compra";
  estoqueIntelListaDemandaContextoId = pedidoId;
  estoqueIntelListaComprasSelecionadas.clear();
  estoqueIntelListaStatusFiltros = [];
  const produtoEl = document.getElementById("ei-lista-produto");
  const clienteEl = document.getElementById("ei-lista-cliente");
  const fornecedorEl = document.getElementById("ei-lista-fornecedor");
  const agruparEl = document.getElementById("ei-lista-agrupar");
  const mesEl = document.getElementById("ei-lista-mes");
  const dataDeEl = document.getElementById("ei-lista-data-de");
  const dataAteEl = document.getElementById("ei-lista-data-ate");
  if (agruparEl) agruparEl.value = "produto";
  if (produtoEl) produtoEl.value = "";
  if (clienteEl) clienteEl.value = "";
  if (fornecedorEl) fornecedorEl.value = "";
  if (mesEl) mesEl.value = String(pedido.data || pedido.data_prevista || new Date().toISOString()).slice(0, 7);
  if (dataDeEl) dataDeEl.value = "";
  if (dataAteEl) dataAteEl.value = "";
  renderEstoque();
  renderListaComprasEstoqueIntel();
  showToast("Demanda carregada na Lista Automatica de Compras.", 3500);
}

function fecharModalDemandaEstoqueIntel() {
  document.getElementById("modal-ei-demanda")?.classList.add("hidden");
}

function fecharModalCompraEstoqueIntel() {
  estoqueIntelCompraDetalheAtualId = null;
  document.getElementById("modal-ei-compra")?.classList.add("hidden");
}

function getPedidoCompraEstoqueIntelDetalheHtml(compra) {
  const fornecedor = findEstoqueIntelFornecedor(compra.fornecedor_id);
  const itensHtml = getEstoqueIntelCompraItens(compra).map((item) => {
    const produto = findEstoqueIntelProduto(item.produto_id);
    const embalagem = estoqueIntelEmbalagens.find((emb) => emb.id === item.embalagem_id);
    return `
      <tr>
        <td>${esc(produto?.nome || item.produto_id)}</td>
        <td>${esc(embalagem?.descricao || item.embalagem_id)}</td>
        <td class="text-right font-mono">${Number(item.quantidade_pacotes || 0)}</td>
        <td class="text-right font-mono">${brl.format(Number(item.preco_unitario || 0))}</td>
        <td class="text-right font-mono">${brl.format(Number(item.valor_total || 0))}</td>
      </tr>
    `;
  }).join("");
  return `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem">
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Protocolo</div><div class="font-mono" style="font-weight:700">${esc(compra.id)}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Fornecedor</div><div style="font-weight:700">${esc(fornecedor?.nome || compra.fornecedor_id)}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Origem</div><div style="font-weight:700">${esc(compra.origem_pedido_compra || "-")}</div></div>
      <div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Valor Total</div><div style="font-weight:700">${brl.format(Number(compra.valor_total || 0))}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Embalagem</th><th class="text-right">Pacotes</th><th class="text-right">Preco</th><th class="text-right">Valor</th></tr></thead><tbody>${itensHtml}</tbody></table></div>
  `;
}

function visualizarPedidoCompraEstoqueIntel(compraId) {
  const compra = estoqueIntelCompras.find((item) => item.id === compraId);
  const body = document.getElementById("modal-ei-compra-body");
  const modal = document.getElementById("modal-ei-compra");
  if (!compra || !body || !modal) {
    showToast("Pedido de compra nao encontrado.", 3000);
    return;
  }
  estoqueIntelCompraDetalheAtualId = compraId;
  body.innerHTML = getPedidoCompraEstoqueIntelDetalheHtml(compra);
  modal.classList.remove("hidden");
}

function imprimirPedidoCompraEstoqueIntelAtual() {
  const compra = estoqueIntelCompras.find((item) => item.id === estoqueIntelCompraDetalheAtualId);
  if (!compra) {
    showToast("Pedido de compra nao encontrado para impressao.", 3000);
    return;
  }
  const itens = getEstoqueIntelCompraItens(compra).map((item) => {
    const produto = findEstoqueIntelProduto(item.produto_id);
    const embalagem = estoqueIntelEmbalagens.find((emb) => emb.id === item.embalagem_id);
    return [
      produto?.nome || item.produto_id,
      embalagem?.descricao || item.embalagem_id,
      String(Number(item.quantidade_pacotes || 0)),
      brl.format(Number(item.preco_unitario || 0)),
      brl.format(Number(item.valor_total || 0))
    ];
  });
  imprimirTabelaEstoqueIntel(`Pedido de Compra ${compra.id}`, `Fornecedor: ${findEstoqueIntelFornecedor(compra.fornecedor_id)?.nome || compra.fornecedor_id} | Gerado em ${formatDateTimeLocal(compra.data || new Date().toISOString())}`, ["Produto", "Embalagem", "Pacotes", "Preco", "Valor"], itens);
}

function imprimirDemandaEstoqueIntel(pedidoId) {
  const pedido = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  if (!pedido) {
    showToast("Demanda nao encontrada para impressao.", 3000);
    return;
  }
  const itens = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  const reservaStatus = getEstoqueIntelReservaStatus(pedidoId);

  // Dados da empresa
  const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const nomeEmpresa = empresa.razaoSocial || empresa.nome || "Empresa";
  const nomeFantasia = empresa.nomeFantasia || empresa.fantasia || "";
  const empresaCnpj = empresa.cnpj || "";
  const empresaEndereco = [empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.uf, empresa.cep ? 'CEP ' + empresa.cep : ''].filter(Boolean).join(', ') || '';
  const empresaTel = empresa.telefone || '';
  const empresaEmail = empresa.email || '';

  // Dados escola/contrato do pedido original
  const pedidoOriginal = pedidos.find(pp => pp.id === (pedido.origem_pedido_id || pedido.id));
  const escolaNome = pedido.cliente || pedidoOriginal?.escola || pedidoOriginal?.cliente?.nome || '-';
  const escolaCnpj = pedidoOriginal?.cliente?.cnpj || '';
  const c = pedidoOriginal ? contratos.find(x => x.id === pedidoOriginal.contratoId) : null;
  const processoLabel = c?.processo || pedidoOriginal?.contratoId || '-';
  const obsText = pedidoOriginal?.obs || (c ? [c.processo ? 'Processo: ' + c.processo : '', c.objeto || ''].filter(Boolean).join(' - ') : '');
  const dataFormatada = fmtDate(pedido.data_prevista || pedido.data);
  const pedidoItensOriginais = pedidoOriginal?.itens || [];

  const tableRows = itens.map((item, i) => {
    const produto = findEstoqueIntelProduto(item.produto_id);
    const qtdBase = Number(item.quantidade_base || 0);
    const unidadeBase = produto?.unidade_base || 'g';
    const nomeProd = (produto?.nome || '').toLowerCase();
    const itemOriginal = nomeProd ? pedidoItensOriginais.find(oi => { const desc = (oi.descricao || '').toLowerCase(); return desc.includes(nomeProd) || nomeProd.includes(desc); }) : null;
    const qtdReal = itemOriginal ? Number(itemOriginal.qtd || itemOriginal.quantidade || 0) : '-';
    const embalagem = estoqueIntelEmbalagens.find(e => e.produto_id === item.produto_id);
    let qtdEmbLabel = '-';
    if (embalagem && Number(embalagem.quantidade_base || 0) > 0) {
      const qtdEmb = Math.ceil(qtdBase / Number(embalagem.quantidade_base));
      qtdEmbLabel = qtdEmb + ' emb. (' + Number(embalagem.quantidade_base) + ' ' + unidadeBase + ')';
    }
    return `<tr><td style="text-align:center;border:1px solid #ddd;padding:8px">${i + 1}</td><td style="border:1px solid #ddd;padding:8px">${produto?.nome || item.produto_id}</td><td style="text-align:center;border:1px solid #ddd;padding:8px">${qtdReal}</td><td style="text-align:center;border:1px solid #ddd;padding:8px">${qtdBase} ${unidadeBase}</td><td style="text-align:center;border:1px solid #ddd;padding:8px">${qtdEmbLabel}</td></tr>`;
  }).join("");

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Demanda ${pedido.id}</title><style>body{font-family:Arial,sans-serif;margin:2cm;color:#333}@media print{body{margin:1.5cm}}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem">
      <div><div style="font-size:18px;font-weight:900;letter-spacing:1px">${nomeEmpresa.toUpperCase()}${nomeFantasia ? ' <span style="font-weight:400;font-size:13px">(' + nomeFantasia + ')</span>' : ''}</div><div style="font-size:10px;color:#666;margin-top:4px">${empresaCnpj ? 'CNPJ: ' + empresaCnpj : ''}</div><div style="font-size:10px;color:#666">${empresaEndereco}</div><div style="font-size:10px;color:#666">${[empresaTel ? 'Tel: ' + empresaTel : '', empresaEmail].filter(Boolean).join(' | ')}</div></div>
      <div style="text-align:right"><div style="font-size:10px;color:#666;text-transform:uppercase">Demanda</div><div style="font-size:18px;font-weight:900;color:#2563eb">${pedido.id}</div><div style="font-size:12px;color:#666">${dataFormatada}</div><div style="font-size:11px;margin-top:4px"><strong>Reserva:</strong> ${reservaStatus.label}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:1rem;border:1px solid #ddd;font-size:12px">
      <div style="padding:8px;border-bottom:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">ESCOLA / ÓRGÃO</span><br><strong>${escolaNome}</strong></div>
      <div style="padding:8px;border-bottom:1px solid #ddd;border-left:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">CNPJ</span><br><strong>${escolaCnpj || '-'}</strong></div>
      <div style="padding:8px"><span style="color:#666;font-size:10px;text-transform:uppercase">QTD. ITENS</span><br><strong>${itens.length} produto(s)</strong></div>
      <div style="padding:8px;border-left:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">CONTRATO</span><br><strong>${processoLabel}</strong></div>
    </div>
    ${obsText ? `<div style="border:1px solid #ddd;padding:10px;margin-bottom:1rem;font-size:12px"><strong>DADOS DO CONTRATO</strong><br>Processo: <strong>${processoLabel}</strong><br>Observações: ${obsText}</div>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:1rem"><thead><tr style="background:#f5f5f5"><th style="border:1px solid #ddd;padding:8px;text-align:center">#</th><th style="border:1px solid #ddd;padding:8px">PRODUTO</th><th style="border:1px solid #ddd;padding:8px;text-align:center">QTD</th><th style="border:1px solid #ddd;padding:8px;text-align:center">BASE</th><th style="border:1px solid #ddd;padding:8px;text-align:center">QTD EMB.</th></tr></thead><tbody>${tableRows}</tbody></table>
    <div style="display:flex;justify-content:space-around;margin-top:3rem;font-size:11px"><div style="text-align:center;width:40%"><div style="border-top:1px solid #333;padding-top:6px"><strong>Recebedor(a)</strong><br>Nome / Cargo / Matrícula</div></div><div style="text-align:center;width:40%"><div style="border-top:1px solid #333;padding-top:6px"><strong>Entregador</strong><br>${nomeEmpresa}</div></div></div>
    <div style="text-align:center;margin-top:3rem;font-size:9px;color:#999">Documento gerado automaticamente pelo sistema GDP — Gestão de Pedidos<br>${nomeEmpresa}${empresaCnpj ? ' — CNPJ ' + empresaCnpj : ''}</div>
  </body></html>`);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 5000);
}

function fecharReservaDemandaEstoqueIntel(pedidoId) {
  const pedido = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  if (!pedido) {
    showToast("Demanda nao encontrada.", 3000);
    return;
  }
  const reservaStatus = getEstoqueIntelReservaStatus(pedidoId);
  if (reservaStatus.key === "baixada") {
    showToast("Essa demanda ja foi entregue e baixada no estoque.", 3500);
    return;
  }
  if (reservaStatus.key === "encerrada_manual") {
    showToast("Essa reserva ja foi encerrada manualmente.", 3500);
    return;
  }
  if (!confirm(`Encerrar manualmente a reserva da demanda ${pedidoId}?\n\nIsso vai retirar apenas o comprometido, sem baixar estoque fisico.`)) return;
  const itens = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  if (!itens.length) {
    showToast("A demanda nao possui itens para encerrar a reserva.", 3500);
    return;
  }
  itens.forEach((item, idx) => {
    const quantidade = Number(item.quantidade_base || 0);
    if (!item.produto_id || !quantidade) return;
    estoqueIntelMovimentacoes.push({
      id: `ENC-MOV-COM-${pedidoId}-${idx + 1}`,
      produto_id: item.produto_id,
      tipo: "comprometido",
      operacao: "-",
      quantidade,
      origem: "reserva_encerrada_manual",
      origem_sistema: "gdp_reserva",
      data: new Date().toISOString(),
      referencia_id: pedidoId
    });
  });
  pedido.status = "reserva_encerrada_manual";
  saveEstoqueIntelPedidos();
  saveEstoqueIntelMovimentacoes();
  renderEstoque();
  visualizarDemandaEstoqueIntel(pedidoId);
  showToast(`Reserva da demanda ${pedidoId} encerrada manualmente.`, 4000);
}

function visualizarDemandaEstoqueIntel(pedidoId) {
  const pedido = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  const body = document.getElementById("modal-ei-demanda-body");
  const modal = document.getElementById("modal-ei-demanda");
  if (!pedido || !body || !modal) {
    showToast("Demanda nao encontrada.", 3000);
    return;
  }
  const itens = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  const reservaStatus = getEstoqueIntelReservaStatus(pedidoId);

  // Dados da empresa
  const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const nomeEmpresa = empresa.razaoSocial || empresa.nome || "Empresa";
  const nomeFantasia = empresa.nomeFantasia || empresa.fantasia || "";
  const empresaCnpj = empresa.cnpj || "";
  const empresaEndereco = [empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.uf, empresa.cep ? 'CEP ' + empresa.cep : ''].filter(Boolean).join(', ') || '';
  const empresaTel = empresa.telefone || '';
  const empresaEmail = empresa.email || '';

  // Dados da escola/cliente (buscar do pedido original se sincronizado)
  const pedidoOriginal = pedidos.find(pp => pp.id === (pedido.origem_pedido_id || pedido.id));
  const escolaNome = pedido.cliente || pedidoOriginal?.escola || pedidoOriginal?.cliente?.nome || '-';
  const escolaCnpj = pedidoOriginal?.cliente?.cnpj || '';
  const c = pedidoOriginal ? contratos.find(x => x.id === pedidoOriginal.contratoId) : null;
  const processoLabel = c?.processo || pedidoOriginal?.contratoId || '-';
  const obsText = pedidoOriginal?.obs || (c ? [c.processo ? 'Processo: ' + c.processo : '', c.objeto || ''].filter(Boolean).join(' - ') : '');
  const dataFormatada = fmtDate(pedido.data_prevista || pedido.data);
  const totalItens = itens.length;

  // Tabela de itens com Qtd Emb.
  // Buscar qtd real do pedido original (match por nome do produto)
  const pedidoItensOriginais = pedidoOriginal?.itens || [];
  const itensHtml = itens.map((item, i) => {
    const produto = findEstoqueIntelProduto(item.produto_id);
    const qtdBase = Number(item.quantidade_base || 0);
    const unidadeBase = produto?.unidade_base || 'g';
    // Qtd real: buscar do pedido original por nome do produto
    const nomeProd = (produto?.nome || '').toLowerCase();
    const itemOriginal = nomeProd ? pedidoItensOriginais.find(oi => { const desc = (oi.descricao || '').toLowerCase(); return desc.includes(nomeProd) || nomeProd.includes(desc); }) : null;
    const qtdReal = itemOriginal ? Number(itemOriginal.qtd || itemOriginal.quantidade || 0) : '-';
    const embalagem = estoqueIntelEmbalagens.find(e => e.produto_id === item.produto_id);
    let qtdEmbLabel = '-';
    if (embalagem && Number(embalagem.quantidade_base || 0) > 0) {
      const qtdEmb = Math.ceil(qtdBase / Number(embalagem.quantidade_base));
      qtdEmbLabel = qtdEmb + ' emb. (' + Number(embalagem.quantidade_base) + ' ' + unidadeBase + ')';
    }
    return `<tr style="border-top:1px solid rgba(71,85,105,.3)">
      <td style="text-align:center;padding:.5rem .8rem">${i + 1}</td>
      <td style="padding:.5rem .8rem">${esc(produto?.nome || item.produto_id)}</td>
      <td style="text-align:center;padding:.5rem .8rem">${qtdReal}</td>
      <td style="text-align:center;padding:.5rem .8rem;font-family:monospace">${qtdBase} ${esc(unidadeBase)}</td>
      <td style="text-align:center;padding:.5rem .8rem">${esc(qtdEmbLabel)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" style="text-align:center;padding:.8rem;color:var(--mut)">Sem itens vinculados.</td></tr>`;

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.2rem">
      <div>
        <div style="font-size:1.1rem;font-weight:900;letter-spacing:.5px">${esc(nomeEmpresa.toUpperCase())}${nomeFantasia ? ' <span style="font-weight:400;font-size:.82rem">(' + esc(nomeFantasia) + ')</span>' : ''}</div>
        <div style="font-size:.75rem;color:var(--mut);margin-top:.2rem">${empresaCnpj ? 'CNPJ: ' + esc(empresaCnpj) : ''}</div>
        <div style="font-size:.75rem;color:var(--mut)">${esc(empresaEndereco)}</div>
        <div style="font-size:.75rem;color:var(--mut)">${[empresaTel ? 'Tel: ' + empresaTel : '', empresaEmail].filter(Boolean).join(' | ')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase">Demanda</div>
        <div style="font-size:1.1rem;font-weight:900;color:var(--blue);font-family:monospace">${esc(pedido.id)}</div>
        <div style="font-size:.78rem;color:var(--mut)">${dataFormatada}</div>
        <div style="margin-top:.3rem"><span class="badge ${reservaStatus.badgeClass}">${esc(reservaStatus.label)}</span></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:1rem;border:1px solid var(--bdr);font-size:.82rem;border-radius:8px;overflow:hidden">
      <div style="padding:.6rem .8rem;border-bottom:1px solid var(--bdr)"><span style="color:var(--mut);font-size:.7rem;text-transform:uppercase">ESCOLA / ÓRGÃO</span><br><strong>${esc(escolaNome)}</strong></div>
      <div style="padding:.6rem .8rem;border-bottom:1px solid var(--bdr);border-left:1px solid var(--bdr)"><span style="color:var(--mut);font-size:.7rem;text-transform:uppercase">CNPJ</span><br><strong>${esc(escolaCnpj || '-')}</strong></div>
      <div style="padding:.6rem .8rem;border-bottom:1px solid var(--bdr)"><span style="color:var(--mut);font-size:.7rem;text-transform:uppercase">QTD. ITENS</span><br><strong>${totalItens} produto(s)</strong></div>
      <div style="padding:.6rem .8rem;border-bottom:1px solid var(--bdr);border-left:1px solid var(--bdr)"><span style="color:var(--mut);font-size:.7rem;text-transform:uppercase">CONTRATO</span><br><strong>${esc(processoLabel)}</strong></div>
    </div>
    ${obsText ? `<div style="border:1px solid var(--bdr);padding:.7rem .9rem;margin-bottom:1rem;font-size:.82rem;border-radius:8px"><strong>DADOS DO CONTRATO</strong><br>Processo: <strong>${esc(processoLabel)}</strong><br>Observações: ${esc(obsText)}</div>` : ''}
    <div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin-bottom:1rem">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead><tr style="background:var(--s2)">
          <th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">#</th>
          <th style="padding:.5rem .8rem;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Produto</th>
          <th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Qtd</th>
          <th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Base</th>
          <th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Qtd Emb.</th>
        </tr></thead>
        <tbody>${itensHtml}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-around;margin-top:1.5rem;font-size:.78rem;margin-bottom:1rem">
      <div style="text-align:center;width:40%"><div style="border-top:1px solid var(--bdr);padding-top:.5rem"><strong>Recebedor(a)</strong><br><span style="color:var(--mut)">Nome / Cargo / Matrícula</span></div></div>
      <div style="text-align:center;width:40%"><div style="border-top:1px solid var(--bdr);padding-top:.5rem"><strong>Entregador</strong><br><span style="color:var(--mut)">${esc(nomeEmpresa)}</span></div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap;margin-top:1rem">
      <button class="btn btn-outline btn-sm" onclick="imprimirDemandaEstoqueIntel('${esc(pedidoId)}')">Imprimir</button>
      ${reservaStatus.key === "reservada" ? `<button class="btn btn-outline btn-sm" onclick="fecharReservaDemandaEstoqueIntel('${esc(pedidoId)}')">Cancelar Reserva</button>` : ""}
      <button class="btn btn-outline btn-sm" onclick="fecharModalDemandaEstoqueIntel()">Fechar</button>
    </div>
  `;
  modal.classList.remove("hidden");
}

function atualizarResumoSelecaoListaComprasEstoqueIntel(rows = []) {
  const resumoEl = document.getElementById("ei-lista-compras-lote-resumo");
  const selectAll = document.getElementById("ei-lista-compras-select-all");
  if (!resumoEl) return;
  const elegiveis = rows.filter((item) => item.faltante > 0 && item.fornecedor?.id && item.sugestao?.embalagemId);
  const selecionadas = elegiveis.filter((item) => estoqueIntelListaComprasSelecionadas.has(item.rowKey));
  resumoEl.textContent = `${selecionadas.length} linha(s) selecionada(s) para lote | ${elegiveis.length} elegivel(is) para gerar pedido`;
  if (selectAll) {
    selectAll.checked = elegiveis.length > 0 && selecionadas.length === elegiveis.length;
    selectAll.indeterminate = selecionadas.length > 0 && selecionadas.length < elegiveis.length;
  }
}

function toggleLinhaListaComprasEstoqueIntel(rowKey, checked) {
  if (checked) estoqueIntelListaComprasSelecionadas.add(rowKey);
  else estoqueIntelListaComprasSelecionadas.delete(rowKey);
  atualizarResumoSelecaoListaComprasEstoqueIntel(buildListaComprasEstoqueIntelRows());
}

function toggleSelecionarTodasListaComprasEstoqueIntel(checked) {
  const rows = buildListaComprasEstoqueIntelRows();
  const elegiveis = rows.filter((item) => item.faltante > 0 && item.fornecedor?.id && item.sugestao?.embalagemId);
  if (checked) elegiveis.forEach((item) => estoqueIntelListaComprasSelecionadas.add(item.rowKey));
  else estoqueIntelListaComprasSelecionadas.clear();
  renderListaComprasEstoqueIntel();
}

function gerarPedidosCompraListaSelecionados() {
  const rows = buildListaComprasEstoqueIntelRows();
  const selecionadas = rows.filter((item) => estoqueIntelListaComprasSelecionadas.has(item.rowKey) && item.faltante > 0 && item.fornecedor?.id && item.sugestao?.embalagemId);
  if (!selecionadas.length) {
    showToast("Selecione ao menos uma linha elegivel da lista automatica.", 3500);
    return;
  }
  const vencimento = document.getElementById("ei-compra-vencimento")?.value || new Date().toISOString().slice(0, 10);
  const grupos = new Map();
  selecionadas.forEach((item) => {
    const key = item.fornecedor.id;
    const grupo = grupos.get(key) || [];
    grupo.push({
      produtoId: item.produto.id,
      embalagemId: item.sugestao.embalagemId,
      quantidadePacotes: item.sugestao.quantidadePacotes,
      necessidadeBase: item.faltante,
      sobraEstimada: item.sugestao.sobra
    });
    grupos.set(key, grupo);
  });
  let gerados = 0;
  grupos.forEach((itens, fornecedorId) => {
    const compra = criarPedidoCompraEstoqueIntel({
      fornecedorId,
      itens,
      vencimento,
      origem: "lista_automatica_lote"
    });
    if (compra) gerados += 1;
  });
  estoqueIntelListaComprasSelecionadas.clear();
  renderListaComprasEstoqueIntel();
  showToast(`${gerados} pedido(s) de compra gerado(s) em lote, agrupados por fornecedor.`, 4000);
}

function resolveSuggestedSupplierForProduto(produtoId, quantidadeNecessaria) {
  const embalagens = estoqueIntelEmbalagens.filter((item) => item.produto_id === produtoId);
  const opcoes = calcularCompraInteligente(quantidadeNecessaria, embalagens);
  let melhor = null;
  estoqueIntelFornecedores.forEach((fornecedor) => {
    opcoes.forEach((opcao) => {
      const pricing = getEstoqueIntelPrecoFornecedorOuReferencia(fornecedor, opcao.embalagemId);
      if (!(pricing.preco_unitario > 0)) return;
      const valorTotal = Number(pricing.preco_unitario || 0) * Number(opcao.quantidadePacotes || 0);
      if (!melhor || valorTotal < melhor.valorTotal) {
        melhor = {
          fornecedor,
          opcao,
          valorTotal,
          pricing
        };
      }
    });
  });
  return melhor;
}

function buildListaComprasEstoqueIntelRows() {
  const dataConsiderada = document.getElementById("ei-lista-data-considerada")?.value || "pedido";
  const agruparPor = document.getElementById("ei-lista-agrupar")?.value || "cliente_produto";
  const compararEstoque = (document.getElementById("ei-lista-comparar-estoque")?.value || "sim") === "sim";
  const clienteFiltro = document.getElementById("ei-lista-cliente")?.value || "";
  const produtoFiltro = document.getElementById("ei-lista-produto")?.value || "";
  const fornecedorFiltro = document.getElementById("ei-lista-fornecedor")?.value || "";
  const mesFiltro = document.getElementById("ei-lista-mes")?.value || "";
  const dataDe = document.getElementById("ei-lista-data-de")?.value || "";
  const dataAte = document.getElementById("ei-lista-data-ate")?.value || "";
  const resumoEstoque = getEstoqueIntelResumo();
  const rows = [];

  if (estoqueIntelListaDemandaContextoId) {
    const demanda = estoqueIntelPedidos.find((pedido) => pedido.id === estoqueIntelListaDemandaContextoId);
    const itensDemanda = estoqueIntelPedidoItens.filter((item) => item.pedido_id === estoqueIntelListaDemandaContextoId);
    if (!demanda || !itensDemanda.length) return [];
    const dataBase = String(demanda.data_prevista || demanda.data || new Date().toISOString().slice(0, 10)).slice(0, 10);
    itensDemanda.forEach((item) => {
      const produto = findEstoqueIntelProduto(item.produto_id);
      if (!produto) return;
      if (produtoFiltro && produto.id !== produtoFiltro) return;
      const quantidade = Number(item.quantidade_base || 0);
      if (!quantidade) return;
      const sugestaoFornecedor = resolveSuggestedSupplierForProduto(produto.id, quantidade);
      if (fornecedorFiltro && sugestaoFornecedor?.fornecedor?.id !== fornecedorFiltro) return;
      rows.push({
        pedidoId: demanda.id,
        cliente: demanda.cliente || "Demanda selecionada",
        produto,
        status: demanda.status || "emitido",
        data: dataBase,
        quantidade,
        fornecedor: sugestaoFornecedor?.fornecedor || null,
        sugestao: sugestaoFornecedor?.opcao || null,
        estoqueDisponivel: resumoEstoque.find((resumo) => resumo.produto.id === produto.id)?.disponivel || 0
      });
    });
  } else {

    pedidos.forEach((pedido) => {
      const status = normalizePedidoStatus(pedido.status);
      if (estoqueIntelListaStatusFiltros.length && !estoqueIntelListaStatusFiltros.includes(status)) return;
      const dataRef = getPedidoDataConsiderada(pedido, dataConsiderada);
      const dataBase = String(dataRef || "").slice(0, 10);
      if (estoqueIntelListaPeriodoModo === "mes" && mesFiltro && !dataBase.startsWith(mesFiltro)) return;
      if (estoqueIntelListaPeriodoModo === "intervalo") {
        if (dataDe && dataBase < dataDe) return;
        if (dataAte && dataBase > dataAte) return;
      }
      (pedido.itens || []).forEach((item) => {
        const match = resolveEstoqueIntelMatchFromPedidoItem(item);
        if (!match?.produto || !match.quantidadeBaseUnit) return;
        const cliente = pedido.cliente?.nome || pedido.escola || "-";
        const quantidade = Number(item.qtd || item.quantidade || 0) * Number(match.quantidadeBaseUnit || 0);
        if (!quantidade) return;
        if (clienteFiltro && cliente !== clienteFiltro) return;
        if (produtoFiltro && match.produto.id !== produtoFiltro) return;
        const sugestaoFornecedor = resolveSuggestedSupplierForProduto(match.produto.id, quantidade);
        if (fornecedorFiltro && sugestaoFornecedor?.fornecedor?.id !== fornecedorFiltro) return;
        rows.push({
          pedidoId: pedido.id,
          cliente,
          produto: match.produto,
          status,
          data: dataBase,
          quantidade,
          fornecedor: sugestaoFornecedor?.fornecedor || null,
          sugestao: sugestaoFornecedor?.opcao || null,
          estoqueDisponivel: resumoEstoque.find((resumo) => resumo.produto.id === match.produto.id)?.disponivel || 0
        });
      });
    });
  }

  const grouped = new Map();
  rows.forEach((row) => {
    const key = agruparPor === "fornecedor_produto"
      ? `${row.fornecedor?.id || "sem_fornecedor"}|${row.produto.id}`
      : agruparPor === "produto"
        ? `${row.produto.id}`
        : `${row.cliente}|${row.produto.id}`;
    const prev = grouped.get(key) || {
      rowKey: key,
      grupo: agruparPor === "fornecedor_produto"
        ? (row.fornecedor?.nome || "Sem fornecedor")
        : agruparPor === "produto"
          ? row.produto.nome
          : row.cliente,
      fornecedor: row.fornecedor,
      produto: row.produto,
      status: new Set(),
      data: row.data,
      necessidade: 0,
      estoqueDisponivel: row.estoqueDisponivel,
      sugestao: row.sugestao
    };
    prev.status.add(getPedidoStatusMeta(row.status).label);
    prev.data = !prev.data || row.data < prev.data ? row.data : prev.data;
    prev.necessidade += row.quantidade;
    prev.estoqueDisponivel = row.estoqueDisponivel;
    if ((!prev.sugestao || row.necessidade > prev.necessidade) && row.sugestao) prev.sugestao = row.sugestao;
    grouped.set(key, prev);
  });

  return [...grouped.values()].map((item) => {
    const faltante = compararEstoque
      ? Math.max(0, Number(item.necessidade || 0) - Math.max(0, Number(item.estoqueDisponivel || 0)))
      : Math.max(0, Number(item.necessidade || 0));
    const sugestao = faltante > 0 ? resolveSuggestedSupplierForProduto(item.produto.id, faltante) : null;
    return {
      ...item,
      faltante,
      sugestao: sugestao?.opcao || item.sugestao || null,
      fornecedor: item.fornecedor || sugestao?.fornecedor || null,
      statusLabel: [...item.status].join(", ")
    };
  });
}

function renderListaComprasEstoqueIntel() {
  const tbody = document.getElementById("ei-lista-compras-tbody");
  const resumoEl = document.getElementById("ei-lista-compras-resumo");
  const contextoEl = document.getElementById("ei-lista-demanda-contexto");
  if (!tbody || !resumoEl) return;
  const rows = buildListaComprasEstoqueIntelRows();
  const demandaContexto = estoqueIntelListaDemandaContextoId ? estoqueIntelPedidos.find((pedido) => pedido.id === estoqueIntelListaDemandaContextoId) : null;
  if (contextoEl) {
    if (demandaContexto) {
      contextoEl.classList.remove("hidden");
      contextoEl.innerHTML = `<strong>Voce esta comprando a partir da demanda ${esc(demandaContexto.id)}</strong><br><span style="color:#bfdbfe">Cliente/Origem: ${esc(demandaContexto.cliente || "-")} | Use "Voltar" para sair desse modo e retornar a lista geral.</span>`;
    } else {
      contextoEl.classList.add("hidden");
      contextoEl.innerHTML = "";
    }
  }
  const compararEstoque = (document.getElementById("ei-lista-comparar-estoque")?.value || "sim") === "sim";
  const totalNecessidade = rows.reduce((sum, item) => sum + Number(item.necessidade || 0), 0);
  const totalComprar = rows.reduce((sum, item) => sum + Number(item.faltante || 0), 0);
  resumoEl.textContent = `${demandaContexto ? `Demanda selecionada: ${demandaContexto.id} | ` : ""}${rows.length} agrupamento(s) gerado(s) | Necessidade total: ${totalNecessidade} | Compra sugerida: ${totalComprar}${compararEstoque ? " | comparando com estoque atual" : " | sem comparar com estoque"}`;
  tbody.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td class="text-center">${item.faltante > 0 && item.fornecedor?.id && item.sugestao?.embalagemId ? `<input type="checkbox" onchange="toggleLinhaListaComprasEstoqueIntel(decodeURIComponent('${encodeURIComponent(item.rowKey)}'), this.checked)" ${estoqueIntelListaComprasSelecionadas.has(item.rowKey) ? "checked" : ""}>` : ""}</td>
      <td>${esc(item.grupo)}</td>
      <td>${esc(item.fornecedor?.nome || "-")}</td>
      <td>${esc(item.produto.nome)}</td>
      <td>${esc(item.statusLabel || "-")}</td>
      <td>${fmtDate(item.data)}</td>
      <td class="text-right font-mono">${Number(item.necessidade || 0)}</td>
      <td class="text-right font-mono">${Number(item.estoqueDisponivel || 0)}</td>
      <td class="text-right font-mono" style="color:${Number(item.faltante || 0) > 0 ? "var(--yellow)" : "var(--green)"};font-weight:700">${Number(item.faltante || 0)}</td>
      <td style="font-size:.78rem;color:var(--mut)">${item.sugestao ? `${esc(item.sugestao.descricao)} | ${item.sugestao.quantidadePacotes} pacotes | sobra ${item.sugestao.sobra}` : "Sem compra sugerida"}</td>
      <td class="text-right">${item.faltante > 0 && item.fornecedor?.id && item.sugestao?.embalagemId ? `<button class="btn btn-outline btn-sm" onclick="gerarPedidoCompraDaListaEstoqueIntel('${esc(item.produto.id)}','${esc(item.fornecedor.id)}','${esc(item.sugestao.embalagemId)}','${Number(item.sugestao.quantidadePacotes || 0)}','${Number(item.faltante || 0)}','${Number(item.sugestao.sobra || 0)}')">Gerar Pedido</button>` : `<span style="font-size:.72rem;color:var(--mut)">Sem acao</span>`}</td>
    </tr>
  `).join("") : `<tr><td colspan="11" style="color:var(--mut)">Nenhuma necessidade encontrada para os filtros atuais.</td></tr>`;
  atualizarResumoSelecaoListaComprasEstoqueIntel(rows);
}

function registrarFornecedorEstoqueIntel() {
  const existingId = document.getElementById("ei-forn-existing")?.value || "";
  const nome = (document.getElementById("ei-forn-nome")?.value || "").trim();
  const documento = (document.getElementById("ei-forn-doc")?.value || "").trim();
  const telefone = (document.getElementById("ei-forn-telefone")?.value || "").trim();
  const email = (document.getElementById("ei-forn-email")?.value || "").trim();
  const status = document.getElementById("ei-forn-status")?.value || "ativo";
  const embalagemId = document.getElementById("ei-forn-embalagem")?.value || "";
  const precoUnitario = Number(document.getElementById("ei-forn-preco")?.value || 0);
  const isCadastroFornecedor = !!(nome || documento || telefone || email);
  const isCadastroOferta = !!(existingId || embalagemId || precoUnitario);
  if (!isCadastroFornecedor && !isCadastroOferta) {
    showToast("Preencha os dados do fornecedor ou informe uma oferta.", 3500);
    return;
  }
  if (isCadastroOferta && (!existingId || !embalagemId || !precoUnitario)) {
    if (!isCadastroFornecedor) {
      showToast("Para salvar oferta, selecione fornecedor, embalagem e preco unitario.", 3500);
      return;
    }
  }
  if ((embalagemId && !precoUnitario) || (!embalagemId && precoUnitario)) {
    showToast("Para salvar oferta, informe embalagem e preco unitario juntos.", 3500);
    return;
  }
  let fornecedor = existingId ? findEstoqueIntelFornecedor(existingId) : null;
  if (!fornecedor && isCadastroFornecedor) {
    fornecedor = {
      id: genId("FORN"),
      nome,
      documento,
      telefone,
      email,
      status,
      embalagens: []
    };
    estoqueIntelFornecedores.push(fornecedor);
  } else if (fornecedor && isCadastroFornecedor) {
    fornecedor.nome = nome || fornecedor.nome;
    fornecedor.documento = documento || fornecedor.documento;
    fornecedor.telefone = telefone || fornecedor.telefone || "";
    fornecedor.email = email || fornecedor.email || "";
    fornecedor.status = status || fornecedor.status;
  }
  if (!fornecedor && existingId) {
    showToast("Fornecedor selecionado nao encontrado.", 3500);
    return;
  }
  if (fornecedor && embalagemId && precoUnitario) {
    const ofertaAtual = getFornecedorOferta(fornecedor, embalagemId);
    if (ofertaAtual) {
      ofertaAtual.preco_unitario = precoUnitario;
    } else {
      fornecedor.embalagens.push({ embalagem_id: embalagemId, preco_unitario: precoUnitario });
    }
  }
  saveEstoqueIntelFornecedores();
  ["ei-forn-nome", "ei-forn-doc", "ei-forn-telefone", "ei-forn-email", "ei-forn-preco"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  const embalagemSelect = document.getElementById("ei-forn-embalagem");
  if (embalagemSelect) embalagemSelect.value = "";
  const existingSelect = document.getElementById("ei-forn-existing");
  if (existingSelect) existingSelect.value = "";
  renderEstoque();
  if (isCadastroFornecedor && embalagemId && precoUnitario) {
    showToast("Fornecedor e oferta salvos no Estoque Intel.", 3000);
  } else if (isCadastroFornecedor) {
    showToast("Fornecedor salvo no Estoque Intel.", 3000);
  } else {
    showToast("Oferta salva no Estoque Intel.", 3000);
  }
}

function getEstoqueIntelFornecedorDependencias(fornecedorId) {
  const dependencias = [];
  const totalCompras = estoqueIntelCompras.filter((item) => item.fornecedor_id === fornecedorId).length;
  if (totalCompras) dependencias.push(`${totalCompras} compra(s)`);
  return dependencias;
}

function excluirFornecedorEstoqueIntel(fornecedorId) {
  const fornecedor = findEstoqueIntelFornecedor(fornecedorId);
  if (!fornecedor) {
    showToast("Fornecedor nao encontrado no Estoque Intel.", 3000);
    return;
  }
  const dependencias = getEstoqueIntelFornecedorDependencias(fornecedorId);
  if (dependencias.length) {
    showToast(`Nao foi possivel excluir ${fornecedor.nome}: ha ${dependencias.join(", ")} vinculadas.`, 4500);
    return;
  }
  if (!confirm(`Excluir o fornecedor "${fornecedor.nome}" e todas as ofertas sem compra vinculada?`)) return;
  estoqueIntelFornecedores = estoqueIntelFornecedores.filter((item) => item.id !== fornecedorId);
  saveEstoqueIntelFornecedores();
  renderEstoque();
  showToast("Fornecedor excluido do Estoque Intel.", 3000);
}

function getEstoqueIntelOfertaDependencias(fornecedorId, embalagemId) {
  const dependencias = [];
  const totalCompras = estoqueIntelCompras.filter((item) => item.fornecedor_id === fornecedorId && getEstoqueIntelCompraItens(item).some((compraItem) => compraItem.embalagem_id === embalagemId)).length;
  if (totalCompras) dependencias.push(`${totalCompras} compra(s)`);
  return dependencias;
}

function excluirOfertaFornecedorEstoqueIntel(fornecedorId, embalagemId) {
  const fornecedor = findEstoqueIntelFornecedor(fornecedorId);
  if (!fornecedor) {
    showToast("Fornecedor nao encontrado no Estoque Intel.", 3000);
    return;
  }
  const oferta = getFornecedorOferta(fornecedor, embalagemId);
  if (!oferta) {
    showToast("Oferta nao encontrada no Estoque Intel.", 3000);
    return;
  }
  const dependencias = getEstoqueIntelOfertaDependencias(fornecedorId, embalagemId);
  if (dependencias.length) {
    showToast(`Nao foi possivel excluir a oferta: ha ${dependencias.join(", ")} vinculadas.`, 4500);
    return;
  }
  const embalagem = estoqueIntelEmbalagens.find((item) => item.id === embalagemId);
  if (!confirm(`Excluir a oferta de ${fornecedor.nome} para ${embalagem?.descricao || embalagemId}?`)) return;
  fornecedor.embalagens = (fornecedor.embalagens || []).filter((item) => item.embalagem_id !== embalagemId);
  saveEstoqueIntelFornecedores();
  renderEstoque();
  showToast("Oferta excluida do Estoque Intel.", 3000);
}

function criarPedidoCompraEstoqueIntel({ fornecedorId, itens = [], vencimento, origem = "manual" }) {
  const fornecedor = findEstoqueIntelFornecedor(fornecedorId);
  if (!fornecedor || !Array.isArray(itens) || !itens.length) {
    showToast("Informe fornecedor e ao menos um item valido para gerar o pedido.", 4000);
    return null;
  }
  const itensNormalizados = [];
  for (const item of itens) {
    const produto = findEstoqueIntelProduto(item.produtoId || item.produto_id);
    const embalagem = estoqueIntelEmbalagens.find((emb) => emb.id === (item.embalagemId || item.embalagem_id));
    const qtdPacotes = Number(item.quantidadePacotes || item.quantidade_pacotes || 0);
    if (!produto || !embalagem || !(qtdPacotes > 0)) continue;
    const pricing = getEstoqueIntelPrecoFornecedorOuReferencia(fornecedor, embalagem.id);
    if (!(pricing.preco_unitario > 0)) continue;
    itensNormalizados.push({
      produto_id: produto.id,
      embalagem_id: embalagem.id,
      quantidade_pacotes: qtdPacotes,
      total_comprado: Number(embalagem.quantidade_base || 0) * qtdPacotes,
      sobra_estimada: Number(item.sobraEstimada || item.sobra_estimada || 0),
      preco_unitario: Number(pricing.preco_unitario || 0),
      valor_total: Number(pricing.preco_unitario || 0) * qtdPacotes,
      origem_preco: pricing.origem,
      necessidade_base: Number(item.necessidadeBase || item.necessidade_base || 0)
    });
  }
  if (!itensNormalizados.length) {
    showToast("Nenhum item valido foi encontrado para gerar o pedido.", 4000);
    return null;
  }
  const compra = {
    id: genId("COMP"),
    fornecedor_id: fornecedor.id,
    data: new Date().toISOString(),
    status: "pedido_compra_emitido",
    itens: itensNormalizados,
    total_itens: itensNormalizados.length,
    valor_total: itensNormalizados.reduce((sum, item) => sum + Number(item.valor_total || 0), 0),
    origem_pedido_compra: origem,
    vencimento_financeiro: vencimento || new Date().toISOString().slice(0, 10),
    erp: {
      status: "pedido_compra_pronto",
      endpoint: "/api/estoque-intel-erp",
      updatedAt: new Date().toISOString()
    }
  };
  estoqueIntelCompras.unshift(compra);
  saveEstoqueIntelCompras();
  renderEstoque();
  return compra;
}

function gerarPreCompraEstoqueIntel() {
  const fornecedorId = document.getElementById("ei-compra-fornecedor")?.value || "";
  const vencimento = document.getElementById("ei-compra-vencimento")?.value || new Date().toISOString().slice(0, 10);
  const fornecedor = findEstoqueIntelFornecedor(fornecedorId);
  const melhorOpcao = estoqueIntelUltimaSugestao?.opcoes?.find((item) => item.melhorOpcao) || estoqueIntelUltimaSugestao?.opcoes?.[0];
  if (!fornecedor || !estoqueIntelUltimaSugestao?.produto || !melhorOpcao) {
    showToast("Calcule a sugestao e selecione o fornecedor antes de gerar o pedido de compra.", 4000);
    return;
  }
  const compra = criarPedidoCompraEstoqueIntel({
    fornecedorId: fornecedor.id,
    itens: [{
      produtoId: estoqueIntelUltimaSugestao.produto.id,
      embalagemId: melhorOpcao.embalagemId,
      quantidadePacotes: melhorOpcao.quantidadePacotes,
      necessidadeBase: estoqueIntelUltimaSugestao.necessidade,
      sobraEstimada: melhorOpcao.sobra
    }],
    vencimento,
    origem: "sugestao_inteligente"
  });
  if (!compra) return;
  showToast("Pedido de compra gerado para o fornecedor.", 4000);
}

function atualizarCompraManualEmbalagens() {
  const produtoId = document.getElementById("ei-compra-manual-produto")?.value || "";
  const select = document.getElementById("ei-compra-manual-embalagem");
  if (!select) return;
  const previous = select.value;
  const options = estoqueIntelEmbalagens
    .filter((item) => !produtoId || item.produto_id === produtoId)
    .map((item) => `<option value="${esc(item.id)}">${esc(item.descricao)} (${Number(item.quantidade_base || 0)})</option>`)
    .join("");
  select.innerHTML = `<option value="">Selecione</option>${options}`;
  if (previous && estoqueIntelEmbalagens.some((item) => item.id === previous && (!produtoId || item.produto_id === produtoId))) {
    select.value = previous;
  }
}

function gerarPedidoCompraManualEstoqueIntel() {
  const produtoId = document.getElementById("ei-compra-manual-produto")?.value || "";
  const embalagemId = document.getElementById("ei-compra-manual-embalagem")?.value || "";
  const fornecedorId = document.getElementById("ei-compra-manual-fornecedor")?.value || "";
  const quantidadePacotes = Number(document.getElementById("ei-compra-manual-pacotes")?.value || 0);
  const vencimento = document.getElementById("ei-compra-manual-vencimento")?.value || new Date().toISOString().slice(0, 10);
  const compra = criarPedidoCompraEstoqueIntel({
    fornecedorId,
    itens: [{
      produtoId,
      embalagemId,
      quantidadePacotes
    }],
    vencimento,
    origem: "manual"
  });
  if (!compra) return;
  ["ei-compra-manual-pacotes"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  const embalagemSelect = document.getElementById("ei-compra-manual-embalagem");
  if (embalagemSelect) embalagemSelect.value = "";
  showToast("Pedido de compra manual gerado.", 4000);
}

function gerarPedidoCompraDaListaEstoqueIntel(produtoId, fornecedorId, embalagemId, quantidadePacotes, necessidadeBase, sobraEstimada) {
  const vencimento = document.getElementById("ei-compra-vencimento")?.value || new Date().toISOString().slice(0, 10);
  const compra = criarPedidoCompraEstoqueIntel({
    fornecedorId,
    itens: [{
      produtoId,
      embalagemId,
      quantidadePacotes,
      necessidadeBase,
      sobraEstimada
    }],
    vencimento,
    origem: "lista_automatica"
  });
  if (!compra) return;
  showToast("Pedido de compra gerado a partir da lista automatica.", 4000);
}

async function enviarPedidoCompraFornecedor(compraId) {
  const compra = estoqueIntelCompras.find((item) => item.id === compraId);
  if (!compra) {
    showToast("Pedido de compra nao encontrado.", 3000);
    return;
  }
  const fornecedor = findEstoqueIntelFornecedor(compra.fornecedor_id);
  const emailDestino = getEstoqueIntelFornecedorEmail(fornecedor);
  if (!emailDestino || !emailDestino.includes("@")) {
    showToast("O fornecedor nao possui e-mail valido para envio.", 4000);
    return;
  }
  compra.status = "pedido_compra_enviado";
  compra.envio = {
    canal: "email",
    destinatario: emailDestino,
    enviado_em: new Date().toISOString()
  };
  compra.erp = {
    ...(compra.erp || {}),
    status: "pedido_compra_enviado",
    updatedAt: new Date().toISOString()
  };
  saveEstoqueIntelCompras();
  renderEstoque();
  showToast(`Pedido de compra enviado para ${fornecedor?.nome || "fornecedor"} (${emailDestino}).`, 4000);
}

function excluirPedidoCompraEstoqueIntel(compraId) {
  const compra = estoqueIntelCompras.find((item) => item.id === compraId);
  if (!compra) {
    showToast("Pedido de compra nao encontrado.", 3000);
    return;
  }
  const fornecedor = findEstoqueIntelFornecedor(compra.fornecedor_id);
  const itensCompra = getEstoqueIntelCompraItens(compra);
  const produto = itensCompra[0] ? findEstoqueIntelProduto(itensCompra[0].produto_id) : null;
  const statusLabel = compra.status === "pedido_compra_enviado" ? " ja enviado ao fornecedor" : "";
  if (!confirm(`Excluir o pedido de compra ${compra.id}${statusLabel}?${statusLabel ? " Essa acao remove o registro interno da lista." : ""}`)) return;
  estoqueIntelCompras = estoqueIntelCompras.filter((item) => item.id !== compraId);
  saveEstoqueIntelCompras();
  renderEstoque();
  showToast(`Pedido de compra de ${produto?.nome || "produto"} com ${fornecedor?.nome || "fornecedor"} excluido.`, 3500);
}

function getEstoqueIntelDemandaExclusaoBloqueios(pedidoId) {
  const bloqueios = [];
  const demanda = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  if (!demanda) return ["demanda nao encontrada"];
  if (demanda.origem_sistema !== "manual") bloqueios.push("apenas demandas manuais podem ser excluidas");
  const reservaStatus = getEstoqueIntelReservaStatus(pedidoId);
  if (reservaStatus.key === "baixada") bloqueios.push("a demanda ja teve baixa de estoque");
  if (reservaStatus.key === "encerrada_manual") bloqueios.push("a reserva ja foi encerrada manualmente");
  if (provasEntrega.some((item) => item.pedidoId === pedidoId)) bloqueios.push("ja existe entrega/comprovante vinculada");
  if (entregasOperacionaisRender.some((item) => item.pedidoId === pedidoId && item.__source === "demanda")) bloqueios.push("existe vinculo operacional com a sessao Entregas");
  const comprasVinculadas = estoqueIntelCompras.filter((compra) => {
    const origem = String(compra.origem_pedido_compra || "");
    return origem.includes(pedidoId);
  }).length;
  if (comprasVinculadas) bloqueios.push(`${comprasVinculadas} pedido(s) de compra vinculado(s)`);
  return bloqueios;
}

function excluirDemandaEstoqueIntel(pedidoId) {
  const demanda = estoqueIntelPedidos.find((item) => item.id === pedidoId);
  if (!demanda) {
    showToast("Demanda nao encontrada.", 3000);
    return;
  }
  const bloqueios = getEstoqueIntelDemandaExclusaoBloqueios(pedidoId);
  if (bloqueios.length) {
    showToast(`Nao foi possivel excluir: ${bloqueios.join("; ")}.`, 5000);
    return;
  }
  const itens = estoqueIntelPedidoItens.filter((item) => item.pedido_id === pedidoId);
  const totalQuantidade = itens.reduce((sum, item) => sum + Number(item.quantidade_base || 0), 0);
  if (!confirm(`Excluir a demanda ${pedidoId}?\nQuantidade base total: ${totalQuantidade}\n\nEssa acao remove a demanda, os itens e a reserva comprometida.`)) return;
  estoqueIntelPedidos = estoqueIntelPedidos.filter((item) => item.id !== pedidoId);
  estoqueIntelPedidoItens = estoqueIntelPedidoItens.filter((item) => item.pedido_id !== pedidoId);
  estoqueIntelMovimentacoes = estoqueIntelMovimentacoes.filter((mov) => !(mov.referencia_id === pedidoId && (mov.origem === "pedido" || mov.origem_sistema === "manual")));
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  renderEstoque();
  showToast(`Demanda ${pedidoId} excluida.`, 3500);
}

async function prepararIntegracaoErpEstoqueIntel() {
  const erpEl = document.getElementById("ei-erp-status");
  if (erpEl) erpEl.textContent = "Atualizando resumo de integracao ERP...";
  try {
    const resp = await fetch("/api/estoque-intel-erp");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    if (erpEl) erpEl.textContent = `ERP pronto: ${data.summary.fornecedores} fornecedor(es), ${data.summary.compras} pedido(s) de compra e ${data.summary.financeiro} payload(s) disponiveis para integracao.`;
  } catch (err) {
    if (erpEl) erpEl.textContent = `Falha ao consultar ERP: ${err.message}`;
  }
}

function formatUnidadeLabel(sigla) {
  const map = { "UN":"Unidade","DZ":"Duzia","g":"Grama","KG":"Quilograma","ml":"Mililitro","LT":"Litro","GL":"Galao","CX":"Caixa","PCT":"Pacote","FD":"Fardo","BD":"Bandeja","PT":"Pote","SC":"Sache/Saco","MÇ":"Maco","RS":"Resma","RL":"Rolo","FR":"Frasco","TB":"Tubo","GF":"Garrafa","LA":"Lata" };
  return map[sigla] || sigla;
}

function atualizarLabelQtdBaseEmb() {
  const sel = document.getElementById("ei-emb-produto");
  const label = document.getElementById("ei-emb-qtd-label");
  if (!sel || !label) return;
  const produto = estoqueIntelProdutos.find(p => p.id === sel.value);
  const un = produto ? produto.unidade_base : "g";
  label.textContent = `Quantidade Base (${un})`;
}

function registrarProdutoEstoqueIntel() {
  const nome = (document.getElementById("ei-produto-nome")?.value || "").trim();
  const unidade_base = document.getElementById("ei-produto-unidade")?.value || "UN";
  const sku = (document.getElementById("ei-produto-sku")?.value || "").trim();
  const ncm = (document.getElementById("ei-produto-ncm")?.value || "").trim();
  if (!nome) {
    showToast("Informe o nome do produto.", 3000);
    return;
  }
  estoqueIntelProdutos.push({ id: genId("PROD"), nome, unidade_base, sku, ncm });
  saveEstoqueIntelProdutos();
  ["ei-produto-nome", "ei-produto-sku", "ei-produto-ncm"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  renderEstoque();
  showToast("Produto salvo no Estoque Intel.", 3000);
}

function gerarProximoSKU() {
  const existentes = estoqueIntelProdutos.map(p => p.sku || "").filter(s => s.startsWith("LICT-"));
  const nums = existentes.map(s => parseInt(s.replace("LICT-", "")) || 0);
  const max = nums.length ? Math.max(...nums) : 0;
  return "LICT-" + String(max + 1).padStart(4, "0");
}

function registrarProdutoUnificado() {
  const nome = (document.getElementById("ei-produto-nome")?.value || "").trim();
  const unidade_base = document.getElementById("ei-produto-unidade")?.value || "UN";
  const skuManual = (document.getElementById("ei-produto-sku")?.value || "").trim();
  const sku = skuManual || gerarProximoSKU();
  const ncmRaw = (document.getElementById("ei-produto-ncm")?.value || "").trim();
  const ncm = ncmRaw.includes(" — ") ? ncmRaw.split(" — ")[0].trim() : ncmRaw;
  const categoria = document.getElementById("ei-produto-categoria")?.value || "";
  const origem = document.getElementById("ei-produto-origem")?.value || "0";
  const embDescricao = (document.getElementById("ei-emb-descricao")?.value || "").trim();
  const embQtd = Number(document.getElementById("ei-emb-quantidade")?.value) || 1;
  const embPreco = Number(document.getElementById("ei-emb-preco-ref")?.value) || 0;
  if (!nome) { showToast("Informe o nome do produto.", 3000); return; }
  const prodId = genId("PROD");
  estoqueIntelProdutos.push({ id: prodId, nome, unidade_base, sku, ncm, categoria, origem });
  saveEstoqueIntelProdutos();
  if (embDescricao || embPreco) {
    estoqueIntelEmbalagens.push({
      id: genId("EMB"),
      produto_id: prodId,
      descricao: embDescricao || nome,
      codigo_barras: sku,
      quantidade_base: embQtd,
      preco_referencia: embPreco
    });
    saveEstoqueIntelEmbalagens();
  }
  ["ei-produto-nome", "ei-produto-sku", "ei-produto-ncm", "ei-emb-descricao", "ei-emb-quantidade", "ei-emb-preco-ref"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  const catSel = document.getElementById("ei-produto-categoria"); if (catSel) catSel.value = "";
  const oriSel = document.getElementById("ei-produto-origem"); if (oriSel) oriSel.value = "0";
  renderEstoque();
  showToast("Produto" + (embDescricao || embPreco ? " e embalagem" : "") + " cadastrado.", 3000);
}

function getEstoqueIntelProdutoDependencias(produtoId) {
  const dependencias = [];
  const totalEmbalagens = estoqueIntelEmbalagens.filter((item) => item.produto_id === produtoId).length;
  const totalPedidoItens = estoqueIntelPedidoItens.filter((item) => item.produto_id === produtoId).length;
  const totalMovimentacoes = estoqueIntelMovimentacoes.filter((item) => item.produto_id === produtoId).length;
  const totalCompras = estoqueIntelCompras.filter((item) => getEstoqueIntelCompraItens(item).some((compraItem) => compraItem.produto_id === produtoId)).length;
  if (totalEmbalagens) dependencias.push(`${totalEmbalagens} embalagem(ns)`);
  if (totalPedidoItens) dependencias.push(`${totalPedidoItens} item(ns) de pedido`);
  if (totalMovimentacoes) dependencias.push(`${totalMovimentacoes} movimentacao(oes)`);
  if (totalCompras) dependencias.push(`${totalCompras} compra(s)`);
  return dependencias;
}

function excluirProdutoEstoqueIntel(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) {
    showToast("Produto nao encontrado no Estoque Intel.", 3000);
    return;
  }
  const totalPedidos = estoqueIntelPedidoItens.filter(i => i.produto_id === produtoId).length;
  const totalMov = estoqueIntelMovimentacoes.filter(i => i.produto_id === produtoId).length;
  const totalCompras = estoqueIntelCompras.filter(i => getEstoqueIntelCompraItens(i).some(ci => ci.produto_id === produtoId)).length;
  if (totalPedidos || totalMov || totalCompras) {
    const bloqueios = [];
    if (totalPedidos) bloqueios.push(`${totalPedidos} item(ns) de pedido`);
    if (totalMov) bloqueios.push(`${totalMov} movimentacao(oes)`);
    if (totalCompras) bloqueios.push(`${totalCompras} compra(s)`);
    showToast(`Nao foi possivel excluir ${produto.nome}: ha ${bloqueios.join(", ")} vinculadas.`, 4500);
    return;
  }
  const embCount = estoqueIntelEmbalagens.filter(e => e.produto_id === produtoId).length;
  const msg = embCount ? `Excluir "${produto.nome}" e suas ${embCount} embalagem(ns)?` : `Excluir o produto "${produto.nome}"?`;
  if (!confirm(msg)) return;
  estoqueIntelProdutos = estoqueIntelProdutos.filter((item) => item.id !== produtoId);
  estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter((item) => item.produto_id !== produtoId);
  if (estoqueIntelUltimaSugestao?.produto?.id === produtoId) estoqueIntelUltimaSugestao = null;
  saveEstoqueIntelProdutos();
  saveEstoqueIntelEmbalagens();
  renderEstoque();
  showToast("Produto" + (embCount ? " e embalagens" : "") + " excluido(s).", 3000);
}

function registrarEmbalagemEstoqueIntel() {
  const produto_id = document.getElementById("ei-emb-produto")?.value || "";
  const descricao = (document.getElementById("ei-emb-descricao")?.value || "").trim();
  const codigo_barras = (document.getElementById("ei-emb-barcode")?.value || "").trim();
  const quantidade_base = Number(document.getElementById("ei-emb-quantidade")?.value || 0);
  const preco_referencia = Number(document.getElementById("ei-emb-preco-ref")?.value || 0);
  if (!produto_id || !descricao || !quantidade_base) {
    showToast("Preencha produto, descricao e quantidade base.", 3000);
    return;
  }
  estoqueIntelEmbalagens.push({ id: genId("EMB"), produto_id, descricao, codigo_barras, quantidade_base, preco_referencia });
  saveEstoqueIntelEmbalagens();
  ["ei-emb-descricao", "ei-emb-barcode", "ei-emb-quantidade", "ei-emb-preco-ref"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  renderEstoque();
  showToast("Embalagem vinculada ao produto.", 3000);
}

function getEstoqueIntelEmbalagemDependencias(embalagemId) {
  const dependencias = [];
  const totalOfertas = estoqueIntelFornecedores.reduce((sum, fornecedor) => {
    return sum + (fornecedor.embalagens || []).filter((item) => item.embalagem_id === embalagemId).length;
  }, 0);
  const totalCompras = estoqueIntelCompras.filter((item) => getEstoqueIntelCompraItens(item).some((compraItem) => compraItem.embalagem_id === embalagemId)).length;
  if (totalOfertas) dependencias.push(`${totalOfertas} oferta(s) de fornecedor`);
  if (totalCompras) dependencias.push(`${totalCompras} compra(s)`);
  return dependencias;
}

function excluirEmbalagemEstoqueIntel(embalagemId) {
  const embalagem = estoqueIntelEmbalagens.find((item) => item.id === embalagemId);
  if (!embalagem) {
    showToast("Embalagem nao encontrada no Estoque Intel.", 3000);
    return;
  }
  const produto = findEstoqueIntelProduto(embalagem.produto_id);
  const dependencias = getEstoqueIntelEmbalagemDependencias(embalagemId);
  if (dependencias.length) {
    showToast(`Nao foi possivel excluir ${embalagem.descricao}: ha ${dependencias.join(", ")} vinculadas.`, 4500);
    return;
  }
  if (!confirm(`Excluir a embalagem "${embalagem.descricao}" de ${produto?.nome || embalagem.produto_id}?`)) return;
  estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter((item) => item.id !== embalagemId);
  if (estoqueIntelUltimaSugestao?.opcoes?.some((item) => item.embalagemId === embalagemId)) estoqueIntelUltimaSugestao = null;
  saveEstoqueIntelEmbalagens();
  renderEstoque();
  showToast("Embalagem excluida do Estoque Intel.", 3000);
}

function registrarPedidoEstoqueIntel() {
  const produto_id = document.getElementById("ei-pedido-produto")?.value || "";
  const quantidade_base = Number(document.getElementById("ei-pedido-quantidade")?.value || 0);
  const status = (document.getElementById("ei-pedido-status")?.value || "emitido").trim() || "emitido";
  if (!produto_id || !quantidade_base) {
    showToast("Informe produto e quantidade da demanda.", 3000);
    return;
  }
  const pedido = { id: genId("PEDINT"), data: new Date().toISOString().slice(0, 10), status };
  const pedidoItem = { id: genId("PIT"), pedido_id: pedido.id, produto_id, quantidade_base, origem_sistema: "manual" };
  pedido.origem_sistema = "manual";
  estoqueIntelPedidos.push(pedido);
  estoqueIntelPedidoItens.push(pedidoItem);
  estoqueIntelMovimentacoes.push({
    id: genId("MOV"),
    produto_id,
    tipo: "comprometido",
    operacao: "+",
    quantidade: quantidade_base,
    origem: "pedido",
    data: new Date().toISOString(),
    referencia_id: pedido.id
  });
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  document.getElementById("ei-pedido-quantidade").value = "";
  renderEstoque();
  showToast("Demanda manual criada e reserva registrada no estoque.", 3000);
}

function registrarMovimentoEstoque() {
  const produto_id = document.getElementById("ei-mov-produto")?.value || "";
  const operacao = document.getElementById("ei-mov-operacao")?.value || "entrada_mercadoria";
  const quantidade = Number(document.getElementById("ei-mov-quantidade")?.value || 0);
  if (!produto_id || !quantidade) {
    showToast("Informe produto e quantidade.", 3000);
    return;
  }
  const movimentos = [];
  if (operacao === "entrada_mercadoria") {
    movimentos.push({ tipo: "fisico", operacao: "+", origem: "bipagem" });
  } else if (operacao === "saida_mercadoria") {
    movimentos.push({ tipo: "fisico", operacao: "-", origem: "bipagem" });
    movimentos.push({ tipo: "comprometido", operacao: "-", origem: "pedido" });
  } else if (operacao === "entrega_direta") {
    movimentos.push({ tipo: "comprometido", operacao: "-", origem: "entrega_direta" });
  }
  movimentos.forEach((mov) => {
    estoqueIntelMovimentacoes.push({
      id: genId("MOV"),
      produto_id,
      tipo: mov.tipo,
      operacao: mov.operacao,
      quantidade,
      origem: mov.origem,
      data: new Date().toISOString()
    });
  });
  saveEstoqueIntelMovimentacoes();
  document.getElementById("ei-mov-quantidade").value = "";
  renderEstoque();
  showToast("Movimentacao registrada no Estoque Intel.", 3000);
}

function calcularSugestaoCompraEstoqueIntel() {
  const produto_id = document.getElementById("ei-sugestao-produto")?.value || "";
  const quantidade = Number(document.getElementById("ei-sugestao-quantidade")?.value || 0);
  const produto = findEstoqueIntelProduto(produto_id);
  const embalagens = estoqueIntelEmbalagens.filter((item) => item.produto_id === produto_id);
  if (!produto || !quantidade || !embalagens.length) {
    showToast("Selecione produto, quantidade e ao menos uma embalagem.", 3500);
    return;
  }
  estoqueIntelUltimaSugestao = {
    produto,
    necessidade: quantidade,
    opcoes: calcularCompraInteligente(quantidade, embalagens)
  };
  renderEstoque();
}

function seedEstoqueIntelExemplo() {
  const seed = getDefaultEstoqueIntelSeed();
  estoqueIntelProdutos = seed.produtos;
  estoqueIntelEmbalagens = seed.embalagens;
  estoqueIntelFornecedores = seed.fornecedores;
  estoqueIntelPedidos = seed.pedidos;
  estoqueIntelPedidoItens = seed.pedidoItens;
  estoqueIntelMovimentacoes = seed.movimentacoes;
  estoqueIntelCompras = seed.compras;
  saveEstoqueIntelProdutos();
  saveEstoqueIntelEmbalagens();
  saveEstoqueIntelFornecedores();
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  saveEstoqueIntelCompras();
  renderEstoque();
  showToast("Exemplo do Estoque Intel carregado.", 3000);
}

function limparEstoqueIntel() {
  if (!confirm("Limpar toda a base local do Estoque Intel?")) return;
  estoqueIntelProdutos = [];
  estoqueIntelEmbalagens = [];
  estoqueIntelFornecedores = [];
  estoqueIntelPedidos = [];
  estoqueIntelPedidoItens = [];
  estoqueIntelMovimentacoes = [];
  estoqueIntelCompras = [];
  estoqueIntelUltimaSugestao = null;
  saveEstoqueIntelProdutos();
  saveEstoqueIntelEmbalagens();
  saveEstoqueIntelFornecedores();
  saveEstoqueIntelPedidos();
  saveEstoqueIntelPedidoItens();
  saveEstoqueIntelMovimentacoes();
  saveEstoqueIntelCompras();
  renderEstoque();
  showToast("Base local do Estoque Intel limpa.", 3000);
}

function isMovimentoEstoqueInconsistente(mov) {
  return false;
}

function limparMovimentosEstoqueInconsistentes() {
  showToast("A limpeza antiga nao se aplica ao Estoque Intel.", 3000);
}

function setEstoqueIntelView(view) {
  estoqueIntelCurrentView = view || "geral";
  renderEstoque();
}

function imprimirTabelaEstoqueIntel(titulo, subtitulo, headers, rows) {
  let root = document.getElementById("estoque-intel-print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "estoque-intel-print-root";
    document.body.appendChild(root);
  }
  const headHtml = headers.map((item) => `<th>${esc(item)}</th>`).join("");
  const bodyHtml = rows.length
    ? rows.map((row) => `<tr>${row.map((col) => `<td>${esc(col)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}" style="text-align:center;color:#64748b">Nenhum registro encontrado.</td></tr>`;
  root.innerHTML = `<h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  const cleanup = () => {
    document.body.classList.remove("estoque-intel-print-mode");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  document.body.classList.add("estoque-intel-print-mode");
  setTimeout(() => window.print(), 50);
}

function imprimirListaProdutosEstoqueIntel() {
  const ORIGEM_LABELS = {'0':'Nacional','1':'Import.Direta','2':'Import.MI','3':'Nac.>40%','4':'Nac.PPB','5':'Nac.<=40%','6':'Import.CAMEX','7':'Import.MI CAMEX'};
  const rows = estoqueIntelProdutos.map((produto) => {
    const emb = estoqueIntelEmbalagens.find((e) => e.produto_id === produto.id);
    const embDesc = emb ? emb.descricao : "—";
    const embQtd = emb ? (emb.quantidade_base || 1) : "—";
    const embPreco = emb && emb.preco_referencia ? brl.format(emb.preco_referencia) : "—";
    return [produto.sku || "—", produto.nome, produto.unidade_base, produto.categoria || "—", (produto.origem || "0") + "-" + (ORIGEM_LABELS[produto.origem || "0"] || "Nacional"), produto.ncm || "—", embDesc, String(embQtd), embPreco];
  });
  imprimirTabelaEstoqueIntel("Lista de Produtos — Cadastro Completo", `${estoqueIntelProdutos.length} produto(s) | Gerado em ${formatDateTimeLocal(new Date().toISOString())}`, ["SKU", "Produto", "Base", "Categoria", "Origem", "NCM", "Embalagem", "Qtd", "Preco Ref."], rows);
}

function imprimirListaFornecedoresEstoqueIntel() {
  const rows = estoqueIntelFornecedores.map((fornecedor) => [
    fornecedor.id,
    fornecedor.nome,
    fornecedor.documento || "-",
    getEstoqueIntelFornecedorTelefone(fornecedor) || "-",
    getEstoqueIntelFornecedorEmail(fornecedor) || "-",
    fornecedor.status || "-",
    (fornecedor.embalagens || []).length ? `${(fornecedor.embalagens || []).length} oferta(s)` : "Sem oferta"
  ]);
  imprimirTabelaEstoqueIntel("Lista de Fornecedores do Estoque Intel", `Gerado em ${formatDateTimeLocal(new Date().toISOString())}`, ["ID", "Fornecedor", "Documento", "Telefone", "E-mail", "Status", "Ofertas"], rows);
}

async function syncEstoqueIntelApi() {
  const statusEl = document.getElementById("ei-api-status");
  if (statusEl) statusEl.textContent = "Consultando API do Estoque Intel...";
  try {
    const [produtosResp, embalagensResp, estoqueResp] = await Promise.all([
      fetch("/api/produtos"),
      fetch("/api/embalagens"),
      fetch("/api/estoque")
    ]);
    const produtosData = await produtosResp.json().catch(() => ({}));
    const embalagensData = await embalagensResp.json().catch(() => ({}));
    const estoqueData = await estoqueResp.json().catch(() => ({}));
    if (!produtosResp.ok || !produtosData.ok) throw new Error(produtosData.error || `Produtos HTTP ${produtosResp.status}`);
    if (!embalagensResp.ok || !embalagensData.ok) throw new Error(embalagensData.error || `Embalagens HTTP ${embalagensResp.status}`);
    if (!estoqueResp.ok || !estoqueData.ok) throw new Error(estoqueData.error || `Estoque HTTP ${estoqueResp.status}`);
    if (!estoqueIntelProdutos.length && Array.isArray(produtosData.items)) {
      estoqueIntelProdutos = produtosData.items;
      saveEstoqueIntelProdutos();
    }
    if (!estoqueIntelEmbalagens.length && Array.isArray(embalagensData.items)) {
      estoqueIntelEmbalagens = embalagensData.items;
      saveEstoqueIntelEmbalagens();
    }
    if (statusEl) statusEl.innerHTML = `API consultada com sucesso. Produtos: <strong>${(produtosData.items || []).length}</strong> | Embalagens: <strong>${(embalagensData.items || []).length}</strong> | Itens de estoque: <strong>${(estoqueData.items || []).length}</strong>`;
    renderEstoque();
    showToast("API do Estoque Intel consultada.", 3000);
  } catch (err) {
    if (statusEl) statusEl.textContent = `Falha ao consultar API: ${err.message}`;
    showToast(`Falha ao consultar API: ${err.message}`, 4000);
  }
}
// ===== STOCK INTELLIGENCE — RENDER FUNCTIONS =====
function renderEstoque() {
  const produtosTbody = document.getElementById("ei-produtos-tbody");
  const embalagensTbody = document.getElementById("ei-embalagens-tbody");
  const pedidosTbody = document.getElementById("ei-pedidos-tbody");
  const pedidosSyncPendenteTbody = document.getElementById("ei-pedidos-sync-pendente-tbody");
  const estoqueTbody = document.getElementById("ei-estoque-tbody");
  const movTbody = document.getElementById("ei-movimentacoes-tbody");
  const sugestaoEl = document.getElementById("ei-sugestao-resultado");
  const fornecedoresTbody = document.getElementById("ei-fornecedores-tbody");
  const comprasTbody = document.getElementById("ei-compras-tbody");
  const pedidosReservaFiltroEl = document.getElementById("ei-pedidos-reserva-filtro");
  // Guard: só abortar se elementos essenciais não existem (compras/pedidos removidos no Épico A)
  if (!produtosTbody || !estoqueTbody || !movTbody) return;

  const busca = (document.getElementById("ei-busca")?.value || "").trim().toLowerCase();
  const filtroBase = document.getElementById("ei-filtro-base")?.value || "";
  document.querySelectorAll("[data-ei-section]").forEach((el) => {
    const section = el.getAttribute("data-ei-section");
    const shouldShowCadastro = estoqueIntelCurrentView === "produtos" && section === "produtos";
    el.classList.toggle("hidden", !(shouldShowCadastro || estoqueIntelCurrentView === section));
  });
  ["produtos", "fornecedores", "pedidos", "compra", "notas-entrada", "estoque"].forEach((view) => {
    const btn = document.getElementById(`ei-view-btn-${view}`);
    if (!btn) return;
    btn.className = `btn ${estoqueIntelCurrentView === view ? "btn-green" : "btn-outline"} btn-sm`;
  });
  document.querySelectorAll("[data-ei-form]").forEach((el) => {
    el.classList.remove("hidden");
  });
  document.querySelectorAll("[data-ei-table]").forEach((el) => {
    el.style.maxHeight = el.closest("#ei-card-estoque-resumo") ? "320px" : (el.closest("#ei-card-fornecedores") || el.closest("#ei-card-precompra") ? "260px" : "220px");
  });
  const mainGrid = document.getElementById("ei-grid-principal");
  const secondaryGrid = document.getElementById("ei-grid-secundario");
  const compraGrid = document.getElementById("ei-grid-compra");
  const kpiGrid = document.getElementById("ei-kpi-grid");
  if (mainGrid) mainGrid.style.gridTemplateColumns = "1fr";
  if (secondaryGrid) secondaryGrid.style.gridTemplateColumns = estoqueIntelCurrentView === "compra" ? "1fr 1fr" : "1.2fr .8fr";
  if (secondaryGrid) secondaryGrid.classList.toggle("hidden", !["estoque", "compra"].includes(estoqueIntelCurrentView));
  if (compraGrid) compraGrid.classList.toggle("hidden", estoqueIntelCurrentView !== "fornecedores");
  if (kpiGrid) kpiGrid.style.marginBottom = "1rem";

  const produtoOptions = estoqueIntelProdutos.map((produto) => `
    <option value="${esc(produto.id)}">${esc(produto.nome)} (${esc(produto.unidade_base)})</option>
  `).join("");
  ["ei-emb-produto", "ei-pedido-produto", "ei-mov-produto", "ei-sugestao-produto", "ei-compra-manual-produto"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="">Selecione</option>${produtoOptions}`;
    if (previous && estoqueIntelProdutos.some((produto) => produto.id === previous)) select.value = previous;
  });
  const embalagemOptions = estoqueIntelEmbalagens.map((emb) => {
    const produto = findEstoqueIntelProduto(emb.produto_id);
    const precoRef = Number(emb.preco_referencia || 0);
    return `<option value="${esc(emb.id)}">${esc(produto?.nome || emb.produto_id)} - ${esc(emb.descricao)}${precoRef > 0 ? ` | Padrao ${brl.format(precoRef)}` : ""}</option>`;
  }).join("");
  const fornecedorOptions = estoqueIntelFornecedores.map((fornecedor) => `<option value="${esc(fornecedor.id)}">${esc(fornecedor.nome)}</option>`).join("");
  const clienteOptions = [...new Set(pedidos.map((pedido) => pedido.cliente?.nome || pedido.escola || "").filter(Boolean))].map((cliente) => `<option value="${esc(cliente)}">${esc(cliente)}</option>`).join("");
  const produtoFiltroOptions = estoqueIntelProdutos.map((produto) => `<option value="${esc(produto.id)}">${esc(produto.nome)}</option>`).join("");
  ["ei-forn-embalagem"].forEach((id) => {
    const select = document.getElementById(id);
    if (select) select.innerHTML = `<option value="">Selecione</option>${embalagemOptions}`;
  });
  ["ei-forn-existing", "ei-compra-fornecedor", "ei-compra-manual-fornecedor"].forEach((id) => {
    const select = document.getElementById(id);
    if (select) {
      const previous = select.value;
      select.innerHTML = `<option value="">Selecione</option>${fornecedorOptions}`;
      if (previous && estoqueIntelFornecedores.some((fornecedor) => fornecedor.id === previous)) select.value = previous;
    }
  });
  atualizarCompraManualEmbalagens();
  const compraVenc = document.getElementById("ei-compra-vencimento");
  if (compraVenc && !compraVenc.value) compraVenc.value = new Date().toISOString().slice(0, 10);
  const compraManualVenc = document.getElementById("ei-compra-manual-vencimento");
  if (compraManualVenc && !compraManualVenc.value) compraManualVenc.value = new Date().toISOString().slice(0, 10);
  const clienteFiltroEl = document.getElementById("ei-lista-cliente");
  if (clienteFiltroEl) {
    const previous = clienteFiltroEl.value;
    clienteFiltroEl.innerHTML = `<option value="">Todos</option>${clienteOptions}`;
    if (previous) clienteFiltroEl.value = previous;
  }
  const produtoFiltroEl = document.getElementById("ei-lista-produto");
  if (produtoFiltroEl) {
    const previous = produtoFiltroEl.value;
    produtoFiltroEl.innerHTML = `<option value="">Todos</option>${produtoFiltroOptions}`;
    if (previous) produtoFiltroEl.value = previous;
  }
  const fornecedorFiltroEl = document.getElementById("ei-lista-fornecedor");
  if (fornecedorFiltroEl) {
    const previous = fornecedorFiltroEl.value;
    fornecedorFiltroEl.innerHTML = `<option value="">Todos</option>${fornecedorOptions}`;
    if (previous) fornecedorFiltroEl.value = previous;
  }
  const statusOptionsEl = document.getElementById("ei-status-filter-options");
  if (statusOptionsEl) {
    statusOptionsEl.innerHTML = PEDIDO_STATUS_TABS.map((tab) => `<label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" class="ei-status-filter-option" ${estoqueIntelListaStatusFiltros.includes(tab.key) ? "checked" : ""} onchange="toggleListaComprasStatusOption('${tab.key}', this.checked)"> ${esc(tab.label)}</label>`).join("");
  }
  const listaMesEl = document.getElementById("ei-lista-mes");
  if (listaMesEl && !listaMesEl.value) listaMesEl.value = new Date().toISOString().slice(0, 7);
  updateListaComprasStatusSummary();
  const mesWrap = document.getElementById("ei-periodo-mes-wrap");
  const intervaloWrap = document.getElementById("ei-periodo-intervalo-wrap");
  const mesBtn = document.getElementById("ei-periodo-mes-btn");
  const intervaloBtn = document.getElementById("ei-periodo-intervalo-btn");
  if (mesWrap) mesWrap.classList.toggle("hidden", estoqueIntelListaPeriodoModo !== "mes");
  if (intervaloWrap) intervaloWrap.classList.toggle("hidden", estoqueIntelListaPeriodoModo !== "intervalo");
  if (mesBtn) mesBtn.className = `btn ${estoqueIntelListaPeriodoModo === "mes" ? "btn-green" : "btn-outline"} btn-sm`;
  if (intervaloBtn) intervaloBtn.className = `btn ${estoqueIntelListaPeriodoModo === "intervalo" ? "btn-green" : "btn-outline"} btn-sm`;
  if (pedidosReservaFiltroEl) pedidosReservaFiltroEl.value = estoqueIntelFiltroReservaStatus;

  const resumo = getEstoqueIntelResumo();
  const kpiProdutos = document.getElementById("est-intel-kpi-produtos");
  const kpiEmbalagens = document.getElementById("est-intel-kpi-embalagens");
  const kpiPedidos = document.getElementById("est-intel-kpi-pedidos");
  const kpiMov = document.getElementById("est-intel-kpi-mov");
  const demandasGeradasCountEl = document.getElementById("ei-demandas-geradas-count");
  if (kpiProdutos) kpiProdutos.textContent = estoqueIntelProdutos.length;
  if (kpiEmbalagens) kpiEmbalagens.textContent = estoqueIntelEmbalagens.length;
  if (kpiPedidos) kpiPedidos.textContent = estoqueIntelPedidos.length;
  if (kpiMov) kpiMov.textContent = estoqueIntelMovimentacoes.length;
  if (demandasGeradasCountEl) demandasGeradasCountEl.textContent = String(estoqueIntelPedidos.length);
  const estoqueCountEl = document.getElementById("tab-count-estoque");
  if (estoqueCountEl) estoqueCountEl.textContent = estoqueIntelProdutos.length;

  const produtosFiltrados = estoqueIntelProdutos.filter((produto) => {
    const matchBusca = !busca || `${produto.id} ${produto.nome} ${produto.unidade_base}`.toLowerCase().includes(busca);
    const matchBase = !filtroBase || produto.unidade_base === filtroBase;
    return matchBusca && matchBase;
  });
  const produtoIdsFiltrados = new Set(produtosFiltrados.map((produto) => produto.id));
  const embalagensFiltradas = estoqueIntelEmbalagens.filter((emb) => {
    const produto = findEstoqueIntelProduto(emb.produto_id);
    const matchBusca = !busca || `${produto?.nome || ""} ${emb.descricao} ${emb.codigo_barras || ""}`.toLowerCase().includes(busca);
    const matchBase = !filtroBase || produto?.unidade_base === filtroBase;
    return matchBusca && matchBase;
  });
  const pedidosFiltrados = estoqueIntelPedidos.filter((pedido) => {
    const item = estoqueIntelPedidoItens.find((pedidoItem) => pedidoItem.pedido_id === pedido.id);
    const produto = item ? findEstoqueIntelProduto(item.produto_id) : null;
    const matchBusca = !busca || `${pedido.id} ${pedido.status} ${produto?.nome || ""}`.toLowerCase().includes(busca);
    const matchBase = !filtroBase || produto?.unidade_base === filtroBase;
    const reservaStatus = getEstoqueIntelReservaStatus(pedido.id);
    const matchReserva = !estoqueIntelFiltroReservaStatus || reservaStatus.key === estoqueIntelFiltroReservaStatus;
    return matchBusca && matchBase && matchReserva;
  });
  // Filtros de estoque comprometido: data prevista e cliente
  const filtroEstData = document.getElementById("ei-estoque-filtro-data")?.value || "";
  const filtroEstCliente = document.getElementById("ei-estoque-filtro-cliente")?.value || "";
  // Populate client dropdown
  const clienteSelect = document.getElementById("ei-estoque-filtro-cliente");
  if (clienteSelect && clienteSelect.options.length <= 1) {
    const clientes = new Set();
    estoqueIntelPedidos.forEach(d => {
      const p = pedidos.find(pp => pp.id === (d.origem_pedido_id || d.id));
      if (p?.escola) clientes.add(p.escola);
      if (d.cliente) clientes.add(d.cliente);
    });
    [...clientes].sort().forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; clienteSelect.appendChild(o); });
  }
  // Filter comprometido movements by date/client
  const resumoFiltrado = (filtroEstData || filtroEstCliente ? resumo.map(item => {
    const movCompr = estoqueIntelMovimentacoes.filter(mov => {
      if (mov.produto_id !== item.produto.id || mov.tipo !== 'comprometido') return false;
      if (filtroEstData) {
        const demanda = estoqueIntelPedidos.find(d => d.id === mov.referencia_id);
        const pedOrigem = demanda ? pedidos.find(pp => pp.id === (demanda.origem_pedido_id || demanda.id)) : null;
        const dataPrev = pedOrigem?.dataPrevista || pedOrigem?.dataEntrega || demanda?.data_prevista || '';
        if (dataPrev && dataPrev.slice(0,10) > filtroEstData) return false;
        if (!dataPrev) return false;
      }
      if (filtroEstCliente) {
        const demanda = estoqueIntelPedidos.find(d => d.id === mov.referencia_id);
        const pedOrigem = demanda ? pedidos.find(pp => pp.id === (demanda.origem_pedido_id || demanda.id)) : null;
        const cliente = pedOrigem?.escola || demanda?.cliente || '';
        if (cliente !== filtroEstCliente) return false;
      }
      return true;
    });
    const comprFiltrado = movCompr.reduce((s, m) => s + (m.operacao === '+' ? Number(m.quantidade||0) : -Number(m.quantidade||0)), 0);
    return { ...item, comprometido: comprFiltrado, disponivel: item.fisico - comprFiltrado };
  }) : resumo).filter((item) => {
    const matchBusca = !busca || `${item.produto.id} ${item.produto.nome}`.toLowerCase().includes(busca);
    const matchBase = !filtroBase || item.produto.unidade_base === filtroBase;
    // Quando filtrando por data/cliente, mostrar só itens com demanda
    const matchDemanda = !(filtroEstData || filtroEstCliente) || item.comprometido > 0;
    return matchBusca && matchBase && matchDemanda;
  });
  const movFiltrados = estoqueIntelMovimentacoes.filter((mov) => {
    if (mov.tipo === "comprometido") return false; // comprometido já aparece no Estoque Calculado
    const produto = findEstoqueIntelProduto(mov.produto_id);
    const matchBusca = !busca || `${produto?.nome || ""} ${mov.tipo} ${mov.origem}`.toLowerCase().includes(busca);
    const matchBase = !filtroBase || produto?.unidade_base === filtroBase;
    return matchBusca && matchBase;
  });

  const produtosVisiveis = produtosFiltrados;
  const pedidosVisiveis = pedidosFiltrados;
  const resumoVisivel = resumoFiltrado;
  const movVisiveis = movFiltrados;
  const conciliacaoPedidos = getPedidosReaisConciliacaoEstoqueIntel();
  const pedidosReaisComDemanda = conciliacaoPedidos.filter((item) => item.demandaGerada);
  const pedidosReaisPendentes = conciliacaoPedidos.filter((item) => !item.demandaGerada);
  const fornecedoresVisiveis = estoqueIntelFornecedores;
  const comprasVisiveis = estoqueIntelCompras;

  const ORIGEM_LABELS = {'0':'Nacional','1':'Import.Direta','2':'Import.MI','3':'Nac.>40%','4':'Nac.PPB','5':'Nac.<=40%','6':'Import.CAMEX','7':'Import.MI CAMEX'};
  produtosTbody.innerHTML = produtosVisiveis.length ? produtosVisiveis.map((produto) => `
    <tr>
      <td class="font-mono" style="font-size:.72rem">${esc(produto.id)}</td>
      <td><button style="background:none;border:none;padding:0;color:var(--text);font-weight:600;cursor:pointer;font-size:.85rem;text-align:left" onclick="abrirEditarProduto('${esc(produto.id)}')">${esc(produto.nome)}</button></td>
      <td><span class="badge badge-blue">${esc(produto.unidade_base)}</span></td>
      <td>${produto.categoria ? `<span class="badge badge-green">${esc(produto.categoria)}</span>` : '<span style="color:var(--mut)">—</span>'}</td>
      <td><span class="badge badge-blue" style="font-size:.7rem">${esc(produto.origem || '0')}-${esc(ORIGEM_LABELS[produto.origem || '0'] || 'Nacional')}</span></td>
      <td class="font-mono" style="font-size:.78rem">${esc(produto.sku || "—")}</td>
      <td class="font-mono" style="font-size:.78rem">${esc(produto.ncm || "—")}</td>
      ${(() => { const emb = estoqueIntelEmbalagens.find(e => e.produto_id === produto.id); return emb ? `<td style="font-size:.82rem">${esc(emb.descricao || "—")}</td><td class="text-right font-mono">${emb.quantidade_base || "—"}</td><td class="text-right font-mono">${emb.preco_referencia ? brl.format(emb.preco_referencia) : "—"}</td>` : '<td style="color:var(--mut);font-size:.78rem">—</td><td class="text-right">—</td><td class="text-right">—</td>'; })()}
      <td class="text-right"><button class="btn btn-outline btn-sm" onclick="excluirProdutoEstoqueIntel('${esc(produto.id)}')">Excluir</button></td>
    </tr>
  `).join("") : `<tr><td colspan="11" style="color:var(--mut)">Nenhum produto encontrado para o filtro atual.</td></tr>`;

  if (embalagensTbody) embalagensTbody.innerHTML = embalagensFiltradas.length ? embalagensFiltradas.map((emb) => {
    const produto = findEstoqueIntelProduto(emb.produto_id);
    return `
      <tr>
        <td>${esc(produto?.nome || emb.produto_id)}</td>
        <td>${esc(emb.descricao)}</td>
        <td class="font-mono">${esc(emb.codigo_barras || "-")}</td>
        <td class="text-right font-mono">${Number(emb.quantidade_base || 0)}</td>
        <td class="text-right font-mono">${Number(emb.preco_referencia || 0) > 0 ? brl.format(Number(emb.preco_referencia || 0)) : "-"}</td>
        <td class="text-right"><button class="btn btn-outline btn-sm" onclick="excluirEmbalagemEstoqueIntel('${esc(emb.id)}')">Excluir</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="6" style="color:var(--mut)">Nenhuma embalagem encontrada para o filtro atual.</td></tr>`;

  if (pedidosTbody) pedidosTbody.innerHTML = pedidosVisiveis.length ? pedidosVisiveis.map((pedido) => {
    const itensPedido = estoqueIntelPedidoItens.filter((pedidoItem) => pedidoItem.pedido_id === pedido.id);
    const item = itensPedido[0] || null;
    const produto = item ? findEstoqueIntelProduto(item.produto_id) : null;
    const totalQuantidade = itensPedido.reduce((sum, pedidoItem) => sum + Number(pedidoItem.quantidade_base || 0), 0);
    const extraItens = itensPedido.length > 1 ? ` +${itensPedido.length - 1}` : "";
    const origemLabel = pedido.origem_sistema === "gdp_pedido" ? "Sincronizada do GDP" : "Manual";
    const origemBadge = pedido.origem_sistema === "gdp_pedido" ? "badge-blue" : "badge-yellow";
    const reservaStatus = getEstoqueIntelReservaStatus(pedido.id);
    const podeExcluirDemanda = getEstoqueIntelDemandaExclusaoBloqueios(pedido.id).length === 0;
    return `
      <tr>
        <td><input type="checkbox" class="demanda-check" value="${esc(pedido.id)}" onchange="atualizarSelecaoDemandas()"${_selectedDemandaIds.has(pedido.id) ? ' checked' : ''}></td>
        <td><button style="background:none;border:none;padding:0;color:var(--blue);font-weight:700;cursor:pointer;font-family:monospace;font-size:.76rem" onclick="visualizarDemandaEstoqueIntel('${esc(pedido.id)}')">${esc(pedido.id)}</button>${pedido.cliente || (pedidos.find(pp => pp.id === (pedido.origem_pedido_id || pedido.id)) || {}).escola ? `<br><span style="font-size:.72rem;color:var(--mut)">${esc(pedido.cliente || (pedidos.find(pp => pp.id === (pedido.origem_pedido_id || pedido.id)) || {}).escola || "")}</span>` : ""}</td>
        <td><span class="badge ${origemBadge}">${esc(origemLabel)}</span></td>
        <td>${esc(produto?.nome || "-")}${extraItens ? `<br><span style="font-size:.72rem;color:var(--mut)">${extraItens} item(ns)</span>` : ""}</td>
        <td class="text-right font-mono">${Number(totalQuantidade || 0)}</td>
        <td><span class="badge ${reservaStatus.badgeClass}">${esc(reservaStatus.label)}</span><br><span style="font-size:.72rem;color:var(--mut)">${esc(reservaStatus.detail)}</span></td>
        <td>${pedido.data_prevista || pedido.data ? formatDateTimeLocal(pedido.data_prevista || pedido.data) : "-"}</td>
        <td class="text-right" style="display:flex;justify-content:flex-end;gap:.35rem;flex-wrap:wrap">${pedido.origem_sistema === "gdp_pedido" ? `<button class="btn btn-outline btn-sm" style="padding:.3rem .65rem;font-size:.72rem;border-color:rgba(59,130,246,.4);color:var(--blue)" onclick="gerarDemandaPedidoRealEstoqueIntel('${esc(pedido.id)}')">Ver Conversao</button>` : ""}<button class="btn btn-sm" style="padding:.3rem .65rem;font-size:.72rem;background:rgba(239,68,68,.15);color:var(--red);border:none;font-weight:700" onclick="excluirDemandaEstoqueIntel('${esc(pedido.id)}')">🗑️ Excluir</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8" style="color:var(--mut)">Nenhuma demanda encontrada para o filtro atual.</td></tr>`;
  const pedidosSyncPendenteCount = document.getElementById("ei-pedidos-sync-pendente-count");
  if (pedidosSyncPendenteCount) pedidosSyncPendenteCount.textContent = String(pedidosReaisPendentes.length);
  if (pedidosSyncPendenteTbody) pedidosSyncPendenteTbody.innerHTML = pedidosReaisPendentes.length ? pedidosReaisPendentes.map((item) => `
    <tr>
      <td class="font-mono">${esc(item.pedido.id)}</td>
      <td style="font-size:.76rem;color:var(--mut)">${esc(item.pendenciaLabel)}</td>
      <td><span class="badge badge-yellow">${esc(getPedidoStatusMeta(item.pedido.status).label)}</span></td>
      <td class="text-right"><button class="btn btn-outline btn-sm" style="padding:.3rem .65rem;border-color:rgba(245,158,11,.45);color:#fbbf24" onclick="gerarDemandaPedidoRealEstoqueIntel('${esc(item.pedido.id)}')">Ver Conversao</button></td>
    </tr>
  `).join("") : `<tr><td colspan="4" style="color:var(--mut)">Todos os pedidos reais elegiveis ja possuem demanda.</td></tr>`;

  estoqueTbody.innerHTML = resumoVisivel.length ? resumoVisivel.map((item) => {
    const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === item.produto.id);
    let comprEmb = '—';
    if (embs.length && item.comprometido > 0) {
      const melhorEmb = embs.reduce((best, e) => (Number(e.quantidade_base || 0) > Number(best.quantidade_base || 0)) ? e : best, embs[0]);
      const qtdBase = Number(melhorEmb.quantidade_base || 1);
      const qtdEmbs = Math.ceil(item.comprometido / qtdBase - 0.0001);
      const descEmb = melhorEmb.descricao || (qtdBase + ' ' + (item.produto.unidade_base || 'UN'));
      comprEmb = qtdEmbs + ' emb. (' + descEmb + ')';
    }
    return `<tr>
      <td>${esc(item.produto.nome)}</td>
      <td class="text-right font-mono">${item.fisico}</td>
      <td class="text-right font-mono">${item.comprometido}</td>
      <td class="text-right font-mono" style="font-size:.78rem;color:var(--yellow)">${comprEmb}</td>
      <td class="text-right font-mono" style="color:${item.disponivel >= 0 ? "var(--green)" : "var(--red)"};font-weight:700">${item.disponivel}</td>
      <td>${esc(item.produto.unidade_base)}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" style="color:var(--mut)">Sem estoque calculado para o filtro atual.</td></tr>`;

  movTbody.innerHTML = movVisiveis.length ? [...movVisiveis].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0)).map((mov) => {
    const produto = findEstoqueIntelProduto(mov.produto_id);
    return `
      <tr>
        <td>${mov.data ? formatDateTimeLocal(mov.data) : "-"}</td>
        <td>${esc(produto?.nome || mov.produto_id)}</td>
        <td><span class="badge ${mov.operacao === "+" ? "badge-green" : "badge-red"}">${mov.operacao === "+" ? "Entrada" : "Saída"}</span></td>
        <td class="text-right font-mono">${Number(mov.quantidade || 0)}</td>
        <td>${esc(mov.origem || "-")}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="5" style="color:var(--mut)">Nenhuma movimentacao registrada.</td></tr>`;
  if (fornecedoresTbody) fornecedoresTbody.innerHTML = fornecedoresVisiveis.length ? fornecedoresVisiveis.map((fornecedor) => `
    <tr>
      <td>${esc(fornecedor.nome)}<br><span style="font-size:.72rem;color:var(--mut)">Tel: ${esc(getEstoqueIntelFornecedorTelefone(fornecedor) || "-")} | E-mail: ${esc(getEstoqueIntelFornecedorEmail(fornecedor) || "-")}</span></td>
      <td class="font-mono">${esc(fornecedor.documento || "-")}</td>
      <td><span class="badge ${fornecedor.status === "ativo" ? "badge-green" : fornecedor.status === "homologacao" ? "badge-yellow" : "badge-red"}">${esc(fornecedor.status || "-")}</span></td>
      <td style="font-size:.78rem;color:var(--mut)">${(fornecedor.embalagens || []).map((oferta) => {
        const emb = estoqueIntelEmbalagens.find((item) => item.id === oferta.embalagem_id);
        return `${esc(emb?.descricao || oferta.embalagem_id)}: ${brl.format(Number(oferta.preco_unitario || 0))} <button class="btn btn-outline btn-sm" style="padding:.15rem .45rem;margin-left:.35rem" onclick="excluirOfertaFornecedorEstoqueIntel('${esc(fornecedor.id)}','${esc(oferta.embalagem_id)}')">Excluir oferta</button>`;
      }).join("<br>") || "Sem preco negociado especifico. Usa o preco padrao da embalagem."}</td>
      <td class="text-right"><button class="btn btn-outline btn-sm" onclick="excluirFornecedorEstoqueIntel('${esc(fornecedor.id)}')">Excluir</button></td>
    </tr>
  `).join("") : `<tr><td colspan="5" style="color:var(--mut)">Nenhum fornecedor cadastrado.</td></tr>`;
  if (comprasTbody) comprasTbody.innerHTML = comprasVisiveis.length ? comprasVisiveis.map((compra) => {
    const fornecedor = findEstoqueIntelFornecedor(compra.fornecedor_id);
    const itensCompra = getEstoqueIntelCompraItens(compra);
    const produtosCompra = itensCompra.map((item) => findEstoqueIntelProduto(item.produto_id)?.nome || item.produto_id).filter(Boolean);
    const origemPedidoLabel = compra.origem_pedido_compra === "lista_automatica_lote"
      ? "Lista automatica em lote"
      : compra.origem_pedido_compra === "lista_automatica"
        ? "Lista automatica"
        : compra.origem_pedido_compra === "sugestao_inteligente"
          ? "Sugestao inteligente"
          : "Manual";
    const envioLabel = compra.envio?.enviado_em
      ? `Enviado em ${formatDateTimeLocal(compra.envio.enviado_em)}`
      : "Aguardando envio";
    return `
      <tr>
        <td><button onclick="visualizarPedidoCompraEstoqueIntel('${esc(compra.id)}')" style="background:none;border:none;padding:0;color:var(--blue);font-weight:700;cursor:pointer;font-family:monospace">${esc(compra.id)}</button></td>
        <td>${esc(fornecedor?.nome || compra.fornecedor_id)}</td>
        <td>${esc(produtosCompra.slice(0, 3).join(", ") || "-")}${produtosCompra.length > 3 ? `<br><span style="font-size:.72rem;color:var(--mut)">+${produtosCompra.length - 3} item(ns)</span>` : ""}</td>
        <td>${esc(origemPedidoLabel)}<br><span style="font-size:.72rem;color:var(--mut)">${itensCompra.length} item(ns)</span></td>
        <td><span class="badge ${compra.status === "pedido_compra_emitido" ? "badge-yellow" : "badge-blue"}">${esc(compra.status || "-")}</span><br><span style="font-size:.72rem;color:var(--mut)">${esc(compra.erp?.status || "-")}</span><br><span style="font-size:.72rem;color:var(--mut)">${esc(envioLabel)}</span></td>
        <td class="text-right font-mono"><strong>${brl.format(Number(compra.valor_total || 0))}</strong><br><span style="font-size:.72rem;color:var(--mut)">${itensCompra.length} item(ns) no pedido</span></td>
        <td class="text-right" style="display:flex;justify-content:flex-end;gap:.35rem;flex-wrap:wrap">${compra.status === "pedido_compra_emitido" ? `<button class="btn btn-outline btn-sm" onclick="enviarPedidoCompraFornecedor('${esc(compra.id)}')">Enviar ao Fornecedor</button>` : `<span style="font-size:.72rem;color:var(--mut)">${esc(compra.envio?.destinatario || "Enviado")}</span>`}<button class="btn btn-outline btn-sm" onclick="excluirPedidoCompraEstoqueIntel('${esc(compra.id)}')">Excluir</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7" style="color:var(--mut)">Nenhum pedido de compra gerado.</td></tr>`;

  if (!sugestaoEl) return;
  if (!estoqueIntelUltimaSugestao?.opcoes?.length) {
    sugestaoEl.innerHTML = `<div style="color:var(--mut)">Informe a necessidade e calcule a melhor embalagem para compra.</div>`;
    return;
  }
  if (!produtoIdsFiltrados.has(estoqueIntelUltimaSugestao.produto?.id) && (busca || filtroBase)) {
    sugestaoEl.innerHTML = `<div style="color:var(--mut)">A sugestao atual nao corresponde ao filtro aplicado.</div>`;
    return;
  }
  sugestaoEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
      <div><strong>Produto:</strong> ${esc(estoqueIntelUltimaSugestao.produto?.nome || "-")}</div>
      <div><strong>Necessidade:</strong> <span class="font-mono">${Number(estoqueIntelUltimaSugestao.necessidade || 0)} ${esc(estoqueIntelUltimaSugestao.produto?.unidade_base || "")}</span></div>
    </div>
    <div class="cards cards-3">
      ${estoqueIntelUltimaSugestao.opcoes.map((opcao) => `
        <div class="card" style="border:${opcao.melhorOpcao ? "2px solid var(--green)" : "1px solid var(--line)"}">
          <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center">
            <strong>${esc(opcao.descricao)}</strong>
            ${opcao.melhorOpcao ? '<span class="badge badge-green">Melhor opcao</span>' : ""}
          </div>
          <div style="margin-top:.7rem;color:var(--mut);font-size:.82rem">Quantidade base: <span class="font-mono">${opcao.quantidade_base}</span></div>
          <div style="margin-top:.4rem">Pacotes: <strong>${opcao.quantidadePacotes}</strong></div>
          <div>Total comprado: <strong>${opcao.totalComprado}</strong></div>
          <div>Sobra: <strong>${opcao.sobra}</strong></div>
        </div>
      `).join("")}
    </div>
  `;
  prepararIntegracaoErpEstoqueIntel();
  renderListaComprasEstoqueIntel();
  // Story 4.43: render GDP demandas/estoque/compras (migrado de app.js)
  renderGdpDemandasIntel();
  renderGdpEstoqueIntel();
  renderGdpComprasIntel();
}

function renderGdpDemandasIntel() {
  const tbody = document.getElementById("ei-gdp-demandas-tbody");
  const empty = document.getElementById("ei-gdp-demandas-empty");
  const countEl = document.getElementById("ei-gdp-demandas-count");
  if (!tbody) return;
  if (countEl) countEl.textContent = gdpDemandas.length;
  if (gdpDemandas.length === 0) { if (empty) empty.style.display = "block"; tbody.innerHTML = ""; return; }
  if (empty) empty.style.display = "none";
  tbody.innerHTML = gdpDemandas.map(d => {
    const convertidos = d.itens.filter(i => i.status === "convertido").length;
    const semVinculo = d.itens.filter(i => i.status === "sem_vinculo").length;
    const statusBadge = d.status === "confirmada"
      ? '<span class="badge badge-green">Confirmada</span>'
      : '<span class="badge badge-yellow">Rascunho</span>';
    return '<tr>' +
      '<td><input type="checkbox" class="demanda-check" value="' + esc(d.id) + '" onchange="atualizarSelecaoDemandas()"' + (_selectedDemandaIds.has(d.id) ? ' checked' : '') + '></td>' +
      '<td><button onclick="gdpVerDemanda(\'' + d.id + '\')" style="background:none;border:none;padding:0;color:var(--blue);font-weight:700;cursor:pointer;font-family:monospace;font-size:.76rem">' + esc(d.id) + '</button></td>' +
      '<td>' + esc(d.escola) + '</td>' +
      '<td>' + convertidos + ' ok' + (semVinculo > 0 ? ', <span style="color:var(--red)">' + semVinculo + ' sem vinculo</span>' : '') + '</td>' +
      '<td class="text-right font-mono">' + brl.format(d.totalEstimado) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td class="text-center" style="white-space:nowrap">' +
        (d.status === "rascunho" ? '<button class="btn btn-green btn-sm" style="font-size:.72rem;padding:.15rem .4rem" onclick="gdpConfirmarDemanda(\'' + d.id + '\')">Confirmar</button>' : '') +
      '</td></tr>';
  }).join("");
}

function renderGdpEstoqueIntel() {
  const tbody = document.getElementById("ei-gdp-estoque-tbody");
  const empty = document.getElementById("ei-gdp-estoque-empty");
  if (!tbody) return;
  const entries = Object.entries(gdpEstoqueSimples);
  if (entries.length === 0) { if (empty) empty.style.display = "block"; tbody.innerHTML = ""; return; }
  if (empty) empty.style.display = "none";
  tbody.innerHTML = entries.map(([sku, s]) => {
    const produto = getGdpBancoProduto(sku);
    const prodIntel = estoqueIntelProdutos.find(p => p.sku === sku || p.id === sku);
    const emb = prodIntel ? estoqueIntelEmbalagens.find(e => e.produto_id === prodIntel.id) : null;
    const base = prodIntel?.unidade_base || produto?.unidade || '-';
    const embDesc = emb ? emb.descricao || (emb.quantidade_base + ' ' + base) : '-';
    const disp = s.qtd - s.qtdComprometida;
    const corDisp = disp <= 0 ? "color:var(--red)" : disp <= (s.minimo || 5) ? "color:var(--yellow)" : "color:var(--green)";
    return '<tr>' +
      '<td class="font-mono" style="font-size:.76rem">' + esc(sku) + '</td>' +
      '<td>' + esc(produto ? (produto.item || produto.nomeComercial || sku) : sku) + '</td>' +
      '<td>' + esc(base) + '</td>' +
      '<td style="font-size:.78rem">' + esc(embDesc) + '</td>' +
      '<td class="text-right">' + s.qtd + '</td>' +
      '<td class="text-right">' + s.qtdComprometida + '</td>' +
      '<td class="text-right" style="' + corDisp + ';font-weight:600">' + disp + '</td>' +
      '<td class="text-center"><button class="btn btn-outline btn-sm" style="font-size:.72rem;padding:.15rem .4rem" onclick="gdpLancamentoEstoque(\'' + esc(sku) + '\')">Entrada</button></td>' +
    '</tr>';
  }).join("");
}

function renderGdpComprasIntel() {
  const tbody = document.getElementById("ei-gdp-compras-tbody");
  const empty = document.getElementById("ei-gdp-compras-empty");
  const totalEl = document.getElementById("ei-gdp-compras-total");
  if (!tbody) return;
  if (gdpListaCompras.length === 0) { if (empty) empty.style.display = "block"; tbody.innerHTML = ""; if (totalEl) totalEl.textContent = ""; return; }
  if (empty) empty.style.display = "none";
  tbody.innerHTML = gdpListaCompras.map(c => '<tr>' +
    '<td>' + esc(c.produto) + '</td>' +
    '<td class="text-right">' + c.qtd + '</td>' +
    '<td>' + esc(c.fornecedor) + '</td>' +
    '<td class="text-right font-mono">' + brl.format(c.custoUnitario) + '</td>' +
    '<td class="text-right font-mono">' + brl.format(c.custoTotal) + '</td>' +
    '<td>' + esc(c.escola) + '</td>' +
  '</tr>').join("");
  const total = gdpListaCompras.reduce((s, c) => s + c.custoTotal, 0);
  if (totalEl) totalEl.textContent = "Total: " + brl.format(total);
}
