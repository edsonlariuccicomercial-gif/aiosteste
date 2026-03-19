/* ===================================================================
   SgdClient — REST API client for SGD Caixa Escolar MG
   Auth via session cookie (Set-Cookie: sessionToken=...)
   =================================================================== */

const BASE_URL = "https://api.caixaescolar.educacao.mg.gov.br";

class SgdClient {
  constructor(cnpj, password) {
    this.cnpj = cnpj;
    this.password = password;
    this.cookie = null;
    this.cookieExpiry = 0;
    this.networkId = null;
  }

  // ===== AUTH =====

  async login() {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txCpfCnpj: this.cnpj,
        txPassword: this.password,
      }),
      redirect: "manual",
    });

    if (res.status !== 200 && res.status !== 201) {
      const text = await res.text().catch(() => "");
      throw new Error(`SGD login failed (${res.status}): ${text}`);
    }

    // Extract sessionToken from Set-Cookie header
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/sessionToken=([^;]+)/);
    if (!match) {
      throw new Error("SGD login: no sessionToken cookie in response");
    }

    this.cookie = `sessionToken=${match[1]}`;
    // Cookie valid for 24h, refresh at 23h
    this.cookieExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return this.cookie;
  }

  async ensureAuth() {
    if (!this.cookie || Date.now() > this.cookieExpiry) {
      await this.login();
    }
  }

  headers() {
    const h = {
      "Content-Type": "application/json",
      Cookie: this.cookie,
    };
    if (this.networkId) {
      h["x-network-being-managed-id"] = String(this.networkId);
    }
    return h;
  }

  // ===== USER =====

  async getUser() {
    await this.ensureAuth();
    const res = await fetch(`${BASE_URL}/auth/user`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`SGD getUser failed (${res.status})`);
    const user = await res.json();
    // Extract networkId from user profile if available
    if (user.idNetwork) this.networkId = user.idNetwork;
    if (user.networks && user.networks.length > 0) {
      this.networkId = user.networks[0].idNetwork || user.networks[0].id;
    }
    return user;
  }

  // ===== BUDGETS =====

  async listBudgets(filters = {}, page = 1, limit = 10) {
    await this.ensureAuth();

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (filters.status) params.set("filter.supplierStatus", `$eq:${filters.status}`);
    if (filters.year) params.set("filter.year", `$eq:${filters.year}`);

    const url = `${BASE_URL}/budget-proposal/summary-by-supplier-profile?${params}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SGD listBudgets failed (${res.status})`);
    const data = await res.json();
    // Extract networkId from first budget if not already set
    if (!this.networkId && data.data && data.data.length > 0 && data.data[0].idNetwork) {
      this.networkId = data.data[0].idNetwork;
    }
    return data;
  }

  async getBudgetDetail(idSubprogram, idSchool, idBudget) {
    await this.ensureAuth();
    const url = `${BASE_URL}/budget/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SGD getBudgetDetail failed (${res.status})`);
    return res.json();
  }

  async getBudgetItems(idSubprogram, idSchool, idBudget) {
    await this.ensureAuth();
    const url = `${BASE_URL}/budget-item/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}?limit=9999`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SGD getBudgetItems failed (${res.status})`);
    return res.json();
  }

  // ===== SEND PROPOSAL =====

  async sendProposal(idSubprogram, idSchool, idBudget, payload) {
    await this.ensureAuth();
    const url = `${BASE_URL}/budget-proposal/send-proposal/by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`SGD sendProposal failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return body;
  }

  // ===== SCAN ALL BUDGETS =====

  async scanAllBudgets(statusFilter = "NAEN") {
    await this.ensureAuth();
    const allBudgets = [];
    let page = 1;
    const limit = 50;

    while (true) {
      const data = await this.listBudgets({ status: statusFilter }, page, limit);
      const items = data.data || data.items || data.rows || [];
      if (items.length === 0) break;

      allBudgets.push(...items);

      const total = data.total || data.totalItems || data.count || 0;
      if (allBudgets.length >= total || items.length < limit) break;
      page++;
    }

    return allBudgets;
  }
}

module.exports = { SgdClient, BASE_URL };
