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
  // Story 22.2: além do cache local, persiste ONLINE no Supabase (via gdpApi.modulos) para
  // valer em qualquer navegador/máquina/usuário da empresa. Grava local primeiro (resposta
  // imediata da UI) e dispara o save remoto sem bloquear (com supressão de eco no gdpApi).
  function setAcessoModulos(parcial) {
    var atual = getAcessoModulos();
    var novo = {
      radar: parcial && "radar" in parcial ? !!parcial.radar : atual.radar,
      intelPrecos: parcial && "intelPrecos" in parcial ? !!parcial.intelPrecos : atual.intelPrecos,
      gdp: parcial && "gdp" in parcial ? !!parcial.gdp : atual.gdp
    };
    try { localStorage.setItem(MODULOS_KEY, JSON.stringify(novo)); } catch (_) {}
    // Persistência online (FR-22.2.3) — semeia/atualiza a linha da empresa. Não bloqueia a UI.
    try {
      if (global.gdpApi && global.gdpApi.modulos && global.gdpApi.modulos.save) {
        global.gdpApi.modulos.save(novo).catch(function (e) {
          if (typeof gdpWarn === "function") gdpWarn("[modulos] save online falhou (mantém local):", e);
        });
      }
    } catch (_) { /* sem gdpApi: segue só local (fallback gracioso) */ }
    return novo;
  }

  // Story 22.2: hidrata a config a partir do Supabase (fonte da verdade online) e re-aplica a
  // sidebar. Idempotente e à prova de falha: se offline/sem gdpApi, mantém o cache local (AC4).
  // Default seguro preservado: sem config no banco → tudo visível.
  // Retorna uma Promise que resolve após hidratar (ou imediatamente em fallback), para que o
  // chamador possa re-sincronizar UI dependente (ex.: checkboxes do painel de módulos no index.html).
  function hidratarAcessoModulosOnline() {
    try {
      if (!global.gdpApi || !global.gdpApi.modulos || !global.gdpApi.modulos.get) return Promise.resolve();
      return global.gdpApi.modulos.get().then(function (cfg) {
        if (!cfg) return;
        // gdpApi.modulos.get() já grava o cache local; só re-aplica a sidebar com a verdade online.
        aplicarAcessoSidebar();
      }).catch(function () { /* fallback gracioso: mantém o que já está aplicado do cache */ });
    } catch (_) { /* sem gdpApi: nada a fazer, cache local já vale */ return Promise.resolve(); }
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
  global.hidratarAcessoModulosOnline = hidratarAcessoModulosOnline; // Story 22.2
})(typeof window !== "undefined" ? window : this);
