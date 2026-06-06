# EPIC-17 — Diagnóstico de Produção (Story 17.0)

**Autor:** Dara (@data-engineer)
**Data:** 2026-06-06
**Status:** INCIDENTE ATIVO detectado durante o diagnóstico
**Severidade:** CRÍTICA — corrupção de dado financeiro propagando via realtime

---

## ⚠️ ALERTA: Incidente ativo descoberto antes das queries

Durante a preparação do diagnóstico read-only, o stakeholder reportou uma **mudança de estado em tempo real**:

- O saldo do caixa da **Angela** (que estava correto) **mudou sozinho** (sem ação do usuário) para **um terceiro valor errado** (nem o correto anterior, nem o do Edson).
- O caixa do **Edson** (errado) continua igual.
- A corrupção ocorreu **hoje, após o deploy do EPIC-16** (commit `c233ffe`) e **depois do backup diário das 10:36**.

### Interpretação técnica

"Mudou sozinho" = **push de realtime** (WebSocket Supabase) sobrescreveu o estado local da Angela.
"Terceiro valor" = **mistura de dados** de `empresa_id` diferentes, não simples troca de partição.

**Vetor identificado:** `handleEntityChange` em `gdp-realtime.js` (L156-161, ramo INSERT):
```js
if (type === 'INSERT') {
  var exists = false;
  for (...) { if (items[i].id === record.id) { exists = true; break; } }
  if (!exists) { items.push(record); changed = true; }   // ← push SEM checar empresa_id
}
```
O INSERT do realtime adiciona o registro **sem validar `empresa_id`**. Se o Supabase entrega à Angela um INSERT de conciliação de outro `empresa_id` (do Edson), o lançamento é empurrado para o caixa dela → saldo vira um terceiro valor, sozinho.

**Causa-raiz subjacente:** Causa A do brief (`empresa_id` divergente). O vetor de propagação é o realtime fazendo push cross-tenant.

### Relação com o EPIC-16 (honestidade técnica)

- O cross-tenant no ramo INSERT **é pré-existente** (não foi introduzido pelo EPIC-16).
- PORÉM, a 16.3 alterou `handleEntityChange` (ramo UPDATE/dirty-window) e o EPIC-16 adicionou criação de lançamentos vinculados (16.1) + imunidade ao tombstone (16.2). Essas mudanças **podem ter amplificado** a frequência/volume de eventos de conciliação trafegando no realtime, tornando a propagação cross-tenant visível/agravada agora.
- Conclusão: **rollback do EPIC-16 estanca o agravamento de hoje**, mas NÃO cura a Causa A (que é anterior). A cura definitiva é o EPIC-17 (empresa_id canônico + filtro no realtime + migração).

---

## Decisão do Stakeholder (Edson — 2026-06-06)

- **Conter agora:** **Rollback do código EPIC-16** (mais seguro) — reverter o deploy de hoje.
- **Backup 06 Jun 10:36:** CONFIÁVEL — a corrupção foi depois, então reflete o caixa da Angela ainda correto.

## Pontos de Restauração

| Item | Referência |
|------|-----------|
| Commit EPIC-16 (a reverter) | `c233ffe` |
| Commit seguro anterior | `70f8118` |
| Backup Supabase confiável | 06 Jun 2026 10:36 (+0000) |

---

## Ações Recomendadas (em ordem)

1. **[@devops] Rollback do código** — ✅ **EXECUTADO 2026-06-06** via `vercel promote` do deploy pré-EPIC-16 (`cxawxu19k`, dpl_9XbboUdE9h5JHFvapcG8wwXRrsVA). Alias `painel-caixa-escolar.vercel.app` confirmado apontando para `cxawxu19k`. Propagação estancada. Banco NÃO tocado (decisão do stakeholder). Git `c233ffe` permanece intacto (rollback foi só de deploy).
2. **[Edson — PENDENTE] Verificar a Angela após rollback** — recarregar o navegador dela e confirmar se o saldo volta ao correto. → Se voltar: a corrupção era só de tela (banco OK). → Se NÃO voltar: o dado no banco pode ter sido tocado; avaliar restaurar backup 10:36 (decisão à parte).
3. **[@data-engineer — PENDENTE] Diagnóstico read-only** — rodar as queries abaixo para dimensionar a Causa A e planejar o EPIC-17 (cura definitiva).

### Status da contenção — RESOLVIDO ✅
- ✅ Código revertido em produção (Vercel promote para `cxawxu19k`).
- ✅ **Edson confirmou: caixa da Angela voltou ao saldo correto após reload.**
- ✅ **CONCLUSÃO: o banco NÃO foi corrompido.** A corrupção era apenas de TELA (render do código EPIC-16). Dados no Supabase íntegros.
- ✅ Backup 10:36 NÃO foi necessário (banco intocado e íntegro).
- 🚫 NÃO re-deployar EPIC-16 até o EPIC-17 corrigir o filtro de `empresa_id` no realtime.

