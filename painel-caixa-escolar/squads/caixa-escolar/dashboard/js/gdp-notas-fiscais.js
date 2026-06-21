// ===== GDP NOTAS FISCAIS MODULE =====
// Extracted from gdp-contratos.html — NF-e, SEFAZ, DANFE, cobranças

// Story 16.5 AC8: lock de idempotência por pedido — bloqueia clique duplo em
// "Gerar NF" / transmissão enquanto uma operação está em andamento para o pedido.
var _nfOpsEmAndamento = {};

// Retry helper: salva NF no Supabase com 3 tentativas
async function _saveNfToSupabaseWithRetry(nfData, maxRetries) {
  var retries = maxRetries || 3;
  for (var attempt = 1; attempt <= retries; attempt++) {
    try {
      if (window.gdpApi) await window.gdpApi.notas_fiscais.save(nfData);
      return true;
    } catch (e) {
      gdpWarn('[NF] Supabase save attempt ' + attempt + '/' + retries + ' failed:', e.message);
      if (attempt < retries) await new Promise(function(r) { setTimeout(r, 1000 * attempt); });
    }
  }
  // Todas tentativas falharam — salvar em fila pendente para retry no próximo boot
  try {
    var pending = JSON.parse(localStorage.getItem('gdp.nf-pending-save.v1') || '[]');
    if (!pending.find(function(p) { return p.id === nfData.id; })) {
      pending.push(nfData);
      localStorage.setItem('gdp.nf-pending-save.v1', JSON.stringify(pending));
      gdpWarn('[NF] Salvo na fila pendente para retry:', nfData.id);
    }
  } catch(_) {}
  return false;
}

// Flush fila de NFs pendentes no boot (retry de saves que falharam)
setTimeout(function() {
  try {
    var pending = JSON.parse(localStorage.getItem('gdp.nf-pending-save.v1') || '[]');
    if (pending.length > 0 && window.gdpApi) {
      gdpLog('[NF] Flushing ' + pending.length + ' pending NF saves...');
      var remaining = [];
      (async function() {
        for (var p of pending) {
          try {
            await window.gdpApi.notas_fiscais.save(p);
            gdpLog('[NF] Pending save OK:', p.id);
          } catch(e) { remaining.push(p); }
        }
        localStorage.setItem('gdp.nf-pending-save.v1', JSON.stringify(remaining));
        if (remaining.length > 0) gdpWarn('[NF] ' + remaining.length + ' NFs still pending after retry');
      })();
    }
  } catch(_) {}
}, 5000);

// --- Block 1: NF utilities, fiscal config, invoice building, SEFAZ ---
function getNotaFiscalByPedido(pedidoId) {
  return notasFiscais.find((nf) => nf.pedidoId === pedidoId) || null;
}

function getContaReceberByNota(notaId) {
  return contasReceber.find((item) => item.origemTipo === "nota_fiscal" && item.origemId === notaId) || null;
}

function normalizeFormaPagamento(value) {
  const normalized = normalizeContaFormaRegistro(value);
  return normalized || "boleto";
}

function isContaEmAtraso(conta) {
  if (!conta?.vencimento || conta.status === "recebida") return false;
  const hoje = new Date();
  const baseHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [ano, mes, dia] = String(conta.vencimento).split("-").map(Number);
  if (!ano || !mes || !dia) return false;
  const vencimento = new Date(ano, mes - 1, dia);
  return vencimento < baseHoje;
}

function isContaPagarAtrasada(conta) {
  if (!conta?.vencimento || conta.status === "paga") return false;
  const hoje = new Date();
  const baseHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [ano, mes, dia] = String(conta.vencimento).split("-").map(Number);
  if (!ano || !mes || !dia) return false;
  const vencimento = new Date(ano, mes - 1, dia);
  return vencimento < baseHoje;
}

function normalizeContaPagarStatus(conta) {
  const status = String(conta?.status || "").trim().toLowerCase();
  if (status === "paga") return "paga";
  // Story 20.13: pagamento parcial — tem valor pago mas ainda há saldo
  if (status === "parcial") return "parcial";
  if (isContaPagarAtrasada(conta)) return "atrasada";
  if (status === "emitida") return "emitida";
  return "em_aberto";
}

function normalizeContaReceberStatus(conta) {
  const status = String(conta?.status || "").trim().toLowerCase();
  if (status === "recebida") return "recebida";
  if (isContaEmAtraso(conta)) return "atrasada";
  if (["emitida", "cobranca_emitida", "cobranca_automatica_disparada"].includes(status)) return "emitida";
  return "em_aberto";
}

function getContaPagarStatusMeta(conta) {
  const normalized = normalizeContaPagarStatus(conta);
  return CONTAS_PAGAR_STATUS_TABS.find((item) => item.key === normalized) || CONTAS_PAGAR_STATUS_TABS[1];
}

function getContaReceberStatusMeta(conta) {
  const normalized = normalizeContaReceberStatus(conta);
  return CONTAS_RECEBER_STATUS_TABS.find((item) => item.key === normalized) || CONTAS_RECEBER_STATUS_TABS[1];
}

function toggleContaPagarForm(force) {
  const card = document.getElementById("cp-form-card");
  if (!card) return;
  const open = typeof force === "boolean" ? force : card.classList.contains("hidden");
  card.classList.toggle("hidden", !open);
  if (open) {
    const emissaoEl = document.getElementById("cp-data-emissao");
    if (emissaoEl && !emissaoEl.value) emissaoEl.value = new Date().toISOString().split("T")[0];
  }
}

function toggleContaReceberForm(force) {
  const card = document.getElementById("cr-form-card");
  if (!card) return;
  const open = typeof force === "boolean" ? force : card.classList.contains("hidden");
  if (open) {
    const emissaoEl = document.getElementById("cr-data-emissao");
    if (emissaoEl && !emissaoEl.value) emissaoEl.value = new Date().toISOString().split("T")[0];
  }
  card.classList.toggle("hidden", !open);
}

function abrirJanelaRelatorioFinanceiro(titulo, headers, rows) {
  const html = `
    <html><head><title>${titulo}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:20px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #d1d5db;padding:8px;text-align:left;font-size:12px}
      th{text-transform:uppercase;background:#f3f4f6;font-size:11px}
      .right{text-align:right}
    </style></head><body>
      <h1>${titulo}</h1>
      <table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload = () => window.print();<\/script>
    </body></html>`;
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function ensurePedidoFiscalData(pedido) {
  if (!pedido.cliente) pedido.cliente = {};
  const clienteContrato = pedido.contratoId ? getClientePrincipalDoContrato(pedido.contratoId) : null;
  const snapshotContrato = pedido.contratoId ? getClienteFiscalSnapshotDoContrato(pedido.contratoId) : null;
  // Story 4.81: Fallback — buscar escola em usuarios por nome ou CNPJ (pedidos do portal)
  let clienteUsuario = null;
  if (!clienteContrato && typeof usuarios !== 'undefined') {
    const nomeBusca = (pedido.cliente?.nome || pedido.escola || '').toLowerCase().trim();
    const cnpjBusca = (pedido.cliente?.cnpj || '').replace(/\D/g, '');
    if (cnpjBusca.length >= 11) {
      clienteUsuario = usuarios.find(u => (u.cnpj || '').replace(/\D/g, '') === cnpjBusca);
    }
    if (!clienteUsuario && nomeBusca) {
      clienteUsuario = usuarios.find(u => (u.nome || '').toLowerCase().trim() === nomeBusca);
    }
  }
  const c = pedido.cliente;
  c.id = clienteContrato?.id || clienteUsuario?.id || snapshotContrato?.id || c.id || "";
  c.nome = clienteContrato?.nome || clienteUsuario?.nome || snapshotContrato?.nome || c.nome || pedido.escola || "";
  c.cnpj = clienteContrato?.cnpj || clienteUsuario?.cnpj || snapshotContrato?.cnpj || c.cnpj || "";
  c.ie = clienteContrato?.ie || clienteUsuario?.ie || snapshotContrato?.ie || c.ie || "ISENTO";
  c.email = clienteContrato?.email || clienteUsuario?.email || snapshotContrato?.email || c.email || "";
  c.telefone = clienteContrato?.telefone || clienteUsuario?.telefone || snapshotContrato?.telefone || c.telefone || "";
  c.responsavel = clienteContrato?.responsavel || clienteUsuario?.responsavel || clienteUsuario?.contato || snapshotContrato?.responsavel || c.responsavel || "";
  // Extrair endereço: pode estar em campos diretos OU dentro de endereco{}
  const _s = (v) => (typeof v === 'string' && v) ? v : "";
  const _addr = (obj) => (obj && typeof obj.endereco === 'object' && obj.endereco) || {};
  const ccAddr = _addr(clienteContrato);
  const cuAddr = _addr(clienteUsuario);
  const snAddr = _addr(snapshotContrato);
  const cAddr = _addr(c);
  c.logradouro = _s(clienteContrato?.logradouro) || _s(ccAddr.logradouro) || _s(clienteUsuario?.logradouro) || _s(cuAddr.logradouro) || _s(snapshotContrato?.logradouro) || _s(snAddr.logradouro) || _s(c.logradouro) || _s(cAddr.logradouro) || "";
  c.numero = _s(clienteContrato?.numero) || _s(ccAddr.numero) || _s(clienteUsuario?.numero) || _s(cuAddr.numero) || _s(snapshotContrato?.numero) || _s(snAddr.numero) || _s(c.numero) || _s(cAddr.numero) || "";
  c.complemento = _s(clienteContrato?.complemento) || _s(ccAddr.complemento) || _s(clienteUsuario?.complemento) || _s(cuAddr.complemento) || _s(snapshotContrato?.complemento) || _s(snAddr.complemento) || _s(c.complemento) || _s(cAddr.complemento) || "";
  c.bairro = _s(clienteContrato?.bairro) || _s(ccAddr.bairro) || _s(clienteUsuario?.bairro) || _s(cuAddr.bairro) || _s(snapshotContrato?.bairro) || _s(snAddr.bairro) || _s(c.bairro) || _s(cAddr.bairro) || "";
  c.cep = _s(clienteContrato?.cep) || _s(ccAddr.cep) || _s(clienteUsuario?.cep) || _s(cuAddr.cep) || _s(snapshotContrato?.cep) || _s(snAddr.cep) || _s(c.cep) || _s(cAddr.cep) || "";
  c.cidade = _s(clienteContrato?.municipio) || _s(ccAddr.cidade) || _s(clienteUsuario?.cidade) || _s(clienteUsuario?.municipio) || _s(cuAddr.cidade) || _s(snapshotContrato?.cidade) || _s(snAddr.cidade) || _s(c.cidade) || _s(cAddr.cidade) || "";
  c.uf = clienteContrato?.uf || clienteUsuario?.uf || snapshotContrato?.uf || c.uf || "MG";
  c.indicador_contribuinte = clienteContrato?.indicador_contribuinte || clienteUsuario?.indicador_contribuinte || snapshotContrato?.indicador_contribuinte || c.indicador_contribuinte || "9";
  pedido.itens = (pedido.itens || []).map((item, idx) => {
    const baseItem = {
      ...item,
      itemNum: item.itemNum || idx + 1,
      descricao: item.descricao || `Item ${idx + 1}`,
      qtd: Number(item.qtd || 0),
      precoUnitario: Number(item.precoUnitario || 0),
      unidade: item.unidade || "UN",
      ncm: item.ncm || "",
      sku: item.sku || item.codigoBarras || ""
    };
    const contratoItem = pedido.contratoId ? getContratoItemForPedidoItem(pedido.contratoId, baseItem) : null;
    // Buscar produto vinculado na central de produtos (descrição da central tem prioridade)
    const _vinculadoSku = contratoItem?.skuVinculado || baseItem.skuVinculado;
    const _vinculadoId = contratoItem?.produto_vinculado_id;
    const _prodVinc = _vinculadoSku ? (typeof estoqueIntelProdutos !== 'undefined' ? estoqueIntelProdutos.find(p => p.sku === _vinculadoSku || p.id === _vinculadoId) : null) : null;
    return {
      ...baseItem,
      // Descrição: produto vinculado (central) > pedido original > contrato
      descricao: _prodVinc?.nome || baseItem.descricao || contratoItem?.descricao || `Item ${idx + 1}`,
      precoUnitario: Number(baseItem.precoUnitario || contratoItem?.precoUnitario || 0),
      unidade: baseItem.unidade || _prodVinc?.unidade_base || contratoItem?.unidade || "UN",
      ncm: baseItem.ncm || _prodVinc?.ncm || contratoItem?.ncm || "",
      sku: _vinculadoSku || baseItem.sku || contratoItem?.sku || ""
    };
  });
  return pedido;
}

function askInvoiceMode() {
  const raw = (window.prompt('Tipo de nota para este pedido:\n\nDigite REAL para NF-e real\nDigite MANUAL para nota emitida fora do GDP', 'REAL') || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "MANUAL") return "manual_externa";
  return "nfe_real";
}

function isNotaFiscalReal(nf) {
  return (nf?.tipoNota || "manual_externa") === "nfe_real";
}

function getNotaFiscalTipoLabel(nf) {
  return isNotaFiscalReal(nf) ? "NF-e Real" : "Manual Externa";
}

function getNotaFiscalTipoClass(nf) {
  return isNotaFiscalReal(nf) ? "real" : "manual";
}

function getNotaFiscalResumoOperacional(nf) {
  if (!nf) return "Pedido sem nota fiscal emitida";
  if (isNotaFiscalReal(nf)) return `NF-e real ${nf.numero || nf.id} em fluxo SEFAZ`;
  return `Nota manual externa ${nf.numero || nf.id}`;
}

function canDeleteNotaFiscal(nf) {
  if (!nf) return false;
  return !(isNotaFiscalReal(nf) && ["autorizada", "cancelada", "cancelamento_solicitado"].includes(String(nf.status || "")));
}

function canRequestCancelNotaFiscal(nf) {
  return !!nf && isNotaFiscalReal(nf) && nf.status === "autorizada";
}

function canTransmitNotaFiscal(nf) {
  if (!nf || !isNotaFiscalReal(nf)) return false;
  return !["autorizada", "cancelada", "cancelamento_solicitado"].includes(String(nf.status || ""));
}

function validatePedidoForInvoice(pedido, tipoNota = "nfe_real") {
  const data = ensurePedidoFiscalData(pedido);
  const missing = [];
  // Fix: só exigir cliente vinculado ao contrato se o pedido NÃO tiver dados fiscais do cliente preenchidos
  // Se data.cliente já tem nome+cnpj, não precisa do vínculo formal com o contrato
  if (tipoNota === "nfe_real" && !data.cliente.nome && !data.cliente.cnpj) {
    const clienteVinculado = pedido.contratoId ? getClientePrincipalDoContrato(pedido.contratoId) : null;
    const snapshotContrato = pedido.contratoId ? getClienteFiscalSnapshotDoContrato(pedido.contratoId) : null;
    if (!clienteVinculado && !(snapshotContrato?.nome || snapshotContrato?.cnpj)) missing.push("cliente vinculado ao contrato");
  }
  if (!data.cliente.nome) missing.push("nome do cliente");
  if (tipoNota === "nfe_real" && !data.cliente.cnpj) missing.push("documento fiscal do cliente");
  if (tipoNota === "nfe_real" && !data.cliente.logradouro) missing.push("logradouro");
  if (tipoNota === "nfe_real" && !data.cliente.numero) missing.push("numero");
  if (tipoNota === "nfe_real" && !data.cliente.bairro) missing.push("bairro");
  if (tipoNota === "nfe_real" && !data.cliente.cep) missing.push("CEP");
  if (tipoNota === "nfe_real" && !data.cliente.cidade) missing.push("cidade");
  if (tipoNota === "nfe_real" && !data.cliente.uf) missing.push("UF");
  if (!data.itens.length) missing.push("itens do pedido");
  data.itens.forEach((item, idx) => {
    if (tipoNota === "nfe_real" && !item.ncm) missing.push(`NCM do item ${idx + 1}`);
    if (tipoNota === "nfe_real" && !item.unidade) missing.push(`unidade do item ${idx + 1}`);
    if (tipoNota === "nfe_real" && !item.sku) missing.push(`SKU do item ${idx + 1}`);
  });
  return [...new Set(missing)];
}

function getFiscalConfig() {
  try {
    return JSON.parse(localStorage.getItem("nexedu.config.notas-fiscais") || "{}");
  } catch (_) {
    return {};
  }
}

function getConfiguredBankAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem("nexedu.config.contas-bancarias") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function getBankApiConfig() {
  try {
    return JSON.parse(localStorage.getItem("nexedu.config.bank-api") || "{}");
  } catch (_) {
    return {};
  }
}

// Story 20.6/20.7: espelho do getFinancasConfig (padrão multi-page — lê a mesma chave de localStorage)
function getFinancasConfig() {
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem("nexedu.config.financas") || "{}"); } catch (_) { cfg = {}; }
  const prazo = Number(cfg.prazoRecebimentoDias);
  const prazoFinal = prazo > 0 ? prazo : 5; // fallback padrão de recebimento
  return {
    prazoRecebimentoDias: prazoFinal,
    condicaoPagamentoPadrao: cfg.condicaoPagamentoPadrao || String(prazoFinal),
    contaCobrancaPadraoId: cfg.contaCobrancaPadraoId || ""
  };
}

function getConfiguredDefaultBankAccount() {
  const fiscalConfig = getFiscalConfig();
  const accounts = getConfiguredBankAccounts();
  return accounts.find((item) => item.id === fiscalConfig.contaBancariaPadraoId)
    || accounts.find((item) => item.padrao)
    || null;
}

function getEffectiveBankProvider(conta = null, nota = null) {
  const config = getBankApiConfig();
  return conta?.integracoes?.bancaria?.provider
    || nota?.integracoes?.bancaria?.provider
    || config.provider
    || "asaas";
}

function getEffectiveBankAmbiente(conta = null, nota = null) {
  const config = getBankApiConfig();
  return conta?.integracoes?.bancaria?.ambiente
    || nota?.integracoes?.bancaria?.ambiente
    || config.ambiente
    || "sandbox";
}

