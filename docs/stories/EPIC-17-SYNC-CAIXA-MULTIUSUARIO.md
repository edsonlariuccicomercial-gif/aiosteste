# EPIC-17: Sincronização do Caixa Multiusuário (Uma Empresa, Um Caixa)

## Contexto

O caixa diverge entre navegadores/usuários da **mesma empresa**. No navegador da Angela o saldo está correto; no do Edson o saldo mostra **apenas o saldo inicial** e **161 lançamentos aparecem na lista mas não entram no cálculo**.

Diagnóstico completo com causa-raiz por evidência de código: `docs/briefs/brief-sync-caixa-multiusuario.md` (@analyst Atlas, 2026-06-06).

**Natureza do problema:** este é um problema de **dados em produção** combinado com código, NÃO apenas código. As 3 causas-raiz são **pré-existentes** (não regressão do EPIC-16).

## Objetivo

Garantir que todos os usuários da mesma empresa vejam **exatamente o mesmo caixa** (lançamentos, saldo e saldo inicial), eliminando a divergência por navegador/usuário/máquina — sem perder dados existentes.

## Decisões do Stakeholder (Edson — 2026-06-06)

- **REGRA DE OURO (refinada):** **o sistema é UM só.** Independente de login/usuário/senha, toda e qualquer mudança em qualquer módulo ou sessão deve refletir para TODOS, sincronizada em tempo real. → Implica **um único `empresa_id` fixo para todo o sistema**, não dependente do usuário.
- **Fonte da verdade:** o **caixa da Angela (correto)** vira o caixa oficial único. Todos — inclusive Edson — passam a ver esse.
- **Saldo inicial:** **sincronizado** (propriedade da conta da empresa, não do navegador).
- **Estratégia:** **17.0 (diagnóstico) primeiro** para achar o `empresa_id` da Angela; depois @dev fixa no código.
- **Escopo reduzido pós-incidente:** o banco está ÍNTEGRO (corrupção era só de tela). NÃO há migração de dados corrompidos. A 17.2 vira "apontar todos para o empresa_id da Angela" — sem reparar dados, só unificar a identidade.
- **Acesso ao banco:** @data-engineer prepara as queries read-only; **o stakeholder as executa** no SQL Editor do Supabase e devolve o resultado. Sem credencial de banco na sessão.

## Causas-Raiz (do brief)

| Causa | Descrição | Sintomas | Story |
|-------|-----------|----------|-------|
| **A** | `empresa_id` divergente: `getEmpresaId()` resolve por fallback (`syncUserId\|\|nome\|\|cnpj\|\|LARIUCCI`) → usuários leem/gravam partições diferentes no Supabase | S1, S2, S4 | 17.1 (código) + 17.2 (migração) |
| **B** | Fonte dupla no saldo: `getCaixaResumo` usa `loadConciliacao` ou fallback legado `caixaExtratoMovimentos`; `loadConciliacao` só lê localStorage, sem backfill | S3 | 17.3 |
| **C** | Saldo inicial só no localStorage (`nexedu.config.contas-bancarias`), nunca sincronizado | S2 | 17.4 |

## Estratégia de Sequenciamento (RISCO É O DRIVER)

Este épico **não** segue ordem por valor — segue ordem por **risco de dados**. Diagnosticar antes de migrar; migrar antes de prevenir.

```
17.0 DIAGNÓSTICO (read-only) ──► 17.1 empresa_id único (código) ──► 17.2 MIGRAÇÃO de dados ──► 17.3 fonte única + backfill ──► 17.4 saldo inicial sync
     [bloqueia tudo]                  [P0]                            [P0, depende de 17.0+17.1]    [P1]                      [P1]
```

---

## STORY 17.0 — Diagnóstico de Produção (Read-Only) [BLOQUEANTE]

**Resolve:** pré-requisito de todas as demais
**Prioridade:** P0 — BLOQUEIA o épico
**Risco:** NENHUM (read-only) | **Complexidade:** S
**Executor:** @data-engineer

