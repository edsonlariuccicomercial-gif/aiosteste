// ===== EDITAR ORÇAMENTO APROVADO =====
function editarOrcamentoAprovado() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  pre.status = "pendente";
  delete pre.aprovadoEm;
  delete pre.enviadoEm;
  savePreOrcamentos();

  // Re-render com campos editáveis
  abrirPreOrcamento(activePreOrcamentoId);
  renderKPIs();
  renderOrcamentos();
}

// ===== SGD INTEGRATION =====

async function isSgdApiAvailable() {
  // 1. Try local Express server
  try {
    const r = await fetch("/api/sgd/status", { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      sgdLocalServer = true;
      return true;
    }
  } catch (_) { /* no local server */ }

  // 2. In Netlify mode, SGD is available if user has credentials saved
  sgdLocalServer = false;
  return !!localStorage.getItem(SGD_CRED_KEY);
}

function updateModeIndicator(isLocal) {
  if (sgdLocalServer) {
    el.modeIndicator.textContent = "Modo Local";
    el.modeIndicator.className = "mode-indicator mode-local";
  } else {
    el.modeIndicator.textContent = "Modo Netlify";
    el.modeIndicator.className = "mode-indicator mode-netlify";
  }
}

// F1: Monta observação SGD incluindo marca quando disponível
function buildObservacaoSgd(item) {
  const marca = (item.marca || "").trim();
  // Usar observação existente, mas limpar marca antiga se presente
  let obs = (item.observacao || item.descricao || item.nome || "Conforme especificado").trim();
  // Remover qualquer [Marca: ...] existente para evitar duplicação
  obs = obs.replace(/\[Marca:\s*[^\]]*\]\s*/g, "").trim();
  if (marca) {
    return `[Marca: ${marca}] ${obs}`;
  }
  return obs;
}

function buildSgdPayload(pre) {
  const orc = orcamentos.find((o) => o.id === pre.orcamentoId);
  return {
    orcamentoId: pre.orcamentoId,
    idSubprogram: orc ? orc.idSubprogram : pre.idSubprogram,
    idSchool: orc ? orc.idSchool : pre.idSchool,
    idBudget: orc ? orc.idBudget : pre.idBudget,
    idAxis: orc ? orc.idAxis : null,
    dtGoodsDelivery: pre.dtGoodsDelivery || (orc && orc.prazoEntrega ? orc.prazoEntrega + "T00:00:00.000Z" : new Date().toISOString()),
    dtServiceDelivery: pre.dtServiceDelivery || (orc && orc.prazoEntrega ? orc.prazoEntrega + "T00:00:00.000Z" : new Date().toISOString()),
    itens: pre.itens.map((i, idx) => {
      // Try to get idBudgetItem: 1) from pre-orcamento item, 2) from orcamento item by index, 3) by name match
      let idBudgetItem = i.idBudgetItem;
      if (!idBudgetItem && orc && orc.itens) {
        // Try index match first
        if (orc.itens[idx] && orc.itens[idx].idBudgetItem) {
          idBudgetItem = orc.itens[idx].idBudgetItem;
        } else {
          // Try name match
          const norm = (s) => (s || "").replace(/\s+/g, " ").toLowerCase().trim();
          const itemName = norm(i.nome);
          const match = orc.itens.find((oi) => {
            const oiName = norm(oi.nome);
            return oiName.includes(itemName) || itemName.includes(oiName);
          });
          if (match) idBudgetItem = match.idBudgetItem;
        }
      }
      return {
        nome: i.nome,
        marca: i.marca || "",
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        precoTotal: i.precoTotal,
        observacao: buildObservacaoSgd(i),
        garantia: i.garantia || "Garantia de 12 meses conforme CDC",
        idBudgetItem,
      };
    }),
    totalGeral: pre.totalGeral,
  };
}

