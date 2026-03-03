const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = process.cwd();
const SYNC_SCRIPT = path.join(ROOT, "scripts", "sync-sgd-orders-olist.js");
const OLIST_ADAPTER = path.join(ROOT, "scripts", "olist-adapter.js");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (_e) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function mkTempCase(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `licitia-${name}-`));
}

function clearScriptCache() {
  const syncKey = require.resolve(SYNC_SCRIPT);
  const adapterKey = require.resolve(OLIST_ADAPTER);
  delete require.cache[syncKey];
  delete require.cache[adapterKey];
}

async function runSync(cwd, env, args = []) {
  const prevCwd = process.cwd();
  const prevEnv = {};
  for (const [k, v] of Object.entries(env)) {
    prevEnv[k] = process.env[k];
    process.env[k] = String(v);
  }

  try {
    process.chdir(cwd);
    clearScriptCache();
    const { run } = require(SYNC_SCRIPT);
    await run(args);
  } finally {
    process.chdir(prevCwd);
    for (const [k, v] of Object.entries(env)) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
      if (k === "OLIST_WEBHOOK_URL" && !Object.prototype.hasOwnProperty.call(prevEnv, k)) {
        delete process.env[k];
      }
    }
  }
}

function seedBaseData(tmpDir, orders) {
  const dataDir = path.join(tmpDir, "dashboard", "data");
  writeJson(path.join(dataDir, "internal-orders.json"), orders);
  writeJson(path.join(dataDir, "sgd-orders.json"), []);
  writeJson(path.join(dataDir, "sync-queue.json"), []);
  writeJson(path.join(dataDir, "order-sync-map.json"), []);
  writeJson(path.join(dataDir, "sync-status.json"), {});
  writeJson(path.join(dataDir, "order-sync-log.json"), []);
  writeJson(path.join(dataDir, "olist-orders.json"), []);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approvedOrder(id) {
  return {
    id,
    school: "EE TESTE",
    city: "Belo Horizonte",
    sre: "SRE Metropolitana B",
    contractRef: "ARP-TESTE-001",
    totalValue: 1200,
    confirmedAt: "2026-03-02T10:00:00Z",
    workflowStatus: "APROVADO_PARA_FATURAMENTO",
    items: [
      { sku: "ALIM-ARROZ-5KG", qty: 10, unitPrice: 24.8, description: "Arroz 5kg" },
      { sku: "ALIM-FEIJAO-1KG", qty: 20, unitPrice: 7.9, description: "Feijao 1kg" },
    ],
  };
}

async function testHappyPathAndIdempotency() {
  const tmp = mkTempCase("happy");
  seedBaseData(tmp, [approvedOrder("INT-1001")]);

  await runSync(tmp, { OLIST_MODE: "mock" });

  const dataDir = path.join(tmp, "dashboard", "data");
  const syncMap1 = readJson(path.join(dataDir, "order-sync-map.json"), []);
  const queue1 = readJson(path.join(dataDir, "sync-queue.json"), []);
  const olist1 = readJson(path.join(dataDir, "olist-orders.json"), []);
  const status1 = readJson(path.join(dataDir, "sync-status.json"), {});
  const log1 = readJson(path.join(dataDir, "order-sync-log.json"), []);

  assert(syncMap1.length === 1, "Fluxo feliz: mapa de sync deveria ter 1 registro.");
  assert(syncMap1[0].status === "synchronized", "Fluxo feliz: status no mapa deveria ser synchronized.");
  assert(queue1.length === 1 && queue1[0].status === "synced", "Fluxo feliz: fila deveria estar synced.");
  assert(olist1.length === 1, "Fluxo feliz: deveria ter 1 pedido no mock Olist.");
  assert(status1["INT-1001"]?.status === "synchronized", "Fluxo feliz: sync-status deveria estar synchronized.");
  assert(status1["INT-1001"]?.pipelineStatus === "aceito", "Fluxo feliz: pipelineStatus deveria estar aceito.");
  assert(log1.length >= 1, "Fluxo feliz: deveria registrar log detalhado por tentativa.");

  await runSync(tmp, { OLIST_MODE: "mock" });

  const syncMap2 = readJson(path.join(dataDir, "order-sync-map.json"), []);
  const queue2 = readJson(path.join(dataDir, "sync-queue.json"), []);
  const olist2 = readJson(path.join(dataDir, "olist-orders.json"), []);

  assert(syncMap2.length === 1, "Idempotencia: mapa nao deve duplicar registros.");
  assert(queue2.length === 1, "Idempotencia: fila nao deve duplicar itens.");
  assert(olist2.length === 1, "Idempotencia: Olist mock nao deve duplicar pedido.");
}

async function testFailureAndReprocess() {
  const tmp = mkTempCase("retry");
  seedBaseData(tmp, [approvedOrder("INT-2001")]);

  await runSync(tmp, {
    OLIST_MODE: "webhook",
    OLIST_WEBHOOK_URL: "http://127.0.0.1:9/fail",
  });

  const dataDir = path.join(tmp, "dashboard", "data");
  const queueAfterFail = readJson(path.join(dataDir, "sync-queue.json"), []);
  const mapAfterFail = readJson(path.join(dataDir, "order-sync-map.json"), []);
  const statusAfterFail = readJson(path.join(dataDir, "sync-status.json"), {});
  const logAfterFail = readJson(path.join(dataDir, "order-sync-log.json"), []);

  assert(queueAfterFail.length === 1, "Falha: fila deveria conter 1 item.");
  assert(queueAfterFail[0].status === "failed", "Falha: item deveria estar em status failed.");
  assert(mapAfterFail[0]?.status === "pending_retry", "Falha: mapa deveria marcar pending_retry.");
  assert(statusAfterFail["INT-2001"]?.status === "pending_retry", "Falha: sync-status deveria marcar pending_retry.");
  assert(statusAfterFail["INT-2001"]?.pipelineStatus === "erro", "Falha: pipelineStatus deveria marcar erro.");
  assert(logAfterFail.some((item) => item.outcome === "error"), "Falha: deveria registrar evento de erro no log.");

  queueAfterFail[0].nextAttemptAt = "2000-01-01T00:00:00.000Z";
  writeJson(path.join(dataDir, "sync-queue.json"), queueAfterFail);

  await runSync(tmp, { OLIST_MODE: "mock" });

  const queueAfterRetry = readJson(path.join(dataDir, "sync-queue.json"), []);
  const mapAfterRetry = readJson(path.join(dataDir, "order-sync-map.json"), []);
  const statusAfterRetry = readJson(path.join(dataDir, "sync-status.json"), {});
  const olistAfterRetry = readJson(path.join(dataDir, "olist-orders.json"), []);
  const logAfterRetry = readJson(path.join(dataDir, "order-sync-log.json"), []);

  assert(queueAfterRetry[0]?.status === "synced", "Reprocessamento: fila deveria ir para synced.");
  assert(mapAfterRetry[0]?.status === "synchronized", "Reprocessamento: mapa deveria ir para synchronized.");
  assert(Number(mapAfterRetry[0]?.attempts || 0) >= 2, "Reprocessamento: attempts deveria refletir retentativa.");
  assert(statusAfterRetry["INT-2001"]?.status === "synchronized", "Reprocessamento: sync-status deveria ir para synchronized.");
  assert(statusAfterRetry["INT-2001"]?.pipelineStatus === "aceito", "Reprocessamento: pipelineStatus deveria ir para aceito.");
  assert(olistAfterRetry.length === 1, "Reprocessamento: pedido deveria ser criado no mock Olist.");
  assert(logAfterRetry.some((item) => item.outcome === "success"), "Reprocessamento: deveria registrar evento de sucesso no log.");
}

async function main() {
  await testHappyPathAndIdempotency();
  await testFailureAndReprocess();
  console.log("OK: teste de sync LicitIA -> Olist (feliz/idempotencia/falha/reprocessamento).");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
