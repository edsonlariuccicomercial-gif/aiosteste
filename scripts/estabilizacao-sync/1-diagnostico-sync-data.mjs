#!/usr/bin/env node
// ============================================================================
// DIAGNÓSTICO sync_data legado vs tabelas dedicadas — NÃO ALTERA NADA (read-only)
// ============================================================================
// Objetivo: provar, com números reais de produção, se é SEGURO aposentar o blob
// sync_data. Compara, por entidade, quantos registros existem no blob KV legado
// (tabela `sync_data`) vs na tabela dedicada correspondente.
//
// REGRA DE SEGURANÇA: só é seguro deletar o blob de uma entidade se a tabela
// dedicada tiver >= a contagem do blob (a tabela é superconjunto). Este script
// dá esse veredito por entidade.
//
// USO (rodar da raiz do repo, precisa da SERVICE_ROLE para ver tudo sem RLS):
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/estabilizacao-sync/1-diagnostico-sync-data.mjs
//
// Onde achar as credenciais: painel Vercel → projeto painel-caixa-escolar →
// Settings → Environment Variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================================

const SB_URL = process.env.SUPABASE_URL || "https://mvvsjaudhbglxttxaeop.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SB_KEY) {
  console.error("\n❌ Faltou SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_KEY) no ambiente.");
  console.error("   Pegue no painel da Vercel (Settings → Environment Variables) e rode:");
  console.error('   SUPABASE_SERVICE_ROLE_KEY="eyJ..." node scripts/estabilizacao-sync/1-diagnostico-sync-data.mjs\n');
  process.exit(1);
}

// Mapa: chave do blob sync_data  ->  tabela dedicada correspondente.
// (Espelha _SUPABASE_TABLE_KEYS / _GDPAPI_KEYS do gdp-core.js)
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

const headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

async function tableCount(table) {
  // HEAD com Prefer count=exact devolve a contagem no header Content-Range.
  const resp = await fetch(`${SB_URL}/rest/v1/${table}?select=id`, {
    method: "GET",
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = resp.headers.get("content-range") || "";
  const total = cr.includes("/") ? cr.split("/")[1] : "?";
  return { ok: resp.ok, total, status: resp.status };
}

async function fetchSyncDataRows() {
  // Puxa todas as linhas do sync_data (user_id, key, data) — data é o blob (array/objeto).
  const resp = await fetch(`${SB_URL}/rest/v1/sync_data?select=user_id,key,data,updated_at`, { headers });
  if (!resp.ok) {
    console.error(`❌ Não consegui ler sync_data: HTTP ${resp.status}`, await resp.text().catch(() => ""));
    return [];
  }
  return await resp.json();
}

function blobLen(data) {
  // O blob pode ser array direto, ou envelope {_v, items:[...]} (saveWrappedArray).
  if (Array.isArray(data)) return data.length;
  if (data && Array.isArray(data.items)) return data.items.length;
  if (data && typeof data === "object") return Object.keys(data).length;
  return 0;
}

(async () => {
  console.log("\n============================================================");
  console.log(" DIAGNÓSTICO sync_data legado vs tabelas dedicadas (read-only)");
  console.log(" Servidor:", SB_URL);
  console.log("============================================================\n");

  const rows = await fetchSyncDataRows();
  console.log(`Total de linhas no sync_data (todas as chaves/usuários): ${rows.length}\n`);

  // Agrupa o maior blob por chave (entre user_ids), para comparar com a tabela.
  const maxByKey = {};
  const usersByKey = {};
  for (const r of rows) {
    const n = blobLen(r.data);
    if (!(r.key in maxByKey) || n > maxByKey[r.key]) maxByKey[r.key] = n;
    (usersByKey[r.key] = usersByKey[r.key] || new Set()).add(r.user_id);
  }

  console.log("ENTIDADES COM TABELA DEDICADA (candidatas a aposentar o blob):\n");
  console.log("chave sync_data".padEnd(28), "| blob(máx)", "| tabela", "| user_ids", "| VEREDITO");
  console.log("-".repeat(90));

  let todasSeguras = true;
  for (const [key, table] of Object.entries(KEY_TO_TABLE)) {
    const blob = maxByKey[key] ?? 0;
    const users = usersByKey[key] ? usersByKey[key].size : 0;
    const t = await tableCount(table);
    const tabela = t.ok ? Number(t.total) : `ERRO ${t.status}`;
    let veredito;
    if (!t.ok) { veredito = "⚠️ NÃO LEU TABELA"; todasSeguras = false; }
    else if (blob === 0) veredito = "✅ blob vazio — deletar OK";
    else if (Number(tabela) >= blob) veredito = "✅ tabela >= blob — deletar OK";
    else { veredito = `🔴 PERIGO: tabela(${tabela}) < blob(${blob})`; todasSeguras = false; }
    console.log(key.padEnd(28), "|", String(blob).padStart(9), "|", String(tabela).padStart(6), "|", String(users).padStart(8), "|", veredito);
  }

  // Chaves no blob que NÃO têm tabela dedicada (config/auxiliares — NÃO deletar)
  const semTabela = [...new Set(rows.map(r => r.key))].filter(k => !(k in KEY_TO_TABLE));
  console.log("\nCHAVES NO sync_data SEM tabela dedicada (config/aux — PRESERVAR, não deletar):");
  console.log("  " + (semTabela.length ? semTabela.join("\n  ") : "(nenhuma)"));

  console.log("\n============================================================");
  if (todasSeguras) {
    console.log(" ✅ VEREDITO GERAL: SEGURO aposentar o blob das entidades acima.");
    console.log("    Próximo passo: rodar 2-backup-sync-data.mjs, depois 3-purge-sync-data.mjs");
  } else {
    console.log(" 🔴 VEREDITO GERAL: NÃO deletar ainda. Alguma tabela tem MENOS que o blob");
    console.log("    (ou não pôde ser lida). Investigar a(s) entidade(s) marcada(s) 🔴 antes.");
  }
  console.log("============================================================\n");
})();
