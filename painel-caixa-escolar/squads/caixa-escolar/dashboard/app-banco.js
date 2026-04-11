// ===== BANCO DE PREÇOS =====
let editingBancoId = null;

function filteredBanco() {
  const grupo = el.filtroBancoGrupo.value;
  const query = normalizedText(el.filtroBancoTexto.value.trim());

  return bancoPrecos.itens
    .filter((i) => grupo === "all" || i.grupo === grupo)
    .filter((i) => {
      if (!query) return true;
      const propostasText = (i.propostas || []).map((p) => p.edital + " " + p.escola).join(" ");
      const concorrentesText = (i.concorrentes || []).map((c) => c.nome + " " + c.edital).join(" ");
      return normalizedText(i.item + " " + i.grupo + " " + (i.fonte || "") + " " + propostasText + " " + concorrentesText).includes(query);
    })
    .sort((a, b) => (a.grupo + a.item).localeCompare(b.grupo + b.item));
}

function renderBanco() {
  const list = filteredBanco();
  el.bancoEmpty.style.display = list.length ? "none" : "block";

  el.tbodyBanco.innerHTML = list.map((item) => {
    // Minha Proposta = media das propostas ou precoReferencia
    const propostas = item.propostas || [];
    const minhaPropostaMedia = propostas.length > 0
      ? propostas.reduce((s, p) => s + p.preco, 0) / propostas.length
      : item.precoReferencia;

    // Menor Concorrente
    const concorrentes = item.concorrentes || [];
    const menorConcorrente = concorrentes.length > 0
      ? Math.min(...concorrentes.map((c) => c.preco))
      : null;

    // Margem Real
    const margemReal = item.custoBase > 0
      ? ((minhaPropostaMedia - item.custoBase) / item.custoBase) * 100
      : 0;
    const margemRealStr = margemReal.toFixed(1) + "%";
    const margemClass = margemReal >= 20 ? "text-accent" : margemReal >= 10 ? "" : "text-danger";

    // Competitividade badge
    let compBadge;
    if (menorConcorrente === null) {
      compBadge = `<span class="badge badge-muted">Sem dados</span>`;
    } else if (minhaPropostaMedia <= menorConcorrente) {
      compBadge = `<span class="badge badge-ok">Competitivo</span>`;
    } else if (minhaPropostaMedia <= menorConcorrente * 1.05) {
      compBadge = `<span class="badge badge-warn">Na média</span>`;
    } else {
      compBadge = `<span class="badge badge-danger">Acima</span>`;
    }

    // P.U. (Story 4.26)
    const pu = calcPrecoUnitario(item.custoBase, item.unidade, 1);
    const puHtml = pu !== item.custoBase ? `<td class="text-right font-mono nowrap">${brl.format(pu)}</td>` : `<td class="text-muted text-right">—</td>`;

    // Tendencia (Story 4.27)
    const tendenciaHtml = renderTendenciaBadge(item.custosFornecedor);
    const proposalBadge = propostas.length > 0 ? `<br><span class="text-muted" style="font-size:0.7rem">${propostas.length} proposta(s)</span>` : "";

    return `<tr>
      <td><input type="checkbox" class="banco-item-check" data-id="${item.id}" /></td>
      <td><a href="#" onclick="openTimeline('${item.id}');return false;" style="text-decoration:none;color:inherit;"><strong>${escapeHtml(item.item)}</strong></a>${proposalBadge}</td>
      <td>${escapeHtml(item.marca || "")}</td>
      <td>${escapeHtml(item.grupo)}</td>
      <td class="text-right font-mono">${brl.format(item.custoBase)}</td>
      ${puHtml}
      <td class="text-right font-mono">${brl.format(minhaPropostaMedia)}</td>
      <td class="text-right font-mono">${menorConcorrente !== null ? brl.format(menorConcorrente) : "—"}</td>
      <td class="text-right font-mono">${brl.format(item.precoReferencia)}</td>
      <td class="text-right ${margemClass}">${margemRealStr}</td>
      <td class="text-center">${tendenciaHtml}</td>
      <td class="text-center">${compBadge}</td>
      <td class="nowrap">
        <button class="btn btn-inline" onclick="editarBancoItem('${item.id}')">Editar</button>
        <button class="btn btn-inline btn-danger" onclick="removerBancoItem('${item.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join("");

  // Reset select-all checkbox
  const selectAll = document.getElementById("banco-select-all");
  if (selectAll) selectAll.checked = false;
  updateBancoSelectionUI();

  // Update intelligence panel if open (Story 4.28)
  const bancoIntelBody = document.getElementById("banco-intel-body");
  if (bancoIntelBody && bancoIntelBody.style.display !== "none") {
    renderBancoIntel();
  }
}

// ===== ITENS MESTRES UI (Story 4.26) =====
function renderMestresModal() {
  const modal = document.getElementById("modal-mestres");
  const tbody = document.getElementById("tbody-mestres");
  const filtro = document.getElementById("filtro-mestres");
  if (!modal || !tbody) return;

  const query = normalizedText((filtro ? filtro.value : "").trim());
  const filtered = itensMestres.filter(m => {
    if (!query) return true;
    const searchText = normalizedText([m.nomeCanonico, ...m.aliases, m.categoria].join(" "));
    return searchText.includes(query);
  });

  tbody.innerHTML = filtered.map(m => {
    const attrs = m.atributos || {};
    const attrParts = [attrs.marca, attrs.volume, attrs.gramatura, attrs.peso, attrs.folhas].filter(Boolean);
    const linkedCount = bancoPrecos.itens.filter(i => i.mesterId === m.id).length;
    return `<tr>
      <td><strong>${escapeHtml(m.nomeCanonico)}</strong> <span class="text-muted">(${linkedCount} itens)</span></td>
      <td class="text-muted" style="font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${m.aliases.slice(0, 3).map(a => escapeHtml(a)).join(", ")}${m.aliases.length > 3 ? "..." : ""}</td>
      <td>${escapeHtml(m.categoria)}</td>
      <td>${escapeHtml(m.unidadeBase)}</td>
      <td class="text-muted" style="font-size:0.75rem;">${attrParts.length ? attrParts.join(" | ") : "—"}</td>
      <td><button class="btn btn-inline btn-muted" onclick="removeMestre('${m.id}')" title="Excluir">&#10005;</button></td>
    </tr>`;
  }).join("");

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;">Nenhum item mestre encontrado.</td></tr>';
  }
}

window.openMestresModal = function() {
  const modal = document.getElementById("modal-mestres");
  if (modal) { modal.style.display = "flex"; renderMestresModal(); }
};

window.closeMestresModal = function() {
  const modal = document.getElementById("modal-mestres");
  if (modal) modal.style.display = "none";
};

window.removeMestre = function(id) {
  if (!confirm("Excluir este item mestre? Os itens do banco perderão o vínculo.")) return;
  bancoPrecos.itens.forEach(item => { if (item.mesterId === id) delete item.mesterId; });
  itensMestres = itensMestres.filter(m => m.id !== id);
  saveMestres();
  saveBancoLocal();
  renderMestresModal();
  showToast("Item mestre excluído.");
};

// ===== TIMELINE DE PRECOS (Story 4.27) =====
window.openTimeline = function(bancoItemId) {
  const item = bancoPrecos.itens.find(i => i.id === bancoItemId);
  if (!item) return;
  const modal = document.getElementById("modal-timeline");
  const titulo = document.getElementById("modal-timeline-titulo");
  const tbody = document.getElementById("tbody-timeline");
  if (!modal || !tbody) return;

  titulo.textContent = `Historico: ${item.item}`;
  const historico = [...(item.custosFornecedor || [])].sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  if (historico.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;">Sem historico.</td></tr>';
  } else {
    const minPreco = Math.min(...historico.map(h => h.preco).filter(p => p > 0));
    tbody.innerHTML = historico.map(h => {
      const isMin = h.preco === minPreco && h.preco > 0;
      const conf = h.confianca != null ? (h.confianca * 100).toFixed(0) + "%" : "\u2014";
      const arquivo = h.arquivoId ? arquivosImportados.find(a => a.id === h.arquivoId) : null;
      const fonteLabel = arquivo ? arquivo.tipoFonte : (h.fonte || "manual");
      return `<tr${isMin ? ' style="background:#e8f5e9;"' : ""}>
        <td class="nowrap">${formatDate(h.data)}</td>
        <td>${escapeHtml(h.fornecedor || "\u2014")}</td>
        <td class="nowrap"><strong>${brl.format(h.preco)}</strong></td>
        <td>${escapeHtml(fonteLabel)}</td>
        <td>${conf}</td>
      </tr>`;
    }).join("");
  }

  const stats = calcHistoricoStats(item.custosFornecedor);
  if (stats) {
    tbody.innerHTML += `<tr style="background:#f5f5f5;font-weight:600;">
      <td colspan="2">Resumo (${stats.totalRegistros} registros)</td>
      <td>Min: ${brl.format(stats.min)}</td>
      <td>Med: ${brl.format(stats.media)}</td>
      <td>Max: ${brl.format(stats.max)}</td>
    </tr>`;
  }

  modal.style.display = "flex";
};

window.closeTimeline = function() {
  const modal = document.getElementById("modal-timeline");
  if (modal) modal.style.display = "none";
};

// ===== INTELIGÊNCIA DE PREÇOS (Story 4.28) =====

function calcRankingFornecedores() {
  const fornMap = {}; // fornecedor -> { itens: Set, menorCount: 0, lastDate: "" }

  bancoPrecos.itens.forEach(item => {
    (item.custosFornecedor || []).forEach(c => {
      if (!c.fornecedor) return;
      if (!fornMap[c.fornecedor]) fornMap[c.fornecedor] = { itens: new Set(), menorCount: 0, lastDate: "" };
      fornMap[c.fornecedor].itens.add(item.id);
      if (c.data && c.data > fornMap[c.fornecedor].lastDate) fornMap[c.fornecedor].lastDate = c.data;
    });
    // Check who has lowest price for this item
    const precos = (item.custosFornecedor || []).filter(c => c.preco > 0 && c.fornecedor);
    if (precos.length > 0) {
      const menor = precos.reduce((min, c) => c.preco < min.preco ? c : min, precos[0]);
      if (fornMap[menor.fornecedor]) fornMap[menor.fornecedor].menorCount++;
    }
  });

  return Object.entries(fornMap).map(([nome, data]) => ({
    nome,
    qtdItens: data.itens.size,
    pctMenor: data.itens.size > 0 ? (data.menorCount / data.itens.size * 100) : 0,
    lastDate: data.lastDate,
  })).sort((a, b) => b.pctMenor - a.pctMenor);
}

function detectOportunidades() {
  const alertas = [];
  const hoje = new Date().toISOString().slice(0, 10);

  bancoPrecos.itens.forEach(item => {
    const stats = calcHistoricoStats(item.custosFornecedor);
    if (!stats) return;

    // High margin opportunity (my price > 30% above cost)
    if (item.custoBase > 0 && item.precoReferencia > 0) {
      const margem = (item.precoReferencia - item.custoBase) / item.custoBase;
      if (margem > 0.30) {
        alertas.push({ tipo: "margem-alta", item: item.item, msg: "Margem " + (margem*100).toFixed(0) + "% — pode reduzir para ser mais competitivo", id: item.id });
      }
    }

    // Competitor risk (competitor price 20%+ below mine)
    const menorConc = item.concorrentes && item.concorrentes.length > 0
      ? Math.min(...item.concorrentes.map(c => c.preco).filter(p => p > 0))
      : null;
    if (menorConc && item.precoReferencia > 0 && menorConc < item.precoReferencia * 0.80) {
      alertas.push({ tipo: "risco", item: item.item, msg: "Concorrente " + ((1 - menorConc/item.precoReferencia)*100).toFixed(0) + "% abaixo", id: item.id });
    }

    // Stale data (no update in 30+ days)
    const lastUpdate = item.ultimaCotacao || "";
    if (lastUpdate) {
      const daysSince = Math.ceil((new Date(hoje) - new Date(lastUpdate)) / 86400000);
      if (daysSince > 30) {
        alertas.push({ tipo: "desatualizado", item: item.item, msg: daysSince + " dias sem atualização", id: item.id });
      }
    }
  });

  return alertas;
}

function renderBancoIntel() {
  const totalMestres = itensMestres.length;
  const fornecedores = new Set();
  let somaPrecos = 0, countPrecos = 0, competitivos = 0, totalComConc = 0;

  bancoPrecos.itens.forEach(item => {
    (item.custosFornecedor || []).forEach(c => { if (c.fornecedor) fornecedores.add(c.fornecedor); });
    if (item.custoBase > 0) { somaPrecos += item.custoBase; countPrecos++; }

    const menorConc = item.concorrentes && item.concorrentes.length > 0
      ? Math.min(...item.concorrentes.map(c => c.preco).filter(p => p > 0))
      : null;
    if (menorConc) {
      totalComConc++;
      if (item.precoReferencia <= menorConc * 1.05) competitivos++;
    }
  });

  // KPIs
  const elMestres = document.getElementById("intel-total-mestres");
  const elForn = document.getElementById("intel-fornecedores");
  const elPreco = document.getElementById("intel-preco-medio");
  const elComp = document.getElementById("intel-pct-competitivo");
  if (elMestres) elMestres.textContent = totalMestres;
  if (elForn) elForn.textContent = fornecedores.size;
  if (elPreco) elPreco.textContent = countPrecos > 0 ? brl.format(somaPrecos / countPrecos) : "\u2014";
  if (elComp) elComp.textContent = totalComConc > 0 ? (competitivos/totalComConc*100).toFixed(0) + "%" : "\u2014";

  // Ranking
  const tbodyRanking = document.getElementById("tbody-ranking-fornecedores");
  if (tbodyRanking) {
    const ranking = calcRankingFornecedores();
    tbodyRanking.innerHTML = ranking.slice(0, 15).map(f => '<tr>' +
      '<td><strong>' + escapeHtml(f.nome) + '</strong></td>' +
      '<td>' + f.qtdItens + '</td>' +
      '<td>' + f.pctMenor.toFixed(0) + '%</td>' +
      '<td>' + formatDate(f.lastDate) + '</td>' +
    '</tr>').join("") || '<tr><td colspan="4" class="text-muted">Sem dados.</td></tr>';
  }

  // Alertas
  const elAlertas = document.getElementById("intel-alertas");
  if (elAlertas) {
    const alertas = detectOportunidades();
    if (alertas.length === 0) {
      elAlertas.innerHTML = '<p class="text-muted">Nenhum alerta no momento.</p>';
    } else {
      const icons = { "margem-alta": "\uD83D\uDCB0", "risco": "\u26A0\uFE0F", "desatualizado": "\uD83D\uDD50" };
      elAlertas.innerHTML = alertas.slice(0, 20).map(a =>
        '<div style="padding:0.3rem 0;border-bottom:1px solid #eee;">' + (icons[a.tipo] || "\u2022") + ' <strong>' + escapeHtml(a.item) + '</strong>: ' + escapeHtml(a.msg) + '</div>'
      ).join("");
    }
  }
}

// ===== COTAÇÃO INTELIGENTE (Story 4.29) =====

function calcPrecoSugerido(itemNome) {
  // Find matching mestre
  const mestreMatch = findBestMestre(itemNome);
  if (!mestreMatch) return null;

  // Find all banco items linked to this mestre
  const linked = bancoPrecos.itens.filter(i => i.mesterId === mestreMatch.mestre.id);
  if (linked.length === 0) return null;

  // Get latest cost from any linked item
  let meuCusto = 0;
  let latestDate = "";
  linked.forEach(item => {
    if (item.custoBase > 0 && (item.ultimaCotacao || "") >= latestDate) {
      meuCusto = item.custoBase;
      latestDate = item.ultimaCotacao || "";
    }
  });

  // Get competitor prices
  const concPrecos = [];
  linked.forEach(item => {
    (item.concorrentes || []).forEach(c => { if (c.preco > 0) concPrecos.push(c.preco); });
  });
  const menorConc = concPrecos.length > 0 ? Math.min(...concPrecos) : null;

  // Get market average from all supplier prices
  const allPrecos = [];
  linked.forEach(item => {
    (item.custosFornecedor || []).forEach(c => { if (c.preco > 0) allPrecos.push(c.preco); });
  });
  const mediaMercado = allPrecos.length > 0 ? allPrecos.reduce((s, p) => s + p, 0) / allPrecos.length : meuCusto;

  // Calculate suggested price
  const margemMinima = 0.08;
  const precoMinimo = meuCusto > 0 ? meuCusto * (1 + margemMinima) : mediaMercado;
  const precoCompetitivo = menorConc ? menorConc * 0.97 : mediaMercado;
  const sugerido = Math.max(precoMinimo, Math.min(precoCompetitivo, mediaMercado * 1.1));

  // Best marca from banco
  const marca = linked.find(i => i.marca)?.marca || "";

  // Confidence
  const confianca = mestreMatch.score >= 0.8 ? "alta" : mestreMatch.score >= 0.5 ? "media" : "baixa";

  return {
    sugerido: sugerido > 0 ? sugerido : null,
    meuCusto, menorConc, mediaMercado, marca, confianca,
    mestreId: mestreMatch.mestre.id,
    margemReal: meuCusto > 0 ? ((sugerido - meuCusto) / meuCusto) : 0
  };
}

// Auto-fill pre-orcamento from Banco Inteligente (Story 4.29)
window.autoPreencherPreOrcamento = function() {
  if (!activePreOrcamentoId) return;
  const pre = preOrcamentos[activePreOrcamentoId];
  if (!pre || !pre.itens) return;

  let preenchidos = 0, semMatch = 0;

  pre.itens.forEach(function(item) {
    const sugestao = calcPrecoSugerido(item.nome);
    if (sugestao && sugestao.sugerido) {
      if (!item.precoUnitario || item.precoUnitario === 0) {
        item.precoUnitario = parseFloat(sugestao.sugerido.toFixed(2));
      }
      if (!item.marca && sugestao.marca) {
        item.marca = sugestao.marca;
      }
      if (sugestao.meuCusto > 0) {
        item.custoBase = sugestao.meuCusto;
      }
      item._autoConfianca = sugestao.confianca;
      item._mestreId = sugestao.mestreId;
      preenchidos++;
    } else {
      semMatch++;
    }
  });

  savePreOrcamentos();
  renderPreOrcamentoItens();
  showToast("Auto-preenchido: " + preenchidos + " itens ok, " + semMatch + " sem match no banco.");
};

// ===== IMPORTAÇÃO B2B (Story 4.30) =====
const B2B_URLS_KEY = "caixaescolar.b2b-urls";
let b2bParsedItems = [];

function loadB2bUrls() {
  try { return JSON.parse(localStorage.getItem(B2B_URLS_KEY) || "[]"); } catch(_) { return []; }
}

function saveB2bUrl(url, fornecedor) {
  const urls = loadB2bUrls();
  const exists = urls.find(u => u.url === url);
  if (exists) {
    exists.fornecedor = fornecedor;
    exists.lastUsed = new Date().toISOString().slice(0, 10);
  } else {
    urls.unshift({ url, fornecedor, lastUsed: new Date().toISOString().slice(0, 10) });
  }
  localStorage.setItem(B2B_URLS_KEY, JSON.stringify(urls.slice(0, 10)));
}

function renderB2bUrlsRecentes() {
  const urls = loadB2bUrls();
  const container = document.getElementById("b2b-urls-recentes");
  const lista = document.getElementById("b2b-urls-lista");
  if (!container || !lista) return;
  if (urls.length === 0) { container.style.display = "none"; return; }
  container.style.display = "block";
  lista.innerHTML = urls.slice(0, 5).map(u =>
    `<a href="#" onclick="b2bUsarUrl('${escapeHtml(u.url)}','${escapeHtml(u.fornecedor)}');return false;" style="display:block;padding:2px 0;">${escapeHtml(u.fornecedor || u.url)} <span class="text-muted">(${u.lastUsed})</span></a>`
  ).join("");
}

window.b2bUsarUrl = function(url, fornecedor) {
  const urlInput = document.getElementById("b2b-url");
  const fornInput = document.getElementById("b2b-fornecedor");
  if (urlInput) urlInput.value = url;
  if (fornInput) fornInput.value = fornecedor;
};

window.openB2bModal = function() {
  const modal = document.getElementById("modal-b2b");
  if (modal) {
    modal.style.display = "flex";
    renderB2bUrlsRecentes();
    b2bParsedItems = [];
    const preview = document.getElementById("b2b-preview");
    const btnImportar = document.getElementById("btn-b2b-importar");
    const status = document.getElementById("b2b-status");
    if (preview) preview.style.display = "none";
    if (btnImportar) btnImportar.style.display = "none";
    if (status) status.textContent = "";
  }
};

window.closeB2bModal = function() {
  const modal = document.getElementById("modal-b2b");
  if (modal) modal.style.display = "none";
};

window.b2bBuscar = async function() {
  const url = (document.getElementById("b2b-url")?.value || "").trim();
  const fornecedor = (document.getElementById("b2b-fornecedor")?.value || "").trim();
  const status = document.getElementById("b2b-status");
  const preview = document.getElementById("b2b-preview");
  const btnImportar = document.getElementById("btn-b2b-importar");
  const btnBuscar = document.getElementById("btn-b2b-buscar");

  if (!url) { if (status) status.textContent = "Informe a URL."; return; }
  if (!fornecedor) { if (status) status.textContent = "Informe o fornecedor."; return; }

  if (btnBuscar) { btnBuscar.disabled = true; btnBuscar.textContent = "Buscando..."; }
  if (status) status.textContent = "Acessando site...";
  if (preview) preview.style.display = "none";
  if (btnImportar) btnImportar.style.display = "none";

  try {
    const scrapeRes = await fetch("/api/b2b-scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) throw new Error(scrapeData.error || "Falha ao acessar site");
    if (!scrapeData.text || scrapeData.text.length < 50) throw new Error("Página sem conteúdo suficiente");

    if (status) status.textContent = "Extraindo produtos com IA...";

    const aiRes = await fetch("/api/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: scrapeData.text.slice(0, 12000),
        formato: "b2b-site",
        fornecedor: fornecedor,
        contexto: "Texto extraído de site de fornecedor B2B. Extraia todos os produtos com preços encontrados.",
      }),
    });
    const aiData = await aiRes.json();
    if (!aiRes.ok) throw new Error(aiData.error || "Falha na extração IA");

    let items = [];
    if (aiData.itens && Array.isArray(aiData.itens)) {
      items = aiData.itens;
    } else if (Array.isArray(aiData)) {
      items = aiData;
    } else if (aiData.result) {
      try { items = JSON.parse(aiData.result); } catch(_) {}
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Nenhum produto encontrado nesta página. Tente outra URL com lista de produtos e preços.");
    }

    b2bParsedItems = items.map((item, idx) => ({
      nome: item.nome || "",
      preco: typeof item.preco === "string" ? parseFloat(item.preco.replace(/[^\d,.-]/g, "").replace(",", ".")) : (item.preco || 0),
      unidade: item.unidade || "UN",
      marca: item.marca || "",
      selected: true,
      _idx: idx,
    }));

    renderB2bPreview();
    saveB2bUrl(url, fornecedor);
    if (status) status.textContent = `${b2bParsedItems.length} produto(s) encontrado(s).`;

  } catch (err) {
    if (status) status.textContent = "Erro: " + err.message;
    console.error("[B2B]", err);
  } finally {
    if (btnBuscar) { btnBuscar.disabled = false; btnBuscar.textContent = "Buscar Produtos"; }
  }
};

function renderB2bPreview() {
  const preview = document.getElementById("b2b-preview");
  const tbody = document.getElementById("tbody-b2b-preview");
  const btnImportar = document.getElementById("btn-b2b-importar");
  if (!preview || !tbody) return;

  preview.style.display = "block";
  if (btnImportar) btnImportar.style.display = "inline-block";

  tbody.innerHTML = b2bParsedItems.map((item, idx) =>
    `<tr>
      <td><input type="checkbox" class="b2b-check" data-idx="${idx}" ${item.selected ? "checked" : ""} /></td>
      <td>${escapeHtml(item.nome || "")}</td>
      <td class="nowrap">${item.preco > 0 ? brl.format(item.preco) : "—"}</td>
      <td>${escapeHtml(item.unidade || "UN")}</td>
      <td>${escapeHtml(item.marca || "—")}</td>
    </tr>`
  ).join("");

  tbody.querySelectorAll(".b2b-check").forEach(cb => {
    cb.addEventListener("change", () => {
      b2bParsedItems[parseInt(cb.dataset.idx)].selected = cb.checked;
      updateB2bStats();
    });
  });

  updateB2bStats();
}

function updateB2bStats() {
  const stats = document.getElementById("b2b-preview-stats");
  const selected = b2bParsedItems.filter(i => i.selected);
  if (stats) stats.textContent = `${selected.length} de ${b2bParsedItems.length} selecionados`;
}

window.b2bImportar = function() {
  const selected = b2bParsedItems.filter(i => i.selected && i.nome);
  if (selected.length === 0) { showToast("Nenhum item selecionado."); return; }

  const fornecedor = (document.getElementById("b2b-fornecedor")?.value || "").trim();
  const url = (document.getElementById("b2b-url")?.value || "").trim();

  const arquivo = registrarArquivo(url, fornecedor, "b2b-site", selected.length);

  let novos = 0, atualizados = 0;

  selected.forEach(item => {
    const nomeNorm = normalizedText(item.nome);
    const existing = bancoPrecos.itens.find(bi => normalizedText(bi.item) === nomeNorm);

    if (existing) {
      if (!existing.custosFornecedor) existing.custosFornecedor = [];
      existing.custosFornecedor.push({
        fornecedor, preco: item.preco, data: new Date().toISOString().slice(0, 10),
        arquivoId: arquivo.id, descricaoOriginal: item.nome, confianca: 0.70,
      });
      if (item.preco > 0) existing.custoBase = item.preco;
      existing.ultimaCotacao = new Date().toISOString().slice(0, 10);
      existing.fonte = fornecedor;
      atualizados++;
    } else {
      const newItem = {
        id: "bp-" + String(Date.now()).slice(-6) + "-" + Math.random().toString(36).slice(2, 5),
        item: item.nome,
        marca: item.marca || "",
        grupo: "B2B",
        unidade: item.unidade || "Unidade",
        custoBase: item.preco || 0,
        margemPadrao: 0.30,
        precoReferencia: item.preco ? item.preco * 1.30 : 0,
        ultimaCotacao: new Date().toISOString().slice(0, 10),
        fonte: fornecedor,
        propostas: [],
        concorrentes: [],
        custosFornecedor: [{
          fornecedor, preco: item.preco, data: new Date().toISOString().slice(0, 10),
          arquivoId: arquivo.id, descricaoOriginal: item.nome, confianca: 0.70,
        }],
      };

      const mestreMatch = findBestMestre(item.nome);
      if (mestreMatch && mestreMatch.score >= 0.5) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(item.nome, mestreMatch.mestre.id);
      } else {
        const mestre = createMestreFromItem(newItem);
        newItem.mesterId = mestre.id;
      }

      bancoPrecos.itens.push(newItem);
      novos++;
    }
  });

  saveMestres();
  saveBancoLocal();
  renderBanco();
  closeB2bModal();
  showToast(`B2B: ${novos} novo(s), ${atualizados} atualizado(s) de ${fornecedor}`);
};

function renderAnaliseCompetitiva(preOrcamento) {
  if (!preOrcamento || !preOrcamento.itens || preOrcamento.itens.length === 0) return "";

  let valorTotal = 0, somaMargens = 0, countMargens = 0;
  let riscos = 0;

  preOrcamento.itens.forEach(function(item) {
    const valor = (item.precoUnitario || 0) * (item.quantidade || 0);
    valorTotal += valor;
    if (item.custoUnitario > 0 && item.precoUnitario > 0) {
      somaMargens += (item.precoUnitario - item.custoUnitario) / item.custoUnitario;
      countMargens++;
    }
    // Check if competitor is cheaper
    const sugestao = calcPrecoSugerido(item.nome);
    if (sugestao && sugestao.menorConc && item.precoUnitario > sugestao.menorConc) riscos++;
  });

  const margemMedia = countMargens > 0 ? (somaMargens / countMargens * 100).toFixed(1) : "\u2014";
  const margemClass = parseFloat(margemMedia) >= 15 ? "color:#27ae60" : parseFloat(margemMedia) >= 5 ? "color:#f39c12" : "color:#e74c3c";

  return '<div style="background:#f8f9fa;padding:0.75rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;">' +
    '<strong>Análise Competitiva</strong>' +
    '<div style="display:flex;gap:1.5rem;margin-top:0.5rem;">' +
      '<span>Valor: <strong>' + brl.format(valorTotal) + '</strong></span>' +
      '<span>Margem média: <strong style="' + margemClass + '">' + margemMedia + '%</strong></span>' +
      '<span>Itens de risco: <strong style="color:' + (riscos > 0 ? '#e74c3c' : '#27ae60') + '">' + riscos + '</strong></span>' +
    '</div>' +
  '</div>';
}

function openBancoModal(item) {
  el.modalBanco.style.display = "flex";
  el.modalBancoTitulo.textContent = item ? "Editar Item" : "Novo Item";
  el.modalItem.value = item ? item.item : "";
  el.modalGrupo.value = item ? item.grupo : (el.modalGrupo.options[0] ? el.modalGrupo.options[0].value : "");
  el.modalUnidade.value = item ? (item.unidade || "") : "";
  el.modalCusto.value = item ? item.custoBase : "";
  el.modalMargem.value = item ? (item.margemPadrao * 100).toFixed(0) : "30";
  el.modalMarca.value = item ? (item.marca || "") : "";
  el.modalFonte.value = item ? (item.fonte || "") : "";
  el.modalPrecoFornecedor.value = "";
  editingBancoId = item ? item.id : null;
}

function closeBancoModal() {
  el.modalBanco.style.display = "none";
  editingBancoId = null;
}

function salvarBancoItem() {
  const nome = el.modalItem.value.trim();
  if (!nome) { alert("Informe o nome do item."); return; }

  const precoFornecedor = parseFloat(el.modalPrecoFornecedor.value) || 0;
  let custo = parseFloat(el.modalCusto.value) || 0;

  // Se fornecedor price provided, update custoBase to it
  if (precoFornecedor > 0) custo = precoFornecedor;

  const margem = Math.max(0, Math.min(100, parseFloat(el.modalMargem.value) || 30)) / 100;
  const preco = Math.round(custo * (1 + margem) * 100) / 100;
  const todayStr = new Date().toISOString().slice(0, 10);

  if (editingBancoId) {
    const idx = bancoPrecos.itens.findIndex((i) => i.id === editingBancoId);
    if (idx >= 0) {
      const existing = bancoPrecos.itens[idx];
      bancoPrecos.itens[idx] = {
        ...existing,
        item: nome,
        marca: el.modalMarca.value.trim(),
        grupo: el.modalGrupo.value,
        unidade: el.modalUnidade.value.trim() || "Unidade",
        custoBase: custo,
        margemPadrao: margem,
        precoReferencia: preco,
        ultimaCotacao: todayStr,
        fonte: el.modalFonte.value.trim(),
      };
      // Push to custosFornecedor if fornecedor price provided
      if (precoFornecedor > 0) {
        if (!bancoPrecos.itens[idx].custosFornecedor) bancoPrecos.itens[idx].custosFornecedor = [];
        bancoPrecos.itens[idx].custosFornecedor.push({
          fornecedor: el.modalFonte.value.trim() || "Manual",
          preco: precoFornecedor,
          data: todayStr,
        });
      }
    }
  } else {
    const newId = "bp-" + String(Date.now()).slice(-6);
    const newItem = {
      id: newId,
      item: nome,
      marca: el.modalMarca.value.trim(),
      grupo: el.modalGrupo.value,
      unidade: el.modalUnidade.value.trim() || "Unidade",
      custoBase: custo,
      margemPadrao: margem,
      precoReferencia: preco,
      ultimaCotacao: todayStr,
      fonte: el.modalFonte.value.trim(),
      propostas: [],
      concorrentes: [],
      custosFornecedor: [],
    };
    // Push to custosFornecedor if fornecedor price provided
    if (precoFornecedor > 0) {
      newItem.custosFornecedor.push({
        fornecedor: el.modalFonte.value.trim() || "Manual",
        preco: precoFornecedor,
        data: todayStr,
      });
    }
    bancoPrecos.itens.push(newItem);
  }

  saveBancoLocal();
  closeBancoModal();
  renderBanco();
}

// ===== BANCO: BULK SELECTION & DELETE =====
function updateBancoSelectionUI() {
  const checks = document.querySelectorAll(".banco-item-check:checked");
  const btn = document.getElementById("btn-excluir-selecionados-banco");
  const countEl = document.getElementById("banco-sel-count");
  if (btn) {
    btn.style.display = checks.length > 0 ? "inline-block" : "none";
    if (countEl) countEl.textContent = checks.length;
  }
}

window.excluirSelecionadosBanco = function () {
  const checks = document.querySelectorAll(".banco-item-check:checked");
  const ids = Array.from(checks).map(c => c.dataset.id);
  if (ids.length === 0) return;
  if (!confirm(`Excluir ${ids.length} item(ns) do banco de preços?`)) return;
  bancoPrecos.itens = bancoPrecos.itens.filter(i => !ids.includes(i.id));
  saveBancoLocal();
  renderBanco();
};

window.editarBancoItem = function (id) {
  const item = bancoPrecos.itens.find((i) => i.id === id);
  if (item) openBancoModal(item);
};

window.removerBancoItem = function (id) {
  if (!confirm("Remover este item do banco de preços?")) return;
  bancoPrecos.itens = bancoPrecos.itens.filter((i) => i.id !== id);
  saveBancoLocal();
  renderBanco();
};

function limparBanco() {
  const total = bancoPrecos.itens.length;
  const importados = bancoPrecos.itens.filter((i) => i.grupo === "Importado").length;

  const opcao = prompt(
    `Banco tem ${total} itens (${importados} importados).\n\n` +
    `Digite:\n` +
    `1 = Limpar APENAS importados (dados bugados)\n` +
    `2 = Limpar TUDO (resetar banco completo)\n` +
    `0 = Cancelar`
  );

  if (opcao === "1") {
    bancoPrecos.itens = bancoPrecos.itens.filter((i) => i.grupo !== "Importado");
    saveBancoLocal();
    renderBanco();
    alert(`${importados} itens importados removidos.`);
  } else if (opcao === "2") {
    if (!confirm("Tem certeza? Isso apagará TODOS os itens do banco de preços.")) return;
    bancoPrecos = { updatedAt: "", itens: [] };
    saveBancoLocal();
    renderBanco();
    alert("Banco de preços limpo.");
  }
}