function applyRealBankChargeResult(conta, nf, normalized = {}, protocol = "") {
  const actor = getAuditActor();
  const forma = String((normalized.billingType || conta?.forma || nf?.cobranca?.forma || "")).toLowerCase() === "pix" ? "pix" : "boleto";
  const providerStatus = normalized.status || "pendente";
  const integrationStatus = providerStatus === "recebida"
    ? "recebida_provider"
    : providerStatus === "confirmada"
      ? "confirmada_provider"
      : "aceita_provider";

  if (conta) {
    conta.forma = forma;
    conta.status = providerStatus === "recebida" ? "recebida" : "cobranca_emitida";
    conta.cobranca = {
      ...(conta.cobranca || {}),
      status: providerStatus === "recebida" ? "recebida_provider" : "emitida_provider_real",
      provider: normalized.provider || "",
      providerChargeId: normalized.providerChargeId || "",
      invoiceUrl: normalized.invoiceUrl || "",
      bankSlipUrl: normalized.bankSlipUrl || "",
      linhaDigitavel: normalized.linhaDigitavel || conta.cobranca?.linhaDigitavel || "",
      pixCopiaECola: normalized.pix?.payload || conta.cobranca?.pixCopiaECola || "",
      qrCode: normalized.pix?.encodedImage || conta.cobranca?.qrCode || "",
      nossoNumero: normalized.nossoNumero || "",
      paidAt: normalized.paidAt || conta.cobranca?.paidAt || ""
    };
    conta.conciliacao = {
      ...(conta.conciliacao || { referencia: genId("CNCL") }),
      status: providerStatus === "recebida" ? "conciliado_api_bancaria" : (conta.conciliacao?.status || "aguardando_webhook"),
      updatedAt: new Date().toISOString(),
      updatedBy: actor
    };
    conta.audit = {
      ...(conta.audit || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actor
    };
    setIntegrationState(conta, "bancaria", {
      status: integrationStatus,
      protocol,
      provider: normalized.provider || "",
      providerChargeId: normalized.providerChargeId || "",
      lastAction: "cobranca_real_provider",
      rawStatus: normalized.rawStatus || "",
      paidAt: normalized.paidAt || "",
      invoiceUrl: normalized.invoiceUrl || ""
    });
  }

  if (nf) {
    nf.cobranca = {
      ...(nf.cobranca || {}),
      forma,
      status: providerStatus === "recebida" ? "recebida_provider" : "emitida_provider_real",
      referencia: normalized.providerChargeId || nf.cobranca?.referencia || "",
      invoiceUrl: normalized.invoiceUrl || nf.cobranca?.invoiceUrl || "",
      bankSlipUrl: normalized.bankSlipUrl || nf.cobranca?.bankSlipUrl || "",
      linhaDigitavel: normalized.linhaDigitavel || nf.cobranca?.linhaDigitavel || "",
      pixCopiaECola: normalized.pix?.payload || nf.cobranca?.pixCopiaECola || "",
      qrCode: normalized.pix?.encodedImage || nf.cobranca?.qrCode || "",
      metadata: {
        ...(nf.cobranca?.metadata || {}),
        providerChargeId: normalized.providerChargeId || "",
        nossoNumero: normalized.nossoNumero || "",
        paidAt: normalized.paidAt || ""
      }
    };
    nf.audit = {
      ...(nf.audit || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actor
    };
    setIntegrationState(nf, "bancaria", {
      status: integrationStatus,
      protocol,
      provider: normalized.provider || "",
      providerChargeId: normalized.providerChargeId || "",
      lastAction: "cobranca_real_provider",
      rawStatus: normalized.rawStatus || "",
      paidAt: normalized.paidAt || ""
    });
  }
}

async function emitirOuSincronizarCobrancaReal(contaId, options = {}) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return false;
  const nota = conta.notaFiscalId ? notasFiscais.find((item) => item.id === conta.notaFiscalId) || null : null;
  const provider = getEffectiveBankProvider(conta, nota);
  const ambiente = getEffectiveBankAmbiente(conta, nota);
  const action = conta.cobranca?.providerChargeId ? "bank-charge-sync" : "bank-charge-create";
  const actor = getAuditActor();

  setIntegrationState(conta, "bancaria", {
    status: "solicitada_provider",
    lastAction: action === "bank-charge-create" ? "solicitar_cobranca_real" : "sincronizar_cobranca_real",
    provider,
    ambiente
  });
  if (nota) {
    setIntegrationState(nota, "bancaria", {
      status: "solicitada_provider",
      lastAction: action === "bank-charge-create" ? "solicitar_cobranca_real" : "sincronizar_cobranca_real",
      provider,
      ambiente
    });
  }
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: actor };
  if (nota) nota.audit = { ...(nota.audit || {}), updatedAt: new Date().toISOString(), updatedBy: actor };
  saveContasReceber();
  if (nota) saveNotasFiscais();
  if (!options.silent) renderAll();

  try {
    const resp = await fetch("/api/gdp-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        provider,
        ambiente,
        conta,
        nota,
        providerChargeId: conta.cobranca?.providerChargeId || conta.integracoes?.bancaria?.providerChargeId || ""
      })
    });
    const data = await resp.json().catch(() => ({}));
    const result = data.result || {};
    if (!resp.ok || !data.ok || !result.ok) throw new Error(result.message || data.error || `HTTP ${resp.status}`);

    applyRealBankChargeResult(conta, nota, result.normalized || {}, "");
    saveContasReceber();
    if (nota) saveNotasFiscais();

    queueGdpIntegration("conta_receber", action === "bank-charge-create" ? "criar_titulo_provider" : "sincronizar_titulo_provider", conta.id, {
      contaReceberId: conta.id,
      notaFiscalId: nota?.id || "",
      provider,
      ambiente,
      providerChargeId: result.normalized?.providerChargeId || "",
      status: result.normalized?.status || "",
      rawStatus: result.normalized?.rawStatus || "",
      invoiceUrl: result.normalized?.invoiceUrl || "",
      pixPayload: result.normalized?.pix?.payload || ""
    }, {
      channel: "bancaria",
      onSuccess: (queueData) => {
        applyRealBankChargeResult(conta, nota, result.normalized || {}, queueData.protocol || "");
        saveContasReceber();
        if (nota) saveNotasFiscais();
      },
      onError: (err) => {
        updateContaReceberIntegration(conta.id, "bancaria", {
          status: "falha_auditoria_provider",
          error: err.message,
          lastAction: action === "bank-charge-create" ? "criar_titulo_provider" : "sincronizar_titulo_provider",
          provider
        });
        if (nota) updateNotaFiscalIntegration(nota.id, "bancaria", {
          status: "falha_auditoria_provider",
          error: err.message,
          lastAction: action === "bank-charge-create" ? "criar_titulo_provider" : "sincronizar_titulo_provider",
          provider
        });
      }
    });

    if (!options.silent) {
      showToast(`Cobranca ${action === "bank-charge-create" ? "emitida" : "sincronizada"} no ${String(provider || "").toUpperCase()}.`, 4000);
      renderAll();
    }
    return true;
  } catch (err) {
    updateContaReceberIntegration(conta.id, "bancaria", {
      status: "falha_provider",
      error: err.message,
      lastAction: action === "bank-charge-create" ? "criar_titulo_provider" : "sincronizar_titulo_provider",
      provider,
      ambiente
    });
    if (nota) updateNotaFiscalIntegration(nota.id, "bancaria", {
      status: "falha_provider",
      error: err.message,
      lastAction: action === "bank-charge-create" ? "criar_titulo_provider" : "sincronizar_titulo_provider",
      provider,
      ambiente
    });
    conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: actor };
    saveContasReceber();
    if (nota) saveNotasFiscais();
    if (!options.silent) {
      renderAll();
      showToast(`Falha ao integrar cobranca com ${String(provider || "").toUpperCase()}: ${err.message}`, 5000);
    }
    return false;
  }
}

async function sincronizarCobrancaProvider(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  if (!(conta.cobranca?.providerChargeId || conta.integracoes?.bancaria?.providerChargeId)) {
    showToast("Esta conta ainda nao possui identificador externo para sincronizacao.", 4000);
    return;
  }
  await emitirOuSincronizarCobrancaReal(contaId, { silent: false });
}

// ============================================================
// Numeração NF-e — SOLUÇÃO DEFINITIVA
// ============================================================
// Lógica: encontra o PRIMEIRO NÚMERO LIVRE a partir de um mínimo.
// "Livre" = não usado por NF com status "autorizada".
// Rascunhos, rejeitadas, canceladas NÃO bloqueiam número.
// Isso preenche lacunas automaticamente (ex: 1434, 1437).
// ============================================================

// Story 16.5 FIX-2: extrai o nNF embutido na chave de acesso NF-e (chNFe).
// Layout (44 díg.): cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1).
// O nNF ocupa as posições 26-34 (índices 25..34, base 0). Retorna número (sem zeros à esquerda)
// ou "" se a chave for inválida.
function extrairNumeroDaChaveNfe(chave) {
  var ch = String(chave || "").replace(/\D/g, "");
  if (ch.length !== 44) return "";
  var nNF = ch.slice(25, 34);
  var num = parseInt(nNF, 10);
  return (num && num > 0) ? String(num) : "";
}

// Story 20.14 AC1: prova de autorização real da SEFAZ, mais robusta que _isAutorizado.
// _isAutorizado exige prot + chNFe + cStat 100/150 na MESMA resposta HTTP; respostas
// inconsistentes faziam a nota nascer sem número e sem título (cobrança). A chave de
// acesso (44 díg.) + protocolo são a prova definitiva: se ambos existem, a SEFAZ
// autorizou de fato, independentemente do cStat ter chegado naquele instante.
// Aceita tanto o objeto nf (nf.sefaz.chaveAcesso/protocolo) quanto valores já extraídos.
function temProvaAutorizacao(nf) {
  if (!nf) return false;
  var chave = String(nf?.sefaz?.chaveAcesso || nf?.chaveAcesso || "").replace(/\D/g, "");
  var protocolo = String(nf?.sefaz?.protocolo || nf?.protocolo || "");
  return chave.length === 44 && protocolo.length > 0;
}

// Retorna Set de números já usados por NFs AUTORIZADAS
function _getNumerosAutorizados() {
  try {
    const nfs = unwrapData(JSON.parse(localStorage.getItem("gdp.notas-fiscais.v1") || "[]"));
    return new Set(nfs.filter(function(nf) { return nf.status === "autorizada"; }).map(function(nf) { return parseInt(nf.numero) || 0; }));
  } catch(_) { return new Set(); }
}

// Retorna o piso mínimo para busca de número livre.
// Story 16.5 FIX-3: o piso é ancorado no MAIOR número REALMENTE autorizado (fonte
// da verdade SEFAZ) e no counter local — NÃO no config.proximoNumero, que pode estar
// adiantado e causava off-by-one entre preview (peek) e consumo. config.proximoNumero
// só é honrado quando NÃO fica abaixo desse piso real. Mesma lógica de peekProximoNumeroNf
// para garantir que preview == número consumido.
function _getNumeroMinimo() {
  var maxAutorizada = 0;
  try {
    _getNumerosAutorizados().forEach(function(n) { if (n > maxAutorizada) maxAutorizada = n; });
  } catch(_) {}
  var localCounter = parseInt(localStorage.getItem("gdp.nf-counter") || "0", 10);
  var piso = Math.max(localCounter, maxAutorizada) + 1;
  var nfConfig = JSON.parse(localStorage.getItem("nexedu.config.notas-fiscais") || "{}");
  var configNum = parseInt(nfConfig.proximoNumero, 10);
  // Honra config apenas se estiver no piso real ou acima (preenchimento intencional de lacuna).
  if (configNum && configNum > 0 && configNum >= piso) piso = configNum;
  return piso;
}

// Encontra o primeiro número livre >= minimo que não está em usados
function _encontrarPrimeiroLivre(minimo, usados) {
  var num = minimo;
  var tentativas = 0;
  while (usados.has(num) && tentativas < 500) { num++; tentativas++; }
  return num;
}

// PEEK: retorna o próximo número livre SEM consumir (para preview/exibição).
// Story 16.5 FIX-3: reusa EXATAMENTE o piso de _getNumeroMinimo() (mesma fonte da
// verdade do consumo) — garante que o número exibido no preview seja idêntico ao
// número que será consumido na transmissão (sem off-by-one).
function peekProximoNumeroNf() {
  try {
    var usados = _getNumerosAutorizados();
    var piso = _getNumeroMinimo();
    return String(_encontrarPrimeiroLivre(piso, usados));
  } catch(_) {
    return String(Date.now()).slice(-6);
  }
}

// CONSUMIR: retorna o número E incrementa (SOMENTE para transmissão efetiva à SEFAZ)
async function consumirProximoNumeroNf() {
  var empresaId = typeof gdpApi !== 'undefined' ? gdpApi.getEmpresaId() : getEmpresaId();
  var usados = _getNumerosAutorizados();
  var minimo = _getNumeroMinimo();
  var num = _encontrarPrimeiroLivre(minimo, usados);

  // Calcular próximo livre APÓS este (adiciona o atual como "usado" para a busca)
  usados.add(num);
  var proximo = _encontrarPrimeiroLivre(num + 1, usados);

  // Salvar próximo no config
  try {
    var nfConfig = JSON.parse(localStorage.getItem("nexedu.config.notas-fiscais") || "{}");
    nfConfig.proximoNumero = String(proximo);
    nfConfig.updatedAt = new Date().toISOString();
    localStorage.setItem("nexedu.config.notas-fiscais", JSON.stringify(nfConfig));
    localStorage.setItem("gdp.nf-counter", String(num));
    if (typeof gdpApi !== 'undefined') {
      gdpApi.nf_counter.save({ empresa_id: empresaId, ultimo_numero: num }).catch(function() {});
    }
    console.log("[NF-e] Numero CONSUMIDO:", num, "| Proximo livre:", proximo);
  } catch(_) {}
  return String(num);
}

// getProximoNumeroNf CONSOME o número — uso RESTRITO a transmissão SEFAZ.
// NÃO usar para preview/exibição — use peekProximoNumeroNf() para isso.
async function getProximoNumeroNf() {
  return consumirProximoNumeroNf();
}

// Utilitário: forçar próximo número (para preencher lacunas ou corrigir sequência)
// Uso: setProximoNumeroNf(1434) — a próxima NF sairá com 1434 (se livre)
function setProximoNumeroNf(numero) {
  var n = parseInt(numero, 10);
  if (!n || n <= 0) { console.error("[NF-e] Numero invalido:", numero); return; }
  var nfConfig = JSON.parse(localStorage.getItem("nexedu.config.notas-fiscais") || "{}");
  nfConfig.proximoNumero = String(n);
  nfConfig.updatedAt = new Date().toISOString();
  localStorage.setItem("nexedu.config.notas-fiscais", JSON.stringify(nfConfig));
  localStorage.setItem("gdp.nf-counter", String(n - 1));
  var usados = _getNumerosAutorizados();
  var efetivo = _encontrarPrimeiroLivre(n, usados);
  console.log("[NF-e] proximoNumero FORCADO para", n, "| Efetivo (primeiro livre):", efetivo);
  if (typeof showToast === "function") showToast("Proximo numero NF-e configurado: " + efetivo, 4000);
  return efetivo;
}

