/**
 * gdp-realtime.js — Supabase Realtime sync via WebSocket (Story 14.3)
 * Subscribes to ALL business tables + sync_data for full cross-browser sync.
 * Covers: GDP entities, sync_data (radar, intel, estoque, preços), resultados, equivalencias.
 * Requires: supabase-config.js loaded first.
 */
(function () {
  'use strict';

  var SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.URL) || window.SUPABASE_URL || '';
  var SUPABASE_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.KEY) || window.SUPABASE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  var wsUrl = SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(SUPABASE_KEY) + '&vsn=1.0.0';

  // ─── DEDICATED TABLES (gdp-api.js entities) ───
  var ENTITY_TABLES = ['contratos', 'pedidos', 'notas_fiscais', 'contas_receber', 'contas_pagar', 'entregas', 'extratos', 'conciliacoes', 'clientes', 'produtos'];

  var TABLE_TO_ENTITY = {
    contratos:      { lsKey: 'gdp.contratos.v1',         wrapped: true  },
    pedidos:        { lsKey: 'gdp.pedidos.v1',            wrapped: true  },
    notas_fiscais:  { lsKey: 'gdp.notas-fiscais.v1',     wrapped: true  },
    contas_receber: { lsKey: 'gdp.contas-receber.v1',    wrapped: true  },
    contas_pagar:   { lsKey: 'gdp.contas-pagar.v1',      wrapped: true  },
    entregas:       { lsKey: 'gdp.entregas.provas.v1',   wrapped: false },
    extratos:       { lsKey: 'gdp.extratos.v1',          wrapped: true  },
    conciliacoes:   { lsKey: 'gdp.conciliacao.v1',       wrapped: true  },
    clientes:       { lsKey: 'gdp.usuarios.v1',          wrapped: false },
    produtos:       { lsKey: 'intel.central-produtos.v2', wrapped: true  }
  };

  // ─── GENERIC TABLES (sync_data, resultados, radar) ───
  var GENERIC_TABLES = ['sync_data', 'resultados_orcamento', 'radar_equivalencias'];

  // All tables to subscribe
  var ALL_TABLES = ENTITY_TABLES.concat(GENERIC_TABLES);

  var ws = null;
  var heartbeatTimer = null;
  var ref = 0;
  var _status = 'disconnected';
  var _reconnectTimer = null;
  var _reconnectDelay = 1000;
  var _changeCount = 0;

  // Debounce renderAll (batch events within 500ms)
  var _renderTimer = null;
  function scheduleRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(function () {
      _renderTimer = null;
      if (typeof window.renderAll === 'function') window.renderAll();
    }, 500);
  }

  function getEmpresaId() {
    if (window.gdpApi && typeof window.gdpApi.getEmpresaId === 'function') return window.gdpApi.getEmpresaId();
    try {
      var emp = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
      return emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || 'LARIUCCI';
    } catch (_) { return 'LARIUCCI'; }
  }

  // sync_data uses user_id, other tables use empresa_id
  function getFilterForTable(table) {
    var id = getEmpresaId();
    if (table === 'sync_data') return 'user_id=eq.' + id;
    return 'empresa_id=eq.' + id;
  }

  function getFilterColumnForTable(table) {
    return table === 'sync_data' ? 'user_id' : 'empresa_id';
  }

  function nextRef() { return String(++ref); }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function log(msg) {
    if (typeof gdpLog === 'function') gdpLog('[Realtime] ' + msg);
    else console.log('[Realtime] ' + msg);
  }

  function updateIndicator(status) {
    _status = status;
    var el = document.getElementById('realtime-status-indicator');
    if (el) {
      var map = { connected: '🟢', connecting: '🟡', disconnected: '🔴' };
      el.textContent = map[status] || '⚪';
      el.title = status === 'connected' ? 'Realtime conectado' : status === 'connecting' ? 'Conectando...' : 'Realtime desconectado';
    }
    var syncEl = document.getElementById('sync-status-indicator');
    if (syncEl && status === 'connected') {
      syncEl.textContent = '🟢';
      syncEl.title = 'Sincronizado (realtime)';
    }
  }

  // ─── ENTITY TABLE HANDLERS (dedicated tables) ───

  function readLocalItems(table) {
    var entity = TABLE_TO_ENTITY[table];
    if (!entity) return [];
    try {
      var raw = JSON.parse(localStorage.getItem(entity.lsKey) || 'null');
      if (!raw) return [];
      if (entity.wrapped && raw.items) return raw.items;
      if (Array.isArray(raw)) return raw;
      return [];
    } catch (_) { return []; }
  }

  function writeLocalItems(table, items) {
    var entity = TABLE_TO_ENTITY[table];
    if (!entity) return;
    try {
      var value = entity.wrapped
        ? { _v: 1, updatedAt: new Date().toISOString(), items: items }
        : items;
      localStorage.setItem(entity.lsKey, JSON.stringify(value));
    } catch (_) {}
    if (window.gdpApi && window.gdpApi._memCache) {
      window.gdpApi._memCache[entity.lsKey] = items;
    }
  }

  function isOurRecord(record, table) {
    if (!record) return false;
    if (table === 'sync_data') return record.user_id === getEmpresaId();
    return record.empresa_id === getEmpresaId();
  }

  function handleEntityChange(table, type, record, oldRecord) {
    var items = readLocalItems(table);
    var changed = false;

    if (type === 'INSERT') {
      var exists = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === record.id) { exists = true; break; }
      }
      if (!exists) { items.push(record); changed = true; }
    } else if (type === 'UPDATE') {
      var found = false;
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === record.id) {
          items[j] = record;
          changed = true;
          found = true;
          break;
        }
      }
      if (!found) { items.push(record); changed = true; }
    } else if (type === 'DELETE') {
      var delId = (oldRecord && oldRecord.id) || (record && record.id);
      if (delId) {
        var before = items.length;
        items = items.filter(function (it) { return it.id !== delId; });
        changed = items.length !== before;
      }
    }

    if (changed) {
      writeLocalItems(table, items);
    }
    return changed;
  }

  // ─── SYNC_DATA HANDLER (generic KV store — radar, intel, estoque, etc.) ───

  // Keys managed by dedicated Supabase tables — NEVER overwrite from sync_data
  var DEDICATED_TABLE_KEYS = {
    'gdp.contratos.v1': true, 'gdp.pedidos.v1': true, 'gdp.notas-fiscais.v1': true,
    'gdp.contas-receber.v1': true, 'gdp.contas-pagar.v1': true,
    'gdp.entregas.provas.v1': true, 'gdp.usuarios.v1': true,
    'gdp.extratos.v1': true, 'gdp.conciliacao.v1': true
  };

  function handleSyncDataChange(type, record) {
    if (!record || !record.key || !record.data) return false;

    // SKIP keys that have dedicated Supabase tables — those are managed by
    // gdp-api.js and the entity table handlers above. Writing sync_data
    // over them causes destructive loops (data flickering/disappearing).
    if (DEDICATED_TABLE_KEYS[record.key]) {
      return false;
    }

    // Write the synced data directly to localStorage under its key
    try {
      localStorage.setItem(record.key, JSON.stringify(record.data));
    } catch (_) { return false; }

    log('sync_data ' + type + ': ' + record.key);
    return true;
  }

  // ─── RESULTADOS_ORCAMENTO HANDLER ───

  function handleResultadosChange(type, record, oldRecord) {
    // Update the localStorage cache for resultados
    var lsKey = 'caixaescolar.resultados.v1';
    var items = [];
    try {
      var raw = JSON.parse(localStorage.getItem(lsKey) || 'null');
      if (raw && raw.items) items = raw.items;
      else if (Array.isArray(raw)) items = raw;
    } catch (_) {}

    var changed = false;
    if (type === 'INSERT' && record) {
      var exists = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === record.id || items[i].orcamento_id === record.orcamento_id) { exists = true; break; }
      }
      if (!exists) { items.push(record); changed = true; }
    } else if (type === 'UPDATE' && record) {
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === record.id) { items[j] = record; changed = true; break; }
      }
      if (!changed) { items.push(record); changed = true; }
    } else if (type === 'DELETE') {
      var delId = (oldRecord && oldRecord.id) || (record && record.id);
      if (delId) {
        var before = items.length;
        items = items.filter(function (it) { return it.id !== delId; });
        changed = items.length !== before;
      }
    }

    if (changed) {
      try {
        localStorage.setItem(lsKey, JSON.stringify({ _v: 1, updatedAt: new Date().toISOString(), items: items }));
      } catch (_) {}
    }
    return changed;
  }

  // ─── CENTRAL CHANGE ROUTER ───

  function handleChange(table, type, record, oldRecord) {
    var relevantRecord = record || oldRecord;
    if (!isOurRecord(relevantRecord, table)) return;

    var changed = false;

    if (TABLE_TO_ENTITY[table]) {
      changed = handleEntityChange(table, type, record, oldRecord);
    } else if (table === 'sync_data') {
      changed = handleSyncDataChange(type, record);
    } else if (table === 'resultados_orcamento') {
      changed = handleResultadosChange(type, record, oldRecord);
    } else if (table === 'radar_equivalencias') {
      // Radar equivalencias are loaded on-demand, just trigger re-render
      changed = true;
    }

    if (changed) {
      _changeCount++;
      scheduleRender();
      var idStr = '';
      try { idStr = (record || oldRecord).id; idStr = idStr.substring(0, 8); } catch (_) { idStr = '?'; }
      log(type + ' on ' + table + ' (' + idStr + '...)');
    }
  }

  // ─── WEBSOCKET MESSAGE PARSER ───

  function handleMessage(data) {
    var msg;
    try { msg = JSON.parse(data); } catch (_) { return; }

    if (msg.topic === 'phoenix') return;

    if (msg.event === 'phx_reply') {
      if (msg.payload && msg.payload.status === 'ok') _reconnectDelay = 1000;
      return;
    }

    if (msg.event === 'system' || msg.event === 'phx_error' || msg.event === 'phx_close') return;

    // Postgres changes event (Supabase Realtime v2 format)
    if (msg.event === 'postgres_changes') {
      var payload = msg.payload;
      if (!payload || !payload.data) return;
      handleChange(payload.data.table, payload.data.type, payload.data.record, payload.data.old_record);
      return;
    }

    // Individual change type events (alternative Supabase format)
    if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
      var p = msg.payload;
      if (!p) return;
      var parts = (msg.topic || '').split(':');
      var tableName = parts.length >= 3 ? parts[2] : '';
      if (tableName) {
        handleChange(tableName, msg.event, p.record, p.old_record);
      }
      return;
    }
  }

  // ─── CONNECTION MANAGEMENT ───

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(function () {
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
    }, 30000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function subscribeToTables() {
    var empresaId = getEmpresaId();
    for (var i = 0; i < ALL_TABLES.length; i++) {
      var table = ALL_TABLES[i];
      var filterCol = getFilterColumnForTable(table);
      var filter = filterCol + '=eq.' + empresaId;
      var topic = 'realtime:public:' + table + ':' + filter;
      send({
        topic: topic,
        event: 'phx_join',
        payload: {
          config: {
            postgres_changes: [{
              event: '*',
              schema: 'public',
              table: table,
              filter: filter
            }]
          }
        },
        ref: nextRef()
      });
    }
    log('Subscribed to ' + ALL_TABLES.length + ' tables for empresa ' + empresaId);
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (!navigator.onLine) { updateIndicator('disconnected'); return; }
    updateIndicator('connecting');

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      log('WebSocket failed: ' + e.message);
      updateIndicator('disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      updateIndicator('connected');
      startHeartbeat();
      subscribeToTables();
      log('Connected');
    };

    ws.onmessage = function (event) {
      handleMessage(event.data);
    };

    ws.onclose = function (event) {
      updateIndicator('disconnected');
      stopHeartbeat();
      log('Disconnected (code: ' + event.code + ')');
      scheduleReconnect();
    };

    ws.onerror = function () {
      updateIndicator('disconnected');
      try { ws.close(); } catch (_) {}
    };
  }

  function disconnect() {
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    stopHeartbeat();
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    updateIndicator('disconnected');
  }

  function scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = setTimeout(function () {
      _reconnectTimer = null;
      if (navigator.onLine) connect();
    }, _reconnectDelay);
    _reconnectDelay = Math.min(_reconnectDelay * 2, 30000);
  }

  window.addEventListener('online', function () {
    if (!ws || ws.readyState !== WebSocket.OPEN) connect();
  });
  window.addEventListener('offline', function () { disconnect(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (!ws || ws.readyState !== WebSocket.OPEN) connect();
    }
  });

  // Public API
  window._gdpRealtime = {
    connect: connect,
    disconnect: disconnect,
    getStatus: function () { return _status; },
    isConnected: function () { return _status === 'connected'; },
    getChangeCount: function () { return _changeCount; }
  };

  // Auto-connect
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
