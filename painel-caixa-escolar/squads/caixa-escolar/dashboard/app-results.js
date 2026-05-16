// ===== F2: REGISTRO DE RESULTADOS SGD =====
// Story 6.1: Supabase persistence for resultados
const _SB_RESULTADOS = {
  URL: (window.SUPABASE_URL || 'https://mvvsjaudhbglxttxaeop.supabase.co') + '/rest/v1',
  KEY: window.SUPABASE_KEY || 'sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR',
  headers() {
    return { apikey: this.KEY, Authorization: 'Bearer ' + this.KEY, 'Content-Type': 'application/json' };
  },
  async upsert(resultado) {
    try {
      const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
      const row = {
        id: resultado.id,
        empresa_id: empId,
        orcamento_id: resultado.orcamentoId,
        resultado: resultado.resultado,
        data_resultado: resultado.dataResultado || null,
        valor_proposta: resultado.valorProposto || null,
        valor_vencedor: resultado.valorVencedor || null,
        fornecedor_vencedor: resultado.fornecedorVencedor || null,
        motivo_perda: resultado.motivoPerda || null,
        delta_total_percent: resultado.deltaTotalPercent || null,
        escola: resultado.escola || null,
        municipio: resultado.municipio || null,
        sre: resultado.sre || null,
        grupo: resultado.grupo || null,
        itens: resultado.itens || [],
        contrato: resultado.contrato || {},
        observacoes: resultado.observacoes || null,
      };
      await fetch(this.URL + '/resultados_orcamento', {
        method: 'POST',
        headers: Object.assign({}, this.headers(), { Prefer: 'return=minimal,resolution=merge-duplicates' }),
        body: JSON.stringify([row])
      });
      gdpLog('[Story 6.1] Resultado salvo em Supabase:', resultado.id);
    } catch (e) {
      gdpWarn('[Story 6.1] Fallback localStorage — Supabase indisponível:', e.message);
    }
  },
  async loadAll() {
    try {
      const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
      const res = await fetch(this.URL + '/resultados_orcamento?empresa_id=eq.' + empId + '&order=created_at.desc', {
        headers: this.headers()
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      gdpWarn('[Story 6.1] Supabase indisponível, usando localStorage:', e.message);
      return null;
    }
  },
  async migrateFromLocalStorage() {
    if (localStorage.getItem('resultados.migrated.v1') === 'true') return;
    const local = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || '[]');
    if (local.length === 0) { localStorage.setItem('resultados.migrated.v1', 'true'); return; }
    gdpLog('[Story 6.1] Migrando', local.length, 'resultados para Supabase...');
    // Story 12.1 AC4: batch parallel migration (10 at a time)
    const BATCH = 10;
    let ok = 0;
    for (let i = 0; i < local.length; i += BATCH) {
      const batch = local.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(r => this.upsert(r)));
      ok += results.filter(r => r.status === 'fulfilled').length;
    }
    localStorage.setItem('resultados.migrated.v1', 'true');
    gdpLog('[Story 6.1] Migração concluída:', ok + '/' + local.length, 'com sucesso.');
  }
};

// Boot: carregar resultados do Supabase e merge com localStorage
(async function _bootResultados() {
  try {
    await _SB_RESULTADOS.migrateFromLocalStorage();
    const sbData = await _SB_RESULTADOS.loadAll();
    if (sbData && sbData.length > 0) {
      const local = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || '[]');
      const localMap = new Map(local.map(r => [r.orcamentoId, r]));
      // Supabase prevalece em caso de conflito (Story 6.1 AC-3)
      for (const sb of sbData) {
        const localR = localMap.get(sb.orcamento_id);
        if (!localR || new Date(sb.updated_at) >= new Date(localR.dataResultado || 0)) {
          localMap.set(sb.orcamento_id, {
            id: sb.id, orcamentoId: sb.orcamento_id, escola: sb.escola,
            municipio: sb.municipio, grupo: sb.grupo, resultado: sb.resultado,
            dataResultado: sb.data_resultado, valorProposto: sb.valor_proposta,
            valorVencedor: sb.valor_vencedor, fornecedorVencedor: sb.fornecedor_vencedor,
            motivoPerda: sb.motivo_perda, deltaTotalPercent: sb.delta_total_percent,
            observacoes: sb.observacoes, itens: sb.itens || [], contrato: sb.contrato || {},
          });
        }
      }
      const merged = Array.from(localMap.values());
      localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(merged));
      gdpLog('[Story 6.1] Resultados sincronizados:', merged.length, 'registros');
    }
  } catch (e) {
    gdpWarn('[Story 6.1] Boot resultados — usando localStorage:', e.message);
  }
})();

