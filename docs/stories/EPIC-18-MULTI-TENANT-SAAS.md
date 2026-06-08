# EPIC-18: Multi-Tenant SaaS — Fase 0 (Supabase Auth + RLS)

## Contexto

O sistema **Caixa Escolar** (marca Licit-AIX) foi construído single-tenant (uso interno Lariucci) e será **vendido como SaaS por assinatura** para empresas semelhantes. Hoje o isolamento entre empresas **não existe de forma segura**: a RLS foi revertida para permissiva (`USING(true)`, migration 022, reafirmada na 028), o frontend usa a anon key pública, e a identidade vem de `localStorage` (spoofável).

**Fonte de verdade (arquitetura):** `docs/architecture/FASE-0-MULTI-TENANT-AUTH-RLS.md` (@architect Aria, 2026-06-08), validada por varredura de código + **auditoria adversarial (61 agentes, 818 verificações, 27 achados confirmados: 7 CRITICAL + 9 HIGH)**.

**Natureza do problema:** risco **latente** — não explorável hoje (só existe 1 tenant), mas que se materializa em **breach de dados financeiros/fiscais** no instante em que um segundo cliente entrar no banco compartilhado. É a maior peça de engenharia do projeto (risco ALTO).

## Objetivo

Transformar o Caixa Escolar em **multi-tenant real (Caminho B)**: cada empresa cliente isolada por `empresa_id` via **Supabase Auth + RLS estrita**, cobrindo **todos os módulos** (Home, Radar, IntelPreços, GDP, Configurações) e **ambos os mecanismos de persistência** (tabelas dedicadas + `sync_data`) — **sem interromper o uso atual da Lariucci**.

## Decisões do Stakeholder (2026-06-08)

- **Caminho B (multi-tenant real)**, NÃO o Caminho A (instância isolada). Aceita levar mais tempo para evitar retrabalho de migração.
- **Produção continua em uso e recebendo ajustes/correções em PARALELO** durante toda a construção. Multi-tenant é construído em **staging** (branch dedicada).
- **A Lariucci vira o "tenant nº 1"** na virada — dados carimbados com `empresa_id` real, nada apagado.
- **Nenhuma venda de segundo tenant** até os 5 gates de segurança (Seção 5 da arquitetura) serem PROVADOS em teste de penetração automatizado.

## Modelo de trabalho em DUAS TRILHAS (decisão do stakeholder)

| Trilha | Branch | Ambiente | Conteúdo |
|--------|--------|----------|----------|
| **Produção (contínua)** | `master` | Produção Vercel/Supabase atual | Correções e melhorias de funções existentes (ex.: Story 17.8). NÃO exige Auth/RLS. |
| **Multi-tenant (EPIC-18)** | `feature/multi-tenant` | Staging (Supabase + Vercel novos) | As stories 18.x abaixo. Só toca produção na virada (18.9). |

**Regra de ouro do paralelo:** nenhuma correção de produção deve introduzir NOVO `empresa_id:'LARIUCCI'` literal ou nova chave em `sync_data` sem registrar — gate `grep "'LARIUCCI'"` + revisão de novas `cloudSave` no pre-push. Mesclar produção→`feature/multi-tenant` periodicamente.

## Fundação que JÁ EXISTE (reaproveitável — reduz esforço)

| Artefato | Migration | Estado |
|----------|-----------|--------|
| Tabela `empresas` | 001 | ✅ existe |
| Tabela `user_empresa` (user_id→empresa_id, role) | 009/020 | ✅ existe, RLS própria |
| Função `get_user_empresa_id()` | 009 | ✅ existe (SECURITY DEFINER) |
| Políticas `*_isolation` dual-mode | 009/020 | ⚠️ escritas, revertidas pela 022 |
| `empresa_id` em todas as tabelas de negócio | 001+ | ✅ existe |

## Estratégia de Sequenciamento (SEGURANÇA + SEM DOWNTIME é o driver)

```
18.1 staging ──► 18.2 Auth ──► 18.3 Bearer token ──► 18.4 RLS (tabelas+sync_data+audit_log) ──► 18.4b config sensível
   [base]          [L]            [L, Alto]              [L, Alto]                                  [M, Alto]
                                                              │
        18.5 cache tenant-aware ──┤ 18.6 remover LARIUCCI (+portais) ──► 18.7 migração Lariucci→tenant 1
                                  └─► 18.8 teste de penetração (2 tenants fictícios) ──► 18.9 virada produção + rollback
                                                                                          [GATE de venda]
```

