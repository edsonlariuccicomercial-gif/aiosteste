const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "dashboard", "data");
const OPS_DIR = path.join(ROOT, "docs", "ops");

const FILES = {
  daily: path.join(DATA_DIR, "ops-daily-run-report.json"),
  alerts: path.join(DATA_DIR, "ops-alerts.json"),
  eod: path.join(DATA_DIR, "ops-eod-summary.json"),
  discovery: path.join(OPS_DIR, "discovery-summary.json"),
  commercialKit: path.join(OPS_DIR, "commercial-kit.json"),
  onboarding: path.join(OPS_DIR, "onboarding-session.json"),
  syncStatus: path.join(DATA_DIR, "sync-status.json"),
};

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ageMin(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

function summarizeSync(syncStatus) {
  const rows = Object.values(syncStatus || {});
  const acc = { fila: 0, enviado: 0, aceito: 0, erro: 0 };
  for (const row of rows) {
    const s = String(row?.pipelineStatus || "").toLowerCase();
    if (s === "fila" || s === "enviado" || s === "aceito" || s === "erro") acc[s] += 1;
    else acc.fila += 1;
  }
  return { total: rows.length, ...acc };
}

function run() {
  const daily = readJson(FILES.daily, {});
  const alerts = readJson(FILES.alerts, {});
  const eod = readJson(FILES.eod, {});
  const discovery = readJson(FILES.discovery, {});
  const commercialKit = readJson(FILES.commercialKit, {});
  const onboarding = readJson(FILES.onboarding, {});
  const syncStatus = readJson(FILES.syncStatus, {});

  const sync = summarizeSync(syncStatus);
  const skuCoverage = toNum(daily?.metrics?.skuCoveragePct, 0);
  const actionable = toNum(eod?.metrics?.actionableQuotes, 0);
  const urgent48h = toNum(eod?.metrics?.urgent48h, 0);
  const interviews = toNum(discovery?.metrics?.interviewsCompleted, 0);
  const interviewTarget = toNum(discovery?.metrics?.interviewsTarget, 10);
  const discoveryDecision = String(discovery?.suggestedDecision || "N/A");
  const offers = Array.isArray(commercialKit?.offers) ? commercialKit.offers.length : 0;
  const onboardingAge = ageMin(onboarding?.startedAt);

  const opsGo = Boolean(daily?.ok);
  const alertsStatus = String(alerts?.status || "UNKNOWN");
  const eodStatus = String(eod?.metrics?.goNoGo || "UNKNOWN");

  console.log("Executive Status");
  console.log(`- Operacao: daily=${opsGo ? "GO" : "NO-GO"}, alerts=${alertsStatus}, eod=${eodStatus}`);
  console.log(`- KPI: sku_coverage=${skuCoverage}%, acionaveis=${actionable}, urgentes_48h=${urgent48h}`);
  console.log(
    `- Flux Sync: total=${sync.total}, fila=${sync.fila}, enviado=${sync.enviado}, aceito=${sync.aceito}, erro=${sync.erro}`
  );
  console.log(`- Discovery: entrevistas=${interviews}/${interviewTarget}, decisao=${discoveryDecision}`);
  console.log(`- Comercial: ofertas_ativas=${offers}`);
  console.log(`- Onboarding: ultima_sessao_min=${onboardingAge == null ? "N/A" : onboardingAge}`);

  const opsFullyGo = opsGo && (alertsStatus === "GO" || alertsStatus === "GO_WITH_WARNINGS") && eodStatus === "GO";
  let verdict = "NO-GO";
  if (opsFullyGo && discoveryDecision === "GO") verdict = "GO";
  else if (opsFullyGo) verdict = "GO_OPERACIONAL_DISCOVERY_ABERTA";

  console.log(`- Veredito executivo: ${verdict}`);
}

run();
