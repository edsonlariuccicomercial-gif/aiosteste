// ===== GDP NOTAS FISCAIS MODULE =====
// Extracted from gdp-contratos.html — NF-e, SEFAZ, DANFE, cobranças

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
  const c = pedido.cliente;
  c.id = clienteContrato?.id || snapshotContrato?.id || c.id || "";
  c.nome = clienteContrato?.nome || snapshotContrato?.nome || c.nome || pedido.escola || "";
  c.cnpj = clienteContrato?.cnpj || snapshotContrato?.cnpj || c.cnpj || "";
  c.ie = clienteContrato?.ie || snapshotContrato?.ie || c.ie || "ISENTO";
  c.email = clienteContrato?.email || snapshotContrato?.email || c.email || "";
  c.telefone = clienteContrato?.telefone || snapshotContrato?.telefone || c.telefone || "";
  c.logradouro = clienteContrato?.logradouro || snapshotContrato?.logradouro || c.logradouro || "";
  c.numero = clienteContrato?.numero || snapshotContrato?.numero || c.numero || "";
  c.complemento = clienteContrato?.complemento || snapshotContrato?.complemento || c.complemento || "";
  c.bairro = clienteContrato?.bairro || snapshotContrato?.bairro || c.bairro || "";
  c.cep = clienteContrato?.cep || snapshotContrato?.cep || c.cep || "";
  c.cidade = clienteContrato?.municipio || snapshotContrato?.cidade || c.cidade || "";
  c.uf = clienteContrato?.uf || snapshotContrato?.uf || c.uf || "MG";
  c.indicador_contribuinte = clienteContrato?.indicador_contribuinte || snapshotContrato?.indicador_contribuinte || c.indicador_contribuinte || "9";
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
    return {
      ...baseItem,
      // NF-e: descrição SEMPRE do contrato (edital), não do produto inteligência
      descricao: contratoItem?.descricao || baseItem.descricao || `Item ${idx + 1}`,
      precoUnitario: Number(baseItem.precoUnitario || contratoItem?.precoUnitario || 0),
      unidade: baseItem.unidade || contratoItem?.unidade || "UN",
      ncm: baseItem.ncm || contratoItem?.ncm || "",
      // SKU: apenas skuVinculado (inteligência LICT-xxxx), nunca auto-gerar
      sku: baseItem.skuVinculado || contratoItem?.skuVinculado || baseItem.sku || contratoItem?.sku || ""
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
  const clienteVinculado = pedido.contratoId ? getClientePrincipalDoContrato(pedido.contratoId) : null;
  const snapshotContrato = pedido.contratoId ? getClienteFiscalSnapshotDoContrato(pedido.contratoId) : null;
  if (tipoNota === "nfe_real" && !clienteVinculado && !(snapshotContrato?.nome || snapshotContrato?.cnpj)) missing.push("cliente vinculado ao contrato");
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

// Sequencial de NF controlado pelo frontend (persiste em localStorage + Supabase)
function getProximoNumeroNf() {
  const KEY = "gdp.nf-counter";
  let counter = parseInt(localStorage.getItem(KEY) || "0", 10);

  // Garantir que counter reflete o maior numero ja usado em notas existentes
  try {
    const nfs = unwrapData(JSON.parse(localStorage.getItem("gdp.notas-fiscais.v1") || "[]"));
    const maxUsado = nfs.reduce((max, nf) => Math.max(max, parseInt(nf.numero) || 0), 0);
    if (maxUsado > counter) counter = maxUsado;
  } catch(_) {}

  if (counter < 1208) counter = 1208; // Base: 1165-1208 já usados/cancelados/inutilizados na SEFAZ
  counter++;
  localStorage.setItem(KEY, String(counter));
  // AC-2: Persistir no Supabase (fire-and-forget)
  try { cloudSave("gdp.nf-counter.v1", { counter, updatedAt: new Date().toISOString() }); } catch(_) {}
  return String(counter);
}

// AC-2: Carregar counter do Supabase ao iniciar (chamado no boot)
async function syncNfCounterFromCloud() {
  try {
    const KEY = "gdp.nf-counter";
    const resp = await fetch(SUPABASE_URL + "/rest/v1/sync_data?key=eq.gdp.nf-counter.v1&select=data&limit=1", {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    const rows = await resp.json();
    if (rows.length && rows[0].data?.counter) {
      const cloudCounter = parseInt(rows[0].data.counter);
      const localCounter = parseInt(localStorage.getItem(KEY) || "0");
      if (cloudCounter > localCounter) {
        localStorage.setItem(KEY, String(cloudCounter));
        console.log("[NF-e] Counter sincronizado do cloud:", cloudCounter);
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
  let dueDateStr = invoice.vencimento;
  if (!dueDateStr) {
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 28);
    dueDateStr = dueDate.toISOString().slice(0, 10);
  }
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
      linhaDigitavel: `34191.${Math.floor(Math.random() * 99999)} ${Math.floor(Math.random() * 99999)} ${Math.floor(Math.random() * 99999)} 1 ${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      pixCopiaECola: contaPadrao?.pix ? `PIX ${contaPadrao.pix} | ${Number(invoice.valor || 0).toFixed(2)}` : `00020126480014BR.GOV.BCB.PIX0126${genId("PIX")}520400005303986540${Number(invoice.valor || 0).toFixed(2)}5802BR5925${(invoice.cliente?.nome || "CLIENTE").slice(0, 25)}6009SAOPAULO62070503***6304ABCD`,
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
  const nfExistente = getNotaFiscalByPedido(pedidoId);
  if (nfExistente && nfExistente.status === "autorizada") {
    showToast(`Pedido ${pedidoId} ja possui nota fiscal autorizada.`, 3500);
    return;
  }
  // Se nota existe mas está rejeitada/pendente, remover para gerar nova
  if (nfExistente && nfExistente.status !== "autorizada") {
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
  notasFiscais.push(invoice);
  saveNotasFiscais();

  const receivable = buildReceivableFromInvoice(invoice);
  contasReceber.push(receivable);
  saveContasReceber();

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
    const detalhesItens = (pedido.itens || []).map((i, idx) => `  ${idx+1}. ${i.descricao} — ${i.qtd} x R$${Number(i.precoUnitario||0).toFixed(2)}`).join("\n");
    if (!confirm("Gerar NF-e REAL com " + qtdItens + " item(ns) para " + (pedido.escola || "cliente") + "?\n\nValor Total: " + brl.format(pedido.valor || 0) + "\n\nItens:\n" + detalhesItens + "\n\nConfirma transmissao a SEFAZ?")) return;
    console.log("[NF-e] Gerando nota com", qtdItens, "itens. Pedido:", pedido.id);
    console.table((pedido.itens||[]).map((i,idx) => ({ "#": idx+1, descricao: i.descricao, qtd: i.qtd, preco: i.precoUnitario, ncm: i.ncm })));

    try {
      // Tentar API Vercel primeiro, fallback para servidor local
      let resp;
      const nfeNumero = getProximoNumeroNf();
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
  updateContaReceberIntegration(receivable.id, "bancaria", {
    status: "titulo_local",
    lastAction: "criar_titulo_local"
  });
  updateNotaFiscalIntegration(invoice.id, "bancaria", {
    status: "titulo_local",
    lastAction: "criar_titulo_local"
  });
  await dispararEmailNotaEBoletoAutomatico(invoice.id, receivable.id);

  registerStockExitFromInvoice(invoice);

  pedido.fiscal = {
    notaFiscalId: invoice.id,
    status: invoice.status,
    tipoNota: invoice.tipoNota,
    cobrancaId: receivable.id,
    updatedAt: new Date().toISOString(),
    updatedBy: getAuditActor()
  };
  pedido.status = "faturado";
  savePedidos();
  renderAll();
  showToast(`${getNotaFiscalTipoLabel(invoice)} ${invoice.numero || invoice.id} registrada com conta a receber vinculada.`, 4500);
}

function savePedidoFiscalData(pedidoId) {
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

  // Persist to Supabase immediately after SEFAZ authorization
  if (window.gdpApi) {
    window.gdpApi.notas_fiscais.save({
      id: nf.id,
      numero: nf.numero,
      serie: nf.serie,
      valor: nf.valor,
      status: nf.status,
      pedido_id: nf.pedidoId,
      contrato_id: nf.contratoId,
      tipo_nota: nf.tipoNota,
      emitida_em: nf.emitidaEm,
      cliente: nf.cliente,
      itens: nf.itens,
      sefaz: nf.sefaz,
      chave_acesso: nf.sefaz?.chaveAcesso,
      protocolo: nf.sefaz?.protocolo,
      xml_autorizado: nf.sefaz?.xmlAutorizado || nf.sefaz?.autorizacaoPreview || '',
      cobranca: nf.cobranca,
      audit: nf.audit
    }).catch(e => console.warn('[NF] Supabase save failed:', e));
  }

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

  renderAll();
  showToast(`NF ${nf.numero} autorizada. ${conta ? "Cobranca real enviada ao provider." : "Sem conta a receber vinculada."}`, 4000);
}

async function transmitirHomologacaoNota(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
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

  // Gerar novo número para retransmissão (evita duplicidade 539)
  const novoNumero = getProximoNumeroNf();
  nf.numero = novoNumero;
  const nfObs = nf.documentos?.observacao || "";

  setIntegrationState(nf, "sefaz", { status: "transmissao_em_preparo", lastAction: "nfe_sefaz_transmitir" });
  saveNotasFiscais();
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
      console.warn("[NF-e] Vercel indisponível, tentando servidor local...");
      resp = await fetch("http://localhost:8082/api/nfe/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, overrides: { numero: getProximoNumeroNf(), observacao: nfObs } }),
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
    nf.sefaz.status = result.parsed?.autorizado ? "autorizada" : (result.parsed?.cStat ? "rejeitada" : "transmitida");
    nf.sefaz.protocolo = result.parsed?.prot || nf.sefaz?.protocolo || "";
    nf.sefaz.chaveAcesso = result.parsed?.chNFe || nf.sefaz?.chaveAcesso || "";
    nf.numero = nf.numero || result.preview?.identificacao?.numero || nf.numero;
    nf.serie = nf.serie || result.preview?.identificacao?.serie || nf.serie || "1";
    nf.status = result.parsed?.autorizado ? "autorizada" : (result.parsed?.cStat ? "rejeitada" : "transmitida");
    nf.audit = {
      ...(nf.audit || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: getAuditActor(),
      authorizedAt: result.parsed?.autorizado ? (result.parsed?.dhRecbto || new Date().toISOString()) : (nf.audit?.authorizedAt || ""),
      authorizedBy: result.parsed?.autorizado ? getAuditActor() : (nf.audit?.authorizedBy || "")
    };
    setIntegrationState(nf, "sefaz", {
      status: result.parsed?.autorizado ? "autorizada" : (result.parsed?.cStat ? "rejeitada" : "transmissao_realizada"),
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

    const conta = getContaReceberByNota(nf.id);
    if (conta && result.parsed?.autorizado) {
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
      await emitirOuSincronizarCobrancaReal(conta.id, { silent: true });
    }

    saveNotasFiscais();

    // Persist to Supabase immediately after real SEFAZ authorization
    if (window.gdpApi && result.parsed?.autorizado) {
      window.gdpApi.notas_fiscais.save({
        id: nf.id,
        numero: nf.numero,
        serie: nf.serie,
        valor: nf.valor,
        status: nf.status,
        pedido_id: nf.pedidoId,
        contrato_id: nf.contratoId,
        tipo_nota: nf.tipoNota,
        emitida_em: nf.emitidaEm,
        cliente: nf.cliente,
        itens: nf.itens,
        sefaz: nf.sefaz,
        chave_acesso: nf.sefaz?.chaveAcesso,
        protocolo: nf.sefaz?.protocolo,
        xml_autorizado: nf.sefaz?.transmissao?.xml || nf.sefaz?.xmlAutorizado || nf.sefaz?.autorizacaoPreview || '',
        cobranca: nf.cobranca,
        audit: nf.audit
      }).catch(e => console.warn('[NF] Supabase save failed:', e));
    }

    renderAll();
    showToast(`SEFAZ: ${result.parsed?.cStat || "-"} ${result.parsed?.xMotivo || ""}`.trim(), 5000);
  } catch (err) {
    nf.status = "rejeitada";
    nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
    setIntegrationState(nf, "sefaz", { status: "transmissao_falhou", lastAction: "nfe_sefaz_emitir_real", error: err.message });
    saveNotasFiscais();
    renderAll();
    showToast(`Falha na transmissao SEFAZ: ${err.message}`, 4500);
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
  html += '<h3 style="margin-bottom:1rem">Documentos Fiscais</h3>';
  html += '<div style="font-size:.76rem;color:var(--mut);margin-bottom:.8rem">' + (isReal ? 'NF-e real: numero, chave e protocolo devem refletir o retorno fiscal do fluxo SEFAZ.' : 'Manual externa: use este bloco para registrar numero, chave e DANFE emitidos fora do GDP.') + '</div>';
  if (isReal && nf.status === "autorizada") {
    html += '<div style="margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid rgba(34,197,94,.35);border-radius:10px;background:rgba(34,197,94,.08);font-size:.8rem;color:var(--txt)">NF-e real autorizada. Este registro nao pode ser excluido no GDP. Para desfazer, use cancelamento fiscal proprio e preserve a rastreabilidade.</div>';
  }
  if (isReal && nf.status === "cancelada") {
    html += '<div style="margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid rgba(239,68,68,.35);border-radius:10px;background:rgba(239,68,68,.08);font-size:.8rem;color:var(--txt)">NF-e cancelada na SEFAZ. Este registro permanece no GDP por rastreabilidade fiscal e nao pode ser excluido.</div>';
  }
  if (nf.cancelamento?.status) {
    html += '<div style="margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid rgba(245,158,11,.35);border-radius:10px;background:rgba(245,158,11,.08);font-size:.8rem;color:var(--txt)">Cancelamento: <strong>' + esc(nf.cancelamento.status) + '</strong> | Motivo: ' + esc(nf.cancelamento.motivo || '-') + ' | Solicitado em: ' + esc(formatDateTimeLocal(nf.cancelamento.solicitadoEm || "")) + '</div>';
  }
  html += '<div style="display:grid;grid-template-columns:1.1fr .7fr 1.3fr;gap:.8rem">';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Numero da NF</label><input id="nf-numero-manual" type="text" value="' + esc(nf.numero || '') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Serie</label><input id="nf-serie-manual" type="text" value="' + esc(nf.serie || '1') + '" style="width:100%"></div>';
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Chave de Acesso</label><input id="nf-chave-manual" type="text" value="' + esc(nf.sefaz?.chaveAcesso || '') + '" style="width:100%"></div>';
  html += '<div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Link do DANFE/PDF</label><input id="nf-danfe-url" type="text" value="' + esc(nf.documentos?.danfeUrl || '') + '" placeholder="Cole aqui o link do DANFE ou PDF" style="width:100%"></div>';
  html += '</div>';
  // Email section
  const destEmail = nf.cliente?.email || nf.sefaz?.preview?.destinatario?.email || '';
  html += '<div style="margin-top:1rem;padding:.8rem 1rem;background:var(--bg);border:1px solid var(--bdr);border-radius:8px">';
  html += '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">';
  html += '<label style="font-size:.72rem;color:var(--mut);white-space:nowrap">Enviar NF por email:</label>';
  html += '<input type="email" id="nf-email-dest-' + nf.id + '" value="' + esc(destEmail) + '" placeholder="email@destino.com" style="flex:1;min-width:200px">';
  html += '<button class="btn btn-sm" style="background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700;white-space:nowrap" onclick="enviarEmailNotaFiscal(\'' + nf.id + '\')">📧 Enviar Email</button>';
  html += '</div></div>';

  html += '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">';
  html += '<button class="btn btn-outline" onclick="salvarDadosNotaFiscal(\'' + nf.id + '\')">' + (isReal ? 'Salvar Metadados da NF' : 'Salvar Dados da NF') + '</button>';
  html += '<button class="btn btn-outline" onclick="abrirDanfeNotaFiscal(\'' + nf.id + '\')">Visualizar DANFE</button>';
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
  html += '<div><label style="font-size:.72rem;color:var(--mut);display:block;margin-bottom:.25rem">Status</label><div style="padding:.55rem .75rem;border:1px solid var(--bdr);border-radius:8px;background:var(--s1)">' + esc(nf.cobranca?.status || '-') + '</div></div>';
  html += '<button class="btn btn-outline" onclick="atualizarFormaCobrancaNota(\'' + nf.id + '\', document.getElementById(\'nf-forma-cobranca\').value)">Atualizar Cobranca</button>';
  html += (conta ? '<button class="btn btn-green" onclick="dispararCobrancaAutomatica(\'' + conta.id + '\')">Cobrar Agora</button>' : '<span></span>');
  html += '</div>';

  if (isReal) {
    html += '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem">';
    html += canTransmitNotaFiscal(nf)
      ? '<button class="btn btn-outline" onclick="transmitirHomologacaoNota(\'' + nf.id + '\')">Transmitir SEFAZ</button>'
      : '<button class="btn btn-outline" disabled title="NF com estado fiscal final">Transmitir SEFAZ</button>';
    html += '</div>';
  }
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

  html += '<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="text-center">Qtd</th><th class="text-center">Un.</th><th class="text-center">NCM</th><th class="text-right">Unit.</th><th class="text-right">Subtotal</th></tr></thead><tbody>';
  html += (nf.itens || []).map((item) => '<tr><td>' + esc(item.descricao || '') + '</td><td class="text-center">' + (item.qtd || 0) + '</td><td class="text-center">' + esc(item.unidade || '-') + '</td><td class="text-center">' + esc(item.ncm || '-') + '</td><td class="text-right">' + brl.format(item.precoUnitario || 0) + '</td><td class="text-right">' + brl.format((item.qtd || 0) * (item.precoUnitario || 0)) + '</td></tr>').join('');
  html += '</tbody></table></div>';

  document.getElementById("modal-nota-fiscal-titulo").textContent = `${getNotaFiscalTipoLabel(nf)} ${nf.numero || nf.id} — ${nf.cliente?.nome || ''}`;
  document.getElementById("modal-nota-fiscal-body").innerHTML = html;
  document.getElementById("modal-nota-fiscal").classList.remove("hidden");
}

async function enviarEmailNotaFiscal(notaId) {
  const nf = notasFiscais.find(n => n.id === notaId);
  if (!nf) return;
  const emailInput = document.getElementById('nf-email-dest-' + notaId);
  const to = (emailInput?.value || '').trim();
  if (!to || !to.includes('@')) { showToast('Informe um email válido.', 3000); return; }

  const pedido = pedidos.find(p => p.id === nf.pedidoId);
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);

  // Gerar PDF do DANFE
  let danfePdfBase64 = "";
  try {
    if (typeof html2pdf !== "undefined") {
      showToast("Gerando PDF do DANFE...", 2000);
      danfePdfBase64 = await gerarDanfePdfBase64(nf);
    }
  } catch (pdfErr) {
    console.warn("[Email NF] Falha PDF:", pdfErr.message);
  }
  const payload = {
    to,
    schoolName: nf.cliente?.nome || pedido?.escola || '',
    protocol: nf.pedidoId || nf.id,
    date: formatDateTimeLocal(nf.emitidaEm).split(' ')[0],
    items: (nf.itens || []).map(i => ({ name: i.descricao, qty: i.qtd, unitPrice: i.precoUnitario, unit: i.unidade })),
    total: nf.valor || totalProd,
    responsible: nf.cliente?.responsavel || '',
    cnpj: nf.cliente?.cnpj || '',
    nfe: {
      numero: nf.numero,
      serie: nf.serie || '1',
      protocolo: nf.sefaz?.protocolo || '',
      valor: nf.valor || totalProd,
      chaveAcesso: nf.sefaz?.chaveAcesso || '',
      danfePdf: danfePdfBase64,
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
  const danfeHtml = gerarDanfeHtmlCompleto(nf);
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:210mm;background:#fff";
  container.innerHTML = danfeHtml;
  document.body.appendChild(container);
  try {
    const opt = { margin: [6, 6, 6, 6], filename: "DANFE_" + (nf.numero || nf.id) + ".pdf", image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } };
    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf("blob");
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(pdfBlob);
    });
  } finally {
    document.body.removeChild(container);
  }
}

function gerarDanfeHtmlCompleto(nf) {
  if (!nf) return "";
  const emit = nf.sefaz?.preview?.emitente || {};
  const emEnd = emit.endereco || {};
  const dest = nf.sefaz?.preview?.destinatario || {};
  const dEnd = dest.endereco || {};
  const chave = nf.sefaz?.chaveAcesso || "";
  const chaveFormatada = chave.replace(/(.{4})/g, "$1 ").trim();
  const prot = nf.sefaz?.protocolo || "";
  const protDt = nf.sefaz?.transmissao?.parsed?.dhRecbto || nf.audit?.authorizedAt || "";
  const protFormatado = prot ? prot + (protDt ? "  -  " + protDt : "") : "-";
  const isCancelada = nf.status === "cancelada";
  const cancelStamp = nf.cancelamento?.retornoEvento?.dhRegEvento || nf.cancelamento?.atualizadoEm || "";
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);
  const totalNota = nf.valor || totalProd;
  const dtEmissao = formatDateTimeLocal(nf.emitidaEm);
  const dtParts = dtEmissao.split(" ");
  const f2 = (v) => Number(v || 0).toFixed(2).replace(".", ",");
  const f4 = (v) => Number(v || 0).toFixed(4).replace(".", ",");
  const numNf = String(nf.numero || "0").padStart(9, "0");
  const numFmt = numNf.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
  const destNome = dest.nome || dest.razaoSocial || nf.cliente?.nome || "-";
  const destEnd = [dEnd.logradouro, dEnd.numero].filter(Boolean).join(", ");
  const destCidade = dEnd.cidade || dEnd.municipio || "";
  const emEndFull = [emEnd.logradouro, emEnd.numero].filter(Boolean).join(", ");
  const destEmail = dest.email || nf.cliente?.email || "";
  const infCplParts = [];
  if (nf.pedidoId) infCplParts.push("Inf. Contribuinte: Pedido GDP " + nf.pedidoId);
  if (destEmail) infCplParts.push("Email do Destinatário: " + destEmail);
  if (nf.documentos?.observacao) infCplParts.push(esc(nf.documentos.observacao).replace(/\|/g, "<br>"));
  infCplParts.push("Valor Aproximado dos Tributos : R$ 0,00");
  const rows = (nf.itens || []).map((item, idx) => {
    const vt = Number(item.qtd || 0) * Number(item.precoUnitario || 0);
    return "<tr><td class='c'>" + esc(item.sku || String(idx+1).padStart(3,"0")) + "</td><td>" + esc(item.descricao || "") + "</td><td class='c'>" + esc(item.ncm || "") + "</td><td class='c'>" + esc(item.cst || "0/102") + "</td><td class='c'>" + esc(item.cfop || "5102") + "</td><td class='c'>" + esc(item.unidade || "UN") + "</td><td class='r'>" + f4(item.qtd) + "</td><td class='r'>" + f4(item.precoUnitario) + "</td><td class='r'>" + f2(vt) + "</td><td class='r'>0,00</td><td class='r'>0,00</td><td class='r'>0,00</td><td class='r'>0,00</td><td class='r'>0,00</td><td class='r'>0,00</td></tr>";
  }).join("");
  return `<style>*{margin:0;padding:0;box-sizing:border-box}body,div,table{font-family:Arial,sans-serif;font-size:7.5pt;color:#000}.bx{border:1px solid #000}.row{display:flex;border-bottom:1px solid #000}.cell{border-right:1px solid #000;padding:0 3px;flex:1;min-height:16px;overflow:hidden}.cell:last-child{border-right:none}.cell label{font-size:5pt;text-transform:uppercase;display:block}.cell .v{font-size:8pt;font-weight:700}.cell .v-lg{font-size:9pt;font-weight:900}.cell .v-sm{font-size:7pt;font-weight:700}.stit{font-weight:700;font-size:5.5pt;padding:0 3px;text-transform:uppercase;border-bottom:1px solid #000}table.it{width:100%;border-collapse:collapse}table.it th{border:1px solid #000;padding:0 2px;font-size:4.5pt;text-transform:uppercase;font-weight:700}table.it td{border-right:1px solid #aaa;border-bottom:1px solid #aaa;padding:0 2px;font-size:6pt}.c{text-align:center}.r{text-align:right}.hdr{display:flex;border-bottom:1px solid #000}.hdr-emit{flex:2;padding:3px 5px;border-right:1px solid #000;text-align:center}.hdr-danfe{width:120px;text-align:center;padding:2px 3px;border-right:1px solid #000}.hdr-chave{flex:1;padding:2px 3px}</style>
<div class="bx">
<div class="hdr"><div class="hdr-emit"><div style="font-size:5pt;text-transform:uppercase">IDENTIFICAÇÃO DO EMITENTE</div><div style="font-size:10pt;font-weight:700">${esc(emit.razaoSocial || "-")}</div><div style="font-size:6.5pt">${esc(emEndFull)}${emEnd.complemento ? ", " + esc(emEnd.complemento) : ""}</div><div style="font-size:6.5pt">${esc(emEnd.bairro || "")} - ${esc(emEnd.cep || "")} - ${esc(emEnd.cidade || "")}/${esc(emEnd.uf || "")} Fone: ${esc(emEnd.telefone || "")}</div></div><div class="hdr-danfe"><div style="font-size:14pt;font-weight:900">DANFE</div><div style="font-size:5.5pt">Documento Auxiliar da Nota<br>Fiscal Eletrônica</div><div style="font-size:6.5pt;margin-top:2px">0-ENTRADA 1-SAÍDA <span style="border:1px solid #000;padding:0 4px;font-weight:900">1</span></div><div style="font-size:9pt;font-weight:900;margin-top:2px">N°. ${esc(numFmt)}</div><div style="font-size:6.5pt">Série ${String(nf.serie||"1").padStart(3,"0")}</div></div><div class="hdr-chave"><div style="font-size:5pt;text-align:center;text-transform:uppercase">CHAVE DE ACESSO</div><div style="font-size:6pt;font-weight:700;text-align:center;word-break:break-all">${esc(chaveFormatada || "-")}</div><div style="font-size:5pt;text-align:center;margin-top:2px">www.nfe.fazenda.gov.br/portal</div></div></div>
<div class="row"><div class="cell" style="flex:1"><label>NATUREZA DA OPERAÇÃO</label><div class="v-lg">VENDA DE MERCADORIA</div></div><div class="cell" style="flex:1"><label>PROTOCOLO DE AUTORIZAÇÃO DE USO</label><div class="v">${esc(protFormatado)}</div></div></div>
<div class="row"><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">${esc(emit.ie || "")}</div></div><div class="cell"><label>INSCRIÇÃO MUNICIPAL</label><div class="v-sm"></div></div><div class="cell"><label>INSC. EST. SUBST. TRIBUT.</label><div class="v-sm"></div></div><div class="cell"><label>CNPJ / CPF</label><div class="v">${esc(emit.cnpj || "")}</div></div></div>
<div class="stit">DESTINATÁRIO / REMETENTE</div>
<div class="row"><div class="cell" style="flex:3"><label>NOME / RAZÃO SOCIAL</label><div class="v">${esc(destNome)}</div></div><div class="cell"><label>CNPJ / CPF</label><div class="v-sm">${esc(dest.cnpj || "")}</div></div><div class="cell"><label>DATA DA EMISSÃO</label><div class="v-sm">${dtParts[0] || "-"}</div></div></div>
<div class="row"><div class="cell" style="flex:3"><label>ENDEREÇO</label><div class="v-sm">${esc(destEnd)}</div></div><div class="cell"><label>BAIRRO</label><div class="v-sm">${esc(dEnd.bairro || "")}</div></div><div class="cell"><label>CEP</label><div class="v-sm">${esc(dEnd.cep || "")}</div></div></div>
<div class="row"><div class="cell" style="flex:2"><label>MUNICÍPIO</label><div class="v-sm">${esc(destCidade)}</div></div><div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm">${esc(dEnd.uf || "")}</div></div><div class="cell"><label>FONE</label><div class="v-sm">${esc(dest.telefone || "")}</div></div><div class="cell"><label>IE</label><div class="v-sm">${esc(dest.ie || "")}</div></div></div>
<div class="stit">CÁLCULO DO IMPOSTO</div>
<div class="row"><div class="cell"><label>BASE CÁLC. ICMS</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR ICMS</label><div class="v-sm">0,00</div></div><div class="cell"><label>BASE ICMS S.T.</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR ICMS SUBST.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. IMP. IMPORT.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOTAL PRODUTOS</label><div class="v">${f2(totalProd)}</div></div></div>
<div class="row"><div class="cell"><label>FRETE</label><div class="v-sm">0,00</div></div><div class="cell"><label>SEGURO</label><div class="v-sm">0,00</div></div><div class="cell"><label>DESCONTO</label><div class="v-sm">0,00</div></div><div class="cell"><label>OUTRAS</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR IPI</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOTAL DA NOTA</label><div class="v">${f2(totalNota)}</div></div></div>
<div class="stit">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
<div class="row"><div class="cell" style="flex:2"><label>NOME / RAZÃO SOCIAL</label><div class="v-sm"></div></div><div class="cell"><label>FRETE</label><div class="v-sm">9-Sem Transporte</div></div><div class="cell"><label>PLACA</label><div class="v-sm"></div></div><div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div><div class="cell"><label>CNPJ / CPF</label><div class="v-sm"></div></div></div>
<div class="stit">DADOS DOS PRODUTOS / SERVIÇOS</div>
<table class="it"><thead><tr><th>CÓDIGO</th><th style="min-width:80px">DESCRIÇÃO</th><th>NCM/SH</th><th>O/CSOSN</th><th>CFOP</th><th>UN</th><th>QUANT</th><th>VL.UNIT</th><th>VL.TOTAL</th><th>DESC</th><th>B.CÁLC</th><th>VL.ICMS</th><th>VL.IPI</th><th>AL.ICMS</th><th>AL.IPI</th></tr></thead><tbody>${rows}</tbody></table>
<div class="stit">DADOS ADICIONAIS</div>
<div class="row" style="min-height:30px"><div class="cell" style="flex:2"><label>INFORMAÇÕES COMPLEMENTARES</label><div style="font-size:6pt;padding-top:1px">${isCancelada ? '<strong style="color:red">CANCELADA</strong> ' + esc(cancelStamp) + "<br>" : ""}${infCplParts.join("<br>")}</div></div><div class="cell"><label>RESERVADO AO FISCO</label></div></div>
</div>
<div style="font-size:5.5pt;margin-top:2px">Impresso em ${new Date().toLocaleDateString("pt-BR")} as ${new Date().toLocaleTimeString("pt-BR")}</div>`;
}

async function reenviarEmailNfPedido(pedidoId) {
  const nf = notasFiscais.find(n => n.pedidoId === pedidoId);
  if (!nf) { showToast('Este pedido ainda não tem nota fiscal gerada.', 3000); return; }
  const conta = contasReceber.find(c => c.notaFiscalId === nf.id || c.pedidoId === pedidoId) || null;
  showToast('Gerando PDF e enviando e-mail da NF ' + (nf.numero || nf.id) + '...', 3000);
  await dispararEmailNotaEBoletoAutomatico(nf.id, conta?.id || null, { manual: true });
}

function salvarDadosNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  const isReal = isNotaFiscalReal(nf);
  nf.numero = (document.getElementById("nf-numero-manual")?.value || "").trim() || nf.numero;
  nf.serie = (document.getElementById("nf-serie-manual")?.value || "").trim() || nf.serie || "1";
  nf.sefaz = nf.sefaz || {};
  nf.sefaz.chaveAcesso = (document.getElementById("nf-chave-manual")?.value || "").trim();
  nf.documentos = {
    ...(nf.documentos || {}),
    numeroManual: !isReal,
    danfeUrl: (document.getElementById("nf-danfe-url")?.value || "").trim()
  };
  nf.audit = { ...(nf.audit || {}), updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
  setIntegrationState(nf, "sefaz", {
    status: isReal ? (nf.integracoes?.sefaz?.status || "validacao_pendente") : "controle_manual",
    lastAction: isReal ? "metadados_nf_real_atualizados" : "dados_nf_atualizados",
    accessKey: nf.sefaz.chaveAcesso || ""
  });
  saveNotasFiscais();
  renderNotasFiscais();
  verNotaFiscal(notaId);
  showToast(`Dados da NF ${nf.numero} atualizados.`, 3000);
}

// Story 2.2 AC-1: DANFE com layout padrão NF-e + Code128 barcode
function abrirDanfeNotaFiscal(notaId) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  if (nf.documentos?.danfeUrl) { window.open(nf.documentos.danfeUrl, "_blank"); return; }
  const win = window.open("", "_blank");
  if (!win) { showToast("Nao foi possivel abrir o DANFE.", 3500); return; }
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
  const numNf = String(nf.numero || "0").padStart(9, "0");
  const numFmt = numNf.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
  const destNome = dest.nome || dest.razaoSocial || nf.cliente?.nome || "-";
  const destEnd = [dEnd.logradouro, dEnd.numero].filter(Boolean).join(", ");
  const destCidade = dEnd.cidade || dEnd.municipio || "";
  const emEndFull = [emEnd.logradouro, emEnd.numero].filter(Boolean).join(", ");
  const destEmail = dest.email || nf.cliente?.email || "";
  const reciboTxt = `RECEBEMOS DE ${emit.razaoSocial || "-"} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: ${dtParts[0] || "-"} VALOR TOTAL: R$ ${f2(totalNota)} DESTINATÁRIO: ${destNome} - ${destEnd} ${dEnd.bairro || ""} ${destCidade}-${dEnd.uf || ""}`;
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
    return `<tr>
      <td class="c">${esc(item.sku || item.codigoBarras || String(idx+1).padStart(3,"0"))}</td>
      <td class="desc">${esc(item.descricao || "")}</td>
      <td class="c mono">${esc(item.ncm || "")}</td>
      <td class="c">${esc(item.cst || "0/102")}</td>
      <td class="c">${esc(item.cfop || "5102")}</td>
      <td class="c">${esc(item.unidade || "UN")}</td>
      <td class="r">${f4(item.qtd)}</td>
      <td class="r">${f4(item.precoUnitario)}</td>
      <td class="r">${f2(vt)}</td>
      <td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td>
    </tr>`;
  }).join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>DANFE NF ${esc(nf.numero || "")}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#000;padding:6mm;max-width:210mm;margin:0 auto}
.bx{border:1px solid #000}
.row{display:flex;border-bottom:1px solid #000}
.row:last-child{border-bottom:none}
.cell{border-right:1px solid #000;padding:0 3px;flex:1;min-height:18px;overflow:hidden}
.cell:last-child{border-right:none}
.cell label{font-size:5pt;color:#000;text-transform:uppercase;display:block;line-height:1}
.cell .v{font-size:8pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cell .v-lg{font-size:10pt;font-weight:900}
.cell .v-sm{font-size:7pt;font-weight:700;white-space:nowrap}
.stit{font-weight:700;font-size:5.5pt;padding:0 3px;text-transform:uppercase;border-bottom:1px solid #000}
table.it{width:100%;border-collapse:collapse}
table.it th{border:1px solid #000;padding:0 2px;font-size:5pt;text-transform:uppercase;font-weight:700}
table.it td{border-right:1px solid #aaa;border-bottom:1px solid #aaa;padding:0 2px;font-size:6.5pt;line-height:1.4}
table.it td:first-child{border-left:1px solid #aaa}
table.it td.desc{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.c{text-align:center}.r{text-align:right}.mono{font-family:monospace;font-size:6pt}
.cancel-stamp{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:64pt;color:rgba(220,38,38,.18);font-weight:900;pointer-events:none;z-index:10;letter-spacing:6px}
.wrap{position:relative}
/* Recibo */
.rec{border:1px solid #000;display:flex;margin-bottom:3px}
.rec-body{flex:3;border-right:1px solid #000;display:flex;flex-direction:column}
.rec-body .rec-txt{padding:2px 4px;font-size:6pt;line-height:1.3;flex:1}
.rec-body .rec-flds{display:flex;border-top:1px solid #000}
.rec-body .rec-flds .rf{flex:1;padding:1px 3px;border-right:1px solid #000}
.rec-body .rec-flds .rf:last-child{border-right:none}
.rec-body .rec-flds .rf label{font-size:5pt;text-transform:uppercase}
.rec-nf{width:130px;text-align:center;padding:4px}
.rec-nf .nfe{font-size:12pt;font-weight:900}
.rec-nf .num{font-size:11pt;font-weight:900}
.rec-nf .ser{font-size:7pt}
/* Header */
.hdr{display:flex;border-bottom:1px solid #000}
.hdr-emit{flex:2;padding:4px 6px;border-right:1px solid #000}
.hdr-emit .ident{font-size:5pt;text-transform:uppercase;text-align:center;margin-bottom:2px}
.hdr-emit .nome{font-size:11pt;font-weight:700;text-align:center}
.hdr-emit .end{font-size:7pt;text-align:center}
.hdr-danfe{width:140px;text-align:center;padding:2px 4px;border-right:1px solid #000}
.hdr-danfe h1{font-size:16pt;font-weight:900;letter-spacing:1px;margin:0}
.hdr-danfe .sub{font-size:6pt;line-height:1.2}
.hdr-danfe .tp-row{font-size:7pt;margin-top:2px}
.hdr-danfe .tp-box{display:inline-block;border:1px solid #000;padding:0 6px;font-size:10pt;font-weight:900;margin:1px 0}
.hdr-danfe .nf-num{font-size:10pt;font-weight:900;margin-top:2px}
.hdr-danfe .nf-ser{font-size:7pt}
.hdr-danfe .nf-fol{font-size:6pt;font-style:italic}
.hdr-chave{flex:1;padding:2px 4px}
.hdr-chave .bc{text-align:center;min-height:32px}
.hdr-chave .lbl{font-size:5pt;text-align:center;text-transform:uppercase;margin-top:1px}
.hdr-chave .val{font-size:6.5pt;font-weight:700;text-align:center;letter-spacing:.4px;word-break:break-all}
.hdr-chave .cons{font-size:5.5pt;text-align:center;margin-top:2px}
@media print{body{padding:0;margin:0}@page{size:A4;margin:6mm}}
</style></head><body>
<!-- RECIBO -->
<div class="rec">
  <div class="rec-body">
    <div class="rec-txt">${esc(reciboTxt)}</div>
    <div class="rec-flds">
      <div class="rf"><label>DATA DE RECEBIMENTO</label><div style="min-height:12px"></div></div>
      <div class="rf" style="flex:2"><label>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</label><div style="min-height:12px"></div></div>
    </div>
  </div>
  <div class="rec-nf">
    <div class="nfe">NF-e</div>
    <div class="num">N°. ${esc(numFmt)}</div>
    <div class="ser">Série ${String(nf.serie || "1").padStart(3,"0")}</div>
  </div>
</div>
<div style="border-bottom:1px dashed #000;margin-bottom:3px"></div>
<!-- DANFE -->
<div class="wrap">
${isCancelada ? '<div class="cancel-stamp">CANCELADA</div>' : ''}
<div class="bx">
  <div class="hdr">
    <div class="hdr-emit">
      <div class="ident">IDENTIFICAÇÃO DO EMITENTE</div>
      <div class="nome">${esc(emit.razaoSocial || "-")}</div>
      <div class="end">${esc(emEndFull)}${emEnd.complemento ? ", " + esc(emEnd.complemento) : ""}</div>
      <div class="end">${esc(emEnd.bairro || "")} - ${esc(emEnd.cep || "")}</div>
      <div class="end">${esc(emEnd.cidade || "")} - ${esc(emEnd.uf || "")} Fone/Fax: ${esc(emEnd.telefone || emit.telefone || "")}</div>
      <div class="end">${esc(emit.email || "")}</div>
    </div>
    <div class="hdr-danfe">
      <h1>DANFE</h1>
      <div class="sub">Documento Auxiliar da Nota<br>Fiscal Eletrônica</div>
      <div class="tp-row">0 - ENTRADA</div>
      <div class="tp-row">1 - SAÍDA <div class="tp-box">1</div></div>
      <div class="nf-num">N°. ${esc(numFmt)}</div>
      <div class="nf-ser">Série ${String(nf.serie || "1").padStart(3,"0")}</div>
      <div class="nf-fol">Folha 1/1</div>
    </div>
    <div class="hdr-chave">
      <div class="bc" id="danfe-barcode"></div>
      <div class="lbl">CHAVE DE ACESSO</div>
      <div class="val">${esc(chaveFormatada || "-")}</div>
      <div class="cons">Consulta de autenticidade no portal nacional da NF-e<br><strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora</div>
    </div>
  </div>
  <!-- NAT. OPERAÇÃO + PROTOCOLO -->
  <div class="row">
    <div class="cell" style="flex:1"><label>NATUREZA DA OPERAÇÃO</label><div class="v-lg">VENDA DE MERCADORIA</div></div>
    <div class="cell" style="flex:1"><label>PROTOCOLO DE AUTORIZAÇÃO DE USO</label><div class="v">${esc(protFormatado)}</div></div>
  </div>
  <!-- IE EMITENTE -->
  <div class="row">
    <div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">${esc(emit.ie || "")}</div></div>
    <div class="cell"><label>INSCRIÇÃO MUNICIPAL</label><div class="v-sm"></div></div>
    <div class="cell"><label>INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</label><div class="v-sm"></div></div>
    <div class="cell"><label>CNPJ / CPF</label><div class="v">${esc(emit.cnpj || "")}</div></div>
  </div>
  <!-- DESTINATÁRIO -->
  <div class="stit">DESTINATÁRIO / REMETENTE</div>
  <div class="row">
    <div class="cell" style="flex:3"><label>NOME / RAZÃO SOCIAL</label><div class="v">${esc(destNome)}</div></div>
    <div class="cell"><label>CNPJ / CPF</label><div class="v-sm">${esc(dest.cnpj || "")}</div></div>
    <div class="cell"><label>DATA DA EMISSÃO</label><div class="v-sm">${dtParts[0] || "-"}</div></div>
  </div>
  <div class="row">
    <div class="cell" style="flex:3"><label>ENDEREÇO</label><div class="v">${esc(destEnd)}</div></div>
    <div class="cell"><label>BAIRRO / DISTRITO</label><div class="v-sm">${esc(dEnd.bairro || "")}</div></div>
    <div class="cell"><label>CEP</label><div class="v-sm">${esc(dEnd.cep || "")}</div></div>
    <div class="cell"><label>DATA DA SAÍDA/ENTRADA</label><div class="v-sm">${dtParts[0] || "-"}</div></div>
  </div>
  <div class="row">
    <div class="cell" style="flex:2"><label>MUNICÍPIO</label><div class="v">${esc(destCidade)}</div></div>
    <div class="cell" style="width:30px;flex:none;min-width:30px"><label>UF</label><div class="v-sm">${esc(dEnd.uf || "")}</div></div>
    <div class="cell"><label>FONE / FAX</label><div class="v-sm">${esc(dest.telefone || "")}</div></div>
    <div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">${esc(dest.ie || "")}</div></div>
    <div class="cell"><label>HORA DA SAÍDA/ENTRADA</label><div class="v-sm">${dtParts[1] || ""}</div></div>
  </div>
  <!-- CÁLCULO DO IMPOSTO -->
  <div class="stit">CÁLCULO DO IMPOSTO</div>
  <div class="row">
    <div class="cell"><label>BASE DE CALC. DO ICMS</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR DO ICMS</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>BASE DE CALC. ICMS S.T</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR DO ICMS SUBST</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. IMP. IMPORTAÇÃO</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. ICMS UF REMET.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. FCP UF DEST.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. TOTAL PRODUTOS</label><div class="v">${f2(totalProd)}</div></div>
  </div>
  <div class="row">
    <div class="cell"><label>VALOR DO FRETE</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR DO SEGURO</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>DESCONTO</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>OUTRAS DESPESAS</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>VALOR TOTAL IPI</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. ICMS UF DEST.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. TOT. TRIB.</label><div class="v-sm">0,00</div></div>
    <div class="cell"><label>V. TOTAL DA NOTA</label><div class="v">${f2(totalNota)}</div></div>
  </div>
  <!-- TRANSPORTADOR -->
  <div class="stit">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
  <div class="row">
    <div class="cell" style="flex:2"><label>NOME / RAZÃO SOCIAL</label><div class="v-sm"></div></div>
    <div class="cell"><label>FRETE</label><div class="v-sm">9-Sem Transporte</div></div>
    <div class="cell"><label>CÓDIGO ANTT</label><div class="v-sm"></div></div>
    <div class="cell"><label>PLACA DO VEÍCULO</label><div class="v-sm"></div></div>
    <div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div>
    <div class="cell"><label>CNPJ / CPF</label><div class="v-sm"></div></div>
  </div>
  <div class="row">
    <div class="cell" style="flex:2"><label>ENDEREÇO</label><div class="v-sm"></div></div>
    <div class="cell"><label>MUNICÍPIO</label><div class="v-sm"></div></div>
    <div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div>
    <div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm"></div></div>
  </div>
  <div class="row">
    <div class="cell"><label>QUANTIDADE</label><div class="v-sm"></div></div>
    <div class="cell"><label>ESPÉCIE</label><div class="v-sm"></div></div>
    <div class="cell"><label>MARCA</label><div class="v-sm"></div></div>
    <div class="cell"><label>NUMERAÇÃO</label><div class="v-sm"></div></div>
    <div class="cell"><label>PESO BRUTO</label><div class="v-sm"></div></div>
    <div class="cell"><label>PESO LÍQUIDO</label><div class="v-sm"></div></div>
  </div>
  <!-- PRODUTOS -->
  <div class="stit">DADOS DOS PRODUTOS / SERVIÇOS</div>
  <table class="it">
    <thead><tr>
      <th>CÓDIGO PRODUTO</th><th style="min-width:120px">DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>O/CSON</th><th>CFOP</th>
      <th>UN</th><th>QUANT.</th><th>VALOR UNIT.</th><th>VALOR TOTAL</th><th>DESC.</th>
      <th>B.CALC ICMS</th><th>VALOR ICMS</th><th>VALOR IPI</th><th>ALIQ ICMS</th><th>ALIQ IPI</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <!-- DADOS ADICIONAIS -->
  <div class="stit">DADOS ADICIONAIS</div>
  <div class="row" style="min-height:30px">
    <div class="cell" style="flex:2"><label>INFORMAÇÕES COMPLEMENTARES</label><div style="font-size:6.5pt;padding-top:1px">
      ${isCancelada ? '<strong style="color:red">NF-e CANCELADA</strong> em ' + esc(cancelStamp) + ' — ' + esc(nf.cancelamento?.retornoEvento?.xMotivo || "") + '<br>' : ""}
      <span style="white-space:pre-line">${esc(infCplTxt)}</span>
    </div></div>
    <div class="cell"><label>RESERVADO AO FISCO</label></div>
  </div>
</div>
</div>
<div style="font-size:6pt;margin-top:3px;color:#333">${esc(impressoEm)}</div>
<script>
(function(){
  const chave = "${chave}";
  if (!chave || chave.length < 10) return;
  const canvas = document.createElement("canvas");
  canvas.height = 40; canvas.width = Math.max(chave.length * 11, 400);
  const ctx = canvas.getContext("2d");
  const START_B = 104, STOP = 106;
  const P = [
    "11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000",
    "11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100",
    "11001001110","11011100100","11001110100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110",
    "11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000","11000101000","11000100010",
    "10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110","11000101110","11011101000",
    "11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010","11101111010","11001000010",
    "11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000",
    "10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010","10100111100","10010111100",
    "10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011110110","11110110110","21121141211"
  ];
  const e=[];e.push(P[START_B]);let cs=START_B;
  for(let i=0;i<chave.length;i++){const v=chave.charCodeAt(i)-32;e.push(P[v]);cs+=v*(i+1)}
  e.push(P[cs%103]);e.push(P[STOP]);const b=e.join("");
  const bw=Math.max(1,Math.floor(canvas.width/b.length));
  canvas.width=b.length*bw+20;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#000";for(let i=0;i<b.length;i++){if(b[i]==="1")ctx.fillRect(10+i*bw,2,bw,canvas.height-4)}
  const t=document.getElementById("danfe-barcode");if(t)t.appendChild(canvas);
  window.print();
})();
<\/script>
</body></html>`);
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
    body: JSON.stringify({ action: "nfe-sefaz-cancelar", nota: nf, motivo: justificativa })
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

  notasFiscais = notasFiscais.filter((item) => item.id !== notaId);
  saveNotasFiscais();

  const conta = getContaReceberByNota(notaId);
  if (conta) {
    contasReceber = contasReceber.filter((item) => item.id !== conta.id);
    saveContasReceber();
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
  const conta = contasReceber.find((item) => item.id === contaId) || null;
  const email = (nf.cliente?.email || "").trim();
  const supplierEmail = "edsonlariucci.comercial@gmail.com";
  const recipients = [email, supplierEmail].filter(e => e && e.includes("@"));
  if (recipients.length === 0) {
    updateNotaFiscalIntegration(notaId, "comunicacao", { status: "email_sem_destino", lastAction: options.manual ? "compartilhar_email" : "disparo_automatico_email" });
    return false;
  }
  const totalProd = (nf.itens || []).reduce((s, i) => s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)), 0);
  // Gerar PDF do DANFE
  let danfePdfBase64 = "";
  try {
    if (typeof html2pdf !== "undefined") {
      danfePdfBase64 = await gerarDanfePdfBase64(nf);
      console.log("[Email NF] PDF gerado:", danfePdfBase64.length, "bytes base64");
    }
  } catch (pdfErr) {
    console.warn("[Email NF] Falha ao gerar PDF, enviando sem anexo:", pdfErr.message);
  }
  const emailPayload = {
    schoolName: nf.cliente?.nome || "",
    protocol: nf.pedidoId || nf.numero || nf.id,
    date: nf.emitidaEm ? formatDateTimeLocal(nf.emitidaEm) : "",
    total: nf.valor || totalProd,
    items: (nf.itens || []).map((item) => ({ name: item.descricao || "", description: item.descricao || "", qty: item.qtd || 0, unitPrice: item.precoUnitario || 0 })),
    obs: nf.documentos?.observacao || (conta ? `Cobranca ${conta.forma || "boleto"} vinculada` : "Nota fiscal emitida"),
    cnpj: nf.cliente?.cnpj || "",
    responsible: nf.cliente?.responsavel || "",
    nfe: {
      numero: nf.numero || "",
      serie: nf.serie || "1",
      protocolo: nf.sefaz?.protocolo || "",
      valor: nf.valor || totalProd,
      chaveAcesso: nf.sefaz?.chaveAcesso || "",
      danfePdf: danfePdfBase64
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
          console.log("[Email NF] OK para:", addr, "ID:", data.id || "-");
        } else {
          console.warn("[Email NF] Falha para", addr, ":", data.error || resp.status);
        }
      } catch (singleErr) {
        console.warn("[Email NF] Erro para", addr, ":", singleErr.message);
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
    console.log("[Email NF] Enviado:", successCount + "/" + recipients.length);
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
  const pages = items.map((nf, i) => (i > 0 ? '<div style="page-break-before:always"></div>' : '') + gerarDanfeHtml(nf)).join('');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><title>DANFEs</title><style>body{font-family:Arial,sans-serif;margin:1cm;color:#000}@media print{body{margin:5mm}}</style></head><body>' + pages + '</body></html>');
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 5000);
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