// Sync counter from DB to localStorage on boot (for display purposes only)
// Lê tanto 'counter' quanto 'ultimo_numero' para compatibilidade
async function syncNfCounterFromCloud() {
  try {
    if (typeof gdpApi !== 'undefined' && gdpApi.nf_counter) {
      const row = await gdpApi.nf_counter.get();
      const valor = row ? (row.ultimo_numero || row.counter || 0) : 0;
      if (valor) {
        localStorage.setItem("gdp.nf-counter", String(valor));
        gdpLog("[NF-e] Counter sincronizado do DB:", valor);
      }
      return;
    }
    // Fallback: fetch direto
    const empresaId = typeof getEmpresaId === 'function' ? getEmpresaId() : '';
    const resp = await fetch(SUPABASE_URL + "/rest/v1/nf_counter?empresa_id=eq." + encodeURIComponent(empresaId) + "&limit=1", {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    const rows = await resp.json();
    if (rows.length) {
      const valor = rows[0].ultimo_numero || rows[0].counter || 0;
      if (valor) {
        localStorage.setItem("gdp.nf-counter", String(valor));
        gdpLog("[NF-e] Counter sincronizado do DB:", valor);
      }
    }
  } catch(_) {}
}

function buildObsCompletaNF(pedido, contaPadrao, fiscalConfig) {
  const parts = [];
  // Observacao configurada pelo usuario (config global)
  if (fiscalConfig.observacoes) parts.push(fiscalConfig.observacoes);
  // Observacao do contrato (campo "Observacoes replicadas nos pedidos")
  const contrato = pedido.contratoId ? contratos.find(c => c.id === pedido.contratoId) : null;
  if (contrato?.observacoes) parts.push(contrato.observacoes);
  // Observacao da escola (portal)
  if (pedido.obs && pedido.obs !== (contrato?.observacoes || "")) parts.push("OBS ESCOLA: " + pedido.obs);
  // Dados bancarios da conta padrao
  if (contaPadrao) {
    const bankParts = [];
    if (!fiscalConfig.observacoes || !fiscalConfig.observacoes.includes("DADOS PARA PAGAMENTO")) {
      bankParts.push("DADOS PARA PAGAMENTO:");
      if (contaPadrao.titular) bankParts.push("Titular: " + contaPadrao.titular);
      if (contaPadrao.documento) bankParts.push("CNPJ/CPF: " + contaPadrao.documento);
      if (contaPadrao.banco) bankParts.push("Banco: " + contaPadrao.banco + (contaPadrao.codigo ? " (" + contaPadrao.codigo + ")" : ""));
      if (contaPadrao.agencia) bankParts.push("Agencia: " + contaPadrao.agencia);
      if (contaPadrao.conta) bankParts.push("Conta: " + contaPadrao.conta + (contaPadrao.tipo ? " (" + contaPadrao.tipo + ")" : ""));
      if (contaPadrao.pix) bankParts.push("Chave PIX: " + contaPadrao.pix);
      if (bankParts.length > 1) parts.push(bankParts.join(" | "));
    }
  }
  return parts.filter(Boolean).join(" | ");
}

function buildInvoiceFromOrder(pedido, tipoNota) {
  const now = new Date();
  const nfId = genId("NF");
  const actor = getAuditActor();
  const fiscalData = ensurePedidoFiscalData({ ...pedido, cliente: { ...(pedido.cliente || {}) }, itens: (pedido.itens || []).map(i => ({ ...i })) });
  const fiscalConfig = getFiscalConfig();
  const contaPadrao = getConfiguredDefaultBankAccount();
  const bankApiConfig = getBankApiConfig();
  let numeroInformado = "";
  let serieInformada = fiscalConfig.serie || "1";
  let chaveInformada = "";
  if (tipoNota === "manual_externa") {
    numeroInformado = (window.prompt("Informe o numero da nota fiscal emitida no outro sistema.", "") || "").trim();
    if (!numeroInformado) {
      showToast("Numero da nota externa obrigatorio para registro manual.", 4000);
      return null;
    }
    serieInformada = (window.prompt("Informe a serie da nota fiscal.", "1") || "1").trim() || "1";
    chaveInformada = (window.prompt("Informe a chave de acesso, se ja possuir.", "") || "").trim();
  }
  return {
    id: nfId,
    tipoNota,
    numero: tipoNota === "manual_externa" ? numeroInformado : "",
    serie: serieInformada || "1",
    pedidoId: pedido.id,
    contratoId: pedido.contratoId || "",
    cliente: fiscalData.cliente,
    emitidaEm: now.toISOString(),
    valor: Number(pedido.valor || 0),
    status: tipoNota === "nfe_real" ? "rascunho_nf_real" : "registrada_externamente",
    origem: "gdp",
    itens: fiscalData.itens,
    sefaz: {
      status: tipoNota === "nfe_real" ? "validacao_pendente" : "emitida_fora_do_gdp",
      lote: genId("LOTE"),
      protocolo: "",
      chaveAcesso: chaveInformada
    },
    vencimento: pedido.pagamento?.vencimento || calcularVencimentoPagamento(pedido.data || pedido.dataEntrega, pedido.pagamento?.condicao || "28"),
    cobranca: {
      status: (pedido.pagamento?.forma || (contaPadrao?.pix && fiscalConfig.destacarPix ? "pix" : "boleto")) === "pix" ? "pix_pronto" : "gerada",
      forma: pedido.pagamento?.forma || (contaPadrao?.pix && fiscalConfig.destacarPix ? "pix" : "boleto"),
      referencia: genId("COB"),
      geradaEm: now.toISOString(),
      contaBancariaId: pedido.pagamento?.contaBancaria?.id || contaPadrao?.id || "",
      metadata: {
        contaApelido: contaPadrao?.apelido || "",
        banco: contaPadrao?.banco || "",
        agencia: contaPadrao?.agencia || "",
        conta: contaPadrao?.conta || "",
        pix: contaPadrao?.pix || "",
        carteira: bankApiConfig.carteira || "",
        provider: bankApiConfig.provider || "",
        destacarPix: Boolean(fiscalConfig.destacarPix),
        observacoes: fiscalConfig.observacoes || ""
      }
    },
    documentos: {
      numeroManual: tipoNota === "manual_externa",
      danfeUrl: "",
      xmlUrl: "",
      observacao: buildObsCompletaNF(pedido, contaPadrao, fiscalConfig) || (tipoNota === "manual_externa" ? "numero_informado_manual" : "emissao_real_pendente")
    },
    parametros: {
      ambiente: fiscalConfig.ambiente || "homologacao",
      naturezaOperacao: fiscalConfig.naturezaOperacao || "",
      cfopPadrao: fiscalConfig.cfop || "",
      regimeTributario: fiscalConfig.regime || "simples",
      prazoEmissaoHoras: Number(fiscalConfig.prazoEmissaoHoras || 0)
    },
    integracoes: {
      sefaz: {
        status: tipoNota === "manual_externa" ? "controle_manual" : "validacao_pendente",
        lastAction: tipoNota === "manual_externa" ? "numero_externo_informado" : "preparar_nf_real"
      },
      bancaria: {
        status: bankApiConfig.ativo ? "api_configurada" : "fila_local",
        lastAction: bankApiConfig.ativo ? "preparar_envio_api_bancaria" : "gerar_cobranca",
        provider: bankApiConfig.provider || "",
        ambiente: bankApiConfig.ambiente || "sandbox",
        boleto: Boolean(bankApiConfig.boleto),
        pix: Boolean(bankApiConfig.pix),
        conciliacao: Boolean(bankApiConfig.conciliacao),
        contaId: bankApiConfig.contaId || contaPadrao?.id || ""
      }
    },
    audit: {
      createdAt: now.toISOString(),
      createdBy: actor,
      updatedAt: now.toISOString(),
      updatedBy: actor
    }
  };
}

function buildReceivableFromInvoice(invoice) {
  const issueDate = new Date(invoice.emitidaEm || Date.now());
  // Story 21.1 (UX-F9): o vencimento da conta a receber é SEMPRE calculado a partir da
  // emissão da NF + prazo configurado (config Finanças). NÃO reutilizar invoice.vencimento,
  // que é herdado da data do pedido na criação da NF (gdp-notas-fiscais.js:789) e faria o
  // cálculo correto (Story 20.7) nunca executar.
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + getFinancasConfig().prazoRecebimentoDias);
  const dueDateStr = dueDate.toISOString().slice(0, 10);
  const contaPadrao = getConfiguredDefaultBankAccount();
  const bankApiConfig = getBankApiConfig();
  return {
    id: genId("CR"),
    origemTipo: "nota_fiscal",
    origemId: invoice.id,
    notaFiscalId: invoice.id,
    pedidoId: invoice.pedidoId,
    descricao: `Recebimento NF ${invoice.numero || invoice.id}`,
    categoria: "faturamento",
    cliente: invoice.cliente?.nome || "",
    forma: invoice.cobranca?.forma || "boleto",
    valor: Number(invoice.valor || 0),
    vencimento: dueDateStr,
    dataEmissao: issueDate.toISOString().split("T")[0],
    status: "pendente",
    automacao: {
      whatsapp: false,
      email: true,
      ultimoDisparo: ""
    },
    integracoes: {
      bancaria: {
        status: bankApiConfig.ativo ? "api_configurada" : "fila_local",
        lastAction: bankApiConfig.ativo ? "preparar_registro_no_banco" : "criar_titulo",
        provider: bankApiConfig.provider || "",
        ambiente: bankApiConfig.ambiente || "sandbox",
        boleto: Boolean(bankApiConfig.boleto),
        pix: Boolean(bankApiConfig.pix),
        conciliacao: Boolean(bankApiConfig.conciliacao),
        contaId: bankApiConfig.contaId || contaPadrao?.id || ""
      },
      comunicacao: {
        status: "nao_disparada",
        policy: "whatsapp_somente_em_atraso"
      }
    },
    cobranca: {
      status: invoice.cobranca?.forma === "pix" ? "pix_pronto" : "boleto_gerado",
      pixCopiaECola: contaPadrao?.pix ? contaPadrao.pix : '',
      contaBancariaId: contaPadrao?.id || "",
      banco: contaPadrao?.banco || "",
      agencia: contaPadrao?.agencia || "",
      conta: contaPadrao?.conta || "",
      pix: contaPadrao?.pix || "",
      carteira: bankApiConfig.carteira || "",
      bankApiProvider: bankApiConfig.provider || ""
    },
    contaBancaria: contaPadrao ? {
      id: contaPadrao.id,
      apelido: contaPadrao.apelido || "",
      banco: contaPadrao.banco || "",
      agencia: contaPadrao.agencia || "",
      conta: contaPadrao.conta || "",
      pix: contaPadrao.pix || ""
    } : null
  };
}

function registerStockExitFromInvoice(invoice) {
  const movementDate = invoice.emitidaEm || new Date().toISOString();
  const actor = getAuditActor();
  (invoice.itens || []).forEach((item) => {
    estoqueMovimentos.push({
      id: genId("EST"),
      tipo: "saida",
      modo: "nota_fiscal",
      sku: item.sku || item.codigoBarras || item.itemNum || "",
      descricao: item.descricao || "",
      categoria: "faturamento",
      quantidade: Number(item.qtd || 0),
      referencia: invoice.id,
      data: movementDate,
      operador: actor
    });
  });
  saveEstoqueMovimentos();
}

function getProjectedNegativeStock(pedido) {
  const saldoAtual = new Map();
  estoqueMovimentos.forEach((mov) => {
    const key = mov.sku || mov.descricao;
    const atual = saldoAtual.get(key) || 0;
    saldoAtual.set(key, atual + ((mov.tipo === "entrada" ? 1 : -1) * Number(mov.quantidade || 0)));
  });
  const negativos = [];
  (pedido.itens || []).forEach((item) => {
    const key = item.sku || item.descricao;
    if (!saldoAtual.has(key)) return;
    const projetado = (saldoAtual.get(key) || 0) - Number(item.qtd || 0);
    if (projetado < 0) negativos.push({ item: item.descricao || key, saldoProjetado: projetado });
  });
  return negativos;
}

async function gerarNotaFiscalPedido(pedidoId) {
  const pedido = pedidos.find((x) => x.id === pedidoId);
  if (!pedido) return;
  // Story 16.5 AC8: guard de idempotência — bloquear clique duplo enquanto há
  // geração/transmissão em andamento para o mesmo pedido.
  _nfOpsEmAndamento = _nfOpsEmAndamento || {};
  if (_nfOpsEmAndamento[pedidoId]) {
    showToast(`Geracao de NF ja em andamento para o pedido ${pedidoId}. Aguarde.`, 3500);
    return;
  }
  _nfOpsEmAndamento[pedidoId] = true;
  try {
  const nfExistente = getNotaFiscalByPedido(pedidoId);
  if (nfExistente && nfExistente.status === "autorizada") {
    showToast(`Pedido ${pedidoId} ja possui nota fiscal autorizada.`, 3500);
    return;
  }
  // Se nota existe mas está rejeitada/pendente, remover para gerar nova
  if (nfExistente && nfExistente.status !== "autorizada") {
    // Story 16.5 FIX-5: remover também a cobrança órfã vinculada à NF removida,
    // para não acumular cobranças duplicadas a cada regeração.
    const contaOrfa = getContaReceberByNota(nfExistente.id);
    if (contaOrfa) {
      contasReceber = contasReceber.filter((c) => c.id !== contaOrfa.id);
      saveContasReceber();
    }
    notasFiscais = notasFiscais.filter(n => n.id !== nfExistente.id);
    saveNotasFiscais();
  }

  const tipoNota = askInvoiceMode();
  if (!tipoNota) {
    showToast("Operacao cancelada.", 2500);
    return;
  }

  const missing = validatePedidoForInvoice(pedido, tipoNota);
  if (missing.length) {
    showToast(`Pedido sem base fiscal completa para ${tipoNota === "nfe_real" ? "NF-e real" : "nota manual"}: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`, 5500);
    return;
  }

  const negativos = getProjectedNegativeStock(pedido);
  if (negativos.length && !confirm(`Atencao: a emissao desta NF projeta saldo negativo para ${negativos.length} item(ns).\n\nPrimeiro item: ${negativos[0].item}\nSaldo projetado: ${negativos[0].saldoProjetado}\n\nDeseja continuar mesmo assim?`)) {
    return;
  }

  const invoice = buildInvoiceFromOrder(pedido, tipoNota);
  if (!invoice) return;
  // Story 16.5 FIX-1: NÃO consumir número na criação do rascunho. O número de
  // NF-e real é consumido UMA única vez na transmissão (transmitirHomologacaoNota),
  // ancorado na autorização da SEFAZ. Notas manuais externas já trazem invoice.numero.
  notasFiscais.push(invoice);
  saveNotasFiscais();

  // Story 16.5 FIX-4: a cobrança (receivable) NÃO é mais criada de forma otimista
  // aqui para NF-e real — ela é criada SOMENTE após autorização da SEFAZ
  // (em transmitirHomologacaoNota). Notas manuais externas (controle manual, sem
  // transmissão) mantêm a criação imediata da cobrança.
  let receivable = null;
  if (tipoNota !== "nfe_real") {
    receivable = buildReceivableFromInvoice(invoice);
    contasReceber.push(receivable);
    saveContasReceber();
  }

  if (tipoNota === "nfe_real") {
    // Story 2.1 AC-2: Validar itens ANTES de transmitir — bloquear se 0, confirmar contagem
    const qtdItens = (pedido.itens || []).length;
    if (qtdItens === 0) {
      showToast("ERRO: Pedido sem itens — impossivel gerar NF-e. Adicione itens ao pedido primeiro.", 5000);
      console.error("[NF-e] BLOQUEADO: pedido", pedido.id, "sem itens. Abortando.");
      return;
    }
    // Validar que cada item tem dados mínimos
    const itensInvalidos = (pedido.itens || []).filter(i => !i.descricao || !i.qtd || Number(i.qtd) <= 0);
    if (itensInvalidos.length > 0) {
      showToast("ERRO: " + itensInvalidos.length + " item(ns) sem descricao ou quantidade. Corrija antes de gerar NF-e.", 5000);
      console.error("[NF-e] Itens invalidos:", itensInvalidos);
      return;
    }
    const detalhesItens = (pedido.itens || []).map((i, idx) => `  ${idx+1}. ${i.descricao} — ${i.qtd} x R$${Number(i.precoUnitario||0).toFixed(2)} (NCM: ${i.ncm || 'N/A'})`).join("\n");
    const nfNumeroPreview = peekProximoNumeroNf();
    if (!confirm("GERAR NF-e REAL\n\n" + "NUMERO DA NOTA: " + nfNumeroPreview + "\n" + "Serie: " + (invoice.serie || "1") + "\n" + "Cliente: " + (pedido.escola || "cliente") + "\n" + "Valor Total: " + brl.format(pedido.valor || 0) + "\n\n" + qtdItens + " item(ns):\n" + detalhesItens + "\n\nConfirma transmissao a SEFAZ?")) return;
    gdpLog("[NF-e] Gerando nota com", qtdItens, "itens. Pedido:", pedido.id);
    console.table((pedido.itens||[]).map((i,idx) => ({ "#": idx+1, descricao: i.descricao, qtd: i.qtd, preco: i.precoUnitario, ncm: i.ncm })));

    try {
      // Tentar API Vercel primeiro, fallback para servidor local
      // IMPORTANTE: NÃO consumir número aqui — peek apenas para preview/validação.
      // O número será consumido SOMENTE em transmitirHomologacaoNota().
      let resp;
      const nfeNumero = peekProximoNumeroNf();
      const nfeObs = invoice.documentos?.observacao || "";
      const nfeOverrides = { numero: nfeNumero, observacao: nfeObs };
      try {
        resp = await fetch("/api/gdp-integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "nfe-sefaz-preview", pedido, overrides: nfeOverrides }),
          signal: AbortSignal.timeout(20000),
        });
      } catch (_) {
        resp = await fetch("http://localhost:8082/api/nfe/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedido, overrides: nfeOverrides }),
          signal: AbortSignal.timeout(15000),
        });
      }
      const data = await resp.json().catch(() => ({}));
      // Story 2.1 AC-3: se validação XSD falhou, mostrar erros legíveis
      if (resp.status === 422 && data.validationErrors) {
        const errosList = data.validationErrors.map((e, i) => `${i+1}. ${e}`).join("\n");
        alert("ERRO DE VALIDACAO — NF-e nao pode ser gerada:\n\n" + errosList + "\n\nCorrija os dados do pedido e tente novamente.");
        console.error("[NF-e] Validacao XSD falhou:", data.validationErrors);
        throw new Error("Validacao estrutural falhou: " + data.validationErrors.length + " erro(s)");
      }
      if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      invoice.sefaz.preview = data.payload;
      invoice.sefaz.xmlPreview = data.xmlPreview || null;
      invoice.sefaz.xmlDsigPreview = data.xmlDsigPreview || null;
      invoice.sefaz.lotePreview = data.lotePreview || null;
      invoice.sefaz.autorizacaoPreview = data.autorizacaoPreview || null;
      setIntegrationState(invoice, "sefaz", {
        status: data.autorizacaoPreview?.url ? "autorizacao_preview_pronta" : (data.xmlDsigPreview?.ok ? "xmldsig_preview_pronta" : "payload_preparado"),
        lastAction: "nfe_sefaz_preview",
        ambiente: data.payload?.ambiente || "",
        assinaturaMode: data.xmlDsigPreview?.mode || "",
        accessKey: data.xmlPreview?.accessKey || "",
        loteId: data.lotePreview?.loteId || "",
        endpoint: data.autorizacaoPreview?.url || ""
      });
      saveNotasFiscais();
    } catch (err) {
      setIntegrationState(invoice, "sefaz", {
        status: "preview_falhou",
        lastAction: "nfe_sefaz_preview",
        error: err.message
      });
      saveNotasFiscais();
    }
  }

  updateNotaFiscalIntegration(invoice.id, "sefaz", {
    status: tipoNota === "manual_externa" ? "controle_manual" : "validacao_pendente",
    lastAction: tipoNota === "manual_externa" ? "numero_externo_informado" : "preparar_nf_real",
    accessKey: invoice.sefaz?.chaveAcesso || ""
  });
  // Story 16.5 FIX-4: cobrança só existe para nota manual externa neste ponto.
  // Para NF-e real, a cobrança é criada após autorização SEFAZ.
  if (receivable) {
    updateContaReceberIntegration(receivable.id, "bancaria", {
      status: "titulo_local",
      lastAction: "criar_titulo_local"
    });
    updateNotaFiscalIntegration(invoice.id, "bancaria", {
      status: "titulo_local",
      lastAction: "criar_titulo_local"
    });
  }
  // Story 4.56 AC-3: NÃO enviar email na criação do rascunho — apenas após autorização SEFAZ
  // dispararEmailNotaEBoletoAutomatico() será chamado após transmissão autorizada

  registerStockExitFromInvoice(invoice);

  pedido.fiscal = {
    notaFiscalId: invoice.id,
    status: invoice.status,
    tipoNota: invoice.tipoNota,
    cobrancaId: receivable ? receivable.id : "",
    updatedAt: new Date().toISOString(),
    updatedBy: getAuditActor()
  };
  pedido.status = "faturado";
  savePedidos(pedido.id); // Story 20.17: save seletivo
  // Story 20.17 (AC2): seguir o pedido para a aba "Faturado" em vez de deixá-lo "sumir".
  if (typeof setPedidoStatusTab === 'function') setPedidoStatusTab('faturado');
  renderAll();
  const msgCobranca = receivable ? " registrada com conta a receber vinculada." : " registrada. Conta a receber sera criada apos autorizacao SEFAZ.";
  showToast(`${getNotaFiscalTipoLabel(invoice)} ${invoice.numero || invoice.id}${msgCobranca}`, 4500);
  } finally {
    // Story 16.5 AC8: liberar o lock de idempotência ao concluir.
    if (_nfOpsEmAndamento) delete _nfOpsEmAndamento[pedidoId];
  }
}

function savePedidoFiscalData(pedidoId, opts) {
  // Story 21.12: opts.silent evita savePedidos/render/toast quando chamado por salvarPedidoCompleto
  // (que persiste e re-renderiza uma única vez ao final, sem perder edições por re-render no meio).
  const silent = opts && opts.silent;
  const pedido = pedidos.find((item) => item.id === pedidoId);
  if (!pedido) return;
  ensurePedidoFiscalData(pedido);
  const map = {
    nome: `fiscal-nome-${pedidoId}`,
    cnpj: `fiscal-cnpj-${pedidoId}`,
    ie: `fiscal-ie-${pedidoId}`,
    email: `fiscal-email-${pedidoId}`,
    telefone: `fiscal-telefone-${pedidoId}`,
    logradouro: `fiscal-logradouro-${pedidoId}`,
    numero: `fiscal-numero-${pedidoId}`,
    complemento: `fiscal-complemento-${pedidoId}`,
    bairro: `fiscal-bairro-${pedidoId}`,
    cep: `fiscal-cep-${pedidoId}`,
    cidade: `fiscal-cidade-${pedidoId}`,
    uf: `fiscal-uf-${pedidoId}`,
    indicador_contribuinte: `fiscal-indicador-${pedidoId}`
  };
  Object.entries(map).forEach(([field, elementId]) => {
    const el = document.getElementById(elementId);
    if (el) pedido.cliente[field] = (el.value || "").trim();
  });

  (pedido.itens || []).forEach((item, idx) => {
    const ncmEl = document.getElementById(`fiscal-item-ncm-${pedidoId}-${idx}`);
    const unEl = document.getElementById(`fiscal-item-un-${pedidoId}-${idx}`);
    const skuEl = document.getElementById(`fiscal-item-sku-${pedidoId}-${idx}`);
    if (ncmEl) item.ncm = (ncmEl.value || "").trim();
    if (unEl) item.unidade = (unEl.value || "").trim() || "UN";
    if (skuEl) item.sku = (skuEl.value || "").trim();
  });

  pedido.audit = {
    ...(pedido.audit || {}),
    fiscalUpdatedAt: new Date().toISOString(),
    fiscalUpdatedBy: getAuditActor()
  };
  if (silent) return; // Story 21.12: persistência/render/toast ficam a cargo de salvarPedidoCompleto
  savePedidos();
  renderPedidos();
  showToast(`Dados fiscais do pedido ${pedidoId} salvos.`, 3000);
}

async function autorizarNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  if (!isNotaFiscalReal(nf)) {
    showToast("Nota manual externa nao pode ser autorizada pela SEFAZ dentro do GDP.", 4000);
    return;
  }
  const actor = getAuditActor();
  nf.status = "autorizada";
  nf.sefaz.status = "autorizada";
  nf.sefaz.protocolo = genId("SEFAZ");
  nf.sefaz.chaveAcesso = `${Math.floor(10000000000000000000000000000000000000000000 + Math.random() * 89999999999999999999999999999999999999999999)}`;
  nf.audit = {
    ...(nf.audit || {}),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    authorizedAt: new Date().toISOString(),
    authorizedBy: actor
  };
  saveNotasFiscais();

  // Persist to Supabase with retry (prevent NF loss like 1475/1476)
  _saveNfToSupabaseWithRetry({
    id: nf.id, numero: nf.numero, serie: nf.serie, valor: nf.valor,
    status: nf.status, pedidoId: nf.pedidoId, contratoId: nf.contratoId,
    tipoNota: nf.tipoNota, emitidaEm: nf.emitidaEm, cliente: nf.cliente,
    itens: nf.itens, sefaz: nf.sefaz, chaveAcesso: nf.sefaz?.chaveAcesso,
    protocolo: nf.sefaz?.protocolo,
    xmlAutorizado: nf.sefaz?.xmlAutorizado || nf.sefaz?.autorizacaoPreview || '',
    cobranca: nf.cobranca, documentos: nf.documentos, audit: nf.audit
  });

  const pedido = pedidos.find((item) => item.id === nf.pedidoId);
  if (pedido) {
    pedido.fiscal = { ...(pedido.fiscal || {}), notaFiscalId: nf.id, status: "autorizada", updatedAt: new Date().toISOString(), updatedBy: actor };
    savePedidos();
  }

  const conta = getContaReceberByNota(nf.id);
  if (conta) {
    setIntegrationState(conta, "bancaria", { status: "autorizada_pronta_para_cobranca", lastAction: "autorizar_nota_fiscal" });
    saveContasReceber();
  }

  queueGdpIntegration("nota_fiscal", "autorizar_sefaz", nf.id, {
    notaFiscalId: nf.id,
    numero: nf.numero,
    chaveAcesso: nf.sefaz.chaveAcesso,
    protocolo: nf.sefaz.protocolo,
    valor: nf.valor
  }, {
    channel: "sefaz",
    onSuccess: (data) => updateNotaFiscalIntegration(nf.id, "sefaz", { status: "autorizada_backend", protocol: data.protocol || "", lastAction: "autorizar_sefaz" }),
    onError: (err) => updateNotaFiscalIntegration(nf.id, "sefaz", { status: "falha_envio", error: err.message, lastAction: "autorizar_sefaz" })
  });

  if (conta) {
    await emitirOuSincronizarCobrancaReal(conta.id, { silent: true });
  }

  // Bridge 5: NF Saída → Banco (preço real faturado)
  if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens && nf.itens) {
    nf.itens.forEach(function(item) {
      var sku = item.skuVinculado || item.sku;
      if (!sku) return;
      var bp = bancoPrecos.itens.find(function(b) { return b.sku === sku; });
      if (bp) {
        if (!bp.propostas) bp.propostas = [];
        bp.propostas.push({ escola: nf.cliente?.nome || '', preco: item.precoUnitario, data: new Date().toISOString().slice(0,10), tipo: 'nf_saida', nfNumero: nf.numero });
        bp.margemReal = bp.custoBase > 0 ? ((item.precoUnitario - bp.custoBase) / bp.custoBase) : null;
      }
    });
    saveBancoLocal();
  }

  renderAll();
  showToast(`NF ${nf.numero} autorizada. ${conta ? "Cobranca real enviada ao provider." : "Sem conta a receber vinculada."}`, 4000);

  // Disparo automático de email ao autorizar NF
  await dispararEmailNotaEBoletoAutomatico(nf.id, conta?.id || null, { manual: false });
}

