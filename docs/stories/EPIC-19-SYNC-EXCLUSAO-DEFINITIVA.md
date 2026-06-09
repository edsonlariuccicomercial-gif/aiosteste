# EPIC-19: Correção Definitiva de Sincronização de Exclusões (Caixa, Extratos e Contas a Receber)

## Contexto

Recorrência confirmada de 3 problemas independentes de sincronização entre navegadores/computadores/usuários da mesma empresa (LARIUCCI). O EPIC-17 resolveu o soft-delete sincronizado **apenas para `conciliacoes`** (stories 17.6 e 17.8, Done). As demais entidades financeiras (`extratos`, `contas_receber`) **ficaram com o padrão antigo e frágil** — por isso os problemas reapareceram.

**Diagnóstico por evidência de banco (read-only):**
- @analyst Atlas → handoff `handoff-analyst-to-pm-sync-financeiro-20260609.yaml`
- @data-engineer Dara → handoff `handoff-dataeng-to-pm-3-problemas-sync-20260609.yaml` (auditoria no Supabase mvvsjaudhbglxttxaeop, empresa_id=LARIUCCI)

**Backup de segurança:** o stakeholder exportou o localStorage do PC com o saldo correto (1.174,25) ANTES de qualquer correção. Rede de segurança ativa contra perda de dados.

## Objetivo

Garantir que **toda exclusão feita em qualquer PC propague para todos os demais**, em todas as entidades financeiras — eliminando a recorrência. Estender o padrão que JÁ FUNCIONA (soft-delete sincronizado via `deleted_at`, do EPIC-17) para `extratos` e `contas_receber`, e corrigir o cache que re-inclui itens deletados.

## Os 3 Problemas (independentes, confirmados pelo stakeholder)

| # | Problema | Sintoma | Causa-raiz (evidência banco) |
|---|----------|---------|------------------------------|
| **①** | Saldo do caixa não sincroniza | PC da conciliação mostra 1.174,25 (correto); demais mostram -3.494,29 | `writeLocalItems`/`forceReconcile` gravam conciliações cruas SEM filtrar `deleted_at`; cache de outros PCs re-inclui itens excluídos. (`conciliacoes` JÁ tem `deleted_at`; 8 itens deletados no banco) |
| **②** | Extratos recuperados duplicados | 1 PC mostra 1 extrato; demais mostram 2 | Rotina "recuperar extrato" não-idempotente (id por `Date.now()`) gera 2 `ext-recovered` distintos. `sync_data` legado vazio. |
| **③** | Contas a receber excluídas não somem | 2 contas excluídas num PC continuam nos demais | Tabela `contas_receber` **NÃO tem `deleted_at`** (erro 42703) + hard-delete frágil. RLS PERMITE delete (204) — não é RLS. 118 registros no banco. |

## Raiz Comum

Exclusões não propagam de forma confiável porque o padrão correto (soft-delete sincronizado + filtro de cache) foi aplicado só à conciliação. As outras entidades usam hard-delete (some local, falha no servidor → reaparece via realtime) ou cache que ignora a marcação de exclusão. Correções anteriores via tombstone local por-navegador não sincronizam — daí a reincidência.

## Decisão de Sequenciamento (PM — Morgan)

**Código primeiro, dados depois.** Não adianta corrigir o saldo no banco enquanto o código ainda o quebra. Fechar a causa-raiz (código) antes de reconciliar os dados. O backup do PC garante zero perda. Ordem por **risco de regressão de dados**, não por valor.

```
S19.1 Migration (add deleted_at) ──► S19.2 Fix cache (filtro deleted_at) ──► S19.3 Soft-delete contas_receber ──► S19.4 Idempotência+dedupe extratos ──► S19.5 Reconciliar saldo p/ 1.174,25 ──► S19.6 QA cross-device + deploy
        [@data-engineer]                    [@dev]                          [@dev]                       [@dev + @data-engineer]        [@data-engineer]            [@qa + @devops]
```

---

## STORY 19.1 — Migration: `deleted_at` em `contas_receber` e `extratos`

