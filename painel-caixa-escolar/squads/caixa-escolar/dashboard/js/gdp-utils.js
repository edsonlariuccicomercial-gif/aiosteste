// gdp-utils.js — Utilitários compartilhados (MED-N, ONDA 3, 2026-07-02)
// ============================================================================
// Fonte ÚNICA para lógicas que estavam duplicadas em vários arquivos e divergiam entre si
// (corrigia num fluxo, quebrava noutro). Carregar ANTES dos demais scripts que os consomem.
// Exposto em window.* e mantém as funções globais legadas como aliases (compat de chamadas antigas).
(function () {
  'use strict';

  // ── parseNumeroBR: parser canônico de número no formato brasileiro ──────────
  // Consolidação de: parsePriceValue (app-import.js) + bloco hasDotAndComma
  // (gdp-contratos-module.js) + variações inline soltas. Trata:
  //   "1.234,56" (milhar . + decimal ,) → 1234.56
  //   "1234,56"  (só decimal ,)         → 1234.56
  //   "1234.56"  (decimal . puro)       → 1234.56
  //   "R$ 1.234,56", "  12,00 ", números já numéricos → limpa e converte
  // Sempre retorna Number (0 em caso inconversível). NUNCA NaN.
  function parseNumeroBR(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    var s = String(val).replace(/[^\d,.\-]/g, '');
    if (!s || s === '-') return 0;
    var hasDotAndComma = s.indexOf('.') >= 0 && s.indexOf(',') >= 0;
    if (hasDotAndComma) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    if (s.indexOf(',') >= 0) return parseFloat(s.replace(',', '.')) || 0;
    return parseFloat(s) || 0;
  }

  // ── precoComMargem: cálculo canônico custo × (1 + margem), 2 casas ───────────
  // Consolida o idioma Math.round(custo * (1 + margem) * 100) / 100 espalhado em
  // ~8 pontos (app.js, app-import.js, app-banco.js). margem é fração (0.30 = 30%).
  // Guard: custo <= 0 → 0 (mesma semântica dos call-sites originais).
  function precoComMargem(custo, margem) {
    var c = Number(custo) || 0;
    var m = Number(margem) || 0;
    if (c <= 0) return 0;
    return Math.round(c * (1 + m) * 100) / 100;
  }

  // ── calcularSimilaridade: matcher canônico de nomes de produto (Jaccard) ────
  // Movido de gdp-banco-produtos.js (fonte única). Retorna { score, tipo }.
  // Thresholds: exato >=80, parcial >=60, senão sem-match. Palavras >=3 chars.
  function calcularSimilaridade(a, b) {
    var normalize = function (s) {
      return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
    };
    var keywords = function (s) { return normalize(s).split(/\s+/).filter(function (w) { return w.length >= 3; }); };
    var nA = normalize(a), nB = normalize(b);
    if (nA === nB) return { score: 100, tipo: 'exato' };
    if (nA.length >= 5 && nB.length >= 5 && (nA.indexOf(nB) >= 0 || nB.indexOf(nA) >= 0)) return { score: 90, tipo: 'exato' };
    var kwA = keywords(a), kwB = keywords(b);
    if (kwA.length === 0 || kwB.length === 0) return { score: 0, tipo: 'sem-match' };
    var intersection = kwA.filter(function (w) { return kwB.indexOf(w) >= 0; }).length;
    var union = new Set(kwA.concat(kwB)).size;
    var score = union > 0 ? Math.round(intersection / union * 100) : 0;
    return { score: score, tipo: score >= 80 ? 'exato' : score >= 60 ? 'parcial' : 'sem-match' };
  }

  // Exposição global (fonte única) + compat de nomes legados.
  if (typeof window !== 'undefined') {
    window.parseNumeroBR = parseNumeroBR;
    window.precoComMargem = precoComMargem;
    window.calcularSimilaridade = calcularSimilaridade;
    window.gdpUtils = { parseNumeroBR: parseNumeroBR, precoComMargem: precoComMargem, calcularSimilaridade: calcularSimilaridade };
  }
  // CommonJS (tests em Node)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseNumeroBR: parseNumeroBR, precoComMargem: precoComMargem, calcularSimilaridade: calcularSimilaridade };
  }
})();
