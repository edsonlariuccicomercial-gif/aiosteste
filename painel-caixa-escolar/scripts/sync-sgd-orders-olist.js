const fs = require("fs");
const path = require("path");
const { sendToOlist } = require("./olist-adapter");

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function resolvePaths() {
  const dataDir = path.join(process.cwd(), "dashboard", "data");
  return {
    INTERNAL_ORDERS_PATH: path.join(dataDir, "internal-orders.json"),
    LEGACY_SGD_ORDERS_PATH: path.join(dataDir, "sgd-orders.json"),
    QUEUE_PATH: path.join(dataDir, "sync-queue.json"),
    MAP_PATH: path.join(dataDir, "order-sync-map.json"),
    STATUS_PATH: path.join(dataDir, "sync-status.json"),
    LOG_PATH: path.join(dataDir, "order-sync-log.json"),
  };
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_SEC = 20;

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function isReady(item) {
  return !item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= Date.now();
}

function idempotencyKey(order) {
  return `internal-order:${order.id}`;
}

function parseArgs(argv) {
  let onlyId = process.env.SYNC_ONLY_ID || "";
  let forceResend = String(process.env.SYNC_FORCE_RESEND || "").toLowerCase() === "true";

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg.startsWith("--only-id=")) {
      onlyId = arg.split("=")[1] || "";
      continue;
    }
    if (arg === "--only-id" && i + 1 < argv.length) {
      onlyId = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--force-resend" || arg === "--force") {
      forceResend = true;
    }
  }

  return {
    onlyId: String(onlyId || "").trim(),
    forceResend,
  };
}

function normalizeOrder(raw) {
  return {
    id: String(raw.id || "").trim(),
    school: String(raw.school || "").trim(),
    city: String(raw.city || "").trim(),
    sre: String(raw.sre || "").trim(),
    contractRef: String(raw.contractRef || "").trim(),
    totalValue: Number(raw.totalValue || 0),
    confirmedAt: raw.confirmedAt || null,
    items: Array.isArray(raw.items) ? raw.items : [],
    workflowStatus: String(raw.workflowStatus || raw.status || "").trim(),
  };
}

function validateOrder(order) {
  const errors = [];
  if (!order.id) errors.push("id ausente");
  if (!order.school) errors.push("school ausente");
  if (!order.confirmedAt) errors.push("confirmedAt ausente");
  if (!order.items.length) errors.push("items vazio");
  if (order.workflowStatus !== "APROVADO_PARA_FATURAMENTO")
    errors.push("workflowStatus diferente de APROVADO_PARA_FATURAMENTO");
  return errors;
}

