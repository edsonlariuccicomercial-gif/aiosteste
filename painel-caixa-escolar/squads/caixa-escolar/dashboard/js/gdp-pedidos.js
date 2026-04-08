// gdp-pedidos.js — Extracted from gdp-contratos.html
// Pedidos, Notas Fiscais, Contas Pagar/Receber, Caixa, Relatorios, Lista de Compras

// ===== RENDER PEDIDOS =====
function renderPedidos() {
  // Populate contract filter
  const selContrato = document.getElementById("filtro-contrato-pedido");
  const prevContrato = selContrato.value;
  while (selContrato.options.length > 1) selContrato.remove(1);
  // Get unique contratoIds from pedidos
  const ctrIds = [...new Set(pedidos.map(p => p.contratoId).filter(Boolean))];
  ctrIds.forEach(cid => {
    const c = contratos.find(x => x.id === cid);
    const label = c ? `${c.id} — ${c.escola.length > 30 ? c.escola.slice(0, 28) + "..." : c.escola}${c.processo ? ' (Proc. ' + c.processo + ')' : ''}` : cid;
    selContrato.appendChild(new Option(label, cid));
  });
  if (prevContrato) selContrato.value = prevContrato;

  const busca = (document.getElementById("busca-pedido")?.value || "").toLowerCase();
  const filtroData = document.getElementById("filtro-data-pedido")?.value || "";
  const filtroContrato = selContrato.value;

  let filtered = pedidos;
  if (busca) filtered = filtered.filter(p => {
    const pedidoFiscal = ensurePedidoFiscalData({ ...p, cliente: { ...(p.cliente || {}) }, itens: Array.isArray(p.itens) ? p.itens : [] });
    return (p.escola || "").toLowerCase().includes(busca)
      || (pedidoFiscal.cliente?.nome || "").toLowerCase().includes(busca)
      || String(pedidoFiscal.cliente?.cnpj || "").toLowerCase().includes(busca)
      || (p.contratoId || "").toLowerCase().includes(busca);
  });
  if (filtroData) filtered = filtered.filter(p => (p.data || "").includes(filtroData));
  if (filtroContrato) filtered = filtered.filter(p => p.contratoId === filtroContrato);
  renderPedidosStatusTabs(filtered);
  filtered = filtered.filter(p => normalizePedidoStatus(p.status) === pedidoStatusTabAtual);

  const tbody = document.getElementById("pedidos-tbody");
  const empty = document.getElementById("pedidos-empty");

  // Update tab count to reflect filtered results
  document.getElementById("tab-count-pedidos").textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filtered.map(p => {
    const statusMeta = getPedidoStatusMeta(p.status);
    const integracoes = getPedidoIntegracoesResumo(p);
    const pedidoFiscal = ensurePedidoFiscalData({ ...p, cliente: { ...(p.cliente || {}) }, itens: Array.isArray(p.itens) ? p.itens : [] });
    const clienteNome = pedidoFiscal.cliente?.nome || p.escola || "-";
    const clienteCnpj = pedidoFiscal.cliente?.cnpj || "-";
    return `<tr>
      <td class="text-center"><input type="checkbox" class="pedido-check" value="${p.id}" onchange="atualizarSelecaoPedidos()"${_selectedPedidoIds.has(p.id) ? ' checked' : ''}></td>
      <td class="text-center"><button class="btn btn-outline btn-sm" onclick="abrirMenuPedido('${p.id}')" title="Abrir menu do pedido" style="min-width:auto;padding:.2rem .5rem;font-weight:700">...</button></td>
      <td><button onclick="verPedidoDetalhe('${p.id}')" style="background:none;border:none;padding:0;color:var(--blue);font-weight:700;cursor:pointer;font-family:monospace">${esc(p.id)}</button></td>
      <td>${esc(clienteNome.length > 30 ? clienteNome.slice(0, 28) + "..." : clienteNome)}</td>
      <td class="font-mono">${esc(clienteCnpj)}</td>
      <td class="nowrap">${fmtDate(p.dataEntrega || p.data)}</td>
      <td class="nowrap">${fmtDate(p.dataPrevista || p.dataEntrega)}</td>
      <td class="text-right font-mono" style="color:var(--green);font-weight:700">${brl.format(p.valor)}</td>
      <td><span class="badge ${statusMeta.className}">${statusMeta.label}</span></td>
      <td>${integracoes.html}</td>
    </tr>`;
  }).join("");
}

async function transmitirPedido(pedidoId) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  if (!confirm(`Liberar pedido ${pedidoId}?\nData entrega: ${p.dataEntrega || p.data}\nValor: R$ ${p.valor.toFixed(2).replace('.',',')}\n\nIsso mudará o status para "recebido" e manterá o fluxo interno de faturamento no GDP.`)) return;

  // Deduzir saldo do contrato
  const c = contratos.find(x => x.id === p.contratoId);
  if (c) {
    p.itens.forEach(pi => {
      const normDesc = (pi.descricao || '').toUpperCase().trim();
      const item = c.itens.find(ci => ci.num === pi.itemNum || (ci.descricao || '').toUpperCase().trim() === normDesc);
      if (item) {
        const saldo = item.qtdContratada - item.qtdEntregue;
        item.qtdEntregue += Math.min(pi.qtd, saldo);
      }
    });
    saveContratos();
  }

  p.status = 'recebido';
  p.saldoDeduzido = true;
  if (!p.obs) p.obs = getObsContrato(p.contratoId);
  savePedidos();
  renderAll();
  showToast(`Pedido ${pedidoId} liberado para faturamento interno no GDP.`);
}

function avancarPedido(pedidoId, novoStatus) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;

  // Se o pedido ainda nao teve saldo deduzido (pedidos antigos), deduzir agora
  if (novoStatus === "faturado" && !p.saldoDeduzido) {
    const c = contratos.find(x => x.id === p.contratoId);
    if (c) {
      p.itens.forEach(pi => {
        const item = c.itens.find(ci => ci.num === pi.itemNum || ci.descricao === pi.descricao);
        if (item) {
          const saldo = item.qtdContratada - item.qtdEntregue;
          item.qtdEntregue += Math.min(pi.qtd, saldo);
        }
      });
      saveContratos();
    }
  }

  p.status = novoStatus;
  // Auto-preencher obs se ainda nao tem
  if (!p.obs) p.obs = getObsContrato(p.contratoId);

  savePedidos();
  renderAll();
  showToast(`Pedido ${pedidoId} → ${novoStatus}`);
}

var _pendingClone = null;

function clonarPedido(pedidoId) {
  const pedido = pedidos.find((item) => item.id === pedidoId);
  if (!pedido) return;
  const novoId = genId("PED");
  const clone = JSON.parse(JSON.stringify(pedido));
  clone.id = novoId;
  clone.status = "em_aberto";
  clone.data = new Date().toISOString().slice(0, 10);
  clone.dataEntrega = clone.data;
  delete clone.nfeId;
  delete clone.nfeStatus;
  _pendingClone = clone;
  verPedidoDetalhe(novoId, true);
  showToast(`Clone de ${pedido.id}. Revise os dados e clique em Salvar.`, 4000);
}

function salvarClonePedido() {
  if (!_pendingClone) return;
  pedidos.push(_pendingClone);
  savePedidos();
  renderPedidos();
  const id = _pendingClone.id;
  _pendingClone = null;
  fecharModalPedido();
  showToast(`Pedido ${id} salvo com sucesso.`, 3000);
}

function cancelarClonePedido() {
  _pendingClone = null;
  fecharModalPedido();
  showToast('Clone descartado.', 2000);
}

function editarPedido(pedidoId) {
  const pedido = pedidos.find((item) => item.id === pedidoId);
  if (!pedido) return;
  pedidoEditId = pedidoId;
  pedidoCloneDraft = {
    contratoId: pedido.contratoId,
    escola: pedido.escola,
    cliente: pedido.cliente ? { ...pedido.cliente } : null,
    itens: (pedido.itens || []).map((item) => ({ itemNum: Number(item.itemNum), descricao: item.descricao || "", sku: item.sku || "", unidade: item.unidade || "UN", qtd: Number(item.qtd || 0), precoUnitario: Number(item.precoUnitario || 0), ncm: item.ncm || "" })),
    data: pedido.dataEntrega || pedido.data || "",
    dataPrevista: pedido.dataPrevista || pedido.dataEntrega || pedido.data || "",
    status: normalizePedidoStatus(pedido.status),
    pagamento: pedido.pagamento ? { ...pedido.pagamento } : null
  };
  _pedidoManualItens = pedidoCloneDraft.itens.map(i => ({ descricao: i.descricao, sku: i.sku, unidade: i.unidade, qtd: i.qtd, precoUnitario: i.precoUnitario, itemNum: i.itemNum, ncm: i.ncm }));
  novoPedidoManual();
}

function excluirPedido(pedidoId) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  if (!confirm(`Excluir pedido ${pedidoId}?\nEscola: ${p.escola}\nValor: ${brl.format(p.valor)}\n\nEsta ação não pode ser desfeita.`)) return;
  pedidos = pedidos.filter(x => x.id !== pedidoId);
  savePedidos();
  renderAll();
  showToast(`Pedido ${pedidoId} excluído.`);
}

function excluirPedidosSelecionados() {
  const sel = [...document.querySelectorAll('.pedido-check:checked')].map(cb => cb.value);
  if (sel.length === 0) { showToast("Selecione pedidos para excluir.", 3000); return; }
  const demandasVinculadas = estoqueIntelPedidos.filter(d => sel.some(id => d.id === id || d.origem_pedido_id === id));
  const msgDemanda = demandasVinculadas.length ? `\n\n${demandasVinculadas.length} demanda(s) vinculada(s) também serão excluídas.` : "";
  if (!confirm(`Excluir ${sel.length} pedido(s) selecionado(s)?${msgDemanda}\n\nEsta ação não pode ser desfeita.`)) return;
  pedidos = pedidos.filter(p => !sel.includes(p.id));
  if (demandasVinculadas.length) {
    const demandaIds = demandasVinculadas.map(d => d.id);
    estoqueIntelPedidos = estoqueIntelPedidos.filter(d => !demandaIds.includes(d.id));
    estoqueIntelPedidoItens = estoqueIntelPedidoItens.filter(pi => !demandaIds.includes(pi.pedido_id));
    estoqueIntelMovimentacoes = estoqueIntelMovimentacoes.filter(m => !demandaIds.includes(m.referencia_id));
    saveEstoqueIntelPedidos();
    saveEstoqueIntelPedidoItens();
    saveEstoqueIntelMovimentacoes();
  }
  _selectedPedidoIds.clear();
  savePedidos();
  renderAll();
  showToast(`${sel.length} pedido(s) excluído(s)${demandasVinculadas.length ? ` + ${demandasVinculadas.length} demanda(s)` : ""}.`);
}

// ===== BULK ACTIONS PEDIDOS =====
async function gerarNFSelecionados() {
  const sel = [..._selectedPedidoIds];
  if (sel.length === 0) { showToast("Selecione pedidos para gerar notas fiscais.", 3000); return; }
  if (!confirm(`Gerar nota fiscal para ${sel.length} pedido(s) selecionado(s)?`)) return;
  let ok = 0, fail = 0;
  for (const id of sel) {
    try { await gerarNotaFiscalPedido(id); ok++; } catch(e) { fail++; console.error("NF falhou para", id, e); }
  }
  showToast(`Notas fiscais: ${ok} gerada(s)${fail ? ', ' + fail + ' falha(s)' : ''}.`, 4000);
}

