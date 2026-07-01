#!/usr/bin/env node
// ============================================================================
// PURGE do sync_data legado — DESTRUTIVO. Deleta só as chaves com tabela dedicada.
// ============================================================================
// Fecha a torneira de raiz: sem o blob no servidor, NENHUMA máquina (nem código
// antigo) consegue ressuscitar dados velhos. Some/volta acaba.
//
// TRAVAS DE SEGURANÇA (o script se recusa a rodar se qualquer uma falhar):
//   1. Exige que exista um backup recente em ./backups/ (script 2 rodado).
//   2. Re-verifica, por entidade, que a tabela dedicada tem >= o blob (script 1).
//      Se alguma tabela tiver MENOS que o blob, ABORTA (perderia dado).
//   3. Exige a flag --confirm para executar (dry-run por padrão).
//
// USO:
//   # 1) Dry-run (mostra o que faria, NÃO deleta):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/estabilizacao-sync/3-purge-sync-data.mjs
//
//   # 2) Execução real (só depois de conferir o dry-run):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/estabilizacao-sync/3-purge-sync-data.mjs --confirm
//
// ⚠️ AIOX: operação em banco de PRODUÇÃO é exclusiva do @devops. Rode via @devops.
// ============================================================================

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SB_URL = process.env.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const CONFIRM = process.argv.includes("--confirm");

if (!SB_KEY) {
  console.error("\n❌ Faltou SUPABASE_SERVICE_ROLE_KEY.\n");
  process.exit(1);
}

const KEY_TO_TABLE = {
  "gdp.contratos.v1": "contratos",
  "gdp.pedidos.v1": "pedidos",
  "gdp.notas-fiscais.v1": "notas_fiscais",
  "gdp.contas-receber.v1": "contas_receber",
  "gdp.contas-pagar.v1": "contas_pagar",
  "gdp.entregas.provas.v1": "entregas",
  "gdp.usuarios.v1": "clientes",
  "gdp.extratos.v1": "extratos",
  "gdp.conciliacao.v1": "conciliacoes",
  "gdp.produtos.v1": "produtos",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

// TRAVA 1 — exige backup
function assertBackupExists() {
  try {
    const files = readdirSync(join(__dirname, "backups")).filter(f => f.startsWith("sync_data-backup-"));
    if (!files.length) throw new Error("nenhum");
    console.log(`✅ Trava 1 OK: ${files.length} backup(s) encontrado(s) (último: ${files.sort().pop()}).`);
  } catch {
    console.error("\n🔴 TRAVA 1 FALHOU: nenhum backup em ./backups/. Rode 2-backup-sync-data.mjs ANTES.\n");
    process.exit(1);
  }
}

async function tableCount(table) {
  const resp = await fetch(`${SB_URL}/rest/v1/${table}?select=id`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = resp.headers.get("content-range") || "";
  return { ok: resp.ok, total: cr.includes("/") ? Number(cr.split("/")[1]) : NaN };
}
function blobLen(data) {
  if (Array.isArray(data)) return data.length;
  if (data && Array.isArray(data.items)) return data.items.length;
  if (data && typeof data === "object") return Object.keys(data).length;
  return 0;
}

async function deleteKey(key) {
  const resp = await fetch(`${SB_URL}/rest/v1/sync_data?key=eq.${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=minimal" },
  });
  return resp.ok ? { ok: true } : { ok: false, status: resp.status, detail: await resp.text().catch(() => "") };
}

(async () => {
  console.log("\n============================================================");
  console.log(CONFIRM ? " PURGE sync_data — EXECUÇÃO REAL (--confirm)" : " PURGE sync_data — DRY-RUN (sem --confirm, nada será deletado)");
  console.log(" Servidor:", SB_URL);
  console.log("============================================================\n");

  assertBackupExists();

  // Puxa o blob atual para a TRAVA 2
  const resp = await fetch(`${SB_URL}/rest/v1/sync_data?select=key,data`, { headers });
  const rows = resp.ok ? await resp.json() : [];
  const maxByKey = {};
  for (const r of rows) { const n = blobLen(r.data); if (!(r.key in maxByKey) || n > maxByKey[r.key]) maxByKey[r.key] = n; }

  // TRAVA 2 — tabela >= blob por entidade
  console.log("\nVerificando trava 2 (tabela >= blob) por entidade:\n");
  const seguras = [];
  let abortar = false;
  for (const [key, table] of Object.entries(KEY_TO_TABLE)) {
    const blob = maxByKey[key] ?? 0;
    if (blob === 0) { console.log(`  ${key.padEnd(28)} blob vazio → seguro`); seguras.push(key); continue; }
    const t = await tableCount(table);
    if (!t.ok || Number.isNaN(t.total)) { console.log(`  ${key.padEnd(28)} 🔴 não leu tabela ${table} → ABORTA`); abortar = true; continue; }
    if (t.total >= blob) { console.log(`  ${key.padEnd(28)} tabela(${t.total}) >= blob(${blob}) → seguro`); seguras.push(key); }
    else { console.log(`  ${key.padEnd(28)} 🔴 tabela(${t.total}) < blob(${blob}) → ABORTA`); abortar = true; }
  }

  if (abortar) {
    console.error("\n🔴 TRAVA 2 FALHOU: pelo menos uma tabela tem MENOS registros que o blob.");
    console.error("   NÃO deletei nada. Investigue a(s) entidade(s) marcada(s) 🔴 (podem faltar na tabela).\n");
    process.exit(1);
  }

  console.log(`\n✅ Travas OK. ${seguras.length} chave(s) elegível(is) para purge:\n  ${seguras.join("\n  ")}`);

  if (!CONFIRM) {
    console.log("\nℹ️  DRY-RUN: nada foi deletado. Para executar de verdade, rode de novo com --confirm.\n");
    return;
  }

  console.log("\n⏳ Deletando...\n");
  for (const key of seguras) {
    const r = await deleteKey(key);
    console.log(`  ${r.ok ? "✅ deletado" : "❌ FALHOU (" + r.status + ")"}: ${key}` + (r.ok ? "" : " — " + r.detail));
  }
  console.log("\n============================================================");
  console.log(" ✅ PURGE concluído. As chaves auxiliares (config) foram PRESERVADAS.");
  console.log("    Próximo: aplicar o guard no cloudSave (gdp-core.js) para não regravar.");
  console.log("============================================================\n");
})();