async function transmitirHomologacaoNota(notaId) {
  // Story 16.5 AC8: lock de idempotência por pedido (definido após resolver a NF).
  let _lockPedidoId = null;
  try {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) { showToast("NF não encontrada: " + notaId, 3500); return; }
  if (!isNotaFiscalReal(nf)) {
    showToast("Transmissao SEFAZ disponivel apenas para NF-e real.", 3500);
    return;
  }
  if (!canTransmitNotaFiscal(nf)) {
    showToast("Esta NF-e real ja possui estado fiscal final e nao pode ser retransmitida.", 4000);
    return;
  }
  const pedido = pedidos.find((item) => item.id === nf.pedidoId);
  if (!pedido) {
    showToast("Pedido vinculado nao encontrado para transmissao.", 3500);
    return;
  }
  // Story 16.5 AC8: bloquear transmissão concorrente para o mesmo pedido.
  _nfOpsEmAndamento = _nfOpsEmAndamento || {};
  if (_nfOpsEmAndamento[nf.pedidoId]) {
    showToast(`Transmissao ja em andamento para o pedido ${nf.pedidoId}. Aguarde.`, 3500);
    return;
  }
  _nfOpsEmAndamento[nf.pedidoId] = true;
  _lockPedidoId = nf.pedidoId;

  // Sincronizar itens do pedido para a NF (pega NCM/descrição atualizados)
  if (pedido.itens && pedido.itens.length) {
    pedido.itens.forEach((pi, idx) => {
      if (nf.itens[idx]) {
        if (pi.ncm) nf.itens[idx].ncm = pi.ncm;
        if (pi.descricao) nf.itens[idx].descricao = pi.descricao;
        if (pi.unidade) nf.itens[idx].unidade = pi.unidade;
        if (pi.sku) nf.itens[idx].sku = pi.sku;
      }
    });
  }

  // Pré-conferência ANTES de consumir — mostra preview do número que SAIRÁ
  const previewNumero = nf.numero && nf.numero !== "0" ? nf.numero : peekProximoNumeroNf();
  const itensResumo = (nf.itens || []).map((i, idx) => `  ${idx+1}. ${i.descricao} (NCM: ${i.ncm || 'N/A'})`).join("\n");
  if (!confirm("TRANSMITIR NF-e A SEFAZ\n\nNUMERO DA NOTA: " + previewNumero + "\nSerie: " + (nf.serie || "1") + "\nCliente: " + (nf.cliente?.nome || pedido.escola || "-") + "\nValor: " + brl.format(nf.valor || pedido.valor || 0) + "\n\n" + (nf.itens||[]).length + " item(ns):\n" + itensResumo + "\n\nConfirma transmissao?")) return;

  // Consumir número SOMENTE após confirmação do usuário — single point of consumption
  if (!nf.numero || nf.numero === "0") {
    nf.numero = await consumirProximoNumeroNf();
  }
  const novoNumero = nf.numero;
  // Persistir imediatamente para não perder o número em caso de falha
  saveNotasFiscais();

  const nfObs = nf.documentos?.observacao || "";

  // Limpar chave/protocolo de previews anteriores para evitar conflito na SEFAZ
  // A API vai gerar nova chave de acesso consistente com o número atual
  if (!nf.sefaz.protocolo) {
    nf.sefaz.chaveAcesso = "";
  }
  delete nf.sefaz.xmlPreview;
  delete nf.sefaz.xmlDsigPreview;
  delete nf.sefaz.lotePreview;
  delete nf.sefaz.autorizacaoPreview;

  setIntegrationState(nf, "sefaz", { status: "transmissao_em_preparo", lastAction: "nfe_sefaz_transmitir" });
  saveNotasFiscais();
  showToast("Transmitindo NF " + novoNumero + " para SEFAZ...", 8000);
  renderAll();

  try {
    // Tentar API Vercel primeiro, fallback para servidor local
    let resp;
    try {
      resp = await fetch("/api/gdp-integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nfe-sefaz-emitir", pedido, overrides: { numero: novoNumero, observacao: nfObs } }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (localErr) {
      gdpWarn("[NF-e] Vercel indisponível, tentando servidor local...");
      resp = await fetch("http://localhost:8082/api/nfe/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, overrides: { numero: novoNumero, observacao: nfObs } }),
        signal: AbortSignal.timeout(30000),
      });
    }
    const data = await resp.json().catch(() => ({}));
    // Story 2.1 AC-3: validação XSD na transmissão
    if (resp.status === 422 && data.validationErrors) {
      const errosList = data.validationErrors.map((e, i) => `${i+1}. ${e}`).join("\n");
      alert("ERRO DE VALIDACAO — Transmissao BLOQUEADA:\n\n" + errosList + "\n\nCorrija os dados e tente novamente.");
      console.error("[NF-e] Validacao XSD falhou na transmissao:", data.validationErrors);
      throw new Error("Validacao estrutural falhou: " + data.validationErrors.length + " erro(s)");
    }
    const result = data.result || {};
    if (!resp.ok || !data.ok) throw new Error(result.message || data.error || `HTTP ${resp.status}`);

    nf.sefaz.transmissao = result;
    // Story 4.57 AC-2: preservar preview (emitente/destinatario) após transmissão
    if (result.preview && !nf.sefaz.preview) nf.sefaz.preview = result.preview;
    if (result.preview) nf.sefaz.preview = { ...(nf.sefaz.preview || {}), ...result.preview };
    // Story 4.83: cStat 100/150 = autorizada. 539 (duplicidade) = rejeitada (pode ser outra nota com mesmo número)
    var _cStat = String(result.parsed?.cStat || "");
    // Story 16.6: "autorizada" exige PROVA real da SEFAZ — protocolo (prot) E chave (chNFe)
    // preenchidos. Sem essa prova, cStat 100/150 (ou flag parsed.autorizado) NÃO basta:
    // respostas inconsistentes geravam status "autorizada" sem autorização real (fantasma
    // não-excluível). Esta é a ÚNICA flag de autorização — todas as ações pós-transmissão
    // (audit, cobrança, email, banco) passam a referenciá-la para manter coerência.
    var _temProvaSefaz = !!(result.parsed?.prot) && !!(result.parsed?.chNFe);
    var _cStatSucesso = (_cStat === "100" || _cStat === "150");

    // Story 20.14: gravar protocolo/chave ANTES de classificar — assim a prova de
    // autorização (temProvaAutorizacao) considera valores já persistidos em nf.sefaz,
    // inclusive os herdados de reconsultas anteriores (|| nf.sefaz?.protocolo/chaveAcesso).
    nf.sefaz.protocolo = result.parsed?.prot || nf.sefaz?.protocolo || "";
    nf.sefaz.chaveAcesso = result.parsed?.chNFe || nf.sefaz?.chaveAcesso || "";

    // Story 20.14 AC1/AC10: prova real de autorização = chave (44 díg.) + protocolo.
    // É o critério que passa a gatear número, título (cobrança) e save, pois é robusto
    // a respostas HTTP inconsistentes (cStat ausente no instante) que faziam a NF-e
    // nascer sem número e sem título. _isAutorizado (cStat 100/150 + prova) continua
    // sendo a evidência "completa", mas a prova de chave+protocolo já basta.
    var _temProvaAut = temProvaAutorizacao(nf);

    // Classificação de status (Story 16.6 + 20.14 AC10):
    //  - autorizada: tem prova real da SEFAZ (chave+protocolo). Coerente com os gates
    //    de número/título/save — evita estado híbrido (nota com número/título porém
    //    status não-autorizado, que quebraria _getNumerosAutorizados/piso/canDelete).
    //  - rejeitada: cStat de rejeição real (≠ 100/150) E sem prova.
    //  - transmissao_realizada: sem prova e sem cStat de rejeição (pendente de reconsulta).
    var _sefazStatus;
    if (_temProvaAut) {
      _sefazStatus = "autorizada";
    } else if (_cStat && !_cStatSucesso) {
      _sefazStatus = "rejeitada";
    } else {
      _sefazStatus = "transmissao_realizada";
    }
    if (_cStatSucesso && !_temProvaSefaz && !_temProvaAut) {
      console.warn("[NF-e] cStat " + _cStat + " sem protocolo/chave — NAO marcada autorizada (Story 16.6). Reconsultar SEFAZ.");
    }
    nf.sefaz.status = _sefazStatus;
    // Story 16.5 FIX-2 + Story 20.14 AC2/AC11: ancorar o número na fonte da verdade da
    // SEFAZ. O nNF está embutido na chave (chNFe, posições 26-34). A extração roda SEMPRE
    // que houver chave válida (FORA do gate _isAutorizado) — antes, resposta sem cStat
    // deixava a nota com número vazio mesmo tendo chave. Precedência: chave > preview > vazio.
    if (nf.sefaz.chaveAcesso) {
      const _numeroChave = extrairNumeroDaChaveNfe(nf.sefaz.chaveAcesso);
      if (_numeroChave) {
        if (nf.numero && String(nf.numero) !== String(_numeroChave)) {
          console.warn("[NF-e] Divergencia de numero: enviado=" + nf.numero + " | autorizado(chNFe)=" + _numeroChave + ". Usando o da chave (SEFAZ).");
        }
        nf.numero = String(_numeroChave);
      }
    }
    nf.numero = nf.numero || result.preview?.identificacao?.numero || nf.numero;
    nf.serie = nf.serie || result.preview?.identificacao?.serie || nf.serie || "1";
    nf.status = _sefazStatus;
    nf.audit = {
      ...(nf.audit || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: getAuditActor(),
      // Story 20.14 AC10: coerência — authorizedAt acompanha a prova real (chave+protocolo)
      authorizedAt: _temProvaAut ? (result.parsed?.dhRecbto || nf.audit?.authorizedAt || new Date().toISOString()) : (nf.audit?.authorizedAt || ""),
      authorizedBy: _temProvaAut ? getAuditActor() : (nf.audit?.authorizedBy || "")
    };
    setIntegrationState(nf, "sefaz", {
      status: _temProvaAut ? "autorizada" : (_cStat && !_cStatSucesso ? "rejeitada" : "transmissao_realizada"),
      lastAction: "nfe_sefaz_emitir_real",
      httpStatus: result.httpStatus || "",
      cStat: result.parsed?.cStat || "",
      xMotivo: result.parsed?.xMotivo || "",
      protocol: result.parsed?.prot || "",
      accessKey: result.parsed?.chNFe || ""
    });

    pedido.fiscal = {
      ...(pedido.fiscal || {}),
      notaFiscalId: nf.id,
      tipoNota: "nfe_real",
      status: nf.status,
      updatedAt: new Date().toISOString(),
      updatedBy: getAuditActor()
    };
    savePedidos();

    // Story 16.5 FIX-4: a cobrança da NF-e real é criada SOMENTE após autorização
    // SEFAZ (não mais de forma otimista na criação do rascunho). Isso elimina
    // cobranças órfãs quando a transmissão falha (ex.: NCM inválido).
    // Story 20.14 AC3/AC5/AC6/AC7: gate passa a ser temProvaAutorizacao (chave+protocolo),
    // não _isAutorizado — resolve PIX/notas que autorizavam sem cStat e nasciam sem título.
    // Idempotência (AC6): getContaReceberByNota(nf.id) + if(!conta) garante 1 título por nota.
    // Nota rejeitada sem chave (AC7): temProvaAutorizacao=false → não cria título.
    let conta = getContaReceberByNota(nf.id);
    if (_temProvaAut) {
      if (!conta) {
        conta = buildReceivableFromInvoice(nf);
        contasReceber.push(conta);
        // vincular pedido à cobrança recém-criada
        if (pedido.fiscal) pedido.fiscal.cobrancaId = conta.id;
      }
      conta.audit = {
        ...(conta.audit || {}),
        updatedAt: new Date().toISOString(),
        updatedBy: getAuditActor()
      };
      setIntegrationState(conta, "bancaria", {
        status: "autorizada_pronta_para_cobranca",
        lastAction: "emitir_cobranca_nf_autorizada"
      });
      saveContasReceber();
      savePedidos();
      await emitirOuSincronizarCobrancaReal(conta.id, { silent: true });
    }

    saveNotasFiscais();

    // Bridge 5: NF Saída → Banco (preço real faturado) — transmissão SEFAZ real
    // Story 20.14: gate alinhado a temProvaAutorizacao (chave+protocolo)
    if (_temProvaAut && typeof bancoPrecos !== 'undefined' && bancoPrecos.itens && nf.itens) {
      var nfSaidaRows = []; // Story 6.6
      nf.itens.forEach(function(item) {
        var sku = item.skuVinculado || item.sku;
        if (!sku) return;
        var bp = bancoPrecos.itens.find(function(b) { return b.sku === sku; });
        if (bp) {
          if (!bp.propostas) bp.propostas = [];
          bp.propostas.push({ escola: nf.cliente?.nome || '', preco: item.precoUnitario, data: new Date().toISOString().slice(0,10), tipo: 'nf_saida', nfNumero: nf.numero });
          bp.margemReal = bp.custoBase > 0 ? ((item.precoUnitario - bp.custoBase) / bp.custoBase) : null;
          // Story 6.6: Collect for Supabase preco_historico
          var margemPct = bp.custoBase > 0 ? Number((((item.precoUnitario - bp.custoBase) / item.precoUnitario) * 100).toFixed(2)) : null;
          nfSaidaRows.push({
            empresa_id: (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI',
            sku: sku, escola: nf.cliente?.nome || '', tipo: 'nf_saida',
            valor: item.precoUnitario, custo_base: bp.custoBase || null, margem_pct: margemPct,
            fonte: 'nf_saida',
            metadata: { nf_numero: nf.numero, chave_acesso: nf.sefaz?.chaveAcesso || '', cnpj_dest: nf.cliente?.cnpj || '' }
          });
        }
      });
      saveBancoLocal();
      // Story 6.6: Persist NF saída to Supabase preco_historico
      if (nfSaidaRows.length > 0 && typeof _SB_PRECO_HIST !== 'undefined') {
        _SB_PRECO_HIST.insert(nfSaidaRows);
      }
    }

    // Persist to Supabase with retry (prevent NF loss)
    // Story 20.14 AC4: gate alinhado a temProvaAutorizacao — garante que NF com prova
    // real (chave+protocolo) seja persistida com número/título corretos mesmo sem cStat.
    if (_temProvaAut) {
      _saveNfToSupabaseWithRetry({
        id: nf.id, numero: nf.numero, serie: nf.serie, valor: nf.valor,
        status: nf.status, pedidoId: nf.pedidoId, contratoId: nf.contratoId,
        tipoNota: nf.tipoNota, emitidaEm: nf.emitidaEm, cliente: nf.cliente,
        itens: nf.itens, sefaz: nf.sefaz, chaveAcesso: nf.sefaz?.chaveAcesso,
        protocolo: nf.sefaz?.protocolo,
        xmlAutorizado: nf.sefaz?.transmissao?.xml || nf.sefaz?.xmlAutorizado || nf.sefaz?.autorizacaoPreview || '',
        cobranca: nf.cobranca, documentos: nf.documentos, audit: nf.audit
      });
    }

    renderAll();
    showToast(`SEFAZ: ${result.parsed?.cStat || "-"} ${result.parsed?.xMotivo || ""}`.trim(), 5000);

    // Disparo automático de email quando NF autorizada pela SEFAZ
    // Story 20.14: gate alinhado a temProvaAutorizacao (chave+protocolo)
    if (_temProvaAut) {
      const contaEmail = getContaReceberByNota(nf.id);
      await dispararEmailNotaEBoletoAutomatico(nf.id, contaEmail?.id || null, { manual: false });
    }
  } catch (err) {
    nf.status = "rejeitada";
    nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
    setIntegrationState(nf, "sefaz", { status: "transmissao_falhou", lastAction: "nfe_sefaz_emitir_real", error: err.message });
    saveNotasFiscais();
    renderAll();
    showToast(`Falha na transmissao SEFAZ: ${err.message}`, 4500);
  }
  } catch(outerErr) { console.error("[NF-e] Erro inesperado em transmitirHomologacaoNota:", outerErr); showToast("Erro inesperado: " + outerErr.message, 5000); }
  finally {
    // Story 16.5 AC8: liberar o lock de idempotência ao concluir a transmissão.
    if (_lockPedidoId && _nfOpsEmAndamento) delete _nfOpsEmAndamento[_lockPedidoId];
  }
}

function atualizarFormaCobrancaNota(notaId, forma) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  nf.cobranca = nf.cobranca || {};
  nf.cobranca.forma = normalizeFormaPagamento(forma);
  nf.cobranca.status = nf.cobranca.forma === "boleto" ? "boleto_gerado" : nf.cobranca.forma === "pix" ? "pix_pronto" : nf.cobranca.forma === "ted" ? "ted_pendente" : "manual";
  nf.cobranca.metadata = nf.cobranca.forma === "pix"
    ? { pixKeyHint: "configurar_chave_pix", tipo: "pix" }
    : nf.cobranca.forma === "ted"
      ? { banco: "", agencia: "", conta: "", tipo: "ted" }
      : nf.cobranca.forma === "boleto"
        ? { carteira: "simples", tipo: "boleto" }
        : { observacao: "definir instrumento manualmente", tipo: "manual" };
  setIntegrationState(nf, "bancaria", { status: "forma_atualizada", lastAction: "atualizar_forma_cobranca", forma: nf.cobranca.forma });
  nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  saveNotasFiscais();

  const conta = getContaReceberByNota(notaId);
  if (conta) {
    conta.forma = nf.cobranca.forma;
    conta.cobranca = conta.cobranca || {};
    conta.cobranca.status = nf.cobranca.status;
    setIntegrationState(conta, "bancaria", { status: "forma_atualizada", lastAction: "atualizar_forma_cobranca", forma: nf.cobranca.forma });
    saveContasReceber();
  }
  renderAll();
}

