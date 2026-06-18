/**
 * gdp-conta-corrente.js — Conta-Corrente do Cliente (EPIC-20 Story 20.9.1)
 *
 * Extrato de crédito/débito rotativo por escola. Saldo SEMPRE recalculado dos
 * lançamentos (princípio P3): saldo = Σ créditos − Σ débitos (ativos).
 * Positivo = crédito a favor da escola; negativo = escola devedora.
 *
 * Consome o contrato de dados de gdp-api.js:
 *   gdpApi.contaCorrente.extrato(clienteId) → {lancamentos, saldo}
 *   gdpApi.lancamentosCliente.save/remove
 *   gdpApi.lancamentosItens.save
 *
 * Itens de retirada vêm do catálogo ARP (data/lariucci-arp-2025.json), com
 * preço pré-preenchido mas TODOS os campos editáveis + item avulso.
 */
(function () {
  'use strict';

  var _brl = (typeof brl !== 'undefined') ? brl : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function _toast(msg) { if (typeof showToast === 'function') showToast(msg); else console.log('[CC]', msg); }
  function _genId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function _hoje() { return new Date().toISOString().slice(0, 10); }
  function _num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }

  // Detecta a unidade pelo nome do produto (mesma lógica do portal — parseUnidadeFromName).
  function _parseUnidade(nome) {
    if (!nome) return 'UN';
    var n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var w = n.match(/(\d+[.,]?\d*)\s*(kg|kgs|quilo|quilos|g|gr|grs|gramas|mg)\b/);
    if (w) { var u = w[2];
      if (['kg','kgs','quilo','quilos'].indexOf(u) >= 0) return 'KG';
      if (['g','gr','grs','gramas'].indexOf(u) >= 0) return 'GR';
      if (u === 'mg') return 'MG'; }
    var v = n.match(/(\d+[.,]?\d*)\s*(ml|mililitro|mililitros|l|lt|litro|litros)\b/);
    if (v) { var uv = v[2];
      if (['ml','mililitro','mililitros'].indexOf(uv) >= 0) return 'ML';
      if (['l','lt','litro','litros'].indexOf(uv) >= 0) return 'LT'; }
    if (n.match(/(\d+[.,]?\d*)\s*(un|unid|unidade|unidades|pc|pcs|peca|pecas)\b/)) return 'UN';
    var pk = n.match(/(\d+[.,]?\d*)\s*(cx|caixa|pct|pacote|bd|bandeja|dz|duzia|mc|maco)\b/);
    if (pk) { var up = pk[2];
      if (['cx','caixa'].indexOf(up) >= 0) return 'CX';
      if (['pct','pacote'].indexOf(up) >= 0) return 'PCT';
      if (['bd','bandeja'].indexOf(up) >= 0) return 'BD';
      if (['dz','duzia'].indexOf(up) >= 0) return 'DZ';
      if (['mc','maco'].indexOf(up) >= 0) return 'MC'; }
    var st = n.match(/(?:\b|\()(kg|gr|ml|lt|un)(?:\b|\))\s*(?:-.*)?$/);
    if (st) { var us = st[1]; return us.toUpperCase(); }
    var produce = ['batata','cebola','alho','tomate','cenoura','maca','banana','laranja','manga','abobora','beterraba','repolho','abobrinha','pimentao','pepino','inhame','mandioca','jilo','alface','couve','melancia','melao','mamao','abacaxi','limao','chuchu','quiabo','vagem','berinjela','brocolis'];
    if (produce.some(function (k) { return n.indexOf(k) >= 0; })) return 'KG';
    var meat = ['carne','frango','file','tilapia','mussarela','mucarela','queijo','presunto','linguica','salsicha','pernil','costela','alcatra','patinho','acem','bife','sobrecoxa','coxa','asa'];
    if (meat.some(function (k) { return n.indexOf(k) >= 0; })) return 'KG';
    var grain = ['feijao','arroz','farinha','fuba','acucar','sal ','amido','aveia','lentilha','ervilha','milho','trigo','tapioca','canjica','cuscuz','soja'];
    if (grain.some(function (k) { return n.indexOf(k) >= 0; })) return 'KG';
    if (n.indexOf('polpa') >= 0) return 'KG';
    return 'UN';
  }

  // ---- ARP catalog cache (para o seletor de itens da retirada) ----
  var _arpCache = null;
  async function _loadArp() {
    if (_arpCache) return _arpCache;
    try {
      var resp = await fetch('data/lariucci-arp-2025.json');
      _arpCache = await resp.json();
    } catch (e) { _arpCache = { escolas: [] }; }
    return _arpCache;
  }
  // Retorna a lista de produtos {produto, preco} de uma escola (match por nome/id aproximado).
  async function _produtosDaEscola(clienteNome) {
    var arp = await _loadArp();
    var escolas = (arp && arp.escolas) || [];
    var alvo = (clienteNome || '').toUpperCase();
    var match = escolas.find(function (e) {
      return alvo && (String(e.nome || '').toUpperCase().indexOf(alvo) >= 0 || alvo.indexOf(String(e.nome || '').toUpperCase().split(' ')[0]) >= 0);
    });
    var produtos = (match && match.produtos) || [];
    // Fallback: se não bateu a escola, retorna o catálogo agregado (todas) para não travar o uso.
    if (!produtos.length) {
      escolas.forEach(function (e) { (e.produtos || []).forEach(function (p) { produtos.push(p); }); });
    }
    return produtos.map(function (p) { return { produto: p.produto, preco: _num(p.preco) }; });
  }

  // ---- Clientes em regime de conta-corrente ----
  async function _clientesContaCorrente() {
    var todos = await gdpApi.clientes.list();
    return (todos || []).filter(function (c) {
      return c && (c.contaCorrenteAtiva === true || c.conta_corrente_ativa === true);
    });
  }

  // ============================================================
  // RENDER — lista de escolas com saldo
  // ============================================================
  async function renderContaCorrente() {
    var host = document.getElementById('fin-content-conta-corrente');
    if (!host) return;
    host.innerHTML = '<div class="card"><p style="color:var(--mut)">Carregando conta-corrente...</p></div>';

    var clientes = await _clientesContaCorrente();
    var lancamentos = await gdpApi.lancamentosCliente.list();

    if (!clientes.length) {
      host.innerHTML = '<div class="card">'
        + '<h3>Conta-Corrente do Cliente</h3>'
        + '<p style="color:var(--mut);font-size:.85rem;margin:.8rem 0">Nenhuma escola marcada como conta-corrente ainda. '
        + 'Marque uma escola como conta-corrente no cadastro de Clientes para controlar crédito/débito rotativo aqui.</p>'
        + '</div>';
      return;
    }

    var rows = clientes.map(function (c) {
      var saldo = gdpApi.contaCorrente.saldoFromLancamentos(lancamentos, c.id);
      var cor = saldo >= 0 ? 'var(--green)' : 'var(--red, #d33)';
      var label = saldo >= 0 ? 'crédito a favor' : 'devedora';
      return '<tr style="cursor:pointer" onclick="abrirExtratoCliente(\'' + c.id + '\')">'
        + '<td style="font-weight:600">' + (c.nome || c.id) + '</td>'
        + '<td class="text-right" style="font-weight:700;color:' + cor + '">' + _brl.format(saldo) + '</td>'
        + '<td style="color:var(--mut);font-size:.8rem">' + label + '</td>'
        + '<td class="text-right"><button class="btn btn-sm btn-outline" onclick="event.stopPropagation();abrirExtratoCliente(\'' + c.id + '\')">Ver extrato →</button></td>'
        + '</tr>';
    }).join('');

    host.innerHTML = '<div class="card">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem">'
      + '<h3 style="margin:0">Conta-Corrente do Cliente</h3>'
      + '<button class="btn btn-sm btn-outline" onclick="abrirRelatorioGeralCC()">📊 Relatório geral (multi-escola)</button>'
      + '</div>'
      + '<p style="color:var(--mut);font-size:.85rem;margin:.6rem 0 1rem">Saldo recalculado dos lançamentos. '
      + 'Verde = crédito a favor da escola · Vermelho = escola devedora.</p>'
      + '<div class="table-wrap"><table style="width:100%;font-size:.88rem">'
      + '<thead><tr><th>Escola</th><th class="text-right">Saldo</th><th>Situação</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>'
      + '</div>'
      + '<div id="cc-extrato-host"></div>';
  }

  // ============================================================
  // EXTRATO de um cliente
  // ============================================================
  // Anexa os itens (lancamentos_itens) aos débitos do extrato, para exibição expansível.
  async function _anexarItens(lancamentos) {
    var debitos = lancamentos.filter(function (l) { return l && l.tipo === 'debito'; });
    if (!debitos.length) return lancamentos;
    var todosItens = await gdpApi.lancamentosItens.list();
    var porLanc = {};
    (todosItens || []).forEach(function (it) {
      var lid = it.lancamentoId || it.lancamento_id;
      if (!lid) return;
      (porLanc[lid] = porLanc[lid] || []).push(it);
    });
    lancamentos.forEach(function (l) { if (l && l.tipo === 'debito') l._itens = porLanc[l.id] || []; });
    return lancamentos;
  }

  async function abrirExtratoCliente(clienteId) {
    var host = document.getElementById('cc-extrato-host');
    if (!host) return;
    var cliente = await gdpApi.clientes.get(clienteId);
    var nome = (cliente && cliente.nome) || clienteId;
    var ext = await gdpApi.contaCorrente.extrato(clienteId);
    await _anexarItens(ext.lancamentos);
    var saldoCor = ext.saldo >= 0 ? 'var(--green)' : 'var(--red, #d33)';

    var linhas = ext.lancamentos.map(function (l) {
      var ehDebito = l.tipo === 'debito';
      var sinal = ehDebito ? '−' : '+';
      var cor = ehDebito ? 'var(--red, #d33)' : 'var(--green)';
      var itensHtml = '';
      if (ehDebito && Array.isArray(l._itens) && l._itens.length) {
        itensHtml = '<tr class="cc-itens-row"><td colspan="4" style="background:var(--s1);padding:0">'
          + '<table style="width:100%;font-size:.78rem;margin:0">'
          + l._itens.map(function (it) {
            return '<tr><td style="padding-left:2rem">' + (it.produto || '') + '</td>'
              + '<td class="text-right">' + (_num(it.quantidade)) + ' ' + (it.unidade || 'UN') + '</td>'
              + '<td class="text-right">' + _brl.format(_num(it.valorUnitario || it.valor_unitario)) + '</td>'
              + '<td class="text-right">' + _brl.format(_num(it.subtotal)) + '</td></tr>';
          }).join('')
          + '</table></td></tr>';
      }
      return '<tr>'
        + '<td style="white-space:nowrap">' + fmtDate(l.data) + '</td>'
        + '<td>' + (l.descricao || (ehDebito ? 'Retirada' : 'Crédito')) + '</td>'
        + '<td class="text-right" style="font-weight:600;color:' + cor + '">' + sinal + ' ' + _brl.format(_num(l.valor)) + '</td>'
        + '<td class="text-right" style="white-space:nowrap">'
        + '<button class="btn btn-sm btn-outline" onclick="editarLancamentoCC(\'' + l.id + '\',\'' + clienteId + '\')" title="Editar">✎</button> '
        + '<button class="btn btn-sm btn-outline" onclick="removerLancamentoCC(\'' + l.id + '\',\'' + clienteId + '\')" title="Remover">✕</button></td>'
        + '</tr>' + itensHtml;
    }).join('');

    host.innerHTML = '<div class="card" style="margin-top:1rem">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;margin-bottom:.8rem">'
      + '<h3 style="margin:0">Extrato — ' + nome + '</h3>'
      + '<div style="font-size:1.1rem;font-weight:800;color:' + saldoCor + '">Saldo: ' + _brl.format(ext.saldo) + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem">'
      + '<button class="btn btn-sm btn-green" onclick="abrirModalCredito(\'' + clienteId + '\')">+ Lançar crédito</button>'
      + '<button class="btn btn-sm btn-blue" onclick="abrirModalRetirada(\'' + clienteId + '\')">− Lançar retirada</button>'
      + '<button class="btn btn-sm btn-outline" onclick="imprimirExtratoCC(\'' + clienteId + '\')">🖨 Imprimir / PDF</button>'
      + '</div>'
      + '<div class="table-wrap"><table style="width:100%;font-size:.88rem">'
      + '<thead><tr><th style="width:90px">Data</th><th>Descrição</th><th class="text-right" style="width:130px">Valor</th><th style="width:90px"></th></tr></thead>'
      + '<tbody>' + (linhas || '<tr><td colspan="4" style="text-align:center;color:var(--mut);padding:1.5rem">Nenhum lançamento ainda.</td></tr>') + '</tbody>'
      + '</table></div></div>';

    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ============================================================
  // MODAL — base (overlay simples e auto-contido)
  // ============================================================
  function _modal(innerHtml) {
    _fecharModal();
    var ov = document.createElement('div');
    ov.id = 'cc-modal-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
    ov.onclick = function (e) { if (e.target === ov) _fecharModal(); };
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg,#fff);color:var(--txt,#111);border-radius:10px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:1.4rem;box-shadow:0 10px 40px rgba(0,0,0,.3)';
    box.innerHTML = innerHtml;
    ov.appendChild(box);
    document.body.appendChild(ov);
  }
  function _fecharModal() { var ov = document.getElementById('cc-modal-overlay'); if (ov) ov.remove(); }

  // ---- Crédito manual ----
  function abrirModalCredito(clienteId) {
    _modal('<h3 style="margin-top:0">Lançar crédito</h3>'
      + '<p style="color:var(--mut);font-size:.82rem">Entrada de crédito a favor da escola (pagamento/depósito).</p>'
      + '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Data</label>'
      + '<input id="cc-cred-data" type="date" value="' + _hoje() + '" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">'
      + '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Descrição</label>'
      + '<input id="cc-cred-desc" type="text" placeholder="Ex: Depósito PIX / Saldo NF 789" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">'
      + '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Valor (R$)</label>'
      + '<input id="cc-cred-valor" type="number" step="0.01" min="0" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">'
      + '<div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem">'
      + '<button class="btn btn-sm btn-outline" onclick="fecharModalCC()">Cancelar</button>'
      + '<button class="btn btn-sm btn-green" onclick="salvarCreditoCC(\'' + clienteId + '\')">Salvar crédito</button>'
      + '</div>');
  }
  async function salvarCreditoCC(clienteId) {
    var valor = _num(document.getElementById('cc-cred-valor').value);
    if (valor <= 0) { _toast('Informe um valor maior que zero.'); return; }
    await gdpApi.lancamentosCliente.save({
      id: _genId(),
      clienteId: clienteId,
      data: document.getElementById('cc-cred-data').value || _hoje(),
      tipo: 'credito',
      valor: valor,
      descricao: document.getElementById('cc-cred-desc').value || 'Crédito',
      origem: {}
    });
    _fecharModal();
    _toast('Crédito lançado.');
    await renderContaCorrente();
    await abrirExtratoCliente(clienteId);
  }

  // ---- Retirada (débito) com itens do ARP ----
  var _retiradaItens = [];
  async function abrirModalRetirada(clienteId) {
    _retiradaItens = [];
    var cliente = await gdpApi.clientes.get(clienteId);
    var produtos = await _produtosDaEscola(cliente && cliente.nome);
    var opts = '<option value="">— selecione do catálogo ARP —</option>'
      + produtos.map(function (p, i) {
        return '<option value="' + i + '" data-preco="' + p.preco + '">' + (p.produto || '') + ' (' + _brl.format(p.preco) + ')</option>';
      }).join('');
    window._ccProdutosEscola = produtos;

    _modal('<h3 style="margin-top:0">Lançar retirada</h3>'
      + '<p style="color:var(--mut);font-size:.82rem">Itens retirados pela escola. Preço vem do catálogo ARP, mas é editável. Use o campo livre para item avulso.</p>'
      + '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Data</label>'
      + '<input id="cc-ret-data" type="date" value="' + _hoje() + '" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">'
      + '<div style="border:1px solid var(--bdr);border-radius:8px;padding:.8rem;margin-top:.8rem">'
      + '<div style="display:grid;grid-template-columns:1fr 60px 60px 90px auto;gap:.4rem;align-items:end">'
      + '<div><label style="font-size:.72rem">Produto (ARP)</label><select id="cc-ret-sel" onchange="ccPreencherPreco()" style="width:100%;padding:.4rem;border:1px solid var(--bdr);border-radius:6px">' + opts + '</select></div>'
      + '<div><label style="font-size:.72rem">Qtd</label><input id="cc-ret-qtd" type="number" step="0.001" min="0" value="1" style="width:100%;padding:.4rem;border:1px solid var(--bdr);border-radius:6px"></div>'
      + '<div><label style="font-size:.72rem">Unid.</label><input id="cc-ret-un" type="text" value="UN" style="width:100%;padding:.4rem;border:1px solid var(--bdr);border-radius:6px;text-transform:uppercase"></div>'
      + '<div><label style="font-size:.72rem">Vlr unit.</label><input id="cc-ret-vu" type="number" step="0.01" min="0" style="width:100%;padding:.4rem;border:1px solid var(--bdr);border-radius:6px"></div>'
      + '<button class="btn btn-sm btn-blue" onclick="ccAddItem()">+ Add</button>'
      + '</div>'
      + '<input id="cc-ret-avulso" type="text" placeholder="ou digite um item avulso (substitui o select)" style="width:100%;padding:.4rem;border:1px solid var(--bdr);border-radius:6px;margin-top:.5rem;font-size:.8rem">'
      + '</div>'
      + '<div id="cc-ret-itens" style="margin-top:.8rem"></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">'
      + '<strong id="cc-ret-total">Total: ' + _brl.format(0) + '</strong>'
      + '<div style="display:flex;gap:.6rem">'
      + '<button class="btn btn-sm btn-outline" onclick="fecharModalCC()">Cancelar</button>'
      + '<button class="btn btn-sm btn-blue" onclick="salvarRetiradaCC(\'' + clienteId + '\')">Salvar retirada</button>'
      + '</div></div>');
    _renderItensRetirada();
  }
  function ccPreencherPreco() {
    var sel = document.getElementById('cc-ret-sel');
    var opt = sel.options[sel.selectedIndex];
    var preco = opt ? _num(opt.getAttribute('data-preco')) : 0;
    if (preco > 0) document.getElementById('cc-ret-vu').value = preco.toFixed(2);
    // detecta unidade pelo nome do produto selecionado (editável)
    var produtos = window._ccProdutosEscola || [];
    if (sel.value !== '') {
      var p = produtos[parseInt(sel.value, 10)];
      if (p) document.getElementById('cc-ret-un').value = _parseUnidade(p.produto);
    }
  }
  function ccAddItem() {
    var sel = document.getElementById('cc-ret-sel');
    var avulso = (document.getElementById('cc-ret-avulso').value || '').trim();
    var produtos = window._ccProdutosEscola || [];
    var nome = avulso;
    if (!nome && sel.value !== '') nome = (produtos[parseInt(sel.value, 10)] || {}).produto || '';
    if (!nome) { _toast('Selecione um produto do ARP ou digite um item avulso.'); return; }
    var qtd = _num(document.getElementById('cc-ret-qtd').value);
    var vu = _num(document.getElementById('cc-ret-vu').value);
    var unid = (document.getElementById('cc-ret-un').value || 'UN').trim().toUpperCase();
    // item avulso sem unidade informada: tenta detectar do nome
    if (avulso && (!unid || unid === 'UN')) unid = _parseUnidade(nome);
    if (qtd <= 0 || vu < 0) { _toast('Quantidade/valor inválidos.'); return; }
    _retiradaItens.push({ produto: nome, quantidade: qtd, unidade: unid, valorUnitario: vu, subtotal: Math.round(qtd * vu * 100) / 100 });
    // reset linha de entrada
    document.getElementById('cc-ret-sel').value = '';
    document.getElementById('cc-ret-avulso').value = '';
    document.getElementById('cc-ret-qtd').value = '1';
    document.getElementById('cc-ret-un').value = 'UN';
    document.getElementById('cc-ret-vu').value = '';
    _renderItensRetirada();
  }
  function ccRemoveItem(idx) { _retiradaItens.splice(idx, 1); _renderItensRetirada(); }
  function _renderItensRetirada() {
    var host = document.getElementById('cc-ret-itens');
    if (!host) return;
    var total = 0;
    if (!_retiradaItens.length) {
      host.innerHTML = '<p style="color:var(--mut);font-size:.8rem;text-align:center;padding:.6rem">Nenhum item adicionado.</p>';
    } else {
      host.innerHTML = '<table style="width:100%;font-size:.8rem"><thead><tr><th>Produto</th><th class="text-right">Qtd</th><th>Un.</th><th class="text-right">Vlr unit.</th><th class="text-right">Subtotal</th><th></th></tr></thead><tbody>'
        + _retiradaItens.map(function (it, i) {
          total += it.subtotal;
          return '<tr><td>' + it.produto + '</td><td class="text-right">' + it.quantidade + '</td>'
            + '<td>' + (it.unidade || 'UN') + '</td>'
            + '<td class="text-right">' + _brl.format(it.valorUnitario) + '</td>'
            + '<td class="text-right">' + _brl.format(it.subtotal) + '</td>'
            + '<td class="text-right"><button class="btn btn-sm btn-outline" onclick="ccRemoveItem(' + i + ')">✕</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
    var t = document.getElementById('cc-ret-total');
    if (t) t.textContent = 'Total: ' + _brl.format(total);
  }
  async function salvarRetiradaCC(clienteId) {
    if (!_retiradaItens.length) { _toast('Adicione ao menos um item.'); return; }
    var total = _retiradaItens.reduce(function (s, it) { return s + it.subtotal; }, 0);
    total = Math.round(total * 100) / 100;
    var lancId = _genId();
    // 1 lançamento débito (Σ subtotais = valor do débito — invariante de negócio)
    await gdpApi.lancamentosCliente.save({
      id: lancId,
      clienteId: clienteId,
      data: document.getElementById('cc-ret-data').value || _hoje(),
      tipo: 'debito',
      valor: total,
      descricao: 'Retirada (' + _retiradaItens.length + ' ' + (_retiradaItens.length === 1 ? 'item' : 'itens') + ')',
      origem: {}
    });
    // N itens vinculados
    for (var i = 0; i < _retiradaItens.length; i++) {
      var it = _retiradaItens[i];
      await gdpApi.lancamentosItens.save({
        id: _genId(),
        lancamentoId: lancId,
        produto: it.produto,
        quantidade: it.quantidade,
        unidade: it.unidade || 'UN',
        valorUnitario: it.valorUnitario,
        subtotal: it.subtotal
      });
    }
    _retiradaItens = [];
    _fecharModal();
    _toast('Retirada lançada.');
    await renderContaCorrente();
    await abrirExtratoCliente(clienteId);
  }

  async function removerLancamentoCC(lancId, clienteId) {
    if (!confirm('Remover este lançamento do extrato?')) return;
    await gdpApi.lancamentosCliente.remove(lancId);
    _toast('Lançamento removido.');
    await renderContaCorrente();
    await abrirExtratoCliente(clienteId);
  }

  // ---- Editar lançamento (data, descrição; valor só para crédito) ----
  async function editarLancamentoCC(lancId, clienteId) {
    var todos = await gdpApi.lancamentosCliente.list();
    var l = (todos || []).find(function (x) { return x.id === lancId; });
    if (!l) { _toast('Lançamento não encontrado.'); return; }
    var ehDebito = l.tipo === 'debito';
    _modal('<h3 style="margin-top:0">Editar lançamento</h3>'
      + '<p style="color:var(--mut);font-size:.82rem">' + (ehDebito ? 'Retirada (débito). O valor é definido pelos itens — para alterar itens, remova e relance.' : 'Crédito.') + '</p>'
      + '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Data</label>'
      + '<input id="cc-edit-data" type="date" value="' + (l.data || _hoje()) + '" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">'
      + '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Descrição</label>'
      + '<input id="cc-edit-desc" type="text" value="' + String(l.descricao || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">'
      + (ehDebito ? ''
        : '<label style="display:block;margin:.6rem 0 .2rem;font-size:.8rem">Valor (R$)</label>'
          + '<input id="cc-edit-valor" type="number" step="0.01" min="0" value="' + _num(l.valor) + '" style="width:100%;padding:.5rem;border:1px solid var(--bdr);border-radius:6px">')
      + '<div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem">'
      + '<button class="btn btn-sm btn-outline" onclick="fecharModalCC()">Cancelar</button>'
      + '<button class="btn btn-sm btn-green" onclick="salvarEdicaoLancamentoCC(\'' + lancId + '\',\'' + clienteId + '\')">Salvar</button>'
      + '</div>');
  }
  async function salvarEdicaoLancamentoCC(lancId, clienteId) {
    var todos = await gdpApi.lancamentosCliente.list();
    var l = (todos || []).find(function (x) { return x.id === lancId; });
    if (!l) { _toast('Lançamento não encontrado.'); return; }
    l.data = document.getElementById('cc-edit-data').value || l.data;
    l.descricao = document.getElementById('cc-edit-desc').value || l.descricao;
    var ve = document.getElementById('cc-edit-valor');
    if (ve && l.tipo !== 'debito') {
      var nv = _num(ve.value);
      if (nv <= 0) { _toast('Valor inválido.'); return; }
      l.valor = nv;
    }
    await gdpApi.lancamentosCliente.save(l);
    _fecharModal();
    _toast('Lançamento atualizado.');
    await renderContaCorrente();
    await abrirExtratoCliente(clienteId);
  }

  // ---- Impressão / PDF (Story 20.9.4 — base já entregue aqui) ----
  async function imprimirExtratoCC(clienteId) {
    var cliente = await gdpApi.clientes.get(clienteId);
    var nome = (cliente && cliente.nome) || clienteId;
    var ext = await gdpApi.contaCorrente.extrato(clienteId);
    await _anexarItens(ext.lancamentos);
    var linhas = ext.lancamentos.map(function (l) {
      var ehDebito = l.tipo === 'debito';
      var itens = (ehDebito && Array.isArray(l._itens)) ? l._itens.map(function (it) {
        return '<div style="padding-left:20px;font-size:11px;color:#555">• ' + it.produto + ' — ' + _num(it.quantidade) + ' ' + (it.unidade || 'UN') + ' × ' + _brl.format(_num(it.valorUnitario || it.valor_unitario)) + ' = ' + _brl.format(_num(it.subtotal)) + '</div>';
      }).join('') : '';
      return '<tr><td>' + fmtDate(l.data) + '</td><td>' + (l.descricao || '') + itens + '</td>'
        + '<td style="text-align:right;color:' + (ehDebito ? '#d33' : '#090') + '">' + (ehDebito ? '−' : '+') + ' ' + _brl.format(_num(l.valor)) + '</td></tr>';
    }).join('');
    var w = window.open('', '_blank');
    w.document.write('<html><head><title>Extrato — ' + nome + '</title>'
      + '<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left;font-size:13px}.saldo{font-size:18px;font-weight:bold;margin-top:16px;text-align:right}</style>'
      + '</head><body>'
      + '<h2>Extrato de Conta-Corrente</h2><div>' + nome + '</div>'
      + '<table><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>' + linhas + '</tbody></table>'
      + '<div class="saldo">Saldo atual: ' + _brl.format(ext.saldo) + '</div>'
      + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 300);
  }

  // ============================================================
  // RELATÓRIO GERAL multi-escola
  // ============================================================
  async function abrirRelatorioGeralCC() {
    var clientes = await _clientesContaCorrente();
    if (!clientes.length) { _toast('Nenhuma escola em conta-corrente.'); return; }
    var checks = clientes.map(function (c) {
      return '<label style="display:flex;align-items:center;gap:.5rem;padding:.35rem .2rem;cursor:pointer;border-bottom:1px solid var(--bdr)">'
        + '<input type="checkbox" class="cc-rel-chk" value="' + c.id + '" checked> ' + (c.nome || c.id) + '</label>';
    }).join('');
    _modal('<h3 style="margin-top:0">Relatório geral — selecione as escolas</h3>'
      + '<div style="display:flex;gap:.6rem;margin-bottom:.6rem">'
      + '<button class="btn btn-sm btn-outline" onclick="ccRelToggleTodos(true)">Marcar todas</button>'
      + '<button class="btn btn-sm btn-outline" onclick="ccRelToggleTodos(false)">Desmarcar todas</button>'
      + '</div>'
      + '<div style="max-height:300px;overflow:auto;border:1px solid var(--bdr);border-radius:6px;padding:.4rem">' + checks + '</div>'
      + '<div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">'
      + '<button class="btn btn-sm btn-outline" onclick="fecharModalCC()">Cancelar</button>'
      + '<button class="btn btn-sm btn-blue" onclick="gerarRelatorioGeralCC()">Gerar relatório</button>'
      + '</div>');
  }
  function ccRelToggleTodos(v) {
    document.querySelectorAll('.cc-rel-chk').forEach(function (cb) { cb.checked = v; });
  }
  async function gerarRelatorioGeralCC() {
    var ids = [].map.call(document.querySelectorAll('.cc-rel-chk:checked'), function (cb) { return cb.value; });
    if (!ids.length) { _toast('Selecione ao menos uma escola.'); return; }
    _fecharModal();
    var dados = [];
    var totalGeral = 0;
    for (var i = 0; i < ids.length; i++) {
      var cliente = await gdpApi.clientes.get(ids[i]);
      var ext = await gdpApi.contaCorrente.extrato(ids[i]);
      await _anexarItens(ext.lancamentos);
      totalGeral += ext.saldo;
      dados.push({ nome: (cliente && cliente.nome) || ids[i], saldo: ext.saldo, lancamentos: ext.lancamentos });
    }
    totalGeral = Math.round(totalGeral * 100) / 100;

    // Resumo de saldos
    var resumo = dados.map(function (d) {
      var cor = d.saldo >= 0 ? 'var(--green)' : 'var(--red, #d33)';
      return '<tr><td style="font-weight:600">' + d.nome + '</td>'
        + '<td class="text-right" style="font-weight:700;color:' + cor + '">' + _brl.format(d.saldo) + '</td>'
        + '<td style="color:var(--mut);font-size:.8rem">' + (d.saldo >= 0 ? 'crédito a favor' : 'devedora') + '</td></tr>';
    }).join('');
    var totalCor = totalGeral >= 0 ? 'var(--green)' : 'var(--red, #d33)';

    // Extratos detalhados
    var detalhes = dados.map(function (d) {
      var linhas = d.lancamentos.map(function (l) {
        var ehDebito = l.tipo === 'debito';
        var itensHtml = (ehDebito && Array.isArray(l._itens) && l._itens.length)
          ? '<tr><td colspan="3" style="background:var(--s1);padding:.2rem .4rem">'
            + l._itens.map(function (it) {
              return '<div style="padding-left:1.2rem;font-size:.76rem;color:var(--mut)">• ' + it.produto + ' — ' + _num(it.quantidade) + ' ' + (it.unidade || 'UN') + ' × ' + _brl.format(_num(it.valorUnitario || it.valor_unitario)) + ' = ' + _brl.format(_num(it.subtotal)) + '</div>';
            }).join('') + '</td></tr>'
          : '';
        return '<tr><td style="white-space:nowrap">' + fmtDate(l.data) + '</td><td>' + (l.descricao || '') + '</td>'
          + '<td class="text-right" style="color:' + (ehDebito ? 'var(--red,#d33)' : 'var(--green)') + '">' + (ehDebito ? '−' : '+') + ' ' + _brl.format(_num(l.valor)) + '</td></tr>' + itensHtml;
      }).join('');
      var cor = d.saldo >= 0 ? 'var(--green)' : 'var(--red, #d33)';
      return '<div style="margin-top:1.2rem"><h4 style="margin:.4rem 0;display:flex;justify-content:space-between">'
        + '<span>' + d.nome + '</span><span style="color:' + cor + '">Saldo: ' + _brl.format(d.saldo) + '</span></h4>'
        + '<table style="width:100%;font-size:.82rem"><thead><tr><th style="width:90px">Data</th><th>Descrição</th><th class="text-right" style="width:120px">Valor</th></tr></thead>'
        + '<tbody>' + (linhas || '<tr><td colspan="3" style="color:var(--mut);text-align:center;padding:.6rem">Sem lançamentos.</td></tr>') + '</tbody></table></div>';
    }).join('');

    var host = document.getElementById('cc-extrato-host');
    host.innerHTML = '<div class="card" style="margin-top:1rem" id="cc-rel-geral">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;margin-bottom:.6rem">'
      + '<h3 style="margin:0">Relatório Geral — ' + dados.length + ' escola(s)</h3>'
      + '<button class="btn btn-sm btn-outline" onclick="imprimirRelatorioGeralCC()">🖨 Imprimir / PDF</button>'
      + '</div>'
      + '<h4 style="margin:.4rem 0">Resumo de saldos</h4>'
      + '<table style="width:100%;font-size:.88rem"><thead><tr><th>Escola</th><th class="text-right">Saldo</th><th>Situação</th></tr></thead>'
      + '<tbody>' + resumo + '</tbody>'
      + '<tfoot><tr style="border-top:2px solid var(--bdr)"><td style="font-weight:800">TOTAL GERAL</td>'
      + '<td class="text-right" style="font-weight:800;color:' + totalCor + '">' + _brl.format(totalGeral) + '</td><td></td></tr></tfoot>'
      + '</table>'
      + '<h4 style="margin:1.2rem 0 .2rem">Extratos detalhados</h4>'
      + detalhes
      + '</div>';
    // guarda os dados para impressão
    window._ccRelDados = { dados: dados, totalGeral: totalGeral };
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function imprimirRelatorioGeralCC() {
    var ctx = window._ccRelDados;
    if (!ctx) return;
    var resumo = ctx.dados.map(function (d) {
      return '<tr><td>' + d.nome + '</td><td style="text-align:right;color:' + (d.saldo >= 0 ? '#090' : '#d33') + '">' + _brl.format(d.saldo) + '</td></tr>';
    }).join('');
    var detalhes = ctx.dados.map(function (d) {
      var linhas = d.lancamentos.map(function (l) {
        var ehDebito = l.tipo === 'debito';
        var itens = (ehDebito && Array.isArray(l._itens)) ? l._itens.map(function (it) {
          return '<div style="padding-left:18px;font-size:11px;color:#555">• ' + it.produto + ' — ' + _num(it.quantidade) + ' ' + (it.unidade || 'UN') + ' × ' + _brl.format(_num(it.valorUnitario || it.valor_unitario)) + ' = ' + _brl.format(_num(it.subtotal)) + '</div>';
        }).join('') : '';
        return '<tr><td>' + fmtDate(l.data) + '</td><td>' + (l.descricao || '') + itens + '</td><td style="text-align:right;color:' + (ehDebito ? '#d33' : '#090') + '">' + (ehDebito ? '−' : '+') + ' ' + _brl.format(_num(l.valor)) + '</td></tr>';
      }).join('');
      return '<h3 style="margin:14px 0 4px">' + d.nome + ' — Saldo: ' + _brl.format(d.saldo) + '</h3>'
        + '<table><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>' + linhas + '</tbody></table>';
    }).join('');
    var w = window.open('', '_blank');
    w.document.write('<html><head><title>Relatório Geral — Conta-Corrente</title>'
      + '<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h2{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #ddd;padding:5px;text-align:left;font-size:12px}.tot{font-weight:bold;border-top:2px solid #333}</style>'
      + '</head><body>'
      + '<h2>Relatório Geral de Conta-Corrente</h2>'
      + '<h3>Resumo de saldos</h3>'
      + '<table><thead><tr><th>Escola</th><th style="text-align:right">Saldo</th></tr></thead><tbody>' + resumo
      + '<tr class="tot"><td>TOTAL GERAL</td><td style="text-align:right">' + _brl.format(ctx.totalGeral) + '</td></tr>'
      + '</tbody></table>' + detalhes
      + '</body></html>');
    w.document.close(); w.focus();
    setTimeout(function () { w.print(); }, 300);
  }

  // ---- expose globals (padrão do projeto: funções globais chamadas por onclick) ----
  window.abrirRelatorioGeralCC = abrirRelatorioGeralCC;
  window.ccRelToggleTodos = ccRelToggleTodos;
  window.gerarRelatorioGeralCC = gerarRelatorioGeralCC;
  window.imprimirRelatorioGeralCC = imprimirRelatorioGeralCC;
  window.renderContaCorrente = renderContaCorrente;
  window.abrirExtratoCliente = abrirExtratoCliente;
  window.abrirModalCredito = abrirModalCredito;
  window.salvarCreditoCC = salvarCreditoCC;
  window.abrirModalRetirada = abrirModalRetirada;
  window.ccPreencherPreco = ccPreencherPreco;
  window.ccAddItem = ccAddItem;
  window.ccRemoveItem = ccRemoveItem;
  window.salvarRetiradaCC = salvarRetiradaCC;
  window.removerLancamentoCC = removerLancamentoCC;
  window.editarLancamentoCC = editarLancamentoCC;
  window.salvarEdicaoLancamentoCC = salvarEdicaoLancamentoCC;
  window.imprimirExtratoCC = imprimirExtratoCC;
  window.fecharModalCC = _fecharModal;
})();