function upsertQueueFromOrders(queue, orders, syncMap) {
  const mapByKey = new Map(syncMap.map((m) => [m.idempotencyKey, m]));
  const queueByKey = new Map(queue.map((q) => [q.idempotencyKey, q]));

  for (const order of orders) {
    const key = idempotencyKey(order);
    const synced = mapByKey.get(key)?.status === "synchronized";
    if (synced) continue;
    if (queueByKey.has(key)) continue;

    queue.push({
      queueId: `Q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      internalOrderId: order.id,
      idempotencyKey: key,
      attempts: 0,
      status: "pending",
      nextAttemptAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastError: "",
      payloadSnapshot: order,
    });
  }
}

function appendSyncLog(syncLog, entry) {
  syncLog.push(entry);
  if (syncLog.length > 1000) {
    syncLog.splice(0, syncLog.length - 1000);
  }
}

async function processQueue(queue, syncMap, syncLog) {
  let processed = 0;
  let success = 0;
  let failed = 0;

  for (const item of queue) {
    if (item.status === "synced") continue;
    if (!isReady(item)) continue;

    processed += 1;
    item.attempts += 1;
    item.updatedAt = nowIso();

    try {
      const result = await sendToOlist(item.payloadSnapshot, item.idempotencyKey);
      item.status = "synced";
      item.syncedAt = nowIso();
      item.lastError = "";

      const existing = syncMap.find((m) => m.idempotencyKey === item.idempotencyKey);
      const payload = {
        internalOrderId: item.internalOrderId,
        idempotencyKey: item.idempotencyKey,
        olistOrderId: result.olistOrderId,
        status: "synchronized",
        syncedAt: nowIso(),
        provider: result.provider,
        attempts: item.attempts,
      };
      if (existing) Object.assign(existing, payload);
      else syncMap.push(payload);

      appendSyncLog(syncLog, {
        at: nowIso(),
        internalOrderId: item.internalOrderId,
        idempotencyKey: item.idempotencyKey,
        attempt: item.attempts,
        outcome: "success",
        provider: result.provider || "",
        olistOrderId: result.olistOrderId || "",
        tinyResponse: result.raw || {},
      });
      success += 1;
    } catch (err) {
      const msg = String(err.message || err);
      item.lastError = msg;
      if (item.attempts >= MAX_ATTEMPTS) {
        item.status = "dead_letter";
      } else {
        item.status = "failed";
        const delay = BASE_DELAY_SEC * Math.pow(2, item.attempts - 1);
        item.nextAttemptAt = new Date(Date.now() + delay * 1000).toISOString();
      }

      const existing = syncMap.find((m) => m.idempotencyKey === item.idempotencyKey);
      const payload = {
        internalOrderId: item.internalOrderId,
        idempotencyKey: item.idempotencyKey,
        olistOrderId: existing?.olistOrderId || "",
        status: item.status === "dead_letter" ? "failed" : "pending_retry",
        syncedAt: existing?.syncedAt || "",
        provider: existing?.provider || "",
        attempts: item.attempts,
        lastError: msg,
      };
      if (existing) Object.assign(existing, payload);
      else syncMap.push(payload);

      appendSyncLog(syncLog, {
        at: nowIso(),
        internalOrderId: item.internalOrderId,
        idempotencyKey: item.idempotencyKey,
        attempt: item.attempts,
        outcome: "error",
        provider: existing?.provider || "",
        olistOrderId: existing?.olistOrderId || "",
        error: msg,
      });
      failed += 1;
    }
  }

  return { processed, success, failed };
}

function clearStateForOrder(orderId, queue, syncMap) {
  if (!orderId) return;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (String(queue[i].internalOrderId) === orderId) queue.splice(i, 1);
  }
  for (let i = syncMap.length - 1; i >= 0; i--) {
    if (String(syncMap[i].internalOrderId) === orderId) syncMap.splice(i, 1);
  }
}

function computePipelineStatus(row) {
  const queueStatus = String(row.queueStatus || "").toLowerCase();
  const mapStatus = String(row.mapStatus || "").toLowerCase();
  const attempts = Number(row.attempts || 0);
  const hasOlistId = Boolean(row.olistOrderId);

  if (mapStatus === "synchronized" || queueStatus === "synced") return "aceito";
  if (queueStatus === "failed" || queueStatus === "dead_letter" || mapStatus === "failed") return "erro";
  if (hasOlistId && mapStatus !== "synchronized") return "enviado";
  if (queueStatus === "pending" && attempts > 0) return "enviado";
  return "fila";
}

function buildStatusMap(syncMap, queue) {
  const byId = {};

  for (const item of queue) {
    const orderId = String(item.internalOrderId || "");
    if (!orderId) continue;
    byId[orderId] = {
      status: item.status || "pending",
      queueStatus: item.status || "pending",
      mapStatus: "",
      olistOrderId: "",
      attempts: Number(item.attempts || 0),
      syncedAt: item.syncedAt || "",
      lastError: item.lastError || "",
    };
  }

  for (const row of syncMap) {
    const orderId = row.internalOrderId || row.sgdOrderId || "";
    if (!orderId) continue;
    const prev = byId[orderId] || {};
    byId[orderId] = {
      status: row.status,
      queueStatus: prev.queueStatus || "",
      mapStatus: row.status || "",
      olistOrderId: row.olistOrderId || prev.olistOrderId || "",
      attempts: Number(row.attempts || prev.attempts || 0),
      syncedAt: row.syncedAt || prev.syncedAt || "",
      lastError: row.lastError || prev.lastError || "",
    };
  }

  for (const orderId of Object.keys(byId)) {
    byId[orderId].pipelineStatus = computePipelineStatus(byId[orderId]);
  }

  return byId;
}

async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const paths = resolvePaths();
  const rawOrders = fs.existsSync(paths.INTERNAL_ORDERS_PATH)
    ? readJson(paths.INTERNAL_ORDERS_PATH, [])
    : readJson(paths.LEGACY_SGD_ORDERS_PATH, []);
  const orders = rawOrders.map(normalizeOrder);
  const scopedOrders = options.onlyId ? orders.filter((o) => o.id === options.onlyId) : orders;
  const validOrders = [];
  const rejects = [];

  for (const order of scopedOrders) {
    const errs = validateOrder(order);
    if (errs.length) rejects.push({ orderId: order.id || "N/A", errors: errs });
    else validOrders.push(order);
  }

  const queue = readJson(paths.QUEUE_PATH, []);
  const syncMap = readJson(paths.MAP_PATH, []);
  const syncLog = readJson(paths.LOG_PATH, []);
  if (options.onlyId && options.forceResend) clearStateForOrder(options.onlyId, queue, syncMap);

  upsertQueueFromOrders(queue, validOrders, syncMap);
  const stats = await processQueue(queue, syncMap, syncLog);

  writeJson(paths.QUEUE_PATH, queue);
  writeJson(paths.MAP_PATH, syncMap);
  writeJson(paths.STATUS_PATH, buildStatusMap(syncMap, queue));
  writeJson(paths.LOG_PATH, syncLog);

  console.log("Sync Pos-Licitacao (LicitIA) -> Olist concluido.");
  console.log(`Pedidos validos: ${validOrders.length}`);
  console.log(`Rejeitados: ${rejects.length}`);
  console.log(`Processados nesta execucao: ${stats.processed}`);
  console.log(`Sincronizados: ${stats.success}`);
  console.log(`Falhas: ${stats.failed}`);
  if (options.onlyId) {
    console.log(`Modo pontual ativo: onlyId=${options.onlyId}`);
    console.log(`Force resend: ${options.forceResend ? "sim" : "nao"}`);
  }
  if (rejects.length) {
    console.log("Rejeicoes:");
    for (const r of rejects) {
      console.log(`- ${r.orderId}: ${r.errors.join(", ")}`);
    }
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Falha no sync:", err.message);
    process.exit(1);
  });
}

module.exports = {
  run,
};