// --- Block 2: NF preview, DANFE, cancellation ---
function verNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  const conta = getContaReceberByNota(notaId);
  const isReal = isNotaFiscalReal(nf);
  const canDelete = canDeleteNotaFiscal(nf);
  let html = '';
  html += '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:1rem">';
  html += '<div class="info-box"><label>NF</label><div class="val">NF ' + esc(nf.numero || 'PENDENTE') + ' / Serie ' + esc(nf.serie || '1') + '</div></div>';
  html += '<div class="info-box"><label>Pedido</label><div class="val font-mono">' + esc(nf.pedidoId || '-') + '</div></div>';
  html += '<div class="info-box"><label>Status SEFAZ</label><div class="val">' + esc(nf.status) + '</div></div>';
  html += '<div class="info-box"><label>Tipo</label><div class="val"><span class="nf-type-chip ' + getNotaFiscalTipoClass(nf) + '">' + esc(getNotaFiscalTipoLabel(nf)) + '</span></div></div>';
  html += '</div>';

  html += '<div class="card" style="padding:1rem;margin-bottom:1rem">';
  html += '<h3 style="margin-bottom:1rem">Cliente e Autorizacao</h3>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Cliente</label><div style="font-weight:700">' + esc(nf.cliente?.nome || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">CNPJ</label><div style="font-weight:700">' + esc(nf.cliente?.cnpj || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Emissao</label><div style="font-weight:700">' + formatDateTimeLocal(nf.emitidaEm) + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Lote SEFAZ</label><div style="font-weight:700">' + esc(nf.sefaz?.lote || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Protocolo</label><div style="font-weight:700">' + esc(nf.sefaz?.protocolo || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Chave Acesso</label><div style="font-weight:700;font-size:.78rem;word-break:break-all">' + esc(nf.sefaz?.chaveAcesso || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Chave Preview</label><div style="font-weight:700;font-size:.78rem;word-break:break-all">' + esc(nf.sefaz?.xmlPreview?.accessKey || nf.integracoes?.sefaz?.accessKey || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Assinatura Preview</label><div style="font-weight:700">' + esc(nf.sefaz?.xmlDsigPreview?.mode || nf.integracoes?.sefaz?.assinaturaMode || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Lote Preview</label><div style="font-weight:700">' + esc(nf.sefaz?.lotePreview?.loteId || nf.integracoes?.sefaz?.loteId || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Endpoint Autorizacao</label><div style="font-weight:700;font-size:.78rem;word-break:break-all">' + esc(nf.sefaz?.autorizacaoPreview?.url || nf.integracoes?.sefaz?.endpoint || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">HTTP Transmissao</label><div style="font-weight:700">' + esc(nf.sefaz?.transmissao?.httpStatus || nf.integracoes?.sefaz?.httpStatus || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">cStat/xMotivo</label><div style="font-weight:700;font-size:.78rem">' + esc((nf.sefaz?.transmissao?.parsed?.cStat || nf.integracoes?.sefaz?.cStat || '-') + " | " + (nf.sefaz?.transmissao?.parsed?.xMotivo || nf.integracoes?.sefaz?.xMotivo || '-')) + '</div></div>';
  html += '</div></div>';

  html += '<div class="card" style="padding:1rem;margin-bottom:1rem">';
  const _nfNumExibir = nf.numero || peekProximoNumeroNf();
  html += '<h3 style="margin-bottom:1rem">Documentos Fiscais <span style="font-size:.85rem;color:var(--green);font-weight:700;margin-left:.5rem">NF ' + esc(_nfNumExibir) + ' / Série ' + esc(nf.serie || '1') + '</span>' + (!nf.numero ? ' <span style="font-size:.7rem;color:var(--yellow)">(próximo)</span>' : '') + '</h3>';
  html += '<div style="font-size:.76rem;color:var(--mut);margin-bottom:.8rem">' + (isReal ? 'NF-e real: numero, chave e protocolo devem refletir o retorno fiscal do fluxo SEFAZ.' : 'Manual externa: use este bloco para registrar numero, chave e DANFE emitidos fora do GDP.') + '</div>';
  if (isReal && nf.status === "autorizada") {
    html += '<div style="margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid rgba(34,197,94,.35);border-radius:4px;background:rgba(34,197,94,.08);font-size:.8rem;color:var(--txt)">NF-e real autorizada. Este registro nao pode ser excluido no GDP. Para desfazer, use cancelamento fiscal proprio e preserve a rastreabilidade.</div>';
  }
  if (isReal && nf.status === "cancelada") {
    html += '<div style="margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid rgba(239,68,68,.35);border-radius:4px;background:rgba(239,68,68,.08);font-size:.8rem;color:var(--txt)">NF-e cancelada na SEFAZ. Este registro permanece no GDP por rastreabilidade fiscal e nao pode ser excluido.</div>';
  }
  if (nf.cancelamento?.status) {
    html += '<div style="margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid rgba(245,158,11,.35);border-radius:4px;background:rgba(245,158,11,.08);font-size:.8rem;color:var(--txt)">Cancelamento: <strong>' + esc(nf.cancelamento.status) + '</strong> | Motivo: ' + esc(nf.cancelamento.motivo || '-') + ' | Solicitado em: ' + esc(formatDateTimeLocal(nf.cancelamento.solicitadoEm || "")) + '</div>';
  }
  html += '<div style="display:grid;grid-template-columns:1.1fr .7fr 1.3fr;gap:.8rem">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Numero da NF</label><input id="nf-numero-manual" type="text" value="' + esc(nf.numero || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Serie</label><input id="nf-serie-manual" type="text" value="' + esc(nf.serie || '1') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Chave de Acesso</label><input id="nf-chave-manual" type="text" value="' + esc(nf.sefaz?.chaveAcesso || '') + '" style="width:100%"></div>';
  html += '<div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Link do DANFE/PDF</label><input id="nf-danfe-url" type="text" value="' + esc(nf.documentos?.danfeUrl || '') + '" placeholder="Cole aqui o link do DANFE ou PDF" style="width:100%"></div>';
  html += '</div>';
  // Email section
  const destEmail = nf.cliente?.email || nf.sefaz?.preview?.destinatario?.email || '';
  html += '<div style="margin-top:1rem;padding:.8rem 1rem;background:var(--bg);border:1px solid var(--bdr);border-radius:4px">';
  html += '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">';
  html += '<label style="font-size:.72rem;color:var(--mut);white-space:nowrap">Enviar NF por email:</label>';
  html += '<input type="email" id="nf-email-dest-' + nf.id + '" value="' + esc(destEmail) + '" placeholder="email@destino.com" style="flex:1;min-width:200px">';
  html += '<button class="btn btn-sm" style="background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700;white-space:nowrap" onclick="enviarEmailNotaFiscal(\'' + nf.id + '\')">📧 Enviar Email</button>';
  html += '</div></div>';

  html += '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem;align-items:center">';
  html += '<button class="btn btn-outline" onclick="salvarDadosNotaFiscal(\'' + nf.id + '\')">' + (isReal ? 'Salvar Metadados da NF' : 'Salvar Dados da NF') + '</button>';
  html += '<button class="btn btn-outline" onclick="abrirDanfeNotaFiscal(\'' + nf.id + '\')">Visualizar DANFE</button>';
  // Story 4.51 AC-F1: Transmitir SEFAZ moved here from Cobrança Vinculada card
  if (isReal) {
    const _btnNumPreviewF1 = nf.numero && nf.numero !== "0" ? nf.numero : peekProximoNumeroNf();
    html += canTransmitNotaFiscal(nf)
      ? '<button class="btn btn-green" onclick="transmitirHomologacaoNota(\'' + nf.id + '\')">Transmitir SEFAZ <span style="font-size:.78rem;opacity:.8">(NF ' + esc(_btnNumPreviewF1) + ')</span></button>'
      : '<button class="btn btn-outline" disabled title="NF com estado fiscal final">Transmitir SEFAZ</button>';
    if (canTransmitNotaFiscal(nf) && (!nf.numero || nf.numero === "0")) {
      html += '<span style="font-size:.72rem;color:var(--yellow);margin-left:.3rem">numero sera atribuido ao transmitir</span>';
    }
  }
  if (canRequestCancelNotaFiscal(nf)) {
    html += '<button class="btn btn-outline" onclick="solicitarCancelamentoNotaFiscal(\'' + nf.id + '\')">Solicitar Cancelamento</button>';
  }
  html += canDelete
    ? '<button class="btn btn-red" onclick="excluirNotaFiscal(\'' + nf.id + '\')">Excluir Nota</button>'
    : '<button class="btn btn-red" disabled title="NF-e autorizada nao pode ser excluida">Excluir Bloqueado</button>';
  html += '</div></div>';

  html += '<div class="card" style="padding:1rem;margin-bottom:1rem">';
  html += '<h3 style="margin-bottom:1rem">Auditoria Operacional</h3>';
  html += '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Criacao</label><div style="font-weight:700">' + esc(formatAuditStamp({ createdAt: nf.audit?.createdAt, createdBy: nf.audit?.createdBy })) + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Ultima atualizacao</label><div style="font-weight:700">' + esc(formatAuditStamp(nf.audit)) + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Autorizacao</label><div style="font-weight:700">' + esc(formatAuditStamp({ updatedAt: nf.audit?.authorizedAt, updatedBy: nf.audit?.authorizedBy })) + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Pedido vinculado</label><div style="font-weight:700">' + esc(nf.pedidoId || '-') + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Integracao SEFAZ</label><div style="font-weight:700">' + esc(getIntegrationStatusLabel(nf.integracoes?.sefaz)) + '</div></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Integracao Bancaria</label><div style="font-weight:700">' + esc(getIntegrationStatusLabel(nf.integracoes?.bancaria)) + '</div></div>';
  html += '</div></div>';

  html += '<div class="card" style="padding:1rem;margin-bottom:1rem">';
  html += '<h3 style="margin-bottom:1rem">Cobranca Vinculada</h3>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:.8rem;align-items:end">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Forma</label><select id="nf-forma-cobranca"><option value="boleto"' + ((nf.cobranca?.forma || 'boleto') === 'boleto' ? ' selected' : '') + '>Boleto</option><option value="pix"' + (nf.cobranca?.forma === 'pix' ? ' selected' : '') + '>Pix</option><option value="ted"' + (nf.cobranca?.forma === 'ted' ? ' selected' : '') + '>TED</option><option value="incluir"' + (nf.cobranca?.forma === 'incluir' ? ' selected' : '') + '>Incluir</option></select></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.55rem .75rem;border:1px solid var(--bdr);border-radius:4px;background:var(--s1)">' + esc(nf.cobranca?.status || '-') + '</div></div>';
  html += '<button class="btn btn-outline" onclick="atualizarFormaCobrancaNota(\'' + nf.id + '\', document.getElementById(\'nf-forma-cobranca\').value)">Atualizar Cobranca</button>';
  html += (conta ? '<button class="btn btn-green" onclick="dispararCobrancaAutomatica(\'' + conta.id + '\')">Cobrar Agora</button>' : '<span></span>');
  html += '</div>';

  // Story 4.51 AC-F1: Transmitir SEFAZ button moved to Documentos Fiscais card above
  if (conta) {
    html += '<div style="margin-top:1rem;font-size:.82rem;color:var(--mut)">Conta vinculada: <strong style="color:var(--txt)">' + esc(conta.descricao) + '</strong> | Status: <strong style="color:var(--txt)">' + esc(conta.status) + '</strong></div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Provider: <strong style="color:var(--txt)">' + esc(conta.integracoes?.bancaria?.provider || nf.integracoes?.bancaria?.provider || '-') + '</strong> | Charge ID: <strong style="color:var(--txt)">' + esc(conta.cobranca?.providerChargeId || conta.integracoes?.bancaria?.providerChargeId || '-') + '</strong></div>';
    html += '<div style="margin-top:.45rem;font-size:.82rem;color:var(--mut)">Linha digitavel: ' + esc(conta.cobranca?.linhaDigitavel || '-') + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Pix copia e cola: ' + esc(conta.cobranca?.pixCopiaECola || '-') + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Link de cobranca: ' + (conta.cobranca?.invoiceUrl ? '<a href="' + esc(conta.cobranca.invoiceUrl) + '" target="_blank" rel="noreferrer">abrir</a>' : '-') + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Boleto PDF: ' + (conta.cobranca?.bankSlipUrl ? '<a href="' + esc(conta.cobranca.bankSlipUrl) + '" target="_blank" rel="noreferrer">abrir</a>' : '-') + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Nosso numero: ' + esc(conta.cobranca?.nossoNumero || '-') + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Pagamento confirmado em: ' + esc(conta.cobranca?.paidAt ? formatDateTimeLocal(conta.cobranca.paidAt) : '-') + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Ultima acao financeira: ' + esc(formatAuditStamp(conta.audit, conta.recebidaEm, conta.audit?.updatedBy)) + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Integracao titulo: ' + esc(getIntegrationStatusLabel(conta.integracoes?.bancaria)) + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Integracao comunicacao: ' + esc(getIntegrationStatusLabel(conta.integracoes?.comunicacao)) + '</div>';
    html += '<div style="margin-top:.35rem;font-size:.82rem;color:var(--mut)">Politica de cobranca: e-mail sempre ativo; WhatsApp apenas para titulos em atraso.</div>';
    html += '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">';
    html += '<button class="btn btn-outline" onclick="sincronizarCobrancaProvider(\'' + conta.id + '\')">Sincronizar Provider</button>';
    html += '</div>';
  }
  html += '</div>';

  // ── Anotações Internas (do pedido vinculado — uso interno, NÃO aparece no XML/DANFE) ──
  const _pedidoVinculado = nf.pedidoId ? pedidos.find(function(pp) { return pp.id === nf.pedidoId; }) : null;
  const _anotacaoNf = nf.documentos?.anotacaoInterna || nf.anotacaoInterna || (_pedidoVinculado ? (_pedidoVinculado.documentos?.anotacaoInterna || _pedidoVinculado.anotacaoInterna) : '') || '';
  if (_anotacaoNf || true) {
    html += '<div class="card" style="padding:1rem;margin-bottom:1rem;border:1px solid rgba(234,179,8,.3);background:rgba(234,179,8,.04)">';
    html += '<h3 style="margin-bottom:.6rem;color:var(--yellow,#eab308)">Anotações Internas</h3>';
    html += '<div style="font-size:.78rem;color:var(--mut);margin-bottom:.5rem">Uso interno — <strong>não</strong> aparece no XML, DANFE ou documentos enviados ao cliente.</div>';
    html += '<textarea id="nf-anotacao-interna-' + nf.id + '" style="width:100%;min-height:70px;padding:.6rem .8rem;background:rgba(234,179,8,.06);border:1px solid rgba(234,179,8,.3);border-radius:4px;color:var(--txt);font-size:.85rem;resize:vertical;font-family:inherit" placeholder="Anotações internas...">' + esc(_anotacaoNf) + '</textarea>';
    html += '</div>';
  }

  html += '<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="text-center">Qtd</th><th class="text-center">Un.</th><th class="text-center">NCM</th><th class="text-right">Unit.</th><th class="text-right">Subtotal</th></tr></thead><tbody>';
  html += (nf.itens || []).map((item, idx) => '<tr><td>' + esc(item.descricao || '') + '</td><td class="text-center">' + (item.qtd || 0) + '</td><td class="text-center">' + esc(item.unidade || '-') + '</td><td class="text-center"><input type="text" id="nf-item-ncm-' + nf.id + '-' + idx + '" value="' + esc(item.ncm || '') + '" style="width:90px;text-align:center;font-family:monospace;font-size:.78rem;padding:.2rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--cyan)" onchange="salvarNcmItemNf(\'' + nf.id + '\',' + idx + ',this.value)"></td><td class="text-right">' + brl.format(item.precoUnitario || 0) + '</td><td class="text-right">' + brl.format((item.qtd || 0) * (item.precoUnitario || 0)) + '</td></tr>').join('');
  html += '</tbody></table></div>';

  document.getElementById("modal-nota-fiscal-titulo").textContent = `${getNotaFiscalTipoLabel(nf)} ${nf.numero || ('\u2192 ' + peekProximoNumeroNf())} — ${nf.cliente?.nome || ''}`;
  document.getElementById("modal-nota-fiscal-body").innerHTML = html;
  document.getElementById("modal-nota-fiscal").classList.remove("hidden");
}

async function enviarEmailNotaFiscal(notaId) {
  const nf = notasFiscais.find(n => n.id === notaId);
  if (!nf) return;
  // Story 4.56 AC-3: só enviar email se NF autorizada pela SEFAZ
  if (nf.status !== "autorizada") {
    showToast("Email só pode ser enviado após autorização da SEFAZ. Status atual: " + (nf.status || "rascunho"), 4000);
    return;
  }
  const emailInput = document.getElementById('nf-email-dest-' + notaId);
  const to = (emailInput?.value || '').trim();
  if (!to || !to.includes('@')) { showToast('Informe um email válido.', 3000); return; }

  const pedido = pedidos.find(p => p.id === nf.pedidoId);
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);

  // Story 4.77: PDF gerado server-side (jsPDF vetorial) — não gerar client-side
  const payload = {
    to,
    schoolName: nf.cliente?.nome || pedido?.escola || '',
    protocol: nf.pedidoId || nf.id,
    date: formatDateTimeLocal(nf.emitidaEm).split(' ')[0],
    items: (nf.itens || []).map(i => ({ name: i.descricao, qty: i.qtd, unitPrice: i.precoUnitario, unit: i.unidade })),
    total: nf.valor || totalProd,
    responsible: nf.cliente?.responsavel || '',
    cnpj: nf.cliente?.cnpj || '',
    obs: nf.documentos?.observacao || '',
    nfe: {
      numero: nf.numero,
      serie: nf.serie || '1',
      protocolo: nf.sefaz?.protocolo || '',
      valor: nf.valor || totalProd,
      chaveAcesso: nf.sefaz?.chaveAcesso || '',
      emitente: nf.sefaz?.preview?.emitente || {},
      destinatario: nf.sefaz?.preview?.destinatario || nf.cliente || {},
      observacoes: nf.documentos?.observacao || '',
      pedidoId: nf.pedidoId || '',
      destEmail: to,
      itensNf: (nf.itens || []).map(i => ({ desc: i.descricao, ncm: i.ncm, cst: i.cst, cfop: i.cfop, un: i.unidade, qtd: i.qtd, vUnit: i.precoUnitario })),
      xml: nf.sefaz?.xmlDsigPreview?.signedXml || nf.sefaz?.xmlPreview?.xml || ''
    }
  };

  // Include pagamento if conta exists
  const conta = getContaReceberByNota(notaId);
  if (conta && conta.cobranca) {
    payload.pagamento = {
      forma: conta.cobranca.forma || nf.cobranca?.forma || 'boleto',
      vencimento: conta.vencimento || '',
      valor: conta.valor || nf.valor || totalProd,
      banco: conta.cobranca.banco || '',
      agencia: conta.cobranca.agencia || '',
      contaNum: conta.cobranca.contaNum || '',
      linhaDigitavel: conta.cobranca.linhaDigitavel || '',
      pixCopiaECola: conta.cobranca.pixCopiaECola || ''
    };
  }

  const supplierEmail = 'edsonlariucci.comercial@gmail.com';
  const recipients = [to];
  if (to !== supplierEmail) recipients.push(supplierEmail);

  showToast('Enviando email...', 2000);
  try {
    const sendPromises = recipients.map(addr =>
      fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, to: addr })
      })
    );
    const responses = await Promise.all(sendPromises);
    const resp = responses[0];
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ' + resp.status);
    showToast('Email enviado para ' + to + (recipients.length > 1 ? ' + cópia para fornecedor' : '') + ' (provider: ' + (data.provider || '-') + ')', 4000);
  } catch (e) {
    showToast('Erro ao enviar email: ' + e.message, 5000);
    console.error('[Email NF-e]', e);
  }
}

async function gerarDanfePdfBase64(nf) {
  // Story 4.75: gerar PDF idêntico ao "Visualizar DANFE" (abrirDanfeNotaFiscal)
  // Usa a mesma função gerarDanfeHtmlParaPdf() que produz o HTML completo com CSS dedicado
  const danfeFullHtml = gerarDanfeHtmlParaPdf(nf);
  if (typeof html2pdf === "undefined") return "";

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1123px;border:none;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(iframe);

  try {
    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(danfeFullHtml);
    iDoc.close();

    // Aguardar render completo
    await new Promise(r => setTimeout(r, 800));

    // html2pdf opera sobre o body do iframe (documento isolado, fundo branco)
    const opt = {
      margin: [4, 4, 4, 4],
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", allowTaint: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };
    const worker = html2pdf().set(opt).from(iDoc.body);
    const pdfBlob = await worker.outputPdf("blob");
    const reader = new FileReader();
    const base64 = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(pdfBlob);
    });

    if (typeof gdpLog === "function") gdpLog("[DANFE PDF] Gerado:", Math.round(base64.length * 0.75 / 1024), "KB");
    return base64;
  } catch (e) {
    if (typeof gdpWarn === "function") gdpWarn("[DANFE PDF] Falha:", e.message);
    return "";
  } finally {
    document.body.removeChild(iframe);
  }
}

