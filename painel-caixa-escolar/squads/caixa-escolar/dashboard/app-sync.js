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
  const headers = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY };
  for (const userId of getSyncUserCandidates()) {
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

async function syncToCloud(signal) {
  const promises = SYNC_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve();
    try {
      const data = JSON.parse(raw);
      // Guard: skip empty data UNLESS it has a recent updatedAt (legitimate deletion)
      const hasRecentUpdate = data?.updatedAt && (Date.now() - new Date(data.updatedAt).getTime()) < 300000; // 5 min
      if (!hasRecentUpdate) {
        if (Array.isArray(data) && data.length === 0) return Promise.resolve();
        if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return Promise.resolve();
      }
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
