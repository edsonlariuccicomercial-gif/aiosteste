/* Radar Matcher — Product matching engine for pre-quotation (SGD -> banco de precos) */
(function () {
  'use strict';

  var SUPABASE_URL = window.SUPABASE_URL || 'https://mvvsjaudhbglxttxaeop.supabase.co';
  var SUPABASE_KEY = window.SUPABASE_KEY || 'sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR';
  var REST = SUPABASE_URL + '/rest/v1';
  var HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  var LS_KEY = 'radar.equivalencias.v1';
  var NOISE = ['tipo', 'pct', 'c/', 'un', 'marca', 'de', 'do', 'da', 'com', 'para', 'em',
    'qualidade', 'primeira', 'segunda', 'pacote'];
  var SYNONYMS = {
    carioquinha: 'carioca', parboilizado: 'parbolizado',
    mussarela: 'mussarela', mucarela: 'mussarela', muzzarela: 'mussarela',
    macarrao: 'macarrao'
  };
  var BRAND_BLACKLIST = ['yoki', 'camil', 'kicaldo', 'urbano', 'tio joao', 'dona benta',
    'renata', 'adria', 'isabela', 'piraque', 'vitarella', 'predilecta', 'fugini',
    'quero', 'elefante', 'hemmer', 'sadia', 'perdigao', 'aurora', 'seara',
    'friboi', 'minerva', 'marfrig', 'liza', 'soya', 'abc'];

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

  async function sbUpsert(rows) {
    await fetch(REST + '/radar_equivalencias', {
      method: 'POST',
      headers: Object.assign({}, HEADERS, { Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(rows)
    });
  }

  function loadLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveLS() { localStorage.setItem(LS_KEY, JSON.stringify(_cache)); }

  function normalizeProductName(name) {
    var s = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    Object.keys(SYNONYMS).forEach(function (k) { s = s.replace(new RegExp('\\b' + k + '\\b', 'g'), SYNONYMS[k]); });
    BRAND_BLACKLIST.forEach(function (b) { s = s.replace(new RegExp('\\b' + b + '\\b', 'gi'), ''); });
    var tokens = s.split(/[\s,;/\-()]+/).filter(Boolean);
    tokens = tokens.filter(function (t) { return NOISE.indexOf(t) === -1; });
    tokens = tokens.filter(function (t) { return !/^\d+$/.test(t); }); // keep 1kg, 500g, 900ml
    return tokens.join(' ').replace(/\s+/g, ' ').trim();
  }

  function tokenSimilarity(a, b) {
    var ta = normalizeProductName(a).split(/\s+/).filter(function (t) { return t.length > 2; });
    var tb = normalizeProductName(b).split(/\s+/).filter(function (t) { return t.length > 2; });
    if (ta.length === 0 || tb.length === 0) return 0;
    var setA = new Set(ta), setB = new Set(tb);
    var inter = 0;
    setA.forEach(function (t) { if (setB.has(t)) inter++; });
    return inter / Math.max(setA.size, setB.size);
  }

  async function init() {
    try {
      var rows = await sbFetch('/radar_equivalencias?select=*&empresa_id=eq.' + encodeURIComponent(empresaId()));
      if (rows && rows.length > 0) {
        rows.forEach(function (r) { _cache[r.chave_normalizada] = r; });
        saveLS();
        _cacheReady = true;
        console.log('[RadarMatcher] loaded', rows.length, 'equivalencias from Supabase');
        return;
      }
    } catch (e) {
      console.warn('[RadarMatcher] Supabase load failed, using localStorage', e.message);
    }
    // Fallback to localStorage
    _cache = loadLS();
    if (Object.keys(_cache).length === 0) {
      await seedFromContratos();
    }
    _cacheReady = true;
    console.log('[RadarMatcher] ready,', Object.keys(_cache).length, 'entries');
  }

  async function seedFromContratos() {
    var contratos = [];
    try {
      contratos = await sbFetch('/contratos?select=*&empresa_id=eq.' + encodeURIComponent(empresaId()));
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
        // Find banco item to enrich
        var bp = (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens)
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
      // Persist to Supabase in background
      try { await sbUpsert(Object.values(_cache)); } catch (_) { /* retry later */ }
      console.log('[RadarMatcher] seeded', count, 'entries from contratos');
    }
  }

  function match(itemName) {
    var key = normalizeProductName(itemName);
    var noMatch = { status: 'sem_match', score: 0, sku: null, nomeBanco: null, custoBase: 0, margem: 0, precoSugerido: 0 };
    if (!key) return noMatch;

    // Layer 1: Exact dictionary match
    if (_cache[key]) {
      var entry = _cache[key];
      entry.vezes_usado = (entry.vezes_usado || 0) + 1;
      var bp = findBancoItem(entry.sku);
      return buildResult('exato', 1.0, entry, bp);
    }

    // Layer 2: Seed from contratos — token similarity >= 0.6
    var bestSeed = null, bestSeedScore = 0;
    Object.keys(_cache).forEach(function (k) {
      var sc = tokenSimilarity(key, k);
      if (sc >= 0.6 && sc > bestSeedScore) { bestSeedScore = sc; bestSeed = _cache[k]; }
    });
    if (bestSeed) {
      var bp2 = findBancoItem(bestSeed.sku);
      return buildResult('sugestao', bestSeedScore, bestSeed, bp2);
    }

    // Layer 3: Fuzzy match in bancoPrecos.itens >= 0.5
    if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
      var bestBp = null, bestBpScore = 0;
      bancoPrecos.itens.forEach(function (b) {
        var sc = tokenSimilarity(key, b.item);
        if (sc >= 0.5 && sc > bestBpScore) { bestBpScore = sc; bestBp = b; }
      });
      if (bestBp) {
        return {
          status: 'sugestao', score: bestBpScore,
          sku: bestBp.id, nomeBanco: bestBp.item,
          custoBase: bestBp.custoBase || 0,
          margem: bestBp.margemPadrao || 0,
          precoSugerido: (bestBp.custoBase || 0) * (1 + (bestBp.margemPadrao || 0.30))
        };
      }
    }

    return noMatch;
  }
  function findBancoItem(sku) {
    if (!sku || typeof bancoPrecos === 'undefined' || !bancoPrecos.itens) return null;
    return bancoPrecos.itens.find(function (b) { return b.id === sku || b.sku === sku; }) || null;
  }

  function buildResult(status, score, entry, bp) {
    return {
      status: status, score: score,
      sku: entry.sku, nomeBanco: entry.nome_banco,
      custoBase: bp ? (bp.custoBase || 0) : 0,
      margem: bp ? (bp.margemPadrao || 0) : 0,
      precoSugerido: bp ? (bp.custoBase || 0) * (1 + (bp.margemPadrao || 0.30)) : 0
    };
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
    try { await sbUpsert([entry]); } catch (e) { console.warn('[RadarMatcher] confirm save failed', e.message); }
  }

  window.RadarMatcher = {
    init: init,
    match: match,
    confirm: confirm,
    normalizeProductName: normalizeProductName,
    tokenSimilarity: tokenSimilarity,
    seedFromContratos: seedFromContratos,
    getCache: function () { return _cache; },
    isReady: function () { return _cacheReady; }
  };

  console.log('[RadarMatcher] module loaded');
})();
