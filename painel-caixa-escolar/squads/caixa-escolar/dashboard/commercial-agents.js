/* Commercial Agents — Radar + Intel Precos */
(function () {
  const AGENTS_KEY = "caixaescolar.agentes.v1";
  const BRAND_CANDIDATES = [
    "Katun", "By Qualy", "Qualy", "Profit", "Evolut", "Maxprint", "Printec",
    "Resolution", "Premium", "Lotus", "CET", "Masterprint", "Elgin"
  ];
  const DEFAULT_BRIEFING = {
    focus: "Toner compativel, papelaria e oportunidades com margem defensavel",
    smallDealLimit: 1000,
    smallDealMargin: 40,
    regularMargin: 35,
    freightCautionLimit: 600,
    preferredBrands: "By Qualy, Profit, Katun, Evolut, Maxprint",
    notes: "Nao enviar sem revisar prazo, marca e compatibilidade do item.",
  };
  const persisted = loadState();

  const state = {
    open: false,
    activeAgent: "revisor",
    briefingOpen: false,
    history: persisted.history || [],
    briefing: normalizeBriefing(persisted.briefing),
  };

  const agents = {
    radar: {
      name: "Radar",
      handle: "@radar",
      role: "Garimpa a fila do SGD e separa onde vale gastar energia comercial.",
      stance: "Olha prazo, objeto, ruido e chance de venda antes de pedir cotacao.",
      quick: ["Fila de hoje", "Oportunidades toner", "Meu briefing"],
    },
    compatibilidade: {
      name: "Conferente",
      handle: "@conferente",
      role: "Protege a proposta contra erro de modelo, marca, original e unidade.",
      stance: "Prefere travar um envio duvidoso a entregar item errado para a escola.",
      quick: ["Revisar marcas", "Pendencias", "Aplicar marca sugerida"],
    },
    precos: {
      name: "Precificador",
      handle: "@precificador",
      role: "Defende margem e frete sem perder a oportunidade boa.",
      stance: "Usa as regras comerciais do briefing e avisa quando o preco esta fragil.",
      quick: ["Aplicar margem inteligente", "Resumo de margem", "Preco seguro"],
    },
    revisor: {
      name: "Mesa Comercial",
      handle: "@mesa",
      role: "Fecha o parecer: seguir, revisar ou segurar antes do SGD.",
      stance: "Junta Radar, Conferente e Precificador em uma recomendacao objetiva.",
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
      briefing: state.briefing,
      ...extra,
    };
    localStorage.setItem(AGENTS_KEY, JSON.stringify(payload));
    if (typeof schedulCloudSync === "function") schedulCloudSync();
  }

  function normalizeBriefing(saved) {
    const briefing = { ...DEFAULT_BRIEFING, ...(saved || {}) };
    ["smallDealLimit", "smallDealMargin", "regularMargin", "freightCautionLimit"].forEach((key) => {
      const n = Number(briefing[key]);
      briefing[key] = Number.isFinite(n) && n > 0 ? n : DEFAULT_BRIEFING[key];
    });
    return briefing;
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

  function csvList(v) {
    return String(v || "").split(",").map((item) => item.trim()).filter(Boolean);
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
        targetMargin: state.briefing.smallDealMargin / 100,
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
    if (total < state.briefing.freightCautionLimit) {
      risks.push(`Contrato abaixo de ${money(state.briefing.freightCautionLimit)}: frete pode consumir margem.`);
    }
    const targetMargin = total <= state.briefing.smallDealLimit ? state.briefing.smallDealMargin / 100 : state.briefing.regularMargin / 100;
    if (margin > 0 && margin < targetMargin) {
      risks.push(`Margem estimada abaixo da regra do briefing (${Math.round(targetMargin * 100)}%).`);
      actions.push("Rever custo, frete e margem antes de fechar.");
    }
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
      targetMargin,
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
    const preferred = csvList(state.briefing.preferredBrands);
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
      `Foco do briefing: ${state.briefing.focus}.`,
      "Minha leitura: priorize os prazos curtos e leve os itens promissores para Conferente e Precificador.",
    ];
  }

  function applySmartMargin() {
    const pre = getActivePre();
    if (!pre || !pre.itens) return "Abra um pre-orcamento antes de aplicar margem.";
    const totalCost = pre.itens.reduce((s, i) => s + (Number(i.custoUnitario || i.custo || 0) * Number(i.quantidade || 0)), 0);
    const margin = totalCost <= state.briefing.smallDealLimit
      ? state.briefing.smallDealMargin / 100
      : state.briefing.regularMargin / 100;
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
    if (prompt.includes("briefing") || prompt.includes("memoria") || prompt.includes("regra")) return briefingAnswer();
    if (prompt.includes("marca")) {
      return a.brands.length
        ? `Marcas encontradas: ${a.brands.join(", ")}.\nSugestao: usar ${a.suggestedBrand} quando estiver disponivel no fornecedor. Garantia deve ficar em campo separado.`
        : "Nao encontrei marca obrigatoria ou de referencia no texto do orcamento ativo.";
    }
    if (prompt.includes("preco") || prompt.includes("margem")) {
      return `Estou olhando ${money(a.total)} nesse pre-orcamento.\nMargem estimada: ${Math.round(a.margin * 100)}%. Alvo do briefing: ${Math.round(a.targetMargin * 100)}%.\nRegra ativa: ate ${money(state.briefing.smallDealLimit)} usa ${state.briefing.smallDealMargin}%; acima disso usa ${state.briefing.regularMargin}%.`;
    }
    if (prompt.includes("registrar parecer")) {
      const note = { id: "AG-" + Date.now(), at: new Date().toISOString(), agent: state.activeAgent, orcamentoId: pre && pre.orcamentoId, analysis: a };
      state.history.push(note);
      saveState();
      return `Parecer registrado para ${pre ? pre.orcamentoId : "orcamento ativo"}: ${a.title}`;
    }
    return recommendationFor(state.activeAgent, a);
  }

  function briefingAnswer() {
    return [
      `Foco comercial: ${state.briefing.focus}.`,
      `Margens: ${state.briefing.smallDealMargin}% ate ${money(state.briefing.smallDealLimit)}; ${state.briefing.regularMargin}% acima disso.`,
      `Frete: acender alerta abaixo de ${money(state.briefing.freightCautionLimit)}.`,
      `Marcas preferidas: ${csvList(state.briefing.preferredBrands).join(", ") || "nenhuma priorizada"}.`,
      `Nota da mesa: ${state.briefing.notes}`,
    ].join("\n");
  }

  function recommendationFor(agentId, a) {
    if (!a.total && a.decision === "sem-contexto") return a.title;
    const location = `${a.escola}${a.municipio ? " - " + a.municipio : ""}`;
    const riskText = a.risks.length ? a.risks.join("; ") : "nao vi bloqueio critico no texto ativo";
    const actionText = a.actions.join("; ");
    if (agentId === "radar") {
      return `Eu colocaria ${location} na fila com status ${a.title.toLowerCase()}\nValor em jogo: ${money(a.total)} em ${a.itens} item(ns).\nSinal do Radar: ${riskText}.\nProximo passo: ${actionText}`;
    }
    if (agentId === "compatibilidade") {
      return `Conferi o recorte do item para ${location}.\nMarca/modelo: ${a.brands.length ? "texto cita " + a.brands.join(", ") : "sem marca de referencia encontrada"}.\nPonto de atencao: ${riskText}.\nEu so liberaria depois de: ${actionText}`;
    }
    if (agentId === "precos") {
      return `Preco sob leitura para ${location}.\nTotal: ${money(a.total)}. Margem estimada: ${Math.round(a.margin * 100)}%; alvo do briefing: ${Math.round(a.targetMargin * 100)}%.\nMinha trava agora: ${riskText}.\nAjuste sugerido: ${actionText}`;
    }
    return `${a.title}\nMinha leitura para ${location}: ${money(a.total)} em ${a.itens} item(ns), com margem estimada de ${Math.round(a.margin * 100)}%.\nO que pesa na decisao: ${riskText}.\nAntes do SGD: ${actionText}`;
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
          <div class="agents-head-actions">
            <button class="agents-head-btn" id="agents-briefing-btn" type="button" title="Configurar briefing">Briefing</button>
            <button class="agents-close" id="agents-close-btn" type="button" title="Fechar">x</button>
          </div>
        </div>
        <div class="agents-tabs" id="agents-tabs"></div>
        <div class="agents-profile">
          <div class="agents-role" id="agents-role"></div>
          <div class="agents-stance" id="agents-stance"></div>
        </div>
        <form class="agents-briefing" id="agents-briefing" hidden>
          <label>Foco comercial<input name="focus" type="text" /></label>
          <div class="agents-briefing-grid">
            <label>Limite pequeno<input name="smallDealLimit" type="number" min="1" step="50" /></label>
            <label>Margem pequeno<input name="smallDealMargin" type="number" min="1" step="1" /></label>
            <label>Margem maior<input name="regularMargin" type="number" min="1" step="1" /></label>
            <label>Alerta frete<input name="freightCautionLimit" type="number" min="1" step="50" /></label>
          </div>
          <label>Marcas preferidas<input name="preferredBrands" type="text" /></label>
          <label>Nota da mesa<textarea name="notes" rows="2"></textarea></label>
          <button type="submit">Salvar briefing</button>
        </form>
        <div class="agents-memory" id="agents-memory"></div>
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
    document.getElementById("agents-briefing-btn").addEventListener("click", () => toggleBriefing());
    document.getElementById("agents-briefing").addEventListener("submit", saveBriefing);
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
    document.getElementById("agents-role").innerHTML = `<strong>${esc(active.handle)}</strong> ${esc(active.role)}`;
    document.getElementById("agents-stance").textContent = active.stance;
    const analysis = analyzePre(getActivePre());
    document.getElementById("agents-context").textContent = analysis.escola || "Sem orcamento ativo";
    renderMemory();
    document.getElementById("agents-summary").innerHTML = `
      <div><span>Decisao</span><strong class="agents-decision-${analysis.decision}">${esc(analysis.title)}</strong></div>
      <div><span>Confianca</span><strong>${analysis.score}%</strong></div>
      <div><span>Total</span><strong>${money(analysis.total)}</strong></div>`;
    document.getElementById("agents-quick").innerHTML = active.quick.map((q) => `<button type="button">${esc(q)}</button>`).join("");
    document.querySelectorAll("#agents-quick button").forEach((btn) => btn.addEventListener("click", () => ask(btn.textContent)));
    renderMessages();
  }

  function toggleBriefing(force) {
    state.briefingOpen = typeof force === "boolean" ? force : !state.briefingOpen;
    const form = document.getElementById("agents-briefing");
    if (!form) return;
    fillBriefingForm(form);
    form.hidden = !state.briefingOpen;
    document.getElementById("agents-briefing-btn").classList.toggle("active", state.briefingOpen);
  }

  function fillBriefingForm(form) {
    Object.entries(state.briefing).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value;
    });
  }

  function saveBriefing(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const next = {};
    Object.keys(DEFAULT_BRIEFING).forEach((key) => {
      next[key] = form.elements[key] ? form.elements[key].value.trim() : state.briefing[key];
    });
    state.briefing = normalizeBriefing(next);
    saveState();
    toggleBriefing(false);
    addMessage("agent", "Briefing salvo. Vou usar essas margens, alertas e preferencias nos proximos pareceres.");
    renderAgents();
  }

  function renderMemory() {
    const box = document.getElementById("agents-memory");
    if (!box) return;
    const chips = [
      `Foco: ${state.briefing.focus}`,
      `Margem: ${state.briefing.smallDealMargin}% / ${state.briefing.regularMargin}%`,
      `Frete alerta: ${money(state.briefing.freightCautionLimit)}`,
    ];
    box.innerHTML = chips.map((chip) => `<span>${esc(chip)}</span>`).join("");
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
