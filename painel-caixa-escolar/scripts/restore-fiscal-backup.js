#!/usr/bin/env node
/**
 * restore-fiscal-backup.js — Restore fiscal data from Supabase Storage backup
 * Story 7.4 — TD-045: Disaster Recovery for fiscal data
 *
 * Usage:
 *   node scripts/restore-fiscal-backup.js                     # restore latest backup
 *   node scripts/restore-fiscal-backup.js --date 2026-04-20   # restore specific date
 *   node scripts/restore-fiscal-backup.js --dry-run            # preview without writing
 *
 * RTO: ~4h (manual process)
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 */

const { gunzipSync } = require('zlib');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'fiscal-backups';
const REST = SUPABASE_URL + '/rest/v1';
const STORAGE = SUPABASE_URL + '/storage/v1';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
const targetDate = dateIdx >= 0 ? args[dateIdx + 1] : null;

async function fetchJSON(url, opts = {}) {
  const resp = await fetch(url, { headers, ...opts });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}: ${await resp.text()}`);
  return resp.json();
}

async function findBackupFile() {
  if (targetDate) {
    const d = new Date(targetDate);
    const path = `daily/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${targetDate}.json.gz`;
    return path;
  }
  // List latest backup
  const files = await fetchJSON(`${STORAGE}/object/list/${BUCKET}`, {
    method: 'POST',
    body: JSON.stringify({ prefix: 'daily/', limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  });
  if (!files.length) throw new Error('No backups found in bucket');
  // Find most recent .json.gz
  const latest = files.find(f => f.name.endsWith('.json.gz'));
  if (!latest) throw new Error('No .json.gz backups found');
  return `daily/${latest.name}`;
}

async function downloadBackup(filePath) {
  const resp = await fetch(`${STORAGE}/object/${BUCKET}/${filePath}`, { headers });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const decompressed = gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf-8'));
}

async function restoreTable(tableName, rows) {
  if (!rows.length) {
    console.log(`  [${tableName}] 0 records — skipped`);
    return 0;
  }
  if (dryRun) {
    console.log(`  [${tableName}] ${rows.length} records — DRY RUN (would upsert)`);
    return rows.length;
  }
  // Upsert in batches of 100
  let total = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const conflict = tableName === 'nf_counter' ? 'empresa_id' : 'id';
    const resp = await fetch(`${REST}/${tableName}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(batch)
    });
    if (!resp.ok) {
      console.error(`  [${tableName}] Batch ${i}-${i + batch.length} FAILED: ${resp.status}`);
    } else {
      total += batch.length;
    }
  }
  console.log(`  [${tableName}] ${total}/${rows.length} records restored`);
  return total;
}

async function main() {
  console.log('=== FISCAL BACKUP RESTORE ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Target: ${targetDate || 'latest'}\n`);

  const filePath = await findBackupFile();
  console.log(`Backup file: ${filePath}`);

  const backup = await downloadBackup(filePath);
  console.log(`Exported at: ${backup.exported_at}`);
  console.log(`Version: ${backup.version}\n`);

  console.log('Restoring tables:');
  const tables = ['notas_fiscais', 'nf_counter', 'contas_receber'];
  let totalRestored = 0;

  for (const table of tables) {
    const rows = backup.data?.[table] || [];
    totalRestored += await restoreTable(table, rows);
  }

  // Don't restore audit_log (append-only, restoring would create duplicates)
  const auditRows = backup.data?.audit_log || [];
  console.log(`  [audit_log] ${auditRows.length} records — skipped (append-only)`);

  console.log(`\nTotal: ${totalRestored} records ${dryRun ? 'would be ' : ''}restored`);
  console.log('=== DONE ===');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
