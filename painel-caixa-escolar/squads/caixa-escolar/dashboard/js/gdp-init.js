// [gdp-core.js loaded above — sidebar, constants, cloud sync, state, storage, save/load, etc.]

// ===== TABS =====
function resetTabState() {
  // AC1: Clear all search fields
  ["busca-contrato","busca-item","busca-pedido","busca-nota-fiscal","cp-busca","cr-busca","int-busca","ei-busca","busca-lista-compras","busca-usuario","busca-entrega","busca-produto"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  // AC2: Clear all selection Sets
  _selectedPedidoIds.clear();
  _selectedNotaFiscalIds.clear();
  _selectedContaPagarIds.clear();
  _selectedContaReceberIds.clear();
  _selectedDemandaIds.clear();
  // AC2: Uncheck all checkboxes (select-all + individual)
  document.querySelectorAll(".pedido-check,.nota-fiscal-check,.cp-check,.cr-check,.demanda-check,.cliente-chk,.banco-prod-chk").forEach(cb => { cb.checked = false; });
  ["pedidos-select-all","notas-fiscais-select-all","cp-select-all","cr-select-all","demandas-select-all","clientes-select-all","banco-prod-select-all","ei-lista-compras-select-all"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.checked = false; el.indeterminate = false; }
  });
  // AC3: Hide all bulk action bars
  ["pedidos-bulk-actions","notas-fiscais-bulk-actions","cp-bulk-actions","cr-bulk-actions","demandas-bulk-actions","clientes-bulk-actions"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function switchTab(tab) {
  resetTabState();
  toggleGdpSidebarMenu(true);
  document.querySelectorAll(".sidebar-subitem[data-gdp-tab]").forEach((item) => item.classList.remove("active"));
  const tabBtn = document.querySelector(`.sidebar-subitem[data-gdp-tab="${tab}"]`);
  if (tabBtn) tabBtn.classList.add("active");
  const contractsKpis = document.getElementById("kpi-grid");
  if (contractsKpis) contractsKpis.classList.toggle("hidden", tab !== "contratos");
  const title = document.getElementById("gdp-section-title");
  const labels = {
    usuarios: "Clientes",
    "notas-entrada": "Notas de Entrada",
    estoque: "Estoque Intel",
    contratos: "Contratos",
    pedidos: "Pedidos",
    entregas: "Entregas",
    "notas-fiscais": "Notas Fiscais",
    "contas-pagar": "Contas a Pagar",
    "contas-receber": "Contas a Receber",
    caixa: "Caixa",
    relatorios: "Relatorios",
    importar: "Importar Contrato"
  };
  if (title) title.textContent = labels[tab] || "Contratos";
  ["importar","contratos","itens","usuarios","pedidos","notas-fiscais","contas-pagar","contas-receber","caixa","relatorios","notas-entrada","estoque","entregas"].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle("hidden", t !== tab);
  });
  if (tab === "contratos") renderContratos();
  if (tab === "itens") renderItens();
  if (tab === "pedidos") renderPedidos();
  if (tab === "notas-fiscais") renderNotasFiscais();
  if (tab === "contas-pagar") renderContasPagar();
  if (tab === "contas-receber") renderContasReceber();
  if (tab === "caixa") renderCaixa();
  if (tab === "relatorios") renderRelatorios();
  if (tab === "notas-entrada") renderNotasEntrada();
  if (tab === "estoque") renderEstoque();
  if (tab === "usuarios") renderUsuarios();
}

// [gdp-contratos-module.js loaded above — file parsers, import, contract CRUD, catalog, render]

async function criarPedidoCatalogo(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  ensureContratoItensMetadata(c);
  const itensP = [];
  document.querySelectorAll('.catalogo-qtd').forEach(input => {
    const qtd = parseFloat(input.value) || 0;
    if (qtd <= 0) return;
    const idx = parseInt(input.dataset.idx);
    const item = c.itens[idx];
    if (!item) return;
    itensP.push({
      descricao: item.descricao,
      unidade: item.unidade || 'un',
      qtd: qtd,
      preco: item.precoUnitario,
      precoUnitario: item.precoUnitario,
      itemNum: item.num,
      sku: item.skuVinculado || item.sku || '',
      ncm: item.ncm || ''
    });
  });
  if (itensP.length === 0) { showToast("Selecione ao menos um item.", 3000); return; }
  const valor = itensP.reduce((s, i) => s + i.qtd * i.preco, 0);

  // Get linked school data (full client info)
  const escola = getClientePrincipalDoContrato(contratoId);
  const escolaNome = escola ? escola.nome : c.escola;

  const hoje = new Date().toISOString().slice(0,10);
  const pedido = {
    id: 'PED-' + Date.now().toString(36).toUpperCase(),
    contratoId: contratoId,
    escola: escolaNome,
    cliente: {
      nome: escolaNome,
      cnpj: escola?.cnpj || '',
      indicador_contribuinte: '9',
      ie: escola?.ie || 'ISENTO',
      cep: escola?.cep || '',
      cidade: escola?.municipio || '',
      uf: escola?.uf || 'MG',
      logradouro: escola?.logradouro || '',
      bairro: escola?.bairro || '',
      numero: escola?.numero || '',
      complemento: escola?.complemento || '',
      telefone: escola?.telefone || '',
      email: escola?.email || ''
    },
    itens: itensP,
    valor: valor,
    status: 'em_aberto',
    data: hoje,
    dataEntrega: hoje,
    origem: 'catalogo-fornecedor',
    obs: c.observacoes || '',
    saldoDeduzido: true
  };
  pedidos.push(pedido);
  savePedidos();

  // Auto-transmit: deduct saldo from contract items
  itensP.forEach(pi => {
    const normDesc = (pi.descricao || '').toUpperCase().trim();
    const item = c.itens.find(ci => ci.num === pi.itemNum || (ci.descricao || '').toUpperCase().trim() === normDesc);
    if (item) {
      const saldo = item.qtdContratada - item.qtdEntregue;
      item.qtdEntregue += Math.min(pi.qtd, saldo);
    }
  });
  saveContratos();

  document.getElementById("modal-contrato").classList.add("hidden");
  renderAll();
  showToast(`Pedido ${pedido.id} criado para operacao interna do GDP — ${itensP.length} iten(s), ${brl.format(valor)}`, 4000);
}

function excluirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir contrato ${c.id} — ${c.escola}?\n\nEsta ação não pode ser desfeita.`)) return;
  registrarContratoExcluido(c);
  contratos = contratos.filter(x => x.id !== id);
  saveContratos();
  renderAll();
  showToast(`Contrato ${id} excluído.`);
}

// ===== CONTRACT DETAIL MODAL =====
function novoContratoManual() {
  const draft = pendingContratoDraft || {};
  document.getElementById("modal-contrato-titulo").textContent = "Novo Contrato Manual";
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Escola / Órgão</label><input type="text" id="mc-escola" list="mc-clientes-list" value="${esc(draft.escola || '')}" placeholder="Nome da escola" oninput="sugerirClienteContrato(this.value)" style="width:100%"><datalist id="mc-clientes-list">${usuarios.map((u) => `<option value="${esc(u.nome)}"></option>`).join("")}</datalist></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Número do Edital</label><input type="text" id="mc-edital" value="${esc(draft.edital || '')}" placeholder="Ex: PE 001/2026" style="width:100%"></div>
      <div style="grid-column:1/-1;font-size:.78rem;padding:.65rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--mut)" id="mc-cliente-info">Selecione um cliente já cadastrado ou digite um nome para localizar.</div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Número do Processo</label><input type="text" id="mc-processo" value="${esc(draft.processo || '')}" placeholder="Ex: 001/2026" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Vigência</label><input type="text" id="mc-vigencia" value="${esc(draft.vigencia || '')}" placeholder="Ex: 01/01/2026 a 31/12/2026" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Fornecedor</label><input type="text" id="mc-fornecedor" value="${esc(draft.fornecedor || 'Lariucci & Ribeiro Pereira')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Status</label><select id="mc-status" style="width:100%"><option value="ativo"${(draft.status || 'ativo') === 'ativo' ? ' selected' : ''}>Ativo</option><option value="encerrado"${draft.status === 'encerrado' ? ' selected' : ''}>Encerrado</option></select></div>
      <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Objeto</label><input type="text" id="mc-objeto" value="${esc(draft.objeto || '')}" placeholder="Descrição do objeto" style="width:100%"></div>
      <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Observações</label><textarea id="mc-obs" placeholder="Informações adicionais..." style="width:100%;min-height:50px;padding:.5rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--txt);font-size:.85rem;resize:vertical">${esc(draft.observacoes || '')}</textarea></div>
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="fecharModalContrato()">Cancelar</button>
      <button class="btn btn-green" onclick="salvarContratoManual()">Criar Contrato</button>
    </div>
  `;
  document.getElementById("modal-contrato").classList.remove("hidden");
  sugerirClienteContrato(draft.escola || "");
}

function salvarContratoManual() {
  const escola = (document.getElementById("mc-escola").value || "").trim();
  if (!escola) { showToast("Nome da escola é obrigatório.", 3000); return; }
  const draft = {
    escola,
    edital: (document.getElementById("mc-edital").value || "").trim(),
    processo: (document.getElementById("mc-processo").value || "").trim(),
    vigencia: (document.getElementById("mc-vigencia").value || "").trim(),
    fornecedor: (document.getElementById("mc-fornecedor").value || "").trim(),
    status: document.getElementById("mc-status").value || "ativo",
    objeto: (document.getElementById("mc-objeto").value || "").trim(),
    observacoes: (document.getElementById("mc-obs").value || "").trim()
  };
  const cliente = findClienteBySchoolName(escola);
  if (!cliente) {
    abrirCadastroClienteParaContrato(draft);
    return;
  }
  const id = "CTR-" + Date.now().toString(36).toUpperCase();
  const c = {
    id,
    escola: cliente.nome,
    edital: draft.edital,
    processo: draft.processo,
    vigencia: draft.vigencia,
    fornecedor: draft.fornecedor,
    status: draft.status,
    objeto: draft.objeto,
    observacoes: draft.observacoes,
    dataApuracao: new Date().toISOString().split("T")[0],
    itens: [],
    clienteSnapshot: buildClienteFiscalSnapshot(cliente, cliente.nome)
  };
  vincularClienteAoContrato(c, cliente);
  contratos.push(c);
  saveContratos();
  saveUsuarios();
  pendingContratoDraft = null;
  fecharModalContrato();
  // renderAll();
  showToast("Contrato " + id + " criado com cliente vinculado. Adicione itens clicando no contrato.");
}

function adicionarItemContrato(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  _contratoAbertoId = contratoId; // sub-screen: Fechar returns to detail
  const nextNum = c.itens.length + 1;
  document.getElementById("modal-contrato-titulo").textContent = "Adicionar Item — " + c.id;
  document.getElementById("modal-contrato-header-actions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="abrirContrato('${contratoId}')">← Voltar</button>`;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Descrição do Produto</label><input type="text" id="ai-descricao" placeholder="Ex: Arroz tipo 1, 5kg" style="width:100%" oninput="sugerirNcmAdd()"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Unidade</label><input type="text" id="ai-unidade" value="Un" placeholder="Un/Kg/Cx/Pct" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Qtd Contratada</label><input type="number" id="ai-qtd" value="1" min="1" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Preço Unitário (R$)</label><input type="number" id="ai-preco" value="0" step="0.01" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">NCM</label><input type="text" id="ai-ncm" placeholder="0000.00.00" style="width:100%;font-family:monospace"><div id="ai-ncm-hint" style="font-size:.65rem;color:var(--green);margin-top:.2rem"></div></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">SKU</label><input type="text" id="ai-sku" placeholder="auto ou manual" style="width:100%;font-family:monospace"></div>
      </div>
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="abrirContrato('${contratoId}')">Cancelar</button>
      <button class="btn btn-green" onclick="salvarItemContrato('${contratoId}')">Adicionar</button>
      <button class="btn btn-blue" onclick="salvarItemContrato('${contratoId}',true)">Adicionar + Novo</button>
    </div>
  `;
}

function salvarItemContrato(contratoId, continuar) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const descricao = (document.getElementById("ai-descricao").value || "").trim();
  if (!descricao) { showToast("Descrição é obrigatória.", 3000); return; }
  const ncmVal = (document.getElementById("ai-ncm").value || "").trim();
  const skuVal = (document.getElementById("ai-sku")?.value || "").trim();
  const item = {
    num: c.itens.length + 1,
    descricao,
    unidade: (document.getElementById("ai-unidade").value || "Un").trim(),
    qtdContratada: parseInt(document.getElementById("ai-qtd").value) || 1,
    qtdEntregue: 0,
    precoUnitario: parseFloat(document.getElementById("ai-preco").value) || 0,
    ncm: ncmVal,
    sku: skuVal
  };
  enrichContratoItemMetadata(c, item, c.itens.length);
  c.itens.push(item);
  saveContratos();
  adicionarAoBancoProdutos(item);
  showToast("Item " + item.num + " adicionado: " + descricao.slice(0, 40));

  // Auto-cadastrar no ERP (silent, background, non-blocking)
  const itemIdx = c.itens.length - 1;
  cadastrarTinyItem(contratoId, itemIdx, true).then(() => {
    if (!continuar) abrirContrato(contratoId);
  }).catch(() => {});

  if (continuar) {
    adicionarItemContrato(contratoId);
  } else {
    abrirContrato(contratoId);
    renderAll();
  }
}

function adicionarAoBancoProdutos(item) {
  loadBancoProdutos();
  const normDesc = (item.descricao || '').toUpperCase().trim();
  const existing = bancoProdutos.itens.findIndex(p =>
    (p.descricao || '').toUpperCase().trim() === normDesc
  );
  const existingSku = existing >= 0 ? (bancoProdutos.itens[existing].sku || '') : '';
  const produto = {
    descricao: item.descricao,
    unidade: item.unidade || 'Un',
    precoUnitario: item.precoUnitario || 0,
    ncm: item.ncm || '',
    sku: item.sku || existingSku || '',
    addedAt: new Date().toISOString()
  };
  if (existing >= 0) {
    bancoProdutos.itens[existing] = { ...bancoProdutos.itens[existing], ...produto };
  } else {
    bancoProdutos.itens.push(produto);
  }
  saveBancoProdutos();
  if (!document.getElementById("tab-banco-produtos").classList.contains("hidden")) {
    renderBancoProdutos();
  }
}

async function salvarEEnviarERP(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const descricao = (document.getElementById("ai-descricao").value || "").trim();
  if (!descricao) { showToast("Descrição é obrigatória.", 3000); return; }
  const preco = parseFloat(document.getElementById("ai-preco").value) || 0;
  if (preco <= 0) { showToast("Preço unitário é obrigatório.", 3000); return; }
  // 1. Save item to contract
  salvarItemContrato(contratoId);
  // 2. Get index of newly added item (last)
  const itemIdx = c.itens.length - 1;
  // 3. Send to ERP
  try {
    await cadastrarTinyItem(contratoId, itemIdx);
    showToast("Item salvo no contrato + enviado ao ERP + salvo no Banco de Produtos!", 4000);
  } catch(err) {
    showToast("Item salvo no contrato e Banco, mas erro ao enviar ao ERP: " + err.message, 5000);
  }
}

function editarItemContrato(contratoId, idx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[idx]) return;
  _contratoAbertoId = contratoId; // sub-screen: Fechar returns to detail
  const item = c.itens[idx];
  document.getElementById("modal-contrato-titulo").textContent = "Editar Item #" + item.num + " — " + c.id;
  document.getElementById("modal-contrato-header-actions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="abrirContrato('${contratoId}')">← Voltar</button>`;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Descrição do Produto</label><input type="text" id="ei-descricao" value="${esc(item.descricao)}" style="width:100%" oninput="sugerirNcmEdit()"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Unidade</label><input type="text" id="ei-unidade" value="${esc(item.unidade)}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Qtd Contratada</label><input type="number" id="ei-qtd" value="${item.qtdContratada}" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Qtd Entregue</label><input type="number" id="ei-entregue" value="${item.qtdEntregue}" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Preço Unitário (R$)</label><input type="number" id="ei-preco" value="${item.precoUnitario}" step="0.01" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">NCM</label><input type="text" id="ei-ncm" value="${esc(item.ncm || '')}" placeholder="0000.00.00" style="width:100%;font-family:monospace"><div id="ei-ncm-hint" style="font-size:.65rem;color:var(--green);margin-top:.2rem">${item.ncm ? '' : (() => { const s = findNcmLocal(item.descricao); return s ? 'Sugestão: ' + s.ncm : ''; })()}</div></div>
      </div>
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="abrirContrato('${contratoId}')">Cancelar</button>
      <button class="btn btn-sm btn-red" onclick="excluirItemContrato('${contratoId}',${idx})" style="margin-right:auto">Excluir Item</button>
      <button class="btn btn-green" onclick="salvarEdicaoItem('${contratoId}',${idx})">Salvar</button>
    </div>
  `;
}

function salvarEdicaoItem(contratoId, idx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[idx]) return;
  const descricao = (document.getElementById("ei-descricao").value || "").trim();
  if (!descricao) { showToast("Descrição é obrigatória.", 3000); return; }
  c.itens[idx].descricao = descricao;
  c.itens[idx].unidade = (document.getElementById("ei-unidade").value || "Un").trim();
  c.itens[idx].qtdContratada = parseInt(document.getElementById("ei-qtd").value) || 0;
  c.itens[idx].qtdEntregue = parseInt(document.getElementById("ei-entregue").value) || 0;
  c.itens[idx].precoUnitario = parseFloat(document.getElementById("ei-preco").value) || 0;
  c.itens[idx].ncm = (document.getElementById("ei-ncm").value || "").trim();
  enrichContratoItemMetadata(c, c.itens[idx], idx);
  c.valorTotal = c.itens.reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada) || 0), 0);
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[idx]);
  showToast("Item atualizado!");
  abrirContrato(contratoId);
  renderAll();
}

function excluirItemContrato(contratoId, idx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[idx]) return;
  if (!confirm("Excluir item: " + c.itens[idx].descricao + "?")) return;
  c.itens.splice(idx, 1);
  c.itens.forEach((item, i) => item.num = i + 1);
  saveContratos();
  showToast("Item excluído.");
  abrirContrato(contratoId);
  renderAll();
}

function abrirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  ensureContratoItensMetadata(c);

  _contratoAbertoId = null;
  document.getElementById("modal-contrato-titulo").textContent = `${c.id} — ${c.escola.length > 50 ? c.escola.slice(0, 48) + "..." : c.escola}`;
  document.getElementById("modal-contrato-header-actions").innerHTML = `
    <button class="btn btn-sm btn-red" onclick="excluirContrato('${c.id}')">Excluir</button>
    <button class="btn btn-sm btn-blue" onclick="salvarDadosContrato('${c.id}')">Salvar</button>
    <button class="btn btn-outline btn-sm" onclick="fecharModalContrato()">Cancelar</button>
  `;

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);
  const totalSaldo = totalContratado - totalEntregue;

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div class="kpi" style="margin:0"><div class="kpi-label">Contratado</div><div class="kpi-value green" style="font-size:1.3rem">${brl.format(totalContratado)}</div></div>
      <div class="kpi" style="margin:0"><div class="kpi-label">Entregue</div><div class="kpi-value blue" style="font-size:1.3rem">${brl.format(totalEntregue)}</div></div>
      <div class="kpi" style="margin:0"><div class="kpi-label">Saldo</div><div class="kpi-value yellow" style="font-size:1.3rem">${brl.format(totalSaldo)}</div></div>
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:1rem;margin-bottom:1.5rem">
      <h3 style="font-size:.8rem;text-transform:uppercase;color:var(--mut);letter-spacing:.04em;margin-bottom:.8rem">Dados do Contrato</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Caixa Escolar / Escola</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="text" id="ctr-escola-${c.id}" value="${esc(c.escola || '')}" placeholder="Nome da escola" list="ctr-clientes-list-${c.id}" style="flex:1">
            <datalist id="ctr-clientes-list-${c.id}">${usuarios.map(u => '<option value="' + esc(u.nome) + '">').join('')}</datalist>
            <button class="btn btn-sm btn-outline" onclick="vincularClienteManual('${c.id}')" title="Vincular escola a um cliente cadastrado" style="white-space:nowrap">Vincular Cliente</button>
          </div>
          <div id="ctr-cliente-info-${c.id}" style="font-size:.72rem;color:var(--mut);margin-top:.3rem">${c.escolaClienteId ? '✓ Vinculado: ' + esc((usuarios.find(u => u.id === c.escolaClienteId) || {}).nome || c.escolaClienteId) : '⚠ Sem vínculo com cliente'}</div>
        </div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Edital</label><input type="text" id="ctr-edital-${c.id}" value="${esc(c.edital || '')}" placeholder="Ex: PE 001/2026" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Fornecedor</label><input type="text" id="ctr-fornecedor-${c.id}" value="${esc(c.fornecedor || '')}" placeholder="Nome do fornecedor" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Data Apuracao</label><input type="date" id="ctr-data-${c.id}" value="${esc(c.dataApuracao || '')}" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Status</label><select id="ctr-status-${c.id}" style="width:100%"><option value="ativo" ${c.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="encerrado" ${c.status === 'encerrado' ? 'selected' : ''}>Encerrado</option></select></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Numero do Processo</label><input type="text" id="ctr-processo-${c.id}" value="${esc(c.processo || '')}" placeholder="Ex: 001/2026" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Vigencia</label><input type="text" id="ctr-vigencia-${c.id}" value="${esc(c.vigencia || '')}" placeholder="Ex: 01/01/2026 a 31/12/2026" style="width:100%"></div>
        <div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Objeto</label><input type="text" id="ctr-objeto-${c.id}" value="${esc(c.objeto || '')}" placeholder="Descricao do objeto" style="width:100%"></div>
        <div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Observacoes (replicadas automaticamente nos pedidos)</label><textarea id="ctr-obs-${c.id}" placeholder="Informacoes adicionais..." style="width:100%;min-height:50px;padding:.5rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--txt);font-size:.85rem;resize:vertical">${esc(c.observacoes || '')}</textarea></div>
        <div style="grid-column:1/-1;margin-top:.4rem"><label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;cursor:pointer;padding:.4rem .6rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px"><input type="checkbox" id="ctr-saldo-visivel-${c.id}" ${c.saldoVisivelEscola ? 'checked' : ''}> Permitir que a escola acompanhe o saldo do contrato no Portal Escolar</label></div>
      </div>
      <div style="margin-top:.6rem;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-sm btn-outline" onclick="recalcularSaldoContrato('${c.id}')" title="Recalcular saldo com base nos pedidos reais">🔄 Recalcular Saldo</button>
          <button class="btn btn-sm" style="background:rgba(107,114,128,.15);color:var(--mut);border:none;font-weight:700" onclick="imprimirContrato('${c.id}')" title="Imprimir contrato completo">🖨️ Imprimir</button>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;flex-wrap:wrap;gap:.5rem">
      <div style="display:flex;align-items:center;gap:.6rem">
        <h3 style="font-size:.9rem;margin:0">Itens do Contrato (${c.itens.length})</h3>
        <span style="font-size:.72rem;color:var(--dim)">${c.itens.filter(i => i.sku).length}/${c.itens.length} com SKU</span>
        <span id="itens-selecionados-${c.id}" style="font-size:.72rem;color:var(--cyan);font-weight:600"></span>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
        <button class="btn btn-sm btn-blue hidden" id="btn-editar-massa-${c.id}" onclick="editarItensMassa('${c.id}')" title="Editar itens selecionados">Editar Selecionados</button>
        <button class="btn btn-sm btn-red hidden" id="btn-excluir-massa-${c.id}" onclick="excluirItensSelecionados('${c.id}')" title="Excluir itens selecionados">Excluir Selecionados</button>
        <button class="btn btn-sm" style="background:rgba(139,92,246,.15);color:var(--purple);border:none;font-weight:700" onclick="abrirCatalogoEscolar('${c.id}')" title="Abrir catalogo da escola vinculada para pedidos internos">📋 Catalogo Escolar</button>
        <button class="btn btn-sm" style="background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700" onclick="visualizarVinculos('${c.id}')" title="Visualizar vinculos de itens e escolas">🔗 Ver Vínculos</button>
        <button class="btn btn-sm" style="background:rgba(16,185,129,.15);color:var(--green);border:none;font-weight:700" onclick="autoPreencherNcm('${c.id}');abrirContrato('${c.id}')" title="Preencher NCM automaticamente (mapa local + banco)">NCM Auto</button>
        <button class="btn btn-sm" style="background:rgba(168,85,247,.15);color:#a855f7;border:none;font-weight:700" onclick="classificarNcmIA('${c.id}')" title="Classificar NCM dos itens sem codigo usando IA (GPT)">🤖 NCM IA</button>
        <button class="btn btn-sm btn-green" onclick="adicionarItemContrato('${c.id}')">+ Novo Produto</button>
      </div>
    </div>
    <div class="table-wrap" style="overflow-y:auto;max-height:60vh">
      <table style="font-size:.78rem">
        <thead><tr><th style="width:30px"><input type="checkbox" onchange="toggleSelectAllItens('${c.id}',this.checked)" title="Selecionar todos"></th><th>#</th><th>Item</th><th style="min-width:130px">Produto Vinculado</th><th style="min-width:100px">NCM</th><th style="min-width:80px">SKU</th><th>Unid</th><th class="text-right">Contr.</th><th class="text-right">Entr.</th><th class="text-right">Saldo</th><th>%</th><th class="text-right">Preco</th><th class="text-center">Acoes</th></tr></thead>
        <tbody>${c.itens.map((item, idx) => {
          const saldo = item.qtdContratada - item.qtdEntregue;
          const pct = item.qtdContratada > 0 ? (item.qtdEntregue / item.qtdContratada * 100) : 0;
          // Priority: manual skuVinculado > equivalencia auto-match
          const equivSku = item.skuVinculado || getGdpEquivalencia(item.descricao);
          const equivProdutoIntel = equivSku ? estoqueIntelProdutos.find(p => p.sku === equivSku || p.id === equivSku) : null;
          const equivProdutoBanco = !equivProdutoIntel && equivSku ? getGdpBancoProduto(equivSku) : null;
          const equivNome = item.skuVinculado && item.produtoVinculado ? item.produtoVinculado : (equivProdutoIntel ? equivProdutoIntel.nome : (equivProdutoBanco ? (equivProdutoBanco.nomeComercial || equivProdutoBanco.item) : (item.produtoVinculado || equivSku || '')));
          return `<tr>
            <td class="text-center"><input type="checkbox" class="item-check-${c.id}" data-idx="${idx}" onchange="atualizarSelecaoItens('${c.id}')"></td>
            <td class="text-center">${item.num}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}"><span title="${item.sku ? 'SKU disponível para pedido/NF' : 'SKU pendente de geração interna'}" style="font-size:.6rem;margin-right:.3rem">${item.sku ? '🟢' : '🟡'}</span>${esc(item.descricao)}</td>
            <td style="min-width:130px">${equivSku
              ? '<div style="display:flex;align-items:center;gap:.3rem"><span style="color:var(--green);font-size:.74rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px" title="' + esc(equivNome + ' (' + equivSku + ')') + '">&#10003; ' + esc(equivNome.length > 18 ? equivNome.slice(0,16) + '..' : equivNome) + '</span><button style="background:none;border:none;cursor:pointer;font-size:.68rem;color:var(--blue);padding:0" onclick="abrirVincularGDP(\'' + c.id + '\',' + idx + ')" title="Alterar vinculo">&#9998;</button></div>'
              : '<button class="btn btn-sm" style="font-size:.72rem;padding:.15rem .4rem;background:rgba(139,92,246,.15);color:var(--purple);border:none;cursor:pointer" onclick="abrirVincularGDP(\'' + c.id + '\',' + idx + ')" title="Vincular produto cadastrado">Vincular</button>'
            }</td>
            <td style="min-width:120px">
              <div style="display:flex;align-items:center;gap:.2rem">
                <input type="text" value="${esc(item.ncm || '')}" id="ncm-${c.id}-${idx}" placeholder="00.00.00.00" style="width:90px;font-size:.72rem;font-family:monospace;padding:.15rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--cyan)" onchange="salvarNcmItem('${c.id}',${idx},this.value)">
                <button style="background:none;border:none;cursor:pointer;font-size:.7rem;color:var(--blue);padding:0" onclick="buscarNcmItem('${c.id}',${idx})" title="Buscar NCM automaticamente">🔍</button>
              </div>
            </td>
            <td style="font-size:.72rem;font-family:monospace;color:var(--dim)">${esc(item.sku || '-')}</td>
            <td class="nowrap">${esc(item.unidade)}</td>
            <td class="text-right font-mono">${item.qtdContratada}</td>
            <td class="text-right font-mono">${item.qtdEntregue}</td>
            <td class="text-right font-mono" style="font-weight:700;color:${saldo > 0 ? 'var(--yellow)' : 'var(--green)'}">${saldo}</td>
            <td style="min-width:50px"><div class="progress"><div class="progress-fill ${pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'blue'}" style="width:${pct}%"></div></div><span style="font-size:.6rem;color:var(--dim)">${pct.toFixed(0)}%</span></td>
            <td class="text-right font-mono">${brl.format(item.precoUnitario)}</td>
            <td class="text-center" style="white-space:nowrap">
              <button class="btn btn-sm" style="font-size:.75rem;padding:.2rem .4rem;background:rgba(59,130,246,.15);color:var(--blue);border:none;cursor:pointer" onclick="editarItemContrato('${c.id}',${idx})" title="Editar item">✏️</button>
              <button class="btn btn-sm" style="font-size:.72rem;padding:.15rem .38rem;background:rgba(239,68,68,.15);color:var(--red);border:none;cursor:pointer" onclick="excluirItemContrato('${c.id}',${idx})" title="Excluir item">🗑️</button>
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    <div id="tiny-result-${c.id}" class="hidden" style="margin-top:1rem;padding:1rem;border-radius:8px;background:var(--s1);border:1px solid var(--bdr);font-size:.85rem"></div>`;

  document.getElementById("modal-contrato-body").innerHTML = html;
  document.getElementById("modal-contrato").classList.remove("hidden");
  // Reset checkbox selection count after HTML rebuild
  atualizarSelecaoItens(c.id);
}

// _contratoAbertoId declared in gdp-contratos-module.js

function fecharModalContrato() {
  if (_contratoAbertoId) {
    abrirContrato(_contratoAbertoId);
    return;
  }
  document.getElementById("modal-contrato").classList.add("hidden");
}

// AC6: ESC to close modals
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    const modal = document.getElementById("modal-contrato");
    if (modal && !modal.classList.contains("hidden")) { fecharModalContrato(); return; }
  }
});

function registrarEntregas(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  let count = 0;
  c.itens.forEach((item, idx) => {
    const input = document.getElementById(`entrega-${c.id}-${idx}`);
    if (input) {
      const qty = parseInt(input.value) || 0;
      if (qty > 0) {
        const saldo = item.qtdContratada - item.qtdEntregue;
        item.qtdEntregue += Math.min(qty, saldo);
        count += qty;
      }
    }
  });

  if (count === 0) {
    showToast("Preencha pelo menos uma quantidade para registrar.", 3000);
    return;
  }

  saveContratos();
  showToast(`${count} unidades registradas como entregues!`);
  renderAll();
  abrirContrato(contratoId); // Refresh modal
}

function excluirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir contrato ${c.id} — ${c.escola}?\n\nEsta ação não pode ser desfeita.`)) return;
  registrarContratoExcluido(c);
  contratos = contratos.filter(c => c.id !== id);
  saveContratos();
  fecharModalContrato();
  renderAll();
  showToast(`Contrato ${id} excluído.`);
}

