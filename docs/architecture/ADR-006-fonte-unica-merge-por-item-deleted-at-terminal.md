# ADR-006 — Fonte única por-item: merge por-id, `deleted_at` terminal e SKU não-inventado

- **Status:** Proposto (2026-07-01)
- **Autor:** Aria (@architect)
- **Origem:** `handoff-analyst-to-architect-CAUSA-RAIZ-ESTRUTURAL-20260701.yaml` (@analyst Atlas)
- **Decisões do stakeholder:** (1) escopo = *primitivo único + 3 sintomas*; (2) faseamento = *cliente agora, servidor depois*.
- **Substitui parcialmente:** os remendos reativos de ADR-003/004/005 (não os apaga; os torna desnecessários como rotina).

---

## 1. Contexto — uma doença, três sintomas (provados por teste)

O @analyst reproduziu **contra o código real** (vm sandbox, não réplica) três regressões que os usuários vivem, todas falhando hoje:

| Sintoma | Teste (falha hoje) |
|---|---|
| NF autorizada → pendente + boleto some | `tests/regressao-nf-autorizada-para-pendente.test.js` |
| Central de Produtos volta a `BANK-*` | `tests/regressao-central-produtos-sku-bank.test.js` |
| Exclusão de conta não propaga entre navegadores | `tests/regressao-exclusao-conta-receber-multi-navegador.test.js` |

**Causa raiz única:** a camada de persistência tem **múltiplas fontes de verdade que oscilam** (RAM ↔ blob localStorage ↔ Supabase ↔ eco realtime), e todo save de cache **reescreve a lista inteira da RAM** no disco. Cada correção anterior adicionou um *guard reativo* (autocura) que conserta **depois** do estrago — nunca fechou o caminho que **cria** o estrago.

### 1.1 Evidência estrutural confirmada pela @architect
- `saveNotasFiscais(changedId)` (gdp-core.js:2110-2114): `changedId` só filtra o push ao Supabase; **o cache local sempre grava o array inteiro** (`saveWrappedArray`).
- `savePedidos(changedId)` (gdp-core.js:1901-1926): **mesmo defeito** — `saveWrappedArray(ORDERS_KEY, pedidos)`. O "carimbão" que o comentário jura ter matado **continua vivo no cache local**. → confirma que é uma **classe** de bug, não instâncias isoladas.
- `reloadFromLocalSilent()` (gdp-core.js:1861-1879): sobrescreve a RAM inteira a partir do blob — reidrata qualquer item stale por cima de um bom.
- `handleEntityChange` UPDATE (gdp-realtime.js:350-371): guards tratam **prova** (boleto/chave) + timestamp `>` **estrito**; **nenhum trata `deleted_at`** como estado terminal → soft-delete com timestamp empatado é ignorado.
- `sanitizeBancoProduto` (gdp-banco-produtos.js:64-67): **inventa** `BANK-<idx>` persistível a partir de SKU ausente; `saveBancoProdutos` propaga para a tabela → repolui todas as máquinas.

---

## 2. Decisão

### Princípio arquitetural (invariantes — critério de aceite objetivo)
> **I1 — Escrita por-item:** um save originado de uma mudança de UM registro NUNCA reescreve outros registros no cache durável. O blob local é atualizado por **merge por-id**.
> **I2 — Não-rebaixamento:** um registro com **prova durável** (NF: chave+protocolo; conta: boleto real) NUNCA é rebaixado por reidratação/eco sem prova, **exceto** por um estado terminal explícito mais recente.
> **I3 — Exclusão é terminal:** `deleted_at` é um **estado terminal monotônico**. Uma vez marcado, só um `undelete` explícito o reverte — nunca um eco/empate de timestamp. Propaga determinísticamente entre navegadores.
> **I4 — SKU nunca inventado como fonte de vínculo:** `sanitize` NUNCA gera um SKU `BANK-*` persistível a partir de SKU ausente. SKU ausente é resolvido na **origem** (tabela) ou marcado como pendente, jamais materializado e propagado por cada máquina.

Estas quatro invariantes são exatamente o que os três testes verificam. **A cura está pronta quando os três testes passam** — e não pode ser declarada olhando a tela.

### 2.1 FASE 1 — Cliente (agora; alvo: 3 testes verdes)

**Novo primitivo compartilhado** (gdp-core.js):