### Descrição
Antes de tocar qualquer dado, mapear o estado real em produção: quais `empresa_id` existem e quantos registros há sob cada um. Isso define a estratégia de migração (qual id é o canônico, quais precisam ser mesclados).

### Requisitos Funcionais
- **FR-17.0.1:** Executar (read-only) no Supabase de produção:
  - `SELECT empresa_id, count(*) FROM conciliacoes GROUP BY empresa_id ORDER BY count(*) DESC;`
  - Idem para `contas_receber`, `contas_pagar`, `pedidos`.
- **FR-17.0.2:** Identificar o `empresa_id` canônico (provavelmente o que tem os dados corretos da Angela) e os divergentes (ex.: `LARIUCCI` vs nome vs cnpj).
- **FR-17.0.3:** Documentar a contagem e o plano de merge em `docs/qa/EPIC-17-diagnostico-producao.md`.

### Critérios de Aceitação
- **AC1:** Tabela de `empresa_id` × contagem documentada para conciliacoes, contas_receber, contas_pagar, pedidos.
- **AC2:** `empresa_id` canônico identificado e justificado.
- **AC3:** Estratégia de merge definida (de quais ids para o canônico).

### Escopo
- **IN:** queries read-only, documentação do estado e do plano.
- **OUT:** qualquer escrita/migração (é 17.2).

### Dependências
Nenhuma. **Bloqueia 17.1, 17.2, 17.3, 17.4.**

---

## STORY 17.1 — `empresa_id` Único e Determinístico (Código)

**Resolve:** Causa A (prevenção de novas divergências)
**Prioridade:** P0
**Risco:** MÉDIO | **Complexidade:** M
**Executor:** @dev

### Descrição
Garantir que todos os usuários da mesma empresa resolvam o **mesmo `empresa_id` canônico**, eliminando o fallback frágil por navegador.

### Requisitos Funcionais
- **FR-17.1.1:** Definir o `empresa_id` canônico no login (vinculado à EMPRESA, não ao usuário). Todos os logins da mesma empresa → mesmo id.
- **FR-17.1.2:** `getEmpresaId()` deve priorizar o id canônico definido no login; o fallback `nome`/`cnpj`/`LARIUCCI` vira último recurso com alerta.
- **FR-17.1.3:** Persistir `nexedu.empresa.syncUserId` de forma consistente após login (não depender de estado prévio do navegador).
- **FR-17.1.4:** Reconectar o realtime (`reconnectWithNewId`) quando o id é resolvido/corrigido.

### Critérios de Aceitação
- **AC1:** *Given* Angela e Edson logam na mesma empresa, *When* o sistema resolve `getEmpresaId()`, *Then* ambos obtêm o MESMO `empresa_id`.
- **AC2:** *Given* um navegador novo/limpo, *When* o usuário loga, *Then* o `empresa_id` canônico é definido sem cair em fallback divergente.
- **AC3:** Nenhum usuário da empresa resolve para `LARIUCCI` por acidente quando há id canônico.

### Escopo
- **IN:** lógica de resolução de `empresa_id`, login, persistência consistente.
- **OUT:** migração de dados já gravados (17.2).

### Arquivos
- `gdp-api.js` (`getEmpresaId` L37-61), `login.html`, `gdp-realtime.js` (`reconnectWithNewId`)

### Dependências
**Bloqueada por 17.0** (precisa saber o id canônico).

---

## STORY 17.2 — Migração de Dados: Reconciliar `empresa_id` Divergentes [CRÍTICA]

**Resolve:** Causa A (correção dos dados já gravados)
**Prioridade:** P0
**Risco:** ALTO (escreve em produção) | **Complexidade:** M
**Executor:** @data-engineer

### Descrição
Reconciliar os registros já gravados sob `empresa_id` divergentes para o id canônico, para que os dados existentes (inclusive os 161 lançamentos do Edson) passem a ser vistos por todos.