// Story 14.6: DANFE fiel ao modelo PDF (NF 001.426) com logomarca dedicada
function gerarDanfeHtmlCompleto(nf) {
  if (!nf) return "";
  // Story 4.58 AC-2: DANFE usa preview, fallback para nexedu.empresa + nf.cliente
  const sefazData = nf.sefaz || {};
  const previewData = sefazData.preview || {};
  // Emitente: preview > fallback nexedu.empresa (localStorage)
  let emit = previewData.emitente || {};
  if (!emit.razaoSocial) {
    try {
      const empresa = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
      if (empresa.razaoSocial || empresa.nome) {
        emit = {
          razaoSocial: empresa.razaoSocial || empresa.nome || '',
          cnpj: empresa.cnpj || '',
          ie: empresa.ie || '',
          email: empresa.email || '',
          endereco: {
            logradouro: empresa.logradouro || empresa.endereco || '',
            numero: empresa.numero || '',
            bairro: empresa.bairro || '',
            complemento: empresa.complemento || '',
            cidade: empresa.cidade || empresa.municipio || '',
            uf: empresa.uf || '',
            cep: empresa.cep || '',
            telefone: empresa.telefone || empresa.fone || ''
          }
        };
      }
    } catch(_) {}
  }
  const emEnd = emit.endereco || {};
  // Destinatário: preview > nf.cliente
  const dest = previewData.destinatario || nf.cliente || {};
  const dEnd = dest.endereco || {};
  const chave = sefazData.chaveAcesso || "";
  const chaveFormatada = chave.replace(/(.{4})/g, "$1 ").trim();
  const prot = sefazData.protocolo || "";
  const protDt = sefazData.transmissao?.parsed?.dhRecbto || nf.audit?.authorizedAt || "";
  const protFormatado = prot ? prot + (protDt ? " - " + protDt : "") : "-";
  const isCancelada = nf.status === "cancelada";
  const cancelStamp = nf.cancelamento?.retornoEvento?.dhRegEvento || nf.cancelamento?.atualizadoEm || "";
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);
  const totalNota = nf.valor || totalProd;
  const dtEmissao = formatDateTimeLocal(nf.emitidaEm);
  const dtParts = dtEmissao.split(" ");
  const f2 = (v) => Number(v || 0).toFixed(2).replace(".", ",");
  const numNf = String(nf.numero || "0").padStart(6, "0");
  const numFmt = numNf.replace(/^(\d{3})(\d{3})$/, "$1.$2");
  const destNome = dest.nome || dest.razaoSocial || nf.cliente?.nome || "-";
  const destEnd = [dEnd.logradouro, dEnd.numero].filter(Boolean).join(", ");
  const destCidade = dEnd.cidade || dEnd.municipio || "";
  const emEndLine1 = [emEnd.logradouro, emEnd.numero].filter(Boolean).join(", ");
  const emEndLine2 = [emEnd.bairro, emEnd.complemento].filter(Boolean).join(", ");
  const emEndLine3 = [emEnd.cidade, emEnd.uf].filter(Boolean).join(" - ") + (emEnd.cep ? " - " + emEnd.cep : "");
  const destEmail = dest.email || nf.cliente?.email || "";
  let logoImg = "";
  try { const cfg = JSON.parse(localStorage.getItem("nexedu.config.notas-fiscais") || "{}"); if (cfg.logomarcaBase64) logoImg = cfg.logomarcaBase64; } catch(_) {}
  const infCplParts = [];
  if (nf.pedidoId) infCplParts.push("Inf. Contribuinte: Pedido GDP " + nf.pedidoId);
  if (destEmail) infCplParts.push("Email do Destinatário: " + destEmail);
  if (nf.documentos?.observacao) infCplParts.push(esc(nf.documentos.observacao).replace(/\|/g, "<br>"));
  infCplParts.push("Valor Aproximado dos Tributos : R$ 0,00");
  const rows = (nf.itens || []).map((item, idx) => {
    const vt = Number(item.qtd || 0) * Number(item.precoUnitario || 0);
    return `<tr><td class="c">${esc(item.sku || String(idx+1).padStart(3,"0"))}</td><td>${esc(item.descricao || "")}</td><td class="c">${esc(item.ncm || "")}</td><td class="c">${esc(item.cst || "0102")}</td><td class="c">${esc(item.cfop || "5.102")}</td><td class="c">${esc(item.unidade || "UN")}</td><td class="r">${f2(item.qtd)}</td><td class="r">${f2(item.precoUnitario)}</td><td class="r">${f2(vt)}</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td></tr>`;
  }).join("");
  return `<style>
*{margin:0;padding:0;box-sizing:border-box}
body,div,table{font-family:Arial,sans-serif;font-size:7.5pt;color:#000}
.danfe-wrap{max-width:210mm}
.bx{border:1px solid #000}
.row{display:flex;border-bottom:1px solid #000;page-break-inside:avoid}
.cell{border-right:1px solid #000;padding:3px 5px;flex:1;min-height:24px;overflow:hidden}
.cell:last-child{border-right:none}
.cell label{font-size:6pt;text-transform:uppercase;display:block;color:#000;line-height:1.3;margin-bottom:1px}
.cell .v{font-size:9pt;font-weight:700}
.cell .v-sm{font-size:8pt;font-weight:700}
.stit{font-weight:700;font-size:6.5pt;padding:2px 5px;text-transform:uppercase;border-bottom:1px solid #000;background:#eee}
table.it{width:100%;border-collapse:collapse}
table.it th{border:1px solid #000;padding:2px 4px;font-size:6pt;text-transform:uppercase;font-weight:700;background:#eee}
table.it td{border:1px solid #999;padding:2px 4px;font-size:7.5pt;page-break-inside:avoid}
.c{text-align:center}.r{text-align:right}
/* Recibo */
.rec{border:1px solid #000;display:flex;margin-bottom:3px}
.rec-txt{flex:3;border-right:1px solid #000;display:flex;flex-direction:column}
.rec-txt-top{padding:4px 6px;font-size:6.5pt;line-height:1.4;flex:1}
.rec-fields{display:flex;border-top:1px solid #000}
.rec-fields .rf{flex:1;padding:2px 4px;border-right:1px solid #000;min-height:22px}
.rec-fields .rf:last-child{border-right:none}
.rec-fields .rf label{font-size:5pt;text-transform:uppercase}
.rec-nfe{width:110px;text-align:center;padding:6px 4px}
/* Header 3 colunas: logo+emit | danfe | chave */
.hdr{display:flex;border-bottom:1px solid #000}
.hdr-logo{width:140px;border-right:1px solid #000;display:flex;align-items:center;justify-content:center;padding:2px;min-height:85px}
.hdr-logo img{max-height:82px;max-width:136px;object-fit:contain}
.hdr-emit{flex:3;border-right:1px solid #000;padding:4px 8px;display:flex;flex-direction:column;justify-content:center}
.hdr-emit .nome{font-size:10pt;font-weight:700;white-space:nowrap}
.hdr-emit .end{font-size:7pt;line-height:1.4;white-space:nowrap}
.hdr-danfe{width:120px;text-align:center;padding:4px;border-right:1px solid #000}
.hdr-chave{flex:2;padding:4px 6px;overflow:hidden;text-align:center}
</style>
<div class="danfe-wrap">
<!-- RECIBO DE ENTREGA -->
<div class="rec">
  <div class="rec-txt">
    <div class="rec-txt-top">RECEBEMOS DE <strong>${esc(emit.razaoSocial || "-")}</strong> OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO</div>
    <div class="rec-fields">
      <div class="rf"><label>DATA DE RECEBIMENTO</label></div>
      <div class="rf" style="flex:2"><label>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</label></div>
    </div>
  </div>
  <div class="rec-nfe">
    <div style="font-size:12pt;font-weight:900">NF-e</div>
    <div style="font-size:10pt;font-weight:900">N° ${esc(numFmt)}</div>
    <div style="font-size:7pt">Série ${String(nf.serie||"1")}</div>
  </div>
</div>
<!-- CORPO DA DANFE -->
<div class="bx">
  <!-- CABEÇALHO: LOGO | EMITENTE | DANFE | CHAVE -->
  <div class="hdr">
    <div class="hdr-logo">${logoImg ? '<img src="' + logoImg + '" />' : ''}</div>
    <div class="hdr-emit">
      <div class="nome">${esc(emit.razaoSocial || "-")}</div>
      <div class="end">${esc(emEndLine1)}${emEnd.complemento ? ", " + esc(emEnd.complemento) : ""}</div>
      <div class="end">${esc(emEndLine2)}</div>
      <div class="end">${esc(emEndLine3)} Fone ${esc(emEnd.telefone || "")}</div>
      <div class="end">${esc(emit.email || "")}</div>
    </div>
    <div class="hdr-danfe">
      <div style="font-size:16pt;font-weight:900;letter-spacing:1px">DANFE</div>
      <div style="font-size:6pt;line-height:1.3">Documento Auxiliar<br>da Nota Fiscal<br>Eletrônica</div>
      <div style="font-size:7pt;margin-top:4px">0-Entrada &nbsp; 1-Saída</div>
      <div style="display:inline-block;border:1.5px solid #000;padding:1px 8px;font-size:12pt;font-weight:900;margin:3px 0">1</div>
      <div style="font-size:10pt;font-weight:900;margin-top:3px">N° ${esc(numFmt)}</div>
      <div style="font-size:7pt">SÉRIE: ${String(nf.serie||"1")} &nbsp; FOLHA: 1</div>
    </div>
    <div class="hdr-chave">
      <div style="font-size:5.5pt;text-align:center;text-transform:uppercase;font-weight:700">CHAVE DE ACESSO</div>
      <div style="font-size:7pt;font-weight:700;text-align:center;word-break:break-all;margin:4px 0;line-height:1.4">${esc(chaveFormatada || "-")}</div>
      <div style="font-size:5pt;text-align:center;line-height:1.3">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal<br>ou no site da Sefaz autorizadora</div>
    </div>
  </div>
  <!-- NATUREZA + IE -->
  <div class="row">
    <div class="cell" style="flex:3"><label>NATUREZA DA OPERAÇÃO</label><div class="v">Venda de mercadorias</div></div>
    <div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">${esc(emit.ie || "")}</div></div>
  </div>
  <div class="row">
    <div class="cell"><label>INSCR. ESTADUAL DO SUBST. TRIB.</label><div class="v-sm"></div></div>
    <div class="cell" style="flex:2"><label>PROTOCOLO DE AUTORIZAÇÃO DE USO</label><div class="v-sm">${esc(protFormatado)}</div></div>
    <div class="cell"><label>CNPJ</label><div class="v">${esc(emit.cnpj || "")}</div></div>
  </div>
  <!-- DESTINATÁRIO -->
  <div class="stit">DESTINATÁRIO / REMETENTE</div>
  <div class="row">
    <div class="cell" style="flex:3"><label>NOME / RAZÃO SOCIAL</label><div class="v">${esc(destNome)}</div></div>
    <div class="cell"><label>CNPJ/CPF</label><div class="v-sm">${esc(dest.cnpj || "")}</div></div>
    <div class="cell"><label>DATA EMISSÃO</label><div class="v-sm">${dtParts[0] || "-"}</div></div>
  </div>
  <div class="row">
    <div class="cell" style="flex:2"><label>ENDEREÇO</label><div class="v-sm">${esc(destEnd)}</div></div>
    <div class="cell"><label>BAIRRO</label><div class="v-sm">${esc(dEnd.bairro || "")}</div></div>
    <div class="cell"><label>FONE/FAX</label><div class="v-sm">${esc(dest.telefone || "")}</div></div>
    <div class="cell" style="width:30px;flex:none"><label>UF</label><div class="v-sm">${esc(dEnd.uf || "")}</div></div>
  </div>
  <div class="row">
    <div class="cell" style="flex:2"><label>MUNICÍPIO</label><div class="v-sm">${esc(destCidade)}</div></div>
    <div class="cell"><label>CEP</label><div class="v-sm">${esc(dEnd.cep || "")}</div></div>
    <div class="cell"><label>INSCR. ESTADUAL</label><div class="v-sm">${esc(dest.ie || "")}</div></div>
    <div class="cell"><label>DATA SAÍDA</label><div class="v-sm">${dtParts[0] || "-"}</div></div>
    <div class="cell"><label>HORA SAÍDA</label><div class="v-sm">${dtParts[1] || ""}</div></div>
  </div>
  <!-- FATURA -->
  <div class="stit">FATURA / DUPLICATA</div>
  <div class="row">
    <div class="cell"><label>NÚMERO</label><div class="v-sm"></div></div>
    <div class="cell"><label>VENCIMENTO</label><div class="v-sm"></div></div>
    <div class="cell"><label>VALOR</label><div class="v-sm"></div></div>
    <div class="cell"><label>NÚMERO</label><div class="v-sm"></div></div>
    <div class="cell"><label>VENCIMENTO</label><div class="v-sm"></div></div>
    <div class="cell"><label>VALOR</label><div class="v-sm"></div></div>
  </div>
  <!-- CÁLCULO DO IMPOSTO -->
  <div class="stit">CÁLCULO DO IMPOSTO</div>
  <div class="row">
    <div class="cell"><label>BASE CÁLC. ICMS</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR ICMS</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>BASE ICMS S.T.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR ICMS SUBST.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. IMP. IMPORT.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. TOTAL PRODUTOS</label><div class="v">${f2(totalProd)}</div></div>
  </div>
  <div class="row">
    <div class="cell"><label>FRETE</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>SEGURO</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>DESCONTO</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>OUTRAS</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR IPI</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. TOTAL DA NOTA</label><div class="v">${f2(totalNota)}</div></div>
  </div>
  <!-- TRANSPORTADOR -->
  <div class="stit">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
  <div class="row">
    <div class="cell" style="flex:2"><label>NOME / RAZÃO SOCIAL</label><div class="v-sm"></div></div>
    <div class="cell"><label>FRETE</label><div class="v-sm">9-Sem Transporte</div></div>
    <div class="cell"><label>PLACA</label><div class="v-sm"></div></div>
    <div class="cell" style="width:30px;flex:none"><label>UF</label><div class="v-sm"></div></div>
    <div class="cell"><label>CNPJ / CPF</label><div class="v-sm"></div></div>
  </div>
  <!-- PRODUTOS -->
  <div class="stit">DADOS DOS PRODUTOS / SERVIÇOS</div>
  <table class="it"><thead><tr><th>CÓDIGO</th><th style="min-width:120px">DESCRIÇÃO DOS PRODUTOS / SERVIÇOS</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>UNID.</th><th>QUANT.</th><th>VLR. UNIT.</th><th>VLR. TOTAL</th><th>BC ICMS</th><th>VLR.ICMS</th><th>VLR.IPI</th><th>%ICMS</th><th>%IPI</th></tr></thead><tbody>${rows}</tbody></table>
  <!-- DADOS ADICIONAIS -->
  <div class="stit">DADOS ADICIONAIS</div>
  <div class="row" style="min-height:90px;border-bottom:none">
    <div class="cell" style="flex:2"><label>INFORMAÇÕES COMPLEMENTARES</label><div style="font-size:6.5pt;padding-top:2px;line-height:1.5;white-space:pre-wrap">${isCancelada ? '<strong style="color:red">CANCELADA</strong> ' + esc(cancelStamp) + "\n" : ""}${infCplParts.join("\n")}</div></div>
    <div class="cell"><label>RESERVADO AO FISCO</label></div>
  </div>
</div>
<div style="font-size:5.5pt;margin-top:3px">Impresso em ${new Date().toLocaleDateString("pt-BR")} as ${new Date().toLocaleTimeString("pt-BR")}</div>
</div>`;
}

async function reenviarEmailNfPedido(pedidoId) {
  const nf = notasFiscais.find(n => n.pedidoId === pedidoId);
  if (!nf) { showToast('Este pedido ainda não tem nota fiscal gerada.', 3000); return; }
  const conta = contasReceber.find(c => c.notaFiscalId === nf.id || c.pedidoId === pedidoId) || null;
  showToast('Gerando PDF e enviando e-mail da NF ' + (nf.numero || nf.id) + '...', 3000);
  await dispararEmailNotaEBoletoAutomatico(nf.id, conta?.id || null, { manual: true });
}

// Editar NCM de item direto na tela da NF
// Story 21.x (UX-Fy): edição inline NCM passa a ser LOCAL (estado em memória) — a
// persistência (localStorage + Supabase + sync pedido + toast) é feita 1x pelo botão
// "Salvar Dados/Metadados da NF" (salvarDadosNotaFiscal). Aqui só atualizamos estado.
function salvarNcmItemNf(notaId, idx, valor) {
  const nf = notasFiscais.find(n => n.id === notaId);
  if (!nf || !nf.itens[idx]) return;
  nf.itens[idx].ncm = valor.trim();
  // Sync NCM de volta pro pedido vinculado (em memória — persiste no batch)
  const ped = pedidos.find(p => p.id === nf.pedidoId);
  if (ped && ped.itens[idx]) ped.itens[idx].ncm = valor.trim();
}

function salvarDadosNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  const isReal = isNotaFiscalReal(nf);
  nf.numero = (document.getElementById("nf-numero-manual")?.value || "").trim() || nf.numero;
  nf.serie = (document.getElementById("nf-serie-manual")?.value || "").trim() || nf.serie || "1";
  nf.sefaz = nf.sefaz || {};
  nf.sefaz.chaveAcesso = (document.getElementById("nf-chave-manual")?.value || "").trim();
  // Salvar anotação interna dentro de documentos (JSONB no Supabase)
  const anotacaoEl = document.getElementById('nf-anotacao-interna-' + notaId);
  nf.documentos = {
    ...(nf.documentos || {}),
    observacao: nf.documentos?.observacao || "",
    numeroManual: !isReal,
    danfeUrl: (document.getElementById("nf-danfe-url")?.value || "").trim(),
    anotacaoInterna: anotacaoEl ? anotacaoEl.value : (nf.documentos?.anotacaoInterna || nf.anotacaoInterna || "")
  };
  // Legacy compat: keep top-level field in sync
  if (anotacaoEl) nf.anotacaoInterna = anotacaoEl.value;
  nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  setIntegrationState(nf, "sefaz", {
    status: isReal ? (nf.integracoes?.sefaz?.status || "validacao_pendente") : "controle_manual",
    lastAction: isReal ? "metadados_nf_real_atualizados" : "dados_nf_atualizados",
    accessKey: nf.sefaz.chaveAcesso || ""
  });
  saveNotasFiscais();
  // Story 21.x (UX-Fy): persiste 1x os NCMs editados inline de volta ao pedido vinculado
  // (estado já atualizado em memória por salvarNcmItemNf) — localStorage + Supabase.
  if (nf.pedidoId && pedidos.find(p => p.id === nf.pedidoId)) savePedidos(nf.pedidoId);
  renderNotasFiscais();
  verNotaFiscal(notaId);
  showToast(`Dados da NF ${nf.numero} atualizados.`, 3000);
}

// Story 2.2 AC-1: DANFE com layout padrão NF-e + Code128 barcode
// Story 4.75: HTML DANFE extraído como função reutilizável — usado por gerarDanfePdfBase64() e abrirDanfeNotaFiscal()
function gerarDanfeHtmlParaPdf(nf, options) {
  if (!nf) return "";
  const opts = options || {};
  const emit = nf.sefaz?.preview?.emitente || {};
  const emEnd = emit.endereco || {};
  const dest = nf.sefaz?.preview?.destinatario || {};
  const dEnd = dest.endereco || {};
  const chave = nf.sefaz?.chaveAcesso || "";
  const chaveFormatada = chave.replace(/(.{4})/g, "$1 ").trim();
  const prot = nf.sefaz?.protocolo || "";
  const protDt = nf.sefaz?.transmissao?.parsed?.dhRecbto || nf.audit?.authorizedAt || "";
  const protFormatado = prot ? prot + (protDt ? "  -  " + protDt : "") : "-";
  const cancelStamp = nf.cancelamento?.retornoEvento?.dhRegEvento || nf.cancelamento?.atualizadoEm || "";
  const isCancelada = nf.status === "cancelada";
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);
  const totalNota = nf.valor || totalProd;
  const dtEmissao = formatDateTimeLocal(nf.emitidaEm);
  const dtParts = dtEmissao.split(" ");
  const f2 = (v) => Number(v || 0).toFixed(2).replace(".", ",");
  const f4 = (v) => Number(v || 0).toFixed(4).replace(".", ",");
  const numNf = String(nf.numero || "0").padStart(6, "0");
  const numFmt = numNf.replace(/^(\d{3})(\d{3})$/, "$1.$2");
  const destNome = dest.nome || dest.razaoSocial || nf.cliente?.nome || "-";
  const destEndStr = [dEnd.logradouro, dEnd.numero].filter(Boolean).join(", ");
  const destCidade = dEnd.cidade || dEnd.municipio || "";
  const destEmail = dest.email || nf.cliente?.email || "";
  let logoImg = "";
  try { const cfg = JSON.parse(localStorage.getItem("nexedu.config.notas-fiscais") || "{}"); if (cfg.logomarcaBase64) logoImg = cfg.logomarcaBase64; } catch(_) {}
  const emEndLine1 = [emEnd.logradouro, emEnd.numero].filter(Boolean).join(", ");
  const emEndLine2 = [emEnd.bairro, emEnd.complemento].filter(Boolean).join(", ");
  const emEndLine3 = [emEnd.cidade, emEnd.uf].filter(Boolean).join(" - ") + (emEnd.cep ? " - " + emEnd.cep : "");
  const reciboTxt = "RECEBEMOS DE " + (emit.razaoSocial || "-") + " OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO";
  const infCplParts = [];
  if (nf.pedidoId) infCplParts.push("Inf. Contribuinte: Pedido GDP " + nf.pedidoId);
  if (destEmail) infCplParts.push("Email do Destinatário: " + destEmail);
  if (nf.documentos?.observacao) infCplParts.push(nf.documentos.observacao.replace(/\|/g, "\n"));
  infCplParts.push("Valor Aproximado dos Tributos : R$ 0,00");
  const infCplTxt = infCplParts.join("\n");
  const nowPrint = new Date();
  const impressoEm = "Impresso em " + nowPrint.toLocaleDateString("pt-BR") + " as " + nowPrint.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const rows = (nf.itens || []).map((item, idx) => {
    const vt = Number(item.qtd || 0) * Number(item.precoUnitario || 0);
    return '<tr><td class="c">' + esc(item.sku || item.codigoBarras || String(idx+1).padStart(3,"0")) + '</td><td class="desc">' + esc(item.descricao || "") + '</td><td class="c mono">' + esc(item.ncm || "") + '</td><td class="c">' + esc(item.cst || "0/102") + '</td><td class="c">' + esc(item.cfop || "5102") + '</td><td class="c">' + esc(item.unidade || "UN") + '</td><td class="r">' + f4(item.qtd) + '</td><td class="r">' + f4(item.precoUnitario) + '</td><td class="r">' + f2(vt) + '</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td></tr>';
  }).join("");
  // opts.includeBarcode: se true, inclui script do barcode (para window.open). PDF não precisa.
  var barcodeScript = "";
  if (opts.includeBarcode && chave && chave.length >= 10) {
    barcodeScript = '<script>(function(){var chave="' + chave + '";var canvas=document.createElement("canvas");canvas.height=40;canvas.width=Math.max(chave.length*11,400);var ctx=canvas.getContext("2d");var START_B=104,STOP=106;var P=["11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000","11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100","11001001110","11011100100","11001110100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110","11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000","11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110","11000101110","11011101000","11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010","11101111010","11001000010","11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000","10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010","10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011110110","11110110110","21121141211"];var e=[];e.push(P[START_B]);var cs=START_B;for(var i=0;i<chave.length;i++){var v=chave.charCodeAt(i)-32;e.push(P[v]);cs+=v*(i+1)}e.push(P[cs%103]);e.push(P[STOP]);var b=e.join("");var bw=Math.max(1,Math.floor(canvas.width/b.length));canvas.width=b.length*bw+20;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#000";for(var j=0;j<b.length;j++){if(b[j]==="1")ctx.fillRect(10+j*bw,2,bw,canvas.height-4)}var t=document.getElementById("danfe-barcode");if(t)t.appendChild(canvas);' + (opts.autoPrint ? 'window.print();' : '') + '})()</script>';
  }
  return '<!doctype html><html><head><meta charset="utf-8"><title>DANFE NF ' + esc(nf.numero || "") + '</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#000;background:#fff;padding:6mm;max-width:210mm;margin:0 auto}' +
