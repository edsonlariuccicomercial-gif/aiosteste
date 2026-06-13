# PRD / Epic — Conta-Corrente do Cliente (Crédito/Débito Rotativo)

> **Tipo:** Product Requirements (PM / Morgan)
> **Status:** Pronto para criação de stories (@sm) — pendente apenas de validações técnicas (@architect/@data-engineer/fiscal)
> **Épico:** EPIC-20 (Ajustes Financeiro GDP) — agrupamento **20.9.x**
> **Data:** 2026-06-13
> **Baseado em:** `docs/stories/20.9-ANALISE-conta-corrente-cliente.md` (Atlas/Analyst)
> **Autor:** Morgan (PM)

---

## 1. Visão e valor de negócio

**Problema:** Escolas que operam em regime de crédito rotativo (pagam adiantado e vão retirando, ou recebem e pagam parcelado) não têm controle confiável no GDP. O controle paralelo em Excel diverge e o gestor "se perde".

**Resultado esperado:** Um único conceito de **conta-corrente por cliente** (extrato de crédito/débito com saldo recalculado), que dá visibilidade imediata do saldo de cada escola e gera demonstrativo de prestação de contas.

**Valor:** Elimina retrabalho/erro do controle manual; reduz risco de perda financeira por saldo divergente; profissionaliza a prestação de contas às escolas.

## 2. Decisões consolidadas (Analyst + PM)

### 2.1 Discovery (Atlas) — D1 a D11
Ver `20.9-ANALISE-conta-corrente-cliente.md` §3. Destaques inegociáveis:
- **D3:** saldo por VALOR (R$), nunca digitado.
- **D4/D11:** crédito NUNCA entra no automático cego — só por decisão manual no pedido, antes de faturar. *"Se for tudo no automático, vamos nos perder."*
- **D9:** botão no pedido com 2 formas (digitar valor OU marcar itens entregues).
- **D10:** NF emitida pelo valor TOTAL; retiradas não geram nova NF.

### 2.2 Decisões de produto (PM)
| # | Decisão | Racional |
|---|---------|----------|
| **P1** | Nota já paga (Caso A) → **NÃO gera Contas a Receber**. O extrato é controle de mercadoria a entregar. Caso B continua usando CR normalmente. | Evita contar o mesmo dinheiro duas vezes no caixa. |
| **P2** | Entregar Caso A **e** Caso B, mas como **stories separadas** no mesmo épico (A primeiro). | Entrega incremental; destrava a Valadares sem esperar o B. |
| **P3** | Saldo **sempre recalculado** dos lançamentos (fonte única da verdade). | Impossível divergir; com 1-5 escolas, performance é irrelevante. |

## 3. Decomposição em stories

### Story 20.9.1 — Fundação: extrato + saldo recalculado (Caso A)
**Escopo IN:**
- Migration: tabelas `lancamentos_cliente` e `lancamentos_itens`; flag `clientes.conta_corrente_ativa`.
- Saldo recalculado (Σ créditos − Σ débitos) — não usar `saldo_*` materializado (P3).
- Tela "Extrato do Cliente": lista de escolas conta-corrente com saldo (verde/vermelho); extrato estilo bancário; débitos expandem itens.
- Lançamento de **crédito manual avulso** e **retirada (débito)** com itens do catálogo ARP (campos editáveis + item avulso) — D5/D6.
- Soft-delete (padrão EPIC-19).

**Escopo OUT:** botão no pedido (vai pra 20.9.2); Caso B; impressão.

### Story 20.9.2 — Botão "Saldo para crédito" no pedido (Caso A)
**Escopo IN:**
- Botão/opção no pedido **antes de faturar** (D4/D9).
- Forma A (digitar valor) e Forma B (marcar itens entregues → resto vai pro crédito).
- Validação: não permitir crédito > total do pedido.
- Vínculo crédito ↔ contrato ↔ pedido ↔ NF (escolas têm vários contratos).
- NF emitida pelo total (D10); P1: não gera CR quando pago.

**Escopo OUT:** Caso B; impressão.

### Story 20.9.3 — Caso B: débito rotativo + pagamentos parciais
**Escopo IN:**
- Suporte a saldo negativo (cliente deve).
- Entrega gera débito; pagamentos parciais geram crédito que abate o saldo devido.
- Integração com Contas a Receber existente do Caso B (definir com @architect: coexistência sem duplicar caixa).

**Escopo OUT:** impressão.

### Story 20.9.4 — Demonstrativo imprimível / PDF (D7)
**Escopo IN:**
- Impressão / PDF do extrato do cliente (créditos, retiradas com itens, saldo) para prestação de contas.
- Reaproveitar padrão `imprimirRelatorioContasReceber()` (`gdp-init.js`).

## 4. Critérios de aceite (alto nível — @sm detalha por story)
- AC1: saldo exibido sempre = soma matemática dos lançamentos (testável com cenário Valadares).
- AC2: nenhum crédito é criado sem ação explícita do usuário no pedido.
- AC3: crédito enviado nunca excede o total do pedido.
- AC4: nota paga em conta-corrente não cria conta a receber duplicada.
- AC5: retirada registra itens (produto, qtd, valor unitário) e o total bate com o débito.
- AC6: demonstrativo imprimível reflete o extrato exibido na tela.

## 5. Validações técnicas pendentes (gates antes/durante dev)
| # | Pergunta | Responsável |
|---|----------|-------------|
| T1 | Schema final das tabelas + índices + RLS | @data-engineer |
| T2 | Forma B exige itens granulares na UI do pedido — viável? | @architect / @dev |
| T3 | Integração Caso B ↔ contas_receber sem duplicar caixa | @architect |
| T4 | ~~Implicação fiscal de D10~~ → **RISCO ACEITO pelo dono do negócio** (ver §5.1) | — |
| T5 | Fonte de preços por escola no catálogo ARP | @dev |

> ✅ **T4 DESBLOQUEADO.** Gate fiscal removido por decisão explícita do dono do negócio (2026-06-13). 20.9.2 está liberada para implementação. Ver waiver em §5.1.

### 5.1 Waiver — Risco fiscal D10 aceito
- **Decisão:** o dono do negócio (Edson) assume o risco fiscal de emitir NF pelo valor total com entrega parcial, sem nova NF nas retiradas subsequentes.
- **Contexto:** reflete a operação real já praticada hoje. Não é uma invenção do sistema — é a digitalização de um processo existente.
- **Risco aceito:** eventual divergência entre nota emitida e mercadoria em circulação numa fiscalização é responsabilidade assumida pelo negócio.
- **Data / autorizador:** 2026-06-13, Edson (dono do negócio), via @pm.
- **Efeito:** 20.9.2 deixa de ter gate bloqueante; segue direto para criação de story e desenvolvimento.

## 6. Riscos
- **R1 (~~alto~~ → ACEITO):** D10 risco fiscal → **waiver assinado pelo dono do negócio** (§5.1). Não bloqueia.
- **R2 (médio):** Caso B mexe em caixa/conciliação existentes → isolar em story própria (20.9.3), testar regressão.
- **R3 (baixo):** divergência de saldo → eliminada por P3 (recálculo).

## 7. Prioridade no EPIC-20
20.1–20.8 já em fluxo. Sugestão: **20.9.1 → 20.9.2 → 20.9.3 → 20.9.4** (gate fiscal removido por waiver §5.1). 20.9.1 entrega valor sozinha (extrato manual já ajuda o gestor hoje).

---
*PRD gerado por Morgan (PM) — planejando o futuro 📊*
