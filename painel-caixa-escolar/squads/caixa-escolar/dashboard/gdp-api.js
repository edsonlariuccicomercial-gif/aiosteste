/**
 * gdp-api.js — Supabase-first data access layer for GDP (Story 7.22)
 * Architecture: Supabase is source-of-truth; localStorage is offline cache.
 * Write path: Supabase → localStorage (mirror)
 * Read path: Supabase → localStorage fallback
 */
(function () {
  'use strict';

  var SUPABASE_URL = window.SUPABASE_URL || 'https://mvvsjaudhbglxttxaeop.supabase.co';
  var SUPABASE_KEY = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dnNqYXVkaGJnbHh0dHhhZW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY3OTAsImV4cCI6MjA5MDM4Mjc5MH0.jadqvmRvbZjtjATaF_4WWB6A44NF06whtEIyNNyCUGo';
  var REST = SUPABASE_URL + '/rest/v1';
  var HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  var UPSERT_HEADERS = Object.assign({}, HEADERS, { Prefer: 'return=minimal,resolution=merge-duplicates' });

  // Data source tracking (Story 7.22)
  var _dataSource = 'initializing'; // 'cloud' | 'cache' | 'offline'

  // ── Echo suppression (Story 20.17) ──────────────────────────────────────────
  // Registra os upserts que ESTE cliente acabou de fazer. Quando o Supabase
  // devolve o mesmo registro via postgres_changes (eco), gdp-realtime.js consulta
  // gdpApiIsSelfEcho() para NÃO sobrescrever a edição local com o próprio eco.
  // A assinatura usa updated_at (único por upsert) + status — só o nosso eco bate;
  // um UPDATE legítimo de outro cliente terá updated_at diferente e NÃO é suprimido.
  var _selfEchoes = {}; // 'table:id' -> { sig, ts }
  function _echoSignature(row) {
    if (!row) return '';
    return String(row.updated_at || row.updatedAt || '') + '|' + String(row.status == null ? '' : row.status);
  }
  function _markSelfEcho(table, id, row) {
    if (!table || id == null) return;
    _selfEchoes[table + ':' + id] = { sig: _echoSignature(row), ts: Date.now() };
  }
  window.gdpApiIsSelfEcho = function (table, id, record) {
    var k = table + ':' + id;
    var e = _selfEchoes[k];
    if (!e) return false;
    if (Date.now() - e.ts > 8000) { delete _selfEchoes[k]; return false; } // TTL 8s
    return e.sig === _echoSignature(record);
  };

  var ENTITIES = {
    contratos:      { lsKey: 'gdp.contratos.v1',      table: 'contratos',      wrapped: true  },
    pedidos:        { lsKey: 'gdp.pedidos.v1',         table: 'pedidos',        wrapped: true  },
    notas_fiscais:  { lsKey: 'gdp.notas-fiscais.v1',  table: 'notas_fiscais',  wrapped: true  },
    clientes:       { lsKey: 'gdp.usuarios.v1',        table: 'clientes',       wrapped: false },
    contas_receber: { lsKey: 'gdp.contas-receber.v1',  table: 'contas_receber', wrapped: true  },
    contas_pagar:   { lsKey: 'gdp.contas-pagar.v1',    table: 'contas_pagar',   wrapped: true  },
    entregas:       { lsKey: 'gdp.entregas.provas.v1', table: 'entregas',       wrapped: false },
    nf_counter:     { lsKey: 'gdp.nf-counter.v1',      table: 'nf_counter',     wrapped: false },
    extratos:       { lsKey: 'gdp.extratos.v1',         table: 'extratos',       wrapped: true  },
    conciliacoes:   { lsKey: 'gdp.conciliacao.v1',      table: 'conciliacoes',   wrapped: true  },
    produtos:       { lsKey: 'intel.central-produtos.v2', table: 'produtos',     wrapped: true  },
    // EPIC-20 Story 20.9.1 — Conta-Corrente do Cliente (crédito/débito rotativo)
    lancamentos_cliente: { lsKey: 'gdp.lancamentos-cliente.v1', table: 'lancamentos_cliente', wrapped: true },
    lancamentos_itens:   { lsKey: 'gdp.lancamentos-itens.v1',   table: 'lancamentos_itens',   wrapped: true }
  };

  // Story 14.1: empresa_id must match syncUserId set at login (from escola.id or "LARIUCCI")
  // This is the SINGLE SOURCE OF TRUTH for empresa_id resolution.
  // All other modules (gdp-realtime.js, app-sync.js) MUST delegate here.
  var _cachedEmpresaId = null;
  function getEmpresaId() {
    try {
      var emp = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
      var id = emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || 'LARIUCCI';
      // Normalize case: "Lariucci" → "LARIUCCI" to prevent sync split
      if (id.toUpperCase() === 'LARIUCCI') id = 'LARIUCCI';
      if (id === 'LARIUCCI' && !emp.syncUserId) console.warn('[Sync] empresa_id usando fallback LARIUCCI — verifique nexedu.empresa.syncUserId');
      // Persist syncUserId if resolved from fallback (prevents divergence across machines)
      if (!emp.syncUserId && id !== 'LARIUCCI') {
        emp.syncUserId = id;
        localStorage.setItem('nexedu.empresa', JSON.stringify(emp));
      }
      // Detect empresa_id change (login switch, different localStorage state)
      if (_cachedEmpresaId && _cachedEmpresaId !== id) {
        console.warn('[Sync] empresa_id CHANGED: ' + _cachedEmpresaId + ' → ' + id + ' — WebSocket reconnect needed');
        _cachedEmpresaId = id;
        // Notify realtime module to reconnect with new filter
        if (window._gdpRealtime && window._gdpRealtime.reconnectWithNewId) {
          window._gdpRealtime.reconnectWithNewId();
        }
      }
      _cachedEmpresaId = id;
      return id;
    } catch (_) { return 'LARIUCCI'; }
  }

  function genId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Story 4.82: in-memory cache for incognito/private browsing fallback
  var _memCache = {};

  function readLS(entity) {
    try {
      var raw = JSON.parse(localStorage.getItem(entity.lsKey) || 'null');
      if (raw == null) return _memCache[entity.lsKey] || null;
      if (entity.wrapped && raw.items) return raw.items;
      if (Array.isArray(raw)) return raw;
      return _memCache[entity.lsKey] || null;
    } catch (_) { return _memCache[entity.lsKey] || null; }
  }

  function writeLS(entity, items) {
    // Story 4.82: always keep in-memory cache (works even when localStorage fails)
    _memCache[entity.lsKey] = items;
    try {
      var value = entity.wrapped ? { _v: 1, updatedAt: new Date().toISOString(), items: items } : items;
      localStorage.setItem(entity.lsKey, JSON.stringify(value));
    } catch (_) { /* Safari private mode / quota exceeded — in-memory cache still available */ }
  }

  // Map localStorage camelCase items to Supabase snake_case columns
  var TABLE_COLS = {
    contratos: ['id','empresa_id','escola','processo','edital','objeto','status','fornecedor','vigencia','observacoes','data_apuracao','itens','cliente_snapshot','escola_cliente_id','dados_extras','deleted_at','created_at','updated_at'],
    pedidos: ['id','empresa_id','contrato_id','escola','data','data_prevista','status','valor','obs','itens','fiscal','cliente','pagamento','marcador','audit','dados_extras','created_at','updated_at'],
    notas_fiscais: ['id','empresa_id','pedido_id','contrato_id','numero','serie','valor','status','tipo_nota','origem','emitida_em','vencimento','cliente','itens','sefaz','cobranca','documentos','parametros','integracoes','xml_autorizado','chave_acesso','protocolo','audit','deleted_at','created_at','updated_at'],
    clientes: ['id','empresa_id','nome','cnpj','ie','uf','cep','sre','email','telefone','endereco','contratos_vinculados','login','senha','municipio','responsavel','cargo','contribuinte_icms','categoria_catalogo','arp_vinculada','saldo_total','saldo_disponivel','conta_corrente_ativa','dados_extras','created_at','updated_at'],
    contas_receber: ['id','empresa_id','pedido_id','origem_id','descricao','valor','status','forma','categoria','vencimento','cliente','cobranca','automacao','audit','deleted_at','created_at','updated_at'],
    contas_pagar: ['id','empresa_id','descricao','valor','status','forma','categoria','vencimento','fornecedor','audit','pagamentos','valor_pago','deleted_at','created_at','updated_at'],
    entregas: ['id','empresa_id','pedido_id','escola','data_entrega','status_entrega','recebedor','obs','foto','assinatura','created_at','updated_at'],
    extratos: ['id','empresa_id','data','arquivo','conta_financeira','conciliados','total','is_open','criado_em','deleted_at','created_at','updated_at'],
    conciliacoes: ['id','empresa_id','extrato_id','data','descricao','valor','tipo','conciliado','conciliado_em','vinculado_a','historico','categoria_dre','metadata','deleted_at','created_at','updated_at'],
    caixa_config: ['empresa_id','saldo_inicial','saldo_inicial_data','metadata','created_at','updated_at'],
    produtos: ['id','empresa_id','descricao','sku','ncm','unidade','marca','grupo','produto_critico','unidade_base','embalagens','custo_base','preco_referencia','margem_alvo','fonte','created_at','updated_at'],
    lancamentos_cliente: ['id','empresa_id','cliente_id','data','tipo','valor','descricao','origem','deleted_at','created_at','updated_at'],
    lancamentos_itens: ['id','empresa_id','lancamento_id','produto','quantidade','unidade','valor_unitario','subtotal','created_at','updated_at']
  };
  var CAMEL_TO_SNAKE = {
    escolaClienteId:'escola_cliente_id', contratoId:'contrato_id', pedidoId:'pedido_id', origemId:'origem_id',
    tipoNota:'tipo_nota', emitidaEm:'emitida_em', clienteSnapshot:'cliente_snapshot',
    dataPrevista:'data_prevista', dataApuracao:'data_apuracao', dataEntrega:'data_entrega', statusEntrega:'status_entrega',
    xmlAutorizado:'xml_autorizado', chaveAcesso:'chave_acesso',
    contaFinanceira:'conta_financeira', isOpen:'is_open', criadoEm:'criado_em',
    extratoId:'extrato_id', conciliadoEm:'conciliado_em', vinculadoA:'vinculado_a', categoriaDre:'categoria_dre', deletedAt:'deleted_at',
    saldoInicial:'saldo_inicial', saldoInicialData:'saldo_inicial_data',
    nomeFantasia:'nome_fantasia', razaoSocial:'razao_social',
    categoriaCatalogo:'categoria_catalogo', arpVinculada:'arp_vinculada',
    saldoTotal:'saldo_total', saldoDisponivel:'saldo_disponivel', contribuinteIcms:'contribuinte_icms',
    // EPIC-20 Story 20.9.1 — conta-corrente
    clienteId:'cliente_id', lancamentoId:'lancamento_id', valorUnitario:'valor_unitario', contaCorrenteAtiva:'conta_corrente_ativa'
  };
  var SNAKE_TO_CAMEL = {};
  for (var _k in CAMEL_TO_SNAKE) SNAKE_TO_CAMEL[CAMEL_TO_SNAKE[_k]] = _k;

  function mapToTable(table, item) {
    var cols = TABLE_COLS[table];
    if (!cols) return item; // unknown table, pass through
    var row = {};
    for (var key in item) {
      var mapped = CAMEL_TO_SNAKE[key] || key;
      if (cols.indexOf(mapped) >= 0) row[mapped] = item[key];
    }
    return row;
  }

  function mapFromTable(item) {
    if (!item) return item;
    var obj = {};
    for (var key in item) {
      obj[SNAKE_TO_CAMEL[key] || key] = item[key];
    }
    return obj;
  }

  // Story 14.3: 10s timeout to prevent hanging when Supabase is slow/offline
  async function sbFetch(path) {
    try {
      var controller = new AbortController();
      var timer = setTimeout(function() { controller.abort(); }, 10000);
      var resp = await fetch(REST + path, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (_) { return null; }
  }

  async function sbUpsert(table, row, conflict) {
    try {
      var controller = new AbortController();
      var timer = setTimeout(function() { controller.abort(); }, 10000);
      var resp = await fetch(REST + '/' + table + '?on_conflict=' + conflict, {
        method: 'POST', headers: UPSERT_HEADERS, body: JSON.stringify(row), signal: controller.signal
      });
      clearTimeout(timer);
      return resp.ok;
    } catch (_) { return false; }
  }

  async function sbDelete(table, id) {
    try {
      var controller = new AbortController();
      var timer = setTimeout(function() { controller.abort(); }, 10000);
      var resp = await fetch(REST + '/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
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

  // --- Story 4.51 AC-A4: track deleted IDs to prevent sync restoration ---
  var _DELETE_KEYS = {
    contratos: 'gdp.contratos.deleted.v1',
    pedidos: 'gdp.pedidos.deleted.v1',
    notas_fiscais: 'gdp.notas-fiscais.deleted.v1',
    contas_receber: 'gdp.contas-receber.deleted.v1',
    contas_pagar: 'gdp.contas-pagar.deleted.v1',
    entregas: 'gdp.entregas.deleted.v1',
    conciliacao: 'gdp.conciliacao.deleted.v1'
  };

  function _trackDeletedId(entityName, id) {
    var key = _DELETE_KEYS[entityName];
    if (!key) return;
    try {
      var deleted = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(deleted)) deleted = [];
      if (deleted.indexOf(id) < 0) deleted.push(id);
      localStorage.setItem(key, JSON.stringify(deleted));
    } catch (_) {}
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

  setInterval(function () { if (navigator.onLine && _retryQueue.length) flushRetryQueue(); }, 120000);

  // --- entity CRUD factory ---
  function createEntityApi(name) {
    var entity = ENTITIES[name];
    var table = entity.table;

    return {
      list: async function () {
        var rows = await sbFetch('/' + table + '?empresa_id=eq.' + encodeURIComponent(getEmpresaId()) + '&limit=1000');
        if (rows != null && Array.isArray(rows)) {
          rows = rows.map(mapFromTable);
          // EPIC-19 Story 19.2: filter out soft-deleted rows (deleted_at preenchido).
          // Consistente com loadConciliacao/loadExtratos e com writeLocalItems (gdp-realtime.js).
          rows = rows.filter(function (r) { return !(r && (r.deleted_at || r.deletedAt)); });
          // Story 4.51 AC-A4: filter out locally-deleted items
          var delKey = _DELETE_KEYS[name];
          if (delKey) {
            try {
              var deletedIds = JSON.parse(localStorage.getItem(delKey) || '[]');
              if (deletedIds.length > 0) {
                var delSet = {};
                for (var d = 0; d < deletedIds.length; d++) delSet[deletedIds[d]] = true;
                rows = rows.filter(function (r) { return !delSet[r.id]; });
              }
            } catch (_) {}
          }
          // SAFETY: never overwrite local cache with empty when local has data
          var localCount = (readLS(entity) || []).length;
          if (rows.length === 0 && localCount > 0) {
            _dataSource = 'cache';
            return readLS(entity);
          }
          _dataSource = 'cloud'; writeLS(entity, rows); return rows;
        }
        // Supabase failed/timeout — use localStorage cache, NEVER return empty
        var ls = readLS(entity);
        if (ls != null) { _dataSource = 'cache'; return ls; }
        _dataSource = 'offline';
        return [];
      },

      get: async function (id) {
        var rows = await sbFetch('/' + table + '?id=eq.' + encodeURIComponent(id) + '&limit=1');
        if (rows && rows.length) return mapFromTable(rows[0]);
        var ls = readLS(entity);
        if (ls) for (var i = 0; i < ls.length; i++) { if (ls[i].id === id) return ls[i]; }
        return null;
      },

      save: async function (item) {
        if (!item.id) item.id = genId();
        if (!item.empresa_id) item.empresa_id = getEmpresaId();
        item.updated_at = new Date().toISOString();
        var row = mapToTable(table, item);
        _markSelfEcho(table, item.id, row); // Story 20.17: registrar p/ echo suppression
        var ok = await sbUpsert(table, row, 'id');
        if (!ok) enqueueRetry(table, row, 'id');
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
        var mapped = items.map(function (it) {
          var row = mapToTable(table, it);
          if (!row.id) row.id = genId();
          if (!row.empresa_id) row.empresa_id = eid;
          row.updated_at = now;
          return row;
        });
        try {
          var resp = await fetch(REST + '/' + table + '?on_conflict=id', {
            method: 'POST', headers: UPSERT_HEADERS, body: JSON.stringify(mapped)
          });
          if (!resp.ok) {
            var err = ''; try { err = await resp.text(); } catch(_){}
            gdpWarn('[gdpApi] saveAll failed ' + table + ':', resp.status, err);
            mapped.forEach(function (it) { enqueueRetry(table, it, 'id'); });
          }
        } catch (e) {
          gdpWarn('[gdpApi] saveAll error ' + table + ':', e);
          mapped.forEach(function (it) { enqueueRetry(table, it, 'id'); });
        }
        writeLS(entity, items);
        return items;
      },

      remove: async function (id) {
        // Story 4.51 AC-A4: track deleted ID to prevent sync from restoring it
        _trackDeletedId(name, id);
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
      var rows = await sbFetch('/nf_counter?empresa_id=eq.' + encodeURIComponent(getEmpresaId()) + '&limit=100');
      if (rows != null) return rows;
      try { return JSON.parse(localStorage.getItem('gdp.nf-counter.v1') || '[]'); } catch (_) { return []; }
    },
    get: async function (empresaId) {
      var eid = empresaId || getEmpresaId();
      var rows = await sbFetch('/nf_counter?empresa_id=eq.' + encodeURIComponent(eid) + '&limit=1');
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

    gdpLog('[gdp-api] Migration complete:', migrated);
    return migrated;
  }

  // --- RLS context: set empresa_id for Row Level Security policies (Story 7.1) ---
  // Story 4.72: RPC set_empresa_context removed from Supabase — function is now a no-op
  // Will be re-enabled when RLS migration is complete
  async function setEmpresaContext(empresaId) {
    return true;
  }

  // --- public API ---
  // Story 17.5: caixa_config — saldo inicial sincronizado (1 linha por empresa_id).
  // PK = empresa_id (não 'id'), então usa helper dedicado em vez da factory CRUD.
  var CAIXA_CONFIG_LS = 'gdp.caixa-config.v1';
  var caixaConfigApi = {
    // Lê do Supabase; cai no cache local; nunca lança.
    get: async function () {
      var emp = getEmpresaId();
      var rows = await sbFetch('/caixa_config?empresa_id=eq.' + encodeURIComponent(emp) + '&limit=1');
      if (rows && Array.isArray(rows) && rows.length > 0) {
        var cfg = mapFromTable(rows[0]);
        try { localStorage.setItem(CAIXA_CONFIG_LS, JSON.stringify(cfg)); } catch (_) {}
        return cfg;
      }
      // Fallback: cache local (offline ou tabela ainda não migrada)
      try { return JSON.parse(localStorage.getItem(CAIXA_CONFIG_LS) || 'null'); } catch (_) { return null; }
    },
    // Grava saldo inicial (e data) no Supabase + cache local.
    save: async function (cfg) {
      cfg = cfg || {};
      var row = mapToTable('caixa_config', {
        empresaId: getEmpresaId(),
        saldoInicial: Number(cfg.saldoInicial || 0),
        saldoInicialData: cfg.saldoInicialData || null,
        updatedAt: new Date().toISOString()
      });
      row.empresa_id = getEmpresaId();
      var ok = await sbUpsert('caixa_config', row, 'empresa_id');
      try { localStorage.setItem(CAIXA_CONFIG_LS, JSON.stringify(mapFromTable(row))); } catch (_) {}
      return ok;
    },
    // Leitura síncrona do cache (para getCaixaResumo, que é síncrono).
    getCachedSaldoInicial: function () {
      try {
        var c = JSON.parse(localStorage.getItem(CAIXA_CONFIG_LS) || 'null');
        if (c && (c.saldoInicial != null || c.saldo_inicial != null)) {
          return parseFloat(c.saldoInicial != null ? c.saldoInicial : c.saldo_inicial) || 0;
        }
      } catch (_) {}
      return null; // null = sem valor sincronizado; caller usa fallback local
    }
  };

  // EPIC-20 Story 20.9.1 — Conta-Corrente do Cliente
  // Saldo SEMPRE recalculado dos lançamentos (princípio P3 do PRD): nunca materializado.
  // saldo = Σ(valor WHERE tipo=credito) − Σ(valor WHERE tipo=debito), ativos (deleted_at IS NULL).
  // Positivo = crédito a favor da escola; negativo = escola devedora.
  var contaCorrenteApi = {
    // Saldo de um cliente a partir de uma lista de lançamentos (já filtrada de deletados pela factory).
    saldoFromLancamentos: function (lancamentos, clienteId) {
      var saldo = 0;
      if (!Array.isArray(lancamentos)) return 0;
      for (var i = 0; i < lancamentos.length; i++) {
        var l = lancamentos[i];
        if (!l) continue;
        if (clienteId && (l.clienteId || l.cliente_id) !== clienteId) continue;
        var v = parseFloat(l.valor) || 0;
        if (l.tipo === 'debito') saldo -= v; else saldo += v;
      }
      return Math.round(saldo * 100) / 100;
    },
    // Saldo de um cliente buscando os lançamentos no Supabase/cache (assíncrono).
    saldo: async function (clienteId) {
      var todos = await window.gdpApi.lancamentosCliente.list();
      return contaCorrenteApi.saldoFromLancamentos(todos, clienteId);
    },
    // Extrato de um cliente (lançamentos ordenados por data) + saldo corrente.
    extrato: async function (clienteId) {
      var todos = await window.gdpApi.lancamentosCliente.list();
      var doCliente = (todos || []).filter(function (l) {
        return l && (l.clienteId || l.cliente_id) === clienteId;
      });
      doCliente.sort(function (a, b) {
        return String(a.data || '').localeCompare(String(b.data || ''));
      });
      return { lancamentos: doCliente, saldo: contaCorrenteApi.saldoFromLancamentos(doCliente) };
    }
  };

  window.gdpApi = {
    contratos:      createEntityApi('contratos'),
    pedidos:        createEntityApi('pedidos'),
    notas_fiscais:  createEntityApi('notas_fiscais'),
    clientes:       createEntityApi('clientes'),
    contas_receber: createEntityApi('contas_receber'),
    contas_pagar:   createEntityApi('contas_pagar'),
    entregas:       createEntityApi('entregas'),
    extratos:       createEntityApi('extratos'),
    conciliacoes:   createEntityApi('conciliacoes'),
    produtos:       createEntityApi('produtos'),
    lancamentosCliente: createEntityApi('lancamentos_cliente'),
    lancamentosItens:   createEntityApi('lancamentos_itens'),
    // snake_case aliases so gdp-realtime.js reconcile (which indexes by table name) finds them
    lancamentos_cliente: createEntityApi('lancamentos_cliente'),
    lancamentos_itens:   createEntityApi('lancamentos_itens'),
    contaCorrente:  contaCorrenteApi,
    nf_counter:     nfCounterApi,
    caixaConfig:    caixaConfigApi,
    getEmpresaId:        getEmpresaId,
    setEmpresaContext:   setEmpresaContext,
    isReady:             isReady,
    migrateFromSyncData: migrateFromSyncData,
    flushRetryQueue:     flushRetryQueue,
    _retryQueue: _retryQueue,
    _ENTITIES:   ENTITIES,
    _memCache:   _memCache,
    getDataSource: function () { return _dataSource; }
  };

  // Auto-set RLS context on load
  setEmpresaContext();

  if (typeof gdpLog === 'function') gdpLog('[gdp-api] loaded, empresa_id:', getEmpresaId());
})();