### Lição confirmada (refina o diagnóstico)
A corrupção ser apenas de tela (não de banco) confirma que o vetor é a **montagem do estado local no cliente** via realtime, não escrita cross-tenant no banco. Reforça a Causa B (fonte/render) combinada com Causa A (empresa_id no filtro de leitura/realtime). O EPIC-17 deve focar em: (1) filtrar `empresa_id` no `handleEntityChange` INSERT/UPDATE; (2) empresa_id canônico; (3) fonte única. NÃO há migração de dados corrompidos necessária — os dados estão corretos no banco, só foram mal-exibidos.

---

## Queries de Diagnóstico (read-only) — para o Edson executar no SQL Editor do Supabase

> Projeto: `mvvsjaudhbglxttxaeop` · SQL Editor · **somente leitura, não altera nada**

```sql
-- 1. Distribuição de empresa_id na tabela do caixa
SELECT empresa_id, count(*) AS qtd
FROM conciliacoes
GROUP BY empresa_id
ORDER BY qtd DESC;

-- 2. Contas a receber
SELECT empresa_id, count(*) AS qtd
FROM contas_receber
GROUP BY empresa_id
ORDER BY qtd DESC;

-- 3. Contas a pagar
SELECT empresa_id, count(*) AS qtd
FROM contas_pagar
GROUP BY empresa_id
ORDER BY qtd DESC;

-- 4. Pedidos
SELECT empresa_id, count(*) AS qtd
FROM pedidos
GROUP BY empresa_id
ORDER BY qtd DESC;

-- 5. (Opcional) Amostra dos empresa_id distintos no caixa, com datas
SELECT empresa_id, min(created_at) AS primeiro, max(created_at) AS ultimo, count(*) AS qtd
FROM conciliacoes
GROUP BY empresa_id
ORDER BY qtd DESC;
```

**Como ler o resultado (preencher após execução):**
- O `empresa_id` com MAIS registros e datas mais recentes é provavelmente o **canônico** (o caixa real da empresa).
- `empresa_id` órfãos/pequenos (ex.: `LARIUCCI` de fallback, ou nome/cnpj soltos) são os **divergentes** a migrar.

| Tabela | empresa_id | qtd | (canônico?) |
|--------|-----------|-----|-------------|
| conciliacoes | _(preencher)_ | | |
| contas_receber | | | |
| contas_pagar | | | |
| pedidos | | | |

---

## Análise de Código da Identidade (@data-engineer, 2026-06-06)

`getEmpresaId()` (gdp-api.js L37-61) resolve por: **`syncUserId || nomeFantasia || nome || cnpj || 'LARIUCCI'`**, lido de `localStorage['nexedu.empresa']`.

**Evidências de que o `empresa_id` canônico pretendido é `LARIUCCI`:**
- `app-state.js:691` → seed padrão `syncUserId: "LARIUCCI"`.
- `gdp-portal.html:706` → força `emp.syncUserId = 'LARIUCCI'`.
- `restore-conciliacao.html:16` → força `syncUserId='LARIUCCI'`.

**Hipótese (a confirmar pelas queries):** o navegador correto (Angela) está sob `LARIUCCI`; o divergente (Edson) caiu em `nomeFantasia`/`nome`/`cnpj` por não ter passado pelo seed. A regra de ouro exige um **único id fixo = `LARIUCCI`** para todos.

---

## REGRA DE OURO (stakeholder) + Escopo Reduzido

- Sistema é UM só; tudo sincroniza para todos em tempo real → **um único `empresa_id` fixo (`LARIUCCI`)**.
- Fonte da verdade: **caixa da Angela (correto)**.
- Banco ÍNTEGRO (incidente resolvido) → **NÃO há reparo de dados corrompidos**. A tarefa é:
  1. **Unificar identidade:** apontar todos os registros divergentes → `LARIUCCI` (UPDATE de `empresa_id`).
  2. **Fixar no código:** `getEmpresaId` retorna sempre `LARIUCCI` (ou o id canônico), sem fallback por navegador.
  3. **Filtrar realtime:** `handleEntityChange` (gdp-realtime.js) deve descartar INSERT/UPDATE com `empresa_id` != o local.

---

## Queries — Passo 1: DIAGNÓSTICO (read-only) — Edson executa no SQL Editor

```sql
-- A) Distribuição de empresa_id em cada tabela do caixa/financeiro
SELECT 'conciliacoes' AS tabela, empresa_id, count(*) AS qtd FROM conciliacoes GROUP BY empresa_id
UNION ALL
SELECT 'contas_receber', empresa_id, count(*) FROM contas_receber GROUP BY empresa_id
UNION ALL
SELECT 'contas_pagar', empresa_id, count(*) FROM contas_pagar GROUP BY empresa_id
UNION ALL
SELECT 'pedidos', empresa_id, count(*) FROM pedidos GROUP BY empresa_id
ORDER BY tabela, qtd DESC;

-- B) Qual id tem o caixa "vivo" (datas recentes) em conciliacoes
SELECT empresa_id, count(*) AS qtd, min(data) AS primeira, max(data) AS ultima
FROM conciliacoes
GROUP BY empresa_id
ORDER BY qtd DESC;
```

**RESULTADO (Edson executou 2026-06-06):**