function imprimirPedidosSelecionados() {
  const sel = [..._selectedPedidoIds];
  if (sel.length === 0) { showToast("Selecione pedidos para imprimir.", 3000); return; }
  const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const nomeEmpresa = empresa.razaoSocial || empresa.nome || "Empresa";
  const nomeFantasia = empresa.nomeFantasia || empresa.fantasia || "";
  const empresaCnpj = empresa.cnpj || "";
  const empresaEndereco = [empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.uf, empresa.cep ? 'CEP ' + empresa.cep : ''].filter(Boolean).join(', ') || '';
  const empresaTel = empresa.telefone || '';
  const empresaEmail = empresa.email || '';
  let pages = '';
  sel.forEach((id, idx) => {
    const p = pedidos.find(x => x.id === id);
    if (!p) return;
    const c = contratos.find(x => x.id === p.contratoId);
    const processoLabel = c?.processo || p.contratoId || '-';
    const escolaNome = p.escola || p.cliente?.nome || '-';
    const escolaCnpj = p.cliente?.cnpj || '';
    const statusLabel = getPedidoStatusMeta(p.status).label || p.status || 'Pendente';
    const totalItens = (p.itens || []).length;
    const totalUnidades = (p.itens || []).reduce((s, i) => s + (i.qtd || 0), 0);
    const dataFormatada = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    const obsText = p.obs || (c ? [c.processo ? 'Processo: ' + c.processo : '', c.objeto || ''].filter(Boolean).join(' - ') : '');
    const tableRows = (p.itens || []).map((item, i) => {
      const sub = (item.qtd || 0) * (item.precoUnitario || 0);
      return `<tr><td style="text-align:center;border:1px solid #ddd;padding:8px">${i+1}</td><td style="border:1px solid #ddd;padding:8px">${item.descricao || ''}</td><td style="text-align:center;border:1px solid #ddd;padding:8px">${item.unidade || 'UN'}</td><td style="text-align:center;border:1px solid #ddd;padding:8px">${item.qtd || 0}</td><td style="text-align:right;border:1px solid #ddd;padding:8px">${brl.format(item.precoUnitario || 0)}</td><td style="text-align:right;border:1px solid #ddd;padding:8px;font-weight:700">${brl.format(sub)}</td></tr>`;
    }).join("");
    if (idx > 0) pages += '<div style="page-break-before:always"></div>';
    pages += `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem">
        <div><div style="font-size:18px;font-weight:900;letter-spacing:1px">${nomeEmpresa.toUpperCase()}${nomeFantasia ? ' <span style="font-weight:400;font-size:13px">(' + nomeFantasia + ')</span>' : ''}</div><div style="font-size:10px;color:#666;margin-top:4px">${empresaCnpj ? 'CNPJ: ' + empresaCnpj : ''}</div><div style="font-size:10px;color:#666">${empresaEndereco}</div><div style="font-size:10px;color:#666">${[empresaTel ? 'Tel: ' + empresaTel : '', empresaEmail].filter(Boolean).join(' | ')}</div></div>
        <div style="text-align:right"><div style="font-size:10px;color:#666;text-transform:uppercase">Pedido de Fornecimento</div><div style="font-size:18px;font-weight:900;color:#2563eb">${p.id}</div><div style="font-size:12px;color:#666">${dataFormatada}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:1rem;border:1px solid #ddd;font-size:12px">
        <div style="padding:8px;border-bottom:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">ESCOLA / ÓRGÃO</span><br><strong>${escolaNome}</strong></div>
        <div style="padding:8px;border-bottom:1px solid #ddd;border-left:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">CNPJ</span><br><strong>${escolaCnpj || '-'}</strong></div>
        <div style="padding:8px;border-bottom:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">RESPONSÁVEL</span><br><strong>Cliente</strong></div>
        <div style="padding:8px;border-bottom:1px solid #ddd;border-left:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">STATUS</span><br><strong>${statusLabel}</strong></div>
        <div style="padding:8px"><span style="color:#666;font-size:10px;text-transform:uppercase">QTD. ITENS</span><br><strong>${totalItens} produtos (${totalUnidades} unidades)</strong></div>
        <div style="padding:8px;border-left:1px solid #ddd"><span style="color:#666;font-size:10px;text-transform:uppercase">CONTRATO</span><br><strong>${processoLabel}</strong></div>
      </div>
      ${obsText ? `<div style="border:1px solid #ddd;padding:10px;margin-bottom:1rem;font-size:12px"><strong>DADOS DO CONTRATO</strong><br>Processo: <strong>${processoLabel}</strong><br>Observações: ${obsText}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:1rem"><thead><tr style="background:#f5f5f5"><th style="border:1px solid #ddd;padding:8px;text-align:center">#</th><th style="border:1px solid #ddd;padding:8px">PRODUTO / DESCRIÇÃO</th><th style="border:1px solid #ddd;padding:8px;text-align:center">UNID.</th><th style="border:1px solid #ddd;padding:8px;text-align:center">QTD</th><th style="border:1px solid #ddd;padding:8px;text-align:right">PREÇO UNIT.</th><th style="border:1px solid #ddd;padding:8px;text-align:right">SUBTOTAL</th></tr></thead><tbody>${tableRows}</tbody></table>
      <div style="text-align:right;margin-bottom:2rem"><span style="font-size:14px;margin-right:1rem">VALOR TOTAL</span><span style="font-size:24px;font-weight:900;color:#2563eb">${brl.format(p.valor)}</span></div>
      <div style="display:flex;justify-content:space-around;margin-top:3rem;font-size:11px"><div style="text-align:center;width:40%"><div style="border-top:1px solid #333;padding-top:6px"><strong>Recebedor(a)</strong><br>Nome / Cargo / Matrícula</div></div><div style="text-align:center;width:40%"><div style="border-top:1px solid #333;padding-top:6px"><strong>Entregador</strong><br>${nomeEmpresa}</div></div></div>
      <div style="text-align:center;margin-top:3rem;font-size:9px;color:#999">Documento gerado automaticamente pelo sistema GDP — Gestão de Pedidos<br>${nomeEmpresa}${empresaCnpj ? ' — CNPJ ' + empresaCnpj : ''}</div>`;
  });
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><title>Pedido de Fornecimento</title><style>body{font-family:Arial,sans-serif;margin:2cm;color:#333}@media print{body{margin:1.5cm}}</style></head><body>' + pages + '</body></html>');
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 5000);
}

var PEDIDO_STATUS_COLORS = {
  em_aberto: '#eab308',
  agendado: '#3b82f6',
  preparando_envio: '#f97316',
  pronto_para_envio: '#06b6d4',
  faturado: '#22c55e',
  entregue: '#10b981',
  nao_entregue: '#ef4444',
  cancelado: '#94a3b8'
};

function alterarSituacaoSelecionados() {
  const sel = [..._selectedPedidoIds];
  if (sel.length === 0) { showToast("Selecione pedidos para alterar situacao.", 3000); return; }
  const modal = document.getElementById("modal-alterar-situacao-bulk");
  document.getElementById("situacao-bulk-count").textContent = sel.length + " pedido(s)";
  const container = document.getElementById("situacao-bulk-options");
  container.innerHTML = PEDIDO_STATUS_TABS.map(tab => {
    const cor = PEDIDO_STATUS_COLORS[tab.key] || '#94a3b8';
    return '<div style="position:relative;display:inline-block" onmouseenter="this.querySelector(\'.dot-tip\').style.opacity=1;this.querySelector(\'.dot-tip\').style.transform=\'translateX(-50%) translateY(0)\'" onmouseleave="this.querySelector(\'.dot-tip\').style.opacity=0;this.querySelector(\'.dot-tip\').style.transform=\'translateX(-50%) translateY(4px)\'">'
      + '<div class="dot-tip" style="position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%) translateY(4px);background:var(--bg);border:1px solid var(--bdr);border-radius:6px;padding:.25rem .5rem;font-size:.72rem;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s,transform .15s;z-index:10;color:var(--txt)">' + tab.label + '</div>'
      + '<button onclick="aplicarSituacaoBulk(\'' + tab.key + '\')" style="width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.15);background:' + cor + ';cursor:pointer;transition:transform .12s,box-shadow .12s" onmouseenter="this.style.transform=\'scale(1.2)\';this.style.boxShadow=\'0 0 8px ' + cor + '80\'" onmouseleave="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'" title="' + tab.label + '"></button></div>';
  }).join("");
  modal.classList.remove("hidden");
}

function aplicarSituacaoBulk(novoStatus) {
  const sel = [..._selectedPedidoIds];
  let updated = 0;
  for (const id of sel) {
    const p = pedidos.find(x => x.id === id);
    if (p) { p.status = novoStatus; updated++; }
  }
  savePedidos();
  renderPedidos();
  document.getElementById("modal-alterar-situacao-bulk").classList.add("hidden");
  showToast(`${updated} pedido(s) movido(s) para "${getPedidoStatusMeta(novoStatus).label}".`, 3000);
}

function fecharModalSituacaoBulk() {
  document.getElementById("modal-alterar-situacao-bulk").classList.add("hidden");
}

// ===== NOVO PEDIDO MANUAL =====
var _pedidoManualItens = [];
var _pedidoSugestoes = [];

function novoPedidoManual() {
  if (!pedidoEditId) {
    _pedidoManualItens = [];
    if (pedidoCloneDraft?.itens?.length) {
      _pedidoManualItens = pedidoCloneDraft.itens.map(i => ({ descricao: i.descricao || "", sku: i.sku || "", unidade: i.unidade || "UN", qtd: i.qtd || 0, precoUnitario: i.precoUnitario || 0 }));
    }
  }
  const clienteDraft = pedidoCloneDraft?.cliente || {};

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div style="position:relative">
        <label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.3rem">Cliente</label>
        <input type="text" id="pedido-cliente-busca" placeholder="Buscar cliente cadastrado..." value="${esc(clienteDraft.nome || pedidoCloneDraft?.escola || '')}" oninput="buscarClientePedido()" autocomplete="off" style="width:100%">
        <div id="pedido-cliente-sugestoes" class="hidden" style="position:absolute;top:100%;left:0;right:0;z-index:1030;background:var(--bg);border:1px solid var(--bdr);border-radius:8px;max-height:180px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.35)"></div>
        <input type="hidden" id="pedido-cliente-id" value="${esc(clienteDraft.id || '')}">
      </div>
      <div>
        <label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.3rem">Contrato (opcional)</label>
        <select id="pedido-contrato" style="width:100%" onchange="carregarItensContratoPedido()" ${pedidoEditId ? 'disabled' : ''}>
          <option value="">Sem contrato (pedido avulso)</option>
          ${contratos.map(c => `<option value="${c.id}">${c.id} — ${esc(c.escola.length > 35 ? c.escola.slice(0,33) + "..." : c.escola)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div><label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.3rem">Data do Pedido</label><input type="date" id="pedido-data" value="${esc(pedidoCloneDraft?.data || new Date().toISOString().slice(0,10))}" style="width:100%"></div>
      <div><label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.3rem">Data Prevista</label><input type="date" id="pedido-data-prevista" value="${esc(pedidoCloneDraft?.dataPrevista || pedidoCloneDraft?.data || new Date().toISOString().slice(0,10))}" style="width:100%"></div>
      <div><label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.3rem">Status</label><select id="pedido-status" style="width:100%">${PEDIDO_STATUS_TABS.map((tab) => `<option value="${tab.key}" ${String(pedidoCloneDraft?.status || 'em_aberto') === tab.key ? 'selected' : ''}>${tab.label}</option>`).join("")}</select></div>
    </div>
    <div id="pedido-itens-container"></div>
    <div style="margin-top:.8rem"><button class="btn btn-outline btn-sm" onclick="adicionarItemPedidoManual()">+ Adicionar Produto</button></div>
    <div style="margin-top:1rem;padding:1rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)">
      <div style="font-size:.8rem;color:var(--mut);text-transform:uppercase;margin-bottom:.6rem">Dados de Pagamento</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem">
        <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma de Recebimento</label><select id="novo-ped-pag-forma"><option value="boleto" ${(pedidoCloneDraft?.pagamento?.forma||'boleto')==='boleto'?'selected':''}>Boleto</option><option value="pix" ${pedidoCloneDraft?.pagamento?.forma==='pix'?'selected':''}>PIX</option><option value="ted" ${pedidoCloneDraft?.pagamento?.forma==='ted'?'selected':''}>TED</option><option value="dinheiro" ${pedidoCloneDraft?.pagamento?.forma==='dinheiro'?'selected':''}>Dinheiro</option></select></div>
        <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Conta Bancaria</label><select id="novo-ped-pag-conta">${getContasBancariasOptions(pedidoCloneDraft?.pagamento?.contaBancaria?.apelido)}</select></div>
        <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Prazo</label><select id="novo-ped-pag-prazo" onchange="recalcularVencNovoPedido()"><option value="0" ${pedidoCloneDraft?.pagamento?.condicao==='0'?'selected':''}>A vista</option><option value="15" ${pedidoCloneDraft?.pagamento?.condicao==='15'?'selected':''}>15 dias</option><option value="28" ${(!pedidoCloneDraft?.pagamento?.condicao||pedidoCloneDraft?.pagamento?.condicao==='28')?'selected':''}>28 dias</option><option value="30" ${pedidoCloneDraft?.pagamento?.condicao==='30'?'selected':''}>30 dias</option><option value="45" ${pedidoCloneDraft?.pagamento?.condicao==='45'?'selected':''}>45 dias</option><option value="60" ${pedidoCloneDraft?.pagamento?.condicao==='60'?'selected':''}>60 dias</option><option value="90" ${pedidoCloneDraft?.pagamento?.condicao==='90'?'selected':''}>90 dias</option></select></div>
        <div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Vencimento</label><input type="date" id="novo-ped-pag-vencimento" value="${pedidoCloneDraft?.pagamento?.vencimento || calcularVencimentoPagamento(new Date().toISOString().slice(0,10), '28')}"></div>
      </div>
    </div>
    <div style="margin-top:1rem;display:flex;justify-content:flex-end;gap:.8rem">
      <button class="btn btn-outline" onclick="fecharModalPedido()">Cancelar</button>
      <button class="btn btn-green" onclick="salvarPedidoManual()">${pedidoEditId ? 'Salvar Pedido' : 'Registrar Pedido'}</button>
    </div>`;

  document.querySelector("#modal-pedido h2").textContent = pedidoEditId ? 'Editar Pedido' : 'Novo Pedido';
  document.getElementById("modal-pedido-body").innerHTML = html;
  document.getElementById("modal-pedido").classList.remove("hidden");
  if (pedidoCloneDraft?.contratoId) {
    document.getElementById("pedido-contrato").value = pedidoCloneDraft.contratoId;
  }
  renderPedidoItensManual();
}

function buscarClientePedido() {
  const busca = (document.getElementById("pedido-cliente-busca")?.value || "").toLowerCase().trim();
  const container = document.getElementById("pedido-cliente-sugestoes");
  if (!container) return;
  if (busca.length < 2) { container.classList.add("hidden"); return; }
  const matches = usuarios.filter(u => (u.nome || "").toLowerCase().includes(busca) || (u.cnpj || "").includes(busca)).slice(0, 8);
  if (!matches.length) { container.classList.add("hidden"); return; }
  container.innerHTML = matches.map(u => `<div style="padding:.5rem .8rem;cursor:pointer;font-size:.85rem;border-bottom:1px solid var(--bdr)" onmousedown="selecionarClientePedido('${esc(u.id)}')">${esc(u.nome || "")} <span style="color:var(--mut);font-size:.75rem">${esc(u.cnpj || "")}</span></div>`).join("");
  container.classList.remove("hidden");
}

function selecionarClientePedido(clienteId) {
  const u = usuarios.find(x => x.id === clienteId);
  if (!u) return;
  document.getElementById("pedido-cliente-busca").value = u.nome || "";
  document.getElementById("pedido-cliente-id").value = u.id;
  document.getElementById("pedido-cliente-sugestoes").classList.add("hidden");
}

function adicionarItemPedidoManual() {
  _pedidoManualItens.push({ descricao: "", sku: "", unidade: "UN", qtd: 1, precoUnitario: 0 });
  renderPedidoItensManual();
  setTimeout(() => { const inputs = document.querySelectorAll("[id^='ped-item-desc-']"); if (inputs.length) inputs[inputs.length - 1].focus(); }, 100);
}

function removerItemPedidoManual(idx) {
  _pedidoManualItens.splice(idx, 1);
  renderPedidoItensManual();
}

function renderPedidoItensManual() {
  const container = document.getElementById("pedido-itens-container");
  if (!container) return;
  if (!_pedidoManualItens.length) {
    container.innerHTML = '<div style="color:var(--mut);font-size:.85rem;padding:.5rem 0">Nenhum item adicionado. Clique em "+ Adicionar Produto" ou selecione um contrato.</div>';
    return;
  }
  let totalGeral = 0;
  container.innerHTML = `
    <label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.5rem">Itens do Pedido</label>
    <div class="table-wrap" style="max-height:300px;overflow-y:auto">
      <table><thead><tr><th>Descricao</th><th>SKU</th><th>Un.</th><th class="text-center">Qtd</th><th class="text-right">Preco Unit.</th><th class="text-right">Valor Total</th><th></th></tr></thead>
      <tbody>${_pedidoManualItens.map((item, idx) => {
        const subtotal = item.valorTotal != null ? (item.valorTotal || 0) : Math.round(((item.qtd || 0) * (item.precoUnitario || 0)) * 100) / 100;
        totalGeral += subtotal;
        return `<tr>
          <td style="position:relative"><input type="text" id="ped-item-desc-${idx}" value="${esc(item.descricao)}" placeholder="Buscar produto..." oninput="buscarProdutoPedido(${idx})" onfocus="buscarProdutoPedido(${idx})" autocomplete="off" style="width:100%;min-width:180px"><div id="ped-prod-sug-${idx}" class="hidden" style="position:absolute;top:100%;left:0;right:0;z-index:1030;background:var(--bg);border:1px solid var(--bdr);border-radius:8px;max-height:150px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.35)"></div></td>
          <td><input type="text" id="ped-item-sku-${idx}" value="${esc(item.sku)}" style="width:80px" readonly></td>
          <td><input type="text" id="ped-item-un-${idx}" value="${esc(item.unidade)}" style="width:55px;text-align:center" readonly></td>
          <td class="text-center"><input type="number" id="ped-item-qty-${idx}" value="${item.qtd || 0}" min="0" step="any" style="width:70px;text-align:center" onchange="atualizarItemPedidoManual(${idx})"></td>
          <td class="text-right"><input type="number" id="ped-item-preco-${idx}" value="${(item.precoUnitario || 0).toFixed(2)}" min="0" step="0.01" style="width:90px;text-align:right" onchange="atualizarItemPedidoManualPreco(${idx})"></td>
          <td class="text-right"><input type="number" id="ped-item-valor-${idx}" value="${subtotal || 0}" min="0" step="0.01" style="width:100px;text-align:right" onchange="atualizarItemPedidoManualValor(${idx})"></td>
          <td><button onclick="removerItemPedidoManual(${idx})" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--red,#f44);padding:.2rem" title="Excluir item">🗑️</button></td>
        </tr>`;
      }).join("")}</tbody>
      <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700">TOTAL</td><td class="text-right font-mono" style="color:var(--green);font-weight:800;font-size:1.05rem">${brl.format(totalGeral)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function buscarProdutoPedido(idx) {
  const input = document.getElementById(`ped-item-desc-${idx}`);
  const container = document.getElementById(`ped-prod-sug-${idx}`);
  if (!input || !container) return;
  const busca = (input.value || "").toLowerCase().trim();
  if (busca.length < 1) { container.classList.add("hidden"); return; }

  // AC-6: Se pedido vinculado a contrato, buscar itens do contrato primeiro
  const ctrId = pedidoCloneDraft?.contratoId || (pedidoEditId ? pedidos.find(x => x.id === pedidoEditId)?.contratoId : null);
  const ctr = ctrId ? contratos.find(c => c.id === ctrId) : null;
  let html = "";

  if (ctr && ctr.itens && ctr.itens.length > 0) {
    const ctrMatches = ctr.itens.filter(i => (i.descricao || "").toLowerCase().includes(busca) || (i.sku || "").toLowerCase().includes(busca) || (i.skuVinculado || "").toLowerCase().includes(busca)).slice(0, 20);
    if (ctrMatches.length) {
      html = ctrMatches.map((i, cIdx) => {
        const itemIdx = ctr.itens.indexOf(i);
        return `<div style="padding:.45rem .8rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid var(--bdr)" onmousedown="selecionarProdutoContratoParaPedido(${idx},${itemIdx})"><strong>${esc(i.descricao)}</strong> <span class="badge badge-blue" style="font-size:.7rem">${esc(i.unidade || 'UN')}</span> <span style="color:var(--green);font-size:.75rem">${i.precoUnitario ? brl.format(i.precoUnitario) : ''}</span> <span class="badge badge-green" style="font-size:.6rem">Contrato</span></div>`;
      }).join("");
    }
  }

  // Fallback: buscar na Inteligência (produtos cadastrados)
  if (!html) {
    const matches = estoqueIntelProdutos.filter(p => (p.nome || "").toLowerCase().includes(busca) || (p.sku || "").toLowerCase().includes(busca) || (p.categoria || "").toLowerCase().includes(busca) || (p.id || "").toLowerCase().includes(busca)).slice(0, 20);
    if (!matches.length) { container.classList.add("hidden"); return; }
    html = matches.map(p => {
      const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === p.id);
      const precoRef = embs.length ? embs[0].preco_referencia || 0 : 0;
      return `<div style="padding:.45rem .8rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid var(--bdr)" onmousedown="selecionarProdutoPedido(${idx},'${esc(p.id)}')"><strong>${esc(p.nome)}</strong> <span class="badge badge-blue" style="font-size:.7rem">${esc(p.unidade_base)}</span>${precoRef ? ' <span style="color:var(--green);font-size:.75rem">' + brl.format(precoRef) + '</span>' : ''}</div>`;
    }).join("");
  }

  if (!html) { container.classList.add("hidden"); return; }
  container.innerHTML = html;
  container.classList.remove("hidden");
}

function selecionarProdutoContratoParaPedido(idx, itemIdx) {
  const ctrId = pedidoCloneDraft?.contratoId || (pedidoEditId ? pedidos.find(x => x.id === pedidoEditId)?.contratoId : null);
  const ctr = ctrId ? contratos.find(c => c.id === ctrId) : null;
  if (!ctr || !ctr.itens[itemIdx]) return;
  const item = ctr.itens[itemIdx];
  _pedidoManualItens[idx] = {
    descricao: item.descricao,
    sku: item.skuVinculado || item.sku || '',
    unidade: item.unidade || 'UN',
    qtd: _pedidoManualItens[idx]?.qtd || 1,
    precoUnitario: item.precoUnitario || 0,
    valorTotal: null,
    ncm: item.ncm || '',
    itemNum: item.num
  };
  renderPedidoItensManual();
  const sugContainer = document.getElementById(`ped-prod-sug-${idx}`);
  if (sugContainer) sugContainer.classList.add("hidden");
}

function selecionarProdutoPedido(idx, produtoId) {
  const produto = estoqueIntelProdutos.find(p => p.id === produtoId);
  if (!produto) return;
  const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === produtoId);
  const precoRef = embs.length ? embs[0].preco_referencia || 0 : 0;
  const sku = produto.sku || (embs.length ? embs[0].codigo_barras : "") || produtoId;
  const ncm = produto.ncm || "";
  _pedidoManualItens[idx] = { descricao: produto.nome, sku, unidade: produto.unidade_base || "UN", qtd: _pedidoManualItens[idx]?.qtd || 1, precoUnitario: precoRef, valorTotal: null, ncm };
  renderPedidoItensManual();
  const sugContainer = document.getElementById(`ped-prod-sug-${idx}`);
  if (sugContainer) sugContainer.classList.add("hidden");
}

function atualizarItemPedidoManual(idx) {
  const qty = parseFloat(document.getElementById(`ped-item-qty-${idx}`)?.value) || 0;
  if (_pedidoManualItens[idx]) {
    _pedidoManualItens[idx].qtd = qty;
    // Recalcular valor total se tinha precoUnitario mas sem valorTotal explícito
    if (_pedidoManualItens[idx].precoUnitario && _pedidoManualItens[idx].valorTotal == null) {
      _pedidoManualItens[idx].valorTotal = qty * _pedidoManualItens[idx].precoUnitario;
    }
  }
  renderPedidoItensManual();
}

function atualizarItemPedidoManualPreco(idx) {
  const preco = parseFloat(document.getElementById(`ped-item-preco-${idx}`)?.value) || 0;
  if (_pedidoManualItens[idx]) {
    _pedidoManualItens[idx].precoUnitario = Math.round(preco * 100) / 100;
    const qty = _pedidoManualItens[idx].qtd || 0;
    _pedidoManualItens[idx].valorTotal = Math.round(qty * _pedidoManualItens[idx].precoUnitario * 100) / 100;
  }
  renderPedidoItensManual();
}

function atualizarItemPedidoManualValor(idx) {
  const valor = parseFloat(document.getElementById(`ped-item-valor-${idx}`)?.value) || 0;
  if (_pedidoManualItens[idx]) {
    _pedidoManualItens[idx].valorTotal = valor;
    const qty = _pedidoManualItens[idx].qtd || 0;
    _pedidoManualItens[idx].precoUnitario = qty > 0 ? valor / qty : 0;
  }
  renderPedidoItensManual();
}

function recalcularVencNovoPedido() {
  const prazo = document.getElementById("novo-ped-pag-prazo")?.value || "28";
  const dataPedido = document.getElementById("pedido-data")?.value || new Date().toISOString().slice(0, 10);
  const el = document.getElementById("novo-ped-pag-vencimento");
  if (el) el.value = calcularVencimentoPagamento(dataPedido, prazo);
}

function carregarItensContratoPedido() {
  const contratoId = document.getElementById("pedido-contrato")?.value;
  if (!contratoId) return;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  ensureContratoItensMetadata(c);
  _pedidoManualItens = c.itens.filter(i => (i.qtdContratada - (i.qtdEntregue || 0)) > 0).map(i => ({
    descricao: i.descricao, sku: i.sku || "", unidade: i.unidade || "UN", qtd: 0, precoUnitario: i.precoUnitario, itemNum: i.num
  }));
  // Also fill client from contract
  const snapshot = getClienteFiscalSnapshotDoContrato(contratoId);
  if (snapshot?.nome) {
    document.getElementById("pedido-cliente-busca").value = snapshot.nome;
  }
  renderPedidoItensManual();
}

function renderPedidoItens() {
  const contratoId = document.getElementById("pedido-contrato").value;
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  ensureContratoItensMetadata(c);

  const container = document.getElementById("pedido-itens-container");
  const itensComSaldo = c.itens.filter(i => {
    const qtyAtual = Number(pedidoCloneDraft?.itens?.find((draft) => Number(draft.itemNum) === Number(i.num))?.qtd || 0);
    return (i.qtdContratada - i.qtdEntregue + qtyAtual) > 0;
  });

  container.innerHTML = `
    <label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.5rem">Itens (preencha a quantidade pedida)</label>
    <div class="table-wrap" style="max-height:300px;overflow-y:auto">
      <table>
        <thead><tr><th>Item</th><th>Unid</th><th class="text-right">Saldo</th><th class="text-right">Preco</th><th class="text-center">Qtd Pedida</th></tr></thead>
        <tbody>${itensComSaldo.map((item, idx) => {
          const qtyAtual = Number(pedidoCloneDraft?.itens?.find((draft) => Number(draft.itemNum) === Number(item.num))?.qtd || 0);
          const saldo = item.qtdContratada - item.qtdEntregue + qtyAtual;
          return `<tr>
            <td>${esc(item.descricao)}</td>
            <td class="nowrap">${esc(item.unidade)}</td>
            <td class="text-right font-mono">${saldo}</td>
            <td class="text-right font-mono">${brl.format(item.precoUnitario)}</td>
            <td class="text-center"><input type="number" min="0" max="${saldo}" value="${qtyAtual || 0}" step="any" style="width:70px;text-align:center" id="ped-qty-${idx}" data-item-num="${item.num}" data-desc="${esc(item.descricao)}"></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
}

function salvarPedidoManual() {
  const editingId = pedidoEditId;
  const contratoId = document.getElementById("pedido-contrato")?.value || "";
  const c = contratoId ? contratos.find(x => x.id === contratoId) : null;
  if (c) ensureContratoItensMetadata(c);
  const dataPedido = document.getElementById("pedido-data")?.value || new Date().toISOString().slice(0, 10);
  const dataPrevista = document.getElementById("pedido-data-prevista")?.value || dataPedido;
  const statusPedido = normalizePedidoStatus(document.getElementById("pedido-status")?.value || "em_aberto");

  // Collect items from _pedidoManualItens
  const itens = _pedidoManualItens.filter(i => i.descricao && i.qtd > 0).map((i, idx) => {
    const valorTotal = i.valorTotal != null ? Number(i.valorTotal) : Number(i.qtd || 0) * Number(i.precoUnitario || 0);
    const precoUnit = Number(i.qtd) > 0 ? valorTotal / Number(i.qtd) : 0;
    return {
      itemNum: i.itemNum || (idx + 1),
      descricao: i.descricao,
      qtd: Number(i.qtd) || 0,
      precoUnitario: precoUnit,
      valorTotal: valorTotal,
      sku: i.sku || "",
      unidade: i.unidade || "UN",
      ncm: i.ncm || ""
    };
  });
  let valor = itens.reduce((sum, i) => sum + (i.valorTotal || 0), 0);

  if (itens.length === 0) {
    showToast("Preencha pelo menos um item.", 3000);
    return;
  }

  const now = new Date();
  const id = `PED-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.floor(Math.random()*9999)).padStart(4,"0")}`;

  // Resolve client: from search or contract
  const clienteId = document.getElementById("pedido-cliente-id")?.value || "";
  const clienteNomeBusca = document.getElementById("pedido-cliente-busca")?.value?.trim() || "";
  const usuario = clienteId ? usuarios.find(u => u.id === clienteId) : null;
  let clientePayload;
  if (usuario) {
    clientePayload = {
      id: usuario.id,
      nome: usuario.nome || clienteNomeBusca,
      cnpj: usuario.cnpj || "",
      ie: usuario.ie || "ISENTO",
      email: usuario.email || "",
      telefone: usuario.telefone || "",
      logradouro: usuario.logradouro || "",
      numero: usuario.numero || "",
      complemento: usuario.complemento || "",
      bairro: usuario.bairro || "",
      cep: usuario.cep || "",
      cidade: usuario.municipio || "",
      uf: usuario.uf || "MG",
      indicador_contribuinte: usuario.contribuinte_icms || "9"
    };
  } else if (c) {
    const snapshot = getClienteFiscalSnapshotDoContrato(contratoId) || buildClienteFiscalSnapshot(null, c.escola || clienteNomeBusca);
    clientePayload = { ...buildClienteFiscalSnapshot(null, clienteNomeBusca || c.escola), ...snapshot, nome: clienteNomeBusca || snapshot.nome || c.escola };
  } else {
    clientePayload = buildClienteFiscalSnapshot(null, clienteNomeBusca || "Cliente Avulso");
    clientePayload.nome = clienteNomeBusca || "Cliente Avulso";
  }
  const escolaNome = clientePayload.nome;

  // Coletar dados de pagamento do formulário
  const pagForma = document.getElementById("novo-ped-pag-forma")?.value || "boleto";
  const pagCondicao = document.getElementById("novo-ped-pag-prazo")?.value || "28";
  const pagVencimento = document.getElementById("novo-ped-pag-vencimento")?.value || calcularVencimentoPagamento(dataPedido, pagCondicao);
  const contaPadrao = getConfiguredDefaultBankAccount();
  const pagamento = {
    forma: pagForma,
    contaBancaria: contaPadrao ? { banco: contaPadrao.banco, agencia: contaPadrao.agencia, conta: contaPadrao.conta, pix: contaPadrao.pix, apelido: contaPadrao.apelido, id: contaPadrao.id } : null,
    condicao: pagCondicao,
    vencimento: pagVencimento
  };

  if (editingId) {
    const pedido = pedidos.find(x => x.id === editingId);
    if (!pedido) return;
    if (c) {
      (pedido.itens || []).forEach(pi => {
        const item = c.itens.find(ci => ci.num === pi.itemNum || ci.descricao === pi.descricao);
        if (item && pedido.saldoDeduzido) item.qtdEntregue = Math.max(0, Number(item.qtdEntregue || 0) - Number(pi.qtd || 0));
      });
    }
    pedido.contratoId = contratoId;
    pedido.escola = escolaNome;
    pedido.cliente = { ...(pedido.cliente || {}), ...clientePayload };
    pedido.data = dataPedido;
    pedido.dataPrevista = dataPrevista;
    pedido.dataEntrega = dataPrevista || dataPedido;
    pedido.itens = itens;
    pedido.valor = valor;
    pedido.status = statusPedido;
    pedido.obs = contratoId ? getObsContrato(contratoId) : "";
    pedido.saldoDeduzido = !!contratoId;
    pedido.pagamento = pagamento;
  } else {
    pedidos.push({
      id,
      contratoId,
      escola: escolaNome,
      cliente: clientePayload,
      data: dataPedido,
      dataPrevista,
      dataEntrega: dataPrevista || dataPedido,
      itens,
      valor,
      status: statusPedido,
      obs: contratoId ? getObsContrato(contratoId) : "",
      saldoDeduzido: !!contratoId,
      pagamento,
      fiscal: {
        notaFiscalId: "",
        status: "nao_emitida",
        cobrancaId: ""
      }
    });
  }

  // Deduzir saldo do contrato (apenas se vinculado a contrato)
  if (c) {
    itens.forEach(pi => {
      const item = c.itens.find(ci => ci.num === pi.itemNum || ci.descricao === pi.descricao);
      if (item) {
        const saldo = item.qtdContratada - item.qtdEntregue;
        item.qtdEntregue += Math.min(pi.qtd, saldo);
      }
    });
    saveContratos();
  }

  savePedidos();
  fecharModalPedido();
  renderAll();
  showToast(editingId ? `Pedido ${editingId} atualizado.` : `Pedido ${id} registrado! Saldo do contrato atualizado.`);
}

/* ── Pedido: Dados de Pagamento ── */
function calcularVencimentoPagamento(dataPedido, prazoDias) {
  const d = dataPedido ? new Date(dataPedido + "T12:00:00") : new Date();
  d.setDate(d.getDate() + Number(prazoDias || 28));
  return d.toISOString().split("T")[0];
}

function recalcularVencimentoPedido(pedidoId) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  const prazo = document.getElementById("pag-prazo-" + pedidoId)?.value || "28";
  const venc = calcularVencimentoPagamento(p.data || p.dataEntrega, prazo);
  const el = document.getElementById("pag-vencimento-" + pedidoId);
  if (el) el.value = venc;
}

