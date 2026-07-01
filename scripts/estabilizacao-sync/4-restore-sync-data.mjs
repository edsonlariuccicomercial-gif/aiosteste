#!/usr/bin/env node
// ============================================================================
// RESTORE do sync_data legado — rollback de EMERGÊNCIA a partir de um backup
// ============================================================================
// Reverte o purge (script 3): re-importa as linhas de um backup JSON de volta
// para a tabela sync_data via upsert (on_conflict user_id,key). Use SOMENTE se o
// purge causou perda de dado inesperada.
//
// ⚠️ Isto RESTAURA o blob legado — ou seja, traz de volta a fonte de verdade
//    concorrente que causa o "some/volta". Só faz sentido como emergência para
//    recuperar um dado perdido; depois, migre esse dado para a tabela dedicada
//    e rode o purge de novo. NÃO é o "estado normal".
//
// USO:
//   # Dry-run (mostra o que restauraria, não escreve):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/estabilizacao-sync/4-restore-sync-data.mjs --file backups/sync_data-backup-XXXX.json
//
//   # Restauração real:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/estabilizacao-sync/4-restore-sync-data.mjs --file backups/sync_data-backup-XXXX.json --confirm
//
//   # Restaurar só chaves específicas (recomendado — restaure só o que perdeu):
//     ... --file backups/....json --only gdp.produtos.v1,gdp.contratos.v1 --confirm
//
// ⚠️ AIOX: operação em produção é exclusiva do @devops.
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";

const SB_URL = process.env.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const CONFIRM = process.argv.includes("--confirm");

if (!SB_KEY) {
  console.error("\n❌ Faltou SUPABASE_SERVICE_ROLE_KEY.\n");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// --file: caminho do backup. Se omitido, usa o backup mais recente em ./backups/
let fileArg = argVal("--file");
if (!fileArg) {
  try {
    const files = readdirSync(join(__dirname, "backups")).filter(f => f.startsWith("sync_data-backup-")).sort();
    if (!files.length) throw new Error("nenhum");
    fileArg = join("backups", files.pop());
    console.log(`ℹ️  --file não informado; usando o backup mais recente: ${fileArg}`);
  } catch {
    console.error("\n❌ Nenhum backup encontrado em ./backups/ e --file não informado.\n");
    process.exit(1);
  }
}
const filePath = isAbsolute(fileArg) ? fileArg : join(__dirname, fileArg);

// --only: lista de chaves a restaurar (default = todas do backup)
const onlyArg = argVal("--only");
const onlyKeys = onlyArg ? new Set(onlyArg.split(",").map(s => s.trim())) : null;

const headers = {
  apikey: SB_KEY,
  Authorization: "Bearer " + SB_KEY,
  "Content-Type": "application/json",
  Prefer: "return=minimal,resolution=merge-duplicates",
};

async function upsertRow(row) {
  // Restaura a linha original (user_id, key, data, updated_at) preservando o timestamp do backup.
  const resp = await fetch(`${SB_URL}/rest/v1/sync_data?on_conflict=user_id,key`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: row.user_id, key: row.key, data: row.data, updated_at: row.updated_at }),
  });
  return resp.ok ? { ok: true } : { ok: false, status: resp.status, detail: await resp.text().catch(() => "") };
}

(async () => {
  console.log("\n============================================================");
  console.log(CONFIRM ? " RESTORE sync_data — EXECUÇÃO REAL (--confirm)" : " RESTORE sync_data — DRY-RUN (sem --confirm)");
  console.log(" Servidor:", SB_URL);
  console.log(" Backup:  ", filePath);
  if (onlyKeys) console.log(" Filtro:   só as chaves →", [...onlyKeys].join(", "));
  console.log("============================================================\n");

  let payload;
  try {
    payload = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("❌ Não consegui ler/parsear o backup:", e.message);
    process.exit(1);
  }
  const rows = Array.isArray(payload) ? payload : payload.rows;
  if (!Array.isArray(rows)) {
    console.error("❌ Backup sem array 'rows'. Formato inesperado.");
    process.exit(1);
  }

  const alvo = onlyKeys ? rows.filter(r => onlyKeys.has(r.key)) : rows;
  console.log(`Linhas no backup: ${rows.length}. A restaurar: ${alvo.length}.\n`);

  // Resumo por chave
  const porChave = {};
  for (const r of alvo) porChave[r.key] = (porChave[r.key] || 0) + 1;
  for (const [k, n] of Object.entries(porChave)) console.log(`  ${k.padEnd(30)} ${n} linha(s)`);

  if (!CONFIRM) {
    console.log("\nℹ️  DRY-RUN: nada foi escrito. Rode com --confirm para restaurar de verdade.\n");
    return;
  }

  console.log("\n⏳ Restaurando...\n");
  let ok = 0, fail = 0;
  for (const r of alvo) {
    const res = await upsertRow(r);
    if (res.ok) ok++;
    else { fail++; console.log(`  ❌ ${r.key} (user ${r.user_id}): HTTP ${res.status} — ${res.detail}`); }
  }
  console.log("\n============================================================");
  console.log(` ✅ Restore concluído: ${ok} OK, ${fail} falha(s).`);
  console.log("    Lembre: o blob restaurado reintroduz a fonte concorrente. Migre o dado");
  console.log("    recuperado para a tabela dedicada e rode o purge de novo quando seguro.");
  console.log("============================================================\n");
})();
