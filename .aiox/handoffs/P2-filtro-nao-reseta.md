# P2 — Filtro não reseta ao sair da página/modal

**Severidade:** MEDIUM · **Tipo:** bug · **Risco do fix:** baixo
**Reportado por:** usuário (2026-06-22) · **Diagnóstico:** @analyst (Atlas)

## Comportamento esperado
Ao filtrar informações e **sair da página** (ou fechar o modal de detalhe), o sistema deve limpar o filtro e resetar a tela, garantindo que ela sempre carregue em estado "limpo"/padrão na próxima abertura — evitando que pesquisas anteriores travem/confundam.

## Comportamento atual
- Troca de aba principal e de sub-aba financeira **JÁ resetam** corretamente.
- Mas ao **fechar um modal de detalhe (CR/CP)** o filtro de status global e a busca ficam presos. Ao reabrir a lista, ela aparece filtrada com critério antigo (pode mostrar 0 itens → sensação de "travou").

## Causa raiz
`resetTabState()` é correto e é chamado em `switchTab` e `switchFinanceiroTab`. Porém:
- Os handlers de **fechar modal de detalhe** apenas escondem o modal e **não chamam `resetTabState()`**.
- As variáveis de filtro são **globais de módulo** → persistem até reset explícito.

## Evidências (file:line)
- `js/gdp-init.js:43-103` — `resetTabState` (limpa buscas, selects, status tabs, checkboxes) — funciona
- `js/gdp-init.js:117` — `switchTab` chama `resetTabState()` (OK)
- `js/gdp-init.js:195` — `switchFinanceiroTab` chama `resetTabState()` (OK)
- `js/gdp-init.js:514` — `fecharDetalheCr`: só esconde modal, **sem reset**
- `js/gdp-init.js:1105` — `fecharDetalheCp`: só esconde modal, **sem reset**
- `js/gdp-pedidos.js:3004-3048` — filtros globais: `pedidoStatusTabAtual`, `notaFiscalStatusTabAtual`, `contaPagarStatusTabAtual`, `contaReceberStatusTabAtual`

## Fix proposto
Chamar `resetTabState()` ao fechar os modais de detalhe CR/CP:

```js
function fecharDetalheCr() {
  document.getElementById("cr-detalhe-modal").classList.add("hidden");
  _crDetalheId = null; _crDetalheEditing = false;
  if (typeof resetTabState === "function") resetTabState();
  renderContasReceber(); // re-render limpo
}
```
(análogo para `fecharDetalheCp` + `renderContasPagar`).

## ⚠️ EXCEÇÃO INTENCIONAL — NÃO alterar
Os overlays de **criação** de produto/demanda (`novo-prod-overlay`, `edit-prod-overlay`,
`produto-detalhe-page`, `demanda-manual-overlay`) **propositalmente NÃO chamam** `resetTabState()`,
porque resetariam o filtro da **tela de fundo** (lista de estoque). Decisão registrada no
commit `374c92c`. **Manter como está.**

## Critérios de aceite
- [ ] Fechar modal de detalhe CR/CP volta a lista ao estado padrão (sem filtro/busca presa).
- [ ] Overlays de criação de produto/demanda continuam preservando o filtro de fundo.
- [ ] Reabrir qualquer lista sempre parte do estado limpo.

## Entrega
- Bump `?v=`, deploy `--force`, Ctrl+Shift+R.
