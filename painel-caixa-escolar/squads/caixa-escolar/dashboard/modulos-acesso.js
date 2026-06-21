// modulos-acesso.js — Story 22.1 (EPIC-22): fonte ÚNICA de controle de acesso por módulo.
// Carregado por index.html, dashboard-home.html e gdp-contratos.html.
// Substitui as cópias divergentes que existiam em app-utils.js e dashboard-home.html.
//
// Modelo: qualquer módulo é opcional (inclusive GDP). Default SEGURO: sem config salva
// → todos os módulos visíveis (nunca travar um cliente novo fora de tudo).
(function (global) {
  "use strict";

  var MODULOS_KEY = "nexedu.modulos.acesso";
  // Módulos conhecidos: chave de storage ↔ data-module na sidebar.
  var MODULOS = [
    { key: "radar", dataModule: "radar" },
    { key: "intelPrecos", dataModule: "intel-precos" },
    { key: "gdp", dataModule: "gdp" }
  ];

  // Lê a config persistida. Qualquer módulo ausente/!==false conta como visível (default seguro).
  function getAcessoModulos() {
    var acesso = { radar: true, intelPrecos: true, gdp: true };
    try {
      var raw = localStorage.getItem(MODULOS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw) || {};
        // FR-22.1.5: só oculta o que foi explicitamente marcado como false.
        acesso.radar = parsed.radar !== false;
        acesso.intelPrecos = parsed.intelPrecos !== false;
        acesso.gdp = parsed.gdp !== false;
      }
    } catch (_) { /* default seguro: tudo visível */ }
    return acesso;
  }

  // Persiste a config (qualquer módulo opcional). Aceita objeto parcial; mescla com o atual.
  function setAcessoModulos(parcial) {
    var atual = getAcessoModulos();
    var novo = {
      radar: parcial && "radar" in parcial ? !!parcial.radar : atual.radar,
      intelPrecos: parcial && "intelPrecos" in parcial ? !!parcial.intelPrecos : atual.intelPrecos,
      gdp: parcial && "gdp" in parcial ? !!parcial.gdp : atual.gdp
    };
    try { localStorage.setItem(MODULOS_KEY, JSON.stringify(novo)); } catch (_) {}
    return novo;
  }

  // Aplica a visibilidade aos itens de sidebar (data-module) em QUALQUER página.
  function aplicarAcessoSidebar() {
    var acesso = getAcessoModulos();
    var byData = {};
    MODULOS.forEach(function (m) { byData[m.dataModule] = acesso[m.key]; });
    document.querySelectorAll(".sidebar-item[data-module]").forEach(function (btn) {
      var mod = btn.dataset.module;
      if (mod in byData) btn.style.display = byData[mod] ? "" : "none";
    });
  }

  // Exporta no escopo global (scripts clássicos, sem módulos ES).
  global.MODULOS_ACESSO_KEY = MODULOS_KEY;
  global.getAcessoModulos = getAcessoModulos;
  global.setAcessoModulos = setAcessoModulos;
  global.aplicarAcessoSidebar = aplicarAcessoSidebar;
})(typeof window !== "undefined" ? window : this);
