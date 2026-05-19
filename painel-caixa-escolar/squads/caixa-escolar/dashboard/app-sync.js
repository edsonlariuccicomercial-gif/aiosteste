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
  // Story 14.3: parallel fetch for all user candidates instead of sequential
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
  const candidates = getSyncUserCandidates();

  const results = await Promise.all(candidates.map(async (userId) => {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/sync_data?user_id=eq.${encodeURIComponent(userId)}&select=key,data,updated_at`,
        { headers }
      );
      if (!resp.ok) return { userId, rows: [] };
      const rows = await resp.json();
      return { userId, rows: Array.isArray(rows) ? rows : [] };
    } catch (e) {
      gdpWarn("Cloud load failed:", userId, e);
      return { userId, rows: [] };
    }
  }));

  // Return first candidate that has data (preserves priority order)
  for (const result of results) {
    if (result.rows.length > 0) {
      persistResolvedSyncUser(result.userId);
      return result.rows;
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

async function syncFromCloud() {
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

    // Merge protection: if local has MORE items than cloud, keep local (prevents data loss)
    const localItems = localData?.items || (Array.isArray(localData) ? localData : null);
    const cloudItems = row.data?.items || (Array.isArray(row.data) ? row.data : null);
    if (localItems && cloudItems && localItems.length > cloudItems.length && cloudItems.length > 0) {
      gdpWarn("[Sync] Keeping local for " + row.key + " (local:" + localItems.length + " > cloud:" + cloudItems.length + ")");
      continue;
    }

    if (isSharedKey || cloudTime > localTime || (!localTime && cloudTime === 0)) {
      try {
        localStorage.setItem(row.key, JSON.stringify(row.data));
        synced++;
      } catch (e) {
        if (e.name === 'QuotaExceededError') gdpWarn("[Sync] localStorage cheio, ignorando:", row.key);
        else throw e;
      }
    }
  }

  return synced > 0;
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
  const promises = SYNC_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve();

    // Skip keys that exceed max size (orcamentos ~1.5MB, notas-fiscais ~1.4MB already have dedicated tables)
    if (raw.length > SYNC_MAX_BYTES) return Promise.resolve();

    // Skip keys that haven't changed since last sync
    const hash = _quickHash(raw);
    if (_syncHashes[key] === hash) return Promise.resolve();

    try {
      const data = JSON.parse(raw);
      // Guard: skip empty data UNLESS it has a recent updatedAt (legitimate deletion)
      const hasRecentUpdate = data?.updatedAt && (Date.now() - new Date(data.updatedAt).getTime()) < 300000; // 5 min
      if (!hasRecentUpdate) {
        if (Array.isArray(data) && data.length === 0) return Promise.resolve();
        if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return Promise.resolve();
      }
      _syncHashes[key] = hash;
      return cloudSave(key, data, signal);
    } catch(_) { return Promise.resolve(); }
  });
  await Promise.all(promises);
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

async function pollForChanges() {
  if (!navigator.onLine) { _updateSyncIndicator('disconnected'); return; }
  _updateSyncIndicator('syncing');
  try {
    const empresaId = getSyncUserId();
    const tables = ['pedidos', 'contratos'];
    let hasChanges = false;

    for (const table of tables) {
      let url = `${SUPABASE_URL}/rest/v1/${table}?empresa_id=eq.${encodeURIComponent(empresaId)}&select=*&order=updated_at.desc&limit=100`;
      if (_lastPollTs) {
        url += `&updated_at=gt.${encodeURIComponent(_lastPollTs)}`;
      }
      const resp = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
      if (!resp.ok) continue;
      const rows = await resp.json();
      if (!rows.length) continue;
      hasChanges = true;

      // Update localStorage cache via gdp-api entity structure
      const entity = window.gdpApi?._ENTITIES?.[table];
      if (entity) {
        const lsKey = entity.lsKey;
        let existing = [];
        try {
          const raw = JSON.parse(localStorage.getItem(lsKey) || 'null');
          if (raw && raw.items) existing = raw.items;
          else if (Array.isArray(raw)) existing = raw;
        } catch (_) {}

        for (const row of rows) {
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
