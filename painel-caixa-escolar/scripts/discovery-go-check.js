const fs = require("fs");
const path = require("path");

const SUMMARY_PATH = path.join(process.cwd(), "docs", "ops", "discovery-summary.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function run() {
  let summary;
  try {
    summary = readJson(SUMMARY_PATH);
  } catch (_e) {
    console.error("NO-GO: discovery-summary.json ausente. Rode `npm.cmd run discovery:summary`.");
    process.exit(1);
  }

  const interviews = toNumber(summary?.metrics?.interviewsCompleted, 0);
  const validatedPct = toNumber(summary?.metrics?.validatedPainPct, 0);
  const wouldPayPct = toNumber(summary?.metrics?.wouldPayPct, 0);

  const checks = [
    { key: "min_interviews_10", ok: interviews >= 10, detail: `${interviews}/10` },
    { key: "validated_pain_pct_min_60", ok: validatedPct >= 60, detail: `${validatedPct}%` },
    { key: "would_pay_pct_min_50", ok: wouldPayPct >= 50, detail: `${wouldPayPct}%` },
  ];

  const go = checks.every((c) => c.ok);
  console.log(`Discovery Go/No-Go: ${go ? "GO" : "NO-GO"}`);
  checks.forEach((c) => console.log(`- [${c.ok ? "OK" : "ERRO"}] ${c.key}: ${c.detail}`));

  if (!go) process.exit(1);
}

run();
