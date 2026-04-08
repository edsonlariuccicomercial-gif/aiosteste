// ===== DATA LOADING =====
async function fetchJson(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    console.warn("Falha ao carregar " + path, e);
    return null;
  }
}

function loadPreOrcamentos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    preOrcamentos = raw ? JSON.parse(raw) : {};
  } catch (_) {
    preOrcamentos = {};
  }
}

function savePreOrcamentos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preOrcamentos));
  } catch (_) { /* no-op */ }
}

function loadBancoLocal() {
  try {
    const raw = localStorage.getItem(BANCO_STORAGE_KEY);
    if (raw) {
      const local = JSON.parse(raw);
      if (local && Array.isArray(local.itens)) {
        bancoPrecos = local;
        return true;
      }
    }
  } catch (_) { /* no-op */ }
  return false;
}

function saveBancoLocal() {
  try {
    bancoPrecos.updatedAt = new Date().toISOString().slice(0, 10);
    localStorage.setItem(BANCO_STORAGE_KEY, JSON.stringify(bancoPrecos));
    schedulCloudSync();
  } catch (_) { /* no-op */ }
}

// ===== BOOT =====
async function boot() {
  ensureEmpresaContext();
  // 1. Load local data FIRST (instant — no network)
  loadPreOrcamentos();
  loadDescartados();
  loadMestres();
  loadArquivos();
  loadEquivalencias();
  loadConversoes();
  loadDemandas();
  loadEstoque();
  loadListaCompras();
  carregarModulosConfig();
  aplicarAcessoSidebar();

  // Data version check
  const DATA_VERSION = "v5";
  const storedVersion = localStorage.getItem("caixaescolar.data-version");
  if (storedVersion !== DATA_VERSION) {
    localStorage.removeItem("caixaescolar.orcamentos");
    localStorage.setItem("caixaescolar.data-version", DATA_VERSION);
    console.log("[Boot] Wiped old orcamentos data (version upgrade to " + DATA_VERSION + "). Run Varrer SGD to reload.");
  }

  const localOrc = localStorage.getItem("caixaescolar.orcamentos");
  if (localOrc) {
    try {
      const parsed = JSON.parse(localOrc);
      if (Array.isArray(parsed) && parsed.length > 0) {
        orcamentos = parsed;
      }
    } catch (_) { /* ignore */ }
  }

  // Load banco from localStorage if available
  loadBancoLocal();

  // 2. Bind events + render with local data immediately
  populateFilters();
  bindEvents();
  renderAll();

  // 3. Restore active module IMMEDIATELY (no flash of wrong module)
  const savedModule = localStorage.getItem(MODULE_STORAGE_KEY) || "radar";
  switchModule(savedModule);

  // Load empresa data into topbar if saved
  try {
    const empresaData = JSON.parse(localStorage.getItem(EMPRESA_STORAGE_KEY) || "{}");
    const pillSre = document.getElementById("pill-sre");
    const pillFornecedor = document.getElementById("pill-fornecedor");
    if (empresaData.sre && pillSre) pillSre.textContent = empresaData.sre;
    if (empresaData.nome && pillFornecedor) pillFornecedor.textContent = empresaData.nome;
  } catch (_) { /* ignore */ }

  // Mostrar botões SGD em qualquer modo
  if (el.btnCollectSgd) el.btnCollectSgd.style.display = "inline-block";
  const btnVarrer = document.getElementById("btn-varrer-sgd");
  if (btnVarrer) btnVarrer.style.display = "inline-block";

  // 4. Background: load JSON data + cloud sync (non-blocking)
  const [orcData, bancoData, perfilData, ...sreResults] = await Promise.all([
    fetchJson("data/orcamentos.json"),
    fetchJson("data/banco-precos.json"),
    fetchJson("data/perfil.json"),
    ...SRE_CONFIGS.map(c => fetchJson(c.arquivo)),
  ]);

  perfil = perfilData || {};
  // Load all SRE data (Story 4.33)
  allSreData = SRE_CONFIGS.map((c, i) => ({
    ...c,
    data: sreResults[i] || { municipios: [] }
  }));
  // Backward compatibility
  sreData = allSreData[0]?.data || {};

  // Banco: se não tinha no localStorage, carrega do JSON
  if (bancoPrecos.itens.length === 0 && bancoData && Array.isArray(bancoData.itens)) {
    bancoPrecos = bancoData;
    saveBancoLocal();
    renderAll();
  }

  // 5. SGD API check in background (avoid 2s timeout blocking render)
  isSgdApiAvailable().then(available => {
    sgdAvailable = available;
    updateModeIndicator(sgdAvailable);
  }).catch(() => {});

  // 6. Cloud sync — PULL first, THEN push (never overwrite cloud with stale local)
  syncFromCloud().then(synced => {
    if (synced) {
      console.log("[Boot] Cloud data synced to localStorage");
      loadPreOrcamentos();
      loadBancoLocal();
      // Reload orcamentos from freshly-synced localStorage
      const freshOrc = localStorage.getItem("caixaescolar.orcamentos");
      if (freshOrc) { try { orcamentos = JSON.parse(freshOrc); } catch(_) {} }
      renderAll();
    }
    // Only push AFTER pull completes — prevents overwriting cloud with empty data
    return syncToCloud();
  }).then(() => console.log("[Boot] Local data pushed to cloud"))
    .catch(e => console.warn("[Boot] Cloud sync failed:", e));
}

// ===== FILTERS =====
function populateFilters() {
  // Preserve current selections
  const prevSre = el.filtroSre ? el.filtroSre.value : "all";
  const prevEscola = el.filtroEscola.value;
  const prevMun = el.filtroMunicipio.value;
  const prevGrupo = el.filtroGrupo.value;

  // Clear existing options (keep first "all" option)
  [el.filtroSre, el.filtroEscola, el.filtroMunicipio, el.filtroGrupo].filter(Boolean).forEach((sel) => {
    while (sel.options.length > 1) sel.remove(1);
  });

  // SREs (Story 4.33) — populate dynamically from loaded data
  if (el.filtroSre) {
    const sres = [...new Set(orcamentos.map((o) => o.sre).filter(Boolean))].sort();
    sres.forEach((s) => {
      el.filtroSre.appendChild(new Option(s, s));
    });
    if (sres.includes(prevSre)) el.filtroSre.value = prevSre;
  }

  // Escolas
  const escolas = [...new Set(orcamentos.map((o) => o.escola).filter(Boolean))].sort();
  escolas.forEach((e) => {
    el.filtroEscola.appendChild(new Option(e, e));
  });

  // Municípios
  const municipios = [...new Set(orcamentos.map((o) => o.municipio).filter(Boolean))].sort();
  municipios.forEach((m) => {
    el.filtroMunicipio.appendChild(new Option(m, m));
  });

  // Grupos
  const grupos = [...new Set(orcamentos.map((o) => o.grupo).filter(Boolean))].sort();
  grupos.forEach((g) => {
    el.filtroGrupo.appendChild(new Option(g, g));
  });

  // Restore selections if still valid
  if (escolas.includes(prevEscola)) el.filtroEscola.value = prevEscola;
  if (municipios.includes(prevMun)) el.filtroMunicipio.value = prevMun;
  if (grupos.includes(prevGrupo)) el.filtroGrupo.value = prevGrupo;

  // Banco grupos
  if (el.filtroBancoGrupo) {
    while (el.filtroBancoGrupo.options.length > 1) el.filtroBancoGrupo.remove(1);
    const bGrupos = [...new Set(bancoPrecos.itens.map((i) => i.grupo))].sort();
    bGrupos.forEach((g) => {
      el.filtroBancoGrupo.appendChild(new Option(g, g));
    });
  }

  // Modal grupo (todos os grupos do perfil)
  if (el.modalGrupo) {
    while (el.modalGrupo.options.length > 0) el.modalGrupo.remove(0);
    const allGrupos = perfil.config && perfil.config.gruposAtendidos
      ? perfil.config.gruposAtendidos
      : grupos;
    allGrupos.forEach((g) => {
      el.modalGrupo.appendChild(new Option(g, g));
    });
  }
}

function filteredOrcamentos() {
  const sre = el.filtroSre ? el.filtroSre.value : "all";
  const escola = el.filtroEscola.value;
  const mun = el.filtroMunicipio.value;
  const grupo = el.filtroGrupo.value;
  const status = el.filtroStatus.value;
  const query = normalizedText(el.filtroTexto.value.trim());

  return orcamentos
    .filter((o) => sre === "all" || o.sre === sre)
    .filter((o) => escola === "all" || o.escola === escola)
    .filter((o) => mun === "all" || o.municipio === mun)
    .filter((o) => grupo === "all" || o.grupo === grupo)
    .filter((o) => {
      if (status === "com-preorcamento") return !!(preOrcamentos && preOrcamentos[o.id]);
      if (status === "descartados") return isDescartado(o.id);
      return !isDescartado(o.id);
    })
    .filter((o) => {
      if (status === "all" || status === "descartados" || status === "com-preorcamento") return true;
      if (status === "vencido") {
        // Considerar vencido se o status é "vencido" OU se o prazo ja passou
        return o.status === "vencido" || (o.status === "aberto" && o.prazo && daysTo(o.prazo) <= 0);
      }
      if (status === "aberto") {
        // Aberto = status aberto E prazo ainda nao venceu
        return o.status === "aberto" && (!o.prazo || daysTo(o.prazo) > 0);
      }
      return o.status === status;
    })
    .filter((o) => {
      if (!query) return true;
      const text = normalizedText(
        [o.escola, o.municipio, o.grupo, o.objeto, o.id,
          ...(o.itens || []).map((i) => i.nome + " " + i.descricao)
        ].join(" ")
      );
      return text.includes(query);
    })
    .filter((o) => {
      const de = document.getElementById("filtro-data-de")?.value;
      const ate = document.getElementById("filtro-data-ate")?.value;
      if (!de && !ate) return true;
      return dentroDoIntervalo(o.prazo, de, ate);
    })
    .sort((a, b) => {
      // Abertos primeiro, depois por prazo
      if (a.status !== b.status) return a.status === "aberto" ? -1 : 1;
      return (a.prazo || "").localeCompare(b.prazo || "");
    });
}

// ===== RENDER =====
function renderAll() {
  // Limpar campos de busca ao carregar
  if (el.filtroTexto) el.filtroTexto.value = "";
  if (el.filtroBancoTexto) el.filtroBancoTexto.value = "";
  populateFilters();
  renderKPIs();
  renderOrcamentos();
  renderIntel();
  renderPreOrcamentosLista();
  renderBanco();
  renderSgd();
  renderAprovados();
  renderHistorico();
}

function renderKPIs() {
  const abertos = orcamentos.filter((o) => o.status === "aberto" && !isDescartado(o.id));
  const urgentes = abertos.filter((o) => daysTo(o.prazo) <= 3 && daysTo(o.prazo) >= 0 && !(preOrcamentos && preOrcamentos[o.id]));

  // Pré-orçamentos pendentes
  const pendentes = Object.values(preOrcamentos).filter((p) => p.status === "pendente");

  // Faturamento potencial (soma dos pré-orçamentos aprovados)
  const aprovados = Object.values(preOrcamentos).filter((p) => p.status === "aprovado");
  const faturamento = aprovados.reduce((sum, p) => sum + (p.totalGeral || 0), 0);

  // Margem média dos aprovados
  const margens = aprovados.map((p) => p.margemMedia || 0).filter((m) => m > 0);
  const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  if (el.kpiAbertos) el.kpiAbertos.textContent = abertos.length;
  if (el.kpiUrgentes) {
    el.kpiUrgentes.textContent = urgentes.length;
    el.kpiUrgentes.style.color = urgentes.length > 0 ? "#ef4444" : "";
  }
  if (el.kpiPendentes) el.kpiPendentes.textContent = pendentes.length;
  if (el.kpiFaturamento) el.kpiFaturamento.textContent = brl.format(faturamento);
  if (el.kpiMargem) el.kpiMargem.textContent = pct(margemMedia);
}

