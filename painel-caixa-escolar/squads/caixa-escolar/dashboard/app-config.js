// ===== MODULE NAVIGATION =====
const MODULE_STORAGE_KEY = "nexedu.activeModule";
const EMPRESA_STORAGE_KEY = "nexedu.empresa";
const USUARIOS_STORAGE_KEY = "nexedu.usuarios";
const NF_CONFIG_STORAGE_KEY = "nexedu.config.notas-fiscais";
const BANK_ACCOUNTS_STORAGE_KEY = "nexedu.config.contas-bancarias";
const BANK_API_CONFIG_STORAGE_KEY = "nexedu.config.bank-api";
const BANK_API_SECRET_FIELDS = [
  {
    inputId: "bank-api-client-secret",
    markerKey: "clientSecretConfigured",
    label: "Client Secret",
    placeholder: "Segredo mantido no servidor"
  },
  {
    inputId: "bank-api-key",
    markerKey: "apiKeyConfigured",
    label: "API Key / Token",
    placeholder: "Token mantido no servidor"
  },
  {
    inputId: "bank-api-webhook-secret",
    markerKey: "webhookSecretConfigured",
    label: "Webhook Secret",
    placeholder: "Chave mantida no servidor"
  }
];
let editingBankAccountId = null;

window.switchModule = function switchModule(moduleId) {
  // GDP navigates away
  if (moduleId === "gdp") {
    window.location.href = "gdp-contratos.html";
    return;
  }

  // Update sidebar active state
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.module === moduleId);
  });

  // Hide all tab-content sections
  document.querySelectorAll(".tab-content").forEach((tc) => {
    tc.classList.remove("active");
  });

  const tabsIntel = document.getElementById("tabs-intel-precos");

  if (moduleId === "radar") {
    // Show orçamentos directly, hide horizontal tabs
    if (tabsIntel) tabsIntel.style.display = "none";
    const radarDash = document.getElementById("radar-dashboard");
    if (radarDash) radarDash.style.display = "";
    const ipDash = document.getElementById("intel-precos-dashboard");
    if (ipDash) ipDash.style.display = "none";
    document.getElementById("tab-orcamentos").classList.add("active");
  } else if (moduleId === "intel-precos") {
    // Show horizontal tabs for Intel. Preços, hide radar dashboard
    if (tabsIntel) tabsIntel.style.display = "flex";
    const radarDash = document.getElementById("radar-dashboard");
    if (radarDash) radarDash.style.display = "none";
    const ipDash = document.getElementById("intel-precos-dashboard");
    if (ipDash) ipDash.style.display = "";
    // Activate first tab by default
    const activeSub = tabsIntel.querySelector(".tab.active");
    const tabId = activeSub ? activeSub.dataset.tab : "pre-orcamento";
    switchTab(tabId);
  } else if (moduleId === "config") {
    if (tabsIntel) tabsIntel.style.display = "none";
    const radarDash = document.getElementById("radar-dashboard");
    if (radarDash) radarDash.style.display = "none";
    const ipDash = document.getElementById("intel-precos-dashboard");
    if (ipDash) ipDash.style.display = "none";
    document.getElementById("config-panel").classList.add("active");
    loadConfigData();
  }

  // Persist
  localStorage.setItem(MODULE_STORAGE_KEY, moduleId);

  // Close mobile sidebar
  closeSidebar();
};

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("active");
}