function getContasBancariasOptions(selectedApelido) {
  const contaPadrao = getConfiguredDefaultBankAccount();
  if (!contaPadrao) return '<option value="">Nenhuma conta configurada</option>';
  const contas = [contaPadrao];
  return contas.map(c => {
    const label = (c.apelido || c.banco || "Conta") + " — Ag " + (c.agencia || "") + " Cc " + (c.conta || "");
    const sel = (selectedApelido && c.apelido === selectedApelido) || (!selectedApelido) ? " selected" : "";
    return '<option value="' + esc(c.id || c.apelido || "") + '"' + sel + '>' + esc(label) + '</option>';
  }).join("");
}

function toggleAddProdutoDetalhe(pedidoId) {
  const el = document.getElementById('add-produto-detalhe-' + pedidoId);
  if (!el) return;
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    const input = document.getElementById('add-prod-busca-' + pedidoId);
    if (input) { input.value = ''; input.focus(); }
  }
}

function buscarProdutoDetalhe(pedidoId) {
  const input = document.getElementById('add-prod-busca-' + pedidoId);
  const container = document.getElementById('add-prod-sug-' + pedidoId);
  if (!input || !container) return;
  const busca = (input.value || '').toLowerCase().trim();
  if (busca.length < 1) { container.classList.add('hidden'); return; }

  const p = pedidos.find(x => x.id === pedidoId);
  const ctrId = p?.contratoId;
  const ctr = ctrId ? contratos.find(c => c.id === ctrId) : null;
  let html = '';

  if (ctr && ctr.itens && ctr.itens.length > 0) {
    const ctrMatches = ctr.itens.filter(i => (i.descricao || '').toLowerCase().includes(busca)).slice(0, 15);
    html = ctrMatches.map((i) => {
      const itemIdx = ctr.itens.indexOf(i);
      return '<div style="padding:.45rem .8rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid var(--bdr)" onmousedown="adicionarProdutoDetalhe(\'' + pedidoId + '\',\'contrato\',' + itemIdx + ')"><strong>' + esc(i.descricao) + '</strong> <span class="badge badge-blue" style="font-size:.7rem">' + esc(i.unidade || 'UN') + '</span> ' + (i.precoUnitario ? '<span style="color:var(--green);font-size:.75rem">' + brl.format(i.precoUnitario) + '</span>' : '') + ' <span class="badge badge-green" style="font-size:.6rem">Contrato</span></div>';
    }).join('');
  }

  if (!html) {
    const matches = estoqueIntelProdutos.filter(pr => (pr.nome || '').toLowerCase().includes(busca) || (pr.sku || '').toLowerCase().includes(busca)).slice(0, 15);
    html = matches.map(pr => {
      const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === pr.id);
      const precoRef = embs.length ? embs[0].preco_referencia || 0 : 0;
      return '<div style="padding:.45rem .8rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid var(--bdr)" onmousedown="adicionarProdutoDetalhe(\'' + pedidoId + '\',\'intel\',\'' + esc(pr.id) + '\')"><strong>' + esc(pr.nome) + '</strong> <span class="badge badge-blue" style="font-size:.7rem">' + esc(pr.unidade_base) + '</span>' + (precoRef ? ' <span style="color:var(--green);font-size:.75rem">' + brl.format(precoRef) + '</span>' : '') + '</div>';
    }).join('');
  }

  if (!html) { container.classList.add('hidden'); return; }
  container.innerHTML = html;
  container.classList.remove('hidden');
}

function adicionarProdutoDetalhe(pedidoId, fonte, ref) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  if (!p.itens) p.itens = [];
  let novoItem = { descricao: '', unidade: 'UN', qtd: 1, precoUnitario: 0, sku: '', ncm: '' };

  if (fonte === 'contrato') {
    const ctr = contratos.find(c => c.id === p.contratoId);
    if (ctr && ctr.itens[ref]) {
      const ci = ctr.itens[ref];
      novoItem = { descricao: ci.descricao, unidade: ci.unidade || 'UN', qtd: 1, precoUnitario: ci.precoUnitario || 0, sku: ci.skuVinculado || ci.sku || '', ncm: ci.ncm || '', itemNum: ci.num };
    }
  } else if (fonte === 'intel') {
    const prod = estoqueIntelProdutos.find(pr => pr.id === ref);
    if (prod) {
      const embs = estoqueIntelEmbalagens.filter(e => e.produto_id === ref);
      const precoRef = embs.length ? embs[0].preco_referencia || 0 : 0;
      novoItem = { descricao: prod.nome, unidade: prod.unidade_base || 'UN', qtd: 1, precoUnitario: precoRef, sku: prod.sku || '', ncm: prod.ncm || '' };
    }
  }

  p.itens.push(novoItem);
  const novoTotal = p.itens.reduce((sum, it) => sum + Math.round(((it.qtd || 0) * (it.precoUnitario || 0)) * 100) / 100, 0);
  p.valor = novoTotal;
  p.totalGeral = novoTotal;
  p.valorTotal = novoTotal;
  savePedidos();
  verPedidoDetalhe(pedidoId);
  showToast('Produto adicionado ao pedido.', 2000);
}

function excluirItemDetalhe(pedidoId, idx) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p || !p.itens[idx]) return;
  if (!confirm('Excluir item "' + (p.itens[idx].descricao || 'item') + '" do pedido?')) return;
  p.itens.splice(idx, 1);
  const novoTotal = p.itens.reduce((sum, it) => sum + Math.round(((it.qtd || 0) * (it.precoUnitario || 0)) * 100) / 100, 0);
  p.totalGeral = novoTotal;
  p.valor = novoTotal;
  p.valorTotal = novoTotal;
  savePedidos();
  verPedidoDetalhe(pedidoId);
  showToast('Item excluído do pedido.', 2000);
}

function recalcSubtotalDetalhe(pedidoId, idx) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p || !p.itens[idx]) return;
  const precoInput = document.getElementById("fiscal-item-preco-" + pedidoId + "-" + idx);
  if (!precoInput) return;
  const preco = parseFloat(precoInput.value) || 0;
  p.itens[idx].precoUnitario = Math.round(preco * 100) / 100;
  const sub = Math.round((p.itens[idx].qtd || 0) * p.itens[idx].precoUnitario * 100) / 100;
  const subEl = document.getElementById("fiscal-item-sub-" + pedidoId + "-" + idx);
  if (subEl) subEl.textContent = brl.format(sub);
  const novoTotal = p.itens.reduce((sum, it) => sum + Math.round(((it.qtd || 0) * (it.precoUnitario || 0)) * 100) / 100, 0);
  p.totalGeral = novoTotal;
  p.valor = novoTotal;
  p.valorTotal = novoTotal;
  savePedidos();
}

function salvarPedidoPagamento(pedidoId) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  const forma = document.getElementById("pag-forma-" + pedidoId)?.value || "boleto";
  const contaId = document.getElementById("pag-conta-" + pedidoId)?.value || "";
  const condicao = document.getElementById("pag-prazo-" + pedidoId)?.value || "28";
  const vencimento = document.getElementById("pag-vencimento-" + pedidoId)?.value || "";
  const contaPadrao = getConfiguredDefaultBankAccount();
  p.pagamento = {
    forma,
    contaBancaria: contaPadrao ? { banco: contaPadrao.banco, agencia: contaPadrao.agencia, conta: contaPadrao.conta, pix: contaPadrao.pix, apelido: contaPadrao.apelido, id: contaPadrao.id } : null,
    condicao,
    vencimento
  };
  savePedidos();
  showToast("Dados de pagamento salvos para " + pedidoId + ".", 3000);
  verPedidoDetalhe(pedidoId);
}