**Auth (18.2/18.3) e RLS (18.4) devem ir no MESMO deploy atômico na virada** — a dessincronia foi exatamente a causa do revert da migration 022.

---

## STORY 18.1 — Provisionar ambiente de staging + branch [BASE]

**Resolve:** pré-requisito de todo o épico (ambiente isolado que não afeta produção).
**Executor:** @devops
**Complexidade:** S | **Risco:** Baixo | **Prioridade:** P0
**Depende de:** —

**Critérios de Aceitação:**
- **AC1:** Projeto **Supabase de staging** criado, com cópia do schema (migrations 001-028) e **dados de exemplo** (NÃO os dados reais da Lariucci).
- **AC2:** **Deploy de staging** na Vercel (preview/branch separado), apontando para o Supabase de staging.
- **AC3:** Branch `feature/multi-tenant` criada a partir de `master`.
- **AC4 (não-regressão):** produção (master + Supabase/Vercel atuais) permanece intocada.

---

## STORY 18.2 — Migrar login para Supabase Auth [P0]

**Resolve:** o gap central — sem `auth.uid()` não há RLS real (arquitetura 1.2, 2.2).
**Executor:** @dev (impl.) — base de autenticação
**Complexidade:** L | **Risco:** Médio | **Prioridade:** P0
**Depende de:** 18.1

**Critérios de Aceitação:**
- **AC1:** Login do dashboard passa a usar **Supabase Auth** (email/senha ou magic link), emitindo JWT com `auth.uid()`.
- **AC2:** Usuários atuais (ex.: angela, lariucci) migrados para `auth.users` + vinculados via `user_empresa` ao tenant da Lariucci — sem perder acesso.
- **AC3:** Sessão deixa de depender de `sessionStorage['ce.auth']` como fonte de identidade para autorização.
- **AC4:** `getEmpresaId()` passa a resolver o tenant do **perfil autenticado** (não mais fallback localStorage) — preparação para 18.6.
- **AC5 (escopo):** considerar os portais externos (`gdp-portal.html`, `gdp-entregador.html`) — definir se entram nesta story ou em 18.6 (têm login próprio por código de acesso).

---

## STORY 18.3 — Propagar access token (Bearer) em todas as chamadas REST [P0]

**Resolve:** hoje todas as ~56 chamadas usam a anon key como Bearer → RLS por usuário é impossível (auditoria F01/AUD-002).
**Executor:** @dev
**Complexidade:** L | **Risco:** ALTO | **Prioridade:** P0
**Depende de:** 18.2

**Critérios de Aceitação:**
- **AC1:** TODAS as chamadas REST ao Supabase enviam `Authorization: Bearer <access_token do usuário>` — `apikey: anon` permanece SÓ no header `apikey`. Arquivos: `gdp-api.js`, `app-sync.js`, `gdp-core.js`, `gdp-realtime.js`, `sync-pedidos.js`, `sync-entregas.js`.
- **AC2:** Realtime (WebSocket) reconecta com o token do usuário.
- **AC3:** Renovação de token (refresh) tratada — sessão não expira no meio do uso.
- **AC4 (verificação):** com RLS estrita ligada em staging, todas as operações de leitura/escrita/realtime continuam funcionando para o usuário autenticado.

---

## STORY 18.4 — Reativar RLS estrita em todas as tabelas + sync_data + audit_log [P0]

**Resolve:** o bloqueador absoluto de venda (arquitetura 2.3; auditoria F01/F02/F04/F07/F09).
**Executor:** @data-engineer (DDL/RLS) + @dev (integração)
**Complexidade:** L | **Risco:** ALTO | **Prioridade:** P0
**Depende de:** 18.2, 18.3

**Critérios de Aceitação:**
- **AC1:** RLS `tenant_isolation` (`USING/WITH CHECK empresa_id = get_user_empresa_id()`) ativa em TODAS as tabelas dedicadas: `contratos, pedidos, notas_fiscais, nf_counter, clientes, entregas, extratos, conciliacoes, caixa_config, contas_receber, contas_pagar, produtos, resultados_orcamento, radar_equivalencias, data_snapshots, preco_historico, estoque_simples`.
- **AC2:** `sync_data` recebe `ENABLE ROW LEVEL SECURITY` com isolamento real por tenant via Auth (não filtro client-side por `user_id`). Cobre as **31 chaves** mapeadas (Notas de Entrada, Fornecedores, Estoque, Central de Produtos, etc.).
- **AC3:** `audit_log`: nunca gravável por anon; leitura restrita por tenant.
- **AC4:** anon **sem acesso** a dados de negócio (políticas `anon_full_access` removidas das tabelas de negócio).
- **AC5 (não quebrar o sync — o erro da 020):** com Auth (18.2/18.3) ativo, o sync funciona normalmente sob RLS estrita em staging. Auth+RLS devem poder ir juntos no deploy atômico da virada.