function recalcularSaldoContrato(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  // Get all pedidos for this contract that had saldo deducted (status recebido or faturado)
  const pedidosCtr = pedidos.filter(p => p.contratoId === contratoId && (p.status === 'recebido' || p.status === 'faturado' || p.status === 'concluido' || p.saldoDeduzido));

  // Reset all qtdEntregue to 0
  c.itens.forEach(item => { item.qtdEntregue = 0; });

  // Recalculate from pedidos
  pedidosCtr.forEach(p => {
    (p.itens || []).forEach(pi => {
      const normDesc = (pi.descricao || '').toUpperCase().trim();
      const item = c.itens.find(ci => ci.num === pi.itemNum || (ci.descricao || '').toUpperCase().trim() === normDesc);
      if (item) {
        item.qtdEntregue += (pi.qtd || 0);
      }
    });
  });

  // Cap qtdEntregue to qtdContratada
  c.itens.forEach(item => {
    if (item.qtdEntregue > item.qtdContratada) item.qtdEntregue = item.qtdContratada;
  });

  saveContratos();
  renderAll();
  abrirContrato(contratoId);

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);
  showToast(`Saldo recalculado! Contratado: ${brl.format(totalContratado)} | Entregue: ${brl.format(totalEntregue)} | Saldo: ${brl.format(totalContratado - totalEntregue)}`, 5000);
}

function imprimirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);

  const linked = getClientesVinculadosAoContrato(id);
  const escolasHtml = linked.length > 0
    ? linked.map(u => `<tr><td>${u.nome}</td><td>${u.cnpj || '-'}</td><td>${u.municipio || '-'}</td><td>${u.telefone || '-'}</td><td>${u.email || '-'}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma escola vinculada</td></tr>';

  const itensHtml = c.itens.map(item => {
    const saldo = item.qtdContratada - item.qtdEntregue;
    return `<tr>
      <td style="text-align:center">${item.num}</td>
      <td>${item.descricao}</td>
      <td style="text-align:center">${item.ncm || '-'}</td>
      <td style="text-align:center;font-family:monospace;font-size:.8em">${item.sku || '-'}</td>
      <td style="text-align:center">${item.unidade}</td>
      <td style="text-align:right">${item.qtdContratada}</td>
      <td style="text-align:right">${item.qtdEntregue}</td>
      <td style="text-align:right;font-weight:bold">${saldo}</td>
      <td style="text-align:right">${brl.format(item.precoUnitario)}</td>
      <td style="text-align:right">${brl.format(item.precoUnitario * item.qtdContratada)}</td>
    </tr>`;
  }).join('');

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Contrato ${c.id}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 20px; }
      h1 { font-size: 18px; margin-bottom: 5px; }
      h2 { font-size: 14px; margin: 15px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      th, td { border: 1px solid #ddd; padding: 4px 8px; font-size: 11px; }
      th { background: #f5f5f5; font-weight: bold; text-align: left; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 15px; }
      .info-grid div { font-size: 12px; }
      .info-grid strong { color: #666; }
      .totals { display: flex; gap: 30px; margin: 10px 0; font-size: 13px; }
      .totals div { padding: 8px 12px; background: #f8f8f8; border-radius: 4px; }
      @media print { body { margin: 10px; } }
    </style>
  </head><body>
    <h1>Contrato ${c.id}</h1>
    <p style="color:#666;margin-top:0">${c.escola}</p>

    <div class="info-grid">
      <div><strong>Edital:</strong> ${c.edital || '-'}</div>
      <div><strong>Fornecedor:</strong> ${c.fornecedor || '-'}</div>
      <div><strong>Processo:</strong> ${c.processo || '-'}</div>
      <div><strong>Status:</strong> ${c.status || '-'}</div>
      <div><strong>Vigencia:</strong> ${c.vigencia || '-'}</div>
      <div><strong>Data Apuracao:</strong> ${c.dataApuracao || '-'}</div>
      ${c.objeto ? '<div style="grid-column:1/-1"><strong>Objeto:</strong> ' + c.objeto + '</div>' : ''}
      ${c.observacoes ? '<div style="grid-column:1/-1"><strong>Obs:</strong> ' + c.observacoes + '</div>' : ''}
    </div>

    <div class="totals">
      <div><strong>Contratado:</strong> ${brl.format(totalContratado)}</div>
      <div><strong>Entregue:</strong> ${brl.format(totalEntregue)}</div>
      <div><strong>Saldo:</strong> ${brl.format(totalContratado - totalEntregue)}</div>
    </div>

    <h2>Escolas Vinculadas (${linked.length})</h2>
    <table>
      <thead><tr><th>Nome</th><th>CNPJ</th><th>Municipio</th><th>Telefone</th><th>Email</th></tr></thead>
      <tbody>${escolasHtml}</tbody>
    </table>

    <h2>Itens do Contrato (${c.itens.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Descricao</th><th>NCM</th><th>SKU</th><th>Unid</th><th>Contr.</th><th>Entr.</th><th>Saldo</th><th>Preco Unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${itensHtml}</tbody>
      <tfoot><tr><td colspan="9" style="text-align:right;font-weight:bold">Total Contratado:</td><td style="text-align:right;font-weight:bold">${brl.format(totalContratado)}</td></tr></tfoot>
    </table>

    <p style="font-size:10px;color:#999;margin-top:20px">Impresso em ${new Date().toLocaleString('pt-BR')} | GDP - Gestao de Pedidos</p>
    <scr` + `ipt>window.print();<\/scr` + `ipt>
  </body></html>`);
  printWindow.document.close();
}

async function salvarDadosContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  c.escola = (document.getElementById(`ctr-escola-${id}`)?.value || "").trim();
  c.edital = (document.getElementById(`ctr-edital-${id}`)?.value || "").trim();
  c.fornecedor = (document.getElementById(`ctr-fornecedor-${id}`)?.value || "").trim();
  c.dataApuracao = (document.getElementById(`ctr-data-${id}`)?.value || "").trim();
  c.status = document.getElementById(`ctr-status-${id}`)?.value || "ativo";
  c.processo = (document.getElementById(`ctr-processo-${id}`)?.value || "").trim();
  c.vigencia = (document.getElementById(`ctr-vigencia-${id}`)?.value || "").trim();
  c.objeto = (document.getElementById(`ctr-objeto-${id}`)?.value || "").trim();
  c.observacoes = (document.getElementById(`ctr-obs-${id}`)?.value || "").trim();
  c.saldoVisivelEscola = document.getElementById(`ctr-saldo-visivel-${id}`)?.checked || false;
  saveContratos();
  // Force immediate cloud push
  if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
  try { await syncToCloud(); } catch(_) {}
  showToast("Dados do contrato salvos!");
  // AC5: Auto-close modal after save
  _contratoAbertoId = null;
  document.getElementById("modal-contrato").classList.add("hidden");
  renderAll();
}

function getObsContrato(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return "";
  const parts = [];
  if (c.processo) parts.push("Processo: " + c.processo);
  if (c.edital) parts.push("Edital: " + c.edital);
  if (c.objeto) parts.push("Objeto: " + c.objeto);
  if (c.vigencia) parts.push("Vigencia: " + c.vigencia);
  if (c.observacoes) parts.push(c.observacoes);
  return parts.join(" | ");
}

// ===== RENDER ITENS (ALL CONTRACTS) =====
function renderItens() {
  // Populate filter
  const sel = document.getElementById("filtro-contrato-itens");
  const prevVal = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  contratos.forEach(c => {
    const short = c.escola.length > 40 ? c.escola.slice(0, 38) + "..." : c.escola;
    sel.appendChild(new Option(`${c.id} — ${short}`, c.id));
  });
  if (prevVal) sel.value = prevVal;

  const filtroContrato = sel.value;
  const busca = (document.getElementById("busca-item").value || "").toLowerCase();

  const allItens = [];
  const source = filtroContrato ? contratos.filter(c => c.id === filtroContrato) : contratos;
  source.forEach(c => {
    c.itens.forEach(item => {
      allItens.push({ ...item, contratoId: c.id, escola: c.escola });
    });
  });

  const filtered = allItens.filter(i => !busca || i.descricao.toLowerCase().includes(busca) || i.escola.toLowerCase().includes(busca));

  // Atualizar contador da aba com quantidade filtrada
  const itensTabCount = document.getElementById("tab-count-itens");
  if (itensTabCount) itensTabCount.textContent = filtered.length;

  const tbody = document.getElementById("itens-tbody");
  const empty = document.getElementById("itens-empty");

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filtered.map(i => {
    const saldo = i.qtdContratada - i.qtdEntregue;
    const pct = i.qtdContratada > 0 ? (i.qtdEntregue / i.qtdContratada * 100) : 0;
    const valorSaldo = saldo * i.precoUnitario;
    const escolaShort = i.escola.length > 30 ? i.escola.slice(0, 28) + "..." : i.escola;
    return `<tr>
      <td class="nowrap" title="${esc(i.escola)}">${esc(escolaShort)}</td>
      <td>${esc(i.descricao)}</td>
      <td class="font-mono" style="font-size:.72rem;color:var(--cyan)">${esc(i.ncm || '-')}</td>
      <td class="nowrap">${esc(i.unidade)}</td>
      <td class="text-right font-mono">${i.qtdContratada}</td>
      <td class="text-right font-mono">${i.qtdEntregue}</td>
      <td class="text-right font-mono" style="font-weight:700;color:${saldo > 0 ? 'var(--yellow)' : 'var(--green)'}">${saldo}</td>
      <td style="min-width:100px"><div class="progress"><div class="progress-fill ${pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'blue'}" style="width:${pct}%"></div></div><span style="font-size:.65rem;color:var(--dim)">${pct.toFixed(0)}%</span></td>
      <td class="text-right font-mono">${brl.format(i.precoUnitario)}</td>
      <td class="text-right font-mono" style="color:var(--yellow)">${brl.format(valorSaldo)}</td>
    </tr>`;
  }).join("");
}

function genId(prefix) {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
}

function formatDateTimeLocal(date = new Date()) {
  return new Date(date).toLocaleString("pt-BR");
}

function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  if (s.length < 10 || !s.includes('-')) return s;
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}


function registrarBaixaRecebimento(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  conta.status = "recebida";
  conta.recebidaEm = new Date().toISOString();
  conta.conciliacao = {
    status: "pendente_api_bancaria",
    referencia: genId("CNCL"),
    updatedAt: new Date().toISOString(),
    updatedBy: getAuditActor()
  };
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: new Date().toISOString() };
  saveContasReceber();
  queueGdpIntegration("conta_receber", "registrar_recebimento", conta.id, {
    contaReceberId: conta.id,
    valor: conta.valor,
    forma: conta.forma,
    recebidaEm: conta.recebidaEm,
    conciliacao: conta.conciliacao
  }, {
    channel: "bancaria",
    onSuccess: (data) => updateContaReceberIntegration(conta.id, "bancaria", { status: "recebimento_registrado", protocol: data.protocol || "", lastAction: "registrar_recebimento" }),
    onError: (err) => updateContaReceberIntegration(conta.id, "bancaria", { status: "falha_envio", error: err.message, lastAction: "registrar_recebimento" })
  });
  renderContasReceber();
  showToast(`Recebimento registrado para ${conta.descricao}.`, 3000);
}

