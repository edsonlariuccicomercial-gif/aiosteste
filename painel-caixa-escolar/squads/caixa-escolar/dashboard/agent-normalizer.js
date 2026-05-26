/* Mesa do Agente — normalizacao de itens SGD para produto cotavel */
(function () {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const STORE_KEY = "intel.normalizacoes-sgd.v1";
  const KEYWORDS = [
    { base: "arroz", terms: ["arroz"], subtypes: ["tipo 1", "agulhinha", "longo fino"] },
    { base: "feijao carioca", terms: ["feijao carioca", "carioquinha"], subtypes: ["tipo 1", "safra nova"] },
    { base: "feijao preto", terms: ["feijao preto"], subtypes: ["tipo 1", "safra nova"] },
    { base: "feijao vermelho", terms: ["feijao vermelho"], subtypes: ["tipo 1", "safra nova"] },
    { base: "macarrao espaguete", terms: ["macarrao espaguete", "tipo espaguete", "espagueti"], subtypes: ["com ovos", "n 8", "nº 8"] },
    { base: "macarrao parafuso", terms: ["macarrao parafuso", "tipo parafuso"], subtypes: ["com ovos"] },
    { base: "macarrao pai nosso", terms: ["macarrao pai nosso", "tipo pai nosso", "sopa"], subtypes: ["com ovos"] },
    { base: "oleo de soja", terms: ["oleo de soja", "óleo de soja"], subtypes: ["refinado", "tipo 1"] },
    { base: "acucar cristal", terms: ["acucar cristal", "açucar cristal", "açúcar cristal", "acucar"], subtypes: ["cristal"] },
    { base: "farinha de trigo", terms: ["farinha de trigo"], subtypes: ["sem fermento", "com fermento"] },
    { base: "farinha de mandioca", terms: ["farinha de mandioca"], subtypes: [] },
    { base: "farinha de milho", terms: ["farinha de milho"], subtypes: ["flocos"] },
    { base: "leite integral", terms: ["leite integral", "leite uht"], subtypes: ["uht", "longa vida"] },
    { base: "margarina", terms: ["margarina"], subtypes: [] },
    { base: "manteiga", terms: ["manteiga"], subtypes: ["com sal", "sem sal"] },
  ];
  const LEGAL_NOISE = [
    "embalagem", "plastica", "atoxica", "transparente", "nao violada", "contendo dados",
    "identificacao", "procedencia", "ingredientes", "informacoes nutricionais", "lote",
    "fabricacao", "vencimento", "validade minima", "sujidades", "mofos", "parasitas",
    "rotulagem", "entrega de acordo", "prazo de validade", "isento"
  ];

  function norm(value) {
    return String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function title(value) {
    return String(value || "").replace(/\w\S*/g, (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return raw.items || (Array.isArray(raw) ? raw : []);
    } catch (_) {
      return [];
    }
  }

  function saveStore(items) {
    const wrapped = { _v: 1, updatedAt: new Date().toISOString(), items };
    localStorage.setItem(STORE_KEY, JSON.stringify(wrapped));
    if (typeof schedulCloudSync === "function") schedulCloudSync();
  }

  function decisionKey(orcId, row) {
    return [orcId || "", row.idx, norm(row.analysis.parsed.raw)].join("::");
  }

  function getLearnedDecision(parsed) {
    const normalized = norm(parsed.raw);
    return loadStore()
      .filter((row) => row.aprovado_por_usuario && row.produto_id && row.descricao_normalizada === normalized)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  }

  function recordDecision(pre, row, action) {
    const chosen = row.analysis.chosen;
    const orcId = pre?.orcamentoId || (typeof activePreOrcamentoId !== "undefined" ? activePreOrcamentoId : "");
    const key = decisionKey(orcId, row);
    const items = loadStore();
    const idx = items.findIndex((item) => item.key === key);
    const previous = idx >= 0 ? items[idx] : {};
    const canUseChosen = row.analysis.status === "pronto";
    const entry = {
      key,
      id: idx >= 0 ? items[idx].id : "NORM-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      orcamento_id: orcId || "",
      item_index: row.idx,
      descricao_original: row.analysis.parsed.raw,
      descricao_normalizada: norm(row.analysis.parsed.raw),
      produto_canonico: row.analysis.parsed.canonical,
      produto_id: canUseChosen ? (chosen?.id || "") : "",
      produto_nome: canUseChosen ? (chosen?.name || "") : (chosen?.name || ""),
      marcas_extraidas: row.analysis.parsed.brands,
      marca_escolhida: canUseChosen ? (chosen?.brand || "") : "",
      custo_escolhido: canUseChosen ? (chosen?.cost || 0) : 0,
      preco_referencia_sgd: row.analysis.parsed.referencePrice || 0,
      status: row.analysis.status,
      confianca: chosen?.score || 0,
      acao: action || "registrar",
      aprovado_por_usuario: previous.aprovado_por_usuario || (action === "aprovar_ensinar" && row.analysis.status === "pronto"),
      precisa_cotar: ["cotar", "cotar_marca", "criar_produto"].includes(row.analysis.status),
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) items[idx] = { ...items[idx], ...entry };
    else items.push(entry);
    saveStore(items);
    return entry;
  }

  function parseMoney(value) {
    const m = String(value || "").match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2})?)/i);
    return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : 0;
  }

  function extractPackage(text) {
    const raw = String(text || "");
    const n = norm(raw);
    const kg = n.match(/(?:pacote|pct|embalagem|frasco|caixa)?\s*(?:com|de)?\s*([0-9]+(?:[,.][0-9]+)?)\s*(kg|quilo|quilos|kgs)\b/);
    if (kg) return `${kg[1].replace(",", ".")}kg`;
    const g = n.match(/(?:pacote|pct|embalagem)?\s*(?:com|de)?\s*([0-9]+(?:[,.][0-9]+)?)\s*(g|gr|grs|gramas|grama)\b/);
    if (g) return `${g[1].replace(",", ".")}g`;
    const ml = n.match(/(?:frasco|garrafa|embalagem)?\s*(?:com|de)?\s*([0-9]+(?:[,.][0-9]+)?)\s*(ml|mililitros)\b/);
    if (ml) return `${ml[1].replace(",", ".")}ml`;
    const lt = n.match(/(?:caixa|frasco|garrafa|embalagem)?\s*(?:com|de)?\s*([0-9]+(?:[,.][0-9]+)?)\s*(l|lt|litro|litros)\b/);
    if (lt) return `${lt[1].replace(",", ".")}l`;
    return "";
  }

  function extractBrands(text) {
    const raw = String(text || "").replace(/\s+/g, " ");
    const matches = [];
    const patterns = [
      /marcas?\s*(?:aceitas|solicitadas)?\s*:?\s*([^.;\n\r]+?)(?=\s*(?:pre[cç]o|valor|validade|entrega|\.|$))/ig,
      /marca\s+([^.;\n\r]+?)(?=\s*(?:pre[cç]o|valor|validade|entrega|\.|$))/ig,
    ];
    patterns.forEach((pattern) => {
      let m;
      while ((m = pattern.exec(raw))) matches.push(m[1]);
    });
    const brands = matches.join(",")
      .split(/,|\/|;|\bou\b|\be\b|\n/i)
      .map((b) => b.replace(/\b(r\$|preco|preço|referencia|referência|valor|marca|marcas)\b.*$/i, "").trim())
      .map((b) => b.replace(/^[\s:-]+|[\s.:-]+$/g, ""))
      .filter((b) => b.length >= 2 && b.length <= 32)
      .filter((b) => !/^(com|de|do|da|das|dos|tipo|pacote|caixa)$/i.test(b));
    return [...new Map(brands.map((b) => [norm(b), title(b)])).values()];
  }

  function detectBase(text) {
    const n = norm(text);
    const found = KEYWORDS.find((cfg) => cfg.terms.some((term) => n.includes(norm(term))));
    if (!found) return { base: "", subtypes: [] };
    const subtypes = found.subtypes.filter((term) => n.includes(norm(term)));
    if (n.includes("tipo 1") || n.includes("tipo i")) subtypes.unshift("tipo 1");
    return { base: found.base, subtypes: [...new Set(subtypes)] };
  }

  function canonical(parsed) {
    return [parsed.base, parsed.subtypes[0], parsed.package]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function parseItem(item) {
    const text = [item.nome, item.descricao, item.especificacao, item.marca].filter(Boolean).join(" ");
    const base = detectBase(text);
    const parsed = {
      raw: text,
      base: base.base,
      subtypes: base.subtypes,
      package: extractPackage(text),
      brands: extractBrands(text),
      referencePrice: parseMoney(text),
      quantity: Number(item.quantidade || 0),
    };
    parsed.canonical = canonical(parsed) || (item.nome || "ITEM SEM PRODUTO");
    parsed.noise = LEGAL_NOISE.filter((term) => norm(text).includes(term)).slice(0, 5);
    return parsed;
  }

  function getCatalog() {
    const byId = new Map();
    (typeof bancoPrecos !== "undefined" && bancoPrecos.itens ? bancoPrecos.itens : []).forEach((p) => {
      const id = p.sku || p.id || p.item;
      if (!id || byId.has(id)) return;
      byId.set(id, {
        id,
        name: p.item || p.nome || "",
        brand: p.marca || extractBrandFromName(p.item || p.nome || ""),
        cost: Number(p.custoBase || 0),
        reference: Number(p.precoReferencia || 0),
        source: p.fonte || "Banco de preços",
        raw: p,
      });
    });
    (typeof centralProdutos !== "undefined" ? centralProdutos : []).forEach((p) => {
      const id = p.id || p.sku || p.nome;
      if (!id || byId.has(id)) return;
      const cost = typeof getMenorCusto === "function" ? Number(getMenorCusto(id) || 0) : 0;
      byId.set(id, {
        id,
        name: p.nome || p.item || "",
        brand: p.marca || extractBrandFromName(p.nome || p.item || ""),
        cost,
        reference: 0,
        source: "Central de Produtos",
        raw: p,
      });
    });
    return [...byId.values()].filter((p) => p.name);
  }

  function extractBrandFromName(name) {
    const parts = String(name || "").split(/\s+-\s+|,\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts[parts.length - 1].length <= 24) return title(parts[parts.length - 1]);
    return "";
  }

  function scoreCandidate(parsed, candidate) {
    const item = norm(candidate.name);
    if (!parsed.base) return 0;
    let score = 0;
    const baseTokens = norm(parsed.base).split(" ").filter(Boolean);
    const matchedBase = baseTokens.filter((t) => item.includes(t)).length;
    score += matchedBase / Math.max(baseTokens.length, 1) * 55;
    if (parsed.package && item.includes(norm(parsed.package))) score += 20;
    if (parsed.subtypes.some((s) => item.includes(norm(s)))) score += 10;
    if (parsed.brands.length && candidate.brand) {
      const okBrand = parsed.brands.some((b) => norm(candidate.brand).includes(norm(b)) || norm(b).includes(norm(candidate.brand)));
      score += okBrand ? 20 : -18;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function chooseCandidate(parsed) {
    const candidates = getCatalog()
      .map((p) => ({ ...p, score: scoreCandidate(parsed, p) }))
      .filter((p) => p.score >= 45)
      .sort((a, b) => b.score - a.score || (a.cost || 999999) - (b.cost || 999999));

    const learned = getLearnedDecision(parsed);
    if (learned) {
      const learnedCandidate = candidates.find((p) => String(p.id) === String(learned.produto_id));
      if (learnedCandidate) {
        learnedCandidate.score = Math.max(learnedCandidate.score || 0, 98);
        learnedCandidate.learned = true;
      }
      candidates.sort((a, b) => b.score - a.score || (a.cost || 999999) - (b.cost || 999999));
    }

    const allowed = parsed.brands.length
      ? candidates.filter((p) => p.brand && parsed.brands.some((b) => norm(p.brand).includes(norm(b)) || norm(b).includes(norm(p.brand))))
      : candidates;
    const priced = allowed.filter((p) => p.cost > 0).sort((a, b) => a.cost - b.cost || b.score - a.score);
    const chosen = priced[0] || allowed[0] || candidates[0] || null;

    let status = "criar_produto";
    if (chosen && chosen.cost > 0 && (!parsed.brands.length || (chosen.brand && allowed.includes(chosen)))) status = "pronto";
    else if (chosen && parsed.brands.length && !allowed.length) status = "cotar_marca";
    else if (chosen && chosen.cost <= 0) status = "cotar";
    else if (chosen) status = "revisar";

    return { chosen, candidates, status };
  }

  function analyzeItem(item) {
    const parsed = parseItem(item);
    const match = chooseCandidate(parsed);
    return {
      parsed,
      chosen: match.chosen,
      candidates: match.candidates.slice(0, 3),
      status: match.status,
      margin: Number(item.margem || 0.25),
    };
  }

  function analyzePre(pre) {
    const items = (pre && pre.itens ? pre.itens : []).map((item, idx) => ({ idx, item, analysis: analyzeItem(item) }));
    const counts = items.reduce((acc, row) => {
      acc[row.analysis.status] = (acc[row.analysis.status] || 0) + 1;
      return acc;
    }, {});
    return { items, counts };
  }

  function statusLabel(status) {
    return {
      pronto: "Pronto",
      revisar: "Revisar",
      cotar: "Cotar",
      cotar_marca: "Cotar marca",
      criar_produto: "Criar produto",
    }[status] || "Revisar";
  }

  function render(pre) {
    const root = document.getElementById("normalizador-agent-panel");
    if (!root || !pre) return;
    const result = analyzePre(pre);
    pre._normalizador = result;
    const ready = result.counts.pronto || 0;
    const review = (result.counts.revisar || 0) + (result.counts.cotar || 0) + (result.counts.cotar_marca || 0) + (result.counts.criar_produto || 0);
    root.innerHTML = `
      <div class="normalizador-card">
        <div class="normalizador-head">
          <div>
            <h3>Mesa do Agente</h3>
            <p>Normaliza descricao do SGD, extrai marcas e sugere a opcao comercial valida mais barata.</p>
          </div>
          <div class="normalizador-actions">
            <span class="normalizador-kpi">${ready}/${result.items.length} pronto(s)</span>
            <button class="btn btn-sm btn-accent" onclick="NormalizadorAgent.apply('${escapeHtml(pre.orcamentoId || activePreOrcamentoId || "")}')">Aplicar sugestões</button>
            <button class="btn btn-sm" onclick="NormalizadorAgent.approveAndTeach('${escapeHtml(pre.orcamentoId || activePreOrcamentoId || "")}')">Aprovar e ensinar</button>
          </div>
        </div>
        <div class="normalizador-summary">
          <span>Prontos: ${ready}</span>
          <span>Revisar/cotar: ${review}</span>
          <span>Regra: menor custo entre marcas permitidas</span>
        </div>
        <div class="normalizador-table-wrap">
          <table class="normalizador-table">
            <thead>
              <tr><th>Item SGD</th><th>Normalizado</th><th>Marcas extraídas</th><th>Escolha sugerida</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${result.items.map((row) => {
                const a = row.analysis;
                const chosen = a.chosen;
                const brands = a.parsed.brands.length ? a.parsed.brands.join(", ") : "Sem marca exigida";
                const suggested = chosen
                  ? `${escapeHtml(chosen.name)}<br><span>${chosen.brand ? escapeHtml(chosen.brand) + " · " : ""}${chosen.cost > 0 ? money.format(chosen.cost) : "sem custo"} · ${Math.round(chosen.score)}%</span>`
                  : "Sem produto compatível";
                return `<tr class="normalizador-row normalizador-${a.status}">
                  <td><strong>${escapeHtml(row.item.nome)}</strong><br><span>${escapeHtml(row.item.descricao || "")}</span></td>
                  <td><strong>${escapeHtml(a.parsed.canonical)}</strong><br><span>${escapeHtml([a.parsed.base, a.parsed.package].filter(Boolean).join(" · "))}</span></td>
                  <td>${escapeHtml(brands)}</td>
                  <td>${suggested}</td>
                  <td><span class="normalizador-status">${statusLabel(a.status)}</span></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function recalc(pre) {
    let total = 0;
    let marginSum = 0;
    let marginCount = 0;
    (pre.itens || []).forEach((item) => {
      item.precoTotal = Math.round(Number(item.precoUnitario || 0) * Number(item.quantidade || 0) * 100) / 100;
      total += item.precoTotal;
      if (Number(item.margem) > 0) {
        marginSum += Number(item.margem);
        marginCount++;
      }
    });
    pre.totalGeral = Math.round(total * 100) / 100;
    pre.margemMedia = marginCount ? marginSum / marginCount : 0;
  }

  function apply(orcId, options) {
    const opts = options || {};
    const id = orcId || (typeof activePreOrcamentoId !== "undefined" ? activePreOrcamentoId : "");
    const pre = typeof preOrcamentos !== "undefined" ? preOrcamentos[id] : null;
    if (!pre) return;
    const result = analyzePre(pre);
    let applied = 0;
    result.items.forEach((row) => {
      const chosen = row.analysis.chosen;
      if (!chosen || chosen.cost <= 0 || row.analysis.status !== "pronto") return;
      const item = pre.itens[row.idx];
      const margin = Number(item.margem || row.analysis.margin || 0.25);
      item.skuBanco = chosen.id;
      item.produtoCanonico = row.analysis.parsed.canonical;
      item.marcasPermitidas = row.analysis.parsed.brands;
      item.marca = chosen.brand || item.marca || "";
      item.custoUnitario = chosen.cost;
      item.precoUnitario = Math.round(chosen.cost * (1 + margin) * 100) / 100;
      item.matchStatus = row.analysis.status === "pronto" ? "normalizador_pronto" : "normalizador_revisar";
      if (!opts.skipRecord) recordDecision(pre, row, opts.action || "aplicar");
      applied++;
    });
    recalc(pre);
    if (typeof savePreOrcamentos === "function") savePreOrcamentos();
    if (!opts.skipToast && typeof showToast === "function") showToast(`Mesa do Agente aplicou ${applied} sugestao(oes).`, 2500);
    if (typeof window.renderPreOrcamentoItens === "function") window.renderPreOrcamentoItens();
    render(pre);
  }

  function approveAndTeach(orcId) {
    const id = orcId || (typeof activePreOrcamentoId !== "undefined" ? activePreOrcamentoId : "");
    const pre = typeof preOrcamentos !== "undefined" ? preOrcamentos[id] : null;
    if (!pre) return;
    const result = analyzePre(pre);
    let taught = 0;
    result.items.forEach((row) => {
      recordDecision(pre, row, "aprovar_ensinar");
      if (row.analysis.status === "pronto") taught++;
    });
    apply(id, { action: "aprovar_ensinar", skipToast: true });
    if (typeof showToast === "function") {
      showToast(`Agente aprendeu ${taught} item(ns). Pendencias foram salvas para cotacao/revisao.`, 3500);
    }
  }

  function actionText(row) {
    if (row.status === "cotar_marca") return "Cotar uma das marcas exigidas antes de precificar.";
    if (row.status === "cotar") return "Buscar custo com fornecedor para o produto sugerido.";
    if (row.status === "criar_produto") return "Criar produto canônico e depois cotar.";
    if (row.status === "revisar") return "Conferir sugestão antes de aplicar.";
    if (row.aprovado_por_usuario) return "Aprendido. Pode ser reutilizado em novos orçamentos.";
    return "Sem ação pendente.";
  }

  function pendingRowById(rowId) {
    return loadStore().find((row) => String(row.id) === String(rowId)) || null;
  }

  function upsertPendingRow(rowId, patch) {
    const items = loadStore();
    const idx = items.findIndex((row) => String(row.id) === String(rowId));
    if (idx < 0) return null;
    const next = {
      ...items[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    items[idx] = next;
    saveStore(items);
    return next;
  }

  function ensurePendingModal() {
    let modal = document.getElementById("modal-pendencia-agente");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "modal-pendencia-agente";
    modal.className = "modal-overlay normalizador-pending-overlay";
    modal.style.display = "none";
    document.body.appendChild(modal);
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closePending();
    });
    return modal;
  }

  function statusOptions(selected) {
    return ["cotar_marca", "cotar", "criar_produto", "revisar", "pronto"].map((status) =>
      `<option value="${status}" ${status === selected ? "selected" : ""}>${statusLabel(status)}</option>`
    ).join("");
  }

  function closePending() {
    const modal = document.getElementById("modal-pendencia-agente");
    if (modal) modal.style.display = "none";
  }

  function openPending(rowId) {
    const row = pendingRowById(rowId);
    const modal = ensurePendingModal();
    if (!row) {
      if (typeof showToast === "function") showToast("Pendencia nao encontrada.", 2500);
      return;
    }
    const marcas = (row.marcas_extraidas || []).length ? row.marcas_extraidas.join(", ") : "Sem marca exigida";
    const hasPrequote = !!(row.orcamento_id && typeof preOrcamentos !== "undefined" && preOrcamentos[row.orcamento_id]);
    modal.innerHTML = `
      <aside class="normalizador-pending-drawer" role="dialog" aria-modal="true" aria-labelledby="pendencia-agente-title">
        <div class="normalizador-pending-head">
          <div>
            <span class="normalizador-status normalizador-status-inline">${statusLabel(row.status)}</span>
            <h2 id="pendencia-agente-title">Resolver pendencia</h2>
          </div>
          <button type="button" class="btn btn-sm" onclick="NormalizadorAgent.closePending()">Fechar</button>
        </div>
        <div class="normalizador-pending-body">
          <section class="normalizador-pending-context">
            <p>Produto</p>
            <strong>${escapeHtml(row.produto_canonico || "Sem produto canonico")}</strong>
            <span>${escapeHtml(row.produto_nome || "")}</span>
          </section>
          <section class="normalizador-pending-context">
            <p>Origem SGD</p>
            <strong>${escapeHtml(row.orcamento_id || "Sem orcamento vinculado")}</strong>
            <span>${escapeHtml(row.descricao_original || "")}</span>
          </section>
          <section class="normalizador-pending-context">
            <p>Acao sugerida</p>
            <strong>${escapeHtml(actionText(row))}</strong>
            <span>${escapeHtml(marcas)}</span>
          </section>
          <form id="form-pendencia-agente" class="normalizador-pending-form" onsubmit="NormalizadorAgent.savePending('${escapeHtml(row.id)}'); return false;">
            <label>Status
              <select id="pendencia-agente-status">${statusOptions(row.status)}</select>
            </label>
            <label>Produto canonico
              <input id="pendencia-agente-produto" type="text" value="${escapeHtml(row.produto_canonico || "")}" />
            </label>
            <label>Marca escolhida
              <input id="pendencia-agente-marca" type="text" value="${escapeHtml(row.marca_escolhida || "")}" />
            </label>
            <label>Custo escolhido
              <input id="pendencia-agente-custo" type="number" min="0" step="0.01" value="${Number(row.custo_escolhido || 0) || ""}" />
            </label>
            <label class="normalizador-pending-full">Observacao
              <textarea id="pendencia-agente-nota" rows="3" placeholder="Ex: fornecedor respondeu, produto criado, revisar marca...">${escapeHtml(row.observacao_operador || "")}</textarea>
            </label>
            <label class="normalizador-pending-check">
              <input id="pendencia-agente-aprendido" type="checkbox" ${row.aprovado_por_usuario ? "checked" : ""} />
              Marcar como aprendido/resolvido
            </label>
          </form>
        </div>
        <div class="normalizador-pending-actions">
          <button type="button" class="btn" onclick="NormalizadorAgent.markPending('${escapeHtml(row.id)}', 'revisar')">Revisar depois</button>
          <button type="button" class="btn" ${hasPrequote ? "" : "disabled"} onclick="NormalizadorAgent.openPendingPrequote('${escapeHtml(row.id)}')">Abrir cotacao</button>
          <button type="button" class="btn btn-accent" onclick="NormalizadorAgent.savePending('${escapeHtml(row.id)}')">Salvar</button>
          <button type="button" class="btn btn-primary" onclick="NormalizadorAgent.resolvePending('${escapeHtml(row.id)}')">Concluir</button>
        </div>
      </aside>`;
    modal.style.display = "flex";
    setTimeout(() => document.getElementById("pendencia-agente-status")?.focus(), 0);
  }

  function pendingFormPatch(forceResolved) {
    const status = document.getElementById("pendencia-agente-status")?.value || "revisar";
    const learned = !!document.getElementById("pendencia-agente-aprendido")?.checked || !!forceResolved;
    const finalStatus = forceResolved ? "pronto" : status;
    return {
      status: finalStatus,
      produto_canonico: document.getElementById("pendencia-agente-produto")?.value || "",
      marca_escolhida: document.getElementById("pendencia-agente-marca")?.value || "",
      custo_escolhido: Number(document.getElementById("pendencia-agente-custo")?.value || 0),
      observacao_operador: document.getElementById("pendencia-agente-nota")?.value || "",
      aprovado_por_usuario: learned,
      precisa_cotar: !learned && ["cotar", "cotar_marca", "criar_produto"].includes(finalStatus),
      resolvidoEm: learned ? new Date().toISOString() : "",
    };
  }

  function savePending(rowId) {
    const saved = upsertPendingRow(rowId, pendingFormPatch(false));
    if (!saved) return;
    renderPendencias();
    openPending(saved.id);
    if (typeof showToast === "function") showToast("Pendencia atualizada.", 2200);
  }

  function resolvePending(rowId) {
    const saved = upsertPendingRow(rowId, pendingFormPatch(true));
    if (!saved) return;
    closePending();
    renderPendencias();
    if (typeof showToast === "function") showToast("Pendencia concluida e marcada como aprendida.", 2600);
  }

  function markPending(rowId, status) {
    const saved = upsertPendingRow(rowId, {
      status,
      precisa_cotar: ["cotar", "cotar_marca", "criar_produto"].includes(status),
      aprovado_por_usuario: false,
      resolvidoEm: "",
    });
    if (!saved) return;
    renderPendencias();
    openPending(saved.id);
  }

  function openPendingPrequote(rowId) {
    const row = pendingRowById(rowId);
    if (!row || !row.orcamento_id || typeof abrirPreOrcamento !== "function") return;
    closePending();
    abrirPreOrcamento(row.orcamento_id);
  }

  function filteredStoreRows() {
    const status = document.getElementById("filtro-pendencia-agente-status")?.value || "all";
    const query = norm(document.getElementById("filtro-pendencia-agente-texto")?.value || "");
    return loadStore()
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => {
        if (!query) return true;
        return norm([
          row.produto_canonico,
          row.produto_nome,
          row.descricao_original,
          (row.marcas_extraidas || []).join(" "),
          row.marca_escolhida,
          row.orcamento_id
        ].join(" ")).includes(query);
      })
      .sort((a, b) => {
        const pendingA = a.precisa_cotar ? 1 : 0;
        const pendingB = b.precisa_cotar ? 1 : 0;
        return pendingB - pendingA || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });
  }

  function renderPendencias() {
    const tbody = document.getElementById("tbody-pendencias-agente");
    const empty = document.getElementById("pendencias-agente-empty");
    const kpis = document.getElementById("normalizador-pendencias-kpis");
    if (!tbody) return;
    const all = loadStore();
    const rows = filteredStoreRows();
    const counts = all.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      if (row.precisa_cotar) acc.pendentes = (acc.pendentes || 0) + 1;
      if (row.aprovado_por_usuario) acc.aprendidos = (acc.aprendidos || 0) + 1;
      return acc;
    }, {});
    if (kpis) {
      kpis.innerHTML = `
        <article><span>Pendentes</span><strong>${counts.pendentes || 0}</strong></article>
        <article><span>Cotar marca</span><strong>${counts.cotar_marca || 0}</strong></article>
        <article><span>Criar produto</span><strong>${counts.criar_produto || 0}</strong></article>
        <article><span>Aprendidos</span><strong>${counts.aprendidos || 0}</strong></article>`;
    }
    tbody.innerHTML = rows.map((row) => {
      const marcas = (row.marcas_extraidas || []).length ? row.marcas_extraidas.join(", ") : "Sem marca exigida";
      const escolha = row.marca_escolhida ? `<br><span>Escolha: ${escapeHtml(row.marca_escolhida)} ${row.custo_escolhido ? "· " + money.format(row.custo_escolhido) : ""}</span>` : "";
      return `<tr class="normalizador-row normalizador-${escapeHtml(row.status)}">
        <td><span class="normalizador-status">${statusLabel(row.status)}</span></td>
        <td><strong>${escapeHtml(row.produto_canonico || "—")}</strong><br><span>${escapeHtml(row.produto_nome || "")}</span></td>
        <td>${escapeHtml(marcas)}${escolha}</td>
        <td><strong>${escapeHtml(row.orcamento_id || "—")}</strong><br><span>${escapeHtml(row.descricao_original || "")}</span></td>
        <td>${escapeHtml(actionText(row))}</td>
        <td><button type="button" class="btn btn-sm btn-accent" onclick="NormalizadorAgent.openPending('${escapeHtml(row.id)}')">Resolver</button></td>
      </tr>`;
    }).join("");
    if (empty) empty.style.display = rows.length ? "none" : "block";
  }

  function exportPendencias() {
    const rows = filteredStoreRows();
    const header = ["status", "produto_canonico", "marcas_extraidas", "marca_escolhida", "custo_escolhido", "orcamento_id", "descricao_original", "acao_sugerida"];
    const csv = [header.join(",")].concat(rows.map((row) => header.map((key) => {
      const value = key === "acao_sugerida" ? actionText(row) : Array.isArray(row[key]) ? row[key].join("; ") : row[key];
      return `"${String(value || "").replace(/"/g, '""')}"`;
    }).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pendencias-agente-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function hook() {
    const originalAbrir = window.abrirPreOrcamento;
    if (typeof originalAbrir === "function" && !originalAbrir._normalizadorHook) {
      window.abrirPreOrcamento = function (orcId) {
        const ret = originalAbrir.apply(this, arguments);
        setTimeout(() => {
          const pre = typeof preOrcamentos !== "undefined" ? preOrcamentos[orcId] : null;
          render(pre);
        }, 0);
        return ret;
      };
      window.abrirPreOrcamento._normalizadorHook = true;
    }
    const originalRender = window.renderPreOrcamentoItens;
    if (typeof originalRender === "function" && !originalRender._normalizadorHook) {
      window.renderPreOrcamentoItens = function () {
        const ret = originalRender.apply(this, arguments);
        setTimeout(() => {
          const pre = typeof preOrcamentos !== "undefined" && typeof activePreOrcamentoId !== "undefined" ? preOrcamentos[activePreOrcamentoId] : null;
          render(pre);
        }, 0);
        return ret;
      };
      window.renderPreOrcamentoItens._normalizadorHook = true;
    }
  }

  window.NormalizadorAgent = {
    analyzePre,
    analyzeItem,
    render,
    apply,
    approveAndTeach,
    loadStore,
    renderPendencias,
    exportPendencias,
    openPending,
    closePending,
    savePending,
    resolvePending,
    markPending,
    openPendingPrequote,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook);
  else hook();
})();