function verPedidoDetalhe(pedidoId, isClone) {
  const p = isClone ? _pendingClone : pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  ensurePedidoFiscalData(p);
  const c = contratos.find(x => x.id === p.contratoId);
  const ctrLabel = c ? (c.processo ? 'Proc. ' + c.processo : c.id) : (p.contratoId || '-');
  const statusMeta = getPedidoStatusMeta(p.status);
  const marcadorHtml = p.marcador ? '<span style="background:rgba(139,92,246,.15);color:#8b5cf6;padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:700;margin-left:.5rem">' + esc(p.marcador) + '</span>' : '';
  const fiscalMissing = validatePedidoForInvoice(p);

  const temDemanda = gdpDemandas.some(d => d.pedidoId === p.id);
  let html = '<div style="display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">' + (temDemanda ? '<span class="badge badge-green" style="align-self:center">Demanda gerada</span>' : '<button class="btn btn-sm" style="background:rgba(34,197,94,.15);color:var(--green);border:none;font-weight:700" onclick="gdpGerarDemandaPedido(\'' + p.id + '\')">Gerar Demanda</button>') + '<button class="btn btn-purple btn-sm" onclick="imprimirPedido(\'' + p.id + '\')">Imprimir</button></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Protocolo</div><div style="font-weight:700;font-family:monospace">' + esc(p.id) + marcadorHtml + '</div></div>';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Escola</div><div style="font-weight:700">' + esc(p.escola) + '</div></div>';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Contrato</div><div style="font-weight:700">' + esc(ctrLabel) + '</div></div>';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Data</div><div style="font-weight:700">' + fmtDate(p.dataEntrega || p.data) + '</div></div>';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Data Prevista</div><div style="display:flex;align-items:center;gap:.4rem"><input type="date" id="detalhe-data-prevista-' + p.id + '" value="' + esc(p.dataPrevista || p.dataEntrega || p.data || '') + '" style="background:var(--s1);border:1px solid var(--bdr);border-radius:6px;color:var(--txt);padding:.3rem .5rem;font-size:.85rem"></div></div>';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Valor Total</div><div style="font-weight:700;color:var(--green);font-size:1.2rem">' + brl.format(p.valor) + '</div></div>';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Status</div><div><span class="badge ' + statusMeta.className + '">' + esc(statusMeta.label) + '</span></div></div>';
  html += '</div>';
  const nf = getNotaFiscalByPedido(p.id);
  html += '<div style="margin-bottom:1rem;padding:1rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)">';
  html += '<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap">';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Fiscal e Cobranca</div><div style="font-weight:700">' + esc(getNotaFiscalResumoOperacional(nf)) + '</div><div style="font-size:.8rem;color:var(--mut);margin-top:.3rem">O pedido precisa conter todos os campos fiscais obrigatorios antes da emissao.</div>' + (fiscalMissing.length ? '<div style="margin-top:.55rem;color:var(--yellow);font-size:.78rem"><strong>Pendencias:</strong> ' + esc(fiscalMissing.join(', ')) + '</div>' : '<div style="margin-top:.55rem;color:var(--green);font-size:.78rem"><strong>Base fiscal completa.</strong></div>') + '</div>';
  html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
  html += (nf
    ? '<button class="btn btn-outline" onclick="fecharModalPedido();switchTab(\'notas-fiscais\');setTimeout(function(){verNotaFiscal(\'' + nf.id + '\')},300)">Ver NF</button><button class="btn btn-sm" style="background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700" onclick="reenviarEmailNfPedido(\'' + p.id + '\')">📧 Reenviar E-mail</button>'
    : '<button class="btn btn-purple" onclick="gerarNotaFiscalPedido(\'' + p.id + '\')">Gerar Nota Fiscal</button>');
  html += '</div>';
  html += '</div></div>';

  html += '<div style="margin-bottom:1rem;padding:1rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.9rem">';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Cadastro Fiscal do Pedido</div><div style="font-size:.82rem;color:var(--mut)">Revise os campos legais antes de emitir a NF.</div></div>';
  html += '<button class="btn btn-outline btn-sm" onclick="savePedidoFiscalData(\'' + p.id + '\')">Salvar Dados Fiscais</button>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Razao/Nome</label><input id="fiscal-nome-' + p.id + '" type="text" value="' + esc(p.cliente?.nome || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">CNPJ/CPF</label><input id="fiscal-cnpj-' + p.id + '" type="text" value="' + esc(p.cliente?.cnpj || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">IE</label><input id="fiscal-ie-' + p.id + '" type="text" value="' + esc(p.cliente?.ie || 'ISENTO') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Email</label><input id="fiscal-email-' + p.id + '" type="text" value="' + esc(p.cliente?.email || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Telefone</label><input id="fiscal-telefone-' + p.id + '" type="text" value="' + esc(p.cliente?.telefone || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Indicador Contribuinte</label><input id="fiscal-indicador-' + p.id + '" type="text" value="' + esc(p.cliente?.indicador_contribuinte || '9') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Logradouro</label><input id="fiscal-logradouro-' + p.id + '" type="text" value="' + esc(p.cliente?.logradouro || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Numero</label><input id="fiscal-numero-' + p.id + '" type="text" value="' + esc(p.cliente?.numero || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Complemento</label><input id="fiscal-complemento-' + p.id + '" type="text" value="' + esc(p.cliente?.complemento || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Bairro</label><input id="fiscal-bairro-' + p.id + '" type="text" value="' + esc(p.cliente?.bairro || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">CEP</label><input id="fiscal-cep-' + p.id + '" type="text" value="' + esc(p.cliente?.cep || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Cidade/UF</label><div style="display:grid;grid-template-columns:2fr 1fr;gap:.45rem"><input id="fiscal-cidade-' + p.id + '" type="text" value="' + esc(p.cliente?.cidade || '') + '" style="width:100%"><input id="fiscal-uf-' + p.id + '" type="text" value="' + esc(p.cliente?.uf || 'MG') + '" style="width:100%"></div></div>';
  html += '</div></div>';

  if (p.itens && p.itens.length > 0) {
    html += '<div style="border:1px solid var(--bdr);border-radius:10px;overflow:hidden"><table style="width:100%;border-collapse:collapse">';
    html += '<thead><tr style="background:var(--s2)"><th style="padding:.5rem .8rem;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Produto</th><th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Qtd</th><th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Un.</th><th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">NCM</th><th style="padding:.5rem .8rem;text-align:center;font-size:.72rem;text-transform:uppercase;color:var(--mut)">SKU</th><th style="padding:.5rem .8rem;text-align:right;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Preco Unit.</th><th style="padding:.5rem .8rem;text-align:right;font-size:.72rem;text-transform:uppercase;color:var(--mut)">Subtotal</th><th style="padding:.5rem .4rem;width:40px"></th></tr></thead><tbody>';
    p.itens.forEach((item, idx) => {
      const sub = Math.round(((item.qtd || 0) * (item.precoUnitario || 0)) * 100) / 100;
      html += '<tr style="border-top:1px solid rgba(71,85,105,.3)"><td style="padding:.5rem .8rem;font-size:.85rem">' + esc(item.descricao || '') + '</td><td style="padding:.5rem .8rem;text-align:center">' + (item.qtd || 0) + '</td><td style="padding:.5rem .4rem"><input id="fiscal-item-un-' + p.id + '-' + idx + '" type="text" value="' + esc(item.unidade || 'UN') + '" style="width:62px;text-align:center"></td><td style="padding:.5rem .4rem"><input id="fiscal-item-ncm-' + p.id + '-' + idx + '" type="text" value="' + esc(item.ncm || '') + '" style="width:110px;text-align:center"></td><td style="padding:.5rem .4rem"><input id="fiscal-item-sku-' + p.id + '-' + idx + '" type="text" value="' + esc(item.sku || '') + '" style="width:90px;text-align:center"></td><td style="padding:.5rem .4rem;text-align:right"><input id="fiscal-item-preco-' + p.id + '-' + idx + '" type="number" step="0.01" min="0" value="' + (item.precoUnitario || 0).toFixed(2) + '" style="width:90px;text-align:right" onchange="recalcSubtotalDetalhe(\'' + p.id + '\',' + idx + ')"></td><td id="fiscal-item-sub-' + p.id + '-' + idx + '" style="padding:.5rem .8rem;text-align:right;color:var(--green);font-weight:700">' + brl.format(sub) + '</td><td style="padding:.3rem"><button onclick="excluirItemDetalhe(\'' + p.id + '\',' + idx + ')" style="background:none;border:none;cursor:pointer;font-size:.9rem;color:var(--red,#f44)" title="Excluir item">🗑️</button></td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // ── Adicionar Produto inline ──
  html += '<div style="margin-top:.8rem;display:flex;gap:.5rem;align-items:center">';
  html += '<button class="btn btn-sm" style="background:rgba(34,197,94,.15);color:var(--green);border:none;font-weight:700" onclick="toggleAddProdutoDetalhe(\'' + p.id + '\')">+ Adicionar Produto</button>';
  html += '</div>';
  html += '<div id="add-produto-detalhe-' + p.id + '" class="hidden" style="margin-top:.6rem;padding:.8rem;border:1px solid var(--bdr);border-radius:8px;background:var(--s1)">';
  html += '<div style="position:relative"><input type="text" id="add-prod-busca-' + p.id + '" placeholder="Buscar produto no contrato ou inteligência..." oninput="buscarProdutoDetalhe(\'' + p.id + '\')" style="width:100%;padding:.5rem .8rem;background:var(--bg);border:1px solid var(--bdr);border-radius:6px;color:var(--txt);font-size:.85rem"><div id="add-prod-sug-' + p.id + '" class="hidden" style="position:absolute;top:100%;left:0;right:0;z-index:1030;background:var(--bg);border:1px solid var(--bdr);border-radius:8px;max-height:200px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.35)"></div></div>';
  html += '</div>';

  // ── Seção Dados de Pagamento ──
  const pag = p.pagamento || {};
  const pagPreenchido = pag.forma && pag.vencimento;
  html += '<div style="margin-top:1.2rem;padding:1rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.9rem">';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Dados de Pagamento</div><div style="font-size:.82rem;color:var(--mut)">Preencha antes de gerar a NF para que vencimento e forma de pagamento fluam automaticamente.</div></div>';
  html += '<div style="display:flex;gap:.5rem;align-items:center">' + (pagPreenchido ? '<span class="badge badge-green">Pagamento configurado</span>' : '<span class="badge badge-yellow">Pagamento pendente</span>') + '<button class="btn btn-outline btn-sm" onclick="salvarPedidoPagamento(\'' + p.id + '\')">Salvar Pagamento</button></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma de Recebimento</label><select id="pag-forma-' + p.id + '"><option value="boleto"' + (pag.forma === "boleto" ? " selected" : "") + '>Boleto</option><option value="pix"' + (pag.forma === "pix" ? " selected" : "") + '>PIX</option><option value="ted"' + (pag.forma === "ted" ? " selected" : "") + '>TED</option><option value="dinheiro"' + (pag.forma === "dinheiro" ? " selected" : "") + '>Dinheiro</option></select></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Conta Bancaria</label><select id="pag-conta-' + p.id + '">' + getContasBancariasOptions(pag.contaBancaria?.apelido) + '</select></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Condicao de Pagamento (prazo)</label><select id="pag-prazo-' + p.id + '" onchange="recalcularVencimentoPedido(\'' + p.id + '\')"><option value="0"' + (pag.condicao === "0" ? " selected" : "") + '>A vista</option><option value="15"' + (pag.condicao === "15" ? " selected" : "") + '>15 dias</option><option value="28"' + (!pag.condicao || pag.condicao === "28" ? " selected" : "") + '>28 dias</option><option value="30"' + (pag.condicao === "30" ? " selected" : "") + '>30 dias</option><option value="45"' + (pag.condicao === "45" ? " selected" : "") + '>45 dias</option><option value="60"' + (pag.condicao === "60" ? " selected" : "") + '>60 dias</option><option value="90"' + (pag.condicao === "90" ? " selected" : "") + '>90 dias</option></select></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Data de Vencimento</label><input type="date" id="pag-vencimento-' + p.id + '" value="' + (pag.vencimento || calcularVencimentoPagamento(p.data || p.dataEntrega, pag.condicao || "28")) + '"></div>';
  html += '</div></div>';

  // ── Observações do Pedido (editável — vai para a NF) ──
  const obsAtual = p.obs || '';
  const obsContrato = c?.observacoes || '';
  html += '<div style="margin-top:1.2rem;padding:1rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.6rem">';
  html += '<div><div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.25rem">Observações do Pedido</div><div style="font-size:.82rem;color:var(--mut)">Este texto será incluído nas Informações Complementares da Nota Fiscal.</div></div>';
  html += '</div>';
  html += '<textarea id="pedido-obs-' + p.id + '" style="width:100%;min-height:80px;padding:.6rem .8rem;background:var(--bg);border:1px solid var(--bdr);border-radius:8px;color:var(--txt);font-size:.85rem;resize:vertical;font-family:inherit" placeholder="Observações que serão replicadas na NF...">' + esc(obsAtual) + '</textarea>';
  if (obsContrato && obsAtual !== obsContrato) {
    html += '<div style="margin-top:.5rem;font-size:.78rem;color:var(--mut);padding:.5rem .7rem;background:var(--s2);border-radius:6px"><strong>Obs. do contrato:</strong> ' + esc(obsContrato) + '</div>';
  }
  html += '</div>';

  if (isClone) {
    html += '<div style="margin-top:1.2rem;display:flex;justify-content:flex-end;gap:.5rem"><button class="btn btn-outline" onclick="cancelarClonePedido()">Cancelar</button><button class="btn btn-green" onclick="salvarClonePedido()">Salvar</button></div>';
  } else {
    html += '<div style="margin-top:1.2rem;display:flex;justify-content:flex-end;gap:.5rem"><button class="btn btn-outline" onclick="fecharModalPedido()">Cancelar</button><button class="btn btn-green" onclick="salvarPedidoCompleto(\'' + p.id + '\')">Salvar</button></div>';
  }

  document.querySelector("#modal-pedido h2").textContent = isClone ? 'Clone — ' + p.id : 'Pedido ' + p.id;
  document.getElementById("modal-pedido-body").innerHTML = html;
  document.getElementById("modal-pedido").classList.remove("hidden");
}

function salvarPedidoCompleto(pedidoId) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  // Salvar data prevista
  const dataPrevistaEl = document.getElementById('detalhe-data-prevista-' + pedidoId);
  if (dataPrevistaEl) p.dataPrevista = dataPrevistaEl.value;
  // Salvar observação do pedido
  const obsEl = document.getElementById('pedido-obs-' + pedidoId);
  if (obsEl) p.obs = obsEl.value;
  // Salvar dados fiscais
  savePedidoFiscalData(pedidoId);
  // Salvar pagamento
  salvarPedidoPagamento(pedidoId);
  // Recalcular preços dos itens
  (p.itens || []).forEach((item, idx) => {
    const precoEl = document.getElementById('fiscal-item-preco-' + pedidoId + '-' + idx);
    if (precoEl) item.precoUnitario = Math.round(parseFloat(precoEl.value || 0) * 100) / 100;
  });
  const novoTotal = p.itens.reduce((sum, it) => sum + Math.round(((it.qtd || 0) * (it.precoUnitario || 0)) * 100) / 100, 0);
  p.valor = novoTotal;
  p.totalGeral = novoTotal;
  p.valorTotal = novoTotal;
  savePedidos();
  renderPedidos();
  showToast('Pedido salvo com sucesso!', 3000);
  fecharModalPedido();
}

function imprimirPedido(pedidoId) {
  _selectedPedidoIds.clear();
  _selectedPedidoIds.add(pedidoId);
  imprimirPedidosSelecionados();
  _selectedPedidoIds.clear();
  atualizarSelecaoPedidos();
}

function salvarDataPrevistaPedido(pedidoId, novaData) {
  const p = pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  p.dataPrevista = novaData;
  savePedidos();
  const ok = document.getElementById('detalhe-data-prevista-ok-' + pedidoId);
  if (ok) { ok.style.display = ''; setTimeout(() => ok.style.display = 'none', 2000); }
  showToast('Data prevista atualizada.', 2000);
}

function fecharModalPedido() {
  pedidoCloneDraft = null;
  pedidoEditId = null;
  document.getElementById("modal-pedido").classList.add("hidden");
}

function getNotaFiscalOperationalFiscal(nf) {
  const sefazStatus = String(nf.integracoes?.sefaz?.status || nf.status || "");
  if (!isNotaFiscalReal(nf)) {
    return { label: "Controle manual", detail: "Nota externa acompanhada no GDP", badgeClass: "badge-blue" };
  }
  if (nf.status === "cancelada") {
    return { label: "Cancelada", detail: "Fluxo fiscal encerrado", badgeClass: "badge-red" };
  }
  if (nf.status === "rejeitada" || sefazStatus.includes("falha") || sefazStatus.includes("reje")) {
    return { label: "Falha fiscal", detail: "Revise a transmissao da nota", badgeClass: "badge-red" };
  }
  if (nf.status === "autorizada" || sefazStatus.includes("autoriz")) {
    return { label: "Fiscal ok", detail: "Nota liberada pela SEFAZ", badgeClass: "badge-green" };
  }
  return { label: "Pendente fiscal", detail: "Aguardando transmissao ou autorizacao", badgeClass: "badge-yellow" };
}

function getNotaFiscalOperationalBank(nf) {
  const bancariaStatus = String(nf.integracoes?.bancaria?.status || nf.cobranca?.status || "");
  if (bancariaStatus.includes("falha")) {
    return { label: "Falha banco", detail: "Cobranca precisa de ajuste", badgeClass: "badge-red" };
  }
  if (bancariaStatus.includes("recebida") || bancariaStatus.includes("confirmada")) {
    return { label: "Pagamento ok", detail: "Banco confirmou o recebimento", badgeClass: "badge-green" };
  }
  if (bancariaStatus.includes("aceita") || nf.cobranca?.providerChargeId || nf.integracoes?.bancaria?.providerChargeId) {
    return { label: "Cobranca emitida", detail: "Titulo registrado no provider", badgeClass: "badge-blue" };
  }
  if (nf.status === "autorizada") {
    return { label: "Aguardando banco", detail: "Nota pronta para cobranca", badgeClass: "badge-yellow" };
  }
  return { label: "Sem cobranca", detail: "Cobranca ainda nao iniciada", badgeClass: "badge-yellow" };
}

function getContaReceberOperationalBank(item) {
  const bancariaStatus = String(item.integracoes?.bancaria?.status || item.cobranca?.status || "");
  if (item.status === "recebida" || bancariaStatus.includes("recebida") || bancariaStatus.includes("confirmada")) {
    return {
      label: "Recebido",
      detail: item.conciliacao?.status === "conciliado_api_bancaria" ? "Baixa conciliada com o banco" : "Recebimento registrado",
      badgeClass: "badge-green"
    };
  }
  if (bancariaStatus.includes("falha")) {
    return { label: "Falha banco", detail: "Revise dados ou tente nova emissao", badgeClass: "badge-red" };
  }
  if (item.cobranca?.providerChargeId || item.integracoes?.bancaria?.providerChargeId) {
    return {
      label: item.conciliacao?.status === "divergencia_api_bancaria" ? "Divergencia" : "Cobranca pronta",
      detail: item.conciliacao?.status === "divergencia_api_bancaria" ? "Banco retornou divergencia" : "Titulo enviado ao banco",
      badgeClass: item.conciliacao?.status === "divergencia_api_bancaria" ? "badge-red" : "badge-blue"
    };
  }
  if (item.status.includes("cobranca") || item.conciliacao?.status === "pendente_api_bancaria") {
    return { label: "Aguardando retorno", detail: "Banco ainda nao confirmou o titulo", badgeClass: "badge-yellow" };
  }
  return { label: "Nao enviada", detail: "Conta ainda sem cobranca externa", badgeClass: "badge-yellow" };
}

function normalizeNotaFiscalStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized || normalized === "rascunho" || normalized === "transmitida" || normalized === "pendente_autorizacao" || normalized === "rejeitada") return "pendente";
  if (normalized === "autorizada" || normalized === "emitida" || normalized === "faturada") return "emitida";
  if (normalized === "cancelada") return "cancelada";
  if (normalized === "inutilizada") return "inutilizada";
  return "pendente";
}

function getNotaFiscalStatusMeta(status) {
  const normalized = normalizeNotaFiscalStatus(status);
  return NOTA_FISCAL_STATUS_TABS.find((item) => item.key === normalized) || NOTA_FISCAL_STATUS_TABS[1];
}

function setNotaFiscalStatusTab(status) {
  notaFiscalStatusTabAtual = status;
  renderNotasFiscais();
}

function renderNotasFiscaisStatusTabs(items = notasFiscais) {
  const container = document.getElementById("notas-fiscais-status-tabs");
  if (!container) return;
  container.innerHTML = NOTA_FISCAL_STATUS_TABS.map((tab) => {
    const count = tab.key === "todas" ? items.length : items.filter((item) => normalizeNotaFiscalStatus(item.status) === tab.key).length;
    const active = notaFiscalStatusTabAtual === tab.key;
    return `<button class="btn ${active ? 'btn-green' : 'btn-outline'} btn-sm" onclick="setNotaFiscalStatusTab('${tab.key}')">${tab.label} <span style="margin-left:.35rem;opacity:.8">${count}</span></button>`;
  }).join("");
}

function getNotaFiscalIntegracoesResumo(nf) {
  const fiscal = getNotaFiscalOperationalFiscal(nf);
  const bancaria = getNotaFiscalOperationalBank(nf);
  const comunicacao = nf.integracoes?.comunicacao || {};
  const emailOk = String(comunicacao.status || "").includes("email") || String(comunicacao.status || "").includes("disparada") || !!comunicacao.emailDisparadoAt;
  return `
    <div style="display:flex;gap:.45rem;align-items:center;flex-wrap:wrap">
      <span title="${esc(fiscal.label)}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${fiscal.badgeClass === 'badge-green' ? 'rgba(34,197,94,.18)' : fiscal.badgeClass === 'badge-red' ? 'rgba(239,68,68,.18)' : 'rgba(148,163,184,.18)'};color:${fiscal.badgeClass === 'badge-green' ? 'var(--green)' : fiscal.badgeClass === 'badge-red' ? 'var(--red)' : 'var(--mut)'};font-weight:800;font-size:.8rem;border:1px solid rgba(148,163,184,.2)">N</span>
      <span title="${esc(bancaria.label)}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${bancaria.badgeClass === 'badge-green' || bancaria.badgeClass === 'badge-blue' ? 'rgba(34,197,94,.18)' : bancaria.badgeClass === 'badge-red' ? 'rgba(239,68,68,.18)' : 'rgba(148,163,184,.18)'};color:${bancaria.badgeClass === 'badge-red' ? 'var(--red)' : bancaria.badgeClass === 'badge-yellow' ? 'var(--mut)' : 'var(--green)'};font-weight:800;font-size:.8rem;border:1px solid rgba(148,163,184,.2)">C</span>
      <span title="${emailOk ? 'Email disparado ao cliente' : 'Email pendente'}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${emailOk ? 'rgba(59,130,246,.18)' : 'rgba(148,163,184,.18)'};color:${emailOk ? 'var(--blue)' : 'var(--mut)'};font-size:.78rem;border:1px solid rgba(148,163,184,.2)">✉</span>
    </div>`;
}

function toggleSelectAllNotasFiscais() {
  const checked = document.getElementById("notas-fiscais-select-all")?.checked;
  document.querySelectorAll(".nota-fiscal-check").forEach((cb) => { cb.checked = checked; });
  atualizarSelecaoNotasFiscais();
}

function atualizarSelecaoNotasFiscais() {
  _selectedNotaFiscalIds.clear();
  document.querySelectorAll(".nota-fiscal-check:checked").forEach((cb) => _selectedNotaFiscalIds.add(cb.value));
  const bulk = document.getElementById("notas-fiscais-bulk-actions");
  const summary = document.getElementById("notas-fiscais-bulk-summary");
  const header = document.getElementById("notas-fiscais-select-all");
  const all = [...document.querySelectorAll(".nota-fiscal-check")];
  const selected = all.filter((cb) => cb.checked);
  if (summary) summary.textContent = `${selected.length} nota(s) selecionada(s)`;
  if (bulk) bulk.classList.toggle("hidden", selected.length === 0);
  if (header) {
    header.checked = all.length > 0 && selected.length === all.length;
    header.indeterminate = selected.length > 0 && selected.length < all.length;
  }
}

function abrirMenuNotaFiscal(id) {
  const nf = notasFiscais.find((item) => item.id === id);
  if (!nf) return;
  notaFiscalMenuAtualId = id;
  document.getElementById("nota-side-menu-nome").textContent = `${nf.numero || nf.id} • ${nf.cliente?.nome || ''}`;
  document.getElementById("nota-side-menu").classList.remove("hidden");
}

function fecharMenuNotaFiscal() {
  notaFiscalMenuAtualId = null;
  document.getElementById("nota-side-menu").classList.add("hidden");
}

function renderNotasFiscais() {
  const busca = (document.getElementById("busca-nota-fiscal")?.value || "").toLowerCase();
  let filtered = notasFiscais;
  if (busca) {
    filtered = filtered.filter((nf) =>
      (nf.numero || "").toLowerCase().includes(busca) ||
      (nf.pedidoId || "").toLowerCase().includes(busca) ||
      (nf.cliente?.nome || "").toLowerCase().includes(busca)
    );
  }
  renderNotasFiscaisStatusTabs(filtered);
  if (notaFiscalStatusTabAtual !== "todas") {
    filtered = filtered.filter((nf) => normalizeNotaFiscalStatus(nf.status) === notaFiscalStatusTabAtual);
  }

  const tbody = document.getElementById("notas-fiscais-tbody");
  const empty = document.getElementById("notas-fiscais-empty");
  const autorizadasEl = document.getElementById("nf-kpi-autorizadas");
  const bancariaEl = document.getElementById("nf-kpi-bancaria");
  const falhasEl = document.getElementById("nf-kpi-falhas");
  document.getElementById("tab-count-notas-fiscais").textContent = filtered.length;

  const autorizadas = notasFiscais.filter((nf) => nf.status === "autorizada").length;
  const pendenciaBancaria = notasFiscais.filter((nf) => {
    const status = nf.integracoes?.bancaria?.status || "";
    return nf.status === "autorizada" && !["aceita_provider", "confirmada_provider", "recebida_provider"].includes(status);
  }).length;
  const falhas = notasFiscais.filter((nf) => {
    const sefazStatus = String(nf.integracoes?.sefaz?.status || nf.status || "");
    const bancariaStatus = String(nf.integracoes?.bancaria?.status || "");
    return sefazStatus.includes("falha") || sefazStatus === "rejeitada" || bancariaStatus.includes("falha");
  }).length;
  if (autorizadasEl) autorizadasEl.textContent = autorizadas;
  if (bancariaEl) bancariaEl.textContent = pendenciaBancaria;
  if (falhasEl) falhasEl.textContent = falhas;

  if (!filtered.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    atualizarSelecaoNotasFiscais();
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filtered.map((nf) => `
    <tr>
      <td class="text-center"><input type="checkbox" class="nota-fiscal-check" value="${nf.id}" onchange="atualizarSelecaoNotasFiscais()"></td>
      <td class="text-center"><button class="btn btn-outline btn-sm" onclick="abrirMenuNotaFiscal('${nf.id}')" style="min-width:auto;padding:.2rem .5rem;font-weight:700">...</button></td>
      <td><button onclick="verNotaFiscal('${nf.id}')" style="background:none;border:none;padding:0;color:var(--blue);font-weight:700;cursor:pointer;text-align:left"><strong>${esc(nf.numero || "PENDENTE")}</strong></button><br><span style="font-size:.72rem;color:var(--mut)">${esc(nf.serie || "1")}</span><br><span class="nf-type-chip ${getNotaFiscalTipoClass(nf)}">${esc(getNotaFiscalTipoLabel(nf))}</span></td>
      <td class="font-mono">${esc(nf.pedidoId || "")}</td>
      <td>${esc(nf.cliente?.nome || "-")}</td>
      <td>${formatDateTimeLocal(nf.emitidaEm)}</td>
      <td class="text-right font-mono">${brl.format(nf.valor || 0)}</td>
      <td>${(() => {
        const fiscal = getNotaFiscalOperationalFiscal(nf);
        const meta = getNotaFiscalStatusMeta(nf.status);
        return `<span class="badge ${meta.className}">${esc(meta.label)}</span><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">${esc(fiscal.detail)}</div>`;
      })()}</td>
      <td>${getNotaFiscalIntegracoesResumo(nf)}</td>
    </tr>
  `).join("");
  atualizarSelecaoNotasFiscais();
}

function renderContasPagar() {
  const tbody = document.getElementById("contas-pagar-tbody");
  const empty = document.getElementById("contas-pagar-empty");
  const busca = (document.getElementById("cp-busca")?.value || "").toLowerCase();
  const filtroCategoria = document.getElementById("cp-filtro-categoria")?.value || "";
  let filtered = contasPagar;
  if (busca) filtered = filtered.filter((item) => (item.descricao || "").toLowerCase().includes(busca));
  if (filtroCategoria) filtered = filtered.filter((item) => item.categoria === filtroCategoria);
  renderContaPagarStatusTabs(filtered);
  filtered = filtered.filter((item) => normalizeContaPagarStatus(item) === contaPagarStatusTabAtual);
  document.getElementById("tab-count-contas-pagar").textContent = filtered.length;

  const hoje = new Date().toISOString().slice(0, 10);
  const totalAberto = contasPagar.filter((item) => item.status !== "paga").reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalPago = contasPagar.filter((item) => item.status === "paga").reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const atrasadas = contasPagar.filter((item) => item.status !== "paga" && item.vencimento && item.vencimento < hoje);
  const abertoEl = document.getElementById("cp-kpi-aberto");
  const pagoEl = document.getElementById("cp-kpi-pago");
  const atrasadasEl = document.getElementById("cp-kpi-atrasadas");
  if (abertoEl) abertoEl.textContent = brl.format(totalAberto);
  if (pagoEl) pagoEl.textContent = brl.format(totalPago);
  if (atrasadasEl) atrasadasEl.textContent = atrasadas.length;

  if (!filtered.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  tbody.innerHTML = filtered.map((item) => `
    <tr>
      <td style="position:relative;white-space:nowrap">
        <input type="checkbox" class="cp-check" value="${item.id}" onchange="atualizarSelecaoContasPagar()">
        <button style="font-size:1.1rem;background:none;border:none;cursor:pointer;color:var(--mut);padding:0 .2rem;vertical-align:middle" onclick="toggleCpMenu('${item.id}',event)">⋯</button>
        <div id="cp-menu-${item.id}" class="hidden" style="position:absolute;top:100%;left:0;z-index:1020;background:var(--bg);border:1px solid var(--bdr);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);min-width:160px;padding:.4rem 0">
          ${item.status !== "paga" ? `<a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--fg)" onclick="registrarBaixaContaPagar('${item.id}');closeCpMenus()">Pagar (Baixar)</a>` : ""}
          ${item.status === "paga" ? `<a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--yellow,#eab308)" onclick="estornarContaPagar('${item.id}');closeCpMenus()">Estornar</a>` : ""}
          <a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--fg)" onclick="clonarContaPagar('${item.id}');closeCpMenus()">Clonar</a>
          <a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--red,#f44)" onclick="excluirContaPagar('${item.id}');closeCpMenus()">Excluir</a>
        </div>
      </td>
      <td style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--mut)" onclick="abrirDetalheCp('${item.id}')">${esc(item.descricao)}</td>
      <td>${esc(formatCategoriaLabel(item.categoria))}</td>
      <td>${esc(item.forma)}</td>
      <td>${fmtDate(item.vencimento)}</td>
      <td class="text-right font-mono">${brl.format(item.valor || 0)}</td>
      <td>${(() => { const status = getContaPagarStatusMeta(item); return `<span class="badge ${status.className}">${esc(status.label)}</span>`; })()}</td>
      <td style="font-size:.76rem;color:var(--mut)">${esc(formatAuditStamp(item.audit, item.pagaEm, item.audit?.updatedBy))}</td>
    </tr>
  `).join("");
}

function renderContasReceber() {
  const tbody = document.getElementById("contas-receber-tbody");
  const empty = document.getElementById("contas-receber-empty");
  const busca = (document.getElementById("cr-busca")?.value || "").toLowerCase();
  const filtroCategoria = document.getElementById("cr-filtro-categoria")?.value || "";
  let filtered = contasReceber;
  if (busca) filtered = filtered.filter((item) => ((item.descricao || "") + " " + (item.cliente || "")).toLowerCase().includes(busca));
  if (filtroCategoria) filtered = filtered.filter((item) => item.categoria === filtroCategoria);
  renderContaReceberStatusTabs(filtered);
  filtered = filtered.filter((item) => normalizeContaReceberStatus(item) === contaReceberStatusTabAtual);
  document.getElementById("tab-count-contas-receber").textContent = filtered.length;

  const hojeCr = new Date().toISOString().slice(0, 10);
  const totalAberto = contasReceber.filter((item) => item.status !== "recebida").reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalRecebido = contasReceber.filter((item) => item.status === "recebida").reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const pendentesConc = contasReceber.filter((item) => item.conciliacao?.status === "pendente_api_bancaria").length;
  const atrasadasCr = contasReceber.filter((item) => item.status !== "recebida" && item.vencimento && item.vencimento < hojeCr);
  const abertoEl = document.getElementById("cr-kpi-aberto");
  const recebidoEl = document.getElementById("cr-kpi-recebido");
  const concEl = document.getElementById("cr-kpi-conciliacao");
  const atrasadasCrEl = document.getElementById("cr-kpi-atrasadas");
  if (abertoEl) abertoEl.textContent = brl.format(totalAberto);
  if (recebidoEl) recebidoEl.textContent = brl.format(totalRecebido);
  if (concEl) concEl.textContent = pendentesConc;
  if (atrasadasCrEl) atrasadasCrEl.textContent = atrasadasCr.length;

  if (!filtered.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  tbody.innerHTML = filtered.map((item) => `
    <tr>
      <td style="position:relative;white-space:nowrap">
        <input type="checkbox" class="cr-check" value="${item.id}" onchange="atualizarSelecaoContasReceber()">
        <button style="font-size:1.1rem;background:none;border:none;cursor:pointer;color:var(--mut);padding:0 .2rem;vertical-align:middle" onclick="toggleCrMenu('${item.id}',event)">⋯</button>
        <div id="cr-menu-${item.id}" class="hidden" style="position:absolute;top:100%;left:0;z-index:1020;background:var(--bg);border:1px solid var(--bdr);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);min-width:170px;padding:.4rem 0">
          ${item.status !== "recebida" ? `<a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--fg)" onclick="registrarBaixaRecebimento('${item.id}');closeCrMenus()">Receber (Baixar)</a>` : ""}
          ${item.status === "recebida" ? `<a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--yellow,#eab308)" onclick="estornarContaReceber('${item.id}');closeCrMenus()">Estornar</a>` : ""}
          <a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--fg)" onclick="dispararCobrancaAutomatica('${item.id}');closeCrMenus()">Cobrar</a>
          <a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--fg)" onclick="clonarContaReceber('${item.id}');closeCrMenus()">Clonar</a>
          <a style="display:block;padding:.45rem 1rem;font-size:.82rem;cursor:pointer;color:var(--red,#f44)" onclick="excluirContaReceber('${item.id}');closeCrMenus()">Excluir</a>
        </div>
      </td>
      <td style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--mut)" onclick="abrirDetalheCr('${item.id}')">${esc(item.descricao)}</td>
      <td>${esc(formatCategoriaLabel(item.categoria))}</td>
      <td>${esc(item.cliente || "-")}</td>
      <td>${esc(item.forma)}<div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">${esc(item.integracoes?.bancaria?.provider || item.cobranca?.provider || "-")}</div></td>
      <td>${fmtDate(item.vencimento)}</td>
      <td class="text-right font-mono">${brl.format(item.valor || 0)}</td>
      <td>${(() => {
        const status = getContaReceberStatusMeta(item);
        return `<span class="badge ${status.className}">${esc(status.label)}</span>`;
      })()}</td>
      <td style="font-size:.76rem;color:var(--mut)">${esc(formatAuditStamp(item.audit, item.recebidaEm, item.audit?.updatedBy))}</td>
    </tr>
  `).join("");
}

function renderContaPagarStatusTabs(items = contasPagar) {
  const container = document.getElementById("contas-pagar-status-tabs");
  if (!container) return;
  container.innerHTML = CONTAS_PAGAR_STATUS_TABS.map((tab) => {
    const count = items.filter((item) => normalizeContaPagarStatus(item) === tab.key).length;
    const active = contaPagarStatusTabAtual === tab.key;
    return `<button class="btn ${active ? 'btn-green' : 'btn-outline'} btn-sm" onclick="setContaPagarStatusTab('${tab.key}')">${tab.label} <span style="margin-left:.35rem;opacity:.8">${count}</span></button>`;
  }).join("");
}

function setContaPagarStatusTab(status) {
  contaPagarStatusTabAtual = status;
  renderContasPagar();
}

function renderContaReceberStatusTabs(items = contasReceber) {
  const container = document.getElementById("contas-receber-status-tabs");
  if (!container) return;
  container.innerHTML = CONTAS_RECEBER_STATUS_TABS.map((tab) => {
    const count = items.filter((item) => normalizeContaReceberStatus(item) === tab.key).length;
    const active = contaReceberStatusTabAtual === tab.key;
    return `<button class="btn ${active ? 'btn-green' : 'btn-outline'} btn-sm" onclick="setContaReceberStatusTab('${tab.key}')">${tab.label} <span style="margin-left:.35rem;opacity:.8">${count}</span></button>`;
  }).join("");
}

function setContaReceberStatusTab(status) {
  contaReceberStatusTabAtual = status;
  renderContasReceber();
}

function getCaixaResumo() {
  const entradas = caixaExtratoMovimentos.filter((item) => Number(item.valor || 0) > 0).reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const saidas = caixaExtratoMovimentos.filter((item) => Number(item.valor || 0) < 0).reduce((sum, item) => sum + Math.abs(Number(item.valor || 0)), 0);
  const divergencias = caixaExtratoMovimentos.filter((item) => !item.conciliacao?.matched).length;
  const conciliados = caixaExtratoMovimentos.filter((item) => item.conciliacao?.matched).length;
  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
    divergencias,
    conciliados
  };
}

function renderCaixa() {
  const tbody = document.getElementById("caixa-extrato-tbody");
  const empty = document.getElementById("caixa-extrato-empty");
  const resumo = getCaixaResumo();
  const saldoEl = document.getElementById("caixa-kpi-saldo");
  const entradasEl = document.getElementById("caixa-kpi-entradas");
  const saidasEl = document.getElementById("caixa-kpi-saidas");
  const divergenciasEl = document.getElementById("caixa-kpi-divergencias");
  if (saldoEl) saldoEl.textContent = brl.format(resumo.saldo);
  if (entradasEl) entradasEl.textContent = brl.format(resumo.entradas);
  if (saidasEl) saidasEl.textContent = brl.format(resumo.saidas);
  if (divergenciasEl) divergenciasEl.textContent = resumo.divergencias;
  if (!tbody) return;
  if (!caixaExtratoMovimentos.length) {
    tbody.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
  } else {
    if (empty) empty.classList.add("hidden");
    tbody.innerHTML = caixaExtratoMovimentos
      .slice()
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))
      .map((item) => {
        const matched = !!item.conciliacao?.matched;
        return `<tr>
          <td class="nowrap">${esc(item.data || "")}</td>
          <td>${esc(item.descricao || item.historico || "-")}</td>
          <td>${esc(item.origem || item.provider || "api_bancaria")}</td>
          <td><span class="badge ${matched ? "badge-green" : "badge-yellow"}">${matched ? "Conciliado" : "Pendente"}</span><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">${esc(item.conciliacao?.referencia || item.id || "")}</div></td>
          <td class="text-right font-mono" style="color:${Number(item.valor || 0) >= 0 ? "var(--green)" : "var(--red)"}">${brl.format(Number(item.valor || 0))}</td>
        </tr>`;
      }).join("");
  }
  const resumoEl = document.getElementById("caixa-resumo-conciliacao");
  if (resumoEl) {
    resumoEl.innerHTML = [
      `<div style="display:flex;justify-content:space-between;gap:1rem"><span>Lancamentos conciliados</span><strong>${resumo.conciliados}</strong></div>`,
      `<div style="display:flex;justify-content:space-between;gap:1rem"><span>Lancamentos divergentes</span><strong>${resumo.divergencias}</strong></div>`,
      `<div style="display:flex;justify-content:space-between;gap:1rem"><span>Contas a receber em aberto</span><strong>${contasReceber.filter((item) => item.status !== "recebida").length}</strong></div>`,
      `<div style="display:flex;justify-content:space-between;gap:1rem"><span>Contas a pagar em aberto</span><strong>${contasPagar.filter((item) => item.status !== "paga").length}</strong></div>`
    ].join("");
  }
  const pendenciasEl = document.getElementById("caixa-pendencias-lista");
  if (pendenciasEl) {
    const pendencias = [];
    contasReceber.filter((item) => item.status !== "recebida" && item.conciliacao?.status === "divergencia_api_bancaria").slice(0, 4).forEach((item) => {
      pendencias.push(`<div style="padding:.75rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)"><strong>${esc(item.descricao)}</strong><div style="font-size:.75rem;color:var(--mut);margin-top:.2rem">Receber | ${esc(item.cliente || "-")} | ${brl.format(item.valor || 0)}</div></div>`);
    });
    caixaExtratoMovimentos.filter((item) => !item.conciliacao?.matched).slice(0, 4).forEach((item) => {
      pendencias.push(`<div style="padding:.75rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)"><strong>${esc(item.descricao || item.historico || "Lancamento bancario")}</strong><div style="font-size:.75rem;color:var(--mut);margin-top:.2rem">Extrato | ${esc(item.data || "")} | ${brl.format(Number(item.valor || 0))}</div></div>`);
    });
    pendenciasEl.innerHTML = pendencias.length ? pendencias.join("") : `<div style="padding:.9rem;border:1px dashed var(--bdr);border-radius:12px;color:var(--mut)">Sem pendencias relevantes de conciliacao.</div>`;
  }
}

async function sincronizarExtratoCaixaViaApi() {
  try {
    const resp = await fetch("/api/bank-reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync-statement",
        bankConfig: getBankApiConfig(),
        contasReceber,
        contasPagar,
        extratoAtual: caixaExtratoMovimentos
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    caixaExtratoMovimentos = Array.isArray(data.items) ? data.items : [];
    saveCaixaExtrato();
    renderCaixa();
    showToast(`Extrato sincronizado via API: ${caixaExtratoMovimentos.length} movimento(s).`, 3500);
  } catch (err) {
    showToast(`Falha ao sincronizar extrato: ${err.message}`, 4500);
  }
}

async function conciliarCaixaViaApi() {
  try {
    const resp = await fetch("/api/bank-reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reconcile",
        bankConfig: getBankApiConfig(),
        contasReceber,
        contasPagar,
        statementItems: caixaExtratoMovimentos
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    caixaExtratoMovimentos = Array.isArray(data.items) ? data.items : caixaExtratoMovimentos;
    saveCaixaExtrato();
    renderCaixa();
    showToast(`Conciliação concluida: ${Number(data.matchedCount || 0)} match(es).`, 3500);
  } catch (err) {
    showToast(`Falha na conciliacao: ${err.message}`, 4500);
  }
}

function renderRelatorios() {
  // Filtrar itens cancelados dos relatórios
  const contasReceberAtivas = contasReceber.filter(c => c.status !== "cancelada");
  const contasPagarAtivas = contasPagar.filter(c => c.status !== "cancelada");
  const notasFiscaisAtivas = notasFiscais.filter(nf => nf.status !== "cancelada");
  const fluxoMap = new Map();
  contasReceberAtivas.forEach((item) => {
    const data = String(item.recebidaEm || item.vencimento || "").slice(0, 10);
    if (!data) return;
    const row = fluxoMap.get(data) || { data, entradas: 0, saidas: 0 };
    row.entradas += Number(item.valor || 0);
    fluxoMap.set(data, row);
  });
  contasPagarAtivas.forEach((item) => {
    const data = String(item.pagaEm || item.vencimento || "").slice(0, 10);
    if (!data) return;
    const row = fluxoMap.get(data) || { data, entradas: 0, saidas: 0 };
    row.saidas += Number(item.valor || 0);
    fluxoMap.set(data, row);
  });
  const fluxoRows = [...fluxoMap.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  let saldoAcumulado = 0;
  const fluxoTbody = document.getElementById("rel-fluxo-tbody");
  if (fluxoTbody) {
    fluxoTbody.innerHTML = fluxoRows.map((row) => {
      saldoAcumulado += row.entradas - row.saidas;
      return `<tr><td>${esc(row.data)}</td><td class="text-right font-mono">${brl.format(row.entradas)}</td><td class="text-right font-mono">${brl.format(row.saidas)}</td><td class="text-right font-mono">${brl.format(saldoAcumulado)}</td></tr>`;
    }).join("");
  }
  const categoriaMap = new Map();
  contasReceberAtivas.forEach((item) => {
    const key = item.categoria || "sem_categoria";
    const row = categoriaMap.get(key) || { categoria: key, entradas: 0, saidas: 0 };
    row.entradas += Number(item.valor || 0);
    categoriaMap.set(key, row);
  });
  contasPagarAtivas.forEach((item) => {
    const key = item.categoria || "sem_categoria";
    const row = categoriaMap.get(key) || { categoria: key, entradas: 0, saidas: 0 };
    row.saidas += Number(item.valor || 0);
    categoriaMap.set(key, row);
  });
  const categoriasTbody = document.getElementById("rel-categorias-tbody");
  if (categoriasTbody) {
    categoriasTbody.innerHTML = [...categoriaMap.values()]
      .sort((a, b) => formatCategoriaLabel(a.categoria).localeCompare(formatCategoriaLabel(b.categoria), "pt-BR"))
      .map((row) => `<tr><td>${esc(formatCategoriaLabel(row.categoria))}</td><td class="text-right font-mono">${brl.format(row.entradas)}</td><td class="text-right font-mono">${brl.format(row.saidas)}</td><td class="text-right font-mono">${brl.format(row.entradas - row.saidas)}</td></tr>`)
      .join("");
  }
  const totalEntradas = contasReceberAtivas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalSaidas = contasPagarAtivas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const lucroBruto = notasFiscaisAtivas.reduce((sum, nf) => sum + Number(nf.valor || 0), 0);
  const despesasOperacionais = contasPagarAtivas
    .filter((item) => ["operacional", "servico", "comissao", "frete"].includes(item.categoria))
    .reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const resultadoOperacional = lucroBruto - totalSaidas;
  const dreBody = document.getElementById("rel-dre-body");
  if (dreBody) {
    dreBody.innerHTML = [
      { label: "Receita Bruta", value: lucroBruto, color: "var(--green)" },
      { label: "Entradas Financeiras", value: totalEntradas, color: "var(--green)" },
      { label: "Despesas Operacionais", value: -despesasOperacionais, color: "var(--red)" },
      { label: "Total de Saidas", value: -totalSaidas, color: "var(--red)" },
      { label: "Resultado Operacional", value: resultadoOperacional, color: resultadoOperacional >= 0 ? "var(--blue)" : "var(--yellow)" }
    ].map((row) => `<div style="display:flex;justify-content:space-between;gap:1rem;padding:.7rem .85rem;border:1px solid var(--bdr);border-radius:10px;background:var(--s1)"><span>${row.label}</span><strong style="color:${row.color}">${brl.format(row.value)}</strong></div>`).join("");
  }
  const fluxoEl = document.getElementById("rel-kpi-fluxo");
  const entradasEl = document.getElementById("rel-kpi-entradas");
  const saidasEl = document.getElementById("rel-kpi-saidas");
  const dreEl = document.getElementById("rel-kpi-dre");
  if (fluxoEl) fluxoEl.textContent = brl.format(totalEntradas - totalSaidas);
  if (entradasEl) entradasEl.textContent = brl.format(totalEntradas);
  if (saidasEl) saidasEl.textContent = brl.format(totalSaidas);
  if (dreEl) dreEl.textContent = brl.format(resultadoOperacional);
}

// ===== LISTA DE COMPRAS =====
// FIX Story 4.17: var para evitar temporal dead zone (initGDP listener pode acessar antes)
var _selectedPedidoIds = new Set();
var _listaComprasData = [];
var _selectedNotaFiscalIds = new Set();
var PEDIDO_STATUS_TABS = [
  { key: "em_aberto", label: "Em Aberto", className: "badge-yellow" },
  { key: "agendado", label: "Agendado", className: "badge-blue" },
  { key: "preparando_envio", label: "Preparando Envio", className: "badge-yellow" },
  { key: "pronto_para_envio", label: "Pronto para Envio", className: "badge-blue" },
  { key: "faturado", label: "Faturado", className: "badge-green" },
  { key: "entregue", label: "Entregue", className: "badge-green" },
  { key: "nao_entregue", label: "Não Entregue", className: "badge-red" },
  { key: "cancelado", label: "Cancelado", className: "badge-red" }
];
var pedidoStatusTabAtual = "em_aberto";
var pedidoMenuAtualId = null;
var pedidoStatusMenuExpandido = false;
var pedidoEditId = null;
var NOTA_FISCAL_STATUS_TABS = [
  { key: "todas", label: "Todas", className: "badge-blue" },
  { key: "pendente", label: "Pendentes", className: "badge-yellow" },
  { key: "emitida", label: "Emitidas", className: "badge-green" },
  { key: "cancelada", label: "Canceladas", className: "badge-red" },
  { key: "inutilizada", label: "Inutilizadas", className: "badge-blue" }
];
var notaFiscalStatusTabAtual = "todas";
var notaFiscalMenuAtualId = null;
var CONTAS_PAGAR_STATUS_TABS = [
  { key: "emitida", label: "Emitidas", className: "badge-blue" },
  { key: "em_aberto", label: "Em Aberto", className: "badge-yellow" },
  { key: "paga", label: "Pagas", className: "badge-green" },
  { key: "atrasada", label: "Atrasadas", className: "badge-red" }
];
var contaPagarStatusTabAtual = "em_aberto";
var CONTAS_RECEBER_STATUS_TABS = [
  { key: "emitida", label: "Emitidas", className: "badge-blue" },
  { key: "em_aberto", label: "Em Aberto", className: "badge-yellow" },
  { key: "recebida", label: "Recebidas", className: "badge-green" },
  { key: "atrasada", label: "Atrasadas", className: "badge-red" }
];
var contaReceberStatusTabAtual = "em_aberto";

function normalizePedidoStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "em_aberto";
  if (normalized === "recebido") return "em_aberto";
  if (normalized === "concluido") return "faturado";
  if (normalized === "entregue" || normalized === "entrega_confirmada") return "entregue";
  if (normalized === "cancelado" || normalized === "cancelada") return "cancelado";
  if (normalized === "nao_entregue" || normalized === "devolvido") return "nao_entregue";
  return normalized;
}

function getPedidoStatusMeta(status) {
  const normalized = normalizePedidoStatus(status);
  return PEDIDO_STATUS_TABS.find((item) => item.key === normalized) || PEDIDO_STATUS_TABS[0];
}

function setPedidoStatusTab(status) {
  pedidoStatusTabAtual = status;
  renderPedidos();
}

function renderPedidosStatusTabs(items = pedidos) {
  const container = document.getElementById("pedidos-status-tabs");
  if (!container) return;
  const safeItems = Array.isArray(items) ? items : [];
  const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  container.innerHTML = PEDIDO_STATUS_TABS.map((tab) => {
    const tabItems = safeItems.filter((item) => normalizePedidoStatus(item.status) === tab.key);
    const count = tabItems.length;
    const cor = PEDIDO_STATUS_COLORS[tab.key] || '#94a3b8';
    const active = pedidoStatusTabAtual === tab.key;
    return `<button class="btn ${active ? 'btn-green' : 'btn-outline'} btn-sm" onclick="setPedidoStatusTab('${tab.key}')" style="display:flex;align-items:center;gap:.45rem;padding:.4rem .8rem;${active ? '' : 'font-weight:700'}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor}"></span><span style="font-size:.78rem">${tab.label}</span><span style="font-size:.82rem;font-weight:800;opacity:.85">${count.toString().padStart(2,'0')}</span></button>`;
  }).join("");
  // Totais rodapé — filtrar pela aba de status ativa
  const activeTabItems = safeItems.filter((item) => normalizePedidoStatus(item.status) === pedidoStatusTabAtual);
  const totalQtd = activeTabItems.length;
  const totalValor = activeTabItems.reduce((s, p) => s + (p.valor || p.totalGeral || p.valorTotal || 0), 0);
  let footer = document.getElementById("pedidos-totais-footer");
  if (!footer) {
    footer = document.createElement("div");
    footer.id = "pedidos-totais-footer";
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:2rem;padding:.5rem 1rem;font-size:.82rem;color:var(--mut)";
    container.parentElement.appendChild(footer);
  }
  footer.innerHTML = `<span>quantidade <strong style="color:var(--txt);font-size:.95rem">${totalQtd.toString().padStart(2,'0')}</strong></span><span>valor total (R$) <strong style="color:var(--txt);font-size:.95rem">${brlFmt.format(totalValor)}</strong></span>`;
}

function getPedidoIntegracoesResumo(pedido) {
  const nf = getNotaFiscalByPedido(pedido.id);
  const conta = nf ? getContaReceberByNota(nf.id) : null;
  const notaOk = !!nf;
  const cobrancaOk = !!(conta && (conta.cobranca?.providerChargeId || conta.integracoes?.bancaria?.providerChargeId || conta.integracoes?.comunicacao?.status || conta.status === "recebida" || conta.status === "cobranca_automatica_disparada"));
  return {
    html: `
      <div style="display:flex;gap:.45rem;align-items:center">
        <span title="${notaOk ? 'Nota fiscal emitida' : 'Nota fiscal pendente'}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${notaOk ? 'rgba(245,158,11,.22)' : 'rgba(148,163,184,.18)'};color:${notaOk ? 'var(--yellow)' : 'var(--mut)'};font-weight:800;font-size:.8rem;border:1px solid ${notaOk ? 'rgba(245,158,11,.35)' : 'rgba(148,163,184,.2)'}">N</span>
        <span title="${cobrancaOk ? 'Cobranca bancaria automatica gerada' : 'Cobranca bancaria pendente'}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${cobrancaOk ? 'rgba(34,197,94,.18)' : 'rgba(148,163,184,.18)'};color:${cobrancaOk ? 'var(--green)' : 'var(--mut)'};font-weight:800;font-size:.8rem;border:1px solid ${cobrancaOk ? 'rgba(34,197,94,.35)' : 'rgba(148,163,184,.2)'}">C</span>
      </div>`
  };
}

function abrirMenuPedido(id) {
  const pedido = pedidos.find((item) => item.id === id);
  if (!pedido) return;
  pedidoMenuAtualId = id;
  pedidoStatusMenuExpandido = false;
  document.getElementById("pedido-side-menu-nome").textContent = `${pedido.id} • ${pedido.escola || ""}`;
  document.getElementById("pedido-status-menu-options").innerHTML = PEDIDO_STATUS_TABS.map((tab) => {
    const cor = PEDIDO_STATUS_COLORS[tab.key] || '#94a3b8';
    const ativo = normalizePedidoStatus(pedido.status) === tab.key;
    return '<div style="position:relative;display:inline-block" onmouseenter="this.querySelector(\'.dot-tip\').style.opacity=1;this.querySelector(\'.dot-tip\').style.transform=\'translateX(-50%) translateY(0)\'" onmouseleave="this.querySelector(\'.dot-tip\').style.opacity=0;this.querySelector(\'.dot-tip\').style.transform=\'translateX(-50%) translateY(4px)\'">'
      + '<div class="dot-tip" style="position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%) translateY(4px);background:var(--bg);border:1px solid var(--bdr);border-radius:6px;padding:.25rem .5rem;font-size:.72rem;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s,transform .15s;z-index:10;color:var(--txt)">' + tab.label + '</div>'
      + '<button onclick="alterarStatusPedido(\'' + id + '\',\'' + tab.key + '\')" style="width:26px;height:26px;border-radius:50%;border:2px solid ' + (ativo ? '#fff' : 'rgba(255,255,255,.15)') + ';background:' + cor + ';cursor:pointer;transition:transform .12s,box-shadow .12s;' + (ativo ? 'box-shadow:0 0 8px ' + cor + '80;transform:scale(1.15)' : '') + '" onmouseenter="this.style.transform=\'scale(1.2)\';this.style.boxShadow=\'0 0 8px ' + cor + '80\'" onmouseleave="this.style.transform=\'' + (ativo ? 'scale(1.15)' : 'scale(1)') + '\';this.style.boxShadow=\'' + (ativo ? '0 0 8px ' + cor + '80' : 'none') + '\'" title="' + tab.label + '"></button></div>';
  }).join("");
  document.getElementById("pedido-status-menu-panel").classList.add("hidden");
  document.getElementById("pedido-status-toggle-icon").textContent = "+";
  document.getElementById("pedido-side-menu").classList.remove("hidden");
}

function fecharMenuPedido() {
  pedidoMenuAtualId = null;
  pedidoStatusMenuExpandido = false;
  document.getElementById("pedido-side-menu").classList.add("hidden");
}

function togglePedidoStatusMenu() {
  const panel = document.getElementById("pedido-status-menu-panel");
  const icon = document.getElementById("pedido-status-toggle-icon");
  if (!panel || !icon) return;
  pedidoStatusMenuExpandido = !pedidoStatusMenuExpandido;
  panel.classList.toggle("hidden", !pedidoStatusMenuExpandido);
  icon.textContent = pedidoStatusMenuExpandido ? "-" : "+";
}

function imprimirPedidoAtualMenu() {
  if (!pedidoMenuAtualId) return;
  const id = pedidoMenuAtualId;
  fecharMenuPedido();
  imprimirPedido(id);
}

function clonarPedidoAtualMenu() {
  if (!pedidoMenuAtualId) return;
  const id = pedidoMenuAtualId;
  fecharMenuPedido();
  clonarPedido(id);
}

function excluirPedidoAtualMenu() {
  if (!pedidoMenuAtualId) return;
  const id = pedidoMenuAtualId;
  fecharMenuPedido();
  excluirPedido(id);
}

function alterarStatusPedido(pedidoId, novoStatus) {
  const p = pedidos.find((item) => item.id === pedidoId);
  if (!p) return;
  p.status = novoStatus;
  if (!p.obs) p.obs = getObsContrato(p.contratoId);
  savePedidos();
  renderAll();
  fecharMenuPedido();
  showToast(`Pedido ${pedidoId} movido para ${getPedidoStatusMeta(novoStatus).label}.`, 3000);
}

function toggleSelectAllPedidos() {
  const checked = document.getElementById("pedidos-select-all").checked;
  document.querySelectorAll(".pedido-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoPedidos();
}

function atualizarSelecaoPedidos() {
  _selectedPedidoIds.clear();
  document.querySelectorAll(".pedido-check:checked").forEach(cb => { _selectedPedidoIds.add(cb.value); });
  const count = _selectedPedidoIds.size;
  const badge = document.getElementById("pedidos-sel-count");
  const btn = document.getElementById("btn-gerar-lista");
  const bulkBar = document.getElementById("pedidos-bulk-actions");
  const bulkSummary = document.getElementById("pedidos-bulk-summary");
  if (count > 0) {
    if (badge) { badge.textContent = count + " protocolo" + (count > 1 ? "s" : "") + " selecionado" + (count > 1 ? "s" : ""); badge.style.display = ""; }
    if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.title = "Gerar lista de compras dos protocolos selecionados"; }
    if (bulkBar) { bulkBar.classList.remove("hidden"); bulkSummary.textContent = count + " pedido(s) selecionado(s)"; }
  } else {
    if (badge) badge.style.display = "none";
    if (btn) { btn.disabled = true; btn.style.opacity = ".5"; btn.title = "Selecione ao menos 1 protocolo"; }
    if (bulkBar) bulkBar.classList.add("hidden");
  }
  // Sync header checkbox
  const allChecks = document.querySelectorAll(".pedido-check");
  const allChecked = allChecks.length > 0 && [...allChecks].every(cb => cb.checked);
  const headerCb = document.getElementById("pedidos-select-all");
  if (headerCb) headerCb.checked = allChecked;
}

function gerarListaCompras() {
  if (_selectedPedidoIds.size === 0) { showToast("Selecione ao menos 1 protocolo.", 3000); return; }

  const selectedPedidos = pedidos.filter(p => _selectedPedidoIds.has(p.id));
  const consolidado = new Map();

  for (const p of selectedPedidos) {
    for (const item of (p.itens || [])) {
      const desc = (item.descricao || "").trim();
      const sku = (item.sku || item.codigo || "").trim();
      const key = sku ? sku.toUpperCase() : desc.toLowerCase();
      if (!key) continue;

      if (consolidado.has(key)) {
        const existing = consolidado.get(key);
        existing.qtd += (item.qtd || item.quantidade || 0);
        if (!existing.protocolos.includes(p.id)) existing.protocolos.push(p.id);
      } else {
        consolidado.set(key, {
          descricao: desc,
          sku: sku,
          unidade: item.unidade || item.un || "UN",
          qtd: item.qtd || item.quantidade || 0,
          protocolos: [p.id]
        });
      }
    }
  }

  _listaComprasData = [...consolidado.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  renderListaCompras(_listaComprasData);
}

function renderListaCompras(itens) {
  const tbody = document.getElementById("lista-compras-tbody");
  tbody.innerHTML = itens.map((item, i) => `<tr>
    <td class="text-center">${i + 1}</td>
    <td>${esc(item.descricao)}</td>
    <td class="font-mono">${esc(item.sku || '-')}</td>
    <td class="text-center">${esc(item.unidade)}</td>
    <td class="text-right font-mono" style="font-weight:700">${item.qtd}</td>
    <td style="font-size:.75rem;color:var(--mut)">${item.protocolos.map(id => esc(id)).join(', ')}</td>
  </tr>`).join("");

  const totalItens = itens.length;
  const totalQtd = itens.reduce((s, i) => s + i.qtd, 0);
  document.getElementById("lista-compras-total-itens").textContent = totalItens + " item" + (totalItens !== 1 ? " únicos" : " único");
  document.getElementById("lista-compras-total-qtd").textContent = "Quantidade total: " + totalQtd;
  document.getElementById("lista-compras-info").textContent = _selectedPedidoIds.size + " protocolo(s) selecionado(s) — " + new Date().toLocaleDateString('pt-BR');

  document.getElementById("modal-lista-compras").classList.remove("hidden");
}

function filtrarListaCompras() {
  const busca = (document.getElementById("busca-lista-compras")?.value || "").toLowerCase();
  const filtered = busca ? _listaComprasData.filter(i => i.descricao.toLowerCase().includes(busca) || (i.sku || "").toLowerCase().includes(busca)) : _listaComprasData;
  renderListaCompras(filtered);
}

function fecharListaCompras() {
  document.getElementById("modal-lista-compras").classList.add("hidden");
}

function enviarListaAoFornecedor() {
  if (!_listaComprasData || !_listaComprasData.length) { showToast("Lista vazia.", 3000); return; }
  // Agrupar por fornecedor
  const porFornecedor = new Map();
  _listaComprasData.forEach(item => {
    const forn = item.fornecedor || "Sem fornecedor";
    if (!porFornecedor.has(forn)) porFornecedor.set(forn, []);
    porFornecedor.get(forn).push(item);
  });
  const fornecedores = [...porFornecedor.keys()];
  if (fornecedores.length === 1 && fornecedores[0] === "Sem fornecedor") {
    showToast("Nenhum fornecedor vinculado aos produtos. Cadastre fornecedores na aba Inteligencia.", 4000);
    return;
  }
  // Para cada fornecedor, gerar pedido de compra
  let gerados = 0;
  porFornecedor.forEach((itens, fornNome) => {
    if (fornNome === "Sem fornecedor") return;
    const forn = estoqueIntelFornecedores.find(f => (f.nome || f.razaoSocial || "") === fornNome);
    const pedidoCompra = {
      id: genId("PC"),
      fornecedor: fornNome,
      fornecedorId: forn?.id || "",
      email: forn?.email || "",
      itens: itens.map(i => ({ descricao: i.descricao, sku: i.sku, unidade: i.unidade, qtd: i.qtd, precoUnitario: i.precoUnitario || 0 })),
      valorTotal: itens.reduce((s, i) => s + (i.qtd * (i.precoUnitario || 0)), 0),
      status: "gerado",
      criadoEm: new Date().toISOString(),
      origem: "lista_compras"
    };
    estoqueIntelCompras.push(pedidoCompra);
    gerados++;
    // Tentar enviar por email se fornecedor tem email
    if (forn?.email) {
      fetch("/api/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: forn.email,
          schoolName: "Lariucci — Pedido de Compra",
          protocol: pedidoCompra.id,
          date: new Date().toLocaleDateString("pt-BR"),
          total: pedidoCompra.valorTotal,
          items: pedidoCompra.itens.map(i => ({ description: i.descricao, qty: i.qtd, unitPrice: i.precoUnitario })),
          obs: "Pedido de compra gerado automaticamente"
        })
      }).catch(() => {});
    }
  });
  saveEstoqueIntelCompras();
  renderEstoque();
  const semFornecedor = porFornecedor.get("Sem fornecedor")?.length || 0;
  showToast(`${gerados} pedido(s) de compra gerado(s).${semFornecedor ? ` ${semFornecedor} item(ns) sem fornecedor (nao enviados).` : ""}`, 4000);
}

/* ── Lista de Compras: Gerar a partir de Pedidos e Demandas ── */
var _listaComprasOrigem = []; // pedidos ou demandas usados na lista
var _listaComprasModo = "produtos";

function gerarListaComprasDePedidos() {
  if (_selectedPedidoIds.size === 0) { showToast("Selecione ao menos 1 pedido.", 3000); return; }
  _listaComprasOrigem = pedidos.filter(p => _selectedPedidoIds.has(p.id));
  _listaComprasData = consolidarItensParaLista(_listaComprasOrigem);
  document.getElementById("lista-compras-info").textContent = _selectedPedidoIds.size + " pedido(s) — " + new Date().toLocaleDateString("pt-BR");
  document.getElementById("modal-lista-compras").classList.remove("hidden");
  renderListaComprasAtual();
}

var _selectedDemandaIds = new Set();

function toggleSelectAllDemandas() {
  const checked = document.getElementById("demandas-select-all")?.checked;
  document.querySelectorAll(".demanda-check").forEach(cb => { cb.checked = checked; });
  atualizarSelecaoDemandas();
}

function atualizarSelecaoDemandas() {
  _selectedDemandaIds.clear();
  document.querySelectorAll(".demanda-check:checked").forEach(cb => { _selectedDemandaIds.add(cb.value); });
  const count = _selectedDemandaIds.size;
  const bar = document.getElementById("demandas-bulk-actions");
  const countEl = document.getElementById("demandas-bulk-count");
  if (bar) { bar.classList.toggle("hidden", count === 0); if (count > 0) bar.style.display = "flex"; else bar.style.display = ""; }
  if (countEl) countEl.textContent = count + " demanda(s) selecionada(s)";
  const selectAll = document.getElementById("demandas-select-all");
  if (selectAll) {
    const total = document.querySelectorAll(".demanda-check").length;
    selectAll.checked = count > 0 && count === total;
    selectAll.indeterminate = count > 0 && count < total;
  }
}

function gerarListaComprasDeDemandas() {
  if (_selectedDemandaIds.size === 0) { showToast("Selecione ao menos 1 demanda.", 3000); return; }
  // Suporta demandas do estoque intel (estoqueIntelPedidos) E demandas GDP (gdpDemandas)
  const eiDemandas = estoqueIntelPedidos.filter(d => _selectedDemandaIds.has(d.id));
  const gdpDems = gdpDemandas.filter(d => _selectedDemandaIds.has(d.id));
  _listaComprasOrigem = [];
  // Converter demandas estoque intel
  eiDemandas.forEach(d => {
    const itensDemanda = estoqueIntelPedidoItens.filter(pi => pi.pedido_id === d.id);
    // Buscar pedido original para usar descrição exata do cliente
    const pedidoOrig = pedidos.find(pp => pp.id === (d.origem_pedido_id || d.id));
    const pedidoItensOrig = pedidoOrig?.itens || [];
    _listaComprasOrigem.push({
      id: d.id,
      escola: d.cliente || d.origem || "",
      cliente: pedidoOrig?.cliente || null,
      dataPrevista: d.data_prevista || d.data || "",
      itens: itensDemanda.map(pi => {
        const prod = estoqueIntelProdutos.find(p => p.id === pi.produto_id);
        const emb = estoqueIntelEmbalagens.find(e => e.produto_id === pi.produto_id);
        // Buscar descrição exata do pedido do cliente por match de nome
        const nomeProd = (prod?.nome || '').toLowerCase();
        const itemOrig = nomeProd ? pedidoItensOrig.find(oi => { const desc = (oi.descricao || '').toLowerCase(); return desc.includes(nomeProd) || nomeProd.includes(desc); }) : null;
        return {
          descricao: itemOrig?.descricao || prod?.nome || pi.descricao || "",
          sku: prod?.sku || emb?.codigo_barras || "",
          unidade: prod?.unidade_base || "UN",
          qtd: Number(pi.quantidade_base || 0),
          qtdOriginal: itemOrig ? Number(itemOrig.qtd || itemOrig.quantidade || 0) : 0,
          precoUnitario: emb?.preco_referencia || 0
        };
      })
    });
  });
  // Converter demandas GDP
  gdpDems.forEach(d => {
    _listaComprasOrigem.push({
      id: d.id,
      escola: d.escola,
      dataPrevista: d.criadoEm,
      itens: (d.itens || []).map(i => ({
        descricao: i.produtoReal || i.descricao || "",
        sku: i.skuProduto || i.sku || "",
        unidade: i.unidadeCompra || i.unidade || "UN",
        qtd: i.qtdConvertida || i.qtd || 0,
        precoUnitario: i.custoUnitario || i.precoUnitario || 0
      }))
    });
  });
  // Auto-preencher filtro de data com a próxima data prevista das demandas selecionadas
  const datasDisponiveis = _listaComprasOrigem.map(p => (p.dataPrevista || "").slice(0, 10)).filter(Boolean).sort();
  const hoje = new Date().toISOString().slice(0, 10);
  const proximaData = datasDisponiveis.find(d => d >= hoje) || datasDisponiveis[datasDisponiveis.length - 1] || hoje;
  const filtroDataEl = document.getElementById("lista-compras-filtro-data");
  if (filtroDataEl && !filtroDataEl.value) filtroDataEl.value = proximaData;
  _listaComprasData = consolidarItensParaLista(_listaComprasOrigem);
  document.getElementById("lista-compras-info").textContent = _selectedDemandaIds.size + " demanda(s) — " + new Date().toLocaleDateString("pt-BR");
  document.getElementById("modal-lista-compras").classList.remove("hidden");
  renderListaComprasAtual();
}

function consolidarItensParaLista(origens, skipDateFilter) {
  const filtroData = document.getElementById("lista-compras-filtro-data")?.value || "";
  let filtered = origens;
  // Filtro de data obrigatório — sem data, retorna vazio (exceto quando já filtrado externamente)
  if (!skipDateFilter) {
    if (!filtroData) return [];
  }
  filtered = skipDateFilter ? filtered : filtered.filter(p => {
    const raw = p.dataPrevista || p.dataEntrega || p.data || "";
    if (!raw) return false;
    let dateISO = raw;
    if (raw.includes("/")) {
      const parts = raw.split("/");
      dateISO = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}` : raw;
    }
    return dateISO.slice(0, 10) === filtroData;
  });
  const consolidado = new Map();
  for (const p of filtered) {
    for (const item of (p.itens || [])) {
      const desc = (item.descricao || "").trim();
      const sku = (item.sku || "").trim();
      const key = sku ? sku.toUpperCase() : desc.toLowerCase();
      if (!key) continue;
      if (consolidado.has(key)) {
        const ex = consolidado.get(key);
        ex.qtd += (item.qtd || 0);
        ex.qtdOriginal += (item.qtdOriginal || 0);
        ex.valorTotal += (item.qtd || 0) * (item.precoUnitario || 0);
        if (!ex.protocolos.includes(p.id)) ex.protocolos.push(p.id);
        if (p.escola && !ex.clientes.includes(p.escola)) ex.clientes.push(p.escola);
      } else {
        consolidado.set(key, {
          descricao: desc, sku, unidade: item.unidade || "UN",
          qtd: item.qtd || 0,
          qtdOriginal: item.qtdOriginal || 0,
          precoUnitario: item.precoUnitario || 0,
          valorTotal: (item.qtd || 0) * (item.precoUnitario || 0),
          protocolos: [p.id],
          clientes: p.escola ? [p.escola] : [],
          fornecedor: ""
        });
      }
    }
  }
  // Enriquecer com embalagem e conversão inteligente
  consolidado.forEach(item => {
    // Buscar produto no Estoque Intel
    const prod = estoqueIntelProdutos.find(p => (item.sku && p.sku === item.sku) || p.nome.toLowerCase() === item.descricao.toLowerCase());
    item.produtoEstoque = prod ? prod.nome : '—';
    item.baseUnidade = prod ? prod.unidade_base : item.unidade || 'UN';
    const embs = prod ? estoqueIntelEmbalagens.filter(e => e.produto_id === prod.id) : [];
    if (embs.length) {
      // Normalizar unidade: converter demanda para mesma unidade da embalagem
      const unidItem = (item.unidade || "UN").toUpperCase().trim();
      let qtdNorm = item.qtd;
      // Usar embalagem com maior quantidade_base (mais eficiente)
      const melhorEmb = embs.reduce((best, e) => (Number(e.quantidade_base || 0) > Number(best.quantidade_base || 0)) ? e : best, embs[0]);
      const qtdBase = Number(melhorEmb.quantidade_base || 1);
      // Conversão de unidade se necessário (KG↔G, L↔ML)
      const unidEmb = (melhorEmb.unidade || prod.unidade_base || "").toUpperCase().trim();
      if ((unidItem === "KG" || unidItem === "KG(S)") && (unidEmb === "G" || unidEmb === "GR")) {
        qtdNorm = item.qtd * 1000;
      } else if ((unidItem === "G" || unidItem === "GR") && (unidEmb === "KG" || unidEmb === "KG(S)")) {
        qtdNorm = item.qtd / 1000;
      } else if (unidItem === "L" && (unidEmb === "ML")) {
        qtdNorm = item.qtd * 1000;
      } else if (unidItem === "ML" && unidEmb === "L") {
        qtdNorm = item.qtd / 1000;
      }
      // Arredondar para evitar erros de ponto flutuante
      qtdNorm = Math.round(qtdNorm * 1000) / 1000;
      const qtdEmbalagens = Math.ceil(qtdNorm / qtdBase - 0.0001);
      const sobra = Math.round(((qtdEmbalagens * qtdBase) - qtdNorm) * 1000) / 1000;
      const custoEmb = Number(melhorEmb.preco_referencia || 0);
      item.embalagem = melhorEmb.descricao || (qtdBase + " " + (item.unidade || "UN"));
      item.qtdBase = qtdBase;
      item.qtdEmbalagens = qtdEmbalagens;
      item.sobra = sobra;
      item.custoEmbalagem = custoEmb;
      item.valorTotal = qtdEmbalagens * custoEmb;
      item.todasEmbalagens = embs;
    } else {
      item.embalagem = "—";
      item.qtdBase = 1;
      item.qtdEmbalagens = item.qtd;
      item.sobra = 0;
      item.custoEmbalagem = 0;
    }
    // Fornecedor
    const forn = estoqueIntelFornecedores.find(f => (f.produtos || []).some(fp => fp.toLowerCase().includes(item.descricao.toLowerCase())));
    if (forn) item.fornecedor = forn.nome || forn.razaoSocial || "";
  });
  return [...consolidado.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
}

