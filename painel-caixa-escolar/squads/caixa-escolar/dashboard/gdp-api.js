/**
 * gdp-api.js — Supabase-first data access layer for GDP
 * Falls back to localStorage cache and legacy sync_data table when needed.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://mvvsjaudhbglxttxaeop.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR';
  var REST = SUPABASE_URL + '/rest/v1';
  var HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  var UPSERT_HEADERS = Object.assign({}, HEADERS, { Prefer: 'return=minimal,resolution=merge-duplicates' });

  var ENTITIES = {
    contratos:      { lsKey: 'gdp.contratos.v1',      table: 'contratos',      wrapped: true  },
    pedidos:        { lsKey: 'gdp.pedidos.v1',         table: 'pedidos',        wrapped: true  },
    notas_fiscais:  { lsKey: 'gdp.notas-fiscais.v1',  table: 'notas_fiscais',  wrapped: true  },
    clientes:       { lsKey: 'gdp.usuarios.v1',        table: 'clientes',       wrapped: false },
    contas_receber: { lsKey: 'gdp.contas-receber.v1',  table: 'contas_receber', wrapped: true  },
    contas_pagar:   { lsKey: 'gdp.contas-pagar.v1',    table: 'contas_pagar',   wrapped: true  },
    entregas:       { lsKey: 'gdp.entregas.provas.v1', table: 'entregas',       wrapped: false },
    nf_counter:     { lsKey: 'gdp.nf-counter.v1',      table: 'nf_counter',     wrapped: false }
  };

  function getEmpresaId() {
    try {
      var emp = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
      return emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || 'LARIUCCI';
    } catch (_) { return 'LARIUCCI'; }
  }

  function genId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function readLS(entity) {
    try {
      var raw = JSON.parse(localStorage.getItem(entity.lsKey) || 'null');
      if (raw == null) return null;
      if (entity.wrapped && raw.items) return raw.items;
      if (Array.isArray(raw)) return raw;
      return null;
    } catch (_) { return null; }
  }

  function writeLS(entity, items) {
    var value = entity.wrapped ? { _v: 1, updatedAt: new Date().toISOString(), items: items } : items;
    localStorage.setItem(entity.lsKey, JSON.stringify(value));
  }

  async function sbFetch(path) {
    try {
      var resp = await fetch(REST + path, { headers: HEADERS });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (_) { return null; }
  }

  async function sbUpsert(table, row, conflict) {
    try {
      var resp = await fetch(REST + '/' + table + '?on_conflict=' + conflict, {
        method: 'POST', headers: UPSERT_HEADERS, body: JSON.stringify(row)
      });
      return resp.ok;
    } catch (_) { return false; }
  }

  async function sbDelete(table, id) {
    try {
      var resp = await fetch(REST + '/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: HEADERS });
      return resp.ok;
    } catch (_) { return false; }
  }

  async function readSyncData(lsKey) {
    var path = '/sync_data?user_id=eq.' + encodeURIComponent(getEmpresaId())
      + '&key=eq.' + encodeURIComponent(lsKey) + '&select=data';
    var rows = await sbFetch(path);
    if (!rows || !rows.length) return null;
    var data = rows[0].data;
    if (data && data.items) return data.items;
    if (Array.isArray(data)) return data;
    return null;
  }

  // --- retry queue for offline writes ---
  var _retryQueue = [];

  function enqueueRetry(table, row, conflict) {
    _retryQueue.push({ table: table, row: row, conflict: conflict, ts: Date.now() });
  }

  async function flushRetryQueue() {
    if (!_retryQueue.length) return;
    var pending = _retryQueue.splice(0);
    for (var i = 0; i < pending.length; i++) {
      var ok = await sbUpsert(pending[i].table, pending[i].row, pending[i].conflict);
      if (!ok) _retryQueue.push(pending[i]);
    }
  }

  setInterval(function () { if (navigator.onLine && _retryQueue.length) flushRetryQueue(); }, 30000);

  // --- entity CRUD factory ---
  function createEntityApi(name) {
    var entity = ENTITIES[name];
    var table = entity.table;

    return {
      list: async function () {
        var rows = await sbFetch('/' + table + '?select=*&empresa_id=eq.' + encodeURIComponent(getEmpresaId()));
        if (rows != null) return rows;
        var ls = readLS(entity);
        if (ls != null) return ls;
        return (await readSyncData(entity.lsKey)) || [];
      },

      get: async function (id) {
        var rows = await sbFetch('/' + table + '?id=eq.' + encodeURIComponent(id) + '&select=*');
        if (rows && rows.length) return rows[0];
        var ls = readLS(entity);
        if (ls) for (var i = 0; i < ls.length; i++) { if (ls[i].id === id) return ls[i]; }
        return null;
      },

      save: async function (item) {
        if (!item.id) item.id = genId();
        if (!item.empresa_id) item.empresa_id = getEmpresaId();
        item.updated_at = new Date().toISOString();
        var ok = await sbUpsert(table, item, 'id');
        if (!ok) enqueueRetry(table, item, 'id');
        // update localStorage cache
        var ls = readLS(entity) || [];
        var idx = -1;
        for (var i = 0; i < ls.length; i++) { if (ls[i].id === item.id) { idx = i; break; } }
        if (idx >= 0) ls[idx] = item; else ls.push(item);
        writeLS(entity, ls);
        return item;
      },

      saveAll: async function (items) {
        var eid = getEmpresaId(), now = new Date().toISOString();
        for (var i = 0; i < items.length; i++) {
          if (!items[i].id) items[i].id = genId();
          if (!items[i].empresa_id) items[i].empresa_id = eid;
          items[i].updated_at = now;
        }
        try {
          var resp = await fetch(REST + '/' + table + '?on_conflict=id', {
            method: 'POST', headers: UPSERT_HEADERS, body: JSON.stringify(items)
          });
          if (!resp.ok) items.forEach(function (it) { enqueueRetry(table, it, 'id'); });
        } catch (_) {
          items.forEach(function (it) { enqueueRetry(table, it, 'id'); });
        }
        writeLS(entity, items);
        return items;
      },

      remove: async function (id) {
        await sbDelete(table, id);
        var ls = readLS(entity) || [];
        writeLS(entity, ls.filter(function (it) { return it.id !== id; }));
        return true;
      }
    };
  }

  // --- nf_counter (keyed by empresa_id, not id) ---
  var nfCounterApi = {
    list: async function () {
      var rows = await sbFetch('/nf_counter?select=*&empresa_id=eq.' + encodeURIComponent(getEmpresaId()));
      if (rows != null) return rows;
      try { return JSON.parse(localStorage.getItem('gdp.nf-counter.v1') || '[]'); } catch (_) { return []; }
    },
    get: async function (empresaId) {
      var eid = empresaId || getEmpresaId();
      var rows = await sbFetch('/nf_counter?empresa_id=eq.' + encodeURIComponent(eid) + '&select=*');
      return (rows && rows.length) ? rows[0] : null;
    },
    save: async function (item) {
      if (!item.empresa_id) item.empresa_id = getEmpresaId();
      var ok = await sbUpsert('nf_counter', item, 'empresa_id');
      if (!ok) enqueueRetry('nf_counter', item, 'empresa_id');
      localStorage.setItem('gdp.nf-counter.v1', JSON.stringify(item));
      return item;
    },
    saveAll: async function (items) { return this.save(items[0] || items); },
    remove: async function () { return false; }
  };

  // --- isReady: check if new tables exist ---
  async function isReady() {
    try {
      var resp = await fetch(REST + '/contratos?select=id&limit=0', { headers: HEADERS });
      return resp.ok;
    } catch (_) { return false; }
  }

  // --- migrateFromSyncData: one-time migration from legacy sync_data + localStorage ---
  async function migrateFromSyncData() {
    var migrated = { total: 0, errors: [] }, empresaId = getEmpresaId();

    for (var name in ENTITIES) {
      if (name === 'nf_counter') continue;
      var entity = ENTITIES[name];
      var items = (await readSyncData(entity.lsKey)) || readLS(entity);
      if (!items || !items.length) continue;

      for (var i = 0; i < items.length; i++) {
        if (!items[i].empresa_id) items[i].empresa_id = empresaId;
        if (!items[i].id) items[i].id = genId();
        items[i].updated_at = items[i].updated_at || new Date().toISOString();
      }
      try {
        var resp = await fetch(REST + '/' + entity.table + '?on_conflict=id', {
          method: 'POST', headers: UPSERT_HEADERS, body: JSON.stringify(items)
        });
        if (resp.ok) migrated.total += items.length;
        else migrated.errors.push({ table: entity.table, status: resp.status, count: items.length });
      } catch (e) {
        migrated.errors.push({ table: entity.table, error: e.message, count: items.length });
      }
    }

    // nf_counter separately
    try {
      var counter = JSON.parse(localStorage.getItem('gdp.nf-counter.v1') || 'null');
      if (counter) {
        if (!counter.empresa_id) counter.empresa_id = empresaId;
        var ok = await sbUpsert('nf_counter', counter, 'empresa_id');
        if (ok) migrated.total++; else migrated.errors.push({ table: 'nf_counter', status: 'failed' });
      }
    } catch (_) { /* skip */ }

    console.log('[gdp-api] Migration complete:', migrated);
    return migrated;
  }

  // --- public API ---
  window.gdpApi = {
    contratos:      createEntityApi('contratos'),
    pedidos:        createEntityApi('pedidos'),
    notas_fiscais:  createEntityApi('notas_fiscais'),
    clientes:       createEntityApi('clientes'),
    contas_receber: createEntityApi('contas_receber'),
    contas_pagar:   createEntityApi('contas_pagar'),
    entregas:       createEntityApi('entregas'),
    nf_counter:     nfCounterApi,
    getEmpresaId:        getEmpresaId,
    isReady:             isReady,
    migrateFromSyncData: migrateFromSyncData,
    flushRetryQueue:     flushRetryQueue,
    _retryQueue: _retryQueue,
    _ENTITIES:   ENTITIES
  };

  console.log('[gdp-api] loaded, empresa_id:', getEmpresaId());
})();