'.bx{border:1px solid #000}' +
'.row{display:flex;border-bottom:1px solid #000;page-break-inside:avoid}' +
'.row:last-child{border-bottom:none}' +
'.cell{border-right:1px solid #000;padding:3px 5px;flex:1;min-height:24px;overflow:hidden}' +
'.cell:last-child{border-right:none}' +
'.cell label{font-size:6pt;color:#000;text-transform:uppercase;display:block;line-height:1.3;margin-bottom:1px}' +
'.cell .v{font-size:9pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.cell .v-lg{font-size:10pt;font-weight:900}' +
'.cell .v-sm{font-size:8pt;font-weight:700;white-space:nowrap}' +
'.stit{font-weight:700;font-size:6.5pt;padding:2px 5px;text-transform:uppercase;border-bottom:1px solid #000;background:#eee}' +
'table.it{width:100%;border-collapse:collapse}' +
'table.it th{border:1px solid #000;padding:2px 4px;font-size:6pt;text-transform:uppercase;font-weight:700;background:#eee}' +
'table.it td{border:1px solid #999;padding:2px 4px;font-size:7.5pt;line-height:1.4}' +
'table.it td:first-child{border-left:1px solid #aaa}' +
'table.it td.desc{max-width:280px;white-space:normal;word-wrap:break-word;overflow-wrap:break-word}' +
'.c{text-align:center}.r{text-align:right}.mono{font-family:monospace;font-size:6pt}' +
'.cancel-stamp{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:64pt;color:rgba(220,38,38,.18);font-weight:900;pointer-events:none;z-index:10;letter-spacing:6px}' +
'.wrap{position:relative}' +
'.rec{border:1px solid #000;display:flex;margin-bottom:3px}' +
'.rec-body{flex:3;border-right:1px solid #000;display:flex;flex-direction:column}' +
'.rec-body .rec-txt{padding:2px 4px;font-size:6pt;line-height:1.3;flex:1}' +
'.rec-body .rec-flds{display:flex;border-top:1px solid #000}' +
'.rec-body .rec-flds .rf{flex:1;padding:1px 3px;border-right:1px solid #000}' +
'.rec-body .rec-flds .rf:last-child{border-right:none}' +
'.rec-body .rec-flds .rf label{font-size:5pt;text-transform:uppercase}' +
'.rec-nf{width:130px;text-align:center;padding:4px}' +
'.rec-nf .nfe{font-size:12pt;font-weight:900}' +
'.rec-nf .num{font-size:11pt;font-weight:900}' +
'.rec-nf .ser{font-size:7pt}' +
'.hdr{display:flex;border-bottom:1px solid #000}' +
'.hdr-logo{width:140px;display:flex;align-items:center;justify-content:center;padding:2px;min-height:85px}' +
'.hdr-emit{flex:3;padding:4px 6px 4px 14px;border-right:1px solid #000;display:flex;flex-direction:column;justify-content:center}' +
'.hdr-emit .nome{font-size:11pt;font-weight:700;white-space:nowrap}' +
'.hdr-emit .end{font-size:7pt;line-height:1.4;white-space:nowrap}' +
'.hdr-danfe{width:120px;text-align:center;padding:2px 4px;border-right:1px solid #000}' +
'.hdr-danfe h1{font-size:16pt;font-weight:900;letter-spacing:1px;margin:0}' +
'.hdr-danfe .sub{font-size:6pt;line-height:1.2}' +
'.hdr-danfe .tp-row{font-size:7pt;margin-top:2px}' +
'.hdr-danfe .tp-box{display:inline-block;border:1px solid #000;padding:0 6px;font-size:10pt;font-weight:900;margin:1px 0}' +
'.hdr-danfe .nf-num{font-size:10pt;font-weight:900;margin-top:2px}' +
'.hdr-danfe .nf-ser{font-size:7pt}' +
'.hdr-danfe .nf-fol{font-size:6pt;font-style:italic}' +
'.hdr-chave{flex:2;padding:2px 4px;overflow:hidden;text-align:center}' +
'.hdr-chave .bc{text-align:center;min-height:32px}' +
'.hdr-chave .lbl{font-size:5pt;text-align:center;text-transform:uppercase;margin-top:1px}' +
'.hdr-chave .val{font-size:6.5pt;font-weight:700;text-align:center;letter-spacing:.4px;word-break:break-all}' +
'.hdr-chave .cons{font-size:5.5pt;text-align:center;margin-top:2px}' +
'@media print{body{padding:0;margin:0}@page{size:A4;margin:6mm}}' +
'</style></head><body>' +
'<div class="rec"><div class="rec-body"><div class="rec-txt">' + esc(reciboTxt) + '</div><div class="rec-flds"><div class="rf"><label>DATA DE RECEBIMENTO</label><div style="min-height:12px"></div></div><div class="rf" style="flex:2"><label>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</label><div style="min-height:12px"></div></div></div></div><div class="rec-nf"><div class="nfe">NF-e</div><div class="num">N°. ' + esc(numFmt) + '</div><div class="ser">Série ' + String(nf.serie || "1").padStart(3,"0") + '</div></div></div>' +
'<div style="border-bottom:1px dashed #000;margin-bottom:3px"></div>' +
'<div class="wrap">' +
(isCancelada ? '<div class="cancel-stamp">CANCELADA</div>' : '') +
'<div class="bx">' +
'<div class="hdr"><div class="hdr-logo">' + (logoImg ? '<img src="' + logoImg + '" style="max-height:82px;max-width:136px;object-fit:contain" />' : '') + '</div><div class="hdr-emit"><div class="nome">' + esc(emit.razaoSocial || "-") + '</div><div class="end">' + esc(emEndLine1) + (emEnd.complemento ? ", " + esc(emEnd.complemento) : "") + '</div><div class="end">' + esc(emEndLine2) + '</div><div class="end">' + esc(emEndLine3) + ' Fone ' + esc(emEnd.telefone || emit.telefone || "") + '</div><div class="end">' + esc(emit.email || "") + '</div></div><div class="hdr-danfe"><h1>DANFE</h1><div class="sub">Documento Auxiliar da Nota<br>Fiscal Eletrônica</div><div class="tp-row">0 - ENTRADA</div><div class="tp-row">1 - SAÍDA <div class="tp-box">1</div></div><div class="nf-num">N°. ' + esc(numFmt) + '</div><div class="nf-ser">Série ' + String(nf.serie || "1").padStart(3,"0") + '</div><div class="nf-fol">Folha 1/1</div></div><div class="hdr-chave"><div class="bc" id="danfe-barcode"></div><div class="lbl">CHAVE DE ACESSO</div><div class="val">' + esc(chaveFormatada || "-") + '</div><div class="cons">Consulta de autenticidade no portal nacional da NF-e<br><strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora</div></div></div>' +
'<div class="row"><div class="cell" style="flex:1"><label>NATUREZA DA OPERAÇÃO</label><div class="v-lg">VENDA DE MERCADORIA</div></div><div class="cell" style="flex:1"><label>PROTOCOLO DE AUTORIZAÇÃO DE USO</label><div class="v">' + esc(protFormatado) + '</div></div></div>' +
'<div class="row"><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">' + esc(emit.ie || "") + '</div></div><div class="cell"><label>INSCRIÇÃO MUNICIPAL</label><div class="v-sm"></div></div><div class="cell"><label>INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</label><div class="v-sm"></div></div><div class="cell"><label>CNPJ / CPF</label><div class="v">' + esc(emit.cnpj || "") + '</div></div></div>' +
'<div class="stit">DESTINATÁRIO / REMETENTE</div>' +
'<div class="row"><div class="cell" style="flex:3"><label>NOME / RAZÃO SOCIAL</label><div class="v">' + esc(destNome) + '</div></div><div class="cell"><label>CNPJ / CPF</label><div class="v-sm">' + esc(dest.cnpj || "") + '</div></div><div class="cell"><label>DATA DA EMISSÃO</label><div class="v-sm">' + (dtParts[0] || "-") + '</div></div></div>' +
'<div class="row"><div class="cell" style="flex:3"><label>ENDEREÇO</label><div class="v">' + esc(destEndStr) + '</div></div><div class="cell"><label>BAIRRO / DISTRITO</label><div class="v-sm">' + esc(dEnd.bairro || "") + '</div></div><div class="cell"><label>CEP</label><div class="v-sm">' + esc(dEnd.cep || "") + '</div></div><div class="cell"><label>DATA DA SAÍDA/ENTRADA</label><div class="v-sm">' + (dtParts[0] || "-") + '</div></div></div>' +
'<div class="row"><div class="cell" style="flex:2"><label>MUNICÍPIO</label><div class="v">' + esc(destCidade) + '</div></div><div class="cell" style="width:30px;flex:none;min-width:30px"><label>UF</label><div class="v-sm">' + esc(dEnd.uf || "") + '</div></div><div class="cell"><label>FONE / FAX</label><div class="v-sm">' + esc(dest.telefone || "") + '</div></div><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">' + esc(dest.ie || "") + '</div></div><div class="cell"><label>HORA DA SAÍDA/ENTRADA</label><div class="v-sm">' + (dtParts[1] || "") + '</div></div></div>' +
'<div class="stit">FATURA / DUPLICATA</div>' +
'<div class="row"><div class="cell"><label>NÚMERO</label><div class="v-sm"></div></div><div class="cell"><label>VENCIMENTO</label><div class="v-sm"></div></div><div class="cell"><label>VALOR</label><div class="v-sm"></div></div><div class="cell"><label>NÚMERO</label><div class="v-sm"></div></div><div class="cell"><label>VENCIMENTO</label><div class="v-sm"></div></div><div class="cell"><label>VALOR</label><div class="v-sm"></div></div></div>' +
'<div class="stit">CÁLCULO DO IMPOSTO</div>' +
'<div class="row"><div class="cell"><label>BASE DE CALC. DO ICMS</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR DO ICMS</label><div class="v-sm">0,00</div></div><div class="cell"><label>BASE DE CALC. ICMS S.T</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR DO ICMS SUBST</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. IMP. IMPORTAÇÃO</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. ICMS UF REMET.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. FCP UF DEST.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOTAL PRODUTOS</label><div class="v">' + f2(totalProd) + '</div></div></div>' +
'<div class="row"><div class="cell"><label>VALOR DO FRETE</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR DO SEGURO</label><div class="v-sm">0,00</div></div><div class="cell"><label>DESCONTO</label><div class="v-sm">0,00</div></div><div class="cell"><label>OUTRAS DESPESAS</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR TOTAL IPI</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. ICMS UF DEST.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOT. TRIB.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOTAL DA NOTA</label><div class="v">' + f2(totalNota) + '</div></div></div>' +
'<div class="stit">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>' +
'<div class="row"><div class="cell" style="flex:2"><label>NOME / RAZÃO SOCIAL</label><div class="v-sm"></div></div><div class="cell"><label>FRETE</label><div class="v-sm">9-Sem Transporte</div></div><div class="cell"><label>CÓDIGO ANTT</label><div class="v-sm"></div></div><div class="cell"><label>PLACA DO VEÍCULO</label><div class="v-sm"></div></div><div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div><div class="cell"><label>CNPJ / CPF</label><div class="v-sm"></div></div></div>' +
'<div class="row"><div class="cell" style="flex:2"><label>ENDEREÇO</label><div class="v-sm"></div></div><div class="cell"><label>MUNICÍPIO</label><div class="v-sm"></div></div><div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm"></div></div></div>' +
'<div class="row"><div class="cell"><label>QUANTIDADE</label><div class="v-sm"></div></div><div class="cell"><label>ESPÉCIE</label><div class="v-sm"></div></div><div class="cell"><label>MARCA</label><div class="v-sm"></div></div><div class="cell"><label>NUMERAÇÃO</label><div class="v-sm"></div></div><div class="cell"><label>PESO BRUTO</label><div class="v-sm"></div></div><div class="cell"><label>PESO LÍQUIDO</label><div class="v-sm"></div></div></div>' +
'<div class="stit">DADOS DOS PRODUTOS / SERVIÇOS</div>' +
'<table class="it"><thead><tr><th>CÓDIGO PRODUTO</th><th style="min-width:120px">DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>O/CSON</th><th>CFOP</th><th>UN</th><th>QUANT.</th><th>VALOR UNIT.</th><th>VALOR TOTAL</th><th>DESC.</th><th>B.CALC ICMS</th><th>VALOR ICMS</th><th>VALOR IPI</th><th>ALIQ ICMS</th><th>ALIQ IPI</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<div class="stit">DADOS ADICIONAIS</div>' +
'<div class="row" style="min-height:90px;border-bottom:none"><div class="cell" style="flex:2"><label>INFORMAÇÕES COMPLEMENTARES</label><div style="font-size:6.5pt;padding-top:2px;line-height:1.5">' + (isCancelada ? '<strong style="color:red">NF-e CANCELADA</strong> em ' + esc(cancelStamp) + ' — ' + esc(nf.cancelamento?.retornoEvento?.xMotivo || "") + '<br>' : "") + '<span style="white-space:pre-line">' + esc(infCplTxt) + '</span></div></div><div class="cell"><label>RESERVADO AO FISCO</label></div></div>' +
'</div></div>' +
'<div style="font-size:6pt;margin-top:3px;color:#333">' + esc(impressoEm) + '</div>' +
barcodeScript +
'</body></html>';
}

function abrirDanfeNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  if (nf.documentos?.danfeUrl) { window.open(nf.documentos.danfeUrl, "_blank"); return; }
  const win = window.open("", "_blank");
  if (!win) { showToast("Nao foi possivel abrir o DANFE.", 3500); return; }
  // Story 4.75: usa gerarDanfeHtmlParaPdf() com barcode + autoPrint
  win.document.write(gerarDanfeHtmlParaPdf(nf, { includeBarcode: true, autoPrint: true }));
  win.document.close();
}

function imprimirDanfe(notaId) {
  abrirDanfeNotaFiscal(notaId);
}

function gerarDanfeHtml(nf) {
  if (!nf) return '';
  const emit = nf.sefaz?.preview?.emitente || {};
  const emEnd = emit.endereco || {};
  const dest = nf.sefaz?.preview?.destinatario || {};
  const dEnd = dest.endereco || {};
  const chave = nf.sefaz?.chaveAcesso || "";
  const chaveFormatada = chave.replace(/(.{4})/g, "$1 ").trim();
  const prot = nf.sefaz?.protocolo || "";
  const isCancelada = nf.status === "cancelada";
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);
  const rows = (nf.itens || []).map((item, idx) => {
    const vt = (Number(item.qtd || 0) * Number(item.precoUnitario || 0));
    return `<tr><td style="text-align:center;border:1px solid #000;padding:2px 4px;font-size:8pt">${item.sku || ("ITEM-"+(idx+1))}</td><td style="border:1px solid #000;padding:2px 4px;font-size:8pt">${item.descricao || ""}</td><td style="text-align:center;border:1px solid #000;padding:2px 4px;font-size:8pt">${item.unidade || "UN"}</td><td style="text-align:right;border:1px solid #000;padding:2px 4px;font-size:8pt">${Number(item.qtd||0).toFixed(2)}</td><td style="text-align:right;border:1px solid #000;padding:2px 4px;font-size:8pt">${Number(item.precoUnitario||0).toFixed(2)}</td><td style="text-align:right;border:1px solid #000;padding:2px 4px;font-size:8pt;font-weight:700">${vt.toFixed(2)}</td></tr>`;
  }).join("");
  return `<div style="border:2px solid #000;padding:8px;margin-bottom:12px;font-family:Arial,sans-serif;font-size:9pt;color:#000;${isCancelada ? 'opacity:.6' : ''}">
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:6px">
      <div><strong style="font-size:11pt">${emit.razaoSocial || "Emitente"}</strong><br><span style="font-size:8pt">${emit.cnpj ? 'CNPJ: '+emit.cnpj : ''} ${emit.ie ? '| IE: '+emit.ie : ''}</span><br><span style="font-size:7pt">${[emEnd.logradouro, emEnd.numero, emEnd.bairro, emEnd.municipio, emEnd.uf].filter(Boolean).join(', ')}</span></div>
      <div style="text-align:right"><strong style="font-size:14pt">DANFE</strong><br><span style="font-size:8pt">NF-e Nº ${nf.numero || "-"}</span><br><span style="font-size:7pt">Chave: ${chaveFormatada || "-"}</span>${prot ? '<br><span style="font-size:7pt">Prot: '+prot+'</span>' : ''}</div>
    </div>
    <div style="border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:6px;font-size:8pt"><strong>Destinatário:</strong> ${dest.razaoSocial || "-"} | CNPJ: ${dest.cnpj || "-"} | ${[dEnd.logradouro, dEnd.numero, dEnd.bairro, dEnd.municipio, dEnd.uf].filter(Boolean).join(', ')}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px"><thead><tr style="background:#eee"><th style="border:1px solid #000;padding:2px 4px;font-size:7pt">Código</th><th style="border:1px solid #000;padding:2px 4px;font-size:7pt">Descrição</th><th style="border:1px solid #000;padding:2px 4px;font-size:7pt">UN</th><th style="border:1px solid #000;padding:2px 4px;font-size:7pt;text-align:right">Qtd</th><th style="border:1px solid #000;padding:2px 4px;font-size:7pt;text-align:right">Vl.Unit</th><th style="border:1px solid #000;padding:2px 4px;font-size:7pt;text-align:right">Vl.Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="text-align:right;font-size:10pt;font-weight:700">Total: R$ ${totalProd.toFixed(2)}</div>
    ${isCancelada ? '<div style="text-align:center;color:red;font-size:14pt;font-weight:900;margin-top:4px">CANCELADA</div>' : ''}
  </div>`;
}

function solicitarCancelamentoNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  if (!canRequestCancelNotaFiscal(nf)) {
    showToast("Somente NF-e real autorizada pode entrar em fluxo de cancelamento.", 4000);
    return;
  }
  const justificativa = (window.prompt("Informe o motivo do cancelamento fiscal.", "") || "").trim();
  if (!justificativa) {
    showToast("Motivo do cancelamento obrigatorio.", 3500);
    return;
  }
  if (!confirm(`Solicitar cancelamento da NF ${nf.numero || nf.id}?\n\nMotivo: ${justificativa}\n\nIsso nao exclui a nota e nao marca como cancelada sem retorno fiscal real.`)) return;

  nf.cancelamento = {
    status: "preparando_envio",
    motivo: justificativa,
    solicitadoEm: new Date().toISOString(),
    solicitadoPor: getAuditActor()
  };
  nf.status = "cancelada";
  nf.audit = {
    ...(nf.audit || {}),
    updatedAt: new Date().toISOString(),
    updatedBy: getAuditActor()
  };
  setIntegrationState(nf, "sefaz", {
    status: "cancelamento_pendente",
    lastAction: "solicitar_cancelamento_nf",
    reason: justificativa,
    accessKey: nf.sefaz?.chaveAcesso || "",
    protocol: nf.sefaz?.protocolo || ""
  });
  // Cancelar pedido vinculado imediatamente
  const pedidoCanc = pedidos.find((item) => item.id === nf.pedidoId);
  if (pedidoCanc) {
    pedidoCanc.fiscal = {
      ...(pedidoCanc.fiscal || {}),
      notaFiscalId: nf.id,
      tipoNota: "nfe_real",
      status: "cancelada",
      updatedAt: new Date().toISOString(),
      updatedBy: getAuditActor()
    };
    savePedidos();
  }
  // Cancelar conta a receber vinculada imediatamente
  const contaCanc = getContaReceberByNota(nf.id);
  if (contaCanc) {
    contaCanc.status = "cancelada";
    contaCanc.cobranca = { ...(contaCanc.cobranca || {}), status: "cancelada" };
    contaCanc.audit = { ...(contaCanc.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
    setIntegrationState(contaCanc, "bancaria", { status: "cancelamento_fiscal_iniciado", lastAction: "vincular_cancelamento_nf" });
    saveContasReceber();
  }
  saveNotasFiscais();
  renderNotasFiscais();
  renderPedidos();
  verNotaFiscal(notaId);

  fetch("/api/gdp-integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "nfe-sefaz-cancelar", chaveAcesso: nf.sefaz?.chaveAcesso, protocolo: nf.sefaz?.protocolo, justificativa: justificativa })
  }).then(async (resp) => {
    const data = await resp.json().catch(() => ({}));
    const result = data.result || {};
    if (!resp.ok) throw new Error(result.error || data.error || `HTTP ${resp.status}`);
    // Rejeicao SEFAZ nao e erro de sistema — tratar resposta normalmente
    const sefazRejeitou = !data.ok && result.parsed;
    if (sefazRejeitou) {
      const cStat = result.parsed?.cStat || result.parsed?.eventoCStat || "";
      const xMotivo = result.parsed?.xMotivo || result.parsed?.eventoXMotivo || "";
      showToast(`SEFAZ rejeitou cancelamento: ${cStat} — ${xMotivo}`, 6000);
    }
    const eventoRegistrado = !!result.parsed?.eventoRegistrado;
    nf.cancelamento = {
      ...(nf.cancelamento || {}),
      status: eventoRegistrado ? "evento_registrado" : "solicitado_backend",
      protocoloBackend: result.parsed?.prot || result.protocol || "",
      provider: result.provider || result.mode || "",
      retornoEvento: result.parsed || null,
      atualizadoEm: new Date().toISOString()
    };
    setIntegrationState(nf, "sefaz", {
      status: eventoRegistrado ? "cancelamento_evento_registrado" : "cancelamento_em_fila",
      protocol: result.parsed?.prot || result.protocol || "",
      cStat: result.parsed?.cStat || "",
      xMotivo: result.parsed?.xMotivo || "",
      lastAction: "solicitar_cancelamento_nf"
    });
    if (eventoRegistrado) {
      nf.status = "cancelada";
      nf.audit = {
        ...(nf.audit || {}),
        updatedAt: new Date().toISOString(),
        updatedBy: getAuditActor()
      };
      const pedido = pedidos.find((item) => item.id === nf.pedidoId);
      if (pedido) {
        pedido.fiscal = {
          ...(pedido.fiscal || {}),
          notaFiscalId: nf.id,
          tipoNota: "nfe_real",
          status: "cancelada",
          updatedAt: new Date().toISOString(),
          updatedBy: getAuditActor()
        };
        savePedidos();
      }
      const conta = getContaReceberByNota(nf.id);
      if (conta) {
        conta.status = "cancelada";
        conta.cobranca = {
          ...(conta.cobranca || {}),
          status: "cancelada"
        };
        conta.audit = {
          ...(conta.audit || {}),
          updatedAt: new Date().toISOString(),
          updatedBy: getAuditActor()
        };
        setIntegrationState(conta, "bancaria", {
          status: "cancelamento_fiscal_confirmado",
          lastAction: "vincular_cancelamento_nf"
        });
        saveContasReceber();
      }
    }
    saveNotasFiscais();
    renderNotasFiscais();
    verNotaFiscal(notaId);
    showToast(`Cancelamento: ${result.parsed?.cStat || "-"} ${result.parsed?.xMotivo || "enviado ao backend fiscal"}`.trim(), 5000);
  }).catch((err) => {
    nf.cancelamento = {
      ...(nf.cancelamento || {}),
      status: "falha_backend",
      erro: err.message,
      atualizadoEm: new Date().toISOString()
    };
    setIntegrationState(nf, "sefaz", {
      status: "cancelamento_falhou",
      error: err.message,
      lastAction: "solicitar_cancelamento_nf"
    });
    saveNotasFiscais();
    renderNotasFiscais();
    verNotaFiscal(notaId);
    showToast(`Falha ao enviar cancelamento: ${err.message}`, 5000);
  });
}

function excluirNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  if (!canDeleteNotaFiscal(nf)) {
    showToast("NF-e real autorizada nao pode ser excluida no GDP. Use cancelamento fiscal proprio.", 4500);
    return;
  }
  if (!confirm(`Excluir a nota ${nf.numero || nf.id}?\n\nEsta acao remove a nota fiscal do GDP.`)) return;

  // EPIC-19 (extensão): SOFT-DELETE sincronizado (substitui hard-delete via .remove()).
  // Marca deletedAt e persiste via saveNotasFiscais → gdpApi.notas_fiscais.save (UPSERT
  // que envia deleted_at ao Supabase, propaga por realtime). loadData filtra deletedAt.
  const nowIsoNf = new Date().toISOString();
  nf.deletedAt = nowIsoNf;
  nf.audit = { ...(nf.audit || {}), updatedAt: nowIsoNf, updatedBy: getAuditActor() };
  saveNotasFiscais(); // persiste a NF COM deletedAt (Supabase recebe o UPDATE)
  notasFiscais = notasFiscais.filter((item) => item.id !== notaId); // some da UI imediatamente

  // Compat: mantém o tombstone local (inofensivo; aposentado no reset). Não é mais o principal.
  try {
    const delKey = "gdp.notas-fiscais.deleted.v1";
    const deleted = JSON.parse(localStorage.getItem(delKey) || "[]");
    if (!deleted.includes(notaId)) deleted.push(notaId);
    localStorage.setItem(delKey, JSON.stringify(deleted));
  } catch(_) {}

  const conta = getContaReceberByNota(notaId);
  if (conta) {
    // SOFT-DELETE da conta a receber vinculada (espelha excluirContaReceber)
    conta.deletedAt = nowIsoNf;
    saveContasReceber(); // persiste COM deletedAt (Supabase recebe o UPDATE)
    contasReceber = contasReceber.filter((item) => item.id !== conta.id);
    try {
      const delKeyCr = "gdp.contas-receber.deleted.v1";
      const deletedCr = JSON.parse(localStorage.getItem(delKeyCr) || "[]");
      if (!deletedCr.includes(conta.id)) deletedCr.push(conta.id);
      localStorage.setItem(delKeyCr, JSON.stringify(deletedCr));
    } catch(_) {}
  }

  const pedido = pedidos.find((item) => item.id === nf.pedidoId);
  if (pedido?.fiscal?.notaFiscalId === notaId) {
    pedido.fiscal = {
      ...(pedido.fiscal || {}),
      notaFiscalId: "",
      status: "nao_emitida",
      updatedAt: new Date().toISOString(),
      updatedBy: getAuditActor()
    };
    savePedidos();
  }

  integracoesGdp = (integracoesGdp || []).filter((item) => !(item.entityType === "nota_fiscal" && item.entityId === notaId));
  saveIntegracoesGdp();
  fecharModalNotaFiscal();
  renderAll();
  showToast(`Nota ${nf.numero || nf.id} excluida.`, 3000);
}

// --- Block 3: Modal close, automated dispatch ---
function fecharModalNotaFiscal() {
  document.getElementById("modal-nota-fiscal").classList.add("hidden");
}

async function dispararCobrancaAutomatica(contaId) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  const providerOk = await emitirOuSincronizarCobrancaReal(contaId, { silent: true });
  if (!providerOk) return;
  conta.automacao = conta.automacao || {};
  const usarWhatsapp = isContaEmAtraso(conta);
  conta.automacao.whatsapp = usarWhatsapp;
  conta.automacao.email = true;
  conta.automacao.ultimoDisparo = new Date().toISOString();
  conta.status = conta.status === "recebida" ? "recebida" : "cobranca_automatica_disparada";
  conta.audit = { ...(conta.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor(), cobrancaDisparadaAt: new Date().toISOString() };
  saveContasReceber();
  queueGdpIntegration("conta_receber", "disparar_cobranca", conta.id, {
    contaReceberId: conta.id,
    cliente: conta.cliente,
    valor: conta.valor,
    forma: conta.forma,
    canais: { whatsapp: !!conta.automacao.whatsapp, email: !!conta.automacao.email }
  }, {
    channel: "comunicacao",
    onSuccess: (data) => updateContaReceberIntegration(conta.id, "comunicacao", { status: "cobranca_disparada", protocol: data.protocol || "", lastAction: "disparar_cobranca" }),
    onError: (err) => updateContaReceberIntegration(conta.id, "comunicacao", { status: "falha_envio", error: err.message, lastAction: "disparar_cobranca" })
  });
  const nota = notasFiscais.find((item) => item.id === conta.origemId);
  if (nota) await dispararEmailNotaEBoletoAutomatico(nota.id, conta.id);
  renderContasReceber();
  showToast(`Cobranca real sincronizada e disparo preparado via e-mail${usarWhatsapp ? " e WhatsApp (titulo em atraso)" : ""} para ${conta.cliente || "cliente"}.`, 4500);
}

// --- Block 4: Email + boleto automation ---
async function dispararEmailNotaEBoletoAutomatico(notaId, contaId, options = {}) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return false;
  // Story 4.56 AC-3: só disparar email automaticamente se NF autorizada
  if (nf.status !== "autorizada") {
    gdpLog("[Email NF] Disparo bloqueado — NF não autorizada. Status:", nf.status);
    return false;
  }
  const conta = contasReceber.find((item) => item.id === contaId) || null;
  const email = (nf.cliente?.email || "").trim();
  const supplierEmail = "edsonlariucci.comercial@gmail.com";
  const recipients = [email, supplierEmail].filter(e => e && e.includes("@"));
  if (recipients.length === 0) {
    updateNotaFiscalIntegration(notaId, "comunicacao", { status: "email_sem_destino", lastAction: options.manual ? "compartilhar_email" : "disparo_automatico_email" });
    return false;
  }
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);
  // Montar observação completa idêntica ao Visualizar DANFE
  const obsRaw = nf.documentos?.observacao || "";
  const destForEmail = nf.sefaz?.preview?.destinatario || nf.cliente || {};
  const destEmailForObs = destForEmail.email || nf.cliente?.email || email || "";
  // Story 4.77: PDF gerado server-side (jsPDF vetorial) — não gerar client-side
  const emailPayload = {
    schoolName: nf.cliente?.nome || "",
    protocol: nf.pedidoId || nf.numero || nf.id,
    date: nf.emitidaEm ? formatDateTimeLocal(nf.emitidaEm) : "",
    total: nf.valor || totalProd,
    items: (nf.itens || []).map((item) => ({ name: item.descricao || "", description: item.descricao || "", qty: item.qtd || 0, unitPrice: item.precoUnitario || 0 })),
    obs: obsRaw || (conta ? `Cobranca ${conta.forma || "boleto"} vinculada` : "Nota fiscal emitida"),
    cnpj: nf.cliente?.cnpj || "",
    responsible: nf.cliente?.responsavel || "",
    nfe: {
      numero: nf.numero || "",
      serie: nf.serie || "1",
      protocolo: nf.sefaz?.protocolo || "",
      valor: nf.valor || totalProd,
      chaveAcesso: nf.sefaz?.chaveAcesso || "",
      emitente: nf.sefaz?.preview?.emitente || {},
      destinatario: nf.sefaz?.preview?.destinatario || nf.cliente || {},
      observacoes: obsRaw,
      pedidoId: nf.pedidoId || "",
      destEmail: destEmailForObs,
      itensNf: (nf.itens || []).map(function(i) { return { desc: i.descricao, ncm: i.ncm, cst: i.cst, cfop: i.cfop, un: i.unidade, qtd: i.qtd, vUnit: i.precoUnitario }; })
    },
    pagamento: conta ? {
      forma: conta.forma || "boleto",
      vencimento: conta.vencimento || "",
      valor: conta.valor || nf.valor || 0,
      linhaDigitavel: conta.cobranca?.linhaDigitavel || "",
      pixCopiaECola: conta.cobranca?.pixCopiaECola || "",
      banco: conta.cobranca?.banco || conta.contaBancaria?.banco || "",
      agencia: conta.cobranca?.agencia || conta.contaBancaria?.agencia || "",
      contaNum: conta.cobranca?.conta || conta.contaBancaria?.conta || ""
    } : null
  };
  try {
    let successCount = 0;
    let lastId = "";
    for (const addr of recipients) {
      try {
        const resp = await fetch("/api/send-order-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...emailPayload, to: addr })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && !data.error) {
          successCount++;
          lastId = data.id || "";
          gdpLog("[Email NF] OK para:", addr, "ID:", data.id || "-");
        } else {
          gdpWarn("[Email NF] Falha para", addr, ":", data.error || resp.status);
        }
      } catch (singleErr) {
        gdpWarn("[Email NF] Erro para", addr, ":", singleErr.message);
      }
    }
    if (successCount === 0) throw new Error("Nenhum email enviado com sucesso");
    updateNotaFiscalIntegration(notaId, "comunicacao", {
      status: options.manual ? "email_compartilhado" : "email_disparado",
      lastAction: options.manual ? "compartilhar_email" : "disparo_automatico_email",
      protocol: lastId,
      emailDisparadoAt: new Date().toISOString()
    });
    if (contaId) {
      updateContaReceberIntegration(contaId, "comunicacao", {
        status: options.manual ? "email_compartilhado" : "email_disparado",
        lastAction: options.manual ? "compartilhar_email" : "disparo_automatico_email",
        protocol: lastId,
        emailDisparadoAt: new Date().toISOString()
      });
    }
    gdpLog("[Email NF] Enviado:", successCount + "/" + recipients.length);
    showToast("Email NF enviado (" + successCount + "/" + recipients.length + " destinatarios)", 4000);
    return true;
  } catch (err) {
    console.error("[Email NF] FALHA:", err.message, "Recipients:", recipients);
    showToast("Falha ao enviar email NF: " + err.message, 5000);
    updateNotaFiscalIntegration(notaId, "comunicacao", { status: "falha_email", error: err.message, lastAction: options.manual ? "compartilhar_email" : "disparo_automatico_email" });
    if (contaId) updateContaReceberIntegration(contaId, "comunicacao", { status: "falha_email", error: err.message, lastAction: options.manual ? "compartilhar_email" : "disparo_automatico_email" });
    return false;
  }
}

// --- Block 5: NF menu actions ---
function getNotaFiscalAtualMenu() {
  return notasFiscais.find((item) => item.id === notaFiscalMenuAtualId) || null;
}

function imprimirDanfeNotaAtual() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  fecharMenuNotaFiscal();
  imprimirDanfe(nf.id);
}

function imprimirDanfesSelecionadas() {
  const items = notasFiscais.filter((item) => _selectedNotaFiscalIds.has(item.id));
  if (!items.length) { showToast("Selecione notas fiscais para imprimir.", 3000); return; }
  // Story 4.78: usar gerarDanfeHtmlParaPdf para layout DANFE completo idêntico ao Visualizar
  // Cada NF gera um documento HTML completo — extrair apenas o body de cada um
  const win = window.open("", "_blank");
  if (!win) { showToast("Popup bloqueado. Permita popups para imprimir.", 3500); return; }
  // Montar um documento único com page-break entre DANFEs
  // Pegar CSS + body do primeiro, depois concatenar os bodies com page-break
  const firstHtml = gerarDanfeHtmlParaPdf(items[0]);
  const styleMatch = firstHtml.match(/<style>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1] : '';
  function extractBody(html) {
    var m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    return m ? m[1] : html;
  }
  var bodies = items.map(function(nf, i) {
    var fullHtml = gerarDanfeHtmlParaPdf(nf);
    var bodyContent = extractBody(fullHtml);
    return (i > 0 ? '<div style="page-break-before:always"></div>' : '') + bodyContent;
  }).join('');
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DANFEs (' + items.length + ' notas)</title><style>' + css + ' @media print{body{padding:0;margin:0}@page{size:A4;margin:6mm}}</style></head><body>' + bodies + '<script>window.print()<\/script></body></html>');
  win.document.close();
}

function excluirNotasSelecionadas() {
  const items = notasFiscais.filter((item) => _selectedNotaFiscalIds.has(item.id));
  if (!items.length) return;
  const bloqueadas = items.filter((nf) => !canDeleteNotaFiscal(nf));
  if (bloqueadas.length) {
    showToast("Ha notas selecionadas que nao podem ser excluidas.", 3500);
    return;
  }
  if (!confirm(`Excluir ${items.length} nota(s) selecionada(s)?`)) return;
  items.forEach((nf) => excluirNotaFiscal(nf.id));
  _selectedNotaFiscalIds.clear();
}

function cancelarNotaAtual() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  fecharMenuNotaFiscal();
  solicitarCancelamentoNotaFiscal(nf.id);
}

function inutilizarNumeracaoNotaAtual() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  const justificativa = prompt("Justificativa da inutilizacao da numeracao:");
  if (!justificativa) return;
  nf.status = "inutilizada";
  nf.inutilizacao = { justificativa, at: new Date().toISOString(), by: getAuditActor() };
  updateNotaFiscalIntegration(nf.id, "sefaz", { status: "numeracao_inutilizada", lastAction: "inutilizar_numeracao" });
  saveNotasFiscais();
  renderNotasFiscais();
  fecharMenuNotaFiscal();
  showToast("Numeracao inutilizada no controle do GDP.", 3500);
}

function emitirCartaCorrecaoNotaAtual() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  const texto = prompt("Informe o texto da carta de correcao:");
  if (!texto) return;
  nf.cartaCorrecao = nf.cartaCorrecao || [];
  nf.cartaCorrecao.push({ texto, at: new Date().toISOString(), by: getAuditActor() });
  updateNotaFiscalIntegration(nf.id, "sefaz", { status: "carta_correcao_registrada", lastAction: "carta_correcao" });
  saveNotasFiscais();
  fecharMenuNotaFiscal();
  showToast("Carta de correcao registrada.", 3000);
}

function downloadXmlNotaAtual() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  const xml = nf.sefaz?.transmissao?.xml || nf.sefaz?.xmlPreview?.signedXml || nf.sefaz?.xmlPreview?.xml || JSON.stringify(nf.sefaz || {}, null, 2);
  const blob = new Blob([String(xml || "")], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nf.numero || nf.id}-nfe.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

function consultarSefazNotaAtual() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  fecharMenuNotaFiscal();
  verNotaFiscal(nf.id);
  showToast("Consulta SEFAZ exibida no detalhe da nota.", 3000);
}

function compartilharNotaAtualWhatsapp() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  const texto = encodeURIComponent(`Nota Fiscal ${nf.numero || nf.id} - ${nf.cliente?.nome || ""} - ${location.origin}/gdp-contratos.html`);
  window.open(`https://wa.me/?text=${texto}`, "_blank");
}

async function compartilharNotaAtualEmail() {
  const nf = getNotaFiscalAtualMenu();
  if (!nf) return;
  const conta = contasReceber.find((item) => item.origemId === nf.id) || null;
  const ok = await dispararEmailNotaEBoletoAutomatico(nf.id, conta?.id || "", { manual: true });
  if (ok) showToast("Email da nota enviado ao cliente.", 3500);
  fecharMenuNotaFiscal();
  renderNotasFiscais();
}