**Resolve:** pré-requisito de ③ e ②
**Prioridade:** P0 | **Risco:** BAIXO (aditivo, reversível) | **Complexidade:** S
**Executor:** @data-engineer

### Descrição
Adicionar a coluna `deleted_at` (soft-delete) nas tabelas que ficaram sem ela, replicando o padrão já validado em `conciliacoes` (EPIC-17).

### Requisitos Funcionais
- **FR-19.1.1:** `ALTER TABLE contas_receber ADD COLUMN deleted_at timestamptz NULL`.
- **FR-19.1.2:** `ALTER TABLE extratos ADD COLUMN deleted_at timestamptz NULL`.
- **FR-19.1.3:** Índices parciais `WHERE deleted_at IS NULL` para performance de leitura.
- **FR-19.1.4:** Snapshot do schema imediatamente antes (rollback documentado).

### Critérios de Aceitação
- **AC1:** Filtro `?deleted_at=is.null` retorna 200 (não mais 42703) em ambas as tabelas.
- **AC2:** Migração aditiva — nenhum dado existente alterado; zero-downtime.
- **AC3:** Rollback script disponível.

### Escopo
- **IN:** DDL aditivo + índices + snapshot.
- **OUT:** mudança de código (19.2/19.3), reconciliação de dados (19.5).

### Dependências
Nenhuma. **Bloqueia 19.3 e 19.4.**

---

## STORY 19.2 — Fix do Cache: Filtrar `deleted_at` na Escrita do localStorage

**Resolve:** ① (saldo do caixa diverge)
**Prioridade:** P0 | **Risco:** MÉDIO | **Complexidade:** M
**Executor:** @dev

### Descrição
O cache local re-inclui itens deletados porque `writeLocalItems`/`forceReconcile` gravam a lista crua do Supabase. Filtrar `deleted_at`/`deletedAt` ANTES de gravar, para que a leitura e a escrita sejam consistentes em TODAS as entidades.

### Requisitos Funcionais
- **FR-19.2.1:** `writeLocalItems` (gdp-realtime.js L121-133) filtra itens com `deleted_at`/`deletedAt` antes de gravar no localStorage.
- **FR-19.2.2:** `forceReconcile` (gdp-realtime.js L462-496) idem ao trazer dados do Supabase.
- **FR-19.2.3:** `gdp-api.list()` (gdp-api.js L229-258) aplica filtro de `deleted_at` de forma consistente para todas as entidades wrapped.
- **FR-19.2.4:** Garantir que itens visíveis = itens contabilizados (sem discrepância render vs soma).

### Critérios de Aceitação
- **AC1:** *Given* um item de conciliação com `deleted_at` no banco, *When* qualquer PC reconcilia, *Then* o item NÃO entra no cache nem no saldo.
- **AC2:** *Given* PC novo/limpo, *When* abre o caixa, *Then* o saldo bate com o dos demais PCs.
- **AC3:** Os 8 itens já deletados no banco deixam de contar em todos os PCs.

### Escopo
- **IN:** filtro de `deleted_at` no cache (write/reconcile/list).
- **OUT:** migration (19.1), reconciliação do número final (19.5).

### Arquivos
- `gdp-realtime.js` (`writeLocalItems`, `forceReconcile`), `gdp-api.js` (`list`), `gdp-core.js` (`loadConciliacao`/`loadExtratos` — verificar consistência)

### Dependências
Independente da migration para conciliação (que já tem `deleted_at`). Recomendado após 19.1 para cobrir extratos.

---

## STORY 19.3 — Soft-Delete Sincronizado em `contas_receber`

**Resolve:** ③ (contas a receber não somem)
**Prioridade:** P0 | **Risco:** MÉDIO | **Complexidade:** M
**Executor:** @dev

### Descrição
Substituir o hard-delete frágil de contas a receber pelo padrão soft-delete sincronizado (igual à conciliação): exclusão = `UPDATE deleted_at`; leitura filtra `deleted_at IS NULL`; propaga via realtime para todos.

