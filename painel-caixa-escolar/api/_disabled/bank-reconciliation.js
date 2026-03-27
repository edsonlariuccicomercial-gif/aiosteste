function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDate(value) {
  return String(value || "").slice(0, 10);
}

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function buildStatementFromSystem(contasReceber = [], contasPagar = [], provider = "mock") {
  const items = [];
  contasReceber.forEach((item) => {
    items.push({
      id: `EXT-CR-${item.id}`,
      data: normalizeDate(item.recebidaEm || item.vencimento),
      descricao: item.descricao || `Recebimento ${item.id}`,
      historico: item.cliente || item.descricao || "",
      origem: provider,
      provider,
      tipo: "credito",
      valor: Math.abs(toNumber(item.valor)),
      referenciaSistema: item.id,
      conciliacao: item.conciliacao || { matched: item.status === "recebida", status: item.status === "recebida" ? "conciliado" : "pendente" }
    });
  });
  contasPagar.forEach((item) => {
    items.push({
      id: `EXT-CP-${item.id}`,
      data: normalizeDate(item.pagaEm || item.vencimento),
      descricao: item.descricao || `Pagamento ${item.id}`,
      historico: item.descricao || "",
      origem: provider,
      provider,
      tipo: "debito",
      valor: -Math.abs(toNumber(item.valor)),
      referenciaSistema: item.id,
      conciliacao: item.status === "paga" ? { matched: true, status: "conciliado" } : { matched: false, status: "pendente" }
    });
  });
  return items.filter((item) => item.data);
}

function reconcileStatement(statementItems = [], contasReceber = [], contasPagar = []) {
  let matchedCount = 0;
  const result = statementItems.map((item) => {
    const valor = toNumber(item.valor);
    const data = normalizeDate(item.data);
    const isCredito = valor >= 0;
    const candidates = isCredito ? contasReceber : contasPagar;
    const match = candidates.find((conta) => {
      const contaValor = Math.abs(toNumber(conta.valor));
      const contaData = normalizeDate(isCredito ? (conta.recebidaEm || conta.vencimento) : (conta.pagaEm || conta.vencimento));
      return Math.abs(Math.abs(valor) - contaValor) < 0.01 && contaData === data;
    });
    if (match) {
      matchedCount += 1;
      return {
        ...item,
        conciliacao: {
          matched: true,
          status: "conciliado_api_bancaria",
          referencia: match.id,
          matchedTipo: isCredito ? "conta_receber" : "conta_pagar",
          matchedAt: new Date().toISOString()
        }
      };
    }
    return {
      ...item,
      conciliacao: {
        ...(item.conciliacao || {}),
        matched: false,
        status: "divergencia_api_bancaria",
        referencia: item.conciliacao?.referencia || ""
      }
    };
  });
  return { items: result, matchedCount };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Metodo nao permitido" });
  }
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const action = String(body.action || "").trim();
  const contasReceber = Array.isArray(body.contasReceber) ? body.contasReceber : [];
  const contasPagar = Array.isArray(body.contasPagar) ? body.contasPagar : [];
  const provider = String(body.bankConfig?.provider || "mock").trim() || "mock";

  if (action === "sync-statement") {
    const items = buildStatementFromSystem(contasReceber, contasPagar, provider);
    return json(res, 200, {
      ok: true,
      provider,
      mode: provider === "mock" ? "structured_fallback" : "provider_api",
      items
    });
  }

  if (action === "reconcile") {
    const statementItems = Array.isArray(body.statementItems) ? body.statementItems : [];
    const result = reconcileStatement(statementItems, contasReceber, contasPagar);
    return json(res, 200, {
      ok: true,
      provider,
      matchedCount: result.matchedCount,
      items: result.items
    });
  }

  return json(res, 400, { ok: false, error: "Acao invalida" });
};
