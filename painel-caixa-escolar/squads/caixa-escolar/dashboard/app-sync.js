function ensureEmpresaContext() {
  let empresa = {};
  try {
    empresa = JSON.parse(localStorage.getItem("nexedu.empresa") || "{}");
  } catch (_) {
    empresa = {};
  }
  const hasIdentity = [empresa.syncUserId, empresa.nomeFantasia, empresa.nome, empresa.cnpj]
    .map((value) => String(value || "").trim())
    .some(Boolean);
  if (hasIdentity) return empresa;
  const seeded = { ...DEFAULT_EMPRESA };
  localStorage.setItem("nexedu.empresa", JSON.stringify(seeded));
  return seeded;
}

function getSyncUserCandidates() {
  const emp = ensureEmpresaContext();
  const cnpjDigits = String(emp.cnpj || "").replace(/\D+/g, "");
  return [...new Set([
    emp.syncUserId,
    emp.nomeFantasia,
    emp.nome,
    emp.razaoSocial,
    cnpjDigits,
    emp.cnpj,
    "LARIUCCI",
    "default"
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function persistResolvedSyncUser(userId) {
  const resolved = String(userId || "").trim();
  if (!resolved || resolved.toLowerCase() === "default") return;
  const emp = ensureEmpresaContext();
  if (emp.syncUserId === resolved) return;
  localStorage.setItem("nexedu.empresa", JSON.stringify({ ...emp, syncUserId: resolved }));
}

function getSyncUserId() {
  const emp = ensureEmpresaContext();
  // Story 14.1: prioritize fixed syncUserId set at login (from escola.id or "LARIUCCI")
  return emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || "default";
}

async function cloudSave(key, data, signal) {
  const userId = getSyncUserId();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_data?on_conflict=user_id,key`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify({ user_id: userId, key, data, updated_at: new Date().toISOString() }),
      signal: signal || undefined
    });
  } catch (e) {
    if (e.name === 'AbortError') return; // Story 12.1 AC3: silently ignore aborted requests
    gdpWarn("Cloud save failed:", key, e);
  }
}

async function cloudLoadAll() {
  // Story 14.1/14.3: try primary syncUserId first, only fallback if empty
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
  const primary = getSyncUserId();

  // Fast path: try primary identity first (avoids N unnecessary requests)
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(primary)}&select=key,data,updated_at`,
      { headers }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        persistResolvedSyncUser(primary);
        return rows;
      }
    }
  } catch (e) {
    gdpWarn("Cloud load failed (primary):", primary, e);
  }

  // Slow fallback: try remaining candidates sequentially
  for (const userId of getSyncUserCandidates()) {
    if (userId === primary) continue;
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(userId)}&select=key,data,updated_at`,
        { headers }
      );
      if (!resp.ok) continue;
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        persistResolvedSyncUser(userId);
        return rows;
      }
    } catch (e) {
      gdpWarn("Cloud load failed:", userId, e);
    }
  }
  return null;
}

function getDataTimestamp(data, fallback = "") {
  const source = data?.updatedAt || data?.updated_at || fallback || "";
  if (!source) return 0;
  const time = new Date(source).getTime();
  return (Number.isFinite(time) && time > 0) ? time : 0;
}

async function syncFromCloud(options) {
  var force = options && options.force;
  const rows = await cloudLoadAll();
  if (!rows || rows.length === 0) return false;
  let synced = 0;

  for (const row of rows) {
    const local = localStorage.getItem(row.key);
    let localData = null;
    try {
      localData = local ? JSON.parse(local) : null;
    } catch (_) {
      localData = null;
    }

    if (!row.data) continue;
    if (!localData) {
      localStorage.setItem(row.key, JSON.stringify(row.data));
      synced++;
      continue;
    }

    const cloudTime = getDataTimestamp(row.data, row.updated_at);
    const localTime = getDataTimestamp(localData);
    const isSharedKey = SHARED_SYNC_KEYS.has(row.key);

    // Story 4.61: merge protection DESATIVADA quando force=true (Forçar Sync)
    if (!force) {
      const localItems = localData?.items || (Array.isArray(localData) ? localData : null);
      const cloudItems = row.data?.items || (Array.isArray(row.data) ? row.data : null);
      if (localItems && cloudItems && localItems.length > cloudItems.length && cloudItems.length > 0) {
        gdpWarn("[Sync] Keeping local for " + row.key + " (local:" + localItems.length + " > cloud:" + cloudItems.length + ")");
        continue;
      }
    }

    // Story 4.65: dirty window protection — skip overwrite if local was saved recently (5s)
    if (!force && typeof getLastLocalSave === 'function') {
      const msSinceLocalSave = Date.now() - getLastLocalSave(row.key);
      if (msSinceLocalSave < 5000) {
        gdpLog("[Sync] SKIP overwrite for", row.key, "- local save", msSinceLocalSave, "ms ago (dirty window)");
        continue;
      }
    }

    // Story 4.64: conciliacao usa timestamp (nao isSharedKey) para respeitar exclusoes locais
    const useTimestamp = row.key === 'gdp.conciliacao.v1' || row.key === 'gdp.extratos.v1';
    const shouldSync = useTimestamp
      ? (force || cloudTime > localTime || (!localTime && cloudTime === 0))
      : (force || isSharedKey || cloudTime > localTime || (!localTime && cloudTime === 0));
    if (shouldSync) {
      try {
        // Story 4.51 AC-A4: filter out locally-deleted items before writing to localStorage
        let dataToWrite = row.data;
        const delKeyMap = {
          'gdp.contratos.v1': 'gdp.contratos.deleted.v1',
          'gdp.pedidos.v1': 'gdp.pedidos.deleted.v1',
          'gdp.notas-fiscais.v1': 'gdp.notas-fiscais.deleted.v1',
          'gdp.contas-receber.v1': 'gdp.contas-receber.deleted.v1',
          'gdp.contas-pagar.v1': 'gdp.contas-pagar.deleted.v1',
          'gdp.entregas.provas.v1': 'gdp.entregas.deleted.v1',
          'gdp.notas-entrada.v1': 'gdp.notas-entrada.deleted.v1',
          'gdp.estoque-intel.fornecedores.v1': 'gdp.estoque-intel.fornecedores.deleted.v1',
          'gdp.conciliacao.v1': 'gdp.conciliacao.deleted.v1',
          'gdp.extratos.v1': 'gdp.extratos.deleted.v1'
        };
        const delKey = delKeyMap[row.key];
        if (delKey) {
          let deletedIds;
          try { deletedIds = new Set(JSON.parse(localStorage.getItem(delKey) || '[]')); } catch (_) { deletedIds = new Set(); }
          if (deletedIds.size > 0) {
            const items = dataToWrite?.items || (Array.isArray(dataToWrite) ? dataToWrite : null);
            if (items) {
              const filtered = items.filter(it => !deletedIds.has(it.id));
              if (dataToWrite?.items) dataToWrite = { ...dataToWrite, items: filtered };
              else dataToWrite = filtered;
            }
          }
        }
        // Story 4.64: convert legacy array to wrapped format for conciliacao/extratos
        if ((row.key === 'gdp.conciliacao.v1' || row.key === 'gdp.extratos.v1') && Array.isArray(dataToWrite)) {
          dataToWrite = { _v: 1, updatedAt: row.updated_at || new Date().toISOString(), items: dataToWrite };
        }
        localStorage.setItem(row.key, JSON.stringify(dataToWrite));
        synced++;
      } catch (e) {
        if (e.name === 'QuotaExceededError') gdpWarn("[Sync] localStorage cheio, ignorando:", row.key);
        else throw e;
      }
    }
  }

  return { restored: synced > 0, rowCount: synced };
}

// Dirty tracking: only sync keys that changed since last sync
const _syncHashes = {};
function _quickHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}

// Max payload per key (500KB) — larger keys already have dedicated Supabase tables
const SYNC_MAX_BYTES = 500 * 1024;

async function syncToCloud(signal) {
  // Story 4.72: Batch upsert — 1 POST instead of N individual POSTs
  const userId = getSyncUserId();
  const now = new Date().toISOString();
  const batch = [];

  for (const key of SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    if (raw.length > SYNC_MAX_BYTES) continue;

    const hash = _quickHash(raw);
    if (_syncHashes[key] === hash) continue;

    try {
      const data = JSON.parse(raw);
      if ((key === 'gdp.conciliacao.v1' || key === 'gdp.extratos.v1') && Array.isArray(data)) continue;
      const hasRecentUpdate = data?.updatedAt && (Date.now() - new Date(data.updatedAt).getTime()) < 300000;
      if (!hasRecentUpdate) {
        if (Array.isArray(data) && data.length === 0) continue;
        if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) continue;
      }
      _syncHashes[key] = hash;
      batch.push({ user_id: userId, key, data, updated_at: now });
    } catch(_) { /* skip malformed */ }
  }

  if (batch.length === 0) return;

  // Single batch POST (Supabase supports array upsert with on_conflict)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_data?on_conflict=user_id,key`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify(batch),
      signal: signal || undefined
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (typeof gdpWarn === 'function') gdpWarn("Cloud batch save failed:", e);
  }
}