// Story 13.7: Auto-migrate existing resultados to historico_licitacoes
// Runs on every boot — re-migrates if version bumps (to pick up SRE enrichment etc.)
(function _migrateResultadosToHistorico() {
  const MIGRATION_VERSION = '3'; // bump to force re-migration (v3: SRE from orcamentos)
  if (localStorage.getItem('intel.historico.migrated.v1') === MIGRATION_VERSION) return;
  if (typeof loadHistoricoLicitacoes !== 'function') return;

  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || '[]');
  if (resultados.length === 0) { localStorage.setItem('intel.historico.migrated.v1', MIGRATION_VERSION); return; }

  // Build escola→SRE lookup from orcamentos (most reliable source of SRE)
  const escolaSreMap = {};
  try {
    const orcs = JSON.parse(localStorage.getItem('caixaescolar.orcamentos') || '[]');
    orcs.forEach(o => { if (o.escola && o.sre) escolaSreMap[o.escola] = o.sre; });
  } catch(_) {}

  const items = [];
  resultados.forEach(r => {
    const sre = escolaSreMap[r.escola] || r.sre || "";
    const cidade = r.municipio || "";

    (r.itens || []).forEach(item => {
      items.push({
        id: "HIST-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
        escola: r.escola || "", cidade, sre,
        produto_id: "", descricao_item: item.nome || "",
        preco_proposto: item.precoUnitario || r.valorProposto || 0,
        preco_vencedor: item.precoVencedor || r.valorVencedor || 0,
        empresa_vencedora: r.resultado === "ganho" ? "LARIUCCI" : (r.fornecedorVencedor || ""),
        participou: true, ganhou: r.resultado === "ganho",
        motivo_perda: r.motivoPerda || null,
        delta_percent: r.deltaTotalPercent || null,
        data: r.dataResultado || "", orcamento_sgd_id: r.orcamentoId || ""
      });
    });
    if (!r.itens || r.itens.length === 0) {
      items.push({
        id: "HIST-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
        escola: r.escola || "", cidade, sre,
        produto_id: "", descricao_item: r.grupo || "Geral",
        preco_proposto: r.valorProposto || 0, preco_vencedor: r.valorVencedor || 0,
        empresa_vencedora: r.resultado === "ganho" ? "LARIUCCI" : (r.fornecedorVencedor || ""),
        participou: true, ganhou: r.resultado === "ganho",
        motivo_perda: r.motivoPerda || null, delta_percent: r.deltaTotalPercent || null,
        data: r.dataResultado || "", orcamento_sgd_id: r.orcamentoId || ""
      });
    }
  });
  if (items.length > 0) {
    saveHistoricoLicitacoes(items);
    const withSre = items.filter(i => i.sre).length;
    gdpLog('[Story 13.7] Migrados ' + items.length + ' registros (' + withSre + ' com SRE) para historico_licitacoes');
  }
  localStorage.setItem('intel.historico.migrated.v1', MIGRATION_VERSION);
})();

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

  // Delta de competitividade (ganho ou perdido)
  if (resultado.valorVencedor && resultado.valorVencedor > 0) {
    resultado.deltaTotalPercent = parseFloat(((resultado.valorProposto - resultado.valorVencedor) / resultado.valorVencedor * 100).toFixed(1));
  }

  // Salvar resultado
  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  resultados.push(resultado);
  localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));

  // Story 6.1: Dual-write para Supabase
  _SB_RESULTADOS.upsert(resultado);

  // H16 fix: validate pre-orçamento was actually sent before registering result
  if (pre.status !== "enviado" && pre.status !== "ganho" && pre.status !== "perdido") {
    showToast("Apenas pré-orçamentos enviados podem receber resultado.", 3000);
    return;
  }

  // Atualizar status do pré-orçamento
  pre.status = selectedResultado === "ganho" ? "ganho" : "perdido";
  savePreOrcamentos();
  schedulCloudSync();

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

  // Story 8.7: Auto-criar contrato no GDP quando ganhou (G3)
  // Checkbox GDP é checked por default para ganhos — automação com override manual
  let contratoGdpId = null;
  const gdpCheckbox = document.getElementById("res-gerar-contrato-gdp");
  if (resultado.resultado === "ganho" && (gdpCheckbox?.checked !== false)) {
    const numContrato = (document.getElementById("res-numero-contrato")?.value || "").trim();
    const contratoGdp = criarContratoGdpComCentral(currentResultadoOrcamentoId, pre, numContrato);
    if (contratoGdp && contratoGdp.id) {
      geradoGdp = true;
      contratoGdpId = contratoGdp.id;
    } else {
      gdpWarn('[GDP] Contrato GDP não foi criado — retornou null');
    }
  }

  // Alimentar banco de preços
  alimentarBancoComResultado(resultado);

  // Story 13.7 AC2: Feed historico_licitacoes from manual result
  // Resolve SRE: pre may not have it, but the linked orcamento does
  const _sreForHist = pre.sre || (function() {
    try {
      const _orcs = JSON.parse(localStorage.getItem('caixaescolar.orcamentos') || '[]');
      const _orc = _orcs.find(o => o.escola === resultado.escola && o.sre);
      return _orc ? _orc.sre : "";
    } catch(_) { return ""; }
  })();
  if (typeof addHistoricoLicitacao === 'function') {
    (resultado.itens || []).forEach(item => {
      addHistoricoLicitacao({
        escola: resultado.escola, cidade: resultado.municipio || "", sre: _sreForHist,
        produto_id: "", descricao_item: item.nome || "",
        preco_proposto: item.precoUnitario || 0,
        preco_vencedor: item.precoVencedor || resultado.valorVencedor || 0,
        empresa_vencedora: resultado.resultado === "ganho" ? "LARIUCCI" : (resultado.fornecedorVencedor || ""),
        participou: true, ganhou: resultado.resultado === "ganho",
        motivo_perda: resultado.motivoPerda || null,
        delta_percent: resultado.deltaTotalPercent || null,
        data: resultado.dataResultado, orcamento_sgd_id: resultado.orcamentoId
      });
    });
  }

  // Story 8.9: Persistir resultado no preco_historico (G4 — Série Histórica)
  if (typeof _SB_PRECO_HIST !== 'undefined' && resultado.itens) {
    const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
    const tipoHist = resultado.resultado === 'ganho' ? 'ganho' : 'perdido';
    const rows = resultado.itens.filter(i => i.precoUnitario > 0).map(i => ({
      empresa_id: empId,
      sku: i.skuBanco || i.skuVinculado || '',
      escola: resultado.escola,
      sre: pre.sre || '',
      tipo: tipoHist,
      valor: i.precoUnitario,
      custo_base: null,
      margem_pct: null,
      fonte: 'resultado_sgd',
      metadata: {
        municipio: resultado.municipio || pre.municipio || '',
        edital: resultado.orcamentoId,
        preco_vencedor: resultado.valorVencedor || null,
        fornecedor_vencedor: resultado.fornecedorVencedor || null,
        data_resultado: resultado.dataResultado
      }
    }));
    if (rows.length > 0) _SB_PRECO_HIST.insert(rows);
  }

  fecharModalResultado();
  renderSgd();
  renderKPIs();
  renderOrcamentos();
  schedulCloudSync();

  if (resultado.resultado === "ganho") {
    const partes = [];
    if (geradoLocal) partes.push("contrato local");
    if (geradoGdp) partes.push("contrato GDP" + (contratoGdpId ? " (" + contratoGdpId + ")" : ""));
    const msg = partes.length > 0
      ? `Resultado registrado — ${partes.join(" + ")} criado(s)!`
      : "Resultado registrado como ganho!";
    showToast(msg, 5000);
  } else {
    showToast("Resultado registrado — histórico atualizado");
  }
};