function clonarContaReceber(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  toggleContaReceberForm(true);
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  document.getElementById("cr-descricao").value = conta.descricao || "";
  document.getElementById("cr-categoria").value = normalizeContaCategoriaRegistro("receber", conta.categoria) || "faturamento";
  document.getElementById("cr-cliente").value = conta.cliente || "";
  document.getElementById("cr-forma").value = normalizeContaFormaRegistro(conta.forma) || "boleto";
  document.getElementById("cr-valor").value = conta.valor || "";
  document.getElementById("cr-vencimento").value = "";
  showToast(`Conta a receber ${conta.id} clonada. Ajuste vencimento e demais dados antes de registrar.`, 3500);
}

/* ── Contas a Receber: Checkbox, Bulk Actions, Menu "...", Detalhe ── */
var _selectedContaReceberIds = new Set();
var _crDetalheId = null;
var _crDetalheEditing = false;

function toggleSelectAllContasReceber() {
  const checked = document.getElementById("cr-select-all").checked;
  document.querySelectorAll(".cr-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoContasReceber();
}

function atualizarSelecaoContasReceber() {
  _selectedContaReceberIds.clear();
  document.querySelectorAll(".cr-check:checked").forEach(cb => { _selectedContaReceberIds.add(cb.value); });
  const count = _selectedContaReceberIds.size;
  const bar = document.getElementById("cr-bulk-actions");
  if (bar) {
    bar.classList.toggle("hidden", count === 0);
    if (count > 0) bar.style.display = "flex";
    else bar.style.display = "";
  }
  const countEl = document.getElementById("cr-bulk-count");
  if (countEl) countEl.textContent = `${count} conta(s) selecionada(s)`;
  const selectAll = document.getElementById("cr-select-all");
  if (selectAll) {
    const total = document.querySelectorAll(".cr-check").length;
    selectAll.checked = count > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
}

function bulkReceberContas() {
  if (!_selectedContaReceberIds.size) return;
  const dataBaixa = promptDataBaixa("Informe a data do recebimento (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  let count = 0;
  _selectedContaReceberIds.forEach(id => {
    const conta = contasReceber.find(c => c.id === id);
    if (conta && conta.status !== "recebida") {
      conta.status = "recebida";
      conta.recebidaEm = `${dataBaixa}T12:00:00`;
      conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.recebidaEm };
      count++;
    }
  });
  saveContasReceber();
  _selectedContaReceberIds.clear();
  renderContasReceber();
  showToast(`${count} conta(s) a receber baixada(s).`, 3000);
}

function bulkImprimirBoletos() {
  const selecionadas = contasReceber.filter(c => _selectedContaReceberIds.has(c.id) && c.forma === "boleto");
  if (!selecionadas.length) { showToast("Nenhuma conta com boleto selecionada.", "warn"); return; }
  const rows = selecionadas.map(item => `<tr><td>${esc(item.id)}</td><td>${esc(item.descricao)}</td><td>${esc(item.cliente || "-")}</td><td>${fmtDate(item.vencimento)}</td><td class="right">${brl.format(item.valor || 0)}</td><td>${esc(item.cobranca?.linhaDigitavel || "-")}</td></tr>`).join("");
  abrirJanelaRelatorioFinanceiro("Boletos - Contas a Receber", ["ID", "Descricao", "Cliente", "Vencimento", "Valor", "Linha Digitavel"], rows);
}

function bulkExcluirContasReceber() {
  if (!_selectedContaReceberIds.size) return;
  if (!confirm(`Excluir ${_selectedContaReceberIds.size} conta(s) a receber selecionada(s)?`)) return;
  contasReceber = contasReceber.filter(c => !_selectedContaReceberIds.has(c.id));
  saveContasReceber();
  _selectedContaReceberIds.clear();
  renderContasReceber();
  showToast("Contas excluidas.", 3000);
}

function toggleCrMenu(contaId, event) {
  if (event) event.stopPropagation();
  closeCpMenus();
  closeCrMenus();
  const menu = document.getElementById(`cr-menu-${contaId}`);
  if (!menu) return;
  menu.style.position = "fixed";
  menu.style.left = "auto";
  menu.style.top = "auto";
  if (event) {
    const rect = event.target.getBoundingClientRect();
    menu.style.left = rect.left + "px";
    menu.style.top = (rect.bottom + 4) + "px";
  }
  menu.classList.remove("hidden");
}

function closeCrMenus() {
  document.querySelectorAll('[id^="cr-menu-"]').forEach(el => el.classList.add("hidden"));
}

function toggleCrMenuHeader(event) {
  if (event) event.stopPropagation();
}

function abrirDetalheCr(contaId) {
  const conta = contasReceber.find(c => c.id === contaId);
  if (!conta) return;
  _crDetalheId = contaId;
  _crDetalheEditing = false;
  const modal = document.getElementById("cr-detalhe-modal");
  const body = document.getElementById("cr-detalhe-body");
  const actions = document.getElementById("cr-detalhe-actions");
  const editBtn = document.getElementById("cr-detalhe-edit-btn");
  if (editBtn) editBtn.textContent = "Editar";
  if (actions) actions.classList.add("hidden");
  const statusMeta = getContaReceberStatusMeta(conta);
  body.innerHTML = `
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.descricao)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><div style="padding:.4rem 0;font-size:.92rem">${esc(formatCategoriaLabel(conta.categoria))}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cliente</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.cliente || "-")}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.forma)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><div style="padding:.4rem 0;font-size:.92rem">${brl.format(conta.valor || 0)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.dataEmissao || "-")}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><div style="padding:.4rem 0;font-size:.92rem">${esc(conta.vencimento)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${statusMeta.className}">${esc(statusMeta.label)}</span></div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Automacao</label><div style="padding:.4rem 0;font-size:.82rem">${conta.automacao?.whatsapp ? "WhatsApp" : "-"} / ${conta.automacao?.email ? "E-mail" : "-"}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cobranca</label><div style="padding:.4rem 0;font-size:.82rem">${esc(conta.cobranca?.status || "-")}</div></div>
    <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.recebidaEm, conta.audit?.updatedBy))}</div></div>
  `;
  modal.classList.remove("hidden");
}

function fecharDetalheCr() {
  document.getElementById("cr-detalhe-modal").classList.add("hidden");
  _crDetalheId = null;
  _crDetalheEditing = false;
}

function toggleEditCrDetalhe() {
  const conta = contasReceber.find(c => c.id === _crDetalheId);
  if (!conta) return;
  _crDetalheEditing = !_crDetalheEditing;
  const editBtn = document.getElementById("cr-detalhe-edit-btn");
  const actions = document.getElementById("cr-detalhe-actions");
  if (_crDetalheEditing) {
    editBtn.textContent = "Cancelar Edicao";
    actions.classList.remove("hidden");
    const body = document.getElementById("cr-detalhe-body");
    body.innerHTML = `
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><input type="text" id="cr-edit-descricao" value="${esc(conta.descricao)}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><select id="cr-edit-categoria"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cliente</label><input type="text" id="cr-edit-cliente" value="${esc(conta.cliente || "")}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><select id="cr-edit-forma"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><input type="number" id="cr-edit-valor" min="0" step="0.01" value="${conta.valor || 0}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><input type="date" id="cr-edit-dataEmissao" value="${conta.dataEmissao || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><input type="date" id="cr-edit-vencimento" value="${conta.vencimento || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${getContaReceberStatusMeta(conta).className}">${esc(getContaReceberStatusMeta(conta).label)}</span></div></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Automacao</label><div style="padding:.4rem 0;font-size:.82rem">${conta.automacao?.whatsapp ? "WhatsApp" : "-"} / ${conta.automacao?.email ? "E-mail" : "-"}</div></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Cobranca</label><div style="padding:.4rem 0;font-size:.82rem">${esc(conta.cobranca?.status || "-")}</div></div>
      <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.recebidaEm, conta.audit?.updatedBy))}</div></div>
    `;
    renderContaCategoriaOptions();
    renderContaFormaOptions();
    const catEl = document.getElementById("cr-edit-categoria");
    const formaEl = document.getElementById("cr-edit-forma");
    if (catEl) catEl.innerHTML = contaReceberCategorias.map(c => `<option value="${c}" ${c === conta.categoria ? "selected" : ""}>${formatCategoriaLabel(c)}</option>`).join("");
    if (formaEl) formaEl.innerHTML = contaReceberFormas.map(f => `<option value="${f}" ${f === conta.forma ? "selected" : ""}>${f}</option>`).join("");
  } else {
    abrirDetalheCr(_crDetalheId);
  }
}

function salvarEditCrDetalhe() {
  const conta = contasReceber.find(c => c.id === _crDetalheId);
  if (!conta) return;
  conta.descricao = document.getElementById("cr-edit-descricao").value.trim() || conta.descricao;
  conta.categoria = document.getElementById("cr-edit-categoria").value || conta.categoria;
  conta.cliente = document.getElementById("cr-edit-cliente").value.trim() || conta.cliente;
  conta.forma = document.getElementById("cr-edit-forma").value || conta.forma;
  conta.valor = Number(document.getElementById("cr-edit-valor").value) || conta.valor;
  conta.dataEmissao = document.getElementById("cr-edit-dataEmissao").value || conta.dataEmissao;
  conta.vencimento = document.getElementById("cr-edit-vencimento").value || conta.vencimento;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  saveContasReceber();
  renderContasReceber();
  // AC7: Auto-close after save
  fecharDetalheCr();
  showToast("Conta a receber atualizada.", 3000);
}

function atualizarStatusConciliacao(contaId, status) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  conta.conciliacao = conta.conciliacao || { referencia: genId("CNCL") };
  conta.conciliacao.status = status;
  conta.conciliacao.updatedAt = new Date().toISOString();
  conta.conciliacao.updatedBy = getAuditActor();
  saveContasReceber();
  queueGdpIntegration("conta_receber", "atualizar_conciliacao", conta.id, {
    contaReceberId: conta.id,
    statusConciliacao: status,
    referencia: conta.conciliacao.referencia,
    valor: conta.valor
  }, {
    channel: "bancaria",
    onSuccess: (data) => updateContaReceberIntegration(conta.id, "bancaria", { status: "conciliacao_registrada", protocol: data.protocol || "", lastAction: "atualizar_conciliacao", conciliacaoStatus: status }),
    onError: (err) => updateContaReceberIntegration(conta.id, "bancaria", { status: "falha_envio", error: err.message, lastAction: "atualizar_conciliacao", conciliacaoStatus: status })
  });
  renderContasReceber();
  showToast(`Conciliação atualizada para ${status}.`, 3000);
}


function excluirContaReceber(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Excluir a conta a receber "${conta.descricao}"?`)) return;

  const notaId = conta.notaFiscalId || conta.origemId || "";
  contasReceber = contasReceber.filter((item) => item.id !== contaId);
  saveContasReceber();

  if (notaId) {
    const nf = notasFiscais.find((item) => item.id === notaId);
    if (nf?.cobranca) {
      nf.cobranca.status = "removida";
      nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
      saveNotasFiscais();
    }
  }

  integracoesGdp = (integracoesGdp || []).filter((item) => !(item.entityType === "conta_receber" && item.entityId === contaId));
  saveIntegracoesGdp();
  renderContasReceber();
  showToast(`Conta a receber "${conta.descricao}" excluida.`, 3000);
}

function abrirInventario() {
  const resumo = getEstoqueIntelResumo();
  const rows = resumo.map(item => `<tr>
    <td style="font-size:.82rem">${esc(item.produto.nome)}</td>
    <td class="text-center">${esc(item.produto.unidade_base)}</td>
    <td class="text-right font-mono">${item.fisico}</td>
    <td class="text-center"><input type="number" class="inv-qtd" data-prod-id="${item.produto.id}" value="${item.fisico}" min="0" style="width:80px;text-align:right;padding:.3rem .4rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--txt);font-family:monospace"></td>
  </tr>`).join('');
  const modal = document.getElementById('modal-contrato');
  document.getElementById('modal-contrato-titulo').textContent = '📋 Inventário de Estoque';
  document.getElementById('modal-contrato-header-actions').innerHTML = '';
  document.getElementById('modal-contrato-body').innerHTML = `
    <p style="font-size:.82rem;color:var(--mut);margin-bottom:1rem">Atualize a quantidade física real de cada produto. Ao salvar, as diferenças serão registradas como ajuste de inventário.</p>
    <div class="table-wrap" style="max-height:60vh;overflow-y:auto">
      <table style="font-size:.8rem"><thead><tr><th>Produto</th><th class="text-center">Unidade</th><th class="text-right">Estoque Atual</th><th class="text-center">Contagem Real</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem">
      <button class="btn btn-outline" onclick="fecharModalContrato()">Cancelar</button>
      <button class="btn btn-green" onclick="salvarInventario()">Salvar Inventário</button>
    </div>`;
  modal.classList.remove('hidden');
}

function salvarInventario() {
  const inputs = document.querySelectorAll('.inv-qtd');
  let ajustes = 0;
  const agora = new Date().toISOString();
  inputs.forEach(input => {
    const prodId = input.dataset.prodId;
    const novaQtd = Number(input.value || 0);
    const resumo = getEstoqueIntelResumo();
    const item = resumo.find(r => r.produto.id === prodId);
    if (!item) return;
    const diff = novaQtd - item.fisico;
    if (diff === 0) return;
    estoqueIntelMovimentacoes.push({
      id: genId('MOV'),
      produto_id: prodId,
      tipo: 'fisico',
      operacao: diff > 0 ? '+' : '-',
      quantidade: Math.abs(diff),
      data: agora,
      origem: 'inventario',
      referencia_id: 'INV-' + agora.slice(0,10)
    });
    ajustes++;
  });
  if (ajustes > 0) {
    saveEstoqueIntelMovimentacoes();
    renderEstoque();
    showToast(`Inventário salvo: ${ajustes} produto(s) ajustado(s).`, 3000);
  } else {
    showToast('Nenhuma alteração detectada.', 2000);
  }
  fecharModalContrato();
}

function imprimirEstoqueCalculado() {
  const tbody = document.getElementById('ei-estoque-tbody');
  if (!tbody || !tbody.children.length) { showToast('Nenhum estoque para imprimir.'); return; }
  const empresa = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
  const nomeEmpresa = empresa.razaoSocial || empresa.nome || 'Empresa';
  const rows = Array.from(tbody.querySelectorAll('tr')).map(tr => {
    const tds = tr.querySelectorAll('td');
    return tds.length >= 5 ? `<tr>${Array.from(tds).map((td,i) => `<td style="border:1px solid #ddd;padding:6px 8px;${i > 0 && i < 5 ? 'text-align:right' : ''}">${td.textContent}</td>`).join('')}</tr>` : '';
  }).join('');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Estoque</title><style>body{font-family:Arial,sans-serif;margin:2cm;color:#333}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f0f0f0;padding:8px;border:1px solid #ddd;text-align:left;font-size:11px}@media print{body{margin:1cm}}</style></head><body><h2>Estoque Calculado — ${nomeEmpresa}</h2><p style="font-size:11px;color:#666">${new Date().toLocaleDateString('pt-BR')}</p><table><thead><tr><th>Produto</th><th style="text-align:right">Físico</th><th style="text-align:right">Comprometido</th><th style="text-align:right">Compr. Emb.</th><th style="text-align:right">Disponível</th><th>Base</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 3000);
}

function estornarContaReceber(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Estornar conta a receber "${conta.descricao}"?\nValor: ${brl.format(conta.valor)}\n\nO status voltará para pendente.`)) return;
  conta.status = "pendente";
  delete conta.recebidaEm;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), estornoAt: new Date().toISOString() };
  saveContasReceber();
  renderContasReceber();
  showToast(`Conta a receber "${conta.descricao}" estornada.`, 3000);
}

function excluirContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Excluir a conta a pagar "${conta.descricao}"?`)) return;
  contasPagar = contasPagar.filter((item) => item.id !== contaId);
  saveContasPagar();
  renderContasPagar();
  showToast(`Conta a pagar "${conta.descricao}" excluida.`, 3000);
}

function registrarContaPagar() {
  const descricao = document.getElementById("cp-descricao").value.trim();
  const categoria = ensureContaCategoria("pagar", document.getElementById("cp-categoria").value.trim());
  const forma = ensureContaForma("pagar", document.getElementById("cp-forma").value);
  const valor = Number(document.getElementById("cp-valor").value || 0);
  const dataEmissao = document.getElementById("cp-data-emissao").value;
  const vencimento = document.getElementById("cp-vencimento").value;
  if (!descricao || !categoria || !valor || !dataEmissao || !vencimento) {
    showToast("Preencha descricao, categoria, valor, data de emissao e vencimento.", 3500);
    return;
  }
  contasPagar.push({
    id: genId("CP"),
    descricao,
    categoria,
    forma,
    valor,
    dataEmissao,
    vencimento,
    status: "emitida",
    audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
  });
  saveContasPagar();
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  ["cp-descricao", "cp-valor", "cp-data-emissao", "cp-vencimento"].forEach((id) => document.getElementById(id).value = "");
  document.getElementById("cp-categoria").value = "fornecedor";
  document.getElementById("cp-forma").value = "boleto";
  toggleContaPagarForm(false);
  contaPagarStatusTabAtual = "emitida";
  renderContasPagar();
  showToast("Conta a pagar registrada.", 3000);
}

function registrarContaReceber() {
  const descricao = document.getElementById("cr-descricao").value.trim();
  const categoria = ensureContaCategoria("receber", document.getElementById("cr-categoria").value.trim());
  const cliente = document.getElementById("cr-cliente").value.trim();
  const forma = ensureContaForma("receber", document.getElementById("cr-forma").value);
  const valor = Number(document.getElementById("cr-valor").value || 0);
  const dataEmissao = document.getElementById("cr-data-emissao").value;
  const vencimento = document.getElementById("cr-vencimento").value;
  if (!descricao || !categoria || !cliente || !valor || !dataEmissao || !vencimento) {
    showToast("Preencha descricao, categoria, cliente, valor, data de emissao e vencimento.", 3500);
    return;
  }
  contasReceber.push({
    id: genId("CR"),
    origemTipo: "manual",
    origemId: "",
    descricao,
    categoria,
    cliente,
    forma,
    valor,
    dataEmissao,
    vencimento,
    status: "emitida",
    automacao: { whatsapp: false, email: true, ultimoDisparo: "" },
    cobranca: { status: forma === "boleto" ? "boleto_gerado" : "manual", linhaDigitavel: "", pixCopiaECola: "" },
    audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
  });
  saveContasReceber();
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  ["cr-descricao", "cr-cliente", "cr-valor", "cr-data-emissao", "cr-vencimento"].forEach((id) => document.getElementById(id).value = "");
  document.getElementById("cr-categoria").value = "faturamento";
  document.getElementById("cr-forma").value = "boleto";
  toggleContaReceberForm(false);
  contaReceberStatusTabAtual = "emitida";
  renderContasReceber();
  showToast("Conta a receber registrada.", 3000);
}

function registrarBaixaContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  const dataBaixa = promptDataBaixa("Informe a data da baixa (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  conta.status = "paga";
  conta.pagaEm = `${dataBaixa}T12:00:00`;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.pagaEm };
  saveContasPagar();
  renderContasPagar();
  showToast(`Conta a pagar "${conta.descricao}" baixada.`, 3000);
}

function clonarContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  toggleContaPagarForm(true);
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  document.getElementById("cp-descricao").value = conta.descricao || "";
  document.getElementById("cp-categoria").value = normalizeContaCategoriaRegistro("pagar", conta.categoria) || "fornecedor";
  document.getElementById("cp-forma").value = normalizeContaFormaRegistro(conta.forma) || "boleto";
  document.getElementById("cp-valor").value = conta.valor || "";
  document.getElementById("cp-vencimento").value = "";
  showToast(`Conta a pagar ${conta.id} clonada. Ajuste vencimento e demais dados antes de registrar.`, 3500);
}

function estornarContaPagar(contaId) {
  const conta = contasPagar.find((item) => item.id === contaId);
  if (!conta) return;
  if (!confirm(`Estornar conta a pagar "${conta.descricao}"?\nValor: ${brl.format(conta.valor)}\n\nO status voltará para pendente.`)) return;
  conta.status = "pendente";
  delete conta.pagaEm;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), estornoAt: new Date().toISOString() };
  saveContasPagar();
  renderContasPagar();
  showToast(`Conta a pagar "${conta.descricao}" estornada.`, 3000);
}

/* ── Contas a Pagar: Checkbox, Bulk Actions, Menu "...", Detalhe ── */
var _selectedContaPagarIds = new Set();
var _cpDetalheId = null;
var _cpDetalheEditing = false;

function toggleSelectAllContasPagar() {
  const checked = document.getElementById("cp-select-all").checked;
  document.querySelectorAll(".cp-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoContasPagar();
}

function atualizarSelecaoContasPagar() {
  _selectedContaPagarIds.clear();
  document.querySelectorAll(".cp-check:checked").forEach(cb => { _selectedContaPagarIds.add(cb.value); });
  const count = _selectedContaPagarIds.size;
  const bar = document.getElementById("cp-bulk-actions");
  if (bar) {
    bar.classList.toggle("hidden", count === 0);
    if (count > 0) bar.style.display = "flex";
    else bar.style.display = "";
  }
  const countEl = document.getElementById("cp-bulk-count");
  if (countEl) countEl.textContent = `${count} conta(s) selecionada(s)`;
  const selectAll = document.getElementById("cp-select-all");
  if (selectAll) {
    const total = document.querySelectorAll(".cp-check").length;
    selectAll.checked = count > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
}

function bulkBaixarContasPagar() {
  if (!_selectedContaPagarIds.size) return;
  const dataBaixa = promptDataBaixa("Informe a data da baixa (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!dataBaixa) return;
  let count = 0;
  _selectedContaPagarIds.forEach(id => {
    const conta = contasPagar.find(c => c.id === id);
    if (conta && conta.status !== "paga") {
      conta.status = "paga";
      conta.pagaEm = `${dataBaixa}T12:00:00`;
      conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), baixaManualAt: conta.pagaEm };
      count++;
    }
  });
  saveContasPagar();
  _selectedContaPagarIds.clear();
  renderContasPagar();
  showToast(`${count} conta(s) a pagar baixada(s).`, 3000);
}

function bulkExcluirContasPagar() {
  if (!_selectedContaPagarIds.size) return;
  if (!confirm(`Excluir ${_selectedContaPagarIds.size} conta(s) a pagar selecionada(s)?`)) return;
  contasPagar = contasPagar.filter(c => !_selectedContaPagarIds.has(c.id));
  saveContasPagar();
  _selectedContaPagarIds.clear();
  renderContasPagar();
  showToast("Contas excluidas.", 3000);
}

function toggleCpMenu(contaId, event) {
  if (event) event.stopPropagation();
  closeCpMenus();
  closeCrMenus();
  const menu = document.getElementById(`cp-menu-${contaId}`);
  if (!menu) return;
  menu.style.position = "fixed";
  menu.style.left = "auto";
  menu.style.top = "auto";
  if (event) {
    const rect = event.target.getBoundingClientRect();
    menu.style.left = rect.left + "px";
    menu.style.top = (rect.bottom + 4) + "px";
  }
  menu.classList.remove("hidden");
}

function closeCpMenus() {
  document.querySelectorAll('[id^="cp-menu-"]').forEach(el => el.classList.add("hidden"));
}

function toggleCpMenuHeader(event) {
  if (event) event.stopPropagation();
}

document.addEventListener("click", function() { closeCpMenus(); closeCrMenus(); });

function abrirDetalheCp(contaId) {
  const conta = contasPagar.find(c => c.id === contaId);
  if (!conta) return;
  _cpDetalheId = contaId;
  _cpDetalheEditing = false;
  const modal = document.getElementById("cp-detalhe-modal");
  const body = document.getElementById("cp-detalhe-body");
  const actions = document.getElementById("cp-detalhe-actions");
  const editBtn = document.getElementById("cp-detalhe-edit-btn");
  if (editBtn) editBtn.textContent = "Editar";
  if (actions) actions.classList.add("hidden");
  const statusMeta = getContaPagarStatusMeta(conta);
  body.innerHTML = `
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><div id="cp-det-descricao" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.descricao)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><div id="cp-det-categoria" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(formatCategoriaLabel(conta.categoria))}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><div id="cp-det-forma" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.forma)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><div id="cp-det-valor" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${brl.format(conta.valor || 0)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><div id="cp-det-dataEmissao" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.dataEmissao || "-")}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><div id="cp-det-vencimento" class="cp-det-field" style="padding:.4rem 0;font-size:.92rem">${esc(conta.vencimento)}</div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${statusMeta.className}">${esc(statusMeta.label)}</span></div></div>
    <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.pagaEm, conta.audit?.updatedBy))}</div></div>
  `;
  modal.classList.remove("hidden");
}

function fecharDetalheCp() {
  document.getElementById("cp-detalhe-modal").classList.add("hidden");
  _cpDetalheId = null;
  _cpDetalheEditing = false;
}

function toggleEditCpDetalhe() {
  const conta = contasPagar.find(c => c.id === _cpDetalheId);
  if (!conta) return;
  _cpDetalheEditing = !_cpDetalheEditing;
  const editBtn = document.getElementById("cp-detalhe-edit-btn");
  const actions = document.getElementById("cp-detalhe-actions");
  if (_cpDetalheEditing) {
    editBtn.textContent = "Cancelar Edicao";
    actions.classList.remove("hidden");
    const body = document.getElementById("cp-detalhe-body");
    body.innerHTML = `
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Descricao</label><input type="text" id="cp-edit-descricao" value="${esc(conta.descricao)}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><select id="cp-edit-categoria"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><select id="cp-edit-forma"></select></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Valor</label><input type="number" id="cp-edit-valor" min="0" step="0.01" value="${conta.valor || 0}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Emissao</label><input type="date" id="cp-edit-dataEmissao" value="${conta.dataEmissao || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Vencimento</label><input type="date" id="cp-edit-vencimento" value="${conta.vencimento || ""}"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.4rem 0"><span class="badge ${getContaPagarStatusMeta(conta).className}">${esc(getContaPagarStatusMeta(conta).label)}</span></div></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Auditoria</label><div style="padding:.4rem 0;font-size:.82rem;color:var(--mut)">${esc(formatAuditStamp(conta.audit, conta.pagaEm, conta.audit?.updatedBy))}</div></div>
    `;
    renderContaCategoriaOptions();
    renderContaFormaOptions();
    const catEl = document.getElementById("cp-edit-categoria");
    const formaEl = document.getElementById("cp-edit-forma");
    if (catEl) catEl.innerHTML = contaPagarCategorias.map(c => `<option value="${c}" ${c === conta.categoria ? "selected" : ""}>${formatCategoriaLabel(c)}</option>`).join("");
    if (formaEl) formaEl.innerHTML = contaPagarFormas.map(f => `<option value="${f}" ${f === conta.forma ? "selected" : ""}>${f}</option>`).join("");
  } else {
    abrirDetalheCp(_cpDetalheId);
  }
}

function salvarEditCpDetalhe() {
  const conta = contasPagar.find(c => c.id === _cpDetalheId);
  if (!conta) return;
  conta.descricao = document.getElementById("cp-edit-descricao").value.trim() || conta.descricao;
  conta.categoria = document.getElementById("cp-edit-categoria").value || conta.categoria;
  conta.forma = document.getElementById("cp-edit-forma").value || conta.forma;
  conta.valor = Number(document.getElementById("cp-edit-valor").value) || conta.valor;
  conta.dataEmissao = document.getElementById("cp-edit-dataEmissao").value || conta.dataEmissao;
  conta.vencimento = document.getElementById("cp-edit-vencimento").value || conta.vencimento;
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  saveContasPagar();
  renderContasPagar();
  // AC7: Auto-close after save
  fecharDetalheCp();
  showToast("Conta a pagar atualizada.", 3000);
}

function imprimirRelatorioContasPagar() {
  const rows = contasPagar.map((item) => {
    const status = getContaPagarStatusMeta(item);
    return `<tr><td>${esc(item.id)}</td><td>${esc(item.descricao)}</td><td>${esc(formatCategoriaLabel(item.categoria))}</td><td>${fmtDate(item.vencimento)}</td><td class="right">${brl.format(item.valor || 0)}</td><td>${esc(status.label)}</td></tr>`;
  }).join("");
  abrirJanelaRelatorioFinanceiro("Relatorio - Contas a Pagar", ["ID", "Descricao", "Categoria", "Vencimento", "Valor", "Status"], rows);
}

function imprimirRelatorioContasReceber() {
  const rows = contasReceber.map((item) => {
    const status = getContaReceberStatusMeta(item);
    return `<tr><td>${esc(item.id)}</td><td>${esc(item.descricao)}</td><td>${esc(item.cliente || "-")}</td><td>${esc(formatCategoriaLabel(item.categoria))}</td><td>${fmtDate(item.vencimento)}</td><td class="right">${brl.format(item.valor || 0)}</td><td>${esc(status.label)}</td></tr>`;
  }).join("");
  abrirJanelaRelatorioFinanceiro("Relatorio - Contas a Receber", ["ID", "Descricao", "Cliente", "Categoria", "Vencimento", "Valor", "Status"], rows);
}

// [gdp-estoque-intel.js loaded above — Stock Intelligence core functions]
// [gdp-pedidos.js loaded above — Pedidos, NF, CP, CR, Caixa, Relatorios]

function getIntegracoesConsolidadas() {
  const remoteMap = new Map((integracoesRemotas || []).map((item) => [item.id, item]));
  return (integracoesGdp || []).map((local) => ({
    ...local,
    backend: remoteMap.get(local.id) || null
  }));
}

async function atualizarIntegracoesRemotas() {
  try {
    const resp = await fetch("/api/gdp-integrations");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    integracoesRemotas = Array.isArray(data.items) ? data.items : [];
    integracoesUltimaLeitura = new Date().toISOString();
    renderIntegracoes();
  } catch (err) {
    showToast(`Falha ao consultar integracoes: ${err.message}`, 4000);
  }
}

async function carregarConfigSefaz() {
  try {
    const resp = await fetch("/api/gdp-integrations?action=nfe-sefaz-config");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    sefazConfigSnapshot = data;
  } catch (err) {
    sefazConfigSnapshot = { ok: false, error: err.message, missing: ["falha_consulta"] };
  }
  renderIntegracoes();
  return sefazConfigSnapshot;
}

function renderIntegracoes() {
  const tbody = document.getElementById("integracoes-tbody");
  const empty = document.getElementById("integracoes-empty");
  if (!tbody || !empty) return;
  normalizeLegacyManualIntegrations();
  const busca = (document.getElementById("int-busca")?.value || "").toLowerCase();
  const filtroStatus = document.getElementById("int-filtro-status")?.value || "";
  const filtroCanal = document.getElementById("int-filtro-canal")?.value || "";

  let items = getIntegracoesConsolidadas();
  if (busca) {
    items = items.filter((item) => `${item.entityType || ""} ${item.entityId || ""} ${item.channel || ""} ${item.action || ""} ${item.protocol || ""} ${item.backend?.protocol || ""}`.toLowerCase().includes(busca));
  }
  if (filtroStatus) items = items.filter((item) => item.status === filtroStatus);
  if (filtroCanal) items = items.filter((item) => item.channel === filtroCanal);

  const intCountEl = document.getElementById("tab-count-integracoes");
  if (intCountEl) intCountEl.textContent = items.length;
  const pendentes = integracoesGdp.filter((item) => item.status === "pendente_envio").length;
  const ok = integracoesGdp.filter((item) => item.status === "sincronizado").length;
  const falhas = integracoesGdp.filter((item) => item.status === "falha_envio").length;
  document.getElementById("int-kpi-pendente").textContent = pendentes;
  document.getElementById("int-kpi-ok").textContent = ok;
  document.getElementById("int-kpi-falha").textContent = falhas;
  document.getElementById("int-kpi-sync").textContent = sefazConfigSnapshot?.ambiente || (integracoesUltimaLeitura ? formatDateTimeLocal(integracoesUltimaLeitura) : "-");

  if (!items.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  tbody.innerHTML = [
    sefazConfigSnapshot ? `
      <tr>
        <td>${integracoesUltimaLeitura ? formatDateTimeLocal(integracoesUltimaLeitura) : "-"}</td>
        <td>sefaz</td>
        <td><strong>configuracao</strong><br><span class="font-mono" style="font-size:.72rem;color:var(--mut)">${esc(sefazConfigSnapshot.uf || "-")}</span></td>
        <td>snapshot_config</td>
        <td><span class="badge ${((sefazConfigSnapshot.missing || []).length === 0 && sefazConfigSnapshot.certificado === "configurado") ? "badge-green" : "badge-yellow"}">${((sefazConfigSnapshot.missing || []).length === 0 && sefazConfigSnapshot.certificado === "configurado") ? "config_ok" : "config_pendente"}</span></td>
        <td><span class="badge badge-blue">${esc(sefazConfigSnapshot.certificado || "-")}</span><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">${esc(sefazConfigSnapshot.certificadoBytes ? `${sefazConfigSnapshot.certificadoBytes} bytes` : sefazConfigSnapshot.certificadoMensagem || "-")}</div><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">PEM: ${esc(sefazConfigSnapshot.pem?.certStatus || "-")} / ${esc(sefazConfigSnapshot.pem?.keyStatus || "-")}</div></td>
        <td class="font-mono" style="font-size:.72rem">${esc(sefazConfigSnapshot.emitente?.razaoSocial || "-")}</td>
        <td style="font-size:.75rem;color:var(--mut)">${esc((sefazConfigSnapshot.missing || []).length ? sefazConfigSnapshot.missing.join(", ") : "nenhuma pendencia")}</td>
      </tr>` : "",
    ...items.map((item) => `
    <tr>
      <td>${item.createdAt ? formatDateTimeLocal(item.createdAt) : "-"}</td>
      <td>${esc(item.channel || "-")}</td>
      <td><strong>${esc(item.entityType || "-")}</strong><br><span class="font-mono" style="font-size:.72rem;color:var(--mut)">${esc(item.entityId || "-")}</span></td>
      <td>${esc(item.action || "-")}</td>
      <td><span class="badge ${item.status === "sincronizado" ? "badge-green" : item.status === "falha_envio" ? "badge-red" : "badge-yellow"}">${esc(item.status || "-")}</span></td>
      <td><span class="badge ${item.backend?.status === "registrado_backend" ? "badge-blue" : "badge-yellow"}">${esc(item.backend?.status || "-")}</span></td>
      <td class="font-mono" style="font-size:.72rem">${esc(item.backend?.protocol || item.protocol || "-")}</td>
      <td style="font-size:.75rem;color:var(--mut)">${esc(item.error || item.backend?.error || item.remoteStatus || "-")}</td>
    </tr>
  `)
  ].join("");
}

function renderNotasEntrada() {
  const tbody = document.getElementById("notas-entrada-tbody");
  const empty = document.getElementById("notas-entrada-empty");
  if (!tbody || !empty) return;

  const items = [...notasEntrada].sort((a, b) => new Date(b.emitidaEm || b.createdAt || 0) - new Date(a.emitidaEm || a.createdAt || 0));
  const total = items.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const pendentes = items.filter((item) => item.status === "consulta_pendente").length;

  const totalEl = document.getElementById("ne-kpi-total");
  const pendentesEl = document.getElementById("ne-kpi-pendentes");
  const valorEl = document.getElementById("ne-kpi-valor");
  if (totalEl) totalEl.textContent = items.length;
  if (pendentesEl) pendentesEl.textContent = pendentes;
  if (valorEl) valorEl.textContent = brl.format(total);

  if (!items.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  tbody.innerHTML = items.map((item) => `
    <tr>
      <td>${esc(item.emitidaEm ? formatDateTimeLocal(item.emitidaEm) : "-")}</td>
      <td>${esc(item.fornecedor || "-")}</td>
      <td>${esc(item.numero || "-")}</td>
      <td style="font-size:.72rem" class="font-mono">${esc(item.chave || "-")}</td>
      <td class="text-right font-mono">${brl.format(Number(item.valor || 0))}</td>
      <td><span class="badge ${item.status === "registrada" ? "badge-green" : item.status === "consulta_pendente" ? "badge-yellow" : "badge-blue"}">${esc(item.status || "-")}</span></td>
      <td style="font-size:.76rem;color:var(--mut)">${esc(item.origem || "-")}</td>
    </tr>
  `).join("");
}

function registrarNotaEntradaManual() {
  const fornecedor = (document.getElementById("ne-fornecedor")?.value || "").trim();
  const numero = (document.getElementById("ne-numero")?.value || "").trim();
  const chave = (document.getElementById("ne-chave")?.value || "").replace(/\D/g, "");
  const valor = Number(document.getElementById("ne-valor")?.value || 0);
  if (!fornecedor || !numero || !valor) {
    showToast("Informe fornecedor, numero e valor da nota de entrada.", 3500);
    return;
  }
  notasEntrada.unshift({
    id: genId("NE"),
    fornecedor,
    numero,
    chave,
    valor,
    status: "registrada",
    origem: "manual",
    emitidaEm: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
  });
  saveNotasEntrada();

  // Bridge 1: NF Entrada → Custo real
  (function() {
    var notaEntrada = notasEntrada[0]; // just unshifted
    if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
      (notaEntrada.itens || []).forEach(function(item) {
        var bp = bancoPrecos.itens.find(function(b) {
          return (item.ncm && b.ncm === item.ncm && normalizedText(b.item).includes(normalizedText(item.descricao).split(' ')[0])) ||
                 normalizedText(b.item) === normalizedText(item.descricao);
        });
        if (bp) {
          bp.custoBase = item.precoUnitario || item.valorUnitario;
          if (!bp.custosFornecedor) bp.custosFornecedor = [];
          bp.custosFornecedor.push({ fornecedor: notaEntrada.fornecedor || 'NF Entrada', preco: bp.custoBase, data: new Date().toISOString().slice(0,10), tipo: 'nf_entrada' });
          bp.precoReferencia = bp.custoBase * (1 + (bp.margemPadrao || 0.30));
        }
      });
      saveBancoLocal();
    }
  })();

  ["ne-fornecedor", "ne-numero", "ne-chave", "ne-valor"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  renderNotasEntrada();
  showToast("Nota de entrada registrada.", 3000);
}

function importarNotaEntradaXml(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const xml = String(reader.result || "");
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const text = (tag) => doc.getElementsByTagName(tag)?.[0]?.textContent?.trim() || "";
      const emit = text("emit") || text("xNome");
      const nNF = text("nNF");
      const chave = text("chNFe");
      const vNF = Number(text("vNF") || 0);
      const dhEmi = text("dhEmi") || text("dEmi") || new Date().toISOString();
      if (!emit || !nNF) throw new Error("XML sem emitente ou numero da NF");
      notasEntrada.unshift({
        id: genId("NE"),
        fornecedor: emit,
        numero: nNF,
        chave,
        valor: vNF,
        status: "registrada",
        origem: "xml",
        emitidaEm: dhEmi,
        createdAt: new Date().toISOString(),
        audit: { createdAt: new Date().toISOString(), createdBy: getAuditActor(), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() }
      });
      saveNotasEntrada();

      // Bridge 1: NF Entrada → Custo real (XML import)
      (function() {
        var notaEntrada = notasEntrada[0]; // just unshifted
        if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
          (notaEntrada.itens || []).forEach(function(item) {
            var bp = bancoPrecos.itens.find(function(b) {
              return (item.ncm && b.ncm === item.ncm && normalizedText(b.item).includes(normalizedText(item.descricao).split(' ')[0])) ||
                     normalizedText(b.item) === normalizedText(item.descricao);
            });
            if (bp) {
              bp.custoBase = item.precoUnitario || item.valorUnitario;
              if (!bp.custosFornecedor) bp.custosFornecedor = [];
              bp.custosFornecedor.push({ fornecedor: notaEntrada.fornecedor || 'NF Entrada', preco: bp.custoBase, data: new Date().toISOString().slice(0,10), tipo: 'nf_entrada' });
              bp.precoReferencia = bp.custoBase * (1 + (bp.margemPadrao || 0.30));
            }
          });
          saveBancoLocal();
        }
      })();

      renderNotasEntrada();
      showToast("XML de nota de entrada importado.", 3000);
    } catch (err) {
      showToast("Falha ao importar XML: " + err.message, 4500);
    }
  };
  reader.readAsText(file);
}

function consultarNotasEntradaApi() {
  const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const cnpj = String(empresa.cnpj || "").replace(/\D/g, "");
  const item = {
    id: genId("NE"),
    fornecedor: "Consulta API",
    numero: "-",
    chave: "",
    valor: 0,
    status: "consulta_pendente",
    origem: "api_sefaz",
    emitidaEm: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  notasEntrada.unshift(item);
  saveNotasEntrada();
  renderNotasEntrada();
  queueGdpIntegration("nota_entrada", "consultar_documentos_destinados", item.id, {
    notaEntradaId: item.id,
    cnpjDestinatario: cnpj,
    requestedAt: new Date().toISOString()
  }, {
    channel: "sefaz",
    onSuccess: (data) => {
      item.status = "consulta_concluida";
      item.remote = data.protocol || "";
      // Processar notas retornadas e dar entrada automatica
      const docs = data.documentos || data.notas || data.items || [];
      if (Array.isArray(docs) && docs.length > 0) {
        let importados = 0;
        docs.forEach(doc => {
          const chave = doc.chaveAcesso || doc.chave || doc.key || "";
          const jaExiste = notasEntrada.some(ne => ne.chave === chave && chave);
          if (!jaExiste) {
            notasEntrada.unshift({
              id: genId("NE"),
              fornecedor: doc.emitente?.nome || doc.fornecedor || doc.razaoSocial || "Fornecedor",
              numero: doc.numero || doc.nNF || "",
              chave: chave,
              valor: Number(doc.valor || doc.vNF || 0),
              status: "baixada_automatica",
              origem: "api_sefaz",
              emitidaEm: doc.emitidaEm || doc.dhEmi || new Date().toISOString(),
              createdAt: new Date().toISOString(),
              cnpjEmitente: doc.emitente?.cnpj || doc.cnpjEmitente || "",
              itens: doc.itens || []
            });
            importados++;
          }
        });
        item.fornecedor = `Consulta API (${importados} nota${importados !== 1 ? "s" : ""} importada${importados !== 1 ? "s" : ""})`;
        showToast(`${importados} nota(s) de entrada baixada(s) automaticamente.`, 4000);
      } else {
        item.fornecedor = "Consulta API (nenhuma nota nova)";
      }
      saveNotasEntrada();

      // Bridge 1: NF Entrada → Custo real (API import — processar todas notas importadas)
      if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
        notasEntrada.filter(function(ne) { return ne.origem === 'api_sefaz' && ne.itens && ne.itens.length > 0; }).forEach(function(notaEntrada) {
          (notaEntrada.itens || []).forEach(function(itemNe) {
            var bp = bancoPrecos.itens.find(function(b) {
              return (itemNe.ncm && b.ncm === itemNe.ncm && normalizedText(b.item).includes(normalizedText(itemNe.descricao).split(' ')[0])) ||
                     normalizedText(b.item) === normalizedText(itemNe.descricao);
            });
            if (bp) {
              bp.custoBase = itemNe.precoUnitario || itemNe.valorUnitario;
              if (!bp.custosFornecedor) bp.custosFornecedor = [];
              bp.custosFornecedor.push({ fornecedor: notaEntrada.fornecedor || 'NF Entrada', preco: bp.custoBase, data: new Date().toISOString().slice(0,10), tipo: 'nf_entrada' });
              bp.precoReferencia = bp.custoBase * (1 + (bp.margemPadrao || 0.30));
            }
          });
        });
        saveBancoLocal();
      }

      renderNotasEntrada();
    },
    onError: (err) => {
      item.status = "consulta_falhou";
      item.error = err.message;
      saveNotasEntrada();
      renderNotasEntrada();
    }
  });
  showToast("Consulta de notas de entrada enviada para o backend.", 3500);
}

// [gdp-estoque-intel.js loaded above — Stock Intelligence render functions]
// ===== EXPORT CSV =====
function exportItensCSV() {
  const rows = [["Escola","Item","Unidade","Contratado","Entregue","Saldo","Preco","Valor Saldo"]];
  contratos.forEach(c => {
    c.itens.forEach(i => {
      const saldo = i.qtdContratada - i.qtdEntregue;
      rows.push([
        `"${c.escola}"`, `"${i.descricao}"`, `"${i.unidade}"`,
        i.qtdContratada, i.qtdEntregue, saldo,
        i.precoUnitario.toFixed(2).replace(".", ","),
        (saldo * i.precoUnitario).toFixed(2).replace(".", ",")
      ]);
    });
  });
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gdp-contratos-itens-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exportado!");
}

// ===== KPIs =====
function renderKPIs() {
  const ativos = contratos.filter(c => c.status === "ativo");
  const totalItens = ativos.reduce((s, c) => s + (Array.isArray(c.itens) ? c.itens.length : 0), 0);
  const totalValor = ativos.reduce((s, c) => s + ((parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s2, i) => s2 + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0)), 0);
  const pendentes = ativos.reduce((s, c) => s + c.itens.filter(i => i.qtdEntregue < i.qtdContratada).length, 0);

  document.getElementById("kpi-contratos").textContent = ativos.length;
  document.getElementById("kpi-itens").textContent = totalItens;
  document.getElementById("kpi-valor").textContent = brl.format(totalValor);
  document.getElementById("kpi-pendentes").textContent = pendentes;
  document.getElementById("tab-count-contratos").textContent = contratos.length;
  const itensCountEl = document.getElementById("tab-count-itens");
  if (itensCountEl) itensCountEl.textContent = contratos.reduce((s, c) => s + (c.itens ? c.itens.length : 0), 0);
  document.getElementById("tab-count-pedidos").textContent = pedidos.length;
  const nfCountEl = document.getElementById("tab-count-notas-fiscais");
  if (nfCountEl) nfCountEl.textContent = notasFiscais.length;
  const cpCountEl = document.getElementById("tab-count-contas-pagar");
  if (cpCountEl) cpCountEl.textContent = contasPagar.length;
  const crCountEl = document.getElementById("tab-count-contas-receber");
  if (crCountEl) crCountEl.textContent = contasReceber.length;
  const caixaCountEl = document.getElementById("tab-count-caixa");
  if (caixaCountEl) caixaCountEl.textContent = caixaExtratoMovimentos.length;
  const relCountEl = document.getElementById("tab-count-relatorios");
  if (relCountEl) relCountEl.textContent = 3;
  const neCountEl = document.getElementById("tab-count-notas-entrada");
  if (neCountEl) neCountEl.textContent = notasEntrada.length;
  const estoqueCountEl = document.getElementById("tab-count-estoque");
  if (estoqueCountEl) estoqueCountEl.textContent = [...new Set(estoqueMovimentos.map((mov) => mov.sku || mov.descricao))].filter(Boolean).length;
  document.getElementById("tab-count-usuarios").textContent = usuarios.length;
}

// ===== RENDER ALL =====
function renderAll() {
  // Re-read from localStorage to capture updates from portal escola
  // loadData();
  loadBancoProdutos();
  renderGdpSyncIndicator();
  renderContaCategoriaOptions();
  renderContaFormaOptions();
  renderKPIs();
  renderContratos();
  renderPedidos();
  renderNotasFiscais();
  renderContasPagar();
  renderContasReceber();
  renderCaixa();
  renderRelatorios();
  renderEstoque();
  renderEntregas();
  // Update banco tab count even when not on banco tab
  const bpCount = document.getElementById("tab-count-banco-produtos");
  if (bpCount) bpCount.textContent = bancoProdutos.itens.length;
}

// ===== VINCULAR PRODUTO GDP (Story 4.43) =====
let _vincularGdpContratoId = "";
let _vincularGdpItemIdx = -1;
let _vincularGdpDescricao = "";

function abrirVincularGDP(contratoId, itemIdx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  _vincularGdpContratoId = contratoId;
  _vincularGdpItemIdx = itemIdx;
  _vincularGdpDescricao = c.itens[itemIdx].descricao;
  document.getElementById("vincular-gdp-desc").textContent = _vincularGdpDescricao.slice(0, 80) + (_vincularGdpDescricao.length > 80 ? "..." : "");
  // Se já tem vínculo, mostrar produto atual
  const equivSku = getGdpEquivalencia(_vincularGdpDescricao);
  const prodVinculado = equivSku ? estoqueIntelProdutos.find(p => p.sku === equivSku || p.id === equivSku) : null;
  const descEl = document.getElementById("vincular-gdp-desc");
  if (descEl) {
    let descText = _vincularGdpDescricao.slice(0, 80);
    if (prodVinculado) descText += ' → Vinculado a: ' + prodVinculado.nome + ' (' + (prodVinculado.sku || '') + ')';
    descEl.textContent = descText;
  }
  const buscaEl = document.getElementById("vincular-gdp-busca");
  if (buscaEl) buscaEl.value = prodVinculado ? prodVinculado.nome : "";
  renderVincularGDPResultados(prodVinculado ? prodVinculado.nome : "");
  const modal = document.getElementById("modal-vincular-gdp");
  if (modal) { modal.classList.remove("hidden"); modal.style.display = "flex"; }
}

function fecharVincularGDP() {
  const modal = document.getElementById("modal-vincular-gdp");
  if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
  _vincularGdpContratoId = "";
  _vincularGdpItemIdx = -1;
  _vincularGdpDescricao = "";
}

function gdpGerarSkuSugerido(nome) {
  return gdpNormalizedText(nome)
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 1)
    .slice(0, 3)
    .map(t => t.slice(0, 4).toUpperCase())
    .join("-") || ("SKU-" + Date.now().toString(36).slice(-4).toUpperCase());
}

function renderVincularGDPResultados(query) {
  const el = document.getElementById("vincular-gdp-resultados");
  if (!el) return;
  const allProds = estoqueIntelProdutos.map(p => {
    const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === p.id);
    const embsDesc = embs.map(e => {
      const qtd = e.quantidade_base || 1;
      const desc = e.descricao || (qtd + " " + (p.unidade_base || "UN"));
      const preco = e.preco_referencia ? " " + brl.format(e.preco_referencia) : "";
      return desc + preco;
    }).join(" | ") || "Sem embalagem";
    const custoBase = embs.length ? embs[0].preco_referencia || 0 : 0;
    return { id: p.id, nome: p.nome, sku: p.sku || "", base: p.unidade_base || "UN", categoria: p.categoria || "", embs: embsDesc, custoBase };
  });

  if (allProds.length === 0) {
    el.innerHTML = '<div style="padding:1rem;color:var(--mut);text-align:center">Nenhum produto cadastrado. Cadastre em Inteligencia > Produtos.</div>';
    return;
  }
  const q = gdpNormalizedText(query || _vincularGdpDescricao || "");
  let filtrados = allProds;
  if (q) filtrados = allProds.filter(p => gdpNormalizedText(p.nome).includes(q) || gdpNormalizedText(p.sku).includes(q) || gdpNormalizedText(p.categoria).includes(q) || gdpNormalizedText(p.embs).includes(q));
  filtrados = filtrados.slice(0, 50);
  if (filtrados.length === 0) {
    el.innerHTML = '<div style="padding:1rem;color:var(--mut);text-align:center">Nenhum produto encontrado para "' + esc(query) + '".</div>';
    return;
  }
  const equivSkuAtual = getGdpEquivalencia(_vincularGdpDescricao);
  el.innerHTML = '<table style="font-size:.82rem;width:100%"><thead><tr><th></th><th>Produto</th><th>Base</th><th>Embalagens</th><th>SKU</th><th></th></tr></thead><tbody>' +
    filtrados.map(p => {
      const isVinculado = equivSkuAtual && (p.sku === equivSkuAtual || p.id === equivSkuAtual);
      return `<tr style="${isVinculado ? 'background:rgba(34,197,94,.1)' : ''}">
      <td style="text-align:center;font-size:.9rem">${isVinculado ? '✅' : ''}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${isVinculado ? ';font-weight:700;color:var(--green)' : ''}" title="${esc(p.nome)}">${esc(p.nome.slice(0, 35))}</td>
      <td><span class="badge badge-blue" style="font-size:.65rem">${esc(p.base)}</span></td>
      <td style="font-size:.72rem;color:var(--mut);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.embs)}">${esc(p.embs.slice(0, 45))}</td>
      <td class="font-mono" style="font-size:.7rem">${esc(p.sku || "-")}</td>
      <td class="text-center">${isVinculado ? '<span style="font-size:.72rem;color:var(--green);font-weight:700">Atual</span>' : '<button class="btn btn-sm btn-green" style="font-size:.72rem;padding:.15rem .4rem" onclick="selecionarVincularGDPIntel(\'' + esc(p.id) + '\')">Vincular</button>'}</td>
    </tr>`}).join("") + '</tbody></table>';
}

function selecionarVincularGDPIntel(produtoId) {
  const produto = estoqueIntelProdutos.find(p => p.id === produtoId);
  if (!produto) { showToast("Produto nao encontrado.", 3000); return; }
  const sku = produto.sku || produtoId;
  const descSave = _vincularGdpDescricao;
  if (!descSave) { showToast("Descricao do item nao encontrada.", 3000); return; }
  setGdpEquivalencia(descSave, sku);
  // Também salvar SKU no item do contrato diretamente
  if (_vincularGdpContratoId && _vincularGdpItemIdx >= 0) {
    const c = contratos.find(x => x.id === _vincularGdpContratoId);
    if (c && c.itens[_vincularGdpItemIdx]) {
      c.itens[_vincularGdpItemIdx].skuVinculado = sku;
      c.itens[_vincularGdpItemIdx].produtoVinculado = produto.nome;
      saveContratos();
    }
  }
  const cId = _vincularGdpContratoId;
  fecharVincularGDP();
  showToast('Vinculado: "' + descSave.slice(0, 40) + '" -> ' + produto.nome + ' (' + sku + ')');
  if (cId) abrirContrato(cId);
}

function selecionarVincularGDP(bpId) {
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco;
  try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  const bp = banco?.itens?.find(i => i.id === bpId);
  if (!bp) return;
  if (!bp.sku) {
    bp.sku = gdpGerarSkuSugerido(bp.nomeComercial || bp.item);
    localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  }
  const descSave = _vincularGdpDescricao;
  const contratoSave = _vincularGdpContratoId;
  setGdpEquivalencia(descSave, bp.sku);
  // Add to bp equivalencias array for cross-module sync
  if (!bp.equivalencias) bp.equivalencias = [];
  const normDesc = gdpNormalizedText(descSave);
  if (!bp.equivalencias.some(e => gdpNormalizedText(e) === normDesc)) {
    bp.equivalencias.push(descSave);
    localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  }
  // Persist manual link directly on contract item (prevents auto-enrichment override)
  if (contratoSave && _vincularGdpItemIdx >= 0) {
    const ctr = contratos.find(x => x.id === contratoSave);
    if (ctr && ctr.itens[_vincularGdpItemIdx]) {
      ctr.itens[_vincularGdpItemIdx].skuVinculado = bp.sku;
      ctr.itens[_vincularGdpItemIdx].produtoVinculado = bp.nomeComercial || bp.item;
      saveContratos();
    }
  }
  fecharVincularGDP();
  showToast('Vinculado: "' + descSave.slice(0, 40) + '..." -> "' + (bp.nomeComercial || bp.item) + '"');
  abrirContrato(contratoSave);
}

function criarEVincularGDP() {
  const BANCO_KEY = "caixaescolar.banco.v1";
  const nomeComercial = (document.getElementById("vincular-gdp-criar-nome")?.value || "").trim();
  if (!nomeComercial) { showToast("Nome comercial e obrigatorio."); return; }
  let sku = (document.getElementById("vincular-gdp-criar-sku")?.value || "").trim();
  if (!sku) sku = gdpGerarSkuSugerido(nomeComercial);
  const unidade = document.getElementById("vincular-gdp-criar-unidade")?.value || "UN";
  const custo = parseFloat(document.getElementById("vincular-gdp-criar-custo")?.value) || 0;
  let banco;
  try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  if (!banco || !Array.isArray(banco.itens)) banco = { updatedAt: "", itens: [] };
  if (banco.itens.some(bp => bp.sku === sku)) { showToast("SKU ja existe. Escolha outro."); return; }
  const novoBp = {
    id: "bp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
    item: nomeComercial, nomeComercial, sku,
    marca: "", grupo: "Material de Consumo Geral",
    unidade, unidadeCompra: unidade,
    custoBase: custo, margemPadrao: 0.30,
    precoReferencia: custo > 0 ? Math.round(custo * 1.30 * 100) / 100 : 0,
    ultimaCotacao: new Date().toISOString().slice(0, 10),
    fonte: "", fornecedorPadrao: "",
    custo, propostas: [], concorrentes: [],
    custosFornecedor: [],
    equivalencias: [_vincularGdpDescricao]
  };
  const descSave = _vincularGdpDescricao;
  const contratoSave = _vincularGdpContratoId;
  banco.itens.push(novoBp);
  localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  setGdpEquivalencia(descSave, sku);
  // Persist manual link directly on contract item
  if (contratoSave && _vincularGdpItemIdx >= 0) {
    const ctr = contratos.find(x => x.id === contratoSave);
    if (ctr && ctr.itens[_vincularGdpItemIdx]) {
      ctr.itens[_vincularGdpItemIdx].skuVinculado = sku;
      ctr.itens[_vincularGdpItemIdx].produtoVinculado = nomeComercial;
      saveContratos();
    }
  }
  fecharVincularGDP();
  showToast('Produto "' + nomeComercial + '" criado e vinculado.');
  abrirContrato(contratoSave);
}

// ===== GERAR DEMANDA GDP (Story 4.43) =====
function gdpConverterDemanda(pedidoItens) {
  return pedidoItens.map(item => {
    const desc = item.descricao || item.nome || "";
    const equiv = getGdpEquivalencia(desc);
    if (!equiv) return { ...item, status: "sem_vinculo", produtoReal: null, qtdConvertida: 0, custoEstimado: 0 };
    const produto = getGdpBancoProduto(equiv);
    const fator = gdpConversoes[gdpNormalizedText(desc)]?.fator || 1;
    const qtdConvertida = Math.ceil((item.qtd || item.quantidade || 0) / fator);
    const custo = produto ? (produto.custoBase || produto.custo || 0) * qtdConvertida : 0;
    return {
      ...item, status: "convertido",
      produtoReal: produto ? (produto.nomeComercial || produto.item) : equiv,
      skuProduto: equiv,
      qtdOriginal: item.qtd || item.quantidade || 0,
      unidadeOriginal: item.unidade || "UN",
      qtdConvertida,
      unidadeCompra: produto?.unidade || produto?.unidadeCompra || "UN",
      fatorConversao: fator,
      custoUnitario: produto?.custoBase || produto?.custo || 0,
      custoEstimado: Math.round(custo * 100) / 100,
    };
  });
}

function gdpGerarDemandaPedido(pedidoId) {
  const pedido = pedidos.find(p => p.id === pedidoId);
  if (!pedido) return;
  // Check if demanda already exists for this pedido
  if (gdpDemandas.some(d => d.pedidoId === pedidoId)) {
    showToast("Demanda ja existe para este pedido.");
    return;
  }
  const itensConvertidos = gdpConverterDemanda(pedido.itens || []);
  const semVinculo = itensConvertidos.filter(i => i.status === "sem_vinculo").length;
  const demanda = {
    id: "dem-" + Date.now().toString(36),
    pedidoId: pedidoId,
    escola: pedido.escola || pedido.cliente?.nome || "",
    contratoId: pedido.contratoId || "",
    status: "rascunho",
    criadoEm: new Date().toISOString().slice(0, 10),
    itens: itensConvertidos,
    totalEstimado: itensConvertidos.reduce((s, i) => s + (i.custoEstimado || 0), 0),
  };
  gdpDemandas.push(demanda);
  saveGdpDemandas();
  if (semVinculo > 0) {
    showToast("Demanda criada: " + itensConvertidos.length + " itens (" + semVinculo + " sem vinculo - vincule no contrato)");
  } else {
    showToast("Demanda criada: " + itensConvertidos.length + " itens convertidos - " + brl.format(demanda.totalEstimado));
  }
  fecharModalPedido();
}

function gdpVerDemanda(demandaId) {
  const d = gdpDemandas.find(x => x.id === demandaId);
  if (!d) return;
  let msg = "Demanda " + d.id + " - " + d.escola + "\n\n";
  d.itens.forEach((item, i) => {
    if (item.status === "convertido") {
      msg += (i + 1) + ". " + (item.descricao || item.nome) + " -> " + item.produtoReal + "\n   " + item.qtdOriginal + " " + item.unidadeOriginal + " -> " + item.qtdConvertida + " " + item.unidadeCompra + " (fator: " + item.fatorConversao + ")\n   Custo: " + brl.format(item.custoEstimado) + "\n\n";
    } else {
      msg += (i + 1) + ". [SEM VINCULO] " + (item.descricao || item.nome) + "\n\n";
    }
  });
  msg += "Total estimado: " + brl.format(d.totalEstimado);
  alert(msg);
}

function gdpConfirmarDemanda(demandaId) {
  const d = gdpDemandas.find(x => x.id === demandaId);
  if (!d || d.status !== "rascunho") return;
  if (!confirm("Confirmar demanda " + d.id + "? Vai debitar estoque e gerar lista de compras.")) return;
  d.itens.forEach(item => {
    if (item.status !== "convertido" || !item.skuProduto) return;
    const sku = item.skuProduto;
    if (!gdpEstoqueSimples[sku]) gdpEstoqueSimples[sku] = { qtd: 0, qtdComprometida: 0, minimo: 0 };
    const disponivel = gdpEstoqueSimples[sku].qtd - gdpEstoqueSimples[sku].qtdComprometida;
    if (disponivel >= item.qtdConvertida) {
      gdpEstoqueSimples[sku].qtd -= item.qtdConvertida;
    } else {
      const falta = item.qtdConvertida - Math.max(disponivel, 0);
      gdpEstoqueSimples[sku].qtd = Math.max(gdpEstoqueSimples[sku].qtd - item.qtdConvertida, 0);
      const produto = getGdpBancoProduto(sku);
      gdpListaCompras.push({
        sku, produto: item.produtoReal || (produto ? (produto.item || sku) : sku),
        qtd: falta, fornecedor: produto?.fonte || produto?.fornecedorPadrao || "",
        custoUnitario: produto?.custoBase || produto?.custo || 0,
        custoTotal: Math.round(falta * (produto?.custoBase || produto?.custo || 0) * 100) / 100,
        demandaId: d.id, escola: d.escola,
        criadoEm: new Date().toISOString().slice(0, 10),
      });
    }
  });
  d.status = "confirmada";
  saveGdpDemandas();
  saveGdpEstoqueSimples();
  saveGdpListaCompras();
  renderEstoque();
  showToast("Demanda confirmada. Estoque atualizado, " + gdpListaCompras.length + " item(ns) na lista de compras.");
}

function gdpLancamentoEstoque(sku) {
  const qtd = parseInt(prompt("Quantidade de entrada:"));
  if (isNaN(qtd) || qtd <= 0) return;
  if (!gdpEstoqueSimples[sku]) gdpEstoqueSimples[sku] = { qtd: 0, qtdComprometida: 0, minimo: 0 };
  gdpEstoqueSimples[sku].qtd += qtd;
  saveGdpEstoqueSimples();
  renderEstoque();
  showToast("Estoque atualizado: +" + qtd + " para " + sku);
}

function gdpExportarListaCompras() {
  if (gdpListaCompras.length === 0) return showToast("Lista vazia.");
  const header = "Produto;Qtd;Fornecedor;Custo Unit.;Custo Total;Escola";
  const rows = gdpListaCompras.map(c => c.produto + ";" + c.qtd + ";" + c.fornecedor + ";" + c.custoUnitario + ";" + c.custoTotal + ";" + c.escola);
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lista-compras-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
}

function gdpImprimirListaCompras() {
  const table = document.querySelector("#ei-gdp-compras-table");
  if (!table) return;
  const win = window.open("", "_blank");
  win.document.write('<!DOCTYPE html><html><head><title>Lista de Compras</title><style>body{font-family:Arial;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0}</style></head><body><h2>Lista de Compras - ' + new Date().toLocaleDateString("pt-BR") + '</h2>' + table.outerHTML + '</body></html>');
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ===== UTILITIES =====
function esc(s) { return String(s == null ? "" : (typeof s === "object" ? JSON.stringify(s) : s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function showToast(msg, duration = 3000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.style.cssText = "background:#f59e0b;color:#000;font-weight:600;padding:.7rem 1.4rem;border-radius:8px;font-size:.85rem;box-shadow:0 4px 16px rgba(245,158,11,.4);transition:opacity .3s;border:2px solid #d97706";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, duration);
}

// ===== EXPORTAR / IMPORTAR DADOS =====
function exportarDados() {
  const keys = [
    CONTRACTS_KEY, ORDERS_KEY, PROOFS_KEY, INVOICES_KEY, PAYABLES_KEY, RECEIVABLES_KEY, STOCK_KEY, "gdp.usuarios.v1",
    "caixaescolar.banco.v1", "nexedu.empresa", "nexedu.auth"
  ];
  const dados = {};
  keys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v) dados[k] = JSON.parse(v);
  });
  dados._exportDate = new Date().toISOString();
  dados._source = location.hostname;

  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gdp-dados-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Dados exportados com sucesso!");
}

function importarDados(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const dados = JSON.parse(e.target.result);
      const importDate = dados._exportDate || "desconhecida";
      delete dados._exportDate;
      delete dados._source;

      const keys = Object.keys(dados);
      if (keys.length === 0) { showToast("Arquivo vazio ou invalido.", 3000); return; }

      if (!confirm(`Importar dados de ${importDate}?\n\n${keys.length} chaves encontradas:\n${keys.join(", ")}\n\nATENCAO: Dados existentes serao sobrescritos!`)) return;

      keys.forEach(k => {
        localStorage.setItem(k, JSON.stringify(dados[k]));
      });

      showToast(`${keys.length} conjuntos de dados importados! Recarregando...`, 3000);
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      showToast("Erro ao importar: " + err.message, 5000);
    }
  };
  reader.readAsText(file);
  file.value = "";
}

/* [gdp-usuarios.js extracted] */

// ===== AUTO-CADASTRO ERP =====
async function sincronizarContratoTiny(contratoId) {
  notifyErpSyncDisabled("Contrato");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  showToast(`Sincronizando ${c.itens.length} itens com Tiny...`, 3000);
  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: c.itens.map(item => ({
          num: item.num, descricao: item.descricao, unidade: item.unidade,
          precoUnitario: item.precoUnitario, ncm: item.ncm || '',
          sku: '', codigo: ''
        })),
        contractId: contratoId, action: "cadastrar"
      })
    });
    const data = await resp.json();
    if (data.success && data.results) {
      let synced = 0;
      data.results.forEach(r => {
        if (r.sku) {
          const item = c.itens.find(it => it.num === r.num);
          if (item) {
            item.sku = r.sku;
            if (r.unidade) item.unidade = r.unidade;
            synced++;
            adicionarAoBancoProdutos(item);
          }
        }
      });
      saveContratos();
      abrirContrato(contratoId);
      showToast(`${synced}/${c.itens.length} itens sincronizados com Tiny!`, 4000);
    }
  } catch(err) {
    showToast("Erro: " + err.message, 4000);
  }
}

async function autoCadastrarTiny(contratoId) {
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens || c.itens.length === 0) return;

  showToast(`Cadastrando ${c.itens.length} itens no ERP...`, 3000);

  const itens = c.itens.map(item => ({
    num: item.num,
    descricao: item.descricao,
    descricaoCompleta: item.descricao,
    unidade: item.unidade,
    precoUnitario: item.precoUnitario,
    ncm: item.ncm || (findNcmLocal(item.descricao) || {}).ncm || '',
    sku: item.sku || '',
    codigo: item.sku || ''
  }));

  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens, contractId: contratoId, action: "cadastrar" })
    });
    const data = await resp.json();

    if (data.success && data.results) {
      let skuCount = 0;
      data.results.forEach(r => {
        if (r.sku) {
          const item = c.itens.find(it => it.num === r.num);
          if (item) {
            item.sku = r.sku;
            if (r.unidade) item.unidade = r.unidade;
            skuCount++;
            adicionarAoBancoProdutos(item);
          }
        }
      });
      delete c.pendingTinySync;
      saveContratos();
      console.log(`[ERP Auto-Sync] Contrato ${contratoId}: ${skuCount} SKUs obtidos`);
      showToast(`${skuCount}/${c.itens.length} itens cadastrados no ERP com SKU`, 4000);
    } else {
      c.pendingTinySync = true;
      saveContratos();
      showToast("Erro ao cadastrar no ERP. Retry disponivel nos detalhes do contrato.", 5000);
    }
  } catch(err) {
    c.pendingTinySync = true;
    saveContratos();
    console.warn("[ERP Auto-Sync] Falha:", err.message);
    showToast("ERP offline. Itens serao cadastrados quando disponivel.", 4000);
  }
}

async function autoCadastrarClienteOlist(usuario) {
  return;
}

// ===== ENVIAR PEDIDO AO OLIST =====
async function enviarPedidoOlist(pedidoId) {
  notifyErpSyncDisabled("Pedido");
  return;
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;

  // Buscar SKU com fallback em cadeia: Contrato (enriquecido) > Pedido > Banco de Produtos
  const ctr = contratos.find(x => x.id === p.contratoId);
  const bpItens = (() => { try { return (JSON.parse(localStorage.getItem('gdp.produtos.v1')) || {}).itens || []; } catch(_) { return []; } })();
  const items = p.itens.map(i => {
    const ctrItem = ctr ? ctr.itens.find(ci => ci.num === i.itemNum || ci.descricao === i.descricao) : null;
    let sku = (ctrItem && ctrItem.sku) || i.sku || '';
    if (!sku) {
      const descNorm = (i.descricao || '').toUpperCase().trim();
      const bpMatch = bpItens.find(bp => (bp.descricao || '').toUpperCase().trim() === descNorm);
      if (bpMatch && bpMatch.sku) sku = bpMatch.sku;
    }
    if (!sku) console.warn("[Olist] SKU vazio para item:", i.descricao);
    // Resolve unidade: contrato > pedido > banco de produtos > fallback UN
    let unidade = (ctrItem && ctrItem.unidade) || i.unidade || '';
    let ncm = (ctrItem && ctrItem.ncm) || i.ncm || '';
    if (!unidade || !ncm) {
      const descNorm = (i.descricao || '').toUpperCase().trim();
      const bpMatch = bpItens.find(bp => (bp.descricao || '').toUpperCase().trim() === descNorm);
      if (bpMatch) {
        if (!unidade) unidade = bpMatch.unidade || '';
        if (!ncm) ncm = bpMatch.ncm || '';
      }
    }
    return {
      sku,
      description: i.descricao,
      name: i.descricao,
      qty: i.qtd,
      unitPrice: i.precoUnitario,
      itemNum: i.itemNum,
      unidade: unidade || 'UN',
      ncm: ncm
    };
  });

  // Detectar inconsistências de unidade antes do envio
  const unitWarnings = items.filter(i => {
    if (i.unidade !== 'UN') return false;
    const desc = (i.description || '').toLowerCase();
    return /\b(kg|quilo|litro|lts?|pacote|pct|caixa|cx|fardo|rolo)\b/.test(desc);
  });
  if (unitWarnings.length > 0) {
    showToast(`${unitWarnings.length} item(ns) com unidade "UN" mas descrição sugere outra. Verifique antes de emitir NF-e.`, 5000);
  }

  try {
    const resp = await fetch("/api/olist/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: p.id,
        school: p.escola,
        cliente: p.cliente || { nome: p.escola },
        olistClienteId: p.cliente?.olistClienteId || '',
        items: items,
        totalValue: p.valor,
        arp: "ARP-LARIUCCI-2025",
        marcador: p.marcador || "Licit-AIX",
        obs: p.obs || ""
      })
    });
    const data = await resp.json();
    if (data.success) {
      p.olistId = data.olistOrderId;
      savePedidos();
      renderPedidos();
      showToast("Pedido " + p.id + " enviado ao Olist: " + data.olistOrderId);
    } else {
      showToast("Erro: " + data.error, 5000);
    }
  } catch (err) {
    showToast("Erro de conexao: " + err.message, 5000);
  }
}

/* [gdp-entregas.js extracted] */

// ─── Seleção em Massa ───
function toggleSelectAllItens(contratoId, checked) {
  document.querySelectorAll(`.item-check-${contratoId}`).forEach(cb => { cb.checked = checked; });
  atualizarSelecaoItens(contratoId);
}

function atualizarSelecaoItens(contratoId) {
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const count = checks.length;
  const span = document.getElementById(`itens-selecionados-${contratoId}`);
  const btn = document.getElementById(`btn-editar-massa-${contratoId}`);
  const btnVinc = document.getElementById(`btn-vincular-massa-${contratoId}`);
  const btnExcl = document.getElementById(`btn-excluir-massa-${contratoId}`);
  if (span) span.textContent = count > 0 ? `${count} selecionado(s)` : '';
  if (btn) { if (count > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden'); }
  if (btnVinc) { if (count > 0) btnVinc.classList.remove('hidden'); else btnVinc.classList.add('hidden'); }
  if (btnExcl) { if (count > 0) btnExcl.classList.remove('hidden'); else btnExcl.classList.add('hidden'); }
}

// AC8-AC9: Bulk delete contract items
function excluirItensSelecionados(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx)).filter(i => !isNaN(i));
  if (indices.length === 0) { showToast("Nenhum item selecionado."); return; }
  if (!confirm(`Excluir ${indices.length} item(ns) selecionado(s) do contrato?`)) return;
  // Remove from highest index to lowest to avoid shifting
  indices.sort((a, b) => b - a).forEach(idx => { c.itens.splice(idx, 1); });
  // Renumber
  c.itens.forEach((item, i) => { item.num = i + 1; });
  saveContratos();
  showToast(`${indices.length} item(ns) excluído(s).`);
  abrirContrato(contratoId);
  renderAll();
}

function vincularItensMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx)).filter(i => !isNaN(i));
  if (indices.length === 0) { showToast("Nenhum item selecionado."); return; }

  // Build modal with list of selected items + search for each
  let overlay = document.getElementById("vincular-massa-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "vincular-massa-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");

  // Merge products from Intel + Banco
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco; try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  const bancoItens = (banco && Array.isArray(banco.itens)) ? banco.itens : [];
  const allProds = [
    ...estoqueIntelProdutos.map(p => ({ id: p.id, nome: p.nome, sku: p.sku || "", source: "intel" })),
    ...bancoItens.map(bp => ({ id: bp.id, nome: bp.nomeComercial || bp.item || "", sku: bp.sku || "", source: "banco" }))
  ];
  const prodOptions = allProds.map(p => `<option value="${esc(p.id)}|${esc(p.source)}">${esc(p.nome)} (${esc(p.sku || p.id.slice(0,10))})</option>`).join("");

  const rowsHtml = indices.map(idx => {
    const item = c.itens[idx];
    if (!item) return "";
    return `<tr data-vincmassa-idx="${idx}">
      <td style="font-size:.78rem">${item.num || idx+1}</td>
      <td style="font-size:.78rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}">${esc((item.descricao || "").slice(0,45))}</td>
      <td><select class="vincmassa-select" style="width:100%;font-size:.78rem"><option value="">-- Selecionar produto --</option>${prodOptions}</select></td>
    </tr>`;
  }).join("");

  overlay.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:1.5rem;max-width:700px;width:95%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:700">Vincular ${indices.length} Item(ns)</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('vincular-massa-overlay').classList.add('hidden')">✕</button>
      </div>
      <div class="table-wrap" style="max-height:50vh;overflow-y:auto">
        <table style="font-size:.82rem"><thead><tr><th>#</th><th>Descricao do Contrato</th><th>Produto Cadastrado</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-outline" onclick="document.getElementById('vincular-massa-overlay').classList.add('hidden')">Cancelar</button>
        <button class="btn btn-green" onclick="confirmarVincularMassa('${esc(contratoId)}')">Vincular Todos</button>
      </div>
    </div>
  `;
}

function confirmarVincularMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco; try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  let vinculados = 0;
  document.querySelectorAll("[data-vincmassa-idx]").forEach(row => {
    const idx = parseInt(row.getAttribute("data-vincmassa-idx"));
    const sel = row.querySelector(".vincmassa-select");
    if (!sel || !sel.value) return;
    const [prodId, source] = sel.value.split("|");
    const item = c.itens[idx];
    if (!item) return;
    let sku = "";
    if (source === "intel") {
      const p = estoqueIntelProdutos.find(x => x.id === prodId);
      sku = p?.sku || prodId;
    } else {
      const bp = banco?.itens?.find(x => x.id === prodId);
      sku = bp?.sku || "";
    }
    if (sku) {
      setGdpEquivalencia(item.descricao, sku);
      vinculados++;
    }
  });
  document.getElementById("vincular-massa-overlay").classList.add("hidden");
  if (vinculados > 0) {
    saveContratos();
    abrirContrato(contratoId);
    showToast(`${vinculados} item(ns) vinculado(s) com sucesso.`);
  } else {
    showToast("Nenhum item vinculado.");
  }
}

function editarItensMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  _contratoAbertoId = contratoId; // sub-screen: Fechar returns to detail
  const checks = document.querySelectorAll(`.item-check-${contratoId}:checked`);
  const indices = Array.from(checks).map(cb => parseInt(cb.dataset.idx));
  if (indices.length === 0) { showToast('Nenhum item selecionado'); return; }

  const body = document.getElementById("modal-contrato-body");
  const prevHtml = body.innerHTML;
  document.getElementById("modal-contrato-header-actions").innerHTML = '';
  document.getElementById("modal-contrato-titulo").textContent = `Editar ${indices.length} itens — ${c.id}`;

  const rowsHtml = indices.map(idx => {
    const item = c.itens[idx];
    if (!item) return '';
    return `<tr data-edit-idx="${idx}">
      <td class="text-center" style="font-size:.75rem;font-weight:700">${item.num}</td>
      <td><input type="text" class="edit-descricao" value="${esc(item.descricao || '')}" style="width:100%;min-width:220px;font-size:.72rem;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--txt)"></td>
      <td><input type="text" class="edit-ncm" value="${esc(item.ncm || '')}" placeholder="0000.00.00" style="width:100px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--cyan)"></td>
      <td><input type="text" class="edit-unidade" value="${esc(item.unidade || 'UN')}" style="width:50px;font-size:.72rem;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--txt);text-transform:uppercase"></td>
      <td><input type="number" class="edit-qtd" value="${item.qtdContratada || 0}" min="0" style="width:65px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--txt);text-align:right"></td>
      <td><input type="number" class="edit-preco" value="${item.precoUnitario || 0}" step="0.01" style="width:80px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--green);text-align:right"></td>
      <td><input type="text" class="edit-sku" value="${esc(item.sku || '')}" placeholder="auto" style="width:80px;font-size:.72rem;font-family:monospace;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--txt)"></td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;flex-wrap:wrap;gap:.5rem">
      <div>
        <h3 style="margin:0 0 .2rem;font-size:1rem">Editando ${indices.length} itens</h3>
        <p style="font-size:.78rem;color:var(--dim);margin:0">Altere os valores diretamente em cada linha</p>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center">
        <span style="font-size:.72rem;color:var(--dim)">Preencher todos:</span>
        <input type="text" id="fill-all-desc" placeholder="Descricao" style="width:180px;font-size:.7rem;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px">
        <button class="btn btn-sm" style="font-size:.65rem;padding:.2rem .4rem;background:rgba(16,185,129,.15);color:var(--green);border:none;font-weight:700;cursor:pointer" id="btn-fill-all-desc" title="Aplicar descricao em todos os itens da lista">Aplicar Descricao</button>
        <input type="number" id="fill-all-qtd" placeholder="Qtd" style="width:60px;font-size:.7rem;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px">
        <button class="btn btn-sm" style="font-size:.65rem;padding:.2rem .4rem;background:rgba(245,158,11,.15);color:var(--yellow);border:none;font-weight:700;cursor:pointer" id="btn-fill-all-qtd" title="Aplicar quantidade em todos os itens">Aplicar Qtd</button>
        <input type="text" id="fill-all-ncm" placeholder="NCM" style="width:90px;font-size:.7rem;font-family:monospace;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px">
        <button class="btn btn-sm" style="font-size:.65rem;padding:.2rem .4rem;background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700;cursor:pointer" id="btn-fill-all-ncm" title="Aplicar NCM em todos os itens da lista">Aplicar NCM</button>
      </div>
    </div>

    <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--bdr);border-radius:8px">
      <table style="font-size:.78rem;width:100%" id="tabela-edicao-massa">
        <thead><tr style="position:sticky;top:0;background:var(--s2);z-index:1">
          <th>#</th><th>Descricao</th><th>NCM</th><th>Unid</th><th>Qtd</th><th>Preco</th><th>SKU</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem">
      <button class="btn btn-sm btn-outline" id="btn-cancelar-massa">Cancelar</button>
      <button class="btn btn-sm btn-green" id="btn-salvar-massa" style="font-weight:700">Salvar ${indices.length} itens</button>
    </div>`;

  document.getElementById('btn-cancelar-massa').onclick = () => { body.innerHTML = prevHtml; };
  document.getElementById('btn-salvar-massa').onclick = () => { salvarEdicaoMassa(contratoId); };
  document.getElementById('btn-fill-all-desc').onclick = () => {
    const val = document.getElementById('fill-all-desc').value.trim();
    if (!val) return;
    document.querySelectorAll('#tabela-edicao-massa .edit-descricao').forEach(input => { input.value = val; });
    showToast('Descricao aplicada em todos os itens');
  };
  document.getElementById('btn-fill-all-ncm').onclick = () => {
    const val = document.getElementById('fill-all-ncm').value.trim();
    if (!val) return;
    document.querySelectorAll('#tabela-edicao-massa .edit-ncm').forEach(input => { input.value = val; });
    showToast('NCM aplicado em todos os itens');
  };
  document.getElementById('btn-fill-all-qtd').onclick = () => {
    const val = document.getElementById('fill-all-qtd').value.trim();
    if (!val) return;
    document.querySelectorAll('#tabela-edicao-massa .edit-qtd').forEach(input => { input.value = val; });
    showToast('Quantidade aplicada em todos os itens');
  };
}

function salvarEdicaoMassa(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const rows = document.querySelectorAll('#tabela-edicao-massa tbody tr[data-edit-idx]');
  let updated = 0;
  rows.forEach(row => {
    const idx = parseInt(row.dataset.editIdx);
    const item = c.itens[idx];
    if (!item) return;
    const descricao = row.querySelector('.edit-descricao').value.trim();
    const ncm = row.querySelector('.edit-ncm').value.trim();
    const unidade = row.querySelector('.edit-unidade').value.trim();
    const qtd = row.querySelector('.edit-qtd')?.value?.trim();
    const preco = row.querySelector('.edit-preco').value.trim();
    const sku = row.querySelector('.edit-sku').value.trim();
    if (descricao) item.descricao = descricao;
    if (ncm !== (item.ncm || '')) item.ncm = ncm;
    if (unidade) item.unidade = unidade.toUpperCase();
    if (qtd !== undefined && qtd !== '') item.qtdContratada = parseInt(qtd) || 0;
    if (preco) item.precoUnitario = parseFloat(preco);
    if (sku) item.sku = sku;
    enrichContratoItemMetadata(c, item, idx);
    syncContratoItemToPedidos(contratoId, item);
    updated++;
  });
  c.valorTotal = c.itens.reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada) || 0), 0);
  saveContratos();
  abrirContrato(contratoId);
  showToast(`${updated} itens salvos`);
}

