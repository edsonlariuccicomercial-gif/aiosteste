# P1 — Checkboxes não desmarcam após a ação

**Severidade:** MEDIUM · **Tipo:** bug · **Risco do fix:** baixo
**Reportado por:** usuário (2026-06-22) · **Diagnóstico:** @analyst (Atlas)

## Comportamento esperado
Um checkbox que dispara/seleciona uma ação deve **desmarcar automaticamente após a ação ser confirmada**, sinalizando que a tarefa foi concluída e o item saiu da fila.

## Comportamento atual
Após a ação (ex.: aplicar situação em massa, baixar conta, registrar recebimento, registrar entrega), a lista é re-renderizada mas o checkbox **continua marcado**.

## Causa raiz
O sistema usa modelo de estado *render-driven*: a marcação do checkbox é decidida em tempo de render consultando um `Set` de IDs selecionados. Os handlers de ação gravam os dados e chamam `render*()`, **mas nunca limpam o `Set`** — então o ID ainda presente faz o checkbox ser remarcado.

O único ponto que limpa os Sets é `resetTabState()`, que **só executa ao trocar de aba** (`switchTab` / `switchFinanceiroTab`), não após uma ação individual.

## Evidências (file:line)
- `js/gdp-pedidos.js:251` — render: `${_selectedPedidoIds.has(p.id) ? ' checked' : ''}`
- `js/gdp-pedidos.js:739` — `aplicarSituacaoBulk`: `savePedidos(); renderPedidos();` **sem `_selectedPedidoIds.clear()`**
- `js/gdp-init.js:851` — `registrarBaixaContaPagar`: idem (`_selectedContaPagarIds`)
- `js/gdp-init.js:293` — `registrarBaixaRecebimento`: idem (`_selectedContaReceberIds`)
- `js/gdp-pedidos.js:4073` — `confirmarEntrega`: idem
- `js/gdp-init.js:2581` — `excluirItensSelecionados`: idem (itens de contrato)
- `js/gdp-init.js:79` — `resetTabState`: limpa os Sets e os checkboxes (mas só em troca de aba)

## Fix proposto
Em cada handler de ação que consome a seleção, limpar a seleção **antes** do `render*()`:

```js
// padrão por item processado (preferível p/ ações em lote parciais)
_selectedPedidoIds.clear();        // ou .delete(id) dentro do loop
renderPedidos();
```

Aplicar em: `aplicarSituacaoBulk`, `registrarBaixaContaPagar`, `registrarBaixaRecebimento`,
`confirmarEntrega`, `excluirItensSelecionados` e quaisquer outros handlers que operam
sobre `.pedido-check / .nota-fiscal-check / .cp-check / .cr-check`.

Lembrar de também limpar o "select-all" e o estado `has-selection` do page-footer
(mesma lógica já presente em `resetTabState`).

## Critérios de aceite
- [ ] Após cada ação em lote/individual, os checkboxes envolvidos ficam desmarcados.
- [ ] O "select-all" e o footer de seleção voltam ao estado neutro.
- [ ] Nenhuma regressão na contagem de selecionados ao reabrir a lista.

## Entrega
- Bump `?v=` dos JS alterados nos HTMLs que os carregam.
- Deploy: `cd painel-caixa-escolar && npx vercel --prod --force --yes`.
- Orientar usuário a dar Ctrl+Shift+R.