// ===== INTELIGÊNCIA (Passo 2) =====
function renderIntel() {
  const abertos = orcamentos.filter((o) => o.status === "aberto");

  // Valor total disponível — estimativa baseada em média dos pré-orçamentos existentes
  const preValues = Object.values(preOrcamentos).filter((p) => p.totalGeral > 0);
  const avgPreValue = preValues.length ? preValues.reduce((s, p) => s + p.totalGeral, 0) / preValues.length : 0;
  const valorTotal = preValues.reduce((s, p) => s + p.totalGeral, 0) + (abertos.length - preValues.length) * avgPreValue;
  el.intelValorTotal.textContent = brl.format(valorTotal);

  // Taxa de conversão
  const totalGerados = Object.values(preOrcamentos).length;
  const totalAprovados = Object.values(preOrcamentos).filter((p) => p.status === "aprovado" || p.status === "enviado").length;
  const taxaConversao = totalGerados > 0 ? totalAprovados / totalGerados : 0;
  if (el.intelConversao) el.intelConversao.textContent = pct(taxaConversao);

  // Prazo médio
  const prazoDias = abertos.map((o) => daysTo(o.prazo)).filter((d) => d < 999);
  const prazoMedio = prazoDias.length ? Math.round(prazoDias.reduce((a, b) => a + b, 0) / prazoDias.length) : 0;
  if (el.intelPrazoMedio) el.intelPrazoMedio.textContent = prazoMedio + " dias";

  // Top 5 categorias
  const grupoCounts = {};
  orcamentos.forEach((o) => { grupoCounts[o.grupo] = (grupoCounts[o.grupo] || 0) + 1; });
  const topGrupos = Object.entries(grupoCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxGrupo = topGrupos.length ? topGrupos[0][1] : 1;

  el.intelTopCategorias.innerHTML = topGrupos.map(([grupo, count]) => {
    const widthPct = Math.round((count / maxGrupo) * 100);
    return `<div class="intel-bar-row">
      <span class="intel-bar-label" title="${escapeHtml(grupo)}">${escapeHtml(grupo)}</span>
      <div class="intel-bar-track">
        <div class="intel-bar-fill" style="width:${widthPct}%"></div>
      </div>
      <span class="intel-bar-value">${count}</span>
    </div>`;
  }).join("");

  // Orçamentos por município
  const munCounts = {};
  orcamentos.forEach((o) => { munCounts[o.municipio] = (munCounts[o.municipio] || 0) + 1; });
  const topMun = Object.entries(munCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxMun = topMun.length ? topMun[0][1] : 1;

  el.intelPorMunicipio.innerHTML = topMun.map(([mun, count]) => {
    const widthPct = Math.round((count / maxMun) * 100);
    return `<div class="intel-bar-row">
      <span class="intel-bar-label">${escapeHtml(mun)}</span>
      <div class="intel-bar-track">
        <div class="intel-bar-fill intel-bar-fill-alt" style="width:${widthPct}%"></div>
      </div>
      <span class="intel-bar-value">${count}</span>
    </div>`;
  }).join("");
}

function toggleIntel() {
  const isOpen = el.intelBody.style.display !== "none";
  el.intelBody.style.display = isOpen ? "none" : "block";
  el.intelChevron.textContent = isOpen ? "▶" : "▼";
}

// ===== RENDER ORÇAMENTOS (Passo 1 + 3) =====
function renderOrcamentos() {
  const list = filteredOrcamentos();
  el.orcamentosEmpty.style.display = list.length ? "none" : "block";

  // Limpar seleção de IDs que não estão mais na lista filtrada
  const listIds = new Set(list.map((o) => o.id));
  for (const id of selectedOrcIds) {
    if (!listIds.has(id)) selectedOrcIds.delete(id);
  }

  const viewingDescartados = el.filtroStatus.value === "descartados";

  el.tbodyOrcamentos.innerHTML = list.map((o) => {
    const days = daysTo(o.prazo);
    let statusClass = "badge-aberto";
    let statusLabel = "Aberto";

    if (o.status === "vencido") {
      statusClass = "badge-vencido";
      statusLabel = "Vencido";
    } else if (days <= 3) {
      statusClass = "badge-vencendo";
      statusLabel = days <= 0 ? "Vencido" : `${days}d`;
    }

    // Coluna Entrega (Passo 1)
    const entregaDays = o.prazoEntrega ? daysTo(o.prazoEntrega) : 999;
    const daysBetween = o.prazo && o.prazoEntrega
      ? Math.ceil((new Date(o.prazoEntrega + "T00:00:00") - new Date(o.prazo + "T00:00:00")) / 86400000)
      : 999;
    let entregaBadge = formatDate(o.prazoEntrega);
    if (daysBetween < 30 && daysBetween >= 0) {
      entregaBadge = `<span class="badge badge-warning-soft">${formatDate(o.prazoEntrega)}</span>`;
    }

    // Grupo excluído (Passo 1)
    const excluido = isGrupoExcluido(o.grupo);
    let grupoBadge = escapeGrupo(o.grupo, excluido);

    // Ações
    const preOrc = preOrcamentos[o.id];
    let actionBtn = "";
    if (viewingDescartados) {
      actionBtn = `<button class="btn btn-inline" onclick="restaurarOrc('${o.id}')">Restaurar</button>`;
    } else if (o.status === "aberto") {
      if (excluido) {
        actionBtn = '<span class="badge badge-fora-escopo">Fora do escopo</span>';
      } else if (preOrc) {
        const pBadge = preOrc.status === "ganho"
          ? '<span class="badge badge-ganho">Ganho</span>'
          : preOrc.status === "perdido"
            ? '<span class="badge badge-perdido">Perdido</span>'
            : preOrc.status === "enviado"
              ? '<span class="badge badge-enviado">Enviado</span>'
              : preOrc.status === "aprovado"
                ? '<span class="badge badge-aprovado">Aprovado</span>'
                : preOrc.status === "recusado"
                  ? '<span class="badge badge-recusado">Recusado</span>'
                  : '<span class="badge badge-pendente">Pendente</span>';
        actionBtn = `${pBadge} <button class="btn btn-inline" onclick="abrirPreOrcamento('${o.id}')">Ver</button>`;
      } else {
        actionBtn = `<button class="btn btn-inline btn-accent" onclick="gerarPreOrcamento('${o.id}')">Pré-Orçar</button>`;
      }
      // Botão descartar para abertos sem pré-orçamento e não excluídos
      if (!preOrc && !excluido) {
        actionBtn += ` <button class="btn btn-inline btn-muted" onclick="descartarOrc('${o.id}')" title="Descartar processo">&#10005;</button>`;
      }
    }

    // Checkbox (Passo 3) — só para abertos não excluídos sem pré-orçamento
    const canSelect = o.status === "aberto" && !excluido && !preOrc && !viewingDescartados;
    const checked = selectedOrcIds.has(o.id) ? "checked" : "";
    const checkboxHtml = canSelect
      ? `<input type="checkbox" class="row-check" data-id="${o.id}" ${checked} />`
      : "";

    const trStyle = viewingDescartados ? ' style="opacity:0.6"' : '';
    const objetoDisplay = o.objetoCustom || (o.objeto || "").replace(/\n/g, " ");
    const objetoOriginal = o.objeto || "";
    const isCustom = o.objetoCustom && o.objetoCustom !== objetoOriginal;
    const editIcon = `<span class="btn-inline btn-muted" onclick="event.stopPropagation();editarObjeto('${o.id}')" title="Editar objeto" style="cursor:pointer;font-size:0.7rem;margin-left:4px">&#9998;</span>`;
    const resetIcon = isCustom ? `<span class="btn-inline btn-muted" onclick="event.stopPropagation();resetarObjeto('${o.id}')" title="Restaurar original" style="cursor:pointer;font-size:0.7rem;margin-left:2px">&#8617;</span>` : "";
    const itensResumo = (o.itens && o.itens.length > 0) ? '<br><span style="font-size:0.7rem;color:#666;">' + o.itens.length + ' iten(s): ' + o.itens.slice(0,3).map(i => escapeHtml((i.nome||'').slice(0,20))).join(', ') + (o.itens.length > 3 ? '...' : '') + '</span>' : '';

    return `<tr${trStyle}>
      <td>${checkboxHtml}</td>
      <td class="font-mono text-muted">${escapeHtml(o.id)}</td>
      <td>${escapeHtml(o.escola)}</td>
      <td>${escapeHtml(o.municipio)}</td>
      <td class="obj-cell" title="${escapeHtml(objetoOriginal)}">${escapeHtml(objetoDisplay)}${isCustom ? ' <span class="badge badge-editado" style="font-size:0.6rem">editado</span>' : ''}${resetIcon}${editIcon}${itensResumo}</td>
      <td>${grupoBadge}</td>
      <td class="nowrap">${formatDate(o.prazo)}</td>
      <td class="nowrap">${entregaBadge}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td class="nowrap">${actionBtn}</td>
    </tr>`;
  }).join("");

  // Bind checkboxes
  el.tbodyOrcamentos.querySelectorAll(".row-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedOrcIds.add(cb.dataset.id);
      else selectedOrcIds.delete(cb.dataset.id);
      updateBatchBar();
    });
  });

  updateBatchBar();
}

function escapeGrupo(grupo, excluido) {
  if (excluido) {
    return `${escapeHtml(grupo)} <span class="badge badge-fora-escopo" style="font-size:0.65rem">Excluído</span>`;
  }
  return escapeHtml(grupo);
}

// ===== BATCH OPERATIONS (Passo 3) =====
function updateBatchBar() {
  const count = selectedOrcIds.size;
  if (count > 0) {
    el.batchBar.style.display = "flex";
    el.batchCount.textContent = `${count} selecionado${count > 1 ? "s" : ""}`;
  } else {
    el.batchBar.style.display = "none";
  }

  // Sync select-all checkbox
  const checkboxes = el.tbodyOrcamentos.querySelectorAll(".row-check");
  if (checkboxes.length > 0) {
    const allChecked = [...checkboxes].every((cb) => cb.checked);
    el.selectAll.checked = allChecked;
    el.selectAll.indeterminate = !allChecked && count > 0;
  } else {
    el.selectAll.checked = false;
    el.selectAll.indeterminate = false;
  }
}

function toggleSelectAll() {
  const checkboxes = el.tbodyOrcamentos.querySelectorAll(".row-check");
  const shouldCheck = el.selectAll.checked;
  checkboxes.forEach((cb) => {
    cb.checked = shouldCheck;
    if (shouldCheck) selectedOrcIds.add(cb.dataset.id);
    else selectedOrcIds.delete(cb.dataset.id);
  });
  updateBatchBar();
}

function batchPreOrcar() {
  if (selectedOrcIds.size === 0) return;
  const ids = [...selectedOrcIds];
  let count = 0;

  ids.forEach((orcId) => {
    const orc = orcamentos.find((o) => o.id === orcId);
    if (!orc || isGrupoExcluido(orc.grupo) || preOrcamentos[orcId]) return;

    const margemPadrao = perfil.config ? perfil.config.margemPadrao || 0.30 : 0.30;
    const frete = calcFreteEstimado(orc.municipio);

    const todayStr = new Date().toISOString().slice(0, 10);

    const itens = (orc.itens || []).map((item) => {
      let bp = findBancoItem(item.nome);
      if (!bp) {
        bp = {
          id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
          item: item.nome,
          grupo: orc.grupo || "Material de Consumo Geral",
          unidade: item.unidade || "Unidade",
          custoBase: 0, margemPadrao: margemPadrao, precoReferencia: 0,
          ultimaCotacao: todayStr, fonte: "",
          propostas: [], concorrentes: [], custosFornecedor: [],
        };
        bancoPrecos.itens.push(bp);
      }
      let custoUnit = bp.custoBase;
      if (custoUnit === 0 && (bp.custosFornecedor || []).length > 0) {
        custoUnit = bp.custosFornecedor[bp.custosFornecedor.length - 1].preco;
      }
      const margem = bp.margemPadrao || margemPadrao;
      const precoUnit = custoUnit > 0 ? Math.round(custoUnit * (1 + margem) * 100) / 100 : 0;
      const concorrentes = bp.concorrentes || [];
      const menorConc = concorrentes.length > 0 ? Math.min(...concorrentes.map((c) => c.preco)) : 0;

      return {
        nome: item.nome,
        marca: bp.marca || "",
        descricao: item.descricao || "",
        quantidade: item.quantidade || 0,
        unidade: item.unidade || "Unidade",
        custoUnitario: custoUnit,
        margem: margem,
        precoUnitario: precoUnit,
        precoTotal: Math.round(precoUnit * (item.quantidade || 0) * 100) / 100,
        menorConcorrente: menorConc,
      };
    });

    const totalGeral = itens.reduce((s, i) => s + i.precoTotal, 0);
    const margens = itens.filter((i) => i.custoUnitario > 0).map((i) => i.margem);
    const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : margemPadrao;

    preOrcamentos[orcId] = {
      orcamentoId: orcId,
      escola: orc.escola,
      municipio: orc.municipio,
      grupo: orc.grupo,
      status: "pendente",
      criadoEm: new Date().toISOString().slice(0, 10),
      freteEstimado: frete,
      itens: itens,
      totalGeral: Math.round(totalGeral * 100) / 100,
      margemMedia: margemMedia,
    };
    count++;
  });

  saveBancoLocal();
  savePreOrcamentos();
  selectedOrcIds.clear();
  renderAll();
  alert(`${count} pré-orçamento${count > 1 ? "s" : ""} gerado${count > 1 ? "s" : ""}.`);
}

function batchExportCsv() {
  if (selectedOrcIds.size === 0) return;
  const list = orcamentos.filter((o) => selectedOrcIds.has(o.id));
  const header = "ID;Escola;Municipio;SRE;Objeto;Grupo;Prazo;PrazoEntrega;Status;Itens";
  const rows = list.map((o) => {
    const itensStr = (o.itens || []).map((i) => `${i.nome} (${i.quantidade} ${i.unidade})`).join(" | ");
    return [o.id, o.escola, o.municipio, o.sre, o.objeto, o.grupo, o.prazo, o.prazoEntrega, o.status, itensStr]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
  });
  downloadCsv("orcamentos-selecionados.csv", [header, ...rows].join("\n"));
}

// ===== PRÉ-ORÇAMENTO =====