async function cadastrarTinyItem(contratoId, itemIdx, silent) {
  if (!silent) notifyErpSyncDisabled("Item");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  const item = c.itens[itemIdx];
  const ncmCode = item.ncm || (findNcmLocal(item.descricao) || {}).ncm || "";
  if (!silent && !confirm(`Cadastrar no Tiny ERP:\n\n${item.descricao}\nUnid: ${item.unidade} | Preço: ${brl.format(item.precoUnitario)}\nNCM: ${ncmCode || '(sem NCM)'}\nMarca: Licit-AIX`)) return;
  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: [{ num: item.num, descricao: item.descricao, descricaoCompleta: item.descricao, unidade: item.unidade, precoUnitario: item.precoUnitario, ncm: ncmCode, sku: item.sku || '', codigo: item.sku || '' }], contractId: contratoId, action: "cadastrar" })
    });
    const data = await resp.json();
    if (data.success) {
      // Propagate SKU from Tiny response
      if (data.results) {
        data.results.forEach(r => {
          if (r.sku && item.num === r.num) {
            item.sku = r.sku;
            adicionarAoBancoProdutos(item);
            saveContratos();
          }
        });
      }
      if (!silent) showToast(`Item "${item.descricao.slice(0,40)}" cadastrado no Tiny!`);
    } else {
      if (!silent) showToast("Erro: " + (data.error || "Falha"), 4000);
    }
  } catch(err) {
    if (!silent) showToast("Erro: " + err.message, 4000);
  }
}