### Requisitos Funcionais
- **FR-19.3.1:** `excluirContaReceber` (gdp-init.js L523-543) e `bulkExcluirContasReceber` passam a marcar `deletedAt` e persistir via `save` (não `remove`).
- **FR-19.3.2:** Leitura de contas a receber filtra `deleted_at`/`deletedAt`.
- **FR-19.3.3:** Mapeamento `deletedAt:'deleted_at'` incluído em `contas_receber` (gdp-api.js TABLE_COLS) para o save enviar o campo.
- **FR-19.3.4:** Remover dependência do tombstone local por-navegador (`gdp.contas-receber.deleted.v1`) como mecanismo principal.

### Critérios de Aceitação
- **AC1:** *Given* Angela exclui 2 contas num PC, *When* Edson abre contas a receber, *Then* as 2 contas somem para ele também (via realtime, sem reload).
- **AC2:** Exclusão é auditável (`deleted_at` preenchido, não destrutiva).
- **AC3:** As 2 contas que a Angela já tentou excluir são efetivamente marcadas e somem para todos.

### Escopo
- **IN:** migração hard→soft delete de contas_receber, filtro de leitura, mapeamento.
- **OUT:** extratos (19.4), conciliação (já feita no EPIC-17).

### Arquivos
- `js/gdp-init.js` (`excluirContaReceber`, `bulkExcluirContasReceber`), `gdp-api.js` (TABLE_COLS contas_receber, list/remove)

### Dependências
**Bloqueada por 19.1** (precisa da coluna `deleted_at`).

---

## STORY 19.4 — Idempotência de "Recuperar Extrato" + Dedupe

**Resolve:** ② (extratos recuperados duplicados)
**Prioridade:** P1 | **Risco:** MÉDIO | **Complexidade:** M
**Executor:** @dev + @data-engineer

### Descrição
A rotina de recuperar extrato cria duplicatas porque gera `id` por `Date.now()`. Tornar idempotente (id determinístico) e deduplicar os 2 `ext-recovered` que já existem no banco.

### Requisitos Funcionais
- **FR-19.4.1:** ID de extrato recuperado passa a ser determinístico (ex.: hash de `conta_financeira` + período/data), evitando duplicata em re-execuções.
- **FR-19.4.2:** Soft-delete (`deleted_at`) aplicável a extratos (usa coluna da 19.1).
- **FR-19.4.3:** @data-engineer deduplica os 2 `ext-recovered` atuais — manter 1 canônico, re-vincular conciliações do outro (`extrato_id`), soft-delete do duplicado.

### Critérios de Aceitação
- **AC1:** *Given* a recuperação de extrato executada 2×, *When* verificada, *Then* existe apenas 1 registro (idempotente).
- **AC2:** *Given* o dedupe aplicado, *When* qualquer PC abre conciliação bancária, *Then* todos veem o MESMO número de extratos recuperados.
- **AC3:** Nenhuma conciliação fica órfã (todas re-vinculadas ao extrato canônico).

### Escopo
- **IN:** id idempotente, soft-delete de extratos, dedupe dos 2 atuais.
- **OUT:** contas a receber (19.3).

### Arquivos
- `js/gdp-core.js` (`registrarExtrato`, lógica `ext-recovered`), `gdp-api.js` (extratos), script de dedupe (@data-engineer)

### Dependências
**Bloqueada por 19.1.** Dedupe (FR-19.4.3) após 19.2 (filtro de cache ativo).

---

## STORY 19.5 — Reconciliar o Saldo do Caixa para o Valor Real (1.174,25)

**Resolve:** ① (dados — após o código estar corrigido)
**Prioridade:** P1 | **Risco:** MÉDIO (escreve em produção) | **Complexidade:** M
**Executor:** @data-engineer

### Descrição
Com o código já corrigido (19.2), reconciliar os dados de conciliação no banco para refletir o saldo real do extrato Inter (1.174,25), usando o backup do PC do stakeholder como fonte da verdade das exclusões/ajustes que não propagaram.

