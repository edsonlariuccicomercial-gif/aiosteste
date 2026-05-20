/* Commercial Agents — Radar + Intel Precos */
(function () {
  const AGENTS_KEY = "caixaescolar.agentes.v1";
  const BRAND_CANDIDATES = [
    "Katun", "By Qualy", "Qualy", "Profit", "Evolut", "Maxprint", "Printec",
    "Resolution", "Premium", "Lotus", "CET", "Masterprint", "Elgin"
  ];

  const state = {
    open: false,
    activeAgent: "revisor",
    history: loadState().history || [],
  };

  const agents = {
    radar: {
      name: "Radar",
      role: "Prioriza oportunidades por prazo, valor, produto e risco.",
      quick: ["Fila de hoje", "Oportunidades toner", "Riscos do radar"],
    },
    compatibilidade: {
      name: "Compatibilidade",
      role: "Confere modelo, original/compativel, marcas citadas e unidade.",
      quick: ["Revisar marcas", "Itens originais", "Aplicar marca sugerida"],
    },
    precos: {
      name: "Precos",
      role: "Calcula margem, custo, preco sugerido e alerta de frete.",
      quick: ["Aplicar margem inteligente", "Resumo de margem", "Preco seguro"],
    },
    revisor: {
      name: "Revisor",
      role: "Diz se pode enviar, revisar ou descartar antes do SGD.",
      quick: ["Posso enviar?", "Pendencias", "Registrar parecer"],
    },
  };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(AGENTS_KEY) || "{}"); } catch (_) { return {}; }
  }

  function saveState(extra) {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      history: state.history.slice(-120),
      ...extra,
    };
    localStorage.setItem(AGENTS_KEY, JSON.stringify(payload));
    if (typeof schedulCloudSync === "function") schedulCloudSync();
  }

  function esc(v) {
    if (typeof escapeHtml === "function") return escapeHtml(v);
    return String(v || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function money(v) {
    if (typeof brl !== "undefined" && brl.format) return brl.format(Number(v) || 0);
    return "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
  }

  function norm(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function getActivePre() {
    const id = typeof activePreOrcamentoId !== "undefined" ? activePreOrcamentoId : null;
    if (id && typeof preOrcamentos !== "undefined" && preOrcamentos[id]) return preOrcamentos[id];
    const pres = typeof preOrcamentos !== "undefined" ? Object.values(preOrcamentos) : [];
    return pres.find((p) => p.status === "pendente" || p.status === "aprovado") || pres[0] || null;
  }

  function getOrc(pre) {
    if (!pre || typeof orcamentos === "undefined") return null;
    return orcamentos.find((o) => String(o.id) === String(pre.orcamentoId) || String(o.idBudget) === String(pre.idBudget));
  }

  function extractBrands(text) {
    const source = norm(text);
    return BRAND_CANDIDATES.filter((brand) => source.includes(norm(brand)));
  }

  function itemText(item) {
    return [item.nome, item.descricao, item.observacao].filter(Boolean).join(" ");
  }

  function analyzePre(pre) {
    if (!pre) {
      return {
        decision: "sem-contexto",
        title: "Abra ou selecione um pre-orcamento para analise.",
        score: 0,
        risks: ["Nenhum pre-orcamento ativo."],
        actions: ["Varrer SGD ou abrir uma oportunidade do Radar."],
        brands: [],
        margin: 0,
      };
    }

    const orc = getOrc(pre);
    const itens = pre.itens || [];
    const text = [pre.observacaoGeral, orc && orc.objeto, ...itens.map(itemText)].join(" ");
    const ntext = norm(text);
    const total = Number(pre.totalGeral || itens.reduce((s, i) => s + Number(i.precoTotal || 0), 0));
    const margin = calcMargin(pre);
    const brands = extractBrands(text);
    const risks = [];
    const actions = [];

    if (ntext.includes("original") && ntext.includes("compativel")) {
      risks.push("Texto aceita original ou compativel; conferir marca antes do envio.");
    } else if (ntext.includes("original")) {
      risks.push("A escola cita original. Bloquear se o fornecedor oferecer apenas compativel.");
      actions.push("Confirmar produto original ou descartar.");
    }

    if (ntext.includes("sera aceita somente") || ntext.includes("somente a marca") || ntext.includes("marca informada")) {
      risks.push("Ha exigencia forte de marca no texto da escola.");
      actions.push("Preencher a marca exatamente como aceita.");
    } else if (brands.length) {
      risks.push("Ha marcas de referencia: " + brands.join(", ") + ".");
      actions.push("Escolher marca disponivel no fornecedor antes do envio.");
    }

    const semPreco = itens.filter((i) => !Number(i.precoUnitario));
    const semQtd = itens.filter((i) => !Number(i.quantidade));
    if (semPreco.length) risks.push(semPreco.length + " item(ns) sem preco unitario.");
    if (semQtd.length) risks.push(semQtd.length + " item(ns) sem quantidade valida.");
    if (total < 600) risks.push("Contrato pequeno: frete pode consumir margem.");
    if (margin < 0.25) risks.push("Margem abaixo de 25%; revisar preco.");
    if (!itens.length) risks.push("Nenhum item no pre-orcamento.");

    const decision = risks.some((r) => r.includes("Bloquear") || r.includes("sem preco") || r.includes("sem quantidade"))
      ? "bloquear"
      : risks.length
        ? "revisar"
        : "pronto";

    return {
      decision,
      title: decision === "pronto" ? "Pode seguir para envio." : decision === "revisar" ? "Revisar antes de enviar." : "Nao enviar sem correcao.",
      score: decision === "pronto" ? 92 : decision === "revisar" ? 68 : 35,
      risks,
      actions: actions.length ? actions : ["Manter preco e registrar justificativa."],
      brands,
      suggestedBrand: pickBrand(brands),
      margin,
      total,
      itens: itens.length,
      escola: pre.escola || (orc && orc.escola) || "Escola nao identificada",
      municipio: pre.municipio || (orc && orc.municipio) || "",
    };
  }

  function calcMargin(pre) {
    const itens = pre && pre.itens ? pre.itens : [];
    let cost = 0;
    let sale = 0;
    itens.forEach((i) => {
      const qty = Number(i.quantidade || 0);
      const unit = Number(i.precoUnitario || 0);
      const itemCost = Number(i.custoUnitario || i.custo || 0);
      sale += unit * qty;
      cost += itemCost * qty;
    });
    return sale > 0 && cost > 0 ? (sale - cost) / sale : Number(pre && pre.margemMedia) || 0;
  }

  function pickBrand(brands) {
    if (!brands || !brands.length) return "";
    const preferred = ["By Qualy", "Profit", "Katun", "Evolut", "Maxprint", "Printec", "Resolution"];
    return preferred.find((b) => brands.map(norm).includes(norm(b))) || brands[0];
  }

  function analyzeRadar() {
    const rows = typeof orcamentos !== "undefined" ? orcamentos : [];
    const open = rows.filter((o) => o.status === "aberto");
    const toner = open.filter((o) => norm([o.objeto, ...(o.itens || []).map((i) => i.descricao || i.nome)].join(" ")).includes("toner"));
    const dueToday = open.filter((o) => typeof daysTo === "function" && daysTo(o.prazo) <= 1);
    return [
      `Radar atual: ${open.length} oportunidades abertas.`,
      `Toner/compatíveis encontrados: ${toner.length}.`,
      `Vencendo hoje/amanhã: ${dueToday.length}.`,
      "Proxima acao: rodar compatibilidade e preco nos itens A antes de enviar.",
    ];
  }

  function applySmartMargin() {
    const pre = getActivePre();
    if (!pre || !pre.itens) return "Abra um pre-orcamento antes de aplicar margem.";
    const totalCost = pre.itens.reduce((s, i) => s + (Number(i.custoUnitario || i.custo || 0) * Number(i.quantidade || 0)), 0);
    const margin = totalCost <= 1000 ? 0.40 : 0.35;
    pre.itens.forEach((i) => {
      const cost = Number(i.custoUnitario || i.custo || 0);
      const qty = Number(i.quantidade || 0);
      if (cost > 0) {
        i.margem = margin;
        i.precoUnitario = Number((cost * (1 + margin)).toFixed(2));
        i.precoTotal = Number((i.precoUnitario * qty).toFixed(2));
      }
    });
    pre.totalGeral = Number(pre.itens.reduce((s, i) => s + Number(i.precoTotal || 0), 0).toFixed(2));
    pre.margemMedia = margin;
    pre.agenteAtualizadoEm = new Date().toISOString();
    savePreOrcamentos();
    if (typeof abrirPreOrcamento === "function" && typeof activePreOrcamentoId !== "undefined" && activePreOrcamentoId) abrirPreOrcamento(activePreOrcamentoId);
    if (typeof showToast === "function") showToast("Agente de Precos aplicou margem " + Math.round(margin * 100) + "%.");
    return `Margem ${Math.round(margin * 100)}% aplicada. Novo total: ${money(pre.totalGeral)}.`;
  }

  function applySuggestedBrand() {
    const pre = getActivePre();
    const analysis = analyzePre(pre);
    if (!pre || !pre.itens || !analysis.suggestedBrand) return "Nao encontrei marca de referencia no texto para aplicar.";
    pre.itens.forEach((item) => {
      const text = itemText(item);
      const itemBrands = extractBrands(text);
      const brand = pickBrand(itemBrands) || analysis.suggestedBrand;
      item.marca = brand;
      item.observacao = `[Marca: ${brand}] ` + String(item.descricao || item.nome || "Conforme especificado").replace(/\[Marca:[^\]]+\]\s*/g, "").trim();
    });
    pre.agenteAtualizadoEm = new Date().toISOString();
    savePreOrcamentos();
    if (typeof abrirPreOrcamento === "function" && typeof activePreOrcamentoId !== "undefined" && activePreOrcamentoId) abrirPreOrcamento(activePreOrcamentoId);
    if (typeof showToast === "function") showToast("Marca sugerida aplicada pelo agente.");
    return `Apliquei marca de referencia nos itens. Marca principal: ${analysis.suggestedBrand}.`;
  }

  function buildAnswer(input) {
    const prompt = norm(input);
    const pre = getActivePre();
    const a = analyzePre(pre);

    if (prompt.includes("margem inteligente") || prompt.includes("aplicar margem")) return applySmartMargin();
    if (prompt.includes("aplicar marca") || prompt.includes("marca sugerida")) return applySuggestedBrand();
    if (prompt.includes("fila") || prompt.includes("radar") || prompt.includes("oportunidade")) return analyzeRadar().join("\n");
    if (prompt.includes("marca")) {
      return a.brands.length
        ? `Marcas encontradas: ${a.brands.join(", ")}.\nSugestao: usar ${a.suggestedBrand} quando estiver disponivel no fornecedor. Garantia deve ficar em campo separado.`
        : "Nao encontrei marca obrigatoria ou de referencia no texto do orcamento ativo.";
    }
    if (prompt.includes("preco") || prompt.includes("margem")) {
      return `Total: ${money(a.total)}.\nMargem estimada: ${Math.round(a.margin * 100)}%.\nRegra sugerida: contratos pequenos com 40%; maiores com 35%, ajustando frete por municipio.`;
    }
    if (prompt.includes("registrar parecer")) {
      const note = { id: "AG-" + Date.now(), at: new Date().toISOString(), agent: state.activeAgent, orcamentoId: pre && pre.orcamentoId, analysis: a };
      state.history.push(note);
      saveState();
      return `Parecer registrado para ${pre ? pre.orcamentoId : "orcamento ativo"}: ${a.title}`;
    }
    return `${a.title}\nEscola: ${a.escola}${a.municipio ? " — " + a.municipio : ""}\nTotal: ${money(a.total)} | Itens: ${a.itens} | Margem: ${Math.round(a.margin * 100)}%\nRiscos: ${a.risks.length ? a.risks.join("; ") : "sem risco critico"}\nAcoes: ${a.actions.join("; ")}`;
  }

  function addMessage(role, text) {
    state.history.push({ id: "MSG-" + Date.now(), at: new Date().toISOString(), agent: state.activeAgent, role, text });
    state.history = state.history.slice(-120);
    saveState();
    renderMessages();
  }

  function ask(text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    addMessage("user", clean);
    addMessage("agent", buildAnswer(clean));
  }

  function renderShell() {
    if (document.getElementById("commercial-agents-root")) return;
    const root = document.createElement("div");
    root.id = "commercial-agents-root";
    root.innerHTML = `
      <button class="agents-fab" id="agents-open-btn" type="button" title="Abrir agentes comerciais">Agentes</button>
      <aside class="agents-panel" id="agents-panel" aria-label="Agentes comerciais">
        <div class="agents-head">
          <div>
            <strong>Agentes Comerciais</strong>
            <span id="agents-context">Radar + Intel Precos</span>
          </div>
          <button class="agents-close" id="agents-close-btn" type="button" title="Fechar">×</button>
        </div>
        <div class="agents-tabs" id="agents-tabs"></div>
        <div class="agents-role" id="agents-role"></div>
        <div class="agents-summary" id="agents-summary"></div>
        <div class="agents-quick" id="agents-quick"></div>
        <div class="agents-chat" id="agents-chat"></div>
        <form class="agents-input" id="agents-form">
          <input id="agents-input" type="text" placeholder="Pergunte ao agente sobre o orçamento aberto..." autocomplete="off" />
          <button type="submit">Enviar</button>
        </form>
      </aside>`;
    document.body.appendChild(root);
    document.getElementById("agents-open-btn").addEventListener("click", () => togglePanel(true));
    document.getElementById("agents-close-btn").addEventListener("click", () => togglePanel(false));
    document.getElementById("agents-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const input = document.getElementById("agents-input");
      ask(input.value);
      input.value = "";
    });
    renderAgents();
  }

  function togglePanel(force) {
    state.open = typeof force === "boolean" ? force : !state.open;
    const panel = document.getElementById("agents-panel");
    if (panel) panel.classList.toggle("open", state.open);
    if (state.open) renderAgents();
  }

  function renderAgents() {
    const tabs = document.getElementById("agents-tabs");
    if (!tabs) return;
    tabs.innerHTML = Object.entries(agents).map(([id, a]) =>
      `<button type="button" class="${id === state.activeAgent ? "active" : ""}" data-agent="${id}">${esc(a.name)}</button>`
    ).join("");
    tabs.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
      state.activeAgent = btn.dataset.agent;
      renderAgents();
    }));
    const active = agents[state.activeAgent];
    document.getElementById("agents-role").textContent = active.role;
    const analysis = analyzePre(getActivePre());
    document.getElementById("agents-context").textContent = analysis.escola || "Sem orcamento ativo";
    document.getElementById("agents-summary").innerHTML = `
      <div><span>Decisao</span><strong class="agents-decision-${analysis.decision}">${esc(analysis.title)}</strong></div>
      <div><span>Confianca</span><strong>${analysis.score}%</strong></div>
      <div><span>Total</span><strong>${money(analysis.total)}</strong></div>`;
    document.getElementById("agents-quick").innerHTML = active.quick.map((q) => `<button type="button">${esc(q)}</button>`).join("");
    document.querySelectorAll("#agents-quick button").forEach((btn) => btn.addEventListener("click", () => ask(btn.textContent)));
    renderMessages();
  }

  function renderMessages() {
    const box = document.getElementById("agents-chat");
    if (!box) return;
    const items = state.history.filter((m) => m.role).slice(-18);
    if (!items.length) {
      box.innerHTML = `<div class="agents-empty">Abra um pre-orcamento e pergunte: "posso enviar?", "revisar marcas" ou "aplicar margem inteligente".</div>`;
      return;
    }
    box.innerHTML = items.map((m) => `<div class="agents-msg ${m.role === "user" ? "user" : "agent"}"><span>${esc(agents[m.agent]?.name || "Agente")}</span><p>${esc(m.text).replace(/\n/g, "<br>")}</p></div>`).join("");
    box.scrollTop = box.scrollHeight;
  }

  document.addEventListener("DOMContentLoaded", renderShell);

  window.CommercialAgents = {
    open: () => togglePanel(true),
    analyzeActive: () => analyzePre(getActivePre()),
    ask,
    applySmartMargin,
    applySuggestedBrand,
  };
})();