function refreshListaComprasOrigem() {
  // Reconstruir _listaComprasOrigem com dados frescos (ex: dataPrevista atualizada)
  const idsAtivos = new Set(_listaComprasOrigem.map(p => p.id));
  _listaComprasOrigem = [];
  estoqueIntelPedidos.filter(d => idsAtivos.has(d.id)).forEach(d => {
    const itensDemanda = estoqueIntelPedidoItens.filter(pi => pi.pedido_id === d.id);
    const pedidoOrig = pedidos.find(pp => pp.id === (d.origem_pedido_id || d.id));
    const pedidoItensOrig = pedidoOrig?.itens || [];
    _listaComprasOrigem.push({
      id: d.id,
      escola: d.cliente || d.origem || "",
      cliente: pedidoOrig?.cliente || null,
      dataPrevista: d.data_prevista || d.data || "",
      itens: itensDemanda.map(pi => {
        const prod = estoqueIntelProdutos.find(p => p.id === pi.produto_id);
        const emb = estoqueIntelEmbalagens.find(e => e.produto_id === pi.produto_id);
        const nomeProd = (prod?.nome || '').toLowerCase();
        const itemOrig = nomeProd ? pedidoItensOrig.find(oi => { const desc = (oi.descricao || '').toLowerCase(); return desc.includes(nomeProd) || nomeProd.includes(desc); }) : null;
        return {
          descricao: itemOrig?.descricao || prod?.nome || pi.descricao || "",
          sku: prod?.sku || emb?.codigo_barras || "",
          unidade: prod?.unidade_base || "UN",
          qtd: Number(pi.quantidade_base || 0),
          qtdOriginal: itemOrig ? Number(itemOrig.qtd || itemOrig.quantidade || 0) : 0,
          precoUnitario: emb?.preco_referencia || 0
        };
      })
    });
  });
  // Adicionar demandas GDP ativas
  const gdpIds = [...idsAtivos].filter(id => gdpDemandas.some(d => d.id === id));
  gdpDemandas.filter(d => gdpIds.includes(d.id)).forEach(d => {
    _listaComprasOrigem.push({
      id: d.id, escola: d.escola, dataPrevista: d.criadoEm,
      itens: (d.itens || []).map(i => ({ descricao: i.produtoReal || i.descricao || "", sku: i.skuProduto || i.sku || "", unidade: i.unidadeCompra || i.unidade || "UN", qtd: i.qtdConvertida || i.qtd || 0, qtdOriginal: i.qtdOriginal || 0, precoUnitario: i.custoUnitario || i.precoUnitario || 0 }))
    });
  });
}

