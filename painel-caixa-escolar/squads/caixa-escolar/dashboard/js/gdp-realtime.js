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
  var ENTITY_TABLES = ['contratos', 'pedidos', 'notas_fiscais', 'contas_receber', 'contas_pagar', 'entregas', 'extratos', 'conciliacoes', 'clientes', 'produtos', 'lancamentos_cliente', 'lancamentos_itens'];

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
    produtos:       { lsKey: 'gdp.produtos.v1',          wrapped: true  }, // 2026-06-25: alinhado à SSoT (era 'intel.central-produtos.v2')
    // EPIC-20 Story 20.9.1 — conta-corrente do cliente
    lancamentos_cliente: { lsKey: 'gdp.lancamentos-cliente.v1', wrapped: true },
    lancamentos_itens:   { lsKey: 'gdp.lancamentos-itens.v1',   wrapped: true }
  };

  // ─── GENERIC TABLES (sync_data, resultados, radar) ───
  // Story 22.2: empresa_modulos é uma config singleton (não entidade-lista) — entra aqui para
  // ser subscrita, e tem handler dedicado no router que só re-aplica a visibilidade da sidebar.
  var GENERIC_TABLES = ['sync_data', 'resultados_orcamento', 'radar_equivalencias', 'empresa_modulos'];

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
  var _renderDeferCount = 0; // frente 3: teto de adiamentos p/ não congelar o realtime se a flag travar
  function scheduleRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(function () {
      _renderTimer = null;
      // Resolução definitiva (frente 3 — anti-eco): se há uma operação de NF EM CURSO (gerar/transmitir/
      // autorizar), NÃO reidratar do localStorage agora. O reloadFromLocalSilent reidrata estados que
      // podem estar ATRASADOS em relação à edição otimista em andamento → fazia a NF "voltar no tempo"
      // (autorizada→pendente) e PISCAR entre abas, além de poder interromper a transmissão. Quando a op
      // termina (delete _nfOpsEmAndamento[...]), o próprio fluxo da NF chama renderAll com o estado final.
      // Reagenda um render leve para refletir o estado quando a op concluir.
      // QA fix-1: TETO de adiamentos. Se a flag _nfOpsEmAndamento ficar presa em memória (thread morta sem
      // reload), sem teto o realtime re-agendaria p/ sempre e NUNCA renderizaria mudanças legítimas (micro-loop
      // / congelamento). Após 5 adiamentos (~6s), renderiza assim mesmo.
      var opEmCurso = (typeof window._nfOpHasInFlight === 'function') && window._nfOpHasInFlight();
      if (opEmCurso && _renderDeferCount < 5) {
        _renderDeferCount++;
        // adia: re-tenta em 1.2s (após a janela típica de save/echo) sem reidratar agora
        _renderTimer = setTimeout(scheduleRender, 1200);
        return;
      }
      _renderDeferCount = 0; // reset: vai renderizar agora (op concluiu ou teto atingido)
      // FIX (incidente 2026-06-24 — divergência entre máquinas): reidratar as variáveis EM MEMÓRIA
      // (notasFiscais, pedidos, etc.) a partir do localStorage que o realtime acabou de atualizar,
      // ANTES de renderizar. ATENÇÃO: NÃO chamar loadData() completo aqui — ele dispara saves
      // (saveNotasEntrada/saveConciliacao/...) que realimentam o realtime → LOOP INFINITO de render
      // (regressão observada em 2026-06-24). Usar reload SEM efeitos colaterais: reloadFromLocalSilent()
      // se disponível; senão, render direto (o handler de realtime já atualiza o cache em memória).
      if (typeof window.reloadFromLocalSilent === 'function') {
        try { window.reloadFromLocalSilent(); } catch (_) {}
      }
      if (typeof window.renderAll === 'function') window.renderAll();
    }, 500);
  }

  // ALWAYS delegate to gdp-api.js (single source of truth for empresa_id)
  function getEmpresaId() {
    if (window.gdpApi && typeof window.gdpApi.getEmpresaId === 'function') return window.gdpApi.getEmpresaId();
    // Fallback only during initial load before gdp-api.js is ready
    try {
      var emp = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
      var id = emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || 'LARIUCCI';
      if (id.toUpperCase() === 'LARIUCCI') id = 'LARIUCCI';
      return id;
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

  // EPIC-19 Story 19.2: filtro de soft-delete no PONTO DE ESCRITA do cache.
  // loadConciliacao/loadExtratos já filtravam deleted_at na LEITURA, mas writeLocalItems
  // (chamado por forceReconcile e pelos eventos realtime) gravava a lista CRUA do Supabase,
  // re-incluindo itens deletados → saldo divergente entre navegadores. Filtrar aqui torna
  // leitura e escrita consistentes para TODAS as entidades.
  function stripSoftDeleted(items) {
    if (!Array.isArray(items)) return items;
    return items.filter(function (it) {
      return !(it && (it.deleted_at || it.deletedAt));
    });
  }

  function writeLocalItems(table, items) {
    var entity = TABLE_TO_ENTITY[table];
    if (!entity) return;
    items = stripSoftDeleted(items);
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

  // ─── GUARDA ANTI-REGRESSÃO DE NF (2026-06-26) ───
  // CAUSA RAIZ (provada): uma NF autoriza, vai p/ Emitidas, e REGRIDE p/ pendente minutos depois.
  // Um eco UPDATE do realtime traz uma versão ANTIGA da nota (sem chave) e sobrescreve a autorizada —
  // a guarda de timestamp falhava porque a nota local não tem updated_at na raiz (lTs vazio → '!lTs' true).
  // PRINCÍPIO: PROVA DURÁVEL > TIMESTAMP. Uma NF autorizada (chave 44 díg + protocolo) ou cancelada é
  // estado TERMINAL fiscal — a SEFAZ nunca "desautoriza". Nunca rebaixar terminal por um eco sem prova
  // igual/superior. Espelha temProvaAutorizacao (gdp-notas-fiscais.js) INLINE, pois ela não está em window.
  function _nfTemProva(rec) {
    if (!rec) return false;
    var s = rec.sefaz || {};
    var ch = String(s.chaveAcesso || rec.chaveAcesso || '').replace(/\D/g, '');
    var pr = String(s.protocolo || rec.protocolo || '');
    return ch.length === 44 && pr.length > 0;
  }
  function _nfEhTerminal(rec) {
    if (!rec) return false;
    var st = String(rec.status || '');
    var sefStatus = String((rec.sefaz && rec.sefaz.status) || '');
    return _nfTemProva(rec) || st === 'cancelada' || sefStatus === 'cancelada';
  }
  // Decide se a entrante (record) pode sobrescrever a local em notas_fiscais.
  // Bloqueia SÓ quando a local é terminal e a entrante NÃO é (eco velho sem prova).
  function _podeSobrescreverNf(localRec, entranteRec) {
    if (_nfEhTerminal(localRec) && !_nfEhTerminal(entranteRec)) return false;
    return true;
  }
  // Timestamp robusto: cai p/ audit.updatedAt quando updated_at na raiz está ausente (corrige o lTs vazio).
  function _tsRobusto(rec) {
    if (!rec) return '';
    return rec.updated_at || rec.updatedAt || (rec.audit && rec.audit.updatedAt) || '';
  }

  function handleEntityChange(table, type, record, oldRecord) {
    // Story 17.3 (defensivo): descartar eventos de realtime de OUTRO empresa_id.
    // Hoje o banco é unificado (tudo LARIUCCI), mas isto previne regressão futura:
    // sem o filtro, um INSERT/UPDATE de outra empresa seria empurrado cego para o
    // cache local (items.push), misturando caixas de tenants diferentes.
    if (typeof getEmpresaId === 'function' && record && record.empresa_id != null) {
      try {
        if (String(record.empresa_id) !== String(getEmpresaId())) return false;
      } catch (_) {}
    }
    // CAUSA-RAIZ extrato "0/0": o realtime do Supabase entrega a linha CRUA do banco (snake_case,
    // ex.: extrato_id, conciliado_em, vinculado_a). O resto da app lê camelCase (extratoId...). Sem
    // converter aqui, gravávamos snake no localStorage e a tela lia extratoId → undefined → ao conciliar
    // o item recém-tocado perdia o vínculo → atualizarExtratoStats dava total=0 → extrato "fechava 0/0".
    // Converter para camelCase com o MESMO mapper do gdpApi (list()) torna realtime e leitura consistentes.
    if (record && window.gdpApi && typeof window.gdpApi.mapFromTable === 'function') {
      try { record = window.gdpApi.mapFromTable(record); } catch (_) {}
    }
    // Dirty window protection: if local save happened in last 5s, only accept
    // INSERT and DELETE events — skip UPDATE to prevent overwriting in-flight data.
    // This prevents the race condition where Supabase sends stale data before
    // a pending save completes (e.g., NF just emitted but not yet in Supabase).
    var entity = TABLE_TO_ENTITY[table];
    var isDirty = false;
    if (entity && typeof getLastLocalSave === 'function') {
      var msSinceLocal = Date.now() - getLastLocalSave(entity.lsKey);
      isDirty = msSinceLocal < 5000;
    }

    var items = readLocalItems(table);
    var changed = false;

    if (type === 'INSERT') {
      var exists = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === record.id) { exists = true; break; }
      }
      if (!exists) { items.push(record); changed = true; }
    } else if (type === 'UPDATE') {
      // Story 20.17: ignorar o eco do próprio cliente (postgres_changes do nosso
      // próprio upsert). Sem isto, um save em voo volta como UPDATE e sobrescreve
      // a edição manual mais recente do usuário (status revertendo sozinho).
      // Só o NOSSO eco bate a assinatura; UPDATE legítimo de outro cliente passa.
      if (typeof window.gdpApiIsSelfEcho === 'function' &&
          window.gdpApiIsSelfEcho(table, record.id, record)) {
        return false;
      }
      if (isDirty) {
        // During dirty window, only update if the record already exists locally
        // and the Supabase record is newer. Otherwise skip to protect local data.
        var localIdx = -1;
        for (var k = 0; k < items.length; k++) {
          if (items[k].id === record.id) { localIdx = k; break; }
        }
        if (localIdx >= 0) {
          // GUARDA ANTI-REGRESSÃO (Camada A): NF terminal (autorizada/cancelada) nunca é rebaixada
          // por um eco sem prova igual/superior — prova durável > timestamp.
          if (table === 'notas_fiscais' && !_podeSobrescreverNf(items[localIdx], record)) {
            // eco velho/sem prova durante a dirty window → ignorar (preserva a nota boa)
          } else {
            var localTs = _tsRobusto(items[localIdx]);   // Camada B: fallback p/ audit.updatedAt
            var remoteTs = _tsRobusto(record);
            if (remoteTs && localTs && remoteTs > localTs) {
              items[localIdx] = record;
              changed = true;
            }
            // else: local is newer or same — skip overwrite
          }
        }
        // If record not found locally during dirty window, add it (new from another machine)
        if (localIdx < 0) { items.push(record); changed = true; }
      } else {
        var found = false;
        for (var j = 0; j < items.length; j++) {
          if (items[j].id === record.id) {
            // Story 20.17: condicionar a sobrescrita ao timestamp (não wholesale cego).
            // Protege contra eco atrasado (>5s, fora da dirty window) de um save antigo
            // do mesmo registro, que revertia o status.
            // Bug-fix regressão: usar '>' ESTRITO (era '>='). Um eco do PRÓPRIO save
            // tem updated_at IGUAL ao local; com '>=' o empate sobrescrevia o estado
            // recém-editado (faturado→aberto, NF verde→amarelo). Só sobrescreve quando
            // o remoto é estritamente mais novo — um UPDATE real de outro cliente.
            // GUARDA ANTI-REGRESSÃO (Camada A): NF terminal (autorizada/cancelada) NUNCA é rebaixada
            // por um eco sem prova igual/superior. Este é o caminho do "minutos depois" (fora da dirty
            // window) onde a regressão acontecia. Prova durável > timestamp.
            if (table === 'notas_fiscais' && !_podeSobrescreverNf(items[j], record)) {
              // eco velho/sem prova → IGNORAR. A nota autorizada permanece. (não seta changed)
            } else {
              var rTs = _tsRobusto(record);              // Camada B: fallback p/ audit.updatedAt
              var lTs = _tsRobusto(items[j]);
              if (!lTs || !rTs || rTs > lTs) {
                items[j] = record;
                changed = true;
              }
            }
            found = true;
            break;
          }
        }
        if (!found) { items.push(record); changed = true; }
      }
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
    'gdp.extratos.v1': true, 'gdp.conciliacao.v1': true,
    'gdp.lancamentos-cliente.v1': true, 'gdp.lancamentos-itens.v1': true
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
      // Bug-fix regressão (mesmo padrão das entidades): suprimir o eco do próprio save
      // e só sobrescrever quando o remoto for ESTRITAMENTE mais novo. Antes a sobrescrita
      // era cega (items[j] = record), então um orçamento editado voltava sozinho.
      if (typeof window.gdpApiIsSelfEcho === 'function' &&
          window.gdpApiIsSelfEcho('resultados_orcamento', record.id, record)) {
        return false;
      }
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === record.id) {
          var rTs = record.updated_at || record.updatedAt || '';
          var lTs = items[j].updated_at || items[j].updatedAt || '';
          if (!lTs || !rTs || rTs > lTs) { items[j] = record; changed = true; }
          break;
        }
      }
      if (!changed) {
        var jaExiste = items.some(function (it) { return it.id === record.id; });
        if (!jaExiste) { items.push(record); changed = true; }
      }
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
    // Story 17.8: eventos DELETE entregam old_record SOMENTE com a primary key
    // (sem empresa_id), mesmo com REPLICA IDENTITY FULL — limitação do Supabase Realtime.
    // O filtro server-side da subscription (subscribeToTables: 'empresa_id=eq.'+empresaId)
    // JÁ garante que só chegam eventos do tenant correto. Portanto, no DELETE só barramos
    // quando o empresa_id vier PREENCHIDO e divergente (defesa cross-tenant); se vier
    // ausente (PK-only), confiamos no filtro do servidor e processamos a remoção.
    if (type === 'DELETE') {
      var col = (table === 'sync_data') ? 'user_id' : 'empresa_id';
      var tenant = (relevantRecord && relevantRecord[col] != null) ? relevantRecord[col] : null;
      if (tenant != null && String(tenant) !== String(getEmpresaId())) return;
    } else if (!isOurRecord(relevantRecord, table)) {
      return;
    }

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
    } else if (table === 'empresa_modulos') {
      // Story 22.2: config de módulos mudou em outra máquina/usuário da empresa.
      // Re-hidrata do Supabase (atualiza cache local) e re-aplica a sidebar (FR-22.2.4).
      // Não entra no scheduleRender de listas — é uma mudança de visibilidade de UI.
      try {
        if (typeof window.hidratarAcessoModulosOnline === 'function') {
          window.hidratarAcessoModulosOnline();
        } else if (typeof window.aplicarAcessoSidebar === 'function') {
          window.aplicarAcessoSidebar();
        }
      } catch (_) {}
      log(type + ' on empresa_modulos → sidebar re-aplicada');
      return; // tratado; não cai no fluxo de render de listas
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

  // ─── RECONCILIATION: full reload from Supabase to catch missed events ───
  var _lastVisibleTs = Date.now();
  var _reconcileInProgress = false;
  var _lastReconcileTs = 0;
  var RECONCILE_COOLDOWN = 10000; // min 10s between reconciliations

  function forceReconcile() {
    if (_reconcileInProgress) return;
    if (Date.now() - _lastReconcileTs < RECONCILE_COOLDOWN) return;
    if (!window.gdpApi) return;
    _reconcileInProgress = true;
    _lastReconcileTs = Date.now();
    log('Reconcile: fetching all tables from Supabase...');

    var tables = ['contratos', 'pedidos', 'notas_fiscais', 'clientes', 'contas_receber', 'contas_pagar', 'entregas', 'extratos', 'conciliacoes', 'produtos', 'lancamentos_cliente', 'lancamentos_itens'];
    var promises = tables.map(function (t) {
      if (!window.gdpApi[t] || !window.gdpApi[t].list) return Promise.resolve();
      // Skip tables with recent local saves (dirty window) to prevent overwriting in-flight data
      var entity = TABLE_TO_ENTITY[t];
      if (entity && typeof getLastLocalSave === 'function') {
        var msSince = Date.now() - getLastLocalSave(entity.lsKey);
        if (msSince < 5000) {
          log('Reconcile: SKIP ' + t + ' — local save ' + msSince + 'ms ago');
          return Promise.resolve();
        }
      }
      return window.gdpApi[t].list().then(function (rows) {
        if (rows && rows.length > 0) {
          writeLocalItems(t, rows);
        }
      }).catch(function () {});
    });

    Promise.all(promises).then(function () {
      _reconcileInProgress = false;
      scheduleRender();
      log('Reconcile complete');
    }).catch(function () {
      _reconcileInProgress = false;
    });
  }

  // ─── RECONNECT WITH NEW EMPRESA_ID ───
  function reconnectWithNewId() {
    log('empresa_id changed — reconnecting WebSocket with new filters');
    disconnect();
    setTimeout(function () {
      connect();
      // After reconnect, reconcile to load data for new empresa_id
      setTimeout(forceReconcile, 2000);
    }, 500);
  }

  window.addEventListener('online', function () {
    if (!ws || ws.readyState !== WebSocket.OPEN) connect();
  });
  window.addEventListener('offline', function () { disconnect(); });

  // ─── VISIBILITY CHANGE: reconnect + reconcile after background ───
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      var elapsed = Date.now() - _lastVisibleTs;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // WebSocket died in background — reconnect
        connect();
      }
      // If tab was hidden for >30s, reconcile to catch missed events
      if (elapsed > 30000) {
        log('Tab was hidden for ' + Math.round(elapsed / 1000) + 's — reconciling');
        setTimeout(forceReconcile, 1000);
      }
    } else {
      _lastVisibleTs = Date.now();
    }
  });

  // Public API
  window._gdpRealtime = {
    connect: connect,
    disconnect: disconnect,
    reconnectWithNewId: reconnectWithNewId,
    forceReconcile: forceReconcile,
    getStatus: function () { return _status; },
    isConnected: function () { return _status === 'connected'; },
    getChangeCount: function () { return _changeCount; }
  };

  // ─── FORCE SYNC BUTTON HANDLER (debounced 10s) ───
  var _lastForceSyncTs = 0;
  window._gdpForceSync = function () {
    var now = Date.now();
    if (now - _lastForceSyncTs < 10000) {
      log('Force sync debounced — wait ' + Math.ceil((10000 - (now - _lastForceSyncTs)) / 1000) + 's');
      return;
    }
    _lastForceSyncTs = now;
    var btn = document.getElementById('btn-force-sync');
    if (btn) { btn.disabled = true; btn.textContent = '↻ ...'; }
    // Reconnect WebSocket if not connected
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      disconnect();
      connect();
    }
    // Force full reconciliation
    _reconcileInProgress = false; // reset to allow immediate reconcile
    _lastReconcileTs = 0;
    forceReconcile();
    setTimeout(function () {
      if (btn) { btn.disabled = false; btn.textContent = '↻ Sync'; }
    }, 10000);
  };

  // Auto-connect
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
