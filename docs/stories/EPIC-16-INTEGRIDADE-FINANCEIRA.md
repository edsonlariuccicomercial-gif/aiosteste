# EPIC-16: Integridade Financeira Transacional + Persistência de Pedidos

## Contexto

O sistema GDP apresenta uma **quebra de integridade transacional** entre três tabelas financeiras independentes (`conciliacoes` = caixa, `contas_receber`, `contas_pagar`) e uma **race condition de sincronização realtime** que reverte edições de pedidos.

Diagnóstico completo com causa-raiz por evidência de código: `docs/briefs/brief-financeiro-pedidos-persistencia.md` (@analyst Atlas, 2026-06-06).

A regra de negócio do stakeholder (fonte da verdade) descreve uma **"relação perfeita entre as páginas"** que **não existe no código hoje** — não é um bug isolado, é integridade transacional ausente.

## Objetivo

Estabelecer integridade transacional entre Caixa ↔ Contas a Receber/Pagar ↔ Conciliação, com estorno obrigatório, persistência confiável e propagação correta para os relatórios (DRE, Fluxo de Caixa, Entradas/Saídas por Categoria). Eliminar a race condition que reverte edições de pedidos.

## Decisões do Stakeholder (Edson — 2026-06-06)

- **Estorno = bloqueio rígido (sem override):** exclusão direta no caixa é **proibida** para lançamentos originados de CR/CP ou conciliação. Somente o botão **"Estornar"** remove o lançamento, devolvendo a conta à pendência original.
- **Estrutura = épico único** cobrindo as 4 Frentes.

## Arquitetura Atual (AS-IS)

```
Contas a Receber ──┐
                   ├── (SEM VÍNCULO) ── Caixa (conciliacoes)
Contas a Pagar ────┘                         │
                                             └── Relatórios (DRE/Fluxo/Categoria) [dados inconsistentes]

Extrato ── conciliação ── (re-sync sobrescreve marca local) ── pendências fantasma

Pedido (edição status/data) ── savePedidos() fire-and-forget ── webhook realtime stale ── REVERTE edição
```

## Arquitetura Proposta (TO-BE)

```
Baixa em CR/CP (manual OU conciliação) ──► cria lançamento em conciliacoes com vinculado_a
                                              │
Estornar lançamento ──► volta conta a "pendente" na origem ──► remove lançamento (única via de exclusão)
                                              │
                                              ▼
                          Relatórios leem fonte unificada e consistente

Edição de pedido ──► updated_at síncrono ANTES do webhook ──► dirty-window protege status/dataPrevista ──► persiste
```

## Tabela Sintoma → Causa → Story

| Sintoma (brief) | Causa-raiz | Story |
|-----------------|-----------|-------|
| A3, A4, A5 — baixa manual não vira lançamento; some sem estorno; CR/CP não reflete no caixa | Vínculo transacional e regra de estorno **inexistentes** | **16.1** |
| A1, A2 — lançamento conciliado some; pendências fantasma; erro de valor | Tombstone separado + re-sync sobrescreve marca `conciliado` + recuperação de órfãos pulada | **16.2** |
| B1, B2 — status/data revertem sozinhos; "faturar" não seta "faturado" | Race condition realtime (dirty window aceita registro stale) + save fire-and-forget | **16.3** |
| Relatórios inconsistentes | Consequência de A1-A5 | **16.4** |

---

## STORY 16.1 — Vínculo Transacional Caixa ↔ Contas + Estorno Obrigatório

**Resolve:** A3, A4, A5
**Prioridade:** P0 (fundação — demais stories dependem deste vínculo)
**Risco:** ALTO (toca fluxo financeiro core em produção)
**Complexidade:** L (Large)

### Descrição
Hoje não existe função que crie um registro em `conciliacoes` quando uma conta é baixada em CR/CP, nem regra que proteja a exclusão de lançamentos. As tabelas são desacopladas.

### Requisitos Funcionais
- **FR-16.1.1:** Ao dar baixa em Conta a Receber (status → `recebido`) ou Conta a Pagar (status → `pago`), criar automaticamente um lançamento em `conciliacoes`:
  - `tipo`: `credito` (CR) ou `debito` (CP)
  - `valor`, `data`, `descricao` herdados da conta
  - `vinculado_a`: ID da conta-fonte (coluna já existe no schema — migration 018)
  - `categoria_dre` herdada da categoria da conta
- **FR-16.1.2:** O vínculo vale para baixa **manual** E baixa **via conciliação** de extrato.
- **FR-16.1.3:** **Estorno obrigatório (bloqueio rígido):** quando um lançamento do caixa tem `vinculado_a` preenchido, a exclusão direta é **bloqueada**. A UI exibe somente o botão **"Estornar"**.
- **FR-16.1.4:** Ao **Estornar**: a conta-fonte volta ao status `pendente` na página de origem (CR/CP), e só então o lançamento é removido do caixa (operação atômica).
- **FR-16.1.5:** Lançamentos manuais ("+ Incluir Lançamento", sem `vinculado_a`) continuam podendo ser excluídos diretamente.

