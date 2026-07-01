# 🔧 Runbook — Estabilização de Raiz do Sistema Atual (v1)

> **Objetivo:** parar de vez o "dados que somem/voltam/regridem" no sistema em produção,
> atacando a CAUSA RAIZ (o blob `sync_data` legado = múltiplas fontes de verdade que oscilam),
> não os sintomas. Com rede de segurança total (backup antes de deletar).
>
> **Data:** 2026-07-01 · **Autoria:** sop-chief (Deming) · **Execução destrutiva:** @devops

---

## 🎯 A causa raiz (comprovada no código)

O sistema tem uma tabela KV legada `sync_data` no Supabase que guarda AS MESMAS entidades
que já têm tabela dedicada (contratos, pedidos, notas, produtos, etc.). Isso cria **múltiplas
fontes de verdade que oscilam** — o dado exibido depende de qual fonte a tela leu por último /
qual venceu a corrida de sync. Por isso "some e volta".

Os guards no cliente (`_GDPAPI_KEYS`, `_SUPABASE_TABLE_KEYS`) já filtram no código NOVO — mas:
1. o blob velho **continua no servidor** (bomba-relógio);
2. qualquer máquina com **código antigo** (aba não atualizada, celular) ainda re-publica o blob.

**Cura definitiva = fechar a torneira no SERVIDOR (deletar o blob + impedir re-gravação),
não só no cliente.**

---

## ✅ O que já foi feito (nesta sessão)

- **Guard no `cloudSave`** (`gdp-core.js`): entidades com tabela dedicada NUNCA mais sobem como
  blob `sync_data`. Última linha de defesa no lado da escrita. **← já aplicado ao código.**
- **3 scripts de operação** em `scripts/estabilizacao-sync/` (diagnóstico, backup, purge).

---

## 📋 Sequência de execução (SIGA A ORDEM)

Pré-requisito: ter `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (painel Vercel →
projeto painel-caixa-escolar → Settings → Environment Variables).

> No terminal, exporte uma vez:
> ```bash
> export SUPABASE_URL="https://mvvsjaudhbglxttxaeop.supabase.co"
> export SUPABASE_SERVICE_ROLE_KEY="eyJ...(a service_role, NÃO a anon)..."
> ```

### PASSO 1 — Diagnóstico (read-only, zero risco)
```bash
node scripts/estabilizacao-sync/1-diagnostico-sync-data.mjs
```
- Mostra, por entidade: quantos registros o blob tem vs a tabela dedicada.
- **Veredito por entidade:** ✅ (tabela ≥ blob, seguro deletar) ou 🔴 (tabela < blob, PERIGO).
- **⛔ Se QUALQUER entidade der 🔴: PARE.** Significa que a tabela dedicada está incompleta
  para aquela entidade — deletar o blob perderia dado. Me chame para investigar antes.
- Se o veredito geral for ✅, siga.

### PASSO 2 — Backup completo (read-only, zero risco)
```bash
node scripts/estabilizacao-sync/2-backup-sync-data.mjs
```
- Exporta 100% do `sync_data` para `scripts/estabilizacao-sync/backups/sync_data-backup-<ts>.json`.
- **Confirme que o arquivo foi criado e tem tamanho > 0** antes de seguir.

### PASSO 3 — Purge, DRY-RUN primeiro (não deleta nada)
```bash
node scripts/estabilizacao-sync/3-purge-sync-data.mjs
```
- Re-verifica as travas (backup existe + tabela ≥ blob) e LISTA o que deletaria.
- **Não deleta nada sem `--confirm`.** Confira a lista.

### PASSO 4 — Purge REAL (destrutivo — só depois de 1, 2 e 3-dryrun OK)
```bash
node scripts/estabilizacao-sync/3-purge-sync-data.mjs --confirm
```
- Deleta do `sync_data` só as chaves com tabela dedicada. Preserva as chaves de config/auxiliares.
- As travas abortam automaticamente se o backup sumiu ou se alguma tabela ficou < blob.

### PASSO 5 — Deploy do guard (fecha a torneira no cliente)
O guard no `cloudSave` já está no código. Publique:
```bash
cd painel-caixa-escolar && npx vercel --prod --force --yes
```
- ⚠️ SEMPRE `--force` (o build cache do Vercel republica versão antiga — ver CLAUDE.md).
- Bumpe a versão do `gdp-core.js` no HTML (`?v=NN`) e oriente Ctrl+Shift+R nos navegadores.

---

## 🔍 Validação pós-estabilização

1. **Recarregue todas as máquinas** com Ctrl+Shift+R (mata o código antigo que republica o blob).
2. No console do navegador, confirme que `cloudSave` não sobe mais as chaves de tabela dedicada
   (o guard retorna cedo).
3. Rode o PASSO 1 de novo depois de alguns dias: o blob das entidades dedicadas deve permanecer
   VAZIO (nenhuma máquina antiga o re-encheu). Se voltar a encher → alguma máquina ainda está no
   código velho; force o refresh.
4. Teste o sintoma real: emita/edite algo, troque de aba/máquina, confirme que **não some/volta**.

---

## 🧯 Rollback (se algo der errado)

O backup do PASSO 2 restaura tudo. Para reverter o purge, use o **script 4 de restore**:

```bash
# Dry-run (mostra o que restauraria, não escreve):
node scripts/estabilizacao-sync/4-restore-sync-data.mjs

# Restaurar TUDO do backup mais recente:
node scripts/estabilizacao-sync/4-restore-sync-data.mjs --confirm

# Restaurar SÓ a(s) entidade(s) que você perdeu (recomendado):
node scripts/estabilizacao-sync/4-restore-sync-data.mjs --only gdp.produtos.v1,gdp.contratos.v1 --confirm
```
- Sem `--file`, ele pega o backup mais recente de `./backups/` automaticamente.
- ⚠️ Restaurar o blob **reintroduz** a fonte concorrente (o bug). Faça só para recuperar dado
  perdido; depois migre esse dado para a tabela dedicada e rode o purge de novo quando seguro.

Para reverter o guard: remova o bloco `if (_SUPABASE_TABLE_KEYS.has(key)) return;` do `cloudSave`
e redeploy (mas isso traz o bug de volta — só para emergência).

**Mas atenção:** reverter o guard traz o bug de volta. O rollback é para emergência de perda de
dado, não para "voltar ao normal" — o "normal" era o sistema quebrado.

---

## ⚠️ Nota de autoridade AIOX

A operação destrutiva (PASSO 4) e o deploy (PASSO 5) são de **execução exclusiva do @devops**.
Este runbook e os scripts foram preparados pela fábrica; o gatilho de produção é seu/@devops.