// ===== CONFIG PANEL =====
function loadConfigData() {
  try {
    const data = JSON.parse(localStorage.getItem(EMPRESA_STORAGE_KEY) || "{}");
    const cfgNome = document.getElementById("cfg-nome");
    const cfgRazaoSocial = document.getElementById("cfg-razao-social");
    const cfgCnpj = document.getElementById("cfg-cnpj");
    const cfgLogradouro = document.getElementById("cfg-logradouro");
    const cfgNumero = document.getElementById("cfg-numero");
    const cfgBairro = document.getElementById("cfg-bairro");
    const cfgCidade = document.getElementById("cfg-cidade");
    const cfgUf = document.getElementById("cfg-uf");
    const cfgCep = document.getElementById("cfg-cep");
    const cfgTelefone = document.getElementById("cfg-telefone");
    const cfgEmail = document.getElementById("cfg-email");
    if (cfgNome) cfgNome.value = data.nome || "";
    if (cfgRazaoSocial) cfgRazaoSocial.value = data.razaoSocial || "";
    if (cfgCnpj) cfgCnpj.value = data.cnpj || "";
    if (cfgLogradouro) cfgLogradouro.value = data.logradouro || "";
    if (cfgNumero) cfgNumero.value = data.numero || "";
    if (cfgBairro) cfgBairro.value = data.bairro || "";
    if (cfgCidade) cfgCidade.value = data.cidade || "";
    if (cfgUf) cfgUf.value = data.uf || "";
    if (cfgCep) cfgCep.value = data.cep || "";
    if (cfgTelefone) cfgTelefone.value = data.telefone || "";
    if (cfgEmail) cfgEmail.value = data.email || "";
  } catch (_) { /* ignore */ }
  renderUsuarios();
  loadNotaFiscalConfig();
  renderBankAccounts();
  refreshContaBancariaOptions();
  refreshBankApiContaOptions();
  loadBankApiConfig();
}

function saveConfigEmpresa() {
  const data = {
    nome: (document.getElementById("cfg-nome") || {}).value || "",
    razaoSocial: (document.getElementById("cfg-razao-social") || {}).value || "",
    cnpj: (document.getElementById("cfg-cnpj") || {}).value || "",
    logradouro: (document.getElementById("cfg-logradouro") || {}).value || "",
    numero: (document.getElementById("cfg-numero") || {}).value || "",
    bairro: (document.getElementById("cfg-bairro") || {}).value || "",
    cidade: (document.getElementById("cfg-cidade") || {}).value || "",
    uf: (document.getElementById("cfg-uf") || {}).value || "",
    cep: (document.getElementById("cfg-cep") || {}).value || "",
    telefone: (document.getElementById("cfg-telefone") || {}).value || "",
    email: (document.getElementById("cfg-email") || {}).value || "",
  };
  localStorage.setItem(EMPRESA_STORAGE_KEY, JSON.stringify(data));
  schedulCloudSync();

  // Update topbar pills with saved data
  const pillSre = document.getElementById("pill-sre");
  const pillFornecedor = document.getElementById("pill-fornecedor");
  if (data.cidade && data.uf && pillSre) pillSre.textContent = data.cidade + "-" + data.uf;
  if (data.nome && pillFornecedor) pillFornecedor.textContent = data.nome;

  if (typeof showToast === "function") showToast("Dados da empresa salvos!");
}

function renderUsuarios() {
  const tbody = document.getElementById("tbody-usuarios");
  const emptyMsg = document.getElementById("usuarios-empty");
  if (!tbody) return;

  const usuarios = JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || "[]");
  tbody.innerHTML = "";

  if (usuarios.length === 0) {
    if (emptyMsg) emptyMsg.style.display = "block";
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  usuarios.forEach((u, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nome || ""}</td>
      <td>${u.email || ""}</td>
      <td>${u.usuario || ""}</td>
      <td>${u.perfil || "Operador"}</td>
      <td><span class="badge badge-${u.ativo !== false ? "aprovado" : "vencido"}">${u.ativo !== false ? "Ativo" : "Inativo"}</span></td>
      <td><button class="btn btn-inline btn-danger" onclick="removeUsuario(${idx})">Remover</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.addUsuario = function addUsuario() {
  const nome = (document.getElementById("usr-nome") || {}).value || "";
  const email = (document.getElementById("usr-email") || {}).value || "";
  const usuario = (document.getElementById("usr-usuario") || {}).value || "";
  const senha = (document.getElementById("usr-senha") || {}).value || "";
  const perfil = (document.getElementById("usr-perfil") || {}).value || "Operador";

  if (!nome || !usuario || !senha) {
    alert("Preencha pelo menos Nome, Usuário e Senha.");
    return;
  }

  const usuarios = JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || "[]");
  usuarios.push({ nome, email, usuario, senha: btoa(senha), perfil, ativo: true });
  localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuarios));
  renderUsuarios();

  // Clear form
  ["usr-nome", "usr-email", "usr-usuario", "usr-senha"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const selPerfil = document.getElementById("usr-perfil");
  if (selPerfil) selPerfil.value = "Operador";
};

window.removeUsuario = function removeUsuario(idx) {
  const usuarios = JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || "[]");
  if (idx >= 0 && idx < usuarios.length) {
    usuarios.splice(idx, 1);
    localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuarios));
    renderUsuarios();
  }
};