### Critérios de Aceitação (Given/When/Then)
- **AC1:** *Given* uma conta a receber pendente, *When* o gestor dá baixa manual, *Then* um lançamento de crédito aparece no caixa com `vinculado_a` = ID da conta, e persiste após reload.
- **AC2:** *Given* um lançamento do caixa com `vinculado_a`, *When* o gestor tenta excluí-lo diretamente, *Then* a exclusão é bloqueada e apenas "Estornar" é oferecido.
- **AC3:** *Given* um lançamento vinculado, *When* o gestor clica "Estornar", *Then* a conta volta a `pendente` na origem E o lançamento some do caixa.
- **AC4:** *Given* baixa via conciliação de extrato, *When* a conciliação efetiva o match, *Then* o lançamento criado tem `vinculado_a` e segue a mesma regra de estorno.
- **AC5:** *Given* um lançamento manual sem origem, *When* excluído, *Then* a exclusão direta funciona normalmente.

### Escopo
- **IN:** vínculo na baixa, estorno atômico, bloqueio de exclusão, UI do botão Estornar.
- **OUT:** mudanças nos relatórios (Story 16.4), persistência da conciliação de extrato (Story 16.2).

### Arquivos
- `gdp-pedidos.js` (`excluirCaixaLancamentos`, baixa CR/CP, conciliação)
- `gdp-core.js` (persistência conciliacoes)
- `gdp-api.js` (mapeamento `vinculado_a`)
- `supabase/migrations/018_extratos_conciliacoes.sql` (coluna já existe — validar)

### Dependências
Nenhuma (story fundadora).

---

## STORY 16.2 — Persistência da Conciliação de Extrato (anti-fantasma)

**Resolve:** A1, A2
**Prioridade:** P0
**Risco:** ALTO (perda de dados / erro de valor no caixa)
**Complexidade:** M (Medium)

### Descrição
Lançamentos conciliados somem porque o tombstone (`gdp.conciliacao.deleted.v1`) sincroniza separadamente e pode reaplicar deletes antigos; a re-sync da API sobrescreve a marca `conciliado` local; e a recuperação de órfãos é pulada quando qualquer extrato já foi deletado.

### Requisitos Funcionais
- **FR-16.2.1:** Tornar a marca `conciliado` **atômica** entre item do extrato e lançamento do caixa; impedir que `sincronizarExtratoCaixaViaApi`/`conciliarCaixaViaApi` sobrescrevam conciliações locais já efetivadas.
- **FR-16.2.2:** Corrigir a sincronização do tombstone OU migrar para flag `_deleted` embutida no item (decisão técnica → @architect/@dev).
- **FR-16.2.3:** Revisar a condição de recuperação de órfãos (`deletedExtIds.size === 0`) para não pular a recuperação quando algum extrato foi deletado.

### Critérios de Aceitação
- **AC1:** *Given* todos os lançamentos de um extrato conciliados, *When* o gestor entra no caixa após reload, *Then* nenhum lançamento aparece como "pendente fantasma" e os valores batem com o banco.
- **AC2:** *Given* um lançamento conciliado, *When* a página recarrega/re-sincroniza, *Then* o lançamento persiste (não some).
- **AC3:** *Given* um extrato com itens órfãos e outro extrato já deletado, *When* o boot roda, *Then* a recuperação de órfãos ainda executa.
- **AC4:** Valor total do caixa = soma conciliada do extrato (sem divergência por pendência fantasma).

### Escopo
- **IN:** atomicidade da marca conciliado, tombstone, recuperação de órfãos.
- **OUT:** criação do vínculo CR/CP (16.1), relatórios (16.4).

### Arquivos
- `gdp-core.js` (tombstone, órfãos, `cloudLoadAll`)
- `gdp-pedidos.js` (`sincronizarExtratoCaixaViaApi`, `conciliarCaixaViaApi`)
- `gdp-realtime.js` (DEDICATED_TABLE_KEYS para conciliacao)

### Dependências
Recomenda-se após 16.1 (mesma área de código; evita conflito de merge).

---

## STORY 16.3 — Persistência de Pedidos (Race Condition Realtime)

**Resolve:** B1, B2
**Prioridade:** P1 (independente, menor risco — pode ir em paralelo)
**Risco:** MÉDIO (isolado ao módulo pedidos)
**Complexidade:** M (Medium)

### Descrição
Edições de `status` e `dataPrevista` revertem sozinhas: o webhook realtime UPDATE chega na "dirty window" de 5s e aceita o registro stale do Supabase, sobrescrevendo a edição local. O save é fire-and-forget. "Faturar" seta `status = "faturado"` mas a mesma race condition reverte.