// Gerar novo pré-orçamento
window.gerarPreOrcamento = function (orcId) {
  const orc = orcamentos.find((o) => o.id === orcId);
  if (!orc) return;

  const margemPadrao = perfil.config ? perfil.config.margemPadrao || 0.30 : 0.30;
  const frete = calcFreteEstimado(orc.municipio);

  const todayStr = new Date().toISOString().slice(0, 10);

  const itens = (orc.itens || []).map((item) => {
    let bp = findBancoItem(item.nome);

    // Auto-create banco entry if item doesn't exist
    if (!bp) {
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        grupo: orc.grupo || "Material de Consumo Geral",
        unidade: item.unidade || "Unidade",
        custoBase: 0,
        margemPadrao: margemPadrao,
        precoReferencia: 0,
        ultimaCotacao: todayStr,
        fonte: "",
        propostas: [],
        concorrentes: [],
        custosFornecedor: [],
      };
      bancoPrecos.itens.push(bp);
    }

    let custoUnit = bp.custoBase;
    // Try fornecedor cost if banco custoBase is 0
    if (custoUnit === 0 && (bp.custosFornecedor || []).length > 0) {
      custoUnit = bp.custosFornecedor[bp.custosFornecedor.length - 1].preco;
    }
    const margem = bp.margemPadrao || margemPadrao;
    const precoUnit = custoUnit > 0 ? Math.round(custoUnit * (1 + margem) * 100) / 100 : 0;
    const concorrentes = bp.concorrentes || [];
    const menorConc = concorrentes.length > 0 ? Math.min(...concorrentes.map((c) => c.preco)) : 0;

    return {
      nome: item.nome,
      marca: bp.marca || "",
      descricao: item.descricao || "",
      quantidade: item.quantidade || 0,
      unidade: item.unidade || "Unidade",
      custoUnitario: custoUnit,
      margem: margem,
      precoUnitario: precoUnit,
      precoTotal: Math.round(precoUnit * (item.quantidade || 0) * 100) / 100,
      idBudgetItem: item.idBudgetItem || null,
      menorConcorrente: menorConc,
    };
  });

  saveBancoLocal(); // Save new banco entries

  const totalGeral = itens.reduce((s, i) => s + i.precoTotal, 0);
  const margens = itens.filter((i) => i.custoUnitario > 0).map((i) => i.margem);
  const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : margemPadrao;

  preOrcamentos[orcId] = {
    orcamentoId: orcId,
    escola: orc.escola,
    municipio: orc.municipio,
    grupo: orc.grupo,
    status: "pendente",
    criadoEm: new Date().toISOString().slice(0, 10),
    freteEstimado: frete,
    itens: itens,
    totalGeral: Math.round(totalGeral * 100) / 100,
    margemMedia: margemMedia,
  };

  savePreOrcamentos();
  abrirPreOrcamento(orcId);
};

// Abrir pré-orçamento existente
window.abrirPreOrcamento = function (orcId) {
  activePreOrcamentoId = orcId;
  const pre = preOrcamentos[orcId];
  if (!pre) return;

  // Switch to tab
  switchTab("pre-orcamento");

  el.preorcamentoVazio.style.display = "none";
  el.preorcamentoForm.style.display = "block";
  el.btnVoltar.style.display = "inline-block";

  el.preorcamentoTitulo.textContent = `Pré-Orçamento #${orcId}`;
  el.preorcamentoEscola.textContent = pre.escola;
  el.preorcamentoMunicipio.textContent = pre.municipio;

  const orc = orcamentos.find((o) => o.id === orcId);
  if (orc && orc.prazo) {
    const dias = daysTo(orc.prazo);
    const dataFmt = formatDate(orc.prazo);
    if (dias < 0) {
      el.preorcamentoPrazo.innerHTML = `<span style="color:#ef4444;font-weight:800;font-size:1.1em">VENCIDO (${dataFmt})</span>`;
    } else if (dias <= 2) {
      el.preorcamentoPrazo.innerHTML = `<span style="background:#fee2e2;color:#dc2626;font-weight:800;padding:4px 10px;border-radius:6px;font-size:1.1em;animation:pulse 1s infinite">URGENTE — ${dataFmt} (${dias === 0 ? "HOJE" : dias === 1 ? "AMANHÃ" : dias + " dias"})</span>`;
    } else if (dias <= 5) {
      el.preorcamentoPrazo.innerHTML = `<span style="background:#fef3c7;color:#b45309;font-weight:700;padding:4px 10px;border-radius:6px">${dataFmt} (${dias} dias restantes)</span>`;
    } else {
      el.preorcamentoPrazo.innerHTML = `<span style="color:#16a34a;font-weight:600">${dataFmt} (${dias} dias)</span>`;
    }
  } else {
    el.preorcamentoPrazo.textContent = "—";
  }

  // Frete real (Passo 1) — mostra valor e km quando disponível
  const frete = pre.freteEstimado || 0;
  let km = 0;
  if (perfil.distancias && perfil.distancias.estimativas) {
    km = perfil.distancias.estimativas[pre.municipio] || 0;
    if (km === 0) {
      const normMun = normalizedText(pre.municipio);
      const entry = Object.entries(perfil.distancias.estimativas).find(
        ([key]) => normalizedText(key) === normMun
      );
      if (entry) km = entry[1];
    }
  }
  if (frete > 0 && km > 0) {
    el.preorcamentoFrete.textContent = `${brl.format(frete)} (${km} km)`;
  } else if (frete > 0) {
    el.preorcamentoFrete.textContent = brl.format(frete);
  } else {
    el.preorcamentoFrete.textContent = "Sem frete (mesmo município)";
  }

  // Status banner for ganho/perdido
  const analiseContainer = document.getElementById("analise-competitiva-container");
  if (analiseContainer) {
    if (pre.status === "ganho") {
      const contratoNum = pre.contratoNumero || "—";
      analiseContainer.innerHTML = `<div style="background:#d1fae5;border:1px solid #10b981;padding:0.75rem;border-radius:8px;margin-bottom:1rem;">
        <strong style="color:#065f46;">CONTRATO GANHO</strong>
        <div style="margin-top:0.3rem;font-size:0.85rem;">
          Contrato: <strong>${escapeHtml(contratoNum)}</strong> | Escola: <strong>${escapeHtml(pre.escola)}</strong> | Valor: <strong>${brl.format(pre.totalGeral)}</strong> | ${pre.itens ? pre.itens.length : 0} itens
        </div>
      </div>`;
    } else if (pre.status === "perdido") {
      analiseContainer.innerHTML = `<div style="background:#fee2e2;border:1px solid #ef4444;padding:0.75rem;border-radius:8px;margin-bottom:1rem;">
        <strong style="color:#991b1b;">PROCESSO PERDIDO</strong>
        <div style="margin-top:0.3rem;font-size:0.85rem;">Escola: ${escapeHtml(pre.escola)} | Valor: ${brl.format(pre.totalGeral)}</div>
      </div>`;
    } else {
      analiseContainer.innerHTML = renderAnaliseCompetitiva(pre);
    }
  }

  renderPreOrcamentoItens();

  // Auto-preencher button (Story 4.29) — show when pre-orcamento is active and editable
  const btnAuto = document.getElementById("btn-auto-preencher");
  if (btnAuto) btnAuto.style.display = (pre.status === "pendente" || pre.status === "aprovado") ? "inline-block" : "none";

  // Botões
  const isPendente = pre.status === "pendente";
  el.btnAprovar.style.display = isPendente ? "inline-block" : "none";
  el.btnRecusar.style.display = isPendente ? "inline-block" : "none";

  // Botão Editar: aparece quando aprovado ou enviado
  const showEditar = pre.status === "aprovado" || pre.status === "enviado";
  el.btnEditarOrcamento.style.display = showEditar ? "inline-block" : "none";

  // Botão SGD: aparece sempre que aprovado (modo local envia API, modo Netlify baixa payload)
  const showSgd = pre.status === "aprovado";
  el.btnEnviarSgd.style.display = showSgd ? "inline-block" : "none";
  el.btnEnviarSgd.textContent = "Enviar ao SGD";

  // Link para aba SGD quando enviado
  const showIrSgd = pre.status === "aprovado" || pre.status === "enviado";
  el.btnIrSgd.style.display = showIrSgd ? "inline-block" : "none";

  // Render SGD extra fields (datas, obs, garantia) — always show for editing
  renderSgdFields();
};

// ===== RENDER PRÉ-ORÇAMENTO ITENS (Passo 5 — PNCP) =====
// Enriquecer itens com sugestão do banco de preços (async)
async function enrichWithBancoPrecos(pre) {
  if (typeof BancoPrecos === "undefined" || !BancoPrecos.isEnabled()) return;
  if (!pre || !pre.itens) return;

  for (const item of pre.itens) {
    if (item._bpLoaded) continue; // skip if already enriched
    try {
      const result = await BancoPrecos.calcularPreco(
        item.nome, item.unidade, item.quantidade,
        pre.escola || "", pre.municipio || ""
      );
      if (result) {
        item._bpHtml = BancoPrecos.precoSugeridoHtml(result);
        item._bpPrecoSugerido = result.preco_sugerido;
        item._bpSemaforo = result.semaforo;
        item._bpLoaded = true;
      }
    } catch (_) { /* silent */ }
  }
}

function renderPreOrcamentoItens() {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  // Trigger async enrichment (updates _bpHtml for next render)
  enrichWithBancoPrecos(pre).then(() => {
    // Re-render only if we got new data
    if (pre.itens.some(i => i._bpHtml && !i._bpRendered)) {
      pre.itens.forEach(i => { if (i._bpHtml) i._bpRendered = true; });
      renderPreOrcamentoItens(); // recursive but stops because _bpRendered is set
    }
  });

  const isEditable = pre.status === "pendente" || pre.status === "aprovado";

  el.tbodyPreorcamento.innerHTML = pre.itens.map((item, idx) => {
    const custoInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${item.custoUnitario}" step="0.01" min="0" onchange="updatePreItem(${idx}, 'custoUnitario', this.value)" />`
      : brl.format(item.custoUnitario);

    const margemInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${(item.margem * 100).toFixed(0)}" step="1" min="0" max="100" onchange="updatePreItem(${idx}, 'margem', this.value)" />`
      : pct(item.margem);

    const precoInput = isEditable
      ? `<input type="number" class="preorcamento-input" value="${item.precoUnitario}" step="0.01" min="0" onchange="updatePreItem(${idx}, 'precoUnitario', this.value)" />`
      : brl.format(item.precoUnitario);

    // PNCP ref (Passo 5) — busca preço de referência no banco
    const bp = findBancoItem(item.nome);
    let pncpHint = "";
    if (bp && bp.precoReferencia > 0) {
      const diff = item.custoUnitario > 0 && bp.custoBase > 0
        ? Math.abs(item.custoUnitario - bp.custoBase) / bp.custoBase
        : 0;
      const diffClass = diff > 0.30 ? "pncp-alert" : "pncp-ok";
      pncpHint = `<span class="pncp-tooltip ${diffClass}" title="Ref. Banco: ${brl.format(bp.precoReferencia)} (custo: ${brl.format(bp.custoBase)})">Ref: ${brl.format(bp.precoReferencia)}</span>`;
    } else if (!bp || bp.custoBase === 0) {
      pncpHint = `<span class="pncp-tooltip" style="color:#f59e0b;font-size:0.7rem" title="Item sem referência no banco de preços. Preencha o custo e ele será salvo automaticamente.">&#9888; Sem ref. no banco</span>`;
    }

    // Competitor intelligence hint — always pull fresh from banco
    let menorConc = item.menorConcorrente || 0;
    if (bp) {
      const concorrentes = bp.concorrentes || [];
      if (concorrentes.length > 0) {
        menorConc = Math.min(...concorrentes.map((c) => c.preco));
        item.menorConcorrente = menorConc; // update in-memory for future use
      }
      // Also show fornecedor cost if available
      const custosForn = bp.custosFornecedor || [];
      if (custosForn.length > 0) {
        const ultimoForn = custosForn[custosForn.length - 1];
        if (item.custoUnitario === 0 && ultimoForn.preco > 0) {
          // Auto-fill custo from supplier if empty
          item.custoUnitario = ultimoForn.preco;
          item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
          item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
        }
      }
    }
    let concHint = "";
    if (menorConc > 0) {
      const concClass = item.precoUnitario <= menorConc ? "pncp-ok" : "pncp-alert";
      concHint = `<span class="pncp-tooltip ${concClass}" title="Menor preço concorrente registrado">Concorrente: ${brl.format(menorConc)}</span>`;
    }
    // Fornecedor cost hint
    let fornHint = "";
    if (bp && (bp.custosFornecedor || []).length > 0) {
      const ultimoForn = bp.custosFornecedor[bp.custosFornecedor.length - 1];
      fornHint = `<span class="pncp-tooltip pncp-ok" title="Custo ${ultimoForn.fornecedor}: ${brl.format(ultimoForn.preco)} em ${ultimoForn.data}">Forn: ${brl.format(ultimoForn.preco)}</span>`;
    }

    const marcaVal = item.marca || (bp ? bp.marca || "" : "");
    const marcaInput = isEditable
      ? `<input type="text" class="preorcamento-input" value="${escapeHtml(marcaVal)}" placeholder="Marca" style="width:80px" onchange="updatePreItem(${idx}, 'marca', this.value)" />`
      : escapeHtml(marcaVal);

    // Botão pesquisar preço (Story 4.30+)
    const searchBtn = isEditable
      ? `<div class="search-preco-wrap" style="margin-top:4px;">
          <button class="btn btn-inline btn-sm" onclick="toggleSearchMenu(${idx})" title="Pesquisar preço" style="font-size:0.7rem;padding:2px 6px;">🔍 Pesquisar</button>
          <div id="search-menu-${idx}" class="search-menu" style="display:none;position:absolute;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:100;padding:4px 0;min-width:180px;">
            <a href="#" onclick="pesquisarPrecoPNCP(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">📋 PNCP (Preço de Referência)</a>
            <a href="#" onclick="pesquisarPrecoGoogle(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">🔎 Google Shopping</a>
            <a href="#" onclick="pesquisarPrecoBanco(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">💰 Banco de Preços</a>
            <a href="#" onclick="pesquisarPrecoMercadoLivre(${idx});return false;" style="display:block;padding:6px 12px;text-decoration:none;color:#333;font-size:0.8rem;">🛒 Mercado Livre</a>
          </div>
        </div>`
      : "";

    // Equivalência de produto (Story 4.35)
    const equivSku = getEquivalencia(item.nome);
    const equivProd = equivSku ? getProdutoBySku(equivSku) : null;
    let equivHint = "";
    if (equivSku && equivProd) {
      equivHint = `<br><span style="font-size:0.72rem;color:#059669;" title="SKU: ${escapeHtml(equivSku)}">&#10003; Produto: ${escapeHtml(equivProd.nomeComercial || equivProd.item)}</span> <button class="btn btn-inline" onclick="abrirModalVincular('${escapeHtml(activePreOrcamentoId)}', ${idx})" style="font-size:0.65rem;padding:1px 4px;color:#6b7280;" title="Alterar vínculo">&#9998;</button>`;
    } else if (equivSku) {
      equivHint = `<br><span style="font-size:0.72rem;color:#059669;">&#10003; Vinculado: ${escapeHtml(equivSku)}</span> <button class="btn btn-inline" onclick="abrirModalVincular('${escapeHtml(activePreOrcamentoId)}', ${idx})" style="font-size:0.65rem;padding:1px 4px;color:#6b7280;" title="Alterar vínculo">&#9998;</button>`;
    } else if (pre.status === "ganho") {
      equivHint = `<br><button class="btn btn-inline" onclick="abrirModalVincular('${escapeHtml(activePreOrcamentoId)}', ${idx})" style="font-size:0.7rem;padding:2px 8px;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;border-radius:4px;">Vincular Produto</button>`;
    }

    return `<tr>
      <td>
        <strong>${escapeHtml(item.nome)}</strong>
        <br><span class="text-muted" style="font-size:0.75rem">${escapeHtml(item.descricao)}</span>
        <br><span class="text-muted" style="font-size:0.72rem">${item.quantidade} ${escapeHtml(item.unidade)}</span>
        ${pncpHint}
        ${concHint}
        ${fornHint}
        ${item._bpHtml || ""}
        ${equivHint}
        ${searchBtn}
      </td>
      <td>${marcaInput}</td>
      <td class="text-right">${item.quantidade}</td>
      <td class="text-right">${custoInput}</td>
      <td class="text-right">${margemInput}</td>
      <td class="text-right font-mono">${precoInput}</td>
      <td class="text-right font-mono">${brl.format(item.precoTotal)}</td>
    </tr>`;
  }).join("");

  el.preorcamentoTotal.textContent = brl.format(pre.totalGeral);
  el.preorcamentoMargemMedia.textContent = pct(pre.margemMedia);
}