function getNotaFiscalConfig() {
  try {
    return JSON.parse(localStorage.getItem(NF_CONFIG_STORAGE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function getBankAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function setBankAccounts(accounts) {
  localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function readBankApiConfigRaw() {
  try {
    return JSON.parse(localStorage.getItem(BANK_API_CONFIG_STORAGE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function normalizeBankApiConfig(raw = {}) {
  return {
    provider: raw.provider || "",
    ambiente: raw.ambiente || "sandbox",
    baseUrl: raw.baseUrl || "",
    clientId: raw.clientId || "",
    webhookUrl: raw.webhookUrl || "",
    carteira: raw.carteira || "",
    contaId: raw.contaId || "",
    ativo: Boolean(raw.ativo),
    boleto: raw.boleto !== false,
    pix: Boolean(raw.pix),
    conciliacao: Boolean(raw.conciliacao),
    clientSecretConfigured: Boolean(raw.clientSecretConfigured || raw.secretPresence?.clientSecret || raw.clientSecret),
    apiKeyConfigured: Boolean(raw.apiKeyConfigured || raw.secretPresence?.apiKey || raw.apiKey),
    webhookSecretConfigured: Boolean(raw.webhookSecretConfigured || raw.secretPresence?.webhookSecret || raw.webhookSecret),
    updatedAt: raw.updatedAt || raw.updated_at || ""
  };
}

function getBankApiConfig() {
  const raw = readBankApiConfigRaw();
  const normalized = normalizeBankApiConfig(raw);
  if (Object.keys(raw).length > 0 && JSON.stringify(raw) !== JSON.stringify(normalized)) {
    localStorage.setItem(BANK_API_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function collectBankApiConfigFromForm({ includeSecrets = true } = {}) {
  const current = getBankApiConfig();
  const clientSecret = document.getElementById("bank-api-client-secret")?.value.trim() || "";
  const apiKey = document.getElementById("bank-api-key")?.value.trim() || "";
  const webhookSecret = document.getElementById("bank-api-webhook-secret")?.value.trim() || "";
  const config = {
    provider: document.getElementById("bank-api-provider")?.value || "",
    ambiente: document.getElementById("bank-api-ambiente")?.value || "sandbox",
    baseUrl: document.getElementById("bank-api-base-url")?.value.trim() || "",
    clientId: document.getElementById("bank-api-client-id")?.value.trim() || "",
    webhookUrl: document.getElementById("bank-api-webhook-url")?.value.trim() || "",
    carteira: document.getElementById("bank-api-carteira")?.value.trim() || "",
    contaId: document.getElementById("bank-api-conta-id")?.value || "",
    ativo: Boolean(document.getElementById("bank-api-ativo")?.checked),
    boleto: Boolean(document.getElementById("bank-api-boleto")?.checked),
    pix: Boolean(document.getElementById("bank-api-pix")?.checked),
    conciliacao: Boolean(document.getElementById("bank-api-conciliacao")?.checked),
    clientSecretConfigured: Boolean(clientSecret) || Boolean(current.clientSecretConfigured),
    apiKeyConfigured: Boolean(apiKey) || Boolean(current.apiKeyConfigured),
    webhookSecretConfigured: Boolean(webhookSecret) || Boolean(current.webhookSecretConfigured)
  };

  if (includeSecrets) {
    config.clientSecret = clientSecret;
    config.apiKey = apiKey;
    config.webhookSecret = webhookSecret;
  }

  return config;
}

function describeBankApiSecretPresence(config = {}) {
  const configured = BANK_API_SECRET_FIELDS
    .filter((field) => Boolean(config[field.markerKey]))
    .map((field) => field.label);
  if (configured.length === 0) {
    return "Nenhum segredo esta marcado como configurado no servidor.";
  }
  return `Segredos marcados no servidor: ${configured.join(", ")}.`;
}

function syncBankApiSecretInputs(config = {}, { clearValues = true } = {}) {
  BANK_API_SECRET_FIELDS.forEach(({ inputId, markerKey, label, placeholder }) => {
    const node = document.getElementById(inputId);
    if (!node) return;
    if (clearValues) node.value = "";
    node.placeholder = config[markerKey] ? `${label} configurado no servidor` : placeholder;
    node.title = config[markerKey]
      ? `${label} nao e salvo neste navegador.`
      : `${label} deve ser informado apenas para testes e provisionamento no servidor.`;
  });
}

function renderBankApiStatus(message, tone = "") {
  const box = document.getElementById("bank-api-status");
  if (!box) return;
  box.textContent = message || "";
  box.classList.remove("is-success", "is-warning", "is-error", "is-info");
  if (tone) box.classList.add(tone);
}

function loadNotaFiscalConfig() {
  const config = getNotaFiscalConfig();
  const setValue = (id, value, fallback = "") => {
    const node = document.getElementById(id);
    if (node) node.value = value ?? fallback;
  };
  const setChecked = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.checked = Boolean(value);
  };

  setValue("nf-ambiente", config.ambiente || "homologacao");
  setValue("nf-serie", config.serie || "");
  setValue("nf-proximo-numero", config.proximoNumero || "");
  setValue("nf-natureza-operacao", config.naturezaOperacao || "");
  setValue("nf-cfop", config.cfop || "");
  setValue("nf-regime", config.regime || "simples");
  setValue("nf-prazo-emissao", config.prazoEmissaoHoras || "");
  setValue("nf-observacoes", config.observacoes || "");
  setValue("nf-conta-bancaria-padrao", config.contaBancariaPadraoId || "");
  setChecked("nf-destacar-pix", config.destacarPix);
  setChecked("nf-gerar-conta-receber", config.gerarContaReceber !== false);
  setChecked("nf-bloquear-sem-estoque", config.bloquearSemEstoque);
}

function saveNotaFiscalConfig() {
  const config = {
    ambiente: document.getElementById("nf-ambiente")?.value || "homologacao",
    serie: document.getElementById("nf-serie")?.value || "",
    proximoNumero: document.getElementById("nf-proximo-numero")?.value || "",
    naturezaOperacao: document.getElementById("nf-natureza-operacao")?.value || "",
    cfop: document.getElementById("nf-cfop")?.value || "",
    regime: document.getElementById("nf-regime")?.value || "simples",
    prazoEmissaoHoras: document.getElementById("nf-prazo-emissao")?.value || "",
    observacoes: document.getElementById("nf-observacoes")?.value || "",
    contaBancariaPadraoId: document.getElementById("nf-conta-bancaria-padrao")?.value || "",
    destacarPix: Boolean(document.getElementById("nf-destacar-pix")?.checked),
    gerarContaReceber: Boolean(document.getElementById("nf-gerar-conta-receber")?.checked),
    bloquearSemEstoque: Boolean(document.getElementById("nf-bloquear-sem-estoque")?.checked),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(NF_CONFIG_STORAGE_KEY, JSON.stringify(config));
  if (typeof showToast === "function") showToast("Configuracoes fiscais salvas.");
}

function buildObservacaoBancaria(contrato) {
  const contaId = getNotaFiscalConfig().contaBancariaPadraoId;
  const accounts = getBankAccounts();
  const conta = (contaId && accounts.find(a => a.id === contaId)) || accounts.find(a => a.padrao) || accounts[0];
  if (!conta) return "";
  const parts = [];
  parts.push("DADOS PARA PAGAMENTO:");
  if (conta.titular) parts.push("Titular: " + conta.titular);
  if (conta.documento) parts.push("CNPJ/CPF: " + conta.documento);
  if (conta.banco) parts.push("Banco: " + conta.banco + (conta.codigo ? " (" + conta.codigo + ")" : ""));
  if (conta.agencia) parts.push("Agencia: " + conta.agencia);
  if (conta.conta) parts.push("Conta: " + conta.conta + (conta.tipo ? " (" + conta.tipo + ")" : ""));
  if (conta.pix) parts.push("Chave PIX: " + conta.pix);
  return parts.join("\n");
}

function autoPreencherObservacaoNF() {
  const textarea = document.getElementById("nf-observacoes");
  if (!textarea) return;
  const obs = buildObservacaoBancaria();
  if (!obs) {
    if (typeof showToast === "function") showToast("Cadastre uma conta bancaria primeiro.", 3000);
    return;
  }
  textarea.value = obs;
  if (typeof showToast === "function") showToast("Observacao preenchida com dados bancarios e PIX.");
}

function refreshContaBancariaOptions() {
  const select = document.getElementById("nf-conta-bancaria-padrao");
  if (!select) return;
  const current = getNotaFiscalConfig().contaBancariaPadraoId || "";
  const accounts = getBankAccounts();
  select.innerHTML = ['<option value="">Selecione...</option>']
    .concat(accounts.map((account) => {
      const name = [account.apelido, account.banco].filter(Boolean).join(" - ");
      return `<option value="${account.id}">${name || "Conta sem nome"}</option>`;
    }))
    .join("");
  select.value = accounts.some((account) => account.id === current) ? current : "";
}

function refreshBankApiContaOptions() {
  const select = document.getElementById("bank-api-conta-id");
  if (!select) return;
  const current = getBankApiConfig().contaId || "";
  const accounts = getBankAccounts();
  select.innerHTML = ['<option value="">Selecione...</option>']
    .concat(accounts.map((account) => {
      const name = [account.apelido, account.banco].filter(Boolean).join(" - ");
      return `<option value="${account.id}">${name || "Conta sem nome"}</option>`;
    }))
    .join("");
  select.value = accounts.some((account) => account.id === current) ? current : "";
}

function loadBankApiConfig() {
  const config = getBankApiConfig();
  const setValue = (id, value, fallback = "") => {
    const node = document.getElementById(id);
    if (node) node.value = value ?? fallback;
  };
  const setChecked = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.checked = Boolean(value);
  };

  setValue("bank-api-provider", config.provider || "");
  setValue("bank-api-ambiente", config.ambiente || "sandbox");
  setValue("bank-api-base-url", config.baseUrl || "");
  setValue("bank-api-client-id", config.clientId || "");
  setValue("bank-api-webhook-url", config.webhookUrl || "");
  setValue("bank-api-carteira", config.carteira || "");
  setValue("bank-api-conta-id", config.contaId || "");
  setChecked("bank-api-ativo", config.ativo);
  setChecked("bank-api-boleto", config.boleto !== false);
  setChecked("bank-api-pix", config.pix);
  setChecked("bank-api-conciliacao", config.conciliacao);
  syncBankApiSecretInputs(config);
  renderBankApiStatus(
    `Configuracao carregada. ${describeBankApiSecretPresence(config)} Os segredos reais do provider devem ficar no servidor, nao no navegador.`,
    "is-info"
  );
}

function saveBankApiConfig() {
  const current = getBankApiConfig();
  const config = {
    ...current,
    ...collectBankApiConfigFromForm({ includeSecrets: false }),
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(BANK_API_CONFIG_STORAGE_KEY, JSON.stringify(normalizeBankApiConfig(config)));
  syncBankApiSecretInputs(config, { clearValues: false });
  renderBankApiStatus(
    `Configuracao salva sem segredos no navegador. ${describeBankApiSecretPresence(config)} Os segredos reais do provider devem ficar no servidor.`,
    "is-info"
  );
  if (typeof showToast === "function") showToast("Configuracao de API bancaria salva.");
}

async function testBankApiConfig() {
  const config = collectBankApiConfigFromForm();
  const hasAuth = Boolean(config.apiKey || (config.clientId && config.clientSecret));
  renderBankApiStatus(
    hasAuth
      ? `Testando conexao com as credenciais digitadas agora. ${describeBankApiSecretPresence(config)}`
      : `Testando apenas a estrutura da integracao. ${describeBankApiSecretPresence(config)} Os segredos do provider precisam ser informados no servidor para um teste completo.`,
    "is-warning"
  );

  try {
    const resp = await fetch("/api/gdp-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bank-api-diagnose",
        config
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const diagnostic = data.diagnostic || {};
    const probe = diagnostic.probe || {};
    const readyLabel = diagnostic.ready ? "pronta" : "parcial";
    const probeLabel = probe.attempted
      ? (probe.reachable ? `Endpoint acessivel (HTTP ${probe.status || "ok"})` : `Endpoint nao validado (${probe.error || "sem resposta"})`)
      : "Sem teste remoto do endpoint";
    const summary = [
      `Integracao ${readyLabel}.`,
      diagnostic.provider ? `Provider: ${diagnostic.provider}.` : "",
      diagnostic.baseUrl ? `Base URL: ${diagnostic.baseUrl}.` : "",
      probeLabel + ".",
      diagnostic.nextSteps?.[0] ? `Proximo passo: ${diagnostic.nextSteps[0]}.` : "",
      diagnostic.nextSteps?.[1] ? `Seguranca: ${diagnostic.nextSteps[1]}.` : ""
    ].filter(Boolean).join(" ");

    renderBankApiStatus(summary, diagnostic.ready ? "is-success" : "is-warning");
    if (typeof showToast === "function") showToast(diagnostic.ready ? "API bancaria validada." : "API bancaria validada com pendencias.");
  } catch (err) {
    renderBankApiStatus(`Falha ao testar API bancaria: ${err.message}`, "is-error");
    if (typeof showToast === "function") showToast(`Falha no teste da API bancaria: ${err.message}`, 5000);
  }
}

async function provisionBankWebhook() {
  const config = collectBankApiConfigFromForm();
  renderBankApiStatus("Provisionando webhook bancario no provider...", "is-warning");

  try {
    const resp = await fetch("/api/gdp-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bank-webhook-sync",
        provider: config.provider || "asaas",
        ambiente: config.ambiente || "sandbox",
        config
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const webhook = data.webhook || {};
    const actionLabel = data.provisioned ? "Webhook provisionado" : "Webhook ja existente";
    const eventsLabel = Array.isArray(data.requiredEvents) ? data.requiredEvents.join(", ") : "";
    const summary = [
      `${actionLabel} para ${String(data.provider || "").toUpperCase()}.`,
      data.webhookUrl ? `URL: ${data.webhookUrl}.` : "",
      webhook.id ? `ID: ${webhook.id}.` : "",
      eventsLabel ? `Eventos: ${eventsLabel}.` : "",
      data.authTokenConfigured ? "Token de autenticacao configurado no servidor." : "Sem token de autenticacao configurado no servidor."
    ].filter(Boolean).join(" ");

    renderBankApiStatus(summary, "is-success");
    if (typeof showToast === "function") showToast(data.provisioned ? "Webhook bancario provisionado." : "Webhook bancario ja configurado.");
  } catch (err) {
    renderBankApiStatus(`Falha ao provisionar webhook bancario: ${err.message}`, "is-error");
    if (typeof showToast === "function") showToast(`Falha no webhook bancario: ${err.message}`, 5000);
  }
}

function clearBankAccountForm() {
  editingBankAccountId = null;
  [
    "bank-apelido",
    "bank-banco",
    "bank-codigo",
    "bank-agencia",
    "bank-conta",
    "bank-titular",
    "bank-documento",
    "bank-pix"
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.value = "";
  });
  const tipo = document.getElementById("bank-tipo");
  if (tipo) tipo.value = "corrente";
  const uso = document.getElementById("bank-uso");
  if (uso) uso.value = "cobranca";
  const padrao = document.getElementById("bank-padrao");
  if (padrao) padrao.checked = false;
  const ativa = document.getElementById("bank-ativa");
  if (ativa) ativa.checked = true;
}

function saveBankAccount() {
  const apelido = document.getElementById("bank-apelido")?.value.trim() || "";
  const banco = document.getElementById("bank-banco")?.value.trim() || "";
  const conta = document.getElementById("bank-conta")?.value.trim() || "";
  if (!apelido || !banco || !conta) {
    alert("Preencha pelo menos apelido, banco e conta.");
    return;
  }

  const accounts = getBankAccounts();
  const next = {
    id: editingBankAccountId || `bank_${Date.now()}`,
    apelido,
    banco,
    codigo: document.getElementById("bank-codigo")?.value.trim() || "",
    agencia: document.getElementById("bank-agencia")?.value.trim() || "",
    conta,
    tipo: document.getElementById("bank-tipo")?.value || "corrente",
    titular: document.getElementById("bank-titular")?.value.trim() || "",
    documento: document.getElementById("bank-documento")?.value.trim() || "",
    pix: document.getElementById("bank-pix")?.value.trim() || "",
    uso: document.getElementById("bank-uso")?.value || "cobranca",
    padrao: Boolean(document.getElementById("bank-padrao")?.checked),
    ativa: Boolean(document.getElementById("bank-ativa")?.checked),
    updatedAt: new Date().toISOString()
  };

  const updated = accounts
    .filter((account) => account.id !== next.id)
    .map((account) => (next.padrao ? { ...account, padrao: false } : account));
  updated.push(next);
  setBankAccounts(updated);

  if (next.padrao) {
    const nfConfig = getNotaFiscalConfig();
    localStorage.setItem(NF_CONFIG_STORAGE_KEY, JSON.stringify({
      ...nfConfig,
      contaBancariaPadraoId: next.id,
      updatedAt: new Date().toISOString()
    }));
  }

  clearBankAccountForm();
  renderBankAccounts();
  refreshContaBancariaOptions();
  refreshBankApiContaOptions();
  loadNotaFiscalConfig();
  if (typeof showToast === "function") showToast("Conta bancaria salva.");
}

function renderBankAccounts() {
  const list = document.getElementById("bank-accounts-list");
  const empty = document.getElementById("bank-accounts-empty");
  const badge = document.getElementById("bank-count-badge");
  if (!list || !empty || !badge) return;

  const accounts = getBankAccounts();
  badge.textContent = `${accounts.length} conta${accounts.length === 1 ? "" : "s"}`;
  list.innerHTML = "";

  if (!accounts.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  accounts
    .sort((a, b) => Number(b.padrao) - Number(a.padrao))
    .forEach((account) => {
      const card = document.createElement("article");
      card.className = "config-account-card";
      card.innerHTML = `
        <div class="config-account-main">
          <div>
            <strong>${account.apelido || "Conta sem nome"}</strong>
            <p>${account.banco || "-"}${account.codigo ? ` (${account.codigo})` : ""}</p>
          </div>
          <div class="config-account-badges">
            ${account.padrao ? '<span class="badge badge-aprovado">Padrao</span>' : ""}
            <span class="badge ${account.ativa ? "badge-processando" : "badge-vencido"}">${account.ativa ? "Ativa" : "Inativa"}</span>
          </div>
        </div>
        <div class="config-account-meta">
          <span>Agencia: ${account.agencia || "-"}</span>
          <span>Conta: ${account.conta || "-"}</span>
          <span>Uso: ${account.uso || "-"}</span>
          <span>PIX: ${account.pix || "-"}</span>
        </div>
        <div class="config-account-actions">
          <button class="btn btn-sm" onclick="editBankAccount('${account.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="removeBankAccount('${account.id}')">Excluir</button>
        </div>
      `;
      list.appendChild(card);
    });
}

window.editBankAccount = function editBankAccount(id) {
  const account = getBankAccounts().find((item) => item.id === id);
  if (!account) return;
  editingBankAccountId = id;
  const setValue = (fieldId, value, fallback = "") => {
    const node = document.getElementById(fieldId);
    if (node) node.value = value ?? fallback;
  };
  setValue("bank-apelido", account.apelido);
  setValue("bank-banco", account.banco);
  setValue("bank-codigo", account.codigo);
  setValue("bank-agencia", account.agencia);
  setValue("bank-conta", account.conta);
  setValue("bank-tipo", account.tipo, "corrente");
  setValue("bank-titular", account.titular);
  setValue("bank-documento", account.documento);
  setValue("bank-pix", account.pix);
  setValue("bank-uso", account.uso, "cobranca");
  const padrao = document.getElementById("bank-padrao");
  if (padrao) padrao.checked = Boolean(account.padrao);
  const ativa = document.getElementById("bank-ativa");
  if (ativa) ativa.checked = Boolean(account.ativa);
};

window.removeBankAccount = function removeBankAccount(id) {
  const filtered = getBankAccounts().filter((item) => item.id !== id);
  setBankAccounts(filtered);

  const nfConfig = getNotaFiscalConfig();
  if (nfConfig.contaBancariaPadraoId === id) {
    localStorage.setItem(NF_CONFIG_STORAGE_KEY, JSON.stringify({
      ...nfConfig,
      contaBancariaPadraoId: "",
      updatedAt: new Date().toISOString()
    }));
  }

  if (editingBankAccountId === id) clearBankAccountForm();
  const bankApiConfig = getBankApiConfig();
  if (bankApiConfig.contaId === id) {
    localStorage.setItem(BANK_API_CONFIG_STORAGE_KEY, JSON.stringify({
      ...bankApiConfig,
      contaId: "",
      updatedAt: new Date().toISOString()
    }));
  }
  renderBankAccounts();
  refreshContaBancariaOptions();
  refreshBankApiContaOptions();
  loadNotaFiscalConfig();
  loadBankApiConfig();
};
