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
      console.log('[Story 6.1] Resultado salvo em Supabase:', resultado.id);
    } catch (e) {
      console.warn('[Story 6.1] Fallback localStorage — Supabase indisponível:', e.message);
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
      console.warn('[Story 6.1] Supabase indisponível, usando localStorage:', e.message);
      return null;
    }
  },
  async migrateFromLocalStorage() {
    if (localStorage.getItem('resultados.migrated.v1') === 'true') return;
    const local = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || '[]');
    if (local.length === 0) { localStorage.setItem('resultados.migrated.v1', 'true'); return; }
    console.log('[Story 6.1] Migrando', local.length, 'resultados para Supabase...');
    for (const r of local) { await this.upsert(r); }
    localStorage.setItem('resultados.migrated.v1', 'true');
    console.log('[Story 6.1] Migração concluída.');
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
      console.log('[Story 6.1] Resultados sincronizados:', merged.length, 'registros');
    }
  } catch (e) {
    console.warn('[Story 6.1] Boot resultados — usando localStorage:', e.message);
  }
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

  // Delta se perdeu
  if (resultado.resultado === "perdido" && resultado.valorVencedor) {
    resultado.deltaTotalPercent = parseFloat(((resultado.valorProposto - resultado.valorVencedor) / resultado.valorVencedor * 100).toFixed(1));
  }

  // Salvar resultado
  const resultados = JSON.parse(localStorage.getItem(RESULTADOS_STORAGE_KEY) || "[]");
  resultados.push(resultado);
  localStorage.setItem(RESULTADOS_STORAGE_KEY, JSON.stringify(resultados));

  // Story 6.1: Dual-write para Supabase
  _SB_RESULTADOS.upsert(resultado);

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
      console.warn('[GDP] Contrato GDP não foi criado — retornou null');
    }
  }

  // Alimentar banco de preços
  alimentarBancoComResultado(resultado);

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
      if (res.ok) console.log('[GDP] Contrato salvo no Supabase:', contrato.id);
      else res.text().then(t => console.warn('[GDP] Supabase save failed:', res.status, t));
    }).catch(e => console.warn('[GDP] Supabase save error:', e.message));
  } catch (e) {
    console.warn('[GDP] Supabase direct save failed:', e.message);
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

  console.log(`[GDP] Contrato criado: ${contrato.id} — ${contrato.escola} — ${brl.format(contrato.valorTotal)}`);
  return contrato;
}

// Story 8.7: Criar contrato GDP com enriquecimento da Central de Produtos (G3)
function criarContratoGdpComCentral(orcId, preOrcamento, numContrato) {
  try {
    // FR-003: Enriquecer itens com dados da Central de Preços antes de criar contrato
    if (typeof loadBancoProdutos === 'function') loadBancoProdutos();
    const central = (typeof bancoProdutos !== 'undefined' && bancoProdutos.itens) ? bancoProdutos.itens : [];

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
  console.log(`[GDP] Contrato unificado: ${contrato.numero} — ${todosItens.length} itens — ${brl.format(valorTotal)}`);
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