// Atualizar item do pré-orçamento
window.updatePreItem = function (idx, field, value) {
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;

  const item = pre.itens[idx];

  if (field === "marca") {
    const oldMarca = (item.marca || "").trim();
    item.marca = value.trim();
    // Sync marca to banco
    let bp = findBancoItem(item.nome);
    if (bp) {
      bp.marca = item.marca;
      saveBancoLocal();
    }
    // Atualizar observação: remover marca antiga e inserir nova
    let obs = (item.observacao || item.descricao || item.nome || "").trim();
    if (oldMarca) obs = obs.replace(`[Marca: ${oldMarca}] `, "").replace(`[Marca: ${oldMarca}]`, "").trim();
    item.observacao = item.marca ? `[Marca: ${item.marca}] ${obs}` : obs;
    // Atualizar textarea se visível na aba Envio SGD
    const obsEl = document.getElementById(`sgd-obs-${idx}`);
    if (obsEl) obsEl.value = item.observacao;
    savePreOrcamentos();
    return;
  }

  if (field === "custoUnitario") {
    item.custoUnitario = Math.max(0, parseFloat(value) || 0);
    item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
  } else if (field === "margem") {
    item.margem = Math.max(0, Math.min(1, (parseFloat(value) || 0) / 100));
    item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
  } else if (field === "precoUnitario") {
    item.precoUnitario = Math.max(0, parseFloat(value) || 0);
    // Recalcular margem com base no preco manual
    if (item.custoUnitario > 0) {
      item.margem = Math.round(((item.precoUnitario / item.custoUnitario) - 1) * 100) / 100;
    }
  }

  item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;

  // Recalcular totais
  pre.totalGeral = Math.round(pre.itens.reduce((s, i) => s + i.precoTotal, 0) * 100) / 100;
  const margens = pre.itens.filter((i) => i.custoUnitario > 0).map((i) => i.margem);
  pre.margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  // Auto-feed banco de preços with custoBase when user fills in cost
  if (field === "custoUnitario" && item.custoUnitario > 0) {
    let bp = findBancoItem(item.nome);
    if (!bp) {
      // Auto-create banco entry
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        marca: item.marca || "",
        grupo: pre.grupo || "Material de Consumo Geral",
        unidade: item.unidade || "Unidade",
        custoBase: 0, margemPadrao: item.margem || 0.30, precoReferencia: 0,
        ultimaCotacao: "", fonte: "",
        propostas: [], concorrentes: [], custosFornecedor: [],
      };
      bancoPrecos.itens.push(bp);
    }
    bp.custoBase = item.custoUnitario;
    bp.precoReferencia = Math.round(bp.custoBase * (1 + bp.margemPadrao) * 100) / 100;
    bp.ultimaCotacao = new Date().toISOString().slice(0, 10);
    saveBancoLocal();
  }

  savePreOrcamentos();
  // Defer innerHTML replacement to avoid destroying the active input mid-blur
  requestAnimationFrame(() => {
    renderPreOrcamentoItens();
    renderKPIs();
  });
};

// Aprovar pré-orçamento
function aprovarPreOrcamento() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  // Validar: todos os itens precisam ter preco > 0 (custo OU preco direto)
  const semPreco = pre.itens.filter((i) => i.precoUnitario <= 0);
  if (semPreco.length > 0) {
    alert("Preencha o preço unitário de todos os itens antes de aprovar.");
    return;
  }

  // Save SGD fields (dates, obs, garantia) before approving
  saveSgdFieldsToPreOrcamento(pre);

  pre.status = "aprovado";
  pre.aprovadoEm = new Date().toISOString().slice(0, 10);

  // Auto-feed propostas to banco de precos
  const todayStr = new Date().toISOString().slice(0, 10);
  (pre.itens || []).forEach((item) => {
    let bp = findBancoItem(item.nome);
    if (!bp) {
      // Create new banco item
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        grupo: pre.grupo || "",
        unidade: item.unidade || "Unidade",
        custoBase: item.custoUnitario,
        margemPadrao: item.margem || 0.30,
        precoReferencia: item.precoUnitario,
        ultimaCotacao: todayStr,
        fonte: "",
        propostas: [],
        concorrentes: [],
        custosFornecedor: [],
      };
      bancoPrecos.itens.push(bp);
    }
    if (!bp.propostas) bp.propostas = [];
    bp.propostas.push({
      edital: pre.orcamentoId,
      escola: pre.escola,
      preco: item.precoUnitario,
      data: todayStr,
      resultado: "pendente",
    });
  });
  saveBancoLocal();

  savePreOrcamentos();

  renderPreOrcamentoItens();
  renderKPIs();
  renderOrcamentos();
  renderIntel();

  el.btnAprovar.style.display = "none";
  el.btnRecusar.style.display = "none";
  el.btnEditarOrcamento.style.display = "inline-block";
  el.btnEnviarSgd.style.display = "inline-block";
  el.btnEnviarSgd.textContent = "Enviar ao SGD";
  el.btnIrSgd.style.display = "inline-block";
}

// Recusar pré-orçamento
function recusarPreOrcamento() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre) return;

  pre.status = "recusado";
  savePreOrcamentos();

  renderPreOrcamentoItens();
  renderKPIs();
  renderOrcamentos();
  renderIntel();

  el.btnAprovar.style.display = "none";
  el.btnRecusar.style.display = "none";
}

// Voltar (fechar pré-orçamento)
function voltarPreOrcamento() {
  activePreOrcamentoId = null;
  el.preorcamentoForm.style.display = "none";
  el.btnVoltar.style.display = "none";
  el.preorcamentoVazio.style.display = "none";
  el.preorcamentosLista.style.display = "block";
  el.preorcamentoTitulo.textContent = "Pré-Orçamentos Salvos";
  // Hide auto-preencher button (Story 4.29)
  const btnAuto = document.getElementById("btn-auto-preencher");
  if (btnAuto) btnAuto.style.display = "none";
  // Clear competitive analysis (Story 4.29)
  const analiseContainer = document.getElementById("analise-competitiva-container");
  if (analiseContainer) analiseContainer.innerHTML = "";
  renderPreOrcamentosLista();
}

// Lista de pré-orçamentos salvos
function renderPreOrcamentosLista() {
  const items = Object.values(preOrcamentos);

  if (items.length === 0) {
    el.preorcamentosLista.style.display = "none";
    if (!activePreOrcamentoId) {
      el.preorcamentoVazio.style.display = "block";
    }
    return;
  }

  if (!activePreOrcamentoId) {
    el.preorcamentoVazio.style.display = "none";
    el.preorcamentosLista.style.display = "block";
    el.preorcamentoTitulo.textContent = "Pré-Orçamentos Salvos";
  }

  // Story 4.40: populate escola dropdown
  const fPreEscola = document.getElementById("filtro-pre-escola");
  if (fPreEscola && fPreEscola.options.length <= 1) {
    const escolas = [...new Set(items.map(p => p.escola).filter(Boolean))].sort();
    escolas.forEach(e => { const o = document.createElement("option"); o.value = e; o.textContent = e; fPreEscola.appendChild(o); });
  }

  // Story 4.40: apply filters
  const fPreStatus = document.getElementById("filtro-pre-status")?.value || "all";
  const fPreTexto = normalizedText(document.getElementById("filtro-pre-texto")?.value?.trim() || "");
  const fPreEscolaVal = fPreEscola ? fPreEscola.value : "all";

  let filtered = items;
  if (fPreEscolaVal !== "all") filtered = filtered.filter(p => p.escola === fPreEscolaVal);
  if (fPreStatus !== "all") filtered = filtered.filter(p => p.status === fPreStatus);
  if (fPreTexto) filtered = filtered.filter(p => normalizedText([p.escola, p.municipio, p.orcamentoId, ...(p.itens || []).map(i => i.nome)].join(" ")).includes(fPreTexto));

  const sorted = filtered.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  el.tbodyPreorcamentosLista.innerHTML = sorted
    .map((p) => {
      const badgeClass = p.status === "ganho" ? "badge-ganho"
        : p.status === "perdido" ? "badge-perdido"
          : p.status === "enviado" ? "badge-enviado"
            : p.status === "aprovado" ? "badge-aprovado"
              : p.status === "recusado" ? "badge-recusado" : "badge-pendente";
      const checkbox = `<input type="checkbox" class="pre-lote-check" data-id="${p.orcamentoId}" />`;
      // Story 4.42: items summary with fallback to objeto
      const orc = orcamentos.find(o => o.id === p.orcamentoId);
      const iSummary = getItemsSummary(p) || getItemsSummary(orc || {}) || escapeHtml((orc?.objeto || "").replace(/\n/g, " ").slice(0, 60));
      const iTooltip = escapeHtml((orc?.objeto || "").replace(/\n/g, " ").slice(0, 200));
      return `<tr>
        <td>${checkbox}</td>
        <td class="font-mono text-muted">${escapeHtml(p.orcamentoId)}</td>
        <td>${escapeHtml(p.escola)}</td>
        <td title="${iTooltip}" style="font-size:0.8rem;max-width:200px;">${iSummary}</td>
        <td><span class="badge ${badgeClass}">${p.status}</span></td>
        <td class="text-right font-mono">${brl.format(p.totalGeral || 0)}</td>
        <td class="nowrap">${(() => { const dias = orc ? daysTo(orc.prazo) : 999; return dias < 0 ? '<span style="color:#ef4444;font-weight:700">VENCIDO</span>' : dias <= 2 ? '<span style="color:#dc2626;font-weight:800;background:#fee2e2;padding:2px 6px;border-radius:4px">' + (dias === 0 ? 'HOJE' : dias === 1 ? 'AMANHÃ' : dias + 'd') + '</span>' : dias <= 5 ? '<span style="color:#b45309;font-weight:600">' + dias + ' dias</span>' : formatDate(orc?.prazo || p.criadoEm); })()}</td>
        <td>
          <button class="btn btn-inline" onclick="abrirPreOrcamento('${p.orcamentoId}')">Ver</button>
          ${(p.status === "ganho" || p.status === "perdido" || p.status === "enviado") ? `<button class="btn btn-inline" onclick="editarResultadoPreOrcamento('${p.orcamentoId}')" title="Alterar resultado">Editar Resultado</button>` : ""}
          ${p.status === "enviado" ? `<button class="btn btn-inline" onclick="checarStatusSgd('${p.orcamentoId}')" title="Consultar resultado no SGD" style="color:#3b82f6">Checar SGD</button>` : ""}
          <button class="btn btn-inline btn-danger" onclick="removerPreOrcamento('${p.orcamentoId}')">Excluir</button>
        </td>
      </tr>`;
    }).join("");

  // Barra de ações em lote
  let barHtml = document.getElementById("pre-lote-bar");
  if (!barHtml) {
    barHtml = document.createElement("div");
    barHtml.id = "pre-lote-bar";
    barHtml.style.cssText = "display:none;padding:0.5rem 1rem;background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;margin-bottom:0.75rem;align-items:center;gap:0.75rem;flex-wrap:wrap;";
    barHtml.innerHTML = `<span id="pre-lote-count" style="font-weight:600;">0 selecionados</span>
      <button class="btn btn-sm btn-danger" onclick="excluirPreLote()">Excluir Selecionados</button>
      <button class="btn btn-sm btn-accent" onclick="gerarContratoUnificado()">Gerar Contrato Unificado</button>`;
    el.tbodyPreorcamentosLista.parentElement.parentElement.insertBefore(barHtml, el.tbodyPreorcamentosLista.parentElement);
  }

  // Bind checkboxes
  function updatePreLoteBar() {
    const checked = el.tbodyPreorcamentosLista.querySelectorAll(".pre-lote-check:checked");
    const bar = document.getElementById("pre-lote-bar");
    const count = document.getElementById("pre-lote-count");
    if (bar) bar.style.display = checked.length > 0 ? "flex" : "none";
    if (count) count.textContent = `${checked.length} selecionado(s)`;
  }
  el.tbodyPreorcamentosLista.querySelectorAll(".pre-lote-check").forEach(cb => {
    cb.addEventListener("change", updatePreLoteBar);
  });
}