### Requisitos Funcionais
- **FR-16.3.1:** Garantir que `updated_at` local seja setado **sincronamente** no momento do save, **antes** de qualquer webhook chegar.
- **FR-16.3.2:** Reforçar a dirty-window em `handleEntityChange` para proteger `status` e `dataPrevista` (campos hoje sem proteção explícita em `salvarPedidoCompleto`).
- **FR-16.3.3:** Confirmar persistência de "faturado" com await/retry; incluir o valor `faturado` no `normalizePedidoStatus`.

### Critérios de Aceitação
- **AC1:** *Given* o gestor altera o status de um pedido, *When* aguarda 30s, *Then* o status permanece alterado (não reverte).
- **AC2:** *Given* o gestor altera a data prevista de entrega, *When* aguarda 30s e recarrega, *Then* a data persiste.
- **AC3:** *Given* um pedido em aberto, *When* o gestor fatura (emite NF), *Then* o status muda automaticamente para `faturado` e persiste.
- **AC4:** *Given* `faturado` setado, *When* o webhook realtime chega com registro mais antigo, *Then* a edição local NÃO é sobrescrita.

### Escopo
- **IN:** timestamp síncrono, dirty-window para status/dataPrevista, normalizador, persistência do faturado.
- **OUT:** financeiro/caixa (16.1, 16.2).

### Arquivos
- `gdp-realtime.js` (`handleEntityChange`, L141-206)
- `gdp-core.js` (`savePedidos`, `_lastLocalSave`)
- `gdp-pedidos.js` (`salvarPedidoCompleto`, `normalizePedidoStatus`)
- `gdp-notas-fiscais.js` (`registrarNotaFiscalSaida`)

### Dependências
Nenhuma — pode ser desenvolvida em paralelo com 16.1/16.2.

---

## STORY 16.4 — Relatórios sobre Fonte Unificada (DRE / Fluxo / Categoria)

**Resolve:** propagação correta para relatórios
**Prioridade:** P2 (consequência de 16.1 + 16.2)
**Risco:** BAIXO
**Complexidade:** S (Small)

### Descrição
Após o vínculo transacional, validar que DRE, Fluxo de Caixa e Entradas/Saídas por Categoria leiam da fonte unificada e consistente.

### Requisitos Funcionais
- **FR-16.4.1:** DRE reflete lançamentos vinculados com `categoria_dre` correta.
- **FR-16.4.2:** Entradas e Saídas por Categoria agrega corretamente os lançamentos (incluindo os vindos de CR/CP).
- **FR-16.4.3:** Fluxo de Caixa reflete a posição real após baixas/estornos.

### Critérios de Aceitação
- **AC1:** *Given* baixas de CR/CP geraram lançamentos, *When* o gestor abre o DRE, *Then* os valores aparecem nas categorias corretas.
- **AC2:** *Given* um estorno, *When* o relatório é recalculado, *Then* o valor estornado deixa de aparecer.
- **AC3:** Soma do relatório de Categoria = soma dos lançamentos do caixa no período.

### Escopo
- **IN:** validação/ajuste de leitura dos relatórios.
- **OUT:** lógica de vínculo (16.1), persistência (16.2/16.3).

### Arquivos
- `gdp-pedidos.js` (`gerarDre`, `gerarCategorias`, relatório de fluxo)

### Dependências
**Bloqueada por 16.1 e 16.2** (precisa da fonte unificada pronta).

---

## Sequenciamento Recomendado

```
16.1 (P0, fundação) ──► 16.2 (P0, mesma área) ──► 16.4 (P2, depende de 16.1+16.2)
16.3 (P1, paralelo, independente) ───────────────────────────────────────┘
```

## Requisitos Não-Funcionais

- **NFR-1 (Segurança de dados):** snapshot/backup do Supabase **obrigatório** antes de qualquer deploy (@devops) — produção ativa.
- **NFR-2 (Não-regressão):** CR/CP e portal escolar, que hoje persistem corretamente, NÃO podem quebrar.
- **NFR-3 (Atomicidade):** operações de baixa+lançamento e estorno+remoção devem ser atômicas (sem estado intermediário inconsistente).

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Migração em produção ativa | Snapshot antes (NFR-1), deploy fora de horário de pico |
| Quebra de CR/CP existentes | Testes de não-regressão (NFR-2), revisão @qa |
| Estorno atômico falhar no meio | Garantir rollback / transação (NFR-3) |
| Regra de estorno nova confunde usuário | Validação UX por @po antes de implementar (16.1) |

## Fluxo de Trabalho

```
@pm cria épico (✓) → @sm draft das stories → @po valida (especial atenção 16.1) → @dev implementa → @qa gate → @devops deploya (com snapshot)
```

## Métricas de Sucesso

- 0 lançamentos somem do caixa sem estorno.
- 100% das baixas em CR/CP geram lançamento no caixa.
- 0 pendências fantasma após conciliação completa (caixa = banco).
- 0 reversões automáticas de status/dataPrevista de pedidos.
- 100% dos pedidos faturados com status `faturado` persistido.

---

*EPIC criado por Morgan (@pm) a partir do brief de Atlas (@analyst). Handoff: `.aiox/handoffs/handoff-analyst-to-pm-20260606.yaml`.*