function renderListaComprasAtual() {
  const modo = document.getElementById("lista-compras-modo")?.value || "produtos";
  _listaComprasModo = modo;
  // Refresh dados frescos (dataPrevista pode ter mudado) e reconsolidar
  refreshListaComprasOrigem();
  _listaComprasData = consolidarItensParaLista(_listaComprasOrigem);
  const busca = (document.getElementById("busca-lista-compras")?.value || "").toLowerCase();
  let itens = busca ? _listaComprasData.filter(i => i.descricao.toLowerCase().includes(busca) || (i.sku || "").toLowerCase().includes(busca)) : _listaComprasData;

  const tbody = document.getElementById("lista-compras-tbody");
  const thead = tbody.closest("table").querySelector("thead tr");

  // Helper: render conversion columns for a list item
  function _listaRowConversao(r) {
    const embLabel = r.qtdEmbalagens ? r.qtdEmbalagens + ' emb. (' + (r.embalagem || '-') + ')' : '—';
    const sobraLabel = r.sobra > 0 ? '+' + r.sobra + ' ' + (r.baseUnidade || r.unidade || '') : '—';
    const sobraColor = r.sobra > 0 ? 'color:var(--yellow)' : 'color:var(--green)';
    return `<td style="font-size:.78rem">${esc(r.produtoEstoque || '—')}</td><td class="text-right font-mono">${r.qtdOriginal || '-'}</td><td class="text-right font-mono">${r.qtd}</td><td style="font-size:.78rem">${esc(r.baseUnidade || r.unidade || '—')}</td><td class="text-right font-mono" style="font-size:.78rem">${embLabel}</td><td class="text-right font-mono" style="${sobraColor};font-size:.78rem">${sobraLabel}</td>`;
  }
  const _convHeaders = '<th>Produto Estoque</th><th class="text-right">Qtd</th><th class="text-right">Quantidade</th><th>Base</th><th class="text-right">Qtd Emb.</th><th class="text-right">Sobra</th>';

  if (modo === "clientes-produtos") {
    thead.innerHTML = '<th>Cliente</th><th>Item Pedido</th>' + _convHeaders;
    // Consolidar POR CLIENTE (não usar dados globais que somam tudo)
    const filtroData = document.getElementById("lista-compras-filtro-data")?.value || "";
    const origensData = filtroData ? _listaComprasOrigem.filter(p => {
      const raw = p.dataPrevista || p.dataEntrega || p.data || "";
      let dateISO = raw; if (raw.includes("/")) { const parts = raw.split("/"); dateISO = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}` : raw; }
      return dateISO.slice(0, 10) === filtroData;
    }) : [];
    const grupos = new Map();
    origensData.forEach(p => {
      const cliente = p.escola || "—";
      if (!grupos.has(cliente)) grupos.set(cliente, []);
      grupos.get(cliente).push(p);
    });
    let html = '';
    grupos.forEach((pedidosCliente, cliente) => {
      const cnpj = pedidosCliente[0]?.cliente?.cnpj || "";
      // Consolidar itens deste cliente (skipDateFilter=true pois já filtrado acima)
      const itensCliente = consolidarItensParaLista(pedidosCliente, true);
      html += `<tr style="background:var(--s1);font-weight:700"><td colspan="8"><strong>${esc(cliente)}${cnpj ? ' - ' + esc(cnpj) : ''}</strong></td></tr>`;
      itensCliente.forEach(r => {
        html += `<tr><td></td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.descricao)}">${esc(r.descricao)}</td>${_listaRowConversao(r)}</tr>`;
      });
    });
    tbody.innerHTML = html;
  } else if (modo === "fornecedores-produtos") {
    thead.innerHTML = '<th>Fornecedor</th><th>Item Pedido</th>' + _convHeaders;
    const grupos = new Map();
    itens.forEach(item => {
      const forn = item.fornecedor || "Sem fornecedor";
      if (!grupos.has(forn)) grupos.set(forn, []);
      grupos.get(forn).push(item);
    });
    let html = '';
    grupos.forEach((items, fornecedor) => {
      html += `<tr style="background:var(--s1);font-weight:700"><td colspan="8"><strong>${esc(fornecedor)}</strong></td></tr>`;
      items.forEach(r => {
        html += `<tr><td></td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.descricao)}">${esc(r.descricao)}</td>${_listaRowConversao(r)}</tr>`;
      });
    });
    tbody.innerHTML = html;
  } else {
    thead.innerHTML = '<th>#</th><th>Item Pedido</th>' + _convHeaders;
    tbody.innerHTML = itens.map((item, i) => {
      const embLabel = item.qtdEmbalagens ? item.qtdEmbalagens + ' emb. (' + (item.embalagem || '-') + ')' : '—';
      const sobraLabel = item.sobra > 0 ? ('+' + item.sobra + ' ' + (item.baseUnidade || item.unidade || '')) : '—';
      const sobraColor = item.sobra > 0 ? 'color:var(--yellow)' : 'color:var(--green)';
      return `<tr>
        <td>${i+1}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}">${esc(item.descricao)}</td>
        <td style="font-size:.78rem">${esc(item.produtoEstoque || '—')}</td>
        <td class="text-right font-mono">${item.qtdOriginal || '-'}</td>
        <td class="text-right font-mono">${item.qtd}</td>
        <td style="font-size:.78rem">${esc(item.baseUnidade || item.unidade || '—')}</td>
        <td class="text-right font-mono" style="font-size:.78rem">${embLabel}</td>
        <td class="text-right font-mono" style="${sobraColor};font-size:.78rem">${sobraLabel}</td>
      </tr>`;
    }).join("");
  }
  // Mensagem quando sem itens
  const filtroData = document.getElementById("lista-compras-filtro-data")?.value || "";
  if (itens.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--mut);font-size:.9rem">${!filtroData ? 'Selecione a <strong>Data Prevista de Entrega</strong> para filtrar a lista de compras.' : 'Nenhum item encontrado para a data <strong>' + new Date(filtroData + 'T12:00:00').toLocaleDateString('pt-BR') + '</strong>.'}</td></tr>`;
  }
  const totalEmbs = itens.reduce((s, i) => s + (i.qtdEmbalagens || 0), 0);
  const totalValor = itens.reduce((s, i) => s + (i.valorTotal || 0), 0);
  document.getElementById("lista-compras-total-itens").textContent = itens.length + " produto" + (itens.length !== 1 ? "s" : "");
  document.getElementById("lista-compras-total-qtd").textContent = totalEmbs + " embalagem(ns) | " + (totalValor ? brl.format(totalValor) : "Sem preco ref.");
}