### Requisitos Funcionais
- **FR-17.2.1:** Migrar registros de `conciliacoes`, `contas_receber`, `contas_pagar`, `pedidos` dos `empresa_id` divergentes → id canônico (conforme plano da 17.0).
- **FR-17.2.2:** Tratar conflitos de ID/duplicatas (se o mesmo lançamento existir sob 2 ids) sem perder nem duplicar dados.
- **FR-17.2.3:** Migração reversível ou com backup imediatamente antes.

### Critérios de Aceitação
- **AC1:** *Given* a migração executada, *When* Angela e Edson abrem o caixa, *Then* ambos veem o MESMO conjunto de lançamentos.
- **AC2:** Nenhum dado da Angela (hoje correto) é perdido.
- **AC3:** Os 161 lançamentos passam a contabilizar para todos.
- **AC4:** Contagem total de registros pós-migração = soma esperada (sem perda nem duplicação).

### Escopo
- **IN:** migração SQL/script dos dados, validação de contagem.
- **OUT:** lógica de código (17.1, 17.3).

### Dependências
**Bloqueada por 17.0 e 17.1.** Exige **snapshot Supabase imediatamente antes** (@devops).

### Riscos
ALTO — escrita em produção. Snapshot + plano de rollback obrigatórios. Janela fora de pico.

---

## STORY 17.3 — Fonte Única do Caixa + Backfill do Supabase

**Resolve:** Causa B (S3 — visível mas não conta)
**Prioridade:** P1
**Risco:** MÉDIO | **Complexidade:** M
**Executor:** @dev

### Descrição
Eliminar a fonte dupla: renderização e cálculo do saldo devem ler a MESMA fonte; e `loadConciliacao` deve fazer backfill do Supabase no primeiro load.

### Requisitos Funcionais
- **FR-17.3.1:** Em `getCaixaResumo`, eliminar o fallback `caixaExtratoMovimentos` (ou garantir que nunca seja usado quando há dados reais). Render e cálculo leem `loadConciliacao`.
- **FR-17.3.2:** `loadConciliacao` faz backfill do Supabase no primeiro load (hoje só localStorage), para navegador novo/limpo não cair em fonte legada.
- **FR-17.3.3:** Garantir que lançamentos visíveis = lançamentos contabilizados (sem discrepância render vs soma).

### Critérios de Aceitação
- **AC1:** *Given* um navegador novo sem cache, *When* abre o caixa, *Then* os lançamentos vêm do Supabase (backfill) e o saldo bate.
- **AC2:** *Given* lançamentos visíveis na lista, *When* o saldo é calculado, *Then* TODOS contabilizam (visível = contado).
- **AC3:** Não há mais cenário "161 visíveis, saldo = só inicial".

### Escopo
- **IN:** `getCaixaResumo` fonte única, `loadConciliacao` backfill.
- **OUT:** empresa_id (17.1/17.2), saldo inicial (17.4).

### Arquivos
- `gdp-pedidos.js` (`getCaixaResumo`, `renderCaixa`), `gdp-core.js` (`loadConciliacao`, boot, `caixaExtratoMovimentos`)

### Dependências
**Bloqueada por 17.0.** Recomendada após 17.1/17.2 (dados já reconciliados).

---

## STORY 17.4 — Saldo Inicial Sincronizado

**Resolve:** Causa C (S2 — saldo inicial diverge)
**Prioridade:** P1
**Risco:** BAIXO | **Complexidade:** S
**Executor:** @dev (com @data-engineer se exigir tabela nova)

### Descrição
O saldo inicial da conta deve ser propriedade da empresa, sincronizado, não por-navegador.