window.removerPreOrcamento = function (orcId) {
  if (!confirm("Remover este pré-orçamento?")) return;
  delete preOrcamentos[orcId];
  savePreOrcamentos();
  renderAll();
  voltarPreOrcamento();
};

window.excluirPreLote = function() {
  const checked = document.querySelectorAll(".pre-lote-check:checked");
  if (checked.length === 0) return;
  if (!confirm(`Excluir ${checked.length} pré-orçamento(s)?`)) return;
  [...checked].forEach(cb => { delete preOrcamentos[cb.dataset.id]; });
  savePreOrcamentos();
  renderAll();
  voltarPreOrcamento();
  showToast(`${checked.length} pré-orçamento(s) excluído(s).`);
};

// Banco de Precos CRUD (openBancoModal, closeBancoModal, salvarBancoItem,
// updateBancoSelectionUI, excluirSelecionadosBanco, editarBancoItem,
// removerBancoItem, limparBanco) moved to app-banco.js

// ===== EXPORT CSV =====
function exportCsvOrcamentos() {
  const list = filteredOrcamentos();
  const header = "ID;Escola;Municipio;SRE;Objeto;Grupo;Prazo;PrazoEntrega;Status;Itens";
  const rows = list.map((o) => {
    const itensStr = (o.itens || []).map((i) => `${i.nome} (${i.quantidade} ${i.unidade})`).join(" | ");
    return [o.id, o.escola, o.municipio, o.sre, o.objeto, o.grupo, o.prazo, o.prazoEntrega, o.status, itensStr]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
  });
  downloadCsv("orcamentos-sre-uberaba.csv", [header, ...rows].join("\n"));
}

function exportCsvBanco() {
  const list = filteredBanco();
  const header = "Item;Grupo;Unidade;CustoBase;Margem;PrecoRef;UltimaCotacao;Fonte";
  const rows = list.map((i) => {
    return [i.item, i.grupo, i.unidade, i.custoBase, (i.margemPadrao * 100).toFixed(0) + "%", i.precoReferencia, i.ultimaCotacao, i.fonte || ""]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
  });
  downloadCsv("banco-precos.csv", [header, ...rows].join("\n"));
}

function downloadCsv(filename, content) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Module navigation, config panel, bank accounts, NF config, and bank API config
// moved to app-config.js (loaded before app.js in index.html)


// ===== TABS =====
window.switchTab = function switchTab(tabId) {
  document.querySelectorAll("#tabs-intel-precos .tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  // Hide all tab-contents except config
  document.querySelectorAll(".tab-content").forEach((tc) => {
    if (tc.id !== "config-panel") tc.classList.remove("active");
  });
  const target = document.getElementById("tab-" + tabId);
  if (target) target.classList.add("active");
  // Re-render tab content on switch
  if (tabId === "envio-sgd") renderSgd();
  if (tabId === "aprovados") renderAprovados();
  if (tabId === "historico") renderHistorico();
  if (tabId === "pre-orcamento" && !activePreOrcamentoId) renderPreOrcamentosLista();
}

// ===== EVENTS =====
function bindEvents() {
  // Sidebar module navigation
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchModule(item.dataset.module);
    });
  });

  // Sidebar toggle (mobile)
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

  // Config tabs
  document.querySelectorAll(".config-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".config-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".config-content").forEach((c) => c.classList.remove("active"));
      const target = document.getElementById("config-" + tab.dataset.configTab);
      if (target) target.classList.add("active");
    });
  });

  // Config save
  const btnCfgSalvar = document.getElementById("btn-cfg-salvar");
  if (btnCfgSalvar) btnCfgSalvar.addEventListener("click", saveConfigEmpresa);
  const btnAddUsuario = document.getElementById("btn-add-usuario");
  if (btnAddUsuario) btnAddUsuario.addEventListener("click", addUsuario);
  const btnSalvarNf = document.getElementById("btn-salvar-notas-fiscais");
  if (btnSalvarNf) btnSalvarNf.addEventListener("click", saveNotaFiscalConfig);
  const btnSalvarConta = document.getElementById("btn-salvar-conta-bancaria");
  if (btnSalvarConta) btnSalvarConta.addEventListener("click", saveBankAccount);
  const btnLimparConta = document.getElementById("btn-limpar-conta-bancaria");
  if (btnLimparConta) btnLimparConta.addEventListener("click", clearBankAccountForm);
  const btnSalvarBankApi = document.getElementById("btn-salvar-bank-api");
  if (btnSalvarBankApi) btnSalvarBankApi.addEventListener("click", saveBankApiConfig);
  const btnTestarBankApi = document.getElementById("btn-testar-bank-api");
  if (btnTestarBankApi) btnTestarBankApi.addEventListener("click", testBankApiConfig);
  const btnProvisionarBankWebhook = document.getElementById("btn-provisionar-bank-webhook");
  if (btnProvisionarBankWebhook) btnProvisionarBankWebhook.addEventListener("click", provisionBankWebhook);

  // Tab navigation (Intel. Preços sub-tabs)
  document.querySelectorAll("#tabs-intel-precos .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Filtros orçamentos
  if (el.filtroSre) el.filtroSre.addEventListener("change", renderOrcamentos);
  el.filtroEscola.addEventListener("change", renderOrcamentos);
  el.filtroMunicipio.addEventListener("change", renderOrcamentos);
  el.filtroGrupo.addEventListener("change", renderOrcamentos);
  el.filtroStatus.addEventListener("change", renderOrcamentos);
  el.filtroTexto.addEventListener("input", renderOrcamentos);

  // Filtros banco
  el.filtroBancoGrupo.addEventListener("change", renderBanco);
  el.filtroBancoTexto.addEventListener("input", renderBanco);

  // Pré-orçamento actions
  el.btnAprovar.addEventListener("click", aprovarPreOrcamento);
  el.btnRecusar.addEventListener("click", recusarPreOrcamento);
  el.btnVoltar.addEventListener("click", voltarPreOrcamento);

  // Banco actions
  el.btnAddPreco.addEventListener("click", () => openBancoModal(null));
  el.btnModalSalvar.addEventListener("click", salvarBancoItem);
  el.btnModalCancelar.addEventListener("click", closeBancoModal);
  el.btnLimparBanco.addEventListener("click", limparBanco);

  // Itens Mestres (Story 4.26)
  const btnMestres = document.getElementById("btn-itens-mestres");
  if (btnMestres) btnMestres.addEventListener("click", openMestresModal);
  const btnMestresFechar = document.getElementById("btn-mestres-fechar");
  if (btnMestresFechar) btnMestresFechar.addEventListener("click", closeMestresModal);
  const filtroMestres = document.getElementById("filtro-mestres");
  if (filtroMestres) filtroMestres.addEventListener("input", renderMestresModal);
  const modalMestres = document.getElementById("modal-mestres");
  if (modalMestres) modalMestres.addEventListener("click", (e) => {
    if (e.target === modalMestres) closeMestresModal();
  });

  // Timeline modal (Story 4.27)
  const btnTimelineFechar = document.getElementById("btn-timeline-fechar");
  if (btnTimelineFechar) btnTimelineFechar.addEventListener("click", closeTimeline);
  const modalTimeline = document.getElementById("modal-timeline");
  if (modalTimeline) modalTimeline.addEventListener("click", (e) => {
    if (e.target === modalTimeline) closeTimeline();
  });

  // Banco intelligence panel toggle (Story 4.28)
  const bancoIntelToggle = document.getElementById("banco-intel-toggle");
  if (bancoIntelToggle) {
    bancoIntelToggle.addEventListener("click", () => {
      const body = document.getElementById("banco-intel-body");
      const chevron = document.getElementById("banco-intel-chevron");
      if (body) {
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        if (chevron) chevron.textContent = open ? "\u25BC" : "\u25B2";
        if (!open) renderBancoIntel();
      }
    });
  }

  // Auto-preencher button (Story 4.29)
  const btnAutoPreencher = document.getElementById("btn-auto-preencher");
  if (btnAutoPreencher) btnAutoPreencher.addEventListener("click", autoPreencherPreOrcamento);

  // Modal overlay click to close
  el.modalBanco.addEventListener("click", (e) => {
    if (e.target === el.modalBanco) closeBancoModal();
  });

  // Export
  el.btnExportCsv.addEventListener("click", exportCsvOrcamentos);
  el.btnExportBanco.addEventListener("click", exportCsvBanco);

  // Import Excel
  el.btnImportExcel.addEventListener("click", openImportDialog);
  el.importFileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleExcelUpload(e.target.files[0]);
  });
  el.btnImportConfirmar.addEventListener("click", mergeImportIntoBanco);
  el.btnImportCancelar.addEventListener("click", closeImportModal);
  el.modalImport.addEventListener("click", (e) => {
    if (e.target === el.modalImport) closeImportModal();
  });

  // Editar orçamento aprovado
  el.btnEditarOrcamento.addEventListener("click", editarOrcamentoAprovado);

  // SGD
  el.btnEnviarSgd.addEventListener("click", enviarParaSgd);

  // Select all (Passo 3)
  el.selectAll.addEventListener("change", toggleSelectAll);

  // Batch actions (Passo 3)
  el.btnBatchPreorcar.addEventListener("click", batchPreOrcar);
  el.btnBatchExport.addEventListener("click", batchExportCsv);

  // Batch descartar (Story 4.25)
  const btnBatchDescartar = document.getElementById("btn-batch-descartar");
  if (btnBatchDescartar) btnBatchDescartar.addEventListener("click", descartarSelecionados);

  // Inteligência toggle (Passo 2)
  el.intelToggle.addEventListener("click", toggleIntel);

  // Varredura SGD (Fase 4)
  el.btnCollectSgd.addEventListener("click", varrerSgd);
  const btnVarrer = document.getElementById("btn-varrer-sgd");
  if (btnVarrer) btnVarrer.addEventListener("click", varrerSgd);

  // SGD Tab
  el.btnSgdEnviarTodos.addEventListener("click", sgdEnviarTodos);
  el.btnSgdBaixarTodos.addEventListener("click", sgdBaixarTodos);

  // Filtros SGD
  ["filtro-sgd-escola", "filtro-sgd-municipio", "filtro-sgd-status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderSgd);
  });
  const fSgdTexto = document.getElementById("filtro-sgd-texto");
  if (fSgdTexto) fSgdTexto.addEventListener("input", renderSgd);

  // Story 4.40: Date filters for Radar
  ["filtro-data-de", "filtro-data-ate"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderOrcamentos);
  });

  // Story 4.40: Date filters for SGD
  ["filtro-sgd-data-de", "filtro-sgd-data-ate"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderSgd);
  });

  // Story 4.40: Filters for Pré-Orçamento list
  ["filtro-pre-escola", "filtro-pre-status"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderPreOrcamentosLista);
  });
  const fPreTexto = document.getElementById("filtro-pre-texto");
  if (fPreTexto) fPreTexto.addEventListener("input", renderPreOrcamentosLista);

  // Story 4.40: Filters for Aprovados
  ["filtro-aprov-status"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderAprovados);
  });
  const fAprovTexto = document.getElementById("filtro-aprov-texto");
  if (fAprovTexto) fAprovTexto.addEventListener("input", renderAprovados);

  // Story 4.40: Filters for Histórico
  ["filtro-hist-escola"].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener("change", renderHistorico);
  });
  const fHistTexto = document.getElementById("filtro-hist-texto");
  if (fHistTexto) fHistTexto.addEventListener("input", renderHistorico);

  // Keyboard: Escape fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const vincularModal = document.getElementById("modal-vincular-produto");
      if (vincularModal && vincularModal.style.display !== "none") fecharModalVincular();
      else if (document.getElementById("modal-mestres")?.style.display !== "none") closeMestresModal();
      else if (el.modalImport.style.display !== "none") closeImportModal();
      else if (el.modalBanco.style.display !== "none") closeBancoModal();
    }
  });
}

// Import Engine (UNIT_CONVERSIONS, parseUnitConversion, importData,
// openImportDialog, handleExcelUpload, handlePdfUpload, handleScannedPdfOcr,
// handleDocxUpload, handleImageOcr, parseOcrTextToTable, showFormatBadge,
// detectMapaApuracao, handleMapaApuracao, previewMapaApuracao,
// autoDetectColumns, previewImportData, closeImportModal,
// parsePriceValue, mergeImportIntoBanco, mergeMapaIntoBanco) moved to app-import.js

// (browserSgdSubmit, sgdEnviarTodos, sgdBaixarTodos, varrerSgd, coletarSgd,
// showToast, saveSgdFieldsToPreOrcamento, renderSgdFields,
// abrirModalResultado, selectResultado, fecharModalResultado, salvarResultado,
// checarStatusSgd, editarResultadoPreOrcamento,
// gerarContratoDeResultado, criarContratoGdp, gerarContratoUnificado,
// alimentarBancoComResultado, renderAprovados, verContrato, registrarEntrega,
// renderHistorico, switchHistoricoTab, renderHistoricoContent) moved to app-sgd-integration.js and app-results.js
// (SGD integration + results code extracted to app-sgd-integration.js and app-results.js)


// ===== F5: AI IMPORT =====
window.importarComIA = async function () {
  // Trigger file input
  const input = document.getElementById("import-file-input");
  if (!input) return;

  const file = input.files && input.files[0];
  if (!file) {
    // If no file yet, trigger the file picker with a flag
    input._aiMode = true;
    input.click();
    return;
  }

  await processAIImport(file);
};