> **Delegado ao @data-engineer:** DDL detalhado das políticas, reverter a 022, depurar a 020. Migration nova (ex.: 029).

---

## STORY 18.4b — Config sensível (bancária/fiscal/API) fora do sync_data + rotação [P0]

**Resolve:** `sync_data` carrega credenciais bancárias/fiscais sob anon key (auditoria F02/AUD-003 — exposição de credencial, não só dado).
**Executor:** @data-engineer + @dev
**Complexidade:** M | **Risco:** ALTO | **Prioridade:** P0
**Depende de:** 18.4

**Critérios de Aceitação:**
- **AC1:** `nexedu.config.contas-bancarias`, `nexedu.config.bank-api`, `nexedu.config.notas-fiscais` **deixam de trafegar** por `sync_data` sob anon key → migram para tabela dedicada com RLS OU Edge Function com `service_role`.
- **AC2:** Credenciais/segredos que estiveram acessíveis via anon key são **auditados e rotacionados**.
- **AC3 (verificação):** nenhuma credencial sensível legível por uma sessão de outro tenant.

---

## STORY 18.5 — Cache e boot merge tenant-aware [P1]

**Resolve:** cache não distingue tenant; re-empurra dados (incidente "fantasmas" 06-07/06; auditoria F0008).
**Executor:** @dev
**Complexidade:** M | **Risco:** Médio | **Prioridade:** P1
**Depende de:** 18.3

**Critérios de Aceitação:**
- **AC1:** Cache localStorage de TODOS os módulos (`gdp.*`, `intel.*`, `radar.*`, `caixaescolar.*`) namespaceado por `empresa_id` OU **purgado** no login/logout/troca de tenant.
- **AC2:** Boot merge tenant-aware: nunca re-enviar itens de outro tenant nem itens já soft-deletados.
- **AC3 (não-regressão):** a SAFETY anti-vazio (não apagar cache quando Supabase offline) é preservada.

---

## STORY 18.6 — Remover fallback LARIUCCI fixo + seeds + portais [P1]

**Resolve:** identidade hardcoded; portais escrevem `empresa_id:'LARIUCCI'` literal (auditoria F0006/AUD-005).
**Executor:** @dev
**Complexidade:** M | **Risco:** Médio | **Prioridade:** P1
**Depende de:** 18.4

**Critérios de Aceitação:**
- **AC1:** Removido o fallback fixo `'LARIUCCI'` de `getEmpresaId()` e os seeds hardcoded (app-state.js, restore-conciliacao.html, etc.).
- **AC2:** Portais `gdp-portal.html` e `gdp-entregador.html` deixam de escrever `empresa_id:'LARIUCCI'` literal via REST — passam a usar a identidade autenticada.
- **AC3 (gate):** `grep "'LARIUCCI'"` no código de produção retorna **0** ocorrências de uso como identidade.

---

## STORY 18.7 — Migração de dados: Lariucci → tenant nº 1 [P0]

**Resolve:** carimbar os dados existentes com o `empresa_id` real + normalizar identidade (auditoria F03/F0006).
**Executor:** @data-engineer
**Complexidade:** M | **Risco:** ALTO | **Prioridade:** P0
**Depende de:** 18.4

**Critérios de Aceitação:**
- **AC1:** Registro da empresa Lariucci em `empresas`; usuários no Auth; `user_empresa` populado.
- **AC2:** `UPDATE` carimbando `empresa_id` canônico em todas as linhas existentes (hoje `'LARIUCCI'`) — **nada apagado**.
- **AC3:** Identidade do `sync_data` deduplicada/normalizada (o `user_id` atual é colidível) antes de ligar RLS.
- **AC4 (pré-RLS):** garantir `empresa_id NOT NULL` em toda linha de toda tabela antes de ativar a RLS estrita.

> **Delegado ao @data-engineer.** Ensaiar primeiro em staging.

---

## STORY 18.8 — Teste de penetração de tenant (automatizado, 2 tenants) [GATE]