function exportarListaCSV() {
  if (_listaComprasData.length === 0) return;
  const header = "Descricao;SKU;Unidade;Quantidade;Protocolos";
  const rows = _listaComprasData.map(i => `"${(i.descricao||'').replace(/"/g,'""')}";"${i.sku||''}";"${i.unidade}";"${i.qtd}";"${i.protocolos.join(', ')}"`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lista-compras-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Lista exportada em CSV!");
}

function exportarListaPDF() {
  if (_listaComprasData.length === 0) return;

  const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  const nomeEmpresa = empresa.razaoSocial || empresa.nome || "Empresa";
  const nomeFantasia = empresa.nomeFantasia || empresa.fantasia || "";
  const empresaCnpj = empresa.cnpj || "";
  const empresaEndereco = [empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.uf, empresa.cep ? 'CEP ' + empresa.cep : ''].filter(Boolean).join(', ') || '';
  const empresaTel = empresa.telefone || '';
  const empresaEmail = empresa.email || '';
  const dataGeracao = new Date().toLocaleDateString('pt-BR');
  const protocolos = [..._selectedDemandaIds].length ? [..._selectedDemandaIds].join(', ') : [..._selectedPedidoIds].join(', ');
  const totalEmbs = _listaComprasData.reduce((s, i) => s + (i.qtdEmbalagens || 0), 0);

  let tableRows = _listaComprasData.map((item, i) => {
    const embLabel = item.qtdEmbalagens ? item.qtdEmbalagens + ' emb. (' + (item.embalagem || '-') + ')' : '—';
    const sobraLabel = item.sobra > 0 ? '+' + item.sobra + ' ' + (item.baseUnidade || item.unidade || '') : '—';
    return `<tr><td style="text-align:center">${i+1}</td><td>${item.descricao}</td><td style="font-size:11px">${item.produtoEstoque || '—'}</td><td style="text-align:center">${item.qtdOriginal || '-'}</td><td style="text-align:center">${item.qtd}</td><td style="text-align:center">${item.baseUnidade || item.unidade || '—'}</td><td style="text-align:center;font-size:11px">${embLabel}</td><td style="text-align:center;font-size:11px">${sobraLabel}</td></tr>`;
  }).join("");

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Lista de Compras</title>
    <style>
      body{font-family:Arial,sans-serif;margin:2cm;color:#333}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f5f5f5;padding:8px;text-align:left;border:1px solid #ddd;font-size:10px;text-transform:uppercase}
      td{padding:6px 8px;border:1px solid #ddd}
      tr:nth-child(even){background:#f9f9f9}
      @media print{body{margin:1.5cm}}
    </style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem">
      <div><div style="font-size:18px;font-weight:900;letter-spacing:1px">${nomeEmpresa.toUpperCase()}${nomeFantasia ? ' <span style="font-weight:400;font-size:13px">(' + nomeFantasia + ')</span>' : ''}</div><div style="font-size:10px;color:#666;margin-top:4px">${empresaCnpj ? 'CNPJ: ' + empresaCnpj : ''}</div><div style="font-size:10px;color:#666">${empresaEndereco}</div><div style="font-size:10px;color:#666">${[empresaTel ? 'Tel: ' + empresaTel : '', empresaEmail].filter(Boolean).join(' | ')}</div></div>
      <div style="text-align:right"><div style="font-size:10px;color:#666;text-transform:uppercase">Lista de Compras Consolidada</div><div style="font-size:12px;color:#666;margin-top:4px">${dataGeracao}</div><div style="font-size:10px;color:#666;margin-top:2px">Protocolos: ${protocolos}</div></div>
    </div>
    <table>
      <thead><tr><th style="text-align:center">#</th><th>Item Pedido</th><th>Produto Estoque</th><th style="text-align:center">Qtd</th><th style="text-align:center">Quantidade</th><th style="text-align:center">Base</th><th style="text-align:center">Qtd Emb.</th><th style="text-align:center">Sobra</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div style="text-align:right;margin-top:1rem;font-size:12px;font-weight:700">${_listaComprasData.length} produtos | ${totalEmbs} embalagem(ns)</div>
    <div style="display:flex;justify-content:space-around;margin-top:3rem;font-size:11px"><div style="text-align:center;width:40%"><div style="border-top:1px solid #333;padding-top:6px"><strong>Recebedor(a)</strong><br>Nome / Cargo / Matrícula</div></div><div style="text-align:center;width:40%"><div style="border-top:1px solid #333;padding-top:6px"><strong>Entregador</strong><br>${nomeEmpresa}</div></div></div>
    <div style="text-align:center;margin-top:3rem;font-size:9px;color:#999">Documento gerado automaticamente pelo sistema GDP — Gestão de Pedidos<br>${nomeEmpresa}${empresaCnpj ? ' — CNPJ ' + empresaCnpj : ''}</div>
  </body></html>`);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 5000);
}