```
// Lê o blob wrapped, substitui/insere APENAS o item por id, regrava. Nunca toca os demais.
function saveWrappedById(key, item, stripFn) { ... }
// Remoção terminal: marca deleted_at no blob por id (não filtra os demais).
function markDeletedById(key, id, whenIso) { ... }
```

Aplicação:
- `saveNotasFiscais(changedId)` → quando há `changedId`, usa `saveWrappedById(INVOICES_KEY, notaAlterada, _nfListaLeve)`. Sem `changedId` fora do boot mantém legado, mas passa a mergear (não clobber).
- `savePedidos(changedId)` e `saveContasReceber`/`saveContasPagar` → mesmo primitivo (fecha o carimbão local em todas as entidades — decisão "classe do bug").
- `reloadFromLocalSilent()` → em vez de sobrescrever a RAM cega, **merge por-id preservando terminal/prova** (I2/I3): um item da RAM com prova durável não é rebaixado por um blob stale; um item com `deleted_at` local não "revive".

**Realtime `deleted_at` terminal** (gdp-realtime.js):
- `_podeSobrescreverRegistro`/UPDATE: se o **entrante tem `deleted_at` e o local não**, aplica SEMPRE (exclusão vence prova e vence empate de timestamp). Se o **local tem `deleted_at` e o entrante não**, IGNORA (não revive). `deleted_at` é comparado como sinal terminal ANTES do timestamp.
- `writeLocalItems` já filtra soft-deleted (`stripSoftDeleted`) — manter, mas a decisão terminal acontece no merge, não só no strip.

**SKU não-inventado** (gdp-banco-produtos.js):
- `sanitizeBancoProduto`: SKU ausente → **não** gera `BANK-*` persistível. Opções para o @dev (I4): (a) manter `sku:""` e sinalizar `_skuPendente=true` (resolvido na origem/tabela), ou (b) usar o `id` interno como chave de exibição sem materializar SKU. **Nunca** propagar SKU gerado para `saveBancoProdutos`→tabela.
- Realtime de `produtos`: `writeLocalItems` não deve deixar um SKU vazio virar `BANK-*` na próxima carga (o sanitize deixa de inventar → fecha o loop).

### 2.2 FASE 2 — Servidor (logo após; via @data-engineer)
Especificação para o @data-engineer blindar o vetor multi-máquina (máquina desatualizada repoluindo):
- **Trigger `updated_at = now()` server-side** em todas as tabelas de entidade (âncora de relógio confiável para LWW — remove o empate de timestamp na origem).
- **Tombstone de exclusão** persistente: `deleted_at` como coluna canônica; RLS/trigger que **impede reviver** um registro já deletado (INSERT/UPDATE que reintroduz não-deletado é rejeitado ou re-marcado).
- **Guard anti-rebaixamento server-side:** trigger que rejeita UPDATE que remove prova (chave/protocolo, providerChargeId) de um registro que já a tinha — a mesma invariante I2, agora inegociável no banco.

> Detalhe de DDL/policy é responsabilidade do @data-engineer (Dara). Aqui fica só a intenção arquitetural.

---

## 3. Alternativas consideradas
- **Mais um guard reativo** (o caminho histórico): rejeitado — é o que falhou dezenas de vezes.
- **Reescrita completa da camada de sync (CRDT/LWW por-campo):** adiado para fase 2+ — maior risco; não é necessário para as invariantes I1-I4.
- **Só cliente, sem servidor:** rejeitado pelo stakeholder — deixaria o vetor multi-máquina aberto.

## 4. Consequências
- **Positivas:** elimina a classe do bug (não 3 instâncias); critério de aceite objetivo (3 testes); os guards/autocuras viram rede de segurança, não rotina.
- **Custos:** `reloadFromLocalSilent` fica levemente mais caro (merge por-id vs. atribuição). Aceitável — roda em debounce.
- **Risco:** a mudança em `reloadFromLocalSilent` e no merge do realtime é sensível; exige os testes verdes + regressão da suíte existente antes do deploy.

## 5. Definition of Done (para @dev → @qa → @devops)
1. Os **3 testes de regressão passam** sem alterar os testes (só o código-fonte).
2. A **suíte existente continua verde** (`vitest run`).
3. As 4 invariantes I1-I4 têm teste que as cobre (adicionar asserções de não-reviver e de pedidos/contas se necessário).
4. Deploy `--force` (Vercel) + validação multi-navegador na tela **como confirmação**, não como prova.
5. Fase 2 (servidor) abre como story separada para @data-engineer.
