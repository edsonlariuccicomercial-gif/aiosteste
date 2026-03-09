# SESSION RESUME - LicitIA MG

## Pasta do projeto
C:\Users\Hearthz Gaming\aiosteste\codex

## Estado atual
- Dashboard funcional em `dashboard/` com KPIs, filtros e simulador.
- Coletor SGD implementado: `scripts/collect-sgd-orcamentos.js`.
- Servidor local dashboard: `scripts/serve-dashboard.js`.
- Integracao Olist implementada em modo mock com fila/idempotencia:
  - `scripts/sync-sgd-orders-olist.js`
  - `scripts/olist-adapter.js`
- Fluxo corrigido: pedido nasce no Pos-Licitacao do LicitIA e depois sincroniza para Olist.

## Arquivos-chave
- docs/strategy/PDR-PRD-LicitIA-MG.md
- docs/stories/1.2.story.md
- docs/stories/1.3.story.md
- dashboard/data/internal-orders.json
- dashboard/data/quotes.json
- dashboard/data/sync-status.json

## Comandos de operacao
- Atualizar cotacoes SGD:
  - $env:SGD_CNPJ='36802147000142'
  - $env:SGD_PASS='9046w48uE@10'
  - npm.cmd run dashboard:collect
- Sincronizar pedidos internos para Olist (mock/webhook):
  - npm.cmd run orders:sync:olist
- Abrir dashboard:
  - npm.cmd run dashboard:serve
  - URL: http://localhost:4173

## Proximo passo pendente
- Conectar adaptador Olist real (API/token oficial), removendo modo mock.
