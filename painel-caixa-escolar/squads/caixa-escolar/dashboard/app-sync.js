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

async function cloudSave(key, data) {
  const userId = getSyncUserId();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_data?on_conflict=user_id,key`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify({ user_id: userId, key, data, updated_at: new Date().toISOString() })
    });
  } catch (e) { console.warn("Cloud save failed:", key, e); }
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
      console.warn("Cloud load failed:", userId, e);
    }
  }
  return null;
}

function getDataTimestamp(data, fallback = "") {
  const source = data?.updatedAt || data?.updated_at || fallback || "";
  const time = source ? new Date(source).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
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
      console.warn("[Sync] Keeping local for " + row.key + " (local:" + localItems.length + " > cloud:" + cloudItems.length + ")");
      continue;
    }

    if (isSharedKey || cloudTime > localTime || (!localTime && cloudTime === 0)) {
      localStorage.setItem(row.key, JSON.stringify(row.data));
      synced++;
    }
  }

  return synced > 0;
}

async function syncToCloud() {
  const promises = SYNC_KEYS.map(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve();
    try {
      const data = JSON.parse(raw);
      // Guard: never push empty/tiny data if cloud has more
      if (Array.isArray(data) && data.length === 0) return Promise.resolve();
      if (data && typeof data === 'object' && Array.isArray(data.items) && data.items.length === 0) return Promise.resolve();
      return cloudSave(key, data);
    } catch(_) { return Promise.resolve(); }
  });
  await Promise.all(promises);
}

// Auto-sync: save to cloud whenever localStorage changes
let _syncTimeout = null;
function schedulCloudSync() {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(() => syncToCloud(), 2000);
}

// Sync on tab hide/close to minimize data loss window
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
    syncToCloud().catch(() => {});
  }
});
