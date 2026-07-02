/* Radar Matcher — Product matching engine for pre-quotation (SGD -> banco de precos) */
(function () {
  'use strict';

  var SUPABASE_URL = window.SUPABASE_URL || 'https://mvvsjaudhbglxttxaeop.supabase.co';
  var SUPABASE_KEY = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dnNqYXVkaGJnbHh0dHhhZW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY3OTAsImV4cCI6MjA5MDM4Mjc5MH0.jadqvmRvbZjtjATaF_4WWB6A44NF06whtEIyNNyCUGo';
  var REST = SUPABASE_URL + '/rest/v1';
  var HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  var LS_KEY = 'radar.equivalencias.v1';

  // ── Fonte única de regras de matching: RadarMatcherCore (server-lib/radar-matcher-core.js) ──
  // O core (carregado antes via radar-matcher-core.browser.js) detém normalização, sinônimos,
  // similaridade e camadas N1-N4. Este arquivo só adiciona persistência (Supabase/localStorage).
  // Fallback defensivo: se o core não carregou, expõe um stub que evita crash de boot.
  var CORE = (typeof window !== 'undefined' && window.RadarMatcherCore) ? window.RadarMatcherCore : null;
  if (!CORE) {
    gdpWarn && gdpWarn('[RadarMatcher] RadarMatcherCore não carregado — matching desabilitado. Verifique a ordem dos <script>.');
    CORE = {
      normalizeProductName: function (n) { return String(n || '').toLowerCase().trim(); },
      tokenSimilarity: function () { return 0; },
      matchRegexRules: function () { return null; },
      matchProduct: function () { return { status: 'sem_match', score: 0, sku: null, nomeBanco: null, matchLayer: 'N4' }; },
      REGEX_RULES: [],
      MATCH_STATUS: { CONFIRMADO: 'confirmado', EXATO: 'exato', SUGESTAO: 'sugestao', SEM_MATCH: 'sem_match' }
    };
  }

  var _cache = {};       // chave_normalizada -> entry
  var _cacheReady = false;

  function empresaId() {
    return (typeof getEmpresaId === 'function') ? getEmpresaId() : 'LARIUCCI';
  }

  async function sbFetch(path, opts) {
    var res = await fetch(REST + path, Object.assign({ headers: HEADERS }, opts || {}));
    if (!res.ok) throw new Error('Supabase ' + res.status);
    var text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ALTO-J (2026-07-01 — ONDA 2): opção ignoreDuplicates. O SEED (seedFromContratos) NUNCA pode
  // sobrescrever uma equivalência já existente — sobretudo uma confirmado:true do usuário. Com
  // resolution=merge-duplicates o seed (confirmado:false) clobberava a confirmação no banco. Passando
  // ignoreDuplicates=true usamos resolution=ignore-duplicates → o Postgres PULA linhas cujo conflito
  // (chave única) já existe (equivalente ao ON CONFLICT DO NOTHING). Fluxos de CONFIRMAÇÃO explícita
  // seguem usando merge (default) para gravar a mudança.
  async function sbUpsert(rows, opts) {
    var resolution = (opts && opts.ignoreDuplicates) ? 'ignore-duplicates' : 'merge-duplicates';
    var res = await fetch(REST + '/radar_equivalencias', {
      method: 'POST',
      headers: Object.assign({}, HEADERS, { Prefer: 'return=minimal,resolution=' + resolution }),
      body: JSON.stringify(rows)
    });
    if (!res.ok) throw new Error('Supabase upsert ' + res.status);
  }

  function loadLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveLS() { localStorage.setItem(LS_KEY, JSON.stringify(_cache)); }

  // Delega\u00e7\u00f5es ao core (fonte \u00fanica de verdade)
  function normalizeProductName(name) { return CORE.normalizeProductName(name); }
  function tokenSimilarity(a, b) { return CORE.tokenSimilarity(a, b); }

  var _initPromise = null;
  async function init() {
    if (_initPromise) return _initPromise;
    _initPromise = _doInit();
    return _initPromise;
  }
  async function _doInit() {
    try {
      var rows = await sbFetch('/radar_equivalencias?empresa_id=eq.' + encodeURIComponent(empresaId()) + '&limit=1000');
      if (rows && rows.length > 0) {
        rows.forEach(function (r) { _cache[r.chave_normalizada] = r; });
        saveLS();
        _cacheReady = true;
        gdpLog('[RadarMatcher] loaded', rows.length, 'equivalencias from Supabase');
        return;
      }
    } catch (e) {
      gdpWarn('[RadarMatcher] Supabase load failed, using localStorage', e.message);
    }
    // Fallback to localStorage
    _cache = loadLS();
    if (Object.keys(_cache).length === 0) {
      await seedFromContratos();
    }
    _cacheReady = true;
    gdpLog('[RadarMatcher] ready,', Object.keys(_cache).length, 'entries');
  }

  async function seedFromContratos() {
    var contratos = [];
    try {
      contratos = await sbFetch('/contratos?empresa_id=eq.' + encodeURIComponent(empresaId()) + '&limit=500');
    } catch (_) {
      // fallback: try localStorage
      try {
        var raw = JSON.parse(localStorage.getItem('gdp.contratos.v1') || '{}');
        contratos = raw.items || (Array.isArray(raw) ? raw : []);
      } catch (_2) { contratos = []; }
    }
    var count = 0;
    contratos.forEach(function (c) {
      var itens = c.itens || c.items || [];
      itens.forEach(function (item) {
        var sku = item.skuVinculado || item.sku;
        if (!sku) return;
        var key = normalizeProductName(item.descricao || item.nome || '');
        if (!key) return;
        // ALTO-J: NUNCA rebaixar uma equivalência já confirmada pelo usuário. Se a chave já existe
        // no cache como confirmado:true, o seed a preserva (não regrava confirmado:false por cima).
        if (_cache[key] && _cache[key].confirmado === true) return;
        // Find banco item to enrich
        var bp = (typeof bancoPrecos !== 'undefined' && bancoPrecos && Array.isArray(bancoPrecos.itens))
          ? bancoPrecos.itens.find(function (b) { return b.id === sku || b.sku === sku; })
          : null;
        _cache[key] = {
          empresa_id: empresaId(),
          chave_normalizada: key,
          sku: sku,
          nome_banco: bp ? bp.item : (item.descricao || ''),
          confirmado: false,
          origem: 'seed-contrato',
          score: 1.0,
          vezes_usado: 0,
          ncm: bp ? (bp.ncm || '') : '',
          unidade: bp ? (bp.unidade || '') : (item.unidade || '')
        };
        count++;
      });
    });
    if (count > 0) {
      saveLS();
      // ALTO-J: persistir com ignore-duplicates — o seed só INSERE equivalências novas, nunca
      // sobrescreve as existentes no banco (protege confirmado:true de outra máquina/sessão).
      try { await sbUpsert(Object.values(_cache), { ignoreDuplicates: true }); } catch (_) { /* retry later */ }
      gdpLog('[RadarMatcher] seeded', count, 'entries from contratos (ignore-duplicates)');
    }
  }

  // Story 13.5: regras de regex N3 vivem no core (REGEX_RULES). Reexportadas para compat.
  var REGEX_RULES = CORE.REGEX_RULES || [];

  // matchRegexRules: delega ao core, alimentando o catálogo de produtos do browser
  // (centralProdutos preferencial, bancoPrecos como fallback) que o core não conhece.
  function matchRegexRules(itemName) {
    var produtos = [];
    if (typeof centralProdutos !== 'undefined' && Array.isArray(centralProdutos)) {
      produtos = produtos.concat(centralProdutos);
    }
    if (typeof bancoPrecos !== 'undefined' && bancoPrecos && Array.isArray(bancoPrecos.itens)) {
      produtos = produtos.concat(bancoPrecos.itens.map(function (b) {
        return { id: b.id, sku: b.id, item: b.item, nome: b.item };
      }));
    }
    return CORE.matchRegexRules(itemName, produtos);
  }

  // Mapeia o status canônico do core → vocabulário consumido pelo app.js legado.
  // SUGESTAO vira 'pendente_revisao' (gate de aprovação humana em renderPreOrcamentoItens).
  function mapStatus(coreStatus) {
    if (coreStatus === CORE.MATCH_STATUS.CONFIRMADO) return 'confirmado';
    if (coreStatus === CORE.MATCH_STATUS.SUGESTAO) return 'pendente_revisao';
    return 'sem_match';
  }

  // Monta o catálogo de produtos que o core usa para N2/N3 (bancoPrecos do browser).
  function bancoProdutos() {
    if (typeof bancoPrecos === 'undefined' || !bancoPrecos || !Array.isArray(bancoPrecos.itens)) return [];
    return bancoPrecos.itens;
  }

  function match(itemName) {
    var core = CORE.matchProduct(itemName, { cache: _cache, produtos: bancoProdutos() });

    // N4 / sem match
    if (!core.sku || core.status === CORE.MATCH_STATUS.SEM_MATCH) {
      var noMatch = {
        status: 'sem_match', score: 0, sku: null, nomeBanco: null,
        custoBase: 0, margem: 0, precoSugerido: 0, match_layer: core.matchLayer || 'N4'
      };
      if (core.categoriaSugerida) noMatch.categoria_sugerida = core.categoriaSugerida;
      return noMatch;
    }

    // N1 hit no cache → registra uso (telemetria de equivalências)
    if (core.matchLayer === 'N1') {
      var key = normalizeProductName(itemName);
      if (_cache[key]) {
        _cache[key].vezes_usado = (_cache[key].vezes_usado || 0) + 1;
        saveLS();
      }
    }

    // Enriquecimento com dados do banco (custo/margem/preço sugerido)
    var bp = findBancoItem(core.sku);
    var result = {
      status: mapStatus(core.status),
      score: core.score,
      sku: core.sku,
      nomeBanco: core.nomeBanco || (bp ? bp.item : null),
      custoBase: bp ? (bp.custoBase || 0) : 0,
      margem: bp ? (bp.margemPadrao || 0) : 0,
      precoSugerido: bp ? (bp.custoBase || 0) * (1 + (bp.margemPadrao || 0.30)) : 0,
      match_layer: core.matchLayer
    };
    if (core.categoriaSugerida) result.categoria_sugerida = core.categoriaSugerida;
    return result;
  }

  function findBancoItem(sku) {
    if (!sku || typeof bancoPrecos === 'undefined' || !bancoPrecos || !Array.isArray(bancoPrecos.itens)) return null;
    return bancoPrecos.itens.find(function (b) { return b.id === sku || b.sku === sku; }) || null;
  }

  async function confirm(itemName, sku, nomeBanco) {
    var key = normalizeProductName(itemName);
    if (!key) return;
    var bp = findBancoItem(sku);
    var entry = {
      empresa_id: empresaId(),
      chave_normalizada: key,
      sku: sku,
      nome_banco: nomeBanco,
      confirmado: true,
      origem: 'manual',
      score: 1.0,
      vezes_usado: (_cache[key] ? _cache[key].vezes_usado || 0 : 0) + 1,
      ncm: bp ? (bp.ncm || '') : '',
      unidade: bp ? (bp.unidade || '') : ''
    };
    _cache[key] = entry;
    saveLS();
    if (typeof schedulCloudSync === 'function') schedulCloudSync();
    try { await sbUpsert([entry]); } catch (e) { gdpWarn('[RadarMatcher] confirm save failed', e.message); }
  }

  async function reject(itemName) {
    var key = normalizeProductName(itemName);
    if (!key) return;
    delete _cache[key];
    saveLS();
    if (typeof schedulCloudSync === 'function') schedulCloudSync();
    try {
      await fetch(REST + '/radar_equivalencias?chave_normalizada=eq.' + encodeURIComponent(key) + '&empresa_id=eq.' + encodeURIComponent(empresaId()), {
        method: 'DELETE', headers: HEADERS
      });
    } catch (e) { gdpWarn('[RadarMatcher] reject delete failed', e.message); }
  }

  window.RadarMatcher = {
    init: init,
    match: match,
    confirm: confirm,
    reject: reject,
    normalizeProductName: normalizeProductName,
    tokenSimilarity: tokenSimilarity,
    matchRegexRules: matchRegexRules,
    seedFromContratos: seedFromContratos,
    getCache: function () { return _cache; },
    isReady: function () { return _cacheReady; },
    REGEX_RULES: REGEX_RULES
  };

  gdpLog('[RadarMatcher] module loaded');
})();