async function processAIImport(file) {
  const btnAI = document.getElementById("btn-import-ai");
  if (btnAI) { btnAI.disabled = true; btnAI.textContent = "Analisando com IA..."; }

  try {
    // Extract text based on file type
    let textoExtraido = "";
    const ext = file.name.split(".").pop().toLowerCase();

    if (["xlsx", "xls", "csv"].includes(ext)) {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      textoExtraido = XLSX.utils.sheet_to_csv(ws, { FS: "|" });
    } else if (ext === "pdf") {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument(data).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textoExtraido += content.items.map(item => item.str).join(" ") + "\n";
      }
    } else if (["jpg", "jpeg", "png"].includes(ext)) {
      const result = await Tesseract.recognize(file, "por", {
        logger: m => {
          if (m.status === "recognizing text" && m.progress) {
            if (btnAI) btnAI.textContent = `OCR ${Math.round(m.progress * 100)}%...`;
          }
        }
      });
      textoExtraido = result.data.text;
    } else if (["docx", "doc"].includes(ext)) {
      const data = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: data });
      textoExtraido = result.value;
    }

    if (textoExtraido.trim().length < 10) throw new Error("Não foi possível extrair texto suficiente do arquivo.");

    if (btnAI) btnAI.textContent = "Enviando para IA...";
    const fornecedor = prompt("Nome do fornecedor (opcional):") || "";

    const resp = await fetch("/.netlify/functions/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: textoExtraido, formato: ext, fornecedor }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro no servidor");

    const itens = data.itens || [];
    if (itens.length === 0) throw new Error("IA não identificou itens na tabela.");

    // Match with existing banco
    const matchResult = matchAIResultWithBanco(itens);

    // Show preview in import modal
    const modal = document.getElementById("modal-import");
    document.getElementById("import-filename").textContent = file.name + " (IA)";
    const fmtBadge = document.getElementById("import-format-badge");
    if (fmtBadge) { fmtBadge.textContent = "AI Parse"; fmtBadge.style.display = "inline"; }

    // Build preview table
    const thead = document.getElementById("thead-import-preview");
    const tbody = document.getElementById("tbody-import-preview");
    thead.innerHTML = "<tr><th>Status</th><th>Item</th><th>Marca</th><th>Un</th><th>Preço</th><th>Categoria</th></tr>";
    tbody.innerHTML = itens.map(item => {
      const matched = matchResult.matched.find(m => m.ai === item);
      const ambig = matchResult.ambiguous.find(m => m.ai === item);
      let status = '<span class="badge badge-ok">Novo</span>';
      if (matched) status = '<span class="badge badge-aprovado">Match</span>';
      else if (ambig) status = '<span class="badge badge-enviado">Parcial</span>';
      return `<tr><td>${status}</td><td>${escapeHtml(item.nome || "")}</td><td>${escapeHtml(item.marca || "")}</td><td>${escapeHtml(item.unidade || "")}</td><td class="font-mono">${item.preco ? brl.format(item.preco) : "—"}</td><td>${escapeHtml(item.categoria || "")}</td></tr>`;
    }).join("");

    // Stats
    const statsEl = document.getElementById("import-stats");
    if (statsEl) {
      statsEl.style.display = "block";
      statsEl.innerHTML = `<div style="padding:8px;background:var(--bg);border-radius:6px;font-size:0.82rem;">
        <strong>IA identificou ${itens.length} itens</strong> |
        Match: ${matchResult.matched.length} | Parcial: ${matchResult.ambiguous.length} | Novos: ${matchResult.new.length} |
        Tokens: ${data.tokens_usados} | Custo: ~$${data.custo_estimado} | Fornecedor: ${data.fornecedor || "—"}
      </div>`;
    }

    // Store for confirm
    window._aiImportData = { itens, matchResult, fornecedor: data.fornecedor };

    // Override confirm button
    const btnConfirm = document.getElementById("btn-import-confirmar");
    btnConfirm.onclick = function () { confirmarAIImport(); };

    // Hide mapping (not needed for AI)
    document.getElementById("import-mapping").style.display = "none";
    const totalToggle = document.getElementById("import-total-toggle");
    if (totalToggle) totalToggle.style.display = "none";

    if (modal) modal.style.display = "flex";

  } catch (err) {
    showToast("Erro AI Import: " + err.message, 5000);
  } finally {
    if (btnAI) { btnAI.disabled = false; btnAI.textContent = "Importar com IA"; }
  }
}

function matchAIResultWithBanco(aiItens) {
  const result = { matched: [], new: [], ambiguous: [] };
  const itens = bancoPrecos.itens || [];

  aiItens.forEach(aiItem => {
    const nome = (aiItem.nome || "").toLowerCase().trim();
    let bestMatch = null, bestScore = 0;

    itens.forEach(bp => {
      const bpNome = (bp.item || "").toLowerCase().trim();
      const words1 = nome.split(/\s+/);
      const words2 = bpNome.split(/\s+/);
      const common = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));
      const score = common.length / Math.max(words1.length, words2.length);
      if (score > bestScore) { bestScore = score; bestMatch = bp; }
    });

    if (bestScore >= 0.8) result.matched.push({ ai: aiItem, banco: bestMatch, score: bestScore });
    else if (bestScore >= 0.5) result.ambiguous.push({ ai: aiItem, banco: bestMatch, score: bestScore });
    else result.new.push({ ai: aiItem });
  });
  return result;
}

function confirmarAIImport() {
  const data = window._aiImportData;
  if (!data) return;

  let added = 0, updated = 0;
  data.itens.forEach(aiItem => {
    const matched = data.matchResult.matched.find(m => m.ai === aiItem);
    if (matched && matched.banco) {
      // Update existing
      if (aiItem.preco > 0) {
        matched.banco.custoBase = aiItem.preco;
        matched.banco.precoReferencia = Math.round(aiItem.preco * (1 + (matched.banco.margemPadrao || 0.30)) * 100) / 100;
        matched.banco.ultimaCotacao = new Date().toISOString().slice(0, 10);
        if (aiItem.marca) matched.banco.marca = aiItem.marca;
        if (data.fornecedor) {
          if (!matched.banco.custosFornecedor) matched.banco.custosFornecedor = [];
          matched.banco.custosFornecedor.push({ fornecedor: data.fornecedor, preco: aiItem.preco, data: new Date().toISOString().slice(0, 10) });
        }
        updated++;
      }
    } else {
      // Add new
      bancoPrecos.itens.push({
        id: "bp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        grupo: aiItem.categoria || "Importado IA",
        item: aiItem.nome, unidade: aiItem.unidade || "Un",
        custoBase: aiItem.preco || 0, margemPadrao: 0.30,
        precoReferencia: Math.round((aiItem.preco || 0) * 1.30 * 100) / 100,
        ultimaCotacao: new Date().toISOString().slice(0, 10),
        fonte: data.fornecedor || "AI Import", marca: aiItem.marca || "",
        custosFornecedor: data.fornecedor && aiItem.preco ? [{ fornecedor: data.fornecedor, preco: aiItem.preco, data: new Date().toISOString().slice(0, 10) }] : [],
      });
      added++;
    }
  });

  saveBancoLocal();
  renderBanco();
  document.getElementById("modal-import").style.display = "none";
  window._aiImportData = null;
  showToast(`AI Import: ${updated} atualizados, ${added} novos adicionados`);
}

// ===== RECALC PRÉ-ORÇAMENTO =====
function recalcPreOrcamento(pre) {
  if (!pre || !pre.itens) return;
  pre.totalGeral = Math.round(pre.itens.reduce((s, i) => s + (i.precoTotal || 0), 0) * 100) / 100;
  const margens = pre.itens.filter(i => i.custoUnitario > 0).map(i => i.margem || 0);
  pre.margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0.30;
}

// ===== PESQUISAR PREÇO POR ITEM (Pré-Orçamento) =====

window.toggleSearchMenu = function(idx) {
  // Close all other menus
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const menu = document.getElementById("search-menu-" + idx);
  if (menu) menu.style.display = menu.style.display === "none" ? "block" : "none";
};

// Close search menus on click outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-preco-wrap")) {
    document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  }
});

window.pesquisarPrecoPNCP = async function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const item = pre.itens[idx];
  console.log("[PNCP] Buscando:", simplificarTermoPNCP(item.nome));
  showToast("Buscando no PNCP: " + item.nome + "...");

  const resultado = await consultarPNCP(item.nome, item.idBudgetItem);
  if (resultado && resultado.detalhes?.length > 0 && resultado.min > 0) {
    const orgao = resultado.detalhes[0]?.orgao || "N/A";
    const usar = confirm(`PNCP encontrou: ${brl.format(resultado.min)}\nOrgao: ${orgao}\nAmostras: ${resultado.amostras}\n\nUsar como preco de custo?`);
    if (usar) {
      item.custoUnitario = resultado.min;
      item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
      item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
      recalcPreOrcamento(pre);
      savePreOrcamentos();
      renderPreOrcamentoItens();
      showToast("Preco PNCP aplicado: " + brl.format(resultado.min));
    }
  } else if (resultado === null) {
    // Error toasts are already shown by consultarPNCP, only show "no results" if no error occurred
    showToast("PNCP: nenhum resultado para " + item.nome, "warning");
  }
};

window.pesquisarPrecoGoogle = function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const termo = encodeURIComponent(pre.itens[idx].nome + " preço atacado");
  window.open("https://www.google.com/search?tbm=shop&q=" + termo, "_blank");
};

window.pesquisarPrecoMercadoLivre = function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const termo = encodeURIComponent(pre.itens[idx].nome);
  window.open("https://lista.mercadolivre.com.br/" + termo, "_blank");
};

window.pesquisarPrecoBanco = function(idx) {
  document.querySelectorAll(".search-menu").forEach(m => m.style.display = "none");
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens[idx]) return;
  const item = pre.itens[idx];

  const bp = findBancoItem(item.nome);
  if (bp) {
    const stats = calcHistoricoStats(bp.custosFornecedor);
    let msg = `Banco de Preços: ${item.nome}\n\n`;
    msg += `Custo base: ${brl.format(bp.custoBase)}\n`;
    msg += `Preço referência: ${brl.format(bp.precoReferencia)}\n`;
    if (bp.marca) msg += `Marca: ${bp.marca}\n`;
    if (stats) {
      msg += `\nHistórico (${stats.totalRegistros} registros):\n`;
      msg += `  Min: ${brl.format(stats.min)} | Méd: ${brl.format(stats.media)} | Max: ${brl.format(stats.max)}\n`;
      if (stats.melhorFornecedor) msg += `  Melhor fornecedor: ${stats.melhorFornecedor}\n`;
    }
    msg += `\nUsar custo base (${brl.format(bp.custoBase)}) como preço de custo?`;

    if (confirm(msg)) {
      item.custoUnitario = bp.custoBase;
      if (bp.marca && !item.marca) item.marca = bp.marca;
      item.precoUnitario = Math.round(item.custoUnitario * (1 + item.margem) * 100) / 100;
      item.precoTotal = Math.round(item.precoUnitario * item.quantidade * 100) / 100;
      recalcPreOrcamento(pre);
      savePreOrcamentos();
      renderPreOrcamentoItens();
      showToast("Preço do banco aplicado: " + brl.format(bp.custoBase));
    }
  } else {
    showToast("Item não encontrado no Banco de Preços.");
  }
};

// ===== F7: PNCP INTEGRATION =====
function simplificarTermoPNCP(termo) {
  const stopwords = new Set(["de","da","do","das","dos","para","com","em","no","na","nos","nas","por","um","uma","uns","umas","o","a","os","as","e","ou","ao","aos","se"]);
  const words = termo.replace(/[^\w\sÀ-ú]/g, "").split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ");
}