### Requisitos Funcionais
- **FR-19.5.1:** Comparar o backup do PC (estado correto) com o banco; identificar lançamentos que devem ser marcados `deleted_at` (exclusões que não propagaram).
- **FR-19.5.2:** Aplicar soft-delete dos lançamentos identificados de forma controlada (com snapshot antes).
- **FR-19.5.3:** Validar: saldo_inicial (10.949,40) + soma das conciliações válidas = 1.174,25.

### Critérios de Aceitação
- **AC1:** *Given* a reconciliação aplicada, *When* qualquer PC abre o caixa, *Then* o saldo é 1.174,25 para todos.
- **AC2:** Saldo confere com o extrato bancário real do Inter (02/06 → hoje).
- **AC3:** Snapshot pré-reconciliação disponível para rollback.

### Escopo
- **IN:** reconciliação dos dados de conciliação no banco.
- **OUT:** mudança de código (já feita).

### Dependências
**Bloqueada por 19.2** (código corrigido) e pelo backup do PC (já feito).

---

## STORY 19.6 — QA Cross-Device + Deploy

**Resolve:** validação e entrega
**Prioridade:** P1 | **Risco:** BAIXO | **Complexidade:** S
**Executor:** @qa + @devops

### Descrição
Validar em cenário real multi-device que exclusões propagam, saldo converge e extratos não duplicam; verificar realtime publication; deployar.

### Requisitos Funcionais
- **FR-19.6.1:** @qa valida os 3 problemas resolvidos em 2+ navegadores/PCs.
- **FR-19.6.2:** @devops verifica realtime publication + REPLICA IDENTITY FULL das tabelas (contas_receber, extratos, conciliacoes, notas_fiscais).
- **FR-19.6.3:** Deploy `vercel --prod` pelo projeto `painel-caixa-escolar`.

### Critérios de Aceitação
- **AC1:** Exclusão em 1 PC some em todos (contas, conciliação, extratos) sem reload.
- **AC2:** Saldo idêntico (1.174,25) em todos os PCs.
- **AC3:** Número de extratos recuperados idêntico em todos os PCs.
- **AC4:** NF sincroniza em tempo aceitável (sintoma secundário verificado).

### Dependências
**Bloqueada por 19.2, 19.3, 19.4, 19.5.**

---

## Requisitos Não-Funcionais

- **NFR-1 (Dados):** snapshot antes de 19.1 e 19.5. Backup do PC já feito.
- **NFR-2 (Não-regressão):** EPIC-16 e EPIC-17 (conciliação soft-delete) devem continuar funcionando.
- **NFR-3 (Padrão único):** todas as entidades financeiras usam o MESMO padrão de soft-delete sincronizado — sem tombstones locais por-navegador como mecanismo principal.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Reconciliação altera dado errado | Backup do PC + snapshot + validação de saldo (19.5 AC) |
| Regressão na conciliação (EPIC-17) | NFR-2 + QA cross-device (19.6) |
| Dedupe de extrato perde conciliações | Re-vínculo obrigatório (19.4 FR-19.4.3 + AC3) |
| Realtime não propaga DELETE | 19.6 FR-19.6.2 (REPLICA IDENTITY FULL) |

## Fluxo de Trabalho

```
@pm cria épico (✓) → @sm draft (por story) → @po valida → @data-engineer (19.1, 19.5) + @dev (19.2, 19.3, 19.4) → @qa gate (19.6) → @devops deploya (snapshot antes de 19.1/19.5)
```

## Métricas de Sucesso

- 0 exclusões que "não propagam" (contas, conciliação, extratos).
- Saldo idêntico (1.174,25) em todos os PCs.
- Número de extratos recuperados idêntico em todos os PCs.
- 0 perda de dados (backup + snapshots).
- Fim da reincidência: padrão único de soft-delete sincronizado em todas as entidades financeiras.

---

*EPIC criado por Morgan (@pm) a partir dos handoffs de Atlas (@analyst) e Dara (@data-engineer), 2026-06-09. Continuação do EPIC-17 (que resolveu só a conciliação). Handoffs: `.aiox/handoffs/handoff-dataeng-to-pm-3-problemas-sync-20260609.yaml`.*