window.checarStatusSgd = async function(orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre) return showToast("Pré-orçamento não encontrado", 3000);

  showToast("Consultando SGD...", 2000);
  try {
    await BrowserSgdClient.login();
    if (!BrowserSgdClient.networkId) await BrowserSgdClient.listBudgets(1, 1);

    // Tentar IDs salvos primeiro
    let idSub = pre.idSubprogram;
    let idSch = pre.idSchool;
    let idBud = pre.idBudget;

    // Fallback: buscar nos orcamentos
    if (!idSub || !idSch || !idBud) {
      const orc = orcamentos.find(o => o.id === orcId || String(o.idBudget) === String(orcId));
      if (orc) {
        idSub = idSub || orc.idSubprogram;
        idSch = idSch || orc.idSchool;
        idBud = idBud || orc.idBudget;
      }
    }

    // Fallback: buscar na lista do SGD (status ENVI = enviados)
    if (!idSub || !idSch || !idBud) {
      showToast("Buscando processo " + orcId + " no SGD...", 3000);
      let found = null;
      let page = 1;
      while (!found) {
        const data = await BrowserSgdClient.listBudgets(page, 100, ["ENVI", "APRO", "RECU"]);
        const items = data.data || [];
        if (items.length === 0) break;
        found = items.find(b => String(b.idBudget) === String(orcId) || String(b.id) === String(orcId));
        if (found) break;
        const total = data.meta?.totalItems || 0;
        if (page * 100 >= total) break;
        page++;
      }
      if (found) {
        idSub = found.idSubprogram;
        idSch = found.idSchool;
        idBud = found.idBudget;
        // Salvar IDs para futuras consultas
        pre.idSubprogram = idSub;
        pre.idSchool = idSch;
        pre.idBudget = idBud;
        // Já verificar o status do supplierStatus retornado
        if (found.supplierStatus) {
          const st = found.supplierStatus;
          if (st === "APRO") { pre.status = "ganho"; pre.statusSgd = "APRO"; pre.resultadoEm = new Date().toISOString().slice(0,10); }
          else if (st === "RECU") { pre.status = "perdido"; pre.statusSgd = "RECU"; pre.resultadoEm = new Date().toISOString().slice(0,10); }
        }
        savePreOrcamentos();
      }
    }

    if (!idSub || !idSch || !idBud) {
      return showToast("Processo " + orcId + " não encontrado no SGD. Pode já ter expirado.", 4000);
    }

    const detail = await BrowserSgdClient.getBudgetDetail(idSub, idSch, idBud);
    const sgdStatus = detail.supplierStatus || detail.flSupplierStatus || "";

    if (sgdStatus === "APRO" || sgdStatus === "Aprovado") {
      pre.status = "ganho"; pre.statusSgd = "APRO"; pre.resultadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos(); renderSgd(); renderKPIs();
      // Story 6.1: Persistir resultado automático em Supabase
      _SB_RESULTADOS.upsert({
        id: "res-auto-" + Date.now(), orcamentoId: orcId, escola: pre.escola,
        municipio: pre.municipio, grupo: pre.grupo || "Geral", resultado: "ganho",
        dataResultado: pre.resultadoEm, valorProposto: pre.totalGeral,
        itens: (pre.itens || []).map(i => ({ nome: i.nome, precoUnitario: i.precoUnitario, ganhou: true })),
        contrato: { gerado: false }
      });
      showToast("APROVADO! Proposta " + orcId + " foi aceita no SGD.", 5000);
    } else if (sgdStatus === "RECU" || sgdStatus === "Recusado") {
      pre.status = "perdido"; pre.statusSgd = "RECU"; pre.resultadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos(); renderSgd(); renderKPIs();
      // Story 6.1: Persistir resultado automático em Supabase
      _SB_RESULTADOS.upsert({
        id: "res-auto-" + Date.now(), orcamentoId: orcId, escola: pre.escola,
        municipio: pre.municipio, grupo: pre.grupo || "Geral", resultado: "perdido",
        dataResultado: pre.resultadoEm, valorProposto: pre.totalGeral,
        itens: (pre.itens || []).map(i => ({ nome: i.nome, precoUnitario: i.precoUnitario, ganhou: false })),
        contrato: { gerado: false }
      });
      showToast("RECUSADO. Proposta " + orcId + " não foi aceita.", 5000);
    } else if (sgdStatus === "ENVI" || sgdStatus === "Enviado" || sgdStatus === "NAEN") {
      showToast("Aguardando resultado. Status SGD: " + sgdStatus, 3000);
    } else {
      showToast("Status SGD: " + (sgdStatus || "desconhecido"), 3000);
    }
  } catch (e) {
    showToast("Erro ao consultar SGD: " + e.message, 4000);
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
    itens: (pre.itens || []).map(item => ({
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

  if (!preOrcamento) {
    console.error('[GDP] criarContratoGdp: preOrcamento é null/undefined');
    return null;
  }

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
      gdpLog(`[GDP] Cliente criado automaticamente: ${escolaNome}`);
    }
    escolaClienteId = cliente.id;
    if (!Array.isArray(cliente.contratos_vinculados)) cliente.contratos_vinculados = [];
  } catch (e) {
    gdpWarn("[GDP] Erro ao vincular cliente:", e);
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
      // Story 9.2: Descrição completa (txDescription do SGD) tem prioridade sobre nome resumido
      descricao: item.descricao || item.nome || "",
      nomeResumido: item.nome || "",
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
  schedulCloudSync();

  // Story 9.1: Salvar contrato diretamente no Supabase (fonte de verdade)
  // index.html não carrega gdp-core.js/gdp-api.js, então usamos _SB_RESULTADOS.URL/KEY
  try {
    const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
    const sbContrato = {
      id: contrato.id,
      empresa_id: empId,
      escola: contrato.escola,
      edital: contrato.edital || '',
      objeto: contrato.objeto || '',
      fornecedor: contrato.fornecedor || '',
      status: contrato.status || 'ativo',
      itens: contrato.itens || [],
      data_apuracao: contrato.dataApuracao || now.toISOString().slice(0, 10),
      dados_extras: {
        origem: contrato.origem || 'pre-orcamento-sgd',
        municipio: contrato.municipio || '',
        sre: contrato.sre || '',
        numero: contrato.numero || '',
        escolaClienteId: contrato.escolaClienteId || null,
        orcamentoId: contrato.orcamentoId || '',
        valorTotal: contrato.valorTotal || 0
      }
    };
    fetch(_SB_RESULTADOS.URL + '/contratos', {
      method: 'POST',
      headers: Object.assign({}, _SB_RESULTADOS.headers(), { Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(sbContrato)
    }).then(res => {
      if (res.ok) gdpLog('[GDP] Contrato salvo no Supabase:', contrato.id);
      else res.text().then(t => gdpWarn('[GDP] Supabase save failed:', res.status, t));
    }).catch(e => gdpWarn('[GDP] Supabase save error:', e.message));
  } catch (e) {
    gdpWarn('[GDP] Supabase direct save failed:', e.message);
  }

  // Trigger cloud sync (backup legado)
  if (typeof schedulCloudSync === "function") schedulCloudSync();

  // Story 6.6: Persist contrato items to Supabase preco_historico
  if (typeof _SB_PRECO_HIST !== 'undefined' && contrato.itens) {
    const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
    const rows = contrato.itens.filter(i => i.precoUnitario > 0).map(i => {
      const custoBase = (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) ?
        (bancoPrecos.itens.find(b => b.item && i.descricao && b.item.toLowerCase().includes(i.descricao.toLowerCase().split(' ')[0]))?.custoBase || null) : null;
      const margemPct = (custoBase && custoBase > 0) ? Number((((i.precoUnitario - custoBase) / i.precoUnitario) * 100).toFixed(2)) : null;
      return {
        empresa_id: empId, sku: i.skuVinculado || '', escola: contrato.escola,
        tipo: 'contrato', valor: i.precoUnitario, custo_base: custoBase, margem_pct: margemPct,
        fonte: 'contrato', metadata: { contrato_id: contrato.id, edital: contrato.edital || '', fornecedor: contrato.fornecedor || '' }
      };
    });
    if (rows.length > 0) _SB_PRECO_HIST.insert(rows);
  }

  gdpLog(`[GDP] Contrato criado: ${contrato.id} — ${contrato.escola} — ${brl.format(contrato.valorTotal)}`);
  return contrato;
}

// Story 8.7: Criar contrato GDP com enriquecimento da Central de Produtos (G3)
function criarContratoGdpComCentral(orcId, preOrcamento, numContrato) {
  try {
    // FR-003: Enriquecer itens com dados da Central de Preços antes de criar contrato
    if (typeof loadBancoProdutos === 'function') loadBancoProdutos();
    const central = (typeof bancoProdutos !== 'undefined' && bancoProdutos && Array.isArray(bancoProdutos.itens)) ? bancoProdutos.itens : [];

    if (central.length > 0 && preOrcamento && preOrcamento.itens) {
      const normalize = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      for (const item of preOrcamento.itens) {
        // Se já vinculado no pré-orçamento, manter
        if (item.skuVinculado || item.produto_vinculado_id) continue;
        const descNorm = normalize(item.nome || item.descricao || "");
        if (!descNorm) continue;
        const descWords = descNorm.split(/\s+/).filter(w => w.length > 2);
        // 1) Match exato por SKU
        let match = central.find(p => p.sku && item.sku && p.sku === item.sku);
        // 2) Match exato por descrição normalizada
        if (!match) match = central.find(p => normalize(p.descricao) === descNorm);
        // 3) Match por todas as palavras significativas
        if (!match && descWords.length > 0) {
          const candidates = central.filter(p => {
            const pWords = normalize(p.descricao).split(/\s+/).filter(w => w.length > 2);
            return pWords.length > 0 && pWords.every(pw => descWords.some(dw => dw.includes(pw) || pw.includes(dw)));
          });
          // Preferir candidato com mais palavras em comum
          if (candidates.length > 0) {
            candidates.sort((a, b) => {
              const aWords = normalize(a.descricao).split(/\s+/).filter(w => w.length > 2).length;
              const bWords = normalize(b.descricao).split(/\s+/).filter(w => w.length > 2).length;
              return bWords - aWords;
            });
            match = candidates[0];
          }
        }
        if (match) {
          if (!item.ncm && match.ncm) item.ncm = match.ncm;
          if (!item.sku && match.sku) item.sku = match.sku;
          if (!item.marca && match.marca) item.marca = match.marca;
          item.skuVinculado = match.sku || match.id;
          item.produto_vinculado_id = match.id;
          // Persistir equivalência para futuras consultas
          if (typeof setGdpEquivalencia === 'function') {
            setGdpEquivalencia(item.nome || item.descricao, match.sku || match.id);
          }
        }
      }
    }

    return criarContratoGdp(orcId, preOrcamento, numContrato);
  } catch (e) {
    console.error('[GDP] Erro ao criar contrato com Central:', e);
    try {
      return criarContratoGdp(orcId, preOrcamento, numContrato);
    } catch (e2) {
      console.error('[GDP] Erro crítico ao criar contrato GDP:', e2);
      showToast('Erro ao criar contrato GDP. Verifique o console.', 5000);
      return null;
    }
  }
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

  // Story 6.6: Persist contrato unificado items to Supabase preco_historico
  if (typeof _SB_PRECO_HIST !== 'undefined' && todosItens.length > 0) {
    const empId = (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
    const rows = todosItens.filter(i => (i.precoUnitario || 0) > 0).map(i => ({
      empresa_id: empId, sku: i.skuVinculado || '', escola: contrato.escola,
      tipo: 'contrato', valor: i.precoUnitario, custo_base: null, margem_pct: null,
      fonte: 'contrato-unificado', metadata: { contrato_id: contrato.id, fornecedor: contrato.fornecedor || '' }
    }));
    if (rows.length > 0) _SB_PRECO_HIST.insert(rows);
  }

  renderPreOrcamentosLista();
  renderOrcamentos();
  showToast(`Contrato unificado criado: ${todosItens.length} itens de ${pres.length} processos — ${brl.format(valorTotal)}`);
  gdpLog(`[GDP] Contrato unificado: ${contrato.numero} — ${todosItens.length} itens — ${brl.format(valorTotal)}`);
};

function alimentarBancoComResultado(resultado) {
  if (!bancoPrecos || !bancoPrecos.itens) return;
  resultado.itens.forEach(itemRes => {
    // Bridge 3: matching melhorado — SKU primeiro, depois RadarMatcher, depois substring
    var bp = null;
    var skuRef = itemRes.skuBanco || itemRes.skuVinculado;
    if (skuRef) {
      bp = bancoPrecos.itens.find(b => b.sku === skuRef);
    }
    if (!bp && window.RadarMatcher && typeof window.RadarMatcher.match === 'function') {
      bp = window.RadarMatcher.match(itemRes.nome);
    }
    if (!bp) {
      bp = bancoPrecos.itens.find(b =>
        b.item && itemRes.nome && (b.item.toLowerCase().includes(itemRes.nome.toLowerCase()) || itemRes.nome.toLowerCase().includes(b.item.toLowerCase()))
      );
    }
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
        // Bridge 3: atualizar taxa de conversao
        var totalResultados = bp.historicoResultados.length;
        var totalGanhos = ganhos.length;
        if (totalResultados > 0) bp.taxaConversao = totalGanhos / totalResultados;
      }
      if (resultado.resultado === "perdido") {
        if (resultado.fornecedorVencedor) {
          if (!bp.concorrentes) bp.concorrentes = [];
          bp.concorrentes.push({
            nome: resultado.fornecedorVencedor,
            preco: itemRes.precoVencedor || resultado.valorVencedor,
            data: resultado.dataResultado, edital: resultado.escola,
          });
        }
        // Bridge 3: adicionar concorrente com precoVencedor mesmo sem fornecedorVencedor
        if (!resultado.fornecedorVencedor && (itemRes.precoVencedor || resultado.valorVencedor)) {
          if (!bp.concorrentes) bp.concorrentes = [];
          bp.concorrentes.push({
            nome: "Desconhecido",
            preco: itemRes.precoVencedor || resultado.valorVencedor,
            data: resultado.dataResultado, edital: resultado.escola,
          });
        }
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

// ===== Story 13.6: VARREDURA BATCH DE RESULTADOS SGD =====
window.varrerResultadosSgd = async function () {
  const btn = document.getElementById("btn-varrer-resultados");
  if (btn) { btn.disabled = true; btn.textContent = "Varrendo..."; }

  try {
    // Get all pre-orcamentos with status "enviado" (pending result)
    const pendentes = Object.entries(preOrcamentos).filter(([_, pre]) => pre.status === "enviado");
    if (pendentes.length === 0) {
      showToast("Nenhum pré-orçamento pendente de resultado.", 3000);
      if (btn) { btn.disabled = false; btn.textContent = "Atualizar Resultados"; }
      return;
    }

    await BrowserSgdClient.login();
    if (!BrowserSgdClient.networkId) await BrowserSgdClient.listBudgets(1, 1);

    let ganhos = 0, perdidos = 0, semResultado = 0, erros = 0;

    for (const [orcId, pre] of pendentes) {
      try {
        let idSub = pre.idSubprogram;
        let idSch = pre.idSchool;
        let idBud = pre.idBudget;

        if (!idSub || !idSch || !idBud) {
          // Try from orcamentos
          const orc = orcamentos.find(o => o.id === orcId || String(o.idBudget) === String(orcId));
          if (orc) { idSub = idSub || orc.idSubprogram; idSch = idSch || orc.idSchool; idBud = idBud || orc.idBudget; }
        }

        if (!idSub || !idSch || !idBud) { semResultado++; continue; }

        const detail = await BrowserSgdClient.getBudgetDetail(idSub, idSch, idBud);
        const sgdStatus = detail.supplierStatus || detail.flSupplierStatus || "";

        if (sgdStatus === "APRO" || sgdStatus === "Aprovado") {
          pre.status = "ganho"; pre.statusSgd = "APRO"; pre.resultadoEm = new Date().toISOString().slice(0, 10);
          ganhos++;
          // AC3: Auto-register result
          const resultado = {
            id: "res-auto-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
            orcamentoId: orcId, escola: pre.escola, municipio: pre.municipio,
            grupo: pre.grupo || "Geral", resultado: "ganho",
            dataResultado: pre.resultadoEm, valorProposto: pre.totalGeral,
            itens: (pre.itens || []).map(i => ({ nome: i.nome, precoUnitario: i.precoUnitario, ganhou: true })),
            contrato: { gerado: false }
          };
          const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
          resultados.push(resultado);
          localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
          _SB_RESULTADOS.upsert(resultado);
        } else if (sgdStatus === "RECU" || sgdStatus === "Recusado") {
          pre.status = "perdido"; pre.statusSgd = "RECU"; pre.resultadoEm = new Date().toISOString().slice(0, 10);
          perdidos++;
          // AC4: Get winner info from detail
          const valorVencedor = detail.vlWinnerValue || detail.valorVencedor || null;
          const fornecedorVencedor = detail.nmWinnerSupplier || detail.fornecedorVencedor || "";
          const delta = (pre.totalGeral && valorVencedor && valorVencedor > 0)
            ? parseFloat(((pre.totalGeral - valorVencedor) / valorVencedor * 100).toFixed(1)) : null;
          const resultado = {
            id: "res-auto-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
            orcamentoId: orcId, escola: pre.escola, municipio: pre.municipio,
            grupo: pre.grupo || "Geral", resultado: "perdido",
            dataResultado: pre.resultadoEm, valorProposto: pre.totalGeral,
            valorVencedor: valorVencedor, fornecedorVencedor: fornecedorVencedor,
            deltaTotalPercent: delta, motivoPerda: "preco",
            itens: (pre.itens || []).map(i => ({ nome: i.nome, precoUnitario: i.precoUnitario, ganhou: false })),
            contrato: { gerado: false }
          };
          const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
          resultados.push(resultado);
          localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
          _SB_RESULTADOS.upsert(resultado);
          alimentarBancoComResultado(resultado);
        } else {
          semResultado++;
        }
      } catch (e) {
        erros++;
        gdpWarn("[Varredura] Erro em " + orcId + ":", e.message);
      }
    }

    savePreOrcamentos();
    schedulCloudSync();
    renderSgd(); renderKPIs(); renderOrcamentos();
    showToast(`Varredura concluída: ${ganhos} ganhos, ${perdidos} perdidos, ${semResultado} aguardando${erros > 0 ? ", " + erros + " erros" : ""}.`, 5000);
  } catch (e) {
    showToast("Erro na varredura: " + e.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Atualizar Resultados"; }
  }
};

// ===== Story 13.6: IMPORTAÇÃO RETROATIVA DE HISTÓRICO =====
window.abrirImportHistorico = function () {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,.xlsx,.xls";
  input.onchange = async function () {
    if (!input.files.length) return;
    const file = input.files[0];
    const ext = file.name.split(".").pop().toLowerCase();

    try {
      let rows = [], headers = [];
      if (ext === "csv") {
        const text = await file.text();
        const lines = text.split("\n").map(l => l.trim()).filter(l => l);
        headers = lines[0].split(/[;\t,]/).map(h => h.trim());
        rows = lines.slice(1).map(l => l.split(/[;\t,]/).map(c => c.trim()));
      } else {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array" });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        if (json.length < 2) { showToast("Arquivo vazio.", 3000); return; }
        headers = json[0].map(h => String(h || "").trim());
        rows = json.slice(1).filter(r => r.some(c => c != null && c !== ""));
      }

      // Auto-map columns
      const norm = headers.map(h => (h || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const map = {
        escola: norm.findIndex(h => /escola|entidade/.test(h)),
        produto: norm.findIndex(h => /produto|item|descricao/.test(h)),
        precoProposto: norm.findIndex(h => /preco.*proposto|nosso.*preco|valor.*proposto/.test(h)),
        precoVencedor: norm.findIndex(h => /preco.*vencedor|valor.*vencedor/.test(h)),
        fornecedorVencedor: norm.findIndex(h => /fornecedor.*vencedor|vencedor/.test(h)),
        resultado: norm.findIndex(h => /resultado|status|ganho|perdido/.test(h)),
        data: norm.findIndex(h => /data|date/.test(h)),
      };

      let importados = 0, erros = 0;
      const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
      const historico = JSON.parse(localStorage.getItem("intel.historico-licitacoes.v1") || '{"items":[]}');
      const histItems = historico.items || [];

      rows.forEach(row => {
        try {
          const escola = map.escola >= 0 ? String(row[map.escola] || "").trim() : "";
          const produto = map.produto >= 0 ? String(row[map.produto] || "").trim() : "";
          const ppRaw = map.precoProposto >= 0 ? row[map.precoProposto] : 0;
          const pvRaw = map.precoVencedor >= 0 ? row[map.precoVencedor] : 0;
          const forn = map.fornecedorVencedor >= 0 ? String(row[map.fornecedorVencedor] || "").trim() : "";
          const resRaw = map.resultado >= 0 ? String(row[map.resultado] || "").trim().toLowerCase() : "";
          const dataRaw = map.data >= 0 ? String(row[map.data] || "").trim() : new Date().toISOString().slice(0, 10);

          if (!escola && !produto) return;

          const precoProposto = typeof ppRaw === 'number' ? ppRaw : parseFloat(String(ppRaw).replace(/[^\d,.\-]/g, "").replace(",", ".")) || 0;
          const precoVencedor = typeof pvRaw === 'number' ? pvRaw : parseFloat(String(pvRaw).replace(/[^\d,.\-]/g, "").replace(",", ".")) || 0;
          const resultado = /ganh|won|aprovad|sim|yes|1/.test(resRaw) ? "ganho" : "perdido";
          const delta = (precoProposto > 0 && precoVencedor > 0) ? parseFloat(((precoProposto - precoVencedor) / precoVencedor * 100).toFixed(1)) : null;

          // Parse date
          let dataStr = dataRaw;
          if (/\d{2}\/\d{2}\/\d{4}/.test(dataRaw)) {
            const [d, m, y] = dataRaw.split("/");
            dataStr = y + "-" + m + "-" + d;
          }

          // AC9: Feed resultados
          const resId = "res-retro-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4);
          resultados.push({
            id: resId, orcamentoId: "retro-" + importados, escola,
            municipio: "", grupo: "Retroativo", resultado,
            dataResultado: dataStr, valorProposto: precoProposto, valorVencedor: precoVencedor,
            fornecedorVencedor: forn, deltaTotalPercent: delta,
            motivoPerda: resultado === "perdido" ? "preco" : null,
            observacoes: "Importado retroativamente",
            itens: produto ? [{ nome: produto, precoUnitario: precoProposto, precoVencedor, ganhou: resultado === "ganho" }] : [],
            contrato: { gerado: false }
          });

          // AC9: Feed historico_licitacoes too
          histItems.push({
            id: "HIST-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
            escola, cidade: "", sre: "", produto_id: "",
            descricao_item: produto, preco_proposto: precoProposto,
            preco_vencedor: precoVencedor, empresa_vencedora: resultado === "ganho" ? "LARIUCCI" : forn,
            participou: true, ganhou: resultado === "ganho",
            motivo_perda: resultado === "perdido" ? "preco" : null,
            delta_percent: delta, data: dataStr, orcamento_sgd_id: ""
          });

          importados++;
        } catch (_) { erros++; }
      });

      localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));
      localStorage.setItem("intel.historico-licitacoes.v1", JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: histItems }));
      schedulCloudSync();
      renderHistorico(); renderKPIs();
      showToast(`Histórico importado: ${importados} registros${erros > 0 ? " (" + erros + " erros)" : ""}.`, 5000);
    } catch (e) {
      showToast("Erro ao importar: " + e.message, 4000);
    }
  };
  input.click();
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

  // Render active sub-tab (detect which one is selected)
  const activeBtn = document.querySelector("#sub-tabs-historico .rent-tab.active");
  const btnText = activeBtn ? activeBtn.textContent.trim() : "";
  let activeTab = "contratos"; // default
  if (btnText.includes("Ganho")) activeTab = "ganhos";
  else if (btnText.includes("Perdido")) activeTab = "perdidos";
  else if (btnText.includes("Anális")) activeTab = "analise";
  else if (btnText.includes("Rentab")) activeTab = "rentabilidade";
  else if (btnText.includes("Intelig")) activeTab = "inteligencia";
  else if (btnText.includes("Contrat")) activeTab = "contratos";

  // Show/hide using switchHistoricoTab to keep consistent
  switchHistoricoTab(activeTab);
}

window.switchHistoricoTab = function (tab) {
  // 1. Update tab button active state
  document.querySelectorAll("#sub-tabs-historico .rent-tab").forEach(t => t.classList.remove("active"));
  const activeBtn = document.querySelector(`#sub-tabs-historico .rent-tab[onclick*="${tab}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  // 2. Hide ALL hist- containers, then show the active one
  const allTabs = ["ganhos", "perdidos", "analise", "contratos", "rentabilidade", "inteligencia"];
  allTabs.forEach(t => {
    const el = document.getElementById("hist-" + t);
    if (el) { el.style.display = "none"; el.classList.remove("active"); }
  });
  const activeEl = document.getElementById("hist-" + tab);
  if (activeEl) { activeEl.style.display = "block"; activeEl.classList.add("active"); }

  // 3. Render content for the active tab
  if (tab === "inteligencia") { renderIntelDashboard(); return; }
  if (tab === "contratos") { if (typeof renderAprovados === 'function') renderAprovados(); return; }
  if (tab === "rentabilidade") return;

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

// ===== Story 13.7: INTELIGÊNCIA COMPETITIVA DASHBOARD =====
window.renderIntelDashboard = function () {
  const historico = loadHistoricoLicitacoes();
  if (historico.length === 0) {
    document.getElementById("intel-kpis").innerHTML = '<p style="grid-column:1/-1;color:var(--muted);text-align:center;padding:2rem;">Nenhum dado no histórico de licitações. Importe resultados ou registre manualmente.</p>';
    return;
  }

  // Live-enrich: fill missing SRE from orcamentos (always up to date after new varreduras)
  try {
    const _orcs = JSON.parse(localStorage.getItem('caixaescolar.orcamentos') || '[]');
    const _sreMap = {};
    _orcs.forEach(o => { if (o.escola && o.sre) _sreMap[o.escola] = o.sre; });
    let enriched = 0;
    historico.forEach(h => {
      if (!h.sre && h.escola && _sreMap[h.escola]) { h.sre = _sreMap[h.escola]; enriched++; }
    });
    if (enriched > 0) saveHistoricoLicitacoes(historico);
  } catch(_) {}

  // Populate filters (rebuild every time to pick up new SREs after varredura)
  const sreSel = document.getElementById("intel-filtro-sre");
  const prodSel = document.getElementById("intel-filtro-produto");
  // Merge SREs from historico AND from orcamentos (so new SREs appear immediately after varredura)
  const _orcSres = (() => { try { return JSON.parse(localStorage.getItem('caixaescolar.orcamentos') || '[]').map(o => o.sre).filter(Boolean); } catch(_) { return []; } })();
  const sres = [...new Set([...historico.map(h => h.sre).filter(Boolean), ..._orcSres])].sort();
  const produtos = [...new Set(historico.map(h => h.descricao_item).filter(Boolean))].sort();

  if (sreSel) {
    const curSre = sreSel.value;
    sreSel.innerHTML = '<option value="all">Todas SREs</option>';
    sres.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; sreSel.appendChild(o); });
    sreSel.value = curSre; // preserve selection
  }
  if (prodSel) {
    const curProd = prodSel.value;
    prodSel.innerHTML = '<option value="all">Todos Produtos</option>';
    produtos.slice(0, 100).forEach(p => { const o = document.createElement("option"); o.value = p; o.textContent = p.substring(0, 40); prodSel.appendChild(o); });
    prodSel.value = curProd;
  }

  // Apply filters
  let filtered = historico;
  const fSre = sreSel ? sreSel.value : "all";
  const fProd = prodSel ? prodSel.value : "all";
  const fDe = document.getElementById("intel-filtro-de")?.value || "";
  const fAte = document.getElementById("intel-filtro-ate")?.value || "";

  if (fSre !== "all") filtered = filtered.filter(h => h.sre === fSre);
  if (fProd !== "all") filtered = filtered.filter(h => h.descricao_item === fProd);
  if (fDe) filtered = filtered.filter(h => (h.data || "") >= fDe);
  if (fAte) filtered = filtered.filter(h => (h.data || "") <= fAte);

  // KPI Calculations
  const participacoes = filtered.filter(h => h.participou !== false);
  const ganhos = participacoes.filter(h => h.ganhou === true);
  const perdidos = participacoes.filter(h => h.ganhou === false);
  const winRate = participacoes.length > 0 ? ((ganhos.length / participacoes.length) * 100).toFixed(1) : 0;

  // Price-to-Win: median of preco_vencedor
  const precosVencedores = filtered.map(h => h.preco_vencedor).filter(v => v > 0).sort((a, b) => a - b);
  const medianaPtW = precosVencedores.length > 0
    ? (precosVencedores.length % 2 === 0
      ? (precosVencedores[precosVencedores.length / 2 - 1] + precosVencedores[precosVencedores.length / 2]) / 2
      : precosVencedores[Math.floor(precosVencedores.length / 2)])
    : 0;

  // Competitiveness Index
  const precosPropostos = filtered.map(h => h.preco_proposto).filter(v => v > 0);
  const mediaPropostos = precosPropostos.length > 0 ? precosPropostos.reduce((s, v) => s + v, 0) / precosPropostos.length : 0;
  const competIdx = medianaPtW > 0 ? (mediaPropostos / medianaPtW).toFixed(2) : "—";

  // Margin Erosion Rate (quarter-over-quarter)
  const sortedByDate = [...filtered].filter(h => h.data).sort((a, b) => a.data.localeCompare(b.data));
  let marginErosion = "—";
  if (sortedByDate.length >= 4) {
    const mid = Math.floor(sortedByDate.length / 2);
    const first = sortedByDate.slice(0, mid).filter(h => h.preco_proposto > 0 && h.preco_vencedor > 0);
    const second = sortedByDate.slice(mid).filter(h => h.preco_proposto > 0 && h.preco_vencedor > 0);
    if (first.length > 0 && second.length > 0) {
      const avgMargin1 = first.reduce((s, h) => s + ((h.preco_proposto - h.preco_vencedor) / h.preco_proposto * 100), 0) / first.length;
      const avgMargin2 = second.reduce((s, h) => s + ((h.preco_proposto - h.preco_vencedor) / h.preco_proposto * 100), 0) / second.length;
      marginErosion = (avgMargin2 - avgMargin1).toFixed(1) + "%";
    }
  }

  // Render KPIs (AC3-AC7)
  const kpiCard = (label, value, color) => `<div style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;">
    <span style="font-size:.7rem;color:var(--muted);display:block;">${label}</span>
    <strong style="font-size:1.2rem;color:${color || 'var(--text)'}">${value}</strong>
  </div>`;

  document.getElementById("intel-kpis").innerHTML = [
    kpiCard("Win Rate", winRate + "%", parseFloat(winRate) >= 50 ? '#059669' : '#ef4444'),
    kpiCard("Participações", participacoes.length, ''),
    kpiCard("Ganhos / Perdidos", ganhos.length + " / " + perdidos.length, ''),
    kpiCard("Price-to-Win (mediana)", medianaPtW > 0 ? brl.format(medianaPtW) : "—", '#2563eb'),
    kpiCard("Competitiveness Index", competIdx, parseFloat(competIdx) <= 1.0 ? '#059669' : '#d97706'),
    kpiCard("Margin Erosion", marginErosion, ''),
  ].join('');

  // AC4: Win Rate por SRE
  const bySre = {};
  participacoes.forEach(h => {
    const sre = h.sre || "Sem SRE";
    if (!bySre[sre]) bySre[sre] = { ganhos: 0, total: 0 };
    bySre[sre].total++;
    if (h.ganhou) bySre[sre].ganhos++;
  });

  const sreEntries = Object.entries(bySre).sort((a, b) => (b[1].ganhos / b[1].total) - (a[1].ganhos / a[1].total));
  document.getElementById("intel-win-rate-sre").innerHTML = `
    <h4 style="font-size:.85rem;margin-bottom:.5rem;">Win Rate por SRE</h4>
    <div class="table-wrap"><table><thead><tr><th>SRE</th><th>Ganhos</th><th>Total</th><th>Win Rate</th></tr></thead>
    <tbody>${sreEntries.map(([sre, d]) => {
      const wr = ((d.ganhos / d.total) * 100).toFixed(0);
      return `<tr><td>${escapeHtml(sre)}</td><td class="text-accent">${d.ganhos}</td><td>${d.total}</td>
        <td><span style="color:${wr >= 50 ? '#059669' : '#ef4444'};font-weight:600;">${wr}%</span></td></tr>`;
    }).join('')}</tbody></table></div>`;

  // AC6: Top 5 concorrentes
  const concCount = {};
  filtered.filter(h => h.empresa_vencedora && h.ganhou === false).forEach(h => {
    const nome = h.empresa_vencedora;
    if (!concCount[nome]) concCount[nome] = 0;
    concCount[nome]++;
  });
  const top5 = Object.entries(concCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  document.getElementById("intel-top-concorrentes").innerHTML = `
    <h4 style="font-size:.85rem;margin-bottom:.5rem;">Top 5 Concorrentes</h4>
    <div class="table-wrap"><table><thead><tr><th>Concorrente</th><th>Vitórias</th></tr></thead>
    <tbody>${top5.length > 0 ? top5.map(([nome, count], i) => {
      return `<tr><td>${i + 1}. ${escapeHtml(nome)}</td><td style="font-weight:600;">${count}</td></tr>`;
    }).join('') : '<tr><td colspan="2" style="color:var(--muted);text-align:center;">Sem dados</td></tr>'}</tbody></table></div>`;

  // AC5: Price-to-Win por produto
  const byProduct = {};
  filtered.forEach(h => {
    const prod = h.descricao_item || "Desconhecido";
    if (!byProduct[prod]) byProduct[prod] = [];
    if (h.preco_vencedor > 0) byProduct[prod].push(h.preco_vencedor);
  });

  const p2wEntries = Object.entries(byProduct)
    .filter(([_, prices]) => prices.length >= 2)
    .map(([prod, prices]) => {
      const sorted = prices.sort((a, b) => a - b);
      const mediana = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      return { prod, mediana, count: prices.length };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  document.getElementById("intel-price-to-win").innerHTML = `
    <h4 style="font-size:.85rem;margin-bottom:.5rem;">Price-to-Win por Produto (mediana vencedores)</h4>
    <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Mediana Vencedor</th><th>Registros</th></tr></thead>
    <tbody>${p2wEntries.length > 0 ? p2wEntries.map(e => {
      return `<tr><td style="font-size:.8rem;max-width:200px;">${escapeHtml(e.prod)}</td>
        <td class="font-mono text-right" style="font-weight:600;">${brl.format(e.mediana)}</td>
        <td>${e.count}</td></tr>`;
    }).join('') : '<tr><td colspan="3" style="color:var(--muted);text-align:center;">Necessário >= 2 registros por produto</td></tr>'}</tbody></table></div>`;

  // AC8: Tendência preço vencedor (últimos 12 meses)
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7)); // "2025-03"
  }

  const byMonth = {};
  months.forEach(m => byMonth[m] = []);
  filtered.filter(h => h.preco_vencedor > 0 && h.data).forEach(h => {
    const m = h.data.slice(0, 7);
    if (byMonth[m]) byMonth[m].push(h.preco_vencedor);
  });

  const monthData = months.map(m => {
    const prices = byMonth[m];
    const avg = prices.length > 0 ? prices.reduce((s, v) => s + v, 0) / prices.length : 0;
    return { month: m, avg, count: prices.length };
  });

  const maxAvg = Math.max(...monthData.map(d => d.avg).filter(v => v > 0), 1);
  const barHeight = 100;

  document.getElementById("intel-tendencia").innerHTML = `
    <h4 style="font-size:.85rem;margin-bottom:.5rem;">Tendência Preço Vencedor (12 meses)</h4>
    <div style="display:flex;align-items:flex-end;gap:4px;height:${barHeight + 30}px;overflow-x:auto;padding:0 4px;">
    ${monthData.map(d => {
      const h = d.avg > 0 ? Math.max(4, (d.avg / maxAvg) * barHeight) : 0;
      const label = d.month.slice(5); // "03"
      return `<div style="display:flex;flex-direction:column;align-items:center;min-width:36px;">
        <span style="font-size:.55rem;color:var(--muted);">${d.avg > 0 ? brl.format(d.avg) : ''}</span>
        <div style="width:24px;height:${h}px;background:${d.avg > 0 ? '#2563eb' : '#e2e8f0'};border-radius:3px 3px 0 0;margin-top:auto;"></div>
        <span style="font-size:.6rem;color:var(--muted);margin-top:2px;">${label}</span>
      </div>`;
    }).join('')}
    </div>`;
};
