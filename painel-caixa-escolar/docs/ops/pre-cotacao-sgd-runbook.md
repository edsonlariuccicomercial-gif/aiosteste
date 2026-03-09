# Runbook - Pre-cotacao para envio ao SGD

## Objetivo
Gerar pre-cotacao com base em dados reais (historico + custos + fatores regionais), aprovar no dashboard e exportar arquivo pronto para envio.

## Fluxo rapido
1. Atualizar dados:
   - `npm.cmd run dashboard:collect`
   - `npm.cmd run ops:daily`
2. Abrir dashboard:
   - `npm.cmd run dashboard:serve`
   - URL: `http://localhost:4173`
3. Em **Pedidos com pre-cotacao**:
   - clicar em `Sugerir precos` por pedido
   - revisar valores item a item
   - clicar `Aprovar pre-cotacao`
4. Exportar:
   - `Exportar aprovadas (JSON)` para integracao/automacao
   - `Exportar aprovadas (CSV)` para operacao/manual

## Payload 1:1 para automacao SGD
1. Gerar payload consolidado:
   - `npm.cmd run prequote:payload`
2. (Opcional) usar JSON exportado pelo dashboard:
   - `node scripts/build-sgd-prequote-payload.js --input "C:\caminho\licitia-pre-cotacao-aprovadas-AAAA-MM-DD.json"`

Saida padrao:
- `dashboard/data/sgd-prequote-payload.json`

## Automacao de preenchimento no SGD
- Dry-run seguro (preenche e nao confirma envio):
  - `npm.cmd run prequote:submit`
- Envio real:
  - `node scripts/submit-sgd-prequotes.js --submit`
- Enviar apenas um orcamento:
  - `node scripts/submit-sgd-prequotes.js --only-budget 2026000112 --submit`

Relatorio de execucao:
- `dashboard/data/sgd-prequote-submit-report.json`

Variaveis obrigatorias:
- `SGD_PASS`
- `SGD_DOC` ou `SGD_CNPJ`/`SGD_CPF`

## Como os precos sao sugeridos
- Piso de preco por SKU:
  - custo base (`sku-costs.json`)
  - fator regional por SRE
  - frete + despesas operacionais + impostos + margem alvo
- Referencia de mercado:
  - mediana historica por `SKU+SRE` (fallback para `SKU`)
- Regra final:
  - `preco_sugerido = max(piso_modelo, mediana_historica)`

## Artefatos
- Entrada principal:
  - `dashboard/data/quotes.json`
  - `dashboard/data/sku-costs.json`
  - `dashboard/data/object-sku-rules.json`
  - `dashboard/data/price-history-summary.json`
- Saida de operacao:
  - download local `licitia-pre-cotacao-aprovadas-AAAA-MM-DD.json`
  - download local `licitia-pre-cotacao-aprovadas-AAAA-MM-DD.csv`
