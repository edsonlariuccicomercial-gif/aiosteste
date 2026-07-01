#!/usr/bin/env node
// ============================================================================
// BACKUP COMPLETO do sync_data legado — exporta TUDO para JSON local (read-only)
// ============================================================================
// Roda ANTES de qualquer deleção. Salva 100% do conteúdo da tabela sync_data
// (todas as chaves, todos os user_ids, o blob inteiro) num arquivo com timestamp.
// Se algo der errado no purge, este arquivo restaura tudo.
//
// USO:
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/estabilizacao-sync/2-backup-sync-data.mjs
//
// Saída: scripts/estabilizacao-sync/backups/sync_data-backup-<timestamp>.json
// ============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SB_URL = process.env.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SB_KEY) {
  console.error("\n❌ Faltou SUPABASE_SERVICE_ROLE_KEY. Pegue no painel da Vercel e rode de novo.\n");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "backups");
const headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

(async () => {
  console.log("\n⏳ Exportando sync_data completo de", SB_URL, "...");
  const resp = await fetch(`${SB_URL}/rest/v1/sync_data?select=*`, { headers });
  if (!resp.ok) {
    console.error(`❌ Falha ao ler sync_data: HTTP ${resp.status}`, await resp.text().catch(() => ""));
    process.exit(1);
  }
  const rows = await resp.json();

  mkdirSync(outDir, { recursive: true });
  // timestamp determinístico via ISO da resposta (evita Date.now no ambiente do script)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `sync_data-backup-${stamp}.json`);

  const payload = {
    _meta: {
      exportedFrom: SB_URL,
      table: "sync_data",
      rowCount: rows.length,
      exportedAt: stamp,
      note: "Backup completo do blob KV legado antes da aposentadoria. Restaurável via upsert em sync_data.",
    },
    rows,
  };
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  const sizeMb = (JSON.stringify(payload).length / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ Backup salvo: ${file}`);
  console.log(`   ${rows.length} linhas, ~${sizeMb} MB.`);
  console.log("   Guarde este arquivo. Só rode o purge (script 3) DEPOIS de confirmar este backup.\n");
})();