function downloadSgdPayload(pre) {
  const proposal = buildSgdPayload(pre);
  const payload = {
    generatedAt: new Date().toISOString(),
    format: "sgd-rest-api-v4",
    proposals: [proposal],
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sgd-payload-${pre.orcamentoId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function enviarParaSgd() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || pre.status !== "aprovado") return;

  // Read extra fields from the form
  saveSgdFieldsToPreOrcamento(pre);
  savePreOrcamentos();

  // Envia via API (local ou direta)
  el.btnEnviarSgd.disabled = true;
  el.btnEnviarSgd.innerHTML = '<span class="sgd-spinner"></span>Enviando...';

  try {
    const payload = buildSgdPayload(pre);
    let success = false;

    if (sgdLocalServer) {
      const r = await fetch("/api/sgd/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (r.ok && result.success) success = true;
      else throw new Error(result.error || "Falha no envio");
    } else {
      success = await browserSgdSubmit(payload);
    }

    if (success) {
      pre.status = "enviado";
      pre.enviadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos();
      renderAll();
      abrirPreOrcamento(activePreOrcamentoId);
      alert("Proposta enviada ao SGD com sucesso!");
    }
  } catch (err) {
    alert("Erro: " + err.message);
  } finally {
    el.btnEnviarSgd.disabled = false;
    el.btnEnviarSgd.textContent = "Enviar ao SGD";
  }
}

// ===== SGD TAB =====
window.imprimirSgd = function() {
  const tabela = document.getElementById("tabela-sgd");
  if (!tabela) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Envio SGD — Licit-AIX</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
      h2 { font-size: 16px; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
      .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; }
      .badge-aprovado { background: #dbeafe; color: #1e40af; }
      .badge-enviado { background: #fef3c7; color: #92400e; }
      .badge-ganho { background: #d1fae5; color: #065f46; }
      .badge-perdido { background: #fee2e2; color: #991b1b; }
      .text-muted { color: #999; }
      .font-mono { font-family: monospace; }
      @media print { body { margin: 10px; } }
    </style>
  </head><body>
    <h2>Envio ao SGD — ${new Date().toLocaleDateString("pt-BR")}</h2>
    ${tabela.outerHTML}
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
};

function renderSgd() {
  const allPre = Object.values(preOrcamentos);
  const ready = allPre.filter((p) => p.status === "aprovado");
  const sent = allPre.filter((p) => p.status === "enviado");
  const ganhos = allPre.filter((p) => p.status === "ganho");
  const perdidos = allPre.filter((p) => p.status === "perdido");
  let sgdItems = [...ready, ...sent, ...ganhos, ...perdidos];

  // Filtros SGD
  const fEscola = document.getElementById("filtro-sgd-escola");
  const fMun = document.getElementById("filtro-sgd-municipio");
  const fStatus = document.getElementById("filtro-sgd-status");
  const fTexto = document.getElementById("filtro-sgd-texto");

  // Popular dropdowns
  if (fEscola && fEscola.options.length <= 1) {
    const escolas = [...new Set(sgdItems.map(p => p.escola).filter(Boolean))].sort();
    escolas.forEach(e => { const o = document.createElement("option"); o.value = e; o.textContent = e; fEscola.appendChild(o); });
  }
  if (fMun && fMun.options.length <= 1) {
    const muns = [...new Set(sgdItems.map(p => p.municipio).filter(Boolean))].sort();
    muns.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; fMun.appendChild(o); });
  }

  // Aplicar filtros
  const escola = fEscola ? fEscola.value : "all";
  const mun = fMun ? fMun.value : "all";
  const status = fStatus ? fStatus.value : "all";
  const texto = fTexto ? normalizedText(fTexto.value.trim()) : "";
  const sgdDe = document.getElementById("filtro-sgd-data-de")?.value || "";
  const sgdAte = document.getElementById("filtro-sgd-data-ate")?.value || "";

  sgdItems = sgdItems.filter(p => {
    if (escola !== "all" && p.escola !== escola) return false;
    if (mun !== "all" && p.municipio !== mun) return false;
    if (status !== "all" && p.status !== status) return false;
    if (texto && !normalizedText([p.escola, p.municipio, p.orcamentoId, ...(p.itens || []).map(i => i.nome)].join(" ")).includes(texto)) return false;
    if ((sgdDe || sgdAte) && !dentroDoIntervalo(p.enviadoEm || p.aprovadoEm, sgdDe, sgdAte)) return false;
    return true;
  });

  // KPIs
  el.sgdKpiProntos.textContent = ready.length;
  el.sgdKpiEnviados.textContent = sent.length;
  if (el.sgdKpiGanhos) el.sgdKpiGanhos.textContent = ganhos.length;
  el.sgdKpiValor.textContent = brl.format(sgdItems.reduce((s, p) => s + (p.totalGeral || 0), 0));

  // Mode badge
  const hasCreds = sgdAvailable || !!localStorage.getItem(SGD_CRED_KEY);
  el.sgdModeBadge.textContent = hasCreds ? (sgdLocalServer ? "API Local" : "API Direta") : "Sem credenciais";
  el.sgdModeBadge.className = hasCreds ? "badge badge-aprovado" : "badge badge-muted";

  // Botão enviar todos (se tem prontos)
  el.btnSgdEnviarTodos.style.display = ready.length > 0 ? "inline-block" : "none";
  el.btnSgdBaixarTodos.style.display = sgdItems.length > 0 ? "inline-block" : "none";

  // Empty
  el.sgdEmpty.style.display = sgdItems.length ? "none" : "block";

  // Tabela
  const statusOrder = { aprovado: 0, enviado: 1, ganho: 2, perdido: 3 };
  el.tbodySgd.innerHTML = sgdItems
    .sort((a, b) => (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9))
    .map((p) => {
      const badgeMap = {
        aprovado: { cls: "badge-aprovado", label: "Pronto" },
        enviado: { cls: "badge-enviado", label: "Enviado" },
        ganho: { cls: "badge-ganho", label: "Ganho" },
        perdido: { cls: "badge-perdido", label: "Perdido" },
      };
      const badge = badgeMap[p.status] || { cls: "badge-muted", label: p.status };
      const dateInfo = p.enviadoEm ? formatDate(p.enviadoEm) : formatDate(p.aprovadoEm);

      // Checkbox para contrato unificado (enviados e aprovados)
      const canSelect = p.status === "enviado" || p.status === "aprovado";
      const checkbox = canSelect ? `<input type="checkbox" class="sgd-contrato-check" data-id="${p.orcamentoId}" />` : "";

      let actions = "";
      if (p.status === "aprovado") {
        actions = `<button class="btn btn-inline btn-sgd" onclick="sgdEnviarUnico('${p.orcamentoId}')">Enviar</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else if (p.status === "enviado") {
        actions = `<button class="btn btn-inline btn-accent" onclick="abrirModalResultado('${p.orcamentoId}')">Resultado</button>
          <button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      } else if (p.status === "ganho") {
        actions = `<button class="btn btn-inline" onclick="abrirPreOrcamento('${p.orcamentoId}')">Ver Itens</button>
          <button class="btn btn-inline btn-accent" onclick="gerarDemanda('${p.orcamentoId}')">Gerar Demanda</button>`;
      } else {
        actions = `<button class="btn btn-inline" onclick="sgdBaixarPayload('${p.orcamentoId}')">Payload</button>`;
      }

      // Resumo dos itens
      const itens = p.itens || [];
      const resumoItens = itens.length > 0
        ? `<span title="${itens.map(i => i.nome).join('\n')}" style="font-size:0.75rem;color:#555;cursor:help;">${itens.length} iten(s): ${itens.slice(0, 3).map(i => escapeHtml((i.nome || "").slice(0, 25))).join(", ")}${itens.length > 3 ? "..." : ""}</span>`
        : '<span class="text-muted" style="font-size:0.75rem;">—</span>';

      return `<tr>
        <td>${checkbox}</td>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td>${escapeHtml(p.municipio)}</td>
        <td style="max-width:250px;">${resumoItens}</td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td><span class="badge ${badge.cls}">${badge.label}</span> <span class="text-muted" style="font-size:0.72rem">${dateInfo}</span></td>
        <td class="nowrap">${actions}</td>
      </tr>`;
    }).join("");

  // Barra contrato unificado
  let bar = document.getElementById("sgd-contrato-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "sgd-contrato-bar";
    bar.style.cssText = "display:none;padding:0.5rem 1rem;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;margin-bottom:0.75rem;align-items:center;gap:1rem;flex-wrap:wrap;";
    bar.innerHTML = `<span id="sgd-contrato-count" style="font-weight:600;">0 selecionados</span>
      <button class="btn btn-sm btn-accent" onclick="gerarContratoUnificado()">Gerar Contrato Unificado</button>`;
    el.tbodySgd.parentElement.parentElement.insertBefore(bar, el.tbodySgd.parentElement);
  }

  // Bind checkboxes
  el.tbodySgd.querySelectorAll(".sgd-contrato-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const checked = el.tbodySgd.querySelectorAll(".sgd-contrato-check:checked");
      const b = document.getElementById("sgd-contrato-bar");
      const c = document.getElementById("sgd-contrato-count");
      if (b) b.style.display = checked.length > 0 ? "flex" : "none";
      if (c) c.textContent = `${checked.length} selecionado(s)`;
    });
  });

  // Story 4.43: renderDemandas/renderEstoque/renderListaCompras migrados para gdp-contratos.html
}

window.sgdBaixarPayload = function (orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre) return;
  downloadSgdPayload(pre);
  if (pre.status === "aprovado") {
    pre.status = "enviado";
    pre.enviadoEm = new Date().toISOString().slice(0, 10);
    savePreOrcamentos();
    renderSgd();
    renderKPIs();
  }
};

window.sgdEnviarUnico = async function (orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre || pre.status !== "aprovado") return;

  try {
    const payload = buildSgdPayload(pre);
    let success = false;

    if (sgdLocalServer) {
      // Local Express server
      const r = await fetch("/api/sgd/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (r.ok && result.success) success = true;
      else throw new Error(result.error || "Falha no envio");
    } else {
      // Direct browser API call
      success = await browserSgdSubmit(payload);
    }

    if (success) {
      pre.status = "enviado";
      pre.enviadoEm = new Date().toISOString().slice(0, 10);
      savePreOrcamentos();
      renderAll();
      showToast(`Proposta ${orcId} enviada ao SGD!`);
    } else {
      alert("Erro: " + (result.error || "Falha"));
    }
  } catch (err) {
    alert("Erro de conexão: " + err.message);
  }
};

// Browser-side SGD submit (direct API, Netlify mode)
async function browserSgdSubmit(payload) {
  await BrowserSgdClient.login();
  if (!BrowserSgdClient.networkId) await BrowserSgdClient.listBudgets(1, 1);

  let { idSubprogram, idSchool, idBudget } = payload;
  // Tentar recuperar IDs do orcamento vinculado se ausentes
  if ((!idSubprogram || !idSchool || !idBudget) && payload.orcamentoId) {
    const orc = orcamentos.find(o => o.id === payload.orcamentoId);
    if (orc) {
      if (!idSubprogram && orc.idSubprogram) idSubprogram = orc.idSubprogram;
      if (!idSchool && orc.idSchool) idSchool = orc.idSchool;
      if (!idBudget && orc.idBudget) idBudget = orc.idBudget;
    }
  }
  // Tentar pegar do primeiro orcamento que tenha IDs SGD
  if (!idSubprogram || !idSchool || !idBudget) {
    const orcComIds = orcamentos.find(o => o.idSubprogram && o.idSchool && o.idBudget);
    if (orcComIds) {
      if (!idSubprogram) idSubprogram = orcComIds.idSubprogram;
      if (!idSchool) idSchool = orcComIds.idSchool;
      if (!idBudget) idBudget = orcComIds.idBudget;
    }
  }
  if (!idSubprogram || !idSchool || !idBudget) {
    const missing = [];
    if (!idSubprogram) missing.push("idSubprogram");
    if (!idSchool) missing.push("idSchool");
    if (!idBudget) missing.push("idBudget");
    throw new Error("IDs SGD ausentes (" + missing.join(", ") + "). Importe o orcamento do SGD primeiro ou vincule a um orcamento importado.");
  }

  // Use saved idAxis and networkId from orcamento if available
  const orc = orcamentos.find((o) => o.id === payload.orcamentoId);
  let idAxis = orc ? orc.idAxis : null;

  // Switch to budget's networkId if available (each SRE has different networkId)
  if (orc && orc.idNetwork) BrowserSgdClient.networkId = orc.idNetwork;

  if (!idAxis) {
    const detail = await BrowserSgdClient.getBudgetDetail(idSubprogram, idSchool, idBudget);
    idAxis = detail.idAxis;
  }
  if (!idAxis) throw new Error("idAxis nao encontrado");

  // Check if all items already have idBudgetItem from the scan
  const allHaveIds = payload.itens.every((i) => i.idBudgetItem);

  let budgetItems = [];
  if (!allHaveIds) {
    // Fetch budget items from API for mapping
    const itemsRes = await BrowserSgdClient.getBudgetItems(idSubprogram, idSchool, idBudget);
    budgetItems = itemsRes.data || [];

    // Also try matching from saved orcamento items
    if (budgetItems.length === 0 && orc && orc.itens && orc.itens.length > 0) {
      budgetItems = orc.itens.map((i) => ({
        idBudgetItem: i.idBudgetItem,
        txBudgetItemType: i.nome,
        txDescription: i.descricao,
      }));
    }
  }

  const norm = (s) => (s || "").replace(/\n/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
  const proposalItems = payload.itens.map((item, idx) => {
    // 1. Use saved idBudgetItem directly
    let idBudgetItem = item.idBudgetItem;

    // 2. If not found, try matching from orcamento's saved items
    if (!idBudgetItem && orc && orc.itens) {
      const orcItem = orc.itens[idx];
      if (orcItem && orcItem.idBudgetItem) idBudgetItem = orcItem.idBudgetItem;
    }

    // 3. Fallback: fuzzy match against API budget items
    if (!idBudgetItem && budgetItems.length > 0) {
      const itemName = norm(item.nome);
      let matched = budgetItems.find((bi) => {
        const biName = norm(bi.txBudgetItemType || bi.txDescription || "");
        const biDesc = norm(bi.txDescription || "");
        return biName.includes(itemName) || itemName.includes(biName) || biDesc.includes(itemName) || itemName.includes(biDesc);
      });
      if (!matched && budgetItems[idx]) matched = budgetItems[idx];
      if (matched) idBudgetItem = matched.idBudgetItem || matched.id;
    }

    if (!idBudgetItem) throw new Error(`Item "${item.nome}" nao mapeado no SGD. Tente varrer o SGD novamente para atualizar os itens.`);

    const p = { nuValueByItem: item.precoUnitario, idBudgetItem, txItemObservation: buildObservacaoSgd(item) };
    if (item.garantia) p.txWarrantyDescription = item.garantia;
    return p;
  });

  const sgdPayload = {
    dtGoodsDelivery: payload.dtGoodsDelivery || new Date().toISOString(),
    dtServiceDelivery: payload.dtServiceDelivery || new Date().toISOString(),
    idAxis,
    budgetProposalItems: proposalItems,
  };

  await BrowserSgdClient.sendProposal(idSubprogram, idSchool, idBudget, sgdPayload);
  return true;
}

async function sgdEnviarTodos() {
  const ready = Object.values(preOrcamentos).filter((p) => p.status === "aprovado");
  if (ready.length === 0) return;

  if (!confirm(`Enviar ${ready.length} proposta(s) ao SGD?`)) return;

  el.btnSgdEnviarTodos.disabled = true;
  el.btnSgdEnviarTodos.innerHTML = '<span class="sgd-spinner"></span>Enviando...';

  let ok = 0;
  let fail = 0;

  for (const pre of ready) {
    try {
      const payload = buildSgdPayload(pre);
      let success = false;

      if (sgdLocalServer) {
        const r = await fetch("/api/sgd/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await r.json();
        success = r.ok && result.success;
      } else {
        success = await browserSgdSubmit(payload);
      }

      if (success) {
        pre.status = "enviado";
        pre.enviadoEm = new Date().toISOString().slice(0, 10);
        ok++;
      } else {
        fail++;
      }
    } catch (_) {
      fail++;
    }
  }

  savePreOrcamentos();
  renderAll();

  el.btnSgdEnviarTodos.disabled = false;
  el.btnSgdEnviarTodos.textContent = "Enviar Todos";
  alert(`${ok} enviado(s), ${fail} erro(s).`);
}

function sgdBaixarTodos() {
  const items = Object.values(preOrcamentos).filter((p) => p.status === "aprovado" || p.status === "enviado");
  if (items.length === 0) return;

  const payload = {
    generatedAt: new Date().toISOString(),
    proposals: items.map((p) => buildSgdPayload(p)),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sgd-prequote-payload.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Marcar todos aprovados como enviados
  items.forEach((p) => {
    if (p.status === "aprovado") {
      p.status = "enviado";
      p.enviadoEm = new Date().toISOString().slice(0, 10);
    }
  });
  savePreOrcamentos();
  renderSgd();
  renderKPIs();
}

// ===== VARREDURA SGD (Fase 4) =====
async function varrerSgd() {
  const btn = document.getElementById("btn-varrer-sgd") || el.btnCollectSgd;
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="sgd-spinner"></span>Varrendo SGD...';

  try {
    if (sgdLocalServer) {
      // Mode 1: Use local Express server
      const r = await fetch("/api/sgd/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await r.json();
      if (!r.ok || !result.success) throw new Error(result.error || "Falha na varredura");

      const orcData = await fetchJson("data/orcamentos.json");
      orcamentos = Array.isArray(orcData) ? orcData : [];
      showToast(result.novos > 0 ? `${result.novos} novo(s) orçamento(s)!` : "Nenhum orçamento novo.");
    } else {
      // Mode 2: Direct browser API calls (Netlify mode)
      await BrowserSgdClient.login();

      // Resolve networkId via /auth/user (same strategy as server-side SgdClient)
      if (!BrowserSgdClient.networkId) {
        try {
          await BrowserSgdClient.getUser();
          console.log(`[Varrer] networkId via getUser: ${BrowserSgdClient.networkId}`);
        } catch (e) {
          console.warn(`[Varrer] getUser falhou: ${e.message}, tentando warm-up...`);
        }
      }

      // Fallback: warm-up listBudgets to extract networkId from first budget
      if (!BrowserSgdClient.networkId) {
        const warmUp = await BrowserSgdClient.listBudgets(1, 1);
        if (!BrowserSgdClient.networkId) {
          console.warn("[Varrer] networkId ainda null após warm-up. Dados:", warmUp);
        } else {
          console.log(`[Varrer] networkId via warm-up: ${BrowserSgdClient.networkId}`);
        }
      }
      sgdAvailable = true;
      updateModeIndicator(false);

      // Build school lookup from ALL configured SREs (Story 4.33)
      const sreNorm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase().trim();
      const sreSchoolsList = [];
      const schoolToMunicipio = {};
      const schoolToMunicipios = {}; // array — para nomes duplicados entre cidades
      const schoolToSre = {}; // maps school → SRE name

      allSreData.forEach(sre => {
        if (sre.data && sre.data.municipios) {
          sre.data.municipios.forEach((m) => {
            (m.escolas || []).forEach((e) => {
              const n = sreNorm(e);
              sreSchoolsList.push(n);
              schoolToMunicipio[n] = m.nome;
              schoolToSre[n] = sre.nome; // track which SRE
              if (!schoolToMunicipios[n]) schoolToMunicipios[n] = [];
              if (!schoolToMunicipios[n].includes(m.nome)) schoolToMunicipios[n].push(m.nome);
            });
          });
        }
      });

      // Confirmed SRE Uberaba municipality IDs (SGD API idCounty field)
      // ONLY confirmed county IDs — do NOT add auto-discovered ones (nomes duplicados entre cidades causam falsos positivos)
      const sreCountyMap = {
        2623: "Uberaba", 2857: "Uberaba",
        2568: "Araxa", 2494: "Sacramento", 2158: "Iturama",
        2805: "Pirajuba", 2480: "Santa Juliana", 2631: "Frutal",
        2422: "Campos Altos",
      };
      const sreCountyIds = new Set(Object.keys(sreCountyMap).map(Number));

      // Word-boundary checking to prevent partial matches (e.g., "EE BRASIL" must NOT match "EE BRASILIANO BRAZ")
      function containsWholeMatch(haystack, needle) {
        const idx = haystack.indexOf(needle);
        if (idx === -1) return false;
        const endIdx = idx + needle.length;
        if (endIdx < haystack.length && /[A-Z0-9]/.test(haystack[endIdx])) return false;
        if (idx > 0 && /[A-Z0-9]/.test(haystack[idx - 1])) return false;
        return true;
      }

      function findSreMatch(sgdSchoolName) {
        const norm = sreNorm(sgdSchoolName);
        if (sreSchoolsList.includes(norm)) return norm;
        for (const sre of sreSchoolsList) {
          if (containsWholeMatch(norm, sre)) return sre;
        }
        for (const sre of sreSchoolsList) {
          const expanded = sre.replace(/^EE\s+/, "ESCOLA ESTADUAL ");
          if (containsWholeMatch(norm, expanded)) return sre;
        }
        const sgdCore = norm
          .replace(/^CAIXA ESCOLAR\s*(DA|DE|DO)?\s*/i, "")
          .replace(/^ASSOCIACAO\s*(DA|DE|DO)?\s*/i, "")
          .replace(/^CE\s+/, "")
          .trim();
        if (sgdCore && sreSchoolsList.includes(sgdCore)) return sgdCore;
        // Last resort: strip "EE " from SRE names and check if contained in sgdCore
        // e.g. sgdCore="ROTARY DE ARAXA" contains sreCore="ROTARY" (from "EE ROTARY")
        if (sgdCore) {
          for (const sre of sreSchoolsList) {
            const sreCore = sre.replace(/^EE\s+/, "").trim();
            if (sreCore && containsWholeMatch(sgdCore, sreCore)) return sre;
          }
        }
        return null;
      }

      // Step 1a: Fetch ABERTOS (NAEN) — varredura normal de oportunidades
      const allBudgets = [];
      let page = 1;
      const PAGE_SIZE = 100;
      while (true) {
        const data = await BrowserSgdClient.listBudgets(page, PAGE_SIZE);
        const items = data.data || [];
        if (items.length === 0) break;
        allBudgets.push(...items);
        const total = data.meta ? data.meta.totalItems : 0;
        if (allBudgets.length >= total) break;
        page++;
        btn.innerHTML = `<span class="sgd-spinner"></span>Listando... ${allBudgets.length}/${total}`;
      }

      // Checar status das enviadas: use o botão "Checar SGD" individual em cada proposta

      // Step 2: Filter using confirmed idSchool whitelist + county/name fallback
      // Whitelist persists in localStorage — once a school is confirmed, it never needs re-matching
      const WHITELIST_KEY = "caixaescolar.schoolWhitelist";
      const schoolWhitelist = JSON.parse(localStorage.getItem(WHITELIST_KEY) || "{}");
      const matched = [];
      const rejected = [];
      const filtered = [];

      // DEBUG: log all budgets containing "ROTARY" to diagnose matching issues
      const rotaryBudgets = allBudgets.filter(b => (b.schoolName || b.txSchoolName || "").toUpperCase().includes("ROTARY"));
      if (rotaryBudgets.length > 0) {
        console.log(`[Varrer DEBUG] ROTARY budgets encontrados na API (${rotaryBudgets.length}):`, rotaryBudgets.map(b => ({
          schoolName: b.schoolName, txSchoolName: b.txSchoolName, idCounty: b.idCounty, idSchool: b.idSchool,
          countyName: b.countyName, txCountyName: b.txCountyName, supplierStatus: b.supplierStatus,
          idBudget: b.idBudget, findMatch: findSreMatch(b.schoolName || b.txSchoolName || ""),
          allFields: Object.keys(b)
        })));
      } else {
        console.log("[Varrer DEBUG] NENHUM budget com 'ROTARY' encontrado na API. Total budgets:", allBudgets.length);
      }

      allBudgets.forEach((b) => {
        const escola = b.schoolName || b.txSchoolName || "";
        const county = b.idCounty;
        const idSchool = b.idSchool;

        // TIER 1: idSchool already confirmed in whitelist — instant match, zero ambiguity
        if (idSchool && schoolWhitelist[idSchool]) {
          b._sreMatch = schoolWhitelist[idSchool].sre || sreNorm(escola);
          filtered.push(b);
          matched.push({ sgd: escola, county, mun: schoolWhitelist[idSchool].municipio, via: "whitelist", idSchool });
          return;
        }

        // TIER 2: County is confirmed SRE Uberaba
        if (sreCountyIds.has(county)) {
          const nameMatch = findSreMatch(escola);
          b._sreMatch = nameMatch || sreNorm(escola);
          filtered.push(b);
          const mun = nameMatch ? schoolToMunicipio[nameMatch] || sreCountyMap[county] : sreCountyMap[county];
          matched.push({ sgd: escola, county, mun, via: nameMatch ? "county+name" : "county-only", idSchool });
          // Auto-confirm to whitelist
          if (idSchool) schoolWhitelist[idSchool] = { escola, municipio: mun, sre: b._sreMatch, confirmedAt: new Date().toISOString().slice(0, 10) };
          return;
        }

        // TIER 3: Name match — ONLY unique names (not ambiguous across municipalities)
        const nameMatch = findSreMatch(escola);
        if (nameMatch) {
          const possibleMuns = schoolToMunicipios[nameMatch] || [];
          if (possibleMuns.length > 1) {
            // Try to disambiguate using city name embedded in SGD schoolName
            // e.g. "CAIXA ESCOLAR ROTARY DE ARAXÁ" → contains "ARAXA" → resolves to Araxa
            const sgdNorm = sreNorm(escola);
            const countyNorm = sreNorm(b.countyName || b.txCountyName || "");
            const disambiguated = possibleMuns.find(m => {
              const mNorm = sreNorm(m);
              return sgdNorm.includes(mNorm) || countyNorm === mNorm;
            });
            if (disambiguated) {
              b._sreMatch = nameMatch;
              filtered.push(b);
              matched.push({ sgd: escola, county, mun: disambiguated, via: "name-disambiguated", idSchool });
              if (idSchool) schoolWhitelist[idSchool] = { escola, municipio: disambiguated, sre: nameMatch, confirmedAt: new Date().toISOString().slice(0, 10) };
            } else {
              rejected.push({ sgd: escola, sre: nameMatch, county, reason: `nome ambíguo: ${possibleMuns.join("/")}`, idSchool });
            }
          } else {
            b._sreMatch = nameMatch;
            filtered.push(b);
            const mun = schoolToMunicipio[nameMatch] || "?";
            matched.push({ sgd: escola, county, mun, via: "name-only", idSchool });
            if (!sreCountyIds.has(county)) console.log(`[Varrer] Novo county descoberto: ${county} → ${mun}`);
            // Auto-confirm to whitelist
            if (idSchool) schoolWhitelist[idSchool] = { escola, municipio: mun, sre: nameMatch, confirmedAt: new Date().toISOString().slice(0, 10) };
          }
        }
      });

      // Save updated whitelist
      localStorage.setItem(WHITELIST_KEY, JSON.stringify(schoolWhitelist));
      const whitelistSize = Object.keys(schoolWhitelist).length;

      // Debug logs
      const whitelistHits = matched.filter((m) => m.via === "whitelist").length;
      const countyHits = matched.filter((m) => m.via === "county+name" || m.via === "county-only").length;
      const nameHits = matched.filter((m) => m.via === "name-only").length;
      const disambiguatedHits = matched.filter((m) => m.via === "name-disambiguated").length;
      console.log(`[Varrer] ${whitelistHits} whitelist, ${countyHits} county, ${nameHits} name-only, ${disambiguatedHits} desambiguados → ${filtered.length} aceitos de ${allBudgets.length} varridos`);
      console.log(`[Varrer] Whitelist total: ${whitelistSize} escolas confirmadas`);
      if (rejected.length > 0) console.log(`[Varrer] ${rejected.length} rejeitados:`, rejected);
      const munsEncontrados = [...new Set(matched.map((m) => m.mun).filter(Boolean).filter(m => m !== "?"))].sort();
      const totalSreMunicipios = allSreData.reduce((sum, sre) => sum + (sre.data?.municipios?.length || 0), 0);
      console.log(`[Varrer] Municípios (${munsEncontrados.length}/${totalSreMunicipios}):`, munsEncontrados);
      // SRE breakdown log (Story 4.33)
      const sreCounts = {};
      filtered.forEach(b => {
        const sre = schoolToSre[b._sreMatch] || "Uberaba";
        sreCounts[sre] = (sreCounts[sre] || 0) + 1;
      });
      console.log(`[Varrer] SREs:`, sreCounts, `→ ${filtered.length} aceitos de ${allBudgets.length} varridos`);

      // DEBUG ROTARY — mostrar diagnóstico visível
      const rotaryMatched = matched.filter(m => (m.sgd || "").toUpperCase().includes("ROTARY"));
      const rotaryRejected = rejected.filter(r => (r.sgd || "").toUpperCase().includes("ROTARY"));
      const rotaryFiltered = filtered.filter(b => (b.schoolName || b.txSchoolName || "").toUpperCase().includes("ROTARY"));
      console.log(`[Varrer ROTARY] matched: ${rotaryMatched.length}, rejected: ${rotaryRejected.length}, filtered: ${rotaryFiltered.length}`, { rotaryMatched, rotaryRejected });
      if (rotaryRejected.length > 0) console.warn(`[Varrer ROTARY REJEITADO]`, JSON.stringify(rotaryRejected, null, 2));
      // Show ROTARY API raw data
      const rotaryRaw = allBudgets.filter(b => (b.schoolName || b.txSchoolName || "").toUpperCase().includes("ROTARY"));
      if (rotaryRaw.length > 0) console.warn(`[Varrer ROTARY RAW]`, JSON.stringify(rotaryRaw.map(b => ({ schoolName: b.schoolName, idCounty: b.idCounty, idSchool: b.idSchool, idBudget: b.idBudget, supplierStatus: b.supplierStatus })), null, 2));

      btn.innerHTML = `<span class="sgd-spinner"></span>SREs: ${filtered.length} de ${allBudgets.length}. Buscando detalhes...`;

      // Step 3: Fetch detail + items for each SRE budget (sequential — networkId is shared state)
      const scanResults = [];
      let novos = 0;

      for (let i = 0; i < filtered.length; i++) {
        const b = filtered[i];
        const id = String(b.idBudget || b.id || "");
        if (!id) continue;

        const escolaRaw = b.schoolName || b.txSchoolName || "";
        const sreMatchKey = b._sreMatch || findSreMatch(escolaRaw) || sreNorm(escolaRaw);
        const municipio = schoolToMunicipio[sreMatchKey] || sreCountyMap[b.idCounty] || "";

        // Use this budget's own networkId (each SRE has different networkId)
        const budgetNetworkId = b.idNetwork || BrowserSgdClient.networkId;
        const savedNetworkId = BrowserSgdClient.networkId;
        BrowserSgdClient.networkId = budgetNetworkId;

        // Fetch budget detail (for initiativeDescription/objeto, idAxis, dates)
        let detail = {};
        let budgetItems = [];
        try {
          if (b.idSubprogram && b.idSchool && b.idBudget) {
            detail = await BrowserSgdClient.getBudgetDetail(b.idSubprogram, b.idSchool, b.idBudget);
            const itemsRes = await BrowserSgdClient.getBudgetItems(b.idSubprogram, b.idSchool, b.idBudget);
            budgetItems = itemsRes.data || [];
            if (!Array.isArray(budgetItems)) budgetItems = [];
          }
        } catch (err) {
          console.warn(`[Varrer] Detalhe budget ${id}: ${err.message}`);
        }
        BrowserSgdClient.networkId = savedNetworkId;

        const orc = {
          id, idBudget: b.idBudget, ano: detail.year || b.year || new Date().getFullYear(),
          escola: escolaRaw, municipio,
          sre: schoolToSre[sreMatchKey] || (sreCountyMap[b.idCounty] ? "Uberaba" : "Desconhecida"),
          grupo: detail.expenseGroupDescription || "",
          subPrograma: detail.subprogramName || "",
          objeto: (detail.initiativeDescription || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
          prazo: (b.dtProposalSubmission || detail.dtProposalSubmission || "").slice(0, 10),
          prazoEntrega: (detail.dtDelivery || "").slice(0, 10),
          valorEstimado: detail.estimatedValue ? parseFloat(detail.estimatedValue) : null,
          // Status mapeado do SGD: NAEN=aberto, ENVI=enviado, APRO=aprovado, RECU=recusado
          status: ({ NAEN: "aberto", ENVI: "enviado", APRO: "aprovado", RECU: "recusado" })[b.supplierStatus] || "aberto",
          statusSgd: b.supplierStatus || "NAEN",
          participantes: detail.inNaturalPersonAllowed ? "PJ/PF" : "PJ",
          itens: budgetItems.map((bi) => ({
            nome: bi.txBudgetItemType || bi.txName || "",
            descricao: bi.txDescription || "",
            categoria: bi.txExpenseCategory || "Custeio",
            unidade: bi.txBudgetItemUnit || bi.txUnit || "",
            quantidade: bi.nuQuantity || 0,
            garantia: bi.txWarrantyRequired || "",
            idBudgetItem: bi.idBudgetItem || bi.id || null,
          })),
          idSchool: b.idSchool, idSubprogram: b.idSubprogram,
          idNetwork: b.idNetwork || null,
          idAxis: detail.idAxis || b.idAxis || null,
        };

        scanResults.push(orc);
        novos++;

        if ((i + 1) % 5 === 0 || i === filtered.length - 1) {
          btn.innerHTML = `<span class="sgd-spinner"></span>Detalhando ${i + 1}/${filtered.length}...`;
        }
      }

      // Replace orcamentos with fresh scan data
      orcamentos = scanResults;
      localStorage.setItem("caixaescolar.orcamentos", JSON.stringify(orcamentos));
      const sreBreakdown = Object.entries(sreCounts).map(([k,v]) => `${k}: ${v}`).join(", ");
      showToast(`${novos} orçamento(s) carregados (${sreBreakdown}) de ${allBudgets.length} total SGD.`);
    }

    renderAll();

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    el.ultimaAtualizacao.textContent = `Atualizado: ${dd}/${mm} ${hh}:${mi}`;
    el.ultimaAtualizacao.style.display = "inline-block";
  } catch (err) {
    console.error("[Varrer] Erro na varredura:", err);
    const msg = err.message || String(err);
    if (msg.includes("422")) {
      alert("Erro SGD (422): Header x-network-being-managed-id ausente ou inválido. Verifique as credenciais e tente novamente.");
    } else if (msg.includes("401") || msg.includes("Login")) {
      alert("Erro de autenticação SGD. Verifique CNPJ e senha.");
      localStorage.removeItem(SGD_CRED_KEY);
    } else {
      alert("Erro na varredura: " + msg);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Varrer SGD";
  }

  // === INTEGRAÇÃO BANCO DE PREÇOS ===
  // Após varrer SGD, enviar itens ao banco de preços para intake + normalização
  if (typeof BancoPrecos !== "undefined" && BancoPrecos.isEnabled() && orcamentos.length > 0) {
    try {
      console.log("[BancoPrecos] Enviando itens do SGD ao banco de preços...");
      const intakeResult = await BancoPrecos.enviarItensIntake(orcamentos);
      if (intakeResult) {
        console.log(`[BancoPrecos] Intake: ${intakeResult.vinculados} vinculados, ${intakeResult.pendentes} pendentes`);
      }
    } catch (e) {
      console.warn("[BancoPrecos] Erro no intake:", e.message);
    }
  }
}

// Legacy alias for existing button binding
async function coletarSgd() {
  return varrerSgd();
}

// ===== TOAST =====
function showToast(msg, duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = "position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "toast-msg";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== SGD FIELDS SAVE =====
function saveSgdFieldsToPreOrcamento(pre) {
  const dtGoodsEl = document.getElementById("sgd-dt-goods");
  const dtServiceEl = document.getElementById("sgd-dt-service");
  if (dtGoodsEl && dtGoodsEl.value) pre.dtGoodsDelivery = dtGoodsEl.value + "T00:00:00.000Z";
  if (dtServiceEl && dtServiceEl.value) pre.dtServiceDelivery = dtServiceEl.value + "T00:00:00.000Z";

  pre.itens.forEach((item, idx) => {
    const obsEl = document.getElementById(`sgd-obs-${idx}`);
    const garEl = document.getElementById(`sgd-garantia-${idx}`);
    if (obsEl) item.observacao = obsEl.value;
    if (garEl) item.garantia = garEl.value;
  });
}

// ===== SGD FIELDS RENDERING =====
function renderSgdFields() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  const container = document.getElementById("sgd-extra-fields");
  if (!container) return;

  const orc = orcamentos.find((o) => o.id === pre.orcamentoId);
  const defaultDate = orc && orc.prazoEntrega ? orc.prazoEntrega : new Date().toISOString().slice(0, 10);
  const isEditable = pre.status === "pendente" || pre.status === "aprovado";

  // Date fields
  const dtGoods = pre.dtGoodsDelivery ? pre.dtGoodsDelivery.slice(0, 10) : defaultDate;
  const dtService = pre.dtServiceDelivery ? pre.dtServiceDelivery.slice(0, 10) : defaultDate;

  let html = `
    <div class="sgd-fields-header"><h3>Dados para envio ao SGD</h3></div>
    <div class="sgd-dates-grid">
      <label>
        Prazo Entrega Bens
        <input type="date" id="sgd-dt-goods" value="${dtGoods}" ${isEditable ? "" : "disabled"} />
      </label>
      <label>
        Prazo Entrega/Execução
        <input type="date" id="sgd-dt-service" value="${dtService}" ${isEditable ? "" : "disabled"} />
      </label>
    </div>
    <div class="sgd-items-fields">
  `;

  pre.itens.forEach((item, idx) => {
    const obs = buildObservacaoSgd(item);
    const gar = item.garantia || "Garantia de 12 meses conforme CDC";
    html += `
      <div class="sgd-item-field">
        <strong>${escapeHtml(item.nome)}</strong>
        <label>
          Observação
          <textarea id="sgd-obs-${idx}" rows="2" ${isEditable ? "" : "disabled"}>${escapeHtml(obs)}</textarea>
        </label>
        <label>
          Garantia Ofertada
          <textarea id="sgd-garantia-${idx}" rows="1" ${isEditable ? "" : "disabled"}>${escapeHtml(gar)}</textarea>
        </label>
      </div>
    `;
  });

  html += "</div>";
  container.innerHTML = html;

  // Bind auto-save on every field change so edits are never lost
  if (isEditable) {
    const autoSave = () => {
      saveSgdFieldsToPreOrcamento(pre);
      savePreOrcamentos();
    };
    const dtGoodsEl = document.getElementById("sgd-dt-goods");
    const dtServiceEl = document.getElementById("sgd-dt-service");
    if (dtGoodsEl) dtGoodsEl.addEventListener("change", autoSave);
    if (dtServiceEl) dtServiceEl.addEventListener("change", autoSave);
    pre.itens.forEach((_, idx) => {
      const obsEl = document.getElementById(`sgd-obs-${idx}`);
      const garEl = document.getElementById(`sgd-garantia-${idx}`);
      if (obsEl) obsEl.addEventListener("input", autoSave);
      if (garEl) garEl.addEventListener("input", autoSave);
    });
  }
}