// Story 12.1 AC3: AbortController — only 1 sync active at a time
let _syncTimeout = null;
let _syncAbort = null;
function schedulCloudSync() {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  if (_syncAbort) _syncAbort.abort();
  _syncTimeout = setTimeout(() => {
    _syncAbort = new AbortController();
    syncToCloud(_syncAbort.signal).catch(() => {});
  }, 2000);
}

// Sync on tab hide/close to minimize data loss window
let _visibilityAbort = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
    if (_syncAbort) { _syncAbort.abort(); _syncAbort = null; }
    _visibilityAbort = new AbortController();
    syncToCloud(_visibilityAbort.signal).catch(() => {});
  }
});

// ─── Story 14.2: Polling-based cross-machine sync ───
let _pollInterval = null;
let _lastPollTs = null;
let _pollStatus = 'disconnected'; // 'connected' | 'syncing' | 'disconnected'

function _updateSyncIndicator(status) {
  _pollStatus = status;
  const el = document.getElementById('sync-status-indicator');
  if (!el) return;
  const map = { connected: '🟢', syncing: '🟡', disconnected: '🔴' };
  el.textContent = map[status] || '⚪';
  el.title = status === 'connected' ? 'Sincronizado' : status === 'syncing' ? 'Sincronizando...' : 'Desconectado';
}

