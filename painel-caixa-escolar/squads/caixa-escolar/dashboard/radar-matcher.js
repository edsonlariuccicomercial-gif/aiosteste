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
    var res = await fetch(REST + '/radar_equivalencias', {
      method: 'POST',
      headers: Object.assign({}, HEADERS, { Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(rows)
    });
    if (!res.ok) throw new Error('Supabase upsert ' + res.status);
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

  var _initPromise = null;
  async function init() {
    if (_initPromise) return _initPromise;
    _initPromise = _doInit();
    return _initPromise;
  }
  async function _doInit() {
    try {
      var rows = await sbFetch('/radar_equivalencias?select=*&empresa_id=eq.' + encodeURIComponent(empresaId()));
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
      // Persist to Supabase in background
      try { await sbUpsert(Object.values(_cache)); } catch (_) { /* retry later */ }
      gdpLog('[RadarMatcher] seeded', count, 'entries from contratos');
    }
  }

  // Story 13.5: Configurable regex rules for N3 matching layer
  var REGEX_RULES = [
    // Alimentos
    { pattern: /arroz\s*(tipo\s*1|agulhinha|parbo)/i, categoria: "Alimentos" },
    { pattern: /feij[aã]o\s*(carioca|preto|fradinho|branco)/i, categoria: "Alimentos" },
    { pattern: /a[cç][uú]car\s*(cristal|refinado|demerara)/i, categoria: "Alimentos" },
    { pattern: /[oó]leo\s*(soja|canola|girassol|milho)/i, categoria: "Alimentos" },
    { pattern: /macarr[aã]o\s*(espaguete|parafuso|penne|padre\s*nosso)/i, categoria: "Alimentos" },
    { pattern: /farinha\s*(trigo|mandioca|milho|rosca)/i, categoria: "Alimentos" },
    { pattern: /leite\s*(integral|desnatado|semi|p[oó]\s*integral|p[oó]|uht)/i, categoria: "Alimentos" },
    { pattern: /caf[eé]\s*(torrado|moido|soluvel|em\s*po)/i, categoria: "Alimentos" },
    { pattern: /sal\s*(refinado|grosso|iodado)/i, categoria: "Alimentos" },
    { pattern: /extrato\s*(tomate|molho)/i, categoria: "Alimentos" },
    // Limpeza
    { pattern: /papel\s*(higi[eê]nico|toalha|rol[aã]o)/i, categoria: "Limpeza" },
    { pattern: /detergente\s*(l[ií]quido|neutro|coco)/i, categoria: "Limpeza" },
    { pattern: /desinfetante|agua\s*sanitaria|cloro/i, categoria: "Limpeza" },
    { pattern: /sabao\s*(em\s*po|liquido|barra|pedra)/i, categoria: "Limpeza" },
    { pattern: /esponja|palha\s*de\s*aco|pano\s*de\s*(ch[aã]o|prato)/i, categoria: "Limpeza" },
    { pattern: /saco\s*(lixo|de\s*lixo)/i, categoria: "Limpeza" },
    // Material Escolar
    { pattern: /caderno\s*(\d+|espiral|brochura|capa\s*dura)/i, categoria: "Material Escolar" },
    { pattern: /l[aá]pis\s*(preto|cor|grafite|hb)/i, categoria: "Material Escolar" },
    { pattern: /caneta\s*(esferogr|azul|preta|vermelha)/i, categoria: "Material Escolar" },
    { pattern: /borracha\s*(branca|bicolor|escolar)/i, categoria: "Material Escolar" },
    { pattern: /cola\s*(branca|bast[aã]o|instant|l[ií]quida)/i, categoria: "Material Escolar" },
    { pattern: /papel\s*(sulfite|a4|chamequinho|oficio)/i, categoria: "Material Escolar" },
  ];

  function matchRegexRules(itemName) {
    var norm = String(itemName || '');
    for (var i = 0; i < REGEX_RULES.length; i++) {
      if (REGEX_RULES[i].pattern.test(norm)) {
        // Find a product in centralProdutos (v2) or bancoPrecos that matches the regex
        var rule = REGEX_RULES[i];
        // Search centralProdutos first
        if (typeof centralProdutos !== 'undefined' && Array.isArray(centralProdutos)) {
          for (var j = 0; j < centralProdutos.length; j++) {
            var cp = centralProdutos[j];
            if (rule.pattern.test(cp.nome || cp.descricao || '')) {
              return { produto_id: cp.id, nome: cp.nome || cp.descricao || '', categoria: rule.categoria, ruleIdx: i };
            }
          }
        }
        // Fallback: search bancoPrecos
        if (typeof bancoPrecos !== 'undefined' && bancoPrecos && Array.isArray(bancoPrecos.itens)) {
          for (var k = 0; k < bancoPrecos.itens.length; k++) {
            var bp = bancoPrecos.itens[k];
            if (rule.pattern.test(bp.item || '')) {
              return { produto_id: bp.id, nome: bp.item || '', categoria: rule.categoria, ruleIdx: i, sku: bp.id };
            }
          }
        }
        // Regex matched but no product found — return partial match for category suggestion
        return { produto_id: null, nome: null, categoria: rule.categoria, ruleIdx: i };
      }
    }
    return null;
  }

  function match(itemName) {
    var key = normalizeProductName(itemName);
    var noMatch = { status: 'sem_match', score: 0, sku: null, nomeBanco: null, custoBase: 0, margem: 0, precoSugerido: 0, match_layer: null };
    if (!key) return noMatch;

    // Layer N1: Exact dictionary match (confirmed equivalencia) — score 1.0
    if (_cache[key]) {
      var entry = _cache[key];
      entry.vezes_usado = (entry.vezes_usado || 0) + 1;
      saveLS();
      var bp = findBancoItem(entry.sku);
      var status = entry.confirmado ? 'confirmado' : 'pendente_revisao';
      var r1 = buildResult(status, 1.0, entry, bp);
      r1.match_layer = 'N1';
      return r1;
    }

    // Layer N2: Token similarity >= 0.7 (Story 13.5: raised from 0.6)
    var bestSeed = null, bestSeedScore = 0;
    Object.keys(_cache).forEach(function (k) {
      var sc = tokenSimilarity(key, k);
      if (sc >= 0.7 && sc > bestSeedScore) { bestSeedScore = sc; bestSeed = _cache[k]; }
    });
    if (bestSeed) {
      var bp2 = findBancoItem(bestSeed.sku);
      var r2 = buildResult('pendente_revisao', bestSeedScore, bestSeed, bp2);
      r2.match_layer = 'N2';
      return r2;
    }

    // Also check bancoPrecos with raised threshold 0.7
    if (typeof bancoPrecos !== 'undefined' && bancoPrecos && Array.isArray(bancoPrecos.itens)) {
      var bestBp = null, bestBpScore = 0;
      bancoPrecos.itens.forEach(function (b) {
        var sc = tokenSimilarity(key, b.item);
        if (sc >= 0.7 && sc > bestBpScore) { bestBpScore = sc; bestBp = b; }
      });
      if (bestBp) {
        var r2b = {
          status: 'pendente_revisao', score: bestBpScore,
          sku: bestBp.id, nomeBanco: bestBp.item,
          custoBase: bestBp.custoBase || 0,
          margem: bestBp.margemPadrao || 0,
          precoSugerido: (bestBp.custoBase || 0) * (1 + (bestBp.margemPadrao || 0.30)),
          match_layer: 'N2'
        };
        return r2b;
      }
    }

    // Layer N3: Regex rules (Story 13.5) — pattern-based matching
    var regexMatch = matchRegexRules(itemName);
    if (regexMatch && regexMatch.produto_id) {
      var bpRegex = findBancoItem(regexMatch.sku || regexMatch.produto_id);
      return {
        status: 'pendente_revisao', score: 0.65,
        sku: regexMatch.sku || regexMatch.produto_id, nomeBanco: regexMatch.nome,
        custoBase: bpRegex ? (bpRegex.custoBase || 0) : 0,
        margem: bpRegex ? (bpRegex.margemPadrao || 0) : 0,
        precoSugerido: bpRegex ? (bpRegex.custoBase || 0) * (1 + (bpRegex.margemPadrao || 0.30)) : 0,
        match_layer: 'N3',
        categoria_sugerida: regexMatch.categoria
      };
    }

    // Layer N4: No match — fallback (create produto inline, handled by caller)
    noMatch.match_layer = 'N4';
    if (regexMatch && regexMatch.categoria) {
      noMatch.categoria_sugerida = regexMatch.categoria;
    }
    return noMatch;
  }
  function findBancoItem(sku) {
    if (!sku || typeof bancoPrecos === 'undefined' || !bancoPrecos || !Array.isArray(bancoPrecos.itens)) return null;
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
