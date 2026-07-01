/* Product Store — camada de persistência da SSoT de produtos (gdp.produtos.v1).
   Consome ProductStoreCore (lógica pura) e adiciona localStorage + sync cloud.
   Carregar APÓS radar-matcher-core.browser.js e product-store-core.browser.js.

   Expõe window.ProductStore: a fonte única de produtos para GDP, Radar e Central.
   Migração consolidadora (Fase 2) absorve as 4 bases legadas → gdp.produtos.v1. */
(function () {
  'use strict';

  var SSOT_KEY = 'gdp.produtos.v1';
  var MIGRATION_FLAG = 'gdp.produtos.migrado-ssot.v1';
  var LEGACY = {
    BANCO: 'caixaescolar.banco.v1',
    INTEL: 'intel.central-produtos.v2',
    ESTOQUE: 'gdp.estoque-intel.produtos.v1'
  };

  var Core = (typeof window !== 'undefined' && window.ProductStoreCore) ? window.ProductStoreCore : null;

  function log() { if (typeof gdpLog === 'function') gdpLog.apply(null, arguments); }
  function warn() { if (typeof gdpWarn === 'function') gdpWarn.apply(null, arguments); }
  function nowIso() { return new Date().toISOString(); }

  function readKey(key) {
    try {
      var raw = JSON.parse(localStorage.getItem(key) || 'null');
      if (!raw) return [];
      return raw.itens || raw.items || (Array.isArray(raw) ? raw : []);
    } catch (_) { return []; }
  }

  // ── Estado em memória (cache da SSoT) ──
  var _itens = null;

  function load() {
    if (_itens) return _itens;
    var raw = readKey(SSOT_KEY);
    // Canonicaliza na leitura: garante id/sku/campos estáveis mesmo para dados legados
    // (em produção, 28/270 produtos tinham id nulo). Idempotente.
    if (Core && Core.toCanonical) {
      var dirty = false;
      _itens = raw.map(function (p, i) {
        var c = Core.toCanonical(p, 'ssot', { now: nowIso(), idSeed: (p && (p.sku || p.id)) || ('ssot' + i) });
        if (p && p.id) c.id = p.id;            // preserva id válido existente
        if (!c.id) { c.id = Core.generateId((p && (p.sku || p.descricao)) || ('ssot' + i)); }
        if (!p || !p.id) dirty = true;          // faltava id → marca para regravar
        return c;
      });
      if (dirty && raw.length) { persist(); }   // normaliza no disco uma vez
    } else {
      _itens = raw;
    }
    return _itens;
  }

  function persist() {
    // CRIT-B (2026-07-01 — "produtos somem/voltam"): gravar no MESMO formato que os
    // leitores quentes de gdp.produtos.v1 esperam. A entidade produtos em gdp-api.js é
    // wrapped:true — readLS() só reconhece raw.items (inglês) e _mergeTable (gdp-core.js)
    // lê localData.items/incomingData.items. Antes o ProductStore gravava só { itens }
    // (português): readLS via undefined → truncava o mirror ao 1 item recém-salvo, e o
    // merge do boot via localItems=0 → derrubava toda a SSoT (todas as guardas de
    // preservação local dependem de localData.items). Resultado: cadastro sumia no boot.
    // Agora grava items (canônico) + itens (compat legada, leitores que ainda usam .itens).
    var itens = _itens || [];
    var payload = { _v: 1, updatedAt: nowIso(), items: itens, itens: itens };
    try { localStorage.setItem(SSOT_KEY, JSON.stringify(payload)); } catch (e) {
      warn('[ProductStore] falha ao salvar SSoT', e.message);
      return false;
    }
    // ADR-004 D-2: marcar edicao do usuario para o merge do boot Supabase-First respeitar
    // a alteracao recente (preferLocal na janela de 5s) e nao deixar o servidor vencer.
    if (typeof window !== 'undefined' && typeof window.gdpMarkUserEdit === 'function') {
      try { window.gdpMarkUserEdit(SSOT_KEY); } catch (_) {}
    }
    // NOTA ADR-004: a verdade vai para a TABELA via gdpApi.produtos (save/remove abaixo),
    // NAO via schedulCloudSync (syncToCloud pula gdp.produtos.v1 — _SUPABASE_TABLE_KEYS).
    return true;
  }

  // ── API pública (read-through views consomem isto) ──
  function list() { return load().slice(); }

  function get(id) {
    return load().find(function (p) { return p.id === id; }) || null;
  }

  function getByNameOrSku(query) {
    var items = load();
    var q = String(query || '');
    var bySku = items.find(function (p) { return p.sku && p.sku.toLowerCase() === q.toLowerCase(); });
    if (bySku) return bySku;
    var norm = Core ? Core.dedupeKey({ sku: '', descricao: q }) : '';
    if (!norm) return null;
    return items.find(function (p) {
      return Core.dedupeKey({ sku: '', descricao: p.descricao }) === norm;
    }) || null;
  }

  function save(produto) {
    var items = load();
    var canon = Core ? Core.toCanonical(produto, 'manual', { now: nowIso() }) : produto;
    // preserva id existente quando atualizando
    if (produto && produto.id) canon.id = produto.id;
    var idx = items.findIndex(function (p) {
      return (canon.id && p.id === canon.id) || (canon.sku && p.sku && p.sku.toLowerCase() === canon.sku.toLowerCase());
    });
    canon.atualizadoEm = nowIso();
    if (idx >= 0) {
      canon.criadoEm = items[idx].criadoEm || canon.criadoEm;
      items[idx] = canon;
    } else {
      canon.criadoEm = canon.criadoEm || nowIso();
      items.push(canon);
    }
    persist();
    // ADR-004 D-1: persistir na TABELA Supabase (fonte unica). Idempotente (upsert por id).
    // gdpApi.produtos.save tambem espelha no localStorage e registra echo-suppression.
    _pushToTable(canon);
    return canon;
  }

  function remove(id) {
    var items = load();
    var before = items.length;
    _itens = items.filter(function (p) { return p.id !== id; });
    if (_itens.length !== before) {
      persist();
      // ADR-004 D-1/D-3: remover da tabela + tombstone (gdpApi.produtos.remove trata _DELETE_KEYS)
      _removeFromTable(id);
    }
    return before - _itens.length;
  }

  // ADR-004 — ponte para a tabela Supabase. Fail-soft: se gdpApi indisponivel, segue
  // local (a SSoT em localStorage ja foi gravada por persist()).
  function _pushToTable(produto) {
    try {
      if (typeof window !== 'undefined' && window.gdpApi && window.gdpApi.produtos) {
        window.gdpApi.produtos.save(produto).catch(function (e) { warn('[ProductStore] gdpApi.save falhou', e && e.message); });
      }
    } catch (e) { warn('[ProductStore] _pushToTable erro', e && e.message); }
  }
  function _removeFromTable(id) {
    try {
      if (typeof window !== 'undefined' && window.gdpApi && window.gdpApi.produtos) {
        window.gdpApi.produtos.remove(id).catch(function (e) { warn('[ProductStore] gdpApi.remove falhou', e && e.message); });
      }
    } catch (e) { warn('[ProductStore] _removeFromTable erro', e && e.message); }
  }

  // searchCatalog: produtos para o matcher N3 (forma compatível com centralProdutos)
  function searchCatalog() {
    return load().map(function (p) {
      return { id: p.id, sku: p.sku, nome: p.descricao, descricao: p.descricao, item: p.descricao, categoria: p.grupo };
    });
  }

  // view bancoPrecos (forma legada consumida por radar-matcher/pricing)
  function asBancoPrecos() {
    return {
      updatedAt: nowIso(),
      itens: load().map(function (p) {
        return {
          id: p.id, item: p.descricao, descricao: p.descricao, sku: p.sku, ncm: p.ncm,
          unidade: p.unidade, marca: p.marca, grupo: p.grupo,
          custoBase: p.custoBase || 0, precoReferencia: p.precoReferencia || 0,
          margemPadrao: p.margemAlvo || 0,
          custosFornecedor: p.custosFornecedor || [], concorrentes: p.concorrentes || [],
          propostas: p.propostas || [], fonte: p.fonte || ''
        };
      })
    };
  }

  // ── Migração consolidadora (Fase 2) — idempotente, com backup ──
  function migrarParaSSoT(opts) {
    opts = opts || {};
    if (!Core) { warn('[ProductStore] Core ausente — migração abortada'); return { skipped: 'no_core' }; }
    if (!opts.force && localStorage.getItem(MIGRATION_FLAG)) {
      return { skipped: 'already_done' };
    }

    var bases = {};
    bases[SSOT_KEY] = readKey(SSOT_KEY);
    bases[LEGACY.BANCO] = readKey(LEGACY.BANCO);
    bases[LEGACY.INTEL] = readKey(LEGACY.INTEL);
    bases[LEGACY.ESTOQUE] = readKey(LEGACY.ESTOQUE);

    // Backup antes de qualquer escrita (rede de segurança / rollback)
    var backup = {};
    Object.keys(bases).forEach(function (k) { backup[k] = localStorage.getItem(k); });
    var backupKey = 'gdp.produtos.backup-pre-ssot.v1';
    try { localStorage.setItem(backupKey, JSON.stringify({ at: nowIso(), keys: backup })); } catch (_) {}

    var result = Core.mergeIntoSSoT(bases, { now: nowIso() });
    var gate = Core.validateSSoT(result.itens, { minCount: bases[SSOT_KEY].length });

    if (!gate.ok) {
      warn('[ProductStore] migração NÃO aplicada — gate falhou:', gate.errors.join('; '));
      return { applied: false, gate: gate, stats: result.stats };
    }

    _itens = result.itens;
    persist();
    localStorage.setItem(MIGRATION_FLAG, nowIso());
    log('[ProductStore] migração SSoT: ' + result.itens.length + ' produtos consolidados',
      JSON.stringify(result.stats));
    return { applied: true, total: result.itens.length, stats: result.stats, gate: gate, backupKey: backupKey };
  }

  function rollbackMigracao() {
    var backupKey = 'gdp.produtos.backup-pre-ssot.v1';
    try {
      var b = JSON.parse(localStorage.getItem(backupKey) || 'null');
      if (!b || !b.keys) return { restored: false, reason: 'no_backup' };
      Object.keys(b.keys).forEach(function (k) {
        if (b.keys[k] != null) localStorage.setItem(k, b.keys[k]);
      });
      localStorage.removeItem(MIGRATION_FLAG);
      _itens = null;
      return { restored: true };
    } catch (e) { return { restored: false, reason: e.message }; }
  }

  function reload() { _itens = null; return load(); }

  window.ProductStore = {
    list: list,
    get: get,
    getByNameOrSku: getByNameOrSku,
    save: save,
    remove: remove,
    searchCatalog: searchCatalog,
    asBancoPrecos: asBancoPrecos,
    migrarParaSSoT: migrarParaSSoT,
    rollbackMigracao: rollbackMigracao,
    reload: reload,
    SSOT_KEY: SSOT_KEY,
    MIGRATION_FLAG: MIGRATION_FLAG
  };

  log('[ProductStore] módulo carregado');
})();
