# Project Brief — Causa-Raiz da Não-Persistência/Dessincronização do Caixa

**Autor:** Atlas (@analyst)
**Data:** 2026-06-06
**Status:** Pronto para @pm (Fase 1 do EPIC-17)
**Squad:** caixa-escolar (GDP)
**Severidade:** ALTA — caixa diverge entre usuários; histórico de perda de dados

---

## 1. Resumo Executivo

O mistério "Angela e Edson têm os mesmos 186 lançamentos mas veem saldos diferentes" está **decifrado**. A divergência **não é perda de dados** — os 186 itens são idênticos nos dois navegadores. A causa são **duas configurações que vivem apenas no `localStorage` de cada navegador e nunca são sincronizadas**:

1. **Saldo inicial** (`nexedu.config.contas-bancarias`) → causa a diferença de **valor** do saldo.
2. **Lista de lançamentos deletados** (`gdp.conciliacao.deleted.v1`) → causa a diferença de **contagem** (147 vs 186).

Ambas são por-navegador. Combinadas com o histórico de não-persistência, explicam todos os sintomas relatados.

---

## 2. Evidência (matemática + código)

### Diferença de SALDO = diferença de saldo inicial

`getCaixaResumo` (gdp-pedidos.js L2023-2042) calcula:
```js
saldo = saldoInicial + entradas - saidas
```
- `entradas`/`saidas` vêm dos 186 itens (iguais nos dois) → **iguais**.
- `saldoInicial` vem de `localStorage['nexedu.config.contas-bancarias']` (L2038-2040) → **por-navegador, não sincronizado**.
- Logo, toda a diferença de saldo vem do saldo inicial: **R$ 10.949,40 − R$ 8.002,58 = R$ 2.946,82** = diferença dos saldos iniciais salvos em cada navegador.

### Diferença de CONTAGEM = tombstone por-navegador

`loadConciliacao` (gdp-core.js L2466-2481) filtra:
```js
var _delConc = new Set(JSON.parse(localStorage.getItem('gdp.conciliacao.deleted.v1') || '[]'));
items = items.filter(i => !(i.id && _delConc.has(i.id)));
```
- Esse tombstone é **por-navegador**. Angela tem ~39 IDs marcados como deletados → vê 186−39 = **147**. Edson tem a lista vazia → vê **186**.
- Confirma: ambos têm 186 no cache; o filtro local é que difere.

### Por que NÃO é filtro de período

`renderCaixa` (L2076-2078): o período default é `"todos"`, que **pula** o filtro de data. Não é a causa.

---

## 3. Causa-Raiz da NÃO-PERSISTÊNCIA (histórico)

O stakeholder relata que o caixa **nunca persistiu bem** e dados **somem sozinhos**. A arquitetura explica:

- **Estado crítico fica só no localStorage, sem fonte única no servidor:**
  - `saldo_inicial` (config de contas bancárias) — nunca sincronizado.
  - `gdp.conciliacao.deleted.v1` (tombstone) — nunca sincronizado, diverge por máquina.
- **Merge de boot frágil** (gdp-init.js `_mergeTable`): `[...mergedRemote, ...localOnly]` com `preferLocal < 5s`. Itens local-only antigos podem ressurgir; e a interação com o tombstone por-navegador causa resultados diferentes por máquina.
- **SAFETY que mascara perda** (gdp-api.js `list`): "nunca sobrescrever cache com vazio" — protege contra apagão, mas pode perpetuar um cache local divergente sem nunca convergir para o servidor.

Resultado: cada navegador evolui um estado ligeiramente diferente, e os "ajustes manuais" do stakeholder criaram camadas adicionais de inconsistência ao longo do tempo.

---

## 4. Escopo da Solução (Fase 1 — antes do reset)

### FR-A — Saldo inicial sincronizado (resolve diferença de valor)
- Migrar `saldo_inicial` (da conta padrão em `nexedu.config.contas-bancarias`) para registro sincronizado no Supabase, scoped por `empresa_id` (LARIUCCI).
- `getCaixaResumo` lê o saldo inicial da fonte sincronizada. Editar em um navegador reflete em todos.

### FR-B — Tombstone sincronizado OU eliminado (resolve diferença de contagem)
- Sincronizar `gdp.conciliacao.deleted.v1` no servidor OU migrar para soft-delete embutido (`deleted_at` na tabela `conciliacoes`).
- Garantir que a exclusão de um lançamento seja vista por todos.

### FR-C — Convergência de cache para a fonte única (resolve "dados somem/divergem")
- No boot, o caixa deve convergir para o estado do Supabase (já há backfill via `gdpApi.conciliacoes.list`), sem perpetuar local-only divergente indefinidamente.
- Revisar o merge `[...mergedRemote, ...localOnly]` para não ressuscitar itens nem manter divergência permanente.

---

## 5. Sequência (decisão do stakeholder)

```
FASE 1 — CÓDIGO (este brief): FR-A + FR-B + FR-C. Deploy. Validar persistência.
FASE 2 — RESET: marco zero 02/06/2026 = R$ 10.949,40 (zera conciliacoes+extratos, backup antes).
FASE 3 — RECONCILIAÇÃO: stakeholder importa extrato 02/06→hoje sobre base confiável.
```

**Saldo inicial REAL (referência):** abertura 19/05/2026 = R$ 8.822,88; em 02/06 = R$ 10.949,40 (marco zero escolhido para o reset).

---

## 6. Arquivos-Chave (mapa para @dev)

| Arquivo | Papel |
|---------|-------|
| `gdp-pedidos.js` | `getCaixaResumo` (L2023-2042, lê saldoInicial local), `renderCaixa` |
| `gdp-core.js` | `loadConciliacao`/`saveConciliacao` (tombstone L2466-2481) |
| `gdp-api.js` | camada Supabase; criar entidade/registro p/ saldo inicial e tombstone sincronizados |
| `gdp-init.js` | boot merge `_tableMap`/`_mergeTable` (~L2895-2930) |
| `app-config.js` | config de contas bancárias (`saldo_inicial`) |

---

## 7. Riscos e Restrições

- **NÃO tocar** CR/CP/pedidos.
- A correção (Fase 1) deve vir **antes** do reset (Fase 2), senão a reconciliação do stakeholder se perde.
- `empresa_id` já unificado (LARIUCCI) — não é a causa; não mexer nisso.
- Saldo inicial sincronizado pode precisar de tabela nova no Supabase → envolver @data-engineer.

---

## 8. Handoff

→ **@pm:** transformar em story(ies) da Fase 1 do EPIC-17 (FR-A, FR-B, FR-C). Sugiro 1 story de "persistência/sync de saldo inicial + tombstone + convergência de cache".
→ Fluxo: @pm cria story → @po valida → @dev (com @data-engineer p/ tabela) implementa → @devops deploy → ENTÃO Fase 2 (reset) e Fase 3 (reconciliação).

— Atlas, investigando a verdade 🔎