async function consultarPNCP(itemNome, itemId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const termoSimplificado = simplificarTermoPNCP(itemNome);
    console.log("[PNCP] Termo original:", itemNome, "-> Simplificado:", termoSimplificado);

    const searchUrl = "/.netlify/functions/pncp-search";
    const searchBody = { action: "search", termo: termoSimplificado, uf: "MG" };
    console.log("[PNCP] request:", { url: searchUrl, body: searchBody });

    const resp = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody),
      signal: controller.signal,
    });

    console.log("[PNCP] response status:", resp.status);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[PNCP] erro HTTP:", resp.status, errText);
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const resultados = data.data || data || [];
    console.log("[PNCP] resultados:", Array.isArray(resultados) ? resultados.length : 0);

    if (!Array.isArray(resultados) || resultados.length === 0) {
      console.log("[PNCP] nenhum resultado encontrado para:", termoSimplificado);
      return null;
    }

    // Extract prices from search results (max 3 to avoid compound timeouts)
    const precos = [];
    for (const contratacao of resultados.slice(0, 3)) {
      try {
        const cnpj = contratacao.orgaoEntidade?.cnpj || contratacao.cnpjCompra;
        const ano = contratacao.anoCompra;
        const seq = contratacao.sequencialCompra;
        if (!cnpj || !ano || !seq) continue;

        console.log("[PNCP] Buscando itens:", cnpj, ano, seq);

        const itemsResp = await fetch("/.netlify/functions/pncp-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "items", cnpj, ano, seq }),
          signal: controller.signal,
        });

        if (!itemsResp.ok) {
          console.warn("[PNCP] itens HTTP error:", itemsResp.status, "para", cnpj, ano, seq);
          continue;
        }

        const itemsData = await itemsResp.json();
        const itensArray = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);
        console.log("[PNCP] itens retornados:", itensArray.length, "para", cnpj, ano, seq);

        const keywords = simplificarTermoPNCP(itemNome).toLowerCase().split(" ");
        itensArray.forEach(i => {
          if (i.descricao && keywords.some(kw => i.descricao.toLowerCase().includes(kw))) {
            const preco = i.valorHomologado || i.valorUnitarioEstimado;
            if (preco > 0) {
              precos.push({
                preco, orgao: contratacao.orgaoEntidade?.razaoSocial || "",
                data: contratacao.dataPublicacaoPncp, descricao: i.descricao,
              });
            }
          }
        });
      } catch (subErr) {
        if (subErr.name === "AbortError") throw subErr; // re-throw timeout
        console.warn("[PNCP] erro ao buscar itens de contratacao:", subErr.message);
      }
    }

    if (precos.length === 0) {
      console.log("[PNCP] nenhum preco encontrado apos filtrar itens");
      return null;
    }

    console.log("[PNCP] precos encontrados:", precos.length);

    const valores = precos.map(p => p.preco);
    valores.sort((a, b) => a - b);
    const mediana = valores.length % 2 ? valores[Math.floor(valores.length / 2)] : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2;

    const stats = {
      mediana, media: valores.reduce((a, b) => a + b, 0) / valores.length,
      min: Math.min(...valores), max: Math.max(...valores),
      amostras: valores.length, detalhes: precos,
      dataConsulta: new Date().toISOString(),
    };

    // Save to banco
    const item = bancoPrecos.itens.find(i => i.id === itemId);
    if (item) {
      item.pncp = stats;
      item.precoReferencia = stats.mediana;
      item.ultimaConsultaPncp = stats.dataConsulta;
      saveBancoLocal();
    }

    // Cache 7 days
    const cache = JSON.parse(localStorage.getItem(PNCP_CACHE_KEY) || "{}");
    cache[itemId] = { ...stats, expira: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    localStorage.setItem(PNCP_CACHE_KEY, JSON.stringify(cache));

    return stats;
  } catch (err) {
    if (err.name === "AbortError") {
      showToast("PNCP: timeout - tente novamente", "warning");
      console.error("[PNCP] timeout (15s) para:", itemNome);
    } else if (err.message && err.message.startsWith("HTTP")) {
      showToast(`PNCP indisponivel (${err.message}) - tente novamente`, "error");
      console.error("[PNCP] erro HTTP:", err.message, "para:", itemNome);
    } else {
      showToast("PNCP: erro de rede - verifique a conexao", "error");
      console.error("[PNCP] erro de rede:", err, "para:", itemNome);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

window.consultarPncpBatch = async function () {
  const cache = JSON.parse(localStorage.getItem(PNCP_CACHE_KEY) || "{}");
  const pendentes = (bancoPrecos.itens || []).filter(item => {
    const cached = cache[item.id];
    return !cached || cached.expira < Date.now();
  });

  if (pendentes.length === 0) { showToast("Todos os itens já têm consulta PNCP válida (cache 7 dias)"); return; }

  const progressEl = document.getElementById("pncp-progress");
  if (progressEl) progressEl.style.display = "block";

  let processados = 0;
  for (const item of pendentes) {
    await consultarPNCP(item.item, item.id);
    processados++;
    if (progressEl) {
      const pct = Math.round(processados / pendentes.length * 100);
      progressEl.querySelector(".pct").textContent = pct + "%";
      progressEl.querySelector(".label").textContent = `${processados}/${pendentes.length} itens consultados`;
      progressEl.querySelector(".bar").value = pct;
    }
    await new Promise(r => setTimeout(r, 1200)); // Rate limit
  }

  if (progressEl) progressEl.style.display = "none";
  renderBanco();
  showToast(`PNCP: ${processados} itens atualizados`);
};

// ===== F6: FONTES B2B =====
window.abrirGerenciadorFontes = function (itemId) {
  const item = bancoPrecos.itens.find(i => i.id === itemId);
  if (!item) return;
  const fontes = item.fontesPreco || [];

  const isExpired = (f) => f.validade && new Date(f.validade) < new Date();
  const tipoLabel = { manual: "Manual", b2b_portal: "Portal B2B", b2b_api: "API", tabela_fornecedor: "Tabela" };

  let html = `<h4 style="margin-bottom:8px;">${escapeHtml(item.item)}</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Fornecedor</th><th>Tipo</th><th>Preço</th><th>Atualizado</th><th>Válido até</th><th>Freq.</th><th></th></tr></thead>
      <tbody>${fontes.length === 0 ? '<tr><td colspan="7" class="text-muted">Nenhuma fonte cadastrada.</td></tr>' : fontes.map((f, idx) => {
        const exp = isExpired(f);
        return `<tr style="${exp ? "opacity:0.5;" : ""}">
          <td>${escapeHtml(f.fornecedor)}</td>
          <td><span class="badge">${tipoLabel[f.tipo] || f.tipo}</span></td>
          <td class="font-mono">${brl.format(f.preco)}</td>
          <td>${formatDate(f.dataAtualizacao)}</td>
          <td>${f.validade ? formatDate(f.validade) : "—"} ${exp ? '<span class="badge badge-vencido">Expirado</span>' : ""}</td>
          <td>${f.frequencia || "—"}</td>
          <td><button class="btn btn-inline btn-danger" onclick="removerFontePreco('${itemId}',${idx})">X</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
    <h4 style="margin:12px 0 8px;">Adicionar Fonte</h4>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;">
      <label style="flex:1;min-width:120px;">Fornecedor<input type="text" id="nf-fornecedor" placeholder="Nome" /></label>
      <label style="width:80px;">Preço<input type="number" id="nf-preco" step="0.01" /></label>
      <label style="width:120px;">Válido até<input type="date" id="nf-validade" /></label>
      <label style="width:120px;">Tipo<select id="nf-tipo"><option value="manual">Manual</option><option value="tabela_fornecedor">Tabela</option><option value="b2b_portal">Portal B2B</option></select></label>
      <label style="width:120px;">Frequência<select id="nf-freq"><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option></select></label>
      <button class="btn btn-accent btn-sm" onclick="adicionarFontePreco('${itemId}')">Adicionar</button>
    </div>`;

  document.getElementById("modal-fontes-titulo").textContent = "Fontes de Preço";
  document.getElementById("modal-fontes-body").innerHTML = html;
  document.getElementById("modal-fontes").style.display = "flex";
};

window.adicionarFontePreco = function (itemId) {
  const item = bancoPrecos.itens.find(i => i.id === itemId);
  if (!item) return;
  const fornecedor = document.getElementById("nf-fornecedor").value.trim();
  const preco = parseFloat(document.getElementById("nf-preco").value);
  if (!fornecedor || !preco) { alert("Preencha fornecedor e preço."); return; }

  if (!item.fontesPreco) item.fontesPreco = [];
  item.fontesPreco.push({
    tipo: document.getElementById("nf-tipo").value,
    fornecedor, preco,
    dataAtualizacao: new Date().toISOString().slice(0, 10),
    validade: document.getElementById("nf-validade").value || null,
    frequencia: document.getElementById("nf-freq").value,
    ativo: true,
  });

  // Update custoBase to best price
  const activesFontes = item.fontesPreco.filter(f => f.ativo && (!f.validade || new Date(f.validade) >= new Date()));
  if (activesFontes.length > 0) {
    item.custoBase = Math.min(...activesFontes.map(f => f.preco));
    item.precoReferencia = Math.round(item.custoBase * (1 + (item.margemPadrao || 0.30)) * 100) / 100;
  }

  saveBancoLocal();
  abrirGerenciadorFontes(itemId); // Re-render
  showToast("Fonte adicionada!");
};

window.removerFontePreco = function (itemId, idx) {
  const item = bancoPrecos.itens.find(i => i.id === itemId);
  if (!item || !item.fontesPreco) return;
  item.fontesPreco.splice(idx, 1);
  saveBancoLocal();
  abrirGerenciadorFontes(itemId);
};

// ===== BIND NEW EVENTS =====
(function bindNewEvents() {
  // AI Import button
  const btnAI = document.getElementById("btn-import-ai");
  if (btnAI) {
    btnAI.addEventListener("click", () => {
      const input = document.getElementById("import-file-input");
      input._aiMode = true;
      input.click();
    });
  }

  // Hook file input for AI mode
  const fileInput = document.getElementById("import-file-input");
  if (fileInput) {
    const origHandler = fileInput.onchange;
    fileInput.addEventListener("change", function (e) {
      if (this._aiMode && this.files && this.files[0]) {
        this._aiMode = false;
        processAIImport(this.files[0]);
        e.stopImmediatePropagation();
        return;
      }
    });
  }

  // Banco: select-all checkbox
  const selectAllBanco = document.getElementById("banco-select-all");
  if (selectAllBanco) {
    selectAllBanco.addEventListener("change", function () {
      document.querySelectorAll(".banco-item-check").forEach(c => { c.checked = this.checked; });
      updateBancoSelectionUI();
    });
  }

  // Banco: delegate individual checkbox changes
  const tbodyBanco = document.getElementById("tbody-banco");
  if (tbodyBanco) {
    tbodyBanco.addEventListener("change", function (e) {
      if (e.target.classList.contains("banco-item-check")) updateBancoSelectionUI();
    });
  }

  // Banco: bulk delete button
  const btnExcluirSel = document.getElementById("btn-excluir-selecionados-banco");
  if (btnExcluirSel) btnExcluirSel.addEventListener("click", excluirSelecionadosBanco);

  // PNCP batch button
  const btnPncp = document.getElementById("btn-pncp-batch");
  if (btnPncp) btnPncp.addEventListener("click", consultarPncpBatch);

  // B2B Import (Story 4.30)
  const btnImportB2b = document.getElementById("btn-import-b2b");
  if (btnImportB2b) btnImportB2b.addEventListener("click", openB2bModal);
  const btnB2bFechar = document.getElementById("btn-b2b-fechar");
  if (btnB2bFechar) btnB2bFechar.addEventListener("click", closeB2bModal);
  const btnB2bBuscar = document.getElementById("btn-b2b-buscar");
  if (btnB2bBuscar) btnB2bBuscar.addEventListener("click", b2bBuscar);
  const btnB2bImportar = document.getElementById("btn-b2b-importar");
  if (btnB2bImportar) btnB2bImportar.addEventListener("click", b2bImportar);
  const b2bSelectAll = document.getElementById("b2b-select-all");
  if (b2bSelectAll) b2bSelectAll.addEventListener("change", () => {
    b2bParsedItems.forEach(i => i.selected = b2bSelectAll.checked);
    renderB2bPreview();
  });
  const modalB2b = document.getElementById("modal-b2b");
  if (modalB2b) modalB2b.addEventListener("click", (e) => { if (e.target === modalB2b) closeB2bModal(); });

  // Vincular Produto modal (Story 4.35) — click outside to close + search debounce
  const modalVincular = document.getElementById("modal-vincular-produto");
  if (modalVincular) modalVincular.addEventListener("click", (e) => { if (e.target === modalVincular) fecharModalVincular(); });
  initVincularBuscaHandler();

  // Export contratos
  const btnExpCtr = document.getElementById("btn-export-contratos");
  if (btnExpCtr) {
    btnExpCtr.addEventListener("click", () => {
      const contratos = JSON.parse(localStorage.getItem(CONTRATOS_STORAGE_KEY) || "[]");
      const header = "ContratoID;Escola;Municipio;Valor;Status;Data;Entregue";
      const rows = contratos.map(c => {
        const entregue = c.itens ? c.itens.reduce((s, i) => s + (i.entregue || 0), 0) : 0;
        return [c.contratoId, c.escola?.nome, c.escola?.municipio, c.valorTotal, c.status, c.dataContrato, entregue].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(";");
      });
      if (typeof downloadCsv === "function") downloadCsv("contratos.csv", [header, ...rows].join("\n"));
    });
  }
})();

// ===== VINCULAR PRODUTO — Modal de Equivalências (Story 4.35) =====
let _vincularDescricao = "";  // description being linked
let _vincularOrcId = "";      // pre-orcamento id
let _vincularItemIdx = -1;    // item index
let _vincularDebounce = null;

window.abrirModalVincular = function(orcId, itemIdx) {
  const pre = preOrcamentos[orcId];
  if (!pre || !pre.itens[itemIdx]) return;
  const item = pre.itens[itemIdx];
  _vincularOrcId = orcId;
  _vincularItemIdx = itemIdx;
  _vincularDescricao = item.nome;

  // Set header
  const tituloEl = document.getElementById("vincular-titulo-desc");
  if (tituloEl) tituloEl.textContent = _vincularDescricao.slice(0, 80) + (_vincularDescricao.length > 80 ? "..." : "");

  // Hide create form if open
  const createForm = document.getElementById("vincular-criar-form");
  if (createForm) createForm.style.display = "none";

  // Auto-sugestão via findBestMestre
  const sugestaoDiv = document.getElementById("vincular-sugestao");
  if (sugestaoDiv) {
    sugestaoDiv.innerHTML = "";
    const result = findBestMestre(_vincularDescricao);
    if (result && result.score >= 0.5) {
      const mestre = result.mestre;
      // Find a banco item matching this mestre
      const mestreBp = bancoPrecos.itens.find(bp => normalizedText(bp.item) === normalizedText(mestre.nomeCanonico));
      const confianca = result.score >= 0.8 ? '<span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:4px;font-size:0.7rem;margin-left:4px;">Alta confianca</span>' : '';
      const skuInfo = mestreBp && mestreBp.sku ? ` | SKU: ${escapeHtml(mestreBp.sku)}` : "";
      const custoInfo = mestreBp && mestreBp.custoBase > 0 ? ` | ${brl.format(mestreBp.custoBase)}` : "";
      sugestaoDiv.innerHTML = `
        <div style="background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:10px;margin-bottom:12px;">
          <div style="font-size:0.8rem;font-weight:600;color:#065f46;margin-bottom:4px;">Sugestao automatica ${confianca}</div>
          <div style="font-size:0.85rem;">${escapeHtml(mestre.nomeCanonico)}${skuInfo}${custoInfo} <span style="color:#6b7280;font-size:0.75rem;">(${(result.score * 100).toFixed(0)}% match)</span></div>
          <button class="btn btn-sm btn-accent" onclick="aceitarSugestaoVincular('${escapeHtml(mestreBp ? mestreBp.id : mestre.id)}')" style="margin-top:6px;font-size:0.8rem;">Aceitar sugestao</button>
        </div>`;
    }
  }

  // Clear search and show all products initially
  const inputBusca = document.getElementById("input-busca-produto");
  if (inputBusca) inputBusca.value = "";
  renderResultadosProduto("");

  // Open modal
  const modal = document.getElementById("modal-vincular-produto");
  if (modal) modal.style.display = "flex";
};

window.aceitarSugestaoVincular = function(bpId) {
  const bp = bancoPrecos.itens.find(i => i.id === bpId);
  if (bp) {
    selecionarProdutoVincular(bp);
  }
};

function renderResultadosProduto(termo) {
  const container = document.getElementById("resultados-produto");
  if (!container) return;

  const norm = normalizedText(termo);
  let itens = bancoPrecos.itens;
  if (norm.length > 0) {
    itens = itens.filter(bp => {
      return normalizedText(bp.item).includes(norm) ||
             normalizedText(bp.nomeComercial || "").includes(norm) ||
             normalizedText(bp.sku || "").includes(norm);
    });
  }

  // Sort: items with sku/nomeComercial first, then alphabetical
  itens = [...itens].sort((a, b) => {
    const aHas = (a.sku || a.nomeComercial) ? 0 : 1;
    const bHas = (b.sku || b.nomeComercial) ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return (a.item || "").localeCompare(b.item || "");
  });

  // Limit to 50 results
  const limited = itens.slice(0, 50);

  if (limited.length === 0) {
    container.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;padding:12px;text-align:center;">Nenhum produto encontrado. Crie um novo abaixo.</div>';
    return;
  }

  container.innerHTML = '<table style="width:100%;font-size:0.82rem;"><thead><tr><th style="text-align:left;">Produto</th><th>SKU</th><th>Unid.</th><th>Custo</th><th></th></tr></thead><tbody>' +
    limited.map(bp => {
      const nome = escapeHtml(bp.nomeComercial || bp.item);
      const sku = escapeHtml(bp.sku || "—");
      const unid = escapeHtml(bp.unidade || bp.unidadeCompra || "—");
      const custo = bp.custoBase > 0 ? brl.format(bp.custoBase) : "—";
      return `<tr>
        <td style="padding:4px 6px;">${nome}</td>
        <td style="padding:4px 6px;color:#6b7280;">${sku}</td>
        <td style="padding:4px 6px;">${unid}</td>
        <td style="padding:4px 6px;">${custo}</td>
        <td style="padding:4px 6px;"><button class="btn btn-sm btn-accent" onclick="selecionarProdutoById('${escapeHtml(bp.id)}')" style="font-size:0.75rem;padding:2px 8px;">Selecionar</button></td>
      </tr>`;
    }).join("") +
    '</tbody></table>' +
    (itens.length > 50 ? `<div style="color:#6b7280;font-size:0.75rem;text-align:center;margin-top:4px;">Mostrando 50 de ${itens.length} resultados. Refine a busca.</div>` : "");
}

window.selecionarProdutoById = function(bpId) {
  const bp = bancoPrecos.itens.find(i => i.id === bpId);
  if (bp) selecionarProdutoVincular(bp);
};

function selecionarProdutoVincular(bp) {
  // Ensure the banco item has a sku
  if (!bp.sku) {
    bp.sku = gerarSkuSugerido(bp.nomeComercial || bp.item);
    saveBancoLocal();
  }

  // Set equivalencia
  setEquivalencia(_vincularDescricao, bp.sku);

  // Add this description to the bp's equivalencias array
  if (!bp.equivalencias) bp.equivalencias = [];
  const normDesc = normalizedText(_vincularDescricao);
  if (!bp.equivalencias.some(e => normalizedText(e) === normDesc)) {
    bp.equivalencias.push(_vincularDescricao);
    saveBancoLocal();
  }

  // Close modal and re-render
  fecharModalVincular();
  showToast(`Vinculado: "${_vincularDescricao.slice(0, 40)}..." -> "${bp.nomeComercial || bp.item}"`);
  renderPreOrcamentoItens();
}

function fecharModalVincular() {
  const modal = document.getElementById("modal-vincular-produto");
  if (modal) modal.style.display = "none";
  _vincularDescricao = "";
  _vincularOrcId = "";
  _vincularItemIdx = -1;
}
window.fecharModalVincular = fecharModalVincular;

function gerarSkuSugerido(nome) {
  return normalizedText(nome)
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 1)
    .slice(0, 3)
    .map(t => t.slice(0, 4).toUpperCase())
    .join("-") || ("SKU-" + Date.now().toString(36).slice(-4).toUpperCase());
}

// Toggle create form inside vincular modal
window.toggleCriarProdutoForm = function() {
  const form = document.getElementById("vincular-criar-form");
  if (!form) return;
  form.style.display = form.style.display === "none" ? "block" : "none";
  if (form.style.display === "block") {
    // Pre-fill with auto-generated SKU
    const inputNome = document.getElementById("vincular-criar-nome");
    const inputSku = document.getElementById("vincular-criar-sku");
    if (inputNome && !inputNome.value) inputNome.value = _vincularDescricao.slice(0, 60);
    if (inputSku && !inputSku.value) inputSku.value = gerarSkuSugerido(_vincularDescricao);
  }
};

window.criarEVincularProduto = function() {
  const nomeComercial = (document.getElementById("vincular-criar-nome")?.value || "").trim();
  if (!nomeComercial) { showToast("Nome comercial e obrigatorio."); return; }

  let sku = (document.getElementById("vincular-criar-sku")?.value || "").trim();
  if (!sku) sku = gerarSkuSugerido(nomeComercial);

  const unidadeCompra = document.getElementById("vincular-criar-unidade")?.value || "UN";
  const fornecedorPadrao = (document.getElementById("vincular-criar-fornecedor")?.value || "").trim();
  const custo = parseFloat(document.getElementById("vincular-criar-custo")?.value) || 0;

  // Check if SKU already exists
  if (bancoPrecos.itens.some(bp => bp.sku === sku)) {
    showToast("SKU ja existe. Escolha outro ou use Selecionar.");
    return;
  }

  // Create new banco item
  const novoBp = {
    id: "bp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
    item: nomeComercial,
    nomeComercial: nomeComercial,
    sku: sku,
    marca: "",
    grupo: "Material de Consumo Geral",
    unidade: unidadeCompra,
    unidadeCompra: unidadeCompra,
    custoBase: custo,
    margemPadrao: 0.30,
    precoReferencia: custo > 0 ? Math.round(custo * 1.30 * 100) / 100 : 0,
    ultimaCotacao: new Date().toISOString().slice(0, 10),
    fonte: fornecedorPadrao,
    fornecedorPadrao: fornecedorPadrao,
    custo: custo,
    propostas: [],
    concorrentes: [],
    custosFornecedor: fornecedorPadrao && custo > 0 ? [{
      fornecedor: fornecedorPadrao,
      preco: custo,
      data: new Date().toISOString().slice(0, 10)
    }] : [],
    equivalencias: [_vincularDescricao]
  };
  bancoPrecos.itens.push(novoBp);
  saveBancoLocal();

  // Set equivalencia
  setEquivalencia(_vincularDescricao, sku);

  // Close and re-render
  fecharModalVincular();
  showToast(`Produto "${nomeComercial}" criado e vinculado.`);
  renderPreOrcamentoItens();
};

// Debounced search handler for vincular modal
function initVincularBuscaHandler() {
  const input = document.getElementById("input-busca-produto");
  if (!input) return;
  input.addEventListener("input", function() {
    clearTimeout(_vincularDebounce);
    _vincularDebounce = setTimeout(() => {
      renderResultadosProduto(this.value);
    }, 300);
  });
}

// Initialize search handler after DOM load
document.addEventListener("DOMContentLoaded", initVincularBuscaHandler);

// ===== CONVERSAO E DEMANDA ENGINE (Story 4.36) =====

function converterDemanda(pedidoItens) {
  return pedidoItens.map(item => {
    const equiv = getEquivalencia(item.nome);
    if (!equiv) return { ...item, status: "sem_vinculo", produtoReal: null, qtdConvertida: 0, custoEstimado: 0 };

    const produto = getProdutoBySku(equiv);
    const fator = conversoes[normalizedText(item.nome)]?.fator || 1;
    const qtdConvertida = Math.ceil((item.quantidade || 0) / fator);
    const custo = produto ? (produto.custoBase || produto.custo || 0) * qtdConvertida : 0;

    return {
      ...item,
      status: "convertido",
      produtoReal: produto ? (produto.nomeComercial || produto.item) : equiv,
      skuProduto: equiv,
      qtdOriginal: item.quantidade,
      unidadeOriginal: item.unidade || "UN",
      qtdConvertida,
      unidadeCompra: produto?.unidade || produto?.unidadeCompra || "UN",
      fatorConversao: fator,
      custoUnitario: produto?.custoBase || produto?.custo || 0,
      custoEstimado: Math.round(custo * 100) / 100,
    };
  });
}

window.gerarDemanda = function(orcId) {
  const pre = preOrcamentos[orcId];
  if (!pre) return;

  const itensConvertidos = converterDemanda(pre.itens || []);
  const semVinculo = itensConvertidos.filter(i => i.status === "sem_vinculo").length;

  const demanda = {
    id: "dem-" + Date.now().toString(36),
    orcamentoId: orcId,
    escola: pre.escola,
    municipio: pre.municipio,
    status: "rascunho",
    criadoEm: new Date().toISOString().slice(0, 10),
    itens: itensConvertidos,
    totalEstimado: itensConvertidos.reduce((s, i) => s + (i.custoEstimado || 0), 0),
  };

  demandas.push(demanda);
  saveDemandas();

  if (semVinculo > 0) {
    showToast(`Demanda criada: ${itensConvertidos.length} itens (${semVinculo} sem vinculo — vincule na aba Pre-Orcamento)`);
  } else {
    showToast(`Demanda criada: ${itensConvertidos.length} itens convertidos — ${brl.format(demanda.totalEstimado)}`);
  }
  renderSgd();
};

// Story 4.43: renderDemandas migrado para gdp-contratos.html
function renderDemandas() { /* noop — migrado para GDP */ }

window.verDemanda = function(demandaId) {
  const d = demandas.find(x => x.id === demandaId);
  if (!d) return;
  let msg = `Demanda ${d.id} — ${d.escola}\n\n`;
  d.itens.forEach((item, i) => {
    if (item.status === "convertido") {
      msg += `${i + 1}. ${item.nome} -> ${item.produtoReal}\n   ${item.qtdOriginal} ${item.unidadeOriginal} -> ${item.qtdConvertida} ${item.unidadeCompra} (fator: ${item.fatorConversao})\n   Custo: ${brl.format(item.custoEstimado)}\n\n`;
    } else {
      msg += `${i + 1}. [SEM VINCULO] ${item.nome}\n\n`;
    }
  });
  msg += `Total estimado: ${brl.format(d.totalEstimado)}`;
  alert(msg);
};

// ===== ESTOQUE E LISTA DE COMPRAS ENGINE (Story 4.37) =====

window.confirmarDemanda = function(demandaId) {
  const d = demandas.find(x => x.id === demandaId);
  if (!d || d.status !== "rascunho") return;
  if (!confirm(`Confirmar demanda ${d.id}? Vai debitar estoque e gerar lista de compras.`)) return;

  d.itens.forEach(item => {
    if (item.status !== "convertido" || !item.skuProduto) return;
    const sku = item.skuProduto;

    // Init stock if needed
    if (!estoque[sku]) estoque[sku] = { qtd: 0, qtdComprometida: 0, minimo: 0 };

    const disponivel = estoque[sku].qtd - estoque[sku].qtdComprometida;
    if (disponivel >= item.qtdConvertida) {
      // Enough stock — deduct
      estoque[sku].qtd -= item.qtdConvertida;
    } else {
      // Not enough — deduct what's available, add rest to purchase list
      const falta = item.qtdConvertida - Math.max(disponivel, 0);
      estoque[sku].qtd = Math.max(estoque[sku].qtd - item.qtdConvertida, 0);

      const produto = getProdutoBySku(sku);
      listaCompras.push({
        sku,
        produto: item.produtoReal || (produto ? (produto.item || sku) : sku),
        qtd: falta,
        fornecedor: produto?.fonte || produto?.fornecedorPadrao || "",
        custoUnitario: produto?.custoBase || produto?.custo || 0,
        custoTotal: Math.round(falta * (produto?.custoBase || produto?.custo || 0) * 100) / 100,
        demandaId: d.id,
        escola: d.escola,
        criadoEm: new Date().toISOString().slice(0, 10),
      });
    }
  });

  d.status = "confirmada";
  saveDemandas();
  saveEstoque();
  saveListaCompras();
  renderDemandas();
  renderEstoque();
  renderListaCompras();
  showToast(`Demanda confirmada. Estoque atualizado, ${listaCompras.length} item(ns) na lista de compras.`);
};

// Story 4.43: renderEstoque/renderListaCompras/lancamentoEstoque/exportarListaCompras migrados para gdp-contratos.html
function renderEstoque() { /* noop — migrado para GDP */ }
function renderListaCompras() { /* noop — migrado para GDP */ }
window.lancamentoEstoque = function() { /* noop — migrado para GDP */ };
window.exportarListaCompras = function() { /* noop — migrado para GDP */ };

window.imprimirListaCompras = function() {
  // Story 4.43: migrado para gdp-contratos.html — noop aqui
  const table = document.querySelector("#compras-section table");
  if (!table) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Lista de Compras</title>
    <style>body{font-family:Arial;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0}</style>
  </head><body><h2>Lista de Compras — ${new Date().toLocaleDateString("pt-BR")}</h2>${table.outerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
};

// ===== INIT =====
boot();
