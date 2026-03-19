function formatAuditStamp(audit, fallbackAt = "", fallbackBy = "") {
  const at = audit?.updatedAt || audit?.createdAt || fallbackAt;
  const by = audit?.updatedBy || audit?.createdBy || fallbackBy;
  if (!at && !by) return "-";
  const parts = [];
  if (by) parts.push(by);
  if (at) parts.push(new Date(at).toLocaleString("pt-BR"));
  return parts.join(" | ");
}

function getAuditActor() {
  try {
    const empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
    return empresa.nome || empresa.razaoSocial || empresa.usuario || "operador-gdp";
  } catch (_) {
    return "operador-gdp";
  }
}

function setIntegrationState(target, channel, patch = {}) {
  if (!target) return;
  target.integracoes = target.integracoes || {};
  target.integracoes[channel] = {
    ...(target.integracoes[channel] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: getAuditActor()
  };
}

function updateNotaFiscalIntegration(notaId, channel, patch = {}) {
  const nf = notasFiscais.find((item) => item.id === notaId);
  if (!nf) return;
  setIntegrationState(nf, channel, patch);
  saveNotasFiscais();
}

function updateContaReceberIntegration(contaId, channel, patch = {}) {
  const conta = contasReceber.find((item) => item.id === contaId);
  if (!conta) return;
  setIntegrationState(conta, channel, patch);
  saveContasReceber();
}

function getIntegrationStatusLabel(integration) {
  if (!integration?.status) return "-";
  return integration.protocol ? `${integration.status} | ${integration.protocol}` : integration.status;
}

function queueGdpIntegration(entityType, action, entityId, payload, options = {}) {
  const event = {
    id: genId("INT"),
    entityType,
    action,
    entityId,
    channel: options.channel || "operacional",
    status: "pendente_envio",
    createdAt: new Date().toISOString(),
    createdBy: getAuditActor(),
    payload
  };

  integracoesGdp.unshift(event);
  if (integracoesGdp.length > 400) integracoesGdp = integracoesGdp.slice(0, 400);
  saveIntegracoesGdp();

  fetch("/api/gdp-integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event })
  }).then(async (resp) => {
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const current = integracoesGdp.find((item) => item.id === event.id);
    if (current) {
      current.status = "sincronizado";
      current.syncedAt = new Date().toISOString();
      current.protocol = data.protocol || "";
      current.remoteStatus = data.status || "registrado";
      saveIntegracoesGdp();
    }
    if (typeof options.onSuccess === "function") options.onSuccess(data, event);
  }).catch((err) => {
    const current = integracoesGdp.find((item) => item.id === event.id);
    if (current) {
      current.status = "falha_envio";
      current.error = err.message;
      current.failedAt = new Date().toISOString();
      saveIntegracoesGdp();
    }
    if (typeof options.onError === "function") options.onError(err, event);
  });

  return event;
}
