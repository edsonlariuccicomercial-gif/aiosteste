// ===== SGD STATE =====
let sgdAvailable = false;
let sgdLocalServer = false; // true = Express server available, false = direct API mode
const SGD_API = "https://api.caixaescolar.educacao.mg.gov.br";
const SGD_CRED_KEY = "caixaescolar.sgd.credentials";

// ===== BROWSER SGD CLIENT (via Netlify Function proxy) =====
// Proxy unificado: /api/caixa-proxy no Vercel e local, /.netlify/functions/sgd-proxy no Netlify
const PROXY_URL = location.hostname.includes("netlify") ? "/.netlify/functions/sgd-proxy" : "/api/caixa-proxy";
const BrowserSgdClient = {
  cookie: null,
  networkId: null,

  getCredentials() {
    const saved = localStorage.getItem(SGD_CRED_KEY);
    if (saved) return JSON.parse(saved);
    return null;
  },

  promptCredentials() {
    // Try to get CNPJ from empresa config first
    let cnpj = '';
    try {
      const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
      cnpj = (empresa.cnpj || '').replace(/\D/g, '');
    } catch(_) {}
    if (!cnpj) {
      cnpj = prompt("CNPJ do fornecedor (somente numeros):");
      if (!cnpj) return null;
    }
    const pass = prompt("Senha SGD (fornecedor " + cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') + "):");
    if (!pass) return null;
    const cred = { cnpj: cnpj.replace(/\D/g, ""), pass };
    localStorage.setItem(SGD_CRED_KEY, JSON.stringify(cred));
    return cred;
  },

  async proxy(body) {
    const r = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Proxy error (${r.status})`);
    return data;
  },

  async login() {
    const cred = this.getCredentials() || this.promptCredentials();
    if (!cred) throw new Error("Credenciais SGD nao informadas.");
    const result = await this.proxy({ action: "login", cnpj: cred.cnpj, password: cred.pass || cred.password });
    if (!result.cookie) {
      localStorage.removeItem(SGD_CRED_KEY);
      throw new Error("Login SGD falhou.");
    }
    this.cookie = result.cookie;
    return true;
  },

  async ensureAuth() {
    if (!this.cookie) await this.login();
  },

  async getUser() {
    await this.ensureAuth();
    const user = await this.proxy({ action: "get-user", cookie: this.cookie });
    if (user.idNetwork) this.networkId = user.idNetwork;
    if (user.networks && user.networks.length > 0) {
      this.networkId = user.networks[0].idNetwork || user.networks[0].id;
    }
    return user;
  },

  async listBudgets(page = 1, limit = 50, supplierStatus = null) {
    await this.ensureAuth();
    const payload = { action: "list-budgets", cookie: this.cookie, networkId: this.networkId, page, limit };
    if (supplierStatus) payload.supplierStatus = supplierStatus;
    const data = await this.proxy(payload);
    if (!this.networkId && data.data && data.data[0]) this.networkId = data.data[0].idNetwork;
    return data;
  },

  async getBudgetDetail(idSub, idSchool, idBudget) {
    await this.ensureAuth();
    return this.proxy({ action: "budget-detail", cookie: this.cookie, networkId: this.networkId, idSubprogram: idSub, idSchool, idBudget });
  },

  async getBudgetItems(idSub, idSchool, idBudget) {
    await this.ensureAuth();
    return this.proxy({ action: "budget-items", cookie: this.cookie, networkId: this.networkId, idSubprogram: idSub, idSchool, idBudget });
  },

  async sendProposal(idSub, idSchool, idBudget, payload) {
    await this.ensureAuth();
    return this.proxy({ action: "send-proposal", cookie: this.cookie, networkId: this.networkId, idSubprogram: idSub, idSchool, idBudget, payload });
  },
};