### Requisitos Funcionais
- **FR-17.4.1:** Migrar o `saldo_inicial` da conta padrão (`nexedu.config.contas-bancarias`) para um registro sincronizado no Supabase, scoped por `empresa_id`.
- **FR-17.4.2:** `getCaixaResumo` lê o saldo inicial da fonte sincronizada.
- **FR-17.4.3:** Editar o saldo inicial em um navegador reflete em todos.

### Critérios de Aceitação
- **AC1:** *Given* Edson define o saldo inicial, *When* Angela abre o caixa, *Then* ela vê o mesmo saldo inicial.
- **AC2:** Saldo inicial não é mais por-navegador.

### Escopo
- **IN:** sincronização do saldo inicial.
- **OUT:** lançamentos (17.3), empresa_id (17.1/17.2).

### Arquivos
- `gdp-pedidos.js` (`getCaixaResumo` leitura do saldo inicial), `gdp-api.js` (nova entidade/registro), config de contas bancárias

### Dependências
**Bloqueada por 17.0 e 17.1** (precisa do empresa_id canônico para scope).

---

## Sequenciamento Recomendado (REVISADO após diagnóstico real)

O diagnóstico (17.0) e a investigação de persistência (brief causa-raiz) revisaram o épico:
- 17.0 ✅ Done (banco unificado em LARIUCCI; sem migração de empresa_id necessária).
- 17.1, 17.2 ❌ CANCELADAS (empresa_id já unificado — não é a causa).
- 17.3 ✅ Done (fonte única + filtro empresa_id defensivo; deployada).
- **Fase 1 real = 17.5 + 17.6 + 17.7** (correção de persistência — causa-raiz verdadeira).

```
FASE 1 (código): 17.5 (saldo inicial sync) ║ 17.6 (tombstone sync) ║ 17.7 (convergência cache)
   └─► FASE 2: RESET (marco zero 02/06 = R$10.949,40; zera conciliacoes+extratos, backup antes)
          └─► FASE 3: stakeholder reconcilia extrato 02/06→hoje
```

## Stories da Fase 1 (Persistência — causa-raiz)

| Story | Resolve | Executor | Risco |
|-------|---------|----------|-------|
| **17.5** — Saldo inicial sincronizado | FR-A (saldo diverge por navegador) | @data-engineer + @dev | MÉDIO (tabela nova) |
| **17.6** — Tombstone de exclusão sincronizado | FR-B (contagem 147 vs 186) | @data-engineer + @dev | MÉDIO |
| **17.7** — Convergência de cache no boot | FR-C (dados somem/divergem) | @dev | MÉDIO |

## Requisitos Não-Funcionais

- **NFR-1 (Dados):** snapshot Supabase obrigatório antes da 17.2 (migração). Plano de rollback documentado.
- **NFR-2 (Não perder Angela):** a conta hoje correta não pode perder dados.
- **NFR-3 (Não-regressão):** EPIC-16 (vínculo/estorno/persistência) deve continuar funcionando após a reconciliação.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Migração mescla/perde dados | 17.0 diagnóstico antes + snapshot + validação de contagem (17.2 AC4) |
| Quebrar conta da Angela | NFR-2 + AC2 da 17.2 |
| Novo navegador cair em fonte legada | 17.3 backfill |
| empresa_id mudar e quebrar realtime | 17.1 FR-17.1.4 reconnect |

## Fluxo de Trabalho

```
@pm cria épico (✓) → @sm draft → @po valida → @data-engineer (17.0/17.2) + @dev (17.1/17.3/17.4) → @qa gate → @devops deploya (snapshot antes da 17.2)
```

## Métricas de Sucesso

- Angela e Edson veem o MESMO saldo e os MESMOS lançamentos.
- 0 lançamentos "visíveis mas não contabilizados".
- Saldo inicial idêntico em todos os navegadores.
- 0 perda de dados na migração (contagem pré = pós).

---

*EPIC criado por Morgan (@pm) a partir do brief de Atlas (@analyst). Handoff: `.aiox/handoffs/handoff-analyst-to-pm-sync-20260606.yaml`.*