// Story 4.51 AC-A4: helper to read deleted IDs tracked locally
function _getDeletedIds(table) {
  const delKeyMap = {
    contratos: 'gdp.contratos.deleted.v1',
    pedidos: 'gdp.pedidos.deleted.v1',
    notas_fiscais: 'gdp.notas-fiscais.deleted.v1',
    contas_receber: 'gdp.contas-receber.deleted.v1',
    contas_pagar: 'gdp.contas-pagar.deleted.v1',
    entregas: 'gdp.entregas.deleted.v1'
  };
  const key = delKeyMap[table];
  if (!key) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { return new Set(); }
}

async function pollForChanges() {
  if (!navigator.onLine) { _updateSyncIndicator('disconnected'); return; }
  _updateSyncIndicator('syncing');
  try {
    const empresaId = getSyncUserId();
    // Story 4.61: sync ALL business tables, not just pedidos/contratos
    const tables = ['pedidos', 'contratos', 'notas_fiscais', 'contas_receber', 'contas_pagar', 'entregas'];
    let hasChanges = false;

    for (const table of tables) {
      // Story 4.61: se localStorage está vazio para esta entidade, fazer full load (sem filtro de data)
      const entity = window.gdpApi?._ENTITIES?.[table];
      let localEmpty = false;
      if (entity) {
        try {
          const raw = JSON.parse(localStorage.getItem(entity.lsKey) || 'null');
          const items = raw?.items || (Array.isArray(raw) ? raw : []);
          localEmpty = items.length === 0;
        } catch(_) { localEmpty = true; }
      }

      let url = `${SUPABASE_URL}/rest/v1/${table}?empresa_id=eq.${encodeURIComponent(empresaId)}&select=*&order=updated_at.desc&limit=500`;
      if (_lastPollTs && !localEmpty) {
        url += `&updated_at=gt.${encodeURIComponent(_lastPollTs)}`;
      }
      // Exclude soft-deleted rows for tables that support it
      if (['contratos', 'notas_fiscais', 'contas_receber', 'contas_pagar'].includes(table)) {
        url += '&deleted_at=is.null';
      }
      const resp = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
      if (!resp.ok) continue;
      const rows = await resp.json();
      if (!rows.length) continue;
      hasChanges = true;

      // Story 4.51 AC-A4: get locally-deleted IDs to prevent restore
      const deletedIds = _getDeletedIds(table);

      // Update localStorage cache via gdp-api entity structure
      if (entity) {
        const lsKey = entity.lsKey;
        let existing = [];
        try {
          const raw = JSON.parse(localStorage.getItem(lsKey) || 'null');
          if (raw && raw.items) existing = raw.items;
          else if (Array.isArray(raw)) existing = raw;
        } catch (_) {}

        for (const row of rows) {
          // Story 4.51 AC-A4: skip rows that were deleted locally
          if (deletedIds.has(row.id)) continue;

          const idx = existing.findIndex(e => e.id === row.id);
          if (idx >= 0) existing[idx] = row;
          else existing.push(row);
          // Track newest timestamp
          if (row.updated_at && (!_lastPollTs || row.updated_at > _lastPollTs)) {
            _lastPollTs = row.updated_at;
          }
        }
        const wrapped = entity.wrapped
          ? { _v: 1, updatedAt: new Date().toISOString(), items: existing }
          : existing;
        localStorage.setItem(lsKey, JSON.stringify(wrapped));
      }
    }

    if (hasChanges && typeof window.renderAll === 'function') {
      window.renderAll();
    }
    _updateSyncIndicator('connected');
  } catch (e) {
    gdpWarn('[poll] Error:', e);
    _updateSyncIndicator('disconnected');
  }
}

function startPolling(intervalMs) {
  stopPolling();
  _lastPollTs = new Date().toISOString();
  pollForChanges();
  _pollInterval = setInterval(pollForChanges, intervalMs || 30000);
}

function stopPolling() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}

// Auto-start polling when page is visible, stop when hidden
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !_pollInterval) {
    startPolling(30000);
  } else if (document.visibilityState === 'hidden') {
    stopPolling();
  }
});

// Export for use by other modules
window._gdpSync = { startPolling, stopPolling, pollForChanges, getSyncStatus: () => _pollStatus };
