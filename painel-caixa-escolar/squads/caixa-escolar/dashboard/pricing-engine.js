/* ===================================================================
   Pricing Engine v2 — Licit-AIX
   Story 13.8: Mark-up Multiplicador + Should-Cost + Kraljic
   =================================================================== */

(function () {
  'use strict';

  const EMPRESA_KEY = "nexedu.empresa";

  // ===== Empresa Config =====
  function getEmpresaConfig() {
    try {
      const emp = JSON.parse(localStorage.getItem(EMPRESA_KEY) || "{}");
      return {
        regime_tributario: emp.regime_tributario || "simples",
        aliquota_tributos_pct: parseFloat(emp.aliquota_tributos_pct) || 6.0,
        custos_indiretos_pct: parseFloat(emp.custos_indiretos_pct) || 8.0,
        frete_padrao_pct: parseFloat(emp.frete_padrao_pct) || 5.0,
        margem_minima_pct: parseFloat(emp.margem_minima_pct) || 5.0,
        margem_desejada_pct: parseFloat(emp.margem_desejada_pct) || 15.0,
      };
    } catch (_) {
      return { regime_tributario: "simples", aliquota_tributos_pct: 6.0, custos_indiretos_pct: 8.0, frete_padrao_pct: 5.0, margem_minima_pct: 5.0, margem_desejada_pct: 15.0 };
    }
  }

  function saveEmpresaConfig(config) {
    try {
      const emp = JSON.parse(localStorage.getItem(EMPRESA_KEY) || "{}");
      Object.assign(emp, config);
      localStorage.setItem(EMPRESA_KEY, JSON.stringify(emp));
      if (typeof schedulCloudSync === 'function') schedulCloudSync();
    } catch (_) {}
  }

  // ===== Mark-up Calculation (AC3) =====
  // Formula: Preço = Custo × (1 / (1 - (Frete% + CI% + Tributos% + Margem%)))
  function calcMarkup(fretePct, ciPct, tributosPct, margemPct) {
    const soma = (fretePct + ciPct + tributosPct + margemPct) / 100;
    if (soma >= 1) return 99.99; // cap to avoid division by zero
    return parseFloat((1 / (1 - soma)).toFixed(4));
  }

  function calcPrecoVenda(custoUnitario, markup) {
    return Math.round(custoUnitario * markup * 100) / 100;
  }

  // ===== 3 Cenários (AC7-AC9) =====
  function calcCenarios(custoUnitario, produtoId, produto, config) {
    if (!config) config = getEmpresaConfig();

    // Get product-specific frete or use empresa default
    const fretePct = _getFreteForProduct(produtoId) || config.frete_padrao_pct;
    const ciPct = config.custos_indiretos_pct;
    const tribPct = config.aliquota_tributos_pct;

    // Get historical median for "Sugerido" calibration
    const mediaVencedores = _getMedianaVencedores(produtoId);
    let margemCalibrada = config.margem_desejada_pct;
    if (mediaVencedores > 0 && custoUnitario > 0) {
      margemCalibrada = parseFloat(((mediaVencedores - custoUnitario) / mediaVencedores * 100).toFixed(2));
      if (margemCalibrada < config.margem_minima_pct) margemCalibrada = config.margem_minima_pct;
      if (margemCalibrada > 50) margemCalibrada = 50; // cap
    }

    // Cenário 1: Conservador (Does-Cost) — margem_desejada + 5%
    const margemConservadora = config.margem_desejada_pct + 5;
    const mkConservador = calcMarkup(fretePct, ciPct, tribPct, margemConservadora);
    const precoConservador = calcPrecoVenda(custoUnitario, mkConservador);

    // Cenário 2: Sugerido (Should-Cost) — calibrado pelo histórico
    const mkSugerido = calcMarkup(fretePct, ciPct, tribPct, margemCalibrada);
    const precoSugerido = calcPrecoVenda(custoUnitario, mkSugerido);

    // Cenário 3: Agressivo (Could-Cost) — margem_minima
    const margemAgressiva = config.margem_minima_pct;
    const mkAgressivo = calcMarkup(fretePct, ciPct, tribPct, margemAgressiva);
    const precoAgressivo = calcPrecoVenda(custoUnitario, mkAgressivo);

    // Probabilidade de ganho por cenário
    const probConservador = calcProbGanho(precoConservador, produtoId);
    const probSugerido = calcProbGanho(precoSugerido, produtoId);
    const probAgressivo = calcProbGanho(precoAgressivo, produtoId);

    // Price-to-Win and Competitiveness Index
    const p2w = mediaVencedores > 0 ? mediaVencedores : null;

    return {
      custo: custoUnitario,
      frete_pct: fretePct,
      ci_pct: ciPct,
      tributos_pct: tribPct,
      config: config,
      cenarios: [
        {
          nome: "Conservador",
          descricao: "Does-Cost — proteção de margem",
          margem_pct: margemConservadora,
          markup: mkConservador,
          preco: precoConservador,
          margem_liquida_pct: margemConservadora,
          prob_ganho: probConservador,
          risco: "Baixo",
          risco_color: "#059669"
        },
        {
          nome: "Sugerido",
          descricao: "Should-Cost — calibrado pelo histórico",
          margem_pct: margemCalibrada,
          markup: mkSugerido,
          preco: precoSugerido,
          margem_liquida_pct: margemCalibrada,
          prob_ganho: probSugerido,
          risco: "Médio",
          risco_color: "#d97706"
        },
        {
          nome: "Agressivo",
          descricao: "Could-Cost — competitividade máxima",
          margem_pct: margemAgressiva,
          markup: mkAgressivo,
          preco: precoAgressivo,
          margem_liquida_pct: margemAgressiva,
          prob_ganho: probAgressivo,
          risco: "Alto",
          risco_color: "#ef4444"
        }
      ],
      price_to_win: p2w,
      competitiveness_index: p2w && precoSugerido > 0 ? parseFloat((precoSugerido / p2w).toFixed(3)) : null
    };
  }

  // ===== Probability of Win (AC10) =====
  function calcProbGanho(meuPreco, produtoId) {
    if (!meuPreco || meuPreco <= 0) return 0;
    const historico = typeof loadHistoricoLicitacoes === 'function' ? loadHistoricoLicitacoes() : [];
    const relevantes = historico.filter(h => {
      if (produtoId && h.produto_id && h.produto_id === produtoId) return true;
      return h.preco_vencedor > 0;
    });
    if (relevantes.length === 0) return 50; // default 50% when no data

    const abaixo = relevantes.filter(h => meuPreco <= h.preco_vencedor).length;
    return Math.round((abaixo / relevantes.length) * 100);
  }

  // ===== Kraljic Influence (AC11-AC14) =====
  function getDefaultCenarioByKraljic(classificacao) {
    switch (classificacao) {
      case 'alavancagem': return 2; // Agressivo (index 2)
      case 'gargalo': return 0;     // Conservador (index 0)
      case 'estrategico': return 1;  // Sugerido (index 1)
      case 'nao-critico': return 2;  // Agressivo (index 2)
      default: return 1;             // Sugerido
    }
  }

  // ===== Helpers =====
  function _getFreteForProduct(produtoId) {
    if (!produtoId || typeof getCustosForProduto !== 'function') return null;
    const custos = getCustosForProduto(produtoId);
    const comFrete = custos.filter(c => c.frete_estimado > 0);
    if (comFrete.length === 0) return null;
    // Average frete as percentage of cost
    const avg = comFrete.reduce((s, c) => s + c.frete_estimado, 0) / comFrete.length;
    const avgCusto = comFrete.reduce((s, c) => s + c.custo, 0) / comFrete.length;
    if (avgCusto <= 0) return null;
    return parseFloat(((avg / avgCusto) * 100).toFixed(2));
  }

  function _getMedianaVencedores(produtoId) {
    const historico = typeof loadHistoricoLicitacoes === 'function' ? loadHistoricoLicitacoes() : [];
    let precos = historico.filter(h => h.preco_vencedor > 0);
    if (produtoId) {
      const filtered = precos.filter(h => h.produto_id === produtoId);
      if (filtered.length >= 3) precos = filtered; // Only use product-specific if enough data
    }
    if (precos.length === 0) return 0;
    const sorted = precos.map(h => h.preco_vencedor).sort((a, b) => a - b);
    return sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  }

  // ===== Config UI =====
  window.renderConfigEmpresa = function () {
    const config = getEmpresaConfig();
    const container = document.getElementById("config-empresa-markup");
    if (!container) return;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem;">
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Regime Tributário</label>
          <select id="cfg-regime" style="width:100%;">
            <option value="simples" ${config.regime_tributario === 'simples' ? 'selected' : ''}>Simples Nacional</option>
            <option value="presumido" ${config.regime_tributario === 'presumido' ? 'selected' : ''}>Lucro Presumido</option>
            <option value="real" ${config.regime_tributario === 'real' ? 'selected' : ''}>Lucro Real</option>
          </select>
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Alíquota Tributos (%)</label>
          <input type="number" id="cfg-tributos" value="${config.aliquota_tributos_pct}" min="0" max="50" step="0.5" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Custos Indiretos (%)</label>
          <input type="number" id="cfg-ci" value="${config.custos_indiretos_pct}" min="0" max="50" step="0.5" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Frete Padrão (%)</label>
          <input type="number" id="cfg-frete" value="${config.frete_padrao_pct}" min="0" max="50" step="0.5" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Margem Mínima (%)</label>
          <input type="number" id="cfg-margem-min" value="${config.margem_minima_pct}" min="0" max="50" step="0.5" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Margem Desejada (%)</label>
          <input type="number" id="cfg-margem-des" value="${config.margem_desejada_pct}" min="0" max="50" step="0.5" style="width:100%;" />
        </div>
      </div>
      <button class="btn btn-accent btn-sm" onclick="salvarConfigMarkup()">Salvar Configuração</button>
      <span id="cfg-markup-status" style="font-size:.75rem;color:var(--muted);margin-left:8px;"></span>
    `;
  };

  window.salvarConfigMarkup = function () {
    saveEmpresaConfig({
      regime_tributario: document.getElementById("cfg-regime").value,
      aliquota_tributos_pct: parseFloat(document.getElementById("cfg-tributos").value) || 6.0,
      custos_indiretos_pct: parseFloat(document.getElementById("cfg-ci").value) || 8.0,
      frete_padrao_pct: parseFloat(document.getElementById("cfg-frete").value) || 5.0,
      margem_minima_pct: parseFloat(document.getElementById("cfg-margem-min").value) || 5.0,
      margem_desejada_pct: parseFloat(document.getElementById("cfg-margem-des").value) || 15.0,
    });
    const st = document.getElementById("cfg-markup-status");
    if (st) { st.textContent = "Salvo!"; setTimeout(() => { st.textContent = ""; }, 2000); }
  };

  // ===== Render Cenarios for a product =====
  window.renderCenariosProduto = function (custoUnitario, produtoId, produto) {
    const result = calcCenarios(custoUnitario, produtoId, produto);
    const kraljic = produto ? (produto.classificacao_kraljic || 'alavancagem') : 'alavancagem';
    const defaultIdx = getDefaultCenarioByKraljic(kraljic);

    const KRALJIC_LABELS = {
      'nao-critico': 'Não-crítico',
      'alavancagem': 'Alavancagem',
      'gargalo': 'Gargalo',
      'estrategico': 'Estratégico'
    };

    let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-bottom:1rem;">';

    result.cenarios.forEach((c, i) => {
      const isDefault = i === defaultIdx;
      const border = isDefault ? '2px solid #2563eb' : '1px solid var(--line)';
      html += `<div style="background:var(--bg);border:${border};border-radius:8px;padding:12px;${isDefault ? 'box-shadow:0 0 0 1px #2563eb33;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:.85rem;">${c.nome}</strong>
          ${isDefault ? '<span style="font-size:.55rem;background:#2563eb;color:#fff;padding:1px 5px;border-radius:3px;">Kraljic: ' + (KRALJIC_LABELS[kraljic] || kraljic) + '</span>' : ''}
        </div>
        <p style="font-size:.65rem;color:var(--muted);margin-bottom:8px;">${c.descricao}</p>
        <div style="font-size:1.1rem;font-weight:700;color:var(--text);margin-bottom:4px;">${brl.format(c.preco)}</div>
        <div style="font-size:.7rem;color:var(--muted);display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <span>Mark-up: ${c.markup.toFixed(3)}×</span>
          <span>Margem: ${c.margem_pct.toFixed(1)}%</span>
          <span style="color:${c.risco_color};font-weight:600;">Risco: ${c.risco}</span>
          <span>P(ganho): <strong style="color:${c.prob_ganho >= 60 ? '#059669' : c.prob_ganho >= 40 ? '#d97706' : '#ef4444'}">${c.prob_ganho}%</strong></span>
        </div>
      </div>`;
    });
    html += '</div>';

    // P2W + CI indicators (AC15-AC16)
    if (result.price_to_win) {
      const ciColor = result.competitiveness_index <= 1.0 ? '#059669' : result.competitiveness_index <= 1.1 ? '#d97706' : '#ef4444';
      html += `<div style="display:flex;gap:1rem;font-size:.8rem;padding:8px 12px;background:var(--bg);border:1px solid var(--line);border-radius:6px;">
        <span>Price-to-Win: <strong style="color:#2563eb;">${brl.format(result.price_to_win)}</strong></span>
        <span>Competitiveness Index: <strong style="color:${ciColor};">${result.competitiveness_index}</strong> ${result.competitiveness_index <= 1.0 ? '(competitivo)' : '(acima do mercado)'}</span>
      </div>`;
    }

    return html;
  };

  // Export
  window.PricingEngine = {
    getEmpresaConfig: getEmpresaConfig,
    saveEmpresaConfig: saveEmpresaConfig,
    calcMarkup: calcMarkup,
    calcPrecoVenda: calcPrecoVenda,
    calcCenarios: calcCenarios,
    calcProbGanho: calcProbGanho,
    getDefaultCenarioByKraljic: getDefaultCenarioByKraljic,
  };

  if (typeof gdpLog === 'function') gdpLog('[PricingEngine] v2 loaded');
})();