| Tabela | empresa_id | qtd |
|--------|-----------|-----|
| conciliacoes | LARIUCCI | **186** |
| contas_receber | LARIUCCI | 102 |
| contas_pagar | LARIUCCI | 2 |
| pedidos | LARIUCCI | 127 |

### 🎯 CONCLUSÃO DEFINITIVA — Causa A DESCARTADA, Causa B CONFIRMADA

**Existe apenas UM `empresa_id` no banco inteiro: `LARIUCCI`.** Não há divergência de partição no Supabase. Angela e Edson leem do MESMO lugar no banco.

Portanto:
- ❌ **Causa A (empresa_id divergente) NÃO se confirma.** Banco já unificado.
- ❌ **NÃO há migração de dados a fazer** (Passo 2 abaixo fica CANCELADO).
- ✅ **Causa B CONFIRMADA:** a divergência do Edson é **cache local do navegador**. `loadConciliacao()` (gdp-core.js) só lê localStorage e NÃO faz backfill do Supabase. O navegador do Edson está preso num cache antigo/legado (ou no fallback `caixaExtratoMovimentos`), enquanto o banco tem os 186 lançamentos corretos.

**Decisões do stakeholder (2026-06-06):**
- Correção definitiva no CÓDIGO (não limpeza manual de cache).
- EPIC-16 permanece revertido por enquanto.

### Correção definitiva (escopo final — para @dev)

1. **Backfill no `loadConciliacao`** (gdp-core.js): no primeiro load (ou quando localStorage está vazio/defasado), buscar do Supabase via `gdpApi.conciliacoes` e popular o cache. O banco é a fonte da verdade.
2. **Eliminar o fallback legado** em `getCaixaResumo` (gdp-pedidos.js L2023-2038): remover `caixaExtratoMovimentos` como fonte alternativa — render e cálculo leem SEMPRE `loadConciliacao`.
3. **(Defensivo) Filtrar `empresa_id`** em `handleEntityChange` (gdp-realtime.js): descartar eventos com `empresa_id` != local. Não é a causa atual (tudo é LARIUCCI), mas previne regressão futura e é barato.

Isto é a **Story 17.3** (fonte única + backfill). As stories 17.1 (empresa_id código) e 17.2 (migração) ficam DESNECESSÁRIAS dado o resultado, mas 17.1 pode virar hardening defensivo opcional.

---

## Plano de Unificação — Passo 2 — ❌ CANCELADO

> **NÃO NECESSÁRIO.** O diagnóstico (Passo 1) provou que existe apenas `LARIUCCI` no banco. Não há ids divergentes para migrar. Nenhuma escrita no banco é necessária. As queries abaixo ficam apenas como registro histórico — **NÃO EXECUTAR**.

> ⚠️ ~~Estas queries ESCREVEM. Exigem snapshot Supabase imediatamente antes.~~ (obsoleto)

```sql
-- Pré-checagem: contar o que será afetado (read-only)
SELECT count(*) FROM conciliacoes   WHERE empresa_id <> 'LARIUCCI';
SELECT count(*) FROM contas_receber WHERE empresa_id <> 'LARIUCCI';
SELECT count(*) FROM contas_pagar   WHERE empresa_id <> 'LARIUCCI';
SELECT count(*) FROM pedidos        WHERE empresa_id <> 'LARIUCCI';

-- Unificação (executar em transação, após snapshot):
BEGIN;
UPDATE conciliacoes   SET empresa_id = 'LARIUCCI' WHERE empresa_id <> 'LARIUCCI';
UPDATE contas_receber SET empresa_id = 'LARIUCCI' WHERE empresa_id <> 'LARIUCCI';
UPDATE contas_pagar   SET empresa_id = 'LARIUCCI' WHERE empresa_id <> 'LARIUCCI';
UPDATE pedidos        SET empresa_id = 'LARIUCCI' WHERE empresa_id <> 'LARIUCCI';
-- conferir as contagens antes de confirmar:
-- SELECT empresa_id, count(*) FROM conciliacoes GROUP BY empresa_id;
COMMIT;  -- ou ROLLBACK se algo inesperado
```

> ⚠️ **Risco de PK duplicada:** se o mesmo `id` de registro existir sob 2 `empresa_id`, o UPDATE pode violar unicidade. O Passo 1 + uma checagem de ids duplicados deve preceder. Se houver duplicatas, tratá-las caso a caso (provável que NÃO haja, pois ids são UUID/genId únicos por origem).

---

## Próximos Passos

1. **[Edson]** Rodar as queries do Passo 1 e colar os resultados aqui.
2. **[@data-engineer]** Confirmar o id canônico e se há duplicatas; finalizar o plano de unificação.
3. **[@dev]** Fixar `getEmpresaId` em `LARIUCCI` + filtrar `empresa_id` no realtime (gdp-realtime.js `handleEntityChange`).
4. **[@devops]** Snapshot Supabase → executar unificação (Passo 2) → re-deploy do código corrigido (incl. EPIC-16 com o filtro).

---

*Story 17.0 — @data-engineer Dara. Diagnóstico de código concluído; aguardando execução das queries pelo stakeholder.*