async function cadastrarTiny(contratoId) {
  notifyErpSyncDisabled("Contrato");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  const resultDiv = document.getElementById("tiny-result-" + contratoId);
  if (!resultDiv) return;

  // Show preview with NCM mapping before sending
  const preview = c.itens.map((item, i) => {
    const ncm = findNcmLocal(item.descricao);
    return {
      num: item.num,
      descricao: item.descricao,
      unidade: item.unidade,
      precoUnitario: item.precoUnitario,
      ncm: ncm ? ncm.ncm : "",
      ncmAuto: !!ncm
    };
  });

  // Show editable NCM table
  let tableHtml = `
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
      <h4 style="margin:0">Revisao NCM — ${c.itens.length} itens</h4>
      <span style="background:rgba(139,92,246,.15);color:#8b5cf6;padding:.2rem .6rem;border-radius:999px;font-size:.7rem;font-weight:700">Licit-AIX</span>
    </div>
    <p style="color:var(--mut);font-size:.8rem;margin-bottom:.8rem">Verifique os codigos NCM antes de enviar. Os produtos serao marcados com a tag <strong>Licit-AIX</strong> no Tiny.</p>
    <div class="table-wrap" style="max-height:350px;overflow-y:auto">
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Unid</th><th class="text-right">Preco</th><th>NCM</th><th>Status</th></tr></thead>
        <tbody>
          ${preview.map((p, i) => `<tr>
            <td>${p.num}</td>
            <td style="max-width:280px">${esc(p.descricao.length > 60 ? p.descricao.slice(0, 58) + "..." : p.descricao)}</td>
            <td>${esc(p.unidade)}</td>
            <td class="text-right font-mono">${brl.format(p.precoUnitario)}</td>
            <td><input type="text" id="ncm-${contratoId}-${i}" value="${p.ncm}" style="width:110px;font-family:monospace;font-size:.8rem" placeholder="0000.00.00"></td>
            <td>${p.ncmAuto ? '<span class="badge badge-green">Auto</span>' : '<span class="badge badge-yellow">Manual</span>'}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div style="margin-top:1rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('tiny-result-${contratoId}').classList.add('hidden')">Cancelar</button>
      <button class="btn btn-purple" id="btn-enviar-tiny-${contratoId}" onclick="enviarTiny('${contratoId}')">Enviar para Tiny</button>
    </div>
  `;

  resultDiv.innerHTML = tableHtml;
  resultDiv.classList.remove("hidden");
}

async function enviarTiny(contratoId) {
  notifyErpSyncDisabled("Contrato");
  return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  const btn = document.getElementById("btn-enviar-tiny-" + contratoId);
  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

  const resultDiv = document.getElementById("tiny-result-" + contratoId);

  // Collect NCM values from inputs
  const itens = c.itens.map((item, i) => {
    const ncmInput = document.getElementById("ncm-" + contratoId + "-" + i);
    return {
      num: item.num,
      descricao: item.descricao,
      descricaoCompleta: item.descricao,
      unidade: item.unidade,
      precoUnitario: item.precoUnitario,
      ncm: ncmInput ? ncmInput.value.trim() : "",
      sku: item.sku || '',
      codigo: item.sku || ''
    };
  });

  try {
    const resp = await fetch("/api/tiny-produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens, contractId: contratoId, action: "cadastrar" })
    });

    const data = await resp.json();

    if (!data.success) {
      resultDiv.innerHTML = `<div style="color:var(--red)">Erro: ${esc(data.error || "Falha desconhecida")}</div>
        <button class="btn btn-outline btn-sm" style="margin-top:.5rem" onclick="this.parentElement.classList.add('hidden')">Fechar</button>`;
      return;
    }

    // Show results
    const s = data.summary;
    let html = `
      <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
        <h4 style="margin:0">Resultado — Cadastro Tiny ERP</h4>
        <span style="background:rgba(139,92,246,.15);color:#8b5cf6;padding:.2rem .6rem;border-radius:999px;font-size:.7rem;font-weight:700">Licit-AIX</span>
      </div>
      <div style="display:flex;gap:1rem;margin-bottom:1rem">
        <div class="kpi" style="margin:0;flex:1"><div class="kpi-label">Cadastrados</div><div class="kpi-value green" style="font-size:1.3rem">${s.cadastrados}</div></div>
        <div class="kpi" style="margin:0;flex:1"><div class="kpi-label">Ja Existiam</div><div class="kpi-value blue" style="font-size:1.3rem">${s.existentes}</div></div>
        <div class="kpi" style="margin:0;flex:1"><div class="kpi-label">Erros</div><div class="kpi-value ${s.erros > 0 ? 'red' : 'green'}" style="font-size:1.3rem">${s.erros}</div></div>
      </div>
      <div class="table-wrap" style="max-height:250px;overflow-y:auto">
        <table>
          <thead><tr><th>#</th><th>SKU</th><th>Descricao</th><th>NCM</th><th>Status</th></tr></thead>
          <tbody>
            ${data.results.map(r => `<tr>
              <td>${r.num}</td>
              <td class="font-mono" style="font-size:.75rem">${esc(r.sku || "")}</td>
              <td style="max-width:250px">${esc((r.descricao || "").slice(0, 50))}</td>
              <td class="font-mono">${esc(r.ncm || "-")}</td>
              <td>${r.status === "ok" ? '<span class="badge badge-green">OK</span>' :
                   r.status === "existente" ? '<span class="badge badge-blue">Existente</span>' :
                   '<span class="badge badge-red" title="' + esc(r.error || "") + '">Erro</span>'}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div style="margin-top:.8rem;display:flex;gap:.8rem;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="this.parentElement.parentElement.classList.add('hidden')">Fechar</button>
      </div>
    `;

    resultDiv.innerHTML = html;

    // Save SKUs back to contract items + propagate to Banco de Produtos
    let changed = false;
    data.results.forEach(r => {
      if (r.sku && (r.status === "ok" || r.status === "existente")) {
        const item = c.itens.find(it => it.num === r.num);
        if (item && item.sku !== r.sku) {
          item.sku = r.sku;
          if (r.unidade) item.unidade = r.unidade;
          changed = true;
          // Propagate Tiny SKU to Banco de Produtos (Tiny is source of truth)
          adicionarAoBancoProdutos(item);
        }
      }
    });
    if (changed) {
      saveContratos();
    }

    showToast(`Tiny: ${s.cadastrados} cadastrados, ${s.existentes} existentes, ${s.erros} erros`);
  } catch (err) {
    resultDiv.innerHTML = `<div style="color:var(--red)">Erro de conexao: ${esc(err.message)}</div>
      <p style="color:var(--mut);font-size:.8rem;margin-top:.5rem">Verifique se o TINY_API_TOKEN esta configurado nas variaveis do Netlify.</p>
      <button class="btn btn-outline btn-sm" style="margin-top:.5rem" onclick="this.parentElement.classList.add('hidden')">Fechar</button>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar para Tiny"; }
  }
}

// ===== INIT =====
(async function initGDP() {
  // Supabase-First: carregar dados das tabelas reais ANTES do localStorage
  if (window.gdpApi) {
    try {
      const ready = await gdpApi.isReady();
      if (ready) {
        console.log("[GDP] Supabase-First: carregando das tabelas reais...");
        const _tableMap = {
          'gdp.contratos.v1': 'contratos',
          'gdp.pedidos.v1': 'pedidos',
          'gdp.notas-fiscais.v1': 'notas_fiscais',
          'gdp.contas-receber.v1': 'contas_receber',
          'gdp.contas-pagar.v1': 'contas_pagar',
          'gdp.entregas.provas.v1': 'entregas'
        };
        const _wrapKeys = new Set(['gdp.contratos.v1','gdp.pedidos.v1','gdp.notas-fiscais.v1','gdp.contas-receber.v1','gdp.contas-pagar.v1']);
        for (const [lsKey, table] of Object.entries(_tableMap)) {
          try {
            const rows = await gdpApi[table].list();
            if (rows && rows.length > 0) {
              const data = _wrapKeys.has(lsKey) ? { _v: 1, updatedAt: new Date().toISOString(), items: rows } : rows;
              localStorage.setItem(lsKey, JSON.stringify(data));
              console.log("[GDP] " + table + ": " + rows.length + " registros do Supabase");
            }
          } catch(e) { console.warn("[GDP] Falha ao carregar " + table + ":", e); }
        }
        // Clientes (usuarios)
        try {
          const clientes = await gdpApi.clientes.list();
          if (clientes && clientes.length > 0) {
            localStorage.setItem('gdp.usuarios.v1', JSON.stringify(clientes));
            console.log("[GDP] clientes: " + clientes.length + " registros do Supabase");
          }
        } catch(e) {}
      } else {
        console.log("[GDP] Tabelas Supabase não encontradas, usando localStorage");
      }
    } catch(e) {
      console.warn("[GDP] Supabase-First falhou, fallback localStorage:", e);
    }
  }

  // Render com dados (agora do Supabase via localStorage cache)
  loadData();
  loadUsuarios();
  renderAll();
  setGdpSyncState({ status: "syncing", source: "cloud", detail: "Sincronizando com cloud...", userId: getSyncUserId() });

  // Cloud sync em background — atualiza se houver dados mais recentes
  try {
    const restored = await syncFromCloud();
    if (restored?.restored) {
      // Cloud trouxe dados novos — recarregar e re-renderizar
      loadData();
      loadUsuarios();
      renderAll();
      setGdpSyncState({
        status: "cloud",
        source: restored.source || "cloud",
        detail: `Cloud atualizado com dados do GDP`,
        lastSyncAt: restored.lastSyncAt || new Date().toISOString(),
        userId: getSyncUserId()
      });
      console.log("[GDP] Dados compartilhados atualizados do cloud.");
    } else {
      setGdpSyncState({
        status: "local",
        source: "local_cache",
        detail: "Sem snapshot remoto encontrado; usando cache local",
        userId: getSyncUserId()
      });
    }
  } catch (e) {
    console.warn("[GDP] Restauracao do cloud falhou:", e);
    setGdpSyncState({
      status: "offline",
      source: "local_cache",
      detail: `Falha no cloud: ${e.message}`,
      userId: getSyncUserId()
    });
  }

  // Push local → cloud (backup)
  try { await syncToCloud(); } catch(_) {}

  // Auto-refresh when portal escola or banco de produtos updates localStorage (cross-tab sync)
  window.addEventListener('storage', (e) => {
    if (GDP_SHARED_SYNC_KEYS.has(e.key) || e.key === USUARIOS_KEY) {
      loadData();
      loadUsuarios();
      renderAll();
      setGdpSyncState({
        status: "cloud",
        source: "cross_tab",
        detail: `Atualizacao detectada em ${e.key}`,
        lastSyncAt: new Date().toISOString(),
        userId: getSyncUserId()
      });
    }
    if (e.key === PRODUTOS_KEY) {
      loadBancoProdutos();
      renderBancoProdutos();
    }
  });
})();

// [gdp-pedidos.js loaded above — Lista de Compras, Status Tabs, Selection, Menu]

/* [gdp-banco-produtos.js extracted] */

// === NCM Database (alimentos escolares) ===
const NCM_DB = [
  {cod:"0207.14.00",desc:"Pedacos e miudezas de galos/galinhas, congelados"},
  {cod:"0210.12.00",desc:"Barrigas e peitos suinos, salgados ou defumados"},
  {cod:"0302.71.00",desc:"Tilapias frescas ou refrigeradas"},
  {cod:"0304.61.00",desc:"Files de tilapia congelados"},
  {cod:"0401.10.10",desc:"Leite UHT integral"},
  {cod:"0401.20.10",desc:"Leite UHT semidesnatado"},
  {cod:"0402.21.10",desc:"Leite em po integral"},
  {cod:"0405.10.00",desc:"Manteiga"},
  {cod:"0406.10.10",desc:"Queijo minas frescal"},
  {cod:"0406.10.90",desc:"Queijo meia cura e outros frescos"},
  {cod:"0406.20.00",desc:"Queijo ralado ou em po"},
  {cod:"0406.90.10",desc:"Queijo mussarela"},
  {cod:"0407.21.00",desc:"Ovos de galinha, frescos"},
  {cod:"0409.00.00",desc:"Mel natural"},
  {cod:"0701.90.00",desc:"Batatas frescas ou refrigeradas"},
  {cod:"0702.00.00",desc:"Tomates frescos ou refrigerados"},
  {cod:"0703.10.19",desc:"Cebolas frescas"},
  {cod:"0703.20.10",desc:"Alho fresco"},
  {cod:"0704.10.00",desc:"Couve-flor e brocolis"},
  {cod:"0704.90.00",desc:"Couve, repolho e outros"},
  {cod:"0706.10.00",desc:"Cenouras e nabos"},
  {cod:"0706.90.00",desc:"Beterraba, rabanete e outros"},
  {cod:"0707.00.00",desc:"Pepinos e cornichoes"},
  {cod:"0708.20.00",desc:"Feijao verde (vagem)"},
  {cod:"0709.30.00",desc:"Berinjelas"},
  {cod:"0709.51.00",desc:"Cogumelos frescos"},
  {cod:"0709.60.00",desc:"Pimentoes e pimentas"},
  {cod:"0709.93.00",desc:"Aboboras e abobrinhas"},
  {cod:"0709.99.90",desc:"Outros legumes (chuchu, inhame, quiabo)"},
  {cod:"0713.33.19",desc:"Feijao comum (carioca, preto)"},
  {cod:"0713.33.29",desc:"Feijao branco"},
  {cod:"0714.10.00",desc:"Mandioca fresca ou congelada"},
  {cod:"0803.10.00",desc:"Bananas frescas"},
  {cod:"0804.30.00",desc:"Abacaxi fresco"},
  {cod:"0805.10.00",desc:"Laranjas frescas"},
  {cod:"0805.50.00",desc:"Limoes frescos"},
  {cod:"0807.11.00",desc:"Melancias frescas"},
  {cod:"0808.10.00",desc:"Macas frescas"},
  {cod:"0808.30.00",desc:"Mamao fresco"},
  {cod:"0901.21.00",desc:"Cafe torrado nao descafeinado"},
  {cod:"0910.11.00",desc:"Gengibre"},
  {cod:"0910.30.00",desc:"Acafrao (curcuma)"},
  {cod:"1001.99.00",desc:"Trigo"},
  {cod:"1005.90.10",desc:"Milho em grao"},
  {cod:"1006.30.21",desc:"Arroz polido parboilizado"},
  {cod:"1006.30.29",desc:"Arroz polido nao parboilizado"},
  {cod:"1101.00.10",desc:"Farinha de trigo"},
  {cod:"1102.20.00",desc:"Farinha de milho"},
  {cod:"1106.20.00",desc:"Farinha de mandioca"},
  {cod:"1108.12.00",desc:"Amido de milho"},
  {cod:"1108.14.00",desc:"Fecula de mandioca (polvilho)"},
  {cod:"1207.40.90",desc:"Gergelim"},
  {cod:"1507.90.11",desc:"Oleo de soja refinado"},
  {cod:"1509.10.00",desc:"Azeite de oliva virgem"},
  {cod:"1517.10.00",desc:"Margarina"},
  {cod:"1701.14.00",desc:"Acucar cristal"},
  {cod:"1701.99.00",desc:"Acucar refinado"},
  {cod:"1803.10.00",desc:"Pasta de cacau"},
  {cod:"1805.00.00",desc:"Cacau em po sem acucar"},
  {cod:"1806.31.10",desc:"Chocolate recheado"},
  {cod:"1806.90.00",desc:"Achocolatado e preparacoes de cacau"},
  {cod:"1901.10.10",desc:"Farinha lactea"},
  {cod:"1901.90.90",desc:"Misturas para bolos e paes"},
  {cod:"1902.11.00",desc:"Massas nao cozidas (espaguete, penne, etc)"},
  {cod:"1902.19.00",desc:"Outras massas nao cozidas"},
  {cod:"1904.10.00",desc:"Cereais expandidos (flocos milho)"},
  {cod:"1904.20.00",desc:"Cereais em flocos (aveia, granola)"},
  {cod:"1905.31.00",desc:"Biscoitos doces"},
  {cod:"1905.32.00",desc:"Waffles"},
  {cod:"1905.40.00",desc:"Torradas e biscoitos de agua e sal"},
  {cod:"1905.90.90",desc:"Pao frances e outros paes"},
  {cod:"2001.90.00",desc:"Legumes preparados em vinagre"},
  {cod:"2002.10.00",desc:"Tomate pelado inteiro"},
  {cod:"2002.90.00",desc:"Extrato e polpa de tomate"},
  {cod:"2008.19.00",desc:"Amendoim preparado"},
  {cod:"2008.99.00",desc:"Polpa de frutas congelada"},
  {cod:"2009.11.00",desc:"Suco de laranja congelado"},
  {cod:"2009.89.00",desc:"Suco de outras frutas"},
  {cod:"2103.10.10",desc:"Molho de soja (shoyu)"},
  {cod:"2103.20.10",desc:"Ketchup e molho de tomate"},
  {cod:"2103.90.21",desc:"Temperos e condimentos"},
  {cod:"2103.90.91",desc:"Vinagre"},
  {cod:"2104.10.11",desc:"Caldo de carne/galinha em cubo"},
  {cod:"2106.90.10",desc:"Fermento em po"},
  {cod:"2501.00.19",desc:"Sal refinado"},
  {cod:"0904.11.00",desc:"Pimenta do reino"},
  {cod:"0906.11.00",desc:"Canela em casca ou po"},
  {cod:"0910.91.00",desc:"Oregano"},
  {cod:"1209.99.90",desc:"Louro em folha"},
  {cod:"0801.11.10",desc:"Coco ralado"}
];

function filtrarNCM(input) {
  const dl = document.getElementById("ncm-datalist");
  if (!dl) return;
  const v = input.value.toLowerCase().trim();
  if (v.length < 2) { dl.innerHTML = ""; return; }
  const matches = NCM_DB.filter(n => n.cod.includes(v) || n.desc.toLowerCase().includes(v)).slice(0, 12);
  dl.innerHTML = matches.map(n => `<option value="${n.cod} — ${n.desc}">`).join("");
}

// === Editar Produto (modal) ===
function abrirEditarProduto(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) return;
  const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === produtoId);
  const ORIGEM_OPTS = [
    {v:"0",l:"0 — Nacional"},{v:"1",l:"1 — Import. Direta"},{v:"2",l:"2 — Import. Merc. Interno"},
    {v:"3",l:"3 — Nac. >40% Import."},{v:"4",l:"4 — Nac. Proc. Basicos"},{v:"5",l:"5 — Nac. <=40% Import."},
    {v:"6",l:"6 — Import. s/ Similar"},{v:"7",l:"7 — Import. MI s/ Similar"}
  ];
  const CAT_OPTS = ["","Hortifruti","Carnes/Proteinas","Graos/Cereais","Laticinios","Frutas","Mercearia","Padaria/Biscoitos","Ovos","Bebidas","Polpas/Frutas","Limpeza","Outros"];
  const UNIT_OPTS = ["UN","DZ","g","KG","ml","LT","GL","CX","PCT","FD","BD","PT","SC","MÇ","RS","RL","FR","TB","GF","LA"];

  let overlay = document.getElementById("edit-prod-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "edit-prod-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:1.5rem;max-width:600px;width:92%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:700">Editar Produto</div>
        <button class="btn btn-outline btn-sm" onclick="fecharEditarProduto()">✕</button>
      </div>
      <div style="font-size:.72rem;color:var(--mut);margin-bottom:1rem">ID: ${esc(produto.id)} | SKU: ${esc(produto.sku || "—")}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Nome</label><input type="text" id="edit-prod-nome" value="${esc(produto.nome)}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Unidade Base</label><select id="edit-prod-unidade" style="width:100%">${UNIT_OPTS.map(u => `<option value="${u}"${produto.unidade_base===u?" selected":""}>${u}</option>`).join("")}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">SKU</label><input type="text" id="edit-prod-sku" value="${esc(produto.sku || "")}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">NCM</label><input type="text" id="edit-prod-ncm" value="${esc(produto.ncm || "")}" list="ncm-datalist" oninput="filtrarNCM(this)" autocomplete="off" style="width:100%"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><select id="edit-prod-categoria" style="width:100%">${CAT_OPTS.map(c => `<option value="${c}"${(produto.categoria||"")===c?" selected":""}>${c || "Sem Categoria"}</option>`).join("")}</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Origem NF-e</label><select id="edit-prod-origem" style="width:100%">${ORIGEM_OPTS.map(o => `<option value="${o.v}"${(produto.origem||"0")===o.v?" selected":""}>${o.l}</option>`).join("")}</select></div>
      </div>
      <div style="border-top:1px solid var(--bdr);margin:1rem 0;padding-top:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <div style="font-size:.85rem;font-weight:700">Embalagens (${embs.length})</div>
          <button class="btn btn-green btn-sm" onclick="adicionarEmbalagemNoProduto('${esc(produto.id)}')">+ Embalagem</button>
        </div>
        <div id="edit-embs-list">
        ${embs.length ? embs.map((emb, idx) => `
          <div style="display:grid;grid-template-columns:1fr .6fr .6fr auto;gap:.5rem;align-items:end;margin-bottom:.5rem" data-emb-id="${esc(emb.id)}">
            <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Descricao</label><input type="text" class="edit-emb-desc" value="${esc(emb.descricao || "")}" style="width:100%"></div>
            <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Qtd Base</label><input type="number" class="edit-emb-qtd" value="${emb.quantidade_base || 1}" min="1" style="width:100%"></div>
            <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Preco Ref.</label><input type="number" class="edit-emb-preco" value="${emb.preco_referencia || 0}" min="0" step="0.01" style="width:100%"></div>
            <div><button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="removerEmbalagemDoEdit('${esc(emb.id)}')">X</button></div>
          </div>
        `).join("") : '<div style="font-size:.82rem;color:var(--mut);padding:.5rem 0">Nenhuma embalagem cadastrada.</div>'}
        </div>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-outline" onclick="fecharEditarProduto()">Cancelar</button>
        <button class="btn btn-green" onclick="salvarEditarProduto('${esc(produto.id)}')">Salvar</button>
      </div>
    </div>
  `;
}

function fecharEditarProduto() {
  const overlay = document.getElementById("edit-prod-overlay");
  if (overlay) overlay.classList.add("hidden");
}

function salvarEditarProduto(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) return;
  const ncmRaw = (document.getElementById("edit-prod-ncm")?.value || "").trim();
  produto.nome = (document.getElementById("edit-prod-nome")?.value || "").trim() || produto.nome;
  produto.unidade_base = document.getElementById("edit-prod-unidade")?.value || produto.unidade_base;
  produto.sku = (document.getElementById("edit-prod-sku")?.value || "").trim();
  produto.ncm = ncmRaw.includes(" — ") ? ncmRaw.split(" — ")[0].trim() : ncmRaw;
  produto.categoria = document.getElementById("edit-prod-categoria")?.value || "";
  produto.origem = document.getElementById("edit-prod-origem")?.value || "0";
  saveEstoqueIntelProdutos();

  document.querySelectorAll("#edit-embs-list [data-emb-id]").forEach(row => {
    const embId = row.getAttribute("data-emb-id");
    const emb = estoqueIntelEmbalagens.find(e => e.id === embId);
    if (!emb) return;
    emb.descricao = (row.querySelector(".edit-emb-desc")?.value || "").trim() || emb.descricao;
    emb.quantidade_base = Number(row.querySelector(".edit-emb-qtd")?.value) || 1;
    emb.preco_referencia = Number(row.querySelector(".edit-emb-preco")?.value) || 0;
  });
  saveEstoqueIntelEmbalagens();
  fecharEditarProduto();
  renderEstoque();
  showToast("Produto atualizado.", 2500);
}

// === Modal Demanda Manual (overlay) ===
function toggleFormDemandaManual() {
  let overlay = document.getElementById("demanda-manual-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    overlay.classList.add("hidden");
    return;
  }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "demanda-manual-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");

  const prodOpts = estoqueIntelProdutos.map(p => `<option value="${esc(p.id)}">${esc(p.nome)} (${esc(p.unidade_base)})</option>`).join("");

  overlay.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:1.5rem;max-width:500px;width:92%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:700">Nova Demanda Manual</div>
        <button class="btn btn-outline btn-sm" onclick="toggleFormDemandaManual()">✕</button>
      </div>
      <div style="display:grid;gap:.75rem;margin-bottom:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Produto</label><select id="ei-pedido-produto" style="width:100%"><option value="">Selecione</option>${prodOpts}</select></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Quantidade Necessaria</label><input type="number" id="ei-pedido-quantidade" min="1" step="1" placeholder="1700" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><input type="text" id="ei-pedido-status" value="emitido" style="width:100%"></div>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-outline" onclick="toggleFormDemandaManual()">Cancelar</button>
        <button class="btn btn-green" onclick="registrarPedidoEstoqueIntel();toggleFormDemandaManual()">Salvar Demanda</button>
      </div>
    </div>
  `;
}

// === Adicionar/Remover embalagem no modal de edição ===
function adicionarEmbalagemNoProduto(produtoId) {
  const produto = findEstoqueIntelProduto(produtoId);
  if (!produto) return;
  const newId = genId("EMB");
  estoqueIntelEmbalagens.push({ id: newId, produto_id: produtoId, descricao: "", codigo_barras: produto.sku || "", quantidade_base: 1, preco_referencia: 0 });
  saveEstoqueIntelEmbalagens();
  abrirEditarProduto(produtoId);
  showToast("Embalagem adicionada. Preencha os campos.", 2500);
}

function removerEmbalagemDoEdit(embId) {
  if (!confirm("Remover esta embalagem?")) return;
  const emb = estoqueIntelEmbalagens.find(e => e.id === embId);
  if (!emb) return;
  const produtoId = emb.produto_id;
  estoqueIntelEmbalagens = estoqueIntelEmbalagens.filter(e => e.id !== embId);
  saveEstoqueIntelEmbalagens();
  abrirEditarProduto(produtoId);
  showToast("Embalagem removida.", 2500);
}

// === Modal Novo Produto (overlay) ===
let _novoProdutoEmbs = [{ id: "temp-0", descricao: "", quantidade_base: 1, preco_referencia: 0 }];

function toggleFormNovoProduto() {
  let overlay = document.getElementById("novo-prod-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    overlay.classList.add("hidden");
    return;
  }
  _novoProdutoEmbs = [{ id: "temp-0", descricao: "", quantidade_base: 1, preco_referencia: 0 }];
  renderModalNovoProduto();
}

function renderModalNovoProduto() {
  let overlay = document.getElementById("novo-prod-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "novo-prod-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1100";
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");

  const UNIT_OPTS = '<optgroup label="Contagem"><option value="UN" selected>UN — Unidade</option><option value="DZ">DZ — Duzia</option></optgroup><optgroup label="Peso"><option value="g">g — Grama</option><option value="KG">KG — Quilograma</option></optgroup><optgroup label="Volume"><option value="ml">ml — Mililitro</option><option value="LT">LT — Litro</option><option value="GL">GL — Galao</option></optgroup><optgroup label="Embalagem"><option value="CX">CX — Caixa</option><option value="PCT">PCT — Pacote</option><option value="FD">FD — Fardo</option><option value="BD">BD — Bandeja</option><option value="PT">PT — Pote</option><option value="SC">SC — Sache/Saco</option></optgroup><optgroup label="Outros"><option value="MÇ">MÇ — Maco</option><option value="RS">RS — Resma</option><option value="RL">RL — Rolo</option><option value="FR">FR — Frasco</option><option value="TB">TB — Tubo</option><option value="GF">GF — Garrafa</option><option value="LA">LA — Lata</option></optgroup>';
  const CAT_OPTS = ["","Hortifruti","Carnes/Proteinas","Graos/Cereais","Laticinios","Frutas","Mercearia","Padaria/Biscoitos","Ovos","Bebidas","Limpeza","Outros"].map(c => `<option value="${c}">${c || "Sem Categoria"}</option>`).join("");
  const ORI_OPTS = [{v:"0",l:"0 — Nacional"},{v:"1",l:"1 — Import. Direta"},{v:"2",l:"2 — Import. Merc. Interno"},{v:"3",l:"3 — Nac. >40% Import."},{v:"4",l:"4 — Nac. Proc. Basicos"},{v:"5",l:"5 — Nac. <=40% Import."},{v:"6",l:"6 — Import. s/ Similar"},{v:"7",l:"7 — Import. MI s/ Similar"}].map(o => `<option value="${o.v}">${o.l}</option>`).join("");

  let embsHtml = _novoProdutoEmbs.map((emb, i) => `
    <div style="display:grid;grid-template-columns:1fr .6fr .6fr auto;gap:.5rem;align-items:end;margin-bottom:.5rem" data-novo-emb="${i}">
      <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Descricao</label><input type="text" class="novo-emb-desc" value="${esc(emb.descricao)}" placeholder="Ex: Pacote 5kg" style="width:100%"></div>
      <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Qtd Base</label><input type="number" class="novo-emb-qtd" value="${emb.quantidade_base}" min="1" style="width:100%"></div>
      <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.2rem">Preco Ref.</label><input type="number" class="novo-emb-preco" value="${emb.preco_referencia}" min="0" step="0.01" style="width:100%"></div>
      <div><button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="removerEmbNovoProduto(${i})">X</button></div>
    </div>
  `).join("");

  overlay.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:1.5rem;max-width:620px;width:92%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:700">Novo Produto</div>
        <button class="btn btn-outline btn-sm" onclick="toggleFormNovoProduto()">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Nome do Produto</label><input type="text" id="ei-produto-nome" placeholder="Ex: Arroz" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Unidade Base</label><select id="ei-produto-unidade" style="width:100%">${UNIT_OPTS}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">SKU / Cod. Barras</label><input type="text" id="ei-produto-sku" placeholder="Auto se vazio" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">NCM</label><input type="text" id="ei-produto-ncm" placeholder="Digite nome ou codigo..." list="ncm-datalist" oninput="filtrarNCM(this)" autocomplete="off" style="width:100%"><datalist id="ncm-datalist"></datalist></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Categoria</label><div style="display:flex;gap:.35rem"><select id="ei-produto-categoria" style="flex:1">${CAT_OPTS}</select><button class="btn btn-outline btn-sm" onclick="adicionarCategoriaCustom()" title="Nova" style="padding:.35rem .5rem">+</button></div></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.25rem">Origem NF-e</label><select id="ei-produto-origem" style="width:100%">${ORI_OPTS}</select></div>
      </div>
      <div style="border-top:1px solid var(--bdr);margin:1rem 0;padding-top:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <div style="font-size:.85rem;font-weight:700">Embalagens (${_novoProdutoEmbs.length})</div>
          <button class="btn btn-green btn-sm" onclick="adicionarEmbNovoProduto()">+ Embalagem</button>
        </div>
        <div id="novo-embs-list">${embsHtml || '<div style="font-size:.82rem;color:var(--mut);padding:.5rem 0">Nenhuma embalagem.</div>'}</div>
      </div>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-outline" onclick="toggleFormNovoProduto()">Cancelar</button>
        <button class="btn btn-green" onclick="salvarNovoProdutoModal()">Salvar Produto</button>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById("ei-produto-nome")?.focus(), 50);
}

function adicionarEmbNovoProduto() {
  // Salvar valores atuais antes de re-render
  document.querySelectorAll("#novo-embs-list [data-novo-emb]").forEach((row, i) => {
    if (_novoProdutoEmbs[i]) {
      _novoProdutoEmbs[i].descricao = row.querySelector(".novo-emb-desc")?.value || "";
      _novoProdutoEmbs[i].quantidade_base = Number(row.querySelector(".novo-emb-qtd")?.value) || 1;
      _novoProdutoEmbs[i].preco_referencia = Number(row.querySelector(".novo-emb-preco")?.value) || 0;
    }
  });
  _novoProdutoEmbs.push({ id: "temp-" + _novoProdutoEmbs.length, descricao: "", quantidade_base: 1, preco_referencia: 0 });
  // Salvar campos do produto antes de re-render
  const prodData = _capturarCamposNovoProduto();
  renderModalNovoProduto();
  _restaurarCamposNovoProduto(prodData);
}

function removerEmbNovoProduto(idx) {
  if (_novoProdutoEmbs.length <= 1) { showToast("Minimo 1 embalagem.", 2000); return; }
  // Salvar valores
  document.querySelectorAll("#novo-embs-list [data-novo-emb]").forEach((row, i) => {
    if (_novoProdutoEmbs[i]) {
      _novoProdutoEmbs[i].descricao = row.querySelector(".novo-emb-desc")?.value || "";
      _novoProdutoEmbs[i].quantidade_base = Number(row.querySelector(".novo-emb-qtd")?.value) || 1;
      _novoProdutoEmbs[i].preco_referencia = Number(row.querySelector(".novo-emb-preco")?.value) || 0;
    }
  });
  _novoProdutoEmbs.splice(idx, 1);
  const prodData = _capturarCamposNovoProduto();
  renderModalNovoProduto();
  _restaurarCamposNovoProduto(prodData);
}

function _capturarCamposNovoProduto() {
  return {
    nome: document.getElementById("ei-produto-nome")?.value || "",
    unidade: document.getElementById("ei-produto-unidade")?.value || "UN",
    sku: document.getElementById("ei-produto-sku")?.value || "",
    ncm: document.getElementById("ei-produto-ncm")?.value || "",
    categoria: document.getElementById("ei-produto-categoria")?.value || "",
    origem: document.getElementById("ei-produto-origem")?.value || "0"
  };
}

function _restaurarCamposNovoProduto(d) {
  const el = (id) => document.getElementById(id);
  if (el("ei-produto-nome")) el("ei-produto-nome").value = d.nome;
  if (el("ei-produto-unidade")) el("ei-produto-unidade").value = d.unidade;
  if (el("ei-produto-sku")) el("ei-produto-sku").value = d.sku;
  if (el("ei-produto-ncm")) el("ei-produto-ncm").value = d.ncm;
  if (el("ei-produto-categoria")) el("ei-produto-categoria").value = d.categoria;
  if (el("ei-produto-origem")) el("ei-produto-origem").value = d.origem;
}

function salvarNovoProdutoModal() {
  const nome = (document.getElementById("ei-produto-nome")?.value || "").trim();
  if (!nome) { showToast("Informe o nome do produto.", 3000); return; }
  const unidade_base = document.getElementById("ei-produto-unidade")?.value || "UN";
  const skuManual = (document.getElementById("ei-produto-sku")?.value || "").trim();
  const sku = skuManual || gerarProximoSKU();
  const ncmRaw = (document.getElementById("ei-produto-ncm")?.value || "").trim();
  const ncm = ncmRaw.includes(" — ") ? ncmRaw.split(" — ")[0].trim() : ncmRaw;
  const categoria = document.getElementById("ei-produto-categoria")?.value || "";
  const origem = document.getElementById("ei-produto-origem")?.value || "0";

  const prodId = genId("PROD");
  estoqueIntelProdutos.push({ id: prodId, nome, unidade_base, sku, ncm, categoria, origem });
  saveEstoqueIntelProdutos();

  // Salvar embalagens do modal
  document.querySelectorAll("#novo-embs-list [data-novo-emb]").forEach((row, i) => {
    const desc = (row.querySelector(".novo-emb-desc")?.value || "").trim();
    const qtd = Number(row.querySelector(".novo-emb-qtd")?.value) || 1;
    const preco = Number(row.querySelector(".novo-emb-preco")?.value) || 0;
    if (desc || preco) {
      estoqueIntelEmbalagens.push({ id: genId("EMB"), produto_id: prodId, descricao: desc || nome, codigo_barras: sku, quantidade_base: qtd, preco_referencia: preco });
    }
  });
  saveEstoqueIntelEmbalagens();

  toggleFormNovoProduto();
  renderEstoque();
  showToast("Produto cadastrado com " + document.querySelectorAll("#novo-embs-list [data-novo-emb]").length + " embalagem(ns).", 3000);
}

// === Categoria Custom ===
function adicionarCategoriaCustom() {
  const nome = prompt("Nome da nova categoria:");
  if (!nome || !nome.trim()) return;
  const sel = document.getElementById("ei-produto-categoria");
  if (!sel) return;
  const exists = Array.from(sel.options).some(o => o.value.toLowerCase() === nome.trim().toLowerCase());
  if (exists) { showToast("Categoria ja existe.", 2500); return; }
  const opt = document.createElement("option");
  opt.value = nome.trim();
  opt.textContent = nome.trim();
  sel.insertBefore(opt, sel.lastElementChild);
  sel.value = nome.trim();
  showToast("Categoria adicionada: " + nome.trim(), 2500);
}

// === Download Modelo Excel ===
function downloadModeloProdutos() {
  if (typeof XLSX === "undefined") { showToast("XLSX nao carregou.", 3000); return; }
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["Nome", "Unidade Base", "SKU", "NCM", "Categoria", "Origem (0-7)", "Embalagem", "Qtd Embalagem", "Preco Referencia"],
    ["Arroz Tipo 1", "KG", "789001", "1006.30.00", "Graos/Cereais", 0, "Pacote 5kg", 5, 22.50],
    ["File de Tilapia", "g", "789003", "0304.61.00", "Carnes/Proteinas", 0, "Pacote 1kg", 1000, 45.90],
    ["Feijao Carioca", "KG", "789002", "0713.33.19", "Graos/Cereais", 0, "Pacote 1kg", 1, 8.90]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{wch:22},{wch:12},{wch:14},{wch:14},{wch:16},{wch:12},{wch:18},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  const refData = [
    ["Codigo", "Descricao"],
    [0, "Nacional"],
    [1, "Estrangeira - Importacao direta"],
    [2, "Estrangeira - Adquirida no mercado interno"],
    [3, "Nacional - Conteudo importacao >40%"],
    [4, "Nacional - Processos produtivos basicos"],
    [5, "Nacional - Conteudo importacao <=40%"],
    [6, "Estrangeira - Importacao direta, sem similar (CAMEX)"],
    [7, "Estrangeira - Mercado interno, sem similar (CAMEX)"]
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refData);
  wsRef["!cols"] = [{wch:8},{wch:55}];
  XLSX.utils.book_append_sheet(wb, wsRef, "Referencia Origem");
  XLSX.writeFile(wb, "modelo-importacao-produtos-gdp.xlsx");
  showToast("Modelo Excel baixado.", 2500);
}

// === Importar Produtos via Excel ===
function importarProdutosExcel() {
  if (typeof XLSX === "undefined") { showToast("XLSX nao carregou.", 3000); return; }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx,.csv";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) { showToast("Planilha vazia.", 3000); return; }
      processarImportacaoProdutos(rows);
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function processarImportacaoProdutos(rows) {
  const header = rows[0];
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== undefined && c !== ""));
  const colMap = {};
  header.forEach((h, i) => {
    const hl = (h || "").toString().toLowerCase().trim();
    if (hl.includes("nome") || hl === "produto") colMap.nome = i;
    else if (hl.includes("unidade") || hl.includes("base")) colMap.unidade = i;
    else if (hl.includes("sku") || hl.includes("barras")) colMap.sku = i;
    else if (hl.includes("ncm")) colMap.ncm = i;
    else if (hl.includes("categ")) colMap.categoria = i;
    else if (hl.includes("orig")) colMap.origem = i;
    else if (hl.includes("embalag") && !hl.includes("qtd") && !hl.includes("prec")) colMap.embDescricao = i;
    else if (hl.includes("qtd")) colMap.embQtd = i;
    else if (hl.includes("prec") || hl.includes("valor")) colMap.embPreco = i;
  });
  const validOrigens = ["0","1","2","3","4","5","6","7"];
  const parsed = dataRows.map(r => {
    const nome = (r[colMap.nome] || "").toString().trim();
    const unidade = (r[colMap.unidade] || "UN").toString().trim().toUpperCase() || "UN";
    const sku = (r[colMap.sku] || "").toString().trim();
    const ncm = (r[colMap.ncm] || "").toString().trim();
    const categoria = (r[colMap.categoria] || "").toString().trim();
    const origem = (r[colMap.origem] !== undefined ? r[colMap.origem] : "0").toString().trim();
    const embDescricao = (r[colMap.embDescricao] || "").toString().trim();
    const embQtd = Number(r[colMap.embQtd] || 1) || 1;
    const embPreco = Number((r[colMap.embPreco] || "0").toString().replace(",", ".")) || 0;
    const errors = [];
    if (!nome) errors.push("Nome obrigatorio");
    if (!validOrigens.includes(origem)) errors.push("Origem invalida");
    return { nome, unidade, sku, ncm, categoria, origem, embDescricao, embQtd, embPreco, errors };
  });
  const errorCount = parsed.filter(p => p.errors.length > 0).length;
  const validCount = parsed.length - errorCount;
  let msg = `Importacao: ${parsed.length} linha(s) lida(s), ${validCount} valida(s)`;
  if (errorCount > 0) msg += `, ${errorCount} com erro(s) ignorada(s)`;
  if (validCount === 0) { showToast("Nenhum produto valido encontrado.", 3500); return; }
  if (!confirm(msg + ". Confirmar importacao?")) return;
  let importados = 0;
  parsed.filter(p => p.errors.length === 0).forEach(p => {
    const prodId = genId("PROD");
    const autoSku = p.sku || gerarProximoSKU();
    estoqueIntelProdutos.push({ id: prodId, nome: p.nome, unidade_base: p.unidade, sku: autoSku, ncm: p.ncm, categoria: p.categoria, origem: p.origem });
    if (p.embDescricao || p.embPreco) {
      estoqueIntelEmbalagens.push({ id: genId("EMB"), produto_id: prodId, descricao: p.embDescricao || p.nome, codigo_barras: autoSku, quantidade_base: p.embQtd, preco_referencia: p.embPreco });
    }
    importados++;
  });
  saveEstoqueIntelProdutos();
  saveEstoqueIntelEmbalagens();
  renderEstoque();
  showToast(`${importados} produto(s) importado(s) com sucesso!`, 4000);
}