**Resolve:** provar — não presumir — o isolamento (arquitetura Seção 5; auditoria F0.8).
**Executor:** @qa + @dev
**Complexidade:** M | **Risco:** — | **Prioridade:** P0 (gate de venda)
**Depende de:** 18.4..18.7

**Critérios de Aceitação:**
- **AC1:** Em staging, seed de **DOIS tenants fictícios** (FAKE-A, FAKE-B) com dados em todos os módulos.
- **AC2:** Provado que FAKE-A logado **NÃO** lê nem escreve dados de FAKE-B em **NENHUMA** tabela dedicada **nem** chave do `sync_data`, em todos os módulos (GDP, Radar, IntelPreços).
- **AC3:** O teste é **versionado como script automatizado** (reexecutável a cada mudança).
- **AC4:** Os 5 gates de segurança da arquitetura (Seção 5) estão todos verdes.

---

## STORY 18.9 — Virada em produção + rollback [GATE FINAL]

**Resolve:** levar o multi-tenant a produção sem downtime, com a Lariucci como tenant nº 1.
**Executor:** @devops
**Complexidade:** S | **Risco:** ALTO | **Prioridade:** P0
**Depende de:** TODAS

**Critérios de Aceitação:**
- **AC1:** Snapshot do Supabase de produção imediatamente antes.
- **AC2:** Pré-check executado: 100% das requests autenticadas, `user_empresa` populado, `empresa_id NOT NULL` em toda linha.
- **AC3:** Deploy atômico: Auth (18.2/18.3) + RLS (18.4) + migração (18.7) juntos.
- **AC4:** Validação pós-corte: você + Angela logam, veem todos os dados, sync funciona, realtime funciona.
- **AC5:** Rollback pronto e testado (reverter para 022 permissivo + deploy anterior) se o sync quebrar. Janela: noite/fim de semana.

---

## Gates de Segurança — critérios de SAÍDA do épico (inegociável)

Antes de habilitar a venda de **qualquer segundo tenant**, TODOS devem estar PROVADOS (não presumidos):

1. RLS estrita ativa em todas as tabelas de negócio **E** no `sync_data`.
2. Supabase Auth com usuário→empresa via `user_empresa` (identidade não vem do localStorage).
3. Anon key sem acesso a dados de negócio.
4. Teste de penetração (18.8) verde em todos os módulos.
5. Cache isolado/limpo por tenant.

> Enquanto a política for `USING(true)`, o produto NÃO está apto a multi-cliente.

## Delegação (matriz de autoridade)

| Trabalho | Agente |
|----------|--------|
| Criar stories detalhadas (draft) | @sm |
| Validar stories | @po |
| DDL/RLS, migração de dados (18.4, 18.4b, 18.7) | @data-engineer |
| Implementação frontend (18.2, 18.3, 18.5, 18.6) | @dev |
| Teste de penetração (18.8) | @qa + @dev |
| Provisionar staging, virada, rollback (18.1, 18.9) | @devops |

## Priorização — Caminho Crítico (2026-06-08)

**Caminho crítico (série — define o prazo até a venda):** 18.1 → 18.2 → 18.3 → 18.4 → 18.7 → **18.8 (GATE: libera venda)** → 18.9.

**Paralelizáveis (não atrasam a venda):** 18.4b (junto com 18.4), 18.5 (junto com 18.4), 18.6 (após 18.4, junto com 18.5).

**Bloqueadores de venda (100% obrigatório):** 18.1, 18.2, 18.3, 18.4, 18.4b, 18.7, 18.8, 18.9.
**Robustez (folga maior):** 18.5, 18.6.

**Início com risco ZERO à produção:** Story 18.1 (staging não toca o sistema em uso).

> Guia de retomada e textos prontos para começar: `docs/stories/EPIC-18-COMO-COMECAR.md`.

## Change Log

- 2026-06-08 — @pm Morgan — EPIC-18 criado a partir de `docs/architecture/FASE-0-MULTI-TENANT-AUTH-RLS.md` (validado por varredura + auditoria adversarial de 61 agentes). 10 stories (18.1-18.9 + 18.4b), duas trilhas (produção paralela + multi-tenant em staging), gates de segurança como critério de saída.
- 2026-06-08 — @pm Morgan — Priorização adicionada (caminho crítico de 7 stories até o gate de venda; 3 paralelizáveis; classificação bloqueador vs. robustez). Guia de retomada `EPIC-18-COMO-COMECAR.md` criado.
